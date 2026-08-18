import type {
  AttentionArtilleryIntent,
  AttentionCommandIntent,
  AttentionCoordinate,
  AttentionMatchState,
  AttentionMovementIntent,
  AttentionProjectedArtifact,
  AttentionProjection,
  BattleCommandRules,
  BattleCommandSubmission,
  BattleCommandView,
  EventEnvelope
} from "@landscape/contracts";
import {
  applyAttentionIntent,
  attentionCompositions,
  createAttentionMatch,
  defaultAttentionModel,
  defaultAttentionScenario,
  defaultAttentionV3Artillery,
  defaultAttentionV3Spatial,
  defaultAttentionV3Uap,
  projectAttentionMatch,
  resolveAttentionArtillery,
  resolveAttentionCapacity,
  resolveAttentionEmission,
  resolveAttentionMovement,
  resolveAttentionRound,
  resolveAttentionV3ArtilleryContext,
  type AttentionMatch,
  type AttentionRuntimeContext
} from "@landscape/engine";

export const BATTLE_PLAYER_ID = "alpha";
export const BATTLE_AI_ID = "bravo";

export type StoredBattleCommandMatch = {
  state: AttentionMatchState;
  events: EventEnvelope[];
  revision: number;
};

export function battleCommandContext(): AttentionRuntimeContext {
  return resolveAttentionV3ArtilleryContext(
    defaultAttentionModel,
    defaultAttentionScenario,
    defaultAttentionV3Uap,
    defaultAttentionV3Spatial,
    {
      ...defaultAttentionV3Artillery,
      startingHand: { flare: 1, chaff: 1, he: 1, smoke: 1 }
    }
  );
}

function hydrate(stored: StoredBattleCommandMatch): AttentionMatch {
  return { state: stored.state, context: battleCommandContext() };
}

function append(stored: StoredBattleCommandMatch, match: AttentionMatch, events: EventEnvelope[]): StoredBattleCommandMatch {
  return {
    state: match.state,
    events: [...stored.events, ...events],
    revision: stored.revision + 1
  };
}

