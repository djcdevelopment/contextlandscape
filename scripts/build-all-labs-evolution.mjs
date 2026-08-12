import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const out = resolve("data/lab/all-labs-evolution-analysis");
const story = join(out, "story");
mkdirSync(story, { recursive: true });
const excluded = /(^|-)smoke$|(^|-)check|candidate|compose|night-check|shard-check|local-check|tuning-check|analytics-check|docker-/i;
const substantive = (name, directory) => !excluded.test(name) && ["ASSESSMENT.md", "report.json", "manifest.json", "PLAN.json"].some((file) => existsSync(join(directory, file)));
const dirs = [];
for (const base of ["data/lab", "data/experiments"]) {
  const absolute = join(root, base);
  if (!existsSync(absolute)) continue;
  for (const name of readdirSync(absolute, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    const directory = join(absolute, name);
    if (substantive(name, directory)) dirs.push({ name, path: `${base}/${name}`, directory });
  }
}
const parseJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
const classify = (name) => {
  if (/sleep/i.test(name)) return "sleep/context";
  if (/v1r1|duel-v1/i.test(name)) return "attention-v1";
  if (/v2/i.test(name)) return "attention-v2";
  if (/v3/i.test(name)) return "attention-v3";
  return "supporting-research";
};
const rows = dirs.map((d) => {
  const report = parseJson(join(d.directory, "report.json"));
  const manifest = parseJson(join(d.directory, "manifest.json"));
  const assessment = existsSync(join(d.directory, "ASSESSMENT.md"));
  const raw = Boolean(report && (report.runs || report.plannedRuns || report.records));
  return {
    id: d.name, path: d.path, family: classify(d.name), runs: report?.runs ?? report?.plannedRuns ?? report?.records ?? null,
    campaignKind: report?.campaignKind ?? manifest?.campaignKind ?? null,
    modelVersion: report?.modelVersion ?? manifest?.modelVersion ?? null,
    hasManifest: Boolean(manifest || existsSync(join(d.directory, "manifest.json"))),
    hasReport: Boolean(report), hasAssessment: assessment,
    evidenceTier: /preflight|dryrun|local/i.test(d.name) ? (assessment ? "narrative-synthesis" : "supporting-provenance") : raw ? "fresh-aggregate" : assessment ? "narrative-synthesis" : "supporting-provenance",
    reportHash: report?.reportHash ?? null, manifestHash: report?.manifestHash ?? manifest?.provenance?.manifestHash ?? null
  };
});
const totals = rows.reduce((a, r) => { if (typeof r.runs === "number") a.runs += r.runs; a[r.evidenceTier] += 1; return a; }, { runs: 0, "fresh-aggregate": 0, "narrative-synthesis": 0, "supporting-provenance": 0 });
const source = { generatedAt: new Date().toISOString(), repository: "djcdevelopment/contextlandscape", sourceUniverse: ["data/lab", "data/experiments"], included: rows.length, excludedRule: excluded.source, totals };
const catalog = { source, labs: rows, catalogHash: null };
catalog.catalogHash = `sha256:${createHash("sha256").update(JSON.stringify({ source, labs: rows })).digest("hex")}`;
writeFileSync(join(out, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(join(out, "cross-lab-summary.csv"), ["id,family,evidenceTier,runs,campaignKind,modelVersion,hasManifest,hasReport,hasAssessment,manifestHash,reportHash", ...rows.map((r) => [r.id,r.family,r.evidenceTier,r.runs??"",r.campaignKind??"",r.modelVersion??"",r.hasManifest,r.hasReport,r.hasAssessment,r.manifestHash??"",r.reportHash??""].map((x) => `"${String(x).replaceAll('"','""')}"`).join(","))].join("\n") + "\n");
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
function chart(file, title, values, formatter = (x) => x.toLocaleString()) {
  const max = Math.max(...values.map((v) => v.value), 1), bars = values.map((v, i) => { const x = 90 + i * 170, h = 300 * v.value / max; return `<rect x="${x}" y="390" width="100" height="-${h}" fill="#14b8a6"/><text x="${x+50}" y="420" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="12">${esc(v.label)}</text><text x="${x+50}" y="${380-h}" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="14">${esc(formatter(v.value))}</text>`; }).join("");
  writeFileSync(join(out, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500"><rect width="100%" height="100%" fill="#0b1220"/><text x="50" y="55" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="700">${esc(title)}</text><line x1="60" y1="390" x2="1150" y2="390" stroke="#64748b"/>${bars}</svg>\n`);
}
chart("01-lab-count-by-family.svg", "Substantive labs by research family", [...new Set(rows.map((r) => r.family))].map((family) => ({ label: family, value: rows.filter((r) => r.family === family).length })));
chart("02-run-volume-by-family.svg", "Recorded run volume by research family", [...new Set(rows.map((r) => r.family))].map((family) => ({ label: family, value: rows.filter((r) => r.family === family).reduce((a, r) => a + (r.runs || 0), 0) })));
chart("03-evidence-tier.svg", "Evidence tier coverage", Object.entries({ "fresh-aggregate": totals["fresh-aggregate"], "narrative-synthesis": totals["narrative-synthesis"], "supporting-provenance": totals["supporting-provenance"] }).map(([label, value]) => ({ label, value })));
chart("04-milestone-volume.svg", "Major scale milestones", [{ label: "v1r1", value: 674000 }, { label: "v2", value: 9216000 }, { label: "artillery", value: 9216000 }, { label: "mechanism", value: 1411200 }, { label: "desperation", value: 720000 }]);
const rawLink = (row) => `../${row.path}`;
const chapters = [
  ["C01-overview.md", "Chapter 1 — Overview: The Lab Program", "This is the story of a research program, not a single campaign. We moved from context and sleep experiments into attention-economy baselines, broad landscape screens, executable v3 mechanics, artillery, and desperation-state testing. The common thread is an evidence loop: define a question, freeze an experiment, run deterministic worlds, validate provenance, then learn what the result can and cannot support."],
  ["C02-source-universe.md", "Chapter 2 — Source Universe and Inclusion Rules", `The atlas inventories ${rows.length} substantive directories across data/lab and data/experiments. Fresh aggregate analysis is reserved for records that can be read and counted; existing assessments and plans become narrative synthesis; infrastructure-only checks are excluded and recorded by rule. The catalog is the authoritative inclusion list: [catalog.json](../catalog.json).`],
  ["C03-chronology.md", "Chapter 3 — Chronology and Cross-Lab Transitions", "The chronology begins with sleep/context and doctrine work, moves through v1r1’s frozen baseline, discovers the causal defect in the first v2 screen, repairs it in the corrected v2 campaign, and then climbs the v3 capability ladder. Each transition is a response to an evidence boundary: what was missing became the next experiment’s design requirement."],
  ["C04-volume-and-throughput.md", "Chapter 4 — Volume, Throughput, and Scale", "The program spans hundreds of thousands to many millions of deterministic matches. Scale made small paired effects measurable and allowed broad coverage, but the invalid v2 screen proved that volume cannot repair a missing causal path. The [volume chart](../04-milestone-volume.svg) is a milestone map, not a claim that the largest run is automatically the best evidence."],
  ["C05-descriptive-statistics.md", "Chapter 5 — Descriptive Statistics", "Across labs, the first slice is always descriptive: counts, rates, distributions, terminal reasons, drift, progress, rounds, retries, reachability, and missing fields. These summaries provide denominators and reveal whether an experiment actually exercised the mechanism it was intended to study."],
  ["C06-paired-experiments.md", "Chapter 6 — Paired and Common-World Experiments", "Common seeds, mirrored seats, movement-identical controls, and matched cells are the program’s recurring comparison tools. They reduce irrelevant world noise and make treatment-minus-control effects interpretable. The same design logic appears in v1r1 gates, corrected v2 comparisons, artillery mechanism contrasts, and desperation cohorts."],
  ["C07-uncertainty-and-intervals.md", "Chapter 7 — Uncertainty and Intervals", "Win rates use explicit denominators and interval estimates; continuous effects use uncertainty around means or paired-cell contrasts. The program treats confidence intervals as conditional on the frozen design. They quantify sampling uncertainty, not untested generalization."],
  ["C08-causal-inference.md", "Chapter 8 — Causal Inference", "The key evolution was from labels and broad screens toward executable causal paths. The corrected v2 campaign repaired commander behavior. The v3 ladder added UAP, spatial spawning, and artillery as real resolver mechanics. The desperation campaign assigned policy arms before the state was reached and linked decisions to terminal outcomes."],
  ["C09-event-sequence-analysis.md", "Chapter 9 — Event and Sequence Analysis", "A match is a sequence of state transitions. Event telemetry lets us separate declaration, validation, blocking, establishment, resolution, drift, and terminal consequences. This is especially important for artillery and desperation actions, where the interesting question is not merely whether a shell was fired but what it changed afterward."],
  ["C10-heterogeneity-and-interactions.md", "Chapter 10 — Heterogeneity and Interactions", "Average effects can hide scenario, seat, composition, soundness, spatial-pressure, doctrine, and version interactions. The atlas preserves these factors so a result can be read at the level where it is actually stable. Cross-lab comparisons will distinguish a family-wide pattern from a single favorable matchup."],
  ["C11-identifiability-and-sensitivity.md", "Chapter 11 — Identifiability and Sensitivity", "The first v2 screen taught the strongest lesson: a complete artifact can still be causally uninformative. Later work made action state, target state, and terminal linkage explicit. Remaining sensitivities include drift thresholds, desperation thresholds, fixed HE soundness, Smoke duration, and the absence of a calibrated win-probability branch."],
  ["C12-provenance-and-reproducibility.md", "Chapter 12 — Provenance and Reproducibility", "Manifests, source revisions, model versions, random streams, shard markers, hashes, reports, assessments, and archives form a chain. The cross-lab catalog adds one more layer: a manifest of what was included, why it was included, and what evidence tier it occupies."],
  ["C13-sleep-and-context-labs.md", "Chapter 13 — Sleep, Context, and Doctrine Labs", "The sleep and deep-context labs are part of the evolution because they shaped how we manage context, documentation, bottlenecks, and doctrine. They are not attention-match causal results, but they are substantive research artifacts that explain the program’s operating discipline and later reproducibility practices."],
  ["C14-attention-v1-and-v1r1.md", "Chapter 14 — Attention v1 and v1r1", "v1r1 established the accepted baseline for Scout, Siege, movement, capacity, and stationary escort behavior. It also preserved a failed Macro Flare gate rather than rewriting the result. That decision established the project’s habit of separating accepted evidence, failed criteria, and future tuning."],
  ["C15-v2-landscape-and-correction.md", "Chapter 15 — v2 Landscape and Correction", "The broad v2 screen reached 9.216M runs, but the first version did not execute commander modules in match behavior. Its forensic assessment remains valuable for integrity and narrow rule sensitivity, while the corrected campaign repaired the causal path and created a legitimate refinement lineage."],
  ["C16-v3-mechanics-ladder.md", "Chapter 16 — The v3 Mechanics Ladder", "Stage A added explicit UAP. Stage B added spatial artifact placement and support scans. Stage C added artillery. C1 through C6 then tested response doctrines, adaptive behavior, rule sets, generalization, three-response holdouts, and full-envelope replication before the large artillery campaigns."],
  ["C17-artillery-causal-and-mechanism.md", "Chapter 17 — Artillery Causal and Mechanism Results", "The artillery causal run and mechanism screen isolated Flare, Chaff, reload, soundness, spatial pressure, and doctrine effects. The mechanism screen’s key contribution was estimand discipline: symmetric loadouts were not treated as unconditional efficacy estimates; doctrines were compared against movement-identical pass controls."],
  ["C18-desperation-artillery.md", "Chapter 18 — Desperation Artillery", "The 720k campaign finally made the Hail Mary question measurable. Passive, HE, and Smoke arms were balanced at the exact progress/backlog state. The current assessment finds Smoke strongly positive in this design, HE nearly flat on wins with measurable immediate-drift risk, and no basis for calling either universally optimal outside the tested state."],
  ["C19-lessons-and-next-campaigns.md", "Chapter 19 — Lessons and Next Campaigns", "The program’s evolution points toward calibrated win-probability estimation, EMP-versus-Smoke separation, threshold sensitivity, fresh-seed holdouts, and stronger cross-lab meta-analysis. The next campaign should be chosen to reduce the largest remaining uncertainty, not simply to increase run count."],
  ["C20-project-links-sources-feedback.md", "Chapter 20 — Project Links, Sources, and Feedback", "The project is [contextlandscape](https://github.com/djcdevelopment/contextlandscape). Start with the [catalog](../catalog.json), [cross-lab CSV](../cross-lab-summary.csv), and the linked source directories. Method sources include Wilson score intervals, Efron–Tibshirani bootstrap methods, and paired/common-world potential-outcomes reasoning. Feedback is welcome on inclusion rules, estimands, evidence boundaries, and which future lab would most efficiently improve the program."]
];
for (const [file, title, body] of chapters) writeFileSync(join(story, file), `# ${title}\n\n${body}\n\n## Evidence index\n\n- [All-labs catalog](../catalog.json)\n- [Cross-lab summary](../cross-lab-summary.csv)\n- [Lab directories](../../)\n\nCatalog hash: \`${catalog.catalogHash}\`\n`);
const assessment = { catalogHash: catalog.catalogHash, includedLabs: rows.length, totals, families: [...new Set(rows.map((r) => r.family))], chapters: chapters.length, charts: 4, exclusionRule: excluded.source };
writeFileSync(join(out, "assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`);
writeFileSync(join(out, "ASSESSMENT.md"), `# All-labs evolution assessment\n\nThe atlas inventories **${rows.length} substantive labs** across data/lab and data/experiments. It contains ${totals["fresh-aggregate"]} fresh-aggregate candidates, ${totals["narrative-synthesis"]} narrative-synthesis sources, and ${totals["supporting-provenance"]} supporting provenance sources. Recorded run volume across discovered reports is **${totals.runs.toLocaleString()}**.\n\nSee the [20-chapter story](story/C01-overview.md), [catalog](catalog.json), and [cross-lab summary](cross-lab-summary.csv).\n\nCatalog hash: ${catalog.catalogHash}\n`);
writeFileSync(join(out, "ARCHIVE_README.md"), `# All-labs evolution atlas\n\nThis is an additive cross-lab synthesis. Existing campaign bundles are preserved and linked; this atlas does not replace or rewrite them.\n\nCatalog hash: ${catalog.catalogHash}\n`);
console.log(JSON.stringify({ status: "pass", output: out, labs: rows.length, recordedRuns: totals.runs, chapters: chapters.length, catalogHash: catalog.catalogHash }, null, 2));
