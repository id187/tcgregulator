import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailyNews,
  getDailyNewsRange,
  getImpactNewsRange,
} from "../app/game/daily-news.ts";
import { FIRST_BAN_DAY, PLAYER_START_DAY } from "../app/game/campaign.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame } from "../app/game/engine.ts";
import { parseGameState } from "../app/game/save-schema.ts";
import type { DailyHistory, GameState, ThemeId } from "../app/game/types.ts";

const NEWS_DAY = PLAYER_START_DAY;
const PREVIOUS_NEWS_DAY = NEWS_DAY - 1;
const ROLLING_WINDOW_START_DAY = NEWS_DAY - 14;

function stableFixtureThemeIds(state: GameState): [ThemeId, ThemeId] {
  const firstWindowRow = state.history.find(
    (entry) => entry.day === ROLLING_WINDOW_START_DAY,
  );
  assert.ok(firstWindowRow);
  const ids = (Object.keys(firstWindowRow.shares) as ThemeId[]).sort(
    (left, right) => left.localeCompare(right),
  );
  assert.ok(ids.length >= 2);
  return [ids[0], ids[1]];
}

function setPlacements(
  entry: DailyHistory,
  leaderId: ThemeId,
  leaderPlacements: number,
  runnerId: ThemeId,
): void {
  entry.topCutPlacements = Object.fromEntries(
    (Object.keys(entry.shares) as ThemeId[]).map((themeId) => [
      themeId,
      themeId === leaderId
        ? leaderPlacements
        : themeId === runnerId
        ? 32 - leaderPlacements
        : 0,
    ]),
  );
}

function setUserShareLeader(
  entry: DailyHistory,
  leaderId: ThemeId,
  runnerId: ThemeId,
): void {
  const ids = Object.keys(entry.shares) as ThemeId[];
  const minorShare = 0.01;
  const minorTotal = Math.max(0, ids.length - 2) * minorShare;
  entry.shares = Object.fromEntries(
    ids.map((themeId) => [
      themeId,
      themeId === leaderId
        ? 0.6
        : themeId === runnerId
        ? 0.4 - minorTotal
        : minorShare,
    ]),
  );
  entry.topThemeId = leaderId;
}

function placementLeaderChangeFixture(): {
  state: GameState;
  fromThemeId: ThemeId;
  toThemeId: ThemeId;
} {
  const state = createInitialGame(0x5eed1234);
  const [fromThemeId, toThemeId] = stableFixtureThemeIds(state);
  for (const entry of state.history) {
    if (
      entry.day < ROLLING_WINDOW_START_DAY ||
      entry.day > NEWS_DAY
    ) continue;
    const fromPlacements = entry.day === ROLLING_WINDOW_START_DAY
      ? 32
      : entry.day === NEWS_DAY
      ? 0
      : 16;
    setPlacements(entry, fromThemeId, fromPlacements, toThemeId);
    setUserShareLeader(entry, fromThemeId, toThemeId);
  }
  state.currentTopThemeId = fromThemeId;
  const current = state.history.find((entry) => entry.day === NEWS_DAY);
  assert.ok(current);
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = current.shares[themeId];
  }
  return { state, fromThemeId, toThemeId };
}

function metaLeaderNews(state: GameState, day: number) {
  return getDailyNews(state, day).filter(
    (item) => item.headline === "메타 1위가 바뀌었습니다",
  );
}

test("range collection preserves every intermediate day in stable order", () => {
  const state = createInitialGame(0x5eed1234);
  const rangeStartDay = NEWS_DAY - 7;
  const range = getDailyNewsRange(state, rangeStartDay, NEWS_DAY);
  const daily = Array.from(
    { length: 7 },
    (_, index) => rangeStartDay + index + 1,
  ).flatMap((day) => getDailyNews(state, day));

  assert.deepEqual(range, daily);
  assert.equal(new Set(range.map((item) => item.id)).size, range.length);
  assert.ok(range.every((item, index) => index === 0 || item.day >= range[index - 1].day));
});

