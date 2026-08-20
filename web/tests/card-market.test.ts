import assert from "node:assert/strict";
import test from "node:test";

import { COLLECTOR_CARD_PROFILES } from "../app/game/card-collectibles.ts";
import {
  getNextDayRestrictionMarketImpact,
  getThemeCardMarketQuote,
  getThemeCardMarketQuoteAtDay,
} from "../app/game/card-market.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createCampaignStart, createInitialGame } from "../app/game/engine.ts";

function createHistoricalMarketState(seed: number) {
  const state = createCampaignStart(seed);
  const baseline = state.history[0];
  state.day = 20;
  state.history = Array.from({ length: state.day }, (_, index) => ({
    ...baseline,
    day: index + 1,
    shares: { ...baseline.shares },
    ...(baseline.winRates ? { winRates: { ...baseline.winRates } } : {}),
    ...(baseline.topCutPlacements
      ? { topCutPlacements: { ...baseline.topCutPlacements } }
      : {}),
  }));
  return state;
}

test("keeps curated collector profiles attached to real authored cards", () => {
  const authoredIds = new Set(
    Object.values(THEME_BY_ID).flatMap((theme) =>
      theme.parts.map((part) => part.id),
    ),
  );
  for (const [cardId, profile] of Object.entries(COLLECTOR_CARD_PROFILES)) {
    assert.ok(authoredIds.has(cardId), `missing collector card ${cardId}`);
    assert.ok(profile.priceFloor >= 50_000);
  }
});

test("high-illustration cards retain a collector floor without play demand", () => {
  const state = createInitialGame(0x5eed1234);
  const themeId = "white-night";
  const cardId = "white-night-saint";
  state.themes[themeId].share = 0.0001;
  state.themes[themeId].partStats[cardId] = {
    usageRate: 0,
    averageCopies: 0,
  };
  state.themes[themeId].legalLimits[cardId] = 0;

  const quote = getThemeCardMarketQuote(state, themeId, cardId);
  assert.ok(quote);
  assert.equal(quote.collectorLabel, "하이 일러스트");
  assert.ok(quote.collectorDemandScore > quote.playDemandScore);
  assert.ok(quote.price >= 50_000);
});

test("replays historical quotes deterministically", () => {
  const state = createInitialGame(0xdecafbad);
  const themeId = state.activeThemeIds[0];
  const cardId = state.themes[themeId].releasedPartIds[0];
  const first = getThemeCardMarketQuoteAtDay(state, themeId, cardId, 45, 1);
  const second = getThemeCardMarketQuoteAtDay(state, themeId, cardId, 45, 1);
  assert.deepEqual(second, first);
});

test("reflects a newly announced ban in the next day's market quote", () => {
  const state = createInitialGame(0x13572468);
  const themeId = state.activeThemeIds[0];
  const cardId = state.themes[themeId].releasedPartIds[0];
  state.day = 46;
  state.themes[themeId].legalLimits[cardId] = 0;
  state.community.push({
    id: "market-ban-day-45",
    day: 45,
    category: "restriction",
    type: "restriction-applied",
    themeId,
    partId: cardId,
    value: 0,
    previousValue: 3,
    body: "테스트 금지 공표",
  });

  const announcementDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    cardId,
    45,
    1,
  );
  const followingDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    cardId,
    46,
    1,
  );

  assert.ok(announcementDay);
  assert.ok(followingDay);
  assert.equal(announcementDay.changeRate, 0);
  assert.ok(followingDay.changeRate < -50);
  assert.ok(followingDay.price < announcementDay.price);
});

test("returns the actual restriction target with the steepest one-day decline", () => {
  const state = createHistoricalMarketState(0x24681357);
  const themeId = state.activeThemeIds[0];
  const runtime = state.themes[themeId];
  const candidates = runtime.releasedPartIds
    .map((cardId) => THEME_BY_ID[themeId].parts.find((part) => part.id === cardId))
    .filter(
      (part) => part && !Object.hasOwn(COLLECTOR_CARD_PROFILES, part.id),
    );
  const banned = candidates[0];
  const limited = candidates[1];
  assert.ok(banned);
  assert.ok(limited);
  runtime.legalLimits[banned.id] = 0;
  runtime.legalLimits[limited.id] = 2;
  state.community.push(
    {
      id: "market-impact-ban",
      day: 15,
      category: "restriction",
      type: "restriction-applied",
      themeId,
      partId: banned.id,
      value: 0,
      previousValue: 3,
      body: "테스트 금지",
    },
    {
      id: "market-impact-semi",
      day: 15,
      category: "restriction",
      type: "restriction-applied",
      themeId,
      partId: limited.id,
      value: 2,
      previousValue: 3,
      body: "테스트 준제한",
    },
  );

  const impact = getNextDayRestrictionMarketImpact(state, 16);
  const bannedQuote = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    banned.id,
    16,
    1,
  );
  const limitedQuote = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    limited.id,
    16,
    1,
  );

  assert.ok(impact);
  assert.ok(bannedQuote);
  assert.ok(limitedQuote);
  assert.equal(impact.kind, "restriction-drop");
  assert.equal(impact.cardId, banned.id);
  assert.equal(impact.sourceEventId, "market-impact-ban");
  assert.ok(impact.changeRate < limitedQuote.changeRate);
  assert.deepEqual(getNextDayRestrictionMarketImpact(state, 16), impact);
});

test("gives a no-change risk survivor a deterministic, decaying relief bid", () => {
  const state = createHistoricalMarketState(0x10293847);
  const themeId = state.currentTopThemeId;
  const runtime = state.themes[themeId];
  const survivor = THEME_BY_ID[themeId].parts
    .filter((part) => runtime.releasedPartIds.includes(part.id))
    .sort(
      (left, right) =>
        right.powerWeight * right.inclusion - left.powerWeight * left.inclusion ||
        left.id.localeCompare(right.id),
    )[0];
  assert.ok(survivor);
  state.community.push({
    id: "market-impact-no-change",
    day: 15,
    category: "restriction",
    type: "restriction-no-change",
    themeId,
    partId: survivor.id,
    value: runtime.legalLimits[survivor.id] ?? 3,
    previousValue: runtime.legalLimits[survivor.id] ?? 3,
    body: "테스트 변경 없음",
  });

  const decisionDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    survivor.id,
    15,
    1,
  );
  const firstDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    survivor.id,
    16,
    1,
  );
  const secondDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    survivor.id,
    17,
    1,
  );
  const thirdDay = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    survivor.id,
    18,
    1,
  );
  const settled = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    survivor.id,
    19,
    1,
  );
  const impact = getNextDayRestrictionMarketImpact(state, 16);

  assert.ok(decisionDay);
  assert.ok(firstDay);
  assert.ok(secondDay);
  assert.ok(thirdDay);
  assert.ok(settled);
  assert.ok(impact);
  assert.equal(impact.kind, "no-change-relief");
  assert.equal(impact.cardId, survivor.id);
  assert.equal(impact.reactionLabel, "금제 회피 안도 매수");
  assert.ok(impact.changeRate > 0);
  assert.ok(impact.drivers.includes("금제 회피 안도 매수"));
  assert.ok(firstDay.price > decisionDay.price);
  assert.ok(secondDay.price < firstDay.price);
  assert.ok(thirdDay.price < secondDay.price);
  assert.ok(settled.price < thirdDay.price);
  assert.ok(!settled.drivers.includes("금제 회피 안도 매수"));
  assert.deepEqual(getNextDayRestrictionMarketImpact(state, 16), impact);
  assert.equal(getNextDayRestrictionMarketImpact(state, 17), null);
});
