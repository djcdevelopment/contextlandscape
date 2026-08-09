import { z } from "zod";

export const ActionSchema = z.enum([
  "scout",
  "build_contract",
  "implement",
  "review",
  "defend",
  "full_send",
  "consolidate"
]);
export type Action = z.infer<typeof ActionSchema>;

export const FireModeSchema = z.enum(["single", "semi", "full"]);
export type FireMode = z.infer<typeof FireModeSchema>;

export const OrderSchema = z.object({
  unitId: z.string().min(1),
  action: ActionSchema,
  fireMode: FireModeSchema.default("semi")
});
export type Order = z.infer<typeof OrderSchema>;

export const ScenarioDefinitionSchema = z.object({
  scenarioId: z.string(),
  title: z.string(),
  version: z.number().int().positive(),
  missionObjective: z.string(),
  mapWidth: z.number().int().positive(),
  mapHeight: z.number().int().positive(),
  lanes: z.array(z.string()),
  knownTerrain: z.array(z.string()),
  hiddenTruths: z.array(z.string()),
  startingCommanderEnergy: z.number().int().nonnegative(),
  artifactSlots: z.number().int().nonnegative(),
  victoryConditions: z.array(z.string()),
  failureConditions: z.array(z.string()),
  expectedLesson: z.string(),
  difficulty: z.number().int().min(1).max(5),
  seed: z.number().int(),
  falseLeads: z.array(z.string()).optional(),
  enemyDoctrine: z.string().optional(),
  availableMechs: z.array(z.string()).optional(),
  rulesProfile: z.enum(["integration", "false_bottleneck", "context_furnace", "documentation_fortress"]).optional()
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export const UnitStateSchema = z.object({
  unitId: z.string(),
  ownerId: z.string(),
  chassis: z.enum(["scout", "line", "siege"]),
  x: z.number().int(),
  y: z.number().int(),
  heat: z.number().int().nonnegative(),
  dispersion: z.number().int().nonnegative(),
  active: z.boolean()
});
export type UnitState = z.infer<typeof UnitStateSchema>;

export const RulesTuningSchema = z.object({
  tuningId: z.string().default("default"),
  startingCommanderEnergy: z.number().int().nonnegative().optional(),
  startingHeat: z.number().int().nonnegative().default(0),
  startingDispersion: z.number().int().nonnegative().default(0),
  startingConfidenceDrift: z.number().int().nonnegative().default(0),
  fullSendHeat: z.number().int().nonnegative().default(2),
  actionCostOverrides: z.record(z.number().int().nonnegative()).default({})
});
export type RulesTuning = z.infer<typeof RulesTuningSchema>;
export type RulesTuningInput = z.input<typeof RulesTuningSchema>;

export const MatchStateSchema = z.object({
  matchId: z.string(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int(),
  seed: z.number().int(),
  turn: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  eventSequence: z.number().int().nonnegative(),
  status: z.enum(["active", "victory", "defeat"]),
  objectiveProgress: z.number().int().nonnegative(),
  commanderEnergy: z.number().int().nonnegative(),
  commanderLoad: z.number().int().nonnegative(),
  heat: z.number().int().nonnegative(),
  dispersion: z.number().int().nonnegative(),
  confidenceDrift: z.number().int().nonnegative(),
  knownCells: z.array(z.string()),
  artifacts: z.array(z.string()),
  units: z.array(UnitStateSchema),
  contractExposed: z.boolean(),
  contractBuilt: z.boolean(),
  rollbackVerified: z.boolean(),
  compositionId: z.string().default("balanced"),
  rulesTuning: RulesTuningSchema.default({}),
  lessonFlags: z.array(z.string()).default([])
});
export type MatchState = z.infer<typeof MatchStateSchema>;

export const EventEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string(),
  matchId: z.string(),
  sequence: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  occurredAt: z.string(),
  eventType: z.string(),
  actorId: z.string().nullable(),
  causationId: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  data: z.record(z.unknown())
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const ReplayManifestSchema = z.object({
  schemaVersion: z.literal(1),
  matchId: z.string(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int(),
  engineVersion: z.string(),
  seed: z.number().int(),
  compositionId: z.string().default("balanced"),
  tuningId: z.string().default("default"),
  eventCount: z.number().int().nonnegative(),
  eventHash: z.string(),
  projectionHash: z.string()
});
export type ReplayManifest = z.infer<typeof ReplayManifestSchema>;

/**
 * A content-addressed artifact identifier. Producers should emit an
 * algorithm-qualified digest (for example `sha256:...`); keeping the contract
 * algorithm-neutral lets it also represent unavailable exploratory metadata.
 */
export const ContentDigestSchema = z.string().min(1);
export type ContentDigest = z.infer<typeof ContentDigestSchema>;

export const SimulationRunSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  matrixId: z.string(),
  provenanceId: z.string().min(1).optional(),
  manifestHash: ContentDigestSchema.optional(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int(),
  engineVersion: z.string(),
  seed: z.number().int(),
  compositionId: z.string(),
  tuningId: z.string(),
  startingCommanderEnergy: z.number().int().nonnegative(),
  startingHeat: z.number().int().nonnegative(),
  startingDispersion: z.number().int().nonnegative(),
  startingConfidenceDrift: z.number().int().nonnegative(),
  policyId: z.string(),
  lessonPolicy: z.boolean(),
  status: z.enum(["active", "victory", "defeat"]),
  objectiveProgress: z.number().int().nonnegative(),
  commanderEnergySpent: z.number().int().nonnegative(),
  heat: z.number().int().nonnegative(),
  dispersion: z.number().int().nonnegative(),
  rejectedOrders: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
  eventHash: z.string(),
  projectionHash: z.string()
});
export type SimulationRun = z.infer<typeof SimulationRunSchema>;

/**
 * The immutable build/model identity attached to provenance-aware matrices.
 * `manifestHash` is calculated from the canonical manifest payload with the
 * manifest hash field omitted, avoiding a self-referential digest.
 */
export const BuildProvenanceSchema = z.object({
  provenanceVersion: z.literal(1),
  canonical: z.boolean(),
  repository: z.string().min(1),
  sourceRevision: z.string().min(1),
  sourceTree: z.string().min(1),
  workspaceDirty: z.boolean(),
  engineVersion: z.string().min(1),
  commandModelVersion: z.string().min(1),
  contractVersion: z.number().int().positive(),
  modelHash: ContentDigestSchema,
  scenarioSetHash: ContentDigestSchema,
  policySetHash: ContentDigestSchema,
  manifestHash: ContentDigestSchema,
  nodeVersion: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  architecture: z.string().min(1).optional(),
  imageDigest: ContentDigestSchema.optional()
});
export type BuildProvenance = z.infer<typeof BuildProvenanceSchema>;

/** Matrix-specific name retained for discoverability at the use site. */
export const MatrixProvenanceSchema = BuildProvenanceSchema;
export type MatrixProvenance = BuildProvenance;

const SimulationMatrixFields = {
  matrixId: z.string(),
  engineVersion: z.string(),
  scenarioIds: z.array(z.string()),
  compositionIds: z.array(z.string()),
  tuningCount: z.number().int().positive().default(1),
  tuningOverrides: z.array(RulesTuningSchema).min(1).optional(),
  policyOverrides: z.array(z.object({
    policyId: z.string().min(1),
    lessonPolicy: z.boolean().default(false),
    orders: z.array(OrderSchema).min(1)
  })).min(1).optional(),
  policyCount: z.number().int().positive(),
  runsPerCell: z.number().int().positive(),
  seedStart: z.number().int(),
  shardCount: z.number().int().positive(),
  createdAt: z.string(),
  sourceLabSessionId: z.string().optional(),
  selectedVariantId: z.string().optional()
};

/** Legacy matrix manifests remain parseable exactly as they were. */
export const SimulationMatrixV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...SimulationMatrixFields
});
export type SimulationMatrixV1 = z.infer<typeof SimulationMatrixV1Schema>;

/** New matrix manifests require source/model provenance, canonical or exploratory. */
export const SimulationMatrixV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...SimulationMatrixFields,
  provenance: MatrixProvenanceSchema
});
export type SimulationMatrixV2 = z.infer<typeof SimulationMatrixV2Schema>;

