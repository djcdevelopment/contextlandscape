import { Fragment, useEffect, useMemo, useState } from "react";
import "./evidence-landscapes.css";

type Mode = "commander" | "artillery" | "desperation";
type CommanderCell = {
  id: string; x: number; y: number; appearances: number;
  modules: Record<"composition" | "movement" | "triage" | "capacity", string>;
  outcomes: Record<string, number | number[]>;
  abilities: Record<string, number>;
};
type ArtilleryCell = {
  id: string; x: number; y: number; package: string; supply: string; playerRuns: number;
  metrics: Record<string, number>; totals: Record<string, number>;
};
type TraceEntry = {
  round: number; decision: string; reasonCode: string; targetBasis: string;
  center: { x: number; y: number } | null;
  publicInputs: Record<string, number | boolean>;
};
type Exemplar = {
  opportunityId: string; runId: string; cohort: string; round: number; playerSlot: number;
  action: TraceEntry | null; trace: TraceEntry[];
  baseline: Record<string, number>;
  outcome: Record<string, number | string | boolean | null>;
};
type DesperationCoordinate = { actions: number; wins: number; immediateDriftDefeats: number; affectedArtifacts: number; affectedUnits: number };
type DesperationCohort = {
  opportunities: number; wins: number; immediateDriftDefeats: number;
  rounds: Record<string, { opportunities: number; fullPasses: number; fullActions: number; traceObserved: number; tracePasses: number; traceActions: number }>;
  coordinates: Record<string, Record<string, DesperationCoordinate>>;
};
type ContrastMetric = { n: number; mean: number; ci95: [number, number] };
type DoctrineContrast = { treatment: string; doctrine: string; score: ContrastMetric; progress: ContrastMetric; drift: ContrastMetric };
type Landscapes = {
  landscapeHash: string; generatedAt: string;
  commander: { dimensions: { columns: number; rows: number }; axes: Record<string, string[]>; metricIds: string[]; metricMaxima: Record<string, number>; defaults: { elevation: string; color: string }; cells: CommanderCell[]; sourcePath: string };
  artillery: { axes: { package: string[]; supply: string[] }; defaults: { elevation: string; color: string }; cells: ArtilleryCell[]; funnel: Record<string, number>; downstream: Record<string, number>; doctrineContrasts: DoctrineContrast[]; reloadSoloEffects: { byScenario: Array<{ level: string } & ContrastMetric> }; sourcePath: string; inference: { estimand: string; caveat: string } };
  desperation: { rounds: number[]; defaults: { cohort: string; round: number; elevation: string; color: string }; cohorts: Record<string, DesperationCohort>; published: Array<Record<string, number | string | number[]>>; contrasts: Array<Record<string, number | string>>; exemplars: Record<string, Record<string, Exemplar | null>>; exemplarSelection: Record<string, string>; sourcePath: string };
};

const palette = ["#071522", "#0d3446", "#16616a", "#318b73", "#7eaa70", "#d1bd70", "#fff0b0"];
const commanderLabels: Record<string, string> = {
  verified: "Verification", rejected: "Rejection", seized: "Seizure", assisted: "Assistance",
  movementDistance: "Movement", stationaryTurns: "Stationary turns", reconLockActivations: "Recon Lock",
  targetLocksGenerated: "Target Lock", targetLocksConsumed: "Locks consumed", uplinkAttentionGenerated: "Uplink",
  capacityClaims: "Capacity claims", perfectFocusUses: "Perfect Focus", overclockUses: "Overclock",
  macroFlareUses: "Macro Flare", flareAffectedArtifacts: "Flare artifacts", driftDefeatsInduced: "Drift defeats induced"
};
const artilleryLabels: Record<string, string> = {
  shellsPer1000PlayerRuns: "Shells / 1,000 runs", declarationRate: "Declaration rate",
  reloadsPer1000PlayerRuns: "Reloads / 1,000 runs", generatedPer1000PlayerRuns: "Artifacts / 1,000 runs",
  blockedPer1000PlayerRuns: "Blocks / 1,000 runs", driftDefeatsPer1000PlayerRuns: "Drift defeats / 1,000 runs"
};
const outcomeLabels: Record<string, string> = { scoreRate: "Score", winRate: "Win rate", meanProgress: "Progress", meanDrift: "Drift" };

