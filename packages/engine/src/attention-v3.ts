import {
  ATTENTION_V3_MODEL_VERSION,
  AttentionModelDefinitionSchema,
  type AttentionArtilleryModel,
  type AttentionModelDefinition,
  type AttentionScenario,
  type AttentionSpatialModel,
  type AttentionUapModel
} from "@landscape/contracts";
import {
  defaultAttentionModel,
  defaultAttentionScenario,
  type AttentionRuntimeContext
} from "./attention.js";

export const ATTENTION_V3_RESOLVER_VERSION = "attention-v3-stage-a-resolver-1" as const;
export const ATTENTION_V3_SPATIAL_RESOLVER_VERSION = "attention-v3-stage-b-resolver-1" as const;
export const ATTENTION_V3_ARTILLERY_RESOLVER_VERSION = "attention-v3-stage-c-resolver-1" as const;

export const defaultAttentionV3Uap: AttentionUapModel = {
  budgets: { scout: 3, line: 2, siege: 1 },
  scout: {
    activeReconCalibration: 0.85,
    passiveSettleCalibration: [0.4, 0.65, 0.85]
  },
  line: { stepUpCalibration: 0.85 },
  siege: {
    uplinkAttentionBonus: 1,
    uplinkCalibration: 0.2
  }
};

export const defaultAttentionV3Spatial: AttentionSpatialModel = {
  ranges: {
    scout: { defaultRange: 2, minimumRange: 1, maximumRange: 5 },
    line: { defaultRange: 3, minimumRange: 1, maximumRange: 5 },
    siege: { defaultRange: 4, minimumRange: 1, maximumRange: 5 }
  },
  spawnMinimumDistance: 1,
  verificationReach: 1,
  supportScansPerUnit: 1
};

export const defaultAttentionV3Artillery: AttentionArtilleryModel = {
  startingHand: { flare: 1, chaff: 1 },
  zone: { width: 3, height: 3 },
  outputMultiplier: 2,
  flareDurationEmissions: 2,
  chaffDurationArtilleryPhases: 2,
  reload: false
};

export function createAttentionV3Model(
  base: AttentionModelDefinition = defaultAttentionModel,
  uap: AttentionUapModel = defaultAttentionV3Uap
): AttentionModelDefinition {
  const { uap: _priorUap, spatial: _priorSpatial, artillery: _priorArtillery, ...source } = base;
  return AttentionModelDefinitionSchema.parse({
    ...source,
    modelVersion: ATTENTION_V3_MODEL_VERSION,
    uap
  });
}

export const defaultAttentionV3Model = createAttentionV3Model();

export function createAttentionV3SpatialModel(
  base: AttentionModelDefinition = defaultAttentionModel,
  uap: AttentionUapModel = defaultAttentionV3Uap,
  spatial: AttentionSpatialModel = defaultAttentionV3Spatial
): AttentionModelDefinition {
  const { uap: _priorUap, spatial: _priorSpatial, artillery: _priorArtillery, ...source } = base;
  return AttentionModelDefinitionSchema.parse({
    ...source,
    modelVersion: ATTENTION_V3_MODEL_VERSION,
    uap,
    spatial
  });
}

export const defaultAttentionV3SpatialModel = createAttentionV3SpatialModel();

export function createAttentionV3ArtilleryModel(
  base: AttentionModelDefinition = defaultAttentionModel,
  uap: AttentionUapModel = defaultAttentionV3Uap,
  spatial: AttentionSpatialModel = defaultAttentionV3Spatial,
  artillery: AttentionArtilleryModel = defaultAttentionV3Artillery
): AttentionModelDefinition {
  const { uap: _priorUap, spatial: _priorSpatial, artillery: _priorArtillery, ...source } = base;
  return AttentionModelDefinitionSchema.parse({
    ...source,
    modelVersion: ATTENTION_V3_MODEL_VERSION,
    uap,
    spatial,
    artillery
  });
}

export const defaultAttentionV3ArtilleryModel = createAttentionV3ArtilleryModel();

export type AttentionV3ResolvedModel = {
  resolverVersion: typeof ATTENTION_V3_RESOLVER_VERSION;
  model: AttentionModelDefinition;
};

export function resolveAttentionV3Model(
  base: AttentionModelDefinition = defaultAttentionModel,
  uap: AttentionUapModel = defaultAttentionV3Uap
): AttentionV3ResolvedModel {
  return {
    resolverVersion: ATTENTION_V3_RESOLVER_VERSION,
    model: createAttentionV3Model(base, uap)
  };
}

export function resolveAttentionV3Context(
  base: AttentionModelDefinition = defaultAttentionModel,
  scenario: AttentionScenario = defaultAttentionScenario,
  uap: AttentionUapModel = defaultAttentionV3Uap
): AttentionRuntimeContext {
  return { model: createAttentionV3Model(base, uap), scenario };
}

export function resolveAttentionV3SpatialContext(
  base: AttentionModelDefinition = defaultAttentionModel,
  scenario: AttentionScenario = defaultAttentionScenario,
  uap: AttentionUapModel = defaultAttentionV3Uap,
  spatial: AttentionSpatialModel = defaultAttentionV3Spatial
): AttentionRuntimeContext {
  return { model: createAttentionV3SpatialModel(base, uap, spatial), scenario };
}

export function resolveAttentionV3ArtilleryContext(
  base: AttentionModelDefinition = defaultAttentionModel,
  scenario: AttentionScenario = defaultAttentionScenario,
  uap: AttentionUapModel = defaultAttentionV3Uap,
  spatial: AttentionSpatialModel = defaultAttentionV3Spatial,
  artillery: AttentionArtilleryModel = defaultAttentionV3Artillery
): AttentionRuntimeContext {
  return { model: createAttentionV3ArtilleryModel(base, uap, spatial, artillery), scenario };
}
