import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type {
  Challenge,
  EventEnvelope,
  GameplayLabSession,
  GameplayLabTrial,
  PlaytestObservation
} from "@landscape/contracts";
import {
  BattleCommandV3ActionRequestSchema,
  BattleCommandV3CreateRequestSchema,
  BattleCommandV3ViewSchema,
  ChallengeSchema,
  GameplayLabBookmarkSchema,
  GameplayLabReviewRequestSchema,
  GameplayLabSessionSchema,
  OrderSchema,
  PlaytestObservationSchema
} from "@landscape/contracts";
import { ENGINE_VERSION, buildReconstruction, buildReplayManifest, createMatchState, projectForPlayer, resolveSlot } from "@landscape/engine";
import { gameplayLabById, gameplayLabs, scenarioById, scenarios, twoBakedSlices } from "@landscape/scenarios";
import {
  bookmarkGameplayLabDecision,
  completeGameplayLabTrial,
  createGameplayLabSession,
  gameplayLabSessionView,
  gameplayLabSummary,
  submitGameplayLabReview
} from "./gameplay-lab-core.js";
import { preflightGameplayLabs } from "./gameplay-lab-preflight.js";
import { registerLandscapeRoutes } from "./landscape-routes.js";
import { registerHumanReleaseRoutes } from "./human-release.js";
import { runServerMigrations } from "./migrations.js";
import {
  createBattleCommandMatch,
  isRetiredBattleCommandMatch,
  projectBattleCommand,
  submitBattleCommand,
  type StoredBattleCommandMatch
} from "./battle-command-core.js";

