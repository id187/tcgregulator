import { getBusinessEnvironmentHealth } from "./business-actions.ts";
import {
  CAMPAIGN_END_DAY,
  getNextRegularReleaseDay,
  LAST_RELEASE_DAY,
  PLAYER_START_DAY,
} from "./campaign.ts";
import { getOperatingRunwayMonths } from "./finance.ts";
import type { DailyHistory, GameState } from "./types.ts";

export const CAMPAIGN_STARTING_AUDIENCE = 10_000;
export const SERVICE_RISK_AUDIENCE = 1_000;
export const SERVICE_RECOVERY_AUDIENCE = 2_000;
export const SERVICE_RISK_TRIGGER_DAYS = 5;
export const SERVICE_RECOVERY_STREAK_DAYS = 3;
export const SERVICE_RECOVERY_CASH = 0.5;

export type ServiceFailureReason = "audience-collapse" | "insolvency";

export type ServiceRecoveryChallengeType =
  | "audience-recovery"
  | "cash-recovery";

export type ServiceRecoveryChallenge = {
  id: string;
  type: ServiceRecoveryChallengeType;
  title: string;
  cause: string;
  objective: string;
  startedDay: number;
  evaluationStartDay: number;
  deadlineDay: number;
  daysRemaining: number;
  recoveryStreak: number;
  requiredRecoveryStreak: number;
};

export type OrganizationTrajectoryStage =
  | "breakout"
  | "growing"
  | "steady"
  | "struggling"
  | "critical"
  | "failed";

export type OrganizationTrajectory = {
  stage: OrganizationTrajectoryStage;
  tone: "positive" | "neutral" | "caution" | "critical";
  label: string;
  headline: string;
  detail: string;
  totalUsers: number;
  audienceRatio: number;
  thirtyDayUserRate: number;
  cashRunwayMonths: number;
  audienceCollapseStreak: number;
  insolvencyStreak: number;
  shutdownDaysRemaining: number | null;
  challenge: ServiceRecoveryChallenge | null;
  failureReason: ServiceFailureReason | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function getTotalActiveUsers(
  state: Pick<GameState, "users">,
): number {
  return state.users.tier + state.users.casual + state.users.collector;
}

export function getAudienceBaseline(
  state: Pick<GameState, "history" | "users">,
): number {
  const current = getTotalActiveUsers(state);
  return state.history.find((entry) => entry.day === PLAYER_START_DAY)?.totalUsers ??
    state.history.find((entry) => entry.day === 0)?.totalUsers ??
    state.history[0]?.totalUsers ??
    (current > 0 ? current : CAMPAIGN_STARTING_AUDIENCE);
}

function countTrailingDays(
  history: readonly DailyHistory[],
  predicate: (entry: DailyHistory) => boolean,
): number {
  let streak = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!predicate(history[index])) break;
    streak += 1;
  }
  return streak;
}

export function getAudienceCollapseStreak(
  state: Pick<GameState, "history" | "users">,
): number {
  const currentUsers = getTotalActiveUsers(state);
  if (currentUsers > SERVICE_RISK_AUDIENCE) return 0;
  return countTrailingDays(
    state.history,
    (entry) => entry.totalUsers <= SERVICE_RISK_AUDIENCE,
  );
}

export function getInsolvencyStreak(
  state: Pick<GameState, "history" | "finance">,
): number {
  const currentlyInsolvent =
    state.finance.cash <= 0.0001 && state.finance.todayOperatingCash < 0;
  if (!currentlyInsolvent) return 0;
  return countTrailingDays(
    state.history,
    (entry) =>
      (entry.cash ?? Number.POSITIVE_INFINITY) <= 0.0001 &&
      (entry.operatingCash ?? 0) < 0,
  );
}

type ChallengeScanResult = {
  active: ServiceRecoveryChallenge | null;
  failedOnDay: number | null;
};

