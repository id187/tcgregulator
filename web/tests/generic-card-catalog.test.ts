import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERIC_CARD_BY_ID,
  GENERIC_CARD_CATALOG,
  GENERIC_CARD_ROLE_IDS,
  GENERIC_CARD_STAT_RANGES,
  GENERIC_CARDS_BY_KEYWORD,
  getGenericCard,
  getGenericCardByKeywordAndRole,
  getGenericCardsByKeyword,
} from "../app/game/generic-card-catalog.ts";
import { PLAY_KEYWORD_IDS } from "../app/game/play-keywords.ts";

test("generic catalog contains six distinct roles for every play keyword", () => {
  assert.equal(PLAY_KEYWORD_IDS.length, 24);
  assert.equal(GENERIC_CARD_ROLE_IDS.length, 6);
  assert.equal(
    GENERIC_CARD_CATALOG.length,
    PLAY_KEYWORD_IDS.length * GENERIC_CARD_ROLE_IDS.length,
  );

  for (const keyword of PLAY_KEYWORD_IDS) {
    const cards = getGenericCardsByKeyword(keyword);
    assert.equal(cards.length, GENERIC_CARD_ROLE_IDS.length, keyword);
    assert.deepEqual(
      cards.map((card) => card.role),
      GENERIC_CARD_ROLE_IDS,
      `${keyword} must preserve the authored role order`,
    );
    assert.ok(cards.every((card) => card.keyword === keyword));
  }
});

test("generic card ids, names, and public descriptions are unique and display-safe", () => {
  assert.equal(
    new Set(GENERIC_CARD_CATALOG.map((card) => card.id)).size,
    GENERIC_CARD_CATALOG.length,
    "card ids must be unique",
  );
  assert.equal(
    new Set(GENERIC_CARD_CATALOG.map((card) => card.name)).size,
    GENERIC_CARD_CATALOG.length,
    "authored card names must be unique",
  );
  assert.equal(
    new Set(GENERIC_CARD_CATALOG.map((card) => card.description)).size,
    GENERIC_CARD_CATALOG.length,
    "each card should have recognizable copy",
  );

  for (const card of GENERIC_CARD_CATALOG) {
    assert.equal(card.id, `generic-${card.keyword}-${card.role}`);
    assert.match(card.name, /[가-힣]/, `${card.id}/name`);
    assert.ok(card.description.length >= 20, `${card.id}/description`);
    assert.doesNotMatch(
      card.description,
      /유리|불리|상성|카운터|우위|열세|잘 잡|약점/,
      `${card.id}/public copy must not expose an advantage chart`,
    );
  }
});

test("generic card engine values remain integral and inside their contracts", () => {
  const numericFields = [
    "basePower",
    "unpleasantness",
    "appeal",
    "optimizationDays",
  ] as const;

  for (const card of GENERIC_CARD_CATALOG) {
    for (const field of numericFields) {
      assert.ok(Number.isInteger(card[field]), `${card.id}/${field}`);
      const range = GENERIC_CARD_STAT_RANGES[field];
      assert.ok(card[field] >= range.min, `${card.id}/${field}/minimum`);
      assert.ok(card[field] <= range.max, `${card.id}/${field}/maximum`);
    }
  }

  assert.ok(
    new Set(GENERIC_CARD_CATALOG.map((card) => card.basePower)).size >= 12,
    "the catalog should expose meaningful power variation",
  );
  assert.ok(
    new Set(GENERIC_CARD_CATALOG.map((card) => card.unpleasantness)).size >= 18,
    "the catalog should expose meaningful friction variation",
  );
});

test("generic card lookup APIs return stable frozen catalog entries", () => {
  assert.ok(Object.isFrozen(GENERIC_CARD_ROLE_IDS));
  assert.ok(Object.isFrozen(GENERIC_CARD_STAT_RANGES));
  assert.ok(Object.isFrozen(GENERIC_CARD_CATALOG));
  assert.ok(Object.isFrozen(GENERIC_CARD_BY_ID));
  assert.ok(Object.isFrozen(GENERIC_CARDS_BY_KEYWORD));

  for (const card of GENERIC_CARD_CATALOG) {
    assert.ok(Object.isFrozen(card), card.id);
    assert.strictEqual(getGenericCard(card.id), card);
    assert.strictEqual(
      getGenericCardByKeywordAndRole(card.keyword, card.role),
      card,
    );
  }

  for (const keyword of PLAY_KEYWORD_IDS) {
    assert.ok(Object.isFrozen(GENERIC_CARDS_BY_KEYWORD[keyword]), keyword);
    assert.strictEqual(
      getGenericCardsByKeyword(keyword),
      GENERIC_CARDS_BY_KEYWORD[keyword],
    );
  }

  assert.equal(getGenericCard("generic-missing-enabler"), undefined);
});
