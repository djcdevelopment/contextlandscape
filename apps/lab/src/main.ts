import { createMatrix, writeReport, writeShard } from "./lab.js";
import { readFile } from "node:fs/promises";
import { SimulationMatrixSchema } from "@mech/contracts";

function value(name: string): string | undefined {
  const argument = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  const envName = name === "matrix" ? "LAB_MATRIX_ID" : `LAB_${name.replace(/-/g, "_").toUpperCase()}`;
  return argument?.split("=").slice(1).join("=") ?? process.env[envName];
}

async function main(): Promise<void> {
  const reportDir = value("report");
  if (reportDir) {
    const normalizedReportDir = /[\\/]apps[\\/]lab$/.test(process.cwd()) && reportDir.startsWith("data/lab") ? `../../${reportDir}` : reportDir;
    console.log(`wrote ${await writeReport(normalizedReportDir)}`);
    return;
  }
  const manifestPath = value("manifest");
  const scenario = value("scenario");
  const matrix = manifestPath
    ? SimulationMatrixSchema.parse(JSON.parse(await readFile(normalizeDataPath(manifestPath), "utf8")))
    : createMatrix({
        matrixId: value("matrix"),
        scenarioIds: scenario ? [scenario] : undefined,
        runsPerCell: value("runs") ? Number(value("runs")) : undefined,
        policyCount: value("policies") ? Number(value("policies")) : undefined,
        tuningCount: value("tunings") ? Number(value("tunings")) : undefined,
        seedStart: value("seed-start") ? Number(value("seed-start")) : undefined,
        shardCount: value("shards") ? Number(value("shards")) : undefined,
      });
  const defaultOutput = /[\\/]apps[\\/]lab$/.test(process.cwd()) ? "../../data/lab" : "data/lab";
  const outputDir = value("out") ?? defaultOutput;
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

function normalizeDataPath(path: string): string {
  return /[\\/]apps[\\/]lab$/.test(process.cwd()) && path.startsWith("data/") ? `../../${path}` : path;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
