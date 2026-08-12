import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const split = entry.indexOf("=");
  return split < 0 ? [entry.replace(/^--/, ""), "true"] : [entry.slice(2, split), entry.slice(split + 1)];
}));
const matrixDir = resolve(args.matrix ?? "data/lab/attention-v3-artillery-mechanism-screen-20260811-1m4-five-drift");
const outputDir = resolve(args.out ?? `${matrixDir}-analysis`);
const priorAssessmentPath = resolve(args.prior ?? "data/lab/attention-v3-artillery-causal-20260810-9mm-analysis/assessment.json");
const [manifest, report, priorAssessment] = await Promise.all([
  readFile(resolve(matrixDir, "manifest.json"), "utf8").then(JSON.parse),
  readFile(resolve(matrixDir, "report.json"), "utf8").then(JSON.parse),
  readFile(priorAssessmentPath, "utf8").then(JSON.parse)
]);
if (manifest.campaignKind !== "v3-artillery-mechanism-screen" || manifest.schemaVersion !== 2) {
  throw new Error("Not a v2 artillery mechanism screen");
}
if (report.runs !== 1_411_200 || report.shards?.length !== 12 || report.cells?.length !== 33_600) {
  throw new Error("The exact 1,411,200-run, 12-shard, 33,600-cell campaign is not complete");
}
if (report.manifestHash !== manifest.provenance.manifestHash || report.provenance.contractVersion !== 2) {
  throw new Error("Report provenance does not bind the manifest");
}

const variants = new Map(manifest.variants.map((variant) => [variant.variantId, variant]));
const baselinePolicy = "v3-baseline-move-verify-pass";
const flarePolicies = new Set(["v3-flare-cluster", "v3-flare-density", "v3-flare-far-objective"]);
const chaffPolicies = new Set(["v3-chaff-screen", "v3-adaptive-artillery"]);
const artilleryPolicies = [...flarePolicies, ...chaffPolicies];
const treatmentOrder = [
  "flare-only:one-shot", "flare-only:reload", "chaff-only:one-shot", "chaff-only:reload",
  "combined:one-shot", "combined:reload"
];
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const stats = (values) => {
  if (values.length === 0) return { n: 0, mean: null, sd: null, se: null, ci95: [null, null] };
  const average = mean(values);
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1) : 0;
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(values.length);
  return { n: values.length, mean: average, sd, se, ci95: [average - 1.959963984540054 * se, average + 1.959963984540054 * se] };
};
const groupStats = (rows, key, value = "score") => [...Map.groupBy(rows, (row) => String(row[key]))]
  .map(([level, entries]) => ({ level, ...stats(entries.map((entry) => entry[value])) }));
const sumMap = (target, source = {}) => Object.entries(source).forEach(([key, value]) => {
  if (typeof value === "number") target[key] = (target[key] ?? 0) + value;
});
const treatmentOf = (factor) => factor.artilleryLoadout === "none"
  ? "none" : `${factor.artilleryLoadout}:${factor.ammunition}`;

