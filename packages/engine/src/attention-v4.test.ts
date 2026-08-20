import { describe, expect, it } from "vitest";
import {
  ATTENTION_V4_COMPOSITION_MODULES,
  AttentionV4MatchStateSchema,
  AttentionV4ProjectionSchema,
  attentionV4FleetWeight
} from "@landscape/contracts";
import {
  ATTENTION_V4_RULESET_HASH,
  applyAttentionV4Command,
  attentionV4StateHash,
  compileAttentionV4Commander,
  createAttentionV4CommanderCatalog,
  createAttentionV4CommanderProfile,
  createAttentionV4Match,
  defaultAttentionV4Rules,
  forceDisplaceAttentionV4Unit,
  legalAttentionV4Actions,
  projectAttentionV4Hazards,
  projectAttentionV4Match,
  resolveAttentionV4Artillery,
  resolveAttentionV4Capacity,
  resolveAttentionV4Kinetic,
  resolveAttentionV4Round,
  startAttentionV4Match,
  type AttentionV4Match
} from "./index.js";

function plans(match: AttentionV4Match, overrides: Record<string, Parameters<typeof resolveAttentionV4Kinetic>[1][number]["actions"]> = {}) {
  return match.state.units.map((unit) => ({
    playerId: unit.ownerPlayerId,
    unitId: unit.unitId,
    actions: overrides[unit.unitId] ?? []
  }));
}

function toCommand(seed = 1, claims: [boolean, boolean] = [false, false], overrides: Parameters<typeof plans>[1] = {}) {
  let match = createAttentionV4Match({ matchId: `v4-command-${seed}`, seed });
  match = resolveAttentionV4Kinetic(match, plans(match, overrides)).match;
  match = resolveAttentionV4Artillery(match, match.state.players.map((player) => ({ kind: "pass", playerId: player.playerId }))).match;
  match = resolveAttentionV4Capacity(match, match.state.players.map((player, index) => ({ playerId: player.playerId, claim: claims[index] }))).match;
  return match;
}

function mutable(match: AttentionV4Match, change: (state: AttentionV4Match["state"]) => void): AttentionV4Match {
  const state = structuredClone(match.state);
  change(state);
  return { state: AttentionV4MatchStateSchema.parse(state), rules: match.rules };
}

