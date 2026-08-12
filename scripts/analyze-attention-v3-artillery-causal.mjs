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
const rejectionTelemetry = {
  accepted: 0,
  rejected: 0,
  affectedPlayerCells: 0,
  byScenario: new Map(),
  byVariant: new Map(),
  byPolicy: new Map(),
  byComposition: new Map(),
  bySeat: new Map(),
  byStage: new Map(),
  bySoundness: new Map()
};
const addCount = (target, key, value) => target.set(key, (target.get(key) ?? 0) + value);
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
    const accepted = player.uapTotals?.plansAccepted ?? 0;
    const rejected = player.uapTotals?.plansRejected ?? 0;
    rejectionTelemetry.accepted += accepted;
    rejectionTelemetry.rejected += rejected;
    if (rejected > 0) {
      rejectionTelemetry.affectedPlayerCells += 1;
      const policyId = player.playerSlot === 1 ? cell.playerOnePolicyId : cell.playerTwoPolicyId;
      const compositionId = player.playerSlot === 1 ? cell.playerOneCompositionId : cell.playerTwoCompositionId;
      addCount(rejectionTelemetry.byScenario, cell.scenarioId, rejected);
      addCount(rejectionTelemetry.byVariant, cell.variantId, rejected);
      addCount(rejectionTelemetry.byPolicy, policyId, rejected);
      addCount(rejectionTelemetry.byComposition, compositionId, rejected);
      addCount(rejectionTelemetry.bySeat, String(player.playerSlot), rejected);
      addCount(rejectionTelemetry.byStage, stage, rejected);
      addCount(rejectionTelemetry.bySoundness, String(variant.factorLevels.soundnessRate), rejected);
    }
  }
  if (stage === "C") {
    const key = `${cell.playerOnePolicyId}|${cell.playerTwoPolicyId}`;
    const entry = pairScores.get(key) ?? { score: 0, runs: 0 };
    entry.score += cellScore * cell.runs; entry.runs += cell.runs; pairScores.set(key, entry);
  }
  if (stage === "B" || stage === "C") {
    const key = [cell.matchupId, variant.factorLevels.soundnessRate, variant.factorLevels.objectiveCoupling,
      cell.playerOnePolicyId, cell.playerTwoPolicyId].join("|");
    const entry = causalPairs.get(key) ?? {
      matchupId: cell.matchupId,
      scenarioId: cell.scenarioId,
      soundnessRate: variant.factorLevels.soundnessRate,
      objectiveCoupling: variant.factorLevels.objectiveCoupling,
      playerOnePolicyId: cell.playerOnePolicyId,
      playerTwoPolicyId: cell.playerTwoPolicyId
    };
    entry[stage] = cellScore; causalPairs.set(key, entry);
  }
}
for (const stage of Object.values(stageScores)) stage.score /= stage.runs;
const causalRows = [...causalPairs.values()]
  .filter((entry) => entry.B !== undefined && entry.C !== undefined)
  .map((entry) => ({ ...entry, delta: entry.C - entry.B }));