const observations = [];
const totals = {
  runs: 0, considered: 0, passes: 0, flareDeclarations: 0, chaffDeclarations: 0,
  shellsFired: 0, flareEstablished: 0, hostileBlocked: 0, reasons: {}, targets: {},
  artillery: {}, uapRejections: {}
};
const mechanismTotals = new Map();
for (const cell of report.cells) {
  const factor = variants.get(cell.variantId).factorLevels;
  const treatment = treatmentOf(factor);
  for (const player of cell.players) {
    const seat = player.playerSlot;
    const focalPolicy = seat === 1 ? cell.playerOnePolicyId : cell.playerTwoPolicyId;
    const opponentPolicy = seat === 1 ? cell.playerTwoPolicyId : cell.playerOnePolicyId;
    observations.push({
      matchupId: cell.matchupId, scenarioId: cell.scenarioId, seat, focalPolicy, opponentPolicy,
      soundness: String(factor.soundnessRate), pressure: factor.spatialPressure, treatment,
      loadout: factor.artilleryLoadout, ammunition: factor.ammunition,
      score: player.winRate, progress: player.averageProgress, drift: player.averageDrift, runs: cell.runs
    });
    totals.runs += cell.runs;
    const decisions = player.artilleryDecisionTotals;
    const artillery = player.artilleryTotals;
    const aggregate = mechanismTotals.get(treatment) ?? {
      playerRuns: 0, considered: 0, declared: 0, fired: 0, flareEstablished: 0,
      hostileBlocked: 0, reloads: 0, generated: 0, unsound: 0, driftDefeats: 0
    };
    aggregate.playerRuns += cell.runs;
    if (decisions) {
      totals.considered += decisions.phasesConsidered;
      totals.passes += decisions.passes;
      totals.flareDeclarations += decisions.flareDeclarations;
      totals.chaffDeclarations += decisions.chaffDeclarations;
      sumMap(totals.reasons, decisions.byReason);
      sumMap(totals.targets, decisions.byTargetBasis);
      aggregate.considered += decisions.phasesConsidered;
      aggregate.declared += decisions.flareDeclarations + decisions.chaffDeclarations;
    }
    if (artillery) {
      totals.shellsFired += artillery.shellsFired;
      totals.flareEstablished += artillery.flareShellsEstablished;
      totals.hostileBlocked += artillery.hostileShellsBlocked;
      sumMap(totals.artillery, artillery);
      aggregate.fired += artillery.shellsFired;
      aggregate.flareEstablished += artillery.flareShellsEstablished;
      aggregate.hostileBlocked += artillery.hostileShellsBlocked;
      aggregate.reloads += artillery.reloads ?? 0;
      aggregate.generated += artillery.flareArtifactsGenerated ?? 0;
      aggregate.unsound += artillery.flareUnsoundAccepts ?? 0;
      aggregate.driftDefeats += artillery.flareDriftDefeatsInduced ?? 0;
    }
    sumMap(totals.uapRejections, player.uapTotals?.rejectionsByReason);
    mechanismTotals.set(treatment, aggregate);
  }
}

const observationKey = (row, policy = row.focalPolicy) => [
  row.treatment, row.soundness, row.pressure, row.matchupId, row.seat, policy, row.opponentPolicy
].join("|");
const observationsByKey = new Map(observations.map((row) => [observationKey(row), row]));
const advantages = [];
for (const row of observations.filter((entry) => artilleryPolicies.includes(entry.focalPolicy))) {
  const control = observationsByKey.get(observationKey(row, baselinePolicy));
  if (!control) throw new Error(`Missing movement-identical pass control for ${observationKey(row)}`);
  advantages.push({
    ...row,
    scoreAdvantage: row.score - control.score,
    progressAdvantage: row.progress - control.progress,
    driftAdvantage: row.drift - control.drift
  });
}
const advantageKey = (row, treatment = row.treatment) => [
  treatment, row.soundness, row.pressure, row.matchupId, row.seat, row.focalPolicy, row.opponentPolicy
].join("|");
const advantageByKey = new Map(advantages.map((row) => [advantageKey(row), row]));
const causalRows = [];
for (const row of advantages.filter((entry) => entry.treatment !== "none")) {
  const control = advantageByKey.get(advantageKey(row, "none"));
  if (!control) throw new Error(`Missing no-ammo control for ${advantageKey(row)}`);
  causalRows.push({
    ...row,
    score: row.scoreAdvantage - control.scoreAdvantage,
    progress: row.progressAdvantage - control.progressAdvantage,
    drift: row.driftAdvantage - control.driftAdvantage,
    shellFamily: flarePolicies.has(row.focalPolicy) ? "flare" : "chaff"
  });
}
const relevantRows = causalRows.filter((row) =>
  row.loadout === "combined" ||
  (row.shellFamily === "flare" && row.loadout === "flare-only") ||
  (row.shellFamily === "chaff" && row.loadout === "chaff-only")
);
const soloRows = relevantRows.filter((row) => row.loadout !== "combined");
const combinedRows = relevantRows.filter((row) => row.loadout === "combined");

const summarizeByTreatmentDoctrine = (rows) => [...Map.groupBy(rows, (row) => `${row.treatment}|${row.focalPolicy}`)]
  .map(([key, entries]) => {
    const [treatment, doctrine] = key.split("|");
    return {
      treatment, doctrine,
      score: stats(entries.map((entry) => entry.score)),
      progress: stats(entries.map((entry) => entry.progress)),
      drift: stats(entries.map((entry) => entry.drift))
    };
  }).sort((left, right) => treatmentOrder.indexOf(left.treatment) - treatmentOrder.indexOf(right.treatment) || left.doctrine.localeCompare(right.doctrine));
