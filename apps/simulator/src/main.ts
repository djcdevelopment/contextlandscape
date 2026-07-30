import { createMatchState, runReplay } from "@landscape/engine";
import { scenarios } from "@landscape/scenarios";
import { doctrines } from "./doctrines.js";

const countArg = process.argv.find((value) => value.startsWith("--count="));
const requestedCount = Math.max(1, Number(countArg?.split("=")[1] ?? 25));
const scenarioArg = process.argv.find((value) => value.startsWith("--scenario="));
const selectedScenarios = scenarioArg ? scenarios.filter((scenario) => scenario.scenarioId === scenarioArg.split("=")[1]) : scenarios;

const report = selectedScenarios.map((scenario) => {
  const doctrineReports = doctrines(scenario).map((doctrine) => {
    let wins = 0;
    let totalProgress = 0;
    let totalEnergySpent = 0;
    let totalRejected = 0;
    for (let run = 0; run < requestedCount; run += 1) {
      const initial = createMatchState(`sim-${scenario.scenarioId}-${doctrine.name}-${run}`, "player", scenario.seed + run, scenario.scenarioId, doctrine.composition ?? "balanced");
      const result = runReplay(initial, doctrine.orders.map((item) => ({ orders: [item] })));
      if (result.state.status === "victory") wins += 1;
      totalProgress += result.state.objectiveProgress;
      totalEnergySpent += initial.commanderEnergy - result.state.commanderEnergy;
      totalRejected += result.events.filter((item) => item.eventType === "order.rejected").length;
    }
    return {
      doctrine: doctrine.name,
      runs: requestedCount,
      wins,
      winRate: Number((wins / requestedCount).toFixed(3)),
      averageProgress: Number((totalProgress / requestedCount).toFixed(2)),
      averageEnergySpent: Number((totalEnergySpent / requestedCount).toFixed(2)),
      rejectionRate: Number((totalRejected / (requestedCount * doctrine.orders.length)).toFixed(3))
    };
  });
  return { scenarioId: scenario.scenarioId, title: scenario.title, expectedLesson: scenario.expectedLesson, doctrines: doctrineReports };
});

console.log(JSON.stringify({ count: requestedCount, scenarios: report }, null, 2));
