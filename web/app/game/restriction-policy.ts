import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import { FIRST_BAN_DAY } from "./campaign.ts";
import {
  getGenericCard,
  type GenericCardId,
  type GenericCardRole,
} from "./generic-card-catalog.ts";
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
  threatThemeIds: ThemeId[];
  threatPressureByTheme: Partial<Record<ThemeId, number>>;
  requiredThreatImpactByTheme: Partial<Record<ThemeId, number>>;
  appliedThreatImpactByTheme: Partial<Record<ThemeId, number>>;
  unaddressedThreatThemeIds: ThemeId[];
  preemptiveCutThemeIds: ThemeId[];
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
  genericCardId?: GenericCardId;
  countsForThreatCoverage: boolean;
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

const GENERIC_ROLE_TO_PART_ROLE: Record<GenericCardRole, PartRole> = {
  enabler: "starter1",
  extender: "starter2",
  interaction: "bridge",
  defense: "bridge",
  recovery: "recursion",
  payoff: "finisher",
};

const THREAT_MINIMUM_SHARE = 0.03;
const THREAT_ADOPTION_START = 0.12;
const THREAT_ADOPTION_RANGE = 0.12;
const THREAT_WIN_RATE_START = 0.51;
const THREAT_WIN_RATE_RANGE = 0.05;
const THREAT_PRESSURE_THRESHOLD = 1;
const THREAT_BASE_REQUIRED_IMPACT = 0.75;
const THREAT_PRESSURE_REQUIRED_IMPACT = 0.9;

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
    countsForThreatCoverage: true,
    previousLimit,
    nextLimit,
    direction,
    impact: part.powerWeight * part.inclusion * availabilityDelta,
    meaningfulCut: direction === "tighten" && before - after > 1e-6,
    cosmetic: direction !== "unchanged" && availabilityDelta <= 1e-6,
  };
}

function makeGenericChangeRecord(
  state: GameState,
  themeId: ThemeId,
  genericCardId: GenericCardId,
  previousLimit: RestrictionLimit,
  nextLimit: RestrictionLimit,
): RestrictionChangeRecord | null {
  const card = getGenericCard(genericCardId);
  if (!card) return null;
  const part: PartContent = {
    id: card.id,
    name: card.name,
    role: GENERIC_ROLE_TO_PART_ROLE[card.role],
    inclusion: clamp(card.appeal / 100, 0.5, 0.95),
    averageCopies: 3,
    preferredCopies: 3,
    powerWeight: clamp((card.basePower - 45) / 2, 3, 22),
    unpleasantWeight: card.unpleasantness / 10,
    tags: ["외부 사용", "범용"],
  };
  const record = makeChangeRecord(
    state.themes[themeId] ? themeId : state.currentTopThemeId,
    part,
    previousLimit,
    nextLimit,
  );
  return {
    ...record,
    genericCardId,
    // A generic cut is counted and scored, but must not masquerade as a
    // theme-specific hit when checking whether every measured threat was cut.
    countsForThreatCoverage: false,
  };
}

function decisionSnapshot(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): DailyHistory | undefined {
  return (
    state.history.find((entry) => entry.day === decisionDay) ??
    (source === "published"
      ? [...state.history]
          .filter((entry) => entry.day <= decisionDay)
          .sort((left, right) => right.day - left.day)[0]
      : undefined)
  );
}

function decisionMeta(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): {
  shares: Readonly<Record<ThemeId, number>>;
  winRates: Readonly<Record<ThemeId, number>>;
} {
  const snapshot = decisionSnapshot(state, decisionDay, source);
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
  const winRates = snapshot?.winRates ??
    (source === "draft"
      ? Object.fromEntries(
          state.activeThemeIds.map((themeId) => [
            themeId,
            state.themes[themeId].winRate,
          ]),
        )
      : {});
  return { shares, winRates };
}