function scanRecoveryChallenge(
  state: Pick<GameState, "history">,
  type: ServiceRecoveryChallengeType,
): ChallengeScanResult {
  let riskStreak = 0;
  let recoveryStreak = 0;
  let active: ServiceRecoveryChallenge | null = null;
  const rows = state.history.filter((entry) => entry.day >= PLAYER_START_DAY);

  for (const entry of rows) {
    const atRisk = type === "audience-recovery"
      ? entry.totalUsers <= SERVICE_RISK_AUDIENCE
      : (entry.cash ?? Number.POSITIVE_INFINITY) <= 0.0001 &&
        (entry.operatingCash ?? 0) < 0;
    const recovered = type === "audience-recovery"
      ? entry.totalUsers >= SERVICE_RECOVERY_AUDIENCE
      : (entry.cash ?? 0) >= SERVICE_RECOVERY_CASH &&
        (entry.operatingCash ?? Number.NEGATIVE_INFINITY) >= 0;

    if (!active) {
      riskStreak = atRisk ? riskStreak + 1 : 0;
      if (riskStreak < SERVICE_RISK_TRIGGER_DAYS) continue;
      const nextRegularReviewDay = getNextRegularReleaseDay(entry.day);
      const evaluationStartDay = nextRegularReviewDay <= LAST_RELEASE_DAY
        ? nextRegularReviewDay + 1
        : Math.min(CAMPAIGN_END_DAY - SERVICE_RECOVERY_STREAK_DAYS + 1, entry.day + 14);
      active = {
        id: `${type}-${entry.day}`,
        type,
        title: type === "audience-recovery"
          ? "유저 기반 긴급 회복"
          : "지급불능 긴급 탈출",
        cause: type === "audience-recovery"
          ? `활성 유저 ${SERVICE_RISK_AUDIENCE.toLocaleString("ko-KR")}명 이하가 ${SERVICE_RISK_TRIGGER_DAYS}일 지속됐습니다.`
          : `운영자금 0원과 일일 적자가 ${SERVICE_RISK_TRIGGER_DAYS}일 지속됐습니다.`,
        objective: type === "audience-recovery"
          ? `활성 유저 ${SERVICE_RECOVERY_AUDIENCE.toLocaleString("ko-KR")}명 이상을 ${SERVICE_RECOVERY_STREAK_DAYS}일 연속 유지`
          : `보유자금 ${SERVICE_RECOVERY_CASH}억 이상과 일일 영업현금 흑자를 ${SERVICE_RECOVERY_STREAK_DAYS}일 연속 유지`,
        startedDay: entry.day,
        evaluationStartDay,
        deadlineDay: evaluationStartDay + SERVICE_RECOVERY_STREAK_DAYS - 1,
        daysRemaining: Math.max(0, evaluationStartDay - entry.day),
        recoveryStreak: 0,
        requiredRecoveryStreak: SERVICE_RECOVERY_STREAK_DAYS,
      };
      recoveryStreak = 0;
      continue;
    }

    if (entry.day < active.evaluationStartDay) {
      active = {
        ...active,
        daysRemaining: active.evaluationStartDay - entry.day,
      };
      continue;
    }
    if (!recovered) {
      return { active, failedOnDay: entry.day };
    }
    recoveryStreak += 1;
    active = {
      ...active,
      daysRemaining: Math.max(0, active.deadlineDay - entry.day),
      recoveryStreak,
    };
    if (recoveryStreak >= SERVICE_RECOVERY_STREAK_DAYS) {
      active = null;
      riskStreak = 0;
      recoveryStreak = 0;
      continue;
    }
  }
  return { active, failedOnDay: null };
}

function getRecoveryChallengeResults(
  state: Pick<GameState, "history">,
): {
  active: ServiceRecoveryChallenge | null;
  failureReason: ServiceFailureReason | null;
} {
  const audience = scanRecoveryChallenge(state, "audience-recovery");
  const cash = scanRecoveryChallenge(state, "cash-recovery");
  const failures = [
    audience.failedOnDay === null
      ? null
      : { day: audience.failedOnDay, reason: "audience-collapse" as const },
    cash.failedOnDay === null
      ? null
      : { day: cash.failedOnDay, reason: "insolvency" as const },
  ].filter(
    (failure): failure is { day: number; reason: ServiceFailureReason } =>
      failure !== null,
  ).sort((left, right) => left.day - right.day);
  const active = [audience.active, cash.active]
    .filter((challenge): challenge is ServiceRecoveryChallenge => challenge !== null)
    .sort((left, right) => left.deadlineDay - right.deadlineDay)[0] ?? null;
  return {
    active: failures.length > 0 ? null : active,
    failureReason: failures[0]?.reason ?? null,
  };
}

