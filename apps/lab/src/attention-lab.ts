import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type {
  AttentionAcceptanceGate,
  AttentionAggregateCell,
  AttentionAggregatePlayerMetrics,
  AttentionAggregateReport,
  AttentionComposition,
  AttentionInteractionEffect,
  AttentionMatrixDraft,
  AttentionMatrixManifest,
  AttentionMatrixMatchup,
  AttentionModelVariant,
  AttentionPairwiseComparison,
  AttentionPolicyProgram,
  AttentionScenario,
  AttentionShardCompletion,
  AttentionSimulationCounters,
  AttentionSimulationPlayerOutcome,
  AttentionSimulationRun,
  BuildProvenance,
  ExperimentLedger,
  ExperimentLedgerEntry
} from "@landscape/contracts";
import {
  AttentionAggregateReportSchema,
  AttentionMatrixDraftSchema,
  AttentionMatrixManifestSchema,
  AttentionScenarioSchema,
  AttentionShardCompletionSchema,
  AttentionSimulationRunSchema,
  ExperimentLedgerEntrySchema,
  ExperimentLedgerSchema
} from "@landscape/contracts";
import { ATTENTION_ENGINE_VERSION, runAttentionMatch } from "@landscape/engine";
import { createAttentionController } from "@landscape/simulator/attention-policies";
import { readGzipJsonLines, writeAtomicJson, writeGzipJsonLines, writeImmutableJson } from "./artifact-io.js";
import {
  assertCanonicalSource,
  canonicalJson,
  captureGitSource,
  hashManifest,
  sha256File,
  sha256Value
} from "./provenance.js";
import { bootstrapInterval, mean, wilsonInterval } from "./statistics.js";
import {
  resolveMatrixDirectory,
  type MatrixAudit,
  type ProvenanceOptions,
  type RecordExperimentOptions
} from "./lab.js";

type AttentionMatrixInput = AttentionMatrixDraft | AttentionMatrixManifest;

export type VerifiedAttentionArtifacts = {
  matrix: AttentionMatrixManifest;
  matrixDir: string;
  shardNames: string[];
  completions: Map<string, AttentionShardCompletion>;
};

type AttentionRunSpec = {
  matchup: AttentionMatrixMatchup;
  scenario: AttentionScenario;
  compositionOne: AttentionComposition;
  compositionTwo: AttentionComposition;
  variant: AttentionModelVariant;
  policyOne: AttentionPolicyProgram;
  policyTwo: AttentionPolicyProgram;
  seed: number;
  runId: string;
  randomStreamId: string;
};

type DeltaAccumulator = {
  comparisonId: string;
  matchupId: string;
  variantId: string;
  playerSlot: 1 | 2;
  leftPolicyId: string;
  rightPolicyId: string;
  count: number;
  sum: number;
  sumSquares: number;
};

const PLAYER_IDS = ["alpha", "bravo"] as const;

function fingerprints(matrix: AttentionMatrixInput) {
  return {
    scenarioSetHash: sha256Value(matrix.scenarios),
    policySetHash: sha256Value(matrix.policies),
    modelHash: sha256Value({
      modelVersion: matrix.modelVersion,
      model: matrix.model,
      compositions: matrix.compositions,
      variants: matrix.variants
    })
  };
}

function provenanceId(matrix: AttentionMatrixManifest): string {
  return sha256Value(matrix.provenance);
}

function validateRuntime(matrix: AttentionMatrixManifest, options: ProvenanceOptions): void {
  if (matrix.provenance.engineVersion !== ATTENTION_ENGINE_VERSION) {
    throw new Error(`Attention matrix engine ${matrix.provenance.engineVersion} cannot run on engine ${ATTENTION_ENGINE_VERSION}`);
  }
  if (
    matrix.provenance.nodeVersion !== process.version ||
    matrix.provenance.platform !== process.platform ||
    matrix.provenance.architecture !== process.arch
  ) {
    throw new Error(`Attention matrix ${matrix.matrixId} does not match the current runtime`);
  }
  const env = options.env ?? process.env;
  const imageDigest = options.imageDigest ?? env.LAB_IMAGE_DIGEST;
  if (matrix.provenance.imageDigest && !imageDigest) {
    throw new Error(`Attention matrix ${matrix.matrixId} requires its pinned worker image digest`);
  }
  if (matrix.provenance.imageDigest && matrix.provenance.imageDigest !== imageDigest) {
    throw new Error(`Attention matrix ${matrix.matrixId} does not match the current worker image`);
  }
}

export function isAttentionManifest(value: unknown): value is AttentionMatrixInput {
  if (!value || typeof value !== "object" || (value as { matrixKind?: unknown }).matrixKind !== "attention-command") {
    return false;
  }
  return AttentionMatrixManifestSchema.safeParse(value).success || AttentionMatrixDraftSchema.safeParse(value).success;
}

export async function sealAttentionMatrix(
  input: AttentionMatrixInput,
  options: ProvenanceOptions = {}
): Promise<AttentionMatrixManifest> {
  const sealedResult = AttentionMatrixManifestSchema.safeParse(input);
  if (sealedResult.success) {
    const matrix = sealedResult.data;
    if (matrix.provenance.manifestHash !== hashManifest(matrix)) {
      throw new Error(`Attention matrix ${matrix.matrixId} manifest hash mismatch`);
    }
    if (matrix.modelVersion !== matrix.provenance.commandModelVersion) {
      throw new Error(`Attention matrix ${matrix.matrixId} has mismatched model provenance`);
    }
    validateRuntime(matrix, options);
    const source = await captureGitSource({ cwd: options.cwd, env: options.env });
    if (matrix.provenance.canonical || options.canonical) {
      if (!matrix.provenance.canonical) throw new Error(`Attention matrix ${matrix.matrixId} is not canonical`);
      assertCanonicalSource(source);
    }
    if (source.available && (
      source.sourceRevision !== matrix.provenance.sourceRevision ||
      source.sourceTree !== matrix.provenance.sourceTree
    )) {
      throw new Error(`Attention matrix ${matrix.matrixId} does not match the current source revision`);
    }
    const expected = fingerprints(matrix);
    if (
      expected.modelHash !== matrix.provenance.modelHash ||
      expected.scenarioSetHash !== matrix.provenance.scenarioSetHash ||
      expected.policySetHash !== matrix.provenance.policySetHash
    ) {
      throw new Error(`Attention matrix ${matrix.matrixId} does not match its model, scenarios, or policies`);
    }
    return matrix;
  }

  const draft = AttentionMatrixDraftSchema.parse(input);
  const env = options.env ?? process.env;
  const canonical = options.canonical ?? false;
  const source = await captureGitSource({ cwd: options.cwd, env });
  if (canonical) assertCanonicalSource(source);
  const unavailableReason = source.available ? null : source.reason;
  const identity = fingerprints(draft);
  const provenance: BuildProvenance = {
    provenanceVersion: 1,
    canonical,
    repository: options.repository ?? env.LAB_REPOSITORY ?? "djcdevelopment/contextlandscape",
    sourceRevision: source.available ? source.sourceRevision : `unavailable:${unavailableReason}`,
    sourceTree: source.available ? source.sourceTree : `unavailable:${unavailableReason}`,
    workspaceDirty: source.available ? source.workspaceDirty : true,
    engineVersion: ATTENTION_ENGINE_VERSION,
    commandModelVersion: draft.modelVersion,
    contractVersion: 1,
    ...identity,
    manifestHash: "unsealed",
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    ...((options.imageDigest ?? env.LAB_IMAGE_DIGEST)
      ? { imageDigest: options.imageDigest ?? env.LAB_IMAGE_DIGEST }
      : {})
  };
  const unsealed = { ...draft, provenance };
  return AttentionMatrixManifestSchema.parse({
    ...unsealed,
    provenance: { ...provenance, manifestHash: hashManifest(unsealed) }
  });
}

