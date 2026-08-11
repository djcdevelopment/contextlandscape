import {
  resolveAttentionV2Context,
  runAttentionMatch,
  type AttentionController,
  type AttentionRunResult
} from "@landscape/engine";
import { createAttentionController } from "@landscape/simulator/attention-policies";
import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import {
  compileAttentionV2RunPlanner,
  type AttentionV2RunIdentityInput,
  type LandscapeSweepSkeleton
} from "./landscape-sweep.js";
import {
  AttentionV2EnrichedRunRecordSchema,
  AttentionV2ShapeScreenReportSchema,
  AttentionV2ShardCompletionSchema,
  AttentionV2SweepPlanSchema,
  type AttentionV2SweepPlan
} from "@landscape/contracts";
import type {
  AttentionV2BattleSampleRef,
  AttentionV2CommanderProfile,
  AttentionV2ControllerTelemetry,
  AttentionV2EnrichedRunRecord,
  AttentionV2ModelDefinition,
  AttentionV2ShapeScreenReport,
  AttentionV2ShardCompletion
} from "@landscape/contracts";
import { sha256File, sha256Value } from "./provenance.js";
import { writeAtomicJson, writeGzipJsonLines, writeImmutableJson } from "./artifact-io.js";
import {
  applyAttentionV2BattleSample,
  battleContextHash,
  compileAttentionV2Commander,
  type CompiledAttentionV2Commander
} from "./attention-v2-commanders.js";

export type AttentionV2SmokeInput = AttentionV2RunIdentityInput;

export type AttentionV2SmokeResult = {
  identity: ReturnType<ReturnType<typeof compileAttentionV2RunPlanner>["createIdentity"]>;
  modelId: string;
  policyOneId: string;
  policyTwoId: string;
  engine: AttentionRunResult;
  record: AttentionV2EnrichedRunRecord;
};

export type AttentionV2ShapeScreenShardOptions = {
  shardCount?: number;
  maxRuns?: number;
};

export type AttentionV2HarnessRunInput = {
  matchId: string;
  seed: number;
  randomStreamId: string;
  modelId: string;
  battleSampleId: string;
  playerOneCommanderId: string;
  playerTwoCommanderId: string;
};

export type AttentionV2HarnessRunResult = {
  engine: AttentionRunResult;
  model: AttentionV2ModelDefinition;
  sample: AttentionV2BattleSampleRef;
  battleContextHash: string;
  playerOne: CompiledAttentionV2Commander;
  playerTwo: CompiledAttentionV2Commander;
  playerOneTelemetry: AttentionV2ControllerTelemetry;
  playerTwoTelemetry: AttentionV2ControllerTelemetry;
};

export type AttentionV2ExecutionHarness = {
  run: (input: AttentionV2HarnessRunInput) => AttentionV2HarnessRunResult;
  commander: (commanderId: string) => CompiledAttentionV2Commander;
  profile: (commanderId: string) => AttentionV2CommanderProfile;
};

const shapeScreenStage = "shape-screen" as const;

function shardStem(shardIndex: number): string {
  return `shard-${String(shardIndex).padStart(4, "0")}`;
}

function shapeScreenExpectedRuns(plan: AttentionV2SweepPlan): number {
  return plan.budget.stages.find((stage) => stage.stage === shapeScreenStage)?.plannedRuns ?? 0;
}

function shapeScreenShardExpectedRuns(plan: AttentionV2SweepPlan, shardCount: number, shardIndex: number): number {
  const total = shapeScreenExpectedRuns(plan);
  return shardIndex >= total ? 0 : Math.floor((total - 1 - shardIndex) / shardCount) + 1;
}

