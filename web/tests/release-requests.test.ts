import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { BUSINESS_EVENT_BY_TYPE } from "../app/game/business-events.ts";
import { getCollectorCardProfile } from "../app/game/card-collectibles.ts";
import { getThemeCardMarketQuote } from "../app/game/card-market.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import {
  createInitialGame,
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
import { parseGameState } from "../app/game/save-schema.ts";
import type { GameState } from "../app/game/types.ts";

function reachReleaseDay(state: GameState, targetDay: number): GameState {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    if (next.day === targetDay && next.phase === "release-edit") return next;
    if (next.operations.pendingEvent) {
      const pending = next.operations.pendingEvent;
      const choice = BUSINESS_EVENT_BY_TYPE[pending.type].choices.find(
        (candidate) => candidate.cost <= next.finance.cash + 1e-9,
      );
      assert.ok(choice, "the campaign needs an affordable event choice");
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice: choice.id,
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_BAN",
        changes: next.day === 0 ? getPrologueRestrictionChanges(next) : {},
      });
    } else if (next.phase === "release-edit") {
      const selections = getAutomaticReleaseSelections(next);
      assert.ok(selections.length > 0);
      next = reduceGame(next, { type: "SUBMIT_RELEASE", selections });
    } else if (!next.handoverComplete && next.day === 7) {
      next = reduceGame(next, { type: "COMPLETE_HANDOVER" });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: Math.max(1, targetDay - next.day),
      });
    }
  }
  throw new Error(`Release review on DAY ${targetDay} did not appear.`);
}

function reachFirstRelease(state: GameState): GameState {
  return reachReleaseDay(state, 10);
}

function reachFirstReprint(state: GameState): GameState {
  return reachReleaseDay(state, 50);
}

function jsonRoundTrip(state: GameState): GameState {
  return parseGameState(JSON.parse(JSON.stringify(state)) as unknown);
}

test("request lanes replace and cancel independently", () => {
  let state = createInitialGame(81_001);
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
  const state = createInitialGame(81_002);
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
  let state = createInitialGame(81_006);
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

test("reprint requests wait for a dedicated reprint pack", () => {
  let state = createInitialGame(81_003);
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

  assert.equal(state.releaseSlate!.releaseKind, "regular");
  assert.equal(state.releaseSlate!.options.length, 9);
  assert.ok(state.releaseSlate!.options.every((option) => option.kind !== "reprint"));
  const requestedGeneric = state.releaseSlate!.options.find(
    (option) => option.kind === "generic" && option.requested,
  );
  assert.ok(requestedGeneric && requestedGeneric.kind === "generic");
  assert.ok(
    THEME_BY_ID[themeId].playKeywords.includes(requestedGeneric.requestKeyword!),
  );

  const selections = getAutomaticReleaseSelections(state);
  assert.equal(selections.length, 4);
  const selectedKinds = selections.map((selection) =>
    state.releaseSlate!.options.find(
      (option) => option.id === selection.optionId,
    )!.kind
  );
  assert.equal(selectedKinds.length, 4);
  assert.ok(["new-theme", "support", "generic"].every(
    (kind) => selectedKinds.includes(kind as (typeof selectedKinds)[number]),
  ));
  assert.ok(!selectedKinds.includes("reprint"));

  let released = reduceGame(state, { type: "SUBMIT_RELEASE", selections });
  const releasedKinds = released.releaseHistory.at(-1)!.products.map(
    (product) => product.kind,
  );
  assert.ok(["new-theme", "support", "generic"].every(
    (kind) => releasedKinds.includes(kind as (typeof releasedKinds)[number]),
  ));
  assert.ok(!releasedKinds.includes("reprint"));
  assert.equal(released.releaseHistory.at(-1)!.products.length, 4);
  const queuedReprint = released.supportRequests.find(
    (request) => request.kind === "reprint",
  );
  assert.ok(queuedReprint);
  assert.equal(queuedReprint.status, "queued");
  assert.equal(queuedReprint.eligibleReleaseDay, 50);

  released = reachFirstReprint(released);
  assert.equal(released.releaseSlate!.releaseKind, "reprint");
  assert.equal(released.releaseSlate!.options.length, 9);
  assert.ok(
    released.releaseSlate!.options.some(
      (option) => option.kind === "reprint" && option.cardId === reprintCard && option.requested,
    ),
  );
  const reprinted = reduceGame(released, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(released),
  });
  assert.ok(
    reprinted.releaseHistory.at(-1)!.products.some(
      (product) => product.kind === "reprint" && product.cardId === reprintCard,
    ),
  );
  assert.equal(
    reprinted.supportRequests.find((request) => request.kind === "reprint")?.status,
    "released",
  );
  jsonRoundTrip(reprinted);
});

test("reprints raise release-day sales then cause deterministic D+1 price and trust shocks", () => {
  let state = createInitialGame(81_004);
  const candidate = getReprintCandidates(state).find(
    (entry) => entry.cardKind === "theme-part" && entry.collectorLabel === null,
  );
  assert.ok(candidate?.themeId);
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId: candidate.cardId },
  });
  state = reachFirstReprint(state);
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
  let state = createInitialGame(81_005);
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId },
  });
  state = reachFirstReprint(state);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(state),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const quote = getThemeCardMarketQuote(state, "white-night", cardId, 1);
  assert.ok(quote);
  assert.ok(quote.price >= profile.priceFloor * 0.86);
});
