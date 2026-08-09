import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_COMMANDER_PROFILE_COUNT,
  ATTENTION_V2_COMPOSITION_MODULES,
  ATTENTION_V2_FACTOR_COUNT,
  ATTENTION_V2_MODEL_VERSION,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_PLANNER_VERSION,
  ATTENTION_V2_RULE_FACTOR_LEVELS,
  ATTENTION_V2_RULE_FACTOR_NAMES,
  ATTENTION_V2_SWEEP_FACTORS,
  ATTENTION_V2_SWEEP_RUNS,
  ATTENTION_V2_TRIAGE_MODULES,
  AttentionV2BattleSampleRefSchema,
  AttentionV2CommanderCatalogSchema,
  AttentionV2FactorCatalogSchema,
  AttentionV2FoldAssignmentSchema,
  AttentionV2ModelCatalogSchema,
  AttentionV2PairedWorldBlockSchema,
  AttentionV2RunPlannerIdentitySchema,
  AttentionV2RuleShapeSchema,
  AttentionV2SparseBattleSampleSchema,
  AttentionV2SparseMatchupEdgeSchema,
  AttentionV2SweepBudgetSchema,
  AttentionV2SweepPlanSchema,
  BATTLE_VOLUME_CELLS,
  BATTLE_VOLUME_EDGE,
  type AttentionV2BattleSampleCatalogRef,
  type AttentionV2BattleSampleRef,
  type AttentionV2CommanderCatalog,
  type AttentionV2CommanderProfile,
  type AttentionV2EdgeCatalogRef,
  type AttentionV2FactorCatalog,
  type AttentionV2FoldAssignment,
  type AttentionV2ModelCatalog,
  type AttentionV2ModelDefinition,
  type AttentionV2PairedWorldBlock,
  type AttentionV2PlannerIdentity,
  type AttentionV2RuleShape,
  type AttentionV2RunPlannerIdentity,
  type AttentionV2SamplingWeight,
  type AttentionV2SparseBattleSample,
  type AttentionV2SparseMatchupEdge,
  type AttentionV2SweepBudget,
  type AttentionV2SweepFold,
  type AttentionV2SweepPlan,
  type AttentionV2StageModelSetRef,
  type AttentionV2SweepStage,
  type BattleVolumeRefV1
} from "@landscape/contracts";
import { sha256Value, type Sha256Digest } from "./provenance.js";

export const LANDSCAPE_SWEEP_PLANNER_VERSION = ATTENTION_V2_PLANNER_VERSION;
export const LANDSCAPE_SWEEP_REQUIRED_RESOLVER = "attention-v2" as const;
export const LANDSCAPE_SWEEP_EXECUTION_STATUS = "requires-v2-resolver" as const;
export const ATTENTION_V2_SWEEP_MODEL_ROWS = 40 as const;
export const ATTENTION_V2_SPARSE_DEGREE = 8 as const;
export const ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT = 256 as const;

export type LandscapeSweepBudgetProfile = keyof typeof ATTENTION_V2_SWEEP_RUNS;

export type LandscapeCommanderModule<ModuleId extends string = string> = {
  moduleId: ModuleId;
  label: string;
  shortId?: string;
};

export type LandscapeBaseMatchupEdge = {
  leftCommanderId: string;
  rightCommanderId: string;
  stratum: "uniform" | "nearby" | "adversarial" | "sentinel";
  samplingWeight: AttentionV2SamplingWeight;
  pairHash: Sha256Digest;
};

export type LandscapeEdgeCatalog = {
  schemaVersion: 1;
  plannerVersion: typeof LANDSCAPE_SWEEP_PLANNER_VERSION;
  modelVersion: typeof ATTENTION_V2_MODEL_VERSION;
  catalogId: string;
  fold: AttentionV2SweepFold;
  stage: AttentionV2SweepStage;
  degree: number;
  selectionDesignHash: Sha256Digest;
  baseEdges: LandscapeBaseMatchupEdge[];
  edges: AttentionV2SparseMatchupEdge[];
  catalogHash: Sha256Digest;
};

export type LandscapeSparseGraph = LandscapeEdgeCatalog;

export type LandscapeBattleSampleCatalog = {
  schemaVersion: 1;
  plannerVersion: typeof LANDSCAPE_SWEEP_PLANNER_VERSION;
  modelVersion: typeof ATTENTION_V2_MODEL_VERSION;
  catalogId: string;
  fold: AttentionV2SweepFold;
  stage: AttentionV2SweepStage;
  sampleFrameHash: Sha256Digest;
  selectionDesignHash: Sha256Digest;
  samples: AttentionV2BattleSampleRef[];
  catalogHash: Sha256Digest;
};

export type LandscapeSweepStageSpecification = {
  stage: AttentionV2SweepStage;
  fold: AttentionV2SweepFold;
  sampleSpace: "sparse-matchup-graph" | "sparse-256-battle-volume" | "full-32-cubed-battle-volume" | "confirmation-reserve";
  executionStatus: typeof LANDSCAPE_SWEEP_EXECUTION_STATUS;
};

export type LandscapeSweepSkeleton = {
  factorCatalog: AttentionV2FactorCatalog;
  modelCatalog: AttentionV2ModelCatalog;
  commanderCatalog: AttentionV2CommanderCatalog;
  edgeCatalogs: LandscapeEdgeCatalog[];
  battleSamples: AttentionV2BattleSampleRef[];
  sparseBattleSamples: AttentionV2SparseBattleSample[];
  battleSampleCatalogs: LandscapeBattleSampleCatalog[];
  folds: AttentionV2FoldAssignment[];
  stages: LandscapeSweepStageSpecification[];
  budgets: AttentionV2SweepBudget[];
  edgeCatalogSetHash: Sha256Digest;
  battleSampleCatalogSetHash: Sha256Digest;
  foldAssignmentHash: Sha256Digest;
};

export type CreateLandscapeSweepPlanOptions = {
  parentV1ManifestHash: Sha256Digest;
  parentV1ReportHash: Sha256Digest;
  parentV1ModelHash: Sha256Digest;
  createdAt: string;
  budgetProfile?: LandscapeSweepBudgetProfile;
  seedStart?: number;
};

export type LandscapeSweepArtifacts = LandscapeSweepSkeleton & { plan: AttentionV2SweepPlan };

export const attentionV2CompositionModules: readonly LandscapeCommanderModule<typeof ATTENTION_V2_COMPOSITION_MODULES[number]>[] = Object.freeze([
  { moduleId: "scout-scout-scout", shortId: "sss", label: "Scout / Scout / Scout" },
  { moduleId: "scout-scout-line", shortId: "ssl", label: "Scout / Scout / Line" },
  { moduleId: "scout-scout-siege", shortId: "ssg", label: "Scout / Scout / Siege" },
  { moduleId: "scout-line-line", shortId: "sll", label: "Scout / Line / Line" },
  { moduleId: "scout-line-siege", shortId: "slg", label: "Scout / Line / Siege" },
  { moduleId: "scout-siege-siege", shortId: "sgg", label: "Scout / Siege / Siege" },
  { moduleId: "line-line-line", shortId: "lll", label: "Line / Line / Line" },
  { moduleId: "line-line-siege", shortId: "llg", label: "Line / Line / Siege" },
  { moduleId: "line-siege-siege", shortId: "lgg", label: "Line / Siege / Siege" },
  { moduleId: "siege-siege-siege", shortId: "ggg", label: "Siege / Siege / Siege" }
]);

export const attentionV2TriageModules: readonly LandscapeCommanderModule<typeof ATTENTION_V2_TRIAGE_MODULES[number]>[] = Object.freeze([
  { moduleId: "accept-all", label: "Accept all" },
  { moduleId: "verify-lowest", label: "Verify lowest confidence" },
  { moduleId: "seize-cheapest", label: "Seize cheapest" },
  { moduleId: "confidence-reject", label: "Confidence-guided rejection" },
  { moduleId: "confidence-verify", label: "Confidence-guided verification" },
  { moduleId: "recon-reject", label: "Recon-guided rejection" },
  { moduleId: "line-assist", label: "Line assistance" },
  { moduleId: "siege-seize", label: "Siege seizure" },
  { moduleId: "risk-adaptive", label: "Risk-adaptive triage" },
  { moduleId: "pressure-adaptive", label: "Pressure-adaptive triage" }
]);

