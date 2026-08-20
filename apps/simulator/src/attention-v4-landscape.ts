import {
  ATTENTION_V4_COMMANDER_COMPILER_VERSION,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION,
  type AttentionV4Chassis,
  type AttentionV4CommanderProfile,
  type AttentionV4CommanderProgram,
  type AttentionV4EventEnvelope
} from "@landscape/contracts";
import {
  ATTENTION_V4_RULESET_HASH,
  attentionV4CommanderArtillery,
  attentionV4CommanderCapacityClaim,
  attentionV4CommanderCommand,
  attentionV4CommanderKinetic,
  attentionV4ContentHash,
  attentionV4StateHash,
  compileAttentionV4Commander,
  createAttentionV4CommanderCatalog,
  reduceAttentionV4,
  startAttentionV4Match,
  type AttentionV4Match,
  type AttentionV4PressureSample,
  type AttentionV4ReducerAction
} from "@landscape/engine";

export const ATTENTION_V4_LANDSCAPE_OFFSETS = [791, 1_709, 1, 2_559] as const;
export const ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS = [
  ...ATTENTION_V4_LANDSCAPE_OFFSETS,
  4, 8, 32, 64, 320, 640, 1_920,
  137, 431, 997, 1_429, 2_081
] as const;
export const ATTENTION_V4_LANDSCAPE_PRESSURES = [0, 1, 2, 3] as const satisfies readonly AttentionV4PressureSample[];
export const ATTENTION_V4_LANDSCAPE_EXPECTED_MATCHES = 115_200 as const;
export const ATTENTION_V4_LANDSCAPE_REPLAY_MODULO = 128 as const;
export const ATTENTION_V4_DEEP_WORLD_LANES = [0, 1] as const;

export type AttentionV4LandscapeSeedScheme = "legacy-edge-index-v1" | "pair-keyed-world-v1";

export type AttentionV4LandscapeStudyId =
  | "attention-v4.2-descriptive-landscape-1"
  | "attention-v4.2-expanded-topology-1"
  | "attention-v4.2-regular-topology-1"
  | "attention-v4.2-fleet-matrix-1";

type Dimension = "composition" | "triage" | "movement" | "capacity";
type Result = "win" | "loss" | "draw";

export type AttentionV4LandscapeEdge = {
  edgeIndex: number;
  edgeId: string;
  kind: "matchup" | "self-play";
  stratum: "uniform" | "nearby" | "adversarial" | "self-play";
  offset: number;
  leftOrdinal: number;
  rightOrdinal: number;
  designRound?: number;
  fleetCell?: string;
};

type ScoreAggregate = {
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
};

type Mechanics = {
  emits: number;
  holds: number;
  artifactsEmitted: number;
  scoutEmits: number;
  lineEmits: number;
  heavyEmits: number;
  scoutHolds: number;
  lineHolds: number;
  heavyHolds: number;
  scoutArtifacts: number;
  lineArtifacts: number;
  heavyArtifacts: number;
  scoutPlansCondense0: number;
  scoutPlansCondense1: number;
  scoutPlansCondense2: number;
  condenseActions: number;
  verifies: number;
  accepts: number;
  rejects: number;
  seizes: number;
  batteries: number;
  scoutBatteries: number;
  lineBatteries: number;
  heavyBatteries: number;
  detonations: number;
  detonationDrift: number;
  scoutDetonations: number;
  lineDetonations: number;
  heavyDetonations: number;
  scoutDetonationDrift: number;
  lineDetonationDrift: number;
  heavyDetonationDrift: number;
  detonationContextLimit: number;
  detonationLocalTraffic: number;
  capacityClaims: number;
  perfectFocus: number;
  overclock: number;
  supportScans: number;
  supportAttachments: number;
  shellsFired: number;
  shellsBlocked: number;
  flare: number;
  smoke: number;
  emp: number;
  he: number;
  chaff: number;
  trafficActions: number;
  backlogObservations: number;
  backlogArtifacts: number;
  backlogAge: number;
  backlogTraffic: number;
  backlogOvertaxed: number;
  backlogScout: number;
  backlogLine: number;
  backlogHeavy: number;
  moves: number;
  stepUps: number;
  uplinks: number;
  rangeShifts: number;
};

type Aggregate = {
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  progress: number;
  drift: number;
  attention: number;
  rounds: number;
  mechanics: Mechanics;
};

type MatchPlayerResult = {
  playerId: "alpha" | "bravo";
  programOrdinal: number;
  result: Result;
  score: number;
  progress: number;
  drift: number;
  attention: number;
  mechanics: Mechanics;
};

type MatchResult = {
  players: [MatchPlayerResult, MatchPlayerResult];
  rounds: number;
  terminalReason: string;
  replayMismatch: boolean;
  attributionMismatch: boolean;
  streamSignature: Array<{ round: number; rootStream: string; domainStreams: Record<string, string> }>;
};

type PhysicalTotals = {
  matches: number;
  alphaWins: number;
  bravoWins: number;
  draws: number;
  rounds: number;
  participantProgress: number;
  participantDrift: number;
  participantAttention: number;
  terminalReasons: Record<string, number>;
  roundHistogram: Record<string, number>;
  participantProgressHistogram: Record<string, number>;
  terminalStateClasses: Record<string, number>;
};

type PressureTotals = PhysicalTotals & { pressure: AttentionV4PressureSample };

type EdgeSummary = {
  edgeIndex: number;
  edgeId: string;
  kind: AttentionV4LandscapeEdge["kind"];
  stratum: AttentionV4LandscapeEdge["stratum"];
  leftOrdinal: number;
  rightOrdinal: number;
  matches: number;
  leftScore: number;
  draws: number;
};

type FleetCellTotals = {
  cellId: string;
  leftComposition: string;
  rightComposition: string;
  edges: number;
  matches: number;
  left: Aggregate;
  right: Aggregate;
};

type WorldStabilityTotals = {
  comparisons: number;
  exactScoreAgreements: number;
  directionAgreements: number;
  absoluteLeftScoreDelta: number;
  streamCollisions: number;
};

export type AttentionV4LandscapeShard = {
  schemaVersion: 1 | 2;
  studyId: AttentionV4LandscapeStudyId;
  modelVersion: "duel-capacity-v3-experimental";
  rulesetVersion: typeof ATTENTION_V4_RULESET_VERSION;
  rulesetHash: typeof ATTENTION_V4_RULESET_HASH;
  resolverVersion: typeof ATTENTION_V4_RESOLVER_VERSION;
  compilerVersion: typeof ATTENTION_V4_COMMANDER_COMPILER_VERSION;
  commanderCatalogHash: string;
  shard: { index: number; count: number };
  pressures: AttentionV4PressureSample[];
  worldLanes: number[];
  seedScheme: AttentionV4LandscapeSeedScheme;
  replayModulo: number;
  edgeCount: number;
  nonSelfEdges: number;
  selfPlayEdges: number;
  totals: PhysicalTotals;
  pressureTotals: PressureTotals[];
  worldTotals: Array<{ worldLane: number; totals: PhysicalTotals }>;
  worldCommanders: Array<{ worldLane: number; commanders: Array<{ ordinal: number; aggregate: ScoreAggregate }> }>;
  commanders: Array<{ ordinal: number; aggregate: Aggregate }>;
  edges: EdgeSummary[];
  fleetCells: FleetCellTotals[];
  mechanics: Mechanics;
  reversal: { pairs: number; seatDelta: number; absoluteSeatDelta: number; streamMismatches: number };
  worldStability: WorldStabilityTotals;
  selfPlay: { matches: number; alphaScore: number };
  integrity: { replaySentinels: number; replayMismatches: number; attributionMismatches: number; commandRejections: number };
};

