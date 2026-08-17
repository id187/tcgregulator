import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCampaignEnding,
  getCampaignCashBand,
  getCampaignEnvironmentBand,
  getCampaignEnvironmentStability,
  getCampaignEndingHints,
  getCampaignStewardshipEvaluation,
} from "../app/game/campaign-ending.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame } from "../app/game/engine.ts";

function createCompleteStewardshipState() {
  const state = createInitialGame(101);
  state.finance.cash = 14;
  state.purchaseTrust = 85;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].unpleasantness = 30;
  }

  const supportThemeIds = state.activeThemeIds.slice(0, 2);
  state.supportRequests = [
    {
      id: "support-request-1",
      themeId: supportThemeIds[0],
      direction: "consistency",
      proposedDay: 46,
      eligibleReleaseDay: 60,
      status: "released",
      releasedDay: 60,
    },
    {
      id: "support-request-2",
      themeId: supportThemeIds[1],
      direction: "counterplay",
      proposedDay: 76,
      eligibleReleaseDay: 90,
      status: "released",
      releasedDay: 90,
    },
    {
      id: "support-request-3",
      themeId: supportThemeIds[0],
      direction: "recovery",
      proposedDay: 106,
      eligibleReleaseDay: 120,
      status: "released",
      releasedDay: 120,
    },
  ];

  const latestShares = state.history.at(-1)?.shares ?? {};
  const rankedThemeIds = Object.entries(latestShares)
    .sort((left, right) => right[1] - left[1])
    .map(([themeId]) => themeId);
  const policyThemeIds = [
    ...rankedThemeIds.slice(0, 2),
    ...rankedThemeIds.slice(3, 5),
  ];
  const meaningfulParts = new Map(
    policyThemeIds.map((themeId) => [
      themeId,
      THEME_BY_ID[themeId].parts.filter(
        (part) =>
          state.themes[themeId].releasedPartIds.includes(part.id) &&
          part.preferredCopies >= 2,
      ),
    ]),
  );
  const decisionDays = [105, 165, 225, 285, 345];
  for (const [decisionIndex, day] of decisionDays.entries()) {
    const cutPartIds = new Set<string>();
    for (const themeId of policyThemeIds) {
      const parts = meaningfulParts.get(themeId) ?? [];
      const part = parts[decisionIndex % parts.length];
      cutPartIds.add(part.id);
      state.community.push({
        id: `stewardship-cut-${day}-${themeId}`,
        day,
        category: "restriction",
        type: "restriction-applied",
        themeId,
        partId: part.id,
        previousValue: 3,
        value: 1,
        body: "",
      });
    }
    if (decisionIndex >= 1) {
      const tutorialRelief = state.community.find(
        (event) =>
          event.day === 45 &&
          Boolean(event.partId) &&
          (event.value ?? 3) < 3 &&
          !cutPartIds.has(event.partId!),
      );
      const reliefThemeId = decisionIndex === 1
        ? tutorialRelief?.themeId
        : policyThemeIds[decisionIndex - 2];
      const reliefPartId = decisionIndex === 1
        ? tutorialRelief?.partId
        : meaningfulParts.get(reliefThemeId!)?.[decisionIndex - 2]?.id;
      assert.ok(reliefThemeId);
      assert.ok(reliefPartId);
      state.community.push({
        id: `stewardship-relief-${day}-${reliefThemeId}`,
        day,
        category: "restriction",
        type: "restriction-applied",
        themeId: reliefThemeId,
        partId: reliefPartId,
        previousValue: 1,
        value: 3,
        body: "",
      });
    }
  }

  state.operations.records = [
    {
      id: "business-action-1",
      type: "season-overhaul",
      startedDay: 120,
      endsDay: 210,
      cost: 3.5,
      outcome: "success",
      risk: 0.4,
      cashReturn: 6.5,
      resolvedDay: 150,
    },
    {
      id: "business-action-2",
      type: "reprint-campaign",
      startedDay: 121,
      endsDay: 151,
      cost: 0.55,
      outcome: "completed",
    },
    {
      id: "business-action-3",
      type: "local-league",
      startedDay: 122,
      endsDay: 143,
      cost: 0.5,
      outcome: "completed",
    },
    {
      id: "business-action-4",
      type: "collector-fair",
      startedDay: 123,
      endsDay: 137,
      cost: 0.65,
      outcome: "completed",
    },
    {
      id: "business-action-5",
      type: "beginner-camp",
      startedDay: 124,
      endsDay: 138,
      cost: 0.4,
      outcome: "completed",
    },
    {
      id: "business-action-6",
      type: "store-tour",
      startedDay: 145,
      endsDay: 159,
      cost: 0.35,
      outcome: "completed",
    },
  ];
  state.operations.eventRecords = Array.from({ length: 20 }, (_, index) => ({
    id: `business-event-${index + 1}`,
    type: "starter-shortage" as const,
    appearedDay: 53 + index * 15,
    choice: "a" as const,
    cost: 0,
    risk: 0.2,
    resolutionDay: 55 + index * 15,
    outcome: index < 14 ? "success" as const : "backlash" as const,
    resolvedDay: 55 + index * 15,
  }));
  return state;
}