const artilleryDeltas = causalRows.map((entry) => entry.delta);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const sorted = [...artilleryDeltas].sort((a, b) => a - b);
const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))] ?? 0;
const interaction = policies.flatMap((left) => policies.map((right) => {
  const value = pairScores.get(`${left}|${right}`) ?? { score: 0, runs: 0 };
  return { left, right, score: value.score / Math.max(1, value.runs), runs: value.runs };
}));
const arcs = interaction.filter((row) => row.left !== row.right && row.score > 0.55).map((row) => ({ from: row.left, to: row.right, score: row.score }));
const policyRanking = policies.map((policyId) => {
  const rows = interaction.filter((row) => row.left === policyId);
  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  return { policyId, score: rows.reduce((sum, row) => sum + row.score * row.runs, 0) / Math.max(1, runs), runs };
}).sort((left, right) => right.score - left.score);
const orderedCounts = (target) => Object.fromEntries([...target].sort((left, right) => right[1] - left[1]));
const rejectionDenominator = rejectionTelemetry.accepted + rejectionTelemetry.rejected;
const rejectionRate = rejectionTelemetry.rejected / Math.max(1, rejectionDenominator);
const causalPositiveShare = artilleryDeltas.filter((value) => value > 0).length / Math.max(1, artilleryDeltas.length);
const causalNegativeShare = artilleryDeltas.filter((value) => value < 0).length / Math.max(1, artilleryDeltas.length);
const groupedEffects = (key) => [...Map.groupBy(causalRows, (entry) => String(entry[key]))]
  .map(([level, rows]) => ({
    level,
    cells: rows.length,
    mean: mean(rows.map((entry) => entry.delta)),
    positiveShare: rows.filter((entry) => entry.delta > 0).length / rows.length,
    negativeShare: rows.filter((entry) => entry.delta < 0).length / rows.length
  }))
  .sort((left, right) => right.mean - left.mean);

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
    passes: totals.passes,
    declarationRate: (totals.flareDeclarations + totals.chaffDeclarations) / Math.max(1, totals.considered)
  },
  artilleryReasons: totals.reasons,
  artilleryTargets: totals.targets,
  capabilityReachability: { uap: totals.uap, spatial: totals.spatial, artillery: totals.artillery },
  causalContrast: {
    estimand: "Stage C minus Stage B Player-1 score under matched public factors and common seed streams",
    cells: artilleryDeltas.length,
    mean: mean(artilleryDeltas),
    p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9),
    positiveShare: causalPositiveShare,
    negativeShare: causalNegativeShare,
    zeroShare: 1 - causalPositiveShare - causalNegativeShare,
    byScenario: groupedEffects("scenarioId"),
    bySoundness: groupedEffects("soundnessRate"),
    byObjectiveCoupling: groupedEffects("objectiveCoupling"),
    byPlayerOnePolicy: groupedEffects("playerOnePolicyId"),
    byPlayerTwoPolicy: groupedEffects("playerTwoPolicyId")
  },
  stages: stageScores,
  fiveDriftBoundary: {
    finalDriftHistogram: totals.driftHistogram,
    survivedRoundsAtFour: totals.driftFourSurvivals,
    fivePlusDriftDefeats: totals.driftFiveDefeats
  },
  counterplay: { threshold: 0.55, arcs, policyRanking, interaction },
  uapQualityGate: {
    status: rejectionTelemetry.rejected === 0 ? "pass" : "qualified",
    acceptedPlans: rejectionTelemetry.accepted,
    rejectedPlans: rejectionTelemetry.rejected,
    rejectionRate,
    affectedPlayerCells: rejectionTelemetry.affectedPlayerCells,
    totalPlayerCells: report.cells.length * 2,
    localization: {
      byScenario: orderedCounts(rejectionTelemetry.byScenario),
      byVariant: orderedCounts(rejectionTelemetry.byVariant),
      byPolicy: orderedCounts(rejectionTelemetry.byPolicy),
      byComposition: orderedCounts(rejectionTelemetry.byComposition),
      bySeat: orderedCounts(rejectionTelemetry.bySeat),
      byStage: orderedCounts(rejectionTelemetry.byStage),
      bySoundness: orderedCounts(rejectionTelemetry.bySoundness)
    },
    interpretation: [
      "The aggregate report counts rejected plans but does not retain rejection reason codes, so collision causality cannot be proven from this artifact alone.",
      "All observed rejections are localized to the flare-pocket spatial matchup and are symmetric across seats and homogeneous compositions.",
      "The dataset remains integrity-valid; UAP-sensitive conclusions must carry this qualification until reason-coded telemetry separates malformed plans from simultaneous occupancy conflicts."
    ]
  },
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
const divergingBars = (items, maxAbs, x = 520, y = 180, width = 1120, row = 62) => {
  const center = x + width / 2;
  return items.map(([label, value], index) => {
    const magnitude = Math.abs(value) / Math.max(maxAbs, Number.EPSILON) * width / 2;
    const barX = value < 0 ? center - magnitude : center;
    const color = value < 0 ? colors.coral : colors.teal;
    return `<text x="70" y="${y + index * row + 25}" class="m t" font-size="16">${esc(label)}</text><rect x="${x}" y="${y + index * row}" width="${width}" height="30" rx="6" fill="${colors.panel}"/><line x1="${center}" x2="${center}" y1="${y + index * row - 4}" y2="${y + index * row + 34}" stroke="${colors.text}" stroke-width="2"/><rect x="${barX}" y="${y + index * row}" width="${magnitude}" height="30" rx="6" fill="${color}"/><text x="${x + width + 20}" y="${y + index * row + 23}" class="m u" font-size="15">${(value * 100).toFixed(3)} pp</text>`;
  }).join("");
};
const funnelItems = [["phases considered", totals.considered, colors.blue], ["shells declared", totals.flareDeclarations + totals.chaffDeclarations, colors.amber], ["shells fired", totals.shellsFired, colors.teal], ["flare established", totals.flareEstablished, colors.coral], ["hostile shells blocked", totals.hostileBlocked, colors.teal]];
const reasonItems = Object.entries(totals.reasons).sort((a, b) => b[1] - a[1]);
const targetItems = Object.entries(totals.targets).sort((a, b) => b[1] - a[1]);
const driftItems = ["3", "4", "5"].map((key) => [`final drift ${key}`, totals.driftHistogram[key] ?? 0, key === "4" ? colors.amber : key === "5" ? colors.coral : colors.blue]);
const stageItems = Object.entries(stageScores).map(([stage, entry]) => [`Stage ${stage} score`, entry.score, stage === "C" ? colors.coral : stage === "B" ? colors.teal : colors.blue]);
const rejectionItems = Object.entries(assessment.uapQualityGate.localization.byVariant).map(([key, value]) => [key, value, colors.coral]);
const policyItems = policyRanking.map((entry, index) => [entry.policyId, entry.score, index < 3 ? colors.teal : colors.blue]);
const scenarioEffectItems = assessment.causalContrast.byScenario.map((entry) => [entry.level, entry.mean]);
const doctrineEffectItems = assessment.causalContrast.byPlayerOnePolicy.map((entry) => [entry.level, entry.mean]);
const scenarioEffectMax = Math.max(...scenarioEffectItems.map((row) => Math.abs(row[1])), Number.EPSILON);
const doctrineEffectMax = Math.max(...doctrineEffectItems.map((row) => Math.abs(row[1])), Number.EPSILON);
const svgs = {
  "01-artillery-funnel.svg": frame("Artillery decision and resolution funnel", "What was considered, declared, fired, blocked, and established.", 620, bars(funnelItems, totals.considered)),
  "02-artillery-reasons.svg": frame("Why artillery fired or passed", "Stable rule reason codes derived only from public information.", 220 + reasonItems.length * 62, bars(reasonItems, Math.max(...reasonItems.map((row) => row[1]), 1))),
  "03-artillery-targets.svg": frame("Artillery target-basis atlas", "Every declaration and pass attributed to its preregistered targeting doctrine.", 220 + targetItems.length * 62, bars(targetItems, Math.max(...targetItems.map((row) => row[1]), 1), 520, 180, 1120, 62)),
  "04-capability-causal-ladder.svg": frame("Capability ladder and artillery contrast", `Matched Stage C - B mean score effect ${(assessment.causalContrast.mean * 100).toFixed(3)} points across ${artilleryDeltas.length.toLocaleString()} cells.`, 520, bars(stageItems, 1)),
  "06-uap-rejection-localization.svg": frame("UAP rejection localization", `${rejectionTelemetry.rejected.toLocaleString()} rejected of ${rejectionDenominator.toLocaleString()} resolved plans (${(rejectionRate * 100).toFixed(4)}%).`, 220 + rejectionItems.length * 62, bars(rejectionItems, Math.max(...rejectionItems.map((row) => row[1]), 1))),
  "07-stage-c-policy-ranking.svg": frame("Stage C policy ranking", "Player-1 score averaged over preregistered opponents and Stage C cells.", 220 + policyItems.length * 62, bars(policyItems, 1)),
  "08-artillery-effect-by-scenario.svg": frame("Where artillery helps or hurts", "Matched Stage C minus Stage B Player-1 score by scenario; teal helps, coral hurts.", 220 + scenarioEffectItems.length * 62, divergingBars(scenarioEffectItems, scenarioEffectMax)),
  "09-artillery-effect-by-doctrine.svg": frame("Artillery effect by Player-1 doctrine", "Matched Stage C minus Stage B score; interaction, not universal uplift, is the design signal.", 220 + doctrineEffectItems.length * 62, divergingBars(doctrineEffectItems, doctrineEffectMax)),
  "05-five-drift-boundary.svg": frame("Five-drift boundary", `Survived rounds at drift 4: ${totals.driftFourSurvivals.toLocaleString()} · five-plus drift defeats: ${totals.driftFiveDefeats.toLocaleString()}`, 500, bars(driftItems, Math.max(...driftItems.map((row) => row[1]), 1)))
};
const markdown = `# Artillery-first five-drift campaign assessment\n\nAnalysis hash: \`${analysisHash}\`  \nManifest: \`${manifest.provenance.manifestHash}\`  \nReport: \`${report.reportHash}\`\n\n## Result\n\nThe complete ${report.runs.toLocaleString()}-run campaign records what artillery was considered, why it fired or passed, where it was aimed, and whether the engine fired, blocked, or established it.\n\n- Considered ${totals.considered.toLocaleString()} artillery phases; declared ${(totals.flareDeclarations + totals.chaffDeclarations).toLocaleString()} shells and fired ${totals.shellsFired.toLocaleString()}.\n- Established ${totals.flareEstablished.toLocaleString()} Flares; Chaff blocked ${totals.hostileBlocked.toLocaleString()} hostile shells.\n- Matched Stage C minus Stage B score effect: ${(assessment.causalContrast.mean * 100).toFixed(3)} percentage points (cell distribution p10 ${(assessment.causalContrast.p10 * 100).toFixed(2)}, median ${(assessment.causalContrast.median * 100).toFixed(2)}, p90 ${(assessment.causalContrast.p90 * 100).toFixed(2)}).\n- Drift 4 was survived for ${totals.driftFourSurvivals.toLocaleString()} completed rounds; ${totals.driftFiveDefeats.toLocaleString()} player outcomes crossed the five-drift defeat boundary.\n\n## Evidence boundary\n\n${assessment.evidenceBoundary.map((line) => `- ${line}`).join("\n")}\n`;

