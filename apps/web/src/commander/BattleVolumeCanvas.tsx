import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clampBattleAxis } from "./coordinates.js";
import { BATTLE_AXIS_SIZE, type BattleFixture, type BattlePoint, type BattleSelection } from "./model.js";

const colors = {
  background: "#091019",
  terrain: "#101b27",
  grid: "#293b4e",
  friendly: "#67e8b3",
  enemy: "#fb7185",
  uncertain: "#8292a6",
  selection: "#f8d66d"
};

type Props = {
  battle: BattleFixture;
  layer: number;
  selection: BattleSelection | null;
  onSelectionChange: (selection: BattleSelection) => void;
};

type Layout = { originX: number; originY: number; cell: number; width: number; height: number };

function layoutFor(canvas: HTMLCanvasElement): Layout {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const cell = Math.max(2, Math.floor(Math.min((width - 54) / BATTLE_AXIS_SIZE, (height - 54) / BATTLE_AXIS_SIZE)));
  return {
    originX: Math.round((width - cell * BATTLE_AXIS_SIZE) / 2),
    originY: Math.round((height - cell * BATTLE_AXIS_SIZE) / 2),
    cell,
    width,
    height
  };
}

function pointCenter(point: Pick<BattlePoint, "x" | "y">, layout: Layout): { x: number; y: number } {
  return {
    x: layout.originX + (point.x + 0.5) * layout.cell,
    y: layout.originY + (point.y + 0.5) * layout.cell
  };
}

function drawHatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string
): void {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (let offset = -height; offset < width + height; offset += 9) {
    context.beginPath();
    context.moveTo(x + offset, y + height);
    context.lineTo(x + offset + height, y);
    context.stroke();
  }
  context.restore();
}

function unitGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  chassis: "scout" | "line" | "siege"
): void {
  context.beginPath();
  if (chassis === "scout") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y + radius);
    context.lineTo(x - radius, y + radius);
    context.closePath();
  } else if (chassis === "siege") {
    context.rect(x - radius, y - radius, radius * 2, radius * 2);
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
}

function allegianceColor(allegiance: "friendly" | "enemy" | "unknown"): string {
  return allegiance === "friendly" ? colors.friendly : allegiance === "enemy" ? colors.enemy : colors.uncertain;
}

