import assert from "node:assert/strict";
import test from "node:test";

import {
  ENVIRONMENT_HEALTH_MODEL,
  getChartEnvironmentHealth,
  getEnvironmentHealthBreakdown,
} from "../app/game/environment-health.ts";
import type {
  DailyHistory,
  GameState,
  ThemeId,
} from "../app/game/types.ts";

const themeIds = Array.from(
  { length: 10 },
  (_, index) => `health-theme-${index}` as ThemeId,
);

function placementMap(counts: number[]): Record<ThemeId, number> {
  return Object.fromEntries(
    themeIds.map((themeId, index) => [themeId, counts[index] ?? 0]),
  ) as Record<ThemeId, number>;
}

function historyRow(
  day: number,
  counts: number[],
): DailyHistory {
  const shares = Object.fromEntries(
    themeIds.map((themeId) => [themeId, 0.1]),
  ) as Record<ThemeId, number>;
  return {
    day,
    totalUsers: 10_000,
    revenue: 1,
    topThemeId: themeIds[counts.indexOf(Math.max(...counts))],
    shares,
    winRates: Object.fromEntries(
      themeIds.map((themeId) => [themeId, 0.5]),
    ) as Record<ThemeId, number>,
    topCutPlacements: placementMap(counts),
  };
}

function makeState(
  previousCounts: number[],
  currentCounts: number[],
): GameState {
  const history = Array.from({ length: 60 }, (_, index) =>
    historyRow(
      index + 1,
      index < 30 ? previousCounts : currentCounts,
    ),
  );
  return {
    day: 60,
    seed: 404,
    activeThemeIds: [...themeIds],
    themes: Object.fromEntries(
      themeIds.map((themeId) => [
        themeId,
        {
          share: 0.1,
          winRate: 0.5,
          unpleasantness: 10,
          fatigue: 10,
        },
      ]),
    ),
    history,
    releaseHistory: [
      {
        day: 30,
        products: themeIds.slice(5).map((themeId) => ({
          kind: "new-theme",
          themeId,
        })),
      },
    ],
  } as unknown as GameState;
}

test("rewards rotation with old and new themes while penalizing lock-in and replacement", () => {
  const previous = [8, 7, 6, 6, 5, 0, 0, 0, 0, 0];
  const healthy = getEnvironmentHealthBreakdown(
    makeState(previous, [0, 0, 8, 7, 6, 6, 5, 0, 0, 0]),
  );
  const locked = getEnvironmentHealthBreakdown(
    makeState(previous, previous),
  );
  const catalogueWipe = getEnvironmentHealthBreakdown(
    makeState(previous, [0, 0, 0, 0, 0, 8, 7, 6, 6, 5]),
  );

  assert.ok(healthy.score > locked.score);
  assert.ok(healthy.score > catalogueWipe.score);
  assert.ok(healthy.generationalBalance > locked.generationalBalance);
  assert.ok(healthy.generationalBalance > catalogueWipe.generationalBalance);
  assert.ok(healthy.topCohortTurnover > locked.topCohortTurnover);
  assert.equal(healthy.topCohortTurnover, 100);
  assert.equal(locked.topCohortTurnover, 55);
  assert.equal(catalogueWipe.topCohortTurnover, 55);
});

test("severe top-cut monopoly scores below a varied sustainable field", () => {
  const previous = [8, 7, 6, 6, 5, 0, 0, 0, 0, 0];
  const varied = getEnvironmentHealthBreakdown(
    makeState(previous, [0, 0, 8, 7, 6, 6, 5, 0, 0, 0]),
  );
  const monopoly = getEnvironmentHealthBreakdown(
    makeState(previous, [0, 0, 0, 0, 0, 32, 0, 0, 0, 0]),
  );

  assert.ok(monopoly.placementDiversity < varied.placementDiversity);
  assert.ok(monopoly.ecosystemContinuity < varied.ecosystemContinuity);
  assert.ok(monopoly.score < varied.score);
  assert.ok(monopoly.score >= 0 && monopoly.score <= 100);
});

test("plots only matching health models and falls back live for the latest legacy row", () => {
  const current = {
    environmentHealth: 72,
    environmentHealthModel: ENVIRONMENT_HEALTH_MODEL,
  } satisfies Pick<
    DailyHistory,
    "environmentHealth" | "environmentHealthModel"
  >;
  const legacy = { environmentHealth: 12 } satisfies Pick<
    DailyHistory,
    "environmentHealth" | "environmentHealthModel"
  >;

  assert.equal(getChartEnvironmentHealth(current, false, 81), 72);
  assert.equal(getChartEnvironmentHealth(current, true, 81), 72);
  assert.equal(getChartEnvironmentHealth(legacy, false, 81), null);
  assert.equal(getChartEnvironmentHealth(legacy, true, 81), 81);
});
