import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameplayLabReviewRequest } from "@landscape/contracts";
import { gameplayLabById, gameplayLabs } from "@landscape/scenarios";
import {
  bookmarkGameplayLabDecision,
  completeGameplayLabTrial,
  createGameplayLabSession,
  gameplayLabSessionView,
  gameplayLabSummary,
  submitGameplayLabReview
} from "./gameplay-lab-core.js";
import { gameplayLabSourceFilesPresent, preflightGameplayLabs } from "./gameplay-lab-preflight.js";

function ids() {
  let session = 0;
  let trial = 0;
  let match = 0;
  return {
    sessionId: () => `session-${++session}`,
    trialId: () => `trial-${++trial}`,
    matchId: () => `match-${++match}`
  };
}

const preAnswers = {
  bindingConstraint: "commander energy",
  decisiveDecision: "the final commitment",
  replayChange: "forecast the complete route",
  earnedRating: 4,
  confidenceRating: 3
} as const;

const postAnswers = {
  explanationChanged: true,
  updatedExplanation: "the contract reduced the final commitment cost",
  missingOrMisleading: "nominal action prices did not show conditional cost"
} as const;

describe("gameplay lab session", () => {
  it("keeps treatment identity blinded until final review", () => {
    const definition = gameplayLabById.get("GL-001")!;
    const session = createGameplayLabSession(definition, "participant-1", ids(), "2026-01-01T00:00:00.000Z");
    const view = gameplayLabSessionView(session, definition);
    expect(view.currentTrial?.variantToken).toBe("A");
    expect(view.revealedVariants).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("variantId");
    expect(JSON.stringify(gameplayLabSummary(definition))).not.toContain(definition.hypothesis);

    const zoo = gameplayLabById.get("GL-005")!;
    const zooView = gameplayLabSessionView(createGameplayLabSession(zoo, "participant-zoo", ids()), zoo);
    expect(zooView.currentTrial?.doctrineCard).toBeDefined();
    expect(JSON.stringify(zooView.currentTrial?.doctrineCard)).not.toContain("policyId");
    expect(JSON.stringify(zooView.currentTrial?.doctrineCard)).not.toContain("category");
  });

  it("is deterministic for a participant/session key and counterbalances across keys", () => {
    const definition = gameplayLabById.get("GL-001")!;
    const first = createGameplayLabSession(definition, "participant-1", ids());
    const second = createGameplayLabSession(definition, "participant-1", ids());
    expect(first.trials.map((trial) => trial.variantId)).toEqual(second.trials.map((trial) => trial.variantId));

    const orders = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const session = createGameplayLabSession(definition, `participant-${index}`, ids());
      orders.add(session.trials.map((trial) => trial.variantId).join("|"));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("enforces pre/post/final review order, resumes the next trial, and then reveals", () => {
    const definition = gameplayLabById.get("GL-001")!;
    let session = createGameplayLabSession(definition, "participant-1", ids());
    const first = session.trials[0];

    expect(() => submitGameplayLabReview(session, {
      phase: "pre",
      trialId: first.trialId,
      answers: preAnswers
    })).toThrow("gameplay_lab_pre_review_not_available");

    session = bookmarkGameplayLabDecision(session, first.trialId, {
      note: "this is the commitment point",
      occurredAt: "2026-01-01T00:01:00.000Z"
    });
    expect(session.trials[0].bookmarks).toHaveLength(1);

    session = completeGameplayLabTrial(session, first.trialId);
    session = submitGameplayLabReview(session, { phase: "pre", trialId: first.trialId, answers: preAnswers });
    expect(session.trials[0].status).toBe("reconstruction_available");
    session = submitGameplayLabReview(session, { phase: "post", trialId: first.trialId, answers: postAnswers });
    expect(session.currentTrialIndex).toBe(1);
    expect(session.trials[1].status).toBe("active");

    while (session.status === "active") {
      const trial = session.trials[session.currentTrialIndex];
      session = completeGameplayLabTrial(session, trial.trialId);
      session = submitGameplayLabReview(session, { phase: "pre", trialId: trial.trialId, answers: preAnswers });
      session = submitGameplayLabReview(session, { phase: "post", trialId: trial.trialId, answers: postAnswers });
    }
    expect(session.status).toBe("awaiting_final_review");

    const final: GameplayLabReviewRequest = {
      phase: "final",
      answers: {
        clearestTrialToken: "A",
        fairestTrialToken: "B",
        mostInterestingTrialToken: "C",
        comparisonNotes: "B made the edge easiest to forecast.",
        disposition: "revise",
        dispositionRationale: "Keep the tradeoff but expose conditional costs."
      }
    };
    session = submitGameplayLabReview(session, final);
    const view = gameplayLabSessionView(session, definition);
    expect(view.status).toBe("complete");
    expect(view.revealedVariants).toHaveLength(3);
    expect(view.revealedVariants?.map((item) => item.variantToken)).toEqual(["A", "B", "C"]);
  });
});

describe("gameplay lab reachability", () => {
  it("accepts the tracked compact summary when full local reports are absent", () => {
    const repoRoot = resolve(process.cwd(), "../..");
    const portableRoot = mkdtempSync(join(tmpdir(), "contextlandscape-preflight-"));
    try {
      mkdirSync(join(portableRoot, "data/lab"), { recursive: true });
      copyFileSync(
        join(repoRoot, "data/lab/sleep-01-summary.json"),
        join(portableRoot, "data/lab/sleep-01-summary.json")
      );
      expect(gameplayLabs.every((lab) => gameplayLabSourceFilesPresent(portableRoot, lab.source))).toBe(true);
    } finally {
      rmSync(portableRoot, { recursive: true, force: true });
    }
  });

  it("preflights every registered source and variant", () => {
    const repoRoot = resolve(process.cwd(), "../..");
    const report = preflightGameplayLabs(repoRoot, "2026-01-01T00:00:00.000Z");
    expect(report.labs).toHaveLength(gameplayLabs.length);
    expect(report.labs.every((lab) => lab.sourceFilesPresent)).toBe(true);
    expect(report.labs.filter((lab) => lab.controlReplayMatchesScenario !== null)
      .every((lab) => lab.controlReplayMatchesScenario)).toBe(true);
    expect(report.labs.flatMap((lab) => lab.variants).every((variant) => variant.winnable)).toBe(true);

    const oneEnergy = report.labs.find((lab) => lab.labId === "GL-001")!;
    const starved = oneEnergy.variants.find((variant) => variant.variantId === "gl-001-starved")!;
    expect(starved.minimumSlots).toBe(4);
    expect(starved.exampleActions.slice(0, 2)).toEqual(["scout", "build_contract"]);
    expect(starved.exampleActions.at(-1)).toBe("full_send");
    expect(starved.winningPathCount).toBeGreaterThan(1);

    const heat = report.labs.find((lab) => lab.labId === "GL-002")!;
    expect(heat.variants.find((variant) => variant.variantId === "gl-002-low-heat")?.minimumSlots).toBe(2);

    const zoo = report.labs.find((lab) => lab.labId === "GL-005")!;
    expect(zoo.variants.filter((variant) => variant.doctrineOutcome)).toHaveLength(11);
  });
});
