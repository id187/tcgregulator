import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  isScheduledReleaseDay,
  LAST_DECISION_DAY,
} from "./campaign.ts";
import type {
  BusinessEventChoice,
  BusinessEventOutcome,
  BusinessEventRecord,
  BusinessEventType,
  BusinessStrategy,
  UserState,
} from "./types.ts";

/** A guaranteed introductory dilemma, after the first product review. */
export const FIRST_BUSINESS_EVENT_DAY = 20;
/** Random recurring dilemmas begin on the original late-opening cadence. */
export const RECURRING_BUSINESS_EVENT_START_DAY = 52;
export const BUSINESS_EVENT_MIN_INTERVAL = 14;
export const BUSINESS_EVENT_MAX_INTERVAL = 22;
export const BUSINESS_STRATEGY_MIN = -100;
export const BUSINESS_STRATEGY_MAX = 100;

export const EMPTY_BUSINESS_STRATEGY: Readonly<BusinessStrategy> = {
  audience: 0,
  product: 0,
  posture: 0,
};

export const BUSINESS_STRATEGY_AXES = [
  "audience",
  "product",
  "posture",
] as const;

export type BusinessStrategyAxis = (typeof BUSINESS_STRATEGY_AXES)[number];

export const BUSINESS_STRATEGY_AXIS_LABELS = {
  audience: {
    negative: "코어 유저 중심",
    positive: "대중 확장 중심",
  },
  product: {
    negative: "접근성 중심",
    positive: "프리미엄·희소성 중심",
  },
  posture: {
    negative: "신중 운영",
    positive: "공격 운영",
  },
} as const;

export type BusinessEventResultImpact = {
  headline: string;
  body: string;
  /** One-time operating-cash change, in eok won. */
  cashDelta: number;
  /** One-time purchase-trust change. */
  trustDelta: number;
  /** One-time proportional changes; 0.02 means +2%. */
  userMultipliers: Readonly<Record<keyof UserState, number>>;
  /** Flat eok-won revenue added on each active day after the result. */
  revenueBonus: number;
  /** Includes resolvedDay as the first active day. */
  revenueDuration: number;
};

export type BusinessEventChoiceDefinition = {
  id: BusinessEventChoice;
  title: string;
  summary: string;
  /** Paid immediately when the choice is committed, in eok won. */
  cost: number;
  /** Stored probability of the backlash result. */
  risk: number;
  resolutionDelay: number;
  strategyDelta: Readonly<BusinessStrategy>;
  results: Readonly<{
    success: BusinessEventResultImpact;
    backlash: BusinessEventResultImpact;
  }>;
};

export type BusinessEventDefinition = {
  type: BusinessEventType;
  kicker: string;
  title: string;
  situation: string;
  choices: readonly [BusinessEventChoiceDefinition, BusinessEventChoiceDefinition];
};

export type BusinessStrategyModifiers = {
  userRates: Readonly<Record<keyof UserState, number>>;
  buyerRate: number;
  revenueMultiplier: number;
  trustPerDay: number;
};

const noUsers = { tier: 0, casual: 0, collector: 0 } as const;