async function readAttentionManifest(path: string): Promise<AttentionMatrixManifest> {
  const matrix = AttentionMatrixManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (matrix.provenance.manifestHash !== hashManifest(matrix)) {
    throw new Error(`Attention matrix ${matrix.matrixId} manifest hash mismatch`);
  }
  return matrix;
}

export async function ensureAttentionManifest(matrix: AttentionMatrixManifest, outputDir: string): Promise<string> {
  const parsed = AttentionMatrixManifestSchema.parse(matrix);
  if (parsed.provenance.manifestHash !== hashManifest(parsed)) {
    throw new Error(`Attention matrix ${parsed.matrixId} manifest hash mismatch`);
  }
  const matrixDir = resolveMatrixDirectory(outputDir, parsed.matrixId);
  await mkdir(matrixDir, { recursive: true });
  const path = resolve(matrixDir, "manifest.json");
  try {
    await writeImmutableJson(path, parsed);
  } catch (error) {
    if (error instanceof Error && error.message.includes("different content")) {
      throw new Error(`Attention matrix ${parsed.matrixId} already has a different frozen manifest`);
    }
    throw error;
  }
  return path;
}

function assertShardIndex(matrix: AttentionMatrixInput, shardIndex: number): void {
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= matrix.shardCount) {
    throw new Error(`shard must be between 0 and ${matrix.shardCount - 1}`);
  }
}

function catalog<T>(values: readonly T[], id: (value: T) => string): Map<string, T> {
  return new Map(values.map((value) => [id(value), value]));
}

function* attentionRunSpecs(matrix: AttentionMatrixInput, shardIndex: number): Generator<AttentionRunSpec> {
  assertShardIndex(matrix, shardIndex);
  const scenarios = catalog(matrix.scenarios, (item) => item.scenarioId);
  const compositions = catalog(matrix.compositions, (item) => item.compositionId);
  const variants = catalog(matrix.variants, (item) => item.variantId);
  const policies = catalog(matrix.policies, (item) => item.policyId);
  let blockIndex = 0;
  for (const matchup of matrix.matchups) {
    for (const variantId of matchup.variantIds) {
      for (let offset = 0; offset < matrix.seedsPerCell; offset += 1) {
        const assigned = blockIndex % matrix.shardCount;
        blockIndex += 1;
        if (assigned !== shardIndex) continue;
        const seed = matrix.seedStart + offset;
        for (const policyOneId of matchup.playerOnePolicyIds) {
          for (const policyTwoId of matchup.playerTwoPolicyIds) {
            const scenario = scenarios.get(matchup.scenarioId);
            const compositionOne = compositions.get(matchup.playerOneCompositionId);
            const compositionTwo = compositions.get(matchup.playerTwoCompositionId);
            const variant = variants.get(variantId);
            const policyOne = policies.get(policyOneId);
            const policyTwo = policies.get(policyTwoId);
            if (!scenario || !compositionOne || !compositionTwo || !variant || !policyOne || !policyTwo) {
              throw new Error(`Attention matrix ${matrix.matrixId} contains an unresolved run reference`);
            }
            yield {
              matchup,
              scenario,
              compositionOne,
              compositionTwo,
              variant,
              policyOne,
              policyTwo,
              seed,
              runId: `${matrix.matrixId}:${matchup.matchupId}:${variantId}:${seed}:${policyOneId}:${policyTwoId}`,
              randomStreamId: matchup.scenarioId
            };
          }
        }
      }
    }
  }
}

export function expectedAttentionRunCount(matrix: AttentionMatrixInput, shardIndex?: number): number {
  if (shardIndex === undefined) {
    return matrix.matchups.reduce((sum, matchup) => sum +
      matchup.variantIds.length * matchup.playerOnePolicyIds.length * matchup.playerTwoPolicyIds.length * matrix.seedsPerCell, 0);
  }
  let count = 0;
  for (const _spec of attentionRunSpecs(matrix, shardIndex)) count += 1;
  return count;
}

function scenarioForVariant(scenario: AttentionScenario, variant: AttentionModelVariant): AttentionScenario {
  const frontRadius = variant.scenarioOverrides?.frontRadius;
  if (frontRadius === undefined) return scenario;
  return AttentionScenarioSchema.parse({
    ...scenario,
    frontSchedule: scenario.frontSchedule.map((entry) => ({ ...entry, radius: frontRadius }))
  });
}