function separation(left: AttentionCoordinate, right: AttentionCoordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function densestCenter(coordinates: AttentionCoordinate[], fallback: AttentionCoordinate): AttentionCoordinate {
  if (coordinates.length === 0) return fallback;
  return Array.from({ length: 100 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .map((center) => ({ center, count: coordinates.filter((point) => separation(point, center) <= 1).length }))
    .sort((left, right) => right.count - left.count || left.center.x - right.center.x || left.center.y - right.center.y)[0].center;
}

function aiArtillery(projection: AttentionProjection): AttentionArtilleryIntent {
  const ai = projection.players.find((player) => player.playerId === BATTLE_AI_ID)!;
  const available = ai.artillery?.hand;
  const preferred = (["flare", "smoke", "he", "chaff"] as const)[(projection.round - 1) % 4];
  const shell = available?.[preferred] ? preferred
    : (["flare", "chaff", "smoke", "he"] as const).find((candidate) => (available?.[candidate] ?? 0) > 0);
  if (!shell) return { kind: "pass-artillery", playerId: BATTLE_AI_ID };
  const humanArtifacts = projection.artifacts.filter((artifact) => artifact.ownerPlayerId === BATTLE_PLAYER_ID && artifact.resolution === "pending");
  const aiArtifacts = projection.artifacts.filter((artifact) => artifact.ownerPlayerId === BATTLE_AI_ID && artifact.resolution === "pending");
  const humanUnits = projection.units.filter((unit) => unit.ownerPlayerId === BATTLE_PLAYER_ID);
  const aiUnits = projection.units.filter((unit) => unit.ownerPlayerId === BATTLE_AI_ID);
  const coordinates = shell === "he" ? aiArtifacts.map((artifact) => artifact.position)
    : shell === "chaff" ? aiUnits.map((unit) => unit.position)
      : shell === "smoke" ? humanUnits.map((unit) => unit.position)
        : humanArtifacts.map((artifact) => artifact.position);
  const fallback = shell === "he" || shell === "chaff" ? { x: 7, y: 7 } : { x: 2, y: 2 };
  return { kind: "fire-artillery", playerId: BATTLE_AI_ID, shell, center: densestCenter(coordinates, fallback) };
}

function pendingArtifacts(projection: AttentionProjection, playerId: string): AttentionProjectedArtifact[] {
  return projection.artifacts
    .filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending")
    .sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId));
}

function aiCommand(projection: AttentionProjection): AttentionCommandIntent {
  const pending = pendingArtifacts(projection, BATTLE_AI_ID);
  if (pending.length === 0) return { kind: "end-command", playerId: BATTLE_AI_ID };
  const revealedUnsound = pending.find((artifact) => artifact.revealedSound === false);
  if (revealedUnsound) return { kind: "reject", playerId: BATTLE_AI_ID, artifactId: revealedUnsound.artifactId };
  const revealedSound = pending.find((artifact) => artifact.revealedSound === true);
  if (revealedSound) return { kind: "accept", playerId: BATTLE_AI_ID, artifactId: revealedSound.artifactId };
  const player = projection.players.find((candidate) => candidate.playerId === BATTLE_AI_ID)!;
  const units = projection.units.filter((unit) => unit.ownerPlayerId === BATTLE_AI_ID);
  const context = battleCommandContext();
  const ruleset = rules();
  const rank = player.claimCount;
  const focusReady = rank >= ruleset.abilities.perfectFocus.unlockRank &&
    player.focusUses < ruleset.abilities.perfectFocus.maxUses && projection.round >= player.focusNextReadyRound;
  const overclockReady = rank >= ruleset.abilities.overclock.unlockRank &&
    !player.overclockUsed && ruleset.abilities.overclock.maxUses > 0 && !player.overclockActive;
  const focusTarget = pending.find((artifact) => artifact.guarantee === null);
  const expensiveTarget = pending.find((artifact) => {
    const source = units.find((unit) => unit.unitId === artifact.sourceUnitId);
    return source && ruleset.chassis[source.chassis].seizeCost > ruleset.abilities.overclock.seizeDiscount && player.attention >= ruleset.chassis[source.chassis].seizeCost - ruleset.abilities.overclock.seizeDiscount;
  });
  if (overclockReady && expensiveTarget) return { kind: "overclock", playerId: BATTLE_AI_ID };
  if (focusReady && focusTarget) return { kind: "perfect-focus", playerId: BATTLE_AI_ID, artifactId: focusTarget.artifactId };
  const seizeTarget = pending.find((artifact) => {
    const source = units.find((unit) => unit.unitId === artifact.sourceUnitId);
    if (!source) return false;
    const cost = Math.max(0, context.model.chassis[source.chassis].seizeCost - (player.overclockActive ? context.model.capacity.overclock.seizeDiscount : 0));
    return player.attention >= cost;
  });
  if (seizeTarget) return { kind: "seize", playerId: BATTLE_AI_ID, artifactId: seizeTarget.artifactId };
  const reachable = pending.find((artifact) =>
    (artifact.supportScanUnitIds?.length ?? 0) > 0 || units.some((unit) => separation(unit.position, artifact.position) <= 1)
  );
  if (reachable && player.attention >= 1) return { kind: "verify", playerId: BATTLE_AI_ID, artifactId: reachable.artifactId };
  const target = pending[0];
  return target.reportedConfidence < 0.5
    ? { kind: "reject", playerId: BATTLE_AI_ID, artifactId: target.artifactId }
    : { kind: "accept", playerId: BATTLE_AI_ID, artifactId: target.artifactId };
}

function aiMovement(projection: AttentionProjection): AttentionMovementIntent[] {
  const ownUnits = projection.units.filter((unit) => unit.ownerPlayerId === BATTLE_AI_ID);
  const ownArtifacts = projection.artifacts.filter((artifact) => artifact.ownerPlayerId === BATTLE_AI_ID && artifact.resolution === "pending");
  const front = projection.activeFronts.find((candidate) => candidate.playerId === BATTLE_AI_ID)!;
  return ownUnits.map((unit) => {
    if (unit.chassis === "line") {
      const scanTarget = ownArtifacts
        .filter((artifact) => separation(unit.position, artifact.position) <= (unit.spatial?.activeRange ?? 0))
        .sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId))[0];
      if (scanTarget) return { kind: "unit-actions", playerId: BATTLE_AI_ID, unitId: unit.unitId, actions: [{ kind: "support-scan", artifactId: scanTarget.artifactId }] };
      return { kind: "unit-actions", playerId: BATTLE_AI_ID, unitId: unit.unitId, actions: [{ kind: "step-up" }] };
    }
    if (unit.chassis === "siege") {
      return { kind: "unit-actions", playerId: BATTLE_AI_ID, unitId: unit.unitId, actions: [{ kind: "command-uplink" }] };
    }
    const dx = Math.sign(front.center.x - unit.position.x);
    const dy = Math.sign(front.center.y - unit.position.y);
    const destination = { x: Math.max(0, Math.min(9, unit.position.x + dx)), y: Math.max(0, Math.min(9, unit.position.y + dy)) };
    const actions = separation(unit.position, destination) === 1
      ? [{ kind: "move", destination } as const]
      : [];
    return { kind: "unit-actions", playerId: BATTLE_AI_ID, unitId: unit.unitId, actions };
  });
}

