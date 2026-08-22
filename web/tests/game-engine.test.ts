import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  BUSINESS_ACTIONS,
  BUSINESS_ACTION_DAILY_REVENUE_CAP,
  HANDOVER_STARTER_BUSINESS_ACTION_TYPES,
  getBusinessActionAvailability,
  getBusinessActionDailyGrossRevenue,
  getBusinessActionProjectedDirectCash,
  getBusinessActionProjectedDirectGrossRevenue,
  getBusinessEnvironmentHealth,
  getStackedBusinessActionDailyGrossRevenue,
  getStrategicProjectRiskProfile,
} from "../app/game/business-actions.ts";
import {
  BUSINESS_EVENTS,
  BUSINESS_EVENT_BY_TYPE,
  BUSINESS_EVENT_MAX_INTERVAL,
  BUSINESS_EVENT_MIN_INTERVAL,
  BUSINESS_EVENT_TYPES,
  FIRST_BUSINESS_EVENT_DAY,
  RECURRING_BUSINESS_EVENT_START_DAY,
  applyBusinessStrategyDelta,
  getBusinessEventChoice,
  getBusinessEventOutcome,
  getBusinessEventResult,
  getBusinessEventType,
  getFirstRecurringBusinessEventDay,
  getBusinessStrategyModifiers,
  getInitialBusinessEventDay,
} from "../app/game/business-events.ts";
import {
  BAN_INTERVAL,
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  FIRST_RELEASE_DAY,
  LAST_BAN_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  REPRINT_PACK_CANDIDATE_COUNT,
  RESTRICTION_REPORT_DELAY_DAYS,
  SETTLEMENT_START_DAY,
  TUTORIAL_END_DAY,
} from "../app/game/campaign.ts";
import { getCommunityHeat } from "../app/game/daily-community.ts";
import { ENVIRONMENT_HEALTH_MODEL } from "../app/game/environment-health.ts";
import { META_ADOPTION_SHARE_FLOOR } from "../app/game/meta-tiers.ts";
import {
  DAILY_TOP_CUT_SLOTS,
  PLACEMENT_WINDOW_DAYS,
  getDailyTopCutPlacements,
  getPlacementTier,
  getRecentPlacementReport,
} from "../app/game/placement-meta.ts";
import { getThemeTournamentViability } from "../app/game/theme-viability.ts";
import {
  getDailyOperatingCost,
  getMarketDivergenceLag,
  getMonthlyOperatingCost,
  getOperatingRunwayMonths,
  getRevenueChangeSignal,
  OPERATING_COST_START_DAY,
  RELEASE_SALES_DAILY_DECAY_MULTIPLIER,
} from "../app/game/finance.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionHistoricalOutcome,
  getRestrictionPolicyProfile,
} from "../app/game/restriction-policy.ts";
import {
  createCampaignStart,
  createFirstBanGame,
  createInitialGame,
  canProposeSupport,
  formatCommunityEvent,
  getCommittedSupportCount,
  getExpectedTier,
  getNextBanDay,
  getNextReleaseDay,
  getNewThemeExpectedPower,
  getNewThemeLaunchPower,
  getPrologueReleaseSelections,
  getPrologueRestrictionChanges,
  getProlongedSoftPolicyTrustLoss,
  isBanDay,
  isPrologueReleaseSelection,
  isPrologueRestrictionChange,
  isReleaseDay,
  reduceGame,
} from "../app/game/engine.ts";

type State = ReturnType<typeof createInitialGame>;
type Adjustment = -3 | -2 | -1 | 0 | 1 | 2 | 3;
const SECOND_BAN_DAY = FIRST_BAN_DAY + BAN_INTERVAL;
type ReleaseOptionFixture = NonNullable<
  State["releaseSlate"]
>["options"][number];

function completeReleaseOptions(
  state: State,
  preferred: readonly ReleaseOptionFixture[] = [],
): ReleaseOptionFixture[] {
  assert.ok(state.releaseSlate);
  const all = state.releaseSlate.options;
  const usesGenericRules = all.some((option) => option.kind === "generic");
  const targetCount = usesGenericRules ? 4 : 3;
  const chosen: ReleaseOptionFixture[] = [];
  for (const option of preferred) {
    if (!chosen.some((candidate) => candidate.id === option.id)) {
      chosen.push(option);
    }
  }
  if (usesGenericRules) {
    for (const kind of ["new-theme", "support", "generic"] as const) {
      if (chosen.some((option) => option.kind === kind)) continue;
      const option = all.find((candidate) => candidate.kind === kind);
      assert.ok(option);
      chosen.push(option);
    }
  }
  for (const option of all) {
    if (chosen.length >= targetCount) break;
    if (!chosen.some((candidate) => candidate.id === option.id)) {
      chosen.push(option);
    }
  }
  assert.equal(chosen.length, targetCount);
  return chosen;
}

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

function advanceToNextRegularReleaseHandlingBusinessEvents(
  state: State,
): State {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    next = advanceToNextReleaseHandlingBusinessEvents(next);
    if (next.releaseSlate?.releaseKind === "regular") return next;
    next = submitFirstThree(next);
  }
  throw new Error("A regular release review did not appear before campaign end.");
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
  while (next.day < FIRST_RELEASE_DAY) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: FIRST_RELEASE_DAY - next.day,
      });
    }
  }
  assert.equal(next.day, FIRST_RELEASE_DAY);
  assert.equal(next.phase, "release-edit");
  assert.ok(next.releaseSlate);
  return next;
}

function advanceRawToFirstBan(seed: number): State {
  const state = createFirstBanGame(seed);
  assert.equal(state.day, FIRST_BAN_DAY);
  assert.equal(state.phase, "ban-edit");
  return state;
}

function submitFirstThree(
  state: State,
  adjustments: readonly Adjustment[] = [0, 0, 0],
): State {
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.ok(adjustments.length === 3 || adjustments.length === 4);
  const options = completeReleaseOptions(state);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: options.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: adjustments[index] ?? 0,
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
  assert.ok(shares.every((share) => share >= META_ADOPTION_SHARE_FLOOR - 1e-9));
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

test("uses releases through DAY 450 and 40-day restriction reviews through DAY 440", () => {
  const releaseDays = Array.from(
    { length: CAMPAIGN_END_DAY + 1 },
    (_, index) => index,
  ).filter(isReleaseDay);
  const banDays = Array.from({ length: CAMPAIGN_END_DAY + 1 }, (_, index) => index).filter(
    isBanDay,
  );

  assert.equal(releaseDays.length, 23);
  assert.equal(releaseDays[0], FIRST_RELEASE_DAY);
  assert.equal(releaseDays.at(-1), LAST_RELEASE_DAY);
  assert.deepEqual(
    banDays,
    Array.from(
      { length: (LAST_BAN_DAY - FIRST_BAN_DAY) / BAN_INTERVAL + 1 },
      (_, index) => FIRST_BAN_DAY + index * BAN_INTERVAL,
    ),
  );
  assert.equal(banDays.at(-1), LAST_BAN_DAY);
  assert.equal(LAST_DECISION_DAY, LAST_RELEASE_DAY);
  assert.equal(SETTLEMENT_START_DAY, 451);
  assert.equal(getNextReleaseDay(0), FIRST_RELEASE_DAY);
  assert.equal(getNextReleaseDay(FIRST_RELEASE_DAY), 30);
  assert.equal(getNextBanDay(FIRST_BAN_DAY - 1), FIRST_BAN_DAY);
  assert.equal(getNextBanDay(FIRST_BAN_DAY), FIRST_BAN_DAY + BAN_INTERVAL);
  assert.equal(releaseDays.some((day) => isBanDay(day)), false);
});

test("creates a fixed DAY 0 emergency review with five themes and 10,000 users", () => {
  const state = createCampaignStart(17);
  const otherSeed = createCampaignStart(999_017);
  assert.equal(state.day, FIRST_BAN_DAY);
  assert.equal(state.phase, "ban-edit");
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
  assert.deepEqual(state.history, []);
  const published = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  assert.deepEqual(published.history.map((entry) => entry.day), [0]);
  assert.equal(published.history[0].totalUsers, 10_000);
  assert.equal(published.history[0].cash, published.finance.cash);
  assert.equal(
    published.history[0].operatingCash,
    published.finance.todayOperatingCash,
  );
  assert.equal(
    published.history[0].environmentHealth,
    getBusinessEnvironmentHealth(published),
  );
  assert.equal(
    published.history[0].environmentHealthModel,
    ENVIRONMENT_HEALTH_MODEL,
  );
  assert.equal(published.history[0].purchaseTrust, published.purchaseTrust);
  assert.deepEqual(
    published.history[0].winRates,
    Object.fromEntries(
      published.activeThemeIds.map((themeId) => [
        themeId,
        published.themes[themeId].winRate,
      ]),
    ),
  );
  assert.deepEqual(
    Object.keys(published.history[0].topCutPlacements ?? {}).sort(),
    [...published.activeThemeIds].sort(),
  );
  assert.equal(
    Object.values(published.history[0].topCutPlacements ?? {}).reduce(
      (sum, placements) => sum + placements,
      0,
    ),
    DAILY_TOP_CUT_SLOTS,
  );
  const advanced = reduceGame(published, { type: "ADVANCE_DAYS", days: 1 });
  assert.notStrictEqual(
    advanced.history[0].winRates,
    published.history[0].winRates,
  );
  assert.notStrictEqual(
    advanced.history[0].topCutPlacements,
    published.history[0].topCutPlacements,
  );
  assert.deepEqual(state.community, []);
  assert.equal(
    state.releaseHistory.filter((batch) => batch.releaseKind !== "baseline").length,
    0,
  );
});

test("stops the fixed handover at a fully authored first restriction review", () => {
  const state = createFirstBanGame(1000);

  assert.equal(state.day, FIRST_BAN_DAY);
  assert.equal(state.phase, "ban-edit");
  assert.equal(state.handoverComplete, false);
  assert.equal(state.seed, 1000);
  assert.equal(
    state.releaseHistory.filter((batch) => batch.releaseKind !== "baseline").length,
    0,
  );

  const unchanged = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: {},
  });
  assert.equal(unchanged.phase, "running");
  assert.equal(unchanged.seed, 1000);
});

