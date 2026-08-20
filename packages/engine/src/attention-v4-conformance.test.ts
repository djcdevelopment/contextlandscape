import { describe, expect, it } from "vitest";
import { AttentionV4MatchStateSchema, type AttentionV4ArtifactState, type AttentionV4KineticPlan } from "@landscape/contracts";
import {
  applyAttentionV4Command,
  attentionV4StateHash,
  createAttentionV4Match,
  legalAttentionV4Actions,
  projectAttentionV4Hazards,
  resolveAttentionV4Artillery,
  resolveAttentionV4Capacity,
  resolveAttentionV4Kinetic,
  resolveAttentionV4Round,
  type AttentionV4Match
} from "./index.js";

function mutable(match: AttentionV4Match, change: (state: AttentionV4Match["state"]) => void): AttentionV4Match {
  const state = structuredClone(match.state);
  change(state);
  return { state: AttentionV4MatchStateSchema.parse(state), rules: match.rules };
}

function emptyPlans(match: AttentionV4Match): AttentionV4KineticPlan[] {
  return match.state.units.map((unit) => ({ playerId: unit.ownerPlayerId, unitId: unit.unitId, actions: [] }));
}

function artilleryReady(id: string, seed = 1): AttentionV4Match {
  return mutable(createAttentionV4Match({ matchId: id, seed }), (state) => {
    state.phase = "artillery";
    state.capacityTrack.artilleryUnlocked = true;
  });
}

function card(match: AttentionV4Match, playerId: string, shell: "flare" | "smoke" | "emp" | "he" | "chaff") {
  return match.state.players.find((player) => player.playerId === playerId)!.armory.cards.find((candidate) => candidate.shell === shell)!;
}

function artifact(match: AttentionV4Match, input: Partial<AttentionV4ArtifactState> & Pick<AttentionV4ArtifactState, "artifactId" | "ownerPlayerId" | "sourceUnitId" | "sourceChassis">): AttentionV4ArtifactState {
  return {
    artifactId: input.artifactId,
    ownerPlayerId: input.ownerPlayerId,
    sourceUnitId: input.sourceUnitId,
    sourceChassis: input.sourceChassis,
    position: input.position ?? { x: 4, y: 4 },
    volumeIndex: input.volumeIndex ?? 0,
    densityPct: input.densityPct ?? 80,
    sourceCalibration: input.sourceCalibration ?? 0.85,
    effectiveCalibration: input.effectiveCalibration ?? 0.68,
    sound: input.sound ?? true,
    reportedConfidence: input.reportedConfidence ?? 0.7,
    verified: input.verified ?? false,
    objectiveEligible: input.objectiveEligible ?? true,
    guarantee: input.guarantee ?? null,
    guaranteedById: input.guaranteedById ?? null,
    resolution: input.resolution ?? "pending",
    newbornRound: input.newbornRound ?? match.state.round,
    age: input.age ?? 0,
    contextLimit: input.contextLimit ?? (input.sourceChassis === "scout" ? 1 : input.sourceChassis === "line" ? 2 : 3),
    localTraffic: input.localTraffic ?? 0,
    overTaxReasons: input.overTaxReasons ?? [],
    supportScanUnitIds: input.supportScanUnitIds ?? [],
    battery: input.battery ?? { active: false, activatedRound: null, suppressed: false }
  };
}

function forceResolution(match: AttentionV4Match): AttentionV4Match {
  return mutable(match, (state) => {
    state.phase = "command";
    state.command.activePlayerId = state.players[0].playerId;
    for (const unit of state.units) unit.outputDecision = "held";
  });
}

