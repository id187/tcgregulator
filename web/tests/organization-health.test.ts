import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { getBusinessActionAvailability } from "../app/game/business-actions.ts";
import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventOutcome,
  getBusinessEventResult,
} from "../app/game/business-events.ts";
import { CAMPAIGN_END_DAY } from "../app/game/campaign.ts";
import {
  SERVICE_RISK_AUDIENCE,
  SERVICE_RECOVERY_AUDIENCE,
  SERVICE_RECOVERY_CASH,
  getActiveServiceRecoveryChallenge,
  getOrganizationAudienceRate,
  getOrganizationTrajectory,
  getServiceFailureReason,
} from "../app/game/organization-health.ts";
import type { GameState, PowerAdjustment } from "../app/game/types.ts";

function appendDay(
  state: GameState,
  day: number,
  {
    users,
    cash = state.finance.cash,
    operatingCash = state.finance.todayOperatingCash,
  }: { users: number; cash?: number; operatingCash?: number },
): void {
  const previous = state.history.at(-1);
  assert.ok(previous);
  state.day = day;
  state.users = { tier: users, casual: 0, collector: 0 };
  state.finance.cash = cash;
  state.finance.todayOperatingCash = operatingCash;
  state.history.push({
    ...structuredClone(previous),
    day,
    totalUsers: users,
    cash,
    operatingCash,
  });
}

function appendRange(
  state: GameState,
  from: number,
  to: number,
  snapshot: { users: number; cash?: number; operatingCash?: number },
): void {
  for (let day = from; day <= to; day += 1) appendDay(state, day, snapshot);
}

test("five dangerous audience days announce a next-regular-pack recovery challenge", () => {
  const state = createInitialGame(9001);
  appendRange(state, 8, 11, { users: SERVICE_RISK_AUDIENCE - 1 });
  assert.equal(getActiveServiceRecoveryChallenge(state), null);

  appendDay(state, 12, { users: SERVICE_RISK_AUDIENCE - 1 });
  const challenge = getActiveServiceRecoveryChallenge(state);
  assert.ok(challenge);
  assert.equal(challenge.type, "audience-recovery");
  assert.equal(challenge.startedDay, 12);
  assert.equal(challenge.evaluationStartDay, 31);
  assert.match(challenge.objective, new RegExp(`${SERVICE_RECOVERY_AUDIENCE.toLocaleString("ko-KR")}명`));
  assert.equal(getOrganizationTrajectory(state).stage, "critical");
});

test("missing the new-pack recovery threshold ends the mandate immediately", () => {
  const state = createInitialGame(9002);
  appendRange(state, 8, 30, { users: SERVICE_RISK_AUDIENCE - 1 });
  assert.equal(getServiceFailureReason(state), null);

  appendDay(state, 31, { users: SERVICE_RECOVERY_AUDIENCE - 1 });
  assert.equal(getServiceFailureReason(state), "audience-collapse");
  assert.equal(getOrganizationTrajectory(state).stage, "failed");
});

test("holding the target for three post-release days clears emergency management", () => {
  const state = createInitialGame(9003);
  appendRange(state, 8, 30, { users: SERVICE_RISK_AUDIENCE - 1 });
  appendRange(state, 31, 33, { users: SERVICE_RECOVERY_AUDIENCE });

  assert.equal(getActiveServiceRecoveryChallenge(state), null);
  assert.equal(getServiceFailureReason(state), null);
});

test("a failed cash-recovery challenge creates an insolvency game over", () => {
  const state = createInitialGame(9004);
  appendRange(state, 8, 30, {
    users: 8_000,
    cash: 0,
    operatingCash: -0.1,
  });
  const challenge = getActiveServiceRecoveryChallenge(state);
  assert.ok(challenge);
  assert.equal(challenge.type, "cash-recovery");
  assert.match(challenge.objective, new RegExp(`${SERVICE_RECOVERY_CASH}억`));

  appendDay(state, 31, { users: 8_000, cash: 0, operatingCash: -0.1 });
  assert.equal(getServiceFailureReason(state), "insolvency");
});

