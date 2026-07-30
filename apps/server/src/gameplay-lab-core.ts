import {
  GameplayLabSessionSchema,
  GameplayLabSessionViewSchema,
  GameplayLabSummarySchema,
  type GameplayLabBookmark,
  type GameplayLabDefinition,
  type GameplayLabReviewRequest,
  type GameplayLabSession,
  type GameplayLabSessionView,
  type GameplayLabSummary
} from "@landscape/contracts";
import { scenarioById } from "@landscape/scenarios";

export type GameplayLabIds = {
  sessionId: () => string;
  trialId: () => string;
  matchId: () => string;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderedVariantIds(definition: GameplayLabDefinition, key: string): string[] {
  const variants = definition.variants.map((variant) => variant.variantId);
  let state = hashString(`${definition.labId}:${definition.version}:${key}`);
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return state >>> 0;
  };
  if (definition.trialOrder === "counterbalanced") {
    const offset = next() % variants.length;
    const rotated = [...variants.slice(offset), ...variants.slice(0, offset)];
    return next() % 2 === 0 ? rotated : rotated.reverse();
  }
  const shuffled = [...variants];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = next() % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function gameplayLabSummary(definition: GameplayLabDefinition): GameplayLabSummary {
  const scenario = scenarioById.get(definition.scenarioId);
  if (!scenario || scenario.version !== definition.scenarioVersion) throw new Error(`gameplay_lab_scenario_mismatch:${definition.labId}`);
  return GameplayLabSummarySchema.parse({
    labId: definition.labId,
    version: definition.version,
    title: definition.title,
    estimatedMinutes: definition.estimatedMinutes,
    scenarioId: scenario.scenarioId,
    scenarioTitle: scenario.title,
    missionObjective: scenario.missionObjective,
    preBrief: definition.preBrief,
    trialCount: definition.variants.length
  });
}

export function createGameplayLabSession(
  definition: GameplayLabDefinition,
  participantId: string,
  ids: GameplayLabIds,
  now = new Date().toISOString()
): GameplayLabSession {
  if (!participantId.trim()) throw new Error("participant_required");
  const labSessionId = ids.sessionId();
  const variantIds = orderedVariantIds(definition, `${participantId}:${labSessionId}`);
  return GameplayLabSessionSchema.parse({
    labSessionId,
    labId: definition.labId,
    labVersion: definition.version,
    participantId,
    status: "active",
    currentTrialIndex: 0,
    trials: variantIds.map((variantId, index) => ({
      trialId: ids.trialId(),
      variantId,
      variantToken: String.fromCharCode(65 + index),
      matchId: ids.matchId(),
      status: index === 0 ? "active" : "pending",
      startedAt: index === 0 ? now : null,
      completedAt: null,
      bookmarks: []
    })),
    createdAt: now,
    updatedAt: now
  });
}

export function gameplayLabSessionView(
  session: GameplayLabSession,
  definition: GameplayLabDefinition
): GameplayLabSessionView {
  const current = session.status === "active" ? session.trials[session.currentTrialIndex] : undefined;
  const currentVariant = current ? definition.variants.find((variant) => variant.variantId === current.variantId) : undefined;
  const doctrineCard = currentVariant?.doctrineCard
    ? {
        prompt: currentVariant.doctrineCard.prompt,
        steps: currentVariant.doctrineCard.steps
      }
    : undefined;
  return GameplayLabSessionViewSchema.parse({
    labSessionId: session.labSessionId,
    labId: session.labId,
    labVersion: session.labVersion,
    title: definition.title,
    status: session.status,
    currentTrialIndex: session.currentTrialIndex,
    trialCount: session.trials.length,
    currentTrial: current ? {
      trialId: current.trialId,
      variantToken: current.variantToken,
      matchId: current.matchId,
      status: current.status,
      startedAt: current.startedAt,
      completedAt: current.completedAt,
      bookmarks: current.bookmarks,
      doctrineCard
    } : null,
    completedTrialTokens: session.trials.filter((trial) => trial.status === "complete").map((trial) => trial.variantToken),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    revealedVariants: session.status === "complete"
      ? session.trials.map((trial) => {
          const variant = definition.variants.find((candidate) => candidate.variantId === trial.variantId);
          if (!variant) throw new Error(`gameplay_lab_variant_missing:${trial.variantId}`);
          return { variantToken: trial.variantToken, variantId: trial.variantId, labelForReview: variant.labelForReview };
        })
      : undefined
  });
}

function cloneSession(session: GameplayLabSession): GameplayLabSession {
  return structuredClone(session);
}

function findTrial(session: GameplayLabSession, trialId: string) {
  const trial = session.trials.find((candidate) => candidate.trialId === trialId);
  if (!trial) throw new Error("gameplay_lab_trial_not_found");
  return trial;
}

export function completeGameplayLabTrial(
  session: GameplayLabSession,
  trialId: string,
  now = new Date().toISOString()
): GameplayLabSession {
  const next = cloneSession(session);
  const trial = findTrial(next, trialId);
  if (next.status !== "active" || next.trials[next.currentTrialIndex]?.trialId !== trialId) throw new Error("gameplay_lab_trial_not_current");
  if (trial.status !== "active") throw new Error("gameplay_lab_trial_not_active");
  trial.status = "awaiting_pre_review";
  trial.completedAt = now;
  next.updatedAt = now;
  return GameplayLabSessionSchema.parse(next);
}

export function bookmarkGameplayLabDecision(
  session: GameplayLabSession,
  trialId: string,
  bookmark: GameplayLabBookmark,
  now = new Date().toISOString()
): GameplayLabSession {
  const next = cloneSession(session);
  const trial = findTrial(next, trialId);
  if (trial.status !== "active") throw new Error("gameplay_lab_trial_not_active");
  trial.bookmarks.push(bookmark);
  next.updatedAt = now;
  return GameplayLabSessionSchema.parse(next);
}

export function submitGameplayLabReview(
  session: GameplayLabSession,
  request: GameplayLabReviewRequest,
  now = new Date().toISOString()
): GameplayLabSession {
  const next = cloneSession(session);
  if (request.phase === "pre") {
    const trial = findTrial(next, request.trialId);
    if (trial.status !== "awaiting_pre_review") throw new Error("gameplay_lab_pre_review_not_available");
    trial.preReview = request.answers;
    trial.status = "reconstruction_available";
  } else if (request.phase === "post") {
    const trial = findTrial(next, request.trialId);
    if (trial.status !== "reconstruction_available" || !trial.preReview) throw new Error("gameplay_lab_post_review_not_available");
    trial.postReview = request.answers;
    trial.status = "complete";
    if (next.currentTrialIndex + 1 < next.trials.length) {
      next.currentTrialIndex += 1;
      const following = next.trials[next.currentTrialIndex];
      following.status = "active";
      following.startedAt = now;
    } else {
      next.status = "awaiting_final_review";
    }
  } else {
    if (next.status !== "awaiting_final_review") throw new Error("gameplay_lab_final_review_not_available");
    const tokens = new Set(next.trials.map((trial) => trial.variantToken));
    for (const token of [request.answers.clearestTrialToken, request.answers.fairestTrialToken, request.answers.mostInterestingTrialToken]) {
      if (!tokens.has(token)) throw new Error("gameplay_lab_invalid_trial_token");
    }
    next.finalReview = request.answers;
    next.status = "complete";
  }
  next.updatedAt = now;
  return GameplayLabSessionSchema.parse(next);
}
