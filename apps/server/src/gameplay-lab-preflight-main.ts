import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preflightGameplayLabs } from "./gameplay-lab-preflight.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputDir = resolve(repoRoot, "data", "gameplay-labs");
await mkdir(outputDir, { recursive: true });
const report = preflightGameplayLabs(repoRoot);
if (report.labs.some((lab) => !lab.sourceFilesPresent)) throw new Error("gameplay lab source report missing");
if (report.labs.some((lab) => lab.controlReplayMatchesScenario === false)) throw new Error("gameplay lab control replay drifted");
if (report.labs.some((lab) => lab.variants.some((variant) => !variant.winnable))) throw new Error("gameplay lab contains an unreachable variant");
const outputPath = resolve(outputDir, "preflight.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`GAMEPLAY LAB PREFLIGHT PASS: labs=${report.labs.length} path=${outputPath}`);
