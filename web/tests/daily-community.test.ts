import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "../app/game/content.ts";
import {
  ANIMATION_PROMOTION_COPY,
  ANIMATION_PROMOTION_FINALE_COPY,
  ANIMATION_PROMOTION_MIDDLE_COPY,
  ANIMATION_PROMOTION_OPENING_COPY,
  BEGINNER_CAMP_COPY,
  COLLECTOR_FAIR_COPY,
  getAnimationPromotionCopy,
  LENDING_EXCHANGE_NETWORK_COPY,
  LOCAL_LEAGUE_COPY,
  PACK_ODDS_DETECTED_COPY,
  PACK_ODDS_RUMOR_COPY,
  STORE_TOUR_COPY,
  TOURNAMENT_BACKLASH_COPY,
  TOURNAMENT_SUCCESS_COPY,
  TV_CM_COPY,
  VENTURE_ACTION_TYPES,
  VENTURE_BUSINESS_COPY,
  VENTURE_RISK_FACTORS,
} from "../app/game/business-community-copy.ts";
import type {
  VentureActionType,
  VentureRiskFactor,
} from "../app/game/business-community-copy.ts";
import { getThemeCardMarketQuoteAtDay } from "../app/game/card-market.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  FIRST_RELEASE_DAY,
  PLAYER_START_DAY,
  PROLOGUE_SEED,
  RELEASE_INTERVAL,
} from "../app/game/campaign.ts";
import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import {
  getCommunityHeat,
  getDailyCommunityPosts,
  getReleaseReactionProfile,
} from "../app/game/daily-community.ts";
import { PLACEMENT_WINDOW_DAYS } from "../app/game/placement-meta.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionHistoricalOutcome,
} from "../app/game/restriction-policy.ts";
import {
  createCampaignStart,
  createFirstBanGame,
  createInitialGame,
  formatCommunityEvent,
  reduceGame,
} from "../app/game/engine.ts";
import { getReprintCandidates } from "../app/game/release-requests.ts";
import type {
  BusinessActionRecord,
  CommunityEvent,
  GameState,
  PowerAdjustment,
  RestrictionLimit,
  ThemeContent,
  ThemeId,
} from "../app/game/types.ts";

const FIRST_RESTRICTION_REACTION_DAY = FIRST_BAN_DAY + 1;
const FIRST_RESTRICTION_AFTERMATH_DAYS = [
  FIRST_RESTRICTION_REACTION_DAY,
  FIRST_RESTRICTION_REACTION_DAY + 1,
  FIRST_RESTRICTION_REACTION_DAY + 2,
] as const;
const FIRST_REGULAR_TEST_RELEASE_DAY = FIRST_RELEASE_DAY;
const FIRST_REPRINT_TEST_RELEASE_DAY =
  FIRST_RELEASE_DAY + RELEASE_INTERVAL * 2;
const SECOND_REGULAR_TEST_RELEASE_DAY =
  FIRST_RELEASE_DAY + RELEASE_INTERVAL * 3;
const RECENT_SUPPORT_RELEASE_DAY = FIRST_RELEASE_DAY + RELEASE_INTERVAL;
const SECOND_RESTRICTION_DAY = FIRST_BAN_DAY + BAN_INTERVAL;
const SECOND_RESTRICTION_REACTION_DAY = SECOND_RESTRICTION_DAY + 1;
// Use the fourth scheduled review so DAY 0 restrictions are old enough to
// exercise the 90-day stale/unban paths under the compressed calendar.
const REGULAR_RESTRICTION_DAY = FIRST_BAN_DAY + BAN_INTERVAL * 3;
const REGULAR_RESTRICTION_REACTION_DAY = REGULAR_RESTRICTION_DAY + 1;
const REGULAR_RESTRICTION_FOLLOWUP_DAY = REGULAR_RESTRICTION_DAY + 4;
const NEXT_REGULAR_RESTRICTION_DAY = REGULAR_RESTRICTION_DAY + BAN_INTERVAL;

function getPlannedReleaseOptions(state: GameState) {
  const options = state.releaseSlate?.options;
  assert.ok(options, "release-edit must expose a release slate");
  const requested = options.find((option) => option.requested);
  const selected = requested ? [requested] : [];
  for (const kind of ["new-theme", "support", "generic"] as const) {
    if (selected.some((option) => option.kind === kind)) continue;
    const option = options.find((candidate) => candidate.kind === kind);
    assert.ok(option, `release slate must expose a ${kind} option`);
    selected.push(option);
  }
  for (const option of options) {
    if (selected.length === 4) break;
    if (!selected.some((candidate) => candidate.id === option.id)) {
      selected.push(option);
    }
  }
  assert.equal(selected.length, 4);
  return selected;
}

function advanceThroughMilestones(
  state: GameState,
  targetDay: number,
): GameState {
  let next = state;
  while (next.day < targetDay) {
    if (next.operations.pendingEvent) {
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: next.operations.pendingEvent.id,
        choice: "a",
      });
    } else if (next.phase === "release-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: getAutomaticReleaseSelections(next),
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
    if (next.day === PLAYER_START_DAY && !next.handoverComplete) {
      next = reduceGame(next, { type: "COMPLETE_HANDOVER" });
    }
  }
  return next;
}

function addBusinessRecord(
  state: GameState,
  record: Omit<BusinessActionRecord, "id">,
): void {
  const id = `business-action-${state.operations.nextActionId}`;
  state.operations.nextActionId += 1;
  state.operations.records.push({ id, ...record });
}

test("keeps every pre-mandate community board fixed after the seed changes", () => {
  const atFirstBan = createFirstBanGame(PROLOGUE_SEED);
  const beforeHandover = new Map(
    Array.from({ length: FIRST_BAN_DAY }, (_, index) => {
      const day = index + 1;
      return [day, getDailyCommunityPosts(atFirstBan, day)] as const;
    }),
  );
  const campaignSeed = 0xdecafbad;
  const assigned = reduceGame(atFirstBan, {
    type: "SUBMIT_BAN",
    changes: {},
    campaignSeed,
  });

  assert.notEqual(assigned.seed, PROLOGUE_SEED);
  assert.equal(assigned.seed, campaignSeed);
  for (let day = 1; day <= FIRST_BAN_DAY; day += 1) {
    const before = beforeHandover.get(day);
    assert.ok(before);
    assert.equal(before.length, 20, `DAY ${day} pre-handover board`);
    assert.deepEqual(
      getDailyCommunityPosts(assigned, day),
      before,
      `DAY ${day} must keep the fixed prologue board`,
    );
  }
});

test("business reactions provide two hundred distinct community voices", () => {
  const pools = [
    TV_CM_COPY,
    ANIMATION_PROMOTION_COPY,
    TOURNAMENT_SUCCESS_COPY,
    TOURNAMENT_BACKLASH_COPY,
    PACK_ODDS_RUMOR_COPY,
    PACK_ODDS_DETECTED_COPY,
    STORE_TOUR_COPY,
  ];
  const all = pools.flat();
  assert.equal(all.length, 200);
  assert.equal(new Set(all).size, 200);
});

test("animation copy follows the configured broadcast timeline", () => {
  assert.equal(ANIMATION_PROMOTION_OPENING_COPY.length, 10);
  assert.equal(ANIMATION_PROMOTION_MIDDLE_COPY.length, 10);
  assert.equal(ANIMATION_PROMOTION_FINALE_COPY.length, 8);
  assert.ok(ANIMATION_PROMOTION_COPY.every((body) => !body.includes("반년")));

  const opening = getAnimationPromotionCopy(1, 75);
  const middle = getAnimationPromotionCopy(31, 75);
  const finale = getAnimationPromotionCopy(70, 75);

  assert.ok(opening.some((body) => body.includes("방영 1일차")));
  assert.ok(opening.every((body) => !/결승전|편성이 끝나도|재탕/.test(body)));
  assert.ok(middle.some((body) => body.includes("방영 5주차")));
  assert.ok(middle.every((body) => !/제작 발표|첫 PV|결승전|편성이 끝나도/.test(body)));
  assert.ok(finale.some((body) => body.includes("방영 70일째")));
  assert.ok(finale.some((body) => body.includes("총 75일 편성")));
  assert.ok([...opening, ...middle, ...finale].every((body) => !/[{}]/.test(body)));

  assert.ok(getAnimationPromotionCopy(15, 75).some((body) => body.includes("방영 15일차")));
  assert.ok(getAnimationPromotionCopy(16, 75).some((body) => body.includes("방영 3주차")));
  assert.ok(getAnimationPromotionCopy(60, 75).some((body) => body.includes("방영 9주차")));
  assert.ok(getAnimationPromotionCopy(61, 75).some((body) => body.includes("방영 61일째")));
});

function makeRuntime(theme: ThemeContent, share: number): GameState["themes"][string] {
  const launchParts = theme.parts.slice(0, INITIAL_THEME_PART_COUNT);
  return {
    share,
    previousWeekShare: share,
    winRate: 0.5,
    power: theme.basePower,
    unpleasantness: theme.baseUnpleasantness,
    fatigue: 10,
    legalLimits: Object.fromEntries(launchParts.map((part) => [part.id, 3])),
    partStats: Object.fromEntries(
      launchParts.map((part) => [
        part.id,
        {
          usageRate: part.inclusion,
          averageCopies: part.averageCopies,
        },
      ]),
    ),
    lastSupportDay: null,
    freshness: 50,
    topStreakDays: 0,
    counterProgress: 0,
    counterThreshold: 100,
    counterAdoption: 0,
    counterDiscoveredDay: null,
    counterBuild: 0,
    supportPower: 0,
    supportUnpleasantness: 0,
    supportCount: 0,
    releasedPartIds: launchParts.map((part) => part.id),
    lastSupportAdjustment: null,
    supportReplacementPressure: 0,
  };
}

function makeState(seed = 7301): GameState {
  const active = THEMES.slice(0, 5);
  const shares = [0.32, 0.25, 0.2, 0.13, 0.1];
  const themes = Object.fromEntries(
    active.map((theme, index) => [
      theme.id,
      makeRuntime(theme, shares[index]),
    ]),
  );

  return {
    schemaVersion: 9,
    seed,
    day: 60,
    phase: "running",
    activeThemeIds: active.map((theme) => theme.id),
    themes,
    users: { tier: 35_000, casual: 45_000, collector: 20_000 },
    finance: {
      today: 0.7,
      rolling30: 18,
      cumulative: 35,
      cash: 13.7,
      todayOperatingCash: 0.224,
      todayOperatingCost: 0.03,
      cumulativeOperatingCosts: 0.42,
      cumulativeExpenses: 0,
    },
    operations: {
      nextActionId: 1,
      records: [],
      nextEventId: 1,
      nextEventDay: null,
      pendingEvent: null,
      eventRecords: [],
      strategy: { audience: 0, product: 0, posture: 0 },
      season: {
        currentSeasonNumber: 1,
        startedDay: 0,
        boundaries: [],
      },
    },
    community: [],
    supportRequests: [],
    releaseSlate: null,
    releaseHistory: [],
    genericLimits: {},
    genericReleaseStartDay: null,
    history: [
      {
        day: 15,
        totalUsers: 100_000,
        revenue: 0.5,
        topThemeId: active[0].id,
        shares: {
          [active[0].id]: 0.6,
          [active[1].id]: 0.4,
        },
      },
    ],
    recentRevenue: [],
    lastSupportProposalDay: null,
    nextSupportRequestId: 1,
    nextReleaseOptionId: 1,
    nextCommunityId: 1,
    currentTopThemeId: active[0].id,
    purchaseTrust: 80,
    handoverComplete: true,
  };
}

type RestrictionFixtureChange = {
  themeId: ThemeId;
  partId: string;
  oldLimit: RestrictionLimit;
  newLimit: RestrictionLimit;
  type?: "restriction-applied" | "cosmetic-restriction";
};

function makeRestrictionReactionState(
  changes: readonly RestrictionFixtureChange[],
  seed = 34_001,
): GameState {
  const state = makeState(seed);
  state.day = FIRST_RESTRICTION_REACTION_DAY + 2;
  state.phase = "running";
  state.community = changes.map((change, index) => {
    const content = THEME_BY_ID[change.themeId];
    const part = content.parts.find((candidate) => candidate.id === change.partId);
    assert.ok(part);
    state.themes[change.themeId].legalLimits[change.partId] = change.newLimit;
    return {
      id: `fixture-restriction-${index + 1}`,
      day: FIRST_BAN_DAY,
      category: "restriction" as const,
      type: change.type ?? "restriction-applied",
      themeId: change.themeId,
      partId: change.partId,
      value: change.newLimit,
      previousValue: change.oldLimit,
      body: `[운영 공지] ${part.name} ${change.oldLimit}→${change.newLimit}장`,
    };
  });
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  state.history = [
    FIRST_BAN_DAY,
    ...FIRST_RESTRICTION_AFTERMATH_DAYS,
  ].map((day) => ({
    day,
    totalUsers: 100_000,
    revenue: 0.5,
    topThemeId: state.currentTopThemeId,
    shares: { ...shares },
  }));
  return state;
}

function restrictionContextPosts(
  state: GameState,
  day: number,
  decisionDay = FIRST_BAN_DAY,
): CommunityEvent[] {
  const anchorKeys = new Set(
    state.community
      .filter((event) => event.day === decisionDay && event.partId)
      .map((event) => `${event.themeId}:${event.partId}`),
  );
  const storedIds = new Set(
    state.community
      .filter(
        (event) =>
          event.day === day &&
          event.type === "restriction-demand" &&
          event.partId &&
          anchorKeys.has(`${event.themeId}:${event.partId}`),
      )
      .map((event) => event.id),
  );
  return getDailyCommunityPosts(state, day).filter(
    (post) =>
      post.id.startsWith(`daily-restriction-${decisionDay}-`) ||
      storedIds.has(post.id),
  );
}

function makeScheduledRestrictionReactionState(
  changes: readonly RestrictionFixtureChange[],
  seed = 34_501,
  decisionDay = REGULAR_RESTRICTION_DAY,
): GameState {
  const state = makeState(seed);
  state.day = decisionDay + 7;
  state.phase = "running";
  state.community = changes.map((change, index) => {
    const content = THEME_BY_ID[change.themeId];
    const part = content.parts.find((candidate) => candidate.id === change.partId);
    assert.ok(part);
    state.themes[change.themeId].legalLimits[change.partId] = change.newLimit;
    return {
      id: `scheduled-restriction-${index + 1}`,
      day: decisionDay,
      category: "restriction" as const,
      type: change.type ?? "restriction-applied",
      themeId: change.themeId,
      partId: change.partId,
      value: change.newLimit,
      previousValue: change.oldLimit,
      body: `[운영 공지] ${part.name} ${change.oldLimit}→${change.newLimit}장`,
    };
  });
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  state.history = Array.from({ length: 8 }, (_, index) => ({
    day: decisionDay + index,
    totalUsers: 100_000,
    revenue: 0.5,
    topThemeId: state.currentTopThemeId,
    shares: { ...shares },
  }));
  return state;
}

function setRestrictionFollowupSnapshot(
  state: GameState,
  day: number,
  shares: Readonly<Record<ThemeId, number>>,
  totalUsers = 100_000,
): void {
  const snapshot = state.history.find((entry) => entry.day === day);
  assert.ok(snapshot);
  snapshot.shares = { ...shares };
  snapshot.totalUsers = totalUsers;
  snapshot.topThemeId = Object.entries(shares).sort(
    ([leftId, left], [rightId, right]) =>
      right - left || leftId.localeCompare(rightId),
  )[0][0];
}

function setRestrictionDecisionMeta(
  state: GameState,
  day: number,
  shares: Readonly<Record<ThemeId, number>>,
  winRates: Readonly<Record<ThemeId, number>>,
): void {
  const snapshot = state.history.find((entry) => entry.day === day);
  assert.ok(snapshot);
  snapshot.shares = { ...shares };
  snapshot.winRates = { ...winRates };
  snapshot.topThemeId = Object.entries(shares).sort(
    ([leftId, left], [rightId, right]) =>
      right - left || leftId.localeCompare(rightId),
  )[0][0];
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    const share = shares[themeId];
    const winRate = winRates[themeId];
    if (runtime && Number.isFinite(share)) {
      runtime.share = share;
      runtime.previousWeekShare = share;
    }
    if (runtime && Number.isFinite(winRate)) runtime.winRate = winRate;
  }
}

function setRestrictionPlacementWindow(
  state: GameState,
  decisionDay: number,
  shares: Readonly<Record<ThemeId, number>>,
  winRates: Readonly<Record<ThemeId, number>>,
  dailyPlacements: Readonly<Record<ThemeId, number>>,
): void {
  state.history = Array.from({ length: PLACEMENT_WINDOW_DAYS }, (_, index) => ({
    day: decisionDay - PLACEMENT_WINDOW_DAYS + 1 + index,
    totalUsers: 100_000,
    revenue: 0.5,
    topThemeId: Object.entries(shares).sort(
      ([leftId, left], [rightId, right]) =>
        right - left || leftId.localeCompare(rightId),
    )[0][0],
    shares: { ...shares },
    winRates: { ...winRates },
    topCutPlacements: { ...dailyPlacements },
  }));
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (!runtime) continue;
    runtime.share = shares[themeId];
    runtime.previousWeekShare = shares[themeId];
    runtime.winRate = winRates[themeId];
  }
}

function releaseWithMixedReactions(seed = 9191): GameState {
  let state = createInitialGame(seed);
  const restriction = state.community.find(
    (event) =>
      event.day === FIRST_BAN_DAY &&
      (event.type === "restriction-applied" || event.type === "cosmetic-restriction"),
  );
  assert.ok(restriction);
  const restrictedThemeId = restriction.themeId;
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: restrictedThemeId,
    direction: "consistency",
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: FIRST_REGULAR_TEST_RELEASE_DAY - state.day,
  });
  state = advanceThroughMilestones(state, FIRST_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.day, FIRST_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  const selected = getPlannedReleaseOptions(state);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: ([0, 3, -3, 0] as const)[index],
    })),
  });
}