export const SimulationMatrixSchema = z
  .discriminatedUnion("schemaVersion", [SimulationMatrixV1Schema, SimulationMatrixV2Schema])
  .superRefine((matrix, context) => {
    if (matrix.schemaVersion === 2 && matrix.engineVersion !== matrix.provenance.engineVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance", "engineVersion"],
        message: "Provenance engineVersion must match the matrix engineVersion"
      });
    }
    if (matrix.schemaVersion === 2 && matrix.provenance.canonical && matrix.provenance.workspaceDirty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance", "workspaceDirty"],
        message: "Canonical provenance requires a clean workspace"
      });
    }
    if (matrix.schemaVersion === 2 && matrix.provenance.canonical &&
        (matrix.provenance.sourceRevision.startsWith("unavailable:") || matrix.provenance.sourceTree.startsWith("unavailable:"))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance", "sourceRevision"],
        message: "Canonical provenance requires identified source"
      });
    }
  });
export type SimulationMatrix = z.infer<typeof SimulationMatrixSchema>;

export const ExperimentLedgerEntrySchema = z.object({
  schemaVersion: z.literal(1),
  matrixId: z.string().min(1),
  createdAt: z.string().min(1),
  completedAt: z.string().min(1),
  stage: z.enum(["exploratory", "train", "holdout", "follow-up"]).default("exploratory"),
  parentMatrixId: z.string().min(1).optional(),
  hypothesis: z.string().min(1).optional(),
  disposition: z.string().min(1).optional(),
  sourceRevision: z.string().min(1),
  modelHash: ContentDigestSchema,
  manifestHash: ContentDigestSchema,
  reportHash: ContentDigestSchema,
  manifestPath: z.string().min(1),
  reportPath: z.string().min(1),
  runs: z.number().int().nonnegative()
});
export type ExperimentLedgerEntry = z.infer<typeof ExperimentLedgerEntrySchema>;

export const ExperimentLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  experiments: z.array(ExperimentLedgerEntrySchema)
});
export type ExperimentLedger = z.infer<typeof ExperimentLedgerSchema>;

export const ReconstructionSchema = z.object({
  matchId: z.string(),
  status: z.enum(["active", "victory", "defeat"]),
  actionCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  commanderEnergySpent: z.number().int().nonnegative(),
  objectiveProgress: z.number().int().nonnegative(),
  artifactsBuilt: z.array(z.string()),
  eventTypes: z.record(z.number().int().nonnegative()),
  highGroundSequence: z.number().int().nonnegative().nullable(),
  counterfactual: z.object({ action: z.string(), claim: z.string() })
});
export type Reconstruction = z.infer<typeof ReconstructionSchema>;

export const PlaytestObservationSchema = z.object({
  matchId: z.string().optional(),
  sessionId: z.string().min(1),
  eventType: z.string().min(1),
  occurredAt: z.string(),
  data: z.record(z.unknown()).default({})
});
export type PlaytestObservation = z.infer<typeof PlaytestObservationSchema>;

export const GameplayLabSourceSchema = z.object({
  campaignId: z.string().min(1),
  matrixIds: z.array(z.string().min(1)).min(1),
  reportPaths: z.array(z.string().min(1)).min(1),
  finding: z.string().min(1)
});
export type GameplayLabSource = z.infer<typeof GameplayLabSourceSchema>;

export const GameplayLabDoctrineStepSchema = z.object({
  unitId: z.string().min(1),
  action: ActionSchema,
  fireMode: FireModeSchema.default("semi"),
  rationale: z.string().optional()
});
export type GameplayLabDoctrineStep = z.infer<typeof GameplayLabDoctrineStepSchema>;

export const GameplayLabDoctrineCardSchema = z.object({
  policyId: z.string().min(1),
  prompt: z.string().min(1),
  category: z.enum(["dead", "viable", "dominant", "lesson", "naive"]),
  steps: z.array(GameplayLabDoctrineStepSchema).min(1)
});
export type GameplayLabDoctrineCard = z.infer<typeof GameplayLabDoctrineCardSchema>;

export const GameplayLabVariantSchema = z.object({
  variantId: z.string().min(1),
  labelForReview: z.string().min(1),
  rulesTuning: RulesTuningSchema.partial().default({}),
  seedOffset: z.number().int().default(0),
  designerNotes: z.string().min(1),
  doctrineCard: GameplayLabDoctrineCardSchema.optional()
});
export type GameplayLabVariant = z.infer<typeof GameplayLabVariantSchema>;

