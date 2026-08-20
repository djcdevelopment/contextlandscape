import { readFileSync } from "node:fs";
import {
  ATTENTION_V4_COMMANDER_COMPILER_VERSION,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION
} from "../packages/contracts/dist/index.js";
import {
  ATTENTION_V4_RULESET_HASH,
  attentionV4ContentHash,
  createAttentionV4CommanderCatalog
} from "../packages/engine/dist/index.js";

const configurations = {
  regular: {
    path: "../data/experiments/attention-v4.2-regular-topology/report.json",
    studyId: "attention-v4.2-regular-topology-1",
    kind: "regular-topology",
    hash: "sha256:d13279ccd195b28244e08e89d25a655a7921b7190800c1c23fdef8dd90189563",
    nonSelfEdges: 140_800,
    selfPlayEdges: 3_200,
    matches: 2_278_400,
    reversalPairs: 1_126_400,
    replaySentinels: 1_125,
    appearances: 1_424,
    degree: 88,
    scheduleRounds: 88,
    referenceOverlapEdges: 1_366,
    largestStronglyConnectedComponent: 3_132
  },
  matrix: {
    path: "../data/experiments/attention-v4.2-fleet-matrix/report.json",
    studyId: "attention-v4.2-fleet-matrix-1",
    kind: "fleet-matrix",
    hash: "sha256:40819c044fb989e9481fca9543ac4fb950579fc59ab78100e356a38940587b4e",
    nonSelfEdges: 38_400,
    selfPlayEdges: 0,
    matches: 614_400,
    reversalPairs: 307_200,
    replaySentinels: 300,
    appearances: 384,
    degree: 24,
    scheduleRounds: 4,
    referenceOverlapEdges: 0,
    largestStronglyConnectedComponent: 2_799
  }
};

const requested = process.argv[2];
const configuration = configurations[requested];
if (!configuration) throw new Error("usage: verify-attention-v4-deep-report.mjs regular|matrix");

const reportPath = new URL(configuration.path, import.meta.url);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const recordedHash = report.reportHash;
delete report.reportHash;
const computedHash = attentionV4ContentHash(report);
const fail = (message) => { throw new Error(`attention-v4 ${configuration.kind} report rejected: ${message}`); };
const sum = (values) => values.reduce((total, value) => total + value, 0);

if (computedHash !== recordedHash || computedHash !== configuration.hash) fail("content hash does not match the recorded study");
if (report.schemaVersion !== 2 || report.studyId !== configuration.studyId || report.evidenceClass !== "descriptive-exploration" || report.causalClaim !== false) {
  fail("evidence classification or schema drifted");
}
if (report.modelVersion !== "duel-capacity-v3-experimental") fail("external model id changed");
if (report.rulesetVersion !== ATTENTION_V4_RULESET_VERSION || report.rulesetHash !== ATTENTION_V4_RULESET_HASH) fail("ruleset attribution drifted");
if (report.resolverVersion !== ATTENTION_V4_RESOLVER_VERSION) fail("resolver attribution drifted");
if (report.compilerVersion !== ATTENTION_V4_COMMANDER_COMPILER_VERSION) fail("compiler attribution drifted");
if (report.commanderCatalogHash !== createAttentionV4CommanderCatalog().catalogHash) fail("commander catalog attribution drifted");

const design = report.design;
const deep = design.deep;
if (!design.complete || design.commanders !== 3_200 || design.nonSelfEdges !== configuration.nonSelfEdges ||
  design.selfPlayEdges !== configuration.selfPlayEdges || design.physicalMatches !== configuration.matches ||
  design.reversalPairs !== configuration.reversalPairs || design.replaySentinels !== configuration.replaySentinels ||
  design.pressureSamples.join(",") !== "0,1,2,3") {
  fail("fixed study design is incomplete");
}
if (!deep || deep.kind !== configuration.kind || deep.degree !== configuration.degree || deep.scheduleRounds !== configuration.scheduleRounds ||
  deep.fleetCells !== 15 || deep.referenceOverlapEdges !== configuration.referenceOverlapEdges || deep.worldLanes.join(",") !== "0,1" ||
  deep.seedScheme !== "pair-keyed-world-v1") {
  fail("deep-study topology or seed design drifted");
}

const integrity = report.integrity;
if (!integrity.passed || !integrity.allProfilesObserved || integrity.minimumCommanderAppearances !== configuration.appearances ||
  integrity.maximumCommanderAppearances !== configuration.appearances || integrity.replayMismatches !== 0 ||
  integrity.streamMismatches !== 0 || integrity.attributionMismatches !== 0 || integrity.commandRejections !== 0 ||
  integrity.worldStreamCollisions !== 0) {
  fail("one or more integrity gates failed");
}

