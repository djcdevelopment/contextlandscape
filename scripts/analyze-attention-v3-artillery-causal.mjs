import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const split = entry.indexOf("=");
  return split < 0 ? [entry.replace(/^--/, ""), "true"] : [entry.slice(2, split), entry.slice(split + 1)];
}));
const matrixDir = resolve(args.matrix ?? "data/lab/attention-v3-artillery-causal-9mm");
const outputDir = resolve(args.out ?? `${matrixDir}-analysis`);
const [manifest, report] = await Promise.all([
  readFile(resolve(matrixDir, "manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(matrixDir, "report.json"), "utf8").then(JSON.parse)
]);
if (manifest.campaignKind !== "v3-artillery-causal" || manifest.schemaVersion !== 2) throw new Error("Not an artillery causal v2 matrix");
const expectedRuns = Number(args["expected-runs"] ?? 9_216_000);
const expectedShards = Number(args["expected-shards"] ?? 12);
if (report.runs !== expectedRuns || report.shards?.length !== expectedShards) throw new Error("The expected campaign run/shard set is not complete");
if (report.manifestHash !== manifest.provenance.manifestHash || report.provenance.contractVersion !== 2) throw new Error("Report provenance does not bind the v2 manifest");

const variants = new Map(manifest.variants.map((variant) => [variant.variantId, variant]));
const policies = manifest.policies.map((policy) => policy.policyId);
const sumMap = (target, source = {}) => Object.entries(source).forEach(([key, value]) => { target[key] = (target[key] ?? 0) + value; });
const totals = {
  considered: 0, passes: 0, flareDeclarations: 0, chaffDeclarations: 0, shellsFired: 0,
  flareEstablished: 0, hostileBlocked: 0, driftFourSurvivals: 0, driftFiveDefeats: 0,
  reasons: {}, targets: {}, driftHistogram: {}, uap: {}, spatial: {}, artillery: {}
};
const stageScores = { A: { score: 0, runs: 0 }, B: { score: 0, runs: 0 }, C: { score: 0, runs: 0 } };
const pairScores = new Map();
const causalPairs = new Map();
for (const cell of report.cells) {
  const variant = variants.get(cell.variantId);
  const stage = variant.factorLevels.capabilityStage;
  const p1 = cell.players.find((player) => player.playerSlot === 1);
  const cellScore = p1.winRate;
  stageScores[stage].score += cellScore * cell.runs;
  stageScores[stage].runs += cell.runs;
  for (const player of cell.players) {
    if (player.artilleryDecisionTotals) {
      totals.considered += player.artilleryDecisionTotals.phasesConsidered;
      totals.passes += player.artilleryDecisionTotals.passes;
      totals.flareDeclarations += player.artilleryDecisionTotals.flareDeclarations;
      totals.chaffDeclarations += player.artilleryDecisionTotals.chaffDeclarations;
      sumMap(totals.reasons, player.artilleryDecisionTotals.byReason);
      sumMap(totals.targets, player.artilleryDecisionTotals.byTargetBasis);
    }
    if (player.artilleryTotals) {
      totals.shellsFired += player.artilleryTotals.shellsFired;
      totals.flareEstablished += player.artilleryTotals.flareShellsEstablished;
      totals.hostileBlocked += player.artilleryTotals.hostileShellsBlocked;
      sumMap(totals.artillery, player.artilleryTotals);
    }
    sumMap(totals.uap, player.uapTotals);
    sumMap(totals.spatial, player.spatialTotals);
    sumMap(totals.driftHistogram, player.driftHistogram);
    totals.driftFourSurvivals += player.driftFourSurvivals ?? 0;
    totals.driftFiveDefeats += player.driftFiveDefeats ?? 0;
  }
  if (stage === "C") {
    const key = `${cell.playerOnePolicyId}|${cell.playerTwoPolicyId}`;
    const entry = pairScores.get(key) ?? { score: 0, runs: 0 };
    entry.score += cellScore * cell.runs; entry.runs += cell.runs; pairScores.set(key, entry);
  }
  if (stage === "B" || stage === "C") {
    const key = [cell.matchupId, variant.factorLevels.soundnessRate, variant.factorLevels.objectiveCoupling,
      cell.playerOnePolicyId, cell.playerTwoPolicyId].join("|");
    const entry = causalPairs.get(key) ?? {};
    entry[stage] = cellScore; causalPairs.set(key, entry);
  }
}
for (const stage of Object.values(stageScores)) stage.score /= stage.runs;
const artilleryDeltas = [...causalPairs.values()].filter((entry) => entry.B !== undefined && entry.C !== undefined).map((entry) => entry.C - entry.B);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const sorted = [...artilleryDeltas].sort((a, b) => a - b);
const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] ?? 0;
const interaction = policies.flatMap((left) => policies.map((right) => {
  const value = pairScores.get(`${left}|${right}`) ?? { score: 0, runs: 0 };
  return { left, right, score: value.score / Math.max(1, value.runs), runs: value.runs };
}));
const arcs = interaction.filter((row) => row.left !== row.right && row.score > 0.55).map((row) => ({ from: row.left, to: row.right, score: row.score }));

const assessmentBase = {
  schemaVersion: 1,
  source: { matrixId: manifest.matrixId, manifestHash: manifest.provenance.manifestHash, reportHash: report.reportHash, runs: report.runs },
  rules: { driftLimit: 5, driftFourIsNonterminal: true },
  artilleryFunnel: {
    considered: totals.considered,
    declared: totals.flareDeclarations + totals.chaffDeclarations,
    flareDeclarations: totals.flareDeclarations,
    chaffDeclarations: totals.chaffDeclarations,
    fired: totals.shellsFired,
    flareEstablished: totals.flareEstablished,
    hostileBlocked: totals.hostileBlocked,
    passes: totals.passes
  },
  artilleryReasons: totals.reasons,
  artilleryTargets: totals.targets,
  capabilityReachability: { uap: totals.uap, spatial: totals.spatial, artillery: totals.artillery },
  causalContrast: {
    estimand: "Stage C minus Stage B Player-1 score under matched public factors and common seed streams",
    cells: artilleryDeltas.length,
    mean: mean(artilleryDeltas),
    p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9)
  },
  stages: stageScores,
  fiveDriftBoundary: {
    finalDriftHistogram: totals.driftHistogram,
    survivedRoundsAtFour: totals.driftFourSurvivals,
    fivePlusDriftDefeats: totals.driftFiveDefeats
  },
  counterplay: { threshold: 0.55, arcs, interaction },
  evidenceBoundary: [
    "Stage C versus Stage B contrasts are supported by matched factors and common world streams.",
    "Policy rankings remain conditional on the preregistered scenarios, compositions, doctrines, and five-drift ruleset.",
    "Four-drift historical campaigns are descriptive comparators, not members of this causal contrast."
  ]
};
const analysisHash = `sha256:${createHash("sha256").update(JSON.stringify(assessmentBase)).digest("hex")}`;
const assessment = { ...assessmentBase, analysisHash };

