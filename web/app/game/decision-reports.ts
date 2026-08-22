import {
  RELEASE_REPORT_DELAY_DAYS,
  RESTRICTION_REPORT_DELAY_DAYS,
} from "./campaign.ts";
import { getAdministrationProfile } from "./administration-profile.ts";
import { THEME_BY_ID } from "./content.ts";
import { isBanDay } from "./engine.ts";
import { getGenericCard } from "./generic-card-catalog.ts";
import { getReleaseBatchKind } from "./release-kind.ts";
import { getReprintImpactPreview } from "./release-requests.ts";
import {
  getRestrictionHistoricalOutcome,
  type RestrictionOutcomeClassification,
} from "./restriction-policy.ts";
import type { DailyHistory, GameState, ReleaseBatch } from "./types.ts";

export type DecisionReportTone = "positive" | "caution" | "negative";

export type RestrictionReportType =
  | "restriction-stabilized"
  | "restriction-stabilized-at-cost"
  | "restriction-ineffective"
  | "restriction-overcorrected"
  | "restriction-replacement"
  | "restriction-partial"
  | "restriction-mixed"
  | "restriction-pending";

export type RegularReleaseReportType =
  | "regular-blockbuster"
  | "regular-ecosystem-builder"
  | "regular-commercial-backlash"
  | "regular-power-creep-crisis"
  | "regular-launch-miss"
  | "regular-steady-start";

export type ReprintReleaseReportType =
  | "reprint-access-restored"
  | "reprint-balanced-reset"
  | "reprint-price-crash"
  | "reprint-collector-shock"
  | "reprint-supply-miss";

export type DecisionReportType =
  | RestrictionReportType
  | RegularReleaseReportType
  | ReprintReleaseReportType;

export type DecisionReportMetric = {
  label: string;
  value: string;
  delta?: number;
  before?: string;
  after?: string;
};

export type DecisionReportDecision = {
  headline: string;
  detail: string;
};

export type CampaignGrowthBand =
  | "breakout"
  | "growing"
  | "holding"
  | "declining"
  | "critical";

export interface CampaignGrowthSignals {
  userRate: number;
  /** DAY 0 대비 7일 일평균 매출의 실금액 변화(억원). */
  revenueDeltaEok: number;
}

export type CampaignGrowth = {
  band: CampaignGrowthBand;
  label: string;
  summary: string;
  tone: DecisionReportTone;
  index: number;
  comparison: string;
  change: string;
  basis: string;
};

export type DecisionReport = {
  id: string;
  kind: "restriction" | "regular-release" | "reprint-release";
  reportType: DecisionReportType;
  decisionDay: number;
  reportDay: number;
  kicker: string;
  title: string;
  verdict: string;
  summary: string;
  /** Compact interpretation inferred from committed choices, never selected up front. */
  marketReading: string;
  recommendation: string;
  tone: DecisionReportTone;
  decision: DecisionReportDecision;
  growth: CampaignGrowth;
  metrics: DecisionReportMetric[];
};

export interface RestrictionReportSignals {
  classification: RestrictionOutcomeClassification;
  topShareDelta: number;
  targetedShareDelta: number;
  userRateDelta: number;
  trustDelta: number;
}

export interface RegularReleaseReportSignals {
  revenueDelta: number;
  healthDelta: number;
  userDelta: number;
  trustDelta: number;
}

export interface ReprintReleaseReportSignals {
  averagePriceRate: number;
  totalAccess: number;
  totalCollectorLoss: number;
  trustDelta: number;
}

type ReportProfile = {
  title: string;
  verdict: string;
  summary: string;
  recommendation: string;
  tone: DecisionReportTone;
};