function rankedThemeIds(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): ThemeId[] {
  const { shares } = decisionMeta(state, decisionDay, source);
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

function restrictionThreats(
  state: GameState,
  decisionDay: number,
  source: "draft" | "published",
): Array<{ themeId: ThemeId; pressure: number }> {
  const { shares, winRates } = decisionMeta(state, decisionDay, source);
  return Object.entries(shares)
    .flatMap(([themeId, share]): Array<{
      themeId: ThemeId;
      pressure: number;
      share: number;
    }> => {
      if (!THEME_BY_ID[themeId] || !Number.isFinite(share)) return [];
      const winRate = winRates[themeId] ?? 0.5;
      if (!Number.isFinite(winRate) || share < THREAT_MINIMUM_SHARE) return [];
      const adoptionPressure = clamp(
        (share - THREAT_ADOPTION_START) / THREAT_ADOPTION_RANGE,
        0,
        1,
      );
      const winRatePressure = clamp(
        (winRate - THREAT_WIN_RATE_START) / THREAT_WIN_RATE_RANGE,
        0,
        1,
      );
      const pressure = adoptionPressure + winRatePressure;
      return pressure + 1e-9 >= THREAT_PRESSURE_THRESHOLD
        ? [{ themeId, pressure, share }]
        : [];
    })
    .sort(
      (left, right) =>
        right.pressure - left.pressure ||
        right.share - left.share ||
        left.themeId.localeCompare(right.themeId),
    )
    .map(({ themeId, pressure }) => ({ themeId, pressure }));
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
      batch.products.some(
        (product) =>
          product.kind !== "generic" && product.themeId === themeId,
      )
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
  const decisionSnapshotAtDay = decisionSnapshot(state, decisionDay, source);
  const activeThemeIds =
    source === "published"
      ? decisionSnapshotAtDay
        ? Object.keys(decisionSnapshotAtDay.shares)
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
  const affectedThemeIds = [
    ...new Set(
      records
        .filter((record) => record.countsForThreatCoverage)
        .map((record) => record.themeId),
    ),
  ];
  const affectedThemeCount = affectedThemeIds.length;
  const scope: RestrictionPolicyScope =
    actualChanges.length === 0
      ? "none"
      : actualChanges.length === 1
        ? "single-card"
        : new Set(
              actualChanges.map((record) =>
                record.genericCardId ?? record.themeId
              ),
            ).size === 1
          ? "single-theme"
          : "multi-theme";
  const bandByTheme = tierBandByTheme(state, decisionDay, source);
  const meaningfulCuts = actualChanges.filter((record) => record.meaningfulCut);
  const threatCoverageCuts = meaningfulCuts.filter(
    (record) => record.countsForThreatCoverage,
  );
  const countBand = (band: RestrictionTierBand) =>
    threatCoverageCuts.filter((record) => bandByTheme.get(record.themeId) === band).length;
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
  const threats = restrictionThreats(
    state,
    decisionDay,
    source,
  );
  const threatThemeIds = threats.map(({ themeId }) => themeId);
  const threatPressureByTheme = Object.fromEntries(
    threats.map(({ themeId, pressure }) => [themeId, round(pressure)]),
  );
  const requiredThreatImpactByTheme = Object.fromEntries(
    threats.map(({ themeId, pressure }) => [
      themeId,
      round(
        THREAT_BASE_REQUIRED_IMPACT +
          THREAT_PRESSURE_REQUIRED_IMPACT * pressure,
      ),
    ]),
  );
  const appliedThreatImpactByTheme = Object.fromEntries(
    threats.map(({ themeId }) => [
      themeId,
      round(
        threatCoverageCuts
          .filter((record) => record.themeId === themeId)
          .reduce((sum, record) => sum + record.impact, 0),
      ),
    ]),
  );
  const threatThemeSet = new Set(threatThemeIds);
  const cutThemeIds = new Set(
    threatCoverageCuts.map((record) => record.themeId),
  );
  const unaddressedThreatThemeIds = threatThemeIds.filter(
    (themeId) =>
      (appliedThreatImpactByTheme[themeId] ?? 0) + 1e-9 <
      (requiredThreatImpactByTheme[themeId] ?? Number.POSITIVE_INFINITY),
  );
  const preemptiveCutThemeIds = [...cutThemeIds]
    .filter((themeId) => !threatThemeSet.has(themeId))
    .sort((left, right) => left.localeCompare(right));
  const threatCoverageComplete =
    unaddressedThreatThemeIds.length === 0 &&
    preemptiveCutThemeIds.length === 0;
  // The first restriction is an authored tutorial contract: its fixed two-upper/two-chaser
  // shallow list teaches the editing surface before threat snapshots exist.
  const coverageComplete = decisionDay === FIRST_BAN_DAY
    ? upperMeaningfulCuts >= 2 && tier2MeaningfulCuts >= 2
    : threatCoverageComplete;
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
      const age = record.genericCardId
        ? (() => {
            const release = state.releaseHistory.find((batch) =>
              batch.products.some(
                (product) =>
                  product.kind === "generic" &&
                  product.genericCardId === record.genericCardId,
              ),
            );
            return release ? decisionDay - release.day : null;
          })()
        : latestProductAge(state, decisionDay, record.themeId);
      return age !== null && age <= 30;
    }).length,
    roleCounts,
    totalImpact: round(
      actualChanges.reduce((sum, record) => sum + record.impact, 0),
    ),
    threatThemeIds,
    threatPressureByTheme,
    requiredThreatImpactByTheme,
    appliedThreatImpactByTheme,
    unaddressedThreatThemeIds,
    preemptiveCutThemeIds,
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
    if (!found) {
      const genericCard = getGenericCard(partId);
      if (!genericCard || state.genericLimits[genericCard.id] === undefined) {
        continue;
      }
      const genericRecord = makeGenericChangeRecord(
        state,
        state.currentTopThemeId,
        genericCard.id,
        state.genericLimits[genericCard.id] ?? 3,
        nextLimit,
      );
      if (genericRecord) records.push(genericRecord);
      continue;
    }
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
        !found &&
        event.genericCardId &&
        Number.isInteger(event.previousValue) &&
        Number.isInteger(event.value) &&
        event.previousValue! >= 0 &&
        event.previousValue! <= 3 &&
        event.value! >= 0 &&
        event.value! <= 3
      ) {
        const genericRecord = makeGenericChangeRecord(
          state,
          event.themeId,
          event.genericCardId,
          event.previousValue as RestrictionLimit,
          event.value as RestrictionLimit,
        );
        return genericRecord ? [genericRecord] : [];
      }
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
