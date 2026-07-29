import { createGzip, createGunzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Order, RulesTuningInput, ScenarioDefinition, SimulationMatrix, SimulationRun } from "@mech/contracts";
import { SimulationMatrixSchema, SimulationRunSchema } from "@mech/contracts";
import { createMatchState, runReplay, type UnitComposition } from "@mech/engine";
import { scenarios } from "@mech/scenarios";

export const compositions: UnitComposition[] = ["balanced", "scout-heavy", "line-heavy", "siege-heavy"];

export type LabPolicy = { policyId: string; lessonPolicy: boolean; orders: Order[] };
export type LabOptions = {
  matrixId: string;
  scenarioIds: string[];
  runsPerCell: number;
  policyCount: number;
  tuningCount: number;
  seedStart: number;
  shardCount: number;
  shardIndex: number;
  outputDir: string;
  tuningOverrides: LabTuning[];
};
export type LabTuning = RulesTuningInput & { tuningId: string };

export function tuningChanges(tuningId: string): Record<string, unknown> {
  switch (tuningId) {
    case "energy-plus-one": return { startingCommanderEnergy: "scenario.startingCommanderEnergy + 1" };
    case "heat-minus-one": return { fullSendHeat: 1 };
    case "full-send-cheap": return { actionCostOverrides: { full_send: 1 } };
    case "full-send-expensive": return { actionCostOverrides: { full_send: 3 } };
    case "implement-cheap": return { actionCostOverrides: { implement: 0 } };
    default: return {};
  }
}

function order(unitId: string, action: Order["action"], fireMode: Order["fireMode"] = "semi"): Order {
  return { unitId, action, fireMode };
}

function basePolicies(scenario: ScenarioDefinition): LabPolicy[] {
  switch (scenario.rulesProfile) {
    case "false_bottleneck":
      return [
        { policyId: "lesson-measure-then-send", lessonPolicy: true, orders: [order("scout-01", "scout", "single"), order("line-01", "implement"), order("line-01", "build_contract")] },
        { policyId: "naive-optimize-visible-filter", lessonPolicy: false, orders: [order("line-01", "implement", "full"), order("line-01", "implement", "full"), order("line-01", "implement", "full")] }
      ];
    case "context_furnace":
      return [
        { policyId: "lesson-burst-cool-burst", lessonPolicy: true, orders: [order("line-01", "full_send", "full"), order("line-01", "consolidate"), order("line-01", "full_send", "semi")] },
        { policyId: "naive-sustained-fire", lessonPolicy: false, orders: [order("line-01", "full_send", "full"), order("line-01", "full_send", "full"), order("line-01", "full_send", "full")] }
      ];
    case "documentation_fortress":
      return [
        { policyId: "lesson-one-useful-artifact", lessonPolicy: true, orders: [order("line-01", "build_contract"), order("line-01", "implement"), order("line-02", "review"), order("line-01", "implement")] },
        { policyId: "naive-artifact-hoarding", lessonPolicy: false, orders: [order("line-01", "build_contract"), order("line-01", "build_contract"), order("line-02", "build_contract"), order("line-01", "review")] }
      ];
    default:
      return [
        { policyId: "lesson-scout-contract", lessonPolicy: true, orders: [order("scout-01", "scout", "single"), order("line-01", "build_contract", "single"), order("line-01", "implement"), order("line-02", "review", "single"), order("line-01", "full_send", "full")] },
        { policyId: "naive-siege-first", lessonPolicy: false, orders: [order("line-01", "full_send", "full"), order("line-02", "full_send", "full"), order("line-01", "implement", "full")] }
      ];
  }
}

const generatedActions: Order["action"][] = ["scout", "build_contract", "implement", "review", "defend", "full_send", "consolidate"];
const generatedUnits = ["scout-01", "line-01", "line-02"];
const generatedFireModes: Order["fireMode"][] = ["single", "semi", "full"];

