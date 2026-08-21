import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_ACTION_BY_TYPE,
  BUSINESS_ACTIONS,
  BUSINESS_ACTION_FAMILY_SATURATION_FLOOR,
  BUSINESS_ACTION_FAMILY_SATURATION_WINDOW_DAYS,
  BUSINESS_ACTION_PORTFOLIO_SATURATION_WINDOW_DAYS,
  PROBABILISTIC_BUSINESS_ACTION_TYPES,
  RISKY_CHALLENGE_ACTION_TYPES,
  getBusinessActionAvailability,
  getBusinessActionDailyGrossRevenue,
  getBusinessActionProjectedDirectGrossRevenue,
  getBusinessActionScheduledEndDay,
  getBusinessActionSaturationMultiplier,
  getBusinessActionSuccessProbability,
  getCompetitiveSeasonHistory,
  getProbabilisticBusinessActionOutcome,
  getProbabilisticBusinessActionSuccessProfile,
  getStrategicSuccessBenefits,
} from "../app/game/business-actions.ts";
import {
  applyCompetitiveSeasonBoundary,
  getBusinessTrustRecovery,
  getBusinessUserRateModifiers,
  getCurrentCompetitiveSeason,
  updateBusinessLifecycle,
} from "../app/game/business-runtime.ts";
import {
  createCampaignStart,
  createInitialGame,
  getPrologueReleaseSelections,
  reduceGame,
} from "../app/game/engine.ts";
import type { BusinessActionRecord, GameState } from "../app/game/types.ts";

type ActionState = Pick<GameState, "day" | "operations" | "users">;

const users = { tier: 3_500, casual: 4_500, collector: 2_000 } as const;

function makeState(
  records: BusinessActionRecord[] = [],
  day = 200,
): ActionState {
  return {
    day,
    users: { ...users },
    operations: { records } as GameState["operations"],
  };
}

function completedAction(
  id: number,
  type: BusinessActionRecord["type"],
  startedDay: number,
  duration: number,
  cost: number,
): BusinessActionRecord {
  return {
    id: `business-action-${id}`,
    type,
    startedDay,
    endsDay: startedDay + duration,
    cost,
    outcome: "completed",
  };
}

function historyRow(
  state: GameState,
  day: number,
): GameState["history"][number] {
  return {
    day,
    totalUsers: state.users.tier + state.users.casual + state.users.collector,
    revenue: day / 100,
    topThemeId: state.currentTopThemeId,
    shares: Object.fromEntries(
      state.activeThemeIds.map((themeId) => [
        themeId,
        state.themes[themeId].share,
      ]),
    ),
  };
}

test("low-risk action families saturate for a quarter and recover after it", () => {
  const recentCommunity = makeState([
    completedAction(1, "store-tour", 130, 14, 0.35),
    completedAction(2, "beginner-camp", 150, 14, 0.4),
    completedAction(3, "local-league", 170, 21, 0.5),
  ]);

  assert.equal(BUSINESS_ACTION_FAMILY_SATURATION_WINDOW_DAYS, 90);
  assert.equal(BUSINESS_ACTION_PORTFOLIO_SATURATION_WINDOW_DAYS, 60);
  assert.equal(
    getBusinessActionSaturationMultiplier(
      recentCommunity,
      "beginner-camp",
      200,
    ),
    0.4147,
  );
  assert.equal(
    getBusinessActionSaturationMultiplier(
      recentCommunity,
      "collector-fair",
      200,
    ),
    0.81,
  );
  assert.equal(
    getBusinessActionSaturationMultiplier(
      recentCommunity,
      "championship",
      200,
    ),
    1,
  );

  recentCommunity.operations.records.push(
    completedAction(4, "store-tour", 180, 14, 0.35),
  );
  assert.equal(
    getBusinessActionSaturationMultiplier(
      recentCommunity,
      "beginner-camp",
      200,
    ),
    BUSINESS_ACTION_FAMILY_SATURATION_FLOOR,
  );

  const recovered = makeState([
    completedAction(1, "store-tour", 109, 14, 0.35),
  ]);
  assert.equal(
    getBusinessActionSaturationMultiplier(recovered, "beginner-camp", 200),
    1,
  );
});

