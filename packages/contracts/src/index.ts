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

export const SimulationRunSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  matrixId: z.string(),
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

export const SimulationMatrixSchema = z.object({
  schemaVersion: z.literal(1),
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
});
export type SimulationMatrix = z.infer<typeof SimulationMatrixSchema>;

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
