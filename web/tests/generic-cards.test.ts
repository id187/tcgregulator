import assert from "node:assert/strict";
import test from "node:test";

import { getGenericCard } from "../app/game/generic-card-catalog.ts";
import {
  buildGenericMetaModel,
  type GenericMetaState,
} from "../app/game/generic-card-meta.ts";
import {
  createInitialGame,
  getCurrentGenericMetaModel,
  getCurrentPairWinProbability,
  reduceGame,
} from "../app/game/engine.ts";
import {
  PLAY_KEYWORD_IDS,
  getKeywordMatchupEdgeScore,
} from "../app/game/play-keywords.ts";
import type {
  GameState,
  PowerAdjustment,
  ReleaseOption,
  ReleaseSelection,
} from "../app/game/types.ts";

const INTEGRATION_SEED = 3;

function advanceToDay30(seed = INTEGRATION_SEED): GameState {
  const state = advanceThroughDecisions(createInitialGame(seed), 30);
  assert.equal(state.day, 30);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  return state;
}

function optionsOfKind<K extends ReleaseOption["kind"]>(
  state: GameState,
  kind: K,
): Extract<ReleaseOption, { kind: K }>[] {
  assert.ok(state.releaseSlate);
  return state.releaseSlate.options.filter(
    (option): option is Extract<ReleaseOption, { kind: K }> =>
      option.kind === kind,
  );
}

function selectionsFor(
  options: readonly ReleaseOption[],
  adjustment: PowerAdjustment = 0,
): ReleaseSelection[] {
  return options.map((option) => ({
    optionId: option.id,
    powerAdjustment: adjustment,
  }));
}

function defaultReleaseSelections(state: GameState): ReleaseSelection[] {
  assert.ok(state.releaseSlate);
  if (state.releaseSlate.releaseKind === "reprint") {
    const reprints = optionsOfKind(state, "reprint");
    assert.equal(reprints.length, 9);
    return selectionsFor(reprints.slice(0, 3), 0);
  }
  const newThemes = optionsOfKind(state, "new-theme");
  const supports = optionsOfKind(state, "support");
  const generics = optionsOfKind(state, "generic");
  assert.ok(newThemes.length >= 2 && supports.length >= 1 && generics.length >= 1);
  return selectionsFor([newThemes[0], newThemes[1], supports[0], generics[0]]);
}

function advanceThroughDecisions(state: GameState, targetDay: number): GameState {
  let next = state;
  for (let guard = 0; next.day < targetDay && guard < 100; guard += 1) {
    if (next.operations.pendingEvent) {
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: next.operations.pendingEvent.id,
        choice: "a",
      });
    } else if (next.phase === "release-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: defaultReleaseSelections(next),
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  assert.equal(next.day, targetDay);
  return next;
}

function assertNineOptionSlate(state: GameState): void {
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.releaseKind, "regular");
  assert.equal(state.releaseSlate.options.length, 9);
  assert.deepEqual(
    Object.fromEntries(
      (["new-theme", "support", "generic"] as const).map((kind) => [
        kind,
        optionsOfKind(state, kind).length,
      ]),
    ),
    { "new-theme": 3, support: 3, generic: 3 },
  );
}

function assertReprintSlate(state: GameState): void {
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.releaseKind, "reprint");
  assert.equal(state.releaseSlate.options.length, 9);
  assert.ok(state.releaseSlate.options.every((option) => option.kind === "reprint"));
  assert.equal(defaultReleaseSelections(state).length, 3);
}

function releaseOneStrongGeneric(): {
  released: GameState;
  genericOption: Extract<ReleaseOption, { kind: "generic" }>;
} {
  const atRelease = advanceToDay30();
  const newThemes = optionsOfKind(atRelease, "new-theme");
  const support = optionsOfKind(atRelease, "support")[0];
  const genericOption = optionsOfKind(atRelease, "generic")[1];
  assert.ok(support && genericOption && newThemes.length >= 2);

  const selections: ReleaseSelection[] = [
    ...selectionsFor(newThemes.slice(0, 2)),
    ...selectionsFor([support]),
    { optionId: genericOption.id, powerAdjustment: 3 },
  ];
  return {
    released: reduceGame(atRelease, { type: "SUBMIT_RELEASE", selections }),
    genericOption,
  };
}

