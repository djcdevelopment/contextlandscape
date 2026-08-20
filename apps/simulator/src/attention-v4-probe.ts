import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_TRIAGE_MODULES,
  ATTENTION_V4_COMPOSITION_MODULES,
  ATTENTION_V4_COMMANDER_COMPILER_VERSION,
  ATTENTION_V4_RESOLVER_VERSION,
  ATTENTION_V4_RULESET_VERSION,
  type AttentionV4CommanderProfile,
  type AttentionV4CommanderProgram,
  type AttentionV4EventEnvelope
} from "@landscape/contracts";
import {
  ATTENTION_V4_RULESET_HASH,
  attentionV4CommanderArtillery,
  attentionV4CommanderCapacityClaim,
  attentionV4CommanderCommand,
  attentionV4CommanderKinetic,
  attentionV4ContentHash,
  attentionV4StartingRanges,
  attentionV4StateHash,
  compileAttentionV4Commander,
  createAttentionV4CommanderCatalog,
  createAttentionV4CommanderProfile,
  reduceAttentionV4,
  startAttentionV4Match,
  type AttentionV4Match,
  type AttentionV4PressureSample,
  type AttentionV4ReducerAction
} from "@landscape/engine";

export type AttentionV4ProbeDimension = "composition" | "triage" | "movement" | "capacity";

export type AttentionV4ProbeContrast = {
  contrastId: string;
  dimension: AttentionV4ProbeDimension;
  controlModule: string;
  treatmentModule: string;
  control: AttentionV4CommanderProgram;
  treatment: AttentionV4CommanderProgram;
};

export type AttentionV4ProbeOptions = {
  seedsPerCell?: number;
  pressureSamples?: AttentionV4PressureSample[];
  seats?: Array<0 | 1>;
  replay?: boolean;
  contrasts?: AttentionV4ProbeContrast[];
  onProgress?: (completedMatches: number, totalMatches: number) => void;
};

type RunFlags = Record<AttentionV4ProbeDimension, { eligible: boolean; executed: boolean }>;

type NormalizedOutcome = {
  result: "win" | "loss" | "draw";
  progress: number;
  drift: number;
  opponentProgress: number;
  opponentDrift: number;
  terminalReason: string | null;
  rounds: number;
};

type MatchResult = {
  stateHash: string;
  eventHash: string;
  traceHash: string;
  counterHash: string;
  outcome: NormalizedOutcome;
  firstShell: string | null;
  startingRanges: number[];
  flags: RunFlags;
  counters: Record<string, number>;
  replayMismatch: boolean;
  attributionMismatch: boolean;
  streamSignature: Array<{ round: number; rootStream: string; domainStreams: Record<string, string> }>;
};

type ModuleAggregate = {
  dimension: AttentionV4ProbeDimension;
  module: string;
  eligibleMatches: number;
  executedMatches: number;
  changedPairs: number;
};

type ContrastAggregate = {
  contrastId: string;
  dimension: AttentionV4ProbeDimension;
  controlModule: string;
  treatmentModule: string;
  pairs: number;
  eligiblePairs: number;
  executedPairs: number;
  changedPairs: number;
  mechanicTraceChanges: number;
  counterChanges: number;
  outcomeChanges: number;
  startingRangeDifferentials: number;
  shellChoiceDifferentials: number;
  firstChangedPair: null | {
    seat: 0 | 1;
    pressure: AttentionV4PressureSample;
    seed: number;
    controlTraceHash: string;
    treatmentTraceHash: string;
    controlOutcome: NormalizedOutcome;
    treatmentOutcome: NormalizedOutcome;
  };
};

