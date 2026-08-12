import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const v1IndexPath = join(root, "data/lab/game-art-pilot-v1/gallery-index-final.json");
const v1Registry = JSON.parse(readFileSync(join(root, "config/game-art/registry-v1.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(root, "config/game-art/registry-v2.json"), "utf8"));
const index = JSON.parse(readFileSync(v1IndexPath, "utf8").replace(/^\uFEFF/, ""));
const outputDirectory = join(root, "data/lab/game-art-founding-canon-v2");
mkdirSync(outputDirectory, { recursive: true });

const dimensions = {
  portrait: { width: 832, height: 1216 },
  square: { width: 1024, height: 1024 },
  landscape: { width: 1216, height: 832 }
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const subjectById = new Map(v1Registry.subjects.map((subject) => [subject.id, subject]));
const directionById = new Map(v1Registry.directions.map((direction) => [direction.id, direction]));

const selected = index.images
  .filter((image) => image.campaign === registry.sourceCampaign && Number.isFinite(image.aes))
  .sort((a, b) => b.aes - a.aes)
  .slice(0, registry.selection.limit)
  .map((image, offset) => ({
    rank: offset + 1,
    id: image.id,
    aesthetic: image.aes,
    promptClip: image.clip,
    model: image.model,
    qualityLane: image.qualityLane,
    subjectType: image.subjectType,
    subjectId: image.subjectId,
    subjectLabel: image.subjectLabel,
    artDirection: image.artDirection,
    gameUse: image.gameUse,
    sourceImage: `img/${image.id}.webp`,
    comfyReferenceImage: `cl-canon-v1-${image.id}.webp`
  }));

if (selected.length !== registry.selection.limit) {
  throw new Error(`Expected ${registry.selection.limit} ranked sources; found ${selected.length}`);
}
if (new Set(selected.map((image) => image.id)).size !== selected.length) {
  throw new Error("Founding-canon source IDs are not unique");
}
for (const subjectType of ["mech", "ability", "artillery", "battlefield", "commander"]) {
  if (!selected.some((image) => image.subjectType === subjectType)) {
    throw new Error(`Founding-canon selection is missing ${subjectType}`);
  }
}

const buildJob = (parent, strength, campaign, lane) => {
  const subject = subjectById.get(parent.subjectId);
  const direction = directionById.get(parent.artDirection);
  if (!subject || !direction) throw new Error(`Unknown v1 registry entry for ${parent.id}`);
  const size = dimensions[subject.aspect];
  const correction = registry.subjectCorrections[parent.subjectId];
  if (!correction) throw new Error(`Missing semantic correction for ${parent.subjectId}`);
  const prompt = [
    `Create a disciplined new canon iteration of the supplied ${parent.subjectLabel} reference image`,
    `Preserve its composition family and ${direction.label.toLowerCase()} visual language`,
    correction,
    registry.promptInvariants
  ].join(". ");
  const seed = 2026081400 + parent.rank + Math.round(strength * 1000) * 1000;
  const identity = `${registry.registryVersion}:${lane}:${parent.id}:${strength}:${seed}`;
  return {
    job_id: `clg2_${digest(identity).slice(0, 16)}`,
    model: registry.model,
    family: "flux_gguf",
    params_b: 12,
    seed,
    width: size.width,
    height: size.height,
    steps: registry.steps,
    cfg: 1,
    cell_id: digest(`${campaign}:${parent.id}`).slice(0, 10),
    prompt,
    category: "game-art-iteration",
    style: parent.artDirection,
    length: null,
    requester: "context-landscape-founding-canon",
    project: registry.project,
    campaign,
    subjectType: parent.subjectType,
    subjectId: parent.subjectId,
    subjectLabel: parent.subjectLabel,
    artDirection: parent.artDirection,
    gameUse: parent.gameUse,
    qualityLane: "q8-redux",
    registryVersion: registry.registryVersion,
    parentJobId: parent.id,
    parentRank: parent.rank,
    parentAesthetic: parent.aesthetic,
    parentPromptClip: parent.promptClip,
    referenceMethod: registry.referenceMethod,
    referenceStrength: strength,
    referenceImage: parent.comfyReferenceImage,
    params: {
      guidance: registry.guidance,
      steps: registry.steps,
      reference_image: parent.comfyReferenceImage,
      reference_strength: strength,
      reference_crop: "none",
      clip_vision_model: registry.referenceModels.clipVision.filename,
      style_model: registry.referenceModels.styleModel.filename
    }
  };
};

const exemplars = [...new Set(selected.map((image) => image.subjectType))]
  .map((subjectType) => selected.find((image) => image.subjectType === subjectType));
const calibrationJobs = exemplars.flatMap((parent) =>
  registry.referenceStrengths.map((strength) => buildJob(parent, strength, registry.calibrationCampaign, "calibration"))
);
const fullJobs = selected.map((parent) =>
  buildJob(parent, registry.fullReferenceStrength, registry.campaign, "full")
);

const writeJsonl = (name, jobs) => {
  writeFileSync(join(outputDirectory, name), jobs.map((job) => JSON.stringify(job)).join("\n") + "\n");
};
writeJsonl("manifest-calibration.jsonl", calibrationJobs);
writeJsonl("manifest-full.jsonl", fullJobs);
writeJsonl("manifest-smoke.jsonl", calibrationJobs.slice(0, 1));
writeFileSync(join(outputDirectory, "manifest.json"), JSON.stringify({
  schemaVersion: "context-landscape-game-art-manifest/v2",
  registryVersion: registry.registryVersion,
  project: registry.project,
  sourceCampaign: registry.sourceCampaign,
  campaign: registry.campaign,
  calibrationCampaign: registry.calibrationCampaign,
  generatedAt: "2026-08-12T00:00:00.000Z",
  sourceCount: selected.length,
  calibrationJobs: calibrationJobs.length,
  fullJobs: fullJobs.length,
  fullReferenceStrength: registry.fullReferenceStrength,
  foundingCanonHash: `sha256:${digest(JSON.stringify(selected))}`,
  calibrationManifestHash: `sha256:${digest(calibrationJobs.map((job) => JSON.stringify(job)).join("\n") + "\n")}`,
  fullManifestHash: `sha256:${digest(fullJobs.map((job) => JSON.stringify(job)).join("\n") + "\n")}`
}, null, 2) + "\n");
writeFileSync(join(root, "config/game-art/founding-canon-v1.json"), JSON.stringify({
  schemaVersion: "context-landscape-founding-canon/v1",
  sourceCampaign: registry.sourceCampaign,
  selection: registry.selection,
  selectedAt: "2026-08-12T00:00:00.000Z",
  sourceIndex: "data/lab/game-art-pilot-v1/gallery-index-final.json",
  images: selected
}, null, 2) + "\n");

console.log(JSON.stringify({
  status: "pass",
  sources: selected.length,
  calibrationJobs: calibrationJobs.length,
  fullJobs: fullJobs.length,
  thresholdAesthetic: selected.at(-1).aesthetic,
  outputDirectory
}, null, 2));