function runAttentionSpec(matrix: AttentionMatrixManifest, spec: AttentionRunSpec): AttentionSimulationRun {
  const scenario = scenarioForVariant(spec.scenario, spec.variant);
  const controllers = {
    [PLAYER_IDS[0]]: createAttentionController(spec.policyOne, {
      model: spec.variant.model, scenario, playerId: PLAYER_IDS[0]
    }),
    [PLAYER_IDS[1]]: createAttentionController(spec.policyTwo, {
      model: spec.variant.model, scenario, playerId: PLAYER_IDS[1]
    })
  };
  const result = runAttentionMatch({
    matchId: spec.runId,
    seed: spec.seed,
    randomStreamId: spec.randomStreamId,
    context: { model: spec.variant.model, scenario },
    players: [
      { playerId: PLAYER_IDS[0], composition: spec.compositionOne },
      { playerId: PLAYER_IDS[1], composition: spec.compositionTwo }
    ]
  }, controllers, { traceMode: matrix.traceMode, maxOperations: 10_000 });
  const state = result.match.state;
  if (!state.terminalReason) throw new Error(`Attention run ${spec.runId} did not produce a terminal result`);
  const counters = PLAYER_IDS.map((playerId) => structuredClone(result.summary.players[playerId])) as
    [AttentionSimulationCounters, AttentionSimulationCounters];
  const players = state.players.map((player, index) => {
    const playerCounters = counters[index];
    return {
      playerSlot: (index + 1) as 1 | 2,
      status: player.status,
      progress: player.progress,
      drift: player.drift,
      driftPer12Progress: 12 * player.drift / Math.max(1, player.progress),
      attentionToArtifactRatio: playerCounters.minimumAttentionToArtifactRatio,
      counters: playerCounters
    };
  }) as [AttentionSimulationPlayerOutcome, AttentionSimulationPlayerOutcome];
  const stateHash = sha256Value(state);
  const winnerPlayerSlot = state.winnerPlayerId === PLAYER_IDS[0] ? 1 : state.winnerPlayerId === PLAYER_IDS[1] ? 2 : null;
  const outcome = {
    winnerPlayerSlot,
    terminalReason: state.terminalReason,
    rounds: state.round,
    players,
    stateHash
  };
  return AttentionSimulationRunSchema.parse({
    schemaVersion: 1,
    matrixKind: "attention-command",
    modelVersion: matrix.modelVersion,
    runId: spec.runId,
    matrixId: matrix.matrixId,
    manifestHash: matrix.provenance.manifestHash,
    provenanceId: provenanceId(matrix),
    matchupId: spec.matchup.matchupId,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    playerOneCompositionId: spec.compositionOne.compositionId,
    playerTwoCompositionId: spec.compositionTwo.compositionId,
    variantId: spec.variant.variantId,
    playerOnePolicyId: spec.policyOne.policyId,
    playerTwoPolicyId: spec.policyTwo.policyId,
    seed: spec.seed,
    randomStreamId: spec.randomStreamId,
    traceMode: matrix.traceMode,
    status: "complete",
    ...outcome,
    eventHash: matrix.traceMode === "summary" ? null : result.traceHash,
    outcomeHash: sha256Value(outcome)
  });
}

function shardStem(shardIndex: number): string {
  return `shard-${String(shardIndex).padStart(4, "0")}`;
}

async function validateCompletion(
  matrix: AttentionMatrixManifest,
  matrixDir: string,
  shardIndex: number
): Promise<AttentionShardCompletion> {
  const stem = shardStem(shardIndex);
  const shardPath = resolve(matrixDir, `${stem}.jsonl.gz`);
  const marker = AttentionShardCompletionSchema.parse(
    JSON.parse(await readFile(resolve(matrixDir, `${stem}.complete`), "utf8"))
  );
  if (
    marker.matrixId !== matrix.matrixId ||
    marker.shardIndex !== shardIndex ||
    marker.recordCount !== expectedAttentionRunCount(matrix, shardIndex) ||
    marker.manifestHash !== matrix.provenance.manifestHash ||
    marker.provenanceId !== provenanceId(matrix) ||
    marker.shardHash !== await sha256File(shardPath)
  ) {
    throw new Error(`Attention matrix ${matrix.matrixId} failed integrity checks for shard ${shardIndex}`);
  }
  return marker;
}