export type AttentionV4PairedProbeReport = {
  schemaVersion: 1;
  probeId: "attention-v4.2-paired-module-probe-1";
  modelVersion: "duel-capacity-v3-experimental";
  rulesetVersion: typeof ATTENTION_V4_RULESET_VERSION;
  rulesetHash: typeof ATTENTION_V4_RULESET_HASH;
  resolverVersion: typeof ATTENTION_V4_RESOLVER_VERSION;
  compilerVersion: typeof ATTENTION_V4_COMMANDER_COMPILER_VERSION;
  commanderCatalogHash: string;
  design: {
    formula: "27 module contrasts × 2 seats × 4 pressure samples × 64 seeds × 2 arms";
    contrasts: number;
    seats: number;
    pressureSamples: number;
    seeds: number;
    arms: 2;
    pairs: number;
    matches: number;
    canonical: boolean;
    replayEnabled: boolean;
  };
  totals: {
    pairs: number;
    matches: number;
    changedPairs: number;
    replayMismatches: number;
    streamMismatches: number;
    attributionMismatches: number;
  };
  outcomeTotals: Record<"controlWin" | "controlLoss" | "controlDraw" | "treatmentWin" | "treatmentLoss" | "treatmentDraw", number>;
  mechanicCounters: { control: Record<string, number>; treatment: Record<string, number> };
  contrasts: ContrastAggregate[];
  moduleCoverage: ModuleAggregate[];
  gates: {
    dimensionsComplete: boolean;
    everyModuleEligible: boolean;
    everyModuleExecuted: boolean;
    everyModuleChangedPair: boolean;
    startingRangeDifferentials: boolean;
    shellChoiceDifferentials: boolean;
    zeroReplayMismatches: boolean;
    zeroStreamMismatches: boolean;
    zeroAttributionMismatches: boolean;
    passed: boolean;
  };
  reportHash: string;
};

type CommanderModules = Pick<AttentionV4CommanderProfile, "compositionModule" | "triageModule" | "movementModule" | "capacityModule">;

const baselineModules: CommanderModules = {
  compositionModule: "heavy-line-scout",
  triageModule: "risk-adaptive",
  movementModule: "chassis-native",
  capacityModule: "adaptive"
};

function program(modules: Partial<CommanderModules> = {}): AttentionV4CommanderProgram {
  return compileAttentionV4Commander(createAttentionV4CommanderProfile({ ...baselineModules, ...modules }));
}

export function createAttentionV4ProbeContrasts(): AttentionV4ProbeContrast[] {
  const control = program();
  const contrasts: AttentionV4ProbeContrast[] = [];
  for (const treatmentModule of ATTENTION_V4_COMPOSITION_MODULES) {
    if (treatmentModule === baselineModules.compositionModule) continue;
    contrasts.push({ contrastId: `composition:${treatmentModule}`, dimension: "composition", controlModule: baselineModules.compositionModule, treatmentModule, control, treatment: program({ compositionModule: treatmentModule }) });
  }
  for (const treatmentModule of ATTENTION_V2_TRIAGE_MODULES) {
    if (treatmentModule === baselineModules.triageModule) continue;
    contrasts.push({ contrastId: `triage:${treatmentModule}`, dimension: "triage", controlModule: baselineModules.triageModule, treatmentModule, control, treatment: program({ triageModule: treatmentModule }) });
  }
  for (const treatmentModule of ATTENTION_V2_MOVEMENT_MODULES) {
    if (treatmentModule === baselineModules.movementModule) continue;
    contrasts.push({ contrastId: `movement:${treatmentModule}`, dimension: "movement", controlModule: baselineModules.movementModule, treatmentModule, control, treatment: program({ movementModule: treatmentModule }) });
  }
  for (const treatmentModule of ATTENTION_V2_CAPACITY_MODULES) {
    if (treatmentModule === baselineModules.capacityModule) continue;
    contrasts.push({ contrastId: `capacity:${treatmentModule}`, dimension: "capacity", controlModule: baselineModules.capacityModule, treatmentModule, control, treatment: program({ capacityModule: treatmentModule }) });
  }
  if (contrasts.length !== 27) throw new Error(`attention-v4.2 probe requires 27 contrasts, received ${contrasts.length}`);
  return contrasts;
}

function increment(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}

function normalizedRole(actorId: string | null, testedPlayerId: string): string {
  if (actorId === null) return "system";
  const actorPlayerId = actorId.includes(":") ? actorId.split(":")[0] : actorId;
  return actorPlayerId === testedPlayerId ? "tested" : "opponent";
}

