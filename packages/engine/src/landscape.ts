import type {
  BattleCoordinateV1,
  BattleVolumeProjectionV1,
  BattleVolumeRefV1,
  StrategicBattleSummaryV1,
  StrategicBoundsV1,
  StrategicChunkAddressV1,
  StrategicChunkLocalCoordinateV1,
  StrategicCoordinateV1,
  StrategicViewportLodV1,
  StrategicViewportProjectionV1,
  WorldDescriptorV1
} from "@landscape/contracts";
import {
  BATTLE_VOLUME_CELLS,
  BATTLE_VOLUME_EDGE,
  BattleCoordinateV1Schema,
  BattleVolumeProjectionV1Schema,
  STRATEGIC_CHUNK_EDGE,
  STRATEGIC_WORLD_EDGE,
  StrategicChunkAddressV1Schema,
  StrategicChunkLocalCoordinateV1Schema,
  StrategicCoordinateV1Schema,
  StrategicViewportProjectionV1Schema,
  WorldDescriptorV1Schema
} from "@landscape/contracts";

export type CommanderLandscapeFixture = {
  descriptor: WorldDescriptorV1;
  viewport: StrategicViewportProjectionV1;
  battle: (battleId: string, activeLayer?: number) => BattleVolumeProjectionV1;
};

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function hashText(value: string, seed = 0): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return mix32(hash);
}

function unit(value: string, seed: number): number {
  return hashText(value, seed) / 0x1_0000_0000;
}

export function strategicChunkAddress(coordinate: StrategicCoordinateV1): StrategicChunkAddressV1 {
  StrategicCoordinateV1Schema.parse(coordinate);
  return StrategicChunkAddressV1Schema.parse({
    chunkX: Math.floor(coordinate.x / STRATEGIC_CHUNK_EDGE),
    chunkY: Math.floor(coordinate.y / STRATEGIC_CHUNK_EDGE)
  });
}

export function strategicChunkLocalCoordinate(coordinate: StrategicCoordinateV1): StrategicChunkLocalCoordinateV1 {
  StrategicCoordinateV1Schema.parse(coordinate);
  return StrategicChunkLocalCoordinateV1Schema.parse({
    x: coordinate.x % STRATEGIC_CHUNK_EDGE,
    y: coordinate.y % STRATEGIC_CHUNK_EDGE
  });
}

export function strategicCoordinateFromChunk(
  chunk: StrategicChunkAddressV1,
  local: StrategicChunkLocalCoordinateV1
): StrategicCoordinateV1 {
  StrategicChunkAddressV1Schema.parse(chunk);
  StrategicChunkLocalCoordinateV1Schema.parse(local);
  return StrategicCoordinateV1Schema.parse({
    x: chunk.chunkX * STRATEGIC_CHUNK_EDGE + local.x,
    y: chunk.chunkY * STRATEGIC_CHUNK_EDGE + local.y
  });
}

export function battleCoordinateIndex(coordinate: BattleCoordinateV1): number {
  BattleCoordinateV1Schema.parse(coordinate);
  return coordinate.x + BATTLE_VOLUME_EDGE * (coordinate.y + BATTLE_VOLUME_EDGE * coordinate.z);
}

export function battleCoordinateFromIndex(index: number): BattleCoordinateV1 {
  if (!Number.isInteger(index) || index < 0 || index >= BATTLE_VOLUME_CELLS) {
    throw new RangeError(`Battle coordinate index must be an integer in [0, ${BATTLE_VOLUME_CELLS})`);
  }
  const z = Math.floor(index / (BATTLE_VOLUME_EDGE * BATTLE_VOLUME_EDGE));
  const remainder = index % (BATTLE_VOLUME_EDGE * BATTLE_VOLUME_EDGE);
  const y = Math.floor(remainder / BATTLE_VOLUME_EDGE);
  const x = remainder % BATTLE_VOLUME_EDGE;
  return BattleCoordinateV1Schema.parse({ x, y, z });
}

export function landscapeAddressKey(
  worldId: string,
  anchor: StrategicCoordinateV1,
  battleId?: string,
  local?: BattleCoordinateV1
): string {
  StrategicCoordinateV1Schema.parse(anchor);
  if (!battleId && !local) return `${worldId}:s:${anchor.x},${anchor.y}`;
  if (!battleId || !local) throw new TypeError("battleId and local coordinate must be provided together");
  BattleCoordinateV1Schema.parse(local);
  return `${worldId}:s:${anchor.x},${anchor.y}:b:${battleId}:${local.x},${local.y},${local.z}`;
}

export function createWorldDescriptor(worldId: string, revision: string): WorldDescriptorV1 {
  return WorldDescriptorV1Schema.parse({
    schemaVersion: 1,
    worldId,
    revision,
    strategicDimensions: { width: STRATEGIC_WORLD_EDGE, height: STRATEGIC_WORLD_EDGE },
    chunkDimensions: { width: STRATEGIC_CHUNK_EDGE, height: STRATEGIC_CHUNK_EDGE },
    battleDimensions: { width: BATTLE_VOLUME_EDGE, height: BATTLE_VOLUME_EDGE, depth: BATTLE_VOLUME_EDGE }
  });
}

