import { describe, expect, it } from "vitest";
import { bootstrapInterval, normalizedDrift, pairedDeltaInterval, wilsonInterval } from "./statistics.js";

describe("matrix statistics", () => {
  it("calculates Wilson bounds without leaving the probability range", () => {
    const interval = wilsonInterval(80, 100);
    expect(interval.estimate).toBe(0.8);
    expect(interval.lower).toBeGreaterThan(0.7);
    expect(interval.upper).toBeLessThan(0.9);
    expect(wilsonInterval(0, 10).lower).toBe(0);
    expect(wilsonInterval(10, 10).upper).toBe(1);
  });

  it("uses deterministic, label-separated bootstrap streams", () => {
    const samples = [1, 2, 3, 4, 5];
    const first = bootstrapInterval(samples, (values) => values.reduce((sum, value) => sum + value, 0) / values.length, "cell-a", 500);
    const second = bootstrapInterval(samples, (values) => values.reduce((sum, value) => sum + value, 0) / values.length, "cell-a", 500);
    expect(first).toEqual(second);
    expect(first.lower).toBeLessThan(first.estimate);
    expect(first.upper).toBeGreaterThan(first.estimate);
  });

  it("reports paired right-minus-left score deltas", () => {
    const interval = pairedDeltaInterval([
      { left: 0, right: 1 },
      { left: 0.5, right: 1 },
      { left: 0, right: 0.5 }
    ], "paired", 500);
    expect(interval.estimate).toBeCloseTo(2 / 3);
    expect(interval.lower).toBeGreaterThanOrEqual(0.5);
  });

  it("normalizes aggregate drift to the objective target", () => {
    expect(normalizedDrift(24, 3)).toBe(1.5);
    expect(normalizedDrift(0, 2)).toBe(24);
  });
});
