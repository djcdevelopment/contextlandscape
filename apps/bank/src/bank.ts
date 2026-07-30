import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { answersEqual, normalizeAnswer, type AnswerShape, type NormalizedAnswer } from "./answers.js";
import { fnv1aHex } from "./draw.js";
import { countsTowardReliability, gradeAttempt } from "./grading.js";
import { HearthClient } from "./hearth.js";
import { buildPrompt } from "./prompts.js";
import { AttemptSchema, BankManifestSchema, type Attempt, type BankManifest, type BriefingId, type Problem, type Tier, type TierId } from "./schemas.js";

/** Canonical reliability ranking. The chassis mechanic depends on accuracy rising along it. */
export const TIER_ORDER: TierId[] = ["scout", "line", "siege"];

export type BankOptions = {
  bankId: string;
  bankVersion: number;
  problems: Problem[];
  tiers: Tier[];
  briefingIds: BriefingId[];
  shardCount: number;
  shardIndex: number;
  outputDir: string;
  concurrency: number;
};

export type Cell = {
  ordinal: number;
  problemId: string;
  tierId: TierId;
  briefingId: BriefingId;
  index: number;
  attemptId: string;
};

/** Stable enumeration: the ordinal is what shards, so the same options always shard identically. */
export function enumerateCells(options: Pick<BankOptions, "problems" | "tiers" | "briefingIds">): Cell[] {
  const cells: Cell[] = [];
  let ordinal = 0;
  for (const problem of options.problems) {
    for (const tier of options.tiers) {
      for (const briefingId of options.briefingIds) {
        for (let index = 0; index < tier.attemptsPerCell; index += 1) {
          cells.push({
            ordinal,
            problemId: problem.problemId,
            tierId: tier.tierId,
            briefingId,
            index,
            attemptId: `${problem.problemId}:${tier.tierId}:${briefingId}:${index}`
          });
          ordinal += 1;
        }
      }
    }
  }
  return cells;
}

export function cellsForShard(cells: Cell[], shardCount: number, shardIndex: number): Cell[] {
  return cells.filter((cell) => cell.ordinal % shardCount === shardIndex);
}

function shardBase(outputDir: string, bankId: string, shardIndex: number): string {
  return `${outputDir}/${bankId}/shard-${String(shardIndex).padStart(4, "0")}`;
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function readJsonlIds(path: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!existsSync(path)) return ids;
  const reader = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { attemptId?: string };
      if (record.attemptId) ids.add(record.attemptId);
    } catch {
      // A torn final line from a killed process is expected; that attempt is simply redone.
    }
  }
  return ids;
}

async function gzipFile(source: string, destination: string): Promise<void> {
  const output = createWriteStream(destination);
  createReadStream(source).pipe(createGzip()).pipe(output);
  await once(output, "close");
}

/**
 * Generate one shard.
 *
 * The lab's worker writes a whole shard at once because its work is pure CPU and cheap to redo.
 * These are paid network calls, so records are appended to a `.partial.jsonl` as they land and only
 * gzipped into the final shard on completion. A process killed 290 calls into a 300-call shard
 * resumes having lost nothing.
 */
export async function generateShard(options: BankOptions, client: HearthClient): Promise<Attempt[]> {
  const bankDir = `${options.outputDir}/${options.bankId}`;
  await mkdir(bankDir, { recursive: true });

  const base = shardBase(options.outputDir, options.bankId, options.shardIndex);
  const completePath = `${base}.complete`;
  const partialPath = `${base}.partial.jsonl`;
  const finalPath = `${base}.jsonl.gz`;

  if (existsSync(completePath)) return readShardAttempts(finalPath);

  const problemById = new Map(options.problems.map((problem) => [problem.problemId, problem]));
  const tierById = new Map(options.tiers.map((tier) => [tier.tierId, tier]));
  const all = enumerateCells(options);
  const mine = cellsForShard(all, options.shardCount, options.shardIndex);

  const done = await readJsonlIds(partialPath);
  const pending = mine.filter((cell) => !done.has(cell.attemptId));
  let requestId = 1000 * (options.shardIndex + 1);

  await runPool(pending, options.concurrency, async (cell) => {
    const problem = problemById.get(cell.problemId)!;
    const tier = tierById.get(cell.tierId)!;
    const { system, prompt } = buildPrompt(problem, cell.briefingId);
    requestId += 1;

    const outcome = await client.generate(
      { prompt, system, backend: tier.backend, timeoutS: tier.timeoutS, maxTokens: tier.maxTokens },
      requestId
    );
    const grade = gradeAttempt(problem, outcome);

    const attempt = AttemptSchema.parse({
      schemaVersion: 1,
      attemptId: cell.attemptId,
      problemId: cell.problemId,
      tierId: cell.tierId,
      briefingId: cell.briefingId,
      index: cell.index,
      backend: outcome.backend,
      model: outcome.model,
      endpoint: outcome.endpoint,
      routedBy: outcome.routedBy,
      ok: outcome.ok,
      rawText: outcome.text,
      parsedAnswer: grade.parsedAnswer ?? null,
      correct: grade.correct,
      failureMode: grade.failureMode,
      latencyMs: outcome.latencyMs,
      generatedAt: new Date().toISOString()
    } satisfies Attempt);

    await appendFile(partialPath, `${JSON.stringify(attempt)}\n`, "utf8");
  });

  await gzipFile(partialPath, finalPath);
  const attempts = await readShardAttempts(finalPath);
  await writeFile(completePath, `${attempts.length}\n`);
  await rm(partialPath, { force: true });
  return attempts;
}

