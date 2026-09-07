import { describe, expect, it } from "vitest";
import { BattleCommandV3ViewSchema, type AttentionV4KineticAction } from "@landscape/contracts";
import {
  createBattleCommandMatch,
  isRetiredBattleCommandMatch,
  submitBattleCommand,
  type StoredBattleCommandMatch
} from "./battle-command-core.js";

function humanPlans(stored: StoredBattleCommandMatch, actions: Record<string, AttentionV4KineticAction[]> = {}) {
  return (stored.state.schemaVersion === 3 ? stored.state.units : [])
    .filter((unit) => unit.ownerPlayerId === "alpha")
    .map((unit) => ({ unitId: unit.unitId, actions: actions[unit.unitId] ?? [] }));
}

function advanceToCommand(seed = 260813) {
  let current = createBattleCommandMatch(`battle-core-${seed}`, seed);
  current = submitBattleCommand(current.stored, { phase: "kinetic", plans: humanPlans(current.stored) });
  current = submitBattleCommand(current.stored, { phase: "artillery", cardId: null });
  current = submitBattleCommand(current.stored, { phase: "capacity", claim: false });
  return current;
}

describe("attention-economy-v4 battle command core", () => {
  it("creates a strict schema-v3 viewer projection and preserves the external model id", () => {
    const created = createBattleCommandMatch("battle-create-v4", 17);
    expect(() => BattleCommandV3ViewSchema.parse(created.view)).not.toThrow();
    expect(created.view).toMatchObject({
      schemaVersion: 3,
      modelVersion: "duel-capacity-v3-experimental",
      stateSchemaVersion: 3,
      rulesetVersion: "attention-economy-v4.4",
      resolverVersion: "attention-v4.4-resolver-1"
    });
    expect(created.view.projection.phase).toBe("kinetic");
    expect(created.stored.metadata).toMatchObject({
      modelVersion: "duel-capacity-v3-experimental",
      stateSchemaVersion: 3,
      resolverVersion: "attention-v4.4-resolver-1",
      rulesetVersion: "attention-economy-v4.4",
      rulesetHash: created.view.rulesetHash,
      compiledCommanderHashes: created.view.compiledCommanderHashes,
      conformanceReportHash: "sha256:8ecb2fcc6c7a3292943e64582a30d98cbfdb1dea4a1de79b922401cf48d62b43"
    });
    expect(created.view.rules.artillery.shells).toEqual(["flare", "smoke", "emp", "he", "chaff"]);
    expect(created.view.projection.players[0].armory.cards.map((card) => card.shell)).toEqual(["flare", "smoke", "emp", "he", "chaff"]);
    expect(created.view.legal.shellCards.every((card) => !card.legal && card.reason === "wrong-phase")).toBe(true);

    const forbidden = new Set(["seed", "randomStreamId", "sound", "latentSound", "soundKey", "noiseKey", "positionKey"]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbidden.has(key), key).toBe(false);
        visit(nested);
      }
    };
    visit(created.view);
  });

  it("creates any exact weight-six fleet and attributes its compiled commander", () => {
    const created = createBattleCommandMatch("battle-weighted-fleets", 23, {
      playerCompositionModule: "line-four-scout",
      opponentCompositionModule: "heavy-three-scout"
    });
    expect(created.view.projection.units.filter((unit) => unit.ownerPlayerId === "alpha").map((unit) => unit.chassis)).toEqual([
      "scout", "scout", "scout", "scout", "line"
    ]);
    expect(created.view.projection.units.filter((unit) => unit.ownerPlayerId === "bravo").map((unit) => unit.chassis)).toEqual(["scout", "scout", "scout", "heavy"]);
    expect(created.stored.metadata?.compiledCommanderHashes).toEqual(created.view.compiledCommanderHashes);
  });

  it("runs Register → Kinetic → Artillery → capacity claim → alternating Command", () => {
    const command = advanceToCommand();
    expect(command.view.projection.phase).toBe("command");
    expect(command.view.legal.activeCommanderId).toBe("alpha");
    expect(command.view.projection.capacityTrack.claims).toMatchObject([{ rank: 1, playerId: "bravo" }]);
    expect(command.view.events.some((item) => item.eventType === "attention.v4.phase.command")).toBe(true);

    const unit = command.view.projection.units.find((candidate) => candidate.ownerPlayerId === "alpha")!;
    const afterHuman = submitBattleCommand(command.stored, {
      phase: "command",
      intent: { kind: "hold", playerId: "alpha", unitId: unit.unitId }
    });
    expect(afterHuman.view.legal.activeCommanderId).toBe("alpha");
    expect(afterHuman.view.events.some((item) => item.eventType === "attention.v4.output.emitted" && item.actorId?.startsWith("bravo:") === true)).toBe(true);
  });

  it("projects action-paid range changes without reducing the next output's calibration", () => {
    let current = createBattleCommandMatch("battle-range-cost", 24);
    current = submitBattleCommand(current.stored, { phase: "kinetic", plans: humanPlans(current.stored, {
      "alpha:line-1": [{ kind: "move", destination: { x: 0, y: 2 } }, { kind: "range-shift", delta: 1 }],
      "alpha:heavy-1": [{ kind: "range-shift", delta: 1 }]
    }) });
    expect(current.view.projection.units.find((unit) => unit.unitId === "alpha:line-1")).toMatchObject({ activeRange: 4, calibration: 0.6, uap: { spent: 2 } });
    expect(current.view.projection.units.find((unit) => unit.unitId === "alpha:heavy-1")).toMatchObject({ activeRange: 5, calibration: 0.9, uap: { spent: 1 } });
    current = submitBattleCommand(current.stored, { phase: "artillery", cardId: null });
    current = submitBattleCommand(current.stored, { phase: "capacity", claim: false });
    current = submitBattleCommand(current.stored, { phase: "command", intent: {
      kind: "emit", playerId: "alpha", unitId: "alpha:line-1", volume: 1, densityPct: 80
    } });
    expect(current.view.projection.artifacts.find((artifact) => artifact.sourceUnitId === "alpha:line-1")).toMatchObject({
      densityPct: 80, sourceCalibration: 0.6, effectiveCalibration: 0.48
    });
  });

  it("requires a complete explicit human kinetic plan", () => {
    const created = createBattleCommandMatch("battle-complete-plan", 18);
    expect(() => submitBattleCommand(created.stored, {
      phase: "kinetic",
      plans: humanPlans(created.stored).slice(0, 2)
    })).toThrow("kinetic_plan_incomplete");
  });

  it("requires Emit or Hold for every unit before End and resolves automatically", () => {
    let current = advanceToCommand(41);
    expect(() => submitBattleCommand(current.stored, {
      phase: "command",
      intent: { kind: "end-command", playerId: "alpha" }
    })).not.toThrow();
    const rejected = submitBattleCommand(current.stored, {
      phase: "command",
      intent: { kind: "end-command", playerId: "alpha" }
    });
    expect(rejected.view.events.at(-1)).toMatchObject({ eventType: "attention.v4.command.rejected", data: { reason: "output-decisions-required" } });
    current = rejected;
    for (const unit of current.view.projection.units.filter((candidate) => candidate.ownerPlayerId === "alpha")) {
      current = submitBattleCommand(current.stored, {
        phase: "command",
        intent: { kind: "hold", playerId: "alpha", unitId: unit.unitId }
      });
    }
    current = submitBattleCommand(current.stored, {
      phase: "command",
      intent: { kind: "end-command", playerId: "alpha" }
    });
    expect(current.view.projection.round).toBe(2);
    expect(current.view.projection.phase).toBe("kinetic");
    expect(current.view.recaps.resolution?.completedRound).toBe(1);
    expect(current.view.events.some((item) => item.eventType === "attention.v4.register")).toBe(true);
  });

  it("marks old-schema operations retired instead of hydrating them", () => {
    const created = createBattleCommandMatch("battle-retired", 19);
    const retired = structuredClone(created.stored) as unknown as StoredBattleCommandMatch;
    (retired.state as unknown as { schemaVersion: number }).schemaVersion = 1;
    expect(isRetiredBattleCommandMatch(retired)).toBe(true);
    expect(() => submitBattleCommand(retired, { phase: "capacity", claim: false })).toThrow("battle_ruleset_retired");
  });

  it("retires v4-shaped snapshots when persisted identity metadata drifts", () => {
    const created = createBattleCommandMatch("battle-retired-metadata", 20);
    const retired = structuredClone(created.stored);
    retired.metadata = { ...retired.metadata, resolverVersion: "attention-v3-resolver-1" as never };
    expect(isRetiredBattleCommandMatch(retired)).toBe(true);

    const mismatchedCompiler = structuredClone(created.stored);
    mismatchedCompiler.metadata!.compiledCommanderHashes = [
      mismatchedCompiler.metadata!.compiledCommanderHashes![1],
      mismatchedCompiler.metadata!.compiledCommanderHashes![0]
    ];
    expect(isRetiredBattleCommandMatch(mismatchedCompiler)).toBe(true);

    const mismatchedFleet = structuredClone(created.stored);
    for (const unit of mismatchedFleet.state.schemaVersion === 3 ? mismatchedFleet.state.units.filter((unit) => unit.ownerPlayerId === "alpha") : []) {
      unit.chassis = "line";
      unit.reactorRating = 2;
      unit.activeRange = 3;
      unit.calibration = 0.6;
      unit.uap.base = 2;
      unit.uap.effective = 2;
    }
    expect(isRetiredBattleCommandMatch(mismatchedFleet)).toBe(true);
  });

  it.each([
    { rulesetVersion: "attention-economy-v4.2", resolverVersion: "attention-v4.2-resolver-1", rulesetHash: "sha256:654edb095f10854ae029ee90d06803c71fb819571483d5f39068f3693c199b19" },
    { rulesetVersion: "attention-economy-v4.3", resolverVersion: "attention-v4.3-resolver-1", rulesetHash: "sha256:7a3450785ad82444afeaca8d26e89c7d710fb4358e05a4d1c8dfb01b99ca11fc" }
  ])("retires $rulesetVersion operations instead of silently changing their range or Smoke rules", (identity) => {
    const created = createBattleCommandMatch("battle-retired-range-penalty", 21);
    expect(isRetiredBattleCommandMatch(created.stored)).toBe(false);
    const retired = structuredClone(created.stored);
    Object.assign(retired.state, identity);
    Object.assign(retired.metadata!, identity);
    expect(isRetiredBattleCommandMatch(retired)).toBe(true);
    expect(() => submitBattleCommand(retired, { phase: "capacity", claim: false })).toThrow("battle_ruleset_retired");
  });
});