test("healthy trusted operation compounds while a hostile distrusted game contracts", () => {
  const healthy = createInitialGame(9005);
  healthy.purchaseTrust = 90;
  for (const themeId of healthy.activeThemeIds) {
    healthy.themes[themeId].unpleasantness = 0;
    healthy.themes[themeId].fatigue = 0;
  }
  const hostile = structuredClone(healthy);
  hostile.purchaseTrust = 35;
  for (const themeId of hostile.activeThemeIds) {
    hostile.themes[themeId].unpleasantness = 100;
    hostile.themes[themeId].fatigue = 100;
  }

  assert.ok(getOrganizationAudienceRate(healthy) > 0.0015);
  assert.ok(getOrganizationAudienceRate(hostile) < -0.01);
});

function submitRecklessRelease(state: GameState): GameState {
  const slate = state.releaseSlate;
  assert.ok(slate);
  if (slate.releaseKind === "reprint") {
    return reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: getAutomaticReleaseSelections(state),
    });
  }
  const pick = <K extends (typeof slate.options)[number]["kind"]>(
    kind: K,
    count: number,
  ) => slate.options.filter((option) => option.kind === kind).slice(0, count);
  const selected = [
    ...pick("new-theme", 2),
    ...pick("support", 1),
    ...pick("generic", 1),
  ];
  assert.equal(selected.length, 4);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 3 as PowerAdjustment,
    })),
  });
}

function chooseWorstKnownEvent(state: GameState): GameState {
  const pending = state.operations.pendingEvent;
  assert.ok(pending);
  const definition = BUSINESS_EVENT_BY_TYPE[pending.type];
  const selected = definition.choices
    .filter((choice) => choice.cost <= state.finance.cash + 1e-9)
    .map((choice) => {
      const outcome = getBusinessEventOutcome(
        state.seed,
        pending.id,
        choice.risk,
      );
      const result = getBusinessEventResult(pending.type, choice.id, outcome);
      return {
        choice: choice.id,
        score:
          result.trustDelta * 4 +
          Object.values(result.userMultipliers).reduce(
            (sum, multiplier) => sum + multiplier,
            0,
          ) * 100 +
          result.cashDelta,
      };
    })
    .sort((left, right) => left.score - right.score)[0];
  assert.ok(selected);
  return reduceGame(state, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.id,
    choice: selected.choice,
  });
}

test("a reckless live campaign visibly loses its recovery challenge before DAY 500", () => {
  let state = createInitialGame(77);
  for (let guard = 0; state.phase !== "ended"; guard += 1) {
    assert.ok(guard < 5_000, "reckless campaign exceeded its progress guard");
    if (state.operations.pendingEvent) {
      state = chooseWorstKnownEvent(state);
      continue;
    }
    if (state.phase === "release-edit") {
      state = submitRecklessRelease(state);
      continue;
    }
    if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
      continue;
    }
    if (getBusinessActionAvailability(state, "pack-odds").available) {
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: "pack-odds",
      });
    }
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  }

  assert.ok(
    state.day < CAMPAIGN_END_DAY,
    `reckless operation survived with ${getOrganizationTrajectory(state).totalUsers} users, cash ${state.finance.cash}, trust ${state.purchaseTrust}`,
  );
  assert.notEqual(getServiceFailureReason(state), null);
  assert.equal(getOrganizationTrajectory(state).stage, "failed");
  assert.deepEqual(
    {
      day: state.day,
      users: getOrganizationTrajectory(state).totalUsers,
      cash: state.finance.cash,
      trust: state.purchaseTrust,
      failureReason: getServiceFailureReason(state),
    },
    {
      day: 371,
      users: 0,
      cash: 2.2487,
      trust: 0,
      failureReason: "audience-collapse",
    },
  );
});
