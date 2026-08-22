import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCampaignEnding,
  getCampaignCashBand,
  getCampaignEndingHints,
  getCampaignEnvironmentBand,
  getCampaignEnvironmentStability,
  getCampaignTrustBand,
  getCampaignUserBand,
} from "../app/game/campaign-ending.ts";
import { PLAYER_START_DAY } from "../app/game/campaign.ts";
import { createInitialGame } from "../app/game/engine.ts";
import type { GameState } from "../app/game/types.ts";

function setEnvironment(
  state: GameState,
  band: "danger" | "caution" | "stable",
): void {
  const value = band === "danger" ? 100 : band === "caution" ? 55 : 1;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].unpleasantness = value;
    state.themes[themeId].fatigue = value;
  }
  assert.equal(evaluateCampaignEnding(state).bands.environment, band);
}

function handoverUsers(state: GameState): number {
  const baseline = state.history.find(
    (entry) => entry.day === PLAYER_START_DAY,
  )?.totalUsers;
  assert.ok(baseline && baseline > 0);
  return baseline;
}

function setUserRatio(state: GameState, ratio: number): void {
  state.users.tier = handoverUsers(state) * ratio;
  state.users.casual = 0;
  state.users.collector = 0;
}

function makeStableFoundation(): GameState {
  const state = createInitialGame(101);
  state.finance.cash = 14;
  state.purchaseTrust = 80;
  setEnvironment(state, "stable");
  setUserRatio(state, 1);
  return state;
}

test("all result axes use the intended inclusive boundaries", () => {
  assert.equal(getCampaignCashBand(2.94), "crisis");
  assert.equal(getCampaignCashBand(2.95), "tight");
  assert.equal(getCampaignCashBand(9.94), "tight");
  assert.equal(getCampaignCashBand(9.95), "reserve");
  assert.equal(getCampaignCashBand(49.94), "reserve");
  assert.equal(getCampaignCashBand(49.95), "prosperous");

  assert.equal(getCampaignEnvironmentBand(49.94), "danger");
  assert.equal(getCampaignEnvironmentBand(49.95), "caution");
  assert.equal(getCampaignEnvironmentBand(64.94), "caution");
  assert.equal(getCampaignEnvironmentBand(64.95), "stable");

  assert.equal(getCampaignTrustBand(64.94), "low");
  assert.equal(getCampaignTrustBand(64.95), "guarded");
  assert.equal(getCampaignTrustBand(79.94), "guarded");
  assert.equal(getCampaignTrustBand(79.95), "trusted");

  assert.equal(getCampaignUserBand(0.49989), "collapsed");
  assert.equal(getCampaignUserBand(0.49995), "contracted");
  assert.equal(getCampaignUserBand(0.84989), "contracted");
  assert.equal(getCampaignUserBand(0.84995), "steady");
  assert.equal(getCampaignUserBand(1.24989), "steady");
  assert.equal(getCampaignUserBand(1.24995), "steady");
  assert.equal(getCampaignUserBand(1.25), "grown");
  assert.equal(getCampaignUserBand(8.49989), "grown");
  assert.equal(getCampaignUserBand(8.49995), "breakout");
  assert.equal(getCampaignUserBand(8.5), "breakout");
});

test("purchase trust is an independent axis and no longer lowers environment health twice", () => {
  const trusted = makeStableFoundation();
  trusted.purchaseTrust = 100;
  const lowTrust = structuredClone(trusted);
  lowTrust.purchaseTrust = 0;

  assert.equal(
    getCampaignEnvironmentStability(lowTrust),
    getCampaignEnvironmentStability(trusted),
  );
  assert.equal(evaluateCampaignEnding(lowTrust).bands.environment, "stable");
  assert.equal(evaluateCampaignEnding(lowTrust).bands.trust, "low");
});

test("handover-day active users define the audience ratio and delta", () => {
  const state = makeStableFoundation();
  const baseline = handoverUsers(state);
  setUserRatio(state, 1.25);

  const ending = evaluateCampaignEnding(state);
  assert.equal(ending.handoverUsers, baseline);
  assert.equal(ending.scores.userRatio, 1.25);
  assert.equal(
    ending.scores.userDelta,
    Math.round((state.users.tier - baseline) * 100) / 100,
  );
  assert.equal(ending.bands.users, "grown");
});