export const GameplayLabAcceptanceSchema = z.object({
  mechanicRelevant: z.string().min(1),
  lessonLegible: z.string().min(1),
  agencyPresent: z.string().min(1),
  syntheticDirectionConfirmed: z.string().min(1)
});
export type GameplayLabAcceptance = z.infer<typeof GameplayLabAcceptanceSchema>;

export const GameplayLabDefinitionSchema = z.object({
  labId: z.string().regex(/^GL-\d{3}$/),
  version: z.number().int().positive(),
  title: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  source: GameplayLabSourceSchema,
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  hypothesis: z.string().min(1),
  falsifier: z.string().min(1),
  variants: z.array(GameplayLabVariantSchema).min(2),
  trialOrder: z.enum(["randomized", "counterbalanced"]),
  preBrief: z.string().min(1),
  reviewQuestions: z.array(z.string().min(1)).min(1),
  acceptance: GameplayLabAcceptanceSchema
});
export type GameplayLabDefinition = z.infer<typeof GameplayLabDefinitionSchema>;

export const GameplayLabSummarySchema = z.object({
  labId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  estimatedMinutes: z.number().int().positive(),
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  missionObjective: z.string(),
  preBrief: z.string(),
  trialCount: z.number().int().positive()
});
export type GameplayLabSummary = z.infer<typeof GameplayLabSummarySchema>;

export const GameplayLabPreReviewSchema = z.object({
  bindingConstraint: z.string().min(1),
  decisiveDecision: z.string().min(1),
  replayChange: z.string().min(1),
  earnedRating: z.number().int().min(1).max(5),
  confidenceRating: z.number().int().min(1).max(5),
  doctrineFollowed: z.boolean().optional(),
  doctrineClassification: z.enum([
    "illegal",
    "incoherent",
    "under-resourced",
    "misleading",
    "brittle",
    "plausible",
    "dominant"
  ]).optional(),
  doctrineDecisionRationale: z.string().min(1).optional()
});
export type GameplayLabPreReview = z.infer<typeof GameplayLabPreReviewSchema>;

export const GameplayLabPostReviewSchema = z.object({
  explanationChanged: z.boolean(),
  updatedExplanation: z.string().min(1),
  missingOrMisleading: z.string().min(1)
});
export type GameplayLabPostReview = z.infer<typeof GameplayLabPostReviewSchema>;

export const GameplayLabFinalReviewSchema = z.object({
  clearestTrialToken: z.string().min(1),
  fairestTrialToken: z.string().min(1),
  mostInterestingTrialToken: z.string().min(1),
  comparisonNotes: z.string().min(1),
  disposition: z.enum(["keep", "revise", "reject", "needs-mechanic", "needs-instrumentation"]),
  dispositionRationale: z.string().min(1)
});
export type GameplayLabFinalReview = z.infer<typeof GameplayLabFinalReviewSchema>;

export const GameplayLabReviewRequestSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("pre"), trialId: z.string().min(1), answers: GameplayLabPreReviewSchema }),
  z.object({ phase: z.literal("post"), trialId: z.string().min(1), answers: GameplayLabPostReviewSchema }),
  z.object({ phase: z.literal("final"), answers: GameplayLabFinalReviewSchema })
]);
export type GameplayLabReviewRequest = z.infer<typeof GameplayLabReviewRequestSchema>;

export const GameplayLabBookmarkSchema = z.object({
  note: z.string().min(1).max(500),
  occurredAt: z.string()
});
export type GameplayLabBookmark = z.infer<typeof GameplayLabBookmarkSchema>;

export const GameplayLabTrialSchema = z.object({
  trialId: z.string().min(1),
  variantId: z.string().min(1),
  variantToken: z.string().min(1),
  matchId: z.string().min(1),
  status: z.enum(["pending", "active", "awaiting_pre_review", "reconstruction_available", "complete"]),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  bookmarks: z.array(GameplayLabBookmarkSchema).default([]),
  preReview: GameplayLabPreReviewSchema.optional(),
  postReview: GameplayLabPostReviewSchema.optional()
});
export type GameplayLabTrial = z.infer<typeof GameplayLabTrialSchema>;

export const GameplayLabSessionSchema = z.object({
  labSessionId: z.string().min(1),
  labId: z.string().min(1),
  labVersion: z.number().int().positive(),
  participantId: z.string().min(1),
  status: z.enum(["active", "awaiting_final_review", "complete"]),
  currentTrialIndex: z.number().int().nonnegative(),
  trials: z.array(GameplayLabTrialSchema).min(1),
  finalReview: GameplayLabFinalReviewSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type GameplayLabSession = z.infer<typeof GameplayLabSessionSchema>;

export const GameplayLabTrialViewSchema = GameplayLabTrialSchema.omit({
  variantId: true,
  preReview: true,
  postReview: true
}).extend({
  doctrineCard: GameplayLabDoctrineCardSchema.omit({ category: true, policyId: true }).optional()
});
export type GameplayLabTrialView = z.infer<typeof GameplayLabTrialViewSchema>;

export const GameplayLabSessionViewSchema = z.object({
  labSessionId: z.string(),
  labId: z.string(),
  labVersion: z.number().int().positive(),
  title: z.string(),
  status: z.enum(["active", "awaiting_final_review", "complete"]),
  currentTrialIndex: z.number().int().nonnegative(),
  trialCount: z.number().int().positive(),
  currentTrial: GameplayLabTrialViewSchema.nullable(),
  completedTrialTokens: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  revealedVariants: z.array(z.object({
    variantToken: z.string(),
    variantId: z.string(),
    labelForReview: z.string()
  })).optional()
});
export type GameplayLabSessionView = z.infer<typeof GameplayLabSessionViewSchema>;

export const ChallengeSchema = z.object({
  challengeId: z.string(),
  matchId: z.string(),
  scenarioId: z.string(),
  creatorId: z.string(),
  opponentId: z.string().nullable(),
  status: z.enum(["open", "accepted", "expired", "complete"]),
  createdAt: z.string(),
  expiresAt: z.string()
});
export type Challenge = z.infer<typeof ChallengeSchema>;

export type MatchProjection = MatchState & {
  visibleEnemyUnits: UnitState[];
  fireControl: {
    fireRate: number;
    dispersion: number;
    commanderLoad: number;
    heat: number;
    confidenceDrift: number;
    missionProgress: number;
    recommendation: string;
  };
};

// Attention-economy command model. This is deliberately separate from the
// legacy seven-action contracts above so archived simulations keep their shape.
export const AttentionModelVersionSchema = z.literal("duel-capacity-v1");
export type AttentionModelVersion = z.infer<typeof AttentionModelVersionSchema>;

export const AttentionChassisSchema = z.enum(["scout", "line", "siege"]);
export type AttentionChassis = z.infer<typeof AttentionChassisSchema>;

export const AttentionCoordinateSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative()
}).strict();
export type AttentionCoordinate = z.infer<typeof AttentionCoordinateSchema>;

