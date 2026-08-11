import { createHash } from "node:crypto";
import type {
  AttentionArtifactState,
  AttentionArtilleryIntent,
  AttentionArtilleryModel,
  AttentionArtillerySimulationCounters,
  AttentionCapacityIntent,
  AttentionChassis,
  AttentionCommandIntent,
  AttentionComposition,
  AttentionCoordinate,
  AttentionIntent,
  AttentionMatchState,
  AttentionModelDefinition,
  AttentionMovementIntent,
  AttentionPlayerState,
  AttentionProjection,
  AttentionRuntimeExtensions,
  AttentionScenario,
  AttentionSimulationCounters,
  AttentionSpatialModel,
  AttentionSpatialSimulationCounters,
  AttentionUapAction,
  AttentionUapModel,
  AttentionUapSimulationCounters,
  AttentionUnitState,
  EventEnvelope
} from "@landscape/contracts";
import {
  ATTENTION_V3_MODEL_VERSION,
  AttentionCompositionSchema,
  AttentionMatchStateSchema,
  AttentionModelDefinitionSchema,
  AttentionProjectionSchema,
  AttentionScenarioSchema
} from "@landscape/contracts";

export const ATTENTION_MODEL_VERSION = "duel-capacity-v1" as const;
export const ATTENTION_ENGINE_VERSION = "1.0.0" as const;

type InternalProfile = {
  chassis: AttentionChassis;
  throughput: number;
  seizeCost: number;
  calibration: number;
  movementRange: number;
};

type InternalModel = {
  modelVersion: "duel-capacity-v1" | "duel-capacity-v2" | typeof ATTENTION_V3_MODEL_VERSION;
  boardWidth: number;
  boardHeight: number;
  baseAttention: number;
  verifyCost: number;
  objectiveTarget: number;
  driftLimit: number;
  soundnessRate: number;
  requireObjectiveRange: boolean;
  capacityCosts: number[];
  capacityAwards: number[];
  focusCooldownRounds: number;
  focusMaxUses: number;
  interactionRange: number;
  flareWidth: number;
  flareHeight: number;
  flareDurationEmissions: number;
  flareOutputMultiplier: number;
  targetLockTokensPerRound: number;
  targetLockStreakThreshold: number;
  targetLockThresholdTokens: number;
  targetLockTokenCap: number;
  uplinkAttentionBonus: number;
  uplinkStackLimit: number;
  reconCalibration: number;
  uplinkCalibration: number;
  capacityRanks: number[];
  focusUnlockRank: number;
  overclockUnlockRank: number;
  overclockDiscount: number;
  overclockMaxUses: number;
  flareUnlockRank: number;
  flareRange: number;
  flareMaxUses: number;
  profiles: Record<AttentionChassis, InternalProfile>;
  uap?: AttentionUapModel;
  spatial?: AttentionSpatialModel;
  artillery?: AttentionArtilleryModel;
  extensions: AttentionRuntimeExtensions;
};

const defaultRuntimeExtensions: AttentionRuntimeExtensions = {
  objectiveCoupling: "binary-front",
  stationaryQualification: "resolved-zero",
  capacityTopology: "shared-exclusive",
  abilityUnlockBasis: "personal-claim-count",
  abilityPackage: "complete",
  unresolvedDisposition: "auto-accept"
};

type InternalScenario = {
  scenarioId: string;
  version: number;
  roundLimit: number;
  boardWidth: number;
  boardHeight: number;
  initialCapacitySlot: number;
  playerOrder: [1 | 2, 1 | 2];
  frontSchedule: Array<{ round: number; playerSlot: 1 | 2; center: AttentionCoordinate; radius: number }>;
  spawns: Array<{ playerSlot: 1 | 2; unitIndex: number; position: AttentionCoordinate }>;
};

type InternalComposition = {
  compositionId: string;
  units: Array<{ unitKey: string; chassis: AttentionChassis }>;
};

type InternalState = AttentionMatchState;

/** Immutable definitions travel beside state so millions of runs do not clone them each turn. */
export type AttentionRuntimeContext = {
  model: AttentionModelDefinition;
  scenario: AttentionScenario;
};

export type AttentionMatch = {
  state: AttentionMatchState;
  context: AttentionRuntimeContext;
};

export type AttentionTransition = {
  match: AttentionMatch;
  events: EventEnvelope[];
};

export type AttentionMatchSetup = {
  matchId: string;
  seed: number;
  randomStreamId?: string;
  context?: AttentionRuntimeContext;
  players?: readonly [
    { playerId: string; composition: AttentionComposition },
    { playerId: string; composition: AttentionComposition }
  ];
};

export type AttentionController = {
  readonly maxCommandActions?: number;
  artillery?: (projection: AttentionProjection) => AttentionArtilleryIntent | null;
  movement: (projection: AttentionProjection) => AttentionMovementIntent[];
  claim?: (projection: AttentionProjection) => AttentionCapacityIntent | null;
  command: (projection: AttentionProjection) => AttentionCommandIntent | null;
};

export type AttentionTraceMode = "hash" | "summary" | "full";

export type AttentionRunResult = {
  match: AttentionMatch;
  traceHash: string;
  summary: {
    operations: number;
    events: number;
    eventTypes: Record<string, number>;
    players: Record<string, AttentionSimulationCounters>;
    uap?: Record<string, AttentionUapSimulationCounters>;
    spatial?: Record<string, AttentionSpatialSimulationCounters>;
    artillery?: Record<string, AttentionArtillerySimulationCounters>;
  };
  events?: EventEnvelope[];
};

const internalDefaultModel: InternalModel = {
  modelVersion: ATTENTION_MODEL_VERSION,
  boardWidth: 10,
  boardHeight: 10,
  baseAttention: 3,
  verifyCost: 1,
  objectiveTarget: 12,
  driftLimit: 5,
  soundnessRate: 0.7,
  requireObjectiveRange: true,
  capacityCosts: [1, 2, 3, 5, 8],
  capacityAwards: [1, 1, 3, 5, 8],
  focusCooldownRounds: 3,
  focusMaxUses: 3,
  interactionRange: 4,
  flareWidth: 3,
  flareHeight: 3,
  flareDurationEmissions: 2,
  flareOutputMultiplier: 2,
  targetLockTokensPerRound: 1,
  targetLockStreakThreshold: 3,
  targetLockThresholdTokens: 2,
  targetLockTokenCap: 99,
  uplinkAttentionBonus: 1,
  uplinkStackLimit: 3,
  reconCalibration: 0.85,
  uplinkCalibration: 0.2,
  capacityRanks: [1, 2, 3, 4, 5],
  focusUnlockRank: 1,
  overclockUnlockRank: 2,
  overclockDiscount: 1,
  overclockMaxUses: 1,
  flareUnlockRank: 3,
  flareRange: 4,
  flareMaxUses: 1,
  profiles: {
    scout: { chassis: "scout", throughput: 3, seizeCost: 1, calibration: 0.2, movementRange: 3 },
    line: { chassis: "line", throughput: 2, seizeCost: 2, calibration: 0.6, movementRange: 2 },
    siege: { chassis: "siege", throughput: 1, seizeCost: 3, calibration: 0.9, movementRange: 1 }
  },
  extensions: defaultRuntimeExtensions
};

const internalDefaultScenario: InternalScenario = {
  scenarioId: "mirrored-fronts-v1",
  version: 1,
  roundLimit: 8,
  boardWidth: 10,
  boardHeight: 10,
  initialCapacitySlot: 0,
  playerOrder: [1, 2],
  frontSchedule: [
    { round: 1, playerSlot: 1, center: { x: 2, y: 2 }, radius: 1 },
    { round: 1, playerSlot: 2, center: { x: 7, y: 7 }, radius: 1 },
    { round: 2, playerSlot: 1, center: { x: 3, y: 3 }, radius: 1 },
    { round: 2, playerSlot: 2, center: { x: 6, y: 6 }, radius: 1 },
    { round: 3, playerSlot: 1, center: { x: 4, y: 4 }, radius: 1 },
    { round: 3, playerSlot: 2, center: { x: 5, y: 5 }, radius: 1 },
    { round: 4, playerSlot: 1, center: { x: 5, y: 5 }, radius: 1 },
    { round: 4, playerSlot: 2, center: { x: 4, y: 4 }, radius: 1 },
    { round: 5, playerSlot: 1, center: { x: 6, y: 6 }, radius: 1 },
    { round: 5, playerSlot: 2, center: { x: 3, y: 3 }, radius: 1 },
    { round: 6, playerSlot: 1, center: { x: 7, y: 7 }, radius: 1 },
    { round: 6, playerSlot: 2, center: { x: 2, y: 2 }, radius: 1 },
    { round: 7, playerSlot: 1, center: { x: 6, y: 6 }, radius: 1 },
    { round: 7, playerSlot: 2, center: { x: 3, y: 3 }, radius: 1 },
    { round: 8, playerSlot: 1, center: { x: 5, y: 5 }, radius: 1 },
    { round: 8, playerSlot: 2, center: { x: 4, y: 4 }, radius: 1 }
  ],
  spawns: [
    { playerSlot: 1, unitIndex: 0, position: { x: 1, y: 1 } },
    { playerSlot: 1, unitIndex: 1, position: { x: 1, y: 2 } },
    { playerSlot: 1, unitIndex: 2, position: { x: 2, y: 1 } },
    { playerSlot: 2, unitIndex: 0, position: { x: 8, y: 8 } },
    { playerSlot: 2, unitIndex: 1, position: { x: 8, y: 7 } },
    { playerSlot: 2, unitIndex: 2, position: { x: 7, y: 8 } }
  ]
};

export const defaultAttentionModel = AttentionModelDefinitionSchema.parse({
  schemaVersion: 1,
  modelVersion: ATTENTION_MODEL_VERSION,
  rules: {
    attentionPerRound: internalDefaultModel.baseAttention,
    verifyCost: internalDefaultModel.verifyCost,
    objectiveTarget: internalDefaultModel.objectiveTarget,
    driftLimit: internalDefaultModel.driftLimit,
    soundnessRate: internalDefaultModel.soundnessRate,
    requireObjectiveRange: internalDefaultModel.requireObjectiveRange
  },
  chassis: Object.fromEntries(Object.entries(internalDefaultModel.profiles).map(([key, { throughput, seizeCost, calibration, movementRange }]) =>
    [key, { throughput, seizeCost, calibration, movementRange }]
  )),
  stationary: {
    reconLock: { calibration: internalDefaultModel.reconCalibration, delayRounds: 1 },
    targetLock: {
      tokensPerStationaryRound: internalDefaultModel.targetLockTokensPerRound,
      streakThreshold: internalDefaultModel.targetLockStreakThreshold,
      thresholdRoundTokens: internalDefaultModel.targetLockThresholdTokens,
      tokenCap: internalDefaultModel.targetLockTokenCap,
      range: internalDefaultModel.interactionRange
    },
    commandUplink: {
      attentionBonus: internalDefaultModel.uplinkAttentionBonus,
      calibration: internalDefaultModel.uplinkCalibration,
      delayRounds: 1,
      stackLimit: internalDefaultModel.uplinkStackLimit
    }
  },
  capacity: {
    slots: internalDefaultModel.capacityRanks.map((rank, index) => ({
      rank,
      cost: internalDefaultModel.capacityCosts[index],
      capacityAward: internalDefaultModel.capacityAwards[index]
    })),
    followerStartsAtSlot: 2,
    perfectFocus: {
      unlockRank: internalDefaultModel.focusUnlockRank,
      cooldownRounds: internalDefaultModel.focusCooldownRounds,
      maxUses: internalDefaultModel.focusMaxUses
    },
    overclock: {
      unlockRank: internalDefaultModel.overclockUnlockRank,
      seizeDiscount: internalDefaultModel.overclockDiscount,
      durationRounds: 1,
      maxUses: internalDefaultModel.overclockMaxUses
    },
    macroFlare: {
      unlockRank: internalDefaultModel.flareUnlockRank,
      range: internalDefaultModel.flareRange,
      width: internalDefaultModel.flareWidth,
      height: internalDefaultModel.flareHeight,
      durationEmissions: internalDefaultModel.flareDurationEmissions,
      outputMultiplier: internalDefaultModel.flareOutputMultiplier,
      maxUses: internalDefaultModel.flareMaxUses
    }
  }
});
export const defaultAttentionScenario = AttentionScenarioSchema.parse({
  schemaVersion: 1,
  scenarioId: internalDefaultScenario.scenarioId,
  version: internalDefaultScenario.version,
  board: {
    width: internalDefaultScenario.boardWidth,
    height: internalDefaultScenario.boardHeight,
    distanceMetric: "chebyshev",
    exclusiveOccupancy: true
  },
    roundLimit: internalDefaultScenario.roundLimit,
    initialCapacitySlot: internalDefaultScenario.initialCapacitySlot,
    playerOrder: internalDefaultScenario.playerOrder,
  frontSchedule: internalDefaultScenario.frontSchedule,
  spawns: internalDefaultScenario.spawns
});