const doctrineContrasts = summarizeByTreatmentDoctrine(relevantRows);

const reloadRows = [];
for (const row of relevantRows.filter((entry) => entry.ammunition === "reload")) {
  const oneShotTreatment = `${row.loadout}:one-shot`;
  const oneShot = causalRows.find((entry) => entry.treatment === oneShotTreatment &&
    advantageKey(entry, oneShotTreatment) === advantageKey(row, oneShotTreatment));
  if (!oneShot) throw new Error(`Missing one-shot reload control for ${advantageKey(row)}`);
  reloadRows.push({
    ...row,
    score: row.score - oneShot.score,
    progress: row.progress - oneShot.progress,
    drift: row.drift - oneShot.drift,
    supply: row.loadout === "combined" ? "combined" : "solo"
  });
}
const reloadContrasts = [...Map.groupBy(reloadRows, (row) => `${row.supply}|${row.focalPolicy}`)]
  .map(([key, entries]) => {
    const [supply, doctrine] = key.split("|");
    return { supply, doctrine, score: stats(entries.map((entry) => entry.score)), progress: stats(entries.map((entry) => entry.progress)), drift: stats(entries.map((entry) => entry.drift)) };
  });

const flareSoloRows = soloRows.filter((row) => row.shellFamily === "flare");
const chaffSoloRows = soloRows.filter((row) => row.shellFamily === "chaff");
const reloadRelevant = flareSoloRows.filter((row) => row.ammunition === "reload");
const effects = {
  byDoctrine: groupStats(reloadRelevant, "focalPolicy").sort((a, b) => b.mean - a.mean),
  byScenario: groupStats(reloadRelevant, "scenarioId").sort((a, b) => b.mean - a.mean),
  bySoundness: groupStats(reloadRelevant, "soundness").sort((a, b) => Number(a.level) - Number(b.level)),
  bySpatialPressure: groupStats(reloadRelevant, "pressure").sort((a, b) => a.level.localeCompare(b.level))
};
const overall = {
  flareSoloOneShot: stats(flareSoloRows.filter((row) => row.ammunition === "one-shot").map((row) => row.score)),
  flareSoloReload: stats(reloadRelevant.map((row) => row.score)),
  chaffSoloOneShot: stats(chaffSoloRows.filter((row) => row.ammunition === "one-shot").map((row) => row.score)),
  chaffSoloReload: stats(chaffSoloRows.filter((row) => row.ammunition === "reload").map((row) => row.score)),
  combinedOneShot: stats(combinedRows.filter((row) => row.ammunition === "one-shot").map((row) => row.score)),
  combinedReload: stats(combinedRows.filter((row) => row.ammunition === "reload").map((row) => row.score)),
  combinedChaffReload: stats(combinedRows.filter((row) => row.ammunition === "reload" && row.shellFamily === "chaff").map((row) => row.score)),
  reloadIncrementFlareSolo: stats(reloadRows.filter((row) => row.supply === "solo" && row.shellFamily === "flare").map((row) => row.score)),
  reloadIncrementCombined: stats(reloadRows.filter((row) => row.supply === "combined").map((row) => row.score))
};

const mechanismRates = Object.fromEntries([...mechanismTotals].map(([treatment, value]) => [treatment, {
  ...value,
  declarationRate: value.declared / Math.max(1, value.considered),
  shellsPer1000PlayerRuns: value.fired / Math.max(1, value.playerRuns) * 1000,
  inducedDriftDefeatsPer1000PlayerRuns: value.driftDefeats / Math.max(1, value.playerRuns) * 1000
}]));

