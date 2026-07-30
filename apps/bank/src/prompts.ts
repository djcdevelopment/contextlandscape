import type { BriefingId, Problem, Tier } from "./schemas.js";

/**
 * `maxTokens` is omitted on every rung deliberately. A tight cap makes a thinking model spend its
 * whole budget before emitting visible text and return `ok:true` with `text:""`; the router's own
 * default is the safe choice. See `empty_output` in schemas.ts.
 */
export const tiers: Tier[] = [
  // Sunk cost and noisy, so it needs more samples. The first call after a boot pays a ~12s
  // model-load tax, which is why the timeout is generous rather than a sign of trouble.
  { tierId: "scout", backend: "omen-ollama", attemptsPerCell: 5, timeoutS: 300 },
  { tierId: "line", backend: "gcp-gemini", attemptsPerCell: 5, timeoutS: 120 },
  // Must be pinned by name: it is deliberately untagged so opportunistic routing stays on flash,
  // and `quality:"best"` does not dispatch at all — it returns an advisory `ask:true`.
  { tierId: "siege", backend: "gcp-gemini-pro", attemptsPerCell: 3, timeoutS: 300 }
];

export const briefingIds: BriefingId[] = ["poor", "standard", "good"];

function answerContract(problem: Problem): string {
  switch (problem.answerShape) {
    case "id":
      return 'Reply with JSON only: {"answer": "<one option id>"}';
    case "ids":
      return 'Reply with JSON only: {"answer": ["<option id>", "..."]} listing every option that applies.';
    case "boolean":
      return 'Reply with JSON only: {"answer": true} or {"answer": false}';
    case "permutation":
      return 'Reply with JSON only: {"answer": ["<option id>", "..."]} using every option exactly once, in order.';
    case "number":
      return 'Reply with JSON only: {"answer": <number>}';
  }
}

function optionsBlock(problem: Problem): string {
  if (!problem.options?.length) return "";
  return `\nOptions:\n${problem.options.map((option) => `- ${option}`).join("\n")}\n`;
}

function contextBlock(problem: Problem): string {
  if (!problem.context.length) return "";
  return `\nObserved:\n${problem.context.map((line) => `  ${line}`).join("\n")}\n`;
}

/**
 * Briefing quality is about how well the mech is told to *work*, never about withholding the data.
 * Every level gets the full context; if `poor` omitted it, the problems would be unanswerable and
 * the "briefing lifts reliability" gate would measure nothing. This also matches the in-game
 * re-brief action: you are improving an agent's instructions, not handing it a missing file.
 */
export function buildPrompt(problem: Problem, briefingId: BriefingId): { system?: string; prompt: string } {
  const body = `${problem.task}\n${contextBlock(problem)}${optionsBlock(problem)}`;

  if (briefingId === "poor") {
    return { prompt: body.trim() };
  }

  if (briefingId === "standard") {
    return {
      system: "You answer technical triage questions.",
      prompt: `${body}\n${answerContract(problem)}`.trim()
    };
  }

  return {
    system:
      "You are a systems engineer triaging a production incident. Decide from the observed evidence " +
      "alone. Do not speculate beyond it, and do not explain your reasoning in the reply.",
    prompt: [
      body.trim(),
      "",
      "Constraints:",
      "- Choose only from the options given.",
      "- Base the answer solely on the observed evidence.",
      "- Output JSON and nothing else: no prose, no code fences, no commentary.",
      "",
      answerContract(problem),
      "",
      'Format example (illustrative only, unrelated to this question): {"answer": "example-id"}'
    ].join("\n")
  };
}