function executeShapeScreenRun(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  input: AttentionV2SmokeInput,
  planner: ReturnType<typeof compileAttentionV2RunPlanner>,
  indexes: ReturnType<typeof executionIndexes>
): {
  record: AttentionV2EnrichedRunRecord;
  engine: AttentionRunResult;
  playerOne: CompiledAttentionV2Commander;
  playerTwo: CompiledAttentionV2Commander;
} {
  const identity = planner.createIdentity(input);
  const model = indexes.models.get(input.modelId);
  if (!model) throw new Error(`Unknown shape-screen model ${input.modelId}`);
  const edge = indexes.edges.get(input.edgeId);
  if (!edge) throw new Error(`Unknown shape-screen edge ${input.edgeId}`);
  const sample = indexes.samples.get(input.battleSampleId);
  if (!sample) throw new Error(`Unknown battle sample ${input.battleSampleId}`);
  const left = indexes.commander(edge.leftCommanderId);
  const right = indexes.commander(edge.rightCommanderId);
  const playerOne = edge.seatOrientation === 1 ? left : right;
  const playerTwo = edge.seatOrientation === 1 ? right : left;
  const execution = executeHarnessRun(indexes, {
    matchId: `${plan.planId}:${identity.edgeId}:${identity.battleSampleId}:${identity.seed}`,
    seed: identity.seed,
    randomStreamId: identity.randomStreamId,
    modelId: model.modelId,
    battleSampleId: sample.sampleId,
    playerOneCommanderId: playerOne.profile.commanderId,
    playerTwoCommanderId: playerTwo.profile.commanderId
  });
  const engine = execution.engine;
  const winner = engine.match.state.winnerPlayerId;
  const winnerPlayerSlot = winner === null ? null : winner === "alpha" ? 1 as const : 2 as const;
  const commanderRef = (commander: CompiledAttentionV2Commander) => ({
    profile: commander.profile,
    compilerVersion: commander.compilerVersion,
    compositionId: commander.composition.compositionId,
    policyId: commander.program.policyId,
    policyHash: commander.policyHash
  });
  const alphaState = engine.match.state.players.find((player) => player.playerId === "alpha");
  const bravoState = engine.match.state.players.find((player) => player.playerId === "bravo");
  if (!alphaState || !bravoState) throw new Error("Corrected shape screen requires alpha and bravo outcomes");
  const outcome: AttentionV2EnrichedRunRecord["players"] = [
    {
      playerId: "alpha",
      commanderId: playerOne.profile.commanderId,
      status: alphaState.status,
      progress: alphaState.progress,
      drift: alphaState.drift,
      counters: engine.summary.players.alpha,
      controller: execution.playerOneTelemetry
    },
    {
      playerId: "bravo",
      commanderId: playerTwo.profile.commanderId,
      status: bravoState.status,
      progress: bravoState.progress,
      drift: bravoState.drift,
      counters: engine.summary.players.bravo,
      controller: execution.playerTwoTelemetry
    }
  ];
  const record = AttentionV2EnrichedRunRecordSchema.parse({
    schemaVersion: 2,
    planId: plan.planId,
    planHash: plan.planHash,
    stage: shapeScreenStage,
    identity,
    modelId: input.modelId,
    ruleShapeHash: model.ruleShapeHash,
    edge: {
      edgeId: edge.edgeId,
      pairHash: edge.pairHash,
      seatOrientation: edge.seatOrientation,
      stratum: edge.stratum,
      left: commanderRef(left),
      right: commanderRef(right),
      playerOneCommanderId: playerOne.profile.commanderId,
      playerTwoCommanderId: playerTwo.profile.commanderId
    },
    battleSampleId: sample.sampleId,
    battleSampleHash: sample.sampleHash,
    battleContextHash: execution.battleContextHash,
    status: "complete",
    winnerPlayerSlot,
    terminalReason: engine.match.state.terminalReason,
    rounds: engine.match.state.round,
    operations: engine.summary.operations,
    eventTypes: engine.summary.eventTypes,
    players: outcome,
    traceHash: engine.traceHash,
    stateHash: sha256Value(engine.match.state),
    outcomeHash: sha256Value(outcome)
  });
  return { record, engine, playerOne, playerTwo };
}

