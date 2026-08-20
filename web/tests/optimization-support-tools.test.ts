import assert from "node:assert/strict";
import test from "node:test";

import { THEME_BY_ID } from "../app/game/content.ts";
import {
  SUPPORT_DIRECTION_MATCHUP_LOGIT_CAP,
  createCampaignStart,
  getPrologueRestrictionChanges,
  getCurrentPairWinProbability,
  getEffectiveThemePlayKeywords,
  getProspectiveSupportKeyword,
  getSupportDirectionMatchupLogitAdjustment,
  getThemeOptimizationStatus,
  reduceGame,
} from "../app/game/engine.ts";
import { PLAY_KEYWORD_IDS } from "../app/game/play-keywords.ts";
import { parseGameState } from "../app/game/save-schema.ts";
import type {
  GameState,
  ReleasedProduct,
  SupportDirection,
  ThemeId,
} from "../app/game/types.ts";

function reachFreshTheme(seed = 70_091): {
  state: GameState;
  themeId: ThemeId;
} {
  let state = reduceGame(createCampaignStart(seed), {
    type: "ADVANCE_DAYS",
    days: 14,
  });
  assert.equal(state.day, 15);
  assert.equal(state.phase, "ban-edit");
  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(state),
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: 15,
  });
  assert.equal(state.phase, "release-edit");
  const newThemeOptions = state.releaseSlate?.options.filter(
    (option) => option.kind === "new-theme",
  );
  assert.equal(newThemeOptions?.length, 3);
  const supportOption = state.releaseSlate?.options.find(
    (option) => option.kind === "support",
  );
  const genericOption = state.releaseSlate?.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(supportOption);
  assert.ok(genericOption);
  const selected = [
    ...newThemeOptions!.slice(0, 2),
    supportOption,
    genericOption,
  ];
  const selections = selected.map((option) => ({
    optionId: option.id,
    powerAdjustment: 0 as const,
  }));
  const themeId = newThemeOptions![0].themeId;
  state = reduceGame(state, { type: "SUBMIT_RELEASE", selections });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(state.themes[themeId]);
  return { state, themeId };
}

function supportProduct(
  themeId: ThemeId,
  direction: SupportDirection,
  index = 0,
): ReleasedProduct {
  return {
    optionId: `support-tool-fixture-${direction}-${index}`,
    kind: "support",
    themeId,
    expectedTier: "Tier 2",
    powerAdjustment: 0,
    direction,
  };
}

function withAppliedSupports(
  directions: readonly SupportDirection[],
  ownerId: ThemeId,
  leaderId: ThemeId,
): GameState {
  const state = createCampaignStart(80_017);
  state.history[0].topThemeId = leaderId;
  state.releaseHistory.push({
    day: 1,
    products: directions.map((direction, index) =>
      supportProduct(ownerId, direction, index),
    ),
  });
  // Release selections apply on the following day.
  state.day = 2;
  return state;
}

