import type { EventEnvelope } from "@landscape/contracts";

/**
 * The attention economy.
 *
 * A commander fields a fleet that produces more work than the commander can inspect. Every round
 * each mech emits artifacts; reviewing one costs attention, and the attention budget is deliberately
 * smaller than full supervision. Anything left unreviewed when the round ends is accepted sight
 * unseen. That is the whole game: not "which mech is reliable", but "what do I not look at".
 *
 * Two findings from the attempt-bank pilot shape this design.
 *
 * Mechs do NOT differ in how often they are right. Three model tiers spanning two orders of
 * magnitude in cost all scored 1.00 on the pilot problems, so a chassis gradient built on accuracy
 * would be fiction. They differ instead in `throughput` (how much work they generate for you) and
 * `calibration` (how well their reported confidence predicts whether the work is actually sound).
 *
 * Calibration is the axis because the pilot's dangerous failure was `wrong_answer` — parseable,
 * confident, and wrong — as against `unparseable`, which is visibly broken and harmless. A mech that
 * is wrong and knows it is a nuisance; a mech that is wrong and confident is what loses matches.
 *
 * The intended tension: cheap high-throughput mechs generate more progress AND more review load, so
 * they are only cheap if you do not count the commander's attention.
 */

export type Chassis = "scout" | "line" | "siege";

export type MechProfile = {
  mechId: string;
  chassis: Chassis;
  /** Artifacts emitted per round. More output is more chances at progress and more review load. */
  throughput: number;
  /** Attention cost for the commander to do this mech's work personally. */
  seizeCost: number;
  /** 0 = reported confidence is noise; 1 = it perfectly separates sound from unsound work. */
  calibration: number;
};

export type Artifact = {
  artifactId: string;
  mechId: string;
  /** Hidden until verified or resolved. */
  sound: boolean;
  /** What the mech claims. Only as trustworthy as its calibration. */
  reportedConfidence: number;
  revealed: boolean;
  resolution: "pending" | "accepted" | "rejected" | "seized";
};

export type CommandAction =
  | { verb: "verify"; artifactId: string }
  | { verb: "accept"; artifactId: string }
  | { verb: "reject"; artifactId: string }
  | { verb: "seize"; artifactId: string };

export type CommandRules = {
  attentionPerRound: number;
  verifyCost: number;
  /** Progress needed to win. */
  objectiveTarget: number;
  /** Accepted-unsound artifacts tolerated before the mission is lost. */
  driftLimit: number;
  roundLimit: number;
  /** Probability any given artifact is sound. Uniform across mechs, by design. */
  soundnessRate: number;
};

export type CommandState = {
  matchId: string;
  seed: number;
  round: number;
  eventSequence: number;
  attention: number;
  progress: number;
  drift: number;
  status: "active" | "victory" | "defeat";
  fleet: MechProfile[];
  pending: Artifact[];
  rules: CommandRules;
};

export const defaultCommandRules: CommandRules = {
  attentionPerRound: 3,
  verifyCost: 1,
  objectiveTarget: 12,
  driftLimit: 4,
  roundLimit: 8,
  soundnessRate: 0.7
};

/** Chassis differ in volume and in how much their confidence can be trusted — never in accuracy. */
export const chassisProfiles: Record<Chassis, Omit<MechProfile, "mechId">> = {
  scout: { chassis: "scout", throughput: 3, seizeCost: 1, calibration: 0.2 },
  line: { chassis: "line", throughput: 2, seizeCost: 2, calibration: 0.6 },
  siege: { chassis: "siege", throughput: 1, seizeCost: 3, calibration: 0.9 }
};

function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic uniform in [0,1) derived from the seed and a label — no RNG state to thread.
 *
 * The avalanche step is load-bearing. FNV-1a finishes with `(h ^ lastByte) * PRIME`, so labels that
 * differ only in a trailing index move the result by roughly the prime — about 0.004 of 2^32. Taken
 * as a fraction, consecutive artifact ids therefore draw near-identical numbers, and every artifact
 * a mech produced in a round would share one fate: measured at 97.8% identical soundness against 37%
 * expected. Modulo would have been fine because it reads the low bits; a fraction reads the high
 * ones. Finalize with xorshift-multiply before using the value as a uniform.
 */
