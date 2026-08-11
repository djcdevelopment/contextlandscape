import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalSourceError,
  assertCanonicalSource,
  canonicalJson,
  captureGitSource,
  discoverGitRepository,
  hashManifest,
  sha256File,
  sha256Value,
  type GitCommandRunner
} from "./provenance.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("provenance JSON and hashing", () => {
  it("canonicalizes object keys recursively while preserving array order", () => {
    const first = { z: 1, nested: { beta: true, alpha: null }, values: [3, 2, 1] };
    const second = { values: [3, 2, 1], nested: { alpha: null, beta: true }, z: 1 };

    expect(canonicalJson(first)).toBe('{"nested":{"alpha":null,"beta":true},"values":[3,2,1],"z":1}');
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(sha256Value(second)).toBe(sha256Value(first));
    expect(sha256Value({ ...second, values: [1, 2, 3] })).not.toBe(sha256Value(first));
  });

  it("omits only the self-referential manifest hash", () => {
    const manifest = {
      matrixId: "matrix-1",
      manifestHash: "a distinct top-level field",
      provenance: { sourceRevision: "abc", manifestHash: "sha256:old" }
    };
    const expected = sha256Value({
      matrixId: "matrix-1",
      manifestHash: "a distinct top-level field",
      provenance: { sourceRevision: "abc" }
    });

    expect(hashManifest(manifest)).toBe(expected);
    expect(hashManifest({ ...manifest, provenance: { ...manifest.provenance, manifestHash: expected } })).toBe(expected);
    expect(manifest.provenance.manifestHash).toBe("sha256:old");
  });

  it("rejects values that cannot be represented as unambiguous JSON", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(/Unsupported undefined/);
    expect(() => canonicalJson(Number.NaN)).toThrow(/Non-finite number/);
    expect(() => canonicalJson(new Date(0))).toThrow(/Non-plain object/);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(/Circular value/);
  });

  it("hashes file bytes without returning their contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "landscape-provenance-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "input.txt");
    const contents = "private matrix payload\n";
    await writeFile(path, contents);

    const expected = `sha256:${createHash("sha256").update(contents).digest("hex")}`;
    const result = await sha256File(path);
    expect(result).toBe(expected);
    expect(result).not.toContain(contents.trim());
  });
});

