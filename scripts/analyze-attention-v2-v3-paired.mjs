import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const index = entry.indexOf("=");
  return index < 0 ? [entry.replace(/^--/, ""), "true"] : [entry.slice(2, index), entry.slice(index + 1)];
}));
const v2Path = resolve(args.v2 ?? "data/lab/attention-v2-corrected-shape-screen-analysis/assessment.json");
const v3Path = resolve(args.v3 ?? "data/lab/attention-v3-20260810-9mm/report.json");
const outputDir = resolve(args.out ?? "data/lab/attention-v2-v3-paired-analysis");
const [v2, v3] = await Promise.all([
  readFile(v2Path, "utf8").then(JSON.parse),
  readFile(v3Path, "utf8").then(JSON.parse)
]);

const EXPECTED_V2_RUNS = 9_216_000;
const EXPECTED_V3_RUNS = Number(args["expected-v3-runs"] ?? 9_216_000);
const EXPECTED_V3_SHARDS = Number(args["expected-v3-shards"] ?? 12);
if (v2.source?.runs !== EXPECTED_V2_RUNS || v2.integrity?.status !== "pass") throw new Error("Corrected v2 evidence is incomplete or invalid");
if (v3.runs !== EXPECTED_V3_RUNS || v3.modelVersion !== "duel-capacity-v3-experimental") throw new Error("V3 report is incomplete or has the wrong model");
if (v3.shards?.length !== EXPECTED_V3_SHARDS || v3.shards.reduce((sum, shard) => sum + shard.recordCount, 0) !== EXPECTED_V3_RUNS) {
  throw new Error("V3 report does not contain the expected complete shard/run count");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
function round(value, digits = 6) { return Number(value.toFixed(digits)); }
function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function player(cell, slot) { return cell.players.find((entry) => entry.playerSlot === slot); }
function score(wins, draws) { return wins + draws / 2; }

const totals = {
  runs: 0, draws: 0, rounds: 0, p1Wins: 0, p2Wins: 0,
  terminals: { objective: 0, drift: 0, "round-limit": 0, simultaneous: 0, forfeit: 0 }
};
const policyMap = new Map();
const scenarioMap = new Map();
const pairMap = new Map();
function accumulator(id) {
  return { id, runs: 0, score: 0, wins: 0, draws: 0, progress: 0, drift: 0, attention: 0, movement: 0, stationary: 0 };
}
function addPolicy(id, runs, wins, draws, metrics) {
  const row = policyMap.get(id) ?? accumulator(id);
  row.runs += runs; row.wins += wins; row.draws += draws; row.score += score(wins, draws);
  row.progress += metrics.averageProgress * runs;
  row.drift += metrics.averageDrift * runs;
  row.attention += metrics.averageAttentionSpent * runs;
  row.movement += metrics.averageMovementDistance * runs;
  row.stationary += metrics.averageStationaryTurns * runs;
  policyMap.set(id, row);
}
for (const cell of v3.cells) {
  const p1 = player(cell, 1); const p2 = player(cell, 2);
  if (!p1 || !p2) throw new Error(`Cell ${cell.matchupId} has incomplete player metrics`);
  totals.runs += cell.runs; totals.draws += cell.draws; totals.rounds += cell.averageRounds * cell.runs;
  totals.p1Wins += p1.wins; totals.p2Wins += p2.wins;
  for (const [reason, count] of Object.entries(cell.terminalReasons)) totals.terminals[reason] = (totals.terminals[reason] ?? 0) + count;
  addPolicy(cell.playerOnePolicyId, cell.runs, p1.wins, cell.draws, p1);
  addPolicy(cell.playerTwoPolicyId, cell.runs, p2.wins, cell.draws, p2);
  const scenario = scenarioMap.get(cell.scenarioId) ?? { id: cell.scenarioId, runs: 0, draws: 0, p1Wins: 0, rounds: 0, terminals: {} };
  scenario.runs += cell.runs; scenario.draws += cell.draws; scenario.p1Wins += p1.wins; scenario.rounds += cell.averageRounds * cell.runs;
  for (const [reason, count] of Object.entries(cell.terminalReasons)) scenario.terminals[reason] = (scenario.terminals[reason] ?? 0) + count;
  scenarioMap.set(cell.scenarioId, scenario);
  const key = `${cell.playerOnePolicyId}|${cell.playerTwoPolicyId}`;
  const pair = pairMap.get(key) ?? { p1: cell.playerOnePolicyId, p2: cell.playerTwoPolicyId, runs: 0, p1Score: 0 };
  pair.runs += cell.runs; pair.p1Score += score(p1.wins, cell.draws); pairMap.set(key, pair);
}
if (totals.runs !== EXPECTED_V3_RUNS || totals.p1Wins + totals.p2Wins + totals.draws !== EXPECTED_V3_RUNS) throw new Error("V3 aggregate cells do not reconcile");

const policies = [...policyMap.values()].map((row) => ({
  policy: row.id, runs: row.runs, score: round(row.score / row.runs), winRate: round(row.wins / row.runs), drawRate: round(row.draws / row.runs),
  progress: round(row.progress / row.runs), drift: round(row.drift / row.runs), attentionSpent: round(row.attention / row.runs),
  movement: round(row.movement / row.runs), stationary: round(row.stationary / row.runs)
})).sort((a, b) => b.score - a.score || a.policy.localeCompare(b.policy));
const policyIds = [...policies].map((row) => row.policy).sort();
const scenarios = [...scenarioMap.values()].map((row) => ({
  scenario: row.id, runs: row.runs, p1Score: round((row.p1Wins + row.draws / 2) / row.runs), drawRate: round(row.draws / row.runs),
  meanRounds: round(row.rounds / row.runs), terminalRates: Object.fromEntries(Object.entries(row.terminals).map(([key, value]) => [key, round(value / row.runs)]))
})).sort((a, b) => a.scenario.localeCompare(b.scenario));
const pairScores = Object.fromEntries([...pairMap].map(([key, row]) => [key, round(row.p1Score / row.runs)]));

const arcs = [];
for (const left of policyIds) for (const right of policyIds) {
  if (left === right) continue;
  const asP1 = pairMap.get(`${left}|${right}`); const asP2 = pairMap.get(`${right}|${left}`);
  if (!asP1 || !asP2) continue;
  const leftScore = (asP1.p1Score + (asP2.runs - asP2.p1Score)) / (asP1.runs + asP2.runs);
  if (leftScore > 0.55) arcs.push({ from: left, to: right, score: round(leftScore) });
}
function stronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) adjacency.get(edge.from).push(edge.to);
  let index = 0; const stack = []; const onStack = new Set(); const indices = new Map(); const low = new Map(); const result = [];
  function visit(node) {
    indices.set(node, index); low.set(node, index); index += 1; stack.push(node); onStack.add(node);
    for (const next of adjacency.get(node)) {
      if (!indices.has(next)) { visit(next); low.set(node, Math.min(low.get(node), low.get(next))); }
      else if (onStack.has(next)) low.set(node, Math.min(low.get(node), indices.get(next)));
    }
    if (low.get(node) === indices.get(node)) {
      const component = []; let member;
      do { member = stack.pop(); onStack.delete(member); component.push(member); } while (member !== node);
      result.push(component.sort());
    }
  }
  for (const node of nodes) if (!indices.has(node)) visit(node);
  return result.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
