import type {
  AttentionV4ArtilleryIntent,
  AttentionV4CommandIntent,
  AttentionV4CommanderProgram,
  AttentionV4Coordinate,
  AttentionV4KineticAction,
  AttentionV4KineticPlan,
  AttentionV4ProjectedArtifact,
  AttentionV4Shell
} from "@landscape/contracts";
import {
  defaultAttentionV4Rules,
  legalAttentionV4Actions,
  projectAttentionV4Match,
  type AttentionV4Match
} from "./attention-v4.js";

export type AttentionV4PressureSample = 0 | 1 | 2 | 3;

function unreachable(value: never, label: string): never {
  throw new Error(`Unknown or inert attention-v4 ${label} behavior: ${String(value)}`);
}

function distance(left: AttentionV4Coordinate, right: AttentionV4Coordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function key(coordinate: AttentionV4Coordinate): string {
  return `${coordinate.x},${coordinate.y}`;
}

function neighbors(origin: AttentionV4Coordinate): AttentionV4Coordinate[] {
  const result: AttentionV4Coordinate[] = [];
  for (let y = Math.max(0, origin.y - 1); y <= Math.min(9, origin.y + 1); y += 1) {
    for (let x = Math.max(0, origin.x - 1); x <= Math.min(9, origin.x + 1); x += 1) {
      if (x !== origin.x || y !== origin.y) result.push({ x, y });
    }
  }
  return result;
}

function stepToward(
  origin: AttentionV4Coordinate,
  target: AttentionV4Coordinate,
  occupied: Set<string>,
  reserved: Set<string>
): AttentionV4Coordinate | null {
  return neighbors(origin)
    .filter((candidate) => !occupied.has(key(candidate)) && !reserved.has(key(candidate)))
    .sort((left, right) => distance(left, target) - distance(right, target) || left.y - right.y || left.x - right.x)[0] ?? null;
}

function stepAway(
  origin: AttentionV4Coordinate,
  threats: AttentionV4Coordinate[],
  occupied: Set<string>,
  reserved: Set<string>
): AttentionV4Coordinate | null {
  if (threats.length === 0) return null;
  return neighbors(origin)
    .filter((candidate) => !occupied.has(key(candidate)) && !reserved.has(key(candidate)))
    .sort((left, right) => {
      const leftNearest = Math.min(...threats.map((threat) => distance(left, threat)));
      const rightNearest = Math.min(...threats.map((threat) => distance(right, threat)));
      return rightNearest - leftNearest || left.y - right.y || left.x - right.x;
    })[0] ?? null;
}

/**
 * Compile-time module names are interpreted here through exhaustive switches.
 * Both the web opponent and the conformance probe call these routines, so a
 * compiled module cannot exist as metadata without changing resolver inputs.
 */
export function attentionV4CommanderKinetic(
  match: AttentionV4Match,
  playerId: string,
  program: AttentionV4CommanderProgram,
  pressure: AttentionV4PressureSample = 0
): AttentionV4KineticPlan[] {
  const projection = projectAttentionV4Match(match, playerId);
  const legal = legalAttentionV4Actions(match, playerId);
  const units = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const ownFront = projection.activeFronts.find((front) => front.playerId === playerId)!.center;
  const enemyFront = projection.activeFronts.find((front) => front.playerId !== playerId)!.center;
  const occupied = new Set(projection.units.map((unit) => key(unit.position)));
  const reserved = new Set<string>();
  const flareCenters = projection.zones.filter((zone) => zone.kind === "flare").map((zone) => zone.center);
  const scoutCount = units.filter((unit) => unit.chassis === "scout").length;
  const pendingCount = projection.artifacts.filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending" && !artifact.verified).length;
  const projectedDanger = legal.projectedHazards.some((hazard) => hazard.ownerPlayerId === playerId);
  const pressureCondense = pressure === 0 ? 0 : pressure === 1 ? 1 : 2;
  const rosterCondense = scoutCount >= 3 ? 2 : scoutCount >= 2 ? 1 : 0;
  const desiredScoutCondense = projectedDanger || pendingCount >= Math.max(1, projection.players.find((player) => player.playerId === playerId)!.attention)
    ? 2
    : Math.max(pressureCondense, rosterCondense);

  return units.map((unit) => {
    const budget = unit.uap.effective;
    let actions: AttentionV4KineticAction[] = [];
    const reserveMove = (target: AttentionV4Coordinate): void => {
      if (budget < 1) return;
      const destination = stepToward(unit.position, target, occupied, reserved);
      if (!destination) return;
      reserved.add(key(destination));
      actions = [{ kind: "move", destination }];
    };
    const native = (): void => {
      if (unit.chassis === "scout") {
        reserveMove(ownFront);
      } else if (unit.chassis === "line") {
        const scouts = units
          .filter((candidate) => candidate.chassis === "scout" && distance(unit.position, candidate.position) <= unit.activeRange)
          .sort((left, right) => left.unitId.localeCompare(right.unitId));
        const scanLimit = unit.uap.batteryBonus > 0 ? 2 : 1;
        for (const scout of scouts.slice(0, Math.min(scanLimit, Math.max(0, budget - 1)))) {
          actions.push({ kind: "support-scan", scoutUnitId: scout.unitId });
        }
        if (actions.length < budget) actions.push({ kind: "step-up" });
      } else if (budget > 0) {
        actions = [{ kind: "command-uplink" }];
      }
    };

    if (budget === 0) {
      actions = [];
    } else {
      switch (program.movementModule) {
        case "hold":
          actions = [];
          break;
        case "own-front":
          reserveMove(ownFront);
          break;
        case "enemy-front":
          reserveMove(enemyFront);
          break;
        case "chassis-native":
          native();
          break;
        case "scout-mobile":
          if (unit.chassis === "scout") reserveMove(enemyFront);
          else reserveMove(ownFront);
          break;
        case "escort": {
          if (unit.chassis === "scout") {
            const line = units.filter((candidate) => candidate.chassis === "line")
              .sort((left, right) => distance(unit.position, left.position) - distance(unit.position, right.position) || left.unitId.localeCompare(right.unitId))[0];
            if (line) reserveMove(line.position);
          } else if (unit.chassis === "line") {
            actions = [{ kind: "step-up" }];
          }
          break;
        }
        case "siege-anchor":
          if (unit.chassis === "heavy") actions = [{ kind: "command-uplink" }];
          else reserveMove(ownFront);
          break;
        case "flare-evade": {
          const caughtBy = flareCenters.filter((center) => distance(unit.position, center) <= 1);
          const destination = stepAway(unit.position, caughtBy, occupied, reserved);
          if (destination) {
            reserved.add(key(destination));
            actions = [{ kind: "move", destination }];
          }
          break;
        }
        default:
          unreachable(program.movementModule, "movement");
      }
    }
    if (unit.chassis === "scout") {
      const steps = Math.min(desiredScoutCondense, Math.max(0, budget - actions.length));
      for (let index = 0; index < steps; index += 1) actions.push({ kind: "condense-output" });
    }
    return { playerId, unitId: unit.unitId, actions };
  });
}

function densestCenter(points: AttentionV4Coordinate[], fallback: AttentionV4Coordinate): AttentionV4Coordinate {
  if (points.length === 0) return fallback;
  return Array.from({ length: 100 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .map((center) => ({ center, score: points.filter((point) => distance(point, center) <= 1).length }))
    .sort((left, right) => right.score - left.score || left.center.y - right.center.y || left.center.x - right.center.x)[0].center;
}

export function attentionV4CommanderArtillery(
  match: AttentionV4Match,
  playerId: string,
  program: AttentionV4CommanderProgram,
  pressure: AttentionV4PressureSample = 0
): AttentionV4ArtilleryIntent {
  const projection = projectAttentionV4Match(match, playerId);
  const legal = legalAttentionV4Actions(match, playerId);
  const priorityOffset = (pressure + Math.max(0, projection.round - 4)) % program.shellPriority.length;
  const rotated = [...program.shellPriority.slice(priorityOffset), ...program.shellPriority.slice(0, priorityOffset)];
  const card = rotated
    .map((shell) => legal.shellCards.find((candidate) => candidate.shell === shell && candidate.legal))
    .find((candidate) => candidate !== undefined);
  if (!card) return { kind: "pass", playerId };

  const ownUnits = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const enemyUnits = projection.units.filter((unit) => unit.ownerPlayerId !== playerId);
  const enemyArtifacts = projection.artifacts.filter((artifact) => artifact.ownerPlayerId !== playerId && artifact.resolution === "pending" && !artifact.verified);
  const fallback = playerId === projection.players[0].playerId ? { x: 2, y: 2 } : { x: 7, y: 7 };
  let points: AttentionV4Coordinate[];
  switch (card.shell) {
    case "flare": points = ownUnits.map((unit) => unit.position); break;
    case "smoke": points = enemyUnits.map((unit) => unit.position); break;
    case "emp": points = enemyUnits.map((unit) => unit.position); break;
    case "he": points = enemyArtifacts.length > 0 ? enemyArtifacts.map((artifact) => artifact.position) : enemyUnits.map((unit) => unit.position); break;
    case "chaff": points = ownUnits.map((unit) => unit.position); break;
    default: return unreachable(card.shell, "shell");
  }
  const desired = densestCenter(points, fallback);
  const previews = legal.artilleryPreviews.filter((preview) => preview.cardId === card.cardId);
  const center = previews
    .map((preview) => ({
      preview,
      desiredDistance: distance(preview.center, desired),
      coverage: points.filter((point) => distance(point, preview.center) <= 1).length
    }))
    .sort((left, right) => Number(left.preview.blockedByScreenIds.length > 0) - Number(right.preview.blockedByScreenIds.length > 0) ||
      right.coverage - left.coverage || left.desiredDistance - right.desiredDistance || left.preview.center.y - right.preview.center.y || left.preview.center.x - right.preview.center.x)[0]?.preview.center ?? desired;
  return { kind: "fire", playerId, cardId: card.cardId, center };
}

export function attentionV4CommanderCapacityClaim(
  match: AttentionV4Match,
  playerId: string,
  program: AttentionV4CommanderProgram
): boolean {
  const legal = legalAttentionV4Actions(match, playerId).capacity;
  if (!legal.available || !legal.affordable || legal.rank === null) return false;
  switch (program.capacityModule) {
    case "never": return false;
    case "pioneer-focus": return legal.rank <= 1;
    case "follower-focus": return legal.rank === 2;
    case "pioneer-overclock": return legal.rank <= 2;
    case "follower-overclock": return legal.rank === 2;
    case "pioneer-flare": return legal.rank <= 3;
    case "follower-flare": return legal.rank >= 2 && legal.rank <= 3;
    case "adaptive": return true;
    default: return unreachable(program.capacityModule, "capacity");
  }
}

function fallbackCommit(artifact: AttentionV4ProjectedArtifact, playerId: string): AttentionV4CommandIntent {
  return artifact.reportedConfidence >= 0.5
    ? { kind: "accept", playerId, artifactId: artifact.artifactId }
    : { kind: "reject", playerId, artifactId: artifact.artifactId };
}

export function attentionV4CommanderCommand(
  match: AttentionV4Match,
  playerId: string,
  program: AttentionV4CommanderProgram,
  pressure: AttentionV4PressureSample = 0
): AttentionV4CommandIntent {
  const projection = projectAttentionV4Match(match, playerId);
  const legal = legalAttentionV4Actions(match, playerId);
  const ownUnits = projection.units.filter((unit) => unit.ownerPlayerId === playerId);
  const undecided = ownUnits.find((unit) => unit.outputDecision === "pending");
  if (undecided) {
    const allocation = legal.allocations.find((candidate) => candidate.unitId === undecided.unitId)!;
    const ownPending = projection.artifacts.filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending" && !artifact.verified);
    const scoutBudget = Math.max(1, Math.min(3, projection.players.find((player) => player.playerId === playerId)!.attention));
    if (undecided.chassis === "scout" && ownPending.length >= scoutBudget) {
      return { kind: "hold", playerId, unitId: undecided.unitId };
    }
    const densityPct = undecided.chassis === "scout"
      ? allocation.prefillDensityPct
      : Math.min(allocation.maximumDensityPct, pressure === 0 ? allocation.prefillDensityPct : pressure === 1 ? 80 : pressure === 2 ? 90 : 100);
    const volume = Math.min(allocation.prefillVolume, allocation.maximumVolumeByDensity[String(densityPct)] ?? 0);
    return volume > 0
      ? { kind: "emit", playerId, unitId: undecided.unitId, volume, densityPct }
      : { kind: "hold", playerId, unitId: undecided.unitId };
  }

  const pending = projection.artifacts
    .filter((artifact) => artifact.ownerPlayerId === playerId && artifact.resolution === "pending" && !artifact.battery.active)
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  const structuralBattery = pending.find((artifact) => artifact.densityPct >= 80 && artifact.sourceCalibration >= 0.8 && artifact.guarantee === null);
  if (structuralBattery && legal.abilities.perfectFocus.ready && ["pioneer-focus", "follower-focus", "adaptive"].includes(program.capacityModule)) {
    return { kind: "perfect-focus", playerId, artifactId: structuralBattery.artifactId };
  }
  if (legal.abilities.overclock.ready && ["pioneer-overclock", "follower-overclock", "adaptive"].includes(program.capacityModule) && pending.length > 0) {
    return { kind: "overclock", playerId };
  }

  // Commanders triage one context thread per round. This preserves a backlog
  // for aging/traffic mechanics and keeps automated matches bounded while an
  // explicitly activated Battery counts as the completed thread.
  const triagedThisRound = match.state.artifacts.some((artifact) => artifact.ownerPlayerId === playerId &&
    (artifact.resolution !== "pending" || artifact.battery.activatedRound === match.state.round));
  if (triagedThisRound) return { kind: "end-command", playerId };

  const legalById = new Map(legal.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const verified = pending.find((artifact) => artifact.verified);
  const settleVerified = (artifact: AttentionV4ProjectedArtifact | undefined): AttentionV4CommandIntent | null => {
    if (!artifact) return null;
    if (artifact.revealedSound === false) return { kind: "reject", playerId, artifactId: artifact.artifactId };
    if (artifact.revealedSound === true) return { kind: "accept", playerId, artifactId: artifact.artifactId };
    return null;
  };
  const verify = (artifact: AttentionV4ProjectedArtifact | undefined): AttentionV4CommandIntent | null => {
    if (!artifact || !legalById.get(artifact.artifactId)?.verify.legal) return null;
    return { kind: "verify", playerId, artifactId: artifact.artifactId };
  };
  const seize = (artifact: AttentionV4ProjectedArtifact | undefined): AttentionV4CommandIntent | null => {
    if (!artifact || !legalById.get(artifact.artifactId)?.seize.legal) return null;
    return { kind: "seize", playerId, artifactId: artifact.artifactId };
  };
  let decision: AttentionV4CommandIntent | null = null;
  switch (program.triageModule) {
    case "accept-all":
      decision = pending[0] ? { kind: "accept", playerId, artifactId: pending[0].artifactId } : null;
      break;
    case "verify-lowest": {
      decision = settleVerified(verified);
      const target = [...pending].filter((artifact) => !artifact.verified).sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId))[0];
      decision ??= verify(target) ?? (target ? fallbackCommit(target, playerId) : null);
      break;
    }
    case "seize-cheapest": {
      const target = [...pending].sort((left, right) =>
        (legalById.get(left.artifactId)?.seize.cost.total ?? 99) - (legalById.get(right.artifactId)?.seize.cost.total ?? 99) || left.artifactId.localeCompare(right.artifactId))[0];
      decision = seize(target) ?? settleVerified(verified) ?? (target ? fallbackCommit(target, playerId) : null);
      break;
    }
    case "confidence-reject": {
      const target = pending.find((artifact) => artifact.reportedConfidence < 0.5) ?? pending[0];
      decision = target ? fallbackCommit(target, playerId) : null;
      break;
    }
    case "confidence-verify": {
      decision = settleVerified(verified);
      const target = pending.find((artifact) => !artifact.verified && artifact.reportedConfidence < 0.7) ?? pending.find((artifact) => !artifact.verified);
      decision ??= target && target.reportedConfidence < 0.7 ? verify(target) ?? fallbackCommit(target, playerId) : target ? { kind: "accept", playerId, artifactId: target.artifactId } : null;
      break;
    }
    case "recon-reject": {
      const target = pending.find((artifact) => artifact.sourceChassis === "scout") ?? pending[0];
      decision = target ? target.sourceChassis === "scout"
        ? { kind: "reject", playerId, artifactId: target.artifactId }
        : fallbackCommit(target, playerId) : null;
      break;
    }
    case "line-assist": {
      const assisted = pending.find((artifact) => artifact.supportScanUnitIds.length > 0);
      decision = settleVerified(verified) ?? verify(assisted) ?? (assisted ? fallbackCommit(assisted, playerId) : null);
      const line = pending.find((artifact) => artifact.sourceChassis === "line");
      decision ??= verify(line) ?? (line ? fallbackCommit(line, playerId) : null);
      decision ??= pending[0] ? fallbackCommit(pending[0], playerId) : null;
      break;
    }
    case "siege-seize": {
      const heavy = pending.find((artifact) => artifact.sourceChassis === "heavy");
      decision = seize(heavy) ?? settleVerified(verified) ?? (heavy ? fallbackCommit(heavy, playerId) : null);
      decision ??= pending[0] ? fallbackCommit(pending[0], playerId) : null;
      break;
    }
    case "risk-adaptive": {
      const hazardId = legal.projectedHazards.find((hazard) => hazard.ownerPlayerId === playerId)?.artifactId;
      const hazard = pending.find((artifact) => artifact.artifactId === hazardId);
      decision = verify(hazard) ?? (hazard ? { kind: "reject", playerId, artifactId: hazard.artifactId } : null) ?? settleVerified(verified);
      const target = [...pending].filter((artifact) => !artifact.verified).sort((left, right) => left.reportedConfidence - right.reportedConfidence || left.artifactId.localeCompare(right.artifactId))[0];
      decision ??= target ? target.reportedConfidence < 0.38
        ? { kind: "reject", playerId, artifactId: target.artifactId }
        : target.reportedConfidence > 0.74
          ? { kind: "accept", playerId, artifactId: target.artifactId }
          : verify(target) ?? fallbackCommit(target, playerId) : null;
      break;
    }
    case "pressure-adaptive": {
      const target = [...pending].sort((left, right) => right.overTaxReasons.length - left.overTaxReasons.length || right.age - left.age || right.localTraffic - left.localTraffic || left.artifactId.localeCompare(right.artifactId))[0];
      decision = settleVerified(verified);
      if (!decision && target) {
        decision = target.overTaxReasons.length > 0 ? verify(target) ?? { kind: "reject", playerId, artifactId: target.artifactId }
          : pressure >= 2 ? seize(target) ?? fallbackCommit(target, playerId)
            : verify(target) ?? fallbackCommit(target, playerId);
      }
      break;
    }
    default:
      return unreachable(program.triageModule, "triage");
  }
  return decision ?? { kind: "end-command", playerId };
}

export function attentionV4StartingRanges(program: AttentionV4CommanderProgram): number[] {
  return program.composition.map((chassis) => defaultAttentionV4Rules.chassis[chassis].range);
}

export function attentionV4PressureShell(program: AttentionV4CommanderProgram, pressure: AttentionV4PressureSample): AttentionV4Shell {
  return program.shellPriority[pressure];
}
