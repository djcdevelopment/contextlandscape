import { z } from "zod";

export const STRATEGIC_WORLD_EDGE = 6_400 as const;
export const STRATEGIC_CHUNK_EDGE = 32 as const;
export const STRATEGIC_CHUNKS_PER_EDGE = STRATEGIC_WORLD_EDGE / STRATEGIC_CHUNK_EDGE;
export const BATTLE_VOLUME_EDGE = 32 as const;
export const BATTLE_VOLUME_CELLS = BATTLE_VOLUME_EDGE ** 3;

const strategicAxis = z.number().int().min(0).max(STRATEGIC_WORLD_EDGE - 1);
const strategicBoundary = z.number().int().min(0).max(STRATEGIC_WORLD_EDGE);
const chunkAxis = z.number().int().min(0).max(STRATEGIC_CHUNKS_PER_EDGE - 1);
const localAxis = z.number().int().min(0).max(STRATEGIC_CHUNK_EDGE - 1);
const battleAxis = z.number().int().min(0).max(BATTLE_VOLUME_EDGE - 1);
const normalized = z.number().min(0).max(1);

export const StrategicCoordinateV1Schema = z.object({
  x: strategicAxis,
  y: strategicAxis
}).strict();
export type StrategicCoordinateV1 = z.infer<typeof StrategicCoordinateV1Schema>;

export const StrategicBoundsV1Schema = z.object({
  minX: strategicBoundary,
  minY: strategicBoundary,
  maxX: strategicBoundary,
  maxY: strategicBoundary
}).strict().superRefine((bounds, context) => {
  if (bounds.maxX <= bounds.minX) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxX"], message: "maxX must be greater than minX" });
  }
  if (bounds.maxY <= bounds.minY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxY"], message: "maxY must be greater than minY" });
  }
});
export type StrategicBoundsV1 = z.infer<typeof StrategicBoundsV1Schema>;

export const StrategicChunkAddressV1Schema = z.object({
  chunkX: chunkAxis,
  chunkY: chunkAxis
}).strict();
export type StrategicChunkAddressV1 = z.infer<typeof StrategicChunkAddressV1Schema>;

export const StrategicChunkLocalCoordinateV1Schema = z.object({
  x: localAxis,
  y: localAxis
}).strict();
export type StrategicChunkLocalCoordinateV1 = z.infer<typeof StrategicChunkLocalCoordinateV1Schema>;

export const BattleCoordinateV1Schema = z.object({
  x: battleAxis,
  y: battleAxis,
  z: battleAxis
}).strict();
export type BattleCoordinateV1 = z.infer<typeof BattleCoordinateV1Schema>;

export const BattleVolumeRefV1Schema = z.object({
  schemaVersion: z.literal(1),
  worldId: z.string().min(1),
  battleId: z.string().min(1),
  anchor: StrategicCoordinateV1Schema,
  dimensions: z.object({
    width: z.literal(BATTLE_VOLUME_EDGE),
    height: z.literal(BATTLE_VOLUME_EDGE),
    depth: z.literal(BATTLE_VOLUME_EDGE)
  }).strict()
}).strict();
export type BattleVolumeRefV1 = z.infer<typeof BattleVolumeRefV1Schema>;

export const LandscapeAddressV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("strategic"),
    worldId: z.string().min(1),
    coordinate: StrategicCoordinateV1Schema
  }).strict(),
  z.object({
    kind: z.literal("battle"),
    worldId: z.string().min(1),
    battleId: z.string().min(1),
    coordinate: BattleCoordinateV1Schema
  }).strict()
]);
export type LandscapeAddressV1 = z.infer<typeof LandscapeAddressV1Schema>;

export const WorldDescriptorV1Schema = z.object({
  schemaVersion: z.literal(1),
  worldId: z.string().min(1),
  revision: z.string().min(1),
  strategicDimensions: z.object({
    width: z.literal(STRATEGIC_WORLD_EDGE),
    height: z.literal(STRATEGIC_WORLD_EDGE)
  }).strict(),
  chunkDimensions: z.object({
    width: z.literal(STRATEGIC_CHUNK_EDGE),
    height: z.literal(STRATEGIC_CHUNK_EDGE)
  }).strict(),
  battleDimensions: z.object({
    width: z.literal(BATTLE_VOLUME_EDGE),
    height: z.literal(BATTLE_VOLUME_EDGE),
    depth: z.literal(BATTLE_VOLUME_EDGE)
  }).strict()
}).strict();
export type WorldDescriptorV1 = z.infer<typeof WorldDescriptorV1Schema>;

