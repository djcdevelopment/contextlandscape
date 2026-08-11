import { describe, expect, it } from "vitest";
import {
  applyCommandAction,
  createCommandState,
  endCommandRound,
  projectCommand,
  resolveCommandRound
} from "./command.js";

const fleet = ["scout", "line", "siege"] as const;

function fresh(matchId = "cmd-test", seed = 41000) {
  return createCommandState(matchId, seed, [...fleet]);
}

describe("command round", () => {
  it("emits one artifact per point of throughput", () => {
    const state = fresh();
    expect(state.pending).toHaveLength(3 + 2 + 1);
    expect(new Set(state.pending.map((a) => a.artifactId)).size).toBe(6);
  });

  it("hides soundness until attention has been spent on it", () => {
    const state = fresh();
    expect(projectCommand(state).pending.every((a) => a.sound === null)).toBe(true);

    const target = state.pending[0].artifactId;
    const after = applyCommandAction(state, { verb: "verify", artifactId: target }).state;
    const seen = projectCommand(after).pending.find((a) => a.artifactId === target)!;
    expect(typeof seen.sound).toBe("boolean");
    // Verifying reveals; it does not resolve. Knowing is not deciding.
    expect(seen.resolution).toBe("pending");
  });

  it("refuses actions that exceed the attention budget", () => {
    const state = fresh();
    const siege = state.pending.find((a) => a.mechId.startsWith("siege"))!;
    let current = state;
    // Seizing from siege costs 3 of a 3-point budget, so a second paid action must be refused.
    current = applyCommandAction(current, { verb: "seize", artifactId: siege.artifactId }).state;
    expect(current.attention).toBe(0);

    const other = current.pending.find((a) => a.resolution === "pending")!;
    const blocked = applyCommandAction(current, { verb: "verify", artifactId: other.artifactId });
    expect(blocked.events.some((e) => e.eventType === "order.rejected" && e.data.reason === "attention")).toBe(true);
    expect(blocked.state.attention).toBe(0);
  });

  it("charges nothing for deciding, only for looking", () => {
    const state = fresh();
    const target = state.pending[0].artifactId;
    const accepted = applyCommandAction(state, { verb: "accept", artifactId: target }).state;
    expect(accepted.attention).toBe(state.attention);
  });

  it("accepts everything left unreviewed when the round closes", () => {
    const state = fresh();
    const closed = endCommandRound(state).state;
    // Six artifacts auto-accepted: each is either progress or drift, none simply vanishes.
    expect(closed.progress + closed.drift).toBe(6);
  });

  it("lets a rejected artifact cost progress without costing drift", () => {
    const state = fresh();
    let current = state;
    const target = current.pending[0].artifactId;
    current = applyCommandAction(current, { verb: "verify", artifactId: target }).state;
    current = applyCommandAction(current, { verb: "reject", artifactId: target }).state;
    const closed = endCommandRound(current).state;
    expect(closed.progress + closed.drift).toBe(5);
  });

  it("resolves identically for identical inputs", () => {
    const first = resolveCommandRound(fresh(), []);
    const second = resolveCommandRound(fresh(), []);
    expect(first.state).toEqual(second.state);
    expect(first.events).toEqual(second.events);
  });

  it("keeps latent work identical across policy-specific match ids", () => {
    const vector = (matchId: string) => createCommandState(matchId, 41000, [...fleet]).pending.map((artifact) => ({
      mechId: artifact.mechId,
      sound: artifact.sound,
      reportedConfidence: artifact.reportedConfidence
    }));

    expect(vector("cmd-verify-lowest-confidence-41000")).toEqual(vector("cmd-seize-cheapest-41000"));
  });

  it("produces uncorrelated work across seeds, at the configured soundness rate", () => {
    // Asserting that two specific seeds differ would be a coin flip: six draws at p=0.7 collide
    // (0.7^2 + 0.3^2)^6 = 3.8% of the time, so that test fails by chance roughly one run in 26.
    // Measure the distribution instead.
    let collisions = 0;
    let sound = 0;
    let total = 0;
    const trials = 1500;
    for (let seed = 0; seed < trials; seed += 1) {
      const left = createCommandState("cmd-a", seed, [...fleet]).pending.map((a) => a.sound);
      const right = createCommandState("cmd-b", seed + 1, [...fleet]).pending.map((a) => a.sound);
      if (left.join() === right.join()) collisions += 1;
      for (const value of left) { total += 1; if (value) sound += 1; }
    }
    expect(collisions / trials).toBeLessThan(0.08);
    expect(sound / total).toBeGreaterThan(0.66);
    expect(sound / total).toBeLessThan(0.74);
  });

  it("reaches a terminal state within the round limit", () => {
    let state = fresh();
    let guard = 0;
    while (state.status === "active" && guard < 100) {
      state = endCommandRound(state).state;
      guard += 1;
    }
    expect(state.status).not.toBe("active");
    expect(state.round).toBeLessThanOrEqual(state.rules.roundLimit);
  });

  // Regression: the uniform used to be raw FNV-1a over 2^32. Because FNV finishes by multiplying,
  // labels differing only in a trailing index barely move the high bits, so artifacts from one mech
  // in one round drew near-identical numbers and almost always shared a fate — 97.8% identical
  // against 37% expected. A fraction reads the high bits; only the avalanche step fixes that.
  it("draws independent soundness for artifacts from the same mech in the same round", () => {
    let identical = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed += 1) {
      const drawn = createCommandState(`indep-${seed}`, seed, ["scout"]).pending.map((a) => a.sound);
      if (drawn.every((value) => value === drawn[0])) identical += 1;
    }
    // Independent at p=0.7 over three draws gives 0.7^3 + 0.3^3 = 0.370.
    expect(identical / trials).toBeGreaterThan(0.28);
    expect(identical / trials).toBeLessThan(0.48);
  });

  it("reports confidence that tracks soundness for a calibrated mech and not for an uncalibrated one", () => {
    // Aggregated over many seeds: the signal is probabilistic, so a single artifact proves nothing.
    const gap = (chassis: "scout" | "siege") => {
      let sound = 0;
      let soundN = 0;
      let unsound = 0;
      let unsoundN = 0;
      for (let seed = 0; seed < 400; seed += 1) {
        for (const artifact of createCommandState(`c-${seed}`, seed, [chassis]).pending) {
          if (artifact.sound) { sound += artifact.reportedConfidence; soundN += 1; }
          else { unsound += artifact.reportedConfidence; unsoundN += 1; }
        }
      }
      return (sound / Math.max(1, soundN)) - (unsound / Math.max(1, unsoundN));
    };
    // siege is well calibrated (0.9), scout barely at all (0.2).
    expect(gap("siege")).toBeGreaterThan(gap("scout") * 2);
    expect(gap("siege")).toBeGreaterThan(0.3);
  });
});
