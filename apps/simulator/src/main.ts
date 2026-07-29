import type { Order, ScenarioDefinition } from "@mech/contracts";
import { createMatchState, runReplay } from "@mech/engine";
import { scenarios } from "@mech/scenarios";

type Doctrine = { name: string; orders: Order[] };

const countArg = process.argv.find((value) => value.startsWith("--count="));
const requestedCount = Math.max(1, Number(countArg?.split("=")[1] ?? 25));
const scenarioArg = process.argv.find((value) => value.startsWith("--scenario="));
const selectedScenarios = scenarioArg ? scenarios.filter((scenario) => scenario.scenarioId === scenarioArg.split("=")[1]) : scenarios;

function order(unitId: string, action: Order["action"], fireMode: Order["fireMode"] = "semi"): Order {
  return { unitId, action, fireMode };
}

function doctrines(scenario: ScenarioDefinition): Doctrine[] {
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
        { name: "siege-first", orders: [order("siege-01", "full_send", "full"), order("line-01", "full_send", "full"), order("line-02", "implement", "full")] }
      ];
  }
}

const report = selectedScenarios.map((scenario) => {
  const doctrineReports = doctrines(scenario).map((doctrine) => {
    let wins = 0;
    let totalProgress = 0;
    let totalEnergySpent = 0;
    for (let run = 0; run < requestedCount; run += 1) {
      const initial = createMatchState(`sim-${scenario.scenarioId}-${doctrine.name}-${run}`, "player", scenario.seed + run, scenario.scenarioId);
      const result = runReplay(initial, doctrine.orders.map((item) => ({ orders: [item] })));
      if (result.state.status === "victory") wins += 1;
      totalProgress += result.state.objectiveProgress;
      totalEnergySpent += initial.commanderEnergy - result.state.commanderEnergy;
    }
    return {
      doctrine: doctrine.name,
      runs: requestedCount,
      wins,
      winRate: Number((wins / requestedCount).toFixed(3)),
      averageProgress: Number((totalProgress / requestedCount).toFixed(2)),
      averageEnergySpent: Number((totalEnergySpent / requestedCount).toFixed(2))
    };
  });
  return { scenarioId: scenario.scenarioId, title: scenario.title, expectedLesson: scenario.expectedLesson, doctrines: doctrineReports };
});

console.log(JSON.stringify({ count: requestedCount, scenarios: report }, null, 2));
