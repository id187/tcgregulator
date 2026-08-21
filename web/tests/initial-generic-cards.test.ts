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

function completeHandover(state: GameState): GameState {
  let next = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(state),
  });
  next = reduceGame(next, { type: "ADVANCE_DAYS", days: 7 });
  return reduceGame(next, { type: "COMPLETE_HANDOVER" });
}

test("DAY 0 starts with exactly three live, market-visible generic cards", () => {
  const state = createCampaignStart(0x1a2b3c4d);
  const expectedIds = [...INITIAL_GENERIC_CARD_IDS].sort();
  const baseline = state.releaseHistory[0];

  assert.equal(state.day, 0);
  assert.equal(state.nextReleaseOptionId, 1);
  assert.equal(state.releaseHistory.length, 1);
  assert.ok(isInitialGenericReleaseBatch(baseline));
  assert.deepEqual(Object.keys(state.genericLimits).sort(), expectedIds);
  assert.ok(
    INITIAL_GENERIC_CARD_IDS.every((cardId) => state.genericLimits[cardId] === 3),
  );

  const meta = getCurrentGenericMetaModel(state);
  assert.deepEqual(meta.cards.map((entry) => entry.cardId).sort(), expectedIds);
  assert.ok(meta.cards.every((entry) => entry.releaseDay === 0));
  for (const entry of meta.cards) {
    const quote = getGenericCardMarketQuote(
      state,
      entry.card,
      entry.releaseDay,
      entry,
    );
    assert.equal(quote.asOfDay, 0);
    assert.equal(quote.comparisonDay, 0);
    assert.ok(quote.price > 0);
  }

  const pool = getCurrentRestrictionCardPoolIds(state);
  assert.ok(INITIAL_GENERIC_CARD_IDS.every((cardId) => pool.includes(cardId)));
});

test("DAY 0 generics survive save/load and remain visible on DAY 10", () => {
  const restored = roundTrip(createCampaignStart(0x55667788));
  const handedOver = completeHandover(restored);
  const day9 = reduceGame(handedOver, { type: "ADVANCE_DAYS", days: 3 });
  const day10 = reduceGame(day9, { type: "ADVANCE_DAYS", days: 1 });

  assert.equal(day10.day, 10);
  assert.equal(day10.phase, "release-edit");
  assert.deepEqual(
    getCurrentGenericMetaModel(day10).cards.map((entry) => entry.cardId).sort(),
    [...INITIAL_GENERIC_CARD_IDS].sort(),
  );
  assert.ok(isInitialGenericReleaseBatch(day10.releaseHistory[0]));
});

test("the DAY 10 slate never reoffers baseline cards or consumes Vol.1 ids", () => {
  let state = completeHandover(createCampaignStart(0x31415926));
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: 3,
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });

  assert.equal(state.day, 10);
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

test("schema rejects forged or missing DAY 0 baselines", () => {
  const source = createCampaignStart(0x0badc0de);

  const missingLimit = structuredClone(source);
  delete missingLimit.genericLimits[INITIAL_GENERIC_CARD_IDS[0]];
  assert.throws(() => roundTrip(missingLimit), SaveSchemaError);

  const wrongBaseline = structuredClone(source);
  const firstProduct = wrongBaseline.releaseHistory[0].products[0];
  if (firstProduct.kind !== "generic") throw new Error("invalid baseline fixture");
  firstProduct.genericCardId = "generic-rush-enabler";
  assert.throws(() => roundTrip(wrongBaseline), SaveSchemaError);

  const missingBaseline = structuredClone(source);
  missingBaseline.releaseHistory = [];
  assert.throws(() => roundTrip(missingBaseline), SaveSchemaError);
});
