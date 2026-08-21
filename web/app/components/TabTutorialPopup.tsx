import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type TabTutorialTerm = {
  label: string;
  description: ReactNode;
};

export type TabTutorialPage = {
  title: string;
  body: ReactNode;
  terms?: readonly TabTutorialTerm[];
};

export type TabTutorialPopupProps = {
  pages: readonly TabTutorialPage[];
  currentIndex: number;
  sectionLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onComplete: () => void;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function TabTutorialPopup({
  pages,
  currentIndex,
  onPrevious,
  onNext,
  onComplete,
  sectionLabel,
}: TabTutorialPopupProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const sectionId = useId();
  const titleId = useId();
  const contentId = useId();

  const safeIndex = Math.min(Math.max(currentIndex, 0), pages.length - 1);
  const page = pages[safeIndex];
  const isOpen = Boolean(page);
  const isFirstPage = safeIndex === 0;
  const isLastPage = safeIndex === pages.length - 1;

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus();
  }, [safeIndex]);

  if (!page || typeof document === "undefined") return null;

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const activeIndex = focusableElements.indexOf(
      document.activeElement as HTMLElement,
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (activeIndex < 0) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && activeIndex === focusableElements.length - 1) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return createPortal(
    <div className="tab-tutorial-popup__backdrop">
      <dialog
        aria-describedby={contentId}
        aria-labelledby={`${sectionId} ${titleId}`}
        aria-modal="true"
        className="tab-tutorial-popup"
        onKeyDown={handleDialogKeyDown}
        open
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="tab-tutorial-popup__header">
          <div className="tab-tutorial-popup__meta">
            <span id={sectionId}>
              {sectionLabel ? `${sectionLabel} 안내` : "첫 방문 안내"}
            </span>
            <span aria-label={`${pages.length}쪽 중 ${safeIndex + 1}쪽`}>
              {safeIndex + 1} / {pages.length}
            </span>
          </div>
          <h2 id={titleId} ref={titleRef} tabIndex={-1}>
            {page.title}
          </h2>
        </header>

        <div className="tab-tutorial-popup__body" id={contentId} ref={bodyRef}>
          <div className="tab-tutorial-popup__content">{page.body}</div>

          {page.terms && page.terms.length > 0 ? (
            <dl className="tab-tutorial-popup__terms">
              {page.terms.map((term, index) => (
                <div key={`${term.label}-${index}`}>
                  <dt>{term.label}</dt>
                  <dd>{term.description}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <footer className="tab-tutorial-popup__footer">
          <span aria-live="polite" className="tab-tutorial-popup__page-status">
            {safeIndex + 1} / {pages.length}
          </span>
          <div className="tab-tutorial-popup__actions">
            <button
              className="tab-tutorial-popup__previous"
              disabled={isFirstPage}
              onClick={onPrevious}
              type="button"
            >
              이전
            </button>
            {isLastPage ? (
              <button
                className="tab-tutorial-popup__complete"
                onClick={onComplete}
                type="button"
              >
                확인
              </button>
            ) : (
              <button
                className="tab-tutorial-popup__next"
                onClick={onNext}
                type="button"
              >
                다음
              </button>
            )}
          </div>
        </footer>
      </dialog>
    </div>,
    document.body,
  );
}
