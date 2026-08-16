import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import type {
  CommunityEvent,
  DailyHistory,
  GameState,
  PartContent,
  PartRole,
  RestrictionLimit,
  ThemeId,
} from "./types.ts";

export type RestrictionPolicyQuality = "balanced" | "narrow" | "incomplete";
export type RestrictionPolicyScope =
  | "none"
  | "single-card"
  | "single-theme"
  | "multi-theme";
export type RestrictionTierBand = "upper" | "tier2" | "lower";

export interface RestrictionPolicyProfile {
  decisionDay: number;
  quality: RestrictionPolicyQuality;
  changeCount: number;
  scope: RestrictionPolicyScope;
  directionMix: {
    tighten: number;
    loosen: number;
    unchanged: number;
  };
  meaningfulCutCount: number;
  upperMeaningfulCuts: number;
  tier2MeaningfulCuts: number;
  lowerMeaningfulCuts: number;
  affectedThemeIds: ThemeId[];
  affectedThemeCount: number;
  staleEligible: number;
  staleLoosened: number;
  staleFullyReleased: number;
  cosmeticChanges: number;
  sharedChanges: number;
  recentProductChanges: number;
  roleCounts: Record<PartRole, number>;
  totalImpact: number;
  coverageComplete: boolean;
  staleReliefComplete: boolean;
}

export type RestrictionOutcomeClassification =
  | "pending"
  | "stabilized"
  | "ineffective"
  | "overcorrected"
  | "replacement"
  | "mixed";

export interface RestrictionOutcomeMetrics {
  topShare: number;
  topThreeShare: number;
  hhi: number;
  targetedShare: number;
  totalUsers: number;
}

export interface RestrictionHistoricalOutcome {
  classification: RestrictionOutcomeClassification;
  decisionDay: number;
  followupDay: number | null;
  targetedThemeIds: ThemeId[];
  decisionMetrics: RestrictionOutcomeMetrics;
  followupMetrics: RestrictionOutcomeMetrics | null;
  topShareDelta: number;
  topThreeShareDelta: number;
  hhiDelta: number;
  targetedShareDelta: number;
  userDelta: number;
  userRateDelta: number;
}

type RestrictionDirection = "tighten" | "loosen" | "unchanged";

type RestrictionChangeRecord = {
  themeId: ThemeId;
  part: PartContent;
  previousLimit: RestrictionLimit;
  nextLimit: RestrictionLimit;
  direction: RestrictionDirection;
  impact: number;
  meaningfulCut: boolean;
  cosmetic: boolean;
};

const ROLE_EXPONENT: Record<PartRole, number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

const EMPTY_ROLE_COUNTS: Record<PartRole, number> = {
  starter1: 0,
  starter2: 0,
  bridge: 0,
  finisher: 0,
  recursion: 0,
};

const PART_BY_ID = new Map(
  THEMES.flatMap((theme) =>
    theme.parts.map((part) => [part.id, { themeId: theme.id, part }] as const),
  ),
);

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function partAvailability(part: PartContent, limit: RestrictionLimit): number {
  const preferred = Math.min(3, Math.max(1, part.preferredCopies));
  const allowed = Math.min(preferred, limit);
  if (allowed <= 0) return 0;
  if (allowed >= preferred) return 1;
  return (allowed / preferred) ** ROLE_EXPONENT[part.role];
}

function makeChangeRecord(
  themeId: ThemeId,
  part: PartContent,
  previousLimit: RestrictionLimit,
  nextLimit: RestrictionLimit,
): RestrictionChangeRecord {
  const before = partAvailability(part, previousLimit);
  const after = partAvailability(part, nextLimit);
  const direction: RestrictionDirection =
    nextLimit < previousLimit
      ? "tighten"
      : nextLimit > previousLimit
        ? "loosen"
        : "unchanged";
  const availabilityDelta = Math.abs(after - before);
  return {
    themeId,
    part,
    previousLimit,
    nextLimit,
    direction,
    impact: part.powerWeight * part.inclusion * availabilityDelta,
    meaningfulCut: direction === "tighten" && before - after > 1e-6,
    cosmetic: direction !== "unchanged" && availabilityDelta <= 1e-6,
  };
}