function emergingThemeTrajectoryState(
  trajectory: "weak-to-strong" | "strong-to-weak",
  seed: number,
): { state: GameState; themeId: ThemeId } {
  let state = releaseWithMixedReactions(seed);
  state = advanceThroughMilestones(
    state,
    FIRST_REGULAR_TEST_RELEASE_DAY + PLACEMENT_WINDOW_DAYS,
  );
  const release = state.releaseHistory.find(
    (batch) => batch.day === FIRST_REGULAR_TEST_RELEASE_DAY,
  );
  const themeId = release?.products.find(
    (product) => product.kind === "new-theme",
  )?.themeId;
  assert.ok(themeId);
  const otherIds = state.activeThemeIds.filter(
    (candidate) => candidate !== themeId,
  );
  const otherPlacementId = otherIds[0];
  assert.ok(otherPlacementId);

  for (const entry of state.history) {
    if (
      entry.day < FIRST_REGULAR_TEST_RELEASE_DAY + 1 ||
      entry.day > FIRST_REGULAR_TEST_RELEASE_DAY + PLACEMENT_WINDOW_DAYS
    ) continue;
    const early = entry.day <= FIRST_REGULAR_TEST_RELEASE_DAY + 3;
    const targetStrong = trajectory === "weak-to-strong" ? !early : early;
    const targetShare = 0.35;
    const otherShare = (1 - targetShare) / otherIds.length;
    entry.shares = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === themeId ? targetShare : otherShare,
      ]),
    );
    entry.winRates = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === themeId ? (targetStrong ? 0.58 : 0.46) : 0.5,
      ]),
    );
    entry.topCutPlacements = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === themeId
          ? targetStrong ? 20 : 0
          : candidate === otherPlacementId
            ? targetStrong ? 12 : 32
            : 0,
      ]),
    );
    entry.topThemeId = themeId;
  }
  return { state, themeId };
}

function supportReactionState(
  themeStrength: "strong" | "weak",
  adjustment: PowerAdjustment,
  replacement: boolean,
  seed = 44001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const target = THEME_BY_ID[targetId];
  const targetShare = themeStrength === "strong" ? 0.34 : 0.04;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      themeId === targetId ? targetShare : otherShare,
    ]),
  );
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = shares[themeId];
    state.themes[themeId].previousWeekShare = shares[themeId];
  }

  const runtime = state.themes[targetId];
  const launchParts = target.parts.slice(0, INITIAL_THEME_PART_COUNT);
  const newParts = target.parts.slice(
    INITIAL_THEME_PART_COUNT,
    INITIAL_THEME_PART_COUNT + SUPPORT_PARTS_PER_RELEASE,
  );
  runtime.supportCount = 1;
  runtime.releasedPartIds = [...launchParts, ...newParts].map((part) => part.id);
  runtime.lastSupportDay = 60;
  runtime.lastSupportAdjustment = adjustment;
  runtime.supportReplacementPressure = replacement ? 0.62 : 0.08;
  runtime.legalLimits = Object.fromEntries(
    [...launchParts, ...newParts].map((part) => [part.id, 3]),
  );
  runtime.partStats = Object.fromEntries(
    [
      ...launchParts.map((part) => [
        part.id,
        {
          usageRate: part.inclusion * (replacement ? 0.42 : 0.96),
          averageCopies: part.averageCopies,
        },
      ] as const),
      ...newParts.map((part, index) => [
        part.id,
        {
          usageRate: replacement ? 0.96 - index * 0.04 : adjustment >= 2 ? 0.7 : 0.28,
          averageCopies: part.averageCopies,
        },
      ] as const),
    ],
  );

  state.day = 64;
  state.currentTopThemeId = themeStrength === "strong" ? targetId : state.activeThemeIds[1];
  state.community = [];
  state.releaseHistory = [
    {
      day: 60,
      releaseKind: "regular",
      products: [
        {
          optionId: `support-cross-${themeStrength}-${adjustment}`,
          kind: "support",
          themeId: targetId,
          direction: "consistency",
          expectedTier: adjustment >= 2 ? "Tier 1" : "Tier 3",
          powerAdjustment: adjustment,
        },
      ],
    },
  ];
  const makeHistory = (day: number) => ({
    day,
    totalUsers: 100_000,
    revenue: 0.5,
    topThemeId: state.currentTopThemeId,
    shares: { ...shares },
  });
  state.history = [makeHistory(20), makeHistory(60)];
  return state;
}

type UnbanFixtureTone =
  | "overdue"
  | "dangerous"
  | "surge"
  | "no-impact"
  | "measured";

function unbanReactionState(
  tone: UnbanFixtureTone,
  seed = 62001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const content = THEME_BY_ID[targetId];
  const part = content.parts[0];
  const pathByTone: Record<UnbanFixtureTone, readonly [number, number, number, number]> = {
    overdue: [0.04, 0.045, 0.048, 0.051],
    dangerous: [0.28, 0.281, 0.283, 0.285],
    surge: [0.09, 0.102, 0.108, 0.115],
    "no-impact": [0.06, 0.061, 0.062, 0.063],
    measured: [0.13, 0.135, 0.139, 0.144],
  };
  const sharesFor = (targetShare: number) => {
    const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
    return Object.fromEntries(
      state.activeThemeIds.map((themeId) => [
        themeId,
        themeId === targetId ? targetShare : otherShare,
      ]),
    );
  };
  state.day = REGULAR_RESTRICTION_DAY + 3;
  state.phase = "running";
  state.community = [
    {
      id: "old-restriction-start",
      day: FIRST_BAN_DAY,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 1,
      previousValue: 3,
      body: `[운영 공지] ${part.name} 1장 적용`,
    },
    {
      id: "long-restriction-unban",
      day: REGULAR_RESTRICTION_DAY,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 3,
      previousValue: 1,
      body: `[운영 공지] ${part.name} 3장 적용`,
    },
  ];
  const shares = pathByTone[tone];
  state.history = shares.map((targetShare, index) => {
    const day = REGULAR_RESTRICTION_DAY + index;
    const dayShares = sharesFor(targetShare);
    const topThemeId = [...state.activeThemeIds].sort(
      (left, right) => dayShares[right] - dayShares[left],
    )[0];
    return {
      day,
      totalUsers: 10_000,
      revenue: 0.5,
      topThemeId,
      shares: dayShares,
    };
  });
  const currentShares = state.history.at(-1)!.shares;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = currentShares[themeId];
    state.themes[themeId].previousWeekShare = currentShares[themeId];
  }
  state.themes[targetId].legalLimits[part.id] = 3;
  state.currentTopThemeId = state.history.at(-1)!.topThemeId;
  return state;
}

function staleRestrictionState(
  withNoChange: boolean,
  seed = 63001,
): GameState {
  const state = makeState(seed);
  const targetId = state.activeThemeIds[0];
  const part = THEME_BY_ID[targetId].parts[0];
  const targetShare = 0.04;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      themeId === targetId ? targetShare : otherShare,
    ]),
  );
  state.day = REGULAR_RESTRICTION_DAY + 35;
  state.phase = "running";
  state.community = [
    {
      id: "stale-restriction-start",
      day: FIRST_BAN_DAY,
      category: "restriction",
      type: "restriction-applied",
      themeId: targetId,
      partId: part.id,
      value: 1,
      previousValue: 3,
      body: `[운영 공지] ${part.name} 1장 적용`,
    },
  ];
  if (withNoChange) {
    const topId = state.activeThemeIds[1];
    const topPart = THEME_BY_ID[topId].parts[0];
    state.community.push({
      id: "stale-no-change",
      day: REGULAR_RESTRICTION_DAY,
      category: "restriction",
      type: "restriction-no-change",
      themeId: topId,
      partId: topPart.id,
      value: 3,
      previousValue: 3,
      body: "[운영 공지] 금제 변경 없음",
    });
  }
  state.history = [
    REGULAR_RESTRICTION_DAY - 30,
    REGULAR_RESTRICTION_DAY - 29,
    REGULAR_RESTRICTION_DAY - 28,
    REGULAR_RESTRICTION_DAY,
    REGULAR_RESTRICTION_DAY + 35,
  ].map((day) => ({
    day,
    totalUsers: 10_000,
    revenue: 0.5,
    topThemeId: state.activeThemeIds[1],
    shares: { ...shares },
  }));
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = shares[themeId];
    state.themes[themeId].previousWeekShare = shares[themeId];
  }
  state.themes[targetId].legalLimits[part.id] = 1;
  state.currentTopThemeId = state.activeThemeIds[1];
  return state;
}

function makeNoChangeRestrictionState(seed = 2208): GameState {
  const state = structuredClone(
    reduceGame(createInitialGame(seed), { type: "ADVANCE_DAYS", days: 2 }),
  );
  state.community = state.community.filter(
    (event) =>
      !(
        (event.day === FIRST_BAN_DAY &&
          (event.type === "restriction-applied" ||
            event.type === "cosmetic-restriction")) ||
        (event.day === FIRST_RESTRICTION_REACTION_DAY &&
          event.type === "restriction-demand" &&
          event.partId === "cycle-gate")
      ),
  );
  state.community.push({
    id: "no-change-announcement",
    day: FIRST_BAN_DAY,
    category: "restriction",
    type: "restriction-no-change",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 2,
    previousValue: 2,
    body: "[운영 공지] 금제 변경 없음 — 윤회 현행 유지",
  });
  return state;
}

function setNoChangeMetaHealth(state: GameState, unhealthy: boolean): void {
  const targetShare = unhealthy ? 0.4 : 0.18;
  const otherShare = (1 - targetShare) / (state.activeThemeIds.length - 1);
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.share = themeId === "cycle" ? targetShare : otherShare;
    runtime.previousWeekShare = runtime.share;
    if (themeId === "cycle") {
      runtime.unpleasantness = unhealthy ? 92 : 32;
      runtime.fatigue = unhealthy ? 84 : 12;
      runtime.topStreakDays = unhealthy ? 90 : 4;
    }
  }
  const decisionHistory = state.history.find(
    (entry) => entry.day === FIRST_BAN_DAY,
  );
  assert.ok(decisionHistory);
  const decisionThemeIds = Object.keys(decisionHistory.shares) as ThemeId[];
  decisionHistory.shares = Object.fromEntries(
    decisionThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  decisionHistory.winRates = Object.fromEntries(
    decisionThemeIds.map((themeId) => [
      themeId,
      unhealthy && themeId === "cycle" ? 0.64 : unhealthy ? 0.46 : 0.5,
    ]),
  );
  decisionHistory.topCutPlacements = Object.fromEntries(
    decisionThemeIds.map((themeId, index) => [
      themeId,
      unhealthy
        ? themeId === "cycle" ? 20 : 3
        : index < 2 ? 7 : 6,
    ]),
  );
  decisionHistory.topThemeId = "cycle";
}

test("returns twenty stable posts from DAY 0 without mutation", () => {
  const state = makeState(20260816);
  const before = JSON.stringify(state);

  for (let day = FIRST_BAN_DAY; day <= state.day; day += 1) {
    const first = getDailyCommunityPosts(state, day);
    const second = getDailyCommunityPosts(state, day);
    assert.equal(first.length, 20, `DAY ${day}`);
    assert.equal(new Set(first.map((post) => post.id)).size, 20);
    assert.deepEqual(first, second);
  }

  assert.equal(JSON.stringify(state), before);
  assert.throws(() => getDailyCommunityPosts(state, FIRST_BAN_DAY - 1), RangeError);
  assert.throws(() => getDailyCommunityPosts(state, state.day + 1), RangeError);
});

test("cycles through all 192 ordinary copy templates before repeating", () => {
  const state = makeState(90125);
  const templateKeys = new Set<string>();
  const firstCycleKeys: string[] = [];

  for (let day = 1; day <= 30; day += 1) {
    const dailyPrefixes = new Set<string>();
    for (const post of getDailyCommunityPosts(state, day)) {
      const match = post.id.match(
        /-(meta|deck|counter|ban|fan|newbie|tourney|price)-(\d{2,})$/,
      );
      assert.ok(match, post.id);
      const key = `${match[1]}-${match[2]}`;
      templateKeys.add(key);
      dailyPrefixes.add(match[1]);
      if (firstCycleKeys.length < 192) firstCycleKeys.push(key);
      assert.doesNotMatch(post.body, /\{[a-zA-Z][^}]*\}/);
    }
    assert.equal(dailyPrefixes.size, 8, `DAY ${day}`);
  }

  assert.equal(templateKeys.size, 192);
  assert.equal(new Set(firstCycleKeys).size, 192);
  for (const prefix of [
    "meta",
    "deck",
    "counter",
    "ban",
    "fan",
    "newbie",
    "tourney",
    "price",
  ]) {
    assert.equal(
      [...templateKeys].filter((key) => key.startsWith(`${prefix}-`)).length,
      24,
      prefix,
    );
  }
});

test("DAY 0 emergency-review board debates restrictions before publication", () => {
  const state = createCampaignStart(PROLOGUE_SEED);
  const decisionTypes = new Set<CommunityEvent["type"]>([
    "restriction-applied",
    "cosmetic-restriction",
    "restriction-no-change",
  ]);
  const appliedChangeCopy =
    /(?:[0-3]\s*→\s*[0-3](?:는|로|으로)|(?:금지|제한|준제한)(?:됐|되었|먹었|적용)|금제표.*(?:나왔|공개|발표|변경)|(?:바꿨|낮췄|조정했))/;
  const syntheticRestrictionPosts = getDailyCommunityPosts(
    state,
    FIRST_BAN_DAY,
  ).filter(
    (post) =>
      post.id.startsWith("daily-generated-") &&
      post.category === "restriction",
  );
  assert.ok(syntheticRestrictionPosts.length > 0);
  for (const post of syntheticRestrictionPosts) {
    assert.equal(decisionTypes.has(post.type), false, post.id);
    assert.equal(post.value, undefined, post.id);
    assert.equal(post.previousValue, undefined, post.id);
    assert.doesNotMatch(post.body, appliedChangeCopy, post.id);
  }
});

test("every seeded template stride reaches the full ordinary pool", () => {
  for (let seed = 0; seed < 64; seed += 1) {
    const state = makeState(seed * 7_919);
    const firstCycleKeys: string[] = [];

    for (let day = 1; day <= 10 && firstCycleKeys.length < 192; day += 1) {
      for (const post of getDailyCommunityPosts(state, day)) {
        const match = post.id.match(
          /-(meta|deck|counter|ban|fan|newbie|tourney|price)-(\d{2,})$/,
        );
        assert.ok(match, `${seed}: ${post.id}`);
        if (firstCycleKeys.length < 192) {
          firstCycleKeys.push(`${match[1]}-${match[2]}`);
        }
      }
    }

    assert.equal(new Set(firstCycleKeys).size, 192, `seed ${seed}`);
  }
});

test("generated part names avoid stacked possessive particles", () => {
  const repeatedPossessives = THEMES.flatMap((theme) =>
    theme.parts.filter(
      (part) => (part.name.match(/의 /g) ?? []).length > 1,
    ),
  );
  assert.deepEqual(repeatedPossessives, []);
});

test("uses only historically active themes and valid card references", () => {
  const state = makeState(4404);
  const historicalIds = new Set([
    state.activeThemeIds[0],
    state.activeThemeIds[1],
  ]);

  for (const post of getDailyCommunityPosts(state, 15)) {
    assert.ok(historicalIds.has(post.themeId));
    const theme = THEME_BY_ID[post.themeId];
    assert.ok(theme);
    assert.ok(post.partId);
    assert.ok(theme.parts.some((part) => part.id === post.partId));
    if (post.relatedThemeId) assert.ok(THEME_BY_ID[post.relatedThemeId]);
    assert.ok(post.body.length > 10);
    assert.doesNotMatch(post.body, /\{(?:theme|other|part|share|copies|day)\}/);
  }

  const currentIds = new Set(state.activeThemeIds);
  assert.ok(
    getDailyCommunityPosts(state, 14).every((post) =>
      currentIds.has(post.themeId),
    ),
  );
});

test("places stored special events first and returns defensive copies", () => {
  const state = makeState(88);
  const theme = THEMES[0];
  const specialEvents: CommunityEvent[] = [
    {
      id: "community-special-a",
      day: 20,
      category: "counter",
      type: "counter-found",
      themeId: theme.id,
      partId: theme.parts[0].id,
      body: "실전에서 새 카운터가 발견됐다",
    },
    {
      id: "community-special-b",
      day: 20,
      category: "restriction",
      type: "restriction-demand",
      themeId: theme.id,
      partId: theme.parts[1].id,
      body: "금제 토론이 빠르게 올라오는 중",
    },
  ];
  state.community.push(...specialEvents);

  const posts = getDailyCommunityPosts(state, 20);
  assert.equal(posts.length, 20);
  assert.deepEqual(
    posts.slice(0, 2).map((post) => post.id),
    specialEvents.map((event) => event.id),
  );
  assert.notStrictEqual(posts[0], state.community[0]);

  posts[0].body = "returned copy changed";
  assert.equal(state.community[0].body, "실전에서 새 카운터가 발견됐다");
});

