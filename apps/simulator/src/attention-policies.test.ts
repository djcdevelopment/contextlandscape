import {
  AttentionCapacityIntentSchema,
  AttentionCommandIntentSchema,
  AttentionMovementIntentSchema,
  AttentionPolicyProgramSchema,
  type AttentionMatchProjection,
  type AttentionPolicyProgram
} from "@landscape/contracts";
import {
  attentionCompositions,
  createAttentionMatch,
  defaultAttentionModel,
  defaultAttentionScenario,
  projectAttentionMatch,
  resolveAttentionCapacity,
  resolveAttentionMovement,
  runAttentionMatch,
  type AttentionMatch
} from "@landscape/engine";
import { describe, expect, it } from "vitest";
import {
  attentionPolicyById,
  attentionPolicyProgramIds,
  attentionPolicyPrograms,
  createAttentionController
} from "./attention-policies.js";

const expectedPolicyIds = [
  "accept-all",
  "verify-lowest-confidence",
  "verify-arbitrary",
  "seize-cheapest",
  "front-mobile-verify",
  "recon-lock-reject",
  "line-escort-lock",
  "uplink-seize",
  "capacity-ignore",
  "capacity-pioneer",
  "capacity-follower-overclock",
  "capacity-follower-flare",
  "capacity-follower-no-flare"
];

function create(
  matchId = "policy-test",
  compositionId = "balanced",
  randomStreamId = "policy-common-world"
): AttentionMatch {
  return createAttentionMatch({
    matchId,
    seed: 1987,
    randomStreamId,
    context: { model: defaultAttentionModel, scenario: defaultAttentionScenario },
    players: [
      { playerId: "alpha", composition: attentionCompositions[compositionId] },
      { playerId: "bravo", composition: attentionCompositions[compositionId] }
    ]
  });
}

function controller(programId: string, match: AttentionMatch, playerId = "alpha") {
  const program = attentionPolicyById.get(programId);
  if (!program) throw new Error(`Missing policy ${programId}`);
  return createAttentionController(program, { ...match.context, playerId });
}

function afterMovement(match: AttentionMatch): AttentionMatch {
  return resolveAttentionMovement(match, []).match;
}

function inCommandPhase(match: AttentionMatch): AttentionMatch {
  const moved = afterMovement(match);
  return resolveAttentionCapacity(moved, moved.state.players.map((player) => ({
    kind: "pass-capacity" as const,
    playerId: player.playerId
  }))).match;
}

describe("attention policy programs", () => {
  it("publishes the exact stable campaign registry as validated data", () => {
    expect(attentionPolicyProgramIds).toEqual(expectedPolicyIds);
    expect([...attentionPolicyById.keys()]).toEqual(expectedPolicyIds);
    expect(new Set(attentionPolicyProgramIds).size).toBe(attentionPolicyProgramIds.length);
    for (const program of attentionPolicyPrograms) {
      expect(AttentionPolicyProgramSchema.parse(program)).toEqual(program);
      expect(program.maxCommandActions).toBeLessThanOrEqual(64);
    }
  });

  it("enforces the 64-operation declarative bound", () => {
    const match = create();
    const invalid = { ...attentionPolicyPrograms[0], maxCommandActions: 65 } as AttentionPolicyProgram;
    expect(() => createAttentionController(invalid, { ...match.context, playerId: "alpha" })).toThrow();
  });

  it("ends a looping controller at its per-round operation cap", () => {
    const setup = create("operation-cap");
    const maxCommandActions = 2;
    const result = runAttentionMatch(setup, {
      alpha: {
        maxCommandActions,
        movement: () => [],
        claim: () => ({ kind: "pass-capacity", playerId: "alpha" }),
        command: () => ({ kind: "overclock", playerId: "alpha" })
      },
      bravo: controller("accept-all", setup, "bravo")
    }, { traceMode: "summary", maxOperations: 1_000 });
    expect(result.match.state.status).toBe("complete");
    expect(result.summary.eventTypes["attention.command.rejected"]).toBeLessThanOrEqual(
      defaultAttentionScenario.roundLimit * maxCommandActions
    );
  });

  it("emits only versioned intents accepted by the public contracts", () => {
    for (const program of attentionPolicyPrograms) {
      const initial = create(`intent-${program.policyId}`);
      const alpha = createAttentionController(program, { ...initial.context, playerId: "alpha" });
      const movementProjection = projectAttentionMatch(initial, "alpha");
      alpha.movement(movementProjection).forEach((intent) => AttentionMovementIntentSchema.parse(intent));

      const moved = afterMovement(initial);
      AttentionCapacityIntentSchema.parse(alpha.claim(projectAttentionMatch(moved, "alpha")));

      const commanding = resolveAttentionCapacity(moved, moved.state.players.map((player) => ({
        kind: "pass-capacity" as const,
        playerId: player.playerId
      }))).match;
      AttentionCommandIntentSchema.parse(alpha.command(projectAttentionMatch(commanding, "alpha")));
    }
  });
});

