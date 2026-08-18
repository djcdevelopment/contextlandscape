import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type {
  AttentionArtilleryShell,
  AttentionCoordinate,
  AttentionProjectedArtifact,
  AttentionUapAction,
  AttentionUnitState,
  BattleCommandSubmission,
  BattleCommandView,
  EventEnvelope
} from "@landscape/contracts";
import { gameArt, type GameArtSubjectId } from "./art.js";
import "./battle-command.css";

const PLAYER = "alpha";
type Selection = { kind: "unit"; id: string } | { kind: "artifact"; id: string } | { kind: "cell"; at: AttentionCoordinate };
type MoveMode = "step" | "active-recon";

const shellCopy: Record<AttentionArtilleryShell, { label: string; detail: string }> = {
  flare: { label: "Flare", detail: "Doubles output inside the 3×3 zone for two emissions; Chaff can block it." },
  chaff: { label: "Chaff", detail: "Screens this 3×3 zone from hostile artillery for two artillery phases." },
  he: { label: "HE", detail: "Immediately resolves every pending artifact in the zone at 70% soundness each." },
  smoke: { label: "Smoke", detail: "Drops hostile unit calibration to 20% in the zone for two rounds." }
};

function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, init).then(async (response) => {
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
    return body as T;
  });
}

function distance(left: AttentionCoordinate, right: AttentionCoordinate) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function shortId(id: string) {
  return id.split(":").slice(-2).join(" · ");
}

function unitCode(chassis: AttentionUnitState["chassis"]) {
  return chassis === "scout" ? "SC" : chassis === "line" ? "LN" : "SG";
}

const chassisProfile: Record<AttentionUnitState["chassis"], { powerClass: string; signature: string; effect: string; cost: string }> = {
  scout: { powerClass: "LIGHT · RECON", signature: "Active Recon", effect: "Move one cell and set next-emission calibration to 85%.", cost: "3 UAP" },
  line: { powerClass: "MEDIUM · SUPPORT", signature: "Step-Up / Support Scan", effect: "Set next calibration to 85%, or open a remote verification path inside range.", cost: "1 UAP" },
  siege: { powerClass: "HEAVY · COMMAND", signature: "Command Uplink", effect: "+1 attention next round and 20% next-emission calibration.", cost: "1 UAP" }
};

function ArtFrame({ subject, className = "", children }: { subject: GameArtSubjectId; className?: string; children?: ReactNode }) {
  const asset = gameArt[subject];
  const style = asset.src ? {
    backgroundImage: `linear-gradient(90deg, rgba(5, 11, 17, .9), rgba(5, 11, 17, .18)), url(${asset.src})`,
    backgroundPosition: asset.focalPoint,
    backgroundSize: asset.crop
  } as CSSProperties : undefined;
  return <div className={`battle-art art-${subject} ${className}`} style={style} role={asset.src ? "img" : undefined} aria-label={asset.src ? asset.alt : undefined}>
    {children}
  </div>;
}

