import { answersEqual, extractAnswer, normalizeAnswer, type AnswerShape } from "./answers.js";
import type { FailureMode, Problem } from "./schemas.js";

/** What a single call to the door produced, already unwrapped from MCP framing. */
export type GenerationOutcome = {
  ok: boolean;
  text: string;
  backend: string;
  model: string;
  endpoint: string;
  routedBy: string;
  latencyMs: number;
  /** Set when the call never produced a tool payload at all (HTTP failure, isError, bad framing). */
  transportError?: string;
};

export type Grade = {
  correct: boolean;
  failureMode: FailureMode;
  parsedAnswer: unknown;
};

/**
 * Classification order matters, and the first two rows are the whole reason this is a tested
 * function rather than an inline expression: a call can succeed, cost tokens, and still return
 * nothing usable. Scoring that as a wrong answer would bend the tier curve downward for reasons
 * that have nothing to do with the model's competence.
 */
export function gradeAttempt(problem: Problem, outcome: GenerationOutcome): Grade {
  if (outcome.transportError || !outcome.ok) {
    return { correct: false, failureMode: "backend_error", parsedAnswer: null };
  }
  if (!outcome.text.trim().length) {
    return { correct: false, failureMode: "empty_output", parsedAnswer: null };
  }

  const extracted = extractAnswer(outcome.text);
  if (!extracted.found) {
    return { correct: false, failureMode: "unparseable", parsedAnswer: null };
  }

  const shape = problem.answerShape as AnswerShape;
  const candidate = normalizeAnswer(shape, extracted.value, problem.options);
  if (!candidate.ok) {
    return { correct: false, failureMode: "unparseable", parsedAnswer: extracted.value };
  }

  const truth = normalizeAnswer(shape, problem.groundTruth, problem.options);
  if (!truth.ok) {
    // Unreachable for a schema-validated problem; treated as an authoring bug, never as a model
    // failure, so a bad problem cannot quietly depress a tier's score.
    throw new Error(`problem_ground_truth_invalid:${problem.problemId}:${truth.reason}`);
  }

  const correct = answersEqual(candidate.value, truth.value);
  return {
    correct,
    failureMode: correct ? "correct" : "wrong_answer",
    parsedAnswer: candidate.value
  };
}

/**
 * Infrastructure and generation-config failures are not evidence about a model, so they are
 * excluded from every reliability statistic and from the pilot gate.
 */
export function countsTowardReliability(failureMode: FailureMode): boolean {
  return failureMode !== "backend_error" && failureMode !== "empty_output";
}