export const BUSINESS_EVENTS = [
  {
    type: "starter-shortage",
    kicker: "SUPPLY ALERT",
    title: "입문 덱 품절 사태",
    situation: "광고 유입이 몰리며 입문 덱이 전국 매장에서 동시에 품절됐습니다. 생산 라인을 당겨 쓰거나 한정 번들로 남은 수요를 받을 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "긴급 추가 생산",
        summary: "비용을 들여 입문 덱을 넉넉히 공급하고 접근성을 지킵니다.",
        cost: 0.25,
        risk: 0.16,
        resolutionDelay: 5,
        strategyDelta: { audience: 6, product: -8, posture: 2 },
        results: {
          success: { headline: "입문 덱 공급 정상화", body: "추가 물량이 제때 도착해 신규 유저가 매장에 정착했습니다.", cashDelta: 0.08, trustDelta: 3, userMultipliers: { tier: 0.002, casual: 0.035, collector: 0.004 }, revenueBonus: 0.009, revenueDuration: 18 },
          backlash: { headline: "증산 물량 배분 차질", body: "물량은 늘었지만 인기 지역 배분이 늦어 품절 불만이 이어졌습니다.", cashDelta: -0.04, trustDelta: -2, userMultipliers: { tier: 0, casual: -0.012, collector: 0 }, revenueBonus: -0.003, revenueDuration: 10 },
        },
      },
      {
        id: "b",
        title: "한정 프리미엄 번들",
        summary: "추가 생산 없이 남은 물량을 고가 구성으로 재편합니다.",
        cost: 0,
        risk: 0.38,
        resolutionDelay: 4,
        strategyDelta: { audience: -5, product: 10, posture: 7 },
        results: {
          success: { headline: "한정 번들 조기 완판", body: "희소성에 반응한 수집층이 남은 물량을 빠르게 소화했습니다.", cashDelta: 0.22, trustDelta: -1, userMultipliers: { tier: 0, casual: -0.006, collector: 0.022 }, revenueBonus: 0.014, revenueDuration: 12 },
          backlash: { headline: "입문 상품 되팔이 논란", body: "첫 구매 상품을 프리미엄화했다는 비판이 확산됐습니다.", cashDelta: 0.03, trustDelta: -5, userMultipliers: { tier: -0.003, casual: -0.03, collector: -0.008 }, revenueBonus: -0.008, revenueDuration: 14 },
        },
      },
    ],
  },
  {
    type: "secondary-market-spike",
    kicker: "MARKET WATCH",
    title: "핵심 카드 시세 폭등",
    situation: "대회 필수 카드 한 장이 박스 가격을 넘어섰습니다. 즉시 재판해 접근성을 회복할지, 희소 가치를 유지할지 결정해야 합니다.",
    choices: [
      {
        id: "a",
        title: "긴급 재판 발표",
        summary: "시세를 낮추고 실제 플레이 수요를 우선합니다.",
        cost: 0.2,
        risk: 0.18,
        resolutionDelay: 7,
        strategyDelta: { audience: 4, product: -11, posture: 1 },
        results: {
          success: { headline: "재판으로 시세 안정", body: "필수 카드 공급이 풀리며 덱 구성 장벽이 빠르게 내려갔습니다.", cashDelta: 0.1, trustDelta: 4, userMultipliers: { tier: 0.018, casual: 0.01, collector: 0.004 }, revenueBonus: 0.008, revenueDuration: 21 },
          backlash: { headline: "재판 일정 지연", body: "발표만 앞서고 입고가 늦어 시세와 불만이 함께 올랐습니다.", cashDelta: -0.05, trustDelta: -3, userMultipliers: { tier: -0.012, casual: -0.004, collector: -0.006 }, revenueBonus: -0.004, revenueDuration: 12 },
        },
      },
      {
        id: "b",
        title: "희소 가치 유지",
        summary: "재판하지 않고 컬렉터 시장의 가격 신호를 존중합니다.",
        cost: 0,
        risk: 0.42,
        resolutionDelay: 5,
        strategyDelta: { audience: -7, product: 12, posture: 5 },
        results: {
          success: { headline: "고가 카드가 화제 견인", body: "상징적인 시세가 수집 열기를 자극해 프리미엄 상품이 팔렸습니다.", cashDelta: 0.18, trustDelta: -1, userMultipliers: { tier: -0.004, casual: 0, collector: 0.028 }, revenueBonus: 0.016, revenueDuration: 16 },
          backlash: { headline: "필수 카드 장벽 고착", body: "플레이 비용에 지친 경쟁 유저가 대거 이탈했습니다.", cashDelta: 0.02, trustDelta: -5, userMultipliers: { tier: -0.04, casual: -0.008, collector: -0.006 }, revenueBonus: -0.009, revenueDuration: 18 },
        },
      },
    ],
  },
  {
    type: "store-margin-dispute",
    kicker: "RETAIL NETWORK",
    title: "지역 매장 마진 분쟁",
    situation: "지역 카드숍 연합이 공급 마진 인상을 요구했습니다. 유통 몫을 늘리거나 공식 직영 판매를 강화할 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "지역 매장과 이익 공유",
        summary: "공급 마진을 높여 현장 대회와 입문 지원 기반을 지킵니다.",
        cost: 0.18,
        risk: 0.14,
        resolutionDelay: 6,
        strategyDelta: { audience: -3, product: -4, posture: -7 },
        results: {
          success: { headline: "지역 매장 연합 정상화", body: "매장들이 행사와 재고를 다시 확대하며 지역 생태계가 살아났습니다.", cashDelta: 0.04, trustDelta: 3, userMultipliers: { tier: 0.025, casual: 0.016, collector: 0.006 }, revenueBonus: 0.006, revenueDuration: 24 },
          backlash: { headline: "마진 인상만 남은 협상", body: "추가 지원이 현장 행사로 이어지지 않아 비용 부담만 커졌습니다.", cashDelta: -0.08, trustDelta: -1, userMultipliers: { tier: -0.004, casual: -0.003, collector: 0 }, revenueBonus: -0.004, revenueDuration: 16 },
        },
      },
      {
        id: "b",
        title: "공식 직영몰 확대",
        summary: "협상을 끝내고 직영 채널에서 가격과 재고를 직접 통제합니다.",
        cost: 0,
        risk: 0.34,
        resolutionDelay: 8,
        strategyDelta: { audience: 5, product: 3, posture: 10 },
        results: {
          success: { headline: "직영 판매 효율 개선", body: "재고 회전과 고객 데이터가 개선돼 판매 효율이 올랐습니다.", cashDelta: 0.2, trustDelta: 0, userMultipliers: { tier: -0.004, casual: 0.012, collector: 0.008 }, revenueBonus: 0.013, revenueDuration: 24 },
          backlash: { headline: "지역 매장 보이콧", body: "대회 거점이던 매장들이 입고를 줄이며 플레이 기반이 흔들렸습니다.", cashDelta: -0.03, trustDelta: -4, userMultipliers: { tier: -0.035, casual: -0.012, collector: -0.004 }, revenueBonus: -0.008, revenueDuration: 20 },
        },
      },
    ],
  },
  {
    type: "creator-controversy",
    kicker: "PUBLIC RELATIONS",
    title: "홍보 크리에이터 논란",
    situation: "대형 캠페인의 얼굴로 계약한 크리에이터가 과거 발언 논란에 휩싸였습니다. 계약을 끊거나 예정된 노출을 강행해야 합니다.",
    choices: [
      {
        id: "a",
        title: "즉시 계약 해지와 사과",
        summary: "이미 집행한 제작비를 포기하고 브랜드 안전을 택합니다.",
        cost: 0.12,
        risk: 0.12,
        resolutionDelay: 3,
        strategyDelta: { audience: -2, product: -2, posture: -9 },
        results: {
          success: { headline: "신속 대응 호평", body: "명확한 사과와 교체 발표가 책임 있는 대응으로 받아들여졌습니다.", cashDelta: 0, trustDelta: 5, userMultipliers: { tier: 0.003, casual: 0.008, collector: 0.004 }, revenueBonus: 0.002, revenueDuration: 10 },
          backlash: { headline: "해지 과정 진실 공방", body: "계약 당사자들의 폭로전으로 논란이 더 오래 이어졌습니다.", cashDelta: -0.05, trustDelta: -3, userMultipliers: { tier: -0.004, casual: -0.018, collector: -0.006 }, revenueBonus: -0.006, revenueDuration: 14 },
        },
      },
      {
        id: "b",
        title: "캠페인 예정대로 진행",
        summary: "여론이 잦아들 것으로 보고 대규모 노출 계획을 유지합니다.",
        cost: 0,
        risk: 0.48,
        resolutionDelay: 5,
        strategyDelta: { audience: 8, product: 1, posture: 11 },
        results: {
          success: { headline: "논란보다 캠페인 화제 우세", body: "새 영상의 반응이 좋아 논란이 빠르게 관심 밖으로 밀려났습니다.", cashDelta: 0.16, trustDelta: -1, userMultipliers: { tier: 0, casual: 0.03, collector: 0.009 }, revenueBonus: 0.014, revenueDuration: 14 },
          backlash: { headline: "불매 운동 확산", body: "강행 결정이 소비자를 무시한 대응으로 읽혀 불매가 시작됐습니다.", cashDelta: -0.08, trustDelta: -7, userMultipliers: { tier: -0.012, casual: -0.04, collector: -0.018 }, revenueBonus: -0.012, revenueDuration: 21 },
        },
      },
    ],
  },
  {
    type: "set-list-leak",
    kicker: "INFORMATION CONTROL",
    title: "신제품 리스트 유출",
    situation: "공개 전 카드 리스트가 해외 커뮤니티에 퍼졌습니다. 공식 정보를 앞당겨 공개하거나 유출 경로 차단에 집중할 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "전체 리스트 조기 공개",
        summary: "유저가 같은 정보를 보도록 공식 발표 일정을 즉시 당깁니다.",
        cost: 0.05,
        risk: 0.2,
        resolutionDelay: 3,
        strategyDelta: { audience: 5, product: -2, posture: 4 },
        results: {
          success: { headline: "조기 공개가 기대감 회복", body: "정돈된 공식 정보가 추측을 잠재우고 덱 연구 열기를 만들었습니다.", cashDelta: 0.05, trustDelta: 3, userMultipliers: { tier: 0.014, casual: 0.01, collector: 0.012 }, revenueBonus: 0.01, revenueDuration: 12 },
          backlash: { headline: "미완성 정보 공개 혼선", body: "급히 공개한 번역과 효과문이 바뀌며 예약 취소가 늘었습니다.", cashDelta: -0.03, trustDelta: -3, userMultipliers: { tier: -0.008, casual: -0.006, collector: -0.01 }, revenueBonus: -0.006, revenueDuration: 12 },
        },
      },
      {
        id: "b",
        title: "침묵하고 유출자 추적",
        summary: "기존 공개 일정을 지키며 법무·보안 대응만 진행합니다.",
        cost: 0,
        risk: 0.32,
        resolutionDelay: 6,
        strategyDelta: { audience: -5, product: 3, posture: -4 },
        results: {
          success: { headline: "추가 유출 차단", body: "유출 경로를 막고 본래 발표에서 남은 정보를 정상 공개했습니다.", cashDelta: 0.02, trustDelta: 1, userMultipliers: noUsers, revenueBonus: 0.004, revenueDuration: 10 },
          backlash: { headline: "가짜 리스트까지 범람", body: "공식 침묵 사이 허위 정보가 번져 신제품 기대가 불신으로 바뀌었습니다.", cashDelta: -0.02, trustDelta: -4, userMultipliers: { tier: -0.01, casual: -0.012, collector: -0.014 }, revenueBonus: -0.007, revenueDuration: 16 },
        },
      },
    ],
  },
  {
    type: "regional-prize-fund",
    kicker: "ESPORTS BUDGET",
    title: "대회 상금 예산 재편",
    situation: "한정된 상금 예산을 두고 지역 리그 확대와 초대형 결승전 중 하나를 선택해야 합니다.",
    choices: [
      {
        id: "a",
        title: "지역 리그에 분산 지원",
        summary: "작은 대회를 여러 곳에서 열어 경쟁 유저의 참여 기반을 넓힙니다.",
        cost: 0.22,
        risk: 0.15,
        resolutionDelay: 9,
        strategyDelta: { audience: -7, product: -3, posture: -5 },
        results: {
          success: { headline: "지역 리그 참가자 증가", body: "주간 대회가 안정적으로 자리 잡아 경쟁층이 두꺼워졌습니다.", cashDelta: 0.06, trustDelta: 3, userMultipliers: { tier: 0.04, casual: 0.012, collector: 0.003 }, revenueBonus: 0.005, revenueDuration: 25 },
          backlash: { headline: "지역별 운영 품질 편차", body: "일부 대회의 판정과 지급이 지연돼 공식 리그 신뢰가 흔들렸습니다.", cashDelta: -0.06, trustDelta: -3, userMultipliers: { tier: -0.018, casual: -0.004, collector: 0 }, revenueBonus: -0.003, revenueDuration: 14 },
        },
      },
      {
        id: "b",
        title: "한 번의 초대형 결승전",
        summary: "지역 예산을 모아 높은 화제성과 시청률을 노립니다.",
        cost: 0,
        risk: 0.4,
        resolutionDelay: 7,
        strategyDelta: { audience: 9, product: 3, posture: 10 },
        results: {
          success: { headline: "결승전 흥행 성공", body: "명장면과 높은 시청률이 일반 게임 커뮤니티까지 퍼졌습니다.", cashDelta: 0.2, trustDelta: 1, userMultipliers: { tier: 0.02, casual: 0.035, collector: 0.006 }, revenueBonus: 0.015, revenueDuration: 15 },
          backlash: { headline: "빈 좌석만 남은 결승", body: "지역 기반 없이 키운 무대가 흥행에 실패해 대회 축소론이 커졌습니다.", cashDelta: -0.04, trustDelta: -4, userMultipliers: { tier: -0.03, casual: -0.018, collector: -0.003 }, revenueBonus: -0.008, revenueDuration: 18 },
        },
      },
    ],
  },
  {
    type: "accessibility-reprint",
    kicker: "PRODUCT ACCESSIBILITY",
    title: "카드 가독성 개선 요구",
    situation: "색각 이상과 작은 효과문 때문에 실전에서 카드를 구분하기 어렵다는 지적이 커졌습니다.",
    choices: [
      {
        id: "a",
        title: "개선판 무상 교환",
        summary: "기존 구매자에게 새 인쇄 카드를 제공하고 디자인 규격을 바꿉니다.",
        cost: 0.3,
        risk: 0.13,
        resolutionDelay: 10,
        strategyDelta: { audience: 7, product: -7, posture: -8 },
        results: {
          success: { headline: "접근성 개선판 호평", body: "읽기 쉬운 카드와 무상 교환 정책이 업계 모범 사례로 평가받았습니다.", cashDelta: 0.04, trustDelta: 6, userMultipliers: { tier: 0.014, casual: 0.025, collector: 0.009 }, revenueBonus: 0.006, revenueDuration: 24 },
          backlash: { headline: "교환 물량 접수 마비", body: "신청 시스템과 물량이 부족해 좋은 취지가 더 큰 불편을 만들었습니다.", cashDelta: -0.08, trustDelta: -2, userMultipliers: { tier: -0.004, casual: -0.008, collector: -0.005 }, revenueBonus: -0.003, revenueDuration: 14 },
        },
      },
      {
        id: "b",
        title: "다음 제품부터 반영",
        summary: "현재 상품은 유지하고 향후 디자인 지침만 개선합니다.",
        cost: 0,
        risk: 0.29,
        resolutionDelay: 5,
        strategyDelta: { audience: -5, product: 5, posture: -1 },
        results: {
          success: { headline: "새 디자인 지침 공개", body: "구체적인 개선 시안과 일정이 제시돼 불만이 잦아들었습니다.", cashDelta: 0, trustDelta: 2, userMultipliers: { tier: 0, casual: 0.006, collector: 0 }, revenueBonus: 0.002, revenueDuration: 8 },
          backlash: { headline: "접근성 외면 비판", body: "현재 구매자의 불편을 미뤘다는 지적이 확산됐습니다.", cashDelta: 0, trustDelta: -5, userMultipliers: { tier: -0.006, casual: -0.02, collector: -0.005 }, revenueBonus: -0.006, revenueDuration: 16 },
        },
      },
    ],
  },
  {
    type: "localization-delay",
    kicker: "GLOBAL OPERATIONS",
    title: "해외판 번역 오류",
    situation: "해외 출시 직전 핵심 카드 여러 장의 번역이 실제 판정과 다르다는 사실이 확인됐습니다.",
    choices: [
      {
        id: "a",
        title: "출시 연기 후 전량 수정",
        summary: "일정을 늦춰 실제 카드와 규정 문서를 모두 바로잡습니다.",
        cost: 0.24,
        risk: 0.17,
        resolutionDelay: 12,
        strategyDelta: { audience: 2, product: -4, posture: -11 },
        results: {
          success: { headline: "수정판 해외 출시 안착", body: "늦어진 만큼 완성도 높은 현지화가 장기 신뢰를 얻었습니다.", cashDelta: 0.12, trustDelta: 4, userMultipliers: { tier: 0.012, casual: 0.022, collector: 0.018 }, revenueBonus: 0.012, revenueDuration: 24 },
          backlash: { headline: "출시 공백으로 관심 이탈", body: "수정 기간이 길어지며 예약과 현지 대회 일정이 무너졌습니다.", cashDelta: -0.1, trustDelta: -2, userMultipliers: { tier: -0.008, casual: -0.018, collector: -0.012 }, revenueBonus: -0.007, revenueDuration: 18 },
        },
      },
      {
        id: "b",
        title: "예정 출시 후 정오표 배포",
        summary: "인쇄물은 그대로 내고 온라인 문서로 빠르게 보완합니다.",
        cost: 0,
        risk: 0.43,
        resolutionDelay: 6,
        strategyDelta: { audience: 5, product: 4, posture: 10 },
        results: {
          success: { headline: "정오표로 일정 방어", body: "매장과 심판 교육이 빠르게 이뤄져 출시 열기를 유지했습니다.", cashDelta: 0.18, trustDelta: -1, userMultipliers: { tier: 0.003, casual: 0.02, collector: 0.012 }, revenueBonus: 0.015, revenueDuration: 18 },
          backlash: { headline: "해외 대회 판정 혼란", body: "카드와 정오표가 충돌해 환불과 대회 재경기 요구가 빗발쳤습니다.", cashDelta: -0.08, trustDelta: -6, userMultipliers: { tier: -0.025, casual: -0.03, collector: -0.018 }, revenueBonus: -0.011, revenueDuration: 24 },
        },
      },
    ],
  },
  {
    type: "print-defect",
    kicker: "QUALITY INCIDENT",
    title: "대규모 인쇄 불량",
    situation: "특정 생산 로트에서 뒷면 색 차이와 재단 불량이 발견돼 카드 식별 문제가 제기됐습니다.",
    choices: [
      {
        id: "a",
        title: "전량 회수와 교환",
        summary: "문제 로트를 모두 회수하고 새 제품으로 교환합니다.",
        cost: 0.38,
        risk: 0.12,
        resolutionDelay: 11,
        strategyDelta: { audience: 2, product: -8, posture: -12 },
        results: {
          success: { headline: "전량 교환 신뢰 회복", body: "빠른 회수와 새 인쇄 품질이 구매자의 불안을 잠재웠습니다.", cashDelta: 0.05, trustDelta: 7, userMultipliers: { tier: 0.008, casual: 0.014, collector: 0.022 }, revenueBonus: 0.005, revenueDuration: 20 },
          backlash: { headline: "교환품에서도 불량 발견", body: "재생산 품질까지 흔들리며 공급망 전체가 의심받았습니다.", cashDelta: -0.12, trustDelta: -6, userMultipliers: { tier: -0.008, casual: -0.016, collector: -0.035 }, revenueBonus: -0.012, revenueDuration: 24 },
        },
      },
      {
        id: "b",
        title: "신청자 선별 보상",
        summary: "사진 심사를 통과한 구매자에게만 교환 쿠폰을 제공합니다.",
        cost: 0,
        risk: 0.36,
        resolutionDelay: 7,
        strategyDelta: { audience: -4, product: 7, posture: 6 },
        results: {
          success: { headline: "선별 보상으로 피해 수습", body: "실제 피해 로트를 빠르게 가려내 비용과 불만을 함께 줄였습니다.", cashDelta: 0.06, trustDelta: 1, userMultipliers: { tier: 0, casual: 0, collector: 0.006 }, revenueBonus: 0.003, revenueDuration: 10 },
          backlash: { headline: "보상 심사 기준 논란", body: "같은 불량인데도 거절된 사례가 퍼지며 차별 보상 비판이 커졌습니다.", cashDelta: -0.03, trustDelta: -6, userMultipliers: { tier: -0.006, casual: -0.012, collector: -0.028 }, revenueBonus: -0.01, revenueDuration: 20 },
        },
      },
    ],
  },
  {
    type: "artist-contract",
    kicker: "CREATIVE PARTNERSHIP",
    title: "인기 작가 독점 계약",
    situation: "최고 인기 일러스트레이터가 높은 로열티의 독점 계약을 제안했습니다. 계약하거나 신인 작가 공모로 방향을 바꿀 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "스타 작가 독점 계약",
        summary: "높은 선급금을 지불하고 프리미엄 아트 라인을 확보합니다.",
        cost: 0.28,
        risk: 0.24,
        resolutionDelay: 10,
        strategyDelta: { audience: 3, product: 12, posture: 5 },
        results: {
          success: { headline: "프리미엄 아트 라인 흥행", body: "새 일러스트가 수집층 밖에서도 화제가 되며 예약이 몰렸습니다.", cashDelta: 0.25, trustDelta: 1, userMultipliers: { tier: 0, casual: 0.012, collector: 0.04 }, revenueBonus: 0.018, revenueDuration: 22 },
          backlash: { headline: "독점 작풍 피로", body: "비슷한 구성이 반복된다는 평가와 함께 높은 가격만 부각됐습니다.", cashDelta: -0.1, trustDelta: -3, userMultipliers: { tier: 0, casual: -0.008, collector: -0.025 }, revenueBonus: -0.009, revenueDuration: 18 },
        },
      },
      {
        id: "b",
        title: "신인 작가 공개 공모",
        summary: "독점 계약 대신 여러 신인에게 카드 아트를 맡깁니다.",
        cost: 0,
        risk: 0.3,
        resolutionDelay: 12,
        strategyDelta: { audience: 4, product: -6, posture: -2 },
        results: {
          success: { headline: "신인 공모전 화제", body: "다양한 작풍과 작가 서사가 팬덤의 자발적 홍보를 만들었습니다.", cashDelta: 0.1, trustDelta: 3, userMultipliers: { tier: 0, casual: 0.02, collector: 0.025 }, revenueBonus: 0.01, revenueDuration: 20 },
          backlash: { headline: "아트 품질 편차 논란", body: "카드마다 완성도가 크게 달라 대표 제품의 통일감이 무너졌습니다.", cashDelta: -0.04, trustDelta: -2, userMultipliers: { tier: 0, casual: -0.006, collector: -0.018 }, revenueBonus: -0.005, revenueDuration: 14 },
        },
      },
    ],
  },
  {
    type: "rules-complexity",
    kicker: "ONBOARDING REVIEW",
    title: "룰 복잡도 이탈 경고",
    situation: "체험 유저 조사에서 절반이 첫 게임의 복잡성을 이유로 정착하지 않았다고 답했습니다.",
    choices: [
      {
        id: "a",
        title: "간소화 입문 규칙 도입",
        summary: "일부 소환과 타이밍을 덜어낸 공식 입문 포맷을 만듭니다.",
        cost: 0.16,
        risk: 0.2,
        resolutionDelay: 8,
        strategyDelta: { audience: 11, product: -5, posture: 1 },
        results: {
          success: { headline: "입문 포맷 정착", body: "짧은 첫 게임이 자연스럽게 정규 룰 학습으로 이어졌습니다.", cashDelta: 0.06, trustDelta: 3, userMultipliers: { tier: 0.004, casual: 0.045, collector: 0.006 }, revenueBonus: 0.008, revenueDuration: 21 },
          backlash: { headline: "두 개의 룰 체계 혼선", body: "입문 포맷과 정규 포맷의 차이가 오히려 두 번째 진입 장벽이 됐습니다.", cashDelta: -0.04, trustDelta: -2, userMultipliers: { tier: -0.006, casual: -0.018, collector: 0 }, revenueBonus: -0.004, revenueDuration: 12 },
        },
      },
      {
        id: "b",
        title: "심판·멘토 교육 강화",
        summary: "룰은 유지하고 매장마다 설명할 사람을 늘립니다.",
        cost: 0,
        risk: 0.27,
        resolutionDelay: 10,
        strategyDelta: { audience: -8, product: -2, posture: -5 },
        results: {
          success: { headline: "매장 멘토 제도 확산", body: "숙련 유저가 신규를 직접 돕는 문화가 지역 커뮤니티에 자리 잡았습니다.", cashDelta: 0.04, trustDelta: 4, userMultipliers: { tier: 0.018, casual: 0.026, collector: 0.002 }, revenueBonus: 0.005, revenueDuration: 24 },
          backlash: { headline: "멘토 품질 편차", body: "잘못된 설명과 고압적인 응대 사례가 공유되며 제도 신뢰가 떨어졌습니다.", cashDelta: -0.02, trustDelta: -3, userMultipliers: { tier: -0.005, casual: -0.016, collector: 0 }, revenueBonus: -0.003, revenueDuration: 14 },
        },
      },
    ],
  },
  {
    type: "data-transparency",
    kicker: "META DISCLOSURE",
    title: "대회 데이터 공개 논쟁",
    situation: "유저들이 덱별 승률과 선후공 통계를 요구합니다. 원자료를 모두 공개하거나 해설을 붙인 요약 보고서만 낼 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "익명 원자료 전면 공개",
        summary: "누구나 검증할 수 있도록 대회 데이터를 내려받게 합니다.",
        cost: 0.08,
        risk: 0.23,
        resolutionDelay: 6,
        strategyDelta: { audience: -4, product: -7, posture: 3 },
        results: {
          success: { headline: "공개 데이터 연구 활성화", body: "유저 분석과 공식 설명이 맞물리며 밸런스 논의의 신뢰가 높아졌습니다.", cashDelta: 0, trustDelta: 6, userMultipliers: { tier: 0.03, casual: 0.004, collector: 0 }, revenueBonus: 0.003, revenueDuration: 18 },
          backlash: { headline: "통계 해석 전쟁", body: "맥락 없는 수치가 과장되며 특정 덱과 선수에 대한 공격이 번졌습니다.", cashDelta: -0.02, trustDelta: -3, userMultipliers: { tier: -0.012, casual: -0.004, collector: 0 }, revenueBonus: -0.003, revenueDuration: 12 },
        },
      },
      {
        id: "b",
        title: "공식 해설 보고서만 공개",
        summary: "핵심 지표와 운영진 해석을 정리해 정보 흐름을 관리합니다.",
        cost: 0,
        risk: 0.31,
        resolutionDelay: 4,
        strategyDelta: { audience: 3, product: 4, posture: -2 },
        results: {
          success: { headline: "해설 보고서로 논쟁 정리", body: "읽기 쉬운 설명이 일반 유저에게 현재 환경을 정확히 전달했습니다.", cashDelta: 0.02, trustDelta: 2, userMultipliers: { tier: 0.008, casual: 0.009, collector: 0 }, revenueBonus: 0.002, revenueDuration: 10 },
          backlash: { headline: "유리한 통계만 골랐다는 의혹", body: "원자료를 숨겼다는 비판이 운영 조작 의심으로 번졌습니다.", cashDelta: 0, trustDelta: -5, userMultipliers: { tier: -0.018, casual: -0.008, collector: 0 }, revenueBonus: -0.005, revenueDuration: 16 },
        },
      },
    ],
  },
  {
    type: "subscription-offer",
    kicker: "NEW MONETIZATION",
    title: "월간 멤버십 제안",
    situation: "매달 프로모션 카드와 할인 쿠폰을 주는 유료 멤버십이 제안됐습니다. 안정 매출과 과금 피로 사이의 선택입니다.",
    choices: [
      {
        id: "a",
        title: "유료 멤버십 출시",
        summary: "정기 혜택을 묶어 반복 매출과 이용 데이터를 확보합니다.",
        cost: 0.12,
        risk: 0.36,
        resolutionDelay: 9,
        strategyDelta: { audience: 5, product: 10, posture: 9 },
        results: {
          success: { headline: "멤버십 가입 흥행", body: "합리적인 혜택 구성이 반복 구매와 매장 방문을 함께 늘렸습니다.", cashDelta: 0.24, trustDelta: 1, userMultipliers: { tier: 0.006, casual: 0.018, collector: 0.028 }, revenueBonus: 0.02, revenueDuration: 30 },
          backlash: { headline: "필수 혜택 유료화 반발", body: "무료였던 혜택을 잠갔다는 인식이 퍼져 해지와 불매가 이어졌습니다.", cashDelta: -0.06, trustDelta: -6, userMultipliers: { tier: -0.012, casual: -0.025, collector: -0.022 }, revenueBonus: -0.012, revenueDuration: 24 },
        },
      },
      {
        id: "b",
        title: "무료 로열티 프로그램",
        summary: "가입비 없이 구매·참가 실적에 따라 작은 보상을 제공합니다.",
        cost: 0,
        risk: 0.17,
        resolutionDelay: 7,
        strategyDelta: { audience: 4, product: -8, posture: -5 },
        results: {
          success: { headline: "무료 포인트 정착", body: "부담 없는 보상이 재방문과 구매 신뢰를 높였습니다.", cashDelta: 0.08, trustDelta: 4, userMultipliers: { tier: 0.004, casual: 0.02, collector: 0.014 }, revenueBonus: 0.008, revenueDuration: 25 },
          backlash: { headline: "포인트 운영 비용 누적", body: "혜택 사용은 늘었지만 추가 구매로 이어지지 않아 비용만 남았습니다.", cashDelta: -0.08, trustDelta: -1, userMultipliers: noUsers, revenueBonus: -0.004, revenueDuration: 16 },
        },
      },
    ],
  },
  {
    type: "warehouse-overstock",
    kicker: "INVENTORY CRISIS",
    title: "구형 상품 재고 적체",
    situation: "지난 시즌 박스가 창고를 가득 채웠습니다. 대폭 할인으로 현금화하거나 폐기해 신상품 가치를 지킬 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "공식 창고 대방출",
        summary: "큰 폭으로 할인해 신규와 복귀 유저에게 구형 상품을 풉니다.",
        cost: 0,
        risk: 0.28,
        resolutionDelay: 5,
        strategyDelta: { audience: 9, product: -12, posture: 7 },
        results: {
          success: { headline: "창고 대방출 완판", body: "낮은 진입 가격이 신규 덱 구성과 현금 회전을 동시에 만들었습니다.", cashDelta: 0.25, trustDelta: 2, userMultipliers: { tier: 0.004, casual: 0.038, collector: 0.008 }, revenueBonus: 0.012, revenueDuration: 12 },
          backlash: { headline: "정가 구매자 반발", body: "잦은 덤핑을 예상한 유저가 신상품까지 기다리기 시작했습니다.", cashDelta: 0.08, trustDelta: -5, userMultipliers: { tier: -0.004, casual: -0.01, collector: -0.025 }, revenueBonus: -0.011, revenueDuration: 24 },
        },
      },
      {
        id: "b",
        title: "재고 폐기와 가치 방어",
        summary: "판매를 포기하고 유통 물량을 거둬 가격 질서를 지킵니다.",
        cost: 0.16,
        risk: 0.22,
        resolutionDelay: 6,
        strategyDelta: { audience: -7, product: 12, posture: -6 },
        results: {
          success: { headline: "신상품 가격 질서 유지", body: "구형 덤핑 우려가 사라져 매장들이 다음 상품 주문을 유지했습니다.", cashDelta: 0.04, trustDelta: 1, userMultipliers: { tier: 0, casual: -0.003, collector: 0.018 }, revenueBonus: 0.008, revenueDuration: 20 },
          backlash: { headline: "멀쩡한 상품 폐기 논란", body: "환경과 소비자를 무시했다는 비판이 브랜드 가치 방어 논리를 덮었습니다.", cashDelta: -0.05, trustDelta: -5, userMultipliers: { tier: -0.003, casual: -0.016, collector: -0.008 }, revenueBonus: -0.006, revenueDuration: 16 },
        },
      },
    ],
  },
  {
    type: "fan-content-policy",
    kicker: "FAN ECOSYSTEM",
    title: "2차 창작 가이드라인",
    situation: "팬 제작 카드·플레이매트·영상이 빠르게 늘자 법무팀이 통일된 정책을 요구했습니다.",
    choices: [
      {
        id: "a",
        title: "비상업 2차 창작 폭넓게 허용",
        summary: "간단한 금지선만 두고 팬 활동과 소규모 행사를 인정합니다.",
        cost: 0.06,
        risk: 0.21,
        resolutionDelay: 7,
        strategyDelta: { audience: 8, product: -6, posture: 4 },
        results: {
          success: { headline: "팬 창작 생태계 확장", body: "영상과 팬 행사가 자연스럽게 신규 유입 채널이 됐습니다.", cashDelta: 0.05, trustDelta: 4, userMultipliers: { tier: 0.005, casual: 0.034, collector: 0.018 }, revenueBonus: 0.009, revenueDuration: 24 },
          backlash: { headline: "비공식 상품 사기 발생", body: "허용 범위를 악용한 위조 상품이 퍼져 공식 대응이 늦었다는 비판이 나왔습니다.", cashDelta: -0.05, trustDelta: -4, userMultipliers: { tier: -0.004, casual: -0.014, collector: -0.012 }, revenueBonus: -0.006, revenueDuration: 16 },
        },
      },
      {
        id: "b",
        title: "공식 라이선스만 허용",
        summary: "승인 없는 굿즈와 행사에 엄격한 삭제·중단 요청을 보냅니다.",
        cost: 0,
        risk: 0.39,
        resolutionDelay: 5,
        strategyDelta: { audience: -9, product: 9, posture: 5 },
        results: {
          success: { headline: "공식 라이선스 시장 성장", body: "품질이 보장된 협업 상품과 정식 파트너가 안정적으로 늘었습니다.", cashDelta: 0.16, trustDelta: 0, userMultipliers: { tier: 0, casual: -0.003, collector: 0.02 }, revenueBonus: 0.013, revenueDuration: 20 },
          backlash: { headline: "팬 활동 위축", body: "오래된 팬 행사와 영상이 사라지며 커뮤니티가 회사 중심 정책에 반발했습니다.", cashDelta: -0.02, trustDelta: -5, userMultipliers: { tier: -0.012, casual: -0.03, collector: -0.014 }, revenueBonus: -0.008, revenueDuration: 21 },
        },
      },
    ],
  },
  {
    type: "rival-tcg-launch",
    kicker: "COMPETITOR ALERT",
    title: "경쟁 TCG 국내 론칭",
    situation: "대형 퍼블리셔의 신작 TCG가 유명 IP와 공격적인 매장 지원을 앞세워 국내 출시를 발표했습니다. 즉시 맞불을 놓거나 시장 반응을 지켜볼 수 있습니다.",
    choices: [
      {
        id: "a",
        title: "맞불 캠페인과 복귀 보상",
        summary: "광고·매장 리그·복귀 쿠폰을 한꺼번에 집행해 유저 이탈을 선제 방어합니다.",
        cost: 0.3,
        risk: 0.27,
        resolutionDelay: 10,
        strategyDelta: { audience: 10, product: -5, posture: 12 },
        results: {
          success: { headline: "맞불 캠페인으로 관심 방어", body: "복귀 보상과 지역 행사가 신작 체험층을 다시 기존 게임으로 끌어왔습니다.", cashDelta: 0.15, trustDelta: 2, userMultipliers: { tier: 0.018, casual: 0.035, collector: 0.012 }, revenueBonus: 0.014, revenueDuration: 22 },
          backlash: { headline: "광고비 경쟁만 격화", body: "비슷한 프로모션이 겹치며 비용은 늘고 유저의 관심은 경쟁작으로 분산됐습니다.", cashDelta: -0.09, trustDelta: -3, userMultipliers: { tier: -0.018, casual: -0.032, collector: -0.012 }, revenueBonus: -0.009, revenueDuration: 20 },
        },
      },
      {
        id: "b",
        title: "대응 없이 시장 반응 관망",
        summary: "추가 지출 없이 기존 발매와 커뮤니티의 충성도를 믿고 기다립니다.",
        cost: 0,
        risk: 0.44,
        resolutionDelay: 14,
        strategyDelta: { audience: -8, product: 3, posture: -12 },
        results: {
          success: { headline: "경쟁작 자멸", body: "초기 품질과 공급 문제가 겹친 경쟁작이 스스로 열기를 잃고 체험 유저가 돌아왔습니다.", cashDelta: 0.08, trustDelta: 3, userMultipliers: { tier: 0.012, casual: 0.026, collector: 0.008 }, revenueBonus: 0.007, revenueDuration: 18 },
          backlash: { headline: "경쟁작 안착", body: "안정적인 매장 지원과 인기 IP가 자리를 잡으며 기존 유저 일부가 새 게임에 정착했습니다.", cashDelta: -0.04, trustDelta: -5, userMultipliers: { tier: -0.035, casual: -0.045, collector: -0.022 }, revenueBonus: -0.013, revenueDuration: 28 },
        },
      },
    ],
  },
] as const satisfies readonly BusinessEventDefinition[];

