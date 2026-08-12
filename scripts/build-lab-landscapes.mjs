import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { createGunzip, gzipSync } from "node:zlib";

const root = resolve(".");
const atlasPath = join(root, "data/lab/lab-topography-atlas-v1/atlas.json");
const commanderPath = join(root, "data/lab/attention-v2-corrected-shape-screen-analysis/assessment.json");
const artilleryPath = join(root, "data/lab/attention-v3-artillery-mechanism-screen-20260811-1m4-five-drift-analysis/assessment.json");
const desperationAssessmentPath = join(root, "data/lab/attention-v3-desperation-artillery-20260811-720k-five-drift-analysis/assessment.json");
const desperationMatrix = join(root, "data/lab/attention-v3-desperation-artillery-20260811-720k-five-drift");
const outputDirectory = join(root, "data/lab/lab-topography-atlas-v1");
const publicDirectory = join(root, "apps/web/public/atlas");
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(publicDirectory, { recursive: true });

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const round = (value, digits = 6) => Number(value.toFixed(digits));
const atlas = readJson(atlasPath);
const commanderSource = readJson(commanderPath);
const artillerySource = readJson(artilleryPath);
const desperationAssessment = readJson(desperationAssessmentPath);
const desperationManifest = readJson(join(desperationMatrix, "manifest.json"));
const desperationReport = readJson(join(desperationMatrix, "report.json"));

function classifyPurpose(id) {
  if (/desperation/i.test(id)) return "desperation-policy";
  if (/artillery.*(causal|mechanism)|stage-c/i.test(id)) return /holdout|replication/i.test(id) ? "mechanic-holdout" : "mechanic-probe";
  if (/holdout/i.test(id)) return "holdout";
  if (/shape|landscape/i.test(id)) return "shape-screen";
  if (/train/i.test(id)) return "training-screen";
  if (/probe|audit/i.test(id)) return "mechanic-probe";
  if (/analysis|summary|evolution|topography/i.test(id)) return "synthesis";
  return "research-artifact";
}

function capabilities(lab) {
  const absolute = join(root, lab.path);
  const report = existsSync(join(absolute, "report.json")) ? readJson(join(absolute, "report.json")) : null;
  const assessment = existsSync(join(absolute, "assessment.json")) ? readJson(join(absolute, "assessment.json")) : null;
  const serialized = JSON.stringify({ report, assessment });
  return {
    catalog: true,
    aggregateMetrics: Boolean(report || assessment),
    abilityTelemetry: /(perfectFocusUses|overclockUses|macroFlareUses|artilleryFunnel|shellsFired|supportScans|uplinks)/.test(serialized),
    causalFactors: /(causalContrast|paired|contrasts|overallEffects|factorLevels)/.test(serialized),
    spatialTargets: /(artilleryTargets|targetOffset|targetBasis|spatialPressure)/.test(serialized),
    temporalTrace: lab.id === desperationManifest.matrixId,
    exemplarReplay: lab.id === desperationManifest.matrixId
  };
}

const catalog = atlas.nodes.map((lab) => ({
  id: lab.id,
  path: lab.path,
  purpose: classifyPurpose(lab.id),
  capabilities: capabilities(lab),
  adapter: /attention-v2-corrected-shape-screen-analysis/.test(lab.id)
    ? "commander-field"
    : /attention-v3-artillery-mechanism-screen-20260811-1m4-five-drift-analysis/.test(lab.id)
      ? "artillery-relief"
      : lab.id === desperationManifest.matrixId || /attention-v3-desperation-artillery-20260811-720k-five-drift-analysis/.test(lab.id)
        ? "desperation-theatre"
        : null
}));

