import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { THEMES } from "../app/game/content.ts";
import {
  createInitialGame,
  getCounterplaySupportMatchupLogitAdjustment,
  getPairWinProbability,
  reduceGame,
} from "../app/game/engine.ts";
import {
  KEYWORD_MATCHUP_LOGIT_CAP,
  PLAY_KEYWORD_CATALOG,
  PLAY_KEYWORD_IDS,
  PLAY_KEYWORDS_PER_THEME,
  derivePlayKeywords,
  getKeywordMatchupLogitAdjustment,
  getPlayKeyword,
  type ThemePlayKeywords,
} from "../app/game/play-keywords.ts";

function reachDay10Review(seed: number) {
  let state = createInitialGame(seed);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 3 });
  assert.equal(state.day, 9);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(state.day, 10);
  assert.equal(state.phase, "release-edit");
  return state;
}

test("every theme exposes exactly three stable, displayable play keywords", () => {
  assert.equal(PLAY_KEYWORD_IDS.length, 24);
  assert.equal(
    new Set(PLAY_KEYWORD_IDS.map((keyword) => getPlayKeyword(keyword).label)).size,
    PLAY_KEYWORD_IDS.length,
    "public keyword labels must remain distinct",
  );
  assert.equal(THEMES.length, 150);
  const usedKeywords = new Set<string>();
  const keywordCounts = new Map(PLAY_KEYWORD_IDS.map((keyword) => [keyword, 0]));
  for (const theme of THEMES) {
    assert.equal(theme.playKeywords.length, PLAY_KEYWORDS_PER_THEME, theme.id);
    assert.equal(new Set(theme.playKeywords).size, PLAY_KEYWORDS_PER_THEME, theme.id);
    assert.deepEqual(theme.playKeywords, derivePlayKeywords(theme), theme.id);
    assert.deepEqual(
      derivePlayKeywords({ ...theme, parts: theme.parts.map((part) => ({ ...part })) }),
      theme.playKeywords,
      `${theme.id}/cloned authored content must derive identically`,
    );
    for (const keyword of theme.playKeywords) {
      usedKeywords.add(keyword);
      keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1);
      assert.ok(Object.hasOwn(PLAY_KEYWORD_CATALOG, keyword), `${theme.id}/${keyword}`);
      const display = getPlayKeyword(keyword);
      assert.ok(display.label.length > 0, `${theme.id}/${keyword}/label`);
      assert.ok(display.description.length > 0, `${theme.id}/${keyword}/description`);
      assert.doesNotMatch(
        display.description,
        /유리|불리|상성|카운터|잘 잡|약점/,
        `${theme.id}/${keyword}/public copy must not reveal matchup edges`,
      );
    }
  }
  assert.deepEqual(
    [...usedKeywords].sort(),
    [...PLAY_KEYWORD_IDS].sort(),
    "every public keyword should describe at least one current theme",
  );
  const distribution = [...keywordCounts.values()];
  assert.ok(Math.min(...distribution) >= 5, "no keyword should be a token rarity");
  assert.ok(Math.max(...distribution) <= 40, "no keyword should dominate the catalog");
});

test("keyword matchup pressure is inverse, neutral against itself, and capped", () => {
  const proactive = ["rush", "combo", "burst"] as const;
  const developing = ["setup", "fortress", "resilience"] as const;
  const forward = getKeywordMatchupLogitAdjustment(proactive, developing);
  const reverse = getKeywordMatchupLogitAdjustment(developing, proactive);

  assert.ok(forward >= 0.16, "the authored interaction should be material");
  assert.equal(reverse, -forward);
  assert.equal(getKeywordMatchupLogitAdjustment(proactive, proactive), 0);
  assert.ok(Math.abs(forward) <= KEYWORD_MATCHUP_LOGIT_CAP);

  for (const left of PLAY_KEYWORD_IDS) {
    let hasAuthoredInteraction = false;
    for (const right of PLAY_KEYWORD_IDS) {
      const oneWay = getKeywordMatchupLogitAdjustment([left], [right]);
      const inverse = getKeywordMatchupLogitAdjustment([right], [left]);
      assert.ok(
        Math.abs(oneWay + inverse) < 1e-12,
        `${left}/${right} must be exactly inverse`,
      );
      assert.ok(Math.abs(oneWay) <= KEYWORD_MATCHUP_LOGIT_CAP);
      if (oneWay !== 0) hasAuthoredInteraction = true;
    }
    assert.ok(hasAuthoredInteraction, `${left} must participate in the matchup graph`);
  }

  for (const left of THEMES) {
    for (const right of THEMES) {
      const adjustment = getKeywordMatchupLogitAdjustment(
        left.playKeywords,
        right.playKeywords,
      );
      assert.ok(Math.abs(adjustment) <= KEYWORD_MATCHUP_LOGIT_CAP + 1e-12);
    }
  }
});

