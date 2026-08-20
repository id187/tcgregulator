import assert from "node:assert/strict";
import test from "node:test";

import { RELEASE_INTERVAL, TUTORIAL_END_DAY } from "../app/game/campaign.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { getDailyCommunityPosts } from "../app/game/daily-community.ts";
import { createInitialGame } from "../app/game/engine.ts";
import { getKeywordCommunitySignal } from "../app/game/keyword-community.ts";
import { getKeywordMatchupEdgeScore } from "../app/game/play-keywords.ts";

test("community hints at a favorable matchup that cannot cover a raw-power deficit", () => {
  const state = createInitialGame(73_811);
  const signalDay = TUTORIAL_END_DAY + 2;
  const first = getKeywordCommunitySignal(state, signalDay);
  const second = getKeywordCommunitySignal(state, signalDay);

  assert.deepEqual(second, first);
  assert.ok(first);
  assert.match(first.id, /^daily-keyword-matchup-/);
  assert.ok(first.relatedThemeId);
  const hunter = THEME_BY_ID[first.themeId];
  const target = THEME_BY_ID[first.relatedThemeId];
  assert.ok(hunter.basePower < target.basePower);
  assert.ok(
    getKeywordMatchupEdgeScore(hunter.playKeywords, target.playKeywords) > 0,
  );
  assert.match(first.body, /상성|플랜/);
  assert.match(first.body, /체급/);
  assert.doesNotMatch(first.body, /상성표|우위\s*\d|열위\s*\d|edge|logit/i);

  const board = getDailyCommunityPosts(state, TUTORIAL_END_DAY);
  assert.equal(board.length, 20);
  assert.equal(
    board.filter((post) => post.id.startsWith("daily-keyword-")).length,
    1,
  );
});

test("counterplay support produces a qualitative clue about its release-day target", () => {
  const state = createInitialGame(73_812);
  const latest = state.history.at(-1);
  assert.ok(latest);
  const shares = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, latest.shares[themeId] ?? 0.05]),
  );
  state.day = RELEASE_INTERVAL * 2 + 1;
  state.phase = "running";
  state.history.push({
    ...latest,
    day: RELEASE_INTERVAL * 2,
    topThemeId: "machine-revolution",
    shares,
    winRates: Object.fromEntries(
      state.activeThemeIds.map((themeId) => [themeId, 0.5]),
    ),
  });
  state.releaseHistory.push({
    day: RELEASE_INTERVAL * 2,
    products: [
      {
        optionId: "counterplay-community-fixture",
        kind: "support",
        themeId: "cycle",
        direction: "counterplay",
        expectedTier: "Tier 2",
        powerAdjustment: 0,
      },
    ],
  });

  const signal = getKeywordCommunitySignal(state, RELEASE_INTERVAL * 2 + 1);
  assert.ok(signal);
  assert.match(signal.id, /^daily-keyword-counterplay-/);
  assert.equal(signal.themeId, "cycle");
  assert.equal(signal.relatedThemeId, "machine-revolution");
  assert.match(signal.body, /카운터|눌러|끊는/);
  assert.doesNotMatch(signal.body, /상성표|우위\s*\d|열위\s*\d|edge|logit/i);

  const board = getDailyCommunityPosts(state, RELEASE_INTERVAL * 2 + 1);
  assert.equal(board.length, 20);
  assert.ok(board.some((post) => post.id === signal.id));
});