function executeHarnessRun(
  indexes: ReturnType<typeof executionIndexes>,
  input: AttentionV2HarnessRunInput
): AttentionV2HarnessRunResult {
  const model = indexes.models.get(input.modelId);
  if (!model) throw new Error(`Unknown attention-v2 model ${input.modelId}`);
  const sample = indexes.samples.get(input.battleSampleId);
  if (!sample) throw new Error(`Unknown attention-v2 battle sample ${input.battleSampleId}`);
  const playerOne = indexes.commander(input.playerOneCommanderId);
  const playerTwo = indexes.commander(input.playerTwoCommanderId);
  const resolvedBattle = indexes.context(model.modelId, sample.sampleId);
  const context = resolvedBattle.context;
  const alpha = instrumentController(createAttentionController(playerOne.program, { model: context.model, scenario: context.scenario, playerId: "alpha" }));
  const bravo = instrumentController(createAttentionController(playerTwo.program, { model: context.model, scenario: context.scenario, playerId: "bravo" }));
  const engine = runAttentionMatch({
    matchId: input.matchId,
    seed: input.seed,
    randomStreamId: input.randomStreamId,
    context,
    players: [
      { playerId: "alpha", composition: playerOne.composition },
      { playerId: "bravo", composition: playerTwo.composition }
    ]
  }, {
    alpha: alpha.controller,
    bravo: bravo.controller
  }, { traceMode: "hash" });
  return {
    engine,
    model,
    sample,
    battleContextHash: resolvedBattle.contextHash,
    playerOne,
    playerTwo,
    playerOneTelemetry: alpha.snapshot(),
    playerTwoTelemetry: bravo.snapshot()
  };
}

function increment(values: Record<string, number>, key: string): void {
  values[key] = (values[key] ?? 0) + 1;
}

function instrumentController(source: AttentionController): {
  controller: AttentionController;
  snapshot: () => AttentionV2ControllerTelemetry;
} {
  const telemetry: AttentionV2ControllerTelemetry = {
    movementCalls: 0,
    movementIntents: {},
    capacityCalls: 0,
    capacityIntents: {},
    commandCalls: 0,
    commandIntents: {}
  };
  return {
    controller: {
      maxCommandActions: source.maxCommandActions,
      movement(projection) {
        telemetry.movementCalls += 1;
        const intents = source.movement(projection);
        for (const intent of intents) increment(telemetry.movementIntents, intent.kind);
        return intents;
      },
      claim(projection) {
        telemetry.capacityCalls += 1;
        const intent = source.claim?.(projection) ?? { kind: "pass-capacity" as const, playerId: projection.viewerPlayerId };
        increment(telemetry.capacityIntents, intent.kind);
        return intent;
      },
      command(projection) {
        telemetry.commandCalls += 1;
        const intent = source.command(projection) ?? { kind: "end-command" as const, playerId: projection.viewerPlayerId };
        increment(telemetry.commandIntents, intent.kind);
        return intent;
      }
    },
    snapshot: () => structuredClone(telemetry)
  };
}

function executionIndexes(skeleton: LandscapeSweepSkeleton) {
  const models = new Map(skeleton.modelCatalog.models.map((model) => [model.modelId, model]));
  const edgeCatalog = skeleton.edgeCatalogs.find((catalog) => catalog.stage === shapeScreenStage);
  if (!edgeCatalog) throw new Error("Shape-screen edge catalog is missing");
  const edges = new Map(edgeCatalog.edges.map((edge) => [edge.edgeId, edge]));
  const samples = new Map(skeleton.battleSamples.map((sample) => [sample.sampleId, sample]));
  const profiles = new Map(skeleton.commanderCatalog.profiles.map((profile) => [profile.commanderId, profile]));
  const compiled = new Map<string, CompiledAttentionV2Commander>();
  const contexts = new Map<string, { context: ReturnType<typeof resolveAttentionV2Context>; contextHash: ReturnType<typeof battleContextHash> }>();
  return {
    models,
    edges,
    samples,
    profiles,
    context(modelId: string, sampleId: string) {
      const key = `${modelId}|${sampleId}`;
      const cached = contexts.get(key);
      if (cached) return cached;
      const model = models.get(modelId);
      const sample = samples.get(sampleId);
      if (!model || !sample) throw new Error(`Cannot resolve battle context ${key}`);
      const context = applyAttentionV2BattleSample(resolveAttentionV2Context(model), sample);
      const value = { context, contextHash: battleContextHash(context, sample) };
      contexts.set(key, value);
      return value;
    },
    commander(commanderId: string): CompiledAttentionV2Commander {
      const cached = compiled.get(commanderId);
      if (cached) return cached;
      const profile = profiles.get(commanderId);
      if (!profile) throw new Error(`Unknown commander ${commanderId}`);
      const value = compileAttentionV2Commander(profile);
      compiled.set(commanderId, value);
      return value;
    }
  };
}

