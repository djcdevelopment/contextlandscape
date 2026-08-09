import { createGzip, createGunzip } from "node:zlib";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { dirname, relative, resolve } from "node:path";
import type {
  BuildProvenance,
  ExperimentLedger,
  ExperimentLedgerEntry,
  Order,
  RulesTuningInput,
  ScenarioDefinition,
  SimulationMatrix,
  SimulationMatrixV1,
  SimulationMatrixV2,
  SimulationRun
} from "@landscape/contracts";
import {
  ExperimentLedgerEntrySchema,
  ExperimentLedgerSchema,
  SimulationMatrixSchema,
  SimulationMatrixV1Schema,
  SimulationMatrixV2Schema,
  SimulationRunSchema
} from "@landscape/contracts";
import { ENGINE_VERSION, createMatchState, runReplay, type UnitComposition } from "@landscape/engine";
import { scenarios } from "@landscape/scenarios";
import {
  assertCanonicalSource,
  canonicalJson,
  captureGitSource,
  hashManifest,
  sha256File,
  sha256Value,
  type Sha256Digest
} from "./provenance.js";

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
  canonical: boolean;
};
export type LabTuning = RulesTuningInput & { tuningId: string };

export type ProvenanceOptions = {
  canonical?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  repository?: string;
  imageDigest?: string;
  commandModelVersion?: string;
};

export type ShardCompletion = {
  schemaVersion: 1;
  matrixId: string;
  shardIndex: number;
  recordCount: number;
  shardHash: Sha256Digest;
  manifestHash: string | null;
  provenanceId: string | null;
};

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

