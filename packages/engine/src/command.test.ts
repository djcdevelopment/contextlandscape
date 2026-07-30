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

  it("produces different work for different seeds", () => {
    const a = createCommandState("cmd-a", 1, [...fleet]);
    const b = createCommandState("cmd-b", 2, [...fleet]);
    expect(a.pending.map((x) => x.sound)).not.toEqual(b.pending.map((x) => x.sound));
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