function format(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function colorAt(value: number) {
  return palette[Math.min(palette.length - 1, Math.max(0, Math.floor(value * palette.length)))];
}

function updateQuery(values: Record<string, string | number>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
  window.history.replaceState(null, "", url);
}

async function fetchCompressedJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (response.headers.get("content-encoding")?.includes("gzip")) return response.json() as Promise<T>;
  const decompressed = response.body?.pipeThrough(new DecompressionStream("gzip"));
  if (!decompressed) throw new Error("This browser cannot decompress the landscape evidence package.");
  return new Response(decompressed).json() as Promise<T>;
}

function LandscapeNav({ mode }: { mode: Mode }) {
  return <nav className="evidence-nav" aria-label="Landscape mode">
    <a href="/?view=atlas">Research atlas</a>
    <a className={mode === "commander" ? "active" : ""} href="/?view=atlas&landscape=commander">Commander Field</a>
    <a className={mode === "artillery" ? "active" : ""} href="/?view=atlas&landscape=artillery">Artillery Relief</a>
    <a className={mode === "desperation" ? "active" : ""} href="/?view=atlas&landscape=desperation">Desperation Theatre</a>
  </nav>;
}

function CommanderField({ data }: { data: Landscapes["commander"] }) {
  const query = new URLSearchParams(window.location.search);
  const [metric, setMetric] = useState(query.get("metric") && data.metricIds.includes(query.get("metric")!) ? query.get("metric")! : data.defaults.elevation);
  const [color, setColor] = useState(query.get("color") && outcomeLabels[query.get("color")!] ? query.get("color")! : data.defaults.color);
  const [selectedId, setSelectedId] = useState(query.get("cell") && data.cells.some((cell) => cell.id === query.get("cell")) ? query.get("cell")! : data.cells[0].id);
  const selected = data.cells.find((cell) => cell.id === selectedId)!;
  const maximum = data.metricMaxima[metric] || 1;
  const outcomeValues = data.cells.map((cell) => Number(cell.outcomes[color] ?? 0));
  const outcomeMin = Math.min(...outcomeValues), outcomeMax = Math.max(...outcomeValues);
  return <>
    <section className="evidence-controls">
      <label>Elevation<select value={metric} onChange={(event) => { setMetric(event.target.value); updateQuery({ metric: event.target.value }); }}>{data.metricIds.map((id) => <option key={id} value={id}>{commanderLabels[id] ?? id}</option>)}</select></label>
      <label>Color overlay<select value={color} onChange={(event) => { setColor(event.target.value); updateQuery({ color: event.target.value }); }}>{Object.entries(outcomeLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <span className="evidence-definition">Height = uses per commander appearance · color = {outcomeLabels[color].toLowerCase()}</span>
    </section>
    <section className="evidence-layout">
      <div className="terrain-panel commander-terrain">
        <svg viewBox="0 0 900 900" role="img" aria-label={`Commander ability terrain by ${commanderLabels[metric] ?? metric}`}>
          <rect width="900" height="900" fill="#06101a" />
          <g transform="translate(58 58)">
            {data.cells.map((cell) => {
              const elevation = (cell.abilities[metric] ?? 0) / maximum;
              const outcome = (Number(cell.outcomes[color] ?? 0) - outcomeMin) / Math.max(1e-9, outcomeMax - outcomeMin);
              const select = () => { setSelectedId(cell.id); updateQuery({ cell: cell.id }); };
              return <rect key={cell.id} x={cell.x * 9.75} y={cell.y * 9.75} width="9.2" height="9.2" rx="1" fill={colorAt(elevation)} stroke={outcome > .72 ? "#ffda75" : outcome < .28 ? "#da7185" : "transparent"} strokeWidth={cell.id === selectedId ? 2.2 : .7} onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") select(); }} role="button" tabIndex={0} aria-label={`${cell.id}, ${format(cell.abilities[metric] ?? 0, 4)} ${commanderLabels[metric] ?? metric}`} className="terrain-cell"><title>{cell.id} · {format(cell.abilities[metric] ?? 0, 4)} {commanderLabels[metric] ?? metric}</title></rect>;
            })}
            {Array.from({ length: 7 }, (_, index) => <line key={`v${index}`} x1={(index + 1) * 97.5} x2={(index + 1) * 97.5} y1="0" y2="780" className="minor-boundary" />)}
            {Array.from({ length: 9 }, (_, index) => <line key={`V${index}`} x1={(index + 1) * 78} x2={(index + 1) * 78} y1="0" y2="780" className="major-boundary" />)}
            {Array.from({ length: 7 }, (_, index) => <line key={`h${index}`} y1={(index + 1) * 97.5} y2={(index + 1) * 97.5} x1="0" x2="780" className="minor-boundary" />)}
            {Array.from({ length: 9 }, (_, index) => <line key={`H${index}`} y1={(index + 1) * 78} y2={(index + 1) * 78} x1="0" x2="780" className="major-boundary" />)}
          </g>
          <text x="450" y="870" textAnchor="middle" className="terrain-axis">composition → movement doctrine</text>
          <text x="18" y="450" textAnchor="middle" transform="rotate(-90 18 450)" className="terrain-axis">triage → capacity doctrine</text>
        </svg>
        <div className="terrain-legend"><span>low use</span><i /><span>high use</span><b>amber edge = high outcome · rose edge = low outcome</b></div>
      </div>
      <aside className="evidence-inspector">
        <p className="evidence-kicker">COMMANDER · {selected.id}</p><h2>{commanderLabels[metric] ?? metric}</h2>
        <strong className="hero-number">{format(selected.abilities[metric] ?? 0, 4)}</strong><span className="hero-unit">uses per appearance</span>
        <dl>{Object.entries(selected.modules).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}</dl>
        <div className="outcome-strip">{Object.entries(outcomeLabels).map(([id, label]) => <span key={id}><small>{label}</small><strong>{format(Number(selected.outcomes[id]), 4)}</strong></span>)}</div>
        <p className="source-note">Source: <code>{data.sourcePath}</code></p>
      </aside>
    </section>
    <details className="evidence-table"><summary>Exact commander values</summary><div><table><thead><tr><th>Commander</th><th>Composition</th><th>Movement</th><th>Triage</th><th>Capacity</th><th>{commanderLabels[metric] ?? metric}</th><th>{outcomeLabels[color]}</th></tr></thead><tbody>{data.cells.map((cell) => <tr key={cell.id}><td>{cell.id}</td><td>{cell.modules.composition}</td><td>{cell.modules.movement}</td><td>{cell.modules.triage}</td><td>{cell.modules.capacity}</td><td>{format(cell.abilities[metric] ?? 0, 6)}</td><td>{format(Number(cell.outcomes[color]), 6)}</td></tr>)}</tbody></table></div></details>
  </>;
}

function ArtilleryRelief({ data }: { data: Landscapes["artillery"] }) {
  const query = new URLSearchParams(window.location.search);
  const metrics = Object.keys(data.cells[0].metrics);
  const [metric, setMetric] = useState(query.get("metric") && metrics.includes(query.get("metric")!) ? query.get("metric")! : data.defaults.elevation);
  const [risk, setRisk] = useState(query.get("color") && metrics.includes(query.get("color")!) ? query.get("color")! : data.defaults.color);
  const [selectedId, setSelectedId] = useState(query.get("cell") && data.cells.some((cell) => cell.id === query.get("cell")) ? query.get("cell")! : "combined:reload");
  const [doctrine, setDoctrine] = useState(query.get("doctrine") ?? "v3-adaptive-artillery");
  const [scenario, setScenario] = useState(query.get("scenario") ?? data.reloadSoloEffects.byScenario[0].level);
  const selected = data.cells.find((cell) => cell.id === selectedId)!;
  const supportedContrasts = data.doctrineContrasts.filter((row) => row.treatment === selectedId);
  const causal = supportedContrasts.find((row) => row.doctrine === doctrine) ?? supportedContrasts[0] ?? null;
  const scenarioEffect = data.reloadSoloEffects.byScenario.find((row) => row.level === scenario) ?? data.reloadSoloEffects.byScenario[0];
  const maximum = Math.max(...data.cells.map((cell) => cell.metrics[metric] ?? 0), 1e-9);
  const riskMaximum = Math.max(...data.cells.map((cell) => cell.metrics[risk] ?? 0), 1e-9);
  return <>
    <section className="evidence-controls">
      <label>Elevation<select value={metric} onChange={(event) => { setMetric(event.target.value); updateQuery({ metric: event.target.value }); }}>{metrics.map((id) => <option key={id} value={id}>{artilleryLabels[id] ?? id}</option>)}</select></label>
      <label>Color overlay<select value={risk} onChange={(event) => { setRisk(event.target.value); updateQuery({ color: event.target.value }); }}>{metrics.map((id) => <option key={id} value={id}>{artilleryLabels[id] ?? id}</option>)}</select></label>
      <label>Causal doctrine<select value={causal?.doctrine ?? ""} onChange={(event) => { setDoctrine(event.target.value); updateQuery({ doctrine: event.target.value }); }} disabled={!causal}>{supportedContrasts.length ? supportedContrasts.map((row) => <option key={row.doctrine}>{row.doctrine}</option>) : <option>No treatment contrast</option>}</select></label>
      <label>Reload scenario<select value={scenarioEffect.level} onChange={(event) => { setScenario(event.target.value); updateQuery({ scenario: event.target.value }); }}>{data.reloadSoloEffects.byScenario.map((row) => <option key={row.level}>{row.level}</option>)}</select></label>
      <span className="evidence-definition">Height = normalized usage · color = selected mechanism/risk rate</span>
    </section>
    <section className="evidence-layout">
      <div className="terrain-panel artillery-terrain">
        <svg viewBox="0 0 980 610" role="img" aria-label="Artillery package and supply relief">
          <defs><radialGradient id="hill" cx="42%" cy="35%"><stop offset="0" stopColor="#fff3ba"/><stop offset=".4" stopColor="#75aa76"/><stop offset="1" stopColor="#0c394b"/></radialGradient></defs>
          <rect width="980" height="610" fill="#06101a" />
          {data.cells.map((cell) => {
            const elevation = cell.metrics[metric] / maximum;
            const danger = cell.metrics[risk] / riskMaximum;
            const cx = 150 + cell.x * 225, cy = 180 + cell.y * 245;
            const radius = 28 + elevation * 72;
            const select = () => { setSelectedId(cell.id); updateQuery({ cell: cell.id }); };
            return <g key={cell.id} className="artillery-hill" onClick={select} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") select(); }} role="button" tabIndex={0} aria-label={`${cell.package} ${cell.supply}, ${format(cell.metrics[metric], 3)} ${artilleryLabels[metric]}`}>
              {Array.from({ length: 4 }, (_, ring) => <ellipse key={ring} cx={cx} cy={cy + ring * 3} rx={radius * (1 - ring * .17)} ry={radius * .54 * (1 - ring * .17)} fill={ring === 0 ? "url(#hill)" : "none"} stroke={`rgb(${Math.round(210 + danger * 41)} ${Math.round(232 - danger * 119)} ${Math.round(200 - danger * 65)})`} strokeOpacity={.25 + ring * .16} strokeWidth={cell.id === selectedId && ring === 0 ? 4 : 1.4} />)}
              <text x={cx} y={cy + radius * .75 + 25} textAnchor="middle" className="hill-value">{format(cell.metrics[metric], 2)}</text>
            </g>;
          })}
          {data.axes.package.map((label, index) => <text key={label} x={150 + index * 225} y="570" textAnchor="middle" className="terrain-axis">{label}</text>)}
          <text x="25" y="180" className="terrain-axis">one-shot</text><text x="25" y="425" className="terrain-axis">reload</text>
        </svg>
      </div>
      <aside className="evidence-inspector">
        <p className="evidence-kicker">{selected.package} · {selected.supply}</p><h2>{artilleryLabels[metric]}</h2>
        <strong className="hero-number">{format(selected.metrics[metric], 3)}</strong><span className="hero-unit">normalized mechanism rate</span>
        <dl>{Object.entries(selected.metrics).map(([key, value]) => <Fragment key={key}><dt>{artilleryLabels[key] ?? key}</dt><dd>{format(value, 4)}</dd></Fragment>)}</dl>
        {causal && <div className="causal-card"><strong>{causal.doctrine}</strong><span>treatment − pass control</span><dl><dt>Score effect</dt><dd>{format(causal.score.mean, 4)} [{format(causal.score.ci95[0], 4)}, {format(causal.score.ci95[1], 4)}]</dd><dt>Progress effect</dt><dd>{format(causal.progress.mean, 4)} [{format(causal.progress.ci95[0], 4)}, {format(causal.progress.ci95[1], 4)}]</dd><dt>Drift effect</dt><dd>{format(causal.drift.mean, 4)} [{format(causal.drift.ci95[0], 4)}, {format(causal.drift.ci95[1], 4)}]</dd></dl></div>}
        <div className="causal-card"><strong>{scenarioEffect.level}</strong><span>flare-solo reload increment</span><dl><dt>Score effect</dt><dd>{format(scenarioEffect.mean, 4)} [{format(scenarioEffect.ci95[0], 4)}, {format(scenarioEffect.ci95[1], 4)}]</dd><dt>Matched cells</dt><dd>{format(scenarioEffect.n, 0)}</dd></dl></div>
        <div className="method-box"><strong>Estimand</strong><p>{data.inference.estimand}</p><small>{data.inference.caveat}</small></div>
        <p className="source-note">Source: <code>{data.sourcePath}</code></p>
      </aside>
    </section>
    <details className="evidence-table"><summary>Exact artillery values</summary><div><table><thead><tr><th>Package</th><th>Supply</th>{metrics.map((id) => <th key={id}>{artilleryLabels[id] ?? id}</th>)}</tr></thead><tbody>{data.cells.map((cell) => <tr key={cell.id}><td>{cell.package}</td><td>{cell.supply}</td>{metrics.map((id) => <td key={id}>{format(cell.metrics[id], 6)}</td>)}</tr>)}</tbody></table></div></details>
  </>;
}

function DesperationTheatre({ data }: { data: Landscapes["desperation"] }) {
  const query = new URLSearchParams(window.location.search);
  const cohorts = Object.keys(data.cohorts);
  const [cohort, setCohort] = useState(query.get("cohort") && cohorts.includes(query.get("cohort")!) ? query.get("cohort")! : data.defaults.cohort);
  const [roundNumber, setRoundNumber] = useState(Math.min(5, Math.max(1, Number(query.get("round")) || data.defaults.round)));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(Math.min(2, Math.max(.5, Number(query.get("speed")) || 1)));
  const [colorLayer, setColorLayer] = useState(query.get("color") ?? "winRate");
  const [view, setView] = useState<"aggregate" | "exemplar">(query.get("replay") === "exemplar" ? "exemplar" : "aggregate");
  const [exampleKind, setExampleKind] = useState(query.get("exemplar") ?? "median");
  const cohortData = data.cohorts[cohort];
  const exemplar = data.exemplars[cohort][exampleKind];
  useEffect(() => {
    if (!playing) return;
    const handle = window.setInterval(() => setRoundNumber((value) => { const next = value >= 5 ? 1 : value + 1; updateQuery({ round: next }); return next; }), 1100 / speed);
    return () => window.clearInterval(handle);
  }, [playing, speed]);
  const board = useMemo(() => Array.from({ length: 100 }, (_, index) => {
    const x = index % 10, y = Math.floor(index / 10);
    const coordinate = cohortData.coordinates[`${x},${y}`]?.[roundNumber] ?? { actions: 0, wins: 0, immediateDriftDefeats: 0, affectedArtifacts: 0, affectedUnits: 0 };
    return { x, y, ...coordinate };
  }), [cohortData, roundNumber]);
  const maximum = Math.max(...board.map((cell) => cell.actions), 1);
  const rawColor = (cell: DesperationCoordinate) => cell.actions === 0 ? 0 : colorLayer === "immediateDriftRate"
    ? cell.immediateDriftDefeats / cell.actions
    : colorLayer === "affectedArtifactsPerAction"
      ? cell.affectedArtifacts / cell.actions
      : colorLayer === "affectedUnitsPerAction"
        ? cell.affectedUnits / cell.actions
        : cell.wins / cell.actions;
  const colorMaximum = colorLayer === "winRate" || colorLayer === "immediateDriftRate" ? 1 : Math.max(...board.map(rawColor), 1e-9);
  const roundStats = cohortData.rounds[roundNumber];
  const traceEntry = exemplar?.trace.find((entry) => entry.round === roundNumber) ?? null;
  return <>
    <section className="evidence-controls desperation-controls">
      <div className="segmented"><button className={view === "aggregate" ? "active" : ""} onClick={() => { setView("aggregate"); updateQuery({ replay: "aggregate" }); }}>Aggregate rounds</button><button className={view === "exemplar" ? "active" : ""} onClick={() => { setView("exemplar"); updateQuery({ replay: "exemplar" }); }}>Decision exemplar</button></div>
      <label>Cohort<select value={cohort} onChange={(event) => { setCohort(event.target.value); setExampleKind("median"); updateQuery({ cohort: event.target.value, exemplar: "median" }); }}>{cohorts.map((id) => <option key={id}>{id}</option>)}</select></label>
      {view === "exemplar" && <label>Example<select value={exampleKind} onChange={(event) => { setExampleKind(event.target.value); updateQuery({ exemplar: event.target.value }); }}>{Object.keys(data.exemplars[cohort]).map((id) => <option key={id} value={id} disabled={!data.exemplars[cohort][id]}>{id}{!data.exemplars[cohort][id] ? " (unavailable)" : ""}</option>)}</select></label>}
      {view === "aggregate" && <label>Cap color<select value={colorLayer} onChange={(event) => { setColorLayer(event.target.value); updateQuery({ color: event.target.value }); }}><option value="winRate">Win share</option><option value="immediateDriftRate">Immediate drift defeat</option><option value="affectedArtifactsPerAction">Artifacts affected / action</option><option value="affectedUnitsPerAction">Units affected / action</option></select></label>}
      <button onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
      <label>Speed<select value={speed} onChange={(event) => { setSpeed(Number(event.target.value)); updateQuery({ speed: event.target.value }); }}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      <input aria-label="Round" type="range" min="1" max="5" value={roundNumber} onChange={(event) => { setRoundNumber(Number(event.target.value)); updateQuery({ round: event.target.value }); }} />
      <output>Round {roundNumber}</output>
    </section>
    <section className="evidence-layout">
      <div className="terrain-panel desperation-board">
        <div className="board-heading"><span>10×10 true target coordinates · 1-in-64 trace sample</span><strong>{view === "aggregate" ? `${format(roundStats.traceActions, 0)} traced spatial actions · ${format(roundStats.traceObserved, 0)} traced decision phases` : `${exampleKind} deterministic exemplar`}</strong></div>
        <div className="desperation-grid">{board.map((cell) => {
          const activeExample = view === "exemplar" && traceEntry?.center?.x === cell.x && traceEntry.center.y === cell.y;
          const elevation = view === "aggregate" ? cell.actions / maximum : activeExample ? 1 : 0;
          const rate = rawColor(cell) / colorMaximum;
          return <div key={`${cell.x},${cell.y}`} className={`desperation-cell ${activeExample ? "impact" : ""}`} style={{ "--elevation": elevation, "--terrain": colorAt(elevation), "--outcome": colorAt(rate) } as React.CSSProperties}><i /><span>{cell.x},{cell.y}</span>{view === "aggregate" && cell.actions > 0 && <strong>{cell.actions}</strong>}</div>;
        })}</div>
        <div className="desperation-legend"><span>Height = actions / 1,000 trace-observed decision phases, normalized to round maximum</span><span>Cap color = {colorLayer.replaceAll(/([A-Z])/g, " $1").toLowerCase()}</span></div>
      </div>
      <aside className="evidence-inspector">
        <p className="evidence-kicker">{cohort} · round {roundNumber}</p>
        {view === "aggregate" ? <>
          <h2>Aggregate decision field</h2><strong className="hero-number">{format(roundStats.fullActions / Math.max(1, roundStats.opportunities) * 1000, 3)}</strong><span className="hero-unit">actions / 1,000 full-cohort opportunities this round</span>
          <dl><dt>Full opportunities</dt><dd>{format(roundStats.opportunities, 0)}</dd><dt>Full actions</dt><dd>{format(roundStats.fullActions, 0)}</dd><dt>Traced phases</dt><dd>{format(roundStats.traceObserved, 0)}</dd><dt>Traced passes</dt><dd>{format(roundStats.tracePasses, 0)}</dd><dt>Traced spatial actions</dt><dd>{format(roundStats.traceActions, 0)}</dd><dt>Cohort wins</dt><dd>{format(cohortData.wins, 0)}</dd></dl>
        </> : exemplar ? <>
          <h2>{traceEntry ? `${traceEntry.decision} · ${traceEntry.reasonCode}` : "No decision recorded this round"}</h2>
          <strong className="hero-number">{String(exemplar.outcome.won ? "WIN" : "LOSS")}</strong><span className="hero-unit">{String(exemplar.outcome.terminalReason)} terminal</span>
          <dl><dt>Action round</dt><dd>{exemplar.round}</dd><dt>Progress gap</dt><dd>{exemplar.baseline.progressGap}</dd><dt>Final progress</dt><dd>{String(exemplar.outcome.finalProgress)}</dd><dt>Final drift</dt><dd>{String(exemplar.outcome.finalDrift)}</dd><dt>Target</dt><dd>{traceEntry?.center ? `${traceEntry.center.x},${traceEntry.center.y}` : "pass / none"}</dd></dl>
          <p className="trace-boundary">This is the recorded artillery-decision trace, not a reconstructed full unit replay.</p><code className="run-id">{exemplar.runId}</code>
        </> : <h2>This exemplar is unavailable for the selected cohort.</h2>}
        <p className="source-note">Source: <code>{data.sourcePath}</code></p>
      </aside>
    </section>
    <details className="evidence-table"><summary>Exact round and coordinate values</summary><div><table><thead><tr><th>Cohort</th><th>Round</th><th>Coordinate</th><th>Actions</th><th>Wins</th><th>Immediate drift defeats</th><th>Affected artifacts</th><th>Affected units</th></tr></thead><tbody>{Object.entries(data.cohorts).flatMap(([cohortId, value]) => Object.entries(value.coordinates).flatMap(([coordinate, rounds]) => Object.entries(rounds).filter(([, row]) => row.actions > 0).map(([roundId, row]) => <tr key={`${cohortId}-${coordinate}-${roundId}`}><td>{cohortId}</td><td>{roundId}</td><td>{coordinate}</td><td>{row.actions}</td><td>{row.wins}</td><td>{row.immediateDriftDefeats}</td><td>{row.affectedArtifacts}</td><td>{row.affectedUnits}</td></tr>)))}</tbody></table></div></details>
  </>;
}

export function EvidenceLandscapeView({ mode }: { mode: Mode }) {
  const [data, setData] = useState<Landscapes | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetchCompressedJson<Landscapes>("/atlas/lab-landscapes-v1.json.gz").then(setData).catch((caught) => setError(String(caught))); }, []);
  const titles: Record<Mode, [string, string]> = {
    commander: ["Commander Field", "Watch 6,400 doctrines express abilities across the corrected causal screen."],
    artillery: ["Artillery Relief", "Read shell usage, supply, downstream mechanisms, and risk as distinct terrain layers."],
    desperation: ["Desperation Theatre", "Watch HE, Smoke, and passive decisions accumulate over real rounds and coordinates."]
  };
  return <main className="atlas-shell evidence-shell">
    <header className="atlas-header"><div><p className="atlas-eyebrow">CONTEXT LANDSCAPE · EVIDENCE CARTOGRAPHY</p><h1>{titles[mode][0]}</h1><p className="atlas-lede">{titles[mode][1]}</p></div><a className="return-field" href="/">Return to field lab</a></header>
    <LandscapeNav mode={mode} />
    {error ? <div className="atlas-error">Could not load landscape evidence: {error}</div> : !data ? <div className="atlas-loading">Resolving terrain from evidence…</div> : mode === "commander" ? <CommanderField data={data.commander} /> : mode === "artillery" ? <ArtilleryRelief data={data.artillery} /> : <DesperationTheatre data={data.desperation} />}
    {data && <footer className="atlas-provenance"><span>Generated {new Date(data.generatedAt).toLocaleString()}</span><code>{data.landscapeHash}</code></footer>}
  </main>;
}
