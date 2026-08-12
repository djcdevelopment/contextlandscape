import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const source = JSON.parse(readFileSync(join(root, "data/lab/attention-v2-corrected-shape-screen-analysis/assessment.json"), "utf8"));
const out = join(root, "data/lab/lab-topography-atlas-v1");
const pub = join(root, "apps/web/public/atlas");
mkdirSync(out, { recursive: true }); mkdirSync(pub, { recursive: true });
const width = 1152, height = 736, columns = 80, rows = 80;
const commanders = source.commanders;
const axes = {
  composition: [...new Set(commanders.map((r) => r.compositionModule))].sort(),
  movement: [...new Set(commanders.map((r) => r.movementModule))].sort(),
  triage: [...new Set(commanders.map((r) => r.triageModule))].sort(),
  capacity: [...new Set(commanders.map((r) => r.capacityModule))].sort()
};
const max = Math.max(...commanders.map((r) => r.mechanicRates.uplinkAttentionGenerated ?? 0), 1e-9);
const field = new Float32Array(columns * rows);
for (const r of commanders) {
  const x = axes.composition.indexOf(r.compositionModule) * axes.movement.length + axes.movement.indexOf(r.movementModule);
  const y = axes.triage.indexOf(r.triageModule) * axes.capacity.length + axes.capacity.indexOf(r.capacityModule);
  field[y * columns + x] = (r.mechanicRates.uplinkAttentionGenerated ?? 0) / max;
}
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([len, name, data, sum]); }
function png(channels, pixels) { const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 1 ? 0 : 2; const stride = width * channels; const scan = Buffer.alloc((stride + 1) * height); for (let y = 0; y < height; y++) pixels.copy(scan, y * (stride + 1) + 1, y * stride, (y + 1) * stride); return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan, { level: 9 })), chunk("IEND", Buffer.alloc(0))]); }
const gray = Buffer.alloc(width * height), rgb = Buffer.alloc(width * height * 3);
const colors = [[47, 106, 140], [56, 145, 118], [211, 153, 66], [191, 74, 88], [120, 88, 170]];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const gx = Math.min(columns - 1, Math.floor(x / width * columns)), gy = Math.min(rows - 1, Math.floor(y / height * rows));
  const v = field[gy * columns + gx]; const p = y * width + x; gray[p] = Math.round(v * 255);
  const band = Math.min(colors.length - 1, Math.floor(x / width * colors.length)); const c = colors[band]; rgb[p*3]=c[0]; rgb[p*3+1]=c[1]; rgb[p*3+2]=c[2];
}
for (const [name, data] of [["commander-field-height.png", png(1, gray)], ["commander-field-semantic-mask.png", png(3, rgb)]]) { writeFileSync(join(out, name), data); writeFileSync(join(pub, name), data); }
console.log(JSON.stringify({ status: "pass", dimensions: [width, height], metric: "uplinkAttentionGenerated", max, outputs: ["commander-field-height.png", "commander-field-semantic-mask.png"] }, null, 2));