function generatedPolicies(
  scenario: ScenarioDefinition,
  count: number,
  policyOverrides?: SimulationMatrix["policyOverrides"]
): LabPolicy[] {
  const policies = basePolicies(scenario);
  let state = scenario.seed >>> 0;
  const next = (limit: number) => {
    state = Math.imul(state ^ (state >>> 13), 1103515245) + 12345;
    return (state >>> 0) % limit;
  };
  if (policyOverrides?.length) {
    for (const policy of policyOverrides) {
      if (!policies.some((candidate) => candidate.policyId === policy.policyId)) {
        policies.push({ policyId: policy.policyId, lessonPolicy: policy.lessonPolicy, orders: policy.orders });
      }
    }
    const signature = (candidate: Order) => `${candidate.unitId}|${candidate.action}|${candidate.fireMode}`;
    const starts = policyOverrides.map((policy) => policy.orders[0]);
    const transitions = new Map<string, Order[]>();
    for (const policy of policyOverrides) {
      for (let index = 0; index + 1 < policy.orders.length; index += 1) {
        const key = signature(policy.orders[index]);
        const options = transitions.get(key) ?? [];
        options.push(policy.orders[index + 1]);
        transitions.set(key, options);
      }
    }
    while (policies.length < count) {
      const targetLength = 3 + next(5);
      const orders: Order[] = [{ ...starts[next(starts.length)] }];
      while (orders.length < targetLength) {
        const options = transitions.get(signature(orders.at(-1)!));
        if (!options?.length) break;
        orders.push({ ...options[next(options.length)] });
      }
      policies.push({
        policyId: `grammar-${String(policies.length).padStart(3, "0")}`,
        lessonPolicy: false,
        orders
      });
    }
    return policies.slice(0, count);
  }
  while (policies.length < count) {
    const length = 3 + next(5);
    const orders = Array.from({ length }, () => order(generatedUnits[next(generatedUnits.length)], generatedActions[next(generatedActions.length)], generatedFireModes[next(generatedFireModes.length)]));
    policies.push({ policyId: `generated-${String(policies.length).padStart(3, "0")}`, lessonPolicy: false, orders });
  }
  return policies.slice(0, count);
}

export function tuningSets(scenario: ScenarioDefinition, count: number, overrides?: LabTuning[]): LabTuning[] {
  if (overrides?.length) return overrides;
  const candidates: LabTuning[] = [
    { tuningId: "default" },
    { tuningId: "energy-plus-one", startingCommanderEnergy: scenario.startingCommanderEnergy + 1 },
    { tuningId: "heat-minus-one", fullSendHeat: 1 },
    { tuningId: "full-send-cheap", actionCostOverrides: { full_send: 1 } },
    { tuningId: "full-send-expensive", actionCostOverrides: { full_send: 3 } },
    { tuningId: "implement-cheap", actionCostOverrides: { implement: 0 } }
  ];
  return candidates.slice(0, Math.max(1, count));
}

export function applySeedPressure(scenario: ScenarioDefinition, tuning: LabTuning, seed: number): LabTuning {
  let state = seed >>> 0;
  const next = (limit: number) => {
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return (state >>> 0) % limit;
  };
  const baseEnergy = tuning.startingCommanderEnergy ?? scenario.startingCommanderEnergy;
  return {
    ...tuning,
    startingCommanderEnergy: Math.max(1, baseEnergy - next(2)),
    startingHeat: next(3),
    startingDispersion: next(3),
    startingConfidenceDrift: next(3)
  };
}

