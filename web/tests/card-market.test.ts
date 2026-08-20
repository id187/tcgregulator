import assert from "node:assert/strict";
import test from "node:test";

import { COLLECTOR_CARD_PROFILES } from "../app/game/card-collectibles.ts";
import {
  getThemeCardMarketQuote,
  getThemeCardMarketQuoteAtDay,
} from "../app/game/card-market.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame } from "../app/game/engine.ts";

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
