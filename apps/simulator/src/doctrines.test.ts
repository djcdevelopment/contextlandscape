import { describe, expect, it } from "vitest";
import { createMatchState, runReplay } from "@landscape/engine";
import { scenarios } from "@landscape/scenarios";
import { doctrines } from "./doctrines.js";

// A doctrine that targets a unit the player does not own is rejected on every slot and silently
// contributes a zero-win row to every report. That is indistinguishable from a real balance result,
// so it is guarded here rather than left to a reader noticing a suspicious win rate.
describe("named doctrines are actually playable", () => {
  for (const scenario of scenarios) {
    for (const doctrine of doctrines(scenario)) {
      it(`${scenario.scenarioId} / ${doctrine.name} commands owned units and lands orders`, () => {
        const initial = createMatchState(
          `doctrine-check-${scenario.scenarioId}-${doctrine.name}`,
          "player",
          scenario.seed,
          scenario.scenarioId,
          doctrine.composition ?? "balanced"
        );
        const result = runReplay(initial, doctrine.orders.map((item) => ({ orders: [item] })));

        const unavailable = result.events.filter(
          (item) => item.eventType === "order.rejected" && (item.data as { reason?: string }).reason === "unit_unavailable"
        );
        expect(unavailable).toHaveLength(0);

        const accepted = result.events.filter(
          (item) => item.eventType !== "order.rejected" && item.eventType !== "fire_control.snapshot"
        );
        expect(accepted.length).toBeGreaterThan(0);
      });
    }
  }
});