function unit(seed: number, label: string): number {
  let hash = fnv1a(`${seed}:${label}`);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash >>> 0) / 4294967296;
}

function event(state: CommandState, sequence: number, eventType: string, data: Record<string, unknown>): EventEnvelope {
  return {
    schemaVersion: 1,
    eventId: `${state.matchId}:${sequence}`,
    matchId: state.matchId,
    sequence,
    turn: state.round,
    slot: state.round,
    occurredAt: new Date((state.round * 1000 + sequence) * 1000).toISOString(),
    eventType,
    actorId: typeof data.mechId === "string" ? data.mechId : null,
    causationId: null,
    correlationId: `${state.matchId}:round:${state.round}`,
    data
  };
}

export function buildFleet(composition: Chassis[]): MechProfile[] {
  return composition.map((chassis, index) => ({
    mechId: `${chassis}-${String(index + 1).padStart(2, "0")}`,
    ...chassisProfiles[chassis]
  }));
}

/**
 * Emit this round's artifacts.
 *
 * `reportedConfidence` blends the truth with noise in proportion to calibration, so a poorly
 * calibrated mech still reports confidence — it just means nothing. That is what makes the
 * commander's read a skill rather than a lookup.
 */
export function emitArtifacts(state: CommandState): Artifact[] {
  const artifacts: Artifact[] = [];
  for (const mech of state.fleet) {
    for (let index = 0; index < mech.throughput; index += 1) {
      const artifactId = `${state.matchId}:r${state.round}:${mech.mechId}:${index}`;
      const sound = unit(state.seed, `sound:${artifactId}`) < state.rules.soundnessRate;
      const signal = sound ? 0.75 : 0.25;
      const noise = unit(state.seed, `noise:${artifactId}`);
      const reportedConfidence = Number(
        (mech.calibration * signal + (1 - mech.calibration) * noise).toFixed(4)
      );
      artifacts.push({ artifactId, mechId: mech.mechId, sound, reportedConfidence, revealed: false, resolution: "pending" });
    }
  }
  return artifacts;
}

export function createCommandState(
  matchId: string,
  seed: number,
  composition: Chassis[],
  rules: Partial<CommandRules> = {}
): CommandState {
  const merged = { ...defaultCommandRules, ...rules };
  const state: CommandState = {
    matchId,
    seed,
    round: 0,
    eventSequence: 0,
    attention: merged.attentionPerRound,
    progress: 0,
    drift: 0,
    status: "active",
    fleet: buildFleet(composition),
    pending: [],
    rules: merged
  };
  state.pending = emitArtifacts(state);
  return state;
}

function costOf(state: CommandState, action: CommandAction): number {
  if (action.verb === "verify") return state.rules.verifyCost;
  if (action.verb === "seize") {
    const artifact = state.pending.find((entry) => entry.artifactId === action.artifactId);
    const mech = state.fleet.find((entry) => entry.mechId === artifact?.mechId);
    return mech?.seizeCost ?? Number.POSITIVE_INFINITY;
  }
  // Accepting and rejecting are decisions, not inspections. They are free on purpose: the scarce
  // resource is looking, not deciding.
  return 0;
}

/**
 * Apply a single action.
 *
 * Deliberately one at a time rather than a batch: verifying is only worth attention if the commander
 * can act on what it reveals, so the caller must be able to observe between actions. Batch
 * submission would make `verify` a pure cost.
 */