function aiCapacity(projection: AttentionProjection): boolean {
  const player = projection.players.find((candidate) => candidate.playerId === BATTLE_AI_ID)!;
  const slot = rules().capacitySlots[projection.capacityTrack.nextSlot];
  return Boolean(slot && player.attention >= slot.cost);
}

function rules(): BattleCommandRules {
  const context = battleCommandContext();
  return {
    scenarioLabel: "The Contested Context",
    opponentLabel: "Threshold Doctrine",
    board: context.scenario.board,
    roundLimit: context.scenario.roundLimit,
    objectiveTarget: context.model.rules.objectiveTarget,
    driftLimit: context.model.rules.driftLimit,
    baseSoundness: context.model.rules.soundnessRate,
    verifyCost: context.model.rules.verifyCost,
    chassis: context.model.chassis,
    uap: context.model.uap!,
    spatial: context.model.spatial!,
    artillery: context.model.artillery!,
    capacitySlots: context.model.capacity.slots,
    abilities: {
      perfectFocus: context.model.capacity.perfectFocus,
      overclock: {
        unlockRank: context.model.capacity.overclock.unlockRank,
        seizeDiscount: context.model.capacity.overclock.seizeDiscount,
        maxUses: context.model.capacity.overclock.maxUses
      },
      macroFlare: {
        unlockRank: context.model.capacity.macroFlare.unlockRank,
        range: context.model.capacity.macroFlare.range,
        width: context.model.capacity.macroFlare.width,
        height: context.model.capacity.macroFlare.height,
        durationEmissions: context.model.capacity.macroFlare.durationEmissions,
        outputMultiplier: context.model.capacity.macroFlare.outputMultiplier,
        maxUses: context.model.capacity.macroFlare.maxUses
      }
    }
  };
}

function frontForecast(stored: StoredBattleCommandMatch, round: number) {
  const context = battleCommandContext();
  const slot = (context.scenario.playerOrder.indexOf(1) + 1) as 1 | 2;
  const entries = context.scenario.frontSchedule
    .filter((entry) => entry.playerSlot === slot && entry.round <= round)
    .sort((left, right) => right.round - left.round);
  const current = entries[0] ?? context.scenario.frontSchedule.find((entry) => entry.playerSlot === slot)!;
  const next = context.scenario.frontSchedule
    .filter((entry) => entry.playerSlot === slot && entry.round > round)
    .sort((left, right) => left.round - right.round)[0] ?? null;
  return {
    current: { round: current.round, center: current.center, radius: current.radius },
    next: next ? { round: next.round, center: next.center, radius: next.radius } : null
  };
}

