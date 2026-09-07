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
import { HelpTooltip } from "./HelpTooltip.js";
import { AppNavigation } from "../ui/AppNavigation.js";
import { appHref } from "../navigation.js";
import "./battle-command.css";
import { InterfaceScale, UI_SCALE_FACTOR, useInterfaceScale, type UiScale } from "../ui/InterfaceScale.js";
import { Dialog as Modal } from "../ui/Dialog.js";

const PLAYER = "alpha";
type Selection = { kind: "unit"; id: string } | { kind: "artifact"; id: string } | { kind: "cell"; at: AttentionV4Coordinate };
type PlanMode = "move";
type Allocation = { volume: number; densityPct: number };
type Chassis = AttentionV4UnitState["chassis"];
type CompositionModule = AttentionV4CommanderProfile["compositionModule"];
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

const fleetCopy: Record<CompositionModule, string> = {
  "line-four-scout": "1 Line + 4 Scouts",
  "two-line-two-scout": "2 Line + 2 Scouts",
  "three-line": "3 Line",
  "heavy-three-scout": "1 Heavy + 3 Scouts",
  "heavy-line-scout": "1 Heavy + 1 Line + 1 Scout"
};

const shellCopy: Record<AttentionV4Shell, { label: string; detail: string }> = {
  flare: { label: "Flare", detail: "Doubles output in this 3×3 field for this and the next Command window." },
  smoke: { label: "Smoke", detail: "Resets caught mech calibration, Condense, scans, and Uplinks for two windows. Batteries keep working." },
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

function ArtifactCalibrationHelp({ densityPct, calibration, soundnessRate }: { densityPct: number; calibration: number; soundnessRate: number }) {
  const effective = calibration * densityPct / 100;
  return <HelpTooltip content={<><strong>Artifact calibration · {percent(effective)}</strong><p>{densityPct}% density × {percent(calibration)} mech calibration = {percent(effective)} artifact calibration. Higher values make reported confidence more informative.</p><p>The base chance of sound output is {percent(soundnessRate)}. Calibration measures signal quality; Verify reveals this artifact's actual truth. Existing artifacts keep their calibration when the mech changes later.</p></>}>{(id) => <button type="button" className="help-term" aria-describedby={id}>Artifact calibration {percent(effective)}</button>}</HelpTooltip>;
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
      <header className="briefing-navigation"><strong>Context Landscape</strong><AppNavigation /></header>
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
      <article><span>WIN</span><strong>12 objective Progress</strong><p>Accept sound work or Seize it directly. Both fleets’ results resolve before the winner is chosen.</p></article>
      <article><span>LOSE</span><strong>4 Drift</strong><p>Unsound commitments add one. An expired or over-taxed artifact detonates for an unavoidable two.</p></article>
      <article><span>GENERATE</span><strong>Reactor × density</strong><p>Volume × density cannot exceed the reactor rating. Calibration multiplies density before confidence is formed.</p></article>
      <article><span>ESCALATE</span><strong>Activate both armories</strong><p>Spend Attention on shared Capacity. Rank 3 unlocks artillery at the next Register. Ordinary fire opens a counterfire opportunity for your opponent.</p></article>
    </section>
    <section className="briefing-roster">
      {(["scout", "line", "heavy"] as const).map((chassis) => <ArtFrame key={chassis} subject={`mech-${chassis === "heavy" ? "siege" : chassis}` as GameArtSubjectId}>
        <span>{chassis === "scout" ? "3" : chassis === "line" ? "2" : "1"} BASE UAP</span>
        <strong>{displayChassis(chassis)}</strong>
        <small>{chassis === "scout" ? "Spend up to 2 UAP to Condense: fewer artifacts, much higher quality" : chassis === "line" ? "Step-Up and reserve Support Scans" : "Queue one next-Register Attention Uplink"}</small>
      </ArtFrame>)}
      <div className="briefing-doctrine"><span>OPPOSITION</span><strong>Threshold Doctrine</strong><p>A practice opponent that follows the same rules and has no access to hidden results.</p></div>
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

function artilleryActivation(view: BattleCommandV3View): { label: string; detail: string } {
  const track = view.projection.capacityTrack;
  const unlockRank = view.rules.abilities.artillery.unlockRank;
  if (track.artilleryUnlocked) return { label: "Artillery active", detail: "Both fleets can use their armories during Artillery." };
  if (track.artilleryUnlockRound !== null) return {
    label: `Activates at Register ${track.artilleryUnlockRound}`,
    detail: `Capacity rank ${unlockRank} claimed. Both fleets' artillery activates at Register ${track.artilleryUnlockRound}.`
  };
  return {
    label: `Locked · Capacity ${Math.min(track.nextRank - 1, unlockRank)}/${unlockRank}`,
    detail: `Spend Attention on shared Capacity claims. Reaching rank ${unlockRank} activates both fleets' artillery at the following Register.`
  };
}

function phaseDetail(view: BattleCommandV3View, stage: Stage): string {
  if (stage === "command" && view.projection.phase === "capacity") return "Spend Attention to claim Capacity for future rounds, or save it for inspecting artifacts now. Rank 3 activates artillery for both fleets at the next Register.";
  if (stage === "command" && view.projection.phase === "command") return "Emit creates artifact diamonds; Hold creates none. Select a friendly artifact to Verify its truth, Accept it, Reject it, or Seize it safely. End Command finishes your decisions for this round.";
  return stage === "artillery" && !view.projection.capacityTrack.artilleryUnlocked
    ? `${artilleryActivation(view).detail} Pass this salvo to reach Capacity.`
    : stageCopy[stage].detail;
}

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

function cancelKineticStep(view: BattleCommandV3View, unit: AttentionV4UnitState, plan: readonly AttentionV4KineticAction[], index: number) {
  let position = unit.position;
  let range = unit.activeRange;
  const removed: number[] = [];
  const actions = plan.filter((action, step) => {
    let valid = step !== index;
    if (valid && action.kind === "move") valid = distance(position, action.destination) === 1;
    if (valid && action.kind === "range-shift") valid = range + action.delta >= view.rules.range.minimum && range + action.delta <= view.rules.range.maximum;
    if (valid && action.kind === "support-scan") {
      const scout = view.projection.units.find((candidate) => candidate.unitId === action.scoutUnitId);
      valid = Boolean(scout && distance(position, scout.position) <= range);
    }
    if (!valid) { removed.push(step); return false; }
    if (action.kind === "move") position = action.destination;
    if (action.kind === "range-shift") range += action.delta;
    return true;
  });
  return { actions, removed };
}

function UapHelp() {
  return <><strong>UAP = Unit Action Points</strong><p>Each Move, range step, or mech ability costs 1 point in Kinetic. Each mech gets its own budget at Register, including any battery bonus; frozen mechs have zero.</p><p>Staging reserves points. The X beside a staged action returns them before you submit.</p></>;
}

function CondenseHelp({ view, planned }: { view: BattleCommandV3View; planned: number }) {
  return <><strong>Condense output · 1 UAP per step</strong><p>Prepare fewer Scout artifacts with higher density and calibration. Move or change range before Condense.</p>
    <table><thead><tr><th>Steps</th><th>Artifacts</th><th>Density cap</th><th>Calibration</th></tr></thead><tbody>{view.rules.allocation.scoutCondense.map((mode) => <tr key={mode.steps} aria-current={mode.steps === planned ? "true" : undefined}><th>{mode.steps}</th><td>≤{mode.volumeCap}</td><td>{mode.densityCapPct}%</td><td>{percent(mode.calibration)}</td></tr>)}</tbody></table>
    <p>{planned ? `${planned} ${planned === 1 ? "step is" : "steps are"} staged.` : "No Condense steps staged yet."} The prepared output applies if the plan resolves; Smoke can still reset it. Click a staged step's X to undo it and recover its point.</p></>;
}

function StepUpHelp({ view, planned }: { view: BattleCommandV3View; planned: boolean }) {
  const baseCalibration = view.rules.chassis.line.calibration;
  const steppedUpCalibration = 0.85;
  const density = view.rules.battery.minimumDensityPct;
  return <><strong>Step-Up · 1 UAP · once per round</strong><p>Prepare the Line to emit artifacts with stronger calibration. Combine it with Move, Range or Scan within the same action budget.</p>
    <table><thead><tr><th>Plan</th><th>Calibration</th><th>D×C at {density}%</th></tr></thead><tbody>
      <tr aria-current={!planned ? "true" : undefined}><th>Base</th><td>{percent(baseCalibration)}</td><td>{percent(baseCalibration * density / 100)}</td></tr>
      <tr aria-current={planned ? "true" : undefined}><th>Step-Up</th><td>{percent(steppedUpCalibration)}</td><td>{percent(steppedUpCalibration * density / 100)}</td></tr>
    </tbody></table>
    <p>Effective artifact calibration is density × mech calibration. At {density}% density, Step-Up adds {Math.round((steppedUpCalibration - baseCalibration) * density)} percentage points. The soundness base rate stays {percent(view.rules.soundnessRate)}.</p>
    <p>At density ≥{density}%, this clears a battery's {percent(view.rules.battery.minimumCalibration)} source-calibration requirement. The artifact must still be verified, with a sound result or a Perfect Focus guarantee.</p>
    <p>{planned ? "Step-Up is staged; 1 UAP reserved." : "No Step-Up staged yet."} Applies to new output if the plan resolves; Smoke can reset calibration to 20%. Existing artifacts keep their birth values. Use the staged step's X to undo it.</p>
  </>;
}

function SupportScanHelp({ view, scout, projectedRange, targetDistance, stagedScans, scanCount, maxScans }: {
  view: BattleCommandV3View;
  scout: AttentionV4UnitState;
  projectedRange: number;
  targetDistance: number;
  stagedScans: number;
  scanCount: number;
  maxScans: number;
}) {
  const inRange = targetDistance <= projectedRange;
  return <><strong>Support Scan · 1 UAP per reservation</strong><p>Reserve remote verification for one new artifact from {scout.unitId.split(":").at(-1)} when that Scout emits this round.</p>
    <table><tbody>
      <tr><th>Scout distance</th><td>{targetDistance} {targetDistance === 1 ? "cell" : "cells"} · Line R{projectedRange}</td></tr>
      <tr><th>Reach to add a Scan</th><td>{inRange ? "In range" : "Out of range"}</td></tr>
      <tr><th>This Scout</th><td>{stagedScans} staged</td></tr>
      <tr><th>Line scan budget</th><td>{scanCount} / {maxScans} staged</td></tr>
    </tbody></table>
    <p>Reach is measured from the staged Line position to the Scout's current cell, including diagonals.{!inRange && " Move closer or increase range before adding this Scan."} A Register battery bonus raises the Line's scan limit from one to two.</p>
    <p>At emission, this Line's reservations attach to different new artifacts, starting with the farthest within its final range. If the Scout holds or none of its new artifacts are in reach, nothing attaches.</p>
    <p>Then use Verify in Command to reveal soundness and protect that artifact from aging and detonation. Verify normally costs {view.rules.verifyCost} Attention; a nearby battery can discount it. Scan leaves calibration and density unchanged.</p>
    <p>Smoke on either mech can cancel the reservation. Use a staged Scan's X to cancel and recover its UAP before submitting.</p>
  </>;
}

function RangeHelp({ view, unit, projectedRange, projectedPosition, rangeSteps, condenseLocked }: {
  view: BattleCommandV3View;
  unit: AttentionV4UnitState;
  projectedRange: number;
  projectedPosition: AttentionV4Coordinate;
  rangeSteps: number;
  condenseLocked: boolean;
}) {
  const { width, height } = view.rules.board;
  const cells = Array.from({ length: width * height }, (_, index) => ({ x: index % width, y: Math.floor(index / width) }));
  const ranges = Array.from({ length: view.rules.range.maximum - view.rules.range.minimum + 1 }, (_, index) => view.rules.range.minimum + index);
  return <><strong>Range · 1 UAP per step</strong><p>Each + or − changes reach by one cell. Range shifts preserve calibration.</p>
    <table><thead><tr><th>Range</th><th>Spawn cells</th><th>Calibration Δ</th></tr></thead><tbody>{ranges.map((range) => <tr key={range} aria-current={range === projectedRange ? "true" : undefined}><th>R{range}</th><td>{cells.filter((cell) => { const reach = distance(projectedPosition, cell); return reach >= view.rules.range.spawnMinimum && reach <= range; }).length}</td><td>0 pp</td></tr>)}</tbody></table>
    <p>Spawn cells are possible positions from your staged location, including diagonals and clipped at board edges. The mech's own cell is excluded; artifact quantity still comes from output allocation. “pp” means percentage points.</p>
    {unit.chassis === "line" && <p>Support Scan also uses the Line's range to reach a Scout and attach to its new artifacts. Local Verify stays within one cell of a friendly mech.</p>}
    <p>Current R{unit.activeRange} → staged R{projectedRange} · {rangeSteps} UAP reserved for range. Changes apply if the plan resolves; use a staged step's X to undo it.{condenseLocked ? " Cancel Condense steps first to change range." : unit.chassis === "scout" ? " Change range before Condense." : ""}</p>
  </>;
}

function KineticActionButton({ label, icon, stagedCount = 0, active = false, disabled, onClick, help }: {
  label: string;
  icon: string;
  stagedCount?: number;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  help?: ReactNode;
}) {
  const accessibleLabel = stagedCount > 0 ? `${label}, staged ${stagedCount} ${stagedCount === 1 ? "time" : "times"}` : label;
  const button = (descriptionId?: string) => <button type="button" aria-label={accessibleLabel} aria-describedby={descriptionId} title={help ? undefined : accessibleLabel} disabled={disabled} className={`kinetic-action ${active ? "active" : ""} ${stagedCount ? "is-staged" : ""}`} onClick={onClick}>
    <span className="kinetic-action-icon" aria-hidden="true">{icon}</span>
    <span className={`kinetic-action-label ${help ? "help-term" : ""}`}>{label}</span>
    <span className="kinetic-action-beacon" aria-hidden="true">{stagedCount || ""}</span>
  </button>;
  return help ? <HelpTooltip content={help} className="kinetic-action-help" focusable={disabled}>{button}</HelpTooltip> : button();
}

function recapCopy(view: BattleCommandV3View, active: Stage): { label: string; detail: string; risk?: boolean } {
  if (active === "kinetic") return {
    label: "REGISTER RECAP",
    detail: `${view.recaps.register.uap.filter((item) => item.batteryBonus).length} assisted · ${view.recaps.register.uap.filter((item) => item.frozen).length} frozen · ${view.recaps.register.reloads.reduce((sum, item) => sum + item.cardIds.length, 0)} cards reloaded`
  };
  if (active === "command" && view.projection.phase === "command") {
    const artifacts = view.projection.artifacts.filter((artifact) => artifact.ownerPlayerId === PLAYER);
    const pending = artifacts.filter((artifact) => artifact.resolution === "pending");
    return { label: "YOUR ARTIFACTS", detail: `${pending.length} pending · ${pending.filter((artifact) => artifact.verified).length} verified · ${artifacts.length - pending.length} committed for Resolution` };
  }
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
        {current && <span className="phase-help" onMouseEnter={() => setOpenStage(stage)} onMouseLeave={() => setOpenStage(null)}><button type="button" className="phase-info" aria-label={`About ${stageCopy[stage].label} phase`} aria-describedby={tooltipId} aria-expanded={openStage === stage} onClick={() => setOpenStage((currentOpen) => currentOpen === stage ? null : stage)} onFocus={() => setOpenStage(stage)} onBlur={() => setOpenStage(null)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpenStage(null); } }}><span aria-hidden="true">ⓘ</span></button><span id={tooltipId} role="tooltip" className={`phase-tooltip ${openStage === stage ? "open" : ""}`}><b>{stageCopy[stage].label}</b><span>{phaseDetail(view, stage)}</span><em className={recap.risk ? "risk" : ""}>{recap.label} · {recap.detail}</em></span></span>}
      </li>;
    })}</ol>
  </nav>;
}

