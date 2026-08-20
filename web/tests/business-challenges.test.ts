import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_CHALLENGE_BY_TYPE,
  createBusinessChallenge,
  getNextBusinessChallengeDecisionDay,
  isBusinessChallengeDecisionDay,
  updateBusinessChallenge,
} from "../app/game/business-challenges.ts";
import { getBusinessActionAvailability } from "../app/game/business-actions.ts";
import {
  createCampaignStart,
  getPrologueReleaseSelections,
  reduceGame,
} from "../app/game/engine.ts";
import { parseGameState, SaveSchemaError } from "../app/game/save-schema.ts";
import type {
  BusinessActionRecord,
  BusinessChallengeMetric,
  BusinessChallengeProgress,
  GameState,
} from "../app/game/types.ts";

const GOOD_METRICS: Record<BusinessChallengeMetric, number> = {
  "environment-health": 100,
  "purchase-trust": 100,
  "release-quality": 100,
};

function challengeRecord(
  type: "season-overhaul" | "global-launch" | "first-print-expansion",
  startedDay = 100,
): BusinessActionRecord & { challenge: BusinessChallengeProgress } {
  return {
    id: "business-action-1",
    type,
    startedDay,
    endsDay: startedDay + 90,
    cost: 0,
    outcome: "active",
    risk: 0.5,
    challenge: createBusinessChallenge(type, startedDay),
  };
}

function advanceThroughFirstRestriction(
  state: GameState,
  targetDay: 29 | 30,
): GameState {
  let next = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(next.day, 15);
  assert.equal(next.phase, "ban-edit");
  next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
  return reduceGame(next, {
    type: "ADVANCE_DAYS",
    days: targetDay - next.day,
  });
}

test("strategic challenges persist readable progress and resolve only at their deadline", () => {
  for (const type of [
    "season-overhaul",
    "global-launch",
    "first-print-expansion",
  ] as const) {
    const record = challengeRecord(type);
    const definition = BUSINESS_CHALLENGE_BY_TYPE[type];
    assert.equal(record.challenge.metric, definition.metric);
    assert.equal(record.challenge.threshold, definition.threshold);
    assert.equal(
      record.challenge.requiredQualifyingDays,
      definition.requiredQualifyingDays,
    );
    assert.equal(record.challenge.deadlineDay, 100 + definition.deadlineOffset);

    let outcome: "success" | "backlash" | null = null;
    for (let day = 101; day <= record.challenge.deadlineDay; day += 1) {
      outcome = updateBusinessChallenge(record, GOOD_METRICS, day).outcome;
      if (day < record.challenge.deadlineDay) assert.equal(outcome, null);
    }
    assert.equal(outcome, "success");
    assert.equal(record.challenge.observedDays, definition.deadlineOffset);
    assert.equal(
      record.challenge.qualifyingDays,
      definition.deadlineOffset,
    );
  }
});

test("missed qualifying days deterministically produce backlash without a random roll", () => {
  const record = challengeRecord("global-launch");
  const deadline = record.challenge.deadlineDay;
  const lowMetrics = { ...GOOD_METRICS, "purchase-trust": 0 };
  let outcome: "success" | "backlash" | null = null;
  for (let day = record.startedDay + 1; day <= deadline; day += 1) {
    outcome = updateBusinessChallenge(record, lowMetrics, day).outcome;
  }
  assert.equal(outcome, "backlash");
  assert.equal(record.challenge.qualifyingDays, 0);
  assert.equal(record.challenge.lastEvaluatedDay, deadline);
});