export async function writeAttentionShard(
  matrixInput: AttentionMatrixManifest,
  shardIndex: number,
  outputDir: string,
  options: ProvenanceOptions = {}
): Promise<string> {
  const matrix = await sealAttentionMatrix(AttentionMatrixManifestSchema.parse(matrixInput), options);
  assertShardIndex(matrix, shardIndex);
  if (matrix.provenance.manifestHash !== hashManifest(matrix)) {
    throw new Error(`Attention matrix ${matrix.matrixId} manifest hash mismatch`);
  }
  await ensureAttentionManifest(matrix, outputDir);
  const matrixDir = resolveMatrixDirectory(outputDir, matrix.matrixId);
  const stem = shardStem(shardIndex);
  const shardPath = resolve(matrixDir, `${stem}.jsonl.gz`);
  try {
    await validateCompletion(matrix, matrixDir, shardIndex);
    return shardPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const partialPath = resolve(matrixDir, `${stem}.${process.pid}.${randomUUID()}.partial.gz`);
  let count = 0;
  let partialHash: string;
  try {
    async function* records(): AsyncGenerator<AttentionSimulationRun> {
      for (const spec of attentionRunSpecs(matrix, shardIndex)) yield runAttentionSpec(matrix, spec);
    }
    count = await writeGzipJsonLines(partialPath, records());
    partialHash = await sha256File(partialPath);
    await link(partialPath, shardPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        await validateCompletion(matrix, matrixDir, shardIndex);
        return shardPath;
      } catch {
        throw new Error(`Attention shard ${shardIndex} already exists without a valid completion marker`);
      }
    }
    throw error;
  } finally {
    try { await unlink(partialPath); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (count !== expectedAttentionRunCount(matrix, shardIndex)) {
    throw new Error(`Attention shard ${shardIndex} produced ${count} records instead of the expected count`);
  }
  const completion = AttentionShardCompletionSchema.parse({
    schemaVersion: 1,
    matrixKind: "attention-command",
    matrixId: matrix.matrixId,
    shardIndex,
    recordCount: count,
    manifestHash: matrix.provenance.manifestHash,
    provenanceId: provenanceId(matrix),
    shardHash: partialHash!
  });
  await writeImmutableJson(resolve(matrixDir, `${stem}.complete`), completion);
  return shardPath;
}

function expectedIdentity(spec: AttentionRunSpec) {
  return {
    runId: spec.runId,
    matchupId: spec.matchup.matchupId,
    scenarioId: spec.scenario.scenarioId,
    scenarioVersion: spec.scenario.version,
    playerOneCompositionId: spec.compositionOne.compositionId,
    playerTwoCompositionId: spec.compositionTwo.compositionId,
    variantId: spec.variant.variantId,
    playerOnePolicyId: spec.policyOne.policyId,
    playerTwoPolicyId: spec.policyTwo.policyId,
    seed: spec.seed,
    randomStreamId: spec.randomStreamId
  };
}

function recordIdentity(record: AttentionSimulationRun) {
  return {
    runId: record.runId,
    matchupId: record.matchupId,
    scenarioId: record.scenarioId,
    scenarioVersion: record.scenarioVersion,
    playerOneCompositionId: record.playerOneCompositionId,
    playerTwoCompositionId: record.playerTwoCompositionId,
    variantId: record.variantId,
    playerOnePolicyId: record.playerOnePolicyId,
    playerTwoPolicyId: record.playerTwoPolicyId,
    seed: record.seed,
    randomStreamId: record.randomStreamId
  };
}

function validateOutcomeHash(record: AttentionSimulationRun): void {
  const expected = sha256Value({
    winnerPlayerSlot: record.winnerPlayerSlot,
    terminalReason: record.terminalReason,
    rounds: record.rounds,
    players: record.players,
    stateHash: record.stateHash
  });
  if (record.outcomeHash !== expected) throw new Error(`Attention run ${record.runId} outcome hash mismatch`);
}

async function validateShardRecords(
  matrix: AttentionMatrixManifest,
  matrixDir: string,
  shardIndex: number,
  marker: AttentionShardCompletion
): Promise<void> {
  const expected = attentionRunSpecs(matrix, shardIndex);
  let next = expected.next();
  let count = 0;
  for await (const value of readGzipJsonLines(resolve(matrixDir, `${shardStem(shardIndex)}.jsonl.gz`))) {
    const record = AttentionSimulationRunSchema.parse(value);
    if (next.done) throw new Error(`Attention shard ${shardIndex} contains unexpected extra records`);
    if (
      record.matrixId !== matrix.matrixId ||
      record.modelVersion !== matrix.modelVersion ||
      record.manifestHash !== matrix.provenance.manifestHash ||
      record.provenanceId !== provenanceId(matrix) ||
      record.traceMode !== matrix.traceMode ||
      canonicalJson(recordIdentity(record)) !== canonicalJson(expectedIdentity(next.value))
    ) {
      throw new Error(`Attention shard ${shardIndex} contains an out-of-order or foreign record at index ${count}`);
    }
    validateOutcomeHash(record);
    count += 1;
    next = expected.next();
  }
  if (!next.done || count !== marker.recordCount) {
    throw new Error(`Attention shard ${shardIndex} does not contain its exact expected run set`);
  }
}

export async function verifyAttentionArtifacts(matrixDirInput: string): Promise<VerifiedAttentionArtifacts> {
  const matrixDir = resolve(matrixDirInput);
  const matrix = await readAttentionManifest(resolve(matrixDir, "manifest.json"));
  const names = await readdir(matrixDir);
  const shardNames = names.filter((name) => /^shard-\d+\.jsonl\.gz$/.test(name)).sort();
  const expectedNames = Array.from({ length: matrix.shardCount }, (_, index) => `${shardStem(index)}.jsonl.gz`);
  if (canonicalJson(shardNames) !== canonicalJson(expectedNames)) {
    throw new Error(`Attention matrix ${matrix.matrixId} does not have exactly ${matrix.shardCount} shards`);
  }
  const markerNames = names.filter((name) => /^shard-\d+\.complete$/.test(name)).sort();
  const expectedMarkers = Array.from({ length: matrix.shardCount }, (_, index) => `${shardStem(index)}.complete`);
  if (canonicalJson(markerNames) !== canonicalJson(expectedMarkers)) {
    throw new Error(`Attention matrix ${matrix.matrixId} does not have exactly ${matrix.shardCount} completion markers`);
  }
  const completions = new Map<string, AttentionShardCompletion>();
  for (let shardIndex = 0; shardIndex < matrix.shardCount; shardIndex += 1) {
    const marker = await validateCompletion(matrix, matrixDir, shardIndex);
    await validateShardRecords(matrix, matrixDir, shardIndex, marker);
    completions.set(`${shardStem(shardIndex)}.jsonl.gz`, marker);
  }
  return { matrix, matrixDir, shardNames, completions };
}

async function* streamAttentionRecords(artifacts: VerifiedAttentionArtifacts): AsyncGenerator<AttentionSimulationRun> {
  for (const name of artifacts.shardNames) {
    for await (const value of readGzipJsonLines(resolve(artifacts.matrixDir, name))) {
      yield AttentionSimulationRunSchema.parse(value);
    }
  }
}

type PlayerSums = {
  wins: number;
  progress: number;
  drift: number;
  attentionSpent: number;
  attentionRatio: number;
  movementDistance: number;
  stationaryTurns: number;
};

type CellAccumulator = {
  identity: Omit<AttentionAggregateCell, "runs" | "draws" | "averageRounds" | "terminalReasons" | "players">;
  runs: number;
  draws: number;
  rounds: number;
  terminalReasons: Record<string, number>;
  players: [PlayerSums, PlayerSums];
};

function emptyPlayerSums(): PlayerSums {
  return {
    wins: 0,
    progress: 0,
    drift: 0,
    attentionSpent: 0,
    attentionRatio: 0,
    movementDistance: 0,
    stationaryTurns: 0
  };
}

function cellKey(record: AttentionSimulationRun): string {
  return [
    record.matchupId,
    record.scenarioId,
    record.playerOneCompositionId,
    record.playerTwoCompositionId,
    record.variantId,
    record.playerOnePolicyId,
    record.playerTwoPolicyId
  ].join("|");
}

function score(record: AttentionSimulationRun, slot: 1 | 2): number {
  return record.winnerPlayerSlot === slot ? 1 : record.winnerPlayerSlot === null ? 0.5 : 0;
}

function addCell(cells: Map<string, CellAccumulator>, record: AttentionSimulationRun): void {
  const key = cellKey(record);
  let cell = cells.get(key);
  if (!cell) {
    cell = {
      identity: {
        matchupId: record.matchupId,
        scenarioId: record.scenarioId,
        playerOneCompositionId: record.playerOneCompositionId,
        playerTwoCompositionId: record.playerTwoCompositionId,
        variantId: record.variantId,
        playerOnePolicyId: record.playerOnePolicyId,
        playerTwoPolicyId: record.playerTwoPolicyId
      },
      runs: 0,
      draws: 0,
      rounds: 0,
      terminalReasons: {},
      players: [emptyPlayerSums(), emptyPlayerSums()]
    };
    cells.set(key, cell);
  }
  cell.runs += 1;
  cell.rounds += record.rounds;
  if (record.winnerPlayerSlot === null) cell.draws += 1;
  cell.terminalReasons[record.terminalReason] = (cell.terminalReasons[record.terminalReason] ?? 0) + 1;
  for (let index = 0; index < 2; index += 1) {
    const outcome = record.players[index];
    const sums = cell.players[index];
    if (record.winnerPlayerSlot === index + 1) sums.wins += 1;
    sums.progress += outcome.progress;
    sums.drift += outcome.drift;
    sums.attentionSpent += outcome.counters.attentionSpent;
    sums.attentionRatio += outcome.attentionToArtifactRatio;
    sums.movementDistance += outcome.counters.movementDistance;
    sums.stationaryTurns += outcome.counters.stationaryTurns;
  }
}

function scoreInterval(wins: number, draws: number, runs: number): [number, number] {
  const estimate = (wins + draws * 0.5) / runs;
  const losses = runs - wins - draws;
  const variance = (
    wins * (1 - estimate) ** 2 +
    draws * (0.5 - estimate) ** 2 +
    losses * estimate ** 2
  ) / Math.max(1, runs - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / runs);
  return [Math.max(0, estimate - margin), Math.min(1, estimate + margin)];
}

function finishCells(accumulators: Map<string, CellAccumulator>): AttentionAggregateCell[] {
  return [...accumulators.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, cell]) => ({
    ...cell.identity,
    runs: cell.runs,
    draws: cell.draws,
    averageRounds: cell.rounds / cell.runs,
    terminalReasons: cell.terminalReasons,
    players: cell.players.map((sums, index) => ({
      playerSlot: (index + 1) as 1 | 2,
      wins: sums.wins,
      winRate: (sums.wins + cell.draws * 0.5) / cell.runs,
      winRate95: scoreInterval(sums.wins, cell.draws, cell.runs),
      averageProgress: sums.progress / cell.runs,
      averageDrift: sums.drift / cell.runs,
      driftPer12Progress: 12 * sums.drift / Math.max(1, sums.progress),
      averageAttentionSpent: sums.attentionSpent / cell.runs,
      averageAttentionToArtifactRatio: sums.attentionRatio / cell.runs,
      averageMovementDistance: sums.movementDistance / cell.runs,
      averageStationaryTurns: sums.stationaryTurns / cell.runs
    })) as [AttentionAggregatePlayerMetrics, AttentionAggregatePlayerMetrics]
  }));
}