function rankedThemeIds(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): ThemeId[] {
  const snapshot =
    state.history.find((entry) => entry.day === decisionDay) ??
    (source === "published"
      ? [...state.history]
          .filter((entry) => entry.day <= decisionDay)
          .sort((left, right) => right.day - left.day)[0]
      : undefined);
  const shares = snapshot
    ? snapshot.shares
    : source === "draft"
      ? Object.fromEntries(
          state.activeThemeIds.map((themeId) => [
            themeId,
            state.themes[themeId].share,
          ]),
        )
      : {};
  return Object.entries(shares)
    .filter(
      ([themeId, share]) =>
        Boolean(THEME_BY_ID[themeId]) && Number.isFinite(share) && share > 0,
    )
    .sort(
      ([leftId, leftShare], [rightId, rightShare]) =>
        rightShare - leftShare || leftId.localeCompare(rightId),
    )
    .map(([themeId]) => themeId);
}

function tierBandByTheme(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): Map<ThemeId, RestrictionTierBand> {
  return new Map(
    rankedThemeIds(state, decisionDay, source).map((themeId, rank) => [
      themeId,
      rank <= 2 ? "upper" : rank <= 5 ? "tier2" : "lower",
    ]),
  );
}

function isRestrictionDecisionEvent(event: CommunityEvent): boolean {
  return (
    event.type === "restriction-applied" ||
    event.type === "cosmetic-restriction" ||
    event.type === "restriction-no-change"
  );
}

function restrictionStateBefore(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
  partId: string,
): { limit: RestrictionLimit; restrictedSince: number | null } {
  let limit: RestrictionLimit = 3;
  let restrictedSince: number | null = null;
  const events = state.community
    .filter(
      (event) =>
        event.day < decisionDay &&
        event.themeId === themeId &&
        event.partId === partId &&
        isRestrictionDecisionEvent(event) &&
        Number.isInteger(event.value) &&
        event.value! >= 0 &&
        event.value! <= 3,
    )
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
  for (const event of events) {
    const nextLimit = event.value as RestrictionLimit;
    if (limit === 3 && nextLimit < 3) restrictedSince = event.day;
    if (nextLimit === 3) restrictedSince = null;
    limit = nextLimit;
  }
  return { limit, restrictedSince };
}

function latestProductAge(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
): number | null {
  let latestDay: number | null = null;
  for (const batch of state.releaseHistory) {
    if (
      batch.day <= decisionDay &&
      batch.products.some((product) => product.themeId === themeId)
    ) {
      latestDay = latestDay === null ? batch.day : Math.max(latestDay, batch.day);
    }
  }
  return latestDay === null ? null : decisionDay - latestDay;
}

function staleRestrictionKeys(
  state: GameState,
  decisionDay: number,
  previousLimitByPart: ReadonlyMap<string, RestrictionLimit>,
  source: "draft" | "published",
): Set<string> {
  const keys = new Set<string>();
  const decisionSnapshot =
    state.history.find((entry) => entry.day === decisionDay) ??
    (source === "published"
      ? [...state.history]
          .filter((entry) => entry.day <= decisionDay)
          .sort((left, right) => right.day - left.day)[0]
      : undefined);
  const activeThemeIds =
    source === "published"
      ? decisionSnapshot
        ? Object.keys(decisionSnapshot.shares)
        : []
      : state.activeThemeIds;
  for (const themeId of activeThemeIds) {
    const runtime = state.themes[themeId];
    const content = THEME_BY_ID[themeId];
    if (!content) continue;
    const supportCountBeforeDecision = state.releaseHistory.reduce(
      (count, batch) =>
        count +
        (batch.day <= decisionDay
          ? batch.products.filter(
              (product) =>
                product.kind === "support" && product.themeId === themeId,
            ).length
          : 0),
      0,
    );
    const releasedPartIds =
      source === "published"
        ? content.parts
            .slice(
              0,
              INITIAL_THEME_PART_COUNT +
                SUPPORT_PARTS_PER_RELEASE * supportCountBeforeDecision,
            )
            .map((part) => part.id)
        : runtime?.releasedPartIds ?? [];
    for (const partId of releasedPartIds) {
      const historical = restrictionStateBefore(
        state,
        decisionDay,
        themeId,
        partId,
      );
      const limit =
        previousLimitByPart.get(partId) ??
        (source === "published"
          ? historical.limit
          : runtime?.legalLimits[partId] ?? historical.limit);
      if (limit >= 3) continue;
      const restrictedSince = historical.restrictedSince;
      if (restrictedSince !== null && decisionDay - restrictedSince >= 90) {
        keys.add(partId);
      }
    }
  }
  return keys;
}