export const attentionV2MovementModules: readonly LandscapeCommanderModule<typeof ATTENTION_V2_MOVEMENT_MODULES[number]>[] = Object.freeze([
  { moduleId: "hold", label: "Hold position" },
  { moduleId: "own-front", label: "Approach own front" },
  { moduleId: "enemy-front", label: "Approach enemy front" },
  { moduleId: "chassis-native", label: "Chassis-native movement" },
  { moduleId: "scout-mobile", label: "Mobile scouts" },
  { moduleId: "escort", label: "Escort formation" },
  { moduleId: "siege-anchor", label: "Siege anchor" },
  { moduleId: "flare-evade", label: "Flare evasion" }
]);

export const attentionV2CapacityModules: readonly LandscapeCommanderModule<typeof ATTENTION_V2_CAPACITY_MODULES[number]>[] = Object.freeze([
  { moduleId: "never", label: "Never invest" },
  { moduleId: "pioneer-focus", label: "Pioneer Perfect Focus" },
  { moduleId: "follower-focus", label: "Follower Perfect Focus" },
  { moduleId: "pioneer-overclock", label: "Pioneer Overclock" },
  { moduleId: "follower-overclock", label: "Follower Overclock" },
  { moduleId: "pioneer-flare", label: "Pioneer Macro Flare" },
  { moduleId: "follower-flare", label: "Follower Macro Flare" },
  { moduleId: "adaptive", label: "Adaptive capacity investment" }
]);

function withoutHash<T extends Record<string, unknown>, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

export function createAttentionV2FactorCatalog(): AttentionV2FactorCatalog {
  const draft = {
    schemaVersion: 1 as const,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    factorCount: ATTENTION_V2_FACTOR_COUNT,
    definitions: ATTENTION_V2_RULE_FACTOR_NAMES.map((factor) => ({
      factor,
      levels: [...ATTENTION_V2_RULE_FACTOR_LEVELS[factor]]
    }))
  };
  return AttentionV2FactorCatalogSchema.parse({ ...draft, catalogHash: sha256Value(draft) });
}

export const ATTENTION_V2_FACTOR_CATALOG_HASH = createAttentionV2FactorCatalog().catalogHash as Sha256Digest;

const v1RuleShape: AttentionV2RuleShape = {
  attentionBudget: 3,
  verifyCost: 1,
  objectiveTarget: 12,
  driftLimit: 4,
  baseSoundness: 0.7,
  objectiveCoupling: "binary-front",
  throughputShape: "v1",
  seizeCostShape: "v1",
  calibrationSeparation: "v1",
  movementSeparation: "v1",
  stationaryQualification: "resolved-zero",
  scoutStationaryPayload: "calibration-boost",
  lineStationaryPayload: "banked-guarantee",
  siegeStationaryPayload: "delayed-attention",
  capacityTopology: "shared-exclusive",
  abilityUnlockBasis: "personal-claim-count",
  abilityPackage: "complete",
  unresolvedDisposition: "auto-accept"
};

const coreSentinelRuleShape: AttentionV2RuleShape = {
  ...v1RuleShape,
  stationaryQualification: "voluntary-hold",
  unresolvedDisposition: "bounded-backlog"
};

const allOnSentinelRuleShape = AttentionV2RuleShapeSchema.parse(Object.fromEntries(
  ATTENTION_V2_RULE_FACTOR_NAMES.map((factor) => [factor, ATTENTION_V2_RULE_FACTOR_LEVELS[factor][2]])
));

const fastFollowerSentinelRuleShape: AttentionV2RuleShape = {
  attentionBudget: 4,
  verifyCost: 0,
  objectiveTarget: 9,
  driftLimit: 5,
  baseSoundness: 0.8,
  objectiveCoupling: "distance-weighted-front",
  throughputShape: "scout-forward",
  seizeCostShape: "flat",
  calibrationSeparation: "polarized",
  movementSeparation: "scout-forward",
  stationaryQualification: "committed-streak",
  scoutStationaryPayload: "free-verify",
  lineStationaryPayload: "spatial-aura",
  siegeStationaryPayload: "claim-subsidy",
  capacityTopology: "pioneer-copy",
  abilityUnlockBasis: "owned-rank",
  abilityPackage: "role-separated",
  unresolvedDisposition: "confidence-default"
};

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function balancedDesignRuleShapes(designSeed: number): AttentionV2RuleShape[] {
  const columns = ATTENTION_V2_RULE_FACTOR_NAMES.map((_factor, factorIndex) => {
    const levels = Array.from({ length: 36 }, (_, row) => row % 3);
    const random = deterministicRandom((designSeed ^ Math.imul(factorIndex + 1, 0x9e3779b1)) >>> 0);
    for (let index = levels.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [levels[index], levels[swap]] = [levels[swap], levels[index]];
    }
    return levels;
  });
  return Array.from({ length: 36 }, (_, row) => AttentionV2RuleShapeSchema.parse(Object.fromEntries(
    ATTENTION_V2_RULE_FACTOR_NAMES.map((factor, factorIndex) => [factor, ATTENTION_V2_RULE_FACTOR_LEVELS[factor][columns[factorIndex][row]]])
  )));
}

function ruleLevelIndex(ruleShape: AttentionV2RuleShape, factor: typeof ATTENTION_V2_RULE_FACTOR_NAMES[number]): number {
  const index = ATTENTION_V2_RULE_FACTOR_LEVELS[factor].findIndex((level) => level === ruleShape[factor]);
  if (index < 0) throw new Error(`Unknown ${factor} level`);
  return index;
}

function matrixRank(input: readonly number[][], tolerance = 1e-10): number {
  const matrix = input.map((row) => [...row]);
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  let rank = 0;
  for (let column = 0; column < columns && rank < rows; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < rows; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) <= tolerance) continue;
    [matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
    const divisor = matrix[rank][column];
    for (let entry = column; entry < columns; entry += 1) matrix[rank][entry] /= divisor;
    for (let row = 0; row < rows; row += 1) {
      if (row === rank) continue;
      const multiplier = matrix[row][column];
      if (Math.abs(multiplier) <= tolerance) continue;
      for (let entry = column; entry < columns; entry += 1) matrix[row][entry] -= multiplier * matrix[rank][entry];
    }
    rank += 1;
  }
  return rank;
}

export function analyzeAttentionV2MainEffectDesign(ruleShapes: readonly AttentionV2RuleShape[]): {
  mainEffectColumns: 37;
  mainEffectRank: number;
  maxAbsoluteAlias: number;
} {
  const dummyMatrix = ruleShapes.map((ruleShape) => [
    1,
    ...ATTENTION_V2_RULE_FACTOR_NAMES.flatMap((factor) => {
      const level = ruleLevelIndex(ruleShape, factor);
      return [level === 1 ? 1 : 0, level === 2 ? 1 : 0];
    })
  ]);
  const contrastColumns = ATTENTION_V2_RULE_FACTOR_NAMES.flatMap((factor) => {
    const levels = ruleShapes.map((ruleShape) => ruleLevelIndex(ruleShape, factor));
    return [levels.map((level) => [-1, 0, 1][level]), levels.map((level) => [1, -2, 1][level])];
  }).map((column) => {
    const mean = column.reduce((sum, value) => sum + value, 0) / column.length;
    const centered = column.map((value) => value - mean);
    const norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0));
    return centered.map((value) => value / norm);
  });
  let maxAbsoluteAlias = 0;
  for (let left = 0; left < contrastColumns.length; left += 1) {
    for (let right = left + 1; right < contrastColumns.length; right += 1) {
      const correlation = contrastColumns[left].reduce((sum, value, row) => sum + value * contrastColumns[right][row], 0);
      maxAbsoluteAlias = Math.max(maxAbsoluteAlias, Math.abs(correlation));
    }
  }
  return {
    mainEffectColumns: 37,
    mainEffectRank: matrixRank(dummyMatrix),
    maxAbsoluteAlias: Number(maxAbsoluteAlias.toFixed(12))
  };
}

