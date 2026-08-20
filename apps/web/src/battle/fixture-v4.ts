import type { AttentionV4Phase, BattleCommandV3View } from "@landscape/contracts";

const hash = `sha256:${"1".repeat(64)}`;

export function battleViewFixture(phase: AttentionV4Phase = "kinetic", options: { hazard?: boolean; terminal?: boolean } = {}): BattleCommandV3View {
  const command = phase === "command";
  const terminal = options.terminal ?? phase === "terminal";
  const units = ([
    ["alpha:scout-1", "alpha", "scout", 1, 1, 2, 3, 3, 0.65],
    ["alpha:line-1", "alpha", "line", 1, 2, 3, 2, 2, 0.6],
    ["alpha:heavy-1", "alpha", "heavy", 2, 1, 4, 1, 1, 0.9],
    ["bravo:scout-1", "bravo", "scout", 8, 8, 2, 3, 3, 0.65],
    ["bravo:line-1", "bravo", "line", 8, 7, 3, 2, 2, 0.6],
    ["bravo:heavy-1", "bravo", "heavy", 7, 8, 4, 1, 1, 0.9]
  ] as const).map(([unitId, ownerPlayerId, chassis, x, y, activeRange, reactorRating, base, calibration]) => ({
    unitId, ownerPlayerId, chassis, position: { x, y }, activeRange, reactorRating, calibration,
    condenseSteps: chassis === "scout" ? 1 : 0, rangeChanged: false, forcedDisplaced: false,
    outputDecision: command ? "held" as const : "pending" as const, uplinkQueued: false,
    uap: { base, batteryBonus: 0, effective: base, spent: 0, frozen: false, freezeSources: [], nextFreezeSources: [] },
    lastPlan: []
  }));
  const artifact = {
    artifactId: "fixture:r1:alpha:line-1:0", ownerPlayerId: "alpha", sourceUnitId: "alpha:line-1", sourceChassis: "line" as const,
    position: { x: 2, y: 2 }, volumeIndex: 0, densityPct: 80, sourceCalibration: 0.85, effectiveCalibration: 0.68,
    reportedConfidence: 0.74, verified: false, revealedSound: null, objectiveEligible: true, guarantee: null, guaranteedById: null,
    resolution: "pending" as const, newbornRound: 1, age: options.hazard ? 3 : 1, contextLimit: 2, localTraffic: options.hazard ? 4 : 1,
    overTaxReasons: options.hazard ? ["context-limit" as const, "local-traffic" as const] : [], supportScanUnitIds: [],
    battery: { active: false, activatedRound: null, suppressed: false }
  };
  const cards = (["flare", "smoke", "emp", "he", "chaff"] as const).map((shell, drawOrdinal) => ({ cardId: `card-alpha-${shell}`, shell, drawnRound: 1, drawOrdinal }));
  const enemyCards = (["flare", "smoke", "emp", "he", "chaff"] as const).map((shell, drawOrdinal) => ({ cardId: `card-bravo-${shell}`, shell, drawnRound: 1, drawOrdinal }));
  const register = {
    round: 1,
    attention: [{ playerId: "alpha", total: 3 }, { playerId: "bravo", total: 3 }],
    uap: units.map((unit) => ({ unitId: unit.unitId, base: unit.uap.base, batteryBonus: 0, effective: unit.uap.base, frozen: false })),
    reloads: [{ playerId: "alpha", cardIds: [] }, { playerId: "bravo", cardIds: [] }],
    agedArtifactIds: [], artilleryUnlocked: phase === "artillery"
  };
  const projection = {
    schemaVersion: 3 as const, modelVersion: "duel-capacity-v3-experimental" as const, rulesetVersion: "attention-economy-v4.2" as const,
    rulesetHash: hash, resolverVersion: "attention-v4.2-resolver-1" as const, compiledCommanderHashes: [hash, hash] as [string, string],
    matchId: "fixture-battle", scenarioId: "mirrored-fronts-v4", scenarioVersion: 4, round: terminal ? 8 : 1, phase,
    status: terminal ? "complete" as const : "active" as const, winnerPlayerId: terminal ? "alpha" : null,
    terminalReason: terminal ? "round-limit" as const : null, eventSequence: 3,
    players: [
      { playerId: "alpha", attention: 3, baseAttention: 3 as const, capacityBonus: 0, queuedUplinkBonus: 0, progress: terminal ? 8 : 0, drift: terminal ? 2 : 0, status: terminal ? "victory" as const : "active" as const, claimCount: 0, focusNextReadyRound: 1, focusUses: 0, overclockUsed: false, overclockActive: false, endedCommand: false, armory: { cards, cooldown: 0, retaliationAvailable: false, nextDrawOrdinal: 5 } },
      { playerId: "bravo", attention: 3, baseAttention: 3 as const, capacityBonus: 0, queuedUplinkBonus: 0, progress: terminal ? 6 : 0, drift: terminal ? 3 : 0, status: terminal ? "defeat" as const : "active" as const, claimCount: 0, focusNextReadyRound: 1, focusUses: 0, overclockUsed: false, overclockActive: false, endedCommand: false, armory: { cards: enemyCards, cooldown: 2, retaliationAvailable: true, nextDrawOrdinal: 5 } }
    ],
    units, artifacts: command || options.hazard ? [artifact] : [], zones: [], supportReservations: [], traffic: [],
    capacityTrack: { nextRank: 1, claims: [], artilleryUnlocked: phase === "artillery", artilleryUnlockRound: phase === "artillery" ? 1 : null },
    command: { activePlayerId: command ? "alpha" : null, endedPlayerIds: [] }, lastRegisterRecap: register, lastResolutionRecap: null,
    viewerPlayerId: "alpha", activeFronts: [{ playerId: "alpha", center: { x: 2, y: 2 }, radius: 1 }, { playerId: "bravo", center: { x: 7, y: 7 }, radius: 1 }]
  };
  const hazard = options.hazard ? [{ artifactId: artifact.artifactId, ownerPlayerId: "alpha", reasons: ["context-limit" as const, "local-traffic" as const], drift: 2 as const, frozenUnitIds: ["alpha:scout-1", "alpha:line-1"] }] : [];
  const chassis = {
    scout: { uap: 3 as const, reactorRating: 3 as const, calibration: 0.2 as const, range: 2 as const, contextLimit: 1 as const, seizeCost: 1 as const },
    line: { uap: 2 as const, reactorRating: 2 as const, calibration: 0.6 as const, range: 3 as const, contextLimit: 2 as const, seizeCost: 2 as const },
    heavy: { uap: 1 as const, reactorRating: 1 as const, calibration: 0.9 as const, range: 4 as const, contextLimit: 3 as const, seizeCost: 3 as const }
  };
  return {
    schemaVersion: 3, revision: 0, modelVersion: "duel-capacity-v3-experimental", stateSchemaVersion: 3,
    rulesetVersion: "attention-economy-v4.2", rulesetHash: hash, resolverVersion: "attention-v4.2-resolver-1", compiledCommanderHashes: [hash, hash],
    projection: projection as unknown as BattleCommandV3View["projection"], events: [],
    rules: {
      rulesetVersion: "attention-economy-v4.2", rulesetHash: hash, resolverVersion: "attention-v4.2-resolver-1", scenarioLabel: "The Contested Context", opponentLabel: "Threshold Doctrine",
      board: { width: 10, height: 10, distanceMetric: "chebyshev", exclusiveOccupancy: true }, roundLimit: 8, attentionPerRound: 3, objectiveTarget: 12, driftLimit: 4, soundnessRate: 0.7, verifyCost: 1, chassis,
      fleet: { weight: 6, chassisWeights: { scout: 1, line: 2, heavy: 3 }, minimumUnits: 3, maximumUnits: 5, maximumHeavies: 1, maximumScouts: 4 },
      range: { minimum: 1, maximum: 5, spawnMinimum: 1 }, trafficLimit: 3,
      battery: { fieldSize: 3, kineticBonus: 1, commandDiscount: 1, minimumDensityPct: 80, minimumCalibration: 0.8 },
      allocation: { densities: Array.from({ length: 17 }, (_, index) => 20 + index * 5), prefill: { scout: { volume: 3, densityPct: 20 }, line: { volume: 2, densityPct: 60 }, heavy: { volume: 1, densityPct: 90 } }, scoutCondense: [{ steps: 0, volumeCap: 3, densityCapPct: 20, calibration: 0.2 }, { steps: 1, volumeCap: 2, densityCapPct: 60, calibration: 0.65 }, { steps: 2, volumeCap: 1, densityCapPct: 90, calibration: 0.85 }] },
      capacitySlots: [{ rank: 1, cost: 1, capacityAward: 1 }, { rank: 2, cost: 2, capacityAward: 1 }, { rank: 3, cost: 3, capacityAward: 3 }, { rank: 4, cost: 5, capacityAward: 5 }, { rank: 5, cost: 8, capacityAward: 8 }],
      abilities: { perfectFocus: { unlockRank: 1, cooldownRounds: 3, maxUses: 3 }, overclock: { unlockRank: 2, seizeDiscount: 1, maxUses: 1 }, artillery: { unlockRank: 3, cooldown: 3, reloadThreshold: 3, reloadTo: 5 } },
      artillery: { shells: ["flare", "smoke", "emp", "he", "chaff"], zoneSize: 3, durationWindows: 2, flareMultiplier: 2 }
    },
    legal: {
      phase, activeCommanderId: command ? "alpha" : null,
      kinetic: phase === "kinetic" ? units.filter((unit) => unit.ownerPlayerId === "alpha").map((unit) => ({ unitId: unit.unitId, baseUap: unit.uap.base, batteryBonus: 0, effectiveUap: unit.uap.base, frozen: false, condenseSteps: unit.condenseSteps, maxCondenseSteps: unit.chassis === "scout" ? 2 : 0, maxSupportScans: unit.chassis === "line" ? 1 : 0, range: { current: unit.activeRange, minimum: 1, maximum: 5 } })) : [],
      shellCards: cards.map((card) => ({ cardId: card.cardId, shell: card.shell, legal: phase === "artillery", reason: phase === "artillery" ? null : "wrong-phase", usesRetaliation: false })), artilleryPreviews: [],
      capacity: { available: phase === "capacity", rank: 1, cost: 1, award: 1, affordable: phase === "capacity" },
      allocations: units.filter((unit) => unit.ownerPlayerId === "alpha").map((unit) => { const maximumVolume = unit.chassis === "scout" ? 2 : unit.reactorRating; const maximumDensityPct = unit.chassis === "scout" ? 60 : 100; return { unitId: unit.unitId, reactorRating: unit.reactorRating, condenseSteps: unit.condenseSteps, prefillVolume: unit.chassis === "scout" ? 2 : unit.reactorRating, prefillDensityPct: unit.chassis === "scout" ? 60 : unit.chassis === "line" ? 60 : 90, maximumVolume, maximumDensityPct, maximumVolumeByDensity: Object.fromEntries(Array.from({ length: 17 }, (_, index) => 20 + index * 5).map((density) => [String(density), density <= maximumDensityPct ? Math.min(maximumVolume, Math.floor(unit.reactorRating * 100 / density)) : 0])), decision: unit.outputDecision }; }),
      artifacts: command ? [{ artifactId: artifact.artifactId, verify: { legal: true, reason: null, cost: { base: 1, batteryDiscount: 0, overclockDiscount: 0, total: 1, batteryArtifactId: null } }, seize: { legal: true, reason: null, cost: { base: 2, batteryDiscount: 0, overclockDiscount: 0, total: 2, batteryArtifactId: null } }, batteryEligibleOnVerify: true }] : [],
      abilities: { perfectFocus: { ready: command, reason: command ? null : "not-active-commander", usesRemaining: 3, nextReadyRound: 1 }, overclock: { ready: false, reason: "capacity-rank-required", usesRemaining: 1 } },
      canEndCommand: command, endCommandReason: command ? null : "not-active-commander", projectedHazards: hazard
    },
    recaps: { register, resolution: null }
  };
}