type StoredMatch = { state: ReturnType<typeof createMatchState>; events: EventEnvelope[]; version?: number };
const memory = new Map<string, StoredMatch>();
const memoryBattleCommands = new Map<string, StoredBattleCommandMatch>();
const battleCommandResponses = new Map<string, unknown>();
const commandResponses = new Map<string, unknown>();
const memoryObservations: Array<PlaytestObservation & { observationId: string }> = [];
const memoryChallenges = new Map<string, Challenge>();
const memoryGameplayLabSessions = new Map<string, GameplayLabSession>();
const matchLockTails = new Map<string, Promise<void>>();
const gameplayLabLockTails = new Map<string, Promise<void>>();
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
const releaseId = process.env.CONTEXT_LANDSCAPE_RELEASE ?? "dev";
const playtestExportRoot = process.env.PLAYTEST_EXPORT_ROOT ?? join(process.cwd(), "data", "playtests");
const repoRoot = /[\\/]apps[\\/]server$/.test(process.cwd()) ? resolve(process.cwd(), "../..") : process.cwd();
const artCatalogRoot = process.env.ART_CATALOG_ROOT ?? join(repoRoot, "data", "art", "release");
// `auto` (the default) separates environment problems from rules defects: a checkout without the
// large `sleep-01` reports still boots, but an unwinnable variant or a drifted control never does.
// `strict` makes missing provenance fatal too (CI and release); `warn` downgrades everything.
const labPreflightMode = process.env.LAB_PREFLIGHT ?? "auto";
const startupLabPreflight = preflightGameplayLabs(repoRoot);
const labsMissingSources = startupLabPreflight.labs.filter((lab) => !lab.sourceFilesPresent);
const labsFailingRules = startupLabPreflight.labs.filter((lab) =>
  lab.controlReplayMatchesScenario === false ||
  lab.variants.some((variant) => !variant.winnable)
);
if (labsFailingRules.length > 0 && labPreflightMode !== "warn") {
  throw new Error(`gameplay_lab_startup_preflight_failed: ${labsFailingRules.map((lab) => lab.labId).join(", ")}`);
}
if (labsMissingSources.length > 0 && labPreflightMode === "strict") {
  throw new Error(`gameplay_lab_source_reports_missing: ${labsMissingSources.map((lab) => lab.labId).join(", ")}`);
}
for (const lab of labsMissingSources) {
  console.warn(`[preflight] ${lab.labId} is missing its source reports; its provenance is unverified in this environment.`);
}
for (const lab of labsFailingRules) {
  console.warn(`[preflight] ${lab.labId} failed reachability or control replay and is serving anyway (LAB_PREFLIGHT=warn).`);
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      match_id text PRIMARY KEY,
      state jsonb NOT NULL,
      version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS match_events (
      match_id text NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      event jsonb NOT NULL,
      PRIMARY KEY (match_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS match_commands (
      match_id text NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
      idempotency_key text NOT NULL,
      response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (match_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS battle_command_matches (
      match_id text PRIMARY KEY,
      state jsonb NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      revision integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS battle_command_events (
      match_id text NOT NULL REFERENCES battle_command_matches(match_id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      event jsonb NOT NULL,
      PRIMARY KEY (match_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS battle_command_requests (
      match_id text NOT NULL REFERENCES battle_command_matches(match_id) ON DELETE CASCADE,
      idempotency_key text NOT NULL,
      response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (match_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS playtest_observations (
      observation_id text PRIMARY KEY,
      session_id text NOT NULL,
      match_id text,
      event_type text NOT NULL,
      occurred_at timestamptz NOT NULL,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      challenge_id text PRIMARY KEY,
      match_id text NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
      scenario_id text NOT NULL,
      creator_id text NOT NULL,
      opponent_id text,
      status text NOT NULL,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gameplay_lab_sessions (
      lab_session_id text PRIMARY KEY,
      lab_id text NOT NULL,
      participant_id text NOT NULL,
      state jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gameplay_lab_sessions_lab_id_idx ON gameplay_lab_sessions(lab_id);
    CREATE INDEX IF NOT EXISTS playtest_observations_lab_session_idx ON playtest_observations ((data->>'labSessionId'));
    ALTER TABLE battle_command_matches ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  `);
  await runServerMigrations(pool);
}

async function loadCommandResponse(matchId: string, key: string): Promise<unknown | undefined> {
  const memoryKey = `${matchId}:${key}`;
  if (!pool) return commandResponses.get(memoryKey);
  const result = await pool.query<{ response: unknown }>("SELECT response FROM match_commands WHERE match_id = $1 AND idempotency_key = $2", [matchId, key]);
  return result.rowCount ? result.rows[0].response : undefined;
}

async function saveCommandResponse(matchId: string, key: string, response: unknown) {
  const memoryKey = `${matchId}:${key}`;
  if (!pool) {
    commandResponses.set(memoryKey, response);
    return;
  }
  await pool.query("INSERT INTO match_commands (match_id, idempotency_key, response) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [matchId, key, response]);
}

async function loadBattleCommandResponse(matchId: string, key: string): Promise<unknown | undefined> {
  const memoryKey = `${matchId}:${key}`;
  if (!pool) return battleCommandResponses.get(memoryKey);
  const result = await pool.query<{ response: unknown }>(
    "SELECT response FROM battle_command_requests WHERE match_id = $1 AND idempotency_key = $2",
    [matchId, key]
  );
  return result.rowCount ? result.rows[0].response : undefined;
}

async function saveBattleCommandResponse(matchId: string, key: string, response: unknown) {
  const memoryKey = `${matchId}:${key}`;
  if (!pool) {
    battleCommandResponses.set(memoryKey, response);
    return;
  }
  await pool.query(
    "INSERT INTO battle_command_requests (match_id, idempotency_key, response) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [matchId, key, response]
  );
}

async function loadBattleCommandMatch(id: string): Promise<StoredBattleCommandMatch | undefined> {
  if (!pool) return memoryBattleCommands.get(id);
  const result = await pool.query<{ state: StoredBattleCommandMatch["state"]; metadata: StoredBattleCommandMatch["metadata"]; revision: number }>(
    "SELECT state, metadata, revision FROM battle_command_matches WHERE match_id = $1",
    [id]
  );
  if (!result.rowCount) return undefined;
  const events = await pool.query("SELECT event FROM battle_command_events WHERE match_id = $1 ORDER BY sequence", [id]);
  return {
    state: result.rows[0].state,
    metadata: result.rows[0].metadata,
    revision: Number(result.rows[0].revision),
    events: events.rows.map((row) => row.event as EventEnvelope)
  };
}

async function saveBattleCommandMatch(id: string, match: StoredBattleCommandMatch, expectedRevision?: number) {
  if (!pool) {
    const current = memoryBattleCommands.get(id);
    if (current && expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error("battle_revision_conflict");
    memoryBattleCommands.set(id, match);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ revision: number }>(
      "SELECT revision FROM battle_command_matches WHERE match_id = $1 FOR UPDATE",
      [id]
    );
    if (current.rowCount && expectedRevision !== undefined && Number(current.rows[0].revision) !== expectedRevision) {
      throw new Error("battle_revision_conflict");
    }
    await client.query(
      `INSERT INTO battle_command_matches (match_id, state, metadata, revision) VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id) DO UPDATE SET state = EXCLUDED.state, metadata = EXCLUDED.metadata, revision = EXCLUDED.revision, updated_at = now()`,
      [id, match.state, match.metadata ?? {}, match.revision]
    );
    for (const item of match.events) {
      await client.query(
        "INSERT INTO battle_command_events (match_id, sequence, event) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [id, item.sequence, item]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadMatch(id: string): Promise<StoredMatch | undefined> {
  if (!pool) return memory.get(id);
  const result = await pool.query<{ state: StoredMatch["state"]; version: number }>("SELECT state, version FROM matches WHERE match_id = $1", [id]);
  if (!result.rowCount) return undefined;
  const events = await pool.query("SELECT event FROM match_events WHERE match_id = $1 ORDER BY sequence", [id]);
  return { state: result.rows[0].state, events: events.rows.map((row) => row.event as EventEnvelope), version: Number(result.rows[0].version) };
}

async function saveMatch(id: string, match: StoredMatch) {
  if (!pool) {
    const current = memory.get(id);
    if (current && match.version !== undefined && current.version !== match.version) throw new Error("match_version_conflict");
    match.version = (current?.version ?? -1) + 1;
    memory.set(id, match);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ version: number }>("SELECT version FROM matches WHERE match_id = $1 FOR UPDATE", [id]);
    if (current.rowCount && match.version !== undefined && Number(current.rows[0].version) !== match.version) throw new Error("match_version_conflict");
    const version = current.rowCount ? Number(current.rows[0].version) + 1 : 0;
    await client.query(
      `INSERT INTO matches (match_id, state, version) VALUES ($1, $2, $3)
       ON CONFLICT (match_id) DO UPDATE SET state = EXCLUDED.state, version = EXCLUDED.version, updated_at = now()`,
      [id, match.state, version]
    );
    for (const raw of match.events) {
      const event = raw as { sequence: number };
      await client.query("INSERT INTO match_events (match_id, sequence, event) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, event.sequence, raw]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function withMatchLock<T>(matchId: string, work: () => Promise<T>): Promise<T> {
  const previous = matchLockTails.get(matchId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  matchLockTails.set(matchId, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (matchLockTails.get(matchId) === current) matchLockTails.delete(matchId);
  }
}

async function loadChallenge(id: string): Promise<Challenge | undefined> {
  if (!pool) return memoryChallenges.get(id);
  const result = await pool.query("SELECT challenge_id, match_id, scenario_id, creator_id, opponent_id, status, created_at, expires_at FROM challenges WHERE challenge_id = $1", [id]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0];
  return ChallengeSchema.parse({ challengeId: row.challenge_id, matchId: row.match_id, scenarioId: row.scenario_id, creatorId: row.creator_id, opponentId: row.opponent_id, status: row.status, createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString() });
}

async function saveChallenge(challenge: Challenge) {
  if (!pool) {
    memoryChallenges.set(challenge.challengeId, challenge);
    return;
  }
  await pool.query(
    `INSERT INTO challenges (challenge_id, match_id, scenario_id, creator_id, opponent_id, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (challenge_id) DO UPDATE SET opponent_id = EXCLUDED.opponent_id, status = EXCLUDED.status`,
    [challenge.challengeId, challenge.matchId, challenge.scenarioId, challenge.creatorId, challenge.opponentId, challenge.status, challenge.createdAt, challenge.expiresAt]
  );
}

async function recordObservation(observation: PlaytestObservation): Promise<string> {
  const parsed = PlaytestObservationSchema.parse(observation);
  const observationId = `obs_${randomUUID()}`;
  if (!pool) {
    memoryObservations.push({ observationId, ...parsed });
  } else {
    await pool.query(
      "INSERT INTO playtest_observations (observation_id, session_id, match_id, event_type, occurred_at, data) VALUES ($1, $2, $3, $4, $5, $6)",
      [observationId, parsed.sessionId, parsed.matchId ?? null, parsed.eventType, parsed.occurredAt, parsed.data]
    );
  }
  return observationId;
}

async function loadGameplayLabSession(id: string): Promise<GameplayLabSession | undefined> {
  if (!pool) return memoryGameplayLabSessions.get(id);
  const result = await pool.query<{ state: unknown }>("SELECT state FROM gameplay_lab_sessions WHERE lab_session_id = $1", [id]);
  return result.rowCount ? GameplayLabSessionSchema.parse(result.rows[0].state) : undefined;
}

async function saveGameplayLabSession(session: GameplayLabSession): Promise<void> {
  const parsed = GameplayLabSessionSchema.parse(session);
  if (!pool) {
    memoryGameplayLabSessions.set(parsed.labSessionId, parsed);
    return;
  }
  await pool.query(
    `INSERT INTO gameplay_lab_sessions (lab_session_id, lab_id, participant_id, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lab_session_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
    [parsed.labSessionId, parsed.labId, parsed.participantId, parsed, parsed.createdAt, parsed.updatedAt]
  );
}

async function findGameplayLabByMatchId(matchId: string): Promise<{ session: GameplayLabSession; trial: GameplayLabTrial } | undefined> {
  let sessions: GameplayLabSession[];
  if (!pool) {
    sessions = [...memoryGameplayLabSessions.values()];
  } else {
    const result = await pool.query<{ state: unknown }>(
      `SELECT state FROM gameplay_lab_sessions
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(state->'trials') trial
         WHERE trial->>'matchId' = $1
       )
       LIMIT 1`,
      [matchId]
    );
    sessions = result.rows.map((row) => GameplayLabSessionSchema.parse(row.state));
  }
  for (const session of sessions) {
    const trial = session.trials.find((candidate) => candidate.matchId === matchId);
    if (trial) return { session, trial };
  }
  return undefined;
}

async function loadGameplayLabObservations(labSessionId: string) {
  if (!pool) {
    return memoryObservations
      .filter((observation) => observation.data.labSessionId === labSessionId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
  const result = await pool.query(
    `SELECT observation_id, session_id, match_id, event_type, occurred_at, data
     FROM playtest_observations
     WHERE data->>'labSessionId' = $1
     ORDER BY occurred_at, observation_id`,
    [labSessionId]
  );
  return result.rows.map((row) => ({
    observationId: row.observation_id as string,
    sessionId: row.session_id as string,
    matchId: row.match_id as string | null,
    eventType: row.event_type as string,
    occurredAt: new Date(row.occurred_at as string | Date).toISOString(),
    data: row.data as Record<string, unknown>
  }));
}

async function withGameplayLabLock<T>(labSessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = gameplayLabLockTails.get(labSessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  gameplayLabLockTails.set(labSessionId, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (gameplayLabLockTails.get(labSessionId) === current) gameplayLabLockTails.delete(labSessionId);
  }
}

function labObservationData(session: GameplayLabSession, trial?: GameplayLabTrial, extra: Record<string, unknown> = {}) {
  return {
    labId: session.labId,
    labVersion: session.labVersion,
    labSessionId: session.labSessionId,
    trialId: trial?.trialId,
    variantToken: trial?.variantToken,
    ...extra
  };
}

async function gameplayLabPayload(session: GameplayLabSession) {
  const definition = gameplayLabById.get(session.labId);
  if (!definition || definition.version !== session.labVersion) throw new Error("gameplay_lab_definition_unavailable");
  const view = gameplayLabSessionView(session, definition);
  if (!view.currentTrial) return { session: view, projection: null, events: [] };
  const match = await loadMatch(view.currentTrial.matchId);
  if (!match) throw new Error("gameplay_lab_match_unavailable");
  return { session: view, projection: projectForBlindedLab(match.state), events: match.events };
}

function projectForBlindedLab(
  state: StoredMatch["state"],
  playerId = "player"
): ReturnType<typeof projectForPlayer> {
  return {
    ...projectForPlayer(state, playerId),
    rulesTuning: {
      tuningId: "blinded",
      startingHeat: 0,
      startingDispersion: 0,
      startingConfidenceDrift: 0,
      fullSendHeat: 2,
      actionCostOverrides: {}
    }
  };
}

function blindStoredCommandResponse(response: unknown): unknown {
  if (!response || typeof response !== "object" || !("projection" in response)) return response;
  const candidate = response as { projection?: ReturnType<typeof projectForPlayer> };
  if (!candidate.projection) return response;
  return {
    ...candidate,
    projection: {
      ...candidate.projection,
      rulesTuning: projectForBlindedLab(candidate.projection).rulesTuning
    }
  };
}

async function buildGameplayLabExport(session: GameplayLabSession) {
  const definition = gameplayLabById.get(session.labId);
  if (!definition) throw new Error("gameplay_lab_definition_unavailable");
  const observations = await loadGameplayLabObservations(session.labSessionId);
  const matches = [];
  for (const trial of session.trials) {
    const match = await loadMatch(trial.matchId);
    if (!match) throw new Error(`gameplay_lab_match_unavailable:${trial.matchId}`);
    matches.push({
      trialId: trial.trialId,
      variantToken: trial.variantToken,
      variantId: trial.variantId,
      state: match.state,
      events: match.events,
      reconstruction: buildReconstruction(match.state, match.events),
      replayManifest: buildReplayManifest(match.state, match.events)
    });
  }
  const policyLabels = session.trials.flatMap((trial) => {
    const variant = definition.variants.find((candidate) => candidate.variantId === trial.variantId);
    if (!variant?.doctrineCard || !trial.preReview?.doctrineClassification) return [];
    return [{
      trialId: trial.trialId,
      variantToken: trial.variantToken,
      policyId: variant.doctrineCard.policyId,
      syntheticCategory: variant.doctrineCard.category,
      humanClassification: trial.preReview.doctrineClassification,
      followedWithoutOverride: trial.preReview.doctrineFollowed ?? false,
      rationale: trial.preReview.doctrineDecisionRationale ?? "",
      orders: variant.doctrineCard.steps
    }];
  });
  const grammarPolicies = policyLabels
    .filter((label) => ["plausible", "dominant"].includes(label.humanClassification))
    .map((label) => ({
      policyId: `human-${label.policyId}`,
      lessonPolicy: false,
      orders: label.orders
    }));
  const selectedTrial = session.trials.find((trial) => trial.variantToken === session.finalReview?.fairestTrialToken);
  const selectedVariant = definition.variants.find((variant) => variant.variantId === selectedTrial?.variantId);
  const followUpMatrix = session.finalReview && ["keep", "revise"].includes(session.finalReview.disposition) && selectedVariant
    ? {
        schemaVersion: 1,
        matrixId: `follow-up-${session.labId.toLowerCase()}-${session.labSessionId}`,
        engineVersion: ENGINE_VERSION,
        sourceLabSessionId: session.labSessionId,
        selectedVariantId: selectedVariant.variantId,
        scenarioIds: [definition.scenarioId],
        compositionIds: ["balanced", "scout-heavy", "line-heavy", "siege-heavy"],
        tuningCount: 2,
        tuningOverrides: [
          { tuningId: "control" },
          { ...selectedVariant.rulesTuning, tuningId: `selected-${selectedVariant.variantId}` }
        ],
        policyOverrides: grammarPolicies.length ? grammarPolicies : undefined,
        runsPerCell: 250,
        policyCount: 32,
        seedStart: 50_000_000,
        shardCount: 4,
        createdAt: new Date().toISOString()
      }
    : null;
  const timeline = [
    ...matches.flatMap((match) => match.events.map((event) => ({
      occurredAt: event.occurredAt,
      source: "match" as const,
      matchId: match.state.matchId,
      trialId: match.trialId,
      eventType: event.eventType,
      sequence: event.sequence,
      data: event.data
    }))),
    ...observations.map((observation) => ({
      occurredAt: observation.occurredAt,
      source: "observation" as const,
      matchId: observation.matchId,
      trialId: observation.data.trialId,
      eventType: observation.eventType,
      sequence: null,
      data: observation.data
    }))
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventType.localeCompare(right.eventType));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    syntheticPrior: definition.source,
    definition,
    session,
    observations,
    matches,
    timeline,
    policyLabels,
    disposition: session.finalReview
      ? { value: session.finalReview.disposition, rationale: session.finalReview.dispositionRationale }
      : null,
    followUpMatrix
  };
}

function gameplayLabReviewMarkdown(bundle: Awaited<ReturnType<typeof buildGameplayLabExport>>): string {
  const lines = [
    `# ${bundle.definition.labId} · ${bundle.definition.title}`,
    "",
    `- Lab session: \`${bundle.session.labSessionId}\``,
    `- Participant: \`${bundle.session.participantId}\``,
    `- Scenario: \`${bundle.definition.scenarioId}@${bundle.definition.scenarioVersion}\``,
    `- Disposition: **${bundle.disposition?.value ?? "not set"}**`,
    `- Rationale: ${bundle.disposition?.rationale ?? "not set"}`,
    "",
    "## Synthetic prior",
    "",
    bundle.definition.source.finding,
    "",
    "## Trials",
    ""
  ];
  for (const trial of bundle.session.trials) {
    const variant = bundle.definition.variants.find((candidate) => candidate.variantId === trial.variantId)!;
    const match = bundle.matches.find((candidate) => candidate.trialId === trial.trialId)!;
    const actionTimeline = match.events
      .filter((event) => event.eventType !== "fire_control.snapshot")
      .map((event) => `${event.sequence}:${event.eventType}`)
      .join(" → ");
    lines.push(
      `### Trial ${trial.variantToken} · ${variant.labelForReview}`,
      "",
      `- Match: \`${trial.matchId}\``,
      `- Result: **${match.state.status}**`,
      `- Progress: ${match.state.objectiveProgress}`,
      `- Energy remaining: ${match.state.commanderEnergy}`,
      `- Heat / dispersion: ${match.state.heat} / ${match.state.dispersion}`,
      `- Replay: \`${match.replayManifest.projectionHash}\``,
      `- Timeline: ${actionTimeline || "no commands"}`,
      `- Binding constraint: ${trial.preReview?.bindingConstraint ?? "not answered"}`,
      `- Decisive decision: ${trial.preReview?.decisiveDecision ?? "not answered"}`,
      `- Replay change: ${trial.preReview?.replayChange ?? "not answered"}`,
      `- Explanation changed: ${trial.postReview?.explanationChanged ?? "not answered"}`,
      `- Updated explanation: ${trial.postReview?.updatedExplanation ?? "not answered"}`,
      `- Missing or misleading: ${trial.postReview?.missingOrMisleading ?? "not answered"}`,
      ...(trial.preReview?.doctrineClassification ? [
        `- Doctrine followed: ${trial.preReview.doctrineFollowed ?? false}`,
        `- Doctrine classification: ${trial.preReview.doctrineClassification}`,
        `- Doctrine rationale: ${trial.preReview.doctrineDecisionRationale ?? "not answered"}`
      ] : []),
      ""
    );
  }
  lines.push(
    "## Comparison",
    "",
    `- Clearest: ${bundle.session.finalReview?.clearestTrialToken ?? "not answered"}`,
    `- Fairest: ${bundle.session.finalReview?.fairestTrialToken ?? "not answered"}`,
    `- Most interesting: ${bundle.session.finalReview?.mostInterestingTrialToken ?? "not answered"}`,
    `- Notes: ${bundle.session.finalReview?.comparisonNotes ?? "not answered"}`,
    ""
  );
  return `${lines.join("\n")}\n`;
}

async function writeGameplayLabExport(session: GameplayLabSession) {
  const bundle = await buildGameplayLabExport(session);
  const sessionDir = join(playtestExportRoot, session.labId, session.labSessionId);
  const matchesDir = join(sessionDir, "matches");
  await mkdir(matchesDir, { recursive: true });
  await writeFile(join(sessionDir, "session.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  await writeFile(join(sessionDir, "review.md"), gameplayLabReviewMarkdown(bundle));
  for (const match of bundle.matches) {
    await writeFile(join(matchesDir, `${match.state.matchId}-events.json`), `${JSON.stringify({
      replayManifest: match.replayManifest,
      events: match.events
    }, null, 2)}\n`);
    await writeFile(join(matchesDir, `${match.state.matchId}-reconstruction.json`), `${JSON.stringify(match.reconstruction, null, 2)}\n`);
  }
  if (bundle.followUpMatrix) await writeFile(join(sessionDir, "follow-up-matrix.json"), `${JSON.stringify(bundle.followUpMatrix, null, 2)}\n`);
  return {
    bundle,
    paths: {
      session: join(sessionDir, "session.json"),
      review: join(sessionDir, "review.md"),
      followUpMatrix: bundle.followUpMatrix ? join(sessionDir, "follow-up-matrix.json") : null
    }
  };
}

export function requestLogUrl(url: string): string {
  const query = url.indexOf("?");
  return query < 0 ? url : `${url.slice(0, query)}?[redacted]`;
}

export const app = Fastify({
  logger: process.env.NODE_ENV === "test" ? false : {
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: requestLogUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort
        };
      }
    }
  }
});
await app.register(cors, { origin: true });
const webRoot = join(repoRoot, "apps/web/dist");
if (existsSync(webRoot)) await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
if (existsSync(artCatalogRoot)) await app.register(fastifyStatic, { root: artCatalogRoot, prefix: "/media/art/", decorateReply: false });
registerLandscapeRoutes(app);
await registerHumanReleaseRoutes(app, {
  pool,
  artRoot: artCatalogRoot,
  battle: {
    load: loadBattleCommandMatch,
    save: saveBattleCommandMatch,
    withLock: withMatchLock,
    loadResponse: loadBattleCommandResponse,
    saveResponse: saveBattleCommandResponse
  }
});

app.get("/health/live", async () => ({ status: "ok", service: "context-landscape" }));
app.get("/health/ready", async (_request, reply) => {
  if (!pool) return { status: "ok", persistence: "memory" };
  try {
    await pool.query("SELECT 1");
    return { status: "ok", persistence: "postgres" };
  } catch {
    return reply.code(503).send({ status: "not-ready" });
  }
});
app.get("/version", async () => ({
  releaseId,
  engineVersion: ENGINE_VERSION,
  eventSchemaVersion: 1,
  scenario: twoBakedSlices.scenarioId,
  labPreflight: {
    mode: labPreflightMode,
    sourcesVerified: labsMissingSources.length === 0,
    rulesVerified: labsFailingRules.length === 0
  }
}));
app.get("/api/scenarios", async () => scenarios.map((scenario) => ({
  scenarioId: scenario.scenarioId,
  title: scenario.title,
  version: scenario.version,
  missionObjective: scenario.missionObjective,
  expectedLesson: scenario.expectedLesson,
  difficulty: scenario.difficulty,
  rulesProfile: scenario.rulesProfile
})));

function gameplayLabError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes("not_found") || message.includes("unavailable") ? 404
    : message.includes("required") || message.includes("invalid") || message.includes("mismatch") ? 400
      : 409;
  return reply.code(status).send({ error: message });
}

app.get("/api/gameplay-labs", async () => gameplayLabs.map(gameplayLabSummary));

app.post<{ Params: { labId: string }; Body: { participantId?: string } }>("/api/gameplay-labs/:labId/sessions", async (request, reply) => {
  const definition = gameplayLabById.get(request.params.labId);
  if (!definition) return reply.code(404).send({ error: "gameplay_lab_not_found" });
  const participantId = request.body?.participantId?.trim();
  if (!participantId) return reply.code(400).send({ error: "participant_required" });
  try {
    const session = createGameplayLabSession(definition, participantId, {
      sessionId: () => `lab_session_${randomUUID()}`,
      trialId: () => `trial_${randomUUID()}`,
      matchId: () => `match_${randomUUID()}`
    });
    const scenario = scenarioById.get(definition.scenarioId);
    if (!scenario) return reply.code(409).send({ error: "gameplay_lab_scenario_unavailable" });
    for (const trial of session.trials) {
      const variant = definition.variants.find((candidate) => candidate.variantId === trial.variantId);
      if (!variant) throw new Error("gameplay_lab_variant_unavailable");
      const state = createMatchState(
        trial.matchId,
        "player",
        scenario.seed + variant.seedOffset,
        scenario.scenarioId,
        "balanced",
        variant.rulesTuning
      );
      await saveMatch(trial.matchId, { state, events: [] });
    }
    await saveGameplayLabSession(session);
    const current = session.trials[0];
    await recordObservation({
      sessionId: participantId,
      matchId: current.matchId,
      eventType: "lab.session.started",
      occurredAt: session.createdAt,
      data: labObservationData(session, current, { trialCount: session.trials.length })
    });
    await recordObservation({
      sessionId: participantId,
      matchId: current.matchId,
      eventType: "lab.trial.started",
      occurredAt: session.createdAt,
      data: labObservationData(session, current)
    });
    return reply.code(201).send(await gameplayLabPayload(session));
  } catch (error) {
    return gameplayLabError(reply, error);
  }
});

app.get<{ Params: { sessionId: string } }>("/api/gameplay-lab-sessions/:sessionId", async (request, reply) => {
  const session = await loadGameplayLabSession(request.params.sessionId);
  if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
  try {
    return await gameplayLabPayload(session);
  } catch (error) {
    return gameplayLabError(reply, error);
  }
});

app.post<{ Params: { sessionId: string; trialId: string }; Body: unknown }>("/api/gameplay-lab-sessions/:sessionId/trials/:trialId/bookmarks", async (request, reply) => {
  const parsed = GameplayLabBookmarkSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_gameplay_lab_bookmark", details: parsed.error.flatten() });
  return withGameplayLabLock(request.params.sessionId, async () => {
    const session = await loadGameplayLabSession(request.params.sessionId);
    if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
    try {
      const next = bookmarkGameplayLabDecision(session, request.params.trialId, parsed.data);
      await saveGameplayLabSession(next);
      const trial = next.trials.find((candidate) => candidate.trialId === request.params.trialId)!;
      await recordObservation({
        sessionId: next.participantId,
        matchId: trial.matchId,
        eventType: "lab.decision.bookmarked",
        occurredAt: parsed.data.occurredAt,
        data: labObservationData(next, trial, { note: parsed.data.note })
      });
      return gameplayLabPayload(next);
    } catch (error) {
      return gameplayLabError(reply, error);
    }
  });
});

app.post<{ Params: { sessionId: string; trialId: string } }>("/api/gameplay-lab-sessions/:sessionId/trials/:trialId/complete", async (request, reply) => {
  return withGameplayLabLock(request.params.sessionId, async () => {
    const session = await loadGameplayLabSession(request.params.sessionId);
    if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
    const trial = session.trials.find((candidate) => candidate.trialId === request.params.trialId);
    if (!trial) return reply.code(404).send({ error: "gameplay_lab_trial_not_found" });
    const match = await loadMatch(trial.matchId);
    if (!match) return reply.code(404).send({ error: "gameplay_lab_match_unavailable" });
    if (match.state.status === "active") return reply.code(409).send({ error: "gameplay_lab_match_not_terminal" });
    try {
      const next = completeGameplayLabTrial(session, trial.trialId);
      await saveGameplayLabSession(next);
      await recordObservation({
        sessionId: next.participantId,
        matchId: trial.matchId,
        eventType: "lab.trial.completed",
        occurredAt: next.updatedAt,
        data: labObservationData(next, trial, {
          status: match.state.status,
          objectiveProgress: match.state.objectiveProgress,
          commanderEnergy: match.state.commanderEnergy
        })
      });
      return gameplayLabPayload(next);
    } catch (error) {
      return gameplayLabError(reply, error);
    }
  });
});

app.post<{ Params: { sessionId: string }; Body: unknown }>("/api/gameplay-lab-sessions/:sessionId/reviews", async (request, reply) => {
  const parsed = GameplayLabReviewRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_gameplay_lab_review", details: parsed.error.flatten() });
  const review = parsed.data;
  return withGameplayLabLock(request.params.sessionId, async () => {
    const session = await loadGameplayLabSession(request.params.sessionId);
    if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
    try {
      if (review.phase === "pre") {
        const definition = gameplayLabById.get(session.labId);
        const trial = session.trials.find((candidate) => candidate.trialId === review.trialId);
        const variant = definition?.variants.find((candidate) => candidate.variantId === trial?.variantId);
        if (variant?.doctrineCard && (
          review.answers.doctrineFollowed === undefined ||
          !review.answers.doctrineClassification ||
          !review.answers.doctrineDecisionRationale
        )) return reply.code(400).send({ error: "gameplay_lab_doctrine_review_required" });
      }
      const previousTrial = review.phase === "final" ? undefined : session.trials.find((trial) => trial.trialId === review.trialId);
      const next = submitGameplayLabReview(session, review);
      await saveGameplayLabSession(next);
      const eventType = review.phase === "pre" ? "lab.pre_reconstruction.submitted"
        : review.phase === "post" ? "lab.post_reconstruction.submitted"
          : "lab.session.completed";
      await recordObservation({
        sessionId: next.participantId,
        matchId: previousTrial?.matchId,
        eventType,
        occurredAt: next.updatedAt,
        data: labObservationData(next, previousTrial, { phase: review.phase })
      });
      if (review.phase === "pre" && previousTrial) {
        await recordObservation({
          sessionId: next.participantId,
          matchId: previousTrial.matchId,
          eventType: "lab.reconstruction.revealed",
          occurredAt: next.updatedAt,
          data: labObservationData(next, previousTrial)
        });
      }
      if (review.phase === "post" && next.status === "active") {
        const current = next.trials[next.currentTrialIndex];
        await recordObservation({
          sessionId: next.participantId,
          matchId: current.matchId,
          eventType: "lab.trial.started",
          occurredAt: next.updatedAt,
          data: labObservationData(next, current)
        });
      }
      const payload = await gameplayLabPayload(next);
      if (next.status === "complete") {
        const exported = await writeGameplayLabExport(next);
        return { ...payload, exportPaths: exported.paths };
      }
      return payload;
    } catch (error) {
      return gameplayLabError(reply, error);
    }
  });
});

app.get<{ Params: { sessionId: string; trialId: string } }>("/api/gameplay-lab-sessions/:sessionId/trials/:trialId/reconstruction", async (request, reply) => {
  const session = await loadGameplayLabSession(request.params.sessionId);
  if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
  const trial = session.trials.find((candidate) => candidate.trialId === request.params.trialId);
  if (!trial) return reply.code(404).send({ error: "gameplay_lab_trial_not_found" });
  if (!["reconstruction_available", "complete"].includes(trial.status)) return reply.code(409).send({ error: "gameplay_lab_pre_review_required" });
  const match = await loadMatch(trial.matchId);
  if (!match) return reply.code(404).send({ error: "gameplay_lab_match_unavailable" });
  return buildReconstruction(match.state, match.events);
});

app.get<{ Params: { sessionId: string }; Querystring: { format?: string } }>("/api/gameplay-lab-sessions/:sessionId/export", async (request, reply) => {
  const session = await loadGameplayLabSession(request.params.sessionId);
  if (!session) return reply.code(404).send({ error: "gameplay_lab_session_not_found" });
  if (session.status !== "complete") return reply.code(409).send({ error: "gameplay_lab_session_incomplete" });
  try {
    const exported = await writeGameplayLabExport(session);
    if (request.query.format === "markdown") return reply.type("text/markdown; charset=utf-8").send(gameplayLabReviewMarkdown(exported.bundle));
    return exported.bundle;
  } catch (error) {
    return gameplayLabError(reply, error);
  }
});

app.post<{ Body: unknown }>("/api/research/observations", async (request, reply) => {
  const parsed = PlaytestObservationSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_observation", details: parsed.error.flatten() });
  const observationId = await recordObservation(parsed.data);
  return reply.code(202).send({ accepted: true, observationId });
});

app.post<{ Body: unknown }>("/api/battle-command/matches", async (request, reply) => {
  const parsed = BattleCommandV3CreateRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) return reply.code(400).send({ error: "invalid_battle_setup", details: parsed.error.flatten() });
  const { seed, playerCompositionModule, opponentCompositionModule } = parsed.data;
  const id = `battle_${randomUUID()}`;
  const generatedSeed = seed ?? Number.parseInt(id.replace(/\D/g, "").slice(0, 9) || "260813", 10);
  const created = createBattleCommandMatch(id, generatedSeed, { playerCompositionModule, opponentCompositionModule });
  await saveBattleCommandMatch(id, created.stored);
  return reply.code(201).send(BattleCommandV3ViewSchema.parse(created.view));
});

app.get<{ Params: { id: string } }>("/api/battle-command/matches/:id", async (request, reply) => {
  const stored = await loadBattleCommandMatch(request.params.id);
  if (!stored) return reply.code(404).send({ error: "battle_not_found" });
  if (isRetiredBattleCommandMatch(stored)) {
    return reply.code(410).send({ error: "battle_ruleset_retired", createOperation: "/api/battle-command/matches" });
  }
  return BattleCommandV3ViewSchema.parse(projectBattleCommand(stored, stored.events));
});

app.post<{ Params: { id: string }; Body: unknown }>("/api/battle-command/matches/:id/actions", async (request, reply) => {
  return withMatchLock(request.params.id, async () => {
    const stored = await loadBattleCommandMatch(request.params.id);
    if (!stored) return reply.code(404).send({ error: "battle_not_found" });
    if (isRetiredBattleCommandMatch(stored)) {
      return reply.code(410).send({ error: "battle_ruleset_retired", createOperation: "/api/battle-command/matches" });
    }
    const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"] : undefined;
    if (idempotencyKey) {
      const existing = await loadBattleCommandResponse(request.params.id, idempotencyKey);
      if (existing) return existing;
    }
    const parsed = BattleCommandV3ActionRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_battle_action", details: parsed.error.flatten() });
    if (stored.revision !== parsed.data.revision) {
      return reply.code(409).send({ error: "battle_revision_conflict", currentRevision: stored.revision });
    }
    try {
      const result = submitBattleCommand(stored, parsed.data.submission);
      await saveBattleCommandMatch(request.params.id, result.stored, stored.revision);
      const response = BattleCommandV3ViewSchema.parse(result.view);
      if (idempotencyKey) await saveBattleCommandResponse(request.params.id, idempotencyKey, response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "battle_revision_conflict") return reply.code(409).send({ error: message });
      if (message === "battle_complete" || message.startsWith("phase_mismatch:")) {
        return reply.code(409).send({ error: message });
      }
      if (message === "battle_ruleset_retired") return reply.code(410).send({ error: message, createOperation: "/api/battle-command/matches" });
      if (["artillery_target_required", "unit_unavailable", "kinetic_plan_incomplete"].includes(message) ||
        message.startsWith("artillery_illegal:") || message.startsWith("command_illegal:")) return reply.code(400).send({ error: message });
      throw error;
    }
  });
});

app.post<{ Body: { scenarioId?: string; creatorId?: string } }>("/api/challenges", async (request, reply) => {
  const scenario = scenarioById.get(request.body?.scenarioId ?? twoBakedSlices.scenarioId);
  if (!scenario) return reply.code(400).send({ error: "scenario_not_found" });
  const now = new Date();
  const challenge: Challenge = {
    challengeId: `challenge_${randomUUID()}`,
    matchId: `match_${randomUUID()}`,
    scenarioId: scenario.scenarioId,
    creatorId: request.body?.creatorId ?? "player",
    opponentId: null,
    status: "open",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  };
  const state = createMatchState(challenge.matchId, challenge.creatorId, scenario.seed, scenario.scenarioId);
  await saveMatch(challenge.matchId, { state, events: [] });
  await saveChallenge(challenge);
  return reply.code(201).send({ challenge, joinPath: `/landscape/?challenge=${challenge.challengeId}` });
});

app.get<{ Params: { id: string } }>("/api/challenges/:id", async (request, reply) => {
  const challenge = await loadChallenge(request.params.id);
  if (!challenge) return reply.code(404).send({ error: "challenge_not_found" });
  return challenge;
});

app.post<{ Params: { id: string }; Body: { opponentId?: string } }>("/api/challenges/:id/accept", async (request, reply) => {
  const challenge = await loadChallenge(request.params.id);
  if (!challenge) return reply.code(404).send({ error: "challenge_not_found" });
  if (challenge.status !== "open") return reply.code(409).send({ error: "challenge_not_open", status: challenge.status });
  if (Date.parse(challenge.expiresAt) <= Date.now()) return reply.code(409).send({ error: "challenge_expired" });
  const accepted: Challenge = { ...challenge, opponentId: request.body?.opponentId ?? "opponent", status: "accepted" };
  await saveChallenge(accepted);
  return accepted;
});

app.post<{ Body: { playerId?: string; scenarioId?: string } }>("/api/matches", async (request, reply) => {
  const scenario = scenarioById.get(request.body?.scenarioId ?? twoBakedSlices.scenarioId);
  if (!scenario) return reply.code(400).send({ error: "scenario_not_found" });
  const id = `match_${randomUUID()}`;
  const state = createMatchState(id, request.body?.playerId ?? "player", scenario.seed, scenario.scenarioId);
  await saveMatch(id, { state, events: [] });
  return reply.code(201).send(projectForPlayer(state, request.body?.playerId ?? "player"));
});

app.get<{ Params: { id: string }; Querystring: { playerId?: string } }>("/api/matches/:id", async (request, reply) => {
  const match = await loadMatch(request.params.id);
  if (!match) return reply.code(404).send({ error: "match_not_found" });
  const lab = await findGameplayLabByMatchId(request.params.id);
  const projection = lab && lab.session.status !== "complete"
    ? projectForBlindedLab(match.state, request.query.playerId ?? "player")
    : projectForPlayer(match.state, request.query.playerId ?? "player");
  return { ...projection, events: match.events };
});

app.get<{ Params: { id: string } }>("/api/matches/:id/reconstruction", async (request, reply) => {
  const match = await loadMatch(request.params.id);
  if (!match) return reply.code(404).send({ error: "match_not_found" });
  const lab = await findGameplayLabByMatchId(request.params.id);
  if (lab && !["reconstruction_available", "complete"].includes(lab.trial.status)) {
    return reply.code(409).send({ error: "gameplay_lab_pre_review_required" });
  }
  return buildReconstruction(match.state, match.events);
});

app.post<{ Params: { id: string }; Body: unknown }>("/api/matches/:id/orders", async (request, reply) => {
  return withMatchLock(request.params.id, async () => {
    const lab = await findGameplayLabByMatchId(request.params.id);
    const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"] : undefined;
    if (idempotencyKey) {
      const existing = await loadCommandResponse(request.params.id, idempotencyKey);
      if (existing) return lab && lab.session.status !== "complete" ? blindStoredCommandResponse(existing) : existing;
    }
    const match = await loadMatch(request.params.id);
    if (!match) return reply.code(404).send({ error: "match_not_found" });
    const parsed = OrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_order", details: parsed.error.flatten() });
    if (match.state.status !== "active") return reply.code(409).send({ error: "match_complete", status: match.state.status });
    const result = resolveSlot(match.state, [parsed.data]);
    const updated = { state: result.state, events: [...match.events, ...result.events], version: match.version };
    try {
      await saveMatch(request.params.id, updated);
    } catch (error) {
      if (error instanceof Error && error.message === "match_version_conflict") return reply.code(409).send({ error: "match_conflict" });
      throw error;
    }
    const response = {
      projection: lab && lab.session.status !== "complete"
        ? projectForBlindedLab(result.state)
        : projectForPlayer(result.state),
      events: result.events
    };
    if (idempotencyKey) await saveCommandResponse(request.params.id, idempotencyKey, response);
    return response;
  });
});

app.get("/", async (_request, reply) => {
  if (!existsSync(join(webRoot, "index.html"))) return reply.type("text/plain").send("Context Landscape API is running");
  return reply.sendFile("index.html");
});

export function setMemoryBattleCommandMatchForTest(id: string, stored: StoredBattleCommandMatch): void {
  if (process.env.NODE_ENV !== "test") throw new Error("test-only battle snapshot injection is unavailable outside tests");
  if (pool) throw new Error("test-only battle snapshot injection requires the in-memory store");
  memoryBattleCommands.set(id, stored);
}

export async function startContextLandscapeServer(): Promise<void> {
  await initDb();
  const port = Number(process.env.CONTEXT_LANDSCAPE_PORT ?? process.env.PORT ?? 8080);
  await app.listen({ host: "0.0.0.0", port });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) await startContextLandscapeServer();
