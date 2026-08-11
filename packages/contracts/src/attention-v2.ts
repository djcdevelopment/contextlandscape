import { z } from "zod";
import { BattleCoordinateV1Schema, BattleVolumeRefV1Schema } from "./landscape.js";

export const ATTENTION_V2_MODEL_VERSION = "duel-capacity-v2" as const;
export const ATTENTION_V2_PLANNER_VERSION = "attention-v2-landscape-sweep-v3" as const;
export const ATTENTION_V2_FACTOR_COUNT = 18 as const;
export const ATTENTION_V2_COMMANDER_PROFILE_COUNT = 6_400 as const;

export const ATTENTION_V2_RULE_FACTOR_NAMES = [
  "attentionBudget",
  "verifyCost",
  "objectiveTarget",
  "driftLimit",
  "baseSoundness",
  "objectiveCoupling",
  "throughputShape",
  "seizeCostShape",
  "calibrationSeparation",
  "movementSeparation",
  "stationaryQualification",
  "scoutStationaryPayload",
  "lineStationaryPayload",
  "siegeStationaryPayload",
  "capacityTopology",
  "abilityUnlockBasis",
  "abilityPackage",
  "unresolvedDisposition"
] as const;

export const ATTENTION_V2_RULE_FACTOR_LEVELS = {
  attentionBudget: [2, 3, 4],
  verifyCost: [0, 1, 2],
  objectiveTarget: [9, 12, 24],
  driftLimit: [3, 4, 5],
  baseSoundness: [0.6, 0.7, 0.8],
  objectiveCoupling: ["global", "binary-front", "distance-weighted-front"],
  throughputShape: ["flat", "v1", "scout-forward"],
  seizeCostShape: ["flat", "v1", "polarized"],
  calibrationSeparation: ["compressed", "v1", "polarized"],
  movementSeparation: ["flat", "v1", "scout-forward"],
  stationaryQualification: ["resolved-zero", "voluntary-hold", "committed-streak"],
  scoutStationaryPayload: ["calibration-boost", "reveal", "free-verify"],
  lineStationaryPayload: ["banked-guarantee", "reveal-token", "spatial-aura"],
  siegeStationaryPayload: ["delayed-attention", "bankable-reserve", "claim-subsidy"],
  capacityTopology: ["shared-exclusive", "pioneer-copy", "independent-tracks"],
  abilityUnlockBasis: ["personal-claim-count", "owned-rank", "global-rank"],
  abilityPackage: ["utility-only", "complete", "role-separated"],
  unresolvedDisposition: ["auto-accept", "bounded-backlog", "confidence-default"]
} as const;

export const ATTENTION_V2_COMPOSITION_MODULES = [
  "scout-scout-scout",
  "scout-scout-line",
  "scout-scout-siege",
  "scout-line-line",
  "scout-line-siege",
  "scout-siege-siege",
  "line-line-line",
  "line-line-siege",
  "line-siege-siege",
  "siege-siege-siege"
] as const;

export const ATTENTION_V2_TRIAGE_MODULES = [
  "accept-all",
  "verify-lowest",
  "seize-cheapest",
  "confidence-reject",
  "confidence-verify",
  "recon-reject",
  "line-assist",
  "siege-seize",
  "risk-adaptive",
  "pressure-adaptive"
] as const;

export const ATTENTION_V2_MOVEMENT_MODULES = [
  "hold",
  "own-front",
  "enemy-front",
  "chassis-native",
  "scout-mobile",
  "escort",
  "siege-anchor",
  "flare-evade"
] as const;

export const ATTENTION_V2_CAPACITY_MODULES = [
  "never",
  "pioneer-focus",
  "follower-focus",
  "pioneer-overclock",
  "follower-overclock",
  "pioneer-flare",
  "follower-flare",
  "adaptive"
] as const;

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const AttentionV2ModelVersionSchema = z.literal(ATTENTION_V2_MODEL_VERSION);
export type AttentionV2ModelVersion = z.infer<typeof AttentionV2ModelVersionSchema>;

export const AttentionV2RuleShapeSchema = z.object({
  attentionBudget: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  verifyCost: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  objectiveTarget: z.union([z.literal(9), z.literal(12), z.literal(24)]),
  driftLimit: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  baseSoundness: z.union([z.literal(0.6), z.literal(0.7), z.literal(0.8)]),
  objectiveCoupling: z.enum(["global", "binary-front", "distance-weighted-front"]),
  throughputShape: z.enum(["flat", "v1", "scout-forward"]),
  seizeCostShape: z.enum(["flat", "v1", "polarized"]),
  calibrationSeparation: z.enum(["compressed", "v1", "polarized"]),
  movementSeparation: z.enum(["flat", "v1", "scout-forward"]),
  stationaryQualification: z.enum(["resolved-zero", "voluntary-hold", "committed-streak"]),
  scoutStationaryPayload: z.enum(["calibration-boost", "reveal", "free-verify"]),
  lineStationaryPayload: z.enum(["banked-guarantee", "reveal-token", "spatial-aura"]),
  siegeStationaryPayload: z.enum(["delayed-attention", "bankable-reserve", "claim-subsidy"]),
  capacityTopology: z.enum(["shared-exclusive", "pioneer-copy", "independent-tracks"]),
  abilityUnlockBasis: z.enum(["personal-claim-count", "owned-rank", "global-rank"]),
  abilityPackage: z.enum(["utility-only", "complete", "role-separated"]),
  unresolvedDisposition: z.enum(["auto-accept", "bounded-backlog", "confidence-default"])
}).strict();
export type AttentionV2RuleShape = z.infer<typeof AttentionV2RuleShapeSchema>;

const factorLevel = z.union([z.string().min(1), z.number().finite()]);

export const AttentionV2FactorDefinitionSchema = z.object({
  factor: z.enum(ATTENTION_V2_RULE_FACTOR_NAMES),
  levels: z.array(factorLevel).length(3)
}).strict();
export type AttentionV2FactorDefinition = z.infer<typeof AttentionV2FactorDefinitionSchema>;