function signed(value: number, digits = 1): string {
  const roundedValue = Number(value.toFixed(digits));
  const rounded = roundedValue.toFixed(digits);
  return roundedValue > 0 ? `+${rounded}` : rounded;
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function points(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function formatUsers(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}명`;
}

function won(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}₩${revenueAmount(Math.abs(value))}`;
}

function revenueAmount(value: number): string {
  return value >= 1
    ? `${value.toFixed(1)}억`
    : `${Math.round(value * 10_000).toLocaleString("ko-KR")}만`;
}

function eokDelta(value: number): string {
  const roundedManwon = Math.round(Math.abs(value) * 10_000);
  return roundedManwon === 0
    ? "변화 없음"
    : `${value > 0 ? "+" : "-"}${revenueAmount(Math.abs(value))}`;
}

function rate(value: number): string {
  return `${signed(value * 100)}%`;
}

export function classifyCampaignGrowth(
  signals: CampaignGrowthSignals,
): CampaignGrowthBand {
  const score = campaignGrowthScore(signals);
  const bothCoreSignalsCollapsed =
    signals.userRate <= -0.3 && signals.revenueDeltaEok <= -0.45;

  if (bothCoreSignalsCollapsed || score <= -0.38) return "critical";
  if (score <= -0.14) return "declining";
  if (
    score >= 0.48 && signals.userRate > 0 && signals.revenueDeltaEok > 0
  ) {
    return "breakout";
  }
  if (score >= 0.14) return "growing";
  return "holding";
}

function campaignGrowthScore(signals: CampaignGrowthSignals): number {
  return signals.userRate * 0.55 +
    Math.max(-1, Math.min(2, signals.revenueDeltaEok)) * 0.45;
}

export function getCampaignGrowthIndex(
  signals: CampaignGrowthSignals,
): number {
  return Math.max(0, Math.round(100 * (1 + campaignGrowthScore(signals))));
}

export function classifyCampaignGrowthChange(
  indexDelta: number,
): CampaignGrowthBand {
  if (indexDelta <= -38) return "critical";
  if (indexDelta <= -14) return "declining";
  if (indexDelta >= 48) return "breakout";
  if (indexDelta >= 14) return "growing";
  return "holding";
}

const CAMPAIGN_TRAJECTORY_COPY: Record<
  CampaignGrowthBand,
  Pick<CampaignGrowth, "label" | "summary" | "tone">
> = {
  breakout: {
    label: "성장 가속",
    summary: "직전 공식 보고보다 회사 성장지수가 크게 올랐습니다. 현재 운영 방향이 사업 확장을 빠르게 끌어올리고 있습니다.",
    tone: "positive",
  },
  growing: {
    label: "상승세 지속",
    summary: "직전 공식 보고보다 회사 성장지수가 올랐습니다. 현재 운영 방향이 추가 성장으로 이어지는 중입니다.",
    tone: "positive",
  },
  holding: {
    label: "성장 정체 · 보합",
    summary: "직전 공식 보고와 비교해 회사 성장지수가 의미 있게 움직이지 않았습니다. 다음 검토까지 새 성장 동력이 필요합니다.",
    tone: "caution",
  },
  declining: {
    label: "성장세 둔화",
    summary: "직전 공식 보고보다 회사 성장지수가 낮아졌습니다. 개별 성과와 별개로 사업의 성장 동력이 약해지는 중입니다.",
    tone: "negative",
  },
  critical: {
    label: "급격한 후퇴",
    summary: "직전 공식 보고보다 회사 성장지수가 크게 떨어졌습니다. 다음 의사결정에서 사업 기반 회복을 우선해야 합니다.",
    tone: "negative",
  },
};

function campaignGrowthPoint(
  state: GameState,
  reportDay: number,
): CampaignGrowthSignals & {
  averageRevenue: number;
  baselineUsers: number;
  totalUsers: number;
  index: number;
} {
  const dayZero = snapshot(state, 0) ?? snapshot(state, reportDay)!;
  const current = snapshot(state, reportDay) ?? dayZero;
  const baselineRows = state.history.filter(
    (row) => row.day >= -14 && row.day <= 0,
  );
  const currentRows = state.history.filter(
    (row) => row.day >= reportDay - 6 && row.day <= reportDay,
  );
  // DailyHistory.revenue is the same 억원 value drawn by the finance chart.
  const baselineRevenue = average(baselineRows, (row) => row.revenue) ?? 0;
  const currentRevenue = average(currentRows, (row) => row.revenue) ?? 0;
  const userRate = dayZero.totalUsers > 0
    ? (current.totalUsers - dayZero.totalUsers) / dayZero.totalUsers
    : 0;
  const revenueDeltaEok = currentRevenue - baselineRevenue;
  return {
    userRate,
    revenueDeltaEok,
    averageRevenue: currentRevenue,
    baselineUsers: dayZero.totalUsers,
    totalUsers: current.totalUsers,
    index: getCampaignGrowthIndex({ userRate, revenueDeltaEok }),
  };
}

function previousDecisionReportDay(
  state: GameState,
  reportDay: number,
): number | null {
  const restrictionReportDays = state.community
    .filter(
      (event) =>
        event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction" ||
        event.type === "restriction-no-change",
    )
    .map((event) => event.day + RESTRICTION_REPORT_DELAY_DAYS);
  const releaseReportDays = state.releaseHistory
    .filter((batch) => batch.releaseKind !== "baseline")
    .map((batch) => batch.day + RELEASE_REPORT_DELAY_DAYS);
  const candidates = [...new Set([
    ...restrictionReportDays,
    ...releaseReportDays,
  ])].filter(
    (day) => day < reportDay && snapshot(state, day) !== undefined,
  );
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function buildCampaignGrowth(
  state: GameState,
  reportDay: number,
): CampaignGrowth {
  const current = campaignGrowthPoint(state, reportDay);
  const previousReportDay = previousDecisionReportDay(state, reportDay);
  const previous = previousReportDay === null
    ? null
    : campaignGrowthPoint(state, previousReportDay);
  const previousIndex = previous?.index ?? 100;
  const indexDelta = current.index - previousIndex;
  const previousRevenue = previous?.averageRevenue ??
    current.averageRevenue - current.revenueDeltaEok;
  const previousUsers = previous?.totalUsers ?? current.baselineUsers;
  const userRateDelta = previousUsers > 0
    ? (current.totalUsers - previousUsers) / previousUsers
    : 0;
  const revenueDelta = current.averageRevenue - previousRevenue;
  const band = classifyCampaignGrowthChange(indexDelta);
  const copy = CAMPAIGN_TRAJECTORY_COPY[band];

  return {
    band,
    ...copy,
    index: current.index,
    comparison: previousReportDay === null
      ? "첫 보고서 · DAY 0 100"
      : `직전 DAY ${previousReportDay} · ${previousIndex}`,
    change: `${indexDelta > 0 ? "+" : ""}${indexDelta}`,
    basis: `직전 보고 대비 활성 유저 ${rate(userRateDelta)} · 일평균 매출 ${eokDelta(revenueDelta)}`,
  };
}

function restrictionCardName(
  state: GameState,
  event: GameState["community"][number],
): string {
  if (event.genericCardId) {
    return getGenericCard(event.genericCardId)?.name ?? event.genericCardId;
  }
  const theme = THEME_BY_ID[event.themeId];
  return theme?.parts.find((part) => part.id === event.partId)?.name ??
    event.partId ??
    theme?.shortName ??
    state.currentTopThemeId;
}

function restrictionDecision(
  state: GameState,
  decisionDay: number,
): DecisionReportDecision {
  const events = state.community.filter(
    (event) =>
      event.day === decisionDay &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction" ||
        event.type === "restriction-no-change"),
  );
  const changes = events.filter(
    (event) =>
      Number.isInteger(event.previousValue) &&
      Number.isInteger(event.value) &&
      event.previousValue !== event.value,
  );
  if (changes.length === 0) {
    return {
      headline: "금제 변경 없음 제출",
      detail: "기존 제한표를 유지한 채 7일간 환경의 자정 가능성을 관측했습니다.",
    };
  }
  const visible = changes.slice(0, 4).map((event) =>
    `${restrictionCardName(state, event)} ${event.previousValue}→${event.value}장`
  );
  const hiddenCount = changes.length - visible.length;
  return {
    headline: `카드 ${changes.length}장 제한 조정`,
    detail: `${visible.join(" · ")}${hiddenCount > 0 ? ` · 외 ${hiddenCount}건` : ""}`,
  };
}

const SUPPORT_DIRECTION_LABEL: Record<
  Extract<ReleaseBatch["products"][number], { kind: "support" }>["direction"],
  string
> = {
  consistency: "안정성",
  counterplay: "대응력",
  finisher: "결정력",
  recovery: "복구력",
};

function releaseProductName(
  product: ReleaseBatch["products"][number],
): string {
  switch (product.kind) {
    case "new-theme":
      return `${THEME_BY_ID[product.themeId]?.shortName ?? product.themeId} 신규 테마`;
    case "support":
      return `${THEME_BY_ID[product.themeId]?.shortName ?? product.themeId} ${SUPPORT_DIRECTION_LABEL[product.direction]} 지원`;
    case "generic":
      return getGenericCard(product.genericCardId)?.name ?? product.genericCardId;
    case "reprint":
      return getGenericCard(product.cardId)?.name ??
        THEME_BY_ID[product.themeId]?.parts.find((part) => part.id === product.cardId)?.name ??
        product.cardId;
  }
}

function releaseDecision(batch: ReleaseBatch): DecisionReportDecision {
  const kind = getReleaseBatchKind(batch);
  const visible = batch.products.slice(0, 4).map((product) => {
    const tuning = product.powerAdjustment === 0
      ? ""
      : ` (${product.powerAdjustment > 0 ? "+" : ""}${product.powerAdjustment})`;
    return `${releaseProductName(product)}${tuning}`;
  });
  const hiddenCount = batch.products.length - visible.length;
  return {
    headline: kind === "reprint"
      ? `재판 카드 ${batch.products.length}종 발매`
      : `신제품 ${batch.products.length}종 발매`,
    detail: `${visible.join(" · ")}${hiddenCount > 0 ? ` · 외 ${hiddenCount}종` : ""}`,
  };
}

function snapshot(state: GameState, day: number): DailyHistory | undefined {
  return state.history.find((entry) => entry.day === day);
}

function average(
  rows: readonly DailyHistory[],
  read: (row: DailyHistory) => number | undefined,
): number | null {
  const values = rows
    .map(read)
    .filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value)
    );
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

