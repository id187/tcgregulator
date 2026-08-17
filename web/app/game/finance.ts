import { PLAYER_START_DAY } from "./campaign.ts";

/** Monetary values are expressed in eok won (KRW 100,000,000). */
export const MONTHLY_BASE_OPERATING_COST = 1.05;
export const MONTHLY_OPERATING_COST_PER_USER_KRW = 2_500;
export const OPERATING_COST_MONTH_DAYS = 30;
export const OPERATING_COST_START_DAY = PLAYER_START_DAY + 1;
export const OPERATING_CASH_MARGIN = 0.32;

/**
 * Release revenue follows the same thirty-day exponential tail in both the
 * engine and the market-shock detector. Keeping the constants here prevents
 * chart alerts from drifting when the sales model is tuned.
 */
export const RELEASE_SALES_WINDOW_DAYS = 30;
export const RELEASE_SALES_DECAY_DAYS = 6;
export const RELEASE_SALES_DAILY_DECAY_MULTIPLIER = Math.exp(
  -1 / RELEASE_SALES_DECAY_DAYS,
);

export const REVENUE_SURGE_ALERT_RATE = 12;
export const REVENUE_DROP_ALERT_RATE = -12;
export const POST_RELEASE_DROP_RESIDUAL_ALERT_RATE = -8;

export type RevenueChangeSignal = "surge" | "drop" | null;
export type MarketDivergenceLag = 0 | 1 | null;

export function getRevenueChangeSignal(
  changeRate: number,
  releaseAge: number | null = null,
  daySpan = 1,
): RevenueChangeSignal {
  if (!Number.isFinite(changeRate)) return null;
  if (changeRate >= REVENUE_SURGE_ALERT_RATE) return "surge";
  if (changeRate >= 0) return null;

  if (
    releaseAge !== null &&
    releaseAge >= 1 &&
    releaseAge < RELEASE_SALES_WINDOW_DAYS &&
    daySpan === 1
  ) {
    const actualMultiplier = Math.max(0, 1 + changeRate / 100);
    const decayAdjustedRate =
      (actualMultiplier / RELEASE_SALES_DAILY_DECAY_MULTIPLIER - 1) * 100;
    return decayAdjustedRate <= POST_RELEASE_DROP_RESIDUAL_ALERT_RATE + 1e-9
      ? "drop"
      : null;
  }

  if (changeRate <= REVENUE_DROP_ALERT_RATE) return "drop";
  return null;
}

/**
 * Flags the deliberately uncomfortable market beat where sales jump while
 * ecosystem health or purchase trust falls either immediately or on D+1.
 */
export function getMarketDivergenceLag(
  isRevenueSurge: boolean,
  environmentDelta: number | null,
  purchaseTrustDelta: number | null,
  nextEnvironmentDelta: number | null,
  nextPurchaseTrustDelta: number | null,
  nextDaySpan = 1,
): MarketDivergenceLag {
  if (!isRevenueSurge) return null;
  const isMeaningfulDrop = (value: number | null) =>
    value !== null && value <= -0.5;
  if (
    isMeaningfulDrop(environmentDelta) ||
    isMeaningfulDrop(purchaseTrustDelta)
  ) {
    return 0;
  }
  if (
    nextDaySpan === 1 &&
    (isMeaningfulDrop(nextEnvironmentDelta) ||
      isMeaningfulDrop(nextPurchaseTrustDelta))
  ) {
    return 1;
  }
  return null;
}

const KRW_PER_EOK = 100_000_000;

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Fixed organization overhead plus the cost of serving the current audience.
 * This is a monthly estimate; the engine charges one thirtieth each day.
 */
export function getMonthlyOperatingCost(activeUsers: number): number {
  const users = Number.isFinite(activeUsers) ? Math.max(0, activeUsers) : 0;
  return round(
    MONTHLY_BASE_OPERATING_COST +
      (users * MONTHLY_OPERATING_COST_PER_USER_KRW) / KRW_PER_EOK,
  );
}

/** DAY 46 is the handover balance; recurring costs begin on DAY 47. */
export function getDailyOperatingCost(day: number, activeUsers: number): number {
  if (!Number.isInteger(day) || day < OPERATING_COST_START_DAY) return 0;
  return round(getMonthlyOperatingCost(activeUsers) / OPERATING_COST_MONTH_DAYS);
}

export function getOperatingRunwayMonths(
  cash: number,
  activeUsers: number,
): number {
  const monthlyCost = getMonthlyOperatingCost(activeUsers);
  if (monthlyCost <= 0) return 0;
  return round(Math.max(0, cash) / monthlyCost, 1);
}
