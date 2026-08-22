import type { ThemeContent, ThemeRuntime } from "./types.ts";

export const THEME_COLLAPSE_MIN_BANNED_PARTS = 3;
export const THEME_COLLAPSE_BANNED_RATIO = 0.6;

export type ThemeTournamentViability = {
  bannedPartCount: number;
  collapsed: boolean;
  releasedPartCount: number;
};

/**
 * A rolling tier may survive on older results, but a deck whose currently
 * released engine has been mostly forbidden cannot earn new top-cut seats.
 * Support waves expand the denominator, so later decks are not erased by the
 * same three-card cut that destroys an original five-card engine.
 */
export function getThemeTournamentViability(
  content: ThemeContent,
  runtime: ThemeRuntime,
): ThemeTournamentViability {
  const releasedPartIds = new Set(runtime.releasedPartIds);
  const releasedParts = content.parts.filter((part) =>
    releasedPartIds.has(part.id)
  );
  const bannedPartCount = releasedParts.filter(
    (part) => (runtime.legalLimits[part.id] ?? 3) === 0,
  ).length;
  const bannedRatio = releasedParts.length > 0
    ? bannedPartCount / releasedParts.length
    : 0;
  return {
    bannedPartCount,
    collapsed:
      bannedPartCount >= THEME_COLLAPSE_MIN_BANNED_PARTS &&
      bannedRatio >= THEME_COLLAPSE_BANNED_RATIO,
    releasedPartCount: releasedParts.length,
  };
}