export const AttentionPhaseSchema = z.enum(["movement", "capacity", "command", "resolution", "terminal"]);
export type AttentionPhase = z.infer<typeof AttentionPhaseSchema>;

export const AttentionChassisProfileSchema = z.object({
  throughput: z.number().int().positive(),
  seizeCost: z.number().int().nonnegative(),
  calibration: z.number().min(0).max(1),
  movementRange: z.number().int().nonnegative()
}).strict();
export type AttentionChassisProfile = z.infer<typeof AttentionChassisProfileSchema>;

export const AttentionCapacitySlotSchema = z.object({
  rank: z.number().int().positive(),
  cost: z.number().int().nonnegative(),
  capacityAward: z.number().int().nonnegative()
}).strict();
export type AttentionCapacitySlot = z.infer<typeof AttentionCapacitySlotSchema>;

export const AttentionModelDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  modelVersion: AttentionModelVersionSchema,
  rules: z.object({
    attentionPerRound: z.number().int().nonnegative(),
    verifyCost: z.number().int().nonnegative(),
    objectiveTarget: z.number().int().positive(),
    driftLimit: z.number().int().positive(),
    soundnessRate: z.number().min(0).max(1),
    requireObjectiveRange: z.boolean()
  }).strict(),
  chassis: z.object({
    scout: AttentionChassisProfileSchema,
    line: AttentionChassisProfileSchema,
    siege: AttentionChassisProfileSchema
  }).strict(),
  stationary: z.object({
    reconLock: z.object({
      calibration: z.number().min(0).max(1),
      delayRounds: z.number().int().positive()
    }).strict(),
    targetLock: z.object({
      tokensPerStationaryRound: z.number().int().nonnegative(),
      streakThreshold: z.number().int().positive(),
      thresholdRoundTokens: z.number().int().nonnegative(),
      tokenCap: z.number().int().nonnegative(),
      range: z.number().int().nonnegative()
    }).strict(),
    commandUplink: z.object({
      attentionBonus: z.number().int().nonnegative(),
      calibration: z.number().min(0).max(1),
      delayRounds: z.number().int().positive(),
      stackLimit: z.number().int().nonnegative()
    }).strict()
  }).strict(),
  capacity: z.object({
    slots: z.array(AttentionCapacitySlotSchema).min(1),
    followerStartsAtSlot: z.literal(2),
    perfectFocus: z.object({
      unlockRank: z.number().int().positive(),
      cooldownRounds: z.number().int().positive(),
      maxUses: z.number().int().nonnegative()
    }).strict(),
    overclock: z.object({
      unlockRank: z.number().int().positive(),
      seizeDiscount: z.number().int().nonnegative(),
      durationRounds: z.number().int().positive(),
      maxUses: z.number().int().min(0).max(1)
    }).strict(),
    macroFlare: z.object({
      unlockRank: z.number().int().positive(),
      range: z.number().int().nonnegative(),
      // duel-capacity-v1 defines one fixed 3x3 footprint. Keeping this literal
      // prevents policy visibility and engine resolution from disagreeing.
      width: z.literal(3),
      height: z.literal(3),
      durationEmissions: z.number().int().positive(),
      outputMultiplier: z.number().int().positive(),
      maxUses: z.number().int().min(0).max(1)
    }).strict()
  }).strict()
}).strict().superRefine((model, context) => {
  for (const [index, slot] of model.capacity.slots.entries()) {
    if (slot.rank !== index + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capacity", "slots", index, "rank"],
        message: "Capacity slot ranks must be sequential and one-based"
      });
    }
  }
});
export type AttentionModelDefinition = z.infer<typeof AttentionModelDefinitionSchema>;

export const AttentionPlayerSlotSchema = z.union([z.literal(1), z.literal(2)]);
export type AttentionPlayerSlot = z.infer<typeof AttentionPlayerSlotSchema>;

export const AttentionFrontScheduleEntrySchema = z.object({
  round: z.number().int().nonnegative(),
  playerSlot: AttentionPlayerSlotSchema,
  center: AttentionCoordinateSchema,
  radius: z.number().int().nonnegative()
}).strict();
export type AttentionFrontScheduleEntry = z.infer<typeof AttentionFrontScheduleEntrySchema>;

export const AttentionSpawnSchema = z.object({
  playerSlot: AttentionPlayerSlotSchema,
  unitIndex: z.number().int().nonnegative(),
  position: AttentionCoordinateSchema
}).strict();
export type AttentionSpawn = z.infer<typeof AttentionSpawnSchema>;

export const AttentionScenarioSchema = z.object({
  schemaVersion: z.literal(1),
  scenarioId: z.string().min(1),
  version: z.number().int().positive(),
  board: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    distanceMetric: z.literal("chebyshev"),
    exclusiveOccupancy: z.boolean()
  }).strict(),
  roundLimit: z.number().int().positive(),
  initialCapacitySlot: z.number().int().nonnegative().optional(),
  playerOrder: z.tuple([AttentionPlayerSlotSchema, AttentionPlayerSlotSchema]),
  frontSchedule: z.array(AttentionFrontScheduleEntrySchema).min(2),
  spawns: z.array(AttentionSpawnSchema).min(2)
}).strict().superRefine((scenario, context) => {
  if (scenario.playerOrder[0] === scenario.playerOrder[1]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["playerOrder"], message: "Player order must contain both player slots" });
  }
  for (const [field, entries] of [["frontSchedule", scenario.frontSchedule], ["spawns", scenario.spawns]] as const) {
    for (let index = 0; index < entries.length; index += 1) {
      const point = field === "frontSchedule" ? scenario.frontSchedule[index].center : scenario.spawns[index].position;
      if (point.x >= scenario.board.width || point.y >= scenario.board.height) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field, index], message: "Coordinate must be inside the board" });
      }
    }
  }
});
export type AttentionScenario = z.infer<typeof AttentionScenarioSchema>;