function addDelta(
  deltas: Map<string, DeltaAccumulator>,
  metadata: Omit<DeltaAccumulator, "count" | "sum" | "sumSquares">,
  value: number
): void {
  let accumulator = deltas.get(metadata.comparisonId);
  if (!accumulator) {
    accumulator = { ...metadata, count: 0, sum: 0, sumSquares: 0 };
    deltas.set(metadata.comparisonId, accumulator);
  }
  accumulator.count += 1;
  accumulator.sum += value;
  accumulator.sumSquares += value * value;
}

function flushPairedBlock(records: AttentionSimulationRun[], deltas: Map<string, DeltaAccumulator>): void {
  if (records.length === 0) return;
  const first = records[0];
  const byOpponentTwo = new Map<string, Map<string, AttentionSimulationRun>>();
  const byOpponentOne = new Map<string, Map<string, AttentionSimulationRun>>();
  for (const record of records) {
    const firstPolicies = byOpponentTwo.get(record.playerTwoPolicyId) ?? new Map<string, AttentionSimulationRun>();
    firstPolicies.set(record.playerOnePolicyId, record);
    byOpponentTwo.set(record.playerTwoPolicyId, firstPolicies);
    const secondPolicies = byOpponentOne.get(record.playerOnePolicyId) ?? new Map<string, AttentionSimulationRun>();
    secondPolicies.set(record.playerTwoPolicyId, record);
    byOpponentOne.set(record.playerOnePolicyId, secondPolicies);
  }
  const compare = (slot: 1 | 2, policies: Map<string, AttentionSimulationRun>) => {
    const ids = [...policies.keys()].sort();
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const leftPolicyId = ids[leftIndex];
        const rightPolicyId = ids[rightIndex];
        const left = policies.get(leftPolicyId)!;
        const right = policies.get(rightPolicyId)!;
        const comparisonId = `${first.matchupId}|${first.variantId}|p${slot}|${leftPolicyId}|${rightPolicyId}`;
        addDelta(deltas, {
          comparisonId,
          matchupId: first.matchupId,
          variantId: first.variantId,
          playerSlot: slot,
          leftPolicyId,
          rightPolicyId
        }, score(right, slot) - score(left, slot));
      }
    }
  };
  for (const policies of byOpponentTwo.values()) compare(1, policies);
  for (const policies of byOpponentOne.values()) compare(2, policies);
}

function deltaInterval(accumulator: DeltaAccumulator): { estimate: number; interval: [number, number] } {
  const estimate = accumulator.sum / accumulator.count;
  if (accumulator.count === 1) return { estimate, interval: [estimate, estimate] };
  const variance = Math.max(0,
    (accumulator.sumSquares - accumulator.count * estimate * estimate) / (accumulator.count - 1)
  );
  const margin = 1.959963984540054 * Math.sqrt(variance / accumulator.count);
  return {
    estimate,
    interval: [Math.max(-1, estimate - margin), Math.min(1, estimate + margin)]
  };
}

function finishPairwise(deltas: Map<string, DeltaAccumulator>): AttentionPairwiseComparison[] {
  return [...deltas.values()].sort((left, right) => left.comparisonId.localeCompare(right.comparisonId)).map((item) => {
    const calculated = deltaInterval(item);
    return {
      comparisonId: item.comparisonId,
      matchupId: item.matchupId,
      variantId: item.variantId,
      playerSlot: item.playerSlot,
      leftPolicyId: item.leftPolicyId,
      rightPolicyId: item.rightPolicyId,
      pairedRuns: item.count,
      winRateDelta: calculated.estimate,
      confidenceInterval95: calculated.interval
    };
  });
}