test("bursts for four release days without ordinary illustration chatter", () => {
  let state = releaseWithMixedReactions();
  const expectedContextCounts = [16, 12, 8, 5];
  const supportProduct = state.releaseHistory
    .find((batch) => batch.day === FIRST_REGULAR_TEST_RELEASE_DAY)
    ?.products.find((product) => product.kind === "support");
  assert.ok(supportProduct && supportProduct.kind === "support");
  const restrictedPartId = state.themes[supportProduct.themeId].releasedPartIds.find(
    (partId) => state.themes[supportProduct.themeId].legalLimits[partId] === 3,
  );
  assert.ok(restrictedPartId);
  state = advanceThroughMilestones(state, SECOND_RESTRICTION_DAY);
  assert.equal(state.day, SECOND_RESTRICTION_DAY);
  assert.equal(state.phase, "ban-edit");
  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: { [restrictedPartId]: 1 },
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: supportProduct.themeId,
    direction: "consistency",
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: SECOND_REGULAR_TEST_RELEASE_DAY - state.day,
  });
  state = advanceThroughMilestones(state, SECOND_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.day, SECOND_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  const selected = getPlannedReleaseOptions(state);
  const selectedNewThemes = selected.filter((option) => option.kind === "new-theme");
  assert.equal(selectedNewThemes.length, 2);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: option.id === selectedNewThemes[0].id
        ? 3
        : option.id === selectedNewThemes[1].id
          ? -3
          : 0,
    })),
  });
  const releaseDay = SECOND_REGULAR_TEST_RELEASE_DAY;

  assert.equal(getReleaseReactionProfile(state, releaseDay).surge, false);
  assert.equal(
    getDailyCommunityPosts(state, releaseDay).some((post) =>
      post.id.startsWith("daily-release-"),
    ),
    false,
  );
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 4 });
  const before = JSON.stringify(state);
  for (let lifecycleIndex = 0; lifecycleIndex < 4; lifecycleIndex += 1) {
    const age = lifecycleIndex + 1;
    const day = releaseDay + age;
    const profile = getReleaseReactionProfile(state, day);
    const posts = getDailyCommunityPosts(state, day);
    const storedReleaseCount = posts.filter(
      (post) =>
        post.id.startsWith("community-") &&
        (post.type === "release-reaction" || post.type === "support-released"),
    ).length;
    const generatedReleaseCount = posts.filter((post) =>
      post.id.startsWith("daily-release-"),
    ).length;
    const contextualReleasePosts = posts.filter(
      (post) =>
        post.id.startsWith("daily-release-") ||
        (post.id.startsWith("community-") &&
          (post.type === "release-reaction" || post.type === "support-released")),
    );

    assert.equal(posts.length, 20);
    assert.equal(profile.surge, true);
    assert.equal(profile.age, age);
    assert.equal(profile.flags.greed, true);
    assert.equal(profile.flags.weak, true);
    assert.equal(profile.flags.backlash, true);
    assert.equal(
      storedReleaseCount + generatedReleaseCount,
      expectedContextCounts[lifecycleIndex],
      `DAY +${age}`,
    );
    assert.equal(
      contextualReleasePosts.filter((post) => post.id.endsWith("-art")).length,
      0,
      `ordinary DAY +${age} release must not allocate an illustration slot\n${contextualReleasePosts.map((post) => `${post.id}: ${post.body}`).join("\n")}`,
    );
    assert.equal(
      posts.filter((post) =>
        /일러|색감|팬아트|비주얼|풀아트|카드명/.test(post.body)
      ).length,
      0,
      `ordinary DAY +${age} board must stay focused on play and market results`,
    );
    assert.ok(
      posts.every((post) => !post.body.includes("발매 다음 날인데")),
    );
    assert.ok(getCommunityHeat(state, day) >= profile.heat);
  }

  const launchPosts = getDailyCommunityPosts(state, releaseDay + 1);
  assert.ok(
    launchPosts.some((post) => post.body.includes("이럴 거면 금제 왜 함")),
  );
  assert.equal(JSON.stringify(state), before);
});

test("keeps one illustration reaction only for a high-priced high-illustration listing", () => {
  const state = makeState(9_190);
  const themeId = "white-night" as ThemeId;
  const cardId = "white-night-saint";
  const reference = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    cardId,
    59,
    1,
  );
  assert.ok(reference);
  state.releaseHistory.push({
    day: 59,
    releaseKind: "reprint",
    products: [
      {
        optionId: "collector-premium-reprint",
        kind: "reprint",
        cardId,
        themeId,
        requestId: "collector-premium-request",
        expectedTier: "Tier 2",
        powerAdjustment: 0,
        referencePrice: reference.price,
        trustDelta: -1,
        accessibilityUserGain: 0,
        collectorUserLoss: 0,
        releaseRevenueBoost: 0,
      },
    ],
  });

  const quote = getThemeCardMarketQuoteAtDay(state, themeId, cardId, 60, 1);
  assert.ok(quote);
  assert.equal(quote.collectorLabel, "하이 일러스트");
  assert.ok(quote.price >= 50_000);
  assert.ok(quote.collectorDemandScore >= 80);

  const board = getDailyCommunityPosts(state, 60);
  const contextual = board.filter((post) =>
    post.id.startsWith("daily-release-59-collector-premium-reprint-")
  );
  const illustration = contextual.filter((post) => post.id.endsWith("-art"));
  assert.equal(illustration.length, 1);
  assert.equal(illustration[0].partId, cardId);
  assert.match(
    illustration[0].body,
    /하이 일러스트|일러|비주얼|풀아트|색감|수집|컬렉터/,
  );
  assert.match(illustration[0].body, /시세|가격|매물|고가|프리미엄|원/);
  assert.equal(
    board.filter((post) =>
      /일러|색감|팬아트|비주얼|풀아트|카드명/.test(post.body)
    ).length,
    1,
  );
});

test("emerging themes keep cautious and data-led voices together without reading the UI badge aloud", () => {
  const { state, themeId } = emergingThemeTrajectoryState(
    "weak-to-strong",
    9_291,
  );
  for (const day of [
    FIRST_REGULAR_TEST_RELEASE_DAY + 2,
    FIRST_REGULAR_TEST_RELEASE_DAY + 3,
    FIRST_REGULAR_TEST_RELEASE_DAY + 6,
  ]) {
    const emerging = getDailyCommunityPosts(state, day).filter((post) =>
      post.id.startsWith("daily-emerging-") && !post.id.endsWith("-reversal")
    );
    assert.equal(emerging.length, 2, `DAY ${day}`);
    assert.ok(emerging.some((post) => post.id.endsWith("-caution")));
    assert.ok(emerging.some((post) => post.id.endsWith("-evaluation")));
    assert.ok(emerging.every((post) => post.themeId === themeId));
    assert.ok(
      emerging.some((post) =>
        /나온 지|고작|치 성적|첫 대회|연구 기간|지금 수치/.test(post.body)
      ),
    );
    assert.ok(
      emerging.some((post) =>
        /채용률|승률|탑컷 점유율|본선 진출률|입상|표본|수치|성적|결과|상위 테이블|지역 매칭|인기 덱/.test(post.body)
      ),
      `DAY ${day}: ${emerging.map((post) => post.body).join(" / ")}`,
    );
    assert.ok(emerging.every((post) => !/\d+\/7|집계/.test(post.body)));
    assert.ok(
      emerging.every((post) => !/(?:[0-3]티어|Tier\s*[0-3])/.test(post.body)),
    );
  }

  const earlyEvaluation = getDailyCommunityPosts(
    state,
    FIRST_REGULAR_TEST_RELEASE_DAY + 2,
  ).find((post) =>
    post.id.endsWith("-evaluation")
  );
  const laterEvaluation = getDailyCommunityPosts(
    state,
    FIRST_REGULAR_TEST_RELEASE_DAY + 6,
  ).find((post) =>
    post.id.endsWith("-evaluation")
  );
  assert.ok(earlyEvaluation);
  assert.ok(laterEvaluation);
  assert.match(earlyEvaluation.body, /거품|불안|채용만 높은/);
  assert.match(
    laterEvaluation.body,
    /기대|시작은 좋|강할 가능성|성적표|긍정|좋은 출발|기본 체급|좋은 성적/,
  );
  for (
    let day = FIRST_REGULAR_TEST_RELEASE_DAY + 1;
    day <= FIRST_REGULAR_TEST_RELEASE_DAY + 6;
    day += 1
  ) {
    const aboutEmergingTheme = getDailyCommunityPosts(state, day).filter(
      (post) => post.themeId === themeId || post.relatedThemeId === themeId,
    );
    assert.ok(aboutEmergingTheme.length > 0, `DAY ${day}`);
    assert.ok(
      aboutEmergingTheme.every((post) =>
        !/(?:[0-3]티어|Tier\s*[0-3])/.test(post.body)
      ),
      `DAY ${day}: ${aboutEmergingTheme.map((post) => post.body).join("\n")}`,
    );
  }
});

test("zero-placement low-adoption emerging themes stay neutral while evidence is inconclusive", () => {
  const { state, themeId } = emergingThemeTrajectoryState(
    "weak-to-strong",
    9_294,
  );
  for (const batch of state.releaseHistory) {
    batch.products = batch.products.filter(
      (product) => product.kind !== "new-theme" || product.themeId === themeId,
    );
  }
  const otherIds = state.activeThemeIds.filter(
    (candidate) => candidate !== themeId,
  );
  const leadingId = otherIds[0];
  assert.ok(leadingId);

  for (const entry of state.history) {
    if (
      entry.day < FIRST_REGULAR_TEST_RELEASE_DAY + 1 ||
      entry.day > FIRST_REGULAR_TEST_RELEASE_DAY + 6
    ) continue;
    entry.shares = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === themeId ? 0.04 : 0.96 / otherIds.length,
      ]),
    );
    entry.winRates = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === themeId ? 0.5 : 0.51,
      ]),
    );
    entry.topCutPlacements = Object.fromEntries(
      state.activeThemeIds.map((candidate) => [
        candidate,
        candidate === leadingId ? 32 : 0,
      ]),
    );
    entry.topThemeId = leadingId;
  }

  for (const day of [
    FIRST_REGULAR_TEST_RELEASE_DAY + 2,
    FIRST_REGULAR_TEST_RELEASE_DAY + 6,
  ]) {
    const evaluation = getDailyCommunityPosts(state, day).find((post) =>
      post.id.endsWith("-evaluation") && post.themeId === themeId
    );
    assert.ok(evaluation, `DAY ${day}`);
    assert.match(
      evaluation.body,
      /표본|판단.*보류|평가.*보류|더 지켜|결론.*(?:이르|선명하지|밀 정도)|근거.*부족|말할 단계.*아님|확정할 만큼 선명하지|다음 (?:대회|표본)|강세도 거품도 아니다/,
      `DAY ${day}: ${evaluation.body}`,
    );
    assert.match(
      evaluation.body,
      /입상|탑컷|본선 진출|성적/,
      `DAY ${day}: ${evaluation.body}`,
    );
    assert.doesNotMatch(
      evaluation.body,
      /시작은 좋|기대|강할 가능성|좋은 신호|제대로 작동|성적표는 나왔다/,
      `DAY ${day}: ${evaluation.body}`,
    );
  }
});

test("completed weekly samples can reverse their opening read from historical metrics", () => {
  const fixtures = [
    {
      trajectory: "weak-to-strong" as const,
      seed: 9_292,
      expected: /기다려 보랬|더 지켜보자던|기다려 보니|더 지켜보니/,
    },
    {
      trajectory: "strong-to-weak" as const,
      seed: 9_293,
      expected: /첫 주 반짝|거품|강해 보였는데|결론이 바뀐다/,
    },
  ];
  for (const fixture of fixtures) {
    const { state, themeId } = emergingThemeTrajectoryState(
      fixture.trajectory,
      fixture.seed,
    );
    const emerging = getDailyCommunityPosts(
      state,
      FIRST_REGULAR_TEST_RELEASE_DAY + PLACEMENT_WINDOW_DAYS,
    ).filter((post) =>
      post.id.startsWith("daily-emerging-")
    );
    assert.equal(emerging.length, 1, fixture.trajectory);
    assert.ok(emerging[0].id.endsWith("-reversal"));
    assert.equal(emerging[0].themeId, themeId);
    assert.match(emerging[0].body, fixture.expected);
    assert.doesNotMatch(
      emerging[0].body,
      /내가 .*했지|내 말이 맞|예언|\d+\/7|집계|(?:[0-3]티어|Tier\s*[0-3])/,
    );
  }
});

test("keeps only deterministic high-appeal fandom signals after launch", () => {
  const state = makeState(7712);
  const theme = THEMES[0];
  assert.ok(theme.appeal >= 70);
  state.releaseHistory.push({
    day: 50,
    releaseKind: "regular",
    products: [
      {
        optionId: "loyalty-product",
        kind: "support",
        themeId: theme.id,
        direction: "recovery",
        expectedTier: "Tier 1",
        powerAdjustment: 0,
      },
    ],
  });

  const first = getDailyCommunityPosts(state, 60);
  const second = getDailyCommunityPosts(state, 60);
  const loyalty = first.filter((post) => post.id.startsWith("daily-loyalty-"));
  assert.equal(loyalty.length, 1);
  assert.match(
    loyalty[0].body,
    /계속 굴린다|돌아오게|분위기|후회 안 함|팬들 대단|고정 유저/,
  );
  assert.deepEqual(first, second);
  assert.equal(getReleaseReactionProfile(state, 60).surge, false);
});

test("adds current-day fatigue chatter below release priority", () => {
  const state = makeState(1188);
  const targetId = state.activeThemeIds[0];
  state.themes[targetId].fatigue = 90;
  state.themes[targetId].topStreakDays = 90;

  const posts = getDailyCommunityPosts(state, state.day);
  const fatigue = posts.find((post) => post.id.startsWith("daily-fatigue-"));
  assert.ok(fatigue);
  assert.equal(fatigue.themeId, targetId);
  assert.match(fatigue.body, /게임 끈다|운영 의도|피곤한 단계|잡아먹은|금제할 때/);
  assert.ok(getCommunityHeat(state, state.day) >= 52);
  assert.equal(
    getDailyCommunityPosts(state, state.day - 1).some((post) =>
      post.id.startsWith("daily-fatigue-"),
    ),
    false,
  );
});

type PrologueRestrictionDecision = {
  key: string;
  themeId: ThemeId;
  partId: string;
  previousValue: RestrictionLimit;
  value: RestrictionLimit;
  part: ThemeContent["parts"][number];
};

function prologueRestrictionDecisions(
  state: GameState,
): PrologueRestrictionDecision[] {
  return state.community.flatMap((event) => {
    if (
      event.day !== FIRST_BAN_DAY ||
      (event.type !== "restriction-applied" &&
        event.type !== "cosmetic-restriction") ||
      !event.partId ||
      !Number.isInteger(event.previousValue) ||
      !Number.isInteger(event.value)
    ) {
      return [];
    }
    const part = THEME_BY_ID[event.themeId]?.parts.find(
      (candidate) => candidate.id === event.partId,
    );
    assert.ok(part);
    return [{
      key: `${event.themeId}:${event.partId}`,
      themeId: event.themeId,
      partId: event.partId,
      previousValue: event.previousValue as RestrictionLimit,
      value: event.value as RestrictionLimit,
      part,
    }];
  });
}

function restrictionRoleSignal(
  role: ThemeContent["parts"][number]["role"],
): RegExp {
  switch (role) {
    case "starter1":
    case "starter2":
      return /초동|첫 패|손패|시작 카드|시작할 확률|시작하던|입구를 좁|전개 진입/;
    case "bridge":
      return /연결|전개 중간|중간 병목|중간다리|전개 경로|완주하는 길/;
    case "finisher":
      return /결과물|최종 필드|마무리|도착점|선공 고점/;
    case "recursion":
      return /회수축|후속|장기전|두 번째 턴|재전개|자원전/;
  }
}

const FALSE_SINGLE_TARGET_SCOPE =
  /금제표 한 줄|한 장짜리 금제표|변경점(?:은|이) .*하나뿐|실제로 바뀐 카드는 .*한 종뿐|이번 발표는 .*단일 변경|한 카드만 .*끝|여러 곳을 친 금제가 아니다/;

test("prologue four-cut reactions use the actual targets, scope, and roles", () => {
  const state = reduceGame(createInitialGame(1000), {
    type: "ADVANCE_DAYS",
    days: 2,
  });
  const decisions = prologueRestrictionDecisions(state);
  const byKey = new Map(decisions.map((decision) => [decision.key, decision]));

  assert.equal(decisions.length, 4);
  assert.equal(new Set(decisions.map((decision) => decision.themeId)).size, 4);
  assert.ok(
    decisions.every(
      (decision) =>
        decision.previousValue === 3 &&
        (decision.value === 1 || decision.value === 2),
    ),
  );
  assert.ok(
    decisions.every(
      (decision) => decision.partId !== "machine-revolution-siege-g09",
    ),
  );

  for (const [day, quota] of [
    [FIRST_RESTRICTION_REACTION_DAY, 16],
    [FIRST_RESTRICTION_REACTION_DAY + 1, 14],
    [FIRST_RESTRICTION_REACTION_DAY + 2, 12],
  ] as const) {
    const posts = restrictionContextPosts(state, day);
    assert.equal(posts.length, quota);
    assert.equal(new Set(posts.map((post) => post.body)).size, quota);
    assert.deepEqual(
      new Set(posts.map((post) => `${post.themeId}:${post.partId}`)),
      new Set(byKey.keys()),
    );
    for (const post of posts) {
      const decision = byKey.get(`${post.themeId}:${post.partId}`);
      assert.ok(decision);
      assert.equal(post.previousValue, decision.previousValue);
      assert.equal(post.value, decision.value);
      assert.equal(FALSE_SINGLE_TARGET_SCOPE.test(post.body), false);
      assert.equal(post.body.includes("공성 G-09"), false);
      const namedTargets = decisions.filter((candidate) =>
        post.body.includes(candidate.part.name)
      );
      assert.ok(
        namedTargets.every((candidate) => candidate.key === decision.key),
      );
    }
  }

  const dayOne = restrictionContextPosts(
    state,
    FIRST_RESTRICTION_REACTION_DAY,
  );
  const debutThemeIds = new Set(
    state.releaseHistory.flatMap((batch) =>
      batch.products
        .filter((product) => product.kind === "new-theme")
        .map((product) => product.themeId),
    ),
  );
  assert.ok(
    dayOne.some((post) =>
      /여러 테마|복수 테마|환경 전체|대상 테마가 많|한쪽만 겨냥한 공지가 아니라|상위권 여러 덱/.test(
        post.body,
      )
    ),
    dayOne.map((post) => post.body).join("\n"),
  );
  for (const decision of decisions) {
    const anchored = dayOne.filter(
      (post) => `${post.themeId}:${post.partId}` === decision.key,
    );
    assert.equal(anchored.length, 4);
    assert.ok(
      anchored.some((post) => restrictionRoleSignal(decision.part.role).test(post.body)),
      `${decision.part.name} (${decision.part.role})`,
    );
    if (debutThemeIds.has(decision.themeId)) {
      assert.ok(
        anchored.some((post) => /첫 상품|신규 테마|막 데뷔|출시/.test(post.body)),
        `${decision.part.name} debut timing`,
      );
      assert.ok(
        anchored.every(
          (post) => !/최근 지원|지원이 나온 뒤|지원으로 채운/.test(post.body),
        ),
        `${decision.part.name} is a debut, not a support release`,
      );
    }
  }
});

