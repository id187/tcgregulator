import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEME_BY_ID,
} from "./content.ts";
import { BAN_INTERVAL, FIRST_BAN_DAY, LAST_DECISION_DAY } from "./campaign.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionPolicyProfile,
} from "./restriction-policy.ts";
import type {
  RestrictionPolicyProfile,
  RestrictionTierBand,
} from "./restriction-policy.ts";
import type {
  CommunityEvent,
  GameState,
  PartContent,
  PartRole,
  RestrictionLimit,
  ThemeId,
} from "./types.ts";

export type RestrictionDecisionSignalSource = "draft" | "published";

export type RestrictionDecisionSignalKind =
  | "no-change-justified"
  | "no-change-risk"
  | "lower-only"
  | "upper-ignored"
  | "upper-dependency-hit"
  | "recent-product-cut"
  | "low-usage-cut"
  | "shared-external-use"
  | "stale-release"
  | "stale-ignored"
  | "cosmetic"
  | "overbroad"
  | "balanced"
  | "accessibility-pressure"
  | "replacement-risk"
  | "counter-research-pending"
  | "collector-backlash"
  | "competitive-demand-addressed";

export type RestrictionStakeholder =
  | "competitive"
  | "casual"
  | "collector"
  | "retail"
  | "design"
  | "counter-research"
  | "regulator";

export type RestrictionChangeDirection = "tighten" | "loosen" | "unchanged";

export interface RestrictionDecisionTarget {
  themeId: ThemeId;
  partId: string;
  previousLimit: RestrictionLimit;
  nextLimit: RestrictionLimit;
  direction: RestrictionChangeDirection;
  tierBand: RestrictionTierBand;
  themeRank: number;
  share: number;
  usageRate: number;
  averageCopies: number;
  impact: number;
  meaningful: boolean;
  cosmetic: boolean;
  sharedExternalUse: boolean;
  recentProductAge: number | null;
  staleBeforeDecision: boolean;
}

export interface RestrictionDecisionSignal {
  id: string;
  kind: RestrictionDecisionSignalKind;
  pressure: number;
  themeId: ThemeId;
  partId: string;
  relatedPartId?: string;
  stakeholders: RestrictionStakeholder[];
  title: string;
  supportingArgument: string;
  opposingArgument: string;
  recommendedLimit?: RestrictionLimit;
}

export interface RestrictionDecisionSignalFlags {
  noChange: boolean;
  noChangeJustified: boolean;
  lowerOnly: boolean;
  upperIgnored: boolean;
  upperDependencyHit: boolean;
  recentProductCut: boolean;
  lowUsageCut: boolean;
  sharedExternalUse: boolean;
  staleRelease: boolean;
  staleIgnored: boolean;
  cosmetic: boolean;
  overbroad: boolean;
  balanced: boolean;
  accessibilityPressure: boolean;
  replacementRisk: boolean;
  counterResearchPending: boolean;
  collectorBacklash: boolean;
  competitiveDemandAddressed: boolean;
}

export interface RestrictionDecisionSignals {
  decisionDay: number;
  source: RestrictionDecisionSignalSource;
  profile: RestrictionPolicyProfile;
  targets: RestrictionDecisionTarget[];
  staleEligiblePartIds: string[];
  kinds: RestrictionDecisionSignalKind[];
  flags: RestrictionDecisionSignalFlags;
  signals: RestrictionDecisionSignal[];
}

type InternalTarget = RestrictionDecisionTarget & {
  part: PartContent;
  restrictedSince: number | null;
};

const ROLE_EXPONENT: Record<PartRole, number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

const PART_BY_ID = new Map(
  Object.values(THEME_BY_ID).flatMap((theme) =>
    theme.parts.map((part) => [part.id, { themeId: theme.id, part }] as const),
  ),
);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function isRestrictionDay(day: number): boolean {
  return (
    Number.isInteger(day) &&
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0
  );
}

function assertRestrictionDay(day: number): void {
  if (!isRestrictionDay(day)) {
    throw new RangeError(`DAY ${day} is not a scheduled restriction review.`);
  }
}

function keyedUint(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const text = keys.join("\u001f");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function direction(
  previousLimit: RestrictionLimit,
  nextLimit: RestrictionLimit,
): RestrictionChangeDirection {
  if (nextLimit < previousLimit) return "tighten";
  if (nextLimit > previousLimit) return "loosen";
  return "unchanged";
}

function availability(part: PartContent, limit: RestrictionLimit): number {
  const preferred = clamp(part.preferredCopies, 1, 3);
  const allowed = Math.min(preferred, limit);
  if (allowed <= 0) return 0;
  if (allowed >= preferred) return 1;
  return (allowed / preferred) ** ROLE_EXPONENT[part.role];
}

function decisionShares(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
): Record<string, number> {
  const exact = state.history.find((entry) => entry.day === decisionDay);
  if (exact) return exact.shares;
  if (source === "published") {
    const latest = [...state.history]
      .filter((entry) => entry.day <= decisionDay)
      .sort((left, right) => right.day - left.day)[0];
    return latest?.shares ?? {};
  }
  return Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      state.themes[themeId]?.share ?? 0,
    ]),
  );
}

