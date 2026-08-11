import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ATTENTION_V3_RESOLVER_VERSION,
  attentionCompositions,
  createAttentionMatch,
  createAttentionV3Model,
  defaultAttentionModel,
  defaultAttentionScenario,
  defaultAttentionV3Uap,
  runAttentionMatch
} from "../packages/engine/dist/index.js";

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-a-probe");
const REPORT_PATH = resolve(OUTPUT_DIRECTORY, "report.json");
const ASSESSMENT_PATH = resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-a-world-v1";

const contrasts = [
  { id: "scout-active-vs-hold", treatment: "scout-active", control: "hold", expectedMetric: "turboCharges" },
  { id: "scout-active-vs-flight", treatment: "scout-active", control: "scout-flight", expectedMetric: "turboCharges" },
  { id: "line-step-vs-hold", treatment: "line-step", control: "hold", expectedMetric: "stepUps" },
  { id: "line-step-vs-move", treatment: "line-step", control: "line-move", expectedMetric: "stepUps" },
  { id: "siege-uplink-vs-hold", treatment: "siege-uplink", control: "hold", expectedMetric: "uplinks" },
  { id: "siege-uplink-vs-move", treatment: "siege-uplink", control: "siege-move", expectedMetric: "uplinks" }
];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.7 },
  { id: "global-sound-60", objectiveCoupling: "global", soundnessRate: 0.6 },
  { id: "distance-sound-60", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.6 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.8 }
];