function modelDefinition(
  designRow: number,
  role: AttentionV2ModelDefinition["role"],
  ruleShape: AttentionV2RuleShape,
  parentV1ModelHash: Sha256Digest
): AttentionV2ModelDefinition {
  const ruleShapeHash = sha256Value(ruleShape);
  return {
    schemaVersion: 2,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    modelId: `attention-v2-model-${String(designRow).padStart(2, "0")}-${ruleShapeHash.slice(7, 23)}`,
    designRow,
    role,
    ruleShape,
    ruleShapeHash,
    resolverRequirement: LANDSCAPE_SWEEP_REQUIRED_RESOLVER,
    parentV1ModelHash
  };
}

export function createAttentionV2ModelCatalog(parentV1ModelHash: Sha256Digest): AttentionV2ModelCatalog {
  let designSeed = 0;
  let ruleShapes: AttentionV2RuleShape[] = [];
  let diagnostics = { mainEffectColumns: 37 as const, mainEffectRank: 0, maxAbsoluteAlias: 1 };
  for (let candidateSeed = 1; candidateSeed <= 10_000; candidateSeed += 1) {
    const candidate = [
      ...balancedDesignRuleShapes(candidateSeed),
      v1RuleShape,
      coreSentinelRuleShape,
      allOnSentinelRuleShape,
      fastFollowerSentinelRuleShape
    ];
    if (new Set(candidate.map((ruleShape) => sha256Value(ruleShape))).size !== 40) continue;
    const candidateDiagnostics = analyzeAttentionV2MainEffectDesign(candidate);
    if (candidateDiagnostics.mainEffectRank === 37 && candidateDiagnostics.maxAbsoluteAlias <= 0.75) {
      designSeed = candidateSeed;
      ruleShapes = candidate;
      diagnostics = candidateDiagnostics;
      break;
    }
  }
  if (designSeed === 0) throw new Error("Unable to construct a full-rank bounded-alias attention-v2 main-effect design");
  const roles: AttentionV2ModelDefinition["role"][] = [
    ...Array.from({ length: 36 }, () => "design" as const),
    "v1-bridge",
    "core-sentinel",
    "all-on-sentinel",
    "fast-follower-sentinel"
  ];
  const models = ruleShapes.map((ruleShape, row) => modelDefinition(row, roles[row], ruleShape, parentV1ModelHash));
  const bridge = models.find((model) => model.role === "v1-bridge");
  if (!bridge) throw new Error("Attention-v2 model design is missing its v1 bridge");
  const prehash = sha256Value({ schemaVersion: 1, modelVersion: ATTENTION_V2_MODEL_VERSION, models });
  const draft = {
    schemaVersion: 1 as const,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    designKind: "constrained-balanced-main-effects" as const,
    factorCount: ATTENTION_V2_FACTOR_COUNT,
    catalogId: `attention-v2-models-${prehash.slice(7, 31)}`,
    v1BridgeModelId: bridge.modelId,
    designDiagnostics: { designSeed, ...diagnostics },
    models
  };
  return AttentionV2ModelCatalogSchema.parse({ ...draft, catalogHash: sha256Value(draft) });
}

function commanderProfileWithoutHash(
  ordinal: number,
  compositionModule: typeof ATTENTION_V2_COMPOSITION_MODULES[number],
  triageModule: typeof ATTENTION_V2_TRIAGE_MODULES[number],
  movementModule: typeof ATTENTION_V2_MOVEMENT_MODULES[number],
  capacityModule: typeof ATTENTION_V2_CAPACITY_MODULES[number]
) {
  return { schemaVersion: 1 as const, ordinal, compositionModule, triageModule, movementModule, capacityModule, resolverRequirement: LANDSCAPE_SWEEP_REQUIRED_RESOLVER };
}

export function createAttentionV2CommanderCatalog(): AttentionV2CommanderCatalog {
  const profiles: AttentionV2CommanderProfile[] = [];
  for (const compositionModule of ATTENTION_V2_COMPOSITION_MODULES) {
    for (const triageModule of ATTENTION_V2_TRIAGE_MODULES) {
      for (const movementModule of ATTENTION_V2_MOVEMENT_MODULES) {
        for (const capacityModule of ATTENTION_V2_CAPACITY_MODULES) {
          const normalized = commanderProfileWithoutHash(profiles.length, compositionModule, triageModule, movementModule, capacityModule);
          const profileHash = sha256Value(normalized);
          profiles.push({ ...normalized, commanderId: `attention-v2-commander-${profileHash.slice(7, 31)}`, profileHash });
        }
      }
    }
  }
  const profileSetHash = sha256Value({ schemaVersion: 1, plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION, profiles });
  const draft = { schemaVersion: 1 as const, catalogId: `attention-v2-commanders-${profileSetHash.slice(7, 31)}`, profiles };
  return AttentionV2CommanderCatalogSchema.parse({ ...draft, catalogHash: sha256Value(draft) });
}

const fixedWeight: AttentionV2SamplingWeight = Object.freeze({ kind: "fixed-design", analysisWeight: 1 });

function normalizedPair(leftCommanderId: string, rightCommanderId: string): [string, string] {
  return leftCommanderId < rightCommanderId ? [leftCommanderId, rightCommanderId] : [rightCommanderId, leftCommanderId];
}

function pairKey(leftCommanderId: string, rightCommanderId: string): string {
  return normalizedPair(leftCommanderId, rightCommanderId).join("|");
}

function baseEdge(leftCommanderId: string, rightCommanderId: string, stratum: LandscapeBaseMatchupEdge["stratum"]): LandscapeBaseMatchupEdge {
  const [left, right] = normalizedPair(leftCommanderId, rightCommanderId);
  return { leftCommanderId: left, rightCommanderId: right, stratum, samplingWeight: fixedWeight, pairHash: sha256Value({ schemaVersion: 1, leftCommanderId: left, rightCommanderId: right }) };
}

function orientedEdge(base: LandscapeBaseMatchupEdge, stage: AttentionV2SweepStage, orientation: 1 | 2): AttentionV2SparseMatchupEdge {
  return {
    schemaVersion: 1,
    artifactKind: "attention-v2-matchup-edge",
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    edgeId: `attention-v2-${stage}-${base.pairHash.slice(7, 27)}-seat-${orientation}`,
    leftCommanderId: base.leftCommanderId,
    rightCommanderId: base.rightCommanderId,
    seatOrientation: orientation,
    stratum: base.stratum,
    samplingWeight: fixedWeight,
    pairHash: base.pairHash
  };
}

function assertRegularConnected(catalog: AttentionV2CommanderCatalog, baseEdges: readonly LandscapeBaseMatchupEdge[], degree: number): void {
  const adjacency = new Map(catalog.profiles.map((profile) => [profile.commanderId, new Set<string>()]));
  for (const edge of baseEdges) {
    adjacency.get(edge.leftCommanderId)?.add(edge.rightCommanderId);
    adjacency.get(edge.rightCommanderId)?.add(edge.leftCommanderId);
  }
  if ([...adjacency.values()].some((neighbors) => neighbors.size !== degree)) throw new Error(`Sparse graph must have degree ${degree}`);
  const first = catalog.profiles[0]?.commanderId;
  if (!first) throw new Error("Sparse graph requires commanders");
  const visited = new Set([first]);
  const queue = [first];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency.get(queue[cursor]) ?? []) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
  }
  if (visited.size !== catalog.profiles.length) throw new Error("Sparse graph must be connected");
}