function Briefing({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return <main className="briefing-shell">
    <ArtFrame subject="battlefield-context-furnace" className="briefing-hero">
      <nav className="battle-nav" aria-label="Context Landscape views">
        <strong>CONTEXT LANDSCAPE</strong><span />
        <a href="/?view=legacy">Research scenarios</a><a href="/?view=commander">Commander projection</a><a href="/?view=atlas">Evidence atlas</a>
      </nav>
      <div className="briefing-copy">
        <p className="battle-kicker">OPERATION 01 · EXPERIMENTAL V3 RULESET</p>
        <h1>The Contested Context</h1>
        <p>Command a balanced Scout, Line, and Siege formation. Turn uncertain artifacts into progress before accepted drift collapses the operation.</p>
        <button className="battle-primary briefing-start" disabled={busy} onClick={onStart}>{busy ? "Opening command link…" : "Enter battle command"}</button>
      </div>
    </ArtFrame>
    <section className="briefing-grid">
      <article><span>WIN</span><strong>12 objective progress</strong><p>Accept sound or seize objective-eligible artifacts. At round 8, remaining matches use a disclosed tiebreak.</p></article>
      <article><span>LOSE</span><strong>5 accepted-unsound drift</strong><p>Rejected artifacts add no drift. Drift defeats progress if both thresholds land together.</p></article>
      <article><span>DECIDE</span><strong>3 attention; incomplete supervision</strong><p>Verify locally, Support Scan, or trust reported confidence.</p></article>
      <article><span>DISRUPT</span><strong>Flare · Chaff · HE · Smoke</strong><p>One of each shell. Every shot covers an exact 3×3 volume.</p></article>
    </section>
    <section className="briefing-roster">
      {(["scout", "line", "siege"] as const).map((chassis) => <ArtFrame key={chassis} subject={`mech-${chassis}` as GameArtSubjectId}>
        <span>{chassis === "scout" ? "3" : chassis === "line" ? "2" : "1"} unit actions</span>
        <strong>{chassis}</strong>
        <small>{chassis === "scout" ? "Mobility and calibrated reconnaissance" : chassis === "line" ? "Step-Up and remote Support Scan" : "Range and next-round command capacity"}</small>
      </ArtFrame>)}
      <div className="briefing-doctrine"><span>OPPOSITION</span><strong>Threshold Doctrine</strong><p>A deterministic commander using only public board state. It verifies reachable uncertainty and otherwise resolves at the 50% confidence line.</p></div>
    </section>
  </main>;
}

const turnStages = ["emission", "artillery", "movement", "capacity", "command", "resolution"] as const;
const turnHelp: Record<typeof turnStages[number], { label: string; description: string; tip: string }> = {
  emission: {
    label: "Artifact emission",
    description: "Every unit emits new artifacts using its throughput, calibration, and active range.",
    tip: "Reported confidence is a signal, not revealed truth. Check each artifact's source before committing attention."
  },
  artillery: {
    label: "Artillery declaration",
    description: "Choose one shell and a target cell, or pass. Both commanders resolve simultaneously across an exact 3×3 volume.",
    tip: "Enable Unit Radar to see source relationships and current unit ranges before placing a shell."
  },
  movement: {
    label: "Unit actions",
    description: "Queue simultaneous UAP plans for Scout, Line, and Siege. Unplanned units deliberately hold.",
    tip: "Moves change local verification reach now. Range Shift and calibration actions shape the next emission."
  },
  capacity: {
    label: "Capacity claim",
    description: "Spend attention for a permanent recurring attention increase, or preserve it for artifact decisions.",
    tip: "Capacity compounds over later rounds and claim rank unlocks Perfect Focus and Overclock."
  },
  command: {
    label: "Artifact command",
    description: "Verify, accept, reject, seize, or focus your pending artifacts before ending the round. Verification reveals truth but leaves the artifact pending.",
    tip: "Spend attention when certainty can change your choice. Anything still unresolved when command ends is automatically accepted."
  },
  resolution: {
    label: "Round resolution",
    description: "Progress, drift, effect durations, and terminal thresholds resolve before the next emission.",
    tip: "Drift wins simultaneous threshold crossings. At the final round, unresolved matches use progress → lower drift → attention."
  }
};

function TurnWorkflow({ view, onOpen }: { view: BattleCommandView; onOpen: () => void }) {
  const phase = view.projection.phase === "terminal" ? "resolution" : view.projection.phase;
  const currentIndex = Math.max(0, turnStages.indexOf(phase));
  const current = turnHelp[phase];
  return <aside className="turn-workflow" aria-label="Turn workflow">
    <div className="workflow-heading"><div><span>TURN WORKFLOW</span><strong>Round {view.projection.round} of {view.rules.roundLimit}</strong></div><button onClick={onOpen}>Full rules</button></div>
    <ol className="workflow-stages">
      {turnStages.map((stage, index) => <li key={stage} className={stage === phase ? "current" : index < currentIndex ? "complete" : "upcoming"}>
        <i>{index < currentIndex ? "✓" : index + 1}</i><div><strong>{turnHelp[stage].label}</strong><small>{stage === phase ? "Current step" : index < currentIndex ? "Complete" : "Upcoming"}</small></div>
        <button className="workflow-info" aria-label={`About ${turnHelp[stage].label}`} aria-describedby={`workflow-tip-${stage}`}>?
          <span className="workflow-tooltip" id={`workflow-tip-${stage}`} role="tooltip"><b>{turnHelp[stage].label}</b><span>{turnHelp[stage].description}</span><em>{turnHelp[stage].tip}</em></span>
        </button>
      </li>)}
    </ol>
    <section className="workflow-help">
      <span>NOW</span><h2>{current.label}</h2><p>{current.description}</p>
      <div><strong>FIELD TIP</strong><p>{current.tip}</p></div>
    </section>
    <div className="workflow-legend"><span><i className="friendly" />friendly</span><span><i className="hostile" />hostile</span><span><i className="artifact" />artifact</span><span><i className="range" />range</span></div>
  </aside>;
}

function StatusStrip({ view }: { view: BattleCommandView }) {
  const self = view.projection.players.find((player) => player.playerId === PLAYER)!;
  const activeArtifacts = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending").length;
  const accepted = view.projection.artifacts.filter((artifact) => artifact.ownerPlayerId === PLAYER && artifact.resolution === "accepted");
  const queuedProgress = view.projection.artifacts.filter((artifact) =>
    artifact.ownerPlayerId === PLAYER && artifact.objectiveEligible && (
      artifact.resolution === "seized" ||
      (artifact.resolution === "accepted" && (artifact.revealedSound === true || artifact.guarantee !== null))
    )
  ).length;
  const queuedDrift = accepted.filter((artifact) => artifact.revealedSound === false && artifact.guarantee === null).length;
  return <section className="battle-status" aria-label="Battle status">
    <Status label="Round" value={`${view.projection.round}/${view.rules.roundLimit}`} />
    <Status label="Phase" value={view.projection.phase} accent />
    <Status label="Win · objective progress" value={`${self.progress}/${view.rules.objectiveTarget}${queuedProgress ? ` · +${queuedProgress} resolving` : ""}`} meter={self.progress / view.rules.objectiveTarget} />
    <Status label="Lose · unsound drift" value={`${self.drift}/${view.rules.driftLimit}${queuedDrift ? ` · +${queuedDrift} resolving` : ""}`} meter={self.drift / view.rules.driftLimit} danger />
    <Status label="Attention" value={String(self.attention)} />
    <Status label="Pending decisions" value={`${activeArtifacts} unresolved`} />
  </section>;
}

function Status({ label, value, meter, danger, accent }: { label: string; value: string; meter?: number; danger?: boolean; accent?: boolean }) {
  return <div className={`${danger ? "danger" : ""} ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong>{meter !== undefined && <i><b style={{ width: `${Math.min(100, meter * 100)}%` }} /></i>}</div>;
}

type ArtifactOrder = "high" | "low";

function ArtifactTray({ view, selection, onSelect, order, onOrder, radarEnabled, onRadar }: {
  view: BattleCommandView;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  order: ArtifactOrder;
  onOrder: () => void;
  radarEnabled: boolean;
  onRadar: () => void;
}) {
  const pending = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending");
  const friendly = pending.filter((artifact) => artifact.ownerPlayerId === PLAYER);
  const sorted = [...friendly].sort((left, right) => {
    const confidence = order === "high"
      ? right.reportedConfidence - left.reportedConfidence
      : left.reportedConfidence - right.reportedConfidence;
    return confidence || left.artifactId.localeCompare(right.artifactId);
  });
  return <section className="artifact-tray" aria-label="Artifact tactical roster">
    <div className="artifact-tray-heading">
      <div><span>FRIENDLY PENDING</span><strong>{friendly.length} unresolved</strong><small>{pending.length} unresolved across both sides · not progress</small></div>
      <div className="artifact-tray-controls">
        <button aria-pressed={radarEnabled} className={radarEnabled ? "active" : ""} onClick={onRadar}>Unit radar {radarEnabled ? "ON" : "OFF"}</button>
        <button onClick={onOrder} aria-label={`Sort confidence ${order === "high" ? "low to high" : "high to low"}`}>Confidence {order === "high" ? "↓" : "↑"}</button>
      </div>
    </div>
    <div className="artifact-pieces">
      {sorted.map((artifact) => {
        const source = view.projection.units.find((unit) => unit.unitId === artifact.sourceUnitId);
        const selected = selection?.kind === "artifact" && selection.id === artifact.artifactId;
        return <button key={artifact.artifactId} className={`artifact-piece friendly ${selected ? "selected" : ""}`}
          aria-pressed={selected} onClick={() => onSelect({ kind: "artifact", id: artifact.artifactId })}>
          <span><i />{source ? unitCode(source.chassis) : "??"}{artifact.objectiveEligible ? <b title="Objective eligible">◆</b> : null}</span>
          <strong>{percent(artifact.reportedConfidence)}</strong>
          <small>{artifact.position.x},{artifact.position.y}</small>
        </button>;
      })}
      {sorted.length === 0 && <p>No unresolved artifacts remain in the field.</p>}
    </div>
  </section>;
}

function EnemyArtifactRail({ view, selection, onSelect, order }: {
  view: BattleCommandView;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  order: ArtifactOrder;
}) {
  const artifacts = view.projection.artifacts
    .filter((artifact) => artifact.resolution === "pending" && artifact.ownerPlayerId !== PLAYER)
    .sort((left, right) => {
      const confidence = order === "high"
        ? right.reportedConfidence - left.reportedConfidence
        : left.reportedConfidence - right.reportedConfidence;
      return confidence || left.artifactId.localeCompare(right.artifactId);
    });
  return <aside className="enemy-artifact-rail" aria-label={`${artifacts.length} hostile artifacts`}>
    <div className="enemy-rail-heading"><span>HOSTILE</span><strong>{artifacts.length}</strong></div>
    <div className="enemy-artifact-pieces">
      {artifacts.map((artifact) => {
        const source = view.projection.units.find((unit) => unit.unitId === artifact.sourceUnitId);
        const selected = selection?.kind === "artifact" && selection.id === artifact.artifactId;
        return <button key={artifact.artifactId} className={`artifact-piece hostile ${selected ? "selected" : ""}`}
          aria-pressed={selected} onClick={() => onSelect({ kind: "artifact", id: artifact.artifactId })}>
          <span><i />{source ? unitCode(source.chassis) : "??"}{artifact.objectiveEligible ? <b title="Objective eligible">◆</b> : null}</span>
          <strong>{percent(artifact.reportedConfidence)}</strong>
          <small>{artifact.position.x},{artifact.position.y}</small>
        </button>;
      })}
    </div>
  </aside>;
}

function OverlayKey({ view, selectedUnit, radarEnabled, artilleryTarget }: {
  view: BattleCommandView;
  selectedUnit?: AttentionUnitState;
  radarEnabled: boolean;
  artilleryTarget: AttentionCoordinate | null;
}) {
  return <section className="overlay-key" aria-label="Visible map overlay key">
    <span>VISIBLE OVERLAYS</span>
    <div className="overlay-key-items">
      <div><i className="front" /><strong>Active front</strong><small>dashed objective zone</small></div>
      {view.projection.flares.length > 0 && <div><i className="flare" /><strong>Flare · {view.projection.flares[0].emissionsRemaining}</strong><small>emissions remaining · 2× output</small></div>}
      {(view.projection.chaffs?.length ?? 0) > 0 && <div><i className="chaff" /><strong>Chaff · {view.projection.chaffs?.[0].artilleryPhasesRemaining}</strong><small>artillery phases · shell screen</small></div>}
      {(view.projection.smokes?.length ?? 0) > 0 && <div><i className="smoke" /><strong>Smoke · {view.projection.smokes?.[0].roundsRemaining}</strong><small>rounds remaining · 20% calibration</small></div>}
      {selectedUnit && <div><i className="selected-range" /><strong>{unitCode(selectedUnit.chassis)} R{selectedUnit.spatial?.activeRange ?? 0}</strong><small>pale cells · current range</small></div>}
      {radarEnabled && <div><i className="radar" /><strong>Unit radar</strong><small>dotted lineage + range bounds</small></div>}
      {artilleryTarget && <div><i className="target" /><strong>Fire preview</strong><small>solid yellow · exact 3×3</small></div>}
    </div>
  </section>;
}

function plannedPosition(unit: AttentionUnitState, actions: AttentionUapAction[]) {
  return actions.reduce((position, action) => action.kind === "move" ? action.destination : position, unit.position);
}

function validatePlans(view: BattleCommandView, plans: Record<string, AttentionUapAction[]>): string[] {
  const friendly = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER);
  const issues: string[] = [];
  const destinations = new Map<string, string>();
  for (const unit of friendly) {
    const actions = plans[unit.unitId] ?? [];
    const budget = unit.uap?.budget ?? 0;
    if (actions.length > budget) issues.push(`${unitCode(unit.chassis)} exceeds its ${budget} UAP budget`);
    let position = unit.position;
    let range = unit.spatial?.activeRange ?? view.rules.spatial.ranges[unit.chassis].defaultRange;
    const kinds = actions.map((action) => action.kind);
    if (unit.chassis === "scout" && (kinds.includes("support-scan") || kinds.includes("command-uplink") || (kinds.includes("turbo-charge") && !(kinds.length === 3 && kinds[0] === "move" && kinds[1] === "turbo-charge" && kinds[2] === "step-up")))) issues.push(`${unitCode(unit.chassis)} has an invalid action sequence`);
    if (unit.chassis === "line" && (kinds.includes("turbo-charge") || kinds.includes("command-uplink") || kinds.filter((kind) => kind === "step-up").length > 1)) issues.push(`${unitCode(unit.chassis)} has an invalid action sequence`);
    if (unit.chassis === "siege" && kinds.some((kind) => kind !== "move" && kind !== "command-uplink" && kind !== "range-shift")) issues.push(`${unitCode(unit.chassis)} has an invalid action sequence`);
    for (const action of actions) {
      if (action.kind === "move") {
        if (action.destination.x >= view.rules.board.width || action.destination.y >= view.rules.board.height || distance(position, action.destination) !== 1) issues.push(`${unitCode(unit.chassis)} contains a non-adjacent move`);
        position = action.destination;
      }
      if (action.kind === "support-scan") {
        const artifact = view.projection.artifacts.find((candidate) => candidate.artifactId === action.artifactId && candidate.ownerPlayerId === PLAYER && candidate.resolution === "pending");
        if (!artifact || distance(position, artifact.position) > (unit.spatial?.activeRange ?? 0)) issues.push(`${unitCode(unit.chassis)} Support Scan target is out of range`);
      }
      if (action.kind === "range-shift") {
        range += action.delta;
        const profile = view.rules.spatial.ranges[unit.chassis];
        if (range < profile.minimumRange || range > profile.maximumRange) issues.push(`${unitCode(unit.chassis)} range must stay between R${profile.minimumRange} and R${profile.maximumRange}`);
      }
    }
    const key = `${position.x},${position.y}`;
    if (destinations.has(key)) issues.push(`${unitCode(unit.chassis)} conflicts with ${destinations.get(key)} at ${key}`);
    destinations.set(key, unitCode(unit.chassis));
    const occupied = view.projection.units.find((candidate) => candidate.unitId !== unit.unitId && candidate.position.x === position.x && candidate.position.y === position.y && !(plans[candidate.unitId] ?? []).some((action) => action.kind === "move"));
    if (occupied) issues.push(`${unitCode(unit.chassis)} ends on an occupied cell`);
  }
  return [...new Set(issues)];
}

function TacticalBoard({
  view, selection, onSelection, artilleryTarget, onCell, selectedUnit, plans, radarEnabled
}: {
  view: BattleCommandView;
  selection: Selection | null;
  onSelection: (selection: Selection) => void;
  artilleryTarget: AttentionCoordinate | null;
  onCell: (at: AttentionCoordinate) => void;
  selectedUnit?: AttentionUnitState;
  plans: Record<string, AttentionUapAction[]>;
  radarEnabled: boolean;
}) {
  const projection = view.projection;
  const range = selectedUnit?.spatial?.activeRange;
  const activePlan = selectedUnit ? plans[selectedUnit.unitId] ?? [] : [];
  const origin = selectedUnit ? plannedPosition(selectedUnit, activePlan) : null;
  const selectedArtifact = selection?.kind === "artifact" ? projection.artifacts.find((artifact) => artifact.artifactId === selection.id) : null;
  const selectedSource = selectedArtifact ? projection.units.find((unit) => unit.unitId === selectedArtifact.sourceUnitId) : null;
  const cell = 70;
  return <svg className="tactical-board" viewBox="0 0 700 700" role="grid" aria-label="10 by 10 battle grid">
    <defs><pattern id="micro-grid" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M7 0H0V7" fill="none" stroke="#31506a" strokeOpacity=".12" /></pattern><clipPath id="board-clip"><rect width="700" height="700" /></clipPath></defs>
    <rect width="700" height="700" fill="#08121b" />
    <rect width="700" height="700" fill="url(#micro-grid)" />
    {projection.activeFronts.map((front) => <rect key={front.playerId} className={`active-front ${front.playerId === PLAYER ? "friendly" : "hostile"}`}
      x={(front.center.x - front.radius) * cell} y={(front.center.y - front.radius) * cell}
      width={(front.radius * 2 + 1) * cell} height={(front.radius * 2 + 1) * cell} />)}
    {radarEnabled && <g className="radar-layer" clipPath="url(#board-clip)">
      {projection.units.map((unit) => {
        const position = unit.ownerPlayerId === PLAYER && plans[unit.unitId] ? plannedPosition(unit, plans[unit.unitId]) : unit.position;
        const activeRange = unit.spatial?.activeRange ?? 0;
        return <rect key={`radar-field-${unit.unitId}`} className={`radar-field ${unit.ownerPlayerId === PLAYER ? "friendly" : "hostile"}`}
          x={(position.x - activeRange) * cell} y={(position.y - activeRange) * cell}
          width={(activeRange * 2 + 1) * cell} height={(activeRange * 2 + 1) * cell} />;
      })}
      {projection.artifacts.filter((artifact) => artifact.resolution === "pending").map((artifact) => {
        const source = projection.units.find((unit) => unit.unitId === artifact.sourceUnitId);
        if (!source) return null;
        const sourcePosition = source.ownerPlayerId === PLAYER && plans[source.unitId] ? plannedPosition(source, plans[source.unitId]) : source.position;
        return <line key={`radar-link-${artifact.artifactId}`} className={`radar-link ${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"}`}
          style={{ opacity: .2 + artifact.reportedConfidence * .55 }} x1={sourcePosition.x * cell + 35} y1={sourcePosition.y * cell + 35}
          x2={artifact.position.x * cell + 35} y2={artifact.position.y * cell + 35}><title>{unitCode(source.chassis)} source · {percent(artifact.reportedConfidence)} reported confidence</title></line>;
      })}
    </g>}
    {Array.from({ length: 100 }, (_, index) => {
      const at = { x: index % 10, y: Math.floor(index / 10) };
      const inRange = origin && range !== undefined && distance(origin, at) <= range && distance(origin, at) > 0;
      const inTarget = artilleryTarget && distance(artilleryTarget, at) <= 1;
      const chosen = selection?.kind === "cell" && selection.at.x === at.x && selection.at.y === at.y;
      return <g key={index} role="gridcell" tabIndex={0} aria-label={`Cell ${at.x},${at.y}`} onClick={() => onCell(at)}
        onKeyDown={(event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") onCell(at); }}>
        <rect x={at.x * cell} y={at.y * cell} width={cell} height={cell} className={`board-cell ${inRange ? "in-range" : ""} ${inTarget ? "in-target" : ""} ${chosen ? "selected" : ""}`} />
        <text x={at.x * cell + 5} y={at.y * cell + 12} className="coordinate">{at.x},{at.y}</text>
      </g>;
    })}
    {[...projection.flares.map((zone) => ({ ...zone, type: "flare" })), ...(projection.chaffs ?? []).map((zone) => ({ ...zone, type: "chaff" })), ...(projection.smokes ?? []).map((zone) => ({ ...zone, type: "smoke" }))].map((zone) =>
      <g key={`${zone.type}-${"flareId" in zone ? zone.flareId : "chaffId" in zone ? zone.chaffId : zone.smokeId}`} className="effect-group">
        <rect className={`effect-zone ${zone.type}`} x={(zone.center.x - 1) * cell} y={(zone.center.y - 1) * cell} width={cell * 3} height={cell * 3} />
        <text className={`effect-label ${zone.type}`} x={(zone.center.x - 1) * cell + 7} y={(zone.center.y - 1) * cell + 16}>{zone.type.toUpperCase()}</text>
      </g>)}
    {selectedSource && selectedArtifact && <line className="source-link" x1={selectedSource.position.x * cell + 35} y1={selectedSource.position.y * cell + 35}
      x2={selectedArtifact.position.x * cell + 35} y2={selectedArtifact.position.y * cell + 35} />}
    {projection.artifacts.filter((artifact) => artifact.resolution === "pending").map((artifact, index) => {
      const sameCell = projection.artifacts.filter((candidate) => candidate.resolution === "pending" && candidate.position.x === artifact.position.x && candidate.position.y === artifact.position.y);
      const offset = sameCell.findIndex((candidate) => candidate.artifactId === artifact.artifactId);
      const x = artifact.position.x * cell + 14 + (offset % 4) * 13;
      const y = artifact.position.y * cell + 48 + Math.floor(offset / 4) * 11;
      return <g key={artifact.artifactId} role="button" tabIndex={0} aria-label={`${artifact.ownerPlayerId === PLAYER ? "Friendly" : "Hostile"} artifact, ${percent(artifact.reportedConfidence)} reported confidence`}
        onClick={(event) => { event.stopPropagation(); onSelection({ kind: "artifact", id: artifact.artifactId }); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelection({ kind: "artifact", id: artifact.artifactId }); }}>
        <circle cx={x} cy={y} r={selection?.kind === "artifact" && selection.id === artifact.artifactId ? 7 : 5} className={`artifact-token ${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${artifact.revealedSound !== null ? "revealed" : ""}`} />
      </g>;
    })}
    {projection.units.map((unit) => {
      const selected = selection?.kind === "unit" && selection.id === unit.unitId;
      const position = unit.ownerPlayerId === PLAYER && plans[unit.unitId] ? plannedPosition(unit, plans[unit.unitId]) : unit.position;
      const x = position.x * cell + 35; const y = position.y * cell + 31;
      return <g key={unit.unitId} role="button" tabIndex={0} className="unit-button" aria-label={`${unit.ownerPlayerId === PLAYER ? "Friendly" : "Hostile"} ${unit.chassis} at ${position.x},${position.y}`}
        onClick={(event) => { event.stopPropagation(); onSelection({ kind: "unit", id: unit.unitId }); }}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelection({ kind: "unit", id: unit.unitId }); }}>
        <circle cx={x} cy={y} r={selected ? 22 : 18} className={`unit-token ${unit.ownerPlayerId === PLAYER ? "friendly" : "hostile"}`} />
        <text x={x} y={y + 5} className="unit-letter">{unitCode(unit.chassis)}</text>
        {unit.ownerPlayerId === PLAYER && <text x={x} y={y - 24} className="uap-label">{(unit.uap?.budget ?? 0) - (plans[unit.unitId]?.length ?? unit.uap?.spent ?? 0)} UAP</text>}
        {selected && <text x={x} y={y + 31} className="unit-impact">R{unit.spatial?.activeRange ?? 0} / {percent(unit.emissionCalibration)}</text>}
      </g>;
    })}
  </svg>;
}

