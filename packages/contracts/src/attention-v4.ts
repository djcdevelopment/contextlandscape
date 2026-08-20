import { z } from "zod";
import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_TRIAGE_MODULES
} from "./attention-v2.js";

/**
 * Battle Command state/view schema v3. The public model id intentionally remains the v3
 * experimental id; the content-addressed ruleset and resolver identify this
 * incompatible rewrite.
 */
export const ATTENTION_V4_MODEL_VERSION = "duel-capacity-v3-experimental" as const;
export const ATTENTION_V4_RULESET_VERSION = "attention-economy-v4.2" as const;
export const ATTENTION_V4_RESOLVER_VERSION = "attention-v4.2-resolver-1" as const;
export const ATTENTION_V4_STATE_SCHEMA_VERSION = 3 as const;
export const ATTENTION_V4_VIEW_SCHEMA_VERSION = 3 as const;
export const ATTENTION_V4_COMMANDER_COMPILER_VERSION = "attention-v4.2-commander-compiler-1" as const;

export const ATTENTION_V4_FLEET_WEIGHT = 6 as const;
export const ATTENTION_V4_MAX_HEAVIES = 1 as const;
export const ATTENTION_V4_MAX_SCOUTS = 4 as const;
export const ATTENTION_V4_CHASSIS_WEIGHTS = { scout: 1, line: 2, heavy: 3 } as const;
export const ATTENTION_V4_COMPOSITION_MODULES = [
  "line-four-scout",
  "two-line-two-scout",
  "three-line",
  "heavy-three-scout",
  "heavy-line-scout"
] as const;
export const ATTENTION_V4_COMMANDER_PROFILE_COUNT = 3_200 as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const AttentionV4CoordinateSchema = z.object({
  x: z.number().int().min(0).max(9),
  y: z.number().int().min(0).max(9)
}).strict();
export type AttentionV4Coordinate = z.infer<typeof AttentionV4CoordinateSchema>;

export const AttentionV4ChassisSchema = z.enum(["scout", "line", "heavy"]);
export type AttentionV4Chassis = z.infer<typeof AttentionV4ChassisSchema>;

export function attentionV4FleetWeight(composition: readonly AttentionV4Chassis[]): number {
  return composition.reduce((total, chassis) => total + ATTENTION_V4_CHASSIS_WEIGHTS[chassis], 0);
}

export const AttentionV4FleetSchema = z.array(AttentionV4ChassisSchema).min(3).max(5).superRefine((composition, context) => {
  const weight = attentionV4FleetWeight(composition);
  if (weight !== ATTENTION_V4_FLEET_WEIGHT) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `fleet weight must equal ${ATTENTION_V4_FLEET_WEIGHT}, received ${weight}` });
  }
  const heavyCount = composition.filter((chassis) => chassis === "heavy").length;
  if (heavyCount > ATTENTION_V4_MAX_HEAVIES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `fleet may contain at most ${ATTENTION_V4_MAX_HEAVIES} Heavy, received ${heavyCount}` });
  }
  const scoutCount = composition.filter((chassis) => chassis === "scout").length;
  if (scoutCount > ATTENTION_V4_MAX_SCOUTS) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `fleet may contain at most ${ATTENTION_V4_MAX_SCOUTS} Scouts, received ${scoutCount}` });
  }
});
export type AttentionV4Fleet = z.infer<typeof AttentionV4FleetSchema>;

export const AttentionV4PhaseSchema = z.enum(["kinetic", "artillery", "capacity", "command", "terminal"]);
export type AttentionV4Phase = z.infer<typeof AttentionV4PhaseSchema>;

export const AttentionV4DensityPctSchema = z.number().int().min(20).max(100).refine(
  (value) => value % 5 === 0,
  "densityPct must be a multiple of five"
);
export type AttentionV4DensityPct = z.infer<typeof AttentionV4DensityPctSchema>;

export const AttentionV4ShellSchema = z.enum(["flare", "smoke", "emp", "he", "chaff"]);
export type AttentionV4Shell = z.infer<typeof AttentionV4ShellSchema>;

export const AttentionV4KineticActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), destination: AttentionV4CoordinateSchema }).strict(),
  z.object({ kind: z.literal("condense-output") }).strict(),
  z.object({ kind: z.literal("step-up") }).strict(),
  z.object({ kind: z.literal("command-uplink") }).strict(),
  z.object({ kind: z.literal("range-shift"), delta: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({ kind: z.literal("support-scan"), scoutUnitId: z.string().min(1) }).strict()
]);
export type AttentionV4KineticAction = z.infer<typeof AttentionV4KineticActionSchema>;

