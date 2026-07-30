import { describe, expect, it } from "vitest";
import { answersEqual, extractAnswer, normalizeAnswer } from "./answers.js";
import { bankContentHash, buildReport, cellsForShard, enumerateCells, type BankOptions } from "./bank.js";
import { drawAttemptIndex } from "./draw.js";
import { countsTowardReliability, gradeAttempt, type GenerationOutcome } from "./grading.js";
import { unwrapToolResult } from "./hearth.js";
import { seedProblemById, seedProblems } from "./problems.js";
import { buildPrompt, briefingIds, tiers } from "./prompts.js";
import type { Attempt, BriefingId, FailureMode, TierId } from "./schemas.js";

function outcome(overrides: Partial<GenerationOutcome> = {}): GenerationOutcome {
  return {
    ok: true,
    text: "",
    backend: "gcp-gemini",
    model: "gemini-3.5-flash",
    endpoint: "https://aiplatform.googleapis.com",
    routedBy: "pinned:gcp-gemini",
    latencyMs: 1281,
    ...overrides
  };
}

describe("answer normalization", () => {
  it("folds case and whitespace for ids but rejects values outside the options", () => {
    expect(normalizeAnswer("id", "  Pricing ", ["gateway", "pricing"])).toEqual({ ok: true, value: "pricing" });
    expect(normalizeAnswer("id", "database", ["gateway", "pricing"]).ok).toBe(false);
    expect(normalizeAnswer("id", "", ["gateway"]).ok).toBe(false);
  });

  it("treats an ids answer as an order-insensitive set", () => {
    const left = normalizeAnswer("ids", ["status", "amount", "Amount"], ["id", "amount", "status", "region"]);
    const right = normalizeAnswer("ids", ["amount", "status"], ["id", "amount", "status", "region"]);
    expect(left.ok && right.ok && answersEqual(left.value, right.value)).toBe(true);
  });

  it("preserves order for a permutation and requires every option exactly once", () => {
    const options = ["a", "b", "c"];
    expect(normalizeAnswer("permutation", ["c", "a", "b"], options)).toEqual({ ok: true, value: ["c", "a", "b"] });
    expect(normalizeAnswer("permutation", ["a", "b"], options).ok).toBe(false);
    expect(normalizeAnswer("permutation", ["a", "b", "b"], options).ok).toBe(false);
  });

  it("accepts booleans and numbers in their common string spellings", () => {
    expect(normalizeAnswer("boolean", "FALSE")).toEqual({ ok: true, value: false });
    expect(normalizeAnswer("boolean", "maybe").ok).toBe(false);
    expect(normalizeAnswer("number", " 3000 ")).toEqual({ ok: true, value: 3000 });
    expect(normalizeAnswer("number", "not-a-number").ok).toBe(false);
    expect(normalizeAnswer("number", Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe("answer extraction from raw replies", () => {
  it("reads the contract shape, fenced JSON, and JSON buried in prose", () => {
    expect(extractAnswer('{"answer":"pricing"}')).toEqual({ found: true, value: "pricing" });
    expect(extractAnswer('```json\n{"answer": "pricing"}\n```')).toEqual({ found: true, value: "pricing" });
    expect(extractAnswer('Looking at the chain, the leaf holds it.\n{"answer": "pricing"}\nHope that helps!'))
      .toEqual({ found: true, value: "pricing" });
  });

  // Leniency here is deliberate: if a missing wrapper scored zero, the "briefing lifts reliability"
  // gate would measure formatting compliance instead of competence.
  it("accepts a bare value but not an object lacking an answer key", () => {
    expect(extractAnswer('"pricing"')).toEqual({ found: true, value: "pricing" });
    expect(extractAnswer('["a","b"]')).toEqual({ found: true, value: ["a", "b"] });
    expect(extractAnswer('{"result":"pricing"}').found).toBe(false);
    expect(extractAnswer("   ").found).toBe(false);
  });
});

describe("failure-mode classification", () => {
  const problem = seedProblemById.get("prb-detection-0001")!;

  it("grades a correct answer", () => {
    const grade = gradeAttempt(problem, outcome({ text: '{"answer":"pricing"}' }));
    expect(grade).toMatchObject({ correct: true, failureMode: "correct" });
  });

  it("grades a plausible but wrong answer as wrong_answer", () => {
    const grade = gradeAttempt(problem, outcome({ text: '{"answer":"gateway"}' }));
    expect(grade).toMatchObject({ correct: false, failureMode: "wrong_answer" });
  });

  // The reason this file exists. The very first live probe returned ok:true with an empty string
  // because a tight max_tokens let thinking consume the whole budget. Scoring that as wrong_answer
  // would push the tier curve down for a reason unrelated to the model's competence.
  it("separates an empty reply from a wrong answer even when ok is true", () => {
    const grade = gradeAttempt(problem, outcome({ ok: true, text: "" }));
    expect(grade.failureMode).toBe("empty_output");
    expect(countsTowardReliability("empty_output")).toBe(false);
  });

  it("separates transport and tool failures from model failures", () => {
    expect(gradeAttempt(problem, outcome({ transportError: "http_502" })).failureMode).toBe("backend_error");
    expect(gradeAttempt(problem, outcome({ ok: false, text: "cold" })).failureMode).toBe("backend_error");
    expect(countsTowardReliability("backend_error")).toBe(false);
  });

  it("counts only genuine model failures toward reliability", () => {
    expect(countsTowardReliability("correct")).toBe(true);
    expect(countsTowardReliability("wrong_answer")).toBe(true);
    expect(countsTowardReliability("unparseable")).toBe(true);
  });

  it("grades a refusal or off-task reply as unparseable and keeps the raw text", () => {
    const grade = gradeAttempt(problem, outcome({ text: "I can't help with that." }));
    expect(grade).toMatchObject({ correct: false, failureMode: "unparseable" });
  });
});

describe("seed problems", () => {
  it("declares twelve problems, two per kind", () => {
    expect(seedProblems).toHaveLength(12);
    const byKind = new Map<string, number>();
    for (const problem of seedProblems) byKind.set(problem.kind, (byKind.get(problem.kind) ?? 0) + 1);
    expect([...byKind.values()].every((count) => count === 2)).toBe(true);
    expect(byKind.size).toBe(6);
  });

  it("grades every seed problem correct when given its own ground truth", () => {
    for (const problem of seedProblems) {
      const grade = gradeAttempt(problem, outcome({ text: JSON.stringify({ answer: problem.groundTruth }) }));
      expect(grade.failureMode, problem.problemId).toBe("correct");
    }
  });

  it("grades every option-based seed problem wrong when given a different valid option", () => {
    for (const problem of seedProblems) {
      if (problem.answerShape !== "id" || !problem.options) continue;
      const wrong = problem.options.find((option) => option.toLowerCase() !== String(problem.groundTruth).toLowerCase());
      const grade = gradeAttempt(problem, outcome({ text: JSON.stringify({ answer: wrong }) }));
      expect(grade.failureMode, problem.problemId).toBe("wrong_answer");
    }
  });

  it("never leaks the rationale into any briefing sent to a model", () => {
    for (const problem of seedProblems) {
      for (const briefingId of briefingIds) {
        const { system, prompt } = buildPrompt(problem, briefingId);
        expect(`${system ?? ""}\n${prompt}`, `${problem.problemId}/${briefingId}`).not.toContain(problem.rationale);
      }
    }
  });

  it("gives every briefing level the full context, differing only in instruction quality", () => {
    const problem = seedProblemById.get("prb-detection-0002")!;
    for (const briefingId of briefingIds) {
      const { prompt } = buildPrompt(problem, briefingId);
      for (const line of problem.context) expect(prompt, briefingId).toContain(line);
    }
    const poor = buildPrompt(problem, "poor");
    const good = buildPrompt(problem, "good");
    expect(poor.system).toBeUndefined();
    expect(good.prompt.length).toBeGreaterThan(poor.prompt.length);
  });
});

describe("tier configuration", () => {
  it("omits max_tokens on every rung so a thinking budget cannot swallow the reply", () => {
    expect(tiers.every((tier) => tier.maxTokens === undefined)).toBe(true);
  });

  it("pins the pro rung by name, since quality routing never selects it", () => {
    expect(tiers.find((tier) => tier.tierId === "siege")?.backend).toBe("gcp-gemini-pro");
  });
});

describe("MCP framing", () => {
  // Recorded from the live probe against hearth 1.28.1.
  const recorded =
    'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"ok\\": true, \\"text\\": \\"hi\\", \\"backend\\": \\"gcp-gemini\\"}"}],"isError":false}}\n\n';

  it("double-parses an SSE tool result into the tool payload", () => {
    const result = unwrapToolResult(recorded);
    expect(result.ok && result.payload).toMatchObject({ ok: true, text: "hi", backend: "gcp-gemini" });
  });

  it("reports each framing failure distinctly rather than as a model failure", () => {
    expect(unwrapToolResult("")).toMatchObject({ ok: false, error: "no_sse_data_frame" });
    expect(unwrapToolResult('event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"code":-32601}}\n'))
      .toMatchObject({ ok: false });
    expect(
      unwrapToolResult('data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"x"}],"isError":true}}')
    ).toMatchObject({ ok: false, error: "tool_is_error" });
    expect(
      unwrapToolResult('data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"not json"}]}}')
    ).toMatchObject({ ok: false, error: "payload_not_json" });
  });
});

describe("deterministic draw", () => {
  const key = {
    seed: 20260729,
    matchId: "m-1",
    slot: 3,
    mechId: "line-01",
    problemId: "prb-detection-0001",
    tierId: "line" as const,
    briefingId: "standard" as const
  };

  it("returns the same index for the same key and stays in range", () => {
    expect(drawAttemptIndex(key, 5)).toBe(drawAttemptIndex(key, 5));
    for (let available = 1; available <= 8; available += 1) {
      const index = drawAttemptIndex(key, available);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(available);
    }
  });

  it("moves a mech to a different pool when it is re-briefed", () => {
    // Any single pair can collide by chance, so assert across every seed problem that changing only
    // the briefing actually changes the draw for a meaningful share of them.
    const changed = seedProblems.filter((problem) => {
      const poor = drawAttemptIndex({ ...key, problemId: problem.problemId, briefingId: "poor" }, 5);
      const good = drawAttemptIndex({ ...key, problemId: problem.problemId, briefingId: "good" }, 5);
      return poor !== good;
    });
    expect(changed.length).toBeGreaterThan(seedProblems.length / 2);
  });

  it("refuses to draw from an empty pool instead of returning NaN", () => {
    expect(() => drawAttemptIndex(key, 0)).toThrow(/no_attempts_available/);
  });
});

// ---------------------------------------------------------------------------

const options: BankOptions = {
  bankId: "test-bank",
  bankVersion: 1,
  problems: seedProblems,
  tiers,
  briefingIds,
  shardCount: 1,
  shardIndex: 0,
  outputDir: "data/bank",
  concurrency: 1
};

function attempt(
  problemId: string,
  tierId: TierId,
  briefingId: BriefingId,
  index: number,
  correct: boolean,
  failureMode: FailureMode = correct ? "correct" : "wrong_answer"
): Attempt {
  return {
    schemaVersion: 1,
    attemptId: `${problemId}:${tierId}:${briefingId}:${index}`,
    problemId,
    tierId,
    briefingId,
    index,
    backend: tierId,
    model: "test",
    endpoint: "test",
    routedBy: `pinned:${tierId}`,
    ok: failureMode !== "backend_error",
    rawText: "",
    parsedAnswer: null,
    correct,
    failureMode,
    latencyMs: 1,
    generatedAt: "2026-07-30T00:00:00.000Z"
  };
}

/** Correct-counts chosen so the tier curve rises and briefing lifts within it. */
const correctCounts: Record<BriefingId, Record<TierId, number>> = {
  poor: { scout: 0, line: 1, siege: 2 },
  standard: { scout: 0, line: 3, siege: 3 },
  good: { scout: 1, line: 4, siege: 3 }
};

function syntheticAttempts(counts = correctCounts): Attempt[] {
  const attempts: Attempt[] = [];
  for (const problem of seedProblems) {
    for (const tier of tiers) {
      for (const briefingId of briefingIds) {
        for (let index = 0; index < tier.attemptsPerCell; index += 1) {
          attempts.push(attempt(problem.problemId, tier.tierId, briefingId, index, index < counts[briefingId][tier.tierId]));
        }
      }
    }
  }
  return attempts;
}

describe("cell enumeration and sharding", () => {
  it("enumerates every problem x tier x briefing x attempt exactly once", () => {
    const cells = enumerateCells(options);
    const expected = seedProblems.length * briefingIds.length * tiers.reduce((sum, tier) => sum + tier.attemptsPerCell, 0);
    expect(cells).toHaveLength(expected);
    expect(new Set(cells.map((cell) => cell.attemptId)).size).toBe(expected);
  });

  it("partitions cells across shards without loss or overlap", () => {
    const cells = enumerateCells(options);
    const shards = [0, 1, 2, 3].map((shardIndex) => cellsForShard(cells, 4, shardIndex));
    expect(shards.reduce((sum, shard) => sum + shard.length, 0)).toBe(cells.length);
    expect(new Set(shards.flat().map((cell) => cell.attemptId)).size).toBe(cells.length);
  });
});

describe("content hash", () => {
  it("is independent of the order attempts completed in", () => {
    const attempts = syntheticAttempts();
    const shuffled = [...attempts].reverse();
    expect(bankContentHash(shuffled)).toBe(bankContentHash(attempts));
  });

  it("changes when a grade changes", () => {
    const attempts = syntheticAttempts();
    const mutated = attempts.map((entry, index) => (index === 0 ? { ...entry, correct: !entry.correct } : entry));
    expect(bankContentHash(mutated)).not.toBe(bankContentHash(attempts));
  });
});

describe("pilot gate", () => {
  it("passes when tiers separate, briefing lifts, and the backend is healthy", () => {
    const report = buildReport(options, syntheticAttempts());
    expect(report.gate.discrimination.pass, report.gate.discrimination.admittedRatio.toString()).toBe(true);
    expect(report.gate.tierMonotonic.pass, report.gate.tierMonotonic.detail).toBe(true);
    expect(report.gate.briefingLift.pass, report.gate.briefingLift.detail).toBe(true);
    expect(report.gate.backendErrors.pass).toBe(true);
    expect(report.gate.pass).toBe(true);
  });

  // This is the falsifier the whole pilot exists to run: if the chassis tiers do not separate,
  // chassis-as-reliability is dead and no amount of extra generation recovers it.
  it("fails when the tier curve is flat, however good everything else looks", () => {
    const flat = { ...correctCounts, standard: { scout: 3, line: 3, siege: 3 } };
    const report = buildReport(options, syntheticAttempts(flat as typeof correctCounts));
    expect(report.gate.tierMonotonic.pass).toBe(false);
    expect(report.gate.pass).toBe(false);
  });

  // Found by hitting it for real: with omen-ollama down, a two-tier run must not be able to report
  // a chassis curve it never measured. An absent tier defaulting to accuracy 0 would have read as
  // "0 < line < siege" and passed.
  it("cannot pass on an incomplete tier curve", () => {
    const twoTier: BankOptions = { ...options, tiers: tiers.filter((tier) => tier.tierId !== "scout") };
    const attempts = syntheticAttempts().filter((entry) => entry.tierId !== "scout");
    const report = buildReport(twoTier, attempts);
    expect(report.gate.tierMonotonic.complete).toBe(false);
    expect(report.gate.tierMonotonic.pass).toBe(false);
    expect(report.gate.tierMonotonic.detail).toContain("scout did not run");
    expect(report.gate.pass).toBe(false);
  });

  // The pilot's own early data looked like this: poor replied in prose with the right answer and
  // scored 0, standard and good replied in JSON and scored 100%. Overall accuracy "lifts", but no
  // reasoning improved — only formatting did. The report has to say so out loud.
  it("flags a lift that comes only from output formatting", () => {
    const attempts: Attempt[] = [];
    for (const problem of seedProblems) {
      for (const tier of tiers) {
        for (const briefingId of briefingIds) {
          for (let index = 0; index < tier.attemptsPerCell; index += 1) {
            // Format compliance climbs poor -> standard -> good, but whenever a reply IS parseable
            // it is correct at every level. Overall accuracy therefore rises while reasoning does not.
            const parseable =
              briefingId === "good" ? true : briefingId === "standard" ? index < Math.ceil(tier.attemptsPerCell * 0.6) : false;
            attempts.push(
              attempt(problem.problemId, tier.tierId, briefingId, index, parseable, parseable ? "correct" : "unparseable")
            );
          }
        }
      }
    }
    const report = buildReport(options, attempts);
    const poor = report.briefingAccuracyMean.find((entry) => entry.briefingId === "poor")!;
    const good = report.briefingAccuracyMean.find((entry) => entry.briefingId === "good")!;

    expect(poor.formatCompliance).toBe(0);
    expect(good.formatCompliance).toBe(1);
    // Nothing was extractable at the poor end, so reasoning accuracy there is undefined rather than
    // zero — reporting 0 would make "0 -> 1" look like a reasoning improvement that was never seen.
    expect(poor.accuracyWhenExtractable).toBeNull();
    expect(good.accuracyWhenExtractable).toBe(1);
    // Overall accuracy lifts, so the naive gate passes — and the report says out loud that the lift
    // is formatting, because accuracy among parseable replies is flat wherever it can be measured.
    expect(report.gate.briefingLift.pass).toBe(true);
    expect(report.gate.briefingLift.formatOnly).toBe(true);
    expect(report.gate.briefingLift.detail).toContain("n/a");
  });

  it("fails when a better briefing does not lift accuracy", () => {
    const noLift = { ...correctCounts, good: { scout: 0, line: 1, siege: 2 } };
    const report = buildReport(options, syntheticAttempts(noLift as typeof correctCounts));
    expect(report.gate.briefingLift.pass).toBe(false);
    expect(report.gate.pass).toBe(false);
  });

  it("rejects problems that every tier solves, with the reason recorded", () => {
    const everyoneWins = { ...correctCounts, standard: { scout: 5, line: 5, siege: 3 } };
    const report = buildReport(options, syntheticAttempts(everyoneWins as typeof correctCounts));
    expect(report.admittedCount).toBe(0);
    expect(report.problems.every((problem) => problem.reason === "every tier solves it")).toBe(true);
    expect(report.gate.discrimination.pass).toBe(false);
  });

  it("excludes backend errors and empty output from accuracy but still reports their rates", () => {
    const clean = syntheticAttempts();
    const noisy = [
      ...clean,
      attempt("prb-detection-0001", "line", "standard", 90, false, "backend_error"),
      attempt("prb-detection-0001", "line", "standard", 91, false, "empty_output")
    ];
    const before = buildReport(options, clean);
    const after = buildReport(options, noisy);

    const lineBefore = before.tierAccuracyAtStandard.find((entry) => entry.tierId === "line")!;
    const lineAfter = after.tierAccuracyAtStandard.find((entry) => entry.tierId === "line")!;
    expect(lineAfter.accuracy).toBe(lineBefore.accuracy);
    expect(lineAfter.graded).toBe(lineBefore.graded);

    expect(after.backendErrorRate).toBeGreaterThan(0);
    expect(after.emptyOutputRate).toBeGreaterThan(0);
    expect(after.attempts).toBe(before.attempts + 2);
  });
});