const internalCompositions: Record<string, InternalComposition> = {
  balanced: { compositionId: "balanced", units: [{ unitKey: "scout", chassis: "scout" }, { unitKey: "line", chassis: "line" }, { unitKey: "siege", chassis: "siege" }] },
  "scout-homogeneous": { compositionId: "scout-homogeneous", units: [1, 2, 3].map((index) => ({ unitKey: `scout-${index}`, chassis: "scout" as const })) },
  "line-homogeneous": { compositionId: "line-homogeneous", units: [1, 2, 3].map((index) => ({ unitKey: `line-${index}`, chassis: "line" as const })) },
  "siege-homogeneous": { compositionId: "siege-homogeneous", units: [1, 2, 3].map((index) => ({ unitKey: `siege-${index}`, chassis: "siege" as const })) },
  escort: { compositionId: "escort", units: [{ unitKey: "line", chassis: "line" }, { unitKey: "scout-1", chassis: "scout" }, { unitKey: "scout-2", chassis: "scout" }] }
};

export const attentionCompositions = Object.fromEntries(
  Object.entries(internalCompositions).map(([key, value]) => [key, AttentionCompositionSchema.parse({ schemaVersion: 1, ...value })])
) as Record<string, AttentionComposition>;
export const attentionScenarios: AttentionScenario[] = [defaultAttentionScenario];

function modelOf(context: AttentionRuntimeContext): InternalModel {
  const source = context.model;
  return {
    modelVersion: source.modelVersion,
    boardWidth: context.scenario.board.width,
    boardHeight: context.scenario.board.height,
    baseAttention: source.rules.attentionPerRound,
    verifyCost: source.rules.verifyCost,
    objectiveTarget: source.rules.objectiveTarget,
    driftLimit: source.rules.driftLimit,
    soundnessRate: source.rules.soundnessRate,
    requireObjectiveRange: source.rules.requireObjectiveRange,
    capacityCosts: source.capacity.slots.map((slot) => slot.cost),
    capacityAwards: source.capacity.slots.map((slot) => slot.capacityAward),
    capacityRanks: source.capacity.slots.map((slot) => slot.rank),
    focusCooldownRounds: source.capacity.perfectFocus.cooldownRounds,
    focusMaxUses: source.capacity.perfectFocus.maxUses,
    focusUnlockRank: source.capacity.perfectFocus.unlockRank,
    overclockUnlockRank: source.capacity.overclock.unlockRank,
    overclockDiscount: source.capacity.overclock.seizeDiscount,
    overclockMaxUses: source.capacity.overclock.maxUses,
    flareUnlockRank: source.capacity.macroFlare.unlockRank,
    flareRange: source.capacity.macroFlare.range,
    flareMaxUses: source.capacity.macroFlare.maxUses,
    interactionRange: source.stationary.targetLock.range,
    flareWidth: source.artillery?.zone.width ?? source.capacity.macroFlare.width,
    flareHeight: source.artillery?.zone.height ?? source.capacity.macroFlare.height,
    flareDurationEmissions: source.artillery?.flareDurationEmissions ?? source.capacity.macroFlare.durationEmissions,
    flareOutputMultiplier: source.artillery?.outputMultiplier ?? source.capacity.macroFlare.outputMultiplier,
    targetLockTokensPerRound: source.stationary.targetLock.tokensPerStationaryRound,
    targetLockStreakThreshold: source.stationary.targetLock.streakThreshold,
    targetLockThresholdTokens: source.stationary.targetLock.thresholdRoundTokens,
    targetLockTokenCap: source.stationary.targetLock.tokenCap,
    uplinkAttentionBonus: source.stationary.commandUplink.attentionBonus,
    uplinkStackLimit: source.stationary.commandUplink.stackLimit,
    reconCalibration: source.stationary.reconLock.calibration,
    uplinkCalibration: source.stationary.commandUplink.calibration,
    profiles: {
      scout: { chassis: "scout", ...source.chassis.scout },
      line: { chassis: "line", ...source.chassis.line },
      siege: { chassis: "siege", ...source.chassis.siege }
    },
    ...(source.uap ? { uap: source.uap } : {}),
    ...(source.spatial ? { spatial: source.spatial } : {}),
    ...(source.artillery ? { artillery: source.artillery } : {}),
    extensions: source.extensions ?? defaultRuntimeExtensions
  };
}

function scenarioOf(context: AttentionRuntimeContext): InternalScenario {
  return {
    scenarioId: context.scenario.scenarioId,
    version: context.scenario.version,
    roundLimit: context.scenario.roundLimit,
    boardWidth: context.scenario.board.width,
    boardHeight: context.scenario.board.height,
    initialCapacitySlot: context.scenario.initialCapacitySlot ?? 0,
    playerOrder: context.scenario.playerOrder,
    frontSchedule: context.scenario.frontSchedule,
    spawns: context.scenario.spawns
  };
}

function compositionOf(composition: AttentionComposition): InternalComposition {
  return { compositionId: composition.compositionId, units: composition.units };
}

function stateOf(match: AttentionMatch): InternalState {
  return match.state;
}

function cloneState(match: AttentionMatch): InternalState {
  return structuredClone(match.state);
}

function withState(match: AttentionMatch, state: InternalState): AttentionMatch {
  return { state, context: match.context };
}

function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number, stream: string, label: string): number {
  let hash = fnv1a(`${seed}:${stream}:${label}`);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash >>> 0) / 4294967296;
}

function event(
  state: InternalState,
  eventType: string,
  actorId: string | null,
  data: Record<string, unknown>
): EventEnvelope {
  const sequence = state.eventSequence;
  state.eventSequence += 1;
  return {
    schemaVersion: 1,
    eventId: `${state.matchId}:${sequence}`,
    matchId: state.matchId,
    sequence,
    turn: state.round,
    slot: state.round,
    occurredAt: new Date((state.round * 1000 + sequence) * 1000).toISOString(),
    eventType,
    actorId,
    causationId: null,
    correlationId: `${state.matchId}:attention-round:${state.round}`,
    data
  };
}