export const AttentionV4KineticPlanSchema = z.object({
  playerId: z.string().min(1),
  unitId: z.string().min(1),
  actions: z.array(AttentionV4KineticActionSchema).max(4)
}).strict();
export type AttentionV4KineticPlan = z.infer<typeof AttentionV4KineticPlanSchema>;

export const AttentionV4ArtilleryIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fire"),
    playerId: z.string().min(1),
    cardId: z.string().min(1),
    center: AttentionV4CoordinateSchema
  }).strict(),
  z.object({ kind: z.literal("pass"), playerId: z.string().min(1) }).strict()
]);
export type AttentionV4ArtilleryIntent = z.infer<typeof AttentionV4ArtilleryIntentSchema>;

export const AttentionV4CapacityIntentSchema = z.object({
  playerId: z.string().min(1),
  claim: z.boolean()
}).strict();
export type AttentionV4CapacityIntent = z.infer<typeof AttentionV4CapacityIntentSchema>;

export const AttentionV4CommandIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("emit"),
    playerId: z.string().min(1),
    unitId: z.string().min(1),
    volume: z.number().int().positive(),
    densityPct: AttentionV4DensityPctSchema
  }).strict(),
  z.object({ kind: z.literal("hold"), playerId: z.string().min(1), unitId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("verify"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("accept"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("reject"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("seize"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("perfect-focus"), playerId: z.string().min(1), artifactId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("overclock"), playerId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("end-command"), playerId: z.string().min(1) }).strict()
]);
export type AttentionV4CommandIntent = z.infer<typeof AttentionV4CommandIntentSchema>;

export const AttentionV4ShellCardSchema = z.object({
  cardId: z.string().min(1),
  shell: AttentionV4ShellSchema,
  drawnRound: z.number().int().positive(),
  drawOrdinal: z.number().int().nonnegative()
}).strict();
export type AttentionV4ShellCard = z.infer<typeof AttentionV4ShellCardSchema>;

export const AttentionV4PlayerStateSchema = z.object({
  playerId: z.string().min(1),
  attention: z.number().int().nonnegative(),
  baseAttention: z.literal(3),
  capacityBonus: z.number().int().nonnegative(),
  queuedUplinkBonus: z.number().int().min(0).max(1),
  progress: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
  status: z.enum(["active", "victory", "defeat", "draw"]),
  claimCount: z.number().int().nonnegative(),
  focusNextReadyRound: z.number().int().positive(),
  focusUses: z.number().int().nonnegative(),
  overclockUsed: z.boolean(),
  overclockActive: z.boolean(),
  endedCommand: z.boolean(),
  armory: z.object({
    cards: z.array(AttentionV4ShellCardSchema),
    cooldown: z.number().int().min(0).max(3),
    retaliationAvailable: z.boolean(),
    nextDrawOrdinal: z.number().int().nonnegative()
  }).strict()
}).strict();
export type AttentionV4PlayerState = z.infer<typeof AttentionV4PlayerStateSchema>;

export const AttentionV4FreezeSourceSchema = z.enum(["emp", "drift-detonation"]);
export type AttentionV4FreezeSource = z.infer<typeof AttentionV4FreezeSourceSchema>;

export const AttentionV4UnitStateSchema = z.object({
  unitId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  chassis: AttentionV4ChassisSchema,
  position: AttentionV4CoordinateSchema,
  activeRange: z.number().int().min(1).max(5),
  reactorRating: z.number().int().min(1).max(3),
  calibration: z.number().min(0.2).max(0.9),
  condenseSteps: z.number().int().min(0).max(2),
  rangeChanged: z.boolean(),
  forcedDisplaced: z.boolean(),
  outputDecision: z.enum(["pending", "emitted", "held"]),
  uplinkQueued: z.boolean(),
  uap: z.object({
    base: z.number().int().min(1).max(3),
    batteryBonus: z.number().int().min(0).max(1),
    effective: z.number().int().nonnegative().max(4),
    spent: z.number().int().nonnegative().max(4),
    frozen: z.boolean(),
    freezeSources: z.array(AttentionV4FreezeSourceSchema),
    nextFreezeSources: z.array(AttentionV4FreezeSourceSchema)
  }).strict(),
  lastPlan: z.array(AttentionV4KineticActionSchema).max(4)
}).strict();
export type AttentionV4UnitState = z.infer<typeof AttentionV4UnitStateSchema>;

export const AttentionV4ArtifactResolutionSchema = z.enum(["pending", "accepted", "rejected", "seized"]);
export type AttentionV4ArtifactResolution = z.infer<typeof AttentionV4ArtifactResolutionSchema>;

export const AttentionV4ArtifactStateSchema = z.object({
  artifactId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  sourceUnitId: z.string().min(1),
  sourceChassis: AttentionV4ChassisSchema,
  position: AttentionV4CoordinateSchema,
  volumeIndex: z.number().int().nonnegative(),
  densityPct: AttentionV4DensityPctSchema,
  sourceCalibration: z.number().min(0.2).max(0.9),
  effectiveCalibration: z.number().min(0).max(1),
  sound: z.boolean(),
  reportedConfidence: z.number().min(0).max(1),
  verified: z.boolean(),
  objectiveEligible: z.boolean(),
  guarantee: z.literal("perfect-focus").nullable(),
  guaranteedById: z.string().min(1).nullable(),
  resolution: AttentionV4ArtifactResolutionSchema,
  newbornRound: z.number().int().positive(),
  age: z.number().int().nonnegative(),
  contextLimit: z.number().int().min(1).max(3),
  localTraffic: z.number().int().nonnegative(),
  overTaxReasons: z.array(z.enum(["context-limit", "local-traffic"])),
  supportScanUnitIds: z.array(z.string().min(1)),
  battery: z.object({
    active: z.boolean(),
    activatedRound: z.number().int().positive().nullable(),
    suppressed: z.boolean()
  }).strict()
}).strict();
export type AttentionV4ArtifactState = z.infer<typeof AttentionV4ArtifactStateSchema>;

export const AttentionV4ProjectedArtifactSchema = AttentionV4ArtifactStateSchema.omit({ sound: true }).extend({
  revealedSound: z.boolean().nullable()
}).strict();
export type AttentionV4ProjectedArtifact = z.infer<typeof AttentionV4ProjectedArtifactSchema>;

const AttentionV4ZoneBase = {
  zoneId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  center: AttentionV4CoordinateSchema,
  createdRound: z.number().int().positive()
};
export const AttentionV4ZoneSchema = z.discriminatedUnion("kind", [
  z.object({ ...AttentionV4ZoneBase, kind: z.literal("chaff"), activeThroughArtilleryRound: z.number().int().positive() }).strict(),
  z.object({ ...AttentionV4ZoneBase, kind: z.literal("flare"), activeThroughCommandRound: z.number().int().positive() }).strict(),
  z.object({ ...AttentionV4ZoneBase, kind: z.literal("smoke"), activeThroughCommandRound: z.number().int().positive() }).strict()
]);
export type AttentionV4Zone = z.infer<typeof AttentionV4ZoneSchema>;

export const AttentionV4SupportReservationSchema = z.object({
  reservationId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  lineUnitId: z.string().min(1),
  scoutUnitId: z.string().min(1),
  createdRound: z.number().int().positive(),
  attachedArtifactId: z.string().min(1).nullable(),
  cancelled: z.boolean()
}).strict();
export type AttentionV4SupportReservation = z.infer<typeof AttentionV4SupportReservationSchema>;

export const AttentionV4TrafficCellSchema = z.object({
  coordinate: AttentionV4CoordinateSchema,
  actionCount: z.number().int().positive()
}).strict();
export type AttentionV4TrafficCell = z.infer<typeof AttentionV4TrafficCellSchema>;

export const AttentionV4CapacityClaimSchema = z.object({
  rank: z.number().int().positive(),
  playerId: z.string().min(1),
  round: z.number().int().positive(),
  attentionPaid: z.number().int().nonnegative(),
  capacityAward: z.number().int().nonnegative()
}).strict();

export const AttentionV4CapacityTrackSchema = z.object({
  nextRank: z.number().int().positive(),
  claims: z.array(AttentionV4CapacityClaimSchema),
  artilleryUnlocked: z.boolean(),
  artilleryUnlockRound: z.number().int().positive().nullable()
}).strict();
export type AttentionV4CapacityTrack = z.infer<typeof AttentionV4CapacityTrackSchema>;

export const AttentionV4HazardProjectionSchema = z.object({
  artifactId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  reasons: z.array(z.enum(["context-limit", "local-traffic"])).min(1),
  drift: z.literal(2),
  frozenUnitIds: z.array(z.string().min(1))
}).strict();
export type AttentionV4HazardProjection = z.infer<typeof AttentionV4HazardProjectionSchema>;

export const AttentionV4RegisterRecapSchema = z.object({
  round: z.number().int().positive(),
  attention: z.array(z.object({ playerId: z.string().min(1), total: z.number().int().nonnegative() }).strict()),
  uap: z.array(z.object({
    unitId: z.string().min(1),
    base: z.number().int().positive(),
    batteryBonus: z.number().int().min(0).max(1),
    effective: z.number().int().nonnegative(),
    frozen: z.boolean()
  }).strict()),
  reloads: z.array(z.object({ playerId: z.string().min(1), cardIds: z.array(z.string().min(1)) }).strict()),
  agedArtifactIds: z.array(z.string().min(1)),
  artilleryUnlocked: z.boolean()
}).strict();
export type AttentionV4RegisterRecap = z.infer<typeof AttentionV4RegisterRecapSchema>;

export const AttentionV4ResolutionRecapSchema = z.object({
  completedRound: z.number().int().positive(),
  detonations: z.array(AttentionV4HazardProjectionSchema),
  resolutions: z.array(z.object({
    artifactId: z.string().min(1),
    outcome: z.enum(["sound", "unsound", "seized", "rejected", "he-sound", "he-unsound"])
  }).strict()),
  players: z.array(z.object({
    playerId: z.string().min(1),
    progress: z.number().int().nonnegative(),
    drift: z.number().int().nonnegative(),
    attention: z.number().int().nonnegative(),
    status: z.enum(["active", "victory", "defeat", "draw"])
  }).strict()),
  terminal: z.boolean()
}).strict();
export type AttentionV4ResolutionRecap = z.infer<typeof AttentionV4ResolutionRecapSchema>;

export const AttentionV4RoundRecordSchema = z.object({
  round: z.number().int().positive(),
  rootStream: z.string().min(1),
  domainStreams: z.record(z.string().min(1)),
  uap: z.array(z.record(z.unknown())),
  armoryTransitions: z.array(z.record(z.unknown())),
  batteryFields: z.array(z.record(z.unknown())),
  artifacts: z.array(z.record(z.unknown())),
  detonations: z.array(z.record(z.unknown())),
  drift: z.array(z.record(z.unknown())),
  empVictims: z.array(z.string().min(1))
}).strict();
export type AttentionV4RoundRecord = z.infer<typeof AttentionV4RoundRecordSchema>;

const AttentionV4MatchStateFields = {
  schemaVersion: z.literal(ATTENTION_V4_STATE_SCHEMA_VERSION),
  modelVersion: z.literal(ATTENTION_V4_MODEL_VERSION),
  rulesetVersion: z.literal(ATTENTION_V4_RULESET_VERSION),
  rulesetHash: DigestSchema,
  resolverVersion: z.literal(ATTENTION_V4_RESOLVER_VERSION),
  compiledCommanderHashes: z.tuple([DigestSchema, DigestSchema]),
  matchId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  seed: z.number().int(),
  randomStreamId: z.string().min(1),
  round: z.number().int().positive(),
  phase: AttentionV4PhaseSchema,
  status: z.enum(["active", "complete"]),
  winnerPlayerId: z.string().min(1).nullable(),
  terminalReason: z.enum(["objective", "drift", "round-limit", "simultaneous"]).nullable(),
  eventSequence: z.number().int().nonnegative(),
  players: z.tuple([AttentionV4PlayerStateSchema, AttentionV4PlayerStateSchema]),
  units: z.array(AttentionV4UnitStateSchema).min(4).max(12),
  artifacts: z.array(AttentionV4ArtifactStateSchema),
  zones: z.array(AttentionV4ZoneSchema),
  supportReservations: z.array(AttentionV4SupportReservationSchema),
  traffic: z.array(AttentionV4TrafficCellSchema),
  capacityTrack: AttentionV4CapacityTrackSchema,
  command: z.object({
    activePlayerId: z.string().min(1).nullable(),
    endedPlayerIds: z.array(z.string().min(1))
  }).strict(),
  lastRegisterRecap: AttentionV4RegisterRecapSchema,
  lastResolutionRecap: AttentionV4ResolutionRecapSchema.nullable(),
  roundRecords: z.array(AttentionV4RoundRecordSchema)
};

export const AttentionV4MatchStateSchema = z.object(AttentionV4MatchStateFields).strict().superRefine((state, context) => {
  const playerIds = state.players.map((player) => player.playerId);
  if (new Set(playerIds).size !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["players"], message: "player ids must be unique" });
  const unitIds = state.units.map((unit) => unit.unitId);
  if (new Set(unitIds).size !== unitIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: "unit ids must be unique" });
  const artifactIds = state.artifacts.map((artifact) => artifact.artifactId);
  if (new Set(artifactIds).size !== artifactIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "artifact ids must be unique" });
  for (const [index, unit] of state.units.entries()) {
    if (!playerIds.includes(unit.ownerPlayerId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "ownerPlayerId"], message: "unknown player" });
    if (unit.uap.spent > unit.uap.effective) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "uap", "spent"], message: "spent UAP exceeds effective UAP" });
    if (unit.uap.frozen !== (unit.uap.effective === 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "uap"], message: "frozen and effective UAP must agree" });
  }
  for (const playerId of playerIds) {
    const composition = state.units.filter((unit) => unit.ownerPlayerId === playerId).map((unit) => unit.chassis);
    const parsedFleet = AttentionV4FleetSchema.safeParse(composition);
    if (!parsedFleet.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: `${playerId} fleet is illegal: ${parsedFleet.error.issues.map((issue) => issue.message).join("; ")}` });
    }
  }
  for (const [index, artifact] of state.artifacts.entries()) {
    if (!playerIds.includes(artifact.ownerPlayerId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "ownerPlayerId"], message: "unknown player" });
    if (!unitIds.includes(artifact.sourceUnitId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "sourceUnitId"], message: "unknown source unit" });
    if (artifact.battery.active && !artifact.verified) context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "battery"], message: "a Battery must be verified" });
  }
  if ((state.phase === "terminal") !== (state.status === "complete")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["phase"], message: "terminal phase and complete status must agree" });
  if (state.command.activePlayerId !== null && !playerIds.includes(state.command.activePlayerId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["command", "activePlayerId"], message: "unknown active commander" });
});
export type AttentionV4MatchState = z.infer<typeof AttentionV4MatchStateSchema>;

