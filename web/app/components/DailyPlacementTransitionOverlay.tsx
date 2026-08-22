import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { THEME_BY_ID } from "../game/content.ts";
import { buildDailyPlacementTransitionModel } from "../game/daily-placement-transition.ts";
import { getDailyTopCutPlacements } from "../game/placement-meta.ts";
import type { DailyPlacementMicroEvent } from "../game/placement-micro-events.ts";
import type { DailyHistory } from "../game/types.ts";

type TransitionStage = "previous" | "today";

export function DailyPlacementTransitionOverlay({
  current,
  event,
  onComplete,
  previous,
  reducedMotion = false,
  seed,
}: {
  current: DailyHistory;
  event?: DailyPlacementMicroEvent | null;
  onComplete: () => void;
  previous: DailyHistory;
  reducedMotion?: boolean;
  seed: number;
}) {
  const systemReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const motionReduced = reducedMotion || systemReducedMotion;
  const [stage, setStage] = useState<TransitionStage>(
    motionReduced ? "today" : "previous",
  );
  const dialogRef = useRef<HTMLElement>(null);
  const completedRef = useRef(false);
  const stageRef = useRef(stage);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const model = useMemo(
    () => buildDailyPlacementTransitionModel(
      getDailyTopCutPlacements(previous, seed),
      getDailyTopCutPlacements(current, seed),
    ),
    [current, previous, seed],
  );
  const showingToday = stage === "today";
  const total = showingToday ? model.currentTotal : model.previousTotal;
  const segments = useMemo(() => {
    const entries = model.rows
      .map((row) => ({
        color: THEME_BY_ID[row.themeId]?.color ?? "#66809a",
        count: showingToday ? row.currentCount : row.previousCount,
        id: row.themeId,
        label: THEME_BY_ID[row.themeId]?.shortName ?? row.themeId,
      }))
      .filter((entry) => entry.count > 0);
    return entries.reduce<{
      accumulated: number;
      slices: Array<(typeof entries)[number] & { offset: number; size: number }>;
    }>(
      (result, entry, index) => {
        const size = total <= 0
          ? 0
          : index === entries.length - 1
            ? Math.max(0, 100 - result.accumulated)
            : (entry.count / total) * 100;
        return {
          accumulated: result.accumulated + size,
          slices: [
            ...result.slices,
            { ...entry, offset: -result.accumulated, size },
          ],
        };
      },
      { accumulated: 0, slices: [] },
    ).slices;
  }, [model, showingToday, total]);

  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    completedRef.current = false;
    const focusFrame = window.requestAnimationFrame(() =>
      dialogRef.current?.focus({ preventScroll: true }),
    );
    const revealTimer = motionReduced
      ? null
      : window.setTimeout(() => setStage("today"), 760);
    const completeTimer = window.setTimeout(
      () => {
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      },
      motionReduced ? (event ? 3000 : 1500) : event ? 4800 : 2800,
    );
    const preventBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      if (event.target instanceof Element) {
        const scrollArea = event.target.closest<HTMLElement>(
          ".daily-placement-transition-body",
        );
        if (scrollArea && scrollArea.scrollHeight > scrollArea.clientHeight) {
          return;
        }
      }
      event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (stageRef.current === "previous") setStage("today");
      else complete();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    window.addEventListener("wheel", preventBackgroundScroll, {
      passive: false,
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (revealTimer !== null) window.clearTimeout(revealTimer);
      window.clearTimeout(completeTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchmove", preventBackgroundScroll);
      window.removeEventListener("wheel", preventBackgroundScroll);
    };
  }, [current.day, event, motionReduced]);

  return (
    <div className={`daily-placement-transition-layer is-${stage}`}>
      <section
        aria-labelledby="daily-placement-transition-title"
        aria-modal="true"
        className="daily-placement-transition-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <span>DAILY TOURNAMENT WIRE · DAY {previous.day} → {current.day}</span>
          <h2 id="daily-placement-transition-title">오늘의 입상</h2>
          <p>
            {showingToday
              ? `DAY ${current.day} 대회 결과가 확정되었습니다.`
              : `DAY ${previous.day} 입상 분포를 집계 중입니다.`}
          </p>
        </header>

        {event ? (
          <aside
            className={`daily-placement-micro-event is-${event.phase} is-${event.tone}`}
          >
            <span>{event.tag} · SMALL META EVENT</span>
            <strong>{event.headline}</strong>
            <p>{event.detail}</p>
          </aside>
        ) : null}

        <div className="daily-placement-transition-body">
          <div className="daily-placement-transition-donut">
            <svg
              aria-label={`DAY ${showingToday ? current.day : previous.day} 오늘의 입상 분포`}
              role="img"
              viewBox="0 0 100 100"
            >
              <circle
                className="daily-placement-transition-track"
                cx="50"
                cy="50"
                fill="none"
                r="38"
                strokeWidth="15"
              />
              {segments.map((segment) => (
                <circle
                  aria-label={`${segment.label} ${segment.count}석`}
                  className="daily-placement-transition-slice"
                  cx="50"
                  cy="50"
                  fill="none"
                  key={segment.id}
                  pathLength="100"
                  r="38"
                  stroke={segment.color}
                  strokeWidth="15"
                  style={
                    {
                      "--daily-slice-color": segment.color,
                      strokeDasharray: `${segment.size} ${Math.max(0, 100 - segment.size)}`,
                      strokeDashoffset: segment.offset,
                    } as CSSProperties
                  }
                  transform="rotate(-90 50 50)"
                />
              ))}
            </svg>
            <div aria-live="polite" className="daily-placement-transition-core">
              <span>{showingToday ? "TODAY" : "PREVIOUS"}</span>
              <strong>DAY {showingToday ? current.day : previous.day}</strong>
              <em>TOP {total}</em>
            </div>
          </div>

          <ol
            className={`daily-placement-transition-ranking${model.rows.length > 6 ? " is-dense" : ""}`}
          >
            {model.rows.map((row, index) => {
              const theme = THEME_BY_ID[row.themeId];
              const countDelta = row.currentCount - row.previousCount;
              const movement = row.currentRank === null
                ? "OUT"
                : row.previousRank === null
                  ? "NEW"
                  : row.rankDelta && row.rankDelta > 0
                    ? `▲${row.rankDelta}`
                    : row.rankDelta && row.rankDelta < 0
                      ? `▼${Math.abs(row.rankDelta)}`
                      : "—";
              return (
                <li
                  className={
                    row.previousRank === null
                      ? "is-new"
                      : countDelta > 0
                        ? "is-rise"
                        : countDelta < 0
                          ? "is-fall"
                          : "is-flat"
                  }
                  key={row.themeId}
                  style={
                    {
                      "--daily-row-color": theme?.color ?? "#66809a",
                      "--daily-row-index": index,
                    } as CSSProperties
                  }
                >
                  <b>
                    {showingToday
                      ? row.currentRank ?? "-"
                      : row.previousRank ?? "-"}
                  </b>
                  <i aria-hidden="true" />
                  <span>
                    <strong>{theme?.shortName ?? row.themeId}</strong>
                    <small>
                      {showingToday
                        ? `${row.previousCount} → ${row.currentCount}석`
                        : `전일 ${row.previousCount}석`}
                    </small>
                  </span>
                  <em>{showingToday ? movement : "집계"}</em>
                </li>
              );
            })}
          </ol>
        </div>

        <footer>
          <span>
            {event && showingToday
              ? "UNUSUAL MOVEMENT DETECTED"
              : showingToday
                ? "TODAY'S FIELD LOCKED"
                : "CALCULATING TODAY'S FIELD"}
          </span>
        </footer>
      </section>
    </div>
  );
}