export const StrategicViewportLodV1Schema = z.enum(["theater", "sector", "cell"]);
export type StrategicViewportLodV1 = z.infer<typeof StrategicViewportLodV1Schema>;

export const StrategicViewportRequestV1Schema = z.object({
  schemaVersion: z.literal(1),
  bounds: StrategicBoundsV1Schema,
  lod: StrategicViewportLodV1Schema,
  knownRevision: z.string().min(1).optional()
}).strict();
export type StrategicViewportRequestV1 = z.infer<typeof StrategicViewportRequestV1Schema>;

export const LandscapeControlV1Schema = z.enum(["friendly", "enemy", "contested", "unknown"]);
export type LandscapeControlV1 = z.infer<typeof LandscapeControlV1Schema>;

export const StrategicFrontV1Schema = z.object({
  frontId: z.string().min(1),
  control: LandscapeControlV1Schema,
  confidence: normalized,
  uncertaintyRadius: z.number().nonnegative(),
  points: z.array(StrategicCoordinateV1Schema).min(2)
}).strict();
export type StrategicFrontV1 = z.infer<typeof StrategicFrontV1Schema>;

export const StrategicContactV1Schema = z.object({
  contactId: z.string().min(1),
  estimatedPosition: StrategicCoordinateV1Schema,
  uncertaintyRadius: z.number().nonnegative(),
  confidence: normalized,
  observedTick: z.number().int().nonnegative(),
  classification: z.enum(["formation", "logistics", "signal", "unknown"])
}).strict();
export type StrategicContactV1 = z.infer<typeof StrategicContactV1Schema>;

export const StrategicBattleSummaryV1Schema = z.object({
  battle: BattleVolumeRefV1Schema,
  status: z.enum(["forming", "active", "stable", "resolved"]),
  control: LandscapeControlV1Schema,
  intensity: normalized,
  attentionDemand: z.number().nonnegative(),
  attentionAllocated: z.number().nonnegative(),
  friendlyStrength: z.number().nonnegative(),
  enemyStrength: z.object({
    minimum: z.number().nonnegative(),
    maximum: z.number().nonnegative()
  }).strict(),
  uncertainty: normalized,
  activeLayers: z.tuple([battleAxis, battleAxis]),
  lastObservedTick: z.number().int().nonnegative()
}).strict().superRefine((summary, context) => {
  if (summary.enemyStrength.maximum < summary.enemyStrength.minimum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["enemyStrength", "maximum"], message: "maximum must be at least minimum" });
  }
  if (summary.activeLayers[1] < summary.activeLayers[0]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["activeLayers", 1], message: "upper active layer must be at least lower active layer" });
  }
});
export type StrategicBattleSummaryV1 = z.infer<typeof StrategicBattleSummaryV1Schema>;

export const StrategicFieldMetricV1Schema = z.enum([
  "attention-pressure",
  "uncertainty",
  "knowledge",
  "logistics",
  "control-pressure"
]);
export type StrategicFieldMetricV1 = z.infer<typeof StrategicFieldMetricV1Schema>;

export const StrategicFieldPatchV1Schema = z.object({
  chunk: StrategicChunkAddressV1Schema,
  metric: StrategicFieldMetricV1Schema,
  samples: z.array(z.object({
    coordinate: StrategicChunkLocalCoordinateV1Schema,
    value: normalized
  }).strict())
}).strict();
export type StrategicFieldPatchV1 = z.infer<typeof StrategicFieldPatchV1Schema>;

export const StrategicViewportProjectionV1Schema = z.object({
  schemaVersion: z.literal(1),
  descriptor: WorldDescriptorV1Schema,
  revision: z.string().min(1),
  tick: z.number().int().nonnegative(),
  bounds: StrategicBoundsV1Schema,
  lod: StrategicViewportLodV1Schema,
  fronts: z.array(StrategicFrontV1Schema),
  contacts: z.array(StrategicContactV1Schema),
  battles: z.array(StrategicBattleSummaryV1Schema),
  fields: z.array(StrategicFieldPatchV1Schema)
}).strict();
export type StrategicViewportProjectionV1 = z.infer<typeof StrategicViewportProjectionV1Schema>;

