import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { LotusSymbol } from "./LotusSymbol";

export type GuidedTutorialBrief = {
  kicker: string;
  title: string;
  message: string;
  help?: string;
  objective: number;
  objectiveCount: number;
  continueLabel?: string;
  controlIds?: readonly string[];
  informational?: boolean;
  freeInteraction?: boolean;
};

type GuidedTutorialTerm = {
  id: string;
  label: string;
  match: string;
};

export type GuidedTutorialPage = {
  message: string;
  termId?: string;
  termLabel?: string;
  terms: GuidedTutorialTerm[];
};

const TUTORIAL_TERM_DEFINITIONS: ReadonlyArray<{
  id: string;
  label: string;
  matches: readonly string[];
}> = [
  { id: "active-users", label: "활성 유저", matches: ["활성 유저"] },
  { id: "user-share", label: "유저 비율", matches: ["유저 비율"] },
  { id: "meta-segment", label: "메타층", matches: ["메타층"] },
  { id: "casual-segment", label: "캐주얼층", matches: ["캐주얼층"] },
  { id: "collector-segment", label: "콜렉터층", matches: ["콜렉터층"] },
  { id: "reseller-segment", label: "리셀층", matches: ["리셀층"] },
  { id: "placement", label: "입상", matches: ["입상"] },
  {
    id: "top-cut-share",
    label: "탑컷 비율",
    matches: ["탑컷 점유율", "탑컷 비율"],
  },
  { id: "adoption-rate", label: "채용률", matches: ["채용률"] },
  { id: "win-rate", label: "승률", matches: ["승률"] },
  { id: "card-market-price", label: "시세", matches: ["카드 시세", "시세"] },
  {
    id: "environment-health",
    label: "환경 건강도",
    matches: ["환경 건강도", "환경 건강", "생태계 건강"],
  },
  { id: "purchase-trust", label: "구매 신뢰", matches: ["구매 신뢰"] },
  { id: "forbidden", label: "금지", matches: ["금지"] },
  { id: "limited", label: "제한", matches: ["제한"] },
  { id: "semi-limited", label: "준제한", matches: ["준제한"] },
  { id: "unlimited", label: "무제한", matches: ["무제한"] },
  { id: "restriction-reset", label: "초기화", matches: ["초기화"] },
  { id: "restriction-submit", label: "제출", matches: ["제출"] },
  { id: "tutorial-skip", label: "안내 생략", matches: ["안내 생략"] },
  {
    id: "tutorial-home",
    label: "메인 화면으로",
    matches: ["메인 화면으로"],
  },
];

function buildTutorialPage(message: string): GuidedTutorialPage {
  const terms = TUTORIAL_TERM_DEFINITIONS.flatMap((definition) => {
    const match = definition.matches.find((candidate) =>
      message.includes(candidate),
    );
    return match ? [{ id: definition.id, label: definition.label, match }] : [];
  }).sort((left, right) => right.match.length - left.match.length);
  return {
    message,
    termId: terms[0]?.id,
    termLabel: terms[0]?.label,
    terms,
  };
}

function addDescriptionToken(element: HTMLElement, token: string) {
  const tokens = new Set((element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  tokens.add(token);
  element.setAttribute("aria-describedby", [...tokens].join(" "));
}

function removeDescriptionToken(element: HTMLElement, token: string) {
  const tokens = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((value) => value && value !== token);
  if (tokens.length > 0) element.setAttribute("aria-describedby", tokens.join(" "));
  else element.removeAttribute("aria-describedby");
}

function renderTutorialMessage(page: GuidedTutorialPage): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < page.message.length) {
    let selected: GuidedTutorialTerm | null = null;
    let selectedIndex = Number.POSITIVE_INFINITY;
    for (const term of page.terms) {
      const index = page.message.indexOf(term.match, cursor);
      if (index < 0) continue;
      if (
        index < selectedIndex ||
        (index === selectedIndex && term.match.length > (selected?.match.length ?? 0))
      ) {
        selected = term;
        selectedIndex = index;
      }
    }
    if (!selected || !Number.isFinite(selectedIndex)) {
      result.push(page.message.slice(cursor));
      break;
    }
    if (selectedIndex > cursor) {
      result.push(page.message.slice(cursor, selectedIndex));
    }
    result.push(
      <mark className="guided-term-mark" data-term-id={selected.id} key={`${selected.id}-${key}`}>
        {selected.match}
      </mark>,
    );
    cursor = selectedIndex + selected.match.length;
    key += 1;
  }
  return result;
}

