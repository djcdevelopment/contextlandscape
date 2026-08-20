import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { AttentionV4Coordinate, BattleCommandV3View } from "@landscape/contracts";

type Selection = { kind: "unit" | "artifact"; id: string } | { kind: "cell"; at: AttentionV4Coordinate };
type Camera = { zoom: number; yaw: number; panX: number; panY: number };

export type PerspectiveBoardProps = {
  view: BattleCommandV3View;
  selection: Selection | null;
  target: AttentionV4Coordinate | null;
  onSelect: (selection: Selection) => void;
  onCell: (coordinate: AttentionV4Coordinate) => void;
  unitArt: (unitId: string) => string | undefined;
  battlefieldArt?: string;
  uiScale?: number;
};

function displayChassis(chassis: "scout" | "line" | "heavy"): string {
  return chassis === "scout" ? "Scout" : chassis === "line" ? "Line" : "Heavy";
}

const imageCache = new Map<string, HTMLImageElement>();

function imageFor(src: string | undefined, repaint: () => void): HTMLImageElement | undefined {
  if (!src) return undefined;
  let image = imageCache.get(src);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = src;
    image.addEventListener("load", repaint, { once: true });
    imageCache.set(src, image);
  }
  return image.complete && image.naturalWidth ? image : undefined;
}

function polygonContains(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const left = polygon[index]; const right = polygon[previous];
    if ((left.y > point.y) !== (right.y > point.y) && point.x < (right.x - left.x) * (point.y - left.y) / (right.y - left.y) + left.x) inside = !inside;
  }
  return inside;
}

