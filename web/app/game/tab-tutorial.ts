import {
  FIRST_BAN_DAY,
  FIRST_RELEASE_DAY,
  getNextReprintReleaseDay,
  isRegularReleaseDay,
  isReprintReleaseDay,
} from "./campaign.ts";
import { getHandoverTabAvailability } from "./handover.ts";

export const TAB_TUTORIAL_TAB_IDS = [
  "distribution",
  "cards",
  "releases",
  "operations",
  "community",
  "news",
  "finance",
] as const;

export type TabTutorialTabId = (typeof TAB_TUTORIAL_TAB_IDS)[number];

export type TabTutorialContentTerm = Readonly<{
  label: string;
  description: string;
}>;

export type TabTutorialContentPage = Readonly<{
  id: string;
  sectionLabel?: string;
  /** Optional background tab shown while this page remains open. */
  targetTab?: TabTutorialTabId;
  title: string;
  body: string;
  terms?: readonly TabTutorialContentTerm[];
}>;

export type TabTutorialDefinition = Readonly<{
  tab: TabTutorialTabId;
  label: string;
  pages: readonly TabTutorialContentPage[];
}>;

export type TabTutorialVisitState = Readonly<
  Record<TabTutorialTabId, boolean>
>;

export type TabTutorialContext = Readonly<{
  /** Omitted by standalone help callers that are not inside a campaign. */
  day?: number;
  handoverComplete?: boolean;
}>;

export const CONTEXTUAL_TUTORIAL_TOPIC_IDS = [
  "first-restriction",
  "first-release",
  "first-reprint",
] as const;

export const FIRST_REPRINT_TUTORIAL_DAY =
  getNextReprintReleaseDay(FIRST_BAN_DAY);

export type ContextualTutorialTopicId =
  (typeof CONTEXTUAL_TUTORIAL_TOPIC_IDS)[number];

export type ContextualTutorialDefinition = Readonly<{
  topic: ContextualTutorialTopicId;
  tab: TabTutorialTabId;
  label: string;
  pages: readonly TabTutorialContentPage[];
}>;

export type ContextualTutorialVisitState = Readonly<
  Record<ContextualTutorialTopicId, boolean>
>;

export type ContextualTutorialContext = TabTutorialContext &
  Readonly<{
    day: number;
    phase: "running" | "release-edit" | "ban-edit" | "ended";
  }>;

export type PendingTutorialPopup =
  | Readonly<{
      kind: "tab";
      id: TabTutorialTabId;
      label: string;
      pages: readonly TabTutorialContentPage[];
    }>
  | Readonly<{
      kind: "contextual";
      id: ContextualTutorialTopicId;
      label: string;
      pages: readonly TabTutorialContentPage[];
    }>;

