import { describe, expect, it } from "vitest";
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
