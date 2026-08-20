import { ATTENTION_V4_COMPOSITION_MODULES } from "@landscape/contracts";
import { attentionV4ContentHash, createAttentionV4CommanderCatalog } from "@landscape/engine";
import {
  ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS,
  createAttentionV4LandscapeEdges,
  type AttentionV4LandscapeEdge,
  type AttentionV4LandscapeMergeOptions
} from "./attention-v4-landscape.js";

export const ATTENTION_V4_REGULAR_DEGREE = 88 as const;
export const ATTENTION_V4_REGULAR_SCHEDULE_ROUNDS = 88 as const;
export const ATTENTION_V4_REGULAR_NON_SELF_EDGES = 140_800 as const;
export const ATTENTION_V4_REGULAR_SELF_PLAY_EDGES = 3_200 as const;
export const ATTENTION_V4_REGULAR_MATCHES = 2_278_400 as const;
export const ATTENTION_V4_MATRIX_MAPPINGS_PER_CELL = 4 as const;
export const ATTENTION_V4_MATRIX_FLEET_CELLS = 15 as const;
export const ATTENTION_V4_MATRIX_EDGES_PER_CELL = 2_560 as const;
export const ATTENTION_V4_MATRIX_NON_SELF_EDGES = 38_400 as const;
export const ATTENTION_V4_MATRIX_MATCHES = 614_400 as const;

type CompositionModule = typeof ATTENTION_V4_COMPOSITION_MODULES[number];

function fleetCell(left: CompositionModule, right: CompositionModule): string {
  return `${left}__${right}`;
}

function orientPair(leftOrdinal: number, rightOrdinal: number, compositions: readonly CompositionModule[]): {
  leftOrdinal: number;
  rightOrdinal: number;
  fleetCell: string;
} {
  const leftComposition = compositions[leftOrdinal];
  const rightComposition = compositions[rightOrdinal];
  const leftIndex = ATTENTION_V4_COMPOSITION_MODULES.indexOf(leftComposition);
  const rightIndex = ATTENTION_V4_COMPOSITION_MODULES.indexOf(rightComposition);
  if (leftIndex < rightIndex || (leftIndex === rightIndex && leftOrdinal < rightOrdinal)) {
    return { leftOrdinal, rightOrdinal, fleetCell: fleetCell(leftComposition, rightComposition) };
  }
  return { leftOrdinal: rightOrdinal, rightOrdinal: leftOrdinal, fleetCell: fleetCell(rightComposition, leftComposition) };
}

function hashOrderedIntegers(input: {
  schema: string;
  salt: string;
  minimum: number;
  maximumExclusive: number;
  count: number;
}): number[] {
  const values = Array.from({ length: input.maximumExclusive - input.minimum }, (_, index) => index + input.minimum);
  return values.sort((left, right) => {
    const leftHash = attentionV4ContentHash({ schema: input.schema, salt: input.salt, value: left });
    const rightHash = attentionV4ContentHash({ schema: input.schema, salt: input.salt, value: right });
    return leftHash.localeCompare(rightHash) || left - right;
  }).slice(0, input.count);
}

function assertUniquePairs(edges: AttentionV4LandscapeEdge[], expected: number): void {
  const matchups = edges.filter((edge) => edge.kind === "matchup");
  const pairs = new Set(matchups.map((edge) => [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":")));
  if (matchups.length !== expected || pairs.size !== expected) throw new Error("attention-v4 deep design contains duplicate or missing pairs");
}

export function createAttentionV4RegularTopologyEdges(): AttentionV4LandscapeEdge[] {
  const catalog = createAttentionV4CommanderCatalog();
  const compositions = catalog.profiles.map((profile) => profile.compositionModule);
  const count = catalog.profiles.length;
  if (count !== 3_200 || count % 2 !== 0) throw new Error("attention-v4 regular topology requires the frozen 3,200-profile catalog");
  const permutation = catalog.profiles.map((profile, ordinal) => ({
    ordinal,
    key: attentionV4ContentHash({ schema: "attention-v4.2-regular-profile-order-1", profileHash: profile.profileHash })
  })).sort((left, right) => left.key.localeCompare(right.key) || left.ordinal - right.ordinal).map((item) => item.ordinal);
  const selectedRounds = hashOrderedIntegers({
    schema: "attention-v4.2-regular-round-order-1",
    salt: catalog.catalogHash,
    minimum: 0,
    maximumExclusive: count - 1,
    count: ATTENTION_V4_REGULAR_SCHEDULE_ROUNDS
  });
  const fixed = permutation[count - 1];
  const ring = permutation.slice(0, count - 1);
  const edges: AttentionV4LandscapeEdge[] = [];
  for (const round of selectedRounds) {
    const rawPairs: Array<[number, number]> = [[fixed, ring[round]]];
    for (let offset = 1; offset < count / 2; offset += 1) {
      rawPairs.push([ring[(round + offset) % ring.length], ring[(round - offset + ring.length) % ring.length]]);
    }
    for (let pairIndex = 0; pairIndex < rawPairs.length; pairIndex += 1) {
      const oriented = orientPair(rawPairs[pairIndex][0], rawPairs[pairIndex][1], compositions);
      edges.push({
        edgeIndex: edges.length,
        edgeId: `regular:r${round}:p${pairIndex}:${oriented.leftOrdinal}:${oriented.rightOrdinal}`,
        kind: "matchup",
        stratum: "uniform",
        offset: round + 1,
        leftOrdinal: oriented.leftOrdinal,
        rightOrdinal: oriented.rightOrdinal,
        designRound: round,
        fleetCell: oriented.fleetCell
      });
    }
  }
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    edges.push({
      edgeIndex: edges.length,
      edgeId: `regular:self:${ordinal}`,
      kind: "self-play",
      stratum: "self-play",
      offset: 0,
      leftOrdinal: ordinal,
      rightOrdinal: ordinal
    });
  }
  assertUniquePairs(edges, ATTENTION_V4_REGULAR_NON_SELF_EDGES);
  if (edges.length !== ATTENTION_V4_REGULAR_NON_SELF_EDGES + ATTENTION_V4_REGULAR_SELF_PLAY_EDGES) {
    throw new Error("attention-v4 regular topology edge count drifted");
  }
  return edges;
}

