import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadArtCatalog } from "./human-release.js";
import { app, requestLogUrl } from "./main.js";

beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); });

function cookieOf(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const raw = response.headers["set-cookie"];
  const lines = Array.isArray(raw) ? raw : [String(raw ?? "")];
  return lines.map((line) => line.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function login(subject: string, name: string) {
  const response = await app.inject({ method: "POST", url: "/api/auth/test-login", payload: { subject, name } });
  expect(response.statusCode).toBe(200);
  return { cookie: cookieOf(response), csrf: response.json().csrfToken as string, account: response.json().account };
}

const fleet = (name: string) => ({
  name,
  units: [
    { slotId: `${name}-scout`, chassis: "scout", artAssetId: null },
    { slotId: `${name}-line`, chassis: "line", artAssetId: null },
    { slotId: `${name}-heavy`, chassis: "heavy", artAssetId: null }
  ],
  identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: "signal-teal", emblemId: "aperture" }
});

describe("human release accounts, hangars, and friend challenges", () => {
  it("redacts OAuth credentials and every other query string from request logs", () => {
    expect(requestLogUrl("/api/auth/discord/callback?code=one-time-code&state=secret-state"))
      .toBe("/api/auth/discord/callback?[redacted]");
    expect(requestLogUrl("/health/ready")).toBe("/health/ready");
  });

  it("fails closed when the production release catalog is absent", () => {
    expect(() => loadArtCatalog("definitely-missing-release-catalog", true)).toThrow("art_catalog_release_missing");
  });

  it("completes Discord PKCE identity login and rejects a scheme-relative return target", async () => {
    process.env.DISCORD_CLIENT_ID = "discord-client";
    process.env.DISCORD_CLIENT_SECRET = "discord-secret";
    process.env.DISCORD_REDIRECT_URI = "https://game.example/api/auth/discord/callback";
    try {
      const started = await app.inject({ method: "GET", url: "/api/auth/discord/start?returnTo=%2F%2Fevil.example%2Fsteal" });
      expect(started.statusCode).toBe(302);
      expect(started.headers.location).toContain("discord.com/oauth2/authorize");
      const raw = started.headers["set-cookie"];
      const lines = Array.isArray(raw) ? raw : [String(raw ?? "")];
      const stateLine = lines.find((line) => line.startsWith("cl_oauth_state="))!;
      const statePayload = decodeURIComponent(stateLine.split(";", 1)[0].split("=").slice(1).join("="));
      const state = statePayload.split(".", 1)[0];
      const providerFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "ephemeral-provider-token" }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "discord-oauth-user", username: "OAuth Pilot", avatar: null }) } as Response);
      vi.stubGlobal("fetch", providerFetch);
      const callback = await app.inject({ method: "GET", url: `/api/auth/discord/callback?code=one-time-code&state=${encodeURIComponent(state)}`, headers: { cookie: cookieOf(started) } });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe("/landscape/?view=hangar");
      expect(cookieOf(callback)).toContain("cl_session=");
      expect(providerFetch).toHaveBeenCalledTimes(2);
    } finally {
      delete process.env.DISCORD_CLIENT_ID; delete process.env.DISCORD_CLIENT_SECRET; delete process.env.DISCORD_REDIRECT_URI;
      vi.unstubAllGlobals();
    }
  });

  it("protects cloud mutations with authenticated CSRF-bound sessions", async () => {
    const alice = await login("discord-alice-csrf", "Alice");
    const rejected = await app.inject({ method: "POST", url: "/api/hangar/fleets", headers: { cookie: alice.cookie }, payload: fleet("No CSRF") });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toEqual({ error: "csrf_invalid" });

    const created = await app.inject({ method: "POST", url: "/api/hangar/fleets", headers: { cookie: alice.cookie, "x-csrf-token": alice.csrf }, payload: fleet("Signal One") });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: "ready", weight: 6, compositionModule: "heavy-line-scout" });

    const unitCatalog = (await app.inject({ method: "GET", url: "/api/art/catalog?kind=unit&limit=1" })).json();
    expect(unitCatalog.items).toHaveLength(1);
    const wrongKindBase = fleet("Wrong Kind");
    const wrongKind = { ...wrongKindBase, identity: { ...wrongKindBase.identity, commanderAssetId: String(unitCatalog.items[0].assetId) } };
    const rejectedArt = await app.inject({ method: "POST", url: "/api/hangar/fleets", headers: { cookie: alice.cookie, "x-csrf-token": alice.csrf }, payload: wrongKind });
    expect(rejectedArt.statusCode).toBe(400);
    expect(rejectedArt.json().error).toMatch(/^commander_art_unavailable:/);
  });

  it("hides both fleets until acceptance and resolves simultaneous phases only after both players lock orders", async () => {
    const alpha = await login("discord-alpha-friend", "Alpha");
    const bravo = await login("discord-bravo-friend", "Bravo");
    const createFleet = async (identity: typeof alpha, name: string) => (await app.inject({ method: "POST", url: "/api/hangar/fleets", headers: { cookie: identity.cookie, "x-csrf-token": identity.csrf }, payload: fleet(name) })).json();
    const alphaFleet = await createFleet(alpha, "Alpha Fleet");
    const bravoFleet = await createFleet(bravo, "Bravo Fleet");

    const challengeResponse = await app.inject({ method: "POST", url: "/api/battle-command/challenges", headers: { cookie: alpha.cookie, "x-csrf-token": alpha.csrf }, payload: { fleetId: alphaFleet.fleetId } });
    expect(challengeResponse.statusCode).toBe(201);
    const challenge = challengeResponse.json();

    const hidden = await app.inject({ method: "GET", url: `/api/battle-command/challenges/${challenge.challengeId}`, headers: { cookie: bravo.cookie } });
    expect(hidden.json()).toMatchObject({ status: "open", ownFleet: null, opponentFleet: null });

    const accepted = await app.inject({ method: "POST", url: `/api/battle-command/challenges/${challenge.challengeId}/accept`, headers: { cookie: bravo.cookie, "x-csrf-token": bravo.csrf }, payload: { fleetId: bravoFleet.fleetId } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "accepted", ownFleet: { name: "Bravo Fleet" }, opponentFleet: { name: "Alpha Fleet" } });
    const matchId = accepted.json().matchId as string;
    const savedOperations = await app.inject({ method: "GET", url: "/api/battle-command/challenges", headers: { cookie: alpha.cookie } });
    expect(savedOperations.json()).toEqual(expect.arrayContaining([expect.objectContaining({ challengeId: challenge.challengeId, matchId, ownFleet: expect.objectContaining({ name: "Alpha Fleet" }), opponentFleet: expect.objectContaining({ name: "Bravo Fleet" }) })]));

    const alphaView = (await app.inject({ method: "GET", url: `/api/battle-command/friend-matches/${matchId}`, headers: { cookie: alpha.cookie } })).json();
    const bravoView = (await app.inject({ method: "GET", url: `/api/battle-command/friend-matches/${matchId}`, headers: { cookie: bravo.cookie } })).json();
    expect(alphaView.experience.viewerSeat).toBe("alpha");
    expect(bravoView.experience.viewerSeat).toBe("bravo");

    const plans = (view: typeof alphaView, seat: string) => view.battle.projection.units.filter((unit: { ownerPlayerId: string }) => unit.ownerPlayerId === seat).map((unit: { unitId: string }) => ({ unitId: unit.unitId, actions: [] }));
    const alphaOrder = await app.inject({ method: "POST", url: `/api/battle-command/friend-matches/${matchId}/actions`, headers: { cookie: alpha.cookie, "x-csrf-token": alpha.csrf, "idempotency-key": "alpha-kinetic" }, payload: { revision: 0, submission: { phase: "kinetic", plans: plans(alphaView, "alpha") } } });
    expect(alphaOrder.statusCode).toBe(200);
    expect(alphaOrder.json()).toMatchObject({ battle: { revision: 0, projection: { phase: "kinetic" } }, experience: { submitted: true, waitingFor: "opponent" } });

    const waitingBravo = (await app.inject({ method: "GET", url: `/api/battle-command/friend-matches/${matchId}`, headers: { cookie: bravo.cookie } })).json();
    expect(waitingBravo.experience).toMatchObject({ submitted: false, waitingFor: "self" });
    const bravoOrder = await app.inject({ method: "POST", url: `/api/battle-command/friend-matches/${matchId}/actions`, headers: { cookie: bravo.cookie, "x-csrf-token": bravo.csrf, "idempotency-key": "bravo-kinetic" }, payload: { revision: 0, submission: { phase: "kinetic", plans: plans(bravoView, "bravo") } } });
    expect(bravoOrder.statusCode).toBe(200);
    expect(bravoOrder.json()).toMatchObject({ battle: { revision: 1, projection: { phase: "artillery" } }, experience: { submitted: false, waitingFor: null } });
  });
});