export function createAttentionV2ExecutionHarness(skeleton: LandscapeSweepSkeleton): AttentionV2ExecutionHarness {
  const indexes = executionIndexes(skeleton);
  return {
    run: (input) => executeHarnessRun(indexes, input),
    commander: (commanderId) => indexes.commander(commanderId),
    profile(commanderId) {
      const profile = indexes.profiles.get(commanderId);
      if (!profile) throw new Error(`Unknown commander ${commanderId}`);
      return profile;
    }
  };
}

function* shapeScreenInputs(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  shardIndex: number,
  shardCount: number
): Generator<AttentionV2SmokeInput> {
  const edgeCatalog = skeleton.edgeCatalogs.find((catalog) => catalog.stage === shapeScreenStage);
  const sampleCatalog = skeleton.battleSampleCatalogs.find((catalog) => catalog.stage === shapeScreenStage);
  const block = plan.worldBlocks.find((candidate) => candidate.stage === shapeScreenStage);
  if (!edgeCatalog || !sampleCatalog || !block) throw new Error("shape-screen catalogs are incomplete");
  let ordinal = 0;
  for (const model of skeleton.modelCatalog.models) {
    for (const edge of edgeCatalog.edges) {
      for (const sample of sampleCatalog.samples) {
        for (let offset = 0; offset < block.seedsPerCell; offset += 1) {
          if (ordinal % shardCount === shardIndex) {
            yield {
              stage: shapeScreenStage,
              modelId: model.modelId,
              edgeId: edge.edgeId,
              battleSampleId: sample.sampleId,
              seed: block.seedStart + offset
            };
          }
          ordinal += 1;
        }
      }
    }
  }
}

async function readV2Marker(path: string): Promise<AttentionV2ShardCompletion> {
  return AttentionV2ShardCompletionSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function writeAttentionV2ShapeScreenShard(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  shardIndex: number,
  outputDir: string,
  options: AttentionV2ShapeScreenShardOptions = {}
): Promise<string> {
  AttentionV2SweepPlanSchema.parse(plan);
  const shardCount = options.shardCount ?? 1;
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error("shardCount must be a positive integer");
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) throw new Error(`shard must be between 0 and ${shardCount - 1}`);
  const matrixDir = resolve(outputDir, plan.planId);
  await mkdir(matrixDir, { recursive: true });
  await writeImmutableJson(join(matrixDir, "manifest.json"), plan);
  const stem = shardStem(shardIndex);
  const shardPath = join(matrixDir, `${stem}.jsonl.gz`);
  const markerPath = join(matrixDir, `${stem}.complete`);
  let replacingPartial = false;
  try {
    const marker = await readV2Marker(markerPath);
    if (marker.planId !== plan.planId || marker.planHash !== plan.planHash || marker.shardIndex !== shardIndex || marker.shardHash !== await sha256File(shardPath)) {
      throw new Error(`Existing v2 shard ${shardIndex} failed its completion marker`);
    }
    if (marker.completionStatus === "complete") return shardPath;
    replacingPartial = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await sha256File(shardPath);
      throw new Error(`Existing v2 shard ${shardIndex} has no completion marker`);
    } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code !== "ENOENT") throw missing;
    }
  }
  const expectedRecordCount = shapeScreenShardExpectedRuns(plan, shardCount, shardIndex);
  const maxRuns = options.maxRuns === undefined ? expectedRecordCount : options.maxRuns;
  if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > expectedRecordCount) throw new Error(`maxRuns must be between 1 and ${expectedRecordCount}`);
  const planner = compileAttentionV2RunPlanner(plan, skeleton);
  const indexes = executionIndexes(skeleton);
  let emitted = 0;
  async function* records(): AsyncGenerator<AttentionV2EnrichedRunRecord> {
    for (const input of shapeScreenInputs(plan, skeleton, shardIndex, shardCount)) {
      if (emitted >= maxRuns) return;
      emitted += 1;
      yield executeShapeScreenRun(plan, skeleton, input, planner, indexes).record;
    }
  }
  const partialPath = `${shardPath}.${process.pid}.${randomUUID()}.partial`;
  const count = await writeGzipJsonLines(partialPath, records());
  if (count !== maxRuns) throw new Error(`v2 shape-screen shard produced ${count} records instead of ${maxRuns}`);
  await rename(partialPath, shardPath);
  const marker = AttentionV2ShardCompletionSchema.parse({
    schemaVersion: 1,
    planId: plan.planId,
    planHash: plan.planHash,
    stage: shapeScreenStage,
    shardIndex,
    expectedRecordCount,
    recordCount: count,
    completionStatus: count === expectedRecordCount ? "complete" : "partial",
    shardHash: await sha256File(shardPath)
  });
  if (replacingPartial) await writeAtomicJson(markerPath, marker);
  else await writeImmutableJson(markerPath, marker);
  return shardPath;
}

