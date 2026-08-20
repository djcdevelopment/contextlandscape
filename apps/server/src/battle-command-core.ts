import type {
  AttentionMatchState,
  AttentionV4ArtilleryIntent,
  AttentionV4CommandIntent,
  AttentionV4EventEnvelope,
  AttentionV4KineticPlan,
  AttentionV4MatchState,
  AttentionV4Projection,
  AttentionV4CommanderProgram,
  BattleCommandV3Submission,
  BattleCommandV3View,
  EventEnvelope
} from "@landscape/contracts";
import {
  ATTENTION_V4_COMPOSITION_MODULES,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION,
  ATTENTION_V4_STATE_SCHEMA_VERSION,
  ATTENTION_V4_VIEW_SCHEMA_VERSION
} from "@landscape/contracts";
import {
  ATTENTION_V4_RULESET_HASH,
  ATTENTION_V4_CONFORMANCE_REPORT_HASH,
  applyAttentionV4Command,
  assertAttentionV4Activated,
  attentionV4AiCommander,
  attentionV4CommanderArtillery,
  attentionV4CommanderCapacityClaim,
  attentionV4CommanderCommand,
  attentionV4CommanderKinetic,
  attentionV4ManualCommander,
  compileAttentionV4Commander,
  createAttentionV4CommanderProfile,
  defaultAttentionV4Rules,
  legalAttentionV4Actions,
  projectAttentionV4Match,
  resolveAttentionV4Artillery,
  resolveAttentionV4Capacity,
  resolveAttentionV4Kinetic,
  startAttentionV4Match,
  type AttentionV4Match,
  type AttentionV4Transition
} from "@landscape/engine";

export const BATTLE_PLAYER_ID = "alpha";
export const BATTLE_AI_ID = "bravo";

type StoredEvent = AttentionV4EventEnvelope | EventEnvelope;

export type BattleCommandSnapshotMetadata = {
  modelVersion: "duel-capacity-v3-experimental";
  stateSchemaVersion: typeof ATTENTION_V4_STATE_SCHEMA_VERSION;
  resolverVersion: typeof ATTENTION_V4_RESOLVER_VERSION;
  rulesetVersion: typeof ATTENTION_V4_RULESET_VERSION;
  rulesetHash: typeof ATTENTION_V4_RULESET_HASH;
  compiledCommanderHashes: [string, string];
  conformanceReportHash: typeof ATTENTION_V4_CONFORMANCE_REPORT_HASH;
  controllers?: ["human", "ai"] | ["human", "human"];
  experience?: Record<string, unknown>;
};

export type StoredBattleCommandMatch = {
  // Legacy rows are admitted at the storage boundary only so the route can
  // return a deliberate 410 instead of trying to hydrate them with v4 rules.
  state: AttentionV4MatchState | AttentionMatchState;
  events: StoredEvent[];
  revision: number;
  metadata?: Partial<BattleCommandSnapshotMetadata>;
};

export const battleCommandSnapshotMetadata: BattleCommandSnapshotMetadata = {
  modelVersion: "duel-capacity-v3-experimental",
  stateSchemaVersion: ATTENTION_V4_STATE_SCHEMA_VERSION,
  resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
  rulesetVersion: ATTENTION_V4_RULESET_VERSION,
  rulesetHash: ATTENTION_V4_RULESET_HASH,
  compiledCommanderHashes: [attentionV4ManualCommander.programHash, attentionV4AiCommander.programHash],
  conformanceReportHash: ATTENTION_V4_CONFORMANCE_REPORT_HASH
};

type CompositionModule = typeof ATTENTION_V4_COMPOSITION_MODULES[number];

function withComposition(base: AttentionV4CommanderProgram, compositionModule: CompositionModule): AttentionV4CommanderProgram {
  return compileAttentionV4Commander(createAttentionV4CommanderProfile({
    compositionModule,
    triageModule: base.triageModule,
    movementModule: base.movementModule,
    capacityModule: base.capacityModule
  }));
}

function programForHash(base: AttentionV4CommanderProgram, hash: string | undefined): AttentionV4CommanderProgram | undefined {
  return ATTENTION_V4_COMPOSITION_MODULES
    .map((compositionModule) => withComposition(base, compositionModule))
    .find((candidate) => candidate.programHash === hash);
}

function commanderForMatch(match: AttentionV4Match, playerId: string, base: AttentionV4CommanderProgram): AttentionV4CommanderProgram {
  const playerIndex = match.state.players.findIndex((player) => player.playerId === playerId);
  const expectedHash = match.state.compiledCommanderHashes[playerIndex];
  const program = programForHash(base, expectedHash);
  if (!program) throw new Error("battle_ruleset_retired");
  return program;
}

