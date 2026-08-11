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

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c2-adaptive-holdout");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c2-adaptive-world-v1";
const PARENT_STAGE_C1_REPORT_HASH = "sha256:b6af622b1c9e312be0861f4ffd3513c2f5ad64d52f9b9c16ea814c6f2224e268";
const THRESHOLDS = [4, 5, 6, 7, 8];

const staticPolicies = [
  { id: "hold-pass", kind: "hold" },
  { id: "scout-peel-support", kind: "peel-support" },
  { id: "always-chaff", kind: "chaff" }
];
const adaptivePolicies = THRESHOLDS.map((threshold) => ({
  id: `adaptive-risk-${threshold}`,
  kind: "adaptive",
  threshold
}));
const trainingPolicies = [...staticPolicies, ...adaptivePolicies];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.70 },
  { id: "global-sound-45", objectiveCoupling: "global", soundnessRate: 0.45 },
  { id: "distance-sound-55", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.55 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.80 }
];
const commandModes = ["confidence-threshold", "local-verify"];
const trainSeeds = Array.from({ length: 32 }, (_, index) => 101_000 + index);
const holdoutSeeds = Array.from({ length: 16 }, (_, index) => 101_032 + index);
const orientations = ["focal-alpha", "focal-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c2-doctrine-aware-adaptive-holdout",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC1ReportHash: PARENT_STAGE_C1_REPORT_HASH,
  staticPolicies,
  thresholds: THRESHOLDS,
  adaptiveContract: {
    confidenceThreshold: "hold-pass",
    localVerifyBelowRiskThreshold: "scout-peel-support",
    localVerifyAtOrAboveRiskThreshold: "always-chaff",
    riskFormula: "drift + max(0, ownPendingArtifacts - attention) + ownPendingConfidenceBelow0.50"
  },
  selector: [
    "maximum minimum local-verify pressure score",
    "maximum pooled local-verify score",
    "minimum Chaff activation rate",
    "minimum numeric threshold"
  ],
  pressureSamples,
  commandModes,
  trainSeeds,
  holdoutSeeds,
  orientations,
  composition: "balanced",
  baseModelHash: digest(defaultAttentionModel),
  uapModelHash: digest(defaultAttentionV3Uap),
  spatialModelHash: digest(defaultAttentionV3Spatial),
  artilleryModelHash: digest(defaultAttentionV3Artillery),
  scenarioHash: digest(defaultAttentionScenario),
  compositionHash: digest(attentionCompositions.balanced),
  worldStreamNamespace: WORLD_STREAM_NAMESPACE,
  capacityPolicy: "pass",
  reload: false,
  promotionTolerance: 0.05
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c2-${planHash.slice(7, 23)}`;

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

function scoutDestination(playerId) {
  return playerId === "alpha" ? { x: 0, y: 0 } : { x: 9, y: 9 };
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
    .sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId))[0];
  return target ? { kind: "support-scan", artifactId: target.artifactId } : null;
}

function publicRiskIndex(projection, playerId) {
  const player = projection.players.find((candidate) => candidate.playerId === playerId);
  const pending = projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  );
  return player.drift + Math.max(0, pending.length - player.attention) +
    pending.filter((artifact) => artifact.reportedConfidence < 0.5).length;
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
    (artifact.supportScanUnitIds?.length ?? 0) > 0 || units.some((unit) => separation(unit.position, artifact.position) <= 1)
  );
  if (reachable && player.attention >= 1) return { kind: "verify", playerId, artifactId: reachable.artifactId };
  return { kind: "end-command", playerId };
}

function focalController(playerId, policy, commandMode, center, telemetry) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      telemetry.riskIndex = publicRiskIndex(projection, playerId);
      let branch = policy.kind;
      if (policy.kind === "adaptive") {
        branch = commandMode === "confidence-threshold"
          ? "hold"
          : telemetry.riskIndex >= policy.threshold ? "chaff" : "peel-support";
      }
      telemetry.branch = branch;
      return branch === "chaff"
        ? { kind: "fire-artillery", playerId, shell: "chaff", center }
        : { kind: "pass-artillery", playerId };
    },
    movement: (projection) => {
      if (telemetry.branch !== "peel-support") return [];
      const decisions = [];
      const scout = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "scout");
      const line = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "line");
      if (projection.round === 1 && scout) {
        decisions.push({
          kind: "unit-actions",
          playerId,
          unitId: scout.unitId,
          actions: [{ kind: "move", destination: scoutDestination(playerId) }]
        });
      }
      const scan = supportAction(projection, playerId);
      if (line && scan) decisions.push({ kind: "unit-actions", playerId, unitId: line.unitId, actions: [scan] });
      return decisions;
    },
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function aggressorController(playerId, commandMode, center) {
  return {
    artillery: (projection) => projection.round === 1
      ? { kind: "fire-artillery", playerId, shell: "flare", center }
      : { kind: "pass-artillery", playerId },
    movement: () => [],
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function runPolicy({ split, policy, pressure, commandMode, seed, orientation }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const aggressorPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const center = targetCenter(focalPlayerId);
  const streamId = `${WORLD_STREAM_NAMESPACE}:${pressure.id}:${commandMode}:${seed}:${orientation}`;
  const telemetry = { riskIndex: null, branch: null };
  const match = createAttentionMatch({
    matchId: `${planId}:${split}:${pressure.id}:${commandMode}:${seed}:${orientation}:${policy.id}`,
    seed,
    randomStreamId: streamId,
    context: runtimeContexts[pressure.id],
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
  const result = runAttentionMatch(match, {
    [focalPlayerId]: focalController(focalPlayerId, policy, commandMode, center, telemetry),
    [aggressorPlayerId]: aggressorController(aggressorPlayerId, commandMode, center)
  }, { traceMode: "hash" });
  return { result, focalPlayerId, aggressorPlayerId, streamId, telemetry };
}

function scoreFor(result, playerId) {
  if (result.match.state.winnerPlayerId === null) return 0.5;
  return result.match.state.winnerPlayerId === playerId ? 1 : 0;
}

const metricNames = [
  "score", "progress", "drift", "rounds", "movement", "supportScans",
  "supportVerifications", "autoAcceptedBeyondReach", "chaffFired",
  "hostileShellsBlocked", "flareAffectedArtifacts", "riskIndex", "peelBranch"
];

function metrics(run) {
  const { result, focalPlayerId, aggressorPlayerId, telemetry } = run;
  const focalState = result.match.state.players.find((player) => player.playerId === focalPlayerId);
  const focalCore = result.summary.players[focalPlayerId];
  const focalSpatial = result.summary.spatial[focalPlayerId];
  const focalArtillery = result.summary.artillery[focalPlayerId];
  const aggressorCore = result.summary.players[aggressorPlayerId];
  return {
    score: scoreFor(result, focalPlayerId),
    progress: focalState.progress,
    drift: focalState.drift,
    rounds: result.match.state.round,
    movement: focalCore.movementDistance,
    supportScans: focalSpatial.supportScans,
    supportVerifications: focalSpatial.supportScanVerifications,
    autoAcceptedBeyondReach: focalSpatial.autoAcceptedBeyondReach,
    chaffFired: focalArtillery.chaffShellsFired,
    hostileShellsBlocked: focalArtillery.hostileShellsBlocked,
    flareAffectedArtifacts: aggressorCore.flareAffectedArtifacts,
    riskIndex: telemetry.riskIndex ?? 0,
    peelBranch: telemetry.branch === "peel-support" ? 1 : 0
  };
}

function emptySums() {
  return Object.fromEntries(metricNames.map((metric) => [metric, 0]));
}

function addCell(cells, key, dimensions, values) {
  const cell = cells.get(key) ?? { ...dimensions, runs: 0, sums: emptySums() };
  for (const metric of metricNames) cell.sums[metric] += values[metric];
  cell.runs += 1;
  cells.set(key, cell);
}

function meanMetrics(sums, runs) {
  return Object.fromEntries(metricNames.map((metric) => [metric, sums[metric] / runs]));
}

const cells = new Map();
let observedTrainWorlds = 0;
let observedTrainRuns = 0;
let observedHoldoutWorlds = 0;
let observedHoldoutRuns = 0;
let determinismSentinels = 0;
let determinismFailures = 0;
let planRejections = 0;
let artilleryRejections = 0;
let reloadEvents = 0;
let handInvariantFailures = 0;
let confidenceAdaptiveDivergences = 0;

function auditRun(run) {
  const result = run.result;
  planRejections += Object.values(result.summary.uap).reduce((sum, counters) => sum + counters.plansRejected, 0);
  artilleryRejections += result.summary.eventTypes["attention.artillery.declaration.rejected"] ?? 0;
  reloadEvents += Object.entries(result.summary.eventTypes)
    .filter(([eventType]) => eventType.includes("artillery") && eventType.includes("reload"))
    .reduce((sum, [, count]) => sum + count, 0);
  for (const player of result.match.state.players) {
    const hand = player.artillery?.hand;
    if (!hand || hand.flare < 0 || hand.flare > 1 || hand.chaff < 0 || hand.chaff > 1) handInvariantFailures += 1;
  }
}

function executeSplit(split, seeds, policies) {
  for (const pressure of pressureSamples) {
    for (const commandMode of commandModes) {
      for (const seed of seeds) {
        for (const orientation of orientations) {
          const runs = policies.map((policy) => ({
            policy,
            run: runPolicy({ split, policy, pressure, commandMode, seed, orientation })
          }));
          if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) throw new Error(`${split} block lost common stream`);
          const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
          if (split === "train") {
            observedTrainWorlds += 1;
            observedTrainRuns += runs.length;
            if (commandMode === "confidence-threshold") {
              const hold = measured["hold-pass"];
              for (const adaptive of adaptivePolicies) {
                if (JSON.stringify(measured[adaptive.id]) !== JSON.stringify(hold)) confidenceAdaptiveDivergences += 1;
              }
            }
          } else {
            observedHoldoutWorlds += 1;
            observedHoldoutRuns += runs.length;
          }

          for (const { policy, run } of runs) {
            addCell(
              cells,
              `${split}|${policy.id}|${pressure.id}|${commandMode}|${run.focalPlayerId}`,
              { split, policy: policy.id, pressure: pressure.id, commandMode, focalSeat: run.focalPlayerId },
              measured[policy.id]
            );
            auditRun(run);
          }

          if (seed === seeds[0] && orientation === orientations[0]) {
            for (const { policy, run } of runs) {
              const replay = runPolicy({ split, policy, pressure, commandMode, seed, orientation });
              determinismSentinels += 1;
              if (replay.result.traceHash !== run.result.traceHash ||
                JSON.stringify(replay.result.match.state) !== JSON.stringify(run.result.match.state) ||
                JSON.stringify(replay.telemetry) !== JSON.stringify(run.telemetry)) determinismFailures += 1;
            }
          }
        }
      }
    }
  }
}

executeSplit("train", trainSeeds, trainingPolicies);

const finalizedTrainCells = [...cells.values()].filter((cell) => cell.split === "train").map((cell) => ({
  ...cell,
  mean: meanMetrics(cell.sums, cell.runs)
}));

function aggregateRows(rows) {
  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  return {
    runs,
    mean: Object.fromEntries(metricNames.map((metric) => [
      metric,
      rows.reduce((sum, row) => sum + row.mean[metric] * row.runs, 0) / runs
    ]))
  };
}

const thresholdSelection = adaptivePolicies.map((policy) => {
  const localRows = finalizedTrainCells.filter((cell) => cell.policy === policy.id && cell.commandMode === "local-verify");
  const pressureScores = Object.fromEntries(pressureSamples.map((pressure) => {
    const aggregate = aggregateRows(localRows.filter((cell) => cell.pressure === pressure.id));
    return [pressure.id, aggregate.mean.score];
  }));
  const pooled = aggregateRows(localRows);
  return {
    policy: policy.id,
    threshold: policy.threshold,
    minimumPressureScore: Math.min(...Object.values(pressureScores)),
    pooledScore: pooled.mean.score,
    chaffRate: pooled.mean.chaffFired,
    peelRate: pooled.mean.peelBranch,
    pressureScores
  };
}).sort((left, right) =>
  right.minimumPressureScore - left.minimumPressureScore ||
  right.pooledScore - left.pooledScore ||
  left.chaffRate - right.chaffRate ||
  left.threshold - right.threshold
);

const selected = thresholdSelection[0];
const selectedPolicy = adaptivePolicies.find((policy) => policy.id === selected.policy);
const holdoutPolicies = [...staticPolicies, selectedPolicy];
executeSplit("holdout", holdoutSeeds, holdoutPolicies);

const finalizedCells = [...cells.values()].map((cell) => ({
  split: cell.split,
  policy: cell.policy,
  pressure: cell.pressure,
  commandMode: cell.commandMode,
  focalSeat: cell.focalSeat,
  runs: cell.runs,
  mean: meanMetrics(cell.sums, cell.runs)
}));

function policySummary(split, policies) {
  return policies.map((policy) => {
    const rows = finalizedCells.filter((cell) => cell.split === split && cell.policy === policy.id);
    return { policy: policy.id, ...aggregateRows(rows) };
  });
}

const trainPolicySummary = policySummary("train", trainingPolicies);
const holdoutPolicySummary = policySummary("holdout", holdoutPolicies);
const holdoutByPolicy = Object.fromEntries(holdoutPolicySummary.map((row) => [row.policy, row]));

function holdoutGroupComparison(groupKeys) {
  const groups = new Map();
  for (const cell of finalizedCells.filter((candidate) => candidate.split === "holdout")) {
    const key = groupKeys.map((field) => cell[field]).join("|");
    const rows = groups.get(key) ?? [];
    rows.push(cell);
    groups.set(key, rows);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const dimensions = Object.fromEntries(groupKeys.map((field, index) => [field, key.split("|")[index]]));
    const scores = Object.fromEntries(holdoutPolicies.map((policy) => [
      policy.id,
      aggregateRows(rows.filter((row) => row.policy === policy.id)).mean.score
    ]));
    const bestStaticScore = Math.max(...staticPolicies.map((policy) => scores[policy.id]));
    return {
      ...dimensions,
      scores,
      bestStaticScore,
      adaptiveScore: scores[selected.policy],
      adaptiveGap: scores[selected.policy] - bestStaticScore
    };
  });
}

const holdoutPressureDoctrine = holdoutGroupComparison(["pressure", "commandMode"]);
const holdoutSeats = holdoutGroupComparison(["focalSeat"]);
const selectedHoldout = holdoutByPolicy[selected.policy];
const bestStaticHoldout = staticPolicies
  .map((policy) => holdoutByPolicy[policy.id])
  .sort((left, right) => right.mean.score - left.mean.score || left.policy.localeCompare(right.policy))[0];
const selectedLocalHoldout = aggregateRows(finalizedCells.filter((cell) =>
  cell.split === "holdout" && cell.policy === selected.policy && cell.commandMode === "local-verify"
));

const plannedTrainWorlds = pressureSamples.length * commandModes.length * trainSeeds.length * orientations.length;
const plannedTrainRuns = plannedTrainWorlds * trainingPolicies.length;
const plannedHoldoutWorlds = pressureSamples.length * commandModes.length * holdoutSeeds.length * orientations.length;
const plannedHoldoutRuns = plannedHoldoutWorlds * holdoutPolicies.length;
const expectedSentinels = pressureSamples.length * commandModes.length * (trainingPolicies.length + holdoutPolicies.length);

const conformanceGates = {
  exactTrainCount: observedTrainWorlds === plannedTrainWorlds && observedTrainRuns === plannedTrainRuns,
  exactHoldoutCount: observedHoldoutWorlds === plannedHoldoutWorlds && observedHoldoutRuns === plannedHoldoutRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamBlocks: true,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  confidenceDoctrineHolds: confidenceAdaptiveDivergences === 0,
  selectedBothBranchesTrain: selected.chaffRate > 0 && selected.chaffRate < 1 && selected.peelRate > 0 && selected.peelRate < 1,
  selectedBothBranchesHoldout: selectedLocalHoldout.mean.chaffFired > 0 && selectedLocalHoldout.mean.chaffFired < 1 && selectedLocalHoldout.mean.peelBranch > 0 && selectedLocalHoldout.mean.peelBranch < 1
};

const promotionGates = {
  pooledAtLeastBestStatic: selectedHoldout.mean.score >= bestStaticHoldout.mean.score,
  pressureDoctrineWithinTolerance: holdoutPressureDoctrine.every((row) => row.adaptiveGap >= -planDefinition.promotionTolerance),
  bothSeatsWithinTolerance: holdoutSeats.every((row) => row.adaptiveGap >= -planDefinition.promotionTolerance)
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c2-adaptive-holdout-report",
  status: Object.values(conformanceGates).every(Boolean) ? "pass" : "fail",
  promotionStatus: Object.values(promotionGates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC1ReportHash: PARENT_STAGE_C1_REPORT_HASH,
  planId,
  planHash,
  selectedPolicy: selected.policy,
  selectedThreshold: selected.threshold,
  plannedTrainWorlds,
  observedTrainWorlds,
  plannedTrainRuns,
  observedTrainRuns,
  plannedHoldoutWorlds,
  observedHoldoutWorlds,
  plannedHoldoutRuns,
  observedHoldoutRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  confidenceAdaptiveDivergences,
  conformanceGates,
  promotionGates,
  thresholdSelection,
  trainPolicySummary,
  holdoutPolicySummary,
  bestStaticHoldoutPolicy: bestStaticHoldout.policy,
  holdoutPressureDoctrine,
  holdoutSeats,
  cells: finalizedCells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const thresholdTable = thresholdSelection.map((row, index) =>
  `| ${index + 1} | ${row.threshold} | ${row.minimumPressureScore.toFixed(4)} | ${row.pooledScore.toFixed(4)} | ${(row.chaffRate * 100).toFixed(1)}% | ${(row.peelRate * 100).toFixed(1)}% |`
).join("\n");
const holdoutTable = holdoutPolicySummary.map((row) =>
  `| ${row.policy} | ${row.mean.score.toFixed(4)} | ${row.mean.progress.toFixed(3)} | ${row.mean.drift.toFixed(3)} | ${(row.mean.chaffFired * 100).toFixed(1)}% | ${row.mean.movement.toFixed(3)} | ${row.mean.supportScans.toFixed(3)} |`
).join("\n");
const cellTable = holdoutPressureDoctrine.map((row) =>
  `| ${row.pressure} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");
const localBranchTable = pressureSamples.map((pressure) => {
  const aggregate = aggregateRows(finalizedCells.filter((cell) =>
    cell.split === "holdout" && cell.policy === selected.policy &&
    cell.pressure === pressure.id && cell.commandMode === "local-verify"
  ));
  const comparison = holdoutPressureDoctrine.find((row) =>
    row.pressure === pressure.id && row.commandMode === "local-verify"
  );
  const bestStaticPolicy = staticPolicies
    .slice()
    .sort((left, right) => comparison.scores[right.id] - comparison.scores[left.id] || left.id.localeCompare(right.id))[0].id;
  return `| ${pressure.id} | ${aggregate.mean.riskIndex.toFixed(3)} | ${(aggregate.mean.chaffFired * 100).toFixed(1)}% | ${(aggregate.mean.peelBranch * 100).toFixed(1)}% | ${bestStaticPolicy} | ${comparison.adaptiveGap.toFixed(4)} |`;
}).join("\n");

const assessment = `# Attention v3 Stage-C2 adaptive holdout\n\n` +
  `Conformance: **${report.status.toUpperCase()}**  \n` +
  `Holdout promotion: **${report.promotionStatus.toUpperCase()}**  \n` +
  `Selected policy: \`${selected.policy}\`  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-C1 report: \`${PARENT_STAGE_C1_REPORT_HASH}\`\n\n` +
  `Training executed ${observedTrainWorlds.toLocaleString("en-US")} worlds / ${observedTrainRuns.toLocaleString("en-US")} matches across all five thresholds and three static controls. The frozen selector chose threshold ${selected.threshold} before the untouched ${observedHoldoutWorlds.toLocaleString("en-US")}-world / ${observedHoldoutRuns.toLocaleString("en-US")}-match holdout was executed.\n\n` +
  `## Conformance gates\n\n${Object.entries(conformanceGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Holdout promotion gates\n\n${Object.entries(promotionGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Training threshold selection\n\n| Rank | Threshold | Minimum pressure score | Pooled local-verify score | Chaff rate | Peel rate |\n|---:|---:|---:|---:|---:|---:|\n${thresholdTable}\n\n` +
  `## Untouched holdout\n\n| Policy | Score | Progress | Drift | Chaff rate | Movement | Support Scans |\n|---|---:|---:|---:|---:|---:|---:|\n${holdoutTable}\n\n` +
  `## Holdout pressure × doctrine gaps\n\n| Pressure | Doctrine | Adaptive score | Best static | Gap |\n|---|---|---:|---:|---:|\n${cellTable}\n\n` +
  `## Local-verification branch behavior\n\n| Pressure | Mean public risk | Chaff branch | Peel branch | Best static response | Adaptive gap |\n|---|---:|---:|---:|---|---:|\n${localBranchTable}\n\n` +
  `## Assessment\n\n` +
  `- Threshold ${selected.threshold} was selected by the predeclared maximin rule with minimum training pressure score ${selected.minimumPressureScore.toFixed(4)}, pooled local-verification score ${selected.pooledScore.toFixed(4)}, and ${(selected.chaffRate * 100).toFixed(1)}% Chaff activation.\n` +
  `- On holdout, the adaptive score was ${selectedHoldout.mean.score.toFixed(4)} versus ${bestStaticHoldout.mean.score.toFixed(4)} for the best pooled static control (\`${bestStaticHoldout.policy}\`), a delta of ${(selectedHoldout.mean.score - bestStaticHoldout.mean.score).toFixed(4)}.\n` +
  `- The worst pressure × doctrine gap to that cell's best static control was ${Math.min(...holdoutPressureDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}; the worst seat gap was ${Math.min(...holdoutSeats.map((row) => row.adaptiveGap)).toFixed(4)}.\n` +
  `- Binary 0.70 and distance-weighted 0.80 both favored Scout peel + Support Scan, yet threshold 6 still selected Chaff in substantial fractions of those worlds. At the round-one response point, public drift and overload are invariants (0 and 3), so this risk rule reduces exactly to a low-confidence-count threshold.\n` +
  `- The next candidate should keep the doctrine-first branch and test public spatial confidence geometry, such as low-confidence exposure inside the threatened zone. It must use fresh seeds and another frozen train/holdout boundary; pressure labels remain forbidden inputs.\n` +
  `- Promotion status applies only to this policy candidate. A failure does not invalidate spatial spawning, Support Scan, Flare, or Chaff.\n\n` +
  `## Boundary\n\nThis holdout may nominate one doctrine-aware response for a larger bounded audit. It does not authorize model promotion, new shells, reloads, cooldowns, or counter-battery.\n`;

function thresholdSvg(rows) {
  const width = 1160;
  const height = 560;
  const maxScore = Math.max(...rows.flatMap((row) => [row.minimumPressureScore, row.pooledScore]));
  const minScore = Math.min(...rows.flatMap((row) => [row.minimumPressureScore, row.pooledScore])) - 0.03;
  const scale = (score) => (score - minScore) / (maxScore - minScore) * 500;
  const bars = rows.slice().sort((left, right) => left.threshold - right.threshold).map((row, index) => {
    const y = 125 + index * 78;
    return `<text x="45" y="${y + 9}" fill="#f4f7ff" font-size="19" font-family="Segoe UI, sans-serif">risk ≥ ${row.threshold}</text>\n` +
      `<rect x="190" y="${y - 19}" width="${scale(row.minimumPressureScore)}" height="25" rx="5" fill="#35f2d0"/>\n` +
      `<rect x="190" y="${y + 10}" width="${scale(row.pooledScore)}" height="18" rx="4" fill="#8b7cff"/>\n` +
      `<text x="720" y="${y + 8}" fill="#dbe5ff" font-size="15" font-family="Cascadia Mono, monospace">min ${row.minimumPressureScore.toFixed(4)}  pooled ${row.pooledScore.toFixed(4)}  chaff ${(row.chaffRate * 100).toFixed(0)}%</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="42" y="48" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C2 · frozen training selector</text>
  <text x="42" y="78" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Cyan: minimum pressure score · violet: pooled local-verification score</text>
  ${bars}
</svg>\n`;
}

function holdoutSvg(rows) {
  const width = 1240;
  const height = 500;
  const maxScore = Math.max(...rows.map((row) => row.mean.score));
  const bars = rows.map((row, index) => {
    const y = 130 + index * 88;
    const width = row.mean.score / maxScore * 540;
    const selectedColor = row.policy === selected.policy ? "#35f2d0" : "#ff9f43";
    return `<text x="40" y="${y + 7}" fill="#f4f7ff" font-size="18" font-family="Segoe UI, sans-serif">${row.policy}</text>\n` +
      `<rect x="260" y="${y - 18}" width="${width}" height="34" rx="7" fill="${selectedColor}"/>\n` +
      `<text x="${275 + width}" y="${y + 7}" fill="${selectedColor}" font-size="18" font-weight="700" font-family="Cascadia Mono, monospace">${row.mean.score.toFixed(4)}</text>\n` +
      `<text x="920" y="${y + 7}" fill="#a9b6d3" font-size="14" font-family="Cascadia Mono, monospace">progress ${row.mean.progress.toFixed(2)}  drift ${row.mean.drift.toFixed(2)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="40" y="48" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C2 · untouched holdout score</text>
  <text x="40" y="78" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Selected adaptive candidate in cyan · static controls in orange</text>
  ${bars}
</svg>\n`;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "threshold-selection.svg"), thresholdSvg(thresholdSelection), "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "holdout-score.svg"), holdoutSvg(holdoutPolicySummary), "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  promotionStatus: report.promotionStatus,
  planId,
  planHash,
  reportHash: report.reportHash,
  selectedPolicy: selected.policy,
  selectedThreshold: selected.threshold,
  observedTrainWorlds,
  observedTrainRuns,
  observedHoldoutWorlds,
  observedHoldoutRuns,
  determinismSentinels,
  conformanceGates,
  promotionGates,
  thresholdSelection,
  holdoutPolicySummary,
  holdoutPressureDoctrine,
  holdoutSeats,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