function inside(bounds: StrategicBoundsV1, coordinate: StrategicCoordinateV1): boolean {
  return coordinate.x >= bounds.minX && coordinate.x < bounds.maxX && coordinate.y >= bounds.minY && coordinate.y < bounds.maxY;
}

function battleRef(worldId: string, battleId: string, anchor: StrategicCoordinateV1): BattleVolumeRefV1 {
  return {
    schemaVersion: 1,
    worldId,
    battleId,
    anchor,
    dimensions: { width: BATTLE_VOLUME_EDGE, height: BATTLE_VOLUME_EDGE, depth: BATTLE_VOLUME_EDGE }
  };
}

function generatedBattles(worldId: string, seed: number, count: number): StrategicBattleSummaryV1[] {
  return Array.from({ length: count }, (_, index) => {
    const battleId = `battle-${String(index + 1).padStart(4, "0")}`;
    const x = Math.floor(unit(`${battleId}:x`, seed) * STRATEGIC_WORLD_EDGE);
    const frontWave = 3_200 + Math.sin(x / 430) * 850;
    const yNoise = (unit(`${battleId}:y`, seed) - 0.5) * 1_600;
    const y = Math.max(0, Math.min(STRATEGIC_WORLD_EDGE - 1, Math.round(frontWave + yNoise)));
    const intensity = 0.2 + unit(`${battleId}:intensity`, seed) * 0.8;
    const uncertainty = 0.08 + unit(`${battleId}:uncertainty`, seed) * 0.82;
    const friendlyStrength = 20 + Math.round(unit(`${battleId}:friendly`, seed) * 80);
    const enemyMidpoint = 20 + Math.round(unit(`${battleId}:enemy`, seed) * 90);
    const enemySpread = Math.round(uncertainty * 25);
    const lowerLayer = Math.floor(unit(`${battleId}:layer`, seed) * 18);
    const layerSpan = 3 + Math.floor(unit(`${battleId}:span`, seed) * 11);
    return {
      battle: battleRef(worldId, battleId, { x, y }),
      status: intensity > 0.72 ? "active" : intensity > 0.42 ? "forming" : "stable",
      control: unit(`${battleId}:control`, seed) > 0.68 ? "enemy" : intensity > 0.62 ? "contested" : "friendly",
      intensity,
      attentionDemand: 1 + Math.round(intensity * 8),
      attentionAllocated: Math.round(unit(`${battleId}:allocated`, seed) * 7),
      friendlyStrength,
      enemyStrength: {
        minimum: Math.max(0, enemyMidpoint - enemySpread),
        maximum: enemyMidpoint + enemySpread
      },
      uncertainty,
      activeLayers: [lowerLayer, Math.min(BATTLE_VOLUME_EDGE - 1, lowerLayer + layerSpan)],
      lastObservedTick: 96 + Math.floor(unit(`${battleId}:observed`, seed) * 5)
    } satisfies StrategicBattleSummaryV1;
  }).sort((left, right) => left.battle.battleId.localeCompare(right.battle.battleId));
}

