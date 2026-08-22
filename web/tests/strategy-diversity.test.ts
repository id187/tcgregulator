import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import {
  getBusinessActionAvailability,
  getBusinessActionProjectedDirectCash,
  getBusinessEnvironmentHealth,
  isStrategicBusinessAction,
} from "../app/game/business-actions.ts";
import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventOutcome,
  getBusinessEventResult,
} from "../app/game/business-events.ts";
import { CAMPAIGN_END_DAY } from "../app/game/campaign.ts";
import {
  CAMPAIGN_CASH_RESERVE_MIN,
  CAMPAIGN_CASH_TIGHT_MIN,
  evaluateCampaignEnding,
} from "../app/game/campaign-ending.ts";
import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import type {
  BusinessActionType,
  GameState,
  PowerAdjustment,
} from "../app/game/types.ts";

const SAFE_ROTATION = [
  "store-tour",
  "collector-fair",
  "tv-cm",
  "beginner-camp",
  "lending-exchange-network",
  "local-league",
] as const satisfies readonly BusinessActionType[];

type StrategyResult = {
  cash: number;
  trust: number;
  users: number;
  strategicOutcome: "success" | "backlash" | null;
};

type FullCampaignResult = StrategyResult & {
  seed: number;
  actions: number;
  safeActionCost: number;
  cumulativeRevenue: number;
  cumulativeOperatingCosts: number;
  environmentHealth: number;
  userRatio: number;
  endingTitle: string;
};

const BUSINESS_SANDBOX_CACHE = new Map<number, GameState>();

function getPlannedReleaseSelections(state: GameState) {
  if (state.releaseSlate?.releaseKind === "reprint") {
    return getAutomaticReleaseSelections(state);
  }
  const options = state.releaseSlate?.options;
  assert.ok(options, "release-edit must expose a release slate");
  const prioritized = <K extends (typeof options)[number]["kind"]>(
    kind: K,
    count: number,
  ) =>
    options
      .filter((option) => option.kind === kind)
      .sort((left, right) => Number(right.requested) - Number(left.requested))
      .slice(0, count);
  const selected = [
    ...prioritized("new-theme", 2),
    ...prioritized("support", 1),
    ...prioritized("generic", 1),
  ];
  assert.equal(selected.length, 4);
  return selected.map((option) => ({
    optionId: option.id,
    powerAdjustment: 0 as PowerAdjustment,
  }));
}

function prepareBusinessSandbox(seed: number): GameState {
  const cached = BUSINESS_SANDBOX_CACHE.get(seed);
  if (cached) return structuredClone(cached);

  let state = createInitialGame(seed);
  for (let guard = 0; state.day < 120 || state.phase !== "running"; guard += 1) {
    assert.ok(guard < 500, "business sandbox setup exceeded its progress guard");
    if (state.operations.pendingEvent) {
      state = chooseBestKnownBusinessEvent(state);
      continue;
    }
    state = resolveMandatoryDesk(state);
    assert.notEqual(state.phase, "ended", "business sandbox ended before DAY 120");
    if (state.day === 120 && state.phase === "running") break;
    state = reduceGame(state, {
      type: "ADVANCE_DAYS",
      days: 120 - state.day,
    });
  }
  assert.equal(state.day, 120);
  assert.equal(state.phase, "running");
  state.finance.cash = 20;
  BUSINESS_SANDBOX_CACHE.set(seed, structuredClone(state));
  return state;
}

function resolveMandatoryDesk(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 5; guard += 1) {
    if (next.phase === "release-edit") {
      assert.ok(next.releaseSlate);
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: getPlannedReleaseSelections(next),
      });
      continue;
    }
    if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
      continue;
    }
    return next;
  }
  throw new Error("business sandbox could not clear a mandatory desk");
}

