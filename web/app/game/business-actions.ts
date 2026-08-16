import type {
  BusinessActionRecord,
  BusinessActionOutcome,
  BusinessActionRiskContext,
  BusinessActionType,
  BusinessRiskFactor,
  GameState,
} from "./types.ts";
import { THEME_BY_ID } from "./content.ts";
import {
  CAMPAIGN_END_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  RELEASE_INTERVAL,
} from "./campaign.ts";
import { OPERATING_CASH_MARGIN } from "./finance.ts";
import { getPublishedRestrictionPolicyProfile } from "./restriction-policy.ts";

export type BusinessActionDefinition = {
  type: BusinessActionType;
  kicker: string;
  title: string;
  cost: number;
  duration: number;
  cooldown: number;
  tone: "safe" | "growth" | "event" | "danger";
  summary: string;
  effect: string;
  minimumDay?: number;
  resolutionDelay?: number;
  successReturn?: number;
  oncePerCampaign?: boolean;
};

/** Monetary values are in eok won (KRW 100,000,000). */
export const BUSINESS_ACTIONS = [
  {
    type: "tv-cm",
    kicker: "MASS MEDIA",
    title: "TV CM 집중 편성",
    cost: 0.6,
    duration: 21,
    cooldown: 30,
    tone: "growth",
    summary: "넓은 층에 빠르게 노출되는 단기 캠페인",
    effect: "21일간 캐주얼 유입과 제품 구매율 상승",
  },
  {
    type: "animation-promotion",
    kicker: "MEDIA MIX",
    title: "애니메이션 프로모션",
    cost: 3,
    duration: 75,
    cooldown: 120,
    tone: "growth",
    summary: "제작위원회·방영 타이업에 참여하는 장기 투자",
    effect: "75일간 캐주얼·컬렉터 유입과 구매율 크게 상승",
  },
  {
    type: "championship",
    kicker: "OFFICIAL CIRCUIT",
    title: "공식 챔피언십 개최",
    cost: 0.8,
    duration: 7,
    cooldown: 21,
    tone: "event",
    summary: "현재 환경을 대중 앞에 그대로 중계하는 승부수",
    effect: "흥행 시 7일간 티켓·스폰서 매출 · 나쁜 환경은 이탈로 역류",
  },
  {
    type: "store-tour",
    kicker: "GRASSROOTS",
    title: "매장 체험회 순회",
    cost: 0.35,
    duration: 14,
    cooldown: 21,
    tone: "safe",
    summary: "지역 매장과 함께 진행하는 저위험 입문 행사",
    effect: "14일간 현장 판매 매출 + 완만한 신규 유입과 구매 신뢰 회복",
  },
  {
    type: "beginner-camp",
    kicker: "ONBOARDING",
    title: "스타터 번들 캠프",
    cost: 0.4,
    duration: 14,
    cooldown: 21,
    tone: "safe",
    summary: "대여 덱·룰 코칭·스타터 묶음 판매를 결합한 입문 행사",
    effect: "14일간 스타터 번들 매출 + 캐주얼 유입",
  },
  {
    type: "local-league",
    kicker: "LOCAL CIRCUIT",
    title: "지역 리그 지원금",
    cost: 0.5,
    duration: 21,
    cooldown: 30,
    tone: "event",
    summary: "공인 매장 리그에 상금·심판·중계 장비를 지원하는 경쟁층 투자",
    effect: "21일간 참가 키트 매출 + 경쟁층 유입",
  },
  {
    type: "reprint-campaign",
    kicker: "ACCESSIBILITY",
    title: "수요 카드 긴급 재판",
    cost: 0.55,
    duration: 30,
    cooldown: 45,
    tone: "safe",
    summary: "품귀 핵심 파츠를 재판하고 매장 교환 지원을 함께 여는 공급 대책",
    effect: "30일간 재판 상품 매출 + 구매 신뢰 회복",
  },
  {
    type: "collector-fair",
    kicker: "COLLECTOR EVENT",
    title: "일러스트·컬렉터 페어",
    cost: 0.65,
    duration: 14,
    cooldown: 30,
    tone: "growth",
    summary: "원화 전시·작가 토크·한정 프로모를 묶은 단기 수집 행사",
    effect: "14일간 한정 굿즈 매출 크게 상승 + 컬렉터 유입",
  },
  {
    type: "pack-odds",
    kicker: "MONETIZATION",
    title: "봉입률 하향 조정",
    cost: 0.1,
    duration: 30,
    cooldown: 60,
    tone: "danger",
    summary: "다음 정기 발매의 희소도를 몰래 높이는 고위험 결정",
    effect: "해당 발매 매출 +25% · 적발 시 구매 신뢰 급락",
  },
  {
    type: "season-overhaul",
    kicker: "SEASON RESET",
    title: "시즌 전면 개편",
    cost: 3.5,
    duration: 90,
    cooldown: 500,
    tone: "danger",
    summary: "룰·랭크·매장 키트를 한 번에 교체하는 대규모 시즌 전환",
    effect: "30일 뒤 판정 · 성공 시 ₩6.5억 회수와 시즌 성장 · 실패 시 대규모 이탈",
    minimumDay: 120,
    resolutionDelay: 30,
    successReturn: 6.5,
    oncePerCampaign: true,
  },
  {
    type: "global-launch",
    kicker: "GLOBAL MARKET",
    title: "해외판 동시 론칭",
    cost: 2.5,
    duration: 75,
    cooldown: 500,
    tone: "danger",
    summary: "번역·물류·해외 리그를 묶어 신규 시장을 여는 확장 프로젝트",
    effect: "21일 뒤 판정 · 성공 시 ₩5.2억 회수와 해외 유입 · 실패 시 신뢰 역풍",
    minimumDay: 180,
    resolutionDelay: 21,
    successReturn: 5.2,
    oncePerCampaign: true,
  },
  {
    type: "first-print-expansion",
    kicker: "SUPPLY BET",
    title: "대표 세트 초판 증산",
    cost: 1.5,
    duration: 30,
    cooldown: 500,
    tone: "danger",
    summary: "막 공개한 정기 세트의 초판 물량을 수요 예측보다 크게 잡는 승부수",
    effect: "발매일에만 집행 · 7일 뒤 성공 시 ₩4.0억 회수 · 실패 시 재고 역풍",
    minimumDay: 90,
    resolutionDelay: 7,
    successReturn: 4,
    oncePerCampaign: true,
  },
] as const satisfies readonly BusinessActionDefinition[];