function distance(left: AttentionCoordinate, right: AttentionCoordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function coordinateKey(coordinate: AttentionCoordinate): string {
  return `${coordinate.x},${coordinate.y}`;
}

function inBounds(model: InternalModel, coordinate: AttentionCoordinate): boolean {
  return coordinate.x >= 0 && coordinate.y >= 0 && coordinate.x < model.boardWidth && coordinate.y < model.boardHeight;
}

function playerIndex(state: InternalState, playerId: string): number {
  return state.players.findIndex((player) => player.playerId === playerId);
}

function priorityPlayerId(state: InternalState, context: AttentionRuntimeContext): string {
  const slot = scenarioOf(context).playerOrder[(state.round - 1) % 2];
  return state.players[slot - 1].playerId;
}

function comparePriority(
  state: InternalState,
  context: AttentionRuntimeContext,
  left: { playerId: string; unitId?: string },
  right: { playerId: string; unitId?: string }
): number {
  const priority = priorityPlayerId(state, context);
  const leftPlayer = left.playerId === priority ? 0 : 1;
  const rightPlayer = right.playerId === priority ? 0 : 1;
  return leftPlayer - rightPlayer || (left.unitId ?? "").localeCompare(right.unitId ?? "");
}

function activeFront(context: AttentionRuntimeContext, state: InternalState, playerId: string) {
  const scenario = scenarioOf(context);
  const slot = (playerIndex(state, playerId) + 1) as 1 | 2;
  const candidates = scenario.frontSchedule
    .filter((entry) => entry.playerSlot === slot && entry.round <= state.round)
    .sort((left, right) => right.round - left.round);
  const entry = candidates[0] ?? scenario.frontSchedule.find((candidate) => candidate.playerSlot === slot);
  if (!entry) throw new Error(`Scenario ${scenario.scenarioId} has no active front for player slot ${slot}`);
  return { playerId, center: entry.center, radius: entry.radius };
}

function objectiveEligible(
  match: AttentionMatch,
  state: InternalState,
  unitState: AttentionUnitState,
  position: AttentionCoordinate = unitState.position
): boolean {
  const scenario = scenarioOf(match.context);
  const slot = (playerIndex(state, unitState.ownerPlayerId) + 1) as 1 | 2;
  const candidates = scenario.frontSchedule
    .filter((entry) => entry.playerSlot === slot && entry.round <= state.round)
    .sort((left, right) => right.round - left.round);
  const entry = candidates[0] ?? scenario.frontSchedule.find((candidate) => candidate.playerSlot === slot);
  if (!entry) throw new Error(`Scenario ${scenario.scenarioId} has no active front for player slot ${slot}`);
  const model = modelOf(match.context);
  if (model.extensions.objectiveCoupling === "global") return true;
  const radius = model.extensions.objectiveCoupling === "distance-weighted-front" ? entry.radius + 1 : entry.radius;
  return !model.requireObjectiveRange || distance(position, entry.center) <= radius;
}

function spawnPositions(context: AttentionRuntimeContext, player: number): AttentionCoordinate[] {
  const slot = (player + 1) as 1 | 2;
  return scenarioOf(context).spawns
    .filter((spawn) => spawn.playerSlot === slot)
    .sort((left, right) => left.unitIndex - right.unitIndex)
    .map((spawn) => spawn.position);
}

export function createAttentionMatch(setup: AttentionMatchSetup): AttentionMatch {
  const provided = setup.context ?? { model: defaultAttentionModel, scenario: defaultAttentionScenario };
  const context: AttentionRuntimeContext = {
    model: AttentionModelDefinitionSchema.parse(provided.model),
    scenario: AttentionScenarioSchema.parse(provided.scenario)
  };
  const model = modelOf(context);
  const scenario = scenarioOf(context);
  if (model.modelVersion !== ATTENTION_MODEL_VERSION && model.modelVersion !== "duel-capacity-v2" && model.modelVersion !== ATTENTION_V3_MODEL_VERSION) {
    throw new Error(`Unsupported attention model ${model.modelVersion}`);
  }
  if (model.boardWidth !== 10 || model.boardHeight !== 10) throw new Error("attention duel models require a 10x10 board");
  if (scenario.initialCapacitySlot > model.capacityCosts.length) {
    throw new Error(`Scenario ${scenario.scenarioId} initial capacity slot exceeds the capacity track`);
  }
  if (context.model.stationary.reconLock.delayRounds !== 1 || context.model.stationary.commandUplink.delayRounds !== 1) {
    throw new Error("duel-capacity-v1 supports one-round stationary effect delays");
  }
  if (context.model.capacity.overclock.durationRounds !== 1) {
    throw new Error("duel-capacity-v1 supports a one-round Overclock duration");
  }

  const players = setup.players ?? [
    { playerId: "alpha", composition: attentionCompositions.balanced },
    { playerId: "bravo", composition: attentionCompositions.balanced }
  ];
  if (players[0].playerId === players[1].playerId) throw new Error("Attention matches require two distinct players");

  const playerState = (playerId: string): AttentionPlayerState => ({
    playerId,
    attention: model.baseAttention,
    baseAttention: model.baseAttention,
    capacityBonus: 0,
    queuedUplinkBonus: 0,
    progress: 0,
    drift: 0,
    status: "active",
    targetLocks: 0,
    claimCount: 0,
    claimAttempted: false,
    focusNextReadyRound: 1,
    focusUses: 0,
    overclockUsed: false,
    overclockActive: false,
    flareUsed: false,
    ...(model.artillery ? {
      artillery: {
        hand: {
          flare: model.artillery.startingHand.flare,
          chaff: model.artillery.startingHand.chaff
        }
      }
    } : {})
  });
  const playerStates: [AttentionPlayerState, AttentionPlayerState] = [
    playerState(players[0].playerId),
    playerState(players[1].playerId)
  ];

  const units: AttentionUnitState[] = [];
  players.forEach(({ playerId, composition }, ownerIndex) => {
    const normalized = compositionOf(composition);
    const positions = spawnPositions(context, ownerIndex);
    if (positions.length < normalized.units.length) {
      throw new Error(`Scenario ${scenario.scenarioId} has too few spawns for ${normalized.compositionId}`);
    }
    normalized.units.forEach(({ unitKey, chassis }, index) => {
      const profile = model.profiles[chassis];
      units.push({
        unitId: `${playerId}:${unitKey}`,
        ownerPlayerId: playerId,
        chassis,
        position: positions[index] ?? positions.at(-1)!,
        movementSpent: 0,
        stationaryStreak: 0,
        emissionCalibration: profile.calibration,
        nextEmissionCalibration: null,
        ...(model.uap ? {
          uap: {
            budget: model.uap.budgets[chassis],
            spent: 0,
            passiveSettleStreak: 0
          }
        } : {}),
        ...(model.spatial ? {
          spatial: {
            activeRange: model.spatial.ranges[chassis].defaultRange,
            nextActiveRange: null
          }
        } : {})
      });
    });
  });

  const state: AttentionMatchState = {
    schemaVersion: 1,
    modelVersion: model.modelVersion,
    matchId: setup.matchId,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    seed: setup.seed,
    randomStreamId: setup.randomStreamId ?? `${scenario.scenarioId}:${setup.seed}`,
    round: 1,
    phase: model.spatial ? "emission" : "movement",
    status: "active",
    winnerPlayerId: null,
    terminalReason: null,
    eventSequence: 0,
    players: playerStates,
    units,
    artifacts: [],
    flares: [],
    ...(model.artillery ? { chaffs: [] } : {}),
    capacityTrack: { nextSlot: scenario.initialCapacitySlot, claims: [] }
  };
  const parsed = AttentionMatchStateSchema.parse(state);
  return { state: parsed, context };
}

export function projectAttentionMatch(match: AttentionMatch, playerId: string): AttentionProjection {
  const state = stateOf(match);
  if (!state.players.some((player) => player.playerId === playerId)) throw new Error(`Unknown player ${playerId}`);
  const { seed: _hiddenSeed, randomStreamId: _hiddenRandomStreamId, ...publicState } = structuredClone(state);
  return AttentionProjectionSchema.parse({
    ...publicState,
    viewerPlayerId: playerId,
    artifacts: state.artifacts.map(({ sound, ...artifact }) => ({
      ...artifact,
      revealedSound: artifact.revealed ? sound : null
    })),
    activeFronts: state.players.map((player) => activeFront(match.context, state, player.playerId))
  });
}

function emitArtifacts(match: AttentionMatch, state: InternalState, events: EventEnvelope[]): void {
  const model = modelOf(match.context);
  const playerOrder = new Map(state.players.map((player, index) => [player.playerId, index]));
  const orderedUnits = [...state.units].sort((left, right) =>
    (playerOrder.get(left.ownerPlayerId)! - playerOrder.get(right.ownerPlayerId)!) || left.unitId.localeCompare(right.unitId)
  );

  for (const mech of orderedUnits) {
    const profile = model.profiles[mech.chassis];
    const affectingFlares = state.flares.filter((flare) => {
      const halfWidth = Math.floor(model.flareWidth / 2);
      const halfHeight = Math.floor(model.flareHeight / 2);
      return flare.emissionsRemaining > 0 &&
        Math.abs(mech.position.x - flare.center.x) <= halfWidth &&
        Math.abs(mech.position.y - flare.center.y) <= halfHeight;
    });
    const flared = affectingFlares.length > 0;
    const throughput = profile.throughput * (flared ? model.flareOutputMultiplier : 1);
    const artifactIds: string[] = [];
    const artifactDistances: number[] = [];
    const spatialCells = model.spatial && mech.spatial
      ? Array.from({ length: model.boardWidth * model.boardHeight }, (_, index) => ({
        x: index % model.boardWidth,
        y: Math.floor(index / model.boardWidth)
      })).filter((candidate) => {
        const separation = distance(mech.position, candidate);
        return separation >= model.spatial!.spawnMinimumDistance && separation <= mech.spatial!.activeRange;
      })
      : null;
    if (spatialCells && spatialCells.length === 0) throw new Error(`Unit ${mech.unitId} has no legal spatial artifact cells`);
    for (let index = 0; index < throughput; index += 1) {
      const artifactId = `${state.matchId}:r${state.round}:${mech.unitId}:${index}`;
      artifactIds.push(artifactId);
      const drawKey = `r${state.round}:${mech.unitId}:${index}`;
      const sound = unit(state.seed, state.randomStreamId, `sound:${drawKey}`) < model.soundnessRate;
      const signal = sound ? 0.75 : 0.25;
      const noise = unit(state.seed, state.randomStreamId, `noise:${drawKey}`);
      const reportedConfidence = Number(
        (mech.emissionCalibration * signal + (1 - mech.emissionCalibration) * noise).toFixed(4)
      );
      const position = spatialCells
        ? spatialCells[Math.floor(unit(state.seed, state.randomStreamId, `position:${drawKey}`) * spatialCells.length)]
        : mech.position;
      artifactDistances.push(distance(mech.position, position));
      state.artifacts.push({
        artifactId,
        ownerPlayerId: mech.ownerPlayerId,
        sourceUnitId: mech.unitId,
        position: { ...position },
        sound,
        reportedConfidence,
        revealed: false,
        objectiveEligible: objectiveEligible(match, state, mech, position),
        guarantee: null,
        guaranteedById: null,
        resolution: "pending",
        ...(model.spatial ? { supportScanUnitIds: [] } : {})
      });
    }
    const flareOwnerIds = [...new Set(affectingFlares.map((flare) => flare.ownerPlayerId))];
    events.push(event(state, "attention.artifacts.emitted", mech.unitId, {
      playerId: mech.ownerPlayerId,
      unitId: mech.unitId,
      count: throughput,
      artifactIds,
      // Only artifacts above baseline throughput disappear in the no-Flare
      // counterfactual. Attribute a threshold crossing to a Flare using this
      // conservative set, rather than every artifact emitted inside its zone.
      flareAddedArtifactIds: flared ? artifactIds.slice(profile.throughput) : [],
      flared,
      flareOwnerIds,
      // Overlapping allied and hostile Flares are non-stacking, so neither is
      // individually causal. Attribution is unambiguous only for one owner.
      causalFlareOwnerIds: flareOwnerIds.length === 1 ? flareOwnerIds : [],
      calibration: mech.emissionCalibration,
      objectiveEligible: objectiveEligible(match, state, mech),
      ...(spatialCells ? {
        spatial: true,
        activeRange: mech.spatial!.activeRange,
        artifactDistances
      } : {})
    }));
  }

  state.flares = state.flares
    .map((flare) => ({ ...flare, emissionsRemaining: flare.emissionsRemaining - 1 }))
    .filter((flare) => flare.emissionsRemaining > 0);
}

/**
 * Spatial rounds expose keyed artifact coordinates before either player submits a unit plan.
 * Stage A keeps its historical combined emission/movement transition for replay compatibility.
 */
export function resolveAttentionEmission(match: AttentionMatch): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "emission") throw new Error(`Cannot emit during ${current.phase}`);
  const model = modelOf(match.context);
  if (!model.spatial) throw new Error("The explicit emission phase requires a spatial v3 model");
  const state = cloneState(match);
  const events: EventEnvelope[] = [];
  emitArtifacts(match, state, events);
  state.phase = model.artillery ? "artillery" : "movement";
  events.push(event(state, model.artillery ? "attention.phase.artillery" : "attention.phase.movement", null, {
    round: state.round
  }));
  return { match: withState(match, state), events };
}

function insideZone(
  coordinate: AttentionCoordinate,
  center: AttentionCoordinate,
  width: number,
  height: number
): boolean {
  return Math.abs(coordinate.x - center.x) <= Math.floor(width / 2) &&
    Math.abs(coordinate.y - center.y) <= Math.floor(height / 2);
}

/** Resolve both public artillery declarations as one priority-free batch. */
export function resolveAttentionArtillery(
  match: AttentionMatch,
  intents: AttentionArtilleryIntent[]
): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "artillery") throw new Error(`Cannot resolve artillery during ${current.phase}`);
  const model = modelOf(match.context);
  const artillery = model.artillery;
  if (!artillery) throw new Error("Artillery phase requires an artillery model");
  const state = cloneState(match);
  const events: EventEnvelope[] = [];
  const playerIds = new Set(state.players.map((player) => player.playerId));
  const submissions = new Map<string, AttentionArtilleryIntent[]>();
  const canonical = [...intents].sort((left, right) =>
    left.playerId.localeCompare(right.playerId) || left.kind.localeCompare(right.kind) ||
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );

  for (const intent of canonical) {
    if (!playerIds.has(intent.playerId)) {
      events.push(event(state, "attention.artillery.declaration.rejected", intent.playerId, {
        playerId: intent.playerId,
        reason: "player_unavailable",
        intent
      }));
      continue;
    }
    const entries = submissions.get(intent.playerId) ?? [];
    entries.push(intent);
    submissions.set(intent.playerId, entries);
  }

  const validShots: Array<Extract<AttentionArtilleryIntent, { kind: "fire-artillery" }>> = [];
  for (const player of [...state.players].sort((left, right) => left.playerId.localeCompare(right.playerId))) {
    const entries = submissions.get(player.playerId) ?? [];
    if (entries.length === 0 || (entries.length === 1 && entries[0].kind === "pass-artillery")) {
      events.push(event(state, "attention.artillery.passed", player.playerId, { playerId: player.playerId }));
      continue;
    }
    if (entries.length !== 1 || entries[0].kind !== "fire-artillery") {
      events.push(event(state, "attention.artillery.declaration.rejected", player.playerId, {
        playerId: player.playerId,
        reason: "duplicate_declaration"
      }));
      continue;
    }
    const shot = entries[0];
    if (!inBounds(model, shot.center)) {
      events.push(event(state, "attention.artillery.declaration.rejected", player.playerId, {
        playerId: player.playerId,
        shell: shot.shell,
        center: shot.center,
        reason: "out_of_bounds"
      }));
      continue;
    }
    const remaining = player.artillery?.hand[shot.shell] ?? 0;
    if (remaining < 1) {
      events.push(event(state, "attention.artillery.declaration.rejected", player.playerId, {
        playerId: player.playerId,
        shell: shot.shell,
        center: shot.center,
        reason: "shell_unavailable"
      }));
      continue;
    }
    validShots.push(shot);
  }

  // Chaff is established first so a same-phase defensive declaration can neutralize a
  // hostile Flare aimed into its 3x3 screen. Chaff itself is never intercepted.
  for (const shot of validShots.filter((candidate) => candidate.shell === "chaff")) {
    const player = state.players.find((candidate) => candidate.playerId === shot.playerId)!;
    player.artillery!.hand.chaff -= 1;
    const chaffId = `${state.matchId}:chaff:${shot.playerId}:${state.round}`;
    state.chaffs = [...(state.chaffs ?? []), {
      chaffId,
      ownerPlayerId: shot.playerId,
      center: { ...shot.center },
      artilleryPhasesRemaining: artillery.chaffDurationArtilleryPhases
    }];
    events.push(event(state, "attention.artillery.shell.fired", shot.playerId, {
      playerId: shot.playerId,
      shell: shot.shell,
      center: shot.center,
      remaining: player.artillery!.hand.chaff
    }));
    events.push(event(state, "attention.artillery.chaff.established", shot.playerId, {
      playerId: shot.playerId,
      chaffId,
      center: shot.center,
      artilleryPhases: artillery.chaffDurationArtilleryPhases
    }));
  }

  for (const shot of validShots.filter((candidate) => candidate.shell === "flare")) {
    const player = state.players.find((candidate) => candidate.playerId === shot.playerId)!;
    player.artillery!.hand.flare -= 1;
    events.push(event(state, "attention.artillery.shell.fired", shot.playerId, {
      playerId: shot.playerId,
      shell: shot.shell,
      center: shot.center,
      remaining: player.artillery!.hand.flare
    }));
    const blockers = (state.chaffs ?? []).filter((chaff) =>
      chaff.ownerPlayerId !== shot.playerId &&
      insideZone(shot.center, chaff.center, artillery.zone.width, artillery.zone.height)
    );
    if (blockers.length > 0) {
      events.push(event(state, "attention.artillery.shell.blocked", shot.playerId, {
        playerId: shot.playerId,
        shell: shot.shell,
        center: shot.center,
        blockerPlayerIds: [...new Set(blockers.map((blocker) => blocker.ownerPlayerId))].sort(),
        chaffIds: blockers.map((blocker) => blocker.chaffId).sort()
      }));
      continue;
    }
    const flareId = `${state.matchId}:artillery-flare:${shot.playerId}:${state.round}`;
    state.flares.push({
      flareId,
      ownerPlayerId: shot.playerId,
      center: { ...shot.center },
      emissionsRemaining: artillery.flareDurationEmissions
    });
    events.push(event(state, "attention.artillery.flare.established", shot.playerId, {
      playerId: shot.playerId,
      flareId,
      center: shot.center,
      startsRound: state.round + 1,
      emissions: artillery.flareDurationEmissions
    }));
  }

  state.chaffs = (state.chaffs ?? [])
    .map((chaff) => ({ ...chaff, artilleryPhasesRemaining: chaff.artilleryPhasesRemaining - 1 }))
    .filter((chaff) => chaff.artilleryPhasesRemaining > 0);
  state.phase = "movement";
  events.push(event(state, "attention.phase.movement", null, { round: state.round }));
  return { match: withState(match, state), events };
}