export function getActiveServiceRecoveryChallenge(
  state: Pick<GameState, "history">,
): ServiceRecoveryChallenge | null {
  return getRecoveryChallengeResults(state).active;
}

export function getServiceFailureReason(
  state: Pick<GameState, "history" | "users" | "finance">,
): ServiceFailureReason | null {
  if (getTotalActiveUsers(state) <= 0) return "audience-collapse";
  return getRecoveryChallengeResults(state).failureReason;
}

/**
 * Converts the health and trust the player created into audience momentum.
 * Healthy, trusted games can compound into a visible hit; chronically hostile
 * formats and broken product trust lose players much faster than they grow.
 */
export function getOrganizationAudienceRate(
  state: GameState,
): number {
  if (state.day < PLAYER_START_DAY) return 0;
  const environmentHealth = getBusinessEnvironmentHealth(state);
  const audienceBaseline = Math.max(1, getAudienceBaseline(state));
  const audienceRatio = getTotalActiveUsers(state) / audienceBaseline;
  const healthSignal = clamp((environmentHealth - 60) / 20, -1, 1);
  const trustSignal = clamp((state.purchaseTrust - 70) / 20, -1, 1);
  const qualitySignal = healthSignal * 0.58 + trustSignal * 0.42;
  const qualityRate = qualitySignal >= 0
    ? qualitySignal * 0.0026
    : qualitySignal * 0.009;
  const breakoutMomentum =
    environmentHealth >= 74 && state.purchaseTrust >= 82 ? 0.0007 : 0;
  const growthMomentum =
    clamp((audienceRatio - 1.25) / 2.75, 0, 1) * 0.0015;
  const declineMomentum =
    clamp((0.75 - audienceRatio) / 0.65, 0, 1) * 0.008;
  const formatCollapse = environmentHealth <= 45 ? 0.0025 : 0;
  const trustCollapse = state.purchaseTrust <= 45 ? 0.003 : 0;
  const insolvencyDrag =
    state.finance.cash <= 0.0001 && state.finance.todayOperatingCash < 0
      ? 0.002
      : 0;
  return round(
    clamp(
      qualityRate +
        breakoutMomentum +
        growthMomentum -
        declineMomentum -
        formatCollapse -
        trustCollapse -
        insolvencyDrag,
      -0.025,
      0.005,
    ),
    6,
  );
}

function getThirtyDayUserRate(state: GameState, totalUsers: number): number {
  const comparisonDay = state.day - 30;
  const baseline = [...state.history]
    .reverse()
    .find((entry) => entry.day <= comparisonDay)?.totalUsers ??
    state.history[0]?.totalUsers ??
    totalUsers;
  return round(baseline > 0 ? totalUsers / baseline - 1 : 0, 4);
}