const axis = {
  composition: [...new Set(commanderSource.commanders.map((row) => row.compositionModule))].sort(),
  movement: [...new Set(commanderSource.commanders.map((row) => row.movementModule))].sort(),
  triage: [...new Set(commanderSource.commanders.map((row) => row.triageModule))].sort(),
  capacity: [...new Set(commanderSource.commanders.map((row) => row.capacityModule))].sort()
};
const commanderMetricIds = Object.keys(commanderSource.commanders[0].mechanicRates);
const commanderMetricMaxima = Object.fromEntries(commanderMetricIds.map((metric) => [metric, Math.max(...commanderSource.commanders.map((row) => row.mechanicRates[metric] ?? 0), 1e-9)]));
const commanderCells = commanderSource.commanders.map((row) => ({
  id: row.commanderId,
  ordinal: row.ordinal,
  x: axis.composition.indexOf(row.compositionModule) * axis.movement.length + axis.movement.indexOf(row.movementModule),
  y: axis.triage.indexOf(row.triageModule) * axis.capacity.length + axis.capacity.indexOf(row.capacityModule),
  modules: {
    composition: row.compositionModule,
    movement: row.movementModule,
    triage: row.triageModule,
    capacity: row.capacityModule
  },
  appearances: row.appearances,
  outcomes: {
    scoreRate: row.scoreRate,
    winRate: row.winRate,
    drawRate: row.drawRate,
    meanProgress: row.meanProgress,
    meanDrift: row.meanDrift,
    interval95: row.multiplicityAdjusted95
  },
  abilities: Object.fromEntries(commanderMetricIds.map((metric) => [metric, row.mechanicRates[metric] ?? 0]))
}));
const commanderIds = new Set(commanderCells.map((cell) => cell.id));
const commanderCoordinates = new Set(commanderCells.map((cell) => `${cell.x},${cell.y}`));
if (commanderCells.length !== 6400 || commanderIds.size !== 6400 || commanderCoordinates.size !== 6400) throw new Error("Commander Field must contain exactly 6,400 unique cells");
if (axis.composition.length !== 10 || axis.movement.length !== 8 || axis.triage.length !== 10 || axis.capacity.length !== 8) throw new Error("Commander doctrine axes do not form the expected 80 by 80 field");

const artilleryOrder = ["none", "chaff-only", "flare-only", "combined"];
const supplyOrder = ["one-shot", "reload"];
const artilleryCells = Object.entries(artillerySource.mechanismRates).flatMap(([key, value]) => {
  if (key === "none") return supplyOrder.map((supply) => ({ package: "none", supply, ...value }));
  const [artilleryPackage, supply] = key.split(":");
  return [{ package: artilleryPackage, supply, ...value }];
}).map((row) => ({
  id: `${row.package}:${row.supply}`,
  x: artilleryOrder.indexOf(row.package),
  y: supplyOrder.indexOf(row.supply),
  package: row.package,
  supply: row.supply,
  playerRuns: row.playerRuns,
  metrics: {
    declarationRate: row.declarationRate,
    shellsPer1000PlayerRuns: row.shellsPer1000PlayerRuns,
    reloadsPer1000PlayerRuns: row.reloads / row.playerRuns * 1000,
    generatedPer1000PlayerRuns: row.generated / row.playerRuns * 1000,
    blockedPer1000PlayerRuns: row.hostileBlocked / row.playerRuns * 1000,
    driftDefeatsPer1000PlayerRuns: row.inducedDriftDefeatsPer1000PlayerRuns
  },
  totals: {
    considered: row.considered,
    declared: row.declared,
    fired: row.fired,
    flareEstablished: row.flareEstablished,
    reloads: row.reloads,
    generated: row.generated,
    unsound: row.unsound,
    driftDefeats: row.driftDefeats,
    hostileBlocked: row.hostileBlocked
  }
}));
if (artilleryCells.length !== 8 || new Set(artilleryCells.map((cell) => cell.id)).size !== 8) throw new Error("Artillery Relief must contain the complete four-by-two package/supply grid");
const artilleryFired = Object.values(artillerySource.mechanismRates).reduce((sum, row) => sum + row.fired, 0);
if (artilleryFired !== artillerySource.artilleryFunnel.fired) throw new Error(`Artillery fired reconciliation failed: ${artilleryFired} versus ${artillerySource.artilleryFunnel.fired}`);

