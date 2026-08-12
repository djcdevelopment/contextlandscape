import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const root = resolve(".");
const configPath = join(root, "config/lab-topography/atlas-v1.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const catalogPath = join(root, config.sourceCatalog);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const outputDirectory = join(root, "data/lab/lab-topography-atlas-v1");
const publicDirectory = join(root, "apps/web/public/atlas");
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(publicDirectory, { recursive: true });

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const familyIndex = new Map(config.familyOrder.map((family, index) => [family, index]));
const labs = [...catalog.labs].sort((left, right) => {
  const familyDelta = (familyIndex.get(left.family) ?? 99) - (familyIndex.get(right.family) ?? 99);
  return familyDelta || natural.compare(left.id, right.id);
});
const maxRuns = Math.max(1, ...labs.map((lab) => lab.runs ?? 0));
const evidenceValues = config.metrics.evidenceDepth.values;

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function stableJitter(id, salt) {
  const digest = createHash("sha256").update(`${id}:${salt}`).digest();
  return (digest.readUInt16BE(0) / 65535) * 2 - 1;
}

const nodes = labs.map((lab) => {
  const siblings = labs.filter((candidate) => candidate.family === lab.family);
  const index = siblings.findIndex((candidate) => candidate.id === lab.id);
  const family = familyIndex.get(lab.family) ?? config.familyOrder.length;
  const xCenter = (family + 0.5) / config.familyOrder.length;
  const yBase = (index + 1) / (siblings.length + 1);
  const runVolume = lab.runs === null ? null : Math.log1p(lab.runs) / Math.log1p(maxRuns);
  const artifactCount = [lab.hasManifest, lab.hasReport, lab.hasAssessment].filter(Boolean).length;
  return {
    ...lab,
    x: round(Math.min(0.97, Math.max(0.03, xCenter + stableJitter(lab.id, "x") * 0.052))),
    y: round(Math.min(0.96, Math.max(0.04, yBase + stableJitter(lab.id, "y") * 0.024))),
    metrics: {
      runVolume: runVolume === null ? null : round(runVolume),
      evidenceDepth: evidenceValues[lab.evidenceTier] ?? 0,
      artifactCompleteness: round(artifactCount / 3)
    }
  };
});

function buildField(metric) {
  const { columns, rows, influenceRadius, contourBands, surveyFloor } = config.field;
  const values = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) / columns;
      const y = (row + 0.5) / rows;
      let localPeak = 0;
      for (const node of nodes) {
        const raw = node.metrics[metric];
        if (raw === null) continue;
        const dx = x - node.x;
        const dy = y - node.y;
        const gaussian = raw * Math.exp(-(dx * dx + dy * dy) / (2 * influenceRadius * influenceRadius));
        localPeak = Math.max(localPeak, gaussian);
      }
      const value = Math.max(0, localPeak - surveyFloor * 0.18);
      values.push(round(Math.min(1, value), 5));
    }
  }
  return { columns, rows, contourBands, values };
}

const fields = Object.fromEntries(Object.keys(config.metrics).map((metric) => [metric, buildField(metric)]));
const atlasCore = {
  schemaVersion: "lab-topography-atlas/v1",
  atlasId: config.atlasId,
  generatedAt: catalog.source.generatedAt,
  source: {
    catalog: config.sourceCatalog,
    catalogHash: catalog.catalogHash,
    config: "config/lab-topography/atlas-v1.json"
  },
  coordinateSemantics: config.coordinateSemantics,
  familyOrder: config.familyOrder,
  metrics: config.metrics,
  fieldConfig: config.field,
  style: config.style,
  totals: {
    labs: nodes.length,
    recordedRuns: nodes.reduce((sum, node) => sum + (node.runs ?? 0), 0),
    labsWithRecordedRuns: nodes.filter((node) => node.runs !== null).length,
    labsWithoutRecordedRuns: nodes.filter((node) => node.runs === null).length
  },
  nodes,
  fields
};
const atlasHash = `sha256:${createHash("sha256").update(JSON.stringify(atlasCore)).digest("hex")}`;
const atlas = { ...atlasCore, atlasHash };
const atlasJson = `${JSON.stringify(atlas, null, 2)}\n`;
writeFileSync(join(outputDirectory, "atlas.json"), atlasJson);
writeFileSync(join(publicDirectory, "lab-topography-v1.json"), atlasJson);