function MechRoster({ view, selection, onSelection, plans, moveMode, setMoveMode, appendAction, clearPlan }: {
  view: BattleCommandView;
  selection: Selection | null;
  onSelection: (selection: Selection) => void;
  plans: Record<string, AttentionUapAction[]>;
  moveMode: MoveMode;
  setMoveMode: (mode: MoveMode) => void;
  appendAction: (unit: AttentionUnitState, action: AttentionUapAction) => void;
  clearPlan: (unitId: string) => void;
}) {
  const units = view.projection.units
    .filter((unit) => unit.ownerPlayerId === PLAYER)
    .sort((left, right) => (["scout", "line", "siege"].indexOf(left.chassis) - ["scout", "line", "siege"].indexOf(right.chassis)));
  const pending = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending");
  const selectedUnit = selection?.kind === "unit" ? units.find((unit) => unit.unitId === selection.id) : undefined;
  const selectedActions = selectedUnit ? plans[selectedUnit.unitId] ?? [] : [];
  const selectedRemaining = selectedUnit ? Math.max(0, (selectedUnit.uap?.budget ?? 0) - selectedActions.length) : 0;
  const selectedRange = selectedUnit
    ? selectedActions.reduce((value, action) => action.kind === "range-shift" ? value + action.delta : value, selectedUnit.spatial?.activeRange ?? view.rules.spatial.ranges[selectedUnit.chassis].defaultRange)
    : 0;
  return <aside className="mech-roster" aria-label="Friendly mech formation">
    <div className="mech-roster-heading"><div><span>FRIENDLY FORMATION</span><strong>3 mech profiles</strong></div><small>Select to command</small></div>
    <div className="mech-roster-cards">
      {units.map((unit) => {
        const profile = chassisProfile[unit.chassis];
        const selected = selection?.kind === "unit" && selection.id === unit.unitId;
        const actions = plans[unit.unitId] ?? [];
        const baseUap = unit.uap?.budget ?? 0;
        const spent = view.projection.phase === "movement" ? actions.length : unit.uap?.spent ?? 0;
        const remaining = Math.max(0, baseUap - spent);
        const baseRange = view.rules.spatial.ranges[unit.chassis].defaultRange;
        const nextRange = actions.reduce((value, action) => action.kind === "range-shift" ? value + action.delta : value, unit.spatial?.activeRange ?? baseRange);
        const position = plannedPosition(unit, actions);
        const artifactsInRange = pending.filter((artifact) => distance(position, artifact.position) <= nextRange).length;
        const plannedCalibration = unit.chassis === "scout" && actions.some((action) => action.kind === "step-up")
          ? view.rules.uap.scout.activeReconCalibration
          : unit.chassis === "line" && actions.some((action) => action.kind === "step-up")
            ? view.rules.uap.line.stepUpCalibration
            : unit.chassis === "siege" && actions.some((action) => action.kind === "command-uplink")
              ? view.rules.uap.siege.uplinkCalibration
              : unit.nextEmissionCalibration;
        return <article className={`mech-profile ${selected ? "selected" : ""}`} key={unit.unitId}>
          <button className="mech-profile-select" aria-pressed={selected} onClick={() => onSelection({ kind: "unit", id: unit.unitId })}>
            <ArtFrame subject={`mech-${unit.chassis}` as GameArtSubjectId} className="mech-profile-art">
              <span>{profile.powerClass}</span><strong>{unit.chassis}</strong><b>{unitCode(unit.chassis)}</b>
            </ArtFrame>
          </button>
          <div className="mech-vitals">
            <div><span>UAP</span><strong>{remaining}/{baseUap}</strong><small>current / base</small></div>
            <div><span>Range</span><strong>R{unit.spatial?.activeRange ?? baseRange}</strong><small>base R{baseRange}{nextRange !== (unit.spatial?.activeRange ?? baseRange) ? ` · next R${nextRange}` : ""}</small></div>
            <div><span>Calibration</span><strong>{percent(unit.emissionCalibration)}</strong><small>next {plannedCalibration === null ? "baseline" : percent(plannedCalibration)}</small></div>
            <div><span>Output</span><strong>{view.rules.chassis[unit.chassis].throughput}</strong><small>artifacts / emit</small></div>
          </div>
          <div className="mech-field-state"><span>Cell {position.x},{position.y} · Hold {unit.uap?.passiveSettleStreak ?? 0}/3</span><span>{artifactsInRange} artifacts in range</span></div>
          <section className="mech-signature"><div><span>SIGNATURE SYSTEM</span><b>{profile.cost}</b></div><strong>{profile.signature}</strong><p>{profile.effect}</p><small>Seize cost: {view.rules.chassis[unit.chassis].seizeCost} attention</small></section>
        </article>;
      })}
    </div>
    {selectedUnit && view.projection.phase === "movement" && <div className="mech-orders">
      <div className="mech-orders-heading"><span>{unitCode(selectedUnit.chassis)} ORDERS</span><b>{selectedRemaining}/{selectedUnit.uap?.budget ?? 0} UAP · Hold {selectedUnit.uap?.passiveSettleStreak ?? 0}/3</b></div>
      <div className="planned-actions"><span>Queued orders</span><strong>{selectedActions.length ? selectedActions.map((action) => action.kind).join(" → ") : "deliberate hold"}</strong></div>
      {selectedUnit.chassis === "scout" && <button className={moveMode === "active-recon" ? "active" : ""} disabled={selectedRemaining < 3} onClick={() => setMoveMode(moveMode === "active-recon" ? "step" : "active-recon")}>Active Recon · choose adjacent cell · 3 UAP</button>}
      <button className={moveMode === "step" ? "active" : ""} disabled={selectedRemaining < 1} onClick={() => setMoveMode("step")}>Move · choose adjacent cell · 1 UAP</button>
      {selectedUnit.chassis === "line" && <button disabled={selectedRemaining < 1} onClick={() => appendAction(selectedUnit, { kind: "step-up" })}>Step-Up · next calibration 85% · 1 UAP</button>}
      {selectedUnit.chassis === "siege" && <button disabled={selectedRemaining < 1} onClick={() => appendAction(selectedUnit, { kind: "command-uplink" })}>Command Uplink · next +1 attention · 1 UAP</button>}
      <div className="split-actions"><button disabled={selectedRemaining < 1 || selectedRange <= view.rules.spatial.ranges[selectedUnit.chassis].minimumRange} onClick={() => appendAction(selectedUnit, { kind: "range-shift", delta: -1 })}>Range −1</button><button disabled={selectedRemaining < 1 || selectedRange >= view.rules.spatial.ranges[selectedUnit.chassis].maximumRange} onClick={() => appendAction(selectedUnit, { kind: "range-shift", delta: 1 })}>Range +1</button></div>
      <button className="quiet" disabled={selectedActions.length === 0} onClick={() => clearPlan(selectedUnit.unitId)}>Clear plan</button>
    </div>}
  </aside>;
}