function drawBattle(
  canvas: HTMLCanvasElement,
  battle: BattleFixture,
  layer: number,
  selection: BattleSelection | null
): void {
  const layout = layoutFor(canvas);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(layout.width * pixelRatio);
  const pixelHeight = Math.round(layout.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, layout.width, layout.height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = colors.terrain;
  context.fillRect(layout.originX, layout.originY, layout.cell * BATTLE_AXIS_SIZE, layout.cell * BATTLE_AXIS_SIZE);

  for (const effect of battle.effects) {
    if (layer < effect.min.z || layer > effect.max.z) continue;
    const x = layout.originX + effect.min.x * layout.cell;
    const y = layout.originY + effect.min.y * layout.cell;
    const width = (effect.max.x - effect.min.x + 1) * layout.cell;
    const height = (effect.max.y - effect.min.y + 1) * layout.cell;
    const visualStrength = effect.strength ?? Math.min(1, .38 + (effect.remainingTicks ?? 0) * .12);
    if (effect.kind === "front") {
      context.fillStyle = `rgba(130,146,166,${0.06 + visualStrength * 0.08})`;
      context.fillRect(x, y, width, height);
      drawHatch(context, x, y, width, height, "rgba(130,146,166,.18)");
    } else if (effect.kind === "macro-flare") {
      context.fillStyle = `rgba(251,113,133,${0.13 + visualStrength * 0.12})`;
      context.fillRect(x, y, width, height);
      drawHatch(context, x, y, width, height, "rgba(251,113,133,.42)");
    } else if (effect.kind === "attention-field") {
      context.fillStyle = `rgba(248,214,109,${0.08 + visualStrength * 0.1})`;
      context.fillRect(x, y, width, height);
      drawHatch(context, x, y, width, height, "rgba(248,214,109,.28)");
    } else {
      context.strokeStyle = "rgba(130,146,166,.58)";
      context.setLineDash([4, 5]);
      context.strokeRect(x, y, width, height);
      context.setLineDash([]);
    }
  }

  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  context.beginPath();
  for (let index = 0; index <= BATTLE_AXIS_SIZE; index += 1) {
    const x = layout.originX + index * layout.cell + 0.5;
    const y = layout.originY + index * layout.cell + 0.5;
    context.moveTo(x, layout.originY);
    context.lineTo(x, layout.originY + BATTLE_AXIS_SIZE * layout.cell);
    context.moveTo(layout.originX, y);
    context.lineTo(layout.originX + BATTLE_AXIS_SIZE * layout.cell, y);
  }
  context.stroke();

  const adjacentUnits = battle.units.filter((unit) => Math.abs(unit.at.z - layer) === 1);
  for (const unit of adjacentUnits) {
    const point = pointCenter(unit.at, layout);
    context.fillStyle = allegianceColor(unit.allegiance);
    context.globalAlpha = 0.2;
    context.font = `${Math.max(8, layout.cell * 0.55)}px ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(unit.at.z > layer ? "△" : "▽", point.x, point.y);
    context.globalAlpha = 1;
  }

  for (const unit of battle.units.filter((candidate) => candidate.at.z === layer)) {
    const point = pointCenter(unit.at, layout);
    const radius = Math.max(3, layout.cell * 0.33);
    context.fillStyle = allegianceColor(unit.allegiance);
    context.globalAlpha = 0.78 + unit.confidence * 0.2;
    unitGlyph(context, point.x, point.y, radius, unit.chassis);
    context.fill();
    context.globalAlpha = 1;
    if (unit.stationary) {
      context.strokeStyle = colors.selection;
      context.lineWidth = 1;
      context.setLineDash([2, 2]);
      context.beginPath();
      context.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    if (selection?.kind === "unit" && selection.unitId === unit.unitId) {
      context.strokeStyle = colors.selection;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, radius + 5, 0, Math.PI * 2);
      context.stroke();
    }
  }

  for (const artifact of battle.artifacts.filter((candidate) => candidate.at.z === layer)) {
    const center = pointCenter(artifact.at, layout);
    const x = center.x + layout.cell * 0.24;
    const y = center.y - layout.cell * 0.24;
    const size = Math.max(2.5, layout.cell * 0.15);
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = artifact.revealedSound === true ? colors.friendly : artifact.revealedSound === false ? colors.enemy : colors.uncertain;
    context.globalAlpha = 0.48 + artifact.confidence * 0.48;
    context.fillRect(-size, -size, size * 2, size * 2);
    context.restore();
    if (artifact.guarantee) {
      context.strokeStyle = colors.selection;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, size + 2, 0, Math.PI * 2);
      context.stroke();
    }
    if (selection?.kind === "artifact" && selection.artifactId === artifact.artifactId) {
      context.strokeStyle = colors.selection;
      context.lineWidth = 2;
      context.strokeRect(x - size - 4, y - size - 4, size * 2 + 8, size * 2 + 8);
    }
  }

  if (selection?.kind === "cell" && selection.at.z === layer) {
    context.strokeStyle = colors.selection;
    context.lineWidth = 2;
    context.strokeRect(
      layout.originX + selection.at.x * layout.cell + 1,
      layout.originY + selection.at.y * layout.cell + 1,
      layout.cell - 2,
      layout.cell - 2
    );
  }

  context.fillStyle = "#8292a6";
  context.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("00", layout.originX, layout.originY - 9);
  context.textAlign = "right";
  context.fillText("31", layout.originX + layout.cell * BATTLE_AXIS_SIZE, layout.originY - 9);
  context.save();
  context.translate(layout.originX - 12, layout.originY + layout.cell * BATTLE_AXIS_SIZE);
  context.rotate(-Math.PI / 2);
  context.textAlign = "left";
  context.fillText(`LAYER ${String(layer).padStart(2, "0")} · ELEVATION ↑`, 0, 0);
  context.restore();
}

function selectAt(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
  battle: BattleFixture,
  layer: number
): BattleSelection | null {
  const layout = layoutFor(canvas);
  const rect = canvas.getBoundingClientRect();
  const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const x = Math.floor((screen.x - layout.originX) / layout.cell);
  const y = Math.floor((screen.y - layout.originY) / layout.cell);
  if (x < 0 || x >= BATTLE_AXIS_SIZE || y < 0 || y >= BATTLE_AXIS_SIZE) return null;

  const artifacts = battle.artifacts
    .filter((artifact) => artifact.at.z === layer && artifact.at.x === x && artifact.at.y === y)
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
  if (artifacts[0]) return { kind: "artifact", artifactId: artifacts[0].artifactId };
  const units = battle.units
    .filter((unit) => unit.at.z === layer && unit.at.x === x && unit.at.y === y)
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  if (units[0]) return { kind: "unit", unitId: units[0].unitId };
  return { kind: "cell", at: { x: clampBattleAxis(x), y: clampBattleAxis(y), z: layer } };
}

export function BattleVolumeCanvas({ battle, layer, selection, onSelectionChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instructionsId = useId();
  const [resizeRevision, setResizeRevision] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setResizeRevision((revision) => revision + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (canvasRef.current) drawBattle(canvasRef.current, battle, layer, selection);
  }, [battle, layer, selection, resizeRevision]);

  return <div
    className="commander-canvas-region"
    role="region"
    tabIndex={0}
    aria-label={`Battle volume ${battle.battle.label}, operational layer ${layer}`}
    aria-describedby={instructionsId}
  >
    <span id={instructionsId} className="sr-only">Use Page Up and Page Down to change elevation. Use the keyboard navigator to select visible entities or inspect a cell.</span>
    <canvas
      ref={canvasRef}
      className="commander-canvas battle-canvas"
      aria-hidden="true"
      onPointerDown={(event) => event.currentTarget.parentElement?.focus({ preventScroll: true })}
      onPointerUp={(event) => {
        const selected = selectAt(event.currentTarget, event, battle, layer);
        if (selected) onSelectionChange(selected);
      }}
    />
  </div>;
}
