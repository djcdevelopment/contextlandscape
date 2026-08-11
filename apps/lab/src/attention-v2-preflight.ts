import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_COMPOSITION_MODULES,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_PLANNER_VERSION,
  ATTENTION_V2_TRIAGE_MODULES,
  type AttentionV2CommanderProfile
} from "@landscape/contracts";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeGzipJsonLines, writeImmutableJson } from "./artifact-io.js";
import {
  ATTENTION_V2_BATTLE_CONTEXT_VERSION,
  ATTENTION_V2_COMMANDER_COMPILER_VERSION
} from "./attention-v2-commanders.js";
import {
  createAttentionV2ExecutionHarness,
  type AttentionV2HarnessRunInput,
  type AttentionV2HarnessRunResult
} from "./attention-v2-runner.js";
import { createAttentionV2SweepSkeleton, type LandscapeSweepSkeleton } from "./landscape-sweep.js";
import { sha256File, sha256Value, type Sha256Digest } from "./provenance.js";

export type AttentionV2PreflightKind = "probe" | "audit";

export type AttentionV2PreflightOptions = {
  kind: AttentionV2PreflightKind;
  parentV1ModelHash: Sha256Digest;
  createdAt: string;
  outputDir: string;
  progressEvery?: number;
};

type ProbeDimension = "compositionModule" | "triageModule" | "movementModule" | "capacityModule";

type ProbeContrast = {
  contrastId: string;
  dimension: ProbeDimension;
  anchorModule: string;
  variantModule: string;
  anchorCommanderId: string;
  variantCommanderId: string;
  pairHash: Sha256Digest;
};

type AuditEdge = {
  edgeId: string;
  pairHash: Sha256Digest;
  leftCommanderId: string;
  rightCommanderId: string;
  seatOrientation: 1 | 2;
  stratum: "self-play" | "one-module" | "sentinel" | "uniform" | "nearby" | "adversarial";
  contrastId: string | null;
};

type ModuleAggregate = {
  dimension: ProbeDimension;
  module: string;
  observations: number;
  eligibleRuns: number;
  changedRuns: number;
  emittedIntents: Record<string, number>;
  mechanicCounters: Record<string, number>;
  signedMetricSum: number;
};

type PreflightAccumulator = {
  observedRuns: number;
  draws: number;
  roundLimits: number;
  rounds: number;
  terminalReasons: Record<string, number>;
  winnerSlots: Record<string, number>;
  eventTypes: Record<string, number>;
  engineCounters: Record<string, number>;
  moduleAggregates: Map<string, ModuleAggregate>;
  attributionMismatches: number;
  randomStreamMismatches: number;
  randomStreams: Map<string, string>;
  replayInputs: Array<{ input: AttentionV2HarnessRunInput; traceHash: string; behaviorHash: Sha256Digest }>;
  modelBehavior: Map<string, Map<string, Sha256Digest>>;
  selectedCommanders: Set<string>;
};

const dimensions: readonly ProbeDimension[] = ["compositionModule", "triageModule", "movementModule", "capacityModule"];
const moduleLevels: Record<ProbeDimension, readonly string[]> = {
  compositionModule: ATTENTION_V2_COMPOSITION_MODULES,
  triageModule: ATTENTION_V2_TRIAGE_MODULES,
  movementModule: ATTENTION_V2_MOVEMENT_MODULES,
  capacityModule: ATTENTION_V2_CAPACITY_MODULES
};
const anchorModules: Record<ProbeDimension, string> = {
  compositionModule: "scout-line-siege",
  triageModule: "verify-lowest",
  movementModule: "own-front",
  capacityModule: "never"
};
const pressureSampleIndices = [0, 31, 31 * 32, 31 * 32 * 32] as const;
const probeModelRoles = ["v1-bridge", "core-sentinel", "all-on-sentinel", "fast-follower-sentinel"] as const;

function increment(values: Record<string, number>, key: string, amount = 1): void {
  values[key] = (values[key] ?? 0) + amount;
}

function addRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) increment(target, key, value);
}

function profileMatches(profile: AttentionV2CommanderProfile, requested: Record<ProbeDimension, string>): boolean {
  return dimensions.every((dimension) => profile[dimension] === requested[dimension]);
}