const components = stronglyConnectedComponents(policyIds, arcs);
const v3Summary = {
  runs: totals.runs,
  p1Score: round((totals.p1Wins + totals.draws / 2) / totals.runs),
  p1WinRate: round(totals.p1Wins / totals.runs), p2WinRate: round(totals.p2Wins / totals.runs), drawRate: round(totals.draws / totals.runs),
  meanRounds: round(totals.rounds / totals.runs), terminalRates: Object.fromEntries(Object.entries(totals.terminals).map(([key, value]) => [key, round(value / totals.runs)])),
  policies, scenarios, pairScores, counterplay: { dominanceThreshold: 0.55, arcs, components, largestComponent: components[0]?.length ?? 0 }
};
const analysisDraft = {
  schemaVersion: 1,
  analysisKind: "attention-v2-v3-paired-evidence",
  sources: {
    v2AnalysisHash: v2.analysisHash, v2CompletionReportHash: v2.source.completionReportHash, v2Runs: v2.source.runs,
    v3ReportHash: v3.reportHash, v3ManifestHash: v3.manifestHash, v3Runs: v3.runs,
    v3ModelHash: v3.provenance.modelHash, v3ImageDigest: v3.provenance.imageDigest ?? null
  },
  integrity: { status: "pass", v2: v2.integrity, v3Shards: v3.shards.length, v3CellRuns: totals.runs },
  v2: {
    outcomes: v2.outcomes, commanderDiversity: v2.commanderDiversity, counterplay: v2.counterplay,
    mechanics: v2.mechanics, selection: v2.selection
  },
  v3: v3Summary,
  comparisonBoundary: {
    comparable: ["run count", "pooled outcome rates", "rounds", "base attention/movement telemetry"],
    notCausallyComparable: ["policy strength", "commander diversity", "mechanic effect sizes", "model rankings"],
    reason: "The campaigns use different model versions, policy catalogs, compositions, scenario allocations, and sampling graphs.",
    v3TelemetryLimitation: "The v3 aggregate/raw record schema persists base counters but not nested UAP, spatial, or artillery counters; direct mechanic reachability remains supported by bounded v3 probes, not this 9.216M outcome screen."
  }
};
const analysis = { ...analysisDraft, analysisHash: sha256(analysisDraft) };