function rankedThemeIds(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
): ThemeId[] {
  return Object.entries(decisionShares(state, decisionDay, source))
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

function tierBand(rank: number): RestrictionTierBand {
  if (rank <= 2) return "upper";
  if (rank <= 5) return "tier2";
  return "lower";
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

function isRestrictionEvent(event: CommunityEvent): boolean {
  return (
    event.type === "restriction-applied" ||
    event.type === "cosmetic-restriction" ||
    event.type === "restriction-no-change"
  );
}

function restrictionBefore(
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
        isRestrictionEvent(event) &&
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

function releasedPartIds(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  themeId: ThemeId,
): string[] {
  if (source === "draft") {
    return [...(state.themes[themeId]?.releasedPartIds ?? [])];
  }
  const supportCount = state.releaseHistory.reduce(
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
  return (
    THEME_BY_ID[themeId]?.parts
      .slice(
        0,
        INITIAL_THEME_PART_COUNT + supportCount * SUPPORT_PARTS_PER_RELEASE,
      )
      .map((part) => part.id) ?? []
  );
}

function usageFor(
  state: GameState,
  source: RestrictionDecisionSignalSource,
  themeId: ThemeId,
  part: PartContent,
): { usageRate: number; averageCopies: number } {
  if (source === "draft") {
    const stats = state.themes[themeId]?.partStats[part.id];
    if (stats) return stats;
  }
  return {
    usageRate: part.inclusion,
    averageCopies: part.averageCopies,
  };
}

function makeTarget(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  rankByTheme: ReadonlyMap<ThemeId, number>,
  themeId: ThemeId,
  part: PartContent,
  previousLimit: RestrictionLimit,
  nextLimit: RestrictionLimit,
): InternalTarget {
  const before = availability(part, previousLimit);
  const after = availability(part, nextLimit);
  const targetDirection = direction(previousLimit, nextLimit);
  const availabilityDelta = Math.abs(before - after);
  const rank = rankByTheme.get(themeId) ?? Number.MAX_SAFE_INTEGER;
  const stats = usageFor(state, source, themeId, part);
  const restriction = restrictionBefore(
    state,
    decisionDay,
    themeId,
    part.id,
  );
  return {
    themeId,
    partId: part.id,
    part,
    previousLimit,
    nextLimit,
    direction: targetDirection,
    tierBand: tierBand(rank),
    themeRank: rank,
    share: decisionShares(state, decisionDay, source)[themeId] ?? 0,
    usageRate: round(stats.usageRate),
    averageCopies: round(stats.averageCopies),
    impact: round(part.powerWeight * part.inclusion * availabilityDelta),
    meaningful: targetDirection === "tighten" && before - after > 1e-6,
    cosmetic: targetDirection !== "unchanged" && availabilityDelta <= 1e-6,
    sharedExternalUse: part.tags.includes("외부 사용"),
    recentProductAge: latestProductAge(state, decisionDay, themeId),
    staleBeforeDecision:
      restriction.limit < 3 &&
      restriction.restrictedSince !== null &&
      decisionDay - restriction.restrictedSince >= 90,
    restrictedSince: restriction.restrictedSince,
  };
}

function draftTargets(
  state: GameState,
  changes: Readonly<Record<string, RestrictionLimit>>,
  rankByTheme: ReadonlyMap<ThemeId, number>,
): InternalTarget[] {
  return Object.entries(changes).flatMap(([partId, nextLimit]) => {
    const found = PART_BY_ID.get(partId);
    if (!found || !Number.isInteger(nextLimit) || nextLimit < 0 || nextLimit > 3) {
      return [];
    }
    const runtime = state.themes[found.themeId];
    if (!runtime?.releasedPartIds.includes(partId)) return [];
    return [
      makeTarget(
        state,
        state.day,
        "draft",
        rankByTheme,
        found.themeId,
        found.part,
        runtime.legalLimits[partId] ?? 3,
        nextLimit,
      ),
    ];
  });
}

function publishedTargets(
  state: GameState,
  decisionDay: number,
  rankByTheme: ReadonlyMap<ThemeId, number>,
): InternalTarget[] {
  return state.community
    .filter(
      (event) =>
        event.day === decisionDay &&
        isRestrictionEvent(event) &&
        Boolean(event.partId) &&
        Number.isInteger(event.previousValue) &&
        Number.isInteger(event.value) &&
        event.previousValue! >= 0 &&
        event.previousValue! <= 3 &&
        event.value! >= 0 &&
        event.value! <= 3,
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((event): InternalTarget[] => {
      const found = event.partId ? PART_BY_ID.get(event.partId) : undefined;
      if (!found || found.themeId !== event.themeId) return [];
      return [
        makeTarget(
          state,
          decisionDay,
          "published",
          rankByTheme,
          found.themeId,
          found.part,
          event.previousValue as RestrictionLimit,
          event.value as RestrictionLimit,
        ),
      ];
    });
}

function unchangedTargets(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  ranked: readonly ThemeId[],
  rankByTheme: ReadonlyMap<ThemeId, number>,
): InternalTarget[] {
  return ranked.flatMap((themeId) => {
    const content = THEME_BY_ID[themeId];
    return releasedPartIds(state, decisionDay, source, themeId).flatMap(
      (partId): InternalTarget[] => {
        const part = content?.parts.find((candidate) => candidate.id === partId);
        if (!part) return [];
        const historical = restrictionBefore(
          state,
          decisionDay,
          themeId,
          partId,
        );
        const limit =
          source === "draft"
            ? state.themes[themeId]?.legalLimits[partId] ?? historical.limit
            : historical.limit;
        return [
          makeTarget(
            state,
            decisionDay,
            source,
            rankByTheme,
            themeId,
            part,
            limit,
            limit,
          ),
        ];
      },
    );
  });
}

function dependencyScore(target: InternalTarget): number {
  const roleMultiplier =
    target.part.role === "starter1" || target.part.role === "starter2"
      ? 1.18
      : target.part.role === "bridge"
        ? 1.08
        : 1;
  return (
    target.usageRate *
    Math.max(0.5, target.averageCopies) *
    target.part.powerWeight *
    roleMultiplier
  );
}

function sortByScore(
  state: GameState,
  decisionDay: number,
  purpose: string,
  targets: readonly InternalTarget[],
  score: (target: InternalTarget) => number,
): InternalTarget[] {
  return [...targets].sort(
    (left, right) =>
      score(right) - score(left) ||
      keyedUint(state.seed, decisionDay, purpose, left.partId) -
        keyedUint(state.seed, decisionDay, purpose, right.partId) ||
      left.partId.localeCompare(right.partId),
  );
}

function meaningfulRecommendation(target: InternalTarget): RestrictionLimit {
  if (target.previousLimit <= 0) return 0;
  if (target.part.preferredCopies <= 1) return 0;
  if (target.part.preferredCopies <= 2) {
    return Math.min(target.previousLimit - 1, 1) as RestrictionLimit;
  }
  return Math.min(target.previousLimit - 1, 2) as RestrictionLimit;
}

function historicalCounterMaturity(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
): number {
  let maturity = 0;
  for (const event of state.community) {
    if (event.day > decisionDay || event.themeId !== themeId) continue;
    if (event.type === "counter-rumor") maturity = Math.max(maturity, 0.35);
    if (event.type === "counter-found") maturity = Math.max(maturity, 0.68);
    if (event.type === "counter-adopted") maturity = Math.max(maturity, 1);
  }
  return maturity;
}

function counterMaturity(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  themeId: ThemeId,
): number {
  if (source === "published") {
    return historicalCounterMaturity(state, decisionDay, themeId);
  }
  const runtime = state.themes[themeId];
  if (!runtime) return 0;
  const research =
    runtime.counterThreshold > 0
      ? runtime.counterProgress / runtime.counterThreshold
      : 0;
  return clamp(Math.max(research, runtime.counterAdoption), 0, 1);
}

function buildSignals(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  profile: RestrictionPolicyProfile,
  targets: InternalTarget[],
  ranked: readonly ThemeId[],
  rankByTheme: ReadonlyMap<ThemeId, number>,
): { signals: RestrictionDecisionSignal[]; staleEligiblePartIds: string[] } {
  const candidates = unchangedTargets(
    state,
    decisionDay,
    source,
    ranked,
    rankByTheme,
  );
  const actual = targets.filter((target) => target.direction !== "unchanged");
  const tighten = targets.filter((target) => target.direction === "tighten");
  const meaningful = tighten.filter((target) => target.meaningful);
  const loosen = targets.filter((target) => target.direction === "loosen");
  const topCandidate = sortByScore(
    state,
    decisionDay,
    "top-dependency",
    candidates.filter((target) => target.tierBand === "upper"),
    (target) => dependencyScore(target) + 120 * target.share,
  )[0] ?? candidates[0];
  const staleCandidates = candidates.filter((target) => {
    const restriction = restrictionBefore(
      state,
      decisionDay,
      target.themeId,
      target.partId,
    );
    return (
      restriction.limit < 3 &&
      restriction.restrictedSince !== null &&
      decisionDay - restriction.restrictedSince >= 90
    );
  });
  const staleEligiblePartIds = staleCandidates
    .map((target) => target.partId)
    .sort((left, right) => left.localeCompare(right));
  const signals: RestrictionDecisionSignal[] = [];
  const seenKinds = new Set<RestrictionDecisionSignalKind>();

  const add = (
    kind: RestrictionDecisionSignalKind,
    pressure: number,
    target: InternalTarget | undefined,
    details: Omit<
      RestrictionDecisionSignal,
      "id" | "kind" | "pressure" | "themeId" | "partId"
    >,
  ) => {
    if (!target || seenKinds.has(kind)) return;
    seenKinds.add(kind);
    signals.push({
      id: `restriction-signal-${decisionDay}-${kind}-${target.partId}`,
      kind,
      pressure: Math.round(clamp(pressure, 0, 100)),
      themeId: target.themeId,
      partId: target.partId,
      ...details,
    });
  };

  if (profile.changeCount === 0 && topCandidate) {
    const shares = Object.values(decisionShares(state, decisionDay, source)).sort(
      (left, right) => right - left,
    );
    const topShare = shares[0] ?? 0;
    const topThreeShare = shares.slice(0, 3).reduce((sum, share) => sum + share, 0);
    const snapshot = state.history.find((entry) => entry.day === decisionDay);
    const trust =
      snapshot?.purchaseTrust ?? (source === "draft" ? state.purchaseTrust : 65);
    const environmentHealth = snapshot?.environmentHealth ??
      clamp(100 - topShare * 130 - Math.max(0, topThreeShare - 0.45) * 100, 0, 100);
    const justified =
      topShare <= 0.2 &&
      topThreeShare <= 0.52 &&
      trust >= 55 &&
      environmentHealth >= 50;
    if (justified) {
      add("no-change-justified", 58 + environmentHealth * 0.25, topCandidate, {
        stakeholders: ["regulator", "casual", "design"],
        title: "무변경을 정당화할 여지가 있음",
        supportingArgument: `1위 점유율 ${percent(topShare)}, 상위 3개 합계 ${percent(topThreeShare)}라 즉시 개입보다 관찰을 택할 수 있습니다.`,
        opposingArgument: `${THEME_BY_ID[topCandidate.themeId].shortName}의 핵심 의존도는 남아 있어 다음 검토까지의 감시 기준이 필요합니다.`,
        recommendedLimit: topCandidate.previousLimit,
      });
    } else {
      add("no-change-risk", 55 + topShare * 160 + (100 - environmentHealth) * 0.25, topCandidate, {
        stakeholders: ["competitive", "regulator", "casual"],
        title: "무변경의 설명 책임이 큼",
        supportingArgument: "성급한 제한이 대체재 쏠림을 만들 수 있어 추가 관찰 논리는 성립합니다.",
        opposingArgument: `1위 ${percent(topShare)}, 상위 3개 ${percent(topThreeShare)}인 환경에서 아무 조치도 없으면 경쟁층 요구를 외면했다는 평가를 받을 수 있습니다.`,
        recommendedLimit: meaningfulRecommendation(topCandidate),
      });
    }
  }

  if (
    meaningful.length > 0 &&
    meaningful.every((target) => target.tierBand === "lower")
  ) {
    const target = sortByScore(
      state,
      decisionDay,
      "lower-only",
      meaningful,
      dependencyScore,
    )[0];
    add("lower-only", 72 + meaningful.length * 4, target, {
      stakeholders: ["casual", "competitive", "regulator"],
      title: "하위권만 실질 타격",
      supportingArgument: `${THEME_BY_ID[target.themeId].shortName}의 ${target.part.name} 자체는 채용률 ${percent(target.usageRate)}의 의존 파츠입니다.`,
      opposingArgument: "상위 3개 테마를 건드리지 않은 채 하위권만 약화하면 금제 목적이 뒤집혔다는 비판을 피하기 어렵습니다.",
      recommendedLimit: target.nextLimit,
    });
  }

  const upperPressure = topCandidate
    ? 100 * topCandidate.share + dependencyScore(topCandidate) * 0.35
    : 0;
  if (
    topCandidate &&
    profile.upperMeaningfulCuts === 0 &&
    (profile.changeCount > 0 || upperPressure >= 45)
  ) {
    add("upper-ignored", 48 + upperPressure * 0.55, topCandidate, {
      stakeholders: ["competitive", "regulator"],
      title: "상위권 핵심이 비껴감",
      supportingArgument: "상위권을 직접 치지 않고 주변부부터 조정해 급격한 붕괴를 피하려는 접근입니다.",
      opposingArgument: `${THEME_BY_ID[topCandidate.themeId].shortName} 점유율 ${percent(topCandidate.share)}, ${topCandidate.part.name} 채용률 ${percent(topCandidate.usageRate)}인데 실질 제한이 없습니다.`,
      recommendedLimit: meaningfulRecommendation(topCandidate),
    });
  }

  const upperDependency = sortByScore(
    state,
    decisionDay,
    "upper-dependency-hit",
    meaningful.filter((target) => target.tierBand === "upper"),
    dependencyScore,
  )[0];
  if (upperDependency && dependencyScore(upperDependency) >= 18) {
    add("upper-dependency-hit", 58 + dependencyScore(upperDependency), upperDependency, {
      stakeholders: ["competitive", "design", "regulator"],
      title: "상위권 의존 핵심을 직접 조정",
      supportingArgument: `${upperDependency.part.name}은 채용률 ${percent(upperDependency.usageRate)}, 평균 ${upperDependency.averageCopies.toFixed(1)}장인 핵심이라 조정 효과가 분명합니다.`,
      opposingArgument: "핵심 한 장에 의존한 구조를 직접 치면 테마 전체가 예상보다 크게 무너질 수 있습니다.",
      recommendedLimit: upperDependency.nextLimit,
    });
  }

  const recentTarget = sortByScore(
    state,
    decisionDay,
    "recent-product-cut",
    tighten.filter(
      (target) =>
        target.recentProductAge !== null && target.recentProductAge <= 30,
    ),
    dependencyScore,
  )[0];
  if (recentTarget) {
    add(
      "recent-product-cut",
      78 - (recentTarget.recentProductAge ?? 30) * 0.7,
      recentTarget,
      {
        stakeholders: ["collector", "retail", "design", "regulator"],
        title: "최근 발매·지원 상품을 즉시 조정",
        supportingArgument: "출시 직후라도 환경을 크게 훼손한 카드라면 빠른 정정이 피해 확산을 막습니다.",
        opposingArgument: `${recentTarget.recentProductAge}일 전 상품을 바로 제한하면 구매 신뢰와 향후 지원 기대를 동시에 훼손할 수 있습니다.`,
        recommendedLimit: recentTarget.previousLimit,
      },
    );
  }

  const lowUsageTarget = sortByScore(
    state,
    decisionDay,
    "low-usage-cut",
    tighten.filter(
      (target) =>
        target.usageRate < 0.4 ||
        target.usageRate * target.averageCopies < 0.65,
    ),
    (target) => 1 - target.usageRate,
  )[0];
  if (lowUsageTarget) {
    add("low-usage-cut", 72 + (0.4 - lowUsageTarget.usageRate) * 60, lowUsageTarget, {
      stakeholders: ["competitive", "casual", "regulator"],
      title: "저사용 카드에 규제 슬롯을 사용",
      supportingArgument: "낮은 채용률이어도 특정 매치업의 극단값을 만드는 카드라면 예방적 제한 논리가 있습니다.",
      opposingArgument: `현재 채용률 ${percent(lowUsageTarget.usageRate)}, 평균 ${lowUsageTarget.averageCopies.toFixed(1)}장이라 체감 개선 없이 금제 수만 늘 수 있습니다.`,
      recommendedLimit: lowUsageTarget.previousLimit,
    });
  }

  const sharedTarget = sortByScore(
    state,
    decisionDay,
    "shared-external-use",
    actual.filter((target) => target.sharedExternalUse),
    dependencyScore,
  )[0];
  if (sharedTarget) {
    add("shared-external-use", 60 + dependencyScore(sharedTarget) * 0.55, sharedTarget, {
      stakeholders: ["competitive", "casual", "design"],
      title: "하위 테마 밖에서도 쓰이는 범용 파츠",
      supportingArgument: `${sharedTarget.part.name}은 ‘외부 사용’ 파츠라 소속 테마 순위보다 넓은 덱 구성에 영향을 줍니다.`,
      opposingArgument: `범용성만 보고 제한하면 점유율 ${percent(sharedTarget.share)}인 본가 테마가 대신 큰 피해를 입을 수 있습니다.`,
      recommendedLimit: sharedTarget.nextLimit,
    });
  }

  const staleReleased = sortByScore(
    state,
    decisionDay,
    "stale-release",
    loosen.filter(
      (target) => target.staleBeforeDecision && target.nextLimit === 3,
    ),
    (target) => decisionDay - (target.restrictedSince ?? decisionDay),
  )[0];
  if (staleReleased) {
    const age = decisionDay - (staleReleased.restrictedSince ?? decisionDay);
    add("stale-release", 62 + Math.min(30, age / 6), staleReleased, {
      stakeholders: ["casual", "collector", "design", "regulator"],
      title: "장기 제한 카드를 완전 해제",
      supportingArgument: `${age}일 동안 제한된 ${staleReleased.part.name}을 3장으로 돌려 금제표의 순환성을 회복합니다.`,
      opposingArgument: "대체 지원과 결합했을 때 과거의 문제가 다시 나타날 가능성은 별도로 확인해야 합니다.",
      recommendedLimit: 3,
    });
  }

  if (staleCandidates.length > 0 && !staleReleased) {
    const target = sortByScore(
      state,
      decisionDay,
      "stale-ignored",
      staleCandidates,
      (candidate) => decisionDay - (candidate.restrictedSince ?? decisionDay),
    )[0];
    const age = decisionDay - (target.restrictedSince ?? decisionDay);
    add("stale-ignored", 64 + Math.min(28, age / 8), target, {
      stakeholders: ["casual", "collector", "regulator"],
      title: "오래 묶인 카드의 해제 검토를 건너뜀",
      supportingArgument: "현재 환경에서 여전히 위험한 제한은 오래됐다는 이유만으로 풀 필요가 없습니다.",
      opposingArgument: `${target.part.name}은 ${age}일째 제한 상태라 유지 근거를 갱신하지 않으면 영구 방치로 보입니다.`,
      recommendedLimit: 3,
    });
  }

  const cosmeticTarget = sortByScore(
    state,
    decisionDay,
    "cosmetic",
    actual.filter((target) => target.cosmetic),
    (target) => target.part.powerWeight,
  )[0];
  if (cosmeticTarget) {
    add("cosmetic", 84, cosmeticTarget, {
      stakeholders: ["competitive", "regulator"],
      title: "숫자만 바뀌는 실질 무효 조정",
      supportingArgument: "상징적 경고로 향후 설계 기준을 명확히 하는 효과는 있습니다.",
      opposingArgument: `${cosmeticTarget.part.name}은 선호 매수가 ${cosmeticTarget.part.preferredCopies}장이라 ${cosmeticTarget.nextLimit}장 제한으로 실제 가용성이 줄지 않습니다.`,
      recommendedLimit: meaningfulRecommendation(cosmeticTarget),
    });
  }

  const affectedThemeCount = new Set(tighten.map((target) => target.themeId)).size;
  const overbroad =
    tighten.length >= 8 ||
    affectedThemeCount >= 6 ||
    (meaningful.length >= 6 && tighten.some((target) => target.usageRate < 0.4));
  if (overbroad) {
    const target = sortByScore(
      state,
      decisionDay,
      "overbroad",
      tighten,
      (candidate) => 1 - candidate.usageRate + candidate.impact * 0.01,
    )[0];
    add("overbroad", 68 + tighten.length * 3 + affectedThemeCount * 2, target, {
      stakeholders: ["casual", "collector", "retail", "regulator"],
      title: "한 번에 너무 넓은 규제 범위",
      supportingArgument: `${tighten.length}장·${affectedThemeCount}개 테마를 함께 조정해 대규모 환경 재편을 노립니다.`,
      opposingArgument: "원인과 주변 카드를 동시에 치면 무엇이 실제 문제였는지 사후 평가가 어려워집니다.",
    });
  }

  if (profile.quality === "balanced" && actual.length > 0) {
    const target = sortByScore(
      state,
      decisionDay,
      "balanced",
      meaningful.length > 0 ? meaningful : actual,
      dependencyScore,
    )[0];
    add("balanced", 76 + Math.min(20, profile.totalImpact * 0.12), target, {
      stakeholders: ["competitive", "casual", "collector", "regulator"],
      title: "실제 위협과 장기 제한을 함께 본 균형안",
      supportingArgument: `판정된 위협 ${profile.threatThemeIds.length}개를 빠짐없이 다루고, 압력이 낮은 테마를 미리 자르지 않으면서 오래된 제한의 순환 조건도 충족했습니다.`,
      opposingArgument: "대상 선정이 타당해도 각 카드의 보유가치 충격과 대체재 이동은 사후 관찰이 필요합니다.",
      recommendedLimit: target.nextLimit,
    });
  }

  const accessibilityTarget = sortByScore(
    state,
    decisionDay,
    "accessibility-pressure",
    tighten.filter((target) => {
      const demand = target.usageRate * target.averageCopies;
      const trust =
        state.history.find((entry) => entry.day === decisionDay)?.purchaseTrust ??
        (source === "draft" ? state.purchaseTrust : 65);
      return demand >= 1.65 && (target.sharedExternalUse || trust < 65);
    }),
    (target) => target.usageRate * target.averageCopies,
  )[0];
  if (accessibilityTarget) {
    const deckDemand = accessibilityTarget.usageRate * accessibilityTarget.averageCopies;
    add("accessibility-pressure", 50 + deckDemand * 15, accessibilityTarget, {
      stakeholders: ["casual", "collector", "retail", "regulator"],
      title: "고채용 파츠의 접근성 압력",
      supportingArgument: `채용률 ${percent(accessibilityTarget.usageRate)}·평균 ${accessibilityTarget.averageCopies.toFixed(1)}장이라 필요 매수를 줄이는 효과가 큽니다.`,
      opposingArgument: "금제는 공급·가격 정책의 대체재가 아니며 실제 거래가 자료 없이 접근성 문제만으로 제한하면 안 됩니다.",
      recommendedLimit: accessibilityTarget.nextLimit,
    });
  }

  const replacementPair = tighten
    .map((target) => {
      const alternatives = candidates.filter(
        (candidate) =>
          candidate.themeId === target.themeId &&
          candidate.partId !== target.partId &&
          candidate.previousLimit > 0,
      );
      const alternative = sortByScore(
        state,
        decisionDay,
        `replacement-${target.partId}`,
        alternatives,
        dependencyScore,
      )[0];
      const ratio = alternative
        ? dependencyScore(alternative) / Math.max(1, dependencyScore(target))
        : 0;
      return { target, alternative, ratio };
    })
    .filter(
      (pair): pair is {
        target: InternalTarget;
        alternative: InternalTarget;
        ratio: number;
      } => Boolean(pair.alternative) && pair.ratio >= 0.6,
    )
    .sort(
      (left, right) =>
        right.ratio - left.ratio || left.target.partId.localeCompare(right.target.partId),
    )[0];
  if (replacementPair) {
    add("replacement-risk", 55 + replacementPair.ratio * 30, replacementPair.target, {
      relatedPartId: replacementPair.alternative.partId,
      stakeholders: ["competitive", "design", "regulator"],
      title: "대체재·풍선효과 위험",
      supportingArgument: `${replacementPair.target.part.name}을 줄이면 현재 전개 의존도를 직접 낮출 수 있습니다.`,
      opposingArgument: `${replacementPair.alternative.part.name}의 대체 점수가 기존 핵심의 ${Math.round(replacementPair.ratio * 100)}%라 압력이 옆 카드로 이동할 수 있습니다.`,
      recommendedLimit: replacementPair.target.nextLimit,
    });
  }

  const counterTarget = sortByScore(
    state,
    decisionDay,
    "counter-research-pending",
    tighten.filter(
      (target) =>
        counterMaturity(state, decisionDay, source, target.themeId) >= 0.65,
    ),
    (target) => counterMaturity(state, decisionDay, source, target.themeId),
  )[0];
  if (counterTarget) {
    const maturity = counterMaturity(
      state,
      decisionDay,
      source,
      counterTarget.themeId,
    );
    add("counter-research-pending", 50 + maturity * 35, counterTarget, {
      stakeholders: ["counter-research", "competitive", "design"],
      title: "자연 카운터 연구가 이미 진행 중",
      supportingArgument: "금제와 카운터 보급을 함께 쓰면 상위 테마의 압력을 더 빠르게 낮출 수 있습니다.",
      opposingArgument: `카운터 성숙도가 ${percent(maturity)}라 규제 전에 자연 적응의 효과를 확인할 여지가 있습니다.`,
      recommendedLimit: counterTarget.previousLimit,
    });
  }

  const collectorTarget = sortByScore(
    state,
    decisionDay,
    "collector-backlash",
    tighten.filter(
      (target) =>
        THEME_BY_ID[target.themeId].appeal >= 85 ||
        target.part.role === "finisher",
    ),
    (target) => THEME_BY_ID[target.themeId].appeal + target.part.powerWeight,
  )[0];
  if (collectorTarget) {
    add(
      "collector-backlash",
      42 + THEME_BY_ID[collectorTarget.themeId].appeal * 0.45,
      collectorTarget,
      {
        stakeholders: ["collector", "retail", "design"],
        title: "수집가 반발 가능성",
        supportingArgument: "상징성이 높아도 경쟁 환경을 훼손하면 플레이 규칙은 동일하게 적용해야 합니다.",
        opposingArgument: `매력도 ${THEME_BY_ID[collectorTarget.themeId].appeal}의 ${collectorTarget.part.name}을 제한하면 수집 가치와 플레이 가치가 충돌합니다.`,
        recommendedLimit: collectorTarget.nextLimit,
      },
    );
  }

  const competitiveTarget = sortByScore(
    state,
    decisionDay,
    "competitive-demand",
    meaningful.filter((target) => target.tierBand === "upper"),
    (target) => target.share * 150 + dependencyScore(target),
  )[0];
  if (competitiveTarget) {
    add(
      "competitive-demand-addressed",
      50 + competitiveTarget.share * 140 + competitiveTarget.impact,
      competitiveTarget,
      {
        stakeholders: ["competitive", "regulator", "design"],
        title: "경쟁층의 상위권 조정 요구를 반영",
        supportingArgument: `상위권 ${THEME_BY_ID[competitiveTarget.themeId].shortName}의 실사용 핵심을 직접 조정했습니다.`,
        opposingArgument: "경쟁층 체감만으로 조정 폭을 키우면 캐주얼·수집층의 손실이 과도해질 수 있습니다.",
        recommendedLimit: competitiveTarget.nextLimit,
      },
    );
  }

  signals.sort(
    (left, right) =>
      right.pressure - left.pressure ||
      keyedUint(state.seed, decisionDay, "signal-order", left.id) -
        keyedUint(state.seed, decisionDay, "signal-order", right.id) ||
      left.kind.localeCompare(right.kind),
  );
  return { signals, staleEligiblePartIds };
}

function flagsFor(
  profile: RestrictionPolicyProfile,
  signals: readonly RestrictionDecisionSignal[],
): RestrictionDecisionSignalFlags {
  const has = (kind: RestrictionDecisionSignalKind) =>
    signals.some((signal) => signal.kind === kind);
  return {
    noChange: profile.changeCount === 0,
    noChangeJustified: has("no-change-justified"),
    lowerOnly: has("lower-only"),
    upperIgnored: has("upper-ignored"),
    upperDependencyHit: has("upper-dependency-hit"),
    recentProductCut: has("recent-product-cut"),
    lowUsageCut: has("low-usage-cut"),
    sharedExternalUse: has("shared-external-use"),
    staleRelease: has("stale-release"),
    staleIgnored: has("stale-ignored"),
    cosmetic: has("cosmetic"),
    overbroad: has("overbroad"),
    balanced: has("balanced"),
    accessibilityPressure: has("accessibility-pressure"),
    replacementRisk: has("replacement-risk"),
    counterResearchPending: has("counter-research-pending"),
    collectorBacklash: has("collector-backlash"),
    competitiveDemandAddressed: has("competitive-demand-addressed"),
  };
}

function publicTarget(target: InternalTarget): RestrictionDecisionTarget {
  return {
    themeId: target.themeId,
    partId: target.partId,
    previousLimit: target.previousLimit,
    nextLimit: target.nextLimit,
    direction: target.direction,
    tierBand: target.tierBand,
    themeRank: target.themeRank,
    share: target.share,
    usageRate: target.usageRate,
    averageCopies: target.averageCopies,
    impact: target.impact,
    meaningful: target.meaningful,
    cosmetic: target.cosmetic,
    sharedExternalUse: target.sharedExternalUse,
    recentProductAge: target.recentProductAge,
    staleBeforeDecision: target.staleBeforeDecision,
  };
}

function analyze(
  state: GameState,
  decisionDay: number,
  source: RestrictionDecisionSignalSource,
  targets: InternalTarget[],
  profile: RestrictionPolicyProfile,
  ranked: readonly ThemeId[],
  rankByTheme: ReadonlyMap<ThemeId, number>,
): RestrictionDecisionSignals {
  const { signals, staleEligiblePartIds } = buildSignals(
    state,
    decisionDay,
    source,
    profile,
    targets,
    ranked,
    rankByTheme,
  );
  return {
    decisionDay,
    source,
    profile,
    targets: targets.map(publicTarget),
    staleEligiblePartIds,
    kinds: signals.map((signal) => signal.kind),
    flags: flagsFor(profile, signals),
    signals,
  };
}

/**
 * Classifies the current restriction draft for contextual community reaction.
 * The function is pure: it neither mutates the game nor stores tutorial/UI data.
 */
export function getRestrictionDecisionSignals(
  state: GameState,
  changes: Readonly<Record<string, RestrictionLimit>>,
): RestrictionDecisionSignals {
  assertRestrictionDay(state.day);
  const ranked = rankedThemeIds(state, state.day, "draft");
  const rankByTheme = new Map(
    ranked.map((themeId, rank) => [themeId, rank] as const),
  );
  return analyze(
    state,
    state.day,
    "draft",
    draftTargets(state, changes, rankByTheme),
    getRestrictionPolicyProfile(state, changes),
    ranked,
    rankByTheme,
  );
}

/**
 * Reconstructs signals from immutable decision events and the historical share
 * snapshot. This is safe for daily-community to call when rendering old days.
 */
export function getPublishedRestrictionDecisionSignals(
  state: GameState,
  decisionDay: number,
): RestrictionDecisionSignals {
  assertRestrictionDay(decisionDay);
  const ranked = rankedThemeIds(state, decisionDay, "published");
  const rankByTheme = new Map(
    ranked.map((themeId, rank) => [themeId, rank] as const),
  );
  return analyze(
    state,
    decisionDay,
    "published",
    publishedTargets(state, decisionDay, rankByTheme),
    getPublishedRestrictionPolicyProfile(state, decisionDay),
    ranked,
    rankByTheme,
  );
}