function nextPhasePreview(view: BattleCommandV3View, active: Stage, resolution?: ResolutionPresentation): { label: string; detail: string } {
  if (active === "kinetic") return { label: `NEXT · ARTILLERY${view.projection.capacityTrack.artilleryUnlocked ? "" : " · LOCKED"}`, detail: phaseDetail(view, "artillery") };
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
  const projectedDrift = view.legal.projectedHazards.filter((hazard) => hazard.ownerPlayerId === PLAYER).reduce((total, hazard) => total + hazard.drift, 0);
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
      <Status label="Drift" value={`${self.drift}/${view.rules.driftLimit}`} meter={self.drift / view.rules.driftLimit} danger={self.drift >= view.rules.driftLimit || (!resolution && projectedDrift > 0 && self.drift + projectedDrift >= view.rules.driftLimit)} caution={self.drift === view.rules.driftLimit - 1} />
      {!resolution && projectedDrift > 0 && <small className={`projected-drift ${self.drift + projectedDrift >= view.rules.driftLimit ? "defeat" : ""}`}>+{projectedDrift} Drift projected at Resolution{self.drift + projectedDrift >= view.rules.driftLimit ? " · defeat risk" : ""}</small>}
      <div className="operation-pair"><Status label="Attention" value={String(self.attention)} /><Status label="Batteries" value={String(batteries)} /></div>
    </section>
    <section className="phase-guidance" aria-label="Current phase guidance"><span>NOW · {stageCopy[active].label.toUpperCase()}</span><p>{phaseDetail(view, active).split(/\b(UAP)\b/).map((part, index) => part === "UAP" ? <HelpTooltip key={index} content={<UapHelp />}>{(descriptionId) => <button type="button" className="help-term" aria-describedby={descriptionId}>UAP</button>}</HelpTooltip> : part)}</p><div className={recap.risk ? "risk" : ""}><strong>{recap.label}</strong><p>{recap.detail}</p></div><button type="button" onClick={onRules}>Full rules</button></section>
    <section className="operation-legend" aria-label="Battlefield legend"><span><i className="friendly" />friendly</span><span><i className="hostile" />hostile</span><span><i className="artifact" />artifact</span><span><i className="range" />range</span></section>
    <section className="next-phase-preview" aria-label="Next phase preview"><span>{next.label}</span><strong>{next.detail}</strong></section>
  </aside>;
}

