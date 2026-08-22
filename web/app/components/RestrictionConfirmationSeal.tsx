import { useEffect, useRef } from "react";

import { emitGameSound } from "../game-sound.ts";

export function RestrictionConfirmationSeal({
  changeCount,
  day,
  onComplete,
}: {
  changeCount: number;
  day: number;
  onComplete: () => void;
}) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const timer = window.setTimeout(() => onCompleteRef.current(), 1650);
    return () => window.clearTimeout(timer);
  }, [day]);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => emitGameSound("impact"),
      reducedMotion ? 0 : 710,
    );
    return () => window.clearTimeout(timer);
  }, [day]);

  return (
    <button
      aria-label={`DAY ${day} 금제안 의결 완료. 공표는 DAY ${day + 1}입니다.`}
      className="restriction-confirmation-layer"
      onClick={onComplete}
      type="button"
    >
      <span className="restriction-confirmation-sheet">
        <span className="restriction-confirmation-kicker">
          RESTRICTION COMMITTEE · DAY {day}
        </span>
        <strong>금제안 의결 완료</strong>
        <span className="restriction-confirmed-stamp" aria-hidden="true">
          CONFIRMED
        </span>
        <span className="restriction-confirmation-meta">
          {changeCount > 0 ? `${changeCount}건 봉인` : "현행 유지 봉인"} · 공식
          공표 DAY {day + 1}
        </span>
      </span>
    </button>
  );
}