function finishEdgeCatalog(
  fold: AttentionV2SweepFold,
  stage: AttentionV2SweepStage,
  degree: number,
  selection: unknown,
  baseEdges: LandscapeBaseMatchupEdge[],
  includeSelfPlay: boolean,
  profiles: readonly AttentionV2CommanderProfile[]
): LandscapeEdgeCatalog {
  const nonSelf = baseEdges.flatMap((edge) => [orientedEdge(edge, stage, 1), orientedEdge(edge, stage, 2)]);
  const selfPlay = includeSelfPlay ? profiles.map((profile): AttentionV2SparseMatchupEdge => {
    const hash = sha256Value({ schemaVersion: 1, leftCommanderId: profile.commanderId, rightCommanderId: profile.commanderId });
    return {
      schemaVersion: 1,
      artifactKind: "attention-v2-matchup-edge",
      modelVersion: ATTENTION_V2_MODEL_VERSION,
      edgeId: `attention-v2-${stage}-self-${profile.commanderId}`,
      leftCommanderId: profile.commanderId,
      rightCommanderId: profile.commanderId,
      seatOrientation: 1,
      stratum: "self-play",
      samplingWeight: fixedWeight,
      pairHash: hash
    };
  }) : [];
  const edges = AttentionV2SparseMatchupEdgeSchema.array().parse([...nonSelf, ...selfPlay].sort((left, right) => left.edgeId.localeCompare(right.edgeId)));
  const selectionDesignHash = sha256Value({ schemaVersion: 1, plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION, fold, stage, selection });
  const prehash = sha256Value({ fold, stage, selectionDesignHash, edges });
  const draft = {
    schemaVersion: 1 as const,
    plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    catalogId: `attention-v2-${stage}-edges-${prehash.slice(7, 27)}`,
    fold,
    stage,
    degree,
    selectionDesignHash,
    baseEdges: [...baseEdges].sort((left, right) => left.pairHash.localeCompare(right.pairHash)),
    edges
  };
  return { ...draft, catalogHash: sha256Value(draft) };
}

function cycleGraph(
  catalog: AttentionV2CommanderCatalog,
  fold: AttentionV2SweepFold,
  stage: AttentionV2SweepStage,
  cycles: readonly { offset: number; stratum: LandscapeBaseMatchupEdge["stratum"] }[],
  includeSelfPlay: boolean
): LandscapeEdgeCatalog {
  const profiles = [...catalog.profiles].sort((left, right) => left.ordinal - right.ordinal);
  const byPair = new Map<string, LandscapeBaseMatchupEdge>();
  for (const cycle of cycles) {
    for (let index = 0; index < profiles.length; index += 1) {
      const left = profiles[index].commanderId;
      const right = profiles[(index + cycle.offset) % profiles.length].commanderId;
      const key = pairKey(left, right);
      if (byPair.has(key)) throw new Error(`Duplicate fixed graph pair ${key}`);
      byPair.set(key, baseEdge(left, right, cycle.stratum));
    }
  }
  const baseEdges = [...byPair.values()];
  const degree = cycles.length * 2;
  assertRegularConnected(catalog, baseEdges, degree);
  return finishEdgeCatalog(fold, stage, degree, { kind: "modular-cycles", cycles }, baseEdges, includeSelfPlay, profiles);
}

function fixedPairCatalog(
  catalog: AttentionV2CommanderCatalog,
  fold: AttentionV2SweepFold,
  stage: AttentionV2SweepStage,
  basePairCount: number,
  excluded: Set<string>,
  offsetStart: number
): LandscapeEdgeCatalog {
  const profiles = [...catalog.profiles].sort((left, right) => left.ordinal - right.ordinal);
  const selected: LandscapeBaseMatchupEdge[] = [];
  const own = new Set<string>();
  for (let offset = offsetStart; selected.length < basePairCount && offset < profiles.length; offset += 2) {
    for (let index = 0; index < profiles.length && selected.length < basePairCount; index += 1) {
      const left = profiles[index].commanderId;
      const right = profiles[(index + offset) % profiles.length].commanderId;
      const key = pairKey(left, right);
      if (left === right || excluded.has(key) || own.has(key)) continue;
      own.add(key);
      selected.push(baseEdge(left, right, "sentinel"));
    }
  }
  if (selected.length !== basePairCount) throw new Error(`Unable to select ${basePairCount} disjoint pairs for ${stage}`);
  return finishEdgeCatalog(fold, stage, 0, { kind: "fixed-disjoint-pairs", offsetStart, basePairCount }, selected, false, profiles);
}

export function createAttentionV2EdgeCatalogs(catalog: AttentionV2CommanderCatalog = createAttentionV2CommanderCatalog()): LandscapeEdgeCatalog[] {
  const train = cycleGraph(catalog, "train", "shape-screen", [
    { offset: 791, stratum: "uniform" }, { offset: 1_709, stratum: "uniform" },
    { offset: 1, stratum: "nearby" }, { offset: 3_199, stratum: "adversarial" }
  ], true);
  const refine = cycleGraph(catalog, "refine", "survivor-refinement", [
    { offset: 797, stratum: "uniform" }, { offset: 1_711, stratum: "uniform" },
    { offset: 3, stratum: "nearby" }, { offset: 3_197, stratum: "adversarial" }
  ], true);
  const holdout = cycleGraph(catalog, "holdout", "landscape-holdout", [
    { offset: 7, stratum: "uniform" }, { offset: 2_393, stratum: "adversarial" }
  ], false);
  const excluded = new Set([train, refine, holdout].flatMap((graph) => graph.baseEdges.map((edge) => pairKey(edge.leftCommanderId, edge.rightCommanderId))));
  const drill = fixedPairCatalog(catalog, "drill", "sparse-volume-drill-down", 256, excluded, 1_231);
  drill.baseEdges.forEach((edge) => excluded.add(pairKey(edge.leftCommanderId, edge.rightCommanderId)));
  const sentinel = fixedPairCatalog(catalog, "drill", "full-volume-sentinel-audit", 4, excluded, 2_801);
  sentinel.baseEdges.forEach((edge) => excluded.add(pairKey(edge.leftCommanderId, edge.rightCommanderId)));
  const gate = fixedPairCatalog(catalog, "holdout", "gate-confirmation", 10, excluded, 3_011);
  return [train, refine, drill, sentinel, holdout, gate];
}

export function createAttentionV2SparseGraph(catalog: AttentionV2CommanderCatalog = createAttentionV2CommanderCatalog()): LandscapeSparseGraph {
  return createAttentionV2EdgeCatalogs(catalog)[0];
}

const sweepBattle: BattleVolumeRefV1 = Object.freeze({
  schemaVersion: 1,
  worldId: "attention-v2-landscape-world-v1",
  battleId: "attention-v2-balanced-battle-volume-v1",
  anchor: { x: 3_200, y: 3_200 },
  dimensions: { width: BATTLE_VOLUME_EDGE, height: BATTLE_VOLUME_EDGE, depth: BATTLE_VOLUME_EDGE }
});

function decodeMorton15(value: number): { x: number; y: number; z: number } {
  let x = 0; let y = 0; let z = 0;
  for (let bit = 0; bit < 5; bit += 1) {
    x |= ((value >>> (bit * 3)) & 1) << bit;
    y |= ((value >>> (bit * 3 + 1)) & 1) << bit;
    z |= ((value >>> (bit * 3 + 2)) & 1) << bit;
  }
  return { x, y, z };
}

function makeBattleSample(ordinal: number, coordinate: { x: number; y: number; z: number }, generator: AttentionV2BattleSampleRef["generator"]): AttentionV2BattleSampleRef {
  const identity = {
    schemaVersion: 1 as const,
    artifactKind: "attention-v2-battle-sample" as const,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    battle: sweepBattle,
    coordinate,
    generator
  };
  const prehash = sha256Value({ ordinal, ...identity });
  const draft = { ...identity, sampleId: `attention-v2-battle-${String(ordinal).padStart(5, "0")}-${prehash.slice(7, 19)}` };
  return AttentionV2BattleSampleRefSchema.parse({ ...draft, sampleHash: sha256Value(draft) });
}

export function createAttentionV2BattleSamples(): AttentionV2BattleSampleRef[] {
  const samples = Array.from({ length: BATTLE_VOLUME_CELLS }, (_, ordinal) => {
    const morton = (ordinal * 20_011 + 7_919) & (BATTLE_VOLUME_CELLS - 1);
    return makeBattleSample(ordinal, decodeMorton15(morton), {
      spatialPressure: ordinal % BATTLE_VOLUME_EDGE,
      formationGeometry: Math.floor(ordinal / BATTLE_VOLUME_EDGE) % BATTLE_VOLUME_EDGE,
      informationPressure: Math.floor(ordinal / (BATTLE_VOLUME_EDGE ** 2)) % BATTLE_VOLUME_EDGE
    });
  });
  if (new Set(samples.map((sample) => `${sample.coordinate.x},${sample.coordinate.y},${sample.coordinate.z}`)).size !== BATTLE_VOLUME_CELLS) {
    throw new Error("Full battle sample frame must cover all physical coordinates exactly once");
  }
  return samples;
}