export async function readShardAttempts(path: string): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  if (!existsSync(path)) return attempts;
  const { createGunzip } = await import("node:zlib");
  const reader = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    attempts.push(AttemptSchema.parse(JSON.parse(line)));
  }
  return attempts;
}

/**
 * Order-independent by construction: attempts are sorted by id before hashing, so concurrency and
 * resume cannot change the hash of an otherwise identical bank.
 */
export function bankContentHash(attempts: Attempt[]): string {
  const rows = attempts
    .map((attempt) => `${attempt.attemptId}|${attempt.failureMode}|${attempt.correct ? 1 : 0}`)
    .sort();
  return fnv1aHex(rows.join("\n"));
}

export function buildManifest(options: BankOptions, attempts: Attempt[], generatedAt: string): BankManifest {
  return BankManifestSchema.parse({
    schemaVersion: 1,
    bankId: options.bankId,
    bankVersion: options.bankVersion,
    problemCount: options.problems.length,
    tiers: options.tiers,
    briefingIds: options.briefingIds,
    attemptCount: attempts.length,
    shardCount: options.shardCount,
    contentHash: bankContentHash(attempts),
    generatedAt
  } satisfies BankManifest);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Wilson 95% interval, matching the lab reducer so marginal results read the same way. */
function interval95(correct: number, graded: number): [number, number] {
  if (!graded) return [0, 0];
  const p = correct / graded;
  const z = 1.96;
  const denominator = 1 + (z * z) / graded;
  const centre = p + (z * z) / (2 * graded);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * graded)) / graded);
  return [
    Number(Math.max(0, (centre - spread) / denominator).toFixed(3)),
    Number(Math.min(1, (centre + spread) / denominator).toFixed(3))
  ];
}

export type CellStat = {
  tierId: TierId;
  briefingId: BriefingId;
  attempts: number;
  graded: number;
  correct: number;
  accuracy: number;
  accuracy95: [number, number];
  backendErrors: number;
  emptyOutputs: number;
  unparseable: number;
  /**
   * Split out because an unparseable reply is not the same failure as a wrong one, and conflating
   * them makes a briefing that merely teaches output formatting look like one that improves
   * reasoning. `formatCompliance` is the share of replies that yielded an extractable answer at all;
   * `accuracyWhenExtractable` is correctness among only those. A prose reply carrying the right
   * answer lands as compliant=false, accurate=n/a — not as a wrong answer.
   *
   * Both matter, and they matter differently in play: a correct-but-unparseable mech rewards the
   * commander for spending attention to verify, while a confidently-wrong one punishes trust.
   */
  extractable: number;
  formatCompliance: number;
  /** null when nothing was extractable: an empty denominator is undefined, not zero accuracy. */
  accuracyWhenExtractable: number | null;
};

export type ProblemStat = {
  problemId: string;
  admitted: boolean;
  reason: string;
  accuracyByTier: Array<{ tierId: TierId; graded: number; accuracy: number }>;
};

/**
 * The 2x2 that tests whether briefing rigor causes bias rather than error.
 *
 * `trap` problems have a literal reading that points at a specific wrong answer; `plain` problems do
 * not. If a stricter briefing degrades accuracy it should do so by raising `trapCaptureRate` on trap
 * problems while leaving plain accuracy alone. A uniform drop across both would instead mean the
 * briefing is simply worse, which is a different and less interesting claim.
 */
