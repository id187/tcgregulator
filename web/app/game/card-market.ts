import { THEME_BY_ID } from "./content.ts";
import { getCollectorCardProfile } from "./card-collectibles.ts";
import type {
  GenericCardCatalogEntry,
  GenericCardId,
} from "./generic-card-catalog.ts";
import type { GenericCardMetaEntry } from "./generic-card-meta.ts";
import { FIRST_BAN_DAY } from "./campaign.ts";
import {
  INITIAL_GENERIC_RELEASE_DAY,
  isInitialGenericCardId,
} from "./initial-generic-cards.ts";
import type {
  GameState,
  PartContent,
  PartRole,
  RestrictionLimit,
  ThemeId,
} from "./types.ts";

export type CardDemandBand = "폭발" | "높음" | "보통" | "낮음";

export type CardMarketQuote = {
  cardId: string;
  price: number;
  previousPrice: number;
  changeRate: number;
  demandScore: number;
  demandBand: CardDemandBand;
  playDemandScore: number;
  collectorDemandScore: number;
  collectorLabel: string | null;
  asOfDay: number;
  comparisonDay: number;
  drivers: readonly string[];
};

const ROLE_BASE_PRICE: Readonly<Record<PartRole, number>> = {
  starter1: 8_500,
  starter2: 7_200,
  bridge: 6_200,
  finisher: 15_000,
  recursion: 9_800,
};

const LIMIT_PRICE_FACTOR: Readonly<Record<RestrictionLimit, number>> = {
  0: 0.18,
  1: 0.58,
  2: 0.82,
  3: 1,
};

/**
 * A no-change list briefly removes the risk discount around the card singled
 * out by the restriction board. Each quote is derived from the decision event
 * instead of mutating a stored price, so the relief rally cannot compound.
 */
const NO_CHANGE_RELIEF_PRICE_FACTOR_BY_AGE: Readonly<
  Partial<Record<number, number>>
> = {
  1: 1.14,
  2: 1.07,
  3: 1.03,
};

const NO_CHANGE_RELIEF_DEMAND_BONUS_BY_AGE: Readonly<
  Partial<Record<number, number>>
> = {
  1: 10,
  2: 5,
  3: 2,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundPrice(value: number): number {
  return Math.max(100, Math.round(value / 100) * 100);
}

function reprintSupplyMultiplier(
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

function historyAtOrBefore(state: GameState, day: number) {
  return [...state.history].reverse().find((entry) => entry.day <= day);
}

function noChangeReliefAtDay(
  state: GameState,
  themeId: ThemeId,
  cardId: string,
  day: number,
) {
  return state.community
    .filter((event) => {
      const age = day - event.day;
      return (
        event.type === "restriction-no-change" &&
        event.themeId === themeId &&
        event.partId === cardId &&
        NO_CHANGE_RELIEF_PRICE_FACTOR_BY_AGE[age] !== undefined
      );
    })
    .sort(
      (left, right) => right.day - left.day || left.id.localeCompare(right.id),
    )[0] ?? null;
}

function restrictionLimitAtDay(
  state: GameState,
  cardId: string,
  day: number,
  currentLimit: RestrictionLimit,
): RestrictionLimit {
  const changes = state.community
    .filter(
      (event) =>
        event.day < day &&
        event.type === "restriction-applied" &&
        (event.partId === cardId || event.genericCardId === cardId) &&
        typeof event.value === "number",
    )
    .sort((left, right) => right.day - left.day || right.id.localeCompare(left.id));
  const latest = changes[0]?.value;
  if (latest === 0 || latest === 1 || latest === 2 || latest === 3) {
    return latest;
  }

  const firstLaterChange = state.community
    .filter(
      (event) =>
        event.day >= day &&
        event.type === "restriction-applied" &&
        (event.partId === cardId || event.genericCardId === cardId) &&
        typeof event.previousValue === "number",
    )
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id))[0];
  const previous = firstLaterChange?.previousValue;
  return previous === 0 || previous === 1 || previous === 2 || previous === 3
    ? previous
    : currentLimit;
}

function demandBand(score: number): CardDemandBand {
  if (score >= 82) return "폭발";
  if (score >= 64) return "높음";
  if (score >= 38) return "보통";
  return "낮음";
}

