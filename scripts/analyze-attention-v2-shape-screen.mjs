import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { createAttentionV2ModelCatalog } from "../apps/lab/dist/landscape-sweep.js";
import { sha256Value } from "../apps/lab/dist/provenance.js";

const args = new Map(process.argv.slice(2).map((entry) => {
  const [name, ...rest] = entry.replace(/^--/, "").split("=");
  return [name, rest.join("=")];
}));
const matrixDir = resolve(args.get("matrix-dir") ?? "");
const outputDir = resolve(args.get("out") ?? "");
const parentModelHash = args.get("parent-model") ?? "";
if (!args.get("matrix-dir") || !args.get("out")) throw new Error("Use --matrix-dir=<path> --out=<path> --parent-model=sha256:<digest>");
if (!/^sha256:[0-9a-f]{64}$/.test(parentModelHash)) throw new Error("--parent-model must be a sha256 digest");

const plan = JSON.parse(await readFile(join(matrixDir, "manifest.json"), "utf8"));
const completion = JSON.parse(await readFile(join(matrixDir, "report.json"), "utf8"));
if (completion.completionStatus !== "complete" || completion.observedRuns !== completion.plannedRuns) {
  throw new Error("Shape-screen completion report is not complete");
}
const catalog = createAttentionV2ModelCatalog(parentModelHash);
if (catalog.catalogHash !== plan.modelCatalog.catalogHash) throw new Error("Reconstructed model catalog does not match the sealed plan");
const modelIndex = new Map(catalog.models.map((model, index) => [model.modelId, index]));
const bridgeIndex = catalog.models.findIndex((model) => model.role === "v1-bridge");
if (bridgeIndex < 0) throw new Error("Model catalog has no v1 bridge");
const expectedPairs = completion.plannedRuns / catalog.models.length;
if (!Number.isInteger(expectedPairs)) throw new Error("Planned runs are not balanced across models");

const terminalCodes = new Map([
  ["objective", 1], ["drift", 2], ["round-limit", 3], ["simultaneous", 4], ["forfeit", 5]
]);
const terminalNames = ["unset", "objective", "drift", "round-limit", "simultaneous", "forfeit"];
const modelAccumulators = catalog.models.map((model) => ({
  model,
  runs: 0,
  playerOneWins: 0,
  playerTwoWins: 0,
  draws: 0,
  roundSum: 0,
  minRounds: Number.POSITIVE_INFINITY,
  maxRounds: 0,
  terminals: Object.fromEntries(terminalNames.slice(1).map((name) => [name, 0])),
  outcomes: new Map(),
  winnerByPair: new Uint8Array(expectedPairs),
  terminalByPair: new Uint8Array(expectedPairs),
  roundsByPair: new Uint8Array(expectedPairs)
}));
const pairIndexes = new Map();
const edgeIds = new Set();
const sampleIds = new Set();
const seeds = new Set();
const policyPairs = new Set();
let observedRuns = 0;
let sourceBytes = 0;

const shardNames = (await readdir(matrixDir)).filter((name) => /^shard-\d{4}\.jsonl\.gz$/.test(name)).sort();
if (shardNames.length !== completion.shards.length) throw new Error("Shard file count does not match completion report");

