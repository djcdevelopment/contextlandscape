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

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c6-full-envelope-replication");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c6-full-envelope-world-v1";
const PARENT_STAGE_C5_REPORT_HASH = "sha256:f1c12e3a12930dea0f32a40946305146ac1267d04bb860a9bcef361cdf477081";

const staticPolicies = [
  { id: "hold-pass", kind: "hold" },
  { id: "scout-peel-support", kind: "peel-support" },
  { id: "always-chaff", kind: "chaff" }
];
const ruleCandidates = [];
for (const holdMax of [0, 1, 2, 3]) {
  for (const chaffMin of [2, 3, 4, 5, 6]) {
    if (holdMax < chaffMin) {
      ruleCandidates.push({
        id: `hold-le-${holdMax}-chaff-ge-${chaffMin}`,
        holdMax,
        chaffMin
      });
    }
  }
}

const soundnessLevels = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
const couplingDefinitions = [
  { id: "binary", objectiveCoupling: "binary-front" },
  { id: "global", objectiveCoupling: "global" },
  { id: "distance", objectiveCoupling: "distance-weighted-front" }
];

function fullEnvelopePressureSamples() {
  return couplingDefinitions.flatMap((coupling) => soundnessLevels.map((soundnessRate) => ({
    id: `${coupling.id}-sound-${Math.round(soundnessRate * 100)}`,
    objectiveCoupling: coupling.objectiveCoupling,
    soundnessRate
  })));
}