export const BUSINESS_ACTION_BY_TYPE = Object.fromEntries(
  BUSINESS_ACTIONS.map((action) => [action.type, action]),
) as Record<BusinessActionType, BusinessActionDefinition>;

export const STRATEGIC_BUSINESS_ACTION_TYPES = [
  "season-overhaul",
  "global-launch",
  "first-print-expansion",
] as const satisfies readonly BusinessActionType[];

export type StrategicBusinessActionType =
  (typeof STRATEGIC_BUSINESS_ACTION_TYPES)[number];

/** Repeatable event sales saturate when several campaigns run concurrently. */
export const BUSINESS_ACTION_DAILY_REVENUE_CAP = 0.18;

export function isStrategicBusinessAction(
  type: BusinessActionType,
): type is StrategicBusinessActionType {
  return (STRATEGIC_BUSINESS_ACTION_TYPES as readonly BusinessActionType[])
    .includes(type);
}

/**
 * Incremental gross revenue generated each active day by an action.
 *
 * Values are expressed in eok won and deliberately exclude catalog sales,
 * release sales, user growth, purchase-rate bonuses, strategy modifiers, and
 * daily noise. This keeps the estimate useful both to the engine and to the
 * player-facing action card without duplicating persisted finance fields.
 */
export function getBusinessActionDailyGrossRevenue(
  state: Pick<GameState, "users">,
  type: BusinessActionType,
  outcome: BusinessActionOutcome = "active",
): number {
  const totalUsers =
    state.users.tier + state.users.casual + state.users.collector;
  let revenueWon = 0;

  switch (type) {
    case "championship":
      if (outcome === "success") {
        revenueWon = totalUsers * 4_000 + state.users.tier * 2_000;
      }
      break;
    case "store-tour":
      revenueWon = totalUsers * 500 + state.users.casual * 800;
      break;
    case "beginner-camp":
      revenueWon = totalUsers * 400 + state.users.casual * 1_200;
      break;
    case "local-league":
      revenueWon = totalUsers * 250 + state.users.tier * 1_600;
      break;
    case "reprint-campaign":
      revenueWon = totalUsers * 650;
      break;
    case "collector-fair":
      revenueWon = totalUsers * 300 + state.users.collector * 7_000;
      break;
    case "tv-cm":
    case "animation-promotion":
    case "pack-odds":
    case "season-overhaul":
    case "global-launch":
    case "first-print-expansion":
      break;
  }

  return round(revenueWon / 100_000_000, 4);
}