test("cash and environment thresholds use the intended inclusive boundaries", () => {
  assert.equal(getCampaignCashBand(4.94), "crisis");
  assert.equal(getCampaignCashBand(4.95), "tight");
  assert.equal(getCampaignCashBand(13.94), "tight");
  assert.equal(getCampaignCashBand(13.95), "reserve");

  assert.equal(getCampaignEnvironmentBand(49.94), "danger");
  assert.equal(getCampaignEnvironmentBand(49.95), "caution");
  assert.equal(getCampaignEnvironmentBand(69.94), "caution");
  assert.equal(getCampaignEnvironmentBand(69.95), "stable");
});

test("all nine cash and environment combinations produce distinct endings", () => {
  const cashScores = [4, 5, 14];
  const environmentScores = [49, 50, 70];
  const endings = new Set<string>();

  for (const cash of cashScores) {
    for (const environmentHealth of environmentScores) {
      const state = createInitialGame(13);
      state.finance.cash = cash;
      for (const themeId of state.activeThemeIds) {
        state.themes[themeId].unpleasantness = 100 - environmentHealth;
      }

      const ending = evaluateCampaignEnding(state);

      assert.equal(ending.scores.cash, cash);
      assert.equal(ending.scores.environmentHealth, environmentHealth);
      endings.add(`${ending.title}\n${ending.body}`);
    }
  }

  assert.equal(endings.size, 9);
});

test("collapsed purchase trust lowers an otherwise healthy environment ending", () => {
  const state = createInitialGame(19);
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].unpleasantness = 1;
  }
  state.purchaseTrust = 0;

  assert.equal(getCampaignEnvironmentStability(state), 59);
  assert.equal(evaluateCampaignEnding(state).bands.environment, "caution");
});

test("user count is context and does not change the core ending", () => {
  const state = createInitialGame(17);
  state.finance.cash = 14;
  state.activeThemeIds = [state.currentTopThemeId];
  state.themes[state.currentTopThemeId].share = 1;
  state.themes[state.currentTopThemeId].unpleasantness = 30;
  const initialTotalUsers =
    state.users.tier + state.users.casual + state.users.collector;

  const populated = evaluateCampaignEnding(state);
  state.users = { tier: 0, casual: 0, collector: 0 };
  const empty = evaluateCampaignEnding(state);

  assert.deepEqual(empty.bands, populated.bands);
  assert.equal(empty.title, populated.title);
  assert.equal(empty.body, populated.body);
  assert.equal(populated.totalUsers, initialTotalUsers);
  assert.equal(empty.totalUsers, 0);
});

