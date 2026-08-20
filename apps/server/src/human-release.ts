import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import {
  ART_CENSUS_REPORT_HASH,
  AcceptFriendChallengeSchema,
  AccountViewSchema,
  ArtCatalogEntrySchema,
  ArtKindSchema,
  BattleExperienceSchema,
  CreateFriendChallengeSchema,
  FleetDraftInputSchema,
  FleetViewSchema,
  FriendBattleActionRequestSchema,
  FriendBattleCommandViewSchema,
  FriendChallengeViewSchema,
  ReadyFleetSnapshotSchema,
  compositionModuleForFleet,
  fleetDraftWeight,
  type AccountView,
  type ArtCatalogEntry,
  type BattleExperience,
  type FleetDraftInput,
  type FleetView,
  type FriendChallengeView,
  type ReadyFleetSnapshot
} from "@landscape/contracts";
import {
  BATTLE_AI_ID,
  BATTLE_PLAYER_ID,
  createFriendBattleCommandMatch,
  isRetiredBattleCommandMatch,
  projectBattleCommand,
  submitFriendBattleCommandIntent,
  submitFriendBattleCommandPair,
  type StoredBattleCommandMatch
} from "./battle-command-core.js";

const SESSION_COOKIE = "cl_session";
const OAUTH_STATE_COOKIE = "cl_oauth_state";
const OAUTH_VERIFIER_COOKIE = "cl_oauth_verifier";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CATALOG_FALLBACK_HASH = `sha256:${createHash("sha256").update("context-landscape-fallback-catalog-v1").digest("hex")}`;
const RELEASE_CATALOG_HASH = "sha256:1abbb788c4e55a1d2eac95a8ddbcb28834f52a1fc30d22ead64a2baad6d2c0ae";
const RELEASE_CATALOG_ITEMS = 3_501;

type InternalAccount = AccountView & { discordSubject: string };
type InternalSession = { hash: string; accountId: string; csrfToken: string; expiresAt: string };
type InternalChallenge = {
  challengeId: string;
  creatorAccountId: string;
  opponentAccountId: string | null;
  creatorFleet: ReadyFleetSnapshot;
  opponentFleet: ReadyFleetSnapshot | null;
  status: "open" | "accepted" | "expired" | "cancelled";
  createdAt: string;
  expiresAt: string;
  matchId: string | null;
};

function internalChallengeFromRow(row: Record<string, unknown>): InternalChallenge {
  return {
    challengeId: String(row.challenge_id), creatorAccountId: String(row.creator_account_id), opponentAccountId: row.opponent_account_id ? String(row.opponent_account_id) : null,
    creatorFleet: ReadyFleetSnapshotSchema.parse(row.creator_fleet), opponentFleet: row.opponent_fleet ? ReadyFleetSnapshotSchema.parse(row.opponent_fleet) : null,
    status: String(row.status) as InternalChallenge["status"], createdAt: new Date(String(row.created_at)).toISOString(), expiresAt: new Date(String(row.expires_at)).toISOString(), matchId: row.match_id ? String(row.match_id) : null
  };
}

export type HumanReleaseBattleStore = {
  load(matchId: string): Promise<StoredBattleCommandMatch | undefined>;
  save(matchId: string, match: StoredBattleCommandMatch, expectedRevision?: number): Promise<void>;
  withLock<T>(matchId: string, work: () => Promise<T>): Promise<T>;
  loadResponse(matchId: string, key: string): Promise<unknown | undefined>;
  saveResponse(matchId: string, key: string, response: unknown): Promise<void>;
};

const memoryAccounts = new Map<string, InternalAccount>();
const memoryDiscordAccounts = new Map<string, string>();
const memorySessions = new Map<string, InternalSession>();
const memoryFleets = new Map<string, FleetView>();
const memoryChallenges = new Map<string, InternalChallenge>();
const memoryPending = new Map<string, unknown>();
const streamSubscribers = new Map<string, Set<(revision: number) => void>>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): `sha256:${string}` {
  return `sha256:${sha256(JSON.stringify(value))}`;
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function cookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    try { return [name, decodeURIComponent(rest.join("="))]; }
    catch { return [name, ""]; }
  }));
}

function safeReturnTo(value: string | undefined): string {
  const fallback = "/landscape/?view=hangar";
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const parsed = new URL(value, "https://context-landscape.invalid");
    return parsed.origin === "https://context-landscape.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch { return fallback; }
}

function decodeReturnTo(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return ""; }
}

