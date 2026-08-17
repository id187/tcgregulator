import assert from "node:assert/strict";
import test from "node:test";

import { THEME_BY_ID } from "../app/game/content.ts";
import { getBusinessEventChoice } from "../app/game/business-events.ts";
import {
  getDailyCommunitySentiment,
  scoreCommunityPostSentiment,
} from "../app/game/community-sentiment.ts";
import {
  createFirstBanGame,
  createInitialGame,
  getPrologueRestrictionChanges,
  reduceGame,
} from "../app/game/engine.ts";
import type {
  CommunityEvent,
  GameState,
  RestrictionLimit,
} from "../app/game/types.ts";

function fixturePost(body: string): Pick<
  CommunityEvent,
  "body" | "type" | "category"
> {
  return {
    body,
    type: "restriction-demand",
    category: "restriction",
  };
}

function finishFirstRestriction(
  state: GameState,
  changes: Readonly<Record<string, RestrictionLimit>>,
  campaignSeed = 0x5151,
): GameState {
  let next = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes,
    campaignSeed,
  });
  next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1 });
  return reduceGame(next, { type: "COMPLETE_HANDOVER" });
}

function lowerOnlyState(seed = 1000): GameState {
  const atReview = createFirstBanGame(seed);
  const ranked = [...atReview.activeThemeIds].sort(
    (left, right) =>
      atReview.themes[right].share - atReview.themes[left].share ||
      left.localeCompare(right),
  );
  const lowerThemeId = ranked.at(-1)!;
  const part = THEME_BY_ID[lowerThemeId].parts.find(
    (candidate) =>
      atReview.themes[lowerThemeId].releasedPartIds.includes(candidate.id) &&
      candidate.preferredCopies >= 2,
  );
  assert.ok(part);
  const limit = (part.preferredCopies >= 3 ? 2 : 1) as RestrictionLimit;
  return finishFirstRestriction(atReview, { [part.id]: limit }, 0x1000);
}

function balancedState(seed = 1000): GameState {
  const atReview = createFirstBanGame(seed);
  return finishFirstRestriction(
    atReview,
    getPrologueRestrictionChanges(atReview),
    0x2000,
  );
}

function advanceToDay(state: GameState, targetDay: number): GameState {
  let next = state;
  while (next.day < targetDay) {
    const pending = next.operations.pendingEvent;
    if (pending) {
      const choice = (["a", "b"] as const)
        .map((id) => getBusinessEventChoice(pending.type, id))
        .sort((left, right) => left.cost - right.cost)[0].id;
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice,
      });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  return next;
}

function advanceFullCampaignToDay(state: GameState, targetDay: number): GameState {
  let next = state;
  while (next.day < targetDay) {
    const pending = next.operations.pendingEvent;
    if (pending) {
      const choice = (["a", "b"] as const)
        .map((id) => getBusinessEventChoice(pending.type, id))
        .sort((left, right) => left.cost - right.cost)[0].id;
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice,
      });
    } else if (next.phase === "release-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: next.releaseSlate!.options.slice(0, 3).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1 });
    }
  }
  return next;
}

function noChangeState(
  health: "healthy" | "unhealthy",
  seed = 1000,
): GameState {
  const atReview = createFirstBanGame(seed);
  if (health === "healthy") {
    const share = 1 / atReview.activeThemeIds.length;
    for (const themeId of atReview.activeThemeIds) {
      atReview.themes[themeId].share = share;
      atReview.themes[themeId].previousWeekShare = share;
    }
    atReview.currentTopThemeId = atReview.activeThemeIds[0];
    atReview.purchaseTrust = 82;
  } else {
    const [topThemeId, ...others] = atReview.activeThemeIds;
    atReview.themes[topThemeId].share = 0.55;
    atReview.themes[topThemeId].previousWeekShare = 0.55;
    for (const themeId of others) {
      atReview.themes[themeId].share = 0.45 / others.length;
      atReview.themes[themeId].previousWeekShare = 0.45 / others.length;
    }
    atReview.currentTopThemeId = topThemeId;
    atReview.themes[topThemeId].unpleasantness = 90;
    atReview.themes[topThemeId].fatigue = 90;
    atReview.themes[topThemeId].topStreakDays = 100;
    atReview.purchaseTrust = 25;
  }
  return finishFirstRestriction(atReview, {}, health === "healthy" ? 0x3000 : 0x4000);
}

test("weighted Korean phrases keep positive, neutral, and negated copy aligned", () => {
  const positive = scoreCommunityPostSentiment(
    fixturePost("상위권 두 구간을 함께 눌렀고 균형이 잘 잡혔다. 방향이 좋고 납득함"),
  );
  const neutral = scoreCommunityPostSentiment(
    fixturePost("DAY 46 점유율 수치를 비교하고 다음 대회까지 관찰할 예정"),
  );
  const negative = scoreCommunityPostSentiment(
    fixturePost("상위 1티어는 그대로 두고 하위권 파츠는 잘라 놓은 기준은 납득이 안 됨"),
  );

  assert.equal(positive.polarity, "positive");
  assert.ok(positive.score >= 50);
  assert.equal(neutral.polarity, "neutral");
  assert.ok(Math.abs(neutral.score) < 15);
  assert.equal(negative.polarity, "negative");
  assert.ok(negative.score <= -50);
  assert.ok(positive.score > neutral.score && neutral.score > negative.score);
});