/**
 * Restriction outcomes come from the simulation classifier. These refinements
 * make materially different success and mixed results read as different
 * reports without adding randomness or duplicating game rules.
 */
export function classifyRestrictionReport(
  signals: RestrictionReportSignals,
): RestrictionReportType {
  switch (signals.classification) {
    case "stabilized":
      return signals.trustDelta <= -4 || signals.userRateDelta <= -0.015
        ? "restriction-stabilized-at-cost"
        : "restriction-stabilized";
    case "ineffective":
      return "restriction-ineffective";
    case "overcorrected":
      return "restriction-overcorrected";
    case "replacement":
      return "restriction-replacement";
    case "pending":
      return "restriction-pending";
    case "mixed":
      return signals.targetedShareDelta <= -0.01 && signals.topShareDelta < 0
        ? "restriction-partial"
        : "restriction-mixed";
  }
}

const RESTRICTION_REPORT_PROFILES: Record<RestrictionReportType, ReportProfile> = {
  "restriction-stabilized": {
    title: "금제 환경 안정화 확인서",
    verdict: "정상화 달성",
    summary: "핵심 위협과 상위권 집중이 함께 내려가며 이용자 기반도 방어됐습니다.",
    recommendation: "이번 제한 강도를 기준선으로 유지하고 대체 테마의 30일 추세를 감시하십시오.",
    tone: "positive",
  },
  "restriction-stabilized-at-cost": {
    title: "금제 안정화 비용 점검서",
    verdict: "효과 확인 · 신뢰 비용 발생",
    summary: "환경 지표는 개선됐지만 이용자 또는 구매 신뢰가 함께 빠졌습니다.",
    recommendation: "추가 제재를 보류하고 다음 상품·대회 운영으로 이탈 비용부터 회복하십시오.",
    tone: "caution",
  },
  "restriction-ineffective": {
    title: "금제 효과 미달 재검토서",
    verdict: "유효 타격 없음",
    summary: "대상 점유율과 집중도 모두 오차 범위에 머물러 판정이 환경을 움직이지 못했습니다.",
    recommendation: "다음 금제에서는 장식적 조정보다 채용률과 평균 투입 매수가 높은 핵심축을 검토하십시오.",
    tone: "negative",
  },
  "restriction-overcorrected": {
    title: "과잉 제재 피해 보고서",
    verdict: "대상 생태계 급랭",
    summary: "대상 테마의 경쟁력과 이용자가 예상 범위를 넘어 함께 붕괴했습니다.",
    recommendation: "추가 하향은 중단하고 오래된 제한의 완화 또는 간접 지원을 우선 검토하십시오.",
    tone: "negative",
  },
  "restriction-replacement": {
    title: "대체 강자 발생 경보",
    verdict: "권력 승계 · 풍선 효과",
    summary: "기존 위협은 줄었지만 전체 집중도는 개선되지 않아 다른 테마가 빈자리를 차지했습니다.",
    recommendation: "새 상위 테마의 입상률·승률을 별도 추적하고 즉시 연쇄 금제는 피하십시오.",
    tone: "caution",
  },
  "restriction-partial": {
    title: "금제 부분 개선 추적서",
    verdict: "핵심 억제 · 정상화 미완",
    summary: "대상과 최상위 점유율은 내려갔지만 전체 환경을 안정화하기에는 변화가 부족했습니다.",
    recommendation: "효과가 난 축은 유지하고 남은 집중 원인을 카드 단위로 다시 분해하십시오.",
    tone: "caution",
  },
  "restriction-mixed": {
    title: "금제 상충 지표 분석서",
    verdict: "개선과 부작용 교차",
    summary: "분포·이용자·신뢰 지표가 서로 다른 방향으로 움직여 단일 성공 판정이 불가능합니다.",
    recommendation: "다음 판정 전까지 7일 추가 관찰하고 가장 악화된 지표의 원인을 우선 조사하십시오.",
    tone: "caution",
  },
  "restriction-pending": {
    title: "금제 집계 보류 통지서",
    verdict: "관측치 미완성",
    summary: "결론을 내리기 위한 사후 분포 기록이 아직 완성되지 않았습니다.",
    recommendation: "누락된 관측 기간을 채운 뒤 같은 기준으로 재집계하십시오.",
    tone: "caution",
  },
};