const colors = { teal: "#4ff0c5", amber: "#f8d66d", coral: "#ff7188", purple: "#b58cff", blue: "#68b7ff" };
function frame(title, subtitle, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}" role="img"><title>${esc(title)}</title><desc>${esc(subtitle)}</desc><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061119"/><stop offset=".58" stop-color="#0b1723"/><stop offset="1" stop-color="#071b1b"/></linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#31506a" opacity=".12"/></pattern><style>.s{font-family:Inter,'Segoe UI',Arial,sans-serif}.m{font-family:'Cascadia Mono',Consolas,monospace}.t{fill:#f4f8fc;font-weight:750}.muted{fill:#91a7bb}.teal{fill:#4ff0c5}.amber{fill:#f8d66d}.coral{fill:#ff7188}.purple{fill:#b58cff}</style></defs><rect width="1800" height="${height}" fill="url(#bg)"/><rect width="1800" height="${height}" fill="url(#grid)"/><text x="80" y="80" class="s teal" font-size="17" font-weight="700" letter-spacing="3">CONTEXT LANDSCAPE / PAIRED EVIDENCE</text><text x="80" y="145" class="s t" font-size="50">${esc(title)}</text><text x="80" y="188" class="s muted" font-size="21">${esc(subtitle)}</text>${body}<text x="80" y="${height - 35}" class="m muted" font-size="13">V2 CORRECTED + V3 EXPERIMENTAL / NO CROSS-VERSION CAUSAL CLAIM</text><text x="1720" y="${height - 35}" text-anchor="end" class="m muted" font-size="13">${analysis.analysisHash.slice(0, 25)}</text></svg>`;
}
function card(x, y, width, label, value, note, color = "teal") {
  return `<rect x="${x}" y="${y}" width="${width}" height="155" rx="15" fill="#101e2b" stroke="#294157"/><text x="${x + 26}" y="${y + 38}" class="s muted" font-size="14">${esc(label)}</text><text x="${x + 26}" y="${y + 92}" class="s ${color}" font-size="35" font-weight="750">${esc(value)}</text><text x="${x + 26}" y="${y + 125}" class="s muted" font-size="14">${esc(note)}</text>`;
}
function overviewSvg() {
  const v2o = v2.outcomes;
  const cards = [
    card(80, 245, 380, "V2 CORRECTED", `${(v2o.p1ScoreRate * 100).toFixed(2)}% P1 score`, `${v2.source.runs.toLocaleString()} runs · ${v2o.meanRounds.toFixed(2)} rounds`),
    card(490, 245, 380, "V3 EXPERIMENTAL", `${(v3Summary.p1Score * 100).toFixed(2)}% P1 score`, `${v3Summary.runs.toLocaleString()} runs · ${v3Summary.meanRounds.toFixed(2)} rounds`, "amber"),
    card(900, 245, 380, "V2 COUNTERPLAY", `${v2.counterplay.graph.largestStronglyConnectedComponent.toLocaleString()} nodes`, `${v2.counterplay.graph.arcs.toLocaleString()} supported dominance arcs`, "purple"),
    card(1310, 245, 410, "V3 COUNTERPLAY", `${v3Summary.counterplay.largestComponent} policies`, `${v3Summary.counterplay.arcs.length} arcs above 55%`, "purple")
  ].join("");
  return frame("Two 9.216M campaigns, two evidence roles", "Comparable scale; deliberately different policy/model experiments.", 1030, `${cards}<rect x="80" y="455" width="800" height="405" rx="16" fill="#101e2b" stroke="#4ff0c5"/><text x="115" y="505" class="s teal" font-size="19" font-weight="700">SUPPORTED SIDE BY SIDE</text><text x="115" y="555" class="s t" font-size="21">• pooled outcome and terminal distributions</text><text x="115" y="600" class="s t" font-size="21">• rounds, attention, movement, progress, drift</text><text x="115" y="645" class="s t" font-size="21">• within-campaign policy/counterplay structure</text><text x="115" y="715" class="s muted" font-size="17">V2: causal commander screen</text><text x="115" y="750" class="s muted" font-size="17">V3: experimental policy/scenario outcome screen</text><rect x="920" y="455" width="800" height="405" rx="16" fill="#101e2b" stroke="#ff7188"/><text x="955" y="505" class="s coral" font-size="19" font-weight="700">NOT A BEFORE / AFTER EFFECT ESTIMATE</text><text x="955" y="555" class="s t" font-size="21">• different model and policy catalogs</text><text x="955" y="600" class="s t" font-size="21">• different compositions and sampling graphs</text><text x="955" y="645" class="s t" font-size="21">• v3 nested mechanic counters were not persisted</text><text x="955" y="715" class="s muted" font-size="17">Use bounded v3 probes for direct UAP/spatial/artillery causality.</text>`);
}
function scoreboardSvg() {
  const rows = policies.map((row, index) => {
    const y = 260 + index * 66; const width = Math.max(2, row.score * 780); const color = row.score >= .5 ? colors.teal : colors.coral;
    return `<text x="80" y="${y + 20}" class="m t" font-size="15">${esc(row.policy)}</text><rect x="430" y="${y}" width="780" height="28" rx="6" fill="#152434"/><rect x="430" y="${y}" width="${width}" height="28" rx="6" fill="${color}"/><line x1="820" y1="${y - 4}" x2="820" y2="${y + 32}" stroke="#f8d66d" opacity=".8"/><text x="1235" y="${y + 20}" class="m t" font-size="14">${(row.score * 100).toFixed(2)}%</text><text x="1360" y="${y + 20}" class="m muted" font-size="14">P ${row.progress.toFixed(2)} · D ${row.drift.toFixed(2)} · M ${row.movement.toFixed(2)}</text>`;
  }).join("");
  return frame("V3 policy scoreboard", "Seat-pooled score across four scenarios and every 12×12 policy pairing.", 1110, `<text x="430" y="232" class="s muted" font-size="14">0%</text><text x="820" y="232" text-anchor="middle" class="s amber" font-size="14">50%</text><text x="1210" y="232" text-anchor="end" class="s muted" font-size="14">100%</text>${rows}`);
}
function heatmapSvg() {
  const x0 = 420, y0 = 330, size = 88;
  const cells = policyIds.flatMap((p1, row) => policyIds.map((p2, col) => {
    const value = pairScores[`${p1}|${p2}`] ?? .5; const delta = value - .5;
    const fill = delta >= 0 ? `rgba(79,240,197,${.18 + Math.min(.72, Math.abs(delta) * 1.5)})` : `rgba(255,113,136,${.18 + Math.min(.72, Math.abs(delta) * 1.5)})`;
    return `<rect x="${x0 + col * size}" y="${y0 + row * size}" width="${size - 3}" height="${size - 3}" rx="5" fill="${fill}"/><text x="${x0 + col * size + 42}" y="${y0 + row * size + 51}" text-anchor="middle" class="m t" font-size="12">${(value * 100).toFixed(1)}</text>`;
  })).join("");
  const rowLabels = policyIds.map((id, i) => `<text x="${x0 - 18}" y="${y0 + i * size + 51}" text-anchor="end" class="m t" font-size="12">${esc(id)}</text>`).join("");
  const colLabels = policyIds.map((id, i) => `<text x="${x0 + i * size + 50}" y="${y0 - 16}" transform="rotate(-55 ${x0 + i * size + 50} ${y0 - 16})" class="m t" font-size="12">${esc(id)}</text>`).join("");
  return frame("V3 policy interaction atlas", "Cell is Player-1 score; teal favors row policy, coral favors column policy.", 1480, `${rowLabels}${colLabels}${cells}<text x="80" y="1360" class="s muted" font-size="17">Each cell pools 64,000 matches: four scenarios × 16,000 fresh seeds.</text>`);
}
function scenarioSvg() {
  const rows = scenarios.map((row, index) => {
    const y = 300 + index * 150; const objective = row.terminalRates.objective ?? 0; const drift = row.terminalRates.drift ?? 0; const simultaneous = row.terminalRates.simultaneous ?? 0; const roundLimit = row.terminalRates["round-limit"] ?? 0;
    let x = 610; const segments = [[objective, colors.teal], [drift, colors.coral], [simultaneous, colors.purple], [roundLimit, colors.amber]].map(([rate, color]) => { const width = rate * 720; const svg = `<rect x="${x}" y="${y}" width="${width}" height="34" fill="${color}"/>`; x += width; return svg; }).join("");
    return `<text x="80" y="${y + 25}" class="s t" font-size="21">${esc(row.scenario)}</text><text x="360" y="${y + 24}" class="m amber" font-size="16">P1 ${(row.p1Score * 100).toFixed(2)}%</text><text x="485" y="${y + 24}" class="m muted" font-size="15">${row.meanRounds.toFixed(2)}r</text>${segments}<text x="1360" y="${y + 24}" class="m muted" font-size="14">draw ${(row.drawRate * 100).toFixed(2)}%</text>`;
  }).join("");
  return frame("V3 scenario outcome atlas", "Terminal mix and seat score across the four frozen environments.", 1030, `<text x="610" y="250" class="s muted" font-size="14">TERMINALS: <tspan fill="${colors.teal}">objective</tspan> · <tspan fill="${colors.coral}">drift</tspan> · <tspan fill="${colors.purple}">simultaneous</tspan> · <tspan fill="${colors.amber}">round limit</tspan></text>${rows}`);
}
function telemetrySvg() {
  const maxMovement = Math.max(...policies.map((row) => row.movement), 1); const maxAttention = Math.max(...policies.map((row) => row.attentionSpent), 1);
  const rows = policies.map((row, index) => { const y = 275 + index * 66; return `<text x="80" y="${y + 18}" class="m t" font-size="14">${esc(row.policy)}</text><rect x="430" y="${y}" width="${row.movement / maxMovement * 470}" height="20" rx="4" fill="${colors.blue}"/><rect x="970" y="${y}" width="${row.attentionSpent / maxAttention * 470}" height="20" rx="4" fill="${colors.amber}"/><text x="900" y="${y + 17}" text-anchor="end" class="m muted" font-size="13">${row.movement.toFixed(2)}</text><text x="1460" y="${y + 17}" class="m muted" font-size="13">${row.attentionSpent.toFixed(2)}</text>`; }).join("");
  return frame("V3 behavioral telemetry", "Base counters persisted in every record; bars normalize within each metric.", 1120, `<text x="430" y="230" class="s" fill="${colors.blue}" font-size="16">MOVEMENT DISTANCE</text><text x="970" y="230" class="s amber" font-size="16">ATTENTION SPENT</text>${rows}<text x="80" y="1050" class="s coral" font-size="16">Boundary: nested UAP, spatial, and artillery counters were not serialized by this large-run record schema.</text>`);
}
function markdown() {
  const top = policies[0], bottom = policies.at(-1); const scenarioRange = [Math.min(...scenarios.map((row) => row.p1Score)), Math.max(...scenarios.map((row) => row.p1Score))];
  return `# Attention v2 ↔ v3 paired 9.216M evidence assessment\n\nAnalysis hash: \`${analysis.analysisHash}\`  \nV2 analysis: \`${v2.analysisHash}\`  \nV3 report: \`${v3.reportHash}\`\n\n## Decision\n\nBoth 9,216,000-run campaigns are complete and internally valid. They support within-campaign deductions and a descriptive comparison of pooled outcomes. They do **not** form a causal before/after estimate because the model, policies, compositions, scenarios, and sampling graph changed together.\n\n## V2 corrected causal screen\n\n- Player-1 score: ${(v2.outcomes.p1ScoreRate * 100).toFixed(2)}%; draws ${(v2.outcomes.drawRate * 100).toFixed(2)}%; mean rounds ${v2.outcomes.meanRounds.toFixed(3)}.\n- ${v2.commanderDiversity.effectiveSoftmaxCommanders.toFixed(1)} effective commanders; largest counterplay SCC ${v2.counterplay.graph.largestStronglyConnectedComponent.toLocaleString()} nodes.\n- All ${v2.mechanics.requiredMechanics.length} required v2 mechanics were reached. Its six candidates remain provisional and holdout-gated.\n\n## V3 experimental policy screen\n\n- Player-1 score: ${(v3Summary.p1Score * 100).toFixed(2)}%; draws ${(v3Summary.drawRate * 100).toFixed(2)}%; mean rounds ${v3Summary.meanRounds.toFixed(3)}.\n- Highest seat-pooled policy: \`${top.policy}\` at ${(top.score * 100).toFixed(2)}%; lowest: \`${bottom.policy}\` at ${(bottom.score * 100).toFixed(2)}%.\n- Scenario Player-1 score spans ${(scenarioRange[0] * 100).toFixed(2)}%–${(scenarioRange[1] * 100).toFixed(2)}%.\n- The >55% policy graph contains ${arcs.length} arcs; largest strongly connected component ${components[0]?.length ?? 0}/${policyIds.length} policies.\n\n## Critical evidence boundary\n\nThe v3 large-run records contain outcome, progress, drift, attention, movement, and stationary telemetry. They do not serialize the engine's nested UAP, spatial, or artillery counters. Direct causal claims about those mechanics therefore remain grounded in the bounded Stage A–C/C6 probes; this screen measures the resulting policy landscape, not per-mechanic activation rates.\n\n## Suggested next move\n\nUse these charts to select a small set of v3 policy/scenario contrasts, then run a fresh telemetry-complete causal refinement with explicit nested mechanic counters and exact seat reversals. Do not promote a v3 policy from pooled score alone.\n`;
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "assessment.json"), `${JSON.stringify(analysis, null, 2)}\n`),
  writeFile(resolve(outputDir, "ASSESSMENT.md"), markdown()),
  writeFile(resolve(outputDir, "01-two-generations.svg"), overviewSvg()),
  writeFile(resolve(outputDir, "02-v3-policy-scoreboard.svg"), scoreboardSvg()),
  writeFile(resolve(outputDir, "03-v3-policy-interaction.svg"), heatmapSvg()),
  writeFile(resolve(outputDir, "04-v3-scenario-atlas.svg"), scenarioSvg()),
  writeFile(resolve(outputDir, "05-v3-behavioral-telemetry.svg"), telemetrySvg())
]);
console.log(JSON.stringify({ status: "pass", outputDir, analysisHash: analysis.analysisHash, v2Runs: v2.source.runs, v3Runs: v3.runs, charts: 5 }, null, 2));