test("DAY 7 handover requires the emergency restriction and observation week", () => {
  const review = createFirstBanGame(1_001);
  assert.throws(
    () => reduceGame(review, { type: "COMPLETE_HANDOVER" }),
    /DAY 0 emergency restriction and observation through DAY 7/,
  );

  let published = reduceGame(review, { type: "SUBMIT_BAN", changes: {} });
  assert.throws(
    () => reduceGame(published, { type: "COMPLETE_HANDOVER" }),
    /observation through DAY 7/,
  );
  published = reduceGame(published, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(published.day, TUTORIAL_END_DAY);
  const completed = reduceGame(published, { type: "COMPLETE_HANDOVER" });
  assert.equal(completed.day, TUTORIAL_END_DAY);
  assert.equal(completed.phase, "running");
  assert.equal(completed.handoverComplete, true);
  assert.throws(
    () => reduceGame(completed, { type: "COMPLETE_HANDOVER" }),
    /DAY 0 emergency restriction and observation through DAY 7/,
  );
});

test("completed player guidance starts a free handover and advances past DAY 7", () => {
  const review = createCampaignStart(1_003, { skipHandover: true });
  assert.equal(review.handoverComplete, true);

  let running = reduceGame(review, {
    type: "SUBMIT_BAN",
    changes: {},
    campaignSeed: 9_001,
  });
  running = reduceGame(running, { type: "ADVANCE_DAYS", days: 9 });

  assert.equal(running.day, 9);
  assert.equal(running.phase, "running");
  assert.equal(running.handoverComplete, true);
  assert.equal(running.seed, 9_001);
});

test("a mostly forbidden theme records zero new placements while its rolling tier remains", () => {
  const state = createInitialGame(80_823);
  const themeId = state.currentTopThemeId;
  const content = THEMES.find((theme) => theme.id === themeId);
  assert.ok(content);
  const runtime = state.themes[themeId];
  const releasedParts = content.parts.filter((part) =>
    runtime.releasedPartIds.includes(part.id)
  );
  assert.equal(releasedParts.length, 5);

  for (const part of releasedParts.slice(0, 2)) {
    runtime.legalLimits[part.id] = 0;
  }
  assert.equal(
    getThemeTournamentViability(content, runtime).collapsed,
    false,
  );
  runtime.legalLimits[releasedParts[2].id] = 0;
  assert.deepEqual(getThemeTournamentViability(content, runtime), {
    bannedPartCount: 3,
    collapsed: true,
    releasedPartCount: 5,
  });

  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const today = next.history.at(-1);
  assert.ok(today);
  assert.equal(today.day, state.day + 1);
  const todayPlacements = getDailyTopCutPlacements(today, next.seed);
  assert.equal(todayPlacements[themeId], 0);
  assert.equal(
    Object.values(todayPlacements).reduce((sum, count) => sum + count, 0),
    DAILY_TOP_CUT_SLOTS,
  );

  const rollingReport = getRecentPlacementReport(
    next.history,
    next.seed,
    next.day,
  );
  assert.notEqual(
    getPlacementTier(
      rollingReport.themes[themeId]?.placementShare ?? 0,
    ).tier,
    "Tier Out",
  );

  next.themes[themeId].legalLimits[releasedParts[2].id] = 3;
  assert.equal(
    getThemeTournamentViability(content, next.themes[themeId]).collapsed,
    false,
  );
});

test("an impossible all-collapsed field records an empty named top cut without crashing", () => {
  const state = createInitialGame(80_824);
  for (const themeId of state.activeThemeIds) {
    const content = THEMES.find((theme) => theme.id === themeId);
    assert.ok(content);
    const runtime = state.themes[themeId];
    const releasedParts = content.parts.filter((part) =>
      runtime.releasedPartIds.includes(part.id)
    );
    for (const part of releasedParts.slice(0, 3)) {
      runtime.legalLimits[part.id] = 0;
    }
  }

  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const today = next.history.at(-1);
  assert.ok(today);
  const placements = getDailyTopCutPlacements(today, next.seed);
  assert.equal(
    Object.values(placements).reduce((sum, count) => sum + count, 0),
    0,
  );
  assert.ok(Object.values(placements).every((count) => count === 0));
});

test("soft restriction reviews preserve purchase trust until severe neglect persists", () => {
  const state = createCampaignStart(60_225);
  state.day = 120;
  const themeId = state.currentTopThemeId;
  const partId = THEMES.find((theme) => theme.id === themeId)?.parts[0]?.id;
  assert.ok(partId);
  const runtime = state.themes[themeId];
  runtime.share = 0.36;
  runtime.previousWeekShare = 0.2;
  runtime.winRate = 0.59;
  runtime.unpleasantness = 90;
  runtime.counterAdoption = 0.35;

  const profile = getRestrictionPolicyProfile(state, {});
  assert.equal(profile.quality, "narrow");
  assert.equal(getProlongedSoftPolicyTrustLoss(state, profile), 0);

  for (const day of [40, 80]) {
    state.community.push({
      id: `soft-policy-${day}`,
      day,
      category: "restriction",
      type: "restriction-applied",
      themeId,
      partId,
      value: 2,
      previousValue: 3,
      body: "",
    });
  }
  assert.equal(getProlongedSoftPolicyTrustLoss(state, profile), 2);

  runtime.share = 0.12;
  runtime.previousWeekShare = 0.12;
  runtime.winRate = 0.5;
  runtime.unpleasantness = 10;
  runtime.counterAdoption = 0;
  assert.equal(getProlongedSoftPolicyTrustLoss(state, profile), 0);
});

test("mints and persists a deterministic mandate seed after the first free restriction", () => {
  const atFirstBan = createFirstBanGame(1000);
  const campaignSeed = 0xdecafbad;
  const command = {
    type: "SUBMIT_BAN" as const,
    changes: {},
    campaignSeed,
  };

  const assigned = reduceGame(atFirstBan, command);
  const replayed = reduceGame(atFirstBan, command);

  assert.equal(assigned.day, FIRST_BAN_DAY);
  assert.equal(assigned.phase, "running");
  assert.equal(assigned.seed, campaignSeed);
  assert.equal(
    assigned.operations.nextEventDay,
    getInitialBusinessEventDay(campaignSeed),
  );
  assert.deepEqual(assigned, replayed);

  assert.throws(
    () => reduceGame(atFirstBan, { ...command, campaignSeed: -1 }),
    /uint32/,
  );
  assert.throws(
    () => reduceGame(createInitialGame(1000), command),
    /regular restriction day/,
  );
});

test("overpowered release portfolios sell harder while immediately damaging trust", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(10_616));
  const balanced = reduceGame(submitFirstThree(atRelease, [0, 0, 0]), {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const overpowered = reduceGame(submitFirstThree(atRelease, [3, 3, 3]), {
    type: "ADVANCE_DAYS",
    days: 1,
  });

  assert.ok(overpowered.finance.today > balanced.finance.today);
  assert.ok(overpowered.purchaseTrust < balanced.purchaseTrust);
  // Keyword counters can make a strong slate healthy or unhealthy depending
  // on what it answers, so raw tuning no longer predetermines environment.
});

test("exposes deterministic guided choices that replay through the ordinary reducer", () => {
  const expected = createInitialGame(1000);
  let guided = createCampaignStart(1000);

  assert.throws(
    () => getPrologueReleaseSelections(guided),
    /DAY 10 review/,
  );
  assert.equal(guided.day, FIRST_BAN_DAY);
  assert.equal(guided.phase, "ban-edit");
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
    isPrologueRestrictionChange(guided, guidedPartId, guidedLimit),
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
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(guided.day, TUTORIAL_END_DAY);
  assert.equal(guided.handoverComplete, false);
  guided = reduceGame(guided, { type: "COMPLETE_HANDOVER" });
  assert.deepEqual(guided, expected);

  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 3 });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(guided.day, FIRST_RELEASE_DAY);
  const selections = getPrologueReleaseSelections(guided);
  assert.equal(selections.length, 4);
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

  const released = reduceGame(guided, { type: "SUBMIT_RELEASE", selections });
  assert.equal(released.releaseHistory.at(-1)?.day, FIRST_RELEASE_DAY);
});

test("replays the DAY 0 restriction and observation week into DAY 7", () => {
  const raw = createCampaignStart(1000);
  const fullPrologue = createInitialGame(1000);
  const skippedPrologue = createInitialGame(1000);

  assert.deepEqual(fullPrologue, skippedPrologue);
  assert.equal(raw.day, FIRST_BAN_DAY);
  assert.equal(raw.phase, "ban-edit");
  assert.equal(fullPrologue.day, TUTORIAL_END_DAY);
  assert.equal(fullPrologue.phase, "running");
  assert.equal(fullPrologue.releaseSlate, null);
  assert.deepEqual(fullPrologue.operations.records, []);
  assert.equal(fullPrologue.finance.cumulativeExpenses, 0);
  assert.equal(fullPrologue.activeThemeIds.length, 5);
  assert.equal(
    fullPrologue.releaseHistory.filter((batch) => batch.releaseKind !== "baseline").length,
    0,
  );
  assert.equal(fullPrologue.handoverComplete, true);
  const prologueRestrictionEvents = fullPrologue.community.filter(
    (event) =>
      event.day === FIRST_BAN_DAY &&
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
    FIRST_BAN_DAY,
  );
  assert.equal(prologueProfile.quality, "balanced");
  assert.equal(prologueProfile.upperMeaningfulCuts, 2);
  assert.equal(prologueProfile.tier2MeaningfulCuts, 2);
  assert.deepEqual(
    fullPrologue.history.map((entry) => entry.day),
    Array.from({ length: TUTORIAL_END_DAY + 1 }, (_, index) => index),
  );
  assert.equal(
    fullPrologue.history.filter((entry) => entry.day === FIRST_BAN_DAY).length,
    1,
  );
  const historyByDay = new Map(
    fullPrologue.history.map((entry) => [entry.day, entry]),
  );
  assert.notDeepEqual(
    historyByDay.get(FIRST_BAN_DAY + 1)?.shares,
    historyByDay.get(FIRST_BAN_DAY)?.shares,
  );
  assert.deepEqual(
    fullPrologue.history.map((entry) => entry.revenue),
    fullPrologue.recentRevenue.slice(-fullPrologue.history.length),
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
  const control = reduceGame(createInitialGame(7120), {
    type: "ADVANCE_DAYS",
    days: 1,
  });
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

  assert.equal(initial.day, TUTORIAL_END_DAY, "the reducer must not mutate its input");
  assert.equal(initial.phase, "running");

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(
    state,
    FIRST_RELEASE_DAY,
  );
  assert.equal(state.day, FIRST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  const releaseBlocked = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: 100,
  });
  assert.equal(releaseBlocked.day, FIRST_RELEASE_DAY);
  assert.equal(releaseBlocked.phase, "release-edit");
  state = submitFirstThree(releaseBlocked);

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 30);
  state = submitFirstThree(state);
  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, SECOND_BAN_DAY);
  assert.equal(state.day, SECOND_BAN_DAY);
  assert.equal(state.phase, "ban-edit");
  const banBlocked = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(banBlocked.day, SECOND_BAN_DAY);
  state = reduceGame(banBlocked, { type: "SUBMIT_BAN", changes: {} });

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 50);
  assert.equal(state.day, 50);
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
    const selected = completeReleaseOptions(state, [requested]);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option, index) => ({
        optionId: option.id,
        powerAdjustment: ([-1, 0, 1, 0] as const)[index],
      })),
    });
    state = advanceUntilDayOrDecisionHandlingBusinessEvents(
      state,
      SECOND_BAN_DAY,
    );
    if (state.phase === "release-edit") {
      state = submitFirstThree(state);
      state = advanceUntilDayOrDecisionHandlingBusinessEvents(
        state,
        SECOND_BAN_DAY,
      );
    }
    assert.equal(state.phase, "ban-edit");
    state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
    state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 50);
    assert.equal(state.day, 50);
    assert.equal(state.phase, "release-edit");
    return submitFirstThree(state);
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
        event.day === FIRST_BAN_DAY + 1 &&
        event.type === "restriction-demand" &&
        event.partId === starter.id,
    ),
  );
});