function SelectionPanel({ view, selection, plans, appendAction, submitCommand, busy }: {
  view: BattleCommandView;
  selection: Selection | null;
  plans: Record<string, AttentionUapAction[]>;
  appendAction: (unit: AttentionUnitState, action: AttentionUapAction) => void;
  submitCommand: (intent: Extract<BattleCommandSubmission, { phase: "command" }>["intent"]) => void;
  busy: boolean;
}) {
  const unit = selection?.kind === "unit" ? view.projection.units.find((candidate) => candidate.unitId === selection.id) : undefined;
  const artifact = selection?.kind === "artifact" ? view.projection.artifacts.find((candidate) => candidate.artifactId === selection.id) : undefined;
  if (!selection || unit) return null;
  if (artifact) {
    const own = artifact.ownerPlayerId === PLAYER;
    const friendlyUnits = view.projection.units.filter((candidate) => candidate.ownerPlayerId === PLAYER);
    const local = friendlyUnits.filter((candidate) => distance(candidate.position, artifact.position) <= view.rules.spatial.verificationReach);
    const scanned = artifact.supportScanUnitIds ?? [];
    const reachable = local.length > 0 || scanned.length > 0;
    const line = friendlyUnits.find((candidate) => candidate.chassis === "line");
    const source = view.projection.units.find((candidate) => candidate.unitId === artifact.sourceUnitId);
    const seizeCost = source ? view.rules.chassis[source.chassis].seizeCost : null;
    const lineActions = line ? plans[line.unitId] ?? [] : [];
    const linePosition = line ? plannedPosition(line, lineActions) : null;
    const canScan = line && linePosition && distance(linePosition, artifact.position) <= (line.spatial?.activeRange ?? 0) && lineActions.length < (line.uap?.budget ?? 0);
    const player = view.projection.players.find((candidate) => candidate.playerId === PLAYER)!;
    const verified = artifact.revealedSound !== null;
    const acceptOutcome = artifact.guarantee !== null ? "+1 progress at resolution if objective eligible" : artifact.revealedSound === true
      ? artifact.objectiveEligible ? "+1 progress at resolution" : "sound, but outside objective"
      : artifact.revealedSound === false ? "+1 drift at resolution" : "unknown truth: progress or drift";
    return <aside className="selection-panel">
      <span className={`battle-kicker ${own ? "friendly-text" : "hostile-text"}`}>{own ? "FRIENDLY ARTIFACT" : "HOSTILE ARTIFACT"}</span>
      <h2>{shortId(artifact.artifactId)}</h2>
      <div className="confidence-readout"><strong>{percent(artifact.reportedConfidence)}</strong><span>reported confidence—not known accuracy</span></div>
      <dl><dt>Cell</dt><dd>{artifact.position.x},{artifact.position.y}</dd><dt>Objective eligible</dt><dd>{artifact.objectiveEligible ? "yes" : "no"}</dd><dt>Truth</dt><dd>{artifact.revealedSound === null ? "hidden" : artifact.revealedSound ? "sound" : "unsound"}</dd><dt>Verification</dt><dd>{reachable ? local.length ? `local · ${local[0].chassis}` : "Support Scan" : "out of reach"}</dd><dt>Guarantee</dt><dd>{artifact.guarantee ?? "none"}</dd></dl>
      {own && view.projection.phase === "movement" && line && <button disabled={!canScan} onClick={() => appendAction(line, { kind: "support-scan", artifactId: artifact.artifactId })}>Queue Line Support Scan · 1 UAP</button>}
      {own && view.projection.phase === "command" && <div className="artifact-actions">
        <section className={`verification-explainer ${verified ? artifact.revealedSound ? "sound" : "unsound" : "hidden"}`}>
          <span>{verified ? "VERIFICATION COMPLETE" : `SPEND ${view.rules.verifyCost} ATTENTION`}</span>
          {verified
            ? <><strong>Truth revealed: {artifact.revealedSound ? "SOUND" : "UNSOUND"}</strong><p>Verification supplied information only. Choose Accept or Reject to resolve the decision.</p></>
            : <><strong>Reveal actual truth before deciding</strong><div className="verification-flow"><b>{percent(artifact.reportedConfidence)} signal</b><i>→</i><b>sound / unsound</b><i>→</i><b>your decision</b></div><p>Attention buys certainty. It does not accept, reject, score, or add drift by itself.</p></>}
        </section>
        {!verified && <button className="verify-action" disabled={!reachable || player.attention < view.rules.verifyCost || busy} onClick={() => submitCommand({ kind: "verify", playerId: PLAYER, artifactId: artifact.artifactId })}>
          <strong>Reveal truth</strong><small>{!reachable ? "Requires a unit within 1 cell or Support Scan" : player.attention < view.rules.verifyCost ? "Not enough attention" : `${player.attention} → ${player.attention - view.rules.verifyCost} attention · artifact remains pending`}</small>
        </button>}
        <button disabled={busy} onClick={() => submitCommand({ kind: "accept", playerId: PLAYER, artifactId: artifact.artifactId })}><strong>Accept</strong><small>{acceptOutcome}</small></button>
        <button disabled={busy} onClick={() => submitCommand({ kind: "reject", playerId: PLAYER, artifactId: artifact.artifactId })}><strong>Reject</strong><small>discard · 0 progress · 0 drift</small></button>
        <button disabled={busy || seizeCost === null || player.attention < seizeCost} onClick={() => submitCommand({ kind: "seize", playerId: PLAYER, artifactId: artifact.artifactId })}><strong>Seize</strong><small>{seizeCost === null ? "source unavailable" : `${seizeCost} attention · objective progress if eligible`}</small></button>
        <button disabled={busy || !view.legal.abilities.perfectFocus.ready || artifact.guarantee !== null} onClick={() => submitCommand({ kind: "perfect-focus", playerId: PLAYER, artifactId: artifact.artifactId })}><strong>Perfect Focus</strong><small>{view.legal.abilities.perfectFocus.ready ? "guarantee sound · does not resolve" : view.legal.abilities.perfectFocus.reason ?? "unavailable"}</small></button>
      </div>}
      {!own && <p className="panel-note">Enemy artifact truth remains hidden. Artillery can still affect it.</p>}
    </aside>;
  }
  return <aside className="selection-panel"><span className="battle-kicker">BATTLE CELL</span><h2>{selection.kind === "cell" ? `${selection.at.x},${selection.at.y}` : "Cell"}</h2><p>Clear terrain. Select a phase action to preview its interaction with this coordinate.</p></aside>;
}