function restrictionMetrics(
  reportType: RestrictionReportType,
  outcome: ReturnType<typeof getRestrictionHistoricalOutcome>,
  trustBefore: number,
  trustAfter: number,
): DecisionReportMetric[] {
  const followup = outcome.followupMetrics ?? outcome.decisionMetrics;
  const topShare = {
    label: "최상위 점유율",
    value: `${signed(outcome.topShareDelta * 100)}%p`,
    delta: outcome.topShareDelta,
    before: percent(outcome.decisionMetrics.topShare),
    after: percent(followup.topShare),
  };
  const topThree = {
    label: "상위 3개 합계",
    value: `${signed(outcome.topThreeShareDelta * 100)}%p`,
    delta: outcome.topThreeShareDelta,
    before: percent(outcome.decisionMetrics.topThreeShare),
    after: percent(followup.topThreeShare),
  };
  const concentration = {
    label: "집중도 HHI",
    value: signed(outcome.hhiDelta, 3),
    delta: outcome.hhiDelta,
    before: points(outcome.decisionMetrics.hhi, 3),
    after: points(followup.hhi, 3),
  };
  const target = {
    label: "대상 테마 합계",
    value: `${signed(outcome.targetedShareDelta * 100)}%p`,
    delta: outcome.targetedShareDelta,
    before: percent(outcome.decisionMetrics.targetedShare),
    after: percent(followup.targetedShare),
  };
  const users = {
    label: "활성 유저",
    value: `${signed(outcome.userDelta, 0)}명`,
    delta: outcome.userDelta,
    before: formatUsers(outcome.decisionMetrics.totalUsers),
    after: formatUsers(followup.totalUsers),
  };
  const trustDelta = trustAfter - trustBefore;
  const trust = {
    label: "구매 신뢰",
    value: `${signed(trustDelta)}점`,
    delta: trustDelta,
    before: points(trustBefore),
    after: points(trustAfter),
  };

  if (reportType === "restriction-replacement") {
    return [target, topShare, topThree, concentration];
  }
  if (
    reportType === "restriction-overcorrected" ||
    reportType === "restriction-stabilized-at-cost"
  ) {
    return [target, users, trust, concentration];
  }
  if (reportType === "restriction-ineffective") {
    return [target, topShare, concentration, trust];
  }
  return [topShare, target, users, trust];
}