export const AttentionV4ActiveFrontSchema = z.object({
  playerId: z.string().min(1),
  center: AttentionV4CoordinateSchema,
  radius: z.number().int().nonnegative()
}).strict();

const {
  seed: _hiddenSeed,
  randomStreamId: _hiddenStream,
  artifacts: _hiddenArtifacts,
  roundRecords: _hiddenRoundRecords,
  ...AttentionV4ProjectionFields
} = AttentionV4MatchStateFields;

export const AttentionV4ProjectionSchema = z.object({
  ...AttentionV4ProjectionFields,
  viewerPlayerId: z.string().min(1),
  artifacts: z.array(AttentionV4ProjectedArtifactSchema),
  activeFronts: z.array(AttentionV4ActiveFrontSchema)
}).strict();
export type AttentionV4Projection = z.infer<typeof AttentionV4ProjectionSchema>;

export const AttentionV4EventEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),
  matchId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  occurredAt: z.string().min(1),
  eventType: z.string().min(1),
  actorId: z.string().nullable(),
  causationId: z.string().nullable(),
  correlationId: z.string().min(1),
  data: z.record(z.unknown())
}).strict();
export type AttentionV4EventEnvelope = z.infer<typeof AttentionV4EventEnvelopeSchema>;

export const AttentionV4RulesSchema = z.object({
  rulesetVersion: z.literal(ATTENTION_V4_RULESET_VERSION),
  rulesetHash: DigestSchema,
  resolverVersion: z.literal(ATTENTION_V4_RESOLVER_VERSION),
  scenarioLabel: z.string().min(1),
  opponentLabel: z.string().min(1),
  board: z.object({ width: z.literal(10), height: z.literal(10), distanceMetric: z.literal("chebyshev"), exclusiveOccupancy: z.literal(true) }).strict(),
  roundLimit: z.literal(8),
  attentionPerRound: z.literal(3),
  objectiveTarget: z.literal(12),
  driftLimit: z.literal(4),
  soundnessRate: z.literal(0.7),
  verifyCost: z.literal(1),
  chassis: z.object({
    scout: z.object({ uap: z.literal(3), reactorRating: z.literal(3), calibration: z.literal(0.2), range: z.literal(2), contextLimit: z.literal(1), seizeCost: z.literal(1) }).strict(),
    line: z.object({ uap: z.literal(2), reactorRating: z.literal(2), calibration: z.literal(0.6), range: z.literal(3), contextLimit: z.literal(2), seizeCost: z.literal(2) }).strict(),
    heavy: z.object({ uap: z.literal(1), reactorRating: z.literal(1), calibration: z.literal(0.9), range: z.literal(4), contextLimit: z.literal(3), seizeCost: z.literal(3) }).strict()
  }).strict(),
  fleet: z.object({
    weight: z.literal(ATTENTION_V4_FLEET_WEIGHT),
    chassisWeights: z.object({ scout: z.literal(1), line: z.literal(2), heavy: z.literal(3) }).strict(),
    minimumUnits: z.literal(3),
    maximumUnits: z.literal(5),
    maximumHeavies: z.literal(ATTENTION_V4_MAX_HEAVIES),
    maximumScouts: z.literal(ATTENTION_V4_MAX_SCOUTS)
  }).strict(),
  range: z.object({ minimum: z.literal(1), maximum: z.literal(5), spawnMinimum: z.literal(1) }).strict(),
  trafficLimit: z.literal(3),
  battery: z.object({ fieldSize: z.literal(3), kineticBonus: z.literal(1), commandDiscount: z.literal(1), minimumDensityPct: z.literal(80), minimumCalibration: z.literal(0.8) }).strict(),
  allocation: z.object({
    densities: z.array(AttentionV4DensityPctSchema).length(17),
    prefill: z.record(z.object({ volume: z.number().int().positive(), densityPct: AttentionV4DensityPctSchema }).strict()),
    scoutCondense: z.array(z.object({
      steps: z.number().int().min(0).max(2),
      volumeCap: z.number().int().min(1).max(3),
      densityCapPct: AttentionV4DensityPctSchema,
      calibration: z.number().min(0.2).max(0.85)
    }).strict()).length(3)
  }).strict(),
  capacitySlots: z.array(z.object({ rank: z.number().int().positive(), cost: z.number().int().nonnegative(), capacityAward: z.number().int().nonnegative() }).strict()).length(5),
  abilities: z.object({
    perfectFocus: z.object({ unlockRank: z.literal(1), cooldownRounds: z.literal(3), maxUses: z.literal(3) }).strict(),
    overclock: z.object({ unlockRank: z.literal(2), seizeDiscount: z.literal(1), maxUses: z.literal(1) }).strict(),
    artillery: z.object({ unlockRank: z.literal(3), cooldown: z.literal(3), reloadThreshold: z.literal(3), reloadTo: z.literal(5) }).strict()
  }).strict(),
  artillery: z.object({ shells: z.array(AttentionV4ShellSchema).length(5), zoneSize: z.literal(3), durationWindows: z.literal(2), flareMultiplier: z.literal(2) }).strict()
}).strict();
export type AttentionV4Rules = z.infer<typeof AttentionV4RulesSchema>;