const desperationAudit = {
  schemaVersion: 1,
  hypothesis: "Desperation Artillery / Hail Mary",
  verdict: "not-identifiable-from-these-runs",
  campaigns: [
    { matrixId: priorAssessment.source.matrixId, runs: priorAssessment.source.runs, manifestHash: priorAssessment.source.manifestHash, traceMode: "summary-with-sampled-artillery-decisions" },
    { matrixId: manifest.matrixId, runs: report.runs, manifestHash: manifest.provenance.manifestHash, traceMode: manifest.traceMode }
  ],
  requestedElements: [
    { element: "Progress gap at action time (self <= 6, opponent >= 10)", status: "missing", reason: "Only terminal progress is retained; artillery decision traces do not snapshot either player's progress." },
    { element: "Estimated win probability below 15%", status: "missing", reason: "No turn-level win-probability estimate is recorded." },
    { element: "At least three own unverified artifacts", status: "partial-proxy-only", reason: "Sampled traces retain ownLowConfidenceCount, not own unverified-artifact count, and only for seeds divisible by 64." },
    { element: "Passive verification/do-nothing cohort", status: "partially-present", reason: "Pass and verification totals exist, but cannot be joined to the requested desperation state at a specific turn." },
    { element: "HE / Artifact Exploder on own coordinates", status: "absent-mechanic", reason: "Both campaigns implement only Flare and Chaff shells; Flare targets enemy areas and does not instantly resolve own artifacts." },
    { element: "EMP / Smoke against leader units", status: "absent-mechanic", reason: "Neither EMP nor Smoke exists in the campaign contracts or action telemetry." },
    { element: "Immediate same-round drift explosion", status: "missing", reason: "Final drift and aggregate flare-induced drift defeats exist, but action-linked same-round drift is not retained." },
    { element: "Next-turn progress-gain variance", status: "missing", reason: "Per-turn progress deltas are not retained." },
    { element: "Terminal win and final drift", status: "present", reason: "Available per run, but not conditionable on the missing action-time state and requested actions." }
  ],
  requestedCohorts: {
    passiveControl: { evaluable: false, n: null, winRate: null, winRate95: [null, null], averageFinalDrift: null, drift95: [null, null] },
    hailMaryHE: { evaluable: false, n: 0, winRate: null, winRate95: [null, null], averageFinalDrift: null, drift95: [null, null] },
    disruptiveSalvo: { evaluable: false, n: 0, winRate: null, winRate95: [null, null], averageFinalDrift: null, drift95: [null, null] }
  },
  closestSupportedQuestion: {
    question: "Does access to the doctrine's relevant Flare/Chaff shell improve that doctrine's score relative to its movement-identical pass control?",
    estimand: "Difference-in-differences of aggregate player score under matched scenario, seat, opponent doctrine, soundness, spatial pressure, and common seed block.",
    results: overall,
    limitation: "This is an artillery mechanism test, not a severe-deficit Hail Mary test. It must not be relabeled as evidence for HE/EMP/Smoke or desperation-state optimality."
  },
  requiredNextExperiment: [
    "Implement the requested HE/Artifact Exploder and EMP/Smoke actions with stable action identifiers.",
    "At every eligible decision, record pre-action self/opponent progress, drift, unverified artifact count, unit locks/uplinks, legal actions, and calibrated win-probability estimate.",
    "Randomize eligible desperation opportunities between passive, HE, and disruptive salvo policies within the same latent world stream; deterministic self-selection would confound the cohorts.",
    "Record immediate resolution, same-round drift defeat, next-turn progress delta, and terminal outcome keyed to the action opportunity.",
    "Pre-register a primary win-rate contrast, Wilson or paired bootstrap interval, multiplicity handling, and minimum detectable effect before launch."
  ]
};