test("hands over the live emergency environment after DAY 7 observation", () => {
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

  assert.equal(state.day, TUTORIAL_END_DAY);
  assert.equal(state.phase, "running");
  assert.equal(state.handoverComplete, true);
  assert.ok(totalUsers >= 9_500);
  assert.ok(topShare < 0.29);
  assert.ok(health >= 50 && health < 60);
  assert.ok(Math.max(...runtimes.map((runtime) => runtime.fatigue)) < 35);
  assert.ok(state.finance.today > 0);
  assert.ok(state.finance.rolling30 > state.finance.today);

  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.notEqual(
    Math.max(...next.activeThemeIds.map((themeId) => next.themes[themeId].share)),
    topShare,
  );
});

test("ends immediately at zero users while one remaining user can continue", () => {
  const oneUser = createInitialGame(303);
  oneUser.users = { tier: 1, casual: 0, collector: 0 };
  const continued = reduceGame(oneUser, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(continued.day, TUTORIAL_END_DAY + 1);
  assert.equal(continued.phase, "running");

  const zeroUsers = createInitialGame(303);
  zeroUsers.users = { tier: 0, casual: 0, collector: 0 };
  const ended = reduceGame(zeroUsers, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(ended.day, TUTORIAL_END_DAY + 1);
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
        event.day === FIRST_BAN_DAY &&
        event.type === "restriction-no-change" &&
        event.themeId === targetId &&
        event.previousValue === event.value,
    ),
  );

  const coreWithoutShock = structuredClone(coreDecision);
  for (const event of coreWithoutShock.community) {
    if (
      event.day === FIRST_BAN_DAY &&
      event.themeId === targetId &&
      event.partId === "cycle-gate" &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction")
    ) {
      event.day = FIRST_BAN_DAY - 1;
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

test("threat coverage requires impact proportionate to decision-day pressure", () => {
  const state = createInitialGame(13_504);
  state.day = SECOND_BAN_DAY;
  state.phase = "ban-edit";
  const threatThemeId = "machine-revolution";
  const otherThemeIds = state.activeThemeIds.filter(
    (themeId) => themeId !== threatThemeId,
  );
  const otherShare = 0.7 / otherThemeIds.length;
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.share = themeId === threatThemeId ? 0.3 : otherShare;
    runtime.previousWeekShare = runtime.share;
    runtime.winRate = themeId === threatThemeId ? 0.56 : 0.5;
    for (const partId of runtime.releasedPartIds) {
      runtime.legalLimits[partId] = 3;
    }
  }
  const shallowPartId = "machine-revolution-support-1-1";
  state.themes[threatThemeId].releasedPartIds.push(shallowPartId);
  state.themes[threatThemeId].legalLimits[shallowPartId] = 3;

  const shallow = getRestrictionPolicyProfile(state, {
    [shallowPartId]: 2,
  });
  assert.deepEqual(shallow.threatThemeIds, [threatThemeId]);
  assert.equal(shallow.meaningfulCutCount, 1);
  assert.ok(
    shallow.appliedThreatImpactByTheme[threatThemeId]! <
      shallow.requiredThreatImpactByTheme[threatThemeId]!,
  );
  assert.deepEqual(shallow.unaddressedThreatThemeIds, [threatThemeId]);
  assert.equal(shallow.coverageComplete, false);
  assert.equal(shallow.quality, "narrow");

  const sufficient = getRestrictionPolicyProfile(state, {
    [shallowPartId]: 2,
    "machine-revolution-ignition-drone": 2,
  });
  assert.ok(
    sufficient.appliedThreatImpactByTheme[threatThemeId]! >=
      sufficient.requiredThreatImpactByTheme[threatThemeId]!,
  );
  assert.deepEqual(sufficient.unaddressedThreatThemeIds, []);
  assert.equal(sufficient.coverageComplete, true);
  assert.equal(sufficient.quality, "balanced");
});

test("healthy no-change and complete threat coverage reject chaser pre-cuts", () => {
  const state = createInitialGame(13_505);
  state.day = SECOND_BAN_DAY;
  state.phase = "ban-edit";
  const fixedShares: Partial<Record<string, number>> = {
    cycle: 0.24,
    "white-night": 0.19,
    "machine-revolution": 0.18,
    abyss: 0.2,
    ironblood: 0.19,
  };
  const remainingIds = state.activeThemeIds.filter(
    (themeId) => fixedShares[themeId] === undefined,
  );
  const assignedShare = Object.values(fixedShares).reduce<number>(
    (sum, share) => sum + (share ?? 0),
    0,
  );
  const remainingShare = remainingIds.length > 0
    ? (1 - assignedShare) / remainingIds.length
    : 0;
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.share = fixedShares[themeId] ?? remainingShare;
    runtime.previousWeekShare = runtime.share;
    runtime.winRate = themeId === "cycle"
      ? 0.51
      : themeId === "abyss"
        ? 0.56
        : 0.5;
    for (const partId of runtime.releasedPartIds) {
      runtime.legalLimits[partId] = 3;
    }
  }

  const healthy = structuredClone(state);
  const equalShare = 1 / healthy.activeThemeIds.length;
  for (const themeId of healthy.activeThemeIds) {
    healthy.themes[themeId].share = equalShare;
    healthy.themes[themeId].previousWeekShare = equalShare;
    healthy.themes[themeId].winRate = 0.5;
  }
  const noChange = getRestrictionPolicyProfile(healthy, {});
  assert.deepEqual(noChange.threatThemeIds, []);
  assert.equal(noChange.coverageComplete, true);
  assert.equal(noChange.quality, "balanced");

  const missedThreat = getRestrictionPolicyProfile(state, {
    "cycle-gate": 2,
  });
  assert.deepEqual(missedThreat.threatThemeIds.sort(), ["abyss", "cycle"]);
  assert.deepEqual(missedThreat.unaddressedThreatThemeIds, ["abyss"]);
  assert.equal(missedThreat.coverageComplete, false);
  assert.equal(missedThreat.quality, "narrow");

  const complete = getRestrictionPolicyProfile(state, {
    "cycle-gate": 2,
    "abyss-bait": 2,
  });
  assert.deepEqual(complete.unaddressedThreatThemeIds, []);
  assert.deepEqual(complete.preemptiveCutThemeIds, []);
  assert.equal(complete.coverageComplete, true);
  assert.equal(complete.quality, "balanced");

  const preemptive = getRestrictionPolicyProfile(state, {
    "cycle-gate": 2,
    "abyss-bait": 2,
    "machine-revolution-assembly-line": 2,
  });
  assert.deepEqual(preemptive.unaddressedThreatThemeIds, []);
  assert.deepEqual(preemptive.preemptiveCutThemeIds, ["machine-revolution"]);
  assert.equal(preemptive.coverageComplete, false);
  assert.equal(preemptive.quality, "incomplete");
});

test("restriction quality covers every clear threat without preemptive chaser cuts", () => {
  let atGate = createInitialGame(13_505);
  while (
    !(
      atGate.phase === "ban-edit" &&
      atGate.day - FIRST_BAN_DAY >= 90
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
    } else if (
      atGate.phase === "ban-edit" &&
      atGate.day - FIRST_BAN_DAY < 90
    ) {
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

  const healthyThemeIds = atGate.activeThemeIds.filter(
    (themeId) => themeId !== tier1ThemeId && themeId !== tier2ThemeId,
  );
  assert.ok(healthyThemeIds.length >= 3);
  const ordinaryShare = 0.39 / (healthyThemeIds.length - 2);
  for (const themeId of atGate.activeThemeIds) {
    const runtime = atGate.themes[themeId];
    runtime.share = ordinaryShare;
    runtime.previousWeekShare = ordinaryShare;
    runtime.winRate = 0.5;
  }
  for (const [themeId, share] of [
    [tier1ThemeId, 0.24],
    [healthyThemeIds[0], 0.14],
    [healthyThemeIds[1], 0.13],
    [tier2ThemeId, 0.1],
  ] as const) {
    atGate.themes[themeId].share = share;
    atGate.themes[themeId].previousWeekShare = share;
  }
  atGate.themes[tier1ThemeId].winRate = 0.51;
  atGate.themes[tier2ThemeId].winRate = 0.56;

  const healthyNoChange = structuredClone(atGate);
  const equalShare = 1 / healthyNoChange.activeThemeIds.length;
  for (const themeId of healthyNoChange.activeThemeIds) {
    const runtime = healthyNoChange.themes[themeId];
    runtime.share = equalShare;
    runtime.previousWeekShare = equalShare;
    runtime.winRate = 0.5;
    for (const partId of runtime.releasedPartIds) {
      runtime.legalLimits[partId] = 3;
    }
  }
  const healthyNoChangeProfile = getRestrictionPolicyProfile(
    healthyNoChange,
    {},
  );
  assert.equal(healthyNoChangeProfile.quality, "balanced");
  assert.deepEqual(healthyNoChangeProfile.threatThemeIds, []);
  assert.equal(healthyNoChangeProfile.coverageComplete, true);

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
      event.day === FIRST_BAN_DAY &&
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
  assert.deepEqual(singleProfile.threatThemeIds.sort(), [
    tier1ThemeId,
    tier2ThemeId,
  ].sort());
  assert.deepEqual(singleProfile.unaddressedThreatThemeIds, [tier2ThemeId]);
  assert.deepEqual(singleProfile.preemptiveCutThemeIds, []);
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
  assert.deepEqual(draftProfile.unaddressedThreatThemeIds, []);
  assert.deepEqual(draftProfile.preemptiveCutThemeIds, []);

  const preemptivePart = cuttableParts(healthyThemeIds[0])[0];
  assert.ok(preemptivePart);
  const preemptiveProfile = getRestrictionPolicyProfile(atGate, {
    ...balancedChanges,
    [preemptivePart.id]: 1,
  });
  assert.equal(preemptiveProfile.quality, "incomplete");
  assert.equal(preemptiveProfile.coverageComplete, false);
  assert.deepEqual(preemptiveProfile.unaddressedThreatThemeIds, []);
  assert.deepEqual(preemptiveProfile.preemptiveCutThemeIds, [
    healthyThemeIds[0],
  ]);
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
  assert.equal(
    liftOnly.purchaseTrust,
    atGate.purchaseTrust,
    "lifting an old restriction should preserve owner confidence",
  );
  assert.ok(balanced.purchaseTrust > cutsOnly.purchaseTrust);
  assert.ok(balanced.purchaseTrust < atGate.purchaseTrust);
  const balancedTrustLoss = atGate.purchaseTrust - balanced.purchaseTrust;
  assert.ok(
    balancedTrustLoss >= 8,
    "a sound but severe list should still create a material ownership shock",
  );
  assert.ok(balancedTrustLoss <= 17);

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
  const base = reduceGame(
    submitFirstThree(advanceToFirstRelease(createInitialGame(13_506))),
    { type: "ADVANCE_DAYS", days: 1 },
  );
  const targetThemeId = base.activeThemeIds[0];
  const targetContent = THEMES.find((theme) => theme.id === targetThemeId);
  assert.ok(targetContent);
  const targetPart = targetContent.parts.find(
    (part) =>
      base.themes[targetThemeId].releasedPartIds.includes(part.id) &&
      part.preferredCopies >= 2,
  );
  assert.ok(targetPart);
  const themeIds = base.activeThemeIds.slice(0, 7);
  assert.equal(themeIds.length, 7);

  const outcomeFor = (
    decisionShares: readonly number[],
    followupShares: readonly number[],
    followupUsers = 100_000,
  ) => {
    const state = structuredClone(base);
    state.day = FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS;
    state.phase = "running";
    state.community = state.community.filter(
      (event) =>
        event.day !== FIRST_BAN_DAY ||
        !(
          event.type === "restriction-applied" ||
          event.type === "cosmetic-restriction" ||
          event.type === "restriction-no-change"
        ),
    );
    state.community.push({
      id: "restriction-outcome-fixture",
      day: FIRST_BAN_DAY,
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
      .filter(
        (entry) =>
          entry.day !== FIRST_BAN_DAY &&
          entry.day !== FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
      )
      .concat([
        {
          day: FIRST_BAN_DAY,
          totalUsers: 100_000,
          revenue: 1,
          topThemeId: themeIds[0],
          shares: sharesFor(decisionShares),
        },
        {
          day: FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
          totalUsers: followupUsers,
          revenue: 1,
          topThemeId: themeIds[0],
          shares: sharesFor(followupShares),
        },
      ])
      .sort((left, right) => left.day - right.day);
    return getRestrictionHistoricalOutcome(
      state,
      FIRST_BAN_DAY,
      FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    );
  };

  const stillDominated = outcomeFor(
    [0.5, 0.2, 0.12, 0.1, 0.08, 0, 0],
    [0.495, 0.19, 0.125, 0.105, 0.085, 0, 0],
  );
  assert.notEqual(stillDominated.classification, "stabilized");
  assert.ok(stillDominated.followupMetrics!.topShare > 0.49);

  const unrelatedUserLoss = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.1],
    [0.338, 0.18, 0.141, 0.101, 0.08, 0.06, 0.1],
    95_000,
  );
  assert.notEqual(unrelatedUserLoss.classification, "overcorrected");
  assert.ok(unrelatedUserLoss.userRateDelta <= -0.05);

  const stabilized = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.1],
    [0.3, 0.16, 0.13, 0.11, 0.09, 0.08, 0.13],
  );
  assert.equal(stabilized.classification, "stabilized");

  const overcorrected = outcomeFor(
    [0.34, 0.18, 0.14, 0.1, 0.08, 0.06, 0.1],
    [0.2, 0.2, 0.16, 0.13, 0.1, 0.08, 0.13],
  );
  assert.equal(overcorrected.classification, "overcorrected");
});

const RESTRICTION_OUTCOME_DECISION_SHARES = [
  0.34,
  0.18,
  0.14,
  0.1,
  0.08,
  0.06,
  0.1,
] as const;

function makeRestrictionOutcomeConsequenceFixture(
  followupShares: readonly number[],
  seed = 13_507,
  decisionShares: readonly number[] = RESTRICTION_OUTCOME_DECISION_SHARES,
): State {
  const state = advanceThroughDecisions(
    createInitialGame(seed),
    SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS - 1,
  );
  const themeIds = state.activeThemeIds.slice(0, 7);
  assert.equal(themeIds.length, 7);
  assert.equal(followupShares.length, themeIds.length);
  assert.equal(decisionShares.length, themeIds.length);
  assert.ok(
    Math.abs(followupShares.reduce((sum, share) => sum + share, 0) - 1) <
      1e-9,
  );
  const targetThemeId = themeIds[0];
  const targetContent = THEMES.find((theme) => theme.id === targetThemeId);
  assert.ok(targetContent);
  const targetPart = targetContent.parts.find(
    (part) =>
      state.themes[targetThemeId].releasedPartIds.includes(part.id) &&
      part.preferredCopies >= 2,
  );
  assert.ok(targetPart);
  const isDecisionEvent = (event: State["community"][number]) =>
    event.day === SECOND_BAN_DAY &&
    (event.type === "restriction-applied" ||
      event.type === "cosmetic-restriction" ||
      event.type === "restriction-no-change");
  state.community = state.community.filter((event) => !isDecisionEvent(event));
  state.community.push({
    id: "restriction-outcome-consequence-fixture",
    day: SECOND_BAN_DAY,
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
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        values[index] ?? 0,
      ]),
    );
  const decisionSnapshot = state.history.find(
    (entry) => entry.day === SECOND_BAN_DAY,
  );
  assert.ok(decisionSnapshot);
  decisionSnapshot.shares = sharesFor(decisionShares);
  decisionSnapshot.topThemeId = targetThemeId;
  delete decisionSnapshot.topCutPlacements;
  assert.equal(
    state.day,
    SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS - 1,
  );
  state.purchaseTrust = 60;
  for (const [index, themeId] of state.activeThemeIds.entries()) {
    const share = followupShares[index] ?? 0;
    state.themes[themeId].share = share;
    state.themes[themeId].previousWeekShare = share;
  }
  state.currentTopThemeId = themeIds.reduce((topThemeId, themeId) =>
    state.themes[themeId].share > state.themes[topThemeId].share
      ? themeId
      : topThemeId,
  );
  return state;
}

test("D+9 restriction outcomes apply each ownership consequence once and update history", () => {
  const naturalShares = [...RESTRICTION_OUTCOME_DECISION_SHARES];
  const ineffectiveShares = [...naturalShares];
  ineffectiveShares[0] += 0.015;
  ineffectiveShares[1] -= 0.015;
  const fixtures = [
    {
      classification: "stabilized",
      shares: [0.3, 0.16, 0.13, 0.11, 0.09, 0.08, 0.13],
      trustDelta: 1.5,
    },
    {
      classification: "overcorrected",
      shares: [0.2, 0.2, 0.16, 0.13, 0.1, 0.08, 0.13],
      trustDelta: -7,
    },
    {
      classification: "replacement",
      shares: [0.3, 0.4, 0.08, 0.06, 0.05, 0.04, 0.07],
      trustDelta: -3.5,
    },
    {
      classification: "ineffective",
      shares: ineffectiveShares,
      decisionShares: naturalShares,
      trustDelta: 0,
    },
    {
      classification: "mixed",
      shares: [0.35, 0.17, 0.14, 0.1, 0.08, 0.06, 0.1],
      trustDelta: -0.25,
    },
  ] as const;
  const resolvedByClassification = new Map<string, State>();

  for (const fixture of fixtures) {
    const input = makeRestrictionOutcomeConsequenceFixture(
      fixture.shares,
      13_507,
      "decisionShares" in fixture
        ? fixture.decisionShares
        : RESTRICTION_OUTCOME_DECISION_SHARES,
    );
    if (fixture.classification === "ineffective") {
      const probe = reduceGame(structuredClone(input), {
        type: "ADVANCE_DAYS",
        days: 1,
      });
      const probeSnapshot = probe.history.find(
        (entry) => entry.day === SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
      );
      const decisionSnapshot = input.history.find(
        (entry) => entry.day === SECOND_BAN_DAY,
      );
      assert.ok(probeSnapshot);
      assert.ok(decisionSnapshot);
      decisionSnapshot.shares = { ...probeSnapshot.shares };
      decisionSnapshot.topThemeId = probeSnapshot.topThemeId;
      delete decisionSnapshot.topCutPlacements;
    }
    const controlInput = structuredClone(input);
    controlInput.community = controlInput.community.filter(
      (event) => event.id !== "restriction-outcome-consequence-fixture",
    );
    const control = reduceGame(controlInput, {
      type: "ADVANCE_DAYS",
      days: 1,
    });
    const resolved = reduceGame(input, { type: "ADVANCE_DAYS", days: 1 });
    const outcome = getRestrictionHistoricalOutcome(
      resolved,
      SECOND_BAN_DAY,
      SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    );
    assert.equal(
      outcome.classification,
      fixture.classification,
      JSON.stringify(outcome),
    );
    assert.equal(
      resolved.purchaseTrust,
      Math.round((control.purchaseTrust + fixture.trustDelta) * 10_000) /
        10_000,
    );
    assert.equal(
      resolved.history.find(
        (entry) =>
          entry.day === SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
      )
        ?.purchaseTrust,
      resolved.purchaseTrust,
    );
    assert.deepEqual(
      resolved,
      reduceGame(structuredClone(input), { type: "ADVANCE_DAYS", days: 1 }),
    );
    resolvedByClassification.set(fixture.classification, resolved);
  }

  const overcorrected = resolvedByClassification.get("overcorrected");
  assert.ok(overcorrected);
  const withoutDecision = structuredClone(overcorrected);
  withoutDecision.community = withoutDecision.community.filter(
    (event) => event.id !== "restriction-outcome-consequence-fixture",
  );
  const ordinaryNextDay = reduceGame(withoutDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const outcomeNextDay = reduceGame(overcorrected, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(outcomeNextDay.purchaseTrust, ordinaryNextDay.purchaseTrust);

  const normalizedRisk = (state: State) => {
    const normalized = structuredClone(state);
    normalized.purchaseTrust = 70;
    const share = 1 / normalized.activeThemeIds.length;
    for (const themeId of normalized.activeThemeIds) {
      normalized.themes[themeId].share = share;
      normalized.themes[themeId].previousWeekShare = share;
      normalized.themes[themeId].winRate = 0.5;
    }
    normalized.currentTopThemeId = normalized.activeThemeIds[0];
    return getStrategicProjectRiskProfile(
      normalized,
      "season-overhaul",
    );
  };
  const stabilizedRisk = normalizedRisk(
    resolvedByClassification.get("stabilized")!,
  );
  const mixedRisk = normalizedRisk(resolvedByClassification.get("mixed")!);
  const ineffectiveRisk = normalizedRisk(
    resolvedByClassification.get("ineffective")!,
  );
  const replacementRisk = normalizedRisk(
    resolvedByClassification.get("replacement")!,
  );
  const overcorrectedRisk = normalizedRisk(overcorrected);
  assert.ok(stabilizedRisk.risk < mixedRisk.risk);
  assert.ok(mixedRisk.risk < ineffectiveRisk.risk);
  assert.ok(ineffectiveRisk.risk < replacementRisk.risk);
  assert.ok(replacementRisk.risk < overcorrectedRisk.risk);
  assert.equal(overcorrectedRisk.context.primaryRisk, "policy");
});

test("a first ineffective review is trust-neutral while a repeated miss erodes trust and raises risk", () => {
  const base = advanceThroughDecisions(
    createInitialGame(13_508),
    SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS - 1,
  );
  assert.equal(
    base.day,
    SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS - 1,
  );
  assert.equal(base.phase, "running");
  const themeIds = base.activeThemeIds.slice(0, 8);
  const targetThemeId = themeIds[0];
  const targetContent = THEMES.find((theme) => theme.id === targetThemeId);
  assert.ok(targetContent);
  const targetPart = targetContent.parts.find(
    (part) => base.themes[targetThemeId].releasedPartIds.includes(part.id),
  );
  assert.ok(targetPart);
  const decisionType = (event: State["community"][number]) =>
    event.type === "restriction-applied" ||
    event.type === "cosmetic-restriction" ||
    event.type === "restriction-no-change";
  base.community = base.community.filter(
    (event) =>
      !([FIRST_BAN_DAY, SECOND_BAN_DAY].includes(event.day) &&
        decisionType(event)),
  );
  const makeDecisionEvent = (day: number) => ({
    id: `repeated-ineffective-${day}`,
    day,
    category: "restriction" as const,
    type: "restriction-applied" as const,
    themeId: targetThemeId,
    partId: targetPart.id,
    previousValue: 3,
    value: 1,
    body: "fixture",
  });
  base.community.push(
    makeDecisionEvent(FIRST_BAN_DAY),
    makeDecisionEvent(SECOND_BAN_DAY),
  );
  const firstDecisionSnapshot = base.history.find(
    (entry) => entry.day === FIRST_BAN_DAY,
  );
  const firstFollowupSnapshot = base.history.find(
    (entry) => entry.day === FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
  );
  const currentDecisionSnapshot = base.history.find(
    (entry) => entry.day === SECOND_BAN_DAY,
  );
  assert.ok(firstDecisionSnapshot);
  assert.ok(firstFollowupSnapshot);
  assert.ok(currentDecisionSnapshot);
  firstFollowupSnapshot.shares = { ...firstDecisionSnapshot.shares };
  firstFollowupSnapshot.topThemeId = firstDecisionSnapshot.topThemeId;
  for (const themeId of base.activeThemeIds) {
    const share = currentDecisionSnapshot.shares[themeId];
    assert.ok(Number.isFinite(share));
    base.themes[themeId].share = share;
    base.themes[themeId].previousWeekShare = share;
  }
  base.currentTopThemeId = currentDecisionSnapshot.topThemeId;
  base.purchaseTrust = 60;

  const firstInput = structuredClone(base);
  firstInput.community = firstInput.community.filter(
    (event) => event.id !== `repeated-ineffective-${FIRST_BAN_DAY}`,
  );
  const first = reduceGame(firstInput, { type: "ADVANCE_DAYS", days: 1 });
  const repeated = reduceGame(base, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(
    getRestrictionHistoricalOutcome(
      first,
      SECOND_BAN_DAY,
      SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    ).classification,
    "ineffective",
  );
  assert.equal(
    getRestrictionHistoricalOutcome(
      repeated,
      FIRST_BAN_DAY,
      FIRST_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    ).classification,
    "ineffective",
  );
  assert.equal(
    getRestrictionHistoricalOutcome(
      repeated,
      SECOND_BAN_DAY,
      SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    ).classification,
    "ineffective",
  );
  assert.equal(repeated.purchaseTrust, first.purchaseTrust - 1.5);
  assert.equal(
    repeated.history.find(
      (entry) =>
        entry.day === SECOND_BAN_DAY + RESTRICTION_REPORT_DELAY_DAYS,
    )
      ?.purchaseTrust,
    repeated.purchaseTrust,
  );

  const firstRiskState = structuredClone(first);
  const repeatedRiskState = structuredClone(repeated);
  firstRiskState.purchaseTrust = 70;
  repeatedRiskState.purchaseTrust = 70;
  const firstRisk = getStrategicProjectRiskProfile(
    firstRiskState,
    "season-overhaul",
  );
  const repeatedRisk = getStrategicProjectRiskProfile(
    repeatedRiskState,
    "season-overhaul",
  );
  assert.ok(repeatedRisk.risk >= firstRisk.risk + 0.014);
  assert.equal(repeatedRisk.context.primaryRisk, "policy");
});

test("support requests replace their lane and the latest request reaches the next slate", () => {
  let state = createInitialGame(77);
  const targetId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: targetId,
    direction: "recovery",
  });

  assert.equal(state.supportRequests.length, 1);
  const firstRequest = state.supportRequests[0];
  assert.equal(firstRequest.proposedDay, TUTORIAL_END_DAY);
  assert.equal(firstRequest.eligibleReleaseDay, FIRST_RELEASE_DAY);
  assert.equal(firstRequest.status, "queued");
  const replacementThemeId = state.activeThemeIds[1];
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: replacementThemeId,
    direction: "counterplay",
  });
  const replacement = state.supportRequests[1];
  assert.equal(state.supportRequests[0].status, "replaced");
  assert.equal(replacement.status, "queued");

  state = advanceToFirstRelease(state);
  assert.ok(state.releaseSlate);
  const requestedOption = state.releaseSlate.options.find(
    (option) =>
      option.kind === "support" && option.requestId === replacement.id,
  );
  if (!requestedOption || requestedOption.kind !== "support") {
    assert.fail("expected requested support option");
  }
  assert.equal(requestedOption.themeId, replacementThemeId);
  assert.equal(requestedOption.direction, "counterplay");
  assert.equal(requestedOption.requested, true);
  assert.equal(
    state.supportRequests.find((request) => request.id === replacement.id)?.status,
    "offered",
  );

  const selected = completeReleaseOptions(state, [requestedOption]);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
  assert.equal(state.supportRequests[1].status, "released");
  assert.equal(state.supportRequests[1].releasedDay, FIRST_RELEASE_DAY);

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, 30);
  state = submitFirstThree(state);
  state = advanceUntilDayOrDecisionHandlingBusinessEvents(
    state,
    SECOND_BAN_DAY,
  );
  assert.equal(state.day, SECOND_BAN_DAY);
  assert.equal(state.phase, "ban-edit");
  state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: state.activeThemeIds[1],
    direction: "counterplay",
  });
  assert.equal(state.day, SECOND_BAN_DAY);
  assert.equal(state.supportRequests.length, 3);
  assert.equal(state.supportRequests[2].eligibleReleaseDay, 70);
});

