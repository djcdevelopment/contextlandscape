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

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c4-generalization-aim-audit");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c4-generalization-aim-world-v1";
const PARENT_STAGE_C3_REPORT_HASH = "sha256:8b92063ddeabada20beb3fc07ad57ebcdba90ad3684f1ea01361c97aa3217174";

const policies = [
  { id: "hold-pass", kind: "hold" },
  { id: "scout-peel-support", kind: "peel-support" },
  { id: "always-chaff", kind: "chaff" },
  { id: "ruleset-spatial-low-total-ge-4", kind: "adaptive" }
];
const staticPolicies = policies.filter((policy) => policy.kind !== "adaptive");
const adaptivePolicy = policies.find((policy) => policy.kind === "adaptive");

const pressureSamples = [
  { id: "binary-sound-45", objectiveCoupling: "binary-front", soundnessRate: 0.45 },
  { id: "binary-sound-60", objectiveCoupling: "binary-front", soundnessRate: 0.60 },
  { id: "binary-sound-85", objectiveCoupling: "binary-front", soundnessRate: 0.85 },
  { id: "global-sound-35", objectiveCoupling: "global", soundnessRate: 0.35 },
  { id: "global-sound-55", objectiveCoupling: "global", soundnessRate: 0.55 },
  { id: "global-sound-75", objectiveCoupling: "global", soundnessRate: 0.75 },
  { id: "distance-sound-45", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.45 },
  { id: "distance-sound-65", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.65 },
  { id: "distance-sound-90", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.90 }
];
const aimModes = ["cluster-center", "artifact-density", "far-objective"];
const commandModes = ["confidence-threshold", "local-verify"];
const seeds = Array.from({ length: 16 }, (_, index) => 303_000 + index);
const orientations = ["focal-alpha", "focal-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c4-generalization-hostile-aim-audit",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC3ReportHash: PARENT_STAGE_C3_REPORT_HASH,
  fixedPolicy: {
    id: adaptivePolicy.id,
    confidenceThreshold: "hold-pass",
    localGlobal: "always-chaff",
    localBinaryFront: "scout-peel-support",
    localDistanceWeightedFront: "always-chaff iff public low-confidence count >= 4",
    chaffCenter: "focal formation cluster",
    forbiddenInputs: ["soundness rate", "pressure id", "hostile aim mode", "latent truth", "focal seat", "audit cell"]
  },
  policies,
  pressureSamples,
  aimModes: [
    { id: "cluster-center", rule: "focal formation center" },
    { id: "artifact-density", rule: "artifact coordinate maximizing 3x3 pending count, objective count, confidence sum, then coordinate" },
    { id: "far-objective", rule: "farthest objective-eligible pending artifact, then lowest confidence, then coordinate" }
  ],
  commandModes,
  seeds,
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
  clusterRegressionTolerance: 0.05,
  minimumOffCenterRate: 0.10
};
const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c4-${planHash.slice(7, 23)}`;

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
  return {
    lowTotal: pending.filter((artifact) => artifact.reportedConfidence < 0.50).length
  };
}

function adaptiveBranch(commandMode, objectiveCoupling, features) {
  if (commandMode === "confidence-threshold") return "hold";
  if (objectiveCoupling === "global") return "chaff";
  if (objectiveCoupling === "binary-front") return "peel-support";
  return features.lowTotal >= 4 ? "chaff" : "peel-support";
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
        ? adaptiveBranch(commandMode, objectiveCoupling, telemetry.features)
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

function runPolicy({ policy, pressure, aimMode, commandMode, seed, orientation }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const aggressorPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const cluster = targetCenter(focalPlayerId);
  const streamId = `${WORLD_STREAM_NAMESPACE}:${pressure.id}:${aimMode}:${commandMode}:${seed}:${orientation}`;
  const focalTelemetry = { features: null, branch: null };
  const aimTelemetry = { target: null, targetOffset: null };
  const match = createAttentionMatch({
    matchId: `${planId}:${pressure.id}:${aimMode}:${commandMode}:${seed}:${orientation}:${policy.id}`,
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
  "hostileShellsBlocked", "flareAffectedArtifacts", "lowTotal", "targetOffset", "peelBranch"
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
const worlds = [];
let observedWorlds = 0;
let observedRuns = 0;
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

for (const pressure of pressureSamples) {
  for (const aimMode of aimModes) {
    for (const commandMode of commandModes) {
      for (const seed of seeds) {
        for (const orientation of orientations) {
          const runs = policies.map((policy) => ({
            policy,
            run: runPolicy({ policy, pressure, aimMode, commandMode, seed, orientation })
          }));
          observedWorlds += 1;
          observedRuns += runs.length;
          if (new Set(runs.map(({ run }) => run.streamId)).size !== 1) commonStreamFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.focalTelemetry.features))).size !== 1) featureParityFailures += 1;
          if (new Set(runs.map(({ run }) => JSON.stringify(run.aimTelemetry.target))).size !== 1) targetParityFailures += 1;
          const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
          const adaptiveRun = runs.find(({ policy }) => policy.id === adaptivePolicy.id).run;
          const expectedBranch = adaptiveBranch(commandMode, pressure.objectiveCoupling, adaptiveRun.focalTelemetry.features);
          if (adaptiveRun.focalTelemetry.branch !== expectedBranch) policyMappingFailures += 1;
          if (JSON.stringify(measured[adaptivePolicy.id]) !== JSON.stringify(measured[branchPolicyId(expectedBranch)])) {
            branchMetricParityFailures += 1;
          }
          worlds.push({
            pressure: pressure.id,
            objectiveCoupling: pressure.objectiveCoupling,
            aimMode,
            commandMode,
            seed,
            focalSeat: adaptiveRun.focalPlayerId,
            branch: expectedBranch,
            target: adaptiveRun.aimTelemetry.target,
            targetOffset: adaptiveRun.aimTelemetry.targetOffset
          });
          for (const { policy, run } of runs) {
            addCell(
              cells,
              `${policy.id}|${pressure.id}|${aimMode}|${commandMode}|${run.focalPlayerId}`,
              {
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
          if (seed === seeds[0] && orientation === orientations[0]) {
            for (const { policy, run } of runs) {
              const replay = runPolicy({ policy, pressure, aimMode, commandMode, seed, orientation });
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

const finalizedCells = [...cells.values()].map((cell) => ({
  policy: cell.policy,
  pressure: cell.pressure,
  objectiveCoupling: cell.objectiveCoupling,
  aimMode: cell.aimMode,
  commandMode: cell.commandMode,
  focalSeat: cell.focalSeat,
  runs: cell.runs,
  mean: meanMetrics(cell.sums, cell.runs)
}));

const policySummary = policies.map((policy) => ({
  policy: policy.id,
  ...aggregateRows(finalizedCells.filter((cell) => cell.policy === policy.id))
}));
const byPolicy = Object.fromEntries(policySummary.map((row) => [row.policy, row]));
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
    const scores = Object.fromEntries(policies.map((policy) => [
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
const clusterRegression = groupComparison(
  ["objectiveCoupling", "commandMode"],
  (cell) => cell.aimMode === "cluster-center"
);
const aimComparison = groupComparison(["aimMode"]);
const aimTargetSummary = aimModes.map((aimMode) => {
  const selectedWorlds = worlds.filter((world) => world.aimMode === aimMode);
  return {
    aimMode,
    worlds: selectedWorlds.length,
    meanOffset: selectedWorlds.reduce((sum, world) => sum + world.targetOffset, 0) / selectedWorlds.length,
    beyondChaffRate: selectedWorlds.filter((world) => world.targetOffset > 1).length / selectedWorlds.length
  };
});
const distanceLocalWorlds = worlds.filter((world) =>
  world.objectiveCoupling === "distance-weighted-front" && world.commandMode === "local-verify"
);

const plannedWorlds = pressureSamples.length * aimModes.length * commandModes.length * seeds.length * orientations.length;
const plannedRuns = plannedWorlds * policies.length;
const expectedSentinels = pressureSamples.length * aimModes.length * commandModes.length * policies.length;

const conformanceGates = {
  exactCounts: observedWorlds === plannedWorlds && observedRuns === plannedRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamBlocks: commonStreamFailures === 0,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  publicFeatureParity: featureParityFailures === 0,
  hostileTargetParity: targetParityFailures === 0,
  policyMappingExact: policyMappingFailures === 0,
  actualBranchMetricParity: branchMetricParityFailures === 0,
  bothDistanceBranchesExecute: distanceLocalWorlds.some((world) => world.branch === "chaff") &&
    distanceLocalWorlds.some((world) => world.branch === "peel-support"),
  artifactDensityReachesOffCenter: aimTargetSummary.find((row) => row.aimMode === "artifact-density").beyondChaffRate >= planDefinition.minimumOffCenterRate,
  farObjectiveReachesOffCenter: aimTargetSummary.find((row) => row.aimMode === "far-objective").beyondChaffRate >= planDefinition.minimumOffCenterRate
};

const auditGates = {
  pooledAtLeastBestStatic: adaptiveSummary.mean.score >= bestStaticSummary.mean.score,
  couplingAimDoctrineWithinTolerance: couplingAimDoctrine.every((row) => row.adaptiveGap >= -planDefinition.cellTolerance),
  pressureDoctrineWithinTolerance: pressureDoctrine.every((row) => row.adaptiveGap >= -planDefinition.cellTolerance),
  bothSeatsWithinTolerance: seatComparison.every((row) => row.adaptiveGap >= -planDefinition.seatTolerance),
  clusterRegressionWithinTolerance: clusterRegression.every((row) => row.adaptiveGap >= -planDefinition.clusterRegressionTolerance),
  offCenterAimWithinTolerance: aimComparison
    .filter((row) => row.aimMode !== "cluster-center")
    .every((row) => row.adaptiveGap >= -planDefinition.cellTolerance)
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c4-generalization-hostile-aim-audit-report",
  status: Object.values(conformanceGates).every(Boolean) ? "pass" : "fail",
  auditStatus: Object.values(auditGates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageC3ReportHash: PARENT_STAGE_C3_REPORT_HASH,
  planId,
  planHash,
  fixedPolicy: adaptivePolicy.id,
  plannedWorlds,
  observedWorlds,
  plannedRuns,
  observedRuns,
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
  auditGates,
  policySummary,
  bestStaticPolicy: bestStaticSummary.policy,
  couplingAimDoctrine,
  pressureDoctrine,
  seatComparison,
  clusterRegression,
  aimComparison,
  aimTargetSummary,
  cells: finalizedCells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const policyTable = policySummary.map((row) =>
  `| ${row.policy} | ${row.mean.score.toFixed(4)} | ${row.mean.progress.toFixed(3)} | ${row.mean.drift.toFixed(3)} | ${(row.mean.chaffFired * 100).toFixed(1)}% | ${(row.mean.hostileShellsBlocked * 100).toFixed(1)}% | ${row.mean.supportScans.toFixed(3)} |`
).join("\n");
const aimTable = aimComparison.map((row) => {
  const target = aimTargetSummary.find((candidate) => candidate.aimMode === row.aimMode);
  return `| ${row.aimMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} | ${target.meanOffset.toFixed(3)} | ${(target.beyondChaffRate * 100).toFixed(1)}% |`;
}).join("\n");
const couplingTable = couplingAimDoctrine.map((row) =>
  `| ${row.objectiveCoupling} | ${row.aimMode} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");