function PhaseDock({ view, target, setTarget, shell, setShell, plans, submit, busy }: {
  view: BattleCommandView;
  target: AttentionCoordinate | null;
  setTarget: (value: AttentionCoordinate | null) => void;
  shell: AttentionArtilleryShell | null;
  setShell: (shell: AttentionArtilleryShell | null) => void;
  plans: Record<string, AttentionUapAction[]>;
  submit: (submission: BattleCommandSubmission, confirm?: string) => void;
  busy: boolean;
}) {
  const projection = view.projection;
  const self = projection.players.find((player) => player.playerId === PLAYER)!;
  if (projection.status === "complete") {
    const opponent = projection.players.find((player) => player.playerId !== PLAYER)!;
    const won = projection.winnerPlayerId === PLAYER;
    const lost = projection.winnerPlayerId === opponent.playerId;
    const roundLimit = projection.terminalReason === "round-limit";
    const headline = roundLimit
      ? won ? "Round-limit tiebreak won" : lost ? "Round-limit tiebreak lost" : "Round-limit draw"
      : won ? "Threshold victory secured" : lost ? "Threshold Doctrine prevailed" : "Threshold draw";
    const detail = roundLimit
      ? `Neither side reached ${view.rules.objectiveTarget} progress or ${view.rules.driftLimit} drift. Ranked by progress → lower drift → attention.`
      : projection.terminalReason === "objective" ? `Objective threshold reached: ${view.rules.objectiveTarget} progress.`
        : projection.terminalReason === "drift" ? `Drift threshold reached: ${view.rules.driftLimit} accepted-unsound artifacts.`
          : "Both sides crossed a terminal threshold in the same resolution.";
    return <div className="phase-dock terminal"><span className="battle-kicker">OPERATION COMPLETE · {projection.terminalReason}</span><strong>{headline}</strong><span>{detail}</span><small>You {self.progress} progress / {self.drift} drift · Doctrine {opponent.progress} progress / {opponent.drift} drift</small></div>;
  }
  if (projection.phase === "artillery") {
    const inZone = <T extends { position: AttentionCoordinate }>(items: T[]) => target ? items.filter((item) => distance(item.position, target) <= 1) : [];
    const artifacts = inZone(projection.artifacts.filter((artifact) => artifact.resolution === "pending"));
    const units = inZone(projection.units);
    const blockers = target ? (projection.chaffs ?? []).filter((zone) => zone.ownerPlayerId !== PLAYER && distance(zone.center, target) <= 1) : [];
    return <div className="phase-dock artillery-dock">
      <div><span className="battle-kicker">ARTILLERY DECLARATION</span><strong>{target ? `Target ${target.x},${target.y}` : "Choose a shell, then a target cell"}</strong><small>Simultaneous with the opponent. Exact 3×3 footprint.</small></div>
      <div className="shell-hand">{(["flare", "chaff", "he", "smoke"] as const).map((item) => <button key={item} disabled={(self.artillery?.hand[item] ?? 0) < 1 || busy} className={shell === item ? "active" : ""} onClick={() => setShell(item)}><span>{shellCopy[item].label}</span><b>{self.artillery?.hand[item] ?? 0}</b></button>)}</div>
      <div className="impact-preview"><span>PUBLIC IMPACT</span><strong>{shell && target ? shellCopy[shell].detail : "No impact selected"}</strong>{shell && target && <small>{artifacts.length} artifacts · {units.length} units in volume{blockers.length ? ` · BLOCKED by ${blockers.length} hostile Chaff screen` : ""}{shell === "he" ? ` · ${artifacts.length} independent 70% resolutions` : ""}</small>}</div>
      <div className="dock-actions"><button onClick={() => { setShell(null); setTarget(null); submit({ phase: "artillery", shell: null }); }} disabled={busy}>Pass</button><button className="battle-primary" disabled={!shell || !target || busy} onClick={() => shell && target && submit({ phase: "artillery", shell, center: target }, `Fire ${shellCopy[shell].label} at ${target.x},${target.y}?`)}>Confirm fire</button></div>
    </div>;
  }
  if (projection.phase === "movement") {
    const queued = Object.values(plans).reduce((sum, actions) => sum + actions.length, 0);
    const issues = validatePlans(view, plans);
    return <div className="phase-dock"><div><span className="battle-kicker">UNIT ACTION PLANNING</span><strong>{queued} actions queued</strong><small>Select friendly units and build simultaneous plans. Unplanned units deliberately hold.</small>{issues.length > 0 && <div className="plan-issues" role="alert"><b>Plan needs attention</b>{issues.slice(0, 3).map((issue) => <span key={issue}>{issue}</span>)}</div>}</div><div className="dock-actions"><button className="battle-primary" disabled={busy || issues.length > 0} onClick={() => submit({ phase: "movement", plans: Object.entries(plans).map(([unitId, actions]) => ({ unitId, actions })) })}>{issues.length > 0 ? "Fix plan" : "Resolve unit plans"}</button></div></div>;
  }
  if (projection.phase === "capacity") return <div className="phase-dock capacity-dock"><CapacityTrack view={view} /><div><span className="battle-kicker">CAPACITY CLAIM</span><strong>{view.legal.capacity.available ? `${view.legal.capacity.cost} attention → +${view.legal.capacity.award} recurring attention` : "Track complete"}</strong><small>The opponent may claim simultaneously. A claim spends attention now and compounds every future round.</small></div><div className="dock-actions"><button disabled={busy} onClick={() => submit({ phase: "capacity", claim: false })}>Pass</button><button className="battle-primary" disabled={!view.legal.capacity.affordable || busy} onClick={() => submit({ phase: "capacity", claim: true })}>Claim capacity</button></div></div>;
  return <div className="phase-dock"><div><span className="battle-kicker">ARTIFACT COMMAND</span><strong>{view.legal.commandArtifactIds.length} unresolved artifacts · {self.attention} attention</strong><small>Select artifacts to verify or resolve. Anything left pending is auto-accepted.</small></div><div className="dock-actions"><button disabled={busy || !view.legal.abilities.overclock.ready} onClick={() => submit({ phase: "command", intent: { kind: "overclock", playerId: PLAYER } })}>Overclock · {view.legal.abilities.overclock.ready ? "−1 / Seize" : view.legal.abilities.overclock.reason}</button><button className="battle-primary" disabled={busy} onClick={() => submit({ phase: "command", intent: { kind: "end-command", playerId: PLAYER } }, "End command and auto-accept every unresolved artifact?")}>End command</button></div></div>;
}

