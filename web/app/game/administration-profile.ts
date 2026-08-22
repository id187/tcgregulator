import { PLAYER_START_DAY } from "./campaign.ts";
import type { GameState } from "./types.ts";

export type AdministrationProfileId =
  | "adaptive-balance"
  | "competitive-order"
  | "growth-drive"
  | "access-first"
  | "ownership-preservation"
  | "low-intervention";

export type AdministrationProfile = Readonly<{
  id: AdministrationProfileId;
  label: string;
  endingSummary: string;
  marketReading: string;
  confidence: "forming" | "established";
  evidence: Readonly<{
    decisionCount: number;
    restrictionReviews: number;
    restrictionMagnitude: number;
    noChangeReviews: number;
    averageReleasePower: number;
    reprintedCards: number;
  }>;
}>;

type ProfileCopy = Readonly<{
  label: string;
  endingSummary: string;
  marketReading: string;
}>;

const PROFILE_COPY: Readonly<Record<AdministrationProfileId, ProfileCopy>> = {
  "adaptive-balance": {
    label: "균형 조정형 행정부",
    endingSummary:
      "특정 목표 하나에 고정되기보다 환경·성장·접근성 사이의 압력에 맞춰 개입 수위를 바꿨습니다.",
    marketReading:
      "시장 해석은 ‘지표 대응형’에 가깝습니다.",
  },
  "competitive-order": {
    label: "경쟁 질서 우선 행정부",
    endingSummary:
      "흥행 손실을 감수하더라도 상위권 집중과 반복되는 위협을 먼저 끊는 선택을 누적했습니다.",
    marketReading:
      "시장 해석은 ‘경쟁 질서 우선’에 가깝습니다.",
  },
  "growth-drive": {
    label: "성장 드라이브 행정부",
    endingSummary:
      "강한 상품과 넓은 대중 도달을 통해 시장 규모를 빠르게 키우는 선택을 누적했습니다.",
    marketReading:
      "시장 해석은 ‘흥행 확대 우선’에 가깝습니다.",
  },
  "access-first": {
    label: "접근성 우선 행정부",
    endingSummary:
      "재판과 보급 확대를 통해 새 이용자가 실제 카드에 접근할 수 있는 시장을 만드는 데 무게를 뒀습니다.",
    marketReading:
      "시장 해석은 ‘실사용 접근성 우선’에 가깝습니다.",
  },
  "ownership-preservation": {
    label: "보유가치 방어 행정부",
    endingSummary:
      "공급 충격을 억제하고 기존 구매자가 가진 카드의 희소성과 신뢰를 지키는 선택을 누적했습니다.",
    marketReading:
      "시장 해석은 ‘보유가치 방어’에 가깝습니다.",
  },
  "low-intervention": {
    label: "저개입 안정 행정부",
    endingSummary:
      "급격한 금제와 출력 상승을 피하고 시장과 메타가 스스로 조정될 시간을 주는 선택을 누적했습니다.",
    marketReading:
      "시장 해석은 ‘저개입 관찰’에 가깝습니다.",
  },
};

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Derives the administration's identity from committed player decisions only.
 * Outcomes such as final cash, trust, or ending tier never decide the label.
 */
export function getAdministrationProfile(
  state: GameState,
  throughDay = state.day,
): AdministrationProfile {
  const restrictionEvents = state.community.filter(
    (event) =>
      event.day <= throughDay &&
      event.day >= 0 &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction" ||
        event.type === "restriction-no-change"),
  );
  const restrictionDays = new Set(restrictionEvents.map((event) => event.day));
  const changedRestrictions = restrictionEvents.filter(
    (event) =>
      Number.isInteger(event.previousValue) &&
      Number.isInteger(event.value) &&
      event.previousValue !== event.value,
  );
  const restrictionMagnitude = changedRestrictions.reduce(
    (sum, event) =>
      sum + Math.max(0, (event.previousValue ?? 0) - (event.value ?? 0)),
    0,
  );
  const restrictionRelief = changedRestrictions.reduce(
    (sum, event) =>
      sum + Math.max(0, (event.value ?? 0) - (event.previousValue ?? 0)),
    0,
  );
  const changedRestrictionDays = new Set(
    changedRestrictions.map((event) => event.day),
  );
  const noChangeReviews = [...restrictionDays].filter(
    (day) => !changedRestrictionDays.has(day),
  ).length;

  const authoredBatches = state.releaseHistory.filter(
    (batch) =>
      batch.releaseKind !== "baseline" &&
      batch.day >= PLAYER_START_DAY &&
      batch.day <= throughDay,
  );
  const products = authoredBatches.flatMap((batch) => batch.products);
  const poweredProducts = products.filter((product) => product.kind !== "reprint");
  const averageReleasePower = poweredProducts.length > 0
    ? poweredProducts.reduce(
        (sum, product) => sum + product.powerAdjustment,
        0,
      ) / poweredProducts.length
    : 0;
  const reprintedCards = products.filter(
    (product) => product.kind === "reprint",
  ).length;
  const supportProducts = products.filter(
    (product) => product.kind === "support",
  ).length;
  const decisionCount =
    restrictionDays.size + authoredBatches.length +
    state.operations.eventRecords.filter(
      (record) => record.appearedDay <= throughDay,
    ).length;

  const strategy = state.operations.strategy;
  const scores: Record<AdministrationProfileId, number> = {
    "adaptive-balance": 8 + Math.min(10, supportProducts * 1.5),
    "competitive-order":
      restrictionMagnitude * 4.5 - restrictionRelief * 0.5 -
      Math.max(0, averageReleasePower) * 5,
    "growth-drive":
      Math.max(0, averageReleasePower) * 11 +
      Math.max(0, strategy.audience) * 0.34 +
      Math.max(0, strategy.posture) * 0.18,
    "access-first":
      reprintedCards * 3.4 + Math.max(0, -strategy.product) * 0.38 +
      Math.max(0, -strategy.posture) * 0.08,
    "ownership-preservation":
      Math.max(0, strategy.product) * 0.4 +
      Math.max(0, -reprintedCards + authoredBatches.length * 0.35),
    "low-intervention":
      noChangeReviews * 3 + restrictionRelief * 1.5 +
      Math.max(0, -averageReleasePower) * 10 +
      Math.max(0, -strategy.posture) * 0.26,
  };

  const ranked = (Object.entries(scores) as Array<
    [AdministrationProfileId, number]
  >).sort(
    ([leftId, leftScore], [rightId, rightScore]) =>
      rightScore - leftScore || leftId.localeCompare(rightId),
  );
  const [leadingId, leadingScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const id = decisionCount < 2 || leadingScore - secondScore < 3
    ? "adaptive-balance"
    : leadingId;
  const copy = PROFILE_COPY[id];

  return {
    id,
    ...copy,
    confidence: decisionCount >= 6 ? "established" : "forming",
    evidence: {
      decisionCount,
      restrictionReviews: restrictionDays.size,
      restrictionMagnitude,
      noChangeReviews,
      averageReleasePower: round(averageReleasePower),
      reprintedCards,
    },
  };
}
