import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export type Sha256Digest = `sha256:${string}`;

export type GitCommandResult = {
  exitCode: number;
  stdout: string;
};

export type GitCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) => Promise<GitCommandResult>;

export type GitSourceUnavailableReason =
  | "git-unavailable"
  | "not-a-worktree"
  | "git-command-failed"
  | "invalid-git-output"
  | "invalid-environment";

export type GitSourceState =
  | {
      available: true;
      sourceRevision: string;
      sourceTree: string;
      workspaceDirty: boolean;
    }
  | {
      available: false;
      sourceRevision: null;
      sourceTree: null;
      workspaceDirty: null;
      reason: GitSourceUnavailableReason;
    };

export type CaptureGitSourceOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  run?: GitCommandRunner;
};

export class CanonicalSourceError extends Error {
  readonly code: "source-unavailable" | "workspace-dirty";

  constructor(code: "source-unavailable" | "workspace-dirty", message: string) {
    super(message);
    this.name = "CanonicalSourceError";
    this.code = code;
  }
}

function describePath(path: readonly (string | number)[]): string {
  if (path.length === 0) return "$";
  return `$${path.map((part) => typeof part === "number" ? `[${part}]` : `[${JSON.stringify(part)}]`).join("")}`;
}

function canonicalize(value: unknown, ancestors: Set<object>, path: readonly (string | number)[]): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${describePath(path)} is not valid JSON`);
      return JSON.stringify(value);
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(`Unsupported ${typeof value} at ${describePath(path)} is not valid JSON`);
    case "object": {
      if (ancestors.has(value)) throw new TypeError(`Circular value at ${describePath(path)} cannot be canonicalized`);
      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          const entries: string[] = [];
          for (let index = 0; index < value.length; index += 1) {
            if (!Object.hasOwn(value, index)) throw new TypeError(`Sparse array at ${describePath(path)} is not valid JSON`);
            entries.push(canonicalize(value[index], ancestors, [...path, index]));
          }
          return `[${entries.join(",")}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError(`Non-plain object at ${describePath(path)} cannot be canonicalized`);
        }
        const record = value as Record<string, unknown>;
        const entries = Object.keys(record)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors, [...path, key])}`);
        return `{${entries.join(",")}}`;
      } finally {
        ancestors.delete(value);
      }
    }
  }
  throw new TypeError(`Unsupported value at ${describePath(path)} is not valid JSON`);
}

/** Serialize a JSON value with recursively sorted object keys and preserved array order. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set(), []);
}

/** Alias that reads naturally at call sites which need the serialized value. */
export const canonicalizeJson = canonicalJson;

export function sha256Bytes(value: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256Value(value: unknown): Sha256Digest {
  return sha256Bytes(canonicalJson(value));
}

/**
 * Hash a manifest without including its self-referential hash field. No input is
 * mutated; only the exact `provenance.manifestHash` property is omitted.
 */
export function hashManifest(value: unknown): Sha256Digest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return sha256Value(value);
  const manifest = value as Record<string, unknown>;
  const provenance = manifest.provenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) return sha256Value(value);
  const { manifestHash: _manifestHash, ...hashableProvenance } = provenance as Record<string, unknown>;
  return sha256Value({ ...manifest, provenance: hashableProvenance });
}

/** Hash a file as a stream. File bytes and contents are never returned to the caller. */
export async function sha256File(path: string): Promise<Sha256Digest> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Uint8Array);
  return `sha256:${hash.digest("hex")}`;
}

function defaultGitRunner(
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout) => {
        if (!error) {
          resolve({ exitCode: 0, stdout });
          return;
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(Object.assign(new Error("Git executable is unavailable"), { code: "ENOENT" }));
          return;
        }
        resolve({ exitCode: typeof error.code === "number" ? error.code : 1, stdout: typeof stdout === "string" ? stdout : "" });
      }
    );
  });
}

function unavailable(reason: GitSourceUnavailableReason): GitSourceState {
  return {
    available: false,
    sourceRevision: null,
    sourceTree: null,
    workspaceDirty: null,
    reason
  };
}

function isGitObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
}

function sourceFromEnvironment(env: NodeJS.ProcessEnv): GitSourceState | undefined {
  const revision = env.LAB_SOURCE_REVISION;
  const tree = env.LAB_SOURCE_TREE;
  const dirty = env.LAB_WORKSPACE_DIRTY;
  if (revision === undefined && tree === undefined && dirty === undefined) return undefined;
  if (!revision || !tree || dirty === undefined || !isGitObjectId(revision) || !isGitObjectId(tree)) {
    return unavailable("invalid-environment");
  }
  const normalizedDirty = dirty.trim().toLowerCase();
  if (!["true", "false", "1", "0"].includes(normalizedDirty)) return unavailable("invalid-environment");
  return {
    available: true,
    sourceRevision: revision.toLowerCase(),
    sourceTree: tree.toLowerCase(),
    workspaceDirty: normalizedDirty === "true" || normalizedDirty === "1"
  };
}

/** Locate the checkout root for tools that need repository-relative paths. */
export async function discoverGitRepository(options: CaptureGitSourceOptions = {}): Promise<string | null> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const run = options.run ?? defaultGitRunner;
  try {
    const result = await run("git", ["rev-parse", "--show-toplevel"], { cwd, env });
    const repositoryRoot = result.stdout.trim();
    return result.exitCode === 0 && repositoryRoot.length > 0 ? repositoryRoot : null;
  } catch {
    return null;
  }
}

/**
 * Inspect the current Git checkout without invoking a shell. Failures are reduced
 * to a small reason enum so command output, file names, and file contents cannot
 * escape into manifests or logs through this API.
 */
export async function captureGitSource(options: CaptureGitSourceOptions = {}): Promise<GitSourceState> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const run = options.run ?? defaultGitRunner;
  const invoke = (args: readonly string[]) => run("git", args, { cwd, env });

  // Release containers intentionally omit .git. Their host launcher can freeze
  // these three values into the worker environment before a campaign begins.
  const injected = sourceFromEnvironment(env);
  if (injected) return injected;

  let inside: GitCommandResult;
  try {
    inside = await invoke(["rev-parse", "--is-inside-work-tree"]);
  } catch (error) {
    return unavailable((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? "git-unavailable" : "git-command-failed");
  }
  if (inside.exitCode !== 0 || inside.stdout.trim() !== "true") return unavailable("not-a-worktree");

  try {
    const revision = await invoke(["rev-parse", "--verify", "HEAD"]);
    const tree = await invoke(["rev-parse", "--verify", "HEAD^{tree}"]);
    const status = await invoke(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    if (revision.exitCode !== 0 || tree.exitCode !== 0 || status.exitCode !== 0) {
      return unavailable("git-command-failed");
    }

    const sourceRevision = revision.stdout.trim();
    const sourceTree = tree.stdout.trim();
    if (!isGitObjectId(sourceRevision) || !isGitObjectId(sourceTree)) return unavailable("invalid-git-output");
    return {
      available: true,
      sourceRevision: sourceRevision.toLowerCase(),
      sourceTree: sourceTree.toLowerCase(),
      workspaceDirty: status.stdout.length > 0
    };
  } catch (error) {
    return unavailable((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? "git-unavailable" : "git-command-failed");
  }
}

/** Require source identity that is suitable for a reproducible, canonical campaign. */
export function assertCanonicalSource(source: GitSourceState): asserts source is Extract<GitSourceState, { available: true }> {
  if (!source.available) {
    throw new CanonicalSourceError("source-unavailable", `Canonical run requires Git source metadata (${source.reason})`);
  }
  if (source.workspaceDirty) {
    throw new CanonicalSourceError("workspace-dirty", "Canonical run requires a clean Git worktree");
  }
}