export function createAttentionV2SparseBattleSamples(fullFrame: AttentionV2BattleSampleRef[] = createAttentionV2BattleSamples()): AttentionV2SparseBattleSample[] {
  const samples: AttentionV2SparseBattleSample[] = [];
  for (let spatial = 0; spatial < BATTLE_VOLUME_EDGE; spatial += 1) {
    for (let band = 0; band < 8; band += 1) {
      const formation = (spatial + band * 4) % BATTLE_VOLUME_EDGE;
      const information = (spatial * 3 + band * 5) % BATTLE_VOLUME_EDGE;
      const ordinal = spatial + BATTLE_VOLUME_EDGE * formation + (BATTLE_VOLUME_EDGE ** 2) * information;
      const sample = fullFrame[ordinal];
      if (!sample) throw new Error(`Missing full-frame sample ${ordinal}`);
      samples.push(AttentionV2SparseBattleSampleSchema.parse({
        schemaVersion: 1,
        artifactKind: "attention-v2-sparse-battle-sample",
        modelVersion: ATTENTION_V2_MODEL_VERSION,
        stage: "sparse-volume-drill-down",
        fold: "drill",
        samplingWeight: fixedWeight,
        sample
      }));
    }
  }
  if (new Set(samples.map((entry) => entry.sample.sampleId)).size !== ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT) {
    throw new Error("Sparse battle sample catalog must contain 256 unique full-frame members");
  }
  return samples;
}

function finishSampleCatalog(
  fold: AttentionV2SweepFold,
  stage: AttentionV2SweepStage,
  sampleFrameHash: Sha256Digest,
  selection: unknown,
  samples: AttentionV2BattleSampleRef[]
): LandscapeBattleSampleCatalog {
  const selectionDesignHash = sha256Value({ schemaVersion: 1, plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION, fold, stage, selection });
  const prehash = sha256Value({ fold, stage, selectionDesignHash, sampleIds: samples.map((sample) => sample.sampleId) });
  const draft = {
    schemaVersion: 1 as const,
    plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    catalogId: `attention-v2-${stage}-samples-${prehash.slice(7, 27)}`,
    fold,
    stage,
    sampleFrameHash,
    selectionDesignHash,
    samples
  };
  return { ...draft, catalogHash: sha256Value(draft) };
}

export function createAttentionV2BattleSampleCatalogs(
  fullFrame: AttentionV2BattleSampleRef[] = createAttentionV2BattleSamples(),
  sparse: AttentionV2SparseBattleSample[] = createAttentionV2SparseBattleSamples(fullFrame)
): LandscapeBattleSampleCatalog[] {
  const sampleFrameHash = sha256Value({ schemaVersion: 1, modelVersion: ATTENTION_V2_MODEL_VERSION, samples: fullFrame });
  return [
    finishSampleCatalog("train", "shape-screen", sampleFrameHash, { kind: "fixed-index", indices: [0] }, [fullFrame[0]]),
    finishSampleCatalog("refine", "survivor-refinement", sampleFrameHash, { kind: "fixed-index", indices: [1] }, [fullFrame[1]]),
    finishSampleCatalog("drill", "sparse-volume-drill-down", sampleFrameHash, { kind: "balanced-subset-v1" }, sparse.map((entry) => entry.sample)),
    finishSampleCatalog("drill", "full-volume-sentinel-audit", sampleFrameHash, { kind: "complete-frame" }, fullFrame),
    finishSampleCatalog("holdout", "landscape-holdout", sampleFrameHash, { kind: "fixed-holdout-indices-v1" }, [31_001, 31_127, 31_253, 31_379, 31_505, 31_631, 31_757, 31_883].map((index) => fullFrame[index])),
    finishSampleCatalog("holdout", "gate-confirmation", sampleFrameHash, { kind: "fixed-confirmation-anchor", index: 32_001 }, [fullFrame[32_001]])
  ];
}

export const ATTENTION_V2_SWEEP_STAGE_ORDER: readonly AttentionV2SweepStage[] = Object.freeze([
  "shape-screen", "survivor-refinement", "sparse-volume-drill-down", "full-volume-sentinel-audit", "landscape-holdout", "gate-confirmation"
]);

export const attentionV2SweepStages: readonly LandscapeSweepStageSpecification[] = Object.freeze([
  { stage: "shape-screen", fold: "train", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "sparse-matchup-graph" },
  { stage: "survivor-refinement", fold: "refine", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "sparse-matchup-graph" },
  { stage: "sparse-volume-drill-down", fold: "drill", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "sparse-256-battle-volume" },
  { stage: "full-volume-sentinel-audit", fold: "drill", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "full-32-cubed-battle-volume" },
  { stage: "landscape-holdout", fold: "holdout", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "sparse-matchup-graph" },
  { stage: "gate-confirmation", fold: "holdout", executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS, sampleSpace: "confirmation-reserve" }
]);

export const attentionV2StandardRunFormulas: Readonly<Record<AttentionV2SweepStage, string>> = Object.freeze({
  "shape-screen": "40 * 57,600 * 1 * 4",
  "survivor-refinement": "24 * 57,600 * 1 * 8",
  "sparse-volume-drill-down": "3 * 512 * 256 * 8",
  "full-volume-sentinel-audit": "3 * 8 * 32,768 * 2",
  "landscape-holdout": "3 * 25,600 * 8 * 8",
  "gate-confirmation": "1 * 20 * 1 * 5,000"
});

export function createAttentionV2SweepBudgets(): AttentionV2SweepBudget[] {
  return (["lean", "standard", "deep"] as const).map((profile) => {
    const stages = ATTENTION_V2_SWEEP_STAGE_ORDER.map((stage) => ({
      stage,
      factors: { ...ATTENTION_V2_SWEEP_FACTORS[profile][stage] },
      plannedRuns: ATTENTION_V2_SWEEP_RUNS[profile][stage]
    }));
    return AttentionV2SweepBudgetSchema.parse({ profile, stages, plannedRuns: stages.reduce((sum, stage) => sum + stage.plannedRuns, 0) });
  });
}

function edgeCatalogRef(catalog: LandscapeEdgeCatalog): AttentionV2EdgeCatalogRef {
  return {
    schemaVersion: 1,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    stage: catalog.stage,
    fold: catalog.fold,
    catalogId: catalog.catalogId,
    catalogHash: catalog.catalogHash,
    selectionDesignHash: catalog.selectionDesignHash,
    degree: catalog.degree,
    basePairCount: catalog.baseEdges.length,
    orientedCellCount: catalog.edges.length,
    selfPlayCount: catalog.edges.filter((edge) => edge.stratum === "self-play").length,
    samplingDesign: "fixed-design"
  };
}

function sampleCatalogRef(catalog: LandscapeBattleSampleCatalog): AttentionV2BattleSampleCatalogRef {
  return {
    schemaVersion: 1,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    stage: catalog.stage,
    fold: catalog.fold,
    catalogId: catalog.catalogId,
    catalogHash: catalog.catalogHash,
    sampleFrameHash: catalog.sampleFrameHash,
    sampleCount: catalog.samples.length,
    selectionDesignHash: catalog.selectionDesignHash,
    samplingDesign: "fixed-design"
  };
}

function buildFoldAssignments(edgeCatalogs: LandscapeEdgeCatalog[], sampleCatalogs: LandscapeBattleSampleCatalog[]): AttentionV2FoldAssignment[] {
  const definitions: { fold: AttentionV2SweepFold; stages: AttentionV2SweepStage[]; selectable: boolean }[] = [
    { fold: "train", stages: ["shape-screen"], selectable: true },
    { fold: "refine", stages: ["survivor-refinement"], selectable: true },
    { fold: "drill", stages: ["sparse-volume-drill-down", "full-volume-sentinel-audit"], selectable: true },
    { fold: "holdout", stages: ["landscape-holdout", "gate-confirmation"], selectable: false }
  ];
  return definitions.map((definition) => {
    const draft = {
      schemaVersion: 1 as const,
      fold: definition.fold,
      seedNamespace: `attention-v2/landscape/${definition.fold}/v2`,
      stages: definition.stages,
      edgeCatalogs: edgeCatalogs.filter((catalog) => definition.stages.includes(catalog.stage)).map(edgeCatalogRef),
      battleSampleCatalogs: sampleCatalogs.filter((catalog) => definition.stages.includes(catalog.stage)).map(sampleCatalogRef),
      frozen: true as const,
      selectable: definition.selectable
    };
    return AttentionV2FoldAssignmentSchema.parse({ ...draft, assignmentHash: sha256Value(draft) });
  });
}