function buildRestrictionReport(
  state: GameState,
  decisionDay: number,
  reportDay: number,
): DecisionReport | null {
  const hasDecision = state.community.some(
    (event) =>
      event.day === decisionDay &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction" ||
        event.type === "restriction-no-change"),
  );
  if (!hasDecision || !snapshot(state, reportDay)) return null;

  const observationDay = decisionDay + 7;
  const outcome = getRestrictionHistoricalOutcome(
    state,
    decisionDay,
    observationDay,
  );
  const trustBefore = snapshot(state, decisionDay)?.purchaseTrust;
  const trustAfter = snapshot(state, observationDay)?.purchaseTrust;
  const trustDelta =
    typeof trustBefore === "number" && typeof trustAfter === "number"
      ? trustAfter - trustBefore
      : 0;
  const reportType = classifyRestrictionReport({
    classification: outcome.classification,
    topShareDelta: outcome.topShareDelta,
    targetedShareDelta: outcome.targetedShareDelta,
    userRateDelta: outcome.userRateDelta,
    trustDelta,
  });
  const profile = RESTRICTION_REPORT_PROFILES[reportType];
  const administration = getAdministrationProfile(state, reportDay);
  const targetedNames = outcome.targetedThemeIds
    .map((themeId) => THEME_BY_ID[themeId]?.shortName ?? themeId)
    .join(" · ");

  return {
    id: `restriction-report-${decisionDay}-${reportDay}`,
    kind: "restriction",
    reportType,
    decisionDay,
    reportDay,
    kicker: "REGULATION IMPACT REPORT · D+9",
    title: `DAY ${decisionDay} ${profile.title}`,
    verdict: profile.verdict,
    summary: `${targetedNames ? `${targetedNames} 판정 이후 ` : ""}${profile.summary}`,
    marketReading: administration.marketReading,
    recommendation: profile.recommendation,
    tone: profile.tone,
    decision: restrictionDecision(state, decisionDay),
    growth: buildCampaignGrowth(state, reportDay),
    metrics: restrictionMetrics(
      reportType,
      outcome,
      trustBefore ?? state.purchaseTrust,
      trustAfter ?? trustBefore ?? state.purchaseTrust,
    ),
  };
}

/** Precedence: severe environment damage, conflicted hit, clean hit, ecosystem gain, miss, steady start. */
export function classifyRegularReleaseReport(
  signals: RegularReleaseReportSignals,
): RegularReleaseReportType {
  if (signals.healthDelta <= -5 || signals.trustDelta <= -7) {
    return "regular-power-creep-crisis";
  }
  if (
    signals.revenueDelta >= 0.75 &&
    (signals.healthDelta < -1 || signals.trustDelta <= -3)
  ) {
    return "regular-commercial-backlash";
  }
  if (
    signals.revenueDelta >= 0.75 &&
    signals.healthDelta >= 1 &&
    signals.trustDelta >= -2 &&
    signals.userDelta >= 0
  ) {
    return "regular-blockbuster";
  }
  if (
    signals.healthDelta >= 2 &&
    signals.userDelta > 0 &&
    signals.trustDelta >= -3
  ) {
    return "regular-ecosystem-builder";
  }
  if (signals.revenueDelta <= -0.35 && signals.userDelta <= 0) {
    return "regular-launch-miss";
  }
  return "regular-steady-start";
}

