import {
  AttentionPolicyProgramSchema,
  type AttentionCapacityIntent,
  type AttentionChassis,
  type AttentionCommandIntent,
  type AttentionCoordinate,
  type AttentionMatchProjection,
  type AttentionModelDefinition,
  type AttentionMovementIntent,
  type AttentionPolicyPredicate,
  type AttentionPolicyProgram,
  type AttentionPolicyTarget,
  type AttentionProjectedArtifact,
  type AttentionScenario,
  type AttentionUnitState
} from "@landscape/contracts";
import type { AttentionController, AttentionRuntimeContext } from "@landscape/engine";

/** Immutable public rules available to a controller alongside its dynamic projection. */
export type AttentionControllerContext = AttentionRuntimeContext & {
  playerId: string;
};

/**
 * The engine calls these methods at their corresponding phase boundaries. Each command call sees a
 * fresh projection; the controller never retains or receives latent artifact soundness.
 */
export type AttentionPolicyController = Omit<AttentionController, "claim" | "command"> & {
  readonly policyId: string;
  readonly maxCommandActions: number;
  movement(projection: AttentionMatchProjection): AttentionMovementIntent[];
  claim(projection: AttentionMatchProjection): AttentionCapacityIntent;
  command(projection: AttentionMatchProjection): AttentionCommandIntent;
};

type MovementStrategy = AttentionPolicyProgram["movementRules"][number]["strategy"];
type CommandRule = AttentionPolicyProgram["commandRules"][number];

const coordinateKey = (point: AttentionCoordinate): string => `${point.x},${point.y}`;
const distance = (left: AttentionCoordinate, right: AttentionCoordinate): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

function compareCoordinates(left: AttentionCoordinate, right: AttentionCoordinate): number {
  return left.x - right.x || left.y - right.y;
}

function compareArtifacts(left: AttentionProjectedArtifact, right: AttentionProjectedArtifact): number {
  return left.artifactId.localeCompare(right.artifactId);
}

function ownPlayer(projection: AttentionMatchProjection, context: AttentionControllerContext) {
  if (projection.viewerPlayerId !== context.playerId) {
    throw new Error(`Controller for ${context.playerId} received projection for ${projection.viewerPlayerId}`);
  }
  const player = projection.players.find((candidate) => candidate.playerId === context.playerId);
  if (!player) throw new Error(`Projection does not contain controller player ${context.playerId}`);
  return player;
}

function ownUnits(projection: AttentionMatchProjection, playerId: string): AttentionUnitState[] {
  return projection.units
    .filter((unit) => unit.ownerPlayerId === playerId)
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
}

function pendingArtifacts(projection: AttentionMatchProjection, playerId: string): AttentionProjectedArtifact[] {
  return projection.artifacts
    .filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending")
    .sort(compareArtifacts);
}

function unitKeyMatches(unitId: string, unitKey: string): boolean {
  return unitId === unitKey || unitId.endsWith(`:${unitKey}`);
}

function strategyForUnit(program: AttentionPolicyProgram, unit: AttentionUnitState): {
  strategy: MovementStrategy;
  targetChassis?: AttentionChassis;
} {
  const rule = program.movementRules.find((candidate) =>
    (candidate.chassis === undefined || candidate.chassis === unit.chassis) &&
    (candidate.unitKey === undefined || unitKeyMatches(unit.unitId, candidate.unitKey))
  );
  return rule ?? { strategy: program.movementFallback };
}

function coordinatesInRange(
  origin: AttentionCoordinate,
  range: number,
  scenario: AttentionScenario
): AttentionCoordinate[] {
  const points: AttentionCoordinate[] = [];
  const minX = Math.max(0, origin.x - range);
  const maxX = Math.min(scenario.board.width - 1, origin.x + range);
  const minY = Math.max(0, origin.y - range);
  const maxY = Math.min(scenario.board.height - 1, origin.y + range);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) points.push({ x, y });
  }
  return points;
}