test("prologue dynamic four-cut copy stays fact-safe across seeds", () => {
  const signatures = new Set<string>();
  for (let seed = 40_001; seed <= 40_032; seed += 1) {
    const state = reduceGame(createInitialGame(seed), {
      type: "ADVANCE_DAYS",
      days: 2,
    });
    const decisions = prologueRestrictionDecisions(state);
    const byKey = new Map(decisions.map((decision) => [decision.key, decision]));
    assert.equal(decisions.length, 4, `seed ${seed}`);
    assert.equal(
      new Set(decisions.map((decision) => decision.themeId)).size,
      4,
      `seed ${seed}`,
    );
    for (const [day, quota] of [
      [FIRST_RESTRICTION_REACTION_DAY, 16],
      [FIRST_RESTRICTION_REACTION_DAY + 1, 14],
      [FIRST_RESTRICTION_REACTION_DAY + 2, 12],
    ] as const) {
      const posts = restrictionContextPosts(state, day);
      assert.equal(posts.length, quota, `seed ${seed} DAY ${day}`);
      assert.equal(
        new Set(posts.map((post) => post.body)).size,
        quota,
        `seed ${seed} DAY ${day} unique copy`,
      );
      assert.ok(
        posts.every((post) => {
          const decision = byKey.get(`${post.themeId}:${post.partId}`);
          return Boolean(
            decision &&
              post.previousValue === decision.previousValue &&
              post.value === decision.value &&
              !FALSE_SINGLE_TARGET_SCOPE.test(post.body) &&
              !post.body.includes("공성 G-09"),
          );
        }),
        `seed ${seed} DAY ${day} factual anchors`,
      );
    }

    const dayOne = restrictionContextPosts(
      state,
      FIRST_RESTRICTION_REACTION_DAY,
    );
    signatures.add(dayOne.map((post) => post.body).sort().join("\n"));
    for (const decision of decisions) {
      const anchored = dayOne.filter(
        (post) => `${post.themeId}:${post.partId}` === decision.key,
      );
      assert.ok(
        anchored.some((post) => restrictionRoleSignal(decision.part.role).test(post.body)),
        `seed ${seed} ${decision.part.name} (${decision.part.role})`,
      );
    }
  }
  assert.ok(signatures.size > 1);
});

test("single-card restriction copy follows starter, bridge, and recursion roles", () => {
  const cases: Array<{
    change: RestrictionFixtureChange;
    expected: RegExp;
    forbidden: RegExp;
  }> = [
    {
      change: {
        themeId: "cycle",
        partId: "cycle-guide",
        oldLimit: 3,
        newLimit: 2,
      },
      expected: /초동|첫 패|손패|시작|진입|입구|일관성/,
      forbidden: /최종 필드만|결과물.*공백|회수축|장기전 자원|중간 병목/,
    },
    {
      change: {
        themeId: "cycle",
        partId: "cycle-rewound-pact",
        oldLimit: 3,
        newLimit: 1,
      },
      expected: /연결|병목|전개 경로|중간다리|완주|조합|거치|루트/,
      forbidden: /초동률|첫 패 확률|최종 필드만|회수축|장기전 자원/,
    },
    {
      change: {
        themeId: "cycle",
        partId: "cycle-return",
        oldLimit: 3,
        newLimit: 1,
      },
      expected: /회수|후속|장기전|재전개|두 번째 턴|복구|자원/,
      forbidden: /초동률|첫 패 확률|중간 병목|최종 필드만|결과물 공백/,
    },
  ];

  for (const [index, { change, expected, forbidden }] of cases.entries()) {
    const state = makeRestrictionReactionState([change], 35_000 + index);
    const posts = restrictionContextPosts(
      state,
      FIRST_RESTRICTION_REACTION_DAY,
    );
    assert.equal(posts.length, 16);
    assert.ok(posts.filter((post) => expected.test(post.body)).length >= 3);
    assert.ok(posts.every((post) => !forbidden.test(post.body)));
    assert.ok(posts.every((post) => post.partId === change.partId));
    assert.ok(posts.every((post) => !/[{}]/.test(post.body)));
  }
});

test("single cosmetic restriction criticizes both zero impact and missing breadth", () => {
  const state = makeRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-eternal-ring",
      oldLimit: 3,
      newLimit: 1,
      type: "cosmetic-restriction",
    },
  ], 36_001);
  const posts = restrictionContextPosts(state, FIRST_RESTRICTION_REACTION_DAY);
  assert.equal(posts.length, 16);
  assert.ok(
    posts.filter((post) =>
      /원래|실사용 매수|체감.*없|숫자|보여 주기|구축.*(?:그대로|유지)|영향이 없어|금제 효과가 어디|조정 의미/.test(
        post.body,
      )
    ).length >= 8,
    posts.map((post) => post.body).join("\n"),
  );
  assert.ok(
    posts.some((post) =>
      /한 종만|이것밖에|다른 상위권|1.?2티어|범위.*좁|금제표.*끝|여러 축.*아니/.test(
        post.body,
      )
    ),
  );
  assert.ok(
    posts.every(
      (post) =>
        !/덱 해체|본체째|가격 반토막|초동.*줄|기본 동작.*없애|최대 타격|실제로 .*여러 (?:장|종).*바뀌|연좌|우회 전개/.test(
          post.body,
        ),
    ),
  );
});

test("one-card and two-card D+1 boards make insufficient breadth the majority", () => {
  const single = makeRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-gate",
      oldLimit: 3,
      newLimit: 1,
    },
  ], 36_101);
  const singlePosts = restrictionContextPosts(
    single,
    FIRST_RESTRICTION_REACTION_DAY,
  );
  const singleBreadth =
    /왜 이것밖에|금제 범위|하나만 찍|한 줄뿐|한 장짜리|한 종에서 끝|실제 제한은 .*하나|한 종뿐|단일 변경|환경의 여러 강덱|여러 곳을 친 금제가 아니다|상위권 전체를 조정|여러 장을 자른 게 아니다/;
  assert.ok(
    singlePosts.filter((post) => singleBreadth.test(post.body)).length > 8,
    singlePosts.map((post) => post.body).join("\n"),
  );

  const double = makeRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-gate",
      oldLimit: 3,
      newLimit: 1,
    },
    {
      themeId: "white-night",
      partId: "white-night-prayer",
      oldLimit: 3,
      newLimit: 1,
    },
  ], 36_102);
  const doublePosts = restrictionContextPosts(
    double,
    FIRST_RESTRICTION_REACTION_DAY,
  );
  const doubleBreadth =
    /실효 제한.*뿐|여전히 부족|끝이면|전부 둔|함께 조정|여기서 끝|복수 조정|다른 얘기|규모가 아님|비워 둔|바로 다음 금제|부족함/;
  assert.ok(
    doublePosts.filter((post) => doubleBreadth.test(post.body)).length > 8,
    doublePosts.map((post) => post.body).join("\n"),
  );
  assert.ok(
    doublePosts.every((post) =>
      !/세 장|서너 장|다섯 장|[3-9]종만|여러 장을 잘랐/.test(post.body)
    ),
  );
});

test("one-card and two-card cuts below the leaders ask why the top decks were spared", () => {
  const comparison =
    /최상위권|1위권 핵심|상위권 점유율|그 아래|경쟁자|강한 덱 아래|핵심을 살려 두고|본체는 통과|독주를 누가 막|상위권을 그대로|지금 잡아야|보다 먼저/;
  const fixtures: Array<readonly RestrictionFixtureChange[]> = [
    [
      {
        themeId: "ironblood",
        partId: "ironblood-squire",
        oldLimit: 3,
        newLimit: 1,
      },
    ],
    [
      {
        themeId: "ironblood",
        partId: "ironblood-squire",
        oldLimit: 3,
        newLimit: 1,
      },
      {
        themeId: "abyss",
        partId: "abyss-bait",
        oldLimit: 3,
        newLimit: 1,
      },
    ],
  ];

  for (const [fixtureIndex, changes] of fixtures.entries()) {
    for (let seedOffset = 0; seedOffset < 8; seedOffset += 1) {
      const state = makeScheduledRestrictionReactionState(
        changes,
        39_100 + fixtureIndex * 100 + seedOffset,
      );
      const posts = restrictionContextPosts(
        state,
        REGULAR_RESTRICTION_REACTION_DAY,
        REGULAR_RESTRICTION_DAY,
      );
      const comparativePosts = posts.filter((post) => comparison.test(post.body));
      assert.ok(
        comparativePosts.length >= 4,
        posts.map((post) => post.body).join("\n"),
      );
      assert.ok(
        comparativePosts.some((post) =>
          post.body.includes("윤회") || post.body.includes("백야") ||
          post.body.includes("기계혁명")
        ),
        "the reaction must compare the chosen target with an actual higher-ranked theme",
      );
      assert.ok(posts.every((post) => !/[{}]/.test(post.body)));
    }
  }
});

test("multi-card restriction keeps aggregate and multi-axis reactions", () => {
  const changes: RestrictionFixtureChange[] = [
    {
      themeId: "machine-revolution",
      partId: "machine-revolution-assembly-line",
      oldLimit: 3,
      newLimit: 1,
    },
    {
      themeId: "machine-revolution",
      partId: "machine-revolution-gear-lift",
      oldLimit: 3,
      newLimit: 1,
    },
  ];
  const state = makeRestrictionReactionState(changes, 37_001);
  const posts = restrictionContextPosts(state, FIRST_RESTRICTION_REACTION_DAY);
  assert.equal(posts.length, 16);
  assert.deepEqual(
    new Set(posts.map((post) => post.partId)),
    new Set(changes.map((change) => change.partId)),
  );
  assert.ok(
    posts.some((post) =>
      /서로 다른 역할|여러 구간|복수 역할|여러 축|덱 뼈대|구축 전체|다른 축/.test(
        post.body,
      )
    ),
  );
  assert.ok(
    posts.every(
      (post) =>
        !/실제로 바뀐 카드는 .*한 종뿐|변경점은 .* 하나임|여러 축 동시 조정이 아니라|한 번에 여러 곳을 친 금제는 아니다/.test(
          post.body,
        ),
    ),
  );
});

test("multi-card copy distinguishes same-role and multi-theme scopes", () => {
  const sameRole = makeRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-gate",
      oldLimit: 3,
      newLimit: 2,
    },
    {
      themeId: "cycle",
      partId: "cycle-guide",
      oldLimit: 3,
      newLimit: 2,
    },
  ], 38_001);
  const sameRolePosts = restrictionContextPosts(
    sameRole,
    FIRST_RESTRICTION_REACTION_DAY,
  );
  assert.equal(sameRolePosts.length, 16);
  assert.ok(
    sameRolePosts.some((post) =>
      /같은 역할|같은 기능|비슷한 기능|역할군|파츠군|한 역할에 제한/.test(post.body)
    ),
    sameRolePosts.map((post) => post.body).join("\n"),
  );

  const multiTheme = makeRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-gate",
      oldLimit: 3,
      newLimit: 2,
    },
    {
      themeId: "machine-revolution",
      partId: "machine-revolution-gear-lift",
      oldLimit: 3,
      newLimit: 1,
    },
  ], 38_002);
  const multiThemePosts = restrictionContextPosts(
    multiTheme,
    FIRST_RESTRICTION_REACTION_DAY,
  );
  assert.equal(multiThemePosts.length, 16);
  assert.ok(
    multiThemePosts.some((post) =>
      /여러 테마|환경 전체|복수 테마|대상 테마|한 테마만이 아니라/.test(
        post.body,
      )
    ),
  );
});

test("balanced reviews praise Tier 1/Tier 2 coverage and a full stale release with caveats", () => {
  const state = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 2 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 2 },
    { themeId: "ironblood", partId: "ironblood-squire", oldLimit: 3, newLimit: 2 },
    { themeId: "abyss", partId: "abyss-bait", oldLimit: 3, newLimit: 2 },
    {
      themeId: "white-night",
      partId: "white-night-snow-blessing",
      oldLimit: 1,
      newLimit: 3,
    },
  ], 38_101);
  state.community.unshift({
    id: "stale-white-night-start",
    day: FIRST_BAN_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "white-night",
    partId: "white-night-snow-blessing",
    value: 1,
    previousValue: 3,
    body: "[운영 공지] 백야의 설복 1장 제한",
  });
  setRestrictionDecisionMeta(
    state,
    REGULAR_RESTRICTION_DAY,
    Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.3, 0.24, 0.18, 0.16, 0.12][index],
      ]),
    ),
    Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.52, 0.53, 0.48, 0.56, 0.56][index],
      ]),
    ),
  );
  const profile = getPublishedRestrictionPolicyProfile(
    state,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(profile.quality, "balanced");
  assert.equal(profile.coverageComplete, true);
  assert.equal(profile.upperMeaningfulCuts, 2);
  assert.equal(profile.tier2MeaningfulCuts, 2);
  assert.equal(profile.staleFullyReleased, 1);

  const posts = restrictionContextPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(posts.length, 16);
  assert.ok(
    posts.filter((post) =>
      /방향이 좋|납득|균형|제대로|잘했|좋았|정기 금제|환경 순환|필요한 일|금제는 이래야지|같이 있어서|잘 잡|묶으니/.test(
        post.body,
      )
    ).length >= 6,
    posts.map((post) => post.body).join("\n"),
  );
  assert.ok(
    posts.some((post) =>
      /강도|이견|실전 데이터|과하게|계속 봐|확인은 필요/.test(post.body)
    ),
  );
  assert.ok(
    posts.every((post) =>
      !/왜 이것밖에|한 장만 찍|실효 제한 [12]종뿐|금제표가 여기서 끝/.test(
        post.body,
      )
    ),
  );

  const unbanPosts = posts.filter(
    (post) => post.partId === "white-night-snow-blessing",
  );
  assert.ok(unbanPosts.length > 0);
  assert.ok(
    unbanPosts.every((post) =>
      !/덱 처분|가격.*(?:하락|내려)|공백|카드가 빠|매수 감소|대체 카드/.test(
        post.body,
      )
    ),
  );
});

test("restriction reactions distinguish all four pick-rate and win-rate quadrants", () => {
  const fixtures: Array<{
    label: string;
    change: RestrictionFixtureChange;
    shares: readonly [number, number, number, number, number];
    winRates: readonly [number, number, number, number, number];
    expected: RegExp;
    displayedWinRate: string;
  }> = [
    {
      label: "popular powerhouse",
      change: {
        themeId: "cycle",
        partId: "cycle-gate",
        oldLimit: 3,
        newLimit: 1,
      },
      shares: [0.3, 0.26, 0.2, 0.14, 0.1],
      winRates: [0.59, 0.5, 0.5, 0.5, 0.5],
      expected:
        /많이 쓰이고 많이 이기|표본도 크고 결과도|동시에 경고|큰 표본에서도 .* 승률|표본 큰 고승률|픽률만 높은 덱과 달리|픽률과 승률이 같이 높|대상 자체는 정면 승부/,
      displayedWinRate: "59.0%",
    },
    {
      label: "popular underperformer",
      change: {
        themeId: "cycle",
        partId: "cycle-gate",
        oldLimit: 3,
        newLimit: 1,
      },
      shares: [0.3, 0.26, 0.2, 0.14, 0.1],
      winRates: [0.46, 0.5, 0.5, 0.5, 0.5],
      expected:
        /인기랑 강함|점유율 .*승률|픽률은 높아도|승률 .*우선 타격|표본만 크고|많이 들고 왔지만 많이 지던|거품 픽|인기세를 벌|픽률을 위험도로 착각|본선 진출률 낮|많이 보인다는 이유/,
      displayedWinRate: "46.0%",
    },
    {
      label: "low-pick high-win",
      change: {
        themeId: "abyss",
        partId: "abyss-bait",
        oldLimit: 3,
        newLimit: 1,
      },
      shares: [0.34, 0.26, 0.2, 0.16, 0.04],
      winRates: [0.5, 0.5, 0.5, 0.5, 0.6],
      expected:
        /숨은 강덱|표본이 적|본선 진출률|적게 들고 와서|장인 덱|낮은 픽률|승률 높은 소수|티어 이름보다 실제 결과/,
      displayedWinRate: "60.0%",
    },
    {
      label: "weak fringe",
      change: {
        themeId: "abyss",
        partId: "abyss-bait",
        oldLimit: 3,
        newLimit: 1,
      },
      shares: [0.34, 0.26, 0.2, 0.16, 0.04],
      winRates: [0.5, 0.5, 0.5, 0.5, 0.45],
      expected:
        /픽도 낮고 승률도 낮|환경이 알아서 밀어|티어 밖|적게 보이고 성적도|지원 검토 대상|하위권 약체|티어 아웃 직전|낮은 픽·낮은 승률/,
      displayedWinRate: "45.0%",
    },
  ];

  const signatures = new Set<string>();
  for (const [index, fixture] of fixtures.entries()) {
    const state = makeScheduledRestrictionReactionState(
      [fixture.change],
      38_120 + index,
    );
    const shares = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.shares[themeIndex],
      ]),
    );
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.winRates[themeIndex],
      ]),
    );
    setRestrictionDecisionMeta(
      state,
      REGULAR_RESTRICTION_DAY,
      shares,
      winRates,
    );

    const posts = restrictionContextPosts(
      state,
      REGULAR_RESTRICTION_REACTION_DAY,
      REGULAR_RESTRICTION_DAY,
    );
    const quadrantPosts = posts.filter((post) => fixture.expected.test(post.body));
    assert.equal(posts.length, 16, fixture.label);
    assert.ok(
      quadrantPosts.length >= 4,
      `${fixture.label}\n${posts.map((post) => post.body).join("\n")}`,
    );
    assert.ok(
      posts.some((post) => post.body.includes(fixture.displayedWinRate)),
      `${fixture.label} must render its decision-day win rate`,
    );
    assert.ok(posts.every((post) => !/[{}]/.test(post.body)), fixture.label);
    signatures.add(quadrantPosts.map((post) => post.body).sort().join("\n"));
  }
  assert.equal(signatures.size, fixtures.length);
});