export function PerspectiveBoard({ view, selection, target, onSelect, onCell, unitArt, battlefieldArt, uiScale = 1 }: PerspectiveBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [camera, setCamera] = useState<Camera>({ zoom: 1, yaw: 0, panX: 0, panY: 0 });
  const [focus, setFocus] = useState<AttentionV4Coordinate>({ x: 4, y: 8 });
  const [paintVersion, setPaintVersion] = useState(0);
  const [viewport, setViewport] = useState({ width: 1000, height: 680 });
  const ownPlayer = "alpha";
  const repaint = () => setPaintVersion((current) => current + 1);

  const geometry = useMemo(() => {
    const { width, height } = viewport;
    const point = (x: number, y: number) => {
      const boardWidth = Math.min(width * .88, height * 1.25) * camera.zoom;
      const top = height * .12 + camera.panY;
      const depth = .48 + .052 * y;
      return {
        x: width / 2 + camera.panX + (x - 5) * (boardWidth / 10) * depth + camera.yaw * (y - 5) * 34,
        y: top + y * (height * .068 * camera.zoom)
      };
    };
    return { width, height, point };
  }, [camera, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const measure = () => {
      const width = canvas.clientWidth; const height = canvas.clientHeight;
      if (width > 0 && height > 0) setViewport((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth; const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d"); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const backdrop = imageFor(battlefieldArt, repaint);
    if (backdrop) {
      const scale = Math.max(width / backdrop.naturalWidth, height / backdrop.naturalHeight);
      const drawWidth = backdrop.naturalWidth * scale; const drawHeight = backdrop.naturalHeight * scale;
      context.globalAlpha = .5;
      context.drawImage(backdrop, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      context.globalAlpha = 1;
    }
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "rgba(4,10,17,.18)"); sky.addColorStop(.46, "rgba(5,14,20,.66)"); sky.addColorStop(1, "rgba(2,7,11,.98)");
    context.fillStyle = sky; context.fillRect(0, 0, width, height);

    const { point } = geometry;
    const board = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
    context.beginPath(); board.forEach((item, index) => index ? context.lineTo(item.x, item.y) : context.moveTo(item.x, item.y)); context.closePath();
    context.fillStyle = "rgba(8,26,34,.78)"; context.fill(); context.strokeStyle = "rgba(101,228,212,.62)"; context.lineWidth = 2; context.stroke();

    for (let index = 0; index <= 10; index += 1) {
      const verticalStart = point(index, 0); const verticalEnd = point(index, 10);
      context.beginPath(); context.moveTo(verticalStart.x, verticalStart.y); context.lineTo(verticalEnd.x, verticalEnd.y);
      context.strokeStyle = index === 0 || index === 10 ? "rgba(123,224,218,.55)" : "rgba(123,188,198,.2)"; context.lineWidth = 1; context.stroke();
      const horizontalStart = point(0, index); const horizontalEnd = point(10, index);
      context.beginPath(); context.moveTo(horizontalStart.x, horizontalStart.y); context.lineTo(horizontalEnd.x, horizontalEnd.y); context.stroke();
    }

    const field = (center: AttentionV4Coordinate, color: string, dashed = false) => {
      const corners = [point(Math.max(0, center.x - 1), Math.max(0, center.y - 1)), point(Math.min(10, center.x + 2), Math.max(0, center.y - 1)), point(Math.min(10, center.x + 2), Math.min(10, center.y + 2)), point(Math.max(0, center.x - 1), Math.min(10, center.y + 2))];
      context.save(); context.beginPath(); corners.forEach((item, index) => index ? context.lineTo(item.x, item.y) : context.moveTo(item.x, item.y)); context.closePath();
      context.fillStyle = color; context.fill(); context.strokeStyle = color.replace(/,[^)]+\)/, ",.9)"); context.setLineDash(dashed ? [8, 6] : []); context.stroke(); context.restore();
    };
    for (const zone of view.projection.zones) field(zone.center, zone.kind === "smoke" ? "rgba(158,170,180,.16)" : zone.kind === "flare" ? "rgba(242,197,91,.15)" : "rgba(116,175,229,.14)", zone.kind === "chaff");
    for (const artifact of view.projection.artifacts) if (artifact.battery.active) field(artifact.position, "rgba(89,224,190,.12)");

    for (const cell of view.projection.traffic) {
      const center = point(cell.coordinate.x + .5, cell.coordinate.y + .5);
      context.beginPath(); context.arc(center.x, center.y, 7 + cell.actionCount * 3, 0, Math.PI * 2); context.fillStyle = `rgba(239,115,89,${Math.min(.12 + cell.actionCount * .1, .55)})`; context.fill();
    }

    for (const artifact of [...view.projection.artifacts].sort((a, b) => a.position.y - b.position.y)) {
      if (artifact.resolution !== "pending") continue;
      const center = point(artifact.position.x + .5, artifact.position.y + .55);
      const selected = selection?.kind === "artifact" && selection.id === artifact.artifactId;
      context.save(); context.translate(center.x, center.y); context.rotate(Math.PI / 4);
      context.fillStyle = artifact.battery.active ? "#62e0bd" : artifact.ownerPlayerId === ownPlayer ? "#75cbd0" : "#ef7d72";
      context.strokeStyle = selected ? "#fff3b0" : "#071016"; context.lineWidth = selected ? 4 : 2; context.fillRect(-8, -8, 16, 16); context.strokeRect(-8, -8, 16, 16); context.restore();
      if (!artifact.verified && (artifact.age >= artifact.contextLimit || artifact.overTaxReasons.length)) {
        context.fillStyle = "#ffd36f"; context.font = `700 ${11 * uiScale}px system-ui`; context.textAlign = "center"; context.fillText(`HAZ ${artifact.age}/${artifact.contextLimit}`, center.x, center.y - 16 * uiScale);
      }
    }

    for (const unit of [...view.projection.units].sort((a, b) => a.position.y - b.position.y)) {
      const center = point(unit.position.x + .5, unit.position.y + .75);
      const depth = .72 + unit.position.y * .035;
      const cardWidth = 48 * depth * camera.zoom * uiScale; const cardHeight = 66 * depth * camera.zoom * uiScale;
      const labelHeight = 18 * uiScale;
      const art = imageFor(unitArt(unit.unitId), repaint);
      context.save();
      context.shadowColor = unit.ownerPlayerId === ownPlayer ? "rgba(75,229,211,.6)" : "rgba(255,105,91,.55)"; context.shadowBlur = 15;
      context.fillStyle = "#0a1720"; context.fillRect(center.x - cardWidth / 2, center.y - cardHeight, cardWidth, cardHeight);
      if (art) context.drawImage(art, center.x - cardWidth / 2 + 2, center.y - cardHeight + 2, cardWidth - 4, cardHeight - labelHeight);
      context.shadowBlur = 0; context.strokeStyle = unit.ownerPlayerId === ownPlayer ? "#66e4d4" : "#ff786f"; context.lineWidth = selection?.kind === "unit" && selection.id === unit.unitId ? 4 : 2; context.strokeRect(center.x - cardWidth / 2, center.y - cardHeight, cardWidth, cardHeight);
      context.fillStyle = unit.uap.frozen ? "#adcbef" : "#e8f5f6"; context.font = `800 ${Math.max(10, 12 * depth) * uiScale}px system-ui`; context.textAlign = "center";
      context.fillText(unit.chassis === "scout" ? "SCOUT" : unit.chassis === "line" ? "LINE" : "HEAVY", center.x, center.y - 5 * uiScale);
      if (unit.uap.frozen) { context.fillStyle = "rgba(132,188,235,.35)"; context.fillRect(center.x - cardWidth / 2, center.y - cardHeight, cardWidth, cardHeight); }
      context.restore();
    }

    const marker = target ?? focus;
    const markerCorners = [point(marker.x, marker.y), point(marker.x + 1, marker.y), point(marker.x + 1, marker.y + 1), point(marker.x, marker.y + 1)];
    context.beginPath(); markerCorners.forEach((item, index) => index ? context.lineTo(item.x, item.y) : context.moveTo(item.x, item.y)); context.closePath(); context.strokeStyle = target ? "#ffd36f" : "rgba(255,255,255,.7)"; context.lineWidth = target ? 4 : 2; context.stroke();
  }, [battlefieldArt, camera, focus, geometry, ownPlayer, paintVersion, selection, target, uiScale, unitArt, view]);

  const coordinateAt = (clientX: number, clientY: number): AttentionV4Coordinate | null => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return null;
    const point = { x: clientX - rect.left, y: clientY - rect.top };
    for (let y = 9; y >= 0; y -= 1) for (let x = 0; x < 10; x += 1) {
      const polygon = [geometry.point(x, y), geometry.point(x + 1, y), geometry.point(x + 1, y + 1), geometry.point(x, y + 1)];
      if (polygonContains(point, polygon)) return { x, y };
    }
    return null;
  };

  const activate = (coordinate: AttentionV4Coordinate) => {
    setFocus(coordinate);
    const unit = view.projection.units.find((item) => item.position.x === coordinate.x && item.position.y === coordinate.y);
    const artifact = view.projection.artifacts.find((item) => item.resolution === "pending" && item.position.x === coordinate.x && item.position.y === coordinate.y);
    if (unit) onSelect({ kind: "unit", id: unit.unitId }); else if (artifact) onSelect({ kind: "artifact", id: artifact.artifactId }); else onSelect({ kind: "cell", at: coordinate });
    onCell(coordinate);
  };

  const moveSemanticFocus = (event: KeyboardEvent<HTMLButtonElement>, coordinate: AttentionV4Coordinate) => {
    const delta = event.key === "ArrowLeft" ? [-1, 0] : event.key === "ArrowRight" ? [1, 0] : event.key === "ArrowUp" ? [0, -1] : event.key === "ArrowDown" ? [0, 1] : null;
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      const next = { x: Math.max(0, Math.min(9, coordinate.x + delta[0])), y: Math.max(0, Math.min(9, coordinate.y + delta[1])) };
      setFocus(next);
      document.querySelector<HTMLButtonElement>(`[data-perspective-cell="${next.x},${next.y}"]`)?.focus();
    }
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setCamera({ zoom: 1, yaw: 0, panX: 0, panY: 0 });
    }
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, panX: camera.panX, panY: camera.panY, moved: false }; };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; if (!drag) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; setCamera((current) => ({ ...current, panX: drag.panX + dx, panY: drag.panY + dy })); };
  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => { const drag = dragRef.current; dragRef.current = null; if (!drag?.moved) { const coordinate = coordinateAt(event.clientX, event.clientY); if (coordinate) activate(coordinate); } };
  const wheel = (event: WheelEvent<HTMLCanvasElement>) => { event.preventDefault(); setCamera((current) => ({ ...current, zoom: Math.max(.75, Math.min(1.35, current.zoom - event.deltaY * .001)) })); };

  return <section className="perspective-board" aria-label="Player-edge perspective battlefield">
    <div className="perspective-camera-controls" aria-label="Perspective camera controls">
      <button onClick={() => setCamera((current) => ({ ...current, zoom: Math.min(1.35, current.zoom + .1) }))} aria-label="Zoom in">+</button>
      <button onClick={() => setCamera((current) => ({ ...current, zoom: Math.max(.75, current.zoom - .1) }))} aria-label="Zoom out">−</button>
      <button onClick={() => setCamera((current) => ({ ...current, yaw: Math.max(-.55, current.yaw - .12) }))} aria-label="Yaw left">↶</button>
      <button onClick={() => setCamera((current) => ({ ...current, yaw: Math.min(.55, current.yaw + .12) }))} aria-label="Yaw right">↷</button>
      <button onClick={() => setCamera({ zoom: 1, yaw: 0, panX: 0, panY: 0 })}>Home</button>
    </div>
    <div className="perspective-canvas-shell">
      <canvas ref={canvasRef} aria-hidden="true" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={wheel} />
      <span id="perspective-grid-help" className="sr-only">Use arrow keys and Enter. Drag to pan and use Home to reset.</span><span className="sr-only" aria-live="polite">Coordinate {focus.x}, {focus.y}</span>
      <div className="perspective-semantic-grid sr-only" role="grid" aria-label="10 by 10 operational field" aria-describedby="perspective-grid-help">{Array.from({ length: 10 }, (_, y) => <div role="row" key={y}>{Array.from({ length: 10 }, (_, x) => {
        const coordinate = { x, y };
        const units = view.projection.units.filter((unit) => unit.position.x === x && unit.position.y === y);
        const artifacts = view.projection.artifacts.filter((artifact) => artifact.resolution === "pending" && artifact.position.x === x && artifact.position.y === y);
        const traffic = view.projection.traffic.find((cell) => cell.coordinate.x === x && cell.coordinate.y === y)?.actionCount ?? 0;
        const label = [`${x},${y}`, ...units.map((unit) => `${unit.ownerPlayerId === ownPlayer ? "friendly" : "hostile"} ${displayChassis(unit.chassis)}`), `${artifacts.length} artifacts`, traffic ? `${traffic} actions` : ""].filter(Boolean).join(", ");
        return <button key={x} type="button" role="gridcell" data-perspective-cell={`${x},${y}`} tabIndex={focus.x === x && focus.y === y ? 0 : -1} aria-label={label} onFocus={() => setFocus(coordinate)} onKeyDown={(event) => moveSemanticFocus(event, coordinate)} onClick={() => activate(coordinate)} />;
      })}</div>)}</div>
    </div>
    <p className="perspective-help">Drag to pan · wheel to zoom · limited yaw preserves orientation · Home resets to your edge</p>
  </section>;
}