function findProfile(skeleton: LandscapeSweepSkeleton, requested: Record<ProbeDimension, string>): AttentionV2CommanderProfile {
  const profile = skeleton.commanderCatalog.profiles.find((candidate) => profileMatches(candidate, requested));
  if (!profile) throw new Error(`Missing commander profile ${JSON.stringify(requested)}`);
  return profile;
}

function createProbeContrasts(skeleton: LandscapeSweepSkeleton): ProbeContrast[] {
  const anchor = findProfile(skeleton, anchorModules);
  const contrasts: ProbeContrast[] = [];
  for (const dimension of dimensions) {
    for (const module of moduleLevels[dimension]) {
      if (module === anchorModules[dimension]) continue;
      const requested = { ...anchorModules, [dimension]: module } as Record<ProbeDimension, string>;
      const variant = findProfile(skeleton, requested);
      const pairHash = sha256Value({
        schemaVersion: 1,
        commanders: [anchor.profileHash, variant.profileHash].sort()
      });
      contrasts.push({
        contrastId: `${dimension}:${anchorModules[dimension]}->${module}`,
        dimension,
        anchorModule: anchorModules[dimension],
        variantModule: module,
        anchorCommanderId: anchor.commanderId,
        variantCommanderId: variant.commanderId,
        pairHash
      });
    }
  }
  if (contrasts.length !== 32) throw new Error(`Expected 32 one-module contrasts, received ${contrasts.length}`);
  return contrasts;
}

function selectedPressureSamples(skeleton: LandscapeSweepSkeleton) {
  return pressureSampleIndices.map((index) => {
    const sample = skeleton.battleSamples[index];
    if (!sample) throw new Error(`Missing pressure sample ${index}`);
    return sample;
  });
}

function commonRandomStream(pairHash: string, battleSampleHash: string, seed: number): Sha256Digest {
  return sha256Value({
    schemaVersion: 1,
    randomStreamVersion: "attention-v2-preflight-world-1",
    pairHash,
    battleSampleHash,
    seed
  });
}

function compactPlayer(result: AttentionV2HarnessRunResult, playerId: "alpha" | "bravo") {
  const state = result.engine.match.state.players.find((candidate) => candidate.playerId === playerId);
  if (!state) throw new Error(`Missing ${playerId} state`);
  const playerOne = playerId === "alpha";
  return {
    playerId,
    commanderId: playerOne ? result.playerOne.profile.commanderId : result.playerTwo.profile.commanderId,
    status: state.status,
    progress: state.progress,
    drift: state.drift,
    counters: result.engine.summary.players[playerId],
    controller: playerOne ? result.playerOneTelemetry : result.playerTwoTelemetry
  };
}

function behaviorHash(result: AttentionV2HarnessRunResult): Sha256Digest {
  return sha256Value({
    winnerPlayerId: result.engine.match.state.winnerPlayerId,
    terminalReason: result.engine.match.state.terminalReason,
    rounds: result.engine.match.state.round,
    players: [compactPlayer(result, "alpha"), compactPlayer(result, "bravo")]
  });
}

function playerFingerprint(dimension: ProbeDimension, player: ReturnType<typeof compactPlayer>): unknown {
  if (dimension === "triageModule") return player.controller.commandIntents;
  if (dimension === "movementModule") return { intents: player.controller.movementIntents, distance: player.counters.movementDistance, stationary: player.counters.stationaryTurns };
  if (dimension === "capacityModule") return {
    intents: player.controller.capacityIntents,
    commands: player.controller.commandIntents,
    claims: player.counters.capacityClaims,
    focus: player.counters.perfectFocusUses,
    overclock: player.counters.overclockUses,
    flare: player.counters.macroFlareUses
  };
  return {
    progress: player.progress,
    drift: player.drift,
    counters: player.counters,
    movement: player.controller.movementIntents,
    commands: player.controller.commandIntents
  };
}

function signedMetric(dimension: ProbeDimension, player: ReturnType<typeof compactPlayer>): number {
  if (dimension === "triageModule") return player.counters.verified + player.counters.rejected + player.counters.seized + player.counters.assisted;
  if (dimension === "movementModule") return player.counters.movementDistance - player.counters.stationaryTurns;
  if (dimension === "capacityModule") return player.counters.capacityClaims + player.counters.perfectFocusUses + player.counters.overclockUses + player.counters.macroFlareUses;
  return player.progress - player.drift;
}

