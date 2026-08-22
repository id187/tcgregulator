import { useEffect, useRef, useState, type CSSProperties } from "react";

import { emitGameSound } from "../game-sound.ts";
import { RESTRICTION_REPORT_DELAY_DAYS } from "../game/campaign.ts";
import type { RestrictionCardDisplay } from "../game/restriction-display.ts";
import type {
  ReleaseBatch,
  RestrictionLimit,
} from "../game/types.ts";
import { GavelIcon, MessageIcon, ReleaseIcon } from "./MetricGlyphs.tsx";
import { RegulatorCardFace } from "./RegulatorCardFace.tsx";
import { ReleasePublicationSequence } from "./ReleasePublicationSequence.tsx";

export type DecisionOutcome =
  | {
      kind: "release";
      day: number;
      batch: ReleaseBatch;
    }
  | {
      kind: "restriction";
      day: number;
      changes: readonly {
        cardId: string;
        name: string;
        accent?: string;
        effect: string;
        overline: string;
        themeId?: string;
        before: RestrictionLimit;
        after: RestrictionLimit;
      }[];
      currentRestrictions: readonly (RestrictionCardDisplay & {
        previousLimit?: RestrictionLimit;
      })[];
      releasedCards: readonly {
        card: RestrictionCardDisplay;
        previousLimit: RestrictionLimit;
      }[];
    };

const LIMIT_LABELS: Record<RestrictionLimit, string> = {
  0: "금지",
  1: "제한",
  2: "준제한",
  3: "해제",
};

export function DecisionOutcomeOverlay({
  outcome,
  onContinue,
}: {
  outcome: DecisionOutcome;
  onContinue: () => void;
}) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const onContinueRef = useRef(onContinue);
  const [revealReady, setRevealReady] = useState(false);

  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onContinueRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [outcome.day, outcome.kind]);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setRevealReady(true),
      reducedMotion ? 80 : outcome.kind === "release" ? 2800 : 1700,
    );
    return () => window.clearTimeout(timer);
  }, [outcome.day, outcome.kind]);

  useEffect(() => {
    if (!revealReady) return;
    continueRef.current?.focus({ preventScroll: true });
  }, [revealReady]);

  useEffect(() => {
    if (outcome.kind !== "restriction") return;
    const firstStampedIndex = outcome.currentRestrictions.findIndex(
      (card) => card.previousLimit !== undefined,
    );
    if (firstStampedIndex < 0) return;
    const firstStamp = outcome.currentRestrictions[firstStampedIndex];
    const duration = firstStamp.limit === 0
      ? 720
      : firstStamp.limit === 1
        ? 600
        : 520;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const contactDelay = 260 + firstStampedIndex * 130 + duration * 0.64;
    const timer = window.setTimeout(
      () => emitGameSound("impact"),
      reducedMotion ? 0 : contactDelay,
    );
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const isRelease = outcome.kind === "release";
  const publicationDay = outcome.day + 1;

  return (
    <div className={`decision-outcome-layer is-${outcome.kind}`}>
      <section
        aria-labelledby="decision-outcome-title"
        aria-modal="true"
        className="decision-outcome-dialog"
        role="dialog"
      >
        <header className="decision-outcome-heading">
          <span className="decision-outcome-icon" aria-hidden="true">
            {isRelease ? <ReleaseIcon size={30} /> : <GavelIcon size={30} />}
          </span>
          <div>
            <span>
              OFFICIAL BULLETIN · DAY {publicationDay}
            </span>
            <h1 id="decision-outcome-title">
              {isRelease ? "신제품 발매 공표" : "금제안 공표"}
            </h1>
            <p>
              DAY {outcome.day}에 봉인된 결정이 지금 공식 공개되었습니다.
              실제 환경과 커뮤니티 반응도 함께 도착합니다.
            </p>
          </div>
        </header>

        {outcome.kind === "release" ? (
          <ReleasePublicationSequence batch={outcome.batch} />
        ) : (
          <div className="decision-outcome-restriction">
            <div className="restriction-banlist-stage">
              <header>
                <span>CURRENT RESTRICTION LIST</span>
                <strong>금제 강도순 공식 리스트</strong>
              </header>
              <div className="restriction-verdict-list">
              {outcome.currentRestrictions.length > 0 ? (
                outcome.currentRestrictions.map((card, index) => (
                  <article
                    className={`restriction-ban-card limit-${card.limit}${
                      card.previousLimit !== undefined ? " is-new-verdict" : ""
                    }`}
                    key={card.cardId}
                    style={{ "--verdict-index": index } as CSSProperties}
                  >
                    <RegulatorCardFace
                      accent={card.accent}
                      effect={card.effect}
                      footer={
                        card.previousLimit === undefined
                          ? `현행 ${card.limit}장`
                          : `${card.previousLimit}장 → ${card.limit}장 공표`
                      }
                      overline={card.overline}
                      themeId={card.themeId}
                      title={card.name}
                    />
                    <span className="restriction-verdict-stamp" aria-label={LIMIT_LABELS[card.limit]}>
                      <strong aria-hidden="true">
                        {card.limit === 0 ? (
                          <span className="restriction-ban-symbol" />
                        ) : card.limit === 1 ? "①" : "②"}
                      </strong>
                      <em>{LIMIT_LABELS[card.limit]}</em>
                    </span>
                  </article>
                ))
              ) : (
                <article className="is-maintained">
                  <span>현행 금제 전체</span>
                  <strong>변경 없음</strong>
                  <em>유지</em>
                </article>
              )}
              </div>
              {outcome.releasedCards.length > 0 ? (
                <section className="restriction-release-rail" aria-label="금제 해제 카드">
                  <span>제한 해제</span>
                  {outcome.releasedCards.map(({ card, previousLimit }, index) => (
                    <article
                      className={`restriction-release-card was-limit-${previousLimit}`}
                      key={card.cardId}
                      style={{ "--verdict-index": index } as CSSProperties}
                    >
                      <RegulatorCardFace
                        accent={card.accent}
                        effect={card.effect}
                        footer={`${LIMIT_LABELS[previousLimit]} → 무제한`}
                        overline={card.overline}
                        themeId={card.themeId}
                        title={card.name}
                      />
                      <span className="restriction-seal-peel" aria-hidden="true">
                        {previousLimit === 0 ? (
                          <span className="restriction-ban-symbol" />
                        ) : previousLimit === 1 ? "①" : "②"}
                      </span>
                      <strong className="restriction-release-label">해제</strong>
                    </article>
                  ))}
                </section>
              ) : null}
            </div>
            <div className="restriction-outcome-summary">
              <div>
                <span>공표 변경</span>
                <strong>{outcome.changes.length}건</strong>
              </div>
              <div>
                <span>정책 평가</span>
                <strong>DAY {outcome.day + RESTRICTION_REPORT_DELAY_DAYS}</strong>
              </div>
            </div>
          </div>
        )}

        <footer className="decision-outcome-footer">
          <p>
            <MessageIcon size={16} /> 공표와 동시에 도착한 커뮤니티 기록을 확인합니다.
          </p>
          <button
            className="primary-action"
            disabled={!revealReady}
            onClick={onContinue}
            ref={continueRef}
            type="button"
          >
            {revealReady ? "세상의 반응 확인" : "공표 준비 중…"}
          </button>
        </footer>
      </section>
    </div>
  );
}