function buildProfile(
  state: GameState,
  decisionDay: number,
  records: readonly RestrictionChangeRecord[],
  source: "draft" | "published",
): RestrictionPolicyProfile {
  const actualChanges = records.filter((record) => record.direction !== "unchanged");
  const directionMix = {
    tighten: records.filter((record) => record.direction === "tighten").length,
    loosen: records.filter((record) => record.direction === "loosen").length,
    unchanged: records.filter((record) => record.direction === "unchanged").length,
  };
  const affectedThemeIds = [...new Set(records.map((record) => record.themeId))];
  const affectedThemeCount = affectedThemeIds.length;
  const scope: RestrictionPolicyScope =
    actualChanges.length === 0
      ? "none"
      : actualChanges.length === 1
        ? "single-card"
        : new Set(actualChanges.map((record) => record.themeId)).size === 1
          ? "single-theme"
          : "multi-theme";
  const bandByTheme = tierBandByTheme(state, decisionDay, source);
  const meaningfulCuts = actualChanges.filter((record) => record.meaningfulCut);
  const countBand = (band: RestrictionTierBand) =>
    meaningfulCuts.filter((record) => bandByTheme.get(record.themeId) === band).length;
  const upperMeaningfulCuts = countBand("upper");
  const tier2MeaningfulCuts = countBand("tier2");
  const lowerMeaningfulCuts = countBand("lower");
  const previousLimitByPart = new Map(
    records.map((record) => [record.part.id, record.previousLimit] as const),
  );
  const staleKeys = staleRestrictionKeys(
    state,
    decisionDay,
    previousLimitByPart,
    source,
  );
  const staleLoosened = new Set(
    actualChanges
      .filter(
        (record) =>
          record.direction === "loosen" && staleKeys.has(record.part.id),
      )
      .map((record) => record.part.id),
  ).size;
  const staleFullyReleased = new Set(
    actualChanges
      .filter(
        (record) =>
          record.direction === "loosen" &&
          record.nextLimit === 3 &&
          staleKeys.has(record.part.id),
      )
      .map((record) => record.part.id),
  ).size;
  const coverageComplete = upperMeaningfulCuts >= 2 && tier2MeaningfulCuts >= 2;
  const staleReliefComplete = staleKeys.size === 0 || staleFullyReleased >= 1;
  const quality: RestrictionPolicyQuality =
    coverageComplete && staleReliefComplete
      ? "balanced"
      : meaningfulCuts.length <= 2
        ? "narrow"
        : "incomplete";
  const roleCounts = { ...EMPTY_ROLE_COUNTS };
  for (const record of actualChanges) roleCounts[record.part.role] += 1;

  return {
    decisionDay,
    quality,
    changeCount: actualChanges.length,
    scope,
    directionMix,
    meaningfulCutCount: meaningfulCuts.length,
    upperMeaningfulCuts,
    tier2MeaningfulCuts,
    lowerMeaningfulCuts,
    affectedThemeIds,
    affectedThemeCount,
    staleEligible: staleKeys.size,
    staleLoosened,
    staleFullyReleased,
    cosmeticChanges: actualChanges.filter((record) => record.cosmetic).length,
    sharedChanges: actualChanges.filter((record) =>
      record.part.tags.includes("외부 사용"),
    ).length,
    recentProductChanges: actualChanges.filter((record) => {
      const age = latestProductAge(state, decisionDay, record.themeId);
      return age !== null && age <= 30;
    }).length,
    roleCounts,
    totalImpact: round(
      actualChanges.reduce((sum, record) => sum + record.impact, 0),
    ),
    coverageComplete,
    staleReliefComplete,
  };
}