export const AttentionCompositionSchema = z.object({
  schemaVersion: z.literal(1),
  compositionId: z.string().min(1),
  label: z.string().min(1).optional(),
  units: z.array(z.object({
    unitKey: z.string().min(1),
    chassis: AttentionChassisSchema
  }).strict()).min(1)
}).strict().superRefine((composition, context) => {
  const keys = composition.units.map((unit) => unit.unitKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: "Composition unit keys must be unique" });
  }
});
export type AttentionComposition = z.infer<typeof AttentionCompositionSchema>;

export const AttentionModelVariantSchema = z.object({
  variantId: z.string().min(1),
  label: z.string().min(1).optional(),
  factorLevels: z.record(z.union([z.string(), z.number().finite(), z.boolean()])),
  model: AttentionModelDefinitionSchema,
  scenarioOverrides: z.object({
    frontRadius: z.number().int().nonnegative().optional()
  }).strict().optional()
}).strict();
export type AttentionModelVariant = z.infer<typeof AttentionModelVariantSchema>;

export const AttentionMovementIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), playerId: z.string().min(1), unitId: z.string().min(1), destination: AttentionCoordinateSchema }).strict(),
  z.object({ kind: z.literal("end-movement"), playerId: z.string().min(1) }).strict()
]);
export type AttentionMovementIntent = z.infer<typeof AttentionMovementIntentSchema>;

export const AttentionCapacityIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("claim-capacity"), playerId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("pass-capacity"), playerId: z.string().min(1) }).strict()
]);
export type AttentionCapacityIntent = z.infer<typeof AttentionCapacityIntentSchema>;

export const AttentionCommandIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("verify"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("accept"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("reject"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("seize"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("target-lock"), playerId: z.string().min(1), sourceUnitId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("perfect-focus"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("overclock"), playerId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("macro-flare"), playerId: z.string().min(1), center: AttentionCoordinateSchema }).strict(),
  z.object({ kind: z.literal("end-command"), playerId: z.string().min(1) }).strict()
]);
export type AttentionCommandIntent = z.infer<typeof AttentionCommandIntentSchema>;

export const AttentionIntentSchema = z.union([
  AttentionMovementIntentSchema,
  AttentionCapacityIntentSchema,
  AttentionCommandIntentSchema
]);
export type AttentionIntent = z.infer<typeof AttentionIntentSchema>;

export const AttentionPolicyPredicateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always") }).strict(),
  z.object({ kind: z.literal("attention-at-least"), value: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("revealed-unsound") }).strict(),
  z.object({ kind: z.literal("revealed-sound") }).strict(),
  z.object({ kind: z.literal("confidence-below"), value: z.number().min(0).max(1) }).strict(),
  z.object({ kind: z.literal("confidence-above"), value: z.number().min(0).max(1) }).strict(),
  z.object({ kind: z.literal("target-lock-available") }).strict(),
  z.object({ kind: z.literal("ability-ready"), ability: z.enum(["perfect-focus", "overclock", "macro-flare"]) }).strict(),
  z.object({ kind: z.literal("unresolved-at-least"), value: z.number().int().positive() }).strict()
]);
export type AttentionPolicyPredicate = z.infer<typeof AttentionPolicyPredicateSchema>;

export const AttentionPolicyTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lowest-confidence") }).strict(),
  z.object({ kind: z.literal("highest-confidence") }).strict(),
  z.object({ kind: z.literal("cheapest-seize") }).strict(),
  z.object({ kind: z.literal("revealed-unsound") }).strict(),
  z.object({ kind: z.literal("revealed-sound") }).strict(),
  z.object({ kind: z.literal("chassis-lowest-confidence"), chassis: AttentionChassisSchema }).strict(),
  z.object({ kind: z.literal("own-front") }).strict(),
  z.object({ kind: z.literal("enemy-front") }).strict(),
  z.object({ kind: z.literal("own-densest") }).strict(),
  z.object({ kind: z.literal("enemy-densest") }).strict()
]);
export type AttentionPolicyTarget = z.infer<typeof AttentionPolicyTargetSchema>;

export const AttentionPolicyActionSchema = z.object({
  kind: z.enum(["verify", "accept", "reject", "seize", "target-lock", "perfect-focus", "overclock", "macro-flare", "end-command"])
}).strict();
export type AttentionPolicyAction = z.infer<typeof AttentionPolicyActionSchema>;

export const AttentionPolicyProgramSchema = z.object({
  schemaVersion: z.literal(1),
  policyId: z.string().min(1),
  label: z.string().min(1).optional(),
  movementRules: z.array(z.object({
    chassis: AttentionChassisSchema.optional(),
    unitKey: z.string().min(1).optional(),
    strategy: z.enum(["hold", "hold-in-own-front", "approach-own-front", "approach-enemy-front", "escort", "evade-flare"]),
    targetChassis: AttentionChassisSchema.optional()
  }).strict()).default([]),
  movementFallback: z.enum(["hold", "hold-in-own-front", "approach-own-front", "approach-enemy-front", "evade-flare"]).default("hold"),
  capacityStrategy: z.enum(["never", "pioneer", "follower"]),
  commandRules: z.array(z.object({
    when: z.array(AttentionPolicyPredicateSchema).min(1),
    action: AttentionPolicyActionSchema,
    target: AttentionPolicyTargetSchema.optional()
  }).strict()).default([]),
  maxCommandActions: z.number().int().positive().max(64).default(64)
}).strict();
export type AttentionPolicyProgram = z.infer<typeof AttentionPolicyProgramSchema>;

export const AttentionPlayerStatusSchema = z.enum(["active", "victory", "defeat", "draw"]);
export type AttentionPlayerStatus = z.infer<typeof AttentionPlayerStatusSchema>;

