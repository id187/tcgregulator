import {
  getPlacementTier,
  getRecentPlacementReport,
  getThemeDebutDay,
  type RecentPlacementReport,
} from "./placement-meta.ts";
import type {
  DailyHistory,
  EnvironmentHealthModel,
  GameState,
  ThemeId,
} from "./types.ts";

const GENERATION_WINDOW_DAYS = 90;
const TURNOVER_WINDOW_DAYS = 30;
const TOP_COHORT_SIZE = 5;

export const ENVIRONMENT_HEALTH_MODEL =
  "placement-v1" satisfies EnvironmentHealthModel;

export interface EnvironmentHealthBreakdown {
  score: number;
  gameplayQuality: number;
  placementDiversity: number;
  topCohortTurnover: number;
  generationalBalance: number;
  ecosystemContinuity: number;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function topThemeIds(
  report: RecentPlacementReport,
  count = TOP_COHORT_SIZE,
): ThemeId[] {
  const entries = Object.entries(report.themes) as [
    ThemeId,
    { placementShare: number },
  ][];
  return entries
    .filter(([, metrics]) => metrics.placementShare > 0)
    .sort(
      ([leftId, left], [rightId, right]) =>
        right.placementShare - left.placementShare ||
        leftId.localeCompare(rightId),
    )
    .slice(0, count)
    .map(([themeId]) => themeId);
}

function getGameplayQuality(state: GameState): number {
  const rankedAdoptionShares = state.activeThemeIds
    .map((themeId) => state.themes[themeId].share)
    .sort((left, right) => right - left);
  const weightedUnpleasantness = state.activeThemeIds.reduce(
    (sum, themeId) => {
      const runtime = state.themes[themeId];
      return sum + runtime.unpleasantness * runtime.share;
    },
    0,
  );
  const weightedFatigue = state.activeThemeIds.reduce((sum, themeId) => {
    const runtime = state.themes[themeId];
    return sum + runtime.fatigue * runtime.share;
  }, 0);
  const extremeWinRatePressure = state.activeThemeIds.reduce(
    (sum, themeId) => {
      const runtime = state.themes[themeId];
      // A weak deck is not itself oppressive. Only adoption-weighted win rates
      // above the normal band lower match quality here; failed themes are
      // already reflected by placement diversity and ecosystem continuity.
      const excess = Math.max(0, runtime.winRate - 0.56);
      return sum + excess * runtime.share * 500;
    },
    0,
  );
  const topAdoptionShare = rankedAdoptionShares[0] ?? 0;
  const topThreeAdoptionShare = rankedAdoptionShares
    .slice(0, 3)
    .reduce((sum, share) => sum + share, 0);
  const adoptionDominancePenalty =
    Math.max(0, topAdoptionShare - 0.3) * 45 +
    Math.max(0, topThreeAdoptionShare - 0.68) * 30;

  return clamp(
    100 -
      weightedUnpleasantness * 0.75 -
      Math.max(0, weightedFatigue - 25) * 0.45 -
      extremeWinRatePressure -
      adoptionDominancePenalty,
  );
}

function getPlacementDiversity(report: RecentPlacementReport): number {
  if (report.totalPlacements <= 0) return 75;
  const shares = Object.values(report.themes)
    .map((metrics) => metrics.placementShare)
    .filter((share) => share > 0)
    .sort((left, right) => right - left);
  const topShare = shares[0] ?? 0;
  const topThreeShare = shares
    .slice(0, 3)
    .reduce((sum, share) => sum + share, 0);
  const topPenalty = clamp((topShare - 0.22) / 0.43, 0, 1) * 55;
  const topThreePenalty =
    clamp((topThreeShare - 0.55) / 0.45, 0, 1) * 45;
  return clamp(100 - topPenalty - topThreePenalty);
}

function getTopCohortTurnover(
  current: RecentPlacementReport,
  previous: RecentPlacementReport,
): number {
  if (current.recordedDays < 15 || previous.recordedDays < 15) return 75;
  const currentTop = topThemeIds(current);
  const previousTop = topThemeIds(previous);
  const cohortSize = Math.min(currentTop.length, previousTop.length);
  if (cohortSize < 3) return 75;
  const previousSet = new Set(previousTop);
  const overlap =
    currentTop.filter((themeId) => previousSet.has(themeId)).length /
    cohortSize;

  // A completely fixed table is stale, while a total wipe every month makes
  // investment feel disposable. With a five-theme cohort the closest
  // attainable values to half are 2/5 and 3/5, so both receive full credit.
  const distanceFromHealthyBand =
    overlap < 0.4 ? 0.4 - overlap : overlap > 0.6 ? overlap - 0.6 : 0;
  return clamp(100 - distanceFromHealthyBand * 112.5, 45, 100);
}

/**
 * Uses a persisted score only when its formula is known to match the current
 * model. Legacy rows remain readable, but must not be plotted as if they were
 * calculated by the placement-based model.
 */
export function getCompatibleStoredEnvironmentHealth(
  entry: Pick<
    DailyHistory,
    "environmentHealth" | "environmentHealthModel"
  >,
): number | undefined {
  return entry.environmentHealthModel === ENVIRONMENT_HEALTH_MODEL &&
      typeof entry.environmentHealth === "number"
    ? entry.environmentHealth
    : undefined;
}

export function getChartEnvironmentHealth(
  entry: Pick<
    DailyHistory,
    "environmentHealth" | "environmentHealthModel"
  >,
  isLatestEntry: boolean,
  liveEnvironmentHealth: number,
): number | null {
  return getCompatibleStoredEnvironmentHealth(entry) ??
    (isLatestEntry ? liveEnvironmentHealth : null);
}

function getGenerationalBalance(
  state: GameState,
  report: RecentPlacementReport,
  endDay: number,
): number {
  if (report.recordedDays < 7) return 75;
  const recentThemeIds = state.activeThemeIds.filter((themeId) => {
    const debutDay = getThemeDebutDay(state.releaseHistory, themeId);
    if (debutDay === null) return false;
    const age = endDay - debutDay;
    return age >= 0 && age < GENERATION_WINDOW_DAYS;
  });
  if (recentThemeIds.length === 0) return 75;
  const recentShare = recentThemeIds.reduce(
    (sum, themeId) =>
      sum + (report.themes[themeId]?.placementShare ?? 0),
    0,
  );

  // With three release waves inside the 90-day window, roughly 40% recent
  // representation means that new ideas matter without erasing the catalogue.
  // The continuous slope also distinguishes gradual renewal from power-creep
  // replacement instead of awarding every broad middle band the same score.
  return clamp(100 - Math.abs(recentShare - 0.4) * 140);
}

function getEcosystemContinuity(
  state: GameState,
  report: RecentPlacementReport,
  endDay: number,
): number {
  if (state.activeThemeIds.length < 10 || report.recordedDays < 15) return 80;
  const tierOutCount = state.activeThemeIds.filter((themeId) => {
    const placementShare = report.themes[themeId]?.placementShare ?? 0;
    const debutDay = getThemeDebutDay(state.releaseHistory, themeId);
    return (
      getPlacementTier(placementShare, endDay, debutDay).tier === "Tier Out"
    );
  }).length;
  const tierOutRatio = tierOutCount / state.activeThemeIds.length;

  // Some themes leaving the competitive table is expected. Around 45% dormant
  // keeps the visible field selective while leaving a substantial catalogue
  // alive; both an immortal tail and mass extinction move away from that point.
  return clamp(100 - Math.abs(tierOutRatio - 0.45) * 120);
}

export function getEnvironmentHealthBreakdown(
  state: GameState,
): EnvironmentHealthBreakdown {
  const endDay = state.history.at(-1)?.day ?? state.day;
  const currentReport = getRecentPlacementReport(
    state.history,
    state.seed,
    endDay,
  );
  const previousReport = getRecentPlacementReport(
    state.history,
    state.seed,
    endDay - TURNOVER_WINDOW_DAYS,
  );
  const gameplayQuality = getGameplayQuality(state);
  const placementDiversity = getPlacementDiversity(currentReport);
  const topCohortTurnover = getTopCohortTurnover(
    currentReport,
    previousReport,
  );
  const generationalBalance = getGenerationalBalance(
    state,
    currentReport,
    endDay,
  );
  const ecosystemContinuity = getEcosystemContinuity(
    state,
    currentReport,
    endDay,
  );
  const score =
    gameplayQuality * 0.4 +
    placementDiversity * 0.25 +
    topCohortTurnover * 0.15 +
    generationalBalance * 0.12 +
    ecosystemContinuity * 0.08;

  return {
    score: round(clamp(score)),
    gameplayQuality: round(gameplayQuality),
    placementDiversity: round(placementDiversity),
    topCohortTurnover: round(topCohortTurnover),
    generationalBalance: round(generationalBalance),
    ecosystemContinuity: round(ecosystemContinuity),
  };
}
