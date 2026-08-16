import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  BUSINESS_ACTION_DAILY_REVENUE_CAP,
  getBusinessActionAvailability,
  getBusinessActionDailyGrossRevenue,
  getBusinessActionProjectedDirectCash,
  getBusinessActionProjectedDirectGrossRevenue,
  getChampionshipBacklashRisk,
  getStackedBusinessActionDailyGrossRevenue,
  getStrategicProjectRiskProfile,
} from "../app/game/business-actions.ts";
import {
  BUSINESS_EVENTS,
  BUSINESS_EVENT_BY_TYPE,
  BUSINESS_EVENT_TYPES,
  applyBusinessStrategyDelta,
  getBusinessEventChoice,
  getBusinessEventOutcome,
  getBusinessEventResult,
  getBusinessEventType,
  getBusinessStrategyModifiers,
  getInitialBusinessEventDay,
} from "../app/game/business-events.ts";
import {
  CAMPAIGN_END_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
} from "../app/game/campaign.ts";
import { getCommunityHeat } from "../app/game/daily-community.ts";
import {
  getDailyOperatingCost,
  getMonthlyOperatingCost,
  getOperatingRunwayMonths,
} from "../app/game/finance.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionHistoricalOutcome,
  getRestrictionPolicyProfile,
} from "../app/game/restriction-policy.ts";
import {
  createCampaignStart,
  createInitialGame,
  canProposeSupport,
  formatCommunityEvent,
  getCommittedSupportCount,
  getNextBanDay,
  getNextReleaseDay,
  getPrologueReleaseSelections,
  getPrologueRestrictionChanges,
  isBanDay,
  isPrologueReleaseSelection,
  isPrologueRestrictionChange,
  isReleaseDay,
  reduceGame,
} from "../app/game/engine.ts";

type State = ReturnType<typeof createInitialGame>;
type Adjustment = -3 | -2 | -1 | 0 | 1 | 2 | 3;

function choosePendingBusinessEvent(
  state: State,
  preferredChoice?: "a" | "b",
): State {
  const pending = state.operations.pendingEvent;
  assert.ok(pending, "expected a pending business event");
  const definition = BUSINESS_EVENT_BY_TYPE[pending.type];
  const choice = preferredChoice ??
    definition.choices.find((candidate) => candidate.cost === 0)?.id ??
    "a";
  return reduceGame(state, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.id,
    choice,
  });
}

function advanceToPendingBusinessEvent(
  state: State,
  advanceChunk = 1_000,
): State {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    if (next.operations.pendingEvent) return next;
    if (next.phase === "release-edit") {
      next = submitFirstThree(next);
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: advanceChunk });
    }
    if (next.phase === "ended") break;
  }
  throw new Error("A business event did not appear before the campaign ended.");
}

function advanceUntilDayOrDecisionHandlingBusinessEvents(
  state: State,
  targetDay: number,
): State {
  let next = state;
  while (next.day < targetDay && next.phase === "running") {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  if (next.operations.pendingEvent) {
    next = choosePendingBusinessEvent(next);
  }
  return next;
}

function advanceToNextReleaseHandlingBusinessEvents(state: State): State {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else if (next.phase === "release-edit") {
      return next;
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else if (next.phase === "ended") {
      break;
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1_000 });
    }
  }
  throw new Error("A release review did not appear before the campaign ended.");
}

test("restriction announcements state whether limits tighten or loosen", () => {
  const state = createCampaignStart(9001);
  const baseEvent = {
    id: "directional-restriction-copy",
    day: 45,
    category: "restriction" as const,
    type: "restriction-applied" as const,
    themeId: "cycle",
    partId: "cycle-gate",
    body: "",
  };

  assert.match(
    formatCommunityEvent(
      { ...baseEvent, previousValue: 3, value: 1 },
      state,
    ),
    /제한 강화 3→1장/,
  );
  assert.match(
    formatCommunityEvent(
      { ...baseEvent, previousValue: 1, value: 3 },
      state,
    ),
    /제한 해제 1→3장/,
  );
});

function advanceToFirstRelease(state: State): State {
  let next = state;
  while (next.day < 60) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 60 - next.day });
    }
  }
  assert.equal(next.day, 60);
  assert.equal(next.phase, "release-edit");
  assert.ok(next.releaseSlate);
  return next;
}

function advanceRawToFirstBan(seed: number): State {
  let state = createCampaignStart(seed);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 29 });
  state = submitFirstThree(state);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  assert.equal(state.day, 45);
  assert.equal(state.phase, "ban-edit");
  return state;
}

function submitFirstThree(
  state: State,
  adjustments: readonly Adjustment[] = [0, 0, 0],
): State {
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.equal(adjustments.length, 3);
  const options = state.releaseSlate.options.slice(0, 3);
  assert.equal(options.length, 3);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: options.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: adjustments[index],
    })),
  });
}

function advanceThroughDecisions(state: State, targetDay: number): State {
  let next = state;
  while (next.day < targetDay) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else if (next.phase === "release-edit") {
      next = submitFirstThree(next);
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  if (next.operations.pendingEvent) return choosePendingBusinessEvent(next);
  if (next.phase === "release-edit") return submitFirstThree(next);
  if (next.phase === "ban-edit") {
    return reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
  }
  return next;
}

function advanceBusinessEventResult(state: State, targetDay: number): State {
  let next = state;
  while (next.day < targetDay) {
    if (next.phase === "release-edit") {
      next = submitFirstThree(next);
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
      if (next.operations.pendingEvent && next.day < targetDay) {
        throw new Error("A later business event appeared before the pending result.");
      }
    }
  }
  if (next.phase === "release-edit") return submitFirstThree(next);
  if (next.phase === "ban-edit") {
    return reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
  }
  return next;
}

function playBusinessEvents(
  seed: number,
  count: number,
  advanceChunk: number,
): State {
  let state = createInitialGame(seed);
  state.finance.cash = 100;
  while (state.operations.eventRecords.length < count) {
    state = advanceToPendingBusinessEvent(state, advanceChunk);
    state = choosePendingBusinessEvent(
      state,
      state.operations.eventRecords.length % 2 === 0 ? "a" : "b",
    );
  }
  return state;
}

function assertHealthyShares(state: State): void {
  assert.equal(Object.keys(state.themes).length, state.activeThemeIds.length);
  assert.ok(state.activeThemeIds.length <= THEMES.length);
  const shares = state.activeThemeIds.map(
    (themeId) => state.themes[themeId].share,
  );
  assert.ok(shares.every(Number.isFinite));
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-6);
}

function tuneRestrictionTarget(
  state: State,
  themeId: string,
  unpleasantness: number,
): State {
  const tuned = structuredClone(state);
  const otherShare = 0.58 / (tuned.activeThemeIds.length - 1);
  for (const activeId of tuned.activeThemeIds) {
    tuned.themes[activeId].share = activeId === themeId ? 0.42 : otherShare;
    tuned.themes[activeId].previousWeekShare = tuned.themes[activeId].share;
    tuned.themes[activeId].topStreakDays = activeId === themeId ? 90 : 0;
  }
  const runtime = tuned.themes[themeId];
  runtime.supportUnpleasantness += unpleasantness - runtime.unpleasantness;
  runtime.unpleasantness = unpleasantness;
  tuned.currentTopThemeId = themeId;
  return tuned;
}

test("uses releases through DAY 450 and 60-day restriction reviews through DAY 465", () => {
  const releaseDays = Array.from(
    { length: CAMPAIGN_END_DAY },
    (_, index) => index + 1,
  ).filter(isReleaseDay);
  const banDays = Array.from({ length: CAMPAIGN_END_DAY }, (_, index) => index + 1).filter(
    isBanDay,
  );

  assert.equal(releaseDays.length, 15);
  assert.equal(releaseDays[0], 30);
  assert.equal(releaseDays.at(-1), LAST_RELEASE_DAY);
  assert.deepEqual(banDays, [
    45,
    105,
    165,
    225,
    285,
    345,
    405,
    LAST_DECISION_DAY,
  ]);
  assert.equal(getNextReleaseDay(42), 60);
  assert.equal(getNextReleaseDay(60), 90);
  assert.equal(getNextBanDay(42), 45);
  assert.equal(getNextBanDay(45), 105);
  assert.equal(releaseDays.some((day) => isBanDay(day)), false);
});

test("creates a fixed DAY 1 campaign start with five themes and 10,000 users", () => {
  const state = createCampaignStart(17);
  const otherSeed = createCampaignStart(999_017);
  assert.equal(state.day, 1);
  assert.equal(state.phase, "running");
  assert.equal(THEMES.length, 150);
  assert.equal(state.activeThemeIds.length, 5);
  assert.equal(new Set(state.activeThemeIds).size, 5);
  assert.equal(Object.keys(state.themes).length, 5);
  assert.deepEqual(state.activeThemeIds, [
    "cycle",
    "white-night",
    "machine-revolution",
    "ironblood",
    "abyss",
  ]);
  assert.deepEqual(state.users, {
    tier: 3_500,
    casual: 4_500,
    collector: 2_000,
  });
  assert.equal(state.handoverComplete, false);
  assert.ok(THEMES.every((theme) => theme.parts.length === 14));
  assert.ok(
    state.activeThemeIds.every((themeId) => {
      const runtime = state.themes[themeId];
      return (
        runtime.supportCount === 0 &&
        runtime.releasedPartIds.length === 5 &&
        Object.keys(runtime.partStats).length === 5 &&
        Object.keys(runtime.legalLimits).length === 5
      );
    }),
  );
  assert.deepEqual(otherSeed.users, state.users);
  assert.deepEqual(
    state.activeThemeIds.map((themeId) => state.themes[themeId].share),
    otherSeed.activeThemeIds.map((themeId) => otherSeed.themes[themeId].share),
  );
  const startingWeightTotal = 0.14 + 0.13 + 0.13 + 0.1 + 0.11;
  const expectedShares = [0.14, 0.13, 0.13, 0.1, 0.11].map(
    (weight) => weight / startingWeightTotal,
  );
  state.activeThemeIds.forEach((themeId, index) => {
    assert.ok(Math.abs(state.themes[themeId].share - expectedShares[index]) < 1e-8);
  });
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.history.map((entry) => entry.day), [1]);
  assert.ok(state.history.every((entry) => entry.totalUsers === 10_000));
  assert.deepEqual(state.history.map((entry) => entry.revenue), state.recentRevenue);
  assert.deepEqual(state.community, []);
  assert.deepEqual(state.releaseHistory, []);
});

