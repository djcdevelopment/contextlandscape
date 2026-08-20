import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode
} from "react";
import {
  ATTENTION_V4_COMPOSITION_MODULES,
  type AttentionV4CommanderProfile,
  type AttentionV4CommandIntent,
  type AttentionV4Coordinate,
  type AttentionV4KineticAction,
  type AttentionV4ProjectedArtifact,
  type AttentionV4Shell,
  type AttentionV4UnitState,
  type ArtCatalogEntry,
  type ArtCatalogPage,
  type AuthSessionView,
  type BattleExperience,
  type BattleCommandV3Submission,
  type BattleCommandV3View,
  type FriendBattleCommandView
} from "@landscape/contracts";
import { gameArt, type GameArtSubjectId } from "./art.js";
import { PerspectiveBoard } from "./PerspectiveBoard.js";
import { appHref } from "../navigation.js";
import "./battle-command.css";

const PLAYER = "alpha";
type Selection = { kind: "unit"; id: string } | { kind: "artifact"; id: string } | { kind: "cell"; at: AttentionV4Coordinate };
type PlanMode = "move";
type Allocation = { volume: number; densityPct: number };
type Chassis = AttentionV4UnitState["chassis"];
type CompositionModule = AttentionV4CommanderProfile["compositionModule"];
type UiScale = "compact" | "standard" | "large" | "xlarge";
type ResolutionPresentation = {
  before: BattleCommandV3View;
  after: BattleCommandV3View;
  recap: NonNullable<BattleCommandV3View["recaps"]["resolution"]>;
};
type IngestResult = "stale" | "equal" | "advanced";

function resolutionSurface({ before, after, recap }: ResolutionPresentation): BattleCommandV3View {
  const resolvedArtifactIds = new Set([
    ...recap.resolutions.map((item) => item.artifactId),
    ...recap.detonations.map((item) => item.artifactId)
  ]);
  const frozenUnitIds = new Set(recap.detonations.flatMap((item) => item.frozenUnitIds));
  const players = new Map(recap.players.map((player) => [player.playerId, player]));
  const terminal = after.projection.phase === "terminal";
  return {
    ...before,
    revision: after.revision,
    recaps: { ...before.recaps, resolution: recap },
    projection: {
      ...before.projection,
      eventSequence: after.projection.eventSequence,
      players: before.projection.players.map((player) => ({ ...player, ...players.get(player.playerId) })) as typeof before.projection.players,
      units: before.projection.units.map((unit) => frozenUnitIds.has(unit.unitId)
        ? { ...unit, uap: { ...unit.uap, nextFreezeSources: [...new Set([...unit.uap.nextFreezeSources, "drift-detonation" as const])] } }
        : unit),
      artifacts: before.projection.artifacts.filter((artifact) => !resolvedArtifactIds.has(artifact.artifactId)),
      lastResolutionRecap: recap,
      status: terminal ? after.projection.status : before.projection.status,
      winnerPlayerId: terminal ? after.projection.winnerPlayerId : before.projection.winnerPlayerId,
      terminalReason: terminal ? after.projection.terminalReason : before.projection.terminalReason
    }
  };
}

const UI_SCALE_ORDER: UiScale[] = ["compact", "standard", "large", "xlarge"];
const UI_SCALE_PERCENT: Record<UiScale, number> = { compact: 90, standard: 100, large: 115, xlarge: 130 };
const UI_SCALE_FACTOR: Record<UiScale, number> = { compact: .9, standard: 1, large: 1.15, xlarge: 1.3 };

function initialUiScale(): UiScale {
  const saved = localStorage.getItem("context-landscape.uiScale");
  if (UI_SCALE_ORDER.includes(saved as UiScale)) return saved as UiScale;
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 2000px)").matches ? "large" : "standard";
}

function InterfaceScale({ value, onChange }: { value: UiScale; onChange: (value: UiScale) => void }) {
  const index = UI_SCALE_ORDER.indexOf(value);
  return <div className="battle-ui-scale" role="group" aria-label="Interface scale">
    <button type="button" aria-label="Decrease interface scale" disabled={index === 0} onClick={() => onChange(UI_SCALE_ORDER[index - 1])}>A-</button>
    <span role="status" aria-live="polite" aria-label={`Interface scale ${UI_SCALE_PERCENT[value]} percent`}>{UI_SCALE_PERCENT[value]}%</span>
    <button type="button" aria-label="Increase interface scale" disabled={index === UI_SCALE_ORDER.length - 1} onClick={() => onChange(UI_SCALE_ORDER[index + 1])}>A+</button>
  </div>;
}

const fleetCopy: Record<CompositionModule, string> = {
  "line-four-scout": "1 Line + 4 Scouts",
  "two-line-two-scout": "2 Line + 2 Scouts",
  "three-line": "3 Line",
  "heavy-three-scout": "1 Heavy + 3 Scouts",
  "heavy-line-scout": "1 Heavy + 1 Line + 1 Scout"
};

const shellCopy: Record<AttentionV4Shell, { label: string; detail: string }> = {
  flare: { label: "Flare", detail: "Doubles output in this 3×3 field for this and the next Command window." },
  smoke: { label: "Smoke", detail: "Suppresses Batteries and resets caught calibration, scans, and Uplinks for two windows." },
  emp: { label: "EMP", detail: "Caught units receive zero UAP in their next Kinetic phase; generation remains available." },
  he: { label: "HE", detail: "Immediately resolves every unverified pending artifact in the field using its existing result." },
  chaff: { label: "Chaff", detail: "Unblockable screen covering this and the next Artillery phase." }
};

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? `${response.status} ${response.statusText}`);
  return body as T;
}

function swapSeats(value: unknown): unknown {
  if (value === "alpha") return "bravo";
  if (value === "bravo") return "alpha";
  if (Array.isArray(value)) return value.map(swapSeats);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, swapSeats(nested)]));
  return value;
}

function normalizeFriend(payload: FriendBattleCommandView): FriendBattleCommandView {
  if (payload.experience.viewerSeat === "alpha") return payload;
  const normalized = swapSeats(payload) as FriendBattleCommandView;
  return {
    ...normalized,
    experience: {
      ...normalized.experience,
      fleets: { alpha: normalized.experience.fleets.bravo, bravo: normalized.experience.fleets.alpha },
      accountSeats: { alpha: normalized.experience.accountSeats.bravo, bravo: normalized.experience.accountSeats.alpha }
    }
  };
}