export const AttentionV2FactorCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  factorCount: z.literal(ATTENTION_V2_FACTOR_COUNT),
  definitions: z.array(AttentionV2FactorDefinitionSchema).length(ATTENTION_V2_FACTOR_COUNT),
  catalogHash: digest
}).strict().superRefine((catalog, context) => {
  const byName = new Map(catalog.definitions.map((definition) => [definition.factor, definition.levels]));
  for (const factor of ATTENTION_V2_RULE_FACTOR_NAMES) {
    const actual = byName.get(factor);
    const expected = ATTENTION_V2_RULE_FACTOR_LEVELS[factor];
    if (!actual || actual.length !== expected.length || actual.some((level, index) => level !== expected[index])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["definitions"], message: `${factor} must contain the frozen v2 factor levels` });
    }
  }
  if (byName.size !== ATTENTION_V2_FACTOR_COUNT) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["definitions"], message: "factor definitions must be unique" });
  }
});
export type AttentionV2FactorCatalog = z.infer<typeof AttentionV2FactorCatalogSchema>;

export const AttentionV2ModelDefinitionSchema = z.object({
  schemaVersion: z.literal(2),
  modelVersion: AttentionV2ModelVersionSchema,
  modelId: z.string().min(1),
  designRow: z.number().int().min(0).max(39),
  role: z.enum(["design", "v1-bridge", "core-sentinel", "all-on-sentinel", "fast-follower-sentinel"]),
  ruleShape: AttentionV2RuleShapeSchema,
  ruleShapeHash: digest,
  resolverRequirement: z.literal("attention-v2"),
  parentV1ModelHash: digest
}).strict().superRefine((model, context) => {
  if (model.role === "v1-bridge") {
    const v1 = model.ruleShape;
    const matches = v1.attentionBudget === 3 && v1.verifyCost === 1 && v1.objectiveTarget === 12 &&
      v1.driftLimit === 4 && v1.baseSoundness === 0.7 && v1.objectiveCoupling === "binary-front" &&
      v1.throughputShape === "v1" && v1.seizeCostShape === "v1" && v1.calibrationSeparation === "v1" &&
      v1.movementSeparation === "v1" && v1.stationaryQualification === "resolved-zero" &&
      v1.scoutStationaryPayload === "calibration-boost" && v1.lineStationaryPayload === "banked-guarantee" &&
      v1.siegeStationaryPayload === "delayed-attention" && v1.capacityTopology === "shared-exclusive" &&
      v1.abilityUnlockBasis === "personal-claim-count" && v1.abilityPackage === "complete" &&
      v1.unresolvedDisposition === "auto-accept";
    if (!matches) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ruleShape"], message: "v1 bridge must encode the exact v1 rule shape" });
  }
});
export type AttentionV2ModelDefinition = z.infer<typeof AttentionV2ModelDefinitionSchema>;

export const AttentionV2ModelCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  designKind: z.literal("constrained-balanced-main-effects"),
  factorCount: z.literal(ATTENTION_V2_FACTOR_COUNT),
  catalogId: z.string().min(1),
  catalogHash: digest,
  v1BridgeModelId: z.string().min(1),
  designDiagnostics: z.object({
    designSeed: z.number().int().positive(),
    mainEffectColumns: z.literal(37),
    mainEffectRank: z.literal(37),
    maxAbsoluteAlias: z.number().min(0).max(0.75)
  }).strict(),
  models: z.array(AttentionV2ModelDefinitionSchema).length(40)
}).strict().superRefine((catalog, context) => {
  const ids = new Set(catalog.models.map((model) => model.modelId));
  const rows = new Set(catalog.models.map((model) => model.designRow));
  const hashes = new Set(catalog.models.map((model) => model.ruleShapeHash));
  if (ids.size !== 40) context.addIssue({ code: z.ZodIssueCode.custom, path: ["models"], message: "model IDs must be unique" });
  if (rows.size !== 40 || [...rows].some((row) => row < 0 || row > 39)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["models"], message: "design rows must cover 0 through 39 exactly once" });
  }
  if (hashes.size !== 40) context.addIssue({ code: z.ZodIssueCode.custom, path: ["models"], message: "rule shapes must be hash-distinct" });
  const counts = new Map<string, number>();
  for (const model of catalog.models) counts.set(model.role, (counts.get(model.role) ?? 0) + 1);
  const expectedRoles: Record<string, number> = {
    design: 36,
    "v1-bridge": 1,
    "core-sentinel": 1,
    "all-on-sentinel": 1,
    "fast-follower-sentinel": 1
  };
  for (const [role, count] of Object.entries(expectedRoles)) {
    if (counts.get(role) !== count) context.addIssue({ code: z.ZodIssueCode.custom, path: ["models"], message: `${role} must have exactly ${count} row(s)` });
  }
  const bridge = catalog.models.find((model) => model.role === "v1-bridge");
  if (bridge?.modelId !== catalog.v1BridgeModelId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["v1BridgeModelId"], message: "v1BridgeModelId must identify the v1-bridge row" });
  }
});
export type AttentionV2ModelCatalog = z.infer<typeof AttentionV2ModelCatalogSchema>;

export const AttentionV2CommanderProfileSchema = z.object({
  schemaVersion: z.literal(1),
  commanderId: z.string().min(1),
  ordinal: z.number().int().min(0).max(ATTENTION_V2_COMMANDER_PROFILE_COUNT - 1),
  compositionModule: z.enum(ATTENTION_V2_COMPOSITION_MODULES),
  triageModule: z.enum(ATTENTION_V2_TRIAGE_MODULES),
  movementModule: z.enum(ATTENTION_V2_MOVEMENT_MODULES),
  capacityModule: z.enum(ATTENTION_V2_CAPACITY_MODULES),
  profileHash: digest,
  resolverRequirement: z.literal("attention-v2")
}).strict().superRefine((profile, context) => {
  const composition = ATTENTION_V2_COMPOSITION_MODULES.indexOf(profile.compositionModule);
  const triage = ATTENTION_V2_TRIAGE_MODULES.indexOf(profile.triageModule);
  const movement = ATTENTION_V2_MOVEMENT_MODULES.indexOf(profile.movementModule);
  const capacity = ATTENTION_V2_CAPACITY_MODULES.indexOf(profile.capacityModule);
  const expected = ((composition * ATTENTION_V2_TRIAGE_MODULES.length + triage) *
    ATTENTION_V2_MOVEMENT_MODULES.length + movement) * ATTENTION_V2_CAPACITY_MODULES.length + capacity;
  if (profile.ordinal !== expected) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ordinal"], message: `ordinal must be ${expected} for this module tuple` });
  }
});
export type AttentionV2CommanderProfile = z.infer<typeof AttentionV2CommanderProfileSchema>;

