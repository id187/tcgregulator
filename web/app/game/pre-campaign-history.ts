import {
  PRE_CAMPAIGN_HISTORY_DAYS,
  PRE_CAMPAIGN_START_DAY,
} from "./campaign.ts";
import {
  ENVIRONMENT_HEALTH_MODEL,
  getEnvironmentHealthBreakdown,
} from "./environment-health.ts";
import { getDeterministicDailyTopCutPlacements } from "./placement-meta.ts";
import type { DailyHistory, GameState, ThemeId } from "./types.ts";

function keyedRandom(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  for (const key of keys) {
    for (const character of String(key)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
    }
    hash = Math.imul(hash ^ 0x85ebca6b, 0xc2b2ae35);
  }
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getDistanceFromCampaign(day: number): number {
  return clamp(-day / PRE_CAMPAIGN_HISTORY_DAYS, 0, 1);
}

function getAnchoredScore({
  amplitude,
  channel,
  day,
  drift,
  frequency,
  noise,
  phase,
  reference,
  seed,
}: {
  amplitude: number;
  channel: string;
  day: number;
  drift: number;
  frequency: number;
  noise: number;
  phase: number;
  reference: number;
  seed: number;
}): number {
  const index = day - PRE_CAMPAIGN_START_DAY;
  const distance = getDistanceFromCampaign(day);
  const cycle = Math.sin(index * frequency + phase) * amplitude;
  const dailyNoise =
    (keyedRandom(seed, `pre-campaign-${channel}`, day) - 0.5) * noise;

  // All inherited observations converge on the real DAY 0 snapshot. Keeping
  // the irregularity proportional to the remaining distance avoids a final
  // artificial jump while retaining visibly different histories.
  return round(
    clamp(reference + distance * (drift + cycle + dailyNoise), 0, 100),
    2,
  );
}

type PreCampaignMarketSnapshot = Pick<
  DailyHistory,
  | "cash"
  | "operatingCash"
  | "environmentHealth"
  | "environmentHealthModel"
  | "purchaseTrust"
  | "communitySentiment"
  | "communityPositive"
  | "communityNegative"
>;

function getPreCampaignMarketSnapshots(
  state: GameState,
  settledReference: DailyHistory | undefined,
): PreCampaignMarketSnapshot[] {
  const days = Array.from(
    { length: PRE_CAMPAIGN_HISTORY_DAYS },
    (_, index) => PRE_CAMPAIGN_START_DAY + index,
  );
  const referenceCash = Math.max(
    0,
    settledReference?.cash ?? state.finance.cash,
  );
  const referenceHealth =
    settledReference?.environmentHealthModel === ENVIRONMENT_HEALTH_MODEL &&
      typeof settledReference.environmentHealth === "number"
      ? settledReference.environmentHealth
      : getEnvironmentHealthBreakdown(state).score;
  const referenceTrust = settledReference?.purchaseTrust ?? state.purchaseTrust;
  const referenceSentiment = settledReference?.communitySentiment ?? 46;
  const referencePositive = clamp(
    Math.round(settledReference?.communityPositive ?? 8),
    0,
    20,
  );
  const referenceNegative = clamp(
    Math.round(settledReference?.communityNegative ?? 12),
    0,
    20 - referencePositive,
  );

  const environmentHealth = days.map((day) =>
    getAnchoredScore({
      amplitude: 3.1,
      channel: "environment-health",
      day,
      drift: 4.8,
      frequency: 0.71,
      noise: 2.2,
      phase: 0.35,
      reference: referenceHealth,
      seed: state.seed,
    })
  );
  const purchaseTrust = days.map((day) =>
    getAnchoredScore({
      amplitude: 2.7,
      channel: "purchase-trust",
      day,
      drift: -4.1,
      frequency: 1.13,
      noise: 2.8,
      phase: 1.7,
      reference: referenceTrust,
      seed: state.seed,
    })
  );
  const communitySentiment = days.map((day) =>
    getAnchoredScore({
      amplitude: 7.2,
      channel: "community-sentiment",
      day,
      drift: 1.4,
      frequency: 0.49,
      noise: 5.4,
      phase: 2.45,
      reference: referenceSentiment,
      seed: state.seed,
    })
  );

  // Operating cash is a daily flow; the cash line is reconstructed from those
  // flows instead of independently jittering each point. D-1 is anchored to
  // the actual opening reserve, so the inherited ledger joins DAY 0 exactly.
  const cashFlowScale = Math.min(0.07, referenceCash / 48);
  const generatedCashFlows = days.map((day, index) =>
    round(
      cashFlowScale *
        (Math.sin(index * 0.87 + 0.4) * 0.62 +
          Math.cos(index * 0.37 + 1.1) * 0.28 +
          (keyedRandom(state.seed, "pre-campaign-operating-cash", day) - 0.5) *
            0.7),
    )
  );
  const cash = Array<number>(days.length);
  cash[cash.length - 1] = round(referenceCash);
  for (let index = cash.length - 2; index >= 0; index -= 1) {
    cash[index] = round(
      Math.max(0, cash[index + 1] - generatedCashFlows[index + 1]),
    );
  }
  const operatingCash = cash.map((value, index) =>
    index === 0
      ? generatedCashFlows[0]
      : round(value - cash[index - 1])
  );

  return days.map((day, index) => {
    const sentiment = communitySentiment[index];
    const distance = getDistanceFromCampaign(day);
    const polarizedPosts =
      13 +
      Math.floor(
        keyedRandom(state.seed, "pre-campaign-community-volume", day) * 6,
      );
    const positiveShare = clamp(0.15 + sentiment * 0.007, 0.18, 0.82);
    const observedPositive = Math.round(polarizedPosts * positiveShare);
    const observedNegative = polarizedPosts - observedPositive;
    const communityPositive = Math.round(
      observedPositive * distance + referencePositive * (1 - distance),
    );
    const communityNegative = Math.min(
      20 - communityPositive,
      Math.round(
        observedNegative * distance + referenceNegative * (1 - distance),
      ),
    );

    return {
      cash: cash[index],
      operatingCash: operatingCash[index],
      environmentHealth: environmentHealth[index],
      environmentHealthModel: ENVIRONMENT_HEALTH_MODEL,
      purchaseTrust: purchaseTrust[index],
      communitySentiment: sentiment,
      communityPositive,
      communityNegative,
    };
  });
}

function normalizedPreCampaignShares(
  state: GameState,
  day: number,
): Record<ThemeId, number> {
  const weighted = state.activeThemeIds.map((themeId, index) => {
    const current = state.themes[themeId].share;
    const chronologicalDrift =
      ((day - PRE_CAMPAIGN_START_DAY) /
        Math.max(1, PRE_CAMPAIGN_HISTORY_DAYS - 1) -
        1) *
      (index === 0 ? 0.035 : -0.035 / Math.max(1, state.activeThemeIds.length - 1));
    const noise =
      (keyedRandom(state.seed, "pre-campaign-share", day, themeId) - 0.5) *
      0.018;
    return [themeId, Math.max(0.001, current + chronologicalDrift + noise)] as const;
  });
  const total = weighted.reduce((sum, [, value]) => sum + value, 0);
  return Object.fromEntries(
    weighted.map(([themeId, value]) => [themeId, round(value / total, 9)]),
  ) as Record<ThemeId, number>;
}

/**
 * Reconstructs the fourteen days of tournament and market evidence that
 * existed before the emergency mandate. It is deliberately derived instead
 * of persisted, keeping the save payload small and reloads deterministic.
 */
export function getPreCampaignHistory(state: GameState): DailyHistory[] {
  const settledReference =
    state.history.find((entry) => entry.day === 0) ?? state.history.at(0);
  const totalUsers =
    state.users.tier + state.users.casual + state.users.collector;
  const referenceRevenue = settledReference?.revenue ?? state.finance.today;
  const marketSnapshots = getPreCampaignMarketSnapshots(
    state,
    settledReference,
  );

  const rows: DailyHistory[] = [];
  for (let day = PRE_CAMPAIGN_START_DAY; day < 0; day += 1) {
    const marketSnapshot =
      marketSnapshots[day - PRE_CAMPAIGN_START_DAY];
    const shares = normalizedPreCampaignShares(state, day);
    const winRates = Object.fromEntries(
      state.activeThemeIds.map((themeId) => [
        themeId,
        round(
          Math.max(
            0,
            Math.min(
              1,
              state.themes[themeId].winRate +
                (keyedRandom(state.seed, "pre-campaign-win", day, themeId) -
                  0.5) *
                  0.012,
            ),
          ),
          6,
        ),
      ]),
    ) as Record<ThemeId, number>;
    const topThemeId = state.activeThemeIds.reduce((leader, themeId) =>
      shares[themeId] > shares[leader] ? themeId : leader
    );
    const marketNoise =
      0.94 + keyedRandom(state.seed, "pre-campaign-revenue", day) * 0.12;
    rows.push({
      day,
      totalUsers,
      revenue: round(referenceRevenue * marketNoise),
      ...marketSnapshot,
      topThemeId,
      shares,
      winRates,
      topCutPlacements: getDeterministicDailyTopCutPlacements({
        seed: state.seed,
        day,
        shares,
        winRates,
      }),
    });
  }
  return rows;
}

/** History used by charts and rolling placement reports. */
export function getCampaignAnalysisHistory(state: GameState): DailyHistory[] {
  const preCampaign = getPreCampaignHistory(state);
  return preCampaign.length > 0
    ? [...preCampaign, ...state.history]
    : [...state.history];
}