function normalizeEvents(events: AttentionV4EventEnvelope[], testedPlayerId: string): unknown[] {
  return events.map((item) => {
    const data = item.data;
    return {
      type: item.eventType,
      actor: normalizedRole(item.actorId, testedPlayerId),
      actions: Array.isArray(data.actions) ? data.actions : undefined,
      reason: typeof data.reason === "string" ? data.reason : undefined,
      shell: typeof data.shell === "string" ? data.shell : undefined,
      blocked: typeof data.blocked === "boolean" ? data.blocked : undefined,
      center: data.center,
      rank: typeof data.rank === "number" ? data.rank : undefined,
      densityPct: typeof data.densityPct === "number" ? data.densityPct : undefined,
      requestedVolume: typeof data.requestedVolume === "number" ? data.requestedVolume : undefined,
      outputVolume: typeof data.outputVolume === "number" ? data.outputVolume : undefined,
      sourceCalibration: typeof data.sourceCalibration === "number" ? data.sourceCalibration : undefined,
      effectiveCalibration: typeof data.effectiveCalibration === "number" ? data.effectiveCalibration : undefined,
      flared: typeof data.flared === "boolean" ? data.flared : undefined,
      outcome: typeof data.outcome === "string" ? data.outcome : undefined,
      drift: typeof data.drift === "number" ? data.drift : undefined,
      victimCount: Array.isArray(data.victimUnitIds) ? data.victimUnitIds.length : undefined,
      frozenCount: Array.isArray(data.frozenUnitIds) ? data.frozenUnitIds.length : undefined
    };
  });
}

function eventCounters(events: AttentionV4EventEnvelope[], testedPlayerId: string): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const item of events) {
    const role = normalizedRole(item.actorId, testedPlayerId);
    increment(counters, `${role}:${item.eventType}`);
    if (item.eventType === "attention.v4.artillery.shell.fired" && typeof item.data.shell === "string") increment(counters, `${role}:shell:${item.data.shell}`);
    if (item.eventType === "attention.v4.kinetic.plan.resolved" && Array.isArray(item.data.actions)) {
      for (const action of item.data.actions) if (typeof action === "string") increment(counters, `${role}:uap:${action}`);
    }
    if (item.eventType === "attention.v4.output.emitted" && typeof item.data.outputVolume === "number") increment(counters, `${role}:artifacts-emitted`, item.data.outputVolume);
    if (item.eventType === "attention.v4.artifact.detonated") increment(counters, `${role}:detonations`);
    if (item.eventType === "attention.v4.battery.activated") increment(counters, `${role}:batteries`);
  }
  return counters;
}

function mergeCounters(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) increment(target, key, value);
}

function runFlags(): RunFlags {
  return {
    composition: { eligible: true, executed: true },
    triage: { eligible: false, executed: false },
    movement: { eligible: false, executed: false },
    capacity: { eligible: false, executed: false }
  };
}