export const AttentionPlayerStateSchema = z.object({
  playerId: z.string().min(1),
  attention: z.number().int().nonnegative(),
  baseAttention: z.number().int().nonnegative(),
  capacityBonus: z.number().int().nonnegative(),
  queuedUplinkBonus: z.number().int().nonnegative(),
  progress: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
  status: AttentionPlayerStatusSchema,
  targetLocks: z.number().int().nonnegative(),
  claimCount: z.number().int().nonnegative(),
  claimAttempted: z.boolean(),
  focusNextReadyRound: z.number().int().nonnegative(),
  focusUses: z.number().int().nonnegative(),
  overclockUsed: z.boolean(),
  overclockActive: z.boolean(),
  flareUsed: z.boolean()
}).strict();
export type AttentionPlayerState = z.infer<typeof AttentionPlayerStateSchema>;

export const AttentionUnitStateSchema = z.object({
  unitId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  chassis: AttentionChassisSchema,
  position: AttentionCoordinateSchema,
  movementSpent: z.number().int().nonnegative(),
  stationaryStreak: z.number().int().nonnegative(),
  emissionCalibration: z.number().min(0).max(1),
  nextEmissionCalibration: z.number().min(0).max(1).nullable()
}).strict();
export type AttentionUnitState = z.infer<typeof AttentionUnitStateSchema>;

export const AttentionArtifactResolutionSchema = z.enum(["pending", "accepted", "rejected", "seized"]);
export type AttentionArtifactResolution = z.infer<typeof AttentionArtifactResolutionSchema>;

export const AttentionArtifactGuaranteeSchema = z.enum(["target-lock", "perfect-focus"]);
export type AttentionArtifactGuarantee = z.infer<typeof AttentionArtifactGuaranteeSchema>;

export const AttentionArtifactStateSchema = z.object({
  artifactId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  sourceUnitId: z.string().min(1),
  position: AttentionCoordinateSchema,
  sound: z.boolean(),
  reportedConfidence: z.number().min(0).max(1),
  revealed: z.boolean(),
  objectiveEligible: z.boolean(),
  guarantee: AttentionArtifactGuaranteeSchema.nullable(),
  guaranteedById: z.string().min(1).nullable(),
  resolution: AttentionArtifactResolutionSchema
}).strict();
export type AttentionArtifactState = z.infer<typeof AttentionArtifactStateSchema>;

export const AttentionProjectedArtifactSchema = AttentionArtifactStateSchema.omit({ sound: true }).extend({
  revealedSound: z.boolean().nullable()
}).strict();
export type AttentionProjectedArtifact = z.infer<typeof AttentionProjectedArtifactSchema>;

export const AttentionFlareStateSchema = z.object({
  flareId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  center: AttentionCoordinateSchema,
  emissionsRemaining: z.number().int().positive()
}).strict();
export type AttentionFlareState = z.infer<typeof AttentionFlareStateSchema>;

export const AttentionCapacityClaimSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  playerId: z.string().min(1),
  round: z.number().int().nonnegative(),
  attentionPaid: z.number().int().nonnegative(),
  capacityAward: z.number().int().nonnegative()
}).strict();
export type AttentionCapacityClaim = z.infer<typeof AttentionCapacityClaimSchema>;

export const AttentionCapacityTrackStateSchema = z.object({
  nextSlot: z.number().int().nonnegative(),
  claims: z.array(AttentionCapacityClaimSchema)
}).strict();
export type AttentionCapacityTrackState = z.infer<typeof AttentionCapacityTrackStateSchema>;

export const AttentionTerminalReasonSchema = z.enum(["objective", "drift", "round-limit", "simultaneous", "forfeit"]);
export type AttentionTerminalReason = z.infer<typeof AttentionTerminalReasonSchema>;

const AttentionMatchStateFields = {
  schemaVersion: z.literal(1),
  modelVersion: AttentionModelVersionSchema,
  matchId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  seed: z.number().int(),
  randomStreamId: z.string().min(1),
  round: z.number().int().nonnegative(),
  phase: AttentionPhaseSchema,
  status: z.enum(["active", "complete"]),
  winnerPlayerId: z.string().min(1).nullable(),
  terminalReason: AttentionTerminalReasonSchema.nullable(),
  eventSequence: z.number().int().nonnegative(),
  players: z.tuple([AttentionPlayerStateSchema, AttentionPlayerStateSchema]),
  units: z.array(AttentionUnitStateSchema).min(2),
  artifacts: z.array(AttentionArtifactStateSchema),
  flares: z.array(AttentionFlareStateSchema),
  capacityTrack: AttentionCapacityTrackStateSchema
};

export const AttentionMatchStateSchema = z.object(AttentionMatchStateFields).strict().superRefine((state, context) => {
  const playerIds = state.players.map((player) => player.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["players"], message: "Player ids must be unique" });
  }
  const unitIds = new Set(state.units.map((unit) => unit.unitId));
  if (unitIds.size !== state.units.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: "Unit ids must be unique" });
  }
  for (const [index, unit] of state.units.entries()) {
    if (!playerIds.includes(unit.ownerPlayerId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "ownerPlayerId"], message: "Unknown player" });
  }
  for (const [index, artifact] of state.artifacts.entries()) {
    if (!playerIds.includes(artifact.ownerPlayerId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "ownerPlayerId"], message: "Unknown player" });
    if (!unitIds.has(artifact.sourceUnitId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "sourceUnitId"], message: "Unknown source unit" });
  }
  if (state.winnerPlayerId !== null && !playerIds.includes(state.winnerPlayerId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["winnerPlayerId"], message: "Winner must reference a player" });
  }
  if ((state.phase === "terminal") !== (state.status === "complete")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["phase"], message: "Terminal phase and complete status must agree" });
  }
});
export type AttentionMatchState = z.infer<typeof AttentionMatchStateSchema>;

export const AttentionActiveFrontSchema = z.object({
  playerId: z.string().min(1),
  center: AttentionCoordinateSchema,
  radius: z.number().int().nonnegative()
}).strict();
export type AttentionActiveFront = z.infer<typeof AttentionActiveFrontSchema>;

const {
  seed: _hiddenAttentionSeed,
  randomStreamId: _hiddenAttentionRandomStreamId,
  artifacts: _hiddenAttentionArtifacts,
  ...AttentionProjectionStateFields
} = AttentionMatchStateFields;

export const AttentionMatchProjectionSchema = z.object({
  ...AttentionProjectionStateFields,
  viewerPlayerId: z.string().min(1),
  artifacts: z.array(AttentionProjectedArtifactSchema),
  activeFronts: z.array(AttentionActiveFrontSchema)
}).strict();
export type AttentionMatchProjection = z.infer<typeof AttentionMatchProjectionSchema>;

