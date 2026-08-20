import type { DailyHistory, ReleaseBatch, ThemeId } from "./types.ts";
import type { MetaTier } from "./meta-tiers.ts";

export const DAILY_TOP_CUT_SLOTS = 32;
export const ESTIMATED_DAILY_TOURNAMENT_ENTRANTS = 400;
export const PLACEMENT_WINDOW_DAYS = 14;
export const PROVISIONAL_THEME_DAYS = 7;

type PlacementMap = Record<ThemeId, number>;

/** Public alias retained for callers that build lightweight history fixtures. */
export type PlacementHistoryEntry = DailyHistory;

export interface DailyPlacementInput {
  seed: number;
  day: number;
  shares: Readonly<Record<ThemeId, number>>;
  winRates?: Readonly<Record<ThemeId, number>>;
  slots?: number;
}

export interface PlacementTierResult {
  tier: MetaTier;
  provisional: boolean;
}

export interface ThemePlacementReport {
  observedDays: number;
  placements: number;
  placementShare: number;
  estimatedEntrants: number;
  observedConversion: number;
}

export interface RecentPlacementReport {
  startDay: number;
  endDay: number;
  recordedDays: number;
  totalPlacements: number;
  themes: Record<ThemeId, ThemePlacementReport>;
}

export interface RecentPlacementLeader {
  themeId: ThemeId;
  placements: number;
  placementShare: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let index = 1; index <= Math.min(k, n - k); index += 1) {
    result = (result * (n - index + 1)) / index;
  }
  return result;
}

/** Probability of finishing a seven-round event with at least five wins. */
export function getTopCutPropensity(winRate: number): number {
  const probability = clamp(
    Number.isFinite(winRate) ? winRate : 0.5,
    0,
    1,
  );
  let propensity = 0;
  for (let wins = 5; wins <= 7; wins += 1) {
    propensity +=
      choose(7, wins) *
      probability ** wins *
      (1 - probability) ** (7 - wins);
  }
  return propensity;
}

function keyedUint(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  for (const key of keys) {
    const text = String(key);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
    }
    hash ^= 0x85ebca6b;
    hash = Math.imul(hash, 0xc2b2ae35);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function keyedRandom(seed: number, ...keys: Array<string | number>): number {
  return keyedUint(seed, ...keys) / 4294967296;
}

function positiveThemeIds(
  shares: Readonly<Record<ThemeId, number>>,
): ThemeId[] {
  return (Object.keys(shares) as ThemeId[])
    .filter((themeId) => {
      const share = shares[themeId];
      return Number.isFinite(share) && share > 0;
    })
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Converts expected performance into a finite, deterministic daily top cut.
 * Systematic resampling keeps the total exact and is invariant to input-key
 * order while still allowing low-representation themes to record zero.
 */
export function getDeterministicDailyTopCutPlacements({
  seed,
  day,
  shares,
  winRates,
  slots = DAILY_TOP_CUT_SLOTS,
}: DailyPlacementInput): PlacementMap {
  if (!Number.isInteger(slots) || slots <= 0) {
    throw new Error("Top-cut slots must be a positive integer.");
  }
  if (!Number.isInteger(day) || day < 0) {
    throw new Error("Placement day must be a non-negative integer.");
  }

  const themeIds = positiveThemeIds(shares);
  if (themeIds.length === 0) {
    throw new Error("Daily placements require at least one positive share.");
  }

  let weights = themeIds.map(
    (themeId) =>
      shares[themeId] * getTopCutPropensity(winRates?.[themeId] ?? 0.5),
  );
  let weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) {
    weights = themeIds.map((themeId) => shares[themeId]);
    weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  }

  const placements = Object.fromEntries(
    themeIds.map((themeId) => [themeId, 0]),
  ) as PlacementMap;
  const offset =
    keyedRandom(seed, "top-cut-placement", day, slots) / slots;
  let themeIndex = 0;
  let cumulative = weights[0] / weightTotal;

  for (let slot = 0; slot < slots; slot += 1) {
    const position = offset + slot / slots;
    while (
      themeIndex < themeIds.length - 1 &&
      position >= cumulative
    ) {
      themeIndex += 1;
      cumulative += weights[themeIndex] / weightTotal;
    }
    placements[themeIds[themeIndex]] += 1;
  }
  return placements;
}

function assertStoredPlacements(
  entry: PlacementHistoryEntry,
  placements: PlacementMap,
): void {
  const expectedIds = positiveThemeIds(entry.shares);
  const actualIds = (Object.keys(placements) as ThemeId[]).sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((themeId, index) => themeId !== actualIds[index])
  ) {
    throw new Error(`DAY ${entry.day} top-cut placement keys do not match shares.`);
  }
  const total = actualIds.reduce((sum, themeId) => {
    const count = placements[themeId];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`DAY ${entry.day} top-cut placements must be non-negative integers.`);
    }
    return sum + count;
  }, 0);
  if (total !== DAILY_TOP_CUT_SLOTS) {
    throw new Error(
      `DAY ${entry.day} top-cut placements must add up to ${DAILY_TOP_CUT_SLOTS}.`,
    );
  }
}

/** Reads persisted results or deterministically reconstructs a legacy row. */
export function getDailyTopCutPlacements(
  entry: PlacementHistoryEntry,
  seed: number,
): PlacementMap {
  if (entry.topCutPlacements) {
    assertStoredPlacements(entry, entry.topCutPlacements);
    return { ...entry.topCutPlacements };
  }
  return getDeterministicDailyTopCutPlacements({
    seed,
    day: entry.day,
    shares: entry.shares,
    winRates: entry.winRates,
  });
}

