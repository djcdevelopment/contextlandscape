import {
  BattleVolumeProjectionV1Schema,
  StrategicViewportProjectionV1Schema,
  WorldDescriptorV1Schema,
  type BattleVolumeProjectionV1,
  type StrategicViewportProjectionV1,
  type WorldDescriptorV1
} from "@landscape/contracts";
import { clampBattleAxis } from "./coordinates.js";
import {
  STRATEGIC_CHUNK_SIZE,
  STRATEGIC_WORLD_SIZE,
  type Allegiance,
  type BattleEffect,
  type BattleFixture,
  type BattleUnit,
  type StrategicBattle,
  type StrategicFixture
} from "./model.js";

export const COMMANDER_WORLD_ID = "commander-landscape-demo";

async function responseJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<unknown>;
}

function identifierLabel(identifier: string): string {
  const withoutPrefix = identifier.replace(/^(?:btl|battle)-/, "");
  const words = withoutPrefix.split(/[-_]+/).filter(Boolean);
  if (words.length === 1 && /^\d+$/.test(words[0] ?? "")) return `Battle ${words[0]}`;
  return words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(" ") || identifier;
}

function controlAllegiance(control: "friendly" | "enemy" | "contested" | "unknown"): Allegiance {
  return control === "friendly" || control === "enemy" ? control : "unknown";
}

export function adaptStrategicProjection(
  descriptor: WorldDescriptorV1,
  projection: StrategicViewportProjectionV1
): StrategicFixture {
  if (descriptor.worldId !== projection.descriptor.worldId || descriptor.revision !== projection.revision) {
    throw new Error("Landscape descriptor and viewport revision do not match");
  }
  return {
    worldId: descriptor.worldId,
    label: identifierLabel(descriptor.worldId),
    revision: projection.revision,
    fronts: projection.fronts.map((front) => ({
      frontId: front.frontId,
      allegiance: controlAllegiance(front.control),
      control: front.control,
      confidence: front.confidence,
      uncertaintyRadius: front.uncertaintyRadius,
      path: front.points
    })),
    contacts: projection.contacts.map((contact) => ({
      contactId: contact.contactId,
      label: identifierLabel(`${contact.classification}-${contact.contactId.replace(/^contact-/, "")}`),
      allegiance: "unknown",
      kind: contact.classification,
      at: contact.estimatedPosition,
      confidence: contact.confidence,
      uncertaintyRadius: contact.uncertaintyRadius,
      observedTurnsAgo: Math.max(0, projection.tick - contact.observedTick)
    })),
    battles: projection.battles.map((summary) => ({
      battleId: summary.battle.battleId,
      label: identifierLabel(summary.battle.battleId),
      anchor: summary.battle.anchor,
      status: summary.status,
      control: summary.control,
      intensity: summary.intensity,
      attentionDemand: summary.attentionDemand,
      attentionDemandKind: "points",
      observedTick: projection.tick,
      friendlyStrength: summary.friendlyStrength,
      enemyStrength: summary.enemyStrength,
      uncertainty: summary.uncertainty,
      lastObservedTick: summary.lastObservedTick,
      activeLayers: summary.activeLayers
    })),
    attention: projection.fields.filter((field) => field.metric === "attention-pressure").flatMap((field, fieldIndex) => field.samples.map((sample, sampleIndex) => ({
      hotspotId: `${field.metric}:${field.chunk.chunkX},${field.chunk.chunkY}:${fieldIndex}:${sampleIndex}`,
      center: {
        x: field.chunk.chunkX * STRATEGIC_CHUNK_SIZE + sample.coordinate.x,
        y: field.chunk.chunkY * STRATEGIC_CHUNK_SIZE + sample.coordinate.y
      },
      radius: field.metric === "attention-pressure" ? 180 : 96,
      pressure: sample.value
    })))
  };
}

export async function loadStrategicFixture(signal?: AbortSignal): Promise<StrategicFixture> {
  const query = new URLSearchParams({
    minX: "0",
    minY: "0",
    maxX: String(STRATEGIC_WORLD_SIZE),
    maxY: String(STRATEGIC_WORLD_SIZE),
    lod: "theater"
  });
  const worldPath = `/api/landscapes/${encodeURIComponent(COMMANDER_WORLD_ID)}`;
  const [descriptorJson, projectionJson] = await Promise.all([
    responseJson(worldPath, signal),
    responseJson(`${worldPath}/viewport?${query}`, signal)
  ]);
  return adaptStrategicProjection(
    WorldDescriptorV1Schema.parse(descriptorJson),
    StrategicViewportProjectionV1Schema.parse(projectionJson)
  );
}

