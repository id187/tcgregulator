import {
  getGenericCard,
  type GenericCardId,
} from "./generic-card-catalog.ts";
import type {
  BaselineReleaseBatch,
  ExpectedTier,
  ReleaseBatch,
} from "./types.ts";

/**
 * The three evergreen generics already on shelves when the mandate begins.
 * They form a deliberately moderate tutorial pool: one stable enabler, one
 * defensive disruption card, and one recovery card with different adoption
 * speeds. That makes the emergency DAY 0 list useful without pre-solving
 * every deck.
 */
export const INITIAL_GENERIC_CARD_IDS = Object.freeze([
  "generic-consistency-enabler",
  "generic-disruption-defense",
  "generic-resilience-recovery",
] as const satisfies readonly GenericCardId[]);

export const INITIAL_GENERIC_RELEASE_DAY = 0;

/**
 * The handover includes the two weeks of live-play observation collected
 * before DAY 0. Baseline generics therefore begin the campaign with mature
 * adoption data even though their bookkeeping release batch lives on DAY 0.
 */
export const INITIAL_GENERIC_OBSERVATION_DAYS = 14;

function expectedTierForPower(power: number): ExpectedTier {
  if (power >= 80) return "Tier 0";
  if (power >= 71) return "Tier 1";
  if (power >= 63) return "Tier 2";
  return "Tier 3";
}

export function isInitialGenericCardId(
  cardId: string,
): cardId is (typeof INITIAL_GENERIC_CARD_IDS)[number] {
  return (INITIAL_GENERIC_CARD_IDS as readonly string[]).includes(cardId);
}

/** Returns a fresh mutable batch for a new GameState. */
export function createInitialGenericReleaseBatch(): BaselineReleaseBatch {
  return {
    day: INITIAL_GENERIC_RELEASE_DAY,
    releaseKind: "baseline",
    products: INITIAL_GENERIC_CARD_IDS.map((genericCardId, index) => {
      const card = getGenericCard(genericCardId);
      if (!card) {
        throw new Error(`Missing initial generic card: ${genericCardId}.`);
      }
      return {
        optionId: `initial-generic-${index + 1}`,
        kind: "generic" as const,
        genericCardId,
        expectedTier: expectedTierForPower(card.basePower),
        powerAdjustment: 0 as const,
      };
    }),
  };
}

export function isInitialGenericReleaseBatch(
  batch: ReleaseBatch,
): batch is BaselineReleaseBatch {
  return (
    batch.day === INITIAL_GENERIC_RELEASE_DAY &&
    batch.releaseKind === "baseline" &&
    batch.products.length === INITIAL_GENERIC_CARD_IDS.length &&
    INITIAL_GENERIC_CARD_IDS.every((genericCardId) =>
      batch.products.some(
        (product) =>
          product.kind === "generic" &&
          product.genericCardId === genericCardId &&
          product.powerAdjustment === 0,
      )
    )
  );
}