test("a tier-balanced list cannot earn unconditional praise for cutting popular losers and missing a sleeper", () => {
  const state = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 2 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 2 },
    { themeId: "ironblood", partId: "ironblood-squire", oldLimit: 3, newLimit: 2 },
    { themeId: "abyss", partId: "abyss-bait", oldLimit: 3, newLimit: 2 },
  ], 38_151);
  const sleeper = THEMES[5];
  state.activeThemeIds.push(sleeper.id);
  state.themes[sleeper.id] = makeRuntime(sleeper, 0.04);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [0.32, 0.24, 0.16, 0.13, 0.11, 0.04][index],
    ]),
  );
  const winRates = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [0.46, 0.47, 0.49, 0.45, 0.46, 0.62][index],
    ]),
  );
  setRestrictionDecisionMeta(
    state,
    REGULAR_RESTRICTION_DAY,
    shares,
    winRates,
  );

  const profile = getPublishedRestrictionPolicyProfile(
    state,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(profile.quality, "incomplete");
  assert.equal(profile.coverageComplete, false);
  assert.equal(profile.upperMeaningfulCuts, 2);
  assert.equal(profile.tier2MeaningfulCuts, 2);

  const posts = restrictionContextPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  const missedSleeper =
    /진짜 본선 진출률|저픽 고승률|성적표 첫 줄|실속 있는|승률은 (?:이미 )?경고|우선순위 반대|숨은 강덱|풍선효과 후보|놓쳤|검토 흔적|빈칸|빠진|낮은 표본/;
  const unconditionalPraise =
    /방향이 좋|이번 범위는 납득|균형이 잘 잡|깔끔한 표|합리적이다|필요한 일은 다 한|구성은 적정|판단은 좋았|금제는 이래야지|범위가 제대로|잘했다/;
  assert.equal(posts.length, 16);
  assert.ok(
    posts.filter((post) => missedSleeper.test(post.body)).length >= 4,
    posts.map((post) => post.body).join("\n"),
  );
  assert.ok(
    posts.some((post) => post.body.includes(sleeper.shortName)),
    `the ignored sleeper must be named: ${sleeper.shortName}`,
  );
  assert.ok(posts.some((post) => post.body.includes("62.0%")));
  assert.equal(
    posts.filter((post) => unconditionalPraise.test(post.body)).length,
    0,
    posts.map((post) => post.body).join("\n"),
  );
});

test("pick-win restriction copy stays historical with and without a saved win-rate snapshot", () => {
  const makeHistoricalFixture = (seed: number) => {
    const state = makeScheduledRestrictionReactionState([
      { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    ], seed);
    const shares = Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.3, 0.26, 0.2, 0.14, 0.1][index],
      ]),
    );
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.46, 0.5, 0.5, 0.5, 0.5][index],
      ]),
    );
    setRestrictionDecisionMeta(
      state,
      REGULAR_RESTRICTION_DAY,
      shares,
      winRates,
    );
    return state;
  };
  const bodies = (state: GameState) =>
    restrictionContextPosts(
      state,
      REGULAR_RESTRICTION_REACTION_DAY,
      REGULAR_RESTRICTION_DAY,
    ).map((post) => post.body);

  const snapshotted = makeHistoricalFixture(38_161);
  const snapshottedBefore = bodies(snapshotted);
  snapshotted.themes.cycle.winRate = 0.7;
  snapshotted.themes.cycle.share = 0.01;
  assert.deepEqual(bodies(snapshotted), snapshottedBefore);

  const legacy = makeHistoricalFixture(38_162);
  const decisionSnapshot = legacy.history.find(
    (entry) => entry.day === REGULAR_RESTRICTION_DAY,
  );
  assert.ok(decisionSnapshot);
  delete decisionSnapshot.winRates;
  legacy.themes.cycle.winRate = 0.5;
  const legacyBefore = bodies(legacy);
  legacy.themes.cycle.winRate = 0.7;
  assert.deepEqual(
    bodies(legacy),
    legacyBefore,
    "old saves without winRates must use a neutral historical fallback, not today's runtime",
  );
});

const UNCONDITIONAL_LIST_PRAISE =
  /숨만 고른 금제라 괜찮|납득 가능|첫인상은 좋|문제 지점은 제대로|적당해 보|마음에 든|정교한 금제|순서상 맞|이 정도는 해야 정기 금제|방향이 좋|이번 범위는 납득|균형이 잘 잡|깔끔한 표|합리적이다|필요한 일은 다 한|구성은 적정|판단은 좋았|금제는 이래야지|범위가 제대로|잘했다|대상 선정 자체는 성적표를 읽|실전 위협은 확인|숨은 강덱 근거|선제 검토 대상/;

const PERFORMANCE_BLIND_CUT_CRITIQUE =
  /거품|인기를 성능|픽률을 위험도|많이 지던|점유율 .* 승률|금제 슬롯 낭비|환경이 알아서 밀어|티어 밖|하위권 약체|우선순위가 완전히|성적 해석이 뒤집/;

test("performance-blind cuts suppress unconditional praise at exact-four, three-card, and five-plus breadths", () => {
  const balancedFour: readonly RestrictionFixtureChange[] = [
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 2 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 2 },
    { themeId: "ironblood", partId: "ironblood-squire", oldLimit: 3, newLimit: 2 },
    { themeId: "abyss", partId: "abyss-bait", oldLimit: 3, newLimit: 2 },
  ];
  const fixtures: Array<{
    label: string;
    changes: readonly RestrictionFixtureChange[];
    shares: readonly number[];
    winRates: readonly number[];
    expectedCuts: number;
    expectedTierTwoCuts: number;
  }> = [
    {
      label: "balanced four with popular losers and no sleeper",
      changes: balancedFour,
      shares: [0.3, 0.24, 0.18, 0.16, 0.12],
      winRates: [0.46, 0.47, 0.5, 0.5, 0.5],
      expectedCuts: 4,
      expectedTierTwoCuts: 2,
    },
    {
      label: "balanced four containing a weak fringe cut",
      changes: balancedFour,
      shares: [0.4, 0.25, 0.18, 0.12, 0.05],
      winRates: [0.56, 0.55, 0.5, 0.5, 0.45],
      expectedCuts: 4,
      expectedTierTwoCuts: 2,
    },
    {
      label: "five-card list containing popular losers",
      changes: [
        ...balancedFour,
        {
          themeId: "machine-revolution",
          partId: "machine-revolution-assembly-line",
          oldLimit: 3,
          newLimit: 2,
        },
      ],
      shares: [0.3, 0.24, 0.18, 0.16, 0.12],
      winRates: [0.46, 0.47, 0.48, 0.5, 0.5],
      expectedCuts: 5,
      expectedTierTwoCuts: 2,
    },
    {
      label: "Tier 1-only three-card list with low win rates",
      changes: [
        { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 2 },
        { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 2 },
        {
          themeId: "machine-revolution",
          partId: "machine-revolution-assembly-line",
          oldLimit: 3,
          newLimit: 2,
        },
      ],
      shares: [0.3, 0.24, 0.18, 0.16, 0.12],
      winRates: [0.46, 0.47, 0.48, 0.5, 0.5],
      expectedCuts: 3,
      expectedTierTwoCuts: 0,
    },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const state = makeScheduledRestrictionReactionState(
      fixture.changes,
      38_200 + index,
    );
    const shares = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.shares[themeIndex],
      ]),
    );
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.winRates[themeIndex],
      ]),
    );
    setRestrictionDecisionMeta(
      state,
      REGULAR_RESTRICTION_DAY,
      shares,
      winRates,
    );

    const profile = getPublishedRestrictionPolicyProfile(
      state,
      REGULAR_RESTRICTION_DAY,
    );
    const posts = restrictionContextPosts(
      state,
      REGULAR_RESTRICTION_REACTION_DAY,
      REGULAR_RESTRICTION_DAY,
    );
    assert.equal(profile.meaningfulCutCount, fixture.expectedCuts, fixture.label);
    assert.equal(profile.tier2MeaningfulCuts, fixture.expectedTierTwoCuts, fixture.label);
    assert.equal(posts.length, 16, fixture.label);
    assert.ok(
      posts.some((post) => PERFORMANCE_BLIND_CUT_CRITIQUE.test(post.body)),
      `${fixture.label}\n${posts.map((post) => post.body).join("\n")}`,
    );
    assert.equal(
      posts.filter((post) => UNCONDITIONAL_LIST_PRAISE.test(post.body)).length,
      0,
      `${fixture.label}\n${posts.map((post) => post.body).join("\n")}`,
    );
    assert.ok(posts.every((post) => !/[{}]/.test(post.body)), fixture.label);
  }
});

test("an uncut low-pick high-win sleeper is flagged independently of the cut target profile", () => {
  const state = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
  ], 38_210);
  const sleeper = THEMES[5];
  state.activeThemeIds.push(sleeper.id);
  state.themes[sleeper.id] = makeRuntime(sleeper, 0.04);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [0.32, 0.24, 0.16, 0.13, 0.11, 0.04][index],
    ]),
  );
  const winRates = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [0.58, 0.5, 0.5, 0.5, 0.5, 0.62][index],
    ]),
  );
  setRestrictionDecisionMeta(
    state,
    REGULAR_RESTRICTION_DAY,
    shares,
    winRates,
  );

  const posts = restrictionContextPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  const independentSleeperCopy =
    /빠진 .* 점유율|저픽 고승률|적게 잡히고도|픽률 표 밖|빈자리를 먹을|안 자른 덱의 승률|선제 검토가 빠졌/;
  assert.equal(posts.length, 16);
  assert.ok(
    posts.filter((post) => independentSleeperCopy.test(post.body)).length >= 4,
    posts.map((post) => post.body).join("\n"),
  );
  assert.ok(posts.some((post) => post.body.includes(sleeper.shortName)));
  assert.ok(posts.some((post) => post.body.includes("62.0%")));
  assert.equal(
    posts.filter((post) => /픽만 많고 승률은 딸리는|유행 덱 숫자만/.test(post.body)).length,
    0,
  );
});

test("restriction reactions distinguish recent placement and conversion profiles", () => {
  const fixtures: Array<{
    label: string;
    targetId: ThemeId;
    partId: string;
    shares: readonly number[];
    dailyPlacements: readonly number[];
    targetWinRate?: number;
    expected: RegExp;
    displayed: string;
  }> = [
    {
      label: "high placement and high conversion",
      targetId: "cycle",
      partId: "cycle-gate",
      shares: [0.3, 0.26, 0.2, 0.14, 0.1],
      dailyPlacements: [16, 5, 4, 4, 3],
      expected: /탑컷 점유율|탑컷 생존율|실전 위협|표본도 결과도/,
      displayed: "112",
    },
    {
      label: "low match win rate but strong placement evidence",
      targetId: "cycle",
      partId: "cycle-gate",
      shares: [0.3, 0.26, 0.2, 0.14, 0.1],
      dailyPlacements: [16, 5, 4, 4, 3],
      targetWinRate: 0.46,
      expected:
        /서로 반대|다른 방향|충돌 신호|평가 보류|가중치|둘 다 무시할 수 없|한 방향이 아닌/,
      displayed: "112",
    },
    {
      label: "high pick but weak placement and conversion",
      targetId: "cycle",
      partId: "cycle-gate",
      shares: [0.3, 0.26, 0.2, 0.14, 0.1],
      dailyPlacements: [1, 10, 8, 7, 6],
      expected: /인기를 성능|입상까지 간 덱|유행 표본|성적 해석|체감 빈도와 실전 위협/,
      displayed: "7",
    },
    {
      label: "low pick but strong conversion",
      targetId: "abyss",
      partId: "abyss-bait",
      shares: [0.34, 0.26, 0.2, 0.16, 0.04],
      dailyPlacements: [8, 6, 5, 3, 10],
      expected: /숨은 강덱|저픽|선제 검토|표본 크기와 실질 위협|본선 진출률.*안전 신호|티어표 밖의 강덱|채용률과 .*본선 진출률/,
      displayed: "70",
    },
  ];
  const signatures = new Set<string>();

  for (const [index, fixture] of fixtures.entries()) {
    const state = makeScheduledRestrictionReactionState([{
      themeId: fixture.targetId,
      partId: fixture.partId,
      oldLimit: 3,
      newLimit: 1,
    }], 38_220 + index);
    const shares = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.shares[themeIndex],
      ]),
    );
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId) => [
        themeId,
        themeId === fixture.targetId
          ? fixture.targetWinRate ?? 0.5
          : 0.5,
      ]),
    );
    const dailyPlacements = Object.fromEntries(
      state.activeThemeIds.map((themeId, themeIndex) => [
        themeId,
        fixture.dailyPlacements[themeIndex],
      ]),
    );
    setRestrictionPlacementWindow(
      state,
      REGULAR_RESTRICTION_DAY,
      shares,
      winRates,
      dailyPlacements,
    );

    const posts = restrictionContextPosts(
      state,
      REGULAR_RESTRICTION_REACTION_DAY,
      REGULAR_RESTRICTION_DAY,
    );
    const placementPosts = posts.filter((post) => fixture.expected.test(post.body));
    assert.equal(posts.length, 16, fixture.label);
    assert.equal(
      new Set(posts.map((post) => post.body)).size,
      posts.length,
      `${fixture.label} must not repeat a placement reaction`,
    );
    assert.ok(
      placementPosts.length >= 4,
      `${fixture.label}\n${posts.map((post) => post.body).join("\n")}`,
    );
    assert.ok(
      posts.some((post) =>
        post.body.includes(`${PLACEMENT_WINDOW_DAYS}일`)
      ),
      fixture.label,
    );
    const renderedPlacementCount = new RegExp(
      `(?:탑컷(?:한\\s*횟수가|에는|에|이)?\\s*${fixture.displayed}(?:회|번)|${fixture.displayed}(?:자리|개))`,
    );
    assert.ok(
      posts.some((post) => renderedPlacementCount.test(post.body)),
      `${fixture.label} must render the frozen placement count\n${posts.map((post) => post.body).join("\n")}`,
    );
    assert.ok(posts.every((post) => !/[{}]/.test(post.body)), fixture.label);
    signatures.add(placementPosts.map((post) => post.body).sort().join("\n"));
  }
  assert.equal(signatures.size, fixtures.length);
});

test("placement reactions wait for seven theme-specific observed days", () => {
  const state = makeScheduledRestrictionReactionState([{
    themeId: "abyss",
    partId: "abyss-bait",
    oldLimit: 3,
    newLimit: 1,
  }], 38_224);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [0.34, 0.26, 0.2, 0.16, 0.04][index],
    ]),
  );
  const winRates = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, 0.5]),
  );
  const dailyPlacements = Object.fromEntries(
    state.activeThemeIds.map((themeId, index) => [
      themeId,
      [8, 6, 5, 3, 10][index],
    ]),
  );
  setRestrictionPlacementWindow(
    state,
    REGULAR_RESTRICTION_DAY,
    shares,
    winRates,
    dailyPlacements,
  );

  const targetId = "abyss" as ThemeId;
  const donorId = state.activeThemeIds.find((themeId) => themeId !== targetId)!;
  for (const entry of state.history.slice(0, -1)) {
    entry.shares[donorId] += entry.shares[targetId];
    delete entry.shares[targetId];
    delete entry.winRates?.[targetId];
    entry.topCutPlacements![donorId] += entry.topCutPlacements![targetId];
    delete entry.topCutPlacements![targetId];
  }

  const targetName = THEME_BY_ID[targetId].shortName;
  const posts = restrictionContextPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(posts.length, 16);
  assert.equal(
    posts.filter(
      (post) =>
        post.body.includes(targetName) &&
        /본선 진출률|탑컷 점유율|탑컷 \d+회/.test(post.body),
    ).length,
    0,
    posts.map((post) => post.body).join("\n"),
  );
});

test("placement restriction copy is frozen at the decision window and legacy fallback is deterministic", () => {
  const makePlacementFixture = (seed: number, stored: boolean) => {
    const state = makeScheduledRestrictionReactionState([
      { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    ], seed);
    const shares = Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.3, 0.26, 0.2, 0.14, 0.1][index],
      ]),
    );
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId) => [themeId, 0.5]),
    );
    const placements = Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        [16, 5, 4, 4, 3][index],
      ]),
    );
    setRestrictionPlacementWindow(
      state,
      REGULAR_RESTRICTION_DAY,
      shares,
      winRates,
      placements,
    );
    if (!stored) {
      for (const entry of state.history) delete entry.topCutPlacements;
    }
    return state;
  };
  const bodies = (state: GameState) =>
    restrictionContextPosts(
      state,
      REGULAR_RESTRICTION_REACTION_DAY,
      REGULAR_RESTRICTION_DAY,
    ).map((post) => post.body);

  for (const [index, stored] of [true, false].entries()) {
    const state = makePlacementFixture(38_230 + index, stored);
    const before = bodies(state);
    state.themes.cycle.share = 0.01;
    state.themes.cycle.winRate = 0.8;
    const latest = state.history.at(-1);
    assert.ok(latest);
    state.history.push({
      ...latest,
      day: REGULAR_RESTRICTION_REACTION_DAY,
      shares: { ...latest.shares, cycle: 0.01 },
      winRates: { ...latest.winRates, cycle: 0.8 },
      topCutPlacements: Object.fromEntries(
        state.activeThemeIds.map((themeId, themeIndex) => [
          themeId,
          [0, 12, 8, 7, 5][themeIndex],
        ]),
      ),
    });
    assert.deepEqual(
      bodies(state),
      before,
      stored
        ? "stored placement history must ignore later runtime and future reports"
        : "legacy placement reconstruction must use only frozen historical rows",
    );
  }
});

