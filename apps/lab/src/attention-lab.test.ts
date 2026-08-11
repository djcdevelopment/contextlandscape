import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttentionMatrixDraftSchema, type AttentionMatrixDraft, type AttentionTraceMode } from "@landscape/contracts";
import { describe, expect, it } from "vitest";
import { createAttentionCampaignDraft } from "./attention-campaigns.js";
import {
  auditAttentionMatrix,
  compareAttentionMatrices,
  expectedAttentionRunCount,
  recordAttentionExperiment,
  sealAttentionMatrix,
  verifyAttentionArtifacts,
  writeAttentionReport,
  writeAttentionShard
} from "./attention-lab.js";
import { readGzipJsonLines } from "./artifact-io.js";
import { hashManifest } from "./provenance.js";

const revision = "c".repeat(40);
const tree = "d".repeat(40);

function sourceEnvironment(): NodeJS.ProcessEnv {
  return {
    LAB_SOURCE_REVISION: revision,
    LAB_SOURCE_TREE: tree,
    LAB_WORKSPACE_DIRTY: "false"
  };
}

function tinyDraft(
  matrixId: string,
  traceMode: AttentionTraceMode = "summary",
  options: { seedStart?: number; seedsPerCell?: number; shardCount?: number } = {}
): AttentionMatrixDraft {
  const campaign = createAttentionCampaignDraft("holdout", {
    matrixId,
    traceMode,
    seedStart: options.seedStart ?? 900,
    seedsPerCell: options.seedsPerCell ?? 2,
    shardCount: options.shardCount ?? 2,
    createdAt: "2026-08-09T00:00:00.000Z"
  });
  const matchup = campaign.matchups[0];
  const compositionIds = new Set([matchup.playerOneCompositionId, matchup.playerTwoCompositionId]);
  const policyIds = new Set([...matchup.playerOnePolicyIds, ...matchup.playerTwoPolicyIds]);
  return AttentionMatrixDraftSchema.parse({
    ...campaign,
    scenarios: campaign.scenarios.filter((scenario) => scenario.scenarioId === matchup.scenarioId),
    compositions: campaign.compositions.filter((composition) => compositionIds.has(composition.compositionId)),
    variants: campaign.variants.filter((variant) => matchup.variantIds.includes(variant.variantId)),
    policies: campaign.policies.filter((policy) => policyIds.has(policy.policyId)),
    matchups: [matchup]
  });
}

async function firstRecord(path: string): Promise<Record<string, unknown>> {
  for await (const value of readGzipJsonLines(path)) return value as Record<string, unknown>;
  throw new Error("Expected a run record");
}

describe("attention matrix lab", () => {
  it("seals the full resolved model and keeps paired policy blocks on one shard", async () => {
    const draft = tinyDraft("attention-counts", "summary", { seedsPerCell: 3, shardCount: 2 });
    const matrix = await sealAttentionMatrix(draft, { canonical: true, env: sourceEnvironment() });

    expect(matrix.provenance.engineVersion).toBe("1.0.0");
    expect(matrix.provenance.manifestHash).toBe(hashManifest(matrix));
    expect(expectedAttentionRunCount(matrix)).toBe(6);
    // Each seed is a two-policy paired block, so records never split 1/1 across shards.
    expect([expectedAttentionRunCount(matrix, 0), expectedAttentionRunCount(matrix, 1)].sort()).toEqual([2, 4]);
  });

  it("streams immutable shards, verifies exact coverage, reports, audits, and archives compact evidence", async () => {
    const output = await mkdtemp(join(tmpdir(), "attention-history-"));
    const matrix = await sealAttentionMatrix(tinyDraft("attention-history"), {
      canonical: true,
      env: sourceEnvironment()
    });
    const paths = [];
    for (let index = 0; index < matrix.shardCount; index += 1) {
      paths.push(await writeAttentionShard(matrix, index, output, { env: sourceEnvironment() }));
    }
    await expect(writeAttentionShard(matrix, 0, output, { env: sourceEnvironment() })).resolves.toBe(paths[0]);
    const matrixDir = join(output, matrix.matrixId);
    const artifacts = await verifyAttentionArtifacts(matrixDir);
    expect(artifacts.completions.size).toBe(2);

    const reportPath = await writeAttentionReport(matrixDir);
    await expect(writeAttentionReport(matrixDir)).resolves.toBe(reportPath);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.runs).toBe(4);
    expect(report.cells).toHaveLength(2);
    expect(report.pairwise).toHaveLength(1);
    expect(report.gates).toHaveLength(5);
    await expect(auditAttentionMatrix(matrixDir, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "exact",
      artifactIntegrity: "verified",
      shardIntegrity: "verified",
      reportIntegrity: "verified"
    });

    const ledgerPath = join(output, "evidence", "ledger.json");
    const entry = await recordAttentionExperiment(matrixDir, ledgerPath, { stage: "holdout", disposition: "revise" });
    expect(entry).toMatchObject({ matrixId: matrix.matrixId, manifestHash: matrix.provenance.manifestHash, runs: 4 });
    const archivedDir = join(output, "evidence", matrix.matrixId);
    await expect(auditAttentionMatrix(archivedDir, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "exact",
      shardIntegrity: "unavailable",
      reportIntegrity: "verified"
    });
  });

  it("produces identical terminal outcomes in summary, hash, and full trace modes", async () => {
    const root = await mkdtemp(join(tmpdir(), "attention-traces-"));
    const records: Record<string, unknown>[] = [];
    for (const traceMode of ["summary", "hash", "full"] as const) {
      const output = join(root, traceMode);
      const matrix = await sealAttentionMatrix(tinyDraft("same-world", traceMode, { seedsPerCell: 1, shardCount: 1 }), {
        env: sourceEnvironment()
      });
      const path = await writeAttentionShard(matrix, 0, output, { env: sourceEnvironment() });
      records.push(await firstRecord(path));
    }
    expect(new Set(records.map((record) => record.stateHash))).toHaveLength(1);
    expect(new Set(records.map((record) => record.outcomeHash))).toHaveLength(1);
    expect(records.map((record) => record.players)).toEqual([records[0].players, records[0].players, records[0].players]);
    expect(records[0].eventHash).toBeNull();
    expect(records[1].eventHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(records[2].eventHash).toBe(records[1].eventHash);
  });

  it("detects tampering and compares only matrices with an identical model hash", async () => {
    const output = await mkdtemp(join(tmpdir(), "attention-compare-"));
    const create = async (matrixId: string, seedStart: number) => {
      const matrix = await sealAttentionMatrix(tinyDraft(matrixId, "summary", { seedStart, seedsPerCell: 1, shardCount: 1 }), {
        env: sourceEnvironment()
      });
      await writeAttentionShard(matrix, 0, output, { env: sourceEnvironment() });
      const directory = join(output, matrixId);
      await writeAttentionReport(directory);
      return directory;
    };
    const left = await create("attention-left", 100);
    const right = await create("attention-right", 200);
    await expect(compareAttentionMatrices(left, right)).resolves.toMatchObject({
      matrixKind: "attention-command",
      leftMatrixId: "attention-left",
      rightMatrixId: "attention-right"
    });

    const reportPath = join(right, "report.json");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    report.runs += 1;
    await writeFile(reportPath, JSON.stringify(report));
    await expect(auditAttentionMatrix(right, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "integrity-failed",
      reportIntegrity: "failed"
    });
    await expect(compareAttentionMatrices(left, right)).rejects.toThrow(/integrity checks/);

    // Temp evidence can be removed without touching repository state.
    await rm(output, { recursive: true, force: true });
  });
});