test("new themes rise deterministically as authored optimization completes", () => {
  const starting = createCampaignStart(70_091);
  const established = getThemeOptimizationStatus(
    starting,
    starting.activeThemeIds[0],
  );
  assert.equal(established.phase, "pre-campaign");
  assert.equal(established.progress, 1);
  assert.equal(established.powerPenalty, 0);

  const { state, themeId } = reachFreshTheme();
  const fresh = getThemeOptimizationStatus(state, themeId);
  assert.equal(fresh.debutDay, 31);
  assert.equal(fresh.phase, "learning");
  assert.equal(fresh.progress, 0);
  assert.ok(fresh.powerPenalty >= 4);

  const midState = structuredClone(state);
  midState.day = fresh.debutDay! + Math.ceil(fresh.effectiveOptimizationDays / 2);
  const mid = getThemeOptimizationStatus(midState, themeId);
  const matureState = structuredClone(state);
  matureState.day = fresh.debutDay! + fresh.effectiveOptimizationDays;
  const mature = getThemeOptimizationStatus(matureState, themeId);
  assert.ok(mid.progress > fresh.progress && mid.progress < 1);
  assert.ok(mid.powerPenalty < fresh.powerPenalty);
  assert.equal(mature.progress, 1);
  assert.equal(mature.powerPenalty, 0);
  assert.equal(mature.phase, "optimized");

  const opponentId = state.activeThemeIds.find((id) => id !== themeId);
  assert.ok(opponentId);
  const freshWinChance = getCurrentPairWinProbability(
    state,
    themeId,
    opponentId,
  );
  const matureWinChance = getCurrentPairWinProbability(
    matureState,
    themeId,
    opponentId,
  );
  assert.ok(
    matureWinChance > freshWinChance + 0.03,
    "the same raw cards should perform better once their lines are solved",
  );

  const discoveryWindow = Math.ceil(fresh.effectiveOptimizationDays * 0.7);
  const discovered = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: discoveryWindow,
  });
  assert.ok(
    discovered.community.some(
      (event) =>
        event.themeId === themeId && event.type === "optimization-rumor",
    ),
    "the community should surface the solved build only after repeated play",
  );
});

test("optimization and support reconstruction survive a save/replay boundary", () => {
  const { state, themeId } = reachFreshTheme(70_092);
  const restored = parseGameState(JSON.parse(JSON.stringify(state)));
  const continued = reduceGame(state, { type: "ADVANCE_DAYS", days: 4 });
  const replayed = reduceGame(restored, { type: "ADVANCE_DAYS", days: 4 });

  assert.deepEqual(replayed, continued);
  assert.deepEqual(
    getThemeOptimizationStatus(replayed, themeId),
    getThemeOptimizationStatus(continued, themeId),
  );
  assert.deepEqual(
    getEffectiveThemePlayKeywords(replayed, themeId),
    getEffectiveThemePlayKeywords(continued, themeId),
  );
});

test("each applied support grants one previewable unique keyword up to six", () => {
  const ownerId = "cycle";
  const state = createCampaignStart(80_017);
  const base = getEffectiveThemePlayKeywords(state, ownerId);
  assert.equal(base.length, 3);
  assert.ok(Object.isFrozen(base));

  const firstDirection = "counterplay" as const;
  const preview = getProspectiveSupportKeyword(state, ownerId, firstDirection);
  assert.ok(preview);
  assert.ok(PLAY_KEYWORD_IDS.includes(preview));
  assert.ok(!base.includes(preview));

  state.releaseHistory.push({
    day: 1,
    products: [supportProduct(ownerId, firstDirection)],
  });
  state.day = 2;
  const afterFirst = getEffectiveThemePlayKeywords(state, ownerId);
  assert.equal(afterFirst.length, 4);
  assert.equal(afterFirst[3], preview);

  const secondDirection = "finisher" as const;
  const secondPreview = getProspectiveSupportKeyword(
    state,
    ownerId,
    secondDirection,
  );
  assert.ok(secondPreview);
  state.releaseHistory.push({
    day: 2,
    products: [supportProduct(ownerId, secondDirection, 1)],
  });
  state.day = 3;
  const afterSecond = getEffectiveThemePlayKeywords(state, ownerId);
  assert.equal(afterSecond.length, 5);
  assert.equal(afterSecond[4], secondPreview);
  assert.equal(new Set(afterSecond).size, afterSecond.length);

  state.releaseHistory.push({
    day: 3,
    products: [
      supportProduct(ownerId, "recovery", 2),
      supportProduct(ownerId, "consistency", 3),
    ],
  });
  state.day = 4;
  const capped = getEffectiveThemePlayKeywords(state, ownerId);
  assert.equal(capped.length, 6);
  assert.equal(new Set(capped).size, 6);
  assert.equal(getProspectiveSupportKeyword(state, ownerId, "consistency"), null);
});