export type AttentionV4LandscapeReport = {
  schemaVersion: 1 | 2;
  studyId: AttentionV4LandscapeStudyId;
  evidenceClass: "descriptive-exploration";
  causalClaim: false;
  modelVersion: "duel-capacity-v3-experimental";
  rulesetVersion: typeof ATTENTION_V4_RULESET_VERSION;
  rulesetHash: typeof ATTENTION_V4_RULESET_HASH;
  resolverVersion: typeof ATTENTION_V4_RESOLVER_VERSION;
  compilerVersion: typeof ATTENTION_V4_COMMANDER_COMPILER_VERSION;
  commanderCatalogHash: string;
  design: {
    formula: string;
    commanders: number;
    offsets: number[];
    nonSelfEdges: number;
    selfPlayEdges: number;
    pressureSamples: number[];
    physicalMatches: number;
    reversalPairs: number;
    replaySentinels: number;
    complete: boolean;
    deep?: {
      kind: "regular-topology" | "fleet-matrix";
      degree: number;
      worldLanes: number[];
      seedScheme: AttentionV4LandscapeSeedScheme;
      scheduleRounds: number;
      fleetCells: number;
      referenceOverlapEdges: number;
    };
  };
  integrity: {
    replayMismatches: number;
    streamMismatches: number;
    attributionMismatches: number;
    commandRejections: number;
    minimumCommanderAppearances: number;
    maximumCommanderAppearances: number;
    allProfilesObserved: boolean;
    passed: boolean;
    worldStreamCollisions?: number;
  };
  outcomes: {
    alphaWins: number;
    bravoWins: number;
    draws: number;
    alphaScoreRate: number;
    meanRounds: number;
    meanParticipantProgress: number;
    meanParticipantDrift: number;
    meanParticipantAttention: number;
    terminalReasons: Record<string, number>;
    roundHistogram: Record<string, number>;
    byPressure: Array<{
      pressure: AttentionV4PressureSample;
      matches: number;
      alphaScoreRate: number;
      drawRate: number;
      meanRounds: number;
      meanProgress: number;
      meanDrift: number;
    }>;
    byStratum: Array<{
      stratum: AttentionV4LandscapeEdge["stratum"];
      edges: number;
      matches: number;
      meanLeftScore: number;
      drawRate: number;
      dominanceEdgeRate: number;
    }>;
  };
  seat: {
    exactReversalPairs: number;
    meanFocalAlphaSeatEffect: number;
    meanAbsoluteReversalEffect: number;
    selfPlayMatches: number;
    selfPlayAlphaScoreRate: number;
  };
  mechanics: Mechanics & { perParticipant: Record<keyof Mechanics, number> };
  balance: {
    chassis: Record<AttentionV4Chassis, { emits: number; holds: number; artifacts: number; batteries: number; detonations: number; detonationDrift: number }>;
    scoutCondense: { plan0: number; plan1: number; plan2: number; actions: number };
    backlog: { observations: number; meanArtifacts: number; meanAge: number; meanTraffic: number; overtaxedRate: number; bySourceChassis: Record<AttentionV4Chassis, number> };
  };
  modules: Record<Dimension, ModuleSummary[]>;
  commanders: {
    effectiveCountAtTemperature003: number;
    scoreQuantiles: Record<"p05" | "p25" | "p50" | "p75" | "p95", number>;
    top: CommanderSummary[];
    bottom: CommanderSummary[];
    all: CommanderSummary[];
  };
  counterplay: {
    dominanceThreshold: number;
    dominanceArcs: number;
    largestStronglyConnectedComponent: number;
    largestStronglyConnectedFraction: number;
    neutralEdges: number;
  };
  progressPath?: {
    participantHistogram: Record<string, number>;
    atLeast8: number;
    atLeast10: number;
    atLeast12: number;
    terminalStateClasses: Record<string, number>;
  };
  worlds?: {
    lanes: number[];
    seedScheme: AttentionV4LandscapeSeedScheme;
    byLane: Array<{
      worldLane: number;
      matches: number;
      alphaScoreRate: number;
      meanRounds: number;
      meanParticipantProgress: number;
      meanParticipantDrift: number;
    }>;
    comparisons: number;
    exactScoreAgreementRate: number;
    directionAgreementRate: number;
    meanAbsoluteLeftScoreDelta: number;
    profileScorePearson: number;
    profileScoreSpearman: number;
    meanAbsoluteProfileScoreDelta: number;
    p95AbsoluteProfileScoreDelta: number;
    top25Overlap: number;
    top100Overlap: number;
  };
  fleetMatchups?: Array<{
    cellId: string;
    leftComposition: string;
    rightComposition: string;
    edges: number;
    matches: number;
    leftScoreRate: number;
    drawRate: number;
    left: Omit<ModuleSummary, "module" | "profiles" | "scoreLift">;
    right: Omit<ModuleSummary, "module" | "profiles" | "scoreLift">;
  }>;
  reportHash: string;
};

type ModuleSummary = {
  module: string;
  profiles: number;
  appearances: number;
  scoreRate: number;
  scoreLift: number;
  winRate: number;
  drawRate: number;
  meanProgress: number;
  meanDrift: number;
  meanRounds: number;
  artifactsPerAppearance: number;
  holdsPerAppearance: number;
  condenseActionsPerAppearance: number;
  backlogPerRound: number;
  batteriesPerAppearance: number;
  detonationsPerAppearance: number;
  shellsPerAppearance: number;
};

type CommanderSummary = {
  ordinal: number;
  commanderId: string;
  composition: string;
  triage: string;
  movement: string;
  capacity: string;
  appearances: number;
  scoreRate: number;
  wins: number;
  losses: number;
  draws: number;
  meanProgress: number;
  meanDrift: number;
  dominanceWins: number;
  dominanceLosses: number;
};

export type AttentionV4LandscapeRunOptions = {
  edges?: AttentionV4LandscapeEdge[];
  pressures?: AttentionV4PressureSample[];
  worldLanes?: number[];
  seedScheme?: AttentionV4LandscapeSeedScheme;
  replayModulo?: number;
  studyId?: AttentionV4LandscapeStudyId;
  shardIndex?: number;
  shardCount?: number;
  onProgress?: (completedMatches: number, totalMatches: number) => void;
};

function emptyMechanics(): Mechanics {
  return {
    emits: 0, holds: 0, artifactsEmitted: 0,
    scoutEmits: 0, lineEmits: 0, heavyEmits: 0, scoutHolds: 0, lineHolds: 0, heavyHolds: 0,
    scoutArtifacts: 0, lineArtifacts: 0, heavyArtifacts: 0,
    scoutPlansCondense0: 0, scoutPlansCondense1: 0, scoutPlansCondense2: 0, condenseActions: 0,
    verifies: 0, accepts: 0, rejects: 0, seizes: 0,
    batteries: 0, scoutBatteries: 0, lineBatteries: 0, heavyBatteries: 0,
    detonations: 0, detonationDrift: 0, scoutDetonations: 0, lineDetonations: 0, heavyDetonations: 0,
    scoutDetonationDrift: 0, lineDetonationDrift: 0, heavyDetonationDrift: 0,
    detonationContextLimit: 0, detonationLocalTraffic: 0,
    capacityClaims: 0, perfectFocus: 0, overclock: 0,
    supportScans: 0, supportAttachments: 0, shellsFired: 0, shellsBlocked: 0,
    flare: 0, smoke: 0, emp: 0, he: 0, chaff: 0,
    trafficActions: 0, backlogObservations: 0, backlogArtifacts: 0, backlogAge: 0,
    backlogTraffic: 0, backlogOvertaxed: 0, backlogScout: 0, backlogLine: 0, backlogHeavy: 0,
    moves: 0,
    stepUps: 0, uplinks: 0, rangeShifts: 0
  };
}

function emptyAggregate(): Aggregate {
  return { appearances: 0, wins: 0, losses: 0, draws: 0, score: 0, progress: 0, drift: 0, attention: 0, rounds: 0, mechanics: emptyMechanics() };
}

function emptyScoreAggregate(): ScoreAggregate {
  return { appearances: 0, wins: 0, losses: 0, draws: 0, score: 0 };
}

function emptyPhysicalTotals(): PhysicalTotals {
  return {
    matches: 0,
    alphaWins: 0,
    bravoWins: 0,
    draws: 0,
    rounds: 0,
    participantProgress: 0,
    participantDrift: 0,
    participantAttention: 0,
    terminalReasons: {},
    roundHistogram: {},
    participantProgressHistogram: {},
    terminalStateClasses: {}
  };
}