function playMatch(input: {
  pairId: string;
  seed: number;
  randomStreamId: string;
  testedSeat: 0 | 1;
  testedProgram: AttentionV4CommanderProgram;
  opponentProgram: AttentionV4CommanderProgram;
  pressure: AttentionV4PressureSample;
  replay: boolean;
}): MatchResult {
  const playerIds = ["alpha", "bravo"] as const;
  const testedPlayerId = playerIds[input.testedSeat];
  const programs = input.testedSeat === 0
    ? [input.testedProgram, input.opponentProgram] as const
    : [input.opponentProgram, input.testedProgram] as const;
  const setup = {
    matchId: input.pairId,
    seed: input.seed,
    randomStreamId: input.randomStreamId,
    players: [
      { playerId: playerIds[0], composition: programs[0].composition, commanderHash: programs[0].programHash },
      { playerId: playerIds[1], composition: programs[1].composition, commanderHash: programs[1].programHash }
    ] as const
  };
  const started = startAttentionV4Match(setup);
  let match = started.match;
  const events = [...started.events];
  const journal: AttentionV4ReducerAction[] = [];
  const flags = runFlags();

  for (let operation = 0; match.state.status === "active"; operation += 1) {
    if (operation >= 512) throw new Error(`attention-v4 probe operation limit: ${input.pairId}`);
    let action: AttentionV4ReducerAction;
    if (match.state.phase === "kinetic") {
      flags.movement.eligible = true;
      flags.movement.executed = true;
      action = { kind: "kinetic", plans: [
        ...attentionV4CommanderKinetic(match, playerIds[0], programs[0], input.pressure),
        ...attentionV4CommanderKinetic(match, playerIds[1], programs[1], input.pressure)
      ] };
    } else if (match.state.phase === "artillery") {
      action = { kind: "artillery", intents: [
        attentionV4CommanderArtillery(match, playerIds[0], programs[0], input.pressure),
        attentionV4CommanderArtillery(match, playerIds[1], programs[1], input.pressure)
      ] };
    } else if (match.state.phase === "capacity") {
      flags.capacity.eligible = true;
      flags.capacity.executed = true;
      action = { kind: "capacity", intents: playerIds.map((playerId, index) => ({
        playerId,
        claim: attentionV4CommanderCapacityClaim(match, playerId, programs[index])
      })) };
    } else if (match.state.phase === "command") {
      const activePlayerId = match.state.command.activePlayerId;
      if (!activePlayerId) throw new Error(`attention-v4 probe command missing active player: ${input.pairId}`);
      const index = playerIds.indexOf(activePlayerId as typeof playerIds[number]);
      const ownUnitsDecided = match.state.units.filter((unit) => unit.ownerPlayerId === activePlayerId).every((unit) => unit.outputDecision !== "pending");
      const hasPending = match.state.artifacts.some((artifact) => artifact.ownerPlayerId === activePlayerId && artifact.resolution === "pending" && !artifact.battery.active);
      if (activePlayerId === testedPlayerId && ownUnitsDecided && hasPending) flags.triage.eligible = true;
      const intent = attentionV4CommanderCommand(match, activePlayerId, programs[index], input.pressure);
      if (activePlayerId === testedPlayerId && ["verify", "accept", "reject", "seize", "perfect-focus"].includes(intent.kind)) flags.triage.executed = true;
      action = { kind: "command", intent };
    } else {
      throw new Error(`attention-v4 probe reached unexpected phase ${match.state.phase}`);
    }
    journal.push(structuredClone(action));
    const transition = reduceAttentionV4(match, action);
    const rejection = transition.events.find((item) => item.eventType === "attention.v4.command.rejected");
    if (rejection) throw new Error(`compiled command rejected in ${input.pairId}: ${String(rejection.data.reason)}`);
    match = transition.match;
    events.push(...transition.events);
  }

  const expectedHashes = programs.map((candidate) => candidate.programHash);
  const attributionMismatch = match.state.compiledCommanderHashes.some((hash, index) => hash !== expectedHashes[index]) ||
    match.state.units.some((unit) => !playerIds.includes(unit.ownerPlayerId as typeof playerIds[number]));
  const stateHash = attentionV4StateHash(match.state);
  const eventHash = attentionV4ContentHash(events);
  let replayMismatch = false;
  if (input.replay) {
    const replayStart = startAttentionV4Match(setup);
    let replayMatch: AttentionV4Match = replayStart.match;
    const replayEvents = [...replayStart.events];
    for (const action of journal) {
      const transition = reduceAttentionV4(replayMatch, action);
      replayMatch = transition.match;
      replayEvents.push(...transition.events);
    }
    replayMismatch = attentionV4StateHash(replayMatch.state) !== stateHash || attentionV4ContentHash(replayEvents) !== eventHash;
  }

  const tested = match.state.players.find((player) => player.playerId === testedPlayerId)!;
  const opponent = match.state.players.find((player) => player.playerId !== testedPlayerId)!;
  const outcome: NormalizedOutcome = {
    result: match.state.winnerPlayerId === null ? "draw" : match.state.winnerPlayerId === testedPlayerId ? "win" : "loss",
    progress: tested.progress,
    drift: tested.drift,
    opponentProgress: opponent.progress,
    opponentDrift: opponent.drift,
    terminalReason: match.state.terminalReason,
    rounds: match.state.round
  };
  const normalized = normalizeEvents(events, testedPlayerId);
  const counters = eventCounters(events, testedPlayerId);
  const firstShell = events.find((item) => item.eventType === "attention.v4.artillery.shell.fired" && normalizedRole(item.actorId, testedPlayerId) === "tested")?.data.shell;
  return {
    stateHash,
    eventHash,
    traceHash: attentionV4ContentHash(normalized),
    counterHash: attentionV4ContentHash(counters),
    outcome,
    firstShell: typeof firstShell === "string" ? firstShell : null,
    startingRanges: attentionV4StartingRanges(input.testedProgram),
    flags,
    counters,
    replayMismatch,
    attributionMismatch,
    streamSignature: match.state.roundRecords.map((record) => ({ round: record.round, rootStream: record.rootStream, domainStreams: record.domainStreams }))
  };
}

