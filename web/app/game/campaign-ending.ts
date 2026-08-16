import {
  BUSINESS_ACTION_BY_TYPE,
  getBusinessEnvironmentHealth,
  isStrategicBusinessAction,
} from "./business-actions.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  LAST_DECISION_DAY,
  PLAYER_START_DAY,
} from "./campaign.ts";
import { getPublishedRestrictionPolicyProfile } from "./restriction-policy.ts";
import type { GameState } from "./types.ts";

/** Monetary values are in eok won (KRW 100,000,000). */
export type CampaignCashBand = "crisis" | "tight" | "reserve";

export type CampaignEnvironmentBand = "danger" | "caution" | "stable";

export const CAMPAIGN_CASH_TIGHT_MIN = 5;
export const CAMPAIGN_CASH_RESERVE_MIN = 14;
export const CAMPAIGN_ENVIRONMENT_CAUTION_MIN = 50;
export const CAMPAIGN_ENVIRONMENT_STABLE_MIN = 70;

export const CAMPAIGN_SUPPORT_RELEASE_MIN = 3;
export const CAMPAIGN_SUPPORT_THEME_MIN = 2;
export const CAMPAIGN_SUPPORT_DIRECTION_MIN = 2;
export const CAMPAIGN_RELEASE_POSITIVE_PRESSURE_MAX = 14;
export const CAMPAIGN_RELEASE_TIER_ZERO_MAX = 3;
export const CAMPAIGN_BALANCED_REVIEW_MIN = 5;
export const CAMPAIGN_STALE_RELEASE_MIN = 2;
export const CAMPAIGN_BUSINESS_ACTION_MIN = 6;
export const CAMPAIGN_BUSINESS_TYPE_MIN = 4;
export const CAMPAIGN_BUSINESS_TONE_MIN = 3;
export const CAMPAIGN_BUSINESS_RECOVERY_ACTION_MIN = 9;
export const CAMPAIGN_BUSINESS_RECOVERY_TYPE_MIN = 5;
export const CAMPAIGN_EVENT_RESOLUTION_MIN = 20;
export const CAMPAIGN_EVENT_SUCCESS_RATE_MIN = 0.7;
export const CAMPAIGN_EVENT_RECOVERY_RATE_MIN = 0.65;
export const CAMPAIGN_EVENT_RECOVERY_TRUST_MIN = 80;

export type CampaignStewardshipEvaluation = {
  complete: boolean;
  passedPillars: number;
  pillars: {
    support: {
      passed: boolean;
      releasedRequests: number;
      distinctThemes: number;
      distinctDirections: number;
      positivePowerPressure: number;
      tierZeroProducts: number;
    };
    policy: {
      passed: boolean;
      reviewed: number;
      balancedReviews: number;
      staleFullyReleased: number;
    };
    business: {
      passed: boolean;
      qualifyingActions: number;
      distinctTypes: number;
      distinctTones: number;
      strategicAttempts: number;
      strategicSuccesses: number;
      usedRecoveryPath: boolean;
    };
    events: {
      passed: boolean;
      resolved: number;
      successes: number;
      successRate: number;
      requiredSuccesses: number;
      usedTrustRecoveryPath: boolean;
    };
  };
};

export type CampaignEndingEvaluation = {
  scores: {
    cash: number;
    environmentHealth: number;
  };
  bands: {
    cash: CampaignCashBand;
    environment: CampaignEnvironmentBand;
  };
  stewardship: CampaignStewardshipEvaluation;
  qualifiedForBestEnding: boolean;
  title: string;
  body: string;
  /** Informational context only; it never changes the nine-way ending. */
  totalUsers: number;
};

type EndingCopy = Pick<CampaignEndingEvaluation, "title" | "body">;

const ENDING_COPY = {
  crisis: {
    danger: {
      title: "무너진 기반",
      body: "운영자금이 바닥권이고 게임 환경도 위험 수위다. 다음 시즌을 열기 어려운 결산이다.",
    },
    caution: {
      title: "버티지 못한 운영",
      body: "환경은 완전히 무너지지 않았지만 운영자금이 위기선 아래다. 회복할 시간을 살 여력이 부족하다.",
    },
    stable: {
      title: "좋은 환경, 빈 금고",
      body: "게임 환경은 안정적이지만 운영자금이 위기선 아래다. 좋은 판을 유지할 사업 기반이 남지 않았다.",
    },
  },
  tight: {
    danger: {
      title: "위태로운 연장전",
      body: "운영을 이어갈 자금은 조금 남았지만 환경은 위험 수위다. 어느 쪽도 다음 고비를 버틸 여유가 없다.",
    },
    caution: {
      title: "간신히 지킨 균형",
      body: "운영자금도 환경도 여유가 없다. 무너지지는 않았지만 어느 쪽도 안심할 단계는 아니다.",
    },
    stable: {
      title: "건전한 판, 빠듯한 회사",
      body: "환경은 안정권에 들었지만 운영자금은 빠듯하다. 게임은 지켰고 회사에는 다음 고비가 남았다.",
    },
  },
  reserve: {
    danger: {
      title: "돈은 남고 판은 흔들렸다",
      body: "운영자금은 충분히 남았지만 환경은 위험 수위다. 재정 여력만으로 판의 지속 가능성을 보장할 수 없다.",
    },
    caution: {
      title: "성장 뒤의 숙제",
      body: "운영자금은 충분하고 환경은 경계 구간이다. 사업은 버틸 수 있지만 판에는 정비가 더 필요하다.",
    },
    stable: {
      title: "지속 가능한 리그",
      body: "운영자금과 환경 건강도가 모두 안정권이다. 다음 시즌을 이어갈 기반을 갖춘 결산이다.",
    },
  },
} as const satisfies Record<
  CampaignCashBand,
  Record<CampaignEnvironmentBand, EndingCopy>