function interactionEffects(
  matrix: AttentionMatrixManifest,
  cells: AttentionAggregateCell[]
): AttentionInteractionEffect[] {
  const factors = new Set(matrix.variants.flatMap((variant) => Object.keys(variant.factorLevels)));
  const output: AttentionInteractionEffect[] = [];
  for (const factor of [...factors].sort()) {
    const variantsByLevel = new Map<string, string[]>();
    for (const variant of matrix.variants) {
      if (!(factor in variant.factorLevels)) continue;
      const level = canonicalJson(variant.factorLevels[factor]);
      variantsByLevel.set(level, [...(variantsByLevel.get(level) ?? []), variant.variantId]);
    }
    const levels = [...variantsByLevel.keys()].sort();
    if (levels.length < 2) continue;
    const reference = levels[0];
    const baseKey = (cell: AttentionAggregateCell) => [
      cell.matchupId, cell.scenarioId, cell.playerOneCompositionId, cell.playerTwoCompositionId,
      cell.playerOnePolicyId, cell.playerTwoPolicyId
    ].join("|");
    const levelScores = new Map<string, Map<string, number[]>>();
    for (const level of levels) {
      const variantIds = new Set(variantsByLevel.get(level));
      const scores = new Map<string, number[]>();
      for (const cell of cells.filter((candidate) => variantIds.has(candidate.variantId))) {
        const key = baseKey(cell);
        scores.set(key, [...(scores.get(key) ?? []), cell.players[0].winRate]);
      }
      levelScores.set(level, scores);
    }
    for (const level of levels.slice(1)) {
      const left = levelScores.get(reference)!;
      const right = levelScores.get(level)!;
      const accumulator: DeltaAccumulator = {
        comparisonId: "", matchupId: "", variantId: "", playerSlot: 1,
        leftPolicyId: "", rightPolicyId: "", count: 0, sum: 0, sumSquares: 0
      };
      for (const key of [...left.keys()].filter((candidate) => right.has(candidate)).sort()) {
        const leftValue = mean(left.get(key)!);
        const rightValue = mean(right.get(key)!);
        const value = rightValue - leftValue;
        accumulator.count += 1;
        accumulator.sum += value;
        accumulator.sumSquares += value * value;
      }
      if (accumulator.count === 0) continue;
      const calculated = deltaInterval(accumulator);
      output.push({
        interactionId: `${factor}:${reference}->${level}`,
        metric: "player-one-score",
        estimate: calculated.estimate,
        confidenceInterval95: calculated.interval,
        sampleSize: accumulator.count
      });
    }
  }
  return output;
}

function orientedComparison(
  pairwise: readonly AttentionPairwiseComparison[],
  matchupId: string,
  baselinePolicyId: string,
  candidatePolicyId: string
): { estimate: number; interval: [number, number]; sampleSize: number } | null {
  const found = pairwise.find((item) => item.matchupId === matchupId && item.playerSlot === 1 &&
    new Set([item.leftPolicyId, item.rightPolicyId]).size === 2 &&
    [item.leftPolicyId, item.rightPolicyId].includes(baselinePolicyId) &&
    [item.leftPolicyId, item.rightPolicyId].includes(candidatePolicyId));
  if (!found) return null;
  if (found.leftPolicyId === baselinePolicyId) {
    return { estimate: found.winRateDelta, interval: found.confidenceInterval95, sampleSize: found.pairedRuns };
  }
  return {
    estimate: -found.winRateDelta,
    interval: [-found.confidenceInterval95[1], -found.confidenceInterval95[0]],
    sampleSize: found.pairedRuns
  };
}

function comparisonGate(
  gateId: string,
  kind: AttentionAcceptanceGate["kind"],
  pairwise: readonly AttentionPairwiseComparison[],
  matchupId: string,
  baselinePolicyId: string,
  candidatePolicyId: string,
  threshold: number
): AttentionAcceptanceGate {
  const comparison = orientedComparison(pairwise, matchupId, baselinePolicyId, candidatePolicyId);
  return {
    gateId,
    kind,
    status: comparison ? (comparison.interval[0] >= threshold ? "pass" : "fail") : "insufficient-data",
    threshold,
    observed: comparison?.estimate ?? null,
    confidenceInterval95: comparison?.interval ?? null,
    sampleSize: comparison?.sampleSize ?? 0,
    details: { matchupId, baselinePolicyId, candidatePolicyId, criterion: "lower-bound" }
  };
}

type GateSamples = {
  flareEligible: number;
  flareSuccesses: number;
  escort: Array<{ progress: number; drift: number }>;
  escortControl: Array<{ progress: number; drift: number }>;
};

function aggregateDriftPer12(samples: readonly { progress: number; drift: number }[]): number {
  const progress = samples.reduce((sum, sample) => sum + sample.progress, 0);
  const drift = samples.reduce((sum, sample) => sum + sample.drift, 0);
  return 12 * drift / Math.max(1, progress);
}

function acceptanceGates(
  pairwise: readonly AttentionPairwiseComparison[],
  samples: GateSamples
): AttentionAcceptanceGate[] {
  const gates: AttentionAcceptanceGate[] = [
    comparisonGate(
      "scout-specialization", "specialized-policy-advantage", pairwise,
      "gate-scout-specialization", "verify-lowest-confidence", "recon-lock-reject", 0.15
    ),
    comparisonGate(
      "siege-specialization", "specialized-policy-advantage", pairwise,
      "gate-siege-specialization", "verify-lowest-confidence", "uplink-seize", 0.15
    ),
    comparisonGate(
      "movement-value", "movement-value", pairwise,
      "gate-movement-value", "verify-lowest-confidence", "front-mobile-verify", 0.10
    )
  ];

  const flare = samples.flareEligible > 0
    ? wilsonInterval(samples.flareSuccesses, samples.flareEligible)
    : null;
  gates.push({
    gateId: "flare-drift-defeat",
    kind: "flare-drift-defeat-rate",
    status: flare ? (flare.lower >= 0.8 ? "pass" : "fail") : "insufficient-data",
    threshold: 0.8,
    observed: flare?.estimate ?? null,
    confidenceInterval95: flare ? [flare.lower, flare.upper] : null,
    sampleSize: samples.flareEligible,
    details: { matchupId: "gate-flare-drift", maximumAttentionToArtifactRatio: 0.25, criterion: "wilson-lower-bound" }
  });

  const escort = samples.escort.length > 0
    ? bootstrapInterval(samples.escort, aggregateDriftPer12, "gate-escort-specialized")
    : null;
  const mobile = samples.escortControl.length > 0
    ? bootstrapInterval(samples.escortControl, aggregateDriftPer12, "gate-escort-control")
    : null;
  gates.push({
    gateId: "stationary-line-escort",
    kind: "escort-drift-efficiency",
    status: escort && mobile ? (escort.upper < 1.5 && mobile.lower > 3 ? "pass" : "fail") : "insufficient-data",
    threshold: 1.5,
    observed: escort?.estimate ?? null,
    confidenceInterval95: escort ? [escort.lower, escort.upper] : null,
    sampleSize: samples.escort.length,
    details: {
      matchupId: "gate-escort-efficiency",
      controlPolicyId: "accept-all",
      controlObserved: mobile?.estimate ?? null,
      controlConfidenceInterval95: mobile ? [mobile.lower, mobile.upper] : null,
      controlLowerThreshold: 3,
      criterion: "specialized-upper-and-control-lower"
    }
  });
  return gates;
}