export const BUSINESS_EVENT_TYPES = BUSINESS_EVENTS.map((event) => event.type) as
  readonly BusinessEventType[];

export const BUSINESS_EVENT_BY_TYPE = Object.fromEntries(
  BUSINESS_EVENTS.map((event) => [event.type, event]),
) as Record<BusinessEventType, BusinessEventDefinition>;

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
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function keyedRandom(seed: number, ...keys: Array<string | number>): number {
  return keyedUint(seed, ...keys) / 4294967296;
}

function isScheduledDecisionDay(day: number): boolean {
  return (
    isScheduledReleaseDay(day) ||
    (day >= FIRST_BAN_DAY && (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0)
  );
}

function chooseOpenDay(
  seed: number,
  minimum: number,
  maximum: number,
  ...keys: Array<string | number>
): number | null {
  if (minimum > maximum) return null;
  const count = maximum - minimum + 1;
  const start = keyedUint(seed, ...keys) % count;
  for (let offset = 0; offset < count; offset += 1) {
    const day = minimum + ((start + offset) % count);
    if (!isScheduledDecisionDay(day)) return day;
  }
  return null;
}

/** The first two-choice dilemma is a fixed early campaign beat. */
export function getInitialBusinessEventDay(seed: number): number {
  void seed;
  return FIRST_BUSINESS_EVENT_DAY;
}

/** The first recurring dilemma keeps the original seeded DAY 52..60 window. */
export function getFirstRecurringBusinessEventDay(seed: number): number {
  return chooseOpenDay(
    seed,
    RECURRING_BUSINESS_EVENT_START_DAY,
    RECURRING_BUSINESS_EVENT_START_DAY +
      (BUSINESS_EVENT_MAX_INTERVAL - BUSINESS_EVENT_MIN_INTERVAL),
    "business-event-initial-day",
  ) ?? RECURRING_BUSINESS_EVENT_START_DAY;
}

/**
 * After the fixed opener, resumes the original seeded DAY 52..60 window.
 * Later events arrive 14..22 days apart, never on a release or ban day.
 */
export function getNextBusinessEventDay(
  seed: number,
  afterDay: number,
  nextEventId: number,
): number | null {
  if (nextEventId === 2) {
    return getFirstRecurringBusinessEventDay(seed);
  }
  const minimum = Math.max(
    RECURRING_BUSINESS_EVENT_START_DAY,
    afterDay + BUSINESS_EVENT_MIN_INTERVAL,
  );
  const maximum = Math.min(
    LAST_DECISION_DAY - 1,
    afterDay + BUSINESS_EVENT_MAX_INTERVAL,
  );
  return chooseOpenDay(
    seed,
    minimum,
    maximum,
    "business-event-next-day",
    afterDay,
    nextEventId,
  );
}

/** Every seeded cycle of sixteen offers contains every event type exactly once. */
export function getBusinessEventType(
  seed: number,
  eventId: number,
): BusinessEventType {
  if (!Number.isInteger(eventId) || eventId < 1) {
    throw new Error("Business-event ID must be a positive integer.");
  }
  const cycle = Math.floor((eventId - 1) / BUSINESS_EVENT_TYPES.length);
  const position = (eventId - 1) % BUSINESS_EVENT_TYPES.length;
  const order = [...BUSINESS_EVENT_TYPES].sort((left, right) => {
    const leftKey = keyedUint(seed, "business-event-type", cycle, left);
    const rightKey = keyedUint(seed, "business-event-type", cycle, right);
    return leftKey - rightKey || left.localeCompare(right);
  });
  return order[position];
}

export function getBusinessEventChoice(
  type: BusinessEventType,
  choice: BusinessEventChoice,
): BusinessEventChoiceDefinition {
  const definition = BUSINESS_EVENT_BY_TYPE[type];
  const selected = definition?.choices.find((candidate) => candidate.id === choice);
  if (!selected) throw new Error(`Unknown business-event choice: ${type}/${choice}.`);
  return selected;
}

export function getBusinessEventOutcome(
  seed: number,
  eventId: string | number,
  risk: number,
): Exclude<BusinessEventOutcome, "pending"> {
  if (!Number.isFinite(risk) || risk < 0 || risk > 1) {
    throw new Error("Business-event risk must be between zero and one.");
  }
  const roll = keyedRandom(seed, "business-event-outcome", eventId);
  return roll < risk ? "backlash" : "success";
}

export function getBusinessEventResult(
  type: BusinessEventType,
  choice: BusinessEventChoice,
  outcome: Exclude<BusinessEventOutcome, "pending">,
): BusinessEventResultImpact {
  return getBusinessEventChoice(type, choice).results[outcome];
}

export function applyBusinessStrategyDelta(
  strategy: Readonly<BusinessStrategy>,
  delta: Readonly<BusinessStrategy>,
): BusinessStrategy {
  return {
    audience: Math.max(
      BUSINESS_STRATEGY_MIN,
      Math.min(BUSINESS_STRATEGY_MAX, strategy.audience + delta.audience),
    ),
    product: Math.max(
      BUSINESS_STRATEGY_MIN,
      Math.min(BUSINESS_STRATEGY_MAX, strategy.product + delta.product),
    ),
    posture: Math.max(
      BUSINESS_STRATEGY_MIN,
      Math.min(BUSINESS_STRATEGY_MAX, strategy.posture + delta.posture),
    ),
  };
}

/**
 * Converts the accumulated three-axis posture into small permanent daily
 * modifiers. A single event never dominates a paid action, but a consistent
 * campaign direction becomes material over the remaining mandate.
 */
export function getBusinessStrategyModifiers(
  strategy: Readonly<BusinessStrategy>,
): BusinessStrategyModifiers {
  const audience = Math.max(-1, Math.min(1, strategy.audience / 100));
  const product = Math.max(-1, Math.min(1, strategy.product / 100));
  const posture = Math.max(-1, Math.min(1, strategy.posture / 100));
  return {
    userRates: {
      tier: -0.00018 * audience + 0.00008 * posture,
      casual: 0.00028 * audience - 0.00006 * product + 0.00012 * posture,
      collector: 0.00006 * audience + 0.00024 * product + 0.00006 * posture,
    },
    buyerRate: 0.004 * product + 0.002 * posture,
    revenueMultiplier: 1 + 0.012 * product + 0.025 * posture,
    trustPerDay: -0.008 * product - 0.012 * posture,
  };
}

/** Flat revenue from a resolved result on this day; inactive records return zero. */
export function getBusinessEventRevenueBonus(
  record: Readonly<BusinessEventRecord>,
  day: number,
): number {
  if (
    record.outcome === "pending" ||
    record.resolvedDay === undefined ||
    day < record.resolvedDay
  ) {
    return 0;
  }
  const result = getBusinessEventResult(
    record.type,
    record.choice,
    record.outcome,
  );
  return day < record.resolvedDay + result.revenueDuration
    ? result.revenueBonus
    : 0;
}