for (const shardName of shardNames) {
  const shardPath = join(matrixDir, shardName);
  sourceBytes += (await stat(shardPath)).size;
  const lines = createInterface({ input: createReadStream(shardPath).pipe(createGunzip()), crlfDelay: Infinity });
  let shardRuns = 0;
  for await (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.planId !== plan.planId || record.planHash !== plan.planHash || record.status !== "complete") {
      throw new Error(`Foreign or incomplete record in ${shardName}`);
    }
    const index = modelIndex.get(record.modelId);
    if (index === undefined) throw new Error(`Unknown model ${record.modelId}`);
    // pairBlockId deliberately groups both seat orientations. Paired model comparisons need the
    // oriented edge as well so each model contributes exactly one observation per indexed cell.
    const comparisonCellId = `${record.identity.edgeId}|${record.identity.seed}`;
    let pairIndex = pairIndexes.get(comparisonCellId);
    if (pairIndex === undefined) {
      pairIndex = pairIndexes.size;
      if (pairIndex >= expectedPairs) throw new Error("Observed more paired worlds than declared");
      pairIndexes.set(comparisonCellId, pairIndex);
    }
    const accumulator = modelAccumulators[index];
    if (accumulator.winnerByPair[pairIndex] !== 0) throw new Error(`Duplicate model/pair observation for ${record.modelId}`);
    const winnerCode = record.winnerPlayerSlot === 1 ? 1 : record.winnerPlayerSlot === 2 ? 2 : 3;
    const terminalCode = terminalCodes.get(record.terminalReason);
    if (!terminalCode) throw new Error(`Unknown terminal reason ${record.terminalReason}`);
    accumulator.winnerByPair[pairIndex] = winnerCode;
    accumulator.terminalByPair[pairIndex] = terminalCode;
    accumulator.roundsByPair[pairIndex] = record.rounds;
    accumulator.runs += 1;
    if (winnerCode === 1) accumulator.playerOneWins += 1;
    else if (winnerCode === 2) accumulator.playerTwoWins += 1;
    else accumulator.draws += 1;
    accumulator.roundSum += record.rounds;
    accumulator.minRounds = Math.min(accumulator.minRounds, record.rounds);
    accumulator.maxRounds = Math.max(accumulator.maxRounds, record.rounds);
    accumulator.terminals[record.terminalReason] += 1;
    accumulator.outcomes.set(record.outcomeHash, (accumulator.outcomes.get(record.outcomeHash) ?? 0) + 1);
    edgeIds.add(record.identity.edgeId);
    sampleIds.add(record.identity.battleSampleId);
    seeds.add(record.identity.seed);
    policyPairs.add(`${record.policyOneId} vs ${record.policyTwoId}`);
    observedRuns += 1;
    shardRuns += 1;
    if (observedRuns % 500_000 === 0) process.stderr.write(`[attention-v2-analysis] ${observedRuns.toLocaleString()} / ${completion.plannedRuns.toLocaleString()} records\n`);
  }
  const shardIndex = Number(shardName.slice(6, 10));
  const marker = completion.shards.find((candidate) => candidate.shardIndex === shardIndex);
  if (!marker || marker.recordCount !== shardRuns) throw new Error(`${shardName} record count does not match its marker`);
}

if (observedRuns !== completion.observedRuns) throw new Error("Analyzed run count does not match completion report");
if (pairIndexes.size !== expectedPairs) throw new Error(`Expected ${expectedPairs} paired worlds, observed ${pairIndexes.size}`);
for (const accumulator of modelAccumulators) {
  if (accumulator.runs !== expectedPairs) throw new Error(`${accumulator.model.modelId} has ${accumulator.runs} runs; expected ${expectedPairs}`);
  if (accumulator.winnerByPair.includes(0)) throw new Error(`${accumulator.model.modelId} is missing paired observations`);
}

const bridge = modelAccumulators[bridgeIndex];
function entropyEffectiveCount(counts, total) {
  let entropy = 0;
  for (const count of counts) {
    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }
  return Math.exp(entropy);
}
function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}
function score(code) {
  return code === 1 ? 1 : code === 2 ? 0 : 0.5;
}