test("coverage follows measured threats while cosmetic signals stay factual", () => {
  const upperOnly = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 2 },
    { themeId: "cycle", partId: "cycle-guide", oldLimit: 3, newLimit: 2 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 2 },
  ], 38_201);
  const upperPosts = restrictionContextPosts(
    upperOnly,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  const upperProfile = getPublishedRestrictionPolicyProfile(
    upperOnly,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(upperProfile.coverageComplete, true);
  assert.deepEqual(upperProfile.unaddressedThreatThemeIds, []);
  assert.deepEqual(upperProfile.preemptiveCutThemeIds, []);
  assert.ok(
    upperPosts.some((post) =>
      /실제 압력 위협|현재 위협|대상 선정 기준|필요한 만큼|균형이 잘 잡|깔끔한 표|구성은 적정/.test(
        post.body,
      )
    ),
  );
  assert.ok(
    upperPosts.every((post) =>
      !/2티어를 전부 둔|바로 아래 구간|다음 후보군을 통째로/.test(post.body),
    ),
  );

  const lowerOnly = makeScheduledRestrictionReactionState([
    { themeId: "ironblood", partId: "ironblood-squire", oldLimit: 3, newLimit: 2 },
    { themeId: "ironblood", partId: "ironblood-mobilization", oldLimit: 3, newLimit: 1 },
    { themeId: "abyss", partId: "abyss-bait", oldLimit: 3, newLimit: 2 },
  ], 38_202);
  const lowerPosts = restrictionContextPosts(
    lowerOnly,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  const lowerProfile = getPublishedRestrictionPolicyProfile(
    lowerOnly,
    REGULAR_RESTRICTION_DAY,
  );
  assert.equal(lowerProfile.upperMeaningfulCuts, 0);
  assert.ok(lowerProfile.unaddressedThreatThemeIds.length > 0);
  assert.ok(lowerProfile.preemptiveCutThemeIds.length > 0);
  assert.ok(
    lowerPosts.some((post) =>
      /실제 위협은 덜 막|미대응 위협|선제 제재|비위협|압력 없는|대상 선정이 거꾸로/.test(
        post.body,
      )
    ),
    lowerPosts.map((post) => post.body).join("\n"),
  );
  assert.ok(lowerPosts.every((post) => !/2티어를 전부 둔/.test(post.body)));

  const cosmetic = makeScheduledRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-eternal-ring",
      oldLimit: 3,
      newLimit: 1,
      type: "cosmetic-restriction",
    },
    {
      themeId: "white-night",
      partId: "white-night-saint",
      oldLimit: 3,
      newLimit: 1,
      type: "cosmetic-restriction",
    },
  ], 38_203);
  const cosmeticPosts = restrictionContextPosts(
    cosmetic,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  assert.ok(
    cosmeticPosts.some((post) =>
      /실사용 매수|실제 구축|보여 주기|덱에서 빠지는 카드가 0장|구축 변화 0장/.test(
        post.body,
      )
    ),
    cosmeticPosts.map((post) => post.body).join("\n"),
  );
  assert.ok(
    cosmeticPosts.every((post) =>
      !/해제만으로|풀어 주는 표|복권만|묵은 금제 정리/.test(post.body)
    ),
  );

  const cosmeticWithRelief = makeScheduledRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-eternal-ring",
      oldLimit: 3,
      newLimit: 1,
      type: "cosmetic-restriction",
    },
    {
      themeId: "white-night",
      partId: "white-night-snow-blessing",
      oldLimit: 1,
      newLimit: 3,
    },
  ], 38_204);
  cosmeticWithRelief.community.unshift({
    id: "stale-cosmetic-relief-start",
    day: FIRST_BAN_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "white-night",
    partId: "white-night-snow-blessing",
    value: 1,
    previousValue: 3,
    body: "[운영 공지] 백야의 설원 축복 3→1장",
  });
  const mixedZeroCutPosts = restrictionContextPosts(
    cosmeticWithRelief,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  assert.ok(
    mixedZeroCutPosts.some((post) =>
      /해제 효과|실제 완화·해제|풀린 카드 쪽 복귀|해제 방향/.test(post.body)
    ),
  );
  assert.ok(
    mixedZeroCutPosts.every((post) =>
      !/환경은 발표 전과 똑같음|구축 변화 0장짜리|실사용 매수가 줄어드는 카드는 0종/.test(
        post.body,
      )
    ),
  );

  const partialStaleRelief = makeScheduledRestrictionReactionState([
    {
      themeId: "cycle",
      partId: "cycle-gate",
      oldLimit: 0,
      newLimit: 1,
    },
  ], 38_205);
  partialStaleRelief.community.unshift({
    id: "stale-partial-relief-start",
    day: FIRST_BAN_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 0,
    previousValue: 3,
    body: "[운영 공지] 윤회의 문 3→0장",
  });
  const partialPosts = restrictionContextPosts(
    partialStaleRelief,
    REGULAR_RESTRICTION_REACTION_DAY,
    REGULAR_RESTRICTION_DAY,
  );
  assert.ok(
    partialPosts.some((post) =>
      /완화.*완전 해제|한 칸 풀어|부분 완화|완화에서 멈췄|매수를 늘려/.test(
        post.body,
      )
    ),
  );
  assert.ok(
    partialPosts.every((post) =>
      !/제한한 지 오래되지 않은|빠른 번복|최근 제한을 되돌린|얼마 안 돼/.test(
        post.body,
      )
    ),
  );
});

test("narrow D+4 followups split stabilized, ineffective, replacement, and mixed outcomes", () => {
  const cases: Array<{
    label: string;
    shares: number[];
    expected: RegExp;
    classification: "ineffective" | "replacement" | "mixed";
  }> = [
    {
      label: "ineffective",
      shares: [0.32, 0.25, 0.2, 0.13, 0.1],
      expected: /역시|부족|그대로|안 된다는|고착/,
      classification: "ineffective",
    },
    {
      label: "replacement",
      shares: [0.28, 0.36, 0.16, 0.11, 0.09],
      expected: /풍선|1등 교체|빈자리|새 독주|순위표 이름/,
      classification: "replacement",
    },
    {
      label: "mixed",
      shares: [0.29, 0.26, 0.2, 0.14, 0.11],
      expected: /애매|반반|더 지켜|이르다|확실한 결과는 아직/,
      classification: "mixed",
    },
  ];

  for (const [index, fixture] of cases.entries()) {
    const state = makeScheduledRestrictionReactionState([
      { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    ], 39_100 + index);
    setRestrictionFollowupSnapshot(
      state,
      REGULAR_RESTRICTION_FOLLOWUP_DAY,
      Object.fromEntries(
        state.activeThemeIds.map((themeId, shareIndex) => [
          themeId,
          fixture.shares[shareIndex],
        ]),
      ),
    );
    assert.equal(
      getRestrictionHistoricalOutcome(
        state,
        REGULAR_RESTRICTION_DAY,
        REGULAR_RESTRICTION_FOLLOWUP_DAY,
      ).classification,
      fixture.classification,
      fixture.label,
    );
    const posts = getDailyCommunityPosts(
      state,
      REGULAR_RESTRICTION_FOLLOWUP_DAY,
    ).filter((post) =>
      post.id.startsWith(
        `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
      )
    );
    assert.equal(posts.length, 3, fixture.label);
    assert.equal(new Set(posts.map((post) => post.body)).size, 3, fixture.label);
    assert.ok(posts.some((post) => fixture.expected.test(post.body)), fixture.label);

    const before = posts.map((post) => post.body);
    for (const runtime of Object.values(state.themes)) {
      runtime.share = 0.99;
      runtime.fatigue = 99;
      runtime.unpleasantness = 99;
      runtime.topStreakDays = 999;
    }
    assert.deepEqual(
      getDailyCommunityPosts(state, REGULAR_RESTRICTION_FOLLOWUP_DAY)
        .filter((post) =>
          post.id.startsWith(
            `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
          )
        )
        .map((post) => post.body),
      before,
      `${fixture.label} must use history only`,
    );
  }
});

test("one-card and two-card stabilization earn distinct surprised reappraisals", () => {
  const makeWideMeta = (
    changes: readonly RestrictionFixtureChange[],
    seed: number,
  ) => {
    const state = makeScheduledRestrictionReactionState(changes, seed);
    const extraThemes = THEMES.slice(5, 8);
    for (const [index, theme] of extraThemes.entries()) {
      state.activeThemeIds.push(theme.id);
      state.themes[theme.id] = makeRuntime(theme, [0.07, 0.06, 0.05][index]);
    }
    const decision = [0.28, 0.2, 0.16, 0.1, 0.08, 0.07, 0.06, 0.05];
    setRestrictionFollowupSnapshot(
      state,
      REGULAR_RESTRICTION_DAY,
      Object.fromEntries(
        state.activeThemeIds.map((themeId, index) => [themeId, decision[index]]),
      ),
    );
    return state;
  };

  const single = makeWideMeta([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
  ], 39_201);
  setRestrictionFollowupSnapshot(
    single,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
    Object.fromEntries(
      single.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.24, 0.18, 0.15, 0.12, 0.1, 0.08, 0.07, 0.06][index],
      ]),
    ),
  );
  assert.equal(
    getRestrictionHistoricalOutcome(
      single,
      REGULAR_RESTRICTION_DAY,
      REGULAR_RESTRICTION_FOLLOWUP_DAY,
    ).classification,
    "stabilized",
  );
  const singlePosts = getDailyCommunityPosts(
    single,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
  ).filter((post) =>
    post.id.startsWith(
      `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
    )
  );
  assert.equal(singlePosts.length, 3);
  assert.ok(
    singlePosts.some((post) =>
      /이걸 노렸|한 장으로 여기까지|다시 봐야|예상 못|병목/.test(post.body)
    ),
  );

  const double = makeWideMeta([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 1 },
  ], 39_202);
  setRestrictionFollowupSnapshot(
    double,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
    Object.fromEntries(
      double.activeThemeIds.map((themeId, index) => [
        themeId,
        [0.25, 0.18, 0.15, 0.12, 0.1, 0.08, 0.07, 0.05][index],
      ]),
    ),
  );
  assert.equal(
    getRestrictionHistoricalOutcome(
      double,
      REGULAR_RESTRICTION_DAY,
      REGULAR_RESTRICTION_FOLLOWUP_DAY,
    ).classification,
    "stabilized",
  );
  const doublePosts = getDailyCommunityPosts(
    double,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
  ).filter((post) =>
    post.id.startsWith(
      `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
    )
  );
  assert.equal(doublePosts.length, 3);
  assert.ok(
    doublePosts.some((post) =>
      /두 장뿐|두 카드|2종|적은 변경|최소 변경/.test(post.body)
    ),
  );
});

test("two-target overcorrection names only the target that actually collapsed", () => {
  const state = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 1 },
  ], 39_301);
  setRestrictionFollowupSnapshot(state, REGULAR_RESTRICTION_FOLLOWUP_DAY, {
    cycle: 0.15,
    "white-night": 0.27,
    "machine-revolution": 0.23,
    ironblood: 0.18,
    abyss: 0.17,
  });
  const posts = getDailyCommunityPosts(
    state,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
  ).filter((post) =>
    post.id.startsWith(
      `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
    )
  );
  assert.equal(posts.length, 3);
  assert.ok(posts.every((post) => post.partId === "cycle-gate"));
  assert.ok(posts.some((post) => /붕괴|과잉|퇴출|너무 세게/.test(post.body)));
  assert.ok(posts.every((post) => !post.body.includes("백야의 기도")));
});

test("two-target mixed followups do not claim that a rising target fell", () => {
  const state = makeScheduledRestrictionReactionState([
    { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
    { themeId: "white-night", partId: "white-night-prayer", oldLimit: 3, newLimit: 1 },
  ], 39_302);
  setRestrictionFollowupSnapshot(state, REGULAR_RESTRICTION_FOLLOWUP_DAY, {
    cycle: 0.29,
    "white-night": 0.27,
    "machine-revolution": 0.19,
    ironblood: 0.14,
    abyss: 0.11,
  });
  assert.equal(
    getRestrictionHistoricalOutcome(
      state,
      REGULAR_RESTRICTION_DAY,
      REGULAR_RESTRICTION_FOLLOWUP_DAY,
    ).classification,
    "mixed",
  );
  const posts = getDailyCommunityPosts(
    state,
    REGULAR_RESTRICTION_FOLLOWUP_DAY,
  ).filter((post) =>
    post.id.startsWith(
      `daily-restriction-followup-${REGULAR_RESTRICTION_DAY}-`,
    )
  );
  assert.equal(posts.length, 3);
  assert.ok(posts.some((post) => post.partId === "white-night-prayer"));
  assert.ok(
    posts
      .filter((post) => post.partId === "white-night-prayer")
      .every((post) => !/내려갔|하락|감소/.test(post.body)),
  );
});

test("restriction reactions start next day and dominate the board 16/14/12", () => {
  let state = createInitialGame(1000);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 2 });
  const announcement = state.community.find(
    (event) =>
      event.day === FIRST_BAN_DAY &&
      event.type === "restriction-applied",
  );
  assert.ok(announcement);

  const decisionPosts = getDailyCommunityPosts(state, FIRST_BAN_DAY);
  assert.equal(
    decisionPosts.some((post) => post.id === announcement.id),
    false,
  );
  assert.equal(
    decisionPosts.some((post) =>
      post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`)
    ),
    false,
  );

  const before = JSON.stringify(state);
  for (const [day, expected] of [
    [FIRST_RESTRICTION_REACTION_DAY, 16],
    [FIRST_RESTRICTION_REACTION_DAY + 1, 14],
    [FIRST_RESTRICTION_REACTION_DAY + 2, 12],
  ] as const) {
    const first = getDailyCommunityPosts(state, day);
    const second = getDailyCommunityPosts(state, day);
    const contextual = restrictionContextPosts(state, day);
    assert.equal(first.length, 20);
    assert.equal(contextual.length, expected);
    assert.equal(new Set(contextual.map((post) => post.body)).size, expected);
    assert.deepEqual(first, second);
    assert.ok(
      getCommunityHeat(state, day) >=
        ([96, 84, 70] as const)[day - FIRST_RESTRICTION_REACTION_DAY],
    );
    for (const post of contextual) {
      const theme = THEME_BY_ID[post.themeId];
      assert.ok(theme);
      assert.ok(theme.parts.some((part) => part.id === post.partId));
      const matchingDecision = state.community.find(
        (event) =>
          event.day === FIRST_BAN_DAY &&
          event.themeId === post.themeId &&
          event.partId === post.partId &&
          (event.type === "restriction-applied" ||
            event.type === "cosmetic-restriction"),
      );
      assert.ok(matchingDecision);
      assert.equal(post.value, matchingDecision.value);
      assert.equal(post.previousValue, matchingDecision.previousValue);
      assert.equal(post.relatedThemeId, undefined);
      assert.equal(post.body.includes("금제표 나온 지 하루 만에"), false);
    }
  }
  assert.equal(JSON.stringify(state), before);
});

test("generic-only restrictions burn hotter and fill the board with multi-deck fallout", () => {
  let state = createFirstBanGame(91_001);
  const genericCardId = Object.keys(state.genericLimits)[0];
  assert.ok(genericCardId);
  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: { [genericCardId]: 0 },
    campaignSeed: 91_001,
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 3 });

  const before = JSON.stringify(state);
  for (const [day, expectedCount, expectedHeat] of [
    [FIRST_RESTRICTION_REACTION_DAY, 18, 99],
    [FIRST_RESTRICTION_REACTION_DAY + 1, 16, 91],
    [FIRST_RESTRICTION_REACTION_DAY + 2, 14, 81],
  ] as const) {
    const posts = getDailyCommunityPosts(state, day);
    const genericFallout = posts.filter(
      (post) =>
        post.category === "restriction" &&
        post.genericCardId === genericCardId,
    );
    assert.equal(posts.length, 20);
    assert.equal(genericFallout.length, expectedCount);
    assert.equal(new Set(genericFallout.map((post) => post.body)).size, expectedCount);
    assert.ok(genericFallout.every((post) => post.partId === genericCardId));
    assert.ok(genericFallout.every((post) => Boolean(THEME_BY_ID[post.themeId])));
    assert.equal(getCommunityHeat(state, day), expectedHeat);
    assert.deepEqual(getDailyCommunityPosts(state, day), posts);
  }
  const firstDay = getDailyCommunityPosts(
    state,
    FIRST_RESTRICTION_REACTION_DAY,
  ).filter(
    (post) => post.genericCardId === genericCardId,
  );
  assert.ok(
    firstDay.some((post) =>
      /동시|같이 피해|줄줄이|개나소나|잘 갔다|여러 테마|공용/.test(post.body)
    ),
  );
  assert.equal(JSON.stringify(state), before);
});

test("dedicated reprint packs branch into price-crash, access, and collector conversation", () => {
  let state = createInitialGame(91_002);
  const candidate = getReprintCandidates(state).find(
    (entry) => entry.cardKind === "theme-part" && entry.collectorLabel === null,
  );
  assert.ok(candidate?.themeId);
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId: candidate.cardId },
  });
  state = advanceThroughMilestones(state, FIRST_REPRINT_TEST_RELEASE_DAY);
  assert.equal(state.day, FIRST_REPRINT_TEST_RELEASE_DAY);
  assert.equal(state.releaseSlate?.releaseKind, "reprint");
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(state),
  });
  const reprint = state.releaseHistory.at(-1)?.products.find(
    (product) => product.kind === "reprint",
  );
  assert.ok(reprint && reprint.kind === "reprint");
  state = advanceThroughMilestones(state, FIRST_REPRINT_TEST_RELEASE_DAY + 4);

  const linked = Array.from({ length: 4 }, (_, index) =>
    FIRST_REPRINT_TEST_RELEASE_DAY + 1 + index
  ).flatMap((day) =>
    getDailyCommunityPosts(state, day).filter(
      (post) =>
        post.partId === reprint.cardId &&
        /재판|재록|재판본|초판|가격|시세|매입가|접근성/.test(post.body),
    )
  );
  assert.ok(linked.length >= 8);
  assert.ok(linked.some((post) => /폭락|내려|반 토막|급락|무너/.test(post.body)));
  assert.ok(linked.some((post) => /개꿀|입문|맞출|접근성|플레이용/.test(post.body)));
  assert.ok(linked.some((post) => /초판|보유자|수집|컬렉터/.test(post.body)));
  assert.ok(linked.every((post) => post.themeId === candidate.themeId));
});

test("a no-change restriction announcement also creates a delayed debate", () => {
  const state = makeNoChangeRestrictionState();

  assert.equal(
    getDailyCommunityPosts(state, FIRST_BAN_DAY).some(
      (post) => post.id === "no-change-announcement",
    ),
    false,
  );
  const posts = getDailyCommunityPosts(state, FIRST_RESTRICTION_REACTION_DAY);
  const contextual = posts.filter((post) =>
    post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`),
  );
  assert.equal(posts.length, 20);
  assert.equal(contextual.length, 16);
  assert.ok(
    contextual.some((post) =>
      /변경 없음|현행 유지|아무것도 안 자른/.test(post.body),
    ),
  );
  assert.ok(contextual.every((post) => post.previousValue === post.value));
  for (const day of FIRST_RESTRICTION_AFTERMATH_DAYS) {
    const delayed = getDailyCommunityPosts(state, day).filter((post) =>
      post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`),
    );
    assert.ok(
      delayed.every(
        (post) =>
          !/가격 반토막|덱 해체|카드가 빠지면|우회 전개|금제 후 랭크|점유율만 빠지고|같이 맞았네|[0-3]→[0-3]/.test(
            post.body,
          ),
      ),
    );
  }
});