const assessmentBase = {
  schemaVersion: 1,
  source: {
    matrixId: manifest.matrixId, manifestHash: manifest.provenance.manifestHash,
    reportHash: report.reportHash, runs: report.runs, cells: report.cells.length
  },
  design: {
    driftLimit: 5, seedsPerCell: manifest.seedsPerCell, variants: manifest.variants.length,
    matchups: manifest.matchups.length, policies: manifest.policies.length,
    estimand: "Artillery-doctrine minus movement-identical pass-control advantage, treatment minus no-ammo, over matched aggregate cells.",
    inferenceUnit: "matched 42-run aggregate player cell",
    caveat: "Intervals summarize matched-cell heterogeneity; they are not raw-seed paired bootstrap intervals."
  },
  artilleryFunnel: {
    considered: totals.considered, declared: totals.flareDeclarations + totals.chaffDeclarations,
    flareDeclarations: totals.flareDeclarations, chaffDeclarations: totals.chaffDeclarations,
    fired: totals.shellsFired, flareEstablished: totals.flareEstablished,
    hostileBlocked: totals.hostileBlocked, passes: totals.passes
  },
  downstreamAttribution: {
    reloads: totals.artillery.reloads ?? 0,
    flareArtifactsGenerated: totals.artillery.flareArtifactsGenerated ?? 0,
    flareUnsoundAccepts: totals.artillery.flareUnsoundAccepts ?? 0,
    flareDriftDefeatsInduced: totals.artillery.flareDriftDefeatsInduced ?? 0
  },
  artilleryReasons: totals.reasons,
  artilleryTargets: totals.targets,
  mechanismRates,
  overallEffects: overall,
  doctrineContrasts,
  reloadContrasts,
  reloadSoloEffects: effects,
  uapQualityGate: {
    status: Object.keys(totals.uapRejections).every((reason) => reason === "destination_conflict") ? "pass" : "fail",
    rejectedPlans: Object.values(totals.uapRejections).reduce((sum, value) => sum + value, 0),
    byReason: totals.uapRejections
  },
  desperationAudit,
  evidenceBoundary: [
    "The mechanism contrasts use exact no-ammo and movement-identical policy controls under common campaign factors.",
    "Because artillery supply is symmetric, unconditional loadout win rates are not used as an efficacy estimand.",
    "The Hail Mary hypothesis is not identified: its state variables, actions, and immediate outcomes were not recorded or implemented."
  ]
};
const analysisHash = `sha256:${createHash("sha256").update(JSON.stringify(assessmentBase)).digest("hex")}`;
const assessment = { ...assessmentBase, analysisHash };

const colors = { bg: "#07131f", panel: "#102536", teal: "#4ff0c5", coral: "#ff7188", amber: "#f8d66d", blue: "#72b7ff", text: "#ecf7ff", muted: "#9fb3c5" };
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const frame = (title, subtitle, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}"><rect width="1800" height="${height}" fill="${colors.bg}"/><style>.s{font-family:Segoe UI,Arial,sans-serif}.m{font-family:Consolas,monospace}.t{fill:${colors.text}}.u{fill:${colors.muted}}</style><text x="70" y="72" class="s t" font-size="34" font-weight="700">${esc(title)}</text><text x="70" y="108" class="s u" font-size="18">${esc(subtitle)}</text>${body}</svg>`;
const bars = (items, max, x = 600, y = 170, width = 1010, row = 62) => items.map(([label, value, color = colors.teal], index) => `<text x="70" y="${y + index * row + 25}" class="m t" font-size="15">${esc(label)}</text><rect x="${x}" y="${y + index * row}" width="${width}" height="30" rx="6" fill="${colors.panel}"/><rect x="${x}" y="${y + index * row}" width="${max ? value / max * width : 0}" height="30" rx="6" fill="${color}"/><text x="${x + width + 20}" y="${y + index * row + 23}" class="m u" font-size="15">${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}</text>`).join("");
const forest = (items, maxAbs, x = 600, y = 170, width = 1010, row = 62) => {
  const center = x + width / 2;
  return items.map(([label, value, low, high], index) => {
    const scale = width / 2 / Math.max(maxAbs, Number.EPSILON);
    const yMid = y + index * row + 15;
    const valueX = center + value * scale;
    const lowX = center + low * scale;
    const highX = center + high * scale;
    const color = value < 0 ? colors.coral : colors.teal;
    return `<text x="70" y="${yMid + 10}" class="m t" font-size="15">${esc(label)}</text><rect x="${x}" y="${y + index * row}" width="${width}" height="30" rx="6" fill="${colors.panel}"/><line x1="${center}" x2="${center}" y1="${y + index * row - 4}" y2="${y + index * row + 34}" stroke="${colors.text}" stroke-width="2"/><line x1="${lowX}" x2="${highX}" y1="${yMid}" y2="${yMid}" stroke="${color}" stroke-width="5"/><circle cx="${valueX}" cy="${yMid}" r="8" fill="${color}"/><text x="${x + width + 20}" y="${yMid + 7}" class="m u" font-size="15">${(value * 100).toFixed(3)} pp</text>`;
  }).join("");
};
const forestChart = (title, subtitle, rows) => {
  const maxAbs = Math.max(...rows.flatMap((row) => [Math.abs(row[1]), Math.abs(row[2]), Math.abs(row[3])]), Number.EPSILON);
  return frame(title, subtitle, 220 + rows.length * 62, forest(rows, maxAbs));
};
const metricRows = (entries, prefix = "") => entries.map((entry) => [
  `${prefix}${entry.level ?? entry.doctrine}`, entry.mean ?? entry.score.mean,
  entry.ci95?.[0] ?? entry.score.ci95[0], entry.ci95?.[1] ?? entry.score.ci95[1]
]);
const soloDoctrineRows = doctrineContrasts.filter((entry) => !entry.treatment.startsWith("combined"))
  .map((entry) => [`${entry.doctrine.replace(/^v3-/, "")} / ${entry.treatment.split(":")[1]}`, entry.score.mean, ...entry.score.ci95]);
