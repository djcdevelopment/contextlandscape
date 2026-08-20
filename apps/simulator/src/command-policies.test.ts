import { describe, expect, it } from "vitest";
import { AttentionV4MatchStateSchema, type AttentionV4KineticAction } from "@landscape/contracts";
import {
  createAttentionV4Match,
  defaultAttentionV4Rules,
  resolveAttentionV4Artillery,
  resolveAttentionV4Kinetic,
  resolveAttentionV4Round,
  type AttentionV4Match
} from "@landscape/engine";
import { comparePolicies, compositions } from "./command-policies.js";

// These are design assertions, not implementation details. They fail if the attention economy stops
// containing a decision — which is precisely the failure the attempt-bank pilot caught too late to
// be cheap. Tuning the rules is expected; tuning them until ignoring the fleet is fine is not.
// Large enough that the properties asserted below sit many standard errors clear of noise; the
// smallest margin tested is ~0.17, and this runs in well under a second.
const results = comparePolicies(compositions, 400);
const labels = Object.keys(compositions);

function row(composition: string, policy: string) {
  return results.find((entry) => entry.composition === composition && entry.policy === policy)!;
}

describe("the attention economy contains a decision", () => {
  it("makes spending attention beat ignoring the fleet, in every composition", () => {
    for (const label of labels) {
      const baseline = row(label, "accept-all");
      const best = results
        .filter((entry) => entry.composition === label)
        .reduce((left, right) => (right.winRate > left.winRate ? right : left));
      expect(best.policy, label).not.toBe("accept-all");
      expect(best.winRate - baseline.winRate, `${label}: ${best.policy} over accept-all`).toBeGreaterThan(0.15);
    }
  });

  it("rewards reading the confidence signal over merely inspecting", () => {
    for (const label of labels) {
      const lowest = row(label, "verify-lowest-confidence");
      const arbitrary = row(label, "verify-arbitrary");
      const highest = row(label, "verify-highest-confidence");
      // Same attention spent three ways. If these tie, the reported confidence carries nothing and
      // the commander's read is not a skill.
      expect(lowest.winRate, `${label} lowest vs arbitrary`).toBeGreaterThan(arbitrary.winRate);
      expect(arbitrary.winRate, `${label} arbitrary vs highest`).toBeGreaterThan(highest.winRate);
    }
  });

  /*
   * Deliberately NOT asserted here: which policy wins each composition.
   *
   * The design goal is that no single policy is best regardless of fleet — a policy that wins
   * everywhere makes composition decoration, the null result the previous campaign spent 19.4M
   * matches discovering. At 2000 runs per cell `verify-lowest-confidence` does win all three, so the
   * goal is currently unmet and recorded in docs/IMPLEMENTED.md.
   *
   * It is not a test because it is not stable enough to be one. Its margin over `seize-cheapest` in
   * scout-heavy is 0.022, roughly 1.4 standard errors even at n=1000, so the winner flips with the
   * sample size — an earlier 120-run pass and a 200-run pass disagreed. Asserting either direction
   * would produce a test that fails at random, which is worse than no test.
   */

  it("keeps unsound work costly: ignoring the fleet drifts more than inspecting it", () => {
    for (const label of labels) {
      expect(row(label, "accept-all").averageDrift, label).toBeGreaterThan(
        row(label, "verify-lowest-confidence").averageDrift
      );
    }
  });
});

function v4Plans(match: AttentionV4Match, overrides: Record<string, AttentionV4KineticAction[]> = {}) {
  return match.state.units.map((unit) => ({ playerId: unit.ownerPlayerId, unitId: unit.unitId, actions: overrides[unit.unitId] ?? [] }));
}

function alter(match: AttentionV4Match, change: (state: AttentionV4Match["state"]) => void): AttentionV4Match {
  const state = structuredClone(match.state);
  change(state);
  return { state: AttentionV4MatchStateSchema.parse(state), rules: defaultAttentionV4Rules };
}

