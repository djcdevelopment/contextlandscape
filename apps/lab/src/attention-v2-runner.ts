import {
  attentionCompositions,
  createAttentionMatch,
  resolveAttentionV2Context,
  runAttentionMatch,
  type AttentionRunResult
} from "@landscape/engine";
import { attentionPolicyById, createAttentionController } from "@landscape/simulator/attention-policies";
import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import {
  compileAttentionV2RunPlanner,
  type AttentionV2RunIdentityInput,
  type LandscapeSweepSkeleton
} from "./landscape-sweep.js";
import {
  AttentionV2RunRecordSchema,
  AttentionV2ShapeScreenReportSchema,
  AttentionV2ShardCompletionSchema,
  AttentionV2SweepPlanSchema,
  type AttentionV2SweepPlan
} from "@landscape/contracts";
import type {
  AttentionV2RunRecord,
  AttentionV2ShapeScreenReport,
  AttentionV2ShardCompletion
} from "@landscape/contracts";
import { sha256File, sha256Value } from "./provenance.js";
import { writeAtomicJson, writeGzipJsonLines, writeImmutableJson } from "./artifact-io.js";

export type AttentionV2SmokeInput = AttentionV2RunIdentityInput & {
  policyOneId?: string;
  policyTwoId?: string;
};

export type AttentionV2SmokeResult = {
  identity: ReturnType<ReturnType<typeof compileAttentionV2RunPlanner>["createIdentity"]>;
  modelId: string;
  policyOneId: string;
  policyTwoId: string;
  engine: AttentionRunResult;
};

export type AttentionV2ShapeScreenShardOptions = {
  policyOneId?: string;
  policyTwoId?: string;
  shardCount?: number;
  maxRuns?: number;
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

function shapeScreenRunRecord(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  input: AttentionV2SmokeInput,
  policyOneId: string,
  policyTwoId: string,
  planner: ReturnType<typeof compileAttentionV2RunPlanner>
): AttentionV2RunRecord {
  const identity = planner.createIdentity(input);
  const model = skeleton.modelCatalog.models.find((candidate) => candidate.modelId === input.modelId);
  if (!model) throw new Error(`Unknown shape-screen model ${input.modelId}`);
  const context = resolveAttentionV2Context(model);
  const composition = attentionCompositions.balanced;
  const engine = runAttentionMatch({
    matchId: `${plan.planId}:${identity.edgeId}:${identity.battleSampleId}:${identity.seed}`,
    seed: identity.seed,
    randomStreamId: identity.randomStreamId,
    context,
    players: [
      { playerId: "alpha", composition },
      { playerId: "bravo", composition }
    ]
  }, {
    alpha: createAttentionController(policy(policyOneId), { model: context.model, scenario: context.scenario, playerId: "alpha" }),
    bravo: createAttentionController(policy(policyTwoId), { model: context.model, scenario: context.scenario, playerId: "bravo" })
  }, { traceMode: "hash" });
  const winner = engine.match.state.winnerPlayerId;
  const winnerPlayerSlot = winner === null ? null : winner === "alpha" ? 1 as const : 2 as const;
  const outcome = engine.match.state.players.map((player) => ({
    playerId: player.playerId,
    status: player.status,
    progress: player.progress,
    drift: player.drift
  }));
  return AttentionV2RunRecordSchema.parse({
    schemaVersion: 1,
    planId: plan.planId,
    planHash: plan.planHash,
    stage: shapeScreenStage,
    identity,
    modelId: input.modelId,
    policyOneId,
    policyTwoId,
    status: "complete",
    winnerPlayerSlot,
    terminalReason: engine.match.state.terminalReason,
    rounds: engine.match.state.round,
    traceHash: engine.traceHash,
    stateHash: sha256Value(engine.match.state),
    outcomeHash: sha256Value(outcome)
  });
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
  const policyOneId = options.policyOneId ?? "front-mobile-verify";
  const policyTwoId = options.policyTwoId ?? "verify-lowest-confidence";
  policy(policyOneId);
  policy(policyTwoId);
  const planner = compileAttentionV2RunPlanner(plan, skeleton);
  let emitted = 0;
  async function* records(): AsyncGenerator<AttentionV2RunRecord> {
    for (const input of shapeScreenInputs(plan, skeleton, shardIndex, shardCount)) {
      if (emitted >= maxRuns) return;
      emitted += 1;
      yield shapeScreenRunRecord(plan, skeleton, input, policyOneId, policyTwoId, planner);
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

function policy(id: string) {
  const program = attentionPolicyById.get(id);
  if (!program) throw new Error(`Unknown attention policy ${id}`);
  return program;
}

export function runAttentionV2Smoke(
  plan: AttentionV2SweepPlan,
  skeleton: LandscapeSweepSkeleton,
  input: AttentionV2SmokeInput
): AttentionV2SmokeResult {
  if (input.stage !== "shape-screen") throw new Error("Only materialized shape-screen models can execute in the v2 smoke runner");
  const planner = compileAttentionV2RunPlanner(plan, skeleton);
  const identity = planner.createIdentity(input);
  const model = skeleton.modelCatalog.models.find((candidate) => candidate.modelId === input.modelId);
  if (!model) throw new Error(`Unknown shape-screen model ${input.modelId}`);
  const context = resolveAttentionV2Context(model);
  const policyOneId = input.policyOneId ?? "front-mobile-verify";
  const policyTwoId = input.policyTwoId ?? "verify-lowest-confidence";
  const policyOne = policy(policyOneId);
  const policyTwo = policy(policyTwoId);
  const composition = attentionCompositions.balanced;
  const match = createAttentionMatch({
    matchId: `${plan.planId}:${identity.edgeId}:${identity.battleSampleId}:${identity.seed}`,
    seed: identity.seed,
    randomStreamId: identity.randomStreamId,
    context,
    players: [
      { playerId: "alpha", composition },
      { playerId: "bravo", composition }
    ]
  });
  const engine = runAttentionMatch(match, {
    alpha: createAttentionController(policyOne, { model: context.model, scenario: context.scenario, playerId: "alpha" }),
    bravo: createAttentionController(policyTwo, { model: context.model, scenario: context.scenario, playerId: "bravo" })
  }, { traceMode: "hash" });
  return { identity, modelId: model.modelId, policyOneId, policyTwoId, engine };
}
