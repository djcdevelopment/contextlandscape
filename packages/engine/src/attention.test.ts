import { describe, expect, it } from "vitest";
import { AttentionMatchStateSchema, AttentionModelDefinitionSchema, type AttentionMatchState } from "@landscape/contracts";
import {
  ATTENTION_ENGINE_VERSION,
  ATTENTION_MODEL_VERSION,
  applyAttentionIntent,
  attentionCompositions,
  createAttentionMatch,
  defaultAttentionModel,
  defaultAttentionScenario,
  projectAttentionMatch,
  resolveAttentionCapacity,
  resolveAttentionMovement,
  resolveAttentionRound,
  runAttentionMatch,
  type AttentionController,
  type AttentionMatch,
  type AttentionRuntimeContext
} from "./attention.js";

const passCapacity = (match: AttentionMatch) => match.state.players.map((player) => ({
  kind: "pass-capacity" as const,
  playerId: player.playerId
}));

function context(rules: Partial<AttentionRuntimeContext["model"]["rules"]> = {}): AttentionRuntimeContext {
  return {
    model: AttentionModelDefinitionSchema.parse({
      ...defaultAttentionModel,
      rules: { ...defaultAttentionModel.rules, ...rules }
    }),
    scenario: defaultAttentionScenario
  };
}

function create(
  matchId = "attention-test",
  seed = 41000,
  compositionId = "balanced",
  runtime = context({ soundnessRate: 1, objectiveTarget: 999, driftLimit: 999 })
): AttentionMatch {
  return createAttentionMatch({
    matchId,
    seed,
    context: runtime,
    players: [
      { playerId: "alpha", composition: attentionCompositions[compositionId] },
      { playerId: "bravo", composition: attentionCompositions[compositionId] }
    ]
  });
}

function commandPhase(match: AttentionMatch) {
  const moved = resolveAttentionMovement(match, []).match;
  return resolveAttentionCapacity(moved, passCapacity(moved)).match;
}

function finishRound(match: AttentionMatch) {
  return resolveAttentionRound(match).match;
}

function edit(match: AttentionMatch, mutate: (state: AttentionMatchState) => void): AttentionMatch {
  const state = structuredClone(match.state);
  mutate(state);
  return { ...match, state };
}

