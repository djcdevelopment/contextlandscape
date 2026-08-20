import type {
  EventEnvelope,
  FireMode,
  MatchProjection,
  MatchState,
  Order,
  Reconstruction,
  ReplayManifest,
  RulesTuning,
  RulesTuningInput,
  UnitState
} from "@landscape/contracts";
import { RulesTuningSchema, ScenarioDefinitionSchema } from "@landscape/contracts";
import { scenarioById, twoBakedSlices } from "@landscape/scenarios";

const actionCosts: Record<Order["action"], number> = {
  scout: 1,
  build_contract: 1,
  implement: 1,
  review: 1,
  defend: 1,
  full_send: 2,
  consolidate: 1
};

// Each accepted order emits exactly one action event, so a reconstruction can price a match
// from its event log alone. `scout` is the only action with two possible event types.
const actionByEventType: Record<string, Order["action"]> = {
  "terrain.revealed": "scout",
  "bottleneck.measured": "scout",
  "artifact.contract_built": "build_contract",
  "implementation.resolved": "implement",
  "verification.completed": "review",
  "weapon.burst.resolved": "full_send",
  "consolidation.completed": "consolidate",
  "defense.held": "defend"
};

const initiative: Record<UnitState["chassis"], number> = { scout: 3, line: 2, siege: 1 };

export const ENGINE_VERSION = "0.3.0";

function actionCost(tuning: RulesTuning, action: Order["action"]): number {
  return tuning.actionCostOverrides[action] ?? actionCosts[action];
}

function cheapestActionCost(tuning: RulesTuning): number {
  return Math.min(...(Object.keys(actionCosts) as Order["action"][]).map((action) => actionCost(tuning, action)));
}

function winThreshold(profile: string): number {
  return profile === "false_bottleneck" || profile === "context_furnace" ? 6 : 7;
}

export * from "./command.js";
export * from "./attention.js";
export * from "./attention-v2.js";
export * from "./attention-v3.js";
export * from "./attention-v4.js";
export * from "./attention-v4-commander.js";
export * from "./attention-v4-controller.js";
export * from "./attention-v4-conformance.js";
export * from "./landscape.js";

export type ReplayBatch = { orders: Order[]; playerId?: string };
export type UnitComposition = "balanced" | "scout-heavy" | "line-heavy" | "siege-heavy";

function hashValue(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function event(matchId: string, state: MatchState, sequence: number, eventType: string, actorId: string | null, data: Record<string, unknown>): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: `${matchId}:${sequence}`,
    matchId,
    sequence,
    turn: state.turn,
    slot: state.slot,
    occurredAt: new Date((state.slot * 1000 + sequence) * 1000).toISOString(),
    eventType,
    actorId,
    causationId: typeof data.commandId === "string" ? data.commandId : null,
    correlationId: `${matchId}:slot:${state.slot}`,
    data
  };
}

function fireModeDelta(mode: FireMode): number {
  return mode === "full" ? 2 : mode === "single" ? -1 : 0;
}