export const AttentionV4AttentionCostSchema = z.object({
  base: z.number().int().nonnegative(),
  batteryDiscount: z.number().int().min(0).max(1),
  overclockDiscount: z.number().int().min(0).max(1),
  total: z.number().int().nonnegative(),
  batteryArtifactId: z.string().min(1).nullable()
}).strict();
export type AttentionV4AttentionCost = z.infer<typeof AttentionV4AttentionCostSchema>;

export const AttentionV4LegalSchema = z.object({
  phase: AttentionV4PhaseSchema,
  activeCommanderId: z.string().min(1).nullable(),
  kinetic: z.array(z.object({
    unitId: z.string().min(1),
    baseUap: z.number().int().positive(),
    batteryBonus: z.number().int().min(0).max(1),
    effectiveUap: z.number().int().nonnegative(),
    frozen: z.boolean(),
    maxSupportScans: z.number().int().min(0).max(2),
    condenseSteps: z.number().int().min(0).max(2),
    maxCondenseSteps: z.number().int().min(0).max(2),
    range: z.object({ current: z.number().int().min(1).max(5), minimum: z.literal(1), maximum: z.literal(5) }).strict()
  }).strict()),
  shellCards: z.array(z.object({
    cardId: z.string().min(1),
    shell: AttentionV4ShellSchema,
    legal: z.boolean(),
    reason: z.string().nullable(),
    usesRetaliation: z.boolean()
  }).strict()),
  artilleryPreviews: z.array(z.object({
    cardId: z.string().min(1),
    center: AttentionV4CoordinateSchema,
    blockedByScreenIds: z.array(z.string().min(1)),
    affectedUnitIds: z.array(z.string().min(1)),
    affectedArtifactIds: z.array(z.string().min(1)),
    affectedBatteryIds: z.array(z.string().min(1))
  }).strict()),
  capacity: z.object({
    available: z.boolean(),
    rank: z.number().int().positive().nullable(),
    cost: z.number().int().nonnegative().nullable(),
    award: z.number().int().nonnegative().nullable(),
    affordable: z.boolean()
  }).strict(),
  allocations: z.array(z.object({
    unitId: z.string().min(1),
    reactorRating: z.number().int().positive(),
    prefillVolume: z.number().int().positive(),
    prefillDensityPct: AttentionV4DensityPctSchema,
    condenseSteps: z.number().int().min(0).max(2),
    maximumVolume: z.number().int().positive(),
    maximumDensityPct: AttentionV4DensityPctSchema,
    maximumVolumeByDensity: z.record(z.number().int().nonnegative()),
    decision: z.enum(["pending", "emitted", "held"])
  }).strict()),
  artifacts: z.array(z.object({
    artifactId: z.string().min(1),
    verify: z.object({ legal: z.boolean(), reason: z.string().nullable(), cost: AttentionV4AttentionCostSchema }).strict(),
    seize: z.object({ legal: z.boolean(), reason: z.string().nullable(), cost: AttentionV4AttentionCostSchema }).strict(),
    batteryEligibleOnVerify: z.boolean()
  }).strict()),
  abilities: z.object({
    perfectFocus: z.object({ ready: z.boolean(), reason: z.string().nullable(), usesRemaining: z.number().int().nonnegative(), nextReadyRound: z.number().int().positive() }).strict(),
    overclock: z.object({ ready: z.boolean(), reason: z.string().nullable(), usesRemaining: z.number().int().nonnegative() }).strict()
  }).strict(),
  canEndCommand: z.boolean(),
  endCommandReason: z.string().nullable(),
  projectedHazards: z.array(AttentionV4HazardProjectionSchema)
}).strict();
export type AttentionV4Legal = z.infer<typeof AttentionV4LegalSchema>;