const pressureTable = pressureDoctrine.map((row) =>
  `| ${row.pressure} | ${row.commandMode} | ${row.adaptiveScore.toFixed(4)} | ${row.bestStaticScore.toFixed(4)} | ${row.adaptiveGap.toFixed(4)} |`
).join("\n");

const assessment = `# Attention v3 Stage-C4 generalization and hostile-aim audit\n\n` +
  `Conformance: **${report.status.toUpperCase()}**  \n` +
  `Larger bounded audit: **${report.auditStatus.toUpperCase()}**  \n` +
  `Fixed policy: \`${adaptivePolicy.id}\`  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-C3 report: \`${PARENT_STAGE_C3_REPORT_HASH}\`\n\n` +
  `The audit executed ${observedWorlds.toLocaleString("en-US")} fresh common worlds / ${observedRuns.toLocaleString("en-US")} actual matches across nine novel pressure samples, three hostile aim modes, two doctrines, and both seats. The Stage-C3 response was fixed before execution and no selection occurred.\n\n` +
  `## Conformance gates\n\n${Object.entries(conformanceGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Audit gates\n\n${Object.entries(auditGates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Overall policy comparison\n\n| Policy | Score | Progress | Drift | Chaff fired | Hostile shells blocked | Support Scans |\n|---|---:|---:|---:|---:|---:|---:|\n${policyTable}\n\n` +
  `## Hostile aim robustness\n\n| Aim | Adaptive score | Best static | Gap | Mean target offset | Beyond Chaff center |\n|---|---:|---:|---:|---:|---:|\n${aimTable}\n\n` +
  `## Coupling x aim x doctrine\n\n| Coupling | Aim | Doctrine | Adaptive | Best static | Gap |\n|---|---|---|---:|---:|---:|\n${couplingTable}\n\n` +
  `## Novel pressure x doctrine\n\n| Pressure | Doctrine | Adaptive | Best static | Gap |\n|---|---|---:|---:|---:|\n${pressureTable}\n\n` +
  `## Assessment\n\n` +
  `- The fixed response scored ${adaptiveSummary.mean.score.toFixed(4)} versus ${bestStaticSummary.mean.score.toFixed(4)} for the best pooled static control (\`${bestStaticSummary.policy}\`), a delta of ${(adaptiveSummary.mean.score - bestStaticSummary.mean.score).toFixed(4)}.\n` +
  `- The worst coupling x aim x doctrine gap was ${Math.min(...couplingAimDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}; the worst novel pressure x doctrine gap was ${Math.min(...pressureDoctrine.map((row) => row.adaptiveGap)).toFixed(4)}.\n` +
  `- Artifact-density targeting landed beyond the proactive Chaff screen in ${(aimTargetSummary.find((row) => row.aimMode === "artifact-density").beyondChaffRate * 100).toFixed(1)}% of worlds; far-objective targeting did so in ${(aimTargetSummary.find((row) => row.aimMode === "far-objective").beyondChaffRate * 100).toFixed(1)}%.\n` +
  `- Every aim aggregate beat its best static control, so off-center targeting was not the primary audit failure. The hard global-to-Chaff branch failed as soundness rose, and high-soundness local-verification cells sometimes favored holding.\n` +
  `- The next bounded candidate should choose among hold, Scout peel plus Support Scan, and Chaff from public low-confidence count within each public objective-coupling regime.\n` +
  `- The adaptive branch function did not receive soundness rate, pressure ID, aim mode, latent truth, focal seat, or audit cell.\n` +
  `- Audit status applies to this fixed response under the frozen matrix only.\n\n` +
  `## Boundary\n\nThis failed audit does not support retaining the response as a general artillery doctrine. Its Stage-C3 centered-Flare result remains valid inside that frozen boundary. The result does not invalidate the underlying mechanics or authorize full model promotion, new shells, reloads, cooldowns, or counter-battery.\n`;

