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
  canQueueRegularReleaseRequest,
  getEnvironmentTargetGenericPool,
  getIndirectSupportGenericPool,
  getPendingReleaseRequest,
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

test("the current release review closes the shared support request window", () => {
  const running = createInitialGame(81_009);
  assert.equal(canQueueRegularReleaseRequest(running, true), true);

  const reviewing = reachFirstRelease(running);
  assert.equal(reviewing.phase, "release-edit");
  assert.equal(canQueueRegularReleaseRequest(reviewing, true), false);
});

function reachFirstReprint(state: GameState): GameState {
  return reachReleaseDay(state, 50);
}

function jsonRoundTrip(state: GameState): GameState {
  return parseGameState(JSON.parse(JSON.stringify(state)) as unknown);
}

test("support, indirect, and target requests replace one shared regular slot", () => {
  let state = createInitialGame(81_001);
  const themes = state.activeThemeIds;

  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "support", themeId: themes[0], direction: "recovery" },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "indirect-support", themeId: themes[0] },
  });
  assert.equal(state.supportRequests[0].status, "replaced");
  assert.equal(
    getPendingReleaseRequest(state, "regular")?.kind,
    "indirect-support",
  );

  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "environment-target", themeId: themes[1] },
  });
  assert.equal(state.supportRequests[1].status, "replaced");
  assert.equal(
    getPendingReleaseRequest(state, "regular")?.kind,
    "environment-target",
  );
  assert.equal(getPendingReleaseRequest(state, "reprint"), null);

  state = reduceGame(state, {
    type: "CANCEL_RELEASE_REQUEST",
    lane: "regular",
  });
  assert.equal(getPendingReleaseRequest(state, "regular"), null);
  assert.equal(state.supportRequests[2].status, "cancelled");
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
  const impact = (card: (typeof indirect)[number]) =>
    card.basePower + card.unpleasantness * 0.4;
  assert.equal(
    impact(indirect[0]),
    Math.min(...indirect.map(impact)),
  );
  const bestCounterEdge = getKeywordMatchupEdgeScore(
    [counters[0].keyword],
    keywords,
  );
  const equallyDirectCounters = counters.filter(
    (card) =>
      getKeywordMatchupEdgeScore([card.keyword], keywords) === bestCounterEdge,
  );
  assert.equal(
    impact(counters[0]),
    Math.min(...equallyDirectCounters.map(impact)),
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

test("the same generic card keeps identical trust impact regardless of request origin", () => {
  let requested = createInitialGame(81_007);
  const themeId = requested.activeThemeIds[0];
  requested = reduceGame(requested, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "indirect-support", themeId },
  });
  requested = reachFirstRelease(requested);
  const requestedGeneric = requested.releaseSlate!.options.find(
    (option) => option.kind === "generic" && option.requested,
  );
  assert.ok(requestedGeneric && requestedGeneric.kind === "generic");

  const control = structuredClone(requested);
  control.supportRequests = [];
  control.nextSupportRequestId = 1;
  const controlGeneric = control.releaseSlate!.options.find(
    (option) => option.id === requestedGeneric.id,
  );
  assert.ok(controlGeneric && controlGeneric.kind === "generic");
  controlGeneric.requested = false;
  delete controlGeneric.requestId;
  delete controlGeneric.requestKind;
  delete controlGeneric.requestThemeId;
  delete controlGeneric.requestKeyword;

  const selectedOptions = [
    requestedGeneric,
    requested.releaseSlate!.options.find((option) => option.kind === "support")!,
    ...requested.releaseSlate!.options
      .filter((option) => option.kind === "new-theme")
      .slice(0, 2),
  ];
  const selections = selectedOptions.map((option) => ({
    optionId: option.id,
    powerAdjustment: option.id === requestedGeneric.id ? 3 as const : 0 as const,
  }));
  const requestedRelease = reduceGame(requested, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  const directRelease = reduceGame(control, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  const requestedNextDay = reduceGame(requestedRelease, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const directNextDay = reduceGame(directRelease, {
    type: "ADVANCE_DAYS",
    days: 1,
  });

  assert.equal(
    requestedNextDay.purchaseTrust,
    directNextDay.purchaseTrust,
  );
  jsonRoundTrip(requestedNextDay);
});

test("a direct support request draws more trust backlash than the indirect route", () => {
  let state = createInitialGame(81_008);
  const themeId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "support", themeId, direction: "consistency" },
  });
  state = reachFirstRelease(state);
  const requestedSupport = state.releaseSlate!.options.find(
    (option) => option.kind === "support" && option.requested,
  );
  const generic = state.releaseSlate!.options.find(
    (option) => option.kind === "generic",
  );
  const newThemes = state.releaseSlate!.options
    .filter((option) => option.kind === "new-theme")
    .slice(0, 2);
  assert.ok(requestedSupport && generic && newThemes.length === 2);

  const released = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [requestedSupport, generic, ...newThemes].map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
  const indirectControl = structuredClone(released);
  const controlSupport = indirectControl.releaseHistory.at(-1)!.products.find(
    (product) => product.kind === "support",
  );
  assert.ok(controlSupport && controlSupport.kind === "support");
  delete controlSupport.requestId;

  const directNextDay = reduceGame(released, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const indirectNextDay = reduceGame(indirectControl, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(
    Math.round((indirectNextDay.purchaseTrust - directNextDay.purchaseTrust) * 100) /
      100,
    0.35,
  );
});

test("regular requests do not enter automatic dedicated reprint packs", () => {
  let state = createInitialGame(81_003);
  const themeId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "support", themeId, direction: "consistency" },
  });
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "indirect-support", themeId },
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
  released = reachFirstReprint(released);
  assert.equal(released.releaseSlate!.releaseKind, "reprint");
  assert.equal(released.releaseSlate!.options.length, 9);
  assert.ok(released.releaseSlate!.options.every((option) => !option.requested));
  const reprinted = reduceGame(released, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(released),
  });
  assert.ok(reprinted.releaseHistory.at(-1)!.products.every(
    (product) => product.kind === "reprint",
  ));
  assert.equal(
    reprinted.supportRequests.some((request) => request.kind === "reprint"),
    false,
  );
  jsonRoundTrip(reprinted);
});