test("no-change debate condemns a stuck meta but stays skeptical in a healthy one", () => {
  const healthy = makeNoChangeRestrictionState(3309);
  const unhealthy = structuredClone(healthy);
  setNoChangeMetaHealth(healthy, false);
  setNoChangeMetaHealth(unhealthy, true);
  const criticalPattern =
    /아무것도 안 자르냐|손을 아예 놨네|다음 금제로 미룬|경고등|책임을 유저|숨 쉴 틈|환경이 괜찮다는|쌓인 피로|검토 결과|고착에도|환경 개선보다|솜방망이 금제보다|신중함이 아니라 방치|상위권 집중|별개 문제|기준으로만/;
  const context = (state: GameState) =>
    getDailyCommunityPosts(state, FIRST_RESTRICTION_REACTION_DAY).filter((post) =>
      post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`),
    );
  const healthyPosts = context(healthy);
  const unhealthyPosts = context(unhealthy);

  assert.equal(healthyPosts.length, 16);
  assert.equal(unhealthyPosts.length, 16);
  assert.equal(
    healthyPosts.filter((post) => criticalPattern.test(post.body)).length,
    0,
  );
  assert.ok(
    unhealthyPosts.filter((post) => criticalPattern.test(post.body)).length >=
      10,
  );
  assert.ok(
    healthyPosts.filter((post) =>
      /현행 유지|한 사이클 더|과잉 대응|지켜보자|관찰|금제보다 연구|변경 없음도 선택|유지는 납득|건드리지 않은|건드릴 이유/.test(
        post.body,
      ),
    ).length >= 3,
  );
  assert.ok(
    healthyPosts.filter((post) =>
      /설명|근거|결과|책임|논쟁|다음 대회|다음 금제/.test(post.body)
    ).length >= 5,
  );
});

test("no-change targets the tournament leader and condemns a forty-percent top-cut share", () => {
  const state = makeNoChangeRestrictionState(3311);
  const decisionHistory = state.history.find(
    (entry) => entry.day === FIRST_BAN_DAY,
  );
  assert.ok(decisionHistory);
  decisionHistory.topCutPlacements = {
    cycle: 5,
    "white-night": 3,
    "machine-revolution": 14,
    ironblood: 4,
    abyss: 6,
  };

  const posts = getDailyCommunityPosts(
    state,
    FIRST_RESTRICTION_REACTION_DAY,
  ).filter((post) =>
    post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`)
  );

  assert.equal(posts.length, 16);
  assert.ok(posts.filter((post) => post.themeId === "machine-revolution").length >= 14);
  assert.ok(posts.some((post) => /기계혁명/.test(post.body)));
  assert.ok(posts.some((post) => /입상 .*%/.test(post.body)));
  assert.ok(
    posts.filter((post) =>
      /방치|납득이 안|숨 쉴 틈|책임|고착|경고등|아무것도|현행 유지|무금제|금제 기준|상위권 집중/.test(
        post.body,
      )
    ).length >= 10,
  );
});

