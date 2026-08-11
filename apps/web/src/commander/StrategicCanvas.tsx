import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import {
  clampStrategicPoint,
  panCamera,
  screenToStrategic,
  strategicLod,
  strategicToScreen,
  zoomCameraAt,
  type ScreenPoint,
  type ViewportSize
} from "./coordinates.js";
import {
  STRATEGIC_CHUNK_SIZE,
  STRATEGIC_WORLD_SIZE,
  type StrategicBattle,
  type StrategicCamera,
  type StrategicContact,
  type StrategicFixture,
  type StrategicSelection
} from "./model.js";

const colors = {
  background: "#091019",
  terrain: "#101b27",
  grid: "#213246",
  friendly: "#67e8b3",
  enemy: "#fb7185",
  uncertain: "#8292a6",
  selection: "#f8d66d"
};

function allegianceColor(allegiance: "friendly" | "enemy" | "unknown"): string {
  return allegiance === "friendly" ? colors.friendly : allegiance === "enemy" ? colors.enemy : colors.selection;
}

type Props = {
  fixture: StrategicFixture;
  camera: StrategicCamera;
  selection: StrategicSelection | null;
  onCameraChange: (camera: StrategicCamera) => void;
  onSelectionChange: (selection: StrategicSelection) => void;
  onOpenBattle: (battleId: string) => void;
  onHover: (point: { x: number; y: number } | null) => void;
};

type Hit = { kind: "battle"; value: StrategicBattle } | { kind: "contact"; value: StrategicContact };