function Status({ label, value, marker, meter, danger, caution, accent }: { label: string; value: string; marker?: string; meter?: number; danger?: boolean; caution?: boolean; accent?: boolean }) {
  return <div className={`${danger ? "danger" : caution ? "caution" : ""} ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}{marker && <span aria-hidden="true">{marker}</span>}</strong>{meter !== undefined && <i><b style={{ width: `${Math.min(100, meter * 100)}%` }} /></i>}</div>;
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
    <div role="row">
      <span role="columnheader" className="v4-board-axis" aria-label="Coordinates: x across, y down">x/y</span>
      {Array.from({ length: 10 }, (_, x) => <span role="columnheader" className="v4-board-axis" aria-label={`Column x ${x}`} key={x}>{x}</span>)}
    </div>
    {Array.from({ length: 10 }, (_, y) => <div role="row" key={y}>
    <span role="rowheader" className="v4-board-axis" aria-label={`Row y ${y}`}>{y}</span>
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
  return <section className="capacity-track" aria-label="Shared Fibonacci capacity track"><div className="capacity-track-heading"><span>SHARED CAPACITY</span><small>{artilleryActivation(view).label}</small></div><div className="capacity-slots">{view.rules.capacitySlots.map((slot) => {
    const claim = claims.get(slot.rank);
    const current = slot.rank === view.projection.capacityTrack.nextRank;
    return <div key={slot.rank} className={`capacity-slot ${claim ? "claimed" : current ? "current" : "locked"}`}><b>R{slot.rank}</b><strong>+{slot.capacityAward}</strong><small>{claim ? `${claim.playerId} · ${claim.attentionPaid}` : `${slot.cost} attention`}</small></div>;
  })}</div></section>;
}

function Armories({ view, active, selectedCardId, onCard }: { view: BattleCommandV3View; active: boolean; selectedCardId: string | null; onCard: (cardId: string) => void }) {
  const activation = artilleryActivation(view);
  if (!view.projection.capacityTrack.artilleryUnlocked) return <section className="v4-armories inactive armory-summary artillery-locked" aria-label="Public ordered armories"><div><span className="battle-kicker">ARTILLERY ARMORIES</span><strong>{activation.label}</strong></div><span className="armory-lock-detail">{activation.detail}</span></section>;
  if (!active) return <section className="v4-armories inactive armory-summary" aria-label="Public ordered armories"><div><span className="battle-kicker">ARTILLERY ARMORIES</span><strong>{activation.label}</strong></div>{view.projection.players.map((player) => <span key={player.playerId} className={player.playerId === PLAYER ? "friendly" : "hostile"}><b>{player.playerId === PLAYER ? "Yours" : "Doctrine"}</b> / cooldown {player.armory.cooldown}{player.armory.retaliationAvailable ? " / counterfire ready" : ""}</span>)}</section>;
  return <section className="v4-armories active" aria-label="Public ordered armories">
    {view.projection.players.map((player) => <div key={player.playerId} className={player.playerId === PLAYER ? "friendly" : "hostile"}><header><strong>{player.playerId === PLAYER ? "Your armory" : "Doctrine armory"}</strong><span>Cooldown {player.armory.cooldown} · {player.armory.retaliationAvailable ? "COUNTERFIRE READY" : "ordinary fire"}</span></header><div>{player.armory.cards.map((card, index) => {
      const legality = player.playerId === PLAYER ? view.legal.shellCards.find((item) => item.cardId === card.cardId) : null;
    return <button key={card.cardId} disabled={player.playerId !== PLAYER || !legality?.legal} className={selectedCardId === card.cardId ? "active" : ""} onClick={() => onCard(card.cardId)} title={legality?.reason ?? shellCopy[card.shell].detail}><small>{index + 1}</small><strong>{shellCopy[card.shell].label}</strong><span>{legality?.usesRetaliation ? "BYPASS" : legality?.reason ?? "READY"}</span></button>;
  })}</div></div>)}</section>;
}

type UnitRosterProps = {
  view: BattleCommandV3View;
  stage: Stage;
  selection: Selection | null;
  plans: Record<string, AttentionV4KineticAction[]>;
  planMode: PlanMode;
  setPlanMode: (mode: PlanMode) => void;
  append: (unit: AttentionV4UnitState, action: AttentionV4KineticAction) => void;
  clear: (unitId: string) => void;
  cancel: (unitId: string, index: number) => void;
  allocations: Record<string, Allocation>;
  setAllocation: (unitId: string, allocation: Allocation) => void;
  submitCommand: (intent: AttentionV4CommandIntent) => void;
  busy: boolean;
  onSelect: (selection: Selection) => void;
  unitArt: (unitId: string) => ArtCatalogEntry | undefined;
  inspector: ReactNode;
};

function UnitRoster({ view, stage, selection, plans, planMode, setPlanMode, append, clear, cancel, allocations, setAllocation, submitCommand, busy, onSelect, unitArt, inspector }: UnitRosterProps) {
  const own = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER);
  const ownKey = own.map((unit) => unit.unitId).join("|");
  const [focusedUnitId, setFocusedUnitId] = useState(own[0]?.unitId ?? "");
  const active = view.projection.phase === "command" && view.legal.activeCommanderId === PLAYER;
  const kinetic = stage === "kinetic" && view.projection.phase === "kinetic";
  const command = stage === "command" && view.projection.phase === "command";

  useEffect(() => {
    setFocusedUnitId((current) => {
      if (selection?.kind === "unit" && own.some((unit) => unit.unitId === selection.id)) return selection.id;
      if (own.some((unit) => unit.unitId === current)) return current;
      return own[0]?.unitId ?? "";
    });
  }, [ownKey, selection]);

  const focusUnit = (unitId: string) => {
    setFocusedUnitId(unitId);
    onSelect({ kind: "unit", id: unitId });
  };
  const focusedUnit = own.find((unit) => unit.unitId === focusedUnitId) ?? own[0];

  const renderPlan = (unit: AttentionV4UnitState) => {
    const plan = plans[unit.unitId] ?? [];
    const unitLegal = view.legal.kinetic.find((item) => item.unitId === unit.unitId);
    const planComplete = kineticPlanComplete(plan, unitLegal?.effectiveUap ?? 0);
    const planState = plan.length === 0 ? "hold" : planComplete ? "staged" : "planning";
    return <div className={`kinetic-plan-status ${planState}`} aria-label={`${planState === "hold" ? "Hold" : planState === "staged" ? "Staged" : "Planning"} for Kinetic`}>
      <span>{planState === "hold" ? "HOLD · KINETIC" : planState === "staged" ? "STAGED · KINETIC" : "PLANNING · KINETIC"}</span>
      <ol className="ordered-plan">{plan.length ? <>{plan.map((action, index) => {
        const removal = cancelKineticStep(view, unit, plan, index);
        const dependents = removal.removed.filter((step) => step !== index);
        return <li key={`${action.kind}-${index}`}><HelpTooltip className="staged-action-help" focusable={busy} content={<><strong>{busy ? "Orders locked" : `Cancel ${kineticActionLabel(action)}`}</strong><p>{busy ? "Submitted orders cannot be edited." : `Click the X to cancel and restore ${removal.removed.length} UAP before submitting Resolve Kinetic.`}</p>{!busy && dependents.length > 0 && <p>Also cancels dependent {dependents.length === 1 ? "step" : "steps"} {dependents.map((step) => `${step + 1} (${kineticActionLabel(plan[step])})`).join(", ")}, which would no longer be in reach.</p>}</>}>
          {(descriptionId) => <span className="staged-action-chip"><b>{index + 1}</b><span>{kineticActionLabel(action)}</span><button type="button" className="cancel-staged-action" aria-label={`Cancel ${kineticActionLabel(action)}, action ${index + 1} for ${unit.unitId.split(":").at(-1)}`} aria-describedby={descriptionId} disabled={busy} onClick={() => cancel(unit.unitId, index)}><span aria-hidden="true">×</span></button></span>}
        </HelpTooltip></li>;
      })}{!planComplete && <li className="placeholder"><b>{plan.length + 1}</b><span>Action open</span></li>}</> : <li className="hold"><b>0</b><span>Hold position</span></li>}</ol>
    </div>;
  };

  const renderFocusedControls = (unit: AttentionV4UnitState) => {
    const unitLegal = view.legal.kinetic.find((item) => item.unitId === unit.unitId);
    const plan = plans[unit.unitId] ?? [];
    const allocationLegal = view.legal.allocations.find((item) => item.unitId === unit.unitId)!;
    const allocation = allocations[unit.unitId] ?? { volume: allocationLegal.prefillVolume, densityPct: allocationLegal.prefillDensityPct };
    const maximum = Math.min(allocationLegal.maximumVolume, allocationLegal.maximumVolumeByDensity[String(allocation.densityPct)] ?? 0);
    const densityOptions = view.rules.allocation.densities.filter((density) => density <= allocationLegal.maximumDensityPct);
    const effectiveCalibration = unit.calibration * allocation.densityPct / 100;
    const emittedArtifacts = view.projection.artifacts.filter((artifact) => artifact.sourceUnitId === unit.unitId && artifact.newbornRound === view.projection.round);
    const pendingOutput = emittedArtifacts.filter((artifact) => artifact.resolution === "pending");
    const outputToInspect = pendingOutput[0] ?? view.projection.artifacts.find((artifact) => artifact.ownerPlayerId === PLAYER && artifact.resolution === "pending");
    const plannedCondense = plan.filter((action) => action.kind === "condense-output").length;
    const preparedOutput = view.rules.allocation.scoutCondense[plannedCondense];
    const condenseLocked = plannedCondense > 0;
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

    return <div key={`${stage}-${unit.unitId}`} className="selected-unit-phase-content">
      {kinetic && <>
        {renderPlan(unit)}
        <div className="unit-actions selected-unit-actions" aria-label={`${displayChassis(unit.chassis)} Kinetic actions`}>
          <KineticActionButton label="Move on grid" icon={"↗"} stagedCount={moveCount} active={planMode === "move"} disabled={busy || condenseLocked || remainingUap === 0} onClick={() => setPlanMode("move")} />
          {unit.chassis === "scout" && <KineticActionButton label="Condense output" icon={"◆"} stagedCount={plannedCondense} help={<CondenseHelp view={view} planned={plannedCondense} />} disabled={busy || plannedCondense >= (unitLegal?.maxCondenseSteps ?? 0) || remainingUap === 0} onClick={() => append(unit, { kind: "condense-output" })} />}
          {unit.chassis === "line" && <>
            <KineticActionButton label="Step-Up" icon={"⇧"} stagedCount={stepUpCount} help={<StepUpHelp view={view} planned={stepUpCount > 0} />} disabled={busy || stepUpCount > 0 || remainingUap === 0} onClick={() => append(unit, { kind: "step-up" })} />
            {own.filter((candidate) => candidate.chassis === "scout").map((scout) => {
              const stagedScans = scanCounts.get(scout.unitId) ?? 0;
              const targetDistance = distance(projectedPosition, scout.position);
              const scanAvailable = targetDistance <= projectedRange;
              return <KineticActionButton key={scout.unitId} label={`Scan ${scout.unitId.split(":").at(-1)}`} icon={"◎"} stagedCount={stagedScans} help={<SupportScanHelp view={view} scout={scout} projectedRange={projectedRange} targetDistance={targetDistance} stagedScans={stagedScans} scanCount={scanCount} maxScans={unitLegal?.maxSupportScans ?? 0} />} disabled={busy || remainingUap === 0 || scanCount >= (unitLegal?.maxSupportScans ?? 0) || !scanAvailable} onClick={() => append(unit, { kind: "support-scan", scoutUnitId: scout.unitId })} />;
            })}
          </>}
          {unit.chassis === "heavy" && <KineticActionButton label="Uplink" icon={"⌁"} stagedCount={uplinkCount} disabled={busy || uplinkCount > 0 || remainingUap === 0} onClick={() => append(unit, { kind: "command-uplink" })} />}
          <div className={`kinetic-range-control ${!busy && !condenseLocked && remainingUap > 0 ? "is-available" : ""} ${rangeDownCount + rangeUpCount ? "is-staged" : ""}`} role="group" aria-label={`Range shift, projected range ${projectedRange}`}>
            <span className="kinetic-action-icon" aria-hidden="true">↔</span><HelpTooltip className="kinetic-range-help" content={<RangeHelp view={view} unit={unit} projectedRange={projectedRange} projectedPosition={projectedPosition} rangeSteps={rangeDownCount + rangeUpCount} condenseLocked={condenseLocked} />}>{(descriptionId) => <span className="kinetic-action-label"><button type="button" className="help-term" aria-describedby={descriptionId}>Range</button><small>R{projectedRange}</small></span>}</HelpTooltip><span className="kinetic-action-beacon" aria-hidden="true">{rangeDownCount + rangeUpCount || ""}</span>
            <button type="button" aria-label="Decrease range" disabled={busy || condenseLocked || remainingUap === 0 || projectedRange <= (unitLegal?.range.minimum ?? 1)} onClick={() => append(unit, { kind: "range-shift", delta: -1 })}>−</button>
            <button type="button" aria-label="Increase range" disabled={busy || condenseLocked || remainingUap === 0 || projectedRange >= (unitLegal?.range.maximum ?? 5)} onClick={() => append(unit, { kind: "range-shift", delta: 1 })}>+</button>
          </div>
          <button type="button" className="kinetic-clear" disabled={busy || plan.length === 0} onClick={() => clear(unit.unitId)}>Clear plan</button>
        </div>
        {plannedCondense > 0 && <p className="condense-preview" role="status"><strong>Staged output:</strong> up to {preparedOutput.volumeCap} {preparedOutput.volumeCap === 1 ? "artifact" : "artifacts"} · {preparedOutput.densityCapPct}% density cap · {percent(preparedOutput.calibration)} calibration if the plan resolves without Smoke.</p>}
      </>}
      {command && <div className="output-allocation">
        {unit.outputDecision === "pending" ? <>
          <div className="allocation-row"><div className="allocation-fields">
            <label><HelpTooltip focusable content={<><strong>Volume · number of artifacts</strong><p>Choose how many artifacts this mech will create. Each is a separate piece of work to inspect or commit. At {allocation.densityPct}% density, this mech can create up to {maximum}.</p><p>Volume × density must fit its reactor. More output creates more work for your available Attention.</p></>}>{(id) => <span className="help-term" aria-describedby={id}>Volume</span>}</HelpTooltip><input aria-label={`Volume for ${unit.unitId}`} type="number" min="1" max={maximum} value={allocation.volume} disabled={busy} onChange={(event) => setAllocation(unit.unitId, { ...allocation, volume: Number(event.target.value) })} /></label><span>×</span>
            <label><HelpTooltip focusable content={<><strong>Density · reactor used per artifact</strong><p>Higher density puts more of the reactor into each artifact and strengthens its calibration. Density × mech calibration gives artifact calibration.</p><p>At {allocation.densityPct}% density and {percent(unit.calibration)} mech calibration, the result is {percent(effectiveCalibration)}. Base soundness stays {percent(view.rules.soundnessRate)}.</p></>}>{(id) => <span className="help-term" aria-describedby={id}>Density</span>}</HelpTooltip><select aria-label={`Density for ${unit.unitId}`} value={allocation.densityPct} disabled={busy} onChange={(event) => { const densityPct = Number(event.target.value); const cap = Math.min(allocationLegal.maximumVolume, allocationLegal.maximumVolumeByDensity[String(densityPct)] ?? 0); setAllocation(unit.unitId, { volume: Math.max(1, Math.min(allocation.volume, cap)), densityPct }); }}>{densityOptions.map((density) => <option key={density} value={density}>{density}%</option>)}</select></label>
          </div><button disabled={busy || !active || allocation.volume < 1 || allocation.volume > maximum || allocation.densityPct > allocationLegal.maximumDensityPct} className="battle-primary" onClick={() => submitCommand({ kind: "emit", playerId: PLAYER, unitId: unit.unitId, volume: allocation.volume, densityPct: allocation.densityPct })}>Emit</button><button disabled={busy || !active} onClick={() => submitCommand({ kind: "hold", playerId: PLAYER, unitId: unit.unitId })}>Hold</button></div>
          <p className="allocation-equation">{allocation.volume} × {allocation.densityPct}% = {Number((allocation.volume * allocation.densityPct / 100).toFixed(2))} / {unit.reactorRating} reactor · <ArtifactCalibrationHelp densityPct={allocation.densityPct} calibration={unit.calibration} soundnessRate={view.rules.soundnessRate} /></p>
          <p className="output-guidance">Emit creates unverified artifact diamonds now; Hold creates none. Either uses your Command turn and costs 0 Attention.</p>
        </> : <>
          <strong className={`decision ${unit.outputDecision}`}>{unit.outputDecision === "emitted" ? "Output emitted" : "Output held this round"}</strong>
          <p className="output-guidance">{unit.outputDecision === "emitted" ? `${emittedArtifacts.length} artifact${emittedArtifacts.length === 1 ? "" : "s"} created this round · ${pendingOutput.length} still pending. Inspect their quality and decide what to commit.` : "This mech creates no artifacts this round. You can still inspect and manage existing artifacts."}</p>
          {emittedArtifacts[0] && <p className="allocation-equation">{emittedArtifacts[0].densityPct}% density × {percent(emittedArtifacts[0].sourceCalibration)} source calibration · <ArtifactCalibrationHelp densityPct={emittedArtifacts[0].densityPct} calibration={emittedArtifacts[0].sourceCalibration} soundnessRate={view.rules.soundnessRate} /></p>}
          {outputToInspect && <button type="button" className="inspect-output" onClick={() => onSelect({ kind: "artifact", id: outputToInspect.artifactId })}>{pendingOutput.length ? "Inspect output" : "Inspect pending artifacts"}</button>}
        </>}
        {unit.chassis === "heavy" && unit.uplinkQueued && <p className="output-guidance">Uplink queued: +1 Attention at the next Register. It lowered this Heavy's calibration from {percent(view.rules.chassis.heavy.calibration)} to {percent(unit.calibration)} for this round.</p>}
      </div>}
      {stage === "resolution" && <div className="fleet-resolution-state"><strong className={`decision ${unit.outputDecision}`}>{unit.outputDecision === "pending" ? "NO DECISION" : unit.outputDecision}</strong><span>{unit.outputDecision === "emitted" ? "Output entered Resolution" : unit.outputDecision === "held" ? "Output held this round" : "No output was committed"}</span></div>}
      {!kinetic && !command && stage !== "resolution" && <div className="fleet-inactive-caption">{view.projection.phase === "capacity" ? "OUTPUT ACTIVE AFTER CAPACITY" : "FLEET CONTROLS ACTIVE IN KINETIC OR COMMAND"}</div>}
    </div>;
  };

  return <section className="mech-roster fleet-strip focused-fleet-strip" aria-label="Fleet command lane">
    <div className="mech-roster-heading"><div><span>FLEET COMMAND</span><strong>{stage === "resolution" ? "Round decisions" : kinetic ? "Ordered movement plans" : command ? "Output allocation" : "Fleet state"}</strong><small><HelpTooltip content={<><strong>Battery UAP · extra mech actions</strong><p>An active battery gives each friendly mech in its 3×3 field +{view.rules.battery.kineticBonus} UAP at Register, the start of a round. Fields do not stack. That round's bonus stays after moving away or committing the battery. A frozen mech still has zero usable points. Smoke leaves battery support active.</p></>}>{(descriptionId) => <button type="button" className="help-term" aria-describedby={descriptionId}>Battery UAP</button>}</HelpTooltip> is set at Register; select a portrait or board token to focus a unit.</small></div></div>
    <div className="fleet-strip-deck"><div className="fleet-command-stack"><div className="fleet-strip-scroll"><div className="mech-roster-cards" style={{ gridTemplateColumns: `repeat(${own.length}, minmax(176px, 1fr))`, minWidth: `${own.length * 176 + Math.max(0, own.length - 1) * 8}px` }}>{own.map((unit) => {
      const plan = plans[unit.unitId] ?? [];
      const unitLegal = view.legal.kinetic.find((item) => item.unitId === unit.unitId);
      const allocationLegal = view.legal.allocations.find((item) => item.unitId === unit.unitId);
      const selected = unit.unitId === focusedUnit?.unitId;
      const planComplete = kineticPlanComplete(plan, unitLegal?.effectiveUap ?? 0);
      const planState = plan.length === 0 ? "hold" : planComplete ? "staged" : "planning";
      const plannedCondense = plan.filter((action) => action.kind === "condense-output").length;
      const condenseMode = view.rules.allocation.scoutCondense[kinetic ? plannedCondense : unit.condenseSteps];
      const mobility = unit.uap.freezeSources.length ? unit.uap.freezeSources.join(" + ") : unit.uap.nextFreezeSources.length ? `Next: ${unit.uap.nextFreezeSources.join(" + ")}` : "Mobile";
      const capability = unit.chassis === "scout" ? `Condense ${kinetic ? plannedCondense : unit.condenseSteps}/2 · ${kinetic ? "staged " : ""}cap ${kinetic ? condenseMode.volumeCap : allocationLegal?.maximumVolume ?? 0}@${kinetic ? condenseMode.densityCapPct : allocationLegal?.maximumDensityPct ?? 0}%` : unit.chassis === "line" ? "Step-Up / Scan" : unit.uplinkQueued ? "Uplink queued" : "Uplink idle";
      const portrait = unitArt(unit.unitId);
      return <article key={unit.unitId} aria-current={selected ? "true" : undefined} data-plan-state={kinetic ? planState : undefined} className={`v4-unit-card compact-unit-card ${selected ? "selected" : ""} ${plan.length ? "has-staged-plan" : ""} ${unit.uap.frozen ? "frozen" : ""}`}>
        <button type="button" className="compact-unit-select" aria-label={`Select ${displayChassis(unit.chassis)} unit ${unit.unitId.split(":").at(-1)}`} aria-pressed={selected} onClick={() => focusUnit(unit.unitId)}>
          <span className="compact-unit-portrait">{portrait ? <img src={portrait.cardSrc} alt="" /> : <span className={`unit-portrait-fallback art-mech-${unit.chassis === "heavy" ? "siege" : unit.chassis}`}><b>{unitCode(unit.chassis)}</b></span>}</span>
          <span className="fleet-card-summary"><span><b>{displayChassis(unit.chassis)} <small>{unit.unitId.split(":").at(-1)}</small></b><strong>{percent(unit.calibration)} CAL</strong></span><span>R{unit.activeRange} · reactor {unit.reactorRating} · {unit.uap.frozen ? "0 FROZEN" : `${kinetic ? `${Math.max(0, unit.uap.effective - plan.length)}/${unit.uap.effective}` : unit.uap.effective} UAP`}</span><small>{mobility} · {capability}</small></span>
        </button>
        <span className="unit-selection-indicator" aria-hidden="true" />
      </article>;
    })}</div></div>
    {focusedUnit && <section className="selected-unit-command" aria-label="Selected unit command" onClickCapture={() => focusUnit(focusedUnit.unitId)}>{renderFocusedControls(focusedUnit)}</section>}
    </div>{inspector}</div>
  </section>;
}

function artifactName(id: string) { const parts = id.split(":"); const ordinal = Number(parts.at(-1)); return `${parts.at(-2) ?? "Artifact"} · artifact ${Number.isFinite(ordinal) ? ordinal + 1 : parts.at(-1)}`; }
function hazardLabel(reason: string) { return reason === "context-limit" ? "Context limit exceeded" : reason === "local-traffic" ? "Traffic limit exceeded" : reason.replaceAll("-", " "); }

function ArtifactPanel({ view, artifact, submit, busy, interactive }: { view: BattleCommandV3View; artifact?: AttentionV4ProjectedArtifact; submit: (intent: AttentionV4CommandIntent) => void; busy: boolean; interactive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setExpanded(Boolean(artifact)); }, [artifact?.artifactId]);
  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"], [role="tooltip"]:not([hidden])')) return;
      event.preventDefault();
      setExpanded(false);
      requestAnimationFrame(() => toggleRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);
  if (!artifact) return <section className="selection-panel empty compact-inspector is-collapsed" aria-label="Context inspector"><span className="battle-kicker">CONTEXT INSPECTOR</span><p>{interactive ? "Select a friendly diamond on the board or an artifact above. Inspect its confidence, then Verify, Accept, Reject, or Seize." : "Select an artifact to inspect quality, risk and battery support."}</p></section>;
  const source = view.projection.units.find((unit) => unit.unitId === artifact.sourceUnitId);
  const legal = view.legal.artifacts.find((item) => item.artifactId === artifact.artifactId);
  const hazard = view.legal.projectedHazards.find((item) => item.artifactId === artifact.artifactId);
  const own = artifact.ownerPlayerId === PLAYER;
  const active = interactive && view.legal.activeCommanderId === PLAYER;
  const title = artifactName(artifact.artifactId);
  return <><section className="selection-panel v4-artifact-panel compact-inspector" aria-label="Context inspector"><span className="battle-kicker">CONTEXT INSPECTOR</span><h2>{title}</h2><p>{percent(artifact.reportedConfidence)} confidence · {artifact.verified ? "verified" : artifact.resolution === "pending" ? "pending" : artifact.resolution}</p><button ref={toggleRef} type="button" aria-expanded={expanded} aria-controls="context-inspector-details" aria-label={expanded ? "Collapse context inspector" : "Expand context inspector"} onClick={() => setExpanded((current) => !current)}>{expanded ? "Collapse details" : "Expand details"}</button></section>
  {expanded && <section id="context-inspector-details" className="inspector-expansion v4-artifact-panel" aria-label="Context inspector details"><header><div><span className="battle-kicker">{own ? "FRIENDLY" : "HOSTILE"} ARTIFACT</span><h2>{title}</h2></div><strong>{percent(artifact.reportedConfidence)} confidence</strong></header>
    <div className="artifact-metrics"><Metric label="Density" value={`${artifact.densityPct}%`} /><Metric label="Source calibration" value={percent(artifact.sourceCalibration)} /><Metric label="Effective D×C" value={percent(artifact.effectiveCalibration)} /><Metric label="Age / CL" value={`${artifact.age} / ${artifact.contextLimit}`} /><Metric label="Traffic / safe limit" value={`${artifact.localTraffic} / ${view.rules.trafficLimit}`} /><Metric label="Truth" value={artifact.revealedSound === null ? "hidden" : artifact.revealedSound ? "sound" : "unsound"} /></div>
    <p>From {source ? displayChassis(source.chassis) : "unknown unit"} at {artifact.position.x},{artifact.position.y}. {artifact.objectiveEligible ? "Inside its active objective front." : "Outside its active objective front."}</p>
    {artifact.battery.active && <div className={`battery-banner ${artifact.battery.suppressed ? "suppressed" : ""}`}><strong>{artifact.battery.suppressed ? "BATTERY SUPPRESSED" : "ACTIVE BATTERY"}</strong><span>3×3 field · +1 next-Register UAP · −1 Verify/Seize on other artifacts</span></div>}
    {hazard && <div className="detonation-warning" role="alert"><strong>PROJECTED DRIFT DETONATION</strong><span>{hazard.reasons.map(hazardLabel).join(" + ")} · +{hazard.drift} Drift · freezes {hazard.frozenUnitIds.length} friendly unit(s)</span></div>}
    <p className="artifact-explanation">Reported confidence is a noisy signal, not revealed truth. Effective calibration is density × source calibration; higher values make that signal more informative. Verify reveals whether this artifact is sound and protects it from age and traffic detonation.</p>
    {own && artifact.resolution === "pending" && <div className="artifact-actions">
      <ArtifactAction label={`Verify · ${legal?.verify.cost.total ?? view.rules.verifyCost}${legal?.verify.cost.batteryDiscount ? " (Battery)" : ""}`} disabled={busy || !interactive || !legal?.verify.legal} onClick={() => submit({ kind: "verify", playerId: PLAYER, artifactId: artifact.artifactId })} help={<><strong>Verify · {legal?.verify.cost.total ?? view.rules.verifyCost} Attention</strong><p>Reveal truth, stop aging and rescue this artifact from age or traffic detonation. It stays pending. A friendly mech must be in verification range or have a reserved Scan.</p><p>{legal?.batteryEligibleOnVerify ? `Can become a Battery if sound or guaranteed: density at least ${view.rules.battery.minimumDensityPct}% and source calibration at least ${percent(view.rules.battery.minimumCalibration)}.` : "This artifact does not currently meet Battery requirements."}{legal?.verify.cost.batteryDiscount ? ` Battery support saves ${legal.verify.cost.batteryDiscount} Attention.` : ""}</p>{legal?.verify.reason && <p>Unavailable: {availabilityReason(legal.verify.reason)}.</p>}</>} />
      <ArtifactAction label="Accept" disabled={busy || !active} onClick={() => submit({ kind: "accept", playerId: PLAYER, artifactId: artifact.artifactId })} help={<><strong>Accept · 0 Attention</strong><p>Commit this artifact. At Resolution: sound or guaranteed output earns {artifact.objectiveEligible ? "+1 Progress" : "no Progress outside its objective front"}; unsound output adds +1 Drift. {artifact.battery.active ? "Its Battery support ends immediately." : "It leaves persistent context."}</p></>} />
      <ArtifactAction label="Reject" disabled={busy || !active} onClick={() => submit({ kind: "reject", playerId: PLAYER, artifactId: artifact.artifactId })} help={<><strong>Reject · 0 Attention</strong><p>Discard this artifact with no Progress or Drift. It cannot detonate at Resolution.{artifact.battery.active ? " Its Battery support ends immediately." : ""}</p></>} />
      <ArtifactAction label={`Seize · ${legal?.seize.cost.total ?? source?.reactorRating ?? 1}`} disabled={busy || !interactive || !legal?.seize.legal} onClick={() => submit({ kind: "seize", playerId: PLAYER, artifactId: artifact.artifactId })} help={<><strong>Seize · {legal?.seize.cost.total ?? source?.reactorRating ?? 1} Attention</strong><p>Guarantee a safe commitment regardless of hidden truth. At Resolution: {artifact.objectiveEligible ? "+1 Progress" : "no Progress outside its objective front"}, no Drift.{artifact.battery.active ? " Its Battery support ends immediately." : ""}</p><p>Base {legal?.seize.cost.base ?? source?.reactorRating ?? 1} − Battery {legal?.seize.cost.batteryDiscount ?? 0} − Overclock {legal?.seize.cost.overclockDiscount ?? 0} = {legal?.seize.cost.total ?? source?.reactorRating ?? 1} Attention.</p>{legal?.seize.reason && <p>Unavailable: {availabilityReason(legal.seize.reason)}.</p>}</>} />
      <ArtifactAction label="Perfect Focus" disabled={busy || !interactive || !view.legal.abilities.perfectFocus.ready || artifact.guarantee !== null} onClick={() => submit({ kind: "perfect-focus", playerId: PLAYER, artifactId: artifact.artifactId })} help={<><strong>Perfect Focus · 0 Attention</strong><p>Guarantee a sound result when this artifact is accepted. It stays pending; Focus alone does not verify it or stop age and traffic detonation.</p><p>{view.legal.abilities.perfectFocus.usesRemaining} uses left · {view.rules.abilities.perfectFocus.cooldownRounds}-round cooldown. {artifact.guarantee ? "This artifact is already guaranteed." : view.legal.abilities.perfectFocus.reason ? `Unavailable: ${availabilityReason(view.legal.abilities.perfectFocus.reason)}.` : "Ready to use."}</p></>} />
    </div>}
  </section>}</>;
}

function availabilityReason(reason: string) {
  return ({ attention: "not enough Attention", "out-of-range": "no verifier in range", "not-active-commander": "wait for your Command turn", "already-verified": "already verified", "capacity-rank-required": "claim the required Capacity rank first", cooldown: "ability is cooling down", "uses-exhausted": "no uses remaining", "wrong-phase": "available during Command" } as Record<string, string>)[reason] ?? reason.replaceAll("-", " ");
}

function ArtifactAction({ label, help, disabled, onClick }: { label: string; help: ReactNode; disabled: boolean; onClick: () => void }) {
  return <HelpTooltip content={help} className="artifact-action-help" focusable={disabled}>{(id) => <button type="button" aria-describedby={id} disabled={disabled} onClick={onClick}><span className="help-term">{label}</span></button>}</HelpTooltip>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ArtifactTray({ view, selection, onSelect, boardView, onBoardView }: { view: BattleCommandV3View; selection: Selection | null; onSelect: (selection: Selection) => void; boardView: "perspective" | "tactical"; onBoardView: (value: "perspective" | "tactical") => void }) {
  const artifacts = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending").sort((left, right) => left.ownerPlayerId.localeCompare(right.ownerPlayerId) || left.artifactId.localeCompare(right.artifactId));
  return <section className="artifact-tray context-bar" aria-label="Persistent context">
    <div className="context-label"><span>PERSISTENT CONTEXT</span><strong>{artifacts.length}</strong></div>
    <div className="artifact-pieces">{artifacts.map((artifact) => <button key={artifact.artifactId} type="button" aria-pressed={selection?.kind === "artifact" && selection.id === artifact.artifactId} aria-label={`${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} artifact ${artifact.artifactId}, ${percent(artifact.reportedConfidence)} confidence, age ${artifact.age} of ${artifact.contextLimit}${artifact.verified ? ", verified" : ""}`} className={`artifact-piece ${artifact.ownerPlayerId === PLAYER ? "friendly" : "hostile"} ${artifact.verified ? "verified" : ""} ${selection?.kind === "artifact" && selection.id === artifact.artifactId ? "selected" : ""}`} onClick={() => onSelect({ kind: "artifact", id: artifact.artifactId })}><span><i />{unitCode(artifact.sourceChassis)}{artifact.battery.active ? <b>B</b> : null}</span><strong>{percent(artifact.reportedConfidence)} confidence{artifact.verified ? " ✓" : ""}</strong><small>{artifact.densityPct}% density · {percent(artifact.effectiveCalibration)} D×C</small><small>Age {artifact.age}/{artifact.contextLimit} · Traffic {artifact.localTraffic}{artifact.battery.active ? " · Battery" : ""}</small></button>)}{artifacts.length === 0 && <p>No pending artifacts. Emit output during Command to create them.</p>}</div>
    <div className="context-tools"><HelpTooltip content={<><strong>Base soundness · {percent(view.rules.soundnessRate)}</strong><p>The underlying chance that newly generated output is sound. An artifact's reported confidence is a noisy signal; density and calibration affect how informative that signal is. Verify reveals the actual result.</p></>}>{(id) => <button type="button" className="help-term base-rate" aria-describedby={id}>Base soundness <b>{percent(view.rules.soundnessRate)}</b></button>}</HelpTooltip><div className="board-view-switch" role="group" aria-label="Battlefield view"><button type="button" aria-pressed={boardView === "perspective"} onClick={() => onBoardView("perspective")}>Perspective</button><button type="button" aria-pressed={boardView === "tactical"} onClick={() => onBoardView("tactical")}>Tactical 2D</button></div></div>
  </section>;
}

function eventLabel(type: string) { const words = type.replace(/^attention\.v[0-9]+\./, "").replaceAll(".", " ").replaceAll("-", " "); return words.charAt(0).toUpperCase() + words.slice(1); }

function EventTicker({ view }: { view: BattleCommandV3View }) {
  const items = view.events.filter((item) => !item.eventType.includes("phase.")).slice(-5).reverse();
  const announcement = items.length ? `${items.length} updates. ${items.map((item) => eventLabel(item.eventType)).join(", ")}` : "No recent updates";
  return <section className="event-ticker"><span>RECENT RESOLUTION</span>{items.map((item) => <div key={item.eventId}><b>{eventLabel(item.eventType)}</b><small>{item.actorId?.split(":").at(-1) ?? "Round update"}</small></div>)}<p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p></section>;
}

function Rules({ view, onClose }: { view: BattleCommandV3View; onClose: () => void }) {
  return <Modal title="Attention-economy reference" onClose={onClose}>
    <p><strong>{view.rules.rulesetVersion}</strong> · {view.rules.resolverVersion}</p>
    <h3>Fleet weight</h3>
    <p>Every fleet spends exactly 6 weight: Scout 1, Line 2, Heavy 3. Fleets contain 3–5 units, at most one Heavy, and at most four Scouts.</p>
    <h3>Kinetic actions</h3>
    <p>Move, Step-Up, and each +1 or -1 range shift cost 1 UAP. Combine actions within the mech's budget. Range changes preserve calibration; the Line's Step-Up raises it to 85%.</p>
    <h3>Output</h3>
    <p><strong>Scout:</strong> 3 UAP · reactor 3 · 20% calibration · range 2.<br />Condense output up to twice after movement for fewer, denser artifacts with higher calibration.</p>
    <p><strong>Line:</strong> 2 UAP · reactor 2 · 60% calibration · range 3.<br />Step-Up raises calibration to 85%. Support Scan reserves remote verification for a new Scout artifact.</p>
    <p><strong>Heavy:</strong> 1 UAP · reactor 1 · 90% calibration · range 4.<br />Uplink queues +1 Attention at the next Register and lowers calibration to 20%.</p>
    <p><strong>Condense output:</strong><br />0 steps: up to 3 artifacts · 20% density cap · 20% calibration.<br />1 step: up to 2 artifacts · 60% density cap · 65% calibration.<br />2 steps: up to 1 artifact · 90% density cap · 85% calibration.</p>
    <p>Confirm an integer volume and 5-point density within the projected caps. Effective calibration is density × current calibration.</p>
    <h3>Persistent context</h3>
    <p>Scout, Line, and Heavy Context Limits are 1, 2, and 3. Only unverified pending artifacts age. The fourth successful UAP action in a 3×3 artifact field marks it over-taxed. Verify before Resolution to rescue it.</p>
    <h3>Batteries</h3>
    <p>A verified pending artifact becomes a Battery at density ≥80%, generation calibration ≥80%, and a sound or Perfect-Focus-guaranteed result. Fields do not stack. Smoke affects mechs; battery support continues.</p>
    <h3>Artillery</h3>
    <p><strong>Activation:</strong> Players spend Attention to claim shared Capacity ranks 1, 2, and 3, costing 1, 2, and 3 respectively. Only one rank can be claimed per round. Rank 3 activates artillery for both fleets at the next Register, as early as round 4. If neither player advances Capacity, artillery stays locked.</p>
    <p><strong>Counterfire:</strong> Each shot spends one card and starts a {view.rules.abilities.artillery.cooldown}-round cooldown. Ordinary fire grants the opponent one cooldown bypass for the next salvo. That privilege expires after that salvo. A shot using the bypass does not grant another counterfire privilege.</p>
    <ul>{view.rules.artillery.shells.map((shell) => <li key={shell}><strong>{shellCopy[shell].label}:</strong> {shellCopy[shell].detail}</li>)}</ul>
    <h3>Terminal order</h3>
    <p>Four Drift defeats twelve Progress for an individual player. Bilateral terminal effects apply together, then compare Progress, lower Drift, and remaining Attention.</p>
  </Modal>;
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
    return <section className="phase-dock terminal" aria-label="Phase actions"><span className="battle-kicker">OPERATION COMPLETE · {view.projection.terminalReason?.replaceAll("-", " ")}</span><strong>{view.projection.winnerPlayerId === PLAYER ? "Victory secured" : view.projection.winnerPlayerId ? `${view.rules.opponentLabel} prevailed` : "Exact draw"}</strong><div className="terminal-comparison">{view.projection.players.map((player) => <span key={player.playerId}><strong>{player.playerId === PLAYER ? "You" : view.rules.opponentLabel}</strong> · {player.progress} Progress · {player.drift} Drift · {player.attention} Attention</span>)}</div><button className="battle-secondary" onClick={newOperation}>New operation</button></section>;
  }
  if (view.projection.phase === "kinetic") {
    const own = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER);
    const queued = own.reduce((sum, unit) => sum + (plans[unit.unitId]?.length ?? 0), 0);
    const complete = own.filter((unit) => kineticPlanComplete(plans[unit.unitId] ?? [], view.legal.kinetic.find((item) => item.unitId === unit.unitId)?.effectiveUap ?? 0)).length;
    return <section className="phase-dock" aria-label="Phase actions"><div><span className="battle-kicker">SIMULTANEOUS KINETIC</span><strong>{queued} ordered actions · {own.filter((unit) => !(plans[unit.unitId]?.length)).length} holding</strong><small>Units without staged actions will hold. Resolve Kinetic submits every unit’s plan together.</small></div><div className="dock-actions"><button className="battle-primary" disabled={busy} onClick={() => submit({ phase: "kinetic", plans: own.map((unit) => ({ unitId: unit.unitId, actions: plans[unit.unitId] ?? [] })) })}>Resolve Kinetic</button></div></section>;
  }
  if (view.projection.phase === "artillery") {
    if (!view.projection.capacityTrack.artilleryUnlocked) {
      const activation = artilleryActivation(view);
      return <section className="phase-dock" aria-label="Phase actions"><div><span className="battle-kicker">SIMULTANEOUS ARTILLERY</span><strong>{activation.label}</strong><small>{activation.detail} Pass this salvo to reach Capacity.</small></div><div className="dock-actions"><button className="battle-primary" disabled={busy} onClick={() => submit({ phase: "artillery", cardId: null })}>Pass</button></div></section>;
    }
    const card = view.projection.players.find((player) => player.playerId === PLAYER)!.armory.cards.find((item) => item.cardId === selectedCardId);
    const legalCard = view.legal.shellCards.find((item) => item.cardId === selectedCardId);
    const preview = target && selectedCardId ? view.legal.artilleryPreviews.find((item) => item.cardId === selectedCardId && item.center.x === target.x && item.center.y === target.y) : null;
    return <section className="phase-dock artillery-dock" aria-label="Phase actions"><div><span className="battle-kicker">SIMULTANEOUS ARTILLERY</span><strong>{card ? `${shellCopy[card.shell].label} · ${target ? `${target.x},${target.y}` : "choose target"}` : "Choose a card or Pass"}</strong>{card && <small>{shellCopy[card.shell].detail}</small>}<small>1 card · cooldown {view.rules.abilities.artillery.cooldown}. {legalCard?.usesRetaliation ? "Counterfire bypasses your cooldown and grants no further counterfire." : "Ordinary fire grants your opponent one cooldown bypass next salvo."}</small></div><div className="impact-preview"><span>EXACT SERVER PREVIEW</span><strong>{preview ? `${preview.affectedUnitIds.length} units · ${preview.affectedArtifactIds.length} artifacts · ${preview.affectedBatteryIds.length} Batteries` : "No target selected"}</strong><small>{preview?.blockedByScreenIds.length ? `Blocked by ${preview.blockedByScreenIds.length} hostile Chaff screen(s)` : "No hostile screen at center"}</small></div><div className="dock-actions"><button disabled={busy} onClick={() => submit({ phase: "artillery", cardId: null })}>Pass</button><button className="battle-primary" disabled={busy || !legalCard?.legal || !target} onClick={() => submit({ phase: "artillery", cardId: selectedCardId, center: target ?? undefined })}>Fire card</button></div></section>;
  }
  if (view.projection.phase === "capacity") return <section className="phase-dock capacity-dock" aria-label="Phase actions"><CapacityTrack view={view} /><div><span className="battle-kicker">COMMAND OPEN · CAPACITY CLAIM</span><strong>{view.legal.capacity.available ? `Rank ${view.legal.capacity.rank}: ${view.legal.capacity.cost} Attention → +${view.legal.capacity.award} each round` : "Track complete"}</strong><small>One shared rank per round. Both players can claim; first priority rotates.{view.legal.capacity.rank === view.rules.abilities.artillery.unlockRank ? " This claim activates both fleets' artillery at the next Register." : ""}</small></div><div className="dock-actions"><button disabled={busy} onClick={() => submit({ phase: "capacity", claim: false })}>Pass</button><button className="battle-primary" disabled={busy || !view.legal.capacity.affordable} onClick={() => submit({ phase: "capacity", claim: true })}>Claim</button></div></section>;
  const self = view.projection.players.find((player) => player.playerId === PLAYER)!;
  const pending = view.projection.units.filter((unit) => unit.ownerPlayerId === PLAYER && unit.outputDecision === "pending").length;
  const pendingArtifacts = view.projection.artifacts.filter((artifact) => artifact.ownerPlayerId === PLAYER && artifact.resolution === "pending").length;
  return <section className="phase-dock" aria-label="Phase actions"><div><span className="battle-kicker">ALTERNATING COMMAND</span><strong>{view.legal.activeCommanderId === PLAYER ? "Your turn" : "Opponent resolving"} · {self.attention} Attention · {pending ? `${pending} mech${pending === 1 ? "" : "s"} awaiting Emit or Hold` : "All mechs have output decisions"}</strong><small>{pendingArtifacts} friendly artifact{pendingArtifacts === 1 ? "" : "s"} still pending. End Command resolves committed work after both players finish. Pending work carries over unless it detonates.</small></div><div className="dock-actions"><button disabled={busy || !view.legal.abilities.overclock.ready} onClick={() => submit({ phase: "command", intent: { kind: "overclock", playerId: PLAYER } })}>Overclock · −1 Seize</button><button className="battle-primary" disabled={busy || !view.legal.canEndCommand} onClick={openEndRisk}>End Command</button></div></section>;
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
  const [planNotice, setPlanNotice] = useState("");
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
  const [uiScale, updateUiScale] = useInterfaceScale();
  const friendOrdersLocked = Boolean(friendMatchId && experience?.submitted && view?.projection.phase === "kinetic");



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
    setPlanNotice("");
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

  function cancel(unitId: string, index: number) {
    if (!view || view.projection.phase !== "kinetic" || busy || friendOrdersLocked || resolutionPresentation) return;
    const unit = view.projection.units.find((candidate) => candidate.unitId === unitId && candidate.ownerPlayerId === PLAYER);
    const plan = plans[unitId] ?? [];
    if (!unit || !plan[index]) return;
    const removal = cancelKineticStep(view, unit, plan, index);
    setPlans((current) => ({ ...current, [unitId]: removal.actions }));
    setPlanNotice(`Canceled ${removal.removed.map((step) => kineticActionLabel(plan[step])).join(" and ")}. ${removal.removed.length} UAP restored to ${displayChassis(unit.chassis)}.`);
    setSelection({ kind: "unit", id: unitId });
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
    <span role="status" className="sr-only">{planNotice}</span>
    <header className="battle-header command-deck-header"><div className="command-deck-brand"><p className="battle-kicker">CONTEXT LANDSCAPE · BATTLE COMMAND</p><h1>{view.rules.scenarioLabel}</h1></div><PhaseStepper view={surfaceView} active={activeStage} /><nav className="battle-nav" aria-label="Context Landscape views"><div className="battle-nav-primary"><a href={appHref("view=hangar")}>Fleet Hangar</a><a href={appHref("view=atlas")}>Evidence Atlas</a></div><details className="battle-more"><summary>More</summary><div><div className="mobile-nav-utilities"><a href={appHref("view=hangar")}>Fleet Hangar</a><a href={appHref("view=atlas")}>Evidence Atlas</a><InterfaceScale value={uiScale} onChange={updateUiScale} /></div><a href={appHref("view=legacy")}>Research Scenarios</a><a href={appHref("view=commander")}>Commander Projection</a>{!friendMatchId && <button type="button" onClick={() => setBriefing(true)}>Briefing</button>}</div></details><div className="battle-nav-scale"><InterfaceScale value={uiScale} onChange={updateUiScale} /></div><button className="battle-secondary" onClick={newOperation}>New operation</button></nav></header>
    {error && <div className="battle-toast error" role="alert">{error}</div>}
    {experience && <div className={`friend-match-status ${waiting ? "waiting" : "ready"}`} role="status"><div><span>FRIEND OPERATION · {experience.status.toUpperCase()}</span><strong>{waiting ? "Orders locked — waiting for your opponent" : experience.status === "conceded" ? experience.winnerSeat === PLAYER ? "Opponent conceded" : "Operation conceded" : view.projection.phase === "terminal" ? "Operation complete" : "Live and resumable"}</strong></div><div className="friend-fleet-identities">{experience.fleets.alpha && fleetPlate(experience.fleets.alpha, "Your command")}{experience.fleets.bravo && fleetPlate(experience.fleets.bravo, "Opposing command")}</div><a href={appHref("view=hangar")}>Hangar</a>{experience.status === "active" && view.projection.phase !== "terminal" && <button onClick={() => void requestJson(`/api/battle-command/friend-matches/${view.projection.matchId}/concede`, { method: "POST", headers: csrfToken ? { "x-csrf-token": csrfToken } : {} }).then(() => window.location.reload())}>Concede</button>}</div>}
    <section className="battle-layout">
      <OperationRail view={surfaceView} active={activeStage} resolution={resolutionPresentation ?? undefined} onRules={() => setRulesOpen(true)} />
      <div className={`board-column command-deck-board phase-${activeStage}`}>
        <div className="battle-workspace"><ArtifactTray view={surfaceView} selection={selection} onSelect={setSelection} boardView={boardView} onBoardView={changeBoardView} />
        <div className={`battle-board-surface ${boardLocked ? "read-only" : ""}`}>{boardView === "perspective" ? <PerspectiveBoard view={surfaceView} selection={selection} onSelect={setSelection} target={target} onCell={handleCell} plannedPlans={plannedPlans} readOnly={boardLocked} unitArt={(unitId) => unitArtFor(unitId)?.cardSrc} battlefieldArt={battlefieldArt} uiScale={UI_SCALE_FACTOR[uiScale]} /> : <Board view={surfaceView} selection={selection} onSelect={setSelection} selectedCardId={selectedCardId} target={target} onCell={handleCell} plannedPlans={plannedPlans} readOnly={boardLocked} />}</div>
        <Armories view={surfaceView} active={!resolutionPresentation && surfaceView.projection.phase === "artillery"} selectedCardId={selectedCardId} onCard={(cardId) => { setSelectedCardId(cardId); setTarget(null); }} />
        <UnitRoster view={fleetView} stage={activeStage} selection={selection} plans={plans} planMode={planMode} setPlanMode={(mode) => { setPlanMode(mode); changeBoardView("tactical"); }} append={append} clear={clear} cancel={cancel} allocations={allocations} setAllocation={(unitId, allocation) => setAllocations((current) => ({ ...current, [unitId]: allocation }))} submitCommand={(intent) => void submit({ phase: "command", intent })} busy={commandBusy || friendOrdersLocked || Boolean(resolutionPresentation)} onSelect={setSelection} unitArt={unitArtFor} inspector={<ArtifactPanel view={surfaceView} artifact={selectedArtifact} submit={(intent) => void submit({ phase: "command", intent })} busy={commandBusy} interactive={!resolutionPresentation && surfaceView.projection.phase === "command"} />} />
        <EventTicker view={view} /></div>
        <PhaseDock view={view} plans={plans} selectedCardId={selectedCardId} target={target} submit={(submission) => void submit(submission)} busy={commandBusy} openEndRisk={() => setEndRiskOpen(true)} newOperation={newOperation} resolution={resolutionPresentation ?? undefined} continueResolution={() => { setResolutionPresentation(null); setSelection(null); }} />
      </div>
    </section>
    {rulesOpen && <Rules view={view} onClose={() => setRulesOpen(false)} />}
    {endRiskOpen && <Modal title="End Command risk check" onClose={() => setEndRiskOpen(false)} actions={<><button onClick={() => setEndRiskOpen(false)}>Keep commanding</button><button className="battle-primary" disabled={busy} onClick={() => void submit({ phase: "command", intent: { kind: "end-command", playerId: PLAYER } })}>Confirm End</button></>}><p>Pending artifacts persist. The following unverified hazards will detonate during the automatic Resolution unless stabilized now.</p>{view.legal.projectedHazards.filter((item) => item.ownerPlayerId === PLAYER).length ? <ul className="risk-list">{view.legal.projectedHazards.filter((item) => item.ownerPlayerId === PLAYER).map((item) => <li key={item.artifactId}><strong>{artifactName(item.artifactId)}</strong><span>{item.reasons.map(hazardLabel).join(" + ")} · +{item.drift} Drift · freezes {item.frozenUnitIds.length} friendly mech(s)</span></li>)}</ul> : <p className="safe-recap">No friendly Drift Detonations are projected.</p>}</Modal>}
  </main>;
}
