import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep help outside scrolling rows, with the same content on hover and focus. */
export function HelpTooltip({ children, content, className = "", focusable = false }: {
  children: (descriptionId: string) => ReactNode;
  content: ReactNode;
  className?: string;
  focusable?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState(".875rem");
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const keepOpen = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };
  const show = () => {
    keepOpen();
    if (anchor.current) setFontSize(getComputedStyle(anchor.current).getPropertyValue("--battle-type-body").trim() || ".875rem");
    setOpen(true);
  };
  const hideSoon = () => {
    keepOpen();
    hideTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => keepOpen(), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current || !tooltip.current) return;
      const box = anchor.current.getBoundingClientRect();
      const tip = tooltip.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(box.left, window.innerWidth - tip.width - 12));
      const above = box.top - tip.height - 8;
      const top = above >= 12 ? above : Math.max(12, Math.min(box.bottom + 8, window.innerHeight - tip.height - 12));
      setPosition({ left, top });
    };
    const dismiss = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") { keepOpen(); setOpen(false); }
      } else if (!anchor.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) {
        keepOpen(); setOpen(false);
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open, content, fontSize]);

  return <span ref={anchor} className={`help-anchor ${className}`} tabIndex={focusable ? 0 : undefined} aria-describedby={focusable ? id : undefined}
    onMouseEnter={show} onMouseLeave={hideSoon} onFocusCapture={show}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hideSoon(); }} onClick={show}>
    {children(id)}
    {createPortal(<div ref={tooltip} id={id} role="tooltip" hidden={!open} className="battle-help-tooltip" style={{ ...position, fontSize }} onMouseEnter={keepOpen} onMouseLeave={hideSoon}>{content}</div>, document.body)}
  </span>;
}