describe("attention-economy-v4 standalone reducer", () => {
  it("identifies the schema-v3 v4.2 ruleset without changing the external model id", () => {
    const started = startAttentionV4Match({ matchId: "v4-identity", seed: 7 });
    expect(started.match.state).toMatchObject({
      schemaVersion: 3,
      modelVersion: "duel-capacity-v3-experimental",
      rulesetVersion: "attention-economy-v4.2",
      resolverVersion: "attention-v4.2-resolver-1",
      rulesetHash: ATTENTION_V4_RULESET_HASH,
      phase: "kinetic"
    });
    expect(started.match.state.lastRegisterRecap.uap.map((item) => item.effective)).toEqual([3, 2, 1, 3, 2, 1]);
    expect(() => AttentionV4ProjectionSchema.parse(projectAttentionV4Match(started.match, "alpha"))).not.toThrow();
    expect(attentionV4StateHash(started.match.state)).toBe(attentionV4StateHash(createAttentionV4Match({ matchId: "v4-identity", seed: 7 }).state));
  });

  it("spawns every compiled capped weight-six fleet without overlapping its three-to-five units", () => {
    const sizes = [5, 4, 3, 4, 3];
    ATTENTION_V4_COMPOSITION_MODULES.forEach((compositionModule, index) => {
      const program = compileAttentionV4Commander(createAttentionV4CommanderProfile({
        compositionModule,
        triageModule: "risk-adaptive",
        movementModule: "chassis-native",
        capacityModule: "adaptive"
      }));
      const match = createAttentionV4Match({
        matchId: `v4-fleet-${compositionModule}`,
        seed: 70 + index,
        players: [
          { playerId: "alpha", composition: program.composition, commanderHash: program.programHash },
          { playerId: "bravo", composition: program.composition, commanderHash: program.programHash }
        ]
      });
      expect(program.composition).toHaveLength(sizes[index]);
      expect(attentionV4FleetWeight(program.composition)).toBe(6);
      for (const playerId of ["alpha", "bravo"]) {
        const units = match.state.units.filter((unit) => unit.ownerPlayerId === playerId);
        expect(units).toHaveLength(sizes[index]);
        expect(new Set(units.map((unit) => `${unit.position.x},${unit.position.y}`)).size).toBe(units.length);
      }
    });
    expect(() => createAttentionV4Match({
      matchId: "v4-invalid-overweight",
      seed: 91,
      players: [
        { playerId: "alpha", composition: ["heavy", "heavy", "heavy"] as never },
        { playerId: "bravo", composition: ["heavy", "heavy"] }
      ]
    })).toThrow(/fleet weight/);
    expect(() => createAttentionV4Match({
      matchId: "v4-invalid-two-heavy",
      seed: 92,
      players: [
        { playerId: "alpha", composition: ["heavy", "heavy"] as never },
        { playerId: "bravo", composition: ["scout", "line", "heavy"] }
      ]
    })).toThrow();
    expect(() => createAttentionV4Match({
      matchId: "v4-invalid-six-scout",
      seed: 93,
      players: [
        { playerId: "alpha", composition: ["scout", "scout", "scout", "scout", "scout", "scout"] as never },
        { playerId: "bravo", composition: ["scout", "line", "heavy"] }
      ]
    })).toThrow();
  });

  it("uses D×C for confidence and emits immediately after reactor validation", () => {
    let match = toCommand(11);
    const scout = match.state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
    expect(scout.calibration).toBe(0.2);
    match = applyAttentionV4Command(match, {
      kind: "emit", playerId: "alpha", unitId: scout.unitId, volume: 3, densityPct: 20
    }).match;
    const newborns = match.state.artifacts.filter((artifact) => artifact.sourceUnitId === scout.unitId);
    expect(newborns).toHaveLength(3);
    expect(newborns.every((artifact) => artifact.effectiveCalibration === 0.04 && artifact.age === 0 && artifact.localTraffic === 0)).toBe(true);
    expect(() => applyAttentionV4Command(mutable(match, (state) => { state.command.activePlayerId = "alpha"; }), {
      kind: "emit", playerId: "alpha", unitId: scout.unitId, volume: 4, densityPct: 100
    })).not.toThrow();
    const rejected = applyAttentionV4Command(mutable(toCommand(12), (state) => { state.command.activePlayerId = "alpha"; }), {
      kind: "emit", playerId: "alpha", unitId: "alpha:scout-1", volume: 4, densityPct: 100
    });
    expect(rejected.events[0]).toMatchObject({ eventType: "attention.v4.command.rejected", data: { reason: "condense-volume-cap" } });
  });

  it("trades ordered Scout actions for authoritative output condensation", () => {
    let match = createAttentionV4Match({ matchId: "v4-scout-calibration", seed: 3 });
    match = resolveAttentionV4Kinetic(match, plans(match)).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.calibration).toBe(0.2);
    match = mutable(match, (state) => {
      state.phase = "kinetic";
      const scout = state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
      scout.uap.batteryBonus = 1;
      scout.uap.effective = 4;
      scout.position = { x: 3, y: 3 };
      state.units.find((unit) => unit.unitId === "alpha:line-1")!.position = { x: 1, y: 2 };
    });
    const condensed = {
      "alpha:scout-1": [
        { kind: "move" as const, destination: { x: 4, y: 3 } },
        { kind: "move" as const, destination: { x: 5, y: 3 } },
        { kind: "condense-output" as const },
        { kind: "condense-output" as const }
      ]
    };
    match = resolveAttentionV4Kinetic(match, plans(match, condensed)).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")).toMatchObject({ calibration: 0.85, condenseSteps: 2 });
    const legal = legalAttentionV4Actions(match, "alpha").allocations.find((item) => item.unitId === "alpha:scout-1")!;
    expect(legal).toMatchObject({ prefillVolume: 1, prefillDensityPct: 90, maximumVolume: 1, maximumDensityPct: 90 });

    match = mutable(match, (state) => {
      state.phase = "kinetic";
      const scout = state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
      scout.uap.effective = 3;
      scout.uap.batteryBonus = 0;
      scout.uap.spent = 0;
    });
    const interrupted = resolveAttentionV4Kinetic(match, plans(match, {
      "alpha:scout-1": [{ kind: "condense-output" }, { kind: "move", destination: { x: 6, y: 3 } }]
    }));
    expect(interrupted.events.find((item) => item.actorId === "alpha:scout-1")).toMatchObject({ data: { reason: "condense-order" } });
    expect(interrupted.match.state.units.find((unit) => unit.unitId === "alpha:scout-1")?.calibration).toBe(0.2);
  });

  it("applies the full Scout Condense volume, density, and D×C table", () => {
    const modes = [
      { steps: 0, volume: 3, densityPct: 20, calibration: 0.2, effective: 0.04 },
      { steps: 1, volume: 2, densityPct: 60, calibration: 0.65, effective: 0.39 },
      { steps: 2, volume: 1, densityPct: 90, calibration: 0.85, effective: 0.765 }
    ] as const;
    for (const mode of modes) {
      let match = toCommand(120 + mode.steps, [false, false], {
        "alpha:scout-1": Array.from({ length: mode.steps }, () => ({ kind: "condense-output" as const }))
      });
      const legal = legalAttentionV4Actions(match, "alpha").allocations.find((item) => item.unitId === "alpha:scout-1")!;
      expect(legal).toMatchObject({
        condenseSteps: mode.steps,
        prefillVolume: mode.volume,
        prefillDensityPct: mode.densityPct,
        maximumVolume: mode.volume,
        maximumDensityPct: mode.densityPct
      });
      match = applyAttentionV4Command(match, {
        kind: "emit",
        playerId: "alpha",
        unitId: "alpha:scout-1",
        volume: mode.volume,
        densityPct: mode.densityPct
      }).match;
      const newborns = match.state.artifacts.filter((artifact) => artifact.sourceUnitId === "alpha:scout-1");
      expect(newborns).toHaveLength(mode.volume);
      expect(newborns.every((artifact) => artifact.sourceCalibration === mode.calibration && artifact.effectiveCalibration === mode.effective)).toBe(true);
    }
  });

  it("resets condensed Scout quality on forced displacement", () => {
    let match = createAttentionV4Match({ matchId: "v4-condense-displaced", seed: 124 });
    match = mutable(match, (state) => {
      const scout = state.units.find((unit) => unit.unitId === "alpha:scout-1")!;
      scout.condenseSteps = 2;
      scout.calibration = 0.85;
    });
    match = forceDisplaceAttentionV4Unit(match, "alpha:scout-1", { x: 4, y: 4 }).match;
    expect(match.state.units.find((unit) => unit.unitId === "alpha:scout-1")).toMatchObject({ condenseSteps: 0, calibration: 0.2, forcedDisplaced: true });
  });

  it("reserves Support Scans and attaches them to farthest eligible newborns by artifact id", () => {
    let match = createAttentionV4Match({ matchId: "v4-support", seed: 22 });
    match = resolveAttentionV4Kinetic(match, plans(match, {
      "alpha:line-1": [{ kind: "support-scan", scoutUnitId: "alpha:scout-1" }, { kind: "step-up" }]
    })).match;
    match = resolveAttentionV4Artillery(match, match.state.players.map((player) => ({ kind: "pass", playerId: player.playerId }))).match;
    match = resolveAttentionV4Capacity(match, match.state.players.map((player) => ({ playerId: player.playerId, claim: false }))).match;
    match = applyAttentionV4Command(match, {
      kind: "emit", playerId: "alpha", unitId: "alpha:scout-1", volume: 3, densityPct: 20
    }).match;
    const reservation = match.state.supportReservations.find((item) => item.lineUnitId === "alpha:line-1")!;
    expect(reservation.attachedArtifactId).not.toBeNull();
    expect(match.state.artifacts.find((artifact) => artifact.artifactId === reservation.attachedArtifactId)?.supportScanUnitIds).toContain("alpha:line-1");
    const eligible = match.state.artifacts.filter((artifact) => artifact.sourceUnitId === "alpha:scout-1" &&
      Math.max(Math.abs(artifact.position.x - 1), Math.abs(artifact.position.y - 2)) <= 3);
    const expected = eligible.sort((left, right) =>
      Math.max(Math.abs(right.position.x - 1), Math.abs(right.position.y - 2)) - Math.max(Math.abs(left.position.x - 1), Math.abs(left.position.y - 2)) ||
      left.artifactId.localeCompare(right.artifactId)
    )[0];
    expect(reservation.attachedArtifactId).toBe(expected.artifactId);
  });

  it("creates an immediate Battery, floors overlapping field plus Overclock discounts, and snapshots non-stacking UAP", () => {
    let match = toCommand(31, [true, false], {
      "alpha:line-1": [{ kind: "step-up" }]
    });
    match = applyAttentionV4Command(match, {
      kind: "emit", playerId: "alpha", unitId: "alpha:line-1", volume: 2, densityPct: 80
    }).match;
    match = mutable(match, (state) => {
      state.command.activePlayerId = "alpha";
      const [battery, target] = state.artifacts.filter((artifact) => artifact.ownerPlayerId === "alpha");
      battery.sound = true;
      battery.position = { x: 2, y: 2 };
      target.position = { x: 2, y: 3 };
      state.units.find((unit) => unit.unitId === "alpha:line-1")!.position = { x: 2, y: 2 };
    });
    const [batteryId, targetId] = match.state.artifacts.filter((artifact) => artifact.ownerPlayerId === "alpha").map((artifact) => artifact.artifactId);
    match = applyAttentionV4Command(match, { kind: "verify", playerId: "alpha", artifactId: batteryId }).match;
    expect(match.state.artifacts.find((artifact) => artifact.artifactId === batteryId)?.battery.active).toBe(true);
    match = mutable(match, (state) => { state.command.activePlayerId = "alpha"; });
    const cost = legalAttentionV4Actions(match, "alpha").artifacts.find((artifact) => artifact.artifactId === targetId)!.verify.cost;
    expect(cost).toMatchObject({ base: 1, batteryDiscount: 1, total: 0, batteryArtifactId: batteryId });
    match = mutable(match, (state) => { state.command.activePlayerId = "alpha"; state.capacityTrack.nextRank = 3; });
    match = applyAttentionV4Command(match, { kind: "overclock", playerId: "alpha" }).match;
    match = mutable(match, (state) => { state.command.activePlayerId = "alpha"; });
    expect(legalAttentionV4Actions(match, "alpha").artifacts.find((artifact) => artifact.artifactId === targetId)!.seize.cost.total).toBe(0);

    match = mutable(match, (state) => {
      state.phase = "command";
      for (const unit of state.units) unit.outputDecision = "held";
      state.command.activePlayerId = "alpha";
    });
    match = resolveAttentionV4Round(match).match;
    const assisted = match.state.units.filter((unit) => unit.ownerPlayerId === "alpha" && Math.max(Math.abs(unit.position.x - 2), Math.abs(unit.position.y - 2)) <= 1);
    expect(assisted.every((unit) => unit.uap.batteryBonus === 1 && unit.uap.effective === unit.uap.base + 1)).toBe(true);
  });

  it("counts bilateral action traffic, projects hazards, allows Verify rescue, then detonates atomically when unrescued", () => {
    let match = createAttentionV4Match({ matchId: "v4-detonation", seed: 44 });
    match = mutable(match, (state) => {
      state.round = 2;
      state.phase = "kinetic";
      const positions = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 3, y: 4 }, { x: 3, y: 5 }];
      state.units.forEach((unit, index) => { unit.position = positions[index]; });
      state.artifacts.push({
        artifactId: "hazard-a", ownerPlayerId: "alpha", sourceUnitId: "alpha:scout-1", sourceChassis: "scout",
        position: { x: 4, y: 4 }, volumeIndex: 0, densityPct: 20, sourceCalibration: 0.2, effectiveCalibration: 0.04,
        sound: true, reportedConfidence: 0.5, verified: false, objectiveEligible: true, guarantee: null, guaranteedById: null,
        resolution: "pending", newbornRound: 1, age: 1, contextLimit: 1, localTraffic: 0, overTaxReasons: [],
        supportScanUnitIds: [], battery: { active: false, activatedRound: null, suppressed: false }
      });
    });
    match = resolveAttentionV4Kinetic(match, plans(match, {
      "alpha:line-1": [{ kind: "step-up" }],
      "alpha:heavy-1": [{ kind: "command-uplink" }],
      "bravo:line-1": [{ kind: "step-up" }],
      "bravo:heavy-1": [{ kind: "command-uplink" }]
    })).match;
    expect(match.state.artifacts[0].localTraffic).toBe(4);
    expect(match.state.artifacts[0].overTaxReasons).toContain("local-traffic");
    match = resolveAttentionV4Artillery(match, match.state.players.map((player) => ({ kind: "pass", playerId: player.playerId }))).match;
    match = resolveAttentionV4Capacity(match, match.state.players.map((player) => ({ playerId: player.playerId, claim: false }))).match;
    expect(projectAttentionV4Hazards(match.state)[0]).toMatchObject({ artifactId: "hazard-a", drift: 2 });
    match = mutable(match, (state) => { state.command.activePlayerId = "alpha"; });
    const rescued = applyAttentionV4Command(match, { kind: "verify", playerId: "alpha", artifactId: "hazard-a" }).match;
    expect(projectAttentionV4Hazards(rescued.state)).toHaveLength(0);

    match = mutable(match, (state) => {
      state.phase = "command";
      state.command.activePlayerId = "alpha";
      for (const unit of state.units) unit.outputDecision = "held";
    });
    const resolved = resolveAttentionV4Round(match);
    expect(resolved.match.state.players.find((player) => player.playerId === "alpha")?.drift).toBe(2);
    expect(resolved.match.state.artifacts).toHaveLength(0);
    expect(resolved.match.state.units.filter((unit) => unit.ownerPlayerId === "alpha" && unit.uap.frozen).length).toBeGreaterThan(0);
  });

  it("resolves same-salvo Chaff first, consumes blocked cards, and grants a one-salvo cooldown bypass", () => {
    let match = createAttentionV4Match({ matchId: "v4-counter-battery", seed: 51 });
    match = mutable(match, (state) => {
      state.phase = "artillery";
      state.capacityTrack.artilleryUnlocked = true;
    });
    const alphaFlare = match.state.players[0].armory.cards.find((card) => card.shell === "flare")!;
    const bravoChaff = match.state.players[1].armory.cards.find((card) => card.shell === "chaff")!;
    const fired = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: alphaFlare.cardId, center: { x: 7, y: 7 } },
      { kind: "fire", playerId: "bravo", cardId: bravoChaff.cardId, center: { x: 7, y: 7 } }
    ]);
    expect(fired.events.find((item) => item.eventType === "attention.v4.artillery.shell.blocked")).toMatchObject({ actorId: "alpha" });
    expect(fired.match.state.players[0]).toMatchObject({ armory: { cooldown: 3, retaliationAvailable: true } });
    expect(fired.match.state.players[0].armory.cards.some((card) => card.cardId === alphaFlare.cardId)).toBe(false);

    match = mutable(fired.match, (state) => { state.phase = "artillery"; state.round = 2; });
    const alphaSmoke = match.state.players[0].armory.cards.find((card) => card.shell === "smoke")!;
    const bypass = legalAttentionV4Actions(match, "alpha").shellCards.find((card) => card.cardId === alphaSmoke.cardId)!;
    expect(bypass).toMatchObject({ legal: true, usesRetaliation: true });
    const counter = resolveAttentionV4Artillery(match, [
      { kind: "fire", playerId: "alpha", cardId: alphaSmoke.cardId, center: { x: 7, y: 7 } },
      { kind: "pass", playerId: "bravo" }
    ]).match;
    expect(counter.state.players[1].armory.retaliationAvailable).toBe(false);
  });

  it("compiles all 3,200 profiles through content-addressed non-inert module switches", () => {
    const catalog = createAttentionV4CommanderCatalog();
    expect(catalog.profiles).toHaveLength(3_200);
    expect(new Set(catalog.compiledHashes).size).toBe(3_200);
    expect(catalog.catalogHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(defaultAttentionV4Rules.rulesetHash).toBe(ATTENTION_V4_RULESET_HASH);
  });
});