function makeQuote(
  cardId: string,
  asOfDay: number,
  comparisonDay: number,
  current: { price: number; demand: number; playDemand?: number; collectorDemand?: number },
  previous: { price: number; demand: number; playDemand?: number; collectorDemand?: number },
  drivers: readonly string[],
  collectorLabel: string | null = null,
): CardMarketQuote {
  const price = roundPrice(current.price);
  const previousPrice = roundPrice(previous.price);
  const changeRate = previousPrice > 0
    ? ((price - previousPrice) / previousPrice) * 100
    : 0;
  const demandScore = Math.round(clamp(current.demand, 0, 100));
  return {
    cardId,
    price,
    previousPrice,
    changeRate: Math.round(changeRate * 10) / 10,
    demandScore,
    demandBand: demandBand(demandScore),
    playDemandScore: Math.round(clamp(current.playDemand ?? current.demand, 0, 100)),
    collectorDemandScore: Math.round(clamp(current.collectorDemand ?? 0, 0, 100)),
    collectorLabel,
    asOfDay,
    comparisonDay,
    drivers,
  };
}

function themePartBaseSnapshot(
  state: GameState,
  themeId: ThemeId,
  part: PartContent,
  day: number,
): {
  price: number;
  demand: number;
  playDemand?: number;
  collectorDemand?: number;
} {
  const theme = THEME_BY_ID[themeId];
  const runtime = state.themes[themeId];
  const history = historyAtOrBefore(state, day);
  const share = history?.shares[themeId] ?? runtime.share;
  const winRate = history?.winRates?.[themeId] ?? runtime.winRate;
  const topCutTotal = history?.topCutPlacements
    ? Object.values(history.topCutPlacements).reduce((sum, value) => sum + value, 0)
    : 0;
  const topCutShare = topCutTotal > 0
    ? (history?.topCutPlacements?.[themeId] ?? 0) / topCutTotal
    : share;
  const stats = runtime.partStats[part.id] ?? {
    usageRate: part.inclusion,
    averageCopies: part.averageCopies,
  };
  const currentLimit = runtime.legalLimits[part.id] ?? 3;
  const limit = restrictionLimitAtDay(state, part.id, day, currentLimit);
  const copies = Math.min(stats.averageCopies, limit);
  const fieldDemand = share * stats.usageRate * Math.max(0.25, copies);
  const competitivePull = topCutShare * (0.55 + winRate * 0.9);
  const appeal = (theme?.appeal ?? 50) / 100;
  const demand = clamp(
    8 + fieldDemand * 245 + competitivePull * 100 + appeal * 18,
    0,
    100,
  );
  const price =
    ROLE_BASE_PRICE[part.role] *
    (0.48 + demand / 64) *
    LIMIT_PRICE_FACTOR[limit] *
    reprintSupplyMultiplier(state, part.id, day);
  const collector = getCollectorCardProfile(part.id);
  if (!collector) return { price, demand, playDemand: demand, collectorDemand: 0 };
  const collectorAudience = clamp(state.users.collector / 4_500, 0, 1.25);
  const collectorDemand = clamp(
    collector.collectorAppeal * (0.78 + collectorAudience * 0.22),
    0,
    100,
  );
  const collectorFloor =
    collector.priceFloor * (0.86 + collectorAudience * 0.22);
  return {
    price: Math.max(price, collectorFloor),
    demand: Math.max(demand, collectorDemand),
    playDemand: demand,
    collectorDemand,
  };
}

function themePartSnapshot(
  state: GameState,
  themeId: ThemeId,
  part: PartContent,
  day: number,
): {
  price: number;
  demand: number;
  playDemand?: number;
  collectorDemand?: number;
} {
  const base = themePartBaseSnapshot(state, themeId, part, day);
  const reliefEvent = noChangeReliefAtDay(state, themeId, part.id, day);
  if (!reliefEvent) return base;

  const age = day - reliefEvent.day;
  const priceFactor = NO_CHANGE_RELIEF_PRICE_FACTOR_BY_AGE[age];
  const demandBonus = NO_CHANGE_RELIEF_DEMAND_BONUS_BY_AGE[age];
  if (priceFactor === undefined || demandBonus === undefined) return base;

  const decisionDay = themePartBaseSnapshot(
    state,
    themeId,
    part,
    reliefEvent.day,
  );
  const demand = clamp(
    Math.max(base.demand, decisionDay.demand + demandBonus),
    0,
    100,
  );
  return {
    ...base,
    price: Math.max(base.price, decisionDay.price * priceFactor),
    demand,
    playDemand: clamp(
      Math.max(
        base.playDemand ?? base.demand,
        (decisionDay.playDemand ?? decisionDay.demand) + demandBonus,
      ),
      0,
      100,
    ),
  };
}