function normalizeChassis(value: string): BattleUnit["chassis"] {
  return value === "scout" || value === "siege" ? value : "line";
}

function effectBounds(effect: BattleVolumeProjectionV1["effects"][number]): Pick<BattleEffect, "min" | "max"> {
  const min = {
    x: clampBattleAxis(effect.center.x - Math.floor(effect.width / 2)),
    y: clampBattleAxis(effect.center.y - Math.floor(effect.height / 2)),
    z: clampBattleAxis(effect.center.z - Math.floor(effect.depth / 2))
  };
  return {
    min,
    max: {
      x: clampBattleAxis(min.x + effect.width - 1),
      y: clampBattleAxis(min.y + effect.height - 1),
      z: clampBattleAxis(min.z + effect.depth - 1)
    }
  };
}

export function adaptBattleProjection(
  projection: BattleVolumeProjectionV1,
  summary?: StrategicBattle
): BattleFixture {
  const units: BattleUnit[] = projection.entities.map((entity) => entity.kind === "friendly" ? {
    unitId: entity.entityId,
    label: identifierLabel(entity.entityId.split(":").at(-1) ?? entity.entityId),
    allegiance: "friendly",
    chassis: normalizeChassis(entity.chassis),
    at: entity.position,
    attentionCost: entity.attentionDemand,
    confidence: 1,
    stationary: null,
    strength: entity.strength
  } : {
    unitId: entity.entityId,
    label: identifierLabel(entity.classification),
    allegiance: "unknown",
    chassis: normalizeChassis(entity.classification.includes("heavy") ? "siege" : "line"),
    at: entity.estimatedPosition,
    confidence: entity.confidence,
    stationary: null,
    uncertaintyRadius: entity.uncertaintyRadius,
    observedTick: entity.observedTick,
    classification: entity.classification
  });
  const peakIntensity = Math.max(...projection.layers.map((value) => value.intensity), 0);
  const battle: StrategicBattle = {
    battleId: projection.battle.battleId,
    label: summary?.label ?? identifierLabel(projection.battle.battleId),
    anchor: projection.battle.anchor,
    status: summary?.status ?? "active",
    control: summary?.control ?? "contested",
    intensity: summary?.intensity ?? peakIntensity,
    attentionDemand: summary?.attentionDemand ?? projection.attention.demand,
    attentionDemandKind: summary?.attentionDemandKind ?? "points",
    round: projection.round,
    activeLayers: summary?.activeLayers
  };
  return {
    battle,
    viewerPlayerId: "commander-projection",
    round: projection.round,
    phase: projection.phase,
    attention: projection.attention.available,
    attentionCapacity: Math.max(1, Math.ceil(Math.max(
      projection.attention.available + projection.attention.allocated,
      projection.attention.demand
    ))),
    attentionAllocated: projection.attention.allocated,
    attentionDemand: projection.attention.demand,
    units,
    artifacts: projection.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      owner: "unknown",
      at: artifact.position,
      confidence: artifact.confidence,
      revealedSound: artifact.revealedSound,
      resolution: artifact.resolution
    })),
    effects: projection.effects.map((effect) => ({
      effectId: effect.effectId,
      kind: effect.kind,
      allegiance: effect.kind === "macro-flare" ? "enemy" : "unknown",
      ...effectBounds(effect),
      remainingTicks: effect.remainingTicks
    })),
    layers: projection.layers.map((value) => ({
      z: value.z,
      friendly: value.friendlyStrength,
      enemy: (value.enemyStrength.minimum + value.enemyStrength.maximum) / 2,
      enemyMinimum: value.enemyStrength.minimum,
      enemyMaximum: value.enemyStrength.maximum,
      artifacts: value.artifactCount,
      activity: value.intensity,
      measure: "strength",
      activityKind: "intensity",
      uncertainty: value.uncertainty
    }))
  };
}

export async function loadBattleFixture(
  battleId: string,
  layer: number,
  summary?: StrategicBattle,
  signal?: AbortSignal
): Promise<BattleFixture> {
  const payload = await responseJson(
    `/api/landscapes/${encodeURIComponent(COMMANDER_WORLD_ID)}/battles/${encodeURIComponent(battleId)}/projection?z=${clampBattleAxis(layer)}`,
    signal
  );
  return adaptBattleProjection(BattleVolumeProjectionV1Schema.parse(payload), summary);
}