export function createMatchState(matchId: string, playerId = "player", seed = twoBakedSlices.seed, scenarioId = twoBakedSlices.scenarioId, compositionId: UnitComposition = "balanced", tuningInput: RulesTuningInput = {}): MatchState {
  const scenario = scenarioById.get(scenarioId) ?? twoBakedSlices;
  ScenarioDefinitionSchema.parse(scenario);
  const chassisByComposition: Record<UnitComposition, { scout: UnitState["chassis"]; line1: UnitState["chassis"]; line2: UnitState["chassis"] }> = {
    balanced: { scout: "scout", line1: "line", line2: "line" },
    "scout-heavy": { scout: "scout", line1: "scout", line2: "line" },
    "line-heavy": { scout: "line", line1: "line", line2: "line" },
    "siege-heavy": { scout: "scout", line1: "siege", line2: "line" }
  };
  const chassis = chassisByComposition[compositionId];
  const rulesTuning = RulesTuningSchema.parse({ tuningId: "default", ...tuningInput });
  return {
    matchId,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    seed,
    turn: 0,
    slot: 0,
    eventSequence: 0,
    status: "active",
    objectiveProgress: 0,
    commanderEnergy: rulesTuning.startingCommanderEnergy ?? scenario.startingCommanderEnergy,
    commanderLoad: 0,
    heat: rulesTuning.startingHeat,
    dispersion: rulesTuning.startingDispersion,
    confidenceDrift: rulesTuning.startingConfidenceDrift,
    knownCells: ["0,0", "1,0", "2,0"],
    artifacts: [],
    contractExposed: false,
    contractBuilt: false,
    rollbackVerified: false,
    compositionId,
    rulesTuning,
    lessonFlags: [],
    units: [
      { unitId: "scout-01", ownerId: playerId, chassis: chassis.scout, x: 1, y: 1, heat: 0, dispersion: 0, active: true },
      { unitId: "line-01", ownerId: playerId, chassis: chassis.line1, x: 2, y: 4, heat: 0, dispersion: 0, active: true },
      { unitId: "line-02", ownerId: playerId, chassis: chassis.line2, x: 3, y: 4, heat: 0, dispersion: 0, active: true },
      { unitId: "siege-01", ownerId: "enemy", chassis: "siege", x: 8, y: 7, heat: 0, dispersion: 0, active: true }
    ]
  };
}

