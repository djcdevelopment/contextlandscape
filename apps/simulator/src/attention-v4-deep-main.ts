import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AttentionV4PressureSample } from "@landscape/engine";
import {
  ATTENTION_V4_DEEP_WORLD_LANES,
  ATTENTION_V4_LANDSCAPE_PRESSURES,
  ATTENTION_V4_LANDSCAPE_REPLAY_MODULO,
  attentionV4LandscapeMatchCount,
  mergeAttentionV4LandscapeShards,
  runAttentionV4LandscapeShard,
  type AttentionV4LandscapeReport,
  type AttentionV4LandscapeShard,
  type AttentionV4LandscapeStudyId
} from "./attention-v4-landscape.js";
import {
  attentionV4DeepDesign,
  createAttentionV4FleetMatrixEdges,
  createAttentionV4RegularTopologyEdges
} from "./attention-v4-deep-design.js";

type DeepStudy = "regular-topology" | "fleet-matrix";

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function integerArgument(name: string, fallback: number): number {
  const parsed = Number(argument(name) ?? fallback);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function parseUniqueIntegers(value: string | null, fallback: readonly number[], label: string): number[] {
  if (value === null) return [...fallback];
  const parsed = value.split(",").map(Number);
  if (parsed.length === 0 || new Set(parsed).size !== parsed.length || parsed.some((item) => !Number.isInteger(item) || item < 0)) {
    throw new Error(`${label} must be a unique comma-separated nonnegative integer list`);
  }
  return parsed;
}

const studyArgument = argument("study") ?? "regular-topology";
if (studyArgument !== "regular-topology" && studyArgument !== "fleet-matrix") throw new Error("study must be regular-topology or fleet-matrix");
const study = studyArgument as DeepStudy;
const studyId: AttentionV4LandscapeStudyId = study === "regular-topology"
  ? "attention-v4.2-regular-topology-1"
  : "attention-v4.2-fleet-matrix-1";
const workers = integerArgument("workers", 1);
const replayModulo = integerArgument("replay-modulo", ATTENTION_V4_LANDSCAPE_REPLAY_MODULO);
const pressures = parseUniqueIntegers(argument("pressures"), ATTENTION_V4_LANDSCAPE_PRESSURES, "pressures") as AttentionV4PressureSample[];
if (pressures.some((pressure) => pressure > 3)) throw new Error("pressures must be a subset of 0,1,2,3");
const worldLanes = parseUniqueIntegers(argument("world-lanes"), ATTENTION_V4_DEEP_WORLD_LANES, "world-lanes");
if (worldLanes.length > 2) throw new Error("deep studies support at most two world lanes");
const edgeLimitValue = argument("edge-limit");
const edgeLimit = edgeLimitValue === null ? null : Number(edgeLimitValue);
const shard = argument("shard")?.split("/").map(Number) ?? null;
const write = !process.argv.includes("--no-write");
const quiet = process.argv.includes("--quiet");
if (workers < 1 || workers > 24) throw new Error("workers must be an integer from 1 through 24");
if (replayModulo < 0) throw new Error("replay-modulo must be a nonnegative integer");
if (shard && (shard.length !== 2 || !Number.isInteger(shard[0]) || !Number.isInteger(shard[1]) || shard[0] < 0 || shard[0] >= shard[1])) {
  throw new Error("shard must use zero-based INDEX/COUNT syntax");
}

const allEdges = study === "regular-topology" ? createAttentionV4RegularTopologyEdges() : createAttentionV4FleetMatrixEdges();
if (edgeLimit !== null && (!Number.isInteger(edgeLimit) || edgeLimit < 1 || edgeLimit > allEdges.length)) {
  throw new Error(`edge-limit must be an integer from 1 through ${allEdges.length}`);
}
const selectedEdges = edgeLimit === null ? allEdges : allEdges.slice(0, edgeLimit);
const expectedMatches = attentionV4LandscapeMatchCount(selectedEdges, pressures.length, worldLanes.length);
const nonSelfEdges = allEdges.filter((edge) => edge.kind === "matchup").length;
const selfPlayEdges = allEdges.length - nonSelfEdges;
const formula = `${nonSelfEdges.toLocaleString("en-US")} pairs x 2 seats x ${pressures.length} pressures x ${worldLanes.length} worlds` +
  (selfPlayEdges ? ` + ${selfPlayEdges.toLocaleString("en-US")} self-play pairs x ${pressures.length} pressures x ${worldLanes.length} worlds` : "");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultDirectory = study === "regular-topology" ? "attention-v4.2-regular-topology" : "attention-v4.2-fleet-matrix";
const output = resolve(argument("out") ?? join(repositoryRoot, "data", "experiments", defaultDirectory, "report.json"));
const deepDesign = attentionV4DeepDesign(study, allEdges);

async function runChild(index: number, count: number, path: string): Promise<void> {
  const args = [
    "--import", "tsx", fileURLToPath(import.meta.url),
    `--study=${study}`,
    "--workers=1",
    `--replay-modulo=${replayModulo}`,
    `--pressures=${pressures.join(",")}`,
    `--world-lanes=${worldLanes.join(",")}`,
    `--shard=${index}/${count}`,
    `--out=${path}`,
    "--quiet"
  ];
  if (edgeLimit !== null) args.push(`--edge-limit=${edgeLimit}`);
  await new Promise<void>((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", rejectChild);
    child.once("exit", (code) => code === 0 ? resolveChild() : rejectChild(new Error(`attention-v4 deep worker ${index} exited ${code}`)));
  });
}

const startedAt = performance.now();
if (shard) {
  const shardReport = runAttentionV4LandscapeShard({
    edges: selectedEdges,
    pressures,
    worldLanes,
    seedScheme: "pair-keyed-world-v1",
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
    const temporary = await mkdtemp(join(tmpdir(), "attention-v4-deep-"));
    try {
      const paths = Array.from({ length: workers }, (_, index) => join(temporary, `shard-${index}.json`));
      if (!quiet) process.stdout.write(`${study}: ${workers} deterministic workers, ${expectedMatches} matches\n`);
      await Promise.all(paths.map((path, index) => runChild(index, workers, path)));
      const reports = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as AttentionV4LandscapeShard));
      report = mergeAttentionV4LandscapeShards(reports, { expectedEdges: allEdges, studyId, formula, deepDesign });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } else {
    let nextProgress = 2_048;
    const shardReport = runAttentionV4LandscapeShard({
      edges: selectedEdges,
      pressures,
      worldLanes,
      seedScheme: "pair-keyed-world-v1",
      replayModulo,
      studyId,
      onProgress(completed, total) {
        if (quiet || (completed < nextProgress && completed !== total)) return;
        process.stdout.write(`${study}: ${completed}/${total} matches\n`);
        nextProgress += 2_048;
      }
    });
    report = mergeAttentionV4LandscapeShards([shardReport], { expectedEdges: allEdges, studyId, formula, deepDesign });
  }
  const fullDesign = edgeLimit === null && pressures.join(",") === ATTENTION_V4_LANDSCAPE_PRESSURES.join(",") &&
    worldLanes.join(",") === ATTENTION_V4_DEEP_WORLD_LANES.join(",") && replayModulo === ATTENTION_V4_LANDSCAPE_REPLAY_MODULO;
  if (fullDesign && !report.integrity.passed) {
    process.stderr.write(`${JSON.stringify(report.integrity, null, 2)}\n`);
    process.exitCode = 1;
  } else if (!quiet) {
    const seconds = ((performance.now() - startedAt) / 1_000).toFixed(1);
    process.stdout.write(`${study} complete: ${report.design.physicalMatches} matches in ${seconds}s, ${report.reportHash}\n`);
  }
  if (write) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (!quiet) process.stdout.write(`report: ${output}\n`);
  }
}
