import type { FastifyInstance, FastifyReply } from "fastify";
import {
  STRATEGIC_WORLD_EDGE,
  StrategicBoundsV1Schema,
  StrategicViewportLodV1Schema
} from "@landscape/contracts";
import { createCommanderLandscapeFixture, type CommanderLandscapeFixture } from "@landscape/engine";

type ViewportQuery = {
  minX?: string;
  minY?: string;
  maxX?: string;
  maxY?: string;
  lod?: string;
};

type BattleQuery = { z?: string };

const fixtures = new Map<string, CommanderLandscapeFixture>();
const MAX_FIXTURE_WORLDS = 32;

function parseWorldId(value: string): string {
  const worldId = value.trim();
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(worldId)) throw new TypeError("invalid_world_id");
  return worldId;
}

function seedForWorld(worldId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < worldId.length; index += 1) {
    hash ^= worldId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fixtureForWorld(worldId: string): CommanderLandscapeFixture {
  const existing = fixtures.get(worldId);
  if (existing) {
    fixtures.delete(worldId);
    fixtures.set(worldId, existing);
    return existing;
  }
  const created = createCommanderLandscapeFixture({
    worldId,
    revision: "commander-prototype-v1",
    seed: seedForWorld(worldId)
  });
  if (fixtures.size >= MAX_FIXTURE_WORLDS) {
    const oldest = fixtures.keys().next().value as string | undefined;
    if (oldest) fixtures.delete(oldest);
  }
  fixtures.set(worldId, created);
  return created;
}

function finiteInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new TypeError("viewport_coordinates_must_be_integers");
  return parsed;
}

function routeError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.startsWith("Unknown fixture battle") ? 404 : 400;
  return reply.code(status).send({ error: message });
}

export function registerLandscapeRoutes(app: FastifyInstance): void {
  app.get<{ Params: { worldId: string } }>("/api/landscapes/:worldId", async (request, reply) => {
    try {
      return fixtureForWorld(parseWorldId(request.params.worldId)).descriptor;
    } catch (error) {
      return routeError(reply, error);
    }
  });

  app.get<{ Params: { worldId: string }; Querystring: ViewportQuery }>(
    "/api/landscapes/:worldId/viewport",
    async (request, reply) => {
      try {
        const worldId = parseWorldId(request.params.worldId);
        const bounds = StrategicBoundsV1Schema.parse({
          minX: finiteInteger(request.query.minX, 0),
          minY: finiteInteger(request.query.minY, 0),
          maxX: finiteInteger(request.query.maxX, STRATEGIC_WORLD_EDGE),
          maxY: finiteInteger(request.query.maxY, STRATEGIC_WORLD_EDGE)
        });
        const lod = StrategicViewportLodV1Schema.parse(request.query.lod ?? "theater");
        return createCommanderLandscapeFixture({
          worldId,
          revision: fixtureForWorld(worldId).descriptor.revision,
          seed: seedForWorld(worldId),
          bounds,
          lod
        }).viewport;
      } catch (error) {
        return routeError(reply, error);
      }
    }
  );

  app.get<{ Params: { worldId: string; battleId: string }; Querystring: BattleQuery }>(
    "/api/landscapes/:worldId/battles/:battleId/projection",
    async (request, reply) => {
      try {
        const worldId = parseWorldId(request.params.worldId);
        const layer = finiteInteger(request.query.z, 16);
        if (layer < 0 || layer > 31) return reply.code(400).send({ error: "battle_layer_out_of_range" });
        return fixtureForWorld(worldId).battle(request.params.battleId, layer);
      } catch (error) {
        return routeError(reply, error);
      }
    }
  );
}
