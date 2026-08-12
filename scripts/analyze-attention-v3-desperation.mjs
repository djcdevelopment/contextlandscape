import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const matrixDir = resolve(args.matrix ?? "data/lab/attention-v3-desperation-artillery-20260811-720k-five-drift");
const outputDir = resolve(args.out ?? `${matrixDir}-analysis`);
const storyDir = join(outputDir, "story");
mkdirSync(storyDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(matrixDir, "manifest.json"), "utf8"));
const report = JSON.parse(readFileSync(join(matrixDir, "report.json"), "utf8"));
const sha = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const wilson = (successes, n, z = 1.96) => {
  if (!n) return [0, 0];
  const p = successes / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
};
const meanCI = (values) => {
  if (!values.length) return [0, 0];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const half = 1.96 * Math.sqrt(variance / values.length);
  return [mean - half, mean + half];
};
const stats = new Map();
const ensure = (cohort) => {
  if (!stats.has(cohort)) stats.set(cohort, { cohort, opportunities: 0, wins: 0, immediateDriftDefeats: 0, finalDrift: [], nextProgress: [], actionProgress: [], affectedArtifacts: 0, affectedUnits: 0 });
  return stats.get(cohort);
};
const files = (await readdir(matrixDir)).filter((name) => /^shard-\d+\.jsonl\.gz$/.test(name)).sort();
let records = 0, opportunities = 0;
for (const name of files) {
  const rl = createInterface({ input: createReadStream(join(matrixDir, name)).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const record = JSON.parse(line); records++;
    for (const opp of record.desperationOpportunities ?? []) {
      opportunities++;
      const s = ensure(opp.cohort);
      s.opportunities++;
      s.wins += opp.won ? 1 : 0;
      s.immediateDriftDefeats += opp.sameRoundDriftDefeat ? 1 : 0;
      s.finalDrift.push(opp.finalDrift);
      if (opp.nextRoundProgressGain !== null) s.nextProgress.push(opp.nextRoundProgressGain);
      if (opp.actionRoundProgressGain !== null) s.actionProgress.push(opp.actionRoundProgressGain);
      s.affectedArtifacts += opp.affectedArtifactCount;
      s.affectedUnits += opp.affectedUnitCount;
    }
  }
}
if (records !== Number(report.runs)) throw new Error(`Expected ${report.runs} records, observed ${records}`);
const cohortRows = [...stats.values()].map((s) => ({
  cohort: s.cohort, opportunities: s.opportunities, wins: s.wins,
  winRate: s.wins / s.opportunities, winRate95: wilson(s.wins, s.opportunities),
  immediateDriftDefeats: s.immediateDriftDefeats,
  immediateDriftRate: s.immediateDriftDefeats / s.opportunities,
  immediateDriftRate95: wilson(s.immediateDriftDefeats, s.opportunities),
  meanFinalDrift: s.finalDrift.reduce((a, b) => a + b, 0) / s.finalDrift.length,
  finalDrift95: meanCI(s.finalDrift),
  nextRoundN: s.nextProgress.length,
  nextRoundMeanProgress: s.nextProgress.length ? s.nextProgress.reduce((a, b) => a + b, 0) / s.nextProgress.length : null,
  nextRoundProgress95: meanCI(s.nextProgress),
  nextRoundProgressSD: s.nextProgress.length ? Math.sqrt(s.nextProgress.reduce((a, b) => a + (b - s.nextProgress.reduce((x, y) => x + y, 0) / s.nextProgress.length) ** 2, 0) / Math.max(1, s.nextProgress.length - 1)) : null,
  actionRoundMeanProgress: s.actionProgress.length ? s.actionProgress.reduce((a, b) => a + b, 0) / s.actionProgress.length : null,
  affectedArtifacts: s.affectedArtifacts, affectedUnits: s.affectedUnits
}));
const byCohort = Object.fromEntries(cohortRows.map((row) => [row.cohort, row]));
const evidence = {
  analysisKind: "attention-v3-desperation-artillery-assessment",
  source: { matrixId: manifest.matrixId, manifestHash: manifest.provenance.manifestHash, reportHash: report.reportHash, runs: report.runs, records, opportunities },
  cohorts: cohortRows,
  contrasts: ["hail-mary-he", "disruptive-smoke"].map((cohort) => ({
    treatment: cohort, control: "passive",
    winRateDelta: byCohort[cohort].winRate - byCohort.passive.winRate,
    finalDriftDelta: byCohort[cohort].meanFinalDrift - byCohort.passive.meanFinalDrift,
    nextRoundSDDelta: (byCohort[cohort].nextRoundProgressSD ?? 0) - (byCohort.passive.nextRoundProgressSD ?? 0)
  })),
  interpretation: "The preregistered desperation state is progress-based (self <= 6, opponent >= 10, own pending >= 3). The uncalibrated <15% win-probability branch is not retrofitted into this assessment."
};
evidence.analysisHash = sha(evidence);
writeFileSync(join(outputDir, "assessment.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(join(outputDir, "cohort-comparison.csv"), ["cohort,opportunities,wins,winRate,winRateLow,winRateHigh,immediateDriftRate,meanFinalDrift,nextRoundN,nextRoundMeanProgress,nextRoundProgressSD,affectedArtifacts,affectedUnits", ...cohortRows.map((r) => [r.cohort,r.opportunities,r.wins,r.winRate,r.winRate95[0],r.winRate95[1],r.immediateDriftRate,r.meanFinalDrift,r.nextRoundN,r.nextRoundMeanProgress,r.nextRoundProgressSD,r.affectedArtifacts,r.affectedUnits].join(","))].join("\n") + "\n");
const colors = { passive: "#6b7280", "hail-mary-he": "#ef4444", "disruptive-smoke": "#14b8a6" };
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
function barChart(file, title, key, formatter = (x) => x.toFixed(3)) {
  const width = 1000, height = 560, base = 450, max = Math.max(...cohortRows.map((r) => Number(r[key]) || 0), 1);
  const bars = cohortRows.map((r, i) => { const value = Number(r[key]) || 0; const h = 330 * value / max; const x = 150 + i * 250; return `<rect x="${x}" y="${base-h}" width="130" height="${h}" rx="8" fill="${colors[r.cohort]}"/><text x="${x+65}" y="${base+28}" text-anchor="middle" font-family="sans-serif" font-size="17">${esc(r.cohort)}</text><text x="${x+65}" y="${base-h-12}" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700">${esc(formatter(value))}</text>`; }).join("");
  writeFileSync(join(outputDir, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0b1220"/><text x="50" y="60" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="700">${esc(title)}</text><line x1="100" y1="${base}" x2="900" y2="${base}" stroke="#94a3b8"/>${bars}</svg>\n`);
}
barChart("01-win-rate.svg", "Terminal win rate by desperation cohort", "winRate", (x) => `${(x*100).toFixed(2)}%`);
barChart("02-final-drift.svg", "Average final drift", "meanFinalDrift", (x) => x.toFixed(3));
barChart("03-immediate-drift.svg", "Immediate same-round five-drift defeat rate", "immediateDriftRate", (x) => `${(x*100).toFixed(3)}%`);
barChart("04-next-round-variance.svg", "Next-round progress standard deviation", "nextRoundProgressSD", (x) => x.toFixed(3));
barChart("05-next-round-mean.svg", "Mean next-round progress gain", "nextRoundMeanProgress", (x) => x.toFixed(3));
const rawRel = `../../${basename(matrixDir)}`;
const chapter = (name, title, body) => writeFileSync(join(storyDir, name), `# ${title}\n\n${body}\n\n## Source binding\n\nCampaign manifest: [manifest.json](${rawRel}/manifest.json)  \nCompletion report: [report.json](${rawRel}/report.json)  \nAssessment: [assessment.json](../assessment.json)  \nAnalysis hash: \`${evidence.analysisHash}\`\n`);
chapter("C01-overview.md", "Chapter 1 — Overview: From Match Runs to Evidence", `This project studies an attention-economy battle engine by turning explicit rules, deterministic seeds, and recorded state transitions into inspectable evidence. A run begins with a versioned manifest, model, scenario, compositions, policies, and seed. The resolver emits artifacts, applies movement and artillery, resolves command choices, and records terminal outcomes. The current campaign adds a preregistered desperation state and links each eligible artillery decision to the immediate and following-turn consequences.\n\nThe evidence chain is: source code → frozen manifest → deterministic shards → completion report → statistical assessment → narrative chapters. The latest campaign is a 720,000-match, five-drift experiment with passive, HE, and Smoke arms.`);
chapter("C02-volume.md", "Chapter 2 — Volume: Why 9mm Matters", `The project grew from the 674,000-run v1r1 baseline to 9,216,000-run v2 screens, then to v3’s bounded mechanics probes, a 9,216,000-run artillery causal campaign, a 1,411,200-run mechanism screen, and this 720,000-run desperation campaign. Volume provides repeated common-world comparisons, coverage across scenarios and variants, and enough observations to estimate small effects. It does not rescue a bad estimand: the first v2 screen was retained as integrity evidence because commander behavior was not causally connected to matches.\n\nThe current raw matrix is sharded, gzip-compressed, hash-bound, and fully replayable.`);
chapter("C03-descriptive-statistics.md", "Chapter 3 — Descriptive Statistics", `The first pass is a census: opportunities, wins, final drift, immediate drift defeats, action-round progress, next-round progress, target reachability, and affected artifacts or units. Descriptive statistics establish denominators before interpretation. The generated comparison table and SVGs report each cohort separately, including intervals and missingness rather than silently dropping unavailable next-turn observations.\n\nCharts: [win rate](../01-win-rate.svg), [final drift](../02-final-drift.svg), and [next-round mean](../05-next-round-mean.svg).`);
chapter("C04-paired-contrasts.md", "Chapter 4 — Paired and Common-World Contrasts", `The treatment arms are assigned before play and share seeds, scenario factors, compositions, and pressure structure. Passive is the control; HE and Smoke are compared against it using the same campaign design. This makes the central estimands treatment-minus-control differences, not unconditional arm win rates. Mirrored seats and repeated variants expose whether a result survives orientation and context changes.`);
chapter("C05-confidence-intervals.md", "Chapter 5 — Confidence Intervals and Uncertainty", `Win and immediate-defeat rates use Wilson 95% intervals. Continuous outcomes use mean estimates with normal 95% intervals in the generated assessment; paired-cell bootstrap intervals can be added for follow-up contrasts where cell-level resampling is required. Intervals describe sampling uncertainty under this fixed campaign design; they do not widen the evidence boundary to untested rules or players.`);
chapter("C06-causal-inference.md", "Chapter 6 — Causal Inference and Estimands", `The desperation campaign improves causal identification by defining eligibility before action, assigning policy arms ex ante, keeping pre-treatment behavior aligned, and recording the action, target, same-round drift linkage, terminal state, and next-round progress. The primary estimand is the effect of choosing HE or Smoke rather than passive triage conditional on the exact progress/backlog state. The uncalibrated <15% win-probability alternative is intentionally not retrofitted.`);
chapter("C07-event-and-sequence-analysis.md", "Chapter 7 — Event and Sequence Analysis", `Artillery is a sequence, not a single counter: a desperation opportunity is observed, a shell is declared, Chaff may block it, HE may resolve artifacts, Smoke may suppress later emissions, drift or progress may change immediately, and a following round may reveal persistence. The event-linked records let us distinguish “fired” from “landed,” “landed” from “affected,” and “affected” from “improved the terminal outcome.”`);
chapter("C08-heterogeneity-and-interactions.md", "Chapter 8 — Heterogeneity and Interactions", `Aggregate effects can conceal structure. The analysis therefore keeps scenario, soundness, spatial pressure, seat, composition, and policy factors available for stratified contrasts. A useful next read is whether HE’s fixed 70% resolution behaves differently when the backlog is dense, whether Smoke matters more against stationary recon leaders, and whether any apparent treatment advantage is concentrated in one orientation.`);
chapter("C09-identifiability-and-sensitivity.md", "Chapter 9 — Identifiability and Sensitivity", `Earlier runs taught the project to state what cannot be learned. The old artillery runs could not identify HE or Smoke because those actions did not exist and action-time state was absent. The current run fixes that gap, but remains conditional on the five-drift rule, the exact desperation thresholds, the fixed HE soundness, the chosen pressure compositions, and the implemented Smoke duration. Threshold sweeps and calibrated win-probability models belong to a follow-up, not a retrospective reclassification.`);
chapter("C10-provenance-and-reproducibility.md", "Chapter 10 — Provenance and Reproducibility", `Every stage is content-addressed: source revision, model and contract version, manifest hash, shard completion markers, report hash, assessment hash, and deterministic random streams. The raw records are immutable inputs; the analysis is a derived artifact that can be regenerated and checked. The final archive will include checksums and restoration notes so another machine can verify the same evidence chain.`);
chapter("C11-evolution-and-lessons.md", "Chapter 11 — The Evolution of the 9mm Program", `The story is iterative. v1r1 established a frozen baseline. The first v2 9.216M screen revealed that scale without causal wiring only produces integrity evidence. The corrected v2 campaign repaired that path. v3 then advanced through bounded UAP, spatial, and artillery probes before the larger causal campaign. The mechanism screen isolated Flare, Chaff, reload, soundness, and spatial pressure. The Hail Mary campaign is the next refinement: it turns an exciting hypothesis into a measurable, action-linked experiment.`);
chapter("C12-next-moves.md", "Chapter 12 — What Comes Next", `Next steps are to read the completed cohort assessment, inspect heterogeneity before declaring an optimal policy, calibrate a genuine win-probability model if the <15% branch is still desired, and run a paired EMP-versus-Smoke campaign with the same telemetry. Any promoted conclusion should survive fresh seeds, threshold sensitivity, and a holdout. The project should keep separating mechanism reachability, causal efficacy, and generalization.`);
chapter("C13-project-links-and-feedback.md", "Chapter 13 — Project Links, Sources, and Feedback", `The project repository is [contextlandscape](https://github.com/djcdevelopment/contextlandscape). Start with the campaign [manifest](${rawRel}/manifest.json), [completion report](${rawRel}/report.json), [assessment](../assessment.json), and generated [cohort CSV](../cohort-comparison.csv). Historical context is in the v1r1 decision, corrected v2 assessment, v3 experimental design, and prior artillery assessments in the repository.\n\nMethod references: Wilson’s score interval for binomial proportions; Efron and Tibshirani’s bootstrap framework; and the potential-outcomes/common-world framing for paired causal comparisons. Feedback is welcome, especially on estimands, missing counterfactuals, scenario coverage, and which follow-up campaign would most efficiently reduce uncertainty.`);
writeFileSync(join(outputDir, "ASSESSMENT.md"), `# Desperation artillery assessment\n\nThe complete ${records.toLocaleString()} records yielded ${opportunities.toLocaleString()} desperation opportunities.\n\n| Cohort | Opportunities | Win rate | Immediate drift defeat | Next-round observations |\n|---|---:|---:|---:|---:|\n${cohortRows.map((r) => `| ${r.cohort} | ${r.opportunities.toLocaleString()} | ${(r.winRate*100).toFixed(3)}% | ${(r.immediateDriftRate*100).toFixed(3)}% | ${r.nextRoundN.toLocaleString()} |`).join("\n")}\n\nThis is a descriptive and paired campaign assessment. See the independent chapters in [story](story/C01-overview.md).\n\nManifest: \`${manifest.provenance.manifestHash}\`  \nReport: \`${report.reportHash}\`  \nAnalysis: \`${evidence.analysisHash}\`\n`);
console.log(JSON.stringify({ status: "pass", outputDir, records, opportunities, analysisHash: evidence.analysisHash, chapters: 13, charts: 5 }, null, 2));
