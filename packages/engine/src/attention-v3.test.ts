import { describe, expect, it } from "vitest";
import {
  ATTENTION_V3_MODEL_VERSION,
  AttentionMatchStateSchema,
  AttentionModelDefinitionSchema,
  type AttentionArtilleryIntent,
  type AttentionMatchState,
  type AttentionMovementIntent,
  type AttentionProjection
} from "@landscape/contracts";
import {
  attentionCompositions,
  applyAttentionIntent,
  createAttentionMatch,
  defaultAttentionModel,
  defaultAttentionV3ArtilleryModel,
  defaultAttentionV3Model,
  defaultAttentionV3Spatial,
  defaultAttentionV3SpatialModel,
  defaultAttentionV3Uap,
  projectAttentionMatch,
  resolveAttentionArtillery,
  resolveAttentionCapacity,
  resolveAttentionEmission,
  resolveAttentionMovement,
  resolveAttentionRound,
  resolveAttentionV3ArtilleryContext,
  resolveAttentionV3Context,
  resolveAttentionV3SpatialContext,
  runAttentionMatch,
  type AttentionController,
  type AttentionMatch,
  type AttentionRuntimeContext
} from "./index.js";

const passCapacity = (match: AttentionMatch) => match.state.players.map((player) => ({
  kind: "pass-capacity" as const,
  playerId: player.playerId
}));

function context(): AttentionRuntimeContext {
  const base = AttentionModelDefinitionSchema.parse({
    ...defaultAttentionModel,
    rules: {
      ...defaultAttentionModel.rules,
      soundnessRate: 1,
      objectiveTarget: 999,
      driftLimit: 999
    }
  });
  return resolveAttentionV3Context(base);
}

function spatialContext(artillery = false): AttentionRuntimeContext {
  const base = AttentionModelDefinitionSchema.parse({
    ...defaultAttentionModel,
    rules: {
      ...defaultAttentionModel.rules,
      soundnessRate: 1,
      objectiveTarget: 999,
      driftLimit: 999
    }
  });
  return artillery ? resolveAttentionV3ArtilleryContext(base) : resolveAttentionV3SpatialContext(base);
}

