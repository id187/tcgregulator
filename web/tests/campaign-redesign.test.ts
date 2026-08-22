import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { BUSINESS_EVENT_BY_TYPE } from "../app/game/business-events.ts";
import {
  FIRST_RELEASE_DAY,
  isRegularReleaseDay,
  isReprintReleaseDay,
  isScheduledReleaseDay,
} from "../app/game/campaign.ts";
import { getDecisionReportsArriving } from "../app/game/decision-reports.ts";
import {
  createCampaignStart,
  getPrologueRestrictionChanges,
  isHandoverReady,
  reduceGame,
} from "../app/game/engine.ts";
import {
  ENVIRONMENT_HEALTH_MODEL,
  getEnvironmentHealthBreakdown,
} from "../app/game/environment-health.ts";
import {
  getCampaignAnalysisHistory,
  getPreCampaignHistory,
} from "../app/game/pre-campaign-history.ts";
import { getReleaseSlateKind } from "../app/game/release-kind.ts";
import type { GameState } from "../app/game/types.ts";

function startMandate(seed = 404): GameState {
  const start = createCampaignStart(seed);
  return reduceGame(start, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(start),
    campaignSeed: seed,
  });
}

function progressToReview(state: GameState, targetDay: number): GameState {
  let next = state;
  let guard = 0;
  while (!(next.day === targetDay && next.phase === "release-edit")) {
    guard += 1;
    assert.ok(guard < 100, `stalled while progressing to DAY ${targetDay}`);
    if (!next.handoverComplete && isHandoverReady(next)) {
      next = reduceGame(next, { type: "COMPLETE_HANDOVER" });
      continue;
    }
    if (next.phase === "release-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: getAutomaticReleaseSelections(next),
      });
      continue;
    }
    if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
      continue;
    }
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
      continue;
    }
    next = reduceGame(next, {
      type: "ADVANCE_DAYS",
      days: targetDay - next.day,
    });
  }
  return next;
}

test("the redesigned calendar has 23 product reviews, seven reprint packs, and 16 regular packs", () => {
  const slots = Array.from({ length: 501 }, (_, day) => day).filter(
    isScheduledReleaseDay,
  );
  assert.equal(slots[0], FIRST_RELEASE_DAY);
  assert.equal(slots.at(-1), 450);
  assert.equal(slots.length, 23);
  assert.equal(slots.filter(isRegularReleaseDay).length, 16);
  assert.deepEqual(slots.filter(isReprintReleaseDay), [50, 110, 170, 230, 290, 350, 410]);
});

test("DAY 0 exposes fourteen inherited rows and stops at DAY 7 and each D+9 report", () => {
  const fresh = createCampaignStart(405);
  const inherited = getCampaignAnalysisHistory(fresh);
  assert.deepEqual(
    inherited.map((row) => row.day),
    Array.from({ length: 14 }, (_, index) => index - 14),
  );

  let state = startMandate(405);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 7);
  assert.equal(isHandoverReady(state), true);
  state = reduceGame(state, { type: "COMPLETE_HANDOVER" });
  const handover = state;
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 9);
  const reports = getDecisionReportsArriving(handover, state);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].kind, "restriction");
  assert.equal(reports[0].decisionDay, 0);
  assert.equal(reports[0].reportDay, 9);
  assert.ok(reports[0].decision.headline.length > 0);
  assert.ok(Number.isFinite(reports[0].growth.index));
  assert.match(reports[0].growth.comparison, /첫 보고서.*DAY 0 100/);
  assert.match(reports[0].growth.basis, /활성 유저.*일평균 매출/);
  assert.ok(
    reports[0].metrics.every(
      (metric) => metric.before !== undefined && metric.after !== undefined,
    ),
  );
});