function publicEvent(event: EventEnvelope): EventEnvelope {
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["seed", "randomStreamId", "sound", "latentSound"].includes(key))
      .map(([key, nested]) => [key, scrub(nested)]));
  };
  return { ...event, data: scrub(event.data) as EventEnvelope["data"] };
}

export function projectBattleCommand(stored: StoredBattleCommandMatch, recentEvents: EventEnvelope[] = []): BattleCommandView {
  const projection = projectAttentionMatch(hydrate(stored), BATTLE_PLAYER_ID);
  const player = projection.players.find((candidate) => candidate.playerId === BATTLE_PLAYER_ID)!;
  const slot = rules().capacitySlots[projection.capacityTrack.nextSlot];
  const abilityRank = player.claimCount;
  const perfectFocusReady = abilityRank >= rules().abilities.perfectFocus.unlockRank &&
    player.focusUses < rules().abilities.perfectFocus.maxUses && projection.round >= player.focusNextReadyRound;
  const overclockReady = abilityRank >= rules().abilities.overclock.unlockRank &&
    !player.overclockUsed && rules().abilities.overclock.maxUses > 0;
  const macroFlareReady = false;
  const reason = (ready: boolean, locked: boolean, uses: boolean, cooldown = false, replaced = false) =>
    ready ? null : replaced ? "replaced by artillery" : locked ? "capacity rank required" : uses ? "uses exhausted" : cooldown ? "cooldown" : "unavailable";
  const front = frontForecast(stored, projection.round);
  return {
    schemaVersion: 1,
    revision: stored.revision,
    projection,
    events: recentEvents.map(publicEvent),
    rules: rules(),
    legal: {
      phase: projection.phase,
      artilleryShells: projection.phase === "artillery"
        ? (["flare", "chaff", "he", "smoke"] as const).filter((shell) => (player.artillery?.hand[shell] ?? 0) > 0)
        : [],
      movableUnitIds: projection.phase === "movement"
        ? projection.units.filter((unit) => unit.ownerPlayerId === BATTLE_PLAYER_ID).map((unit) => unit.unitId)
        : [],
      capacity: {
        available: projection.phase === "capacity" && Boolean(slot),
        cost: slot?.cost ?? null,
        award: slot?.capacityAward ?? null,
        affordable: projection.phase === "capacity" && Boolean(slot) && player.attention >= (slot?.cost ?? Infinity)
      },
      fronts: front,
      abilities: {
        perfectFocus: {
          ready: perfectFocusReady,
          reason: reason(perfectFocusReady, abilityRank < rules().abilities.perfectFocus.unlockRank, player.focusUses >= rules().abilities.perfectFocus.maxUses, projection.round < player.focusNextReadyRound),
          usesRemaining: Math.max(0, rules().abilities.perfectFocus.maxUses - player.focusUses),
          nextReadyRound: player.focusNextReadyRound
        },
        overclock: {
          ready: overclockReady,
          reason: reason(overclockReady, abilityRank < rules().abilities.overclock.unlockRank, player.overclockUsed || rules().abilities.overclock.maxUses === 0),
          usesRemaining: Math.max(0, rules().abilities.overclock.maxUses - (player.overclockUsed ? 1 : 0))
        },
        macroFlare: {
          ready: macroFlareReady,
          reason: reason(false, abilityRank < rules().abilities.macroFlare.unlockRank, player.flareUsed || rules().abilities.macroFlare.maxUses === 0, false, true),
          usesRemaining: Math.max(0, rules().abilities.macroFlare.maxUses - (player.flareUsed ? 1 : 0))
        }
      },
      commandArtifactIds: projection.phase === "command"
        ? pendingArtifacts(projection, BATTLE_PLAYER_ID).map((artifact) => artifact.artifactId)
        : []
    }
  };
}