describe("attention-economy-v4 mandated causal cases", () => {
  it("Battery assistance is snapshotted once and never stacks", () => {
    let match = createAttentionV4Match({ matchId: "policy-battery", seed: 71 });
    match = alter(match, (state) => {
      state.phase = "command";
      state.command.activePlayerId = "alpha";
      state.units.forEach((unit) => { unit.outputDecision = "held"; });
      state.artifacts.push({
        artifactId: "battery-one", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line",
        position: { x: 1, y: 1 }, volumeIndex: 0, densityPct: 80, sourceCalibration: 0.85, effectiveCalibration: 0.68,
        sound: true, reportedConfidence: 0.7, verified: true, objectiveEligible: true, guarantee: null, guaranteedById: null,
        resolution: "pending", newbornRound: 1, age: 0, contextLimit: 2, localTraffic: 0, overTaxReasons: [], supportScanUnitIds: [],
        battery: { active: true, activatedRound: 1, suppressed: false }
      });
      state.artifacts.push({ ...structuredClone(state.artifacts[0]), artifactId: "battery-two", position: { x: 2, y: 1 } });
    });
    match = resolveAttentionV4Round(match).match;
    const scout = match.state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
    expect(scout.uap).toMatchObject({ base: 3, batteryBonus: 1, effective: 4 });
  });

  it("Scout Condense trades artifact volume for quality and must follow movement", () => {
    let match = createAttentionV4Match({ matchId: "policy-scout-condense", seed: 72 });
    match = alter(match, (state) => {
      const scout = state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
      scout.uap.batteryBonus = 1; scout.uap.effective = 4;
      state.units.find((unit) => unit.unitId === "alpha:line-1")!.position = { x: 1, y: 3 };
    });
    match = resolveAttentionV4Kinetic(match, v4Plans(match, {
      "alpha:scout-1": [{ kind: "move", destination: { x: 2, y: 2 } }, { kind: "move", destination: { x: 3, y: 2 } }, { kind: "condense-output" }, { kind: "condense-output" }]
    })).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.calibration).toBe(0.85);
    match = alter(match, (state) => { state.phase = "kinetic"; const scout = state.units[0]; scout.uap.spent = 0; scout.uap.effective = 3; scout.uap.batteryBonus = 0; });
    const interrupted = resolveAttentionV4Kinetic(match, v4Plans(match, {
      "alpha:scout-1": [{ kind: "condense-output" }, { kind: "move", destination: { x: 4, y: 2 } }]
    }));
    expect(interrupted.match.state.units[0].calibration).toBe(0.2);
    expect(interrupted.events.some((item) => item.eventType.endsWith("plan.rejected"))).toBe(true);
  });

  it("Drift Detonation cascade applies both owners' drift and paralysis before terminal evaluation", () => {
    let match = createAttentionV4Match({ matchId: "policy-detonation", seed: 73 });
    match = alter(match, (state) => {
      state.round = 2; state.phase = "command"; state.command.activePlayerId = "bravo";
      state.units.forEach((unit) => { unit.outputDecision = "held"; });
      for (const [index, owner] of ["alpha", "bravo"].entries()) {
        const source = `${owner}:scout-1`;
        const position = state.units.find((unit) => unit.unitId === source)!.position;
        state.artifacts.push({
          artifactId: `cascade-${owner}`, ownerPlayerId: owner, sourceUnitId: source, sourceChassis: "scout", position,
          volumeIndex: index, densityPct: 20, sourceCalibration: 0.2, effectiveCalibration: 0.04, sound: true,
          reportedConfidence: 0.5, verified: false, objectiveEligible: true, guarantee: null, guaranteedById: null,
          resolution: "pending", newbornRound: 1, age: 2, contextLimit: 1, localTraffic: 4,
          overTaxReasons: ["context-limit", "local-traffic"], supportScanUnitIds: [], battery: { active: false, activatedRound: null, suppressed: false }
        });
      }
    });
    const resolved = resolveAttentionV4Round(match);
    expect(resolved.match.state.players.map((player) => player.drift)).toEqual([2, 2]);
    expect(resolved.events.filter((item) => item.eventType === "attention.v4.artifact.detonated").map((item) => item.data.artifactId)).toEqual(["cascade-alpha", "cascade-bravo"]);
    expect([...new Set(resolved.match.state.units.filter((unit) => unit.uap.frozen).map((unit) => unit.ownerPlayerId))].sort()).toEqual(["alpha", "bravo"]);
  });

  it("counter-battery privilege is consumed or expires and retaliatory fire does not reset it", () => {
    let match = createAttentionV4Match({ matchId: "policy-counter-battery", seed: 74 });
    match = alter(match, (state) => { state.phase = "artillery"; state.capacityTrack.artilleryUnlocked = true; });
    const firstCards = match.state.players.map((player) => player.armory.cards.find((card) => card.shell === "emp")!);
    match = resolveAttentionV4Artillery(match, match.state.players.map((player, index) => ({ kind: "fire", playerId: player.playerId, cardId: firstCards[index].cardId, center: { x: index ? 1 : 8, y: index ? 1 : 8 } }))).match;
    expect(match.state.players.every((player) => player.armory.retaliationAvailable && player.armory.cooldown === 3)).toBe(true);
    match = alter(match, (state) => { state.phase = "artillery"; state.round = 2; });
    const alphaCard = match.state.players[0].armory.cards[0];
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: alphaCard.cardId, center: { x: 7, y: 7 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    expect(match.state.players[0].armory.retaliationAvailable).toBe(false);
    expect(match.state.players[1].armory.retaliationAvailable).toBe(false);
  });
});