function addRecord(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function addMechanics(target: Mechanics, source: Mechanics): void {
  for (const key of Object.keys(target) as Array<keyof Mechanics>) target[key] += source[key];
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  target.appearances += source.appearances;
  target.wins += source.wins;
  target.losses += source.losses;
  target.draws += source.draws;
  target.score += source.score;
  target.progress += source.progress;
  target.drift += source.drift;
  target.attention += source.attention;
  target.rounds += source.rounds;
  addMechanics(target.mechanics, source.mechanics);
}

function addScoreAggregate(target: ScoreAggregate, source: ScoreAggregate): void {
  target.appearances += source.appearances;
  target.wins += source.wins;
  target.losses += source.losses;
  target.draws += source.draws;
  target.score += source.score;
}

function addPhysicalTotals(target: PhysicalTotals, source: PhysicalTotals): void {
  target.matches += source.matches;
  target.alphaWins += source.alphaWins;
  target.bravoWins += source.bravoWins;
  target.draws += source.draws;
  target.rounds += source.rounds;
  target.participantProgress += source.participantProgress;
  target.participantDrift += source.participantDrift;
  target.participantAttention += source.participantAttention;
  for (const [key, value] of Object.entries(source.terminalReasons)) addRecord(target.terminalReasons, key, value);
  for (const [key, value] of Object.entries(source.roundHistogram)) addRecord(target.roundHistogram, key, value);
  for (const [key, value] of Object.entries(source.participantProgressHistogram)) addRecord(target.participantProgressHistogram, key, value);
  for (const [key, value] of Object.entries(source.terminalStateClasses)) addRecord(target.terminalStateClasses, key, value);
}

function resultScore(result: Result): number {
  return result === "win" ? 1 : result === "draw" ? 0.5 : 0;
}

function playerIdFromActor(actorId: string | null): "alpha" | "bravo" | null {
  if (!actorId) return null;
  const playerId = actorId.includes(":") ? actorId.split(":")[0] : actorId;
  return playerId === "alpha" || playerId === "bravo" ? playerId : null;
}

function chassisMetric(target: Mechanics, chassis: AttentionV4Chassis, suffix: "Emits" | "Holds" | "Artifacts" | "Batteries" | "Detonations" | "DetonationDrift", amount = 1): void {
  const key = `${chassis}${suffix}` as keyof Mechanics;
  target[key] += amount;
}

function mechanicsFromEvents(
  events: AttentionV4EventEnvelope[],
  units: Array<{ unitId: string; chassis: AttentionV4Chassis }>
): Record<"alpha" | "bravo", Mechanics> {
  const result = { alpha: emptyMechanics(), bravo: emptyMechanics() };
  const chassisByUnit = new Map(units.map((unit) => [unit.unitId, unit.chassis]));
  const artifacts = new Map<string, { chassis: AttentionV4Chassis; newbornRound: number }>();
  for (const item of events) {
    const playerId = playerIdFromActor(item.actorId);
    if (!playerId) continue;
    const target = result[playerId];
    if (item.eventType === "attention.v4.output.emitted") {
      const unitId = typeof item.data.unitId === "string" ? item.data.unitId : item.actorId;
      const chassis = unitId ? chassisByUnit.get(unitId) : undefined;
      const outputVolume = typeof item.data.outputVolume === "number" ? item.data.outputVolume : 0;
      target.emits += 1;
      target.artifactsEmitted += outputVolume;
      if (chassis) {
        chassisMetric(target, chassis, "Emits");
        chassisMetric(target, chassis, "Artifacts", outputVolume);
        if (Array.isArray(item.data.artifactIds)) {
          for (const artifactId of item.data.artifactIds) if (typeof artifactId === "string") artifacts.set(artifactId, { chassis, newbornRound: item.turn });
        }
      }
    } else if (item.eventType === "attention.v4.output.held") {
      const unitId = typeof item.data.unitId === "string" ? item.data.unitId : item.actorId;
      const chassis = unitId ? chassisByUnit.get(unitId) : undefined;
      target.holds += 1;
      if (chassis) chassisMetric(target, chassis, "Holds");
    } else if (item.eventType === "attention.v4.artifact.verified") target.verifies += 1;
    else if (item.eventType === "attention.v4.artifact.accepted") target.accepts += 1;
    else if (item.eventType === "attention.v4.artifact.rejected") target.rejects += 1;
    else if (item.eventType === "attention.v4.artifact.seized") target.seizes += 1;
    else if (item.eventType === "attention.v4.battery.activated") {
      target.batteries += 1;
      const artifact = typeof item.data.artifactId === "string" ? artifacts.get(item.data.artifactId) : undefined;
      if (artifact) chassisMetric(target, artifact.chassis, "Batteries");
    } else if (item.eventType === "attention.v4.artifact.detonated") {
      target.detonations += 1;
      const artifact = typeof item.data.artifactId === "string" ? artifacts.get(item.data.artifactId) : undefined;
      const drift = typeof item.data.drift === "number" ? item.data.drift : 2;
      target.detonationDrift += drift;
      if (artifact) {
        chassisMetric(target, artifact.chassis, "Detonations");
        chassisMetric(target, artifact.chassis, "DetonationDrift", drift);
      }
      if (Array.isArray(item.data.reasons)) {
        target.detonationContextLimit += Number(item.data.reasons.includes("context-limit"));
        target.detonationLocalTraffic += Number(item.data.reasons.includes("local-traffic"));
      }
    }
    else if (item.eventType === "attention.v4.capacity.claimed") target.capacityClaims += 1;
    else if (item.eventType === "attention.v4.perfect-focus.applied") target.perfectFocus += 1;
    else if (item.eventType === "attention.v4.overclock.activated") target.overclock += 1;
    else if (item.eventType === "attention.v4.support-scan.reserved") target.supportScans += 1;
    else if (item.eventType === "attention.v4.support-scan.attached") target.supportAttachments += 1;
    else if (item.eventType === "attention.v4.artillery.shell.fired") {
      target.shellsFired += 1;
      target.shellsBlocked += Number(item.data.blocked === true);
      const shell = item.data.shell;
      if (shell === "flare" || shell === "smoke" || shell === "emp" || shell === "he" || shell === "chaff") target[shell] += 1;
    } else if (item.eventType === "attention.v4.kinetic.plan.resolved" && Array.isArray(item.data.actions)) {
      target.trafficActions += item.data.actions.length;
      const chassis = item.actorId ? chassisByUnit.get(item.actorId) : undefined;
      if (chassis === "scout") {
        const steps = typeof item.data.condenseSteps === "number" ? item.data.condenseSteps : 0;
        if (steps === 0) target.scoutPlansCondense0 += 1;
        else if (steps === 1) target.scoutPlansCondense1 += 1;
        else target.scoutPlansCondense2 += 1;
      }
      for (const action of item.data.actions) {
        if (action === "move") target.moves += 1;
        else if (action === "condense-output") target.condenseActions += 1;
        else if (action === "step-up") target.stepUps += 1;
        else if (action === "command-uplink") target.uplinks += 1;
        else if (action === "range-shift") target.rangeShifts += 1;
      }
    }
  }
  return result;
}

function streamsMatch(
  left: MatchResult["streamSignature"],
  right: MatchResult["streamSignature"]
): boolean {
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index].round !== right[index].round || left[index].rootStream !== right[index].rootStream ||
      attentionV4ContentHash(left[index].domainStreams) !== attentionV4ContentHash(right[index].domainStreams)) return false;
  }
  return true;
}

function pairKeyedWorld(input: {
  left: AttentionV4CommanderProgram;
  right: AttentionV4CommanderProgram;
  pressure: AttentionV4PressureSample;
  worldLane: number;
}): { key: string; seed: number } {
  const commanders = [input.left.programHash, input.right.programHash].sort();
  const hash = attentionV4ContentHash({
    schema: "attention-v4-pair-keyed-world-v1",
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    commanders,
    pressure: input.pressure,
    worldLane: input.worldLane
  });
  return { key: hash.slice(7, 31), seed: Number.parseInt(hash.slice(7, 15), 16) };
}

function playMatch(input: {
  edge: AttentionV4LandscapeEdge;
  pressure: AttentionV4PressureSample;
  seat: 0 | 1;
  left: AttentionV4CommanderProgram;
  right: AttentionV4CommanderProgram;
  replay: boolean;
  worldLane: number;
  seedScheme: AttentionV4LandscapeSeedScheme;
}): MatchResult {
  const programs = input.seat === 0 ? [input.left, input.right] as const : [input.right, input.left] as const;
  const ordinals = input.seat === 0 ? [input.edge.leftOrdinal, input.edge.rightOrdinal] as const : [input.edge.rightOrdinal, input.edge.leftOrdinal] as const;
  const keyedWorld = input.seedScheme === "pair-keyed-world-v1"
    ? pairKeyedWorld(input)
    : null;
  const pairKey = keyedWorld
    ? `${keyedWorld.key}:pressure${input.pressure}:world${input.worldLane}`
    : `${input.edge.edgeId}:pressure${input.pressure}`;
  const setup = {
    matchId: `attention-v4-landscape:${pairKey}`,
    seed: keyedWorld?.seed ?? input.edge.edgeIndex * 4 + input.pressure,
    randomStreamId: `attention-v4-landscape:${pairKey}`,
    players: [
      { playerId: "alpha", composition: programs[0].composition, commanderHash: programs[0].programHash },
      { playerId: "bravo", composition: programs[1].composition, commanderHash: programs[1].programHash }
    ] as const
  };
  const started = startAttentionV4Match(setup);
  let match = started.match;
  const events = [...started.events];
  const journal: AttentionV4ReducerAction[] = [];
  const backlog = { alpha: emptyMechanics(), bravo: emptyMechanics() };
  for (let operation = 0; match.state.status === "active"; operation += 1) {
    if (operation >= 512) throw new Error(`attention-v4 landscape operation limit: ${pairKey}:seat${input.seat}`);
    let action: AttentionV4ReducerAction;
    if (match.state.phase === "kinetic") {
      action = { kind: "kinetic", plans: [
        ...attentionV4CommanderKinetic(match, "alpha", programs[0], input.pressure),
        ...attentionV4CommanderKinetic(match, "bravo", programs[1], input.pressure)
      ] };
    } else if (match.state.phase === "artillery") {
      action = { kind: "artillery", intents: [
        attentionV4CommanderArtillery(match, "alpha", programs[0], input.pressure),
        attentionV4CommanderArtillery(match, "bravo", programs[1], input.pressure)
      ] };
    } else if (match.state.phase === "capacity") {
      action = { kind: "capacity", intents: [
        { playerId: "alpha", claim: attentionV4CommanderCapacityClaim(match, "alpha", programs[0]) },
        { playerId: "bravo", claim: attentionV4CommanderCapacityClaim(match, "bravo", programs[1]) }
      ] };
    } else if (match.state.phase === "command") {
      const active = match.state.command.activePlayerId;
      if (active !== "alpha" && active !== "bravo") throw new Error(`attention-v4 landscape missing active commander: ${pairKey}`);
      const program = active === "alpha" ? programs[0] : programs[1];
      action = { kind: "command", intent: attentionV4CommanderCommand(match, active, program, input.pressure) };
    } else {
      throw new Error(`attention-v4 landscape unexpected phase: ${match.state.phase}`);
    }
    if (input.replay) journal.push(structuredClone(action));
    const preResolutionArtifacts = match.state.artifacts;
    const transition = reduceAttentionV4(match, action);
    const rejection = transition.events.find((item) => item.eventType === "attention.v4.command.rejected");
    if (rejection) throw new Error(`attention-v4 landscape command rejected: ${String(rejection.data.reason)}`);
    if (transition.events.some((item) => item.eventType === "attention.v4.resolution.completed")) {
      for (const playerId of ["alpha", "bravo"] as const) {
        const pending = preResolutionArtifacts.filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending" && !artifact.verified);
        const target = backlog[playerId];
        target.backlogObservations += 1;
        target.backlogArtifacts += pending.length;
        target.backlogAge += pending.reduce((sum, artifact) => sum + artifact.age, 0);
        target.backlogTraffic += pending.reduce((sum, artifact) => sum + artifact.localTraffic, 0);
        target.backlogOvertaxed += pending.filter((artifact) => artifact.overTaxReasons.length > 0).length;
        target.backlogScout += pending.filter((artifact) => artifact.sourceChassis === "scout").length;
        target.backlogLine += pending.filter((artifact) => artifact.sourceChassis === "line").length;
        target.backlogHeavy += pending.filter((artifact) => artifact.sourceChassis === "heavy").length;
      }
    }
    match = transition.match;
    events.push(...transition.events);
  }

  const expectedHashes = programs.map((program) => program.programHash);
  const attributionMismatch = match.state.compiledCommanderHashes.some((hash, index) => hash !== expectedHashes[index]);
  let replayMismatch = false;
  if (input.replay) {
    const replayStart = startAttentionV4Match(setup);
    let replayMatch: AttentionV4Match = replayStart.match;
    const replayEvents = [...replayStart.events];
    for (const action of journal) {
      const transition = reduceAttentionV4(replayMatch, action);
      replayMatch = transition.match;
      replayEvents.push(...transition.events);
    }
    replayMismatch = attentionV4StateHash(replayMatch.state) !== attentionV4StateHash(match.state) ||
      attentionV4ContentHash(replayEvents) !== attentionV4ContentHash(events);
  }
  const mechanics = mechanicsFromEvents(events, match.state.units);
  addMechanics(mechanics.alpha, backlog.alpha);
  addMechanics(mechanics.bravo, backlog.bravo);
  const players = (["alpha", "bravo"] as const).map((playerId, index) => {
    const player = match.state.players.find((candidate) => candidate.playerId === playerId)!;
    const result: Result = match.state.winnerPlayerId === null ? "draw" : match.state.winnerPlayerId === playerId ? "win" : "loss";
    return {
      playerId,
      programOrdinal: ordinals[index],
      result,
      score: resultScore(result),
      progress: player.progress,
      drift: player.drift,
      attention: player.attention,
      mechanics: mechanics[playerId]
    };
  }) as [MatchPlayerResult, MatchPlayerResult];
  return {
    players,
    rounds: match.state.round,
    terminalReason: match.state.terminalReason ?? "unknown",
    replayMismatch,
    attributionMismatch,
    streamSignature: match.state.roundRecords.map((record) => ({ round: record.round, rootStream: record.rootStream, domainStreams: record.domainStreams }))
  };
}

