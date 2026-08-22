import { THEME_BY_ID } from "./content.ts";
import { getPlacementTier, getRecentPlacementReport } from "./placement-meta.ts";
import type {
  GameState,
  ShareholderRequest,
  ThemeId,
} from "./types.ts";

export const FIRST_SHAREHOLDER_REQUEST_DAY = 25;
export const FIRST_SHAREHOLDER_REQUEST_DEADLINE_DAY = 55;
export const SHAREHOLDER_REQUEST_INTERVAL_DAYS = 60;
export const SHAREHOLDER_REQUEST_DURATION_DAYS = 30;
export const FIRST_SHAREHOLDER_REQUEST_REWARD_CASH = 15;
export const FIRST_SHAREHOLDER_REQUEST_FAILURE_PENALTY_CASH = 5;

type ShareholderRequestState = Pick<GameState, "day" | "history" | "seed">;

function rankedPlacementThemes(
  state: ShareholderRequestState,
  offeredDay: number,
): ThemeId[] {
  const report = getRecentPlacementReport(
    state.history,
    state.seed,
    offeredDay,
  );
  return (Object.entries(report.themes) as Array<
    [ThemeId, (typeof report.themes)[ThemeId]]
  >)
    .filter(([themeId, metrics]) => Boolean(THEME_BY_ID[themeId]) && metrics.placements > 0)
    .sort(
      ([leftId, left], [rightId, right]) =>
        right.placements - left.placements || leftId.localeCompare(rightId),
    )
    .map(([themeId]) => themeId);
}

export function getShareholderRequestOrdinal(day: number): number | null {
  if (
    day < FIRST_SHAREHOLDER_REQUEST_DAY ||
    (day - FIRST_SHAREHOLDER_REQUEST_DAY) %
      SHAREHOLDER_REQUEST_INTERVAL_DAYS !==
      0
  ) {
    return null;
  }
  return (
    Math.floor(
      (day - FIRST_SHAREHOLDER_REQUEST_DAY) /
        SHAREHOLDER_REQUEST_INTERVAL_DAYS,
    ) + 1
  );
}

export function createShareholderRequest(
  state: ShareholderRequestState,
  offeredDay = state.day,
): ShareholderRequest | null {
  const ordinal = getShareholderRequestOrdinal(offeredDay);
  if (ordinal === null || state.day < offeredDay) return null;
  const ranked = rankedPlacementThemes(state, offeredDay);
  if (ranked.length === 0) return null;
  const kind = ((state.seed + ordinal - 1) & 1) === 0
    ? "suppress-tier2"
    : "promote-first";
  const themeId = kind === "suppress-tier2"
    ? ranked[0]
    : ranked[Math.min(1 + ((ordinal - 1) % 2), ranked.length - 1)];
  return {
    id: `shareholder-request-${ordinal}`,
    kind,
    themeId,
    offeredDay,
    deadlineDay: offeredDay + SHAREHOLDER_REQUEST_DURATION_DAYS,
    rewardCash: FIRST_SHAREHOLDER_REQUEST_REWARD_CASH,
    status: "pending",
    responseDay: null,
    resolvedDay: null,
  };
}

/** Compatibility name for the first DAY 25 tutorial offer. */
export function createFirstShareholderRequest(
  state: ShareholderRequestState,
): ShareholderRequest | null {
  return createShareholderRequest(state, FIRST_SHAREHOLDER_REQUEST_DAY);
}

export function getShareholderRequestProgress(
  state: Pick<GameState, "history" | "seed">,
  request: ShareholderRequest,
  endDay: number,
): Readonly<{
  rank: number | null;
  tier: ReturnType<typeof getPlacementTier>["tier"];
  placementShare: number;
  succeeded: boolean;
}> {
  const report = getRecentPlacementReport(state.history, state.seed, endDay);
  const ranked = (Object.entries(report.themes) as Array<
    [ThemeId, (typeof report.themes)[ThemeId]]
  >).sort(
    ([leftId, left], [rightId, right]) =>
      right.placements - left.placements || leftId.localeCompare(rightId),
  );
  const rankIndex = ranked.findIndex(([themeId]) => themeId === request.themeId);
  const metrics = report.themes[request.themeId];
  const placementShare = metrics?.placementShare ?? 0;
  const tier = getPlacementTier(placementShare).tier;
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  return {
    rank,
    tier,
    placementShare,
    succeeded: request.kind === "promote-first"
      ? rank === 1
      : tier === "Tier 2" || tier === "Tier 3" || tier === "Tier Out",
  };
}

export function getShareholderRequestGoalCopy(
  request: ShareholderRequest,
): string {
  const theme = THEME_BY_ID[request.themeId]?.shortName ?? request.themeId;
  return request.kind === "promote-first"
    ? `${theme}를 최근 7일 입상 1위로 만드십시오.`
    : `${theme}를 최근 7일 입상 Tier 2 이하로 낮추십시오.`;
}
