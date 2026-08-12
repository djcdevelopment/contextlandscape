import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const registryPath = join(root, "config/game-art/registry-v1.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const outputDirectory = join(root, "data/lab/game-art-pilot-v1");
mkdirSync(outputDirectory, { recursive: true });

const dimensions = {
  portrait: { width: 832, height: 1216 },
  square: { width: 1024, height: 1024 },
  landscape: { width: 1216, height: 832 }
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jobs = [];

for (const subject of registry.subjects) {
  const size = dimensions[subject.aspect];
  if (!size) throw new Error(`Unknown aspect ${subject.aspect} for ${subject.id}`);
  for (const direction of registry.directions) {
    for (const [qualityLane, lane] of Object.entries(registry.qualityLanes)) {
      for (const seed of lane.seeds) {
        const comparisonId = `${registry.campaign}:${subject.id}:${direction.id}:${seed}`;
        const prompt = `${subject.prompt}. ${direction.prompt}. ${registry.promptInvariants}.`;
        const identity = `${comparisonId}:${qualityLane}:${lane.model}`;
        jobs.push({
          job_id: `clga_${digest(identity).slice(0, 16)}`,
          model: lane.model,
          family: lane.model === "flux_bf16" ? "flux" : "flux_gguf",
          params_b: 12,
          seed,
          width: size.width,
          height: size.height,
          steps: 24,
          cfg: 1,
          cell_id: digest(`${registry.campaign}:${subject.id}:${direction.id}`).slice(0, 10),
          prompt,
          category: "game-art",
          style: direction.id,
          length: null,
          requester: "context-landscape-pilot",
          project: registry.project,
          campaign: registry.campaign,
          subjectType: subject.subjectType,
          subjectId: subject.id,
          subjectLabel: subject.label,
          artDirection: direction.id,
          gameUse: subject.gameUse,
          qualityLane,
          comparisonId,
          registryVersion: registry.registryVersion,
          sourceRefs: subject.sourceRefs,
          params: { guidance: 3.5, steps: 24, ...(qualityLane === "bf16" ? { dualcard: true } : {}) }
        });
      }
    }
  }
}

const ids = new Set(jobs.map((job) => job.job_id));
const comparisons = new Map();
for (const job of jobs) {
  if (!comparisons.has(job.comparisonId)) comparisons.set(job.comparisonId, []);
  comparisons.get(job.comparisonId).push(job);
}
const paired = [...comparisons.values()].filter((items) => items.some((job) => job.qualityLane === "q8") && items.some((job) => job.qualityLane === "bf16"));
if (jobs.length !== 120 || ids.size !== 120) throw new Error(`Expected 120 unique jobs; received ${jobs.length}/${ids.size}`);
if (paired.length !== 30) throw new Error(`Expected 30 Q8/bf16 comparison pairs; received ${paired.length}`);
for (const type of ["mech", "ability", "artillery", "battlefield", "commander"]) {
  if (!jobs.some((job) => job.subjectType === type)) throw new Error(`Missing subject type ${type}`);
}

const manifest = jobs.map((job) => JSON.stringify(job)).join("\n") + "\n";
const q8Manifest = jobs.filter((job) => job.qualityLane === "q8").map((job) => JSON.stringify(job)).join("\n") + "\n";
const bf16Manifest = jobs.filter((job) => job.qualityLane === "bf16").map((job) => JSON.stringify(job)).join("\n") + "\n";
const manifestHash = `sha256:${digest(manifest)}`;
writeFileSync(join(outputDirectory, "manifest.jsonl"), manifest);
writeFileSync(join(outputDirectory, "manifest-q8.jsonl"), q8Manifest);
writeFileSync(join(outputDirectory, "manifest-bf16.jsonl"), bf16Manifest);
writeFileSync(join(outputDirectory, "manifest.json"), JSON.stringify({
  schemaVersion: "context-landscape-game-art-manifest/v1",
  registryVersion: registry.registryVersion,
  project: registry.project,
  campaign: registry.campaign,
  generatedAt: "2026-08-12T00:00:00.000Z",
  jobCount: jobs.length,
  q8Jobs: jobs.filter((job) => job.qualityLane === "q8").length,
  bf16Jobs: jobs.filter((job) => job.qualityLane === "bf16").length,
  matchedComparisons: paired.length,
  subjectCount: registry.subjects.length,
  directionCount: registry.directions.length,
  manifestHash
}, null, 2) + "\n");
console.log(JSON.stringify({ status: "pass", jobs: jobs.length, paired: paired.length, manifestHash, outputDirectory }, null, 2));