describe("Git source capture", () => {
  const revision = "a".repeat(40);
  const tree = "b".repeat(40);

  function runnerFor(status: string): GitCommandRunner {
    return async (_executable, args) => {
      const command = args.join(" ");
      if (command === "rev-parse --is-inside-work-tree") return { exitCode: 0, stdout: "true\n" };
      if (command === "rev-parse --verify HEAD") return { exitCode: 0, stdout: `${revision}\n` };
      if (command === "rev-parse --verify HEAD^{tree}") return { exitCode: 0, stdout: `${tree}\n` };
      if (command === "status --porcelain=v1 -z --untracked-files=all") return { exitCode: 0, stdout: status };
      throw new Error("Unexpected command");
    };
  }

  it("captures revision, committed tree, and clean state using injected execution context", async () => {
    const calls: Array<{ executable: string; args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
    const delegated = runnerFor("");
    const run: GitCommandRunner = vi.fn(async (executable, args, options) => {
      calls.push({ executable, args, ...options });
      return delegated(executable, args, options);
    });
    const env = { LAB_TEST_TOKEN: "not-returned" };

    const source = await captureGitSource({ cwd: "C:\\test-repository", env, run });

    expect(source).toEqual({ available: true, sourceRevision: revision, sourceTree: tree, workspaceDirty: false });
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.executable === "git" && call.cwd === "C:\\test-repository" && call.env === env)).toBe(true);
    expect(JSON.stringify(source)).not.toContain("LAB_TEST_TOKEN");
    expect(() => assertCanonicalSource(source)).not.toThrow();
  });

  it("discovers a repository root without using a shell", async () => {
    const run: GitCommandRunner = vi.fn(async () => ({ exitCode: 0, stdout: "C:/repo/root\n" }));
    await expect(discoverGitRepository({ cwd: "C:/repo/root/apps/lab", run, env: {} })).resolves.toBe("C:/repo/root");
    expect(run).toHaveBeenCalledWith("git", ["rev-parse", "--show-toplevel"], {
      cwd: "C:/repo/root/apps/lab",
      env: {}
    });
  });

  it("uses complete, validated source metadata in Git-less containers", async () => {
    const run: GitCommandRunner = vi.fn(async () => { throw new Error("Git must not run"); });
    const source = await captureGitSource({
      env: {
        LAB_SOURCE_REVISION: revision.toUpperCase(),
        LAB_SOURCE_TREE: tree.toUpperCase(),
        LAB_WORKSPACE_DIRTY: "0"
      },
      run
    });

    expect(source).toEqual({ available: true, sourceRevision: revision, sourceTree: tree, workspaceDirty: false });
    expect(run).not.toHaveBeenCalled();
    expect(() => assertCanonicalSource(source)).not.toThrow();
  });

  it("does not silently fall back when container metadata is partial", async () => {
    const run: GitCommandRunner = vi.fn(async () => ({ exitCode: 0, stdout: "true\n" }));
    const source = await captureGitSource({ env: { LAB_SOURCE_REVISION: revision }, run });

    expect(source).toMatchObject({ available: false, reason: "invalid-environment" });
    expect(run).not.toHaveBeenCalled();
    expect(() => assertCanonicalSource(source)).toThrow(/invalid-environment/);
  });

  it("reports dirty state without exposing status output", async () => {
    const privateStatus = " M data/private-customer-name.json\n";
    const source = await captureGitSource({ run: runnerFor(privateStatus) });

    expect(source).toEqual({ available: true, sourceRevision: revision, sourceTree: tree, workspaceDirty: true });
    expect(JSON.stringify(source)).not.toContain("private-customer-name");
    expect(() => assertCanonicalSource(source)).toThrowError(CanonicalSourceError);
    try {
      assertCanonicalSource(source);
    } catch (error) {
      expect(error).toMatchObject({ code: "workspace-dirty" });
      expect(String(error)).not.toContain("private-customer-name");
    }
  });

  it("represents missing Git and non-repositories without throwing", async () => {
    const missing = await captureGitSource({
      run: async () => { throw Object.assign(new Error("secret stderr"), { code: "ENOENT" }); }
    });
    const nonRepository = await captureGitSource({
      run: async () => ({ exitCode: 128, stdout: "sensitive command output" })
    });

    expect(missing).toEqual({
      available: false,
      sourceRevision: null,
      sourceTree: null,
      workspaceDirty: null,
      reason: "git-unavailable"
    });
    expect(nonRepository).toEqual({
      available: false,
      sourceRevision: null,
      sourceTree: null,
      workspaceDirty: null,
      reason: "not-a-worktree"
    });
    expect(JSON.stringify(missing)).not.toContain("secret stderr");
    expect(JSON.stringify(nonRepository)).not.toContain("sensitive command output");
    expect(() => assertCanonicalSource(missing)).toThrow(/Canonical run requires Git source metadata/);
  });

  it("rejects malformed object IDs and sanitizes later command failures", async () => {
    const malformed: GitCommandRunner = async (_executable, args) => {
      if (args.includes("--is-inside-work-tree")) return { exitCode: 0, stdout: "true\n" };
      if (args.includes("HEAD^{tree}")) return { exitCode: 0, stdout: `${tree}\n` };
      if (args[0] === "status") return { exitCode: 0, stdout: "" };
      return { exitCode: 0, stdout: "not-an-object-id\n" };
    };
    const failed: GitCommandRunner = async (_executable, args) => {
      if (args.includes("--is-inside-work-tree")) return { exitCode: 0, stdout: "true\n" };
      return { exitCode: 1, stdout: "private failure detail" };
    };

    await expect(captureGitSource({ run: malformed })).resolves.toMatchObject({ available: false, reason: "invalid-git-output" });
    const failure = await captureGitSource({ run: failed });
    expect(failure).toMatchObject({ available: false, reason: "git-command-failed" });
    expect(JSON.stringify(failure)).not.toContain("private failure detail");
  });
});