test("reprints raise release-day sales then cause deterministic D+1 price and trust shocks", () => {
  let state = createInitialGame(81_004);
  state = reachFirstReprint(state);
  const selections = getAutomaticReleaseSelections(state);
  const selectedIds = new Set(selections.map((selection) => selection.optionId));
  const selectedThemeOption = state.releaseSlate!.options.find((option) => {
    if (option.kind !== "reprint" || !selectedIds.has(option.id)) return false;
    return getReprintImpactPreview(state, option.cardId)?.cardKind === "theme-part";
  });
  assert.ok(selectedThemeOption && selectedThemeOption.kind === "reprint");
  const candidate = getReprintImpactPreview(state, selectedThemeOption.cardId);
  assert.ok(candidate?.themeId);
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
    selections,
  });
  const reprint = released.releaseHistory.at(-1)!.products.find(
    (product) =>
      product.kind === "reprint" && product.cardId === candidate.cardId,
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
  let state = createInitialGame(81_005);
  state = reachFirstReprint(state);
  const collectorOption = state.releaseSlate!.options.find(
    (option) =>
      option.kind === "reprint" && Boolean(getCollectorCardProfile(option.cardId)),
  );
  assert.ok(collectorOption && collectorOption.kind === "reprint");
  const profile = getCollectorCardProfile(collectorOption.cardId);
  assert.ok(profile);
  const otherOptions = state.releaseSlate!.options
    .filter((option) => option.id !== collectorOption.id)
    .slice(0, 2);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [collectorOption, ...otherOptions].map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const quote = getThemeCardMarketQuote(
    state,
    collectorOption.themeId,
    collectorOption.cardId,
    1,
  );
  assert.ok(quote);
  assert.ok(quote.price >= profile.priceFloor * 0.86);
});