export function resolveSlot(state: MatchState, orders: Order[], playerId = "player"): { state: MatchState; events: EventEnvelope[] } {
  const next: MatchState = structuredClone(state);
  next.rulesTuning = next.rulesTuning ?? RulesTuningSchema.parse({});
  const events: EventEnvelope[] = [];
  const profile = scenarioById.get(next.scenarioId)?.rulesProfile ?? "integration";
  let sequence = next.eventSequence;
  const ordered = [...orders].sort((a, b) => {
    const aUnit = next.units.find((u) => u.unitId === a.unitId);
    const bUnit = next.units.find((u) => u.unitId === b.unitId);
    return (bUnit ? initiative[bUnit.chassis] : 0) - (aUnit ? initiative[aUnit.chassis] : 0);
  });

  for (const order of ordered) {
    const unit = next.units.find((candidate) => candidate.unitId === order.unitId && candidate.ownerId === playerId);
    if (!unit || !unit.active) {
      events.push(event(next.matchId, next, sequence++, "order.rejected", playerId, { order, reason: "unit_unavailable" }));
      continue;
    }
    const cost = actionCost(next.rulesTuning, order.action);
    if (next.commanderEnergy < cost) {
      events.push(event(next.matchId, next, sequence++, "order.rejected", unit.unitId, { order, reason: "commander_energy" }));
      continue;
    }
    next.commanderEnergy -= cost;
    next.commanderLoad += cost;
    next.heat += order.action === "full_send" ? next.rulesTuning.fullSendHeat : order.action === "implement" ? 1 : 0;
    next.dispersion = Math.max(0, next.dispersion + fireModeDelta(order.fireMode));

    switch (order.action) {
      case "scout":
        next.contractExposed = true;
        next.knownCells.push("7,6", "7,7", "8,7");
        next.confidenceDrift = Math.max(0, next.confidenceDrift - 2);
        next.dispersion = Math.max(0, next.dispersion - 1);
        if (profile === "false_bottleneck") {
          next.lessonFlags.push("measurement_verified");
          next.objectiveProgress += 2;
          events.push(event(next.matchId, next, sequence++, "bottleneck.measured", unit.unitId, { falseLead: "filtering", trueBottleneck: "send_volume" }));
        } else {
          events.push(event(next.matchId, next, sequence++, "terrain.revealed", unit.unitId, { hiddenTruth: "shared_contract_mismatch" }));
        }
        break;
      case "build_contract":
        next.contractBuilt = true;
        const artifact = profile === "documentation_fortress" ? (next.artifacts.includes("roadmap-shield") ? "adr-turret" : "roadmap-shield") : "contract-depot";
        if (!next.artifacts.includes(artifact)) next.artifacts.push(artifact);
        next.objectiveProgress += profile === "documentation_fortress" ? 1 : next.contractExposed ? 2 : 1;
        events.push(event(next.matchId, next, sequence++, "artifact.contract_built", unit.unitId, { artifact, profile }));
        break;
      case "implement":
        if (profile === "false_bottleneck" && next.lessonFlags.includes("measurement_verified")) {
          next.objectiveProgress += 3;
          next.dispersion = Math.max(0, next.dispersion - 1);
        } else if (profile === "documentation_fortress" && next.artifacts.length > 0) {
          next.objectiveProgress += 3;
          next.dispersion = Math.max(0, next.dispersion - 1);
        } else if (next.contractBuilt) {
          next.objectiveProgress += 2;
          next.dispersion = Math.max(0, next.dispersion - 1);
        } else {
          next.confidenceDrift += 2;
          next.dispersion += 2;
        }
        events.push(event(next.matchId, next, sequence++, "implementation.resolved", unit.unitId, { contractUsed: next.contractBuilt, profile }));
        break;
      case "review":
        if (profile === "context_furnace") next.objectiveProgress += 1;
        else if (next.contractBuilt || next.artifacts.length > 0) next.objectiveProgress += profile === "documentation_fortress" ? 2 : 1;
        next.confidenceDrift = Math.max(0, next.confidenceDrift - 1);
        events.push(event(next.matchId, next, sequence++, "verification.completed", unit.unitId, { contractUsed: next.contractBuilt, profile }));
        break;
      case "full_send":
        if (profile === "context_furnace" && next.heat < 7) {
          next.objectiveProgress += 3;
          next.rollbackVerified = true;
        } else if (next.contractBuilt && next.contractExposed) {
          next.objectiveProgress += 3;
          next.rollbackVerified = true;
        } else {
          next.dispersion += 3;
          next.confidenceDrift += 2;
        }
        events.push(event(next.matchId, next, sequence++, "weapon.burst.resolved", unit.unitId, { fireMode: order.fireMode, contractUsed: next.contractBuilt, profile }));
        break;
      case "consolidate":
        next.heat = Math.max(0, next.heat - 3);
        next.dispersion = Math.max(0, next.dispersion - 2);
        next.commanderLoad = Math.max(0, next.commanderLoad - 2);
        if (profile === "context_furnace") next.lessonFlags.push("context_reset");
        events.push(event(next.matchId, next, sequence++, "consolidation.completed", unit.unitId, { energyRefund: 0, profile }));
        break;
      case "defend":
        next.dispersion = Math.max(0, next.dispersion - 1);
        events.push(event(next.matchId, next, sequence++, "defense.held", unit.unitId, {}));
        break;
    }
  }

  next.slot += 1;
  next.turn = Math.floor(next.slot / 2);
  const threshold = winThreshold(profile);
  const won = profile === "false_bottleneck"
    ? next.objectiveProgress >= threshold && next.lessonFlags.includes("measurement_verified")
    : profile === "context_furnace"
      ? next.objectiveProgress >= threshold && next.heat <= 3
      : profile === "documentation_fortress"
        ? next.objectiveProgress >= threshold && next.artifacts.length > 0
        : next.objectiveProgress >= threshold && next.rollbackVerified;
  // Stalled means no action is affordable any more, not merely that energy hit zero: a tuning may
  // price an action at zero, and one that prices every action above the remaining energy strands
  // the commander well before zero.
  const stalled = next.commanderEnergy < cheapestActionCost(next.rulesTuning);
  if (won) next.status = "victory";
  else if (next.slot >= 8 || (stalled && next.objectiveProgress < threshold) || (profile === "context_furnace" && next.heat >= 8)) next.status = "defeat";
  events.push(event(next.matchId, next, sequence, "fire_control.snapshot", null, {
    fireRate: next.slot,
    dispersion: next.dispersion,
    commanderLoad: next.commanderLoad,
    heat: next.heat,
    confidenceDrift: next.confidenceDrift,
    missionProgress: next.objectiveProgress
  }));
  next.eventSequence = sequence + 1;
  return { state: next, events };
}

