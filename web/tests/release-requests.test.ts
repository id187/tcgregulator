import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { getCollectorCardProfile } from "../app/game/card-collectibles.ts";
import { getThemeCardMarketQuote } from "../app/game/card-market.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import {
  createCampaignStart,
  getPrologueRestrictionChanges,
  reduceGame,
} from "../app/game/engine.ts";
import { getKeywordMatchupEdgeScore } from "../app/game/play-keywords.ts";
import {
  getEnvironmentTargetGenericPool,
  getIndirectSupportGenericPool,
  getPendingReleaseRequest,
  getReprintCandidates,
  getReprintImpactPreview,
} from "../app/game/release-requests.ts";
import { parseGameState, SaveSchemaError } from "../app/game/save-schema.ts";
import type { GameState } from "../app/game/types.ts";

function reachFirstRelease(state: GameState): GameState {
  let next = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(next.day, 15);
  assert.equal(next.phase, "ban-edit");
  next = reduceGame(next, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(next),
  });
  next = reduceGame(next, { type: "ADVANCE_DAYS", days: 15 });
  assert.equal(next.day, 30);
  assert.equal(next.phase, "release-edit");
  assert.ok(next.releaseSlate);
  return next;
}

function jsonRoundTrip(state: GameState): GameState {
  return parseGameState(JSON.parse(JSON.stringify(state)) as unknown);
}

test("request lanes replace and cancel independently", () => {
  let state = createCampaignStart(81_001);
  const themes = state.activeThemeIds;
  const reprintCard = state.themes[themes[0]].releasedPartIds[0];

  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "support", themeId: themes[0], direction: "recovery" },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "indirect-support", themeId: themes[0] },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId: reprintCard },
  });

  assert.equal(getPendingReleaseRequest(state, "support")?.kind, "support");
  assert.equal(
    getPendingReleaseRequest(state, "generic")?.kind,
    "indirect-support",
  );
  assert.equal(getPendingReleaseRequest(state, "reprint")?.kind, "reprint");

  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "environment-target", themeId: themes[1] },
  });
  assert.equal(state.supportRequests[1].status, "replaced");
  assert.equal(
    getPendingReleaseRequest(state, "generic")?.kind,
    "environment-target",
  );
  assert.equal(getPendingReleaseRequest(state, "support")?.status, "queued");
  assert.equal(getPendingReleaseRequest(state, "reprint")?.status, "queued");

  state = reduceGame(state, {
    type: "CANCEL_RELEASE_REQUEST",
    lane: "support",
  });
  assert.equal(getPendingReleaseRequest(state, "support"), null);
  assert.equal(state.supportRequests[0].status, "cancelled");
  assert.equal(getPendingReleaseRequest(state, "generic")?.status, "queued");
  assert.throws(
    () =>
      reduceGame(state, {
        type: "SET_RELEASE_REQUEST",
        request: { kind: "reprint", cardId: "not-released" },
      }),
    /currently released card/,
  );
  jsonRoundTrip(state);
});

test("indirect and environment requests derive deterministic generic pools", () => {
  const state = createCampaignStart(81_002);
  const themeId = state.activeThemeIds[0];
  const keywords = THEME_BY_ID[themeId].playKeywords;
  const indirect = getIndirectSupportGenericPool(state, themeId);
  const counters = getEnvironmentTargetGenericPool(state, themeId);

  assert.ok(indirect.length > 0);
  assert.ok(indirect.every((card) => keywords.includes(card.keyword)));
  assert.deepEqual(
    getIndirectSupportGenericPool(state, themeId).map((card) => card.id),
    indirect.map((card) => card.id),
  );
  assert.ok(counters.length > 0);
  assert.ok(
    counters.every(
      (card) => getKeywordMatchupEdgeScore([card.keyword], keywords) > 0,
    ),
  );
  assert.deepEqual(
    getEnvironmentTargetGenericPool(state, themeId).map((card) => card.id),
    counters.map((card) => card.id),
  );

  const targeted = reachFirstRelease(reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "environment-target", themeId },
  }));
  const requestedOption = targeted.releaseSlate!.options.find(
    (option) => option.kind === "generic" && option.requested,
  );
  assert.ok(requestedOption && requestedOption.kind === "generic");
  assert.equal(requestedOption.requestKind, "environment-target");
  assert.ok(
    getKeywordMatchupEdgeScore(
      [requestedOption.requestKeyword!],
      keywords,
    ) > 0,
  );
});

test("save parsing rejects a reprint request for a known but unreleased card", () => {
  let state = createCampaignStart(81_006);
  const themeId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: {
      kind: "reprint",
      cardId: state.themes[themeId].releasedPartIds[0],
    },
  });
  const forged = structuredClone(state);
  forged.supportRequests[0].cardId = THEME_BY_ID[themeId].parts.at(-1)!.id;
  assert.throws(
    () => parseGameState(forged),
    /currently released card/,
  );
});

