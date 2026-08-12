import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const input = "data/lab/game-art-pilot-v1/assessment.json";
const outputDirectory = "data/lab/game-art-pilot-v1";
const report = JSON.parse(readFileSync(input, "utf8"));
mkdirSync(outputDirectory, { recursive: true });

const palette = {
  background: "#07131b",
  panel: "#0d202a",
  grid: "#24414d",
  text: "#eef8f5",
  muted: "#8fb4c4",
  teal: "#76dbc1",
  amber: "#ffd166",
  coral: "#ff796c"
};
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const label = (value) => value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const svg = (title, subtitle, body, height = 760) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title description">
  <title id="title">${esc(title)}</title><desc id="description">${esc(subtitle)}</desc>
  <rect width="1200" height="${height}" fill="${palette.background}"/>
  <text x="62" y="72" fill="${palette.text}" font-family="Inter,Segoe UI,sans-serif" font-size="38" font-weight="750">${esc(title)}</text>
  <text x="62" y="108" fill="${palette.muted}" font-family="Inter,Segoe UI,sans-serif" font-size="17">${esc(subtitle)}</text>
  ${body}
  <text x="62" y="${height - 28}" fill="${palette.muted}" font-family="ui-monospace,Consolas,monospace" font-size="13">Context Landscape · ${esc(report.campaign)} · 2026-08-12</text>