function nearestCandidate(
  candidates: AttentionCoordinate[],
  target: AttentionCoordinate,
  origin?: AttentionCoordinate
): AttentionCoordinate | undefined {
  return [...candidates].sort((left, right) =>
    distance(left, target) - distance(right, target) ||
    (origin ? distance(left, origin) - distance(right, origin) : 0) ||
    compareCoordinates(left, right)
  )[0];
}

function activeFront(
  projection: AttentionMatchProjection,
  playerId: string,
  own: boolean
): AttentionCoordinate | undefined {
  return projection.activeFronts
    .filter((front) => own ? front.playerId === playerId : front.playerId !== playerId)
    .sort((left, right) => left.playerId.localeCompare(right.playerId))[0]?.center;
}

function ownActiveFront(projection: AttentionMatchProjection, playerId: string) {
  return projection.activeFronts
    .filter((front) => front.playerId === playerId)
    .sort((left, right) => left.playerId.localeCompare(right.playerId))[0];
}

function insideFlare(point: AttentionCoordinate, center: AttentionCoordinate): boolean {
  return distance(point, center) <= 1;
}

function movementDestination(
  strategy: MovementStrategy,
  targetChassis: AttentionChassis | undefined,
  unit: AttentionUnitState,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext,
  candidates: AttentionCoordinate[]
): AttentionCoordinate | undefined {
  if (strategy === "hold") return unit.position;
  if (strategy === "hold-in-own-front") {
    const front = ownActiveFront(projection, context.playerId);
    if (!front || distance(unit.position, front.center) <= front.radius) return unit.position;
    return nearestCandidate(candidates, front.center, unit.position);
  }
  if (strategy === "approach-own-front" || strategy === "approach-enemy-front") {
    const target = activeFront(projection, context.playerId, strategy === "approach-own-front");
    return target ? nearestCandidate(candidates, target, unit.position) : unit.position;
  }
  if (strategy === "escort") {
    const anchors = ownUnits(projection, context.playerId)
      .filter((candidate) => candidate.unitId !== unit.unitId && candidate.chassis === (targetChassis ?? "line"))
      .sort((left, right) =>
        distance(unit.position, left.position) - distance(unit.position, right.position) ||
        left.unitId.localeCompare(right.unitId)
      );
    return anchors[0] ? nearestCandidate(candidates, anchors[0].position, unit.position) : unit.position;
  }

  const hostileFlares = projection.flares
    .filter((flare) => flare.ownerPlayerId !== context.playerId)
    .sort((left, right) => left.flareId.localeCompare(right.flareId));
  if (!hostileFlares.some((flare) => insideFlare(unit.position, flare.center))) return unit.position;
  return [...candidates].sort((left, right) => {
    const leftOverlap = hostileFlares.filter((flare) => insideFlare(left, flare.center)).length;
    const rightOverlap = hostileFlares.filter((flare) => insideFlare(right, flare.center)).length;
    const leftClearance = Math.min(...hostileFlares.map((flare) => distance(left, flare.center)));
    const rightClearance = Math.min(...hostileFlares.map((flare) => distance(right, flare.center)));
    return leftOverlap - rightOverlap || rightClearance - leftClearance || compareCoordinates(left, right);
  })[0];
}

