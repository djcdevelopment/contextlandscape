import {
  auditMatrix,
  compareMatrices,
  createExecutionMatrix,
  ensureMatrixManifest,
  recordExperiment,
  sealExecutionMatrix,
  writeReport,
  writeShard
} from "./lab.js";
import { readFile } from "node:fs/promises";
import { AttentionV2SweepPlanSchema, SimulationMatrixSchema } from "@landscape/contracts";
import {
  auditAttentionMatrix,
  compareAttentionMatrices,
  ensureAttentionManifest,
  expectedAttentionRunCount,
  isAttentionManifest,
  preflightAttentionArtilleryCampaign,
  recordAttentionExperiment,
  sealAttentionMatrix,
  writeAttentionReport,
  writeAttentionShard
} from "./attention-lab.js";
import { createAttentionCampaignDraft } from "./attention-campaigns.js";
import {
  createAttentionV2SweepPlan,
  createAttentionV2SweepSkeleton
} from "./landscape-sweep.js";
import {
  writeAttentionV2ShapeScreenReport,
  writeAttentionV2ShapeScreenShard
} from "./attention-v2-runner.js";
import { runAttentionV2Preflight } from "./attention-v2-preflight.js";
import { writeImmutableJson } from "./artifact-io.js";
import type { Sha256Digest } from "./provenance.js";

function value(name: string): string | undefined {
  const argument = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  const envName = name === "matrix" ? "LAB_MATRIX_ID" : `LAB_${name.replace(/-/g, "_").toUpperCase()}`;
  return argument?.split("=").slice(1).join("=") ?? process.env[envName];
}

