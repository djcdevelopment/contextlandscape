import { BATTLE_LAYER_COUNT, type BattleLayerSummary } from "./model.js";

export function LayerRail({ layers, selected, onSelect }: {
  layers: BattleLayerSummary[];
  selected: number;
  onSelect: (layer: number) => void;
}) {
  const maxFriendly = Math.max(1, ...layers.map((layer) => layer.friendly));
  const maxEnemy = Math.max(1, ...layers.map((layer) => layer.enemy));
  return <nav className="layer-rail" aria-label="Operational layers">
    <div className="layer-rail-heading"><span>Elevation</span><strong>31</strong></div>
    <div className="layer-list">
      {[...layers].reverse().map((layer) => {
        const occupied = layer.friendly + layer.enemy + layer.artifacts;
        const enemyValue = layer.measure === "strength" && layer.enemyMinimum !== undefined && layer.enemyMaximum !== undefined
          ? `${layer.enemyMinimum}–${layer.enemyMaximum} estimated opposition strength`
          : `${layer.enemy} opposition units`;
        const label = layer.measure === "strength"
          ? `Layer ${layer.z}. ${layer.friendly} friendly strength, ${enemyValue}, ${layer.uncertainty === undefined ? "" : `${Math.round(layer.uncertainty * 100)} percent uncertainty, `}${layer.artifacts} artifacts, ${Math.round(layer.activity * 100)} percent ${layer.activityKind}.`
          : `Layer ${layer.z}. ${layer.friendly} friendly units, ${enemyValue}, ${layer.artifacts} artifacts, ${Math.round(layer.activity * 100)} percent ${layer.activityKind}.`;
        return <button
          type="button"
          key={layer.z}
          className={layer.z === selected ? "active" : ""}
          aria-current={layer.z === selected ? "true" : undefined}
          aria-label={label}
          onClick={() => onSelect(layer.z)}
        >
          <span className="layer-number">{String(layer.z).padStart(2, "0")}</span>
          <span className="layer-density" aria-hidden="true">
            <i className="friendly" style={{ width: `${layer.friendly / maxFriendly * 100}%` }} />
            <i className="enemy" style={{ width: `${layer.enemy / maxEnemy * 100}%` }} />
            <i className="activity" style={{ width: `${layer.activity * 100}%` }} />
          </span>
          {occupied > 0 && <small>{layer.measure === "strength" ? `${layer.friendly}/${layer.enemy}` : occupied}</small>}
        </button>;
      })}
    </div>
    <div className="layer-rail-heading"><span>Ground</span><strong>00</strong></div>
    <span className="layer-count">{BATTLE_LAYER_COUNT} layers</span>
  </nav>;
}