const REGULAR_RELEASE_REPORT_PROFILES: Record<RegularReleaseReportType, ReportProfile> = {
  "regular-blockbuster": {
    title: "흥행·환경 동반 성장 보고서",
    verdict: "블록버스터 안착",
    summary: "매출 상승과 건강 지표 개선이 함께 확인돼 단기 흥행이 생태계 확장으로 이어졌습니다.",
    recommendation: "즉시 상향 지원하기보다 30일 잔존율과 상위권 집중 여부를 확인하십시오.",
    tone: "positive",
  },
  "regular-ecosystem-builder": {
    title: "신제품 생태계 확장 관찰서",
    verdict: "조용한 성장",
    summary: "폭발적 매출보다 이용자 유입과 환경 건강 개선이 먼저 나타난 장기형 출시입니다.",
    recommendation: "대회 노출과 입문 동선을 보강해 건강한 유입을 실제 구매로 연결하십시오.",
    tone: "positive",
  },
  "regular-commercial-backlash": {
    title: "판매 성공·환경 경보 보고서",
    verdict: "흥행 뒤 부작용",
    summary: "매출 목표는 넘겼지만 구매 신뢰 또는 환경 건강이 훼손돼 성과의 질이 나쁩니다.",
    recommendation: "후속 파워 투입을 중단하고 문제 카드의 채용률·승률을 금제 후보로 추적하십시오.",
    tone: "caution",
  },
  "regular-power-creep-crisis": {
    title: "파워 인플레이션 긴급 점검서",
    verdict: "환경 부작용 심각",
    summary: "신제품 이후 환경 건강 또는 구매 신뢰가 위험선 아래로 급락했습니다.",
    recommendation: "추가 지원을 동결하고 다음 금제 검토에서 출시 카드와 범용 결합축을 우선 점검하십시오.",
    tone: "negative",
  },
  "regular-launch-miss": {
    title: "신제품 목표 미달 분석서",
    verdict: "판매·유입 동반 부진",
    summary: "일평균 매출이 줄었고 이용자 반등도 없어 상품 메시지가 시장에 도달하지 못했습니다.",
    recommendation: "무작정 파워를 올리기보다 테마 접근성·가격·플레이 정체성의 실패 원인을 분리하십시오.",
    tone: "negative",
  },
  "regular-steady-start": {
    title: "신제품 초기 추적 보고서",
    verdict: "안정권 · 추가 관찰",
    summary: "치명적 부작용은 없지만 흥행 또는 환경 개선이 확정적이라고 보기에는 신호가 약합니다.",
    recommendation: "D+30까지 재구매율과 입상 분포를 관찰한 뒤 지원 우선순위를 결정하십시오.",
    tone: "caution",
  },
};

function regularReleaseMetrics(
  reportType: RegularReleaseReportType,
  signals: RegularReleaseReportSignals,
  before: {
    revenue: number;
    health: number;
    users: number;
    trust: number;
  },
  after: {
    revenue: number;
    health: number;
    users: number;
    trust: number;
  },
): DecisionReportMetric[] {
  const revenue = {
    label: reportType === "regular-blockbuster" ? "매출 상승폭" : "일평균 매출",
    value: eokDelta(signals.revenueDelta),
    delta: signals.revenueDelta,
    before: won(before.revenue),
    after: won(after.revenue),
  };
  const health = {
    label: "생태계 건강",
    value: `${signed(signals.healthDelta)}점`,
    delta: signals.healthDelta,
    before: points(before.health),
    after: points(after.health),
  };
  const users = {
    label: reportType === "regular-ecosystem-builder" ? "순유입 유저" : "활성 유저",
    value: `${signed(signals.userDelta, 0)}명`,
    delta: signals.userDelta,
    before: formatUsers(before.users),
    after: formatUsers(after.users),
  };
  const trust = {
    label: "구매 신뢰",
    value: `${signed(signals.trustDelta)}점`,
    delta: signals.trustDelta,
    before: points(before.trust),
    after: points(after.trust),
  };
  return reportType === "regular-power-creep-crisis" ||
      reportType === "regular-commercial-backlash"
    ? [health, trust, revenue, users]
    : reportType === "regular-ecosystem-builder"
      ? [users, health, revenue, trust]
      : [revenue, health, users, trust];
}

/** Precedence: actual crash, confidence shock, ineffective supply, clean access win, balanced reset. */
export function classifyReprintReleaseReport(
  signals: ReprintReleaseReportSignals,
): ReprintReleaseReportType {
  if (signals.averagePriceRate <= -0.35 && signals.totalCollectorLoss > 0) {
    return "reprint-price-crash";
  }
  if (
    signals.trustDelta <= -6 ||
    signals.totalCollectorLoss > signals.totalAccess
  ) {
    return "reprint-collector-shock";
  }
  if (signals.averagePriceRate > -0.06) {
    return "reprint-supply-miss";
  }
  if (
    signals.totalAccess >= signals.totalCollectorLoss * 1.5 &&
    signals.trustDelta >= -4
  ) {
    return "reprint-access-restored";
  }
  return "reprint-balanced-reset";
}