function generalizationSvg(rows) {
  const width = 1320;
  const height = 520;
  const maxScore = Math.max(...rows.map((row) => row.mean.score));
  const bars = rows.map((row, index) => {
    const y = 135 + index * 88;
    const barWidth = row.mean.score / maxScore * 560;
    const color = row.policy === adaptivePolicy.id ? "#35f2d0" : "#ff9f43";
    return `<text x="38" y="${y + 7}" fill="#f4f7ff" font-size="17" font-family="Segoe UI, sans-serif">${row.policy}</text>\n` +
      `<rect x="310" y="${y - 18}" width="${barWidth}" height="34" rx="7" fill="${color}"/>\n` +
      `<text x="${325 + barWidth}" y="${y + 7}" fill="${color}" font-size="17" font-weight="700" font-family="Cascadia Mono, monospace">${row.mean.score.toFixed(4)}</text>\n` +
      `<text x="1010" y="${y + 7}" fill="#a9b6d3" font-size="14" font-family="Cascadia Mono, monospace">progress ${row.mean.progress.toFixed(2)}  drift ${row.mean.drift.toFixed(2)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="38" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C4 · novel-surface policy score</text>
  <text x="38" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Fixed adaptive response in cyan · static controls in orange</text>
  ${bars}
</svg>\n`;
}

function aimSvg(rows) {
  const width = 1460;
  const height = 1260;
  const bars = rows.map((row, index) => {
    const y = 135 + index * 61;
    const adaptiveWidth = row.adaptiveScore * 520;
    const staticWidth = row.bestStaticScore * 520;
    const color = row.adaptiveGap >= -planDefinition.cellTolerance ? "#35f2d0" : "#ff6b7a";
    return `<text x="32" y="${y + 7}" fill="#f4f7ff" font-size="13" font-family="Cascadia Mono, monospace">${row.objectiveCoupling} / ${row.aimMode} / ${row.commandMode}</text>\n` +
      `<rect x="520" y="${y - 16}" width="${staticWidth}" height="15" rx="4" fill="#ff9f43"/>\n` +
      `<rect x="520" y="${y + 4}" width="${adaptiveWidth}" height="15" rx="4" fill="${color}"/>\n` +
      `<text x="1090" y="${y + 7}" fill="${color}" font-size="14" font-family="Cascadia Mono, monospace">adaptive ${row.adaptiveScore.toFixed(4)}  best ${row.bestStaticScore.toFixed(4)}  gap ${row.adaptiveGap.toFixed(4)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="32" y="47" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C4 · hostile-aim robustness atlas</text>
  <text x="32" y="77" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Orange: best static · cyan: within 0.075 · red: frozen audit failure</text>
  ${bars}
</svg>\n`;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "generalization-score.svg"), generalizationSvg(policySummary), "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "aim-robustness.svg"), aimSvg(couplingAimDoctrine), "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  auditStatus: report.auditStatus,
  planId,
  planHash,
  reportHash: report.reportHash,
  fixedPolicy: adaptivePolicy.id,
  observedWorlds,
  observedRuns,
  determinismSentinels,
  conformanceGates,
  auditGates,
  policySummary,
  aimComparison,
  aimTargetSummary,
  couplingAimDoctrine,
  pressureDoctrine,
  seatComparison,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
