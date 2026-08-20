import {
  ATTENTION_V4_MODEL_VERSION,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION,
  AttentionV4FleetSchema,
  AttentionV4ArtilleryIntentSchema,
  AttentionV4CapacityIntentSchema,
  AttentionV4CommandIntentSchema,
  AttentionV4KineticPlanSchema,
  AttentionV4MatchStateSchema,
  AttentionV4ProjectionSchema,
  AttentionV4RulesSchema,
  type AttentionV4ArtifactState,
  type AttentionV4AttentionCost,
  type AttentionV4ArtilleryIntent,
  type AttentionV4CapacityIntent,
  type AttentionV4Chassis,
  type AttentionV4CommandIntent,
  type AttentionV4Coordinate,
  type AttentionV4EventEnvelope,
  type AttentionV4Fleet,
  type AttentionV4HazardProjection,
  type AttentionV4KineticAction,
  type AttentionV4KineticPlan,
  type AttentionV4Legal,
  type AttentionV4MatchState,
  type AttentionV4PlayerState,
  type AttentionV4Projection,
  type AttentionV4ResolutionRecap,
  type AttentionV4RoundRecord,
  type AttentionV4Rules,
  type AttentionV4Shell,
  type AttentionV4ShellCard,
  type AttentionV4UnitState,
  type AttentionV4Zone
} from "@landscape/contracts";
import {
  attentionV4AiCommander,
  attentionV4ContentHash,
  attentionV4ManualCommander
} from "./attention-v4-commander.js";

const chassisRules = {
  scout: { uap: 3 as const, reactorRating: 3 as const, calibration: 0.2 as const, range: 2 as const, contextLimit: 1 as const, seizeCost: 1 as const },
  line: { uap: 2 as const, reactorRating: 2 as const, calibration: 0.6 as const, range: 3 as const, contextLimit: 2 as const, seizeCost: 2 as const },
  heavy: { uap: 1 as const, reactorRating: 1 as const, calibration: 0.9 as const, range: 4 as const, contextLimit: 3 as const, seizeCost: 3 as const }
};

const rulesWithoutHash = {
  rulesetVersion: ATTENTION_V4_RULESET_VERSION,
  resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
  scenarioLabel: "The Contested Context",
  opponentLabel: "Threshold Doctrine",
  board: { width: 10 as const, height: 10 as const, distanceMetric: "chebyshev" as const, exclusiveOccupancy: true as const },
  roundLimit: 8 as const,
  attentionPerRound: 3 as const,
  objectiveTarget: 12 as const,
  driftLimit: 4 as const,
  soundnessRate: 0.7 as const,
  verifyCost: 1 as const,
  chassis: chassisRules,
  fleet: {
    weight: 6 as const,
    chassisWeights: { scout: 1 as const, line: 2 as const, heavy: 3 as const },
    minimumUnits: 3 as const,
    maximumUnits: 5 as const,
    maximumHeavies: 1 as const,
    maximumScouts: 4 as const
  },
  range: { minimum: 1 as const, maximum: 5 as const, spawnMinimum: 1 as const },
  trafficLimit: 3 as const,
  battery: { fieldSize: 3 as const, kineticBonus: 1 as const, commandDiscount: 1 as const, minimumDensityPct: 80 as const, minimumCalibration: 0.8 as const },
  allocation: {
    densities: Array.from({ length: 17 }, (_, index) => 20 + index * 5),
    prefill: {
      scout: { volume: 3, densityPct: 20 },
      line: { volume: 2, densityPct: 60 },
      heavy: { volume: 1, densityPct: 90 }
    },
    scoutCondense: [
      { steps: 0 as const, volumeCap: 3 as const, densityCapPct: 20 as const, calibration: 0.2 as const },
      { steps: 1 as const, volumeCap: 2 as const, densityCapPct: 60 as const, calibration: 0.65 as const },
      { steps: 2 as const, volumeCap: 1 as const, densityCapPct: 90 as const, calibration: 0.85 as const }
    ]
  },
  capacitySlots: [
    { rank: 1, cost: 1, capacityAward: 1 },
    { rank: 2, cost: 2, capacityAward: 1 },
    { rank: 3, cost: 3, capacityAward: 3 },
    { rank: 4, cost: 5, capacityAward: 5 },
    { rank: 5, cost: 8, capacityAward: 8 }
  ],
  abilities: {
    perfectFocus: { unlockRank: 1 as const, cooldownRounds: 3 as const, maxUses: 3 as const },
    overclock: { unlockRank: 2 as const, seizeDiscount: 1 as const, maxUses: 1 as const },
    artillery: { unlockRank: 3 as const, cooldown: 3 as const, reloadThreshold: 3 as const, reloadTo: 5 as const }
  },
  artillery: {
    shells: ["flare", "smoke", "emp", "he", "chaff"] as AttentionV4Shell[],
    zoneSize: 3 as const,
    durationWindows: 2 as const,
    flareMultiplier: 2 as const
  }
};

export const ATTENTION_V4_RULESET_HASH = attentionV4ContentHash(rulesWithoutHash);
export const defaultAttentionV4Rules: AttentionV4Rules = AttentionV4RulesSchema.parse({
  ...rulesWithoutHash,
  rulesetHash: ATTENTION_V4_RULESET_HASH
});

const frontSchedule = [
  [{ x: 2, y: 2 }, { x: 7, y: 7 }],
  [{ x: 3, y: 3 }, { x: 6, y: 6 }],
  [{ x: 4, y: 4 }, { x: 5, y: 5 }],
  [{ x: 5, y: 5 }, { x: 4, y: 4 }],
  [{ x: 6, y: 6 }, { x: 3, y: 3 }],
  [{ x: 7, y: 7 }, { x: 2, y: 2 }],
  [{ x: 6, y: 6 }, { x: 3, y: 3 }],
  [{ x: 5, y: 5 }, { x: 4, y: 4 }]
] as const;

const spawnPositions: readonly [readonly AttentionV4Coordinate[], readonly AttentionV4Coordinate[]] = [
  [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 2 }],
  [{ x: 8, y: 8 }, { x: 8, y: 7 }, { x: 7, y: 8 }, { x: 9, y: 8 }, { x: 8, y: 9 }, { x: 7, y: 7 }]
];

export type AttentionV4Match = Readonly<{ state: AttentionV4MatchState; rules: AttentionV4Rules }>;
export type AttentionV4Transition = Readonly<{ match: AttentionV4Match; events: AttentionV4EventEnvelope[] }>;

export type AttentionV4MatchSetup = {
  matchId: string;
  seed: number;
  randomStreamId?: string;
  players?: readonly [
    { playerId: string; composition?: AttentionV4Fleet; commanderHash?: string },
    { playerId: string; composition?: AttentionV4Fleet; commanderHash?: string }
  ];
};

function clone(match: AttentionV4Match): AttentionV4MatchState {
  return structuredClone(match.state);
}

function parsedMatch(state: AttentionV4MatchState, rules: AttentionV4Rules = defaultAttentionV4Rules): AttentionV4Match {
  return { state: AttentionV4MatchStateSchema.parse(state), rules: AttentionV4RulesSchema.parse(rules) };
}

function event(state: AttentionV4MatchState, eventType: string, actorId: string | null, data: Record<string, unknown>): AttentionV4EventEnvelope {
  const sequence = state.eventSequence++;
  return {
    schemaVersion: 1,
    eventId: `${state.matchId}:${sequence}`,
    matchId: state.matchId,
    sequence,
    turn: state.round,
    slot: state.round,
    occurredAt: new Date((state.round * 1000 + sequence) * 1000).toISOString(),
    eventType,
    actorId,
    causationId: null,
    correlationId: `${state.matchId}:attention-v4:r${state.round}`,
    data
  };
}