const DISTRIBUTION_TUTORIAL = {
  tab: "distribution",
  label: "분포",
  pages: [
    {
      id: "distribution-overview",
      sectionLabel: "인수인계",
      title: "안녕하십니까. 비서 LOTUS입니다",
      body:
        "당신은 이 회사의 TCG 운영 책임자입니다. 시장을 관리하고, 카드를 발매하고, 필요할 때 금제하여 최고의 TCG를 목표로 하십시오.",
      terms: [
        {
          label: "당신의 역할",
          description:
            "강한 상품으로 매출을 만들지, 환경과 신뢰를 지킬지 판단하고 그 후폭풍까지 책임집니다.",
        },
        {
          label: "게임의 목적",
          description:
            "임기 말 결산에서 보유자금·생태계 건강·구매 신뢰·활성 유저와 장기 운영 기록을 함께 평가받습니다.",
        },
        {
          label: "화면 탭",
          description:
            "분포·카드·발매·사업 운영·커뮤니티·소식·재무를 오가며 같은 상황을 서로 다른 관점으로 확인합니다.",
        },
        {
          label: "PLAY 화면",
          description: "현재 진행을 보존하고 메인 화면으로 돌아갑니다.",
        },
      ],
    },
    {
      id: "distribution-handover-core-metrics",
      sectionLabel: "인수인계",
      title: "다섯 가지 핵심 지표를 함께 관리합니다",
      body:
        "한 지표만 올리면 다른 지표가 무너질 수 있습니다. 발매·금제·사업을 결정한 뒤 아래 값이 어느 방향으로 움직였는지 확인하세요.",
      terms: [
        {
          label: "활성 유저",
          description:
            "현재 게임을 이용하는 전체 플레이어 수입니다. 메타층·캐주얼층·콜렉터층·리셀층으로 구성됩니다.",
        },
        {
          label: "매출 / 보유자금",
          description:
            "매출은 카드 상품이 벌어들인 돈이고, 보유자금은 매출 몫에서 운영비와 사업비를 반영한 뒤 실제로 쓸 수 있는 현금입니다.",
        },
        {
          label: "생태계 건강",
          description:
            "경기 품질·입상 다양성·상위권 순환·세대 공존·연속성을 합친 환경 점수입니다.",
        },
        {
          label: "구매 신뢰",
          description:
            "구매한 카드의 가치가 발매·재판·금제 정책으로 존중받는다고 느끼는 정도를 100점 기준으로 나타냅니다.",
        },
        {
          label: "커뮤니티 여론",
          description:
            "매일 올라온 글의 긍정·부정 반응을 점수로 모은 값입니다. 50점이 중립입니다.",
        },
      ],
    },
    {
      id: "distribution-header",
      sectionLabel: "인수인계",
      title: "상단에서 현재 상태를 읽습니다",
      body:
        "상단은 어떤 탭에서도 유지됩니다. 날짜와 핵심 자원을 먼저 읽고, 다음 의사결정까지 남은 시간을 확인하세요.",
      terms: [
        {
          label: "금제 리스트 / 키워드 도감",
          description:
            "버튼을 클릭하면 현재 제재 카드와 플레이 키워드 설명이 열리고, 다시 클릭하면 닫힙니다.",
        },
        {
          label: "DAY / 핵심 자원",
          description:
            "현재 날짜와 활성 유저·보유자금을 빠르게 확인합니다. 보유자금 아래에는 현재 운영비를 버틸 수 있는 예상 기간이 표시됩니다.",
        },
        {
          label: "다음 발매 / 금제위원회",
          description:
            "D-숫자는 해당 결정일까지 남은 날입니다. 결정 당일에는 선정 중 또는 진행 중으로 바뀝니다.",
        },
      ],
    },
    {
      id: "distribution-footer-controls",
      sectionLabel: "인수인계",
      title: "하단 버튼으로 시간이 실제 진행됩니다",
      body:
        "+1일과 다음 일정까지는 설명만 넘기는 버튼이 아니라 게임 날짜를 실제로 진행합니다. 의사결정이나 사건이 먼저 도착하면 그날 멈춥니다.",
      terms: [
        {
          label: "임기 진행",
          description:
            "현재 날짜가 전체 임기에서 차지하는 비율입니다.",
        },
        {
          label: "+1일",
          description:
            "결정 직후의 하루 반응처럼 짧은 변화를 세밀하게 관찰할 때 사용합니다.",
        },
        {
          label: "다음 일정까지",
          description:
            "가장 가까운 발매·금제·결산까지 진행하며, 중간에 처리할 사건이 생기면 자동으로 멈춥니다.",
        },
      ],
    },
    {
      id: "distribution-modes",
      sectionLabel: "분포",
      title: "분포는 두 기준으로 바꿔 봅니다",
      body:
        "입상 점유율은 최근 대회 성과를, 유저 비율은 플레이어 계층 구성을 보여줍니다. 두 값은 서로 다른 질문에 답하므로 함께 판단하세요.",
      terms: [
        {
          label: "입상 점유율",
          description:
            "최근 7일 주요 대회의 입상 자리 가운데 각 테마가 차지한 비율입니다.",
        },
        {
          label: "유저 비율",
          description:
            "메타층·캐주얼층·콜렉터층·리셀층이 전체 활성 유저에서 차지하는 구성비입니다.",
        },
        {
          label: "오늘의 입상표",
          description:
            "가장 최근 대회의 순위별 테마와 입상 자리 수입니다. 게임의 간섭 없이도 매일 결과가 달라질 수 있습니다.",
        },
      ],
    },
    {
      id: "distribution-chart",
      sectionLabel: "분포",
      title: "그래프에서 점유 구조를 읽습니다",
      body:
        "원형 그래프는 12시부터 큰 비율 순으로 시계 방향 배치되며, 입상 그래프의 기타는 항상 마지막입니다. 조각에 마우스를 올리면 이름과 비율을 확인하고, 테마 조각이나 우측 목록을 누르면 카드 화면의 해당 테마로 이동합니다.",
      terms: [
        {
          label: "상위 3개 집중",
          description:
            "최근 7일 입상의 몇 퍼센트를 상위 세 테마가 차지했는지 보여줍니다.",
        },
        {
          label: "하단 요약",
          description:
            "최근 30일 매출, 남은 임기, 최종 결산이 보는 자금·환경·운영 기록을 요약합니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const CARDS_TUTORIAL = {
  tab: "cards",
  label: "카드",
  pages: [
    {
      id: "cards-catalog",
      title: "테마와 범용 카드를 나누어 봅니다",
      body:
        "테마 리스트는 테마별 전용 카드와 성과를, 범용 리스트는 여러 테마가 함께 쓰는 카드를 보여줍니다. 테마 이름을 누르면 오른쪽 상세 정보가 바뀝니다.",
      terms: [
        {
          label: "테마 리스트",
          description:
            "출시 테마별 유저 비율과 입상 점유율을 비교하고 전용 카드 목록을 엽니다.",
        },
        {
          label: "범용 리스트",
          description:
            "출시된 범용 카드의 키워드, 출시일, 채용 테마, 시세와 현행 제한을 모아봅니다.",
        },
        {
          label: "플레이 키워드",
          description:
            "테마가 어떤 방식으로 플레이되는지 나타내는 공개 특성입니다. 자세한 뜻은 상단 키워드 도감에서 확인합니다.",
        },
      ],
    },
    {
      id: "cards-theme-metrics",
      title: "테마 성과와 발매 요청을 읽습니다",
      body:
        "유저 비율·입상 점유율·승률은 인기와 대회 성과를 서로 다르게 보여줍니다. 오른쪽 요청 버튼은 다음 발매 후보에 원하는 방향을 기록합니다.",
      terms: [
        {
          label: "유저 비율",
          description: "전체 활성 유저 가운데 이 테마를 사용하는 사람의 비율입니다.",
        },
        {
          label: "입상 점유율 / 승률",
          description:
            "입상 점유율은 최근 7일 입상 비중, 승률은 이 테마가 치른 경기에서 이긴 비율입니다.",
        },
        {
          label: "지원",
          description: "선택한 기존 테마의 전용 보강 방향을 다음 발매에 요청합니다.",
        },
        {
          label: "간접 / 저격",
          description:
            "간접은 같은 키워드의 범용 카드, 저격은 선택 테마와 상성인 범용 카드가 다음 발매 후보에 나오도록 요청합니다.",
        },
        {
          label: "재판팩",
          description:
            "재판은 정규팩 자리를 차지하지 않습니다. 세 번째 상품 심의마다 별도 재판팩에서 고가·품귀 카드 3종을 선택합니다.",
        },
        {
          label: "ⓘ",
          description: "지원·간접·저격 요청의 짧은 설명을 열거나 닫습니다.",
        },
      ],
    },
    {
      id: "cards-table",
      title: "카드 표에서 채용과 시세를 봅니다",
      body:
        "각 행은 카드 이름과 역할, 출시 시점, 채용률과 평균 투입 매수, 현재 시세와 7일 등락, 현행 허용 매수를 보여줍니다. 하이 일러스트 같은 수집 수요 카드는 채용률이 낮아도 높은 가격을 유지할 수 있습니다.",
      terms: [
        {
          label: "채용률 / 평균 매수",
          description:
            "해당 테마 덱 가운데 그 카드를 쓰는 덱의 비율과, 쓰는 덱이 평균 몇 장 넣는지를 뜻합니다.",
        },
        {
          label: "시세 / 7일 등락",
          description:
            "현재 카드 한 장의 거래 가격과 일주일 전 대비 변화입니다. 성능 수요와 수집 수요가 모두 반영됩니다.",
        },
        {
          label: "현행",
          description: "현재 덱 한 개에 넣을 수 있는 공식 최대 매수입니다.",
        },
        {
          label: "금제 일정",
          description:
            "평소에는 현행 제한만 열람하고, 금제위원회가 열린 날에는 표의 조정 영역과 제출 영역이 열립니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const RELEASES_TUTORIAL = {
  tab: "releases",
  label: "발매",
  pages: [
    {
      id: "releases-archive",
      title: "정규팩과 재판팩 기록을 나누어 봅니다",
      body:
        "발매 기록은 직접 구성한 정규팩과 별도로 선택한 재판팩을 함께 모읍니다. 아직 확정된 상품이 없다면 빈 기록으로 표시됩니다.",
      terms: [
        {
          label: "정규팩",
          description: "신테마·기존 테마 지원·범용을 조합한 4종 상품입니다.",
        },
        {
          label: "재판팩",
          description: "세 번째 상품 심의마다 고가·품귀 카드 3종을 다시 공급하는 별도 상품입니다.",
        },
      ],
    },
    {
      id: "releases-pack-records",
      title: "카드팩별 수록 내용을 읽습니다",
      body:
        "각 기록은 출시 DAY, 팩 이름, 대표 신테마 상징과 실제 수록 구성을 보여줍니다. 수록 목록 오른쪽 숫자는 발매 때 적용된 파워입니다.",
      terms: [
        {
          label: "카드팩",
          description:
            "정규팩은 신테마·지원·범용 구성을, 재판팩은 선택한 기존 카드 3종과 시장 영향을 표시합니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const OPERATIONS_TUTORIAL = {
  tab: "operations",
  label: "사업 운영",
  pages: [
    {
      id: "operations-overview",
      title: "사업을 집행하기 전 운영 여력을 봅니다",
      body:
        "상단 카드는 보유 운영자금, 오늘의 순운영 현금, 구매 신뢰, 환경 건강을 보여줍니다. 액션 비용뿐 아니라 이후 유지비와 환경 조건까지 함께 확인하세요.",
      terms: [
        {
          label: "순운영 현금",
          description: "오늘 매출 몫에서 일일 운영비와 액션 집행비를 뺀 현금 변화입니다.",
        },
        {
          label: "구매 신뢰",
          description: "재판·금제·지원 공백 등 운영이 카드 보유가치에 준 영향을 반영합니다.",
        },
        {
          label: "환경 건강",
          description: "위험 액션의 챌린지 조건에도 쓰이는 종합 환경 점수입니다.",
        },
        {
          label: "집행 주기",
          description: "사업 액션은 하루 한 번만 집행하며, 각 액션에는 별도 쿨다운이 있습니다.",
        },
      ],
    },
    {
      id: "operations-actions",
      title: "액션 카드는 비용과 판정 방식을 모두 보여줍니다",
      body:
        "DAY 4에는 TV CM·매장 체험회·스타터 캠프·지역 리그부터 열립니다. 각 카드에서 비용, 효과 기간, 성공 확률과 현재 실행 가능 여부를 읽고 아래 집행 버튼으로 실행합니다.",
      terms: [
        {
          label: "인수인계 기본 대응",
          description:
            "첫 주에는 네 가지 일반 액션만 실제 집행할 수 있습니다. 봉입률 조정·챌린지·대형 프로젝트는 인수인계가 끝난 뒤 검토합니다.",
        },
        {
          label: "일반 · 상태 기반 확률",
          description:
            "현재 유저·환경·신뢰 상태로 성공 확률이 정해집니다. 같은 액션만 반복해도 항상 같은 결과가 나오지 않습니다.",
        },
        {
          label: "위험 · 결정일 챌린지",
          description:
            "발매일이나 금제일에 시작하고, 정해진 마감까지 환경 건강 같은 목표를 필요한 일수만큼 유지해야 성공합니다.",
        },
        {
          label: "위험 · 적발 확률",
          description:
            "봉입률 조정처럼 즉시 이득과 적발 위험이 함께 있는 액션입니다. 확인 절차 뒤 예약됩니다.",
        },
        {
          label: "집행 버튼",
          description:
            "가능한 액션만 활성화됩니다. 쿨다운·자금·결정일·임기 한도에 걸리면 이유와 남은 기간이 표시됩니다.",
        },
      ],
    },
    {
      id: "operations-ledger",
      title: "진행 중인 효과와 최근 결정을 추적합니다",
      body:
        "오른쪽 진행 중에는 남은 기간과 챌린지 달성일을, 최근 기록에는 마지막 여덟 건의 비용·결과·확률 정보를 표시합니다. 돌발 사업 제안이 뜨면 선택을 끝내기 전에는 날짜를 진행할 수 없습니다.",
      terms: [
        {
          label: "진행 중",
          description: "효과가 유지 중이거나 결과 심사 중인 액션과 사건입니다.",
        },
        {
          label: "최근 기록",
          description: "이미 집행한 액션과 사건 선택의 날짜, 비용, 결과를 모아봅니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const COMMUNITY_TUTORIAL = {
  tab: "community",
  label: "커뮤니티",
  pages: [
    {
      id: "community-feed",
      title: "매일 올라온 플레이어 반응을 읽습니다",
      body:
        "하루 20개 글은 메타 토론·덱 연구소·신제품·금제·시세 게시판으로 나뉩니다. 글은 공식 판정이 아니라 사람들이 보내는 수요와 불만의 신호입니다.",
      terms: [
        {
          label: "게시글",
          description:
            "본문 아래에 관련 테마와 카드가 표시됩니다. 글을 누르면 카드 탭의 해당 항목으로 이동합니다.",
        },
        {
          label: "좋아요 / 인기",
          description:
            "반응이 큰 글일수록 좋아요가 높습니다. 높은 좋아요를 받은 글은 인기 표시와 별도 소식의 근거가 될 수 있습니다.",
        },
        {
          label: "열기",
          description: "그날 커뮤니티 반응이 얼마나 집중되고 격해졌는지를 나타냅니다.",
        },
      ],
    },
    {
      id: "community-days",
      title: "날짜별 반응과 후폭풍을 비교합니다",
      body:
        "이전 날·다음 날·오늘 버튼으로 지나간 게시글을 다시 봅니다. 발매와 금제를 확정한 당일에는 아직 결과가 없으며, 실제 반응은 다음 날부터 나타납니다.",
      terms: [
        {
          label: "← 이전 날 / 다음 날 →",
          description: "하루씩 이동해 반응이 시작되고 식는 과정을 비교합니다.",
        },
        {
          label: "오늘",
          description: "현재 게임 날짜의 게시글로 즉시 돌아옵니다.",
        },
        {
          label: "반응 띠",
          description:
            "신제품 평가가 폭발하거나 금제 후폭풍이 커진 날에는 열기·주요 논쟁·반응 점유를 화면 위에 요약합니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const NEWS_TUTORIAL = {
  tab: "news",
  label: "소식",
  pages: [
    {
      id: "news-summary",
      title: "큰 변화만 날짜별로 다시 봅니다",
      body:
        "매일의 소식은 수치가 크게 움직이거나 주목할 사건이 생긴 날의 기록을 모읍니다. 전체 건수와 좋은 소식·나쁜 소식의 수를 먼저 확인하세요.",
      terms: [
        {
          label: "좋은 소식 / 나쁜 소식",
          description:
            "좋은 변화는 푸른 계열, 나쁜 변화는 붉은 계열로 구분됩니다. 변화가 없으면 빈 기록으로 표시됩니다.",
        },
        {
          label: "소식 항목",
          description: "발생 DAY, 핵심 제목과 실제 변화를 설명하는 내용을 한 건씩 보여줍니다.",
        },
      ],
    },
    {
      id: "news-days",
      title: "날짜 버튼으로 연쇄 반응을 되짚습니다",
      body:
        "이전 날·다음 날·오늘 버튼을 사용해 금제, 다음 날 입상 변화, 이후 시세 변화처럼 서로 다른 날에 연속으로 도착한 소식을 확인합니다.",
      terms: [
        {
          label: "← 이전 날 / 다음 날 →",
          description: "소식 날짜를 하루씩 앞뒤로 이동합니다.",
        },
        {
          label: "오늘",
          description: "현재 게임 날짜의 소식으로 돌아옵니다.",
        },
        {
          label: "화면 옆 연속 소식",
          description:
            "진행 중 새 변화가 여러 건 생기면 차례로 쌓입니다. 각 알림의 × 버튼으로 읽은 항목을 닫을 수 있습니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const FINANCE_TUTORIAL = {
  tab: "finance",
  label: "재무",
  pages: [
    {
      id: "finance-chart",
      title: "그래프에서 돈과 시장 상태를 함께 읽습니다",
      body:
        "전일 대비 카드는 오늘 매출의 상승·하락률을 보여줍니다. 최대 90일 그래프는 매출, 보유자금, 생태계 건강, 구매 신뢰, 커뮤니티 여론을 같은 날짜 위에서 비교합니다.",
      terms: [
        {
          label: "매출 / 보유자금",
          description:
            "각자 관측 범위가 다른 왼쪽 금액 축을 씁니다. 선의 높이뿐 아니라 축에 적힌 실제 금액을 함께 읽습니다.",
        },
        {
          label: "건강 / 신뢰 / 여론",
          description:
            "오른쪽 점수 축을 공유합니다. 커뮤니티 여론은 50점이 중립이며 높을수록 긍정적입니다.",
        },
        {
          label: "R / B",
          description: "그래프 위 R은 발매일, B는 금제일입니다.",
        },
      ],
    },
    {
      id: "finance-inspection",
      title: "마우스를 올려 정확한 수치와 역행을 확인합니다",
      body:
        "그래프의 날짜에 마우스를 올리면 그날의 매출·자금·건강·신뢰·여론 수치가 크게 표시됩니다. 매출이 급등하는데 환경이 같은 날이나 다음 날 하락하면 붉은 음영과 느낌표가 나타납니다.",
      terms: [
        {
          label: "매출·환경 역행",
          description:
            "판매 성과가 좋아도 환경·신뢰·여론이 버티지 못한 구간입니다. 단기 매출과 장기 후폭풍을 분리해 봅니다.",
        },
        {
          label: "그래프 범례",
          description: "각 선과 음영의 색, 발매·금제 표식을 확인하는 기준입니다.",
        },
      ],
    },
  ],
} as const satisfies TabTutorialDefinition;

const FIRST_RESTRICTION_TUTORIAL = {
  topic: "first-restriction",
  tab: "distribution",
  label: "긴급 금제",
  pages: [
    {
      id: "first-restriction-emergency",
      sectionLabel: "긴급 인수인계",
      targetTab: "distribution",
      title: "오늘, 당신이 금제 책임자로 긴급 투입됐습니다",
      body:
        "전임 책임자의 공백으로 오늘 안에 첫 금제안을 확정해야 합니다. 지금 믿을 수 있는 근거는 현재 입상 분포와 공개된 카드 데이터뿐입니다. 분포에서 이상 징후를 찾고, 카드에서 원인을 확인한 뒤 허용 매수를 정하십시오.",
      terms: [
        {
          label: "오늘의 임무",
          description:
            "문제 테마 확인 → 원인 카드 검토 → 0·1·2·3장 결정 → 금제안 제출 순서로 판결합니다.",
        },
        {
          label: "판단 원칙",
          description:
            "입상 비율이 높다는 사실은 조사 신호일 뿐입니다. 점유율만 보고 테마 전체를 처벌하지 마십시오.",
        },
      ],
    },
    {
      id: "first-restriction-distribution",
      sectionLabel: "분포",
      targetTab: "distribution",
      title: "분포에서 조사할 테마를 고르십시오",
      body:
        "입상 점유율은 최근 7일 대회 입상 자리 가운데 각 테마가 차지한 몫입니다. 상위권이 한 테마에 과도하게 몰렸는지, 여러 테마가 고르게 경쟁하는지 비교해 먼저 살펴볼 테마를 정하십시오.",
      terms: [
        {
          label: "입상 점유율",
          description:
            "어느 테마가 결과를 지배하는지 보여주지만, 어떤 카드가 원인인지는 알려주지 않습니다.",
        },
        {
          label: "테마 선택",
          description:
            "그래프 조각이나 테마 목록을 선택하면 카드 탭의 해당 테마로 이동합니다.",
        },
      ],
    },
    {
      id: "first-restriction-cards",
      sectionLabel: "카드",
      targetTab: "cards",
      title: "카드 데이터로 원인을 확인하고 허용 매수를 정하십시오",
      body:
        "선택한 테마의 전용 카드와 여러 테마가 쓰는 범용 카드를 비교하십시오. 채용률과 평균 투입 매수로 실제 핵심 카드인지 확인하고, 현행 제한에서 몇 장까지 허용할지 결정합니다. 시세는 보유가치와 후폭풍의 근거이지 카드가 강하다는 단독 증거는 아닙니다.",
      terms: [
        {
          label: "채용률",
          description:
            "해당 테마 덱 가운데 이 카드를 사용하는 덱의 비율입니다.",
        },
        {
          label: "평균 매수",
          description:
            "사용하는 덱이 평균 몇 장을 넣는지 보여줍니다. 제한 단계가 실제 덱에 줄 충격을 판단하는 기준입니다.",
        },
        {
          label: "현행 제한",
          description:
            "현재 허용 매수입니다. 3은 유지, 2는 준제한, 1은 제한, 0은 금지입니다.",
        },
        {
          label: "최종 확인",
          description:
            "높은 점유율의 원인 카드인지, 단순히 함께 쓰이는 카드인지 구분한 뒤 금제안을 제출하십시오.",
        },
      ],
    },
  ],
} as const satisfies ContextualTutorialDefinition;

const FIRST_RELEASE_TUTORIAL = {
  topic: "first-release",
  tab: "releases",
  label: "첫 정규 발매",
  pages: [
    {
      id: "first-release-principles",
      title: "발매 파워는 매출과 환경을 함께 움직입니다",
      body:
        "강한 카드는 초기 매출과 채용을 끌어올리기 쉽지만 입상 집중과 환경 피로를 키울 수 있습니다. 약한 카드는 환경을 지키기 쉽지만 상품 반응이 약해질 수 있습니다.",
      terms: [
        {
          label: "확인할 반응",
          description:
            "발매 다음 날부터 분포·카드 시세·커뮤니티·재무를 함께 보며 선택의 결과를 확인합니다.",
        },
      ],
    },
    {
      id: "first-release-selection",
      title: "이번 카드팩의 네 자리를 직접 고릅니다",
      body:
        "신테마·기존 테마 지원·범용을 각각 1종 이상 포함해 4종을 고릅니다. 남는 한 자리는 세 종류 중 현재 전략에 필요한 카드를 더 선택하세요.",
      terms: [
        {
          label: "이후 정기 발매",
          description:
            "신테마·기존 테마 지원·범용을 각각 1종 이상 포함해 4종을 직접 고르며, 남는 한 자리는 세 종류 중 하나를 더 선택합니다.",
        },
      ],
    },
    {
      id: "first-release-power-submit",
      title: "고른 카드의 파워를 조정합니다",
      body:
        "파워는 -3이 가장 약하고, 0이 기본, +3이 가장 강합니다. 강하게 내면 초기 매출과 채용을 끌어올리기 쉽지만, 환경 집중과 구매 신뢰 하락 위험도 커집니다. 구성과 파워를 모두 정한 뒤 발매를 확정하세요.",
    },
  ],
} as const satisfies ContextualTutorialDefinition;

const FIRST_REPRINT_TUTORIAL = {
  topic: "first-reprint",
  tab: "releases",
  label: "첫 재판팩",
  pages: [
    {
      id: "first-reprint-market",
      title: "품귀 카드를 다시 공급할 때입니다",
      body:
        "필수 카드 9장이 높은 가격과 수요를 보이고 있습니다. 후보의 현재가·플레이 수요·출시 후 경과일을 비교해 재판팩에 넣을 3장을 고르십시오.",
      terms: [
        {
          label: "접근성",
          description:
            "재판된 카드의 가격이 내려가면 덱 구축 비용이 낮아지고 신규 플레이어가 들어오기 쉬워집니다.",
        },
        {
          label: "시장 충격",
          description:
            "가격 하락은 최근 구매자와 초판 보유자의 반발을 불러 구매 신뢰를 낮출 수 있습니다.",
        },
      ],
    },
    {
      id: "first-reprint-selection",
      title: "비싼 카드 3종을 하나의 재판팩으로 묶습니다",
      body:
        "예상 가격 하락·접근성 개선·수집가 반발·수혜 테마를 함께 확인하십시오. 이미 강한 테마의 핵심 카드를 싸게 풀면 접근성은 좋아져도 메타 집중은 더 심해질 수 있습니다.",
      terms: [
        {
          label: "후보 9종 / 선택 3종",
          description: "재판팩은 정규팩과 분리되며 신카 4종 자리를 사용하지 않습니다.",
        },
        {
          label: "출시 후 30일",
          description: "출시된 지 30일 이상 지난 카드만 재판 후보가 됩니다.",
        },
      ],
    },
  ],
} as const satisfies ContextualTutorialDefinition;

export const TAB_TUTORIALS: Readonly<
  Record<TabTutorialTabId, TabTutorialDefinition>
> = {
  distribution: DISTRIBUTION_TUTORIAL,
  cards: CARDS_TUTORIAL,
  releases: RELEASES_TUTORIAL,
  operations: OPERATIONS_TUTORIAL,
  community: COMMUNITY_TUTORIAL,
  news: NEWS_TUTORIAL,
  finance: FINANCE_TUTORIAL,
};

export const CONTEXTUAL_TUTORIALS: Readonly<
  Record<ContextualTutorialTopicId, ContextualTutorialDefinition>
> = {
  "first-restriction": FIRST_RESTRICTION_TUTORIAL,
  "first-release": FIRST_RELEASE_TUTORIAL,
  "first-reprint": FIRST_REPRINT_TUTORIAL,
};

export function getTabTutorial(
  tab: TabTutorialTabId,
): TabTutorialDefinition {
  return TAB_TUTORIALS[tab];
}

export function getTabTutorialPages(
  tab: TabTutorialTabId,
): readonly TabTutorialContentPage[] {
  return getTabTutorial(tab).pages;
}

export function createTabTutorialVisitState(
  visitedTabs: readonly TabTutorialTabId[] = [],
): TabTutorialVisitState {
  const visited = new Set(visitedTabs);
  return Object.fromEntries(
    TAB_TUTORIAL_TAB_IDS.map((tab) => [tab, visited.has(tab)]),
  ) as unknown as TabTutorialVisitState;
}

export function shouldOpenTabTutorial(
  tab: TabTutorialTabId,
  visits: TabTutorialVisitState,
  context: TabTutorialContext,
): boolean {
  if (visits[tab]) return false;
  if (context.day === undefined) return true;

  const availability = getHandoverTabAvailability(tab, {
    day: context.day,
    handoverComplete: context.handoverComplete ?? false,
  });
  if (!availability.unlocked) return false;

  // The one-page emergency briefing owns DAY 0. The longer distribution
  // reference remains available on a later visit without delaying the ruling.
  return !(tab === "distribution" && context.day === FIRST_BAN_DAY);
}

export function getFirstVisitTabTutorial(
  tab: TabTutorialTabId,
  visits: TabTutorialVisitState,
  context: TabTutorialContext,
): TabTutorialDefinition | null {
  return shouldOpenTabTutorial(tab, visits, context)
    ? getTabTutorial(tab)
    : null;
}

export function markTabTutorialVisited(
  visits: TabTutorialVisitState,
  tab: TabTutorialTabId,
): TabTutorialVisitState {
  if (visits[tab]) return visits;
  return { ...visits, [tab]: true };
}

export function getContextualTutorial(
  topic: ContextualTutorialTopicId,
): ContextualTutorialDefinition {
  return CONTEXTUAL_TUTORIALS[topic];
}

export function getContextualTutorialPages(
  topic: ContextualTutorialTopicId,
): readonly TabTutorialContentPage[] {
  return getContextualTutorial(topic).pages;
}

export function createContextualTutorialVisitState(
  completedTopics: readonly ContextualTutorialTopicId[] = [],
): ContextualTutorialVisitState {
  const completed = new Set(completedTopics);
  return Object.fromEntries(
    CONTEXTUAL_TUTORIAL_TOPIC_IDS.map((topic) => [
      topic,
      completed.has(topic),
    ]),
  ) as unknown as ContextualTutorialVisitState;
}

export function isContextualTutorialTriggered(
  topic: ContextualTutorialTopicId,
  context: ContextualTutorialContext,
): boolean {
  if (topic === "first-restriction") {
    return context.day === FIRST_BAN_DAY && context.phase === "ban-edit";
  }
  if (topic === "first-release") {
    return (
      context.day === FIRST_RELEASE_DAY &&
      context.phase === "release-edit" &&
      isRegularReleaseDay(context.day)
    );
  }
  return (
    context.day === FIRST_REPRINT_TUTORIAL_DAY &&
    context.phase === "release-edit" &&
    isReprintReleaseDay(context.day)
  );
}

export function shouldOpenContextualTutorial(
  topic: ContextualTutorialTopicId,
  visits: ContextualTutorialVisitState,
  context: ContextualTutorialContext,
): boolean {
  return !visits[topic] && isContextualTutorialTriggered(topic, context);
}

export function markContextualTutorialVisited(
  visits: ContextualTutorialVisitState,
  topic: ContextualTutorialTopicId,
): ContextualTutorialVisitState {
  if (visits[topic]) return visits;
  return { ...visits, [topic]: true };
}

export function isTabTutorialSeriesComplete(
  tabVisits: TabTutorialVisitState,
  contextualVisits: ContextualTutorialVisitState,
): boolean {
  return (
    TAB_TUTORIAL_TAB_IDS.every((tab) => tabVisits[tab]) &&
    CONTEXTUAL_TUTORIAL_TOPIC_IDS.every((topic) => contextualVisits[topic])
  );
}

export function getPendingTutorialPopups(
  activeTab: TabTutorialTabId,
  tabVisits: TabTutorialVisitState,
  contextualVisits: ContextualTutorialVisitState,
  context: ContextualTutorialContext,
): readonly PendingTutorialPopup[] {
  const pending: PendingTutorialPopup[] = [];
  const activeContextualTutorials = CONTEXTUAL_TUTORIAL_TOPIC_IDS.filter(
    (topic) => {
      const tutorial = getContextualTutorial(topic);
      return (
        (tutorial.tab === activeTab ||
          tutorial.pages.some((page) => page.targetTab === activeTab)) &&
        isContextualTutorialTriggered(topic, context)
      );
    },
  );

  // A live decision gets the first and only blocking explanation. The ordinary
  // tab overview can wait until the player returns after submitting it.
  for (const topic of activeContextualTutorials) {
    const tutorial = getContextualTutorial(topic);
    if (shouldOpenContextualTutorial(topic, contextualVisits, context)) {
      pending.push({
        kind: "contextual",
        id: topic,
        label: tutorial.label,
        pages: tutorial.pages,
      });
    }
  }

  if (
    activeContextualTutorials.length === 0 &&
    shouldOpenTabTutorial(activeTab, tabVisits, context)
  ) {
    const tutorial = getTabTutorial(activeTab);
    pending.push({
      kind: "tab",
      id: activeTab,
      label: tutorial.label,
      pages: tutorial.pages,
    });
  }

  return pending;
}