type AttentionUnitActionsIntent = Extract<AttentionMovementIntent, { kind: "unit-actions" }>;

type ValidatedUapPlan = {
  unitId: string;
  playerId: string;
  actions: AttentionUapAction[];
  origin: AttentionCoordinate;
  destination: AttentionCoordinate;
  moveSteps: number;
  spent: number;
  explicit: boolean;
  nextActiveRange: number | null;
  rangeShiftCount: number;
  supportScans: Array<{ artifactId: string; distance: number }>;
};

function sameCoordinate(left: AttentionCoordinate, right: AttentionCoordinate): boolean {
  return left.x === right.x && left.y === right.y;
}

function validateUapPlan(
  model: InternalModel,
  state: InternalState,
  unitState: AttentionUnitState,
  intent: AttentionUnitActionsIntent
): { plan: ValidatedUapPlan | null; reason: string | null } {
  const uap = model.uap;
  if (!uap || !unitState.uap) return { plan: null, reason: "uap_state_unavailable" };
  const budget = uap.budgets[unitState.chassis];
  if (intent.actions.length > budget) return { plan: null, reason: "uap_budget" };

  const kinds = intent.actions.map((action) => action.kind);
  const usesSpatialAction = kinds.includes("range-shift") || kinds.includes("support-scan");
  if (usesSpatialAction && !model.spatial) return { plan: null, reason: "spatial_not_enabled" };
  if (unitState.chassis === "scout") {
    if (kinds.includes("command-uplink") || kinds.includes("support-scan")) return { plan: null, reason: "chassis_action" };
    const usesReconComponent = kinds.includes("turbo-charge") || kinds.includes("step-up");
    const activeRecon = kinds.length === 3 && kinds[0] === "move" && kinds[1] === "turbo-charge" && kinds[2] === "step-up";
    if (usesReconComponent && !activeRecon) return { plan: null, reason: "scout_sequence" };
  } else if (unitState.chassis === "line") {
    if (kinds.includes("turbo-charge") || kinds.includes("command-uplink")) return { plan: null, reason: "chassis_action" };
    if (kinds.filter((kind) => kind === "step-up").length > 1) return { plan: null, reason: "duplicate_step_up" };
    if (kinds.filter((kind) => kind === "support-scan").length > (model.spatial?.supportScansPerUnit ?? 0)) {
      return { plan: null, reason: "support_scan_limit" };
    }
  } else if (kinds.some((kind) => kind !== "move" && kind !== "command-uplink" && kind !== "range-shift")) {
    return { plan: null, reason: "chassis_action" };
  }

  let cursor = { ...unitState.position };
  let moveSteps = 0;
  let nextActiveRange = unitState.spatial?.activeRange ?? null;
  let rangeShiftCount = 0;
  const supportScans: Array<{ artifactId: string; distance: number }> = [];
  for (const action of intent.actions) {
    if (action.kind === "move") {
      if (!inBounds(model, action.destination)) return { plan: null, reason: "out_of_bounds" };
      if (distance(cursor, action.destination) !== 1) return { plan: null, reason: "move_step" };
      cursor = { ...action.destination };
      moveSteps += 1;
    } else if (action.kind === "range-shift") {
      if (!model.spatial || !unitState.spatial || nextActiveRange === null) return { plan: null, reason: "spatial_state_unavailable" };
      const profile = model.spatial.ranges[unitState.chassis];
      const shifted = nextActiveRange + action.delta;
      if (shifted < profile.minimumRange || shifted > profile.maximumRange) return { plan: null, reason: "range_limit" };
      nextActiveRange = shifted;
      rangeShiftCount += 1;
    } else if (action.kind === "support-scan") {
      if (!model.spatial || !unitState.spatial) return { plan: null, reason: "spatial_state_unavailable" };
      const artifact = state.artifacts.find((candidate) =>
        candidate.artifactId === action.artifactId && candidate.ownerPlayerId === unitState.ownerPlayerId && candidate.resolution === "pending"
      );
      if (!artifact) return { plan: null, reason: "support_scan_target" };
      if (distance(cursor, artifact.position) > unitState.spatial.activeRange) return { plan: null, reason: "support_scan_range" };
      supportScans.push({ artifactId: artifact.artifactId, distance: distance(cursor, artifact.position) });
    }
  }

  return {
    plan: {
      unitId: unitState.unitId,
      playerId: unitState.ownerPlayerId,
      actions: intent.actions,
      origin: { ...unitState.position },
      destination: cursor,
      moveSteps,
      spent: intent.actions.length,
      explicit: true,
      nextActiveRange,
      rangeShiftCount,
      supportScans
    },
    reason: null
  };
}

function resolveAttentionUapMovement(
  match: AttentionMatch,
  intents: AttentionMovementIntent[]
): AttentionTransition {
  const state = cloneState(match);
  const model = modelOf(match.context);
  const uap = model.uap;
  if (!uap) throw new Error(`${ATTENTION_V3_MODEL_VERSION} requires UAP configuration`);
  const events: EventEnvelope[] = [];

  // Stage A emits inside this transition. Spatial stages have already exposed their keyed
  // coordinates through resolveAttentionEmission so controllers can react to them.
  if (!model.spatial) emitArtifacts(match, state, events);

  const canonicalIntents = [...intents].sort((left, right) => {
    const leftUnit = "unitId" in left ? left.unitId : "";
    const rightUnit = "unitId" in right ? right.unitId : "";
    return left.playerId.localeCompare(right.playerId) || leftUnit.localeCompare(rightUnit) ||
      left.kind.localeCompare(right.kind) || JSON.stringify(left).localeCompare(JSON.stringify(right));
  });
  const submissions = new Map<string, Array<Exclude<AttentionMovementIntent, { kind: "end-movement" }>>>();
  for (const intent of canonicalIntents) {
    if (intent.kind === "end-movement") continue;
    const unitState = state.units.find((candidate) =>
      candidate.unitId === intent.unitId && candidate.ownerPlayerId === intent.playerId
    );
    if (!unitState) {
      events.push(event(state, "attention.uap.plan.rejected", intent.playerId, {
        playerId: intent.playerId,
        unitId: intent.unitId,
        reason: "unit_unavailable",
        budget: 0,
        requestedActions: intent.kind === "unit-actions" ? intent.actions.map((action) => action.kind) : ["legacy-move"]
      }));
      continue;
    }
    const entries = submissions.get(unitState.unitId) ?? [];
    entries.push(intent);
    submissions.set(unitState.unitId, entries);
  }

  const plans = new Map<string, ValidatedUapPlan>();
  const rejected = new Map<string, string>();
  const orderedUnits = [...state.units].sort((left, right) => left.unitId.localeCompare(right.unitId));
  for (const unitState of orderedUnits) {
    const entries = submissions.get(unitState.unitId) ?? [];
    if (entries.length > 1) {
      rejected.set(unitState.unitId, "duplicate_unit_intent");
      continue;
    }
    if (entries.length === 0) {
      plans.set(unitState.unitId, {
        unitId: unitState.unitId,
        playerId: unitState.ownerPlayerId,
        actions: [],
        origin: { ...unitState.position },
        destination: { ...unitState.position },
        moveSteps: 0,
        spent: 0,
        explicit: false,
        nextActiveRange: unitState.spatial?.activeRange ?? null,
        rangeShiftCount: 0,
        supportScans: []
      });
      continue;
    }
    const intent = entries[0];
    if (intent.kind === "move") {
      rejected.set(unitState.unitId, "legacy_movement_intent");
      continue;
    }
    const validation = validateUapPlan(model, state, unitState, intent);
    if (!validation.plan) rejected.set(unitState.unitId, validation.reason ?? "invalid_plan");
    else plans.set(unitState.unitId, validation.plan);
  }

  // Resolve final-cell occupancy without player or unit priority. Conflicting contenders all
  // fail, while swaps and closed cycles remain legal as in the legacy simultaneous resolver.
  const movers = new Map(
    [...plans.values()]
      .filter((plan) => plan.moveSteps > 0 && !sameCoordinate(plan.origin, plan.destination))
      .map((plan) => [plan.unitId, plan])
  );
  const byDestination = new Map<string, ValidatedUapPlan[]>();
  for (const plan of movers.values()) {
    const key = coordinateKey(plan.destination);
    const contenders = byDestination.get(key) ?? [];
    contenders.push(plan);
    byDestination.set(key, contenders);
  }
  for (const contenders of byDestination.values()) {
    if (contenders.length < 2) continue;
    for (const contender of contenders) {
      movers.delete(contender.unitId);
      plans.delete(contender.unitId);
      rejected.set(contender.unitId, "destination_conflict");
    }
  }

  let occupancyChanged = true;
  while (occupancyChanged) {
    occupancyChanged = false;
    const stationaryOrigins = new Set(
      state.units.filter((unitState) => !movers.has(unitState.unitId)).map((unitState) => coordinateKey(unitState.position))
    );
    for (const [unitId, plan] of [...movers]) {
      if (!stationaryOrigins.has(coordinateKey(plan.destination))) continue;
      movers.delete(unitId);
      plans.delete(unitId);
      rejected.set(unitId, "occupied");
      occupancyChanged = true;
    }
  }

  for (const unitState of orderedUnits) {
    const reason = rejected.get(unitState.unitId);
    if (!reason) continue;
    const entries = submissions.get(unitState.unitId) ?? [];
    unitState.movementSpent = 0;
    unitState.stationaryStreak = 0;
    unitState.nextEmissionCalibration = null;
    if (unitState.uap) {
      unitState.uap.budget = uap.budgets[unitState.chassis];
      unitState.uap.spent = 0;
      unitState.uap.passiveSettleStreak = 0;
    }
    if (unitState.spatial) unitState.spatial.nextActiveRange = null;
    events.push(event(state, "attention.uap.plan.rejected", unitState.unitId, {
      playerId: unitState.ownerPlayerId,
      unitId: unitState.unitId,
      reason,
      budget: uap.budgets[unitState.chassis],
      requestedActions: entries.flatMap((entry) =>
        entry.kind === "unit-actions" ? entry.actions.map((action) => action.kind) : ["legacy-move"]
      )
    }));
  }

  for (const unitState of orderedUnits) {
    const plan = plans.get(unitState.unitId);
    if (!plan) continue;
    const origin = { ...unitState.position };
    unitState.position = { ...plan.destination };
    unitState.movementSpent = plan.moveSteps;
    unitState.stationaryStreak = plan.moveSteps === 0 ? unitState.stationaryStreak + 1 : 0;
    unitState.nextEmissionCalibration = null;
    unitState.uap!.budget = uap.budgets[unitState.chassis];
    unitState.uap!.spent = plan.spent;
    if (unitState.spatial) {
      const priorRange = unitState.spatial.activeRange;
      unitState.spatial.nextActiveRange = plan.rangeShiftCount > 0 ? plan.nextActiveRange : null;
      if (plan.rangeShiftCount > 0) {
        events.push(event(state, "attention.range-shift.queued", unitState.unitId, {
          playerId: unitState.ownerPlayerId,
          from: priorRange,
          to: plan.nextActiveRange,
          shifts: plan.rangeShiftCount
        }));
      }
    }

    events.push(event(state, "attention.uap.plan.resolved", unitState.unitId, {
      playerId: unitState.ownerPlayerId,
      unitId: unitState.unitId,
      budget: unitState.uap!.budget,
      spent: plan.spent,
      moveSteps: plan.moveSteps,
      deliberateHold: plan.actions.length === 0,
      explicit: plan.explicit,
      actions: plan.actions.map((action) => action.kind)
    }));
    for (const scan of plan.supportScans) {
      const artifact = state.artifacts.find((candidate) => candidate.artifactId === scan.artifactId)!;
      artifact.supportScanUnitIds = [...new Set([...(artifact.supportScanUnitIds ?? []), unitState.unitId])].sort();
      events.push(event(state, "attention.support-scan.applied", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        artifactId: scan.artifactId,
        distance: scan.distance,
        activeRange: unitState.spatial?.activeRange ?? null
      }));
    }
    if (plan.moveSteps > 0) {
      events.push(event(state, "attention.unit.moved", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        from: origin,
        to: unitState.position,
        spent: plan.moveSteps
      }));
    } else {
      events.push(event(state, "attention.unit.stationary", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        chassis: unitState.chassis,
        stationaryStreak: unitState.stationaryStreak,
        deliberateHold: plan.actions.length === 0
      }));
    }

    const actionKinds = plan.actions.map((action) => action.kind);
    const activeRecon = unitState.chassis === "scout" && actionKinds.length === 3 &&
      actionKinds[0] === "move" && actionKinds[1] === "turbo-charge" && actionKinds[2] === "step-up";
    if (unitState.chassis === "scout" && plan.actions.length === 0) {
      unitState.uap!.passiveSettleStreak += 1;
      const level = Math.min(3, unitState.uap!.passiveSettleStreak);
      const calibration = uap.scout.passiveSettleCalibration[level - 1];
      unitState.nextEmissionCalibration = calibration;
      events.push(event(state, "attention.scout.passive-settle.queued", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        level,
        calibration
      }));
      events.push(event(state, "attention.recon-lock.queued", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        calibration,
        source: "passive-settle"
      }));
    } else {
      unitState.uap!.passiveSettleStreak = 0;
    }
    if (activeRecon) {
      unitState.nextEmissionCalibration = uap.scout.activeReconCalibration;
      events.push(event(state, "attention.uap.turbo-charge.executed", unitState.unitId, {
        playerId: unitState.ownerPlayerId
      }));
      events.push(event(state, "attention.uap.step-up.executed", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        chassis: unitState.chassis,
        calibration: uap.scout.activeReconCalibration
      }));
      events.push(event(state, "attention.recon-lock.queued", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        calibration: uap.scout.activeReconCalibration,
        source: "active-recon"
      }));
    } else if (unitState.chassis === "line" && actionKinds.includes("step-up")) {
      unitState.nextEmissionCalibration = uap.line.stepUpCalibration;
      events.push(event(state, "attention.uap.step-up.executed", unitState.unitId, {
        playerId: unitState.ownerPlayerId,
        chassis: unitState.chassis,
        calibration: uap.line.stepUpCalibration
      }));
    } else if (unitState.chassis === "siege" && actionKinds.includes("command-uplink")) {
      unitState.nextEmissionCalibration = uap.siege.uplinkCalibration;
    }
  }

  // Stage A compatibility bridge only. Spatial stages replace passive Target Lock generation
  // with the explicit, artifact-targeted Support Scan action.
  for (const unitState of orderedUnits) {
    const plan = plans.get(unitState.unitId);
    if (model.spatial || unitState.chassis !== "line" || !plan || plan.actions.length !== 0) continue;
    const stationaryQualified = model.extensions.stationaryQualification === "resolved-zero"
      ? true
      : model.extensions.stationaryQualification === "voluntary-hold"
        ? unitState.stationaryStreak >= 2
        : unitState.stationaryStreak >= model.targetLockStreakThreshold;
    if (!stationaryQualified) continue;
    const owner = state.players.find((player) => player.playerId === unitState.ownerPlayerId)!;
    const windfall = unitState.stationaryStreak % model.targetLockStreakThreshold === 0
      ? model.targetLockThresholdTokens
      : 0;
    const generated = model.targetLockTokensPerRound + windfall;
    owner.targetLocks = Math.min(model.targetLockTokenCap, owner.targetLocks + generated);
    events.push(event(state, "attention.target-lock.generated", unitState.unitId, {
      playerId: owner.playerId,
      tokens: generated,
      stationaryStreak: unitState.stationaryStreak,
      source: "stage-a-compatibility-hold"
    }));
  }

  for (const player of state.players) {
    const uplinks = orderedUnits.filter((unitState) => {
      const plan = plans.get(unitState.unitId);
      return unitState.ownerPlayerId === player.playerId && unitState.chassis === "siege" &&
        plan?.actions.some((action) => action.kind === "command-uplink");
    }).length;
    player.queuedUplinkBonus = Math.min(model.uplinkStackLimit, uplinks) * uap.siege.uplinkAttentionBonus;
    if (player.queuedUplinkBonus > 0) {
      events.push(event(state, "attention.command-uplink.queued", player.playerId, {
        playerId: player.playerId,
        attention: player.queuedUplinkBonus,
        units: Math.min(model.uplinkStackLimit, uplinks),
        source: "explicit-uap"
      }));
    }
  }

  state.phase = "capacity";
  events.push(event(state, "attention.phase.capacity", null, { round: state.round, priorityPlayerId: priorityPlayerId(state, match.context) }));
  return { match: withState(match, state), events };
}