export function applyCommandAction(
  state: CommandState,
  action: CommandAction
): { state: CommandState; events: EventEnvelope[] } {
  const next: CommandState = structuredClone(state);
  const events: EventEnvelope[] = [];
  let sequence = next.eventSequence;

  const artifact = next.pending.find((entry) => entry.artifactId === action.artifactId);
  if (!artifact || artifact.resolution !== "pending") {
    events.push(event(next, sequence++, "order.rejected", { action, reason: "artifact_unavailable" }));
  } else if (action.verb === "verify" && artifact.revealed) {
    events.push(event(next, sequence++, "order.rejected", { action, reason: "already_verified" }));
  } else {
    const cost = costOf(next, action);
    if (cost > next.attention) {
      events.push(event(next, sequence++, "order.rejected", { action, reason: "attention" }));
    } else {
      next.attention -= cost;
      switch (action.verb) {
        case "verify":
          artifact.revealed = true;
          events.push(event(next, sequence++, "artifact.verified", { artifactId: artifact.artifactId, mechId: artifact.mechId, sound: artifact.sound }));
          break;
        case "accept":
          artifact.resolution = "accepted";
          break;
        case "reject":
          artifact.resolution = "rejected";
          events.push(event(next, sequence++, "artifact.rejected", { artifactId: artifact.artifactId, mechId: artifact.mechId }));
          break;
        case "seize":
          artifact.resolution = "seized";
          next.progress += 1;
          events.push(event(next, sequence++, "artifact.seized", { artifactId: artifact.artifactId, mechId: artifact.mechId }));
          break;
      }
    }
  }

  next.eventSequence = sequence;
  return { state: next, events };
}

/**
 * Close the round: resolve everything left, score it, advance.
 *
 * Unreviewed artifacts are accepted, not discarded. Ignoring work is itself a choice with
 * consequences, which is what makes a budget smaller than the fleet interesting.
 */
export function endCommandRound(state: CommandState): { state: CommandState; events: EventEnvelope[] } {
  const next: CommandState = structuredClone(state);
  const events: EventEnvelope[] = [];
  let sequence = next.eventSequence;

  for (const artifact of next.pending) {
    if (artifact.resolution === "pending") artifact.resolution = "accepted";
    if (artifact.resolution !== "accepted") continue;
    if (artifact.sound) next.progress += 1;
    else next.drift += 1;
    events.push(event(next, sequence++, artifact.sound ? "artifact.accepted.sound" : "artifact.accepted.unsound", {
      artifactId: artifact.artifactId,
      mechId: artifact.mechId,
      inspected: artifact.revealed
    }));
  }

  next.round += 1;
  if (next.progress >= next.rules.objectiveTarget) next.status = "victory";
  else if (next.drift >= next.rules.driftLimit || next.round >= next.rules.roundLimit) next.status = "defeat";

  if (next.status === "active") {
    next.attention = next.rules.attentionPerRound;
    next.pending = emitArtifacts(next);
  } else {
    next.pending = [];
  }

  events.push(event(next, sequence, "round.snapshot", {
    round: next.round,
    progress: next.progress,
    drift: next.drift,
    status: next.status
  }));
  next.eventSequence = sequence + 1;
  return { state: next, events };
}

/** Fold a recorded action list through a round. Used for deterministic replay from an event log. */
export function resolveCommandRound(
  state: CommandState,
  actions: CommandAction[]
): { state: CommandState; events: EventEnvelope[] } {
  let current = state;
  const events: EventEnvelope[] = [];
  for (const action of actions) {
    const step = applyCommandAction(current, action);
    current = step.state;
    events.push(...step.events);
  }
  const closed = endCommandRound(current);
  return { state: closed.state, events: [...events, ...closed.events] };
}

/** What the commander can actually see: soundness only where it has been paid for. */
export function projectCommand(state: CommandState) {
  return {
    ...state,
    pending: state.pending.map((artifact) => ({
      artifactId: artifact.artifactId,
      mechId: artifact.mechId,
      reportedConfidence: artifact.reportedConfidence,
      revealed: artifact.revealed,
      resolution: artifact.resolution,
      sound: artifact.revealed ? artifact.sound : null
    }))
  };
}