const REPRINT_REPORT_PROFILES: Record<ReprintReleaseReportType, ReportProfile> = {
  "reprint-access-restored": {
    title: "재판팩 접근성 회복 확인서",
    verdict: "진입 장벽 완화",
    summary: "시세 하락이 실사용자 유입으로 이어졌고 보유가치 충격은 관리 가능한 범위에 머물렀습니다.",
    recommendation: "수요가 유지되는 카드는 다음 재판 주기에도 공급 후보로 보존하십시오.",
    tone: "positive",
  },
  "reprint-balanced-reset": {
    title: "재판팩 시장 재조정 보고서",
    verdict: "접근성과 보유가치 균형",
    summary: "실사용 접근성 개선과 콜렉터 손실이 모두 발생했으나 어느 한쪽도 위험선을 넘지 않았습니다.",
    recommendation: "추가 물량보다 다음 7일 가격 안정 여부를 확인하고 공급 간격을 유지하십시오.",
    tone: "caution",
  },
  "reprint-price-crash": {
    title: "재판팩 시세 급락 사고 보고서",
    verdict: "공급 충격 과다",
    summary: "평균 시세가 급락해 접근성 개선보다 보유가치 훼손이 시장 의제를 장악했습니다.",
    recommendation: "동일 카드의 연속 재판을 피하고 컬렉터 인쇄·한정 사양의 공급 원칙을 재설계하십시오.",
    tone: "negative",
  },
  "reprint-collector-shock": {
    title: "재판팩 보유 신뢰 경보",
    verdict: "콜렉터 이탈 우세",
    summary: "실사용자 유입보다 콜렉터 이탈 또는 구매 신뢰 하락이 더 크게 관측됐습니다.",
    recommendation: "고가 카드 재판은 유지하되 희소 사양과 플레이용 사양의 공급선을 분리하십시오.",
    tone: "negative",
  },
  "reprint-supply-miss": {
    title: "재판팩 공급 효과 미달서",
    verdict: "가격 장벽 잔존",
    summary: "재판 이후에도 평균 시세가 충분히 내려가지 않아 체감 접근성이 개선되지 않았습니다.",
    recommendation: "유통량·수요 집중 카드를 재검토하고 다음 팩에는 실질 공급량을 우선 배정하십시오.",
    tone: "caution",
  },
};

function reprintMetrics(
  reportType: ReprintReleaseReportType,
  signals: ReprintReleaseReportSignals,
  before: {
    price: number;
    users: number;
    trust: number;
  },
  after: {
    price: number;
    users: number;
    trust: number;
  },
): DecisionReportMetric[] {
  const price = {
    label: reportType === "reprint-price-crash" ? "평균 시세 급락" : "평균 시세",
    value: `${signed(signals.averagePriceRate * 100)}%`,
    delta: signals.averagePriceRate,
    before: `₩${Math.round(before.price).toLocaleString("ko-KR")}`,
    after: `₩${Math.round(after.price).toLocaleString("ko-KR")}`,
  };
  const access = {
    label: "접근 유입",
    value: `+${signals.totalAccess.toLocaleString("ko-KR")}명`,
    delta: signals.totalAccess,
  };
  const collectors = {
    label: "콜렉터 이탈",
    value: `-${signals.totalCollectorLoss.toLocaleString("ko-KR")}명`,
    delta: -signals.totalCollectorLoss,
  };
  const trust = {
    label: "구매 신뢰",
    value: `${signed(signals.trustDelta)}점`,
    delta: signals.trustDelta,
    before: points(before.trust),
    after: points(after.trust),
  };
  const activeUsers = {
    label: "활성 유저",
    value: `${signed(after.users - before.users, 0)}명`,
    delta: after.users - before.users,
    before: formatUsers(before.users),
    after: formatUsers(after.users),
  };
  if (reportType === "reprint-access-restored") {
    return [price, activeUsers, access, trust];
  }
  if (
    reportType === "reprint-price-crash" ||
    reportType === "reprint-collector-shock"
  ) {
    return [price, activeUsers, collectors, trust];
  }
  return [price, activeUsers, access, trust];
}