export function resolveAttentionMovement(
  match: AttentionMatch,
  intents: AttentionMovementIntent[]
): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "movement") throw new Error(`Cannot move during ${current.phase}`);
  if (current.modelVersion === ATTENTION_V3_MODEL_VERSION) return resolveAttentionUapMovement(match, intents);
  const state = cloneState(match);
  const model = modelOf(match.context);
  const events: EventEnvelope[] = [];
  const requested = new Map<string, { playerId: string; unitId: string; destination: AttentionCoordinate }>();

  for (const intent of intents) {
    if (intent.kind === "end-movement") continue;
    if (intent.kind === "unit-actions") {
      events.push(event(state, "attention.movement.rejected", intent.playerId, { intent, reason: "uap_not_enabled" }));
      continue;
    }
    const mech = state.units.find((unitState) => unitState.unitId === intent.unitId && unitState.ownerPlayerId === intent.playerId);
    const profile = mech ? model.profiles[mech.chassis] : null;
    let reason: string | null = null;
    if (!mech) reason = "unit_unavailable";
    else if (requested.has(mech.unitId)) reason = "duplicate_unit_intent";
    else if (!inBounds(model, intent.destination)) reason = "out_of_bounds";
    else if (distance(mech.position, intent.destination) > profile!.movementRange) reason = "movement_range";
    if (reason) {
      events.push(event(state, "attention.movement.rejected", intent.playerId, { intent, reason }));
      continue;
    }
    requested.set(mech!.unitId, { playerId: intent.playerId, unitId: mech!.unitId, destination: { ...intent.destination } });
  }

  // Moving to the current cell is a deliberate stationary decision, not a vacated origin.
  for (const [unitId, move] of [...requested]) {
    const mech = state.units.find((unitState) => unitState.unitId === unitId)!;
    if (distance(mech.position, move.destination) === 0) requested.delete(unitId);
  }

  const byDestination = new Map<string, Array<{ playerId: string; unitId: string; destination: AttentionCoordinate }>>();
  for (const move of requested.values()) {
    const key = coordinateKey(move.destination);
    const entries = byDestination.get(key) ?? [];
    entries.push(move);
    byDestination.set(key, entries);
  }
  const moving = new Map<string, { playerId: string; unitId: string; destination: AttentionCoordinate }>();
  for (const entries of byDestination.values()) {
    entries.sort((left, right) => comparePriority(state, match.context, left, right));
    moving.set(entries[0].unitId, entries[0]);
    for (const loser of entries.slice(1)) {
      events.push(event(state, "attention.movement.rejected", loser.playerId, { intent: loser, reason: "destination_conflict" }));
    }
  }

  // A unit that does not successfully vacate remains an occupant. Removing a blocked move can make
  // its own origin block another move, so repeat to a fixed point. Closed swaps/cycles survive.
  let changed = true;
  while (changed) {
    changed = false;
    const stationaryOrigins = new Set(
      state.units.filter((unitState) => !moving.has(unitState.unitId)).map((unitState) => coordinateKey(unitState.position))
    );
    for (const [unitId, move] of [...moving]) {
      if (!stationaryOrigins.has(coordinateKey(move.destination))) continue;
      moving.delete(unitId);
      events.push(event(state, "attention.movement.rejected", move.playerId, { intent: move, reason: "occupied" }));
      changed = true;
    }
  }

  for (const mech of state.units) {
    const move = moving.get(mech.unitId);
    const origin = { ...mech.position };
    if (move) mech.position = { ...move.destination };
    mech.movementSpent = move ? distance(origin, move.destination) : 0;
    mech.stationaryStreak = mech.movementSpent === 0 ? mech.stationaryStreak + 1 : 0;
    if (move) events.push(event(state, "attention.unit.moved", mech.unitId, {
      playerId: mech.ownerPlayerId,
      from: origin,
      to: mech.position,
      spent: mech.movementSpent
    }));
    else events.push(event(state, "attention.unit.stationary", mech.unitId, {
      playerId: mech.ownerPlayerId,
      chassis: mech.chassis,
      stationaryStreak: mech.stationaryStreak
    }));
  }

  for (const mech of state.units) {
    if (mech.chassis !== "line" || mech.movementSpent !== 0) continue;
    const owner = state.players.find((player) => player.playerId === mech.ownerPlayerId)!;
    const stationaryQualified = model.extensions.stationaryQualification === "resolved-zero"
      ? true
      : model.extensions.stationaryQualification === "voluntary-hold"
        ? mech.stationaryStreak >= 2
        : mech.stationaryStreak >= model.targetLockStreakThreshold;
    if (!stationaryQualified) {
      events.push(event(state, "attention.target-lock.generated", mech.unitId, {
        playerId: owner.playerId,
        tokens: 0,
        stationaryStreak: mech.stationaryStreak,
        qualified: false
      }));
      continue;
    }
    const windfall = mech.stationaryStreak % model.targetLockStreakThreshold === 0
      ? model.targetLockThresholdTokens
      : 0;
    const generated = model.targetLockTokensPerRound + windfall;
    owner.targetLocks = Math.min(model.targetLockTokenCap, owner.targetLocks + generated);
    events.push(event(state, "attention.target-lock.generated", mech.unitId, {
      playerId: owner.playerId,
      tokens: generated,
      stationaryStreak: mech.stationaryStreak
    }));
  }

  // Emit using the calibration applied at the previous start. The movement decision queues the
  // calibration stored for the following emission, preserving the specification's next-round lag.
  emitArtifacts(match, state, events);
  for (const mech of state.units) {
    mech.nextEmissionCalibration = mech.movementSpent === 0 && mech.chassis === "scout"
      ? model.reconCalibration
      : mech.movementSpent === 0 && mech.chassis === "siege"
        ? model.uplinkCalibration
        : null;
    if (mech.nextEmissionCalibration !== null && mech.chassis === "scout") {
      events.push(event(state, "attention.recon-lock.queued", mech.unitId, {
        playerId: mech.ownerPlayerId,
        calibration: mech.nextEmissionCalibration
      }));
    }
  }
  for (const player of state.players) {
    const uplinks = state.units.filter((unitState) =>
      unitState.ownerPlayerId === player.playerId && unitState.chassis === "siege" && unitState.movementSpent === 0
    ).length;
    player.queuedUplinkBonus = Math.min(model.uplinkStackLimit, uplinks) * model.uplinkAttentionBonus;
    if (player.queuedUplinkBonus > 0) {
      events.push(event(state, "attention.command-uplink.queued", player.playerId, {
        playerId: player.playerId,
        attention: player.queuedUplinkBonus,
        units: Math.min(model.uplinkStackLimit, uplinks)
      }));
    }
  }

  state.phase = "capacity";
  events.push(event(state, "attention.phase.capacity", null, { round: state.round, priorityPlayerId: priorityPlayerId(state, match.context) }));
  return { match: withState(match, state), events };
}

