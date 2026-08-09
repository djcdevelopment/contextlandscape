import {
  AttentionMatrixDraftSchema,
  AttentionModelVariantSchema,
  AttentionScenarioSchema,
  type AttentionCampaignKind,
  type AttentionCoordinate,
  type AttentionMatrixDraft,
  type AttentionMatrixMatchup,
  type AttentionModelDefinition,
  type AttentionModelVariant,
  type AttentionScenario,
  type AttentionTraceMode
} from "@landscape/contracts";
import { attentionCompositions, defaultAttentionModel } from "@landscape/engine";
import { attentionPolicyPrograms } from "@landscape/simulator/attention-policies";

const MODEL_VERSION = "duel-capacity-v1" as const;

const commonSpawns = [
  { playerSlot: 1 as const, unitIndex: 0, position: { x: 1, y: 1 } },
  { playerSlot: 1 as const, unitIndex: 1, position: { x: 1, y: 2 } },
  { playerSlot: 1 as const, unitIndex: 2, position: { x: 2, y: 1 } },
  { playerSlot: 2 as const, unitIndex: 0, position: { x: 8, y: 8 } },
  { playerSlot: 2 as const, unitIndex: 1, position: { x: 8, y: 7 } },
  { playerSlot: 2 as const, unitIndex: 2, position: { x: 7, y: 8 } }
];

function mirroredFronts(playerOne: readonly AttentionCoordinate[], radius = 1) {
  if (playerOne.length !== 8) throw new Error("Attention scenarios require exactly eight front centers");
  return playerOne.flatMap((center, index) => [
    { round: index + 1, playerSlot: 1 as const, center, radius },
    { round: index + 1, playerSlot: 2 as const, center: { x: 9 - center.x, y: 9 - center.y }, radius }
  ]);
}

function scenario(scenarioId: string, playerOne: readonly AttentionCoordinate[]): AttentionScenario {
  const radius = scenarioId === "escort-corridor" ? 2 : 1;
  return AttentionScenarioSchema.parse({
    schemaVersion: 1,
    scenarioId,
    version: 1,
    board: { width: 10, height: 10, distanceMetric: "chebyshev", exclusiveOccupancy: true },
    roundLimit: 8,
    playerOrder: [1, 2],
    frontSchedule: mirroredFronts(playerOne, radius),
    spawns: commonSpawns,
    ...(scenarioId === "flare-pocket" ? { initialCapacitySlot: 2 } : {})
  });
}

const repeat = (coordinate: AttentionCoordinate): AttentionCoordinate[] =>
  Array.from({ length: 8 }, () => ({ ...coordinate }));

