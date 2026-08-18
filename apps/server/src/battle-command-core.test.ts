import { describe, expect, it } from "vitest";
import { BattleCommandViewSchema } from "@landscape/contracts";
import { createBattleCommandMatch, submitBattleCommand } from "./battle-command-core.js";

function advanceToCommand() {
  let current = createBattleCommandMatch("battle-core-test", 260813);
  current = submitBattleCommand(current.stored, { phase: "artillery", shell: null });
  current = submitBattleCommand(current.stored, { phase: "movement", plans: [] });
  current = submitBattleCommand(current.stored, { phase: "capacity", claim: false });
  return current;
}

describe("battle command core", () => {
  it("creates a strict viewer projection with the four-shell experimental hand", () => {
    const created = createBattleCommandMatch("battle-create", 17);
    expect(() => BattleCommandViewSchema.parse(created.view)).not.toThrow();
    expect(created.view.projection.phase).toBe("artillery");
    expect(created.view.legal.artilleryShells).toEqual(["flare", "chaff", "he", "smoke"]);
    expect(created.view.rules.artillery.startingHand).toEqual({ flare: 1, chaff: 1, he: 1, smoke: 1 });
    expect(created.view.rules.chassis.scout).toMatchObject({ throughput: 3, seizeCost: 1 });
    expect(created.view.legal.abilities).toMatchObject({
      perfectFocus: { ready: false, reason: "capacity rank required" },
      overclock: { ready: false, reason: "capacity rank required" },
      macroFlare: { ready: false, reason: "replaced by artillery" }
    });

    const forbidden = new Set(["seed", "randomStreamId", "sound", "latentSound"]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbidden.has(key)).toBe(false);
        visit(nested);
      }
    };
    visit(created.view);
  });

  it("advances the solo player through a complete phase cycle", () => {
    const command = advanceToCommand();
    expect(command.view.projection.phase).toBe("command");
    const nextRound = submitBattleCommand(command.stored, {
      phase: "command",
      intent: { kind: "end-command", playerId: "alpha" }
    });
    expect(nextRound.view.projection.round).toBe(2);
    expect(nextRound.view.projection.phase).toBe("artillery");
    expect(nextRound.view.revision).toBe(4);
    expect(nextRound.view.events.some((event) => event.eventType === "attention.round.resolved")).toBe(true);
    expect(JSON.stringify(nextRound.view.events)).not.toContain('"latentSound"');
  });

  it("runs the doctrine opponent deterministically from public state", () => {
    const left = createBattleCommandMatch("battle-determinism-left", 44);
    const right = createBattleCommandMatch("battle-determinism-right", 44);
    const a = submitBattleCommand(left.stored, { phase: "artillery", shell: null });
    const b = submitBattleCommand(right.stored, { phase: "artillery", shell: null });
    const aiEvent = (events: typeof a.view.events) => events.find((event) =>
      event.eventType === "attention.artillery.shell.fired" && event.actorId === "bravo"
    )?.data;
    expect(aiEvent(a.view.events)).toMatchObject({ shell: "flare" });
    expect(aiEvent(a.view.events)).toEqual(aiEvent(b.view.events));
    const movement = submitBattleCommand(a.stored, { phase: "movement", plans: [] });
    expect(movement.view.events.some((event) => event.eventType === "attention.uap.plan.resolved" && event.data.playerId === "bravo")).toBe(true);
    const capacity = submitBattleCommand(movement.stored, { phase: "capacity", claim: false });
    expect(capacity.view.events.some((event) => event.eventType === "attention.capacity.claimed" && event.actorId === "bravo")).toBe(true);
  });

  it("awards accepted sound objective work when the round resolves", () => {
    let command: ReturnType<typeof advanceToCommand> | undefined;
    let targetId = "";
    for (let seed = 1; seed <= 100 && !targetId; seed += 1) {
      let candidate = createBattleCommandMatch(`battle-progress-${seed}`, seed);
      candidate = submitBattleCommand(candidate.stored, { phase: "artillery", shell: null });
      candidate = submitBattleCommand(candidate.stored, { phase: "movement", plans: [] });
      candidate = submitBattleCommand(candidate.stored, { phase: "capacity", claim: false });
      const target = candidate.stored.state.artifacts.find((artifact) =>
        artifact.ownerPlayerId === "alpha" && artifact.objectiveEligible && artifact.sound
      );
      if (target) {
        command = candidate;
        targetId = target.artifactId;
      }
    }
    expect(command).toBeDefined();
    const progressBefore = command!.view.projection.players.find((player) => player.playerId === "alpha")!.progress;
    let current = submitBattleCommand(command!.stored, {
      phase: "command",
      intent: { kind: "accept", playerId: "alpha", artifactId: targetId }
    });
    expect(current.view.projection.players.find((player) => player.playerId === "alpha")!.progress).toBe(progressBefore);
    for (const artifact of current.stored.state.artifacts.filter((item) =>
      item.ownerPlayerId === "alpha" && item.resolution === "pending"
    )) {
      current = submitBattleCommand(current.stored, {
        phase: "command",
        intent: { kind: "reject", playerId: "alpha", artifactId: artifact.artifactId }
      });
    }
    current = submitBattleCommand(current.stored, {
      phase: "command",
      intent: { kind: "end-command", playerId: "alpha" }
    });
    expect(current.view.projection.players.find((player) => player.playerId === "alpha")!.progress).toBe(progressBefore + 1);
  });

  it("rejects submissions for the wrong phase", () => {
    const created = createBattleCommandMatch("battle-phase", 18);
    expect(() => submitBattleCommand(created.stored, { phase: "capacity", claim: false }))
      .toThrow("phase_mismatch:artillery");
  });
});