function FullRules({ view, onClose }: { view: BattleCommandView; onClose: () => void }) {
  return <div className="rules-overlay" role="dialog" aria-modal="true" aria-label="Complete rules reference"><div className="rules-drawer"><div className="drawer-heading"><div><span className="battle-kicker">PUBLIC RULES · V3 EXPERIMENTAL</span><h2>Battle command reference</h2></div><button onClick={onClose}>Close</button></div>
    <section><h3>Outcome</h3><p>Reach {view.rules.objectiveTarget} objective progress before accepted-unsound drift reaches {view.rules.driftLimit}. Pending artifact count is not progress. Drift wins simultaneous threshold crossings. If neither side reaches a threshold by round {view.rules.roundLimit}, the tiebreak order is higher progress, then lower drift, then remaining attention; an exact tie is a draw.</p></section>
    <section><h3>Artifacts</h3><p>Underlying work is sound at a global {percent(view.rules.baseSoundness)} rate. Reported confidence is a signal shaped by source calibration, not known truth. Verification costs {view.rules.verifyCost} attention and needs a unit within one cell or a queued Line Support Scan. It reveals whether the artifact is sound or unsound but does not resolve it; you must still Accept or Reject. Accepted objective-eligible sound work adds progress, accepted unsound work adds drift, and rejected work adds neither.</p></section>
    <section><h3>Unit actions</h3><ul><li>Scout · {view.rules.uap.budgets.scout} UAP · range {view.rules.spatial.ranges.scout.defaultRange} · emits {view.rules.chassis.scout.throughput}; Active Recon queues 85% calibration.</li><li>Line · {view.rules.uap.budgets.line} UAP · range {view.rules.spatial.ranges.line.defaultRange} · emits {view.rules.chassis.line.throughput}; Step-Up queues 85%; Support Scan creates a remote verification path.</li><li>Siege · {view.rules.uap.budgets.siege} UAP · range {view.rules.spatial.ranges.siege.defaultRange} · emits {view.rules.chassis.siege.throughput}; Command Uplink queues +1 attention and 20% calibration.</li><li>Range Shift costs 1 UAP and applies next round, bounded from 1 to 5. Scout holds settle calibration through 40% → 65% → 85%.</li></ul></section>
    <section><h3>Capacity and abilities</h3><p>Capacity slots are exclusive and permanently add attention. Claim rank unlocks Perfect Focus at rank {view.rules.abilities.perfectFocus.unlockRank} and Overclock at rank {view.rules.abilities.overclock.unlockRank}. Perfect Focus guarantees one artifact and has a cooldown. Overclock discounts every Seize by {view.rules.abilities.overclock.seizeDiscount} attention for the current command phase. Macro Flare is replaced by artillery in v3.</p></section>
    <section><h3>Artillery</h3><ul>{(["flare", "chaff", "he", "smoke"] as const).map((shell) => <li key={shell}><strong>{shellCopy[shell].label}:</strong> {shellCopy[shell].detail}</li>)}</ul><p>This full four-shell hand is an explicit UI experiment, not a balance promotion.</p></section>
  </div></div>;
}