const commandModes = ["accept-all", "confidence-threshold", "verify-lowest"];
const seeds = Array.from({ length: 64 }, (_, index) => 61_000 + index);
const orientations = ["treatment-alpha", "treatment-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-a-differential-probe",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_RESOLVER_VERSION,
  contrasts,
  pressureSamples,
  commandModes,
  seeds,
  orientations,
  composition: "balanced",
  baseModelHash: digest(defaultAttentionModel),
  uapModelHash: digest(defaultAttentionV3Uap),
  scenarioHash: digest(defaultAttentionScenario),
  compositionHash: digest(attentionCompositions.balanced),
  worldStreamNamespace: WORLD_STREAM_NAMESPACE,
  capacityPolicy: "pass",
  artifacts: "source-cell",
  artillery: "disabled-by-stage"
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-a-${planHash.slice(7, 23)}`;

function runtimeContext(pressure) {
  const base = {
    ...defaultAttentionModel,
    rules: {
      ...defaultAttentionModel.rules,
      objectiveTarget: 24,
      driftLimit: 5,
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
  return { model: createAttentionV3Model(base), scenario: defaultAttentionScenario };
}

const runtimeContexts = Object.fromEntries(pressureSamples.map((pressure) => [pressure.id, runtimeContext(pressure)]));

function pairDestination(unit, playerId, chassis) {
  const pairs = chassis === "scout"
    ? playerId === "alpha" ? [{ x: 1, y: 1 }, { x: 0, y: 0 }] : [{ x: 8, y: 8 }, { x: 9, y: 9 }]
    : chassis === "line"
      ? playerId === "alpha" ? [{ x: 1, y: 2 }, { x: 0, y: 3 }] : [{ x: 8, y: 7 }, { x: 9, y: 6 }]
      : playerId === "alpha" ? [{ x: 2, y: 1 }, { x: 3, y: 0 }] : [{ x: 7, y: 8 }, { x: 6, y: 9 }];
  return unit.position.x === pairs[0].x && unit.position.y === pairs[0].y ? pairs[1] : pairs[0];
}

function flightActions(unit, playerId) {
  const destination = pairDestination(unit, playerId, "scout");
  const middle = { x: destination.x, y: unit.position.y };
  return [
    { kind: "move", destination },
    { kind: "move", destination: middle },
    { kind: "move", destination }
  ];
}

function actionsFor(mode, unit, playerId) {
  if (mode === "scout-active" && unit.chassis === "scout") {
    return [
      { kind: "move", destination: pairDestination(unit, playerId, "scout") },
      { kind: "turbo-charge" },
      { kind: "step-up" }
    ];
  }
  if (mode === "scout-flight" && unit.chassis === "scout") return flightActions(unit, playerId);
  if (mode === "line-step" && unit.chassis === "line") return [{ kind: "step-up" }];
  if (mode === "line-move" && unit.chassis === "line") {
    return [{ kind: "move", destination: pairDestination(unit, playerId, "line") }];
  }
  if (mode === "siege-uplink" && unit.chassis === "siege") return [{ kind: "command-uplink" }];
  if (mode === "siege-move" && unit.chassis === "siege") {
    return [{ kind: "move", destination: pairDestination(unit, playerId, "siege") }];
  }
  return [];
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
  if (mode === "verify-lowest" && projection.players.find((player) => player.playerId === playerId).attention >= 1) {
    return { kind: "verify", playerId, artifactId: pending[0].artifactId };
  }
  return pending[0].reportedConfidence < 0.5
    ? { kind: "reject", playerId, artifactId: pending[0].artifactId }
    : { kind: "accept", playerId, artifactId: pending[0].artifactId };
}

function controller(playerId, actionMode, commandMode) {
  return {
    movement: (projection) => projection.units
      .filter((unit) => unit.ownerPlayerId === playerId)
      .map((unit) => ({
        kind: "unit-actions",
        playerId,
        unitId: unit.unitId,
        actions: actionsFor(actionMode, unit, playerId)
      })),
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function runCell({ contrast, pressure, commandMode, seed, orientation }) {
  const treatmentPlayerId = orientation === "treatment-alpha" ? "alpha" : "bravo";
  const controlPlayerId = treatmentPlayerId === "alpha" ? "bravo" : "alpha";
  const matchId = `${planId}:${contrast.id}:${pressure.id}:${commandMode}:${seed}:${orientation}`;
  const match = createAttentionMatch({
    matchId,
    seed,
    randomStreamId: `${WORLD_STREAM_NAMESPACE}:${pressure.id}:${commandMode}:${seed}`,
    context: runtimeContexts[pressure.id],
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
  const result = runAttentionMatch(match, {
    [treatmentPlayerId]: controller(treatmentPlayerId, contrast.treatment, commandMode),
    [controlPlayerId]: controller(controlPlayerId, contrast.control, commandMode)
  }, { traceMode: "hash" });
  return { result, treatmentPlayerId, controlPlayerId };
}

function emptyAggregate(contrast, pressure, commandMode) {
  return {
    contrast: contrast.id,
    pressure: pressure.id,
    commandMode,
    runs: 0,
    treatmentScore: 0,
    draws: 0,
    rounds: 0,
    playerOneScore: 0,
    treatmentUap: Object.fromEntries(Object.keys({
      available: 0,
      spent: 0,
      plansAccepted: 0,
      plansRejected: 0,
      moveSteps: 0,
      turboCharges: 0,
      stepUps: 0,
      passiveSettles: 0,
      uplinks: 0
    }).map((key) => [key, 0])),
    controlUap: Object.fromEntries(["available", "spent", "plansAccepted", "plansRejected", "moveSteps", "turboCharges", "stepUps", "passiveSettles", "uplinks"].map((key) => [key, 0]))
  };
}

function addCounters(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key] ?? 0;
}

function scoreFor(result, playerId) {
  if (result.match.state.winnerPlayerId === null) return 0.5;
  return result.match.state.winnerPlayerId === playerId ? 1 : 0;
}

const aggregates = new Map();
let observedRuns = 0;
let planRejections = 0;
let determinismSentinels = 0;
let determinismFailures = 0;

for (const contrast of contrasts) {
  for (const pressure of pressureSamples) {
    for (const commandMode of commandModes) {
      const key = `${contrast.id}|${pressure.id}|${commandMode}`;
      const aggregate = emptyAggregate(contrast, pressure, commandMode);
      aggregates.set(key, aggregate);
      for (const seed of seeds) {
        for (const orientation of orientations) {
          const cell = { contrast, pressure, commandMode, seed, orientation };
          const { result, treatmentPlayerId, controlPlayerId } = runCell(cell);
          const treatmentUap = result.summary.uap[treatmentPlayerId];
          const controlUap = result.summary.uap[controlPlayerId];
          aggregate.runs += 1;
          aggregate.treatmentScore += scoreFor(result, treatmentPlayerId);
          aggregate.playerOneScore += scoreFor(result, "alpha");
          aggregate.draws += result.match.state.winnerPlayerId === null ? 1 : 0;
          aggregate.rounds += result.match.state.round;
          addCounters(aggregate.treatmentUap, treatmentUap);
          addCounters(aggregate.controlUap, controlUap);
          planRejections += treatmentUap.plansRejected + controlUap.plansRejected;
          observedRuns += 1;

          if (seed === seeds[0] && orientation === orientations[0]) {
            const replay = runCell(cell).result;
            determinismSentinels += 1;
            if (replay.traceHash !== result.traceHash || JSON.stringify(replay.match.state) !== JSON.stringify(result.match.state)) {
              determinismFailures += 1;
            }
          }
        }
      }
    }
  }
}

const cells = [...aggregates.values()].map((aggregate) => ({
  contrast: aggregate.contrast,
  pressure: aggregate.pressure,
  commandMode: aggregate.commandMode,
  runs: aggregate.runs,
  treatmentScoreRate: aggregate.treatmentScore / aggregate.runs,
  drawRate: aggregate.draws / aggregate.runs,
  meanRounds: aggregate.rounds / aggregate.runs,
  playerOneScoreRate: aggregate.playerOneScore / aggregate.runs,
  treatmentUap: aggregate.treatmentUap,
  controlUap: aggregate.controlUap
}));

const contrastSummary = contrasts.map((contrast) => {
  const selected = cells.filter((cell) => cell.contrast === contrast.id);
  const runs = selected.reduce((sum, cell) => sum + cell.runs, 0);
  const treatmentMetric = selected.reduce((sum, cell) => sum + cell.treatmentUap[contrast.expectedMetric], 0);
  const controlMetric = selected.reduce((sum, cell) => sum + cell.controlUap[contrast.expectedMetric], 0);
  return {
    contrast: contrast.id,
    runs,
    treatmentScoreRate: selected.reduce((sum, cell) => sum + cell.treatmentScoreRate * cell.runs, 0) / runs,
    drawRate: selected.reduce((sum, cell) => sum + cell.drawRate * cell.runs, 0) / runs,
    meanRounds: selected.reduce((sum, cell) => sum + cell.meanRounds * cell.runs, 0) / runs,
    expectedMetric: contrast.expectedMetric,
    treatmentMetric,
    controlMetric,
    mechanicDifferentiated: treatmentMetric > controlMetric
  };
});

const plannedRuns = contrasts.length * pressureSamples.length * commandModes.length * seeds.length * orientations.length;
const gates = {
  exactRunCount: observedRuns === plannedRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === contrasts.length * pressureSamples.length * commandModes.length,
  zeroPlanRejections: planRejections === 0,
  allMechanicsDifferentiated: contrastSummary.every((row) => row.mechanicDifferentiated)
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-a-probe-report",
  status: Object.values(gates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_RESOLVER_VERSION,
  planId,
  planHash,
  plannedRuns,
  observedRuns,
  extraDeterminismExecutions: determinismSentinels,
  gates,
  planRejections,
  contrastSummary,
  cells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const table = contrastSummary.map((row) =>
  `| ${row.contrast} | ${row.runs.toLocaleString("en-US")} | ${row.treatmentScoreRate.toFixed(4)} | ${(row.drawRate * 100).toFixed(2)}% | ${row.meanRounds.toFixed(3)} | ${row.treatmentMetric.toLocaleString("en-US")} / ${row.controlMetric.toLocaleString("en-US")} | ${row.mechanicDifferentiated ? "PASS" : "FAIL"} |`
).join("\n");
function pooledTreatmentScore(predicate) {
  const selected = cells.filter(predicate);
  const runs = selected.reduce((sum, cell) => sum + cell.runs, 0);
  return selected.reduce((sum, cell) => sum + cell.treatmentScoreRate * cell.runs, 0) / runs;
}
const directionalFindings = [
  `Scout Active Recon scored ${pooledTreatmentScore((cell) => cell.contrast === "scout-active-vs-flight").toFixed(4)} against pure flight, including ${pooledTreatmentScore((cell) => cell.contrast === "scout-active-vs-flight" && cell.commandMode === "confidence-threshold").toFixed(4)} under confidence-threshold commands. Under accept-all, where calibration is deliberately irrelevant, the same contrast was ${pooledTreatmentScore((cell) => cell.contrast === "scout-active-vs-flight" && cell.commandMode === "accept-all").toFixed(4)}.`,
  `Scout Active Recon scored ${pooledTreatmentScore((cell) => cell.contrast === "scout-active-vs-hold").toFixed(4)} against Passive Settle overall, but ${pooledTreatmentScore((cell) => cell.contrast === "scout-active-vs-hold" && (cell.pressure === "binary-sound-70" || cell.pressure === "global-sound-60")).toFixed(4)} outside the distance-weighted samples. The current outward movement policy, not calibration alone, drives much of that interaction.`,
  `Line Step-Up was neutral against hold under accept-all (${pooledTreatmentScore((cell) => cell.contrast === "line-step-vs-hold" && cell.commandMode === "accept-all").toFixed(4)}) and positive under confidence-threshold commands (${pooledTreatmentScore((cell) => cell.contrast === "line-step-vs-hold" && cell.commandMode === "confidence-threshold").toFixed(4)}), which is the expected calibration-sensitive pattern.`,
  `Siege Uplink versus hold changed direction by command doctrine: ${pooledTreatmentScore((cell) => cell.contrast === "siege-uplink-vs-hold" && cell.commandMode === "accept-all").toFixed(4)} under accept-all, ${pooledTreatmentScore((cell) => cell.contrast === "siege-uplink-vs-hold" && cell.commandMode === "confidence-threshold").toFixed(4)} under confidence-threshold, and ${pooledTreatmentScore((cell) => cell.contrast === "siege-uplink-vs-hold" && cell.commandMode === "verify-lowest").toFixed(4)} under verify-lowest. The accept-all advantage comes from unused Uplink attention entering the existing round-limit tiebreak; the confidence-threshold penalty exposes the queued 0.20 calibration tradeoff.`
];
const assessment = `# Attention v3 Stage-A differential probe\n\n` +
  `Status: **${report.status.toUpperCase()}**  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`\n\n` +
  `The bounded Stage-A probe completed ${observedRuns.toLocaleString("en-US")} planned matches plus ${determinismSentinels.toLocaleString("en-US")} exact replay sentinels. It is conformance and directional evidence only; it does not authorize Stage B or establish a promoted balance model.\n\n` +
  `## Gates\n\n` + Object.entries(gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n") +
  `\n\n## Contrast summary\n\n| Contrast | Runs | Treatment score | Draw rate | Mean rounds | Expected mechanic treatment/control | Gate |\n|---|---:|---:|---:|---:|---:|---|\n${table}\n\n` +
  `## Directional findings\n\n${directionalFindings.map((finding) => `- ${finding}`).join("\n")}\n\n` +
  `## Boundary\n\nArtifacts remained on source cells, capacity policies always passed, artillery was absent, and the existing attention command layer was held to three fixed regimes. The next authorized decision is whether to refine Stage-A action doctrines or freeze a separate Stage-B spatial-artifact plan.\n`;

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(ASSESSMENT_PATH, assessment, "utf8");
process.stdout.write(`${JSON.stringify({
  status: report.status,
  planId,
  planHash,
  reportHash: report.reportHash,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  gates,
  contrastSummary,
  reportPath: REPORT_PATH,
  assessmentPath: ASSESSMENT_PATH
}, null, 2)}\n`);