test("historical no-change debate ignores later runtime pressure", () => {
  const state = makeNoChangeRestrictionState(3310);
  setNoChangeMetaHealth(state, false);
  const before = getDailyCommunityPosts(state, FIRST_RESTRICTION_REACTION_DAY)
    .filter((post) =>
      post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`)
    )
    .map((post) => post.body);

  for (const runtime of Object.values(state.themes)) {
    runtime.share = 0.99;
    runtime.unpleasantness = 99;
    runtime.fatigue = 99;
    runtime.topStreakDays = 999;
  }

  assert.deepEqual(
    getDailyCommunityPosts(state, FIRST_RESTRICTION_REACTION_DAY)
      .filter((post) =>
        post.id.startsWith(`daily-restriction-${FIRST_BAN_DAY}-`)
      )
      .map((post) => post.body),
    before,
  );
});

test("restriction recency copy uses the latest support product, not theme debut", () => {
  const state = makeScheduledRestrictionReactionState(
    [
      { themeId: "cycle", partId: "cycle-gate", oldLimit: 3, newLimit: 1 },
      {
        themeId: "white-night",
        partId: "white-night-prayer",
        oldLimit: 3,
        newLimit: 1,
      },
    ],
    1000,
    SECOND_RESTRICTION_DAY,
  );
  const restrictedThemeIds = [
    ...new Set(
      state.community
        .filter(
          (event) =>
            event.day === SECOND_RESTRICTION_DAY &&
            (event.type === "restriction-applied" ||
              event.type === "cosmetic-restriction"),
        )
        .map((event) => event.themeId),
    ),
  ];
  assert.ok(restrictedThemeIds.length > 0);
  state.releaseHistory.push({
    day: RECENT_SUPPORT_RELEASE_DAY,
    releaseKind: "regular",
    products: restrictedThemeIds.map((themeId, index) => ({
      optionId: `recent-restricted-support-${index}`,
      kind: "support",
      themeId,
      direction: "recovery",
      expectedTier: "Tier 1",
      powerAdjustment: 0,
    })),
  });
  const recencyPosts = [
    SECOND_RESTRICTION_REACTION_DAY + 1,
    SECOND_RESTRICTION_REACTION_DAY + 2,
  ].flatMap((day) =>
    getDailyCommunityPosts(state, day)
      .filter((post) =>
        post.id.startsWith(`daily-restriction-${SECOND_RESTRICTION_DAY}-`)
      )
      .filter((post) => /발매 \d+일/.test(post.body)),
  );
  assert.ok(recencyPosts.length > 0);
  const expectedAge = SECOND_RESTRICTION_DAY - RECENT_SUPPORT_RELEASE_DAY;
  assert.ok(
    recencyPosts.every((post) => post.body.includes(`발매 ${expectedAge}일`)),
  );
});

test("crosses prior theme strength with support strength in dense release chatter", () => {
  const cases = [
    {
      state: supportReactionState("strong", 3, false, 55101),
      expected:
        /상위권|1티어|강한 테마|밀어주|연임|메타 1위|왕관|환경 전체|다른 테마/,
    },
    {
      state: supportReactionState("strong", -3, false, 55102),
      expected: /애초에 왜 줌|그나마 다행|지원 자리|자원 낭비|왜 냈|실질 강화|다른 테마나/,
    },
    {
      state: supportReactionState("weak", 2, false, 55103),
      expected: /제대로 된 지원|메타 순환|구제 지원|비주류|실전덱|팬덱|새 얼굴|이 정도는 줘야/,
    },
    {
      state: supportReactionState("weak", -3, false, 55104),
      expected: /지원 자리.*아깝|지원 횟수|슬롯|날리|약한 .*약한|구제|팬들이 기다린/,
    },
  ];

  for (const { state, expected } of cases) {
    for (const [age, expectedQuota, expectedPlay] of [
      [1, 16, 16],
      [2, 12, 12],
      [3, 8, 8],
      [4, 5, 5],
    ] as const) {
      const day = 60 + age;
      const first = getDailyCommunityPosts(state, day);
      const second = getDailyCommunityPosts(state, day);
      const contextual = first.filter((post) => post.id.startsWith("daily-release-"));
      const productVoices = contextual.filter((post) => post.id.endsWith("-play"));
      assert.equal(contextual.length, expectedQuota, `DAY +${age}`);
      assert.equal(productVoices.length, expectedPlay, `DAY +${age}`);
      if (age === 1) {
        assert.ok(productVoices.some((post) => expected.test(post.body)), `DAY +${age}`);
      }
      assert.equal(
        new Set(contextual.map((post) => post.body)).size,
        contextual.length,
        `duplicate contextual copy on DAY +${age}`,
      );
      assert.ok(
        contextual.every((post) => !/^\[(?:티어|캐주얼|콜렉터|관전자|겜안분)/.test(post.body)),
      );
      assert.deepEqual(first, second);
    }
  }
});

test("calls out a Theseus rebuild when new cards displace an old weak-theme core", () => {
  const state = supportReactionState("weak", 3, true, 77703);
  const target = THEME_BY_ID[state.activeThemeIds[0]];
  const launchParts = target.parts.slice(0, INITIAL_THEME_PART_COUNT);
  const supportParts = target.parts.slice(
    INITIAL_THEME_PART_COUNT,
    INITIAL_THEME_PART_COUNT + SUPPORT_PARTS_PER_RELEASE,
  );
  const posts = getDailyCommunityPosts(state, 61)
    .filter((post) => post.id.startsWith("daily-release-"))
    .filter((post) => post.id.endsWith("-play"));

  assert.equal(posts.length, 16);
  assert.ok(posts.some((post) => post.body.includes("테세우스")));
  assert.ok(
    posts.some((post) => launchParts.some((part) => post.body.includes(part.name))),
  );
  assert.ok(
    posts.some((post) => supportParts.some((part) => post.body.includes(part.name))),
  );
  assert.ok(posts.every((post) => supportParts.some((part) => part.id === post.partId)));
  assert.ok(
    posts.filter((post) =>
      /기존|옛날|예전|구축|리메이크|정체성|테세우스|상위 호환|해고/.test(post.body),
    ).length >= 6,
  );
});

test("never names prepared-but-unreleased cards in historical community snapshots", () => {
  const state = supportReactionState("strong", 3, false, 88331);
  const targetId = state.activeThemeIds[0];
  const target = THEME_BY_ID[targetId];

  for (const day of [20, 60, 61, 64]) {
    const posts = getDailyCommunityPosts(state, day);
    for (const post of posts) {
      const content = THEME_BY_ID[post.themeId];
      const supportCount = state.releaseHistory.reduce(
        (count, batch) =>
          batch.day < day
            ? count +
              batch.products.filter(
                (product) =>
                  product.kind === "support" && product.themeId === post.themeId,
              ).length
            : count,
        0,
      );
      const releasedCount =
        INITIAL_THEME_PART_COUNT + supportCount * SUPPORT_PARTS_PER_RELEASE;
      const released = content.parts.slice(0, releasedCount);
      const unreleased = content.parts.slice(releasedCount);
      assert.ok(released.some((part) => part.id === post.partId), `${day}: ${post.id}`);
      assert.ok(
        unreleased.every((part) => !post.body.includes(part.name)),
        `${day}: ${post.body}`,
      );
    }
  }

  const beforeSupport = getDailyCommunityPosts(state, 60).filter(
    (post) => post.themeId === targetId,
  );
  assert.ok(
    beforeSupport.every((post) =>
      target.parts
        .slice(0, INITIAL_THEME_PART_COUNT)
        .some((part) => part.id === post.partId),
    ),
  );
});

test("keeps a first support wave's D+1 board identical after a later wave", () => {
  let state = createInitialGame(99551);
  const initialSupportCount = state.themes["white-night"].supportCount;
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: "white-night",
    direction: "consistency",
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: FIRST_REGULAR_TEST_RELEASE_DAY - state.day,
  });
  state = advanceThroughMilestones(state, FIRST_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.day, FIRST_REGULAR_TEST_RELEASE_DAY);
  assert.ok(state.releaseSlate);
  const firstSelections = getPlannedReleaseOptions(state);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: firstSelections.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: index === 0 ? 3 : 0,
    })),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, FIRST_REGULAR_TEST_RELEASE_DAY + 1);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const firstView = getDailyCommunityPosts(
    state,
    FIRST_REGULAR_TEST_RELEASE_DAY + 1,
  );
  assert.ok(firstView.some((post) => post.type === "support-released"));

  state = advanceThroughMilestones(state, SECOND_RESTRICTION_DAY);
  assert.equal(state.day, SECOND_RESTRICTION_DAY);
  assert.equal(state.phase, "ban-edit");
  state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, SECOND_RESTRICTION_REACTION_DAY);
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: "white-night",
    direction: "recovery",
  });
  state = advanceThroughMilestones(state, SECOND_REGULAR_TEST_RELEASE_DAY);
  assert.equal(state.day, SECOND_REGULAR_TEST_RELEASE_DAY);
  assert.ok(state.releaseSlate);
  const secondSelections = getPlannedReleaseOptions(state);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: secondSelections.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: index === 0 ? -3 : 0,
    })),
  });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(
    state.themes["white-night"].supportCount,
    initialSupportCount + 2,
  );
  assert.equal(state.themes["white-night"].lastSupportAdjustment, -3);

  const beforeHistoricalRead = JSON.stringify(state);
  assert.deepEqual(
    getDailyCommunityPosts(state, FIRST_REGULAR_TEST_RELEASE_DAY + 1),
    firstView,
  );
  assert.equal(JSON.stringify(state), beforeHistoricalRead);
});

test("routes unban debate through overdue, dangerous, surge, no-impact, and measured outcomes", () => {
  const cases: Array<{
    tone: UnbanFixtureTone;
    seed: number;
    primary: RegExp;
  }> = [
    {
      tone: "overdue",
      seed: 71001,
      primary: /왜 이제|그동안 왜|늦|오래|방치|걸렸|정상화|묶|떠난|금제는 빨랐/,
    },
    {
      tone: "dangerous",
      seed: 71002,
      primary: /왜 풀|상위권|불쾌|독주|봉인|위험|미러전|강했|환경 피로|금제한 문제/,
    },
    {
      tone: "surge",
      seed: 71003,
      primary: /봐라|복귀|급등|반등|수직|상위 재진입|다시 안 뜬다|복구|메타 시계|추세/,
    },
    {
      tone: "no-impact",
      seed: 71004,
      primary: /거의 그대로|괜히 겁|아무 일|달라진 게|영향 없음|미동|과잉 대응|아무 변화|진작|조용/,
    },
    {
      tone: "measured",
      seed: 71005,
      primary: /적당|환영|선택지|메타 순환|숨통|복귀 폭|돌려주는|경쟁권|균형|성공적인/,
    },
  ];
  const caution =
    /표본|지켜봐|최소 한 주|데이터|신중|달라질 수|가능성|방심|확인하자|대응하면|며칠|성급|매치업 분포|관찰/;

  for (const { tone, seed, primary } of cases) {
    const state = unbanReactionState(tone, seed);
    const before = JSON.stringify(state);
    for (const [age, quota, cautionCount] of [
      [1, 16, 3],
      [2, 14, 3],
      [3, 12, 2],
    ] as const) {
      const posts = getDailyCommunityPosts(
        state,
        REGULAR_RESTRICTION_DAY + age,
      ).filter((post) =>
        post.id.startsWith(`daily-restriction-${REGULAR_RESTRICTION_DAY}-`),
      );
      assert.equal(posts.length, quota, `${tone} D+${age}`);
      assert.equal(new Set(posts.map((post) => post.body)).size, quota);
      assert.ok(
        posts.filter((post) => primary.test(post.body)).length >=
          Math.floor(quota * 0.35),
        `${tone} primary D+${age}\n${posts.map((post) => post.body).join("\n")}`,
      );
      const cautionNumbers = age === 1 ? [5, 10, 15] : age === 2 ? [4, 9, 13] : [5, 10];
      const routedCaution = posts.filter((post) => {
        const match = post.id.match(/-(\d+)-(\d{2})$/);
        return match ? cautionNumbers.includes(Number(match[2])) : false;
      });
      assert.equal(routedCaution.length, cautionCount, `${tone} caution D+${age}`);
      assert.ok(routedCaution.every((post) => caution.test(post.body)));
      assert.ok(posts.every((post) => post.value === 3 && post.previousValue === 1));
      assert.ok(posts.every((post) => !/^\[(?:티어|캐주얼|콜렉터|관전자)/.test(post.body)));
    }
    assert.equal(JSON.stringify(state), before);
  }
});

test("historical unban reactions ignore later runtime and restriction changes", () => {
  const state = unbanReactionState("surge", 72001);
  const historical = getDailyCommunityPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
  );
  const later = structuredClone(state);
  later.day = NEXT_REGULAR_RESTRICTION_DAY + 5;
  later.themes.cycle.share = 0.5;
  later.themes.cycle.unpleasantness = 99;
  later.themes.cycle.fatigue = 99;
  later.themes.cycle.legalLimits["cycle-gate"] = 0;
  later.community.push({
    id: "future-cycle-restriction",
    day: NEXT_REGULAR_RESTRICTION_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 0,
    previousValue: 3,
    body: "미래 금제",
  });
  later.history.push({
    day: NEXT_REGULAR_RESTRICTION_DAY + 5,
    totalUsers: 9_000,
    revenue: 0.4,
    topThemeId: "cycle",
    shares: Object.fromEntries(
      later.activeThemeIds.map((themeId) => [
        themeId,
        themeId === "cycle" ? 0.5 : 0.5 / (later.activeThemeIds.length - 1),
      ]),
    ),
  });

  assert.deepEqual(
    getDailyCommunityPosts(later, REGULAR_RESTRICTION_REACTION_DAY),
    historical,
  );
});

test("periodically asks to free long-restricted off-meta cards without flooding", () => {
  const state = staleRestrictionState(false, 73001);
  const activeDays: number[] = [];
  let captured: CommunityEvent[] | null = null;
  for (
    let day = REGULAR_RESTRICTION_DAY + 4;
    day <= REGULAR_RESTRICTION_DAY + 34;
    day += 1
  ) {
    const board = getDailyCommunityPosts(state, day);
    const stale = board.filter((post) =>
      post.id.startsWith("daily-stale-restriction-"),
    );
    assert.equal(board.length, 20);
    assert.ok(stale.length <= 2);
    if (stale.length > 0) {
      activeDays.push(day);
      captured ??= board;
      assert.ok(
        stale.every((post) =>
          /아직 제한|왜 계속|화석|유지할 이유|묶|복역|겁|방치|장기 제한|티어표|입상|공동묘지|시대가 바뀐|해제 검토/.test(
            post.body,
          ),
        ),
      );
    }
  }
  assert.ok(activeDays.length >= 3);
  for (let index = 1; index < activeDays.length; index += 1) {
    const gap = activeDays[index] - activeDays[index - 1];
    assert.ok(gap >= 5 && gap <= 9, `ambient gap ${gap}`);
  }
  assert.ok(captured);

  const historicalDay = activeDays[0];
  const historical = getDailyCommunityPosts(state, historicalDay);
  const later = structuredClone(state);
  later.day = NEXT_REGULAR_RESTRICTION_DAY + 5;
  later.themes.cycle.share = 0.4;
  later.themes.cycle.legalLimits["cycle-gate"] = 3;
  later.history.push({
    day: NEXT_REGULAR_RESTRICTION_DAY + 5,
    totalUsers: 8_000,
    revenue: 0.3,
    topThemeId: "cycle",
    shares: Object.fromEntries(
      later.activeThemeIds.map((themeId) => [
        themeId,
        themeId === "cycle" ? 0.4 : 0.6 / (later.activeThemeIds.length - 1),
      ]),
    ),
  });
  later.community.push({
    id: "future-unban",
    day: NEXT_REGULAR_RESTRICTION_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 3,
    previousValue: 1,
    body: "미래 해제",
  });
  assert.deepEqual(getDailyCommunityPosts(later, historicalDay), historical);
});

test("prioritizes an overdue unban request after a no-change restriction review", () => {
  const state = staleRestrictionState(true, 74001);
  const posts = getDailyCommunityPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
  );
  const contextual = posts.filter((post) =>
    post.id.startsWith(`daily-restriction-${REGULAR_RESTRICTION_DAY}-`),
  );
  const stale = contextual.filter((post) => post.id.includes("-stale-"));
  assert.equal(posts.length, 20);
  assert.equal(contextual.length, 16);
  assert.equal(stale.length, 1);
  assert.ok(posts.slice(0, 2).some((post) => post.id === stale[0].id));
  assert.match(stale[0].body, /왜|화석|묶|제한|금제표|복역|사라진/);
  assert.equal(stale[0].value, stale[0].previousValue);
});

test("formats full and partial restriction relief explicitly", () => {
  const state = makeState(75001);
  const base: CommunityEvent = {
    id: "format-unban",
    day: REGULAR_RESTRICTION_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId: "cycle",
    partId: "cycle-gate",
    value: 3,
    previousValue: 1,
    body: "",
  };
  assert.match(formatCommunityEvent(base, state), /제한 해제 1→3장/);
  assert.match(
    formatCommunityEvent(
      { ...base, id: "format-relief", value: 2 },
      state,
    ),
    /제한 완화 1→2장/,
  );
});

test("business campaigns fill their opening-day community quotas", () => {
  const cases = [
    { type: "tv-cm", expected: 8, duration: 21 },
    { type: "animation-promotion", expected: 10, duration: 75 },
    { type: "store-tour", expected: 8, duration: 14 },
  ] as const;

  for (const [index, campaign] of cases.entries()) {
    const state = makeState(81_000 + index);
    state.day = 70;
    addBusinessRecord(state, {
      type: campaign.type,
      startedDay: 59,
      endsDay: 59 + campaign.duration,
      cost: campaign.type === "animation-promotion" ? 3 : campaign.type === "tv-cm" ? 0.6 : 0.35,
      outcome: "active",
    });
    const posts = getDailyCommunityPosts(state, 60);
    const campaignPosts = posts.filter((post) => post.type === "business-reaction");
    assert.equal(posts.length, 20);
    assert.equal(campaignPosts.length, campaign.expected, campaign.type);
    assert.equal(new Set(campaignPosts.map((post) => post.body)).size, campaign.expected);
    assert.ok(campaignPosts.every((post) => !/[{}]/.test(post.body)));
  }
});

test("new recurring business campaigns decay through eight-six-four-two reactions", () => {
  const cases = [
    {
      type: "beginner-camp",
      cost: 0.4,
      duration: 14,
      copy: BEGINNER_CAMP_COPY,
    },
    {
      type: "local-league",
      cost: 0.5,
      duration: 21,
      copy: LOCAL_LEAGUE_COPY,
    },
    {
      type: "lending-exchange-network",
      cost: 0.55,
      duration: 30,
      copy: LENDING_EXCHANGE_NETWORK_COPY,
    },
    {
      type: "collector-fair",
      cost: 0.65,
      duration: 14,
      copy: COLLECTOR_FAIR_COPY,
    },
  ] as const;
  const expectedQuotas = [8, 6, 4, 2] as const;

  for (const [index, campaign] of cases.entries()) {
    const state = makeState(81_200 + index);
    state.day = 70;
    addBusinessRecord(state, {
      type: campaign.type,
      startedDay: 59,
      endsDay: 59 + campaign.duration,
      cost: campaign.cost,
      outcome: "active",
    });
    const record = state.operations.records[state.operations.records.length - 1];
    assert.ok(record);
    const allowed = new Set<string>(campaign.copy);

    for (const [age, expected] of expectedQuotas.entries()) {
      const posts = getDailyCommunityPosts(state, 60 + age);
      const reactions = posts.filter((post) =>
        post.id.startsWith(`daily-business-${record.id}-`),
      );
      assert.equal(posts.length, 20);
      assert.equal(reactions.length, expected, `${campaign.type} D+${age}`);
      assert.equal(new Set(reactions.map((post) => post.body)).size, expected);
      assert.ok(reactions.every((post) => post.type === "business-reaction"));
      assert.ok(reactions.every((post) => allowed.has(post.body)));
    }

    const afterReactionWindow = getDailyCommunityPosts(state, 64).filter((post) =>
      post.id.startsWith(`daily-business-${record.id}-`),
    );
    assert.equal(afterReactionWindow.length, 0, campaign.type);
  }
});

test("animation reactions use the matching phase for the full broadcast period", () => {
  const state = makeState(81_100);
  state.day = 140;
  addBusinessRecord(state, {
    type: "animation-promotion",
    startedDay: 59,
    endsDay: 134,
    cost: 3,
    outcome: "completed",
  });

  for (const { day, elapsed, expected } of [
    { day: 60, elapsed: 1, expected: 10 },
    { day: 74, elapsed: 15, expected: 2 },
    { day: 75, elapsed: 16, expected: 2 },
    { day: 119, elapsed: 60, expected: 2 },
    { day: 120, elapsed: 61, expected: 2 },
    { day: 134, elapsed: 75, expected: 2 },
  ] as const) {
    const allowed = new Set(getAnimationPromotionCopy(elapsed, 75));
    const reactions = getDailyCommunityPosts(state, day).filter((post) =>
      post.id.startsWith("daily-business-business-action-1-"),
    );
    assert.equal(reactions.length, expected, `broadcast D+${elapsed}`);
    assert.ok(
      reactions.every((post) => allowed.has(post.body)),
      `wrong phase copy on broadcast D+${elapsed}`,
    );
    assert.ok(reactions.every((post) => !/[{}]|반년/.test(post.body)));
  }

  const afterBroadcast = getDailyCommunityPosts(state, 135).filter((post) =>
    post.id.startsWith("daily-business-business-action-1-"),
  );
  assert.equal(afterBroadcast.length, 0);
});

test("championship success and backlash dominate the board with distinct decay", () => {
  for (const [outcome, quotas] of [
    ["success", [18, 14, 10]],
    ["backlash", [20, 16, 12]],
  ] as const) {
    const state = makeState(outcome === "success" ? 82_001 : 82_002);
    state.day = 70;
    addBusinessRecord(state, {
      type: "championship",
      startedDay: 59,
      endsDay: 66,
      cost: 0.8,
      outcome,
      risk: outcome === "success" ? 0.12 : 0.78,
      environmentHealth: outcome === "success" ? 86 : 24,
      resolvedDay: 60,
    });
    for (let age = 0; age < quotas.length; age += 1) {
      const posts = getDailyCommunityPosts(state, 60 + age);
      const contextual = posts.filter((post) =>
        post.id.startsWith("daily-business-business-action-1-"),
      );
      assert.equal(posts.length, 20);
      assert.equal(contextual.length, quotas[age], `${outcome} D+${age}`);
      assert.equal(new Set(contextual.map((post) => post.body)).size, quotas[age]);
      assert.ok(
        contextual.every((post) =>
          post.type === (outcome === "backlash" ? "business-scandal" : "business-reaction"),
        ),
      );
    }
  }
});

test("pack-odds rumors turn into a four-day scandal only when detected", () => {
  const state = makeState(83_001);
  state.day = 70;
  addBusinessRecord(state, {
    type: "pack-odds",
    startedDay: 45,
    endsDay: 89,
    cost: 0.1,
    outcome: "detected",
    risk: 0.3,
    appliedDay: 60,
    resolvedDay: 61,
  });

  const rumor = getDailyCommunityPosts(state, 60).filter((post) =>
    post.id.startsWith("daily-business-business-action-1-"),
  );
  assert.equal(rumor.length, 12);
  assert.ok(rumor.every((post) => post.type === "business-reaction"));

  for (const [age, quota] of [18, 14, 10, 6].entries()) {
    const board = getDailyCommunityPosts(state, 61 + age);
    const scandal = board.filter((post) => post.type === "business-scandal");
    assert.equal(board.length, 20);
    assert.equal(scandal.length, quota, `detected D+${age}`);
    assert.equal(new Set(scandal.map((post) => post.body)).size, quota);
    assert.ok(getCommunityHeat(state, 61 + age) >= 96);
  }

  const clean = structuredClone(state);
  clean.operations.records[0].outcome = "clean";
  clean.operations.records[0].resolvedDay = 61;
  assert.equal(
    getDailyCommunityPosts(clean, 61).filter((post) => post.type === "business-scandal").length,
    0,
  );
});

test("business scandal priority is stable for historical boards", () => {
  const state = makeState(84_001);
  state.day = 70;
  addBusinessRecord(state, {
    type: "pack-odds",
    startedDay: 45,
    endsDay: 89,
    cost: 0.1,
    outcome: "detected",
    risk: 0.3,
    appliedDay: 60,
    resolvedDay: 61,
  });
  const part = THEME_BY_ID[state.activeThemeIds[0]].parts[0];
  state.community.push({
    id: "colliding-restriction",
    day: 60,
    category: "restriction",
    type: "restriction-applied",
    themeId: state.activeThemeIds[0],
    partId: part.id,
    value: 2,
    previousValue: 3,
    body: "동시 금제",
  });

  const original = structuredClone(state);
  const board = getDailyCommunityPosts(state, 61);
  assert.equal(board.filter((post) => post.type === "business-scandal").length, 18);
  assert.deepEqual(state, original);

  const later = structuredClone(state);
  later.day = 100;
  later.purchaseTrust = 1;
  later.themes[later.activeThemeIds[0]].share = 0.1;
  assert.deepEqual(getDailyCommunityPosts(later, 61), board);
});

test("pack scandal and stored restriction overlap is capped at twenty posts", () => {
  const state = reduceGame(createInitialGame(84_101), {
    type: "ADVANCE_DAYS",
    days: 2,
  });
  const storedRestrictionCount = state.community.filter(
    (event) =>
      event.day === FIRST_RESTRICTION_REACTION_DAY &&
      event.type === "restriction-demand",
  ).length;
  assert.ok(storedRestrictionCount >= 4);
  addBusinessRecord(state, {
    type: "pack-odds",
    startedDay: 1,
    endsDay: FIRST_BAN_DAY,
    cost: 0.1,
    outcome: "detected",
    risk: 0.3,
    appliedDay: FIRST_BAN_DAY,
    resolvedDay: FIRST_RESTRICTION_REACTION_DAY,
  });

  const board = getDailyCommunityPosts(state, FIRST_RESTRICTION_REACTION_DAY);
  assert.equal(board.length, 20);
  assert.equal(new Set(board.map((post) => post.id)).size, 20);
  assert.equal(
    board.filter((post) => post.type === "business-scandal").length,
    18,
  );
  assert.ok(
    board.slice(0, 18).every((post) => post.type === "business-scandal"),
  );
});

test("no-change stale prompts never overwrite the business reaction prefix", () => {
  const state = staleRestrictionState(true, 84_002);
  addBusinessRecord(state, {
    type: "tv-cm",
    startedDay: REGULAR_RESTRICTION_DAY,
    endsDay: REGULAR_RESTRICTION_DAY + 21,
    cost: 0.6,
    outcome: "completed",
  });

  const board = getDailyCommunityPosts(
    state,
    REGULAR_RESTRICTION_REACTION_DAY,
  );
  const business = board.filter((post) => post.type === "business-reaction");
  assert.equal(board.length, 20);
  assert.equal(business.length, 8);
  assert.ok(board.slice(0, 8).every((post) => post.type === "business-reaction"));
  assert.ok(
    board.slice(8).some((post) =>
      post.id.startsWith(
        `daily-restriction-${REGULAR_RESTRICTION_DAY}-stale-`,
      ),
    ),
  );
});

const VENTURE_FIXTURE = {
  "season-overhaul": { cost: 3.5, duration: 90 },
  "global-launch": { cost: 2.5, duration: 75 },
  "organized-play-platform": { cost: 2.2, duration: 75 },
} as const satisfies Record<
  VentureActionType,
  { cost: number; duration: number }
>;

function addVentureRecord(
  state: GameState,
  action: VentureActionType,
  outcome: "active" | "pending" | "success" | "backlash",
  primaryRisk: VentureRiskFactor,
  primaryStrength: VentureRiskFactor,
  resolvedDay?: number,
): void {
  const fixture = VENTURE_FIXTURE[action];
  addBusinessRecord(state, {
    type: action,
    startedDay: 200,
    endsDay: 200 + fixture.duration,
    cost: fixture.cost,
    outcome,
    risk: 0.42,
    riskContext: {
      environmentHealth: 68,
      purchaseTrust: 72,
      releaseQuality: 64,
      policyQuality: "balanced",
      timing: "middle",
      primaryRisk,
      primaryStrength,
    },
    ...(resolvedDay === undefined ? {} : { resolvedDay }),
  });
}

test("strategic investment copy pools cover every action, stage, and stored factor", () => {
  const peakQuota = {
    waiting: 8,
    success: 16,
    backlash: 20,
  } as const;
  const minimumCore = {
    waiting: 4,
    success: 12,
    backlash: 16,
  } as const;

  for (const action of VENTURE_ACTION_TYPES) {
    for (const stageName of ["waiting", "success", "backlash"] as const) {
      const stage = VENTURE_BUSINESS_COPY[action][stageName];
      assert.ok(stage.core.length >= minimumCore[stageName]);
      for (const factor of VENTURE_RISK_FACTORS) {
        const factorCopy = stage.byFactor[factor];
        const merged = [...stage.core, ...factorCopy];
        assert.ok(factorCopy.length >= 4, `${action}/${stageName}/${factor}`);
        assert.ok(merged.length >= peakQuota[stageName]);
        assert.equal(
          new Set(merged).size,
          merged.length,
          `duplicate ${action}/${stageName}/${factor}`,
        );
      }
    }
  }
});

test("strategic investments use eight-five-three waiting reactions for active and pending records", () => {
  for (const action of VENTURE_ACTION_TYPES) {
    for (const outcome of ["active", "pending"] as const) {
      for (const factor of VENTURE_RISK_FACTORS) {
        const state = makeState(90_000 + VENTURE_ACTION_TYPES.indexOf(action));
        state.day = 300;
        addVentureRecord(state, action, outcome, factor, "execution");
        const stage = VENTURE_BUSINESS_COPY[action].waiting;
        const allowed = new Set<string>([...stage.core, ...stage.byFactor[factor]]);

        for (let age = 0; age < 3; age += 1) {
          const contextual = getDailyCommunityPosts(state, 201 + age).filter(
            (post) => post.id.startsWith("daily-business-business-action-1-"),
          );
          const expected = [8, 5, 3][age];
          assert.equal(
            contextual.length,
            expected,
            `${action}/${outcome}/${factor}/D+${age}`,
          );
          assert.equal(new Set(contextual.map((post) => post.body)).size, expected);
          assert.ok(contextual.every((post) => allowed.has(post.body)));
          assert.ok(contextual.every((post) => post.type === "business-reaction"));
          assert.ok(
            contextual.every((post) =>
              post.category ===
                (action === "season-overhaul" ||
                action === "organized-play-platform"
                  ? "meta"
                  : "finance")
            ),
          );
        }
      }
    }
  }
});

test("strategic investment results select the stored strength or failure cause and fill their decay quotas", () => {
  for (const action of VENTURE_ACTION_TYPES) {
    for (const outcome of ["success", "backlash"] as const) {
      const quotas = outcome === "success" ? [16, 12, 8, 5] : [20, 16, 12, 8];
      const stage = VENTURE_BUSINESS_COPY[action][outcome];
      for (const factor of VENTURE_RISK_FACTORS) {
        const state = makeState(
          91_000 +
            VENTURE_ACTION_TYPES.indexOf(action) * 20 +
            VENTURE_RISK_FACTORS.indexOf(factor),
        );
        state.day = 300;
        addVentureRecord(
          state,
          action,
          outcome,
          outcome === "backlash" ? factor : "execution",
          outcome === "success" ? factor : "execution",
          230,
        );
        const allowed = new Set<string>([...stage.core, ...stage.byFactor[factor]]);

        for (let age = 0; age < quotas.length; age += 1) {
          const contextual = getDailyCommunityPosts(state, 230 + age).filter(
            (post) => post.id.startsWith("daily-business-business-action-1-"),
          );
          assert.equal(
            contextual.length,
            quotas[age],
            `${action}/${outcome}/${factor}/D+${age}`,
          );
          assert.equal(
            new Set(contextual.map((post) => post.body)).size,
            quotas[age],
          );
          assert.ok(contextual.every((post) => allowed.has(post.body)));
          assert.ok(
            contextual.every((post) =>
              post.type ===
                (outcome === "backlash" ? "business-scandal" : "business-reaction")
            ),
          );
          assert.ok(
            contextual.every((post) =>
              post.category ===
                (action === "season-overhaul" ||
                action === "organized-play-platform"
                  ? "meta"
                  : "finance")
            ),
          );
        }

        const peakBodies = new Set(
          getDailyCommunityPosts(state, 230)
            .filter((post) => post.id.startsWith("daily-business-business-action-1-"))
            .map((post) => post.body),
        );
        assert.ok(
          stage.byFactor[factor].every((body) => peakBodies.has(body)),
          `missing cause copy ${action}/${outcome}/${factor}`,
        );
        assert.ok(getCommunityHeat(state, 230) >= (outcome === "backlash" ? 100 : 92));
      }
    }
  }
});

test("resolved strategic records retain their original waiting explanation on historical days", () => {
  const state = makeState(92_001);
  state.day = 300;
  addVentureRecord(
    state,
    "season-overhaul",
    "success",
    "trust",
    "release",
    230,
  );

  const waiting = getDailyCommunityPosts(state, 201).filter((post) =>
    post.id.startsWith("daily-business-business-action-1-"),
  );
  const waitingPool = VENTURE_BUSINESS_COPY["season-overhaul"].waiting;
  const allowedWaiting = new Set<string>([
    ...waitingPool.core,
    ...waitingPool.byFactor.trust,
  ]);
  assert.equal(waiting.length, 8);
  assert.ok(waiting.every((post) => allowedWaiting.has(post.body)));
  assert.ok(
    waitingPool.byFactor.trust.every((body) =>
      waiting.some((post) => post.body === body)
    ),
  );

  const result = getDailyCommunityPosts(state, 230).filter((post) =>
    post.id.startsWith("daily-business-business-action-1-"),
  );
  const resultPool = VENTURE_BUSINESS_COPY["season-overhaul"].success;
  const allowedResult = new Set<string>([
    ...resultPool.core,
    ...resultPool.byFactor.release,
  ]);
  assert.equal(result.length, 16);
  assert.ok(result.every((post) => allowedResult.has(post.body)));
  assert.ok(
    resultPool.byFactor.release.every((body) =>
      result.some((post) => post.body === body)
    ),
  );
});
