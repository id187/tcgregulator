import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCampaignEnding,
  getCampaignCashBand,
  getCampaignEnvironmentBand,
  getCampaignEnvironmentStability,
} from "../app/game/campaign-ending.ts";
import { createInitialGame } from "../app/game/engine.ts";

test("cash and environment thresholds use the intended inclusive boundaries", () => {
  assert.equal(getCampaignCashBand(4.94), "crisis");
  assert.equal(getCampaignCashBand(4.95), "tight");
  assert.equal(getCampaignCashBand(9.94), "tight");
  assert.equal(getCampaignCashBand(9.95), "reserve");

  assert.equal(getCampaignEnvironmentBand(49.94), "danger");
  assert.equal(getCampaignEnvironmentBand(49.95), "caution");
  assert.equal(getCampaignEnvironmentBand(69.94), "caution");
  assert.equal(getCampaignEnvironmentBand(69.95), "stable");
});

test("all nine cash and environment combinations produce distinct endings", () => {
  const cashScores = [4, 5, 10];
  const environmentScores = [49, 50, 70];
  const endings = new Set<string>();

  for (const cash of cashScores) {
    for (const environmentHealth of environmentScores) {
      const state = createInitialGame(13);
      state.finance.cash = cash;
      state.activeThemeIds = [state.currentTopThemeId];
      state.themes[state.currentTopThemeId].share = 1;
      state.themes[state.currentTopThemeId].unpleasantness =
        100 - environmentHealth;

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
  state.activeThemeIds = [state.currentTopThemeId];
  state.themes[state.currentTopThemeId].share = 1;
  state.themes[state.currentTopThemeId].unpleasantness = 1;
  state.purchaseTrust = 0;

  assert.equal(getCampaignEnvironmentStability(state), 59);
  assert.equal(evaluateCampaignEnding(state).bands.environment, "caution");
});

test("user count is context and does not change the core ending", () => {
  const state = createInitialGame(17);
  state.finance.cash = 10;
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