function landscapeStratum(offset: number): AttentionV4LandscapeEdge["stratum"] {
  if ([1, 4, 8, 32, 64, 640].includes(offset)) return "nearby";
  if ([320, 1_920, 2_559].includes(offset)) return "adversarial";
  return "uniform";
}

export function createAttentionV4LandscapeEdges(
  offsets: readonly number[] = ATTENTION_V4_LANDSCAPE_OFFSETS
): AttentionV4LandscapeEdge[] {
  const catalog = createAttentionV4CommanderCatalog();
  const count = catalog.profiles.length;
  const edges: AttentionV4LandscapeEdge[] = [];
  const pairs = new Set<string>();
  if (offsets.length === 0 || new Set(offsets).size !== offsets.length ||
    offsets.some((offset) => !Number.isInteger(offset) || offset < 1 || offset >= count)) {
    throw new Error("attention-v4 landscape offsets must be unique integers inside the commander catalog");
  }
  for (const offset of offsets) {
    for (let leftOrdinal = 0; leftOrdinal < count; leftOrdinal += 1) {
      const rightOrdinal = (leftOrdinal + offset) % count;
      const pair = [leftOrdinal, rightOrdinal].sort((left, right) => left - right).join(":");
      if (pairs.has(pair)) throw new Error(`duplicate attention-v4 landscape pair: ${pair}`);
      pairs.add(pair);
      edges.push({
        edgeIndex: edges.length,
        edgeId: `offset${offset}:${leftOrdinal}:${rightOrdinal}`,
        kind: "matchup",
        stratum: landscapeStratum(offset),
        offset,
        leftOrdinal,
        rightOrdinal
      });
    }
  }
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    edges.push({
      edgeIndex: edges.length,
      edgeId: `self:${ordinal}`,
      kind: "self-play",
      stratum: "self-play",
      offset: 0,
      leftOrdinal: ordinal,
      rightOrdinal: ordinal
    });
  }
  const expectedMatchups = count * offsets.length;
  if (edges.length !== expectedMatchups + count || pairs.size !== expectedMatchups) {
    throw new Error("attention-v4.2 landscape topology contains duplicate or missing pairs");
  }
  return edges;
}

function updateAggregate(target: Aggregate, player: MatchPlayerResult, rounds: number): void {
  target.appearances += 1;
  target[player.result === "win" ? "wins" : player.result === "loss" ? "losses" : "draws"] += 1;
  target.score += player.score;
  target.progress += player.progress;
  target.drift += player.drift;
  target.attention += player.attention;
  target.rounds += rounds;
  addMechanics(target.mechanics, player.mechanics);
}

function updateScoreAggregate(target: ScoreAggregate, player: MatchPlayerResult): void {
  target.appearances += 1;
  target[player.result === "win" ? "wins" : player.result === "loss" ? "losses" : "draws"] += 1;
  target.score += player.score;
}

function updatePhysicalTotals(target: PhysicalTotals, match: MatchResult): void {
  target.matches += 1;
  if (match.players[0].result === "win") target.alphaWins += 1;
  else if (match.players[1].result === "win") target.bravoWins += 1;
  else target.draws += 1;
  target.rounds += match.rounds;
  target.participantProgress += match.players[0].progress + match.players[1].progress;
  target.participantDrift += match.players[0].drift + match.players[1].drift;
  target.participantAttention += match.players[0].attention + match.players[1].attention;
  addRecord(target.terminalReasons, match.terminalReason);
  addRecord(target.roundHistogram, String(match.rounds));
  for (const player of match.players) addRecord(target.participantProgressHistogram, String(player.progress));
  const terminalClass = match.players.map((player) => player.drift >= 4 ? "drift" : player.progress >= 12 ? "objective" : "none").join(":");
  addRecord(target.terminalStateClasses, terminalClass);
}

export function attentionV4LandscapeMatchCount(edges: AttentionV4LandscapeEdge[], pressureCount: number, worldLaneCount = 1): number {
  return edges.reduce((sum, edge) => sum + (edge.kind === "self-play" ? 1 : 2) * pressureCount * worldLaneCount, 0);
}