describe("attention-v4 conformance edges", () => {
  it("records attributed RNG, UAP, armory, output, and EMP telemetry per round", () => {
    let match = createAttentionV4Match({ matchId: "v4-round-record", seed: 100 });
    const kinetic = emptyPlans(match);
    kinetic.find((plan) => plan.unitId === "alpha:line-1")!.actions = [{ kind: "step-up" }];
    match = resolveAttentionV4Kinetic(match, kinetic).match;
    match = mutable(match, (state) => { state.capacityTrack.artilleryUnlocked = true; });
    const emp = card(match, "alpha", "emp");
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: emp.cardId, center: { x: 8, y: 8 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    match = resolveAttentionV4Capacity(match, match.state.players.map((player) => ({ playerId: player.playerId, claim: false }))).match;
    match = applyAttentionV4Command(match, { kind: "emit", playerId: "alpha", unitId: "alpha:line-1", volume: 2, densityPct: 80 }).match;
    const record = match.state.roundRecords[0];
    expect(record.rootStream).toBe("attention-v4:100");
    expect(record.domainStreams).toMatchObject({ sound: expect.any(String), noise: expect.any(String), position: expect.any(String), armory: expect.any(String) });
    expect(record.uap).toHaveLength(match.state.units.length);
    expect(record.uap.find((item) => item.unitId === "alpha:line-1")).toMatchObject({ base: 2, batteryBonus: 0, effective: 2, spent: 1, actions: ["step-up"] });
    expect(record.armoryTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "register", playerId: "alpha", cooldownBefore: 0, cooldownAfter: 0 }),
      expect.objectContaining({ kind: "fire", playerId: "alpha", shell: "emp", cooldownAfter: 3 }),
      expect.objectContaining({ kind: "salvo-result", playerId: "alpha", blocked: false })
    ]));
    expect(record.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "output-decision", decision: "emit", densityPct: 80, sourceCalibration: 0.85, effectiveCalibration: 0.68 }),
      expect.objectContaining({ kind: "emitted", densityPct: 80, age: 0, localTraffic: 0 })
    ]));
    expect(record.empVictims).toEqual(expect.arrayContaining(["bravo:scout-1"]));
  });

  it("treats overlapping Flares as one ×2 output modifier", () => {
    let match = artilleryReady("v4-overlapping-flare", 101);
    const alpha = card(match, "alpha", "flare");
    const bravo = card(match, "bravo", "flare");
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: alpha.cardId, center: { x: 1, y: 1 } },
      { kind: "fire", playerId: "bravo", cardId: bravo.cardId, center: { x: 1, y: 1 } }
    ]).match;
    expect(match.state.zones.filter((zone) => zone.kind === "flare")).toHaveLength(2);
    match = resolveAttentionV4Capacity(match, match.state.players.map((player) => ({ playerId: player.playerId, claim: false }))).match;
    match = applyAttentionV4Command(match, { kind: "emit", playerId: "alpha", unitId: "alpha:scout-1", volume: 1, densityPct: 20 }).match;
    const emitted = match.state.artifacts.filter((item) => item.sourceUnitId === "alpha:scout-1");
    expect(emitted).toHaveLength(2);
  });

  it("applies Smoke to both fleets, cancels scans/uplinks, and suppresses Batteries for both output windows", () => {
    let match = artilleryReady("v4-smoke-spatial", 102);
    match = mutable(match, (state) => {
      const alphaLine = state.units.find((unit) => unit.unitId === "alpha:line-1")!;
      const alphaScout = state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
      const bravoHeavy = state.units.find((unit) => unit.unitId === "bravo:heavy-1")!;
      alphaLine.position = { x: 4, y: 4 };
      alphaScout.position = { x: 5, y: 4 };
      bravoHeavy.position = { x: 5, y: 5 };
      alphaLine.calibration = 0.85;
      alphaScout.calibration = 0.85;
      alphaScout.condenseSteps = 2;
      bravoHeavy.calibration = 0.9;
      bravoHeavy.uplinkQueued = true;
      state.players[1].queuedUplinkBonus = 1;
      state.artifacts.push(artifact(match, {
        artifactId: "smoke-battery",
        ownerPlayerId: "alpha",
        sourceUnitId: alphaLine.unitId,
        sourceChassis: "line",
        verified: true,
        position: { x: 4, y: 4 },
        battery: { active: true, activatedRound: 1, suppressed: false }
      }));
      state.supportReservations.push({
        reservationId: "scan-smoke",
        ownerPlayerId: "alpha",
        lineUnitId: alphaLine.unitId,
        scoutUnitId: alphaScout.unitId,
        createdRound: state.round,
        attachedArtifactId: null,
        cancelled: false
      });
    });
    const smoke = card(match, "alpha", "smoke");
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: smoke.cardId, center: { x: 4, y: 4 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    expect(match.state.units.filter((unit) => ["alpha:line-1", "alpha:scout-1", "bravo:heavy-1"].includes(unit.unitId)).every((unit) => unit.calibration === 0.2)).toBe(true);
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.condenseSteps).toBe(0);
    expect(match.state.units.find((unit) => unit.unitId === "bravo:heavy-1")?.uplinkQueued).toBe(false);
    expect(match.state.players[1].queuedUplinkBonus).toBe(0);
    expect(match.state.supportReservations[0].cancelled).toBe(true);
    expect(match.state.artifacts[0].battery.suppressed).toBe(true);
    expect(match.state.zones.find((zone) => zone.kind === "smoke")).toMatchObject({ activeThroughCommandRound: 2 });
  });

  it("EMP catches friendly and hostile units, forces zero next-Kinetic UAP, but does not stop generation", () => {
    let match = artilleryReady("v4-emp-friendly-fire", 103);
    match = mutable(match, (state) => {
      state.units.find((unit) => unit.unitId === "alpha:scout-1")!.position = { x: 4, y: 4 };
      state.units.find((unit) => unit.unitId === "bravo:scout-1")!.position = { x: 5, y: 5 };
    });
    const emp = card(match, "alpha", "emp");
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: emp.cardId, center: { x: 4, y: 4 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.uap.nextFreezeSources).toContain("emp");
    expect(match.state.units.find((unit) => unit.unitId === "bravo:scout-1")?.uap.nextFreezeSources).toContain("emp");
    match = resolveAttentionV4Round(forceResolution(match)).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.uap).toMatchObject({ base: 3, effective: 0, frozen: true });
    match = resolveAttentionV4Kinetic(match, emptyPlans(match)).match;
    match = resolveAttentionV4Artillery(match, match.state.players.map((player) => ({ kind: "pass", playerId: player.playerId }))).match;
    match = resolveAttentionV4Capacity(match, match.state.players.map((player) => ({ playerId: player.playerId, claim: false }))).match;
    match = applyAttentionV4Command(match, { kind: "emit", playerId: "bravo", unitId: "bravo:scout-1", volume: 1, densityPct: 20 }).match;
    match = applyAttentionV4Command(match, { kind: "emit", playerId: "alpha", unitId: "alpha:scout-1", volume: 1, densityPct: 20 }).match;
    expect(match.state.artifacts.some((item) => item.sourceUnitId === "alpha:scout-1")).toBe(true);
  });

  it("HE resolves unverified artifacts from both factions immediately without detonation paralysis", () => {
    let match = artilleryReady("v4-he-friendly-fire", 104);
    match = mutable(match, (state) => {
      state.artifacts.push(
        artifact(match, { artifactId: "he-alpha-sound", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", sound: true, position: { x: 4, y: 4 } }),
        artifact(match, { artifactId: "he-bravo-unsound", ownerPlayerId: "bravo", sourceUnitId: "bravo:line-1", sourceChassis: "line", sound: false, position: { x: 5, y: 4 } }),
        artifact(match, { artifactId: "he-verified-safe", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", sound: false, verified: true, position: { x: 4, y: 5 } })
      );
    });
    const he = card(match, "alpha", "he");
    const transition = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: he.cardId, center: { x: 4, y: 4 } },
      { kind: "pass", playerId: "bravo" }
    ]);
    match = transition.match;
    expect(match.state.players.find((player) => player.playerId === "alpha")?.progress).toBe(1);
    expect(match.state.players.find((player) => player.playerId === "bravo")?.drift).toBe(1);
    expect(match.state.artifacts.map((item) => item.artifactId)).toEqual(["he-verified-safe"]);
    expect(match.state.units.every((unit) => unit.uap.nextFreezeSources.length === 0)).toBe(true);
    expect(transition.events.filter((item) => item.eventType === "attention.v4.artillery.he.resolved")).toHaveLength(2);
  });

  it("makes ordinary fire legal exactly in R+3 and deterministically reloads below three to five", () => {
    let match = artilleryReady("v4-cooldown-reload", 105);
    const flare = card(match, "alpha", "flare");
    match = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: flare.cardId, center: { x: 1, y: 1 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    expect(match.state.players[0].armory.cooldown).toBe(3);
    for (const expected of [2, 1, 0]) {
      match = resolveAttentionV4Round(forceResolution(match)).match;
      expect(match.state.players[0].armory.cooldown).toBe(expected);
    }
    match = mutable(match, (state) => { state.phase = "artillery"; });
    expect(legalAttentionV4Actions(match, "alpha").shellCards.some((item) => item.legal && !item.usesRetaliation)).toBe(true);

    const depleted = mutable(forceResolution(match), (state) => {
      state.players[0].armory.cards = state.players[0].armory.cards.slice(0, 2);
    });
    const left = resolveAttentionV4Round(depleted).match;
    const right = resolveAttentionV4Round(structuredClone(depleted)).match;
    expect(left.state.players[0].armory.cards).toHaveLength(5);
    expect(left.state.lastRegisterRecap.reloads[0].cardIds).toHaveLength(3);
    expect(attentionV4StateHash(left.state)).toBe(attentionV4StateHash(right.state));
    expect(left.state.roundRecords.find((record) => record.round === left.state.round)?.armoryTransitions.some((item) => item.kind === "register" && Array.isArray(item.reloadCardIds) && item.reloadCardIds.length === 3)).toBe(true);
  });

  it("uses one overlapping Battery discount, stacks Overclock, and excludes the target Battery itself", () => {
    let match = createAttentionV4Match({ matchId: "v4-battery-costs", seed: 106 });
    match = mutable(match, (state) => {
      state.phase = "command";
      state.command.activePlayerId = "alpha";
      state.capacityTrack.nextRank = 3;
      state.units.find((unit) => unit.unitId === "alpha:line-1")!.position = { x: 3, y: 3 };
      state.artifacts.push(
        artifact(match, { artifactId: "battery-a", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", verified: true, position: { x: 2, y: 2 }, battery: { active: true, activatedRound: 1, suppressed: false } }),
        artifact(match, { artifactId: "battery-b", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", verified: true, position: { x: 2, y: 3 }, battery: { active: true, activatedRound: 1, suppressed: false } }),
        artifact(match, { artifactId: "target", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", position: { x: 3, y: 3 } })
      );
    });
    const before = legalAttentionV4Actions(match, "alpha");
    expect(before.artifacts.find((item) => item.artifactId === "target")?.verify.cost).toMatchObject({ batteryDiscount: 1, total: 0, batteryArtifactId: "battery-a" });
    expect(before.artifacts.find((item) => item.artifactId === "battery-a")?.verify.cost.batteryArtifactId).toBe("battery-b");
    match = applyAttentionV4Command(match, { kind: "overclock", playerId: "alpha" }).match;
    match = mutable(match, (state) => { state.command.activePlayerId = "alpha"; });
    expect(legalAttentionV4Actions(match, "alpha").artifacts.find((item) => item.artifactId === "target")?.seize.cost).toMatchObject({ base: 2, batteryDiscount: 1, overclockDiscount: 1, total: 0 });
  });

  it("honors the strict age > Context Limit boundary and excludes newborn hazards", () => {
    let match = createAttentionV4Match({ matchId: "v4-context-boundary", seed: 107 });
    match = mutable(match, (state) => {
      state.phase = "command";
      state.command.activePlayerId = "alpha";
      for (const unit of state.units) unit.outputDecision = "held";
      state.artifacts.push(artifact(match, {
        artifactId: "scout-context",
        ownerPlayerId: "alpha",
        sourceUnitId: "alpha:scout-1",
        sourceChassis: "scout",
        newbornRound: 1,
        age: 0,
        overTaxReasons: ["local-traffic"]
      }));
    });
    expect(projectAttentionV4Hazards(match.state)).toHaveLength(0);
    match = resolveAttentionV4Round(match).match;
    expect(match.state.artifacts[0]).toMatchObject({ age: 1, contextLimit: 1, overTaxReasons: [] });
    expect(projectAttentionV4Hazards(match.state)).toHaveLength(0);
    match = resolveAttentionV4Round(forceResolution(match)).match;
    expect(match.state.artifacts[0]).toMatchObject({ age: 2, overTaxReasons: ["context-limit"] });
    expect(projectAttentionV4Hazards(match.state)).toHaveLength(1);
  });

  it("applies the legal single Heavy Uplink and bilateral terminal effects atomically", () => {
    let uplink = createAttentionV4Match({
      matchId: "v4-uplink-cap",
      seed: 108,
      players: [
        { playerId: "alpha", composition: ["scout", "scout", "scout", "heavy"] },
        { playerId: "bravo", composition: ["scout", "line", "heavy"] }
      ]
    });
    uplink = resolveAttentionV4Kinetic(uplink, uplink.state.units.map((unit) => ({ playerId: unit.ownerPlayerId, unitId: unit.unitId, actions: unit.unitId === "alpha:heavy-1" ? [{ kind: "command-uplink" as const }] : [] }))).match;
    expect(uplink.state.players[0].queuedUplinkBonus).toBe(1);
    expect(uplink.state.units.find((unit) => unit.unitId === "alpha:heavy-1")?.calibration).toBe(0.2);
    uplink = resolveAttentionV4Round(forceResolution(uplink)).match;
    expect(uplink.state.players[0].attention).toBe(4);

    let atomic = createAttentionV4Match({ matchId: "v4-atomic-terminal", seed: 109 });
    atomic = mutable(atomic, (state) => {
      state.round = 3;
      state.phase = "command";
      state.command.activePlayerId = "alpha";
      for (const unit of state.units) unit.outputDecision = "held";
      state.players[0].progress = 11;
      state.players[0].drift = 3;
      state.players[1].progress = 10;
      state.players[1].drift = 3;
      state.artifacts.push(
        artifact(atomic, { artifactId: "alpha-commit", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line", resolution: "accepted", sound: true, newbornRound: 2 }),
        artifact(atomic, { artifactId: "bravo-commit", ownerPlayerId: "bravo", sourceUnitId: "bravo:line-1", sourceChassis: "line", resolution: "accepted", sound: true, newbornRound: 2 }),
        artifact(atomic, { artifactId: "alpha-hazard", ownerPlayerId: "alpha", sourceUnitId: "alpha:scout-1", sourceChassis: "scout", newbornRound: 1, age: 2, overTaxReasons: ["context-limit"] }),
        artifact(atomic, { artifactId: "bravo-hazard", ownerPlayerId: "bravo", sourceUnitId: "bravo:scout-1", sourceChassis: "scout", newbornRound: 1, age: 2, overTaxReasons: ["context-limit"] })
      );
    });
    const resolved = resolveAttentionV4Round(atomic).match;
    expect(resolved.state).toMatchObject({ status: "complete", terminalReason: "simultaneous", winnerPlayerId: "alpha" });
    expect(resolved.state.players.map((player) => ({ id: player.playerId, progress: player.progress, drift: player.drift }))).toEqual([
      { id: "alpha", progress: 12, drift: 5 },
      { id: "bravo", progress: 11, drift: 5 }
    ]);
    expect(resolved.state.lastResolutionRecap?.detonations).toHaveLength(2);
    expect(resolved.state.lastResolutionRecap?.resolutions).toHaveLength(2);
  });
});