export const BattleCommandV2ViewSchema = z.object({
  schemaVersion: z.literal(ATTENTION_V4_VIEW_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  modelVersion: z.literal(ATTENTION_V4_MODEL_VERSION),
  stateSchemaVersion: z.literal(ATTENTION_V4_STATE_SCHEMA_VERSION),
  rulesetVersion: z.literal(ATTENTION_V4_RULESET_VERSION),
  rulesetHash: DigestSchema,
  resolverVersion: z.literal(ATTENTION_V4_RESOLVER_VERSION),
  compiledCommanderHashes: z.tuple([DigestSchema, DigestSchema]),
  projection: AttentionV4ProjectionSchema,
  events: z.array(AttentionV4EventEnvelopeSchema),
  rules: AttentionV4RulesSchema,
  legal: AttentionV4LegalSchema,
  recaps: z.object({ register: AttentionV4RegisterRecapSchema, resolution: AttentionV4ResolutionRecapSchema.nullable() }).strict()
}).strict();
export type BattleCommandV2View = z.infer<typeof BattleCommandV2ViewSchema>;

export const BattleCommandV2SubmissionSchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("kinetic"),
    plans: z.array(z.object({ unitId: z.string().min(1), actions: z.array(AttentionV4KineticActionSchema).max(4) }).strict()).min(2).max(6)
  }).strict(),
  z.object({ phase: z.literal("artillery"), cardId: z.string().min(1).nullable(), center: AttentionV4CoordinateSchema.optional() }).strict(),
  z.object({ phase: z.literal("capacity"), claim: z.boolean() }).strict(),
  z.object({ phase: z.literal("command"), intent: AttentionV4CommandIntentSchema }).strict()
]).superRefine((submission, context) => {
  if (submission.phase !== "artillery") return;
  if (submission.cardId !== null && submission.center === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["center"], message: "a fired shell requires a target center" });
  }
  if (submission.cardId === null && submission.center !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["center"], message: "Pass cannot include a target center" });
  }
});
export type BattleCommandV2Submission = z.infer<typeof BattleCommandV2SubmissionSchema>;