test("a support release can bring a Tier Out theme back into the observed meta", () => {
  let state = createInitialGame(7_701);
  const targetId = state.activeThemeIds.find(
    (themeId) =>
      themeId !== state.currentTopThemeId &&
      state.themes[themeId].supportCount === 0,
  );
  assert.ok(targetId);
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: targetId,
    direction: "consistency",
  });
  state = advanceToFirstRelease(state);
  assert.ok(state.releaseSlate);
  const requested = state.releaseSlate.options.find(
    (option) =>
      option.kind === "support" &&
      option.requested &&
      option.themeId === targetId,
  );
  if (!requested || requested.kind !== "support") {
    assert.fail("expected requested support option");
  }

  const runtime = state.themes[targetId];
  const recipient = state.themes[state.currentTopThemeId];
  const transferred = runtime.share - META_ADOPTION_SHARE_FLOOR;
  runtime.share = META_ADOPTION_SHARE_FLOOR;
  runtime.previousWeekShare = META_ADOPTION_SHARE_FLOOR;
  recipient.share += transferred;

  const selected = completeReleaseOptions(state, [requested]);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: index === 0 ? 3 : 0,
    })),
  });
  assert.equal(state.themes[targetId].share, META_ADOPTION_SHARE_FLOOR);

  state = advanceUntilDayOrDecisionHandlingBusinessEvents(state, state.day + 1);
  assert.ok(state.themes[targetId].share > META_ADOPTION_SHARE_FLOOR);
  assert.equal(state.themes[targetId].supportCount, 1);
  assertHealthyShares(state);
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
    state = advanceToNextRegularReleaseHandlingBusinessEvents(state);
    assert.equal(state.phase, "release-edit");
    assert.ok(state.releaseSlate);
    const requested = state.releaseSlate.options.find(
      (option) =>
        option.kind === "support" &&
        option.requested &&
        option.themeId === targetId,
    );
    if (!requested || requested.kind !== "support") {
      assert.fail("expected requested support option");
    }
    const selected = completeReleaseOptions(state, [requested]);
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
        assert.equal(state.day, SECOND_BAN_DAY);
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

  state = advanceToNextRegularReleaseHandlingBusinessEvents(state);
  assert.equal(state.day, 90);
  assert.ok(
    state.releaseSlate?.options.every(
      (option) => option.kind !== "support" || option.themeId !== targetId,
    ),
  );
});