function assertDigest(label: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`${label} hash mismatch`);
}

export function verifyAttentionV2SweepSkeleton(skeleton: LandscapeSweepSkeleton): void {
  AttentionV2FactorCatalogSchema.parse(skeleton.factorCatalog);
  assertDigest("factor catalog", skeleton.factorCatalog.catalogHash, sha256Value(withoutHash(skeleton.factorCatalog, "catalogHash")));
  AttentionV2ModelCatalogSchema.parse(skeleton.modelCatalog);
  for (const model of skeleton.modelCatalog.models) assertDigest(`model ${model.modelId}`, model.ruleShapeHash, sha256Value(model.ruleShape));
  const expectedDesign = balancedDesignRuleShapes(skeleton.modelCatalog.designDiagnostics.designSeed);
  if (expectedDesign.some((ruleShape, row) => sha256Value(ruleShape) !== skeleton.modelCatalog.models[row]?.ruleShapeHash)) {
    throw new Error("model catalog designSeed does not reproduce its 36 balanced design rows");
  }
  const diagnostics = analyzeAttentionV2MainEffectDesign(skeleton.modelCatalog.models.map((model) => model.ruleShape));
  if (diagnostics.mainEffectRank !== skeleton.modelCatalog.designDiagnostics.mainEffectRank ||
    diagnostics.maxAbsoluteAlias !== skeleton.modelCatalog.designDiagnostics.maxAbsoluteAlias) {
    throw new Error("model catalog design diagnostics mismatch");
  }
  assertDigest("model catalog", skeleton.modelCatalog.catalogHash, sha256Value(withoutHash(skeleton.modelCatalog, "catalogHash")));
  AttentionV2CommanderCatalogSchema.parse(skeleton.commanderCatalog);
  for (const profile of skeleton.commanderCatalog.profiles) {
    const { commanderId: _commanderId, profileHash, ...normalized } = profile;
    assertDigest(`commander ${profile.ordinal}`, profileHash, sha256Value(normalized));
  }
  assertDigest("commander catalog", skeleton.commanderCatalog.catalogHash, sha256Value(withoutHash(skeleton.commanderCatalog, "catalogHash")));

  const nonSelf = new Set<string>();
  for (const catalog of skeleton.edgeCatalogs) {
    AttentionV2SparseMatchupEdgeSchema.array().parse(catalog.edges);
    assertDigest(`edge catalog ${catalog.stage}`, catalog.catalogHash, sha256Value(withoutHash(catalog, "catalogHash")));
    for (const edge of catalog.baseEdges) {
      assertDigest(`pair ${edge.pairHash}`, edge.pairHash, sha256Value({
        schemaVersion: 1,
        leftCommanderId: edge.leftCommanderId,
        rightCommanderId: edge.rightCommanderId
      }));
      const key = pairKey(edge.leftCommanderId, edge.rightCommanderId);
      if (nonSelf.has(key)) throw new Error(`Non-self matchup pair reused across folds: ${key}`);
      nonSelf.add(key);
    }
    for (const edge of catalog.edges) {
      assertDigest(`oriented pair ${edge.edgeId}`, edge.pairHash, sha256Value({
        schemaVersion: 1,
        leftCommanderId: edge.leftCommanderId,
        rightCommanderId: edge.rightCommanderId
      }));
    }
  }
  AttentionV2BattleSampleRefSchema.array().parse(skeleton.battleSamples);
  for (const sample of skeleton.battleSamples) {
    assertDigest(`battle sample ${sample.sampleId}`, sample.sampleHash, sha256Value(withoutHash(sample, "sampleHash")));
  }
  const frameById = new Map(skeleton.battleSamples.map((sample) => [sample.sampleId, sample]));
  if (frameById.size !== BATTLE_VOLUME_CELLS) throw new Error("Battle sample frame must have 32^3 unique IDs");
  if (new Set(skeleton.battleSamples.map((sample) => `${sample.coordinate.x},${sample.coordinate.y},${sample.coordinate.z}`)).size !== BATTLE_VOLUME_CELLS) {
    throw new Error("Battle sample frame must cover every physical coordinate exactly once");
  }
  const sampleFrameHash = sha256Value({ schemaVersion: 1, modelVersion: ATTENTION_V2_MODEL_VERSION, samples: skeleton.battleSamples });
  AttentionV2SparseBattleSampleSchema.array().parse(skeleton.sparseBattleSamples);
  for (const entry of skeleton.sparseBattleSamples) {
    const source = frameById.get(entry.sample.sampleId);
    if (!source || source.sampleHash !== entry.sample.sampleHash) throw new Error("Sparse battle sample is not an exact full-frame member");
  }
  if (new Set(skeleton.sparseBattleSamples.map((entry) => entry.sample.sampleId)).size !== ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT) {
    throw new Error("Sparse battle samples must be unique");
  }
  for (const catalog of skeleton.battleSampleCatalogs) {
    assertDigest(`sample frame ${catalog.stage}`, catalog.sampleFrameHash, sampleFrameHash);
    for (const sample of catalog.samples) {
      const source = frameById.get(sample.sampleId);
      if (!source || source.sampleHash !== sample.sampleHash) throw new Error(`${catalog.stage} contains a sample outside the frozen frame`);
    }
    assertDigest(`battle-sample catalog ${catalog.stage}`, catalog.catalogHash, sha256Value(withoutHash(catalog, "catalogHash")));
  }
  for (const fold of skeleton.folds) {
    AttentionV2FoldAssignmentSchema.parse(fold);
    const expectedEdges = skeleton.edgeCatalogs.filter((catalog) => fold.stages.includes(catalog.stage)).map(edgeCatalogRef);
    const expectedSamples = skeleton.battleSampleCatalogs.filter((catalog) => fold.stages.includes(catalog.stage)).map(sampleCatalogRef);
    assertDigest(`fold ${fold.fold} edge references`, sha256Value(fold.edgeCatalogs), sha256Value(expectedEdges));
    assertDigest(`fold ${fold.fold} sample references`, sha256Value(fold.battleSampleCatalogs), sha256Value(expectedSamples));
    assertDigest(`fold ${fold.fold}`, fold.assignmentHash, sha256Value(withoutHash(fold, "assignmentHash")));
  }
  AttentionV2SweepBudgetSchema.array().parse(skeleton.budgets);
  assertDigest("edge catalog set", skeleton.edgeCatalogSetHash, sha256Value(skeleton.edgeCatalogs.map(edgeCatalogRef)));
  assertDigest("battle-sample catalog set", skeleton.battleSampleCatalogSetHash, sha256Value(skeleton.battleSampleCatalogs.map(sampleCatalogRef)));
  assertDigest("fold assignment", skeleton.foldAssignmentHash, sha256Value(skeleton.folds));
}

export function createAttentionV2SweepSkeleton(parentV1ModelHash: Sha256Digest): LandscapeSweepSkeleton {
  const factorCatalog = createAttentionV2FactorCatalog();
  const modelCatalog = createAttentionV2ModelCatalog(parentV1ModelHash);
  const commanderCatalog = createAttentionV2CommanderCatalog();
  const edgeCatalogs = createAttentionV2EdgeCatalogs(commanderCatalog);
  const battleSamples = createAttentionV2BattleSamples();
  const sparseBattleSamples = createAttentionV2SparseBattleSamples(battleSamples);
  const battleSampleCatalogs = createAttentionV2BattleSampleCatalogs(battleSamples, sparseBattleSamples);
  const folds = buildFoldAssignments(edgeCatalogs, battleSampleCatalogs);
  const skeleton: LandscapeSweepSkeleton = {
    factorCatalog,
    modelCatalog,
    commanderCatalog,
    edgeCatalogs,
    battleSamples,
    sparseBattleSamples,
    battleSampleCatalogs,
    folds,
    stages: attentionV2SweepStages.map((stage) => ({ ...stage })),
    budgets: createAttentionV2SweepBudgets(),
    edgeCatalogSetHash: sha256Value(edgeCatalogs.map(edgeCatalogRef)),
    battleSampleCatalogSetHash: sha256Value(battleSampleCatalogs.map(sampleCatalogRef)),
    foldAssignmentHash: sha256Value(folds)
  };
  verifyAttentionV2SweepSkeleton(skeleton);
  return skeleton;
}