export function resolveAttentionCapacity(
  match: AttentionMatch,
  intents: AttentionCapacityIntent[]
): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "capacity") throw new Error(`Cannot claim capacity during ${current.phase}`);
  const state = cloneState(match);
  const model = modelOf(match.context);
  const events: EventEnvelope[] = [];
  const byPlayer = new Map<string, AttentionCapacityIntent>();
  for (const intent of intents) {
    if (!state.players.some((player) => player.playerId === intent.playerId)) {
      events.push(event(state, "attention.capacity.rejected", intent.playerId, { intent, reason: "player_unavailable" }));
      continue;
    }
    if (byPlayer.has(intent.playerId)) {
      events.push(event(state, "attention.capacity.rejected", intent.playerId, { intent, reason: "attempt_limit" }));
      continue;
    }
    byPlayer.set(intent.playerId, intent);
  }

  const claims = state.players
    .map((player) => byPlayer.get(player.playerId))
    .filter((intent): intent is AttentionCapacityIntent => intent?.kind === "claim-capacity");
  for (const player of state.players) player.claimAttempted = claims.some((intent) => intent.playerId === player.playerId);

  const slot = state.capacityTrack.nextSlot;
  if (slot >= model.capacityCosts.length) {
    for (const intent of claims) events.push(event(state, "attention.capacity.rejected", intent.playerId, { intent, reason: "track_complete" }));
  } else {
    const cost = model.capacityCosts[slot];
    const eligible = claims.filter((intent) => {
      const player = state.players.find((candidate) => candidate.playerId === intent.playerId)!;
      if (player.attention >= cost) return true;
      events.push(event(state, "attention.capacity.rejected", intent.playerId, { intent, reason: "attention", cost }));
      return false;
    }).sort((left, right) => comparePriority(state, match.context, left, right));
    const winner = eligible[0];
    if (winner) {
      const award = model.capacityAwards[slot];
      const beneficiaries = model.extensions.capacityTopology === "shared-exclusive"
        ? [winner]
        : eligible;
      const paid = new Set<string>();
      for (const [index, beneficiary] of beneficiaries.entries()) {
        const player = state.players.find((candidate) => candidate.playerId === beneficiary.playerId)!;
        const attentionPaid = index === 0 || model.extensions.capacityTopology === "independent-tracks" ? cost : 0;
        if (player.attention < attentionPaid) {
          events.push(event(state, "attention.capacity.rejected", beneficiary.playerId, {
            intent: beneficiary,
            reason: "attention",
            cost: attentionPaid,
            topology: model.extensions.capacityTopology
          }));
          continue;
        }
        player.attention -= attentionPaid;
        player.capacityBonus += award;
        player.claimCount += 1;
        paid.add(player.playerId);
        state.capacityTrack.claims.push({
          slotIndex: slot,
          playerId: player.playerId,
          round: state.round,
          attentionPaid,
          capacityAward: award
        });
        events.push(event(state, "attention.capacity.claimed", player.playerId, {
          slot: slot + 1,
          cost: attentionPaid,
          award,
          topology: model.extensions.capacityTopology,
          copied: index > 0 && model.extensions.capacityTopology === "pioneer-copy"
        }));
      }
      state.capacityTrack.nextSlot += 1;
      if (model.extensions.capacityTopology === "shared-exclusive") {
        for (const loser of eligible.slice(1)) {
          events.push(event(state, "attention.capacity.rejected", loser.playerId, { intent: loser, reason: "priority_conflict", cost }));
        }
      } else {
        for (const candidate of eligible) {
          if (!paid.has(candidate.playerId)) {
            events.push(event(state, "attention.capacity.rejected", candidate.playerId, {
              intent: candidate,
              reason: "capacity_copy_unavailable",
              topology: model.extensions.capacityTopology
            }));
          }
        }
      }
    }
  }

  state.phase = "command";
  events.push(event(state, "attention.phase.command", null, { round: state.round }));
  return { match: withState(match, state), events };
}

function rejectCommand(state: InternalState, intent: AttentionCommandIntent, reason: string): EventEnvelope {
  return event(state, "attention.command.rejected", intent.playerId, { intent, reason });
}

function ownedPendingArtifact(state: InternalState, playerId: string, artifactId: string): AttentionArtifactState | null {
  return state.artifacts.find((artifact) =>
    artifact.artifactId === artifactId && artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  ) ?? null;
}

function abilityRank(state: InternalState, player: AttentionPlayerState, model: InternalModel): number {
  if (model.extensions.abilityUnlockBasis === "global-rank") return state.capacityTrack.nextSlot;
  if (model.extensions.abilityUnlockBasis === "owned-rank") return player.capacityBonus;
  return player.claimCount;
}

function applyCommand(match: AttentionMatch, intent: AttentionCommandIntent): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "command") throw new Error(`Cannot command during ${current.phase}`);
  const state = cloneState(match);
  const model = modelOf(match.context);
  const events: EventEnvelope[] = [];
  const player = state.players.find((candidate) => candidate.playerId === intent.playerId);
  if (!player) return { match: withState(match, state), events: [rejectCommand(state, intent, "player_unavailable")] };
  if (intent.kind === "end-command") {
    events.push(event(state, "attention.command.ended", player.playerId, { round: state.round }));
    return { match: withState(match, state), events };
  }

  if (intent.kind === "overclock") {
    if (abilityRank(state, player, model) < model.overclockUnlockRank) events.push(rejectCommand(state, intent, "ability_locked"));
    else if (model.overclockMaxUses === 0 || player.overclockUsed) events.push(rejectCommand(state, intent, "uses_exhausted"));
    else {
      player.overclockUsed = true;
      player.overclockActive = true;
      events.push(event(state, "attention.overclock.activated", player.playerId, { round: state.round }));
    }
    return { match: withState(match, state), events };
  }

  if (intent.kind === "macro-flare") {
    if (model.artillery) events.push(rejectCommand(state, intent, "replaced_by_artillery"));
    else if (abilityRank(state, player, model) < model.flareUnlockRank) events.push(rejectCommand(state, intent, "ability_locked"));
    else if (model.flareMaxUses === 0 || player.flareUsed) events.push(rejectCommand(state, intent, "uses_exhausted"));
    else if (!inBounds(model, intent.center)) events.push(rejectCommand(state, intent, "out_of_bounds"));
    else if (!state.units.some((unitState) =>
      unitState.ownerPlayerId === player.playerId && distance(unitState.position, intent.center) <= model.flareRange
    )) events.push(rejectCommand(state, intent, "out_of_range"));
    else {
      player.flareUsed = true;
      state.flares.push({
        flareId: `${state.matchId}:flare:${player.playerId}:${state.round}`,
        ownerPlayerId: player.playerId,
        center: { ...intent.center },
        emissionsRemaining: model.flareDurationEmissions
      });
      events.push(event(state, "attention.macro-flare.deployed", player.playerId, { center: intent.center, startsRound: state.round + 1, emissions: model.flareDurationEmissions }));
    }
    return { match: withState(match, state), events };
  }

  const artifact = ownedPendingArtifact(state, player.playerId, "artifactId" in intent ? intent.artifactId : "");
  if (!artifact) return { match: withState(match, state), events: [rejectCommand(state, intent, "artifact_unavailable")] };

  if (intent.kind === "perfect-focus") {
    if (abilityRank(state, player, model) < model.focusUnlockRank) events.push(rejectCommand(state, intent, "ability_locked"));
    else if (player.focusUses >= model.focusMaxUses) events.push(rejectCommand(state, intent, "uses_exhausted"));
    else if (state.round < player.focusNextReadyRound) events.push(rejectCommand(state, intent, "cooldown"));
    else if (artifact.guarantee !== null) events.push(rejectCommand(state, intent, "already_guaranteed"));
    else {
      artifact.guarantee = "perfect-focus";
      artifact.guaranteedById = player.playerId;
      player.focusUses += 1;
      player.focusNextReadyRound = state.round + model.focusCooldownRounds;
      events.push(event(state, "attention.perfect-focus.applied", player.playerId, { artifactId: artifact.artifactId, nextReadyRound: player.focusNextReadyRound }));
    }
    return { match: withState(match, state), events };
  }

  if (intent.kind === "target-lock") {
    const source = state.units.find((unitState) =>
      unitState.unitId === intent.sourceUnitId && unitState.ownerPlayerId === player.playerId && unitState.chassis === "line"
    );
    const targetSource = state.units.find((unitState) => unitState.unitId === artifact.sourceUnitId);
    if (model.spatial) events.push(rejectCommand(state, intent, "replaced_by_support_scan"));
    else if (artifact.revealed) events.push(rejectCommand(state, intent, "already_verified"));
    else if (player.targetLocks < 1) events.push(rejectCommand(state, intent, "token_unavailable"));
    else if (!source) events.push(rejectCommand(state, intent, "source_unavailable"));
    else if (source.unitId === artifact.sourceUnitId) events.push(rejectCommand(state, intent, "self_assist"));
    else if (!targetSource || distance(source.position, artifact.position) > model.interactionRange) events.push(rejectCommand(state, intent, "out_of_range"));
    else if (artifact.guarantee !== null) events.push(rejectCommand(state, intent, "already_guaranteed"));
    else {
      player.targetLocks -= 1;
      artifact.guarantee = "target-lock";
      artifact.guaranteedById = source.unitId;
      events.push(event(state, "attention.target-lock.applied", source.unitId, { artifactId: artifact.artifactId, playerId: player.playerId }));
    }
    return { match: withState(match, state), events };
  }

  if (intent.kind === "verify") {
    const localUnits = model.spatial
      ? state.units
        .filter((unitState) =>
          unitState.ownerPlayerId === player.playerId &&
          distance(unitState.position, artifact.position) <= model.spatial!.verificationReach
        )
        .sort((left, right) =>
          distance(left.position, artifact.position) - distance(right.position, artifact.position) ||
          left.unitId.localeCompare(right.unitId)
        )
      : [];
    const supportScanUnitIds = model.spatial
      ? (artifact.supportScanUnitIds ?? []).filter((unitId) =>
        state.units.some((unitState) => unitState.unitId === unitId && unitState.ownerPlayerId === player.playerId)
      ).sort()
      : [];
    const verificationMode = localUnits.length > 0
      ? "local" as const
      : supportScanUnitIds.length > 0
        ? "support-scan" as const
        : null;
    const verifierUnitId = localUnits[0]?.unitId ?? supportScanUnitIds[0] ?? null;
    if (artifact.revealed) events.push(rejectCommand(state, intent, "already_verified"));
    else if (model.spatial && !verificationMode) events.push(rejectCommand(state, intent, "out_of_range"));
    else if (player.attention < model.verifyCost) events.push(rejectCommand(state, intent, "attention"));
    else {
      player.attention -= model.verifyCost;
      artifact.revealed = true;
      events.push(event(state, "attention.artifact.verified", player.playerId, {
        artifactId: artifact.artifactId,
        sound: artifact.sound,
        cost: model.verifyCost,
        ...(model.spatial ? { verificationMode, verifierUnitId } : {})
      }));
    }
  } else if (intent.kind === "accept") {
    artifact.resolution = "accepted";
    events.push(event(state, "attention.artifact.accepted", player.playerId, { artifactId: artifact.artifactId, explicit: true }));
  } else if (intent.kind === "reject") {
    artifact.resolution = "rejected";
    events.push(event(state, "attention.artifact.rejected", player.playerId, { artifactId: artifact.artifactId }));
  } else if (intent.kind === "seize") {
    const source = state.units.find((unitState) => unitState.unitId === artifact.sourceUnitId)!;
    const cost = Math.max(0, model.profiles[source.chassis].seizeCost - (player.overclockActive ? model.overclockDiscount : 0));
    if (player.attention < cost) events.push(rejectCommand(state, intent, "attention"));
    else {
      player.attention -= cost;
      artifact.resolution = "seized";
      events.push(event(state, "attention.artifact.seized", player.playerId, { artifactId: artifact.artifactId, cost }));
    }
  }
  return { match: withState(match, state), events };
}

/**
 * Capacity is simultaneous and therefore supplied as a batch. Other command intents are singular so
 * callers can project again after every verification or rejection.
 */
export function applyAttentionIntent(
  match: AttentionMatch,
  intent: AttentionIntent | AttentionCapacityIntent[]
): AttentionTransition {
  if (Array.isArray(intent)) return resolveAttentionCapacity(match, intent);
  if (intent.kind === "fire-artillery" || intent.kind === "pass-artillery") {
    throw new Error("Artillery intents must be supplied together to resolveAttentionArtillery");
  }
  if (intent.kind === "move" || intent.kind === "unit-actions" || intent.kind === "end-movement") {
    throw new Error("Movement intents must be supplied together to resolveAttentionMovement");
  }
  if (intent.kind === "claim-capacity" || intent.kind === "pass-capacity") {
    throw new Error("Capacity intents must be supplied together to resolveAttentionCapacity");
  }
  return applyCommand(match, intent as AttentionCommandIntent);
}

function compareTiebreak(left: AttentionPlayerState, right: AttentionPlayerState): number {
  if (left.progress !== right.progress) return left.progress - right.progress;
  if (left.drift !== right.drift) return right.drift - left.drift;
  return left.attention - right.attention;
}

function finishMatch(state: InternalState, reason: "objective" | "drift" | "round-limit" | "simultaneous"): void {
  const [left, right] = state.players;
  const leftDefeated = left.status === "defeat";
  const rightDefeated = right.status === "defeat";
  let winner: AttentionPlayerState | null = null;
  if (leftDefeated !== rightDefeated) winner = leftDefeated ? right : left;
  else if (left.status === "victory" && right.status !== "victory") winner = left;
  else if (right.status === "victory" && left.status !== "victory") winner = right;
  else {
    const comparison = compareTiebreak(left, right);
    winner = comparison > 0 ? left : comparison < 0 ? right : null;
  }
  state.status = "complete";
  state.winnerPlayerId = winner?.playerId ?? null;
  state.terminalReason = reason;
  if (winner) {
    winner.status = "victory";
    for (const player of state.players) if (player !== winner) player.status = "defeat";
  } else {
    for (const player of state.players) player.status = "draw";
  }
  state.phase = "terminal";
}