export const AttentionV2CommanderCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogId: z.string().min(1),
  catalogHash: digest,
  profiles: z.array(AttentionV2CommanderProfileSchema).length(ATTENTION_V2_COMMANDER_PROFILE_COUNT)
}).strict().superRefine((catalog, context) => {
  const ids = new Set(catalog.profiles.map((profile) => profile.commanderId));
  const ordinals = new Set(catalog.profiles.map((profile) => profile.ordinal));
  const hashes = new Set(catalog.profiles.map((profile) => profile.profileHash));
  if (ids.size !== ATTENTION_V2_COMMANDER_PROFILE_COUNT) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profiles"], message: "commander IDs must be unique" });
  }
  if (ordinals.size !== ATTENTION_V2_COMMANDER_PROFILE_COUNT) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profiles"], message: "commander ordinals must cover all 6,400 profiles" });
  }
  if (hashes.size !== ATTENTION_V2_COMMANDER_PROFILE_COUNT) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profiles"], message: "normalized commander profiles must be hash-distinct" });
  }
});
export type AttentionV2CommanderCatalog = z.infer<typeof AttentionV2CommanderCatalogSchema>;

export const AttentionV2BattleSampleRefSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: z.literal("attention-v2-battle-sample"),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  sampleId: z.string().min(1),
  battle: BattleVolumeRefV1Schema,
  coordinate: BattleCoordinateV1Schema,
  generator: z.object({
    spatialPressure: z.number().int().min(0).max(31),
    formationGeometry: z.number().int().min(0).max(31),
    informationPressure: z.number().int().min(0).max(31)
  }).strict(),
  sampleHash: digest
}).strict();
export type AttentionV2BattleSampleRef = z.infer<typeof AttentionV2BattleSampleRefSchema>;

export const AttentionV2SamplingWeightSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fixed-design"),
    analysisWeight: z.number().positive()
  }).strict(),
  z.object({
    kind: z.literal("probability-sample"),
    inclusionProbability: z.number().gt(0).max(1),
    drawDesignHash: digest
  }).strict()
]);
export type AttentionV2SamplingWeight = z.infer<typeof AttentionV2SamplingWeightSchema>;

export const AttentionV2SparseMatchupEdgeSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: z.literal("attention-v2-matchup-edge"),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  edgeId: z.string().min(1),
  leftCommanderId: z.string().min(1),
  rightCommanderId: z.string().min(1),
  seatOrientation: z.union([z.literal(1), z.literal(2)]),
  stratum: z.enum(["uniform", "nearby", "adversarial", "self-play", "sentinel"]),
  samplingWeight: AttentionV2SamplingWeightSchema,
  pairHash: digest
}).strict().superRefine((edge, context) => {
  const selfPlay = edge.leftCommanderId === edge.rightCommanderId;
  if ((edge.stratum === "self-play") !== selfPlay) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stratum"], message: "self-play stratum must match commander identity" });
  }
});
export type AttentionV2SparseMatchupEdge = z.infer<typeof AttentionV2SparseMatchupEdgeSchema>;

export const AttentionV2SweepStageSchema = z.enum([
  "shape-screen",
  "survivor-refinement",
  "sparse-volume-drill-down",
  "full-volume-sentinel-audit",
  "landscape-holdout",
  "gate-confirmation"
]);
export type AttentionV2SweepStage = z.infer<typeof AttentionV2SweepStageSchema>;

export const AttentionV2SparseBattleSampleSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: z.literal("attention-v2-sparse-battle-sample"),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  stage: AttentionV2SweepStageSchema,
  fold: z.string().min(1),
  samplingWeight: AttentionV2SamplingWeightSchema,
  sample: AttentionV2BattleSampleRefSchema
}).strict();
export type AttentionV2SparseBattleSample = z.infer<typeof AttentionV2SparseBattleSampleSchema>;

export const ATTENTION_V2_SWEEP_RUNS = {
  lean: {
    "shape-screen": 2_560_000,
    "survivor-refinement": 1_536_000,
    "sparse-volume-drill-down": 262_144,
    "full-volume-sentinel-audit": 262_144,
    "landscape-holdout": 1_228_800,
    "gate-confirmation": 100_000
  },
  standard: {
    "shape-screen": 9_216_000,
    "survivor-refinement": 11_059_200,
    "sparse-volume-drill-down": 3_145_728,
    "full-volume-sentinel-audit": 1_572_864,
    "landscape-holdout": 4_915_200,
    "gate-confirmation": 100_000
  },
  deep: {
    "shape-screen": 34_816_000,
    "survivor-refinement": 27_852_800,
    "sparse-volume-drill-down": 16_777_216,
    "full-volume-sentinel-audit": 8_388_608,
    "landscape-holdout": 65_536_000,
    "gate-confirmation": 200_000
  }
} as const;

export const ATTENTION_V2_SWEEP_FACTORS = {
  lean: {
    "shape-screen": { modelRows: 40, matchupCells: 16_000, battleSamplesPerMatchup: 1, seedsPerCell: 4 },
    "survivor-refinement": { modelRows: 12, matchupCells: 16_000, battleSamplesPerMatchup: 1, seedsPerCell: 8 },
    "sparse-volume-drill-down": { modelRows: 2, matchupCells: 256, battleSamplesPerMatchup: 64, seedsPerCell: 8 },
    "full-volume-sentinel-audit": { modelRows: 1, matchupCells: 4, battleSamplesPerMatchup: 32_768, seedsPerCell: 2 },
    "landscape-holdout": { modelRows: 3, matchupCells: 6_400, battleSamplesPerMatchup: 8, seedsPerCell: 8 },
    "gate-confirmation": { modelRows: 1, matchupCells: 20, battleSamplesPerMatchup: 1, seedsPerCell: 5_000 }
  },
  standard: {
    "shape-screen": { modelRows: 40, matchupCells: 57_600, battleSamplesPerMatchup: 1, seedsPerCell: 4 },
    "survivor-refinement": { modelRows: 24, matchupCells: 57_600, battleSamplesPerMatchup: 1, seedsPerCell: 8 },
    "sparse-volume-drill-down": { modelRows: 3, matchupCells: 512, battleSamplesPerMatchup: 256, seedsPerCell: 8 },
    "full-volume-sentinel-audit": { modelRows: 3, matchupCells: 8, battleSamplesPerMatchup: 32_768, seedsPerCell: 2 },
    "landscape-holdout": { modelRows: 3, matchupCells: 25_600, battleSamplesPerMatchup: 8, seedsPerCell: 8 },
    "gate-confirmation": { modelRows: 1, matchupCells: 20, battleSamplesPerMatchup: 1, seedsPerCell: 5_000 }
  },
  deep: {
    "shape-screen": { modelRows: 40, matchupCells: 108_800, battleSamplesPerMatchup: 1, seedsPerCell: 8 },
    "survivor-refinement": { modelRows: 32, matchupCells: 108_800, battleSamplesPerMatchup: 1, seedsPerCell: 8 },
    "sparse-volume-drill-down": { modelRows: 4, matchupCells: 1_024, battleSamplesPerMatchup: 512, seedsPerCell: 8 },
    "full-volume-sentinel-audit": { modelRows: 4, matchupCells: 32, battleSamplesPerMatchup: 32_768, seedsPerCell: 2 },
    "landscape-holdout": { modelRows: 4, matchupCells: 51_200, battleSamplesPerMatchup: 10, seedsPerCell: 32 },
    "gate-confirmation": { modelRows: 1, matchupCells: 20, battleSamplesPerMatchup: 1, seedsPerCell: 10_000 }
  }
} as const;

