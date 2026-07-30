import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "@landscape/engine";
import { aggregateRuns, createMatrix, runMatrix } from "./lab.js";

describe("synthetic balance lab", () => {
  it("produces deterministic, versioned matrix records", () => {
    const matrix = createMatrix({ matrixId: "test", scenarioIds: ["false-bottleneck"], runsPerCell: 2, policyCount: 4 });
    const first = runMatrix(matrix, 0, "data/lab");
    const second = runMatrix(matrix, 0, "data/lab");
    expect(first).toEqual(second);
    expect(first).toHaveLength(2 * 4 * 4);
    expect(first.every((record) => record.schemaVersion === 1 && record.engineVersion === ENGINE_VERSION)).toBe(true);
    expect(new Set(first.map((record) => record.projectionHash)).size).toBeGreaterThan(1);
  });

  it("reports lesson separation and confidence intervals", () => {
    const matrix = createMatrix({ matrixId: "test-report", scenarioIds: ["false-bottleneck"], runsPerCell: 3, policyCount: 3 });
    const report = aggregateRuns(runMatrix(matrix, 0, "data/lab"));
    expect(report.cells.length).toBe(12);
    expect(report.cells.every((cell) => cell.winRate95.length === 2)).toBe(true);
    expect(report.lessonSeparation).toHaveLength(4);
    expect(report.paretoFrontier.length).toBeGreaterThan(0);
    expect(report.pairwise.length).toBeGreaterThan(0);
    expect(report.pressureSensitivity.length).toBeGreaterThan(0);
  });

  it("runs an exported control-versus-selected tuning manifest", () => {
    const matrix = createMatrix({
      matrixId: "follow-up-test",
      scenarioIds: ["context-furnace"],
      runsPerCell: 1,
      policyCount: 2,
      shardCount: 1,
      tuningOverrides: [
        { tuningId: "control" },
        { tuningId: "selected-low-heat", fullSendHeat: 1 }
      ]
    });
    const records = runMatrix(matrix, 0, "data/lab");
    expect(matrix.tuningCount).toBe(2);
    expect(new Set(records.map((record) => record.tuningId))).toEqual(new Set(["control", "selected-low-heat"]));
    expect(records).toHaveLength(4 * 2 * 2);
  });

  it("uses reviewed doctrine seeds instead of unconstrained random policies", () => {
    const matrix = createMatrix({
      matrixId: "grammar-test",
      scenarioIds: ["context-furnace"],
      runsPerCell: 1,
      policyCount: 5,
      shardCount: 1
    });
    const reviewed = {
      ...matrix,
      policyOverrides: [{
        policyId: "human-plausible",
        lessonPolicy: false,
        orders: [
          { unitId: "line-01", action: "full_send" as const, fireMode: "full" as const },
          { unitId: "line-01", action: "consolidate" as const, fireMode: "semi" as const },
          { unitId: "line-01", action: "full_send" as const, fireMode: "semi" as const }
        ]
      }]
    };
    const policyIds = new Set(runMatrix(reviewed, 0, "data/lab").map((record) => record.policyId));
    expect(policyIds).toContain("human-plausible");
    expect([...policyIds].some((policyId) => policyId.startsWith("grammar-"))).toBe(true);
    expect([...policyIds].some((policyId) => policyId.startsWith("generated-"))).toBe(false);
  });
});
