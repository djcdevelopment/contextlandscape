import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import "./lab-atlas.css";

type MetricId = "runVolume" | "evidenceDepth" | "artifactCompleteness";
type AtlasNode = {
  id: string;
  path: string;
  family: string;
  runs: number | null;
  campaignKind: string | null;
  modelVersion: string | null;
  evidenceTier: string;
  hasManifest: boolean;
  hasReport: boolean;
  hasAssessment: boolean;
  x: number;
  y: number;
  metrics: Record<MetricId, number | null>;
};
type AtlasField = { columns: number; rows: number; contourBands: number; values: number[] };
type Atlas = {
  atlasId: string;
  generatedAt: string;
  atlasHash: string;
  coordinateSemantics: { x: string; y: string; warning: string };
  familyOrder: string[];
  metrics: Record<MetricId, { label: string }>;
  style: { palette: string[]; contour: string; unknown: string };
  totals: { labs: number; recordedRuns: number; labsWithRecordedRuns: number; labsWithoutRecordedRuns: number };
  nodes: AtlasNode[];
  fields: Record<MetricId, AtlasField>;
};
type LandscapeCatalogEntry = {
  id: string;
  purpose: string;
  adapter: "commander-field" | "artillery-relief" | "desperation-theatre" | null;
  capabilities: Record<string, boolean>;
};

const metricOrder: MetricId[] = ["runVolume", "evidenceDepth", "artifactCompleteness"];
const viewport = { width: 1200, height: 760 };
const map = { x: 64, y: 74, width: 1072, height: 604 };

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function metricValue(node: AtlasNode, metric: MetricId) {
  const value = node.metrics[metric];
  return value === null ? "not reported" : `${Math.round(value * 100)}% normalized`;
}

function artifactList(node: AtlasNode) {
  return [node.hasManifest && "manifest", node.hasReport && "report", node.hasAssessment && "assessment"].filter(Boolean).join(" · ") || "none cataloged";
}

function landscapeFor(entry: LandscapeCatalogEntry | undefined) {
  if (entry?.adapter === "commander-field") return "commander";
  if (entry?.adapter === "artillery-relief") return "artillery";
  if (entry?.adapter === "desperation-theatre") return "desperation";
  return null;
}

