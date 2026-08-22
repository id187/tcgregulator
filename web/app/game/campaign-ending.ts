import { getBusinessEnvironmentHealth } from "./business-actions.ts";
import { PLAYER_START_DAY } from "./campaign.ts";
import type { GameState } from "./types.ts";

/** Monetary values are in eok won (KRW 100,000,000). */
export type CampaignCashBand = "crisis" | "tight" | "reserve" | "prosperous";

export type CampaignEnvironmentBand = "danger" | "caution" | "stable";

export type CampaignTrustBand = "low" | "guarded" | "trusted";

export type CampaignUserBand =
  | "collapsed"
  | "contracted"
  | "steady"
  | "grown"
  | "breakout";

export const CAMPAIGN_CASH_TIGHT_MIN = 3;
export const CAMPAIGN_CASH_RESERVE_MIN = 10;
export const CAMPAIGN_CASH_PROSPEROUS_MIN = 50;
export const CAMPAIGN_ENVIRONMENT_CAUTION_MIN = 50;
export const CAMPAIGN_ENVIRONMENT_STABLE_MIN = 65;
export const CAMPAIGN_TRUST_GUARDED_MIN = 65;
export const CAMPAIGN_TRUST_TRUSTED_MIN = 80;
export const CAMPAIGN_USER_CONTRACTED_MIN = 0.5;
export const CAMPAIGN_USER_STEADY_MIN = 0.85;
export const CAMPAIGN_USER_GROWN_MIN = 1.25;
export const CAMPAIGN_USER_BREAKOUT_MIN = 8.5;

export type CampaignEndingEvaluation = {
  scores: {
    cash: number;
    environmentHealth: number;
    purchaseTrust: number;
    /** Final active users divided by active users at the DAY 7 handover. */
    userRatio: number;
    /** Final active users minus the DAY 7 handover baseline. */
    userDelta: number;
  };
  bands: {
    cash: CampaignCashBand;
    environment: CampaignEnvironmentBand;
    trust: CampaignTrustBand;
    users: CampaignUserBand;
  };
  /** DAY 7 active users used as the audience-growth baseline. */
  handoverUsers: number;
  totalUsers: number;
  stewardship: {
    observedDays: number;
    averageEnvironmentHealth: number;
    averagePurchaseTrust: number;
    healthyDayRate: number;
    severeTierZeroDays: number;
    longestUnhealthyStreak: number;
    averageEffectiveThemeCount: number;
    totalRestrictionChanges: number;
    largestRestrictionList: number;
    emergencyRestrictionMagnitude: number;
    averageReleasePowerAdjustment: number;
    reprintedCards: number;
    historicallySustainable: boolean;
  };
  /** Final result axes and the full mandate record must both qualify. */
  qualifiedForBestEnding: boolean;
  title: string;
  body: string;
};

export type CampaignEndingHint = {
  id: "cash" | "environment" | "trust" | "users" | "history";
  title: string;
  body: string;
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
      title: "버틸 기반, 남은 불안",
      body: "운영자금은 충분하고 환경은 경계 구간이다. 사업은 버틸 수 있지만 판에는 정비가 더 필요하다.",
    },
    stable: {
      title: "지속 가능한 리그",
      body: "운영자금과 환경 건강도가 모두 안정권이다. 다음 시즌을 이어갈 기반을 갖춘 결산이다.",
    },
  },
  prosperous: {
    danger: {
      title: "거대한 매출, 망가진 게임",
      body: "사업 규모는 크게 불어났지만 환경은 위험 수위다. 흥행의 숫자와 실제 플레이 경험이 완전히 갈라졌다.",
    },
    caution: {
      title: "대성공 직전의 균열",
      body: "회사는 강한 현금 창출력을 갖췄지만 환경에는 불안이 남았다. 다음 운영이 흥행의 지속 여부를 결정한다.",
    },
    stable: {
      title: "시장을 넓힌 TCG",
      body: "충분한 운영자금과 건강한 환경이 함께 남았다. 이 TCG는 생존을 넘어 시장 자체를 확장했다.",
    },
  },
} as const satisfies Record<
  CampaignCashBand,
  Record<CampaignEnvironmentBand, EndingCopy>
>;

const TRUST_RESULT_COPY: Record<CampaignTrustBand, string> = {
  low:
    "구매 신뢰는 낮은 구간에 남아 다음 상품의 가치까지 의심받고 있다.",
  guarded:
    "구매 신뢰는 경계권으로, 판의 성과가 다음 구매에 대한 확신으로 이어지지 못했다.",
  trusted:
    "구매 신뢰는 견고해 다음 제품의 가치도 받아들여질 수 있다.",
};