const palette = config.style.palette;
const field = fields.runVolume;
const width = 1440;
const height = 920;
const mapX = 86;
const mapY = 104;
const mapWidth = 1268;
const mapHeight = 700;
const cellWidth = mapWidth / field.columns;
const cellHeight = mapHeight / field.rows;
const cells = field.values.map((value, index) => {
  const column = index % field.columns;
  const row = Math.floor(index / field.columns);
  const band = Math.min(palette.length - 1, Math.floor(value * palette.length));
  return `<rect x="${round(mapX + column * cellWidth, 3)}" y="${round(mapY + row * cellHeight, 3)}" width="${round(cellWidth + 0.25, 3)}" height="${round(cellHeight + 0.25, 3)}" fill="${palette[band]}"/>`;
}).join("");
const separators = config.familyOrder.slice(1).map((_, index) => {
  const x = mapX + mapWidth * ((index + 1) / config.familyOrder.length);
  return `<line x1="${x}" y1="${mapY}" x2="${x}" y2="${mapY + mapHeight}" stroke="#b7d8d0" stroke-opacity=".2" stroke-dasharray="4 8"/>`;
}).join("");
const labels = config.familyOrder.map((family, index) => `<text x="${mapX + mapWidth * ((index + 0.5) / config.familyOrder.length)}" y="${mapY - 18}" text-anchor="middle" fill="#91a8b8" font-family="ui-monospace,monospace" font-size="13">${family}</text>`).join("");
const markers = nodes.map((node) => {
  const x = mapX + node.x * mapWidth;
  const y = mapY + node.y * mapHeight;
  const value = node.metrics.runVolume;
  const radius = value === null ? 3.4 : 3.5 + value * 5.5;
  const fill = value === null ? config.style.unknown : "#fff4c2";
  return `<circle cx="${round(x, 2)}" cy="${round(y, 2)}" r="${round(radius, 2)}" fill="${fill}" stroke="#071522" stroke-width="2"><title>${node.id} · ${node.runs === null ? "volume not reported" : `${node.runs.toLocaleString()} runs`}</title></circle>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">All-labs topography by recorded run volume</title><desc id="desc">A deterministic categorical map of ${nodes.length} lab artifacts. Terrain height uses log-scaled recorded run counts; unknown counts are gray survey markers.</desc>
<rect width="100%" height="100%" fill="#050d16"/><text x="${mapX}" y="48" fill="#eef8f4" font-family="system-ui,sans-serif" font-size="28" font-weight="700">ALL-LABS EVIDENCE TOPOGRAPHY</text><text x="${mapX}" y="76" fill="#8da5b5" font-family="system-ui,sans-serif" font-size="15">Recorded run volume · logarithmic terrain · ${nodes.length} labs · ${atlas.totals.recordedRuns.toLocaleString()} recorded runs</text>
<g>${cells}${separators}${markers}</g>${labels}<text x="${mapX}" y="850" fill="#8da5b5" font-family="system-ui,sans-serif" font-size="13">Geography = research family + stable campaign order. Distance is not inferred similarity. Gray markers = run volume not reported.</text><text x="${mapX}" y="876" fill="#5f7788" font-family="ui-monospace,monospace" font-size="11">${atlasHash}</text></svg>\n`;
writeFileSync(join(outputDirectory, "heightmap.svg"), svg);
writeFileSync(join(publicDirectory, "lab-topography-v1.svg"), svg);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(width, height, channels, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : 2;
  const stride = width * channels;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) pixels.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function sampleField(fieldValues, x, y) {
  const gridX = Math.min(field.columns - 1, Math.max(0, x * field.columns - 0.5));
  const gridY = Math.min(field.rows - 1, Math.max(0, y * field.rows - 0.5));
  const x0 = Math.floor(gridX), y0 = Math.floor(gridY);
  const x1 = Math.min(field.columns - 1, x0 + 1), y1 = Math.min(field.rows - 1, y0 + 1);
  const fx = gridX - x0, fy = gridY - y0;
  const at = (column, row) => fieldValues[row * field.columns + column];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

const conditioningWidth = 1152;
const conditioningHeight = 736;
const heightPixels = Buffer.alloc(conditioningWidth * conditioningHeight);
const semanticPixels = Buffer.alloc(conditioningWidth * conditioningHeight * 3);
const semanticColors = [[116, 92, 171], [79, 123, 154], [54, 170, 125], [226, 155, 70], [218, 78, 91]];
for (let y = 0; y < conditioningHeight; y += 1) {
  for (let x = 0; x < conditioningWidth; x += 1) {
    const normalizedX = (x + 0.5) / conditioningWidth;
    const normalizedY = (y + 0.5) / conditioningHeight;
    const elevation = sampleField(field.values, normalizedX, normalizedY);
    const pixel = y * conditioningWidth + x;
    heightPixels[pixel] = Math.round(elevation * 255);
    if (elevation > 0.025) {
      const family = Math.min(config.familyOrder.length - 1, Math.floor(normalizedX * config.familyOrder.length));
      const color = semanticColors[family];
      semanticPixels[pixel * 3] = color[0];
      semanticPixels[pixel * 3 + 1] = color[1];
      semanticPixels[pixel * 3 + 2] = color[2];
    }
  }
}
const heightPng = encodePng(conditioningWidth, conditioningHeight, 1, heightPixels);
const semanticPng = encodePng(conditioningWidth, conditioningHeight, 3, semanticPixels);
writeFileSync(join(outputDirectory, "heightmap.png"), heightPng);
writeFileSync(join(outputDirectory, "semantic-mask.png"), semanticPng);
writeFileSync(join(publicDirectory, "lab-topography-v1-heightmap.png"), heightPng);
writeFileSync(join(publicDirectory, "lab-topography-v1-semantic-mask.png"), semanticPng);

const renderJob = {
  schemaVersion: "lab-topography-render-job/v1",
  atlasId: atlas.atlasId,
  atlasHash,
  sourceAssets: {
    atlas: "atlas.json",
    deterministicPreview: "heightmap.svg",
    heightConditioning: "heightmap.png",
    semanticConditioning: "semantic-mask.png"
  },
  invariants: [
    "Do not move, resize, merge, or invent lab markers.",
    "Do not add labels inside the generative pass.",
    "Preserve coastline and elevation ordering from deterministic conditioning assets.",
    "Apply labels and numeric annotations after generation from atlas.json."
  ],
  prompt: "Oblique scientific atlas relief, dark ocean, luminous survey contours, restrained cartographic texture, five research archipelagos, high legibility, no text, no icons, no invented landmarks.",
  negativePrompt: "text, letters, numbers, logos, fantasy cities, unlabeled decorative symbols, changed geography, extra islands, missing peaks",
  presets: config.renderPresets,
  dispatch: {
    target: "am4.tail8e749c.ts.net",
    comfyRoot: "/home/derek/ComfyUI",
    outputRoot: "/home/derek/contextlandscape-topography/renders",
    precondition: "Confirm /dev/dri/renderD128 and renderD129 ownership before starting or changing ComfyUI."
  }
};
writeFileSync(join(outputDirectory, "render-job.json"), `${JSON.stringify(renderJob, null, 2)}\n`);
writeFileSync(join(outputDirectory, "ASSESSMENT.md"), `# Lab topography atlas v1\n\nThis package turns the all-labs catalog into a deterministic, inspectable terrain model. It includes **${nodes.length} labs**, **${atlas.totals.recordedRuns.toLocaleString()} recorded runs**, and ${atlas.totals.labsWithoutRecordedRuns} labs whose run volume is explicitly unknown rather than treated as zero.\n\n## Reading the terrain\n\n- X groups research families in an explicit historical order.\n- Y is stable natural-sort campaign order within each family.\n- The default elevation is logarithmic recorded run volume.\n- The interactive viewer can instead render evidence depth or artifact completeness.\n- Geographic distance is not a learned similarity or causal-distance claim.\n\n## Reproduce\n\nRun \`npm run build:lab-topography\`. The interactive view is \`?view=atlas\` in the web app. The AM4 handoff is [render-job.json](render-job.json); its precondition protects any workload already owning the B70 render devices. Trial renders use AM4's local Linux volume because \`/mnt/win\` is currently mounted read-only.\n\nAtlas hash: \`${atlasHash}\`\n`);

console.log(JSON.stringify({ status: "pass", output: outputDirectory, publicAsset: join(publicDirectory, "lab-topography-v1.json"), labs: nodes.length, recordedRuns: atlas.totals.recordedRuns, atlasHash }, null, 2));