export function runAttentionV4LandscapeShard(options: AttentionV4LandscapeRunOptions = {}): AttentionV4LandscapeShard {
  const catalog = createAttentionV4CommanderCatalog();
  const programs = catalog.profiles.map(compileAttentionV4Commander);
  const edges = options.edges ?? createAttentionV4LandscapeEdges();
  const pressures = options.pressures ?? [...ATTENTION_V4_LANDSCAPE_PRESSURES];
  const worldLanes = options.worldLanes ?? [0];
  const seedScheme = options.seedScheme ?? "legacy-edge-index-v1";
  const replayModulo = options.replayModulo ?? ATTENTION_V4_LANDSCAPE_REPLAY_MODULO;
  const shardIndex = options.shardIndex ?? 0;
  const shardCount = options.shardCount ?? 1;
  if (!Number.isInteger(replayModulo) || replayModulo < 0) throw new Error("replayModulo must be a nonnegative integer");
  if (worldLanes.length < 1 || worldLanes.length > 2 || new Set(worldLanes).size !== worldLanes.length ||
    worldLanes.some((lane) => !Number.isInteger(lane) || lane < 0)) throw new Error("worldLanes must contain one or two unique nonnegative integers");
  if (seedScheme === "legacy-edge-index-v1" && (worldLanes.length !== 1 || worldLanes[0] !== 0)) {
    throw new Error("legacy landscape seeds require world lane zero only");
  }
  if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount) || shardCount < 1 || shardIndex < 0 || shardIndex >= shardCount) throw new Error("invalid attention-v4 landscape shard");
  const shardEdges = edges.filter((edge) => edge.edgeIndex % shardCount === shardIndex);
  const totalMatches = attentionV4LandscapeMatchCount(shardEdges, pressures.length, worldLanes.length);
  const totals = emptyPhysicalTotals();
  const pressureMap = new Map(pressures.map((pressure) => [pressure, { ...emptyPhysicalTotals(), pressure } as PressureTotals]));
  const worldTotalMap = new Map(worldLanes.map((worldLane) => [worldLane, emptyPhysicalTotals()]));
  const worldCommanderMaps = new Map(worldLanes.map((worldLane) => [worldLane, new Map<number, ScoreAggregate>()]));
  const commanderMap = new Map<number, Aggregate>();
  const fleetCellMap = new Map<string, FleetCellTotals>();
  const mechanics = emptyMechanics();
  const edgeSummaries: EdgeSummary[] = [];
  const reversal = { pairs: 0, seatDelta: 0, absoluteSeatDelta: 0, streamMismatches: 0 };
  const worldStability: WorldStabilityTotals = { comparisons: 0, exactScoreAgreements: 0, directionAgreements: 0, absoluteLeftScoreDelta: 0, streamCollisions: 0 };
  const selfPlay = { matches: 0, alphaScore: 0 };
  const integrity = { replaySentinels: 0, replayMismatches: 0, attributionMismatches: 0, commandRejections: 0 };
  let completed = 0;

  for (const edge of shardEdges) {
    const left = programs[edge.leftOrdinal];
    const right = programs[edge.rightOrdinal];
    if (!left || !right) throw new Error(`attention-v4 landscape profile unavailable: ${edge.edgeId}`);
    const edgeSummary: EdgeSummary = {
      edgeIndex: edge.edgeIndex,
      edgeId: edge.edgeId,
      kind: edge.kind,
      stratum: edge.stratum,
      leftOrdinal: edge.leftOrdinal,
      rightOrdinal: edge.rightOrdinal,
      matches: 0,
      leftScore: 0,
      draws: 0
    };
    let fleetCell: FleetCellTotals | undefined;
    if (edge.kind === "matchup" && edge.fleetCell) {
      const leftComposition = catalog.profiles[edge.leftOrdinal].compositionModule;
      const rightComposition = catalog.profiles[edge.rightOrdinal].compositionModule;
      fleetCell = fleetCellMap.get(edge.fleetCell);
      if (!fleetCell) {
        fleetCell = {
          cellId: edge.fleetCell,
          leftComposition,
          rightComposition,
          edges: 0,
          matches: 0,
          left: emptyAggregate(),
          right: emptyAggregate()
        };
        fleetCellMap.set(edge.fleetCell, fleetCell);
      }
      if (fleetCell.leftComposition !== leftComposition || fleetCell.rightComposition !== rightComposition) {
        throw new Error(`attention-v4 landscape fleet cell orientation drifted: ${edge.fleetCell}`);
      }
      fleetCell.edges += 1;
    }
    for (const pressure of pressures) {
      const laneLeftScores: number[] = [];
      const laneStreamHashes: string[] = [];
      for (const worldLane of worldLanes) {
        const seats = edge.kind === "self-play" ? [0] as const : [0, 1] as const;
        const seatResults: MatchResult[] = [];
        for (const seat of seats) {
          const replay = replayModulo > 0 && edge.edgeIndex % replayModulo === 0 && pressure === pressures[0] &&
            worldLane === worldLanes[0] && seat === 0;
          if (replay) integrity.replaySentinels += 1;
          let match: MatchResult;
          try {
            match = playMatch({ edge, pressure, seat, left, right, replay, worldLane, seedScheme });
          } catch (error) {
            if (error instanceof Error && error.message.includes("command rejected")) integrity.commandRejections += 1;
            throw error;
          }
          seatResults.push(match);
          integrity.replayMismatches += Number(match.replayMismatch);
          integrity.attributionMismatches += Number(match.attributionMismatch);
          updatePhysicalTotals(totals, match);
          updatePhysicalTotals(pressureMap.get(pressure)!, match);
          updatePhysicalTotals(worldTotalMap.get(worldLane)!, match);
          for (const player of match.players) {
            let aggregate = commanderMap.get(player.programOrdinal);
            if (!aggregate) {
              aggregate = emptyAggregate();
              commanderMap.set(player.programOrdinal, aggregate);
            }
            updateAggregate(aggregate, player, match.rounds);
            let worldAggregate = worldCommanderMaps.get(worldLane)!.get(player.programOrdinal);
            if (!worldAggregate) {
              worldAggregate = emptyScoreAggregate();
              worldCommanderMaps.get(worldLane)!.set(player.programOrdinal, worldAggregate);
            }
            updateScoreAggregate(worldAggregate, player);
            addMechanics(mechanics, player.mechanics);
            if (edge.kind === "matchup" && player.programOrdinal === edge.leftOrdinal) {
              edgeSummary.leftScore += player.score;
              if (fleetCell) updateAggregate(fleetCell.left, player, match.rounds);
            } else if (edge.kind === "matchup" && fleetCell) updateAggregate(fleetCell.right, player, match.rounds);
          }
          edgeSummary.matches += 1;
          edgeSummary.draws += Number(match.players[0].result === "draw");
          if (fleetCell) fleetCell.matches += 1;
          if (edge.kind === "self-play") {
            selfPlay.matches += 1;
            selfPlay.alphaScore += match.players[0].score;
            edgeSummary.leftScore += 0.5;
          }
          completed += 1;
          options.onProgress?.(completed, totalMatches);
        }
        if (edge.kind === "matchup") {
          const leftAsAlpha = seatResults[0].players[0].score;
          const leftAsBravo = seatResults[1].players[1].score;
          const delta = leftAsAlpha - leftAsBravo;
          reversal.pairs += 1;
          reversal.seatDelta += delta;
          reversal.absoluteSeatDelta += Math.abs(delta);
          reversal.streamMismatches += Number(!streamsMatch(seatResults[0].streamSignature, seatResults[1].streamSignature));
          laneLeftScores.push((leftAsAlpha + leftAsBravo) / 2);
          laneStreamHashes.push(attentionV4ContentHash(seatResults[0].streamSignature));
        }
      }
      if (edge.kind === "matchup" && laneLeftScores.length === 2) {
        const [firstScore, secondScore] = laneLeftScores;
        const direction = (score: number) => score > 0.5 ? 1 : score < 0.5 ? -1 : 0;
        worldStability.comparisons += 1;
        worldStability.exactScoreAgreements += Number(firstScore === secondScore);
        worldStability.directionAgreements += Number(direction(firstScore) === direction(secondScore));
        worldStability.absoluteLeftScoreDelta += Math.abs(firstScore - secondScore);
        worldStability.streamCollisions += Number(laneStreamHashes[0] === laneStreamHashes[1]);
      }
    }
    edgeSummary.leftScore = edgeSummary.matches > 0 ? edgeSummary.leftScore / edgeSummary.matches : 0;
    edgeSummaries.push(edgeSummary);
  }

  return {
    schemaVersion: seedScheme === "pair-keyed-world-v1" ? 2 : 1,
    studyId: options.studyId ?? "attention-v4.2-descriptive-landscape-1",
    modelVersion: "duel-capacity-v3-experimental",
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    commanderCatalogHash: catalog.catalogHash,
    shard: { index: shardIndex, count: shardCount },
    pressures: [...pressures],
    worldLanes: [...worldLanes],
    seedScheme,
    replayModulo,
    edgeCount: shardEdges.length,
    nonSelfEdges: shardEdges.filter((edge) => edge.kind === "matchup").length,
    selfPlayEdges: shardEdges.filter((edge) => edge.kind === "self-play").length,
    totals,
    pressureTotals: [...pressureMap.values()],
    worldTotals: [...worldTotalMap.entries()].map(([worldLane, worldTotals]) => ({ worldLane, totals: worldTotals })),
    worldCommanders: [...worldCommanderMaps.entries()].map(([worldLane, worldCommanderMap]) => ({
      worldLane,
      commanders: [...worldCommanderMap.entries()].sort(([leftOrdinal], [rightOrdinal]) => leftOrdinal - rightOrdinal)
        .map(([ordinal, aggregate]) => ({ ordinal, aggregate }))
    })),
    commanders: [...commanderMap.entries()].sort(([left], [right]) => left - right).map(([ordinal, aggregate]) => ({ ordinal, aggregate })),
    edges: edgeSummaries,
    fleetCells: [...fleetCellMap.values()].sort((leftCell, rightCell) => leftCell.cellId.localeCompare(rightCell.cellId)),
    mechanics,
    reversal,
    worldStability,
    selfPlay,
    integrity
  };
}

function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function pearson(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta * leftDelta;
    rightSquares += rightDelta * rightDelta;
  }
  return leftSquares > 0 && rightSquares > 0 ? numerator / Math.sqrt(leftSquares * rightSquares) : 0;
}

function averageRanks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value || left.index - right.index);
  const result = Array.from({ length: values.length }, () => 0);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + end - 1) / 2;
    for (let index = start; index < end; index += 1) result[sorted[index].index] = rank;
    start = end;
  }
  return result;
}

function topOverlap(left: number[], right: number[], count: number): number {
  const top = (values: number[]) => new Set(values.map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index).slice(0, count).map((item) => item.index));
  const rightTop = top(right);
  return [...top(left)].filter((index) => rightTop.has(index)).length;
}

function aggregateSummary(aggregate: Aggregate): Omit<ModuleSummary, "module" | "profiles" | "scoreLift"> {
  const appearances = aggregate.appearances || 1;
  return {
    appearances: aggregate.appearances,
    scoreRate: aggregate.score / appearances,
    winRate: aggregate.wins / appearances,
    drawRate: aggregate.draws / appearances,
    meanProgress: aggregate.progress / appearances,
    meanDrift: aggregate.drift / appearances,
    meanRounds: aggregate.rounds / appearances,
    artifactsPerAppearance: aggregate.mechanics.artifactsEmitted / appearances,
    holdsPerAppearance: aggregate.mechanics.holds / appearances,
    condenseActionsPerAppearance: aggregate.mechanics.condenseActions / appearances,
    backlogPerRound: aggregate.mechanics.backlogArtifacts / Math.max(1, aggregate.mechanics.backlogObservations),
    batteriesPerAppearance: aggregate.mechanics.batteries / appearances,
    detonationsPerAppearance: aggregate.mechanics.detonations / appearances,
    shellsPerAppearance: aggregate.mechanics.shellsFired / appearances
  };
}

