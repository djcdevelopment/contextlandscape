import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AttentionV4PressureSample } from "@landscape/engine";
import {
  ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS,
  ATTENTION_V4_LANDSCAPE_OFFSETS,
  ATTENTION_V4_LANDSCAPE_PRESSURES,
  ATTENTION_V4_LANDSCAPE_REPLAY_MODULO,
  attentionV4LandscapeMatchCount,
  createAttentionV4LandscapeEdges,
  mergeAttentionV4LandscapeShards,
  runAttentionV4LandscapeShard,
  type AttentionV4LandscapeReport,
  type AttentionV4LandscapeShard,
  type AttentionV4LandscapeStudyId
} from "./attention-v4-landscape.js";

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function integerArgument(name: string, fallback: number): number {
  const parsed = Number(argument(name) ?? fallback);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function parsePressures(value: string | null): AttentionV4PressureSample[] {
  if (value === null) return [...ATTENTION_V4_LANDSCAPE_PRESSURES];
  const parsed = value.split(",").map(Number);
  if (parsed.length === 0 || new Set(parsed).size !== parsed.length || parsed.some((item) => !Number.isInteger(item) || item < 0 || item > 3)) {
    throw new Error("pressures must be a unique comma-separated subset of 0,1,2,3");
  }
  return parsed as AttentionV4PressureSample[];
}

function parseOffsets(value: string | null): number[] {
  if (value === null) return [...ATTENTION_V4_LANDSCAPE_OFFSETS];
  const parsed = value.split(",").map(Number);
  if (parsed.length === 0 || new Set(parsed).size !== parsed.length || parsed.some((item) => !Number.isInteger(item))) {
    throw new Error("offsets must be a unique comma-separated integer list");
  }
  return parsed;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

const workers = integerArgument("workers", 1);
const replayModulo = integerArgument("replay-modulo", ATTENTION_V4_LANDSCAPE_REPLAY_MODULO);
const edgeLimitValue = argument("edge-limit");
const edgeLimit = edgeLimitValue === null ? null : Number(edgeLimitValue);
const pressures = parsePressures(argument("pressures"));
const offsets = parseOffsets(argument("offsets"));
const expandedTopology = sameNumbers(offsets, ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS);
const canonicalTopology = sameNumbers(offsets, ATTENTION_V4_LANDSCAPE_OFFSETS);
if (!canonicalTopology && !expandedTopology) throw new Error("offsets must select the canonical or expanded topology design");
const studyId: AttentionV4LandscapeStudyId = expandedTopology
  ? "attention-v4.2-expanded-topology-1"
  : "attention-v4.2-descriptive-landscape-1";
const shard = argument("shard")?.split("/").map(Number) ?? null;
const write = !process.argv.includes("--no-write");
const quiet = process.argv.includes("--quiet");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultOutputDirectory = expandedTopology ? "attention-v4.2-expanded-topology" : "attention-v4.2-descriptive-landscape";
const output = resolve(argument("out") ?? join(repositoryRoot, "data", "experiments", defaultOutputDirectory, "report.json"));

if (workers < 1 || workers > 24) throw new Error("workers must be an integer from 1 through 24");
if (replayModulo < 0) throw new Error("replay-modulo must be a nonnegative integer");
if (shard && (shard.length !== 2 || !Number.isInteger(shard[0]) || !Number.isInteger(shard[1]) || shard[0] < 0 || shard[0] >= shard[1])) {
  throw new Error("shard must use zero-based INDEX/COUNT syntax");
}

const allEdges = createAttentionV4LandscapeEdges(offsets);
if (edgeLimit !== null && (!Number.isInteger(edgeLimit) || edgeLimit < 1 || edgeLimit > allEdges.length)) {
  throw new Error(`edge-limit must be an integer from 1 through ${allEdges.length}`);
}
const selectedEdges = edgeLimit === null ? allEdges : allEdges.slice(0, edgeLimit);
const expectedMatches = attentionV4LandscapeMatchCount(selectedEdges, pressures.length);
const nonSelfEdgeCount = allEdges.filter((edge) => edge.kind === "matchup").length;
const selfPlayEdgeCount = allEdges.filter((edge) => edge.kind === "self-play").length;
const formula = `${nonSelfEdgeCount.toLocaleString("en-US")} sparse pairs x 2 seats x ${pressures.length} pressures + ${selfPlayEdgeCount.toLocaleString("en-US")} self-play pairs x ${pressures.length} pressures`;
const studyLabel = expandedTopology ? "attention-v4 expanded topology" : "attention-v4 descriptive landscape";

async function runChild(index: number, count: number, path: string): Promise<void> {
  const args = [
    "--import", "tsx", fileURLToPath(import.meta.url),
    "--workers=1",
    `--replay-modulo=${replayModulo}`,
    `--pressures=${pressures.join(",")}`,
    `--offsets=${offsets.join(",")}`,
    `--shard=${index}/${count}`,
    `--out=${path}`,
    "--quiet"
  ];
  if (edgeLimit !== null) args.push(`--edge-limit=${edgeLimit}`);
  await new Promise<void>((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", rejectChild);
    child.once("exit", (code) => code === 0 ? resolveChild() : rejectChild(new Error(`attention-v4 landscape worker ${index} exited ${code}`)));
  });
}

const startedAt = performance.now();
if (shard) {
  const shardReport = runAttentionV4LandscapeShard({
    edges: selectedEdges,
    pressures,
    replayModulo,
    studyId,
    shardIndex: shard[0],
    shardCount: shard[1]
  });
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(shardReport)}\n`, "utf8");
  }
} else {
  let report: AttentionV4LandscapeReport;
  if (workers > 1) {
    const temporary = await mkdtemp(join(tmpdir(), "attention-v4-landscape-"));
    try {
      const paths = Array.from({ length: workers }, (_, index) => join(temporary, `shard-${index}.json`));
      if (!quiet) process.stdout.write(`${studyLabel}: ${workers} deterministic workers, ${expectedMatches} matches\n`);
      await Promise.all(paths.map((path, index) => runChild(index, workers, path)));
      const reports = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as AttentionV4LandscapeShard));
      report = mergeAttentionV4LandscapeShards(reports, { expectedEdges: edgeLimit === null ? allEdges : undefined, studyId, formula });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } else {
    let nextProgress = 2_048;
    const shardReport = runAttentionV4LandscapeShard({
      edges: selectedEdges,
      pressures,
      replayModulo,
      studyId,
      onProgress(completed, total) {
        if (quiet || (completed < nextProgress && completed !== total)) return;
        process.stdout.write(`${studyLabel}: ${completed}/${total} matches\n`);
        nextProgress += 2_048;
      }
    });
    report = mergeAttentionV4LandscapeShards([shardReport], { expectedEdges: edgeLimit === null ? allEdges : undefined, studyId, formula });
  }

  const fullDesign = edgeLimit === null && pressures.length === ATTENTION_V4_LANDSCAPE_PRESSURES.length &&
    pressures.every((pressure, index) => pressure === ATTENTION_V4_LANDSCAPE_PRESSURES[index]) &&
    replayModulo === ATTENTION_V4_LANDSCAPE_REPLAY_MODULO;
  if (fullDesign && !report.integrity.passed) {
    process.stderr.write(`${JSON.stringify(report.integrity, null, 2)}\n`);
    process.exitCode = 1;
  } else if (!quiet) {
    const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);
    process.stdout.write(`${studyLabel} complete: ${report.design.physicalMatches} matches in ${seconds}s, ${report.reportHash}\n`);
  }
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (!quiet) process.stdout.write(`report: ${output}\n`);
  }
}