function secureCookie(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function setCookie(reply: FastifyReply, name: string, value: string, maxAgeSeconds: number): void {
  const next = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookie()}`;
  const current = reply.getHeader("set-cookie");
  reply.header("set-cookie", current ? [...(Array.isArray(current) ? current : [String(current)]), next] : next);
}

function clearCookie(reply: FastifyReply, name: string): void {
  setCookie(reply, name, "", 0);
}

function isoNow(): string {
  return new Date().toISOString();
}

function fallbackCatalog(): ArtCatalogEntry[] {
  const subjects: Array<[string, "unit" | "commander" | "battlefield" | "event", string, "portrait" | "landscape" | "square"]> = [
    ["mech-scout", "unit", "Scout reconnaissance frame", "portrait"],
    ["mech-line", "unit", "Line support frame", "portrait"],
    ["mech-siege", "unit", "Heavy command frame", "portrait"],
    ["commander-adaptive-siege-anchor", "commander", "Adaptive Siege Anchor", "portrait"],
    ["commander-scout-mobile-focus", "commander", "Scout-Mobile Pioneer Focus", "portrait"],
    ["battlefield-context-furnace", "battlefield", "The Context Furnace", "landscape"],
    ["battlefield-documentation-fortress", "battlefield", "The Documentation Fortress", "landscape"],
    ["ability-overclock", "event", "Overclock", "square"],
    ["ability-macro-flare", "event", "Macro Flare", "square"],
    ["artillery-desperation-he", "event", "Desperation HE", "landscape"]
  ];
  return subjects.map(([assetId, kind, title, aspect]) => ({
    schemaVersion: 1,
    assetId,
    familyId: `fallback:${assetId}`,
    contentHash: `sha256:${sha256(assetId)}`,
    tier: "confirmed",
    kind,
    title,
    alt: title,
    subjects: [assetId],
    aspect,
    focalPoint: { x: 50, y: 45 },
    thumbnailSrc: `/api/art/placeholders/${assetId}.svg`,
    cardSrc: `/api/art/placeholders/${assetId}.svg`,
    battlefieldSrc: kind === "battlefield" ? `/api/art/placeholders/${assetId}.svg` : null,
    experimental: false
  }));
}

export function loadArtCatalog(root: string, requireRelease = process.env.NODE_ENV === "production"): { hash: string; items: ArtCatalogEntry[] } {
  const path = join(root, "catalog.json");
  if (!existsSync(path)) {
    if (requireRelease) throw new Error("art_catalog_release_missing");
    return { hash: CATALOG_FALLBACK_HASH, items: fallbackCatalog() };
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as { catalogHash?: string; censusReportHash?: string; items?: unknown[] } | unknown[];
  if (requireRelease && Array.isArray(raw)) throw new Error("art_catalog_release_metadata_missing");
  if (!Array.isArray(raw) && raw.censusReportHash !== ART_CENSUS_REPORT_HASH) throw new Error("art_catalog_census_mismatch");
  const items = (Array.isArray(raw) ? raw : raw.items ?? []).map((item) => ArtCatalogEntrySchema.parse(item));
  const candidateHash = Array.isArray(raw) ? undefined : raw.catalogHash;
  const hash = candidateHash && /^sha256:[0-9a-f]{64}$/.test(candidateHash) ? candidateHash : digestJson(items);
  if (requireRelease && (hash !== RELEASE_CATALOG_HASH || items.length !== RELEASE_CATALOG_ITEMS)) throw new Error("art_catalog_release_mismatch");
  return { hash, items };
}

class HumanReleaseStore {
  constructor(private readonly pool?: Pool) {}

  async account(accountId: string): Promise<InternalAccount | undefined> {
    if (!this.pool) return memoryAccounts.get(accountId);
    const result = await this.pool.query("SELECT account_id, discord_subject, display_name, avatar_url, created_at, last_seen_at FROM player_accounts WHERE account_id=$1", [accountId]);
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return { schemaVersion: 1, accountId: row.account_id, discordSubject: row.discord_subject, displayName: row.display_name, avatarUrl: row.avatar_url, createdAt: new Date(row.created_at).toISOString(), lastSeenAt: new Date(row.last_seen_at).toISOString() };
  }

  async upsertDiscord(discordSubject: string, displayName: string, avatarUrl: string | null): Promise<InternalAccount> {
    const now = isoNow();
    if (!this.pool) {
      const existingId = memoryDiscordAccounts.get(discordSubject);
      const account: InternalAccount = existingId && memoryAccounts.has(existingId)
        ? { ...memoryAccounts.get(existingId)!, displayName, avatarUrl, lastSeenAt: now }
        : { schemaVersion: 1, accountId: `acct_${randomUUID()}`, discordSubject, displayName, avatarUrl, createdAt: now, lastSeenAt: now };
      memoryAccounts.set(account.accountId, account);
      memoryDiscordAccounts.set(discordSubject, account.accountId);
      return account;
    }
    const id = `acct_${randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO player_accounts(account_id,discord_subject,display_name,avatar_url,created_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$5)
       ON CONFLICT(discord_subject) DO UPDATE SET display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,last_seen_at=EXCLUDED.last_seen_at
       RETURNING account_id,discord_subject,display_name,avatar_url,created_at,last_seen_at`,
      [id, discordSubject, displayName, avatarUrl, now]
    );
    const row = result.rows[0];
    return { schemaVersion: 1, accountId: row.account_id, discordSubject: row.discord_subject, displayName: row.display_name, avatarUrl: row.avatar_url, createdAt: new Date(row.created_at).toISOString(), lastSeenAt: new Date(row.last_seen_at).toISOString() };
  }

  async createSession(accountId: string): Promise<{ raw: string; session: InternalSession }> {
    const raw = token();
    const session = { hash: sha256(raw), accountId, csrfToken: token(24), expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString() };
    if (!this.pool) memorySessions.set(session.hash, session);
    else await this.pool.query("INSERT INTO player_sessions(session_hash,account_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)", [session.hash, accountId, session.csrfToken, session.expiresAt]);
    return { raw, session };
  }

  async session(raw: string | undefined): Promise<{ session: InternalSession; account: InternalAccount } | undefined> {
    if (!raw) return undefined;
    const hash = sha256(raw);
    let session: InternalSession | undefined;
    if (!this.pool) session = memorySessions.get(hash);
    else {
      const result = await this.pool.query("SELECT session_hash,account_id,csrf_token,expires_at FROM player_sessions WHERE session_hash=$1 AND expires_at>now()", [hash]);
      if (result.rowCount) session = { hash: result.rows[0].session_hash, accountId: result.rows[0].account_id, csrfToken: result.rows[0].csrf_token, expiresAt: new Date(result.rows[0].expires_at).toISOString() };
    }
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return undefined;
    const account = await this.account(session.accountId);
    return account ? { session, account } : undefined;
  }

  async revoke(raw: string | undefined): Promise<void> {
    if (!raw) return;
    const hash = sha256(raw);
    if (!this.pool) memorySessions.delete(hash);
    else await this.pool.query("DELETE FROM player_sessions WHERE session_hash=$1", [hash]);
  }

  async deleteAccount(accountId: string): Promise<void> {
    if (!this.pool) {
      const account = memoryAccounts.get(accountId);
      if (account) memoryDiscordAccounts.delete(account.discordSubject);
      memoryAccounts.delete(accountId);
      for (const [key, value] of memorySessions) if (value.accountId === accountId) memorySessions.delete(key);
      for (const [key, value] of memoryFleets) if (value.ownerAccountId === accountId) memoryFleets.delete(key);
      for (const [key, value] of memoryChallenges) {
        if (value.creatorAccountId === accountId) memoryChallenges.delete(key);
        else if (value.opponentAccountId === accountId) memoryChallenges.set(key, { ...value, opponentAccountId: null });
      }
    } else await this.pool.query("DELETE FROM player_accounts WHERE account_id=$1", [accountId]);
  }

  async fleets(accountId: string): Promise<FleetView[]> {
    if (!this.pool) return [...memoryFleets.values()].filter((fleet) => fleet.ownerAccountId === accountId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const result = await this.pool.query("SELECT data FROM player_fleets WHERE owner_account_id=$1 ORDER BY updated_at DESC", [accountId]);
    return result.rows.map((row) => FleetViewSchema.parse(row.data));
  }

  async fleet(fleetId: string): Promise<FleetView | undefined> {
    if (!this.pool) return memoryFleets.get(fleetId);
    const result = await this.pool.query("SELECT data FROM player_fleets WHERE fleet_id=$1", [fleetId]);
    return result.rowCount ? FleetViewSchema.parse(result.rows[0].data) : undefined;
  }

  async saveFleet(accountId: string, input: FleetDraftInput, fleetId?: string): Promise<FleetView> {
    const previous = fleetId ? await this.fleet(fleetId) : undefined;
    if (fleetId && !previous) throw new Error("fleet_not_found");
    if (previous && previous.ownerAccountId !== accountId) throw new Error("fleet_forbidden");
    const now = isoNow();
    const chassis = input.units.map((unit) => unit.chassis);
    const module = compositionModuleForFleet(chassis);
    const fleet: FleetView = {
      schemaVersion: 1,
      fleetId: fleetId ?? `fleet_${randomUUID()}`,
      ownerAccountId: accountId,
      name: input.name,
      status: module ? "ready" : "draft",
      weight: fleetDraftWeight(input),
      compositionModule: module,
      units: input.units,
      identity: input.identity,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    FleetViewSchema.parse(fleet);
    if (!this.pool) memoryFleets.set(fleet.fleetId, fleet);
    else await this.pool.query(
      `INSERT INTO player_fleets(fleet_id,owner_account_id,data,created_at,updated_at) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(fleet_id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at`,
      [fleet.fleetId, accountId, fleet, fleet.createdAt, fleet.updatedAt]
    );
    return fleet;
  }

  async deleteFleet(accountId: string, fleetId: string): Promise<boolean> {
    const fleet = await this.fleet(fleetId);
    if (!fleet || fleet.ownerAccountId !== accountId) return false;
    if (!this.pool) return memoryFleets.delete(fleetId);
    const result = await this.pool.query("DELETE FROM player_fleets WHERE fleet_id=$1 AND owner_account_id=$2", [fleetId, accountId]);
    return Boolean(result.rowCount);
  }

  async saveChallenge(challenge: InternalChallenge): Promise<void> {
    if (!this.pool) memoryChallenges.set(challenge.challengeId, challenge);
    else await this.pool.query(
      `INSERT INTO battle_friend_challenges(challenge_id,creator_account_id,opponent_account_id,creator_fleet,opponent_fleet,status,created_at,expires_at,match_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(challenge_id) DO UPDATE SET opponent_account_id=EXCLUDED.opponent_account_id,opponent_fleet=EXCLUDED.opponent_fleet,status=EXCLUDED.status,match_id=EXCLUDED.match_id`,
      [challenge.challengeId, challenge.creatorAccountId, challenge.opponentAccountId, challenge.creatorFleet, challenge.opponentFleet, challenge.status, challenge.createdAt, challenge.expiresAt, challenge.matchId]
    );
  }

  async challenge(challengeId: string): Promise<InternalChallenge | undefined> {
    if (!this.pool) return memoryChallenges.get(challengeId);
    const result = await this.pool.query("SELECT * FROM battle_friend_challenges WHERE challenge_id=$1", [challengeId]);
    if (!result.rowCount) return undefined;
    return internalChallengeFromRow(result.rows[0]);
  }

  async challenges(accountId: string): Promise<InternalChallenge[]> {
    if (!this.pool) return [...memoryChallenges.values()].filter((challenge) => challenge.creatorAccountId === accountId || challenge.opponentAccountId === accountId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const result = await this.pool.query("SELECT * FROM battle_friend_challenges WHERE creator_account_id=$1 OR opponent_account_id=$1 ORDER BY created_at DESC", [accountId]);
    return result.rows.map((row) => internalChallengeFromRow(row));
  }

  async pending(matchId: string, round: number, phase: string, seat: string): Promise<unknown | undefined> {
    const key = `${matchId}:${round}:${phase}:${seat}`;
    if (!this.pool) return memoryPending.get(key);
    const result = await this.pool.query("SELECT submission FROM battle_pending_submissions WHERE match_id=$1 AND round=$2 AND phase=$3 AND player_id=$4", [matchId, round, phase, seat]);
    return result.rowCount ? result.rows[0].submission : undefined;
  }

  async savePending(matchId: string, round: number, phase: string, seat: string, submission: unknown): Promise<void> {
    const key = `${matchId}:${round}:${phase}:${seat}`;
    if (!this.pool) memoryPending.set(key, submission);
    else await this.pool.query("INSERT INTO battle_pending_submissions(match_id,round,phase,player_id,submission) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [matchId, round, phase, seat, submission]);
  }

  async clearPending(matchId: string, round: number, phase: string): Promise<void> {
    const prefix = `${matchId}:${round}:${phase}:`;
    if (!this.pool) {
      for (const key of memoryPending.keys()) if (key.startsWith(prefix)) memoryPending.delete(key);
      return;
    }
    await this.pool.query("DELETE FROM battle_pending_submissions WHERE match_id=$1 AND round=$2 AND phase=$3", [matchId, round, phase]);
  }
}

function publicAccount(account: InternalAccount): AccountView {
  const { discordSubject: _private, ...view } = account;
  return AccountViewSchema.parse(view);
}

function snapshotFleet(fleet: FleetView): ReadyFleetSnapshot {
  if (fleet.status !== "ready" || !fleet.compositionModule) throw new Error("fleet_not_ready");
  const base = { ...fleet, status: "ready" as const, weight: 6 as const, compositionModule: fleet.compositionModule };
  return ReadyFleetSnapshotSchema.parse({ ...base, snapshotHash: digestJson(base) });
}

function experienceOf(stored: StoredBattleCommandMatch, viewerAccountId: string, submitted: boolean, opponentSubmitted: boolean): BattleExperience {
  const saved = stored.metadata?.experience as Omit<BattleExperience, "viewerSeat" | "waitingFor" | "submitted"> | undefined;
  if (!saved || saved.mode !== "friend") throw new Error("friend_match_not_found");
  const viewerSeat = saved.accountSeats.alpha === viewerAccountId ? BATTLE_PLAYER_ID : saved.accountSeats.bravo === viewerAccountId ? BATTLE_AI_ID : null;
  if (!viewerSeat) throw new Error("friend_match_forbidden");
  return BattleExperienceSchema.parse({
    ...saved,
    viewerSeat,
    submitted,
    waitingFor: stored.state.schemaVersion === 3 && stored.state.phase !== "command" && stored.state.phase !== "terminal"
      ? submitted && !opponentSubmitted ? "opponent" : !submitted && opponentSubmitted ? "self" : null
      : null
  });
}

async function challengeView(store: HumanReleaseStore, challenge: InternalChallenge, viewerId: string): Promise<FriendChallengeView> {
  const creator = await store.account(challenge.creatorAccountId);
  const opponent = challenge.opponentAccountId ? await store.account(challenge.opponentAccountId) : undefined;
  if (!creator) throw new Error("challenge_account_missing");
  const accepted = challenge.status === "accepted";
  return FriendChallengeViewSchema.parse({
    schemaVersion: 1,
    challengeId: challenge.challengeId,
    creator: publicAccount(creator),
    opponent: opponent ? publicAccount(opponent) : null,
    status: challenge.status,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    matchId: accepted ? challenge.matchId : null,
    joinPath: `/landscape/?challenge=${challenge.challengeId}`,
    ownFleet: accepted ? (viewerId === challenge.creatorAccountId ? challenge.creatorFleet : challenge.opponentFleet) : null,
    opponentFleet: accepted ? (viewerId === challenge.creatorAccountId ? challenge.opponentFleet : challenge.creatorFleet) : null
  });
}

function notify(matchId: string, revision: number): void {
  for (const subscriber of streamSubscribers.get(matchId) ?? []) subscriber(revision);
}

export async function registerHumanReleaseRoutes(app: FastifyInstance, options: { pool?: Pool; artRoot: string; battle: HumanReleaseBattleStore }): Promise<void> {
  const store = new HumanReleaseStore(options.pool);
  const catalog = loadArtCatalog(options.artRoot);
  const byAsset = new Map(catalog.items.map((item) => [item.assetId, item]));

  const validateFleetArt = (input: FleetDraftInput): string | null => {
    for (const unit of input.units) {
      if (unit.artAssetId && byAsset.get(unit.artAssetId)?.kind !== "unit") return `unit_art_unavailable:${unit.artAssetId}`;
    }
    if (input.identity.commanderAssetId && byAsset.get(input.identity.commanderAssetId)?.kind !== "commander") return `commander_art_unavailable:${input.identity.commanderAssetId}`;
    if (input.identity.battlefieldAssetId && byAsset.get(input.identity.battlefieldAssetId)?.kind !== "battlefield") return `battlefield_art_unavailable:${input.identity.battlefieldAssetId}`;
    return null;
  };

  const auth = async (request: FastifyRequest, reply: FastifyReply, csrf = false) => {
    const found = await store.session(cookies(request)[SESSION_COOKIE]);
    if (!found) { reply.code(401).send({ error: "authentication_required" }); return undefined; }
    if (csrf && request.headers["x-csrf-token"] !== found.session.csrfToken) { reply.code(403).send({ error: "csrf_invalid" }); return undefined; }
    return found;
  };

  app.get("/api/auth/session", async (request) => {
    const found = await store.session(cookies(request)[SESSION_COOKIE]);
    return { schemaVersion: 1, authenticated: Boolean(found), account: found ? publicAccount(found.account) : null, csrfToken: found?.session.csrfToken ?? null };
  });

  app.get<{ Querystring: { returnTo?: string } }>("/api/auth/discord/start", async (request, reply) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !redirectUri) return reply.code(503).send({ error: "discord_auth_not_configured" });
    const state = token(24);
    const verifier = token(48);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    setCookie(reply, OAUTH_STATE_COOKIE, `${state}.${encodeURIComponent(safeReturnTo(request.query.returnTo))}`, 600);
    setCookie(reply, OAUTH_VERIFIER_COOKIE, verifier, 600);
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId, scope: "identify", redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
    return reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string } }>("/api/auth/discord/callback", async (request, reply) => {
    const saved = cookies(request)[OAUTH_STATE_COOKIE]?.split(".");
    const verifier = cookies(request)[OAUTH_VERIFIER_COOKIE];
    if (!saved || saved[0] !== request.query.state || !request.query.code || !verifier) return reply.code(400).send({ error: "oauth_state_invalid" });
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return reply.code(503).send({ error: "discord_auth_not_configured" });
    const exchanged = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: request.query.code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: verifier }) });
    if (!exchanged.ok) return reply.code(401).send({ error: "discord_exchange_failed" });
    const tokens = await exchanged.json() as { access_token: string };
    const identityResponse = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!identityResponse.ok) return reply.code(401).send({ error: "discord_identity_failed" });
    const identity = await identityResponse.json() as { id: string; global_name?: string | null; username: string; avatar?: string | null };
    const avatarUrl = identity.avatar ? `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.png?size=128` : null;
    const account = await store.upsertDiscord(identity.id, identity.global_name || identity.username, avatarUrl);
    const session = await store.createSession(account.accountId);
    setCookie(reply, SESSION_COOKIE, session.raw, Math.floor(SESSION_LIFETIME_MS / 1000));
    clearCookie(reply, OAUTH_STATE_COOKIE); clearCookie(reply, OAUTH_VERIFIER_COOKIE);
    return reply.redirect(safeReturnTo(decodeReturnTo(saved.slice(1).join("."))));
  });

  if (process.env.NODE_ENV === "test") app.post<{ Body: { subject?: string; name?: string } }>("/api/auth/test-login", async (request, reply) => {
    const account = await store.upsertDiscord(request.body?.subject ?? randomUUID(), request.body?.name ?? "Test Commander", null);
    const session = await store.createSession(account.accountId);
    setCookie(reply, SESSION_COOKIE, session.raw, Math.floor(SESSION_LIFETIME_MS / 1000));
    return { account: publicAccount(account), csrfToken: session.session.csrfToken };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    await store.revoke(cookies(request)[SESSION_COOKIE]); clearCookie(reply, SESSION_COOKIE); return { ok: true };
  });
  app.delete("/api/account", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    await store.deleteAccount(found.account.accountId); clearCookie(reply, SESSION_COOKIE); return reply.code(204).send();
  });

  app.get<{ Querystring: { kind?: string; q?: string; offset?: string; limit?: string } }>("/api/art/catalog", async (request, reply) => {
    const kind = request.query.kind ? ArtKindSchema.safeParse(request.query.kind) : null;
    if (kind && !kind.success) return reply.code(400).send({ error: "invalid_art_kind" });
    const q = request.query.q?.trim().toLowerCase() ?? "";
    const offset = Math.max(0, Number.parseInt(request.query.offset ?? "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit ?? "40", 10) || 40));
    const filtered = catalog.items.filter((item) => (!kind || item.kind === kind.data) && (!q || `${item.assetId} ${item.title} ${item.subjects.join(" ")}`.toLowerCase().includes(q)));
    return { schemaVersion: 1, catalogHash: catalog.hash, censusReportHash: ART_CENSUS_REPORT_HASH, items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit, nextOffset: offset + limit < filtered.length ? offset + limit : null };
  });

  app.get<{ Params: { id: string } }>("/api/art/catalog/:id", async (request, reply) => {
    const item = byAsset.get(request.params.id);
    return item ?? reply.code(404).send({ error: "art_not_found" });
  });

  app.get<{ Params: { id: string } }>("/api/art/placeholders/:id.svg", async (request, reply) => {
    const label = request.params.id.replace(/[^a-z0-9-]/gi, " ").slice(0, 42);
    const hue = Number.parseInt(sha256(request.params.id).slice(0, 4), 16) % 360;
    return reply.type("image/svg+xml").header("cache-control", "public,max-age=86400").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 42% 18%)"/><stop offset="1" stop-color="hsl(${(hue + 45) % 360} 58% 7%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><path d="M80 470L210 170l120 170 90-230 140 250 80-130 90 240z" fill="none" stroke="hsl(${hue} 65% 66%)" stroke-width="18" opacity=".7"/><text x="400" y="535" text-anchor="middle" fill="white" font-family="system-ui" font-size="30">${label}</text></svg>`);
  });

  app.get("/api/hangar/fleets", async (request, reply) => { const found = await auth(request, reply); return found ? store.fleets(found.account.accountId) : undefined; });
  app.post<{ Body: unknown }>("/api/hangar/fleets", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    const parsed = FleetDraftInputSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "invalid_fleet", details: parsed.error.flatten() });
    const artError = validateFleetArt(parsed.data); if (artError) return reply.code(400).send({ error: artError });
    try { return reply.code(201).send(await store.saveFleet(found.account.accountId, parsed.data)); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); }
  });
  app.patch<{ Params: { id: string }; Body: unknown }>("/api/hangar/fleets/:id", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    const parsed = FleetDraftInputSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "invalid_fleet", details: parsed.error.flatten() });
    const artError = validateFleetArt(parsed.data); if (artError) return reply.code(400).send({ error: artError });
    try { return await store.saveFleet(found.account.accountId, parsed.data, request.params.id); } catch (error) { const message = error instanceof Error ? error.message : String(error); return reply.code(message === "fleet_not_found" ? 404 : 403).send({ error: message }); }
  });
  app.delete<{ Params: { id: string } }>("/api/hangar/fleets/:id", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    return await store.deleteFleet(found.account.accountId, request.params.id) ? reply.code(204).send() : reply.code(404).send({ error: "fleet_not_found" });
  });

  app.get("/api/battle-command/challenges", async (request, reply) => {
    const found = await auth(request, reply); if (!found) return;
    const challenges = await store.challenges(found.account.accountId);
    for (const challenge of challenges) if (challenge.status === "open" && Date.parse(challenge.expiresAt) <= Date.now()) { challenge.status = "expired"; await store.saveChallenge(challenge); }
    return Promise.all(challenges.map((challenge) => challengeView(store, challenge, found.account.accountId)));
  });

  app.post<{ Body: unknown }>("/api/battle-command/challenges", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    const parsed = CreateFriendChallengeSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "invalid_challenge" });
    const fleet = await store.fleet(parsed.data.fleetId);
    if (!fleet || fleet.ownerAccountId !== found.account.accountId) return reply.code(404).send({ error: "fleet_not_found" });
    if (fleet.status !== "ready") return reply.code(409).send({ error: "fleet_not_ready" });
    const now = new Date();
    const challenge: InternalChallenge = { challengeId: `duel_${randomUUID()}`, creatorAccountId: found.account.accountId, opponentAccountId: null, creatorFleet: snapshotFleet(fleet), opponentFleet: null, status: "open", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS).toISOString(), matchId: null };
    await store.saveChallenge(challenge);
    return reply.code(201).send(await challengeView(store, challenge, found.account.accountId));
  });

  app.get<{ Params: { id: string } }>("/api/battle-command/challenges/:id", async (request, reply) => {
    const found = await auth(request, reply); if (!found) return;
    const challenge = await store.challenge(request.params.id); if (!challenge) return reply.code(404).send({ error: "challenge_not_found" });
    if (challenge.status === "open" && Date.parse(challenge.expiresAt) <= Date.now()) { challenge.status = "expired"; await store.saveChallenge(challenge); }
    if (challenge.status === "accepted" && ![challenge.creatorAccountId, challenge.opponentAccountId].includes(found.account.accountId)) return reply.code(403).send({ error: "challenge_forbidden" });
    return challengeView(store, challenge, found.account.accountId);
  });

  app.post<{ Params: { id: string }; Body: unknown }>("/api/battle-command/challenges/:id/accept", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    const parsed = AcceptFriendChallengeSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "invalid_challenge_acceptance" });
    return options.battle.withLock(`challenge:${request.params.id}`, async () => {
      const challenge = await store.challenge(request.params.id); if (!challenge) return reply.code(404).send({ error: "challenge_not_found" });
      if (challenge.creatorAccountId === found.account.accountId) return reply.code(409).send({ error: "challenge_self_accept" });
      if (challenge.status !== "open" || Date.parse(challenge.expiresAt) <= Date.now()) return reply.code(409).send({ error: "challenge_not_open" });
      const fleet = await store.fleet(parsed.data.fleetId);
      if (!fleet || fleet.ownerAccountId !== found.account.accountId) return reply.code(404).send({ error: "fleet_not_found" });
      if (fleet.status !== "ready") return reply.code(409).send({ error: "fleet_not_ready" });
      const opponentFleet = snapshotFleet(fleet);
      const matchId = `battle_${randomUUID()}`;
      const seed = Number.parseInt(sha256(matchId).slice(0, 8), 16);
      const experience = {
        schemaVersion: 1,
        mode: "friend",
        status: "active",
        concededBy: null,
        winnerSeat: null,
        fleets: { alpha: challenge.creatorFleet, bravo: opponentFleet },
        accountSeats: { alpha: challenge.creatorAccountId, bravo: found.account.accountId }
      };
      const created = createFriendBattleCommandMatch(matchId, seed, { alphaCompositionModule: challenge.creatorFleet.compositionModule, bravoCompositionModule: opponentFleet.compositionModule, experience });
      await options.battle.save(matchId, created.stored);
      Object.assign(challenge, { opponentAccountId: found.account.accountId, opponentFleet, status: "accepted", matchId });
      await store.saveChallenge(challenge);
      notify(matchId, 0);
      return challengeView(store, challenge, found.account.accountId);
    });
  });

  app.get<{ Params: { id: string } }>("/api/battle-command/friend-matches/:id", async (request, reply) => {
    const found = await auth(request, reply); if (!found) return;
    const stored = await options.battle.load(request.params.id); if (!stored) return reply.code(404).send({ error: "battle_not_found" });
    if (isRetiredBattleCommandMatch(stored)) return reply.code(410).send({ error: "battle_ruleset_retired" });
    try {
      const base = stored.metadata?.experience as { accountSeats?: { alpha?: string; bravo?: string } } | undefined;
      const seat = base?.accountSeats?.alpha === found.account.accountId ? BATTLE_PLAYER_ID : base?.accountSeats?.bravo === found.account.accountId ? BATTLE_AI_ID : null;
      if (!seat) return reply.code(403).send({ error: "friend_match_forbidden" });
      const state = stored.state.schemaVersion === 3 ? stored.state : null;
      const phase = state?.phase ?? "terminal"; const round = state?.round ?? 0;
      const own = await store.pending(request.params.id, round, phase, seat); const other = await store.pending(request.params.id, round, phase, seat === BATTLE_PLAYER_ID ? BATTLE_AI_ID : BATTLE_PLAYER_ID);
      return FriendBattleCommandViewSchema.parse({ battle: projectBattleCommand(stored, stored.events, seat), experience: experienceOf(stored, found.account.accountId, Boolean(own), Boolean(other)) });
    } catch (error) { return reply.code(403).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.post<{ Params: { id: string }; Body: unknown }>("/api/battle-command/friend-matches/:id/actions", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    const parsed = FriendBattleActionRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "invalid_battle_action", details: parsed.error.flatten() });
    const idempotency = typeof request.headers["idempotency-key"] === "string" ? `${found.account.accountId}:${request.headers["idempotency-key"]}` : null;
    if (idempotency) { const existing = await options.battle.loadResponse(request.params.id, idempotency); if (existing) return existing; }
    return options.battle.withLock(request.params.id, async () => {
      const stored = await options.battle.load(request.params.id); if (!stored) return reply.code(404).send({ error: "battle_not_found" });
      if (stored.revision !== parsed.data.revision) return reply.code(409).send({ error: "battle_revision_conflict", currentRevision: stored.revision });
      const saved = stored.metadata?.experience as { status?: string; accountSeats?: { alpha?: string; bravo?: string } } | undefined;
      if (saved?.status !== "active") return reply.code(409).send({ error: "battle_complete" });
      const seat = saved.accountSeats?.alpha === found.account.accountId ? BATTLE_PLAYER_ID : saved.accountSeats?.bravo === found.account.accountId ? BATTLE_AI_ID : null;
      if (!seat) return reply.code(403).send({ error: "friend_match_forbidden" });
      try {
        let next = stored;
        if (parsed.data.submission.phase === "command") {
          next = submitFriendBattleCommandIntent(stored, seat, parsed.data.submission);
          await options.battle.save(request.params.id, next, stored.revision);
        } else {
          const phase = parsed.data.submission.phase; const round = stored.state.schemaVersion === 3 ? stored.state.round : 0;
          const prior = await store.pending(request.params.id, round, phase, seat);
          if (prior && JSON.stringify(prior) !== JSON.stringify(parsed.data.submission)) return reply.code(409).send({ error: "phase_submission_locked" });
          if (!prior) await store.savePending(request.params.id, round, phase, seat, parsed.data.submission);
          const otherSeat = seat === BATTLE_PLAYER_ID ? BATTLE_AI_ID : BATTLE_PLAYER_ID;
          const other = await store.pending(request.params.id, round, phase, otherSeat);
          if (other) {
            next = submitFriendBattleCommandPair(stored, seat === BATTLE_PLAYER_ID ? parsed.data.submission : other as never, seat === BATTLE_AI_ID ? parsed.data.submission : other as never);
            await options.battle.save(request.params.id, next, stored.revision);
            await store.clearPending(request.params.id, round, phase);
          }
        }
        const ownPending = next === stored && parsed.data.submission.phase !== "command";
        const result = FriendBattleCommandViewSchema.parse({ battle: projectBattleCommand(next, next === stored ? [] : next.events.slice(stored.events.length), seat), experience: experienceOf(next, found.account.accountId, ownPending, false) });
        if (idempotency) await options.battle.saveResponse(request.params.id, idempotency, result);
        if (next !== stored) notify(request.params.id, next.revision);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(message.includes("forbidden") ? 403 : message.includes("complete") || message.includes("phase_mismatch") ? 409 : 400).send({ error: message });
      }
    });
  });

  app.post<{ Params: { id: string } }>("/api/battle-command/friend-matches/:id/concede", async (request, reply) => {
    const found = await auth(request, reply, true); if (!found) return;
    return options.battle.withLock(request.params.id, async () => {
      const stored = await options.battle.load(request.params.id); if (!stored) return reply.code(404).send({ error: "battle_not_found" });
      const experience = stored.metadata?.experience as Record<string, unknown> & { accountSeats?: { alpha?: string; bravo?: string }; status?: string };
      const seat = experience.accountSeats?.alpha === found.account.accountId ? BATTLE_PLAYER_ID : experience.accountSeats?.bravo === found.account.accountId ? BATTLE_AI_ID : null;
      if (!seat) return reply.code(403).send({ error: "friend_match_forbidden" });
      if (experience.status !== "active") return reply.code(409).send({ error: "battle_complete" });
      const next = { ...stored, revision: stored.revision + 1, metadata: { ...stored.metadata!, experience: { ...experience, status: "conceded", concededBy: seat, winnerSeat: seat === BATTLE_PLAYER_ID ? BATTLE_AI_ID : BATTLE_PLAYER_ID } } };
      await options.battle.save(request.params.id, next, stored.revision); notify(request.params.id, next.revision);
      return { ok: true, revision: next.revision };
    });
  });

  app.get<{ Params: { id: string } }>("/api/battle-command/matches/:id/stream", async (request, reply) => {
    const found = await auth(request, reply); if (!found) return;
    const stored = await options.battle.load(request.params.id); if (!stored) return reply.code(404).send({ error: "battle_not_found" });
    const experience = stored.metadata?.experience as { accountSeats?: { alpha?: string; bravo?: string } } | undefined;
    if (![experience?.accountSeats?.alpha, experience?.accountSeats?.bravo].includes(found.account.accountId)) return reply.code(403).send({ error: "friend_match_forbidden" });
    reply.hijack();
    reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache,no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    const send = (revision: number) => reply.raw.write(`event: revision\ndata: ${JSON.stringify({ revision })}\n\n`);
    send(stored.revision);
    const subscribers = streamSubscribers.get(request.params.id) ?? new Set(); subscribers.add(send); streamSubscribers.set(request.params.id, subscribers);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 25_000);
    request.raw.on("close", () => { clearInterval(heartbeat); subscribers.delete(send); if (!subscribers.size) streamSubscribers.delete(request.params.id); });
  });
}
