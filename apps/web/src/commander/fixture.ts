import {
  BATTLE_LAYER_COUNT,
  type Allegiance,
  type BattleArtifact,
  type BattleEffect,
  type BattleFixture,
  type BattleLayerSummary,
  type BattleUnit,
  type StrategicBattle,
  type StrategicFixture
} from "./model.js";

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(seed: number, index: number): number {
  let value = seed ^ Math.imul(index + 1, 2246822507);
  value = Math.imul(value ^ (value >>> 16), 3266489909);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}

const battles: StrategicBattle[] = [
  { battleId: "btl-helix-gate", label: "Helix Gate", anchor: { x: 3024, y: 2880 }, status: "active", control: "contested", intensity: 0.94, attentionDemand: 0.82, round: 6 },
  { battleId: "btl-cinder-line", label: "Cinder Line", anchor: { x: 3376, y: 3152 }, status: "active", control: "enemy", intensity: 0.76, attentionDemand: 0.63, round: 4 },
  { battleId: "btl-silent-array", label: "Silent Array", anchor: { x: 3712, y: 3472 }, status: "forming", control: "unknown", intensity: 0.41, attentionDemand: 0.55, round: 1 },
  { battleId: "btl-vermilion-cut", label: "Vermilion Cut", anchor: { x: 4050, y: 3820 }, status: "active", control: "enemy", intensity: 0.88, attentionDemand: 0.91, round: 8 },
  { battleId: "btl-north-relay", label: "North Relay", anchor: { x: 2784, y: 2144 }, status: "resolved", control: "friendly", intensity: 0.22, attentionDemand: 0.18, round: 12 },
  { battleId: "btl-delta-wake", label: "Delta Wake", anchor: { x: 4580, y: 4200 }, status: "forming", control: "contested", intensity: 0.36, attentionDemand: 0.47, round: 2 }
];

export const strategicFixture: StrategicFixture = {
  worldId: "landscape-prototype-v1",
  label: "Orchestration Theater 07",
  revision: 1842,
  fronts: [
    {
      frontId: "front-allied-main",
      allegiance: "friendly",
      confidence: 0.92,
      pressure: 0.68,
      path: Array.from({ length: 17 }, (_, index) => ({
        x: 900 + index * 300,
        y: 1350 + index * 245 + Math.sin(index * 0.9) * 180
      }))
    },
    {
      frontId: "front-opposition-main",
      allegiance: "enemy",
      confidence: 0.71,
      pressure: 0.83,
      path: Array.from({ length: 17 }, (_, index) => ({
        x: 1120 + index * 290,
        y: 1080 + index * 255 + Math.sin(index * 0.9 + 0.7) * 210
      }))
    },
    {
      frontId: "front-allied-north",
      allegiance: "friendly",
      confidence: 0.78,
      pressure: 0.44,
      path: [
        { x: 1750, y: 900 }, { x: 2250, y: 1120 }, { x: 2700, y: 1350 }, { x: 3100, y: 1640 }
      ]
    }
  ],
  battles,
  contacts: [
    { contactId: "ct-01", label: "Scout lattice", allegiance: "friendly", kind: "formation", at: { x: 2400, y: 2550 }, confidence: 0.96, uncertaintyRadius: 24, observedTurnsAgo: 0 },
    { contactId: "ct-02", label: "Heavy signature", allegiance: "enemy", kind: "formation", at: { x: 3520, y: 2720 }, confidence: 0.76, uncertaintyRadius: 110, observedTurnsAgo: 1 },
    { contactId: "ct-03", label: "Unclassified burst", allegiance: "unknown", kind: "signal", at: { x: 4320, y: 3310 }, confidence: 0.38, uncertaintyRadius: 260, observedTurnsAgo: 4 },
    { contactId: "ct-04", label: "Line screen", allegiance: "friendly", kind: "formation", at: { x: 3160, y: 3650 }, confidence: 0.91, uncertaintyRadius: 42, observedTurnsAgo: 0 },
    { contactId: "ct-05", label: "Supply wake", allegiance: "enemy", kind: "logistics", at: { x: 4780, y: 3950 }, confidence: 0.57, uncertaintyRadius: 190, observedTurnsAgo: 3 },
    { contactId: "ct-06", label: "Relay echo", allegiance: "unknown", kind: "signal", at: { x: 2650, y: 1820 }, confidence: 0.46, uncertaintyRadius: 150, observedTurnsAgo: 2 },
    { contactId: "ct-07", label: "Siege column", allegiance: "enemy", kind: "formation", at: { x: 3940, y: 4070 }, confidence: 0.83, uncertaintyRadius: 78, observedTurnsAgo: 1 },
    { contactId: "ct-08", label: "Recon picket", allegiance: "friendly", kind: "formation", at: { x: 4480, y: 4540 }, confidence: 0.88, uncertaintyRadius: 55, observedTurnsAgo: 0 }
  ],
  attention: [
    { hotspotId: "attn-helix", center: { x: 3050, y: 2920 }, radius: 720, pressure: 0.92 },
    { hotspotId: "attn-cut", center: { x: 4070, y: 3840 }, radius: 620, pressure: 0.84 },
    { hotspotId: "attn-north", center: { x: 2600, y: 1950 }, radius: 480, pressure: 0.48 }
  ]
};

