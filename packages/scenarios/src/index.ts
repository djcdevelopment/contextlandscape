import type { ScenarioDefinition } from "@mech/contracts";

export { gameplayLabById, gameplayLabs } from "./gameplay-labs.js";

export const twoBakedSlices: ScenarioDefinition = {
  scenarioId: "two-baked-slices",
  title: "The Two Baked Slices",
  version: 1,
  missionObjective: "Complete one verified cross-boundary transaction and survive a rollback drill.",
  mapWidth: 10,
  mapHeight: 10,
  lanes: ["discovery", "implementation", "integration"],
  knownTerrain: ["proven client slice", "proven service slice", "unverified boundary"],
  hiddenTruths: ["recipient, version, replay, and rollback contracts do not match"],
  startingCommanderEnergy: 6,
  artifactSlots: 4,
  victoryConditions: ["mission_progress >= 7", "rollback_verified = true"],
  failureConditions: ["eight slots elapsed", "commander energy exhausted before objective"],
  expectedLesson: "A scout and a contract depot can outperform a maximum-weight siege deployment.",
  difficulty: 1,
  seed: 20260729,
  falseLeads: ["full-send the boundary before scouting", "treat proven slices as shared contracts"],
  enemyDoctrine: "Exploit mismatched recipient, version, replay, and rollback assumptions.",
  availableMechs: ["scout", "line", "siege"],
  rulesProfile: "integration"
};

export const falseBottleneck: ScenarioDefinition = {
  scenarioId: "false-bottleneck",
  title: "The False Bottleneck",
  version: 1,
  missionObjective: "Identify the real throughput ceiling before spending force on the wrong subsystem.",
  mapWidth: 10,
  mapHeight: 10,
  lanes: ["measurement", "filtering", "send-path"],
  knownTerrain: ["dashboard reports filter latency", "send path is partially observed", "operator budget is finite"],
  hiddenTruths: ["send volume, not filtering, is the binding constraint"],
  startingCommanderEnergy: 6,
  artifactSlots: 4,
  victoryConditions: ["measurement_verified = true", "mission_progress >= 6"],
  failureConditions: ["optimize the false bottleneck twice", "commander energy exhausted"],
  expectedLesson: "Measure the system before optimizing the subsystem that looks busiest.",
  difficulty: 2,
  seed: 20260730,
  falseLeads: ["increase filtering capacity", "send the siege mech at the dashboard"],
  enemyDoctrine: "Feed telemetry that makes the visible bottleneck look causal.",
  availableMechs: ["scout", "line", "siege"],
  rulesProfile: "false_bottleneck"
};

export const contextFurnace: ScenarioDefinition = {
  scenarioId: "context-furnace",
  title: "The Context Furnace",
  version: 1,
  missionObjective: "Finish a nearly-complete objective without burning the commander's context window.",
  mapWidth: 10,
  mapHeight: 10,
  lanes: ["loaded context", "active session", "clean replacement"],
  knownTerrain: ["objective is nearly complete", "session age is high", "fresh spawn lane is available"],
  hiddenTruths: ["one more sustained burst causes context collapse"],
  startingCommanderEnergy: 7,
  artifactSlots: 3,
  victoryConditions: ["mission_progress >= 6", "heat <= 3"],
  failureConditions: ["heat >= 8", "context collapse before objective"],
  expectedLesson: "Consolidation or a clean replacement can beat one more maximal reasoning pass.",
  difficulty: 2,
  seed: 20260731,
  falseLeads: ["full-send because the objective is nearly done", "keep loading context into the same mech"],
  enemyDoctrine: "Force a choice between immediate pressure and a safe context reset.",
  availableMechs: ["line", "siege"],
  rulesProfile: "context_furnace"
};

export const documentationFortress: ScenarioDefinition = {
  scenarioId: "documentation-fortress",
  title: "The Documentation Fortress",
  version: 1,
  missionObjective: "Build only the structures that reduce the next three commander costs.",
  mapWidth: 10,
  mapHeight: 10,
  lanes: ["orientation", "decision record", "verification"],
  knownTerrain: ["several artifact sockets", "repeated orientation cost", "stale documentation hazard"],
  hiddenTruths: ["one durable artifact compounds while another freezes the map"],
  startingCommanderEnergy: 7,
  artifactSlots: 4,
  victoryConditions: ["mission_progress >= 7", "artifacts.length >= 1"],
  failureConditions: ["build three artifacts without moving the objective", "commander energy exhausted"],
  expectedLesson: "Infrastructure is valuable when it lowers future command cost, not when it merely accumulates.",
  difficulty: 3,
  seed: 20260732,
  falseLeads: ["build every available artifact", "treat stale documentation as authoritative"],
  enemyDoctrine: "Make documentation feel productive while preserving the original uncertainty.",
  availableMechs: ["scout", "line", "siege"],
  rulesProfile: "documentation_fortress"
};

export const scenarios = [twoBakedSlices, falseBottleneck, contextFurnace, documentationFortress];

export const scenarioById = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
