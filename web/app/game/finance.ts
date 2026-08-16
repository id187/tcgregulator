import { PLAYER_START_DAY } from "./campaign.ts";

/** Monetary values are expressed in eok won (KRW 100,000,000). */
export const MONTHLY_BASE_OPERATING_COST = 1.05;
export const MONTHLY_OPERATING_COST_PER_USER_KRW = 2_500;
export const OPERATING_COST_MONTH_DAYS = 30;
export const OPERATING_COST_START_DAY = PLAYER_START_DAY + 1;

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