function distance(left: AttentionV4Coordinate, right: AttentionV4Coordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function unitCode(chassis: AttentionV4UnitState["chassis"]): string {
  return chassis === "scout" ? "SC" : chassis === "line" ? "LN" : "HV";
}

function displayChassis(chassis: AttentionV4UnitState["chassis"]): string {
  return chassis === "heavy" ? "Heavy" : `${chassis[0].toUpperCase()}${chassis.slice(1)}`;
}

function ArtFrame({ subject, className = "", children }: { subject: GameArtSubjectId; className?: string; children?: ReactNode }) {
  const asset = gameArt[subject];
  const style = asset.src ? {
    backgroundImage: `linear-gradient(90deg, rgba(5, 11, 17, .92), rgba(5, 11, 17, .2)), url(${asset.src})`,
    backgroundPosition: asset.focalPoint,
    backgroundSize: asset.crop
  } as CSSProperties : undefined;
  return <div className={`battle-art art-${subject} ${className}`} style={style} role={asset.src ? "img" : undefined} aria-label={asset.src ? asset.alt : undefined}>{children}</div>;
}

function Briefing({ onStart, busy, retired, playerFleet, opponentFleet, onPlayerFleet, onOpponentFleet, uiScale, onUiScale }: {
  onStart: () => void;
  busy: boolean;
  retired: boolean;
  playerFleet: CompositionModule;
  opponentFleet: CompositionModule;
  onPlayerFleet: (fleet: CompositionModule) => void;
  onOpponentFleet: (fleet: CompositionModule) => void;
  uiScale: UiScale;
  onUiScale: (value: UiScale) => void;
}) {
  return <main className="briefing-shell" data-ui-scale={uiScale}>
    <ArtFrame subject="battlefield-context-furnace" className="briefing-hero">
      <nav className="battle-nav" aria-label="Context Landscape views"><strong>CONTEXT LANDSCAPE</strong><span /><a href={appHref("view=legacy")}>Research scenarios</a><a href={appHref("view=commander")}>Commander projection</a><a href={appHref("view=atlas")}>Evidence atlas</a><InterfaceScale value={uiScale} onChange={onUiScale} /></nav>
      <div className="briefing-copy">
        <p className="battle-kicker">OPERATION 01 · ATTENTION-ECONOMY V4</p>
        <h1>The Contested Context</h1>
        <p>Build an exact weight-6 fleet. Allocate output deliberately, stabilize dangerous context, and use Batteries before four Drift ends the operation.</p>
        {retired && <div className="retired-operation" role="status"><strong>Previous operation retired</strong><span>Its snapshot used the former Battle Command rules and cannot be replayed under v4. Start a new operation below.</span></div>}
        <div className="fleet-selectors">
          <label>Your fleet<select value={playerFleet} onChange={(event) => onPlayerFleet(event.target.value as CompositionModule)}>{ATTENTION_V4_COMPOSITION_MODULES.map((fleet) => <option key={fleet} value={fleet}>{fleetCopy[fleet]}</option>)}</select></label>
          <label>Doctrine fleet<select value={opponentFleet} onChange={(event) => onOpponentFleet(event.target.value as CompositionModule)}>{ATTENTION_V4_COMPOSITION_MODULES.map((fleet) => <option key={fleet} value={fleet}>{fleetCopy[fleet]}</option>)}</select></label>
        </div>
        <button className="battle-primary briefing-start" disabled={busy} onClick={onStart}>{busy ? "Opening command link…" : retired ? "Start v4 operation" : "Enter battle command"}</button>
      </div>
    </ArtFrame>
    <section className="briefing-grid">
      <article><span>WIN</span><strong>12 objective Progress</strong><p>Accept sound work or Seize it directly. Terminal effects resolve bilaterally before the winner is chosen.</p></article>
      <article><span>LOSE</span><strong>4 Drift</strong><p>Unsound commitments add one. An expired or over-taxed artifact detonates for an unavoidable two.</p></article>
      <article><span>GENERATE</span><strong>Reactor × density</strong><p>Volume × density cannot exceed the reactor rating. Calibration multiplies density before confidence is formed.</p></article>
      <article><span>DISRUPT</span><strong>Five-card public armory</strong><p>Flare, Smoke, EMP, HE, and Chaff use cooldowns, seeded reloads, and one-salvo counterfire.</p></article>
    </section>
    <section className="briefing-roster">
      {(["scout", "line", "heavy"] as const).map((chassis) => <ArtFrame key={chassis} subject={`mech-${chassis === "heavy" ? "siege" : chassis}` as GameArtSubjectId}>
        <span>{chassis === "scout" ? "3" : chassis === "line" ? "2" : "1"} BASE UAP</span>
        <strong>{displayChassis(chassis)}</strong>
        <small>{chassis === "scout" ? "Spend up to 2 UAP to Condense: fewer artifacts, much higher quality" : chassis === "line" ? "Step-Up and reserve Support Scans" : "Queue one next-Register Attention Uplink"}</small>
      </ArtFrame>)}
      <div className="briefing-doctrine"><span>OPPOSITION</span><strong>Threshold Doctrine</strong><p>A deterministic commander compiled against the same resolver. It receives no hidden projection advantage.</p></div>
    </section>
  </main>;
}

const stages = ["register", "kinetic", "artillery", "command", "resolution"] as const;
type Stage = typeof stages[number];
const stageCopy: Record<Stage, { label: string; detail: string }> = {
  register: { label: "Register", detail: "Attention, Battery assistance, paralysis, age, cooldown, and reload state snapshot automatically." },
  kinetic: { label: "Kinetic", detail: "Both fleets submit complete ordered UAP plans; final occupancy and local traffic resolve simultaneously." },
  artillery: { label: "Artillery", detail: "Choose one ordered shell card or Pass. Chaff resolves before every other shell." },
  command: { label: "Command", detail: "Capacity opens the stage, then commanders alternate one Emit, Hold, triage, or ability intent." },
  resolution: { label: "Resolution", detail: "Committed work and Drift Detonations apply atomically before terminal evaluation." }
};

function currentStage(view: BattleCommandV3View): Stage {
  if (view.projection.phase === "kinetic") return "kinetic";
  if (view.projection.phase === "artillery") return "artillery";
  if (view.projection.phase === "capacity" || view.projection.phase === "command") return "command";
  return "resolution";
}

function kineticPlanComplete(actions: readonly AttentionV4KineticAction[], effectiveUap: number): boolean {
  return actions.length === 0 || actions.some((action) => action.kind === "condense-output") || actions.length >= effectiveUap;
}

function unitPlanCode(unit: AttentionV4UnitState): string {
  return `${unitCode(unit.chassis)}${unit.unitId.split("-").at(-1) ?? ""}`;
}

function kineticActionLabel(action: AttentionV4KineticAction): string {
  if (action.kind === "move") return `Move to ${action.destination.x},${action.destination.y}`;
  if (action.kind === "condense-output") return "Condense output";
  if (action.kind === "step-up") return "Step-Up";
  if (action.kind === "command-uplink") return "Command uplink";
  if (action.kind === "support-scan") return `Scan ${action.scoutUnitId.split(":").at(-1)}`;
  return action.delta < 0 ? "Range down" : "Range up";
}

function KineticActionButton({ label, icon, stagedCount = 0, active = false, disabled, onClick }: {
  label: string;
  icon: string;
  stagedCount?: number;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const accessibleLabel = stagedCount > 0 ? `${label}, staged ${stagedCount} ${stagedCount === 1 ? "time" : "times"}` : label;
  return <button type="button" aria-label={accessibleLabel} title={accessibleLabel} disabled={disabled} className={`kinetic-action ${active ? "active" : ""} ${stagedCount ? "is-staged" : ""}`} onClick={onClick}>
    <span className="kinetic-action-icon" aria-hidden="true">{icon}</span>
    <span className="kinetic-action-label">{label}</span>
    <span className="kinetic-action-beacon" aria-hidden="true">{stagedCount || ""}</span>
  </button>;
}

function recapCopy(view: BattleCommandV3View, active: Stage): { label: string; detail: string; risk?: boolean } {
  if (active === "kinetic") return {
    label: "REGISTER RECAP",
    detail: `${view.recaps.register.uap.filter((item) => item.batteryBonus).length} assisted · ${view.recaps.register.uap.filter((item) => item.frozen).length} frozen · ${view.recaps.register.reloads.reduce((sum, item) => sum + item.cardIds.length, 0)} cards reloaded`
  };
  if (view.recaps.resolution) return {
    label: active === "resolution" ? "RESOLUTION RECAP" : "LAST RESOLUTION",
    detail: `${view.recaps.resolution.resolutions.length} committed · ${view.recaps.resolution.detonations.length} detonated`,
    risk: view.recaps.resolution.detonations.length > 0
  };
  return {
    label: "REGISTER RECAP",
    detail: `${view.recaps.register.uap.filter((item) => item.batteryBonus).length} assisted · ${view.recaps.register.uap.filter((item) => item.frozen).length} frozen · ${view.recaps.register.reloads.reduce((sum, item) => sum + item.cardIds.length, 0)} cards reloaded`
  };
}

function PhaseStepper({ view, active }: { view: BattleCommandV3View; active: Stage }) {
  const index = stages.indexOf(active);
  const recap = recapCopy(view, active);
  const [openStage, setOpenStage] = useState<Stage | null>(null);
  return <nav className="phase-stepper" aria-label="Five-stage phase stepper">
    <ol aria-label="Five-stage phase stepper">{stages.map((stage, stageIndex) => {
      const complete = stageIndex < index || (stage === "register" && active !== "register");
      const current = stage === active;
      const tooltipId = `phase-tooltip-${stage}`;
      return <li key={stage} className={current ? "current" : complete ? "complete" : "upcoming"} aria-current={current ? "step" : undefined}>
        <span className="sr-only">{complete ? "Complete" : current ? "Current" : "Upcoming"}: </span>
        <span className="phase-chip-prefix" aria-hidden="true">{complete ? "✓" : stageIndex + 1}{current ? " ·" : ""}</span><strong>{stageCopy[stage].label}</strong>
        {current && <span className="phase-help" onMouseEnter={() => setOpenStage(stage)} onMouseLeave={() => setOpenStage(null)}><button type="button" className="phase-info" aria-label={`About ${stageCopy[stage].label} phase`} aria-describedby={tooltipId} aria-expanded={openStage === stage} onClick={() => setOpenStage((currentOpen) => currentOpen === stage ? null : stage)} onFocus={() => setOpenStage(stage)} onBlur={() => setOpenStage(null)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpenStage(null); } }}><span aria-hidden="true">ⓘ</span></button><span id={tooltipId} role="tooltip" className={`phase-tooltip ${openStage === stage ? "open" : ""}`}><b>{stageCopy[stage].label}</b><span>{stageCopy[stage].detail}</span><em className={recap.risk ? "risk" : ""}>{recap.label} · {recap.detail}</em></span></span>}
      </li>;
    })}</ol>
  </nav>;
}

function nextPhasePreview(view: BattleCommandV3View, active: Stage, resolution?: ResolutionPresentation): { label: string; detail: string } {
  if (active === "kinetic") return { label: "NEXT · ARTILLERY", detail: stageCopy.artillery.detail };
  if (active === "artillery") return { label: "NEXT · COMMAND", detail: stageCopy.command.detail };
  if (active === "command" && view.projection.phase === "capacity") return { label: "NEXT · COMMAND INTENTS", detail: "Capacity resolves, then commanders alternate one intent at a time." };
  if (active === "command") {
    const hazards = view.legal.projectedHazards.filter((item) => item.ownerPlayerId === PLAYER).length;
    return { label: "NEXT · RESOLUTION", detail: hazards ? `${hazards} friendly Drift Detonation${hazards === 1 ? "" : "s"} projected` : "No friendly detonations projected" };
  }
  if (resolution?.after.projection.phase === "terminal" || view.projection.phase === "terminal") return { label: "OPERATION COMPLETE", detail: "Review the final result and operation record." };
  const round = resolution?.after.projection.round ?? view.projection.round + 1;
  return { label: `NEXT · REGISTER · ROUND ${round}`, detail: stageCopy.register.detail };
}

function OperationRail({ view, active, resolution, onRules }: { view: BattleCommandV3View; active: Stage; resolution?: ResolutionPresentation; onRules: () => void }) {
  const projectedSelf = view.projection.players.find((player) => player.playerId === PLAYER)!;
  const resolutionSelf = resolution?.recap.players.find((player) => player.playerId === PLAYER);
  const self = resolutionSelf ? { ...projectedSelf, ...resolutionSelf } : projectedSelf;
  const batteries = view.projection.artifacts.filter((artifact) => artifact.ownerPlayerId === PLAYER && artifact.battery.active).length;
  const beforeSelf = resolution?.before.projection.players.find((player) => player.playerId === PLAYER);
  const round = resolution?.recap.completedRound ?? view.projection.round;
  const progressGain = beforeSelf ? self.progress - beforeSelf.progress : 0;
  const recap = recapCopy(view, active);
  const next = nextPhasePreview(view, active, resolution);
  return <aside className="operation-rail" aria-label="Operation rail">
    <section className="operation-state" aria-label="Operation state">
      <header><span>OPERATION STATE</span><div><strong>{round}<small>/{view.rules.roundLimit}</small></strong><b>{stageCopy[active].label}</b></div></header>
      <Status label="Progress" value={`${self.progress}/${view.rules.objectiveTarget}`} marker={progressGain > 0 ? " ▲" : undefined} meter={self.progress / view.rules.objectiveTarget} />
      <Status label="Drift" value={`${self.drift}/${view.rules.driftLimit}`} meter={self.drift / view.rules.driftLimit} danger />
      <div className="operation-pair"><Status label="Attention" value={String(self.attention)} /><Status label="Batteries" value={String(batteries)} /></div>
    </section>
    <section className="phase-guidance" aria-label="Current phase guidance"><span>NOW · {stageCopy[active].label.toUpperCase()}</span><p>{stageCopy[active].detail}</p><div className={recap.risk ? "risk" : ""}><strong>{recap.label}</strong><p>{recap.detail}</p></div><button type="button" onClick={onRules}>Full rules</button></section>
    <section className="operation-legend" aria-label="Battlefield legend"><span><i className="friendly" />friendly</span><span><i className="hostile" />hostile</span><span><i className="artifact" />artifact</span><span><i className="range" />range</span></section>
    <section className="next-phase-preview" aria-label="Next phase preview"><span>{next.label}</span><strong>{next.detail}</strong></section>
  </aside>;
}

