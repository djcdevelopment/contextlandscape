import { describe, expect, it } from "vitest";
import {
  BATTLE_VOLUME_CELLS,
  BATTLE_VOLUME_EDGE,
  STRATEGIC_CHUNKS_PER_EDGE,
  STRATEGIC_WORLD_EDGE
} from "@landscape/contracts";
import {
  battleCoordinateFromIndex,
  battleCoordinateIndex,
  createCommanderLandscapeFixture,
  landscapeAddressKey,
  strategicChunkAddress,
  strategicChunkLocalCoordinate,
  strategicCoordinateFromChunk
} from "./landscape.js";

describe("commander landscape coordinates", () => {
  it("pins the sparse world and battle volume dimensions", () => {
    expect(STRATEGIC_WORLD_EDGE).toBe(6_400);
    expect(STRATEGIC_CHUNKS_PER_EDGE).toBe(200);
    expect(BATTLE_VOLUME_EDGE).toBe(32);
    expect(BATTLE_VOLUME_CELLS).toBe(32_768);
  });

  it.each([
    { x: 0, y: 0 },
    { x: 31, y: 31 },
    { x: 32, y: 32 },
    { x: 6_399, y: 6_399 }
  ])("round-trips strategic coordinate $x,$y through chunk addressing", (coordinate) => {
    const chunk = strategicChunkAddress(coordinate);
    const local = strategicChunkLocalCoordinate(coordinate);
    expect(strategicCoordinateFromChunk(chunk, local)).toEqual(coordinate);
  });

  it("maps the last world cell to chunk 199 and local cell 31", () => {
    expect(strategicChunkAddress({ x: 6_399, y: 6_399 })).toEqual({ chunkX: 199, chunkY: 199 });
    expect(strategicChunkLocalCoordinate({ x: 6_399, y: 6_399 })).toEqual({ x: 31, y: 31 });
  });

  it.each([0, 1, 31, 32, 1_024, 16_383, 32_767])("round-trips battle index %s", (index) => {
    expect(battleCoordinateIndex(battleCoordinateFromIndex(index))).toBe(index);
  });

  it("uses stable strategic and battle address keys", () => {
    expect(landscapeAddressKey("world", { x: 32, y: 64 })).toBe("world:s:32,64");
    expect(landscapeAddressKey("world", { x: 32, y: 64 }, "battle-1", { x: 1, y: 2, z: 3 }))
      .toBe("world:s:32,64:b:battle-1:1,2,3");
  });
});

describe("commander landscape fixture", () => {
  it("is deterministic, sparse, and bounded", () => {
    const left = createCommanderLandscapeFixture({ seed: 1234 });
    const right = createCommanderLandscapeFixture({ seed: 1234 });
    expect(left.viewport).toEqual(right.viewport);
    expect(left.viewport.battles).toHaveLength(160);
    expect(left.viewport.fields.flatMap((field) => field.samples).length).toBeLessThan(1_000);
    expect(JSON.stringify(left.viewport).length).toBeLessThan(1_000_000);
  });

  it("returns all 32 layer summaries without hidden random-world fields", () => {
    const fixture = createCommanderLandscapeFixture({ seed: 99 });
    const projection = fixture.battle(fixture.viewport.battles[0].battle.battleId, 31);
    expect(projection.activeLayer).toBe(31);
    expect(projection.layers.map((layer) => layer.z)).toEqual(Array.from({ length: 32 }, (_, index) => index));

    const forbidden = new Set(["seed", "randomStreamId", "sound"]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbidden.has(key)).toBe(false);
        visit(nested);
      }
    };
    visit(projection);
  });

  it("changes only the requested slice when selecting a different battle layer", () => {
    const fixture = createCommanderLandscapeFixture({ seed: 321 });
    const battleId = fixture.viewport.battles[0].battle.battleId;
    const low = fixture.battle(battleId, 3);
    const high = fixture.battle(battleId, 27);
    expect(low.activeLayer).toBe(3);
    expect(high.activeLayer).toBe(27);
    expect({ ...low, activeLayer: 0 }).toEqual({ ...high, activeLayer: 0 });
  });

  it("rejects out-of-range dense battle indexes", () => {
    expect(() => battleCoordinateFromIndex(-1)).toThrow(RangeError);
    expect(() => battleCoordinateFromIndex(BATTLE_VOLUME_CELLS)).toThrow(RangeError);
  });
});