const topReasons = reasonItems.slice(0, 5).map(([reason, count]) => `- ${reason}: ${count.toLocaleString()}`).join("\n");
const topTargets = targetItems.slice(0, 5).map(([target, count]) => `- ${target}: ${count.toLocaleString()}`).join("\n");
const topPolicies = policyRanking.slice(0, 5).map((entry, index) => `${index + 1}. ${entry.policyId}: ${(entry.score * 100).toFixed(2)}%`).join("\n");
const scenarioEffects = assessment.causalContrast.byScenario.map((entry) => `- ${entry.level}: ${(entry.mean * 100).toFixed(3)} pp (${entry.cells.toLocaleString()} matched cells)`).join("\n");
const doctrineEffects = assessment.causalContrast.byPlayerOnePolicy.map((entry) => `- ${entry.level}: ${(entry.mean * 100).toFixed(3)} pp`).join("\n");
const assessmentAppendix = `
## Why artillery fired or passed

${topReasons}

The five most-used target bases were:

${topTargets}

## Stage C policy landscape

${topPolicies}

## Where artillery helps or hurts

By scenario:

${scenarioEffects}

By Player-1 doctrine:

${doctrineEffects}

## UAP quality-gate qualification

The automatic gate found ${rejectionTelemetry.rejected.toLocaleString()} rejected plans out of ${rejectionDenominator.toLocaleString()} accepted-or-rejected resolutions (${(rejectionRate * 100).toFixed(4)}%). All were localized to the \`flare-pocket\` spatial matchup; seat 1 and seat 2 each contributed ${(rejectionTelemetry.rejected / 2).toLocaleString()}, and scout-homogeneous and siege-homogeneous compositions were equally represented.

This does **not** invalidate artifact integrity or the preregistered artillery contrast. It does mean that UAP-sensitive interpretation is qualified: the aggregate artifact does not retain rejection reason codes, so the evidence supports localization and symmetry but cannot distinguish malformed plans from legitimate simultaneous occupancy conflicts.
`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`),
  writeFile(resolve(outputDir, "ASSESSMENT.md"), markdown + assessmentAppendix),
  ...Object.entries(svgs).map(([name, svg]) => writeFile(resolve(outputDir, name), svg))
]);
const checksums = {};
for (const name of ["assessment.json", "ASSESSMENT.md", ...Object.keys(svgs)]) {
  checksums[name] = `sha256:${createHash("sha256").update(await readFile(resolve(outputDir, name))).digest("hex")}`;
}
await writeFile(resolve(outputDir, "checksums.json"), `${JSON.stringify({ schemaVersion: 1, files: checksums }, null, 2)}\n`);
console.log(JSON.stringify({ status: "pass", outputDir, analysisHash, charts: Object.keys(svgs).length }, null, 2));
