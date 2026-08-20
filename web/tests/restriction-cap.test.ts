import assert from "node:assert/strict";
import test from "node:test";

import {
  createFirstBanGame,
  reduceGame,
} from "../app/game/engine.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionPolicyProfile,
} from "../app/game/restriction-policy.ts";
import {
  getCurrentRestrictionCardPoolIds,
  getMaximumRestrictedCards,
  getRestrictionCapacity,
} from "../app/game/restriction-cap.ts";
import type { GameState, RestrictionLimit } from "../app/game/types.ts";

function makeChanges(ids: readonly string[]): Record<string, RestrictionLimit> {
  return Object.fromEntries(ids.map((id) => [id, 2])) as Record<
    string,
    RestrictionLimit
  >;
}

function setCurrentLimit(
  state: GameState,
  cardId: string,
  limit: RestrictionLimit,
): void {
  if (Object.prototype.hasOwnProperty.call(state.genericLimits, cardId)) {
    const limits = state.genericLimits as Record<
      string,
      RestrictionLimit | undefined
    >;
    limits[cardId] = limit;
    return;
  }
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (!runtime.releasedPartIds.includes(cardId)) continue;
    runtime.legalLimits[cardId] = limit;
    return;
  }
  throw new Error(`Unknown released test card: ${cardId}`);
}

test("a restriction review accepts exactly half the pool and rejects a final restricted count of half plus one", () => {
  const state = createFirstBanGame(81_001);
  const pool = getCurrentRestrictionCardPoolIds(state);
  const cap = getMaximumRestrictedCards(state);

  assert.equal(cap, Math.floor(pool.length / 2));
  const exactChanges = makeChanges(pool.slice(0, cap));
  const exactCapacity = getRestrictionCapacity(state, exactChanges);
  assert.equal(exactCapacity.poolSize, pool.length);
  assert.equal(exactCapacity.maximumRestrictedCards, cap);
  assert.deepEqual(exactCapacity.projectedRestrictedCardIds, pool.slice(0, cap));
  assert.equal(exactCapacity.projectedRestrictedCount, cap);
  assert.equal(exactCapacity.remainingCapacity, 0);
  assert.equal(exactCapacity.withinLimit, true);
  assert.doesNotThrow(() =>
    reduceGame(state, { type: "SUBMIT_BAN", changes: exactChanges })
  );

  const tooMany = makeChanges(pool.slice(0, cap + 1));
  const overCapacity = getRestrictionCapacity(state, tooMany);
  assert.equal(overCapacity.projectedRestrictedCount, cap + 1);
  assert.equal(overCapacity.overLimitBy, 1);
  assert.equal(overCapacity.withinLimit, false);
  assert.throws(
    () => reduceGame(state, { type: "SUBMIT_BAN", changes: tooMany }),
    /50%.*current card pool.*restrict/i,
  );
});

test("loosening cards restores capacity and a large replacement list is allowed", () => {
  const state = createFirstBanGame(81_004);
  const pool = getCurrentRestrictionCardPoolIds(state);
  const cap = getMaximumRestrictedCards(state);
  const currentlyRestricted = pool.slice(0, cap);
  const replacements = pool.slice(cap, cap * 2);
  for (const cardId of currentlyRestricted) setCurrentLimit(state, cardId, 2);

  const full = getRestrictionCapacity(state, {});
  assert.equal(full.currentRestrictedCount, cap);
  assert.equal(full.projectedRestrictedCount, cap);
  assert.equal(full.remainingCapacity, 0);

  const loosenOne = getRestrictionCapacity(state, {
    [currentlyRestricted[0]]: 3,
  });
  assert.equal(loosenOne.projectedRestrictedCount, cap - 1);
  assert.equal(loosenOne.remainingCapacity, 1);

  const replaceEveryRestriction = {
    ...Object.fromEntries(currentlyRestricted.map((cardId) => [cardId, 3])),
    ...Object.fromEntries(replacements.map((cardId) => [cardId, 2])),
  } as Record<string, RestrictionLimit>;
  const replacementCapacity = getRestrictionCapacity(
    state,
    replaceEveryRestriction,
  );
  assert.ok(replacementCapacity.changeCount > cap);
  assert.equal(replacementCapacity.projectedRestrictedCount, cap);
  assert.equal(replacementCapacity.withinLimit, true);
  assert.doesNotThrow(() =>
    reduceGame(state, {
      type: "SUBMIT_BAN",
      changes: replaceEveryRestriction,
    })
  );
});

test("the cap pool excludes unreleased parts and includes every active generic limit", () => {
  const state = createFirstBanGame(81_002);
  const pool = new Set(getCurrentRestrictionCardPoolIds(state));
  const genericIds = Object.keys(state.genericLimits);

  assert.ok(genericIds.length > 0, "the DAY 30 release should expose a generic card");
  for (const genericId of genericIds) {
    assert.ok(pool.has(genericId));
    const capacity = getRestrictionCapacity(state, {
      [genericId]: 2,
    });
    assert.ok(capacity.projectedRestrictedCardIds.includes(genericId));
  }

  const unreleasedId = state.activeThemeIds
    .flatMap((themeId) => THEME_BY_ID[themeId].parts)
    .map((part) => part.id)
    .find(
      (partId) =>
        !state.activeThemeIds.some((themeId) =>
          state.themes[themeId].releasedPartIds.includes(partId),
        ),
  );
  assert.ok(unreleasedId, "the opening pool should have an unreleased support card");
  assert.equal(pool.has(unreleasedId), false);
  const unreleasedProjection = getRestrictionCapacity(state, {
    [unreleasedId]: 2,
  });
  assert.equal(unreleasedProjection.projectedRestrictedCount, 0);
  assert.equal(unreleasedProjection.changeCount, 0);
});

test("generic-card changes participate in draft and published restriction profiles", () => {
  const state = createFirstBanGame(81_003);
  const genericId = Object.keys(state.genericLimits)[0];
  assert.ok(genericId);
  const changes = { [genericId]: 0 } as Record<string, RestrictionLimit>;

  const draft = getRestrictionPolicyProfile(state, changes);
  assert.equal(draft.changeCount, 1);
  assert.equal(draft.directionMix.tighten, 1);
  assert.equal(draft.sharedChanges, 1);
  assert.ok(draft.totalImpact > 0);

  const submitted = reduceGame(state, { type: "SUBMIT_BAN", changes });
  const published = getPublishedRestrictionPolicyProfile(submitted, state.day);
  assert.equal(published.changeCount, 1);
  assert.equal(published.directionMix.tighten, 1);
  assert.equal(published.sharedChanges, 1);
});