export const BattleCommandV2ActionRequestSchema = z.object({
  revision: z.number().int().nonnegative(),
  submission: BattleCommandV2SubmissionSchema
}).strict();
export type BattleCommandV2ActionRequest = z.infer<typeof BattleCommandV2ActionRequestSchema>;

export const BattleCommandV2CreateRequestSchema = z.object({
  seed: z.number().int().nonnegative().optional(),
  playerCompositionModule: z.enum(ATTENTION_V4_COMPOSITION_MODULES).optional(),
  opponentCompositionModule: z.enum(ATTENTION_V4_COMPOSITION_MODULES).optional()
}).strict();
export type BattleCommandV2CreateRequest = z.infer<typeof BattleCommandV2CreateRequestSchema>;

export const AttentionV4CommanderProfileSchema = z.object({
  schemaVersion: z.literal(3),
  commanderId: z.string().min(1),
  ordinal: z.number().int().min(0).max(ATTENTION_V4_COMMANDER_PROFILE_COUNT - 1),
  compositionModule: z.enum(ATTENTION_V4_COMPOSITION_MODULES),
  triageModule: z.enum(ATTENTION_V2_TRIAGE_MODULES),
  movementModule: z.enum(ATTENTION_V2_MOVEMENT_MODULES),
  capacityModule: z.enum(ATTENTION_V2_CAPACITY_MODULES),
  profileHash: DigestSchema,
  resolverRequirement: z.literal(ATTENTION_V4_RESOLVER_VERSION)
}).strict().superRefine((profile, context) => {
  const composition = ATTENTION_V4_COMPOSITION_MODULES.indexOf(profile.compositionModule);
  const triage = ATTENTION_V2_TRIAGE_MODULES.indexOf(profile.triageModule);
  const movement = ATTENTION_V2_MOVEMENT_MODULES.indexOf(profile.movementModule);
  const capacity = ATTENTION_V2_CAPACITY_MODULES.indexOf(profile.capacityModule);
  const expected = ((composition * ATTENTION_V2_TRIAGE_MODULES.length + triage) * ATTENTION_V2_MOVEMENT_MODULES.length + movement) * ATTENTION_V2_CAPACITY_MODULES.length + capacity;
  if (profile.ordinal !== expected) context.addIssue({ code: z.ZodIssueCode.custom, path: ["ordinal"], message: `ordinal must be ${expected} for this module tuple` });
});
export type AttentionV4CommanderProfile = z.infer<typeof AttentionV4CommanderProfileSchema>;