export type BriefingTrapStat = {
  briefingId: BriefingId;
  trap: { graded: number; accuracy: number; trapCaptureRate: number };
  plain: { graded: number; accuracy: number };
};

export type BankReport = {
  bankId: string;
  attempts: number;
  graded: number;
  backendErrorRate: number;
  emptyOutputRate: number;
  cells: CellStat[];
  tierAccuracyAtStandard: Array<{ tierId: TierId; accuracy: number; graded: number }>;
  briefingAccuracyMean: Array<{
    briefingId: BriefingId;
    accuracy: number;
    formatCompliance: number;
    accuracyWhenExtractable: number | null;
  }>;
  problems: ProblemStat[];
  briefingTrap: BriefingTrapStat[];
  /** Set when a stricter briefing raises trap capture without hurting plain problems. */
  briefingBias: { detected: boolean; detail: string };
  admittedCount: number;
  gate: {
    discrimination: { pass: boolean; admittedRatio: number };
    /** `complete` is false when a tier did not run at all, which can never count as a pass. */
    tierMonotonic: { pass: boolean; complete: boolean; detail: string };
    /** `formatOnly` marks a lift that exists only because better briefing taught output formatting. */
    briefingLift: { pass: boolean; formatOnly: boolean; detail: string };
    backendErrors: { pass: boolean; rate: number };
    pass: boolean;
  };
  contentHash: string;
};

function accuracyOf(attempts: Attempt[]): { graded: number; correct: number; accuracy: number } {
  const graded = attempts.filter((attempt) => countsTowardReliability(attempt.failureMode));
  const correct = graded.filter((attempt) => attempt.correct).length;
  return {
    graded: graded.length,
    correct,
    accuracy: graded.length ? Number((correct / graded.length).toFixed(3)) : 0
  };
}