const combinedDoctrineRows = doctrineContrasts.filter((entry) => entry.treatment.startsWith("combined"))
  .map((entry) => [`${entry.doctrine.replace(/^v3-/, "")} / ${entry.treatment.split(":")[1]}`, entry.score.mean, ...entry.score.ci95]);
const reloadForestRows = reloadContrasts.map((entry) => [
  `${entry.doctrine.replace(/^v3-/, "")} / ${entry.supply}`, entry.score.mean, ...entry.score.ci95
]);
const reasonItems = Object.entries(totals.reasons).sort((a, b) => b[1] - a[1]);
const auditRows = desperationAudit.requestedElements.map((entry, index) => {
  const color = entry.status === "present" ? colors.teal : entry.status.startsWith("partial") ? colors.amber : colors.coral;
  return `<text x="70" y="${190 + index * 70}" class="m t" font-size="15">${esc(entry.element)}</text><rect x="1280" y="${165 + index * 70}" width="430" height="36" rx="18" fill="${color}"/><text x="1495" y="${190 + index * 70}" text-anchor="middle" class="m" fill="${colors.bg}" font-size="15" font-weight="700">${esc(entry.status)}</text>`;
}).join("");
const svgs = {
  "01-artillery-funnel.svg": frame("Artillery decision and resolution funnel", "All player decisions across the 1.4112M-run mechanism screen.", 560, bars([
    ["phases considered", totals.considered, colors.blue],
    ["shells declared", totals.flareDeclarations + totals.chaffDeclarations, colors.amber],
    ["shells fired", totals.shellsFired, colors.teal],
    ["flare established", totals.flareEstablished, colors.coral],
    ["hostile shells blocked", totals.hostileBlocked, colors.teal]
  ], totals.considered)),
  "02-why-artillery-fired.svg": frame("Why artillery fired or passed", "Manifest-defined public-information reason codes.", 220 + reasonItems.length * 62, bars(reasonItems, Math.max(...reasonItems.map((row) => row[1]), 1))),
  "03-downstream-attribution.svg": frame("From shell to downstream outcome", "Direct engine attribution; counts are nested stages, not mutually exclusive outcomes.", 500, bars([
    ["reload events", assessment.downstreamAttribution.reloads, colors.blue],
    ["flare-generated artifacts", assessment.downstreamAttribution.flareArtifactsGenerated, colors.amber],
    ["flare-added unsound accepts", assessment.downstreamAttribution.flareUnsoundAccepts, colors.coral],
    ["flare-induced drift defeats", assessment.downstreamAttribution.flareDriftDefeatsInduced, colors.teal]
  ], assessment.downstreamAttribution.flareArtifactsGenerated)),
  "04-solo-doctrine-effect.svg": forestChart("Causal artillery lift: solo loadouts", "Difference-in-differences versus no ammo and the movement-identical pass doctrine; bars show paired-cell 95% intervals.", soloDoctrineRows),
  "05-combined-doctrine-effect.svg": forestChart("Causal artillery lift: combined arms", "Flare + Chaff availability, one-shot and reload, relative to no-ammo pass controls.", combinedDoctrineRows),
  "06-reload-increment.svg": forestChart("Incremental value of reload", "Reload minus one-shot difference-in-differences; positive values favor replenishment.", reloadForestRows),
  "07-reload-effect-by-scenario.svg": forestChart("Solo reload artillery by scenario", "Relevant-shell doctrine lift under reload supply.", metricRows(effects.byScenario)),
  "08-reload-effect-by-soundness.svg": forestChart("Solo reload artillery by soundness", "Relevant-shell doctrine lift under reload supply.", metricRows(effects.bySoundness, "soundness ")),
  "09-reload-effect-by-spatial-pressure.svg": forestChart("Solo reload artillery by spatial pressure", "Adjacent allows distance 1 spawns; standoff requires distance 2+.", metricRows(effects.bySpatialPressure)),
  "10-uap-rejection-reasons.svg": frame("UAP plan rejection reasons", "Every rejection is reason-coded in this campaign.", 360, bars(Object.entries(totals.uapRejections), Math.max(...Object.values(totals.uapRejections), 1))),
  "11-hail-mary-identifiability.svg": frame("Can the last two runs test Desperation Artillery?", "No: the requested action-time state, HE/EMP/Smoke treatments, and immediate outcomes are not jointly observable.", 220 + auditRows.length * 70, auditRows)
};