export const attentionCampaignScenarios: AttentionScenario[] = [
  scenario("static-front", repeat({ x: 2, y: 2 })),
  scenario("shifting-front", [
    { x: 2, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 3 },
    { x: 6, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 6 }, { x: 7, y: 6 }
  ]),
  scenario("escort-corridor", [
    { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
    { x: 6, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 }
  ]),
  scenario("flare-pocket", [
    { x: 2, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 3 },
    { x: 4, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 5 }
  ])
];

type VariantMutation = (model: AttentionModelDefinition) => void;

function modelVariant(
  variantId: string,
  factorLevels: Record<string, string | number | boolean>,
  mutate: VariantMutation = () => undefined,
  scenarioOverrides?: AttentionModelVariant["scenarioOverrides"]
): AttentionModelVariant {
  const model = structuredClone(defaultAttentionModel);
  mutate(model);
  return AttentionModelVariantSchema.parse({ variantId, factorLevels, model, ...(scenarioOverrides ? { scenarioOverrides } : {}) });
}

const disableFocus = (model: AttentionModelDefinition) => { model.capacity.perfectFocus.maxUses = 0; };
const disableOverclock = (model: AttentionModelDefinition) => { model.capacity.overclock.maxUses = 0; };
const disableFlare = (model: AttentionModelDefinition) => { model.capacity.macroFlare.maxUses = 0; };

export const stationaryAttentionVariants: AttentionModelVariant[] = [
  modelVariant("legacy-baseline", { baseline: true }, (model) => {
    model.rules.requireObjectiveRange = false;
    model.stationary.reconLock.calibration = model.chassis.scout.calibration;
    model.stationary.targetLock.tokensPerStationaryRound = 0;
    model.stationary.targetLock.thresholdRoundTokens = 0;
    model.stationary.targetLock.tokenCap = 0;
    model.stationary.commandUplink.attentionBonus = 0;
    model.stationary.commandUplink.calibration = model.chassis.siege.calibration;
    model.stationary.commandUplink.stackLimit = 0;
    model.capacity.slots.forEach((slot) => { slot.capacityAward = 0; });
    disableFocus(model); disableOverclock(model); disableFlare(model);
  }),
  modelVariant("default", { default: true }),
  modelVariant("no-front-relevance", { objectiveRange: false }, (model) => { model.rules.requireObjectiveRange = false; }),
  modelVariant("no-recon", { recon: false }, (model) => { model.stationary.reconLock.calibration = model.chassis.scout.calibration; }),
  modelVariant("no-target-lock", { targetLock: false }, (model) => {
    model.stationary.targetLock.tokensPerStationaryRound = 0;
    model.stationary.targetLock.thresholdRoundTokens = 0;
    model.stationary.targetLock.tokenCap = 0;
  }),
  modelVariant("no-uplink", { uplink: false }, (model) => {
    model.stationary.commandUplink.attentionBonus = 0;
    model.stationary.commandUplink.calibration = model.chassis.siege.calibration;
    model.stationary.commandUplink.stackLimit = 0;
  }),
  modelVariant("recon-075", { reconCalibration: 0.75 }, (model) => { model.stationary.reconLock.calibration = 0.75; }),
  modelVariant("recon-095", { reconCalibration: 0.95 }, (model) => { model.stationary.reconLock.calibration = 0.95; }),
  modelVariant("lock-range-3", { targetLockRange: 3 }, (model) => { model.stationary.targetLock.range = 3; }),
  modelVariant("lock-range-5", { targetLockRange: 5 }, (model) => { model.stationary.targetLock.range = 5; }),
  modelVariant("windfall-1", { lineWindfall: 1 }, (model) => { model.stationary.targetLock.thresholdRoundTokens = 1; }),
  modelVariant("windfall-3", { lineWindfall: 3 }, (model) => { model.stationary.targetLock.thresholdRoundTokens = 3; }),
  modelVariant("uplink-2", { uplinkAttention: 2 }, (model) => { model.stationary.commandUplink.attentionBonus = 2; }),
  modelVariant("siege-calibration-010", { siegeStationaryCalibration: 0.1 }, (model) => { model.stationary.commandUplink.calibration = 0.1; }),
  modelVariant("siege-calibration-030", { siegeStationaryCalibration: 0.3 }, (model) => { model.stationary.commandUplink.calibration = 0.3; }),
  modelVariant("front-radius-2", { frontRadius: 2 }, undefined, { frontRadius: 2 })
];

function capacityVariant(
  variantId: string,
  factorLevels: Record<string, string | number | boolean>,
  mutate: VariantMutation = () => undefined
): AttentionModelVariant {
  return modelVariant(variantId, factorLevels, (model) => {
    // Capacity claims and the follower abilities need at least three claim rounds to become observable.
    model.rules.objectiveTarget = 24;
    mutate(model);
  });
}

export const capacityAttentionVariants: AttentionModelVariant[] = [
  capacityVariant("default", { default: true }),
  capacityVariant("no-capacity", { capacity: false }, (model) => {
    model.capacity.slots.forEach((slot) => {
      slot.cost = 1_000_000;
      slot.capacityAward = 0;
    });
    disableFocus(model); disableOverclock(model); disableFlare(model);
  }),
  capacityVariant("no-perfect-focus", { perfectFocus: false }, disableFocus),
  capacityVariant("no-overclock", { overclock: false }, disableOverclock),
  capacityVariant("no-macro-flare", { macroFlare: false }, disableFlare),
  capacityVariant("flare-range-3", { flareRange: 3 }, (model) => { model.capacity.macroFlare.range = 3; }),
  capacityVariant("flare-range-5", { flareRange: 5 }, (model) => { model.capacity.macroFlare.range = 5; }),
  capacityVariant("flare-duration-1", { flareDuration: 1 }, (model) => { model.capacity.macroFlare.durationEmissions = 1; })
];

export const holdoutAttentionVariants: AttentionModelVariant[] = [
  modelVariant("default", { default: true }),
  capacityVariant("capacity-gate", { holdoutCapacityGate: true })
];

const stationaryPolicies = [
  "accept-all", "verify-lowest-confidence", "verify-arbitrary", "seize-cheapest",
  "front-mobile-verify", "recon-lock-reject", "line-escort-lock", "uplink-seize"
];
const capacityPolicies = ["capacity-ignore", "capacity-pioneer", "capacity-follower-overclock", "capacity-follower-flare"];
const capacityOpponents = ["verify-lowest-confidence", "front-mobile-verify", "capacity-pioneer"];

function assertPolicyIds(ids: readonly string[]): string[] {
  const available = new Set(attentionPolicyPrograms.map((policy) => policy.policyId));
  const missing = ids.filter((id) => !available.has(id));
  if (missing.length > 0) throw new Error(`Attention campaign references unavailable policies: ${missing.join(", ")}`);
  return [...ids];
}

function matchup(input: AttentionMatrixMatchup): AttentionMatrixMatchup {
  return input;
}

function stationaryMatchups(): AttentionMatrixMatchup[] {
  const scenarioIds = ["static-front", "shifting-front", "escort-corridor"];
  const compositionIds = ["scout-homogeneous", "line-homogeneous", "siege-homogeneous", "balanced", "escort"];
  return scenarioIds.flatMap((scenarioId) => compositionIds.map((compositionId) => matchup({
    matchupId: `${scenarioId}-${compositionId}`,
    scenarioId,
    playerOneCompositionId: compositionId,
    playerTwoCompositionId: "balanced",
    variantIds: stationaryAttentionVariants.map((variant) => variant.variantId),
    playerOnePolicyIds: assertPolicyIds(stationaryPolicies),
    playerTwoPolicyIds: assertPolicyIds(["front-mobile-verify"])
  })));
}

function capacityMatchups(): AttentionMatrixMatchup[] {
  return ["shifting-front", "flare-pocket"].flatMap((scenarioId) =>
    ["scout-homogeneous", "siege-homogeneous", "balanced"].map((compositionId) => matchup({
      matchupId: `${scenarioId}-${compositionId}`,
      scenarioId,
      playerOneCompositionId: compositionId,
      playerTwoCompositionId: "scout-homogeneous",
      variantIds: capacityAttentionVariants.map((variant) => variant.variantId),
      playerOnePolicyIds: assertPolicyIds(capacityPolicies),
      playerTwoPolicyIds: assertPolicyIds(capacityOpponents)
    }))
  );
}

function holdoutMatchups(): AttentionMatrixMatchup[] {
  type PairedInput = Omit<AttentionMatrixMatchup, "variantIds" | "playerTwoPolicyIds"> &
    Partial<Pick<AttentionMatrixMatchup, "variantIds" | "playerTwoPolicyIds">>;
  const paired = (input: PairedInput): AttentionMatrixMatchup => {
    const { variantIds, playerTwoPolicyIds, ...identity } = input;
    return {
      ...identity,
      variantIds: variantIds ?? ["default"],
      playerTwoPolicyIds: playerTwoPolicyIds ?? ["front-mobile-verify"]
    };
  };
  return [
    paired({ matchupId: "gate-scout-specialization", scenarioId: "shifting-front", playerOneCompositionId: "scout-homogeneous", playerTwoCompositionId: "siege-homogeneous", playerOnePolicyIds: assertPolicyIds(["verify-lowest-confidence", "recon-lock-reject"]) }),
    paired({ matchupId: "gate-siege-specialization", scenarioId: "static-front", playerOneCompositionId: "siege-homogeneous", playerTwoCompositionId: "siege-homogeneous", playerOnePolicyIds: assertPolicyIds(["verify-lowest-confidence", "uplink-seize"]) }),
    paired({ matchupId: "gate-flare-drift", scenarioId: "flare-pocket", playerOneCompositionId: "balanced", playerTwoCompositionId: "scout-homogeneous", variantIds: ["capacity-gate"], playerOnePolicyIds: assertPolicyIds(["capacity-follower-no-flare", "capacity-follower-flare"]) }),
    paired({ matchupId: "gate-escort-efficiency", scenarioId: "escort-corridor", playerOneCompositionId: "escort", playerTwoCompositionId: "balanced", playerOnePolicyIds: assertPolicyIds(["accept-all", "line-escort-lock"]) }),
    paired({ matchupId: "gate-movement-value", scenarioId: "shifting-front", playerOneCompositionId: "balanced", playerTwoCompositionId: "balanced", playerOnePolicyIds: assertPolicyIds(["verify-lowest-confidence", "front-mobile-verify"]) })
  ];
}

export type AttentionCampaignOptions = {
  matrixId?: string;
  seedStart?: number;
  seedsPerCell?: number;
  shardCount?: number;
  traceMode?: AttentionTraceMode;
  createdAt?: string;
};

export function createAttentionCampaignDraft(
  campaignKind: Exclude<AttentionCampaignKind, "custom">,
  options: AttentionCampaignOptions = {}
): AttentionMatrixDraft {
  const defaultSeeds = campaignKind === "holdout" ? 5000 : 250;
  const variants = campaignKind === "stationary-train" ? stationaryAttentionVariants
    : campaignKind === "capacity-train" ? capacityAttentionVariants
      : holdoutAttentionVariants;
  const matchups = campaignKind === "stationary-train" ? stationaryMatchups()
    : campaignKind === "capacity-train" ? capacityMatchups()
      : holdoutMatchups();
  const referencedScenarioIds = new Set(matchups.map((entry) => entry.scenarioId));
  const referencedCompositionIds = new Set(matchups.flatMap((entry) => [entry.playerOneCompositionId, entry.playerTwoCompositionId]));
  const policies = attentionPolicyPrograms.filter((policy) =>
    matchups.some((entry) => entry.playerOnePolicyIds.includes(policy.policyId) || entry.playerTwoPolicyIds.includes(policy.policyId))
  );
  return AttentionMatrixDraftSchema.parse({
    schemaVersion: 1,
    matrixId: options.matrixId ?? `attention-${campaignKind}-v1`,
    matrixKind: "attention-command",
    modelVersion: MODEL_VERSION,
    campaignKind,
    model: defaultAttentionModel,
    scenarios: attentionCampaignScenarios.filter((entry) => referencedScenarioIds.has(entry.scenarioId)),
    compositions: Object.values(attentionCompositions).filter((entry) => referencedCompositionIds.has(entry.compositionId)),
    variants,
    policies,
    matchups,
    seedStart: options.seedStart ?? (campaignKind === "holdout" ? 9_000_000 : 100_000),
    seedsPerCell: options.seedsPerCell ?? defaultSeeds,
    shardCount: options.shardCount ?? 12,
    traceMode: options.traceMode ?? "summary",
    createdAt: options.createdAt ?? new Date().toISOString()
  });
}

export function attentionCampaignRunCount(draft: AttentionMatrixDraft): number {
  return draft.matchups.reduce((sum, entry) => sum +
    entry.variantIds.length * entry.playerOnePolicyIds.length * entry.playerTwoPolicyIds.length * draft.seedsPerCell, 0);
}
