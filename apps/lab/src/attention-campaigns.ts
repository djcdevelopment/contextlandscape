import {
  AttentionMatrixDraftSchema,
  AttentionModelVariantSchema,
  AttentionPolicyProgramSchema,
  AttentionScenarioSchema,
  type AttentionCampaignKind,
  type AttentionCoordinate,
  type AttentionMatrixDraft,
  type AttentionMatrixMatchup,
  type AttentionModelDefinition,
  type AttentionModelVariant,
  type AttentionPolicyProgram,
  type AttentionScenario,
  type AttentionTraceMode
} from "@landscape/contracts";
import {
  attentionCompositions,
  createAttentionV3ArtilleryModel,
  createAttentionV3Model,
  createAttentionV3SpatialModel,
  defaultAttentionModel,
  defaultAttentionV3ArtilleryModel
} from "@landscape/engine";
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

function v3Variant(variantId: string, factorLevels: Record<string, string | number | boolean>): AttentionModelVariant {
  return AttentionModelVariantSchema.parse({
    variantId,
    factorLevels,
    model: structuredClone(defaultAttentionV3ArtilleryModel)
  });
}

export const v3AttentionVariants: AttentionModelVariant[] = [
  v3Variant("v3-static-front", { scenario: "static-front", mechanics: "uap-spatial-artillery" }),
  v3Variant("v3-shifting-front", { scenario: "shifting-front", mechanics: "uap-spatial-artillery" }),
  v3Variant("v3-escort-corridor", { scenario: "escort-corridor", mechanics: "uap-spatial-artillery" }),
  v3Variant("v3-flare-pocket", { scenario: "flare-pocket", mechanics: "uap-spatial-artillery" })
];

const causalStages = [
  { id: "a", mechanics: "uap", model: () => createAttentionV3Model() },
  { id: "b", mechanics: "uap-spatial", model: () => createAttentionV3SpatialModel() },
  { id: "c", mechanics: "uap-spatial-artillery", model: () => createAttentionV3ArtilleryModel() }
] as const;
const causalSoundness = [0.25, 0.5, 0.75, 0.95] as const;
const causalCouplings = ["binary-front", "global", "distance-weighted-front"] as const;

export const v3ArtilleryCausalVariants: AttentionModelVariant[] = causalStages.flatMap((stage) =>
  causalSoundness.flatMap((soundnessRate) => causalCouplings.map((objectiveCoupling) => {
    const model = stage.model();
    model.rules.driftLimit = 5;
    model.rules.soundnessRate = soundnessRate;
    model.extensions = {
      objectiveCoupling,
      stationaryQualification: "resolved-zero",
      capacityTopology: "shared-exclusive",
      abilityUnlockBasis: "personal-claim-count",
      abilityPackage: "complete",
      unresolvedDisposition: "auto-accept"
    };
    return AttentionModelVariantSchema.parse({
      variantId: `v3-${stage.id}-s${Math.round(soundnessRate * 100)}-${objectiveCoupling}`,
      factorLevels: {
        capabilityStage: stage.id.toUpperCase(),
        mechanics: stage.mechanics,
        soundnessRate,
        objectiveCoupling,
        driftLimit: 5
      },
      model
    });
  }))
);

const alwaysPass = (ruleId = "doctrine-pass", reasonCode = "doctrine-pass") => ({
  ruleId,
  when: [{ kind: "always" as const }],
  action: "pass" as const,
  reasonCode,
  targetBasis: "none" as const
});

function causalPolicy(
  policyId: string,
  label: string,
  uap: "hold" | "baseline-move" | "scout-recon" | "line-support" | "siege-uplink-range",
  command: "accept" | "local-verify",
  artilleryRules: NonNullable<AttentionPolicyProgram["v3Doctrine"]>["artilleryRules"] = [alwaysPass()]
): AttentionPolicyProgram {
  return AttentionPolicyProgramSchema.parse({
    schemaVersion: 1,
    policyId,
    label,
    movementRules: [],
    movementFallback: "hold",
    capacityStrategy: "never",
    commandRules: [],
    maxCommandActions: 64,
    v3Doctrine: { uap, command, artilleryRules }
  });
}