test("rotating low-risk families still consumes shared campaign bandwidth", () => {
  const rotatedPortfolio = makeState([
    completedAction(1, "store-tour", 141, 14, 0.35),
    completedAction(2, "collector-fair", 160, 14, 0.65),
    completedAction(3, "tv-cm", 179, 21, 0.6),
  ]);

  assert.equal(
    getBusinessActionSaturationMultiplier(
      rotatedPortfolio,
      "local-league",
      200,
    ),
    0.5832,
  );
  assert.equal(
    getBusinessActionSaturationMultiplier(
      rotatedPortfolio,
      "lending-exchange-network",
      200,
    ),
    0.5832,
  );
  assert.equal(
    getBusinessActionSaturationMultiplier(
      rotatedPortfolio,
      "animation-promotion",
      200,
    ),
    0.5832,
  );
});

test("family saturation reduces the projected marginal revenue of follow-up actions", () => {
  const fresh = makeState();
  const onePrior = makeState([
    completedAction(1, "store-tour", 150, 14, 0.35),
  ]);
  const freshProjection = getBusinessActionProjectedDirectGrossRevenue(
    fresh,
    "beginner-camp",
  );
  const repeatedProjection = getBusinessActionProjectedDirectGrossRevenue(
    onePrior,
    "beginner-camp",
  );

  assert.ok(freshProjection > repeatedProjection);
  assert.ok(
    Math.abs(repeatedProjection / freshProjection - 0.72) < 1e-3,
  );
});

test("ordinary actions expose bounded state-based chances while challenges do not", () => {
  const state = createCampaignStart(21_096);
  state.day = 200;
  state.finance.cash = 100;

  assert.deepEqual(PROBABILISTIC_BUSINESS_ACTION_TYPES, [
    "tv-cm",
    "animation-promotion",
    "store-tour",
    "beginner-camp",
    "local-league",
    "lending-exchange-network",
    "collector-fair",
  ]);
  assert.deepEqual(RISKY_CHALLENGE_ACTION_TYPES, [
    "championship",
    "season-overhaul",
    "global-launch",
    "organized-play-platform",
  ]);
  for (const type of PROBABILISTIC_BUSINESS_ACTION_TYPES) {
    const probability = getBusinessActionSuccessProbability(state, type);
    assert.ok(probability !== null && probability >= 0.18 && probability <= 0.92);
  }
  assert.equal(getBusinessActionSuccessProbability(state, "championship"), null);
  assert.equal(getBusinessActionSuccessProbability(state, "pack-odds"), null);

  const strong = structuredClone(state);
  strong.purchaseTrust = 95;
  for (const themeId of strong.activeThemeIds) {
    strong.themes[themeId].fatigue = 0;
    strong.themes[themeId].unpleasantness = 0;
  }
  const weak = structuredClone(state);
  weak.purchaseTrust = 20;
  const [leader, ...others] = weak.activeThemeIds;
  weak.themes[leader].share = 0.7;
  for (const themeId of others) weak.themes[themeId].share = 0.075;
  for (const themeId of weak.activeThemeIds) {
    weak.themes[themeId].fatigue = 100;
    weak.themes[themeId].unpleasantness = 100;
  }
  assert.ok(
    getProbabilisticBusinessActionSuccessProfile(strong, "tv-cm")
      .successProbability >
      getProbabilisticBusinessActionSuccessProfile(weak, "tv-cm")
        .successProbability + 0.2,
  );

  const fresh = getProbabilisticBusinessActionSuccessProfile(state, "tv-cm");
  state.operations.records.push(
    completedAction(1, "animation-promotion", 180, 75, 3),
  );
  const saturated = getProbabilisticBusinessActionSuccessProfile(
    state,
    "tv-cm",
  );
  assert.ok(saturated.successProbability < fresh.successProbability);
  assert.ok(saturated.saturationMultiplier < fresh.saturationMultiplier);

  const fixture = {
    id: "business-action-99",
    type: "tv-cm" as const,
    startedDay: 200,
    risk: 0.5,
  };
  assert.equal(
    getProbabilisticBusinessActionOutcome(fixture),
    getProbabilisticBusinessActionOutcome(fixture),
  );
  assert.ok(
    getBusinessActionDailyGrossRevenue(state, "store-tour", "success") > 0,
  );
  assert.ok(
    getBusinessActionDailyGrossRevenue(state, "store-tour", "backlash") < 0,
  );
});

