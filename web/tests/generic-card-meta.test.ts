import assert from "node:assert/strict";
import test from "node:test";

import type { GenericCardId } from "../app/game/generic-card-catalog.ts";
import {
  GENERIC_LOADOUT_SIZE,
  buildGenericMetaModel,
  selectGenericLimitThemeImpacts,
  type GenericMetaState,
  type ThemeKeywordsById,
} from "../app/game/generic-card-meta.ts";
import type {
  PowerAdjustment,
  ReleasedGenericProduct,
  RestrictionLimit,
} from "../app/game/types.ts";

interface ReleasedCardFixture {
  readonly id: GenericCardId;
  readonly adjustment?: PowerAdjustment;
}

function makeState(
  day: number,
  shares: Readonly<Record<string, number>>,
  releasedCards: readonly ReleasedCardFixture[],
  releaseDay = 10,
  genericLimits: Readonly<
    Partial<Record<GenericCardId, RestrictionLimit>>
  > = {},
): GenericMetaState {
  const products: ReleasedGenericProduct[] = releasedCards.map(
    ({ id, adjustment = 0 }, index) => ({
      optionId: `generic-fixture-${index}`,
      kind: "generic",
      genericCardId: id,
      expectedTier: "Tier 2",
      powerAdjustment: adjustment,
    }),
  );

  return {
    day,
    activeThemeIds: Object.keys(shares),
    themes: Object.fromEntries(
      Object.entries(shares).map(([themeId, share]) => [themeId, { share }]),
    ),
    releaseHistory: [{ day: releaseDay, releaseKind: "regular", products }],
    genericLimits,
  };
}

test("generic cards begin on D+1 and remain usable outside their own keyword", () => {
  const cardId = "generic-rush-enabler";
  const state = makeState(
    11,
    { sprinter: 0.5, conductor: 0.5 },
    [{ id: cardId }],
  );
  const keywords = {
    sprinter: ["rush"],
    conductor: ["tempo"],
  } as const satisfies ThemeKeywordsById;

  const releaseDay = buildGenericMetaModel(state, keywords, 10);
  assert.equal(releaseDay.cards.length, 0);
  assert.equal(releaseDay.themePowerBonusById.sprinter, 0);

  const dPlusOne = buildGenericMetaModel(state, keywords, 11);
  const card = dPlusOne.cardMetaById[cardId];
  assert.ok(card);
  assert.ok(card.researchProgress > 0);
  assert.ok(card.averageCopies > 0);
  assert.ok(card.averageCopies <= card.legalLimit);
  assert.ok(card.adoptionByTheme.sprinter > 0);
  assert.ok(card.adoptionByTheme.conductor > 0, "generic use must be universal");
  assert.ok(
    card.adoptionByTheme.sprinter > card.adoptionByTheme.conductor,
    "sharing the card keyword should improve adoption",
  );
});

test("a generic keyword creates counter pressure in both pair directions", () => {
  const state = makeState(
    60,
    { hunter: 0.5, builder: 0.5 },
    [{ id: "generic-rush-interaction" }],
    5,
  );
  const keywords = {
    hunter: ["tempo"],
    builder: ["setup"],
  } as const satisfies ThemeKeywordsById;
  const model = buildGenericMetaModel(state, keywords);

  const forward = model.getPairLogitAdjustment("hunter", "builder");
  const reverse = model.getPairLogitAdjustment("builder", "hunter");
  assert.ok(forward > 0, "rush utility should pressure a setup plan");
  assert.equal(reverse, -forward);
});

test("top themes can adopt their own counter for mirrors without a mirror logit", () => {
  const cardId = "generic-fortress-interaction";
  const state = makeState(
    60,
    { tierOne: 0.82, fringe: 0.18 },
    [{ id: cardId }],
    5,
  );
  const keywords = {
    tierOne: ["rush"],
    fringe: ["consistency"],
  } as const satisfies ThemeKeywordsById;
  const model = buildGenericMetaModel(state, keywords);
  const card = model.cardMetaById[cardId];

  assert.ok(card);
  assert.ok(card.adoptionByTheme.tierOne > 0);
  assert.ok(card.mirrorDemand > 0);
  assert.equal(model.getPairLogitAdjustment("tierOne", "tierOne"), 0);
});