const USER_RESULT_COPY: Record<CampaignUserBand, string> = {
  collapsed:
    "활성 유저 기반은 인수 당시의 절반 아래로 붕괴해 공식 운영의 존속 자체가 위태롭다.",
  contracted:
    "활성 유저는 인수 시점보다 줄어 안정적인 표면 뒤에 이탈이 남았다.",
  steady:
    "활성 유저는 인수 시점의 규모를 지켜 리그의 기반이 유지됐다.",
  grown:
    "활성 유저는 인수 시점보다 뚜렷하게 늘어 성장이 실제 저변 확대로 이어졌다.",
  breakout:
    "활성 유저는 인수 당시의 여덟 배를 훌쩍 넘어 이 TCG가 전국적인 흥행작으로 자리 잡았다.",
};

const STABLE_FOUNDATION_TITLE = {
  low: {
    collapsed: "신뢰도 관중도 사라진 판",
    contracted: "빈 관중석의 안정",
    steady: "안정된 판, 무너진 신뢰",
    grown: "성장에 남은 불신",
    breakout: "폭발한 흥행, 무너진 믿음",
  },
  guarded: {
    collapsed: "회복되지 못한 관중석",
    contracted: "조용해진 안정권",
    steady: "회복을 기다리는 리그",
    grown: "성장과 남은 경계",
    breakout: "대흥행과 남은 의심",
  },
  trusted: {
    collapsed: "좋은 판, 사라진 시장",
    contracted: "좋은 판, 줄어든 관중",
    steady: "지속 가능한 리그",
    grown: "함께 커진 리그",
    breakout: "시대를 만든 TCG",
  },
} as const satisfies Record<
  CampaignTrustBand,
  Record<CampaignUserBand, string>
>;

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function getCampaignCashBand(cash: number): CampaignCashBand {
  const score = round(cash, 1);
  if (score < CAMPAIGN_CASH_TIGHT_MIN) return "crisis";
  if (score < CAMPAIGN_CASH_RESERVE_MIN) return "tight";
  if (score < CAMPAIGN_CASH_PROSPEROUS_MIN) return "reserve";
  return "prosperous";
}

export function getCampaignEnvironmentBand(
  environmentHealth: number,
): CampaignEnvironmentBand {
  const score = round(environmentHealth, 1);
  if (score < CAMPAIGN_ENVIRONMENT_CAUTION_MIN) return "danger";
  if (score < CAMPAIGN_ENVIRONMENT_STABLE_MIN) return "caution";
  return "stable";
}

export function getCampaignTrustBand(
  purchaseTrust: number,
): CampaignTrustBand {
  const score = round(purchaseTrust, 1);
  if (score < CAMPAIGN_TRUST_GUARDED_MIN) return "low";
  if (score < CAMPAIGN_TRUST_TRUSTED_MIN) return "guarded";
  return "trusted";
}

export function getCampaignUserBand(userRatio: number): CampaignUserBand {
  const score = round(userRatio, 4);
  if (score < CAMPAIGN_USER_CONTRACTED_MIN) return "collapsed";
  if (score < CAMPAIGN_USER_STEADY_MIN) return "contracted";
  if (score < CAMPAIGN_USER_GROWN_MIN) return "steady";
  if (score < CAMPAIGN_USER_BREAKOUT_MIN) return "grown";
  return "breakout";
}

/** Environment quality is scored independently from the purchase-trust axis. */
export function getCampaignEnvironmentStability(state: GameState): number {
  return round(
    Math.max(0, Math.min(100, getBusinessEnvironmentHealth(state))),
    1,
  );
}

function getTotalUsers(state: GameState): number {
  return state.users.tier + state.users.casual + state.users.collector;
}

function getHandoverUsers(state: GameState, fallback: number): number {
  return state.history.find((entry) => entry.day === PLAYER_START_DAY)?.totalUsers ??
    state.history[0]?.totalUsers ??
    fallback;
}

