import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game/engine.ts";
import { getEmergentNarrativesForDay } from "../app/game/emergent-narratives.ts";
import type { DailyHistory, GameState, ThemeId } from "../app/game/types.ts";

function historyRow(
  state: GameState,
  day: number,
  featuredThemeId: ThemeId,
  featuredShare: number,
  environmentHealth = 70,
): DailyHistory {
  const otherThemeIds = state.activeThemeIds.filter(
    (themeId) => themeId !== featuredThemeId,
  );
  const otherShare = (1 - featuredShare) / otherThemeIds.length;
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      themeId === featuredThemeId ? featuredShare : otherShare,
    ]),
  );
  return {
    day,
    totalUsers: 10_000,
    revenue: 0.5,
    environmentHealth,
    topThemeId: featuredThemeId,
    shares,
  };
}

test("DAY 0 assigns no reputation or historical role to a starting theme", () => {
  const state = createInitialGame(91_100);

  assert.deepEqual(getEmergentNarrativesForDay(state, 0), []);
});

test("a report day without its decision snapshot skips the failed-list story", () => {
  const state = createInitialGame(91_104);
  const themeId = state.activeThemeIds[0];
  state.day = 129;
  state.history = [historyRow(state, 129, themeId, 0.2)];

  let narratives: ReturnType<typeof getEmergentNarrativesForDay> = [];
  assert.doesNotThrow(() => {
    narratives = getEmergentNarrativesForDay(state, 129);
  });
  assert.equal(
    narratives.some((narrative) => narrative.kind === "failed-restriction"),
    false,
  );
});

test("a theme earns a revival story only after falling away and returning", () => {
  const state = createInitialGame(91_101);
  const themeId = state.activeThemeIds[0];
  state.day = 35;
  state.history = Array.from({ length: 35 }, (_, index) => {
    const day = index + 1;
    const share = day === 1 ? 0.14 : day === 34 ? 0.12 : day === 35 ? 0.14 : 0.04;
    return historyRow(state, day, themeId, share);
  });

  const revival = getEmergentNarrativesForDay(state, 35).find(
    (narrative) => narrative.kind === "revival",
  );

  assert.ok(revival);
  assert.equal(revival.event.themeId, themeId);
  assert.match(revival.event.body, /부활/);
});

test("a broken-pack nickname belongs to the actual released pack", () => {
  const state = createInitialGame(91_102);
  const themeId = state.activeThemeIds[0];
  const baselineProduct = state.releaseHistory[0]?.products[0];
  assert.ok(baselineProduct);
  state.day = 19;
  state.releaseHistory.push({
    day: 10,
    releaseKind: "regular",
    products: [
      {
        ...baselineProduct,
        optionId: "broken-pack-fixture",
        powerAdjustment: 3,
      },
    ],
  });
  state.history = [
    historyRow(state, 10, themeId, 0.2, 72),
    historyRow(state, 19, themeId, 0.3, 60),
  ];

  const brokenPack = getEmergentNarrativesForDay(state, 19).find(
    (narrative) => narrative.kind === "broken-pack-nickname",
  );

  assert.ok(brokenPack);
  assert.match(brokenPack.event.body, /^REGULATOR PACK Vol\. 1/);
  assert.match(brokenPack.event.body, /팩 이름 대신 별명/);
});

test("an iconic theme label appears only after a sustained live run", () => {
  const state = createInitialGame(91_103);
  const themeId = state.activeThemeIds[0];
  state.day = 21;
  state.history = Array.from({ length: 21 }, (_, index) =>
    historyRow(state, index + 1, themeId, 0.2),
  );

  const iconic = getEmergentNarrativesForDay(state, 21).find(
    (narrative) => narrative.kind === "iconic-polarization",
  );

  assert.ok(iconic);
  assert.equal(iconic.event.themeId, themeId);
  assert.match(iconic.event.body, /사랑과 증오/);
});
