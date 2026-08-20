import { getBusinessEnvironmentHealth } from "./business-actions.ts";
import { PLAYER_START_DAY } from "./campaign.ts";
import type { GameState } from "./types.ts";

/** Monetary values are in eok won (KRW 100,000,000). */
export type CampaignCashBand = "crisis" | "tight" | "reserve";

export type CampaignEnvironmentBand = "danger" | "caution" | "stable";

export type CampaignTrustBand = "low" | "guarded" | "trusted";

export type CampaignUserBand = "contracted" | "steady" | "grown";

export const CAMPAIGN_CASH_TIGHT_MIN = 5;
export const CAMPAIGN_CASH_RESERVE_MIN = 14;
export const CAMPAIGN_ENVIRONMENT_CAUTION_MIN = 50;
export const CAMPAIGN_ENVIRONMENT_STABLE_MIN = 65;
export const CAMPAIGN_TRUST_GUARDED_MIN = 65;
export const CAMPAIGN_TRUST_TRUSTED_MIN = 80;
export const CAMPAIGN_USER_STEADY_MIN = 0.9;
export const CAMPAIGN_USER_GROWN_MIN = 1.1;

export type CampaignEndingEvaluation = {
  scores: {
    cash: number;
    environmentHealth: number;
    purchaseTrust: number;
    /** Final active users divided by active users at the DAY 46 handover. */
    userRatio: number;
    /** Final active users minus the DAY 46 handover baseline. */
    userDelta: number;
  };
  bands: {
    cash: CampaignCashBand;
    environment: CampaignEnvironmentBand;
    trust: CampaignTrustBand;
    users: CampaignUserBand;
  };
  /** DAY 46 active users used as the audience-growth baseline. */
  handoverUsers: number;
  totalUsers: number;
  /** Derived only from the four final result axes, never from action counts. */
  qualifiedForBestEnding: boolean;
  title: string;
  body: string;
};

export type CampaignEndingHint = {
  id: "cash" | "environment" | "trust" | "users";
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
  contracted:
    "활성 유저는 인수 시점보다 줄어 안정적인 표면 뒤에 이탈이 남았다.",
  steady:
    "활성 유저는 인수 시점의 규모를 지켜 리그의 기반이 유지됐다.",
  grown:
    "활성 유저는 인수 시점보다 늘어 성장이 실제 저변 확대로 이어졌다.",
};

const STABLE_FOUNDATION_TITLE = {
  low: {
    contracted: "빈 관중석의 안정",
    steady: "안정된 판, 무너진 신뢰",
    grown: "성장에 남은 불신",
  },
  guarded: {
    contracted: "조용해진 안정권",
    steady: "회복을 기다리는 리그",
    grown: "성장과 남은 경계",
  },
  trusted: {
    contracted: "좋은 판, 줄어든 관중",
    steady: "지속 가능한 리그",
    grown: "함께 커진 리그",
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
  return "reserve";
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
  if (score < CAMPAIGN_USER_STEADY_MIN) return "contracted";
  if (score < CAMPAIGN_USER_GROWN_MIN) return "steady";
  return "grown";
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

function getResultCopy(
  cash: CampaignCashBand,
  environment: CampaignEnvironmentBand,
  trust: CampaignTrustBand,
  users: CampaignUserBand,
): EndingCopy {
  const base = ENDING_COPY[cash][environment];
  const stableFoundation = cash === "reserve" && environment === "stable";
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
  const qualifiedForBestEnding =
    cashBand === "reserve" &&
    environmentBand === "stable" &&
    trustBand === "trusted" &&
    userBand !== "contracted";
  const copy = getResultCopy(cashBand, environmentBand, trustBand, userBand);

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
    qualifiedForBestEnding,
    title: copy.title,
    body: copy.body,
  };
}

/** Final review directions come only from the four scored outcomes. */
export function getCampaignEndingHints(
  ending: CampaignEndingEvaluation,
): CampaignEndingHint[] {
  if (ending.qualifiedForBestEnding) return [];

  const hints: CampaignEndingHint[] = [];
  if (ending.bands.cash !== "reserve") {
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
  if (ending.bands.users === "contracted") {
    hints.push({
      id: "users",
      title: "남은 유저 기반",
      body: "활성 유저가 DAY 46 인수 시점보다 줄어 리그의 실질적인 저변이 좁아졌습니다.",
    });
  }
  return hints;
}
