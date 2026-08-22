import type { ThemeId } from "./types.ts";

export type DailyPlacementTransitionRow = {
  themeId: ThemeId;
  previousCount: number;
  currentCount: number;
  previousRank: number | null;
  currentRank: number | null;
  rankDelta: number | null;
};

export type DailyPlacementTransitionModel = {
  rows: readonly DailyPlacementTransitionRow[];
  previousTotal: number;
  currentTotal: number;
};

function rankedPlacements(
  placements: Readonly<Record<ThemeId, number>>,
): Array<{ themeId: ThemeId; count: number; rank: number }> {
  return (Object.entries(placements) as [ThemeId, number][])
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount || leftId.localeCompare(rightId),
    )
    .map(([themeId, count], index) => ({
      themeId,
      count,
      rank: index + 1,
    }));
}

export function buildDailyPlacementTransitionModel(
  previous: Readonly<Record<ThemeId, number>>,
  current: Readonly<Record<ThemeId, number>>,
): DailyPlacementTransitionModel {
  const previousRanked = rankedPlacements(previous);
  const currentRanked = rankedPlacements(current);
  const previousById = new Map(
    previousRanked.map((entry) => [entry.themeId, entry]),
  );
  const currentById = new Map(
    currentRanked.map((entry) => [entry.themeId, entry]),
  );
  const themeIds = [
    ...currentRanked.map((entry) => entry.themeId),
    ...previousRanked
      .filter((entry) => !currentById.has(entry.themeId))
      .map((entry) => entry.themeId),
  ];
  const rows = themeIds.map((themeId) => {
    const previousEntry = previousById.get(themeId);
    const currentEntry = currentById.get(themeId);
    return {
      themeId,
      previousCount: previousEntry?.count ?? 0,
      currentCount: currentEntry?.count ?? 0,
      previousRank: previousEntry?.rank ?? null,
      currentRank: currentEntry?.rank ?? null,
      rankDelta: previousEntry && currentEntry
        ? previousEntry.rank - currentEntry.rank
        : null,
    };
  });
  const previousTotal = previousRanked.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const currentTotal = currentRanked.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );

  return {
    rows,
    previousTotal,
    currentTotal,
  };
}