export function resolveAttentionRound(match: AttentionMatch): AttentionTransition {
  const current = stateOf(match);
  if (current.phase !== "command" && current.phase !== "resolution") {
    throw new Error(`Cannot resolve round during ${current.phase}`);
  }
  const state = cloneState(match);
  const model = modelOf(match.context);
  const scenario = scenarioOf(match.context);
  const events: EventEnvelope[] = [];
  state.phase = "resolution";
  const attentionUnused = new Map(state.players.map((player) => [player.playerId, player.attention]));

  // Resolve every artifact for both sides before checking terminal state. Neither player gains an
  // ordering advantage when both cross a threshold in the same round.
  for (const artifact of state.artifacts) {
    if (artifact.resolution === "pending" && model.spatial) {
      const friendlyDistances = state.units
        .filter((unitState) => unitState.ownerPlayerId === artifact.ownerPlayerId)
        .map((unitState) => distance(unitState.position, artifact.position));
      const nearestDistance = friendlyDistances.length > 0 ? Math.min(...friendlyDistances) : null;
      const supportScanned = (artifact.supportScanUnitIds?.length ?? 0) > 0;
      const beyondReach = !supportScanned &&
        (nearestDistance === null || nearestDistance > model.spatial.verificationReach);
      events.push(event(state, "attention.spatial.artifact.auto-accepted", artifact.ownerPlayerId, {
        playerId: artifact.ownerPlayerId,
        artifactId: artifact.artifactId,
        beyondReach,
        nearestDistance,
        supportScanned
      }));
    }
    if (artifact.resolution === "pending") artifact.resolution = "accepted";
    const player = state.players.find((candidate) => candidate.playerId === artifact.ownerPlayerId)!;
    if (artifact.resolution === "rejected") continue;
    if (artifact.resolution === "seized") {
      if (artifact.objectiveEligible) player.progress += 1;
      events.push(event(state, "attention.artifact.resolved.seized", player.playerId, {
        artifactId: artifact.artifactId,
        objectiveEligible: artifact.objectiveEligible
      }));
      continue;
    }
    const effectiveSound = artifact.sound || artifact.guarantee !== null;
    if (effectiveSound) {
      if (artifact.objectiveEligible) player.progress += 1;
    } else {
      // Unsound accepted work always drifts, even when it was emitted outside the active front.
      const driftBefore = player.drift;
      player.drift += 1;
      events.push(event(state, "attention.artifact.resolved.unsound", player.playerId, {
        artifactId: artifact.artifactId,
        latentSound: artifact.sound,
        guarantee: artifact.guarantee,
        objectiveEligible: artifact.objectiveEligible,
        driftBefore,
        driftAfter: player.drift
      }));
      continue;
    }
    events.push(event(state, "attention.artifact.resolved.sound", player.playerId, {
      artifactId: artifact.artifactId,
      latentSound: artifact.sound,
      guarantee: artifact.guarantee,
      objectiveEligible: artifact.objectiveEligible
    }));
  }

  for (const player of state.players) {
    // Drift defeats progress when both thresholds are reached in the same resolution.
    player.status = player.drift >= model.driftLimit
      ? "defeat"
      : player.progress >= model.objectiveTarget
        ? "victory"
        : "active";
  }

  const terminalPlayers = state.players.filter((player) => player.status !== "active");
  const atRoundLimit = state.round >= scenario.roundLimit;
  if (terminalPlayers.length > 0 || atRoundLimit) {
    const bilateral = terminalPlayers.length === state.players.length;
    const reason = terminalPlayers.length === 0
      ? "round-limit"
      : bilateral
        ? "simultaneous"
        : terminalPlayers[0].status === "defeat"
          ? "drift"
          : "objective";
    finishMatch(state, reason);
  } else {
    // Stationary effects were queued when movement closed. Apply them at the new round boundary,
    // then clear the one-emission/one-round queues.
    for (const player of state.players) {
      player.attention = player.baseAttention + player.capacityBonus + player.queuedUplinkBonus;
      player.queuedUplinkBonus = 0;
      player.claimAttempted = false;
      player.overclockActive = false;
    }
    for (const unitState of state.units) {
      unitState.movementSpent = 0;
      unitState.emissionCalibration = unitState.nextEmissionCalibration ?? model.profiles[unitState.chassis].calibration;
      unitState.nextEmissionCalibration = null;
      if (unitState.uap) unitState.uap.spent = 0;
      if (unitState.spatial) {
        unitState.spatial.activeRange = unitState.spatial.nextActiveRange ?? unitState.spatial.activeRange;
        unitState.spatial.nextActiveRange = null;
      }
    }
    state.artifacts = [];
    state.round += 1;
    state.phase = model.spatial ? "emission" : "movement";
  }

  events.push(event(state, "attention.round.resolved", null, {
    completedRound: current.round,
    nextRound: state.round,
    status: state.status,
    winnerPlayerId: state.winnerPlayerId,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      progress: player.progress,
      drift: player.drift,
      attention: player.attention,
      attentionUnused: attentionUnused.get(player.playerId) ?? 0,
      nextAttention: state.status === "active" ? player.attention : null,
      status: player.status
    }))
  }));
  return { match: withState(match, state), events };
}

function emptyCounters(): AttentionSimulationCounters {
  return {
    attentionAvailable: 0,
    attentionSpent: 0,
    attentionUnused: 0,
    attentionBindingRounds: 0,
    artifactsEmitted: 0,
    minimumAttentionToArtifactRatio: 0,
    verified: 0,
    acceptedSound: 0,
    acceptedUnsound: 0,
    rejected: 0,
    seized: 0,
    assisted: 0,
    movementDistance: 0,
    stationaryTurns: 0,
    reconLockActivations: 0,
    targetLocksGenerated: 0,
    targetLocksConsumed: 0,
    uplinkAttentionGenerated: 0,
    capacityAttentionSpent: 0,
    capacityClaims: 0,
    perfectFocusUses: 0,
    overclockUses: 0,
    macroFlareUses: 0,
    flareAffectedArtifacts: 0,
    driftDefeatsInduced: 0,
    driftFourSurvivals: 0,
    driftFiveDefeats: 0
  };
}

function emptyUapCounters(): AttentionUapSimulationCounters {
  return {
    available: 0,
    spent: 0,
    plansAccepted: 0,
    plansRejected: 0,
    moveSteps: 0,
    turboCharges: 0,
    stepUps: 0,
    passiveSettles: 0,
    uplinks: 0
  };
}

function emptySpatialCounters(): AttentionSpatialSimulationCounters {
  return {
    artifactsSpawned: 0,
    artifactDistanceTotal: 0,
    rangeShifts: 0,
    supportScans: 0,
    localVerifications: 0,
    supportScanVerifications: 0,
    outOfRangeVerificationRejections: 0,
    autoAcceptedBeyondReach: 0
  };
}

function emptyArtilleryCounters(): AttentionArtillerySimulationCounters {
  return {
    shellsFired: 0,
    flareShellsFired: 0,
    chaffShellsFired: 0,
    flareShellsEstablished: 0,
    hostileShellsBlocked: 0,
    ownShellsBlocked: 0
  };
}

type CounterContext = {
  players: Record<string, AttentionSimulationCounters>;
  uap: Record<string, AttentionUapSimulationCounters> | null;
  spatial: Record<string, AttentionSpatialSimulationCounters> | null;
  artillery: Record<string, AttentionArtillerySimulationCounters> | null;
  flareOwnersByArtifact: Map<string, string[]>;
  driftLimit: number;
  roundDriftByVictim: Map<string, {
    start: number;
    totalUnsound: number;
    flareAddedUnsoundByOwner: Map<string, number>;
  }>;
  roundStartingAttention: Map<string, number>;
  roundArtifacts: Map<string, number>;
  ratioObserved: Set<string>;
};

function playerCounters(context: CounterContext, playerId: unknown): AttentionSimulationCounters | null {
  return typeof playerId === "string" ? context.players[playerId] ?? null : null;
}

function playerUapCounters(context: CounterContext, playerId: unknown): AttentionUapSimulationCounters | null {
  return typeof playerId === "string" ? context.uap?.[playerId] ?? null : null;
}

function playerSpatialCounters(context: CounterContext, playerId: unknown): AttentionSpatialSimulationCounters | null {
  return typeof playerId === "string" ? context.spatial?.[playerId] ?? null : null;
}

function playerArtilleryCounters(context: CounterContext, playerId: unknown): AttentionArtillerySimulationCounters | null {
  return typeof playerId === "string" ? context.artillery?.[playerId] ?? null : null;
}

