import assert from "node:assert/strict";
import test from "node:test";

import { getGenericCardMarketQuote } from "../app/game/card-market.ts";
import {
  createCampaignStart,
  getPrologueRestrictionChanges,
  getCurrentGenericMetaModel,
  reduceGame,
} from "../app/game/engine.ts";
import {
  INITIAL_GENERIC_CARD_IDS,
  isInitialGenericReleaseBatch,
} from "../app/game/initial-generic-cards.ts";
import { getCurrentRestrictionCardPoolIds } from "../app/game/restriction-cap.ts";
import {
  SaveSchemaError,
  parseGameState,
} from "../app/game/save-schema.ts";
import type { GameState } from "../app/game/types.ts";

function roundTrip(state: GameState): GameState {
  return parseGameState(JSON.parse(JSON.stringify(state)) as unknown);
}

test("DAY 1 starts with exactly three live, market-visible generic cards", () => {
  const state = createCampaignStart(0x1a2b3c4d);
  const expectedIds = [...INITIAL_GENERIC_CARD_IDS].sort();
  const baseline = state.releaseHistory[0];

  assert.equal(state.day, 1);
  assert.equal(state.nextReleaseOptionId, 1);
  assert.equal(state.releaseHistory.length, 1);
  assert.ok(isInitialGenericReleaseBatch(baseline));
  assert.deepEqual(Object.keys(state.genericLimits).sort(), expectedIds);
  assert.ok(
    INITIAL_GENERIC_CARD_IDS.every((cardId) => state.genericLimits[cardId] === 3),
  );

  const meta = getCurrentGenericMetaModel(state);
  assert.deepEqual(meta.cards.map((entry) => entry.cardId).sort(), expectedIds);
  assert.ok(meta.cards.every((entry) => entry.releaseDay === 1));
  for (const entry of meta.cards) {
    const quote = getGenericCardMarketQuote(
      state,
      entry.card,
      entry.releaseDay,
      entry,
    );
    assert.equal(quote.asOfDay, 1);
    assert.equal(quote.comparisonDay, 1);
    assert.ok(quote.price > 0);
  }

  const pool = getCurrentRestrictionCardPoolIds(state);
  assert.ok(INITIAL_GENERIC_CARD_IDS.every((cardId) => pool.includes(cardId)));
});

test("DAY 1 generics survive save/load and remain visible on DAY 15", () => {
  const restored = roundTrip(createCampaignStart(0x55667788));
  const day15 = reduceGame(restored, { type: "ADVANCE_DAYS", days: 14 });

  assert.equal(day15.day, 15);
  assert.deepEqual(
    getCurrentGenericMetaModel(day15).cards.map((entry) => entry.cardId).sort(),
    [...INITIAL_GENERIC_CARD_IDS].sort(),
  );
  assert.ok(isInitialGenericReleaseBatch(day15.releaseHistory[0]));
});

test("the DAY 30 slate never reoffers baseline cards or consumes Vol.1 ids", () => {
  let state = reduceGame(createCampaignStart(0x31415926), {
    type: "ADVANCE_DAYS",
    days: 14,
  });
  assert.equal(state.day, 15);
  assert.equal(state.phase, "ban-edit");
  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(state),
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: 15,
  });

  assert.equal(state.day, 30);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.deepEqual(
    state.releaseSlate.options
      .map((option) => Number(option.id.replace("release-option-", "")))
      .sort((left, right) => left - right),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(state.nextReleaseOptionId, 10);
  const offeredGenericIds = state.releaseSlate.options.flatMap((option) =>
    option.kind === "generic" ? [option.genericCardId] : []
  );
  assert.equal(offeredGenericIds.length, 3);
  assert.ok(
    INITIAL_GENERIC_CARD_IDS.every(
      (cardId) => !offeredGenericIds.includes(cardId),
    ),
  );
});

test("schema rejects forged baselines but keeps old schema-v8 saves compatible", () => {
  const source = createCampaignStart(0x0badc0de);

  const missingLimit = structuredClone(source);
  delete missingLimit.genericLimits[INITIAL_GENERIC_CARD_IDS[0]];
  assert.throws(() => roundTrip(missingLimit), SaveSchemaError);

  const wrongBaseline = structuredClone(source);
  const firstProduct = wrongBaseline.releaseHistory[0].products[0];
  if (firstProduct.kind !== "generic") throw new Error("invalid baseline fixture");
  firstProduct.genericCardId = "generic-rush-enabler";
  assert.throws(() => roundTrip(wrongBaseline), SaveSchemaError);

  const legacyV8 = structuredClone(source);
  legacyV8.releaseHistory = [];
  legacyV8.genericLimits = {};
  const restoredLegacy = roundTrip(legacyV8);
  assert.equal(restoredLegacy.releaseHistory.length, 1);
  assert.ok(isInitialGenericReleaseBatch(restoredLegacy.releaseHistory[0]));
  assert.deepEqual(
    Object.keys(restoredLegacy.genericLimits).sort(),
    [...INITIAL_GENERIC_CARD_IDS].sort(),
  );
});