export function getThemeCardMarketQuoteAtDay(
  state: GameState,
  themeId: ThemeId,
  partId: string,
  observationDay: number,
  lookbackDays = 1,
): CardMarketQuote | null {
  const theme = THEME_BY_ID[themeId];
  const runtime = state.themes[themeId];
  const part = theme?.parts.find((candidate) => candidate.id === partId);
  if (!theme || !runtime || !part || !runtime.releasedPartIds.includes(partId)) {
    return null;
  }
  const asOfDay = Math.max(
    FIRST_BAN_DAY,
    Math.min(state.day, Math.floor(observationDay)),
  );
  const comparisonDay = Math.max(
    FIRST_BAN_DAY,
    asOfDay - Math.max(1, lookbackDays),
  );
  const current = themePartSnapshot(state, themeId, part, asOfDay);
  const previous = themePartSnapshot(state, themeId, part, comparisonDay);
  const stats = runtime.partStats[partId];
  const collector = getCollectorCardProfile(partId);
  const noChangeRelief = noChangeReliefAtDay(
    state,
    themeId,
    partId,
    asOfDay,
  );
  const drivers = [
    `테마 채용 ${(runtime.share * 100).toFixed(1)}%`,
    `카드 채용 ${Math.round((stats?.usageRate ?? part.inclusion) * 100)}%`,
    `평균 ${(stats?.averageCopies ?? part.averageCopies).toFixed(1)}장`,
    `${["금지", "제한", "준제한", "무제한"][runtime.legalLimits[partId] ?? 3]}`,
    ...(noChangeRelief ? ["금제 회피 안도 매수"] : []),
    ...(collector ? [`${collector.label} · 컬렉터 수요`] : []),
  ];
  return makeQuote(
    partId,
    asOfDay,
    comparisonDay,
    current,
    previous,
    drivers,
    collector?.label ?? null,
  );
}

export function getThemeCardMarketQuote(
  state: GameState,
  themeId: ThemeId,
  partId: string,
  lookbackDays = 7,
): CardMarketQuote | null {
  return getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    partId,
    state.day,
    lookbackDays,
  );
}

function genericSnapshot(
  state: GameState,
  card: GenericCardCatalogEntry,
  releaseDay: number,
  currentLimit: RestrictionLimit,
  currentMarketReach: number,
  day: number,
): { price: number; demand: number } {
  const elapsed = Math.max(0, day - releaseDay);
  const research = clamp(elapsed / Math.max(1, card.optimizationDays), 0, 1);
  const limit = restrictionLimitAtDay(state, card.id, day, currentLimit);
  const historicalReach = currentMarketReach * (0.35 + research * 0.65);
  const demand = clamp(
    10 + historicalReach * 130 + card.appeal * 0.28 + card.basePower * 0.18,
    0,
    100,
  );
  const roleFactor = card.role === "payoff"
    ? 1.45
    : card.role === "interaction" || card.role === "enabler"
      ? 1.18
      : 1;
  const price =
    7_500 *
    roleFactor *
    (0.5 + demand / 62) *
    LIMIT_PRICE_FACTOR[limit] *
    (1.12 - Math.min(0.22, elapsed / 500)) *
    reprintSupplyMultiplier(state, card.id, day);
  return { price, demand };
}

export function getGenericCardMarketQuote(
  state: GameState,
  card: GenericCardCatalogEntry,
  releaseDay: number,
  meta: GenericCardMetaEntry | null,
  lookbackDays = 7,
): CardMarketQuote {
  const currentLimit = state.genericLimits[card.id as GenericCardId] ?? 3;
  const marketReach = meta?.marketReach ?? 0;
  const firstMarketDay =
    releaseDay === INITIAL_GENERIC_RELEASE_DAY &&
      isInitialGenericCardId(card.id)
      ? INITIAL_GENERIC_RELEASE_DAY
      : releaseDay + 1;
  const comparisonDay = Math.min(
    state.day,
    Math.max(firstMarketDay, state.day - Math.max(1, lookbackDays)),
  );
  const current = genericSnapshot(
    state,
    card,
    releaseDay,
    currentLimit,
    marketReach,
    state.day,
  );
  const previous = genericSnapshot(
    state,
    card,
    releaseDay,
    currentLimit,
    marketReach,
    comparisonDay,
  );
  return makeQuote(
    card.id,
    state.day,
    comparisonDay,
    current,
    previous,
    [
      `환경 채용 ${Math.round(marketReach * 100)}%`,
      `파워 ${Math.round(meta?.effectivePower ?? card.basePower)}`,
      `화제성 ${card.appeal}`,
      `${["금지", "제한", "준제한", "무제한"][currentLimit]}`,
    ],
  );
}

export type CardMarketMover = CardMarketQuote & {
  cardName: string;
  themeId: ThemeId;
};