export const AttentionProjectionSchema = AttentionMatchProjectionSchema;
export type AttentionProjection = AttentionMatchProjection;

export const AttentionTraceModeSchema = z.enum(["summary", "hash", "full"]);
export type AttentionTraceMode = z.infer<typeof AttentionTraceModeSchema>;

export const AttentionCampaignKindSchema = z.enum(["stationary-train", "capacity-train", "holdout", "custom"]);
export type AttentionCampaignKind = z.infer<typeof AttentionCampaignKindSchema>;

export const AttentionMatrixMatchupSchema = z.object({
  matchupId: z.string().min(1),
  scenarioId: z.string().min(1),
  playerOneCompositionId: z.string().min(1),
  playerTwoCompositionId: z.string().min(1),
  variantIds: z.array(z.string().min(1)).min(1),
  playerOnePolicyIds: z.array(z.string().min(1)).min(1),
  playerTwoPolicyIds: z.array(z.string().min(1)).min(1)
}).strict();
export type AttentionMatrixMatchup = z.infer<typeof AttentionMatrixMatchupSchema>;

const AttentionMatrixFields = {
  schemaVersion: z.literal(1),
  matrixId: z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  matrixKind: z.literal("attention-command"),
  modelVersion: AttentionModelVersionSchema,
  campaignKind: AttentionCampaignKindSchema,
  model: AttentionModelDefinitionSchema,
  scenarios: z.array(AttentionScenarioSchema).min(1),
  compositions: z.array(AttentionCompositionSchema).min(1),
  variants: z.array(AttentionModelVariantSchema).min(1),
  policies: z.array(AttentionPolicyProgramSchema).min(1),
  matchups: z.array(AttentionMatrixMatchupSchema).min(1),
  seedStart: z.number().int(),
  seedsPerCell: z.number().int().positive(),
  shardCount: z.number().int().positive(),
  traceMode: AttentionTraceModeSchema,
  createdAt: z.string().min(1)
};

const AttentionMatrixDraftBaseSchema = z.object(AttentionMatrixFields).strict();
type AttentionMatrixReferenceInput = z.infer<typeof AttentionMatrixDraftBaseSchema>;