test("DAY 10 regular release review offers three choices in every product category", () => {
  const state = advanceToFirstRelease(createInitialGame(321));
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.day, FIRST_RELEASE_DAY);
  assert.equal(state.releaseSlate.options.length, 9);
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
  assert.equal(
    state.releaseSlate.options.filter((option) => option.kind === "generic")
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

test("actual meta tiers create ordered and material pack-demand gaps", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(3_221));
  assert.ok(atRelease.releaseSlate);
  const supportOption = atRelease.releaseSlate.options.find(
    (option) =>
      option.kind === "support" &&
      atRelease.history[0].shares[option.themeId] !== undefined,
  );
  if (!supportOption || supportOption.kind !== "support") {
    assert.fail("expected support option");
  }
  const newOptions = atRelease.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  );
  const genericOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(newOptions.length >= 2);
  assert.ok(genericOption);
  const donorId = Object.keys(atRelease.history[0].shares).find(
    (themeId) => themeId !== supportOption.themeId,
  );
  assert.ok(donorId);
  const selections = [supportOption, ...newOptions.slice(0, 2), genericOption].map(
    (option) => ({
      optionId: option.id,
      powerAdjustment: 0 as const,
    }),
  );

  const withTargetPlacements = (targetPlacements: number): State => {
    const state = structuredClone(atRelease);
    for (const entry of state.history) {
      assert.ok(entry.topCutPlacements);
      for (const themeId of Object.keys(entry.topCutPlacements)) {
        entry.topCutPlacements[themeId] = 0;
      }
      entry.topCutPlacements[supportOption.themeId] = targetPlacements;
      entry.topCutPlacements[donorId] =
        DAILY_TOP_CUT_SLOTS - targetPlacements;
    }
    return state;
  };

  const revenueByTier = {
    tier0: reduceGame(withTargetPlacements(21), {
      type: "SUBMIT_RELEASE",
      selections,
    }).finance.today,
    tier1: reduceGame(withTargetPlacements(5), {
      type: "SUBMIT_RELEASE",
      selections,
    }).finance.today,
    tier2: reduceGame(withTargetPlacements(2), {
      type: "SUBMIT_RELEASE",
      selections,
    }).finance.today,
    tier3: reduceGame(withTargetPlacements(1), {
      type: "SUBMIT_RELEASE",
      selections,
    }).finance.today,
    tierOut: reduceGame(withTargetPlacements(0), {
      type: "SUBMIT_RELEASE",
      selections,
    }).finance.today,
  };
  assert.ok(revenueByTier.tier0 > revenueByTier.tier1);
  assert.ok(revenueByTier.tier1 > revenueByTier.tier2);
  assert.ok(revenueByTier.tier2 > revenueByTier.tier3);
  assert.ok(revenueByTier.tier3 > revenueByTier.tierOut);
  assert.ok(revenueByTier.tier0 - revenueByTier.tier1 >= 0.04);
  assert.ok(revenueByTier.tier1 - revenueByTier.tier2 >= 0.05);
  assert.ok(revenueByTier.tier2 - revenueByTier.tier3 >= 0.04);
  assert.ok(revenueByTier.tier3 - revenueByTier.tierOut >= 0.015);

  const withConflictingPlacementWindows = (
    latestWindowStrong: boolean,
  ): State => {
    assert.equal(PLACEMENT_WINDOW_DAYS, 7);
    const state = structuredClone(atRelease);
    const endDay = state.history.at(-1)?.day;
    assert.ok(endDay);
    const recentStartDay = endDay - PLACEMENT_WINDOW_DAYS + 1;
    const formerThirtyDayStart = endDay - 30 + 1;
    for (const entry of state.history) {
      if (entry.day < formerThirtyDayStart) continue;
      assert.ok(entry.topCutPlacements);
      for (const themeId of Object.keys(entry.topCutPlacements)) {
        entry.topCutPlacements[themeId] = 0;
      }
      const isLatestWindow = entry.day >= recentStartDay;
      const targetIsStrong = isLatestWindow === latestWindowStrong;
      entry.topCutPlacements[supportOption.themeId] = targetIsStrong
        ? DAILY_TOP_CUT_SLOTS
        : 0;
      entry.topCutPlacements[donorId] = targetIsStrong
        ? 0
        : DAILY_TOP_CUT_SLOTS;
    }
    return state;
  };

  const latestWindowStrong = reduceGame(
    withConflictingPlacementWindows(true),
    { type: "SUBMIT_RELEASE", selections },
  );
  const staleWindowStrong = reduceGame(
    withConflictingPlacementWindows(false),
    { type: "SUBMIT_RELEASE", selections },
  );
  assert.ok(
    latestWindowStrong.finance.today > staleWindowStrong.finance.today,
    "pack demand must follow the latest placement window, not stale results",
  );
});