function stronglyConnectedComponentSize(nodeCount: number, arcs: Array<[number, number]>): number {
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
  const reverse = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const [from, to] of arcs) {
    adjacency[from].push(to);
    reverse[to].push(from);
  }
  const visited = Array.from({ length: nodeCount }, () => false);
  const order: number[] = [];
  for (let root = 0; root < nodeCount; root += 1) {
    if (visited[root]) continue;
    visited[root] = true;
    const stack = [{ node: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.next < adjacency[frame.node].length) {
        const target = adjacency[frame.node][frame.next];
        frame.next += 1;
        if (!visited[target]) {
          visited[target] = true;
          stack.push({ node: target, next: 0 });
        }
      } else {
        order.push(frame.node);
        stack.pop();
      }
    }
  }
  const assigned = Array.from({ length: nodeCount }, () => false);
  let largest = 0;
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const root = order[index];
    if (assigned[root]) continue;
    let size = 0;
    const stack = [root];
    assigned[root] = true;
    while (stack.length > 0) {
      const member = stack.pop()!;
      size += 1;
      for (const target of reverse[member]) {
        if (assigned[target]) continue;
        assigned[target] = true;
        stack.push(target);
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

function profileModule(profile: AttentionV4CommanderProfile, dimension: Dimension): string {
  if (dimension === "composition") return profile.compositionModule;
  if (dimension === "triage") return profile.triageModule;
  if (dimension === "movement") return profile.movementModule;
  return profile.capacityModule;
}

function moduleSummaries(
  dimension: Dimension,
  profiles: AttentionV4CommanderProfile[],
  aggregates: Aggregate[],
  globalScoreRate: number
): ModuleSummary[] {
  const modules = new Map<string, { profiles: number; aggregate: Aggregate }>();
  profiles.forEach((profile, ordinal) => {
    const module = profileModule(profile, dimension);
    const entry = modules.get(module) ?? { profiles: 0, aggregate: emptyAggregate() };
    entry.profiles += 1;
    addAggregate(entry.aggregate, aggregates[ordinal]);
    modules.set(module, entry);
  });
  return [...modules.entries()].map(([module, entry]) => {
    const aggregate = entry.aggregate;
    const appearances = aggregate.appearances || 1;
    const scoreRate = aggregate.score / appearances;
    return {
      module,
      profiles: entry.profiles,
      appearances: aggregate.appearances,
      scoreRate,
      scoreLift: scoreRate - globalScoreRate,
      winRate: aggregate.wins / appearances,
      drawRate: aggregate.draws / appearances,
      meanProgress: aggregate.progress / appearances,
      meanDrift: aggregate.drift / appearances,
      meanRounds: aggregate.rounds / appearances,
      artifactsPerAppearance: aggregate.mechanics.artifactsEmitted / appearances,
      holdsPerAppearance: aggregate.mechanics.holds / appearances,
      condenseActionsPerAppearance: aggregate.mechanics.condenseActions / appearances,
      backlogPerRound: aggregate.mechanics.backlogArtifacts / Math.max(1, aggregate.mechanics.backlogObservations),
      batteriesPerAppearance: aggregate.mechanics.batteries / appearances,
      detonationsPerAppearance: aggregate.mechanics.detonations / appearances,
      shellsPerAppearance: aggregate.mechanics.shellsFired / appearances
    };
  }).sort((left, right) => right.scoreRate - left.scoreRate || left.module.localeCompare(right.module));
}

export type AttentionV4LandscapeMergeOptions = {
  expectedEdges?: AttentionV4LandscapeEdge[];
  studyId?: AttentionV4LandscapeStudyId;
  formula?: string;
  deepDesign?: {
    kind: "regular-topology" | "fleet-matrix";
    degree: number;
    scheduleRounds: number;
    fleetCells: number;
    referenceOverlapEdges: number;
  };
};

export function mergeAttentionV4LandscapeShards(
  shards: AttentionV4LandscapeShard[],
  options: AttentionV4LandscapeMergeOptions = {}
): AttentionV4LandscapeReport {
  if (shards.length < 1) throw new Error("at least one attention-v4 landscape shard is required");
  const first = shards[0];
  for (const shard of shards) {
    if (shard.studyId !== first.studyId || shard.rulesetHash !== first.rulesetHash || shard.resolverVersion !== first.resolverVersion ||
      shard.compilerVersion !== first.compilerVersion || shard.commanderCatalogHash !== first.commanderCatalogHash ||
      attentionV4ContentHash(shard.pressures) !== attentionV4ContentHash(first.pressures) ||
      attentionV4ContentHash(shard.worldLanes) !== attentionV4ContentHash(first.worldLanes) || shard.seedScheme !== first.seedScheme ||
      shard.replayModulo !== first.replayModulo) {
      throw new Error("attention-v4 landscape shards do not share one design");
    }
  }
  const studyId = options.studyId ?? first.studyId;
  if (studyId !== first.studyId) throw new Error("attention-v4 landscape report and shards do not share one study id");
  const edgeIndexes = shards.flatMap((shard) => shard.edges.map((edge) => edge.edgeIndex));
  if (new Set(edgeIndexes).size !== edgeIndexes.length) throw new Error("attention-v4 landscape shards overlap edges");
  const catalog = createAttentionV4CommanderCatalog();
  const totals = emptyPhysicalTotals();
  const pressures = new Map(first.pressures.map((pressure) => [pressure, { ...emptyPhysicalTotals(), pressure } as PressureTotals]));
  const worldTotals = new Map(first.worldLanes.map((worldLane) => [worldLane, emptyPhysicalTotals()]));
  const worldAggregates = new Map(first.worldLanes.map((worldLane) => [worldLane, catalog.profiles.map(() => emptyScoreAggregate())]));
  const aggregates = catalog.profiles.map(() => emptyAggregate());
  const fleetCells = new Map<string, FleetCellTotals>();
  const mechanics = emptyMechanics();
  const reversal = { pairs: 0, seatDelta: 0, absoluteSeatDelta: 0, streamMismatches: 0 };
  const worldStability: WorldStabilityTotals = { comparisons: 0, exactScoreAgreements: 0, directionAgreements: 0, absoluteLeftScoreDelta: 0, streamCollisions: 0 };
  const selfPlay = { matches: 0, alphaScore: 0 };
  const integrity = { replaySentinels: 0, replayMismatches: 0, attributionMismatches: 0, commandRejections: 0 };
  for (const shard of shards) {
    addPhysicalTotals(totals, shard.totals);
    for (const item of shard.pressureTotals) addPhysicalTotals(pressures.get(item.pressure)!, item);
    for (const item of shard.worldTotals) addPhysicalTotals(worldTotals.get(item.worldLane)!, item.totals);
    for (const lane of shard.worldCommanders) {
      const target = worldAggregates.get(lane.worldLane)!;
      for (const item of lane.commanders) addScoreAggregate(target[item.ordinal], item.aggregate);
    }
    for (const item of shard.commanders) addAggregate(aggregates[item.ordinal], item.aggregate);
    for (const item of shard.fleetCells) {
      let target = fleetCells.get(item.cellId);
      if (!target) {
        target = {
          cellId: item.cellId,
          leftComposition: item.leftComposition,
          rightComposition: item.rightComposition,
          edges: 0,
          matches: 0,
          left: emptyAggregate(),
          right: emptyAggregate()
        };
        fleetCells.set(item.cellId, target);
      }
      if (target.leftComposition !== item.leftComposition || target.rightComposition !== item.rightComposition) {
        throw new Error(`attention-v4 landscape fleet cell shards disagree: ${item.cellId}`);
      }
      target.edges += item.edges;
      target.matches += item.matches;
      addAggregate(target.left, item.left);
      addAggregate(target.right, item.right);
    }
    addMechanics(mechanics, shard.mechanics);
    reversal.pairs += shard.reversal.pairs;
    reversal.seatDelta += shard.reversal.seatDelta;
    reversal.absoluteSeatDelta += shard.reversal.absoluteSeatDelta;
    reversal.streamMismatches += shard.reversal.streamMismatches;
    worldStability.comparisons += shard.worldStability.comparisons;
    worldStability.exactScoreAgreements += shard.worldStability.exactScoreAgreements;
    worldStability.directionAgreements += shard.worldStability.directionAgreements;
    worldStability.absoluteLeftScoreDelta += shard.worldStability.absoluteLeftScoreDelta;
    worldStability.streamCollisions += shard.worldStability.streamCollisions;
    selfPlay.matches += shard.selfPlay.matches;
    selfPlay.alphaScore += shard.selfPlay.alphaScore;
    integrity.replaySentinels += shard.integrity.replaySentinels;
    integrity.replayMismatches += shard.integrity.replayMismatches;
    integrity.attributionMismatches += shard.integrity.attributionMismatches;
    integrity.commandRejections += shard.integrity.commandRejections;
  }
  const edges = shards.flatMap((shard) => shard.edges).sort((left, right) => left.edgeIndex - right.edgeIndex);
  const nonSelfEdges = edges.filter((edge) => edge.kind === "matchup");
  const selfPlayEdges = edges.filter((edge) => edge.kind === "self-play");
  const expectedEdges = options.expectedEdges ?? createAttentionV4LandscapeEdges();
  const expectedNonSelfEdges = expectedEdges.filter((edge) => edge.kind === "matchup");
  const expectedSelfPlayEdges = expectedEdges.filter((edge) => edge.kind === "self-play");
  const designOffsets = [...new Set(expectedNonSelfEdges.map((edge) => edge.offset))];
  const expectedMatchesPerMatchup = first.pressures.length * first.worldLanes.length * 2;
  const expectedMatchesPerSelfPlay = first.pressures.length * first.worldLanes.length;
  const topologyMatches = edges.length === expectedEdges.length && edges.every((edge, index) => {
    const expected = expectedEdges[index];
    return edge.edgeIndex === expected.edgeIndex && edge.edgeId === expected.edgeId && edge.kind === expected.kind &&
      edge.stratum === expected.stratum && edge.leftOrdinal === expected.leftOrdinal && edge.rightOrdinal === expected.rightOrdinal &&
      edge.matches === (edge.kind === "self-play" ? expectedMatchesPerSelfPlay : expectedMatchesPerMatchup);
  });
  const expectedPhysicalMatches = attentionV4LandscapeMatchCount(expectedEdges, first.pressures.length, first.worldLanes.length);
  const deepStudy = first.studyId === "attention-v4.2-regular-topology-1" || first.studyId === "attention-v4.2-fleet-matrix-1";
  const worldDesignMatches = deepStudy
    ? first.seedScheme === "pair-keyed-world-v1" && attentionV4ContentHash(first.worldLanes) === attentionV4ContentHash(ATTENTION_V4_DEEP_WORLD_LANES)
    : first.seedScheme === "legacy-edge-index-v1" && attentionV4ContentHash(first.worldLanes) === attentionV4ContentHash([0]);
  const complete = topologyMatches && nonSelfEdges.length === expectedNonSelfEdges.length && selfPlayEdges.length === expectedSelfPlayEdges.length &&
    totals.matches === expectedPhysicalMatches && first.replayModulo === ATTENTION_V4_LANDSCAPE_REPLAY_MODULO &&
    attentionV4ContentHash(first.pressures) === attentionV4ContentHash(ATTENTION_V4_LANDSCAPE_PRESSURES) && worldDesignMatches;
  const participantAppearances = aggregates.reduce((sum, aggregate) => sum + aggregate.appearances, 0);
  const globalScoreRate = aggregates.reduce((sum, aggregate) => sum + aggregate.score, 0) / Math.max(1, participantAppearances);
  const dominanceThreshold = 0.55;
  const arcs: Array<[number, number]> = [];
  const dominanceWins = Array.from({ length: catalog.profiles.length }, () => 0);
  const dominanceLosses = Array.from({ length: catalog.profiles.length }, () => 0);
  let neutralEdges = 0;
  for (const edge of nonSelfEdges) {
    if (edge.leftScore > dominanceThreshold) {
      arcs.push([edge.leftOrdinal, edge.rightOrdinal]);
      dominanceWins[edge.leftOrdinal] += 1;
      dominanceLosses[edge.rightOrdinal] += 1;
    } else if (edge.leftScore < 1 - dominanceThreshold) {
      arcs.push([edge.rightOrdinal, edge.leftOrdinal]);
      dominanceWins[edge.rightOrdinal] += 1;
      dominanceLosses[edge.leftOrdinal] += 1;
    } else neutralEdges += 1;
  }
  const largestScc = stronglyConnectedComponentSize(catalog.profiles.length, arcs);
  const commanderAll: CommanderSummary[] = catalog.profiles.map((profile, ordinal) => {
    const aggregate = aggregates[ordinal];
    const appearances = aggregate.appearances || 1;
    return {
      ordinal,
      commanderId: profile.commanderId,
      composition: profile.compositionModule,
      triage: profile.triageModule,
      movement: profile.movementModule,
      capacity: profile.capacityModule,
      appearances: aggregate.appearances,
      scoreRate: aggregate.score / appearances,
      wins: aggregate.wins,
      losses: aggregate.losses,
      draws: aggregate.draws,
      meanProgress: aggregate.progress / appearances,
      meanDrift: aggregate.drift / appearances,
      dominanceWins: dominanceWins[ordinal],
      dominanceLosses: dominanceLosses[ordinal]
    };
  });
  const ranking = [...commanderAll].sort((left, right) => right.scoreRate - left.scoreRate || left.meanDrift - right.meanDrift || right.meanProgress - left.meanProgress || left.ordinal - right.ordinal);
  const scores = commanderAll.map((commander) => commander.scoreRate);
  const maxScore = Math.max(...scores);
  const temperature = 0.03;
  const weights = scores.map((score) => Math.exp((score - maxScore) / temperature));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const entropy = weights.reduce((sum, weight) => {
    const probability = weight / weightTotal;
    return probability > 0 ? sum - probability * Math.log(probability) : sum;
  }, 0);
  const minimumCommanderAppearances = Math.min(...aggregates.map((aggregate) => aggregate.appearances));
  const maximumCommanderAppearances = Math.max(...aggregates.map((aggregate) => aggregate.appearances));
  const allProfilesObserved = minimumCommanderAppearances > 0;
  const expectedReversalPairs = expectedNonSelfEdges.length * ATTENTION_V4_LANDSCAPE_PRESSURES.length * first.worldLanes.length;
  const expectedSelfPlayMatches = expectedSelfPlayEdges.length * ATTENTION_V4_LANDSCAPE_PRESSURES.length * first.worldLanes.length;
  const expectedReplaySentinels = expectedEdges.filter((edge) => edge.edgeIndex % ATTENTION_V4_LANDSCAPE_REPLAY_MODULO === 0).length;
  const expectedCommanderAppearances = expectedPhysicalMatches * 2 / catalog.profiles.length;
  const expectedWorldCommanderAppearances = expectedCommanderAppearances / first.worldLanes.length;
  const worldTotalsClose = [...worldTotals.values()].reduce((sum, item) => sum + item.matches, 0) === totals.matches;
  const worldProfilesComplete = [...worldAggregates.values()].every((lane) => lane.every((aggregate) =>
    aggregate.appearances === expectedWorldCommanderAppearances));
  const expectedWorldComparisons = first.worldLanes.length === 2
    ? expectedNonSelfEdges.length * ATTENTION_V4_LANDSCAPE_PRESSURES.length
    : 0;
  const integrityPassed = complete && integrity.replayMismatches === 0 && reversal.streamMismatches === 0 &&
    integrity.attributionMismatches === 0 && integrity.commandRejections === 0 && allProfilesObserved &&
    Number.isInteger(expectedCommanderAppearances) && minimumCommanderAppearances === expectedCommanderAppearances &&
    maximumCommanderAppearances === expectedCommanderAppearances && reversal.pairs === expectedReversalPairs &&
    selfPlay.matches === expectedSelfPlayMatches && integrity.replaySentinels === expectedReplaySentinels &&
    worldStability.comparisons === expectedWorldComparisons && worldStability.streamCollisions === 0 &&
    worldTotalsClose && worldProfilesComplete;
  const physicalMatches = totals.matches || 1;
  const formula = options.formula ?? "12,800 sparse pairs x 2 seats x 4 pressures + 3,200 self-play pairs x 4 pressures";
  if (deepStudy && !options.deepDesign) throw new Error("deep attention-v4 landscape reports require a design descriptor");
  if (!deepStudy && options.deepDesign) throw new Error("canonical attention-v4 landscape reports cannot carry a deep design descriptor");
  const laneScoreVectors = first.worldLanes.map((worldLane) => worldAggregates.get(worldLane)!
    .map((aggregate) => aggregate.score / Math.max(1, aggregate.appearances)));
  const laneScoreDifferences = laneScoreVectors.length === 2
    ? laneScoreVectors[0].map((score, index) => Math.abs(score - laneScoreVectors[1][index]))
    : [];
  const fleetMatchups = [...fleetCells.values()].sort((left, right) => left.cellId.localeCompare(right.cellId)).map((cell) => ({
    cellId: cell.cellId,
    leftComposition: cell.leftComposition,
    rightComposition: cell.rightComposition,
    edges: cell.edges,
    matches: cell.matches,
    leftScoreRate: cell.left.score / Math.max(1, cell.left.appearances),
    drawRate: cell.left.draws / Math.max(1, cell.left.appearances),
    left: aggregateSummary(cell.left),
    right: aggregateSummary(cell.right)
  }));
  const progressEntries = Object.entries(totals.participantProgressHistogram).map(([progress, count]) => [Number(progress), count] as const);
  const progressAtLeast = (threshold: number) => progressEntries.reduce((sum, [progress, count]) => sum + (progress >= threshold ? count : 0), 0);
  const reportWithoutHash = {
    schemaVersion: deepStudy ? 2 as const : 1 as const,
    studyId,
    evidenceClass: "descriptive-exploration" as const,
    causalClaim: false as const,
    modelVersion: "duel-capacity-v3-experimental" as const,
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    commanderCatalogHash: catalog.catalogHash,
    design: {
      formula,
      commanders: catalog.profiles.length,
      offsets: designOffsets,
      nonSelfEdges: nonSelfEdges.length,
      selfPlayEdges: selfPlayEdges.length,
      pressureSamples: [...first.pressures],
      physicalMatches: totals.matches,
      reversalPairs: reversal.pairs,
      replaySentinels: integrity.replaySentinels,
      complete,
      ...(deepStudy ? {
        deep: {
          ...options.deepDesign!,
          worldLanes: [...first.worldLanes],
          seedScheme: first.seedScheme
        }
      } : {})
    },
    integrity: {
      replayMismatches: integrity.replayMismatches,
      streamMismatches: reversal.streamMismatches,
      attributionMismatches: integrity.attributionMismatches,
      commandRejections: integrity.commandRejections,
      minimumCommanderAppearances,
      maximumCommanderAppearances,
      allProfilesObserved,
      passed: integrityPassed,
      ...(deepStudy ? { worldStreamCollisions: worldStability.streamCollisions } : {})
    },
    outcomes: {
      alphaWins: totals.alphaWins,
      bravoWins: totals.bravoWins,
      draws: totals.draws,
      alphaScoreRate: (totals.alphaWins + totals.draws * 0.5) / physicalMatches,
      meanRounds: totals.rounds / physicalMatches,
      meanParticipantProgress: totals.participantProgress / (physicalMatches * 2),
      meanParticipantDrift: totals.participantDrift / (physicalMatches * 2),
      meanParticipantAttention: totals.participantAttention / (physicalMatches * 2),
      terminalReasons: Object.fromEntries(Object.entries(totals.terminalReasons).sort(([left], [right]) => left.localeCompare(right))),
      roundHistogram: Object.fromEntries(Object.entries(totals.roundHistogram).sort(([left], [right]) => Number(left) - Number(right))),
      byPressure: [...pressures.values()].map((item) => ({
        pressure: item.pressure,
        matches: item.matches,
        alphaScoreRate: (item.alphaWins + item.draws * 0.5) / Math.max(1, item.matches),
        drawRate: item.draws / Math.max(1, item.matches),
        meanRounds: item.rounds / Math.max(1, item.matches),
        meanProgress: item.participantProgress / Math.max(1, item.matches * 2),
        meanDrift: item.participantDrift / Math.max(1, item.matches * 2)
      })),
      byStratum: (["uniform", "nearby", "adversarial", "self-play"] as const).map((stratum) => {
        const selected = edges.filter((edge) => edge.stratum === stratum);
        const matches = selected.reduce((sum, edge) => sum + edge.matches, 0);
        const decisive = selected.filter((edge) => edge.kind === "matchup" && (edge.leftScore > dominanceThreshold || edge.leftScore < 1 - dominanceThreshold)).length;
        return {
          stratum,
          edges: selected.length,
          matches,
          meanLeftScore: selected.reduce((sum, edge) => sum + edge.leftScore, 0) / Math.max(1, selected.length),
          drawRate: selected.reduce((sum, edge) => sum + edge.draws, 0) / Math.max(1, matches),
          dominanceEdgeRate: decisive / Math.max(1, selected.filter((edge) => edge.kind === "matchup").length)
        };
      })
    },
    seat: {
      exactReversalPairs: reversal.pairs,
      meanFocalAlphaSeatEffect: reversal.seatDelta / Math.max(1, reversal.pairs),
      meanAbsoluteReversalEffect: reversal.absoluteSeatDelta / Math.max(1, reversal.pairs),
      selfPlayMatches: selfPlay.matches,
      selfPlayAlphaScoreRate: selfPlay.alphaScore / Math.max(1, selfPlay.matches)
    },
    mechanics: {
      ...mechanics,
      perParticipant: Object.fromEntries((Object.keys(mechanics) as Array<keyof Mechanics>).map((key) => [key, mechanics[key] / Math.max(1, participantAppearances)])) as Record<keyof Mechanics, number>
    },
    balance: {
      chassis: {
        scout: { emits: mechanics.scoutEmits, holds: mechanics.scoutHolds, artifacts: mechanics.scoutArtifacts, batteries: mechanics.scoutBatteries, detonations: mechanics.scoutDetonations, detonationDrift: mechanics.scoutDetonationDrift },
        line: { emits: mechanics.lineEmits, holds: mechanics.lineHolds, artifacts: mechanics.lineArtifacts, batteries: mechanics.lineBatteries, detonations: mechanics.lineDetonations, detonationDrift: mechanics.lineDetonationDrift },
        heavy: { emits: mechanics.heavyEmits, holds: mechanics.heavyHolds, artifacts: mechanics.heavyArtifacts, batteries: mechanics.heavyBatteries, detonations: mechanics.heavyDetonations, detonationDrift: mechanics.heavyDetonationDrift }
      },
      scoutCondense: { plan0: mechanics.scoutPlansCondense0, plan1: mechanics.scoutPlansCondense1, plan2: mechanics.scoutPlansCondense2, actions: mechanics.condenseActions },
      backlog: {
        observations: mechanics.backlogObservations,
        meanArtifacts: mechanics.backlogArtifacts / Math.max(1, mechanics.backlogObservations),
        meanAge: mechanics.backlogAge / Math.max(1, mechanics.backlogArtifacts),
        meanTraffic: mechanics.backlogTraffic / Math.max(1, mechanics.backlogArtifacts),
        overtaxedRate: mechanics.backlogOvertaxed / Math.max(1, mechanics.backlogArtifacts),
        bySourceChassis: { scout: mechanics.backlogScout, line: mechanics.backlogLine, heavy: mechanics.backlogHeavy }
      }
    },
    modules: {
      composition: moduleSummaries("composition", catalog.profiles, aggregates, globalScoreRate),
      triage: moduleSummaries("triage", catalog.profiles, aggregates, globalScoreRate),
      movement: moduleSummaries("movement", catalog.profiles, aggregates, globalScoreRate),
      capacity: moduleSummaries("capacity", catalog.profiles, aggregates, globalScoreRate)
    },
    commanders: {
      effectiveCountAtTemperature003: Math.exp(entropy),
      scoreQuantiles: {
        p05: quantile(scores, 0.05),
        p25: quantile(scores, 0.25),
        p50: quantile(scores, 0.5),
        p75: quantile(scores, 0.75),
        p95: quantile(scores, 0.95)
      },
      top: ranking.slice(0, 25),
      bottom: ranking.slice(-25).reverse(),
      all: commanderAll
    },
    counterplay: {
      dominanceThreshold,
      dominanceArcs: arcs.length,
      largestStronglyConnectedComponent: largestScc,
      largestStronglyConnectedFraction: largestScc / catalog.profiles.length,
      neutralEdges
    },
    ...(deepStudy ? {
      progressPath: {
        participantHistogram: Object.fromEntries(progressEntries.sort(([left], [right]) => left - right).map(([progress, count]) => [String(progress), count])),
        atLeast8: progressAtLeast(8),
        atLeast10: progressAtLeast(10),
        atLeast12: progressAtLeast(12),
        terminalStateClasses: Object.fromEntries(Object.entries(totals.terminalStateClasses).sort(([left], [right]) => left.localeCompare(right)))
      },
      worlds: {
        lanes: [...first.worldLanes],
        seedScheme: first.seedScheme,
        byLane: first.worldLanes.map((worldLane) => {
          const lane = worldTotals.get(worldLane)!;
          return {
            worldLane,
            matches: lane.matches,
            alphaScoreRate: (lane.alphaWins + lane.draws * 0.5) / Math.max(1, lane.matches),
            meanRounds: lane.rounds / Math.max(1, lane.matches),
            meanParticipantProgress: lane.participantProgress / Math.max(1, lane.matches * 2),
            meanParticipantDrift: lane.participantDrift / Math.max(1, lane.matches * 2)
          };
        }),
        comparisons: worldStability.comparisons,
        exactScoreAgreementRate: worldStability.exactScoreAgreements / Math.max(1, worldStability.comparisons),
        directionAgreementRate: worldStability.directionAgreements / Math.max(1, worldStability.comparisons),
        meanAbsoluteLeftScoreDelta: worldStability.absoluteLeftScoreDelta / Math.max(1, worldStability.comparisons),
        profileScorePearson: laneScoreVectors.length === 2 ? pearson(laneScoreVectors[0], laneScoreVectors[1]) : 1,
        profileScoreSpearman: laneScoreVectors.length === 2 ? pearson(averageRanks(laneScoreVectors[0]), averageRanks(laneScoreVectors[1])) : 1,
        meanAbsoluteProfileScoreDelta: laneScoreDifferences.reduce((sum, value) => sum + value, 0) / Math.max(1, laneScoreDifferences.length),
        p95AbsoluteProfileScoreDelta: quantile(laneScoreDifferences, 0.95),
        top25Overlap: laneScoreVectors.length === 2 ? topOverlap(laneScoreVectors[0], laneScoreVectors[1], 25) : 25,
        top100Overlap: laneScoreVectors.length === 2 ? topOverlap(laneScoreVectors[0], laneScoreVectors[1], 100) : 100
      },
      fleetMatchups
    } : {})
  };
  return { ...reportWithoutHash, reportHash: attentionV4ContentHash(reportWithoutHash) };
}