function distance(left: AttentionV4Coordinate, right: AttentionV4Coordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function sameCoordinate(left: AttentionV4Coordinate, right: AttentionV4Coordinate): boolean {
  return left.x === right.x && left.y === right.y;
}

function coordinateKey(coordinate: AttentionV4Coordinate): string {
  return `${coordinate.x},${coordinate.y}`;
}

function insideZone(coordinate: AttentionV4Coordinate, center: AttentionV4Coordinate): boolean {
  return Math.abs(coordinate.x - center.x) <= 1 && Math.abs(coordinate.y - center.y) <= 1;
}

function inBounds(coordinate: AttentionV4Coordinate): boolean {
  return coordinate.x >= 0 && coordinate.y >= 0 && coordinate.x < 10 && coordinate.y < 10;
}

function keyedUnit(seed: number, stream: string, domain: string, key: string): number {
  const digest = attentionV4ContentHash({ seed, stream, domain, key }).slice(7, 15);
  return Number.parseInt(digest, 16) / 0x1_0000_0000;
}

function playerOf(state: AttentionV4MatchState, playerId: string): AttentionV4PlayerState {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  if (!player) throw new Error(`player_unavailable:${playerId}`);
  return player;
}

function unitOf(state: AttentionV4MatchState, unitId: string, playerId?: string): AttentionV4UnitState {
  const unit = state.units.find((candidate) => candidate.unitId === unitId && (playerId === undefined || candidate.ownerPlayerId === playerId));
  if (!unit) throw new Error(`unit_unavailable:${unitId}`);
  return unit;
}

function otherPlayerId(state: AttentionV4MatchState, playerId: string): string {
  return state.players.find((player) => player.playerId !== playerId)!.playerId;
}

function priorityPlayerId(state: AttentionV4MatchState): string {
  return state.players[(state.round - 1) % 2].playerId;
}

function currentFront(state: AttentionV4MatchState, playerId: string): { playerId: string; center: AttentionV4Coordinate; radius: number } {
  const playerIndex = state.players.findIndex((player) => player.playerId === playerId);
  return { playerId, center: { ...frontSchedule[Math.min(state.round, 8) - 1][playerIndex] }, radius: 1 };
}

function objectiveEligible(state: AttentionV4MatchState, playerId: string, position: AttentionV4Coordinate): boolean {
  return distance(currentFront(state, playerId).center, position) <= 1;
}

function activeCommandZones(state: AttentionV4MatchState, kind: "flare" | "smoke"): Extract<AttentionV4Zone, { kind: "flare" | "smoke" }>[] {
  return state.zones.filter((zone): zone is Extract<AttentionV4Zone, { kind: "flare" | "smoke" }> =>
    zone.kind === kind && zone.activeThroughCommandRound >= state.round
  );
}

function activeChaffZones(state: AttentionV4MatchState): Extract<AttentionV4Zone, { kind: "chaff" }>[] {
  return state.zones.filter((zone): zone is Extract<AttentionV4Zone, { kind: "chaff" }> =>
    zone.kind === "chaff" && zone.activeThroughArtilleryRound >= state.round
  );
}

function roundRecord(state: AttentionV4MatchState): AttentionV4RoundRecord {
  let record = state.roundRecords.find((candidate) => candidate.round === state.round);
  if (!record) {
    record = {
      round: state.round,
      rootStream: state.randomStreamId,
      domainStreams: {
        sound: `${state.randomStreamId}:sound:r${state.round}`,
        noise: `${state.randomStreamId}:noise:r${state.round}`,
        position: `${state.randomStreamId}:position:r${state.round}`,
        armory: `${state.randomStreamId}:armory:r${state.round}`
      },
      uap: [],
      armoryTransitions: [],
      batteryFields: [],
      artifacts: [],
      detonations: [],
      drift: [],
      empVictims: []
    };
    state.roundRecords.push(record);
  }
  return record;
}

function refreshBatterySuppression(state: AttentionV4MatchState): void {
  const smokes = activeCommandZones(state, "smoke");
  for (const artifact of state.artifacts) {
    artifact.battery.suppressed = artifact.battery.active && smokes.some((smoke) => insideZone(artifact.position, smoke.center));
  }
}

function recomputeQueuedUplinks(state: AttentionV4MatchState): void {
  for (const player of state.players) {
    player.queuedUplinkBonus = state.units.some((unit) =>
      unit.ownerPlayerId === player.playerId && unit.chassis === "heavy" && unit.uplinkQueued
    ) ? 1 : 0;
  }
}

function applyActiveSmoke(state: AttentionV4MatchState, events: AttentionV4EventEnvelope[]): void {
  const smokes = activeCommandZones(state, "smoke");
  if (smokes.length === 0) {
    refreshBatterySuppression(state);
    return;
  }
  const caught = state.units.filter((unit) => smokes.some((smoke) => insideZone(unit.position, smoke.center)));
  for (const unit of caught) {
    unit.calibration = 0.2;
    unit.condenseSteps = 0;
    if (unit.uplinkQueued) unit.uplinkQueued = false;
  }
  for (const reservation of state.supportReservations) {
    if (reservation.createdRound !== state.round || reservation.cancelled) continue;
    if (caught.some((unit) => unit.unitId === reservation.lineUnitId || unit.unitId === reservation.scoutUnitId)) {
      reservation.cancelled = true;
      events.push(event(state, "attention.v4.support-scan.cancelled", reservation.lineUnitId, {
        reservationId: reservation.reservationId,
        reason: "smoke"
      }));
    }
  }
  recomputeQueuedUplinks(state);
  refreshBatterySuppression(state);
  if (caught.length > 0) {
    events.push(event(state, "attention.v4.smoke.reset", null, { unitIds: caught.map((unit) => unit.unitId).sort() }));
  }
}

function activeBatteryForArtifact(state: AttentionV4MatchState, target: AttentionV4ArtifactState): AttentionV4ArtifactState | null {
  return state.artifacts
    .filter((artifact) => artifact.artifactId !== target.artifactId && artifact.resolution === "pending" &&
      artifact.battery.active && !artifact.battery.suppressed && insideZone(target.position, artifact.position))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId))[0] ?? null;
}

function commandCost(state: AttentionV4MatchState, artifact: AttentionV4ArtifactState, verb: "verify" | "seize", player: AttentionV4PlayerState): AttentionV4AttentionCost {
  const battery = activeBatteryForArtifact(state, artifact);
  const base = verb === "verify" ? 1 : chassisRules[artifact.sourceChassis].seizeCost;
  const batteryDiscount = battery ? 1 : 0;
  const overclockDiscount = verb === "seize" && player.overclockActive ? 1 : 0;
  return {
    base,
    batteryDiscount,
    overclockDiscount,
    total: Math.max(0, base - batteryDiscount - overclockDiscount),
    batteryArtifactId: battery?.artifactId ?? null
  };
}

export function projectAttentionV4Hazards(state: AttentionV4MatchState): AttentionV4HazardProjection[] {
  return state.artifacts
    .filter((artifact) => artifact.resolution === "pending" && !artifact.verified && artifact.newbornRound < state.round && artifact.overTaxReasons.length > 0)
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
    .map((artifact) => ({
      artifactId: artifact.artifactId,
      ownerPlayerId: artifact.ownerPlayerId,
      reasons: [...artifact.overTaxReasons].sort() as Array<"context-limit" | "local-traffic">,
      drift: 2,
      frozenUnitIds: state.units
        .filter((unit) => unit.ownerPlayerId === artifact.ownerPlayerId && insideZone(unit.position, artifact.position))
        .map((unit) => unit.unitId)
        .sort()
    }));
}

function drawCard(state: AttentionV4MatchState, player: AttentionV4PlayerState): AttentionV4ShellCard {
  const drawOrdinal = player.armory.nextDrawOrdinal++;
  const shells = defaultAttentionV4Rules.artillery.shells;
  const shell = shells[Math.floor(keyedUnit(state.seed, state.randomStreamId, "armory", `r${state.round}:${player.playerId}:${drawOrdinal}`) * shells.length)];
  return {
    cardId: `${state.matchId}:card:${player.playerId}:${drawOrdinal}:${shell}`,
    shell,
    drawnRound: state.round,
    drawOrdinal
  };
}

function performRegister(state: AttentionV4MatchState, initial: boolean): AttentionV4EventEnvelope[] {
  const events: AttentionV4EventEnvelope[] = [];
  state.phase = "kinetic";
  state.command = { activePlayerId: null, endedPlayerIds: [] };
  state.zones = state.zones.filter((zone) => zone.kind === "chaff"
    ? zone.activeThroughArtilleryRound >= state.round
    : zone.activeThroughCommandRound >= state.round
  );
  refreshBatterySuppression(state);
  const agedArtifactIds: string[] = [];
  for (const artifact of state.artifacts) {
    artifact.localTraffic = 0;
    artifact.overTaxReasons = artifact.overTaxReasons.filter((reason) => reason !== "local-traffic");
    artifact.supportScanUnitIds = [];
    if (artifact.resolution === "pending" && !artifact.verified && artifact.newbornRound < state.round) {
      artifact.age += 1;
      agedArtifactIds.push(artifact.artifactId);
      if (artifact.age > artifact.contextLimit && !artifact.overTaxReasons.includes("context-limit")) {
        artifact.overTaxReasons.push("context-limit");
      }
    }
  }
  state.traffic = [];
  state.supportReservations = state.supportReservations.filter((reservation) => reservation.createdRound >= state.round);

  const reloads: Array<{ playerId: string; cardIds: string[] }> = [];
  for (const player of state.players) {
    const handBefore = player.armory.cards.map((card) => card.cardId);
    const cooldownBefore = player.armory.cooldown;
    const retaliationBefore = player.armory.retaliationAvailable;
    player.attention = player.baseAttention + player.capacityBonus + player.queuedUplinkBonus;
    player.queuedUplinkBonus = 0;
    player.overclockActive = false;
    player.endedCommand = false;
    if (!initial) player.armory.cooldown = Math.max(0, player.armory.cooldown - 1);
    const cardIds: string[] = [];
    if (player.armory.cards.length < 3) {
      while (player.armory.cards.length < 5) {
        const card = drawCard(state, player);
        player.armory.cards.push(card);
        cardIds.push(card.cardId);
        roundRecord(state).armoryTransitions.push({ kind: "draw", playerId: player.playerId, cardId: card.cardId, shell: card.shell });
      }
    }
    reloads.push({ playerId: player.playerId, cardIds });
    roundRecord(state).armoryTransitions.push({
      kind: "register",
      playerId: player.playerId,
      handBefore,
      handAfter: player.armory.cards.map((card) => card.cardId),
      cooldownBefore,
      cooldownAfter: player.armory.cooldown,
      retaliationBefore,
      retaliationAfter: player.armory.retaliationAvailable,
      reloadCardIds: cardIds
    });
  }

  if (!state.capacityTrack.artilleryUnlocked && state.capacityTrack.artilleryUnlockRound !== null && state.round >= state.capacityTrack.artilleryUnlockRound) {
    state.capacityTrack.artilleryUnlocked = true;
  }

  for (const unit of state.units) {
    unit.calibration = chassisRules[unit.chassis].calibration;
    unit.condenseSteps = 0;
    unit.rangeChanged = false;
    unit.forcedDisplaced = false;
    unit.outputDecision = "pending";
    unit.uplinkQueued = false;
    unit.lastPlan = [];
    unit.uap.spent = 0;
    unit.uap.freezeSources = [...new Set(unit.uap.nextFreezeSources)].sort() as typeof unit.uap.freezeSources;
    unit.uap.nextFreezeSources = [];
    unit.uap.frozen = unit.uap.freezeSources.length > 0;
    const assisted = state.artifacts.some((artifact) =>
      artifact.ownerPlayerId === unit.ownerPlayerId && artifact.resolution === "pending" && artifact.battery.active &&
      !artifact.battery.suppressed && insideZone(unit.position, artifact.position)
    );
    unit.uap.batteryBonus = assisted ? 1 : 0;
    unit.uap.effective = unit.uap.frozen ? 0 : unit.uap.base + unit.uap.batteryBonus;
  }
  applyActiveSmoke(state, events);

  const recap = {
    round: state.round,
    attention: state.players.map((player) => ({ playerId: player.playerId, total: player.attention })),
    uap: state.units.map((unit) => ({
      unitId: unit.unitId,
      base: unit.uap.base,
      batteryBonus: unit.uap.batteryBonus,
      effective: unit.uap.effective,
      frozen: unit.uap.frozen
    })),
    reloads,
    agedArtifactIds: agedArtifactIds.sort(),
    artilleryUnlocked: state.capacityTrack.artilleryUnlocked
  };
  state.lastRegisterRecap = recap;
  const record = roundRecord(state);
  record.batteryFields = state.artifacts.filter((artifact) => artifact.battery.active).map((artifact) => ({
    artifactId: artifact.artifactId,
    ownerPlayerId: artifact.ownerPlayerId,
    center: artifact.position,
    suppressed: artifact.battery.suppressed,
    uapBonus: 1,
    verifyDiscount: artifact.battery.suppressed ? 0 : 1,
    seizeDiscount: artifact.battery.suppressed ? 0 : 1
  }));
  record.artifacts.push(...state.artifacts.filter((artifact) => artifact.resolution === "pending").map((artifact) => ({
    kind: "register-snapshot",
    artifactId: artifact.artifactId,
    ownerPlayerId: artifact.ownerPlayerId,
    densityPct: artifact.densityPct,
    sourceCalibration: artifact.sourceCalibration,
    effectiveCalibration: artifact.effectiveCalibration,
    age: artifact.age,
    contextLimit: artifact.contextLimit,
    load: artifact.localTraffic,
    overTaxReasons: artifact.overTaxReasons,
    verified: artifact.verified,
    batteryActive: artifact.battery.active,
    batterySuppressed: artifact.battery.suppressed
  })));
  events.push(event(state, "attention.v4.register", null, recap));
  return events;
}