test("new-theme launch power and same-day sales ignore stale slate forecasts", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(6_540));
  assert.ok(atRelease.releaseSlate);
  const newOptions = atRelease.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  );
  assert.equal(newOptions.length, 3);
  const selectedNewOptions = newOptions.slice(0, 2);
  const adjustments = [-3, 3] as const;

  for (const option of newOptions) {
    const content = THEMES.find((theme) => theme.id === option.themeId);
    assert.ok(content);
    assert.equal(
      option.expectedPower,
      getNewThemeExpectedPower(content, atRelease.day),
    );
  }

  const selectedOptions = completeReleaseOptions(atRelease, selectedNewOptions);
  const selections = selectedOptions.map((option) => ({
    optionId: option.id,
    powerAdjustment: (
      option.id === selectedNewOptions[0].id
        ? adjustments[0]
        : option.id === selectedNewOptions[1].id
          ? adjustments[1]
          : 0
    ) as Adjustment,
  }));
  const released = reduceGame(atRelease, {
    type: "SUBMIT_RELEASE",
    selections,
  });

  const staleSlate = structuredClone(atRelease);
  for (const option of staleSlate.releaseSlate!.options) {
    if (option.kind !== "new-theme") continue;
    option.expectedPower = 100;
    option.expectedTier = "Tier 0";
  }
  const releasedFromStale = reduceGame(staleSlate, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  assert.equal(releasedFromStale.finance.today, released.finance.today);
  assert.deepEqual(
    releasedFromStale.releaseHistory.at(-1)?.products,
    released.releaseHistory.at(-1)?.products,
  );

  const observed = reduceGame(releasedFromStale, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  for (const [index, option] of selectedNewOptions.entries()) {
    const content = THEMES.find((theme) => theme.id === option.themeId);
    assert.ok(content);
    const expectedLaunchPower = getNewThemeLaunchPower(
      content,
      adjustments[index],
      atRelease.day,
    );
    assert.ok(
      Math.abs(
        observed.themes[option.themeId].power - expectedLaunchPower,
      ) < 1e-9,
    );
    assert.equal(
      released.releaseHistory.at(-1)?.products.find(
        (product) => product.optionId === option.id,
      )?.expectedTier,
      getExpectedTier(expectedLaunchPower),
    );
  }
});

test("release submission requires four mixed valid selections and applies their adjustments", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(654));
  assert.ok(atRelease.releaseSlate);
  const newOptions = atRelease.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  );
  const supportOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "support",
  );
  const genericOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "generic",
  );
  assert.equal(newOptions.length, 3);
  if (!supportOption || supportOption.kind !== "support" || !genericOption) {
    assert.fail("expected support and generic options");
  }

  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: newOptions.slice(0, 2).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      }),
    /Exactly 4 release options/,
  );
  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: [...newOptions, supportOption].map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      }),
    /at least one new theme, support, and generic card/,
  );
  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: [
          { optionId: newOptions[0].id, powerAdjustment: 0 },
          { optionId: supportOption.id, powerAdjustment: 4 },
          { optionId: genericOption.id, powerAdjustment: 0 },
          { optionId: newOptions[1].id, powerAdjustment: 0 },
        ],
      } as never),
    /integer from -3 to 3/,
  );

  const selected = [
    { option: newOptions[0], adjustment: -3 as const },
    { option: newOptions[1], adjustment: 3 as const },
    { option: supportOption, adjustment: 0 as const },
    { option: genericOption, adjustment: 0 as const },
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
  assert.equal(released.day, FIRST_RELEASE_DAY);
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
        event.day === FIRST_RELEASE_DAY &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    0,
  );
  assert.ok(released.finance.today > atRelease.history.at(-1)!.revenue);
  const regularReleaseHistory = released.releaseHistory.filter(
    (batch) => batch.releaseKind !== "baseline",
  );
  assert.equal(regularReleaseHistory.length, 1);
  assert.equal(regularReleaseHistory[0].day, FIRST_RELEASE_DAY);
  assert.deepEqual(
    regularReleaseHistory[0].products.map((product) => ({
      optionId: product.optionId,
      powerAdjustment: product.powerAdjustment,
    })),
    selected.map(({ option, adjustment }) => ({
      optionId: option.id,
      powerAdjustment: adjustment,
    })),
  );

  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(observed.day, FIRST_RELEASE_DAY + 1);
  assert.equal(observed.activeThemeIds.length, activeBefore.length + 2);
  assert.ok(observed.activeThemeIds.includes(newOptions[0].themeId));
  assert.ok(observed.activeThemeIds.includes(newOptions[1].themeId));
  assert.ok(observed.themes[supportOption.themeId].supportPower > supportBefore);
  assert.equal(
    observed.themes[supportOption.themeId].lastSupportDay,
    FIRST_RELEASE_DAY,
  );
  assert.equal(
    observed.community.filter(
      (event) =>
        event.day === FIRST_RELEASE_DAY + 1 &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    4,
  );
  assert.equal(observed.genericLimits[genericOption.genericCardId], 3);

  for (const [index, option] of newOptions.slice(0, 2).entries()) {
    const adjustment = ([-3, 3] as const)[index];
    assert.ok(
      Math.abs(
        observed.themes[option.themeId].power -
          (option.expectedPower + adjustment * 2.2),
      ) < 1e-9,
    );
  }
});

test("keeps shares finite and normalized through every release and restriction gate", () => {
  let state = createInitialGame(999);
  let reviews = 0;
  let sawTierOut = false;

  while (state.phase !== "ended") {
    if (state.operations.pendingEvent) {
      state = choosePendingBusinessEvent(state);
    } else if (state.phase === "release-edit") {
      assert.ok(state.releaseSlate);
      assert.equal(
        state.releaseSlate.options.length,
        state.releaseSlate.releaseKind === "reprint"
          ? REPRINT_PACK_CANDIDATE_COUNT
          : 9,
      );
      state = state.releaseSlate.releaseKind === "reprint"
        ? submitFirstThree(state)
        : submitFirstThree(state, [-1, 0, 1]);
      reviews += 1;
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
      reviews += 1;
    } else {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 180 });
    }

    assertHealthyShares(state);
    sawTierOut ||= state.activeThemeIds.some(
      (themeId) =>
        state.themes[themeId].share <= META_ADOPTION_SHARE_FLOOR + 1e-9,
    );
    assert.ok(reviews < 100, "the simulation should continue past every review");
  }

  assert.equal(state.day, CAMPAIGN_END_DAY);
  assert.equal(state.phase, "ended");
  assert.equal(
    state.releaseHistory.filter((batch) => batch.releaseKind !== "baseline").length,
    23,
  );
  assert.equal(sawTierOut, true);
  const finalShares = state.activeThemeIds
    .map((themeId) => state.themes[themeId].share)
    .sort((left, right) => right - left);
  assert.ok(finalShares.slice(0, 3).reduce((sum, share) => sum + share, 0) >= 0.3);
  assert.ok(
    finalShares.filter((share) => share <= META_ADOPTION_SHARE_FLOOR + 1e-9)
      .length >= 5,
  );
  assertHealthyShares(state);
});