/**
 * Combines active action revenue while preventing concurrent event spam from
 * scaling linearly. Championship revenue is a risk-gated sponsorship payout
 * and remains outside the repeatable-event saturation cap.
 */
export function getStackedBusinessActionDailyGrossRevenue(
  state: Pick<GameState, "users">,
  records: readonly Pick<BusinessActionRecord, "type" | "outcome">[],
): number {
  let repeatableRevenue = 0;
  let championshipRevenue = 0;

  for (const record of records) {
    const revenue = getBusinessActionDailyGrossRevenue(
      state,
      record.type,
      record.outcome,
    );
    if (record.type === "championship") {
      championshipRevenue += revenue;
    } else {
      repeatableRevenue += revenue;
    }
  }

  return round(
    championshipRevenue +
      Math.min(BUSINESS_ACTION_DAILY_REVENUE_CAP, repeatableRevenue),
    4,
  );
}

/**
 * Static incremental gross revenue estimate against actions already running.
 * Audience growth, release-purchase lift, strategy and daily noise are excluded.
 */
export function getBusinessActionProjectedDirectGrossRevenue(
  state: Pick<GameState, "day" | "operations" | "users">,
  type: BusinessActionType,
  outcome: BusinessActionOutcome = "active",
): number {
  const definition = BUSINESS_ACTION_BY_TYPE[type];
  let grossRevenue = 0;

  for (let offset = 1; offset <= definition.duration; offset += 1) {
    const projectedDay = state.day + offset;
    const activeRecords = state.operations.records.filter((record) =>
      isBusinessActionEffectActive(record, projectedDay)
    );
    const baseline = getStackedBusinessActionDailyGrossRevenue(
      state,
      activeRecords,
    );
    const withAction = getStackedBusinessActionDailyGrossRevenue(state, [
      ...activeRecords,
      { type, outcome },
    ]);
    grossRevenue += withAction - baseline;
  }

  return round(grossRevenue, 4);
}

/** Direct operating-cash estimate after the action's up-front cost. */
export function getBusinessActionProjectedDirectCash(
  state: Pick<GameState, "day" | "operations" | "users">,
  type: BusinessActionType,
  outcome: BusinessActionOutcome = "active",
): number {
  const definition = BUSINESS_ACTION_BY_TYPE[type];
  const grossRevenue = getBusinessActionProjectedDirectGrossRevenue(
    state,
    type,
    outcome,
  );
  return round(
    grossRevenue * OPERATING_CASH_MARGIN - definition.cost,
    4,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getRecentReleaseQuality(state: GameState): number {
  const batches = state.releaseHistory
    .filter((batch) => batch.day <= state.day && state.day - batch.day <= 90)
    .slice(-3);
  const products = batches.flatMap((batch) => batch.products);
  if (products.length === 0) return 50;

  const scores = products.map((product) => {
    const content = THEME_BY_ID[product.themeId];
    const runtime = state.themes[product.themeId];
    if (!content) return 50;
    const share = runtime?.share ?? 0.08;
    const fatigue = runtime?.fatigue ?? 20;
    return clamp(
      55 +
        content.appeal * 0.25 +
        Math.min(10, share * 80) -
        Math.max(0, share - 0.25) * 100 -
        fatigue * 0.2 -
        Math.max(0, Math.abs(product.powerAdjustment) - 1) * 6,
      0,
      100,
    );
  });
  return round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2);
}

function getRecentPolicyQuality(
  state: GameState,
): BusinessActionRiskContext["policyQuality"] {
  const latestDay = state.community.reduce((latest, event) => {
    if (
      event.day <= state.day &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction" ||
        event.type === "restriction-no-change")
    ) {
      return Math.max(latest, event.day);
    }
    return latest;
  }, -1);
  if (latestDay < 0) return "none";
  return getPublishedRestrictionPolicyProfile(state, latestDay).quality;
}

function factorWithLargestScore(
  scores: Readonly<Record<BusinessRiskFactor, number>>,
): BusinessRiskFactor {
  return (Object.entries(scores) as [BusinessRiskFactor, number][]).reduce(
    (best, candidate) => candidate[1] > best[1] ? candidate : best,
  )[0];
}