export const AttentionV2SweepStageFactorsSchema = z.object({
  modelRows: z.number().int().positive(),
  matchupCells: z.number().int().positive(),
  battleSamplesPerMatchup: z.number().int().positive(),
  seedsPerCell: z.number().int().positive()
}).strict();
export type AttentionV2SweepStageFactors = z.infer<typeof AttentionV2SweepStageFactorsSchema>;

export const AttentionV2SweepBudgetSchema = z.object({
  profile: z.enum(["lean", "standard", "deep"]),
  stages: z.array(z.object({
    stage: AttentionV2SweepStageSchema,
    factors: AttentionV2SweepStageFactorsSchema,
    plannedRuns: z.number().int().positive()
  }).strict()).length(6),
  plannedRuns: z.number().int().positive()
}).strict().superRefine((budget, context) => {
  const stageMap = new Map(budget.stages.map((stage) => [stage.stage, stage.plannedRuns]));
  if (stageMap.size !== 6) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "budget must contain each sweep stage exactly once" });
    return;
  }
  const expected = ATTENTION_V2_SWEEP_RUNS[budget.profile];
  for (const [stage, runs] of Object.entries(expected)) {
    const entry = budget.stages.find((candidate) => candidate.stage === stage);
    if (stageMap.get(stage as AttentionV2SweepStage) !== runs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: `${stage} must plan ${runs} runs for ${budget.profile}` });
    }
    if (!entry) continue;
    const factors = entry.factors;
    const product = factors.modelRows * factors.matchupCells * factors.battleSamplesPerMatchup * factors.seedsPerCell;
    if (!Number.isSafeInteger(product) || entry.plannedRuns !== product) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: `${stage} plannedRuns must equal its safe-integer factor product` });
    }
    const frozen = ATTENTION_V2_SWEEP_FACTORS[budget.profile][stage as AttentionV2SweepStage];
    if (Object.keys(frozen).some((key) => factors[key as keyof typeof factors] !== frozen[key as keyof typeof frozen])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: `${stage} factors must match the frozen ${budget.profile} design` });
    }
  }
  const total = budget.stages.reduce((sum, stage) => sum + stage.plannedRuns, 0);
  if (budget.plannedRuns !== total) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["plannedRuns"], message: `plannedRuns must equal stage sum ${total}` });
  }
});
export type AttentionV2SweepBudget = z.infer<typeof AttentionV2SweepBudgetSchema>;

export const AttentionV2SweepFoldSchema = z.enum(["train", "refine", "drill", "holdout"]);
export type AttentionV2SweepFold = z.infer<typeof AttentionV2SweepFoldSchema>;

export const AttentionV2EdgeCatalogRefSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  stage: AttentionV2SweepStageSchema,
  fold: AttentionV2SweepFoldSchema,
  catalogId: z.string().min(1),
  catalogHash: digest,
  selectionDesignHash: digest,
  degree: z.number().int().nonnegative(),
  basePairCount: z.number().int().nonnegative(),
  orientedCellCount: z.number().int().positive(),
  selfPlayCount: z.number().int().nonnegative(),
  samplingDesign: z.literal("fixed-design")
}).strict();
export type AttentionV2EdgeCatalogRef = z.infer<typeof AttentionV2EdgeCatalogRefSchema>;

export const AttentionV2BattleSampleCatalogRefSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  stage: AttentionV2SweepStageSchema,
  fold: AttentionV2SweepFoldSchema,
  catalogId: z.string().min(1),
  catalogHash: digest,
  sampleFrameHash: digest,
  sampleCount: z.number().int().positive(),
  selectionDesignHash: digest,
  samplingDesign: z.literal("fixed-design")
}).strict();
export type AttentionV2BattleSampleCatalogRef = z.infer<typeof AttentionV2BattleSampleCatalogRefSchema>;

export const AttentionV2FoldAssignmentSchema = z.object({
  schemaVersion: z.literal(1),
  fold: AttentionV2SweepFoldSchema,
  seedNamespace: z.string().min(1),
  stages: z.array(AttentionV2SweepStageSchema).min(1),
  edgeCatalogs: z.array(AttentionV2EdgeCatalogRefSchema).min(1),
  battleSampleCatalogs: z.array(AttentionV2BattleSampleCatalogRefSchema).min(1),
  frozen: z.literal(true),
  selectable: z.boolean(),
  assignmentHash: digest
}).strict().superRefine((assignment, context) => {
  if (new Set(assignment.stages).size !== assignment.stages.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "fold stages must be unique" });
  }
  if (assignment.edgeCatalogs.some((catalog) => catalog.fold !== assignment.fold || !assignment.stages.includes(catalog.stage))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["edgeCatalogs"], message: "edge catalogs must belong to this fold and one of its stages" });
  }
  if (assignment.battleSampleCatalogs.some((catalog) => catalog.fold !== assignment.fold || !assignment.stages.includes(catalog.stage))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["battleSampleCatalogs"], message: "battle-sample catalogs must belong to this fold and one of its stages" });
  }
});
export type AttentionV2FoldAssignment = z.infer<typeof AttentionV2FoldAssignmentSchema>;

export const AttentionV2PairedWorldBlockSchema = z.object({
  schemaVersion: z.literal(1),
  stage: AttentionV2SweepStageSchema,
  worldBlockId: z.string().min(1),
  namespace: z.string().min(1),
  seedStart: z.number().int().nonnegative(),
  seedsPerCell: z.number().int().positive(),
  pairedAcross: z.tuple([z.literal("model-row"), z.literal("seat-orientation")]),
  randomStreamKeyVersion: z.literal("attention-v2-world-v1"),
  blockHash: digest
}).strict();
export type AttentionV2PairedWorldBlock = z.infer<typeof AttentionV2PairedWorldBlockSchema>;