</svg>`;
const text = (x, y, value, size = 16, color = palette.text, anchor = "start", weight = 500) => `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-family="Inter,Segoe UI,sans-serif" font-size="${size}" font-weight="${weight}">${esc(value)}</text>`;

function groupedScoreChart() {
  const rows = Object.entries(report.groups.artDirection);
  const metrics = [
    { key: "aesthetic", title: "Aesthetic", color: palette.teal, value: (row) => row.aesthetic.mean, min: 5.5, max: 7, format: (v) => v.toFixed(2) },
    { key: "clip", title: "Prompt CLIP", color: palette.amber, value: (row) => row.clip.mean, min: 0.2, max: 0.32, format: (v) => v.toFixed(3) },
    { key: "merch", title: "VLM merch appeal", color: palette.coral, value: (row) => row.vlm.merchAppealMean, min: 0, max: 100, format: (v) => v.toFixed(1) }
  ];
  let body = "";
  metrics.forEach((metric, panelIndex) => {
    const x = 62 + panelIndex * 375;
    const y = 152;
    body += `<rect x="${x}" y="${y}" width="345" height="520" rx="18" fill="${palette.panel}" stroke="${palette.grid}"/>`;
    body += text(x + 24, y + 42, metric.title, 20, palette.text, "start", 700);
    rows.forEach(([name, row], index) => {
      const value = metric.value(row);
      const rowY = y + 105 + index * 130;
      const width = Math.max(2, 285 * (value - metric.min) / (metric.max - metric.min));
      body += text(x + 24, rowY - 18, label(name), 14, palette.muted);
      body += `<rect x="${x + 24}" y="${rowY}" width="285" height="22" rx="11" fill="${palette.grid}"/><rect x="${x + 24}" y="${rowY}" width="${width}" height="22" rx="11" fill="${metric.color}"/>`;
      body += text(x + 309, rowY + 49, metric.format(value), 19, metric.color, "end", 750);
    });
  });
  return svg("Art direction scorecard", "Three deliberately distinct directions · 40 outputs per direction · higher is better", body);
}

function assetFamilyChart() {
  const rows = Object.entries(report.groups.subjectType);
  const metrics = [
    { title: "Aesthetic", value: (row) => row.aesthetic.mean, max: 7.2, color: palette.teal },
    { title: "Originality", value: (row) => row.vlm.originalityMean, max: 100, color: palette.amber },
    { title: "Merch appeal", value: (row) => row.vlm.merchAppealMean, max: 100, color: palette.coral }
  ];
  let body = `<rect x="62" y="148" width="1076" height="530" rx="18" fill="${palette.panel}" stroke="${palette.grid}"/>`;
  metrics.forEach((metric, index) => body += `<rect x="${750 + index * 112}" y="173" width="14" height="14" rx="3" fill="${metric.color}"/>${text(770 + index * 112, 186, metric.title, 13, palette.muted)}`);
  rows.forEach(([name, row], rowIndex) => {
    const y = 226 + rowIndex * 88;
    body += text(92, y + 17, label(name), 17, palette.text, "start", 650);
    metrics.forEach((metric, metricIndex) => {
      const baseX = 315 + metricIndex * 275;
      const value = metric.value(row);
      const width = 205 * value / metric.max;
      body += `<rect x="${baseX}" y="${y}" width="205" height="22" rx="11" fill="${palette.grid}"/><rect x="${baseX}" y="${y}" width="${width}" height="22" rx="11" fill="${metric.color}"/>`;
      body += text(baseX + 215, y + 18, metricIndex === 0 ? value.toFixed(2) : value.toFixed(1), 14, metric.color);
    });
  });
  return svg("What each asset family is good at", "Perception means across all directions and quality lanes · family sample sizes vary from 12 to 36", body);
}

function qualityLaneChart() {
  const paired = report.pairedQuality;
  const entries = [
    { title: "Aesthetic delta", unit: "points", data: paired.aestheticDeltaBf16MinusQ8, note: "Neither lane wins", higherLabel: "bf16 higher", precision: 3 },
    { title: "Prompt CLIP delta", unit: "cosine", data: paired.clipDeltaBf16MinusQ8, note: "Neither lane wins", higherLabel: "bf16 higher", precision: 3 },
    { title: "Render-time delta", unit: "seconds", data: paired.renderSecondsDeltaBf16MinusQ8, note: "Operational, not model benchmark", higherLabel: "bf16 slower", precision: 1 }
  ];
  let body = "";
  entries.forEach((entry, index) => {
    const x = 62 + index * 375;
    const y = 160;
    const [low, high] = entry.data.ci95;
    body += `<rect x="${x}" y="${y}" width="345" height="480" rx="18" fill="${palette.panel}" stroke="${palette.grid}"/>`;
    body += text(x + 24, y + 43, entry.title, 19, palette.text, "start", 700);
    body += text(x + 24, y + 130, `${entry.data.mean > 0 ? "+" : ""}${entry.data.mean.toFixed(entry.precision)}`, 54, entry.data.mean > 0 ? palette.amber : palette.teal, "start", 780);
    body += text(x + 24, y + 158, `bf16 − Q8 ${entry.unit}`, 14, palette.muted);
    body += text(x + 24, y + 220, `95% CI  ${low.toFixed(entry.precision)} to ${high.toFixed(entry.precision)}`, 16, palette.text);
    body += text(x + 24, y + 258, `Median  ${entry.data.median.toFixed(entry.precision)}`, 16, palette.text);
    body += text(x + 24, y + 296, `${entry.higherLabel}  ${(entry.data.bf16HigherShare * 100).toFixed(0)}%`, 16, palette.text);
    body += `<line x1="${x + 24}" y1="${y + 330}" x2="${x + 321}" y2="${y + 330}" stroke="${palette.grid}"/>`;
    body += text(x + 24, y + 375, entry.note, 17, palette.coral, "start", 650);
  });
  body += text(62, 692, "Matched on subject, art direction, and seed · n = 30 pairs · confidence intervals use paired Student-t estimates", 15, palette.muted);
  return svg("Does full bf16 buy us better art?", "Matched-pair comparison against the same-seed Q8 render; positive means bf16 is higher", body);
}

writeFileSync(`${outputDirectory}/01-art-direction-scorecard.svg`, groupedScoreChart());
writeFileSync(`${outputDirectory}/02-asset-family-scorecard.svg`, assetFamilyChart());
writeFileSync(`${outputDirectory}/03-quality-lane-comparison.svg`, qualityLaneChart());
console.log(JSON.stringify({ status: "pass", charts: 3, outputDirectory }, null, 2));