function getStewardshipRecord(state: GameState): CampaignEndingEvaluation["stewardship"] {
  const rows = state.history.filter((entry) => entry.day >= PLAYER_START_DAY);
  const observed = rows.length > 0 ? rows : state.history;
  const finalEnvironment = getCampaignEnvironmentStability(state);
  const healthValues = observed.map((entry) =>
    typeof entry.environmentHealth === "number"
      ? entry.environmentHealth
      : finalEnvironment
  );
  const trustValues = observed.map((entry) =>
    typeof entry.purchaseTrust === "number"
      ? entry.purchaseTrust
      : state.purchaseTrust
  );
  const averageEnvironmentHealth = round(
    healthValues.length > 0
      ? healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length
      : finalEnvironment,
    1,
  );
  const averagePurchaseTrust = round(
    trustValues.length > 0
      ? trustValues.reduce((sum, value) => sum + value, 0) / trustValues.length
      : state.purchaseTrust,
    1,
  );
  const healthyDays = healthValues.filter(
    (value) => value >= CAMPAIGN_ENVIRONMENT_STABLE_MIN,
  ).length;
  let longestUnhealthyStreak = 0;
  let currentUnhealthyStreak = 0;
  for (const value of healthValues) {
    if (value < CAMPAIGN_ENVIRONMENT_CAUTION_MIN) {
      currentUnhealthyStreak += 1;
      longestUnhealthyStreak = Math.max(
        longestUnhealthyStreak,
        currentUnhealthyStreak,
      );
    } else {
      currentUnhealthyStreak = 0;
    }
  }
  const severeTierZeroDays = observed.filter((entry) =>
    Math.max(0, ...Object.values(entry.shares)) >= 0.4
  ).length;
  const diversityValues = observed.map((entry) => {
    const hhi = Object.values(entry.shares).reduce(
      (sum, share) => sum + share ** 2,
      0,
    );
    return hhi > 0 ? 1 / hhi : 0;
  });
  const restrictionChanges = state.community.filter(
    (event) =>
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction") &&
      event.previousValue !== undefined &&
      event.value !== undefined &&
      event.previousValue !== event.value,
  );
  const restrictionCountByDay = new Map<number, number>();
  for (const event of restrictionChanges) {
    restrictionCountByDay.set(
      event.day,
      (restrictionCountByDay.get(event.day) ?? 0) + 1,
    );
  }
  const emergencyRestrictionMagnitude = restrictionChanges
    .filter((event) => event.day === 0)
    .reduce(
      (sum, event) =>
        sum + Math.abs((event.previousValue ?? 0) - (event.value ?? 0)),
      0,
    );
  const authoredProducts = state.releaseHistory
    .filter((batch) => batch.releaseKind !== "baseline")
    .flatMap((batch) => batch.products);
  const adjustableProducts = authoredProducts.filter(
    (product) => product.kind !== "reprint",
  );
  const averageReleasePowerAdjustment = round(
    adjustableProducts.length > 0
      ? adjustableProducts.reduce(
          (sum, product) => sum + product.powerAdjustment,
          0,
        ) / adjustableProducts.length
      : 0,
    2,
  );
  const observedDays = observed.length;
  // Short fixtures and legacy handovers do not pretend to contain a full
  // mandate. On a real campaign, chronic bad periods can disqualify an
  // otherwise flattering final-day snapshot.
  const historicallySustainable = observedDays < 30 || (
    averageEnvironmentHealth >= 57 &&
    averagePurchaseTrust >= 65 &&
    severeTierZeroDays <= Math.max(12, Math.floor(observedDays * 0.1)) &&
    longestUnhealthyStreak <= 30
  );
  return {
    observedDays,
    averageEnvironmentHealth,
    averagePurchaseTrust,
    healthyDayRate: round(
      observedDays > 0 ? healthyDays / observedDays : 0,
      4,
    ),
    severeTierZeroDays,
    longestUnhealthyStreak,
    averageEffectiveThemeCount: round(
      diversityValues.length > 0
        ? diversityValues.reduce((sum, value) => sum + value, 0) /
          diversityValues.length
        : 0,
      2,
    ),
    totalRestrictionChanges: restrictionChanges.length,
    largestRestrictionList: Math.max(0, ...restrictionCountByDay.values()),
    emergencyRestrictionMagnitude,
    averageReleasePowerAdjustment,
    reprintedCards: authoredProducts.filter((product) => product.kind === "reprint").length,
    historicallySustainable,
  };
}

function getResultCopy(
  cash: CampaignCashBand,
  environment: CampaignEnvironmentBand,
  trust: CampaignTrustBand,
  users: CampaignUserBand,
): EndingCopy {
  const base = ENDING_COPY[cash][environment];
  const stableFoundation =
    (cash === "reserve" || cash === "prosperous") && environment === "stable";
  return {
    title: stableFoundation
      ? STABLE_FOUNDATION_TITLE[trust][users]
      : base.title,
    body: `${base.body} ${TRUST_RESULT_COPY[trust]} ${USER_RESULT_COPY[users]}`,
  };
}