const colors = { bg: "#07131f", panel: "#102536", teal: "#4ff0c5", coral: "#ff7188", amber: "#f8d66d", blue: "#72b7ff", text: "#ecf7ff", muted: "#9fb3c5" };
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const frame = (title, subtitle, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}"><rect width="1800" height="${height}" fill="${colors.bg}"/><style>.s{font-family:Segoe UI,Arial,sans-serif}.m{font-family:Consolas,monospace}.t{fill:${colors.text}}.u{fill:${colors.muted}}</style><text x="70" y="72" class="s t" font-size="34" font-weight="700">${esc(title)}</text><text x="70" y="108" class="s u" font-size="18">${esc(subtitle)}</text>${body}</svg>`;
const bars = (items, max, x = 520, y = 180, width = 1120, row = 62) => items.map(([label, value, color = colors.teal], index) => `<text x="70" y="${y + index * row + 25}" class="m t" font-size="16">${esc(label)}</text><rect x="${x}" y="${y + index * row}" width="${width}" height="30" rx="6" fill="${colors.panel}"/><rect x="${x}" y="${y + index * row}" width="${max ? value / max * width : 0}" height="30" rx="6" fill="${color}"/><text x="${x + width + 20}" y="${y + index * row + 23}" class="m u" font-size="15">${Number(value).toLocaleString()}</text>`).join("");
const funnelItems = [["phases considered", totals.considered, colors.blue], ["shells declared", totals.flareDeclarations + totals.chaffDeclarations, colors.amber], ["shells fired", totals.shellsFired, colors.teal], ["flare established", totals.flareEstablished, colors.coral], ["hostile shells blocked", totals.hostileBlocked, colors.teal]];
const reasonItems = Object.entries(totals.reasons).sort((a, b) => b[1] - a[1]);
const targetItems = Object.entries(totals.targets).sort((a, b) => b[1] - a[1]);
const driftItems = ["3", "4", "5"].map((key) => [`final drift ${key}`, totals.driftHistogram[key] ?? 0, key === "4" ? colors.amber : key === "5" ? colors.coral : colors.blue]);
const stageItems = Object.entries(stageScores).map(([stage, entry]) => [`Stage ${stage} score`, entry.score, stage === "C" ? colors.coral : stage === "B" ? colors.teal : colors.blue]);
const svgs = {
  "01-artillery-funnel.svg": frame("Artillery decision and resolution funnel", "What was considered, declared, fired, blocked, and established.", 620, bars(funnelItems, totals.considered)),
  "02-artillery-reasons.svg": frame("Why artillery fired or passed", "Stable rule reason codes derived only from public information.", 220 + reasonItems.length * 62, bars(reasonItems, Math.max(...reasonItems.map((row) => row[1]), 1))),
  "03-artillery-targets.svg": frame("Artillery target-basis atlas", "Every declaration and pass attributed to its preregistered targeting doctrine.", 220 + targetItems.length * 62, bars(targetItems, Math.max(...targetItems.map((row) => row[1]), 1), 520, 180, 1120, 62)),
  "04-capability-causal-ladder.svg": frame("Capability ladder and artillery contrast", `Matched Stage C - B mean score effect ${(assessment.causalContrast.mean * 100).toFixed(3)} points across ${artilleryDeltas.length.toLocaleString()} cells.`, 520, bars(stageItems, 1)),
  "05-five-drift-boundary.svg": frame("Five-drift boundary", `Survived rounds at drift 4: ${totals.driftFourSurvivals.toLocaleString()} · five-plus drift defeats: ${totals.driftFiveDefeats.toLocaleString()}`, 500, bars(driftItems, Math.max(...driftItems.map((row) => row[1]), 1)))
};
const markdown = `# Artillery-first five-drift campaign assessment\n\nAnalysis hash: \`${analysisHash}\`  \nManifest: \`${manifest.provenance.manifestHash}\`  \nReport: \`${report.reportHash}\`\n\n## Result\n\nThe complete ${report.runs.toLocaleString()}-run campaign records what artillery was considered, why it fired or passed, where it was aimed, and whether the engine fired, blocked, or established it.\n\n- Considered ${totals.considered.toLocaleString()} artillery phases; declared ${(totals.flareDeclarations + totals.chaffDeclarations).toLocaleString()} shells and fired ${totals.shellsFired.toLocaleString()}.\n- Established ${totals.flareEstablished.toLocaleString()} Flares; Chaff blocked ${totals.hostileBlocked.toLocaleString()} hostile shells.\n- Matched Stage C minus Stage B score effect: ${(assessment.causalContrast.mean * 100).toFixed(3)} percentage points (cell distribution p10 ${(assessment.causalContrast.p10 * 100).toFixed(2)}, median ${(assessment.causalContrast.median * 100).toFixed(2)}, p90 ${(assessment.causalContrast.p90 * 100).toFixed(2)}).\n- Drift 4 was survived for ${totals.driftFourSurvivals.toLocaleString()} completed rounds; ${totals.driftFiveDefeats.toLocaleString()} player outcomes crossed the five-drift defeat boundary.\n\n## Evidence boundary\n\n${assessment.evidenceBoundary.map((line) => `- ${line}`).join("\n")}\n`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`),
  writeFile(resolve(outputDir, "ASSESSMENT.md"), markdown),
  ...Object.entries(svgs).map(([name, svg]) => writeFile(resolve(outputDir, name), svg))
]);
const checksums = {};
for (const name of ["assessment.json", "ASSESSMENT.md", ...Object.keys(svgs)]) {
  checksums[name] = `sha256:${createHash("sha256").update(await readFile(resolve(outputDir, name))).digest("hex")}`;
}
await writeFile(resolve(outputDir, "checksums.json"), `${JSON.stringify({ schemaVersion: 1, files: checksums }, null, 2)}\n`);
console.log(JSON.stringify({ status: "pass", outputDir, analysisHash, charts: Object.keys(svgs).length }, null, 2));