>;

const INCOMPLETE_STEWARDSHIP_COPY: EndingCopy = {
  title: "성장 뒤의 숙제",
  body: "운영자금과 환경은 안정권이지만 지원 육성·금제 운영·사업 포트폴리오·돌발 대응의 최종 감사가 미완료다. 다음 시즌을 맡기기에는 운영 체계가 한쪽에 치우쳤다.",
};

function isRestrictionDecisionType(type: string): boolean {
  return (
    type === "restriction-applied" ||
    type === "cosmetic-restriction" ||
    type === "restriction-no-change"
  );
}

function isQualifyingBusinessOutcome(outcome: string): boolean {
  return (
    outcome === "completed" ||
    outcome === "success" ||
    outcome === "clean"
  );
}

/**
 * Final-audit progress derived exclusively from existing immutable histories.
 * No additional save fields are needed, so old saves remain structurally valid.
 */
export function getCampaignStewardshipEvaluation(
  state: GameState,
): CampaignStewardshipEvaluation {
  const releasedRequests = state.supportRequests.filter(
    (request) =>
      request.proposedDay >= PLAYER_START_DAY &&
      request.status === "released" &&
      request.releasedDay !== null,
  );
  const playerProducts = state.releaseHistory
    .filter((batch) => batch.day >= PLAYER_START_DAY)
    .flatMap((batch) => batch.products);
  const support = {
    releasedRequests: releasedRequests.length,
    distinctThemes: new Set(releasedRequests.map((request) => request.themeId)).size,
    distinctDirections: new Set(
      releasedRequests.map((request) => request.direction),
    ).size,
    positivePowerPressure: playerProducts.reduce(
      (total, product) => total + Math.max(0, product.powerAdjustment),
      0,
    ),
    tierZeroProducts: playerProducts.filter(
      (product) => product.expectedTier === "Tier 0",
    ).length,
    passed: false,
  };
  support.passed =
    support.releasedRequests >= CAMPAIGN_SUPPORT_RELEASE_MIN &&
    support.distinctThemes >= CAMPAIGN_SUPPORT_THEME_MIN &&
    support.distinctDirections >= CAMPAIGN_SUPPORT_DIRECTION_MIN &&
    support.positivePowerPressure <=
      CAMPAIGN_RELEASE_POSITIVE_PRESSURE_MAX &&
    support.tierZeroProducts <= CAMPAIGN_RELEASE_TIER_ZERO_MAX;

  const publishedProfiles = [];
  for (
    let day = FIRST_BAN_DAY + BAN_INTERVAL;
    day <= LAST_DECISION_DAY;
    day += BAN_INTERVAL
  ) {
    const reviewed = state.community.some(
      (event) => event.day === day && isRestrictionDecisionType(event.type),
    );
    if (reviewed) {
      publishedProfiles.push(getPublishedRestrictionPolicyProfile(state, day));
    }
  }
  const policy = {
    reviewed: publishedProfiles.length,
    balancedReviews: publishedProfiles.filter(
      (profile) => profile.quality === "balanced",
    ).length,
    staleFullyReleased: publishedProfiles.reduce(
      (total, profile) => total + profile.staleFullyReleased,
      0,
    ),
    passed: false,
  };
  policy.passed =
    policy.balancedReviews >= CAMPAIGN_BALANCED_REVIEW_MIN &&
    policy.staleFullyReleased >= CAMPAIGN_STALE_RELEASE_MIN;

  const playerActionRecords = state.operations.records.filter(
    (record) => record.startedDay >= PLAYER_START_DAY,
  );
  const qualifyingActionRecords = playerActionRecords.filter((record) =>
    isQualifyingBusinessOutcome(record.outcome)
  );
  const strategicAttempts = playerActionRecords.filter(
    (record) =>
      isStrategicBusinessAction(record.type) &&
      (record.outcome === "success" || record.outcome === "backlash"),
  );
  const strategicSuccesses = strategicAttempts.filter(
    (record) => record.outcome === "success",
  ).length;
  const distinctTypes = new Set(
    qualifyingActionRecords.map((record) => record.type),
  ).size;
  const distinctTones = new Set(
    qualifyingActionRecords.map(
      (record) => BUSINESS_ACTION_BY_TYPE[record.type].tone,
    ),
  ).size;
  const usedRecoveryPath =
    strategicSuccesses === 0 &&
    strategicAttempts.length > 0 &&
    qualifyingActionRecords.length >= CAMPAIGN_BUSINESS_RECOVERY_ACTION_MIN &&
    distinctTypes >= CAMPAIGN_BUSINESS_RECOVERY_TYPE_MIN;
  const business = {
    qualifyingActions: qualifyingActionRecords.length,
    distinctTypes,
    distinctTones,
    strategicAttempts: strategicAttempts.length,
    strategicSuccesses,
    usedRecoveryPath,
    passed: false,
  };
  business.passed =
    business.qualifyingActions >= CAMPAIGN_BUSINESS_ACTION_MIN &&
    business.distinctTypes >= CAMPAIGN_BUSINESS_TYPE_MIN &&
    business.distinctTones >= CAMPAIGN_BUSINESS_TONE_MIN &&
    (business.strategicSuccesses > 0 || business.usedRecoveryPath);

  const resolvedEvents = state.operations.eventRecords.filter(
    (record) =>
      record.appearedDay >= PLAYER_START_DAY && record.outcome !== "pending",
  );
  const successes = resolvedEvents.filter(
    (record) => record.outcome === "success",
  ).length;
  const successRate = resolvedEvents.length > 0
    ? successes / resolvedEvents.length
    : 0;
  const requiredSuccesses = Math.ceil(
    resolvedEvents.length * CAMPAIGN_EVENT_SUCCESS_RATE_MIN,
  );
  const usedTrustRecoveryPath =
    successes < requiredSuccesses &&
    successRate + 1e-9 >= CAMPAIGN_EVENT_RECOVERY_RATE_MIN &&
    state.purchaseTrust >= CAMPAIGN_EVENT_RECOVERY_TRUST_MIN;
  const events = {
    resolved: resolvedEvents.length,
    successes,
    successRate,
    requiredSuccesses,
    usedTrustRecoveryPath,
    passed: false,
  };
  events.passed =
    events.resolved >= CAMPAIGN_EVENT_RESOLUTION_MIN &&
    (events.successes >= events.requiredSuccesses ||
      events.usedTrustRecoveryPath);

  const pillars = { support, policy, business, events };
  const passedPillars = Object.values(pillars).filter(
    (pillar) => pillar.passed,
  ).length;
  return {
    complete: passedPillars === Object.keys(pillars).length,
    passedPillars,
    pillars,
  };
}