export type RestrictionMarketImpact = CardMarketMover & {
  decisionDay: number;
  kind: "restriction-drop" | "no-change-relief";
  reactionLabel: "금제 적용 매도" | "금제 회피 안도 매수";
  sourceEventId: string;
};

export function getThemeCardMarketMovers(
  state: GameState,
  minimumAbsoluteChange = 12,
): CardMarketMover[] {
  const movers: CardMarketMover[] = [];
  for (const themeId of state.activeThemeIds) {
    const theme = THEME_BY_ID[themeId];
    const runtime = state.themes[themeId];
    if (!theme || !runtime) continue;
    for (const partId of runtime.releasedPartIds) {
      const part = theme.parts.find((candidate) => candidate.id === partId);
      const quote = getThemeCardMarketQuote(state, themeId, partId);
      if (!part || !quote || Math.abs(quote.changeRate) < minimumAbsoluteChange) {
        continue;
      }
      movers.push({ ...quote, cardName: part.name, themeId });
    }
  }
  return movers.sort(
    (left, right) =>
      Math.abs(right.changeRate) - Math.abs(left.changeRate) ||
      left.cardId.localeCompare(right.cardId),
  );
}

/**
 * Returns the theme-card market beat caused by yesterday's restriction review.
 * Applied cuts choose the actual target with the steepest one-day decline. A
 * no-change list returns its deterministic at-risk survivor and its relief bid.
 */
export function getNextDayRestrictionMarketImpact(
  state: GameState,
  observationDay = state.day,
): RestrictionMarketImpact | null {
  if (
    !Number.isInteger(observationDay) ||
    observationDay < FIRST_BAN_DAY + 1 ||
    observationDay > state.day
  ) {
    return null;
  }
  const decisionDay = observationDay - 1;
  const applied = state.community
    .filter(
      (event) =>
        event.day === decisionDay &&
        event.type === "restriction-applied" &&
        event.genericCardId === undefined &&
        typeof event.partId === "string" &&
        typeof event.value === "number" &&
        typeof event.previousValue === "number" &&
        event.value < event.previousValue,
    )
    .flatMap((event) => {
      const theme = THEME_BY_ID[event.themeId];
      const runtime = state.themes[event.themeId];
      const part = theme?.parts.find((candidate) => candidate.id === event.partId);
      if (
        !theme ||
        !runtime ||
        !part ||
        !runtime.releasedPartIds.includes(part.id)
      ) {
        return [];
      }
      const quote = getThemeCardMarketQuoteAtDay(
        state,
        event.themeId,
        part.id,
        observationDay,
        1,
      );
      if (!quote) return [];
      return [{ event, part, quote }];
    })
    .sort(
      (left, right) =>
        left.quote.changeRate - right.quote.changeRate ||
        left.part.id.localeCompare(right.part.id) ||
        left.event.id.localeCompare(right.event.id),
    )[0];
  if (applied) {
    return {
      ...applied.quote,
      cardName: applied.part.name,
      themeId: applied.event.themeId,
      decisionDay,
      kind: "restriction-drop",
      reactionLabel: "금제 적용 매도",
      sourceEventId: applied.event.id,
    };
  }

  const survivor = state.community
    .filter(
      (event) =>
        event.day === decisionDay &&
        event.type === "restriction-no-change" &&
        typeof event.partId === "string",
    )
    .flatMap((event) => {
      const theme = THEME_BY_ID[event.themeId];
      const runtime = state.themes[event.themeId];
      const part = theme?.parts.find((candidate) => candidate.id === event.partId);
      if (
        !theme ||
        !runtime ||
        !part ||
        !runtime.releasedPartIds.includes(part.id)
      ) {
        return [];
      }
      const quote = getThemeCardMarketQuoteAtDay(
        state,
        event.themeId,
        part.id,
        observationDay,
        1,
      );
      if (!quote) return [];
      const history = historyAtOrBefore(state, decisionDay);
      const risk =
        (history?.shares[event.themeId] ?? runtime.share) *
        part.powerWeight *
        part.inclusion;
      return [{ event, part, quote, risk }];
    })
    .sort(
      (left, right) =>
        right.risk - left.risk ||
        left.part.id.localeCompare(right.part.id) ||
        left.event.id.localeCompare(right.event.id),
    )[0];
  if (!survivor) return null;
  return {
    ...survivor.quote,
    cardName: survivor.part.name,
    themeId: survivor.event.themeId,
    decisionDay,
    kind: "no-change-relief",
    reactionLabel: "금제 회피 안도 매수",
    sourceEventId: survivor.event.id,
  };
}