function chooseBestKnownBusinessEvent(state: GameState): GameState {
  const pending = state.operations.pendingEvent;
  assert.ok(pending, "expected a pending business event");
  const definition = BUSINESS_EVENT_BY_TYPE[pending.type];
  const selected = definition.choices
    .filter((choice) => choice.cost <= state.finance.cash + 1e-9)
    .map((choice) => {
      const outcome = getBusinessEventOutcome(
        state.seed,
        pending.id,
        choice.risk,
      );
      const result = getBusinessEventResult(
        pending.type,
        choice.id,
        outcome,
      );
      const userValue = Object.values(result.userMultipliers).reduce(
        (sum, multiplier) => sum + multiplier,
        0,
      );
      return {
        choice: choice.id,
        score:
          result.trustDelta * 2 +
          userValue * 50 +
          (result.cashDelta - choice.cost) * 2 +
          result.revenueBonus * result.revenueDuration,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.choice.localeCompare(right.choice),
    )[0];
  assert.ok(selected, "expected an affordable business-event choice");
  return reduceGame(state, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.id,
    choice: selected.choice,
  });
}

function runCashMaxLowRiskCampaign(seed: number): FullCampaignResult {
  let state = createInitialGame(seed);

  for (let guard = 0; state.phase !== "ended"; guard += 1) {
    assert.ok(guard < 5_000, "full campaign route exceeded its progress guard");

    if (state.operations.pendingEvent) {
      state = chooseBestKnownBusinessEvent(state);
      continue;
    }
    state = resolveMandatoryDesk(state);
    if (state.phase === "ended") break;
    assert.equal(state.phase, "running");

    const selected = SAFE_ROTATION
      .filter(
        (action) => getBusinessActionAvailability(state, action).available,
      )
      .map((action) => ({
        action,
        projectedCash: getBusinessActionProjectedDirectCash(state, action),
      }))
      .filter(({ projectedCash }) => projectedCash > 0)
      .sort(
        (left, right) =>
          right.projectedCash - left.projectedCash ||
          left.action.localeCompare(right.action),
      )[0];
    if (selected) {
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: selected.action,
      });
    }

    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  }

  assert.equal(state.day, CAMPAIGN_END_DAY);
  const strategic = state.operations.records.find((record) =>
    isStrategicBusinessAction(record.type)
  );
  const safeRecords = state.operations.records.filter(
    (record) => !isStrategicBusinessAction(record.type),
  );
  const ending = evaluateCampaignEnding(state);
  return {
    seed,
    cash: state.finance.cash,
    trust: state.purchaseTrust,
    users: state.users.tier + state.users.casual + state.users.collector,
    actions: state.operations.records.length,
    safeActionCost: safeRecords.reduce((sum, record) => sum + record.cost, 0),
    cumulativeRevenue: state.finance.cumulative,
    cumulativeOperatingCosts: state.finance.cumulativeOperatingCosts,
    environmentHealth: ending.scores.environmentHealth,
    userRatio: ending.scores.userRatio,
    endingTitle: ending.title,
    strategicOutcome:
      strategic?.outcome === "success" || strategic?.outcome === "backlash"
        ? strategic.outcome
        : null,
  };
}

function stabilizeSeasonLaunch(state: GameState): void {
  const equalShare = 1 / state.activeThemeIds.length;
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    runtime.share = equalShare;
    runtime.previousWeekShare = equalShare;
    runtime.fatigue = 0;
    runtime.unpleasantness = 0;
    runtime.topStreakDays = 0;
  }
  state.currentTopThemeId = state.activeThemeIds[0];
}

