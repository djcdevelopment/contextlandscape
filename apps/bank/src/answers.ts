// Answer handling is deliberately split out from the schemas: the problem schema validates its own
// `groundTruth` through the same normalizer that grades a model's reply, so an authoring mistake
// cannot produce a problem that is impossible to answer correctly.

export type AnswerShape = "id" | "ids" | "boolean" | "permutation" | "number";
export type NormalizedAnswer = string | string[] | boolean | number;

export type NormalizeResult =
  | { ok: true; value: NormalizedAnswer }
  | { ok: false; reason: string };

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

function normalizeOptions(options?: string[]): string[] | null {
  if (!options?.length) return null;
  return options.map((option) => option.trim().toLowerCase());
}

export function normalizeAnswer(shape: AnswerShape, value: unknown, options?: string[]): NormalizeResult {
  const allowed = normalizeOptions(options);

  switch (shape) {
    case "id": {
      const token = normalizeToken(value);
      if (!token) return { ok: false, reason: "expected a non-empty string id" };
      if (allowed && !allowed.includes(token)) return { ok: false, reason: `id "${token}" is not one of the options` };
      return { ok: true, value: token };
    }

    case "ids": {
      if (!Array.isArray(value)) return { ok: false, reason: "expected an array of ids" };
      const tokens: string[] = [];
      for (const entry of value) {
        const token = normalizeToken(entry);
        if (!token) return { ok: false, reason: "every id must be a non-empty string" };
        if (allowed && !allowed.includes(token)) return { ok: false, reason: `id "${token}" is not one of the options` };
        if (!tokens.includes(token)) tokens.push(token);
      }
      if (!tokens.length) return { ok: false, reason: "expected at least one id" };
      // Order is not meaningful for a set answer, so sort to make comparison order-insensitive.
      return { ok: true, value: [...tokens].sort() };
    }

    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      const token = normalizeToken(value);
      if (token === "true") return { ok: true, value: true };
      if (token === "false") return { ok: true, value: false };
      return { ok: false, reason: "expected true or false" };
    }

    case "permutation": {
      if (!Array.isArray(value)) return { ok: false, reason: "expected an ordered array" };
      const tokens: string[] = [];
      for (const entry of value) {
        const token = normalizeToken(entry);
        if (!token) return { ok: false, reason: "every step must be a non-empty string" };
        tokens.push(token);
      }
      if (!tokens.length) return { ok: false, reason: "expected at least one step" };
      if (new Set(tokens).size !== tokens.length) return { ok: false, reason: "a permutation cannot repeat a step" };
      if (allowed) {
        if (tokens.length !== allowed.length) return { ok: false, reason: "a permutation must use every option exactly once" };
        for (const token of tokens) {
          if (!allowed.includes(token)) return { ok: false, reason: `step "${token}" is not one of the options` };
        }
      }
      // Order IS the answer here, so it is preserved.
      return { ok: true, value: tokens };
    }

    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
      if (typeof value === "string" && value.trim().length) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return { ok: true, value: parsed };
      }
      return { ok: false, reason: "expected a finite number" };
    }
  }
}

export function answersEqual(left: NormalizedAnswer, right: NormalizedAnswer): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
  }
  return left === right;
}

/** Find the first balanced JSON object in free text. Models routinely wrap answers in prose. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Pull the answer value out of a raw model reply.
 *
 * Deliberately lenient about the wrapper and strict about the value. The output contract asks for
 * `{"answer": ...}`, but a bare value is still accepted: if poor-briefing replies were scored zero
 * purely for missing the wrapper, the "briefing lifts reliability" gate would pass trivially and
 * measure formatting rather than competence.
 */
export function extractAnswer(rawText: string): { found: boolean; value?: unknown } {
  const trimmed = rawText.trim();
  if (!trimmed.length) return { found: false };

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [withoutFences, firstJsonObject(withoutFences)].filter((entry): entry is string => Boolean(entry));

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "answer" in parsed) {
      return { found: true, value: (parsed as { answer: unknown }).answer };
    }
    // A bare array or scalar is an acceptable reply; a bare object without `answer` is not.
    if (Array.isArray(parsed) || typeof parsed !== "object" || parsed === null) {
      return { found: true, value: parsed };
    }
  }
  return { found: false };
}
