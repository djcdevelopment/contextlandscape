import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  EventEnvelope,
  GameplayLabSessionView,
  GameplayLabSummary,
  MatchProjection,
  Reconstruction,
  UnitState
} from "@landscape/contracts";
import { CommanderView } from "./commander/CommanderView.js";
import { LabAtlasView } from "./atlas/LabAtlasView.js";
import "./style.css";

const actions = ["scout", "build_contract", "implement", "review", "defend", "full_send", "consolidate"] as const;
type Action = typeof actions[number];
type SelectedCell = { x: number; y: number };
type ScenarioSummary = {
  scenarioId: string;
  title: string;
  missionObjective: string;
  expectedLesson: string;
  difficulty: number;
  rulesProfile?: string;
};
type MatchWithEvents = MatchProjection & { events: EventEnvelope[] };
type GameplayLabPayload = {
  session: GameplayLabSessionView;
  projection: MatchProjection | null;
  events: EventEnvelope[];
  exportPaths?: { session: string; review: string; followUpMatrix: string | null };
};

const actionMeta: Record<Action, { label: string; cost: number; description: string }> = {
  scout: { label: "Scout", cost: 1, description: "Reveal terrain and hidden constraints" },
  build_contract: { label: "Build Contract Depot", cost: 1, description: "Create shared boundary truth" },
  implement: { label: "Implement", cost: 1, description: "Advance a bounded slice" },
  review: { label: "Review", cost: 1, description: "Verify the current objective" },
  defend: { label: "Defend", cost: 1, description: "Hold position and protect current context" },
  full_send: { label: "Full Send", cost: 2, description: "Sustained fire; high dispersion risk" },
  consolidate: { label: "Consolidate", cost: 1, description: "Cool, reduce dispersion, preserve ground" }
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body as T;
}