function createBattleProjection(summary: StrategicBattleSummaryV1, revision: string, seed: number, activeLayer?: number): BattleVolumeProjectionV1 {
  const centerLayer = Math.round((summary.activeLayers[0] + summary.activeLayers[1]) / 2);
  const requestedLayer = activeLayer ?? centerLayer;
  const z = Math.max(0, Math.min(BATTLE_VOLUME_EDGE - 1, requestedLayer));
  const activeLayerSpan = summary.activeLayers[1] - summary.activeLayers[0] + 1;
  const stableActiveLayer = (label: string): number =>
    summary.activeLayers[0] + Math.floor(unit(label, seed) * activeLayerSpan);
  const layers = Array.from({ length: BATTLE_VOLUME_EDGE }, (_, layer) => {
    const distance = Math.min(1, Math.abs(layer - centerLayer) / 10);
    const intensity = Math.max(0.03, summary.intensity * (1 - distance * 0.82));
    const friendlyStrength = Math.round(summary.friendlyStrength * intensity);
    const enemyMidpoint = (summary.enemyStrength.minimum + summary.enemyStrength.maximum) / 2;
    const uncertaintySpread = (summary.enemyStrength.maximum - summary.enemyStrength.minimum) / 2;
    return {
      z: layer,
      friendlyStrength,
      enemyStrength: {
        minimum: Math.max(0, Math.round(enemyMidpoint * intensity - uncertaintySpread)),
        maximum: Math.max(0, Math.round(enemyMidpoint * intensity + uncertaintySpread))
      },
      uncertainty: summary.uncertainty,
      artifactCount: Math.round(intensity * 18),
      intensity
    };
  });
  const friendlyCount = 9;
  const contactCount = 11;
  const entities = [
    ...Array.from({ length: friendlyCount }, (_, index) => ({
      kind: "friendly" as const,
      entityId: `${summary.battle.battleId}:friendly:${index}`,
      chassis: (["scout", "line", "siege"] as const)[index % 3],
      position: {
        x: 3 + Math.floor(unit(`friendly:${index}:x`, seed) * 12),
        y: 2 + Math.floor(unit(`friendly:${index}:y`, seed) * 27),
        z: stableActiveLayer(`friendly:${index}:z`)
      },
      strength: 3 + Math.round(unit(`friendly:${index}:strength`, seed) * 9),
      attentionDemand: Math.round(unit(`friendly:${index}:attention`, seed) * 3)
    })),
    ...Array.from({ length: contactCount }, (_, index) => ({
      kind: "contact" as const,
      entityId: `${summary.battle.battleId}:contact:${index}`,
      classification: index % 4 === 0 ? "heavy signal" : "formation",
      estimatedPosition: {
        x: 17 + Math.floor(unit(`contact:${index}:x`, seed) * 12),
        y: 2 + Math.floor(unit(`contact:${index}:y`, seed) * 27),
        z: stableActiveLayer(`contact:${index}:z`)
      },
      uncertaintyRadius: 1 + Math.floor(unit(`contact:${index}:radius`, seed) * 5),
      confidence: 0.2 + unit(`contact:${index}:confidence`, seed) * 0.75,
      observedTick: 98 + Math.floor(unit(`contact:${index}:observed`, seed) * 3)
    }))
  ];
  const artifacts = Array.from({ length: 14 }, (_, index) => ({
    artifactId: `${summary.battle.battleId}:artifact:${index}`,
    position: {
      x: Math.floor(unit(`artifact:${index}:x`, seed) * BATTLE_VOLUME_EDGE),
      y: Math.floor(unit(`artifact:${index}:y`, seed) * BATTLE_VOLUME_EDGE),
      z: stableActiveLayer(`artifact:${index}:z`)
    },
    confidence: 0.08 + unit(`artifact:${index}:confidence`, seed) * 0.88,
    resolution: "pending" as const,
    revealedSound: null
  }));
  return BattleVolumeProjectionV1Schema.parse({
    schemaVersion: 1,
    battle: summary.battle,
    revision,
    tick: 100,
    round: 4,
    phase: "allocate",
    attention: {
      available: 12,
      allocated: summary.attentionAllocated,
      demand: summary.attentionDemand
    },
    activeLayer: z,
    layers,
    entities,
    artifacts,
    effects: [{
      effectId: `${summary.battle.battleId}:front`,
      kind: "front",
      center: { x: 16, y: 16, z: centerLayer },
      width: 3,
      height: BATTLE_VOLUME_EDGE,
      depth: 1,
      remainingTicks: 2
    }]
  });
}

export function createCommanderLandscapeFixture(options: {
  worldId?: string;
  revision?: string;
  seed?: number;
  bounds?: StrategicBoundsV1;
  lod?: StrategicViewportLodV1;
  battleCount?: number;
} = {}): CommanderLandscapeFixture {
  const worldId = options.worldId ?? "commander-landscape-demo";
  const revision = options.revision ?? "fixture-v1";
  const seed = options.seed ?? 6_400_3232;
  const bounds = options.bounds ?? { minX: 0, minY: 0, maxX: STRATEGIC_WORLD_EDGE, maxY: STRATEGIC_WORLD_EDGE };
  const lod = options.lod ?? "theater";
  const descriptor = createWorldDescriptor(worldId, revision);
  const allBattles = generatedBattles(worldId, seed, options.battleCount ?? 160);
  const visibleBattles = allBattles.filter((summary) => inside(bounds, summary.battle.anchor));
  const viewport = StrategicViewportProjectionV1Schema.parse({
    schemaVersion: 1,
    descriptor,
    revision,
    tick: 100,
    bounds,
    lod,
    fronts: [
      {
        frontId: "front-main",
        control: "contested",
        confidence: 0.76,
        uncertaintyRadius: 140,
        points: Array.from({ length: 33 }, (_, index) => ({
          x: Math.min(STRATEGIC_WORLD_EDGE - 1, index * 200),
          y: Math.round(3_200 + Math.sin(index / 2.2) * 760)
        }))
      }
    ],
    contacts: visibleBattles.slice(0, 72).map((summary, index) => ({
      contactId: `contact-${index}`,
      estimatedPosition: summary.battle.anchor,
      uncertaintyRadius: 12 + Math.round(summary.uncertainty * 90),
      confidence: 1 - summary.uncertainty * 0.8,
      observedTick: summary.lastObservedTick,
      classification: index % 5 === 0 ? "logistics" : "formation"
    })),
    battles: visibleBattles,
    fields: visibleBattles.slice(0, 48).map((summary) => ({
      chunk: strategicChunkAddress(summary.battle.anchor),
      metric: "attention-pressure",
      samples: [{ coordinate: strategicChunkLocalCoordinate(summary.battle.anchor), value: summary.intensity }]
    }))
  });
  const summaries = new Map(allBattles.map((summary) => [summary.battle.battleId, summary]));
  return {
    descriptor,
    viewport,
    battle: (battleId, activeLayer) => {
      const summary = summaries.get(battleId);
      if (!summary) throw new RangeError(`Unknown fixture battle ${battleId}`);
      return createBattleProjection(summary, revision, hashText(battleId, seed), activeLayer);
    }
  };
}