test("prospective keywords reserve a confirmed current-day support", () => {
  const ownerId = "cycle";
  const state = createCampaignStart(80_017);
  const firstPreview = getProspectiveSupportKeyword(
    state,
    ownerId,
    "consistency",
  );
  assert.ok(firstPreview);

  state.releaseHistory.push({
    day: state.day,
    products: [supportProduct(ownerId, "consistency")],
  });
  assert.equal(
    getEffectiveThemePlayKeywords(state, ownerId).length,
    3,
    "the confirmed product must not become live until tomorrow",
  );
  const secondPreviewWhilePending = getProspectiveSupportKeyword(
    state,
    ownerId,
    "consistency",
  );
  assert.ok(secondPreviewWhilePending);
  assert.notEqual(secondPreviewWhilePending, firstPreview);

  state.day += 1;
  assert.equal(getEffectiveThemePlayKeywords(state, ownerId)[3], firstPreview);
  assert.equal(
    getProspectiveSupportKeyword(state, ownerId, "consistency"),
    secondPreviewWhilePending,
  );
});

test("support directions answer distinct plans without exposing an uncapped edge", () => {
  const ownerId = "cycle";
  const slowId = "white-night";
  const interactiveId = "abyss";
  const neutralId = "machine-revolution";
  assert.ok(THEME_BY_ID[slowId].playKeywords.includes("fortress"));
  assert.ok(THEME_BY_ID[interactiveId].playKeywords.some(
    (keyword) => keyword === "control" || keyword === "disruption" || keyword === "deception",
  ));

  const consistency = withAppliedSupports(
    ["consistency"],
    ownerId,
    slowId,
  );
  assert.ok(
    getSupportDirectionMatchupLogitAdjustment(
      consistency,
      ownerId,
      neutralId,
    ) > 0,
  );

  const counterplay = withAppliedSupports(["counterplay"], ownerId, slowId);
  assert.ok(
    getSupportDirectionMatchupLogitAdjustment(
      counterplay,
      ownerId,
      slowId,
    ) >= 0.12,
  );
  assert.equal(
    getSupportDirectionMatchupLogitAdjustment(
      counterplay,
      ownerId,
      neutralId,
    ),
    0,
  );

  const finisher = withAppliedSupports(["finisher"], ownerId, slowId);
  assert.ok(
    getSupportDirectionMatchupLogitAdjustment(finisher, ownerId, slowId) > 0,
  );
  assert.equal(
    getSupportDirectionMatchupLogitAdjustment(finisher, ownerId, interactiveId),
    0,
  );

  const recovery = withAppliedSupports(["recovery"], ownerId, slowId);
  assert.ok(
    getSupportDirectionMatchupLogitAdjustment(
      recovery,
      ownerId,
      interactiveId,
    ) > 0,
  );
  assert.equal(
    getSupportDirectionMatchupLogitAdjustment(recovery, ownerId, neutralId),
    0,
  );

  const stacked = withAppliedSupports(
    [
      "counterplay",
      "finisher",
      "recovery",
      "consistency",
      "finisher",
      "recovery",
    ],
    ownerId,
    slowId,
  );
  const capped = getSupportDirectionMatchupLogitAdjustment(
    stacked,
    ownerId,
    slowId,
  );
  assert.ok(Math.abs(capped) <= SUPPORT_DIRECTION_MATCHUP_LOGIT_CAP);
  assert.equal(
    getSupportDirectionMatchupLogitAdjustment(stacked, slowId, ownerId),
    -capped,
  );
});

test("a favorable keyword and support package cannot erase a raw-power gulf", () => {
  const ownerId = "cycle";
  const targetId = "white-night";
  const state = withAppliedSupports(
    ["counterplay", "finisher", "recovery"],
    ownerId,
    targetId,
  );
  state.themes[ownerId].power = 55;
  state.themes[targetId].power = 80;

  assert.ok(
    getCurrentPairWinProbability(state, ownerId, targetId) < 0.3,
    "twenty-five raw power must outweigh every favorable strategic layer",
  );
});
