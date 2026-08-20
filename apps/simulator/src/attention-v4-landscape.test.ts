import { describe, expect, it } from "vitest";
import {
  ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS,
  attentionV4LandscapeMatchCount,
  createAttentionV4LandscapeEdges,
  mergeAttentionV4LandscapeShards,
  runAttentionV4LandscapeShard
} from "./attention-v4-landscape.js";

describe("attention v4 descriptive landscape", () => {
  it("builds the fixed sparse catalog topology", () => {
    const edges = createAttentionV4LandscapeEdges();
    const matchupEdges = edges.filter((edge) => edge.kind === "matchup");
    const selfPlayEdges = edges.filter((edge) => edge.kind === "self-play");
    const unorderedPairs = new Set(matchupEdges.map((edge) => [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":")));
    const degrees = Array.from({ length: 3_200 }, () => 0);
    matchupEdges.forEach((edge) => {
      degrees[edge.leftOrdinal] += 1;
      degrees[edge.rightOrdinal] += 1;
    });

    expect(edges).toHaveLength(16_000);
    expect(matchupEdges).toHaveLength(12_800);
    expect(selfPlayEdges).toHaveLength(3_200);
    expect(unorderedPairs.size).toBe(12_800);
    expect(new Set(degrees)).toEqual(new Set([8]));
    expect(attentionV4LandscapeMatchCount(edges, 4)).toBe(115_200);
  });

  it("builds the expanded degree-32 topology without duplicate matchups", () => {
    const edges = createAttentionV4LandscapeEdges(ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS);
    const matchupEdges = edges.filter((edge) => edge.kind === "matchup");
    const selfPlayEdges = edges.filter((edge) => edge.kind === "self-play");
    const unorderedPairs = new Set(matchupEdges.map((edge) => [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":")));
    const degrees = Array.from({ length: 3_200 }, () => 0);
    matchupEdges.forEach((edge) => {
      degrees[edge.leftOrdinal] += 1;
      degrees[edge.rightOrdinal] += 1;
    });

    expect(ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS).toHaveLength(16);
    expect(matchupEdges).toHaveLength(51_200);
    expect(selfPlayEdges).toHaveLength(3_200);
    expect(unorderedPairs.size).toBe(51_200);
    expect(new Set(degrees)).toEqual(new Set([32]));
    expect(attentionV4LandscapeMatchCount(edges, 4)).toBe(422_400);
  });

  it("replays and merges an exact two-seat smoke cell", () => {
    const edge = createAttentionV4LandscapeEdges()[0];
    const shard = runAttentionV4LandscapeShard({ edges: [edge], pressures: [0], replayModulo: 1 });
    const report = mergeAttentionV4LandscapeShards([shard]);

    expect(report.evidenceClass).toBe("descriptive-exploration");
    expect(report.causalClaim).toBe(false);
    expect(report.design.physicalMatches).toBe(2);
    expect(report.seat.exactReversalPairs).toBe(1);
    expect(report.design.replaySentinels).toBe(1);
    expect(report.integrity.replayMismatches).toBe(0);
    expect(report.integrity.streamMismatches).toBe(0);
    expect(report.integrity.attributionMismatches).toBe(0);
    expect(report.balance.scoutCondense.plan2).toBeGreaterThan(0);
    expect(report.balance.backlog.observations).toBeGreaterThan(0);
    expect(report.design.complete).toBe(false);
    expect(report.integrity.passed).toBe(false);
  });
});