function getRiskContext(state: GameState): BusinessActionRiskContext {
  const environmentHealth = getBusinessEnvironmentHealth(state);
  const releaseQuality = getRecentReleaseQuality(state);
  const policyQuality = getRecentPolicyQuality(state);
  const timing: BusinessActionRiskContext["timing"] = state.day < 180
    ? "early"
    : state.day < 360
      ? "middle"
      : "late";
  const policyRisk = policyQuality === "balanced"
    ? 0
    : policyQuality === "incomplete"
      ? 12
      : policyQuality === "narrow"
        ? 22
        : 8;
  const policyStrength = policyQuality === "balanced" ? 14 : 0;
  const riskScores: Record<BusinessRiskFactor, number> = {
    environment: Math.max(0, 70 - environmentHealth),
    trust: Math.max(0, 72 - state.purchaseTrust),
    policy: policyRisk,
    release: Math.max(0, 65 - releaseQuality),
    timing: timing === "late" ? 10 : 0,
    execution: 0.01,
  };
  const strengthScores: Record<BusinessRiskFactor, number> = {
    environment: Math.max(0, environmentHealth - 62),
    trust: Math.max(0, state.purchaseTrust - 65),
    policy: policyStrength,
    release: Math.max(0, releaseQuality - 58),
    timing: timing === "early" ? 8 : timing === "middle" ? 4 : 0,
    execution: 0.01,
  };
  return {
    environmentHealth: round(environmentHealth, 2),
    purchaseTrust: round(state.purchaseTrust, 2),
    releaseQuality,
    policyQuality,
    timing,
    primaryRisk: factorWithLargestScore(riskScores),
    primaryStrength: factorWithLargestScore(strengthScores),
  };
}

export type StrategicProjectRiskProfile = {
  risk: number;
  context: BusinessActionRiskContext;
};

export function getStrategicProjectRiskProfile(
  state: GameState,
  type: StrategicBusinessActionType,
): StrategicProjectRiskProfile {
  const context = getRiskContext(state);
  const { environmentHealth: health, purchaseTrust: trust, releaseQuality } = context;
  const policyAdjustment = type === "season-overhaul"
    ? context.policyQuality === "balanced" ? -0.05 : context.policyQuality === "incomplete" ? 0.06 : context.policyQuality === "narrow" ? 0.14 : 0.1
    : type === "global-launch"
      ? context.policyQuality === "balanced" ? -0.03 : context.policyQuality === "incomplete" ? 0.03 : context.policyQuality === "narrow" ? 0.07 : 0.05
      : 0;
  const lateAdjustment = context.timing === "late"
    ? type === "first-print-expansion" ? 0.04 : 0.08
    : 0;
  const risk = type === "season-overhaul"
    ? 0.2 + Math.max(0, 70 - health) * 0.008 + Math.max(0, 72 - trust) * 0.007 + policyAdjustment + Math.max(0, 65 - releaseQuality) * 0.004 + lateAdjustment
    : type === "global-launch"
      ? 0.22 + Math.max(0, 62 - health) * 0.004 + Math.max(0, 75 - trust) * 0.01 + policyAdjustment + Math.max(0, 70 - releaseQuality) * 0.006 + lateAdjustment
      : 0.2 + Math.max(0, 60 - health) * 0.003 + Math.max(0, 68 - trust) * 0.006 + Math.max(0, 72 - releaseQuality) * 0.01 + lateAdjustment;
  const minimum = type === "season-overhaul" ? 0.15 : type === "global-launch" ? 0.18 : 0.16;
  const maximum = type === "season-overhaul" ? 0.85 : type === "global-launch" ? 0.88 : 0.82;
  return { risk: round(clamp(risk, minimum, maximum), 4), context };
}

export function getBusinessActionScheduledEndDay(
  startedDay: number,
  type: BusinessActionType,
): number {
  const definition = BUSINESS_ACTION_BY_TYPE[type];
  if (type === "pack-odds") {
    const releaseDay =
      (Math.floor(startedDay / RELEASE_INTERVAL) + 1) * RELEASE_INTERVAL;
    return releaseDay + definition.duration - 1;
  }
  return startedDay + definition.duration;
}

export function getBusinessEnvironmentHealth(state: GameState): number {
  return Math.max(
    0,
    Math.min(
      100,
      100 -
        state.activeThemeIds.reduce((sum, themeId) => {
          const theme = state.themes[themeId];
          return sum + theme.unpleasantness * theme.share;
        }, 0),
    ),
  );
}

export function getChampionshipBacklashRisk(state: GameState): number {
  const health = getBusinessEnvironmentHealth(state);
  const topShare = Math.max(
    0,
    ...state.activeThemeIds.map((themeId) => state.themes[themeId].share),
  );
  const weightedFatigue = state.activeThemeIds.reduce((sum, themeId) => {
    const theme = state.themes[themeId];
    return sum + theme.fatigue * theme.share;
  }, 0);
  const risk =
    0.08 +
    Math.max(0, 60 - health) * 0.012 +
    Math.max(0, topShare - 0.28) * 1.4 +
    Math.max(0, weightedFatigue - 45) * 0.004;
  return Math.max(0.05, Math.min(0.9, risk));
}

