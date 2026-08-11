import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  attentionCompositions,
  createAttentionMatch,
  createAttentionV3ArtilleryModel,
  defaultAttentionModel,
  defaultAttentionScenario,
  defaultAttentionV3Artillery,
  defaultAttentionV3Spatial,
  defaultAttentionV3Uap,
  runAttentionMatch
} from "../packages/engine/dist/index.js";

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c-artillery-probe");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c-artillery-world-v1";
const PARENT_STAGE_B_REPORT_HASH = "sha256:d517e38297f2419652c35e9ee23b34d3be9dc7c2b505a4439162b444e58b04ed";

const contrasts = [
  {
    id: "hostile-flare-vs-pass-on-hold",
    treatment: { focalMovement: "hold", focalChaff: false, aggressorFlare: true },
    control: { focalMovement: "hold", focalChaff: false, aggressorFlare: false }
  },
  {
    id: "centered-chaff-vs-pass",
    treatment: { focalMovement: "hold", focalChaff: true, aggressorFlare: true },
    control: { focalMovement: "hold", focalChaff: false, aggressorFlare: true }
  },
  {
    id: "evacuate-vs-hold-under-flare",
    treatment: { focalMovement: "evacuate", focalChaff: false, aggressorFlare: true },
    control: { focalMovement: "hold", focalChaff: false, aggressorFlare: true }
  }
];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.70 },
  { id: "global-sound-45", objectiveCoupling: "global", soundnessRate: 0.45 },
  { id: "distance-sound-55", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.55 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.80 }
];

