import {
  GENERIC_CARD_CATALOG,
  getGenericCard,
  type GenericCardCatalogEntry,
  type GenericCardId,
} from "./generic-card-catalog.ts";
import {
  getKeywordMatchupEdgeScore,
  type PlayKeyword,
} from "./play-keywords.ts";
import { isInitialGenericReleaseBatch } from "./initial-generic-cards.ts";
import type {
  PowerAdjustment,
  ReleaseBatch,
  RestrictionLimit,
  ThemeId,
  ThemeRuntime,
} from "./types.ts";

export const GENERIC_LOADOUT_SIZE = 3;
export const GENERIC_THEME_POWER_BONUS_CAP = 7.5;
export const GENERIC_MATCHUP_LOGIT_CAP = 0.16;

const POWER_PER_ADJUSTMENT = 2.2;
const COPY_EFFECT_BY_LIMIT: Readonly<Record<RestrictionLimit, number>> = {
  0: 0,
  1: 0.52,
  2: 0.8,
  3: 1,
};

export interface GenericMetaState {
  readonly day: number;
  readonly activeThemeIds: readonly ThemeId[];
  readonly themes: Readonly<Record<ThemeId, Pick<ThemeRuntime, "share">>>;
  readonly releaseHistory: readonly ReleaseBatch[];
  readonly genericLimits: Readonly<
    Partial<Record<GenericCardId, RestrictionLimit>>
  >;
}

export type ThemeKeywordsById = Readonly<
  Partial<Record<ThemeId, readonly PlayKeyword[]>>
>;

export type GenericLimitOverrides = Readonly<
  Partial<Record<GenericCardId, RestrictionLimit>>
>;

export interface GenericThemeLoadoutEntry {
  readonly cardId: GenericCardId;
  readonly adoption: number;
  readonly utility: number;
  readonly powerContribution: number;
  readonly sameKeyword: boolean;
  readonly counterUtility: number;
  readonly mirrorUtility: number;
}

export interface GenericCardMetaEntry {
  readonly cardId: GenericCardId;
  readonly card: GenericCardCatalogEntry;
  readonly releaseDay: number;
  readonly powerAdjustment: PowerAdjustment;
  readonly effectivePower: number;
  readonly legalLimit: RestrictionLimit;
  readonly researchProgress: number;
  /** Share-weighted adoption across the current field, from 0 to 1. */
  readonly marketReach: number;
  /** Share-weighted adoption attributable to same-theme mirror preparation. */
  readonly mirrorDemand: number;
  readonly adoptionByTheme: Readonly<Record<ThemeId, number>>;
}

export interface GenericMetaModel {
  readonly observationDay: number;
  readonly cards: readonly GenericCardMetaEntry[];
  readonly cardMetaById: Readonly<
    Partial<Record<GenericCardId, GenericCardMetaEntry>>
  >;
  readonly themePowerBonusById: Readonly<Record<ThemeId, number>>;
  readonly themeLoadoutsById: Readonly<
    Record<ThemeId, readonly GenericThemeLoadoutEntry[]>
  >;
  readonly getPairLogitAdjustment: (
    leftThemeId: ThemeId,
    rightThemeId: ThemeId,
  ) => number;
}

export interface GenericLimitThemeImpact {
  readonly themeId: ThemeId;
  readonly beforePowerBonus: number;
  readonly afterPowerBonus: number;
  /** Positive when the proposed limit removes effective power. */
  readonly powerLoss: number;
  readonly beforeAdoption: number;
  readonly afterAdoption: number;
  readonly replacementCardIds: readonly GenericCardId[];
}

interface ReleasedGenericCard {
  readonly card: GenericCardCatalogEntry;
  readonly releaseDay: number;
  readonly powerAdjustment: PowerAdjustment;
  readonly effectivePower: number;
  readonly legalLimit: RestrictionLimit;
  readonly researchProgress: number;
  readonly copyEffect: number;
  readonly fieldCounterUtility: number;
}