export function getOrganizationTrajectory(
  state: GameState,
): OrganizationTrajectory {
  const totalUsers = getTotalActiveUsers(state);
  const audienceBaseline = getAudienceBaseline(state);
  const audienceRatio = round(
    audienceBaseline > 0 ? totalUsers / audienceBaseline : 1,
    4,
  );
  const thirtyDayUserRate = getThirtyDayUserRate(state, totalUsers);
  const cashRunwayMonths = getOperatingRunwayMonths(
    state.finance.cash,
    totalUsers,
  );
  const audienceCollapseStreak = getAudienceCollapseStreak(state);
  const insolvencyStreak = getInsolvencyStreak(state);
  const recovery = getRecoveryChallengeResults(state);
  const failureReason = getTotalActiveUsers(state) <= 0
    ? "audience-collapse"
    : recovery.failureReason;
  const challenge = recovery.active;
  const shutdownDaysRemaining = challenge?.daysRemaining ?? null;

  const common = {
    totalUsers,
    audienceRatio,
    thirtyDayUserRate,
    cashRunwayMonths,
    audienceCollapseStreak,
    insolvencyStreak,
    shutdownDaysRemaining,
    challenge,
    failureReason,
  };

  if (failureReason === "insolvency") {
    return {
      ...common,
      stage: "failed",
      tone: "critical",
      label: "지급불능",
      headline: "운영자금이 끊겨 서비스가 종료됐습니다",
      detail: "비상 경영 챌린지의 자금 회복 목표를 달성하지 못했습니다.",
    };
  }
  if (failureReason === "audience-collapse") {
    return {
      ...common,
      totalUsers: 0,
      audienceRatio: 0,
      thirtyDayUserRate: -1,
      stage: "failed",
      tone: "critical",
      label: "서비스 종료",
      headline: "유저 기반이 붕괴해 공식 운영이 종료됐습니다",
      detail: totalUsers <= 0
        ? "활성 유저가 모두 이탈했습니다."
        : "비상 경영 챌린지의 유저 회복 목표를 달성하지 못했습니다.",
    };
  }
  if (challenge) {
    return {
      ...common,
      stage: "critical",
      tone: "critical",
      label: "비상 경영 챌린지",
      headline: `DAY ${challenge.evaluationStartDay} 신팩 발매부터 목표 유지 실패 시 게임 오버`,
      detail: `${challenge.objective} · 현재 ${challenge.recoveryStreak}/${challenge.requiredRecoveryStreak}일`,
    };
  }
  if (
    audienceCollapseStreak >= Math.ceil(SERVICE_RISK_TRIGGER_DAYS / 2) ||
    insolvencyStreak >= Math.ceil(SERVICE_RISK_TRIGGER_DAYS / 2) ||
    audienceRatio < 0.35
  ) {
    const reason = audienceCollapseStreak > 0
      ? `활성 유저 위험 ${audienceCollapseStreak}/${SERVICE_RISK_TRIGGER_DAYS}일`
      : `지급불능 위험 ${insolvencyStreak}/${SERVICE_RISK_TRIGGER_DAYS}일`;
    return {
      ...common,
      stage: "critical",
      tone: "critical",
      label: "비상 경영 예고",
      headline: "위험이 5일 지속되면 회복 챌린지가 발령됩니다",
      detail: reason,
    };
  }
  if (
    insolvencyStreak > 0 ||
    audienceRatio < 0.7 ||
    thirtyDayUserRate <= -0.08 ||
    cashRunwayMonths < 0.5
  ) {
    return {
      ...common,
      stage: "struggling",
      tone: "caution",
      label: "급격한 침체",
      headline: "유저와 사업 기반이 동시에 흔들리고 있습니다",
      detail: `최근 30일 유저 ${thirtyDayUserRate >= 0 ? "+" : ""}${Math.round(thirtyDayUserRate * 100)}% · 현금 버틸 여력 ${cashRunwayMonths.toFixed(1)}개월`,
    };
  }
  if (audienceRatio >= 8.5 && thirtyDayUserRate > 0.03) {
    return {
      ...common,
      stage: "breakout",
      tone: "positive",
      label: "전국적 흥행",
      headline: "이 TCG가 시장의 중심으로 떠오르고 있습니다",
      detail: `인수 대비 ${audienceRatio.toFixed(1)}배 · 최근 30일 +${Math.round(thirtyDayUserRate * 100)}%`,
    };
  }
  if (audienceRatio >= 1.25 && thirtyDayUserRate > 0.01) {
    return {
      ...common,
      stage: "growing",
      tone: "positive",
      label: "뚜렷한 성장",
      headline: "신규 유입이 이탈을 앞지르며 판이 커지고 있습니다",
      detail: `인수 대비 +${Math.round((audienceRatio - 1) * 100)}% · 최근 30일 +${Math.round(thirtyDayUserRate * 100)}%`,
    };
  }
  return {
    ...common,
    stage: "steady",
    tone: "neutral",
    label: "시장 관망",
    headline: "TCG의 흥망이 아직 한쪽으로 기울지 않았습니다",
    detail: `인수 대비 ${Math.round((audienceRatio - 1) * 100)}% · 최근 30일 ${thirtyDayUserRate >= 0 ? "+" : ""}${Math.round(thirtyDayUserRate * 100)}%`,
  };
}