export function getCampaignCashBand(cash: number): CampaignCashBand {
  const score = Math.round(cash * 10) / 10;
  if (score < CAMPAIGN_CASH_TIGHT_MIN) return "crisis";
  if (score < CAMPAIGN_CASH_RESERVE_MIN) return "tight";
  return "reserve";
}

export function getCampaignEnvironmentBand(
  environmentHealth: number,
): CampaignEnvironmentBand {
  const score = Math.round(environmentHealth * 10) / 10;
  if (score < CAMPAIGN_ENVIRONMENT_CAUTION_MIN) return "danger";
  if (score < CAMPAIGN_ENVIRONMENT_STABLE_MIN) return "caution";
  return "stable";
}

/**
 * A pleasant board is not genuinely stable when repeated policy shocks have
 * destroyed purchase trust. Trust below 50 applies a bounded penalty while a
 * normally trusted market keeps the existing environment-health score intact.
 */
export function getCampaignEnvironmentStability(state: GameState): number {
  const health = getBusinessEnvironmentHealth(state);
  const trustPenalty = Math.max(0, 50 - state.purchaseTrust) * 0.8;
  return Math.round(Math.max(0, Math.min(100, health - trustPenalty)) * 10) / 10;
}

export function evaluateCampaignEnding(
  state: GameState,
): CampaignEndingEvaluation {
  const cash = Math.round(state.finance.cash * 10) / 10;
  const environmentHealth = getCampaignEnvironmentStability(state);
  const cashBand = getCampaignCashBand(cash);
  const environmentBand = getCampaignEnvironmentBand(environmentHealth);
  const stewardship = getCampaignStewardshipEvaluation(state);
  const stableFoundation = cashBand === "reserve" && environmentBand === "stable";
  const qualifiedForBestEnding = stableFoundation && stewardship.complete;
  const copy = stableFoundation && !qualifiedForBestEnding
    ? INCOMPLETE_STEWARDSHIP_COPY
    : ENDING_COPY[cashBand][environmentBand];

  return {
    scores: { cash, environmentHealth },
    bands: { cash: cashBand, environment: environmentBand },
    stewardship,
    qualifiedForBestEnding,
    title: copy.title,
    body: copy.body,
    totalUsers: state.users.tier + state.users.casual + state.users.collector,
  };
}
