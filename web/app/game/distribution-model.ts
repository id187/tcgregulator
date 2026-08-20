import { THEME_BY_ID } from "./content.ts";
import {
  getPlacementTier,
  hasCompletePlacementSample,
  PLACEMENT_WINDOW_DAYS,
  type RecentPlacementReport,
  type ThemePlacementReport,
} from "./placement-meta.ts";
import type { MetaTier } from "./meta-tiers.ts";
import type { GameState, ThemeId } from "./types.ts";
import { isInitialGenericReleaseBatch } from "./initial-generic-cards.ts";

export type DistributionMode = "top-cut" | "users";

export type PlayerSegmentId = "meta" | "casual" | "collector" | "reseller";

export type DistributionEntryKind = "theme" | "other" | "player-segment";

export type DistributionEntry = {
  id: ThemeId | "tier-three-other" | `player-${PlayerSegmentId}`;
  kind: DistributionEntryKind;
  themeId: ThemeId | null;
  segmentId: PlayerSegmentId | null;
  label: string;
  color: string;
  /** Player count in users mode; top-cut placements in top-cut mode. */
  count: number;
  share: number;
  rawShare: number;
  tier: MetaTier;
  completeSample: boolean;
  observedDays: number;
  memberThemeIds: readonly ThemeId[];
};

const BASE_RESELLER_SHARE = 0.08;
const RECENT_RELEASE_RESELLER_BUMP = 0.04;
const RECENT_RELEASE_WINDOW_DAYS = 14;

const PLAYER_SEGMENTS: ReadonlyArray<{
  id: PlayerSegmentId;
  label: string;
  color: string;
}> = [
  { id: "meta", label: "메타층", color: "#315fbd" },
  { id: "casual", label: "캐주얼층", color: "#2a8c7c" },
  { id: "collector", label: "콜렉터층", color: "#d28a2c" },
  { id: "reseller", label: "리셀층", color: "#c54b5c" },
];

const EMPTY_PLACEMENT: ThemePlacementReport = {
  observedDays: 0,
  placements: 0,
  placementShare: 0,
  estimatedEntrants: 0,
  observedConversion: 0,
};

function safeUserCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getResellerShare(game: GameState): number {
  const latestReleaseDay = game.releaseHistory.reduce<number | null>(
    (latest, batch) => {
      if (batch.day > game.day || isInitialGenericReleaseBatch(batch)) {
        return latest;
      }
      return latest === null || batch.day > latest ? batch.day : latest;
    },
    null,
  );
  if (latestReleaseDay === null) return BASE_RESELLER_SHARE;

  const releaseAge = game.day - latestReleaseDay;
  const recentReleaseWeight = Math.max(
    0,
    1 - releaseAge / RECENT_RELEASE_WINDOW_DAYS,
  );
  return (
    BASE_RESELLER_SHARE + RECENT_RELEASE_RESELLER_BUMP * recentReleaseWeight
  );
}

function buildPlayerSegmentEntries(game: GameState): DistributionEntry[] {
  const metaCount = safeUserCount(game.users.tier);
  const casualCount = safeUserCount(game.users.casual);
  const collectorPool = safeUserCount(game.users.collector);
  const resellerCount = Math.min(
    collectorPool,
    Math.round(collectorPool * getResellerShare(game)),
  );
  const counts: Record<PlayerSegmentId, number> = {
    meta: metaCount,
    casual: casualCount,
    collector: collectorPool - resellerCount,
    reseller: resellerCount,
  };
  const total = metaCount + casualCount + collectorPool;

  return PLAYER_SEGMENTS.map((segment) => {
    const count = counts[segment.id];
    const rawShare = total > 0 ? count / total : 0;
    return {
      id: `player-${segment.id}` as const,
      kind: "player-segment" as const,
      themeId: null,
      segmentId: segment.id,
      label: segment.label,
      color: segment.color,
      count,
      rawShare,
      share: rawShare,
      // These placement fields stay populated for backwards-compatible callers;
      // segment consumers should branch on kind/segmentId instead.
      tier: "Tier Out" as const,
      completeSample: true,
      observedDays: 0,
      memberThemeIds: [],
    } satisfies DistributionEntry;
  }).sort(
    (left, right) =>
      right.rawShare - left.rawShare || left.id.localeCompare(right.id),
  );
}

export function buildDistributionEntries(
  game: GameState,
  report: RecentPlacementReport,
  mode: DistributionMode,
): DistributionEntry[] {
  if (mode === "users") return buildPlayerSegmentEntries(game);

  const classified = game.activeThemeIds.flatMap((themeId) => {
    const theme = THEME_BY_ID[themeId];
    const placement = report.themes[themeId] ?? EMPTY_PLACEMENT;
    if (!theme || (mode === "top-cut" && placement.placements <= 0)) return [];
    const completeSample = hasCompletePlacementSample(placement.observedDays);
    const tier = getPlacementTier(
      placement.placementShare,
      report.endDay,
      game.releaseHistory.find((batch) =>
        batch.products.some(
          (product) => product.kind === "new-theme" && product.themeId === themeId,
        ),
      )?.day,
    ).tier;
    return [{
      theme,
      placement,
      completeSample,
      tier,
      rawShare: Math.max(0, placement.placementShare),
    }];
  });

  const named = classified
    .filter(({ completeSample, tier }) => !completeSample || tier !== "Tier 3")
    .map(({ theme, placement, completeSample, tier, rawShare }) => ({
      id: theme.id,
      kind: "theme",
      themeId: theme.id,
      segmentId: null,
      label: theme.name,
      color: theme.color,
      count: placement.placements,
      rawShare,
      share: 0,
      tier,
      completeSample,
      observedDays: placement.observedDays,
      memberThemeIds: [theme.id],
    } satisfies DistributionEntry))
    .sort(
      (left, right) =>
        right.rawShare - left.rawShare || left.id.localeCompare(right.id),
    );

  const otherMembers = classified
    .filter(({ completeSample, tier }) => completeSample && tier === "Tier 3")
    .sort(
      (left, right) =>
        right.rawShare - left.rawShare ||
        left.theme.id.localeCompare(right.theme.id),
    );
  const otherRawShare = otherMembers.reduce(
    (sum, entry) => sum + entry.rawShare,
    0,
  );
  const entries: DistributionEntry[] = [
    ...named,
    ...(otherMembers.length > 0
      ? [{
          id: "tier-three-other" as const,
          kind: "other" as const,
          themeId: null,
          segmentId: null,
          label: "기타",
          color: "#94a3b8",
          count: otherMembers.reduce(
            (sum, entry) => sum + entry.placement.placements,
            0,
          ),
          rawShare: otherRawShare,
          share: 0,
          tier: "Tier 3" as const,
          completeSample: true,
          observedDays: PLACEMENT_WINDOW_DAYS,
          memberThemeIds: otherMembers.map((entry) => entry.theme.id),
        }]
      : []),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.rawShare, 0);
  if (total <= 0) return entries;
  return entries.map((entry) => ({
    ...entry,
    share: entry.rawShare / total,
  }));
}
