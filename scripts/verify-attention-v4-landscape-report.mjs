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

const EXPECTED_REPORT_HASH = "sha256:48c68d58671e926ae14a14ef20cd32046166de97f545c1661d4ef9de6d2ec585";
const reportPath = new URL("../data/experiments/attention-v4.2-descriptive-landscape/report.json", import.meta.url);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const recordedHash = report.reportHash;
delete report.reportHash;
const computedHash = attentionV4ContentHash(report);
const fail = (message) => { throw new Error(`attention-v4 landscape report rejected: ${message}`); };

if (computedHash !== recordedHash || computedHash !== EXPECTED_REPORT_HASH) fail("content hash does not match the recorded landscape");
if (report.studyId !== "attention-v4.2-descriptive-landscape-1" || report.evidenceClass !== "descriptive-exploration" || report.causalClaim !== false) {
  fail("evidence classification drifted");
}
if (report.modelVersion !== "duel-capacity-v3-experimental") fail("external model id changed");
if (report.rulesetVersion !== ATTENTION_V4_RULESET_VERSION || report.rulesetHash !== ATTENTION_V4_RULESET_HASH) fail("ruleset attribution drifted");
if (report.resolverVersion !== ATTENTION_V4_RESOLVER_VERSION) fail("resolver attribution drifted");
if (report.compilerVersion !== ATTENTION_V4_COMMANDER_COMPILER_VERSION) fail("compiler attribution drifted");
if (report.commanderCatalogHash !== createAttentionV4CommanderCatalog().catalogHash) fail("commander catalog attribution drifted");
if (!report.design.complete || report.design.commanders !== 3_200 || report.design.nonSelfEdges !== 12_800 || report.design.selfPlayEdges !== 3_200 ||
  report.design.physicalMatches !== 115_200 || report.design.reversalPairs !== 51_200 || report.design.replaySentinels !== 125) {
  fail("fixed sparse design is incomplete");
}
if (report.design.offsets.join(",") !== "791,1709,1,2559" || report.design.pressureSamples.join(",") !== "0,1,2,3") fail("sampling strata changed");
if (!report.integrity.passed || report.integrity.minimumCommanderAppearances !== 72 || report.integrity.maximumCommanderAppearances !== 72 ||
  !report.integrity.allProfilesObserved || report.integrity.replayMismatches !== 0 || report.integrity.streamMismatches !== 0 ||
  report.integrity.attributionMismatches !== 0 || report.integrity.commandRejections !== 0) {
  fail("one or more integrity gates failed");
}
if (report.outcomes.alphaWins + report.outcomes.bravoWins + report.outcomes.draws !== report.design.physicalMatches) fail("outcome totals do not close");
if (Object.values(report.outcomes.terminalReasons).reduce((sum, value) => sum + value, 0) !== report.design.physicalMatches) fail("terminal totals do not close");
if (report.outcomes.byPressure.length !== 4 || report.outcomes.byPressure.some((item) => item.matches !== 28_800)) fail("pressure strata are incomplete");
if (report.commanders.all.length !== 3_200 || new Set(report.commanders.all.map((item) => item.ordinal)).size !== 3_200 ||
  report.commanders.all.some((item) => item.appearances !== 72)) fail("commander observations are incomplete");
for (const mechanic of ["batteries", "detonations", "supportScans", "supportAttachments", "shellsFired", "shellsBlocked", "flare", "smoke", "emp", "he", "chaff", "uplinks", "condenseActions", "scoutEmits", "scoutHolds", "backlogObservations"]) {
  if (!(report.mechanics[mechanic] > 0)) fail(`mechanic ${mechanic} was not observed`);
}
for (const metric of ["emits", "holds", "artifacts", "batteries", "detonations", "detonationDrift"]) {
  const chassisTotal = Object.values(report.balance.chassis).reduce((sum, chassis) => sum + chassis[metric], 0);
  const mechanic = metric === "artifacts" ? "artifactsEmitted" : metric;
  if (chassisTotal !== report.mechanics[mechanic]) fail(`${metric} chassis attribution does not close`);
}
if (report.modules.composition.length !== 5 || report.balance.backlog.observations !== report.mechanics.backlogObservations ||
  report.balance.scoutCondense.actions !== report.mechanics.condenseActions) fail("fleet/Condense balance telemetry is incomplete");

process.stdout.write(`attention-v4.2 descriptive landscape verified: ${computedHash}, ${report.design.physicalMatches} matches, 3,200/3,200 profiles\n`);