test("locked reprint adds the fourth product while the player submits three core picks", () => {
  let state = createCampaignStart(81_003);
  const themeId = state.activeThemeIds[0];
  const reprintCard = state.themes[themeId].releasedPartIds[0];
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "support", themeId, direction: "consistency" },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "indirect-support", themeId },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId: reprintCard },
  });
  state = reachFirstRelease(state);

  assert.equal(state.releaseSlate!.options.length, 10);
  const locked = state.releaseSlate!.options.find(
    (option) => option.kind === "reprint",
  );
  assert.ok(locked && locked.kind === "reprint" && locked.locked);
  assert.equal(locked.requested, true);
  const requestedGeneric = state.releaseSlate!.options.find(
    (option) => option.kind === "generic" && option.requested,
  );
  assert.ok(requestedGeneric && requestedGeneric.kind === "generic");
  assert.ok(
    THEME_BY_ID[themeId].playKeywords.includes(requestedGeneric.requestKeyword!),
  );

  const selections = getAutomaticReleaseSelections(state);
  assert.equal(selections.length, 3);
  assert.deepEqual(
    selections
      .map((selection) =>
        state.releaseSlate!.options.find(
          (option) => option.id === selection.optionId,
        )!.kind,
      )
      .sort(),
    ["generic", "new-theme", "support"],
  );
  assert.ok(selections.every((selection) => selection.optionId !== locked.id));
  const lockedNewThemes = state.releaseSlate!.options.filter(
    (option) => option.kind === "new-theme",
  );
  const lockedGeneric = state.releaseSlate!.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(lockedNewThemes.length >= 2 && lockedGeneric);
  assert.throws(
    () =>
      reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: [
          ...lockedNewThemes.slice(0, 2),
          lockedGeneric,
        ].map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      }),
    /at least one new theme, support, and generic card/,
  );
  assert.throws(
    () =>
      reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: [...selections, { optionId: locked.id, powerAdjustment: 0 }],
      }),
    /Exactly 3 release options|included automatically/,
  );

  const released = reduceGame(state, { type: "SUBMIT_RELEASE", selections });
  assert.deepEqual(
    released.releaseHistory.at(-1)!.products.map((product) => product.kind).sort(),
    ["generic", "new-theme", "reprint", "support"],
  );
  assert.equal(released.releaseHistory.at(-1)!.products.length, 4);
  assert.ok(
    released.supportRequests.every((request) => request.status === "released"),
  );
  jsonRoundTrip(released);

  const forged = structuredClone(state);
  const forgedLocked = forged.releaseSlate!.options.find(
    (option) => option.kind === "reprint",
  );
  assert.ok(forgedLocked && forgedLocked.kind === "reprint");
  forgedLocked.requestId = "missing-request";
  assert.throws(() => parseGameState(forged), SaveSchemaError);
});

test("reprints raise release-day sales then cause deterministic D+1 price and trust shocks", () => {
  let state = createCampaignStart(81_004);
  const candidate = getReprintCandidates(state).find(
    (entry) => entry.cardKind === "theme-part" && entry.collectorLabel === null,
  );
  assert.ok(candidate?.themeId);
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId: candidate.cardId },
  });
  state = reachFirstRelease(state);
  const beforeQuote = getThemeCardMarketQuote(
    state,
    candidate.themeId,
    candidate.cardId,
    1,
  );
  assert.ok(beforeQuote);
  const priorRevenue = state.finance.today;
  const released = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(state),
  });
  const reprint = released.releaseHistory.at(-1)!.products.find(
    (product) => product.kind === "reprint",
  );
  assert.ok(reprint && reprint.kind === "reprint");
  assert.ok(reprint.releaseRevenueBoost > 0);
  assert.ok(released.finance.today > priorRevenue);
  const repeatedPreview = getReprintImpactPreview(released, candidate.cardId);
  assert.ok(repeatedPreview);
  assert.ok(repeatedPreview.trustDelta < reprint.trustDelta);

  const nextDay = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  const afterQuote = getThemeCardMarketQuote(
    nextDay,
    candidate.themeId,
    candidate.cardId,
    1,
  );
  assert.ok(afterQuote);
  assert.ok(afterQuote.price < beforeQuote.price);
  assert.ok(nextDay.purchaseTrust < released.purchaseTrust);
  assert.ok(reprint.accessibilityUserGain > 0);
  assert.ok(reprint.collectorUserLoss >= 0);
  jsonRoundTrip(nextDay);
});

test("high-illustration reprints keep their authored collector floor", () => {
  const cardId = "white-night-saint";
  const profile = getCollectorCardProfile(cardId);
  assert.ok(profile);
  let state = createCampaignStart(81_005);
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId },
  });
  state = reachFirstRelease(state);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(state),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const quote = getThemeCardMarketQuote(state, "white-night", cardId, 1);
  assert.ok(quote);
  assert.ok(quote.price >= profile.priceFloor * 0.86);
});