const commandModes = ["confidence-threshold", "local-verify"];
const seeds = Array.from({ length: 48 }, (_, index) => 83_000 + index);
const orientations = ["focal-alpha", "focal-bravo"];
const arms = ["treatment", "control"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c-flare-chaff-anti-turtle-probe",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageBReportHash: PARENT_STAGE_B_REPORT_HASH,
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
  artilleryModelHash: digest(defaultAttentionV3Artillery),
  scenarioHash: digest(defaultAttentionScenario),
  compositionHash: digest(attentionCompositions.balanced),
  worldStreamNamespace: WORLD_STREAM_NAMESPACE,
  capacityPolicy: "pass",
  hand: { flare: 1, chaff: 1 },
  reload: false
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c-${planHash.slice(7, 23)}`;

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
  return { model: createAttentionV3ArtilleryModel(base), scenario: defaultAttentionScenario };
}

const runtimeContexts = Object.fromEntries(pressureSamples.map((pressure) => [pressure.id, runtimeContext(pressure)]));

function separation(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function targetCenter(focalPlayerId) {
  return focalPlayerId === "alpha" ? { x: 2, y: 2 } : { x: 7, y: 7 };
}

function evacuationDestination(playerId, chassis) {
  if (playerId === "alpha") {
    if (chassis === "scout") return { x: 0, y: 0 };
    if (chassis === "line") return { x: 0, y: 2 };
    return { x: 2, y: 0 };
  }
  if (chassis === "scout") return { x: 9, y: 9 };
  if (chassis === "line") return { x: 9, y: 7 };
  return { x: 7, y: 9 };
}

function movementDecisions(projection, playerId, mode) {
  if (mode !== "evacuate" || projection.round !== 1) return [];
  return projection.units
    .filter((unit) => unit.ownerPlayerId === playerId)
    .map((unit) => ({
      kind: "unit-actions",
      playerId,
      unitId: unit.unitId,
      actions: [{ kind: "move", destination: evacuationDestination(playerId, unit.chassis) }]
    }));
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

function controller(playerId, options, commandMode) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      if (options.fireFlare) {
        return { kind: "fire-artillery", playerId, shell: "flare", center: options.center };
      }
      if (options.fireChaff) {
        return { kind: "fire-artillery", playerId, shell: "chaff", center: options.center };
      }
      return { kind: "pass-artillery", playerId };
    },
    movement: (projection) => movementDecisions(projection, playerId, options.movement),
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function runArm({ contrast, pressure, commandMode, seed, orientation, arm }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const aggressorPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const configuration = contrast[arm];
  const center = targetCenter(focalPlayerId);
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
    [focalPlayerId]: controller(focalPlayerId, {
      fireFlare: false,
      fireChaff: configuration.focalChaff,
      center,
      movement: configuration.focalMovement
    }, commandMode),
    [aggressorPlayerId]: controller(aggressorPlayerId, {
      fireFlare: configuration.aggressorFlare,
      fireChaff: false,
      center,
      movement: "hold"
    }, commandMode)
  }, { traceMode: "hash" });
  return { result, focalPlayerId, aggressorPlayerId, streamId };
}

function scoreFor(result, playerId) {
  if (result.match.state.winnerPlayerId === null) return 0.5;
  return result.match.state.winnerPlayerId === playerId ? 1 : 0;
}

const metricNames = [
  "focalScore",
  "focalProgress",
  "focalDrift",
  "focalArtifactsEmitted",
  "focalMovement",
  "focalBeyondReachAutoAccepts",
  "focalChaffFired",
  "focalHostileShellsBlocked",
  "aggressorFlareFired",
  "aggressorFlareEstablished",
  "aggressorOwnShellsBlocked",
  "aggressorFlareAffectedArtifacts",
  "aggressorDriftDefeatsInduced"
];

function metrics(run) {
  const { result, focalPlayerId, aggressorPlayerId } = run;
  const focalState = result.match.state.players.find((player) => player.playerId === focalPlayerId);
  const focalCore = result.summary.players[focalPlayerId];
  const aggressorCore = result.summary.players[aggressorPlayerId];
  const focalSpatial = result.summary.spatial[focalPlayerId];
  const focalArtillery = result.summary.artillery[focalPlayerId];
  const aggressorArtillery = result.summary.artillery[aggressorPlayerId];
  return {
    focalScore: scoreFor(result, focalPlayerId),
    focalProgress: focalState.progress,
    focalDrift: focalState.drift,
    focalArtifactsEmitted: focalCore.artifactsEmitted,
    focalMovement: focalCore.movementDistance,
    focalBeyondReachAutoAccepts: focalSpatial.autoAcceptedBeyondReach,
    focalChaffFired: focalArtillery.chaffShellsFired,
    focalHostileShellsBlocked: focalArtillery.hostileShellsBlocked,
    aggressorFlareFired: aggressorArtillery.flareShellsFired,
    aggressorFlareEstablished: aggressorArtillery.flareShellsEstablished,
    aggressorOwnShellsBlocked: aggressorArtillery.ownShellsBlocked,
    aggressorFlareAffectedArtifacts: aggressorCore.flareAffectedArtifacts,
    aggressorDriftDefeatsInduced: aggressorCore.driftDefeatsInduced
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
    seatScoreDelta: { alpha: 0, bravo: 0 },
    seatPairs: { alpha: 0, bravo: 0 }
  };
}

function addMetrics(target, source) {
  for (const name of metricNames) target[name] += source[name];
}

function means(sums, divisor) {
  return Object.fromEntries(metricNames.map((name) => [name, sums[name] / divisor]));
}

const cellsByKey = new Map();
let observedPairs = 0;
let observedRuns = 0;
let determinismSentinels = 0;
let determinismFailures = 0;
let planRejections = 0;
let artilleryRejections = 0;
let reloadEvents = 0;
let handInvariantFailures = 0;
let counterMissingRuns = 0;

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
          const treatmentMetrics = metrics(treatmentRun);
          const controlMetrics = metrics(controlRun);
          addMetrics(cell.treatment, treatmentMetrics);
          addMetrics(cell.control, controlMetrics);
          for (const name of metricNames) cell.delta[name] += treatmentMetrics[name] - controlMetrics[name];
          const seat = treatmentRun.focalPlayerId;
          cell.seatScoreDelta[seat] += treatmentMetrics.focalScore - controlMetrics.focalScore;
          cell.seatPairs[seat] += 1;
          cell.pairs += 1;
          observedPairs += 1;
          observedRuns += 2;

          for (const run of [treatmentRun.result, controlRun.result]) {
            if (!run.summary.spatial || !run.summary.artillery) counterMissingRuns += 1;
            planRejections += Object.values(run.summary.uap).reduce((sum, counters) => sum + counters.plansRejected, 0);
            artilleryRejections += run.summary.eventTypes["attention.artillery.declaration.rejected"] ?? 0;
            reloadEvents += Object.entries(run.summary.eventTypes)
              .filter(([eventType]) => eventType.includes("artillery") && eventType.includes("reload"))
              .reduce((sum, [, count]) => sum + count, 0);
            for (const player of run.match.state.players) {
              const hand = player.artillery?.hand;
              if (!hand || hand.flare < 0 || hand.flare > 1 || hand.chaff < 0 || hand.chaff > 1) handInvariantFailures += 1;
            }
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
  treatment: means(cell.treatment, cell.pairs),
  control: means(cell.control, cell.pairs),
  meanDelta: means(cell.delta, cell.pairs),
  scoreDeltaByFocalSeat: {
    alpha: cell.seatScoreDelta.alpha / cell.seatPairs.alpha,
    bravo: cell.seatScoreDelta.bravo / cell.seatPairs.bravo
  }
}));

const contrastSummary = contrasts.map((contrast) => {
  const selected = cells.filter((cell) => cell.contrast === contrast.id);
  const pairs = selected.reduce((sum, cell) => sum + cell.pairs, 0);
  const weighted = (section, metric) => selected.reduce((sum, cell) => sum + cell[section][metric] * cell.pairs, 0) / pairs;
  return {
    contrast: contrast.id,
    pairs,
    treatmentScore: weighted("treatment", "focalScore"),
    controlScore: weighted("control", "focalScore"),
    scoreDelta: weighted("meanDelta", "focalScore"),
    progressDelta: weighted("meanDelta", "focalProgress"),
    driftDelta: weighted("meanDelta", "focalDrift"),
    emittedDelta: weighted("meanDelta", "focalArtifactsEmitted"),
    movementDelta: weighted("meanDelta", "focalMovement"),
    beyondReachDelta: weighted("meanDelta", "focalBeyondReachAutoAccepts"),
    chaffFiredDelta: weighted("meanDelta", "focalChaffFired"),
    hostileShellsBlockedDelta: weighted("meanDelta", "focalHostileShellsBlocked"),
    flareEstablishedDelta: weighted("meanDelta", "aggressorFlareEstablished"),
    ownShellsBlockedDelta: weighted("meanDelta", "aggressorOwnShellsBlocked"),
    flareAffectedArtifactsDelta: weighted("meanDelta", "aggressorFlareAffectedArtifacts"),
    driftDefeatsInducedDelta: weighted("meanDelta", "aggressorDriftDefeatsInduced")
  };
});

const byContrast = Object.fromEntries(contrastSummary.map((row) => [row.contrast, row]));
const flare = byContrast["hostile-flare-vs-pass-on-hold"];
const chaff = byContrast["centered-chaff-vs-pass"];
const evacuate = byContrast["evacuate-vs-hold-under-flare"];
const plannedPairs = contrasts.length * pressureSamples.length * commandModes.length * seeds.length * orientations.length;
const plannedRuns = plannedPairs * arms.length;
const expectedSentinels = contrasts.length * pressureSamples.length * commandModes.length * arms.length;
const gates = {
  exactRunCount: observedPairs === plannedPairs && observedRuns === plannedRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamPairs: true,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  causalCountersPresent: counterMissingRuns === 0,
  flareEstablishes: flare.flareEstablishedDelta > 0,
  flarePressuresHoldingCluster: flare.flareAffectedArtifactsDelta > 0,
  chaffBlocks: chaff.hostileShellsBlockedDelta > 0 && chaff.ownShellsBlockedDelta > 0,
  chaffContractsFlareImpact: chaff.flareEstablishedDelta < 0 && chaff.flareAffectedArtifactsDelta < 0,
  evacuationMoves: evacuate.movementDelta > 0,
  evacuationContractsFlareImpact: evacuate.flareAffectedArtifactsDelta < 0
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c-artillery-probe-report",
  status: Object.values(gates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageBReportHash: PARENT_STAGE_B_REPORT_HASH,
  planId,
  planHash,
  plannedPairs,
  observedPairs,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  gates,
  contrastSummary,
  cells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const table = contrastSummary.map((row) =>
  `| ${row.contrast} | ${row.pairs.toLocaleString("en-US")} | ${row.treatmentScore.toFixed(4)} | ${row.controlScore.toFixed(4)} | ${row.scoreDelta.toFixed(4)} | ${row.driftDelta.toFixed(3)} | ${row.movementDelta.toFixed(3)} | ${row.flareAffectedArtifactsDelta.toFixed(3)} | ${row.hostileShellsBlockedDelta.toFixed(3)} |`
).join("\n");

const assessment = `# Attention v3 Stage-C Flare/Chaff anti-turtle probe\n\n` +
  `Status: **${report.status.toUpperCase()}**  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-B report: \`${PARENT_STAGE_B_REPORT_HASH}\`\n\n` +
  `The Stage-C probe completed ${observedPairs.toLocaleString("en-US")} common-stream pairs (${observedRuns.toLocaleString("en-US")} matches) plus ${determinismSentinels.toLocaleString("en-US")} exact replay sentinels. Every treatment/control pair held seat, seed, pressure, command doctrine, and random stream fixed.\n\n` +
  `## Gates\n\n${Object.entries(gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Paired effects\n\n| Contrast | Pairs | Treatment score | Control score | Score delta | Drift delta | Move delta | Flare-affected artifact delta | Blocked-shell delta |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n` +
  `## Assessment\n\n` +
  `- An unopposed hostile Flare established ${flare.flareEstablishedDelta.toFixed(3)} additional zones and exposed ${flare.flareAffectedArtifactsDelta.toFixed(3)} additional artifacts per paired focal battle. Its focal score delta was ${flare.scoreDelta.toFixed(4)} and drift delta was ${flare.driftDelta.toFixed(3)}; those outcomes include early termination and doctrine interactions.\n` +
  `- Centered same-phase Chaff blocked ${chaff.hostileShellsBlockedDelta.toFixed(3)} additional hostile shells, contracted Flare-affected output by ${Math.abs(chaff.flareAffectedArtifactsDelta).toFixed(3)} artifacts, and changed focal score by ${chaff.scoreDelta.toFixed(4)}.\n` +
  `- Immediate evacuation executed ${evacuate.movementDelta.toFixed(3)} additional tiles, contracted Flare-affected output by ${Math.abs(evacuate.flareAffectedArtifactsDelta).toFixed(3)} artifacts, and changed focal score by ${evacuate.scoreDelta.toFixed(4)}. This measures the intended anti-turtle choice: spend mobility now or absorb the next emission surge.\n` +
  `- Chaff and relocation are distinct answers: Chaff preserves position but consumes the only defensive shell; relocation preserves the shell but resets stationary calibration and changes spatial coverage.\n\n` +
  `## Boundary\n\nThe hand was fixed and public with no reload. Cooldowns, counter-battery, Smoke, EMP, and HE remain disabled. Passing this probe validates the minimal Flare/Chaff interaction, not the later artillery catalog or a full v3 balance promotion.\n`;

function svgChart(rows) {
  const width = 1180;
  const height = 500;
  const panelWidth = 350;
  const maxImpact = Math.max(...rows.map((row) => Math.abs(row.impact)), 1);
  const panels = rows.map((row, index) => {
    const x = 40 + index * 380;
    const baseline = x + panelWidth / 2;
    const barWidth = Math.abs(row.impact) / maxImpact * 135;
    const barX = row.impact >= 0 ? baseline : baseline - barWidth;
    const color = row.impact >= 0 ? "#ff5470" : "#35f2d0";
    return `<rect x="${x}" y="112" width="${panelWidth}" height="320" rx="18" fill="#101c31" stroke="#253656"/>\n` +
      `<text x="${x + 24}" y="154" fill="#ffffff" font-size="20" font-weight="700" font-family="Segoe UI, sans-serif">${row.label}</text>\n` +
      `<text x="${x + 24}" y="184" fill="#94a3c7" font-size="14" font-family="Segoe UI, sans-serif">Δ Flare-affected artifacts</text>\n` +
      `<line x1="${baseline}" y1="204" x2="${baseline}" y2="266" stroke="#a9b6d3" stroke-width="2"/>\n` +
      `<rect x="${barX}" y="218" width="${barWidth}" height="34" rx="7" fill="${color}"/>\n` +
      `<text x="${x + panelWidth / 2}" y="302" fill="${color}" text-anchor="middle" font-size="26" font-weight="700" font-family="Cascadia Mono, monospace">${row.impact.toFixed(3)}</text>\n` +
      `<text x="${x + 24}" y="350" fill="#dbe5ff" font-size="16" font-family="Segoe UI, sans-serif">Score Δ  ${row.score.toFixed(4)}</text>\n` +
      `<text x="${x + 24}" y="382" fill="#dbe5ff" font-size="16" font-family="Segoe UI, sans-serif">Drift Δ  ${row.drift.toFixed(3)}</text>\n` +
      `<text x="${x + 24}" y="414" fill="#dbe5ff" font-size="16" font-family="Segoe UI, sans-serif">Move Δ   ${row.movement.toFixed(3)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="40" y="48" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C · anti-turtle pressure and counters</text>
  <text x="40" y="78" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Treatment minus identical-stream control · ${observedPairs.toLocaleString("en-US")} paired battles</text>
  ${panels}
</svg>\n`;
}

const chart = svgChart([
  { label: "Hostile Flare", impact: flare.flareAffectedArtifactsDelta, score: flare.scoreDelta, drift: flare.driftDelta, movement: flare.movementDelta },
  { label: "Centered Chaff", impact: chaff.flareAffectedArtifactsDelta, score: chaff.scoreDelta, drift: chaff.driftDelta, movement: chaff.movementDelta },
  { label: "Immediate evacuation", impact: evacuate.flareAffectedArtifactsDelta, score: evacuate.scoreDelta, drift: evacuate.driftDelta, movement: evacuate.movementDelta }
]);

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "anti-turtle-effects.svg"), chart, "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  planId,
  planHash,
  reportHash: report.reportHash,
  parentStageBReportHash: PARENT_STAGE_B_REPORT_HASH,
  plannedPairs,
  observedPairs,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  gates,
  contrastSummary,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);