export function buildReport(options: BankOptions, attempts: Attempt[]): BankReport {
  const cells: CellStat[] = [];
  for (const tier of options.tiers) {
    for (const briefingId of options.briefingIds) {
      const subset = attempts.filter((attempt) => attempt.tierId === tier.tierId && attempt.briefingId === briefingId);
      const { graded, correct, accuracy } = accuracyOf(subset);
      const unparseable = subset.filter((attempt) => attempt.failureMode === "unparseable").length;
      const extractable = graded - unparseable;
      cells.push({
        tierId: tier.tierId,
        briefingId,
        attempts: subset.length,
        graded,
        correct,
        accuracy,
        accuracy95: interval95(correct, graded),
        backendErrors: subset.filter((attempt) => attempt.failureMode === "backend_error").length,
        emptyOutputs: subset.filter((attempt) => attempt.failureMode === "empty_output").length,
        unparseable,
        extractable,
        formatCompliance: graded ? Number((extractable / graded).toFixed(3)) : 0,
        accuracyWhenExtractable: extractable ? Number((correct / extractable).toFixed(3)) : null
      });
    }
  }

  // A problem earns its place only by separating the tiers. One everybody solves, or everybody
  // fails, carries no gameplay signal — the same logic as lesson separation in the lab reducer.
  const problems: ProblemStat[] = options.problems.map((problem) => {
    const accuracyByTier = options.tiers.map((tier) => {
      const subset = attempts.filter(
        (attempt) =>
          attempt.problemId === problem.problemId && attempt.tierId === tier.tierId && attempt.briefingId === "standard"
      );
      const { graded, accuracy } = accuracyOf(subset);
      return { tierId: tier.tierId, graded, accuracy };
    });
    const scored = accuracyByTier.filter((entry) => entry.graded > 0);
    const strong = scored.some((entry) => entry.accuracy >= 0.6);
    const weak = scored.some((entry) => entry.accuracy <= 0.4);
    const admitted = scored.length > 0 && strong && weak;
    const reason = !scored.length
      ? "no graded attempts"
      : admitted
        ? "discriminates"
        : strong
          ? "every tier solves it"
          : "no tier solves it";
    return { problemId: problem.problemId, admitted, reason, accuracyByTier };
  });

  const tierAccuracyAtStandard = options.tiers.map((tier) => {
    const subset = attempts.filter((attempt) => attempt.tierId === tier.tierId && attempt.briefingId === "standard");
    const { graded, accuracy } = accuracyOf(subset);
    return { tierId: tier.tierId, accuracy, graded };
  });

  // Pooled over raw counts rather than averaged over per-cell ratios: a cell with no extractable
  // replies has no defined accuracy, and folding it in as 0 would understate the surviving cells.
  const briefingAccuracyMean = options.briefingIds.map((briefingId) => {
    const row = cells.filter((cell) => cell.briefingId === briefingId);
    const graded = row.reduce((sum, cell) => sum + cell.graded, 0);
    const correct = row.reduce((sum, cell) => sum + cell.correct, 0);
    const extractable = row.reduce((sum, cell) => sum + cell.extractable, 0);
    return {
      briefingId,
      accuracy: graded ? Number((correct / graded).toFixed(3)) : 0,
      formatCompliance: graded ? Number((extractable / graded).toFixed(3)) : 0,
      accuracyWhenExtractable: extractable ? Number((correct / extractable).toFixed(3)) : null
    };
  });

  const literalByProblem = new Map<string, NormalizedAnswer>();
  for (const problem of options.problems) {
    if (problem.literalAnswer === undefined) continue;
    const literal = normalizeAnswer(problem.answerShape as AnswerShape, problem.literalAnswer, problem.options);
    if (literal.ok) literalByProblem.set(problem.problemId, literal.value);
  }
  const capturedTrap = (attempt: Attempt): boolean => {
    const literal = literalByProblem.get(attempt.problemId);
    if (literal === undefined || attempt.parsedAnswer === null || attempt.parsedAnswer === undefined) return false;
    return answersEqual(attempt.parsedAnswer as NormalizedAnswer, literal);
  };

  const briefingTrap: BriefingTrapStat[] = options.briefingIds.map((briefingId) => {
    const row = attempts.filter(
      (attempt) => attempt.briefingId === briefingId && countsTowardReliability(attempt.failureMode)
    );
    const trap = row.filter((attempt) => literalByProblem.has(attempt.problemId));
    const plain = row.filter((attempt) => !literalByProblem.has(attempt.problemId));
    const captured = trap.filter(capturedTrap).length;
    return {
      briefingId,
      trap: {
        graded: trap.length,
        accuracy: trap.length ? Number((trap.filter((a) => a.correct).length / trap.length).toFixed(3)) : 0,
        trapCaptureRate: trap.length ? Number((captured / trap.length).toFixed(3)) : 0
      },
      plain: {
        graded: plain.length,
        accuracy: plain.length ? Number((plain.filter((a) => a.correct).length / plain.length).toFixed(3)) : 0
      }
    };
  });

  const standardRow = briefingTrap.find((entry) => entry.briefingId === "standard");
  const goodRow = briefingTrap.find((entry) => entry.briefingId === "good");
  const biasDetected = Boolean(
    standardRow?.trap.graded &&
      goodRow?.trap.graded &&
      goodRow.trap.trapCaptureRate > standardRow.trap.trapCaptureRate &&
      goodRow.plain.accuracy >= standardRow.plain.accuracy
  );
  const briefingBias = {
    detected: biasDetected,
    detail: standardRow && goodRow
      ? `trap capture standard ${standardRow.trap.trapCaptureRate} -> good ${goodRow.trap.trapCaptureRate}; ` +
        `plain accuracy standard ${standardRow.plain.accuracy} -> good ${goodRow.plain.accuracy}`
      : "standard/good not both present"
  };

  const backendErrors = attempts.filter((attempt) => attempt.failureMode === "backend_error").length;
  const emptyOutputs = attempts.filter((attempt) => attempt.failureMode === "empty_output").length;
  const backendErrorRate = attempts.length ? Number((backendErrors / attempts.length).toFixed(4)) : 0;

  const admittedCount = problems.filter((problem) => problem.admitted).length;
  const admittedRatio = problems.length ? Number((admittedCount / problems.length).toFixed(3)) : 0;

  // Only tiers that actually ran are compared, and the check additionally requires the full curve.
  // Treating an absent tier as accuracy 0 would let a two-tier run read as `0 < line < siege` and
  // report a passing chassis curve that was never measured.
  const present = TIER_ORDER.filter((tierId) => options.tiers.some((tier) => tier.tierId === tierId));
  const tierValues = present.map(
    (tierId) => tierAccuracyAtStandard.find((entry) => entry.tierId === tierId)?.accuracy ?? 0
  );
  const tierIncreasing = tierValues.every((value, index) => index === 0 || tierValues[index - 1] < value);
  const tierCurveComplete = present.length === TIER_ORDER.length;

  const briefingOrder = ["poor", "standard", "good"] as const;
  const briefingRow = (briefingId: BriefingId) => briefingAccuracyMean.find((entry) => entry.briefingId === briefingId);
  const briefingValues = briefingOrder.map((briefingId) => briefingRow(briefingId)?.accuracy ?? 0);
  const briefingReasoning = briefingOrder.map((briefingId) => briefingRow(briefingId)?.accuracyWhenExtractable ?? null);
  const briefingLift = briefingValues[0] < briefingValues[1] && briefingValues[1] < briefingValues[2];
  // A briefing that only teaches output formatting lifts overall accuracy while leaving accuracy
  // among parseable replies flat. That is real but trivial, and reporting it as "better briefing
  // improves reasoning" would be a false finding.
  //
  // Compare the widest pair of briefing levels that actually produced extractable replies, rather
  // than poor-to-good blindly: a level with nothing extractable has undefined reasoning accuracy, so
  // including it would either invent a 0 or discard a real lift visible between the other levels.
  const measurable = briefingOrder
    .map((briefingId, index) => ({ briefingId, value: briefingReasoning[index] }))
    .filter((entry): entry is { briefingId: BriefingId; value: number } => entry.value !== null);
  const reasoningComparable = measurable.length >= 2;
  const reasoningLift = reasoningComparable && measurable[measurable.length - 1].value > measurable[0].value;

  const gate = {
    discrimination: { pass: admittedRatio >= 0.6, admittedRatio },
    tierMonotonic: {
      pass: tierCurveComplete && tierIncreasing,
      complete: tierCurveComplete,
      detail: present.map((tierId, index) => `${tierId} ${tierValues[index]}`).join(" < ") +
        (tierCurveComplete ? "" : ` (incomplete: ${TIER_ORDER.filter((tierId) => !present.includes(tierId)).join(", ")} did not run)`)
    },
    briefingLift: {
      pass: briefingLift,
      formatOnly: briefingLift && !reasoningLift,
      detail:
        `accuracy: poor ${briefingValues[0]} < standard ${briefingValues[1]} < good ${briefingValues[2]}; ` +
        `when extractable: ${briefingReasoning.map((value) => value ?? "n/a").join(" / ")}` +
        (reasoningComparable ? "" : " (reasoning lift unmeasured: no extractable replies at one end)")
    },
    backendErrors: { pass: backendErrorRate < 0.05, rate: backendErrorRate },
    pass: false
  };
  gate.pass = gate.discrimination.pass && gate.tierMonotonic.pass && gate.briefingLift.pass && gate.backendErrors.pass;

  return {
    bankId: options.bankId,
    attempts: attempts.length,
    graded: attempts.filter((attempt) => countsTowardReliability(attempt.failureMode)).length,
    backendErrorRate,
    emptyOutputRate: attempts.length ? Number((emptyOutputs / attempts.length).toFixed(4)) : 0,
    cells,
    tierAccuracyAtStandard,
    briefingAccuracyMean,
    problems,
    briefingTrap,
    briefingBias,
    admittedCount,
    gate,
    contentHash: bankContentHash(attempts)
  };
}