function create(matchId = "attention-v3-test", seed = 51000): AttentionMatch {
  return createAttentionMatch({
    matchId,
    seed,
    context: context(),
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
}

function createSpatial(matchId = "attention-v3-spatial-test", seed = 51000, artillery = false): AttentionMatch {
  return createAttentionMatch({
    matchId,
    seed,
    context: spatialContext(artillery),
    players: [
      { playerId: "alpha", composition: attentionCompositions.balanced },
      { playerId: "bravo", composition: attentionCompositions.balanced }
    ]
  });
}

function finishRound(match: AttentionMatch): AttentionMatch {
  const capacity = resolveAttentionCapacity(match, passCapacity(match)).match;
  return resolveAttentionRound(capacity).match;
}

function edit(match: AttentionMatch, mutate: (state: AttentionMatchState) => void): AttentionMatch {
  const state = structuredClone(match.state);
  mutate(state);
  return { ...match, state };
}

function plan(
  playerId: string,
  unitId: string,
  actions: Extract<AttentionMovementIntent, { kind: "unit-actions" }>["actions"]
): Extract<AttentionMovementIntent, { kind: "unit-actions" }> {
  return { kind: "unit-actions", playerId, unitId, actions };
}

describe("duel-capacity-v3 Stage A UAP resolver", () => {
  it("versions UAP models and state without admitting UAP into legacy models", () => {
    expect(defaultAttentionV3Model.modelVersion).toBe(ATTENTION_V3_MODEL_VERSION);
    expect(defaultAttentionV3Model.uap).toEqual(defaultAttentionV3Uap);
    expect(AttentionModelDefinitionSchema.safeParse({
      ...defaultAttentionModel,
      modelVersion: ATTENTION_V3_MODEL_VERSION
    }).success).toBe(false);
    expect(AttentionModelDefinitionSchema.safeParse({
      ...defaultAttentionModel,
      uap: defaultAttentionV3Uap
    }).success).toBe(false);

    const match = create();
    expect(() => AttentionMatchStateSchema.parse(match.state)).not.toThrow();
    expect(match.state.units.map((unit) => unit.uap?.budget)).toEqual([3, 2, 1, 3, 2, 1]);
    expect(createAttentionMatch({ matchId: "legacy-no-uap", seed: 1 }).state.units.every((unit) => unit.uap === undefined)).toBe(true);
  });

  it("emits before actions and executes the exact Scout Active Recon sequence atomically", () => {
    const transition = resolveAttentionMovement(create("active-recon"), [
      plan("alpha", "alpha:scout", [
        { kind: "move", destination: { x: 0, y: 0 } },
        { kind: "turbo-charge" },
        { kind: "step-up" }
      ])
    ]);
    const scout = transition.match.state.units.find((unit) => unit.unitId === "alpha:scout")!;
    const artifacts = transition.match.state.artifacts.filter((artifact) => artifact.sourceUnitId === scout.unitId);
    expect(artifacts.every((artifact) => artifact.position.x === 1 && artifact.position.y === 1)).toBe(true);
    expect(scout.position).toEqual({ x: 0, y: 0 });
    expect(scout.uap).toMatchObject({ budget: 3, spent: 3, passiveSettleStreak: 0 });
    expect(scout.nextEmissionCalibration).toBe(0.85);
    expect(transition.events.map((item) => item.eventType)).toContain("attention.uap.turbo-charge.executed");
    expect(transition.events.map((item) => item.eventType)).toContain("attention.uap.step-up.executed");
    expect("spatial" in transition.events.find((item) => item.eventType === "attention.artifacts.emitted")!.data).toBe(false);

    const next = resolveAttentionMovement(finishRound(transition.match), []);
    expect(next.events.find((item) =>
      item.eventType === "attention.artifacts.emitted" && item.actorId === "alpha:scout"
    )?.data.calibration).toBe(0.85);
  });

  it("queues the Scout Passive Settle progression at 0.40, 0.65, and 0.85", () => {
    let match = create("passive-settle");
    const emittedCalibrations: number[] = [];
    const queuedCalibrations: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      const transition = resolveAttentionMovement(match, []);
      emittedCalibrations.push(Number(transition.events.find((item) =>
        item.eventType === "attention.artifacts.emitted" && item.actorId === "alpha:scout"
      )?.data.calibration));
      queuedCalibrations.push(transition.match.state.units.find((unit) => unit.unitId === "alpha:scout")!.nextEmissionCalibration!);
      match = finishRound(transition.match);
    }
    expect(emittedCalibrations).toEqual([0.2, 0.4, 0.65, 0.85]);
    expect(queuedCalibrations).toEqual([0.4, 0.65, 0.85, 0.85]);
  });

  it("rejects over-budget, malformed Scout, and legacy plans without partial benefits", () => {
    const overBudget = resolveAttentionMovement(create("over-budget"), [
      plan("alpha", "alpha:scout", [
        { kind: "move", destination: { x: 0, y: 0 } },
        { kind: "move", destination: { x: 0, y: 1 } },
        { kind: "move", destination: { x: 0, y: 2 } },
        { kind: "move", destination: { x: 0, y: 3 } }
      ])
    ]);
    const scout = overBudget.match.state.units.find((unit) => unit.unitId === "alpha:scout")!;
    expect(scout.position).toEqual({ x: 1, y: 1 });
    expect(scout.uap).toMatchObject({ spent: 0, passiveSettleStreak: 0 });
    expect(scout.nextEmissionCalibration).toBeNull();
    expect(overBudget.events.some((item) => item.eventType === "attention.uap.plan.rejected" && item.data.reason === "uap_budget")).toBe(true);

    const malformed = resolveAttentionMovement(create("malformed-scout"), [
      plan("alpha", "alpha:scout", [{ kind: "turbo-charge" }])
    ]);
    expect(malformed.events.some((item) => item.data.reason === "scout_sequence")).toBe(true);
    expect(malformed.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.nextEmissionCalibration).toBeNull();

    const legacy = resolveAttentionMovement(create("legacy-intent"), [
      { kind: "move", playerId: "alpha", unitId: "alpha:scout", destination: { x: 0, y: 0 } }
    ]);
    expect(legacy.events.some((item) => item.data.reason === "legacy_movement_intent")).toBe(true);
  });

  it("makes Line Step-Up and Siege Uplink explicit next-round choices", () => {
    const held = resolveAttentionMovement(create("siege-held"), []);
    expect(held.match.state.players[0].queuedUplinkBonus).toBe(0);
    expect(held.match.state.units.find((unit) => unit.unitId === "alpha:siege")?.nextEmissionCalibration).toBeNull();

    const configured = resolveAttentionMovement(create("configured"), [
      plan("alpha", "alpha:line", [{ kind: "step-up" }]),
      plan("alpha", "alpha:siege", [{ kind: "command-uplink" }])
    ]);
    const alpha = configured.match.state.players[0];
    expect(alpha.queuedUplinkBonus).toBe(1);
    expect(alpha.targetLocks).toBe(0);
    expect(configured.match.state.units.find((unit) => unit.unitId === "alpha:line")?.nextEmissionCalibration).toBe(0.85);
    expect(configured.match.state.units.find((unit) => unit.unitId === "alpha:siege")?.nextEmissionCalibration).toBe(0.2);
    expect(finishRound(configured.match).state.players[0].attention).toBe(4);
  });

  it("rejects every duplicate-destination contender and is invariant to input order", () => {
    const initial = edit(create("collision"), (state) => {
      state.units.find((unit) => unit.unitId === "alpha:scout")!.position = { x: 3, y: 3 };
      state.units.find((unit) => unit.unitId === "bravo:scout")!.position = { x: 5, y: 5 };
    });
    const alpha = plan("alpha", "alpha:scout", [{ kind: "move", destination: { x: 4, y: 4 } }]);
    const bravo = plan("bravo", "bravo:scout", [{ kind: "move", destination: { x: 4, y: 4 } }]);
    const forward = resolveAttentionMovement(initial, [alpha, bravo]);
    const reversed = resolveAttentionMovement(initial, [bravo, alpha]);
    expect(forward.match.state).toEqual(reversed.match.state);
    expect(forward.events).toEqual(reversed.events);
    expect(forward.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.position).toEqual({ x: 3, y: 3 });
    expect(forward.match.state.units.find((unit) => unit.unitId === "bravo:scout")?.position).toEqual({ x: 5, y: 5 });
    expect(forward.events.filter((item) => item.data.reason === "destination_conflict")).toHaveLength(2);
  });

  it("produces deterministic traces with explicit per-player UAP counters", () => {
    const controller = (playerId: string): AttentionController => ({
      movement: (projection: AttentionProjection) => projection.units
        .filter((unit) => unit.ownerPlayerId === playerId)
        .map((unit) => plan(playerId, unit.unitId,
          unit.chassis === "line" ? [{ kind: "step-up" }] :
            unit.chassis === "siege" ? [{ kind: "command-uplink" }] : []
        )),
      claim: () => ({ kind: "pass-capacity", playerId }),
      command: () => ({ kind: "end-command", playerId })
    });
    const run = () => runAttentionMatch(create("deterministic", 99), {
      alpha: controller("alpha"),
      bravo: controller("bravo")
    }, { traceMode: "full" });
    const first = run();
    const second = run();
    expect(first.traceHash).toBe(second.traceHash);
    expect(first.match.state).toEqual(second.match.state);
    expect(first.events).toEqual(second.events);
    expect(first.summary.uap?.alpha).toMatchObject({
      plansRejected: 0,
      turboCharges: 0
    });
    expect(first.summary.uap?.alpha.available).toBeGreaterThan(0);
    expect(first.summary.uap?.alpha.spent).toBeGreaterThan(0);
    expect(first.summary.uap?.alpha.stepUps).toBeGreaterThan(0);
    expect(first.summary.uap?.alpha.passiveSettles).toBeGreaterThan(0);
    expect(first.summary.uap?.alpha.uplinks).toBeGreaterThan(0);
  });
});

describe("duel-capacity-v3 Stage B spatial resolver", () => {
  it("uses an explicit public emission phase and keyed in-range artifact coordinates", () => {
    expect(defaultAttentionV3SpatialModel.spatial).toEqual(defaultAttentionV3Spatial);
    const initial = createSpatial("spatial-emission", 77);
    expect(initial.state.phase).toBe("emission");
    expect(initial.state.units.map((unit) => unit.spatial?.activeRange)).toEqual([2, 3, 4, 2, 3, 4]);

    const first = resolveAttentionEmission(initial);
    const second = resolveAttentionEmission(createSpatial("spatial-emission", 77));
    expect(first.match.state).toEqual(second.match.state);
    expect(first.events).toEqual(second.events);
    expect(first.match.state.phase).toBe("movement");
    expect(projectAttentionMatch(first.match, "alpha").artifacts).toHaveLength(first.match.state.artifacts.length);

    for (const artifact of first.match.state.artifacts) {
      const source = first.match.state.units.find((unit) => unit.unitId === artifact.sourceUnitId)!;
      const separation = Math.max(
        Math.abs(source.position.x - artifact.position.x),
        Math.abs(source.position.y - artifact.position.y)
      );
      expect(separation).toBeGreaterThanOrEqual(1);
      expect(separation).toBeLessThanOrEqual(source.spatial!.activeRange);
      expect(artifact.position.x).toBeGreaterThanOrEqual(0);
      expect(artifact.position.x).toBeLessThan(10);
      expect(artifact.position.y).toBeGreaterThanOrEqual(0);
      expect(artifact.position.y).toBeLessThan(10);
    }
    expect(first.events.filter((item) => item.eventType === "attention.artifacts.emitted")
      .every((item) => item.data.spatial === true)).toBe(true);
  });

  it("queues range shifts for the next emission and rejects an out-of-bounds shift atomically", () => {
    const emitted = resolveAttentionEmission(createSpatial("range-shift")).match;
    const shifted = resolveAttentionMovement(emitted, [
      plan("alpha", "alpha:scout", [{ kind: "range-shift", delta: 1 }])
    ]);
    const scout = shifted.match.state.units.find((unit) => unit.unitId === "alpha:scout")!;
    expect(scout.spatial).toEqual({ activeRange: 2, nextActiveRange: 3 });
    expect(scout.uap).toMatchObject({ spent: 1, passiveSettleStreak: 0 });
    const nextRound = finishRound(shifted.match);
    expect(nextRound.state.phase).toBe("emission");
    expect(nextRound.state.units.find((unit) => unit.unitId === "alpha:scout")?.spatial)
      .toEqual({ activeRange: 3, nextActiveRange: null });
    expect(resolveAttentionEmission(nextRound).events.find((item) =>
      item.eventType === "attention.artifacts.emitted" && item.actorId === "alpha:scout"
    )?.data.activeRange).toBe(3);

    const atLimit = edit(createSpatial("range-limit"), (state) => {
      state.units.find((unit) => unit.unitId === "alpha:scout")!.spatial!.activeRange = 5;
    });
    const rejected = resolveAttentionMovement(resolveAttentionEmission(atLimit).match, [
      plan("alpha", "alpha:scout", [{ kind: "range-shift", delta: 1 }])
    ]);
    expect(rejected.events.some((item) => item.data.reason === "range_limit")).toBe(true);
    expect(rejected.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.spatial)
      .toEqual({ activeRange: 5, nextActiveRange: null });
    expect(rejected.match.state.units.find((unit) => unit.unitId === "alpha:scout")?.uap?.spent).toBe(0);
  });

  it("requires local reach for verification while Line Support Scan creates an explicit bridge", () => {
    const prepare = (matchId: string, position: { x: number; y: number }) => {
      const emitted = resolveAttentionEmission(createSpatial(matchId)).match;
      const artifactId = emitted.state.artifacts.find((artifact) => artifact.ownerPlayerId === "alpha")!.artifactId;
      return {
        artifactId,
        match: edit(emitted, (state) => {
          state.artifacts.find((artifact) => artifact.artifactId === artifactId)!.position = position;
        })
      };
    };

    const distant = prepare("verify-distant", { x: 5, y: 5 });
    const distantMovement = resolveAttentionMovement(distant.match, []).match;
    const distantCommand = resolveAttentionCapacity(distantMovement, passCapacity(distantMovement)).match;
    const rejected = applyAttentionIntent(distantCommand, {
      kind: "verify",
      playerId: "alpha",
      artifactId: distant.artifactId
    });
    expect(rejected.events).toHaveLength(1);
    expect(rejected.events[0].data.reason).toBe("out_of_range");
    expect(rejected.match.state.players[0].attention).toBe(distantCommand.state.players[0].attention);

    const nearby = prepare("verify-nearby", { x: 2, y: 2 });
    const nearbyMovement = resolveAttentionMovement(nearby.match, []).match;
    const nearbyCommand = resolveAttentionCapacity(nearbyMovement, passCapacity(nearbyMovement)).match;
    const verifiedLocally = applyAttentionIntent(nearbyCommand, {
      kind: "verify",
      playerId: "alpha",
      artifactId: nearby.artifactId
    });
    expect(verifiedLocally.events[0].data).toMatchObject({
      verificationMode: "local",
      cost: 1
    });

    const supported = prepare("verify-supported", { x: 4, y: 2 });
    const supportedMovement = resolveAttentionMovement(supported.match, [
      plan("alpha", "alpha:line", [{ kind: "support-scan", artifactId: supported.artifactId }])
    ]);
    expect(supportedMovement.events.some((item) => item.eventType === "attention.support-scan.applied")).toBe(true);
    expect(supportedMovement.events.some((item) => item.eventType === "attention.target-lock.generated")).toBe(false);
    expect(supportedMovement.match.state.players[0].targetLocks).toBe(0);
    expect(supportedMovement.match.state.units.find((unit) => unit.unitId === "alpha:line")?.uap?.spent).toBe(1);
    const supportedCommand = resolveAttentionCapacity(supportedMovement.match, passCapacity(supportedMovement.match)).match;
    const verifiedByScan = applyAttentionIntent(supportedCommand, {
      kind: "verify",
      playerId: "alpha",
      artifactId: supported.artifactId
    });
    expect(verifiedByScan.events[0].data).toMatchObject({
      verificationMode: "support-scan",
      verifierUnitId: "alpha:line",
      cost: 1
    });
  });

  it("records spatial execution and unreachable auto-acceptance in deterministic run summaries", () => {
    let movementSawArtifacts = false;
    const controller = (playerId: string): AttentionController => ({
      movement: (projection) => {
        movementSawArtifacts ||= projection.artifacts.length > 0;
        const scout = projection.units.find((unit) => unit.ownerPlayerId === playerId && unit.chassis === "scout")!;
        return projection.round === 1
          ? [plan(playerId, scout.unitId, [{ kind: "range-shift", delta: 1 }])]
          : [];
      },
      claim: () => ({ kind: "pass-capacity", playerId }),
      command: () => ({ kind: "end-command", playerId })
    });
    const run = () => runAttentionMatch(createSpatial("spatial-summary", 88), {
      alpha: controller("alpha"),
      bravo: controller("bravo")
    }, { traceMode: "full" });
    const first = run();
    const second = run();
    expect(movementSawArtifacts).toBe(true);
    expect(first.traceHash).toBe(second.traceHash);
    expect(first.summary.spatial?.alpha.artifactsSpawned).toBeGreaterThan(0);
    expect(first.summary.spatial?.alpha.rangeShifts).toBe(1);
    expect(first.summary.spatial?.alpha.autoAcceptedBeyondReach).toBeGreaterThan(0);
  });
});

describe("duel-capacity-v3 Stage C Flare/Chaff artillery", () => {
  const shot = (
    playerId: string,
    shell: "flare" | "chaff",
    center: { x: number; y: number }
  ): AttentionArtilleryIntent => ({ kind: "fire-artillery", playerId, shell, center });

  it("uses a fixed public one-plus-one hand with no reload", () => {
    expect(defaultAttentionV3ArtilleryModel.artillery).toMatchObject({
      startingHand: { flare: 1, chaff: 1 },
      reload: false
    });
    const match = createSpatial("artillery-hand", 1, true);
    expect(match.state.players.map((player) => player.artillery?.hand)).toEqual([
      { flare: 1, chaff: 1 },
      { flare: 1, chaff: 1 }
    ]);
    expect(match.state.phase).toBe("emission");
    expect(resolveAttentionEmission(match).match.state.phase).toBe("artillery");
  });

  it("resolves same-phase Chaff first, blocks hostile Flare, and ignores declaration order", () => {
    const initial = resolveAttentionEmission(createSpatial("chaff-block", 5, true)).match;
    const flare = shot("alpha", "flare", { x: 8, y: 8 });
    const chaff = shot("bravo", "chaff", { x: 8, y: 8 });
    const forward = resolveAttentionArtillery(initial, [flare, chaff]);
    const reversed = resolveAttentionArtillery(initial, [chaff, flare]);
    expect(forward.match.state).toEqual(reversed.match.state);
    expect(forward.events).toEqual(reversed.events);
    expect(forward.match.state.flares).toHaveLength(0);
    expect(forward.match.state.chaffs).toHaveLength(1);
    expect(forward.match.state.chaffs?.[0].artilleryPhasesRemaining).toBe(1);
    expect(forward.match.state.players.find((player) => player.playerId === "alpha")?.artillery?.hand.flare).toBe(0);
    expect(forward.match.state.players.find((player) => player.playerId === "bravo")?.artillery?.hand.chaff).toBe(0);
    expect(forward.events.some((item) => item.eventType === "attention.artillery.shell.blocked")).toBe(true);
    expect(forward.match.state.phase).toBe("movement");
  });

  it("turns a stationary cluster into doubled next-emission load", () => {
    const emitted = resolveAttentionEmission(createSpatial("flare-pressure", 9, true)).match;
    const fired = resolveAttentionArtillery(emitted, [
      shot("alpha", "flare", { x: 8, y: 8 }),
      { kind: "pass-artillery", playerId: "bravo" }
    ]);
    expect(fired.match.state.flares).toHaveLength(1);
    const held = resolveAttentionMovement(fired.match, []).match;
    const nextRound = finishRound(held);
    const nextEmission = resolveAttentionEmission(nextRound);
    const bravoCount = nextEmission.events
      .filter((item) => item.eventType === "attention.artifacts.emitted" && item.data.playerId === "bravo")
      .reduce((sum, item) => sum + Number(item.data.count), 0);
    expect(bravoCount).toBe(12);
    expect(nextEmission.events.filter((item) =>
      item.eventType === "attention.artifacts.emitted" && item.data.playerId === "bravo"
    ).every((item) => item.data.flared === true)).toBe(true);
  });

  it("exposes causal Flare/Chaff counters in a complete deterministic run", () => {
    const controller = (playerId: "alpha" | "bravo"): AttentionController => ({
      artillery: (projection) => {
        const own = projection.players.find((player) => player.playerId === playerId)!;
        if (projection.round === 1 && playerId === "alpha" && own.artillery!.hand.flare > 0) {
          return shot(playerId, "flare", { x: 8, y: 8 });
        }
        if (projection.round === 1 && playerId === "bravo" && own.artillery!.hand.chaff > 0) {
          return shot(playerId, "chaff", { x: 8, y: 8 });
        }
        return { kind: "pass-artillery", playerId };
      },
      movement: () => [],
      claim: () => ({ kind: "pass-capacity", playerId }),
      command: () => ({ kind: "end-command", playerId })
    });
    const run = () => runAttentionMatch(createSpatial("artillery-summary", 101, true), {
      alpha: controller("alpha"),
      bravo: controller("bravo")
    }, { traceMode: "full" });
    const first = run();
    const second = run();
    expect(first.traceHash).toBe(second.traceHash);
    expect(first.summary.artillery?.alpha).toMatchObject({
      shellsFired: 1,
      flareShellsFired: 1,
      ownShellsBlocked: 1,
      flareShellsEstablished: 0
    });
    expect(first.summary.artillery?.bravo).toMatchObject({
      shellsFired: 1,
      chaffShellsFired: 1,
      hostileShellsBlocked: 1
    });
    expect(first.match.state.players.find((player) => player.playerId === "alpha")?.artillery?.hand.flare).toBe(0);
    expect(first.match.state.players.find((player) => player.playerId === "bravo")?.artillery?.hand.chaff).toBe(0);
  });
});
