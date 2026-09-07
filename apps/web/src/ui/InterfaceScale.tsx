import { useEffect, useLayoutEffect, useState } from "react";

export type UiScale = "compact" | "standard" | "large" | "xlarge";
const order: UiScale[] = ["compact", "standard", "large", "xlarge"];
export const UI_SCALE_FACTOR: Record<UiScale, number> = { compact: .9, standard: 1, large: 1.15, xlarge: 1.3 };
const storageKey = "context-landscape.uiScale";
const changeEvent = "context-landscape:ui-scale";

function readScale(): UiScale {
  const saved = localStorage.getItem(storageKey);
  return order.includes(saved as UiScale) ? saved as UiScale
    : typeof matchMedia === "function" && matchMedia("(min-width: 2000px)").matches ? "large" : "standard";
}

export function useInterfaceScale() {
  const [value, setValue] = useState(readScale);
  useLayoutEffect(() => { document.documentElement.dataset.uiScale = value; }, [value]);
  useEffect(() => {
    const sync = () => setValue(readScale());
    window.addEventListener(changeEvent, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(changeEvent, sync); window.removeEventListener("storage", sync); };
  }, []);
  const onChange = (next: UiScale) => {
    localStorage.setItem(storageKey, next);
    setValue(next);
    window.dispatchEvent(new Event(changeEvent));
  };
  return [value, onChange] as const;
}

export function InterfaceScale({ value, onChange }: { value: UiScale; onChange: (next: UiScale) => void }) {
  const index = order.indexOf(value);
  const percent = Math.round(UI_SCALE_FACTOR[value] * 100);
  return <div className="battle-ui-scale" role="group" aria-label="Interface scale">
    <button type="button" aria-label="Decrease interface scale" disabled={index === 0} onClick={() => onChange(order[index - 1])}>A−</button>
    <span role="status" aria-live="polite" aria-label={`Interface scale ${percent} percent`}>{percent}%</span>
    <button type="button" aria-label="Increase interface scale" disabled={index === order.length - 1} onClick={() => onChange(order[index + 1])}>A+</button>
  </div>;
}
