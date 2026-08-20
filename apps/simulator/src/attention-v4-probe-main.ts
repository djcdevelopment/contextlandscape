import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAttentionV4ProbeContrasts,
  mergeAttentionV4PairedProbeReports,
  runAttentionV4PairedProbe,
  type AttentionV4PairedProbeReport
} from "./attention-v4-probe.js";

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const seeds = Number(argument("seeds") ?? "64");
const replay = !process.argv.includes("--no-replay");
const write = !process.argv.includes("--no-write");
const quiet = process.argv.includes("--quiet");
const workers = Number(argument("workers") ?? "1");
const shard = argument("shard")?.split("/").map(Number) ?? null;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = resolve(argument("out") ?? join(repositoryRoot, "data", "experiments", "attention-v4.2-paired-probe", "report.json"));
if (!Number.isInteger(workers) || workers < 1 || workers > 24) throw new Error("workers must be an integer from 1 through 24");
if (shard && (shard.length !== 2 || !Number.isInteger(shard[0]) || !Number.isInteger(shard[1]) || shard[0] < 0 || shard[0] >= shard[1])) {
  throw new Error("shard must use zero-based INDEX/COUNT syntax");
}

async function runChild(index: number, count: number, path: string): Promise<void> {
  const args = ["--import", "tsx", fileURLToPath(import.meta.url), `--seeds=${seeds}`, `--shard=${index}/${count}`, `--out=${path}`, "--quiet"];
  if (!replay) args.push("--no-replay");
  await new Promise<void>((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", rejectChild);
    child.once("exit", (code) => code === 0 ? resolveChild() : rejectChild(new Error(`attention-v4 probe worker ${index} exited ${code}`)));
  });
}

let report: AttentionV4PairedProbeReport;
if (workers > 1 && !shard) {
  const temporary = await mkdtemp(join(tmpdir(), "attention-v4-probe-"));
  try {
    const paths = Array.from({ length: workers }, (_, index) => join(temporary, `shard-${index}.json`));
    process.stdout.write(`attention-v4.2 paired probe: ${workers} deterministic workers, ${27 * 2 * 4 * seeds * 2} matches\n`);
    await Promise.all(paths.map((path, index) => runChild(index, workers, path)));
    const reports = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8")) as AttentionV4PairedProbeReport));
    report = mergeAttentionV4PairedProbeReports(reports);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
} else {
  const allContrasts = createAttentionV4ProbeContrasts();
  const contrasts = shard ? allContrasts.filter((_, index) => index % shard[1] === shard[0]) : allContrasts;
  let nextProgress = 2_048;
  report = runAttentionV4PairedProbe({
    seedsPerCell: seeds,
    replay,
    contrasts,
    onProgress(completed, total) {
      if (quiet || (completed < nextProgress && completed !== total)) return;
      process.stdout.write(`attention-v4 paired probe: ${completed}/${total} matches\n`);
      nextProgress += 2_048;
    }
  });
}
const partial = shard !== null;
if (!report.gates.passed && !partial) {
  process.stderr.write(`${JSON.stringify(report.gates, null, 2)}\n`);
  process.exitCode = 1;
} else if (!quiet) {
  process.stdout.write(`attention-v4 paired probe passed: ${report.design.matches} matches, ${report.reportHash}\n`);
}
if (write) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!quiet) process.stdout.write(`report: ${output}\n`);
}