test("exposes deterministic guided choices that replay through the ordinary reducer", () => {
  const expected = createInitialGame(1000);
  let guided = createCampaignStart(1000);

  assert.throws(
    () => getPrologueReleaseSelections(guided),
    /DAY 30 review/,
  );
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(guided.day, 15);
  guided = reduceGame(guided, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 15 });
  const selections = getPrologueReleaseSelections(guided);
  assert.equal(selections.length, 3);
  assert.ok(
    selections.every((selection) =>
      isPrologueReleaseSelection(guided, selection),
    ),
  );
  assert.equal(
    isPrologueReleaseSelection(guided, {
      ...selections[0],
      powerAdjustment: selections[0].powerAdjustment === 3
        ? 2
        : ((selections[0].powerAdjustment + 1) as Adjustment),
    }),
    false,
  );

  guided = reduceGame(guided, { type: "SUBMIT_RELEASE", selections });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 15 });
  const changes = getPrologueRestrictionChanges(guided);
  const restrictionEntries = Object.entries(changes);
  assert.equal(restrictionEntries.length, 4);
  assert.ok(
    restrictionEntries.every(([, limit]) => limit === 1 || limit === 2),
  );
  const guidedProfile = getRestrictionPolicyProfile(guided, changes);
  assert.equal(guidedProfile.quality, "balanced");
  assert.equal(guidedProfile.upperMeaningfulCuts, 2);
  assert.equal(guidedProfile.tier2MeaningfulCuts, 2);
  assert.equal(guidedProfile.staleEligible, 0);
  const [guidedPartId, guidedLimit] = restrictionEntries[0];
  assert.equal(
    isPrologueRestrictionChange(
      guided,
      guidedPartId,
      guidedLimit,
    ),
    true,
  );
  assert.equal(
    isPrologueRestrictionChange(
      guided,
      guidedPartId,
      guidedLimit === 2 ? 1 : 2,
    ),
    false,
  );

  guided = reduceGame(guided, { type: "SUBMIT_BAN", changes });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(guided.handoverComplete, false);
  guided = reduceGame(guided, { type: "COMPLETE_HANDOVER" });
  assert.deepEqual(guided, expected);
});

test("replays the fixed DAY 30 release and DAY 45 restriction into DAY 46", () => {
  const raw = createCampaignStart(1000);
  const fullPrologue = createInitialGame(1000);
  const skippedPrologue = createInitialGame(1000);

  assert.deepEqual(fullPrologue, skippedPrologue);
  assert.equal(raw.day, 1);
  assert.equal(fullPrologue.day, 46);
  assert.equal(fullPrologue.phase, "running");
  assert.equal(fullPrologue.releaseSlate, null);
  assert.deepEqual(
    fullPrologue.operations.records.map((record) => ({
      type: record.type,
      startedDay: record.startedDay,
      outcome: record.outcome,
    })),
    [{ type: "tv-cm", startedDay: 15, outcome: "completed" }],
  );
  assert.equal(fullPrologue.finance.cumulativeExpenses, 0.6);
  assert.equal(fullPrologue.activeThemeIds.length, 8);
  assert.equal(fullPrologue.releaseHistory.length, 1);
  assert.equal(fullPrologue.releaseHistory[0].day, 30);
  assert.deepEqual(
    fullPrologue.releaseHistory[0].products.map((product) => ({
      optionId: product.optionId,
      kind: product.kind,
      powerAdjustment: product.powerAdjustment,
    })),
    [
      { optionId: "release-option-4", kind: "new-theme", powerAdjustment: 3 },
      { optionId: "release-option-5", kind: "new-theme", powerAdjustment: 3 },
      { optionId: "release-option-6", kind: "new-theme", powerAdjustment: 3 },
    ],
  );
  const decisionDayReleaseEvents = fullPrologue.community.filter(
    (event) =>
      event.day === 30 &&
      (event.type === "release-reaction" || event.type === "support-released"),
  );
  assert.equal(decisionDayReleaseEvents.length, 0);
  const releaseEvents = fullPrologue.community.filter(
    (event) =>
      event.day === 31 &&
      (event.type === "release-reaction" || event.type === "support-released"),
  );
  assert.equal(releaseEvents.length, 3);
  assert.deepEqual(
    releaseEvents.map((event) => event.themeId),
    fullPrologue.releaseHistory[0].products.map((product) => product.themeId),
  );
  assert.ok(releaseEvents.every((event) => event.body.length > 0));
  assert.equal(fullPrologue.handoverComplete, true);
  const prologueRestrictionEvents = fullPrologue.community.filter(
    (event) =>
      event.day === 45 &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction"),
  );
  assert.equal(prologueRestrictionEvents.length, 4);
  assert.ok(
    prologueRestrictionEvents.every(
      (event) =>
        event.partId !== undefined &&
        event.previousValue === 3 &&
        (event.value === 1 || event.value === 2) &&
        fullPrologue.themes[event.themeId].legalLimits[event.partId] ===
          event.value,
    ),
  );
  const prologueProfile = getPublishedRestrictionPolicyProfile(
    fullPrologue,
    45,
  );
  assert.equal(prologueProfile.quality, "balanced");
  assert.equal(prologueProfile.upperMeaningfulCuts, 2);
  assert.equal(prologueProfile.tier2MeaningfulCuts, 2);
  assert.deepEqual(
    fullPrologue.history.map((entry) => entry.day),
    Array.from({ length: 46 }, (_, index) => index + 1),
  );
  assert.equal(
    fullPrologue.history.filter((entry) => entry.day === 30).length,
    1,
  );
  assert.equal(
    fullPrologue.history.filter((entry) => entry.day === 45).length,
    1,
  );
  const historyByDay = new Map(
    fullPrologue.history.map((entry) => [entry.day, entry]),
  );
  assert.deepEqual(historyByDay.get(30)?.shares, historyByDay.get(29)?.shares);
  assert.equal(historyByDay.get(30)?.totalUsers, historyByDay.get(29)?.totalUsers);
  assert.notDeepEqual(historyByDay.get(31)?.shares, historyByDay.get(30)?.shares);
  assert.deepEqual(historyByDay.get(45)?.shares, historyByDay.get(44)?.shares);
  assert.equal(historyByDay.get(45)?.totalUsers, historyByDay.get(44)?.totalUsers);
  assert.notDeepEqual(historyByDay.get(46)?.shares, historyByDay.get(45)?.shares);
  assert.deepEqual(
    fullPrologue.history.slice(-30).map((entry) => entry.revenue),
    fullPrologue.recentRevenue,
  );
  assert.equal(raw.activeThemeIds.length, 5, "the prologue must not mutate its raw input");
});

test("unpleasant long-term exposure accelerates fatigue and low-share themes recover slowly", () => {
  const baseline = createInitialGame(4117);
  const targetId = baseline.currentTopThemeId;
  const calm = structuredClone(baseline);
  const hostile = structuredClone(baseline);
  calm.themes[targetId].fatigue = 30;
  hostile.themes[targetId].fatigue = 30;
  calm.themes[targetId].topStreakDays = 60;
  hostile.themes[targetId].topStreakDays = 60;
  calm.themes[targetId].unpleasantness = 20;
  hostile.themes[targetId].unpleasantness = 90;
  calm.themes[targetId].supportUnpleasantness -= 40;
  hostile.themes[targetId].supportUnpleasantness += 40;

  const calmNext = reduceGame(calm, { type: "ADVANCE_DAYS", days: 1 });
  const hostileNext = reduceGame(hostile, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(
    hostileNext.themes[targetId].fatigue > calmNext.themes[targetId].fatigue,
  );
  assert.ok(hostileNext.themes[targetId].fatigue <= 100);

  const recovering = createInitialGame(5118);
  const recoveringId = recovering.activeThemeIds[0];
  const recipientId = recovering.activeThemeIds[1];
  const transferred = recovering.themes[recoveringId].share - 0.01;
  recovering.themes[recoveringId].share = 0.01;
  recovering.themes[recipientId].share += transferred;
  recovering.themes[recoveringId].topStreakDays = 0;
  recovering.themes[recoveringId].fatigue = 90;
  const recovered = reduceGame(recovering, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(recovered.themes[recoveringId].fatigue < 90);
  assert.ok(recovered.themes[recoveringId].fatigue >= 89.5);
});

test("high fatigue lowers theme adoption, tier and casual users, and daily sales", () => {
  const released = submitFirstThree(advanceToFirstRelease(createInitialGame(6119)));
  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  const lowFatigue = structuredClone(observed);
  const highFatigue = structuredClone(lowFatigue);
  for (const themeId of lowFatigue.activeThemeIds) {
    lowFatigue.themes[themeId].fatigue = 5;
    highFatigue.themes[themeId].fatigue = 90;
  }
  const targetId = lowFatigue.currentTopThemeId;
  highFatigue.themes[targetId].fatigue = 100;

  const lowNext = reduceGame(lowFatigue, { type: "ADVANCE_DAYS", days: 1 });
  const highNext = reduceGame(highFatigue, { type: "ADVANCE_DAYS", days: 1 });

  assert.ok(highNext.themes[targetId].share < lowNext.themes[targetId].share);
  assert.ok(highNext.users.tier < lowNext.users.tier);
  assert.ok(highNext.users.casual < lowNext.users.casual);
  assert.ok(highNext.finance.today < lowNext.finance.today);
});

test("community chatter and display heat do not directly change simulation results", () => {
  const control = createInitialGame(7120);
  const noisy = structuredClone(control);
  const themeId = noisy.activeThemeIds[0];
  for (const event of noisy.community) event.body = `과장된 반응 ${event.id}`;
  for (let index = 0; index < 20; index += 1) {
    noisy.community.push({
      id: `synthetic-noise-${index}`,
      day: noisy.day,
      category: "meta",
      type: "top-theme-changed",
      themeId,
      body: `게임은 안 해봤지만 오늘 망했다는 글 ${index}`,
    });
  }
  assert.ok(
    getCommunityHeat(noisy, noisy.day) > getCommunityHeat(control, control.day),
  );

  const controlNext = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  const noisyNext = reduceGame(noisy, { type: "ADVANCE_DAYS", days: 1 });
  assert.deepEqual(noisyNext.users, controlNext.users);
  assert.deepEqual(noisyNext.finance, controlNext.finance);
  assert.equal(noisyNext.purchaseTrust, controlNext.purchaseTrust);
});

test("stops at restriction and release gates until each review is submitted", () => {
  const initial = createInitialGame(101);
  let state = initial;

  assert.equal(initial.day, 46, "the reducer must not mutate its input");
  assert.equal(initial.phase, "running");

  for (const releaseDay of [60, 90]) {
    state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, releaseDay);
    assert.equal(state.day, releaseDay);
    assert.equal(state.phase, "release-edit");

    const releaseBlocked = reduceGame(state, {
      type: "ADVANCE_DAYS",
      days: 100,
    });
    assert.equal(releaseBlocked.day, releaseDay);
    assert.equal(releaseBlocked.phase, "release-edit");
    state = submitFirstThree(releaseBlocked);
  }

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 105);
  assert.equal(state.day, 105);
  assert.equal(state.phase, "ban-edit");
  const banBlocked = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(banBlocked.day, 105);
  state = reduceGame(banBlocked, { type: "SUBMIT_BAN", changes: {} });

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 120);
  assert.equal(state.day, 120);
  assert.equal(state.phase, "release-edit");
});