function Status({ label, value, marker, meter, danger, accent }: { label: string; value: string; marker?: string; meter?: number; danger?: boolean; accent?: boolean }) {
  return <div className={`${danger ? "danger" : ""} ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}{marker && <span aria-hidden="true">{marker}</span>}</strong>{meter !== undefined && <i><b style={{ width: `${Math.min(100, meter * 100)}%` }} /></i>}</div>;
}

function Board({ view, selection, onSelect, selectedCardId, target, onCell, plannedPlans, readOnly }: {
  view: BattleCommandV3View;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  selectedCardId: string | null;
  target: AttentionV4Coordinate | null;
  onCell: (coordinate: AttentionV4Coordinate) => void;
  plannedPlans: Readonly<Record<string, readonly AttentionV4KineticAction[]>>;
  readOnly?: boolean;
}) {
  const [focus, setFocus] = useState<AttentionV4Coordinate>({ x: 0, y: 0 });
  const selectedUnit = selection?.kind === "unit" ? view.projection.units.find((unit) => unit.unitId === selection.id) : undefined;
  const friendlyFront = view.projection.activeFronts.find((front) => front.playerId === PLAYER)!;
  const hostileFront = view.projection.activeFronts.find((front) => front.playerId !== PLAYER)!;
  const selectedPreview = target && selectedCardId
    ? view.legal.artilleryPreviews.find((preview) => preview.cardId === selectedCardId && preview.center.x === target.x && preview.center.y === target.y)
    : undefined;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, coordinate: AttentionV4Coordinate) {
    const delta = event.key === "ArrowLeft" ? [-1, 0] : event.key === "ArrowRight" ? [1, 0] : event.key === "ArrowUp" ? [0, -1] : event.key === "ArrowDown" ? [0, 1] : null;
    if (!delta) return;
    event.preventDefault();
    const next = { x: Math.max(0, Math.min(9, coordinate.x + delta[0])), y: Math.max(0, Math.min(9, coordinate.y + delta[1])) };
    setFocus(next);
    document.querySelector<HTMLButtonElement>(`[data-battle-cell="${next.x},${next.y}"]`)?.focus();
  }

  return <div className="v4-board" role="grid" aria-label="10 by 10 operational field" aria-readonly={readOnly}>
    {Array.from({ length: 10 }, (_, y) => <div role="row" key={y}>
    {Array.from({ length: 10 }, (_, x) => {
      const index = y * 10 + x;
      const coordinate = { x, y };
      const units = view.projection.units.filter((unit) => unit.position.x === coordinate.x && unit.position.y === coordinate.y);
      const artifacts = view.projection.artifacts.filter((artifact) => artifact.position.x === coordinate.x && artifact.position.y === coordinate.y && artifact.resolution === "pending");
      const traffic = view.projection.traffic.find((cell) => cell.coordinate.x === coordinate.x && cell.coordinate.y === coordinate.y)?.actionCount ?? 0;
      const battery = view.projection.artifacts.some((artifact) => artifact.battery.active && !artifact.battery.suppressed && distance(artifact.position, coordinate) <= 1);
      const hazard = view.legal.projectedHazards.some((item) => {
        const artifact = view.projection.artifacts.find((candidate) => candidate.artifactId === item.artifactId);
        return artifact && distance(artifact.position, coordinate) <= 1;
      });
      const flare = view.projection.zones.some((zone) => zone.kind === "flare" && distance(zone.center, coordinate) <= 1);
      const smoke = view.projection.zones.some((zone) => zone.kind === "smoke" && distance(zone.center, coordinate) <= 1);
      const chaff = view.projection.zones.some((zone) => zone.kind === "chaff" && distance(zone.center, coordinate) <= 1);
      const inRange = selectedUnit ? distance(selectedUnit.position, coordinate) <= selectedUnit.activeRange : false;
      const inTarget = target ? distance(target, coordinate) <= 1 : false;
      const inFriendlyFront = distance(friendlyFront.center, coordinate) <= friendlyFront.radius;
      const inHostileFront = distance(hostileFront.center, coordinate) <= hostileFront.radius;
      const frozen = units.some((unit) => unit.uap.frozen || unit.uap.nextFreezeSources.length > 0);
      const plannedMarkers = Object.entries(plannedPlans).flatMap(([unitId, actions]) => actions.flatMap((action, actionIndex) => {
        if (action.kind !== "move" || action.destination.x !== coordinate.x || action.destination.y !== coordinate.y) return [];
        const plannedUnit = view.projection.units.find((unit) => unit.unitId === unitId);
        return plannedUnit ? [{ unitId, label: `${unitPlanCode(plannedUnit)}:${actionIndex + 1}`, order: actionIndex + 1 }] : [];
      }));
      const selected = selection?.kind === "cell" && selection.at.x === coordinate.x && selection.at.y === coordinate.y;
      const classes = ["v4-cell", battery && "battery-field", hazard && "hazard-field", flare && "flare-field", smoke && "smoke-field", chaff && "chaff-field", inRange && "unit-range", inTarget && "target-field", inFriendlyFront && "friendly-front", inHostileFront && "hostile-front", frozen && "frozen-cell", selected && "selected"].filter(Boolean).join(" ");
      const label = [`${coordinate.x},${coordinate.y}`, ...units.map((unit) => `${unit.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${displayChassis(unit.chassis)}${plannedPlans[unit.unitId]?.length ? ", staged for Kinetic" : ""}`), `${artifacts.length} artifacts`, traffic ? `${traffic} actions` : "", ...plannedMarkers.map((marker) => `${marker.label} staged move`)].filter(Boolean).join(", ");
      return <button key={index} type="button" role="gridcell" data-battle-cell={`${coordinate.x},${coordinate.y}`} tabIndex={focus.x === coordinate.x && focus.y === coordinate.y ? 0 : -1}
        className={classes} aria-label={label} onFocus={() => setFocus(coordinate)} onKeyDown={(event) => moveFocus(event, coordinate)} onClick={() => {
          if (units[0]) onSelect({ kind: "unit", id: units[0].unitId });
          else if (artifacts[0]) onSelect({ kind: "artifact", id: artifacts[0].artifactId });
          else onSelect({ kind: "cell", at: coordinate });
          if (!readOnly && (view.projection.phase === "artillery" || (!units[0] && !artifacts[0]))) onCell(coordinate);
        }}>
        <small>{coordinate.x},{coordinate.y}</small>
        {traffic > 0 && <b className={`traffic heat-${Math.min(4, traffic)}`} aria-label={`${traffic} successful actions`}>{traffic}</b>}
        <span className="cell-tokens">{units.map((unit) => <i key={unit.unitId} className={`unit-token-v4 ${unit.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${unit.uap.frozen ? "paralyzed" : ""} ${plannedPlans[unit.unitId]?.length ? "staged" : ""} ${selection?.kind === "unit" && selection.id === unit.unitId ? "selected-unit" : ""}`} title={unit.unitId}>{unitCode(unit.chassis)}</i>)}{artifacts.slice(0, 3).map((artifact) => <i key={artifact.artifactId} className={`artifact-token-v4 ${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${artifact.verified ? "verified" : ""} ${artifact.battery.active ? "battery" : ""}`} title={artifact.artifactId}>{artifact.battery.active ? "B" : "◆"}</i>)}</span>
        {plannedMarkers.length > 0 && <span className="planned-step-markers" aria-hidden="true">{plannedMarkers.map((marker) => <b key={`${marker.unitId}-${marker.order}`}>{marker.label}</b>)}</span>}
        {selectedPreview && inTarget && <span className="preview-count">{selectedPreview.affectedUnitIds.length + selectedPreview.affectedArtifactIds.length}</span>}
      </button>;
    })}</div>)}
  </div>;
}

function CapacityTrack({ view }: { view: BattleCommandV3View }) {
  const claims = new Map(view.projection.capacityTrack.claims.map((claim) => [claim.rank, claim]));
  return <section className="capacity-track" aria-label="Shared Fibonacci capacity track"><div className="capacity-track-heading"><span>SHARED CAPACITY</span><small>{view.projection.capacityTrack.artilleryUnlocked ? "Artillery unlocked" : view.projection.capacityTrack.artilleryUnlockRound ? `Artillery at Register ${view.projection.capacityTrack.artilleryUnlockRound}` : "Rank 3 unlocks Artillery next Register"}</small></div><div className="capacity-slots">{view.rules.capacitySlots.map((slot) => {
    const claim = claims.get(slot.rank);
    const current = slot.rank === view.projection.capacityTrack.nextRank;
    return <div key={slot.rank} className={`capacity-slot ${claim ? "claimed" : current ? "current" : "locked"}`}><b>R{slot.rank}</b><strong>+{slot.capacityAward}</strong><small>{claim ? `${claim.playerId} · ${claim.attentionPaid}` : `${slot.cost} attention`}</small></div>;
  })}</div></section>;
}

function Armories({ view, active, selectedCardId, onCard }: { view: BattleCommandV3View; active: boolean; selectedCardId: string | null; onCard: (cardId: string) => void }) {
  return <section className={`v4-armories ${active ? "active" : "inactive"}`} aria-label="Public ordered armories">
    {!active && <div className="armory-inactive-caption">ACTIVE IN ARTILLERY</div>}
    {view.projection.players.map((player) => <div key={player.playerId} className={player.playerId === PLAYER ? "friendly" : "hostile"}><header><strong>{player.playerId === PLAYER ? "Your armory" : "Doctrine armory"}</strong><span>Cooldown {player.armory.cooldown} · {player.armory.retaliationAvailable ? "COUNTERFIRE READY" : "ordinary fire"}</span></header><div>{player.armory.cards.map((card, index) => {
      const legality = player.playerId === PLAYER ? view.legal.shellCards.find((item) => item.cardId === card.cardId) : null;
    return <button key={card.cardId} disabled={!active || player.playerId !== PLAYER || !legality?.legal} className={selectedCardId === card.cardId ? "active" : ""} onClick={() => onCard(card.cardId)} title={legality?.reason ?? shellCopy[card.shell].detail}><small>{index + 1}</small><strong>{shellCopy[card.shell].label}</strong><span>{legality?.usesRetaliation ? "BYPASS" : legality?.reason ?? "READY"}</span></button>;
  })}</div></div>)}</section>;
}

function UnitRoster({ view, stage, selection, plans, planMode, setPlanMode, append, clear, allocations, setAllocation, submitCommand, busy, onSelect, unitArt, inspector }: {
  view: BattleCommandV3View;
  stage: Stage;
  selection: Selection | null;
  plans: Record<string, AttentionV4KineticAction[]>;
  planMode: PlanMode;
  setPlanMode: (mode: PlanMode) => void;
  append: (unit: AttentionV4UnitState, action: AttentionV4KineticAction) => void;
  clear: (unitId: string) => void;
  allocations: Record<string, Allocation>;
  setAllocation: (unitId: string, allocation: Allocation) => void;
  submitCommand: (intent: AttentionV4CommandIntent) => void;
  busy: boolean;
  onSelect: (selection: Selection) => void;
  unitArt: (unitId: string) => ArtCatalogEntry | undefined;
  inspector: ReactNode;
}) {
  const own = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER);
  const [tooltipUnitId, setTooltipUnitId] = useState<string | null>(null);
  const active = view.projection.phase === "command" && view.legal.activeCommanderId === PLAYER;
  const kinetic = stage === "kinetic" && view.projection.phase === "kinetic";
  const command = stage === "command" && view.projection.phase === "command";
  return <section className="mech-roster fleet-strip" aria-label="Fleet command lane"><div className="mech-roster-heading"><div><span>FLEET COMMAND</span><strong>{stage === "resolution" ? "Round decisions" : kinetic ? "Ordered movement plans" : command ? "Output allocation" : "Fleet state"}</strong><small>Battery UAP is snapshotted at Register; select a portrait or board token to focus a unit.</small></div></div><div className="fleet-strip-deck"><div className="fleet-strip-scroll"><div className="mech-roster-cards" style={{ gridTemplateColumns: `repeat(${own.length}, minmax(240px, 1fr))`, minWidth: `${own.length * 240 + Math.max(0, own.length - 1) * 8}px` }}>{own.map((unit) => {
    const unitLegal = view.legal.kinetic.find((item) => item.unitId === unit.unitId);
    const plan = plans[unit.unitId] ?? [];
    const allocationLegal = view.legal.allocations.find((item) => item.unitId === unit.unitId)!;
    const allocation = allocations[unit.unitId] ?? { volume: allocationLegal.prefillVolume, densityPct: allocationLegal.prefillDensityPct };
    const maximum = Math.min(allocationLegal.maximumVolume, allocationLegal.maximumVolumeByDensity[String(allocation.densityPct)] ?? 0);
    const densityOptions = view.rules.allocation.densities.filter((density) => density <= allocationLegal.maximumDensityPct);
    const effectiveCalibration = unit.calibration * allocation.densityPct / 100;
    const selected = selection?.kind === "unit" && selection.id === unit.unitId;
    const plannedCondense = plan.filter((action) => action.kind === "condense-output").length;
    const condenseLocked = plannedCondense > 0;
    const planComplete = kineticPlanComplete(plan, unitLegal?.effectiveUap ?? 0);
    const remainingUap = Math.max(0, (unitLegal?.effectiveUap ?? 0) - plan.length);
    const moveCount = plan.filter((action) => action.kind === "move").length;
    const stepUpCount = plan.filter((action) => action.kind === "step-up").length;
    const uplinkCount = plan.filter((action) => action.kind === "command-uplink").length;
    const scanCounts = new Map(own.filter((candidate) => candidate.chassis === "scout").map((scout) => [scout.unitId, plan.filter((action) => action.kind === "support-scan" && action.scoutUnitId === scout.unitId).length]));
    const rangeDownCount = plan.filter((action) => action.kind === "range-shift" && action.delta === -1).length;
    const rangeUpCount = plan.filter((action) => action.kind === "range-shift" && action.delta === 1).length;
    const projectedRange = unit.activeRange + rangeUpCount - rangeDownCount;
    const projectedPosition = [...plan].reverse().find((action): action is Extract<AttentionV4KineticAction, { kind: "move" }> => action.kind === "move")?.destination ?? unit.position;
    const scanCount = plan.filter((action) => action.kind === "support-scan").length;
    const portrait = unitArt(unit.unitId);
    const selectUnit = () => onSelect({ kind: "unit", id: unit.unitId });
    const tooltipId = `uap-${unit.unitId.replace(/[^a-z0-9_-]/gi, "-")}`;
    const mobility = unit.uap.freezeSources.length ? unit.uap.freezeSources.join(" + ") : unit.uap.nextFreezeSources.length ? `Next: ${unit.uap.nextFreezeSources.join(" + ")}` : "Mobile";
    const capability = unit.chassis === "scout" ? `Condense ${kinetic ? plannedCondense : unit.condenseSteps}/2 · cap ${allocationLegal.maximumVolume}@${allocationLegal.maximumDensityPct}%` : unit.chassis === "line" ? "Step-Up / Scan" : unit.uplinkQueued ? "Uplink queued" : "Uplink idle";
    const planState = plan.length === 0 ? "hold" : planComplete ? "staged" : "planning";
    return <article key={unit.unitId} aria-current={selected ? "true" : undefined} data-plan-state={kinetic ? planState : undefined} className={`v4-unit-card ${selected ? "selected" : ""} ${plan.length ? "has-staged-plan" : ""} ${unit.uap.frozen ? "frozen" : ""}`} onPointerDownCapture={selectUnit} onFocusCapture={selectUnit}>
      <header className="fleet-card-header">
        <button type="button" className="unit-portrait-select" aria-label={`Select ${displayChassis(unit.chassis)} unit ${unit.unitId.split(":").at(-1)}`} aria-pressed={selected} aria-describedby={tooltipId} onClick={selectUnit} onMouseEnter={() => setTooltipUnitId(unit.unitId)} onMouseLeave={() => setTooltipUnitId(null)} onFocus={() => setTooltipUnitId(unit.unitId)} onBlur={() => setTooltipUnitId(null)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setTooltipUnitId(null); } }}>{portrait ? <img src={portrait.cardSrc} alt="" /> : <span className={`unit-portrait-fallback art-mech-${unit.chassis === "heavy" ? "siege" : unit.chassis}`}><b>{unitCode(unit.chassis)}</b><small>{displayChassis(unit.chassis)}</small></span>}<strong>{displayChassis(unit.chassis).toUpperCase()} · W{unit.chassis === "scout" ? 1 : unit.chassis === "line" ? 2 : 3}</strong></button>
        <div className="fleet-card-summary"><div><b>{displayChassis(unit.chassis)} <small>{unit.unitId.split(":").at(-1)}</small></b><strong>{percent(unit.calibration)} CAL</strong></div><span>R{unit.activeRange} · reactor {unit.reactorRating} · {unit.uap.frozen ? "0 FROZEN" : `${unit.uap.effective} UAP`} · {mobility}</span><small>{capability}</small></div>
        <span id={tooltipId} role="tooltip" className={`uap-tooltip ${tooltipUnitId === unit.unitId ? "open" : ""}`}><b>UNIT ACTION POINTS</b><span>BASE {unit.uap.base}</span><span>BATTERY +{unit.uap.batteryBonus}</span><strong>{unit.uap.frozen ? "0 FROZEN" : `${unit.uap.effective} TOTAL`}</strong></span>
      </header>
      <div className="unit-control-surface"><div key={stage} className="fleet-phase-content">
      {kinetic && <>
        <div className={`kinetic-plan-status ${planState}`} aria-label={`${planState === "hold" ? "Hold" : planState === "staged" ? "Staged" : "Planning"} for Kinetic`}>
          <span>{planState === "hold" ? "HOLD · KINETIC" : planState === "staged" ? "STAGED · KINETIC" : "PLANNING · KINETIC"}</span>
          <ol className="ordered-plan">{plan.length ? <>{plan.map((action, index) => <li key={`${action.kind}-${index}`}><b>{index + 1}</b><span>{kineticActionLabel(action)}</span></li>)}{!planComplete && <li className="placeholder"><b>{plan.length + 1}</b><span>Action open</span></li>}</> : <li className="hold"><b>0</b><span>Explicit Hold</span></li>}</ol>
        </div>
        <div className="unit-actions" aria-label={`${displayChassis(unit.chassis)} Kinetic actions`}>
          <KineticActionButton label="Move on grid" icon={"\u2197"} stagedCount={moveCount} active={planMode === "move" && selected} disabled={busy || condenseLocked || remainingUap === 0} onClick={() => setPlanMode("move")} />
          {unit.chassis === "scout" && <KineticActionButton label="Condense output" icon={"\u25C6"} stagedCount={plannedCondense} disabled={busy || plannedCondense >= (unitLegal?.maxCondenseSteps ?? 0) || remainingUap === 0} onClick={() => append(unit, { kind: "condense-output" })} />}
          {unit.chassis === "line" && <>
            <KineticActionButton label="Step-Up" icon={"\u21E7"} stagedCount={stepUpCount} disabled={busy || stepUpCount > 0 || remainingUap === 0} onClick={() => append(unit, { kind: "step-up" })} />
            {own.filter((candidate) => candidate.chassis === "scout").map((scout) => {
              const stagedScans = scanCounts.get(scout.unitId) ?? 0;
              const scanAvailable = distance(projectedPosition, scout.position) <= projectedRange;
              return <KineticActionButton key={scout.unitId} label={`Scan ${scout.unitId.split(":").at(-1)}`} icon={"\u25CE"} stagedCount={stagedScans} disabled={busy || remainingUap === 0 || scanCount >= (unitLegal?.maxSupportScans ?? 0) || !scanAvailable} onClick={() => append(unit, { kind: "support-scan", scoutUnitId: scout.unitId })} />;
            })}
          </>}
          {unit.chassis === "heavy" && <KineticActionButton label="Uplink" icon={"\u2301"} stagedCount={uplinkCount} disabled={busy || uplinkCount > 0 || remainingUap === 0} onClick={() => append(unit, { kind: "command-uplink" })} />}
          <div className={`kinetic-range-control ${!busy && !condenseLocked && remainingUap > 0 ? "is-available" : ""} ${rangeDownCount + rangeUpCount ? "is-staged" : ""}`} role="group" aria-label={`Range shift, projected range ${projectedRange}`} title={`Range shift · projected R${projectedRange}`}>
            <span className="kinetic-action-icon" aria-hidden="true">{"\u2194"}</span><span className="kinetic-action-label">Range <small>R{projectedRange}</small></span><span className="kinetic-action-beacon" aria-hidden="true">{rangeDownCount + rangeUpCount || ""}</span>
            <button type="button" aria-label="Decrease range" disabled={busy || condenseLocked || remainingUap === 0 || projectedRange <= (unitLegal?.range.minimum ?? 1)} onClick={() => append(unit, { kind: "range-shift", delta: -1 })}>−</button>
            <button type="button" aria-label="Increase range" disabled={busy || condenseLocked || remainingUap === 0 || projectedRange >= (unitLegal?.range.maximum ?? 5)} onClick={() => append(unit, { kind: "range-shift", delta: 1 })}>+</button>
          </div>
          <button type="button" className="kinetic-clear" disabled={busy || plan.length === 0} onClick={() => clear(unit.unitId)}>Clear plan</button>
        </div>
      </>}
      {command && <div className="output-allocation"><div className="allocation-row"><div className="allocation-fields"><label><span className="sr-only">Volume for {unit.unitId}</span><input aria-label={`Volume for ${unit.unitId}`} type="number" min="1" max={maximum} value={allocation.volume} onChange={(event) => setAllocation(unit.unitId, { ...allocation, volume: Number(event.target.value) })} /></label><span>×</span><label><span className="sr-only">Density for {unit.unitId}</span><select aria-label={`Density for ${unit.unitId}`} value={allocation.densityPct} onChange={(event) => { const densityPct = Number(event.target.value); const cap = Math.min(allocationLegal.maximumVolume, allocationLegal.maximumVolumeByDensity[String(densityPct)] ?? 0); setAllocation(unit.unitId, { volume: Math.max(1, Math.min(allocation.volume, cap)), densityPct }); }}>{densityOptions.map((density) => <option key={density} value={density}>{density}%</option>)}</select></label></div><button disabled={busy || !active || unit.outputDecision !== "pending" || allocation.volume < 1 || allocation.volume > maximum || allocation.densityPct > allocationLegal.maximumDensityPct} className="battle-primary" onClick={() => submitCommand({ kind: "emit", playerId: PLAYER, unitId: unit.unitId, volume: allocation.volume, densityPct: allocation.densityPct })}>Emit</button><button disabled={busy || !active || unit.outputDecision !== "pending"} onClick={() => submitCommand({ kind: "hold", playerId: PLAYER, unitId: unit.unitId })}>Hold</button></div><p className="allocation-equation">{allocation.volume} × {allocation.densityPct} ≤ {unit.reactorRating * 100} · D×C = {percent(effectiveCalibration)}</p><strong className={`decision ${unit.outputDecision}`}>{unit.outputDecision}</strong></div>}
      {stage === "resolution" && <div className="fleet-resolution-state"><strong className={`decision ${unit.outputDecision}`}>{unit.outputDecision === "pending" ? "NO DECISION" : unit.outputDecision}</strong><span>{unit.outputDecision === "emitted" ? "Output entered Resolution" : unit.outputDecision === "held" ? "Output held this round" : "No output was committed"}</span></div>}
      {!kinetic && !command && stage !== "resolution" && <div className="fleet-inactive-caption">{view.projection.phase === "capacity" ? "OUTPUT ACTIVE AFTER CAPACITY" : "FLEET CONTROLS ACTIVE IN KINETIC OR COMMAND"}</div>}
      </div></div>
      <span className="unit-selection-indicator" aria-hidden="true" />
    </article>;
  })}</div></div>{inspector}</div></section>;
}

function ArtifactPanel({ view, artifact, submit, busy, interactive }: { view: BattleCommandV3View; artifact?: AttentionV4ProjectedArtifact; submit: (intent: AttentionV4CommandIntent) => void; busy: boolean; interactive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setExpanded(Boolean(artifact)); }, [artifact?.artifactId]);
  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
      requestAnimationFrame(() => toggleRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);
  if (!artifact) return <section className="selection-panel empty compact-inspector" aria-label="Context inspector"><span className="battle-kicker">CONTEXT INSPECTOR</span><h2>Select an artifact</h2><p>Density, calibration, age, traffic, and Battery state.</p></section>;
  const source = view.projection.units.find((unit) => unit.unitId === artifact.sourceUnitId);
  const legal = view.legal.artifacts.find((item) => item.artifactId === artifact.artifactId);
  const hazard = view.legal.projectedHazards.find((item) => item.artifactId === artifact.artifactId);
  const own = artifact.ownerPlayerId === PLAYER;
  const active = interactive && view.legal.activeCommanderId === PLAYER;
  const title = artifact.artifactId.split(":").slice(-2).join(" · ");
  return <><section className="selection-panel v4-artifact-panel compact-inspector" aria-label="Context inspector"><span className="battle-kicker">CONTEXT INSPECTOR</span><h2>{title}</h2><p>{percent(artifact.reportedConfidence)} confidence · {artifact.verified ? "verified" : artifact.resolution === "pending" ? "pending" : artifact.resolution}</p><button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls="context-inspector-details" aria-label={expanded ? "Collapse context inspector" : "Expand context inspector"} onClick={() => setExpanded((current) => !current)}>{expanded ? "Collapse details" : "Expand details"}</button></section>
  {expanded && <section id="context-inspector-details" className="inspector-expansion v4-artifact-panel" aria-label="Context inspector details"><header><div><span className="battle-kicker">{own ? "FRIENDLY" : "HOSTILE"} ARTIFACT</span><h2>{title}</h2></div><strong>{percent(artifact.reportedConfidence)} confidence</strong></header>
    <div className="artifact-metrics"><Metric label="Density" value={`${artifact.densityPct}%`} /><Metric label="Source calibration" value={percent(artifact.sourceCalibration)} /><Metric label="Effective D×C" value={percent(artifact.effectiveCalibration)} /><Metric label="Age / CL" value={`${artifact.age} / ${artifact.contextLimit}`} /><Metric label="Traffic" value={`${artifact.localTraffic} / 3 safe`} /><Metric label="Truth" value={artifact.revealedSound === null ? "hidden" : artifact.revealedSound ? "sound" : "unsound"} /></div>
    <p>From {source ? displayChassis(source.chassis) : "unknown unit"} at {artifact.position.x},{artifact.position.y}. {artifact.objectiveEligible ? "Inside its active objective front." : "Outside its active objective front."}</p>
    {artifact.battery.active && <div className={`battery-banner ${artifact.battery.suppressed ? "suppressed" : ""}`}><strong>{artifact.battery.suppressed ? "BATTERY SUPPRESSED" : "ACTIVE BATTERY"}</strong><span>3×3 field · +1 next-Register UAP · −1 Verify/Seize on other artifacts</span></div>}
    {hazard && <div className="detonation-warning" role="alert"><strong>PROJECTED DRIFT DETONATION</strong><span>{hazard.reasons.join(" + ")} · +2 Drift · freezes {hazard.frozenUnitIds.length} friendly unit(s)</span></div>}
    {own && artifact.resolution === "pending" && <div className="artifact-actions"><button disabled={busy || !interactive || !legal?.verify.legal} onClick={() => submit({ kind: "verify", playerId: PLAYER, artifactId: artifact.artifactId })}>Verify · {legal?.verify.cost.total ?? 1}{legal?.verify.cost.batteryDiscount ? " (Battery)" : ""}</button><button disabled={busy || !active} onClick={() => submit({ kind: "accept", playerId: PLAYER, artifactId: artifact.artifactId })}>Accept</button><button disabled={busy || !active} onClick={() => submit({ kind: "reject", playerId: PLAYER, artifactId: artifact.artifactId })}>Reject</button><button disabled={busy || !interactive || !legal?.seize.legal} onClick={() => submit({ kind: "seize", playerId: PLAYER, artifactId: artifact.artifactId })}>Seize · {legal?.seize.cost.total ?? source?.reactorRating ?? 1}</button><button disabled={busy || !interactive || !view.legal.abilities.perfectFocus.ready} onClick={() => submit({ kind: "perfect-focus", playerId: PLAYER, artifactId: artifact.artifactId })}>Perfect Focus</button></div>}
  </section>}</>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ArtifactTray({ view, selection, onSelect, boardView, onBoardView }: { view: BattleCommandV3View; selection: Selection | null; onSelect: (selection: Selection) => void; boardView: "perspective" | "tactical"; onBoardView: (value: "perspective" | "tactical") => void }) {
  const artifacts = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending").sort((left, right) => left.ownerPlayerId.localeCompare(right.ownerPlayerId) || left.artifactId.localeCompare(right.artifactId));
  return <section className="artifact-tray context-bar" aria-label="Persistent context">
    <div className="context-label"><span>PERSISTENT CONTEXT</span><strong>{artifacts.length}</strong></div>
    <div className="artifact-pieces">{artifacts.map((artifact) => <button key={artifact.artifactId} type="button" aria-pressed={selection?.kind === "artifact" && selection.id === artifact.artifactId} aria-label={`${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} artifact ${artifact.artifactId}, ${percent(artifact.reportedConfidence)} confidence, age ${artifact.age} of ${artifact.contextLimit}${artifact.verified ? ", verified" : ""}`} className={`artifact-piece ${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${artifact.verified ? "verified" : ""} ${selection?.kind === "artifact" && selection.id === artifact.artifactId ? "selected" : ""}`} onClick={() => onSelect({ kind: "artifact", id: artifact.artifactId })}><span><i />{unitCode(artifact.sourceChassis)}{artifact.battery.active ? <b>B</b> : null}</span><strong>{percent(artifact.reportedConfidence)}{artifact.verified ? " ✓" : ""}</strong><small>{artifact.age}/{artifact.contextLimit} · T{artifact.localTraffic}</small></button>)}{artifacts.length === 0 && <p>No pending artifacts yet — output decisions occur during Command.</p>}</div>
    <div className="context-tools"><span className="base-rate">LATENT SOUNDNESS <b>{percent(view.rules.soundnessRate)}</b></span><div className="board-view-switch" role="group" aria-label="Battlefield view"><button type="button" aria-pressed={boardView === "perspective"} onClick={() => onBoardView("perspective")}>Perspective</button><button type="button" aria-pressed={boardView === "tactical"} onClick={() => onBoardView("tactical")}>Tactical 2D</button></div></div>
  </section>;
}

function EventTicker({ view }: { view: BattleCommandV3View }) {
  const items = view.events.filter((item) => !item.eventType.includes("phase.")).slice(-5).reverse();
  const announcement = items.length ? `${items.length} updates. ${items.map((item) => item.eventType.replace("attention.v4.", "")).join(", ")}` : "No recent updates";
  return <section className="event-ticker"><span>RECENT RESOLUTION</span>{items.map((item) => <div key={item.eventId}><b>{item.eventType.replace("attention.v4.", "").replaceAll(".", " / ")}</b><small>{item.actorId ?? "system"}</small></div>)}<p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p></section>;
}

function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="rules-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="v4-dialog" role="dialog" aria-modal="true" aria-labelledby="v4-dialog-title"><div className="drawer-heading"><h2 id="v4-dialog-title">{title}</h2><button ref={closeRef} onClick={onClose}>Close</button></div><div className="dialog-body">{children}</div>{actions && <div className="dialog-actions">{actions}</div>}</div></div>;
}

function Rules({ view, onClose }: { view: BattleCommandV3View; onClose: () => void }) {
  return <Modal title="Attention-economy v4.2 reference" onClose={onClose}><p><strong>{view.rules.rulesetVersion}</strong> · {view.rules.resolverVersion}</p><h3>Fleet weight</h3><p>Every fleet spends exactly 6 weight: Scout 1, Line 2, Heavy 3. Fleets contain 3–5 units, at most one Heavy, and at most four Scouts.</p><h3>Output</h3><p>Scout 3 UAP/reactor 3/calibration .20/range 2; Line 2/.60/range 3; Heavy 1/.90/range 4. A Scout may Condense output up to twice after movement: 3@20/.20, 2@60/.65, then 1@90/.85. Confirm an integer volume and 5-point density within the projected caps. Effective calibration is density × current calibration.</p><h3>Persistent context</h3><p>Scout, Line, and Heavy Context Limits are 1, 2, and 3. Only unverified pending artifacts age. The fourth successful UAP action in a 3×3 artifact field marks it over-taxed. Verify before Resolution to rescue it.</p><h3>Batteries</h3><p>A verified pending artifact becomes a Battery at density ≥80%, generation calibration ≥80%, and a sound or Perfect-Focus-guaranteed result. Fields do not stack; Smoke suppresses them.</p><h3>Artillery</h3><ul>{view.rules.artillery.shells.map((shell) => <li key={shell}><strong>{shellCopy[shell].label}:</strong> {shellCopy[shell].detail}</li>)}</ul><h3>Terminal order</h3><p>Four Drift defeats twelve Progress for an individual player. Bilateral terminal effects apply together, then compare Progress, lower Drift, and remaining Attention.</p></Modal>;
}

function PhaseDock({ view, plans, selectedCardId, target, submit, busy, openEndRisk, newOperation, resolution, continueResolution }: {
  view: BattleCommandV3View;
  plans: Record<string, AttentionV4KineticAction[]>;
  selectedCardId: string | null;
  target: AttentionV4Coordinate | null;
  submit: (submission: BattleCommandV3Submission) => void;
  busy: boolean;
  openEndRisk: () => void;
  newOperation: () => void;
  resolution?: ResolutionPresentation;
  continueResolution: () => void;
}) {
  const resolutionActionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (resolution) resolutionActionRef.current?.focus();
  }, [resolution]);
  if (resolution) {
    const beforeSelf = resolution.before.projection.players.find((player) => player.playerId === PLAYER)!;
    const afterSelf = resolution.after.projection.players.find((player) => player.playerId === PLAYER)!;
    const progress = afterSelf.progress - beforeSelf.progress;
    const drift = afterSelf.drift - beforeSelf.drift;
    const decisions = resolution.before.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER).map((unit) => `${displayChassis(unit.chassis)} ${unit.unitId.split(":").at(-1)}: ${unit.outputDecision}`).join(" · ");
    const terminal = resolution.after.projection.phase === "terminal";
    return <section className="phase-dock resolution-dock" aria-label="Phase actions" aria-live="polite" aria-atomic="true">
      <h2 className="sr-only">Resolution recap</h2>
      <div><span className="battle-kicker">ROUND {resolution.recap.completedRound} · RESOLUTION COMPLETE</span><strong>{progress >= 0 ? "+" : ""}{progress} Progress · {drift >= 0 ? "+" : ""}{drift} Drift · {resolution.recap.detonations.length} Drift Detonation{resolution.recap.detonations.length === 1 ? "" : "s"}</strong><small>{decisions || "No friendly output decisions"}</small></div>
      <div className="resolution-results"><span>{resolution.recap.resolutions.length} context outcomes</span><strong>{terminal ? "Terminal result reached" : `Register opens Round ${resolution.after.projection.round}`}</strong></div>
      <div className="dock-actions"><button ref={resolutionActionRef} className="battle-primary" type="button" onClick={continueResolution}>{terminal ? "View operation result" : `Continue to Round ${resolution.after.projection.round}`}</button></div>
    </section>;
  }
  if (view.projection.phase === "terminal") {
    const self = view.projection.players.find((player) => player.playerId === PLAYER)!;
    return <section className="phase-dock terminal" aria-label="Phase actions"><span className="battle-kicker">OPERATION COMPLETE · {view.projection.terminalReason}</span><strong>{view.projection.winnerPlayerId === PLAYER ? "Victory secured" : view.projection.winnerPlayerId ? "Threshold Doctrine prevailed" : "Exact draw"}</strong><small>{self.progress} Progress · {self.drift} Drift · {self.attention} Attention</small><button className="battle-primary" onClick={newOperation}>New operation</button></section>;
  }
  if (view.projection.phase === "kinetic") {
    const own = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER);
    const queued = own.reduce((sum, unit) => sum + (plans[unit.unitId]?.length ?? 0), 0);
    const complete = own.filter((unit) => kineticPlanComplete(plans[unit.unitId] ?? [], view.legal.kinetic.find((item) => item.unitId === unit.unitId)?.effectiveUap ?? 0)).length;
    return <section className="phase-dock" aria-label="Phase actions"><div><span className="battle-kicker">SIMULTANEOUS KINETIC</span><strong>{queued} ordered actions · {complete} of {own.length} unit plans complete</strong><small>Every omitted action list is submitted explicitly as Hold. Traffic counts both fleets.</small></div><div className="dock-actions"><button className="battle-primary" disabled={busy} onClick={() => submit({ phase: "kinetic", plans: own.map((unit) => ({ unitId: unit.unitId, actions: plans[unit.unitId] ?? [] })) })}>Resolve Kinetic</button></div></section>;
  }
  if (view.projection.phase === "artillery") {
    const card = view.projection.players.find((player) => player.playerId === PLAYER)!.armory.cards.find((item) => item.cardId === selectedCardId);
    const preview = target && selectedCardId ? view.legal.artilleryPreviews.find((item) => item.cardId === selectedCardId && item.center.x === target.x && item.center.y === target.y) : null;
    return <section className="phase-dock artillery-dock" aria-label="Phase actions"><div><span className="battle-kicker">SIMULTANEOUS ARTILLERY</span><strong>{card ? `${shellCopy[card.shell].label} · ${target ? `${target.x},${target.y}` : "choose target"}` : "Choose a card or Pass"}</strong><small>{card ? shellCopy[card.shell].detail : view.projection.capacityTrack.artilleryUnlocked ? "Firing starts cooldown 3." : "Capacity rank 3 has not activated Artillery."}</small></div><div className="impact-preview"><span>EXACT SERVER PREVIEW</span><strong>{preview ? `${preview.affectedUnitIds.length} units · ${preview.affectedArtifactIds.length} artifacts · ${preview.affectedBatteryIds.length} Batteries` : "No target selected"}</strong><small>{preview?.blockedByScreenIds.length ? `Blocked by ${preview.blockedByScreenIds.length} hostile Chaff screen(s)` : "No hostile screen at center"}</small></div><div className="dock-actions"><button disabled={busy} onClick={() => submit({ phase: "artillery", cardId: null })}>Pass</button><button className="battle-primary" disabled={busy || !selectedCardId || !target} onClick={() => submit({ phase: "artillery", cardId: selectedCardId, center: target ?? undefined })}>Fire card</button></div></section>;
  }
  if (view.projection.phase === "capacity") return <section className="phase-dock capacity-dock" aria-label="Phase actions"><CapacityTrack view={view} /><div><span className="battle-kicker">COMMAND OPEN · CAPACITY CLAIM</span><strong>{view.legal.capacity.available ? `Rank ${view.legal.capacity.rank}: ${view.legal.capacity.cost} Attention → +${view.legal.capacity.award}` : "Track complete"}</strong><small>Claims are simultaneous. First priority rotates each round.</small></div><div className="dock-actions"><button disabled={busy} onClick={() => submit({ phase: "capacity", claim: false })}>Pass</button><button className="battle-primary" disabled={busy || !view.legal.capacity.affordable} onClick={() => submit({ phase: "capacity", claim: true })}>Claim</button></div></section>;
  const self = view.projection.players.find((player) => player.playerId === PLAYER)!;
  const pending = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER && unit.outputDecision === "pending").length;
  return <section className="phase-dock" aria-label="Phase actions"><div><span className="battle-kicker">ALTERNATING COMMAND</span><strong>{view.legal.activeCommanderId === PLAYER ? "Your intent" : "Doctrine resolving"} · {self.attention} Attention · {pending} pending</strong><small>Every unit must explicitly Emit or Hold. Pending artifacts persist across rounds.</small></div><div className="dock-actions"><button disabled={busy || !view.legal.abilities.overclock.ready} onClick={() => submit({ phase: "command", intent: { kind: "overclock", playerId: PLAYER } })}>Overclock · −1 Seize</button><button className="battle-primary" disabled={busy || !view.legal.canEndCommand} onClick={openEndRisk}>End Command</button></div></section>;
}

export function BattleCommandApp({ friendMatchId }: { friendMatchId?: string } = {}) {
  const [view, setView] = useState<BattleCommandV3View | null>(null);
  const viewRef = useRef<BattleCommandV3View | null>(null);
  const [resolutionPresentation, setResolutionPresentation] = useState<ResolutionPresentation | null>(null);
  const [briefing, setBriefing] = useState(true);
  const [retired, setRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [plans, setPlans] = useState<Record<string, AttentionV4KineticAction[]>>({});
  const [planMode, setPlanMode] = useState<PlanMode>("move");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [target, setTarget] = useState<AttentionV4Coordinate | null>(null);
  const [allocations, setAllocations] = useState<Record<string, Allocation>>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [endRiskOpen, setEndRiskOpen] = useState(false);
  const [playerFleet, setPlayerFleet] = useState<CompositionModule>("heavy-line-scout");
  const [opponentFleet, setOpponentFleet] = useState<CompositionModule>("heavy-line-scout");
  const [experience, setExperience] = useState<BattleExperience | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [artAssets, setArtAssets] = useState<Record<string, ArtCatalogEntry>>({});
  const [autoArtPools, setAutoArtPools] = useState<Record<Chassis, ArtCatalogEntry[]>>({ scout: [], line: [], heavy: [] });
  const [boardView, setBoardView] = useState<"perspective" | "tactical">(() => (localStorage.getItem("context-landscape.boardView") as "perspective" | "tactical" | null) ?? "perspective");
  const [uiScale, setUiScale] = useState<UiScale>(initialUiScale);
  const friendOrdersLocked = Boolean(friendMatchId && experience?.submitted && view?.projection.phase === "kinetic");

  function updateUiScale(value: UiScale) {
    setUiScale(value);
    localStorage.setItem("context-landscape.uiScale", value);
  }

  function ingestView(next: BattleCommandV3View): IngestResult {
    const previous = viewRef.current;
    if (previous?.projection.matchId === next.projection.matchId) {
      if (next.revision < previous.revision) return "stale";
      if (next.revision === previous.revision) return "equal";
    }
    if (previous?.projection.matchId === next.projection.matchId && previous.projection.phase === "kinetic" && (next.projection.phase !== "kinetic" || next.projection.round !== previous.projection.round)) setPlans({});
    const recap = next.recaps.resolution;
    if (previous?.projection.matchId === next.projection.matchId && previous.projection.phase === "command" && (next.projection.phase === "kinetic" || next.projection.phase === "terminal") && recap?.completedRound === previous.projection.round) {
      setResolutionPresentation({ before: previous, after: next, recap });
    }
    viewRef.current = next;
    setView(next);
    return "advanced";
  }

  function applyFriendPayload(payload: FriendBattleCommandView) {
    const normalized = normalizeFriend(payload);
    if (friendMatchId && normalized.battle.projection.matchId !== friendMatchId) return;
    if (ingestView(normalized.battle) === "stale") return;
    setExperience(normalized.experience); setBriefing(false);
  }

  useEffect(() => {
    if (friendMatchId) {
      setBusy(true);
      void requestJson<AuthSessionView>("/api/auth/session").then((session) => {
        if (!session.authenticated) throw new ApiError(401, "authentication_required");
        setCsrfToken(session.csrfToken);
        return requestJson<FriendBattleCommandView>(`/api/battle-command/friend-matches/${friendMatchId}`);
      }).then(applyFriendPayload).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught))).finally(() => setBusy(false));
      return;
    }
    const linked = new URLSearchParams(window.location.search).get("battle");
    const matchId = linked ?? localStorage.getItem("context-landscape.battleCommandMatch");
    if (!matchId) return;
    setBusy(true);
    void requestJson<BattleCommandV3View>(`/api/battle-command/matches/${matchId}`).then((payload) => {
      ingestView(payload); setBriefing(false); localStorage.setItem("context-landscape.battleCommandMatch", matchId);
    }).catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 410) setRetired(true);
      if (!linked) localStorage.removeItem("context-landscape.battleCommandMatch");
    }).finally(() => setBusy(false));
  }, [friendMatchId]);

  useEffect(() => {
    if (!friendMatchId || !experience) return;
    const stream = new EventSource(`/api/battle-command/matches/${friendMatchId}/stream`);
    let refresh: AbortController | null = null;
    const listener = (event: Event) => {
      let revision: number;
      try {
        revision = Number((JSON.parse((event as MessageEvent).data) as { revision: number }).revision);
      } catch {
        return;
      }
      if (!Number.isInteger(revision) || revision <= (viewRef.current?.revision ?? -1)) return;
      refresh?.abort();
      const controller = new AbortController();
      refresh = controller;
      void requestJson<FriendBattleCommandView>(`/api/battle-command/friend-matches/${friendMatchId}`, { signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) applyFriendPayload(payload); })
        .catch(() => undefined);
    };
    stream.addEventListener("revision", listener);
    return () => { refresh?.abort(); stream.close(); };
  }, [friendMatchId, experience?.accountSeats.alpha, experience?.accountSeats.bravo]);

  useEffect(() => {
    if (!experience) return;
    const ids = new Set<string>();
    for (const fleet of [experience.fleets.alpha, experience.fleets.bravo]) if (fleet) {
      for (const unit of fleet.units) if (unit.artAssetId) ids.add(unit.artAssetId);
      if (fleet.identity.commanderAssetId) ids.add(fleet.identity.commanderAssetId);
      if (fleet.identity.battlefieldAssetId) ids.add(fleet.identity.battlefieldAssetId);
    }
    void Promise.all([...ids].map((id) => requestJson<ArtCatalogEntry>(`/api/art/catalog/${encodeURIComponent(id)}`).catch(() => null))).then((items) => setArtAssets((current) => ({ ...current, ...Object.fromEntries(items.filter(Boolean).map((item) => [item!.assetId, item!])) })));
  }, [experience?.fleets.alpha?.snapshotHash, experience?.fleets.bravo?.snapshotHash]);

  useEffect(() => {
    if (!view) return;
    let active = true;
    const subjects: Record<Chassis, string> = { scout: "mech-scout", line: "mech-line", heavy: "mech-siege" };
    void Promise.all((Object.entries(subjects) as Array<[Chassis, string]>).map(async ([chassis, query]) => {
      const page = await requestJson<ArtCatalogPage>(`/api/art/catalog?kind=unit&q=${query}&offset=0&limit=10`).catch(() => null);
      return [chassis, page?.items ?? []] as const;
    })).then((entries) => { if (active) setAutoArtPools(Object.fromEntries(entries) as Record<Chassis, ArtCatalogEntry[]>); });
    return () => { active = false; };
  }, [view?.projection.matchId]);

  useEffect(() => {
    if (!view) return;
    setAllocations(Object.fromEntries(view.legal.allocations.map((item) => [item.unitId, { volume: item.prefillVolume, densityPct: item.prefillDensityPct }])));
  }, [view?.projection.matchId, view?.projection.round, view?.projection.phase]);

  async function start() {
    setBusy(true); setError("");
    try {
      const payload = await requestJson<BattleCommandV3View>("/api/battle-command/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerCompositionModule: playerFleet, opponentCompositionModule: opponentFleet })
      });
      setResolutionPresentation(null); ingestView(payload); setBriefing(false); setRetired(false); setSelection(null); setPlans({});
      localStorage.setItem("context-landscape.battleCommandMatch", payload.projection.matchId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  }

  async function submit(submission: BattleCommandV3Submission) {
    if (!view) return;
    setBusy(true); setError("");
    try {
      const path = friendMatchId ? `/api/battle-command/friend-matches/${view.projection.matchId}/actions` : `/api/battle-command/matches/${view.projection.matchId}/actions`;
      const payload = await requestJson<BattleCommandV3View | FriendBattleCommandView>(path, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID(), ...(friendMatchId && csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ revision: view.revision, submission })
      });
      if (friendMatchId) applyFriendPayload(payload as FriendBattleCommandView); else ingestView(payload as BattleCommandV3View);
      setSelectedCardId(null); setTarget(null); setEndRiskOpen(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 410) {
        setRetired(true); setBriefing(true); viewRef.current = null; setResolutionPresentation(null); setView(null); localStorage.removeItem("context-landscape.battleCommandMatch");
      } else {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        if (message.includes("revision_conflict")) {
          if (friendMatchId) applyFriendPayload(await requestJson<FriendBattleCommandView>(`/api/battle-command/friend-matches/${view.projection.matchId}`));
          else ingestView(await requestJson<BattleCommandV3View>(`/api/battle-command/matches/${view.projection.matchId}`));
        }
      }
    } finally { setBusy(false); }
  }

  function append(unit: AttentionV4UnitState, action: AttentionV4KineticAction) {
    if (busy || friendOrdersLocked) return;
    const effective = view?.legal.kinetic.find((item) => item.unitId === unit.unitId)?.effectiveUap ?? 0;
    setPlans((current) => {
      const actions = current[unit.unitId] ?? [];
      return actions.length >= effective ? current : { ...current, [unit.unitId]: [...actions, action] };
    });
    setSelection({ kind: "unit", id: unit.unitId });
  }

  function clear(unitId: string) {
    if (busy || friendOrdersLocked) return;
    setPlans((current) => ({ ...current, [unitId]: [] }));
  }

  function handleCell(coordinate: AttentionV4Coordinate) {
    if (!view || resolutionPresentation || busy || friendOrdersLocked) return;
    if (view.projection.phase === "artillery" && selectedCardId) { setTarget(coordinate); return; }
    if (view.projection.phase !== "kinetic" || selection?.kind !== "unit") return;
    const unit = view.projection.units.find((candidate) => candidate.unitId === selection.id && candidate.ownerPlayerId === PLAYER);
    if (!unit) return;
    const currentPlan = plans[unit.unitId] ?? [];
    if (currentPlan.some((action) => action.kind === "condense-output")) return;
    const origin = [...currentPlan].reverse().find((action): action is Extract<AttentionV4KineticAction, { kind: "move" }> => action.kind === "move")?.destination ?? unit.position;
    if (distance(origin, coordinate) !== 1) return;
    append(unit, { kind: "move", destination: coordinate });
  }

  function newOperation() {
    if (friendMatchId) { window.location.assign(appHref("view=hangar")); return; }
    localStorage.removeItem("context-landscape.battleCommandMatch");
    viewRef.current = null; setResolutionPresentation(null); setView(null); setBriefing(true); setRetired(false); setSelection(null); setPlans({});
  }

  if (briefing || !view) return friendMatchId ? <main className="briefing-shell friend-loading" data-ui-scale={uiScale}><ArtFrame subject="battlefield-context-furnace" className="briefing-hero"><div className="briefing-copy"><p className="battle-kicker">FRIEND CHALLENGE</p><h1>{error === "authentication_required" ? "Sign in to enter this operation" : "Joining the battlefield"}</h1><p>{error || "Loading your private projection and fleet identity…"}</p>{error === "authentication_required" && <a className="briefing-launch" href={`/api/auth/discord/start?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>Continue with Discord</a>}<a className="briefing-secondary" href={appHref("view=hangar")}>Return to Hangar</a></div></ArtFrame></main> : <><Briefing onStart={() => void start()} busy={busy} retired={retired} playerFleet={playerFleet} opponentFleet={opponentFleet} onPlayerFleet={setPlayerFleet} onOpponentFleet={setOpponentFleet} uiScale={uiScale} onUiScale={updateUiScale} />{error && <div className="battle-toast error" role="alert">{error}</div>}</>;
  const surfaceView = resolutionPresentation ? resolutionSurface(resolutionPresentation) : view;
  const fleetView = surfaceView;
  const activeStage: Stage = resolutionPresentation ? "resolution" : currentStage(view);
  const selectedArtifact = selection?.kind === "artifact" ? surfaceView.projection.artifacts.find((artifact) => artifact.artifactId === selection.id) : undefined;
  const plannedPlans = activeStage === "kinetic" ? plans : {};
  const unitArtFor = (unitId: string): ArtCatalogEntry | undefined => {
    const unit = surfaceView.projection.units.find((candidate) => candidate.unitId === unitId); if (!unit) return undefined;
    const ordinal = surfaceView.projection.units.filter((candidate) => candidate.ownerPlayerId === unit.ownerPlayerId && candidate.chassis === unit.chassis).findIndex((candidate) => candidate.unitId === unitId);
    const fleet = experience ? unit.ownerPlayerId === PLAYER ? experience.fleets.alpha : experience.fleets.bravo : null;
    const identity = fleet?.units.filter((candidate) => candidate.chassis === unit.chassis)[ordinal];
    const assigned = identity?.artAssetId ? artAssets[identity.artAssetId] : undefined;
    if (assigned) return assigned;
    const pool = autoArtPools[unit.chassis];
    if (!pool.length) return undefined;
    const fallbackIndex = ordinal + (unit.ownerPlayerId === PLAYER ? 0 : 5);
    return pool[fallbackIndex % pool.length];
  };
  const battlefieldAssetId = experience?.fleets.alpha?.identity.battlefieldAssetId;
  const battlefieldArt = battlefieldAssetId ? artAssets[battlefieldAssetId]?.battlefieldSrc ?? artAssets[battlefieldAssetId]?.cardSrc : undefined;
  const fleetPlate = (fleet: NonNullable<BattleExperience["fleets"]["alpha"]>, label: string) => {
    const commander = fleet.identity.commanderAssetId ? artAssets[fleet.identity.commanderAssetId] : undefined;
    return <article>{commander && <img src={commander.thumbnailSrc} alt="" />}<div><small>{label}</small><strong>{fleet.name}</strong><span>{fleet.compositionModule.replaceAll("-", " ")}</span></div></article>;
  };
  const waiting = experience?.waitingFor === "opponent";
  const commandBusy = busy || waiting || experience?.status === "conceded";
  const boardLocked = Boolean(resolutionPresentation) || friendOrdersLocked;
  const changeBoardView = (value: "perspective" | "tactical") => { setBoardView(value); localStorage.setItem("context-landscape.boardView", value); };
  return <main className="battle-shell" data-ui-scale={uiScale}>
    <header className="battle-header command-deck-header"><div className="command-deck-brand"><p className="battle-kicker">CONTEXT LANDSCAPE · BATTLE COMMAND</p><h1>{view.rules.scenarioLabel}</h1></div><PhaseStepper view={surfaceView} active={activeStage} /><nav className="battle-nav" aria-label="Context Landscape views"><a href={appHref("view=hangar")}>Fleet Hangar</a><a href={appHref("view=atlas")}>Evidence atlas</a><details className="battle-more"><summary>More</summary><div><a href={appHref("view=legacy")}>Research scenarios</a><a href={appHref("view=commander")}>Commander projection</a>{!friendMatchId && <button type="button" onClick={() => setBriefing(true)}>Briefing</button>}</div></details><InterfaceScale value={uiScale} onChange={updateUiScale} /><button className="battle-primary" onClick={newOperation}>New operation</button></nav></header>
    {error && <div className="battle-toast error" role="alert">{error}</div>}
    {experience && <div className={`friend-match-status ${waiting ? "waiting" : "ready"}`} role="status"><div><span>FRIEND OPERATION · {experience.status.toUpperCase()}</span><strong>{waiting ? "Orders locked — waiting for your opponent" : experience.status === "conceded" ? experience.winnerSeat === PLAYER ? "Opponent conceded" : "Operation conceded" : view.projection.phase === "terminal" ? "Operation complete" : "Live and resumable"}</strong></div><div className="friend-fleet-identities">{experience.fleets.alpha && fleetPlate(experience.fleets.alpha, "Your command")}{experience.fleets.bravo && fleetPlate(experience.fleets.bravo, "Opposing command")}</div><a href={appHref("view=hangar")}>Hangar</a>{experience.status === "active" && view.projection.phase !== "terminal" && <button onClick={() => void requestJson(`/api/battle-command/friend-matches/${view.projection.matchId}/concede`, { method: "POST", headers: csrfToken ? { "x-csrf-token": csrfToken } : {} }).then(() => window.location.reload())}>Concede</button>}</div>}
    <section className="battle-layout">
      <OperationRail view={surfaceView} active={activeStage} resolution={resolutionPresentation ?? undefined} onRules={() => setRulesOpen(true)} />
      <div className={`board-column command-deck-board phase-${activeStage}`}>
        <ArtifactTray view={surfaceView} selection={selection} onSelect={setSelection} boardView={boardView} onBoardView={changeBoardView} />
        <div className={`battle-board-surface ${boardLocked ? "read-only" : ""}`}>{boardView === "perspective" ? <PerspectiveBoard view={surfaceView} selection={selection} onSelect={setSelection} target={target} onCell={handleCell} plannedPlans={plannedPlans} readOnly={boardLocked} unitArt={(unitId) => unitArtFor(unitId)?.cardSrc} battlefieldArt={battlefieldArt} uiScale={UI_SCALE_FACTOR[uiScale]} /> : <Board view={surfaceView} selection={selection} onSelect={setSelection} selectedCardId={selectedCardId} target={target} onCell={handleCell} plannedPlans={plannedPlans} readOnly={boardLocked} />}</div>
        <Armories view={surfaceView} active={!resolutionPresentation && surfaceView.projection.phase === "artillery"} selectedCardId={selectedCardId} onCard={(cardId) => { setSelectedCardId(cardId); setTarget(null); }} />
        <UnitRoster view={fleetView} stage={activeStage} selection={selection} plans={plans} planMode={planMode} setPlanMode={setPlanMode} append={append} clear={clear} allocations={allocations} setAllocation={(unitId, allocation) => setAllocations((current) => ({ ...current, [unitId]: allocation }))} submitCommand={(intent) => void submit({ phase: "command", intent })} busy={commandBusy || Boolean(resolutionPresentation)} onSelect={setSelection} unitArt={unitArtFor} inspector={<ArtifactPanel view={surfaceView} artifact={selectedArtifact} submit={(intent) => void submit({ phase: "command", intent })} busy={commandBusy} interactive={!resolutionPresentation && surfaceView.projection.phase === "command"} />} />
        <EventTicker view={view} />
        <PhaseDock view={view} plans={plans} selectedCardId={selectedCardId} target={target} submit={(submission) => void submit(submission)} busy={commandBusy} openEndRisk={() => setEndRiskOpen(true)} newOperation={newOperation} resolution={resolutionPresentation ?? undefined} continueResolution={() => { setResolutionPresentation(null); setSelection(null); }} />
      </div>
    </section>
    {rulesOpen && <Rules view={view} onClose={() => setRulesOpen(false)} />}
    {endRiskOpen && <Modal title="End Command risk check" onClose={() => setEndRiskOpen(false)} actions={<><button onClick={() => setEndRiskOpen(false)}>Keep commanding</button><button className="battle-primary" disabled={busy} onClick={() => void submit({ phase: "command", intent: { kind: "end-command", playerId: PLAYER } })}>Confirm End</button></>}><p>Pending artifacts persist. The following unverified hazards will detonate during the automatic Resolution unless stabilized now.</p>{view.legal.projectedHazards.filter((item) => item.ownerPlayerId === PLAYER).length ? <ul className="risk-list">{view.legal.projectedHazards.filter((item) => item.ownerPlayerId === PLAYER).map((item) => <li key={item.artifactId}><strong>{item.artifactId.split(":").at(-1)}</strong><span>{item.reasons.join(" + ")} · +2 Drift · freeze {item.frozenUnitIds.length}</span></li>)}</ul> : <p className="safe-recap">No friendly Drift Detonations are projected.</p>}</Modal>}
  </main>;
}