function initialArmory(matchId: string, playerId: string): AttentionV4PlayerState["armory"] {
  const shells: AttentionV4Shell[] = ["flare", "smoke", "emp", "he", "chaff"];
  return {
    cards: shells.map((shell, drawOrdinal) => ({
      cardId: `${matchId}:card:${playerId}:${drawOrdinal}:${shell}`,
      shell,
      drawnRound: 1,
      drawOrdinal
    })),
    cooldown: 0,
    retaliationAvailable: false,
    nextDrawOrdinal: shells.length
  };
}

export function startAttentionV4Match(setup: AttentionV4MatchSetup): AttentionV4Transition {
  const players = setup.players ?? [
    { playerId: "alpha", composition: attentionV4ManualCommander.composition, commanderHash: attentionV4ManualCommander.programHash },
    { playerId: "bravo", composition: attentionV4AiCommander.composition, commanderHash: attentionV4AiCommander.programHash }
  ];
  if (players[0].playerId === players[1].playerId) throw new Error("attention-v4 requires two distinct players");
  const commanderHashes = [
    players[0].commanderHash ?? attentionV4ManualCommander.programHash,
    players[1].commanderHash ?? attentionV4AiCommander.programHash
  ] as [string, string];
  const playerStates = players.map((player) => ({
    playerId: player.playerId,
    attention: 3,
    baseAttention: 3 as const,
    capacityBonus: 0,
    queuedUplinkBonus: 0,
    progress: 0,
    drift: 0,
    status: "active" as const,
    claimCount: 0,
    focusNextReadyRound: 1,
    focusUses: 0,
    overclockUsed: false,
    overclockActive: false,
    endedCommand: false,
    armory: initialArmory(setup.matchId, player.playerId)
  })) as [AttentionV4PlayerState, AttentionV4PlayerState];

  const units: AttentionV4UnitState[] = [];
  players.forEach((player, playerIndex) => {
    const composition = AttentionV4FleetSchema.parse(player.composition ?? (playerIndex === 0 ? attentionV4ManualCommander.composition : attentionV4AiCommander.composition));
    composition.forEach((chassis, unitIndex) => {
      const ordinal = composition.slice(0, unitIndex + 1).filter((candidate) => candidate === chassis).length;
      const rule = chassisRules[chassis];
      units.push({
        unitId: `${player.playerId}:${chassis}-${ordinal}`,
        ownerPlayerId: player.playerId,
        chassis,
        position: { ...spawnPositions[playerIndex][unitIndex] },
        activeRange: rule.range,
        reactorRating: rule.reactorRating,
        calibration: rule.calibration,
        condenseSteps: 0,
        rangeChanged: false,
        forcedDisplaced: false,
        outputDecision: "pending",
        uplinkQueued: false,
        uap: {
          base: rule.uap,
          batteryBonus: 0,
          effective: rule.uap,
          spent: 0,
          frozen: false,
          freezeSources: [],
          nextFreezeSources: []
        },
        lastPlan: []
      });
    });
  });

  const placeholderRecap = {
    round: 1,
    attention: [],
    uap: [],
    reloads: [],
    agedArtifactIds: [],
    artilleryUnlocked: false
  };
  const state = AttentionV4MatchStateSchema.parse({
    schemaVersion: 3,
    modelVersion: ATTENTION_V4_MODEL_VERSION,
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compiledCommanderHashes: commanderHashes,
    matchId: setup.matchId,
    scenarioId: "mirrored-fronts-v4",
    scenarioVersion: 4,
    seed: setup.seed,
    randomStreamId: setup.randomStreamId ?? `attention-v4:${setup.seed}`,
    round: 1,
    phase: "kinetic",
    status: "active",
    winnerPlayerId: null,
    terminalReason: null,
    eventSequence: 0,
    players: playerStates,
    units,
    artifacts: [],
    zones: [],
    supportReservations: [],
    traffic: [],
    capacityTrack: { nextRank: 1, claims: [], artilleryUnlocked: false, artilleryUnlockRound: null },
    command: { activePlayerId: null, endedPlayerIds: [] },
    lastRegisterRecap: placeholderRecap,
    lastResolutionRecap: null,
    roundRecords: []
  });
  const events = performRegister(state, true);
  return { match: parsedMatch(state), events };
}

export function createAttentionV4Match(setup: AttentionV4MatchSetup): AttentionV4Match {
  return startAttentionV4Match(setup).match;
}

type ValidatedPlan = {
  unit: AttentionV4UnitState;
  actions: AttentionV4KineticAction[];
  origin: AttentionV4Coordinate;
  destination: AttentionV4Coordinate;
  activeRange: number;
  moveCount: number;
  actionCoordinates: Array<{ action: AttentionV4KineticAction; coordinate: AttentionV4Coordinate }>;
  scans: string[];
  condenseSteps: number;
  stepUp: boolean;
  uplink: boolean;
  rangeChanged: boolean;
  reason: string | null;
};

function validatePlan(state: AttentionV4MatchState, unit: AttentionV4UnitState, actions: AttentionV4KineticAction[]): ValidatedPlan {
  let reason: string | null = null;
  let cursor = { ...unit.position };
  let activeRange = unit.activeRange;
  let moveCount = 0;
  let rangeChanged = false;
  const actionCoordinates: ValidatedPlan["actionCoordinates"] = [];
  const scans: string[] = [];
  const kinds = actions.map((action) => action.kind);
  const condenseSteps = kinds.filter((kind) => kind === "condense-output").length;
  const stepUp = kinds.includes("step-up");
  const uplink = kinds.includes("command-uplink");

  if (actions.length > unit.uap.effective) reason = "uap-budget";
  if (!reason && unit.chassis === "scout") {
    if (kinds.some((kind) => kind === "support-scan" || kind === "command-uplink")) reason = "chassis-action";
    else if (kinds.includes("step-up")) reason = "chassis-action";
    else if (condenseSteps > 2) reason = "condense-limit";
    else if (kinds.some((kind, index) => kind !== "condense-output" && kinds.slice(0, index).includes("condense-output"))) reason = "condense-order";
  }
  if (!reason && unit.chassis === "line") {
    if (kinds.some((kind) => kind === "condense-output" || kind === "command-uplink")) reason = "chassis-action";
    else if (kinds.filter((kind) => kind === "step-up").length > 1) reason = "duplicate-step-up";
    else if (kinds.filter((kind) => kind === "support-scan").length > (unit.uap.batteryBonus ? 2 : 1)) reason = "support-scan-limit";
  }
  if (!reason && unit.chassis === "heavy") {
    if (kinds.some((kind) => !["move", "range-shift", "command-uplink"].includes(kind))) reason = "chassis-action";
    else if (kinds.filter((kind) => kind === "command-uplink").length > 1) reason = "duplicate-uplink";
  }

  if (!reason) {
    for (const action of actions) {
      if (action.kind === "move") {
        if (!inBounds(action.destination)) { reason = "out-of-bounds"; break; }
        if (distance(cursor, action.destination) !== 1) { reason = "move-step"; break; }
        cursor = { ...action.destination };
        moveCount += 1;
      } else if (action.kind === "range-shift") {
        const shifted = activeRange + action.delta;
        if (shifted < 1 || shifted > 5) { reason = "range-limit"; break; }
        activeRange = shifted;
        rangeChanged = true;
      } else if (action.kind === "support-scan") {
        const scout = state.units.find((candidate) => candidate.unitId === action.scoutUnitId &&
          candidate.ownerPlayerId === unit.ownerPlayerId && candidate.chassis === "scout");
        if (!scout) { reason = "support-scan-target"; break; }
        if (distance(cursor, scout.position) > activeRange) { reason = "support-scan-range"; break; }
        scans.push(scout.unitId);
      }
      actionCoordinates.push({ action, coordinate: { ...cursor } });
    }
  }
  return { unit, actions, origin: { ...unit.position }, destination: cursor, activeRange, moveCount, actionCoordinates, scans, condenseSteps, stepUp, uplink, rangeChanged, reason };
}

function resetRejectedPlan(unit: AttentionV4UnitState): void {
  unit.lastPlan = [];
  unit.uap.spent = 0;
  unit.condenseSteps = 0;
  unit.calibration = unit.chassis === "scout" ? 0.2 : chassisRules[unit.chassis].calibration;
  unit.rangeChanged = false;
}