function eligible(dimension: ProbeDimension, player: ReturnType<typeof compactPlayer>): boolean {
  if (dimension === "triageModule") return player.controller.commandCalls > 0;
  if (dimension === "movementModule") return player.controller.movementCalls > 0;
  if (dimension === "capacityModule") return player.controller.capacityCalls > 0;
  return true;
}

function moduleKey(dimension: ProbeDimension, module: string): string {
  return `${dimension}:${module}`;
}

function getModuleAggregate(accumulator: PreflightAccumulator, dimension: ProbeDimension, module: string): ModuleAggregate {
  const key = moduleKey(dimension, module);
  const existing = accumulator.moduleAggregates.get(key);
  if (existing) return existing;
  const aggregate: ModuleAggregate = {
    dimension,
    module,
    observations: 0,
    eligibleRuns: 0,
    changedRuns: 0,
    emittedIntents: {},
    mechanicCounters: {},
    signedMetricSum: 0
  };
  accumulator.moduleAggregates.set(key, aggregate);
  return aggregate;
}

function observeModule(
  accumulator: PreflightAccumulator,
  dimension: ProbeDimension,
  module: string,
  player: ReturnType<typeof compactPlayer>,
  comparison?: ReturnType<typeof compactPlayer>
): void {
  const aggregate = getModuleAggregate(accumulator, dimension, module);
  aggregate.observations += 1;
  if (eligible(dimension, player)) aggregate.eligibleRuns += 1;
  if (comparison && sha256Value(playerFingerprint(dimension, player)) !== sha256Value(playerFingerprint(dimension, comparison))) {
    aggregate.changedRuns += 1;
  }
  addRecord(aggregate.emittedIntents, player.controller.movementIntents);
  addRecord(aggregate.emittedIntents, player.controller.capacityIntents);
  addRecord(aggregate.emittedIntents, player.controller.commandIntents);
  addRecord(aggregate.mechanicCounters, player.counters);
  aggregate.signedMetricSum += signedMetric(dimension, player);
}

function emptyAccumulator(): PreflightAccumulator {
  return {
    observedRuns: 0,
    draws: 0,
    roundLimits: 0,
    rounds: 0,
    terminalReasons: {},
    winnerSlots: {},
    eventTypes: {},
    engineCounters: {},
    moduleAggregates: new Map(),
    attributionMismatches: 0,
    randomStreamMismatches: 0,
    randomStreams: new Map(),
    replayInputs: [],
    modelBehavior: new Map(),
    selectedCommanders: new Set()
  };
}

function observeRun(accumulator: PreflightAccumulator, input: AttentionV2HarnessRunInput, result: AttentionV2HarnessRunResult, streamKey: string): void {
  accumulator.observedRuns += 1;
  const state = result.engine.match.state;
  const winnerSlot = state.winnerPlayerId === null ? "draw" : state.winnerPlayerId === "alpha" ? "1" : "2";
  if (winnerSlot === "draw") accumulator.draws += 1;
  if (state.terminalReason === "round-limit") accumulator.roundLimits += 1;
  accumulator.rounds += state.round;
  increment(accumulator.winnerSlots, winnerSlot);
  increment(accumulator.terminalReasons, state.terminalReason ?? "missing");
  addRecord(accumulator.eventTypes, result.engine.summary.eventTypes);
  addRecord(accumulator.engineCounters, result.engine.summary.players.alpha);
  addRecord(accumulator.engineCounters, result.engine.summary.players.bravo);
  accumulator.selectedCommanders.add(input.playerOneCommanderId);
  accumulator.selectedCommanders.add(input.playerTwoCommanderId);
  if (result.playerOne.profile.commanderId !== input.playerOneCommanderId || result.playerTwo.profile.commanderId !== input.playerTwoCommanderId) {
    accumulator.attributionMismatches += 1;
  }
  const priorStream = accumulator.randomStreams.get(streamKey);
  if (priorStream && priorStream !== input.randomStreamId) accumulator.randomStreamMismatches += 1;
  else accumulator.randomStreams.set(streamKey, input.randomStreamId);
}

