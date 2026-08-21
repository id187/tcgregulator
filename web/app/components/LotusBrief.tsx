import { useCallback, useEffect, useId, useRef, useState } from "react";

import { LotusSymbol } from "./LotusSymbol.tsx";

export type LotusBriefContent = {
  tone: "calm" | "info" | "caution" | "critical";
  kicker: string;
  message: string;
  submessage?: string;
};

export function LotusBrief({ brief }: { brief: LotusBriefContent }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndRestoreFocus();
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [closeAndRestoreFocus, open]);

  return (
    <aside
      aria-label="LOTUS 조언 단말"
      className={`lotus-advisor-terminal ${brief.tone}${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          open
            ? "LOTUS 조언 닫기"
            : `LOTUS 조언 열기 · ${brief.kicker}`
        }
        className="lotus-advisor-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="lotus-advisor-trigger-symbol">
          <LotusSymbol tone={brief.tone} />
        </span>
        <span className="lotus-advisor-trigger-copy">
          <strong>LOTUS</strong>
          <small>{brief.kicker}</small>
        </span>
        <span aria-hidden="true" className="lotus-advisor-status-dot" />
      </button>

      {open ? (
        <section
          aria-labelledby={titleId}
          aria-modal="false"
          className="lotus-advisor-panel"
          id={panelId}
          role="dialog"
        >
          <header className="lotus-advisor-panel-heading">
            <span>운영 조언 단말</span>
            <strong id={titleId}>LOTUS · {brief.kicker}</strong>
            <button
              aria-label="LOTUS 조언 닫기"
              className="lotus-advisor-close"
              onClick={closeAndRestoreFocus}
              ref={closeRef}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div aria-live="polite" className="lotus-advisor-copy">
            <p>{brief.message}</p>
            {brief.submessage ? <small>{brief.submessage}</small> : null}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