export async function readAllShards(outputDir: string, bankId: string, shardCount: number): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    attempts.push(...(await readShardAttempts(`${shardBase(outputDir, bankId, shardIndex)}.jsonl.gz`)));
  }
  return attempts;
}

/**
 * Read every completed shard in a bank without needing to know its shard count.
 *
 * Reporting can then union several banks — a tier generated separately (because its rung was down,
 * or because it is free and the others are metered) still joins one curve, with no regeneration.
 */
export async function readBankAttempts(outputDir: string, bankId: string): Promise<Attempt[]> {
  const { readdir } = await import("node:fs/promises");
  const dir = `${outputDir}/${bankId}`;
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl.gz")).sort();
  const attempts: Attempt[] = [];
  for (const file of files) attempts.push(...(await readShardAttempts(`${dir}/${file}`)));
  return attempts;
}

export async function writeManifestAndReport(options: BankOptions, attempts: Attempt[]): Promise<BankReport> {
  const bankDir = `${options.outputDir}/${options.bankId}`;
  await mkdir(bankDir, { recursive: true });
  const manifest = buildManifest(options, attempts, new Date().toISOString());
  await writeFile(`${bankDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  const report = buildReport(options, attempts);
  await writeFile(`${bankDir}/report.json`, JSON.stringify(report, null, 2));
  // Rejected problems are recorded with their reason, never silently dropped.
  await writeFile(
    `${bankDir}/rejected.json`,
    JSON.stringify(report.problems.filter((problem) => !problem.admitted), null, 2)
  );
  return report;
}

export async function readManifest(outputDir: string, bankId: string): Promise<BankManifest | null> {
  const path = `${outputDir}/${bankId}/manifest.json`;
  if (!existsSync(path)) return null;
  return BankManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
