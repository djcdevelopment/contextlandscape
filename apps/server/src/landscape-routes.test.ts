import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BattleVolumeProjectionV1Schema,
  StrategicViewportProjectionV1Schema,
  WorldDescriptorV1Schema
} from "@landscape/contracts";
import { registerLandscapeRoutes } from "./landscape-routes.js";

describe("commander landscape routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    registerLandscapeRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves the fixed 6,400 by 6,400 descriptor", async () => {
    const response = await app.inject({ method: "GET", url: "/api/landscapes/commander-landscape-demo" });
    expect(response.statusCode).toBe(200);
    const descriptor = WorldDescriptorV1Schema.parse(response.json());
    expect(descriptor.strategicDimensions).toEqual({ width: 6_400, height: 6_400 });
    expect(descriptor.battleDimensions).toEqual({ width: 32, height: 32, depth: 32 });
  });

  it("returns bounded sparse viewport projections", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/landscapes/commander-landscape-demo/viewport?minX=0&minY=0&maxX=3200&maxY=3200&lod=sector"
    });
    expect(response.statusCode).toBe(200);
    const projection = StrategicViewportProjectionV1Schema.parse(response.json());
    expect(projection.bounds).toEqual({ minX: 0, minY: 0, maxX: 3_200, maxY: 3_200 });
    expect(projection.battles.length).toBeGreaterThan(0);
    expect(projection.battles.length).toBeLessThan(160);
    expect(response.body.length).toBeLessThan(1_000_000);
  });

  it("serves a viewer-scoped 32-layer battle projection", async () => {
    const viewportResponse = await app.inject({
      method: "GET",
      url: "/api/landscapes/commander-landscape-demo/viewport"
    });
    const viewport = StrategicViewportProjectionV1Schema.parse(viewportResponse.json());
    const battleId = viewport.battles[0].battle.battleId;
    const response = await app.inject({
      method: "GET",
      url: `/api/landscapes/commander-landscape-demo/battles/${battleId}/projection?z=31`
    });
    expect(response.statusCode).toBe(200);
    const projection = BattleVolumeProjectionV1Schema.parse(response.json());
    expect(projection.activeLayer).toBe(31);
    expect(projection.layers).toHaveLength(32);
    const forbiddenKeys = new Set(["seed", "randomStreamId", "sound"]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbiddenKeys.has(key)).toBe(false);
        visit(nested);
      }
    };
    visit(projection);
  });

  it("rejects invalid viewport bounds and battle layers", async () => {
    const viewport = await app.inject({
      method: "GET",
      url: "/api/landscapes/commander-landscape-demo/viewport?minX=10&maxX=5"
    });
    expect(viewport.statusCode).toBe(400);

    const battle = await app.inject({
      method: "GET",
      url: "/api/landscapes/commander-landscape-demo/battles/battle-0001/projection?z=32"
    });
    expect(battle.statusCode).toBe(400);
  });

  it("keeps battle projections scoped to their world identity", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/landscapes/alternate-world/battles/battle-0001/projection?z=4"
    });
    expect(response.statusCode).toBe(200);
    const projection = BattleVolumeProjectionV1Schema.parse(response.json());
    expect(projection.battle.worldId).toBe("alternate-world");

    const invalid = await app.inject({ method: "GET", url: "/api/landscapes/not%20valid" });
    expect(invalid.statusCode).toBe(400);
  });

  it("selects a layer without changing the underlying 32-cubed projection", async () => {
    const base = "/api/landscapes/commander-landscape-demo/battles/battle-0001/projection";
    const low = BattleVolumeProjectionV1Schema.parse((await app.inject({ method: "GET", url: `${base}?z=2` })).json());
    const high = BattleVolumeProjectionV1Schema.parse((await app.inject({ method: "GET", url: `${base}?z=29` })).json());
    expect(low.activeLayer).toBe(2);
    expect(high.activeLayer).toBe(29);
    expect({ ...low, activeLayer: 0 }).toEqual({ ...high, activeLayer: 0 });
  });
});