async function main(): Promise<void> {
  const artilleryPreflightDir = value("attention-artillery-preflight");
  if (artilleryPreflightDir) {
    console.log(JSON.stringify(await preflightAttentionArtilleryCampaign(normalizeDataPath(artilleryPreflightDir)), null, 2));
    return;
  }
  const auditDir = value("audit");
  if (auditDir) {
    const normalized = normalizeDataPath(auditDir);
    const audit = await isAttentionMatrixDirectory(normalized)
      ? await auditAttentionMatrix(normalized)
      : await auditMatrix(normalized);
    console.log(JSON.stringify(audit, null, 2));
    if (value("strict") === "true" && audit.status !== "exact") throw new Error(`audit status is ${audit.status}`);
    return;
  }
  const compareLeft = value("left");
  const compareRight = value("right");
  if (compareLeft || compareRight) {
    if (!compareLeft || !compareRight) throw new Error("comparison requires both --left and --right");
    const left = normalizeDataPath(compareLeft);
    const right = normalizeDataPath(compareRight);
    const [leftAttention, rightAttention] = await Promise.all([
      isAttentionMatrixDirectory(left),
      isAttentionMatrixDirectory(right)
    ]);
    if (leftAttention !== rightAttention) throw new Error("cannot compare an attention matrix with a legacy matrix");
    console.log(JSON.stringify(leftAttention
      ? await compareAttentionMatrices(left, right)
      : await compareMatrices(left, right), null, 2));
    return;
  }
  const recordDir = value("record");
  if (recordDir) {
    const defaultLedger = /[\\/]apps[\\/]lab$/.test(process.cwd()) ? "../../data/experiments/ledger.json" : "data/experiments/ledger.json";
    const stageValue = value("stage");
    const stages = ["exploratory", "train", "holdout", "follow-up"] as const;
    if (stageValue && !stages.includes(stageValue as typeof stages[number])) throw new Error(`invalid experiment stage: ${stageValue}`);
    const stage = stageValue as typeof stages[number] | undefined;
    const requestedLedger = value("ledger");
    const normalizedRecordDir = normalizeDataPath(recordDir);
    const ledger = requestedLedger ? normalizeDataPath(requestedLedger) : defaultLedger;
    const recordOptions = {
      stage,
      parentMatrixId: value("parent"),
      hypothesis: value("hypothesis"),
      disposition: value("disposition"),
      allowNoncanonical: value("allow-noncanonical") === "true"
    };
    const entry = await isAttentionMatrixDirectory(normalizedRecordDir)
      ? await recordAttentionExperiment(normalizedRecordDir, ledger, recordOptions)
      : await recordExperiment(normalizedRecordDir, ledger, recordOptions);
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  const reportDir = value("report");
  if (reportDir) {
    const normalizedReportDir = normalizeDataPath(reportDir);
    const report = await isAttentionMatrixDirectory(normalizedReportDir)
      ? await writeAttentionReport(normalizedReportDir)
      : await writeReport(normalizedReportDir);
    console.log(`wrote ${report}`);
    return;
  }
  const manifestPath = value("manifest");
  const attentionV2Preflight = value("attention-v2-preflight");
  if (attentionV2Preflight) {
    if (attentionV2Preflight !== "probe" && attentionV2Preflight !== "audit") {
      throw new Error("--attention-v2-preflight must be probe or audit");
    }
    const report = await runAttentionV2Preflight({
      kind: attentionV2Preflight,
      parentV1ModelHash: requiredDigest("parent-model"),
      createdAt: value("created-at") ?? new Date().toISOString(),
      outputDir: normalizeDataPath(value("out") ?? defaultOutputDirectory()),
      progressEvery: optionalInteger("progress-every")
    });
    console.log(`wrote ${report}`);
    return;
  }
  const landscapeSweep = value("landscape-sweep");
  if (landscapeSweep) {
    await runLandscapeSweepCommand(landscapeSweep);
    return;
  }
  const attentionCampaign = value("attention-campaign");
  const scenario = value("scenario");
  const canonical = value("canonical") === "true";
  const manifestDocument = manifestPath
    ? JSON.parse(await readFile(normalizeDataPath(manifestPath), "utf8")) as unknown
    : undefined;
  if (attentionCampaign || (manifestDocument !== undefined && isAttentionManifest(manifestDocument))) {
    await runAttentionCommand(attentionCampaign, manifestDocument, canonical);
    return;
  }
  const matrix = manifestPath
    ? await sealExecutionMatrix(
        SimulationMatrixSchema.parse(manifestDocument),
        { canonical }
      )
    : await createExecutionMatrix({
        matrixId: value("matrix"),
        scenarioIds: scenario ? [scenario] : undefined,
        runsPerCell: value("runs") ? Number(value("runs")) : undefined,
        policyCount: value("policies") ? Number(value("policies")) : undefined,
        tuningCount: value("tunings") ? Number(value("tunings")) : undefined,
        seedStart: value("seed-start") ? Number(value("seed-start")) : undefined,
        shardCount: value("shards") ? Number(value("shards")) : undefined,
        canonical
      }, { canonical });
  const defaultOutput = /[\\/]apps[\\/]lab$/.test(process.cwd()) ? "../../data/lab" : "data/lab";
  const outputDir = value("out") ?? defaultOutput;
  if (value("prepare") === "true") {
    const path = await ensureMatrixManifest(matrix, outputDir);
    console.log(JSON.stringify({ matrix, manifest: path }, null, 2));
    return;
  }
  if (value("all-shards") === "true") {
    const paths = [];
    for (let index = 0; index < matrix.shardCount; index += 1) paths.push(await writeShard(matrix, index, outputDir));
    const report = await writeReport(`${outputDir}/${matrix.matrixId}`);
    console.log(JSON.stringify({ matrix, paths, report }, null, 2));
    return;
  }
  const shardIndex = value("shard") ? Number(value("shard")) : 0;
  if (shardIndex < 0 || shardIndex >= matrix.shardCount) throw new Error(`shard must be between 0 and ${matrix.shardCount - 1}`);
  const path = await writeShard(matrix, shardIndex, outputDir);
  console.log(JSON.stringify({ matrix, shardIndex, path }, null, 2));
}

async function runLandscapeSweepCommand(mode: string): Promise<void> {
  if (mode !== "shape-screen" && mode !== "report") throw new Error("--landscape-sweep must be shape-screen or report");
  const outputDir = normalizeDataPath(value("out") ?? defaultOutputDirectory());
  const frozenManifest = value("manifest");
  if (mode === "report" && frozenManifest) {
    const plan = AttentionV2SweepPlanSchema.parse(
      JSON.parse(await readFile(normalizeDataPath(frozenManifest), "utf8")) as unknown
    );
    const matrixDir = `${outputDir}/${plan.planId}`;
    console.log(`wrote ${await writeAttentionV2ShapeScreenReport(matrixDir)}`);
    return;
  }
  const parentV1ManifestHash = requiredDigest("parent-manifest");
  const parentV1ReportHash = requiredDigest("parent-report");
  const parentV1ModelHash = requiredDigest("parent-model");
  const createdAt = value("created-at") ?? new Date().toISOString();
  const seedStart = optionalInteger("seed-start") ?? 10_000;
  const skeleton = createAttentionV2SweepSkeleton(parentV1ModelHash);
  const plan = createAttentionV2SweepPlan({
    parentV1ManifestHash,
    parentV1ReportHash,
    parentV1ModelHash,
    createdAt,
    seedStart,
    budgetProfile: "standard"
  }, skeleton);
  if (value("dry-run") === "true") {
    console.log(JSON.stringify({
      planId: plan.planId,
      planHash: plan.planHash,
      stage: "shape-screen",
      plannedRuns: plan.budget.stages.find((stage) => stage.stage === "shape-screen")?.plannedRuns,
      executionStatus: plan.executionStatus
    }, null, 2));
    return;
  }
  const matrixDir = `${outputDir}/${plan.planId}`;
  if (value("prepare") === "true") {
    await writeImmutableJson(`${matrixDir}/manifest.json`, plan);
    console.log(JSON.stringify({ planId: plan.planId, planHash: plan.planHash, manifest: `${matrixDir}/manifest.json` }, null, 2));
    return;
  }
  if (mode === "report") {
    console.log(`wrote ${await writeAttentionV2ShapeScreenReport(matrixDir)}`);
    return;
  }
  const shardIndex = optionalInteger("shard") ?? 0;
  const shardCount = optionalInteger("shards") ?? 1;
  const maxRuns = optionalInteger("max-runs");
  const path = await writeAttentionV2ShapeScreenShard(plan, skeleton, shardIndex, outputDir, { shardCount, maxRuns });
  console.log(JSON.stringify({ planId: plan.planId, planHash: plan.planHash, shardIndex, shardCount, path }, null, 2));
}

function requiredDigest(name: string): Sha256Digest {
  const raw = value(name);
  if (!raw || !/^sha256:[0-9a-f]{64}$/.test(raw)) throw new Error(`--${name} must be a sha256 digest`);
  return raw as Sha256Digest;
}

async function runAttentionCommand(
  requestedCampaign: string | undefined,
  manifestDocument: unknown,
  canonical: boolean
): Promise<void> {
  const campaignKinds = ["stationary-train", "capacity-train", "holdout", "v3-shape", "v3-artillery-causal"] as const;
  if (requestedCampaign && !campaignKinds.includes(requestedCampaign as typeof campaignKinds[number])) {
    throw new Error(`invalid attention campaign: ${requestedCampaign}`);
  }
  if (requestedCampaign && manifestDocument !== undefined) {
    throw new Error("use either --attention-campaign or --manifest, not both");
  }
  const draft = requestedCampaign
    ? createAttentionCampaignDraft(requestedCampaign as typeof campaignKinds[number], {
        matrixId: value("matrix"),
        seedsPerCell: optionalInteger("runs"),
        seedStart: optionalInteger("seed-start"),
        shardCount: optionalInteger("shards"),
        traceMode: traceMode()
      })
    : isAttentionManifest(manifestDocument)
      ? manifestDocument
      : (() => { throw new Error("attention manifest is invalid"); })();

  if (value("dry-run") === "true") {
    const runs = expectedAttentionRunCount(draft);
    const cells = draft.matchups.reduce((sum, matchup) => sum +
      matchup.variantIds.length * matchup.playerOnePolicyIds.length * matchup.playerTwoPolicyIds.length, 0);
    console.log(JSON.stringify({
      matrixId: draft.matrixId,
      campaignKind: draft.campaignKind,
      cells,
      seedsPerCell: draft.seedsPerCell,
      shards: draft.shardCount,
      runs,
      estimatedCompressedBytes: runs * 512,
      estimateBasis: "512 compressed bytes per summary run"
    }, null, 2));
    return;
  }

  const matrix = await sealAttentionMatrix(draft, { canonical });
  const outputDir = value("out") ?? defaultOutputDirectory();
  if (value("prepare") === "true") {
    const path = await ensureAttentionManifest(matrix, outputDir);
    console.log(JSON.stringify({
      matrixId: matrix.matrixId,
      campaignKind: matrix.campaignKind,
      manifest: path,
      manifestHash: matrix.provenance.manifestHash,
      runs: expectedAttentionRunCount(matrix)
    }, null, 2));
    return;
  }
  if (value("all-shards") === "true") {
    const paths: string[] = [];
    for (let index = 0; index < matrix.shardCount; index += 1) {
      paths.push(await writeAttentionShard(matrix, index, outputDir, { canonical }));
    }
    const report = await writeAttentionReport(`${outputDir}/${matrix.matrixId}`);
    console.log(JSON.stringify({ matrixId: matrix.matrixId, paths, report }, null, 2));
    return;
  }
  const shardIndex = optionalInteger("shard") ?? 0;
  if (shardIndex < 0 || shardIndex >= matrix.shardCount) {
    throw new Error(`shard must be between 0 and ${matrix.shardCount - 1}`);
  }
  const path = await writeAttentionShard(matrix, shardIndex, outputDir, { canonical });
  console.log(JSON.stringify({ matrixId: matrix.matrixId, shardIndex, path }, null, 2));
}

function optionalInteger(name: string): number | undefined {
  const raw = value(name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error(`--${name} must be an integer`);
  return parsed;
}

function traceMode(): "summary" | "hash" | "full" | undefined {
  const requested = value("trace-mode");
  if (requested === undefined) return undefined;
  if (requested !== "summary" && requested !== "hash" && requested !== "full") {
    throw new Error(`invalid trace mode: ${requested}`);
  }
  return requested;
}

function defaultOutputDirectory(): string {
  return /[\\/]apps[\\/]lab$/.test(process.cwd()) ? "../../data/lab" : "data/lab";
}

async function isAttentionMatrixDirectory(directory: string): Promise<boolean> {
  try {
    const document = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8")) as unknown;
    return isAttentionManifest(document);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function normalizeDataPath(path: string): string {
  return /[\\/]apps[\\/]lab$/.test(process.cwd()) && path.startsWith("data/") ? `../../${path}` : path;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