const cohortStats = new Map();
const exemplarCandidates = new Map();
const cohortByPolicy = {
  "v3-desperation-passive": "passive",
  "v3-desperation-he": "hail-mary-he",
  "v3-desperation-smoke": "disruptive-smoke"
};
const ensureCohort = (cohort) => {
  if (!cohortStats.has(cohort)) cohortStats.set(cohort, {
    opportunities: 0, wins: 0, immediateDriftDefeats: 0,
    rounds: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index + 1, { opportunities: 0, fullPasses: 0, fullActions: 0, traceObserved: 0, tracePasses: 0, traceActions: 0 }])),
    coordinates: {}
  });
  if (!exemplarCandidates.has(cohort)) exemplarCandidates.set(cohort, []);
  return cohortStats.get(cohort);
};
let records = 0;
const shardFiles = readdirSync(desperationMatrix).filter((name) => /^shard-\d+\.jsonl\.gz$/.test(name)).sort();
for (const name of shardFiles) {
  const input = createReadStream(join(desperationMatrix, name)).pipe(createGunzip());
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line) continue;
    const record = JSON.parse(line);
    records += 1;
    for (const player of record.players) {
      const policy = player.playerSlot === 1 ? record.playerOnePolicyId : record.playerTwoPolicyId;
      const cohort = cohortByPolicy[policy];
      if (!cohort || !Array.isArray(player.artilleryDecisionTrace)) continue;
      const stats = ensureCohort(cohort);
      for (const action of player.artilleryDecisionTrace) {
        const roundStats = stats.rounds[action.round];
        if (!roundStats) continue;
        roundStats.traceObserved += 1;
        if (!action.center || action.decision === "pass") roundStats.tracePasses += 1;
        else {
          roundStats.traceActions += 1;
          const key = `${action.center.x},${action.center.y}`;
          if (!stats.coordinates[key]) stats.coordinates[key] = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [index + 1, { actions: 0, wins: 0, immediateDriftDefeats: 0, affectedArtifacts: 0, affectedUnits: 0 }]));
          const coordinate = stats.coordinates[key][action.round];
          const opportunity = record.desperationOpportunities?.find((candidate) => candidate.playerSlot === player.playerSlot && candidate.round === action.round) ?? null;
          coordinate.actions += 1;
          coordinate.wins += opportunity?.won ? 1 : 0;
          coordinate.immediateDriftDefeats += opportunity?.sameRoundDriftDefeat ? 1 : 0;
          coordinate.affectedArtifacts += opportunity?.affectedArtifactCount ?? 0;
          coordinate.affectedUnits += opportunity?.affectedUnitCount ?? 0;
        }
      }
    }
    for (const opportunity of record.desperationOpportunities ?? []) {
      const stats = ensureCohort(opportunity.cohort);
      stats.opportunities += 1;
      stats.wins += opportunity.won ? 1 : 0;
      stats.immediateDriftDefeats += opportunity.sameRoundDriftDefeat ? 1 : 0;
      const player = record.players.find((candidate) => candidate.playerSlot === opportunity.playerSlot);
      const hasTrace = Array.isArray(player?.artilleryDecisionTrace);
      const trace = player?.artilleryDecisionTrace ?? [];
      const action = trace.find((entry) => entry.round === opportunity.round) ?? null;
      const roundStats = stats.rounds[opportunity.round];
      roundStats.opportunities += 1;
      if (opportunity.shell === null) roundStats.fullPasses += 1;
      else roundStats.fullActions += 1;
      if (hasTrace) {
        if (!action) throw new Error(`Trace-sampled desperation opportunity lacks an action entry: ${opportunity.opportunityId}`);
      }
      if (hasTrace) exemplarCandidates.get(opportunity.cohort).push({
        opportunityId: opportunity.opportunityId,
        runId: record.runId,
        cohort: opportunity.cohort,
        round: opportunity.round,
        playerSlot: opportunity.playerSlot,
        action,
        trace,
        baseline: {
          selfProgress: opportunity.selfProgress,
          opponentProgress: opportunity.opponentProgress,
          progressGap: opportunity.progressGap,
          selfDrift: opportunity.selfDrift,
          opponentDrift: opportunity.opponentDrift,
          ownUnverifiedArtifacts: opportunity.ownUnverifiedArtifacts
        },
        outcome: {
          won: opportunity.won,
          finalProgress: opportunity.finalProgress,
          finalDrift: opportunity.finalDrift,
          terminalReason: opportunity.terminalReason,
          sameRoundDriftDefeat: opportunity.sameRoundDriftDefeat,
          actionRoundProgressGain: opportunity.actionRoundProgressGain,
          nextRoundProgressGain: opportunity.nextRoundProgressGain,
          affectedArtifactCount: opportunity.affectedArtifactCount,
          affectedUnitCount: opportunity.affectedUnitCount
        }
      });
    }
  }
}
if (records !== desperationReport.runs) throw new Error(`Desperation record count mismatch: ${records} versus ${desperationReport.runs}`);

const outcomeScore = (row) => row.outcome.finalProgress - row.outcome.finalDrift;
const byScore = (left, right) => outcomeScore(left) - outcomeScore(right) || Number(left.outcome.won) - Number(right.outcome.won) || left.opportunityId.localeCompare(right.opportunityId);
const exemplars = Object.fromEntries([...exemplarCandidates].map(([cohort, rows]) => {
  const ordered = rows.slice().sort(byScore);
  const immediate = rows.filter((row) => row.outcome.sameRoundDriftDefeat).sort((left, right) => left.opportunityId.localeCompare(right.opportunityId))[0] ?? null;
  return [cohort, {
    median: ordered[Math.floor((ordered.length - 1) / 2)],
    best: ordered[ordered.length - 1],
    worst: ordered[0],
    immediateDrift: immediate
  }];
}));
const desperationCohorts = Object.fromEntries([...cohortStats].map(([cohort, stats]) => [cohort, stats]));
for (const published of desperationAssessment.cohorts) {
  const derived = desperationCohorts[published.cohort];
  if (!derived || derived.opportunities !== published.opportunities || derived.wins !== published.wins || derived.immediateDriftDefeats !== published.immediateDriftDefeats) {
    throw new Error(`Desperation reconciliation failed for ${published.cohort}`);
  }
}

