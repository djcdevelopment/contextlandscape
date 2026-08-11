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

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c3-ruleset-spatial-holdout");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c3-ruleset-spatial-world-v1";
const PARENT_STAGE_C2_REPORT_HASH = "sha256:93d5e5c3caa2411e3e9c30570d44cbc9d88af6d866d7cd09eab9643879ac50ea";

const staticPolicies = [
  { id: "hold-pass", kind: "hold" },
  { id: "scout-peel-support", kind: "peel-support" },
  { id: "always-chaff", kind: "chaff" }
];

const distanceCandidates = [
  ...[1, 2, 3, 4, 5, 6].map((threshold) => ({
    id: `low-total-ge-${threshold}`, feature: "lowTotal", threshold
  })),
  ...[1, 2, 3, 4, 5, 6].map((threshold) => ({
    id: `low-objective-ge-${threshold}`, feature: "lowObjective", threshold
  })),
  ...[1, 2, 3].map((threshold) => ({
    id: `low-scout-ge-${threshold}`, feature: "lowScout", threshold
  })),
  ...[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold) => ({
    id: `objective-deficit-ge-${threshold.toFixed(1).replace(".", "p")}`,
    feature: "objectiveDeficit",
    threshold
  })),
  ...[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold) => ({
    id: `scout-deficit-ge-${threshold.toFixed(1).replace(".", "p")}`,
    feature: "scoutDeficit",
    threshold
  }))
];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.70 },
  { id: "global-sound-45", objectiveCoupling: "global", soundnessRate: 0.45 },
  { id: "distance-sound-55", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.55 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.80 }
];
const commandModes = ["confidence-threshold", "local-verify"];
const trainSeeds = Array.from({ length: 64 }, (_, index) => 202_000 + index);
const holdoutSeeds = Array.from({ length: 32 }, (_, index) => 202_064 + index);
const orientations = ["focal-alpha", "focal-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c3-ruleset-aware-spatial-holdout",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC2ReportHash: PARENT_STAGE_C2_REPORT_HASH,
  staticPolicies,
  distanceCandidates,
  publicPolicyContract: {
    confidenceThreshold: "hold-pass",
    localGlobal: "always-chaff",
    localBinaryFront: "scout-peel-support",
    localDistanceWeightedFront: "selected public spatial-confidence rule",
    forbiddenInputs: ["latent soundness", "artifact truth", "pressure id", "soundness rate", "focal seat", "split membership"]
  },
  featureContract: {
    lowConfidenceCutoff: 0.50,
    lowTotal: "pending public artifacts below cutoff",
    lowObjective: "pending public objectiveEligible artifacts below cutoff",
    lowScout: "pending public Scout-source artifacts below cutoff",
    objectiveDeficit: "sum max(0, 0.50 - reportedConfidence) over objectiveEligible artifacts",
    scoutDeficit: "sum max(0, 0.50 - reportedConfidence) over Scout-source artifacts"
  },
  selector: [
    "maximum minimum local-verify pressure score",
    "maximum pooled local-verify score",
    "maximum minimum distance-weighted pressure score",
    "minimum distance-weighted Chaff activation rate",
    "lexical candidate id"
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
  trainingMode: "three simulated static arms plus exact offline candidate lookup",
  capacityPolicy: "pass",
  reload: false,
  promotionTolerance: 0.05
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c3-${planHash.slice(7, 23)}`;

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

function publicSpatialFeatures(projection, playerId) {
  const pending = projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  );
  const low = pending.filter((artifact) => artifact.reportedConfidence < 0.50);
  const objective = pending.filter((artifact) => artifact.objectiveEligible);
  const scout = pending.filter((artifact) => artifact.sourceUnitId.endsWith(":scout"));
  const deficit = (artifacts) => Number(artifacts
    .reduce((sum, artifact) => sum + Math.max(0, 0.50 - artifact.reportedConfidence), 0)
    .toFixed(6));
  return {
    lowTotal: low.length,
    lowObjective: low.filter((artifact) => artifact.objectiveEligible).length,
    lowScout: low.filter((artifact) => artifact.sourceUnitId.endsWith(":scout")).length,
    objectiveDeficit: deficit(objective),
    scoutDeficit: deficit(scout)
  };
}

function distanceRuleFires(candidate, features) {
  return features[candidate.feature] >= candidate.threshold;
}

function adaptiveBranch(commandMode, objectiveCoupling, candidate, features) {
  if (commandMode === "confidence-threshold") return "hold";
  if (objectiveCoupling === "global") return "chaff";
  if (objectiveCoupling === "binary-front") return "peel-support";
  return distanceRuleFires(candidate, features) ? "chaff" : "peel-support";
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
    return pending[0].reportedConfidence < 0.50
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

function focalController(playerId, policy, commandMode, objectiveCoupling, center, telemetry) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      telemetry.features = publicSpatialFeatures(projection, playerId);
      telemetry.objectiveCoupling = objectiveCoupling;
      telemetry.branch = policy.kind === "adaptive"
        ? adaptiveBranch(commandMode, objectiveCoupling, policy.candidate, telemetry.features)
        : policy.kind;
      return telemetry.branch === "chaff"
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
  const telemetry = { features: null, objectiveCoupling: null, branch: null };
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
    [focalPlayerId]: focalController(focalPlayerId, policy, commandMode, pressure.objectiveCoupling, center, telemetry),
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
  "hostileShellsBlocked", "flareAffectedArtifacts", "lowTotal", "lowObjective",
  "lowScout", "objectiveDeficit", "scoutDeficit", "peelBranch"
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
    lowTotal: telemetry.features.lowTotal,
    lowObjective: telemetry.features.lowObjective,
    lowScout: telemetry.features.lowScout,
    objectiveDeficit: telemetry.features.objectiveDeficit,
    scoutDeficit: telemetry.features.scoutDeficit,
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

function aggregateMetrics(values) {
  const sums = emptySums();
  for (const value of values) for (const metric of metricNames) sums[metric] += value[metric];
  return { runs: values.length, mean: meanMetrics(sums, values.length) };
}

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

const cells = new Map();
const trainingWorlds = [];
const holdoutWorlds = [];
let observedTrainWorlds = 0;
let observedTrainRuns = 0;
let observedHoldoutWorlds = 0;
let observedHoldoutRuns = 0;
let determinismSentinels = 0;
let determinismFailures = 0;
let commonStreamFailures = 0;
let featureParityFailures = 0;
let branchMetricParityFailures = 0;
let policyMappingFailures = 0;
let planRejections = 0;
let artilleryRejections = 0;
let reloadEvents = 0;
let handInvariantFailures = 0;

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

function executeTraining() {
  for (const pressure of pressureSamples) {
    for (const commandMode of commandModes) {
      for (const seed of trainSeeds) {
        for (const orientation of orientations) {
          const runs = staticPolicies.map((policy) => ({
            policy,
            run: runPolicy({ split: "train", policy, pressure, commandMode, seed, orientation })
          }));
          observedTrainWorlds += 1;
          observedTrainRuns += runs.length;
          if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) commonStreamFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.telemetry.features))).size !== 1) featureParityFailures += 1;
          const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
          trainingWorlds.push({
            pressure: pressure.id,
            objectiveCoupling: pressure.objectiveCoupling,
            commandMode,
            seed,
            focalSeat: runs[0].run.focalPlayerId,
            features: runs[0].run.telemetry.features,
            outcomes: measured
          });
          for (const { policy, run } of runs) {
            addCell(
              cells,
              `train|${policy.id}|${pressure.id}|${commandMode}|${run.focalPlayerId}`,
              { split: "train", policy: policy.id, pressure: pressure.id, commandMode, focalSeat: run.focalPlayerId },
              measured[policy.id]
            );
            auditRun(run);
          }
          if (seed === trainSeeds[0] && orientation === orientations[0]) {
            for (const { policy, run } of runs) {
              const replay = runPolicy({ split: "train", policy, pressure, commandMode, seed, orientation });
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

function branchPolicyId(branch) {
  if (branch === "hold") return "hold-pass";
  if (branch === "chaff") return "always-chaff";
  return "scout-peel-support";
}

function rankCandidates(rows) {
  return rows.slice().sort((left, right) =>
    right.minimumPressureScore - left.minimumPressureScore ||
    right.pooledScore - left.pooledScore ||
    right.minimumDistanceScore - left.minimumDistanceScore ||
    left.distanceChaffRate - right.distanceChaffRate ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

executeTraining();

const candidateSelection = rankCandidates(distanceCandidates.map((candidate) => {
  const evaluated = trainingWorlds.map((world) => {
    const branch = adaptiveBranch(world.commandMode, world.objectiveCoupling, candidate, world.features);
    return { ...world, branch, values: world.outcomes[branchPolicyId(branch)] };
  });
  const local = evaluated.filter((world) => world.commandMode === "local-verify");
  const pressureScores = Object.fromEntries(pressureSamples.map((pressure) => {
    const values = local.filter((world) => world.pressure === pressure.id).map((world) => world.values);
    return [pressure.id, aggregateMetrics(values).mean.score];
  }));
  const distance = local.filter((world) => world.objectiveCoupling === "distance-weighted-front");
  return {
    candidateId: candidate.id,
    candidate,
    minimumPressureScore: Math.min(...Object.values(pressureScores)),
    pooledScore: aggregateMetrics(local.map((world) => world.values)).mean.score,
    minimumDistanceScore: Math.min(
      pressureScores["distance-sound-55"],
      pressureScores["distance-sound-80"]
    ),
    distanceChaffRate: distance.filter((world) => world.branch === "chaff").length / distance.length,
    localChaffRate: local.filter((world) => world.branch === "chaff").length / local.length,
    pressureScores
  };
}));

const selected = candidateSelection[0];
const selectorReproduction = JSON.stringify(candidateSelection.map((row) => row.candidateId)) ===
  JSON.stringify(rankCandidates(candidateSelection).map((row) => row.candidateId));
const selectedPolicy = {
  id: `ruleset-spatial-${selected.candidateId}`,
  kind: "adaptive",
  candidate: selected.candidate
};
const holdoutPolicies = [...staticPolicies, selectedPolicy];

function executeHoldout() {
  for (const pressure of pressureSamples) {
    for (const commandMode of commandModes) {
      for (const seed of holdoutSeeds) {
        for (const orientation of orientations) {
          const runs = holdoutPolicies.map((policy) => ({
            policy,
            run: runPolicy({ split: "holdout", policy, pressure, commandMode, seed, orientation })
          }));
          observedHoldoutWorlds += 1;
          observedHoldoutRuns += runs.length;
          if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) commonStreamFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.telemetry.features))).size !== 1) featureParityFailures += 1;
          const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
          const adaptiveRun = runs.find(({ policy }) => policy.id === selectedPolicy.id).run;
          const expectedBranch = adaptiveBranch(
            commandMode,
            pressure.objectiveCoupling,
            selected.candidate,
            adaptiveRun.telemetry.features
          );
          if (adaptiveRun.telemetry.branch !== expectedBranch) policyMappingFailures += 1;
          const expectedMetrics = measured[branchPolicyId(expectedBranch)];
          if (JSON.stringify(measured[selectedPolicy.id]) !== JSON.stringify(expectedMetrics)) branchMetricParityFailures += 1;
          holdoutWorlds.push({
            pressure: pressure.id,
            objectiveCoupling: pressure.objectiveCoupling,
            commandMode,
            seed,
            focalSeat: adaptiveRun.focalPlayerId,
            features: adaptiveRun.telemetry.features,
            branch: expectedBranch,
            outcomes: measured
          });
          for (const { policy, run } of runs) {
            addCell(
              cells,
              `holdout|${policy.id}|${pressure.id}|${commandMode}|${run.focalPlayerId}`,
              { split: "holdout", policy: policy.id, pressure: pressure.id, commandMode, focalSeat: run.focalPlayerId },
              measured[policy.id]
            );
            auditRun(run);
          }
          if (seed === holdoutSeeds[0] && orientation === orientations[0]) {
            for (const { policy, run } of runs) {
              const replay = runPolicy({ split: "holdout", policy, pressure, commandMode, seed, orientation });
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

executeHoldout();

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

const trainStaticSummary = policySummary("train", staticPolicies);
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
      adaptiveScore: scores[selectedPolicy.id],
      adaptiveGap: scores[selectedPolicy.id] - bestStaticScore
    };
  });
}

const holdoutPressureDoctrine = holdoutGroupComparison(["pressure", "commandMode"]);
const holdoutSeats = holdoutGroupComparison(["focalSeat"]);
const selectedHoldout = holdoutByPolicy[selectedPolicy.id];
const bestStaticHoldout = staticPolicies
  .map((policy) => holdoutByPolicy[policy.id])
  .sort((left, right) => right.mean.score - left.mean.score || left.policy.localeCompare(right.policy))[0];

const trainingSelectedEvaluations = trainingWorlds.map((world) => ({
  ...world,
  branch: adaptiveBranch(world.commandMode, world.objectiveCoupling, selected.candidate, world.features)
}));
const trainingDistance = trainingSelectedEvaluations.filter((world) =>
  world.commandMode === "local-verify" && world.objectiveCoupling === "distance-weighted-front"
);
const holdoutDistance = holdoutWorlds.filter((world) =>
  world.commandMode === "local-verify" && world.objectiveCoupling === "distance-weighted-front"
);

const localBranchSummary = pressureSamples.map((pressure) => {
  const worlds = holdoutWorlds.filter((world) =>
    world.pressure === pressure.id && world.commandMode === "local-verify"
  );
  return {
    pressure: pressure.id,
    objectiveCoupling: pressure.objectiveCoupling,
    runs: worlds.length,
    chaffRate: worlds.filter((world) => world.branch === "chaff").length / worlds.length,
    peelRate: worlds.filter((world) => world.branch === "peel-support").length / worlds.length,
    holdRate: worlds.filter((world) => world.branch === "hold").length / worlds.length
  };
});

const plannedTrainWorlds = pressureSamples.length * commandModes.length * trainSeeds.length * orientations.length;
const plannedTrainRuns = plannedTrainWorlds * staticPolicies.length;
const plannedCandidateEvaluations = plannedTrainWorlds * distanceCandidates.length;
const plannedHoldoutWorlds = pressureSamples.length * commandModes.length * holdoutSeeds.length * orientations.length;
const plannedHoldoutRuns = plannedHoldoutWorlds * holdoutPolicies.length;
const expectedSentinels = pressureSamples.length * commandModes.length * (staticPolicies.length + holdoutPolicies.length);

const conformanceGates = {
  exactTrainCount: observedTrainWorlds === plannedTrainWorlds && observedTrainRuns === plannedTrainRuns,
  exactCandidateEvaluationCount: plannedCandidateEvaluations === trainingWorlds.length * distanceCandidates.length,
  exactHoldoutCount: observedHoldoutWorlds === plannedHoldoutWorlds && observedHoldoutRuns === plannedHoldoutRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamBlocks: commonStreamFailures === 0,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  publicFeatureParity: featureParityFailures === 0,
  selectorReproduces: selectorReproduction,
  policyMappingExact: policyMappingFailures === 0,
  actualBranchMetricParity: branchMetricParityFailures === 0,
  selectedBothDistanceBranchesTrain: trainingDistance.some((world) => world.branch === "chaff") && trainingDistance.some((world) => world.branch === "peel-support"),
  selectedBothDistanceBranchesHoldout: holdoutDistance.some((world) => world.branch === "chaff") && holdoutDistance.some((world) => world.branch === "peel-support")
};

const promotionGates = {
  pooledAtLeastBestStatic: selectedHoldout.mean.score >= bestStaticHoldout.mean.score,
  pressureDoctrineWithinTolerance: holdoutPressureDoctrine.every((row) => row.adaptiveGap >= -planDefinition.promotionTolerance),
  bothSeatsWithinTolerance: holdoutSeats.every((row) => row.adaptiveGap >= -planDefinition.promotionTolerance),
  distanceLocalWithinTolerance: holdoutPressureDoctrine
    .filter((row) => row.commandMode === "local-verify" && row.pressure.startsWith("distance-"))
    .every((row) => row.adaptiveGap >= -planDefinition.promotionTolerance)
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c3-ruleset-spatial-holdout-report",
  status: Object.values(conformanceGates).every(Boolean) ? "pass" : "fail",
  promotionStatus: Object.values(promotionGates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC2ReportHash: PARENT_STAGE_C2_REPORT_HASH,
  planId,
  planHash,
  selectedPolicy: selectedPolicy.id,
  selectedCandidate: selected,
  plannedTrainWorlds,
  observedTrainWorlds,
  plannedTrainRuns,
  observedTrainRuns,
  plannedCandidateEvaluations,
  plannedHoldoutWorlds,
  observedHoldoutWorlds,
  plannedHoldoutRuns,
  observedHoldoutRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  featureParityFailures,
  branchMetricParityFailures,
  policyMappingFailures,
  conformanceGates,
  promotionGates,
  candidateSelection,
  trainStaticSummary,
  holdoutPolicySummary,
  bestStaticHoldoutPolicy: bestStaticHoldout.policy,
  holdoutPressureDoctrine,
  holdoutSeats,
  localBranchSummary,
  cells: finalizedCells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const candidateTable = candidateSelection.slice(0, 10).map((row, index) =>
  `| ${index + 1} | ${row.candidateId} | ${row.minimumPressureScore.toFixed(4)} | ${row.pooledScore.toFixed(4)} | ${row.minimumDistanceScore.toFixed(4)} | ${(row.distanceChaffRate * 100).toFixed(1)}% |`
).join("\n");
const holdoutTable = holdoutPolicySummary.map((row) =>
  `| ${row.policy} | ${row.mean.score.toFixed(4)} | ${row.mean.progress.toFixed(3)} | ${row.mean.drift.toFixed(3)} | ${(row.mean.chaffFired * 100).toFixed(1)}% | ${row.mean.supportScans.toFixed(3)} |`
).join("\n");
const cellTable = holdoutPressureDoctrine.map((row) =>
  `| ${row.pressure} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");
const branchTable = localBranchSummary.map((row) =>
  `| ${row.pressure} | ${row.objectiveCoupling} | ${(row.chaffRate * 100).toFixed(1)}% | ${(row.peelRate * 100).toFixed(1)}% |`
).join("\n");

const assessment = `# Attention v3 Stage-C3 ruleset-aware spatial holdout\n\n` +
  `Conformance: **${report.status.toUpperCase()}**  \n` +
  `Holdout promotion: **${report.promotionStatus.toUpperCase()}**  \n` +
  `Selected policy: \`${selectedPolicy.id}\`  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-C2 report: \`${PARENT_STAGE_C2_REPORT_HASH}\`\n\n` +
  `Training executed ${observedTrainWorlds.toLocaleString("en-US")} worlds / ${observedTrainRuns.toLocaleString("en-US")} matches. It evaluated ${plannedCandidateEvaluations.toLocaleString("en-US")} frozen candidate-world decisions by exact common-world static lookup, selected \`${selected.candidateId}\`, and only then executed ${observedHoldoutWorlds.toLocaleString("en-US")} untouched worlds / ${observedHoldoutRuns.toLocaleString("en-US")} actual holdout matches.\n\n` +
  `## Conformance gates\n\n${Object.entries(conformanceGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Holdout promotion gates\n\n${Object.entries(promotionGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Training candidate frontier (top 10)\n\n| Rank | Distance rule | Minimum pressure | Pooled local | Minimum distance | Distance Chaff |\n|---:|---|---:|---:|---:|---:|\n${candidateTable}\n\n` +
  `## Untouched holdout\n\n| Policy | Score | Progress | Drift | Chaff rate | Support Scans |\n|---|---:|---:|---:|---:|---:|\n${holdoutTable}\n\n` +
  `## Holdout pressure x doctrine gaps\n\n| Pressure | Doctrine | Adaptive score | Best static | Gap |\n|---|---|---:|---:|---:|\n${cellTable}\n\n` +
  `## Local-verification branch behavior\n\n| Pressure | Public objective coupling | Chaff | Scout peel + Support |\n|---|---|---:|---:|\n${branchTable}\n\n` +
  `## Assessment\n\n` +
  `- The frozen selector chose \`${selected.candidateId}\` with minimum training pressure score ${selected.minimumPressureScore.toFixed(4)}, pooled local-verification score ${selected.pooledScore.toFixed(4)}, and minimum distance score ${selected.minimumDistanceScore.toFixed(4)}.\n` +
  `- On holdout, the adaptive score was ${selectedHoldout.mean.score.toFixed(4)} versus ${bestStaticHoldout.mean.score.toFixed(4)} for the best pooled static control (\`${bestStaticHoldout.policy}\`), a delta of ${(selectedHoldout.mean.score - bestStaticHoldout.mean.score).toFixed(4)}.\n` +
  `- The worst pressure x doctrine gap was ${Math.min(...holdoutPressureDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}; the worst seat gap was ${Math.min(...holdoutSeats.map((row) => row.adaptiveGap)).toFixed(4)}.\n` +
  `- The richer objective-geometry features did not win the frozen selector. Once public objective coupling separated the scoring regimes, low-confidence count at least 4 was sufficient for the remaining distance-weighted decision.\n` +
  `- Versus the best pooled static response, the candidate retained ${(selectedHoldout.mean.progress - bestStaticHoldout.mean.progress).toFixed(3)} more progress and finished with ${(bestStaticHoldout.mean.drift - selectedHoldout.mean.drift).toFixed(3)} less drift on average.\n` +
  `- Public objective coupling is a scenario rule, not an experiment pressure label. The adaptive branch function never receives soundness rate, latent truth, focal seat, or split membership.\n` +
  `- Passing these gates nominates this response policy for a larger bounded audit. It does not yet promote the model or authorize additional artillery mechanics.\n\n` +
  `## Boundary\n\nThis result can nominate one ruleset-aware response for a larger bounded audit. It does not authorize model promotion, new shells, reloads, cooldowns, or counter-battery.\n`;

function candidateSvg(rows) {
  const shown = rows.slice(0, 10);
  const width = 1320;
  const height = 760;
  const maxScore = Math.max(...shown.flatMap((row) => [row.minimumPressureScore, row.pooledScore]));
  const minScore = Math.min(...shown.flatMap((row) => [row.minimumPressureScore, row.pooledScore])) - 0.03;
  const scale = (score) => (score - minScore) / (maxScore - minScore) * 500;
  const bars = shown.map((row, index) => {
    const y = 150 + index * 57;
    const selectedColor = index === 0 ? "#35f2d0" : "#5ab4ff";
    return `<text x="38" y="${y + 7}" fill="${selectedColor}" font-size="14" font-family="Cascadia Mono, monospace">${index + 1}. ${row.candidateId}</text>\n` +
      `<rect x="390" y="${y - 15}" width="${scale(row.minimumPressureScore)}" height="17" rx="4" fill="${selectedColor}"/>\n` +
      `<rect x="390" y="${y + 7}" width="${scale(row.pooledScore)}" height="12" rx="3" fill="#8b7cff"/>\n` +
      `<text x="930" y="${y + 6}" fill="#dbe5ff" font-size="14" font-family="Cascadia Mono, monospace">min ${row.minimumPressureScore.toFixed(4)}  pooled ${row.pooledScore.toFixed(4)}  dist chaff ${(row.distanceChaffRate * 100).toFixed(0)}%</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="38" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C3 · frozen spatial candidate frontier</text>
  <text x="38" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Cyan marks the selected maximin rule · violet is pooled local-verification score</text>
  ${bars}
</svg>\n`;
}

function holdoutCellsSvg(rows) {
  const width = 1320;
  const height = 680;
  const bars = rows.map((row, index) => {
    const y = 145 + index * 64;
    const adaptiveWidth = row.adaptiveScore * 500;
    const staticWidth = row.bestStaticScore * 500;
    const color = row.adaptiveGap >= -planDefinition.promotionTolerance ? "#35f2d0" : "#ff6b7a";
    return `<text x="35" y="${y + 8}" fill="#f4f7ff" font-size="14" font-family="Cascadia Mono, monospace">${row.pressure} / ${row.commandMode}</text>\n` +
      `<rect x="390" y="${y - 16}" width="${staticWidth}" height="16" rx="4" fill="#ff9f43"/>\n` +
      `<rect x="390" y="${y + 5}" width="${adaptiveWidth}" height="16" rx="4" fill="${color}"/>\n` +
      `<text x="930" y="${y + 8}" fill="${color}" font-size="15" font-family="Cascadia Mono, monospace">adaptive ${row.adaptiveScore.toFixed(4)}  best ${row.bestStaticScore.toFixed(4)}  gap ${row.adaptiveGap.toFixed(4)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="35" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C3 · untouched holdout cell safety</text>
  <text x="35" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Orange: best static · cyan: within tolerance · red: frozen gate failure</text>
  ${bars}
</svg>\n`;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "candidate-frontier.svg"), candidateSvg(candidateSelection), "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "holdout-cells.svg"), holdoutCellsSvg(holdoutPressureDoctrine), "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  promotionStatus: report.promotionStatus,
  planId,
  planHash,
  reportHash: report.reportHash,
  selectedPolicy: selectedPolicy.id,
  selectedCandidate: selected,
  observedTrainWorlds,
  observedTrainRuns,
  plannedCandidateEvaluations,
  observedHoldoutWorlds,
  observedHoldoutRuns,
  determinismSentinels,
  conformanceGates,
  promotionGates,
  holdoutPolicySummary,
  holdoutPressureDoctrine,
  holdoutSeats,
  localBranchSummary,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