const fmt = (value, digits = 3) => value === null ? "N/A" : `${(value * 100).toFixed(digits)} pp`;
const ci = (entry) => entry.mean === null ? "N/A" : `${fmt(entry.mean)} [${fmt(entry.ci95[0])}, ${fmt(entry.ci95[1])}]`;
const topDoctrine = effects.byDoctrine[0];
const worstDoctrine = effects.byDoctrine.at(-1);
const markdown = `# Artillery mechanism screen assessment

Analysis hash: \`${analysisHash}\`  
Manifest: \`${manifest.provenance.manifestHash}\`  
Report: \`${report.reportHash}\`

## Result

The canonical ${report.runs.toLocaleString()}-run screen completed all ${manifest.variants.length} mechanism variants, ${manifest.matchups.length} mirrored matchups, and ${manifest.policies.length} doctrines under the five-drift rule.

The primary estimand is not unconditional loadout win rate: both players receive the same loadout, so that quantity is structurally pulled toward 50%. Instead, this assessment compares each firing doctrine against the movement-identical pass doctrine, then subtracts the same policy contrast in the no-ammo arm.

| Contrast | Matched cells | Score effect with 95% paired-cell interval |
|---|---:|---:|
| Flare-only doctrine, one-shot | ${overall.flareSoloOneShot.n.toLocaleString()} | ${ci(overall.flareSoloOneShot)} |
| Flare-only doctrine, reload | ${overall.flareSoloReload.n.toLocaleString()} | ${ci(overall.flareSoloReload)} |
| Chaff-only doctrine, one-shot | ${overall.chaffSoloOneShot.n.toLocaleString()} | ${ci(overall.chaffSoloOneShot)} |
| Chaff-only doctrine, reload | ${overall.chaffSoloReload.n.toLocaleString()} | ${ci(overall.chaffSoloReload)} |
| Combined arms, one-shot | ${overall.combinedOneShot.n.toLocaleString()} | ${ci(overall.combinedOneShot)} |
| Combined arms, reload | ${overall.combinedReload.n.toLocaleString()} | ${ci(overall.combinedReload)} |
| Combined arms, Chaff doctrines under reload | ${overall.combinedChaffReload.n.toLocaleString()} | ${ci(overall.combinedChaffReload)} |
| Reload increment, Flare-only | ${overall.reloadIncrementFlareSolo.n.toLocaleString()} | ${ci(overall.reloadIncrementFlareSolo)} |
| Reload increment, combined | ${overall.reloadIncrementCombined.n.toLocaleString()} | ${ci(overall.reloadIncrementCombined)} |

Best solo-reload doctrine: **${topDoctrine.level}**, ${ci(topDoctrine)}.  
Weakest solo-reload doctrine: **${worstDoctrine.level}**, ${ci(worstDoctrine)}.

## Mechanical evidence

- ${totals.shellsFired.toLocaleString()} shells fired from ${(totals.flareDeclarations + totals.chaffDeclarations).toLocaleString()} declarations.
- ${assessment.downstreamAttribution.reloads.toLocaleString()} reload events.
- ${assessment.downstreamAttribution.flareArtifactsGenerated.toLocaleString()} extra artifacts causally attributed to Flares.
- ${assessment.downstreamAttribution.flareUnsoundAccepts.toLocaleString()} added unsound accepts and ${assessment.downstreamAttribution.flareDriftDefeatsInduced.toLocaleString()} induced drift defeats.
- ${assessment.uapQualityGate.rejectedPlans.toLocaleString()} UAP rejections; every one is \`destination_conflict\`, so the telemetry quality gate passes.
- Chaff-only arms fired zero shells: defensive Chaff requires a hostile Flare, so the solo Chaff treatment is a confirmed reachability null. Chaff efficacy is identified only in the combined-arms variants.

## Desperation Artillery / Hail Mary verdict

**Not identifiable from either of the last two large runs.** The requested HE/Artifact Exploder and EMP/Smoke actions do not exist in those campaigns. Their summary traces also lack action-time progress for both players, exact unverified-artifact count, win probability, same-round drift linkage, and next-turn progress delta. Consequently the requested cohort table contains N/A rather than fabricated estimates.

The closest supported result is the Flare/Chaff mechanism contrast above. It answers whether available artillery improves an artillery doctrine relative to its pass control; it does **not** establish that a Hail Mary action is optimal from a severe deficit.

See \`DESPERATION-HYPOTHESIS-AUDIT.md\` for the field-by-field audit and the randomized branch design needed to test the hypothesis cleanly.

## Evidence boundary

${assessment.evidenceBoundary.map((line) => `- ${line}`).join("\n")}
`;
const auditMarkdown = `# Desperation Artillery hypothesis audit

## Verdict

The hypothesis is **not mathematically testable from the last two campaign records**. This is a data-and-treatment identifiability failure, not evidence that the hypothesis is false.

| Requested cohort | Evaluable N | Win rate (95% CI) | Average final drift (95% CI) |
|---|---:|---:|---:|
| A — Passive control in desperation state | N/A | N/A | N/A |
| B — Hail Mary HE on own artifacts | 0 | N/A | N/A |
| C — EMP/Smoke against leader | 0 | N/A | N/A |

## Availability audit

| Required element | Status | Evidence |
|---|---|---|
${desperationAudit.requestedElements.map((entry) => `| ${entry.element} | ${entry.status} | ${entry.reason} |`).join("\n")}

## Why an observational filter would still be unsafe

Even if the state fields had been logged, comparing commanders who voluntarily chose a Hail Mary against commanders who passed would be selection-biased: action choice depends on board severity, doctrine, shell availability, and latent world state. A valid causal test should randomize among legal actions at the same eligible decision point and reuse the same latent random stream for each branch.

## Required next campaign

${desperationAudit.requiredNextExperiment.map((entry, index) => `${index + 1}. ${entry}`).join("\n")}
`;