function EventTicker({ view }: { view: BattleCommandView }) {
  const events = view.events.filter((event) => !event.eventType.startsWith("attention.phase.")).slice(-5).reverse();
  const labels: Record<string, string> = {
    "attention.artifacts.emitted": "Artifacts emitted",
    "attention.artillery.shell.fired": "Shell fired",
    "attention.artillery.shell.blocked": "Shell blocked",
    "attention.uap.plan.resolved": "Unit plan resolved",
    "attention.uap.plan.rejected": "Unit plan rejected",
    "attention.artifact.verified": "Truth verified",
    "attention.artifact.accepted": "Artifact accepted",
    "attention.artifact.rejected": "Artifact rejected",
    "attention.artifact.seized": "Artifact seized",
    "attention.capacity.claimed": "Capacity claimed",
    "attention.round.resolved": "Round resolved"
  };
  const detail = (event: EventEnvelope) => {
    const data = event.data as Record<string, unknown>;
    if (event.eventType === "attention.round.resolved") return `Progress/drift updated · round ${String(data.completedRound ?? "")}`;
    if (event.eventType === "attention.artifacts.emitted") return `${String(data.count ?? 0)} artifacts · ${percent(Number(data.calibration ?? 0))} calibration`;
    if (event.eventType === "attention.uap.plan.resolved") return `${String(data.spent ?? 0)} UAP · ${String(data.moveSteps ?? 0)} move`;
    if (event.eventType === "attention.uap.plan.rejected") return `Rejected · ${String(data.reason ?? "invalid plan")}`;
    if (event.eventType === "attention.artifact.verified") return `−${String(data.cost ?? view.rules.verifyCost)} attention · truth revealed`;
    if (event.eventType === "attention.artifact.seized") return `−${String(data.cost ?? "?")} attention · pending resolution`;
    if (event.eventType === "attention.capacity.claimed") return `−${String(data.attentionPaid ?? "?")} attention · +${String(data.capacityAward ?? "?")} recurring`;
    if (event.eventType === "attention.artillery.shell.blocked") return `${String(data.shell ?? "shell")} neutralized by Chaff`;
    return event.actorId ?? "system";
  };
  return <section className="event-ticker" aria-live="polite"><span>RECENT RESOLUTION</span>{events.length ? events.map((event) => <div key={event.eventId}><b>{labels[event.eventType] ?? event.eventType.replaceAll("attention.", "").replaceAll(".", " / ")}</b><small>{detail(event)}</small></div>) : <p>Awaiting declaration.</p>}</section>;
}

function CapacityTrack({ view }: { view: BattleCommandView }) {
  const claims = new Map(view.projection.capacityTrack.claims.map((claim) => [claim.slotIndex, claim]));
  return <section className="capacity-track" aria-label="Shared capacity track">
    <div className="capacity-track-heading"><span>SHARED CAPACITY TRACK</span><small>{view.projection.capacityTrack.nextSlot >= view.rules.capacitySlots.length ? "Complete" : `Next claim · rank ${view.rules.capacitySlots[view.projection.capacityTrack.nextSlot].rank}`}</small></div>
    <div className="capacity-slots">
      {view.rules.capacitySlots.map((slot, index) => {
        const claim = claims.get(index);
        const current = index === view.projection.capacityTrack.nextSlot;
        return <div key={slot.rank} className={`capacity-slot ${claim ? "claimed" : current ? "current" : "locked"}`}><b>R{slot.rank}</b><strong>+{slot.capacityAward}</strong><small>{claim ? `${claim.playerId} · paid ${claim.attentionPaid}` : `${slot.cost} attention`}</small></div>;
      })}
    </div>
  </section>;
}