export function evaluateCampaignEnding(
  state: GameState,
): CampaignEndingEvaluation {
  const cash = round(state.finance.cash, 1);
  const environmentHealth = getCampaignEnvironmentStability(state);
  const purchaseTrust = round(
    Math.max(0, Math.min(100, state.purchaseTrust)),
    1,
  );
  const totalUsers = getTotalUsers(state);
  const handoverUsers = getHandoverUsers(state, totalUsers);
  const userRatio = round(
    handoverUsers > 0 ? totalUsers / handoverUsers : 1,
    4,
  );
  const userDelta = round(totalUsers - handoverUsers, 2);
  const cashBand = getCampaignCashBand(cash);
  const environmentBand = getCampaignEnvironmentBand(environmentHealth);
  const trustBand = getCampaignTrustBand(purchaseTrust);
  const userBand = getCampaignUserBand(userRatio);
  const stewardship = getStewardshipRecord(state);
  const finalAxesQualified =
    (cashBand === "reserve" || cashBand === "prosperous") &&
    environmentBand === "stable" &&
    trustBand === "trusted" &&
    (userBand === "grown" || userBand === "breakout");
  const qualifiedForBestEnding =
    finalAxesQualified && stewardship.historicallySustainable;
  const copy = getResultCopy(cashBand, environmentBand, trustBand, userBand);
  const historyCopy = stewardship.historicallySustainable
    ? `임기 평균 환경 ${stewardship.averageEnvironmentHealth}, 평균 구매 신뢰 ${stewardship.averagePurchaseTrust}로 누적 운영도 지속 가능 판정을 받았다.`
    : `다만 임기 평균 환경 ${stewardship.averageEnvironmentHealth}, 심각한 Tier 0 ${stewardship.severeTierZeroDays}일, 최장 위험 연속 ${stewardship.longestUnhealthyStreak}일이 남아 마지막 날의 회복만으로 누적 기록을 지우지는 못했다.`;

  return {
    scores: {
      cash,
      environmentHealth,
      purchaseTrust,
      userRatio,
      userDelta,
    },
    bands: {
      cash: cashBand,
      environment: environmentBand,
      trust: trustBand,
      users: userBand,
    },
    handoverUsers,
    totalUsers,
    stewardship,
    qualifiedForBestEnding,
    title: finalAxesQualified && !stewardship.historicallySustainable
      ? "마지막 날만의 안정"
      : copy.title,
    body: `${copy.body} ${historyCopy}`,
  };
}

/** Final review directions come only from the four scored outcomes. */
export function getCampaignEndingHints(
  ending: CampaignEndingEvaluation,
): CampaignEndingHint[] {
  if (ending.qualifiedForBestEnding) return [];

  const hints: CampaignEndingHint[] = [];
  if (ending.bands.cash !== "reserve" && ending.bands.cash !== "prosperous") {
    hints.push({
      id: "cash",
      title: "회사의 완충력",
      body: ending.bands.cash === "crisis"
        ? "결산 자금이 위기선 아래라 다음 시즌의 선택지가 크게 줄었습니다."
        : "운영은 이어갈 수 있지만 다음 고비를 버틸 자금 여유는 적습니다.",
    });
  }
  if (ending.bands.environment !== "stable") {
    hints.push({
      id: "environment",
      title: "판의 체력",
      body: ending.bands.environment === "danger"
        ? "상위권 압박과 누적 피로가 위험 수위로 남았습니다."
        : "환경은 무너지지 않았지만 안정권에 자리 잡지는 못했습니다.",
    });
  }
  if (ending.bands.trust !== "trusted") {
    hints.push({
      id: "trust",
      title: "소유자의 확신",
      body: ending.bands.trust === "low"
        ? "누적된 제품 가치 충격으로 다음 구매를 믿지 못하는 상태가 남았습니다."
        : "구매 신뢰가 경계권이라 좋은 환경과 매출도 장기 확신으로 연결되지 못했습니다.",
    });
  }
  if (
    ending.bands.users === "collapsed" ||
    ending.bands.users === "contracted" ||
    ending.bands.users === "steady"
  ) {
    hints.push({
      id: "users",
      title: ending.bands.users === "collapsed"
        ? "붕괴한 유저 기반"
        : "성장하지 못한 저변",
      body: ending.bands.users === "collapsed"
        ? `활성 유저가 DAY ${PLAYER_START_DAY} 인수 시점의 절반 아래로 줄어 공식 운영 존속이 위태롭습니다.`
        : `활성 유저가 DAY ${PLAYER_START_DAY} 인수 시점에서 뚜렷하게 성장하지 못했습니다.`,
    });
  }
  if (!ending.stewardship.historicallySustainable) {
    hints.push({
      id: "history",
      title: "누적 운영 기록",
      body: `마지막 수치와 별개로 평균 환경 ${ending.stewardship.averageEnvironmentHealth}, 심각한 Tier 0 ${ending.stewardship.severeTierZeroDays}일, 최장 위험 연속 ${ending.stewardship.longestUnhealthyStreak}일이 임기 기록에 남았습니다.`,
    });
  }
  return hints;
}