test("collapses the actual twenty posts into bounded deterministic totals", () => {
  const state = createFirstBanGame(1000);
  const untouched = structuredClone(state);
  for (const day of [1, 15, 30, 45]) {
    const first = getDailyCommunitySentiment(state, day);
    const second = getDailyCommunitySentiment(state, day);
    assert.deepEqual(first, second);
    assert.equal(first.positive + first.neutral + first.negative, 20);
    assert.ok(first.score >= -100 && first.score <= 100);
    assert.ok(first.index >= 0 && first.index <= 100);
    assert.equal(first.score, first.index * 2 - 100);
    assert.ok(first.label.length > 0);
  }
  assert.deepEqual(state, untouched, "sentiment reads must not mutate the game");
});

test("lower-only and upper-ignored D+1 boards are strongly negative", () => {
  const lower = getDailyCommunitySentiment(lowerOnlyState(), 46);
  const balanced = getDailyCommunitySentiment(balancedState(), 46);

  assert.ok(lower.score <= -30, JSON.stringify(lower));
  assert.ok(lower.negative >= 10, JSON.stringify(lower));
  assert.ok(lower.negative > lower.positive);
  assert.match(lower.label, /부정적/);
  assert.ok(
    balanced.score >= lower.score + 25,
    `${JSON.stringify({ lower, balanced })}`,
  );
  assert.ok(balanced.positive > lower.positive);
});

test("healthy no-change is positive while unhealthy no-change is negative", () => {
  const healthy = getDailyCommunitySentiment(noChangeState("healthy"), 46);
  const unhealthy = getDailyCommunitySentiment(noChangeState("unhealthy"), 46);

  assert.ok(healthy.score >= 20, JSON.stringify(healthy));
  assert.ok(healthy.positive > healthy.negative);
  assert.match(healthy.label, /긍정적/);
  assert.ok(unhealthy.score <= -25, JSON.stringify(unhealthy));
  assert.ok(unhealthy.negative > unhealthy.positive);
  assert.match(unhealthy.label, /부정적/);
  assert.ok(healthy.score >= unhealthy.score + 45);
});

test("historical sentiment is stable after current runtime mutation", () => {
  const state = advanceToDay(balancedState(1004), 55);
  const baseline = getDailyCommunitySentiment(state, 46);
  const later = structuredClone(state);

  for (const themeId of later.activeThemeIds) {
    later.themes[themeId].share = 1 / later.activeThemeIds.length;
    later.themes[themeId].fatigue = 100;
    later.themes[themeId].counterProgress = 0;
    later.themes[themeId].counterAdoption = 0;
    for (const partId of later.themes[themeId].releasedPartIds) {
      later.themes[themeId].partStats[partId] = {
        usageRate: 0.01,
        averageCopies: 0.01,
      };
      later.themes[themeId].legalLimits[partId] = 0;
    }
  }
  later.currentTopThemeId = later.activeThemeIds[0];
  later.purchaseTrust = 0;

  assert.deepEqual(getDailyCommunitySentiment(later, 46), baseline);
});

test("engine history freezes each daily sentiment instead of rebuilding ninety boards", () => {
  const state = lowerOnlyState(1007);
  const day46 = state.history.find((entry) => entry.day === 46);
  assert.ok(day46);
  const live = getDailyCommunitySentiment(state, 46);
  assert.equal(day46.communitySentiment, live.index);
  assert.equal(day46.communityPositive, live.positive);
  assert.equal(day46.communityNegative, live.negative);

  const advanced = advanceToDay(state, 55);
  const frozen = advanced.history.find((entry) => entry.day === 46);
  assert.ok(frozen);
  assert.deepEqual(
    {
      index: frozen.communitySentiment,
      positive: frozen.communityPositive,
      negative: frozen.communityNegative,
    },
    {
      index: day46.communitySentiment,
      positive: day46.communityPositive,
      negative: day46.communityNegative,
    },
  );
});

test("the stored daily gauge matches the board after today's history row settles", () => {
  const state = advanceFullCampaignToDay(createInitialGame(42), 404);
  const stored = state.history.at(-1);
  assert.ok(stored);
  assert.equal(stored.day, 404);
  const live = getDailyCommunitySentiment(state, 404);

  assert.deepEqual(
    {
      index: stored.communitySentiment,
      positive: stored.communityPositive,
      negative: stored.communityNegative,
    },
    {
      index: live.index,
      positive: live.positive,
      negative: live.negative,
    },
  );
});