export function isRetiredBattleCommandMatch(stored: StoredBattleCommandMatch): boolean {
  const state = stored.state as Partial<AttentionV4MatchState>;
  const metadata = stored.metadata;
  if (!metadata) return true;
  const compiledHashesMatch = Array.isArray(metadata.compiledCommanderHashes) &&
    Array.isArray(state.compiledCommanderHashes) &&
    metadata.compiledCommanderHashes.length === state.compiledCommanderHashes.length &&
    metadata.compiledCommanderHashes.every((hash, index) => hash === state.compiledCommanderHashes?.[index]);
  const controllers = metadata.controllers ?? ["human", "ai"];
  const programs = state.compiledCommanderHashes?.map((hash, index) => programForHash(
    controllers[index] === "ai" ? attentionV4AiCommander : attentionV4ManualCommander,
    hash
  ));
  const programsMatchFleets = Boolean(programs?.every(Boolean)) && programs!.every((candidate, index) => {
    const program = candidate!;
    const playerId = state.players?.[index]?.playerId;
    const composition = state.units?.filter((unit) => unit.ownerPlayerId === playerId).map((unit) => unit.chassis);
    return Array.isArray(composition) && composition.length === program.composition.length && composition.every((chassis, unitIndex) => chassis === program.composition[unitIndex]);
  });
  return state.schemaVersion !== ATTENTION_V4_STATE_SCHEMA_VERSION || state.modelVersion !== battleCommandSnapshotMetadata.modelVersion ||
    state.rulesetVersion !== ATTENTION_V4_RULESET_VERSION || state.rulesetHash !== ATTENTION_V4_RULESET_HASH ||
    state.resolverVersion !== ATTENTION_V4_RESOLVER_VERSION ||
    metadata.modelVersion !== battleCommandSnapshotMetadata.modelVersion || metadata.stateSchemaVersion !== ATTENTION_V4_STATE_SCHEMA_VERSION ||
    metadata.resolverVersion !== ATTENTION_V4_RESOLVER_VERSION || metadata.rulesetVersion !== ATTENTION_V4_RULESET_VERSION ||
    metadata.rulesetHash !== ATTENTION_V4_RULESET_HASH || !compiledHashesMatch || !programsMatchFleets ||
    metadata.conformanceReportHash !== ATTENTION_V4_CONFORMANCE_REPORT_HASH;
}

function hydrate(stored: StoredBattleCommandMatch): AttentionV4Match {
  if (isRetiredBattleCommandMatch(stored)) throw new Error("battle_ruleset_retired");
  return { state: stored.state as AttentionV4MatchState, rules: defaultAttentionV4Rules };
}

function append(stored: StoredBattleCommandMatch, match: AttentionV4Match, events: AttentionV4EventEnvelope[]): StoredBattleCommandMatch {
  return {
    state: match.state,
    events: [...stored.events, ...events],
    revision: stored.revision + 1,
    metadata: {
      ...battleCommandSnapshotMetadata,
      ...stored.metadata,
      compiledCommanderHashes: [...match.state.compiledCommanderHashes] as [string, string]
    }
  };
}

function addTransition(
  current: { match: AttentionV4Match; events: AttentionV4EventEnvelope[] },
  transition: AttentionV4Transition
): void {
  current.match = transition.match;
  current.events.push(...transition.events);
}

function advanceAiUntilHuman(current: { match: AttentionV4Match; events: AttentionV4EventEnvelope[] }): void {
  const aiCommander = commanderForMatch(current.match, BATTLE_AI_ID, attentionV4AiCommander);
  for (let operation = 0; operation < 128; operation += 1) {
    if (current.match.state.phase !== "command" || current.match.state.command.activePlayerId !== BATTLE_AI_ID) return;
    const beforeSequence = current.match.state.eventSequence;
    addTransition(current, applyAttentionV4Command(current.match, attentionV4CommanderCommand(current.match, BATTLE_AI_ID, aiCommander)));
    if (current.match.state.eventSequence === beforeSequence) throw new Error("ai_command_stalled");
  }
  throw new Error("ai_command_limit");
}

function publicEvent(item: StoredEvent): AttentionV4EventEnvelope {
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["seed", "randomStreamId", "sound", "latentSound", "soundKey", "noiseKey", "positionKey"].includes(key))
      .map(([key, value]) => [key, scrub(value)]));
  };
  return {
    schemaVersion: 1,
    eventId: item.eventId,
    matchId: item.matchId,
    sequence: item.sequence,
    turn: item.turn,
    slot: item.slot,
    occurredAt: item.occurredAt,
    eventType: item.eventType,
    actorId: item.actorId,
    causationId: item.causationId ?? null,
    correlationId: item.correlationId ?? `${item.matchId}:retired-event`,
    data: scrub(item.data) as Record<string, unknown>
  };
}