const flareRules = (
  ruleId: string,
  reasonCode: string,
  targetBasis: "enemy-formation-cluster" | "enemy-artifact-density" | "far-enemy-objective"
) => [{
  ruleId,
  when: [{ kind: "shell-available" as const, shell: "flare" as const }],
  action: "fire-flare" as const,
  reasonCode,
  targetBasis
}, alwaysPass(`${ruleId}-fallback`, "shell-unavailable")];

export const v3ArtilleryCausalPolicies: AttentionPolicyProgram[] = [
  causalPolicy("v3-control-accept-pass", "Accept / hold / pass control", "hold", "accept"),
  causalPolicy("v3-baseline-move-verify-pass", "Movement / local verify / pass baseline", "baseline-move", "local-verify"),
  causalPolicy("v3-scout-recon-pass", "Scout active recon / pass", "scout-recon", "local-verify"),
  causalPolicy("v3-line-support-pass", "Line step-up and Support Scan / pass", "line-support", "local-verify"),
  causalPolicy("v3-siege-uplink-range-pass", "Siege uplink and range shift / pass", "siege-uplink-range", "local-verify"),
  causalPolicy("v3-flare-cluster", "Flare enemy formation cluster", "baseline-move", "local-verify",
    flareRules("flare-enemy-cluster", "enemy-cluster", "enemy-formation-cluster")),
  causalPolicy("v3-flare-density", "Flare enemy artifact density", "baseline-move", "local-verify",
    flareRules("flare-enemy-density", "enemy-artifact-density", "enemy-artifact-density")),
  causalPolicy("v3-flare-far-objective", "Flare far enemy objective", "baseline-move", "local-verify",
    flareRules("flare-far-objective", "far-objective", "far-enemy-objective")),
  causalPolicy("v3-chaff-screen", "Chaff own formation against hostile Flare", "baseline-move", "local-verify", [{
    ruleId: "chaff-hostile-flare-screen",
    when: [{ kind: "shell-available", shell: "chaff" }, { kind: "hostile-flare-available" }],
    action: "fire-chaff",
    reasonCode: "hostile-flare-available",
    targetBasis: "own-formation-screen"
  }, alwaysPass("chaff-screen-fallback", "hostile-flare-unavailable")]),
  causalPolicy("v3-adaptive-artillery", "Adaptive public-exposure Chaff", "baseline-move", "local-verify", [{
    ruleId: "chaff-high-own-exposure",
    when: [
      { kind: "shell-available", shell: "chaff" },
      { kind: "hostile-flare-available" },
      { kind: "own-low-confidence-at-least", count: 4, confidenceAtMost: 0.5 }
    ],
    action: "fire-chaff",
    reasonCode: "high-own-exposure",
    targetBasis: "own-low-confidence-density"
  }, alwaysPass("adaptive-exposure-fallback", "exposure-below-trigger")])
];

const allAttentionPolicies = [...attentionPolicyPrograms, ...v3ArtilleryCausalPolicies];

// Keep the v3 shape screen at the frozen 9.216M budget: four scenario cells × 12×12
// policy pairings × 16,000 fresh seeds. The omitted legacy no-flare policy is redundant
// here because v3 artillery is supplied by the runtime adapter below.
const v3PolicyIds = attentionPolicyPrograms
  .map((policy) => policy.policyId)
  .filter((policyId) => policyId !== "capacity-follower-no-flare");

const stationaryPolicies = [
  "accept-all", "verify-lowest-confidence", "verify-arbitrary", "seize-cheapest",
  "front-mobile-verify", "recon-lock-reject", "line-escort-lock", "uplink-seize"
];
const capacityPolicies = ["capacity-ignore", "capacity-pioneer", "capacity-follower-overclock", "capacity-follower-flare"];
const capacityOpponents = ["verify-lowest-confidence", "front-mobile-verify", "capacity-pioneer"];