test("keeps complete slates when a support-heavy strategy exhausts eligible themes", () => {
  let state = createInitialGame(10_031);
  let releaseReviews = 0;

  while (state.phase !== "ended") {
    if (state.operations.pendingEvent) {
      state = choosePendingBusinessEvent(state);
    } else if (state.phase === "release-edit") {
      assert.ok(state.releaseSlate);
      assert.equal(
        state.releaseSlate.options.length,
        state.releaseSlate.releaseKind === "reprint"
          ? REPRINT_PACK_CANDIDATE_COUNT
          : 9,
      );
      const supportFirst = state.releaseSlate.options
        .filter((option) => option.kind === "support")
        .slice(0, 2);
      const selected = completeReleaseOptions(state, supportFirst);
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: selected.map((option) => ({
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
  assert.equal(releaseReviews, 23);
});

test("charges recurring operating costs from DAY 1 after the DAY 0 decision", () => {
  const baseline = createCampaignStart(20_999);
  assert.equal(baseline.day, FIRST_BAN_DAY);
  assert.equal(baseline.finance.todayOperatingCost, 0);
  const published = reduceGame(baseline, { type: "SUBMIT_BAN", changes: {} });
  const start = reduceGame(published, { type: "ADVANCE_DAYS", days: 1 });
  const activeUsers =
    start.users.tier + start.users.casual + start.users.collector;
  const expectedCost = getDailyOperatingCost(start.day, activeUsers);
  const expectedNet =
    Math.round(
      (start.finance.today * 0.32 - expectedCost + Number.EPSILON) * 10_000,
    ) / 10_000;

  assert.equal(OPERATING_COST_START_DAY, 1);
  assert.equal(start.day, OPERATING_COST_START_DAY);
  assert.ok(expectedCost > 0);
  assert.equal(start.finance.todayOperatingCost, expectedCost);
  assert.equal(start.finance.cumulativeOperatingCosts, expectedCost);
  assert.equal(start.finance.todayOperatingCash, expectedNet);
  assert.equal(start.history.at(-1)?.operatingCash, expectedNet);

  const next = reduceGame(start, { type: "ADVANCE_DAYS", days: 1 });
  const nextActiveUsers =
    next.users.tier + next.users.casual + next.users.collector;
  const nextCost = getDailyOperatingCost(next.day, nextActiveUsers);

  assert.equal(next.finance.todayOperatingCost, nextCost);
  assert.equal(
    next.finance.cumulativeOperatingCosts,
    Math.round((expectedCost + nextCost + Number.EPSILON) * 10_000) / 10_000,
  );
  assert.equal(getMonthlyOperatingCost(10_000), 1.7);
  assert.equal(getDailyOperatingCost(0, 10_000), 0);
  assert.equal(getDailyOperatingCost(1, 10_000), 0.0567);
  assert.equal(getOperatingRunwayMonths(10, 10_000), 5.9);
});

test("revenue shock alerts discount the normal post-release sales tail", () => {
  const expectedReleaseDrop =
    (RELEASE_SALES_DAILY_DECAY_MULTIPLIER - 1) * 100;
  const justInsideResidual =
    (RELEASE_SALES_DAILY_DECAY_MULTIPLIER * (1 - 0.0799) - 1) * 100;
  const residualBoundary =
    (RELEASE_SALES_DAILY_DECAY_MULTIPLIER * (1 - 0.08) - 1) * 100;

  assert.equal(getRevenueChangeSignal(12), "surge");
  assert.equal(getRevenueChangeSignal(-11.99), null);
  assert.equal(getRevenueChangeSignal(-12), "drop");
  assert.equal(getRevenueChangeSignal(expectedReleaseDrop, 1), null);
  assert.equal(getRevenueChangeSignal(-19, 15), null);
  assert.equal(getRevenueChangeSignal(justInsideResidual, 8), null);
  assert.equal(getRevenueChangeSignal(residualBoundary, 8), "drop");
  assert.equal(getRevenueChangeSignal(expectedReleaseDrop, 8, 2), "drop");
  assert.equal(getRevenueChangeSignal(-12, 30), "drop");
});

test("market divergence detects immediate and delayed ecosystem fallout", () => {
  assert.equal(getMarketDivergenceLag(true, -0.6, 0, 0, 0), 0);
  assert.equal(getMarketDivergenceLag(true, 0, 0, 1, -6.2), 1);
  assert.equal(getMarketDivergenceLag(true, 0, 0, 1, -6.2, 2), null);
  assert.equal(getMarketDivergenceLag(false, -8, -8, -8, -8), null);
});

test("decision gates charge operating costs once, after the decision is submitted", () => {
  let state = createInitialGame(21_000);
  state = advanceUntilDayOrDecisionHandlingBusinessEvents(
    state,
    FIRST_RELEASE_DAY - 1,
  );
  assert.equal(state.day, FIRST_RELEASE_DAY - 1);
  assert.equal(state.phase, "running");
  const beforeGate = state.finance.cumulativeOperatingCosts;

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, FIRST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  assert.equal(state.finance.cumulativeOperatingCosts, beforeGate);

  state = submitFirstThree(state);
  const expectedCost = getDailyOperatingCost(
    FIRST_RELEASE_DAY,
    state.users.tier + state.users.casual + state.users.collector,
  );
  assert.equal(
    state.finance.cumulativeOperatingCosts,
    Math.round((beforeGate + expectedCost + Number.EPSILON) * 10_000) /
      10_000,
  );

  const afterSettlement = state.finance.cumulativeOperatingCosts;
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, FIRST_RELEASE_DAY + 1);
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

test("DAY 4 opens only the four guided starter business actions", () => {
  let dayThree = reduceGame(createFirstBanGame(21_000), {
    type: "SUBMIT_BAN",
    changes: {},
  });
  dayThree = reduceGame(dayThree, { type: "ADVANCE_DAYS", days: 3 });
  assert.equal(dayThree.day, 3);
  assert.equal(dayThree.handoverComplete, false);

  for (const action of BUSINESS_ACTIONS) {
    const availability = getBusinessActionAvailability(dayThree, action.type);
    assert.equal(availability.available, false, action.type);
    assert.match(availability.reason ?? "", /DAY 4/);
  }

  const dayFour = reduceGame(dayThree, { type: "ADVANCE_DAYS", days: 1 });
  const starterTypes = new Set(HANDOVER_STARTER_BUSINESS_ACTION_TYPES);
  assert.equal(dayFour.day, 4);
  assert.equal(dayFour.handoverComplete, false);
  assert.equal(starterTypes.size, 4);

  for (const action of BUSINESS_ACTIONS) {
    const availability = getBusinessActionAvailability(dayFour, action.type);
    assert.equal(
      availability.available,
      starterTypes.has(
        action.type as (typeof HANDOVER_STARTER_BUSINESS_ACTION_TYPES)[number],
      ),
      action.type,
    );
    if (!availability.available) {
      assert.match(availability.reason ?? "", /기본 대응 4종|DAY 7/);
    }
  }

  const launched = reduceGame(dayFour, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.equal(launched.operations.records.at(-1)?.startedDay, 4);
  assert.equal(launched.operations.records.at(-1)?.type, "tv-cm");

  const beforeCompletion = reduceGame(dayFour, {
    type: "ADVANCE_DAYS",
    days: TUTORIAL_END_DAY - dayFour.day,
  });
  assert.equal(beforeCompletion.handoverComplete, false);
  for (const type of [
    "animation-promotion",
    "championship",
    "lending-exchange-network",
    "collector-fair",
    "pack-odds",
    "season-overhaul",
    "global-launch",
    "organized-play-platform",
  ] as const) {
    assert.equal(
      getBusinessActionAvailability(beforeCompletion, type).available,
      false,
      type,
    );
  }
});

test("business actions spend operating cash without double-booking the current day", () => {
  const state = createInitialGame(21_001);
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
  assert.deepEqual(
    {
      ...next.operations.records[0],
      risk: undefined,
    },
    {
      id: "business-action-1",
      type: "tv-cm",
      startedDay: TUTORIAL_END_DAY,
      endsDay: TUTORIAL_END_DAY + 21,
      cost: 0.6,
      outcome: "active",
      risk: undefined,
    },
  );
  assert.ok(next.operations.records[0].risk !== undefined);
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
  let state = createInitialGame(21_002);
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  state = advanceThroughDecisions(state, TUTORIAL_END_DAY + 29);
  assert.equal(state.day, TUTORIAL_END_DAY + 29);
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
  const control = createInitialGame(seed);
  control.finance.cash = 10;

  const tv = reduceGame(control, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  const tvNext = reduceGame(tv, { type: "ADVANCE_DAYS", days: 1 });
  const controlNext = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(tvNext.operations.records[0].resolvedDay, TUTORIAL_END_DAY + 1);
  assert.equal(
    tvNext.users.casual > controlNext.users.casual,
    tvNext.operations.records[0].outcome === "success",
  );

  const anime = reduceGame(control, {
    type: "RUN_BUSINESS_ACTION",
    action: "animation-promotion",
  });
  const animeNext = reduceGame(anime, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(
    animeNext.users.collector > controlNext.users.collector,
    animeNext.operations.records[0].outcome === "success",
  );

  const lowTrust = structuredClone(control);
  lowTrust.purchaseTrust = 50;
  const tour = reduceGame(lowTrust, {
    type: "RUN_BUSINESS_ACTION",
    action: "store-tour",
  });
  const tourNext = reduceGame(tour, { type: "ADVANCE_DAYS", days: 1 });
  const lowTrustNext = reduceGame(lowTrust, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(
    tourNext.purchaseTrust > lowTrustNext.purchaseTrust,
    tourNext.operations.records[0].outcome === "success",
  );
});

test("low-risk direct revenue needs scale while risky events break the saturation cap", () => {
  const state = createCampaignStart(21_099);
  const cases = [
    "store-tour",
    "beginner-camp",
    "local-league",
    "lending-exchange-network",
    "collector-fair",
  ] as const;

  for (const actionType of cases) {
    assert.ok(getBusinessActionDailyGrossRevenue(state, actionType) > 0);
    assert.ok(
      getBusinessActionProjectedDirectCash(state, actionType) < 0,
      `${actionType} should not print cash at the starting audience`,
    );
  }

  assert.equal(
    getBusinessActionDailyGrossRevenue(state, "championship", "backlash"),
    0,
  );
  assert.ok(
    getBusinessActionDailyGrossRevenue(state, "championship", "success") >
      Math.max(
        ...cases.map((actionType) =>
          getBusinessActionDailyGrossRevenue(state, actionType),
        ),
      ),
  );

  assert.equal(BUSINESS_ACTION_DAILY_REVENUE_CAP, 0.18);
  assert.ok(
    getStackedBusinessActionDailyGrossRevenue(state, [
      { type: "store-tour", outcome: "active" },
      { type: "collector-fair", outcome: "active" },
    ]) <= BUSINESS_ACTION_DAILY_REVENUE_CAP,
  );
  assert.ok(
    getStackedBusinessActionDailyGrossRevenue(state, [
      { type: "championship", outcome: "success" },
      { type: "collector-fair", outcome: "active" },
    ]) > BUSINESS_ACTION_DAILY_REVENUE_CAP,
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

  const operatingState = createInitialGame(21_099);
  operatingState.finance.cash = 10;
  const overlapping = reduceGame(operatingState, {
    type: "RUN_BUSINESS_ACTION",
    action: "collector-fair",
  });
  const overlappingNextDay = reduceGame(overlapping, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(
    getBusinessActionProjectedDirectGrossRevenue(
      overlappingNextDay,
      "store-tour",
    ) < getBusinessActionDailyGrossRevenue(overlappingNextDay, "store-tour") * 14,
  );
  assert.ok(
    getBusinessActionProjectedDirectCash(overlappingNextDay, "store-tour") < 0,
  );
});

test("recurring business events generate revenue and grow their intended audience", () => {
  const cases = [
    { type: "store-tour", segment: "casual", cost: 0.35 },
    { type: "beginner-camp", segment: "casual", cost: 0.4 },
    { type: "local-league", segment: "tier", cost: 0.5 },
    { type: "lending-exchange-network", segment: "casual", cost: 0.55 },
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
    const launchedRecord = launched.operations.records.at(-1)!;
    assert.equal(launchedRecord.id, "business-action-1");
    assert.equal(launchedRecord.type, fixture.type);
    assert.equal(launchedRecord.startedDay, TUTORIAL_END_DAY);
    assert.equal(
      launchedRecord.endsDay,
      TUTORIAL_END_DAY +
        (fixture.type === "local-league"
          ? 21
          : fixture.type === "lending-exchange-network"
            ? 30
            : 14),
    );
    assert.equal(launchedRecord.cost, fixture.cost);
    assert.equal(launchedRecord.outcome, "active");
    assert.ok(launchedRecord.risk !== undefined);

    const active = reduceGame(launched, { type: "ADVANCE_DAYS", days: 1 });
    const baseline = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
    const succeeded = active.operations.records.at(-1)!.outcome === "success";
    assert.equal(
      active.users[fixture.segment] > baseline.users[fixture.segment],
      succeeded,
      `${fixture.type} audience direction should match its result`,
    );
    assert.equal(
      active.finance.today > baseline.finance.today,
      succeeded,
      `${fixture.type} revenue direction should match its result`,
    );
    assert.equal(
      active.purchaseTrust > baseline.purchaseTrust,
      succeeded,
      `${fixture.type} trust direction should match its result`,
    );
  }
});

test("championships turn a healthy environment into growth and a hostile one into churn", () => {
  function prepare(seed: number, hostile: boolean): State {
    let state = createInitialGame(seed);
    state.finance.cash = 10;
    state = advanceToFirstRelease(state);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: getPrologueReleaseSelections(state),
    });
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

  const seed = 21_104;
  const healthyBase = prepare(seed, false);
  const hostileBase = prepare(seed, true);
  const healthyResult = reduceGame(
    reduceGame(healthyBase, {
      type: "RUN_BUSINESS_ACTION",
      action: "championship",
    }),
    { type: "ADVANCE_DAYS", days: 1 },
  );
  const hostileResult = reduceGame(
    reduceGame(hostileBase, {
      type: "RUN_BUSINESS_ACTION",
      action: "championship",
    }),
    { type: "ADVANCE_DAYS", days: 1 },
  );
  assert.equal(healthyResult.operations.records.at(-1)?.outcome, "success");
  assert.equal(hostileResult.operations.records.at(-1)?.outcome, "backlash");

  const healthyControl = reduceGame(healthyBase, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const hostileControl = reduceGame(hostileBase, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(healthyResult.users.casual > healthyControl.users.casual);
  assert.ok(hostileResult.users.tier < hostileControl.users.tier);
  assert.ok(hostileResult.users.casual < hostileControl.users.casual);

  const replay = reduceGame(
    reduceGame(prepare(seed, true), {
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
  control = advanceToFirstRelease(control);
  adjusted = advanceToFirstRelease(adjusted);
  control = submitFirstThree(control);
  adjusted = submitFirstThree(adjusted);
  assert.ok(adjusted.finance.today > control.finance.today);
  assert.ok(adjusted.finance.today < control.finance.today * 1.25);
  assert.equal(adjusted.operations.records.at(-1)?.outcome, "active");
  assert.equal(
    adjusted.operations.records.at(-1)?.appliedDay,
    FIRST_RELEASE_DAY,
  );

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
  impossibleLateAction.phase = "running";
  impossibleLateAction.handoverComplete = true;
  assert.throws(
    () =>
      reduceGame(impossibleLateAction, {
        type: "RUN_BUSINESS_ACTION",
        action: "pack-odds",
      }),
    /settlement|결산/i,
  );
});

test("mandatory reprint packs cap their combined D+1 trust shock at four points", () => {
  let state = advanceToFirstRelease(createInitialGame(21_204));
  state = submitFirstThree(state);
  state = advanceToNextReleaseHandlingBusinessEvents(state);
  state = submitFirstThree(state);
  state = advanceToNextReleaseHandlingBusinessEvents(state);
  assert.equal(state.releaseSlate?.releaseKind, "reprint");
  const released = submitFirstThree(state);

  const severe = structuredClone(released);
  const moderate = structuredClone(released);
  severe.purchaseTrust = 80;
  moderate.purchaseTrust = 80;
  for (const product of severe.releaseHistory.at(-1)!.products) {
    if (product.kind === "reprint") product.trustDelta = -10;
  }
  for (const product of moderate.releaseHistory.at(-1)!.products) {
    if (product.kind === "reprint") product.trustDelta = -1;
  }

  const severeNext = reduceGame(severe, { type: "ADVANCE_DAYS", days: 1 });
  const moderateNext = reduceGame(moderate, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(
    Math.round((moderateNext.purchaseTrust - severeNext.purchaseTrust) * 10_000) /
      10_000,
    1,
  );
});

test("business actions fit inside the settlement window and close before the final ban", () => {
  const state = createCampaignStart(21_006);
  state.finance.cash = 10;
  state.phase = "running";
  state.handoverComplete = true;

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
    "organized-play-platform",
  ] as const) {
    assert.equal(getBusinessActionAvailability(state, type).available, false);
  }
});

test("strategic projects snapshot context, use one campaign slot, and pay only on success", () => {
  const tooEarly = createInitialGame(21_007);
  assert.equal(
    getBusinessActionAvailability(tooEarly, "season-overhaul").available,
    false,
  );

  const ready = advanceThroughDecisions(tooEarly, 120);
  ready.finance.cash = 100;
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
  assert.equal(launchedRecord.risk, undefined);
  assert.deepEqual(launchedRecord.riskContext, profile.context);
  assert.match(
    getBusinessActionAvailability(launched, "global-launch").reason ?? "",
    /한 번|슬롯/,
  );

  const forcedSuccess = structuredClone(launched);
  forcedSuccess.operations.records.at(-1)!.risk = 0;
  for (const themeId of forcedSuccess.activeThemeIds) {
    forcedSuccess.themes[themeId].fatigue = 70;
    forcedSuccess.themes[themeId].topStreakDays = 44;
  }
  const preSeasonHistoryDay = forcedSuccess.history.at(0)?.day;
  const success = advanceThroughDecisions(forcedSuccess, 150);
  const successRecord = success.operations.records.at(-1)!;
  assert.equal(successRecord.outcome, "success");
  assert.equal(successRecord.resolvedDay, 150);
  assert.equal(successRecord.cashReturn, 6.5);
  assert.equal(success.operations.season?.currentSeasonNumber, 2);
  assert.equal(success.operations.season?.startedDay, 150);
  assert.equal(
    success.operations.season?.boundaries[0]?.sourceActionId,
    successRecord.id,
  );
  assert.equal(success.history.at(0)?.day, preSeasonHistoryDay);
  assert.ok(success.history.some((entry) => entry.day < 150));
  for (const themeId of success.activeThemeIds) {
    assert.equal(success.themes[themeId].fatigue, 0);
    assert.equal(success.themes[themeId].topStreakDays, 0);
    assert.equal(
      success.themes[themeId].previousWeekShare,
      success.themes[themeId].share,
    );
  }

  const forcedFailure = structuredClone(launched);
  forcedFailure.operations.records.at(-1)!.risk = 1;
  const failure = advanceThroughDecisions(forcedFailure, 150);
  const failureRecord = failure.operations.records.at(-1)!;
  assert.equal(failureRecord.outcome, "backlash");
  assert.equal(failureRecord.resolvedDay, 150);
  assert.equal(failureRecord.cashReturn, undefined);
  assert.deepEqual(failure.operations.season, {
    currentSeasonNumber: 1,
    startedDay: FIRST_BAN_DAY,
    boundaries: [],
  });
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
    "organized-play-platform",
  ] as const) {
    const strongProfile = getStrategicProjectRiskProfile(strong, type);
    const weakProfile = getStrategicProjectRiskProfile(weak, type);
    assert.ok(strongProfile.risk < weakProfile.risk, type);
    assert.ok(weakProfile.risk - strongProfile.risk >= 0.2, type);
  }
});

test("the tournament platform launches as a long project after a decision", () => {
  const state = createCampaignStart(21_008);
  state.day = 120;
  state.finance.cash = 100;
  state.handoverComplete = true;
  state.phase = "ban-edit";
  assert.equal(
    getBusinessActionAvailability(state, "organized-play-platform").available,
    false,
  );
  state.phase = "running";
  assert.equal(
    getBusinessActionAvailability(state, "organized-play-platform").available,
    true,
  );
});

test("a fixed early business dilemma stops advancement without stealing scheduled decision gates", () => {
  const seed = 31_001;
  const initial = createInitialGame(seed);
  assert.equal(initial.day, TUTORIAL_END_DAY);
  assert.equal(initial.operations.pendingEvent, null);
  assert.deepEqual(initial.operations.eventRecords, []);

  const offered = advanceToPendingBusinessEvent(initial);
  assert.equal(offered.day, getInitialBusinessEventDay(seed));
  assert.equal(offered.day, FIRST_BUSINESS_EVENT_DAY);
  assert.equal(offered.phase, "running");
  assert.equal(offered.operations.pendingEvent?.appearedDay, offered.day);
  assert.equal(
    offered.operations.pendingEvent?.type,
    getBusinessEventType(seed, 1),
  );
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
  assert.equal(nextEventDay, getFirstRecurringBusinessEventDay(seed));
  assert.ok(
    nextEventDay >= RECURRING_BUSINESS_EVENT_START_DAY &&
      nextEventDay <=
        RECURRING_BUSINESS_EVENT_START_DAY +
          (BUSINESS_EVENT_MAX_INTERVAL - BUSINESS_EVENT_MIN_INTERVAL),
  );
  assert.equal(isReleaseDay(nextEventDay), false);
  assert.equal(isBanDay(nextEventDay), false);

  const releaseGate = advanceToNextReleaseHandlingBusinessEvents(chosen);
  assert.equal(releaseGate.day, getNextReleaseDay(chosen.day));
  assert.equal(releaseGate.phase, "release-edit");
  assert.equal(releaseGate.operations.pendingEvent, null);
});

test("the first recurring dilemma may use DAY 60 on the original cadence", () => {
  assert.equal(isReleaseDay(60), false);
  assert.equal(getInitialBusinessEventDay(1), FIRST_BUSINESS_EVENT_DAY);
  assert.equal(getFirstRecurringBusinessEventDay(1), 60);
});

test("both dilemma choices snapshot cost and strategy, then resolve on schedule", () => {
  const seed = 31_100;
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
    if (index === 1) {
      assert.ok(
        record.appearedDay >= RECURRING_BUSINESS_EVENT_START_DAY &&
          record.appearedDay <=
            RECURRING_BUSINESS_EVENT_START_DAY +
              (BUSINESS_EVENT_MAX_INTERVAL - BUSINESS_EVENT_MIN_INTERVAL),
      );
    } else if (index > 1) {
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
