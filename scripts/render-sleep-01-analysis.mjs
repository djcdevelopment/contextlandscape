import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repo = process.cwd();
const labRoot = join(repo, "data", "lab");
const outDir = join(labRoot, "sleep-01-analysis");
mkdirSync(outDir, { recursive: true });

const scenarios = [
  { id: "two-baked-slices", name: "Two Baked Slices", short: "TWO BAKED" },
  { id: "false-bottleneck", name: "False Bottleneck", short: "FALSE BOTTLENECK" },
  { id: "context-furnace", name: "Context Furnace", short: "CONTEXT FURNACE" },
  { id: "documentation-fortress", name: "Documentation Fortress", short: "DOC FORTRESS" }
];
const deepNames = {
  "two-baked-slices": "deep-two-baked-slices",
  "false-bottleneck": "deep-false-bottleneck",
  "context-furnace": "deep-context-furnace",
  "documentation-fortress": "deep-documentation-fortress"
};
const tuningNames = {
  default: "DEFAULT",
  "energy-plus-one": "ENERGY +1",
  "heat-minus-one": "HEAT −1",
  "full-send-cheap": "FULL SEND CHEAP",
  "full-send-expensive": "FULL SEND EXPENSIVE",
  "implement-cheap": "IMPLEMENT CHEAP"
};
const tuningColors = {
  default: "#8ca1b5",
  "energy-plus-one": "#67a9ff",
  "heat-minus-one": "#ff956b",
  "full-send-cheap": "#4ff0c5",
  "full-send-expensive": "#ff647c",
  "implement-cheap": "#b58cff"
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const loadReport = (name) => readJson(join(labRoot, `sleep-01-${name}`, "report.json"));
const train = loadReport("tuning-train");
const holdout = loadReport("tuning-holdout");
const deepReports = Object.fromEntries(scenarios.map((scenario) => [scenario.id, loadReport(deepNames[scenario.id])]));

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function commonSvg(title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(description)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071019"/>
      <stop offset="0.55" stop-color="#0a131e"/>
      <stop offset="1" stop-color="#07141a"/>
    </linearGradient>
    <linearGradient id="tealBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2fcfa9"/>
      <stop offset="1" stop-color="#65f5d0"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#274055" stroke-width="1" opacity=".16"/>
    </pattern>
    <style>
      .sans { font-family: Inter, "Segoe UI", Arial, sans-serif; }
      .mono { font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace; }
      .eyebrow { font: 700 16px Inter, "Segoe UI", Arial, sans-serif; letter-spacing: 3px; fill: #4ff0c5; }
      .title { font: 750 54px Inter, "Segoe UI", Arial, sans-serif; letter-spacing: -1.4px; fill: #f3f8fc; }
      .subtitle { font: 400 21px Inter, "Segoe UI", Arial, sans-serif; fill: #91a8bd; }
      .label { font: 650 15px Inter, "Segoe UI", Arial, sans-serif; letter-spacing: 1px; fill: #91a8bd; }
      .small { font: 400 14px Inter, "Segoe UI", Arial, sans-serif; fill: #7f96aa; }
      .metric { font: 750 42px Inter, "Segoe UI", Arial, sans-serif; fill: #f3f8fc; }
    </style>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)"/>
  <rect width="1600" height="1000" fill="url(#grid)"/>
  <path d="M0 0H620L450 1000H0Z" fill="#0c2030" opacity=".18"/>
  ${body}
  <text x="80" y="955" class="mono" font-size="13" fill="#60788e">SLEEP-01 • 19,456,000 RUNS • 2026-07-29 • COMPOSITIONS DEDUPED WHERE NOTED</text>
  <text x="1520" y="955" text-anchor="end" class="mono" font-size="13" fill="#60788e">MECH COMMANDER R&amp;D LAB</text>
</svg>`;
}

const validation = scenarios.map((scenario) => {
  const trainRows = train.recommendations
    .filter((row) => row.scenarioId === scenario.id)
    .sort((a, b) => b.score - a.score || a.tuningId.localeCompare(b.tuningId));
  const holdoutRows = holdout.recommendations.filter((row) => row.scenarioId === scenario.id);
  const topScore = trainRows[0].score;
  return {
    ...scenario,
    rows: trainRows.map((row) => ({
      ...row,
      holdoutScore: holdoutRows.find((other) => other.tuningId === row.tuningId).score
    })),
    leaders: trainRows.filter((row) => Math.abs(row.score - topScore) < 0.0005).map((row) => row.tuningId)
  };
});
const maxScoreDrift = Math.max(...validation.flatMap((scenario) => scenario.rows.map((row) => Math.abs(row.score - row.holdoutScore))));
const stableRankings = validation.filter((scenario) => {
  const trainOrder = scenario.rows.map((row) => row.tuningId).join("|");
  const holdoutOrder = [...scenario.rows].sort((a, b) => b.holdoutScore - a.holdoutScore || a.tuningId.localeCompare(b.tuningId)).map((row) => row.tuningId).join("|");
  return trainOrder === holdoutOrder;
}).length;

function validationSvg() {
  const cards = validation.map((scenario, index) => {
    const x = 80 + (index % 2) * 750;
    const y = 315 + Math.floor(index / 2) * 290;
    const chartX = x + 225;
    const chartWidth = 390;
    const maxScore = 2;
    const rows = scenario.rows.map((row, rowIndex) => {
      const rowY = y + 88 + rowIndex * 30;
      const trainX = chartX + (row.score / maxScore) * chartWidth;
      const holdoutX = chartX + (row.holdoutScore / maxScore) * chartWidth;
      const isLeader = scenario.leaders.includes(row.tuningId);
      return `
        <text x="${x + 24}" y="${rowY + 5}" class="sans" font-size="13" font-weight="${isLeader ? 700 : 500}" fill="${isLeader ? "#eaf7f3" : "#91a8bd"}">${esc(tuningNames[row.tuningId])}</text>
        <line x1="${chartX}" y1="${rowY}" x2="${chartX + chartWidth}" y2="${rowY}" stroke="#243444" stroke-width="6" stroke-linecap="round"/>
        <line x1="${chartX}" y1="${rowY}" x2="${trainX}" y2="${rowY}" stroke="${tuningColors[row.tuningId]}" stroke-width="${isLeader ? 8 : 5}" stroke-linecap="round" opacity="${isLeader ? 1 : .68}"/>
        <line x1="${Math.min(trainX, holdoutX)}" y1="${rowY}" x2="${Math.max(trainX, holdoutX)}" y2="${rowY}" stroke="#f7fbff" stroke-width="2"/>
        <circle cx="${holdoutX}" cy="${rowY}" r="${isLeader ? 5 : 4}" fill="#071019" stroke="#f7fbff" stroke-width="2"/>
        <text x="${chartX + chartWidth + 18}" y="${rowY + 5}" class="mono" font-size="13" fill="${isLeader ? "#f3f8fc" : "#7f96aa"}">${row.score.toFixed(3)} / ${row.holdoutScore.toFixed(3)}</text>`;
    }).join("");
    const status = scenario.leaders.length === 1 ? "UNIQUE LEADER" : `${scenario.leaders.length}-WAY TIE`;
    const statusColor = scenario.leaders.length === 1 ? "#4ff0c5" : "#ffc857";
    return `
      <g>
        <rect x="${x}" y="${y}" width="710" height="260" rx="18" fill="#101b27" stroke="#26384a"/>
        <text x="${x + 24}" y="${y + 38}" class="sans" font-size="22" font-weight="700" fill="#f3f8fc">${esc(scenario.name)}</text>
        <rect x="${x + 530}" y="${y + 18}" width="154" height="30" rx="15" fill="${statusColor}" opacity=".12" stroke="${statusColor}"/>
        <text x="${x + 607}" y="${y + 39}" text-anchor="middle" class="mono" font-size="12" font-weight="700" fill="${statusColor}">${status}</text>
        <text x="${chartX}" y="${y + 66}" class="mono" font-size="11" fill="#60788e">0</text>
        <text x="${chartX + chartWidth}" y="${y + 66}" text-anchor="end" class="mono" font-size="11" fill="#60788e">COMPOSITE SCORE 2.0</text>
        ${rows}
      </g>`;
  }).join("");
  return commonSvg(
    "Holdout replication of tuning rankings",
    "Four scenario tuning rankings on train and disjoint holdout seeds. All rankings replicate, but two scenarios have three-way ties.",
    `<text x="80" y="76" class="eyebrow">VALIDATION / DISJOINT SEED RANGES</text>
     <text x="80" y="145" class="title">The ranking repeats. The certainty does not.</text>
     <text x="80" y="188" class="subtitle">Train bars and holdout dots overlap across all 24 tuning comparisons.</text>

     <g transform="translate(80 220)">
       <rect width="330" height="70" rx="14" fill="#10202b" stroke="#28506a"/>
       <text x="22" y="29" class="label">RANKINGS REPLICATED</text>
       <text x="22" y="57" class="mono" font-size="24" font-weight="700" fill="#4ff0c5">${stableRankings}/4 scenarios</text>
     </g>
     <g transform="translate(430 220)">
       <rect width="330" height="70" rx="14" fill="#10202b" stroke="#28506a"/>
       <text x="22" y="29" class="label">MAX SCORE DRIFT</text>
       <text x="22" y="57" class="mono" font-size="24" font-weight="700" fill="#f3f8fc">${maxScoreDrift.toFixed(3)}</text>
     </g>
     <g transform="translate(780 220)">
       <rect width="350" height="70" rx="14" fill="#10202b" stroke="#28506a"/>
       <text x="22" y="29" class="label">UNIQUE WINNERS</text>
       <text x="22" y="57" class="mono" font-size="24" font-weight="700" fill="#4ff0c5">2 / 4 scenarios</text>
     </g>
     <g transform="translate(1150 220)">
       <rect width="370" height="70" rx="14" fill="#241d13" stroke="#6b5326"/>
       <text x="22" y="29" class="label" fill="#cbb37b">AMBIGUOUS LEADERS</text>
       <text x="22" y="57" class="mono" font-size="24" font-weight="700" fill="#ffc857">2 three-way ties</text>
     </g>
     ${cards}
     <g transform="translate(80 905)">
       <line x1="0" y1="0" x2="30" y2="0" stroke="#4ff0c5" stroke-width="7" stroke-linecap="round"/>
       <text x="42" y="5" class="small">TRAIN SCORE</text>
       <circle cx="180" cy="0" r="5" fill="#071019" stroke="#f7fbff" stroke-width="2"/>
       <text x="194" y="5" class="small">HOLDOUT SCORE</text>
       <text x="420" y="5" class="small">Composite score rewards lesson separation plus the raw count of viable composition-policy cells.</text>
     </g>`
  );
}

function policyLandscape(report, scenarioId, tuningId = "default") {
  const rows = report.cells.filter((cell) => cell.scenarioId === scenarioId && cell.tuningId === tuningId);
  const policies = new Map();
  for (const row of rows) {
    const policy = policies.get(row.policyId) ?? { policyId: row.policyId, winRate: 0, count: 0 };
    policy.winRate += row.winRate;
    policy.count += 1;
    policies.set(row.policyId, policy);
  }
  const winRates = [...policies.values()].map((policy) => policy.winRate / policy.count);
  return {
    total: winRates.length,
    dead: winRates.filter((rate) => rate < 0.05).length,
    fringe: winRates.filter((rate) => (rate >= 0.05 && rate < 0.2) || (rate > 0.8 && rate <= 0.95)).length,
    viable: winRates.filter((rate) => rate >= 0.2 && rate <= 0.8).length,
    dominant: winRates.filter((rate) => rate > 0.95).length
  };
}

const landscapes = scenarios.map((scenario) => ({
  ...scenario,
  ...policyLandscape(deepReports[scenario.id], scenario.id)
}));
const landscapeTotals = landscapes.reduce((totals, row) => {
  for (const field of ["total", "dead", "fringe", "viable", "dominant"]) totals[field] += row[field];
  return totals;
}, { total: 0, dead: 0, fringe: 0, viable: 0, dominant: 0 });

function policyDesertSvg() {
  const colors = { dead: "#293542", fringe: "#8a79ff", viable: "#4ff0c5", dominant: "#ffc857" };
  const barX = 370;
  const barWidth = 1020;
  const bars = landscapes.map((scenario, index) => {
    const y = 390 + index * 125;
    let cursor = barX;
    const segments = ["dead", "fringe", "viable", "dominant"].map((field) => {
      const count = scenario[field];
      const width = (count / scenario.total) * barWidth;
      const segment = `<rect x="${cursor}" y="${y}" width="${Math.max(0, width)}" height="58" fill="${colors[field]}"/>`;
      cursor += width;
      return segment;
    }).join("");
    const deadPct = (scenario.dead / scenario.total) * 100;
    return `
      <text x="80" y="${y + 25}" class="sans" font-size="21" font-weight="700" fill="#f3f8fc">${esc(scenario.name)}</text>
      <text x="80" y="${y + 49}" class="mono" font-size="13" fill="#7f96aa">128 UNIQUE POLICIES</text>
      <clipPath id="bar-${index}"><rect x="${barX}" y="${y}" width="${barWidth}" height="58" rx="12"/></clipPath>
      <g clip-path="url(#bar-${index})">${segments}</g>
      <rect x="${barX}" y="${y}" width="${barWidth}" height="58" rx="12" fill="none" stroke="#3a4d5f"/>
      <text x="${barX + 18}" y="${y + 36}" class="mono" font-size="17" font-weight="700" fill="#c3d0da">${scenario.dead} DEAD • ${deadPct.toFixed(1)}%</text>
      <text x="1515" y="${y + 25}" text-anchor="end" class="mono" font-size="15" font-weight="700" fill="#4ff0c5">${scenario.viable} viable</text>
      <text x="1515" y="${y + 48}" text-anchor="end" class="mono" font-size="13" fill="#ffc857">${scenario.dominant} dominant</text>`;
  }).join("");
  return commonSvg(
    "The deep policy search is mostly a policy desert",
    "Stacked bars classify 128 unique policies per scenario. Across 512 deduplicated policies, 87.1 percent are dead and only 3.9 percent are viable.",
    `<text x="80" y="76" class="eyebrow">POLICY LANDSCAPE / DEEP MATRICES / DEFAULT TUNING</text>
     <text x="80" y="145" class="title">87% of generated policies are dead.</text>
     <text x="80" y="188" class="subtitle">Random policy generation creates volume, but very little useful balance evidence.</text>

     <g transform="translate(80 230)">
       <rect width="430" height="112" rx="18" fill="#101b27" stroke="#344555"/>
       <text x="24" y="34" class="label">DEAD POLICIES • WIN RATE &lt; 5%</text>
       <text x="24" y="83" class="metric">${((landscapeTotals.dead / landscapeTotals.total) * 100).toFixed(1)}%</text>
       <text x="190" y="81" class="mono" font-size="18" fill="#91a8bd">${landscapeTotals.dead} / ${landscapeTotals.total}</text>
     </g>
     <g transform="translate(535 230)">
       <rect width="430" height="112" rx="18" fill="#0f2523" stroke="#2b695b"/>
       <text x="24" y="34" class="label" fill="#8ccfbe">VIABLE • 20–80% WIN RATE</text>
       <text x="24" y="83" class="metric" fill="#4ff0c5">${((landscapeTotals.viable / landscapeTotals.total) * 100).toFixed(1)}%</text>
       <text x="176" y="81" class="mono" font-size="18" fill="#91a8bd">${landscapeTotals.viable} / ${landscapeTotals.total}</text>
     </g>
     <g transform="translate(990 230)">
       <rect width="530" height="112" rx="18" fill="#241d13" stroke="#6b5326"/>
       <text x="24" y="34" class="label" fill="#cbb37b">DOMINANT • WIN RATE &gt; 95%</text>
       <text x="24" y="83" class="metric" fill="#ffc857">${((landscapeTotals.dominant / landscapeTotals.total) * 100).toFixed(1)}%</text>
       <text x="176" y="81" class="mono" font-size="18" fill="#91a8bd">${landscapeTotals.dominant} / ${landscapeTotals.total}</text>
     </g>
     ${bars}
     <g transform="translate(370 885)">
       <rect x="0" y="-12" width="18" height="18" rx="4" fill="${colors.dead}"/><text x="28" y="2" class="small">DEAD &lt;5%</text>
       <rect x="165" y="-12" width="18" height="18" rx="4" fill="${colors.fringe}"/><text x="193" y="2" class="small">FRINGE</text>
       <rect x="315" y="-12" width="18" height="18" rx="4" fill="${colors.viable}"/><text x="343" y="2" class="small">VIABLE 20–80%</text>
       <rect x="520" y="-12" width="18" height="18" rx="4" fill="${colors.dominant}"/><text x="548" y="2" class="small">DOMINANT &gt;95%</text>
     </g>
     <text x="80" y="905" class="small">Each policy is averaged across four composition labels, then counted once; the current composition curves are identical.</text>`
  );
}

function pressureSeries(report, scenarioId, pressure) {
  const rows = report.pressureSensitivity.filter((row) =>
    row.scenarioId === scenarioId &&
    row.tuningId === "default" &&
    row.pressure === pressure &&
    row.policyId.startsWith("lesson-")
  );
  const values = [...new Set(rows.map((row) => row.value))].sort((a, b) => a - b);
  return values.map((value) => {
    const matches = rows.filter((row) => row.value === value);
    const runs = matches.reduce((sum, row) => sum + row.runs, 0);
    return {
      value,
      runs,
      winRate: matches.reduce((sum, row) => sum + row.winRate * row.runs, 0) / runs
    };
  });
}

const pressureFields = [
  { id: "startingCommanderEnergy", name: "ENERGY" },
  { id: "startingHeat", name: "HEAT" },
  { id: "startingDispersion", name: "DISPERSION" },
  { id: "startingConfidenceDrift", name: "CONFIDENCE DRIFT" }
];
const pressureGrid = scenarios.map((scenario) => ({
  ...scenario,
  values: pressureFields.map((pressure) => {
    const series = pressureSeries(deepReports[scenario.id], scenario.id, pressure.id);
    const rates = series.map((point) => point.winRate);
    return { ...pressure, swing: (Math.max(...rates) - Math.min(...rates)) * 100, series };
  })
}));
const flatPressureCells = pressureGrid.flatMap((scenario) => scenario.values).filter((cell) => cell.swing < 6).length;
const energyCliff = pressureGrid.find((scenario) => scenario.id === "two-baked-slices").values[0].series;

function heatColor(value) {
  if (value >= 50) return "#ff647c";
  if (value >= 10) return "#ffc857";
  if (value > 0) return "#315d62";
  return "#182633";
}

function pressureCoverageSvg() {
  const gridX = 390;
  const cellWidth = 250;
  const grid = pressureGrid.map((scenario, rowIndex) => {
    const y = 388 + rowIndex * 105;
    const cells = scenario.values.map((pressure, colIndex) => {
      const x = gridX + colIndex * cellWidth;
      return `
        <rect x="${x}" y="${y}" width="${cellWidth - 16}" height="76" rx="12" fill="${heatColor(pressure.swing)}" stroke="${pressure.swing >= 50 ? "#ff8da0" : "#304456"}"/>
        <text x="${x + (cellWidth - 16) / 2}" y="${y + 47}" text-anchor="middle" class="mono" font-size="25" font-weight="700" fill="${pressure.swing >= 50 ? "#fff3f5" : "#dce8f0"}">${pressure.swing.toFixed(1)} pp</text>`;
    }).join("");
    return `
      <text x="80" y="${y + 35}" class="sans" font-size="20" font-weight="700" fill="#f3f8fc">${esc(scenario.name)}</text>
      <text x="80" y="${y + 59}" class="mono" font-size="12" fill="#7f96aa">INTENDED DOCTRINE</text>
      ${cells}`;
  }).join("");
  const columnLabels = pressureFields.map((pressure, index) =>
    `<text x="${gridX + index * cellWidth + (cellWidth - 16) / 2}" y="364" text-anchor="middle" class="label">${pressure.name}</text>`
  ).join("");
  const plotX = 400;
  const plotY = 825;
  const plotWidth = 300;
  const plotHeight = 90;
  const lessonPoints = energyCliff.map((point, index) => ({
    x: plotX + index * plotWidth,
    y: plotY + plotHeight - point.winRate * plotHeight,
    ...point
  }));
  return commonSvg(
    "Four pressure knobs, one meaningful outcome lever",
    "Heatmap of intended-doctrine win-rate swing across pressure values. Only starting energy in Two Baked Slices produces a substantial change, a 100 percentage point cliff.",
    `<text x="80" y="76" class="eyebrow">SEED PRESSURE / DEFAULT TUNING / DEEP MATRICES</text>
     <text x="80" y="145" class="title">Four pressure knobs. One real outcome lever.</text>
     <text x="80" y="188" class="subtitle">Win-rate swing across each tested starting-pressure range, in percentage points.</text>

     <g transform="translate(80 230)">
       <rect width="430" height="100" rx="18" fill="#2b151c" stroke="#713142"/>
       <text x="24" y="34" class="label" fill="#d59aa8">ONLY MATERIAL EFFECT</text>
       <text x="24" y="76" class="mono" font-size="28" font-weight="700" fill="#ff647c">100 pp energy cliff</text>
     </g>
     <g transform="translate(535 230)">
       <rect width="430" height="100" rx="18" fill="#101b27" stroke="#344555"/>
       <text x="24" y="34" class="label">EFFECTIVELY FLAT</text>
       <text x="24" y="76" class="mono" font-size="28" font-weight="700" fill="#f3f8fc">${flatPressureCells} / 16 cells &lt; 6 pp</text>
     </g>
     <g transform="translate(990 230)">
       <rect width="530" height="100" rx="18" fill="#10202b" stroke="#28506a"/>
       <text x="24" y="34" class="label">INTERPRETATION</text>
       <text x="24" y="70" class="sans" font-size="18" font-weight="600" fill="#4ff0c5">Seed diversity ≠ decision diversity</text>
     </g>

     ${columnLabels}
     ${grid}

     <g transform="translate(80 795)">
       <rect width="700" height="130" rx="16" fill="#101b27" stroke="#344555"/>
       <text x="22" y="30" class="label">TWO BAKED SLICES • ENERGY CLIFF</text>
       <line x1="${plotX - 80}" y1="${plotY - 795 + plotHeight}" x2="${plotX - 80 + plotWidth}" y2="${plotY - 795 + plotHeight}" stroke="#3a4d5f"/>
       <line x1="${lessonPoints[0].x - 80}" y1="${lessonPoints[0].y - 795}" x2="${lessonPoints[1].x - 80}" y2="${lessonPoints[1].y - 795}" stroke="#4ff0c5" stroke-width="6"/>
       ${lessonPoints.map((point) => `
         <circle cx="${point.x - 80}" cy="${point.y - 795}" r="8" fill="#4ff0c5" filter="url(#glow)"/>
         <text x="${point.x - 80}" y="${point.y - 795 - 16}" text-anchor="middle" class="mono" font-size="15" font-weight="700" fill="#f3f8fc">${Math.round(point.winRate * 100)}%</text>
         <text x="${point.x - 80}" y="116" text-anchor="middle" class="mono" font-size="13" fill="#91a8bd">ENERGY ${point.value}</text>`).join("")}
       <text x="660" y="58" text-anchor="end" class="sans" font-size="16" fill="#91a8bd">One point of energy flips</text>
       <text x="660" y="84" text-anchor="end" class="sans" font-size="22" font-weight="700" fill="#ff647c">0% → 100%</text>
     </g>
     <g transform="translate(805 795)">
       <rect width="715" height="130" rx="16" fill="#171d25" stroke="#4a4650"/>
       <text x="22" y="30" class="label">NEXT R&amp;D GATE</text>
       <text x="22" y="61" class="sans" font-size="17" fill="#d4e0e9">Make heat, dispersion, and confidence alter resolution—not only hashes.</text>
       <text x="22" y="91" class="sans" font-size="17" fill="#d4e0e9">Target graded 10–30 pp responses; reject binary resource cliffs.</text>
     </g>`
  );
}

const metrics = {
  campaignRuns: 19_456_000,
  validation: {
    stableRankings,
    maxScoreDrift,
    uniqueLeaderScenarios: validation.filter((scenario) => scenario.leaders.length === 1).length,
    tiedLeaderScenarios: validation.filter((scenario) => scenario.leaders.length > 1).length,
    scenarios: validation.map((scenario) => ({
      scenarioId: scenario.id,
      leaders: scenario.leaders,
      scores: scenario.rows.map((row) => ({
        tuningId: row.tuningId,
        train: row.score,
        holdout: row.holdoutScore
      }))
    }))
  },
  policyLandscape: { totals: landscapeTotals, scenarios: landscapes },
  pressureCoverage: {
    effectivelyFlatCells: flatPressureCells,
    totalCells: pressureGrid.length * pressureFields.length,
    scenarios: pressureGrid.map((scenario) => ({
      scenarioId: scenario.id,
      swings: Object.fromEntries(scenario.values.map((pressure) => [pressure.id, Number(pressure.swing.toFixed(3))]))
    }))
  }
};

writeFileSync(join(outDir, "01-holdout-replication.svg"), validationSvg());
writeFileSync(join(outDir, "02-policy-desert.svg"), policyDesertSvg());
writeFileSync(join(outDir, "03-pressure-coverage.svg"), pressureCoverageSvg());
writeFileSync(join(outDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
console.log(`Wrote analysis SVGs and metrics to ${outDir}`);