test("is deterministic for the same seed and release command log", () => {
  function scenario(seed: number) {
    let state = createInitialGame(seed);
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: state.activeThemeIds[0],
      direction: "consistency",
    });
    state = advanceToFirstRelease(state);
    assert.ok(state.releaseSlate);
    const requested = state.releaseSlate.options.find((option) => option.requested);
    assert.ok(requested);
    const selected = [
      requested,
      ...state.releaseSlate.options.filter((option) => option.id !== requested.id),
    ].slice(0, 3);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option, index) => ({
        optionId: option.id,
        powerAdjustment: ([-1, 0, 1] as const)[index],
      })),
    });
    state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 90);
    assert.equal(state.day, 90);
    assert.equal(state.phase, "release-edit");
    return submitFirstThree(state, [1, 0, -1]);
  }

  assert.deepEqual(scenario(20260815), scenario(20260815));
  assert.notDeepEqual(scenario(20260815), scenario(20260816));
});

test("a one-copy finisher restriction is cosmetic but a three-copy starter restriction hurts", () => {
  const initial = createCampaignStart(55);
  const theme = THEMES.find(
    (candidate) =>
      initial.activeThemeIds.includes(candidate.id) &&
      candidate.parts.some(
        (part) => part.role === "starter1" && part.preferredCopies === 3,
      ),
  );
  assert.ok(theme);
  const starter = theme.parts.find(
    (part) => part.role === "starter1" && part.preferredCopies === 3,
  );
  const finisher = theme.parts.find(
    (part) => part.role === "finisher" && part.preferredCopies === 1,
  );
  assert.ok(starter);
  assert.ok(finisher);

  const atGate = advanceRawToFirstBan(55);
  const unrestrictedPower = atGate.themes[theme.id].power;

  const cosmetic = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [finisher.id]: 1 },
  });
  assert.equal(cosmetic.themes[theme.id].power, unrestrictedPower);
  const cosmeticObserved = reduceGame(cosmetic, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(cosmeticObserved.themes[theme.id].power, unrestrictedPower);
  assert.equal(
    cosmeticObserved.themes[theme.id].partStats[finisher.id].averageCopies,
    1,
  );
  assert.ok(
    cosmetic.community.some(
      (event) =>
        event.type === "cosmetic-restriction" && event.partId === finisher.id,
    ),
  );

  const starterHit = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [starter.id]: 1 },
  });
  assert.equal(starterHit.themes[theme.id].power, unrestrictedPower);
  assert.equal(starterHit.themes[theme.id].legalLimits[starter.id], 1);
  const starterObserved = reduceGame(starterHit, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(starterObserved.themes[theme.id].power < unrestrictedPower - 3);
  assert.ok(
    starterObserved.community.some(
      (event) =>
        event.day === 46 &&
        event.type === "restriction-demand" &&
        event.partId === starter.id,
    ),
  );
});

test("hands over a stable DAY 46 environment and continues normalizing on DAY 47", () => {
  const state = createInitialGame(1000);
  const runtimes = state.activeThemeIds.map((themeId) => state.themes[themeId]);
  const totalUsers = Object.values(state.users).reduce(
    (total, users) => total + users,
    0,
  );
  const topShare = Math.max(...runtimes.map((runtime) => runtime.share));
  const health =
    100 -
    runtimes.reduce(
      (total, runtime) => total + runtime.unpleasantness * runtime.share,
      0,
    );

  assert.equal(state.day, 46);
  assert.equal(state.phase, "running");
  assert.equal(state.handoverComplete, true);
  assert.ok(totalUsers >= 9_500);
  assert.ok(topShare < 0.29);
  assert.ok(health >= 55);
  assert.ok(Math.max(...runtimes.map((runtime) => runtime.fatigue)) < 35);
  assert.ok(state.finance.today > 0);
  assert.ok(state.finance.rolling30 > state.finance.today);

  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(
    Math.max(
      ...next.activeThemeIds.map((themeId) => next.themes[themeId].share),
    ) < 0.28,
  );
});