function buildUnits(battle: StrategicBattle, seed: number): BattleUnit[] {
  const units: BattleUnit[] = [];
  for (const [sideIndex, allegiance] of (["friendly", "enemy"] as const).entries()) {
    for (let index = 0; index < 12; index += 1) {
      const chassis = (["scout", "line", "line", "siege"] as const)[index % 4];
      const direction = allegiance === "friendly" ? 1 : -1;
      const baseX = allegiance === "friendly" ? 4 : 27;
      const x = Math.max(0, Math.min(31, Math.round(baseX + direction * deterministicUnit(seed + sideIndex, index) * 9)));
      const y = Math.max(0, Math.min(31, Math.round(3 + deterministicUnit(seed + 7 + sideIndex, index) * 25)));
      const z = Math.max(0, Math.min(31, Math.round(deterministicUnit(seed + 17 + sideIndex, index) * 15 + (index % 3) * 4)));
      units.push({
        unitId: `${battle.battleId}:${allegiance}:${String(index + 1).padStart(2, "0")}`,
        label: `${allegiance === "friendly" ? "A" : "O"}-${String(index + 1).padStart(2, "0")}`,
        allegiance,
        chassis,
        at: { x, y, z },
      attentionCost: chassis === "scout" ? 1 : chassis === "line" ? 2 : 3,
        confidence: Number((0.35 + deterministicUnit(seed + 31 + sideIndex, index) * 0.62).toFixed(2)),
        stationary: deterministicUnit(seed + 47 + sideIndex, index) > 0.58
      });
    }
  }
  return units;
}

function buildArtifacts(units: BattleUnit[], seed: number): BattleArtifact[] {
  return units.flatMap((unit, unitIndex) => {
    const count = unit.chassis === "scout" ? 2 : 1;
    return Array.from({ length: count }, (_, index) => {
      const confidence = Number((0.12 + deterministicUnit(seed + unitIndex, index) * 0.84).toFixed(2));
      const revealed = (unitIndex + index) % 7 === 0;
      return {
        artifactId: `${unit.unitId}:artifact:${index + 1}`,
        owner: unit.allegiance,
        sourceUnitId: unit.unitId,
        at: { ...unit.at },
        confidence,
        revealedSound: revealed ? confidence >= 0.5 : null,
        guarantee: unitIndex % 11 === 0 ? "target-lock" as const : null
      };
    });
  });
}

function buildLayerSummaries(units: BattleUnit[], artifacts: BattleArtifact[], effects: BattleEffect[]): BattleLayerSummary[] {
  return Array.from({ length: BATTLE_LAYER_COUNT }, (_, z) => ({
    z,
    friendly: units.filter((unit) => unit.at.z === z && unit.allegiance === "friendly").length,
    enemy: units.filter((unit) => unit.at.z === z && unit.allegiance === "enemy").length,
    artifacts: artifacts.filter((artifact) => artifact.at.z === z).length,
    activity: Math.min(1, effects
      .filter((effect) => z >= effect.min.z && z <= effect.max.z)
      .reduce((sum, effect) => sum + (effect.strength ?? 0) * 0.45, 0)),
    measure: "entity-count",
    activityKind: "pressure"
  }));
}

export function createBattleFixture(battle: StrategicBattle): BattleFixture {
  const seed = hashText(battle.battleId);
  const units = buildUnits(battle, seed);
  const artifacts = buildArtifacts(units, seed ^ 0x9e3779b9);
  const effects: BattleEffect[] = [
    { effectId: `${battle.battleId}:front`, kind: "front", allegiance: "unknown", min: { x: 13, y: 0, z: 0 }, max: { x: 18, y: 31, z: 31 }, strength: 0.66 },
    { effectId: `${battle.battleId}:flare`, kind: "macro-flare", allegiance: "enemy", min: { x: 9, y: 13, z: 8 }, max: { x: 11, y: 15, z: 12 }, strength: 0.92 },
    { effectId: `${battle.battleId}:uncertain`, kind: "uncertainty", allegiance: "unknown", min: { x: 20, y: 4, z: 17 }, max: { x: 27, y: 11, z: 22 }, strength: 0.58 }
  ];
  return {
    battle,
    viewerPlayerId: "commander-alpha",
    round: battle.round ?? 0,
    phase: battle.status === "forming" ? "movement" : "command",
    attention: Math.max(0, 4 - Math.round(battle.attentionDemand * 2)),
    attentionCapacity: 5,
    progress: Math.round(battle.intensity * 9),
    drift: Math.round(battle.attentionDemand * 3),
    units,
    artifacts,
    effects,
    layers: buildLayerSummaries(units, artifacts, effects)
  };
}

export function allegianceLabel(allegiance: Allegiance): string {
  return allegiance === "friendly" ? "Friendly" : allegiance === "enemy" ? "Opposition" : "Uncertain";
}