export const AttentionV2ModelCatalogRefSchema = z.object({
  catalogId: z.string().min(1),
  catalogHash: digest,
  rowCount: z.literal(40)
}).strict();
export type AttentionV2ModelCatalogRef = z.infer<typeof AttentionV2ModelCatalogRefSchema>;

export const AttentionV2StageModelSourceKindSchema = z.enum(["catalog-row", "local-variant", "carried-forward"]);
export type AttentionV2StageModelSourceKind = z.infer<typeof AttentionV2StageModelSourceKindSchema>;

export const AttentionV2StageModelDependencyRelationSchema = z.enum([
  "derived-from",
  "selected-from",
  "exact-reuse",
  "confirmation-of"
]);
export type AttentionV2StageModelDependencyRelation = z.infer<typeof AttentionV2StageModelDependencyRelationSchema>;

export const AttentionV2PendingStageModelDependencySchema = z.object({
  upstreamStage: AttentionV2SweepStageSchema,
  relation: AttentionV2StageModelDependencyRelationSchema
}).strict();
export type AttentionV2PendingStageModelDependency = z.infer<typeof AttentionV2PendingStageModelDependencySchema>;

export const AttentionV2MaterializedStageModelDependencySchema = AttentionV2PendingStageModelDependencySchema.extend({
  upstreamModelSetHash: digest,
  upstreamSelectionReportHash: digest
}).strict();
export type AttentionV2MaterializedStageModelDependency = z.infer<typeof AttentionV2MaterializedStageModelDependencySchema>;

export const AttentionV2StageModelMemberSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  modelId: z.string().min(1),
  modelHash: digest,
  ruleShape: AttentionV2RuleShapeSchema,
  ruleShapeHash: digest,
  sourceKind: AttentionV2StageModelSourceKindSchema,
  parentModelId: z.string().min(1).nullable(),
  parentModelSetHash: digest.nullable(),
  derivationHash: digest.nullable(),
  memberHash: digest
}).strict().superRefine((member, context) => {
  if (member.sourceKind === "catalog-row" &&
    (member.parentModelId !== null || member.parentModelSetHash !== null || member.derivationHash !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceKind"], message: "catalog rows cannot claim a parent or derivation" });
  }
  if (member.sourceKind === "local-variant" &&
    (!member.parentModelId || !member.parentModelSetHash || !member.derivationHash)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceKind"], message: "local variants must bind their parent model, parent set, and derivation" });
  }
  if (member.sourceKind === "carried-forward" &&
    (!member.parentModelId || !member.parentModelSetHash || member.derivationHash !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceKind"], message: "carried-forward models must bind an unchanged parent without a derivation" });
  }
});
export type AttentionV2StageModelMember = z.infer<typeof AttentionV2StageModelMemberSchema>;

export const AttentionV2StageModelSelectionReportSchema = z.object({
  schemaVersion: z.literal(1),
  plannerVersion: z.literal(ATTENTION_V2_PLANNER_VERSION),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  planHash: digest,
  sourceStage: AttentionV2SweepStageSchema,
  targetStage: AttentionV2SweepStageSchema,
  sourceModelSetHash: digest,
  completedEvidenceReportHashes: z.array(digest).min(1),
  selectionProtocolHash: digest,
  selectedSourceModels: z.array(z.object({ modelId: z.string().min(1), modelHash: digest }).strict()).min(1),
  outputModelSetHash: digest,
  fold: AttentionV2SweepFoldSchema,
  completionStatus: z.literal("complete"),
  predictionOnlyPromotion: z.literal(false),
  selectionReportHash: digest
}).strict().superRefine((report, context) => {
  if (new Set(report.completedEvidenceReportHashes).size !== report.completedEvidenceReportHashes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completedEvidenceReportHashes"], message: "evidence report hashes must be unique" });
  }
  if (new Set(report.selectedSourceModels.map((model) => model.modelId)).size !== report.selectedSourceModels.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedSourceModels"], message: "selected source model IDs must be unique" });
  }
});
export type AttentionV2StageModelSelectionReport = z.infer<typeof AttentionV2StageModelSelectionReportSchema>;

const attentionV2StageModelCounts: Record<AttentionV2SweepStage, number> = {
  "shape-screen": 40,
  "survivor-refinement": 24,
  "sparse-volume-drill-down": 3,
  "full-volume-sentinel-audit": 3,
  "landscape-holdout": 3,
  "gate-confirmation": 1
};

const attentionV2StageLineage: Record<AttentionV2SweepStage, AttentionV2PendingStageModelDependency | null> = {
  "shape-screen": null,
  "survivor-refinement": { upstreamStage: "shape-screen", relation: "derived-from" },
  "sparse-volume-drill-down": { upstreamStage: "survivor-refinement", relation: "selected-from" },
  "full-volume-sentinel-audit": { upstreamStage: "sparse-volume-drill-down", relation: "exact-reuse" },
  "landscape-holdout": { upstreamStage: "full-volume-sentinel-audit", relation: "selected-from" },
  "gate-confirmation": { upstreamStage: "landscape-holdout", relation: "confirmation-of" }
};

function stageDependencyMatches(
  stage: AttentionV2SweepStage,
  dependencies: readonly AttentionV2PendingStageModelDependency[]
): boolean {
  const expected = attentionV2StageLineage[stage];
  return expected === null
    ? dependencies.length === 0
    : dependencies.length === 1 && dependencies[0].upstreamStage === expected.upstreamStage && dependencies[0].relation === expected.relation;
}

export const AttentionV2StageModelCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  plannerVersion: z.literal(ATTENTION_V2_PLANNER_VERSION),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  planHash: digest,
  stage: AttentionV2SweepStageSchema,
  rootModelCatalogHash: digest,
  modelSetId: z.string().min(1),
  modelSetHash: digest,
  catalogHash: digest,
  selectionProtocolHash: digest,
  selectionReportHash: digest.nullable(),
  dependencies: z.array(AttentionV2MaterializedStageModelDependencySchema).max(1),
  modelCount: z.number().int().positive(),
  members: z.array(AttentionV2StageModelMemberSchema).min(1),
  frozen: z.literal(true)
}).strict().superRefine((catalog, context) => {
  if (catalog.modelCount !== catalog.members.length || catalog.modelCount !== attentionV2StageModelCounts[catalog.stage]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["modelCount"], message: `${catalog.stage} must contain its frozen stage model count` });
  }
  for (const field of ["modelId", "modelHash", "memberHash"] as const) {
    if (new Set(catalog.members.map((member) => member[field])).size !== catalog.members.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["members"], message: `${field} values must be unique within a stage model catalog` });
    }
  }
  if (!stageDependencyMatches(catalog.stage, catalog.dependencies)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dependencies"], message: `${catalog.stage} must follow the frozen stage dependency chain` });
  }
  if (catalog.stage === "shape-screen") {
    if (catalog.selectionReportHash !== null || catalog.members.some((member) => member.sourceKind !== "catalog-row")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["members"], message: "shape-screen members must be original catalog rows without a selection report" });
    }
  } else if (catalog.selectionReportHash === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectionReportHash"], message: "post-screen catalogs require a completed selection report" });
  }
  if (catalog.stage === "survivor-refinement") {
    const parentCounts = new Map<string, number>();
    for (const member of catalog.members) {
      if (member.sourceKind !== "local-variant" || !member.parentModelId) continue;
      parentCounts.set(member.parentModelId, (parentCounts.get(member.parentModelId) ?? 0) + 1);
    }
    if (parentCounts.size !== 6 || [...parentCounts.values()].some((count) => count !== 4)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["members"], message: "refinement must contain four local variants for each of six selected parents" });
    }
  }
  if (["sparse-volume-drill-down", "full-volume-sentinel-audit", "gate-confirmation"].includes(catalog.stage) &&
    catalog.members.some((member) => member.sourceKind !== "carried-forward")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["members"], message: `${catalog.stage} members must be carried forward from the verified parent set` });
  }
  if (catalog.stage === "landscape-holdout") {
    const sourceKinds = catalog.members.map((member) => member.sourceKind);
    if (sourceKinds.filter((kind) => kind === "catalog-row").length !== 1 || sourceKinds.filter((kind) => kind === "carried-forward").length !== 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["members"], message: "holdout must contain the v1 bridge and two carried-forward candidates" });
    }
  }
});
export type AttentionV2StageModelCatalog = z.infer<typeof AttentionV2StageModelCatalogSchema>;

