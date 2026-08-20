import { describe, expect, it } from "vitest";
import {
  ATTENTION_V4_DEEP_WORLD_LANES,
  attentionV4LandscapeMatchCount,
  mergeAttentionV4LandscapeShards,
  runAttentionV4LandscapeShard
} from "./attention-v4-landscape.js";
import {
  ATTENTION_V4_MATRIX_EDGES_PER_CELL,
  ATTENTION_V4_MATRIX_FLEET_CELLS,
  ATTENTION_V4_MATRIX_MATCHES,
  ATTENTION_V4_MATRIX_NON_SELF_EDGES,
  ATTENTION_V4_REGULAR_DEGREE,
  ATTENTION_V4_REGULAR_MATCHES,
  ATTENTION_V4_REGULAR_NON_SELF_EDGES,
  ATTENTION_V4_REGULAR_SELF_PLAY_EDGES,
  attentionV4DeepDesign,
  createAttentionV4FleetMatrixEdges,
  createAttentionV4RegularTopologyEdges
} from "./attention-v4-deep-design.js";

function degrees(edges: Array<{ kind: string; leftOrdinal: number; rightOrdinal: number }>): Set<number> {
  const result = Array.from({ length: 3_200 }, () => 0);
  for (const edge of edges) {
    if (edge.kind !== "matchup") continue;
    result[edge.leftOrdinal] += 1;
    result[edge.rightOrdinal] += 1;
  }
  return new Set(result);
}

function unorderedPairCount(edges: Array<{ kind: string; leftOrdinal: number; rightOrdinal: number }>): number {
  return new Set(edges.filter((edge) => edge.kind === "matchup")
    .map((edge) => [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":"))).size;
}

describe("attention v4 five-hour deep studies", () => {
  it("builds an exact ordinal-independent degree-88 regular topology", () => {
    const edges = createAttentionV4RegularTopologyEdges();
    const matchups = edges.filter((edge) => edge.kind === "matchup");
    const selfPlay = edges.filter((edge) => edge.kind === "self-play");
    const cells = new Set(matchups.map((edge) => edge.fleetCell));
    const design = attentionV4DeepDesign("regular-topology", edges);

    expect(matchups).toHaveLength(ATTENTION_V4_REGULAR_NON_SELF_EDGES);
    expect(selfPlay).toHaveLength(ATTENTION_V4_REGULAR_SELF_PLAY_EDGES);
    expect(unorderedPairCount(edges)).toBe(ATTENTION_V4_REGULAR_NON_SELF_EDGES);
    expect(degrees(edges)).toEqual(new Set([ATTENTION_V4_REGULAR_DEGREE]));
    expect(cells.size).toBe(ATTENTION_V4_MATRIX_FLEET_CELLS);
    expect(design.kind).toBe("regular-topology");
    expect(design.referenceOverlapEdges).toBeGreaterThan(0);
    expect(design.referenceOverlapEdges).toBeLessThan(matchups.length / 20);
    expect(attentionV4LandscapeMatchCount(edges, 4, 2)).toBe(ATTENTION_V4_REGULAR_MATCHES);
  });

  it("builds fifteen exactly balanced fleet cells with degree 24", () => {
    const edges = createAttentionV4FleetMatrixEdges();
    const cells = new Map<string, number>();
    for (const edge of edges) cells.set(edge.fleetCell!, (cells.get(edge.fleetCell!) ?? 0) + 1);

    expect(edges).toHaveLength(ATTENTION_V4_MATRIX_NON_SELF_EDGES);
    expect(unorderedPairCount(edges)).toBe(ATTENTION_V4_MATRIX_NON_SELF_EDGES);
    expect(degrees(edges)).toEqual(new Set([24]));
    expect(cells.size).toBe(ATTENTION_V4_MATRIX_FLEET_CELLS);
    expect(new Set(cells.values())).toEqual(new Set([ATTENTION_V4_MATRIX_EDGES_PER_CELL]));
    expect(attentionV4LandscapeMatchCount(edges, 4, 2)).toBe(ATTENTION_V4_MATRIX_MATCHES);
  });

  it("keeps seat streams common, world streams distinct, and emits deep telemetry", () => {
    const allEdges = createAttentionV4FleetMatrixEdges();
    const edge = allEdges[0];
    const shard = runAttentionV4LandscapeShard({
      edges: [edge],
      pressures: [0],
      worldLanes: [...ATTENTION_V4_DEEP_WORLD_LANES],
      seedScheme: "pair-keyed-world-v1",
      replayModulo: 1,
      studyId: "attention-v4.2-fleet-matrix-1"
    });
    const report = mergeAttentionV4LandscapeShards([shard], {
      expectedEdges: allEdges,
      studyId: "attention-v4.2-fleet-matrix-1",
      deepDesign: attentionV4DeepDesign("fleet-matrix", allEdges)
    });

    expect(report.schemaVersion).toBe(2);
    expect(report.design.physicalMatches).toBe(4);
    expect(report.seat.exactReversalPairs).toBe(2);
    expect(report.integrity.replayMismatches).toBe(0);
    expect(report.integrity.streamMismatches).toBe(0);
    expect(report.integrity.attributionMismatches).toBe(0);
    expect(report.integrity.worldStreamCollisions).toBe(0);
    expect(report.worlds?.lanes).toEqual([0, 1]);
    expect(report.worlds?.comparisons).toBe(1);
    expect(report.fleetMatchups).toHaveLength(1);
    expect(Object.values(report.progressPath?.participantHistogram ?? {}).reduce((sum, value) => sum + value, 0)).toBe(8);
    expect(report.design.complete).toBe(false);
    expect(report.integrity.passed).toBe(false);
  });
});
