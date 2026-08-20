import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBattleCommandMatch, type StoredBattleCommandMatch } from "./battle-command-core.js";
import { app, setMemoryBattleCommandMatchForTest } from "./main.js";

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("attention-v4 Battle Command HTTP routes", () => {
  it("returns 410 with a new-operation link for retired GET and action requests", async () => {
    const created = createBattleCommandMatch("retired-http", 201);
    const retired = structuredClone(created.stored) as unknown as StoredBattleCommandMatch;
    (retired.state as unknown as { schemaVersion: number }).schemaVersion = 1;
    setMemoryBattleCommandMatchForTest("retired-http", retired);

    const get = await app.inject({ method: "GET", url: "/api/battle-command/matches/retired-http" });
    expect(get.statusCode).toBe(410);
    expect(get.json()).toEqual({ error: "battle_ruleset_retired", createOperation: "/api/battle-command/matches" });

    const action = await app.inject({
      method: "POST",
      url: "/api/battle-command/matches/retired-http/actions",
      headers: { "idempotency-key": "retired-retry" },
      payload: { revision: 0, submission: { phase: "capacity", claim: false } }
    });
    expect(action.statusCode).toBe(410);
    expect(action.json()).toEqual({ error: "battle_ruleset_retired", createOperation: "/api/battle-command/matches" });
  });

  it("preserves revision conflicts and idempotent action replay for schema-v3 operations", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/battle-command/matches",
      payload: { seed: 202, playerCompositionModule: "line-four-scout", opponentCompositionModule: "heavy-three-scout" }
    });
    expect(created.statusCode).toBe(201);
    const view = created.json();
    expect(view).toMatchObject({ schemaVersion: 3, revision: 0, rulesetVersion: "attention-economy-v4.2", stateSchemaVersion: 3 });
    expect(view.projection.units.filter((unit: { ownerPlayerId: string }) => unit.ownerPlayerId === "alpha")).toHaveLength(5);
    expect(view.projection.units.filter((unit: { ownerPlayerId: string }) => unit.ownerPlayerId === "bravo")).toHaveLength(4);
    const id = view.projection.matchId as string;
    const plans = view.projection.units
      .filter((unit: { ownerPlayerId: string }) => unit.ownerPlayerId === "alpha")
      .map((unit: { unitId: string }) => ({ unitId: unit.unitId, actions: [] }));
    const request = {
      method: "POST" as const,
      url: `/api/battle-command/matches/${id}/actions`,
      headers: { "idempotency-key": "kinetic-one" },
      payload: { revision: 0, submission: { phase: "kinetic", plans } }
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({ revision: 1, projection: { phase: "artillery" } });

    const conflict = await app.inject({ ...request, headers: { "idempotency-key": "kinetic-two" } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "battle_revision_conflict", currentRevision: 1 });
  });

  it("rejects unknown or partial fleet setup fields", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/battle-command/matches",
      payload: { seed: 203, playerCompositionModule: "three-heavy" }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: "invalid_battle_setup" });
  });
});