function App() {
  const [match, setMatch] = useState<MatchProjection | null>(null);
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("two-baked-slices");
  const [reconstruction, setReconstruction] = useState<Reconstruction | null>(null);
  const [challengeLink, setChallengeLink] = useState("");
  const [labs, setLabs] = useState<GameplayLabSummary[]>([]);
  const [labCatalogOpen, setLabCatalogOpen] = useState(() => new URLSearchParams(window.location.search).has("labs"));
  const [labSession, setLabSession] = useState<GameplayLabSessionView | null>(null);
  const [labExportPaths, setLabExportPaths] = useState<GameplayLabPayload["exportPaths"]>();
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("context-landscape.playtestSession");
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem("context-landscape.playtestSession", created);
    return created;
  });
  const [selectedUnit, setSelectedUnit] = useState("scout-01");
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>({ x: 1, y: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function observe(eventType: string, data: Record<string, unknown>, matchId = match?.matchId) {
    const trial = labSession?.currentTrial;
    void fetch("/api/research/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        matchId,
        eventType,
        occurredAt: new Date().toISOString(),
        data: labSession ? {
          labId: labSession.labId,
          labVersion: labSession.labVersion,
          labSessionId: labSession.labSessionId,
          trialId: trial?.trialId,
          variantToken: trial?.variantToken,
          ...data
        } : data
      })
    }).catch(() => undefined);
  }

  function setBattlefield(nextMatch: MatchProjection | null, nextEvents: EventEnvelope[] = []) {
    setMatch(nextMatch);
    setEvents(nextEvents);
    setReconstruction(null);
    if (nextMatch) {
      setSelectedScenarioId(nextMatch.scenarioId);
      const first = nextMatch.units[0];
      setSelectedUnit(first?.unitId ?? "");
      setSelectedCell(first ? { x: first.x, y: first.y } : null);
    }
  }

  function applyLabPayload(payload: GameplayLabPayload) {
    setLabSession(payload.session);
    setLabExportPaths(payload.exportPaths);
    setBattlefield(payload.projection, payload.events);
    localStorage.setItem("context-landscape.gameplayLabSessionId", payload.session.labSessionId);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" })));
  }

  async function newMatch(scenarioId = selectedScenarioId) {
    setBusy(true);
    setError("");
    try {
      const nextMatch = await jsonRequest<MatchProjection>("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId })
      });
      setLabSession(null);
      setLabExportPaths(undefined);
      localStorage.removeItem("context-landscape.gameplayLabSessionId");
      setBattlefield(nextMatch);
      observe("match.created", { scenarioId: nextMatch.scenarioId }, nextMatch.matchId);
      localStorage.setItem("context-landscape.matchId", nextMatch.matchId);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resumeMatch(matchId: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await jsonRequest<MatchWithEvents>(`/api/matches/${matchId}`);
      setLabSession(null);
      localStorage.removeItem("context-landscape.gameplayLabSessionId");
      setBattlefield(payload, payload.events ?? []);
      observe("match.resumed", { scenarioId: payload.scenarioId, eventCount: payload.events?.length ?? 0 }, payload.matchId);
    } catch {
      localStorage.removeItem("context-landscape.matchId");
      await newMatch();
    } finally {
      setBusy(false);
    }
  }

  async function startLab(labId: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await jsonRequest<GameplayLabPayload>(`/api/gameplay-labs/${labId}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: sessionId })
      });
      applyLabPayload(payload);
      setLabCatalogOpen(false);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resumeLab(labSessionId: string) {
    setBusy(true);
    setError("");
    try {
      applyLabPayload(await jsonRequest<GameplayLabPayload>(`/api/gameplay-lab-sessions/${labSessionId}`));
    } catch {
      localStorage.removeItem("context-landscape.gameplayLabSessionId");
      await newMatch();
    } finally {
      setBusy(false);
    }
  }

  async function leaveLab() {
    if (!labSession) return;
    const confirmed = window.confirm(
      "Leave this gameplay lab? Its recorded progress stays on the server, but this browser will stop reopening the session automatically."
    );
    if (!confirmed) return;
    localStorage.removeItem("context-landscape.gameplayLabSessionId");
    setLabSession(null);
    setLabExportPaths(undefined);
    setBattlefield(null);
    setLabCatalogOpen(true);
    await newMatch();
  }

  async function mutateLab(path: string, body: unknown) {
    if (!labSession) return;
    setBusy(true);
    setError("");
    try {
      const payload = await jsonRequest<GameplayLabPayload>(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      applyLabPayload(payload);
      return payload;
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function bookmarkDecision() {
    const trial = labSession?.currentTrial;
    if (!labSession || !trial) return;
    const note = window.prompt("Optional one-line note for this decision:", "");
    if (note === null) return;
    if (!note.trim()) {
      setError("A bookmark needs a short note.");
      return;
    }
    await mutateLab(
      `/api/gameplay-lab-sessions/${labSession.labSessionId}/trials/${trial.trialId}/bookmarks`,
      { note: note.trim(), occurredAt: new Date().toISOString() }
    );
  }

  async function completeTrial() {
    const trial = labSession?.currentTrial;
    if (!labSession || !trial) return;
    await mutateLab(
      `/api/gameplay-lab-sessions/${labSession.labSessionId}/trials/${trial.trialId}/complete`,
      {}
    );
  }

  async function submitReview(body: unknown) {
    if (!labSession) return;
    const payload = await mutateLab(`/api/gameplay-lab-sessions/${labSession.labSessionId}/reviews`, body);
    const trial = payload?.session.currentTrial;
    if (body && (body as { phase?: string }).phase === "pre" && trial) {
      try {
        setReconstruction(await jsonRequest<Reconstruction>(
          `/api/gameplay-lab-sessions/${payload.session.labSessionId}/trials/${trial.trialId}/reconstruction`
        ));
      } catch (caught) {
        setError(String(caught));
      }
    }
  }

  async function createChallenge() {
    setBusy(true);
    try {
      const body = await jsonRequest<{ challenge: { matchId: string }; joinPath: string }>("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedScenarioId, creatorId: sessionId })
      });
      setChallengeLink(`${window.location.origin}${body.joinPath}`);
      localStorage.setItem("context-landscape.matchId", body.challenge.matchId);
      await resumeMatch(body.challenge.matchId);
      observe("challenge.created", { scenarioId: selectedScenarioId });
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function acceptChallenge(challengeId: string) {
    try {
      const challenge = await jsonRequest<{ matchId: string; status: string }>(`/api/challenges/${challengeId}`);
      if (challenge.status === "open") {
        await jsonRequest(`/api/challenges/${challengeId}/accept`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ opponentId: sessionId })
        });
      }
      localStorage.setItem("context-landscape.matchId", challenge.matchId);
      await resumeMatch(challenge.matchId);
      observe("challenge.accepted", { challengeId }, challenge.matchId);
    } catch (caught) {
      setError(String(caught));
      await newMatch();
    }
  }

  async function issue(action: Action) {
    if (!match || !selectedUnit) return;
    observe("command.issued", { unitId: selectedUnit, action, fireMode: action === "full_send" ? "full" : "semi" });
    setBusy(true);
    setError("");
    try {
      const body = await jsonRequest<{ projection: MatchProjection; events: EventEnvelope[] }>(
        `/api/matches/${match.matchId}/orders`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ unitId: selectedUnit, action, fireMode: action === "full_send" ? "full" : "semi" })
        }
      );
      setMatch(body.projection);
      setEvents((previous) => [...previous, ...body.events]);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  function selectCell(x: number, y: number, own?: UnitState, enemy?: UnitState) {
    setSelectedCell({ x, y });
    setSelectedUnit(own?.unitId ?? "");
    if (enemy) setSelectedUnit("");
    observe("cell.selected", { x, y, kind: own ? "friendly_unit" : enemy ? "enemy_contact" : "terrain", unitId: own?.unitId ?? null });
  }

  useEffect(() => {
    void fetch("/api/scenarios").then((response) => response.json()).then((payload: ScenarioSummary[]) => setScenarios(payload)).catch(() => undefined);
    void fetch("/api/gameplay-labs").then((response) => response.json()).then((payload: GameplayLabSummary[]) => setLabs(payload)).catch(() => undefined);
    const query = new URLSearchParams(window.location.search);
    const challengeId = query.get("challenge");
    const requestedLabSessionId = query.get("labSession");
    const savedLabSessionId = localStorage.getItem("context-landscape.gameplayLabSessionId");
    const savedMatchId = localStorage.getItem("context-landscape.matchId");
    void (challengeId
      ? acceptChallenge(challengeId)
      : requestedLabSessionId || savedLabSessionId
        ? resumeLab(requestedLabSessionId ?? savedLabSessionId!)
        : savedMatchId
          ? resumeMatch(savedMatchId)
          : newMatch());
  }, []);

  useEffect(() => {
    if (!match || labSession) return;
    void fetch(`/api/matches/${match.matchId}/reconstruction`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload: Reconstruction | null) => {
        setReconstruction(payload);
        if (payload) observe("reconstruction.loaded", { status: payload.status, actionCount: payload.actionCount });
      })
      .catch(() => setReconstruction(null));
  }, [match, labSession?.labSessionId]);

  const selectedEntity = useMemo(() => {
    if (!match || !selectedCell) return undefined;
    return [...match.units, ...match.visibleEnemyUnits].find((unit) => unit.x === selectedCell.x && unit.y === selectedCell.y);
  }, [match, selectedCell]);
  const selectedScenario = scenarios.find((scenario) => scenario.scenarioId === match?.scenarioId);

  return <main>
    <header>
      <div>
        <p className="eyebrow">CONTEXT LANDSCAPE · {labSession ? "GAMEPLAY LAB" : "SCENARIO"}</p>
        <h1>{labSession?.title ?? selectedScenario?.title ?? "Context Landscape"}</h1>
        <p className="lede">{selectedScenario?.missionObjective ?? "Move the integration objective with the least commander energy."}</p>
      </div>
      <div className="match-controls">
        <button onClick={() => { window.location.search = "?view=atlas"; }} disabled={busy}>Research atlas</button>
        <button className="lab-entry" onClick={() => setLabCatalogOpen((open) => !open)} disabled={busy}>
          {labCatalogOpen ? "Close labs" : "Gameplay labs"}
        </button>
        {!labSession && <>
          <label>Scenario<select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)} disabled={busy}>
            <option value="two-baked-slices">Two Baked Slices</option>
            {scenarios.filter((scenario) => scenario.scenarioId !== "two-baked-slices").map((scenario) =>
              <option key={scenario.scenarioId} value={scenario.scenarioId}>{scenario.title}</option>
            )}
          </select></label>
          <button onClick={() => void createChallenge()} disabled={busy}>Create challenge</button>
          <button onClick={() => void newMatch()} disabled={busy}>New match</button>
        </>}
      </div>
    </header>

    {error && <div className="error">{error}</div>}
    {challengeLink && <div className="challenge-link">Challenge link: <code>{challengeLink}</code></div>}
    {labCatalogOpen && <LabCatalog
      labs={labs}
      busy={busy}
      activeSession={labSession}
      onStart={startLab}
      onLeave={leaveLab}
    />}

    {labSession && <LabBanner
      session={labSession}
      match={match}
      busy={busy}
      exportPaths={labExportPaths}
      onBookmark={bookmarkDecision}
      onCompleteTrial={completeTrial}
      onReview={submitReview}
      onLeave={leaveLab}
      onReturn={() => void newMatch()}
    />}

    {!match
      ? labSession?.status !== "complete" && <div className="card">Loading battlefield…</div>
      : <>
        <section className="metrics">
          <Metric label="Mission progress" value={`${match.objectiveProgress}/7`} />
          <Metric label="Commander energy" value={String(match.commanderEnergy)} />
          <Metric label="Heat" value={String(match.heat)} />
          <Metric label="Dispersion" value={String(match.dispersion)} />
          <Metric label="Slot" value={String(match.slot)} />
        </section>
        <section className="layout">
          <div className="card board-card">
            <div className="card-title">
              <span>Battlefield <small className="card-subtitle">select a cell to inspect it</small></span>
              <span className={`status ${match.status}`}>{match.status}</span>
            </div>
            <div className="board">
              {Array.from({ length: 100 }, (_, index) => {
                const x = index % 10;
                const y = Math.floor(index / 10);
                const own = match.units.find((unit) => unit.x === x && unit.y === y);
                const enemy = match.visibleEnemyUnits.find((unit) => unit.x === x && unit.y === y);
                const selected = selectedCell?.x === x && selectedCell.y === y;
                const cellLabel = own
                  ? `Friendly ${own.chassis} unit at ${x},${y}`
                  : enemy
                    ? `Visible enemy contact at ${x},${y}`
                    : `Terrain cell at ${x},${y}`;
                return <button
                  key={`${x}-${y}`}
                  className={`cell ${own ? "own" : ""} ${enemy ? "enemy" : ""} ${selected ? "selected" : ""}`}
                  onClick={() => selectCell(x, y, own, enemy)}
                  title={cellLabel}
                  aria-label={cellLabel}
                >{own?.chassis[0].toUpperCase() ?? enemy?.chassis[0].toUpperCase() ?? ""}</button>;
              })}
            </div>
            <p className="legend">Every cell is selectable. Friendly units can receive orders; empty terrain and enemy contacts are inspect-only.</p>
            <TransactionConsole events={events} />
            <ReconstructionPanel report={reconstruction} />
          </div>
          <aside>
            {labSession?.currentTrial?.doctrineCard && <DoctrineCard
              card={labSession.currentTrial.doctrineCard}
              currentSlot={match.slot}
            />}
            <SelectionInspector cell={selectedCell} entity={selectedEntity} selectedUnit={selectedUnit} />
            <div className="card orders-card">
              <div className="card-title"><span>Command actions</span><span className="selection-kind">orders</span></div>
              {selectedUnit
                ? <p className="orders-target">Orders for <strong>{selectedEntity?.chassis ?? "friendly unit"}</strong> <code>{selectedUnit}</code></p>
                : <p className="orders-target muted">Select a friendly unit to enable orders.</p>}
              <div className="actions">
                {actions.map((action) => <button
                  key={action}
                  disabled={busy || match.status !== "active" || !selectedUnit}
                  onClick={() => void issue(action)}
                >
                  <span>{actionMeta[action].label}</span>
                  <small>{actionMeta[action].description} · {actionMeta[action].cost} nominal energy</small>
                </button>)}
              </div>
            </div>
          </aside>
        </section>
      </>}
  </main>;
}

function LabCatalog({
  labs,
  busy,
  activeSession,
  onStart,
  onLeave
}: {
  labs: GameplayLabSummary[];
  busy: boolean;
  activeSession: GameplayLabSessionView | null;
  onStart: (labId: string) => Promise<void>;
  onLeave: () => Promise<void>;
}) {
  return <section className="lab-catalog" aria-label="Gameplay lab catalog">
    <div className="lab-catalog-heading">
      <div><h2>Gameplay labs</h2><p>Short, anonymous comparisons built from synthetic edge findings.</p></div>
      <span>{labs.length} packs</span>
    </div>
    {activeSession && activeSession.status !== "complete" && <div className="lab-active-session">
      <div>
        <strong>Current session: {activeSession.title}</strong>
        <span>The catalog does not advance or replace an active trial. Return to the battlefield, or leave this session to choose another pack.</span>
      </div>
      <button onClick={() => void onLeave()} disabled={busy}>Leave current lab</button>
    </div>}
    <div className="lab-grid">
      {labs.map((lab) => <article className="lab-card" key={lab.labId}>
        <div className="lab-meta"><span>{lab.labId}</span><span>~{lab.estimatedMinutes} min</span></div>
        <h3>{lab.title}</h3>
        <p>{lab.preBrief}</p>
        <small>{lab.trialCount} anonymous trials · {lab.scenarioTitle}</small>
        <button disabled={busy || Boolean(activeSession && activeSession.status !== "complete")} onClick={() => void onStart(lab.labId)}>
          {activeSession?.labId === lab.labId && activeSession.status !== "complete" ? "Session in progress" : "Start lab"}
        </button>
      </article>)}
    </div>
  </section>;
}

function LabBanner({
  session,
  match,
  busy,
  exportPaths,
  onBookmark,
  onCompleteTrial,
  onReview,
  onLeave,
  onReturn
}: {
  session: GameplayLabSessionView;
  match: MatchProjection | null;
  busy: boolean;
  exportPaths?: GameplayLabPayload["exportPaths"];
  onBookmark: () => Promise<void>;
  onCompleteTrial: () => Promise<void>;
  onReview: (body: unknown) => Promise<void>;
  onLeave: () => Promise<void>;
  onReturn: () => void;
}) {
  const trial = session.currentTrial;
  if (session.status === "complete") {
    return <section className="lab-workflow complete">
      <div>
        <span className="lab-kicker">SESSION COMPLETE</span>
        <h2>Treatment reveal</h2>
        <p>Your structured workbook and deterministic event bundle are ready.</p>
      </div>
      <div className="reveal-grid">
        {session.revealedVariants?.map((variant) => <div key={variant.variantToken}>
          <strong>Trial {variant.variantToken}</strong>
          <span>{variant.labelForReview}</span>
          <code>{variant.variantId}</code>
        </div>)}
      </div>
      <div className="lab-complete-actions">
        <a className="button-link" href={`/api/gameplay-lab-sessions/${session.labSessionId}/export?format=markdown`} target="_blank">Open review workbook</a>
        <a className="button-link" href={`/api/gameplay-lab-sessions/${session.labSessionId}/export`} target="_blank">Open JSON bundle</a>
        {exportPaths?.followUpMatrix && <span className="export-note">Follow-up matrix prepared.</span>}
        <button onClick={onReturn}>Return to normal play</button>
      </div>
    </section>;
  }

  if (session.status === "awaiting_final_review") {
    return <section className="lab-workflow">
      <div className="trial-progress">
        <span className="lab-kicker">FINAL COMPARISON</span>
        <div className="lab-progress-actions">
          <span>{session.trialCount} of {session.trialCount} complete</span>
          <button onClick={() => void onLeave()} disabled={busy}>Leave lab</button>
        </div>
      </div>
      <FinalReviewForm session={session} busy={busy} onReview={onReview} />
    </section>;
  }

  if (!trial) return null;
  const trialNumber = session.currentTrialIndex + 1;
  return <section className="lab-workflow">
    <div className="trial-progress">
      <div><span className="lab-kicker">BLINDED TRIAL {trial.variantToken}</span><strong>{trialNumber} of {session.trialCount}</strong></div>
      <div className="lab-progress-actions">
        <span>{session.completedTrialTokens.length} complete</span>
        <button onClick={() => void onLeave()} disabled={busy}>Leave lab</button>
      </div>
    </div>
    {trial.status === "active" && <>
      <p className="lab-instruction">
        {match?.status === "active"
          ? "Play until the battlefield reports victory or defeat. A bookmark saves a note only; it does not advance the trial. The tuning and recommendation stay hidden."
          : `Battlefield result: ${match?.status ?? "loading"}. Complete the trial to record your explanation before reconstruction.`}
      </p>
      <div className="lab-toolbar">
        {match?.status === "active" && <button onClick={() => void onBookmark()} disabled={busy}>Bookmark note (does not advance)</button>}
        {match && match.status !== "active" && <button className="primary" onClick={() => void onCompleteTrial()} disabled={busy}>Complete trial</button>}
      </div>
    </>}
    {trial.status === "awaiting_pre_review" && <PreReviewForm
      trialId={trial.trialId}
      doctrine={Boolean(trial.doctrineCard)}
      busy={busy}
      onReview={onReview}
    />}
    {trial.status === "reconstruction_available" && <PostReviewForm trialId={trial.trialId} busy={busy} onReview={onReview} />}
  </section>;
}

function PreReviewForm({
  trialId,
  doctrine,
  busy,
  onReview
}: {
  trialId: string;
  doctrine: boolean;
  busy: boolean;
  onReview: (body: unknown) => Promise<void>;
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onReview({
      phase: "pre",
      trialId,
      answers: {
        bindingConstraint: data.get("bindingConstraint"),
        decisiveDecision: data.get("decisiveDecision"),
        replayChange: data.get("replayChange"),
        earnedRating: Number(data.get("earnedRating")),
        confidenceRating: Number(data.get("confidenceRating")),
        ...(doctrine ? {
          doctrineFollowed: data.get("doctrineFollowed") === "on",
          doctrineClassification: data.get("doctrineClassification"),
          doctrineDecisionRationale: data.get("doctrineDecisionRationale")
        } : {})
      }
    });
  }
  return <form className="lab-review-form" onSubmit={submit}>
    <div><span className="lab-kicker">BEFORE RECONSTRUCTION</span><h2>Lock in your read</h2></div>
    <label>What was the binding constraint?<textarea name="bindingConstraint" required /></label>
    <label>Which decision most affected the outcome?<textarea name="decisiveDecision" required /></label>
    <label>What would you change on a replay?<textarea name="replayChange" required /></label>
    <div className="rating-row">
      <Rating name="earnedRating" label="Did the result feel earned?" />
      <Rating name="confidenceRating" label="Confidence in your explanation?" />
    </div>
    {doctrine && <fieldset className="doctrine-review">
      <legend>Doctrine label</legend>
      <label className="check-label"><input type="checkbox" name="doctrineFollowed" /> I followed the proposed doctrine without overriding it.</label>
      <label>Classification<select name="doctrineClassification" required defaultValue="plausible">
        <option value="illegal">Illegal</option>
        <option value="incoherent">Incoherent</option>
        <option value="under-resourced">Under-resourced</option>
        <option value="misleading">Misleading</option>
        <option value="brittle">Brittle</option>
        <option value="plausible">Plausible</option>
        <option value="dominant">Dominant</option>
      </select></label>
      <label>Why did you follow or override it?<textarea name="doctrineDecisionRationale" required /></label>
    </fieldset>}
    <button className="primary" disabled={busy}>Reveal reconstruction</button>
  </form>;
}

function PostReviewForm({ trialId, busy, onReview }: { trialId: string; busy: boolean; onReview: (body: unknown) => Promise<void> }) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onReview({
      phase: "post",
      trialId,
      answers: {
        explanationChanged: data.get("explanationChanged") === "on",
        updatedExplanation: data.get("updatedExplanation"),
        missingOrMisleading: data.get("missingOrMisleading")
      }
    });
  }
  return <form className="lab-review-form" onSubmit={submit}>
    <div><span className="lab-kicker">AFTER RECONSTRUCTION</span><h2>Update your explanation</h2></div>
    <label className="check-label"><input type="checkbox" name="explanationChanged" /> The reconstruction changed my explanation.</label>
    <label>What is your explanation now?<textarea name="updatedExplanation" required /></label>
    <label>What information was missing or misleading during play?<textarea name="missingOrMisleading" required /></label>
    <button className="primary" disabled={busy}>Save and continue</button>
  </form>;
}

function FinalReviewForm({ session, busy, onReview }: { session: GameplayLabSessionView; busy: boolean; onReview: (body: unknown) => Promise<void> }) {
  const tokens = session.completedTrialTokens;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onReview({
      phase: "final",
      answers: {
        clearestTrialToken: data.get("clearestTrialToken"),
        fairestTrialToken: data.get("fairestTrialToken"),
        mostInterestingTrialToken: data.get("mostInterestingTrialToken"),
        comparisonNotes: data.get("comparisonNotes"),
        disposition: data.get("disposition"),
        dispositionRationale: data.get("dispositionRationale")
      }
    });
  }
  return <form className="lab-review-form" onSubmit={submit}>
    <p>Compare the anonymous trials before their treatments are revealed.</p>
    <div className="rating-row">
      <TokenSelect name="clearestTrialToken" label="Clearest decision" tokens={tokens} />
      <TokenSelect name="fairestTrialToken" label="Fairest result" tokens={tokens} />
      <TokenSelect name="mostInterestingTrialToken" label="Most interesting" tokens={tokens} />
    </div>
    <label>Comparison notes<textarea name="comparisonNotes" required /></label>
    <label>Disposition<select name="disposition" required defaultValue="revise">
      <option value="keep">Keep</option>
      <option value="revise">Revise</option>
      <option value="reject">Reject</option>
      <option value="needs-mechanic">Needs mechanic</option>
      <option value="needs-instrumentation">Needs instrumentation</option>
    </select></label>
    <label>Why this disposition?<textarea name="dispositionRationale" required /></label>
    <button className="primary" disabled={busy}>Reveal treatments and export</button>
  </form>;
}

function Rating({ name, label }: { name: string; label: string }) {
  return <label>{label}<select name={name} defaultValue="3" required>
    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
  </select></label>;
}

function TokenSelect({ name, label, tokens }: { name: string; label: string; tokens: string[] }) {
  return <label>{label}<select name={name} required>
    {tokens.map((token) => <option key={token} value={token}>Trial {token}</option>)}
  </select></label>;
}

function DoctrineCard({
  card,
  currentSlot
}: {
  card: NonNullable<NonNullable<GameplayLabSessionView["currentTrial"]>["doctrineCard"]>;
  currentSlot: number;
}) {
  return <div className="card doctrine-card">
    <div className="card-title"><span>Doctrine card</span><span className="selection-kind">optional</span></div>
    <p>{card.prompt}</p>
    <ol>
      {card.steps.map((step, index) => <li className={index === currentSlot ? "current" : index < currentSlot ? "past" : ""} key={`${step.unitId}-${index}`}>
        <code>{step.unitId}</code><strong>{actionMeta[step.action as Action]?.label ?? step.action}</strong>
        {step.rationale && <small>{step.rationale}</small>}
      </li>)}
    </ol>
    <p className="doctrine-note">Follow it or override it. Your actual orders remain the record.</p>
  </div>;
}

function SelectionInspector({ cell, entity, selectedUnit }: { cell: SelectedCell | null; entity?: UnitState; selectedUnit: string }) {
  const selection = !cell ? null : entity ? {
    kind: entity.ownerId === "enemy" ? "enemy_contact" : "friendly_unit",
    cell: { x: cell.x, y: cell.y },
    unit: { id: entity.unitId, chassis: entity.chassis, active: entity.active, heat: entity.heat, dispersion: entity.dispersion },
    command_target: entity.ownerId !== "enemy" && selectedUnit === entity.unitId
  } : {
    kind: "terrain",
    cell: { x: cell.x, y: cell.y },
    command_target: false
  };

  return <div className="card selection-card">
    <div className="card-title"><span>Selection</span><span className="selection-kind">json</span></div>
    <pre className="selection-json">{selection ? JSON.stringify(selection, null, 2) : "null"}</pre>
  </div>;
}

function TransactionConsole({ events }: { events: EventEnvelope[] }) {
  const visible = events.filter((event) => event.eventType !== "fire_control.snapshot");
  return <section className="transaction-console" aria-label="Transaction log">
    <div className="console-title"><span>Transaction log</span><span>{visible.length} events</span></div>
    <div className="console-body">
      {visible.length === 0
        ? <div className="console-empty">awaiting first command_</div>
        : visible.map((event) => <div className="console-line" key={event.eventId}>
          <span className="console-sequence">{String(event.sequence).padStart(3, "0")}</span>
          <span className="console-actor">{event.actorId ?? "system"}</span>
          <span className="console-event">{event.eventType}</span>
          <span className="console-data">{JSON.stringify(event.data)}</span>
        </div>)}
    </div>
  </section>;
}

function ReconstructionPanel({ report }: { report: Reconstruction | null }) {
  if (!report) return null;
  return <section className="reconstruction-panel" aria-label="Post-battle reconstruction">
    <div className="console-title"><span>Reconstruction</span><span>{report.status}</span></div>
    <div className="reconstruction-grid">
      <span>Actions</span><strong>{report.actionCount}</strong>
      <span>Rejected</span><strong>{report.rejectedCount}</strong>
      <span>Energy spent</span><strong>{report.commanderEnergySpent}</strong>
      <span>Objective</span><strong>{report.objectiveProgress}</strong>
    </div>
    <p className="reconstruction-copy"><strong>Counterfactual:</strong> {report.counterfactual.claim}</p>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

const requestedView = new URLSearchParams(window.location.search).get("view");
createRoot(document.getElementById("root")!).render(
  requestedView === "commander" ? <CommanderView /> : requestedView === "atlas" ? <LabAtlasView /> : <App />
);