function addGateSample(samples: GateSamples, record: AttentionSimulationRun): void {
  if (record.matchupId === "gate-flare-drift" && record.playerOnePolicyId === "capacity-follower-flare" &&
      record.players[1].attentionToArtifactRatio < 0.25) {
    samples.flareEligible += 1;
    if (record.players[0].counters.driftDefeatsInduced > 0) {
      samples.flareSuccesses += 1;
    }
  }
  if (record.matchupId === "gate-escort-efficiency") {
    const sample = { progress: record.players[0].progress, drift: record.players[0].drift };
    if (record.playerOnePolicyId === "line-escort-lock") samples.escort.push(sample);
    if (record.playerOnePolicyId === "accept-all") samples.escortControl.push(sample);
  }
}

function validateReportDocument(
  matrix: AttentionMatrixManifest,
  value: unknown
): AttentionAggregateReport {
  const report = AttentionAggregateReportSchema.parse(value);
  const { reportHash, ...hashable } = report;
  if (
    reportHash !== sha256Value(hashable) ||
    report.matrixId !== matrix.matrixId ||
    report.modelVersion !== matrix.modelVersion ||
    report.campaignKind !== matrix.campaignKind ||
    report.manifestHash !== matrix.provenance.manifestHash ||
    canonicalJson(report.provenance) !== canonicalJson(matrix.provenance) ||
    report.traceMode !== matrix.traceMode ||
    report.runs !== report.shards.reduce((sum, marker) => sum + marker.recordCount, 0)
  ) {
    throw new Error(`Attention matrix ${matrix.matrixId} report failed its content hash or manifest link`);
  }
  const indexes = report.shards.map((marker) => marker.shardIndex).sort((left, right) => left - right);
  const expectedIndexes = Array.from({ length: matrix.shardCount }, (_, index) => index);
  if (canonicalJson(indexes) !== canonicalJson(expectedIndexes)) {
    throw new Error(`Attention matrix ${matrix.matrixId} report does not contain the exact shard set`);
  }
  for (const marker of report.shards) {
    if (
      marker.matrixId !== matrix.matrixId ||
      marker.manifestHash !== matrix.provenance.manifestHash ||
      marker.provenanceId !== provenanceId(matrix) ||
      marker.recordCount !== expectedAttentionRunCount(matrix, marker.shardIndex)
    ) {
      throw new Error(`Attention matrix ${matrix.matrixId} report contains invalid shard evidence`);
    }
  }
  return report;
}