export function createMatrix(options: Partial<LabOptions> = {}): SimulationMatrixV1 {
  const selected = options.scenarioIds?.length ? options.scenarioIds : scenarios.map((scenario) => scenario.scenarioId);
  return SimulationMatrixV1Schema.parse({
    schemaVersion: 1,
    matrixId: options.matrixId ?? `matrix-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    engineVersion: ENGINE_VERSION,
    scenarioIds: selected,
    compositionIds: compositions,
    tuningCount: options.tuningOverrides?.length ?? options.tuningCount ?? 1,
    ...(options.tuningOverrides ? { tuningOverrides: options.tuningOverrides } : {}),
    policyCount: options.policyCount ?? 12,
    runsPerCell: options.runsPerCell ?? 25,
    seedStart: options.seedStart ?? 0,
    shardCount: options.shardCount ?? 1,
    createdAt: new Date().toISOString()
  });
}

function policySetFor(matrix: SimulationMatrix): Array<{ scenarioId: string; policies: LabPolicy[] }> {
  return scenarios
    .filter((scenario) => matrix.scenarioIds.includes(scenario.scenarioId))
    .map((scenario) => ({
      scenarioId: scenario.scenarioId,
      policies: generatedPolicies(scenario, matrix.policyCount, matrix.policyOverrides)
    }));
}

function matrixModelFingerprints(matrix: SimulationMatrix, commandModelVersion: string) {
  const selectedScenarios = scenarios.filter((scenario) => matrix.scenarioIds.includes(scenario.scenarioId));
  const scenarioSetHash = sha256Value(selectedScenarios);
  const policySetHash = sha256Value(policySetFor(matrix));
  const modelHash = sha256Value({
    commandModelVersion,
    engineVersion: ENGINE_VERSION,
    scenarioSetHash
  });
  return { selectedScenarios, scenarioSetHash, policySetHash, modelHash };
}

/**
 * Upgrade an input/draft manifest into the immutable execution contract used by new campaigns.
 * Legacy manifests stay readable, but current code never executes one without first sealing it.
 */
export async function sealExecutionMatrix(
  input: SimulationMatrix,
  options: ProvenanceOptions = {}
): Promise<SimulationMatrixV2> {
  if (input.engineVersion !== ENGINE_VERSION) {
    throw new Error(`Matrix engine ${input.engineVersion} cannot run on engine ${ENGINE_VERSION}`);
  }
  if (input.schemaVersion === 2) {
    const expected = hashManifest(input);
    if (input.provenance.manifestHash !== expected) {
      throw new Error(`Matrix ${input.matrixId} manifest hash mismatch`);
    }
    const source = await captureGitSource({ cwd: options.cwd, env: options.env });
    if (input.provenance.canonical || options.canonical) {
      if (!input.provenance.canonical) throw new Error(`Matrix ${input.matrixId} is not canonical`);
      assertCanonicalSource(source);
    }
    if (source.available &&
      (source.sourceRevision !== input.provenance.sourceRevision || source.sourceTree !== input.provenance.sourceTree)) {
      throw new Error(`Matrix ${input.matrixId} does not match the current source revision`);
    }
    if (
      input.provenance.nodeVersion !== process.version ||
      input.provenance.platform !== process.platform ||
      input.provenance.architecture !== process.arch
    ) {
      throw new Error(`Matrix ${input.matrixId} does not match the current runtime`);
    }
    const runningImage = options.imageDigest ?? options.env?.LAB_IMAGE_DIGEST ?? process.env.LAB_IMAGE_DIGEST;
    if (input.provenance.imageDigest && !runningImage) {
      throw new Error(`Matrix ${input.matrixId} requires its pinned worker image digest`);
    }
    if (input.provenance.imageDigest && input.provenance.imageDigest !== runningImage) {
      throw new Error(`Matrix ${input.matrixId} does not match the current worker image`);
    }
    const fingerprints = matrixModelFingerprints(input, input.provenance.commandModelVersion);
    if (
      fingerprints.scenarioSetHash !== input.provenance.scenarioSetHash ||
      fingerprints.policySetHash !== input.provenance.policySetHash ||
      fingerprints.modelHash !== input.provenance.modelHash
    ) {
      throw new Error(`Matrix ${input.matrixId} does not match the current model, scenarios, or policies`);
    }
    return input;
  }

  const env = options.env ?? process.env;
  const canonical = options.canonical ?? false;
  const source = await captureGitSource({ cwd: options.cwd, env });
  if (canonical) assertCanonicalSource(source);
  const selectedScenarios = scenarios.filter((scenario) => input.scenarioIds.includes(scenario.scenarioId));
  if (selectedScenarios.length !== input.scenarioIds.length || new Set(input.scenarioIds).size !== input.scenarioIds.length) {
    const known = new Set(selectedScenarios.map((scenario) => scenario.scenarioId));
    throw new Error(`Matrix scenarios must be known and unique: ${input.scenarioIds.find((scenarioId) => !known.has(scenarioId)) ?? "duplicate id"}`);
  }
  if (input.compositionIds.some((compositionId) => !compositions.includes(compositionId as UnitComposition)) ||
      new Set(input.compositionIds).size !== input.compositionIds.length) {
    throw new Error("Matrix compositions must be known and unique");
  }
  const commandModelVersion = options.commandModelVersion ?? "scenario-engine-v1";
  const { scenarioSetHash, policySetHash, modelHash } = matrixModelFingerprints(input, commandModelVersion);
  const unavailableReason = source.available ? null : source.reason;
  const provenanceDraft: BuildProvenance = {
    provenanceVersion: 1,
    canonical,
    repository: options.repository ?? env.LAB_REPOSITORY ?? "djcdevelopment/contextlandscape",
    sourceRevision: source.available ? source.sourceRevision : `unavailable:${unavailableReason}`,
    sourceTree: source.available ? source.sourceTree : `unavailable:${unavailableReason}`,
    workspaceDirty: source.available ? source.workspaceDirty : true,
    engineVersion: ENGINE_VERSION,
    commandModelVersion,
    contractVersion: 1,
    modelHash,
    scenarioSetHash,
    policySetHash,
    manifestHash: "unsealed",
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    ...((options.imageDigest ?? env.LAB_IMAGE_DIGEST)
      ? { imageDigest: options.imageDigest ?? env.LAB_IMAGE_DIGEST }
      : {})
  };
  const draft = {
    ...input,
    schemaVersion: 2 as const,
    provenance: provenanceDraft
  };
  const sealed = {
    ...draft,
    provenance: { ...provenanceDraft, manifestHash: hashManifest(draft) }
  };
  return SimulationMatrixV2Schema.parse(sealed);
}

export async function createExecutionMatrix(
  options: Partial<LabOptions> = {},
  provenance: ProvenanceOptions = {}
): Promise<SimulationMatrixV2> {
  return sealExecutionMatrix(createMatrix(options), {
    ...provenance,
    canonical: provenance.canonical ?? options.canonical ?? false
  });
}

export function matrixProvenanceId(matrix: SimulationMatrix): string | null {
  return matrix.schemaVersion === 2 ? sha256Value(matrix.provenance) : null;
}

export function runMatrix(matrix: SimulationMatrix, shardIndex: number, outputDir: string): SimulationRun[] {
  if (matrix.engineVersion !== ENGINE_VERSION) {
    throw new Error(`Matrix engine ${matrix.engineVersion} cannot run on engine ${ENGINE_VERSION}`);
  }
  if (matrix.schemaVersion === 2 && matrix.provenance.manifestHash !== hashManifest(matrix)) {
    throw new Error(`Matrix ${matrix.matrixId} manifest hash mismatch`);
  }
  const selectedScenarios = scenarios.filter((scenario) => matrix.scenarioIds.includes(scenario.scenarioId));
  const records: SimulationRun[] = [];
  const provenanceId = matrixProvenanceId(matrix);
  const manifestHash = matrix.schemaVersion === 2 ? matrix.provenance.manifestHash : null;
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
            ...(provenanceId ? { provenanceId } : {}),
            ...(manifestHash ? { manifestHash } : {}),
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

export function resolveMatrixDirectory(outputDir: string, matrixId: string): string {
  const root = resolve(outputDir);
  const target = resolve(root, matrixId);
  const withinRoot = relative(root, target);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(matrixId) || withinRoot.startsWith("..") || resolve(root, withinRoot) !== target) {
    throw new Error(`Unsafe matrix id: ${matrixId}`);
  }
  return target;
}

async function readMatrixManifest(path: string): Promise<SimulationMatrix> {
  return SimulationMatrixSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** Write once, then require byte-equivalent canonical content from every shard. */
export async function ensureMatrixManifest(matrix: SimulationMatrix, outputDir: string): Promise<string> {
  const matrixDir = resolveMatrixDirectory(outputDir, matrix.matrixId);
  await mkdir(matrixDir, { recursive: true });
  const path = resolve(matrixDir, "manifest.json");
  try {
    await writeFile(path, `${JSON.stringify(matrix, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readMatrixManifest(path);
    if (canonicalJson(existing) !== canonicalJson(matrix)) {
      throw new Error(`Matrix ${matrix.matrixId} already has a different frozen manifest`);
    }
  }
  return path;
}

export async function writeShard(matrix: SimulationMatrix, shardIndex: number, outputDir: string): Promise<string> {
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= matrix.shardCount) {
    throw new Error(`shard must be between 0 and ${matrix.shardCount - 1}`);
  }
  const matrixDir = resolveMatrixDirectory(outputDir, matrix.matrixId);
  await ensureMatrixManifest(matrix, outputDir);
  const records = runMatrix(matrix, shardIndex, outputDir);
  const stem = `shard-${String(shardIndex).padStart(4, "0")}`;
  const shardPath = resolve(matrixDir, `${stem}.jsonl.gz`);
  const partialPath = resolve(matrixDir, `${stem}.${process.pid}.${randomUUID()}.partial`);
  await writeGzipLines(partialPath, records.map((record) => JSON.stringify(record)));
  await rename(partialPath, shardPath);
  const completion: ShardCompletion = {
    schemaVersion: 1,
    matrixId: matrix.matrixId,
    shardIndex,
    recordCount: records.length,
    shardHash: await sha256File(shardPath),
    manifestHash: matrix.schemaVersion === 2 ? matrix.provenance.manifestHash : null,
    provenanceId: matrixProvenanceId(matrix)
  };
  await writeFile(resolve(matrixDir, `${stem}.complete`), `${JSON.stringify(completion, null, 2)}\n`);
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

export type VerifiedMatrixArtifacts = {
  matrix: SimulationMatrix;
  matrixDir: string;
  shardNames: string[];
  completions: Map<string, ShardCompletion>;
};

function expectedShardRecordCount(matrix: SimulationMatrix, shardIndex: number): number {
  const total = scenarios
    .filter((scenario) => matrix.scenarioIds.includes(scenario.scenarioId))
    .reduce((sum, scenario) => sum +
      matrix.compositionIds.length *
      tuningSets(scenario, matrix.tuningCount, matrix.tuningOverrides).length *
      generatedPolicies(scenario, matrix.policyCount, matrix.policyOverrides).length *
      matrix.runsPerCell, 0);
  return shardIndex >= total ? 0 : Math.floor((total - 1 - shardIndex) / matrix.shardCount) + 1;
}

export async function verifyMatrixArtifacts(matrixDirInput: string): Promise<VerifiedMatrixArtifacts> {
  const matrixDir = resolve(matrixDirInput);
  const matrix = await readMatrixManifest(resolve(matrixDir, "manifest.json"));
  if (matrix.schemaVersion === 2 && matrix.provenance.manifestHash !== hashManifest(matrix)) {
    throw new Error(`Matrix ${matrix.matrixId} manifest hash mismatch`);
  }
  const names = await readdir(matrixDir);
  const shardNames = names.filter((name) => /^shard-\d{4}\.jsonl\.gz$/.test(name)).sort();
  const completions = new Map<string, ShardCompletion>();
  if (matrix.schemaVersion === 1 && shardNames.length === 0) {
    throw new Error(`Legacy matrix ${matrix.matrixId} has no shards`);
  }
  if (matrix.schemaVersion === 2) {
    const expected = Array.from({ length: matrix.shardCount }, (_, index) => `shard-${String(index).padStart(4, "0")}.jsonl.gz`);
    if (canonicalJson(shardNames) !== canonicalJson(expected)) {
      throw new Error(`Matrix ${matrix.matrixId} does not have exactly ${matrix.shardCount} shards`);
    }
    const expectedProvenanceId = matrixProvenanceId(matrix);
    for (let index = 0; index < matrix.shardCount; index += 1) {
      const stem = `shard-${String(index).padStart(4, "0")}`;
      const markerPath = resolve(matrixDir, `${stem}.complete`);
      let marker: ShardCompletion;
      try {
        marker = JSON.parse(await readFile(markerPath, "utf8")) as ShardCompletion;
      } catch {
        throw new Error(`Matrix ${matrix.matrixId} has an invalid completion marker for shard ${index}`);
      }
      const shardPath = resolve(matrixDir, `${stem}.jsonl.gz`);
      if (
        marker.schemaVersion !== 1 ||
        marker.matrixId !== matrix.matrixId ||
        marker.shardIndex !== index ||
        marker.recordCount !== expectedShardRecordCount(matrix, index) ||
        marker.manifestHash !== matrix.provenance.manifestHash ||
        marker.provenanceId !== expectedProvenanceId ||
        marker.shardHash !== await sha256File(shardPath)
      ) {
        throw new Error(`Matrix ${matrix.matrixId} failed integrity checks for shard ${index}`);
      }
      completions.set(`${stem}.jsonl.gz`, marker);
    }
  }
  return { matrix, matrixDir, shardNames, completions };
}

async function* streamReportRecords(artifacts: VerifiedMatrixArtifacts): AsyncGenerator<SimulationRun> {
  const expectedProvenanceId = matrixProvenanceId(artifacts.matrix);
  for (const name of artifacts.shardNames) {
    let recordCount = 0;
    const lines = createInterface({
      input: createReadStream(resolve(artifacts.matrixDir, name)).pipe(createGunzip()),
      crlfDelay: Infinity
    });
    for await (const line of lines) {
      if (!line) continue;
      const record = SimulationRunSchema.parse(JSON.parse(line));
      if (record.matrixId !== artifacts.matrix.matrixId || record.engineVersion !== artifacts.matrix.engineVersion) {
        throw new Error(`Shard ${name} contains a record from a different matrix or engine`);
      }
      if (
        artifacts.matrix.schemaVersion === 2 &&
        (record.manifestHash !== artifacts.matrix.provenance.manifestHash || record.provenanceId !== expectedProvenanceId)
      ) {
        throw new Error(`Shard ${name} contains a record with different provenance`);
      }
      recordCount += 1;
      yield record;
    }
    const completion = artifacts.completions.get(name);
    if (completion && completion.recordCount !== recordCount) {
      throw new Error(`Shard ${name} record count does not match its completion marker`);
    }
  }
}

export async function readReportRecords(matrixDir: string): Promise<SimulationRun[]> {
  const records: SimulationRun[] = [];
  const artifacts = await verifyMatrixArtifacts(matrixDir);
  for await (const record of streamReportRecords(artifacts)) records.push(record);
  return records;
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

async function writeImmutableJson(path: string, value: unknown): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (canonicalJson(existing) !== canonicalJson(value)) {
      throw new Error(`Historical evidence already exists with different content: ${path}`);
    }
  }
}

async function writeReportSidecars(
  artifacts: VerifiedMatrixArtifacts,
  reportDocument: Record<string, unknown> & { reportHash: string; recommendations: unknown[]; runs: number; generatedAt: string }
): Promise<void> {
  const manifestHash = artifacts.matrix.schemaVersion === 2 ? artifacts.matrix.provenance.manifestHash : null;
  const provenance = artifacts.matrix.schemaVersion === 2 ? artifacts.matrix.provenance : null;
  await writeAtomicJson(resolve(artifacts.matrixDir, "candidate-patches.json"), {
    schemaVersion: 2,
    matrixId: artifacts.matrix.matrixId,
    manifestHash,
    provenance,
    sourceReportHash: reportDocument.reportHash,
    recommendations: reportDocument.recommendations
  });
  const ledgerEntry: ExperimentLedgerEntry = {
    schemaVersion: 1,
    matrixId: artifacts.matrix.matrixId,
    createdAt: artifacts.matrix.createdAt,
    completedAt: reportDocument.generatedAt,
    stage: "exploratory",
    sourceRevision: provenance?.sourceRevision ?? "unavailable:legacy-v1",
    modelHash: provenance?.modelHash ?? "unavailable:legacy-v1",
    manifestHash: manifestHash ?? "unavailable:legacy-v1",
    reportHash: reportDocument.reportHash,
    manifestPath: resolve(artifacts.matrixDir, "manifest.json"),
    reportPath: resolve(artifacts.matrixDir, "report.json"),
    runs: reportDocument.runs
  };
  await writeAtomicJson(resolve(artifacts.matrixDir, "provenance-record.json"), ledgerEntry);
}

export async function writeReport(matrixDir: string): Promise<string> {
  const artifacts = await verifyMatrixArtifacts(matrixDir);
  const path = resolve(artifacts.matrixDir, "report.json");
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (artifacts.matrix.schemaVersion === 1) return path;
    const { reportHash, ...hashable } = existing;
    if (
      typeof reportHash === "string" &&
      reportHash === sha256Value(hashable) &&
      existing.manifestHash === artifacts.matrix.provenance.manifestHash &&
      existing.runs === [...artifacts.completions.values()].reduce((sum, marker) => sum + marker.recordCount, 0) &&
      canonicalJson(existing.shards) === canonicalJson([...artifacts.completions.values()])
    ) {
      await writeReportSidecars(artifacts, existing as Record<string, unknown> & {
        reportHash: string; recommendations: unknown[]; runs: number; generatedAt: string;
      });
      return path;
    }
    throw new Error(`Matrix ${artifacts.matrix.matrixId} already has a report that failed integrity checks`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const accumulator = createRunAccumulator();
  for await (const record of streamReportRecords(artifacts)) accumulator.add(record);
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
  const generatedAt = new Date().toISOString();
  const reportDraft = {
    schemaVersion: artifacts.matrix.schemaVersion === 2 ? 2 : 1,
    matrixId: artifacts.matrix.matrixId,
    engineVersion: artifacts.matrix.engineVersion,
    manifestHash: artifacts.matrix.schemaVersion === 2 ? artifacts.matrix.provenance.manifestHash : null,
    provenance: artifacts.matrix.schemaVersion === 2 ? artifacts.matrix.provenance : null,
    generatedAt,
    runs: accumulator.stats.runs,
    shards: [...artifacts.completions.values()],
    ...report,
    recommendations
  };
  const reportHash = sha256Value(reportDraft);
  const reportDocument = { ...reportDraft, reportHash };
  await writeReportSidecars(artifacts, reportDocument);
  await writeAtomicJson(path, reportDocument);
  return path;
}

export type MatrixAudit = {
  matrixId: string;
  status: "exact" | "source-mismatch" | "execution-mismatch" | "noncanonical" | "legacy-unverifiable" | "integrity-failed" | "incomplete";
  artifactIntegrity: "verified" | "unverifiable" | "failed";
  sourceMatch: boolean | null;
  modelMatch: boolean | null;
  executionMatch: boolean | null;
  shardIntegrity: "verified" | "unavailable" | "failed";
  reportIntegrity: "verified" | "missing" | "failed" | "unverifiable";
  issues: string[];
};

export async function auditMatrix(matrixDirInput: string, options: ProvenanceOptions = {}): Promise<MatrixAudit> {
  const matrixDir = resolve(matrixDirInput);
  let matrix: SimulationMatrix;
  try {
    matrix = await readMatrixManifest(resolve(matrixDir, "manifest.json"));
    if (matrix.schemaVersion === 2 && matrix.provenance.manifestHash !== hashManifest(matrix)) {
      throw new Error(`Matrix ${matrix.matrixId} manifest hash mismatch`);
    }
  } catch (error) {
    let matrixId = "unknown";
    try { matrixId = (await readMatrixManifest(resolve(matrixDir, "manifest.json"))).matrixId; } catch { /* reported below */ }
    return {
      matrixId,
      status: "integrity-failed",
      artifactIntegrity: "failed",
      sourceMatch: null,
      modelMatch: null,
      executionMatch: null,
      shardIntegrity: "failed",
      reportIntegrity: "unverifiable",
      issues: [error instanceof Error ? error.message : String(error)]
    };
  }

  if (matrix.schemaVersion === 1) {
    return {
      matrixId: matrix.matrixId,
      status: "legacy-unverifiable",
      artifactIntegrity: "unverifiable",
      sourceMatch: null,
      modelMatch: null,
      executionMatch: null,
      shardIntegrity: "unavailable",
      reportIntegrity: "unverifiable",
      issues: ["Legacy v1 manifests do not identify an exact source revision or content-addressed artifacts"]
    };
  }

  const issues: string[] = [];
  const source = await captureGitSource({ cwd: options.cwd, env: options.env });
  const sourceMatch = source.available &&
    !source.workspaceDirty &&
    source.sourceRevision === matrix.provenance.sourceRevision &&
    source.sourceTree === matrix.provenance.sourceTree;
  if (!sourceMatch) issues.push(source.available ? "Current source does not exactly match the matrix source" : `Current source is unavailable (${source.reason})`);
  const fingerprints = matrixModelFingerprints(matrix, matrix.provenance.commandModelVersion);
  const modelMatch = fingerprints.scenarioSetHash === matrix.provenance.scenarioSetHash &&
    fingerprints.policySetHash === matrix.provenance.policySetHash &&
    fingerprints.modelHash === matrix.provenance.modelHash;
  if (!modelMatch) issues.push("Current model, scenarios, or policy set does not match the matrix");
  const runningImage = options.imageDigest ?? options.env?.LAB_IMAGE_DIGEST ?? process.env.LAB_IMAGE_DIGEST;
  const executionMatch = matrix.provenance.nodeVersion === process.version &&
    matrix.provenance.platform === process.platform &&
    matrix.provenance.architecture === process.arch &&
    (!matrix.provenance.imageDigest || runningImage === matrix.provenance.imageDigest);
  if (!executionMatch) issues.push("Current runtime or worker image does not match the matrix execution environment");

  let reportIntegrity: MatrixAudit["reportIntegrity"] = "missing";
  let report: Record<string, unknown> | null = null;
  try {
    report = JSON.parse(await readFile(resolve(matrixDir, "report.json"), "utf8")) as Record<string, unknown>;
    const { reportHash, ...hashable } = report;
    const embeddedShards = Array.isArray(report.shards) ? report.shards as ShardCompletion[] : [];
    const embeddedRuns = embeddedShards.reduce((sum, marker) => sum + (Number.isInteger(marker.recordCount) ? marker.recordCount : 0), 0);
    reportIntegrity = typeof reportHash === "string" && reportHash === sha256Value(hashable) &&
      report.manifestHash === matrix.provenance.manifestHash &&
      canonicalJson(report.provenance) === canonicalJson(matrix.provenance) &&
      embeddedShards.length === matrix.shardCount &&
      report.runs === embeddedRuns
      ? "verified" : "failed";
    if (reportIntegrity === "failed") issues.push("Aggregate report failed its content hash or manifest link");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      reportIntegrity = "failed";
      issues.push("Aggregate report could not be parsed");
    }
  }

  let shardIntegrity: MatrixAudit["shardIntegrity"] = "unavailable";
  const shardNames = (await readdir(matrixDir)).filter((name) => /^shard-\d{4}\.jsonl\.gz$/.test(name));
  if (shardNames.length > 0) {
    try {
      const artifacts = await verifyMatrixArtifacts(matrixDir);
      for await (const _record of streamReportRecords(artifacts)) { /* validation only */ }
      if (report && canonicalJson(report.shards) !== canonicalJson([...artifacts.completions.values()])) {
        throw new Error("Aggregate report shard metadata does not match retained shard artifacts");
      }
      shardIntegrity = "verified";
    } catch (error) {
      shardIntegrity = "failed";
      issues.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    issues.push("Raw shards are not retained; manifest and compact report remain verifiable");
  }

  const artifactIntegrity = reportIntegrity === "failed" || shardIntegrity === "failed" ? "failed" as const : "verified" as const;
  const status = artifactIntegrity === "failed"
    ? "integrity-failed"
    : reportIntegrity === "missing"
      ? "incomplete"
    : !matrix.provenance.canonical
      ? "noncanonical"
      : !executionMatch
        ? "execution-mismatch"
      : sourceMatch && modelMatch
        ? "exact"
        : "source-mismatch";
  return {
    matrixId: matrix.matrixId,
    status,
    artifactIntegrity,
    sourceMatch,
    modelMatch,
    executionMatch,
    shardIntegrity,
    reportIntegrity,
    issues
  };
}

export async function compareMatrices(leftDir: string, rightDir: string) {
  const [leftAudit, rightAudit] = await Promise.all([auditMatrix(leftDir), auditMatrix(rightDir)]);
  if (leftAudit.artifactIntegrity === "failed" || leftAudit.reportIntegrity === "failed") {
    throw new Error(`Left matrix failed integrity checks: ${leftAudit.issues.join("; ")}`);
  }
  if (rightAudit.artifactIntegrity === "failed" || rightAudit.reportIntegrity === "failed") {
    throw new Error(`Right matrix failed integrity checks: ${rightAudit.issues.join("; ")}`);
  }
  const leftMatrix = await readMatrixManifest(resolve(leftDir, "manifest.json"));
  const rightMatrix = await readMatrixManifest(resolve(rightDir, "manifest.json"));
  const loadReport = async (directory: string) => JSON.parse(await readFile(resolve(directory, "report.json"), "utf8")) as {
    cells?: Array<{ scenarioId: string; compositionId: string; tuningId: string; policyId: string; winRate: number; averageProgress: number }>;
  };
  const [leftReport, rightReport] = await Promise.all([loadReport(leftDir), loadReport(rightDir)]);
  const key = (cell: { scenarioId: string; compositionId: string; tuningId: string; policyId: string }) =>
    `${cell.scenarioId}|${cell.compositionId}|${cell.tuningId}|${cell.policyId}`;
  const leftCells = new Map((leftReport.cells ?? []).map((cell) => [key(cell), cell]));
  const rightCells = new Map((rightReport.cells ?? []).map((cell) => [key(cell), cell]));
  const allKeys = [...new Set([...leftCells.keys(), ...rightCells.keys()])].sort();
  return {
    leftMatrixId: leftMatrix.matrixId,
    rightMatrixId: rightMatrix.matrixId,
    audits: { left: leftAudit, right: rightAudit },
    build: {
      leftEngineVersion: leftMatrix.engineVersion,
      rightEngineVersion: rightMatrix.engineVersion,
      leftSourceRevision: leftMatrix.schemaVersion === 2 ? leftMatrix.provenance.sourceRevision : null,
      rightSourceRevision: rightMatrix.schemaVersion === 2 ? rightMatrix.provenance.sourceRevision : null,
      modelChanged: leftMatrix.schemaVersion !== 2 || rightMatrix.schemaVersion !== 2
        ? null
        : leftMatrix.provenance.modelHash !== rightMatrix.provenance.modelHash,
      scenarioSetChanged: leftMatrix.schemaVersion !== 2 || rightMatrix.schemaVersion !== 2
        ? null
        : leftMatrix.provenance.scenarioSetHash !== rightMatrix.provenance.scenarioSetHash,
      policySetChanged: leftMatrix.schemaVersion !== 2 || rightMatrix.schemaVersion !== 2
        ? null
        : leftMatrix.provenance.policySetHash !== rightMatrix.provenance.policySetHash
    },
    dimensions: {
      scenarios: [leftMatrix.scenarioIds, rightMatrix.scenarioIds],
      compositions: [leftMatrix.compositionIds, rightMatrix.compositionIds],
      policyCount: [leftMatrix.policyCount, rightMatrix.policyCount],
      tuningCount: [leftMatrix.tuningCount, rightMatrix.tuningCount],
      runsPerCell: [leftMatrix.runsPerCell, rightMatrix.runsPerCell],
      seedStart: [leftMatrix.seedStart, rightMatrix.seedStart]
    },
    cells: allKeys.map((cellKey) => {
      const left = leftCells.get(cellKey);
      const right = rightCells.get(cellKey);
      return {
        cellKey,
        status: left && right ? "shared" : left ? "removed" : "added",
        leftWinRate: left?.winRate ?? null,
        rightWinRate: right?.winRate ?? null,
        winRateDelta: left && right ? Number((right.winRate - left.winRate).toFixed(3)) : null,
        progressDelta: left && right ? Number((right.averageProgress - left.averageProgress).toFixed(2)) : null
      };
    })
  };
}

export type RecordExperimentOptions = {
  stage?: ExperimentLedgerEntry["stage"];
  parentMatrixId?: string;
  hypothesis?: string;
  disposition?: string;
  allowNoncanonical?: boolean;
};

/** Explicitly promote a completed matrix's compact provenance record into the tracked ledger. */
export async function recordExperiment(
  matrixDirInput: string,
  ledgerPathInput: string,
  options: RecordExperimentOptions = {}
): Promise<ExperimentLedgerEntry> {
  const matrixDir = resolve(matrixDirInput);
  const audit = await auditMatrix(matrixDir);
  if (audit.artifactIntegrity !== "verified" || audit.reportIntegrity !== "verified") {
    throw new Error(`Cannot record matrix ${audit.matrixId}: ${audit.status}`);
  }
  const artifacts = await verifyMatrixArtifacts(matrixDir);
  if (artifacts.matrix.schemaVersion !== 2) throw new Error(`Cannot record legacy matrix ${artifacts.matrix.matrixId}`);
  if (!artifacts.matrix.provenance.canonical && !options.allowNoncanonical) {
    throw new Error(`Cannot record noncanonical matrix ${artifacts.matrix.matrixId} without an explicit override`);
  }
  const report = JSON.parse(await readFile(resolve(matrixDir, "report.json"), "utf8")) as {
    generatedAt: string; reportHash: string; runs: number;
  };
  const ledgerPath = resolve(ledgerPathInput);
  const archiveDir = resolveMatrixDirectory(dirname(ledgerPath), artifacts.matrix.matrixId);
  const archivedManifestPath = resolve(archiveDir, "manifest.json");
  const archivedReportPath = resolve(archiveDir, "report.json");
  const entry = ExperimentLedgerEntrySchema.parse({
    schemaVersion: 1,
    matrixId: artifacts.matrix.matrixId,
    createdAt: artifacts.matrix.createdAt,
    completedAt: report.generatedAt,
    stage: options.stage ?? "exploratory",
    ...(options.parentMatrixId ? { parentMatrixId: options.parentMatrixId } : {}),
    ...(options.hypothesis ? { hypothesis: options.hypothesis } : {}),
    ...(options.disposition ? { disposition: options.disposition } : {}),
    sourceRevision: artifacts.matrix.provenance.sourceRevision,
    modelHash: artifacts.matrix.provenance.modelHash,
    manifestHash: artifacts.matrix.provenance.manifestHash,
    reportHash: report.reportHash,
    manifestPath: relative(dirname(ledgerPath), archivedManifestPath).replaceAll("\\", "/"),
    reportPath: relative(dirname(ledgerPath), archivedReportPath).replaceAll("\\", "/"),
    runs: report.runs
  });
  let ledger: ExperimentLedger = { schemaVersion: 1, experiments: [] };
  try {
    ledger = ExperimentLedgerSchema.parse(JSON.parse(await readFile(ledgerPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const existing = ledger.experiments.find((candidate) => candidate.matrixId === entry.matrixId);
  if (existing && (existing.manifestHash !== entry.manifestHash || existing.reportHash !== entry.reportHash)) {
    throw new Error(`Ledger already contains a conflicting record for ${entry.matrixId}`);
  }
  await mkdir(archiveDir, { recursive: true });
  await writeImmutableJson(archivedManifestPath, artifacts.matrix);
  await writeImmutableJson(archivedReportPath, report);
  try {
    const candidates = JSON.parse(await readFile(resolve(matrixDir, "candidate-patches.json"), "utf8"));
    await writeImmutableJson(resolve(archiveDir, "candidate-patches.json"), candidates);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const experiments = [...ledger.experiments.filter((candidate) => candidate.matrixId !== entry.matrixId), entry]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.matrixId.localeCompare(right.matrixId));
  await mkdir(dirname(ledgerPath), { recursive: true });
  const temporaryPath = `${ledgerPath}.${process.pid}.tmp`;
  const nextLedger = ExperimentLedgerSchema.parse({ schemaVersion: 1, experiments });
  await writeFile(temporaryPath, `${JSON.stringify(nextLedger, null, 2)}\n`);
  await rename(temporaryPath, ledgerPath);
  return entry;
}
