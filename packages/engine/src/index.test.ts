import { describe, expect, it } from "vitest";
import { buildReconstruction, createMatchState, projectForPlayer, resolveSlot, runReplay } from "./index.js";

describe("deterministic match engine", () => {
  it("exposes the hidden contract through scouting and rewards infrastructure", () => {
    let state = createMatchState("test-match");
    const scout = resolveSlot(state, [{ unitId: "scout-01", action: "scout", fireMode: "single" }]);
    state = scout.state;
    expect(state.contractExposed).toBe(true);
    const contract = resolveSlot(state, [{ unitId: "line-01", action: "build_contract", fireMode: "single" }]);
    expect(contract.state.contractBuilt).toBe(true);
    expect(contract.state.artifacts).toContain("contract-depot");
  });

  it("produces the same state and event types for the same inputs", () => {
    const state = createMatchState("same");
    const orders = [{ unitId: "line-01", action: "implement" as const, fireMode: "full" as const }];
    const first = resolveSlot(state, orders);
    const second = resolveSlot(state, orders);
    expect(first.state).toEqual(second.state);
    expect(first.events.map((item) => item.eventType)).toEqual(second.events.map((item) => item.eventType));
  });

  it("does not expose an enemy until its cell is known", () => {
    const projection = projectForPlayer(createMatchState("visibility"));
    expect(projection.visibleEnemyUnits).toHaveLength(0);
  });

  it("allows the intended low-energy doctrine to win", () => {
    let state = createMatchState("victory");
    for (const order of [
      { unitId: "scout-01", action: "scout" as const, fireMode: "single" as const },
      { unitId: "line-01", action: "build_contract" as const, fireMode: "single" as const },
      { unitId: "line-01", action: "implement" as const, fireMode: "semi" as const },
      { unitId: "line-02", action: "review" as const, fireMode: "single" as const },
      { unitId: "line-01", action: "full_send" as const, fireMode: "full" as const }
    ]) state = resolveSlot(state, [order]).state;
    expect(state.status).toBe("victory");
    expect(state.commanderEnergy).toBe(0);
  });

  it("replays the same batches with a stable manifest", () => {
    const initial = createMatchState("replay");
    const batches = [
      { orders: [{ unitId: "scout-01", action: "scout" as const, fireMode: "single" as const }] },
      { orders: [{ unitId: "line-01", action: "build_contract" as const, fireMode: "single" as const }] }
    ];
    const first = runReplay(initial, batches);
    const second = runReplay(initial, batches);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.events).toEqual(second.events);
  });

  it("supports a distinct false-bottleneck lesson profile", () => {
    let state = createMatchState("false-bottleneck", "player", undefined, "false-bottleneck");
    for (const order of [
      { unitId: "scout-01", action: "scout" as const, fireMode: "single" as const },
      { unitId: "line-01", action: "implement" as const, fireMode: "semi" as const },
      { unitId: "line-01", action: "implement" as const, fireMode: "semi" as const }
    ]) state = resolveSlot(state, [order]).state;
    expect(state.status).toBe("victory");
    expect(state.lessonFlags).toContain("measurement_verified");
  });

  it("derives a reconstruction from causal events", () => {
    const initial = createMatchState("reconstruction");
    const result = runReplay(initial, [{ orders: [{ unitId: "scout-01", action: "scout", fireMode: "single" }] }]);
    const report = buildReconstruction(result.state, result.events);
    expect(report.actionCount).toBe(1);
    expect(report.eventTypes["terrain.revealed"]).toBe(1);
    expect(report.counterfactual.action).toBe("scout");
  });

  it("stops replay at the same terminal boundary enforced by the live server", () => {
    const initial = createMatchState("terminal-replay", "player", 42, "context-furnace", "balanced", { fullSendHeat: 1 });
    const result = runReplay(initial, [
      { orders: [{ unitId: "line-01", action: "full_send", fireMode: "full" }] },
      { orders: [{ unitId: "line-01", action: "full_send", fireMode: "full" }] },
      { orders: [{ unitId: "line-01", action: "full_send", fireMode: "full" }] }
    ]);
    expect(result.state.status).toBe("victory");
    expect(result.state.slot).toBe(2);
    expect(result.state.objectiveProgress).toBe(6);
    expect(result.state.heat).toBe(2);
  });

  it("applies versioned tuning and composition inputs deterministically", () => {
    const initial = createMatchState("tuned", "player", 1, "context-furnace", "siege-heavy", { tuningId: "heat-test", fullSendHeat: 1, startingHeat: 2, startingDispersion: 1, startingConfidenceDrift: 2 });
    expect(initial.compositionId).toBe("siege-heavy");
    expect(initial.rulesTuning.tuningId).toBe("heat-test");
    const result = resolveSlot(initial, [{ unitId: "line-01", action: "full_send", fireMode: "full" }]);
    expect(result.state.heat).toBe(3);
    expect(initial.dispersion).toBe(1);
    expect(initial.confidenceDrift).toBe(2);
  });
});
