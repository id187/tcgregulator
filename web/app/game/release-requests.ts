import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEME_BY_ID,
} from "./content.ts";
import { getCollectorCardProfile } from "./card-collectibles.ts";
import {
  getGenericCardMarketQuote,
  getThemeCardMarketQuote,
} from "./card-market.ts";
import {
  GENERIC_CARD_CATALOG,
  getGenericCard,
  type GenericCardCatalogEntry,
} from "./generic-card-catalog.ts";
import {
  getKeywordMatchupEdgeScore,
  type PlayKeyword,
} from "./play-keywords.ts";
import type {
  GameState,
  ReleaseRequestKind,
  ReleaseRequestLane,
  SupportDirection,
  SupportRequest,
  ThemeId,
} from "./types.ts";

export type ReleaseRequestInput =
  | { kind: "support"; themeId: ThemeId; direction: SupportDirection }
  | { kind: "indirect-support"; themeId: ThemeId }
  | { kind: "environment-target"; themeId: ThemeId }
  | { kind: "reprint"; cardId: string };

export type ReprintCardKind = "theme-part" | "generic";

export type ReprintImpactPreview = {
  cardId: string;
  cardKind: ReprintCardKind;
  cardName: string;
  themeId: ThemeId | null;
  originalReleaseDay: number;
  ageDays: number;
  referencePrice: number;
  playDemandScore: number;
  collectorLabel: string | null;
  previousReprintCount: number;
  trustDelta: number;
  accessibilityUserGain: number;
  collectorUserLoss: number;
  releaseRevenueBoost: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function getReleaseRequestKind(
  request: SupportRequest,
): ReleaseRequestKind {
  return request.kind ?? "support";
}

export function getReleaseRequestLane(
  requestOrKind: SupportRequest | ReleaseRequestKind,
): ReleaseRequestLane {
  const kind = typeof requestOrKind === "string"
    ? requestOrKind
    : getReleaseRequestKind(requestOrKind);
  if (kind === "support") return "support";
  if (kind === "reprint") return "reprint";
  return "generic";
}

export function getPendingReleaseRequest(
  state: Pick<GameState, "supportRequests">,
  lane: ReleaseRequestLane,
): SupportRequest | null {
  return [...state.supportRequests]
    .reverse()
    .find(
      (request) =>
        getReleaseRequestLane(request) === lane &&
        (request.status === "queued" || request.status === "offered"),
    ) ?? null;
}

function releasedGenericIds(state: Pick<GameState, "releaseHistory">): Set<string> {
  return new Set(
    state.releaseHistory.flatMap((batch) =>
      batch.products.flatMap((product) =>
        product.kind === "generic" ? [product.genericCardId] : [],
      ),
    ),
  );
}

function sortGenericPool(
  cards: readonly GenericCardCatalogEntry[],
  score: (card: GenericCardCatalogEntry) => number,
): GenericCardCatalogEntry[] {
  return [...cards].sort(
    (left, right) =>
      score(right) - score(left) ||
      right.basePower - left.basePower ||
      left.id.localeCompare(right.id),
  );
}

/** Unreleased generic cards sharing at least one public keyword with the theme. */
export function getIndirectSupportGenericPool(
  state: Pick<GameState, "themes" | "releaseHistory">,
  themeId: ThemeId,
): GenericCardCatalogEntry[] {
  const theme = THEME_BY_ID[themeId];
  if (!theme || !state.themes[themeId]) return [];
  const released = releasedGenericIds(state);
  return sortGenericPool(
    GENERIC_CARD_CATALOG.filter(
      (card) =>
        !released.has(card.id) && theme.playKeywords.includes(card.keyword),
    ),
    (card) => theme.playKeywords.includes(card.keyword) ? 1 : 0,
  );
}

/**
 * Unreleased generic cards whose keyword has a positive directed matchup edge
 * into the selected theme. This derives from the simulation matrix, avoiding a
 * second counter table that could drift from actual matchups.
 */
export function getEnvironmentTargetGenericPool(
  state: Pick<GameState, "themes" | "releaseHistory">,
  themeId: ThemeId,
): GenericCardCatalogEntry[] {
  const theme = THEME_BY_ID[themeId];
  if (!theme || !state.themes[themeId]) return [];
  const released = releasedGenericIds(state);
  return sortGenericPool(
    GENERIC_CARD_CATALOG.filter(
      (card) =>
        !released.has(card.id) &&
        getKeywordMatchupEdgeScore([card.keyword], theme.playKeywords) > 0,
    ),
    (card) => getKeywordMatchupEdgeScore([card.keyword], theme.playKeywords),
  );
}

export function getRequestGenericPool(
  state: Pick<GameState, "themes" | "releaseHistory">,
  request: SupportRequest,
): GenericCardCatalogEntry[] {
  if (request.kind === "indirect-support") {
    return getIndirectSupportGenericPool(state, request.themeId);
  }
  if (request.kind === "environment-target") {
    return getEnvironmentTargetGenericPool(state, request.themeId);
  }
  return [];
}

export function getRequestGenericKeyword(
  request: SupportRequest,
  card: Pick<GenericCardCatalogEntry, "keyword">,
): PlayKeyword | null {
  return request.kind === "indirect-support" ||
      request.kind === "environment-target"
    ? card.keyword
    : null;
}

function findGenericReleaseDay(state: GameState, cardId: string): number | null {
  return state.releaseHistory.find((batch) =>
    batch.products.some(
      (product) => product.kind === "generic" && product.genericCardId === cardId,
    ),
  )?.day ?? null;
}

function findThemePartReleaseDay(
  state: GameState,
  themeId: ThemeId,
  cardId: string,
): number | null {
  const content = THEME_BY_ID[themeId];
  const runtime = state.themes[themeId];
  if (!content || !runtime?.releasedPartIds.includes(cardId)) return null;
  const partIndex = content.parts.findIndex((part) => part.id === cardId);
  if (partIndex < 0) return null;

  const debutDay = state.releaseHistory.find((batch) =>
    batch.products.some(
      (product) => product.kind === "new-theme" && product.themeId === themeId,
    ),
  )?.day ?? 1;
  if (partIndex < INITIAL_THEME_PART_COUNT) return debutDay;

  const waveIndex = Math.floor(
    (partIndex - INITIAL_THEME_PART_COUNT) / SUPPORT_PARTS_PER_RELEASE,
  );
  const supportDays = state.releaseHistory
    .filter((batch) =>
      batch.products.some(
        (product) => product.kind === "support" && product.themeId === themeId,
      ),
    )
    .map((batch) => batch.day)
    .sort((left, right) => left - right);
  return supportDays[waveIndex] ?? null;
}

function findThemePart(
  state: GameState,
  cardId: string,
): { themeId: ThemeId; cardName: string; releaseDay: number } | null {
  for (const themeId of state.activeThemeIds) {
    const content = THEME_BY_ID[themeId];
    const part = content?.parts.find((candidate) => candidate.id === cardId);
    if (!part) continue;
    const releaseDay = findThemePartReleaseDay(state, themeId, cardId);
    if (releaseDay === null) return null;
    return { themeId, cardName: part.name, releaseDay };
  }
  return null;
}

/** Pure read model shared by request UI, reducer snapshots, and tests. */
export function getReprintImpactPreview(
  state: GameState,
  cardId: string,
): ReprintImpactPreview | null {
  const themePart = findThemePart(state, cardId);
  const generic = getGenericCard(cardId);
  const genericReleaseDay = generic ? findGenericReleaseDay(state, cardId) : null;
  if (!themePart && (!generic || genericReleaseDay === null)) return null;

  const cardKind: ReprintCardKind = themePart ? "theme-part" : "generic";
  const themeId = themePart?.themeId ?? null;
  const originalReleaseDay = themePart?.releaseDay ?? genericReleaseDay!;
  const quote = themePart
    ? getThemeCardMarketQuote(state, themePart.themeId, cardId, 1)
    : getGenericCardMarketQuote(state, generic!, originalReleaseDay, null, 1);
  if (!quote) return null;

  const profile = getCollectorCardProfile(cardId);
  const previousReprintCount = state.releaseHistory.reduce(
    (count, batch) =>
      count + batch.products.filter(
        (product) => product.kind === "reprint" && product.cardId === cardId,
      ).length,
    0,
  );
  const ageDays = Math.max(0, state.day - originalReleaseDay);
  const recencyPenalty = clamp((120 - ageDays) / 120, 0, 1) * 3.2;
  const highPricePenalty = clamp((quote.price - 15_000) / 100_000, 0, 1) * 2.4;
  const repeatedPenalty = Math.min(3.6, previousReprintCount * 1.2);
  const collectorExposurePenalty = profile
    ? 1.8 +
      clamp((profile.collectorAppeal - 80) / 20, 0, 1) * 1.2 +
      clamp(state.users.collector / 5_000, 0, 1) * 0.9
    : 0;
  // Timely access to an old, highly played staple is still a tradeoff, but its
  // confidence cost is deliberately much smaller than a fresh premium reprint.
  const accessibilityRelief = ageDays >= 120 && quote.playDemandScore >= 65
    ? Math.min(
        2.6,
        (ageDays - 90) / 150 + (quote.playDemandScore - 60) / 24,
      )
    : 0;
  const trustLoss = clamp(
    0.35 +
      recencyPenalty +
      highPricePenalty +
      repeatedPenalty +
      collectorExposurePenalty -
      accessibilityRelief,
    0.25,
    10,
  );
  const activeUsers = state.users.tier + state.users.casual + state.users.collector;
  const accessRate =
    0.001 +
    clamp(quote.playDemandScore / 100, 0, 1) * 0.0025 +
    clamp(quote.price / 120_000, 0, 1) * 0.0015;
  const accessibilityUserGain = Math.max(1, Math.round(activeUsers * accessRate));
  const collectorExitRate = clamp(0.0008 + trustLoss * 0.0011, 0, 0.015);
  const collectorUserLoss = Math.min(
    state.users.collector,
    Math.max(0, Math.round(state.users.collector * collectorExitRate)),
  );
  const buyerRate =
    0.045 +
    clamp(quote.playDemandScore / 100, 0, 1) * 0.06 +
    clamp(quote.price / 120_000, 0, 1) * 0.045;
  const averageSpend = 34_000 + Math.min(28_000, quote.price * 0.18);
  const releaseRevenueBoost = round(
    (activeUsers * buyerRate * averageSpend) / 100_000_000,
  );

  return {
    cardId,
    cardKind,
    cardName: themePart?.cardName ?? generic!.name,
    themeId,
    originalReleaseDay,
    ageDays,
    referencePrice: quote.price,
    playDemandScore: quote.playDemandScore,
    collectorLabel: profile?.label ?? null,
    previousReprintCount,
    trustDelta: -round(trustLoss),
    accessibilityUserGain,
    collectorUserLoss,
    releaseRevenueBoost,
  };
}

export function getReprintCandidates(state: GameState): ReprintImpactPreview[] {
  const cardIds = new Set<string>();
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    for (const cardId of runtime?.releasedPartIds ?? []) cardIds.add(cardId);
  }
  for (const cardId of Object.keys(state.genericLimits)) cardIds.add(cardId);
  return [...cardIds]
    .map((cardId) => getReprintImpactPreview(state, cardId))
    .filter((candidate): candidate is ReprintImpactPreview => candidate !== null)
    .sort(
      (left, right) =>
        right.referencePrice - left.referencePrice ||
        left.cardId.localeCompare(right.cardId),
    );
}

/** Supply shock begins on D+1; premium floors are applied after this factor. */
export function getReprintSupplyMultiplier(
  state: Pick<GameState, "releaseHistory">,
  cardId: string,
  observationDay: number,
): number {
  const latestReprintDay = state.releaseHistory
    .filter(
      (batch) =>
        batch.day < observationDay &&
        batch.products.some(
          (product) => product.kind === "reprint" && product.cardId === cardId,
        ),
    )
    .map((batch) => batch.day)
    .sort((left, right) => right - left)[0];
  if (latestReprintDay === undefined) return 1;
  const elapsed = observationDay - latestReprintDay;
  return clamp(0.42 + Math.max(0, elapsed - 1) * 0.004, 0.42, 0.78);
}