const stageModelSetBase = {
  schemaVersion: z.literal(1),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  stage: AttentionV2SweepStageSchema,
  modelCount: z.number().int().positive(),
  selectionProtocolHash: digest,
  rootModelCatalogHash: digest
};

export const AttentionV2StageModelSetRefSchema = z.discriminatedUnion("materializationStatus", [
  z.object({
    ...stageModelSetBase,
    materializationStatus: z.literal("materialized"),
    modelSetId: z.string().min(1),
    modelSetHash: digest,
    catalogHash: digest,
    selectionReportHash: digest.nullable(),
    dependencies: z.array(AttentionV2MaterializedStageModelDependencySchema).max(1)
  }).strict(),
  z.object({
    ...stageModelSetBase,
    materializationStatus: z.literal("pending-selection"),
    dependencies: z.array(AttentionV2PendingStageModelDependencySchema).length(1)
  }).strict()
]).superRefine((modelSet, context) => {
  if (modelSet.modelCount !== attentionV2StageModelCounts[modelSet.stage]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["modelCount"], message: `${modelSet.stage} model count must match the frozen stage design` });
  }
  if (!stageDependencyMatches(modelSet.stage, modelSet.dependencies)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dependencies"], message: `${modelSet.stage} must follow the frozen stage dependency chain` });
  }
  if (modelSet.materializationStatus === "materialized") {
    if (modelSet.stage === "shape-screen" && modelSet.selectionReportHash !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectionReportHash"], message: "shape screen has no upstream selection report" });
    }
    if (modelSet.stage !== "shape-screen" && modelSet.selectionReportHash === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectionReportHash"], message: "post-screen materialization requires a completed selection report" });
    }
  } else if (modelSet.stage === "shape-screen") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["materializationStatus"], message: "shape screen must already be materialized" });
  }
});
export type AttentionV2StageModelSetRef = z.infer<typeof AttentionV2StageModelSetRefSchema>;

export const AttentionV2PlannerIdentitySchema = z.object({
  factorCatalogHash: digest,
  modelCatalogHash: digest,
  commanderCatalogHash: digest,
  edgeCatalogSetHash: digest,
  battleSampleCatalogSetHash: digest,
  foldAssignmentHash: digest
}).strict();
export type AttentionV2PlannerIdentity = z.infer<typeof AttentionV2PlannerIdentitySchema>;

