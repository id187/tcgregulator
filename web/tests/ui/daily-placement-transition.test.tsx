import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyPlacementTransitionOverlay } from "../../app/components/DailyPlacementTransitionOverlay.tsx";
import { THEMES } from "../../app/game/content.ts";
import type { DailyHistory } from "../../app/game/types.ts";

const themeIds = THEMES.slice(0, 3).map((theme) => theme.id);

function historyEntry(day: number, counts: readonly number[]): DailyHistory {
  return {
    day,
    totalUsers: 10_000,
    revenue: 10,
    topThemeId: themeIds[0],
    shares: Object.fromEntries(themeIds.map((themeId) => [themeId, 1 / 3])),
    topCutPlacements: Object.fromEntries(
      themeIds.map((themeId, index) => [themeId, counts[index]]),
    ),
  };
}

afterEach(() => {
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("daily placement transition", () => {
  it("morphs from yesterday to today and closes without action buttons", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const onComplete = vi.fn();
    document.body.style.overflow = "scroll";

    render(
      <DailyPlacementTransitionOverlay
        current={historyEntry(13, [8, 12, 12])}
        event={{
          kind: "counter-breakthrough",
          phase: "shock",
          tone: "fall",
          startDay: 13,
          day: 13,
          targetThemeId: themeIds[0],
          previousCount: 18,
          currentCount: 8,
          previousTier: "Tier 1",
          currentTier: "Tier 1",
          headline: "카운터 플랜 급속 확산",
          detail: "입상 수가 급감했습니다.",
          tag: "COUNTER FOUND",
        }}
        onComplete={onComplete}
        previous={historyEntry(12, [18, 10, 4])}
        seed={1234}
      />,
    );

    expect(screen.getByText("PREVIOUS")).toBeTruthy();
    expect(screen.getByText("카운터 플랜 급속 확산")).toBeTruthy();
    expect(document.body.style.overflow).toBe("scroll");

    act(() => vi.advanceTimersByTime(760));

    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();

    act(() => vi.advanceTimersByTime(4800));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