export async function writeAttentionV2ShapeScreenReport(matrixDirInput: string): Promise<string> {
  const matrixDir = resolve(matrixDirInput);
  const plan = AttentionV2SweepPlanSchema.parse(JSON.parse(await readFile(join(matrixDir, "manifest.json"), "utf8")));
  const names = (await readdir(matrixDir)).filter((name) => /^shard-\d{4}\.complete$/.test(name)).sort();
  if (names.length === 0) throw new Error("No v2 shape-screen completion markers found");
  const markers: AttentionV2ShardCompletion[] = [];
  for (const name of names) {
    const marker = await readV2Marker(join(matrixDir, name));
    if (marker.planId !== plan.planId || marker.planHash !== plan.planHash || marker.stage !== shapeScreenStage || marker.completionStatus !== "complete") {
      throw new Error(`v2 shape-screen report cannot include incomplete or foreign shard ${name}`);
    }
    const shardPath = join(matrixDir, name.replace(/\.complete$/, ".jsonl.gz"));
    if (marker.shardHash !== await sha256File(shardPath)) throw new Error(`v2 shape-screen shard hash mismatch for ${name}`);
    markers.push(marker);
  }
  const indexes = markers.map((marker) => marker.shardIndex).sort((left, right) => left - right);
  if (indexes.some((index, position) => index !== position)) throw new Error("v2 shape-screen shard indexes must be contiguous");
  const plannedRuns = shapeScreenExpectedRuns(plan);
  const reportDraft = {
    schemaVersion: 1 as const,
    planId: plan.planId,
    planHash: plan.planHash,
    stage: shapeScreenStage,
    plannedRuns,
    observedRuns: markers.reduce((sum, marker) => sum + marker.recordCount, 0),
    completionStatus: "complete" as const,
    shards: markers
  };
  const report = AttentionV2ShapeScreenReportSchema.parse({ ...reportDraft, reportHash: sha256Value(reportDraft) });
  const path = join(matrixDir, "report.json");
  await writeImmutableJson(path, report);
  return path;
}

export function runAttentionV2Smoke(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  input: AttentionV2SmokeInput
): AttentionV2SmokeResult {
  if (input.stage !== "shape-screen") throw new Error("Only materialized shape-screen models can execute in the v2 smoke runner");
  const planner = compileAttentionV2RunPlanner(plan, skeleton);
  const result = executeShapeScreenRun(plan, skeleton, input, planner, executionIndexes(skeleton));
  return {
    identity: result.record.identity,
    modelId: result.record.modelId,
    policyOneId: result.playerOne.program.policyId,
    policyTwoId: result.playerTwo.program.policyId,
    engine: result.engine,
    record: result.record
  };
}