/** Profiles a draft against the official limits and meta visible at the gate. */
export function getRestrictionPolicyProfile(
  state: GameState,
  changes: Readonly<Record<string, RestrictionLimit>>,
): RestrictionPolicyProfile {
  const records: RestrictionChangeRecord[] = [];
  for (const [partId, nextLimit] of Object.entries(changes)) {
    const found = PART_BY_ID.get(partId);
    if (!found) continue;
    const runtime = state.themes[found.themeId];
    if (!runtime?.releasedPartIds.includes(partId)) continue;
    const previousLimit = runtime.legalLimits[partId] ?? 3;
    records.push(
      makeChangeRecord(found.themeId, found.part, previousLimit, nextLimit),
    );
  }
  return buildProfile(state, state.day, records, "draft");
}

/** Reconstructs a published list from immutable decision events on that day. */
export function getPublishedRestrictionPolicyProfile(
  state: GameState,
  decisionDay: number,
): RestrictionPolicyProfile {
  const records = state.community
    .filter(
      (event) =>
        event.day === decisionDay &&
        isRestrictionDecisionEvent(event) &&
        Boolean(event.partId) &&
        Number.isInteger(event.previousValue) &&
        Number.isInteger(event.value),
    )
    .flatMap((event): RestrictionChangeRecord[] => {
      const found = event.partId ? PART_BY_ID.get(event.partId) : undefined;
      if (
        !found ||
        event.previousValue! < 0 ||
        event.previousValue! > 3 ||
        event.value! < 0 ||
        event.value! > 3
      ) {
        return [];
      }
      return [
        makeChangeRecord(
          found.themeId,
          found.part,
          event.previousValue as RestrictionLimit,
          event.value as RestrictionLimit,
        ),
      ];
    });
  return buildProfile(state, decisionDay, records, "published");
}

function metricsForSnapshot(
  snapshot: DailyHistory,
  targetedThemeIds: readonly ThemeId[],
): RestrictionOutcomeMetrics {
  const shares = Object.values(snapshot.shares).filter(
    (share) => Number.isFinite(share) && share >= 0,
  );
  const ranked = [...shares].sort((left, right) => right - left);
  return {
    topShare: round(ranked[0] ?? 0),
    topThreeShare: round(ranked.slice(0, 3).reduce((sum, share) => sum + share, 0)),
    hhi: round(shares.reduce((sum, share) => sum + share ** 2, 0)),
    targetedShare: round(
      targetedThemeIds.reduce(
        (sum, themeId) => sum + (snapshot.shares[themeId] ?? 0),
        0,
      ),
    ),
    totalUsers: snapshot.totalUsers,
  };
}

/**
 * Classifies an observed result using recorded daily snapshots only. Runtime
 * theme values are deliberately excluded so old community copy stays stable.
 */