export function BattleCommandApp() {
  const [view, setView] = useState<BattleCommandView | null>(null);
  const [briefing, setBriefing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [plans, setPlans] = useState<Record<string, AttentionUapAction[]>>({});
  const [moveMode, setMoveMode] = useState<MoveMode>("step");
  const [shell, setShell] = useState<AttentionArtilleryShell | null>(null);
  const [artilleryTarget, setArtilleryTarget] = useState<AttentionCoordinate | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [artifactOrder, setArtifactOrder] = useState<ArtifactOrder>("high");
  const [radarEnabled, setRadarEnabled] = useState(false);

  useEffect(() => {
    const linkedMatchId = new URLSearchParams(window.location.search).get("battle");
    const matchId = linkedMatchId ?? localStorage.getItem("context-landscape.battleCommandMatch");
    if (!matchId) return;
    setBusy(true);
    void requestJson<BattleCommandView>(`/api/battle-command/matches/${matchId}`)
      .then((payload) => {
        setView(payload);
        setBriefing(false);
        localStorage.setItem("context-landscape.battleCommandMatch", matchId);
      })
      .catch(() => {
        if (!linkedMatchId) localStorage.removeItem("context-landscape.battleCommandMatch");
      })
      .finally(() => setBusy(false));
  }, []);

  async function start() {
    setBusy(true); setError("");
    try {
      const payload = await requestJson<BattleCommandView>("/api/battle-command/matches", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      setView(payload); setBriefing(false); setSelection(null);
      localStorage.setItem("context-landscape.battleCommandMatch", payload.projection.matchId);
      localStorage.setItem("context-landscape.battleCommandBriefingV1", "seen");
    } catch (caught) { setError(String(caught)); } finally { setBusy(false); }
  }

  async function submit(submission: BattleCommandSubmission, confirmation?: string) {
    if (!view || (confirmation && !window.confirm(confirmation))) return;
    setBusy(true); setError("");
    try {
      const payload = await requestJson<BattleCommandView>(`/api/battle-command/matches/${view.projection.matchId}/actions`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ revision: view.revision, submission })
      });
      setView(payload); setPlans({}); setMoveMode("step"); setShell(null); setArtilleryTarget(null);
      if (payload.projection.phase !== "command") setSelection(null);
    } catch (caught) {
      const message = String(caught);
      setError(message);
      if (message.includes("revision_conflict")) {
        const fresh = await requestJson<BattleCommandView>(`/api/battle-command/matches/${view.projection.matchId}`);
        setView(fresh);
      }
    } finally { setBusy(false); }
  }

  const selectedUnit = selection?.kind === "unit" ? view?.projection.units.find((unit) => unit.unitId === selection.id) : undefined;
  function appendAction(unit: AttentionUnitState, action: AttentionUapAction) {
    setPlans((current) => {
      const actions = current[unit.unitId] ?? [];
      if (actions.length >= (unit.uap?.budget ?? 0)) return current;
      return { ...current, [unit.unitId]: [...actions, action] };
    });
  }
  function clearPlan(unitId: string) {
    setPlans((current) => {
      const next = { ...current };
      delete next[unitId];
      return next;
    });
  }
  function handleCell(at: AttentionCoordinate) {
    if (!view) return;
    if (view.projection.phase === "artillery" && shell) { setArtilleryTarget(at); setSelection({ kind: "cell", at }); return; }
    if (view.projection.phase === "movement" && selectedUnit?.ownerPlayerId === PLAYER) {
      const actions = plans[selectedUnit.unitId] ?? [];
      const from = plannedPosition(selectedUnit, actions);
      if (distance(from, at) !== 1) { setSelection({ kind: "cell", at }); return; }
      if (moveMode === "active-recon" && selectedUnit.chassis === "scout" && actions.length === 0) {
        setPlans((current) => ({ ...current, [selectedUnit.unitId]: [{ kind: "move", destination: at }, { kind: "turbo-charge" }, { kind: "step-up" }] }));
        setMoveMode("step"); return;
      }
      appendAction(selectedUnit, { kind: "move", destination: at }); return;
    }
    setSelection({ kind: "cell", at });
  }

  if (briefing || !view) return <><Briefing onStart={() => void start()} busy={busy} />{error && <div className="battle-toast error">{error}</div>}</>;
  return <main className="battle-shell">
    <header className="battle-header"><div><p className="battle-kicker">CONTEXT LANDSCAPE · BATTLE COMMAND</p><h1>{view.rules.scenarioLabel}</h1></div><nav className="battle-nav"><a href="/?view=legacy">Research scenarios</a><a href="/?view=commander">Commander projection</a><a href="/?view=atlas">Evidence atlas</a><button onClick={() => setBriefing(true)}>Briefing</button><button onClick={() => { localStorage.removeItem("context-landscape.battleCommandMatch"); setView(null); setBriefing(true); }}>New operation</button></nav></header>
    {error && <div className="battle-toast error">{error}</div>}
    <StatusStrip view={view} />
    <section className="battle-layout">
      <TurnWorkflow view={view} onOpen={() => setRulesOpen(true)} />
      <div className="board-column"><div className="board-toolbar"><div><strong>Operational field</strong><span>Chebyshev distance · exact public projection</span></div><div><span className="base-rate">BASE SOUNDNESS <b>{percent(view.rules.baseSoundness)}</b></span><span>Front {view.legal.fronts.current.center.x},{view.legal.fronts.current.center.y} · next {view.legal.fronts.next ? `${view.legal.fronts.next.round}: ${view.legal.fronts.next.center.x},${view.legal.fronts.next.center.y}` : "none"}</span></div></div>
        <ArtifactTray view={view} selection={selection} onSelect={setSelection} order={artifactOrder} onOrder={() => setArtifactOrder((current) => current === "high" ? "low" : "high")} radarEnabled={radarEnabled} onRadar={() => setRadarEnabled((current) => !current)} />
        <OverlayKey view={view} selectedUnit={selectedUnit} radarEnabled={radarEnabled} artilleryTarget={artilleryTarget} />
        <div className="board-stage">
          <TacticalBoard view={view} selection={selection} onSelection={setSelection} artilleryTarget={artilleryTarget} onCell={handleCell} selectedUnit={selectedUnit} plans={plans} radarEnabled={radarEnabled} />
          <EnemyArtifactRail view={view} selection={selection} onSelect={setSelection} order={artifactOrder} />
        </div>
        <EventTicker view={view} />
      </div>
      <div className="right-command-column">
        <MechRoster view={view} selection={selection} onSelection={setSelection} plans={plans} moveMode={moveMode} setMoveMode={setMoveMode} appendAction={appendAction} clearPlan={clearPlan} />
        <SelectionPanel view={view} selection={selection} plans={plans} appendAction={appendAction} submitCommand={(intent) => void submit({ phase: "command", intent })} busy={busy} />
      </div>
    </section>
    <PhaseDock view={view} target={artilleryTarget} setTarget={setArtilleryTarget} shell={shell} setShell={setShell} plans={plans} submit={(submission, confirmation) => void submit(submission, confirmation)} busy={busy} />
    {rulesOpen && <FullRules view={view} onClose={() => setRulesOpen(false)} />}
  </main>;
}