test("ends immediately at zero users while one remaining user can continue", () => {
  const oneUser = createInitialGame(303);
  oneUser.users = { tier: 1, casual: 0, collector: 0 };
  const continued = reduceGame(oneUser, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(continued.day, 47);
  assert.equal(continued.phase, "running");

  const zeroUsers = createInitialGame(303);
  zeroUsers.users = { tier: 0, casual: 0, collector: 0 };
  const ended = reduceGame(zeroUsers, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(ended.day, 47);
  assert.equal(ended.phase, "ended");
  assert.equal(ended.history.at(-1)?.totalUsers, 0);
});

test("restriction shock is delayed, dependency-weighted, bounded, and partly converts tier users", () => {
  const targetId = "cycle";
  const atGate = tuneRestrictionTarget(
    advanceRawToFirstBan(8055),
    targetId,
    60,
  );
  const usersAtDecision = structuredClone(atGate.users);
  const coreDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { "cycle-gate": 0 },
  });
  const minorDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { "cycle-gate": 2 },
  });
  const noChangeDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: {},
  });
  assert.deepEqual(coreDecision.users, usersAtDecision);
  assert.deepEqual(minorDecision.users, usersAtDecision);
  assert.deepEqual(noChangeDecision.users, usersAtDecision);
  assert.ok(
    noChangeDecision.community.some(
      (event) =>
        event.day === 45 &&
        event.type === "restriction-no-change" &&
        event.themeId === targetId &&
        event.previousValue === event.value,
    ),
  );

  const coreWithoutShock = structuredClone(coreDecision);
  for (const event of coreWithoutShock.community) {
    if (
      event.day === 45 &&
      event.themeId === targetId &&
      event.partId === "cycle-gate" &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction")
    ) {
      event.day = 44;
    }
  }
  const coreObserved = reduceGame(coreDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const coreControlObserved = reduceGame(coreWithoutShock, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const minorObserved = reduceGame(minorDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const noChangeObserved = reduceGame(noChangeDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });

  assert.ok(coreObserved.users.tier < minorObserved.users.tier);
  assert.ok(minorObserved.users.tier < noChangeObserved.users.tier);
  assert.ok(coreObserved.users.tier < coreControlObserved.users.tier);
  assert.ok(coreObserved.users.casual > coreControlObserved.users.casual);
  assert.ok(
    coreDecision.users.tier - coreObserved.users.tier <
      coreDecision.users.tier * 0.04,
  );

  const secondDay = reduceGame(coreObserved, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const firstDayLoss = coreDecision.users.tier - coreObserved.users.tier;
  const secondDayLoss = coreObserved.users.tier - secondDay.users.tier;
  assert.ok(firstDayLoss > Math.max(0, secondDayLoss) * 4);
});

test("relief from an oppressive restriction offsets part of the tier-user shock", () => {
  const base = advanceRawToFirstBan(9156);
  const lowUnpleasant = tuneRestrictionTarget(base, "cycle", 56);
  const highUnpleasant = tuneRestrictionTarget(base, "cycle", 95);
  const observe = (state: State) =>
    reduceGame(
      reduceGame(state, {
        type: "SUBMIT_BAN",
        changes: { "cycle-gate": 0 },
      }),
      { type: "ADVANCE_DAYS", days: 1 },
    );

  const lowObserved = observe(lowUnpleasant);
  const highObserved = observe(highUnpleasant);
  assert.ok(highObserved.users.tier > lowObserved.users.tier);
});

test("a restriction review preserves single-card scope and supports a balanced multi-tier list", () => {
  let atGate = createInitialGame(13_505);
  while (
    !(
      atGate.phase === "ban-edit" &&
      atGate.day - 45 >= 90
    )
  ) {
    if (atGate.operations.pendingEvent) {
      atGate = choosePendingBusinessEvent(atGate);
    } else {
      atGate = reduceGame(atGate, { type: "ADVANCE_DAYS", days: 100 });
    }
    if (atGate.operations.pendingEvent) {
      atGate = choosePendingBusinessEvent(atGate);
    } else if (atGate.phase === "release-edit") {
      atGate = submitFirstThree(atGate);
    } else if (atGate.phase === "ban-edit" && atGate.day - 45 < 90) {
      atGate = reduceGame(atGate, { type: "SUBMIT_BAN", changes: {} });
    }
  }
  assert.equal(atGate.phase, "ban-edit");
  const decisionDay = atGate.day;
  const followupDay = decisionDay + 1;

  const rankedThemeIds = [...atGate.activeThemeIds].sort(
    (left, right) => atGate.themes[right].share - atGate.themes[left].share,
  );
  // The management UI labels zero-based ranks 0-2 as Tier 1 (unless rank 0
  // crosses the Tier 0 threshold) and ranks 3-5 as Tier 2. Pick unambiguous
  // representatives so the review is tied to the decision-day meta snapshot.
  const tier1ThemeId = rankedThemeIds[1];
  const tier2ThemeId = rankedThemeIds[3];
  assert.ok(tier1ThemeId);
  assert.ok(tier2ThemeId);
  assert.notEqual(tier1ThemeId, tier2ThemeId);

  const cuttableParts = (themeId: string) => {
    const content = THEMES.find((theme) => theme.id === themeId);
    assert.ok(content);
    return content.parts.filter(
      (part) =>
        atGate.themes[themeId].releasedPartIds.includes(part.id) &&
        (atGate.themes[themeId].legalLimits[part.id] ?? 3) === 3 &&
        part.preferredCopies >= 2,
    ).slice(0, 2);
  };
  const tier1Cuts = cuttableParts(tier1ThemeId);
  const tier2Cuts = cuttableParts(tier2ThemeId);
  assert.equal(tier1Cuts.length, 2);
  assert.equal(tier2Cuts.length, 2);

  const oldRestriction = atGate.community.find(
    (event) =>
      event.day === 45 &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction") &&
      event.partId !== undefined &&
      event.value !== undefined &&
      event.value < 3,
  );
  assert.ok(oldRestriction?.partId);
  assert.ok(atGate.day - oldRestriction.day >= 90);
  assert.equal(
    atGate.themes[oldRestriction.themeId].legalLimits[oldRestriction.partId],
    oldRestriction.value,
  );

  const singlePartId = tier1Cuts[0].id;
  const singleProfile = getRestrictionPolicyProfile(atGate, {
    [singlePartId]: 1,
  });
  assert.equal(singleProfile.quality, "narrow");
  assert.equal(singleProfile.changeCount, 1);
  assert.equal(singleProfile.scope, "single-card");
  assert.equal(singleProfile.upperMeaningfulCuts, 1);
  assert.equal(singleProfile.tier2MeaningfulCuts, 0);
  assert.equal(singleProfile.staleLoosened, 0);
  const twoCardProfile = getRestrictionPolicyProfile(atGate, {
    [tier1Cuts[0].id]: 1,
    [tier1Cuts[1].id]: 1,
  });
  assert.equal(twoCardProfile.meaningfulCutCount, 2);
  assert.equal(twoCardProfile.quality, "narrow");
  const single = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [singlePartId]: 1 },
  });
  const singleDecisionEvents = single.community.filter(
    (event) =>
      event.day === decisionDay &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction"),
  );
  assert.equal(singleDecisionEvents.length, 1);
  assert.equal(singleDecisionEvents[0].partId, singlePartId);
  const singleObserved = reduceGame(single, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.deepEqual(
    singleObserved.community
      .filter(
        (event) =>
          event.day === followupDay && event.type === "restriction-demand",
      )
      .map((event) => event.partId),
    [singlePartId],
  );

  const cuts = Object.fromEntries(
    [...tier1Cuts, ...tier2Cuts].map((part) => [part.id, 1]),
  ) as Record<string, 1>;
  const balancedChanges: Record<string, 0 | 1 | 2 | 3> = {
    ...cuts,
    [oldRestriction.partId]: 3,
  };
  const draftProfile = getRestrictionPolicyProfile(atGate, balancedChanges);
  assert.equal(draftProfile.quality, "balanced");
  assert.equal(draftProfile.changeCount, 5);
  assert.equal(draftProfile.scope, "multi-theme");
  assert.deepEqual(draftProfile.directionMix, {
    tighten: 4,
    loosen: 1,
    unchanged: 0,
  });
  assert.equal(draftProfile.meaningfulCutCount, 4);
  assert.equal(draftProfile.upperMeaningfulCuts, 2);
  assert.equal(draftProfile.tier2MeaningfulCuts, 2);
  assert.equal(draftProfile.lowerMeaningfulCuts, 0);
  assert.ok(draftProfile.staleEligible >= 1);
  assert.equal(draftProfile.staleLoosened, 1);
  assert.equal(draftProfile.staleFullyReleased, 1);
  assert.equal(draftProfile.coverageComplete, true);
  assert.equal(draftProfile.staleReliefComplete, true);
  const partialReliefState = structuredClone(atGate);
  const partialReliefEvent = partialReliefState.community.find(
    (event) => event.id === oldRestriction.id,
  );
  assert.ok(partialReliefEvent);
  partialReliefEvent.value = 0;
  partialReliefState.themes[oldRestriction.themeId].legalLimits[
    oldRestriction.partId
  ] = 0;
  const partialReliefProfile = getRestrictionPolicyProfile(
    partialReliefState,
    { ...cuts, [oldRestriction.partId]: 1 },
  );
  assert.equal(partialReliefProfile.staleLoosened, 1);
  assert.equal(partialReliefProfile.staleFullyReleased, 0);
  assert.equal(partialReliefProfile.staleReliefComplete, false);
  assert.equal(partialReliefProfile.quality, "incomplete");
  const cutsOnly = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: cuts,
  });
  const liftOnly = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [oldRestriction.partId]: 3 },
  });
  const balanced = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: balancedChanges,
  });

  assert.equal(
    atGate.themes[oldRestriction.themeId].legalLimits[oldRestriction.partId],
    oldRestriction.value,
    "the reducer must not mutate the review input",
  );
  assert.ok(cutsOnly.purchaseTrust < atGate.purchaseTrust);
  assert.ok(liftOnly.purchaseTrust < atGate.purchaseTrust);
  assert.ok(balanced.purchaseTrust > cutsOnly.purchaseTrust);
  assert.ok(balanced.purchaseTrust < atGate.purchaseTrust);
  assert.ok(atGate.purchaseTrust - balanced.purchaseTrust <= 12);

  const decisionEvents = balanced.community.filter(
    (event) =>
      event.day === decisionDay &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction"),
  );
  assert.equal(decisionEvents.length, 5);
  assert.equal(
    decisionEvents.filter((event) => event.themeId === tier1ThemeId).length,
    2,
  );
  assert.equal(
    decisionEvents.filter((event) => event.themeId === tier2ThemeId).length,
    2,
  );
  assert.ok(
    decisionEvents.some(
      (event) =>
        event.partId === oldRestriction.partId &&
        event.previousValue === oldRestriction.value &&
        event.value === 3,
    ),
  );
  const publishedProfile = getPublishedRestrictionPolicyProfile(
    balanced,
    decisionDay,
  );
  assert.equal(publishedProfile.quality, "balanced");
  assert.equal(publishedProfile.changeCount, draftProfile.changeCount);
  assert.equal(
    publishedProfile.upperMeaningfulCuts,
    draftProfile.upperMeaningfulCuts,
  );
  assert.equal(
    publishedProfile.tier2MeaningfulCuts,
    draftProfile.tier2MeaningfulCuts,
  );
  assert.equal(publishedProfile.staleLoosened, draftProfile.staleLoosened);
  assert.equal(
    publishedProfile.staleFullyReleased,
    draftProfile.staleFullyReleased,
  );
  for (const part of [...tier1Cuts, ...tier2Cuts]) {
    assert.equal(balanced.themes[part.id.startsWith(`${tier1ThemeId}-`) ? tier1ThemeId : tier2ThemeId].legalLimits[part.id], 1);
  }
  assert.equal(
    balanced.themes[oldRestriction.themeId].legalLimits[oldRestriction.partId],
    3,
  );

  const decisionHistory = balanced.history.find(
    (entry) => entry.day === decisionDay,
  );
  assert.ok(decisionHistory);
  assert.deepEqual(
    decisionHistory.shares,
    Object.fromEntries(
      atGate.activeThemeIds.map((themeId) => [
        themeId,
        atGate.themes[themeId].share,
      ]),
    ),
  );

  const balancedObserved = reduceGame(balanced, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const cutsOnlyObserved = reduceGame(cutsOnly, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(
    balancedObserved.themes[tier1ThemeId].power <
      atGate.themes[tier1ThemeId].power,
  );
  assert.ok(
    balancedObserved.themes[tier2ThemeId].power <
      atGate.themes[tier2ThemeId].power,
  );
  assert.ok(
    balancedObserved.themes[oldRestriction.themeId].power >
      cutsOnlyObserved.themes[oldRestriction.themeId].power,
  );
  assert.ok(balancedObserved.users.tier > cutsOnlyObserved.users.tier);
  const firstFollowup = getRestrictionHistoricalOutcome(
    balancedObserved,
    decisionDay,
    followupDay,
  );
  assert.equal(firstFollowup.decisionDay, decisionDay);
  assert.equal(firstFollowup.followupDay, followupDay);
  assert.ok(firstFollowup.followupMetrics);
  assert.ok(Number.isFinite(firstFollowup.topShareDelta));
  assert.ok(Number.isFinite(firstFollowup.targetedShareDelta));
  assert.ok(Number.isFinite(firstFollowup.userRateDelta));
});

test("restriction outcome labels require real target movement and a healthy follow-up meta", () => {
  const base = createInitialGame(13_506);
  const targetThemeId = base.activeThemeIds[0];
  const targetContent = THEMES.find((theme) => theme.id === targetThemeId);
  assert.ok(targetContent);
  const targetPart = targetContent.parts.find(
    (part) =>
      base.themes[targetThemeId].releasedPartIds.includes(part.id) &&
      part.preferredCopies >= 2,
  );
  assert.ok(targetPart);
  const themeIds = base.activeThemeIds.slice(0, 8);
  assert.equal(themeIds.length, 8);

  const outcomeFor = (
    decisionShares: readonly number[],
    followupShares: readonly number[],
    followupUsers = 100_000,
  ) => {
    const state = structuredClone(base);
    state.day = 49;
    state.phase = "running";
    state.community = state.community.filter(
      (event) =>
        event.day !== 45 ||
        !(
          event.type === "restriction-applied" ||
          event.type === "cosmetic-restriction" ||
          event.type === "restriction-no-change"
        ),
    );
    state.community.push({
      id: "restriction-outcome-fixture",
      day: 45,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetThemeId,
      partId: targetPart.id,
      previousValue: 3,
      value: 1,
      body: "fixture",
    });
    const sharesFor = (values: readonly number[]) =>
      Object.fromEntries(
        themeIds.map((themeId, index) => [themeId, values[index] ?? 0]),
      );
    state.history = state.history
      .filter((entry) => entry.day !== 45 && entry.day !== 49)
      .concat([
        {
          day: 45,
          totalUsers: 100_000,
          revenue: 1,
          topThemeId: themeIds[0],
          shares: sharesFor(decisionShares),
        },
        {
          day: 49,
          totalUsers: followupUsers,
          revenue: 1,
          topThemeId: themeIds[0],
          shares: sharesFor(followupShares),
        },
      ])
      .sort((left, right) => left.day - right.day);
    return getRestrictionHistoricalOutcome(state, 45, 49);
  };

  const stillDominated = outcomeFor(
    [0.5, 0.2, 0.12, 0.1, 0.08, 0, 0, 0],
    [0.495, 0.19, 0.125, 0.105, 0.085, 0, 0, 0],
  );
  assert.notEqual(stillDominated.classification, "stabilized");
  assert.ok(stillDominated.followupMetrics!.topShare > 0.49);

  const unrelatedUserLoss = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.05, 0.05],
    [0.338, 0.18, 0.141, 0.101, 0.08, 0.06, 0.05, 0.05],
    95_000,
  );
  assert.notEqual(unrelatedUserLoss.classification, "overcorrected");
  assert.ok(unrelatedUserLoss.userRateDelta <= -0.05);

  const stabilized = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.05, 0.05],
    [0.3, 0.16, 0.13, 0.11, 0.09, 0.08, 0.07, 0.06],
  );
  assert.equal(stabilized.classification, "stabilized");

  const overcorrected = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.05, 0.05],
    [0.2, 0.2, 0.16, 0.13, 0.1, 0.08, 0.07, 0.06],
  );
  assert.equal(overcorrected.classification, "overcorrected");
});