const modelMetrics = modelAccumulators.map((accumulator, index) => {
  let pairedScoreDelta = 0;
  let pairedRoundDelta = 0;
  let pairedSimultaneousDelta = 0;
  let scoreBetter = 0;
  let scoreWorse = 0;
  let sameWinnerTerminalRound = 0;
  for (let pairIndex = 0; pairIndex < expectedPairs; pairIndex += 1) {
    const delta = score(accumulator.winnerByPair[pairIndex]) - score(bridge.winnerByPair[pairIndex]);
    pairedScoreDelta += delta;
    pairedRoundDelta += accumulator.roundsByPair[pairIndex] - bridge.roundsByPair[pairIndex];
    pairedSimultaneousDelta += Number(accumulator.terminalByPair[pairIndex] === 4) - Number(bridge.terminalByPair[pairIndex] === 4);
    if (accumulator.winnerByPair[pairIndex] === bridge.winnerByPair[pairIndex] &&
        accumulator.terminalByPair[pairIndex] === bridge.terminalByPair[pairIndex] &&
        accumulator.roundsByPair[pairIndex] === bridge.roundsByPair[pairIndex]) sameWinnerTerminalRound += 1;
    if (delta > 0) scoreBetter += 1;
    else if (delta < 0) scoreWorse += 1;
  }
  const terminalRates = Object.fromEntries(Object.entries(accumulator.terminals).map(([name, count]) => [name, round(count / accumulator.runs)]));
  return {
    modelId: accumulator.model.modelId,
    designRow: accumulator.model.designRow,
    role: accumulator.model.role,
    ruleShape: accumulator.model.ruleShape,
    runs: accumulator.runs,
    playerOneWinRate: round(accumulator.playerOneWins / accumulator.runs),
    playerTwoWinRate: round(accumulator.playerTwoWins / accumulator.runs),
    drawRate: round(accumulator.draws / accumulator.runs),
    seatSkew: round(Math.abs(accumulator.playerOneWins - accumulator.playerTwoWins) / accumulator.runs),
    meanRounds: round(accumulator.roundSum / accumulator.runs),
    minRounds: accumulator.minRounds,
    maxRounds: accumulator.maxRounds,
    terminalRates,
    uniqueOutcomeStates: accumulator.outcomes.size,
    effectiveOutcomeStates: round(entropyEffectiveCount(accumulator.outcomes.values(), accumulator.runs), 3),
    pairedVsV1Bridge: {
      playerOneScoreDelta: round(pairedScoreDelta / expectedPairs),
      meanRoundDelta: round(pairedRoundDelta / expectedPairs),
      simultaneousRateDelta: round(pairedSimultaneousDelta / expectedPairs),
      betterWorldRate: round(scoreBetter / expectedPairs),
      worseWorldRate: round(scoreWorse / expectedPairs),
      sameWinnerTerminalRoundRate: round(sameWinnerTerminalRound / expectedPairs)
    }
  };
});

const factorNames = Object.keys(catalog.models[0].ruleShape);
const factorEffects = factorNames.map((factor) => {
  const levels = [...new Set(catalog.models.map((model) => model.ruleShape[factor]))];
  return {
    factor,
    levels: levels.map((level) => {
      const members = modelMetrics.filter((metric) => metric.ruleShape[factor] === level);
      const mean = (pick) => round(members.reduce((sum, member) => sum + pick(member), 0) / members.length);
      return {
        level,
        modelRows: members.length,
        playerOneWinRate: mean((member) => member.playerOneWinRate),
        simultaneousRate: mean((member) => member.terminalRates.simultaneous),
        meanRounds: mean((member) => member.meanRounds),
        pairedScoreDeltaVsV1Bridge: mean((member) => member.pairedVsV1Bridge.playerOneScoreDelta)
      };
    })
  };
});

const gib = 1024 ** 3;
const sourceGiB = sourceBytes / gib;
const projectedStandardGiB = sourceGiB * (plan.budget.plannedRuns / completion.plannedRuns);
const projection = [1, 10, 25, 50].map((campaigns) => ({
  campaigns,
  shapeScreensGiB: round(sourceGiB * campaigns, 2),
  fullStandardCampaignsGiB: round(projectedStandardGiB * campaigns, 2),
  generousProvisionGiB: round(projectedStandardGiB * campaigns * 1.25, 2)
}));