const landscapeCore = {
  schemaVersion: "lab-landscapes/v1",
  generatedAt: atlas.generatedAt,
  source: {
    atlasHash: atlas.atlasHash,
    commanderAnalysisHash: commanderSource.analysisHash,
    artilleryAnalysisHash: artillerySource.analysisHash,
    desperationAnalysisHash: desperationAssessment.analysisHash,
    desperationManifestHash: desperationManifest.provenance.manifestHash,
    desperationReportHash: desperationReport.reportHash
  },
  catalog,
  commander: {
    id: "commander-field",
    sourcePath: "data/lab/attention-v2-corrected-shape-screen-analysis/assessment.json",
    dimensions: { columns: 80, rows: 80 },
    axes: axis,
    metricIds: commanderMetricIds,
    metricMaxima: commanderMetricMaxima,
    defaults: { elevation: "uplinkAttentionGenerated", color: "scoreRate" },
    cells: commanderCells
  },
  artillery: {
    id: "artillery-relief",
    sourcePath: "data/lab/attention-v3-artillery-mechanism-screen-20260811-1m4-five-drift-analysis/assessment.json",
    axes: { package: artilleryOrder, supply: supplyOrder },
    defaults: { elevation: "shellsPer1000PlayerRuns", color: "driftDefeatsPer1000PlayerRuns" },
    cells: artilleryCells,
    funnel: artillerySource.artilleryFunnel,
    downstream: artillerySource.downstreamAttribution,
    doctrineContrasts: artillerySource.doctrineContrasts,
    reloadContrasts: artillerySource.reloadContrasts,
    reloadSoloEffects: artillerySource.reloadSoloEffects,
    inference: artillerySource.design
  },
  desperation: {
    id: "desperation-theatre",
    sourcePath: "data/lab/attention-v3-desperation-artillery-20260811-720k-five-drift",
    board: { width: 10, height: 10 },
    rounds: [1, 2, 3, 4, 5],
    defaults: { cohort: "hail-mary-he", round: 3, elevation: "actionsPer1000Opportunities", color: "winRate" },
    cohorts: desperationCohorts,
    published: desperationAssessment.cohorts,
    contrasts: desperationAssessment.contrasts,
    exemplars,
    exemplarSelection: {
      population: "trace-sampled opportunities only (seed modulo 64 equals zero)",
      score: "finalProgress - finalDrift",
      median: "middle opportunity after ascending score, won, opportunityId",
      best: "last opportunity after ascending score, won, opportunityId",
      worst: "first opportunity after ascending score, won, opportunityId",
      immediateDrift: "lexicographically first same-round drift defeat, or null"
    },
    traceSampling: { rule: "seed % 64 === 0", purpose: "target-coordinate and per-round decision playback", fullOpportunityMetricsUseTraceSample: false }
  }
};
const landscapeHash = digest(landscapeCore);
const landscapes = { ...landscapeCore, landscapeHash };
const json = JSON.stringify(landscapes);
const compressed = gzipSync(json, { level: 9 });
writeFileSync(join(outputDirectory, "landscapes.json.gz"), compressed);
writeFileSync(join(publicDirectory, "lab-landscapes-v1.json.gz"), compressed);
writeFileSync(join(outputDirectory, "LANDSCAPES.md"), `# Evidence-driven lab landscapes\n\nThis deterministic package classifies **${catalog.length} labs**, maps **${commanderCells.length.toLocaleString()} commanders**, reconciles **${artillerySource.artilleryFunnel.fired.toLocaleString()} artillery fires**, and derives round/coordinate playback from **${records.toLocaleString()} desperation records**.\n\n- Commander Field height is an ability rate per commander appearance.\n- Artillery Relief height defaults to shells per 1,000 player-runs.\n- Desperation Theatre full-cohort action and outcome rates use all eligible opportunities.\n- Spatial coordinates and exemplars use the campaign's documented 1-in-64 trace sample (\`seed % 64 === 0\`); trace coverage is displayed in the viewer.\n- Outcome and causal-effect colors remain distinct from usage elevation.\n- Individual views are deterministic artillery-decision exemplars, not complete unit-action replays.\n\nLandscape hash: \`${landscapeHash}\`\n`);

console.log(JSON.stringify({ status: "pass", output: join(outputDirectory, "landscapes.json.gz"), compressedBytes: compressed.length, catalog: catalog.length, commanders: commanderCells.length, artilleryCells: artilleryCells.length, desperationRecords: records, landscapeHash }, null, 2));