test("promotes only genuinely high-like posts into the news desk", () => {
  const state = createInitialGame(0x5eed1234);
  const quiet = getDailyNews(state, 1).filter(
    (item) => item.kind === "community",
  );
  const popular = getDailyNews(state, 3).filter(
    (item) => item.kind === "community",
  );

  assert.equal(quiet.length, 0);
  assert.equal(popular.length, 1);
  assert.match(popular[0].detail, /^♥ [\d,]+ · /);
});

test("a user-share leader change alone does not produce meta-leader news", () => {
  const state = createInitialGame(0x5eed1234);
  const [fromThemeId, toThemeId] = stableFixtureThemeIds(state);
  for (const entry of state.history) {
    if (
      entry.day < ROLLING_WINDOW_START_DAY ||
      entry.day > NEWS_DAY
    ) continue;
    setPlacements(entry, fromThemeId, 20, toThemeId);
  }
  const previous = state.history.find(
    (entry) => entry.day === PREVIOUS_NEWS_DAY,
  );
  const current = state.history.find((entry) => entry.day === NEWS_DAY);
  assert.ok(previous && current);
  setUserShareLeader(previous, fromThemeId, toThemeId);
  setUserShareLeader(current, toThemeId, fromThemeId);
  state.currentTopThemeId = toThemeId;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = current.shares[themeId];
  }

  assert.equal(metaLeaderNews(state, NEWS_DAY).length, 0);
});

test("a rolling top-cut leader change produces one correctly named notice", () => {
  const { state, fromThemeId, toThemeId } = placementLeaderChangeFixture();
  const notices = metaLeaderNews(state, NEWS_DAY);

  assert.equal(notices.length, 1);
  assert.equal(
    notices[0].detail,
    `${THEME_BY_ID[fromThemeId].shortName} → ${THEME_BY_ID[toThemeId].shortName}`,
  );
});

test("meta-leader news is stable across save and news-range chunks", () => {
  const { state } = placementLeaderChangeFixture();
  const restored = parseGameState(JSON.parse(JSON.stringify(state)));
  const rangeStartDay = NEWS_DAY - 2;

  assert.deepEqual(
    metaLeaderNews(restored, NEWS_DAY),
    metaLeaderNews(state, NEWS_DAY),
  );
  const wholeRange = getDailyNewsRange(restored, rangeStartDay, NEWS_DAY);
  const chunkedRange = [
    ...getDailyNewsRange(restored, rangeStartDay, PREVIOUS_NEWS_DAY),
    ...getDailyNewsRange(restored, PREVIOUS_NEWS_DAY, NEWS_DAY),
  ];
  assert.deepEqual(chunkedRange, wholeRange);
  assert.equal(
    wholeRange.filter(
      (item) =>
        item.day === NEWS_DAY &&
        item.headline === "메타 1위가 바뀌었습니다",
    ).length,
    1,
  );
});

test("keeps restriction, next-day top-cut shock, and price shock as rapid separate notices", () => {
  const state = createInitialGame(0x5eed1234);
  const impactDay = FIRST_BAN_DAY + 1;
  const impact = getImpactNewsRange(
    state,
    FIRST_BAN_DAY - 1,
    impactDay,
  );
  const restriction = impact.find(
    (item) => item.day === FIRST_BAN_DAY && item.kind === "restriction",
  );
  const topCut = impact.find(
    (item) => item.day === impactDay && /탑컷이 급하강/.test(item.headline),
  );
  const price = impact.find(
    (item) => item.day === impactDay && /시세가 폭락/.test(item.headline),
  );

  assert.ok(restriction);
  assert.ok(topCut);
  assert.ok(price);
  assert.equal(topCut.chainId, restriction.chainId);
  assert.equal(price.chainId, restriction.chainId);
  assert.ok(impact.indexOf(topCut) < impact.indexOf(price));
});