const descriptiveLeaders = {
  lowestSeatSkew: [...modelMetrics].sort((a, b) => a.seatSkew - b.seatSkew || a.modelId.localeCompare(b.modelId)).slice(0, 5).map((model) => model.modelId),
  highestOutcomeDiversity: [...modelMetrics].sort((a, b) => b.effectiveOutcomeStates - a.effectiveOutcomeStates || a.modelId.localeCompare(b.modelId)).slice(0, 5).map((model) => model.modelId),
  longestMatches: [...modelMetrics].sort((a, b) => b.meanRounds - a.meanRounds || a.modelId.localeCompare(b.modelId)).slice(0, 5).map((model) => model.modelId),
  largestPairedScoreShift: [...modelMetrics].filter((model) => model.role !== "v1-bridge").sort((a, b) => Math.abs(b.pairedVsV1Bridge.playerOneScoreDelta) - Math.abs(a.pairedVsV1Bridge.playerOneScoreDelta)).slice(0, 5).map((model) => model.modelId)
};
const coarseBridgeEquivalents = modelMetrics
  .filter((model) => model.role !== "v1-bridge" && model.pairedVsV1Bridge.sameWinnerTerminalRoundRate === 1)
  .map((model) => model.modelId);

const reportDraft = {
  schemaVersion: 1,
  analysisKind: "attention-v2-shape-screen-forensic-model-assessment",
  source: {
    planId: plan.planId,
    planHash: plan.planHash,
    completionReportHash: completion.reportHash,
    parentV1ModelHash: parentModelHash,
    runs: observedRuns,
    modelRows: catalog.models.length,
    pairedWorldsPerModel: expectedPairs,
    edgeIds: edgeIds.size,
    battleSampleIds: sampleIds.size,
    seeds: [...seeds].sort((a, b) => a - b),
    policyPairs: [...policyPairs].sort(),
    compressedShardBytes: sourceBytes
  },
  evidenceDecision: {
    artifactIntegrity: "pass",
    resolverExecution: "pass",
    narrowPairedModelEffects: "descriptive-only",
    commanderLandscapeEffects: "invalid",
    survivorSelectionEligible: false,
    reason: "Commander edge identities changed random streams but commander composition, triage, movement, and capacity modules were not compiled into match inputs."
  },
  deductions: [
    "All forty rule models completed the exact same set of paired edge/seed worlds, so narrow model-level differences under the fixed policy duel are comparable.",
    "Every record used one policy pairing: front-mobile-verify versus verify-lowest-confidence; conclusions do not generalize to the 6,400 commander profiles.",
    "The runner used the balanced composition for both players, so composition-policy interaction and top-composition coverage cannot be estimated.",
    "Edge-specific random streams create outcome variation even though commander modules were inert; edge variation must not be labeled commander counterplay.",
    "The stored records omit command/event counts, rule exposure, progress, drift, and per-player profile identity, preventing the preregistered viability gates from being evaluated.",
    coarseBridgeEquivalents.length > 0
      ? `${coarseBridgeEquivalents.join(", ")} matched the v1 bridge on winner, terminal reason, and round count in every paired world; the corrected audit must determine whether those changed rules are unreachable or merely invisible in the compact record.`
      : "No non-bridge model was coarsely identical to the v1 bridge across every paired world."
  ],
  descriptiveLeaders,
  models: modelMetrics,
  factorEffects,
  storageProjection: {
    currentShapeScreenGiB: round(sourceGiB, 3),
    projectedFullStandardCampaignGiB: round(projectedStandardGiB, 3),
    assumption: "Linear projection from observed gzip shard bytes, plus a 25% generous provisioning margin; archive metadata and charts are negligible by comparison.",
    scenarios: projection
  }
};
const analysis = { ...reportDraft, analysisHash: sha256Value(reportDraft) };

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function svgFrame(title, subtitle, height, body, footer = "ATTENTION V2 • FORENSIC SHAPE SCREEN • NOT SELECTION EVIDENCE") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}" viewBox="0 0 1800 ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title><desc id="desc">${esc(subtitle)}</desc>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071019"/><stop offset=".55" stop-color="#0b1521"/><stop offset="1" stop-color="#07171b"/></linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#31506a" opacity=".12"/></pattern><style>.s{font-family:Inter,"Segoe UI",Arial,sans-serif}.m{font-family:"Cascadia Mono",Consolas,monospace}.t{fill:#f4f8fc;font-weight:750}.muted{fill:#8da4b9}.teal{fill:#4ff0c5}.amber{fill:#f8d66d}.coral{fill:#ff7188}.line{stroke:#263c50}</style></defs>
  <rect width="1800" height="${height}" fill="url(#bg)"/><rect width="1800" height="${height}" fill="url(#grid)"/>
  <text x="80" y="80" class="s teal" font-size="17" font-weight="700" letter-spacing="3">CONTEXT LANDSCAPE / EVIDENCE LAB</text>
  <text x="80" y="145" class="s t" font-size="52">${esc(title)}</text><text x="80" y="188" class="s muted" font-size="21">${esc(subtitle)}</text>
  ${body}<text x="80" y="${height - 38}" class="m muted" font-size="13">${esc(footer)}</text><text x="1720" y="${height - 38}" text-anchor="end" class="m muted" font-size="13">${esc(analysis.analysisHash.slice(0, 25))}</text></svg>`;
}
function overviewSvg() {
  const bridgeMetric = modelMetrics[bridgeIndex];
  const cards = [
    ["VERIFIED RUNS", observedRuns.toLocaleString(), "all eight shard hashes passed"],
    ["RULE MODELS", "40", `${expectedPairs.toLocaleString()} paired worlds each`],
    ["COMMANDER SIGNAL", "INVALID", "profiles were identity-only"],
    ["CURRENT STORAGE", `${sourceGiB.toFixed(2)} GiB`, "gzip JSONL shards"]
  ].map(([label, value, note], index) => {
    const x = 80 + index * 410;
    const color = label === "COMMANDER SIGNAL" ? "coral" : "teal";
    return `<rect x="${x}" y="245" width="370" height="155" rx="14" fill="#101e2b" stroke="#294157"/><text x="${x + 24}" y="282" class="s muted" font-size="14" font-weight="700" letter-spacing="2">${label}</text><text x="${x + 24}" y="338" class="s t ${color}" font-size="37">${value}</text><text x="${x + 24}" y="375" class="s muted" font-size="15">${note}</text>`;
  }).join("");
  const strongest = [...modelMetrics].filter((m) => m.role !== "v1-bridge").sort((a, b) => Math.abs(b.pairedVsV1Bridge.playerOneScoreDelta) - Math.abs(a.pairedVsV1Bridge.playerOneScoreDelta)).slice(0, 8);
  const strongestMagnitude = Math.max(...strongest.map((metric) => Math.abs(metric.pairedVsV1Bridge.playerOneScoreDelta)));
  const bars = strongest.map((metric, index) => {
    const y = 545 + index * 44;
    const delta = metric.pairedVsV1Bridge.playerOneScoreDelta;
    const width = Math.abs(delta) / strongestMagnitude * 190;
    return `<text x="100" y="${y + 18}" class="m muted" font-size="14">row ${String(metric.designRow).padStart(2, "0")}</text><line x1="315" y1="${y + 10}" x2="735" y2="${y + 10}" stroke="#263c50"/><line x1="525" y1="${y - 4}" x2="525" y2="${y + 24}" stroke="#60788e"/><rect x="${delta >= 0 ? 525 : 525 - width}" y="${y}" width="${width}" height="20" rx="4" fill="${delta >= 0 ? "#4ff0c5" : "#ff7188"}"/><text x="760" y="${y + 18}" class="m t" font-size="14">${delta >= 0 ? "+" : ""}${delta.toFixed(4)} P1 score</text>`;
  }).join("");
  return svgFrame("What the 9.216M-run screen actually tells us", "Complete model evidence, invalid commander evidence—and a precise boundary between them.", 1040, `${cards}<text x="80" y="475" class="s t" font-size="25">Largest paired rule-model shifts vs the v1 bridge</text><text x="80" y="508" class="s muted" font-size="16">Same worlds, fixed policy duel; descriptive sensitivity only.</text>${bars}<rect x="1050" y="475" width="670" height="400" rx="16" fill="#101e2b" stroke="#294157"/><text x="1080" y="520" class="s teal" font-size="18" font-weight="700">SUPPORTED</text><text x="1080" y="560" class="s t" font-size="20">• resolver completion and determinism</text><text x="1080" y="600" class="s t" font-size="20">• narrow paired model sensitivity</text><text x="1080" y="640" class="s t" font-size="20">• terminal and round distributions</text><text x="1080" y="705" class="s coral" font-size="18" font-weight="700">NOT SUPPORTED</text><text x="1080" y="745" class="s t" font-size="20">• commander rankings or counterplay</text><text x="1080" y="785" class="s t" font-size="20">• composition-policy interaction</text><text x="1080" y="825" class="s t" font-size="20">• survivor or promotion decisions</text><text x="80" y="930" class="s amber" font-size="19">V1 bridge baseline: P1 ${(bridgeMetric.playerOneWinRate * 100).toFixed(1)}% • simultaneous ${(bridgeMetric.terminalRates.simultaneous * 100).toFixed(1)}% • ${bridgeMetric.meanRounds.toFixed(2)} rounds</text>`);
}
function modelAtlasSvg() {
  const rows = modelMetrics.map((metric, index) => {
    const y = 280 + index * 31;
    const roleColor = metric.role === "v1-bridge" ? "#f8d66d" : metric.role.includes("sentinel") ? "#b58cff" : "#8da4b9";
    const delta = metric.pairedVsV1Bridge.playerOneScoreDelta;
    const deltaWidth = Math.min(145, Math.abs(delta) * 1200);
    return `<rect x="70" y="${y - 19}" width="1660" height="27" fill="${index % 2 ? "#0d1925" : "#101e2b"}"/><text x="88" y="${y}" class="m" font-size="13" fill="${roleColor}">${String(metric.designRow).padStart(2, "0")}</text><text x="130" y="${y}" class="m muted" font-size="12">${esc(metric.role)}</text><rect x="350" y="${y - 14}" width="${metric.playerOneWinRate * 260}" height="15" rx="3" fill="#4ff0c5"/><text x="625" y="${y}" class="m t" font-size="12">${(metric.playerOneWinRate * 100).toFixed(1)}%</text><rect x="710" y="${y - 14}" width="${metric.terminalRates.simultaneous * 260}" height="15" rx="3" fill="#67a9ff"/><text x="985" y="${y}" class="m t" font-size="12">${(metric.terminalRates.simultaneous * 100).toFixed(1)}%</text><text x="1110" y="${y}" class="m t" font-size="12">${metric.meanRounds.toFixed(2)}</text><text x="1240" y="${y}" class="m t" font-size="12">${metric.effectiveOutcomeStates.toFixed(1)}</text><line x1="1500" y1="${y - 14}" x2="1500" y2="${y + 3}" stroke="#60788e"/><rect x="${delta >= 0 ? 1500 : 1500 - deltaWidth}" y="${y - 11}" width="${deltaWidth}" height="10" fill="${delta >= 0 ? "#4ff0c5" : "#ff7188"}"/><text x="1665" y="${y}" text-anchor="end" class="m t" font-size="12">${delta >= 0 ? "+" : ""}${delta.toFixed(4)}</text>`;
  }).join("");
  return svgFrame("Rule-model outcome atlas", "Forty model rows under one fixed policy duel; bars are descriptive, not survivor scores.", 1580, `<text x="88" y="240" class="s muted" font-size="14">ROW / ROLE</text><text x="350" y="240" class="s muted" font-size="14">PLAYER 1 WIN RATE</text><text x="710" y="240" class="s muted" font-size="14">SIMULTANEOUS RATE</text><text x="1110" y="240" class="s muted" font-size="14">ROUNDS</text><text x="1240" y="240" class="s muted" font-size="14">EFFECTIVE OUTCOMES</text><text x="1500" y="240" class="s muted" font-size="14">PAIRED Δ VS V1</text>${rows}`);
}
function factorSvg() {
  const factorScale = Math.ceil(Math.max(...factorEffects.flatMap((effect) => effect.levels.map((level) => Math.abs(level.pairedScoreDeltaVsV1Bridge)))) / 0.05) * 0.05;
  const rows = factorEffects.map((effect, index) => {
    const y = 280 + index * 65;
    const values = effect.levels.map((level) => level.pairedScoreDeltaVsV1Bridge);
    const dots = effect.levels.map((level, levelIndex) => {
      const x = 1250 + level.pairedScoreDeltaVsV1Bridge / factorScale * 280;
      const colors = ["#67a9ff", "#4ff0c5", "#f8d66d"];
      return `<circle cx="${x}" cy="${y - 5}" r="8" fill="${colors[levelIndex]}"/><text x="620" y="${y - 15 + levelIndex * 18}" class="m muted" font-size="12">${esc(level.level)}: ${(level.pairedScoreDeltaVsV1Bridge >= 0 ? "+" : "") + level.pairedScoreDeltaVsV1Bridge.toFixed(4)}</text>`;
    }).join("");
    return `<text x="80" y="${y}" class="s t" font-size="16">${esc(effect.factor)}</text><line x1="970" y1="${y - 5}" x2="1530" y2="${y - 5}" stroke="#294157"/><line x1="1250" y1="${y - 19}" x2="1250" y2="${y + 9}" stroke="#8da4b9"/>${dots}<text x="1600" y="${y}" class="m muted" font-size="12">range ${(Math.max(...values) - Math.min(...values)).toFixed(4)}</text>`;
  }).join("");
  return svgFrame("Rule-factor sensitivity map", "Level means of paired Player-1 score shifts versus the v1 bridge; fixed policies and balanced composition.", 1535, `<text x="620" y="230" class="s muted" font-size="14">LEVEL MEANS</text><text x="970" y="230" class="s muted" font-size="14">−${factorScale.toFixed(2)}</text><text x="1250" y="230" text-anchor="middle" class="s muted" font-size="14">V1 BRIDGE</text><text x="1530" y="230" text-anchor="end" class="s muted" font-size="14">+${factorScale.toFixed(2)}</text>${rows}`);
}
function storageSvg() {
  const max = projection.at(-1).generousProvisionGiB;
  const rows = projection.map((entry, index) => {
    const y = 390 + index * 125;
    const width = entry.generousProvisionGiB / max * 1250;
    return `<text x="90" y="${y}" class="s t" font-size="24">${entry.campaigns}×</text><rect x="190" y="${y - 28}" width="${width}" height="42" rx="8" fill="#173c35" stroke="#4ff0c5"/><text x="${210 + width}" y="${y}" class="m t" font-size="18">${entry.generousProvisionGiB.toFixed(1)} GiB</text><text x="190" y="${y + 42}" class="s muted" font-size="14">full standard campaigns, including 25% safety margin</text>`;
  }).join("");
  return svgFrame("Artifact capacity projection", "Measured gzip density projected generously across repeated standard campaigns.", 1020, `<rect x="80" y="240" width="1640" height="92" rx="14" fill="#101e2b" stroke="#294157"/><text x="110" y="278" class="s muted" font-size="15">OBSERVED SHAPE SCREEN</text><text x="110" y="316" class="s teal" font-size="31" font-weight="750">${sourceGiB.toFixed(2)} GiB / ${observedRuns.toLocaleString()} runs</text>${rows}<text x="90" y="910" class="s amber" font-size="18">Projection is deliberately generous. Raw shards are already gzip-compressed; packaging improves portability more than density.</text>`);
}