test("the best ending requires all four stewardship pillars", () => {
  const state = createCompleteStewardshipState();
  const stewardship = getCampaignStewardshipEvaluation(state);
  const ending = evaluateCampaignEnding(state);

  assert.equal(stewardship.complete, true, JSON.stringify(stewardship));
  assert.equal(stewardship.passedPillars, 4);
  assert.equal(stewardship.pillars.support.releasedRequests, 3);
  assert.equal(stewardship.pillars.policy.balancedReviews, 5);
  assert.ok(stewardship.pillars.policy.staleFullyReleased >= 2);
  assert.equal(stewardship.pillars.business.qualifyingActions, 6);
  assert.equal(stewardship.pillars.business.distinctTypes, 6);
  assert.equal(stewardship.pillars.business.distinctTones, 4);
  assert.equal(stewardship.pillars.events.successes, 14);
  assert.equal(ending.qualifiedForBestEnding, true);
  assert.equal(ending.title, "지속 가능한 리그");

  const missingSupport = structuredClone(state);
  missingSupport.supportRequests.pop();
  const incomplete = evaluateCampaignEnding(missingSupport);
  assert.equal(incomplete.stewardship.pillars.support.passed, false);
  assert.equal(incomplete.qualifiedForBestEnding, false);
  assert.equal(incomplete.title, "성장 뒤의 숙제");
  assert.match(incomplete.body, /운영 체계에 빈틈/);
});

test("ending hints expose missed directions without revealing thresholds", () => {
  const complete = evaluateCampaignEnding(createCompleteStewardshipState());
  assert.equal(complete.qualifiedForBestEnding, true);
  assert.deepEqual(getCampaignEndingHints(complete), []);

  const mixedState = createCompleteStewardshipState();
  mixedState.finance.cash = 10;
  mixedState.purchaseTrust = 0;
  mixedState.supportRequests.pop();
  const mixedHints = getCampaignEndingHints(evaluateCampaignEnding(mixedState));
  assert.deepEqual(
    mixedHints.map((hint) => hint.id),
    ["cash", "environment", "support"],
  );

  const unpreparedHints = getCampaignEndingHints(
    evaluateCampaignEnding(createInitialGame(202)),
  );
  assert.deepEqual(
    new Set(unpreparedHints.map((hint) => hint.id)),
    new Set(["cash", "environment", "support", "policy", "business", "events"]),
  );
  for (const hint of [...mixedHints, ...unpreparedHints]) {
    assert.doesNotMatch(`${hint.title} ${hint.body}`, /\d/);
  }
});

test("stewardship pillars reject shallow policy, action, and event play", () => {
  const state = createCompleteStewardshipState();

  const shallowPolicy = structuredClone(state);
  shallowPolicy.community = shallowPolicy.community.filter(
    (event) => event.day !== 345,
  );
  assert.equal(
    getCampaignStewardshipEvaluation(shallowPolicy).pillars.policy.passed,
    false,
  );

  const failedProject = structuredClone(state);
  failedProject.operations.records[0].outcome = "backlash";
  assert.equal(
    getCampaignStewardshipEvaluation(failedProject).pillars.business.passed,
    false,
  );

  const powerCreep = structuredClone(state);
  const guidedProducts = powerCreep.releaseHistory[0].products;
  powerCreep.releaseHistory.push(
    {
      day: 60,
      products: guidedProducts.map((product, index) => ({
        ...product,
        optionId: `pressure-60-${index}`,
        expectedTier: "Tier 1",
        powerAdjustment: 3,
        requestId: undefined,
      })),
    },
    {
      day: 90,
      products: guidedProducts.map((product, index) => ({
        ...product,
        optionId: `pressure-90-${index}`,
        expectedTier: "Tier 1",
        powerAdjustment: 3,
        requestId: undefined,
      })),
    },
  );
  const recklessRelease = getCampaignStewardshipEvaluation(powerCreep);
  assert.equal(recklessRelease.pillars.support.positivePowerPressure, 18);
  assert.equal(recklessRelease.pillars.support.passed, false);

  const unluckyButTrusted = structuredClone(state);
  unluckyButTrusted.operations.eventRecords[13].outcome = "backlash";
  unluckyButTrusted.purchaseTrust = 80;
  const recovered = getCampaignStewardshipEvaluation(unluckyButTrusted);
  assert.equal(recovered.pillars.events.successes, 13);
  assert.equal(recovered.pillars.events.usedTrustRecoveryPath, true);
  assert.equal(recovered.pillars.events.passed, true);

  unluckyButTrusted.purchaseTrust = 79.99;
  assert.equal(
    getCampaignStewardshipEvaluation(unluckyButTrusted).pillars.events.passed,
    false,
  );
});