function movementIntents(
  program: AttentionPolicyProgram,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionMovementIntent[] {
  ownPlayer(projection, context);
  if (projection.phase !== "movement" || projection.status !== "active") {
    return [{ kind: "end-movement", playerId: context.playerId }];
  }

  // Policies deliberately choose a conservative subset of legal simultaneous moves: destinations
  // occupied at projection time are avoided even though the engine can resolve swaps and cycles.
  // This makes every emitted batch legal without reproducing the engine's collision resolver.
  const occupied = new Set(projection.units.map((unit) => coordinateKey(unit.position)));
  const reserved = new Set<string>();
  const intents: AttentionMovementIntent[] = [];
  for (const unit of ownUnits(projection, context.playerId)) {
    const { strategy, targetChassis } = strategyForUnit(program, unit);
    const movementRange = context.model.chassis[unit.chassis].movementRange;
    const candidates = coordinatesInRange(unit.position, movementRange, context.scenario)
      .filter((point) => coordinateKey(point) === coordinateKey(unit.position) ||
        (!occupied.has(coordinateKey(point)) && !reserved.has(coordinateKey(point))));
    const destination = movementDestination(strategy, targetChassis, unit, projection, context, candidates);
    if (!destination || coordinateKey(destination) === coordinateKey(unit.position)) continue;
    reserved.add(coordinateKey(destination));
    intents.push({ kind: "move", playerId: context.playerId, unitId: unit.unitId, destination });
  }
  intents.push({ kind: "end-movement", playerId: context.playerId });
  return intents;
}

function capacityIntent(
  program: AttentionPolicyProgram,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionCapacityIntent {
  const player = ownPlayer(projection, context);
  const pass: AttentionCapacityIntent = { kind: "pass-capacity", playerId: context.playerId };
  if (projection.phase !== "capacity" || projection.status !== "active" || player.claimAttempted ||
      projection.capacityTrack.nextSlot >= context.model.capacity.slots.length) return pass;
  const nextSlot = context.model.capacity.slots[projection.capacityTrack.nextSlot];
  if (program.capacityStrategy === "never" || player.attention < nextSlot.cost) return pass;
  if (program.capacityStrategy === "pioneer" &&
      projection.capacityTrack.nextSlot >= context.model.capacity.followerStartsAtSlot) return pass;
  if (program.capacityStrategy === "follower" &&
      projection.capacityTrack.nextSlot < context.model.capacity.followerStartsAtSlot) return pass;
  return { kind: "claim-capacity", playerId: context.playerId };
}

function sourceUnit(
  projection: AttentionMatchProjection,
  context: AttentionControllerContext,
  artifact: AttentionProjectedArtifact
): AttentionUnitState | undefined {
  const maximumRange = context.model.stationary.targetLock.range;
  return ownUnits(projection, context.playerId)
    .filter((unit) => unit.chassis === "line" && unit.unitId !== artifact.sourceUnitId &&
      distance(unit.position, artifact.position) <= maximumRange)
    .sort((left, right) => left.unitId.localeCompare(right.unitId))[0];
}

function abilityReady(
  ability: "perfect-focus" | "overclock" | "macro-flare",
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): boolean {
  const player = ownPlayer(projection, context);
  if (ability === "perfect-focus") {
    const rule = context.model.capacity.perfectFocus;
    return player.claimCount >= rule.unlockRank && player.focusUses < rule.maxUses &&
      projection.round >= player.focusNextReadyRound;
  }
  if (ability === "overclock") {
    const rule = context.model.capacity.overclock;
    return player.claimCount >= rule.unlockRank && !player.overclockUsed && rule.maxUses > 0;
  }
  const rule = context.model.capacity.macroFlare;
  return player.claimCount >= rule.unlockRank && !player.flareUsed && rule.maxUses > 0;
}

function artifactForTarget(
  target: AttentionPolicyTarget | undefined,
  action: CommandRule["action"]["kind"],
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionProjectedArtifact | undefined {
  const player = ownPlayer(projection, context);
  let candidates = pendingArtifacts(projection, context.playerId);
  if (action === "verify") {
    if (player.attention < context.model.rules.verifyCost) return undefined;
    candidates = candidates.filter((artifact) => !artifact.revealed);
  }
  if (action === "perfect-focus") {
    if (!abilityReady("perfect-focus", projection, context)) return undefined;
    candidates = candidates.filter((artifact) => !artifact.revealed && artifact.guarantee === null);
  }
  if (action === "seize") {
    candidates = candidates.filter((artifact) => {
      const unit = projection.units.find((candidate) => candidate.unitId === artifact.sourceUnitId);
      if (!unit) return false;
      const discount = player.overclockActive ? context.model.capacity.overclock.seizeDiscount : 0;
      return Math.max(0, context.model.chassis[unit.chassis].seizeCost - discount) <= player.attention;
    });
  }
  if (target?.kind === "revealed-unsound") candidates = candidates.filter((artifact) => artifact.revealedSound === false);
  if (target?.kind === "revealed-sound") candidates = candidates.filter((artifact) => artifact.revealedSound === true);
  if (target?.kind === "chassis-lowest-confidence") {
    candidates = candidates.filter((artifact) =>
      projection.units.find((unit) => unit.unitId === artifact.sourceUnitId)?.chassis === target.chassis
    );
  }
  if (action === "target-lock") {
    if (player.targetLocks < 1) return undefined;
    candidates = candidates.filter((artifact) => artifact.guarantee === null &&
      sourceUnit(projection, context, artifact) !== undefined);
  }
  if (!candidates.length) return undefined;

  if (target?.kind === "highest-confidence") {
    return [...candidates].sort((left, right) =>
      right.reportedConfidence - left.reportedConfidence || compareArtifacts(left, right)
    )[0];
  }
  if (target?.kind === "cheapest-seize") {
    return [...candidates].sort((left, right) => {
      const leftUnit = projection.units.find((unit) => unit.unitId === left.sourceUnitId);
      const rightUnit = projection.units.find((unit) => unit.unitId === right.sourceUnitId);
      const leftCost = leftUnit ? context.model.chassis[leftUnit.chassis].seizeCost : Number.POSITIVE_INFINITY;
      const rightCost = rightUnit ? context.model.chassis[rightUnit.chassis].seizeCost : Number.POSITIVE_INFINITY;
      return leftCost - rightCost || compareArtifacts(left, right);
    })[0];
  }
  if (target?.kind === "lowest-confidence" || target?.kind === "chassis-lowest-confidence") {
    return [...candidates].sort((left, right) =>
      left.reportedConfidence - right.reportedConfidence || compareArtifacts(left, right)
    )[0];
  }
  return candidates[0];
}

function predicateMatches(
  predicate: AttentionPolicyPredicate,
  artifact: AttentionProjectedArtifact | undefined,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): boolean {
  const player = ownPlayer(projection, context);
  switch (predicate.kind) {
    case "always": return true;
    case "attention-at-least": return player.attention >= predicate.value;
    case "revealed-unsound": return artifact?.revealedSound === false;
    case "revealed-sound": return artifact?.revealedSound === true;
    case "confidence-below": return artifact !== undefined && artifact.reportedConfidence < predicate.value;
    case "confidence-above": return artifact !== undefined && artifact.reportedConfidence > predicate.value;
    case "target-lock-available": return player.targetLocks > 0 && artifact !== undefined &&
      sourceUnit(projection, context, artifact) !== undefined;
    case "ability-ready": return abilityReady(predicate.ability, projection, context);
    case "unresolved-at-least": return pendingArtifacts(projection, context.playerId).length >= predicate.value;
  }
}

function legalFlareCenters(
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionCoordinate[] {
  const range = context.model.capacity.macroFlare.range;
  const units = ownUnits(projection, context.playerId);
  const centers: AttentionCoordinate[] = [];
  for (let x = 0; x < context.scenario.board.width; x += 1) {
    for (let y = 0; y < context.scenario.board.height; y += 1) {
      const center = { x, y };
      if (units.some((unit) => distance(unit.position, center) <= range)) centers.push(center);
    }
  }
  return centers;
}

function spatialTarget(
  target: AttentionPolicyTarget | undefined,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionCoordinate | undefined {
  const requested = target?.kind ?? "enemy-densest";
  const candidates = legalFlareCenters(projection, context);
  if (!candidates.length) return undefined;
  if (requested === "own-front" || requested === "enemy-front") {
    const center = activeFront(projection, context.playerId, requested === "own-front");
    return center ? nearestCandidate(candidates, center) : candidates.sort(compareCoordinates)[0];
  }

  const ownerFilter = requested === "own-densest"
    ? (unit: AttentionUnitState) => unit.ownerPlayerId === context.playerId
    : (unit: AttentionUnitState) => unit.ownerPlayerId !== context.playerId;
  const targetUnits = projection.units.filter(ownerFilter);
  const halfWidth = Math.floor(context.model.capacity.macroFlare.width / 2);
  const halfHeight = Math.floor(context.model.capacity.macroFlare.height / 2);
  return [...candidates].sort((left, right) => {
    const count = (center: AttentionCoordinate) => targetUnits.filter((unit) =>
      Math.abs(unit.position.x - center.x) <= halfWidth && Math.abs(unit.position.y - center.y) <= halfHeight
    ).length;
    return count(right) - count(left) || compareCoordinates(left, right);
  })[0];
}

function commandForRule(
  rule: CommandRule,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionCommandIntent | undefined {
  const action = rule.action.kind;
  if (action === "end-command") {
    return rule.when.every((predicate) => predicateMatches(predicate, undefined, projection, context))
      ? { kind: "end-command", playerId: context.playerId }
      : undefined;
  }
  if (action === "overclock") {
    return abilityReady("overclock", projection, context) &&
      rule.when.every((predicate) => predicateMatches(predicate, undefined, projection, context))
      ? { kind: "overclock", playerId: context.playerId }
      : undefined;
  }
  if (action === "macro-flare") {
    const center = spatialTarget(rule.target, projection, context);
    return center && abilityReady("macro-flare", projection, context) &&
      rule.when.every((predicate) => predicateMatches(predicate, undefined, projection, context))
      ? { kind: "macro-flare", playerId: context.playerId, center }
      : undefined;
  }

  const artifact = artifactForTarget(rule.target, action, projection, context);
  if (!artifact || !rule.when.every((predicate) => predicateMatches(predicate, artifact, projection, context))) {
    return undefined;
  }
  if (action === "target-lock") {
    const source = sourceUnit(projection, context, artifact);
    return source
      ? { kind: "target-lock", playerId: context.playerId, sourceUnitId: source.unitId, artifactId: artifact.artifactId }
      : undefined;
  }
  if (action === "perfect-focus") {
    return { kind: "perfect-focus", playerId: context.playerId, artifactId: artifact.artifactId };
  }
  return { kind: action, playerId: context.playerId, artifactId: artifact.artifactId };
}

function commandIntent(
  program: AttentionPolicyProgram,
  projection: AttentionMatchProjection,
  context: AttentionControllerContext
): AttentionCommandIntent {
  ownPlayer(projection, context);
  if (projection.phase === "command" && projection.status === "active") {
    for (const rule of program.commandRules) {
      const intent = commandForRule(rule, projection, context);
      if (intent) return intent;
    }
  }
  return { kind: "end-command", playerId: context.playerId };
}

export function createAttentionController(
  input: AttentionPolicyProgram,
  context: AttentionControllerContext
): AttentionPolicyController {
  const program = AttentionPolicyProgramSchema.parse(input);
  return Object.freeze({
    policyId: program.policyId,
    maxCommandActions: program.maxCommandActions,
    movement: (projection: AttentionMatchProjection) => movementIntents(program, projection, context),
    claim: (projection: AttentionMatchProjection) => capacityIntent(program, projection, context),
    command: (projection: AttentionMatchProjection) => commandIntent(program, projection, context)
  });
}

const verifyRules: AttentionPolicyProgram["commandRules"] = [
  { when: [{ kind: "revealed-unsound" }], action: { kind: "reject" }, target: { kind: "revealed-unsound" } },
  { when: [{ kind: "always" }], action: { kind: "verify" }, target: { kind: "lowest-confidence" } }
];

function defineProgram(input: AttentionPolicyProgram): AttentionPolicyProgram {
  return AttentionPolicyProgramSchema.parse(input);
}

export const attentionPolicyPrograms: readonly AttentionPolicyProgram[] = Object.freeze([
  defineProgram({
    schemaVersion: 1, policyId: "accept-all", label: "Accept all", movementRules: [],
    movementFallback: "hold", capacityStrategy: "never", commandRules: [], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "verify-lowest-confidence", label: "Verify lowest confidence", movementRules: [],
    movementFallback: "hold", capacityStrategy: "never", commandRules: verifyRules, maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "verify-arbitrary", label: "Verify lexical artifact", movementRules: [],
    movementFallback: "hold", capacityStrategy: "never", commandRules: [
      { when: [{ kind: "revealed-unsound" }], action: { kind: "reject" }, target: { kind: "revealed-unsound" } },
      { when: [{ kind: "always" }], action: { kind: "verify" } }
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "seize-cheapest", label: "Seize cheapest", movementRules: [],
    movementFallback: "hold", capacityStrategy: "never", commandRules: [
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } }
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "front-mobile-verify", label: "Advance and verify", movementRules: [],
    movementFallback: "approach-own-front", capacityStrategy: "never", commandRules: verifyRules, maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "recon-lock-reject", label: "Recon lock and reject", movementRules: [
      { chassis: "scout", strategy: "hold-in-own-front" }
    ],
    movementFallback: "approach-own-front", capacityStrategy: "never", commandRules: [
      { when: [{ kind: "confidence-below", value: 0.5 }], action: { kind: "reject" }, target: { kind: "chassis-lowest-confidence", chassis: "scout" } },
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } }
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "line-escort-lock", label: "Line escort target lock", movementRules: [
      { chassis: "line", strategy: "hold-in-own-front" },
      { chassis: "scout", strategy: "escort", targetChassis: "line" }
    ], movementFallback: "approach-own-front", capacityStrategy: "never", commandRules: [
      { when: [{ kind: "target-lock-available" }], action: { kind: "target-lock" }, target: { kind: "chassis-lowest-confidence", chassis: "scout" } },
      ...verifyRules
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "uplink-seize", label: "Command uplink and seize", movementRules: [
      { chassis: "siege", strategy: "hold-in-own-front" }
    ],
    movementFallback: "approach-own-front", capacityStrategy: "never", commandRules: [
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "chassis-lowest-confidence", chassis: "siege" } }
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "capacity-ignore", label: "Ignore capacity", movementRules: [],
    movementFallback: "approach-own-front", capacityStrategy: "never", commandRules: verifyRules, maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "capacity-pioneer", label: "Pioneer capacity", movementRules: [],
    movementFallback: "approach-own-front", capacityStrategy: "pioneer", commandRules: [
      { when: [{ kind: "ability-ready", ability: "perfect-focus" }], action: { kind: "perfect-focus" }, target: { kind: "lowest-confidence" } },
      ...verifyRules
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "capacity-follower-overclock", label: "Fast follower overclock", movementRules: [
      { chassis: "siege", strategy: "hold" }
    ], movementFallback: "approach-own-front", capacityStrategy: "follower", commandRules: [
      { when: [{ kind: "ability-ready", ability: "overclock" }], action: { kind: "overclock" } },
      { when: [{ kind: "always" }], action: { kind: "seize" }, target: { kind: "cheapest-seize" } }
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "capacity-follower-flare", label: "Fast follower macro flare", movementRules: [],
    movementFallback: "evade-flare", capacityStrategy: "follower", commandRules: [
      { when: [{ kind: "ability-ready", ability: "macro-flare" }], action: { kind: "macro-flare" }, target: { kind: "enemy-densest" } },
      ...verifyRules
    ], maxCommandActions: 64
  }),
  defineProgram({
    schemaVersion: 1, policyId: "capacity-follower-no-flare", label: "Fast follower without macro flare", movementRules: [],
    movementFallback: "evade-flare", capacityStrategy: "follower", commandRules: verifyRules, maxCommandActions: 64
  })
]);

export const attentionPolicyById: ReadonlyMap<string, AttentionPolicyProgram> = new Map(
  attentionPolicyPrograms.map((program) => [program.policyId, program])
);

export const attentionPolicyProgramIds: readonly string[] = Object.freeze(
  attentionPolicyPrograms.map((program) => program.policyId)
);