function compactRecord(
  ordinal: number,
  kind: AttentionV2PreflightKind,
  input: AttentionV2HarnessRunInput,
  result: AttentionV2HarnessRunResult,
  edge: Pick<AuditEdge, "edgeId" | "pairHash" | "seatOrientation" | "stratum" | "contrastId">,
  contrast: ProbeContrast | null
) {
  const players = [compactPlayer(result, "alpha"), compactPlayer(result, "bravo")] as const;
  return {
    schemaVersion: 1,
    kind,
    ordinal,
    modelId: input.modelId,
    ruleShapeHash: result.model.ruleShapeHash,
    battleSampleId: input.battleSampleId,
    battleSampleHash: result.sample.sampleHash,
    battleContextHash: result.battleContextHash,
    seed: input.seed,
    randomStreamId: input.randomStreamId,
    edge,
    contrast: contrast ? { contrastId: contrast.contrastId, dimension: contrast.dimension, anchorModule: contrast.anchorModule, variantModule: contrast.variantModule } : null,
    playerOneCommanderId: input.playerOneCommanderId,
    playerTwoCommanderId: input.playerTwoCommanderId,
    winnerPlayerSlot: result.engine.match.state.winnerPlayerId === null ? null : result.engine.match.state.winnerPlayerId === "alpha" ? 1 : 2,
    terminalReason: result.engine.match.state.terminalReason,
    rounds: result.engine.match.state.round,
    operations: result.engine.summary.operations,
    eventTypes: result.engine.summary.eventTypes,
    players,
    traceHash: result.engine.traceHash,
    behaviorHash: behaviorHash(result),
    stateHash: sha256Value(result.engine.match.state)
  };
}

function createAuditEdges(skeleton: LandscapeSweepSkeleton, contrasts: ProbeContrast[]): AuditEdge[] {
  const profiles = skeleton.commanderCatalog.profiles;
  const edges: AuditEdge[] = [];
  for (let index = 0; index < 80; index += 1) {
    const profile = profiles[Math.floor(index * profiles.length / 80)];
    const pairHash = sha256Value({ schemaVersion: 1, commanders: [profile.profileHash, profile.profileHash] });
    edges.push({
      edgeId: `audit-self-${String(index).padStart(3, "0")}-${pairHash.slice(7, 19)}`,
      pairHash,
      leftCommanderId: profile.commanderId,
      rightCommanderId: profile.commanderId,
      seatOrientation: 1,
      stratum: "self-play",
      contrastId: null
    });
  }
  const pairSpecs: Array<{ left: string; right: string; pairHash: Sha256Digest; stratum: AuditEdge["stratum"]; contrastId: string | null }> = contrasts.map((contrast) => ({
    left: contrast.anchorCommanderId,
    right: contrast.variantCommanderId,
    pairHash: contrast.pairHash,
    stratum: "one-module",
    contrastId: contrast.contrastId
  }));
  const used = new Set(pairSpecs.map((pair) => pair.pairHash));
  const anchor = findProfile(skeleton, anchorModules);
  const sentinelIndices = [0, profiles.length - 1, 1, profiles.length - 2, 799, 1_600, 3_199, 4_800];
  for (const profile of sentinelIndices.map((index) => profiles[index])) {
    const pairHash = sha256Value({ schemaVersion: 1, commanders: [anchor.profileHash, profile.profileHash].sort() });
    if (used.has(pairHash)) continue;
    used.add(pairHash);
    pairSpecs.push({ left: anchor.commanderId, right: profile.commanderId, pairHash, stratum: "sentinel", contrastId: null });
    if (pairSpecs.filter((pair) => pair.stratum === "sentinel").length === 8) break;
  }
  const shape = skeleton.edgeCatalogs.find((catalog) => catalog.stage === "shape-screen");
  if (!shape) throw new Error("Shape-screen graph is required to build the audit sample");
  for (const stratum of ["uniform", "nearby", "adversarial"] as const) {
    let selected = 0;
    for (const base of shape.baseEdges) {
      if (base.stratum !== stratum || used.has(base.pairHash)) continue;
      used.add(base.pairHash);
      pairSpecs.push({ left: base.leftCommanderId, right: base.rightCommanderId, pairHash: base.pairHash, stratum, contrastId: null });
      selected += 1;
      if (selected === 40) break;
    }
    if (selected !== 40) throw new Error(`Could not select 40 ${stratum} audit pairs`);
  }
  if (pairSpecs.length !== 160) throw new Error(`Expected 160 audit pairs, received ${pairSpecs.length}`);
  pairSpecs.forEach((pair, index) => {
    for (const seatOrientation of [1, 2] as const) {
      edges.push({
        edgeId: `audit-${String(index).padStart(3, "0")}-${pair.pairHash.slice(7, 19)}-seat-${seatOrientation}`,
        pairHash: pair.pairHash,
        leftCommanderId: pair.left,
        rightCommanderId: pair.right,
        seatOrientation,
        stratum: pair.stratum,
        contrastId: pair.contrastId
      });
    }
  });
  if (edges.length !== 400) throw new Error(`Expected 400 audit edges, received ${edges.length}`);
  return edges;
}