test("the inherited market ledger has distinct deterministic paths anchored to DAY 0", () => {
  const fresh = createCampaignStart(405);
  const stateBeforeObservation = structuredClone(fresh);
  const first = getPreCampaignHistory(fresh);
  const second = getPreCampaignHistory(fresh);
  const healthAtDayZero = getEnvironmentHealthBreakdown(fresh).score;

  assert.deepEqual(second, first);
  assert.deepEqual(fresh, stateBeforeObservation);
  assert.equal(first.length, 14);
  assert.ok(first.every((row) => row.environmentHealthModel === ENVIRONMENT_HEALTH_MODEL));

  const series = {
    cash: first.map((row) => row.cash ?? Number.NaN),
    health: first.map((row) => row.environmentHealth ?? Number.NaN),
    trust: first.map((row) => row.purchaseTrust ?? Number.NaN),
    sentiment: first.map((row) => row.communitySentiment ?? Number.NaN),
  };
  for (const [name, values] of Object.entries(series)) {
    assert.ok(
      new Set(values).size >= 6,
      `${name} should not render as a flat inherited series`,
    );
  }

  const directionChanges = (values: number[]) =>
    values.slice(1).map((value, index) => Math.sign(value - values[index]));
  assert.notDeepEqual(
    directionChanges(series.health),
    directionChanges(series.trust),
  );
  assert.notDeepEqual(
    directionChanges(series.health),
    directionChanges(series.sentiment),
  );
  assert.notDeepEqual(
    directionChanges(series.trust),
    directionChanges(series.sentiment),
  );

  for (let index = 1; index < first.length; index += 1) {
    const cashDelta = (first[index].cash ?? 0) - (first[index - 1].cash ?? 0);
    assert.ok(
      Math.abs(cashDelta - (first[index].operatingCash ?? 0)) < 0.00011,
      `DAY ${first[index].day} cash should accumulate its operating flow`,
    );
  }

  const inheritedDayBeforeStart = first.at(-1)!;
  assert.equal(inheritedDayBeforeStart.cash, fresh.finance.cash);
  assert.ok(
    Math.abs((inheritedDayBeforeStart.environmentHealth ?? 0) - healthAtDayZero) < 1,
  );
  assert.ok(
    Math.abs((inheritedDayBeforeStart.purchaseTrust ?? 0) - fresh.purchaseTrust) < 1,
  );
  assert.ok(
    Math.abs((inheritedDayBeforeStart.communitySentiment ?? 0) - 46) < 1,
  );

  assert.ok(first.every((row) =>
    (row.cash ?? -1) >= 0 &&
    (row.environmentHealth ?? -1) >= 0 &&
    (row.environmentHealth ?? 101) <= 100 &&
    (row.purchaseTrust ?? -1) >= 0 &&
    (row.purchaseTrust ?? 101) <= 100 &&
    (row.communitySentiment ?? -1) >= 0 &&
    (row.communitySentiment ?? 101) <= 100 &&
    Number.isInteger(row.communityPositive) &&
    Number.isInteger(row.communityNegative) &&
    (row.communityPositive ?? 21) + (row.communityNegative ?? 21) <= 20
  ));
});

test("a settled DAY 0 snapshot becomes the inherited chart's exact landing point", () => {
  const state = createCampaignStart(406);
  const template = getPreCampaignHistory(state).at(-1)!;
  state.history.push({
    ...template,
    day: 0,
    cash: 1.75,
    operatingCash: -0.02,
    environmentHealth: 61,
    environmentHealthModel: ENVIRONMENT_HEALTH_MODEL,
    purchaseTrust: 73,
    communitySentiment: 38,
    communityPositive: 5,
    communityNegative: 11,
  });

  const inheritedDayBeforeStart = getPreCampaignHistory(state).at(-1)!;
  assert.equal(inheritedDayBeforeStart.cash, 1.75);
  assert.ok(Math.abs((inheritedDayBeforeStart.environmentHealth ?? 0) - 61) < 1);
  assert.ok(Math.abs((inheritedDayBeforeStart.purchaseTrust ?? 0) - 73) < 1);
  assert.ok(Math.abs((inheritedDayBeforeStart.communitySentiment ?? 0) - 38) < 1);
  assert.ok(Math.abs((inheritedDayBeforeStart.communityPositive ?? 0) - 5) <= 1);
  assert.ok(Math.abs((inheritedDayBeforeStart.communityNegative ?? 0) - 11) <= 1);
});

test("settled DAY 0 freezes inherited users, shares, and win rates", () => {
  const state = startMandate(407);
  const inherited = getPreCampaignHistory(state);

  state.users.tier = 90_000;
  state.users.casual = 70_000;
  state.users.collector = 40_000;
  for (const [index, themeId] of state.activeThemeIds.entries()) {
    state.themes[themeId].share = index === 0 ? 0.96 : 0.01;
    state.themes[themeId].winRate = index === 0 ? 0.95 : 0.05;
  }

  assert.deepEqual(getPreCampaignHistory(state), inherited);
});

test("DAY 50 is a nine-candidate, three-card, zero-adjustment reprint pack", () => {
  const review = progressToReview(startMandate(406), 50);
  assert.ok(review.releaseSlate);
  assert.equal(getReleaseSlateKind(review.releaseSlate), "reprint");
  assert.equal(review.releaseSlate.options.length, 9);
  assert.ok(review.releaseSlate.options.every((option) => option.kind === "reprint"));

  const selections = getAutomaticReleaseSelections(review);
  assert.equal(selections.length, 3);
  assert.ok(selections.every((selection) => selection.powerAdjustment === 0));
  const submitted = reduceGame(review, { type: "SUBMIT_RELEASE", selections });
  const batch = submitted.releaseHistory.at(-1);
  assert.equal(batch?.releaseKind, "reprint");
  assert.equal(batch?.products.length, 3);
  assert.ok(batch?.products.every((product) =>
    product.kind === "reprint" && product.powerAdjustment === 0));
});