function canvasViewport(canvas: HTMLCanvasElement): ViewportSize {
  const rect = canvas.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

function eventPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): ScreenPoint {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitTest(
  screen: ScreenPoint,
  fixture: StrategicFixture,
  camera: StrategicCamera,
  viewport: ViewportSize
): Hit | null {
  const battle = [...fixture.battles]
    .map((value) => ({ value, point: strategicToScreen(value.anchor, camera, viewport) }))
    .filter(({ point }) => Math.hypot(point.x - screen.x, point.y - screen.y) <= 17)
    .sort((left, right) => left.value.battleId.localeCompare(right.value.battleId))[0];
  if (battle) return { kind: "battle", value: battle.value };

  const contact = [...fixture.contacts]
    .map((value) => ({ value, point: strategicToScreen(value.at, camera, viewport) }))
    .filter(({ point }) => Math.hypot(point.x - screen.x, point.y - screen.y) <= 13)
    .sort((left, right) => left.value.contactId.localeCompare(right.value.contactId))[0];
  return contact ? { kind: "contact", value: contact.value } : null;
}

function drawGrid(
  context: CanvasRenderingContext2D,
  camera: StrategicCamera,
  viewport: ViewportSize
): void {
  const lod = strategicLod(camera.zoom);
  const topLeft = screenToStrategic({ x: 0, y: 0 }, camera, viewport);
  const bottomRight = screenToStrategic({ x: viewport.width, y: viewport.height }, camera, viewport);
  const step = lod === "cell" ? 1 : lod === "sector" ? STRATEGIC_CHUNK_SIZE : STRATEGIC_CHUNK_SIZE * 16;
  const lineColor = lod === "cell" ? "rgba(48,64,84,.42)" : "rgba(48,64,84,.62)";
  context.strokeStyle = lineColor;
  context.lineWidth = 1;
  context.beginPath();
  const startX = Math.max(0, Math.floor(topLeft.x / step) * step);
  const endX = Math.min(STRATEGIC_WORLD_SIZE, Math.ceil(bottomRight.x / step) * step);
  for (let x = startX; x <= endX; x += step) {
    const screen = strategicToScreen({ x, y: 0 }, camera, viewport);
    context.moveTo(Math.round(screen.x) + 0.5, 0);
    context.lineTo(Math.round(screen.x) + 0.5, viewport.height);
  }
  const startY = Math.max(0, Math.floor(topLeft.y / step) * step);
  const endY = Math.min(STRATEGIC_WORLD_SIZE, Math.ceil(bottomRight.y / step) * step);
  for (let y = startY; y <= endY; y += step) {
    const screen = strategicToScreen({ x: 0, y }, camera, viewport);
    context.moveTo(0, Math.round(screen.y) + 0.5);
    context.lineTo(viewport.width, Math.round(screen.y) + 0.5);
  }
  context.stroke();
}

function drawStrategic(
  canvas: HTMLCanvasElement,
  fixture: StrategicFixture,
  camera: StrategicCamera,
  selection: StrategicSelection | null
): void {
  const viewport = canvasViewport(canvas);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(viewport.width * pixelRatio);
  const height = Math.round(viewport.height * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, viewport.width, viewport.height);

  const worldOrigin = strategicToScreen({ x: 0, y: 0 }, camera, viewport);
  const worldEnd = strategicToScreen({ x: STRATEGIC_WORLD_SIZE, y: STRATEGIC_WORLD_SIZE }, camera, viewport);
  context.fillStyle = colors.terrain;
  context.fillRect(worldOrigin.x, worldOrigin.y, worldEnd.x - worldOrigin.x, worldEnd.y - worldOrigin.y);

  for (const hotspot of fixture.attention) {
    const center = strategicToScreen(hotspot.center, camera, viewport);
    const radius = Math.max(12, hotspot.radius * camera.zoom);
    const gradient = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
    gradient.addColorStop(0, `rgba(248, 214, 109, ${0.19 * hotspot.pressure})`);
    gradient.addColorStop(0.58, `rgba(248, 214, 109, ${0.08 * hotspot.pressure})`);
    gradient.addColorStop(1, "rgba(248,214,109,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  drawGrid(context, camera, viewport);

  for (const front of fixture.fronts) {
    const color = allegianceColor(front.allegiance);
    context.beginPath();
    front.path.forEach((point, index) => {
      const screen = strategicToScreen(point, camera, viewport);
      if (index === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash([]);
    context.strokeStyle = front.allegiance === "friendly"
      ? "rgba(103,232,179,.13)"
      : front.allegiance === "enemy" ? "rgba(251,113,133,.13)" : "rgba(248,214,109,.13)";
    context.lineWidth = front.uncertaintyRadius === undefined
      ? 12 + (front.pressure ?? 0) * 18
      : Math.min(96, Math.max(12, front.uncertaintyRadius * camera.zoom * 2));
    context.stroke();
    context.setLineDash(front.confidence < 0.8 ? [10, 8] : []);
    context.strokeStyle = color;
    context.globalAlpha = 0.62 + front.confidence * 0.28;
    context.lineWidth = 2;
    context.stroke();
    context.globalAlpha = 1;
    context.setLineDash([]);
  }

  for (const contact of fixture.contacts) {
    const point = strategicToScreen(contact.at, camera, viewport);
    const color = contact.allegiance === "unknown" ? colors.uncertain : allegianceColor(contact.allegiance);
    const uncertainty = Math.max(7, contact.uncertaintyRadius * camera.zoom);
    context.strokeStyle = color;
    context.globalAlpha = 0.18 + contact.confidence * 0.34;
    context.setLineDash([3, 5]);
    context.beginPath();
    context.arc(point.x, point.y, uncertainty, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 0.55 + contact.confidence * 0.4;
    context.fillStyle = color;
    context.beginPath();
    if (contact.kind === "signal") {
      context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    } else {
      context.rect(point.x - 4, point.y - 4, 8, 8);
    }
    context.fill();
    context.globalAlpha = 1;
  }

  for (const battle of fixture.battles) {
    const point = strategicToScreen(battle.anchor, camera, viewport);
    const selected = selection?.kind === "battle" && selection.battleId === battle.battleId;
    const size = 7 + battle.intensity * 6;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = battle.status === "resolved"
      ? "#526477"
      : battle.control === "friendly"
        ? colors.friendly
        : battle.control === "enemy"
          ? colors.enemy
          : colors.selection;
    context.globalAlpha = battle.status === "resolved" ? 0.55 : 0.9;
    context.fillRect(-size / 2, -size / 2, size, size);
    context.strokeStyle = selected ? colors.selection : "#e9eef5";
    context.lineWidth = selected ? 3 : 1;
    context.globalAlpha = 1;
    context.strokeRect(-size / 2 - 2, -size / 2 - 2, size + 4, size + 4);
    context.restore();

    const attentionFraction = battle.attentionDemandKind === "points"
      ? Math.min(1, battle.attentionDemand / 10)
      : Math.min(1, battle.attentionDemand);
    context.strokeStyle = colors.selection;
    context.globalAlpha = 0.3 + attentionFraction * 0.5;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, size + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * attentionFraction);
    context.stroke();
    context.globalAlpha = 1;

    if (strategicLod(camera.zoom) !== "theater" || selected) {
      context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
      context.fillStyle = selected ? colors.selection : "#cbd5e1";
      context.fillText(battle.label, point.x + 13, point.y - 10);
    }
  }

  if (selection?.kind === "contact") {
    const contact = fixture.contacts.find((candidate) => candidate.contactId === selection.contactId);
    if (contact) {
      const point = strategicToScreen(contact.at, camera, viewport);
      context.strokeStyle = colors.selection;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, 11, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (selection?.kind === "terrain") {
    const point = strategicToScreen(selection.at, camera, viewport);
    context.strokeStyle = colors.selection;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(point.x - 8, point.y);
    context.lineTo(point.x + 8, point.y);
    context.moveTo(point.x, point.y - 8);
    context.lineTo(point.x, point.y + 8);
    context.stroke();
  }

  context.strokeStyle = "rgba(103,232,179,.45)";
  context.lineWidth = 1;
  context.strokeRect(worldOrigin.x, worldOrigin.y, worldEnd.x - worldOrigin.x, worldEnd.y - worldOrigin.y);
}

export function StrategicCanvas({
  fixture,
  camera,
  selection,
  onCameraChange,
  onSelectionChange,
  onOpenBattle,
  onHover
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instructionsId = useId();
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const cameraRef = useRef(camera);
  const [resizeRevision, setResizeRevision] = useState(0);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setResizeRevision((revision) => revision + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (canvasRef.current) drawStrategic(canvasRef.current, fixture, camera, selection);
  }, [fixture, camera, selection, resizeRevision]);

  function choose(screen: ScreenPoint, open: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = canvasViewport(canvas);
    const currentCamera = cameraRef.current;
    const hit = hitTest(screen, fixture, currentCamera, viewport);
    if (hit?.kind === "battle") {
      onSelectionChange({ kind: "battle", battleId: hit.value.battleId });
      if (open) onOpenBattle(hit.value.battleId);
      return;
    }
    if (hit?.kind === "contact") {
      onSelectionChange({ kind: "contact", contactId: hit.value.contactId });
      return;
    }
    const world = clampStrategicPoint(screenToStrategic(screen, currentCamera, viewport));
    onSelectionChange({ kind: "terrain", at: { x: Math.floor(world.x), y: Math.floor(world.y) } });
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.parentElement?.focus({ preventScroll: true });
    const point = eventPoint(event.currentTarget, event);
    dragRef.current = { ...point, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = eventPoint(event.currentTarget, event);
    const viewport = canvasViewport(event.currentTarget);
    onHover(clampStrategicPoint(screenToStrategic(point, cameraRef.current, viewport)));
    const drag = dragRef.current;
    if (!drag) return;
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const nextCamera = panCamera(cameraRef.current, dx, dy);
    cameraRef.current = nextCamera;
    onCameraChange(nextCamera);
    drag.x = point.x;
    drag.y = point.y;
  }

  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) choose(eventPoint(event.currentTarget, event), false);
  }

  function wheel(event: WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const viewport = canvasViewport(event.currentTarget);
    const nextCamera = zoomCameraAt(cameraRef.current, eventPoint(event.currentTarget, event), Math.exp(-event.deltaY * 0.0014), viewport);
    cameraRef.current = nextCamera;
    onCameraChange(nextCamera);
  }

  return <div
    className="commander-canvas-region"
    role="region"
    tabIndex={0}
    aria-label="Strategic landscape navigation"
    aria-describedby={instructionsId}
  >
    <span id={instructionsId} className="sr-only">Sparse 6,400 by 6,400 strategic landscape. Use WASD or arrow keys to pan, plus and minus to zoom, and the keyboard navigator to select contacts or battles.</span>
    <canvas
      ref={canvasRef}
      className="commander-canvas strategic-canvas"
      aria-hidden="true"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerLeave={() => { dragRef.current = null; onHover(null); }}
      onPointerUp={pointerUp}
      onDoubleClick={(event) => choose(eventPoint(event.currentTarget, event), true)}
      onWheel={wheel}
    />
  </div>;
}