export function getRestrictionHistoricalOutcome(
  state: GameState,
  decisionDay: number,
  followupDay: number,
): RestrictionHistoricalOutcome {
  const profile = getPublishedRestrictionPolicyProfile(state, decisionDay);
  const meaningfullyTightenedThemeIds = [
    ...new Set(
      state.community
        .filter(
          (event) =>
            event.day === decisionDay &&
            isRestrictionDecisionEvent(event) &&
            Boolean(event.partId) &&
            Number.isInteger(event.previousValue) &&
            Number.isInteger(event.value) &&
            event.previousValue! > event.value!,
        )
        .flatMap((event): ThemeId[] => {
          const found = event.partId ? PART_BY_ID.get(event.partId) : undefined;
          if (
            !found ||
            event.previousValue! < 0 ||
            event.previousValue! > 3 ||
            event.value! < 0 ||
            event.value! > 3
          ) {
            return [];
          }
          const record = makeChangeRecord(
            found.themeId,
            found.part,
            event.previousValue as RestrictionLimit,
            event.value as RestrictionLimit,
          );
          return record.meaningfulCut ? [found.themeId] : [];
        }),
    ),
  ];
  const targetedThemeIds =
    meaningfullyTightenedThemeIds.length > 0
      ? meaningfullyTightenedThemeIds
      : profile.affectedThemeIds;
  const decisionSnapshot = state.history.find((entry) => entry.day === decisionDay);
  if (!decisionSnapshot) {
    throw new Error(`Missing restriction decision snapshot for DAY ${decisionDay}.`);
  }
  const decisionMetrics = metricsForSnapshot(
    decisionSnapshot,
    targetedThemeIds,
  );
  const followupSnapshot =
    followupDay > decisionDay
      ? state.history.find((entry) => entry.day === followupDay)
      : undefined;
  if (!followupSnapshot) {
    return {
      classification: "pending",
      decisionDay,
      followupDay: null,
      targetedThemeIds,
      decisionMetrics,
      followupMetrics: null,
      topShareDelta: 0,
      topThreeShareDelta: 0,
      hhiDelta: 0,
      targetedShareDelta: 0,
      userDelta: 0,
      userRateDelta: 0,
    };
  }

  const followupMetrics = metricsForSnapshot(
    followupSnapshot,
    targetedThemeIds,
  );
  const topShareDelta = round(followupMetrics.topShare - decisionMetrics.topShare);
  const topThreeShareDelta = round(
    followupMetrics.topThreeShare - decisionMetrics.topThreeShare,
  );
  const hhiDelta = round(followupMetrics.hhi - decisionMetrics.hhi);
  const targetedShareDelta = round(
    followupMetrics.targetedShare - decisionMetrics.targetedShare,
  );
  const userDelta = round(followupMetrics.totalUsers - decisionMetrics.totalUsers, 2);
  const userRateDelta = round(
    decisionMetrics.totalUsers > 0 ? userDelta / decisionMetrics.totalUsers : 0,
  );
  const averageTargetedDelta =
    targetedThemeIds.length > 0
      ? targetedShareDelta / targetedThemeIds.length
      : 0;
  const targetedDropRate =
    decisionMetrics.targetedShare > 0
      ? -targetedShareDelta / decisionMetrics.targetedShare
      : 0;
  const concentrationImprovementCount = [
    topShareDelta <= -0.004,
    topThreeShareDelta <= -0.006,
    hhiDelta <= -0.001,
  ].filter(Boolean).length;
  const healthyFollowup =
    followupMetrics.topShare <= 0.32 &&
    followupMetrics.topThreeShare <= 0.67 &&
    followupMetrics.hhi <= 0.18;
  const severeTargetedCollapse =
    (averageTargetedDelta <= -0.05 && targetedDropRate >= 0.2) ||
    (averageTargetedDelta <= -0.03 &&
      targetedDropRate >= 0.16 &&
      userRateDelta <= -0.03);
  const almostNoMovement =
    Math.abs(targetedShareDelta) < 0.006 &&
    Math.abs(topShareDelta) < 0.004 &&
    Math.abs(hhiDelta) < 0.001;
  let classification: RestrictionOutcomeClassification;
  if (severeTargetedCollapse) {
    classification = "overcorrected";
  } else if (almostNoMovement) {
    classification = "ineffective";
  } else if (
    targetedShareDelta <= -0.01 &&
    topShareDelta > -0.003 &&
    hhiDelta > -0.001
  ) {
    classification = "replacement";
  } else if (
    healthyFollowup &&
    averageTargetedDelta <= -0.005 &&
    concentrationImprovementCount >= 2 &&
    userRateDelta > -0.02
  ) {
    classification = "stabilized";
  } else {
    classification = "mixed";
  }

  return {
    classification,
    decisionDay,
    followupDay,
    targetedThemeIds,
    decisionMetrics,
    followupMetrics,
    topShareDelta,
    topThreeShareDelta,
    hhiDelta,
    targetedShareDelta,
    userDelta,
    userRateDelta,
  };
}