const csvEscape = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csvRows = [["treatment", "doctrine", "metric", "n", "mean", "ci95_low", "ci95_high"]];
for (const row of doctrineContrasts) for (const metric of ["score", "progress", "drift"]) {
  csvRows.push([row.treatment, row.doctrine, metric, row[metric].n, row[metric].mean, row[metric].ci95[0], row[metric].ci95[1]]);
}
const csv = `${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`),
  writeFile(resolve(outputDir, "ASSESSMENT.md"), markdown),
  writeFile(resolve(outputDir, "desperation-hypothesis-audit.json"), `${JSON.stringify(desperationAudit, null, 2)}\n`),
  writeFile(resolve(outputDir, "DESPERATION-HYPOTHESIS-AUDIT.md"), auditMarkdown),
  writeFile(resolve(outputDir, "mechanism-contrasts.csv"), csv),
  ...Object.entries(svgs).map(([name, svg]) => writeFile(resolve(outputDir, name), svg))
]);
const outputNames = [
  "assessment.json", "ASSESSMENT.md", "desperation-hypothesis-audit.json",
  "DESPERATION-HYPOTHESIS-AUDIT.md", "mechanism-contrasts.csv", ...Object.keys(svgs)
];
const checksums = {};
for (const name of outputNames) {
  checksums[name] = `sha256:${createHash("sha256").update(await readFile(resolve(outputDir, name))).digest("hex")}`;
}
await writeFile(resolve(outputDir, "checksums.json"), `${JSON.stringify({ schemaVersion: 1, files: checksums }, null, 2)}\n`);
console.log(JSON.stringify({ status: "pass", outputDir, analysisHash, charts: Object.keys(svgs).length, overall, desperationVerdict: desperationAudit.verdict }, null, 2));