export async function writeAttentionReport(matrixDirInput: string): Promise<string> {
  const artifacts = await verifyAttentionArtifacts(matrixDirInput);
  const reportPath = resolve(artifacts.matrixDir, "report.json");
  try {
    validateReportDocument(artifacts.matrix, JSON.parse(await readFile(reportPath, "utf8")));
    return reportPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const cells = new Map<string, CellAccumulator>();
  const deltas = new Map<string, DeltaAccumulator>();
  const samples: GateSamples = { flareEligible: 0, flareSuccesses: 0, escort: [], escortControl: [] };
  let currentBlockKey: string | null = null;
  let currentBlock: AttentionSimulationRun[] = [];
  let runs = 0;
  for await (const record of streamAttentionRecords(artifacts)) {
    const blockKey = `${record.matchupId}|${record.variantId}|${record.seed}`;
    if (currentBlockKey !== null && blockKey !== currentBlockKey) {
      flushPairedBlock(currentBlock, deltas);
      currentBlock = [];
    }
    currentBlockKey = blockKey;
    currentBlock.push(record);
    addCell(cells, record);
    addGateSample(samples, record);
    runs += 1;
  }
  flushPairedBlock(currentBlock, deltas);
  const finalCells = finishCells(cells);
  const pairwise = finishPairwise(deltas);
  const reportDraft = {
    schemaVersion: 1 as const,
    matrixKind: "attention-command" as const,
    modelVersion: artifacts.matrix.modelVersion,
    matrixId: artifacts.matrix.matrixId,
    campaignKind: artifacts.matrix.campaignKind,
    manifestHash: artifacts.matrix.provenance.manifestHash,
    provenance: artifacts.matrix.provenance,
    generatedAt: new Date().toISOString(),
    runs,
    traceMode: artifacts.matrix.traceMode,
    shards: [...artifacts.completions.values()].sort((left, right) => left.shardIndex - right.shardIndex),
    cells: finalCells,
    pairwise,
    interactions: interactionEffects(artifacts.matrix, finalCells),
    gates: acceptanceGates(pairwise, samples)
  };
  const report = AttentionAggregateReportSchema.parse({ ...reportDraft, reportHash: sha256Value(reportDraft) });
  await writeImmutableJson(reportPath, report);
  return reportPath;
}

export async function auditAttentionMatrix(
  matrixDirInput: string,
  options: ProvenanceOptions = {}
): Promise<MatrixAudit> {
  const matrixDir = resolve(matrixDirInput);
  let matrix: AttentionMatrixManifest;
  try {
    matrix = await readAttentionManifest(resolve(matrixDir, "manifest.json"));
  } catch (error) {
    let matrixId = "unknown";
    try {
      const raw = JSON.parse(await readFile(resolve(matrixDir, "manifest.json"), "utf8")) as { matrixId?: unknown };
      if (typeof raw.matrixId === "string") matrixId = raw.matrixId;
    } catch { /* the integrity issue below is sufficient */ }
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

  const issues: string[] = [];
  const source = await captureGitSource({ cwd: options.cwd, env: options.env });
  const sourceMatch = source.available && !source.workspaceDirty &&
    source.sourceRevision === matrix.provenance.sourceRevision && source.sourceTree === matrix.provenance.sourceTree;
  if (!sourceMatch) {
    issues.push(source.available
      ? "Current source does not exactly match the attention matrix source"
      : `Current source is unavailable (${source.reason})`);
  }
  const expectedFingerprints = fingerprints(matrix);
  const modelMatch = expectedFingerprints.modelHash === matrix.provenance.modelHash &&
    expectedFingerprints.scenarioSetHash === matrix.provenance.scenarioSetHash &&
    expectedFingerprints.policySetHash === matrix.provenance.policySetHash;
  if (!modelMatch) issues.push("Attention model, scenarios, variants, or policies do not match the matrix provenance");
  const env = options.env ?? process.env;
  const imageDigest = options.imageDigest ?? env.LAB_IMAGE_DIGEST;
  const executionMatch = matrix.provenance.engineVersion === ATTENTION_ENGINE_VERSION &&
    matrix.provenance.nodeVersion === process.version &&
    matrix.provenance.platform === process.platform &&
    matrix.provenance.architecture === process.arch &&
    (!matrix.provenance.imageDigest || matrix.provenance.imageDigest === imageDigest);
  if (!executionMatch) issues.push("Current attention engine, runtime, or worker image does not match the matrix");

  let reportIntegrity: MatrixAudit["reportIntegrity"] = "missing";
  let report: AttentionAggregateReport | null = null;
  try {
    report = validateReportDocument(matrix, JSON.parse(await readFile(resolve(matrixDir, "report.json"), "utf8")));
    reportIntegrity = "verified";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      reportIntegrity = "failed";
      issues.push(error instanceof Error ? error.message : "Attention aggregate report could not be parsed");
    }
  }

  let shardIntegrity: MatrixAudit["shardIntegrity"] = "unavailable";
  let shardNames: string[] = [];
  try {
    shardNames = (await readdir(matrixDir)).filter((name) => /^shard-\d+\.jsonl\.gz$/.test(name));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Attention matrix directory is unavailable");
  }
  if (shardNames.length > 0) {
    try {
      const artifacts = await verifyAttentionArtifacts(matrixDir);
      if (report && canonicalJson(report.shards) !== canonicalJson([...artifacts.completions.values()])) {
        throw new Error("Attention report shard evidence does not match retained artifacts");
      }
      shardIntegrity = "verified";
    } catch (error) {
      shardIntegrity = "failed";
      issues.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    issues.push("Raw attention shards are not retained; the manifest and compact report remain verifiable");
  }

  const artifactIntegrity = reportIntegrity === "failed" || shardIntegrity === "failed" ? "failed" as const : "verified" as const;
  const status: MatrixAudit["status"] = artifactIntegrity === "failed"
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

export async function compareAttentionMatrices(leftDirInput: string, rightDirInput: string) {
  const leftDir = resolve(leftDirInput);
  const rightDir = resolve(rightDirInput);
  const [leftAudit, rightAudit, leftMatrix, rightMatrix] = await Promise.all([
    auditAttentionMatrix(leftDir),
    auditAttentionMatrix(rightDir),
    readAttentionManifest(resolve(leftDir, "manifest.json")),
    readAttentionManifest(resolve(rightDir, "manifest.json"))
  ]);
  if (leftAudit.artifactIntegrity !== "verified" || leftAudit.reportIntegrity !== "verified") {
    throw new Error(`Left attention matrix failed integrity checks: ${leftAudit.issues.join("; ")}`);
  }
  if (rightAudit.artifactIntegrity !== "verified" || rightAudit.reportIntegrity !== "verified") {
    throw new Error(`Right attention matrix failed integrity checks: ${rightAudit.issues.join("; ")}`);
  }
  if (leftMatrix.modelVersion !== rightMatrix.modelVersion ||
      leftMatrix.provenance.modelHash !== rightMatrix.provenance.modelHash) {
    throw new Error("Attention matrix outcome comparison requires the same model version and model hash");
  }
  const [leftReport, rightReport] = await Promise.all([
    readFile(resolve(leftDir, "report.json"), "utf8").then((text) => validateReportDocument(leftMatrix, JSON.parse(text))),
    readFile(resolve(rightDir, "report.json"), "utf8").then((text) => validateReportDocument(rightMatrix, JSON.parse(text)))
  ]);
  const key = (cell: AttentionAggregateCell) => [
    cell.matchupId, cell.scenarioId, cell.playerOneCompositionId, cell.playerTwoCompositionId,
    cell.variantId, cell.playerOnePolicyId, cell.playerTwoPolicyId
  ].join("|");
  const leftCells = new Map(leftReport.cells.map((cell) => [key(cell), cell]));
  const rightCells = new Map(rightReport.cells.map((cell) => [key(cell), cell]));
  const keys = [...new Set([...leftCells.keys(), ...rightCells.keys()])].sort();
  return {
    matrixKind: "attention-command" as const,
    modelVersion: leftMatrix.modelVersion,
    leftMatrixId: leftMatrix.matrixId,
    rightMatrixId: rightMatrix.matrixId,
    audits: { left: leftAudit, right: rightAudit },
    build: {
      leftSourceRevision: leftMatrix.provenance.sourceRevision,
      rightSourceRevision: rightMatrix.provenance.sourceRevision,
      modelHash: leftMatrix.provenance.modelHash,
      scenarioSetChanged: leftMatrix.provenance.scenarioSetHash !== rightMatrix.provenance.scenarioSetHash,
      policySetChanged: leftMatrix.provenance.policySetHash !== rightMatrix.provenance.policySetHash
    },
    dimensions: {
      campaignKind: [leftMatrix.campaignKind, rightMatrix.campaignKind],
      seedsPerCell: [leftMatrix.seedsPerCell, rightMatrix.seedsPerCell],
      seedStart: [leftMatrix.seedStart, rightMatrix.seedStart],
      shards: [leftMatrix.shardCount, rightMatrix.shardCount]
    },
    cells: keys.map((cellKey) => {
      const left = leftCells.get(cellKey);
      const right = rightCells.get(cellKey);
      return {
        cellKey,
        status: left && right ? "shared" as const : left ? "removed" as const : "added" as const,
        playerOneScore: [left?.players[0].winRate ?? null, right?.players[0].winRate ?? null],
        playerOneScoreDelta: left && right ? right.players[0].winRate - left.players[0].winRate : null,
        playerTwoScoreDelta: left && right ? right.players[1].winRate - left.players[1].winRate : null,
        playerOneDriftDelta: left && right ? right.players[0].averageDrift - left.players[0].averageDrift : null,
        averageRoundsDelta: left && right ? right.averageRounds - left.averageRounds : null
      };
    })
  };
}

export async function recordAttentionExperiment(
  matrixDirInput: string,
  ledgerPathInput: string,
  options: RecordExperimentOptions = {}
): Promise<ExperimentLedgerEntry> {
  const matrixDir = resolve(matrixDirInput);
  const audit = await auditAttentionMatrix(matrixDir);
  if (audit.artifactIntegrity !== "verified" || audit.reportIntegrity !== "verified") {
    throw new Error(`Cannot record attention matrix ${audit.matrixId}: ${audit.status}`);
  }
  const artifacts = await verifyAttentionArtifacts(matrixDir);
  if (!artifacts.matrix.provenance.canonical && !options.allowNoncanonical) {
    throw new Error(`Cannot record noncanonical attention matrix ${artifacts.matrix.matrixId} without an explicit override`);
  }
  const report = validateReportDocument(
    artifacts.matrix,
    JSON.parse(await readFile(resolve(matrixDir, "report.json"), "utf8"))
  );
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
  const experiments = [...ledger.experiments.filter((candidate) => candidate.matrixId !== entry.matrixId), entry]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.matrixId.localeCompare(right.matrixId));
  await writeAtomicJson(ledgerPath, ExperimentLedgerSchema.parse({ schemaVersion: 1, experiments }));
  return entry;
}