function validateAttentionMatrixReferences(matrix: AttentionMatrixReferenceInput, context: z.RefinementCtx): void {
  const catalogs = [
    ["scenarios", matrix.scenarios.map((item) => item.scenarioId)],
    ["compositions", matrix.compositions.map((item) => item.compositionId)],
    ["variants", matrix.variants.map((item) => item.variantId)],
    ["policies", matrix.policies.map((item) => item.policyId)],
    ["matchups", matrix.matchups.map((item) => item.matchupId)]
  ] as const;
  for (const [path, ids] of catalogs) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: `${path} ids must be unique` });
    }
  }
  const scenarioIds = new Set(matrix.scenarios.map((item) => item.scenarioId));
  const compositionIds = new Set(matrix.compositions.map((item) => item.compositionId));
  const variantIds = new Set(matrix.variants.map((item) => item.variantId));
  const policyIds = new Set(matrix.policies.map((item) => item.policyId));
  for (const [index, matchup] of matrix.matchups.entries()) {
    if (!scenarioIds.has(matchup.scenarioId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchups", index, "scenarioId"], message: "Unknown scenario" });
    for (const [field, id] of [["playerOneCompositionId", matchup.playerOneCompositionId], ["playerTwoCompositionId", matchup.playerTwoCompositionId]] as const) {
      if (!compositionIds.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchups", index, field], message: "Unknown composition" });
    }
    for (const [field, ids, catalog] of [
      ["variantIds", matchup.variantIds, variantIds],
      ["playerOnePolicyIds", matchup.playerOnePolicyIds, policyIds],
      ["playerTwoPolicyIds", matchup.playerTwoPolicyIds, policyIds]
    ] as const) {
      if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchups", index, field], message: "References must be unique" });
      if (ids.some((id) => !catalog.has(id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchups", index, field], message: "Unknown reference" });
    }
  }
}

export const AttentionMatrixDraftSchema = AttentionMatrixDraftBaseSchema.superRefine(validateAttentionMatrixReferences);
export type AttentionMatrixDraft = z.infer<typeof AttentionMatrixDraftSchema>;

const AttentionMatrixManifestBaseSchema = z.object({
  ...AttentionMatrixFields,
  provenance: BuildProvenanceSchema
}).strict();

export const AttentionMatrixManifestSchema = AttentionMatrixManifestBaseSchema.superRefine((matrix, context) => {
  validateAttentionMatrixReferences(matrix, context);
  if (matrix.provenance.commandModelVersion !== matrix.modelVersion) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance", "commandModelVersion"], message: "Provenance model version must match the manifest" });
  }
});
export type AttentionMatrixManifest = z.infer<typeof AttentionMatrixManifestSchema>;

export const AttentionSimulationCountersSchema = z.object({
  attentionAvailable: z.number().int().nonnegative(),
  attentionSpent: z.number().int().nonnegative(),
  attentionUnused: z.number().int().nonnegative(),
  attentionBindingRounds: z.number().int().nonnegative(),
  artifactsEmitted: z.number().int().nonnegative(),
  minimumAttentionToArtifactRatio: z.number().finite().nonnegative(),
  verified: z.number().int().nonnegative(),
  acceptedSound: z.number().int().nonnegative(),
  acceptedUnsound: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  seized: z.number().int().nonnegative(),
  assisted: z.number().int().nonnegative(),
  movementDistance: z.number().int().nonnegative(),
  stationaryTurns: z.number().int().nonnegative(),
  reconLockActivations: z.number().int().nonnegative(),
  targetLocksGenerated: z.number().int().nonnegative(),
  targetLocksConsumed: z.number().int().nonnegative(),
  uplinkAttentionGenerated: z.number().int().nonnegative(),
  capacityAttentionSpent: z.number().int().nonnegative(),
  capacityClaims: z.number().int().nonnegative(),
  perfectFocusUses: z.number().int().nonnegative(),
  overclockUses: z.number().int().nonnegative(),
  macroFlareUses: z.number().int().nonnegative(),
  flareAffectedArtifacts: z.number().int().nonnegative(),
  driftDefeatsInduced: z.number().int().nonnegative()
}).strict();
export type AttentionSimulationCounters = z.infer<typeof AttentionSimulationCountersSchema>;

export const AttentionSimulationPlayerOutcomeSchema = z.object({
  playerSlot: AttentionPlayerSlotSchema,
  status: AttentionPlayerStatusSchema,
  progress: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
  driftPer12Progress: z.number().nonnegative(),
  attentionToArtifactRatio: z.number().nonnegative(),
  counters: AttentionSimulationCountersSchema
}).strict();
export type AttentionSimulationPlayerOutcome = z.infer<typeof AttentionSimulationPlayerOutcomeSchema>;

export const AttentionSimulationRunSchema = z.object({
  schemaVersion: z.literal(1),
  matrixKind: z.literal("attention-command"),
  modelVersion: AttentionModelVersionSchema,
  runId: z.string().min(1),
  matrixId: z.string().min(1),
  manifestHash: ContentDigestSchema,
  provenanceId: z.string().min(1),
  matchupId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  playerOneCompositionId: z.string().min(1),
  playerTwoCompositionId: z.string().min(1),
  variantId: z.string().min(1),
  playerOnePolicyId: z.string().min(1),
  playerTwoPolicyId: z.string().min(1),
  seed: z.number().int(),
  randomStreamId: z.string().min(1),
  traceMode: AttentionTraceModeSchema,
  status: z.literal("complete"),
  winnerPlayerSlot: AttentionPlayerSlotSchema.nullable(),
  terminalReason: AttentionTerminalReasonSchema,
  rounds: z.number().int().nonnegative(),
  players: z.tuple([AttentionSimulationPlayerOutcomeSchema, AttentionSimulationPlayerOutcomeSchema]),
  eventHash: ContentDigestSchema.nullable(),
  stateHash: ContentDigestSchema,
  outcomeHash: ContentDigestSchema
}).strict();
export type AttentionSimulationRun = z.infer<typeof AttentionSimulationRunSchema>;

export const AttentionShardCompletionSchema = z.object({
  schemaVersion: z.literal(1),
  matrixKind: z.literal("attention-command"),
  matrixId: z.string().min(1),
  shardIndex: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  manifestHash: ContentDigestSchema,
  provenanceId: z.string().min(1),
  shardHash: ContentDigestSchema
}).strict();
export type AttentionShardCompletion = z.infer<typeof AttentionShardCompletionSchema>;

export const AttentionAggregatePlayerMetricsSchema = z.object({
  playerSlot: AttentionPlayerSlotSchema,
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  winRate95: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  averageProgress: z.number().nonnegative(),
  averageDrift: z.number().nonnegative(),
  driftPer12Progress: z.number().nonnegative(),
  averageAttentionSpent: z.number().nonnegative(),
  averageAttentionToArtifactRatio: z.number().nonnegative(),
  averageMovementDistance: z.number().nonnegative(),
  averageStationaryTurns: z.number().nonnegative()
}).strict();
export type AttentionAggregatePlayerMetrics = z.infer<typeof AttentionAggregatePlayerMetricsSchema>;

export const AttentionAggregateCellSchema = z.object({
  matchupId: z.string().min(1),
  scenarioId: z.string().min(1),
  playerOneCompositionId: z.string().min(1),
  playerTwoCompositionId: z.string().min(1),
  variantId: z.string().min(1),
  playerOnePolicyId: z.string().min(1),
  playerTwoPolicyId: z.string().min(1),
  runs: z.number().int().positive(),
  draws: z.number().int().nonnegative(),
  averageRounds: z.number().nonnegative(),
  terminalReasons: z.record(z.number().int().nonnegative()),
  players: z.tuple([AttentionAggregatePlayerMetricsSchema, AttentionAggregatePlayerMetricsSchema])
}).strict();
export type AttentionAggregateCell = z.infer<typeof AttentionAggregateCellSchema>;

export const AttentionPairwiseComparisonSchema = z.object({
  comparisonId: z.string().min(1),
  matchupId: z.string().min(1),
  variantId: z.string().min(1),
  playerSlot: AttentionPlayerSlotSchema,
  leftPolicyId: z.string().min(1),
  rightPolicyId: z.string().min(1),
  pairedRuns: z.number().int().positive(),
  winRateDelta: z.number().min(-1).max(1),
  confidenceInterval95: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)])
}).strict();
export type AttentionPairwiseComparison = z.infer<typeof AttentionPairwiseComparisonSchema>;

export const AttentionInteractionEffectSchema = z.object({
  interactionId: z.string().min(1),
  metric: z.string().min(1),
  estimate: z.number().finite(),
  confidenceInterval95: z.tuple([z.number().finite(), z.number().finite()]),
  sampleSize: z.number().int().positive()
}).strict();
export type AttentionInteractionEffect = z.infer<typeof AttentionInteractionEffectSchema>;

export const AttentionAcceptanceGateSchema = z.object({
  gateId: z.string().min(1),
  kind: z.enum(["specialized-policy-advantage", "flare-drift-defeat-rate", "escort-drift-efficiency", "movement-value", "attention-binding", "no-universal-dominance"]),
  status: z.enum(["pass", "fail", "insufficient-data"]),
  threshold: z.number().finite(),
  observed: z.number().finite().nullable(),
  confidenceInterval95: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
  sampleSize: z.number().int().nonnegative(),
  details: z.record(z.unknown()).default({})
}).strict();
export type AttentionAcceptanceGate = z.infer<typeof AttentionAcceptanceGateSchema>;

export const AttentionAggregateReportSchema = z.object({
  schemaVersion: z.literal(1),
  matrixKind: z.literal("attention-command"),
  modelVersion: AttentionModelVersionSchema,
  matrixId: z.string().min(1),
  campaignKind: AttentionCampaignKindSchema,
  manifestHash: ContentDigestSchema,
  provenance: BuildProvenanceSchema,
  generatedAt: z.string().min(1),
  runs: z.number().int().nonnegative(),
  traceMode: AttentionTraceModeSchema,
  shards: z.array(AttentionShardCompletionSchema),
  cells: z.array(AttentionAggregateCellSchema),
  pairwise: z.array(AttentionPairwiseComparisonSchema),
  interactions: z.array(AttentionInteractionEffectSchema),
  gates: z.array(AttentionAcceptanceGateSchema),
  reportHash: ContentDigestSchema
}).strict();
export type AttentionAggregateReport = z.infer<typeof AttentionAggregateReportSchema>;
