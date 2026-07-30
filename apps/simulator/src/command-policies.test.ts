import { describe, expect, it } from "vitest";
import { comparePolicies, compositions } from "./command-policies.js";

// These are design assertions, not implementation details. They fail if the attention economy stops
// containing a decision — which is precisely the failure the attempt-bank pilot caught too late to
// be cheap. Tuning the rules is expected; tuning them until ignoring the fleet is fine is not.
const results = comparePolicies(compositions, 120);
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

  it("has no policy that is best regardless of fleet composition", () => {
    const winners = new Set(
      labels.map(
        (label) =>
          results
            .filter((entry) => entry.composition === label)
            .reduce((left, right) => (right.winRate > left.winRate ? right : left)).policy
      )
    );
    // A single policy winning everywhere would mean composition is decoration, which is the null
    // result the previous campaign already spent 19.4M matches discovering.
    expect(winners.size).toBeGreaterThan(1);
  });

  it("keeps unsound work costly: ignoring the fleet drifts more than inspecting it", () => {
    for (const label of labels) {
      expect(row(label, "accept-all").averageDrift, label).toBeGreaterThan(
        row(label, "verify-lowest-confidence").averageDrift
      );
    }
  });
});