test("engine advancement is chunk-independent and applies a material championship result once", () => {
  const prepare = (seed: number): GameState => {
    let state = createCampaignStart(seed);
    state.finance.cash = 10;
    state = advanceThroughFirstRestriction(state, 30);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: getPrologueReleaseSelections(state),
    });
    for (const themeId of state.activeThemeIds) {
      state.themes[themeId].fatigue = 0;
      state.themes[themeId].unpleasantness = 0;
    }
    return state;
  };
  const launch = (state: GameState): GameState =>
    reduceGame(state, {
      type: "RUN_BUSINESS_ACTION",
      action: "championship",
    });

  const base = prepare(82_001);
  const launched = launch(base);
  assert.deepEqual(launched.operations.records[0].challenge, {
    metric: "environment-health",
    threshold: 65,
    requiredQualifyingDays: 1,
    qualifyingDays: 0,
    observedDays: 0,
    deadlineDay: 31,
    lastEvaluatedDay: null,
    lastValue: null,
  });

  const jumped = reduceGame(launched, { type: "ADVANCE_DAYS", days: 7 });
  let stepped = launched;
  for (let day = 0; day < 7; day += 1) {
    stepped = reduceGame(stepped, { type: "ADVANCE_DAYS", days: 1 });
  }
  assert.deepEqual(jumped, stepped);
  assert.equal(jumped.operations.records[0].outcome, "success");
  assert.equal(jumped.operations.records[0].resolvedDay, 31);
  assert.equal(jumped.operations.records[0].risk, undefined);
  assert.equal(jumped.operations.records[0].challenge?.qualifyingDays, 1);

  const resolved = reduceGame(launched, { type: "ADVANCE_DAYS", days: 1 });
  const control = reduceGame(base, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(
    resolved.users.tier > control.users.tier * 1.05,
    "championship success should create an immediately legible audience swing",
  );
});

test("save validation round-trips challenge progress and rejects forged thresholds", () => {
  let state = createCampaignStart(82_003);
  state.finance.cash = 10;
  state = advanceThroughFirstRestriction(state, 30);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: getPrologueReleaseSelections(state),
  });
  const launched = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "championship",
  });
  const roundTripped = JSON.parse(JSON.stringify(launched)) as unknown;
  assert.deepEqual(parseGameState(roundTripped), launched);

  const forged = JSON.parse(JSON.stringify(launched)) as GameState;
  forged.operations.records[0].challenge!.threshold += 1;
  assert.throws(() => parseGameState(forged), SaveSchemaError);

  const forgedRuntime = structuredClone(launched);
  forgedRuntime.operations.records[0].challenge!.observedDays = 2;
  assert.throws(
    () => reduceGame(forgedRuntime, { type: "ADVANCE_DAYS", days: 0 }),
    /Invalid business challenge/i,
  );
});

test("challenge actions open only after a scheduled decision is submitted", () => {
  let day29 = createCampaignStart(82_004);
  day29.finance.cash = 10;
  day29 = advanceThroughFirstRestriction(day29, 29);
  const before = getBusinessActionAvailability(day29, "championship");
  assert.equal(before.available, false);
  assert.equal(before.nextEligibleDay, 30);

  const releaseEdit = reduceGame(day29, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(releaseEdit.phase, "release-edit");
  assert.equal(
    getBusinessActionAvailability(releaseEdit, "championship").available,
    false,
  );
  const submitted = reduceGame(releaseEdit, {
    type: "SUBMIT_RELEASE",
    selections: getPrologueReleaseSelections(releaseEdit),
  });
  assert.equal(
    getBusinessActionAvailability(submitted, "championship").available,
    true,
  );

  const day31 = reduceGame(submitted, { type: "ADVANCE_DAYS", days: 1 });
  const after = getBusinessActionAvailability(day31, "championship");
  assert.equal(after.available, false);
  assert.equal(after.nextEligibleDay, 60);
  assert.match(after.reason ?? "", /DAY 60/);

  assert.equal(isBusinessChallengeDecisionDay(15), true);
  assert.equal(isBusinessChallengeDecisionDay(29), false);
  assert.equal(isBusinessChallengeDecisionDay(30), true);
  assert.equal(isBusinessChallengeDecisionDay(45), false);
  assert.equal(isBusinessChallengeDecisionDay(46), false);
  assert.equal(isBusinessChallengeDecisionDay(60), true);
  assert.equal(isBusinessChallengeDecisionDay(75), true);
  assert.equal(isBusinessChallengeDecisionDay(120), true);
  assert.equal(getNextBusinessChallengeDecisionDay(121), 135);
});
