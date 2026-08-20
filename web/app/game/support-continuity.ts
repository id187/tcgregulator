import { META_ADOPTION_SHARE_FLOOR } from "./meta-tiers.ts";
import type { GameState, ThemeId, ThemeRuntime } from "./types.ts";

export const SUPPORT_NEGLECT_GRACE_DAYS = 90;
export const SUPPORT_NEGLECT_RAMP_DAYS = 180;
export const MAX_DAILY_SUPPORT_NEGLECT_TRUST_LOSS = 0.0525;

const SURVIVING_THEME_SHARE = 0.075;
const PORTFOLIO_SATURATION_LOAD = 2;

type SupportContinuityRuntime = Pick<
  ThemeRuntime,
  "lastSupportDay" | "share" | "supportCount"
>;

export interface SupportNeglectContributor {
  readonly themeId: ThemeId;
  /** Continuous 0..1 contribution before portfolio saturation. */
  readonly severity: number;
}

export interface SupportNeglectPressure {
  /** Continuous 0..1 aggregate used for the daily trust loss. */
  readonly portfolioLoad: number;
  /** Positive amount subtracted from purchase trust for this day. */
  readonly dailyTrustLoss: number;
  /** Largest qualitative causes, ordered by severity and capped at three. */
  readonly neglectedThemeIds: readonly ThemeId[];
  readonly contributors: readonly SupportNeglectContributor[];
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function smoothstep01(value: number): number {
  const normalized = clamp(value);
  return normalized * normalized * (3 - 2 * normalized);
}

/**
 * A release or support wave grants a full grace period. Age only turns into
 * ownership pressure when the theme's current adoption has also collapsed.
 * Starting themes use DAY 0 as their last-care anchor, avoiding a save field.
 */
export function getThemeSupportNeglectSeverity(
  runtime: SupportContinuityRuntime,
  day: number,
): number {
  const lastCareDay = runtime.lastSupportDay ?? 0;
  const daysSinceCare = Math.max(0, day - lastCareDay);
  const ageLoad = smoothstep01(
    (daysSinceCare - SUPPORT_NEGLECT_GRACE_DAYS) /
      SUPPORT_NEGLECT_RAMP_DAYS,
  );
  if (ageLoad <= 0 || runtime.share >= SURVIVING_THEME_SHARE) return 0;

  const collapseLoad = clamp(
    (SURVIVING_THEME_SHARE - runtime.share) /
      (SURVIVING_THEME_SHARE - META_ADOPTION_SHARE_FLOOR),
  );
  // A Tier Out deck still has owners, while a visible deck has broader market
  // relevance. Their product keeps the pressure continuous at both extremes.
  const ownershipRelevance =
    0.45 +
    0.55 * Math.sqrt(clamp(runtime.share / SURVIVING_THEME_SHARE));
  // Prior support represents a little more owner investment, not a pass/fail
  // count. Its effect remains small and is reset by the new support's date.
  const priorOwnerInvestment = 1 + 0.05 * clamp(runtime.supportCount / 3);

  return round(
    clamp(
      ageLoad * collapseLoad * ownershipRelevance * priorOwnerInvestment,
    ),
  );
}

/**
 * Save-derived portfolio pressure. Contributions saturate smoothly instead of
 * creating a hidden requirement to support a fixed number of themes.
 */
export function getSupportNeglectPressure(
  state: Pick<GameState, "activeThemeIds" | "day" | "themes">,
): Readonly<SupportNeglectPressure> {
  const rankedContributors = state.activeThemeIds
    .map((themeId) => ({
      themeId,
      severity: getThemeSupportNeglectSeverity(state.themes[themeId], state.day),
    }))
    .filter((entry) => entry.severity > 0)
    .sort(
      (left, right) =>
        right.severity - left.severity ||
        left.themeId.localeCompare(right.themeId),
    );
  const totalLoad = rankedContributors.reduce(
    (sum, entry) => sum + entry.severity,
    0,
  );
  const portfolioLoad = round(
    clamp(1 - Math.exp(-totalLoad / PORTFOLIO_SATURATION_LOAD)),
  );
  const contributors = Object.freeze(
    rankedContributors.slice(0, 3).map((entry) => Object.freeze(entry)),
  );
  const neglectedThemeIds = Object.freeze(
    contributors.map((entry) => entry.themeId),
  );

  return Object.freeze({
    portfolioLoad,
    dailyTrustLoss: round(
      portfolioLoad * MAX_DAILY_SUPPORT_NEGLECT_TRUST_LOSS,
    ),
    neglectedThemeIds,
    contributors,
  });
}