/** Aggregates the inclusive rolling window ending on endDay. */
export function getRecentPlacementReport(
  history: readonly PlacementHistoryEntry[],
  seed: number,
  endDay: number,
  windowDays = PLACEMENT_WINDOW_DAYS,
  estimatedEntrantsPerDay = ESTIMATED_DAILY_TOURNAMENT_ENTRANTS,
): RecentPlacementReport {
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new Error("Placement window must be a positive integer.");
  }
  if (!Number.isFinite(estimatedEntrantsPerDay) || estimatedEntrantsPerDay <= 0) {
    throw new Error("Estimated daily entrants must be positive.");
  }
  const startDay = endDay - windowDays + 1;
  const rows = history
    .filter((entry) => entry.day >= startDay && entry.day <= endDay)
    .sort((left, right) => left.day - right.day);
  const placementTotals = new Map<ThemeId, number>();
  const estimatedEntrants = new Map<ThemeId, number>();
  const observedDays = new Map<ThemeId, number>();

  for (const entry of rows) {
    const placements = getDailyTopCutPlacements(entry, seed);
    for (const themeId of Object.keys(entry.shares) as ThemeId[]) {
      observedDays.set(themeId, (observedDays.get(themeId) ?? 0) + 1);
      placementTotals.set(
        themeId,
        (placementTotals.get(themeId) ?? 0) + (placements[themeId] ?? 0),
      );
      estimatedEntrants.set(
        themeId,
        (estimatedEntrants.get(themeId) ?? 0) +
          Math.max(0, entry.shares[themeId]) * estimatedEntrantsPerDay,
      );
    }
  }

  const themeIds = [...new Set([
    ...placementTotals.keys(),
    ...estimatedEntrants.keys(),
    ...observedDays.keys(),
  ])].sort((left, right) => left.localeCompare(right));
  const totalPlacements = themeIds.reduce(
    (sum, themeId) => sum + (placementTotals.get(themeId) ?? 0),
    0,
  );
  const themes = Object.fromEntries(
    themeIds.map((themeId) => {
      const placements = placementTotals.get(themeId) ?? 0;
      const entrants = estimatedEntrants.get(themeId) ?? 0;
      return [
        themeId,
        {
          observedDays: observedDays.get(themeId) ?? 0,
          placements,
          placementShare:
            totalPlacements > 0 ? placements / totalPlacements : 0,
          estimatedEntrants: entrants,
          observedConversion:
            entrants > 0 ? clamp(placements / entrants, 0, 1) : 0,
        },
      ];
    }),
  ) as Record<ThemeId, ThemePlacementReport>;

  return {
    startDay,
    endDay,
    recordedDays: rows.length,
    totalPlacements,
    themes,
  };
}

/**
 * Returns the leader of the rolling top-cut window. Equal placement totals are
 * resolved by stable theme ID so history order and object-key order cannot
 * change a reported leader.
 */
export function getRecentPlacementLeader(
  history: readonly PlacementHistoryEntry[],
  seed: number,
  endDay: number,
  windowDays = PLACEMENT_WINDOW_DAYS,
): RecentPlacementLeader | null {
  const report = getRecentPlacementReport(history, seed, endDay, windowDays);
  if (report.totalPlacements <= 0) return null;
  const leader = (Object.entries(report.themes) as Array<
    [ThemeId, ThemePlacementReport]
  >).sort(
    ([leftId, left], [rightId, right]) =>
      right.placements - left.placements || leftId.localeCompare(rightId),
  )[0];
  if (!leader || leader[1].placements <= 0) return null;
  return {
    themeId: leader[0],
    placements: leader[1].placements,
    placementShare: leader[1].placementShare,
  };
}

export function hasCompletePlacementSample(observedDays: number): boolean {
  return Number.isFinite(observedDays) &&
    observedDays >= PLACEMENT_WINDOW_DAYS;
}

/** The first day on which a newly released theme can enter tournament data. */
export function getThemeDebutDay(
  releaseHistory: readonly ReleaseBatch[],
  themeId: ThemeId,
): number | null {
  let debutDay: number | null = null;
  for (const batch of releaseHistory) {
    if (
      batch.products.some(
        (product) =>
          product.kind === "new-theme" && product.themeId === themeId,
      )
    ) {
      const candidate = batch.day + 1;
      debutDay = debutDay === null ? candidate : Math.min(debutDay, candidate);
    }
  }
  return debutDay;
}

function tierFromPlacementShare(placementShare: number): MetaTier {
  if (!Number.isFinite(placementShare) || placementShare <= 0) {
    return "Tier Out";
  }
  if (placementShare >= 0.65) return "Tier 0";
  if (placementShare >= 0.15) return "Tier 1";
  if (placementShare >= 0.05) return "Tier 2";
  return "Tier 3";
}

/**
 * New themes are provisionally no lower than Tier 3 for days 0..6. A real
 * Tier 0/1/2 result is never hidden by the provisional floor.
 */
export function getPlacementTier(
  placementShare: number,
  currentDay?: number,
  debutDay?: number | null,
): PlacementTierResult {
  const tier = tierFromPlacementShare(placementShare);
  const age =
    currentDay !== undefined && debutDay !== undefined && debutDay !== null
      ? currentDay - debutDay
      : null;
  const provisional = age !== null && age >= 0 && age < PROVISIONAL_THEME_DAYS;
  return {
    tier: provisional && tier === "Tier Out" ? "Tier 3" : tier,
    provisional,
  };
}