const trainPressureSamples = fullEnvelopePressureSamples();
const holdoutPressureSamples = fullEnvelopePressureSamples();
const aimModes = ["cluster-center", "artifact-density", "far-objective"];
const holdoutCommandModes = ["local-verify"];
const trainSeeds = Array.from({ length: 8 }, (_, index) => 505_000 + index);
const holdoutSeeds = Array.from({ length: 8 }, (_, index) => 505_008 + index);
const orientations = ["focal-alpha", "focal-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c6-full-envelope-three-response-replication",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC5ReportHash: PARENT_STAGE_C5_REPORT_HASH,
  staticPolicies,
  ruleCandidates,
  publicPolicyContract: {
    confidenceThreshold: "hold-pass",
    localVerify: "use selected hold/peel/chaff thresholds for public objective coupling",
    lowConfidenceCutoff: 0.50,
    rule: "hold iff L <= holdMax; Chaff iff L >= chaffMin; otherwise Scout peel plus Support Scan",
    chaffCenter: "focal formation cluster",
    forbiddenInputs: ["soundness rate", "pressure id", "hostile aim mode", "latent truth", "focal seat", "split"]
  },
  selector: [
    "require all three response branches in coupling training worlds",
    "maximum minimum coupling pressure score",
    "maximum minimum coupling aim score",
    "maximum pooled coupling score",
    "minimum Chaff activation rate",
    "minimum peel activation rate",
    "lexical rule id"
  ],
  trainPressureSamples,
  holdoutPressureSamples,
  aimModes,
  trainCommandModes: ["local-verify"],
  holdoutCommandModes,
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
  cellTolerance: 0.075,
  seatTolerance: 0.05,
  couplingLocalTolerance: 0.05,
  minimumOffCenterRate: 0.10
};
const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c6-${planHash.slice(7, 23)}`;

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
const allPressureSamples = [...trainPressureSamples, ...holdoutPressureSamples];
const runtimeContexts = Object.fromEntries(allPressureSamples.map((pressure) => [pressure.id, runtimeContext(pressure)]));

function separation(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function targetCenter(playerId) {
  return playerId === "alpha" ? { x: 2, y: 2 } : { x: 7, y: 7 };
}

function scoutDestination(playerId) {
  return playerId === "alpha" ? { x: 0, y: 0 } : { x: 9, y: 9 };
}

function publicFeatures(projection, playerId) {
  const pending = projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  );
  return { lowTotal: pending.filter((artifact) => artifact.reportedConfidence < 0.50).length };
}

function ruleBranch(rule, features) {
  if (features.lowTotal <= rule.holdMax) return "hold";
  if (features.lowTotal >= rule.chaffMin) return "chaff";
  return "peel-support";
}

function adaptiveBranch(commandMode, objectiveCoupling, selectedRules, features) {
  if (commandMode === "confidence-threshold") return "hold";
  return ruleBranch(selectedRules[objectiveCoupling], features);
}

function branchPolicyId(branch) {
  if (branch === "hold") return "hold-pass";
  if (branch === "chaff") return "always-chaff";
  return "scout-peel-support";
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

function hostileTarget(projection, focalPlayerId, aimMode, cluster) {
  if (aimMode === "cluster-center") return cluster;
  const pending = projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === focalPlayerId && artifact.resolution === "pending"
  );
  if (pending.length === 0) return cluster;
  if (aimMode === "artifact-density") {
    const coordinates = [...new Map(pending.map((artifact) => [
      `${artifact.position.x},${artifact.position.y}`,
      artifact.position
    ])).values()];
    return coordinates.map((position) => {
      const zone = pending.filter((artifact) => separation(artifact.position, position) <= 1);
      return {
        position,
        count: zone.length,
        objectiveCount: zone.filter((artifact) => artifact.objectiveEligible).length,
        confidenceSum: zone.reduce((sum, artifact) => sum + artifact.reportedConfidence, 0)
      };
    }).sort((left, right) =>
      right.count - left.count ||
      right.objectiveCount - left.objectiveCount ||
      right.confidenceSum - left.confidenceSum ||
      left.position.x - right.position.x ||
      left.position.y - right.position.y
    )[0].position;
  }
  const objective = pending.filter((artifact) => artifact.objectiveEligible);
  const candidates = objective.length > 0 ? objective : pending;
  return candidates.slice().sort((left, right) =>
    separation(right.position, cluster) - separation(left.position, cluster) ||
    left.reportedConfidence - right.reportedConfidence ||
    left.position.x - right.position.x ||
    left.position.y - right.position.y ||
    left.artifactId.localeCompare(right.artifactId)
  )[0].position;
}

function focalController(playerId, policy, commandMode, objectiveCoupling, cluster, telemetry) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      telemetry.features = publicFeatures(projection, playerId);
      telemetry.branch = policy.kind === "adaptive"
        ? adaptiveBranch(commandMode, objectiveCoupling, policy.selectedRules, telemetry.features)
        : policy.kind;
      return telemetry.branch === "chaff"
        ? { kind: "fire-artillery", playerId, shell: "chaff", center: cluster }
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

function aggressorController(playerId, focalPlayerId, commandMode, aimMode, cluster, telemetry) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      telemetry.target = hostileTarget(projection, focalPlayerId, aimMode, cluster);
      telemetry.targetOffset = separation(telemetry.target, cluster);
      return { kind: "fire-artillery", playerId, shell: "flare", center: telemetry.target };
    },
    movement: () => [],
    claim: () => ({ kind: "pass-capacity", playerId }),
    command: (projection) => commandDecision(projection, playerId, commandMode),
    maxCommandActions: 64
  };
}

function runPolicy({ split, policy, pressure, aimMode, commandMode, seed, orientation }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const aggressorPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const cluster = targetCenter(focalPlayerId);
  const streamId = `${WORLD_STREAM_NAMESPACE}:${split}:${pressure.id}:${aimMode}:${commandMode}:${seed}:${orientation}`;
  const focalTelemetry = { features: null, branch: null };
  const aimTelemetry = { target: null, targetOffset: null };
  const match = createAttentionMatch({
    matchId: `${planId}:${split}:${pressure.id}:${aimMode}:${commandMode}:${seed}:${orientation}:${policy.id}`,
    seed,
    randomStreamId: streamId,
    context: runtimeContexts[pressure.id],
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
  const result = runAttentionMatch(match, {
    [focalPlayerId]: focalController(
      focalPlayerId,
      policy,
      commandMode,
      pressure.objectiveCoupling,
      cluster,
      focalTelemetry
    ),
    [aggressorPlayerId]: aggressorController(
      aggressorPlayerId,
      focalPlayerId,
      commandMode,
      aimMode,
      cluster,
      aimTelemetry
    )
  }, { traceMode: "hash" });
  return { result, focalPlayerId, aggressorPlayerId, streamId, focalTelemetry, aimTelemetry };
}

function scoreFor(result, playerId) {
  if (result.match.state.winnerPlayerId === null) return 0.5;
  return result.match.state.winnerPlayerId === playerId ? 1 : 0;
}

const metricNames = [
  "score", "progress", "drift", "rounds", "movement", "supportScans",
  "supportVerifications", "autoAcceptedBeyondReach", "chaffFired",
  "hostileShellsBlocked", "flareAffectedArtifacts", "lowTotal", "targetOffset",
  "holdBranch", "peelBranch"
];

function metrics(run) {
  const { result, focalPlayerId, aggressorPlayerId, focalTelemetry, aimTelemetry } = run;
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
    lowTotal: focalTelemetry.features.lowTotal,
    targetOffset: aimTelemetry.targetOffset,
    holdBranch: focalTelemetry.branch === "hold" ? 1 : 0,
    peelBranch: focalTelemetry.branch === "peel-support" ? 1 : 0
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
let targetParityFailures = 0;
let policyMappingFailures = 0;
let branchMetricParityFailures = 0;
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
  const commandMode = "local-verify";
  for (const pressure of trainPressureSamples) {
    for (const aimMode of aimModes) {
      for (const seed of trainSeeds) {
        for (const orientation of orientations) {
          const runs = staticPolicies.map((policy) => ({
            policy,
            run: runPolicy({ split: "train", policy, pressure, aimMode, commandMode, seed, orientation })
          }));
          observedTrainWorlds += 1;
          observedTrainRuns += runs.length;
          if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) commonStreamFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.focalTelemetry.features))).size !== 1) featureParityFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.aimTelemetry.target))).size !== 1) targetParityFailures += 1;
          const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
          trainingWorlds.push({
            pressure: pressure.id,
            objectiveCoupling: pressure.objectiveCoupling,
            aimMode,
            seed,
            focalSeat: runs[0].run.focalPlayerId,
            features: runs[0].run.focalTelemetry.features,
            outcomes: measured
          });
          for (const { policy, run } of runs) auditRun(run);
          if (seed === trainSeeds[0] && orientation === orientations[0]) {
            for (const { policy, run } of runs) {
              const replay = runPolicy({ split: "train", policy, pressure, aimMode, commandMode, seed, orientation });
              determinismSentinels += 1;
              if (replay.result.traceHash !== run.result.traceHash ||
                JSON.stringify(replay.result.match.state) !== JSON.stringify(run.result.match.state) ||
                JSON.stringify(replay.focalTelemetry) !== JSON.stringify(run.focalTelemetry) ||
                JSON.stringify(replay.aimTelemetry) !== JSON.stringify(run.aimTelemetry)) determinismFailures += 1;
            }
          }
        }
      }
    }
  }
}

function rankRules(rows) {
  return rows.slice().sort((left, right) =>
    Number(right.eligible) - Number(left.eligible) ||
    right.minimumPressureScore - left.minimumPressureScore ||
    right.minimumAimScore - left.minimumAimScore ||
    right.pooledScore - left.pooledScore ||
    left.chaffRate - right.chaffRate ||
    left.peelRate - right.peelRate ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

executeTraining();

const selectionByCoupling = {};
const selectedRules = {};
let selectorReproduction = true;
for (const objectiveCoupling of ["binary-front", "global", "distance-weighted-front"]) {
  const couplingWorlds = trainingWorlds.filter((world) => world.objectiveCoupling === objectiveCoupling);
  const pressureIds = trainPressureSamples.filter((pressure) => pressure.objectiveCoupling === objectiveCoupling).map((pressure) => pressure.id);
  const rows = ruleCandidates.map((rule) => {
    const evaluated = couplingWorlds.map((world) => {
      const branch = ruleBranch(rule, world.features);
      return { ...world, branch, score: world.outcomes[branchPolicyId(branch)].score };
    });
    const meanScore = (subset) => subset.reduce((sum, world) => sum + world.score, 0) / subset.length;
    const pressureScores = Object.fromEntries(pressureIds.map((pressure) => [
      pressure,
      meanScore(evaluated.filter((world) => world.pressure === pressure))
    ]));
    const aimScores = Object.fromEntries(aimModes.map((aimMode) => [
      aimMode,
      meanScore(evaluated.filter((world) => world.aimMode === aimMode))
    ]));
    const branchCounts = Object.fromEntries(["hold", "peel-support", "chaff"].map((branch) => [
      branch,
      evaluated.filter((world) => world.branch === branch).length
    ]));
    return {
      ruleId: rule.id,
      rule,
      eligible: Object.values(branchCounts).every((count) => count > 0),
      minimumPressureScore: Math.min(...Object.values(pressureScores)),
      minimumAimScore: Math.min(...Object.values(aimScores)),
      pooledScore: meanScore(evaluated),
      chaffRate: branchCounts.chaff / evaluated.length,
      peelRate: branchCounts["peel-support"] / evaluated.length,
      holdRate: branchCounts.hold / evaluated.length,
      pressureScores,
      aimScores,
      branchCounts
    };
  });
  const ranked = rankRules(rows);
  if (!ranked[0]?.eligible) throw new Error(`No three-branch eligible rule for ${objectiveCoupling}`);
  selectionByCoupling[objectiveCoupling] = ranked;
  selectedRules[objectiveCoupling] = ranked[0].rule;
  selectorReproduction &&= JSON.stringify(ranked.map((row) => row.ruleId)) ===
    JSON.stringify(rankRules(ranked).map((row) => row.ruleId));
}

const adaptivePolicy = {
  id: `three-response-${digest(selectedRules).slice(7, 19)}`,
  kind: "adaptive",
  selectedRules
};
const holdoutPolicies = [...staticPolicies, adaptivePolicy];

function executeHoldout() {
  for (const pressure of holdoutPressureSamples) {
    for (const aimMode of aimModes) {
      for (const commandMode of holdoutCommandModes) {
        for (const seed of holdoutSeeds) {
          for (const orientation of orientations) {
            const runs = holdoutPolicies.map((policy) => ({
              policy,
              run: runPolicy({ split: "holdout", policy, pressure, aimMode, commandMode, seed, orientation })
            }));
            observedHoldoutWorlds += 1;
            observedHoldoutRuns += runs.length;
            if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) commonStreamFailures += 1;
            if (new Set(runs.map(({ run }) => JSON.stringify(run.focalTelemetry.features))).size !== 1) featureParityFailures += 1;
            if (new Set(runs.map(({ run }) => JSON.stringify(run.aimTelemetry.target))).size !== 1) targetParityFailures += 1;
            const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
            const adaptiveRun = runs.find(({ policy }) => policy.id === adaptivePolicy.id).run;
            const expectedBranch = adaptiveBranch(
              commandMode,
              pressure.objectiveCoupling,
              selectedRules,
              adaptiveRun.focalTelemetry.features
            );
            if (adaptiveRun.focalTelemetry.branch !== expectedBranch) policyMappingFailures += 1;
            if (JSON.stringify(measured[adaptivePolicy.id]) !== JSON.stringify(measured[branchPolicyId(expectedBranch)])) {
              branchMetricParityFailures += 1;
            }
            holdoutWorlds.push({
              pressure: pressure.id,
              objectiveCoupling: pressure.objectiveCoupling,
              aimMode,
              commandMode,
              seed,
              focalSeat: adaptiveRun.focalPlayerId,
              branch: expectedBranch,
              targetOffset: adaptiveRun.aimTelemetry.targetOffset
            });
            for (const { policy, run } of runs) {
              addCell(
                cells,
                `holdout|${policy.id}|${pressure.id}|${aimMode}|${commandMode}|${run.focalPlayerId}`,
                {
                  split: "holdout",
                  policy: policy.id,
                  pressure: pressure.id,
                  objectiveCoupling: pressure.objectiveCoupling,
                  aimMode,
                  commandMode,
                  focalSeat: run.focalPlayerId
                },
                measured[policy.id]
              );
              auditRun(run);
            }
            if (seed === holdoutSeeds[0] && orientation === orientations[0]) {
              for (const { policy, run } of runs) {
                const replay = runPolicy({ split: "holdout", policy, pressure, aimMode, commandMode, seed, orientation });
                determinismSentinels += 1;
                if (replay.result.traceHash !== run.result.traceHash ||
                  JSON.stringify(replay.result.match.state) !== JSON.stringify(run.result.match.state) ||
                  JSON.stringify(replay.focalTelemetry) !== JSON.stringify(run.focalTelemetry) ||
                  JSON.stringify(replay.aimTelemetry) !== JSON.stringify(run.aimTelemetry)) determinismFailures += 1;
              }
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
  objectiveCoupling: cell.objectiveCoupling,
  aimMode: cell.aimMode,
  commandMode: cell.commandMode,
  focalSeat: cell.focalSeat,
  runs: cell.runs,
  mean: meanMetrics(cell.sums, cell.runs)
}));

const holdoutPolicySummary = holdoutPolicies.map((policy) => ({
  policy: policy.id,
  ...aggregateRows(finalizedCells.filter((cell) => cell.policy === policy.id))
}));
const byPolicy = Object.fromEntries(holdoutPolicySummary.map((row) => [row.policy, row]));
const adaptiveSummary = byPolicy[adaptivePolicy.id];
const bestStaticSummary = staticPolicies.map((policy) => byPolicy[policy.id])
  .sort((left, right) => right.mean.score - left.mean.score || left.policy.localeCompare(right.policy))[0];

function groupComparison(groupKeys, predicate = () => true) {
  const groups = new Map();
  for (const cell of finalizedCells.filter(predicate)) {
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
      adaptiveScore: scores[adaptivePolicy.id],
      adaptiveGap: scores[adaptivePolicy.id] - bestStaticScore
    };
  });
}

const couplingAimDoctrine = groupComparison(["objectiveCoupling", "aimMode", "commandMode"]);
const pressureDoctrine = groupComparison(["pressure", "commandMode"]);
const seatComparison = groupComparison(["focalSeat"]);
const aimComparison = groupComparison(["aimMode"]);
const couplingLocal = groupComparison(
  ["objectiveCoupling"],
  (cell) => cell.commandMode === "local-verify"
);
const aimTargetSummary = aimModes.map((aimMode) => {
  const selectedWorlds = holdoutWorlds.filter((world) => world.aimMode === aimMode);
  return {
    aimMode,
    worlds: selectedWorlds.length,
    meanOffset: selectedWorlds.reduce((sum, world) => sum + world.targetOffset, 0) / selectedWorlds.length,
    beyondChaffRate: selectedWorlds.filter((world) => world.targetOffset > 1).length / selectedWorlds.length
  };
});
const holdoutBranchSummary = ["binary-front", "global", "distance-weighted-front"].map((objectiveCoupling) => {
  const selectedWorlds = holdoutWorlds.filter((world) =>
    world.objectiveCoupling === objectiveCoupling && world.commandMode === "local-verify"
  );
  return {
    objectiveCoupling,
    worlds: selectedWorlds.length,
    holdRate: selectedWorlds.filter((world) => world.branch === "hold").length / selectedWorlds.length,
    peelRate: selectedWorlds.filter((world) => world.branch === "peel-support").length / selectedWorlds.length,
    chaffRate: selectedWorlds.filter((world) => world.branch === "chaff").length / selectedWorlds.length
  };
});

const plannedTrainWorlds = trainPressureSamples.length * aimModes.length * trainSeeds.length * orientations.length;
const plannedTrainRuns = plannedTrainWorlds * staticPolicies.length;
const plannedCandidateEvaluations = plannedTrainWorlds * ruleCandidates.length;
const plannedHoldoutWorlds = holdoutPressureSamples.length * aimModes.length * holdoutCommandModes.length * holdoutSeeds.length * orientations.length;
const plannedHoldoutRuns = plannedHoldoutWorlds * holdoutPolicies.length;
const expectedSentinels = trainPressureSamples.length * aimModes.length * staticPolicies.length +
  holdoutPressureSamples.length * aimModes.length * holdoutCommandModes.length * holdoutPolicies.length;

const selectedTrainingRows = Object.fromEntries(Object.entries(selectionByCoupling).map(([coupling, rows]) => [coupling, rows[0]]));
const conformanceGates = {
  exactTrainCounts: observedTrainWorlds === plannedTrainWorlds && observedTrainRuns === plannedTrainRuns,
  exactCandidateEvaluationCount: plannedCandidateEvaluations === trainingWorlds.length * ruleCandidates.length,
  exactHoldoutCounts: observedHoldoutWorlds === plannedHoldoutWorlds && observedHoldoutRuns === plannedHoldoutRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamBlocks: commonStreamFailures === 0,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  publicFeatureParity: featureParityFailures === 0,
  hostileTargetParity: targetParityFailures === 0,
  selectorsReproduce: selectorReproduction,
  selectedAllBranchesTrain: Object.values(selectedTrainingRows).every((row) => row.eligible),
  selectedAllBranchesHoldout: holdoutBranchSummary.every((row) => row.holdRate > 0 && row.peelRate > 0 && row.chaffRate > 0),
  policyMappingExact: policyMappingFailures === 0,
  actualBranchMetricParity: branchMetricParityFailures === 0,
  artifactDensityReachesOffCenter: aimTargetSummary.find((row) => row.aimMode === "artifact-density").beyondChaffRate >= planDefinition.minimumOffCenterRate,
  farObjectiveReachesOffCenter: aimTargetSummary.find((row) => row.aimMode === "far-objective").beyondChaffRate >= planDefinition.minimumOffCenterRate
};

const promotionGates = {
  pooledAtLeastBestStatic: adaptiveSummary.mean.score >= bestStaticSummary.mean.score,
  couplingAimDoctrineWithinTolerance: couplingAimDoctrine.every((row) => row.adaptiveGap >= -planDefinition.cellTolerance),
  pressureDoctrineWithinTolerance: pressureDoctrine.every((row) => row.adaptiveGap >= -planDefinition.cellTolerance),
  bothSeatsWithinTolerance: seatComparison.every((row) => row.adaptiveGap >= -planDefinition.seatTolerance),
  everyAimWithinTolerance: aimComparison.every((row) => row.adaptiveGap >= -planDefinition.cellTolerance),
  couplingLocalWithinTolerance: couplingLocal.every((row) => row.adaptiveGap >= -planDefinition.couplingLocalTolerance)
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c6-full-envelope-replication-report",
  status: Object.values(conformanceGates).every(Boolean) ? "pass" : "fail",
  promotionStatus: Object.values(promotionGates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC5ReportHash: PARENT_STAGE_C5_REPORT_HASH,
  planId,
  planHash,
  selectedPolicy: adaptivePolicy.id,
  selectedRules,
  selectedTrainingRows,
  plannedTrainWorlds,
  observedTrainWorlds,
  plannedTrainRuns,
  observedTrainRuns,
  plannedCandidateEvaluations,
  plannedReplicationWorlds: plannedHoldoutWorlds,
  observedReplicationWorlds: observedHoldoutWorlds,
  plannedReplicationRuns: plannedHoldoutRuns,
  observedReplicationRuns: observedHoldoutRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  featureParityFailures,
  targetParityFailures,
  policyMappingFailures,
  branchMetricParityFailures,
  conformanceGates,
  promotionGates,
  selectionByCoupling,
  replicationPolicySummary: holdoutPolicySummary,
  bestStaticPolicy: bestStaticSummary.policy,
  couplingAimDoctrine,
  pressureDoctrine,
  seatComparison,
  aimComparison,
  couplingLocal,
  aimTargetSummary,
  replicationBranchSummary: holdoutBranchSummary,
  cells: finalizedCells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const selectedTable = Object.entries(selectedTrainingRows).map(([coupling, row]) =>
  `| ${coupling} | ${row.ruleId} | ${row.minimumPressureScore.toFixed(4)} | ${row.minimumAimScore.toFixed(4)} | ${row.pooledScore.toFixed(4)} | ${(row.holdRate * 100).toFixed(1)}% | ${(row.peelRate * 100).toFixed(1)}% | ${(row.chaffRate * 100).toFixed(1)}% |`
).join("\n");
const policyTable = holdoutPolicySummary.map((row) =>
  `| ${row.policy} | ${row.mean.score.toFixed(4)} | ${row.mean.progress.toFixed(3)} | ${row.mean.drift.toFixed(3)} | ${(row.mean.holdBranch * 100).toFixed(1)}% | ${(row.mean.peelBranch * 100).toFixed(1)}% | ${(row.mean.chaffFired * 100).toFixed(1)}% |`
).join("\n");
const branchTable = holdoutBranchSummary.map((row) =>
  `| ${row.objectiveCoupling} | ${(row.holdRate * 100).toFixed(1)}% | ${(row.peelRate * 100).toFixed(1)}% | ${(row.chaffRate * 100).toFixed(1)}% |`
).join("\n");
const aimTable = aimComparison.map((row) => {
  const target = aimTargetSummary.find((candidate) => candidate.aimMode === row.aimMode);
  return `| ${row.aimMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} | ${(target.beyondChaffRate * 100).toFixed(1)}% |`;
}).join("\n");
const pressureTable = pressureDoctrine.map((row) =>
  `| ${row.pressure} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");