export function resolveAttentionV4Kinetic(match: AttentionV4Match, planInputs: AttentionV4KineticPlan[]): AttentionV4Transition {
  if (match.state.phase !== "kinetic") throw new Error(`phase_mismatch:${match.state.phase}`);
  const state = clone(match);
  const events: AttentionV4EventEnvelope[] = [];
  const plans = planInputs.map((plan) => AttentionV4KineticPlanSchema.parse(plan));
  const expected = new Set(state.units.map((unit) => unit.unitId));
  const submitted = new Set<string>();
  for (const plan of plans) {
    if (submitted.has(plan.unitId)) throw new Error(`duplicate_kinetic_plan:${plan.unitId}`);
    submitted.add(plan.unitId);
    const unit = state.units.find((candidate) => candidate.unitId === plan.unitId && candidate.ownerPlayerId === plan.playerId);
    if (!unit) throw new Error(`unit_unavailable:${plan.unitId}`);
  }
  const missing = [...expected].filter((unitId) => !submitted.has(unitId));
  if (missing.length > 0 || submitted.size !== expected.size) throw new Error(`kinetic_plan_incomplete:${missing.sort().join(",")}`);

  const validated = plans
    .map((plan) => validatePlan(state, unitOf(state, plan.unitId, plan.playerId), plan.actions))
    .sort((left, right) => left.unit.unitId.localeCompare(right.unit.unitId));
  const moving = new Map(validated
    .filter((plan) => !plan.reason && plan.moveCount > 0 && !sameCoordinate(plan.origin, plan.destination))
    .map((plan) => [plan.unit.unitId, plan]));
  const destinations = new Map<string, ValidatedPlan[]>();
  for (const plan of moving.values()) {
    const entries = destinations.get(coordinateKey(plan.destination)) ?? [];
    entries.push(plan);
    destinations.set(coordinateKey(plan.destination), entries);
  }
  for (const contenders of destinations.values()) {
    if (contenders.length < 2) continue;
    for (const contender of contenders) {
      contender.reason = "destination-conflict";
      moving.delete(contender.unit.unitId);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const stationary = new Set(state.units.filter((unit) => !moving.has(unit.unitId)).map((unit) => coordinateKey(unit.position)));
    for (const [unitId, plan] of [...moving]) {
      if (!stationary.has(coordinateKey(plan.destination))) continue;
      plan.reason = "occupied";
      moving.delete(unitId);
      changed = true;
    }
  }

  const trafficActions: Array<{ unitId: string; coordinate: AttentionV4Coordinate; kind: string }> = [];
  for (const plan of validated) {
    const unit = plan.unit;
    if (plan.reason) {
      resetRejectedPlan(unit);
      events.push(event(state, "attention.v4.kinetic.plan.rejected", unit.unitId, {
        playerId: unit.ownerPlayerId,
        unitId: unit.unitId,
        reason: plan.reason,
        requestedActions: plan.actions.map((action) => action.kind)
      }));
      roundRecord(state).uap.push({ unitId: unit.unitId, base: unit.uap.base, batteryBonus: unit.uap.batteryBonus, effective: unit.uap.effective, spent: 0, rejected: plan.reason });
      continue;
    }
    unit.position = { ...plan.destination };
    unit.activeRange = plan.activeRange;
    unit.rangeChanged = plan.rangeChanged;
    unit.uap.spent = plan.actions.length;
    unit.lastPlan = structuredClone(plan.actions);
    if (unit.chassis === "scout") {
      unit.condenseSteps = plan.condenseSteps;
      unit.calibration = defaultAttentionV4Rules.allocation.scoutCondense[plan.condenseSteps].calibration;
    } else if (unit.chassis === "line") {
      unit.condenseSteps = 0;
      unit.calibration = plan.stepUp ? 0.85 : plan.rangeChanged ? 0.2 : 0.6;
    } else {
      unit.condenseSteps = 0;
      unit.calibration = plan.uplink || plan.rangeChanged ? 0.2 : 0.9;
    }
    unit.uplinkQueued = unit.chassis === "heavy" && plan.uplink;
    for (const scoutUnitId of plan.scans) {
      const reservationId = `${state.matchId}:scan:r${state.round}:${unit.unitId}:${state.supportReservations.length}`;
      state.supportReservations.push({
        reservationId,
        ownerPlayerId: unit.ownerPlayerId,
        lineUnitId: unit.unitId,
        scoutUnitId,
        createdRound: state.round,
        attachedArtifactId: null,
        cancelled: false
      });
      events.push(event(state, "attention.v4.support-scan.reserved", unit.unitId, { reservationId, scoutUnitId }));
    }
    for (const action of plan.actionCoordinates) trafficActions.push({ unitId: unit.unitId, coordinate: action.coordinate, kind: action.action.kind });
    events.push(event(state, "attention.v4.kinetic.plan.resolved", unit.unitId, {
      playerId: unit.ownerPlayerId,
      unitId: unit.unitId,
      origin: plan.origin,
      destination: plan.destination,
      actions: plan.actions.map((action) => action.kind),
      uap: { base: unit.uap.base, batteryBonus: unit.uap.batteryBonus, effective: unit.uap.effective, spent: unit.uap.spent },
      calibration: unit.calibration,
      range: unit.activeRange,
      condenseSteps: plan.condenseSteps
    }));
    roundRecord(state).uap.push({ unitId: unit.unitId, base: unit.uap.base, batteryBonus: unit.uap.batteryBonus, effective: unit.uap.effective, spent: unit.uap.spent, actions: plan.actions.map((action) => action.kind) });
  }
  recomputeQueuedUplinks(state);

  const trafficByCell = new Map<string, number>();
  for (const action of trafficActions) {
    const key = coordinateKey(action.coordinate);
    trafficByCell.set(key, (trafficByCell.get(key) ?? 0) + 1);
    for (const artifact of state.artifacts) {
      if (artifact.resolution !== "pending" || artifact.verified || !insideZone(action.coordinate, artifact.position)) continue;
      artifact.localTraffic += 1;
      if (artifact.localTraffic > defaultAttentionV4Rules.trafficLimit && !artifact.overTaxReasons.includes("local-traffic")) {
        artifact.overTaxReasons.push("local-traffic");
      }
    }
  }
  state.traffic = [...trafficByCell.entries()].map(([key, actionCount]) => {
    const [x, y] = key.split(",").map(Number);
    return { coordinate: { x, y }, actionCount };
  }).sort((left, right) => left.coordinate.y - right.coordinate.y || left.coordinate.x - right.coordinate.x);
  roundRecord(state).artifacts.push(...state.artifacts.filter((artifact) => artifact.resolution === "pending").map((artifact) => ({
    kind: "kinetic-load",
    artifactId: artifact.artifactId,
    ownerPlayerId: artifact.ownerPlayerId,
    age: artifact.age,
    contextLimit: artifact.contextLimit,
    load: artifact.localTraffic,
    overTaxReasons: artifact.overTaxReasons
  })));
  applyActiveSmoke(state, events);
  state.phase = "artillery";
  events.push(event(state, "attention.v4.phase.artillery", null, {
    round: state.round,
    artilleryUnlocked: state.capacityTrack.artilleryUnlocked
  }));
  return { match: parsedMatch(state, match.rules), events };
}

export function forceDisplaceAttentionV4Unit(match: AttentionV4Match, unitId: string, destination: AttentionV4Coordinate): AttentionV4Transition {
  if (!inBounds(destination)) throw new Error("out_of_bounds");
  const state = clone(match);
  const unit = unitOf(state, unitId);
  const events: AttentionV4EventEnvelope[] = [];
  const origin = { ...unit.position };
  unit.position = { ...destination };
  unit.forcedDisplaced = true;
  unit.calibration = 0.2;
  unit.condenseSteps = 0;
  events.push(event(state, "attention.v4.unit.forced-displacement", unitId, { origin, destination }));
  return { match: parsedMatch(state, match.rules), events };
}

type ValidShot = {
  intent: Extract<AttentionV4ArtilleryIntent, { kind: "fire" }>;
  player: AttentionV4PlayerState;
  card: AttentionV4ShellCard;
  cooldownBefore: number;
  usedRetaliation: boolean;
  blocked: boolean;
  blockedBy: string[];
};

function artilleryCardReason(state: AttentionV4MatchState, player: AttentionV4PlayerState, cardId: string): string | null {
  if (state.phase !== "artillery") return "wrong-phase";
  if (!state.capacityTrack.artilleryUnlocked) return "capacity-rank-three-required";
  if (!player.armory.cards.some((card) => card.cardId === cardId)) return "card-unavailable";
  if (player.armory.cooldown > 0 && !player.armory.retaliationAvailable) return `cooldown-${player.armory.cooldown}`;
  return null;
}

function addCommandZone(state: AttentionV4MatchState, shot: ValidShot, kind: "flare" | "smoke"): void {
  state.zones.push({
    zoneId: `${state.matchId}:${kind}:r${state.round}:${shot.player.playerId}:${shot.card.cardId}`,
    ownerPlayerId: shot.player.playerId,
    center: { ...shot.intent.center },
    createdRound: state.round,
    kind,
    activeThroughCommandRound: state.round + 1
  });
}

export function resolveAttentionV4Artillery(match: AttentionV4Match, intentInputs: AttentionV4ArtilleryIntent[]): AttentionV4Transition {
  if (match.state.phase !== "artillery") throw new Error(`phase_mismatch:${match.state.phase}`);
  const state = clone(match);
  const events: AttentionV4EventEnvelope[] = [];
  const intents = intentInputs.map((intent) => AttentionV4ArtilleryIntentSchema.parse(intent));
  const byPlayer = new Map<string, AttentionV4ArtilleryIntent>();
  for (const intent of intents) {
    if (!state.players.some((player) => player.playerId === intent.playerId)) throw new Error(`player_unavailable:${intent.playerId}`);
    if (byPlayer.has(intent.playerId)) throw new Error(`duplicate_artillery_intent:${intent.playerId}`);
    byPlayer.set(intent.playerId, intent);
  }
  const missing = state.players.filter((player) => !byPlayer.has(player.playerId));
  if (missing.length > 0) throw new Error(`artillery_intent_incomplete:${missing.map((player) => player.playerId).join(",")}`);

  const shots: ValidShot[] = [];
  const priorRetaliation = new Map(state.players.map((player) => [player.playerId, player.armory.retaliationAvailable]));
  for (const player of state.players) player.armory.retaliationAvailable = false;
  for (const player of state.players) {
    const intent = byPlayer.get(player.playerId)!;
    if (intent.kind === "pass") {
      roundRecord(state).armoryTransitions.push({
        kind: "pass",
        playerId: player.playerId,
        cooldown: player.armory.cooldown,
        retaliationExpired: priorRetaliation.get(player.playerId) ?? false,
        hand: player.armory.cards.map((card) => card.cardId)
      });
      events.push(event(state, "attention.v4.artillery.passed", player.playerId, {
        retaliationExpired: priorRetaliation.get(player.playerId) ?? false
      }));
      continue;
    }
    const reason = artilleryCardReason(state, { ...player, armory: { ...player.armory, retaliationAvailable: priorRetaliation.get(player.playerId) ?? false } }, intent.cardId);
    if (reason) throw new Error(`artillery_illegal:${reason}`);
    const handBefore = player.armory.cards.map((candidate) => candidate.cardId);
    const cardIndex = player.armory.cards.findIndex((card) => card.cardId === intent.cardId);
    const [card] = player.armory.cards.splice(cardIndex, 1);
    const cooldownBefore = player.armory.cooldown;
    const usedRetaliation = cooldownBefore > 0;
    player.armory.cooldown = defaultAttentionV4Rules.abilities.artillery.cooldown;
    shots.push({ intent, player, card, cooldownBefore, usedRetaliation, blocked: false, blockedBy: [] });
    roundRecord(state).armoryTransitions.push({
      kind: "fire",
      playerId: player.playerId,
      cardId: card.cardId,
      shell: card.shell,
      cooldownBefore,
      cooldownAfter: player.armory.cooldown,
      usedRetaliation,
      handBefore,
      handAfter: player.armory.cards.map((candidate) => candidate.cardId)
    });
  }

  // Chaff is same-salvo priority and cannot itself be screened.
  for (const shot of shots.filter((candidate) => candidate.card.shell === "chaff").sort((left, right) => left.player.playerId.localeCompare(right.player.playerId))) {
    const zone: AttentionV4Zone = {
      zoneId: `${state.matchId}:chaff:r${state.round}:${shot.player.playerId}:${shot.card.cardId}`,
      ownerPlayerId: shot.player.playerId,
      center: { ...shot.intent.center },
      createdRound: state.round,
      kind: "chaff",
      activeThroughArtilleryRound: state.round + 1
    };
    state.zones.push(zone);
    events.push(event(state, "attention.v4.artillery.chaff.established", shot.player.playerId, {
      cardId: shot.card.cardId,
      zoneId: zone.zoneId,
      center: zone.center,
      activeThroughRound: zone.activeThroughArtilleryRound
    }));
  }

  const screens = activeChaffZones(state);
  for (const shot of shots.filter((candidate) => candidate.card.shell !== "chaff")) {
    shot.blockedBy = screens
      .filter((screen) => screen.ownerPlayerId !== shot.player.playerId && insideZone(shot.intent.center, screen.center))
      .map((screen) => screen.zoneId)
      .sort();
    shot.blocked = shot.blockedBy.length > 0;
  }

  const heArtifactIds = new Set<string>();
  for (const shot of shots.sort((left, right) => left.player.playerId.localeCompare(right.player.playerId))) {
    events.push(event(state, "attention.v4.artillery.shell.fired", shot.player.playerId, {
      cardId: shot.card.cardId,
      shell: shot.card.shell,
      center: shot.intent.center,
      cooldown: shot.player.armory.cooldown,
      usedRetaliation: shot.usedRetaliation,
      blocked: shot.blocked,
      blockedBy: shot.blockedBy
    }));
    roundRecord(state).armoryTransitions.push({
      kind: "salvo-result",
      playerId: shot.player.playerId,
      cardId: shot.card.cardId,
      shell: shot.card.shell,
      blocked: shot.blocked,
      blockedBy: shot.blockedBy
    });
    if (shot.blocked) {
      events.push(event(state, "attention.v4.artillery.shell.blocked", shot.player.playerId, {
        cardId: shot.card.cardId,
        shell: shot.card.shell,
        blockedBy: shot.blockedBy
      }));
      continue;
    }
    if (shot.card.shell === "flare") {
      addCommandZone(state, shot, "flare");
    } else if (shot.card.shell === "smoke") {
      addCommandZone(state, shot, "smoke");
    } else if (shot.card.shell === "emp") {
      const victims = state.units.filter((unit) => insideZone(unit.position, shot.intent.center));
      for (const victim of victims) {
        if (!victim.uap.nextFreezeSources.includes("emp")) victim.uap.nextFreezeSources.push("emp");
        if (!roundRecord(state).empVictims.includes(victim.unitId)) roundRecord(state).empVictims.push(victim.unitId);
      }
      events.push(event(state, "attention.v4.artillery.emp.applied", shot.player.playerId, {
        cardId: shot.card.cardId,
        victimUnitIds: victims.map((unit) => unit.unitId).sort(),
        effectiveRound: state.round + 1
      }));
    } else if (shot.card.shell === "he") {
      for (const artifact of state.artifacts) {
        if (artifact.resolution === "pending" && !artifact.verified && insideZone(artifact.position, shot.intent.center)) {
          heArtifactIds.add(artifact.artifactId);
        }
      }
    }
  }

  // HE from both fleets resolves as one bilateral batch and uses the artifact's
  // existing latent value. It never creates detonation paralysis.
  const heDeltas = new Map(state.players.map((player) => [player.playerId, { progress: 0, drift: 0 }]));
  const heResolved: AttentionV4ArtifactState[] = [];
  for (const artifactId of [...heArtifactIds].sort()) {
    const artifact = state.artifacts.find((candidate) => candidate.artifactId === artifactId);
    if (!artifact || artifact.resolution !== "pending" || artifact.verified) continue;
    const sound = artifact.sound || artifact.guarantee === "perfect-focus";
    const delta = heDeltas.get(artifact.ownerPlayerId)!;
    if (sound) {
      if (artifact.objectiveEligible) delta.progress += 1;
    } else delta.drift += 1;
    heResolved.push(artifact);
    const outcome = sound ? "he-sound" : "he-unsound";
    roundRecord(state).artifacts.push({ kind: "he-resolution", artifactId, ownerPlayerId: artifact.ownerPlayerId, outcome });
    events.push(event(state, "attention.v4.artillery.he.resolved", artifact.ownerPlayerId, {
      artifactId,
      outcome,
      objectiveEligible: artifact.objectiveEligible
    }));
  }
  for (const player of state.players) {
    const delta = heDeltas.get(player.playerId)!;
    player.progress += delta.progress;
    player.drift += delta.drift;
    if (delta.drift > 0) roundRecord(state).drift.push({ playerId: player.playerId, amount: delta.drift, source: "he" });
  }
  if (heResolved.length > 0) {
    const resolved = new Set(heResolved.map((artifact) => artifact.artifactId));
    state.artifacts = state.artifacts.filter((artifact) => !resolved.has(artifact.artifactId));
  }

  // Existing retaliation expires in this salvo. Only ordinary fire grants a
  // fresh next-salvo bypass; retaliatory shots cannot chain privileges.
  for (const shot of shots) {
    if (!shot.usedRetaliation) {
      const recipient = playerOf(state, otherPlayerId(state, shot.player.playerId));
      recipient.armory.retaliationAvailable = true;
      roundRecord(state).armoryTransitions.push({ kind: "retaliation-granted", sourcePlayerId: shot.player.playerId, playerId: recipient.playerId });
    }
  }
  applyActiveSmoke(state, events);
  state.phase = "capacity";
  events.push(event(state, "attention.v4.phase.capacity", null, {
    round: state.round,
    rank: state.capacityTrack.nextRank,
    priorityPlayerId: priorityPlayerId(state)
  }));
  return { match: parsedMatch(state, match.rules), events };
}

export function resolveAttentionV4Capacity(match: AttentionV4Match, inputIntents: AttentionV4CapacityIntent[]): AttentionV4Transition {
  if (match.state.phase !== "capacity") throw new Error(`phase_mismatch:${match.state.phase}`);
  const state = clone(match);
  const events: AttentionV4EventEnvelope[] = [];
  const intents = inputIntents.map((intent) => AttentionV4CapacityIntentSchema.parse(intent));
  const byPlayer = new Map<string, AttentionV4CapacityIntent>();
  for (const intent of intents) {
    playerOf(state, intent.playerId);
    if (byPlayer.has(intent.playerId)) throw new Error(`duplicate_capacity_intent:${intent.playerId}`);
    byPlayer.set(intent.playerId, intent);
  }
  if (byPlayer.size !== state.players.length) throw new Error("capacity_intent_incomplete");
  const slot = defaultAttentionV4Rules.capacitySlots[state.capacityTrack.nextRank - 1];
  if (slot) {
    const valid = state.players
      .filter((player) => byPlayer.get(player.playerId)!.claim && player.attention >= slot.cost)
      .sort((left, right) => left.playerId === priorityPlayerId(state) ? -1 : right.playerId === priorityPlayerId(state) ? 1 : left.playerId.localeCompare(right.playerId));
    const winner = valid[0] ?? null;
    if (winner) {
      winner.attention -= slot.cost;
      winner.capacityBonus += slot.capacityAward;
      winner.claimCount += 1;
      state.capacityTrack.claims.push({
        rank: slot.rank,
        playerId: winner.playerId,
        round: state.round,
        attentionPaid: slot.cost,
        capacityAward: slot.capacityAward
      });
      state.capacityTrack.nextRank += 1;
      if (slot.rank === defaultAttentionV4Rules.abilities.artillery.unlockRank) {
        state.capacityTrack.artilleryUnlockRound = state.round + 1;
      }
      events.push(event(state, "attention.v4.capacity.claimed", winner.playerId, {
        rank: slot.rank,
        attentionPaid: slot.cost,
        capacityAward: slot.capacityAward,
        artilleryUnlockRound: state.capacityTrack.artilleryUnlockRound
      }));
      for (const loser of valid.slice(1)) {
        events.push(event(state, "attention.v4.capacity.rejected", loser.playerId, { rank: slot.rank, reason: "priority-conflict" }));
      }
    }
    for (const player of state.players) {
      const intent = byPlayer.get(player.playerId)!;
      if (intent.claim && player.attention < slot.cost) {
        events.push(event(state, "attention.v4.capacity.rejected", player.playerId, { rank: slot.rank, reason: "attention", cost: slot.cost }));
      } else if (!intent.claim) {
        events.push(event(state, "attention.v4.capacity.passed", player.playerId, { rank: slot.rank }));
      }
    }
  } else {
    for (const player of state.players) events.push(event(state, "attention.v4.capacity.passed", player.playerId, { rank: null, trackComplete: true }));
  }
  state.phase = "command";
  state.command.activePlayerId = priorityPlayerId(state);
  state.command.endedPlayerIds = [];
  events.push(event(state, "attention.v4.phase.command", null, {
    round: state.round,
    activePlayerId: state.command.activePlayerId,
    globalRank: state.capacityTrack.nextRank - 1
  }));
  return { match: parsedMatch(state, match.rules), events };
}

function ownedPendingArtifact(state: AttentionV4MatchState, playerId: string, artifactId: string): AttentionV4ArtifactState | null {
  return state.artifacts.find((artifact) =>
    artifact.artifactId === artifactId && artifact.ownerPlayerId === playerId && artifact.resolution === "pending"
  ) ?? null;
}

function batteryEligible(artifact: AttentionV4ArtifactState): boolean {
  return artifact.verified && artifact.densityPct >= defaultAttentionV4Rules.battery.minimumDensityPct &&
    artifact.sourceCalibration >= defaultAttentionV4Rules.battery.minimumCalibration &&
    (artifact.sound || artifact.guarantee === "perfect-focus");
}

function activateBatteryIfEligible(state: AttentionV4MatchState, artifact: AttentionV4ArtifactState, events: AttentionV4EventEnvelope[]): void {
  if (!batteryEligible(artifact) || artifact.battery.active) return;
  artifact.battery.active = true;
  artifact.battery.activatedRound = state.round;
  refreshBatterySuppression(state);
  roundRecord(state).batteryFields.push({
    kind: "activation",
    artifactId: artifact.artifactId,
    ownerPlayerId: artifact.ownerPlayerId,
    center: artifact.position,
    suppressed: artifact.battery.suppressed,
    uapBonus: 1,
    verifyDiscount: artifact.battery.suppressed ? 0 : 1,
    seizeDiscount: artifact.battery.suppressed ? 0 : 1
  });
  events.push(event(state, "attention.v4.battery.activated", artifact.ownerPlayerId, {
    artifactId: artifact.artifactId,
    center: artifact.position,
    suppressed: artifact.battery.suppressed
  }));
}

function legalVerificationMode(state: AttentionV4MatchState, artifact: AttentionV4ArtifactState): { mode: "local" | "support-scan"; verifierUnitId: string } | null {
  const local = state.units
    .filter((unit) => unit.ownerPlayerId === artifact.ownerPlayerId && distance(unit.position, artifact.position) <= 1)
    .sort((left, right) => distance(left.position, artifact.position) - distance(right.position, artifact.position) || left.unitId.localeCompare(right.unitId));
  if (local[0]) return { mode: "local", verifierUnitId: local[0].unitId };
  const support = artifact.supportScanUnitIds
    .map((unitId) => state.units.find((unit) => unit.unitId === unitId && unit.ownerPlayerId === artifact.ownerPlayerId))
    .filter((unit): unit is AttentionV4UnitState => Boolean(unit))
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  return support[0] ? { mode: "support-scan", verifierUnitId: support[0].unitId } : null;
}

function artifactSpawnCells(unit: AttentionV4UnitState): AttentionV4Coordinate[] {
  return Array.from({ length: 100 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .filter((coordinate) => distance(coordinate, unit.position) >= 1 && distance(coordinate, unit.position) <= unit.activeRange);
}

function attachSupportReservations(
  state: AttentionV4MatchState,
  scout: AttentionV4UnitState,
  newborns: AttentionV4ArtifactState[],
  events: AttentionV4EventEnvelope[]
): void {
  const reservations = state.supportReservations
    .filter((reservation) => reservation.createdRound === state.round && reservation.scoutUnitId === scout.unitId &&
      reservation.attachedArtifactId === null && !reservation.cancelled)
    .sort((left, right) => left.reservationId.localeCompare(right.reservationId));
  const used = new Set<string>();
  for (const reservation of reservations) {
    const line = state.units.find((unit) => unit.unitId === reservation.lineUnitId && unit.chassis === "line");
    if (!line) continue;
    const target = newborns
      .filter((artifact) => !used.has(artifact.artifactId) && distance(line.position, artifact.position) <= line.activeRange)
      .sort((left, right) => distance(line.position, right.position) - distance(line.position, left.position) || left.artifactId.localeCompare(right.artifactId))[0];
    if (!target) continue;
    used.add(target.artifactId);
    reservation.attachedArtifactId = target.artifactId;
    target.supportScanUnitIds = [...new Set([...target.supportScanUnitIds, line.unitId])].sort();
    events.push(event(state, "attention.v4.support-scan.attached", line.unitId, {
      reservationId: reservation.reservationId,
      scoutUnitId: scout.unitId,
      artifactId: target.artifactId,
      distance: distance(line.position, target.position)
    }));
  }
}

function advanceCommandCadence(state: AttentionV4MatchState, actingPlayerId: string): void {
  const other = otherPlayerId(state, actingPlayerId);
  state.command.activePlayerId = state.command.endedPlayerIds.includes(other) ? actingPlayerId : other;
}

function compareTiebreak(left: AttentionV4PlayerState, right: AttentionV4PlayerState): number {
  if (left.progress !== right.progress) return left.progress - right.progress;
  if (left.drift !== right.drift) return right.drift - left.drift;
  return left.attention - right.attention;
}

function finishAttentionV4Match(state: AttentionV4MatchState, reason: "objective" | "drift" | "round-limit" | "simultaneous"): void {
  const [left, right] = state.players;
  const leftDefeated = left.status === "defeat";
  const rightDefeated = right.status === "defeat";
  let winner: AttentionV4PlayerState | null = null;
  if (leftDefeated !== rightDefeated) winner = leftDefeated ? right : left;
  else if (left.status === "victory" && right.status !== "victory") winner = left;
  else if (right.status === "victory" && left.status !== "victory") winner = right;
  else {
    const comparison = compareTiebreak(left, right);
    winner = comparison > 0 ? left : comparison < 0 ? right : null;
  }
  state.status = "complete";
  state.phase = "terminal";
  state.winnerPlayerId = winner?.playerId ?? null;
  state.terminalReason = reason;
  state.command.activePlayerId = null;
  if (winner) {
    winner.status = "victory";
    for (const player of state.players) if (player.playerId !== winner.playerId) player.status = "defeat";
  } else {
    for (const player of state.players) player.status = "draw";
  }
}

export function resolveAttentionV4Round(match: AttentionV4Match): AttentionV4Transition {
  if (match.state.phase !== "command") throw new Error(`phase_mismatch:${match.state.phase}`);
  const state = clone(match);
  const events: AttentionV4EventEnvelope[] = [];
  const completedRound = state.round;
  events.push(event(state, "attention.v4.resolution.started", null, { round: completedRound }));
  const hazards = projectAttentionV4Hazards(state);
  const removed = new Set<string>();
  const deltas = new Map(state.players.map((player) => [player.playerId, { progress: 0, drift: 0 }]));
  const resolutions: AttentionV4ResolutionRecap["resolutions"] = [];

  for (const hazard of hazards) {
    removed.add(hazard.artifactId);
    deltas.get(hazard.ownerPlayerId)!.drift += 2;
    for (const unitId of hazard.frozenUnitIds) {
      const unit = unitOf(state, unitId);
      if (!unit.uap.nextFreezeSources.includes("drift-detonation")) unit.uap.nextFreezeSources.push("drift-detonation");
    }
    roundRecord(state).detonations.push({ artifactId: hazard.artifactId, ownerPlayerId: hazard.ownerPlayerId, reasons: hazard.reasons, drift: 2, frozenUnitIds: hazard.frozenUnitIds });
    roundRecord(state).drift.push({ playerId: hazard.ownerPlayerId, amount: 2, source: "drift-detonation", artifactId: hazard.artifactId });
    events.push(event(state, "attention.v4.artifact.detonated", hazard.ownerPlayerId, {
      artifactId: hazard.artifactId,
      reasons: hazard.reasons,
      drift: 2,
      frozenUnitIds: hazard.frozenUnitIds
    }));
  }

  for (const artifact of [...state.artifacts].sort((left, right) => left.artifactId.localeCompare(right.artifactId))) {
    if (removed.has(artifact.artifactId) || artifact.resolution === "pending") continue;
    removed.add(artifact.artifactId);
    const delta = deltas.get(artifact.ownerPlayerId)!;
    if (artifact.resolution === "rejected") {
      resolutions.push({ artifactId: artifact.artifactId, outcome: "rejected" });
    } else if (artifact.resolution === "seized") {
      if (artifact.objectiveEligible) delta.progress += 1;
      resolutions.push({ artifactId: artifact.artifactId, outcome: "seized" });
    } else {
      const sound = artifact.sound || artifact.guarantee === "perfect-focus";
      if (sound) {
        if (artifact.objectiveEligible) delta.progress += 1;
        resolutions.push({ artifactId: artifact.artifactId, outcome: "sound" });
      } else {
        delta.drift += 1;
        resolutions.push({ artifactId: artifact.artifactId, outcome: "unsound" });
        roundRecord(state).drift.push({ playerId: artifact.ownerPlayerId, amount: 1, source: "accepted-unsound", artifactId: artifact.artifactId });
      }
    }
  }

  // Include HE outcomes from the same round in the accessible recap without
  // exposing the latent value that produced them.
  for (const item of roundRecord(state).artifacts) {
    if (item.kind === "he-resolution" && typeof item.artifactId === "string" && (item.outcome === "he-sound" || item.outcome === "he-unsound")) {
      resolutions.push({ artifactId: item.artifactId, outcome: item.outcome });
    }
  }

  // All bilateral effects are accumulated before either player's terminal
  // status is evaluated.
  for (const player of state.players) {
    const delta = deltas.get(player.playerId)!;
    player.progress += delta.progress;
    player.drift += delta.drift;
  }
  state.artifacts = state.artifacts.filter((artifact) => !removed.has(artifact.artifactId));
  state.supportReservations = [];
  for (const artifact of state.artifacts) artifact.supportScanUnitIds = [];

  for (const player of state.players) {
    player.status = player.drift >= defaultAttentionV4Rules.driftLimit
      ? "defeat"
      : player.progress >= defaultAttentionV4Rules.objectiveTarget
        ? "victory"
        : "active";
  }
  const terminalPlayers = state.players.filter((player) => player.status !== "active");
  const atRoundLimit = completedRound >= defaultAttentionV4Rules.roundLimit;
  if (terminalPlayers.length > 0 || atRoundLimit) {
    const reason = terminalPlayers.length === 0
      ? "round-limit"
      : terminalPlayers.length === state.players.length
        ? "simultaneous"
        : terminalPlayers[0].status === "defeat" ? "drift" : "objective";
    finishAttentionV4Match(state, reason);
  }

  const recap: AttentionV4ResolutionRecap = {
    completedRound,
    detonations: hazards,
    resolutions: resolutions.sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    players: state.players.map((player) => ({
      playerId: player.playerId,
      progress: player.progress,
      drift: player.drift,
      attention: player.attention,
      status: player.status
    })),
    terminal: state.status === "complete"
  };
  state.lastResolutionRecap = recap;
  events.push(event(state, "attention.v4.resolution.completed", null, recap));

  if (state.status === "active") {
    state.round += 1;
    events.push(...performRegister(state, false));
  }
  return { match: parsedMatch(state, match.rules), events };
}

export function applyAttentionV4Command(match: AttentionV4Match, inputIntent: AttentionV4CommandIntent): AttentionV4Transition {
  if (match.state.phase !== "command") throw new Error(`phase_mismatch:${match.state.phase}`);
  const intent = AttentionV4CommandIntentSchema.parse(inputIntent);
  const state = clone(match);
  const events: AttentionV4EventEnvelope[] = [];
  const player = playerOf(state, intent.playerId);
  const reject = (reason: string): AttentionV4Transition => {
    events.push(event(state, "attention.v4.command.rejected", intent.playerId, { intent, reason }));
    return { match: parsedMatch(state, match.rules), events };
  };
  if (state.command.activePlayerId !== intent.playerId) return reject("not-active-commander");
  if (state.command.endedPlayerIds.includes(intent.playerId)) return reject("command-ended");

  if (intent.kind === "emit") {
    const unit = state.units.find((candidate) => candidate.unitId === intent.unitId && candidate.ownerPlayerId === player.playerId);
    if (!unit) return reject("unit-unavailable");
    if (unit.outputDecision !== "pending") return reject("output-already-decided");
    if (unit.chassis === "scout") {
      const mode = defaultAttentionV4Rules.allocation.scoutCondense[unit.condenseSteps];
      if (intent.volume > mode.volumeCap) return reject("condense-volume-cap");
      if (intent.densityPct > mode.densityCapPct) return reject("condense-density-cap");
    }
    if (intent.volume * intent.densityPct > unit.reactorRating * 100) return reject("reactor-capacity");
    const effectiveCalibration = Number(((intent.densityPct / 100) * unit.calibration).toFixed(4));
    const flared = activeCommandZones(state, "flare").some((flare) => insideZone(unit.position, flare.center));
    const outputVolume = intent.volume * (flared ? defaultAttentionV4Rules.artillery.flareMultiplier : 1);
    const cells = artifactSpawnCells(unit);
    if (cells.length === 0) return reject("spawn-range-empty");
    const newborns: AttentionV4ArtifactState[] = [];
    for (let index = 0; index < outputVolume; index += 1) {
      const artifactId = `${state.matchId}:r${state.round}:${unit.unitId}:${index}`;
      const drawKey = `r${state.round}:${unit.unitId}:${index}`;
      const sound = keyedUnit(state.seed, state.randomStreamId, "sound", drawKey) < defaultAttentionV4Rules.soundnessRate;
      const noise = keyedUnit(state.seed, state.randomStreamId, "noise", drawKey);
      const signal = sound ? 0.75 : 0.25;
      const reportedConfidence = Number((effectiveCalibration * signal + (1 - effectiveCalibration) * noise).toFixed(4));
      const position = cells[Math.floor(keyedUnit(state.seed, state.randomStreamId, "position", drawKey) * cells.length)];
      const artifact: AttentionV4ArtifactState = {
        artifactId,
        ownerPlayerId: player.playerId,
        sourceUnitId: unit.unitId,
        sourceChassis: unit.chassis,
        position: { ...position },
        volumeIndex: index,
        densityPct: intent.densityPct,
        sourceCalibration: unit.calibration,
        effectiveCalibration,
        sound,
        reportedConfidence,
        verified: false,
        objectiveEligible: objectiveEligible(state, player.playerId, position),
        guarantee: null,
        guaranteedById: null,
        resolution: "pending",
        newbornRound: state.round,
        age: 0,
        contextLimit: chassisRules[unit.chassis].contextLimit,
        localTraffic: 0,
        overTaxReasons: [],
        supportScanUnitIds: [],
        battery: { active: false, activatedRound: null, suppressed: false }
      };
      state.artifacts.push(artifact);
      newborns.push(artifact);
      roundRecord(state).artifacts.push({
        kind: "emitted",
        artifactId,
        ownerPlayerId: player.playerId,
        sourceUnitId: unit.unitId,
        densityPct: intent.densityPct,
        sourceCalibration: unit.calibration,
        effectiveCalibration,
        age: 0,
        localTraffic: 0,
        soundKey: `${roundRecord(state).domainStreams.sound}:${drawKey}`,
        noiseKey: `${roundRecord(state).domainStreams.noise}:${drawKey}`,
        positionKey: `${roundRecord(state).domainStreams.position}:${drawKey}`
      });
    }
    unit.outputDecision = "emitted";
    if (unit.chassis === "scout") attachSupportReservations(state, unit, newborns, events);
    events.push(event(state, "attention.v4.output.emitted", unit.unitId, {
      playerId: player.playerId,
      unitId: unit.unitId,
      requestedVolume: intent.volume,
      outputVolume,
      densityPct: intent.densityPct,
      sourceCalibration: unit.calibration,
      effectiveCalibration,
      flared,
      artifactIds: newborns.map((artifact) => artifact.artifactId)
    }));
    roundRecord(state).artifacts.push({
      kind: "output-decision",
      decision: "emit",
      playerId: player.playerId,
      unitId: unit.unitId,
      requestedVolume: intent.volume,
      outputVolume,
      densityPct: intent.densityPct,
      sourceCalibration: unit.calibration,
      effectiveCalibration,
      flared
    });
  } else if (intent.kind === "hold") {
    const unit = state.units.find((candidate) => candidate.unitId === intent.unitId && candidate.ownerPlayerId === player.playerId);
    if (!unit) return reject("unit-unavailable");
    if (unit.outputDecision !== "pending") return reject("output-already-decided");
    unit.outputDecision = "held";
    roundRecord(state).artifacts.push({ kind: "output-decision", decision: "hold", playerId: player.playerId, unitId: unit.unitId });
    events.push(event(state, "attention.v4.output.held", unit.unitId, { playerId: player.playerId, unitId: unit.unitId }));
  } else if (intent.kind === "overclock") {
    const globalRank = state.capacityTrack.nextRank - 1;
    if (globalRank < defaultAttentionV4Rules.abilities.overclock.unlockRank) return reject("ability-locked");
    if (player.overclockUsed) return reject("uses-exhausted");
    if (player.overclockActive) return reject("already-active");
    player.overclockUsed = true;
    player.overclockActive = true;
    roundRecord(state).artifacts.push({ kind: "overclock", playerId: player.playerId, seizeDiscount: 1 });
    events.push(event(state, "attention.v4.overclock.activated", player.playerId, { round: state.round, seizeDiscount: 1 }));
  } else if (intent.kind === "end-command") {
    const undecided = state.units.filter((unit) => unit.ownerPlayerId === player.playerId && unit.outputDecision === "pending");
    if (undecided.length > 0) return reject("output-decisions-required");
    player.endedCommand = true;
    state.command.endedPlayerIds = [...new Set([...state.command.endedPlayerIds, player.playerId])];
    events.push(event(state, "attention.v4.command.ended", player.playerId, { round: state.round }));
    if (state.command.endedPlayerIds.length === state.players.length) {
      const resolved = resolveAttentionV4Round(parsedMatch(state, match.rules));
      return { match: resolved.match, events: [...events, ...resolved.events] };
    }
    state.command.activePlayerId = otherPlayerId(state, player.playerId);
    return { match: parsedMatch(state, match.rules), events };
  } else {
    const artifact = ownedPendingArtifact(state, player.playerId, intent.artifactId);
    if (!artifact) return reject("artifact-unavailable");
    if (intent.kind === "perfect-focus") {
      const globalRank = state.capacityTrack.nextRank - 1;
      if (globalRank < defaultAttentionV4Rules.abilities.perfectFocus.unlockRank) return reject("ability-locked");
      if (player.focusUses >= defaultAttentionV4Rules.abilities.perfectFocus.maxUses) return reject("uses-exhausted");
      if (state.round < player.focusNextReadyRound) return reject("cooldown");
      if (artifact.guarantee !== null) return reject("already-guaranteed");
      artifact.guarantee = "perfect-focus";
      artifact.guaranteedById = player.playerId;
      player.focusUses += 1;
      player.focusNextReadyRound = state.round + defaultAttentionV4Rules.abilities.perfectFocus.cooldownRounds;
      activateBatteryIfEligible(state, artifact, events);
      roundRecord(state).artifacts.push({ kind: "perfect-focus", playerId: player.playerId, artifactId: artifact.artifactId, nextReadyRound: player.focusNextReadyRound });
      events.push(event(state, "attention.v4.perfect-focus.applied", player.playerId, {
        artifactId: artifact.artifactId,
        nextReadyRound: player.focusNextReadyRound
      }));
    } else if (intent.kind === "verify") {
      if (artifact.verified) return reject("already-verified");
      const mode = legalVerificationMode(state, artifact);
      if (!mode) return reject("out-of-range");
      const cost = commandCost(state, artifact, "verify", player);
      if (player.attention < cost.total) return reject("attention");
      player.attention -= cost.total;
      artifact.verified = true;
      roundRecord(state).artifacts.push({
        kind: "verify",
        playerId: player.playerId,
        artifactId: artifact.artifactId,
        cost,
        densityPct: artifact.densityPct,
        sourceCalibration: artifact.sourceCalibration,
        effectiveCalibration: artifact.effectiveCalibration,
        age: artifact.age,
        load: artifact.localTraffic,
        overTaxReasons: artifact.overTaxReasons
      });
      events.push(event(state, "attention.v4.artifact.verified", player.playerId, {
        artifactId: artifact.artifactId,
        sound: artifact.sound,
        cost,
        verificationMode: mode.mode,
        verifierUnitId: mode.verifierUnitId,
        rescuedHazards: artifact.overTaxReasons
      }));
      activateBatteryIfEligible(state, artifact, events);
    } else if (intent.kind === "accept") {
      artifact.resolution = "accepted";
      artifact.battery.active = false;
      artifact.battery.suppressed = false;
      roundRecord(state).artifacts.push({ kind: "accept", playerId: player.playerId, artifactId: artifact.artifactId, batteryCommitted: artifact.battery.activatedRound !== null });
      events.push(event(state, "attention.v4.artifact.accepted", player.playerId, { artifactId: artifact.artifactId }));
    } else if (intent.kind === "reject") {
      artifact.resolution = "rejected";
      artifact.battery.active = false;
      artifact.battery.suppressed = false;
      roundRecord(state).artifacts.push({ kind: "reject", playerId: player.playerId, artifactId: artifact.artifactId, batteryCommitted: artifact.battery.activatedRound !== null });
      events.push(event(state, "attention.v4.artifact.rejected", player.playerId, { artifactId: artifact.artifactId }));
    } else if (intent.kind === "seize") {
      const cost = commandCost(state, artifact, "seize", player);
      if (player.attention < cost.total) return reject("attention");
      player.attention -= cost.total;
      artifact.resolution = "seized";
      artifact.battery.active = false;
      artifact.battery.suppressed = false;
      roundRecord(state).artifacts.push({ kind: "seize", playerId: player.playerId, artifactId: artifact.artifactId, cost, batteryCommitted: artifact.battery.activatedRound !== null });
      events.push(event(state, "attention.v4.artifact.seized", player.playerId, { artifactId: artifact.artifactId, cost }));
    }
  }
  refreshBatterySuppression(state);
  advanceCommandCadence(state, player.playerId);
  return { match: parsedMatch(state, match.rules), events };
}

export function projectAttentionV4Match(match: AttentionV4Match, viewerPlayerId: string): AttentionV4Projection {
  playerOf(match.state, viewerPlayerId);
  const {
    seed: _seed,
    randomStreamId: _randomStreamId,
    artifacts: _artifacts,
    roundRecords: _roundRecords,
    ...publicState
  } = structuredClone(match.state);
  return AttentionV4ProjectionSchema.parse({
    ...publicState,
    viewerPlayerId,
    artifacts: match.state.artifacts.map(({ sound, ...artifact }) => ({
      ...structuredClone(artifact),
      revealedSound: artifact.verified ? sound : null
    })),
    activeFronts: match.state.players.map((player) => currentFront(match.state, player.playerId))
  });
}

function previewForCard(
  state: AttentionV4MatchState,
  player: AttentionV4PlayerState,
  card: AttentionV4ShellCard,
  center: AttentionV4Coordinate
): AttentionV4Legal["artilleryPreviews"][number] {
  const blockedByScreenIds = card.shell === "chaff" ? [] : activeChaffZones(state)
    .filter((screen) => screen.ownerPlayerId !== player.playerId && insideZone(center, screen.center))
    .map((screen) => screen.zoneId)
    .sort();
  const blocked = blockedByScreenIds.length > 0;
  const affectedUnitIds = blocked || card.shell === "he" || card.shell === "chaff"
    ? []
    : state.units.filter((unit) => insideZone(unit.position, center)).map((unit) => unit.unitId).sort();
  const affectedArtifactIds = blocked || card.shell !== "he"
    ? []
    : state.artifacts.filter((artifact) => artifact.resolution === "pending" && !artifact.verified && insideZone(artifact.position, center))
      .map((artifact) => artifact.artifactId).sort();
  const affectedBatteryIds = blocked || card.shell !== "smoke"
    ? []
    : state.artifacts.filter((artifact) => artifact.battery.active && insideZone(artifact.position, center))
      .map((artifact) => artifact.artifactId).sort();
  return { cardId: card.cardId, center, blockedByScreenIds, affectedUnitIds, affectedArtifactIds, affectedBatteryIds };
}

export function legalAttentionV4Actions(match: AttentionV4Match, viewerPlayerId: string): AttentionV4Legal {
  const state = match.state;
  const player = playerOf(state, viewerPlayerId);
  const active = state.phase === "command" && state.command.activePlayerId === viewerPlayerId && !state.command.endedPlayerIds.includes(viewerPlayerId);
  const slot = defaultAttentionV4Rules.capacitySlots[state.capacityTrack.nextRank - 1] ?? null;
  const shellCards = player.armory.cards.map((card) => {
    const reason = artilleryCardReason(state, player, card.cardId);
    return {
      cardId: card.cardId,
      shell: card.shell,
      legal: reason === null,
      reason,
      usesRetaliation: reason === null && player.armory.cooldown > 0
    };
  });
  const artilleryPreviews = state.phase === "artillery"
    ? player.armory.cards.flatMap((card) => Array.from({ length: 100 }, (_, index) =>
      previewForCard(state, player, card, { x: index % 10, y: Math.floor(index / 10) })
    ))
    : [];
  const ownUnits = state.units.filter((unit) => unit.ownerPlayerId === viewerPlayerId);
  const densities = defaultAttentionV4Rules.allocation.densities;
  const allocations = ownUnits.map((unit) => {
    const scoutMode = unit.chassis === "scout" ? defaultAttentionV4Rules.allocation.scoutCondense[unit.condenseSteps] : null;
    const prefill = scoutMode
      ? { volume: scoutMode.volumeCap, densityPct: scoutMode.densityCapPct }
      : defaultAttentionV4Rules.allocation.prefill[unit.chassis];
    const maximumVolume = scoutMode?.volumeCap ?? Math.floor(unit.reactorRating * 100 / 20);
    const maximumDensityPct = scoutMode?.densityCapPct ?? 100;
    return {
      unitId: unit.unitId,
      reactorRating: unit.reactorRating,
      prefillVolume: prefill.volume,
      prefillDensityPct: prefill.densityPct,
      condenseSteps: unit.condenseSteps,
      maximumVolume,
      maximumDensityPct,
      maximumVolumeByDensity: Object.fromEntries(densities.map((density) => [String(density), density <= maximumDensityPct
        ? Math.min(maximumVolume, Math.floor(unit.reactorRating * 100 / density))
        : 0])),
      decision: unit.outputDecision
    };
  });
  const artifacts = state.artifacts
    .filter((artifact) => artifact.ownerPlayerId === viewerPlayerId && artifact.resolution === "pending")
    .map((artifact) => {
      const verifyCost = commandCost(state, artifact, "verify", player);
      const seizeCost = commandCost(state, artifact, "seize", player);
      const verificationMode = legalVerificationMode(state, artifact);
      const verifyReason = !active ? "not-active-commander"
        : artifact.verified ? "already-verified"
          : !verificationMode ? "out-of-range"
            : player.attention < verifyCost.total ? "attention" : null;
      const seizeReason = !active ? "not-active-commander" : player.attention < seizeCost.total ? "attention" : null;
      return {
        artifactId: artifact.artifactId,
        verify: { legal: verifyReason === null, reason: verifyReason, cost: verifyCost },
        seize: { legal: seizeReason === null, reason: seizeReason, cost: seizeCost },
        // Soundness remains hidden until Verify. This flag authoritatively
        // reports the public structural half of Battery eligibility.
        batteryEligibleOnVerify: artifact.densityPct >= defaultAttentionV4Rules.battery.minimumDensityPct &&
          artifact.sourceCalibration >= defaultAttentionV4Rules.battery.minimumCalibration
      };
    });
  const globalRank = state.capacityTrack.nextRank - 1;
  const focusReady = active && globalRank >= 1 && player.focusUses < 3 && state.round >= player.focusNextReadyRound;
  const overclockReady = active && globalRank >= 2 && !player.overclockUsed && !player.overclockActive;
  const undecided = ownUnits.filter((unit) => unit.outputDecision === "pending");
  const canEndCommand = active && undecided.length === 0;
  return {
    phase: state.phase,
    activeCommanderId: state.command.activePlayerId,
    kinetic: state.phase === "kinetic" ? ownUnits.map((unit) => ({
      unitId: unit.unitId,
      baseUap: unit.uap.base,
      batteryBonus: unit.uap.batteryBonus,
      effectiveUap: unit.uap.effective,
      frozen: unit.uap.frozen,
      maxSupportScans: unit.chassis === "line" ? unit.uap.batteryBonus ? 2 : 1 : 0,
      condenseSteps: unit.condenseSteps,
      maxCondenseSteps: unit.chassis === "scout" ? 2 : 0,
      range: { current: unit.activeRange, minimum: 1 as const, maximum: 5 as const }
    })) : [],
    shellCards,
    artilleryPreviews,
    capacity: {
      available: state.phase === "capacity" && slot !== null,
      rank: slot?.rank ?? null,
      cost: slot?.cost ?? null,
      award: slot?.capacityAward ?? null,
      affordable: state.phase === "capacity" && slot !== null && player.attention >= slot.cost
    },
    allocations,
    artifacts,
    abilities: {
      perfectFocus: {
        ready: focusReady,
        reason: focusReady ? null : !active ? "not-active-commander" : globalRank < 1 ? "capacity-rank-required" : player.focusUses >= 3 ? "uses-exhausted" : "cooldown",
        usesRemaining: Math.max(0, 3 - player.focusUses),
        nextReadyRound: player.focusNextReadyRound
      },
      overclock: {
        ready: overclockReady,
        reason: overclockReady ? null : !active ? "not-active-commander" : globalRank < 2 ? "capacity-rank-required" : player.overclockUsed ? "uses-exhausted" : "already-active",
        usesRemaining: player.overclockUsed ? 0 : 1
      }
    },
    canEndCommand,
    endCommandReason: canEndCommand ? null : !active ? "not-active-commander" : undecided.length > 0 ? `${undecided.length} output decision(s) required` : "unavailable",
    projectedHazards: projectAttentionV4Hazards(state)
  };
}

export type AttentionV4ReducerAction =
  | { kind: "kinetic"; plans: AttentionV4KineticPlan[] }
  | { kind: "artillery"; intents: AttentionV4ArtilleryIntent[] }
  | { kind: "capacity"; intents: AttentionV4CapacityIntent[] }
  | { kind: "command"; intent: AttentionV4CommandIntent }
  | { kind: "resolution" };

/** A single pure reducer entry point for replay and conformance harnesses. */
export function reduceAttentionV4(match: AttentionV4Match, action: AttentionV4ReducerAction): AttentionV4Transition {
  switch (action.kind) {
    case "kinetic": return resolveAttentionV4Kinetic(match, action.plans);
    case "artillery": return resolveAttentionV4Artillery(match, action.intents);
    case "capacity": return resolveAttentionV4Capacity(match, action.intents);
    case "command": return applyAttentionV4Command(match, action.intent);
    case "resolution": return resolveAttentionV4Round(match);
  }
}

export function attentionV4StateHash(state: AttentionV4MatchState): `sha256:${string}` {
  return attentionV4ContentHash(state);
}