export function createAttentionV4FleetMatrixEdges(): AttentionV4LandscapeEdge[] {
  const catalog = createAttentionV4CommanderCatalog();
  const compositions = catalog.profiles.map((profile) => profile.compositionModule);
  const policiesPerComposition = catalog.profiles.length / ATTENTION_V4_COMPOSITION_MODULES.length;
  if (policiesPerComposition !== 640) throw new Error("attention-v4 fleet matrix requires 640 policy tuples per composition");
  const edges: AttentionV4LandscapeEdge[] = [];
  for (let leftCompositionIndex = 0; leftCompositionIndex < ATTENTION_V4_COMPOSITION_MODULES.length; leftCompositionIndex += 1) {
    for (let rightCompositionIndex = leftCompositionIndex; rightCompositionIndex < ATTENTION_V4_COMPOSITION_MODULES.length; rightCompositionIndex += 1) {
      const leftComposition = ATTENTION_V4_COMPOSITION_MODULES[leftCompositionIndex];
      const rightComposition = ATTENTION_V4_COMPOSITION_MODULES[rightCompositionIndex];
      const cellId = fleetCell(leftComposition, rightComposition);
      const sameComposition = leftCompositionIndex === rightCompositionIndex;
      const shifts = hashOrderedIntegers({
        schema: sameComposition ? "attention-v4.2-matrix-diagonal-shifts-1" : "attention-v4.2-matrix-cross-shifts-1",
        salt: `${catalog.catalogHash}:${cellId}`,
        minimum: sameComposition ? 1 : 0,
        maximumExclusive: sameComposition ? policiesPerComposition / 2 : policiesPerComposition,
        count: ATTENTION_V4_MATRIX_MAPPINGS_PER_CELL
      });
      for (let mapping = 0; mapping < shifts.length; mapping += 1) {
        const shift = shifts[mapping];
        for (let policy = 0; policy < policiesPerComposition; policy += 1) {
          const rawLeft = leftCompositionIndex * policiesPerComposition + policy;
          const rawRight = rightCompositionIndex * policiesPerComposition + (policy + shift) % policiesPerComposition;
          const oriented = orientPair(rawLeft, rawRight, compositions);
          edges.push({
            edgeIndex: edges.length,
            edgeId: `matrix:${cellId}:m${mapping}:p${policy}:${oriented.leftOrdinal}:${oriented.rightOrdinal}`,
            kind: "matchup",
            stratum: "uniform",
            offset: shift,
            leftOrdinal: oriented.leftOrdinal,
            rightOrdinal: oriented.rightOrdinal,
            designRound: mapping,
            fleetCell: cellId
          });
        }
      }
    }
  }
  assertUniquePairs(edges, ATTENTION_V4_MATRIX_NON_SELF_EDGES);
  if (edges.length !== ATTENTION_V4_MATRIX_NON_SELF_EDGES) throw new Error("attention-v4 fleet matrix edge count drifted");
  return edges;
}

export function attentionV4ReferenceOverlap(edges: AttentionV4LandscapeEdge[]): number {
  const reference = new Set(createAttentionV4LandscapeEdges(ATTENTION_V4_EXPANDED_TOPOLOGY_OFFSETS)
    .filter((edge) => edge.kind === "matchup")
    .map((edge) => [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":")));
  return edges.filter((edge) => edge.kind === "matchup" && reference.has(
    [edge.leftOrdinal, edge.rightOrdinal].sort((left, right) => left - right).join(":"))).length;
}

export function attentionV4DeepDesign(
  kind: "regular-topology" | "fleet-matrix",
  edges: AttentionV4LandscapeEdge[]
): NonNullable<AttentionV4LandscapeMergeOptions["deepDesign"]> {
  return {
    kind,
    degree: kind === "regular-topology" ? ATTENTION_V4_REGULAR_DEGREE : 24,
    scheduleRounds: kind === "regular-topology" ? ATTENTION_V4_REGULAR_SCHEDULE_ROUNDS : ATTENTION_V4_MATRIX_MAPPINGS_PER_CELL,
    fleetCells: ATTENTION_V4_MATRIX_FLEET_CELLS,
    referenceOverlapEdges: attentionV4ReferenceOverlap(edges)
  };
}