export const AttentionV2SweepPlanSchema = z.object({
  schemaVersion: z.literal(1),
  plannerVersion: z.literal(ATTENTION_V2_PLANNER_VERSION),
  planId: z.string().min(1),
  planHash: digest,
  modelVersion: AttentionV2ModelVersionSchema,
  requiredResolver: z.literal("attention-v2"),
  parentV1ManifestHash: digest,
  parentV1ReportHash: digest,
  parentPlanHash: digest.nullable(),
  createdAt: z.string().datetime(),
  modelCatalog: AttentionV2ModelCatalogRefSchema,
  commanderProfiles: z.literal(ATTENTION_V2_COMMANDER_PROFILE_COUNT),
  budget: AttentionV2SweepBudgetSchema,
  planner: AttentionV2PlannerIdentitySchema,
  stageModelSets: z.array(AttentionV2StageModelSetRefSchema).length(6),
  folds: z.array(AttentionV2FoldAssignmentSchema).length(4),
  worldBlocks: z.array(AttentionV2PairedWorldBlockSchema).length(6),
  executionStatus: z.literal("requires-v2-campaign-runner")
}).strict().superRefine((plan, context) => {
  if (plan.budget.profile !== "standard") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "profile"], message: "only the fully materialized standard design can produce a sweep plan" });
  }
  if (plan.modelCatalog.catalogHash !== plan.planner.modelCatalogHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["modelCatalog", "catalogHash"], message: "model catalog must match planner identity" });
  }
  const modelSetStages = new Set(plan.stageModelSets.map((modelSet) => modelSet.stage));
  if (modelSetStages.size !== 6) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: "stage model sets must cover every stage exactly once" });
  }
  for (const stage of plan.budget.stages) {
    const modelSet = plan.stageModelSets.find((candidate) => candidate.stage === stage.stage);
    if (!modelSet || modelSet.modelCount !== stage.factors.modelRows) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: `${stage.stage} model-set count must match its budget factors` });
    }
  }
  const screenModels = plan.stageModelSets.find((modelSet) => modelSet.stage === "shape-screen");
  if (screenModels?.materializationStatus !== "materialized" || screenModels.catalogHash !== plan.modelCatalog.catalogHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: "shape screen must bind the materialized 40-row model catalog" });
  }
  for (const modelSet of plan.stageModelSets) {
    if (modelSet.rootModelCatalogHash !== plan.modelCatalog.catalogHash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: `${modelSet.stage} must retain the root 40-row model catalog identity` });
    }
    if (modelSet.materializationStatus !== "materialized" || modelSet.stage === "shape-screen") continue;
    const dependency = modelSet.dependencies[0];
    const upstream = dependency && plan.stageModelSets.find((candidate) => candidate.stage === dependency.upstreamStage);
    if (!upstream || upstream.materializationStatus !== "materialized" || upstream.modelSetHash !== dependency.upstreamModelSetHash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: `${modelSet.stage} cannot materialize before its exact upstream model set` });
    }
    if (dependency?.upstreamSelectionReportHash !== modelSet.selectionReportHash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: `${modelSet.stage} must bind the selection report that produced it` });
    }
    if (dependency?.relation === "exact-reuse" && upstream?.materializationStatus === "materialized" && modelSet.modelSetHash !== upstream.modelSetHash) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["stageModelSets"], message: `${modelSet.stage} must reuse the exact upstream membership hash` });
    }
  }
  if (plan.stageModelSets.some((modelSet) => modelSet.stage !== "shape-screen" && modelSet.materializationStatus === "materialized") && plan.parentPlanHash === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parentPlanHash"], message: "post-screen materialization must create a child plan linked to its parent" });
  }
  const foldNames = new Set(plan.folds.map((fold) => fold.fold));
  const assignedStages = plan.folds.flatMap((fold) => fold.stages);
  const foldStages = new Set(assignedStages);
  if (foldNames.size !== 4 || foldStages.size !== 6 || assignedStages.length !== 6) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["folds"], message: "folds must cover each fold and sweep stage exactly once" });
  }
  if (plan.folds.some((fold) => fold.selectable === (fold.fold === "holdout"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["folds"], message: "only the holdout fold must be non-selectable" });
  }
  const edgeCatalogs = plan.folds.flatMap((fold) => fold.edgeCatalogs);
  const sampleCatalogs = plan.folds.flatMap((fold) => fold.battleSampleCatalogs);
  for (const stage of plan.budget.stages) {
    const edges = edgeCatalogs.filter((catalog) => catalog.stage === stage.stage);
    const samples = sampleCatalogs.filter((catalog) => catalog.stage === stage.stage);
    if (edges.length !== 1 || edges[0]?.orientedCellCount !== stage.factors.matchupCells) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["folds"], message: `${stage.stage} must bind one edge catalog with its planned matchup-cell count` });
    }
    if (samples.length !== 1 || samples[0]?.sampleCount !== stage.factors.battleSamplesPerMatchup) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["folds"], message: `${stage.stage} must bind one battle-sample catalog with its planned sample count` });
    }
    if (stage.stage === "shape-screen" && stage.factors.modelRows !== plan.modelCatalog.rowCount) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget"], message: "shape screen must cover every materialized model row" });
    }
  }
  const stages = new Set(plan.worldBlocks.map((entry) => entry.stage));
  if (stages.size !== 6) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["worldBlocks"], message: "paired-world blocks must cover every stage exactly once" });
  }
  for (const block of plan.worldBlocks) {
    const budget = plan.budget.stages.find((stage) => stage.stage === block.stage);
    if (budget && budget.factors.seedsPerCell !== block.seedsPerCell) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["worldBlocks"], message: `${block.stage} seed count must match its budget factors` });
    }
  }
  const sorted = [...plan.worldBlocks].sort((left, right) => left.seedStart - right.seedStart);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].seedStart < sorted[index - 1].seedStart + sorted[index - 1].seedsPerCell) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["worldBlocks"], message: "stage seed ranges must be disjoint" });
      break;
    }
  }
});
export type AttentionV2SweepPlan = z.infer<typeof AttentionV2SweepPlanSchema>;

export const AttentionV2RunPlannerIdentitySchema = z.object({
  schemaVersion: z.literal(1),
  plannerVersion: z.literal(ATTENTION_V2_PLANNER_VERSION),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  planId: z.string().min(1),
  planHash: digest,
  stage: AttentionV2SweepStageSchema,
  fold: AttentionV2SweepFoldSchema,
  modelId: z.string().min(1),
  modelSetHash: digest,
  edgeCatalogHash: digest,
  edgeId: z.string().min(1),
  pairHash: digest,
  battleSampleCatalogHash: digest,
  battleSampleId: z.string().min(1),
  worldBlockId: z.string().min(1),
  seed: z.number().int().nonnegative(),
  randomStreamId: digest,
  pairBlockId: digest,
  planner: AttentionV2PlannerIdentitySchema
}).strict();
export type AttentionV2RunPlannerIdentity = z.infer<typeof AttentionV2RunPlannerIdentitySchema>;

export const AttentionV2RunRecordSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  planHash: digest,
  stage: z.literal("shape-screen"),
  identity: AttentionV2RunPlannerIdentitySchema,
  modelId: z.string().min(1),
  policyOneId: z.string().min(1),
  policyTwoId: z.string().min(1),
  status: z.literal("complete"),
  winnerPlayerSlot: z.union([z.literal(1), z.literal(2)]).nullable(),
  terminalReason: z.enum(["objective", "drift", "round-limit", "simultaneous", "forfeit"]),
  rounds: z.number().int().nonnegative(),
  traceHash: digest,
  stateHash: digest,
  outcomeHash: digest
}).strict().superRefine((record, context) => {
  if (record.identity.planId !== record.planId || record.identity.planHash !== record.planHash || record.identity.modelId !== record.modelId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity"], message: "run identity must match its enclosing record" });
  }
});
export type AttentionV2RunRecord = z.infer<typeof AttentionV2RunRecordSchema>;

export const AttentionV2CompiledCommanderRefSchema = z.object({
  profile: AttentionV2CommanderProfileSchema,
  compilerVersion: z.literal("attention-v2-commander-compiler-1"),
  compositionId: z.string().min(1),
  policyId: z.string().min(1),
  policyHash: digest
}).strict();
export type AttentionV2CompiledCommanderRef = z.infer<typeof AttentionV2CompiledCommanderRefSchema>;