test("the best ending requires reserves, stability, trust, and visible audience growth", () => {
  const steady = makeStableFoundation();
  const steadyEnding = evaluateCampaignEnding(steady);
  assert.equal(steadyEnding.qualifiedForBestEnding, false);
  assert.equal(steadyEnding.title, "지속 가능한 리그");

  const grown = structuredClone(steady);
  setUserRatio(grown, 1.25);
  const grownEnding = evaluateCampaignEnding(grown);
  assert.equal(grownEnding.qualifiedForBestEnding, true);
  assert.equal(grownEnding.title, "함께 커진 리그");

  const contracted = structuredClone(steady);
  setUserRatio(contracted, 0.8);
  const contractedEnding = evaluateCampaignEnding(contracted);
  assert.equal(contractedEnding.qualifiedForBestEnding, false);
  assert.equal(contractedEnding.title, "좋은 판, 줄어든 관중");

  const guarded = structuredClone(grown);
  guarded.purchaseTrust = 79.9;
  const guardedEnding = evaluateCampaignEnding(guarded);
  assert.equal(guardedEnding.qualifiedForBestEnding, false);
  assert.equal(guardedEnding.title, "성장과 남은 경계");

  const low = structuredClone(grown);
  low.purchaseTrust = 62;
  const lowEnding = evaluateCampaignEnding(low);
  assert.equal(lowEnding.qualifiedForBestEnding, false);
  assert.equal(lowEnding.title, "성장에 남은 불신");
});

test("high cash has no upper reserve penalty", () => {
  const state = makeStableFoundation();
  state.finance.cash = 1_000_000;
  setUserRatio(state, 1.25);

  const ending = evaluateCampaignEnding(state);
  assert.equal(ending.bands.cash, "prosperous");
  assert.equal(ending.qualifiedForBestEnding, true);
  assert.equal(ending.title, "함께 커진 리그");
});

test("identical final results ignore support, policy, business, and event checklists", () => {
  const plain = makeStableFoundation();
  plain.finance.cash = 20;
  const recorded = structuredClone(plain);
  const themeId = recorded.activeThemeIds[0];

  recorded.supportRequests = [
    {
      id: "irrelevant-support",
      themeId,
      direction: "counterplay",
      proposedDay: 60,
      eligibleReleaseDay: 90,
      status: "released",
      releasedDay: 90,
    },
  ];
  recorded.community.push({
    id: "irrelevant-policy",
    day: 105,
    category: "restriction",
    type: "restriction-no-change",
    themeId,
    body: "",
  });
  recorded.operations.records.push({
    id: "irrelevant-business",
    type: "store-tour",
    startedDay: 60,
    endsDay: 74,
    cost: 0.35,
    outcome: "completed",
  });
  recorded.operations.eventRecords.push({
    id: "irrelevant-event",
    type: "starter-shortage",
    appearedDay: 70,
    choice: "a",
    cost: 0,
    risk: 0,
    resolutionDay: 72,
    outcome: "success",
    resolvedDay: 72,
  });

  assert.deepEqual(evaluateCampaignEnding(recorded), evaluateCampaignEnding(plain));
});

test("trust and audience outcomes still change non-stable ending copy", () => {
  const weak = makeStableFoundation();
  weak.finance.cash = 10;
  weak.purchaseTrust = 50;
  setEnvironment(weak, "danger");
  setUserRatio(weak, 0.8);

  const strong = structuredClone(weak);
  strong.purchaseTrust = 90;
  setUserRatio(strong, 1.2);

  const weakEnding = evaluateCampaignEnding(weak);
  const strongEnding = evaluateCampaignEnding(strong);
  assert.equal(weakEnding.title, strongEnding.title);
  assert.notEqual(weakEnding.body, strongEnding.body);
  assert.match(weakEnding.body, /신뢰.*낮은 구간/);
  assert.match(strongEnding.body, /신뢰.*견고/);
});

test("ending hints contain only result axes that missed their standards", () => {
  const allLow = makeStableFoundation();
  allLow.finance.cash = 4;
  allLow.purchaseTrust = 60;
  setEnvironment(allLow, "danger");
  setUserRatio(allLow, 0.8);

  assert.deepEqual(
    getCampaignEndingHints(evaluateCampaignEnding(allLow)).map((hint) => hint.id),
    ["cash", "environment", "trust", "users"],
  );

  const guardedGrowth = makeStableFoundation();
  guardedGrowth.purchaseTrust = 70;
  setUserRatio(guardedGrowth, 1.3);
  assert.deepEqual(
    getCampaignEndingHints(evaluateCampaignEnding(guardedGrowth)).map(
      (hint) => hint.id,
    ),
    ["trust"],
  );

  const complete = makeStableFoundation();
  setUserRatio(complete, 1.25);
  assert.deepEqual(getCampaignEndingHints(evaluateCampaignEnding(complete)), []);
});

test("the former high-growth low-trust result receives a distinct trust ending", () => {
  const state = makeStableFoundation();
  state.finance.cash = 36.69;
  state.purchaseTrust = 62;
  const baseline = handoverUsers(state);
  state.users = { tier: baseline + 13_277, casual: 0, collector: 0 };

  const ending = evaluateCampaignEnding(state);
  assert.equal(ending.scores.cash, 36.7);
  assert.equal(ending.bands.cash, "reserve");
  assert.equal(ending.bands.environment, "stable");
  assert.equal(ending.bands.trust, "low");
  assert.equal(ending.bands.users, "grown");
  assert.equal(ending.title, "성장에 남은 불신");
  assert.notEqual(ending.title, "성장 뒤의 숙제");
  assert.equal(ending.qualifiedForBestEnding, false);
});
