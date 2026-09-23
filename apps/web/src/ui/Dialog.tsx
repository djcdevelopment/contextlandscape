import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Dialog({ title, children, actions, onClose, className = "" }: {
  title: string; children: ReactNode; actions?: ReactNode; onClose: () => void; className?: string;
}) {
  const id = useId();
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    const controls = () => [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
    (dialog.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? controls()[0] ?? dialog.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="ui-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`ui-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
      <header><h2 id={id}>{title}</h2><button type="button" onClick={onClose}>Close</button></header>
      <div className="ui-dialog-body">{children}</div>
      {actions && <footer className="ui-dialog-actions">{actions}</footer>}
    </section>
  </div>, document.body);
}