function structuralCompilerEvidence(skeleton: LandscapeSweepSkeleton, harness: ReturnType<typeof createAttentionV2ExecutionHarness>) {
  const anchor = findProfile(skeleton, anchorModules);
  return dimensions.map((dimension) => {
    const hashes = new Set<string>();
    for (const module of moduleLevels[dimension]) {
      const profile = findProfile(skeleton, { ...anchorModules, [dimension]: module } as Record<ProbeDimension, string>);
      const compiled = harness.commander(profile.commanderId);
      hashes.add(dimension === "compositionModule" ? sha256Value(compiled.composition) : sha256Value(compiled.program));
    }
    return { dimension, levels: moduleLevels[dimension].length, distinctCompiledOutputs: hashes.size, anchorCommanderId: anchor.commanderId };
  });
}

function manifestFor(
  options: AttentionV2PreflightOptions,
  skeleton: LandscapeSweepSkeleton,
  contrasts: ProbeContrast[],
  auditEdges: AuditEdge[] | null
) {
  const plannedRuns = options.kind === "probe" ? 32 * 2 * 4 * 4 * 32 : 40 * 400 * 4 * 4;
  const draft = {
    schemaVersion: 1,
    campaignKind: `attention-v2-${options.kind}`,
    plannerVersion: ATTENTION_V2_PLANNER_VERSION,
    commanderCompilerVersion: ATTENTION_V2_COMMANDER_COMPILER_VERSION,
    battleContextVersion: ATTENTION_V2_BATTLE_CONTEXT_VERSION,
    parentV1ModelHash: options.parentV1ModelHash,
    createdAt: options.createdAt,
    plannedRuns,
    modelCatalogHash: skeleton.modelCatalog.catalogHash,
    commanderCatalogHash: skeleton.commanderCatalog.catalogHash,
    edgeCatalogSetHash: skeleton.edgeCatalogSetHash,
    battleSampleCatalogSetHash: skeleton.battleSampleCatalogSetHash,
    pressureSampleIndices: [...pressureSampleIndices],
    seedStart: options.kind === "probe" ? 20_000 : 21_000,
    seedsPerCell: options.kind === "probe" ? 32 : 4,
    contrastDesignHash: sha256Value(contrasts),
    edgeDesignHash: auditEdges ? sha256Value(auditEdges) : null
  };
  const manifestHash = sha256Value(draft);
  return {
    ...draft,
    campaignId: `attention-v2-${options.kind}-${manifestHash.slice(7, 31)}`,
    manifestHash
  };
}

function progressLine(kind: AttentionV2PreflightKind, observed: number, planned: number, started: number): void {
  const elapsedSeconds = Math.max(0.001, (Date.now() - started) / 1_000);
  const rate = observed / elapsedSeconds;
  const remainingSeconds = (planned - observed) / Math.max(rate, 0.001);
  process.stderr.write(`[attention-v2-${kind}] ${observed.toLocaleString()} / ${planned.toLocaleString()} | ${rate.toFixed(1)} matches/s | ETA ${(remainingSeconds / 60).toFixed(1)} min\n`);
}

function moduleReports(accumulator: PreflightAccumulator) {
  return [...accumulator.moduleAggregates.values()]
    .sort((left, right) => moduleKey(left.dimension, left.module).localeCompare(moduleKey(right.dimension, right.module)))
    .map((aggregate) => ({
      ...aggregate,
      meanSignedMetric: aggregate.observations === 0 ? null : aggregate.signedMetricSum / aggregate.observations
    }));
}