export const AttentionV2ControllerTelemetrySchema = z.object({
  movementCalls: z.number().int().nonnegative(),
  movementIntents: z.record(z.string(), z.number().int().nonnegative()),
  capacityCalls: z.number().int().nonnegative(),
  capacityIntents: z.record(z.string(), z.number().int().nonnegative()),
  commandCalls: z.number().int().nonnegative(),
  commandIntents: z.record(z.string(), z.number().int().nonnegative())
}).strict();
export type AttentionV2ControllerTelemetry = z.infer<typeof AttentionV2ControllerTelemetrySchema>;

export const AttentionV2EnrichedPlayerOutcomeSchema = z.object({
  playerId: z.string().min(1),
  commanderId: z.string().min(1),
  status: z.enum(["active", "victory", "defeat", "draw"]),
  progress: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
  counters: z.record(z.string(), z.number().finite().nonnegative()),
  controller: AttentionV2ControllerTelemetrySchema
}).strict();
export type AttentionV2EnrichedPlayerOutcome = z.infer<typeof AttentionV2EnrichedPlayerOutcomeSchema>;

/** Corrected v2 record: every catalog identity has a corresponding causal engine input. */
export const AttentionV2EnrichedRunRecordSchema = z.object({
  schemaVersion: z.literal(2),
  planId: z.string().min(1),
  planHash: digest,
  stage: z.literal("shape-screen"),
  identity: AttentionV2RunPlannerIdentitySchema,
  modelId: z.string().min(1),
  ruleShapeHash: digest,
  edge: z.object({
    edgeId: z.string().min(1),
    pairHash: digest,
    seatOrientation: z.union([z.literal(1), z.literal(2)]),
    stratum: z.enum(["uniform", "nearby", "adversarial", "self-play", "sentinel"]),
    left: AttentionV2CompiledCommanderRefSchema,
    right: AttentionV2CompiledCommanderRefSchema,
    playerOneCommanderId: z.string().min(1),
    playerTwoCommanderId: z.string().min(1)
  }).strict(),
  battleSampleId: z.string().min(1),
  battleSampleHash: digest,
  battleContextHash: digest,
  status: z.literal("complete"),
  winnerPlayerSlot: z.union([z.literal(1), z.literal(2)]).nullable(),
  terminalReason: z.enum(["objective", "drift", "round-limit", "simultaneous", "forfeit"]),
  rounds: z.number().int().nonnegative(),
  operations: z.number().int().positive(),
  eventTypes: z.record(z.string(), z.number().int().nonnegative()),
  players: z.tuple([AttentionV2EnrichedPlayerOutcomeSchema, AttentionV2EnrichedPlayerOutcomeSchema]),
  traceHash: digest,
  stateHash: digest,
  outcomeHash: digest
}).strict().superRefine((record, context) => {
  if (record.identity.planId !== record.planId || record.identity.planHash !== record.planHash || record.identity.modelId !== record.modelId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["identity"], message: "run identity must match its enclosing record" });
  }
  if (record.edge.edgeId !== record.identity.edgeId || record.edge.pairHash !== record.identity.pairHash) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["edge"], message: "edge attribution must match run identity" });
  }
  if (record.battleSampleId !== record.identity.battleSampleId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["battleSampleId"], message: "battle sample must match run identity" });
  }
  if (record.players[0].playerId !== "alpha" || record.players[1].playerId !== "bravo" ||
      record.players[0].commanderId !== record.edge.playerOneCommanderId || record.players[1].commanderId !== record.edge.playerTwoCommanderId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["players"], message: "player outcomes must retain oriented commander attribution" });
  }
});
export type AttentionV2EnrichedRunRecord = z.infer<typeof AttentionV2EnrichedRunRecordSchema>;

export const AttentionV2ShardCompletionSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  planHash: digest,
  stage: z.literal("shape-screen"),
  shardIndex: z.number().int().nonnegative(),
  expectedRecordCount: z.number().int().positive(),
  recordCount: z.number().int().nonnegative(),
  completionStatus: z.enum(["partial", "complete"]),
  shardHash: digest
}).strict().superRefine((marker, context) => {
  if (marker.completionStatus === "complete" && marker.recordCount !== marker.expectedRecordCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recordCount"], message: "complete shards must contain their exact expected record count" });
  }
  if (marker.completionStatus === "partial" && marker.recordCount >= marker.expectedRecordCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["completionStatus"], message: "partial shards must be below their expected record count" });
  }
});
export type AttentionV2ShardCompletion = z.infer<typeof AttentionV2ShardCompletionSchema>;

export const AttentionV2ShapeScreenReportSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().min(1),
  planHash: digest,
  stage: z.literal("shape-screen"),
  plannedRuns: z.number().int().positive(),
  observedRuns: z.number().int().nonnegative(),
  completionStatus: z.enum(["partial", "complete"]),
  shards: z.array(AttentionV2ShardCompletionSchema).min(1),
  reportHash: digest
}).strict().superRefine((report, context) => {
  if (report.completionStatus === "complete" && report.observedRuns !== report.plannedRuns) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["observedRuns"], message: "complete reports must contain the entire planned shape-screen budget" });
  }
  if (report.observedRuns !== report.shards.reduce((sum, shard) => sum + shard.recordCount, 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["observedRuns"], message: "report run count must equal its shard markers" });
  }
});
export type AttentionV2ShapeScreenReport = z.infer<typeof AttentionV2ShapeScreenReportSchema>;

export const AttentionV2ReportPlannerIdentitySchema = z.object({
  schemaVersion: z.literal(1),
  plannerVersion: z.literal(ATTENTION_V2_PLANNER_VERSION),
  modelVersion: z.literal(ATTENTION_V2_MODEL_VERSION),
  planId: z.string().min(1),
  planHash: digest,
  budget: AttentionV2SweepBudgetSchema,
  completionStatus: z.enum(["partial", "complete"]),
  observedRuns: z.number().int().nonnegative(),
  predictedCells: z.number().int().nonnegative(),
  planner: AttentionV2PlannerIdentitySchema
}).strict().superRefine((report, context) => {
  if (report.completionStatus === "complete" && report.observedRuns !== report.budget.plannedRuns) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["observedRuns"], message: "complete reports must contain the entire planned run budget" });
  }
});
export type AttentionV2ReportPlannerIdentity = z.infer<typeof AttentionV2ReportPlannerIdentitySchema>;