function runStrategy(
  seed: number,
  kind: "safe" | "strategic",
  stabilizeStrategic = false,
): StrategyResult {
  let state = prepareBusinessSandbox(seed);
  let nextSafeActionDay = 120;
  let safeCursor = 0;

  while (state.day < 239) {
    if (state.operations.pendingEvent) {
      state = chooseBestKnownBusinessEvent(state);
      continue;
    }
    state = resolveMandatoryDesk(state);
    assert.equal(state.phase, "running");

    if (kind === "strategic" && state.day === 120) {
      if (stabilizeStrategic) {
        stabilizeSeasonLaunch(state);
        assert.ok(getBusinessEnvironmentHealth(state) >= 64);
      }
      assert.equal(
        getBusinessActionAvailability(state, "season-overhaul").available,
        true,
      );
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: "season-overhaul",
      });
    } else if (kind === "safe" && state.day >= nextSafeActionDay) {
      for (let attempt = 0; attempt < SAFE_ROTATION.length; attempt += 1) {
        const action = SAFE_ROTATION[safeCursor % SAFE_ROTATION.length];
        safeCursor += 1;
        if (!getBusinessActionAvailability(state, action).available) continue;
        state = reduceGame(state, { type: "RUN_BUSINESS_ACTION", action });
        nextSafeActionDay = state.day + 15;
        break;
      }
    }

    if (
      kind === "strategic" &&
      stabilizeStrategic &&
      state.day >= 120 &&
      state.day < 150
    ) {
      stabilizeSeasonLaunch(state);
      assert.ok(getBusinessEnvironmentHealth(state) >= 64);
    }

    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  }

  if (state.operations.pendingEvent) {
    state = chooseBestKnownBusinessEvent(state);
  }
  state = resolveMandatoryDesk(state);
  const strategic = state.operations.records.find((record) =>
    isStrategicBusinessAction(record.type)
  );
  return {
    cash: state.finance.cash,
    trust: state.purchaseTrust,
    users: state.users.tier + state.users.casual + state.users.collector,
    strategicOutcome:
      strategic?.outcome === "success" || strategic?.outcome === "backlash"
        ? strategic.outcome
        : null,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function range(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

test("managed strategic projects preserve a real safety versus upside tradeoff", () => {
  const paired = [1, 2, 3, 20, 34, 50].map((seed, index) => ({
      seed,
      safe: runStrategy(seed, "safe"),
      strategic: runStrategy(seed, "strategic", index < 3),
    }));
  const successes = paired.filter(
    ({ strategic }) => strategic.strategicOutcome === "success",
  );
  const failures = paired.filter(
    ({ strategic }) => strategic.strategicOutcome === "backlash",
  );

  assert.ok(
    successes.length >= 3,
    `the project needs a meaningful upside sample: ${JSON.stringify(paired)}`,
  );
  assert.ok(
    failures.length >= 2,
    `the project risk must produce real downside: ${JSON.stringify(paired)}`,
  );

  const successfulCashAdvantage = average(
    successes.map(({ safe, strategic }) => strategic.cash - safe.cash),
  );
  const failedTrustAdvantage = average(
    failures.map(({ safe, strategic }) => strategic.trust - safe.trust),
  );
  assert.ok(
    successfulCashAdvantage > 0,
    "successful infrastructure should beat low-risk churn on cash",
  );
  assert.ok(
    failedTrustAdvantage < 0,
    "failed infrastructure should leave a worse ownership-trust outcome",
  );

  const safeCash = paired.map(({ safe }) => safe.cash);
  const strategicCash = paired.map(({ strategic }) => strategic.cash);
  assert.ok(
    range(strategicCash) > range(safeCash),
    "the strategic route needs a wider reward and failure distribution",
  );
  assert.ok(
    Math.max(...successes.map(({ strategic }) => strategic.users)) >
      Math.max(...paired.map(({ safe }) => safe.users)),
    "strategic success should unlock a user-growth ceiling safe loops cannot reach",
  );
});

test("cash-maximizing low-risk full campaign remains viable without using the strategic slot", () => {
  const result = runCashMaxLowRiskCampaign(7);

  assert.equal(result.strategicOutcome, null);
  assert.ok(
    result.cash >= CAMPAIGN_CASH_TIGHT_MIN,
    "safe optimization should remain viable rather than collapse the company",
  );
  assert.ok(result.cash >= CAMPAIGN_CASH_RESERVE_MIN);
  assert.ok(result.actions > 1, "the route should use an available low-risk action");
  assert.ok(result.safeActionCost > 0);
  assert.deepEqual(
    {
      cash: result.cash,
      users: result.users,
      trust: result.trust,
      environmentHealth: result.environmentHealth,
      userRatio: result.userRatio,
      endingTitle: result.endingTitle,
      cumulativeRevenue: result.cumulativeRevenue,
    },
    {
      cash: 49.2074,
      users: 75_990.47,
      trust: 97.509,
      environmentHealth: 72.5,
      userRatio: 7.6292,
      endingTitle: "함께 커진 리그",
      cumulativeRevenue: 299.8041,
    },
  );
});
