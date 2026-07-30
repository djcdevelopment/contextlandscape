import { z } from "zod";
import { normalizeAnswer, type AnswerShape } from "./answers.js";

export const AnswerShapeSchema = z.enum(["id", "ids", "boolean", "permutation", "number"]);
export const ProblemKindSchema = z.enum(["detection", "diagnosis", "verification", "contract", "ordering", "constraint"]);
export const AbilitySchema = z.enum(["radar", "repair", "weapon", "build", "deploy", "scan"]);
export const TierIdSchema = z.enum(["scout", "line", "siege"]);
export const BriefingIdSchema = z.enum(["poor", "standard", "good"]);

/**
 * Only deterministically detectable outcomes are modelled.
 *
 * The spec originally also listed `refused`, `truncated`, and `off_task`. Those cannot be decided
 * from a reply without a fuzzy classifier, and inventing one would manufacture precision the data
 * does not have — so they collapse into `unparseable` and the full `rawText` is retained on every
 * record for richer analysis later.
 *
 * `backend_error` and `empty_output` are infrastructure and generation-config failures. Neither is
 * evidence about a model's competence, so both are excluded from reliability statistics.
 */
export const FailureModeSchema = z.enum(["correct", "wrong_answer", "unparseable", "empty_output", "backend_error"]);

export type AnswerShapeName = z.infer<typeof AnswerShapeSchema>;
export type ProblemKind = z.infer<typeof ProblemKindSchema>;
export type TierId = z.infer<typeof TierIdSchema>;
export type BriefingId = z.infer<typeof BriefingIdSchema>;
export type FailureMode = z.infer<typeof FailureModeSchema>;

export const ProblemSchema = z.object({
  problemId: z.string().min(1),
  kind: ProblemKindSchema,
  ability: AbilitySchema,
  difficulty: z.number().int().min(1).max(5),
  task: z.string().min(1),
  // Keep this short. A mech's artifact should be a three-line diff, not an essay — the commander has
  // to be able to read it under attention pressure.
  context: z.array(z.string()),
  answerShape: AnswerShapeSchema,
  options: z.array(z.string()).optional(),
  groundTruth: z.unknown(),
  /**
   * The answer a purely literal reading of the evidence produces, when that differs from the truth
   * — the lowest number, the first line, the largest value. Present only on trap problems.
   *
   * Recording it turns "wrong" into "fell for the trap", which is what makes the briefing-bias
   * hypothesis measurable: an instruction like "decide from the observed evidence alone" should
   * raise trap capture specifically, and leave non-trap problems untouched.
   */
  literalAnswer: z.unknown().optional(),
  /** What the commander buys when they spend attention to verify. Never sent to the model. */
  rationale: z.string().min(1),
  authoredBy: z.enum(["human", "generated"]),
  bankVersion: z.number().int().nonnegative()
}).superRefine((problem, ctx) => {
  const normalized = normalizeAnswer(problem.answerShape as AnswerShape, problem.groundTruth, problem.options);
  if (!normalized.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["groundTruth"],
      message: `groundTruth is not a valid ${problem.answerShape}: ${normalized.reason}`
    });
  }
  if ((problem.answerShape === "id" || problem.answerShape === "ids" || problem.answerShape === "permutation") && !problem.options?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: `${problem.answerShape} problems must declare options` });
  }
  if (problem.literalAnswer !== undefined) {
    const literal = normalizeAnswer(problem.answerShape as AnswerShape, problem.literalAnswer, problem.options);
    if (!literal.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["literalAnswer"], message: `literalAnswer is not a valid ${problem.answerShape}: ${literal.reason}` });
    } else if (normalized.ok && JSON.stringify(literal.value) === JSON.stringify(normalized.value)) {
      // A literal answer equal to the truth is not a trap, and counting it as one would inflate the
      // trap-capture rate with problems that never had a wrong attractor.
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["literalAnswer"], message: "literalAnswer equals groundTruth, so this is not a trap problem" });
    }
  }
});
export type Problem = z.infer<typeof ProblemSchema>;

/**
 * `backend` is bank metadata and must never reach player-facing content — the chassis stays
 * `scout` / `line` / `siege`, for the same reason the design docs stopped naming model tiers.
 */
export const TierSchema = z.object({
  tierId: TierIdSchema,
  backend: z.string().min(1),
  attemptsPerCell: z.number().int().positive(),
  timeoutS: z.number().int().positive(),
  /**
   * Omitted for the gemini rungs on purpose. A tight cap makes a thinking model burn its whole
   * budget before emitting visible text and return `ok:true` with `text:""` — see `empty_output`.
   */
  maxTokens: z.number().int().positive().optional()
});
export type Tier = z.infer<typeof TierSchema>;

export const AttemptSchema = z.object({
  schemaVersion: z.literal(1),
  attemptId: z.string().min(1),
  problemId: z.string().min(1),
  tierId: TierIdSchema,
  briefingId: BriefingIdSchema,
  index: z.number().int().nonnegative(),
  // Provenance lifted from the HEARTH result metadata, which is the proof of where work ran.
  // Never trust a model's self-report about which model it is.
  backend: z.string(),
  model: z.string(),
  endpoint: z.string(),
  routedBy: z.string(),
  ok: z.boolean(),
  rawText: z.string(),
  parsedAnswer: z.unknown(),
  correct: z.boolean(),
  failureMode: FailureModeSchema,
  latencyMs: z.number().nonnegative(),
  generatedAt: z.string()
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const BankManifestSchema = z.object({
  schemaVersion: z.literal(1),
  bankId: z.string().min(1),
  bankVersion: z.number().int().nonnegative(),
  problemCount: z.number().int().nonnegative(),
  tiers: z.array(TierSchema),
  briefingIds: z.array(BriefingIdSchema),
  attemptCount: z.number().int().nonnegative(),
  shardCount: z.number().int().positive(),
  /** FNV over sorted attempt ids plus graded results, so a scenario can pin an exact bank. */
  contentHash: z.string(),
  generatedAt: z.string()
});
export type BankManifest = z.infer<typeof BankManifestSchema>;
