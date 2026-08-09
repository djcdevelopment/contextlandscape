import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditMatrix,
  compareMatrices,
  createExecutionMatrix,
  createMatrix,
  ensureMatrixManifest,
  matrixProvenanceId,
  recordExperiment,
  resolveMatrixDirectory,
  runMatrix,
  sealExecutionMatrix,
  writeReport,
  writeShard
} from "./lab.js";
import { hashManifest } from "./provenance.js";

const revision = "a".repeat(40);
const tree = "b".repeat(40);

function sourceEnvironment(dirty = false): NodeJS.ProcessEnv {
  return {
    LAB_SOURCE_REVISION: revision,
    LAB_SOURCE_TREE: tree,
    LAB_WORKSPACE_DIRTY: String(dirty)
  };
}

describe("matrix provenance and history", () => {
  it("seals new matrices and links every run to the immutable manifest", async () => {
    const matrix = await createExecutionMatrix({
      matrixId: "sealed-test",
      scenarioIds: ["false-bottleneck"],
      runsPerCell: 1,
      policyCount: 2,
      tuningCount: 1,
      shardCount: 1
    }, { canonical: true, env: sourceEnvironment() });

    expect(matrix.schemaVersion).toBe(2);
    expect(matrix.provenance.canonical).toBe(true);
    expect(matrix.provenance.sourceRevision).toBe(revision);
    expect(matrix.provenance.manifestHash).toBe(hashManifest(matrix));
    const records = runMatrix(matrix, 0, "unused");
    expect(records.every((record) => record.manifestHash === matrix.provenance.manifestHash)).toBe(true);
    expect(records.every((record) => record.provenanceId === matrixProvenanceId(matrix))).toBe(true);
  });

  it("refuses canonical campaigns from dirty source", async () => {
    await expect(createExecutionMatrix({ matrixId: "dirty-test" }, {
      canonical: true,
      env: sourceEnvironment(true)
    })).rejects.toThrow(/clean Git worktree/);
  });

  it("refuses to execute a sealed manifest under a different runtime or without its pinned image", async () => {
    const matrix = await createExecutionMatrix({ matrixId: "runtime-test" }, {
      canonical: true,
      env: sourceEnvironment(),
      imageDigest: "sha256:test-image"
    });
    await expect(sealExecutionMatrix(matrix, { env: sourceEnvironment() })).rejects.toThrow(/pinned worker image digest/);

    const runtimeDraft = {
      ...matrix,
      provenance: { ...matrix.provenance, nodeVersion: "v0.0.0", imageDigest: "sha256:test-image", manifestHash: "unsealed" }
    };
    const runtimeMismatch = {
      ...runtimeDraft,
      provenance: { ...runtimeDraft.provenance, manifestHash: hashManifest(runtimeDraft) }
    };
    await expect(sealExecutionMatrix(runtimeMismatch, {
      env: { ...sourceEnvironment(), LAB_IMAGE_DIGEST: "sha256:test-image" }
    })).rejects.toThrow(/current runtime/);
  });

  it("freezes one manifest and rejects a conflicting writer", async () => {
    const output = await mkdtemp(join(tmpdir(), "landscape-manifest-"));
    const first = await createExecutionMatrix({ matrixId: "one-manifest" }, { env: sourceEnvironment() });
    const second = await createExecutionMatrix({
      matrixId: "one-manifest",
      seedStart: 99
    }, { env: sourceEnvironment() });
    await ensureMatrixManifest(first, output);
    await expect(ensureMatrixManifest(second, output)).rejects.toThrow(/different frozen manifest/);
  });

  it("verifies shards and reports, audits the source, and records compact history", async () => {
    const output = await mkdtemp(join(tmpdir(), "landscape-history-"));
    const matrix = await createExecutionMatrix({
      matrixId: "history-test",
      scenarioIds: ["false-bottleneck"],
      runsPerCell: 1,
      policyCount: 2,
      tuningCount: 1,
      shardCount: 2
    }, { canonical: true, env: sourceEnvironment() });
    await writeShard(matrix, 0, output);
    await writeShard(matrix, 1, output);
    const matrixDir = resolveMatrixDirectory(output, matrix.matrixId);
    const reportPath = await writeReport(matrixDir);
    const report = JSON.parse(await readFile(reportPath, "utf8"));

    expect(report.manifestHash).toBe(matrix.provenance.manifestHash);
    expect(report.provenance).toEqual(matrix.provenance);
    expect(report.shards).toHaveLength(2);
    await expect(auditMatrix(matrixDir, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "exact",
      artifactIntegrity: "verified",
      sourceMatch: true,
      modelMatch: true,
      reportIntegrity: "verified"
    });

    const ledgerPath = join(output, "evidence", "ledger.json");
    await recordExperiment(matrixDir, ledgerPath, {
      stage: "train",
      hypothesis: "Provenance survives aggregation"
    });
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(ledger.experiments).toHaveLength(1);
    expect(ledger.experiments[0]).toMatchObject({
      matrixId: matrix.matrixId,
      stage: "train",
      sourceRevision: revision,
      manifestHash: matrix.provenance.manifestHash,
      reportHash: report.reportHash
    });
    const archivedDir = join(output, "evidence", matrix.matrixId);
    expect(JSON.parse(await readFile(join(archivedDir, "report.json"), "utf8")).reportHash).toBe(report.reportHash);
    await expect(auditMatrix(archivedDir, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "exact",
      artifactIntegrity: "verified",
      shardIntegrity: "unavailable",
      reportIntegrity: "verified"
    });
  });

  it("detects report tampering and preserves completed legacy reports", async () => {
    const output = await mkdtemp(join(tmpdir(), "landscape-tamper-"));
    const matrix = await createExecutionMatrix({
      matrixId: "tamper-test",
      scenarioIds: ["false-bottleneck"],
      runsPerCell: 1,
      policyCount: 2,
      shardCount: 1
    }, { env: sourceEnvironment() });
    await writeShard(matrix, 0, output);
    const matrixDir = resolveMatrixDirectory(output, matrix.matrixId);
    const reportPath = await writeReport(matrixDir);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    report.runs += 1;
    await writeFile(reportPath, JSON.stringify(report));
    await expect(auditMatrix(matrixDir, { env: sourceEnvironment() })).resolves.toMatchObject({
      status: "integrity-failed",
      reportIntegrity: "failed"
    });

    const legacy = createMatrix({
      matrixId: "legacy-preserved",
      scenarioIds: ["false-bottleneck"],
      runsPerCell: 1,
      policyCount: 2,
      shardCount: 1
    });
    await writeShard(legacy, 0, output);
    const legacyDir = resolveMatrixDirectory(output, legacy.matrixId);
    const legacyReportPath = join(legacyDir, "report.json");
    await writeFile(legacyReportPath, "{\"historical\":true}\n");
    await writeReport(legacyDir);
    expect(await readFile(legacyReportPath, "utf8")).toBe("{\"historical\":true}\n");
    await expect(auditMatrix(legacyDir)).resolves.toMatchObject({
      status: "legacy-unverifiable",
      artifactIntegrity: "unverifiable"
    });
  });

  it("compares build dimensions and aligned outcome cells only after integrity checks", async () => {
    const output = await mkdtemp(join(tmpdir(), "landscape-compare-"));
    const make = async (matrixId: string, seedStart: number) => {
      const matrix = await createExecutionMatrix({
        matrixId,
        scenarioIds: ["false-bottleneck"],
        runsPerCell: 1,
        policyCount: 2,
        shardCount: 1,
        seedStart
      }, { env: sourceEnvironment() });
      await writeShard(matrix, 0, output);
      const directory = resolveMatrixDirectory(output, matrixId);
      await writeReport(directory);
      return directory;
    };
    const left = await make("compare-left", 0);
    const right = await make("compare-right", 1000);
    const comparison = await compareMatrices(left, right);

    expect(comparison.dimensions.seedStart).toEqual([0, 1000]);
    expect(comparison.cells.length).toBeGreaterThan(0);
    expect(comparison.cells.every((cell) => cell.status === "shared")).toBe(true);
    expect(comparison.audits.left.artifactIntegrity).toBe("verified");
    expect(comparison.audits.right.reportIntegrity).toBe("verified");
  });

  it("rejects traversal in matrix identifiers", () => {
    expect(() => resolveMatrixDirectory("data/lab", "../outside")).toThrow(/Unsafe matrix id/);
  });
});