export function LabAtlasView() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [landscapeCatalog, setLandscapeCatalog] = useState<LandscapeCatalogEntry[]>([]);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<MetricId>("runVolume");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    void fetch("/atlas/lab-topography-v1.json")
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json() as Promise<Atlas>;
      })
      .then((payload) => {
        setAtlas(payload);
        setSelectedId(payload.nodes.reduce((largest, node) => (node.runs ?? -1) > (largest.runs ?? -1) ? node : largest, payload.nodes[0])?.id ?? null);
      })
      .catch((caught) => setError(String(caught)));
    void fetch("/atlas/lab-landscapes-v1.json.gz").then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        if (response.headers.get("content-encoding")?.includes("gzip")) return response.json() as Promise<{ catalog: LandscapeCatalogEntry[] }>;
        const decompressed = response.body?.pipeThrough(new DecompressionStream("gzip"));
        if (!decompressed) throw new Error("This browser cannot decompress the landscape catalog.");
        return new Response(decompressed).json() as Promise<{ catalog: LandscapeCatalogEntry[] }>;
      })
      .then((payload) => setLandscapeCatalog(payload.catalog))
      .catch(() => undefined);
  }, []);

  const selected = atlas?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedLandscape = selected ? landscapeCatalog.find((entry) => entry.id === selected.id) : undefined;
  const field = atlas?.fields[metric];
  const contourPath = useMemo(() => {
    if (!field) return "";
    const band = (value: number) => Math.floor(value * field.contourBands);
    const cellWidth = map.width / field.columns;
    const cellHeight = map.height / field.rows;
    const parts: string[] = [];
    field.values.forEach((value, index) => {
      const column = index % field.columns;
      const row = Math.floor(index / field.columns);
      const current = band(value);
      const x = map.x + column * cellWidth;
      const y = map.y + row * cellHeight;
      if (column > 0 && band(field.values[index - 1]) !== current) parts.push(`M${x.toFixed(2)},${y.toFixed(2)}v${cellHeight.toFixed(2)}`);
      if (row > 0 && band(field.values[index - field.columns]) !== current) parts.push(`M${x.toFixed(2)},${y.toFixed(2)}h${cellWidth.toFixed(2)}`);
    });
    return parts.join("");
  }, [field]);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function adjustZoom(next: number) {
    setZoom(Math.min(4.5, Math.max(1, next)));
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-atlas-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const scale = viewport.width / event.currentTarget.getBoundingClientRect().width / zoom;
    setPan({ x: active.panX - (event.clientX - active.x) * scale, y: active.panY - (event.clientY - active.y) * scale });
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    adjustZoom(zoom * (event.deltaY < 0 ? 1.14 : 0.88));
  }

  if (error) return <main className="atlas-shell"><div className="atlas-error">Could not load the atlas: {error}</div></main>;
  if (!atlas || !field) return <main className="atlas-shell"><div className="atlas-loading">Surveying the research landscape…</div></main>;

  const viewBox = `${pan.x} ${pan.y} ${viewport.width / zoom} ${viewport.height / zoom}`;
  const cellWidth = map.width / field.columns;
  const cellHeight = map.height / field.rows;

  return <main className="atlas-shell">
    <header className="atlas-header">
      <div>
        <p className="atlas-eyebrow">CONTEXT LANDSCAPE · EVIDENCE CARTOGRAPHY</p>
        <h1>All-labs topography</h1>
        <p className="atlas-lede">An inspectable terrain model of research scale, evidence depth, and artifact coverage.</p>
      </div>
      <div className="atlas-summary" aria-label="Atlas totals">
        <span><strong>{atlas.totals.labs}</strong> labs</span>
        <span><strong>{formatInteger(atlas.totals.recordedRuns)}</strong> recorded runs</span>
        <a href="/">Return to field lab</a>
      </div>
    </header>

    <nav className="evidence-nav" aria-label="Landscape mode">
      <a className="active" href="/?view=atlas">Research atlas</a>
      <a href="/?view=atlas&landscape=commander">Commander Field</a>
      <a href="/?view=atlas&landscape=artillery">Artillery Relief</a>
      <a href="/?view=atlas&landscape=desperation">Desperation Theatre</a>
    </nav>

    <section className="atlas-toolbar" aria-label="Map controls">
      <div className="atlas-metrics">
        {metricOrder.map((id) => <button key={id} className={metric === id ? "active" : ""} onClick={() => setMetric(id)}>
          {atlas.metrics[id].label}
        </button>)}
      </div>
      <div className="atlas-zoom">
        <button aria-label="Zoom out" onClick={() => adjustZoom(zoom / 1.3)}>−</button>
        <output>{Math.round(zoom * 100)}%</output>
        <button aria-label="Zoom in" onClick={() => adjustZoom(zoom * 1.3)}>+</button>
        <button onClick={resetView}>Reset</button>
      </div>
    </section>

    <section className="atlas-layout">
      <div className="atlas-map-frame">
        <svg
          className="atlas-map"
          viewBox={viewBox}
          role="img"
          aria-label={`All-labs terrain by ${atlas.metrics[metric].label}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <defs>
            <filter id="atlas-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <rect width={viewport.width} height={viewport.height} fill="#06101a" />
          <g className="atlas-field">
            {field.values.map((value, index) => {
              const column = index % field.columns;
              const row = Math.floor(index / field.columns);
              const color = atlas.style.palette[Math.min(atlas.style.palette.length - 1, Math.floor(value * atlas.style.palette.length))];
              return <rect key={index} x={map.x + column * cellWidth} y={map.y + row * cellHeight} width={cellWidth + .35} height={cellHeight + .35} fill={color} />;
            })}
            <path d={contourPath} fill="none" stroke={atlas.style.contour} strokeOpacity=".17" strokeWidth=".65" vectorEffect="non-scaling-stroke" />
          </g>
          {atlas.familyOrder.slice(1).map((_, index) => {
            const x = map.x + map.width * ((index + 1) / atlas.familyOrder.length);
            return <line key={x} x1={x} y1={map.y} x2={x} y2={map.y + map.height} stroke="#d7eee7" strokeOpacity=".14" strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />;
          })}
          {atlas.familyOrder.map((family, index) => <text key={family} className="atlas-family-label" x={map.x + map.width * ((index + .5) / atlas.familyOrder.length)} y={map.y - 20} textAnchor="middle">{family}</text>)}
          <g>
            {atlas.nodes.map((node) => {
              const value = node.metrics[metric];
              const selectedNode = node.id === selectedId;
              const radius = value === null ? 4.2 : 4.5 + value * 7;
              return <g key={node.id} data-atlas-node className={`atlas-node ${selectedNode ? "selected" : ""}`} transform={`translate(${map.x + node.x * map.width} ${map.y + node.y * map.height})`} onClick={() => setSelectedId(node.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(node.id); }} aria-label={`${node.id}, ${metricValue(node, metric)}`}>
                {selectedNode && <circle r={radius + 8} className="atlas-node-pulse" />}
                <circle r={radius} fill={value === null ? atlas.style.unknown : "#fff0b0"} className={value === null ? "unknown" : "known"} />
              </g>;
            })}
          </g>
          <text x={map.x} y={724} className="atlas-footnote">Drag to pan · wheel or controls to zoom · select a survey marker for provenance</text>
        </svg>
        <div className="atlas-scale" aria-label="Elevation scale">
          <span>low</span><i style={{ background: `linear-gradient(90deg, ${atlas.style.palette.join(",")})` }} /><span>high</span>
        </div>
      </div>

      <aside className="atlas-inspector">
        {selected ? <>
          <p className="atlas-kicker">{selected.family} · {selected.evidenceTier}</p>
          <h2>{selected.id}</h2>
          <dl>
            <dt>Recorded runs</dt><dd>{selected.runs === null ? "Not reported" : formatInteger(selected.runs)}</dd>
            <dt>Current elevation</dt><dd>{metricValue(selected, metric)}</dd>
            <dt>Campaign kind</dt><dd>{selected.campaignKind ?? "Not cataloged"}</dd>
            <dt>Model version</dt><dd>{selected.modelVersion ?? "Not cataloged"}</dd>
            <dt>Artifacts</dt><dd>{artifactList(selected)}</dd>
            <dt>Source</dt><dd><code>{selected.path}</code></dd>
            {selectedLandscape && <><dt>Lab purpose</dt><dd>{selectedLandscape.purpose}</dd><dt>Landscape data</dt><dd>{Object.entries(selectedLandscape.capabilities).filter(([, available]) => available).map(([name]) => name).join(" · ")}</dd></>}
          </dl>
          <div className="atlas-mini-bars">
            {metricOrder.map((id) => <div key={id}><span>{atlas.metrics[id].label}</span><i><b style={{ width: `${(selected.metrics[id] ?? 0) * 100}%` }} /></i><output>{selected.metrics[id] === null ? "unknown" : `${Math.round((selected.metrics[id] ?? 0) * 100)}%`}</output></div>)}
          </div>
          {landscapeFor(selectedLandscape) ? <a className="atlas-open-landscape" href={`/?view=atlas&landscape=${landscapeFor(selectedLandscape)}`}>Open evidence landscape</a> : <p className="atlas-no-landscape">Catalog-level evidence only in this release.</p>}
        </> : <p>Select a lab marker to inspect its provenance.</p>}
        <div className="atlas-method-note">
          <strong>Map semantics</strong>
          <p>{atlas.coordinateSemantics.warning}</p>
          <p>Labs without a reported run count remain visible as gray survey markers and are not silently counted as zero.</p>
        </div>
      </aside>
    </section>
    <footer className="atlas-provenance"><span>Generated {new Date(atlas.generatedAt).toLocaleString()}</span><code>{atlas.atlasHash}</code></footer>
  </main>;
}