function sameOutcome(left: NormalizedOutcome, right: NormalizedOutcome): boolean {
  return attentionV4ContentHash(left) === attentionV4ContentHash(right);
}

function streamsMatch(left: MatchResult["streamSignature"], right: MatchResult["streamSignature"]): boolean {
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index].round !== right[index].round || left[index].rootStream !== right[index].rootStream ||
      attentionV4ContentHash(left[index].domainStreams) !== attentionV4ContentHash(right[index].domainStreams)) return false;
  }
  return true;
}

function moduleKey(dimension: AttentionV4ProbeDimension, module: string): string {
  return `${dimension}:${module}`;
}

export function runAttentionV4PairedProbe(options: AttentionV4ProbeOptions = {}): AttentionV4PairedProbeReport {
  const contrasts = options.contrasts ?? createAttentionV4ProbeContrasts();
  const seedsPerCell = options.seedsPerCell ?? 64;
  const pressureSamples = options.pressureSamples ?? [0, 1, 2, 3];
  const seats = options.seats ?? [0, 1];
  const replay = options.replay ?? true;
  if (!Number.isInteger(seedsPerCell) || seedsPerCell < 1 || seedsPerCell > 64) throw new Error("seedsPerCell must be an integer from 1 through 64");
  const opponent = program();
  const totalPairs = contrasts.length * seats.length * pressureSamples.length * seedsPerCell;
  const totalMatches = totalPairs * 2;
  const controlCounters: Record<string, number> = {};
  const treatmentCounters: Record<string, number> = {};
  const moduleMap = new Map<string, ModuleAggregate>();
  const contrastResults: ContrastAggregate[] = [];
  const outcomeTotals = { controlWin: 0, controlLoss: 0, controlDraw: 0, treatmentWin: 0, treatmentLoss: 0, treatmentDraw: 0 };
  let completedMatches = 0;
  let changedPairs = 0;
  let replayMismatches = 0;
  let streamMismatches = 0;
  let attributionMismatches = 0;

  const moduleAggregate = (dimension: AttentionV4ProbeDimension, module: string): ModuleAggregate => {
    const id = moduleKey(dimension, module);
    let aggregate = moduleMap.get(id);
    if (!aggregate) {
      aggregate = { dimension, module, eligibleMatches: 0, executedMatches: 0, changedPairs: 0 };
      moduleMap.set(id, aggregate);
    }
    return aggregate;
  };

  for (const contrast of contrasts) {
    const aggregate: ContrastAggregate = {
      contrastId: contrast.contrastId,
      dimension: contrast.dimension,
      controlModule: contrast.controlModule,
      treatmentModule: contrast.treatmentModule,
      pairs: 0,
      eligiblePairs: 0,
      executedPairs: 0,
      changedPairs: 0,
      mechanicTraceChanges: 0,
      counterChanges: 0,
      outcomeChanges: 0,
      startingRangeDifferentials: 0,
      shellChoiceDifferentials: 0,
      firstChangedPair: null
    };
    for (const seat of seats) {
      for (const pressure of pressureSamples) {
        for (let seed = 0; seed < seedsPerCell; seed += 1) {
          const pairId = `attention-v4-probe:${contrast.contrastId}:seat${seat}:pressure${pressure}:seed${seed}`;
          const randomStreamId = `attention-v4-paired:pressure${pressure}:seed${seed}`;
          const numericSeed = pressure * 64 + seed;
          const control = playMatch({ pairId, seed: numericSeed, randomStreamId, testedSeat: seat, testedProgram: contrast.control, opponentProgram: opponent, pressure, replay });
          completedMatches += 1;
          options.onProgress?.(completedMatches, totalMatches);
          const treatment = playMatch({ pairId, seed: numericSeed, randomStreamId, testedSeat: seat, testedProgram: contrast.treatment, opponentProgram: opponent, pressure, replay });
          completedMatches += 1;
          options.onProgress?.(completedMatches, totalMatches);
          aggregate.pairs += 1;
          const eligible = control.flags[contrast.dimension].eligible && treatment.flags[contrast.dimension].eligible;
          const executed = control.flags[contrast.dimension].executed && treatment.flags[contrast.dimension].executed;
          if (eligible) aggregate.eligiblePairs += 1;
          if (executed) aggregate.executedPairs += 1;
          const traceChanged = control.traceHash !== treatment.traceHash;
          const countersChanged = control.counterHash !== treatment.counterHash;
          const outcomeChanged = !sameOutcome(control.outcome, treatment.outcome);
          const changed = traceChanged || countersChanged || outcomeChanged;
          if (traceChanged) aggregate.mechanicTraceChanges += 1;
          if (countersChanged) aggregate.counterChanges += 1;
          if (outcomeChanged) aggregate.outcomeChanges += 1;
          if (attentionV4ContentHash(control.startingRanges) !== attentionV4ContentHash(treatment.startingRanges)) aggregate.startingRangeDifferentials += 1;
          if (control.firstShell !== treatment.firstShell) aggregate.shellChoiceDifferentials += 1;
          if (changed) {
            aggregate.changedPairs += 1;
            changedPairs += 1;
            if (!aggregate.firstChangedPair) aggregate.firstChangedPair = {
              seat,
              pressure,
              seed,
              controlTraceHash: control.traceHash,
              treatmentTraceHash: treatment.traceHash,
              controlOutcome: control.outcome,
              treatmentOutcome: treatment.outcome
            };
          }
          replayMismatches += Number(control.replayMismatch) + Number(treatment.replayMismatch);
          attributionMismatches += Number(control.attributionMismatch) + Number(treatment.attributionMismatch);
          streamMismatches += Number(!streamsMatch(control.streamSignature, treatment.streamSignature));
          mergeCounters(controlCounters, control.counters);
          mergeCounters(treatmentCounters, treatment.counters);
          increment(outcomeTotals, `control${control.outcome.result[0].toUpperCase()}${control.outcome.result.slice(1)}`);
          increment(outcomeTotals, `treatment${treatment.outcome.result[0].toUpperCase()}${treatment.outcome.result.slice(1)}`);

          const controlModule = moduleAggregate(contrast.dimension, contrast.controlModule);
          const treatmentModule = moduleAggregate(contrast.dimension, contrast.treatmentModule);
          controlModule.eligibleMatches += Number(control.flags[contrast.dimension].eligible);
          controlModule.executedMatches += Number(control.flags[contrast.dimension].executed);
          treatmentModule.eligibleMatches += Number(treatment.flags[contrast.dimension].eligible);
          treatmentModule.executedMatches += Number(treatment.flags[contrast.dimension].executed);
          if (changed) {
            controlModule.changedPairs += 1;
            treatmentModule.changedPairs += 1;
          }
        }
      }
    }
    contrastResults.push(aggregate);
  }

  const moduleCoverage = [...moduleMap.values()].sort((left, right) => left.dimension.localeCompare(right.dimension) || left.module.localeCompare(right.module));
  const dimensionsComplete = contrasts.length === 27 && new Set(contrasts.map((contrast) => contrast.dimension)).size === 4;
  const everyModuleEligible = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.eligibleMatches > 0);
  const everyModuleExecuted = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.executedMatches > 0);
  const everyModuleChangedPair = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.changedPairs > 0);
  const startingRangeDifferentials = contrastResults.filter((item) => item.dimension === "composition").every((item) => item.startingRangeDifferentials > 0);
  const shellChoiceDifferentials = contrastResults.filter((item) => item.dimension === "capacity").every((item) => item.shellChoiceDifferentials > 0);
  const gates = {
    dimensionsComplete,
    everyModuleEligible,
    everyModuleExecuted,
    everyModuleChangedPair,
    startingRangeDifferentials,
    shellChoiceDifferentials,
    zeroReplayMismatches: replayMismatches === 0,
    zeroStreamMismatches: streamMismatches === 0,
    zeroAttributionMismatches: attributionMismatches === 0,
    passed: false
  };
  gates.passed = Object.entries(gates).filter(([key]) => key !== "passed").every(([, value]) => value);
  const canonical = contrasts.length === 27 && seats.length === 2 && pressureSamples.length === 4 && seedsPerCell === 64 && replay;
  const reportWithoutHash = {
    schemaVersion: 1 as const,
    probeId: "attention-v4.2-paired-module-probe-1" as const,
    modelVersion: "duel-capacity-v3-experimental" as const,
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    commanderCatalogHash: createAttentionV4CommanderCatalog().catalogHash,
    design: {
      formula: "27 module contrasts × 2 seats × 4 pressure samples × 64 seeds × 2 arms" as const,
      contrasts: contrasts.length,
      seats: seats.length,
      pressureSamples: pressureSamples.length,
      seeds: seedsPerCell,
      arms: 2 as const,
      pairs: totalPairs,
      matches: totalMatches,
      canonical,
      replayEnabled: replay
    },
    totals: { pairs: totalPairs, matches: totalMatches, changedPairs, replayMismatches, streamMismatches, attributionMismatches },
    outcomeTotals,
    mechanicCounters: { control: controlCounters, treatment: treatmentCounters },
    contrasts: contrastResults,
    moduleCoverage,
    gates
  };
  return { ...reportWithoutHash, reportHash: attentionV4ContentHash(reportWithoutHash) };
}

