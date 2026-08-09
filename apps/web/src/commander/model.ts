export const STRATEGIC_WORLD_SIZE = 6_400;
export const STRATEGIC_CHUNK_SIZE = 32;
export const STRATEGIC_CHUNKS_PER_AXIS = STRATEGIC_WORLD_SIZE / STRATEGIC_CHUNK_SIZE;
export const BATTLE_AXIS_SIZE = 32;
export const BATTLE_LAYER_COUNT = 32;

export type StrategicPoint = { x: number; y: number };
export type BattlePoint = { x: number; y: number; z: number };
export type Allegiance = "friendly" | "enemy" | "unknown";
export type StrategicLod = "theater" | "sector" | "cell";

export type StrategicCamera = {
  center: StrategicPoint;
  zoom: number;
};

export type StrategicFront = {
  frontId: string;
  allegiance: Allegiance;
  control?: Allegiance | "contested";
  confidence: number;
  pressure?: number;
  uncertaintyRadius?: number;
  path: StrategicPoint[];
};

export type StrategicContact = {
  contactId: string;
  label: string;
  allegiance: Allegiance;
  kind: "formation" | "signal" | "logistics" | "unknown";
  at: StrategicPoint;
  confidence: number;
  uncertaintyRadius: number;
  observedTurnsAgo: number;
};

export type StrategicBattle = {
  battleId: string;
  label: string;
  anchor: StrategicPoint;
  status: "forming" | "active" | "stable" | "resolved";
  control?: Allegiance | "contested";
  intensity: number;
  attentionDemand: number;
  attentionDemandKind?: "fraction" | "points";
  round?: number;
  observedTick?: number;
  friendlyStrength?: number;
  enemyStrength?: { minimum: number; maximum: number };
  uncertainty?: number;
  lastObservedTick?: number;
  activeLayers?: [number, number];
};

export type AttentionHotspot = {
  hotspotId: string;
  center: StrategicPoint;
  radius: number;
  pressure: number;
};

export type StrategicFixture = {
  worldId: string;
  label: string;
  revision: string | number;
  fronts: StrategicFront[];
  contacts: StrategicContact[];
  battles: StrategicBattle[];
  attention: AttentionHotspot[];
};

export type BattleUnit = {
  unitId: string;
  label: string;
  allegiance: Allegiance;
  chassis: "scout" | "line" | "siege";
  at: BattlePoint;
  attentionCost?: number;
  confidence: number;
  stationary: boolean | null;
  strength?: number;
  uncertaintyRadius?: number;
  observedTick?: number;
  classification?: string;
};

export type BattleArtifact = {
  artifactId: string;
  owner: Allegiance;
  sourceUnitId?: string;
  at: BattlePoint;
  confidence: number;
  revealedSound: boolean | null;
  guarantee?: "target-lock" | "perfect-focus" | null;
  resolution?: "pending" | "accepted" | "rejected" | "seized";
};

export type BattleEffect = {
  effectId: string;
  kind: "front" | "macro-flare" | "attention-field" | "uncertainty-field" | "uncertainty";
  allegiance: Allegiance;
  min: BattlePoint;
  max: BattlePoint;
  strength?: number;
  remainingTicks?: number;
};

export type BattleLayerSummary = {
  z: number;
  friendly: number;
  enemy: number;
  enemyMinimum?: number;
  enemyMaximum?: number;
  artifacts: number;
  activity: number;
  measure: "entity-count" | "strength";
  activityKind: "pressure" | "intensity";
  uncertainty?: number;
};

export type BattleFixture = {
  battle: StrategicBattle;
  viewerPlayerId: string;
  round: number;
  phase: "movement" | "capacity" | "command" | "observe" | "allocate" | "delegate" | "resolve" | "complete";
  attention: number;
  attentionCapacity: number;
  attentionAllocated?: number;
  attentionDemand?: number;
  progress?: number;
  drift?: number;
  units: BattleUnit[];
  artifacts: BattleArtifact[];
  effects: BattleEffect[];
  layers: BattleLayerSummary[];
};

export type StrategicSelection =
  | { kind: "battle"; battleId: string }
  | { kind: "contact"; contactId: string }
  | { kind: "terrain"; at: StrategicPoint };

export type BattleSelection =
  | { kind: "unit"; unitId: string }
  | { kind: "artifact"; artifactId: string }
  | { kind: "cell"; at: BattlePoint };