test("support proposals have a thirty-day cooldown and are guaranteed on the next slate", () => {
  let state = createInitialGame(77);
  const targetId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: targetId,
    direction: "recovery",
  });

  assert.equal(state.supportRequests.length, 1);
  const firstRequest = state.supportRequests[0];
  assert.equal(firstRequest.proposedDay, 46);
  assert.equal(firstRequest.eligibleReleaseDay, 60);
  assert.equal(firstRequest.status, "queued");
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: state.activeThemeIds[1],
        direction: "counterplay",
      }),
    /30-day cooldown/,
  );

  state = advanceToFirstRelease(state);
  assert.ok(state.releaseSlate);
  const requestedOption = state.releaseSlate.options.find(
    (option) => option.requestId === firstRequest.id,
  );
  assert.ok(requestedOption);
  assert.equal(requestedOption.kind, "support");
  assert.equal(requestedOption.themeId, targetId);
  assert.equal(requestedOption.direction, "recovery");
  assert.equal(requestedOption.requested, true);
  assert.equal(
    state.supportRequests.find((request) => request.id === firstRequest.id)?.status,
    "offered",
  );

  const selected = [
    requestedOption,
    ...state.releaseSlate.options.filter(
      (option) => option.id !== requestedOption.id,
    ),
  ].slice(0, 3);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
  assert.equal(state.supportRequests[0].status, "released");
  assert.equal(state.supportRequests[0].releasedDay, 60);

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 75);
  assert.equal(state.day, 75);
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: state.activeThemeIds[1],
        direction: "counterplay",
      }),
    /30-day cooldown/,
  );
  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 76);
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: state.activeThemeIds[1],
    direction: "counterplay",
  });
  assert.equal(state.day, 76);
  assert.equal(state.supportRequests.length, 2);
  assert.equal(state.supportRequests[1].eligibleReleaseDay, 90);
});

test("support releases unlock exactly three prepared cards and stop after three waves", () => {
  let state = createInitialGame(7781);
  const targetId = state.activeThemeIds.find(
    (themeId) => state.themes[themeId].supportCount === 0,
  );
  assert.ok(targetId);
  const content = THEMES.find((theme) => theme.id === targetId);
  assert.ok(content);
  const launchUsage = content.parts
    .slice(0, 5)
    .reduce((total, part) => total + part.inclusion, 0) / 5;

  for (let wave = 1; wave <= 3; wave += 1) {
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: targetId,
      direction: "consistency",
    });
    state = advanceToNextReleaseHandlingBusinessEvents(state);
    assert.equal(state.phase, "release-edit");
    assert.ok(state.releaseSlate);
    const requested = state.releaseSlate.options.find(
      (option) => option.requested && option.themeId === targetId,
    );
    assert.ok(requested);
    const selected = [
      requested,
      ...state.releaseSlate.options.filter((option) => option.id !== requested.id),
    ].slice(0, 3);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option) => ({
        optionId: option.id,
        powerAdjustment: 3,
      })),
    });
    if (wave === 3) {
      assert.equal(state.themes[targetId].supportCount, 2);
      assert.equal(getCommittedSupportCount(state, targetId), 3);
      assert.equal(canProposeSupport(state, targetId), false);
      assert.throws(
        () =>
          reduceGame(state, {
            type: "PROPOSE_SUPPORT",
            themeId: targetId,
            direction: "recovery",
          }),
        /at most three times/,
      );
    }
    state = advanceUntilDayOrDecisionHandlingBusinessEvents(
      state,
      state.day + 1,
    );

    const runtime: State["themes"][string] = state.themes[targetId];
    const expectedCount = 5 + wave * 3;
    assert.equal(runtime.supportCount, wave);
    assert.equal(runtime.releasedPartIds.length, expectedCount);
    assert.deepEqual(
      runtime.releasedPartIds,
      content.parts.slice(0, expectedCount).map((part) => part.id),
    );
    assert.equal(Object.keys(runtime.legalLimits).length, expectedCount);
    assert.equal(Object.keys(runtime.partStats).length, expectedCount);
    assert.equal(runtime.lastSupportAdjustment, 3);
    assert.equal(runtime.supportReplacementPressure, 0.48);

    if (wave < 3) {
      state = advanceUntilDayOrDecisionHandlingBusinessEvents(
        state,
        state.day + 15,
      );
      if (state.phase === "ban-edit") {
        assert.equal(state.day, 105);
        state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
        state = advanceUntilDayOrDecisionHandlingBusinessEvents(
          state,
          state.day + 1,
        );
      }
    }
  }

  const runtime = state.themes[targetId];
  const oldUsage = content.parts
    .slice(0, 5)
    .reduce((total, part) => total + runtime.partStats[part.id].usageRate, 0) / 5;
  const newestUsage = content.parts
    .slice(11, 14)
    .reduce((total, part) => total + runtime.partStats[part.id].usageRate, 0) / 3;
  assert.ok(oldUsage < launchUsage * 0.6);
  assert.ok(newestUsage > oldUsage);
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: targetId,
        direction: "recovery",
      }),
    /at most three times/,
  );

  state = advanceToNextReleaseHandlingBusinessEvents(state);
  assert.equal(state.day, 150);
  assert.ok(
    state.releaseSlate?.options.every(
      (option) => option.kind !== "support" || option.themeId !== targetId,
    ),
  );
});

test("day 60 release review offers exactly three new themes and three supports", () => {
  const state = advanceToFirstRelease(createInitialGame(321));
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.day, 60);
  assert.equal(state.releaseSlate.options.length, 6);
  assert.equal(
    state.releaseSlate.options.filter((option) => option.kind === "new-theme")
      .length,
    3,
  );
  assert.equal(
    state.releaseSlate.options.filter((option) => option.kind === "support")
      .length,
    3,
  );
  assert.ok(
    state.releaseSlate.options
      .filter((option) => option.kind === "new-theme")
      .every((option) => !state.activeThemeIds.includes(option.themeId)),
  );
  assert.ok(
    state.releaseSlate.options
      .filter((option) => option.kind === "support")
      .every((option) => state.activeThemeIds.includes(option.themeId)),
  );
});

test("release submission requires three unique valid selections and applies their adjustments", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(654));
  assert.ok(atRelease.releaseSlate);
  const newOptions = atRelease.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  );
  const supportOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "support",
  );
  assert.equal(newOptions.length, 3);
  assert.ok(supportOption);

  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: newOptions.slice(0, 2).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      }),
    /Exactly three release options/,
  );
  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: [
          { optionId: newOptions[0].id, powerAdjustment: 0 },
          { optionId: newOptions[1].id, powerAdjustment: 0 },
          { optionId: supportOption.id, powerAdjustment: 4 },
        ],
      } as never),
    /integer from -3 to 3/,
  );

  const selected = [
    { option: newOptions[0], adjustment: -3 as const },
    { option: newOptions[1], adjustment: 3 as const },
    { option: supportOption, adjustment: 0 as const },
  ];
  const supportBefore = atRelease.themes[supportOption.themeId].supportPower;
  const activeBefore = [...atRelease.activeThemeIds];
  const usersBefore = { ...atRelease.users };
  const sharesBefore = Object.fromEntries(
    activeBefore.map((themeId) => [themeId, atRelease.themes[themeId].share]),
  );
  const released = reduceGame(atRelease, {
    type: "SUBMIT_RELEASE",
    selections: selected.map(({ option, adjustment }) => ({
      optionId: option.id,
      powerAdjustment: adjustment,
    })),
  });

  assert.equal(atRelease.phase, "release-edit", "the reducer must not mutate its input");
  assert.equal(released.day, 60);
  assert.equal(released.phase, "running");
  assert.equal(released.releaseSlate, null);
  assert.deepEqual(released.activeThemeIds, activeBefore);
  assert.ok(!released.activeThemeIds.includes(newOptions[0].themeId));
  assert.ok(!released.activeThemeIds.includes(newOptions[1].themeId));
  assert.ok(!released.activeThemeIds.includes(newOptions[2].themeId));
  assert.equal(released.themes[supportOption.themeId].supportPower, supportBefore);
  assert.deepEqual(released.users, usersBefore);
  assert.deepEqual(
    Object.fromEntries(
      activeBefore.map((themeId) => [themeId, released.themes[themeId].share]),
    ),
    sharesBefore,
  );
  assert.equal(
    released.community.filter(
      (event) =>
        event.day === 60 &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    0,
  );
  assert.ok(released.finance.today > atRelease.history.at(-1)!.revenue);
  assert.equal(released.releaseHistory.length, 2);
  assert.equal(released.releaseHistory[1].day, 60);
  assert.deepEqual(
    released.releaseHistory[1].products.map((product) => ({
      optionId: product.optionId,
      powerAdjustment: product.powerAdjustment,
    })),
    selected.map(({ option, adjustment }) => ({
      optionId: option.id,
      powerAdjustment: adjustment,
    })),
  );

  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(observed.day, 61);
  assert.equal(observed.activeThemeIds.length, activeBefore.length + 2);
  assert.ok(observed.activeThemeIds.includes(newOptions[0].themeId));
  assert.ok(observed.activeThemeIds.includes(newOptions[1].themeId));
  assert.ok(observed.themes[supportOption.themeId].supportPower > supportBefore);
  assert.equal(observed.themes[supportOption.themeId].lastSupportDay, 60);
  assert.equal(
    observed.community.filter(
      (event) =>
        event.day === 61 &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    3,
  );

  for (const { option, adjustment } of selected.slice(0, 2)) {
    const content = THEMES.find((theme) => theme.id === option.themeId);
    assert.ok(content);
    assert.ok(
      Math.abs(
        observed.themes[option.themeId].power -
          (content.basePower + adjustment * 2.2),
      ) < 1e-9,
    );
  }
});

test("keeps shares finite and normalized through every release and restriction gate", () => {
  let state = createInitialGame(999);
  let reviews = 0;

  while (state.phase !== "ended") {
    if (state.operations.pendingEvent) {
      state = choosePendingBusinessEvent(state);
    } else if (state.phase === "release-edit") {
      assert.equal(state.releaseSlate?.options.length, 6);
      state = submitFirstThree(state, [-1, 0, 1]);
      reviews += 1;
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
      reviews += 1;
    } else {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 180 });
    }

    assertHealthyShares(state);
    assert.ok(reviews < 100, "the simulation should continue past every review");
  }

  assert.equal(state.day, CAMPAIGN_END_DAY);
  assert.equal(state.phase, "ended");
  assert.equal(state.releaseHistory.length, 15);
  assertHealthyShares(state);
});

