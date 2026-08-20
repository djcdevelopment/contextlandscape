import { describe, expect, it } from "vitest";
import { BattleCommandV3ViewSchema } from "@landscape/contracts";
import {
  createBattleCommandMatch,
  isRetiredBattleCommandMatch,
  submitBattleCommand,
  type StoredBattleCommandMatch
} from "./battle-command-core.js";

function humanPlans(stored: StoredBattleCommandMatch, actions: Record<string, never[]> = {}) {
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
      rulesetVersion: "attention-economy-v4.2",
      resolverVersion: "attention-v4.2-resolver-1"
    });
    expect(created.view.projection.phase).toBe("kinetic");
    expect(created.stored.metadata).toMatchObject({
      modelVersion: "duel-capacity-v3-experimental",
      stateSchemaVersion: 3,
      resolverVersion: "attention-v4.2-resolver-1",
      rulesetVersion: "attention-economy-v4.2",
      rulesetHash: created.view.rulesetHash,
      compiledCommanderHashes: created.view.compiledCommanderHashes,
      conformanceReportHash: "sha256:ba5147dc0e9865e44978654ac84aa29c4cfa2992fe3dcacc2465097b340a287f"
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
});
