import { readFileSync } from "node:fs";
import {
  ATTENTION_V4_COMMANDER_COMPILER_VERSION,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION
} from "../packages/contracts/dist/index.js";
import {
  ATTENTION_V4_CANONICAL_MATCH_COUNT,
  ATTENTION_V4_CONFORMANCE_REPORT_HASH,
  ATTENTION_V4_RULESET_HASH,
  attentionV4ContentHash,
  createAttentionV4CommanderCatalog
} from "../packages/engine/dist/index.js";

const reportPath = new URL("../data/experiments/attention-v4.2-paired-probe/report.json", import.meta.url);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const recordedHash = report.reportHash;
delete report.reportHash;
const computedHash = attentionV4ContentHash(report);
const fail = (message) => { throw new Error(`attention-v4 conformance report rejected: ${message}`); };
if (computedHash !== recordedHash || computedHash !== ATTENTION_V4_CONFORMANCE_REPORT_HASH) fail("content hash does not match the activation hash");
if (report.probeId !== "attention-v4.2-paired-module-probe-1") fail("paired design id drifted");
if (report.modelVersion !== "duel-capacity-v3-experimental") fail("external model id changed");
if (report.rulesetVersion !== ATTENTION_V4_RULESET_VERSION || report.rulesetHash !== ATTENTION_V4_RULESET_HASH) fail("ruleset attribution drifted");
if (report.resolverVersion !== ATTENTION_V4_RESOLVER_VERSION) fail("resolver attribution drifted");
if (report.compilerVersion !== ATTENTION_V4_COMMANDER_COMPILER_VERSION) fail("compiler attribution drifted");
if (report.commanderCatalogHash !== createAttentionV4CommanderCatalog().catalogHash) fail("commander catalog attribution drifted");
if (!report.design.canonical || !report.design.replayEnabled || report.design.matches !== ATTENTION_V4_CANONICAL_MATCH_COUNT || report.design.pairs !== 13_824) fail("canonical paired design is incomplete");
if (!report.gates.passed || Object.entries(report.gates).some(([key, value]) => key !== "passed" && value !== true)) fail("one or more conformance gates failed");
if (report.totals.replayMismatches !== 0 || report.totals.streamMismatches !== 0 || report.totals.attributionMismatches !== 0) fail("replay, stream, or attribution mismatches are nonzero");
process.stdout.write(`attention-v4 activation report verified: ${computedHash}, ${report.design.matches} matches\n`);