export function projectBattleCommand(stored: StoredBattleCommandMatch, recentEvents: StoredEvent[] = [], viewerPlayerId = BATTLE_PLAYER_ID): BattleCommandV3View {
  const match = hydrate(stored);
  const projection = projectAttentionV4Match(match, viewerPlayerId);
  return {
    schemaVersion: ATTENTION_V4_VIEW_SCHEMA_VERSION,
    revision: stored.revision,
    modelVersion: "duel-capacity-v3-experimental",
    stateSchemaVersion: ATTENTION_V4_STATE_SCHEMA_VERSION,
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compiledCommanderHashes: [...match.state.compiledCommanderHashes] as [string, string],
    projection,
    events: recentEvents.map(publicEvent),
    rules: defaultAttentionV4Rules,
    legal: legalAttentionV4Actions(match, viewerPlayerId),
    recaps: {
      register: projection.lastRegisterRecap,
      resolution: projection.lastResolutionRecap
    }
  };
}

export function createBattleCommandMatch(
  matchId: string,
  seed: number,
  options: { playerCompositionModule?: CompositionModule; opponentCompositionModule?: CompositionModule } = {}
): { stored: StoredBattleCommandMatch; view: BattleCommandV3View } {
  assertAttentionV4Activated();
  const playerCommander = withComposition(attentionV4ManualCommander, options.playerCompositionModule ?? "heavy-line-scout");
  const aiCommander = withComposition(attentionV4AiCommander, options.opponentCompositionModule ?? "heavy-line-scout");
  const started = startAttentionV4Match({
    matchId,
    seed,
    randomStreamId: `battle-command-v4:${seed}`,
    players: [
      { playerId: BATTLE_PLAYER_ID, composition: playerCommander.composition, commanderHash: playerCommander.programHash },
      { playerId: BATTLE_AI_ID, composition: aiCommander.composition, commanderHash: aiCommander.programHash }
    ]
  });
  const stored: StoredBattleCommandMatch = {
    state: started.match.state,
    events: started.events,
    revision: 0,
    metadata: {
      ...battleCommandSnapshotMetadata,
      compiledCommanderHashes: [playerCommander.programHash, aiCommander.programHash]
    }
  };
  return { stored, view: projectBattleCommand(stored, started.events) };
}

export function createFriendBattleCommandMatch(
  matchId: string,
  seed: number,
  options: { alphaCompositionModule: CompositionModule; bravoCompositionModule: CompositionModule; experience?: Record<string, unknown> }
): { stored: StoredBattleCommandMatch; alphaView: BattleCommandV3View; bravoView: BattleCommandV3View } {
  assertAttentionV4Activated();
  const alphaCommander = withComposition(attentionV4ManualCommander, options.alphaCompositionModule);
  const bravoCommander = withComposition(attentionV4ManualCommander, options.bravoCompositionModule);
  const started = startAttentionV4Match({
    matchId,
    seed,
    randomStreamId: `battle-command-v4:${seed}`,
    players: [
      { playerId: BATTLE_PLAYER_ID, composition: alphaCommander.composition, commanderHash: alphaCommander.programHash },
      { playerId: BATTLE_AI_ID, composition: bravoCommander.composition, commanderHash: bravoCommander.programHash }
    ]
  });
  const stored: StoredBattleCommandMatch = {
    state: started.match.state,
    events: started.events,
    revision: 0,
    metadata: {
      ...battleCommandSnapshotMetadata,
      compiledCommanderHashes: [alphaCommander.programHash, bravoCommander.programHash],
      controllers: ["human", "human"],
      experience: options.experience
    }
  };
  return {
    stored,
    alphaView: projectBattleCommand(stored, started.events, BATTLE_PLAYER_ID),
    bravoView: projectBattleCommand(stored, started.events, BATTLE_AI_ID)
  };
}

function completeKineticPlans(match: AttentionV4Match, playerId: string, plans: BattleCommandV3Submission & { phase: "kinetic" }): AttentionV4KineticPlan[] {
  const friendly = match.state.units.filter((unit) => unit.ownerPlayerId === playerId).map((unit) => unit.unitId).sort();
  const submitted = plans.plans.map((plan) => plan.unitId).sort();
  if (new Set(submitted).size !== submitted.length || submitted.length !== friendly.length || submitted.some((unitId, index) => unitId !== friendly[index])) {
    throw new Error("kinetic_plan_incomplete");
  }
  return plans.plans.map((plan) => ({ playerId, unitId: plan.unitId, actions: plan.actions }));
}

