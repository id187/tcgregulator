import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_ACTION_FAMILY_SATURATION_FLOOR,
  BUSINESS_ACTION_FAMILY_SATURATION_WINDOW_DAYS,
  BUSINESS_ACTION_PORTFOLIO_SATURATION_WINDOW_DAYS,
  PROBABILISTIC_BUSINESS_ACTION_TYPES,
  RISKY_CHALLENGE_ACTION_TYPES,
  getBusinessActionDailyGrossRevenue,
  getBusinessActionProjectedDirectGrossRevenue,
  getBusinessActionSaturationMultiplier,
  getBusinessActionSuccessProbability,
  getProbabilisticBusinessActionOutcome,
  getProbabilisticBusinessActionSuccessProfile,
  getStrategicSuccessBenefits,
} from "../app/game/business-actions.ts";
import { getBusinessUserRateModifiers } from "../app/game/business-runtime.ts";
import {
  createCampaignStart,
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

function submitFirstRestriction(state: GameState): GameState {
  assert.equal(state.day, 15);
  assert.equal(state.phase, "ban-edit");
  return reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
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
      "reprint-campaign",
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
    "reprint-campaign",
    "collector-fair",
  ]);
  assert.deepEqual(RISKY_CHALLENGE_ACTION_TYPES, [
    "championship",
    "season-overhaul",
    "global-launch",
    "first-print-expansion",
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
    let state = createCampaignStart(21_097);
    state.finance.cash = 100;
    if (withPriorMedia) {
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: "tv-cm",
      });
    }
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
    state = submitFirstRestriction(state);
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: getPrologueReleaseSelections(state),
    });
    return reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
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
  let state = createCampaignStart(21_098);
  state.finance.cash = 100;
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  state = submitFirstRestriction(state);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(state.day, 22);
  const launched = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.equal(launched.operations.records[0].outcome, "active");
  assert.ok(launched.operations.records[0].risk !== undefined);

  const jumped = reduceGame(launched, { type: "ADVANCE_DAYS", days: 7 });
  let stepped = launched;
  for (let day = 0; day < 7; day += 1) {
    stepped = reduceGame(stepped, { type: "ADVANCE_DAYS", days: 1 });
  }
  assert.deepEqual(jumped, stepped);
  assert.ok(
    jumped.operations.records[0].outcome === "success" ||
      jumped.operations.records[0].outcome === "backlash",
  );
  assert.equal(jumped.operations.records[0].resolvedDay, 23);
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
