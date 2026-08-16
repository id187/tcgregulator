import { getBusinessEnvironmentHealth } from "./business-actions.ts";
import type { GameState } from "./types.ts";

/** Monetary values are in eok won (KRW 100,000,000). */
export type CampaignCashBand = "crisis" | "tight" | "reserve";

export type CampaignEnvironmentBand = "danger" | "caution" | "stable";

export const CAMPAIGN_CASH_TIGHT_MIN = 5;
export const CAMPAIGN_CASH_RESERVE_MIN = 10;
export const CAMPAIGN_ENVIRONMENT_CAUTION_MIN = 50;
export const CAMPAIGN_ENVIRONMENT_STABLE_MIN = 70;

export type CampaignEndingEvaluation = {
  scores: {
    cash: number;
    environmentHealth: number;
  };
  bands: {
    cash: CampaignCashBand;
    environment: CampaignEnvironmentBand;
  };
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
  const copy = ENDING_COPY[cashBand][environmentBand];

  return {
    scores: { cash, environmentHealth },
    bands: { cash: cashBand, environment: environmentBand },
    title: copy.title,
    body: copy.body,
    totalUsers: state.users.tier + state.users.casual + state.users.collector,
  };
}