export function createBattleCommandMatch(matchId: string, seed: number): { stored: StoredBattleCommandMatch; view: BattleCommandView } {
  let match = createAttentionMatch({
    matchId,
    seed,
    randomStreamId: `battle-command-v1:${seed}`,
    context: battleCommandContext(),
    players: [
      { playerId: BATTLE_PLAYER_ID, composition: attentionCompositions.balanced },
      { playerId: BATTLE_AI_ID, composition: attentionCompositions.balanced }
    ]
  });
  const emitted = resolveAttentionEmission(match);
  match = emitted.match;
  const stored = { state: match.state, events: emitted.events, revision: 0 };
  return { stored, view: projectBattleCommand(stored, emitted.events) };
}

export function submitBattleCommand(stored: StoredBattleCommandMatch, submission: BattleCommandSubmission): { stored: StoredBattleCommandMatch; view: BattleCommandView } {
  if (stored.state.status !== "active") throw new Error("battle_complete");
  if (stored.state.phase !== submission.phase) throw new Error(`phase_mismatch:${stored.state.phase}`);
  let match = hydrate(stored);
  const events: EventEnvelope[] = [];
  const add = (transition: { match: AttentionMatch; events: EventEnvelope[] }) => {
    match = transition.match;
    events.push(...transition.events);
  };

  if (submission.phase === "artillery") {
    if (submission.shell !== null && !submission.center) throw new Error("artillery_target_required");
    const human: AttentionArtilleryIntent = submission.shell === null
      ? { kind: "pass-artillery", playerId: BATTLE_PLAYER_ID }
      : { kind: "fire-artillery", playerId: BATTLE_PLAYER_ID, shell: submission.shell, center: submission.center! };
    add(resolveAttentionArtillery(match, [human, aiArtillery(projectAttentionMatch(match, BATTLE_AI_ID))]));
  } else if (submission.phase === "movement") {
    const friendlyIds = new Set(match.state.units.filter((unit) => unit.ownerPlayerId === BATTLE_PLAYER_ID).map((unit) => unit.unitId));
    if (submission.plans.some((plan) => !friendlyIds.has(plan.unitId))) throw new Error("unit_unavailable");
    const intents: AttentionMovementIntent[] = submission.plans.map((plan) => ({
      kind: "unit-actions",
      playerId: BATTLE_PLAYER_ID,
      unitId: plan.unitId,
      actions: plan.actions
    }));
    add(resolveAttentionMovement(match, [...intents, ...aiMovement(projectAttentionMatch(match, BATTLE_AI_ID))]));
  } else if (submission.phase === "capacity") {
    add(resolveAttentionCapacity(match, [
      { kind: submission.claim ? "claim-capacity" : "pass-capacity", playerId: BATTLE_PLAYER_ID },
      { kind: aiCapacity(projectAttentionMatch(match, BATTLE_AI_ID)) ? "claim-capacity" : "pass-capacity", playerId: BATTLE_AI_ID }
    ]));
  } else {
    const human = { ...submission.intent, playerId: BATTLE_PLAYER_ID } as AttentionCommandIntent;
    add(applyAttentionIntent(match, human));
    if (human.kind === "end-command") {
      for (let count = 0; count < 64; count += 1) {
        const decision = aiCommand(projectAttentionMatch(match, BATTLE_AI_ID));
        add(applyAttentionIntent(match, decision));
        if (decision.kind === "end-command") break;
        if (count === 63) throw new Error("ai_command_limit");
      }
      add(resolveAttentionRound(match));
      if (match.state.status === "active" && match.state.phase === "emission") add(resolveAttentionEmission(match));
    }
  }

  const next = append(stored, match, events);
  return { stored: next, view: projectBattleCommand(next, events) };
}