export function getPackOddsDetectionRisk(state: GameState): number {
  const recentAdjustments = state.operations.records.filter(
    (record) =>
      record.type === "pack-odds" && state.day - record.startedDay <= 180,
  ).length;
  return Math.min(0.66, 0.3 + recentAdjustments * 0.12);
}

export function getLatestBusinessAction(
  state: GameState,
  type: BusinessActionType,
): BusinessActionRecord | undefined {
  return state.operations.records.findLast((record) => record.type === type);
}

export function getBusinessActionCooldownRemaining(
  state: GameState,
  type: BusinessActionType,
): number {
  const latest = getLatestBusinessAction(state, type);
  if (!latest) return 0;
  const cooldown = BUSINESS_ACTION_BY_TYPE[type].cooldown;
  return Math.max(0, cooldown - (state.day - latest.startedDay));
}

export function isBusinessActionEffectActive(
  record: BusinessActionRecord,
  day: number,
): boolean {
  if (day <= record.startedDay || day > record.endsDay) return false;
  return (
    record.outcome === "active" ||
    record.outcome === "success" ||
    record.outcome === "backlash" ||
    record.outcome === "clean"
  );
}

export type BusinessActionAvailability = {
  available: boolean;
  reason: string | null;
  cooldownRemaining: number;
};

export function getBusinessActionAvailability(
  state: GameState,
  type: BusinessActionType,
): BusinessActionAvailability {
  const definition = BUSINESS_ACTION_BY_TYPE[type];
  const cooldownRemaining = getBusinessActionCooldownRemaining(state, type);
  let reason: string | null = null;

  if (state.operations.pendingEvent) {
    reason = "도착한 돌발 경영 이벤트의 방향을 먼저 결정해야 합니다.";
  } else if (state.phase !== "running") {
    reason = "의사결정을 먼저 마쳐야 합니다.";
  } else if (state.day >= LAST_DECISION_DAY) {
    reason = "결산 기간에는 새 사업 액션을 시작할 수 없습니다.";
  } else if (
    isStrategicBusinessAction(type) &&
    state.operations.records.some((record) =>
      isStrategicBusinessAction(record.type)
    )
  ) {
    reason = "대형 프로젝트 슬롯은 임기 중 한 번만 사용할 수 있습니다.";
  } else if (
    definition.minimumDay !== undefined &&
    state.day < definition.minimumDay
  ) {
    reason = `DAY ${definition.minimumDay}부터 검토할 수 있는 대형 프로젝트입니다.`;
  } else if (
    isStrategicBusinessAction(type) &&
    definition.resolutionDelay !== undefined &&
    state.day + definition.resolutionDelay > LAST_DECISION_DAY
  ) {
    reason = `DAY ${LAST_DECISION_DAY} 전에 성과를 확정할 시간이 부족합니다.`;
  } else if (
    type === "first-print-expansion" &&
    !state.releaseHistory.some((batch) => batch.day === state.day)
  ) {
    reason = "정기 발매 심사를 마친 당일에만 초판 증산을 결정할 수 있습니다.";
  } else if (
    state.operations.records.some((record) => record.startedDay === state.day)
  ) {
    reason = "오늘은 이미 사업 액션을 집행했습니다.";
  } else if (state.finance.cash + 1e-9 < definition.cost) {
    reason = "가용 자금이 부족합니다.";
  } else if (cooldownRemaining > 0) {
    reason = `${cooldownRemaining}일 뒤 다시 집행할 수 있습니다.`;
  } else if (
    type === "pack-odds" &&
    state.operations.records.some(
      (record) => record.type === type && record.outcome === "pending",
    )
  ) {
    reason = "다음 발매에 적용할 조정이 이미 예약되어 있습니다.";
  } else if (
    type === "pack-odds" &&
    (Math.floor(state.day / RELEASE_INTERVAL) + 1) * RELEASE_INTERVAL >
      LAST_RELEASE_DAY
  ) {
    reason = "남은 캠페인에 적용할 정기 발매가 없습니다.";
  } else if (
    getBusinessActionScheduledEndDay(state.day, type) > CAMPAIGN_END_DAY
  ) {
    reason = "캠페인 종료 전에 효과가 끝나지 않습니다.";
  }

  return {
    available: reason === null,
    reason,
    cooldownRemaining,
  };
}
