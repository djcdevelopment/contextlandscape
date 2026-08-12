import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const lab = join(root, "data/lab/game-art-founding-canon-v2");
const canon = JSON.parse(readFileSync(join(root, "config/game-art/founding-canon-v1.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(lab, "manifest.json"), "utf8"));
const parseJsonl = (name) => readFileSync(join(lab, name), "utf8").trim().split("\n").map(JSON.parse);
const calibration = parseJsonl("manifest-calibration.jsonl");
const full = parseJsonl("manifest-full.jsonl");
const smoke = parseJsonl("manifest-smoke.jsonl");

const errors = [];
if (canon.images.length !== 100) errors.push(`canon count ${canon.images.length} != 100`);
if (calibration.length !== 15) errors.push(`calibration count ${calibration.length} != 15`);
if (full.length !== 100) errors.push(`full count ${full.length} != 100`);
if (smoke.length !== 1 || smoke[0].job_id !== calibration[0].job_id) errors.push("smoke manifest is not the first calibration job");
if (manifest.sourceCount !== canon.images.length) errors.push("summary/canon source count mismatch");
if (new Set(full.map((job) => job.job_id)).size !== full.length) errors.push("duplicate full job IDs");
if (new Set(full.map((job) => job.parentJobId)).size !== canon.images.length) errors.push("not every parent has one full child");
for (const job of [...calibration, ...full]) {
  if (!job.params?.reference_image || job.params.reference_image !== job.referenceImage) errors.push(`${job.job_id}: reference mismatch`);
  if (!Number.isFinite(job.referenceStrength)) errors.push(`${job.job_id}: missing reference strength`);
  if (!job.prompt.includes("No readable text")) errors.push(`${job.job_id}: missing text hygiene invariant`);
}
for (const type of ["mech", "ability", "artillery", "battlefield", "commander"]) {
  if (!calibration.some((job) => job.subjectType === type)) errors.push(`calibration missing ${type}`);
}

if (errors.length) {
  console.error(JSON.stringify({ status: "fail", errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "pass", canon: canon.images.length, calibration: calibration.length, full: full.length }, null, 2));
