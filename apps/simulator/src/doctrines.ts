import type { Order, ScenarioDefinition } from "@landscape/contracts";
import type { UnitComposition } from "@landscape/engine";

export type Doctrine = { name: string; orders: Order[]; composition?: UnitComposition };

export function order(unitId: string, action: Order["action"], fireMode: Order["fireMode"] = "semi"): Order {
  return { unitId, action, fireMode };
}

export function doctrines(scenario: ScenarioDefinition): Doctrine[] {
  switch (scenario.rulesProfile) {
    case "false_bottleneck":
      return [
        { name: "measure-then-send", orders: [order("scout-01", "scout", "single"), order("line-01", "implement"), order("line-01", "implement")] },
        { name: "optimize-visible-filter", orders: [order("line-01", "implement", "full"), order("line-01", "implement", "full")] }
      ];
    case "context_furnace":
      return [
        { name: "burst-cool-burst", orders: [order("line-01", "full_send", "full"), order("line-01", "consolidate"), order("line-01", "full_send", "semi")] },
        { name: "sustained-fire", orders: [order("line-01", "full_send", "full"), order("line-01", "full_send", "full"), order("line-01", "full_send", "full")] }
      ];
    case "documentation_fortress":
      return [
        { name: "one-useful-artifact", orders: [order("line-01", "build_contract"), order("line-01", "implement"), order("line-02", "review"), order("line-01", "implement")] },
        { name: "artifact-hoarding", orders: [order("line-01", "build_contract"), order("line-01", "build_contract"), order("line-02", "build_contract"), order("line-01", "review")] }
      ];
    default:
      return [
        { name: "scout-contract-doctrine", orders: [order("scout-01", "scout", "single"), order("line-01", "build_contract", "single"), order("line-01", "implement"), order("line-02", "review", "single"), order("line-01", "full_send", "full")] },
        // The siege chassis only exists in the player's force under `siege-heavy`; `siege-01` is
        // enemy-owned, so ordering it produces nothing but rejections.
        { name: "siege-first", composition: "siege-heavy", orders: [order("line-01", "full_send", "full"), order("line-02", "full_send", "full"), order("line-02", "implement", "full")] }
      ];
  }
}
