import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ATTENTION_V3_SPATIAL_RESOLVER_VERSION,
  attentionCompositions,
  createAttentionMatch,
  createAttentionV3SpatialModel,
  defaultAttentionModel,
  defaultAttentionScenario,
  defaultAttentionV3Spatial,
  defaultAttentionV3Uap,
  runAttentionMatch
} from "../packages/engine/dist/index.js";

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-b-spatial-probe");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-b-spatial-world-v1";

const contrasts = [
  { id: "artifact-chase-vs-hold", treatment: "chase", control: "hold", gateMetric: "movementDistance", direction: 1 },
  { id: "line-support-vs-hold", treatment: "support", control: "hold", gateMetric: "supportScans", direction: 1 },
  { id: "range-compress-vs-default", treatment: "compress", control: "hold", gateMetric: "meanArtifactDistance", direction: -1 },
  { id: "range-expand-vs-default", treatment: "expand", control: "hold", gateMetric: "meanArtifactDistance", direction: 1 }
];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.70 },
  { id: "global-sound-55", objectiveCoupling: "global", soundnessRate: 0.55 },
  { id: "distance-sound-55", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.55 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.80 }
];

const commandModes = ["accept-all", "confidence-threshold", "local-verify"];
const seeds = Array.from({ length: 48 }, (_, index) => 72_000 + index);
const orientations = ["focal-alpha", "focal-bravo"];
const arms = ["treatment", "control"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-b-spatial-differential-probe",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_SPATIAL_RESOLVER_VERSION,
  contrasts,
  pressureSamples,
  commandModes,
  seeds,
  orientations,
  arms,
  composition: "balanced",
  baseModelHash: digest(defaultAttentionModel),
  uapModelHash: digest(defaultAttentionV3Uap),
  spatialModelHash: digest(defaultAttentionV3Spatial),
  scenarioHash: digest(defaultAttentionScenario),
  compositionHash: digest(attentionCompositions.balanced),
  worldStreamNamespace: WORLD_STREAM_NAMESPACE,
  capacityPolicy: "pass",
  artillery: "disabled"
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-b-${planHash.slice(7, 23)}`;

function runtimeContext(pressure) {
  const base = {
    ...defaultAttentionModel,
    rules: {
      ...defaultAttentionModel.rules,
      objectiveTarget: 30,
      driftLimit: 6,
      soundnessRate: pressure.soundnessRate
    },
    extensions: {
      objectiveCoupling: pressure.objectiveCoupling,
      stationaryQualification: "resolved-zero",
      capacityTopology: "shared-exclusive",
      abilityUnlockBasis: "personal-claim-count",
      abilityPackage: "complete",
      unresolvedDisposition: "auto-accept"
    }
  };
  return { model: createAttentionV3SpatialModel(base), scenario: defaultAttentionScenario };
}

const runtimeContexts = Object.fromEntries(pressureSamples.map((pressure) => [pressure.id, runtimeContext(pressure)]));

function separation(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function coordinateKey(coordinate) {
  return `${coordinate.x},${coordinate.y}`;
}

function chaseAction(projection, playerId) {
  const scout = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "scout");
  if (!scout) return null;
  const targets = projection.artifacts
    .filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending" && separation(scout.position, artifact.position) > 1)
    .sort((left, right) => separation(scout.position, left.position) - separation(scout.position, right.position) || left.artifactId.localeCompare(right.artifactId));
  if (targets.length === 0) return null;
  const occupied = new Set(projection.units.map((unit) => coordinateKey(unit.position)));
  const candidates = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const destination = { x: scout.position.x + dx, y: scout.position.y + dy };
      if (destination.x < 0 || destination.x >= 10 || destination.y < 0 || destination.y >= 10) continue;
      if (occupied.has(coordinateKey(destination))) continue;
      candidates.push(destination);
    }
  }
  candidates.sort((left, right) =>
    separation(left, targets[0].position) - separation(right, targets[0].position) ||
    left.x - right.x || left.y - right.y
  );
  const destination = candidates.find((candidate) => separation(candidate, targets[0].position) < separation(scout.position, targets[0].position));
  return destination ? { kind: "move", destination } : null;
}

function supportAction(projection, playerId) {
  const line = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "line");
  if (!line?.spatial) return null;
  const friendly = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const target = projection.artifacts
    .filter((artifact) =>
      artifact.ownerPlayerId === playerId && artifact.resolution === "pending" &&
      separation(line.position, artifact.position) <= line.spatial.activeRange &&
      !friendly.some((unit) => separation(unit.position, artifact.position) <= 1)
    )
    .sort((left, right) =>
      left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId)
    )[0];
  return target ? { kind: "support-scan", artifactId: target.artifactId } : null;
}

function movementDecisions(projection, playerId, mode) {
  const decisions = [];
  if ((mode === "compress" || mode === "expand") && projection.round === 1) {
    const delta = mode === "compress" ? -1 : 1;
    for (const unit of projection.units.filter((candidate) => candidate.ownerPlayerId === playerId)) {
      decisions.push({
        kind: "unit-actions",
        playerId,
        unitId: unit.unitId,
        actions: [{ kind: "range-shift", delta }]
      });
    }
    return decisions;
  }
  if (mode === "chase") {
    const scout = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "scout");
    const action = chaseAction(projection, playerId);
    if (scout && action) decisions.push({ kind: "unit-actions", playerId, unitId: scout.unitId, actions: [action] });
  } else if (mode === "support") {
    const line = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "line");
    const action = supportAction(projection, playerId);
    if (line && action) decisions.push({ kind: "unit-actions", playerId, unitId: line.unitId, actions: [action] });
  }
  return decisions;
}

function commandDecision(projection, playerId, mode) {
  const pending = projection.artifacts
    .filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending")
    .sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId));
  if (pending.length === 0) return { kind: "end-command", playerId };
  const revealedUnsound = pending.find((artifact) => artifact.revealedSound === false);
  if (revealedUnsound) return { kind: "reject", playerId, artifactId: revealedUnsound.artifactId };
  const revealedSound = pending.find((artifact) => artifact.revealedSound === true);
  if (revealedSound) return { kind: "accept", playerId, artifactId: revealedSound.artifactId };
  if (mode === "accept-all") return { kind: "accept", playerId, artifactId: pending[0].artifactId };
  if (mode === "confidence-threshold") {
    return pending[0].reportedConfidence < 0.5
      ? { kind: "reject", playerId, artifactId: pending[0].artifactId }
      : { kind: "accept", playerId, artifactId: pending[0].artifactId };
  }
  const player = projection.players.find((candidate) => candidate.playerId === playerId);
  const units = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const reachable = pending.find((artifact) =>
    (artifact.supportScanUnitIds?.length ?? 0) > 0 ||
    units.some((unit) => separation(unit.position, artifact.position) <= 1)
  );
  if (reachable && player.attention >= 1) return { kind: "verify", playerId, artifactId: reachable.artifactId };
  return { kind: "end-command", playerId };
}

function controller(playerId, movementMode, commandMode) {
  return {
    movement: (projection) => movementDecisions(projection, playerId, movementMode),
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function runArm({ contrast, pressure, commandMode, seed, orientation, arm }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const opponentPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const policy = arm === "treatment" ? contrast.treatment : contrast.control;
  const streamId = `${WORLD_STREAM_NAMESPACE}:${contrast.id}:${pressure.id}:${commandMode}:${seed}:${orientation}`;
  const match = createAttentionMatch({
    matchId: `${planId}:${contrast.id}:${pressure.id}:${commandMode}:${seed}:${orientation}:${arm}`,
    seed,
    randomStreamId: streamId,
    context: runtimeContexts[pressure.id],
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
  const result = runAttentionMatch(match, {
    [focalPlayerId]: controller(focalPlayerId, policy, commandMode),
    [opponentPlayerId]: controller(opponentPlayerId, "hold", commandMode)
  }, { traceMode: "hash" });
  return { result, focalPlayerId, opponentPlayerId, streamId };
}

function scoreFor(result, playerId) {
  if (result.match.state.winnerPlayerId === null) return 0.5;
  return result.match.state.winnerPlayerId === playerId ? 1 : 0;
}

const metricNames = [
  "score",
  "progress",
  "drift",
  "movementDistance",
  "rangeShifts",
  "supportScans",
  "localVerifications",
  "supportScanVerifications",
  "outOfRangeVerificationRejections",
  "autoAcceptedBeyondReach",
  "artifactsSpawned",
  "meanArtifactDistance"
];

function metrics(result, playerId) {
  const player = result.match.state.players.find((candidate) => candidate.playerId === playerId);
  const core = result.summary.players[playerId];
  const spatial = result.summary.spatial[playerId];
  return {
    score: scoreFor(result, playerId),
    progress: player.progress,
    drift: player.drift,
    movementDistance: core.movementDistance,
    rangeShifts: spatial.rangeShifts,
    supportScans: spatial.supportScans,
    localVerifications: spatial.localVerifications,
    supportScanVerifications: spatial.supportScanVerifications,
    outOfRangeVerificationRejections: spatial.outOfRangeVerificationRejections,
    autoAcceptedBeyondReach: spatial.autoAcceptedBeyondReach,
    artifactsSpawned: spatial.artifactsSpawned,
    meanArtifactDistance: spatial.artifactsSpawned > 0 ? spatial.artifactDistanceTotal / spatial.artifactsSpawned : 0
  };
}

function emptyCell(contrast, pressure, commandMode) {
  return {
    contrast: contrast.id,
    pressure: pressure.id,
    commandMode,
    pairs: 0,
    treatment: Object.fromEntries(metricNames.map((name) => [name, 0])),
    control: Object.fromEntries(metricNames.map((name) => [name, 0])),
    delta: Object.fromEntries(metricNames.map((name) => [name, 0])),
    seatDelta: { alpha: 0, bravo: 0 },
    seatPairs: { alpha: 0, bravo: 0 }
  };
}

function addMetrics(target, source) {
  for (const name of metricNames) target[name] += source[name];
}

function finalizeMetricSums(sums, divisor) {
  return Object.fromEntries(metricNames.map((name) => [name, sums[name] / divisor]));
}

const cellsByKey = new Map();
let observedPairs = 0;
let observedRuns = 0;
let determinismSentinels = 0;
let determinismFailures = 0;
let planRejections = 0;
let artillerySummaryLeaks = 0;

for (const contrast of contrasts) {
  for (const pressure of pressureSamples) {
    for (const commandMode of commandModes) {
      const cell = emptyCell(contrast, pressure, commandMode);
      cellsByKey.set(`${contrast.id}|${pressure.id}|${commandMode}`, cell);
      for (const seed of seeds) {
        for (const orientation of orientations) {
          const treatmentRun = runArm({ contrast, pressure, commandMode, seed, orientation, arm: "treatment" });
          const controlRun = runArm({ contrast, pressure, commandMode, seed, orientation, arm: "control" });
          if (treatmentRun.streamId !== controlRun.streamId) throw new Error("Paired arms lost their common stream");
          const treatmentMetrics = metrics(treatmentRun.result, treatmentRun.focalPlayerId);
          const controlMetrics = metrics(controlRun.result, controlRun.focalPlayerId);
          addMetrics(cell.treatment, treatmentMetrics);
          addMetrics(cell.control, controlMetrics);
          for (const name of metricNames) cell.delta[name] += treatmentMetrics[name] - controlMetrics[name];
          const seat = treatmentRun.focalPlayerId;
          cell.seatDelta[seat] += treatmentMetrics.score - controlMetrics.score;
          cell.seatPairs[seat] += 1;
          cell.pairs += 1;
          observedPairs += 1;
          observedRuns += 2;
          for (const run of [treatmentRun.result, controlRun.result]) {
            planRejections += Object.values(run.summary.uap).reduce((sum, counters) => sum + counters.plansRejected, 0);
            if (run.summary.artillery) artillerySummaryLeaks += 1;
          }

          if (seed === seeds[0] && orientation === orientations[0]) {
            for (const arm of arms) {
              const original = arm === "treatment" ? treatmentRun.result : controlRun.result;
              const replay = runArm({ contrast, pressure, commandMode, seed, orientation, arm }).result;
              determinismSentinels += 1;
              if (replay.traceHash !== original.traceHash || JSON.stringify(replay.match.state) !== JSON.stringify(original.match.state)) {
                determinismFailures += 1;
              }
            }
          }
        }
      }
    }
  }
}

const cells = [...cellsByKey.values()].map((cell) => ({
  contrast: cell.contrast,
  pressure: cell.pressure,
  commandMode: cell.commandMode,
  pairs: cell.pairs,
  treatment: finalizeMetricSums(cell.treatment, cell.pairs),
  control: finalizeMetricSums(cell.control, cell.pairs),
  meanDelta: finalizeMetricSums(cell.delta, cell.pairs),
  scoreDeltaByFocalSeat: {
    alpha: cell.seatDelta.alpha / cell.seatPairs.alpha,
    bravo: cell.seatDelta.bravo / cell.seatPairs.bravo
  }
}));

const contrastSummary = contrasts.map((contrast) => {
  const selected = cells.filter((cell) => cell.contrast === contrast.id);
  const pairs = selected.reduce((sum, cell) => sum + cell.pairs, 0);
  const weighted = (section, metric) => selected.reduce((sum, cell) => sum + cell[section][metric] * cell.pairs, 0) / pairs;
  return {
    contrast: contrast.id,
    pairs,
    treatmentScore: weighted("treatment", "score"),
    controlScore: weighted("control", "score"),
    scoreDelta: weighted("meanDelta", "score"),
    progressDelta: weighted("meanDelta", "progress"),
    driftDelta: weighted("meanDelta", "drift"),
    movementDelta: weighted("meanDelta", "movementDistance"),
    rangeShiftDelta: weighted("meanDelta", "rangeShifts"),
    supportScanDelta: weighted("meanDelta", "supportScans"),
    supportVerificationDelta: weighted("meanDelta", "supportScanVerifications"),
    autoAcceptedBeyondReachDelta: weighted("meanDelta", "autoAcceptedBeyondReach"),
    meanArtifactDistanceDelta: weighted("meanDelta", "meanArtifactDistance"),
    gateMetric: contrast.gateMetric,
    gateDelta: weighted("meanDelta", contrast.gateMetric)
  };
});

const byContrast = Object.fromEntries(contrastSummary.map((row) => [row.contrast, row]));
const plannedPairs = contrasts.length * pressureSamples.length * commandModes.length * seeds.length * orientations.length;
const plannedRuns = plannedPairs * arms.length;
const expectedSentinels = contrasts.length * pressureSamples.length * commandModes.length * arms.length;
const gates = {
  exactRunCount: observedPairs === plannedPairs && observedRuns === plannedRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamPairs: true,
  zeroPlanRejections: planRejections === 0,
  noArtilleryLeak: artillerySummaryLeaks === 0,
  chaseMoves: byContrast["artifact-chase-vs-hold"].movementDelta > 0,
  supportExecutes: byContrast["line-support-vs-hold"].supportScanDelta > 0,
  supportVerifies: byContrast["line-support-vs-hold"].supportVerificationDelta > 0,
  compressionContractsDistance: byContrast["range-compress-vs-default"].meanArtifactDistanceDelta < 0,
  expansionExpandsDistance: byContrast["range-expand-vs-default"].meanArtifactDistanceDelta > 0
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-b-spatial-probe-report",
  status: Object.values(gates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_SPATIAL_RESOLVER_VERSION,
  planId,
  planHash,
  plannedPairs,
  observedPairs,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  gates,
  contrastSummary,
  cells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const table = contrastSummary.map((row) =>
  `| ${row.contrast} | ${row.pairs.toLocaleString("en-US")} | ${row.treatmentScore.toFixed(4)} | ${row.controlScore.toFixed(4)} | ${row.scoreDelta.toFixed(4)} | ${row.movementDelta.toFixed(3)} | ${row.supportScanDelta.toFixed(3)} | ${row.meanArtifactDistanceDelta.toFixed(4)} | ${row.autoAcceptedBeyondReachDelta.toFixed(3)} |`
).join("\n");

const assessment = `# Attention v3 Stage-B spatial differential probe\n\n` +
  `Status: **${report.status.toUpperCase()}**  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`\n\n` +
  `The frozen Stage-B probe completed ${observedPairs.toLocaleString("en-US")} common-stream pairs (${observedRuns.toLocaleString("en-US")} matches) plus ${determinismSentinels.toLocaleString("en-US")} exact replay sentinels. Treatment and control arms retained the same seat, seed, pressure, command doctrine, opponent policy, and random-stream identifier.\n\n` +
  `## Gates\n\n${Object.entries(gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Paired effects\n\n| Contrast | Pairs | Treatment score | Control score | Score delta | Move delta | Support Scan delta | Mean distance delta | Beyond-reach auto-accept delta |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n` +
  `## Assessment\n\n` +
  `- Artifact chase changed executed movement by ${byContrast["artifact-chase-vs-hold"].movementDelta.toFixed(3)} tiles per focal run and changed locally verified work by ${(cells.filter((cell) => cell.contrast === "artifact-chase-vs-hold").reduce((sum, cell) => sum + cell.meanDelta.localVerifications * cell.pairs, 0) / byContrast["artifact-chase-vs-hold"].pairs).toFixed(3)} per run.\n` +
  `- Line Support Scan executed ${byContrast["line-support-vs-hold"].supportScanDelta.toFixed(3)} additional scans and ${byContrast["line-support-vs-hold"].supportVerificationDelta.toFixed(3)} additional scan-mediated verifications per focal run.\n` +
  `- Range compression changed mean spawn distance by ${byContrast["range-compress-vs-default"].meanArtifactDistanceDelta.toFixed(4)} tiles; expansion changed it by ${byContrast["range-expand-vs-default"].meanArtifactDistanceDelta.toFixed(4)}. These are keyed-coordinate effects, not sequential-RNG artifacts.\n` +
  `- Score, progress, drift, and unreachable-auto-accept deltas remain doctrine- and pressure-sensitive directional evidence. Stage B passes only if its direct mechanism gates pass.\n\n` +
  `## Boundary\n\nArtillery, reloads, cooldowns, Smoke, EMP, HE, and counter-battery were absent. This report authorizes evaluation of the separately versioned Stage-C Flare/Chaff pair; it does not promote v3 into the accepted v1/v2 model line.\n`;

function svgChart(rows) {
  const width = 1120;
  const height = 120 + rows.length * 92;
  const center = 690;
  const maxWidth = 280;
  const maxMagnitude = Math.max(...rows.map((row) => Math.abs(row.value)), 0.001);
  const bars = rows.map((row, index) => {
    const y = 112 + index * 92;
    const barWidth = Math.abs(row.value) / maxMagnitude * maxWidth;
    const x = row.value >= 0 ? center : center - barWidth;
    const color = row.value >= 0 ? "#35f2d0" : "#ff9f43";
    return `<text x="42" y="${y + 7}" fill="#f4f7ff" font-size="20" font-family="Segoe UI, sans-serif">${row.label}</text>\n` +
      `<line x1="${center}" y1="${y - 22}" x2="${center}" y2="${y + 24}" stroke="#a9b6d3" stroke-width="2"/>\n` +
      `<rect x="${x}" y="${y - 16}" width="${barWidth}" height="32" rx="6" fill="${color}"/>\n` +
      `<text x="${row.value >= 0 ? center + barWidth + 12 : center - barWidth - 12}" y="${y + 7}" fill="${color}" font-size="20" font-weight="700" text-anchor="${row.value >= 0 ? "start" : "end"}" font-family="Cascadia Mono, monospace">${row.value.toFixed(4)}</text>\n` +
      `<text x="42" y="${y + 35}" fill="#94a3c7" font-size="14" font-family="Segoe UI, sans-serif">${row.metric}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="42" y="48" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage B · direct mechanic deltas</text>
  <text x="42" y="76" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Treatment minus identical-stream control · ${observedPairs.toLocaleString("en-US")} paired battles</text>
  <text x="${center - 8}" y="76" fill="#a9b6d3" font-size="13" text-anchor="end" font-family="Segoe UI, sans-serif">contracts</text>
  <text x="${center + 8}" y="76" fill="#a9b6d3" font-size="13" font-family="Segoe UI, sans-serif">expands</text>
  ${bars}
</svg>\n`;
}

const chart = svgChart([
  { label: "Artifact chase", metric: "executed movement delta", value: byContrast["artifact-chase-vs-hold"].movementDelta },
  { label: "Line Support Scan", metric: "scan-mediated verification delta", value: byContrast["line-support-vs-hold"].supportVerificationDelta },
  { label: "Range compression", metric: "mean artifact-distance delta", value: byContrast["range-compress-vs-default"].meanArtifactDistanceDelta },
  { label: "Range expansion", metric: "mean artifact-distance delta", value: byContrast["range-expand-vs-default"].meanArtifactDistanceDelta }
]);

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "mechanic-deltas.svg"), chart, "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  planId,
  planHash,
  reportHash: report.reportHash,
  plannedPairs,
  observedPairs,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  gates,
  contrastSummary,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
