import { HearthClient, resolveHearthConfig } from "./hearth.js";
import { seedProblems } from "./problems.js";
import { briefingIds, tiers } from "./prompts.js";
import {
  enumerateCells,
  generateShard,
  readBankAttempts,
  writeManifestAndReport,
  type BankOptions
} from "./bank.js";

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const bankId = arg("bank") ?? "pilot-01";
const outputDir = arg("out") ?? "data/bank";
const shardCount = Math.max(1, Number(arg("shards") ?? 1));
const shardIndex = Math.max(0, Number(arg("shard") ?? 0));
const concurrency = Math.max(1, Number(arg("concurrency") ?? 4));

// `--tiers=line,siege` runs a partial curve when a rung is unavailable. The gate can never report a
// pass from an incomplete curve, so a partial run is exploratory by construction.
const tierFilter = arg("tiers")?.split(",").map((value) => value.trim()).filter(Boolean);
// `--backend-scout=am4-oxen` repoints a chassis at a different rung. The chassis names are the
// game's; which model serves them is fleet configuration and stays out of player-facing content.
const attemptsOverride = arg("attempts") ? Math.max(1, Number(arg("attempts"))) : undefined;
const selectedTiers = (tierFilter?.length ? tiers.filter((tier) => tierFilter.includes(tier.tierId)) : tiers).map(
  (tier) => ({
    ...tier,
    backend: arg(`backend-${tier.tierId}`) ?? tier.backend,
    attemptsPerCell: attemptsOverride ?? tier.attemptsPerCell
  })
);
if (!selectedTiers.length) throw new Error(`no_tiers_selected:${arg("tiers")}`);

// `--only=trap` narrows to problems that carry a literal attractor, for replicating the briefing-bias
// effect without paying to re-measure problems already known to sit at ceiling.
const onlyArg = arg("only");
const selectedProblems = !onlyArg
  ? seedProblems
  : onlyArg === "trap"
    ? seedProblems.filter((problem) => problem.literalAnswer !== undefined)
    : seedProblems.filter((problem) => onlyArg.split(",").map((value) => value.trim()).includes(problem.problemId));
if (!selectedProblems.length) throw new Error(`no_problems_selected:${onlyArg}`);

const briefingFilter = arg("briefings")?.split(",").map((value) => value.trim()).filter(Boolean);
const selectedBriefings = briefingFilter?.length
  ? briefingIds.filter((briefingId) => briefingFilter.includes(briefingId))
  : briefingIds;
if (!selectedBriefings.length) throw new Error(`no_briefings_selected:${arg("briefings")}`);

const options: BankOptions = {
  bankId,
  bankVersion: 1,
  // The pilot deliberately runs on the twelve hand-authored problems rather than a generated set.
  // If the gate cannot be met by problems written specifically to separate the tiers, generating
  // more problems cannot rescue it — so this is the cheapest possible place to find that out.
  problems: selectedProblems,
  tiers: selectedTiers,
  briefingIds: selectedBriefings,
  shardCount,
  shardIndex,
  outputDir,
  concurrency
};

const cells = enumerateCells(options);

if (flag("plan")) {
  const perTier = selectedTiers.map(
    (tier) => `${tier.tierId}(${tier.backend})=${selectedProblems.length * selectedBriefings.length * tier.attemptsPerCell}`
  );
  console.log(JSON.stringify({
    bankId,
    problems: selectedProblems.length,
    briefings: selectedBriefings.length,
    totalCalls: cells.length,
    callsPerTier: perTier,
    shardCount,
    concurrency,
    outputDir
  }, null, 2));
  process.exit(0);
}

if (flag("report")) {
  // `--merge=a,b` unions banks generated separately so one curve can be assembled from tiers that
  // ran at different times, on different rungs, without regenerating anything.
  const sources = (arg("merge")?.split(",").map((value) => value.trim()).filter(Boolean)) ?? [bankId];
  const attempts = (await Promise.all(sources.map((source) => readBankAttempts(outputDir, source)))).flat();
  const report = await writeManifestAndReport(options, attempts);
  console.log(JSON.stringify({
    bankId: report.bankId,
    attempts: report.attempts,
    graded: report.graded,
    contentHash: report.contentHash,
    tierAccuracyAtStandard: report.tierAccuracyAtStandard,
    briefingAccuracyMean: report.briefingAccuracyMean,
    admitted: `${report.admittedCount}/${report.problems.length}`,
    backendErrorRate: report.backendErrorRate,
    emptyOutputRate: report.emptyOutputRate,
    briefingTrap: report.briefingTrap,
    briefingBias: report.briefingBias,
    gate: report.gate
  }, null, 2));
  // A failing gate is a real answer, not an error — but it must be visible to a script.
  process.exit(report.gate.pass ? 0 : 2);
}

const { url, key } = resolveHearthConfig();
const client = new HearthClient(url, key);
await client.connect();

console.error(`[bank] ${bankId} shard ${shardIndex}/${shardCount} — ${cells.length} cells total, concurrency ${concurrency}`);
const attempts = await generateShard(options, client);
console.error(`[bank] shard ${shardIndex} complete: ${attempts.length} attempts`);
