import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = "data/lab/game-art-pilot-v1/manifest.jsonl";
const text = readFileSync(path, "utf8");
const jobs = text.trim().split(/\r?\n/).map(JSON.parse);
const q8 = readFileSync("data/lab/game-art-pilot-v1/manifest-q8.jsonl", "utf8").trim().split(/\r?\n/).map(JSON.parse);
const bf16 = readFileSync("data/lab/game-art-pilot-v1/manifest-bf16.jsonl", "utf8").trim().split(/\r?\n/).map(JSON.parse);
const smokeQ8 = readFileSync("data/lab/game-art-pilot-v1/manifest-smoke-q8.jsonl", "utf8").trim().split(/\r?\n/).map(JSON.parse);
const smokeBf16 = readFileSync("data/lab/game-art-pilot-v1/manifest-smoke-bf16.jsonl", "utf8").trim().split(/\r?\n/).map(JSON.parse);
const ids = new Set(jobs.map((job) => job.job_id));
const keys = new Set(jobs.map((job) => `${job.subjectId}:${job.artDirection}`));
const pairs = new Map();
for (const job of jobs) {
  if (!pairs.has(job.comparisonId)) pairs.set(job.comparisonId, new Set());
  pairs.get(job.comparisonId).add(job.qualityLane);
  if (job.width % 64 || job.height % 64) throw new Error(`${job.job_id} has non-64-aligned dimensions`);
  if (!job.sourceRefs?.length || !job.registryVersion) throw new Error(`${job.job_id} lacks provenance`);
}
const matched = [...pairs.values()].filter((lanes) => lanes.has("q8") && lanes.has("bf16")).length;
if (jobs.length !== 120 || ids.size !== 120 || keys.size !== 30 || matched !== 30 || q8.length !== 90 || bf16.length !== 30) throw new Error("Pilot cardinality or pairing failed");
if (q8.some((job) => job.qualityLane !== "q8") || bf16.some((job) => job.qualityLane !== "bf16")) throw new Error("Lane manifests contain mixed quality lanes");
if (smokeQ8.length !== 2 || smokeBf16.length !== 1 || smokeQ8.some((job) => !q8.find((candidate) => candidate.job_id === job.job_id)) || !bf16.find((candidate) => candidate.job_id === smokeBf16[0].job_id)) throw new Error("Smoke manifests are not valid pilot subsets");
console.log(JSON.stringify({ status: "pass", jobs: jobs.length, uniqueIds: ids.size, subjectDirectionCells: keys.size, matchedComparisons: matched, sha256: createHash("sha256").update(text).digest("hex") }, null, 2));