test("each theme equips at most three generic cards", () => {
  const cardIds = [
    "generic-burst-payoff",
    "generic-combo-payoff",
    "generic-control-interaction",
    "generic-resilience-recovery",
  ] as const satisfies readonly GenericCardId[];
  const state = makeState(
    80,
    { pilot: 1 },
    cardIds.map((id) => ({ id })),
    5,
  );
  const model = buildGenericMetaModel(state, { pilot: ["midrange"] });

  assert.equal(model.themeLoadoutsById.pilot.length, GENERIC_LOADOUT_SIZE);
  assert.equal(
    cardIds.filter((id) => model.cardMetaById[id]?.adoptionByTheme.pilot).length,
    GENERIC_LOADOUT_SIZE,
  );
});

test("an old generic is rediscovered when a fitting theme takes the field", () => {
  const cardId = "generic-rush-enabler";
  const quietState = makeState(
    100,
    { sprinter: 0.05, conductor: 0.95 },
    [{ id: cardId }],
    5,
  );
  const rediscoveredState = makeState(
    100,
    { sprinter: 0.95, conductor: 0.05 },
    [{ id: cardId }],
    5,
  );
  const keywords = {
    sprinter: ["rush"],
    conductor: ["tempo"],
  } as const satisfies ThemeKeywordsById;

  const quiet = buildGenericMetaModel(quietState, keywords);
  const rediscovered = buildGenericMetaModel(rediscoveredState, keywords);
  assert.equal(quiet.cardMetaById[cardId]?.researchProgress, 1);
  assert.equal(rediscovered.cardMetaById[cardId]?.researchProgress, 1);
  assert.ok(
    (rediscovered.cardMetaById[cardId]?.marketReach ?? 0) >
      (quiet.cardMetaById[cardId]?.marketReach ?? 0),
  );
});

test("positive release tuning outperforms negative tuning", () => {
  const cardId = "generic-transformation-payoff";
  const keywords = {
    pilot: ["transformation"],
  } as const satisfies ThemeKeywordsById;
  const strong = buildGenericMetaModel(
    makeState(80, { pilot: 1 }, [{ id: cardId, adjustment: 3 }], 5),
    keywords,
  );
  const weak = buildGenericMetaModel(
    makeState(80, { pilot: 1 }, [{ id: cardId, adjustment: -3 }], 5),
    keywords,
  );

  assert.ok(
    (strong.cardMetaById[cardId]?.effectivePower ?? 0) >
      (weak.cardMetaById[cardId]?.effectivePower ?? 0),
  );
  assert.ok(strong.themePowerBonusById.pilot > weak.themePowerBonusById.pilot);
  assert.ok(
    (strong.cardMetaById[cardId]?.marketReach ?? 0) >
      (weak.cardMetaById[cardId]?.marketReach ?? 0),
  );
});

test("limit previews include replacement and diminishing net power loss", () => {
  const targetId = "generic-burst-payoff";
  const state = makeState(
    100,
    { pilot: 1 },
    [
      { id: targetId, adjustment: 3 },
      { id: "generic-fortress-recovery", adjustment: -3 },
      { id: "generic-attrition-recovery", adjustment: -3 },
      { id: "generic-resilience-recovery", adjustment: -3 },
    ],
    5,
  );
  const keywords = {
    pilot: ["burst"],
  } as const satisfies ThemeKeywordsById;
  const before = buildGenericMetaModel(state, keywords);
  const targetContribution =
    before.themeLoadoutsById.pilot.find((entry) => entry.cardId === targetId)
      ?.powerContribution ?? 0;
  const limited = buildGenericMetaModel(state, keywords, state.day, {
    [targetId]: 1,
  });
  const forbidden = buildGenericMetaModel(state, keywords, state.day, {
    [targetId]: 0,
  });
  const impacts = selectGenericLimitThemeImpacts(
    state,
    keywords,
    targetId,
    0,
  );
  const impact = impacts.find((entry) => entry.themeId === "pilot");

  assert.ok(targetContribution > 0);
  assert.equal(limited.cardMetaById[targetId]?.legalLimit, 1);
  assert.ok((limited.cardMetaById[targetId]?.averageCopies ?? 0) <= 1);
  assert.equal(forbidden.cardMetaById[targetId]?.averageCopies, 0);
  assert.ok(limited.themePowerBonusById.pilot < before.themePowerBonusById.pilot);
  assert.ok(impact);
  assert.equal(impact.afterAdoption, 0);
  assert.equal(impact.replacementCardIds.length, 1);
  assert.ok(impact.powerLoss > 0);
  assert.ok(
    impact.powerLoss < targetContribution,
    "the fourth card should replace part of the restricted card's contribution",
  );
});
