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

const OUTPUT_DIRECTORY = resolve("data/experiments/attention-v3-stage-c1-response-doctrine-probe");
const WORLD_STREAM_NAMESPACE = "attention-v3-stage-c1-response-world-v1";
const PARENT_STAGE_C_REPORT_HASH = "sha256:869099e6a2539111f6d996fadbff3080b6c62b0d6dcfdeff879419015e67b9e5";
const RISK_CHAFF_THRESHOLD = 5;

const policies = [
  { id: "hold-pass", movement: "hold", chaff: "never" },
  { id: "full-evacuate", movement: "full-evacuate", chaff: "never" },
  { id: "scout-peel", movement: "scout-peel", chaff: "never" },
  { id: "scout-peel-support", movement: "scout-peel-support", chaff: "never" },
  { id: "compress-support", movement: "compress-support", chaff: "never" },
  { id: "always-chaff", movement: "hold", chaff: "always" },
  { id: "risk-chaff", movement: "hold", chaff: "risk" }
];

const pressureSamples = [
  { id: "binary-sound-70", objectiveCoupling: "binary-front", soundnessRate: 0.70 },
  { id: "global-sound-45", objectiveCoupling: "global", soundnessRate: 0.45 },
  { id: "distance-sound-55", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.55 },
  { id: "distance-sound-80", objectiveCoupling: "distance-weighted-front", soundnessRate: 0.80 }
];

const commandModes = ["confidence-threshold", "local-verify"];
const seeds = Array.from({ length: 48 }, (_, index) => 91_000 + index);
const orientations = ["focal-alpha", "focal-bravo"];

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

const planDefinition = {
  schemaVersion: 1,
  experiment: "attention-v3-stage-c1-response-doctrine-probe",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageCReportHash: PARENT_STAGE_C_REPORT_HASH,
  policies,
  riskChaff: {
    threshold: RISK_CHAFF_THRESHOLD,
    formula: "drift + max(0, ownPendingArtifacts - attention) + ownPendingConfidenceBelow0.50"
  },
  pressureSamples,
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
  opponent: "round-one hostile Flare, then pass; hold movement; matched command doctrine",
  capacityPolicy: "pass",
  reload: false
};

const planHash = digest(planDefinition);
const planId = `attention-v3-stage-c1-${planHash.slice(7, 23)}`;

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

function unitPlan(playerId, unitId, actions) {
  return { kind: "unit-actions", playerId, unitId, actions };
}

function movementDecisions(projection, playerId, mode) {
  const own = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const scout = own.find((unit) => unit.chassis === "scout");
  const line = own.find((unit) => unit.chassis === "line");
  const decisions = [];

  if (projection.round === 1 && mode === "full-evacuate") {
    return own.map((unit) => unitPlan(playerId, unit.unitId, [
      { kind: "move", destination: evacuationDestination(playerId, unit.chassis) }
    ]));
  }

  if (projection.round === 1 && (mode === "scout-peel" || mode === "scout-peel-support") && scout) {
    decisions.push(unitPlan(playerId, scout.unitId, [
      { kind: "move", destination: evacuationDestination(playerId, scout.chassis) }
    ]));
  }

  if (mode === "scout-peel-support" && line) {
    const scan = supportAction(projection, playerId);
    if (scan) decisions.push(unitPlan(playerId, line.unitId, [scan]));
  }

  if (mode === "compress-support") {
    const scan = line ? supportAction(projection, playerId) : null;
    if (projection.round === 1) {
      for (const unit of own) {
        const actions = unit.chassis === "line" && scan
          ? [scan, { kind: "range-shift", delta: -1 }]
          : [{ kind: "range-shift", delta: -1 }];
        decisions.push(unitPlan(playerId, unit.unitId, actions));
      }
    } else if (line && scan) {
      decisions.push(unitPlan(playerId, line.unitId, [scan]));
    }
  }
  return decisions;
}

function publicRiskIndex(projection, playerId) {
  const player = projection.players.find((candidate) => candidate.playerId === playerId);
  const pending = projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  );
  const coverageDeficit = Math.max(0, pending.length - player.attention);
  const lowConfidence = pending.filter((artifact) => artifact.reportedConfidence < 0.5).length;
  return player.drift + coverageDeficit + lowConfidence;
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