test("DAY 30 and DAY 70 regular reviews surround the DAY 50 reprint pack", () => {
  let state = advanceToDay30();
  assertNineOptionSlate(state);
  assert.deepEqual(
    state.releaseHistory
      .filter((batch) => batch.releaseKind !== "baseline")
      .map((batch) => batch.day),
    [10],
  );

  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: defaultReleaseSelections(state),
  });
  state = advanceThroughDecisions(state, 50);
  assertReprintSlate(state);
  assert.deepEqual(
    state.releaseHistory
      .filter((batch) => batch.releaseKind !== "baseline")
      .map((batch) => batch.day),
    [10, 30],
  );
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: defaultReleaseSelections(state),
  });
  assert.equal(state.releaseHistory.at(-1)?.products.length, 3);
  assert.ok(
    state.releaseHistory.at(-1)?.products.every(
      (product) => product.kind === "reprint" && product.powerAdjustment === 0,
    ),
  );

  state = advanceThroughDecisions(state, 70);

  assertNineOptionSlate(state);
  assert.deepEqual(
    state.releaseHistory
      .filter((batch) => batch.releaseKind !== "baseline")
      .map((batch) => [batch.day, batch.releaseKind, batch.products.length]),
    [
      [10, "regular", 4],
      [30, "regular", 4],
      [50, "reprint", 3],
    ],
  );
  const day30GenericIds = new Set(
    state.releaseHistory
      .find((batch) => batch.day === 30)
      ?.products.flatMap((product) =>
        product.kind === "generic" ? [product.genericCardId] : [],
      ),
  );
  assert.ok(
    optionsOfKind(state, "generic").every(
      (option) => !day30GenericIds.has(option.genericCardId),
    ),
    "later slates must not offer an already released generic again",
  );
});

test("four-product releases require at least one option of every category", () => {
  const state = advanceToDay30();
  const newThemes = optionsOfKind(state, "new-theme");
  const supports = optionsOfKind(state, "support");
  const generics = optionsOfKind(state, "generic");

  assert.throws(
    () =>
      reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: selectionsFor([newThemes[0], supports[0], generics[0]]),
      }),
    /Exactly 4 release options/,
  );
  for (const missingCategory of [
    [newThemes[0], newThemes[1], newThemes[2], supports[0]],
    [newThemes[0], newThemes[1], newThemes[2], generics[0]],
    [supports[0], supports[1], supports[2], generics[0]],
  ]) {
    assert.throws(
      () =>
        reduceGame(state, {
          type: "SUBMIT_RELEASE",
          selections: selectionsFor(missingCategory),
        }),
      /at least one new theme, support, and generic card/,
    );
  }

  const released = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: defaultReleaseSelections(state),
  });
  const products = released.releaseHistory.at(-1)?.products;
  assert.equal(products?.length, 4);
  assert.ok(
    (["new-theme", "support", "generic"] as const).every((kind) =>
      products?.some((product) => product.kind === kind),
    ),
  );
});

test("a released generic becomes legal on D+1 and can displace the baseline pool as it is learned", () => {
  const { released, genericOption } = releaseOneStrongGeneric();
  assert.equal(released.genericLimits[genericOption.genericCardId], undefined);
  assert.equal(
    getCurrentGenericMetaModel(released).cardMetaById[genericOption.genericCardId],
    undefined,
    "same-day release choices must not affect the live field",
  );

  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(observed.day, 31);
  assert.equal(observed.genericLimits[genericOption.genericCardId], 3);
  const meta = getCurrentGenericMetaModel(observed);
  const cardMeta = meta.cardMetaById[genericOption.genericCardId];
  assert.ok(cardMeta);
  assert.equal(cardMeta.legalLimit, 3);
  assert.ok(cardMeta.researchProgress > 0);

  const card = getGenericCard(genericOption.genericCardId);
  assert.ok(card);
  const optimized = advanceThroughDecisions(
    observed,
    30 + card.optimizationDays,
  );
  const optimizedMeta = getCurrentGenericMetaModel(optimized);
  const optimizedCardMeta = optimizedMeta.cardMetaById[genericOption.genericCardId];
  assert.ok(optimizedCardMeta);
  assert.equal(optimizedCardMeta.researchProgress, 1);
  assert.ok(optimizedCardMeta.marketReach > 0);

  for (const themeId of optimized.activeThemeIds) {
    const loadout = optimizedMeta.themeLoadoutsById[themeId];
    const equipped = loadout.find(
      (entry) => entry.cardId === genericOption.genericCardId,
    );
    assert.ok(equipped, `${themeId} should be allowed to equip the generic`);
    assert.ok(equipped.adoption > 0);
    assert.ok(optimizedCardMeta.adoptionByTheme[themeId] > 0);
  }
  assert.equal(
    getCurrentPairWinProbability(
      optimized,
      optimized.currentTopThemeId,
      optimized.currentTopThemeId,
      optimizedMeta,
    ),
    0.5,
    "mirror preparation may create demand, but cannot tilt a mirror pairing",
  );
});

