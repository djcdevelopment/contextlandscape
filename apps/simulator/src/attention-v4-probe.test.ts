import { describe, expect, it } from "vitest";
import { createAttentionV4ProbeContrasts, mergeAttentionV4PairedProbeReports, runAttentionV4PairedProbe } from "./attention-v4-probe.js";

describe("attention-v4 paired module probe", () => {
  it("defines exactly 27 one-module contrasts over all four compiler dimensions", () => {
    const contrasts = createAttentionV4ProbeContrasts();
    expect(contrasts).toHaveLength(27);
    expect(Object.fromEntries(["composition", "triage", "movement", "capacity"].map((dimension) => [
      dimension,
      contrasts.filter((contrast) => contrast.dimension === dimension).length
    ]))).toEqual({ composition: 4, triage: 9, movement: 7, capacity: 7 });
  });

  it("passes a bounded paired smoke with replay, stream, attribution, range, and shell gates", async () => {
    const contrasts = createAttentionV4ProbeContrasts();
    const reports = [];
    for (const parity of [0, 1]) {
      reports.push(runAttentionV4PairedProbe({ seedsPerCell: 1, contrasts: contrasts.filter((_, index) => index % 2 === parity) }));
      // Each deterministic shard is CPU-bound. Yield between them so the Vitest
      // worker can service its RPC heartbeat during the minute-long smoke gate.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const report = mergeAttentionV4PairedProbeReports(reports);
    expect(report.design).toMatchObject({ pairs: 216, matches: 432, replayEnabled: true });
    expect(report.gates).toEqual({
      dimensionsComplete: true,
      everyModuleEligible: true,
      everyModuleExecuted: true,
      everyModuleChangedPair: true,
      startingRangeDifferentials: true,
      shellChoiceDifferentials: true,
      zeroReplayMismatches: true,
      zeroStreamMismatches: true,
      zeroAttributionMismatches: true,
      passed: true
    });
    expect(report.reportHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  }, 120_000);
});