function plannerIdentity(skeleton: LandscapeSweepSkeleton): AttentionV2PlannerIdentity {
  return {
    factorCatalogHash: skeleton.factorCatalog.catalogHash,
    modelCatalogHash: skeleton.modelCatalog.catalogHash,
    commanderCatalogHash: skeleton.commanderCatalog.catalogHash,
    edgeCatalogSetHash: skeleton.edgeCatalogSetHash,
    battleSampleCatalogSetHash: skeleton.battleSampleCatalogSetHash,
    foldAssignmentHash: skeleton.foldAssignmentHash
  };
}

function stageModelSets(budget: AttentionV2SweepBudget, modelCatalog: AttentionV2ModelCatalog): AttentionV2StageModelSetRef[] {
  const pendingKinds: Partial<Record<AttentionV2SweepStage, string>> = {
    "survivor-refinement": "select-six-survivors-and-four-local-variants",
    "sparse-volume-drill-down": "select-three-refinement-finalists",
    "full-volume-sentinel-audit": "reuse-three-frozen-finalists",
    "landscape-holdout": "freeze-v1-bridge-plus-two-candidates",
    "gate-confirmation": "freeze-confirmation-panel-model-set"
  };
  const dependencies: Partial<Record<AttentionV2SweepStage, {
    upstreamStage: AttentionV2SweepStage;
    relation: "derived-from" | "selected-from" | "exact-reuse" | "confirmation-of";
  }>> = {
    "survivor-refinement": { upstreamStage: "shape-screen", relation: "derived-from" },
    "sparse-volume-drill-down": { upstreamStage: "survivor-refinement", relation: "selected-from" },
    "full-volume-sentinel-audit": { upstreamStage: "sparse-volume-drill-down", relation: "exact-reuse" },
    "landscape-holdout": { upstreamStage: "full-volume-sentinel-audit", relation: "selected-from" },
    "gate-confirmation": { upstreamStage: "landscape-holdout", relation: "confirmation-of" }
  };
  const screenModelSetHash = sha256Value({
    schemaVersion: 1,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    members: modelCatalog.models.map((model) => ({ modelId: model.modelId, ruleShapeHash: model.ruleShapeHash }))
  });
  return budget.stages.map((stage): AttentionV2StageModelSetRef => {
    const dependency = dependencies[stage.stage];
    const protocol = {
      schemaVersion: 1,
      plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
      stage: stage.stage,
      kind: stage.stage === "shape-screen" ? "frozen-screen-catalog" : pendingKinds[stage.stage],
      modelCount: stage.factors.modelRows,
      rootModelCatalogHash: modelCatalog.catalogHash,
      dependencies: dependency ? [dependency] : []
    };
    const selectionProtocolHash = sha256Value(protocol);
    if (stage.stage === "shape-screen") {
      return {
        schemaVersion: 1,
        modelVersion: ATTENTION_V2_MODEL_VERSION,
        stage: stage.stage,
        modelCount: stage.factors.modelRows,
        selectionProtocolHash,
        rootModelCatalogHash: modelCatalog.catalogHash,
        materializationStatus: "materialized",
        modelSetId: modelCatalog.catalogId,
        modelSetHash: screenModelSetHash,
        catalogHash: modelCatalog.catalogHash,
        selectionReportHash: null,
        dependencies: []
      };
    }
    if (!dependency) throw new Error(`Missing stage-model dependency for ${stage.stage}`);
    return {
      schemaVersion: 1,
      modelVersion: ATTENTION_V2_MODEL_VERSION,
      stage: stage.stage,
      modelCount: stage.factors.modelRows,
      selectionProtocolHash,
      rootModelCatalogHash: modelCatalog.catalogHash,
      materializationStatus: "pending-selection",
      dependencies: [dependency]
    };
  });
}

function pairedWorldBlocks(budget: AttentionV2SweepBudget, folds: AttentionV2FoldAssignment[], seedStart: number): AttentionV2PairedWorldBlock[] {
  let nextSeed = seedStart;
  return budget.stages.map((stage) => {
    const fold = folds.find((candidate) => candidate.stages.includes(stage.stage));
    if (!fold) throw new Error(`No fold owns ${stage.stage}`);
    const identity = {
      schemaVersion: 1 as const,
      stage: stage.stage,
      namespace: `${fold.seedNamespace}/${stage.stage}`,
      seedStart: nextSeed,
      seedsPerCell: stage.factors.seedsPerCell,
      pairedAcross: ["model-row", "seat-orientation"] as ["model-row", "seat-orientation"],
      randomStreamKeyVersion: "attention-v2-world-v1" as const
    };
    nextSeed += stage.factors.seedsPerCell;
    const prehash = sha256Value(identity);
    const draft = { ...identity, worldBlockId: `attention-v2-worlds-${stage.stage}-${prehash.slice(7, 27)}` };
    return AttentionV2PairedWorldBlockSchema.parse({ ...draft, blockHash: sha256Value(draft) });
  });
}

export function createAttentionV2PairBlockId(
  pairHash: Sha256Digest,
  battleSampleId: string,
  seed: number
): Sha256Digest {
  if (!battleSampleId) throw new Error("battleSampleId is required");
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a nonnegative integer");
  return sha256Value({
    schemaVersion: 1,
    randomStreamKeyVersion: "attention-v2-world-v1",
    pairHash,
    battleSampleId,
    seed
  });
}

export function createAttentionV2SweepPlan(
  options: CreateLandscapeSweepPlanOptions,
  skeleton: LandscapeSweepSkeleton = createAttentionV2SweepSkeleton(options.parentV1ModelHash)
): AttentionV2SweepPlan {
  if ((options.budgetProfile ?? "standard") !== "standard") throw new Error("Lean and deep are sizing envelopes; only the standard sweep has materialized catalogs");
  if (!Number.isInteger(options.seedStart ?? 0) || (options.seedStart ?? 0) < 0) throw new Error("seedStart must be a nonnegative integer");
  if (skeleton.modelCatalog.models.some((model) => model.parentV1ModelHash !== options.parentV1ModelHash)) throw new Error("Parent v1 model hash does not match the frozen model catalog");
  const budget = skeleton.budgets.find((candidate) => candidate.profile === "standard");
  if (!budget) throw new Error("Missing standard sweep budget");
  const draft = {
    schemaVersion: 1 as const,
    plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    requiredResolver: LANDSCAPE_SWEEP_REQUIRED_RESOLVER,
    parentV1ManifestHash: options.parentV1ManifestHash,
    parentV1ReportHash: options.parentV1ReportHash,
    parentPlanHash: null,
    createdAt: options.createdAt,
    modelCatalog: { catalogId: skeleton.modelCatalog.catalogId, catalogHash: skeleton.modelCatalog.catalogHash, rowCount: 40 as const },
    commanderProfiles: ATTENTION_V2_COMMANDER_PROFILE_COUNT,
    budget,
    planner: plannerIdentity(skeleton),
    stageModelSets: stageModelSets(budget, skeleton.modelCatalog),
    folds: skeleton.folds,
    worldBlocks: pairedWorldBlocks(budget, skeleton.folds, options.seedStart ?? 0),
    executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS
  };
  const prehash = sha256Value(draft);
  const withId = { ...draft, planId: `attention-v2-landscape-standard-${prehash.slice(7, 31)}` };
  const plan = AttentionV2SweepPlanSchema.parse({ ...withId, planHash: sha256Value(withId) });
  verifyAttentionV2SweepPlan(plan, skeleton);
  return plan;
}