test("keeps six choices when a support-heavy strategy exhausts eligible themes", () => {
  let state = createInitialGame(10_031);
  let releaseReviews = 0;

  while (state.phase !== "ended") {
    if (state.operations.pendingEvent) {
      state = choosePendingBusinessEvent(state);
    } else if (state.phase === "release-edit") {
      assert.ok(state.releaseSlate);
      assert.equal(state.releaseSlate.options.length, 6);
      const supportFirst = [
        ...state.releaseSlate.options.filter((option) => option.kind === "support"),
        ...state.releaseSlate.options.filter((option) => option.kind === "new-theme"),
      ];
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: supportFirst.slice(0, 3).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      });
      releaseReviews += 1;
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
    } else {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1000 });
    }
  }

  assert.equal(state.day, CAMPAIGN_END_DAY);
  assert.equal(releaseReviews, 14);
});

test("charges scaled operating costs every day after the DAY 46 handover", () => {
  const handover = createInitialGame(20_999);
  assert.equal(handover.day, 46);
  assert.equal(handover.finance.todayOperatingCost, 0);
  assert.equal(handover.finance.cumulativeOperatingCosts, 0);

  const next = reduceGame(handover, { type: "ADVANCE_DAYS", days: 1 });
  const activeUsers =
    next.users.tier + next.users.casual + next.users.collector;
  const expectedCost = getDailyOperatingCost(next.day, activeUsers);
  const expectedNet =
    Math.round(
      (next.finance.today * 0.32 - expectedCost + Number.EPSILON) * 10_000,
    ) / 10_000;

  assert.equal(next.day, 47);
  assert.ok(expectedCost > 0);
  assert.equal(next.finance.todayOperatingCost, expectedCost);
  assert.equal(next.finance.cumulativeOperatingCosts, expectedCost);
  assert.equal(next.finance.todayOperatingCash, expectedNet);
  assert.equal(getMonthlyOperatingCost(10_000), 1.3);
  assert.equal(getDailyOperatingCost(46, 10_000), 0);
  assert.equal(getDailyOperatingCost(47, 10_000), 0.0433);
  assert.equal(getOperatingRunwayMonths(10, 10_000), 7.7);
});

test("decision gates charge operating costs once, after the decision is submitted", () => {
  let state = createInitialGame(21_000);
  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 59);
  assert.equal(state.day, 59);
  assert.equal(state.phase, "running");
  const beforeGate = state.finance.cumulativeOperatingCosts;

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, 60);
  assert.equal(state.phase, "release-edit");
  assert.equal(state.finance.cumulativeOperatingCosts, beforeGate);

  state = submitFirstThree(state);
  const expectedCost = getDailyOperatingCost(
    60,
    state.users.tier + state.users.casual + state.users.collector,
  );
  assert.equal(
    state.finance.cumulativeOperatingCosts,
    Math.round((beforeGate + expectedCost + Number.EPSILON) * 10_000) /
      10_000,
  );

  const afterSettlement = state.finance.cumulativeOperatingCosts;
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, 61);
  assert.equal(
    state.finance.cumulativeOperatingCosts,
    Math.round(
      (afterSettlement + state.finance.todayOperatingCost + Number.EPSILON) *
        10_000,
    ) / 10_000,
  );
});

test("business actions remain separate from recurring operating costs", () => {
  let state = createInitialGame(21_001);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const dailyCost = state.finance.todayOperatingCost;
  const recurringTotal = state.finance.cumulativeOperatingCosts;
  const discretionaryTotal = state.finance.cumulativeExpenses;
  const beforeAction = state.finance.todayOperatingCash;

  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "store-tour",
  });

  assert.equal(state.finance.todayOperatingCost, dailyCost);
  assert.equal(state.finance.cumulativeOperatingCosts, recurringTotal);
  assert.equal(
    state.finance.cumulativeExpenses,
    Math.round((discretionaryTotal + 0.35 + Number.EPSILON) * 10_000) /
      10_000,
  );
  assert.equal(
    state.finance.todayOperatingCash,
    Math.round((beforeAction - 0.35 + Number.EPSILON) * 10_000) / 10_000,
  );
});

test("business actions spend operating cash without double-booking the current day", () => {
  const state = createCampaignStart(21_001);
  const original = structuredClone(state);
  const historyLength = state.history.length;
  const cumulativeRevenue = state.finance.cumulative;
  const cash = state.finance.cash;
  const todayOperatingCash = state.finance.todayOperatingCash;

  const next = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.deepEqual(state, original);
  assert.equal(next.day, state.day);
  assert.equal(next.history.length, historyLength);
  assert.equal(next.finance.cumulative, cumulativeRevenue);
  assert.equal(next.finance.cash, Math.round((cash - 0.6) * 10_000) / 10_000);
  assert.equal(
    next.finance.todayOperatingCash,
    Math.round((todayOperatingCash - 0.6) * 10_000) / 10_000,
  );
  assert.equal(next.finance.cumulativeExpenses, 0.6);
  assert.deepEqual(next.operations.records[0], {
    id: "business-action-1",
    type: "tv-cm",
    startedDay: 1,
    endsDay: 22,
    cost: 0.6,
    outcome: "active",
  });
  assert.throws(
    () => reduceGame(next, {
      type: "RUN_BUSINESS_ACTION",
      action: "store-tour",
    }),
    /오늘|already|action/i,
  );

  const broke = structuredClone(state);
  broke.finance.cash = 0.01;
  assert.throws(
    () => reduceGame(broke, {
      type: "RUN_BUSINESS_ACTION",
      action: "tv-cm",
    }),
    /자금|cash/i,
  );
});

test("business cooldowns reopen on the exact boundary day", () => {
  let state = createCampaignStart(21_002);
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 29 });
  assert.equal(state.day, 30);
  state = submitFirstThree(state);
  assert.equal(getBusinessActionAvailability(state, "tv-cm").cooldownRemaining, 1);
  assert.throws(
    () => reduceGame(state, {
      type: "RUN_BUSINESS_ACTION",
      action: "tv-cm",
    }),
    /1일|cooldown/i,
  );
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(getBusinessActionAvailability(state, "tv-cm").cooldownRemaining, 0);
  const repeated = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.equal(repeated.operations.records.length, 2);
});