export function createMatrix(options: Partial<LabOptions> = {}): SimulationMatrix {
  const selected = options.scenarioIds?.length ? options.scenarioIds : scenarios.map((scenario) => scenario.scenarioId);
  return SimulationMatrixSchema.parse({
    schemaVersion: 1,
    matrixId: options.matrixId ?? `matrix-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    engineVersion: "0.2.0",
    scenarioIds: selected,
    compositionIds: compositions,
    tuningCount: options.tuningOverrides?.length ?? options.tuningCount ?? 1,
    tuningOverrides: options.tuningOverrides,
    policyCount: options.policyCount ?? 12,
    runsPerCell: options.runsPerCell ?? 25,
    seedStart: options.seedStart ?? 0,
    shardCount: options.shardCount ?? 1,
    createdAt: new Date().toISOString()
  });
}

export function runMatrix(matrix: SimulationMatrix, shardIndex: number, outputDir: string): SimulationRun[] {
  const selectedScenarios = scenarios.filter((scenario) => matrix.scenarioIds.includes(scenario.scenarioId));
  const records: SimulationRun[] = [];
  let ordinal = 0;
  for (const scenario of selectedScenarios) {
      for (const compositionId of matrix.compositionIds as UnitComposition[]) {
      for (const tuning of tuningSets(scenario, matrix.tuningCount, matrix.tuningOverrides)) {
        for (const policy of generatedPolicies(scenario, matrix.policyCount, matrix.policyOverrides)) {
          for (let run = 0; run < matrix.runsPerCell; run += 1) {
          if (ordinal % matrix.shardCount !== shardIndex) { ordinal += 1; continue; }
          const seed = scenario.seed + matrix.seedStart + run;
          const effectiveTuning = applySeedPressure(scenario, tuning, seed);
          const initial = createMatchState(`sim-${matrix.matrixId}-${ordinal}`, "player", seed, scenario.scenarioId, compositionId, effectiveTuning);
          const result = runReplay(initial, policy.orders.map((item) => ({ orders: [item] })));
          const actionCount = result.events.filter((item) => item.eventType !== "fire_control.snapshot" && item.eventType !== "order.rejected").length;
          const rejectedOrders = result.events.filter((item) => item.eventType === "order.rejected").length;
          records.push(SimulationRunSchema.parse({
            schemaVersion: 1,
            runId: `run-${matrix.matrixId}-${ordinal}`,
            matrixId: matrix.matrixId,
            scenarioId: scenario.scenarioId,
            scenarioVersion: scenario.version,
            engineVersion: result.manifest.engineVersion,
            seed,
            compositionId,
            tuningId: tuning.tuningId,
            startingCommanderEnergy: initial.commanderEnergy,
            startingHeat: initial.heat,
            startingDispersion: initial.dispersion,
            startingConfidenceDrift: initial.confidenceDrift,
            policyId: policy.policyId,
            lessonPolicy: policy.lessonPolicy,
            status: result.state.status,
            objectiveProgress: result.state.objectiveProgress,
            commanderEnergySpent: initial.commanderEnergy - result.state.commanderEnergy,
            heat: result.state.heat,
            dispersion: result.state.dispersion,
            rejectedOrders,
            actionCount,
            eventHash: result.manifest.eventHash,
            projectionHash: result.manifest.projectionHash
          }));
          ordinal += 1;
          }
        }
      }
    }
  }
  return records;
}

async function writeGzipLines(path: string, lines: string[]): Promise<void> {
  const output = createWriteStream(path);
  const gzip = createGzip();
  gzip.pipe(output);
  for (const line of lines) gzip.write(`${line}\n`);
  gzip.end();
  await once(output, "close");
}

export async function writeShard(matrix: SimulationMatrix, shardIndex: number, outputDir: string): Promise<string> {
  const matrixDir = `${outputDir}/${matrix.matrixId}`;
  await mkdir(matrixDir, { recursive: true });
  await writeFile(`${matrixDir}/manifest.json`, JSON.stringify(matrix, null, 2));
  const records = runMatrix(matrix, shardIndex, outputDir);
  const shardPath = `${matrixDir}/shard-${String(shardIndex).padStart(4, "0")}.jsonl.gz`;
  await writeGzipLines(shardPath, records.map((record) => JSON.stringify(record)));
  await writeFile(`${matrixDir}/shard-${String(shardIndex).padStart(4, "0")}.complete`, `${records.length}\n`);
  return shardPath;
}

export type CellReport = {
  scenarioId: string;
  compositionId: string;
  tuningId: string;
  policyId: string;
  lessonPolicy: boolean;
  runs: number;
  wins: number;
  winRate: number;
  winRate95: [number, number];
  averageProgress: number;
  averageEnergySpent: number;
  rejectionRate: number;
  averageHeat: number;
  averageDispersion: number;
};

export type PerspectiveComparison = {
  scenarioId: string;
  compositionId: string;
  tuningId: string;
  leftPolicyId: string;
  rightPolicyId: string;
  winRateDelta: number;
  energyDelta: number;
};

export type PressureSensitivity = {
  scenarioId: string;
  compositionId: string;
  tuningId: string;
  policyId: string;
  pressure: "startingCommanderEnergy" | "startingHeat" | "startingDispersion" | "startingConfidenceDrift";
  value: number;
  runs: number;
  winRate: number;
  averageProgress: number;
};

function interval95(wins: number, runs: number): [number, number] {
  if (!runs) return [0, 0];
  const p = wins / runs;
  const z = 1.96;
  const denominator = 1 + (z * z) / runs;
  const center = (p + (z * z) / (2 * runs)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) / runs) + (z * z) / (4 * runs * runs))) / denominator;
  return [Number(Math.max(0, center - margin).toFixed(3)), Number(Math.min(1, center + margin).toFixed(3))];
}

type AggregateReport = {
  cells: CellReport[];
  lessonSeparation: Array<{ scenarioId: string; compositionId: string; delta: number }>;
  paretoFrontier: CellReport[];
  pairwise: PerspectiveComparison[];
  pressureSensitivity: PressureSensitivity[];
};

type CellAccumulator = {
  scenarioId: string;
  compositionId: string;
  tuningId: string;
  policyId: string;
  lessonPolicy: boolean;
  runs: number;
  wins: number;
  objectiveProgress: number;
  commanderEnergySpent: number;
  rejectedOrders: number;
  heat: number;
  dispersion: number;
};

type PressureAccumulator = Omit<PressureSensitivity, "winRate" | "averageProgress"> & {
  wins: number;
  objectiveProgress: number;
};

function createRunAccumulator(): {
  add: (record: SimulationRun) => void;
  finish: () => AggregateReport;
  stats: { runs: number; matrixId: string };
} {
  const groups = new Map<string, CellAccumulator>();
  const pressureGroups = new Map<string, PressureAccumulator>();
  const pressureFields: PressureSensitivity["pressure"][] = ["startingCommanderEnergy", "startingHeat", "startingDispersion", "startingConfidenceDrift"];
  const stats = { runs: 0, matrixId: "unknown" };

  const add = (record: SimulationRun): void => {
    stats.runs += 1;
    if (stats.matrixId === "unknown") stats.matrixId = record.matrixId;

    const key = `${record.scenarioId}|${record.compositionId}|${record.tuningId}|${record.policyId}`;
    const group = groups.get(key) ?? {
      scenarioId: record.scenarioId,
      compositionId: record.compositionId,
      tuningId: record.tuningId,
      policyId: record.policyId,
      lessonPolicy: record.lessonPolicy,
      runs: 0,
      wins: 0,
      objectiveProgress: 0,
      commanderEnergySpent: 0,
      rejectedOrders: 0,
      heat: 0,
      dispersion: 0
    };
    group.runs += 1;
    group.wins += record.status === "victory" ? 1 : 0;
    group.objectiveProgress += record.objectiveProgress;
    group.commanderEnergySpent += record.commanderEnergySpent;
    group.rejectedOrders += record.rejectedOrders;
    group.heat += record.heat;
    group.dispersion += record.dispersion;
    groups.set(key, group);

    if (record.lessonPolicy || record.policyId.startsWith("naive-")) {
      for (const pressure of pressureFields) {
        const pressureValue = record[pressure];
        const pressureKey = `${key}|${pressure}|${pressureValue}`;
        const pressureGroup = pressureGroups.get(pressureKey) ?? {
          scenarioId: record.scenarioId,
          compositionId: record.compositionId,
          tuningId: record.tuningId,
          policyId: record.policyId,
          pressure,
          value: pressureValue,
          runs: 0,
          wins: 0,
          objectiveProgress: 0
        };
        pressureGroup.runs += 1;
        pressureGroup.wins += record.status === "victory" ? 1 : 0;
        pressureGroup.objectiveProgress += record.objectiveProgress;
        pressureGroups.set(pressureKey, pressureGroup);
      }
    }
  };

  const finish = (): AggregateReport => {
    const cells = [...groups.values()].map((group) => {
      const average = (total: number) => total / group.runs;
    return {
      scenarioId: group.scenarioId,
      compositionId: group.compositionId,
      tuningId: group.tuningId,
      policyId: group.policyId,
      lessonPolicy: group.lessonPolicy,
      runs: group.runs,
      wins: group.wins,
      winRate: Number((group.wins / group.runs).toFixed(3)),
      winRate95: interval95(group.wins, group.runs),
      averageProgress: Number(average(group.objectiveProgress).toFixed(2)),
      averageEnergySpent: Number(average(group.commanderEnergySpent).toFixed(2)),
      rejectionRate: Number(average(group.rejectedOrders).toFixed(2)),
      averageHeat: Number(average(group.heat).toFixed(2)),
      averageDispersion: Number(average(group.dispersion).toFixed(2))
    } satisfies CellReport;
  }).sort((a, b) => b.winRate - a.winRate || a.averageEnergySpent - b.averageEnergySpent);
    const lessonSeparation: Array<{ scenarioId: string; compositionId: string; delta: number }> = [];
    for (const scenarioId of [...new Set(cells.map((cell) => cell.scenarioId))]) {
      for (const compositionId of [...new Set(cells.filter((cell) => cell.scenarioId === scenarioId).map((cell) => cell.compositionId))]) {
        for (const tuningId of [...new Set(cells.filter((cell) => cell.scenarioId === scenarioId && cell.compositionId === compositionId).map((cell) => cell.tuningId))]) {
          const subset = cells.filter((cell) => cell.scenarioId === scenarioId && cell.compositionId === compositionId && cell.tuningId === tuningId);
          const lesson = subset.filter((cell) => cell.lessonPolicy);
          const other = subset.filter((cell) => !cell.lessonPolicy);
          if (lesson.length && other.length) lessonSeparation.push({ scenarioId, compositionId: `${compositionId}:${tuningId}`, delta: Number((lesson.reduce((sum, cell) => sum + cell.winRate, 0) / lesson.length - other.reduce((sum, cell) => sum + cell.winRate, 0) / other.length).toFixed(3)) });
        }
      }
    }
    const paretoFrontier = cells.filter((candidate) => !cells.some((other) =>
      other.scenarioId === candidate.scenarioId &&
      other.compositionId === candidate.compositionId &&
      other.tuningId === candidate.tuningId &&
      other.policyId !== candidate.policyId &&
      other.winRate >= candidate.winRate &&
      other.averageProgress >= candidate.averageProgress &&
      other.averageEnergySpent <= candidate.averageEnergySpent &&
      (other.winRate > candidate.winRate || other.averageProgress > candidate.averageProgress || other.averageEnergySpent < candidate.averageEnergySpent)
    ));
    const pairwise: PerspectiveComparison[] = [];
    const cellsByContext = new Map<string, CellReport[]>();
    for (const cell of cells) {
      const contextKey = `${cell.scenarioId}|${cell.compositionId}|${cell.tuningId}`;
      const context = cellsByContext.get(contextKey) ?? [];
      context.push(cell);
      cellsByContext.set(contextKey, context);
    }
    for (const subset of cellsByContext.values()) {
      for (const left of subset) for (const right of subset) if (left.policyId < right.policyId) {
        pairwise.push({
          scenarioId: left.scenarioId,
          compositionId: left.compositionId,
          tuningId: left.tuningId,
          leftPolicyId: left.policyId,
          rightPolicyId: right.policyId,
          winRateDelta: Number((left.winRate - right.winRate).toFixed(3)),
          energyDelta: Number((left.averageEnergySpent - right.averageEnergySpent).toFixed(2))
        });
      }
    }
    const pressureSensitivity = [...pressureGroups.values()].map((group) => ({
      scenarioId: group.scenarioId,
      compositionId: group.compositionId,
      tuningId: group.tuningId,
      policyId: group.policyId,
      pressure: group.pressure,
      value: group.value,
      runs: group.runs,
      winRate: Number((group.wins / group.runs).toFixed(3)),
      averageProgress: Number((group.objectiveProgress / group.runs).toFixed(2))
    }));
    return { cells, lessonSeparation, paretoFrontier, pairwise, pressureSensitivity };
  };

  return { add, finish, stats };
}

export function aggregateRuns(records: SimulationRun[]): AggregateReport {
  const accumulator = createRunAccumulator();
  for (const record of records) accumulator.add(record);
  return accumulator.finish();
}

async function* streamReportRecords(matrixDir: string): AsyncGenerator<SimulationRun> {
  const names = (await readdir(matrixDir)).filter((name) => name.endsWith(".jsonl.gz")).sort();
  for (const name of names) {
    const lines = createInterface({
      input: createReadStream(`${matrixDir}/${name}`).pipe(createGunzip()),
      crlfDelay: Infinity
    });
    for await (const line of lines) {
      if (line) yield SimulationRunSchema.parse(JSON.parse(line));
    }
  }
}

export async function readReportRecords(matrixDir: string): Promise<SimulationRun[]> {
  const records: SimulationRun[] = [];
  for await (const record of streamReportRecords(matrixDir)) records.push(record);
  return records;
}

export async function writeReport(matrixDir: string): Promise<string> {
  const accumulator = createRunAccumulator();
  for await (const record of streamReportRecords(matrixDir)) accumulator.add(record);
  const report = accumulator.finish();
  const recommendations = [...new Set(report.cells.map((cell) => `${cell.scenarioId}|${cell.tuningId}`))].map((key) => {
    const [scenarioId, tuningId] = key.split("|");
    const subset = report.cells.filter((cell) => cell.scenarioId === scenarioId && cell.tuningId === tuningId);
    const lesson = subset.filter((cell) => cell.lessonPolicy);
    const other = subset.filter((cell) => !cell.lessonPolicy);
    const lessonSeparation = lesson.length && other.length
      ? lesson.reduce((sum, cell) => sum + cell.winRate, 0) / lesson.length - other.reduce((sum, cell) => sum + cell.winRate, 0) / other.length
      : 0;
    const viablePolicies = subset.filter((cell) => cell.winRate >= 0.2 && cell.winRate <= 0.8).length;
    const dominancePenalty = Math.max(0, Math.max(...subset.map((cell) => cell.winRate), 0) - 0.95);
    return { scenarioId, tuningId, changes: tuningChanges(tuningId), score: Number((lessonSeparation + viablePolicies * 0.05 - dominancePenalty).toFixed(3)), lessonSeparation: Number(lessonSeparation.toFixed(3)), viablePolicies };
  }).sort((a, b) => b.score - a.score);
  const path = `${matrixDir}/report.json`;
  await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), runs: accumulator.stats.runs, ...report, recommendations }, null, 2));
  await writeFile(`${matrixDir}/candidate-patches.json`, JSON.stringify({ schemaVersion: 1, matrixId: accumulator.stats.matrixId, recommendations }, null, 2));
  return path;
}
