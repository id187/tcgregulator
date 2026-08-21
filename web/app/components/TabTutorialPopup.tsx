import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarIcon,
  ClockIcon,
  GavelIcon,
  MessageIcon,
  ReleaseIcon,
  RevenueIcon,
  TrendIcon,
  UsersIcon,
} from "./MetricGlyphs.tsx";
import { SignalFlow, type SignalFlowNode } from "./SignalFlow.tsx";

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

function getTutorialFlow(sectionLabel?: string): readonly SignalFlowNode[] | null {
  switch (sectionLabel) {
    case "인수인계":
      return [
        { icon: <UsersIcon size={18} />, label: "역할", value: "운영 책임 파악" },
        { icon: <TrendIcon size={18} />, label: "상황", value: "핵심 지표 확인", tone: "caution" },
        { icon: <ClockIcon size={18} />, label: "진행", value: "다음 일정까지", tone: "positive" },
      ];
    case "카드":
      return [
        { icon: <UsersIcon size={18} />, label: "대상", value: "테마·카드 선택" },
        { icon: <TrendIcon size={18} />, label: "판단", value: "성과·시세 비교", tone: "caution" },
        { icon: <GavelIcon size={18} />, label: "요청", value: "발매·금제 방향", tone: "positive" },
      ];
    case "발매":
      return [
        { icon: <CalendarIcon size={18} />, label: "일정", value: "출시 DAY 확인" },
        { icon: <ReleaseIcon size={18} />, label: "구성", value: "수록 카드 파악", tone: "caution" },
        { icon: <TrendIcon size={18} />, label: "비교", value: "파워·반응 추적", tone: "positive" },
      ];
    case "사업 운영":
      return [
        { icon: <RevenueIcon size={18} />, label: "여력", value: "자금·신뢰 확인" },
        { icon: <TrendIcon size={18} />, label: "조건", value: "수익·위험 비교", tone: "caution" },
        { icon: <GavelIcon size={18} />, label: "집행", value: "액션 하나 선택", tone: "positive" },
      ];
    case "커뮤니티":
      return [
        { icon: <MessageIcon size={18} />, label: "여론", value: "주요 반응 훑기" },
        { icon: <UsersIcon size={18} />, label: "갈등", value: "누가 왜 화났는지", tone: "caution" },
        { icon: <CalendarIcon size={18} />, label: "추적", value: "날짜별 후폭풍 비교", tone: "positive" },
      ];
    case "소식":
      return [
        { icon: <CalendarIcon size={18} />, label: "날짜", value: "변화가 생긴 날" },
        { icon: <MessageIcon size={18} />, label: "사건", value: "무슨 일이었는지", tone: "caution" },
        { icon: <TrendIcon size={18} />, label: "파급", value: "수치·여론 변화", tone: "positive" },
      ];
    case "재무":
      return [
        { icon: <RevenueIcon size={18} />, label: "현금", value: "매출·보유자금 확인" },
        { icon: <TrendIcon size={18} />, label: "역행", value: "돈과 환경의 엇박자", tone: "caution" },
        { icon: <CalendarIcon size={18} />, label: "추적", value: "발매·금제와 비교", tone: "positive" },
      ];
    case "첫 금제위원회":
      return [
        { icon: <TrendIcon size={18} />, label: "위협", value: "지배력·채용 확인" },
        { icon: <GavelIcon size={18} />, label: "조정", value: "허용 매수 결정", tone: "caution" },
        { icon: <MessageIcon size={18} />, label: "후폭풍", value: "다음 날부터 관찰", tone: "positive" },
      ];
    case "첫 정기 발매":
      return [
        { icon: <ReleaseIcon size={18} />, label: "구성", value: "수록 4종 확인" },
        { icon: <TrendIcon size={18} />, label: "파워", value: "매출·환경 영향", tone: "caution" },
        { icon: <CalendarIcon size={18} />, label: "반응", value: "D+1 결과 관찰", tone: "positive" },
      ];
    default:
      return null;
  }
}

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
  const tutorialFlow = isFirstPage ? getTutorialFlow(sectionLabel) : null;

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
          {tutorialFlow ? (
            <SignalFlow
              className="tutorial-signal-flow"
              compact
              nodes={tutorialFlow}
            />
          ) : null}
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