test("marketing and store tours affect users and trust from the following day", () => {
  const seed = 21_003;
  const control = createCampaignStart(seed);
  control.finance.cash = 10;

  const tv = reduceGame(control, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  const tvNext = reduceGame(tv, { type: "ADVANCE_DAYS", days: 1 });
  const controlNext = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(tvNext.users.casual > controlNext.users.casual);

  const anime = reduceGame(control, {
    type: "RUN_BUSINESS_ACTION",
    action: "animation-promotion",
  });
  const animeNext = reduceGame(anime, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(animeNext.users.collector > controlNext.users.collector);
  assert.ok(animeNext.users.casual > tvNext.users.casual);

  const lowTrust = structuredClone(control);
  lowTrust.purchaseTrust = 50;
  const tour = reduceGame(lowTrust, {
    type: "RUN_BUSINESS_ACTION",
    action: "store-tour",
  });
  const tourNext = reduceGame(tour, { type: "ADVANCE_DAYS", days: 1 });
  const lowTrustNext = reduceGame(lowTrust, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(tourNext.purchaseTrust > lowTrustNext.purchaseTrust);
});

test("direct-revenue business actions project a positive cash contribution", () => {
  const state = createCampaignStart(21_099);
  const cases = [
    { type: "store-tour", dailyGross: 0.086, projectedCash: 0.0353 },
    { type: "beginner-camp", dailyGross: 0.094, projectedCash: 0.0211 },
    { type: "local-league", dailyGross: 0.081, projectedCash: 0.0443 },
    { type: "reprint-campaign", dailyGross: 0.065, projectedCash: 0.074 },
    { type: "collector-fair", dailyGross: 0.17, projectedCash: 0.1116 },
  ] as const;

  for (const fixture of cases) {
    assert.equal(
      getBusinessActionDailyGrossRevenue(state, fixture.type),
      fixture.dailyGross,
      fixture.type,
    );
    assert.equal(
      getBusinessActionProjectedDirectCash(state, fixture.type),
      fixture.projectedCash,
      fixture.type,
    );
  }

  assert.equal(
    getBusinessActionDailyGrossRevenue(state, "championship", "backlash"),
    0,
  );
  assert.equal(
    getBusinessActionDailyGrossRevenue(state, "championship", "success"),
    0.47,
  );
  assert.equal(
    getBusinessActionProjectedDirectCash(state, "championship", "success"),
    0.2528,
  );

  assert.equal(BUSINESS_ACTION_DAILY_REVENUE_CAP, 0.18);
  assert.equal(
    getStackedBusinessActionDailyGrossRevenue(state, [
      { type: "store-tour", outcome: "active" },
      { type: "collector-fair", outcome: "active" },
    ]),
    0.18,
  );
  assert.equal(
    getStackedBusinessActionDailyGrossRevenue(state, [
      { type: "championship", outcome: "success" },
      { type: "collector-fair", outcome: "active" },
    ]),
    0.64,
  );

  const largeAudience = structuredClone(state);
  largeAudience.users = { tier: 35_000, casual: 45_000, collector: 20_000 };
  assert.ok(
    getBusinessActionDailyGrossRevenue(largeAudience, "collector-fair") >
      BUSINESS_ACTION_DAILY_REVENUE_CAP,
  );
  assert.equal(
    getBusinessActionProjectedDirectCash(largeAudience, "collector-fair"),
    0.1564,
  );

  const overlapping = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "collector-fair",
  });
  assert.ok(
    getBusinessActionProjectedDirectGrossRevenue(overlapping, "store-tour") <
      getBusinessActionDailyGrossRevenue(overlapping, "store-tour") * 14,
  );
  assert.ok(
    getBusinessActionProjectedDirectCash(overlapping, "store-tour") < 0,
  );
});

test("recurring business events generate revenue and grow their intended audience", () => {
  const cases = [
    { type: "store-tour", segment: "casual", cost: 0.35 },
    { type: "beginner-camp", segment: "casual", cost: 0.4 },
    { type: "local-league", segment: "tier", cost: 0.5 },
    { type: "reprint-campaign", segment: "collector", cost: 0.55 },
    { type: "collector-fair", segment: "collector", cost: 0.65 },
  ] as const;

  for (const [index, fixture] of cases.entries()) {
    const control = createInitialGame(21_100 + index);
    control.finance.cash = 100;
    control.purchaseTrust = 50;
    const launched = reduceGame(control, {
      type: "RUN_BUSINESS_ACTION",
      action: fixture.type,
    });

    assert.equal(
      launched.finance.cash,
      Math.round((control.finance.cash - fixture.cost + Number.EPSILON) * 10_000) /
        10_000,
      fixture.type,
    );
    assert.deepEqual(launched.operations.records.at(-1), {
      id: "business-action-2",
      type: fixture.type,
      startedDay: 46,
      endsDay:
        46 +
        (fixture.type === "local-league"
          ? 21
          : fixture.type === "reprint-campaign"
            ? 30
            : 14),
      cost: fixture.cost,
      outcome: "active",
    });

    const active = reduceGame(launched, { type: "ADVANCE_DAYS", days: 1 });
    const baseline = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
    assert.ok(
      active.users[fixture.segment] > baseline.users[fixture.segment],
      `${fixture.type} should grow ${fixture.segment}`,
    );
    assert.ok(
      active.finance.today > baseline.finance.today,
      `${fixture.type} should add event revenue`,
    );
    assert.ok(
      active.purchaseTrust > baseline.purchaseTrust,
      `${fixture.type} should recover purchase trust`,
    );
  }
});

test("championships turn a healthy environment into growth and a hostile one into churn", () => {
  function prepare(seed: number, hostile: boolean): State {
    const state = createCampaignStart(seed);
    state.finance.cash = 10;
    if (hostile) {
      const [topId, ...otherIds] = state.activeThemeIds;
      state.themes[topId].share = 0.44;
      for (const themeId of otherIds) state.themes[themeId].share = 0.14;
      for (const themeId of state.activeThemeIds) {
        state.themes[themeId].unpleasantness = 90;
        state.themes[themeId].fatigue = 90;
      }
      state.currentTopThemeId = topId;
    } else {
      for (const themeId of state.activeThemeIds) {
        state.themes[themeId].unpleasantness = 5;
        state.themes[themeId].fatigue = 0;
      }
    }
    return state;
  }

  let selectedSeed: number | undefined;
  let healthyResult: State | undefined;
  let hostileResult: State | undefined;
  for (let seed = 1; seed <= 200; seed += 1) {
    const healthy = reduceGame(
      reduceGame(prepare(seed, false), {
        type: "RUN_BUSINESS_ACTION",
        action: "championship",
      }),
      { type: "ADVANCE_DAYS", days: 1 },
    );
    const hostile = reduceGame(
      reduceGame(prepare(seed, true), {
        type: "RUN_BUSINESS_ACTION",
        action: "championship",
      }),
      { type: "ADVANCE_DAYS", days: 1 },
    );
    if (
      healthy.operations.records[0].outcome === "success" &&
      hostile.operations.records[0].outcome === "backlash"
    ) {
      selectedSeed = seed;
      healthyResult = healthy;
      hostileResult = hostile;
      break;
    }
  }
  assert.ok(selectedSeed !== undefined && healthyResult && hostileResult);
  assert.ok(getChampionshipBacklashRisk(prepare(selectedSeed, false)) < 0.2);
  assert.ok(getChampionshipBacklashRisk(prepare(selectedSeed, true)) > 0.8);

  const healthyControl = reduceGame(prepare(selectedSeed, false), {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const hostileControl = reduceGame(prepare(selectedSeed, true), {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(healthyResult.users.casual > healthyControl.users.casual);
  assert.ok(hostileResult.users.tier < hostileControl.users.tier);
  assert.ok(hostileResult.users.casual < hostileControl.users.casual);

  const replay = reduceGame(
    reduceGame(prepare(selectedSeed, true), {
      type: "RUN_BUSINESS_ACTION",
      action: "championship",
    }),
    { type: "ADVANCE_DAYS", days: 1 },
  );
  assert.deepEqual(replay, hostileResult);
});

test("pack odds boost a release, then detection deterministically ends the boost", () => {
  const seed = 21_004;
  let control = createInitialGame(seed);
  let adjusted = reduceGame(control, {
    type: "RUN_BUSINESS_ACTION",
    action: "pack-odds",
  });
  control = advanceUntilDayOrDecisionHandlingBusinessEvents(control, 60);
  adjusted = advanceUntilDayOrDecisionHandlingBusinessEvents(adjusted, 60);
  control = submitFirstThree(control);
  adjusted = submitFirstThree(adjusted);
  assert.ok(adjusted.finance.today > control.finance.today);
  assert.ok(adjusted.finance.today < control.finance.today * 1.25);
  assert.equal(adjusted.operations.records.at(-1)?.outcome, "active");
  assert.equal(adjusted.operations.records.at(-1)?.appliedDay, 60);

  const overduePending = structuredClone(adjusted);
  const overdueRecord = overduePending.operations.records.at(-1)!;
  overdueRecord.outcome = "pending";
  delete overdueRecord.appliedDay;
  delete overdueRecord.resolvedDay;
  assert.throws(
    () => reduceGame(overduePending, { type: "ADVANCE_DAYS", days: 1 }),
    /overdue pending/i,
  );

  const detectedInput = structuredClone(adjusted);
  detectedInput.operations.records.at(-1)!.risk = 1;
  const cleanInput = structuredClone(adjusted);
  cleanInput.operations.records.at(-1)!.risk = 0;
  const detected = reduceGame(detectedInput, { type: "ADVANCE_DAYS", days: 1 });
  const clean = reduceGame(cleanInput, { type: "ADVANCE_DAYS", days: 1 });
  const nextControl = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(detected.operations.records.at(-1)?.outcome, "detected");
  assert.equal(clean.operations.records.at(-1)?.outcome, "clean");
  assert.ok(nextControl.purchaseTrust - detected.purchaseTrust > 9.9);
  assert.ok(clean.finance.today > nextControl.finance.today);
  assert.ok(detected.finance.today < clean.finance.today);

  const impossibleLateAction = createCampaignStart(21_005);
  impossibleLateAction.day = LAST_RELEASE_DAY;
  assert.throws(
    () =>
      reduceGame(impossibleLateAction, {
        type: "RUN_BUSINESS_ACTION",
        action: "pack-odds",
      }),
    /regular release|정기 발매/i,
  );
});

test("business actions fit inside the settlement window and close before the final ban", () => {
  const state = createCampaignStart(21_006);
  state.finance.cash = 10;

  state.day = 425;
  assert.equal(
    getBusinessActionAvailability(state, "animation-promotion").available,
    true,
  );
  state.day = 426;
  assert.equal(
    getBusinessActionAvailability(state, "animation-promotion").available,
    false,
  );

  state.day = 449;
  assert.equal(getBusinessActionAvailability(state, "pack-odds").available, true);
  state.day = LAST_RELEASE_DAY;
  assert.equal(getBusinessActionAvailability(state, "pack-odds").available, false);

  state.day = LAST_DECISION_DAY;
  for (const type of [
    "tv-cm",
    "animation-promotion",
    "championship",
    "store-tour",
    "pack-odds",
    "season-overhaul",
    "global-launch",
    "first-print-expansion",
  ] as const) {
    assert.equal(getBusinessActionAvailability(state, type).available, false);
  }
});

test("strategic projects snapshot their risk, use one campaign slot, and pay only on success", () => {
  const tooEarly = createInitialGame(21_007);
  assert.equal(
    getBusinessActionAvailability(tooEarly, "season-overhaul").available,
    false,
  );

  const ready = advanceThroughDecisions(tooEarly, 120);
  const profile = getStrategicProjectRiskProfile(ready, "season-overhaul");
  assert.ok(profile.risk >= 0.15 && profile.risk <= 0.85);
  assert.ok(profile.context.environmentHealth >= 0);
  assert.ok(profile.context.releaseQuality >= 0);

  const launched = reduceGame(ready, {
    type: "RUN_BUSINESS_ACTION",
    action: "season-overhaul",
  });
  const launchedRecord = launched.operations.records.at(-1)!;
  assert.equal(launchedRecord.outcome, "active");
  assert.equal(launchedRecord.risk, profile.risk);
  assert.deepEqual(launchedRecord.riskContext, profile.context);
  assert.match(
    getBusinessActionAvailability(launched, "global-launch").reason ?? "",
    /한 번|슬롯/,
  );

  const forcedSuccess = structuredClone(launched);
  forcedSuccess.operations.records.at(-1)!.risk = 0;
  const success = advanceThroughDecisions(forcedSuccess, 150);
  const successRecord = success.operations.records.at(-1)!;
  assert.equal(successRecord.outcome, "success");
  assert.equal(successRecord.resolvedDay, 150);
  assert.equal(successRecord.cashReturn, 6.5);

  const forcedFailure = structuredClone(launched);
  forcedFailure.operations.records.at(-1)!.risk = 1;
  const failure = advanceThroughDecisions(forcedFailure, 150);
  const failureRecord = failure.operations.records.at(-1)!;
  assert.equal(failureRecord.outcome, "backlash");
  assert.equal(failureRecord.resolvedDay, 150);
  assert.equal(failureRecord.cashReturn, undefined);
  assert.ok(success.finance.cash - failure.finance.cash > 6);
  assert.ok(success.purchaseTrust - failure.purchaseTrust > 14);
});

test("strategic failure odds respond to the environment, trust, and recent release state", () => {
  const baseline = advanceThroughDecisions(createInitialGame(21_009), 180);
  const strong = structuredClone(baseline);
  strong.purchaseTrust = 95;
  for (const themeId of strong.activeThemeIds) {
    strong.themes[themeId].unpleasantness = 0;
    strong.themes[themeId].fatigue = 0;
  }
  const weak = structuredClone(baseline);
  weak.purchaseTrust = 20;
  for (const themeId of weak.activeThemeIds) {
    weak.themes[themeId].unpleasantness = 100;
    weak.themes[themeId].fatigue = 100;
  }

  for (const type of [
    "season-overhaul",
    "global-launch",
    "first-print-expansion",
  ] as const) {
    const strongProfile = getStrategicProjectRiskProfile(strong, type);
    const weakProfile = getStrategicProjectRiskProfile(weak, type);
    assert.ok(strongProfile.risk < weakProfile.risk, type);
    assert.ok(weakProfile.risk - strongProfile.risk >= 0.2, type);
  }
});

test("first-print expansion unlocks only after a regular release is submitted", () => {
  let state = advanceThroughDecisions(createInitialGame(21_008), 179);
  assert.equal(state.day, 179);
  assert.equal(
    getBusinessActionAvailability(state, "first-print-expansion").available,
    false,
  );
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, 180);
  assert.equal(state.phase, "release-edit");
  assert.equal(
    getBusinessActionAvailability(state, "first-print-expansion").available,
    false,
  );
  state = submitFirstThree(state);
  assert.equal(
    getBusinessActionAvailability(state, "first-print-expansion").available,
    true,
  );
});

test("business dilemmas stop advancement without stealing scheduled decision gates", () => {
  const seed = 31_001;
  const initial = createInitialGame(seed);
  assert.equal(initial.day, 46);
  assert.equal(initial.operations.pendingEvent, null);
  assert.deepEqual(initial.operations.eventRecords, []);

  const offered = reduceGame(initial, { type: "ADVANCE_DAYS", days: 1_000 });
  assert.equal(offered.day, getInitialBusinessEventDay(seed));
  assert.ok(offered.day >= 52 && offered.day < 60);
  assert.equal(offered.phase, "running");
  assert.equal(offered.operations.pendingEvent?.appearedDay, offered.day);
  assert.equal(offered.operations.nextEventDay, null);
  assert.equal(offered.history.at(-1)?.day, offered.day);

  assert.deepEqual(
    reduceGame(offered, { type: "ADVANCE_DAYS", days: 100 }),
    offered,
    "a pending dilemma must halt multi-day advancement",
  );
  assert.throws(
    () => reduceGame(offered, {
      type: "RUN_BUSINESS_ACTION",
      action: "beginner-camp",
    }),
    /event|이벤트|결정/i,
  );
  assert.throws(
    () => reduceGame(offered, {
      type: "CHOOSE_BUSINESS_EVENT",
      eventId: "business-event-999",
      choice: "a",
    }),
    /pending business event|돌발|event/i,
  );

  const paid = structuredClone(offered);
  paid.finance.cash = 100;
  const chosen = choosePendingBusinessEvent(paid, "a");
  assert.equal(chosen.operations.pendingEvent, null);
  const nextEventDay = chosen.operations.nextEventDay;
  assert.ok(nextEventDay !== null);
  assert.ok(nextEventDay - chosen.day >= 14 && nextEventDay - chosen.day <= 22);
  assert.equal(isReleaseDay(nextEventDay), false);
  assert.equal(isBanDay(nextEventDay), false);

  const releaseGate = reduceGame(chosen, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(releaseGate.day, 60);
  assert.equal(releaseGate.phase, "release-edit");
  assert.equal(releaseGate.operations.pendingEvent, null);
});

test("both dilemma choices snapshot cost and strategy, then resolve on schedule", () => {
  const seed = Array.from({ length: 200 }, (_, index) => 31_100 + index).find(
    (candidate) => getInitialBusinessEventDay(candidate) <= 58,
  );
  assert.ok(seed !== undefined);
  const offered = advanceToPendingBusinessEvent(createInitialGame(seed));
  offered.finance.cash = 100;
  const pending = offered.operations.pendingEvent!;
  const branches: Record<"a" | "b", State> = {} as Record<"a" | "b", State>;
  const nextDays: number[] = [];

  for (const choiceId of ["a", "b"] as const) {
    const choice = getBusinessEventChoice(pending.type, choiceId);
    const beforeExpense = offered.finance.cumulativeExpenses;
    const chosen = choosePendingBusinessEvent(offered, choiceId);
    branches[choiceId] = chosen;
    nextDays.push(chosen.operations.nextEventDay!);

    assert.equal(chosen.operations.pendingEvent, null);
    assert.deepEqual(chosen.operations.strategy, applyBusinessStrategyDelta(
      offered.operations.strategy,
      choice.strategyDelta,
    ));
    assert.equal(
      chosen.finance.cash,
      Math.round((offered.finance.cash - choice.cost + Number.EPSILON) * 10_000) /
        10_000,
    );
    assert.equal(
      chosen.finance.cumulativeExpenses,
      Math.round((beforeExpense + choice.cost + Number.EPSILON) * 10_000) /
        10_000,
    );
    assert.deepEqual(chosen.operations.eventRecords.at(-1), {
      id: pending.id,
      type: pending.type,
      appearedDay: pending.appearedDay,
      choice: choiceId,
      cost: choice.cost,
      risk: choice.risk,
      resolutionDay: pending.appearedDay + choice.resolutionDelay,
      outcome: "pending",
    });
    assert.throws(
      () => reduceGame(chosen, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice: choiceId,
      }),
      /pending business event|돌발|event/i,
    );

    const oneDay = advanceBusinessEventResult(chosen, chosen.day + 1);
    const modifiers = getBusinessStrategyModifiers(chosen.operations.strategy);
    const expectedTrust = Math.round(
      (Math.min(
        90,
        chosen.purchaseTrust + 0.015 + modifiers.trustPerDay,
      ) + Number.EPSILON) * 10_000,
    ) / 10_000;
    assert.equal(oneDay.purchaseTrust, expectedTrust);

    const resolutionDay = chosen.operations.eventRecords.at(-1)!.resolutionDay;
    const beforeResult = advanceBusinessEventResult(chosen, resolutionDay - 1);
    assert.equal(beforeResult.operations.eventRecords[0].outcome, "pending");
    const resolved = advanceBusinessEventResult(beforeResult, resolutionDay);
    const record = resolved.operations.eventRecords[0];
    const expectedOutcome = getBusinessEventOutcome(
      resolved.seed,
      record.id,
      choice.risk,
    );
    assert.equal(record.outcome, expectedOutcome);
    assert.equal(record.resolvedDay, resolutionDay);
    const impact = getBusinessEventResult(
      record.type,
      record.choice,
      expectedOutcome,
    );
    const trustAfterImpact = Math.max(
      0,
      Math.min(100, beforeResult.purchaseTrust + impact.trustDelta),
    );
    const expectedResolvedTrust = isReleaseDay(resolutionDay) || isBanDay(resolutionDay)
      ? trustAfterImpact
      : Math.min(
          90,
          trustAfterImpact + 0.015 + modifiers.trustPerDay,
        );
    assert.equal(
      resolved.purchaseTrust,
      Math.round((expectedResolvedTrust + Number.EPSILON) * 10_000) / 10_000,
    );
    assert.equal(
      resolved.finance.todayOperatingCash,
      Math.round(
        (resolved.finance.cash - beforeResult.finance.cash + Number.EPSILON) *
          10_000,
      ) / 10_000,
      `${pending.type}/${choiceId} should report result cash in the daily KPI`,
    );
  }

  assert.equal(nextDays[0], nextDays[1], "choice must not reroll the event calendar");
  for (const segment of ["tier", "casual", "collector"] as const) {
    const left = advanceBusinessEventResult(branches.a, branches.a.day + 1);
    const right = advanceBusinessEventResult(branches.b, branches.b.day + 1);
    const leftRate = getBusinessStrategyModifiers(
      branches.a.operations.strategy,
    ).userRates[segment];
    const rightRate = getBusinessStrategyModifiers(
      branches.b.operations.strategy,
    ).userRates[segment];
    assert.equal(
      Math.sign(left.users[segment] - right.users[segment]),
      Math.sign(leftRate - rightRate),
      `${pending.type}/${segment}`,
    );
  }
});

test("business dilemma order is chunk-independent and uses all sixteen types first", () => {
  assert.equal(BUSINESS_EVENTS.length, 16);
  assert.equal(new Set(BUSINESS_EVENT_TYPES).size, 16);
  for (const definition of BUSINESS_EVENTS) {
    assert.equal(definition.choices.length, 2, definition.type);
    assert.ok(
      definition.choices.some((choice) => choice.cost === 0),
      `${definition.type} needs a no-cash fallback`,
    );
  }
  for (const seed of [1, 31_201, 0xffff_ffff]) {
    const firstCycle = Array.from(
      { length: 16 },
      (_, index) => getBusinessEventType(seed, index + 1),
    );
    assert.equal(new Set(firstCycle).size, 16);
    assert.deepEqual(new Set(firstCycle), new Set(BUSINESS_EVENT_TYPES));
  }

  const daily = playBusinessEvents(31_202, 16, 1);
  const jumped = playBusinessEvents(31_202, 16, 1_000);
  assert.deepEqual(jumped, daily);
  assert.equal(
    new Set(jumped.operations.eventRecords.map((record) => record.type)).size,
    16,
  );
  for (let index = 0; index < jumped.operations.eventRecords.length; index += 1) {
    const record = jumped.operations.eventRecords[index];
    assert.equal(isReleaseDay(record.appearedDay), false);
    assert.equal(isBanDay(record.appearedDay), false);
    if (index > 0) {
      const gap = record.appearedDay -
        jumped.operations.eventRecords[index - 1].appearedDay;
      assert.ok(gap >= 14 && gap <= 22, `${record.id} gap ${gap}`);
    }
  }
});

test("waiting on the rival TCG can deterministically succeed or backfire", () => {
  const wait = BUSINESS_EVENT_BY_TYPE["rival-tcg-launch"].choices[1];
  assert.equal(wait.id, "b");
  const fixtures = new Map<"success" | "backlash", number>();
  for (let seed = 1; seed <= 1_000 && fixtures.size < 2; seed += 1) {
    if (getBusinessEventType(seed, 1) !== "rival-tcg-launch") continue;
    const outcome = getBusinessEventOutcome(seed, "business-event-1", wait.risk);
    if (!fixtures.has(outcome)) fixtures.set(outcome, seed);
  }
  assert.deepEqual(new Set(fixtures.keys()), new Set(["success", "backlash"]));

  for (const [expectedOutcome, seed] of fixtures) {
    let state = advanceToPendingBusinessEvent(createInitialGame(seed));
    assert.equal(state.operations.pendingEvent?.id, "business-event-1");
    assert.equal(state.operations.pendingEvent?.type, "rival-tcg-launch");
    state.finance.cash = 100;
    state = choosePendingBusinessEvent(state, "b");
    const resolutionDay = state.operations.eventRecords[0].resolutionDay;
    assert.equal(state.operations.eventRecords[0].outcome, "pending");
    state = advanceBusinessEventResult(state, resolutionDay);
    assert.equal(state.operations.eventRecords[0].outcome, expectedOutcome);
    assert.equal(state.operations.eventRecords[0].resolvedDay, resolutionDay);
  }

  assert.equal(wait.results.success.headline, "경쟁작 자멸");
  assert.equal(wait.results.backlash.headline, "경쟁작 안착");
});