if (report.outcomes.alphaWins + report.outcomes.bravoWins + report.outcomes.draws !== configuration.matches) fail("outcome totals do not close");
if (sum(Object.values(report.outcomes.terminalReasons)) !== configuration.matches) fail("terminal-reason totals do not close");
if (report.outcomes.byPressure.length !== 4 || report.outcomes.byPressure.some((item) => item.matches !== configuration.matches / 4)) {
  fail("pressure strata are incomplete");
}
if (report.seat.exactReversalPairs !== configuration.reversalPairs ||
  report.seat.selfPlayMatches !== configuration.selfPlayEdges * 4 * 2) {
  fail("seat or self-play totals do not close");
}
if (report.commanders.all.length !== 3_200 || new Set(report.commanders.all.map((item) => item.ordinal)).size !== 3_200 ||
  report.commanders.all.some((item) => item.appearances !== configuration.appearances)) {
  fail("commander observations are incomplete");
}

const worlds = report.worlds;
if (!worlds || worlds.lanes.join(",") !== "0,1" || worlds.seedScheme !== "pair-keyed-world-v1" ||
  worlds.byLane.length !== 2 || worlds.byLane.some((lane) => lane.matches !== configuration.matches / 2) ||
  worlds.comparisons !== configuration.nonSelfEdges * 4) {
  fail("world-lane observations are incomplete");
}
for (const metric of ["exactScoreAgreementRate", "directionAgreementRate", "profileScorePearson", "profileScoreSpearman"]) {
  if (!Number.isFinite(worlds[metric]) || worlds[metric] < -1 || worlds[metric] > 1) fail(`world stability metric ${metric} is invalid`);
}

const progressPath = report.progressPath;
if (!progressPath || sum(Object.values(progressPath.participantHistogram)) !== configuration.matches * 2 ||
  sum(Object.values(progressPath.terminalStateClasses)) !== configuration.matches) {
  fail("Progress-path telemetry does not close");
}
const progressAtLeast = (threshold) => Object.entries(progressPath.participantHistogram)
  .reduce((total, [progress, count]) => total + (Number(progress) >= threshold ? count : 0), 0);
if (progressPath.atLeast8 !== progressAtLeast(8) || progressPath.atLeast10 !== progressAtLeast(10) ||
  progressPath.atLeast12 !== progressAtLeast(12)) {
  fail("Progress thresholds do not match the histogram");
}

const fleetMatchups = report.fleetMatchups;
if (!Array.isArray(fleetMatchups) || fleetMatchups.length !== 15 || new Set(fleetMatchups.map((cell) => cell.cellId)).size !== 15 ||
  sum(fleetMatchups.map((cell) => cell.edges)) !== configuration.nonSelfEdges ||
  sum(fleetMatchups.map((cell) => cell.matches)) !== configuration.nonSelfEdges * 16) {
  fail("fleet-cell totals do not close");
}
for (const cell of fleetMatchups) {
  if (cell.matches !== cell.edges * 16 || cell.left.appearances !== cell.matches || cell.right.appearances !== cell.matches ||
    Math.abs(cell.leftScoreRate - cell.left.scoreRate) > Number.EPSILON ||
    Math.abs(cell.left.scoreRate + cell.right.scoreRate - 1) > 1e-12) {
    fail(`fleet cell ${cell.cellId} is internally inconsistent`);
  }
  if (configuration.kind === "fleet-matrix" && (cell.edges !== 2_560 || cell.matches !== 40_960)) {
    fail(`fleet cell ${cell.cellId} is not equally weighted`);
  }
}

if (report.counterplay.dominanceArcs + report.counterplay.neutralEdges !== configuration.nonSelfEdges ||
  report.counterplay.largestStronglyConnectedComponent !== configuration.largestStronglyConnectedComponent) {
  fail("dominance topology does not close");
}
for (const mechanic of ["batteries", "detonations", "supportScans", "supportAttachments", "shellsFired", "shellsBlocked", "flare", "smoke", "emp", "he", "chaff", "uplinks", "condenseActions", "scoutEmits", "scoutHolds", "backlogObservations"]) {
  if (!(report.mechanics[mechanic] > 0)) fail(`mechanic ${mechanic} was not observed`);
}
for (const metric of ["emits", "holds", "artifacts", "batteries", "detonations", "detonationDrift"]) {
  const chassisTotal = sum(Object.values(report.balance.chassis).map((chassis) => chassis[metric]));
  const mechanic = metric === "artifacts" ? "artifactsEmitted" : metric;
  if (chassisTotal !== report.mechanics[mechanic]) fail(`${metric} chassis attribution does not close`);
}
if (report.modules.composition.length !== 5 || report.modules.triage.length !== 10 || report.modules.movement.length !== 8 ||
  report.modules.capacity.length !== 8 || report.balance.backlog.observations !== report.mechanics.backlogObservations ||
  report.balance.scoutCondense.actions !== report.mechanics.condenseActions) {
  fail("module or balance telemetry is incomplete");
}

process.stdout.write(`attention-v4.2 ${configuration.kind} verified: ${computedHash}, ${configuration.matches} matches, degree ${configuration.degree}, SCC ${configuration.largestStronglyConnectedComponent}/3,200\n`);