async function existingCompletedReport(directory: string): Promise<string | null> {
  try {
    const reportPath = join(directory, "report.json");
    const report = JSON.parse(await readFile(reportPath, "utf8")) as { rawEvidence?: { path?: string; hash?: string } };
    if (!report.rawEvidence?.path || !report.rawEvidence.hash) return null;
    const rawPath = join(directory, report.rawEvidence.path);
    if (await sha256File(rawPath) !== report.rawEvidence.hash) throw new Error(`Existing preflight raw evidence failed its hash: ${rawPath}`);
    return reportPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function runAttentionV2Preflight(options: AttentionV2PreflightOptions): Promise<string> {
  const skeleton = createAttentionV2SweepSkeleton(options.parentV1ModelHash);
  const contrasts = createProbeContrasts(skeleton);
  const auditEdges = options.kind === "audit" ? createAuditEdges(skeleton, contrasts) : null;
  const manifest = manifestFor(options, skeleton, contrasts, auditEdges);
  const directory = resolve(options.outputDir, manifest.campaignId);
  await mkdir(directory, { recursive: true });
  await writeImmutableJson(join(directory, "manifest.json"), manifest);
  const completed = await existingCompletedReport(directory);
  if (completed) return completed;
  const harness = createAttentionV2ExecutionHarness(skeleton);
  const samples = selectedPressureSamples(skeleton);
  const accumulator = emptyAccumulator();
  const rawPath = join(directory, "runs.jsonl.gz");
  const partialPath = `${rawPath}.${process.pid}.partial`;
  const plannedRuns = manifest.plannedRuns;
  const progressEvery = options.progressEvery ?? (options.kind === "probe" ? 2_048 : 8_192);
  const started = Date.now();
  const contrastById = new Map(contrasts.map((contrast) => [contrast.contrastId, contrast]));
  let ordinal = 0;

  async function* probeRecords() {
    const models = probeModelRoles.map((role) => {
      const model = skeleton.modelCatalog.models.find((candidate) => candidate.role === role);
      if (!model) throw new Error(`Missing probe model ${role}`);
      return model;
    });
    for (const contrast of contrasts) {
      for (const seatOrientation of [1, 2] as const) {
        for (const model of models) {
          for (const sample of samples) {
            for (let seed = 20_000; seed < 20_032; seed += 1) {
              const playerOneCommanderId = seatOrientation === 1 ? contrast.variantCommanderId : contrast.anchorCommanderId;
              const playerTwoCommanderId = seatOrientation === 1 ? contrast.anchorCommanderId : contrast.variantCommanderId;
              const randomStreamId = commonRandomStream(contrast.pairHash, sample.sampleHash, seed);
              const input: AttentionV2HarnessRunInput = {
                matchId: `${manifest.campaignId}:${contrast.contrastId}:seat-${seatOrientation}:${model.modelId}:${sample.sampleId}:${seed}`,
                seed,
                randomStreamId,
                modelId: model.modelId,
                battleSampleId: sample.sampleId,
                playerOneCommanderId,
                playerTwoCommanderId
              };
              const result = harness.run(input);
              const variant = compactPlayer(result, seatOrientation === 1 ? "alpha" : "bravo");
              const anchor = compactPlayer(result, seatOrientation === 1 ? "bravo" : "alpha");
              observeModule(accumulator, contrast.dimension, contrast.variantModule, variant, anchor);
              const streamKey = `${contrast.pairHash}|${sample.sampleHash}|${seed}`;
              observeRun(accumulator, input, result, streamKey);
              const comparisonKey = `${contrast.contrastId}|${seatOrientation}|${sample.sampleId}|${seed}`;
              const modelsForCell = accumulator.modelBehavior.get(comparisonKey) ?? new Map<string, Sha256Digest>();
              modelsForCell.set(model.role, behaviorHash(result));
              accumulator.modelBehavior.set(comparisonKey, modelsForCell);
              if (accumulator.replayInputs.length < 32 && model.role === "v1-bridge" && seatOrientation === 1 && sample === samples[0] && seed === 20_000) {
                accumulator.replayInputs.push({ input, traceHash: result.engine.traceHash, behaviorHash: behaviorHash(result) });
              }
              const edge = { edgeId: `${contrast.contrastId}:seat-${seatOrientation}`, pairHash: contrast.pairHash, seatOrientation, stratum: "one-module" as const, contrastId: contrast.contrastId };
              const record = compactRecord(ordinal, options.kind, input, result, edge, contrast);
              ordinal += 1;
              if (ordinal % progressEvery === 0) progressLine(options.kind, ordinal, plannedRuns, started);
              yield record;
            }
          }
        }
      }
    }
  }

  async function* auditRecords() {
    if (!auditEdges) throw new Error("Audit edges are missing");
    for (const model of skeleton.modelCatalog.models) {
      for (const edge of auditEdges) {
        const playerOneCommanderId = edge.seatOrientation === 1 ? edge.leftCommanderId : edge.rightCommanderId;
        const playerTwoCommanderId = edge.seatOrientation === 1 ? edge.rightCommanderId : edge.leftCommanderId;
        for (const sample of samples) {
          for (let seed = 21_000; seed < 21_004; seed += 1) {
            const randomStreamId = commonRandomStream(edge.pairHash, sample.sampleHash, seed);
            const input: AttentionV2HarnessRunInput = {
              matchId: `${manifest.campaignId}:${edge.edgeId}:${model.modelId}:${sample.sampleId}:${seed}`,
              seed,
              randomStreamId,
              modelId: model.modelId,
              battleSampleId: sample.sampleId,
              playerOneCommanderId,
              playerTwoCommanderId
            };
            const result = harness.run(input);
            const playerOne = compactPlayer(result, "alpha");
            const playerTwo = compactPlayer(result, "bravo");
            for (const [profile, player] of [[result.playerOne.profile, playerOne], [result.playerTwo.profile, playerTwo]] as const) {
              for (const dimension of dimensions) observeModule(accumulator, dimension, profile[dimension], player);
            }
            const contrast = edge.contrastId ? contrastById.get(edge.contrastId) ?? null : null;
            if (contrast) {
              const variant = result.playerOne.profile.commanderId === contrast.variantCommanderId ? playerOne : playerTwo;
              const anchor = result.playerOne.profile.commanderId === contrast.anchorCommanderId ? playerOne : playerTwo;
              observeModule(accumulator, contrast.dimension, contrast.variantModule, variant, anchor);
            }
            const streamKey = `${edge.pairHash}|${sample.sampleHash}|${seed}`;
            observeRun(accumulator, input, result, streamKey);
            if (accumulator.replayInputs.length < 64 && model.designRow === 0 && sample === samples[0] && seed === 21_000 && edge.seatOrientation === 1) {
              accumulator.replayInputs.push({ input, traceHash: result.engine.traceHash, behaviorHash: behaviorHash(result) });
            }
            const record = compactRecord(ordinal, options.kind, input, result, edge, contrast);
            ordinal += 1;
            if (ordinal % progressEvery === 0) progressLine(options.kind, ordinal, plannedRuns, started);
            yield record;
          }
        }
      }
    }
  }

  const count = await writeGzipJsonLines(partialPath, options.kind === "probe" ? probeRecords() : auditRecords());
  if (count !== plannedRuns || ordinal !== plannedRuns || accumulator.observedRuns !== plannedRuns) {
    throw new Error(`Preflight emitted ${count}/${ordinal}/${accumulator.observedRuns} records instead of ${plannedRuns}`);
  }
  await rename(partialPath, rawPath);
  progressLine(options.kind, ordinal, plannedRuns, started);

  let replayMismatches = 0;
  for (const replay of accumulator.replayInputs) {
    const repeated = harness.run(replay.input);
    if (repeated.engine.traceHash !== replay.traceHash || behaviorHash(repeated) !== replay.behaviorHash) replayMismatches += 1;
  }
  let coreV1Cells = 0;
  let coreV1BehaviorDifferences = 0;
  for (const models of accumulator.modelBehavior.values()) {
    const bridge = models.get("v1-bridge");
    const core = models.get("core-sentinel");
    if (!bridge || !core) continue;
    coreV1Cells += 1;
    if (bridge !== core) coreV1BehaviorDifferences += 1;
  }
  const modules = moduleReports(accumulator);
  const variantModules = options.kind === "probe" ? modules : modules.filter((module) => module.observations > 0);
  const moduleEligibilityFailures = options.kind === "probe" ? variantModules.filter((module) => module.eligibleRuns === 0) : [];
  const moduleDifferenceFailures = options.kind === "probe" ? variantModules.filter((module) => module.changedRuns === 0) : [];
  const requiredMechanics = ["verified", "rejected", "seized", "assisted", "movementDistance", "stationaryTurns", "capacityClaims", "perfectFocusUses", "overclockUses", "macroFlareUses"];
  const unreachableMechanics = options.kind === "audit" ? requiredMechanics.filter((mechanic) => (accumulator.engineCounters[mechanic] ?? 0) === 0) : [];
  const roundLimitRate = accumulator.roundLimits / accumulator.observedRuns;
  const drawRate = accumulator.draws / accumulator.observedRuns;
  const structural = structuralCompilerEvidence(skeleton, harness);
  const gates = [
    { gateId: "exact-run-count", status: accumulator.observedRuns === plannedRuns ? "pass" : "fail", observed: accumulator.observedRuns, expected: plannedRuns },
    { gateId: "oriented-attribution", status: accumulator.attributionMismatches === 0 ? "pass" : "fail", observed: accumulator.attributionMismatches, expected: 0 },
    { gateId: "common-random-stream", status: accumulator.randomStreamMismatches === 0 ? "pass" : "fail", observed: accumulator.randomStreamMismatches, expected: 0 },
    { gateId: "exact-replay", status: replayMismatches === 0 ? "pass" : "fail", observed: replayMismatches, expected: 0 },
    { gateId: "distinct-compiler-outputs", status: structural.every((item) => item.levels === item.distinctCompiledOutputs) ? "pass" : "fail", observed: structural, expected: "one distinct output per module level" },
    ...(options.kind === "probe" ? [
      { gateId: "module-eligibility", status: moduleEligibilityFailures.length === 0 ? "pass" : "fail", observed: moduleEligibilityFailures.map((item) => moduleKey(item.dimension, item.module)), expected: [] },
      { gateId: "module-behavior-difference", status: moduleDifferenceFailures.length === 0 ? "pass" : "fail", observed: moduleDifferenceFailures.map((item) => moduleKey(item.dimension, item.module)), expected: [] },
      { gateId: "core-v1-explanation", status: coreV1Cells > 0 ? "pass" : "fail", observed: { comparedCells: coreV1Cells, differingCells: coreV1BehaviorDifferences, explanation: coreV1BehaviorDifferences > 0 ? "newly-visible-behavioral-difference" : "reachable-no-observed-effect" }, expected: "measured comparison" }
    ] : [
      { gateId: "enabled-mechanic-reachability", status: unreachableMechanics.length === 0 ? "pass" : "fail", observed: unreachableMechanics, expected: [] },
      { gateId: "round-limit-rate", status: roundLimitRate < 0.10 ? "pass" : "review", observed: roundLimitRate, expected: "< 0.10" },
      { gateId: "draw-rate", status: drawRate < 0.05 ? "pass" : "review", observed: drawRate, expected: "< 0.05" }
    ])
  ];
  const rawStats = await stat(rawPath);
  const rawEvidence = { path: "runs.jsonl.gz", hash: await sha256File(rawPath), bytes: rawStats.size, compression: "gzip" };
  const reportDraft = {
    schemaVersion: 1,
    campaignId: manifest.campaignId,
    manifestHash: manifest.manifestHash,
    campaignKind: manifest.campaignKind,
    generatedAt: new Date().toISOString(),
    plannedRuns,
    observedRuns: accumulator.observedRuns,
    elapsedSeconds: (Date.now() - started) / 1_000,
    matchesPerSecond: accumulator.observedRuns / Math.max(0.001, (Date.now() - started) / 1_000),
    rawEvidence,
    selectedCommanderCount: accumulator.selectedCommanders.size,
    replayChecks: accumulator.replayInputs.length,
    replayMismatches,
    coreV1Cells,
    coreV1BehaviorDifferences,
    outcomes: {
      draws: accumulator.draws,
      drawRate,
      roundLimits: accumulator.roundLimits,
      roundLimitRate,
      averageRounds: accumulator.rounds / accumulator.observedRuns,
      winnerSlots: accumulator.winnerSlots,
      terminalReasons: accumulator.terminalReasons
    },
    eventTypes: accumulator.eventTypes,
    engineCounters: accumulator.engineCounters,
    structuralCompilerEvidence: structural,
    modules,
    unreachableMechanics,
    gates,
    overallStatus: gates.every((gate) => gate.status === "pass") ? "pass" : gates.some((gate) => gate.status === "fail") ? "fail" : "review"
  };
  const report = { ...reportDraft, reportHash: sha256Value(reportDraft) };
  const reportPath = join(directory, "report.json");
  await writeImmutableJson(reportPath, report);
  return reportPath;
}