describe("projection-only interpretation", () => {
  it("cannot observe latent soundness and ignores injected hidden fields", () => {
    const match = inCommandPhase(create("secrecy"));
    const projection = projectAttentionMatch(match, "alpha");
    expect(projection.artifacts.length).toBeGreaterThan(0);
    expect(projection.artifacts.every((artifact) => !("sound" in artifact))).toBe(true);
    expect(projection.artifacts.some((artifact) => artifact.revealedSound === null)).toBe(true);

    const alpha = controller("verify-lowest-confidence", match);
    const baseline = alpha.command(projection);
    const withTrue = structuredClone(projection) as AttentionMatchProjection & { artifacts: Array<Record<string, unknown>> };
    const withFalse = structuredClone(projection) as AttentionMatchProjection & { artifacts: Array<Record<string, unknown>> };
    for (const artifact of withTrue.artifacts) artifact.sound = true;
    for (const artifact of withFalse.artifacts) artifact.sound = false;
    expect(alpha.command(withTrue as AttentionMatchProjection)).toEqual(baseline);
    expect(alpha.command(withFalse as AttentionMatchProjection)).toEqual(baseline);
  });

  it("uses stable lexical ties regardless of projection array order", () => {
    const match = inCommandPhase(create("lexical"));
    const projection = projectAttentionMatch(match, "alpha");
    for (const artifact of projection.artifacts) artifact.reportedConfidence = 0.5;
    const reversed = { ...projection, artifacts: [...projection.artifacts].reverse() };
    const alpha = controller("verify-arbitrary", match);
    const expected = projection.artifacts
      .filter((artifact) => artifact.ownerPlayerId === "alpha")
      .map((artifact) => artifact.artifactId)
      .sort((left, right) => left.localeCompare(right))[0];
    expect(alpha.command(projection)).toMatchObject({ kind: "verify", artifactId: expected });
    expect(alpha.command(reversed)).toMatchObject({ kind: "verify", artifactId: expected });
  });

  it("makes deterministic, bounded, collision-free movement selections", () => {
    const match = create("movement");
    const projection = projectAttentionMatch(match, "alpha");
    const alpha = controller("front-mobile-verify", match);
    const first = alpha.movement(projection);
    const second = alpha.movement(structuredClone(projection));
    expect(first).toEqual(second);
    expect(first.at(-1)).toEqual({ kind: "end-movement", playerId: "alpha" });

    const moves = first.filter((intent) => intent.kind === "move");
    expect(moves.length).toBeGreaterThan(0);
    expect(new Set(moves.map((move) => `${move.destination.x},${move.destination.y}`)).size).toBe(moves.length);
    for (const move of moves) {
      const unit = projection.units.find((candidate) => candidate.unitId === move.unitId)!;
      const range = match.context.model.chassis[unit.chassis].movementRange;
      expect(Math.max(Math.abs(unit.position.x - move.destination.x), Math.abs(unit.position.y - move.destination.y)))
        .toBeLessThanOrEqual(range);
      expect(move.destination.x).toBeGreaterThanOrEqual(0);
      expect(move.destination.x).toBeLessThan(match.context.scenario.board.width);
      expect(move.destination.y).toBeGreaterThanOrEqual(0);
      expect(move.destination.y).toBeLessThan(match.context.scenario.board.height);
    }
  });

  it("holds a Line anchor inside its front and advances it when the front shifts away", () => {
    const match = create("escort", "escort");
    const projection = projectAttentionMatch(match, "alpha");
    const moves = controller("line-escort-lock", match).movement(projection);
    const lineIds = new Set(projection.units
      .filter((unit) => unit.ownerPlayerId === "alpha" && unit.chassis === "line")
      .map((unit) => unit.unitId));
    expect(moves.some((intent) => intent.kind === "move" && lineIds.has(intent.unitId))).toBe(false);

    const shifted = structuredClone(projection);
    const ownFront = shifted.activeFronts.find((front) => front.playerId === "alpha")!;
    ownFront.center = { x: 7, y: 7 };
    ownFront.radius = 1;
    const shiftedMoves = controller("line-escort-lock", match).movement(shifted);
    expect(shiftedMoves.some((intent) => intent.kind === "move" && lineIds.has(intent.unitId))).toBe(true);
  });

  it("implements pioneer, follower, and ignore capacity timing without peeking", () => {
    const match = afterMovement(create("capacity-strategies"));
    const initial = projectAttentionMatch(match, "alpha");
    expect(controller("capacity-ignore", match).claim(initial).kind).toBe("pass-capacity");
    expect(controller("capacity-pioneer", match).claim(initial).kind).toBe("claim-capacity");
    expect(controller("capacity-follower-overclock", match).claim(initial).kind).toBe("pass-capacity");

    const followerWindow = structuredClone(initial);
    followerWindow.capacityTrack.nextSlot = match.context.model.capacity.followerStartsAtSlot;
    expect(controller("capacity-follower-overclock", match).claim(followerWindow).kind).toBe("claim-capacity");
    expect(controller("capacity-pioneer", match).claim(followerWindow).kind).toBe("pass-capacity");
  });
});

describe("policy comparison integrity", () => {
  it("uses the same latent world for distinct policy match ids", () => {
    const vector = (matchId: string) => afterMovement(create(matchId, "balanced", "paired-world")).state.artifacts
      .map((artifact) => ({
        ownerPlayerId: artifact.ownerPlayerId,
        sourceUnitId: artifact.sourceUnitId,
        sound: artifact.sound,
        reportedConfidence: artifact.reportedConfidence
      }));
    expect(vector("accept-world")).toEqual(vector("verify-world"));
  });

  it("runs every named controller to a bounded terminal outcome", () => {
    for (const program of attentionPolicyPrograms) {
      const setup = create(`full-${program.policyId}`);
      const result = runAttentionMatch(setup, {
        alpha: createAttentionController(program, { ...setup.context, playerId: "alpha" }),
        bravo: controller("accept-all", setup, "bravo")
      }, { traceMode: "summary", maxOperations: 5_000 });
      expect(result.match.state.status, program.policyId).toBe("complete");
      expect(result.summary.operations, program.policyId).toBeLessThan(5_000);
    }
  });
});