export function verifyAttentionV2SweepPlan(plan: AttentionV2SweepPlan, skeleton: LandscapeSweepSkeleton): void {
  AttentionV2SweepPlanSchema.parse(plan);
  verifyAttentionV2SweepSkeleton(skeleton);
  assertDigest("plan", plan.planHash, sha256Value(withoutHash(plan, "planHash")));
  if (plan.planner.factorCatalogHash !== skeleton.factorCatalog.catalogHash ||
    plan.planner.modelCatalogHash !== skeleton.modelCatalog.catalogHash ||
    plan.planner.commanderCatalogHash !== skeleton.commanderCatalog.catalogHash ||
    plan.planner.edgeCatalogSetHash !== skeleton.edgeCatalogSetHash ||
    plan.planner.battleSampleCatalogSetHash !== skeleton.battleSampleCatalogSetHash ||
    plan.planner.foldAssignmentHash !== skeleton.foldAssignmentHash) {
    throw new Error("plan planner identity does not match the frozen sweep skeleton");
  }
  const expectedModelSets = stageModelSets(plan.budget, skeleton.modelCatalog);
  assertDigest("stage model sets", sha256Value(plan.stageModelSets), sha256Value(expectedModelSets));
  for (const block of plan.worldBlocks) assertDigest(`world block ${block.stage}`, block.blockHash, sha256Value(withoutHash(block, "blockHash")));
}

export type AttentionV2RunIdentityInput = {
  stage: AttentionV2SweepStage;
  modelId: string;
  edgeId: string;
  battleSampleId: string;
  seed: number;
};

export type CompiledAttentionV2RunPlanner = Readonly<{
  planId: string;
  planHash: string;
  preflightVerifications: 1;
  indexedModels: number;
  indexedEdges: number;
  indexedBattleSamples: number;
  createIdentity: (input: AttentionV2RunIdentityInput) => AttentionV2RunPlannerIdentity;
}>;

export function compileAttentionV2RunPlanner(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton
): CompiledAttentionV2RunPlanner {
  verifyAttentionV2SweepPlan(plan, skeleton);
  const sealedPlan = AttentionV2SweepPlanSchema.parse(plan);
  const planId = sealedPlan.planId;
  const planHash = sealedPlan.planHash;
  const planner = Object.freeze({ ...sealedPlan.planner });
  const modelSets = new Map(sealedPlan.stageModelSets.map((modelSet) => [modelSet.stage, {
    materializationStatus: modelSet.materializationStatus,
    modelSetHash: modelSet.materializationStatus === "materialized" ? modelSet.modelSetHash : null
  }]));
  const modelIds = new Map<AttentionV2SweepStage, ReadonlySet<string>>([
    ["shape-screen", new Set(skeleton.modelCatalog.models.map((model) => model.modelId))]
  ]);
  const edgeCatalogHashes = new Map(skeleton.edgeCatalogs.map((catalog) => [catalog.stage, catalog.catalogHash]));
  const edgeIndexes = new Map(skeleton.edgeCatalogs.map((catalog) => [
    catalog.stage,
    new Map(catalog.edges.map((edge) => [edge.edgeId, {
      edgeId: edge.edgeId,
      pairHash: edge.pairHash
    }]))
  ]));
  const sampleCatalogHashes = new Map(skeleton.battleSampleCatalogs.map((catalog) => [catalog.stage, catalog.catalogHash]));
  const sampleIndexes = new Map(skeleton.battleSampleCatalogs.map((catalog) => [
    catalog.stage,
    new Set(catalog.samples.map((sample) => sample.sampleId))
  ]));
  const worldBlocks = new Map(sealedPlan.worldBlocks.map((block) => [block.stage, {
    worldBlockId: block.worldBlockId,
    seedStart: block.seedStart,
    seedsPerCell: block.seedsPerCell
  }]));
  const folds = new Map<AttentionV2SweepStage, AttentionV2SweepFold>();
  for (const fold of sealedPlan.folds) for (const stage of fold.stages) folds.set(stage, fold.fold);

  const createIdentity = (input: AttentionV2RunIdentityInput): AttentionV2RunPlannerIdentity => {
    const modelSet = modelSets.get(input.stage);
    if (!modelSet || modelSet.materializationStatus !== "materialized" || !modelSet.modelSetHash) throw new Error(`${input.stage} model set is not materialized`);
    if (!modelIds.get(input.stage)?.has(input.modelId)) throw new Error(`Unknown ${input.stage} model ${input.modelId}`);
    const edgeCatalogHash = edgeCatalogHashes.get(input.stage);
    const edge = edgeIndexes.get(input.stage)?.get(input.edgeId);
    if (!edgeCatalogHash || !edge) throw new Error(`Unknown ${input.stage} edge ${input.edgeId}`);
    const sampleCatalogHash = sampleCatalogHashes.get(input.stage);
    const sampleExists = sampleIndexes.get(input.stage)?.has(input.battleSampleId);
    if (!sampleCatalogHash || !sampleExists) throw new Error(`Unknown ${input.stage} battle sample ${input.battleSampleId}`);
    const worldBlock = worldBlocks.get(input.stage);
    if (!worldBlock || input.seed < worldBlock.seedStart || input.seed >= worldBlock.seedStart + worldBlock.seedsPerCell) {
      throw new Error(`Seed ${input.seed} is outside the ${input.stage} common-world block`);
    }
    const fold = folds.get(input.stage);
    if (!fold) throw new Error(`No fold owns ${input.stage}`);
    const pairBlockId = createAttentionV2PairBlockId(edge.pairHash as Sha256Digest, input.battleSampleId, input.seed);
    return AttentionV2RunPlannerIdentitySchema.parse({
      schemaVersion: 1,
      plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
      modelVersion: ATTENTION_V2_MODEL_VERSION,
      planId,
      planHash,
      stage: input.stage,
      fold,
      modelId: input.modelId,
      modelSetHash: modelSet.modelSetHash,
      edgeCatalogHash,
      edgeId: edge.edgeId,
      pairHash: edge.pairHash,
      battleSampleCatalogHash: sampleCatalogHash,
      battleSampleId: input.battleSampleId,
      worldBlockId: worldBlock.worldBlockId,
      seed: input.seed,
      randomStreamId: pairBlockId,
      pairBlockId,
      planner
    });
  };
  return Object.freeze({
    planId,
    planHash,
    preflightVerifications: 1 as const,
    indexedModels: [...modelIds.values()].reduce((sum, ids) => sum + ids.size, 0),
    indexedEdges: [...edgeIndexes.values()].reduce((sum, index) => sum + index.size, 0),
    indexedBattleSamples: [...sampleIndexes.values()].reduce((sum, index) => sum + index.size, 0),
    createIdentity
  });
}

export function createAttentionV2RunPlannerIdentity(
  planner: CompiledAttentionV2RunPlanner,
  input: AttentionV2RunIdentityInput
): AttentionV2RunPlannerIdentity {
  return planner.createIdentity(input);
}

export function createAttentionV2SweepArtifacts(options: CreateLandscapeSweepPlanOptions): LandscapeSweepArtifacts {
  const skeleton = createAttentionV2SweepSkeleton(options.parentV1ModelHash);
  return { ...skeleton, plan: createAttentionV2SweepPlan(options, skeleton) };
}

export function summarizeAttentionV2Sweep(profile: LandscapeSweepBudgetProfile = "standard") {
  const budgets = createAttentionV2SweepBudgets();
  const selected = budgets.find((budget) => budget.profile === profile);
  if (!selected) throw new Error(`Unknown attention-v2 sweep budget: ${profile}`);
  return {
    plannerVersion: LANDSCAPE_SWEEP_PLANNER_VERSION,
    modelVersion: ATTENTION_V2_MODEL_VERSION,
    requiredResolver: LANDSCAPE_SWEEP_REQUIRED_RESOLVER,
    executionStatus: LANDSCAPE_SWEEP_EXECUTION_STATUS,
    budgetProfile: profile,
    materialization: profile === "standard" ? "materialized-standard" as const : "sizing-envelope" as const,
    modelRows: ATTENTION_V2_SWEEP_MODEL_ROWS,
    commanders: ATTENTION_V2_COMMANDER_PROFILE_COUNT,
    baseEdges: 25_600 as const,
    orientedMatchups: 57_600 as const,
    battleSamples: BATTLE_VOLUME_CELLS,
    sparseBattleSamples: ATTENTION_V2_SPARSE_BATTLE_SAMPLE_COUNT,
    plannedRuns: selected.plannedRuns,
    budgets: Object.fromEntries(budgets.map((budget) => [budget.profile, budget.plannedRuns])) as Record<LandscapeSweepBudgetProfile, number>
  };
}