test("matching a generic keyword grants synergy without changing mirror odds", () => {
  const { genericOption } = releaseOneStrongGeneric();
  const card = getGenericCard(genericOption.genericCardId);
  assert.ok(card);
  const comparisonKeyword = PLAY_KEYWORD_IDS.find(
    (keyword) =>
      keyword !== card.keyword &&
      getKeywordMatchupEdgeScore([card.keyword], [keyword]) <= 0,
  );
  assert.ok(comparisonKeyword);

  const matchingTheme = "generic-keyword-match";
  const comparisonTheme = "generic-keyword-comparison";
  const fixture: GenericMetaState = {
    day: 31,
    activeThemeIds: [matchingTheme, comparisonTheme],
    themes: {
      [matchingTheme]: { share: 0.5 },
      [comparisonTheme]: { share: 0.5 },
    },
    releaseHistory: [
      {
        day: 30,
        releaseKind: "regular",
        products: [
          {
            optionId: genericOption.id,
            kind: "generic",
            genericCardId: genericOption.genericCardId,
            expectedTier: genericOption.expectedTier,
            powerAdjustment: 3,
          },
        ],
      },
    ],
    genericLimits: { [genericOption.genericCardId]: 3 },
  };
  const meta = buildGenericMetaModel(fixture, {
    [matchingTheme]: [card.keyword],
    [comparisonTheme]: [comparisonKeyword],
  });
  const matchingEntry = meta.themeLoadoutsById[matchingTheme][0];
  const comparisonEntry = meta.themeLoadoutsById[comparisonTheme][0];

  assert.ok(matchingEntry && comparisonEntry);
  assert.equal(matchingEntry.sameKeyword, true);
  assert.equal(comparisonEntry.sameKeyword, false);
  assert.ok(matchingEntry.utility > comparisonEntry.utility);
  assert.ok(matchingEntry.adoption > comparisonEntry.adoption);
  assert.ok(matchingEntry.powerContribution > comparisonEntry.powerContribution);
  assert.equal(meta.getPairLogitAdjustment(matchingTheme, matchingTheme), 0);
});

test("+3 tuning raises either product while a learned generic reaches beyond one theme", () => {
  const state = advanceToDay30();
  const newThemes = optionsOfKind(state, "new-theme");
  const support = optionsOfKind(state, "support")[0];
  const generics = optionsOfKind(state, "generic");
  const common = [newThemes[0], support, generics[0]];
  const strongTheme = newThemes[1];
  const strongGeneric = generics[1];
  assert.ok(support && strongTheme && strongGeneric);
  assert.equal(strongGeneric.expectedTier, strongTheme.expectedTier);
  assert.ok(Math.abs(strongGeneric.expectedPower - strongTheme.expectedPower) <= 3);

  const genericRelease = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [
      ...selectionsFor(common),
      { optionId: strongGeneric.id, powerAdjustment: 3 },
    ],
  });
  const themeRelease = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [
      ...selectionsFor(common),
      { optionId: strongTheme.id, powerAdjustment: 3 },
    ],
  });
  const neutralGenericRelease = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [
      ...selectionsFor(common),
      { optionId: strongGeneric.id, powerAdjustment: 0 },
    ],
  });
  const neutralThemeRelease = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: [
      ...selectionsFor(common),
      { optionId: strongTheme.id, powerAdjustment: 0 },
    ],
  });

  assert.ok(genericRelease.finance.today > neutralGenericRelease.finance.today);
  assert.ok(themeRelease.finance.today > neutralThemeRelease.finance.today);

  const genericCard = getGenericCard(strongGeneric.genericCardId);
  assert.ok(genericCard);

  const genericObserved = advanceThroughDecisions(
    genericRelease,
    30 + genericCard.optimizationDays,
  );
  const themeObserved = advanceThroughDecisions(
    themeRelease,
    30 + genericCard.optimizationDays,
  );
  const genericReach = getCurrentGenericMetaModel(genericObserved)
    .cardMetaById[strongGeneric.genericCardId]?.marketReach;
  assert.ok(genericReach !== undefined);
  assert.ok(
    genericReach > themeObserved.themes[strongTheme.themeId].share,
    "the generic should draw demand across more of the field than one theme's share",
  );
});

test("generic restrictions persist globally and immediately reduce purchase trust", () => {
  const strongGenericRelease = releaseOneStrongGeneric();
  let released = strongGenericRelease.released;
  const genericOption = strongGenericRelease.genericOption;
  released = advanceThroughDecisions(released, 80);
  assert.equal(released.day, 80);
  assert.equal(released.phase, "ban-edit");
  assert.equal(released.genericLimits[genericOption.genericCardId], 3);
  const trustBefore = released.purchaseTrust;

  const restricted = reduceGame(released, {
    type: "SUBMIT_BAN",
    changes: { [genericOption.genericCardId]: 0 },
  });
  assert.equal(restricted.genericLimits[genericOption.genericCardId], 0);
  assert.ok(restricted.purchaseTrust < trustBefore);
  assert.ok(
    restricted.community.some(
      (event) =>
        event.day === 80 &&
        event.type === "restriction-applied" &&
        event.genericCardId === genericOption.genericCardId &&
        event.previousValue === 3 &&
        event.value === 0,
    ),
  );
});