function countEvent(context: CounterContext, item: EventEnvelope): void {
  const data = item.data;
  const actor = playerCounters(context, item.actorId);
  switch (item.eventType) {
    case "attention.uap.plan.resolved": {
      const owner = playerUapCounters(context, data.playerId);
      if (owner) {
        owner.available += typeof data.budget === "number" ? data.budget : 0;
        owner.spent += typeof data.spent === "number" ? data.spent : 0;
        owner.moveSteps += typeof data.moveSteps === "number" ? data.moveSteps : 0;
        owner.plansAccepted += 1;
      }
      break;
    }
    case "attention.uap.plan.rejected": {
      const owner = playerUapCounters(context, data.playerId);
      if (owner) {
        owner.available += typeof data.budget === "number" ? data.budget : 0;
        owner.plansRejected += 1;
      }
      break;
    }
    case "attention.uap.turbo-charge.executed": {
      const owner = playerUapCounters(context, data.playerId);
      if (owner) owner.turboCharges += 1;
      break;
    }
    case "attention.uap.step-up.executed": {
      const owner = playerUapCounters(context, data.playerId);
      if (owner) owner.stepUps += 1;
      break;
    }
    case "attention.scout.passive-settle.queued": {
      const owner = playerUapCounters(context, data.playerId);
      if (owner) owner.passiveSettles += 1;
      break;
    }
    case "attention.artifacts.emitted": {
      const owner = playerCounters(context, data.playerId);
      const count = typeof data.count === "number" ? data.count : 0;
      if (owner && typeof data.playerId === "string") {
        owner.artifactsEmitted += count;
        context.roundArtifacts.set(data.playerId, (context.roundArtifacts.get(data.playerId) ?? 0) + count);
      }
      if (data.spatial === true) {
        const spatial = playerSpatialCounters(context, data.playerId);
        if (spatial) {
          spatial.artifactsSpawned += count;
          spatial.artifactDistanceTotal += Array.isArray(data.artifactDistances)
            ? data.artifactDistances.reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0)
            : 0;
        }
      }
      const flareOwners = Array.isArray(data.flareOwnerIds)
        ? data.flareOwnerIds.filter((value): value is string => typeof value === "string")
        : [];
      for (const flareOwner of flareOwners) {
        const counters = playerCounters(context, flareOwner);
        if (counters) counters.flareAffectedArtifacts += count;
      }
      const causalOwners = Array.isArray(data.causalFlareOwnerIds)
        ? data.causalFlareOwnerIds.filter((value): value is string => typeof value === "string")
        : [];
      if (Array.isArray(data.flareAddedArtifactIds) && causalOwners.length > 0) {
        for (const artifactId of data.flareAddedArtifactIds) {
          if (typeof artifactId === "string") context.flareOwnersByArtifact.set(artifactId, causalOwners);
        }
      }
      break;
    }
    case "attention.phase.capacity": {
      for (const playerId of Object.keys(context.players)) {
        const emitted = context.roundArtifacts.get(playerId) ?? 0;
        if (emitted <= 0) continue;
        const ratio = (context.roundStartingAttention.get(playerId) ?? 0) / emitted;
        const counters = context.players[playerId];
        if (!context.ratioObserved.has(playerId) || ratio < counters.minimumAttentionToArtifactRatio) {
          counters.minimumAttentionToArtifactRatio = ratio;
        }
        context.ratioObserved.add(playerId);
        context.roundArtifacts.set(playerId, 0);
      }
      break;
    }
    case "attention.artifact.verified":
      if (actor) {
        actor.verified += 1;
        actor.attentionSpent += typeof data.cost === "number" ? data.cost : 0;
      }
      if (data.verificationMode === "local") {
        const spatial = playerSpatialCounters(context, item.actorId);
        if (spatial) spatial.localVerifications += 1;
      } else if (data.verificationMode === "support-scan") {
        const spatial = playerSpatialCounters(context, item.actorId);
        if (spatial) spatial.supportScanVerifications += 1;
      }
      break;
    case "attention.command.rejected": {
      const rawIntent = data.intent;
      if (data.reason === "out_of_range" && rawIntent && typeof rawIntent === "object" &&
        (rawIntent as Record<string, unknown>).kind === "verify") {
        const spatial = playerSpatialCounters(context, item.actorId);
        if (spatial) spatial.outOfRangeVerificationRejections += 1;
      }
      break;
    }
    case "attention.range-shift.queued": {
      const spatial = playerSpatialCounters(context, data.playerId);
      if (spatial) spatial.rangeShifts += typeof data.shifts === "number" ? data.shifts : 0;
      break;
    }
    case "attention.support-scan.applied": {
      const spatial = playerSpatialCounters(context, data.playerId);
      if (spatial) spatial.supportScans += 1;
      break;
    }
    case "attention.spatial.artifact.auto-accepted": {
      const spatial = playerSpatialCounters(context, data.playerId);
      if (spatial && data.beyondReach === true) spatial.autoAcceptedBeyondReach += 1;
      break;
    }
    case "attention.artillery.shell.fired": {
      const artilleryCounters = playerArtilleryCounters(context, data.playerId);
      if (artilleryCounters) {
        artilleryCounters.shellsFired += 1;
        if (data.shell === "flare") artilleryCounters.flareShellsFired += 1;
        else if (data.shell === "chaff") artilleryCounters.chaffShellsFired += 1;
      }
      break;
    }
    case "attention.artillery.flare.established": {
      const artilleryCounters = playerArtilleryCounters(context, data.playerId);
      if (artilleryCounters) artilleryCounters.flareShellsEstablished += 1;
      break;
    }
    case "attention.artillery.shell.blocked": {
      const firing = playerArtilleryCounters(context, data.playerId);
      if (firing) firing.ownShellsBlocked += 1;
      if (Array.isArray(data.blockerPlayerIds)) {
        for (const blockerPlayerId of data.blockerPlayerIds) {
          const blocking = playerArtilleryCounters(context, blockerPlayerId);
          if (blocking) blocking.hostileShellsBlocked += 1;
        }
      }
      break;
    }
    case "attention.artifact.rejected":
      if (actor) actor.rejected += 1;
      break;
    case "attention.artifact.seized":
      if (actor) actor.attentionSpent += typeof data.cost === "number" ? data.cost : 0;
      break;
    case "attention.artifact.resolved.seized":
      if (actor) actor.seized += 1;
      break;
    case "attention.artifact.resolved.sound":
      if (actor) actor.acceptedSound += 1;
      break;
    case "attention.artifact.resolved.unsound": {
      if (actor) actor.acceptedUnsound += 1;
      const artifactId = typeof data.artifactId === "string" ? data.artifactId : null;
      const driftBefore = typeof data.driftBefore === "number" ? data.driftBefore : null;
      if (artifactId && typeof item.actorId === "string" && driftBefore !== null) {
        const roundDrift = context.roundDriftByVictim.get(item.actorId) ?? {
          start: driftBefore,
          totalUnsound: 0,
          flareAddedUnsoundByOwner: new Map<string, number>()
        };
        roundDrift.totalUnsound += 1;
        const owners = context.flareOwnersByArtifact.get(artifactId) ?? [];
        for (const owner of owners) {
          if (owner === item.actorId) continue;
          roundDrift.flareAddedUnsoundByOwner.set(
            owner,
            (roundDrift.flareAddedUnsoundByOwner.get(owner) ?? 0) + 1
          );
        }
        context.roundDriftByVictim.set(item.actorId, roundDrift);
      }
      break;
    }
    case "attention.unit.moved": {
      const owner = playerCounters(context, data.playerId);
      if (owner) owner.movementDistance += typeof data.spent === "number" ? data.spent : 0;
      break;
    }
    case "attention.unit.stationary": {
      const owner = playerCounters(context, data.playerId);
      if (owner) owner.stationaryTurns += 1;
      break;
    }
    case "attention.recon-lock.queued": {
      const owner = playerCounters(context, data.playerId);
      if (owner) owner.reconLockActivations += 1;
      break;
    }
    case "attention.target-lock.generated": {
      const owner = playerCounters(context, data.playerId);
      if (owner) owner.targetLocksGenerated += typeof data.tokens === "number" ? data.tokens : 0;
      break;
    }
    case "attention.target-lock.applied": {
      const owner = playerCounters(context, data.playerId);
      if (owner) {
        owner.targetLocksConsumed += 1;
        owner.assisted += 1;
      }
      break;
    }
    case "attention.command-uplink.queued": {
      const owner = playerCounters(context, data.playerId);
      if (owner) {
        owner.uplinkAttentionGenerated += typeof data.attention === "number" ? data.attention : 0;
        const uapCounters = playerUapCounters(context, data.playerId);
        if (uapCounters && data.source === "explicit-uap") uapCounters.uplinks += typeof data.units === "number" ? data.units : 0;
      }
      break;
    }
    case "attention.capacity.claimed":
      if (actor) {
        const cost = typeof data.cost === "number" ? data.cost : 0;
        actor.attentionSpent += cost;
        actor.capacityAttentionSpent += cost;
        actor.capacityClaims += 1;
      }
      break;
    case "attention.perfect-focus.applied":
      if (actor) actor.perfectFocusUses += 1;
      break;
    case "attention.overclock.activated":
      if (actor) actor.overclockUses += 1;
      break;
    case "attention.macro-flare.deployed":
      if (actor) actor.macroFlareUses += 1;
      break;
    case "attention.round.resolved": {
      for (const [victimId, roundDrift] of context.roundDriftByVictim) {
        const finalDrift = roundDrift.start + roundDrift.totalUnsound;
        if (roundDrift.start >= context.driftLimit || finalDrift < context.driftLimit) continue;
        for (const [ownerId, flareAddedUnsound] of roundDrift.flareAddedUnsoundByOwner) {
          // The Flare is causal only if this player would remain below the
          // threshold after removing that owner's additional unsound output.
          if (finalDrift - flareAddedUnsound >= context.driftLimit || ownerId === victimId) continue;
          const inducing = playerCounters(context, ownerId);
          if (inducing) inducing.driftDefeatsInduced += 1;
        }
      }
      context.roundDriftByVictim.clear();
      if (!Array.isArray(data.players)) break;
      for (const raw of data.players) {
        if (!raw || typeof raw !== "object") continue;
        const snapshot = raw as Record<string, unknown>;
        const counters = playerCounters(context, snapshot.playerId);
        if (!counters) continue;
        if (snapshot.drift === 4 && snapshot.status === "active") counters.driftFourSurvivals = (counters.driftFourSurvivals ?? 0) + 1;
        if (typeof snapshot.drift === "number" && snapshot.drift >= 5 && snapshot.status === "defeat") {
          counters.driftFiveDefeats = (counters.driftFiveDefeats ?? 0) + 1;
        }
        const unused = typeof snapshot.attentionUnused === "number" ? snapshot.attentionUnused : 0;
        counters.attentionUnused += unused;
        if (unused === 0) counters.attentionBindingRounds += 1;
        if (typeof snapshot.nextAttention === "number") {
          counters.attentionAvailable += snapshot.nextAttention;
          if (typeof snapshot.playerId === "string") {
            context.roundStartingAttention.set(snapshot.playerId, snapshot.nextAttention);
          }
        }
      }
      break;
    }
  }
}

export function runAttentionMatch(
  setup: AttentionMatchSetup | AttentionMatch,
  controllers: Record<string, AttentionController>,
  options: { traceMode?: AttentionTraceMode; maxOperations?: number } = {}
): AttentionRunResult {
  let match = "state" in setup ? setup : createAttentionMatch(setup);
  const traceMode = options.traceMode ?? "summary";
  const fullEvents: EventEnvelope[] | null = traceMode === "full" ? [] : null;
  const eventHash = createHash("sha256");
  eventHash.update("[");
  let eventCount = 0;
  const eventTypes: Record<string, number> = {};
  const runModel = modelOf(match.context);
  const counterContext: CounterContext = {
    players: Object.fromEntries(stateOf(match).players.map((player) => [player.playerId, emptyCounters()])),
    uap: stateOf(match).modelVersion === ATTENTION_V3_MODEL_VERSION
      ? Object.fromEntries(stateOf(match).players.map((player) => [player.playerId, emptyUapCounters()]))
      : null,
    spatial: runModel.spatial
      ? Object.fromEntries(stateOf(match).players.map((player) => [player.playerId, emptySpatialCounters()]))
      : null,
    artillery: runModel.artillery
      ? Object.fromEntries(stateOf(match).players.map((player) => [player.playerId, emptyArtilleryCounters()]))
      : null,
    flareOwnersByArtifact: new Map(),
    driftLimit: runModel.driftLimit,
    roundDriftByVictim: new Map(),
    roundStartingAttention: new Map(stateOf(match).players.map((player) => [player.playerId, player.attention])),
    roundArtifacts: new Map(),
    ratioObserved: new Set()
  };
  for (const player of stateOf(match).players) counterContext.players[player.playerId].attentionAvailable = player.attention;
  const maxOperations = options.maxOperations ?? 10_000;
  let operations = 0;
  const add = (transition: AttentionTransition) => {
    match = transition.match;
    for (const item of transition.events) {
      eventHash.update(`${eventCount > 0 ? "," : ""}${JSON.stringify(item)}`);
      eventCount += 1;
      eventTypes[item.eventType] = (eventTypes[item.eventType] ?? 0) + 1;
      countEvent(counterContext, item);
      fullEvents?.push(item);
    }
  };

  while (stateOf(match).status === "active") {
    if (stateOf(match).phase === "emission") add(resolveAttentionEmission(match));
    if (stateOf(match).phase === "artillery") {
      const declarations = stateOf(match).players.map((player) => {
        const controller = controllers[player.playerId];
        if (!controller) throw new Error(`Missing controller for ${player.playerId}`);
        const decision = controller.artillery?.(
          projectAttentionMatch(match, player.playerId)
        );
        if (decision && decision.playerId !== player.playerId) {
          throw new Error(`Controller ${player.playerId} attempted to fire artillery for another player`);
        }
        return decision ?? { kind: "pass-artillery" as const, playerId: player.playerId };
      });
      operations += declarations.length;
      add(resolveAttentionArtillery(match, declarations));
    }
    const state = stateOf(match);
    const movement: AttentionMovementIntent[] = [];
    for (const player of state.players) {
      const controller = controllers[player.playerId];
      if (!controller) throw new Error(`Missing controller for ${player.playerId}`);
      const decisions = controller.movement(projectAttentionMatch(match, player.playerId));
      if (decisions.some((decision) => decision.playerId !== player.playerId)) {
        throw new Error(`Controller ${player.playerId} attempted to move for another player`);
      }
      movement.push(...decisions);
      operations += 1;
    }
    add(resolveAttentionMovement(match, movement));

    const capacity = stateOf(match).players.map((player) => {
      const decision = controllers[player.playerId].claim?.(
        projectAttentionMatch(match, player.playerId)
      ) as AttentionCapacityIntent | null | undefined;
      if (decision && decision.playerId !== player.playerId) {
        throw new Error(`Controller ${player.playerId} attempted to claim for another player`);
      }
      return decision ?? { kind: "pass-capacity" as const, playerId: player.playerId };
    });
    operations += capacity.length;
    add(resolveAttentionCapacity(match, capacity));

    const ended = new Set<string>();
    const commandCounts = new Map<string, number>();
    const order = [...stateOf(match).players].sort((left, right) =>
      comparePriority(stateOf(match), match.context, { playerId: left.playerId }, { playerId: right.playerId })
    );
    while (ended.size < order.length) {
      for (const player of order) {
        if (ended.has(player.playerId)) continue;
        const perPlayerLimit = Math.min(64, Math.max(1, controllers[player.playerId].maxCommandActions ?? 64));
        if ((commandCounts.get(player.playerId) ?? 0) >= perPlayerLimit) {
          ended.add(player.playerId);
          add(applyCommand(match, { kind: "end-command", playerId: player.playerId }));
          continue;
        }
        if (operations >= maxOperations) throw new Error(`Attention controller exceeded ${maxOperations} operations`);
        const decision = controllers[player.playerId].command(projectAttentionMatch(match, player.playerId));
        operations += 1;
        if (decision && decision.playerId !== player.playerId) {
          throw new Error(`Controller ${player.playerId} attempted to command for another player`);
        }
        if (!decision || decision.kind === "end-command") {
          ended.add(player.playerId);
          if (decision) add(applyCommand(match, decision));
          continue;
        }
        commandCounts.set(player.playerId, (commandCounts.get(player.playerId) ?? 0) + 1);
        add(applyCommand(match, decision));
      }
    }
    add(resolveAttentionRound(match));
    if (operations >= maxOperations && stateOf(match).status === "active") {
      throw new Error(`Attention controller exceeded ${maxOperations} operations`);
    }
  }

  eventHash.update("]");
  const result: AttentionRunResult = {
    match,
    traceHash: `sha256:${eventHash.digest("hex")}`,
    summary: {
      operations,
      events: eventCount,
      eventTypes,
      players: counterContext.players,
      ...(counterContext.uap ? { uap: counterContext.uap } : {}),
      ...(counterContext.spatial ? { spatial: counterContext.spatial } : {}),
      ...(counterContext.artillery ? { artillery: counterContext.artillery } : {})
    }
  };
  if (fullEvents) result.events = fullEvents;
  return result;
}