function buildReleaseReport(
  state: GameState,
  batch: ReleaseBatch,
  reportDay: number,
): DecisionReport | null {
  if (!snapshot(state, reportDay)) return null;
  const kind = getReleaseBatchKind(batch);
  const beforeRows = state.history.filter(
    (row) => row.day >= batch.day - 7 && row.day < batch.day,
  );
  const observationRows = state.history.filter(
    (row) => row.day >= batch.day + 1 && row.day <= batch.day + 7,
  );
  const beforeRevenue = average(beforeRows, (row) => row.revenue) ?? 0;
  const afterRevenue = average(observationRows, (row) => row.revenue) ?? 0;
  // Reuse the finance chart's 억원-scale history without converting it again.
  const revenueDelta = afterRevenue - beforeRevenue;
  const decision = snapshot(state, batch.day);
  const observation = snapshot(state, batch.day + 7)!;
  const trustDelta =
    (observation.purchaseTrust ?? state.purchaseTrust) -
    (decision?.purchaseTrust ?? state.purchaseTrust);
  const userDelta = observation.totalUsers -
    (decision?.totalUsers ?? observation.totalUsers);
  const healthDelta =
    (observation.environmentHealth ?? 0) -
    (decision?.environmentHealth ?? 0);
  const comparisonBefore = {
    revenue: beforeRevenue,
    health: decision?.environmentHealth ?? 0,
    users: decision?.totalUsers ?? observation.totalUsers,
    trust: decision?.purchaseTrust ?? state.purchaseTrust,
  };
  const comparisonAfter = {
    revenue: afterRevenue,
    health: observation.environmentHealth ?? 0,
    users: observation.totalUsers,
    trust: observation.purchaseTrust ?? state.purchaseTrust,
  };

  if (kind === "reprint") {
    const reprints = batch.products.filter(
      (product): product is Extract<ReleaseBatch["products"][number], { kind: "reprint" }> =>
        product.kind === "reprint",
    );
    const totalAccess = reprints.reduce(
      (sum, product) => sum + product.accessibilityUserGain,
      0,
    );
    const totalCollectorLoss = reprints.reduce(
      (sum, product) => sum + product.collectorUserLoss,
      0,
    );
    const reprintPreviews = reprints.map((product) => ({
      product,
      preview: getReprintImpactPreview(
        state,
        product.cardId,
        batch.day + 7,
      ),
    }));
    const priceRates = reprintPreviews.flatMap(({ product, preview }) => {
      const current = preview?.referencePrice;
      return typeof current === "number" && product.referencePrice > 0
        ? [(current - product.referencePrice) / product.referencePrice]
        : [];
    });
    const averagePriceRate = priceRates.length > 0
      ? priceRates.reduce((sum, value) => sum + value, 0) / priceRates.length
      : 0;
    const averagePriceBefore = reprints.length > 0
      ? reprints.reduce((sum, product) => sum + product.referencePrice, 0) /
        reprints.length
      : 0;
    const currentPrices = reprintPreviews.flatMap(({ preview }) =>
      typeof preview?.referencePrice === "number"
        ? [preview.referencePrice]
        : []
    );
    const averagePriceAfter = currentPrices.length > 0
      ? currentPrices.reduce((sum, value) => sum + value, 0) /
        currentPrices.length
      : averagePriceBefore * (1 + averagePriceRate);
    const signals: ReprintReleaseReportSignals = {
      averagePriceRate,
      totalAccess,
      totalCollectorLoss,
      trustDelta,
    };
    const reportType = classifyReprintReleaseReport(signals);
    const profile = REPRINT_REPORT_PROFILES[reportType];
    const administration = getAdministrationProfile(state, reportDay);
    const cardNames = reprintPreviews
      .map(({ product, preview }) => preview?.cardName ?? product.cardId)
      .join(" · ");

    return {
      id: `reprint-report-${batch.day}-${reportDay}`,
      kind: "reprint-release",
      reportType,
      decisionDay: batch.day,
      reportDay,
      kicker: "REPRINT MARKET REPORT · D+9",
      title: `DAY ${batch.day} ${profile.title}`,
      verdict: profile.verdict,
      summary: `${cardNames} 공급 이후 ${profile.summary}`,
      marketReading: administration.marketReading,
      recommendation: profile.recommendation,
      tone: profile.tone,
      decision: releaseDecision(batch),
      growth: buildCampaignGrowth(state, reportDay),
      metrics: reprintMetrics(
        reportType,
        signals,
        {
          price: averagePriceBefore,
          users: comparisonBefore.users,
          trust: comparisonBefore.trust,
        },
        {
          price: averagePriceAfter,
          users: comparisonAfter.users,
          trust: comparisonAfter.trust,
        },
      ),
    };
  }

  const debutNames = batch.products.flatMap((product) =>
    product.kind === "new-theme"
      ? [THEME_BY_ID[product.themeId]?.shortName ?? product.themeId]
      : [],
  );
  const signals: RegularReleaseReportSignals = {
    revenueDelta,
    healthDelta,
    userDelta,
    trustDelta,
  };
  const reportType = classifyRegularReleaseReport(signals);
  const profile = REGULAR_RELEASE_REPORT_PROFILES[reportType];
  const administration = getAdministrationProfile(state, reportDay);
  const productLead = debutNames.length > 0
    ? `${debutNames.join(" · ")} 데뷔를 포함한 제품군은 `
    : "이번 제품군은 ";

  return {
    id: `release-report-${batch.day}-${reportDay}`,
    kind: "regular-release",
    reportType,
    decisionDay: batch.day,
    reportDay,
    kicker: "PRODUCT PERFORMANCE REPORT · D+9",
    title: `DAY ${batch.day} ${profile.title}`,
    verdict: profile.verdict,
    summary: `${productLead}${profile.summary}`,
    marketReading: administration.marketReading,
    recommendation: profile.recommendation,
    tone: profile.tone,
    decision: releaseDecision(batch),
    growth: buildCampaignGrowth(state, reportDay),
    metrics: regularReleaseMetrics(
      reportType,
      signals,
      comparisonBefore,
      comparisonAfter,
    ),
  };
}

/** Reports crossed by one advance, including fast-forward across D+9. */
export function getDecisionReportsArriving(
  previous: GameState,
  next: GameState,
): DecisionReport[] {
  const reports: DecisionReport[] = [];
  for (let reportDay = previous.day + 1; reportDay <= next.day; reportDay += 1) {
    const restrictionDay = reportDay - RESTRICTION_REPORT_DELAY_DAYS;
    if (isBanDay(restrictionDay)) {
      const report = buildRestrictionReport(next, restrictionDay, reportDay);
      if (report) reports.push(report);
    }
    const releaseDay = reportDay - RELEASE_REPORT_DELAY_DAYS;
    const batch = next.releaseHistory.find(
      (candidate) =>
        candidate.day === releaseDay &&
        candidate.releaseKind !== "baseline",
    );
    if (batch) {
      const report = buildReleaseReport(next, batch, reportDay);
      if (report) reports.push(report);
    }
  }
  return reports;
}