export const BattleLayerSummaryV1Schema = z.object({
  z: battleAxis,
  friendlyStrength: z.number().nonnegative(),
  enemyStrength: z.object({
    minimum: z.number().nonnegative(),
    maximum: z.number().nonnegative()
  }).strict(),
  uncertainty: normalized,
  artifactCount: z.number().int().nonnegative(),
  intensity: normalized
}).strict().superRefine((layer, context) => {
  if (layer.enemyStrength.maximum < layer.enemyStrength.minimum) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["enemyStrength", "maximum"], message: "maximum must be at least minimum" });
  }
});
export type BattleLayerSummaryV1 = z.infer<typeof BattleLayerSummaryV1Schema>;

export const BattleVisibleEntityV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("friendly"),
    entityId: z.string().min(1),
    chassis: z.string().min(1),
    position: BattleCoordinateV1Schema,
    strength: z.number().nonnegative(),
    attentionDemand: z.number().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("contact"),
    entityId: z.string().min(1),
    classification: z.string().min(1),
    estimatedPosition: BattleCoordinateV1Schema,
    uncertaintyRadius: z.number().nonnegative(),
    confidence: normalized,
    observedTick: z.number().int().nonnegative()
  }).strict()
]);
export type BattleVisibleEntityV1 = z.infer<typeof BattleVisibleEntityV1Schema>;

export const BattleProjectedArtifactV1Schema = z.object({
  artifactId: z.string().min(1),
  position: BattleCoordinateV1Schema,
  confidence: normalized,
  resolution: z.enum(["pending", "accepted", "rejected", "seized"]),
  revealedSound: z.boolean().nullable()
}).strict();
export type BattleProjectedArtifactV1 = z.infer<typeof BattleProjectedArtifactV1Schema>;

export const BattleSpatialEffectV1Schema = z.object({
  effectId: z.string().min(1),
  kind: z.enum(["front", "macro-flare", "attention-field", "uncertainty-field"]),
  center: BattleCoordinateV1Schema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  depth: z.number().int().positive(),
  remainingTicks: z.number().int().nonnegative()
}).strict();
export type BattleSpatialEffectV1 = z.infer<typeof BattleSpatialEffectV1Schema>;

export const BattleVolumeProjectionV1Schema = z.object({
  schemaVersion: z.literal(1),
  battle: BattleVolumeRefV1Schema,
  revision: z.string().min(1),
  tick: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
  phase: z.enum(["observe", "allocate", "delegate", "resolve", "complete"]),
  attention: z.object({
    available: z.number().nonnegative(),
    allocated: z.number().nonnegative(),
    demand: z.number().nonnegative()
  }).strict(),
  activeLayer: battleAxis,
  layers: z.array(BattleLayerSummaryV1Schema).length(BATTLE_VOLUME_EDGE),
  entities: z.array(BattleVisibleEntityV1Schema),
  artifacts: z.array(BattleProjectedArtifactV1Schema),
  effects: z.array(BattleSpatialEffectV1Schema)
}).strict().superRefine((projection, context) => {
  const layers = new Set(projection.layers.map((layer) => layer.z));
  if (layers.size !== BATTLE_VOLUME_EDGE) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers"], message: "layers must contain every battle z coordinate exactly once" });
  }
});
export type BattleVolumeProjectionV1 = z.infer<typeof BattleVolumeProjectionV1Schema>;

export const CommanderDoctrineV1Schema = z.enum(["observe", "stabilize", "delegate", "press", "extract"]);
export type CommanderDoctrineV1 = z.infer<typeof CommanderDoctrineV1Schema>;

export const CommanderIntentV1Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("allocate-attention"),
    battleId: z.string().min(1),
    amount: z.number().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("set-doctrine"),
    battleId: z.string().min(1),
    doctrine: CommanderDoctrineV1Schema
  }).strict(),
  z.object({
    kind: z.literal("observe"),
    coordinate: StrategicCoordinateV1Schema,
    radius: z.number().int().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("move-reserve"),
    reserveId: z.string().min(1),
    destination: StrategicCoordinateV1Schema
  }).strict()
]);
export type CommanderIntentV1 = z.infer<typeof CommanderIntentV1Schema>;