test("the engine applies family saturation to audience acquisition", () => {
  const prepare = (withPriorMedia: boolean): GameState => {
    let state = createInitialGame(21_097);
    state.finance.cash = 100;
    if (withPriorMedia) {
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: "tv-cm",
      });
    }
    while (state.day < 10) {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
    }
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: getPrologueReleaseSelections(state),
    });
    while (state.day < 29) {
      if (state.operations.pendingEvent) {
        state = reduceGame(state, {
          type: "CHOOSE_BUSINESS_EVENT",
          eventId: state.operations.pendingEvent.id,
          choice: "a",
        });
        continue;
      }
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
    }
    return state;
  };

  const fresh = prepare(false);
  const saturated = prepare(true);
  const freshActive = reduceGame(fresh, {
    type: "RUN_BUSINESS_ACTION",
    action: "animation-promotion",
  });
  const saturatedActive = reduceGame(saturated, {
    type: "RUN_BUSINESS_ACTION",
    action: "animation-promotion",
  });
  freshActive.operations.records.at(-1)!.outcome = "success";
  saturatedActive.operations.records.at(-1)!.outcome = "success";
  freshActive.day += 1;
  saturatedActive.day += 1;
  const freshLift = getBusinessUserRateModifiers(freshActive).casual;
  const saturatedLift = getBusinessUserRateModifiers(saturatedActive).casual;

  assert.ok(Math.abs(saturatedLift / freshLift - 0.72) < 0.01);
});

test("ordinary D+1 outcomes are deterministic and chunk-independent", () => {
  const state = createInitialGame(21_098);
  state.finance.cash = 100;
  const launched = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.equal(launched.operations.records[0].outcome, "active");
  assert.ok(launched.operations.records[0].risk !== undefined);

  const jumped = reduceGame(launched, { type: "ADVANCE_DAYS", days: 2 });
  let stepped = launched;
  for (let day = 0; day < 2; day += 1) {
    stepped = reduceGame(stepped, { type: "ADVANCE_DAYS", days: 1 });
  }
  assert.deepEqual(jumped, stepped);
  assert.ok(
    jumped.operations.records[0].outcome === "success" ||
      jumped.operations.records[0].outcome === "backlash",
  );
  assert.equal(jumped.operations.records[0].resolvedDay, 8);
});

test("successful strategic infrastructure has distinct benefits through the end of the mandate", () => {
  const successRecord: BusinessActionRecord = {
    id: "business-action-1",
    type: "season-overhaul",
    startedDay: 120,
    endsDay: 210,
    cost: 3.5,
    outcome: "success",
    resolvedDay: 150,
    cashReturn: 6.5,
  };
  const state = makeState([successRecord], 150);
  const atResolution = getStrategicSuccessBenefits(state);
  assert.ok(atResolution.dailyGrossRevenue > 0);
  assert.ok(atResolution.userRates.tier > 0);
  assert.ok(atResolution.buyerRate > 0);

  state.day = 450;
  assert.deepEqual(getStrategicSuccessBenefits(state), atResolution);

  state.day = 149;
  assert.equal(getStrategicSuccessBenefits(state).dailyGrossRevenue, 0);
  successRecord.outcome = "backlash";
  state.day = 450;
  assert.deepEqual(getStrategicSuccessBenefits(state), {
    userRates: { tier: 0, casual: 0, collector: 0 },
    buyerRate: 0,
    trustPerDay: 0,
    dailyGrossRevenue: 0,
  });
});

test("the tournament platform is a distinct long-term infrastructure project", () => {
  const handover = createCampaignStart(21_098);
  handover.phase = "running";
  assert.equal(
    getBusinessActionAvailability(handover, "tv-cm").available,
    false,
  );
  assert.match(
    getBusinessActionAvailability(handover, "tv-cm").reason ?? "",
    /DAY 7|인수인계/,
  );

  assert.ok(
    BUSINESS_ACTIONS.some((action) =>
      action.type === "organized-play-platform"
    ),
  );
  assert.deepEqual(
    {
      title: BUSINESS_ACTION_BY_TYPE["organized-play-platform"].title,
      duration: BUSINESS_ACTION_BY_TYPE["organized-play-platform"].duration,
      minimumDay:
        BUSINESS_ACTION_BY_TYPE["organized-play-platform"].minimumDay,
      resolutionDelay:
        BUSINESS_ACTION_BY_TYPE["organized-play-platform"].resolutionDelay,
    },
    {
      title: "통합 대회 플랫폼 구축",
      duration: 75,
      minimumDay: 90,
      resolutionDelay: 21,
    },
  );
  const state = createCampaignStart(21_099);
  state.day = 90;
  state.phase = "running";
  state.handoverComplete = true;
  state.finance.cash = 100;
  assert.equal(
    getBusinessActionAvailability(state, "organized-play-platform").available,
    true,
  );
  assert.equal(
    getBusinessActionScheduledEndDay(30, "pack-odds"),
    99,
    "DAY 50 is a dedicated reprint pack, so pack odds targets DAY 70",
  );
});

