import {
  BATTLE_AXIS_SIZE,
  BATTLE_LAYER_COUNT,
  STRATEGIC_CHUNK_SIZE,
  STRATEGIC_WORLD_SIZE,
  type StrategicCamera,
  type StrategicLod,
  type StrategicPoint
} from "./model.js";

export type ViewportSize = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampStrategicPoint(point: StrategicPoint): StrategicPoint {
  return {
    x: clamp(point.x, 0, STRATEGIC_WORLD_SIZE - 1),
    y: clamp(point.y, 0, STRATEGIC_WORLD_SIZE - 1)
  };
}

export function clampBattleAxis(value: number): number {
  return clamp(Math.round(value), 0, BATTLE_AXIS_SIZE - 1);
}

export function clampBattleLayer(value: number): number {
  return clamp(Math.round(value), 0, BATTLE_LAYER_COUNT - 1);
}

export function strategicToScreen(
  point: StrategicPoint,
  camera: StrategicCamera,
  viewport: ViewportSize
): ScreenPoint {
  return {
    x: viewport.width / 2 + (point.x - camera.center.x) * camera.zoom,
    y: viewport.height / 2 + (point.y - camera.center.y) * camera.zoom
  };
}

export function screenToStrategic(
  point: ScreenPoint,
  camera: StrategicCamera,
  viewport: ViewportSize
): StrategicPoint {
  return {
    x: camera.center.x + (point.x - viewport.width / 2) / camera.zoom,
    y: camera.center.y + (point.y - viewport.height / 2) / camera.zoom
  };
}

export function zoomCameraAt(
  camera: StrategicCamera,
  screenAnchor: ScreenPoint,
  factor: number,
  viewport: ViewportSize
): StrategicCamera {
  const before = screenToStrategic(screenAnchor, camera, viewport);
  const zoom = clamp(camera.zoom * factor, 0.035, 36);
  const center = clampStrategicPoint({
    x: before.x - (screenAnchor.x - viewport.width / 2) / zoom,
    y: before.y - (screenAnchor.y - viewport.height / 2) / zoom
  });
  return { center, zoom };
}

export function panCamera(camera: StrategicCamera, dxPixels: number, dyPixels: number): StrategicCamera {
  return {
    ...camera,
    center: clampStrategicPoint({
      x: camera.center.x - dxPixels / camera.zoom,
      y: camera.center.y - dyPixels / camera.zoom
    })
  };
}

export function strategicLod(zoom: number): StrategicLod {
  if (zoom < 0.22) return "theater";
  if (zoom < 6) return "sector";
  return "cell";
}

export function strategicChunk(point: StrategicPoint): { chunkX: number; chunkY: number; localX: number; localY: number } {
  const clamped = clampStrategicPoint(point);
  const x = Math.floor(clamped.x);
  const y = Math.floor(clamped.y);
  return {
    chunkX: Math.floor(x / STRATEGIC_CHUNK_SIZE),
    chunkY: Math.floor(y / STRATEGIC_CHUNK_SIZE),
    localX: x % STRATEGIC_CHUNK_SIZE,
    localY: y % STRATEGIC_CHUNK_SIZE
  };
}

export function formatStrategic(point: StrategicPoint): string {
  return `${Math.floor(point.x).toString().padStart(4, "0")},${Math.floor(point.y).toString().padStart(4, "0")}`;
}

export function formatBattle(x: number, y: number, z: number): string {
  return `${clampBattleAxis(x).toString().padStart(2, "0")},${clampBattleAxis(y).toString().padStart(2, "0")} · L${clampBattleLayer(z).toString().padStart(2, "0")}`;
}