export const AttentionV4CommanderProgramSchema = z.object({
  schemaVersion: z.literal(3),
  compilerVersion: z.literal(ATTENTION_V4_COMMANDER_COMPILER_VERSION),
  resolverVersion: z.literal(ATTENTION_V4_RESOLVER_VERSION),
  profileHash: DigestSchema,
  composition: AttentionV4FleetSchema,
  triageModule: z.enum(ATTENTION_V2_TRIAGE_MODULES),
  movementModule: z.enum(ATTENTION_V2_MOVEMENT_MODULES),
  capacityModule: z.enum(ATTENTION_V2_CAPACITY_MODULES),
  compositionBehavior: z.string().min(1),
  triageBehavior: z.string().min(1),
  movementBehavior: z.string().min(1),
  capacityBehavior: z.string().min(1),
  shellPriority: z.array(AttentionV4ShellSchema).length(5),
  programHash: DigestSchema
}).strict();
export type AttentionV4CommanderProgram = z.infer<typeof AttentionV4CommanderProgramSchema>;

export const AttentionV4CommanderCatalogSchema = z.object({
  schemaVersion: z.literal(3),
  compilerVersion: z.literal(ATTENTION_V4_COMMANDER_COMPILER_VERSION),
  resolverVersion: z.literal(ATTENTION_V4_RESOLVER_VERSION),
  catalogId: z.string().min(1),
  catalogHash: DigestSchema,
  profiles: z.array(AttentionV4CommanderProfileSchema).length(ATTENTION_V4_COMMANDER_PROFILE_COUNT),
  compiledHashes: z.array(DigestSchema).length(ATTENTION_V4_COMMANDER_PROFILE_COUNT)
}).strict();
export type AttentionV4CommanderCatalog = z.infer<typeof AttentionV4CommanderCatalogSchema>;

export const AttentionStateV3Schema = AttentionV4MatchStateSchema;
export const AttentionProjectionV3Schema = AttentionV4ProjectionSchema;
export const AttentionLegalActionV3Schema = AttentionV4LegalSchema;
export const AttentionSubmissionV3Schema = BattleCommandV2SubmissionSchema;
export const BattleCommandV3ViewSchema = BattleCommandV2ViewSchema;
export const BattleCommandV3SubmissionSchema = BattleCommandV2SubmissionSchema;
export const BattleCommandV3ActionRequestSchema = BattleCommandV2ActionRequestSchema;
export const BattleCommandV3CreateRequestSchema = BattleCommandV2CreateRequestSchema;
export type AttentionStateV3 = AttentionV4MatchState;
export type AttentionProjectionV3 = AttentionV4Projection;
export type AttentionLegalActionV3 = AttentionV4Legal;
export type AttentionSubmissionV3 = BattleCommandV2Submission;
export type BattleCommandV3View = BattleCommandV2View;
export type BattleCommandV3Submission = BattleCommandV2Submission;
export type BattleCommandV3ActionRequest = BattleCommandV2ActionRequest;
export type BattleCommandV3CreateRequest = BattleCommandV2CreateRequest;
