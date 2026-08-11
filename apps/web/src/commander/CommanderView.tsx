import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadBattleFixture, loadStrategicFixture } from "./api.js";
import { BattleVolumeCanvas } from "./BattleVolumeCanvas.js";
import {
  clamp,
  clampBattleAxis,
  clampBattleLayer,
  formatBattle,
  formatStrategic,
  panCamera,
  strategicChunk,
  strategicLod
} from "./coordinates.js";
import { allegianceLabel, createBattleFixture, strategicFixture } from "./fixture.js";
import { LayerRail } from "./LayerRail.js";
import {
  STRATEGIC_WORLD_SIZE,
  type BattleFixture,
  type BattleSelection,
  type StrategicCamera,
  type StrategicPoint,
  type StrategicSelection
} from "./model.js";
import { StrategicCanvas } from "./StrategicCanvas.js";
import "./commander.css";

const defaultCamera: StrategicCamera = { center: { x: 3_200, y: 3_200 }, zoom: 0.09 };

function finiteQueryNumber(search: URLSearchParams, name: string): number | null {
  const raw = search.get(name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialState() {
  const search = new URLSearchParams(window.location.search);
  const x = finiteQueryNumber(search, "x");
  const y = finiteQueryNumber(search, "y");
  const zoom = finiteQueryNumber(search, "zoom");
  const requestedBattle = search.get("battle");
  return {
    camera: {
      center: {
        x: x === null ? defaultCamera.center.x : clamp(x, 0, STRATEGIC_WORLD_SIZE - 1),
        y: y === null ? defaultCamera.center.y : clamp(y, 0, STRATEGIC_WORLD_SIZE - 1)
      },
      zoom: zoom === null ? defaultCamera.zoom : clamp(zoom, 0.035, 36)
    },
    battleId: requestedBattle?.trim() || null,
    layer: clampBattleLayer(finiteQueryNumber(search, "z") ?? 10)
  };
}

function selectBusyLayer(battle: BattleFixture): number {
  return [...battle.layers].sort((left, right) =>
    (right.friendly + right.enemy + right.artifacts + right.activity) -
    (left.friendly + left.enemy + left.artifacts + left.activity) || left.z - right.z
  )[0]?.z ?? 0;
}

function eventTargetsInteractiveControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("button, a, input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='option'], [contenteditable='true']") !== null;
}

function AttentionPips({ available, capacity }: { available: number; capacity: number }) {
  return <span className="attention-pips" aria-label={`${available} of ${capacity} attention available`}>
    {Array.from({ length: capacity }, (_, index) => <i key={index} className={index < available ? "available" : "spent"} />)}
  </span>;
}

function Metric({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return <div className="commander-metric"><span>{label}</span>{children ?? <strong>{value}</strong>}</div>;
}

function StrategicInspector({
  fixture,
  selection,
  onOpenBattle
}: {
  fixture: typeof strategicFixture;
  selection: StrategicSelection | null;
  onOpenBattle: (battleId: string) => void;
}) {
  if (!selection) return <div className="commander-empty">
    <strong>No strategic selection</strong>
    <p>Select a contact or coordinate. Double-click a battle marker to enter its operational volume.</p>
  </div>;
  if (selection.kind === "battle") {
    const battle = fixture.battles.find((candidate) => candidate.battleId === selection.battleId);
    if (!battle) return null;
    return <>
      <span className="inspector-kicker">BATTLE · {battle.status}</span>
      <h2>{battle.label}</h2>
      <dl>
        <dt>Anchor</dt><dd>{formatStrategic(battle.anchor)}</dd>
        <dt>Volume</dt><dd>32 × 32 × 32</dd>
        {battle.round !== undefined && <><dt>Round</dt><dd>{battle.round}</dd></>}
        {battle.observedTick !== undefined && <><dt>Observed tick</dt><dd>{battle.observedTick}</dd></>}
        <dt>Intensity</dt><dd>{Math.round(battle.intensity * 100)}%</dd>
        <dt>Attention demand</dt><dd>{battle.attentionDemandKind === "points" ? battle.attentionDemand : `${Math.round(battle.attentionDemand * 100)}%`}</dd>
        {battle.friendlyStrength !== undefined && <><dt>Friendly strength</dt><dd>{battle.friendlyStrength}</dd></>}
        {battle.enemyStrength && <><dt>Opposition estimate</dt><dd>{battle.enemyStrength.minimum}–{battle.enemyStrength.maximum}</dd></>}
        {battle.uncertainty !== undefined && <><dt>Uncertainty</dt><dd>{Math.round(battle.uncertainty * 100)}%</dd></>}
      </dl>
      <button className="primary commander-open" type="button" onClick={() => onOpenBattle(battle.battleId)}>Enter battle volume</button>
    </>;
  }
  if (selection.kind === "contact") {
    const contact = fixture.contacts.find((candidate) => candidate.contactId === selection.contactId);
    if (!contact) return null;
    return <>
      <span className="inspector-kicker">{allegianceLabel(contact.allegiance)} · {contact.kind}</span>
      <h2>{contact.label}</h2>
      <dl>
        <dt>Estimate</dt><dd>{formatStrategic(contact.at)}</dd>
        <dt>Confidence</dt><dd>{Math.round(contact.confidence * 100)}%</dd>
        <dt>Uncertainty</dt><dd>±{contact.uncertaintyRadius} cells</dd>
        <dt>Observation age</dt><dd>{contact.observedTurnsAgo === 0 ? "current" : `${contact.observedTurnsAgo} turns`}</dd>
      </dl>
      <p className="uncertainty-note">The marker is an estimate. Its dashed radius, rather than its center, is the commander-visible claim.</p>
    </>;
  }
  const chunk = strategicChunk(selection.at);
  return <>
    <span className="inspector-kicker">STRATEGIC TERRAIN</span>
    <h2>{formatStrategic(selection.at)}</h2>
    <dl>
      <dt>Chunk</dt><dd>{chunk.chunkX},{chunk.chunkY}</dd>
      <dt>Chunk-local</dt><dd>{chunk.localX},{chunk.localY}</dd>
      <dt>Anchored battle</dt><dd>{fixture.battles.some((battle) => battle.anchor.x === selection.at.x && battle.anchor.y === selection.at.y) ? "yes" : "none"}</dd>
    </dl>
  </>;
}

function BattleInspector({ battle, layer, selection }: {
  battle: BattleFixture;
  layer: number;
  selection: BattleSelection | null;
}) {
  if (!selection) {
    const summary = battle.layers[layer];
    return <div className="commander-empty">
      <strong>Layer {String(layer).padStart(2, "0")}</strong>
      {summary.measure === "strength"
        ? <p>{summary.friendly} friendly strength · {summary.enemyMinimum}–{summary.enemyMaximum} estimated opposition strength · {summary.artifacts} artifacts</p>
        : <p>{summary.friendly} friendly units · {summary.enemy} opposition units · {summary.artifacts} artifacts</p>}
      {summary.uncertainty !== undefined && <p>{Math.round(summary.uncertainty * 100)}% projected uncertainty.</p>}
      <p>{Math.round(summary.activity * 100)}% {summary.activityKind} on this layer.</p>
      <p>Select a cell, unit, or artifact. Adjacent-layer contacts appear as faint up/down chevrons.</p>
    </div>;
  }
  if (selection.kind === "unit") {
    const unit = battle.units.find((candidate) => candidate.unitId === selection.unitId);
    if (!unit) return null;
    return <>
      <span className={`inspector-kicker ${unit.allegiance}`}>{allegianceLabel(unit.allegiance)} UNIT</span>
      <h2>{unit.label} · {unit.chassis}</h2>
      <dl>
        <dt>Position</dt><dd>{formatBattle(unit.at.x, unit.at.y, unit.at.z)}</dd>
        <dt>Confidence</dt><dd>{Math.round(unit.confidence * 100)}%</dd>
        {unit.attentionCost !== undefined && <><dt>Attention demand</dt><dd>{unit.attentionCost}</dd></>}
        {unit.strength !== undefined && <><dt>Strength</dt><dd>{unit.strength}</dd></>}
        {unit.classification !== undefined && <><dt>Classification</dt><dd>{unit.classification}</dd></>}
        {unit.uncertaintyRadius !== undefined && <><dt>Uncertainty</dt><dd>±{unit.uncertaintyRadius} cells</dd></>}
        {unit.observedTick !== undefined && <><dt>Observed tick</dt><dd>{unit.observedTick}</dd></>}
        <dt>Posture</dt><dd>{unit.stationary === null ? "not projected" : unit.stationary ? "stationary lock" : "mobile"}</dd>
      </dl>
      <p className="prototype-lock">Fixture mode is projection-only; game orders are intentionally disabled.</p>
    </>;
  }
  if (selection.kind === "artifact") {
    const artifact = battle.artifacts.find((candidate) => candidate.artifactId === selection.artifactId);
    if (!artifact) return null;
    return <>
      <span className={`inspector-kicker ${artifact.owner}`}>{allegianceLabel(artifact.owner)} ARTIFACT</span>
      <h2>{artifact.artifactId.split(":").slice(-2).join(" ")}</h2>
      <dl>
        <dt>Position</dt><dd>{formatBattle(artifact.at.x, artifact.at.y, artifact.at.z)}</dd>
        <dt>Reported confidence</dt><dd>{Math.round(artifact.confidence * 100)}%</dd>
        {artifact.resolution && <><dt>Resolution</dt><dd>{artifact.resolution}</dd></>}
        <dt>Verified result</dt><dd>{artifact.revealedSound === null ? "hidden" : artifact.revealedSound ? "sound" : "unsound"}</dd>
        <dt>Guarantee</dt><dd>{artifact.guarantee === undefined ? "not projected" : artifact.guarantee ?? "none"}</dd>
      </dl>
    </>;
  }
  return <>
    <span className="inspector-kicker">BATTLE CELL</span>
    <h2>{formatBattle(selection.at.x, selection.at.y, selection.at.z)}</h2>
    <dl><dt>Occupancy</dt><dd>clear</dd><dt>Layer model</dt><dd>operational / elevation</dd></dl>
  </>;
}

function CommanderNavigator({
  fixture,
  battle,
  layer,
  strategicSelection,
  battleSelection,
  onStrategicSelection,
  onBattleSelection,
  onOpenBattle
}: {
  fixture: typeof strategicFixture;
  battle: BattleFixture | null;
  layer: number;
  strategicSelection: StrategicSelection | null;
  battleSelection: BattleSelection | null;
  onStrategicSelection: (selection: StrategicSelection) => void;
  onBattleSelection: (selection: BattleSelection) => void;
  onOpenBattle: (battleId: string) => void;
}) {
  const [cellX, setCellX] = useState(16);
  const [cellY, setCellY] = useState(16);
  if (battle) {
    const units = battle.units.filter((unit) => unit.at.z === layer).sort((left, right) => left.unitId.localeCompare(right.unitId));
    const artifacts = battle.artifacts.filter((artifact) => artifact.at.z === layer).sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    const selected = battleSelection?.kind === "unit"
      ? `unit:${battleSelection.unitId}`
      : battleSelection?.kind === "artifact" ? `artifact:${battleSelection.artifactId}` : "";
    return <>
      <label className="navigator-field">Visible layer entities
        <select value={selected} onChange={(event) => {
          const [kind, ...idParts] = event.currentTarget.value.split(":");
          const id = idParts.join(":");
          if (kind === "unit" && id) onBattleSelection({ kind: "unit", unitId: id });
          if (kind === "artifact" && id) onBattleSelection({ kind: "artifact", artifactId: id });
        }}>
          <option value="">Choose an entity…</option>
          <optgroup label="Units and contacts">
            {units.map((unit) => <option key={unit.unitId} value={`unit:${unit.unitId}`}>
              {unit.label} · {allegianceLabel(unit.allegiance)} · {unit.at.x},{unit.at.y}
            </option>)}
          </optgroup>
          <optgroup label="Artifacts">
            {artifacts.map((artifact) => <option key={artifact.artifactId} value={`artifact:${artifact.artifactId}`}>
              {artifact.artifactId.split(":").slice(-2).join(" ")} · {artifact.at.x},{artifact.at.y}
            </option>)}
          </optgroup>
        </select>
      </label>
      <fieldset className="navigator-cell">
        <legend>Inspect a cell on layer {layer}</legend>
        <label>X<input type="number" min="0" max="31" value={cellX} onChange={(event) => setCellX(clampBattleAxis(Number(event.currentTarget.value)))} /></label>
        <label>Y<input type="number" min="0" max="31" value={cellY} onChange={(event) => setCellY(clampBattleAxis(Number(event.currentTarget.value)))} /></label>
        <button type="button" onClick={() => onBattleSelection({ kind: "cell", at: { x: cellX, y: cellY, z: layer } })}>Inspect cell</button>
      </fieldset>
    </>;
  }
  const selectedBattleId = strategicSelection?.kind === "battle" ? strategicSelection.battleId : "";
  const selectedContactId = strategicSelection?.kind === "contact" ? strategicSelection.contactId : "";
  return <>
    <label className="navigator-field">Battles
      <select value={selectedBattleId} onChange={(event) => {
        if (event.currentTarget.value) onStrategicSelection({ kind: "battle", battleId: event.currentTarget.value });
      }}>
        <option value="">Choose a battle…</option>
        {fixture.battles.map((candidate) => <option key={candidate.battleId} value={candidate.battleId}>
          {candidate.label} · {candidate.status} · {formatStrategic(candidate.anchor)}
        </option>)}
      </select>
    </label>
    <button type="button" className="navigator-open" disabled={!selectedBattleId} onClick={() => selectedBattleId && onOpenBattle(selectedBattleId)}>
      Enter selected battle
    </button>
    <label className="navigator-field">Observed contacts
      <select value={selectedContactId} onChange={(event) => {
        if (event.currentTarget.value) onStrategicSelection({ kind: "contact", contactId: event.currentTarget.value });
      }}>
        <option value="">Choose a contact…</option>
        {fixture.contacts.map((contact) => <option key={contact.contactId} value={contact.contactId}>
          {contact.label} · {Math.round(contact.confidence * 100)}% confidence
        </option>)}
      </select>
    </label>
  </>;
}

export function CommanderView() {
  const initial = useMemo(initialState, []);
  const [theater, setTheater] = useState(strategicFixture);
  const [theaterSource, setTheaterSource] = useState<"loading" | "server" | "fixture">("loading");
  const [theaterError, setTheaterError] = useState<string | null>(null);
  const [camera, setCamera] = useState<StrategicCamera>(initial.camera);
  const [battleId, setBattleId] = useState<string | null>(initial.battleId);
  const [layer, setLayer] = useState(initial.layer);
  const [strategicSelection, setStrategicSelection] = useState<StrategicSelection | null>(() =>
    initial.battleId ? { kind: "battle", battleId: initial.battleId } : null
  );
  const [battleSelection, setBattleSelection] = useState<BattleSelection | null>(null);
  const [serverBattle, setServerBattle] = useState<BattleFixture | null>(null);
  const [battleSource, setBattleSource] = useState<"idle" | "loading" | "server" | "fixture">("idle");
  const [battleError, setBattleError] = useState<string | null>(null);
  const [hover, setHover] = useState<StrategicPoint | null>(null);
  const selectedBattle = theater.battles.find((candidate) => candidate.battleId === battleId)
    ?? strategicFixture.battles.find((candidate) => candidate.battleId === battleId)
    ?? null;
  const fallbackBattle = useMemo(() => selectedBattle ? createBattleFixture(selectedBattle) : null, [selectedBattle]);
  const battle = battleId ? serverBattle ?? fallbackBattle : null;
  const displayBattle = battle?.battle ?? selectedBattle;

  useEffect(() => {
    const controller = new AbortController();
    void loadStrategicFixture(controller.signal).then((next) => {
      setTheater(next);
      setTheaterSource("server");
      setTheaterError(null);
      setStrategicSelection((current) => {
        if (current?.kind === "battle" && !next.battles.some((candidate) => candidate.battleId === current.battleId)) return null;
        if (current?.kind === "contact" && !next.contacts.some((candidate) => candidate.contactId === current.contactId)) return null;
        return current;
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setTheater(strategicFixture);
      setTheaterSource("fixture");
      setTheaterError(error instanceof Error ? error.message : String(error));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!battleId) {
      setServerBattle(null);
      setBattleSource("idle");
      setBattleError(null);
      return;
    }
    const controller = new AbortController();
    setServerBattle(null);
    setBattleSource("loading");
    setBattleError(null);
    void loadBattleFixture(battleId, layer, selectedBattle ?? undefined, controller.signal).then((next) => {
      setServerBattle(next);
      setBattleSource("server");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setServerBattle(null);
      setBattleSource("fixture");
      setBattleError(error instanceof Error ? error.message : String(error));
    });
    return () => controller.abort();
  }, [battleId, layer, selectedBattle]);

  function openBattle(nextBattleId: string) {
    const nextBattle = theater.battles.find((candidate) => candidate.battleId === nextBattleId)
      ?? strategicFixture.battles.find((candidate) => candidate.battleId === nextBattleId);
    if (!nextBattle) return;
    const preferredLayer = nextBattle.activeLayers
      ? Math.round((nextBattle.activeLayers[0] + nextBattle.activeLayers[1]) / 2)
      : selectBusyLayer(createBattleFixture(nextBattle));
    setStrategicSelection({ kind: "battle", battleId: nextBattleId });
    setBattleId(nextBattleId);
    setLayer(preferredLayer);
    setBattleSelection(null);
  }

  function closeBattle() {
    setBattleId(null);
    setServerBattle(null);
    setBattleSelection(null);
  }

  function changeLayer(nextLayer: number) {
    setLayer(clampBattleLayer(nextLayer));
    setBattleSelection(null);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "commander");
      if (battleId) {
        url.searchParams.set("battle", battleId);
        url.searchParams.set("z", String(layer));
        url.searchParams.delete("x");
        url.searchParams.delete("y");
        url.searchParams.delete("zoom");
      } else {
        url.searchParams.delete("battle");
        url.searchParams.delete("z");
        url.searchParams.set("x", camera.center.x.toFixed(1));
        url.searchParams.set("y", camera.center.y.toFixed(1));
        url.searchParams.set("zoom", camera.zoom.toFixed(4));
      }
      window.history.replaceState(null, "", url);
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [battleId, camera, layer]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
        eventTargetsInteractiveControl(event.target)
      ) return;
      if (battle) {
        if (event.key === "Escape") { event.preventDefault(); closeBattle(); }
        else if (event.key === "PageUp") { event.preventDefault(); changeLayer(layer + 1); }
        else if (event.key === "PageDown") { event.preventDefault(); changeLayer(layer - 1); }
        return;
      }
      const pan = 110;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") { event.preventDefault(); setCamera((value) => panCamera(value, pan, 0)); }
      else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") { event.preventDefault(); setCamera((value) => panCamera(value, -pan, 0)); }
      else if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") { event.preventDefault(); setCamera((value) => panCamera(value, 0, pan)); }
      else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") { event.preventDefault(); setCamera((value) => panCamera(value, 0, -pan)); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); setCamera((value) => ({ ...value, zoom: clamp(value.zoom * 1.5, 0.035, 36) })); }
      else if (event.key === "-") { event.preventDefault(); setCamera((value) => ({ ...value, zoom: clamp(value.zoom / 1.5, 0.035, 36) })); }
      else if (event.key === "Home") { event.preventDefault(); setCamera(defaultCamera); }
      else if (event.key === "Enter" && strategicSelection?.kind === "battle") { event.preventDefault(); openBattle(strategicSelection.battleId); }
      else if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        if (theater.battles.length === 0) return;
        const current = strategicSelection?.kind === "battle"
          ? theater.battles.findIndex((candidate) => candidate.battleId === strategicSelection.battleId)
          : -1;
        const delta = event.key === "]" ? 1 : -1;
        const index = (current + delta + theater.battles.length) % theater.battles.length;
        setStrategicSelection({ kind: "battle", battleId: theater.battles[index].battleId });
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [battle, layer, strategicSelection, theater]);

  const focus = displayBattle?.anchor ?? (strategicSelection?.kind === "terrain" ? strategicSelection.at : camera.center);
  const chunk = strategicChunk(displayBattle?.anchor ?? camera.center);
  const dataSource = battleId ? battleSource : theaterSource;
  const dataSourceLabel = dataSource === "server" ? "LIVE API" : dataSource === "loading" || dataSource === "idle" ? "API LOADING" : "FIXTURE FALLBACK";
  const dataError = battleId ? battleError : theaterError;
  const dataStatusMessage = dataSource === "server"
    ? `Contract-validated sparse projection loaded. Revision ${theater.revision}. Zoom level of detail is visual-only for this fixture.`
    : dataSource === "loading" || dataSource === "idle"
      ? "Loading the contract-validated commander projection. Deterministic fixture data remains visible while the request completes."
      : `Live projection unavailable${dataError ? `: ${dataError}` : ""}. Showing deterministic local fixture data. Zoom level of detail is visual-only.`;
  let selectionAnnouncement = battle
    ? `${battle.battle.label}, layer ${layer}. No battle object selected.`
    : `Strategic focus ${formatStrategic(focus)}. No object selected.`;
  if (battle && battleSelection?.kind === "unit") {
    const selected = battle.units.find((candidate) => candidate.unitId === battleSelection.unitId);
    if (selected) selectionAnnouncement = `Selected ${allegianceLabel(selected.allegiance)} ${selected.chassis} ${selected.label} at ${formatBattle(selected.at.x, selected.at.y, selected.at.z)}.`;
  } else if (battle && battleSelection?.kind === "artifact") {
    const selected = battle.artifacts.find((candidate) => candidate.artifactId === battleSelection.artifactId);
    if (selected) selectionAnnouncement = `Selected artifact at ${formatBattle(selected.at.x, selected.at.y, selected.at.z)}.`;
  } else if (battle && battleSelection?.kind === "cell") {
    selectionAnnouncement = `Selected battle cell ${formatBattle(battleSelection.at.x, battleSelection.at.y, battleSelection.at.z)}.`;
  } else if (!battle && strategicSelection?.kind === "battle") {
    const selected = theater.battles.find((candidate) => candidate.battleId === strategicSelection.battleId);
    if (selected) selectionAnnouncement = `Selected battle ${selected.label} at ${formatStrategic(selected.anchor)}.`;
  } else if (!battle && strategicSelection?.kind === "contact") {
    const selected = theater.contacts.find((candidate) => candidate.contactId === strategicSelection.contactId);
    if (selected) selectionAnnouncement = `Selected ${selected.label} at estimated coordinate ${formatStrategic(selected.at)}, ${Math.round(selected.confidence * 100)} percent confidence.`;
  } else if (!battle && strategicSelection?.kind === "terrain") {
    selectionAnnouncement = `Selected strategic coordinate ${formatStrategic(strategicSelection.at)}.`;
  }

  return <main className="commander-shell">
    <header className="commander-header">
      <div>
        <p className="eyebrow">CONTEXT LANDSCAPE · COMMANDER VIEW</p>
        <h1>{battle ? battle.battle.label : theater.label}</h1>
        <p className="commander-subtitle">{battle ? "32 × 32 × 32 operational battle volume" : "Sparse physical theater · 6,400 × 6,400 strategic cells"}</p>
      </div>
      <div className="space-switch" aria-label="Commander spaces">
        <button type="button" className="active" aria-pressed="true">Physical theater</button>
        <button type="button" disabled title="Future 6,400 commander profiles × 6,400 opponents analytical view">
          Doctrine atlas <small>future</small>
        </button>
      </div>
      <div className="commander-build" title={dataError ?? undefined}><span>{dataSourceLabel}</span><code>rev {theater.revision}</code></div>
    </header>

    <nav className="commander-breadcrumbs" aria-label="Location">
      <button type="button" onClick={closeBattle}>World 6400²</button>
      <span>/</span><button type="button" onClick={closeBattle}>Chunk {chunk.chunkX},{chunk.chunkY}</button>
      {displayBattle && <><span>/</span><button type="button" onClick={closeBattle}>{formatStrategic(displayBattle.anchor)}</button></>}
      {battle && <><span>/</span><strong>{battle.battle.label}</strong><span>/</span><strong>L{String(layer).padStart(2, "0")}</strong></>}
    </nav>

    <div className={`commander-data-status ${dataSource}`} role="status" aria-live="polite" aria-atomic="true">
      <strong>{dataSourceLabel}</strong><span>{dataStatusMessage}</span>
    </div>

    <section className="commander-metrics" aria-label="Commander status">
      {battle ? <>
        {battle.attentionAllocated !== undefined && battle.attentionDemand !== undefined
          ? <>
            <Metric label="Attention available" value={String(battle.attention)} />
            <Metric label="Attention allocated" value={String(battle.attentionAllocated)} />
            <Metric label="Attention demand" value={String(battle.attentionDemand)} />
          </>
          : <>
            <Metric label="Attention"><AttentionPips available={battle.attention} capacity={battle.attentionCapacity} /></Metric>
            <Metric label="Objective progress" value={`${battle.progress ?? 0}/12`} />
            <Metric label="Drift" value={`${battle.drift ?? 0}/4`} />
          </>}
        <Metric label="Round" value={String(battle.round)} />
        <Metric label="Phase" value={battle.phase} />
        <Metric label="Layer" value={`${String(layer).padStart(2, "0")} / 31`} />
      </> : <>
        <Metric label="Space" value="physical theater" />
        <Metric label="Visual LOD" value={strategicLod(camera.zoom)} />
        <Metric label="Center" value={formatStrategic(camera.center)} />
        <Metric label="Scale" value={`${camera.zoom.toFixed(2)} px/cell`} />
        <Metric label="Active battles" value={String(theater.battles.filter((candidate) => candidate.status === "active").length)} />
        <Metric label="Cursor" value={hover ? formatStrategic(hover) : "—"} />
      </>}
    </section>

    <section className="commander-layout">
      <div className="commander-map-panel">
        <div className="map-toolbar">
          <div>
            <strong>{battle ? `Operational layer ${String(layer).padStart(2, "0")}` : "Strategic landscape"}</strong>
            <span>{battle ? "z increases with elevation" : `${strategicLod(camera.zoom)} visual grid · theater fixture payload · north-up`}</span>
          </div>
          <div className="map-toolbar-actions">
            {battle ? <>
              <button type="button" onClick={() => changeLayer(layer - 1)}>Layer −</button>
              <button type="button" onClick={() => changeLayer(layer + 1)}>Layer +</button>
              <button type="button" onClick={closeBattle}>Back to theater</button>
            </> : <>
              <button type="button" onClick={() => setCamera((value) => ({ ...value, zoom: clamp(value.zoom / 1.5, 0.035, 36) }))}>−</button>
              <button type="button" onClick={() => setCamera(defaultCamera)}>Fit</button>
              <button type="button" onClick={() => setCamera((value) => ({ ...value, zoom: clamp(value.zoom * 1.5, 0.035, 36) }))}>+</button>
            </>}
          </div>
        </div>
        <div className={`commander-stage ${battle ? "battle-stage" : "strategic-stage"}`}>
          {battle ? <>
            <BattleVolumeCanvas battle={battle} layer={layer} selection={battleSelection} onSelectionChange={setBattleSelection} />
            <LayerRail layers={battle.layers} selected={layer} onSelect={changeLayer} />
          </> : <StrategicCanvas
            fixture={theater}
            camera={camera}
            selection={strategicSelection}
            onCameraChange={setCamera}
            onSelectionChange={setStrategicSelection}
            onOpenBattle={openBattle}
            onHover={setHover}
          />}
        </div>
        <div className="commander-legend" aria-label="Map legend">
          <span><i className="friendly" />Friendly</span>
          <span><i className="enemy" />Opposition</span>
          <span><i className="uncertain" />Uncertain / stale</span>
          <span><i className="attention" />Attention pressure</span>
          {!battle && <small>Drag/WASD pan · wheel/+− zoom · Enter drills selected battle</small>}
          {battle && <small>PageUp/PageDown changes layer · Esc returns</small>}
        </div>
      </div>

      <aside className="commander-side">
        <section className="commander-card inspector-card">
          <div className="commander-card-title"><span>Inspector</span><span>{battle ? "battle" : "strategic"}</span></div>
          {battle
            ? <BattleInspector battle={battle} layer={layer} selection={battleSelection} />
            : <StrategicInspector fixture={theater} selection={strategicSelection} onOpenBattle={openBattle} />}
        </section>
        <section className="commander-card navigator-card">
          <div className="commander-card-title"><span>Keyboard navigator</span><span>{battle ? `layer ${layer}` : "objects"}</span></div>
          <CommanderNavigator
            fixture={theater}
            battle={battle}
            layer={layer}
            strategicSelection={strategicSelection}
            battleSelection={battleSelection}
            onStrategicSelection={setStrategicSelection}
            onBattleSelection={setBattleSelection}
            onOpenBattle={openBattle}
          />
        </section>
        <section className="commander-card keyboard-card">
          <div className="commander-card-title"><span>Control surface</span><span>keyboard</span></div>
          {battle ? <dl>
            <dt>Layer up/down</dt><dd>PgUp / PgDn</dd>
            <dt>Return</dt><dd>Esc</dd>
            <dt>Inspect</dt><dd>click / navigator</dd>
          </dl> : <dl>
            <dt>Pan</dt><dd>WASD / arrows</dd>
            <dt>Zoom</dt><dd>+ / − / wheel</dd>
            <dt>Fit world</dt><dd>Home</dd>
            <dt>Cycle battles</dt><dd>[ / ]</dd>
            <dt>Drill down</dt><dd>Enter / double-click</dd>
          </dl>}
        </section>
        <section className="commander-card atlas-card">
          <div className="commander-card-title"><span>Doctrine atlas</span><span>reserved</span></div>
          <p>A future analytical space will compare 6,400 commander profiles against 6,400 opponents. It will share navigation language, not the physical map canvas or dense cell allocation.</p>
        </section>
      </aside>
    </section>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{selectionAnnouncement}</span>
  </main>;
}