function assertPolicyIds(ids: readonly string[]): string[] {
  const available = new Set(allAttentionPolicies.map((policy) => policy.policyId));
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

function v3ShapeMatchups(): AttentionMatrixMatchup[] {
  const scenarios = ["static-front", "shifting-front", "escort-corridor", "flare-pocket"];
  return scenarios.map((scenarioId, index) => matchup({
    matchupId: `v3-${scenarioId}`,
    scenarioId,
    playerOneCompositionId: "balanced",
    playerTwoCompositionId: index % 2 === 0 ? "scout-homogeneous" : "siege-homogeneous",
    variantIds: [v3AttentionVariants[index].variantId],
    playerOnePolicyIds: assertPolicyIds(v3PolicyIds),
    playerTwoPolicyIds: assertPolicyIds(v3PolicyIds)
  }));
}

function v3ArtilleryCausalMatchups(): AttentionMatrixMatchup[] {
  const pairs = [
    ["static-front", "balanced", "siege-homogeneous"],
    ["shifting-front", "balanced", "scout-homogeneous"],
    ["escort-corridor", "escort", "balanced"],
    ["flare-pocket", "scout-homogeneous", "siege-homogeneous"]
  ] as const;
  const policyIds = v3ArtilleryCausalPolicies.map((policy) => policy.policyId);
  const variantIds = v3ArtilleryCausalVariants.map((variant) => variant.variantId);
  return pairs.flatMap(([scenarioId, compositionA, compositionB]) => [
    matchup({
      matchupId: `v3-causal-${scenarioId}-ab`, scenarioId,
      playerOneCompositionId: compositionA, playerTwoCompositionId: compositionB,
      variantIds, playerOnePolicyIds: policyIds, playerTwoPolicyIds: policyIds
    }),
    matchup({
      matchupId: `v3-causal-${scenarioId}-ba`, scenarioId,
      playerOneCompositionId: compositionB, playerTwoCompositionId: compositionA,
      variantIds, playerOnePolicyIds: policyIds, playerTwoPolicyIds: policyIds
    })
  ]);
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
  const defaultSeeds = campaignKind === "holdout" ? 5000
    : campaignKind === "v3-shape" ? 16000
      : campaignKind === "v3-artillery-causal" ? 320
        : 250;
  const variants = campaignKind === "stationary-train" ? stationaryAttentionVariants
    : campaignKind === "capacity-train" ? capacityAttentionVariants
      : campaignKind === "holdout" ? holdoutAttentionVariants
        : campaignKind === "v3-shape" ? v3AttentionVariants
          : v3ArtilleryCausalVariants;
  const matchups = campaignKind === "stationary-train" ? stationaryMatchups()
    : campaignKind === "capacity-train" ? capacityMatchups()
      : campaignKind === "holdout" ? holdoutMatchups()
        : campaignKind === "v3-shape" ? v3ShapeMatchups()
          : v3ArtilleryCausalMatchups();
  const referencedScenarioIds = new Set(matchups.map((entry) => entry.scenarioId));
  const referencedCompositionIds = new Set(matchups.flatMap((entry) => [entry.playerOneCompositionId, entry.playerTwoCompositionId]));
  const policies = allAttentionPolicies.filter((policy) =>
    matchups.some((entry) => entry.playerOnePolicyIds.includes(policy.policyId) || entry.playerTwoPolicyIds.includes(policy.policyId))
  );
  return AttentionMatrixDraftSchema.parse({
    schemaVersion: campaignKind === "v3-artillery-causal" ? 2 : 1,
    matrixId: options.matrixId ?? `attention-${campaignKind}-v1`,
    matrixKind: "attention-command",
    modelVersion: campaignKind === "v3-shape" || campaignKind === "v3-artillery-causal"
      ? defaultAttentionV3ArtilleryModel.modelVersion : MODEL_VERSION,
    campaignKind,
    model: campaignKind === "v3-shape" || campaignKind === "v3-artillery-causal"
      ? defaultAttentionV3ArtilleryModel : defaultAttentionModel,
    scenarios: attentionCampaignScenarios.filter((entry) => referencedScenarioIds.has(entry.scenarioId)),
    compositions: Object.values(attentionCompositions).filter((entry) => referencedCompositionIds.has(entry.compositionId)),
    variants,
    policies,
    matchups,
    seedStart: options.seedStart ?? (campaignKind === "holdout" ? 9_000_000
      : campaignKind === "v3-shape" ? 20_000_000
        : campaignKind === "v3-artillery-causal" ? 30_000_000
          : 100_000),
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
