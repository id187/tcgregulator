import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailyNews,
  getDailyNewsRange,
  getImpactNewsRange,
} from "../app/game/daily-news.ts";
import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import {
  FIRST_BAN_DAY,
  FIRST_RELEASE_DAY,
  PLAYER_START_DAY,
  RELEASE_REPORT_DELAY_DAYS,
} from "../app/game/campaign.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import { PLACEMENT_WINDOW_DAYS } from "../app/game/placement-meta.ts";
import { getReleaseSlateKind } from "../app/game/release-kind.ts";
import { parseGameState } from "../app/game/save-schema.ts";
import type { DailyHistory, GameState, ThemeId } from "../app/game/types.ts";

const NEWS_DAY = PLAYER_START_DAY;
const PREVIOUS_NEWS_DAY = NEWS_DAY - 1;
const ROLLING_WINDOW_START_DAY = NEWS_DAY - PLACEMENT_WINDOW_DAYS;

function openReleaseReview(seed: number, targetDay: number): GameState {
  let state = createInitialGame(seed);
  for (let guard = 0; guard < 100; guard += 1) {
    if (state.day === targetDay && state.phase === "release-edit") return state;
    if (state.operations.pendingEvent) {
      state = reduceGame(state, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: state.operations.pendingEvent.id,
        choice: "a",
      });
      continue;
    }
    if (state.phase === "release-edit") {
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: getAutomaticReleaseSelections(state),
      });
      continue;
    }
    if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
      continue;
    }
    state = reduceGame(state, {
      type: "ADVANCE_DAYS",
      days: targetDay - state.day,
    });
  }
  throw new Error(`stalled while progressing to DAY ${targetDay}`);
}

function publishFirstRegularPack(
  seed: number,
  powerAdjustment: -3 | 0 | 3,
): GameState {
  const review = openReleaseReview(seed, FIRST_RELEASE_DAY);
  assert.ok(review.releaseSlate);
  assert.equal(getReleaseSlateKind(review.releaseSlate), "regular");
  return reduceGame(review, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(review).map((selection) => ({
      ...selection,
      powerAdjustment,
    })),
  });
}

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

test("a weak release explains the trust response in plain player language", () => {
  let state = publishFirstRegularPack(0x5eed1234, -3);
  const release = state.releaseHistory.find(
    (batch) => batch.day === FIRST_RELEASE_DAY,
  );
  assert.ok(release);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });

  const metric = getDailyNews(state, FIRST_RELEASE_DAY + 1).find(
    (item) => item.kind === "trust",
  );
  assert.ok(metric);
  assert.equal(
    metric.reason,
    "유저들은 신규 팩이 너무 약하다는 반응입니다.",
  );
  assert.doesNotMatch(metric.reason, /DAY|D\+|정기 발매/);
});

test("DAY 10 release D+1 presents several consequences before the D+9 report", () => {
  const published = publishFirstRegularPack(0x5eed1234, -3);
  const state = reduceGame(published, { type: "ADVANCE_DAYS", days: 1 });
  const impact = getImpactNewsRange(
    state,
    FIRST_RELEASE_DAY,
    FIRST_RELEASE_DAY + 1,
  );
  const metricKinds = new Set(impact.map((item) => item.kind));

  for (const kind of ["revenue", "environment", "trust", "sentiment"] as const) {
    assert.equal(metricKinds.has(kind), true, kind);
  }
  assert.ok(impact.length >= 4);
  assert.ok(
    impact
      .filter((item) => item.chainId === `release-${FIRST_RELEASE_DAY}`)
      .every((item) => !/DAY|D\+|관측/.test(item.reason)),
  );
  const environment = impact.find((item) => item.kind === "environment");
  const sentiment = impact.find((item) => item.kind === "sentiment");
  assert.ok(environment);
  assert.match(environment.reason, /입상 비중.*% → .*%/);
  assert.ok(sentiment);
  assert.match(sentiment.reason, /좋아요 [\d,]+개/);
  assert.equal(
    impact.some((item) => item.kind === "community"),
    false,
    "the side burst should not repeat the same strongest post twice",
  );

  const reportBoundary = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: 100,
  });
  assert.equal(
    reportBoundary.day,
    FIRST_RELEASE_DAY + RELEASE_REPORT_DELAY_DAYS,
  );
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
  assert.ok(popular[0].reason.includes(popular[0].detail.split(" · ")[1]));
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
  const restrictionTarget = state.community.find(
    (event) =>
      event.day === FIRST_BAN_DAY &&
      event.type === "restriction-applied" &&
      event.partId,
  );
  assert.ok(restrictionTarget);
  const runnerId = state.activeThemeIds.find(
    (themeId) => themeId !== restrictionTarget.themeId,
  );
  const decisionHistory = state.history.find(
    (entry) => entry.day === FIRST_BAN_DAY,
  );
  const impactHistory = state.history.find((entry) => entry.day === impactDay);
  assert.ok(runnerId);
  assert.ok(decisionHistory);
  assert.ok(impactHistory);
  setPlacements(decisionHistory, restrictionTarget.themeId, 32, runnerId);
  setPlacements(impactHistory, restrictionTarget.themeId, 0, runnerId);

  const impact = getImpactNewsRange(
    state,
    FIRST_BAN_DAY - 1,
    impactDay,
  );
  const restriction = impact.find(
    (item) => item.day === FIRST_BAN_DAY && item.kind === "restriction",
  );
  const topCut = impact.find(
    (item) => item.day === impactDay && /입상 성적이 급하강/.test(item.headline),
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

test("DAY 50 publishes a dedicated three-card reprint news chain", () => {
  const review = openReleaseReview(0x55667788, 50);
  assert.deepEqual(
    review.releaseHistory
      .filter((batch) => batch.releaseKind !== "baseline")
      .map((batch) => batch.day),
    [10, 30],
  );
  assert.ok(review.releaseSlate);
  assert.equal(getReleaseSlateKind(review.releaseSlate), "reprint");

  const published = reduceGame(review, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(review),
  });
  const release = published.releaseHistory.at(-1);
  assert.equal(release?.day, 50);
  assert.equal(release?.releaseKind, "reprint");
  assert.equal(release?.products.length, 3);

  const releaseNews = getDailyNews(published, 50).find(
    (item) => item.kind === "release",
  );
  assert.ok(releaseNews);
  assert.equal(releaseNews.headline, "재판 카드팩 3종이 발매됐습니다");
  assert.doesNotMatch(releaseNews.detail, /신규 테마/);

  const followingDay = reduceGame(published, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const aftershock = getDailyNews(followingDay, 51).filter(
    (item) => item.chainId === "release-50",
  );
  assert.ok(aftershock.length > 0);
  assert.ok(
    aftershock.some((item) => /재판|카드 접근성|구하기/.test(item.reason)),
  );
  assert.ok(
    aftershock.every((item) => !/신규 팩|새 카드|신상품/.test(item.reason)),
  );
});
