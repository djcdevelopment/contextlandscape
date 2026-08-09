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
import { SimulationMatrixSchema } from "@landscape/contracts";
import {
  auditAttentionMatrix,
  compareAttentionMatrices,
  ensureAttentionManifest,
  expectedAttentionRunCount,
  isAttentionManifest,
  recordAttentionExperiment,
  sealAttentionMatrix,
  writeAttentionReport,
  writeAttentionShard
} from "./attention-lab.js";
import { createAttentionCampaignDraft } from "./attention-campaigns.js";

function value(name: string): string | undefined {
  const argument = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  const envName = name === "matrix" ? "LAB_MATRIX_ID" : `LAB_${name.replace(/-/g, "_").toUpperCase()}`;
  return argument?.split("=").slice(1).join("=") ?? process.env[envName];
}

async function main(): Promise<void> {
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

async function runAttentionCommand(
  requestedCampaign: string | undefined,
  manifestDocument: unknown,
  canonical: boolean
): Promise<void> {
  const campaignKinds = ["stationary-train", "capacity-train", "holdout"] as const;
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
    console.log(JSON.stringify({ matrix, manifest: path, runs: expectedAttentionRunCount(matrix) }, null, 2));
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