test("the lending and exchange network improves access without printing cards", () => {
  assert.equal(
    BUSINESS_ACTION_BY_TYPE["lending-exchange-network"].title,
    "매장 덱 대여·교환망",
  );
  assert.equal(
    BUSINESS_ACTION_BY_TYPE["lending-exchange-network"].saturationFamily,
    "community",
  );
  assert.doesNotMatch(
    `${BUSINESS_ACTION_BY_TYPE["lending-exchange-network"].summary} ${
      BUSINESS_ACTION_BY_TYPE["lending-exchange-network"].effect
    }`,
    /재판|재록|인쇄|생산/,
  );

  const state = createCampaignStart(21_102);
  state.day = 8;
  state.operations.records = [
    {
      id: "business-action-1",
      type: "lending-exchange-network",
      startedDay: 7,
      endsDay: 37,
      cost: 0.55,
      outcome: "success",
      risk: 0.2,
      resolvedDay: 8,
    },
  ];
  const rates = getBusinessUserRateModifiers(state);
  assert.ok(rates.casual > rates.collector);
  assert.ok(rates.tier > rates.collector);
  assert.ok(getBusinessTrustRecovery(state) > 0);
  assert.ok(
    getBusinessActionDailyGrossRevenue(state, "lending-exchange-network") > 0,
  );
});

test("a successful season overhaul creates a competitive boundary without erasing operating history", () => {
  const state = createCampaignStart(21_100);
  state.day = 150;
  state.phase = "running";
  state.history = [
    historyRow(state, 140),
    historyRow(state, 149),
    historyRow(state, 150),
  ];
  const originalHistory = structuredClone(state.history);
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.previousWeekShare = Math.max(0, runtime.share - 0.02);
    runtime.fatigue = 70;
    runtime.topStreakDays = 44;
  }

  assert.deepEqual(getCurrentCompetitiveSeason(state), {
    currentSeasonNumber: 1,
    startedDay: 0,
    boundaries: [],
  });
  applyCompetitiveSeasonBoundary(state, "business-action-1");

  assert.deepEqual(state.operations.season, {
    currentSeasonNumber: 2,
    startedDay: 150,
    boundaries: [
      {
        seasonNumber: 2,
        startedDay: 150,
        sourceActionId: "business-action-1",
      },
    ],
  });
  assert.deepEqual(state.history, originalHistory);
  assert.deepEqual(
    getCompetitiveSeasonHistory(state).map((entry) => entry.day),
    [150],
  );
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    assert.equal(runtime.previousWeekShare, runtime.share);
    assert.equal(runtime.fatigue, 0);
    assert.equal(runtime.topStreakDays, 0);
  }

  applyCompetitiveSeasonBoundary(state, "business-action-1");
  assert.equal(state.operations.season.boundaries.length, 1);
  assert.equal(state.operations.season.currentSeasonNumber, 2);
});

test("season-overhaul success resolves the boundary through the business lifecycle", () => {
  const state = createCampaignStart(21_101);
  state.day = 150;
  state.phase = "running";
  state.finance.cash = 10;
  state.history = [historyRow(state, 149)];
  const originalHistory = structuredClone(state.history);
  state.operations.nextActionId = 2;
  state.operations.records = [
    {
      id: "business-action-1",
      type: "season-overhaul",
      startedDay: 120,
      endsDay: 210,
      cost: 3.5,
      outcome: "active",
      risk: 0,
      challenge: {
        metric: "environment-health",
        threshold: 64,
        requiredQualifyingDays: 20,
        qualifyingDays: 19,
        observedDays: 29,
        deadlineDay: 150,
        lastEvaluatedDay: 149,
        lastValue: 100,
      },
    },
  ];

  updateBusinessLifecycle(state);

  const record = state.operations.records[0];
  assert.equal(record.outcome, "success");
  assert.equal(record.resolvedDay, 150);
  assert.equal(record.cashReturn, 6.5);
  assert.equal(state.finance.cash, 16.5);
  assert.equal(state.operations.season?.currentSeasonNumber, 2);
  assert.deepEqual(state.history, originalHistory);
});