describe("duel-capacity-v1 attention reducer", () => {
  it("exports independent engine/model versions and constructs contract-valid hidden state", () => {
    expect(ATTENTION_ENGINE_VERSION).toBe("1.0.0");
    expect(ATTENTION_MODEL_VERSION).toBe("duel-capacity-v1");
    const match = create();
    expect(() => AttentionMatchStateSchema.parse(match.state)).not.toThrow();
    expect(match.state.phase).toBe("movement");
    expect(match.state.players).toHaveLength(2);

    const emitted = resolveAttentionMovement(match, []).match;
    const projection = projectAttentionMatch(emitted, "alpha");
    expect(projection.activeFronts).toHaveLength(2);
    expect(projection.artifacts.length).toBeGreaterThan(0);
    expect(projection.artifacts.every((artifact) => artifact.revealedSound === null)).toBe(true);
    expect("sound" in projection.artifacts[0]).toBe(false);
    expect("seed" in projection).toBe(false);
    expect("randomStreamId" in projection).toBe(false);
    expect(match.state.seed).toBe(41000);
    expect(match.state.randomStreamId).toBeTruthy();
  });

  it("rejects non-sequential capacity ranks and non-3x3 Flare footprints", () => {
    const invalidRanks = {
      ...defaultAttentionModel,
      capacity: {
        ...defaultAttentionModel.capacity,
        slots: defaultAttentionModel.capacity.slots.map((slot, index) => ({
          ...slot,
          rank: index === 1 ? 99 : slot.rank
        }))
      }
    };
    const invalidFootprint = {
      ...defaultAttentionModel,
      capacity: {
        ...defaultAttentionModel.capacity,
        macroFlare: { ...defaultAttentionModel.capacity.macroFlare, width: 4 }
      }
    };
    expect(AttentionModelDefinitionSchema.safeParse(invalidRanks).success).toBe(false);
    expect(AttentionModelDefinitionSchema.safeParse(invalidFootprint).success).toBe(false);
  });

  it("resolves Chebyshev movement simultaneously, allowing swaps and blocking occupied origins", () => {
    const initial = create();
    const swapped = resolveAttentionMovement(initial, [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout", destination: { x: 1, y: 2 } },
      { kind: "move", playerId: "alpha", unitId: "alpha:line", destination: { x: 1, y: 1 } }
    ]);
    expect(swapped.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.position).toEqual({ x: 1, y: 2 });
    expect(swapped.match.state.units.find((unit) => unit.unitId === "alpha:line")?.position).toEqual({ x: 1, y: 1 });

    const blocked = resolveAttentionMovement(create("blocked"), [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout", destination: { x: 1, y: 2 } }
    ]);
    expect(blocked.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.position).toEqual({ x: 1, y: 1 });
    expect(blocked.events.some((item) => item.eventType === "attention.movement.rejected" && item.data.reason === "occupied")).toBe(true);
  });

  it("uses alternating player priority and unit id for duplicate destinations", () => {
    const placed = edit(create("priority", 1, "scout-homogeneous"), (state) => {
      state.units.find((unit) => unit.unitId === "alpha:scout-1")!.position = { x: 3, y: 3 };
      state.units.find((unit) => unit.unitId === "bravo:scout-1")!.position = { x: 5, y: 5 };
    });
    const odd = resolveAttentionMovement(placed, [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout-1", destination: { x: 4, y: 4 } },
      { kind: "move", playerId: "bravo", unitId: "bravo:scout-1", destination: { x: 4, y: 4 } }
    ]).match;
    expect(odd.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.position).toEqual({ x: 4, y: 4 });
    expect(odd.state.units.find((unit) => unit.unitId === "bravo:scout-1")?.position).toEqual({ x: 5, y: 5 });

    const evenPlaced = edit(placed, (state) => { state.round = 2; });
    const even = resolveAttentionMovement(evenPlaced, [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout-1", destination: { x: 4, y: 4 } },
      { kind: "move", playerId: "bravo", unitId: "bravo:scout-1", destination: { x: 4, y: 4 } }
    ]).match;
    expect(even.state.units.find((unit) => unit.unitId === "bravo:scout-1")?.position).toEqual({ x: 4, y: 4 });
  });

  it("queues Recon and Uplink for the next round and awards the Line streak windfall", () => {
    let match = resolveAttentionMovement(create("stationary"), []).match;
    const alpha = () => match.state.players.find((player) => player.playerId === "alpha")!;
    expect(alpha().targetLocks).toBe(1);
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout")?.nextEmissionCalibration).toBe(0.85);
    expect(match.state.units.find((unit) => unit.unitId === "alpha:siege")?.nextEmissionCalibration).toBe(0.2);
    expect(alpha().queuedUplinkBonus).toBe(1);

    match = resolveAttentionCapacity(match, passCapacity(match)).match;
    match = finishRound(match);
    expect(alpha().attention).toBe(4);
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout")?.emissionCalibration).toBe(0.85);

    let transition = resolveAttentionMovement(match, []);
    expect(transition.events.find((item) => item.eventType === "attention.artifacts.emitted" && item.actorId === "alpha:scout")?.data.calibration).toBe(0.85);
    match = transition.match;
    match = finishRound(resolveAttentionCapacity(match, passCapacity(match)).match);
    match = resolveAttentionMovement(match, []).match;
    expect(alpha().targetLocks).toBe(5); // +1, +1, then +1 plus the two-token third-turn windfall.
  });

  it("resolves shared capacity claims with alternating priority and applies awards next round", () => {
    let match = resolveAttentionMovement(create("capacity", 7, "scout-homogeneous"), []).match;
    const first = resolveAttentionCapacity(match, [
      { kind: "claim-capacity", playerId: "alpha" },
      { kind: "claim-capacity", playerId: "bravo" }
    ]);
    match = first.match;
    expect(match.state.capacityTrack.claims).toEqual([
      { slotIndex: 0, playerId: "alpha", round: 1, attentionPaid: 1, capacityAward: 1 }
    ]);
    expect(match.state.players[0].attention).toBe(2);
    expect(match.state.players[1].attention).toBe(3);
    expect(first.events.some((item) => item.actorId === "bravo" && item.data.reason === "priority_conflict")).toBe(true);

    match = finishRound(match);
    expect(match.state.players[0].attention).toBe(4);
    match = resolveAttentionMovement(match, []).match;
    match = resolveAttentionCapacity(match, [
      { kind: "claim-capacity", playerId: "alpha" },
      { kind: "claim-capacity", playerId: "bravo" }
    ]).match;
    expect(match.state.capacityTrack.claims[1].playerId).toBe("bravo");
    expect(match.state.players[1].claimCount).toBe(1);

    const movementOnly = resolveAttentionMovement(create("capacity-single"), []).match;
    expect(() => applyAttentionIntent(movementOnly, {
      kind: "pass-capacity",
      playerId: "alpha"
    })).toThrow("Capacity intents must be supplied together");
  });

  it("starts at a scenario capacity slot without granting personal claims or awards", () => {
    const preflightScenario = {
      ...defaultAttentionScenario,
      scenarioId: "capacity-preflight",
      initialCapacitySlot: 2
    };
    const match = createAttentionMatch({
      matchId: "capacity-preflight",
      seed: 8,
      context: { model: defaultAttentionModel, scenario: preflightScenario }
    });
    expect(match.state.capacityTrack).toEqual({ nextSlot: 2, claims: [] });
    expect(match.state.players.map((player) => ({
      claimCount: player.claimCount,
      capacityBonus: player.capacityBonus
    }))).toEqual([
      { claimCount: 0, capacityBonus: 0 },
      { claimCount: 0, capacityBonus: 0 }
    ]);

    expect(() => createAttentionMatch({
      matchId: "capacity-preflight-invalid",
      seed: 8,
      context: {
        model: defaultAttentionModel,
        scenario: {
          ...defaultAttentionScenario,
          scenarioId: "capacity-preflight-invalid",
          initialCapacitySlot: defaultAttentionModel.capacity.slots.length + 1
        }
      }
    })).toThrow("initial capacity slot exceeds the capacity track");
  });

  it("spends a free Target Lock without mutating or revealing latent soundness", () => {
    let match = commandPhase(create("assist", 9, "escort"));
    const source = match.state.units.find((unit) => unit.unitId === "alpha:line")!;
    const target = match.state.artifacts.find((artifact) => artifact.sourceUnitId === "alpha:scout-1")!;
    const latent = target.sound;
    match = applyAttentionIntent(match, {
      kind: "target-lock",
      playerId: "alpha",
      sourceUnitId: source.unitId,
      artifactId: target.artifactId
    }).match;
    const assisted = match.state.artifacts.find((artifact) => artifact.artifactId === target.artifactId)!;
    expect(assisted.guarantee).toBe("target-lock");
    expect(assisted.guaranteedById).toBe(source.unitId);
    expect(assisted.sound).toBe(latent);
    expect(assisted.revealed).toBe(false);
    expect(match.state.players[0].targetLocks).toBe(0);
  });

  it("rejects Target Lock assistance after an artifact has been verified", () => {
    let match = commandPhase(create("assist-verified", 10, "escort"));
    const source = match.state.units.find((unit) => unit.unitId === "alpha:line")!;
    const target = match.state.artifacts.find((artifact) => artifact.sourceUnitId === "alpha:scout-1")!;
    match = applyAttentionIntent(match, {
      kind: "verify",
      playerId: "alpha",
      artifactId: target.artifactId
    }).match;
    const rejected = applyAttentionIntent(match, {
      kind: "target-lock",
      playerId: "alpha",
      sourceUnitId: source.unitId,
      artifactId: target.artifactId
    });
    expect(rejected.events.some((item) => item.data.reason === "already_verified")).toBe(true);
    expect(rejected.match.state.players[0].targetLocks).toBe(1);
    expect(rejected.match.state.artifacts.find((artifact) => artifact.artifactId === target.artifactId)?.guarantee).toBeNull();
  });

  it("enforces ability unlocks, cooldowns, one-shot use, and Overclock seize discount", () => {
    let match = commandPhase(create("abilities", 11, "scout-homogeneous"));
    match = edit(match, (state) => { state.players[0].claimCount = 3; });
    const artifacts = match.state.artifacts.filter((artifact) => artifact.ownerPlayerId === "alpha");
    const attentionBefore = match.state.players[0].attention;

    match = applyAttentionIntent(match, { kind: "perfect-focus", playerId: "alpha", artifactId: artifacts[0].artifactId }).match;
    expect(match.state.players[0].focusUses).toBe(1);
    expect(match.state.players[0].focusNextReadyRound).toBe(4);
    const cooldown = applyAttentionIntent(match, { kind: "perfect-focus", playerId: "alpha", artifactId: artifacts[1].artifactId });
    expect(cooldown.events.some((item) => item.data.reason === "cooldown")).toBe(true);

    match = applyAttentionIntent(match, { kind: "overclock", playerId: "alpha" }).match;
    match = applyAttentionIntent(match, { kind: "seize", playerId: "alpha", artifactId: artifacts[1].artifactId }).match;
    expect(match.state.players[0].attention).toBe(attentionBefore); // Scout seize 1 - Overclock 1.
    const repeated = applyAttentionIntent(match, { kind: "overclock", playerId: "alpha" });
    expect(repeated.events.some((item) => item.data.reason === "uses_exhausted")).toBe(true);
  });

  it("honors model switches for objective range, disabled abilities, Flare range, and Uplink stacking", () => {
    const model = AttentionModelDefinitionSchema.parse({
      ...defaultAttentionModel,
      rules: { ...defaultAttentionModel.rules, soundnessRate: 1, objectiveTarget: 999, driftLimit: 999, requireObjectiveRange: false },
      stationary: {
        ...defaultAttentionModel.stationary,
        targetLock: { ...defaultAttentionModel.stationary.targetLock, range: 0 },
        commandUplink: { ...defaultAttentionModel.stationary.commandUplink, stackLimit: 0 }
      },
      capacity: {
        ...defaultAttentionModel.capacity,
        perfectFocus: { ...defaultAttentionModel.capacity.perfectFocus, maxUses: 0 },
        overclock: { ...defaultAttentionModel.capacity.overclock, maxUses: 0 },
        macroFlare: { ...defaultAttentionModel.capacity.macroFlare, range: 4, maxUses: 1 }
      }
    });
    let match = create("switches", 12, "balanced", { model, scenario: defaultAttentionScenario });
    match = resolveAttentionMovement(match, [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout", destination: { x: 0, y: 4 } }
    ]).match;
    expect(match.state.artifacts.find((artifact) => artifact.sourceUnitId === "alpha:scout")?.objectiveEligible).toBe(true);
    expect(match.state.players[0].queuedUplinkBonus).toBe(0);
    match = resolveAttentionCapacity(match, passCapacity(match)).match;
    match = edit(match, (state) => { state.players[0].claimCount = 3; });
    const target = match.state.artifacts.find((artifact) => artifact.ownerPlayerId === "alpha")!;
    const focus = applyAttentionIntent(match, { kind: "perfect-focus", playerId: "alpha", artifactId: target.artifactId });
    expect(focus.events.some((item) => item.data.reason === "uses_exhausted")).toBe(true);
    const overclock = applyAttentionIntent(match, { kind: "overclock", playerId: "alpha" });
    expect(overclock.events.some((item) => item.data.reason === "uses_exhausted")).toBe(true);
    const flare = applyAttentionIntent(match, { kind: "macro-flare", playerId: "alpha", center: { x: 4, y: 4 } });
    expect(flare.events.some((item) => item.eventType === "attention.macro-flare.deployed")).toBe(true);
  });

  it("applies a clipped, non-stacking Macro Flare to exactly the next two emissions", () => {
    let match = commandPhase(create("flare", 13, "scout-homogeneous"));
    match = edit(match, (state) => { state.players[0].claimCount = 3; });
    match = applyAttentionIntent(match, { kind: "macro-flare", playerId: "alpha", center: { x: 0, y: 0 } }).match;
    match = finishRound(match);

    const emitted = () => match.state.artifacts.filter((artifact) => artifact.ownerPlayerId === "alpha").length;
    match = resolveAttentionMovement(match, []).match;
    expect(emitted()).toBe(12); // Clipped corner zone catches one three-output Scout: 9 + 3.
    match = finishRound(resolveAttentionCapacity(match, passCapacity(match)).match);
    match = resolveAttentionMovement(match, []).match;
    expect(emitted()).toBe(12);
    match = finishRound(resolveAttentionCapacity(match, passCapacity(match)).match);
    match = resolveAttentionMovement(match, []).match;
    expect(emitted()).toBe(9);
  });

  it("snapshots front eligibility while unsound accepted work drifts anywhere", () => {
    const runtime = context({ soundnessRate: 0, objectiveTarget: 999, driftLimit: 999 });
    let match = create("front", 17, "scout-homogeneous", runtime);
    match = resolveAttentionMovement(match, [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout-1", destination: { x: 0, y: 4 } }
    ]).match;
    match = resolveAttentionCapacity(match, passCapacity(match)).match;
    const outside = match.state.artifacts.find((artifact) => artifact.sourceUnitId === "alpha:scout-1")!;
    expect(outside.objectiveEligible).toBe(false);
    for (const artifact of match.state.artifacts.filter((candidate) =>
      candidate.ownerPlayerId === "alpha" && candidate.artifactId !== outside.artifactId
    )) {
      match = applyAttentionIntent(match, { kind: "reject", playerId: "alpha", artifactId: artifact.artifactId }).match;
    }
    match = finishRound(match);
    expect(match.state.players[0].progress).toBe(0);
    expect(match.state.players[0].drift).toBe(1);
  });

  it("resolves both sides before terminal checks and lets drift defeat progress", () => {
    const runtime = context({ soundnessRate: 1, objectiveTarget: 1, driftLimit: 1 });
    let match = commandPhase(create("terminal", 19, "balanced", runtime));
    match = edit(match, (state) => {
      state.round = runtime.scenario.roundLimit;
      const alpha = state.artifacts.filter((artifact) => artifact.ownerPlayerId === "alpha");
      alpha[0].sound = true;
      alpha[1].sound = false;
      for (const artifact of alpha.slice(2)) artifact.resolution = "rejected";
      for (const artifact of state.artifacts.filter((artifact) => artifact.ownerPlayerId === "bravo")) artifact.resolution = "rejected";
    });
    match = finishRound(match);
    expect(match.state.players[0].progress).toBe(1);
    expect(match.state.players[0].drift).toBe(1);
    expect(match.state.players[0].status).toBe("defeat");
    expect(match.state.winnerPlayerId).toBe("bravo");
    expect(match.state.terminalReason).toBe("drift");
  });

  it("represents an exact round-limit tiebreak as a draw", () => {
    let match = create("exact-draw", 21, "balanced");
    match = edit(match, (state) => { state.round = match.context.scenario.roundLimit; });
    match = commandPhase(match);
    match = finishRound(match);
    expect(match.state.terminalReason).toBe("round-limit");
    expect(match.state.winnerPlayerId).toBeNull();
    expect(match.state.players.map((player) => player.status)).toEqual(["draw", "draw"]);
    expect(() => AttentionMatchStateSchema.parse(match.state)).not.toThrow();
  });

  it("attributes Flare drift causally over the whole resolution, independent of artifact order", () => {
    const execute = (driftLimit: number, traceMode: "summary" | "full" = "summary") => {
      const model = AttentionModelDefinitionSchema.parse({
        ...defaultAttentionModel,
        rules: {
          ...defaultAttentionModel.rules,
          objectiveTarget: 999,
          driftLimit,
          soundnessRate: 0
        },
        capacity: {
          ...defaultAttentionModel.capacity,
          macroFlare: {
            ...defaultAttentionModel.capacity.macroFlare,
            range: 9,
            durationEmissions: 1
          }
        }
      });
      let match = createAttentionMatch({
        matchId: `flare-causality-${driftLimit}`,
        seed: 31,
        context: { model, scenario: defaultAttentionScenario },
        players: [
          { playerId: "alpha", composition: attentionCompositions.balanced },
          { playerId: "bravo", composition: attentionCompositions["scout-homogeneous"] }
        ]
      });
      match = edit(match, (state) => { state.players[0].claimCount = 3; });
      const controller = (playerId: "alpha" | "bravo"): AttentionController => ({
        movement: () => [{ kind: "end-movement", playerId }],
        claim: () => ({ kind: "pass-capacity", playerId }),
        command: (projection) => {
          const player = projection.players.find((candidate) => candidate.playerId === playerId)!;
          if (playerId === "alpha" && projection.round === 1 && !player.flareUsed) {
            return { kind: "macro-flare", playerId, center: { x: 8, y: 8 } };
          }
          const pending = projection.artifacts.find((artifact) =>
            artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
          );
          if (pending && (projection.round === 1 || playerId === "alpha")) {
            return { kind: "reject", playerId, artifactId: pending.artifactId };
          }
          return { kind: "end-command", playerId };
        }
      });
      return runAttentionMatch(match, {
        alpha: controller("alpha"),
        bravo: controller("bravo")
      }, { traceMode });
    };

    const directlyInduced = execute(13, "full");
    expect(directlyInduced.summary.players.alpha.driftDefeatsInduced).toBe(1);
    expect(directlyInduced.summary.players.bravo.minimumAttentionToArtifactRatio).toBeCloseTo(1 / 6);
    expect(directlyInduced.match.state.terminalReason).toBe("drift");
    const thresholdEvent = directlyInduced.events?.find((item) =>
      item.eventType === "attention.artifact.resolved.unsound" && item.data.driftAfter === 13
    );
    const addedIds = directlyInduced.events
      ?.filter((item) => item.eventType === "attention.artifacts.emitted")
      .flatMap((item) => Array.isArray(item.data.flareAddedArtifactIds) ? item.data.flareAddedArtifactIds : []) ?? [];
    expect(thresholdEvent).toBeDefined();
    expect(addedIds).not.toContain(thresholdEvent?.data.artifactId);

    const laterBaselineDefeat = execute(19);
    expect(laterBaselineDefeat.summary.players.alpha.driftDefeatsInduced).toBe(0);
    expect(laterBaselineDefeat.match.state.terminalReason).toBe("drift");
  });

  it("produces identical latent worlds across run ids and distinct worlds across streams", () => {
    const vector = (match: AttentionMatch) => resolveAttentionMovement(match, []).match.state.artifacts.map((artifact) => ({
      ownerPlayerId: artifact.ownerPlayerId,
      sourceUnitId: artifact.sourceUnitId,
      sound: artifact.sound,
      reportedConfidence: artifact.reportedConfidence
    }));
    const left = createAttentionMatch({ matchId: "policy-a", seed: 23 });
    const right = createAttentionMatch({ matchId: "policy-b", seed: 23 });
    const otherStream = createAttentionMatch({ matchId: "policy-c", seed: 23, randomStreamId: "holdout" });
    expect(vector(left)).toEqual(vector(right));
    expect(vector(left)).not.toEqual(vector(otherStream));
  });

  it("keeps outcome, trace hash, and production counters identical across trace modes", () => {
    const controller = (playerId: string): AttentionController => ({
      movement: () => [{ kind: "end-movement", playerId }],
      claim: () => ({ kind: "pass-capacity", playerId }),
      command: () => ({ kind: "end-command", playerId })
    });
    const setup = {
      matchId: "trace-equivalence",
      seed: 29,
      players: [
        { playerId: "alpha", composition: attentionCompositions.balanced },
        { playerId: "bravo", composition: attentionCompositions.balanced }
      ]
    } as const;
    const controllers = { alpha: controller("alpha"), bravo: controller("bravo") };
    const summary = runAttentionMatch(setup, controllers, { traceMode: "summary" });
    const hashed = runAttentionMatch(setup, controllers, { traceMode: "hash" });
    const full = runAttentionMatch(setup, controllers, { traceMode: "full" });
    expect(summary.match.state).toEqual(hashed.match.state);
    expect(summary.match.state).toEqual(full.match.state);
    expect(summary.traceHash).toBe(hashed.traceHash);
    expect(summary.traceHash).toBe(full.traceHash);
    expect(summary.traceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(summary.summary).toEqual(full.summary);
    expect(summary.events).toBeUndefined();
    expect(hashed.events).toBeUndefined();
    expect(full.events).toHaveLength(full.summary.events);
    expect(full.summary.players.alpha.artifactsEmitted).toBeGreaterThan(0);
    expect(full.summary.players.alpha.stationaryTurns).toBeGreaterThan(0);
    expect(full.summary.players.alpha.reconLockActivations).toBeGreaterThan(0);
    expect(full.summary.players.alpha.targetLocksGenerated).toBeGreaterThan(0);
  });
});