export function projectForPlayer(state: MatchState, playerId = "player"): MatchProjection {
  const visibleEnemyUnits = state.units.filter((unit) => unit.ownerId !== playerId && state.knownCells.includes(`${unit.x},${unit.y}`));
  const recommendation = state.status !== "active"
    ? state.status === "victory" ? "Objective complete. Consolidate the lesson." : "Mission lost. Replay the first unverified assumption."
    : state.heat >= 5 || state.dispersion >= 5 ? "Objective is exposed; consolidate before firing again."
      : !state.contractExposed ? "Scout the boundary before committing heavy force."
        : !state.contractBuilt ? "Build the Contract Depot before sustained fire."
          : "Continue the bounded assault, then verify rollback.";
  return {
    ...state,
    units: state.units.filter((unit) => unit.ownerId === playerId),
    visibleEnemyUnits,
    fireControl: {
      fireRate: state.slot,
      dispersion: state.dispersion,
      commanderLoad: state.commanderLoad,
      heat: state.heat,
      confidenceDrift: state.confidenceDrift,
      missionProgress: state.objectiveProgress,
      recommendation
    }
  };
}

export function runReplay(initial: MatchState, batches: ReplayBatch[]): { state: MatchState; events: EventEnvelope[]; manifest: ReplayManifest } {
  let state = structuredClone(initial);
  const events: EventEnvelope[] = [];
  for (const batch of batches) {
    if (state.status !== "active") break;
    const result = resolveSlot(state, batch.orders, batch.playerId ?? "player");
    state = result.state;
    events.push(...result.events);
  }
  return {
    state,
    events,
    manifest: buildReplayManifest(state, events)
  };
}

export function buildReplayManifest(state: MatchState, events: EventEnvelope[]): ReplayManifest {
  return {
    schemaVersion: 1,
    matchId: state.matchId,
    scenarioId: state.scenarioId,
    scenarioVersion: state.scenarioVersion,
    engineVersion: ENGINE_VERSION,
    seed: state.seed,
    compositionId: state.compositionId,
    tuningId: state.rulesTuning.tuningId,
    eventCount: events.length,
    eventHash: hashValue(events),
    projectionHash: hashValue(projectForPlayer(state))
  };
}

export function buildReconstruction(state: MatchState, events: EventEnvelope[]): Reconstruction {
  const eventTypes: Record<string, number> = {};
  for (const item of events) eventTypes[item.eventType] = (eventTypes[item.eventType] ?? 0) + 1;
  const actionEvents = events.filter((item) => item.eventType in actionByEventType);
  const rejectedCount = events.filter((item) => item.eventType === "order.rejected").length;
  // Price each accepted order through the match's own tuning. Inferring cost from the event type
  // alone would ignore `actionCostOverrides`, which every tuned gameplay-lab variant relies on.
  const tuning = state.rulesTuning ?? RulesTuningSchema.parse({});
  const commanderEnergySpent = actionEvents.reduce((sum, item) => sum + actionCost(tuning, actionByEventType[item.eventType]), 0);
  const artifactsBuilt = events
    .filter((item) => item.eventType.startsWith("artifact."))
    .map((item) => String(item.data.artifact ?? "unknown"));
  const highGroundSequence = events.find((item) => item.eventType === "consolidation.completed")?.sequence
    ?? events.find((item) => item.eventType === "artifact.contract_built")?.sequence
    ?? null;
  const counterfactual = artifactsBuilt.length > 0
    ? { action: "build_artifact", claim: "The cheapest safer path likely builds one durable artifact before sustained fire." }
    : { action: "scout", claim: "A cheaper path likely scouts before committing a heavy action." };
  return {
    matchId: state.matchId,
    status: state.status,
    actionCount: actionEvents.length,
    rejectedCount,
    commanderEnergySpent,
    objectiveProgress: state.objectiveProgress,
    artifactsBuilt: [...new Set(artifactsBuilt)],
    eventTypes,
    highGroundSequence,
    counterfactual
  };
}