const couplingTable = couplingAimDoctrine.map((row) =>
  `| ${row.objectiveCoupling} | ${row.aimMode} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");

const assessment = `# Attention v3 Stage-C6 full-envelope three-response replication\n\n` +
  `Conformance: **${report.status.toUpperCase()}**  \n` +
  `Replication feasibility: **${report.promotionStatus.toUpperCase()}**  \n` +
  `Selected policy: \`${adaptivePolicy.id}\`  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-C5 report: \`${PARENT_STAGE_C5_REPORT_HASH}\`\n\n` +
  `Training executed ${observedTrainWorlds.toLocaleString("en-US")} worlds / ${observedTrainRuns.toLocaleString("en-US")} matches and ${plannedCandidateEvaluations.toLocaleString("en-US")} exact candidate-world lookups across the complete soundness envelope. The selected combined policy then ran on ${observedHoldoutWorlds.toLocaleString("en-US")} fresh-seed replication worlds / ${observedHoldoutRuns.toLocaleString("en-US")} actual matches over the same envelope.\n\n` +
  `## Conformance gates\n\n${Object.entries(conformanceGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Replication gates\n\n${Object.entries(promotionGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Selected training rules\n\n| Coupling | Rule | Minimum pressure | Minimum aim | Pooled | Hold | Peel | Chaff |\n|---|---|---:|---:|---:|---:|---:|---:|\n${selectedTable}\n\n` +
  `## Fresh-seed replication\n\n| Policy | Score | Progress | Drift | Hold | Peel | Chaff |\n|---|---:|---:|---:|---:|---:|---:|\n${policyTable}\n\n` +
  `## Local-verification branch mix\n\n| Coupling | Hold | Peel + Support | Chaff |\n|---|---:|---:|---:|\n${branchTable}\n\n` +
  `## Hostile aim robustness\n\n| Aim | Adaptive | Best static | Gap | Beyond Chaff center |\n|---|---:|---:|---:|---:|\n${aimTable}\n\n` +
  `## Full-envelope pressure x doctrine\n\n| Pressure | Doctrine | Adaptive | Best static | Gap |\n|---|---|---:|---:|---:|\n${pressureTable}\n\n` +
  `## Coupling x aim x doctrine\n\n| Coupling | Aim | Doctrine | Adaptive | Best static | Gap |\n|---|---|---|---:|---:|---:|\n${couplingTable}\n\n` +
  `## Assessment\n\n` +
  `- The combined response scored ${adaptiveSummary.mean.score.toFixed(4)} versus ${bestStaticSummary.mean.score.toFixed(4)} for the best pooled static control (\`${bestStaticSummary.policy}\`), a delta of ${(adaptiveSummary.mean.score - bestStaticSummary.mean.score).toFixed(4)}.\n` +
  `- The worst coupling x aim x doctrine gap was ${Math.min(...couplingAimDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}; the worst full-envelope pressure x doctrine gap was ${Math.min(...pressureDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}.\n` +
  `- Every coupling exercised hold, peel, and Chaff on both training and fresh-seed replication worlds.\n` +
  `- The frozen feasibility gates ${report.promotionStatus === "pass" ? "all passed" : "did not all pass"}; detailed interpretation is intentionally deferred until the evidence-review pass.\n` +
  `- The adaptive branch function did not receive soundness rate, pressure ID, aim mode, latent truth, focal seat, or split.\n` +
  `- Promotion status applies only to this combined response under the frozen matrix.\n\n` +
  `## Boundary\n\nThis run decides only full-envelope feasibility for the frozen single-round, public low-count threshold family. It does not authorize full model promotion, new shells, reloads, cooldowns, or counter-battery.\n`;

function thresholdsSvg(rows) {
  const width = 1320;
  const height = 520;
  const actions = ["hold", "peel", "chaff"];
  const colors = { hold: "#5ab4ff", peel: "#8b7cff", chaff: "#35f2d0" };
  const body = Object.entries(rows).map(([coupling, row], index) => {
    const y = 150 + index * 108;
    const cells = Array.from({ length: 7 }, (_, lowTotal) => {
      const action = ruleBranch(row.rule, { lowTotal });
      const label = action === "peel-support" ? "peel" : action;
      return `<rect x="${430 + lowTotal * 92}" y="${y - 29}" width="78" height="46" rx="7" fill="${colors[label]}"/><text x="${469 + lowTotal * 92}" y="${y}" text-anchor="middle" fill="#07121e" font-size="14" font-weight="700" font-family="Segoe UI, sans-serif">${label}</text>`;
    }).join("\n");
    return `<text x="38" y="${y}" fill="#f4f7ff" font-size="18" font-family="Segoe UI, sans-serif">${coupling}</text><text x="250" y="${y}" fill="#a9b6d3" font-size="14" font-family="Cascadia Mono, monospace">${row.ruleId}</text>${cells}`;
  }).join("\n");
  const ticks = Array.from({ length: 7 }, (_, value) => `<text x="${469 + value * 92}" y="105" text-anchor="middle" fill="#94a3c7" font-size="15" font-family="Cascadia Mono, monospace">L=${value}</text>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="38" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C6 · selected full-envelope thresholds</text>
  <text x="38" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Action by public count L of pending artifacts below 0.50 confidence</text>
  ${ticks}${body}
</svg>\n`;
}

function atlasSvg(rows) {
  const width = 1460;
  const height = 1650;
  const bars = rows.map((row, index) => {
    const y = 135 + index * 61;
    const adaptiveWidth = row.adaptiveScore * 520;
    const staticWidth = row.bestStaticScore * 520;
    const color = row.adaptiveGap >= -planDefinition.cellTolerance ? "#35f2d0" : "#ff6b7a";
    return `<text x="32" y="${y + 7}" fill="#f4f7ff" font-size="13" font-family="Cascadia Mono, monospace">${row.pressure} / ${row.commandMode}</text>\n` +
      `<rect x="520" y="${y - 16}" width="${staticWidth}" height="15" rx="4" fill="#ff9f43"/>\n` +
      `<rect x="520" y="${y + 4}" width="${adaptiveWidth}" height="15" rx="4" fill="${color}"/>\n` +
      `<text x="1090" y="${y + 7}" fill="${color}" font-size="14" font-family="Cascadia Mono, monospace">adaptive ${row.adaptiveScore.toFixed(4)}  best ${row.bestStaticScore.toFixed(4)}  gap ${row.adaptiveGap.toFixed(4)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="32" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C6 - full-envelope replication atlas</text>
  <text x="32" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Orange: best static | cyan: within 0.075 | red: frozen replication failure</text>
  ${bars}
</svg>\n`;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "selected-thresholds.svg"), thresholdsSvg(selectedTrainingRows), "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "replication-atlas.svg"), atlasSvg(pressureDoctrine), "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  promotionStatus: report.promotionStatus,
  planId,
  planHash,
  reportHash: report.reportHash,
  selectedPolicy: adaptivePolicy.id,
  selectedRules,
  selectedTrainingRows,
  observedTrainWorlds,
  observedTrainRuns,
  plannedCandidateEvaluations,
  observedHoldoutWorlds,
  observedHoldoutRuns,
  determinismSentinels,
  conformanceGates,
  promotionGates,
  holdoutPolicySummary,
  holdoutBranchSummary,
  aimComparison,
  couplingAimDoctrine,
  pressureDoctrine,
  seatComparison,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