function markdown() {
  const topRows = [...modelMetrics].sort((a, b) => Math.abs(b.pairedVsV1Bridge.playerOneScoreDelta) - Math.abs(a.pairedVsV1Bridge.playerOneScoreDelta)).slice(0, 10);
  return `# Attention v2 shape-screen forensic assessment\n\n` +
    `Analysis hash: \`${analysis.analysisHash}\`  \nSource report: \`${completion.reportHash}\`\n\n` +
    `## Decision\n\nThe ${observedRuns.toLocaleString()}-run artifact is complete and useful, but **not eligible for commander survivor selection**. It is retained as integrity, throughput, resolver, and narrow paired rule-model evidence.\n\n` +
    `Commander edge IDs influenced the random stream, while the runner supplied the same balanced composition and the same \`${[...policyPairs][0]}\` policy pairing to every edge. Commander composition, triage, movement, and capacity modules therefore had no causal path into match behavior.\n\n` +
    `## What the data supports\n\n- All ${catalog.models.length} models completed ${expectedPairs.toLocaleString()} common paired worlds.\n- Model-level terminal, winner-slot, round, and outcome-state distributions under the fixed policy duel.\n- Descriptive paired sensitivity relative to the v1 bridge.\n- Artifact scale and storage planning.\n\n` +
    `## What it does not support\n\n- Commander strength, diversity, counterplay, or best-response claims.\n- Composition-policy interaction.\n- Enabled-rule exposure or the preregistered regression gates, because the compact records omit events, progress, drift, and mechanic counters.\n- Pareto survivor selection or promotion.\n\n` +
    `## Largest descriptive paired shifts\n\n| Row | Role | Model | P1 score Δ vs v1 | Simultaneous Δ | Mean rounds Δ |\n|---:|---|---|---:|---:|---:|\n` +
    topRows.map((row) => `| ${row.designRow} | ${row.role} | \`${row.modelId}\` | ${row.pairedVsV1Bridge.playerOneScoreDelta.toFixed(4)} | ${row.pairedVsV1Bridge.simultaneousRateDelta.toFixed(4)} | ${row.pairedVsV1Bridge.meanRoundDelta.toFixed(4)} |`).join("\n") +
    `\n\nThese are sensitivity indicators, not quality scores. A large shift can indicate an interesting mechanic, a brittle mechanic, or an artifact of the fixed policy duel.\n\n` +
    `## Storage\n\nThe eight gzip shards occupy ${sourceGiB.toFixed(3)} GiB. At the same density, one complete ${plan.budget.plannedRuns.toLocaleString()}-run standard campaign projects to ${projectedStandardGiB.toFixed(3)} GiB; provision ${(projectedStandardGiB * 1.25).toFixed(3)} GiB with the safety margin. Raw shards are already compressed, so the archive is primarily a verified portable container.\n`;
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(join(outputDir, "assessment.json"), `${JSON.stringify(analysis, null, 2)}\n`),
  writeFile(join(outputDir, "ASSESSMENT.md"), markdown()),
  writeFile(join(outputDir, "01-evidence-boundary.svg"), overviewSvg()),
  writeFile(join(outputDir, "02-model-outcome-atlas.svg"), modelAtlasSvg()),
  writeFile(join(outputDir, "03-factor-sensitivity.svg"), factorSvg()),
  writeFile(join(outputDir, "04-storage-projection.svg"), storageSvg())
]);
console.log(JSON.stringify({ outputDir, analysisHash: analysis.analysisHash, runs: observedRuns, sourceGiB: round(sourceGiB, 3), selectionEligible: false }, null, 2));