interface ThemeCandidate {
  readonly released: ReleasedGenericCard;
  readonly utility: number;
  readonly sameKeyword: boolean;
  readonly counterUtility: number;
  readonly mirrorUtility: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedKeywordEdge(
  cardKeyword: PlayKeyword,
  targetKeywords: readonly PlayKeyword[],
): number {
  if (targetKeywords.length === 0) return 0;
  return clamp(
    getKeywordMatchupEdgeScore([cardKeyword], targetKeywords) /
      targetKeywords.length,
    -1,
    1,
  );
}

function buildThemeShareWeights(
  state: GenericMetaState,
): Readonly<Record<ThemeId, number>> {
  const positiveShares = state.activeThemeIds.map((themeId) =>
    Math.max(0, state.themes[themeId]?.share ?? 0),
  );
  const total = positiveShares.reduce((sum, share) => sum + share, 0);
  const fallback = state.activeThemeIds.length > 0
    ? 1 / state.activeThemeIds.length
    : 0;

  return Object.freeze(
    Object.fromEntries(
      state.activeThemeIds.map((themeId, index) => [
        themeId,
        total > 0 ? positiveShares[index] / total : fallback,
      ]),
    ),
  );
}

function collectReleasedGenericCards(
  state: GenericMetaState,
  themeKeywordsById: ThemeKeywordsById,
  shareWeights: Readonly<Record<ThemeId, number>>,
  observationDay: number,
  limitOverrides: GenericLimitOverrides | undefined,
): readonly ReleasedGenericCard[] {
  const releaseByCard = new Map<
    GenericCardId,
    { releaseDay: number; powerAdjustment: PowerAdjustment }
  >();

  for (const batch of state.releaseHistory) {
    const available = isInitialGenericReleaseBatch(batch)
      ? batch.day <= observationDay
      : batch.day < observationDay;
    if (!available) continue;
    for (const product of batch.products) {
      if (product.kind !== "generic" || releaseByCard.has(product.genericCardId)) {
        continue;
      }
      releaseByCard.set(product.genericCardId, {
        releaseDay: batch.day,
        powerAdjustment: product.powerAdjustment,
      });
    }
  }

  const released: ReleasedGenericCard[] = [];
  for (const catalogCard of GENERIC_CARD_CATALOG) {
    const release = releaseByCard.get(catalogCard.id);
    if (!release) continue;

    const elapsedDays = observationDay - release.releaseDay;
    const researchProgress = clamp(
      elapsedDays / catalogCard.optimizationDays,
      0,
      1,
    );
    const legalLimit =
      limitOverrides?.[catalogCard.id] ??
      state.genericLimits[catalogCard.id] ??
      3;
    const fieldCounterUtility = state.activeThemeIds.reduce(
      (sum, themeId) =>
        sum +
        (shareWeights[themeId] ?? 0) *
          normalizedKeywordEdge(
            catalogCard.keyword,
            themeKeywordsById[themeId] ?? [],
          ),
      0,
    );

    released.push(
      Object.freeze({
        card: catalogCard,
        releaseDay: release.releaseDay,
        powerAdjustment: release.powerAdjustment,
        effectivePower:
          catalogCard.basePower +
          release.powerAdjustment * POWER_PER_ADJUSTMENT,
        legalLimit,
        researchProgress,
        copyEffect: COPY_EFFECT_BY_LIMIT[legalLimit],
        fieldCounterUtility: clamp(fieldCounterUtility, -1, 1),
      }),
    );
  }

  return Object.freeze(released);
}

function scoreThemeCandidate(
  released: ReleasedGenericCard,
  themeKeywords: readonly PlayKeyword[],
  themeShare: number,
): ThemeCandidate {
  const sameKeyword = themeKeywords.includes(released.card.keyword);
  const counterUtility = normalizedKeywordEdge(
    released.card.keyword,
    themeKeywords,
  );
  const mirrorUtility =
    Math.max(0, counterUtility) * Math.sqrt(clamp(themeShare, 0, 1));
  const strength = clamp((released.effectivePower - 50) / 40, 0, 1);
  const appeal = clamp((released.card.appeal - 50) / 45, 0, 1);
  const researchUse =
    released.researchProgress <= 0
      ? 0
      : 0.22 + 0.78 * Math.sqrt(released.researchProgress);
  const rawUtility =
    0.34 +
    0.5 * strength +
    0.12 * appeal +
    (sameKeyword ? 0.23 : 0) +
    0.3 * released.fieldCounterUtility +
    0.26 * mirrorUtility;

  return {
    released,
    utility:
      Math.max(0, rawUtility) * researchUse * released.copyEffect,
    sameKeyword,
    counterUtility,
    mirrorUtility,
  };
}

function buildThemeLoadout(
  candidates: readonly ThemeCandidate[],
): {
  readonly loadout: readonly GenericThemeLoadoutEntry[];
  readonly powerBonus: number;
} {
  const selected = candidates
    .filter(
      (candidate) =>
        candidate.released.legalLimit > 0 && candidate.utility > 0,
    )
    .sort(
      (left, right) =>
        right.utility - left.utility ||
        compareIds(left.released.card.id, right.released.card.id),
    )
    .slice(0, GENERIC_LOADOUT_SIZE);

  const loadout: GenericThemeLoadoutEntry[] = [];
  let cumulativePower = 0;
  selected.forEach((candidate, slotIndex) => {
    const adoption = clamp(
      (0.15 + candidate.utility * 0.62) * (1 - slotIndex * 0.1),
      0,
      0.98,
    );
    const baseBonus = Math.max(
      0.1,
      (candidate.released.effectivePower - 50) / 14,
    );
    const mastery = 0.3 + 0.7 * candidate.released.researchProgress;
    const affinity = candidate.sameKeyword ? 1.12 : 1;
    const diminishingReturn = Math.max(0.42, 1 - cumulativePower / 10);
    const uncappedContribution =
      baseBonus *
      mastery *
      candidate.released.copyEffect *
      (0.45 + 0.55 * adoption) *
      affinity *
      diminishingReturn;
    const powerContribution = clamp(
      uncappedContribution,
      0,
      GENERIC_THEME_POWER_BONUS_CAP - cumulativePower,
    );
    cumulativePower += powerContribution;

    loadout.push(
      Object.freeze({
        cardId: candidate.released.card.id,
        adoption: round(adoption),
        utility: round(candidate.utility),
        powerContribution: round(powerContribution),
        sameKeyword: candidate.sameKeyword,
        counterUtility: round(candidate.counterUtility),
        mirrorUtility: round(candidate.mirrorUtility),
      }),
    );
  });

  return Object.freeze({
    loadout: Object.freeze(loadout),
    powerBonus: round(cumulativePower),
  });
}

export function buildGenericMetaModel(
  state: GenericMetaState,
  themeKeywordsById: ThemeKeywordsById,
  observationDay = state.day,
  limitOverrides?: GenericLimitOverrides,
): GenericMetaModel {
  const shareWeights = buildThemeShareWeights(state);
  const releasedCards = collectReleasedGenericCards(
    state,
    themeKeywordsById,
    shareWeights,
    observationDay,
    limitOverrides,
  );
  const releasedById = new Map(
    releasedCards.map((released) => [released.card.id, released]),
  );
  const themeLoadoutsById: Record<
    ThemeId,
    readonly GenericThemeLoadoutEntry[]
  > = {};
  const themePowerBonusById: Record<ThemeId, number> = {};

  for (const themeId of state.activeThemeIds) {
    const themeKeywords = themeKeywordsById[themeId] ?? [];
    const candidates = releasedCards.map((released) =>
      scoreThemeCandidate(
        released,
        themeKeywords,
        shareWeights[themeId] ?? 0,
      ),
    );
    const result = buildThemeLoadout(candidates);
    themeLoadoutsById[themeId] = result.loadout;
    themePowerBonusById[themeId] = result.powerBonus;
  }

  const frozenLoadouts = Object.freeze(themeLoadoutsById);
  const frozenPowerBonuses = Object.freeze(themePowerBonusById);
  const cards = releasedCards.map((released) => {
    const adoptionByTheme: Record<ThemeId, number> = {};
    let marketReach = 0;
    let mirrorDemand = 0;

    for (const themeId of state.activeThemeIds) {
      const loadoutEntry = frozenLoadouts[themeId].find(
        (entry) => entry.cardId === released.card.id,
      );
      const adoption = loadoutEntry?.adoption ?? 0;
      const weightedAdoption = (shareWeights[themeId] ?? 0) * adoption;
      adoptionByTheme[themeId] = adoption;
      marketReach += weightedAdoption;
      mirrorDemand +=
        weightedAdoption * (loadoutEntry?.mirrorUtility ?? 0);
    }

    return Object.freeze({
      cardId: released.card.id,
      card: released.card,
      releaseDay: released.releaseDay,
      powerAdjustment: released.powerAdjustment,
      effectivePower: round(released.effectivePower),
      legalLimit: released.legalLimit,
      researchProgress: round(released.researchProgress),
      marketReach: round(clamp(marketReach, 0, 1)),
      mirrorDemand: round(clamp(mirrorDemand, 0, 1)),
      adoptionByTheme: Object.freeze(adoptionByTheme),
    });
  });
  const frozenCards = Object.freeze(cards);
  const cardMetaById = Object.freeze(
    Object.fromEntries(frozenCards.map((entry) => [entry.cardId, entry])),
  ) as Readonly<Partial<Record<GenericCardId, GenericCardMetaEntry>>>;

  const getPairLogitAdjustment = (
    leftThemeId: ThemeId,
    rightThemeId: ThemeId,
  ): number => {
    if (leftThemeId === rightThemeId) return 0;

    const pressureAgainst = (
      loadout: readonly GenericThemeLoadoutEntry[],
      targetKeywords: readonly PlayKeyword[],
    ): number =>
      loadout.reduce((sum, entry) => {
        const released = releasedById.get(entry.cardId);
        if (!released) return sum;
        const edge = normalizedKeywordEdge(
          released.card.keyword,
          targetKeywords,
        );
        const mastery = 0.35 + 0.65 * released.researchProgress;
        const strength = clamp((released.effectivePower - 50) / 40, 0, 1);
        const matchupWeight =
          entry.adoption *
          released.copyEffect *
          mastery *
          (0.65 + 0.35 * strength);
        return sum + edge * matchupWeight * 0.055;
      }, 0);

    const leftPressure = pressureAgainst(
      frozenLoadouts[leftThemeId] ?? [],
      themeKeywordsById[rightThemeId] ?? [],
    );
    const rightPressure = pressureAgainst(
      frozenLoadouts[rightThemeId] ?? [],
      themeKeywordsById[leftThemeId] ?? [],
    );
    return round(
      clamp(
        leftPressure - rightPressure,
        -GENERIC_MATCHUP_LOGIT_CAP,
        GENERIC_MATCHUP_LOGIT_CAP,
      ),
    );
  };

  return Object.freeze({
    observationDay,
    cards: frozenCards,
    cardMetaById,
    themePowerBonusById: frozenPowerBonuses,
    themeLoadoutsById: frozenLoadouts,
    getPairLogitAdjustment,
  });
}

export function selectGenericLimitThemeImpacts(
  state: GenericMetaState,
  themeKeywordsById: ThemeKeywordsById,
  cardId: GenericCardId,
  proposedLimit: RestrictionLimit,
  observationDay = state.day,
): readonly GenericLimitThemeImpact[] {
  if (!getGenericCard(cardId)) return Object.freeze([]);

  const before = buildGenericMetaModel(
    state,
    themeKeywordsById,
    observationDay,
  );
  const after = buildGenericMetaModel(
    state,
    themeKeywordsById,
    observationDay,
    { [cardId]: proposedLimit },
  );

  const impacts = state.activeThemeIds.map((themeId) => {
    const beforeLoadout = before.themeLoadoutsById[themeId] ?? [];
    const afterLoadout = after.themeLoadoutsById[themeId] ?? [];
    const beforeIds = new Set(beforeLoadout.map((entry) => entry.cardId));
    const beforeAdoption =
      beforeLoadout.find((entry) => entry.cardId === cardId)?.adoption ?? 0;
    const afterAdoption =
      afterLoadout.find((entry) => entry.cardId === cardId)?.adoption ?? 0;
    const beforePowerBonus = before.themePowerBonusById[themeId] ?? 0;
    const afterPowerBonus = after.themePowerBonusById[themeId] ?? 0;

    return Object.freeze({
      themeId,
      beforePowerBonus,
      afterPowerBonus,
      powerLoss: round(beforePowerBonus - afterPowerBonus),
      beforeAdoption,
      afterAdoption,
      replacementCardIds: Object.freeze(
        afterLoadout
          .map((entry) => entry.cardId)
          .filter((candidateId) => !beforeIds.has(candidateId)),
      ),
    });
  });

  return Object.freeze(
    impacts.sort(
      (left, right) =>
        right.powerLoss - left.powerLoss || compareIds(left.themeId, right.themeId),
    ),
  );
}