export function submitFriendBattleCommandPair(
  stored: StoredBattleCommandMatch,
  alpha: BattleCommandV3Submission,
  bravo: BattleCommandV3Submission
): StoredBattleCommandMatch {
  const hydrated = hydrate(stored);
  if (hydrated.state.status !== "active") throw new Error("battle_complete");
  if (hydrated.state.phase !== alpha.phase || hydrated.state.phase !== bravo.phase) throw new Error(`phase_mismatch:${hydrated.state.phase}`);
  if (alpha.phase === "command" || bravo.phase === "command") throw new Error("command_is_not_simultaneous");
  const current: { match: AttentionV4Match; events: AttentionV4EventEnvelope[] } = { match: hydrated, events: [] };
  if (alpha.phase === "kinetic" && bravo.phase === "kinetic") {
    addTransition(current, resolveAttentionV4Kinetic(current.match, [
      ...completeKineticPlans(current.match, BATTLE_PLAYER_ID, alpha),
      ...completeKineticPlans(current.match, BATTLE_AI_ID, bravo)
    ]));
  } else if (alpha.phase === "artillery" && bravo.phase === "artillery") {
    const intent = (submission: typeof alpha, playerId: string): AttentionV4ArtilleryIntent => {
      if (submission.phase !== "artillery") throw new Error("phase_mismatch:artillery");
      if (submission.cardId !== null && !submission.center) throw new Error("artillery_target_required");
      return submission.cardId === null ? { kind: "pass", playerId } : { kind: "fire", playerId, cardId: submission.cardId, center: submission.center! };
    };
    addTransition(current, resolveAttentionV4Artillery(current.match, [intent(alpha, BATTLE_PLAYER_ID), intent(bravo, BATTLE_AI_ID)]));
  } else if (alpha.phase === "capacity" && bravo.phase === "capacity") {
    addTransition(current, resolveAttentionV4Capacity(current.match, [
      { playerId: BATTLE_PLAYER_ID, claim: alpha.claim },
      { playerId: BATTLE_AI_ID, claim: bravo.claim }
    ]));
  } else {
    throw new Error(`phase_mismatch:${hydrated.state.phase}`);
  }
  return append(stored, current.match, current.events);
}

export function submitFriendBattleCommandIntent(
  stored: StoredBattleCommandMatch,
  playerId: typeof BATTLE_PLAYER_ID | typeof BATTLE_AI_ID,
  submission: BattleCommandV3Submission & { phase: "command" }
): StoredBattleCommandMatch {
  const hydrated = hydrate(stored);
  if (hydrated.state.status !== "active") throw new Error("battle_complete");
  if (hydrated.state.phase !== "command") throw new Error(`phase_mismatch:${hydrated.state.phase}`);
  const transition = applyAttentionV4Command(hydrated, { ...submission.intent, playerId } as AttentionV4CommandIntent);
  return append(stored, transition.match, transition.events);
}

export function submitBattleCommand(stored: StoredBattleCommandMatch, submission: BattleCommandV3Submission): { stored: StoredBattleCommandMatch; view: BattleCommandV3View } {
  const hydrated = hydrate(stored);
  if (hydrated.state.status !== "active") throw new Error("battle_complete");
  if (hydrated.state.phase !== submission.phase) throw new Error(`phase_mismatch:${hydrated.state.phase}`);
  const current: { match: AttentionV4Match; events: AttentionV4EventEnvelope[] } = { match: hydrated, events: [] };
  const aiCommander = commanderForMatch(hydrated, BATTLE_AI_ID, attentionV4AiCommander);

  if (submission.phase === "kinetic") {
    const human = completeKineticPlans(current.match, BATTLE_PLAYER_ID, submission);
    addTransition(current, resolveAttentionV4Kinetic(current.match, [...human, ...attentionV4CommanderKinetic(current.match, BATTLE_AI_ID, aiCommander)]));
  } else if (submission.phase === "artillery") {
    if (submission.cardId !== null && !submission.center) throw new Error("artillery_target_required");
    const human: AttentionV4ArtilleryIntent = submission.cardId === null
      ? { kind: "pass", playerId: BATTLE_PLAYER_ID }
      : { kind: "fire", playerId: BATTLE_PLAYER_ID, cardId: submission.cardId, center: submission.center! };
    addTransition(current, resolveAttentionV4Artillery(current.match, [human, attentionV4CommanderArtillery(current.match, BATTLE_AI_ID, aiCommander)]));
  } else if (submission.phase === "capacity") {
    addTransition(current, resolveAttentionV4Capacity(current.match, [
      { playerId: BATTLE_PLAYER_ID, claim: submission.claim },
      { playerId: BATTLE_AI_ID, claim: attentionV4CommanderCapacityClaim(current.match, BATTLE_AI_ID, aiCommander) }
    ]));
    advanceAiUntilHuman(current);
  } else {
    const human = { ...submission.intent, playerId: BATTLE_PLAYER_ID } as AttentionV4CommandIntent;
    addTransition(current, applyAttentionV4Command(current.match, human));
    advanceAiUntilHuman(current);
  }

  const next = append(stored, current.match, current.events);
  return { stored: next, view: projectBattleCommand(next, current.events) };
}