export function buildGuidedTutorialPages(
  _step: string,
  brief: GuidedTutorialBrief,
): GuidedTutorialPage[] {
  return [buildTutorialPage(brief.message)];
}
export function GuidedTutorialBar({
  allowSkip,
  brief,
  busy,
  compact = false,
  day,
  onInformationalNext,
  onMain,
  onSkip,
  onSkipConfirmOpenChange,
  skipConfirmOpen,
  step,
  targetKey,
}: {
  allowSkip: boolean;
  brief: GuidedTutorialBrief;
  busy: boolean;
  compact?: boolean;
  day: number;
  onInformationalNext: () => void;
  onMain: () => void;
  onSkip: () => void;
  onSkipConfirmOpenChange: (open: boolean) => void;
  skipConfirmOpen: boolean;
  step: string;
  targetKey: string;
}) {
  const promptKey = `${step}:${day}`;
  const [helpPromptKey, setHelpPromptKey] = useState<string | null>(null);
  const [dismissedPromptKey, setDismissedPromptKey] = useState<string | null>(
    null,
  );
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const skipCancelRef = useRef<HTMLButtonElement>(null);
  const showHelp = helpPromptKey === promptKey;
  const promptDismissed = dismissedPromptKey === promptKey;
  const currentPage = buildTutorialPage(
    showHelp && brief.help ? brief.help : brief.message,
  );
  const controlKey = brief.controlIds?.join("|") ?? "";
  const canAnchor =
    !compact &&
    !promptDismissed &&
    rect !== null &&
    typeof window !== "undefined" &&
    window.innerWidth > 720 &&
    window.innerHeight > 520;
  const anchorAbove = canAnchor && rect.top >= 210;
  const tutorialStyle: CSSProperties | undefined = canAnchor
    ? (() => {
        const bubbleWidth = Math.min(430, window.innerWidth - 32);
        const center = rect.left + rect.width / 2;
        const left = Math.max(
          16 + bubbleWidth / 2,
          Math.min(window.innerWidth - 16 - bubbleWidth / 2, center),
        );
        return {
          bottom: "auto",
          left,
          right: "auto",
          top: anchorAbove ? rect.top - 12 : rect.top + rect.height + 12,
          transform: anchorAbove
            ? "translate(-50%, -100%)"
            : "translateX(-50%)",
        };
      })()
    : undefined;

  useEffect(() => {
    if (!skipConfirmOpen) return;
    const previouslyFocused = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      skipCancelRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkipConfirmOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".guided-skip-dialog");
      const buttons = dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
          )
        : [];
      if (buttons.length === 0) return;
      const currentIndex = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + direction + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[nextIndex].focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [onSkipConfirmOpenChange, skipConfirmOpen]);

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let targets: HTMLElement[] = [];
    const observer = new ResizeObserver(() => measure());

    const measure = () => {
      if (targets.length === 0) {
        setRect(null);
        return;
      }
      const bounds = targets.map((target) => target.getBoundingClientRect());
      const padding = 7;
      const left = Math.max(
        0,
        Math.min(...bounds.map((item) => item.left)) - padding,
      );
      const top = Math.max(
        0,
        Math.min(...bounds.map((item) => item.top)) - padding,
      );
      const right = Math.min(
        window.innerWidth,
        Math.max(...bounds.map((item) => item.right)) + padding,
      );
      const bottom = Math.min(
        window.innerHeight,
        Math.max(...bounds.map((item) => item.bottom)) + padding,
      );
      setRect({
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      });
    };

    const connect = () => {
      if (compact || promptDismissed) {
        setRect(null);
        return;
      }
      const selectors = brief.controlIds?.length
        ? brief.controlIds.map(
            (controlId) => `[data-tutorial-control~="${controlId}"]`,
          )
        : ['[data-tutorial-target="active"]'];
      targets = Array.from(
        document.querySelectorAll<HTMLElement>(selectors.join(",")),
      ).filter((target) => target.getClientRects().length > 0);
      if (targets.length === 0) {
        attempts += 1;
        if (attempts < 12) frame = window.requestAnimationFrame(connect);
        return;
      }
      targets[0].scrollIntoView({ block: "nearest", inline: "nearest" });
      targets.forEach((target) => {
        addDescriptionToken(target, "guided-tutorial-message");
        observer.observe(target);
      });
      measure();
    };

    const handleViewportChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    frame = window.requestAnimationFrame(connect);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      observer.disconnect();
      targets.forEach((target) =>
        removeDescriptionToken(target, "guided-tutorial-message"),
      );
    };
  }, [
    brief.controlIds,
    compact,
    controlKey,
    promptDismissed,
    targetKey,
  ]);

  return (
    <div
      className={`guided-tour-layer${
        brief.freeInteraction ? " is-free-interaction" : ""
      }${skipConfirmOpen ? " is-skip-confirming" : ""}`}
    >
      {rect && !promptDismissed ? (
        <div
          aria-hidden="true"
          className="guided-target-outline"
          style={rect}
        />
      ) : null}

      {!compact && !promptDismissed ? (
        <aside
          aria-live="polite"
          className={`guided-tutorial-bar${
            canAnchor
              ? ` is-anchored ${anchorAbove ? "is-above" : "is-below"}`
              : ""
          }`}
          data-guided-objective={step}
          id="guided-tutorial-message"
          style={tutorialStyle}
        >
          <button
            aria-label="현재 사건 안내 닫기"
            className="guided-close-button"
            disabled={busy}
            onClick={() => {
              setHelpPromptKey(null);
              setDismissedPromptKey(promptKey);
            }}
            title="현재 사건 안내 닫기"
            type="button"
          >
            ×
          </button>
          <LotusSymbol tone="info" />
          <div className="guided-tutorial-copy">
            <strong>
              {showHelp ? "상황 설명" : brief.title}
            </strong>
            <p>{renderTutorialMessage(currentPage)}</p>
          </div>
          <div
            className="guided-tutorial-progress"
            aria-label={`인수인계 목표 ${brief.objective}/${brief.objectiveCount}`}
          >
            <span>
              DAY {day} · 목표 {brief.objective}/{brief.objectiveCount}
            </span>
            <i aria-hidden="true">
              <b
                style={{
                  width: `${(brief.objective / brief.objectiveCount) * 100}%`,
                }}
              />
            </i>
          </div>
          <div className="guided-tutorial-actions">
            {brief.help ? (
              <button
                aria-label={showHelp ? "상황 설명 닫기" : "상황 설명 보기"}
                aria-pressed={showHelp}
                className="guided-info-button"
                disabled={busy}
                onClick={() =>
                  setHelpPromptKey((current) =>
                    current === promptKey ? null : promptKey,
                  )
                }
                title={showHelp ? "상황 설명 닫기" : "상황 설명 보기"}
                type="button"
              >
                ⓘ
              </button>
            ) : null}
            {brief.informational ? (
              <button
                className="is-next"
                disabled={busy}
                onClick={onInformationalNext}
                type="button"
              >
                {brief.continueLabel ?? "계속"}
              </button>
            ) : null}
            <button
              data-tutorial-term="tutorial-skip"
              disabled={busy || !allowSkip}
              onClick={() => onSkipConfirmOpenChange(true)}
              title={
                allowSkip ? "현재 진행을 유지하고 튜토리얼 안내만 생략" : undefined
              }
              type="button"
            >
              안내 생략
            </button>
            <button
              data-tutorial-term="tutorial-home"
              disabled={busy}
              onClick={onMain}
              type="button"
            >
              메인 화면으로
            </button>
          </div>
        </aside>
      ) : null}

      {skipConfirmOpen ? (
        <>
          <div aria-hidden="true" className="guided-skip-dialog-backdrop" />
          <section
            aria-describedby="guided-skip-description"
            aria-labelledby="guided-skip-title"
            aria-modal="true"
            className="guided-skip-dialog"
            role="alertdialog"
          >
            <LotusSymbol tone="caution" />
            <div className="guided-skip-dialog-copy">
              <span>LOTUS · TUTORIAL</span>
              <strong id="guided-skip-title">튜토리얼 안내를 생략할까요?</strong>
              <p id="guided-skip-description">
                현재 DAY와 진행 상태를 그대로 유지한 채 즉시 자유 운영으로
                전환합니다.
              </p>
            </div>
            <div className="guided-skip-dialog-note">
              설정에서 튜토리얼을 다시 ON한 뒤 새 임기를 시작하면 처음부터
              다시 볼 수 있습니다.
            </div>
            <div className="guided-skip-dialog-actions">
              <button
                className="guided-skip-dialog-cancel"
                disabled={busy}
                onClick={() => onSkipConfirmOpenChange(false)}
                ref={skipCancelRef}
                type="button"
              >
                계속 안내받기
              </button>
              <button
                className="guided-skip-dialog-confirm"
                disabled={busy}
                onClick={() => {
                  onSkipConfirmOpenChange(false);
                  onSkip();
                }}
                type="button"
              >
                {busy ? "전환 중" : "현재부터 자유 운영"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