test("keywords move equal-power matchups while a raw-power lead can overcome them", () => {
  const futureThemes = THEMES.slice(10);
  let selected:
    | { left: (typeof THEMES)[number]; right: (typeof THEMES)[number]; adjustment: number }
    | undefined;
  for (const left of futureThemes) {
    for (const right of futureThemes) {
      const adjustment = getKeywordMatchupLogitAdjustment(
        left.playKeywords,
        right.playKeywords,
      );
      if (!selected || adjustment > selected.adjustment) {
        selected = { left, right, adjustment };
      }
    }
  }
  assert.ok(selected && selected.adjustment >= 0.16);

  // Every theme starts from the same 50% baseline, so equal raw power isolates
  // the keyword layer.
  const equalPower = getPairWinProbability(
    selected.left.id,
    selected.right.id,
    70,
    70,
  );
  const reverseEqualPower = getPairWinProbability(
    selected.right.id,
    selected.left.id,
    70,
    70,
  );
  assert.ok(equalPower >= 0.54);
  assert.ok(equalPower <= 0.58 + 1e-9);
  assert.ok(Math.abs(equalPower + reverseEqualPower - 1) < 1e-12);

  const outPowered = getPairWinProbability(
    selected.left.id,
    selected.right.id,
    70,
    82,
  );
  assert.ok(outPowered < 0.5, "twelve raw power must overcome the keyword edge");
});

test("counterplay support targets the leader recorded on its release day", () => {
  const review = reachDay10Review(90_041);
  const state = reduceGame(review, {
    type: "SUBMIT_RELEASE",
    selections: getAutomaticReleaseSelections(review),
  });
  const releaseDay = state.history.find((entry) => entry.day === 10);
  assert.ok(releaseDay);
  const leaderId = releaseDay.topThemeId;
  const counterThemeId = state.activeThemeIds.find((themeId) => themeId !== leaderId);
  const unrelatedThemeId = state.activeThemeIds.find(
    (themeId) => themeId !== leaderId && themeId !== counterThemeId,
  );
  assert.ok(counterThemeId && unrelatedThemeId);

  const batch = state.releaseHistory.find(
    (candidate) => candidate.day === releaseDay.day,
  );
  assert.ok(batch);
  batch.products = [
    {
      optionId: "counterplay-keyword-fixture",
      kind: "support",
      themeId: counterThemeId,
      expectedTier: "Tier 2",
      powerAdjustment: 0,
      direction: "counterplay",
    },
  ];
  assert.equal(
    getCounterplaySupportMatchupLogitAdjustment(
      state,
      counterThemeId,
      leaderId,
    ),
    0,
    "a confirmed support is not live until the next day",
  );
  state.day = releaseDay.day + 1;

  const targeted = getCounterplaySupportMatchupLogitAdjustment(
    state,
    counterThemeId,
    leaderId,
  );
  assert.equal(targeted, 0.12);
  assert.equal(
    getCounterplaySupportMatchupLogitAdjustment(
      state,
      leaderId,
      counterThemeId,
    ),
    -targeted,
  );
  assert.equal(
    getCounterplaySupportMatchupLogitAdjustment(
      state,
      counterThemeId,
      unrelatedThemeId,
    ),
    0,
  );

  const baseline = getPairWinProbability(
    counterThemeId,
    leaderId,
    70,
    70,
  );
  const teched = getPairWinProbability(
    counterThemeId,
    leaderId,
    70,
    70,
    0,
    0,
    targeted,
  );
  assert.ok(teched - baseline >= 0.02);
});

test("keyword interactions flow through win rates into next-day meta shares", () => {
  const activeThemes = THEMES.slice(0, 5);
  const originals = activeThemes.map((theme) => theme.playKeywords);
  const neutralKeywords: ThemePlayKeywords = ["rush", "combo", "burst"];
  const neutralStart = createInitialGame(73_001);
  const keywordStart = createInitialGame(73_001);
  let neutral;

  try {
    for (const theme of activeThemes) theme.playKeywords = neutralKeywords;
    neutral = reduceGame(neutralStart, {
      type: "ADVANCE_DAYS",
      days: 1,
    });
  } finally {
    activeThemes.forEach((theme, index) => {
      theme.playKeywords = originals[index];
    });
  }

  const keywordDriven = reduceGame(keywordStart, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const winRateMovement = activeThemes.map((theme) =>
    Math.abs(
      keywordDriven.themes[theme.id].winRate - neutral.themes[theme.id].winRate,
    ),
  );
  const shareMovement = activeThemes.map((theme) =>
    Math.abs(
      keywordDriven.themes[theme.id].share - neutral.themes[theme.id].share,
    ),
  );

  assert.ok(Math.max(...winRateMovement) >= 0.005);
  assert.ok(Math.max(...shareMovement) >= 0.00005);
});