export function mergeAttentionV4PairedProbeReports(reports: AttentionV4PairedProbeReport[]): AttentionV4PairedProbeReport {
  if (reports.length < 1) throw new Error("at least one attention-v4 probe shard is required");
  const first = reports[0];
  for (const report of reports) {
    if (report.rulesetHash !== first.rulesetHash || report.resolverVersion !== first.resolverVersion ||
      report.compilerVersion !== first.compilerVersion || report.commanderCatalogHash !== first.commanderCatalogHash) {
      throw new Error("attention-v4 probe shards do not share resolver/compiler attribution");
    }
    if (report.design.seats !== first.design.seats || report.design.pressureSamples !== first.design.pressureSamples ||
      report.design.seeds !== first.design.seeds || report.design.replayEnabled !== first.design.replayEnabled) {
      throw new Error("attention-v4 probe shards do not share the same paired design");
    }
  }
  const contrastOrder = new Map(createAttentionV4ProbeContrasts().map((contrast, index) => [contrast.contrastId, index]));
  const contrasts = reports.flatMap((report) => report.contrasts)
    .sort((left, right) => (contrastOrder.get(left.contrastId) ?? 999) - (contrastOrder.get(right.contrastId) ?? 999));
  if (new Set(contrasts.map((contrast) => contrast.contrastId)).size !== contrasts.length) throw new Error("attention-v4 probe shards overlap contrasts");
  const moduleMap = new Map<string, ModuleAggregate>();
  for (const item of reports.flatMap((report) => report.moduleCoverage)) {
    const id = moduleKey(item.dimension, item.module);
    const aggregate = moduleMap.get(id) ?? { dimension: item.dimension, module: item.module, eligibleMatches: 0, executedMatches: 0, changedPairs: 0 };
    aggregate.eligibleMatches += item.eligibleMatches;
    aggregate.executedMatches += item.executedMatches;
    aggregate.changedPairs += item.changedPairs;
    moduleMap.set(id, aggregate);
  }
  const moduleCoverage = [...moduleMap.values()].sort((left, right) => left.dimension.localeCompare(right.dimension) || left.module.localeCompare(right.module));
  const controlCounters: Record<string, number> = {};
  const treatmentCounters: Record<string, number> = {};
  const outcomeTotals = { controlWin: 0, controlLoss: 0, controlDraw: 0, treatmentWin: 0, treatmentLoss: 0, treatmentDraw: 0 };
  for (const report of reports) {
    mergeCounters(controlCounters, report.mechanicCounters.control);
    mergeCounters(treatmentCounters, report.mechanicCounters.treatment);
    for (const key of Object.keys(outcomeTotals) as Array<keyof typeof outcomeTotals>) outcomeTotals[key] += report.outcomeTotals[key];
  }
  const totals = {
    pairs: reports.reduce((sum, report) => sum + report.totals.pairs, 0),
    matches: reports.reduce((sum, report) => sum + report.totals.matches, 0),
    changedPairs: reports.reduce((sum, report) => sum + report.totals.changedPairs, 0),
    replayMismatches: reports.reduce((sum, report) => sum + report.totals.replayMismatches, 0),
    streamMismatches: reports.reduce((sum, report) => sum + report.totals.streamMismatches, 0),
    attributionMismatches: reports.reduce((sum, report) => sum + report.totals.attributionMismatches, 0)
  };
  const dimensionsComplete = contrasts.length === 27 && new Set(contrasts.map((contrast) => contrast.dimension)).size === 4;
  const everyModuleEligible = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.eligibleMatches > 0);
  const everyModuleExecuted = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.executedMatches > 0);
  const everyModuleChangedPair = moduleCoverage.length === 31 && moduleCoverage.every((item) => item.changedPairs > 0);
  const startingRangeDifferentials = contrasts.filter((item) => item.dimension === "composition").every((item) => item.startingRangeDifferentials > 0);
  const shellChoiceDifferentials = contrasts.filter((item) => item.dimension === "capacity").every((item) => item.shellChoiceDifferentials > 0);
  const gates = {
    dimensionsComplete,
    everyModuleEligible,
    everyModuleExecuted,
    everyModuleChangedPair,
    startingRangeDifferentials,
    shellChoiceDifferentials,
    zeroReplayMismatches: totals.replayMismatches === 0,
    zeroStreamMismatches: totals.streamMismatches === 0,
    zeroAttributionMismatches: totals.attributionMismatches === 0,
    passed: false
  };
  gates.passed = Object.entries(gates).filter(([key]) => key !== "passed").every(([, value]) => value);
  const canonical = contrasts.length === 27 && first.design.seats === 2 && first.design.pressureSamples === 4 &&
    first.design.seeds === 64 && first.design.replayEnabled && totals.matches === 27_648;
  const reportWithoutHash = {
    schemaVersion: 1 as const,
    probeId: "attention-v4.2-paired-module-probe-1" as const,
    modelVersion: "duel-capacity-v3-experimental" as const,
    rulesetVersion: ATTENTION_V4_RULESET_VERSION,
    rulesetHash: ATTENTION_V4_RULESET_HASH,
    resolverVersion: ATTENTION_V4_RESOLVER_VERSION,
    compilerVersion: ATTENTION_V4_COMMANDER_COMPILER_VERSION,
    commanderCatalogHash: first.commanderCatalogHash,
    design: {
      formula: "27 module contrasts × 2 seats × 4 pressure samples × 64 seeds × 2 arms" as const,
      contrasts: contrasts.length,
      seats: first.design.seats,
      pressureSamples: first.design.pressureSamples,
      seeds: first.design.seeds,
      arms: 2 as const,
      pairs: totals.pairs,
      matches: totals.matches,
      canonical,
      replayEnabled: first.design.replayEnabled
    },
    totals,
    outcomeTotals,
    mechanicCounters: { control: controlCounters, treatment: treatmentCounters },
    contrasts,
    moduleCoverage,
    gates
  };
  return { ...reportWithoutHash, reportHash: attentionV4ContentHash(reportWithoutHash) };
}