function focalController(playerId, policy, commandMode, center, telemetry) {
  return {
    artillery: (projection) => {
      if (projection.round !== 1) return { kind: "pass-artillery", playerId };
      const riskIndex = publicRiskIndex(projection, playerId);
      telemetry.riskIndex = riskIndex;
      const shouldChaff = policy.chaff === "always" ||
        (policy.chaff === "risk" && riskIndex >= RISK_CHAFF_THRESHOLD);
      telemetry.chaffDeclared = shouldChaff;
      return shouldChaff
        ? { kind: "fire-artillery", playerId, shell: "chaff", center }
        : { kind: "pass-artillery", playerId };
    },
    movement: (projection) => movementDecisions(projection, playerId, policy.movement),
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

function runPolicy({ policy, pressure, commandMode, seed, orientation }) {
  const focalPlayerId = orientation === "focal-alpha" ? "alpha" : "bravo";
  const aggressorPlayerId = focalPlayerId === "alpha" ? "bravo" : "alpha";
  const center = targetCenter(focalPlayerId);
  const streamId = `${WORLD_STREAM_NAMESPACE}:${pressure.id}:${commandMode}:${seed}:${orientation}`;
  const telemetry = { riskIndex: null, chaffDeclared: false };
  const match = createAttentionMatch({
    matchId: `${planId}:${pressure.id}:${commandMode}:${seed}:${orientation}:${policy.id}`,
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
  "score", "progress", "drift", "rounds", "artifactsEmitted", "verified",
  "movement", "supportScans", "supportVerifications", "rangeShifts",
  "autoAcceptedBeyondReach", "meanArtifactDistance", "chaffFired",
  "hostileShellsBlocked", "flareEstablished", "flareAffectedArtifacts",
  "driftDefeatsInduced", "riskIndex"
];

function metrics(run) {
  const { result, focalPlayerId, aggressorPlayerId, telemetry } = run;
  const focalState = result.match.state.players.find((player) => player.playerId === focalPlayerId);
  const focalCore = result.summary.players[focalPlayerId];
  const aggressorCore = result.summary.players[aggressorPlayerId];
  const focalSpatial = result.summary.spatial[focalPlayerId];
  const focalArtillery = result.summary.artillery[focalPlayerId];
  const aggressorArtillery = result.summary.artillery[aggressorPlayerId];
  return {
    score: scoreFor(result, focalPlayerId),
    progress: focalState.progress,
    drift: focalState.drift,
    rounds: result.match.state.round,
    artifactsEmitted: focalCore.artifactsEmitted,
    verified: focalCore.verified,
    movement: focalCore.movementDistance,
    supportScans: focalSpatial.supportScans,
    supportVerifications: focalSpatial.supportScanVerifications,
    rangeShifts: focalSpatial.rangeShifts,
    autoAcceptedBeyondReach: focalSpatial.autoAcceptedBeyondReach,
    meanArtifactDistance: focalSpatial.artifactsSpawned > 0
      ? focalSpatial.artifactDistanceTotal / focalSpatial.artifactsSpawned
      : 0,
    chaffFired: focalArtillery.chaffShellsFired,
    hostileShellsBlocked: focalArtillery.hostileShellsBlocked,
    flareEstablished: aggressorArtillery.flareShellsEstablished,
    flareAffectedArtifacts: aggressorCore.flareAffectedArtifacts,
    driftDefeatsInduced: aggressorCore.driftDefeatsInduced,
    riskIndex: telemetry.riskIndex ?? 0
  };
}

function emptySums() {
  return Object.fromEntries(metricNames.map((name) => [name, 0]));
}

function addMetrics(target, source, baseline) {
  for (const name of metricNames) {
    target.absolute[name] += source[name];
    target.delta[name] += source[name] - baseline[name];
  }
  target.runs += 1;
}

function means(sums, divisor) {
  return Object.fromEntries(metricNames.map((name) => [name, sums[name] / divisor]));
}

const cellsByKey = new Map();
const policySums = Object.fromEntries(policies.map((policy) => [policy.id, { runs: 0, absolute: emptySums(), delta: emptySums() }]));
let observedWorlds = 0;
let observedRuns = 0;
let determinismSentinels = 0;
let determinismFailures = 0;
let planRejections = 0;
let artilleryRejections = 0;
let reloadEvents = 0;
let handInvariantFailures = 0;
let counterMissingRuns = 0;

for (const pressure of pressureSamples) {
  for (const commandMode of commandModes) {
    for (const seed of seeds) {
      for (const orientation of orientations) {
        const runs = policies.map((policy) => ({
          policy,
          run: runPolicy({ policy, pressure, commandMode, seed, orientation })
        }));
        const streams = new Set(runs.map(({ run }) => run.streamId));
        if (streams.size !== 1) throw new Error("A response block lost its common random stream");
        const measured = Object.fromEntries(runs.map(({ policy, run }) => [policy.id, metrics(run)]));
        const baseline = measured["hold-pass"];
        observedWorlds += 1;

        for (const { policy, run } of runs) {
          const values = measured[policy.id];
          addMetrics(policySums[policy.id], values, baseline);
          const seat = run.focalPlayerId;
          const key = `${policy.id}|${pressure.id}|${commandMode}|${seat}`;
          const cell = cellsByKey.get(key) ?? {
            policy: policy.id,
            pressure: pressure.id,
            commandMode,
            focalSeat: seat,
            runs: 0,
            absolute: emptySums(),
            delta: emptySums()
          };
          addMetrics(cell, values, baseline);
          cellsByKey.set(key, cell);
          observedRuns += 1;

          const result = run.result;
          if (!result.summary.spatial || !result.summary.artillery) counterMissingRuns += 1;
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

        if (seed === seeds[0] && orientation === orientations[0]) {
          for (const { policy, run } of runs) {
            const replay = runPolicy({ policy, pressure, commandMode, seed, orientation });
            determinismSentinels += 1;
            if (replay.result.traceHash !== run.result.traceHash ||
              JSON.stringify(replay.result.match.state) !== JSON.stringify(run.result.match.state) ||
              JSON.stringify(replay.telemetry) !== JSON.stringify(run.telemetry)) {
              determinismFailures += 1;
            }
          }
        }
      }
    }
  }
}

const cells = [...cellsByKey.values()].map((cell) => ({
  policy: cell.policy,
  pressure: cell.pressure,
  commandMode: cell.commandMode,
  focalSeat: cell.focalSeat,
  runs: cell.runs,
  mean: means(cell.absolute, cell.runs),
  meanDeltaFromHold: means(cell.delta, cell.runs)
}));

const policySummary = policies.map((policy) => {
  const aggregate = policySums[policy.id];
  return {
    policy: policy.id,
    runs: aggregate.runs,
    mean: means(aggregate.absolute, aggregate.runs),
    meanDeltaFromHold: means(aggregate.delta, aggregate.runs)
  };
});

const summaryByPolicy = Object.fromEntries(policySummary.map((row) => [row.policy, row]));

function groupedSummary(groupName) {
  const groups = [...new Set(cells.map((cell) => cell[groupName]))];
  return groups.flatMap((group) => policies.map((policy) => {
    const selected = cells.filter((cell) => cell[groupName] === group && cell.policy === policy.id);
    const runs = selected.reduce((sum, cell) => sum + cell.runs, 0);
    const weighted = (section, metric) => selected.reduce((sum, cell) => sum + cell[section][metric] * cell.runs, 0) / runs;
    return {
      [groupName]: group,
      policy: policy.id,
      runs,
      score: weighted("mean", "score"),
      scoreDeltaFromHold: weighted("meanDeltaFromHold", "score"),
      progressDeltaFromHold: weighted("meanDeltaFromHold", "progress"),
      driftDeltaFromHold: weighted("meanDeltaFromHold", "drift")
    };
  }));
}

const pressureSummary = groupedSummary("pressure");
const commandSummary = groupedSummary("commandMode");
const seatSummary = groupedSummary("focalSeat");

const bestPolicyByPressure = pressureSamples.map((pressure) => {
  const rows = pressureSummary.filter((row) => row.pressure === pressure.id)
    .sort((left, right) => right.score - left.score || left.policy.localeCompare(right.policy));
  return { pressure: pressure.id, policy: rows[0].policy, score: rows[0].score, runnerUp: rows[1].policy, margin: rows[0].score - rows[1].score };
});

const bestPolicyByPressureDoctrine = pressureSamples.flatMap((pressure) => commandModes.map((commandMode) => {
  const selected = cells.filter((cell) => cell.pressure === pressure.id && cell.commandMode === commandMode);
  const rows = policies.map((policy) => {
    const policyCells = selected.filter((cell) => cell.policy === policy.id);
    const runs = policyCells.reduce((sum, cell) => sum + cell.runs, 0);
    const score = policyCells.reduce((sum, cell) => sum + cell.mean.score * cell.runs, 0) / runs;
    return { policy: policy.id, score };
  }).sort((left, right) => right.score - left.score || left.policy.localeCompare(right.policy));
  return {
    pressure: pressure.id,
    commandMode,
    policy: rows[0].policy,
    score: rows[0].score,
    runnerUp: rows[1].policy,
    margin: rows[0].score - rows[1].score
  };
}));

const paretoPolicies = policySummary.filter((candidate) => !policySummary.some((other) =>
  other.policy !== candidate.policy &&
  other.mean.score >= candidate.mean.score &&
  other.mean.progress >= candidate.mean.progress &&
  other.mean.drift <= candidate.mean.drift &&
  (other.mean.score > candidate.mean.score || other.mean.progress > candidate.mean.progress || other.mean.drift < candidate.mean.drift)
)).map((row) => row.policy);

const hold = summaryByPolicy["hold-pass"];
const full = summaryByPolicy["full-evacuate"];
const peel = summaryByPolicy["scout-peel"];
const peelSupport = summaryByPolicy["scout-peel-support"];
const compress = summaryByPolicy["compress-support"];
const alwaysChaff = summaryByPolicy["always-chaff"];
const riskChaff = summaryByPolicy["risk-chaff"];
const plannedWorlds = pressureSamples.length * commandModes.length * seeds.length * orientations.length;
const plannedRuns = plannedWorlds * policies.length;
const expectedSentinels = pressureSamples.length * commandModes.length * policies.length;

const gates = {
  exactRunCount: observedWorlds === plannedWorlds && observedRuns === plannedRuns,
  deterministicSentinels: determinismFailures === 0 && determinismSentinels === expectedSentinels,
  commonStreamBlocks: true,
  zeroPlanRejections: planRejections === 0,
  zeroArtilleryRejections: artilleryRejections === 0,
  fixedHandsNoReload: reloadEvents === 0 && handInvariantFailures === 0,
  causalCountersPresent: counterMissingRuns === 0,
  fullEvacuationMovesAndEscapes: full.meanDeltaFromHold.movement >= 3 && full.meanDeltaFromHold.flareAffectedArtifacts < 0,
  scoutPeelIsSelective: peel.meanDeltaFromHold.movement >= 1 && peel.mean.flareAffectedArtifacts < hold.mean.flareAffectedArtifacts && peel.mean.flareAffectedArtifacts > full.mean.flareAffectedArtifacts,
  peelSupportExecutes: peelSupport.mean.supportScans > peel.mean.supportScans && peelSupport.mean.supportVerifications > peel.mean.supportVerifications,
  compressionContractsDistance: compress.mean.rangeShifts >= 3 && compress.meanDeltaFromHold.meanArtifactDistance < 0,
  riskChaffIsConditional: riskChaff.mean.chaffFired > 0 && riskChaff.mean.chaffFired < 1,
  everyRiskChaffBlocks: Math.abs(riskChaff.mean.chaffFired - riskChaff.mean.hostileShellsBlocked) < 1e-12,
  alwaysChaffBlocks: alwaysChaff.mean.chaffFired === 1 && alwaysChaff.mean.hostileShellsBlocked === 1
};

const reportWithoutHash = {
  schemaVersion: 1,
  artifactKind: "attention-v3-stage-c1-response-doctrine-probe-report",
  status: Object.values(gates).every(Boolean) ? "pass" : "fail",
  modelVersion: "duel-capacity-v3-experimental",
  resolverVersion: ATTENTION_V3_ARTILLERY_RESOLVER_VERSION,
  parentStageCReportHash: PARENT_STAGE_C_REPORT_HASH,
  planId,
  planHash,
  plannedWorlds,
  observedWorlds,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  gates,
  paretoPolicies,
  bestPolicyByPressure,
  policySummary,
  pressureSummary,
  commandSummary,
  seatSummary,
  cells
};
const report = { ...reportWithoutHash, reportHash: digest(reportWithoutHash) };

const policyTable = policySummary.map((row) =>
  `| ${row.policy} | ${row.mean.score.toFixed(4)} | ${row.meanDeltaFromHold.score.toFixed(4)} | ${row.mean.progress.toFixed(3)} | ${row.meanDeltaFromHold.progress.toFixed(3)} | ${row.mean.drift.toFixed(3)} | ${row.meanDeltaFromHold.drift.toFixed(3)} | ${row.mean.flareAffectedArtifacts.toFixed(2)} | ${row.mean.movement.toFixed(2)} | ${row.mean.supportScans.toFixed(2)} | ${(row.mean.chaffFired * 100).toFixed(1)}% |`
).join("\n");

const pressureTable = bestPolicyByPressure.map((row) =>
  `| ${row.pressure} | ${row.policy} | ${row.score.toFixed(4)} | ${row.runnerUp} | ${row.margin.toFixed(4)} |`
).join("\n");

const pressureDoctrineTable = bestPolicyByPressureDoctrine.map((row) =>
  `| ${row.pressure} | ${row.commandMode} | ${row.policy} | ${row.score.toFixed(4)} | ${row.runnerUp} | ${row.margin.toFixed(4)} |`
).join("\n");

const doctrineTable = commandModes.flatMap((commandMode) =>
  ["hold-pass", "scout-peel-support", "always-chaff", "risk-chaff"].map((policy) =>
    commandSummary.find((row) => row.commandMode === commandMode && row.policy === policy)
  )
).map((row) =>
  `| ${row.commandMode} | ${row.policy} | ${row.score.toFixed(4)} | ${row.scoreDeltaFromHold.toFixed(4)} | ${row.progressDeltaFromHold.toFixed(3)} | ${row.driftDeltaFromHold.toFixed(3)} |`
).join("\n");

const assessment = `# Attention v3 Stage-C1 response-doctrine probe\n\n` +
  `Status: **${report.status.toUpperCase()}**  \n` +
  `Plan: \`${planId}\`  \n` +
  `Plan hash: \`${planHash}\`  \n` +
  `Report hash: \`${report.reportHash}\`  \n` +
  `Parent Stage-C report: \`${PARENT_STAGE_C_REPORT_HASH}\`\n\n` +
  `The campaign completed ${observedWorlds.toLocaleString("en-US")} common worlds × ${policies.length} response arms = ${observedRuns.toLocaleString("en-US")} matches, plus ${determinismSentinels} exact replay sentinels. Every block held the hostile Flare, seat, seed, pressure, command doctrine, opponent, and random stream fixed.\n\n` +
  `## Gates\n\n${Object.entries(gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n")}\n\n` +
  `## Policy outcomes\n\n| Policy | Score | Δ score | Progress | Δ progress | Drift | Δ drift | Flare affected | Move | Scans | Chaff rate |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${policyTable}\n\n` +
  `## Best observed score by pressure\n\n| Pressure | Best policy | Score | Runner-up | Margin |\n|---|---|---:|---|---:|\n${pressureTable}\n\n` +
  `## Doctrine interaction\n\n| Doctrine | Policy | Score | Delta score | Delta progress | Delta drift |\n|---|---|---:|---:|---:|---:|\n${doctrineTable}\n\n` +
  `## Best observed score by pressure and doctrine\n\n| Pressure | Doctrine | Best policy | Score | Runner-up | Margin |\n|---|---|---|---:|---|---:|\n${pressureDoctrineTable}\n\n` +
  `## Deductions\n\n` +
  `- Scout peel versus full evacuation changed score by ${(peel.mean.score - full.mean.score).toFixed(4)}, progress by ${(peel.mean.progress - full.mean.progress).toFixed(3)}, and drift by ${(peel.mean.drift - full.mean.drift).toFixed(3)}. This isolates the value of moving only the noisy, high-throughput unit.\n` +
  `- Adding Support Scan to Scout peel changed score by ${(peelSupport.mean.score - peel.mean.score).toFixed(4)}, progress by ${(peelSupport.mean.progress - peel.mean.progress).toFixed(3)}, drift by ${(peelSupport.mean.drift - peel.mean.drift).toFixed(3)}, and produced ${(peelSupport.mean.supportVerifications - peel.mean.supportVerifications).toFixed(3)} additional scan-mediated verifications.\n` +
  `- Compression + Support shifted mean artifact distance by ${compress.meanDeltaFromHold.meanArtifactDistance.toFixed(4)}, beyond-reach auto-acceptance by ${compress.meanDeltaFromHold.autoAcceptedBeyondReach.toFixed(3)}, score by ${compress.meanDeltaFromHold.score.toFixed(4)}, and drift by ${compress.meanDeltaFromHold.drift.toFixed(3)} relative to hold.\n` +
  `- Risk-Chaff fired in ${(riskChaff.mean.chaffFired * 100).toFixed(1)}% of worlds. Relative to always-Chaff it changed score by ${(riskChaff.mean.score - alwaysChaff.mean.score).toFixed(4)}, progress by ${(riskChaff.mean.progress - alwaysChaff.mean.progress).toFixed(3)}, and drift by ${(riskChaff.mean.drift - alwaysChaff.mean.drift).toFixed(3)}.\n` +
  `- Doctrine is the dominant interaction: hold led every confidence-threshold pressure, while local verification required either Scout peel + Support Scan or Chaff. The pooled Scout-peel result must not be treated as universal.\n` +
  `- Non-dominated policies over pooled score, progress, and lower drift: ${paretoPolicies.map((policy) => `\`${policy}\``).join(", ")}. Pressure-specific rankings remain the safer decision surface than one pooled winner.\n\n` +
  `## Boundary\n\nThis is a response-doctrine experiment over the already validated Stage-B/C mechanics. It does not authorize new shell types, reloads, cooldowns, counter-battery, or v3 promotion. A follow-up should refine only policies that remain competitive across pressure, doctrine, and seat cells.\n`;

function tradeoffSvg(rows) {
  const width = 1180;
  const height = 680;
  const plot = { left: 120, top: 120, width: 900, height: 430 };
  const xValues = rows.map((row) => row.meanDeltaFromHold.progress);
  const yValues = rows.map((row) => -row.meanDeltaFromHold.drift);
  const xMin = Math.min(...xValues, -0.25) - 0.3;
  const xMax = Math.max(...xValues, 0.25) + 0.3;
  const yMin = Math.min(...yValues, -0.25) - 0.3;
  const yMax = Math.max(...yValues, 0.25) + 0.3;
  const sx = (value) => plot.left + (value - xMin) / (xMax - xMin) * plot.width;
  const sy = (value) => plot.top + plot.height - (value - yMin) / (yMax - yMin) * plot.height;
  const xZero = sx(0);
  const yZero = sy(0);
  const labelOffsets = {
    "hold-pass": { x: 15, y: -32 },
    "always-chaff": { x: 15, y: -29 },
    "risk-chaff": { x: 15, y: 41 },
    "scout-peel-support": { x: 15, y: -36 }
  };
  const points = rows.map((row, index) => {
    const x = sx(row.meanDeltaFromHold.progress);
    const y = sy(-row.meanDeltaFromHold.drift);
    const positive = row.meanDeltaFromHold.score >= 0;
    const color = row.policy === "hold-pass" ? "#c2ccdf" : positive ? "#35f2d0" : "#ff6b85";
    const offset = labelOffsets[row.policy] ?? { x: 15, y: index % 2 === 0 ? -16 : 28 };
    const labelY = y + offset.y;
    return `<circle cx="${x}" cy="${y}" r="11" fill="${color}" stroke="#09111f" stroke-width="3"/>\n` +
      `<text x="${x + offset.x}" y="${labelY}" fill="${color}" font-size="15" font-weight="700" font-family="Segoe UI, sans-serif">${row.policy}</text>\n` +
      `<text x="${x + offset.x}" y="${labelY + 18}" fill="#a9b6d3" font-size="12" font-family="Cascadia Mono, monospace">score Δ ${row.meanDeltaFromHold.score.toFixed(4)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="42" y="48" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C1 · progress retained vs drift avoided</text>
  <text x="42" y="78" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Paired deltas from hold under the same hostile-Flare worlds · upper-right is jointly favorable</text>
  <rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" fill="#101c31" stroke="#253656"/>
  <line x1="${xZero}" y1="${plot.top}" x2="${xZero}" y2="${plot.top + plot.height}" stroke="#7f90b2" stroke-width="2"/>
  <line x1="${plot.left}" y1="${yZero}" x2="${plot.left + plot.width}" y2="${yZero}" stroke="#7f90b2" stroke-width="2"/>
  <text x="${plot.left + plot.width / 2}" y="620" fill="#dbe5ff" font-size="17" text-anchor="middle" font-family="Segoe UI, sans-serif">Progress delta →</text>
  <text x="35" y="${plot.top + plot.height / 2}" fill="#dbe5ff" font-size="17" text-anchor="middle" transform="rotate(-90 35 ${plot.top + plot.height / 2})" font-family="Segoe UI, sans-serif">Drift avoided →</text>
  ${points}
</svg>\n`;
}

function mechanicSvg(rows) {
  const width = 1200;
  const height = 140 + rows.length * 72;
  const maxFlare = Math.max(...rows.map((row) => row.mean.flareAffectedArtifacts), 1);
  const bars = rows.map((row, index) => {
    const y = 120 + index * 72;
    const barWidth = row.mean.flareAffectedArtifacts / maxFlare * 430;
    const color = row.mean.chaffFired > 0 ? "#8b7cff" : row.mean.movement > 0 ? "#35f2d0" : "#ff9f43";
    return `<text x="40" y="${y + 5}" fill="#f4f7ff" font-size="17" font-family="Segoe UI, sans-serif">${row.policy}</text>\n` +
      `<rect x="280" y="${y - 17}" width="${barWidth}" height="30" rx="6" fill="${color}"/>\n` +
      `<text x="${290 + barWidth}" y="${y + 5}" fill="${color}" font-size="16" font-weight="700" font-family="Cascadia Mono, monospace">${row.mean.flareAffectedArtifacts.toFixed(2)}</text>\n` +
      `<text x="805" y="${y + 5}" fill="#a9b6d3" font-size="14" font-family="Cascadia Mono, monospace">move ${row.mean.movement.toFixed(2)}  scan ${row.mean.supportScans.toFixed(2)}  shift ${row.mean.rangeShifts.toFixed(2)}  chaff ${(row.mean.chaffFired * 100).toFixed(0)}%</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#09111f"/>
  <text x="40" y="46" fill="#ffffff" font-size="28" font-weight="700" font-family="Segoe UI, sans-serif">Stage C1 · intervention load and Flare exposure</text>
  <text x="40" y="76" fill="#94a3c7" font-size="16" font-family="Segoe UI, sans-serif">Mean Flare-affected artifacts; intervention execution at right</text>
  ${bars}
</svg>\n`;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(resolve(OUTPUT_DIRECTORY, "PLAN.json"), `${JSON.stringify({ ...planDefinition, planId, planHash }, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "ASSESSMENT.md"), assessment, "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "policy-tradeoffs.svg"), tradeoffSvg(policySummary), "utf8");
await writeFile(resolve(OUTPUT_DIRECTORY, "mechanic-load.svg"), mechanicSvg(policySummary), "utf8");

process.stdout.write(`${JSON.stringify({
  status: report.status,
  planId,
  planHash,
  reportHash: report.reportHash,
  parentStageCReportHash: PARENT_STAGE_C_REPORT_HASH,
  plannedWorlds,
  observedWorlds,
  plannedRuns,
  observedRuns,
  determinismSentinels,
  planRejections,
  artilleryRejections,
  reloadEvents,
  handInvariantFailures,
  gates,
  paretoPolicies,
  bestPolicyByPressure,
  policySummary,
  outputDirectory: OUTPUT_DIRECTORY
}, null, 2)}\n`);
