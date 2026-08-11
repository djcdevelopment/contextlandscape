import { describe, expect, it } from "vitest";
import { AttentionMatrixDraftSchema } from "@landscape/contracts";
import { runAttentionMatch } from "@landscape/engine";
import { createAttentionController } from "@landscape/simulator/attention-policies";
import {
  attentionCampaignRunCount,
  capacityAttentionVariants,
  createAttentionCampaignDraft,
  stationaryAttentionVariants,
  v3ArtilleryCausalPolicies,
  v3ArtilleryCausalVariants
} from "./attention-campaigns.js";

describe("attention campaign manifests", () => {
  it("freezes the approved stationary screening dimensions", () => {
    const draft = createAttentionCampaignDraft("stationary-train", { createdAt: "2026-08-09T00:00:00.000Z" });
    expect(AttentionMatrixDraftSchema.parse(draft)).toEqual(draft);
    expect(draft.matchups).toHaveLength(15);
    expect(draft.variants).toHaveLength(16);
    expect(attentionCampaignRunCount(draft)).toBe(480_000);
  });

  it("freezes the approved capacity and holdout dimensions", () => {
    const capacity = createAttentionCampaignDraft("capacity-train", { createdAt: "2026-08-09T00:00:00.000Z" });
    const holdout = createAttentionCampaignDraft("holdout", { createdAt: "2026-08-09T00:00:00.000Z" });
    expect(attentionCampaignRunCount(capacity)).toBe(144_000);
    expect(attentionCampaignRunCount(holdout)).toBe(50_000);
    expect(holdout.seedStart).toBe(9_000_000);
    expect(holdout.matchups.map((entry) => entry.matchupId)).toEqual([
      "gate-scout-specialization",
      "gate-siege-specialization",
      "gate-flare-drift",
      "gate-escort-efficiency",
      "gate-movement-value"
    ]);
  });

  it("freezes the five-drift artillery causal campaign at exactly 9.216M runs", () => {
    const draft = createAttentionCampaignDraft("v3-artillery-causal", { createdAt: "2026-08-10T00:00:00.000Z" });
    expect(AttentionMatrixDraftSchema.parse(draft)).toEqual(draft);
    expect(draft.schemaVersion).toBe(2);
    expect(draft.seedStart).toBe(30_000_000);
    expect(draft.seedsPerCell).toBe(320);
    expect(draft.matchups).toHaveLength(8);
    expect(v3ArtilleryCausalVariants).toHaveLength(36);
    expect(v3ArtilleryCausalPolicies).toHaveLength(10);
    expect(new Set(draft.variants.map((variant) => variant.model.rules.driftLimit))).toEqual(new Set([5]));
    expect(attentionCampaignRunCount(draft)).toBe(9_216_000);
    for (const scenarioId of ["static-front", "shifting-front", "escort-corridor", "flare-pocket"]) {
      const orientations = draft.matchups.filter((matchup) => matchup.scenarioId === scenarioId);
      expect(orientations).toHaveLength(2);
      expect(orientations[0].playerOneCompositionId).toBe(orientations[1].playerTwoCompositionId);
      expect(orientations[0].playerTwoCompositionId).toBe(orientations[1].playerOneCompositionId);
    }
  });

  it("stores resolved models for every declared factor level", () => {
    expect(stationaryAttentionVariants.find((variant) => variant.variantId === "recon-095")?.model.stationary.reconLock.calibration).toBe(0.95);
    expect(stationaryAttentionVariants.find((variant) => variant.variantId === "front-radius-2")?.scenarioOverrides?.frontRadius).toBe(2);
    expect(capacityAttentionVariants.find((variant) => variant.variantId === "no-macro-flare")?.model.capacity.macroFlare.maxUses).toBe(0);
    expect(capacityAttentionVariants.find((variant) => variant.variantId === "default")?.model.rules.objectiveTarget).toBe(24);
    expect(capacityAttentionVariants.find((variant) => variant.variantId === "no-capacity")?.model.capacity.slots[0].cost).toBe(1_000_000);
  });

  it("makes the named holdout flare treatment reachable and distinct from its control", () => {
    const draft = createAttentionCampaignDraft("holdout", {
      seedsPerCell: 50,
      createdAt: "2026-08-09T00:00:00.000Z"
    });
    const matchup = draft.matchups.find((entry) => entry.matchupId === "gate-flare-drift")!;
    const scenario = draft.scenarios.find((entry) => entry.scenarioId === matchup.scenarioId)!;
    const variant = draft.variants.find((entry) => entry.variantId === matchup.variantIds[0])!;
    const compositionOne = draft.compositions.find((entry) => entry.compositionId === matchup.playerOneCompositionId)!;
    const compositionTwo = draft.compositions.find((entry) => entry.compositionId === matchup.playerTwoCompositionId)!;
    const opponent = draft.policies.find((entry) => entry.policyId === matchup.playerTwoPolicyIds[0])!;
    const uses = new Map(matchup.playerOnePolicyIds.map((policyId) => [policyId, 0]));
    let overloaded = 0;
    for (let offset = 0; offset < draft.seedsPerCell; offset += 1) {
      for (const policyId of matchup.playerOnePolicyIds) {
        const policy = draft.policies.find((entry) => entry.policyId === policyId)!;
        const context = { model: variant.model, scenario };
        const result = runAttentionMatch({
          matchId: `${matchup.matchupId}:${policyId}:${offset}`,
          seed: draft.seedStart + offset,
          randomStreamId: matchup.scenarioId,
          context,
          players: [
            { playerId: "alpha", composition: compositionOne },
            { playerId: "bravo", composition: compositionTwo }
          ]
        }, {
          alpha: createAttentionController(policy, { ...context, playerId: "alpha" }),
          bravo: createAttentionController(opponent, { ...context, playerId: "bravo" })
        }, { traceMode: "summary" });
        uses.set(policyId, uses.get(policyId)! + result.summary.players.alpha.macroFlareUses);
        if (policyId === "capacity-follower-flare" &&
            result.summary.players.bravo.minimumAttentionToArtifactRatio < 0.25) overloaded += 1;
      }
    }
    expect(uses.get("capacity-follower-no-flare")).toBe(0);
    expect(uses.get("capacity-follower-flare")).toBeGreaterThan(0);
    expect(overloaded).toBeGreaterThan(0);
  });
});
