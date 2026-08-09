import { describe, expect, it } from "vitest";
import { AttentionV2ModelDefinitionSchema } from "@landscape/contracts";
import {
  type AttentionController,
  createAttentionMatch,
  defaultAttentionScenario,
  resolveAttentionV2Context,
  resolveAttentionV2Model,
  resolveAttentionCapacity,
  resolveAttentionMovement,
  runAttentionMatch
} from "./index.js";

const digest = "sha256:" + "a".repeat(64);

const model = AttentionV2ModelDefinitionSchema.parse({
  schemaVersion: 2,
  modelVersion: "duel-capacity-v2",
  modelId: "attention-v2-test-model",
  designRow: 0,
  role: "design",
  ruleShape: {
    attentionBudget: 4,
    verifyCost: 0,
    objectiveTarget: 24,
    driftLimit: 5,
    baseSoundness: 0.8,
    objectiveCoupling: "distance-weighted-front",
    throughputShape: "scout-forward",
    seizeCostShape: "polarized",
    calibrationSeparation: "polarized",
    movementSeparation: "scout-forward",
    stationaryQualification: "committed-streak",
    scoutStationaryPayload: "calibration-boost",
    lineStationaryPayload: "spatial-aura",
    siegeStationaryPayload: "claim-subsidy",
    capacityTopology: "pioneer-copy",
    abilityUnlockBasis: "global-rank",
    abilityPackage: "complete",
    unresolvedDisposition: "bounded-backlog"
  },
  ruleShapeHash: digest,
  resolverRequirement: "attention-v2",
  parentV1ModelHash: digest
});

const endOnlyController = (playerId: string): AttentionController => ({
  movement: () => [{ kind: "end-movement", playerId }],
  claim: () => ({ kind: "pass-capacity", playerId }),
  command: () => ({ kind: "end-command", playerId })
});

describe("duel-capacity-v2 resolver", () => {
  it("binds every rule shape to an executable v2 runtime model", () => {
    const resolved = resolveAttentionV2Model(model);
    expect(resolved.model.modelVersion).toBe("duel-capacity-v2");
    expect(resolved.model.extensions).toEqual({
      objectiveCoupling: "distance-weighted-front",
      stationaryQualification: "committed-streak",
      capacityTopology: "pioneer-copy",
      abilityUnlockBasis: "global-rank",
      abilityPackage: "complete",
      unresolvedDisposition: "bounded-backlog"
    });
    expect(resolved.model.rules.attentionPerRound).toBe(4);
    expect(resolved.model.chassis.scout.movementRange).toBe(4);
    expect(resolved.model.capacity.slots[3].cost).toBe(4);
  });

  it("runs through the existing deterministic reducer with v2 provenance intact", () => {
    const context = resolveAttentionV2Context(model, defaultAttentionScenario);
    const match = createAttentionMatch({
      matchId: "attention-v2-runtime-test",
      seed: 77,
      randomStreamId: "attention-v2-world-test",
      context
    });
    expect(match.state.modelVersion).toBe("duel-capacity-v2");
    const result = runAttentionMatch(match, {
      alpha: endOnlyController("alpha"),
      bravo: endOnlyController("bravo")
    }, { traceMode: "hash" });
    expect(result.match.state.status).toBe("complete");
    expect(result.traceHash).toMatch(/^sha256:/);
  });

  it("applies pioneer-copy capacity topology as a shared world rule", () => {
    const context = resolveAttentionV2Context(model);
    const match = createAttentionMatch({ matchId: "attention-v2-capacity-test", seed: 78, context });
    const moved = resolveAttentionMovement(match, [
      { kind: "end-movement", playerId: "alpha" },
      { kind: "end-movement", playerId: "bravo" }
    ]).match;
    const capacity = resolveAttentionCapacity(moved, [
      { kind: "claim-capacity", playerId: "alpha" },
      { kind: "claim-capacity", playerId: "bravo" }
    ]).match.state;
    expect(capacity.capacityTrack.nextSlot).toBe(1);
    expect(capacity.capacityTrack.claims).toHaveLength(2);
    expect(capacity.capacityTrack.claims.map((claim) => claim.attentionPaid)).toEqual([1, 0]);
  });
});
