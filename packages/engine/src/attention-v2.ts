import {
  AttentionModelDefinitionSchema,
  type AttentionModelDefinition,
  type AttentionRuntimeExtensions,
  type AttentionScenario,
  type AttentionV2ModelDefinition,
  type AttentionV2RuleShape
} from "@landscape/contracts";
import { defaultAttentionModel, defaultAttentionScenario, type AttentionRuntimeContext } from "./attention.js";

export const ATTENTION_V2_RESOLVER_VERSION = "attention-v2-resolver-1" as const;

export type AttentionV2ResolvedModel = {
  resolverVersion: typeof ATTENTION_V2_RESOLVER_VERSION;
  modelId: string;
  ruleShapeHash: string;
  model: AttentionModelDefinition;
};

const profileValues = {
  throughput: {
    flat: [2, 2, 2],
    v1: [3, 2, 1],
    "scout-forward": [4, 2, 1]
  },
  seizeCost: {
    flat: [2, 2, 2],
    v1: [1, 2, 3],
    polarized: [1, 3, 5]
  },
  calibration: {
    compressed: [0.45, 0.55, 0.65],
    v1: [0.2, 0.6, 0.9],
    polarized: [0.1, 0.55, 0.95]
  },
  movement: {
    flat: [2, 2, 2],
    v1: [3, 2, 1],
    "scout-forward": [4, 2, 1]
  }
} as const;

const chassis = ["scout", "line", "siege"] as const;

function extensionValues(shape: AttentionV2RuleShape): AttentionRuntimeExtensions {
  return {
    objectiveCoupling: shape.objectiveCoupling,
    stationaryQualification: shape.stationaryQualification,
    capacityTopology: shape.capacityTopology,
    abilityUnlockBasis: shape.abilityUnlockBasis,
    abilityPackage: shape.abilityPackage,
    unresolvedDisposition: shape.unresolvedDisposition
  };
}

function resolveModel(shape: AttentionV2RuleShape): AttentionModelDefinition {
  const source = structuredClone(defaultAttentionModel);
  const throughput = profileValues.throughput[shape.throughputShape];
  const seizeCost = profileValues.seizeCost[shape.seizeCostShape];
  const calibration = profileValues.calibration[shape.calibrationSeparation];
  const movement = profileValues.movement[shape.movementSeparation];
  const stationaryThreshold = shape.stationaryQualification === "committed-streak" ? 3 :
    shape.stationaryQualification === "voluntary-hold" ? 2 : 1;
  const scoutCalibration = shape.scoutStationaryPayload === "calibration-boost" ? 0.85 :
    shape.scoutStationaryPayload === "reveal" ? 0.65 : 0.45;
  const lineCalibration = shape.lineStationaryPayload === "spatial-aura" ? 0.9 :
    shape.lineStationaryPayload === "reveal-token" ? 0.6 : 0.2;
  const siegeBonus = shape.siegeStationaryPayload === "claim-subsidy" ? 2 :
    shape.siegeStationaryPayload === "bankable-reserve" ? 1 : 0;
  const capacityCosts = shape.capacityTopology === "pioneer-copy" ? [1, 2, 3, 4, 6] :
    shape.capacityTopology === "independent-tracks" ? [1, 2, 3, 5, 7] : [1, 2, 3, 5, 8];
  const capacityAwards = shape.capacityTopology === "pioneer-copy" ? [1, 1, 2, 4, 7] :
    shape.capacityTopology === "independent-tracks" ? [1, 1, 3, 5, 8] : [1, 1, 3, 5, 8];
  const abilityRanks = shape.abilityUnlockBasis === "global-rank" ? [2, 3, 4] : [1, 2, 3];
  const utilityOnly = shape.abilityPackage === "utility-only";

  const resolved = {
    ...source,
    modelVersion: "duel-capacity-v2" as const,
    rules: {
      ...source.rules,
      attentionPerRound: shape.attentionBudget,
      verifyCost: shape.verifyCost,
      objectiveTarget: shape.objectiveTarget,
      driftLimit: shape.driftLimit,
      soundnessRate: shape.baseSoundness,
      requireObjectiveRange: shape.objectiveCoupling !== "global"
    },
    chassis: Object.fromEntries(chassis.map((name, index) => [name, {
      ...source.chassis[name],
      throughput: throughput[index],
      seizeCost: seizeCost[index],
      calibration: calibration[index],
      movementRange: movement[index]
    }])) as AttentionModelDefinition["chassis"],
    stationary: {
      ...source.stationary,
      reconLock: { ...source.stationary.reconLock, calibration: scoutCalibration },
      targetLock: { ...source.stationary.targetLock, streakThreshold: stationaryThreshold },
      commandUplink: {
        ...source.stationary.commandUplink,
        attentionBonus: siegeBonus,
        calibration: lineCalibration
      }
    },
    capacity: {
      ...source.capacity,
      slots: source.capacity.slots.map((slot, index) => ({
        ...slot,
        cost: capacityCosts[index],
        capacityAward: capacityAwards[index]
      })),
      perfectFocus: { ...source.capacity.perfectFocus, unlockRank: abilityRanks[0] },
      overclock: {
        ...source.capacity.overclock,
        unlockRank: abilityRanks[1],
        maxUses: utilityOnly ? 0 : source.capacity.overclock.maxUses
      },
      macroFlare: {
        ...source.capacity.macroFlare,
        unlockRank: abilityRanks[2],
        maxUses: utilityOnly ? 0 : source.capacity.macroFlare.maxUses
      }
    },
    extensions: extensionValues(shape)
  };
  return AttentionModelDefinitionSchema.parse(resolved);
}

export function resolveAttentionV2Model(model: AttentionV2ModelDefinition): AttentionV2ResolvedModel {
  const parsed = model;
  return {
    resolverVersion: ATTENTION_V2_RESOLVER_VERSION,
    modelId: parsed.modelId,
    ruleShapeHash: parsed.ruleShapeHash,
    model: resolveModel(parsed.ruleShape)
  };
}

export function resolveAttentionV2Context(
  model: AttentionV2ModelDefinition,
  scenario: AttentionScenario = defaultAttentionScenario
): AttentionRuntimeContext {
  return { model: resolveAttentionV2Model(model).model, scenario };
}
