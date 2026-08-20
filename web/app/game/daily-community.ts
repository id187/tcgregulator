import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import {
  getGenericCard,
  type GenericCardCatalogEntry,
  type GenericCardId,
} from "./generic-card-catalog.ts";
import {
  buildGenericMetaModel,
  selectGenericLimitThemeImpacts,
} from "./generic-card-meta.ts";
import { isInitialGenericReleaseBatch } from "./initial-generic-cards.ts";
import { getPlayKeywordLabel } from "./play-keywords.ts";
import { getThemeCardMarketQuoteAtDay } from "./card-market.ts";
import { getCollectorCardProfile } from "./card-collectibles.ts";
import { getReprintSupplyMultiplier } from "./release-requests.ts";
import {
  BEGINNER_CAMP_COPY,
  COLLECTOR_FAIR_COPY,
  getAnimationPromotionCopy,
  LOCAL_LEAGUE_COPY,
  PACK_ODDS_DETECTED_COPY,
  PACK_ODDS_RUMOR_COPY,
  REPRINT_CAMPAIGN_COPY,
  STORE_TOUR_COPY,
  TOURNAMENT_BACKLASH_COPY,
  TOURNAMENT_SUCCESS_COPY,
  TV_CM_COPY,
  VENTURE_BUSINESS_COPY,
} from "./business-community-copy.ts";
import type {
  VentureActionType,
  VentureRiskFactor,
} from "./business-community-copy.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  LAST_DECISION_DAY,
  PROLOGUE_SEED,
} from "./campaign.ts";
import { interpolateKorean } from "./korean-particles.ts";
import { getStableThemeRandomIdentifier } from "./future-theme-id-migration.ts";
import { getKeywordCommunitySignal } from "./keyword-community.ts";
import {
  getRecentPlacementReport,
  PLACEMENT_WINDOW_DAYS,
} from "./placement-meta.ts";
import type {
  RecentPlacementReport,
  ThemePlacementReport,
} from "./placement-meta.ts";
import { getPublishedRestrictionDecisionSignals } from "./restriction-considerations.ts";
import type {
  RestrictionDecisionSignals,
} from "./restriction-considerations.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionHistoricalOutcome,
} from "./restriction-policy.ts";
import type {
  RestrictionHistoricalOutcome,
  RestrictionPolicyProfile,
} from "./restriction-policy.ts";
import type {
  CommunityCategory,
  CommunityEvent,
  CommunityEventType,
  GameState,
  PartContent,
  RestrictionLimit,
  ThemeContent,
  ThemeId,
} from "./types.ts";

const POSTS_PER_DAY = 20;
const RELEASE_CONTEXT_QUOTA = [16, 12, 8, 5] as const;
const HIGH_ILLUSTRATION_MARKET_PRICE = 50_000;
const HIGH_ILLUSTRATION_COLLECTOR_DEMAND = 80;
const ILLUSTRATION_DISCUSSION =
  /일러|풀아트|팬아트|색감|비주얼|설정화|바인더|카드명|고레어 실물|레어도별|프레임|후가공|인쇄 품질|슬리브|플레이매트|판본별 가공|실물 디자인/;
const RESTRICTION_CONTEXT_QUOTA = [16, 14, 12] as const;
const GENERIC_RESTRICTION_CONTEXT_QUOTA = [18, 16, 14] as const;
const BUSINESS_CONTEXT_QUOTA = {
  "pack-detected": [18, 14, 10, 6],
  "tournament-backlash": [20, 16, 12],
  "tournament-success": [18, 14, 10],
  "pack-rumor": [12],
  "venture-waiting": [8, 5, 3],
  "venture-success": [16, 12, 8, 5],
  "venture-backlash": [20, 16, 12, 8],
  "campaign-backlash": [14, 10, 6],
  animation: [10, 8, 6, 4, 2],
  "tv-cm": [8, 6, 4, 2],
  "store-tour": [8, 6, 4, 2],
  "beginner-camp": [8, 6, 4, 2],
  "local-league": [8, 6, 4, 2],
  "reprint-campaign": [8, 6, 4, 2],
  "collector-fair": [8, 6, 4, 2],
} as const;

const CAMPAIGN_BACKLASH_COPY = [
  "돈은 썼는데 현장에서 체감되는 변화가 없다는 반응이 많다",
  "이번 캠페인은 기대를 크게 걸었던 만큼 역풍도 빠르게 번지는 분위기다",
  "행사 동선과 메시지가 어긋나면서 신규 유저보다 피로감이 먼저 남았다",
  "성과를 장담하던 운영 공지가 하루 만에 비용 대비 효과 논쟁으로 바뀌었다",
  "매장 쪽에서는 준비 부담만 커지고 실제 전환은 약했다는 이야기가 나온다",
  "다음 집행 전에는 현재 환경과 유저 신뢰부터 다시 읽어야 한다는 평가다",
] as const;

function fillCommunityCopy(
  copy: string,
  values: Readonly<Record<string, string>>,
): string {
  return interpolateKorean(copy, values);
}

const ROLE_EXPONENT: Record<PartContent["role"], number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

const COMMUNITY_PART_BY_ID = new Map(
  THEMES.flatMap((theme) =>
    theme.parts.map((part) => [part.id, part] as const),
  ),
);

export type ReleaseReactionProfile = {
  day: number;
  age: number | null;
  heat: number;
  intensity: 0 | 1 | 2 | 3;
  surge: boolean;
  flags: {
    greed: boolean;
    weak: boolean;
    backlash: boolean;
  };
  headline: string;
  themeIds: ThemeId[];
};

type CopyGroup =
  | "meta"
  | "deckbuilding"
  | "counter"
  | "restriction"
  | "fandom"
  | "new-player"
  | "tournament"
  | "finance";

type DailyTemplate = {
  key: string;
  group: CopyGroup;
  category: CommunityCategory;
  type: CommunityEventType;
  text: string;
};

/** Original 64 board voices retained as the baseline of the larger pool. */
const BASE_DAILY_TEMPLATES = [
  {
    key: "meta-01",
    group: "meta",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 점유율 {share}인데 체감상 더 자주 만나는 듯",
  },
  {
    key: "meta-02",
    group: "meta",
    category: "meta",
    type: "theme-popularity",
    text: "요즘 1라운드 시작하면 {theme}부터 의식하게 됨 ㅋㅋ",
  },
  {
    key: "meta-03",
    group: "meta",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 승률보다 판 분포가 더 문제인 거 아님?",
  },
  {
    key: "meta-04",
    group: "meta",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 상대로 후공 잡아도 생각보다 게임 되네",
  },
  {
    key: "meta-05",
    group: "meta",
    category: "meta",
    type: "top-theme-changed",
    text: "이번 주 메타 요약: {theme} 올라오고 {other} 숨 좀 돌림",
  },
  {
    key: "meta-06",
    group: "meta",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 피로도 슬슬 쌓이는데 아직 연구할 건 많다",
  },
  {
    key: "meta-07",
    group: "meta",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme} 유저들 빌드 갈리는 시점이 제일 재밌음",
  },
  {
    key: "meta-08",
    group: "meta",
    category: "meta",
    type: "theme-popularity",
    text: "오늘 매칭 열 판 중 {theme} 몇 번 봤는지 세어 봄",
  },
  {
    key: "deck-01",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} {copies}장 고정 맞음? 한 장 줄여도 안 말리던데",
  },
  {
    key: "deck-02",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme} 초동 비율 몇 장이 제일 안정적임?",
  },
  {
    key: "deck-03",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} 빼고 후공 카드 넣는 리스트 테스트 중",
  },
  {
    key: "deck-04",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme}에서 {part} 잡으면 전개 어디까지 가냐",
  },
  {
    key: "deck-05",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme} 순수축이랑 {other} 의식한 구축 중 뭐가 나음?",
  },
  {
    key: "deck-06",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} 한 장 줄이니까 패는 예뻐지는데 고점이 낮아짐",
  },
  {
    key: "deck-07",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme} 덱리 올림. 사이드 조언 좀",
  },
  {
    key: "deck-08",
    group: "deckbuilding",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} 채용 매수 계속 바뀌네 이게 최적화 맛이지",
  },
  {
    key: "counter-01",
    group: "counter",
    category: "counter",
    type: "counter-found",
    text: "{theme} 상대로 {part} 나올 때까지 기다렸다 끊으면 됨",
  },
  {
    key: "counter-02",
    group: "counter",
    category: "counter",
    type: "counter-rumor",
    text: "{part}에 바로 반응하지 말고 다음 중간다리 보는 게 낫더라",
  },
  {
    key: "counter-03",
    group: "counter",
    category: "counter",
    type: "counter-found",
    text: "{theme} 카운터 찾은 듯 ㅋㅋ {other}식 운영으로 템포 끊김",
  },
  {
    key: "counter-04",
    group: "counter",
    category: "counter",
    type: "counter-adopted",
    text: "{theme} 선공판도 핵심 파츠 하나만 막으면 후속 약함",
  },
  {
    key: "counter-05",
    group: "counter",
    category: "counter",
    type: "counter-found",
    text: "{part} 회수 타이밍에 묘지 견제 넣어 봐라",
  },
  {
    key: "counter-06",
    group: "counter",
    category: "counter",
    type: "counter-adopted",
    text: "{theme} 대응법 영상 보고 왔는데 생각보다 단순하네",
  },
  {
    key: "counter-07",
    group: "counter",
    category: "counter",
    type: "counter-tax",
    text: "다들 {theme} 무섭다는데 사이드 두 장이면 충분한 듯",
  },
  {
    key: "counter-08",
    group: "counter",
    category: "counter",
    type: "counter-adopted",
    text: "{other} 유저가 알려준 {theme} 상대 팁 진짜 잘 먹힌다",
  },
  {
    key: "ban-01",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "이 덱은 테마명보다 {part} 매수부터 보는 게 맞지 않나",
  },
  {
    key: "ban-02",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{part} 3→2면 체감 있겠지만 덱은 살아 있을 듯",
  },
  {
    key: "ban-03",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{theme} 바로 금지 외치는 건 너무 빠름. 카운터 더 보자",
  },
  {
    key: "ban-04",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{theme} 점유율 {share}면 제한 논의 나올 만은 함",
  },
  {
    key: "ban-05",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{part} 1장 되면 순수축만 손해 보는 거 아님?",
  },
  {
    key: "ban-06",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "금제는 세게보다 정확하게 했으면. {theme} 핵심만 건드리자",
  },
  {
    key: "ban-07",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{theme} 결과물보다 초동 쪽 조정이 건강해 보임",
  },
  {
    key: "ban-08",
    group: "restriction",
    category: "restriction",
    type: "restriction-demand",
    text: "{other}까지 같이 피해 보는 금제는 좀 피했으면 좋겠다",
  },
  {
    key: "fan-01",
    group: "fandom",
    category: "release",
    type: "theme-popularity",
    text: "{theme} 일러 취향이라 성능 상관없이 맞춘 사람?",
  },
  {
    key: "fan-02",
    group: "fandom",
    category: "release",
    type: "release-reaction",
    text: "{part} 풀아트 나오면 바로 산다 ㄹㅇ",
  },
  {
    key: "fan-03",
    group: "fandom",
    category: "release",
    type: "theme-popularity",
    text: "{theme} 색감 이번 테마 중 제일 잘 뽑힌 듯",
  },
  {
    key: "fan-04",
    group: "fandom",
    category: "release",
    type: "release-reaction",
    text: "{part} 설정화 보니까 디테일 미쳤네",
  },
  {
    key: "fan-05",
    group: "fandom",
    category: "release",
    type: "theme-popularity",
    text: "{theme} 카드명 통일감 좋아서 바인더 페이지 예쁨",
  },
  {
    key: "fan-06",
    group: "fandom",
    category: "release",
    type: "theme-popularity",
    text: "성능 얘기 말고 {theme} 최애 파츠 하나씩 말해 보자",
  },
  {
    key: "fan-07",
    group: "fandom",
    category: "release",
    type: "theme-popularity",
    text: "{theme} 팬아트 벌써 많네 인기 체감된다",
  },
  {
    key: "fan-08",
    group: "fandom",
    category: "release",
    type: "release-reaction",
    text: "{part} 소환 연출 상상하면 좀 멋있음",
  },
  {
    key: "newbie-01",
    group: "new-player",
    category: "meta",
    type: "theme-popularity",
    text: "뉴비인데 첫 덱으로 {theme} 잡아도 됨? 난도 많이 높음?",
  },
  {
    key: "newbie-02",
    group: "new-player",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} 왜 {copies}장 넣는지 이제 이해함 ㅋㅋ",
  },
  {
    key: "newbie-03",
    group: "new-player",
    category: "meta",
    type: "optimization-rumor",
    text: "{theme} 기본 전개 세 줄 요약 가능?",
  },
  {
    key: "newbie-04",
    group: "new-player",
    category: "finance",
    type: "theme-popularity",
    text: "첫 덱으로 {theme} 맞췄는데 사이드부터 뭐 사야 함?",
  },
  {
    key: "newbie-05",
    group: "new-player",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 미러전에서 선후공 선택 어떻게 해요?",
  },
  {
    key: "newbie-06",
    group: "new-player",
    category: "meta",
    type: "optimization-rumor",
    text: "{part} 효과 순서 자꾸 틀리는데 팁 있음?",
  },
  {
    key: "newbie-07",
    group: "new-player",
    category: "meta",
    type: "theme-popularity",
    text: "입문자 대회에서 {theme} 써 봤는데 생각보다 친절하더라",
  },
  {
    key: "newbie-08",
    group: "new-player",
    category: "finance",
    type: "theme-popularity",
    text: "{other} / {theme} 중 예산 적게 드는 쪽 추천 좀",
  },
  {
    key: "tourney-01",
    group: "tournament",
    category: "meta",
    type: "top-theme-changed",
    text: "오늘 매장 결승 {theme} vs {other}, 마지막 판 진짜 길었다",
  },
  {
    key: "tourney-02",
    group: "tournament",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 4강 리스트 공개됐네 {part} 2장 채용 눈에 띔",
  },
  {
    key: "tourney-03",
    group: "tournament",
    category: "meta",
    type: "top-theme-changed",
    text: "이번 주 지역 대회는 {theme}보다 {other} 쪽이 더 많았음",
  },
  {
    key: "tourney-04",
    group: "tournament",
    category: "meta",
    type: "meta-analysis",
    text: "{theme} 파일럿 숙련도 차이 크게 나는 덱 맞는 듯",
  },
  {
    key: "tourney-05",
    group: "tournament",
    category: "meta",
    type: "meta-analysis",
    text: "스위스 전승 {theme} 리스트 보니까 후공 플랜 확실하네",
  },
  {
    key: "tourney-06",
    group: "tournament",
    category: "meta",
    type: "meta-analysis",
    text: "{part} 한 장으로 탑컷 갈린 경기 봄?",
  },
  {
    key: "tourney-07",
    group: "tournament",
    category: "meta",
    type: "top-theme-changed",
    text: "다음 대회 예상 1티어 {theme}, 복병은 {other} 본다",
  },
  {
    key: "tourney-08",
    group: "tournament",
    category: "meta",
    type: "meta-analysis",
    text: "결승 스트림에서 {theme} 운영 진짜 침착했다",
  },
  {
    key: "price-01",
    group: "finance",
    category: "finance",
    type: "theme-popularity",
    text: "{part} 가격 또 올랐네 재록 소식 없음?",
  },
  {
    key: "price-02",
    group: "finance",
    category: "finance",
    type: "theme-popularity",
    text: "{theme} 맞추려는데 지금 들어가면 너무 비쌈?",
  },
  {
    key: "price-03",
    group: "finance",
    category: "finance",
    type: "release-reaction",
    text: "{theme} 지원 기대감 때문인지 매물 줄어든 느낌",
  },
  {
    key: "price-04",
    group: "finance",
    category: "finance",
    type: "theme-popularity",
    text: "{part} 일반판으로 타협하면 덱값 꽤 내려감",
  },
  {
    key: "price-05",
    group: "finance",
    category: "finance",
    type: "meta-analysis",
    text: "이번 달 제품 매출은 {theme} 덕을 많이 봤을 듯",
  },
  {
    key: "price-06",
    group: "finance",
    category: "finance",
    type: "theme-popularity",
    text: "{other} 파츠 정리하고 {theme} 갈아탈까 고민 중",
  },
  {
    key: "price-07",
    group: "finance",
    category: "finance",
    type: "release-reaction",
    text: "{theme} 핵심 재록하면 뉴비 유입 꽤 늘겠다",
  },
  {
    key: "price-08",
    group: "finance",
    category: "finance",
    type: "theme-popularity",
    text: "예약 판매 순위에 {theme} 보이던데 팬층 탄탄하네",
  },
] as const satisfies readonly DailyTemplate[];

type DailyTemplateTuple = readonly [
  key: string,
  group: CopyGroup,
  category: CommunityCategory,
  type: CommunityEventType,
  text: string,
];

/**
 * Sixteen extra voices in each subject. Together with the baseline this keeps
 * ordinary days on a 192-post cycle instead of repeating after only 64 posts.
 */
const DAILY_TEMPLATE_EXPANSIONS = [
  // Meta and ladder talk ---------------------------------------------------
  ["meta-09", "meta", "meta", "meta-analysis", "{theme} 표본 적을 때 승률만 보고 1티어 찍는 건 좀 성급하지"],
  ["meta-10", "meta", "meta", "theme-popularity", "새벽 랭크랑 저녁 랭크 메타가 아예 다르네. 저녁엔 {theme} 천지임"],
  ["meta-11", "meta", "meta", "meta-analysis", "{theme} 상대로 이기는 판도 매번 진땀이라 승률보다 피로도가 큼"],
  ["meta-12", "meta", "meta", "top-theme-changed", "지난주는 {other}였는데 이번 주는 다들 {theme} 얘기만 하네"],
  ["meta-13", "meta", "meta", "meta-analysis", "상위권만 보면 {theme} 강세인데 중간 구간에서는 잘 안 보이더라"],
  ["meta-14", "meta", "meta", "theme-popularity", "오늘 매장 네 테이블 중 세 테이블이 {theme} 미러전이었음 ㅋㅋ"],
  ["meta-15", "meta", "meta", "meta-analysis", "{theme} 점유율 {share}면 유행인지 고착인지 슬슬 구분할 때 된 듯"],
  ["meta-16", "meta", "meta", "optimization-rumor", "유명 유저가 {theme} 리스트 올린 뒤로 같은 구축만 연속으로 만남"],
  ["meta-17", "meta", "meta", "meta-analysis", "{other}가 {theme} 상대로 괜찮다는 소문 돌자마자 분포 움직이는 거 재밌네"],
  ["meta-18", "meta", "meta", "meta-analysis", "체감 티어표랑 실제 입상표가 이렇게 다른 주도 드물다"],
  ["meta-19", "meta", "meta", "theme-popularity", "{theme} 유저 늘어난 건 성능 때문인지 일러 때문인지 궁금함"],
  ["meta-20", "meta", "meta", "top-theme-changed", "이번 메타 2등 자리가 계속 바뀌네. 오늘은 {other} 쪽인가"],
  ["meta-21", "meta", "meta", "meta-analysis", "{theme} 미러가 많아질수록 선공형보다 후공형이 올라오는 느낌"],
  ["meta-22", "meta", "meta", "meta-analysis", "한 주 전 데이터로 지금 환경 설명하려니 벌써 안 맞는 부분이 많다"],
  ["meta-23", "meta", "meta", "theme-popularity", "{theme} 안 만난 날이 더 기억에 남는 단계까지 왔네"],
  ["meta-24", "meta", "meta", "meta-analysis", "결국 {theme} 하나보다 그 덱을 의식한 카드들이 환경을 더 바꾸는 듯"],

  // Deckbuilding and lab notes --------------------------------------------
  ["deck-09", "deckbuilding", "meta", "optimization-rumor", "{part} 3장 넣으면 겹치고 2장 넣으면 안 보임. 확률이 나만 싫어함"],
  ["deck-10", "deckbuilding", "meta", "optimization-rumor", "{theme} 후공형 굴려 본 사람? 선공 파츠 어디까지 덜어냄?"],
  ["deck-11", "deckbuilding", "meta", "optimization-rumor", "샘플 핸드 백 번 돌렸는데 {part} {copies}장이 제일 덜 말린다"],
  ["deck-12", "deckbuilding", "meta", "optimization-rumor", "{part}는 초동보다 후속 가치 때문에 빼면 안 되는 카드 같음"],
  ["deck-13", "deckbuilding", "meta", "optimization-rumor", "{theme} 엑스트라 한 자리 남는데 {other}전용 카드 넣을 만함?"],
  ["deck-14", "deckbuilding", "meta", "optimization-rumor", "유행 리스트 그대로 복사했더니 내 매장 메타에는 안 맞네"],
  ["deck-15", "deckbuilding", "meta", "optimization-rumor", "{part} 한 장 스타트 기준 최소 전개 루트 정리해 봄"],
  ["deck-16", "deckbuilding", "meta", "optimization-rumor", "패트랩 늘리니까 {theme}답게 굴러가는 판이 줄어서 고민이다"],
  ["deck-17", "deckbuilding", "meta", "optimization-rumor", "{other} 많이 보이면 {part} 세 장, 아니면 두 장이 맞는 것 같음"],
  ["deck-18", "deckbuilding", "meta", "optimization-rumor", "고점 포기하고 안정성 챙긴 {theme} 리스트가 오히려 승률 잘 나오네"],
  ["deck-19", "deckbuilding", "meta", "optimization-rumor", "{part} 없이 굴리는 구축 봤는데 생각보다 자원 싸움이 좋더라"],
  ["deck-20", "deckbuilding", "meta", "optimization-rumor", "메인 덱 41장 못 참는 병 있는데 이번 {theme}는 진짜 안 줄어듦"],
  ["deck-21", "deckbuilding", "meta", "optimization-rumor", "사이드 교체하고 나면 {theme} 카드가 너무 적어지는 거 나만 불안함?"],
  ["deck-22", "deckbuilding", "meta", "optimization-rumor", "{part} 두 장째가 이기는 판보다 첫 장이 썩는 판이 더 많아서 뺐음"],
  ["deck-23", "deckbuilding", "meta", "optimization-rumor", "{theme} 장기전 플랜 챙기니까 빠른 덱 상대로 오히려 승률 떨어지네"],
  ["deck-24", "deckbuilding", "meta", "optimization-rumor", "덱리 열 장 바꾸고 결국 첫날 구축으로 돌아옴. 최적화 어렵다"],

  // Counterplay, matchup, and side-deck talk ------------------------------
  ["counter-09", "counter", "counter", "counter-found", "{theme} 첫 효과보다 두 번째 연결에 끊는 게 훨씬 아프더라"],
  ["counter-10", "counter", "counter", "counter-rumor", "{part} 막고 안심했는데 묘지에서 다시 시작함. 다음엔 거기 본다"],
  ["counter-11", "counter", "counter", "counter-adopted", "{theme}전은 카드 한 장보다 견제 순서가 더 중요한 매치업 같음"],
  ["counter-12", "counter", "counter", "counter-found", "후공에서 {theme} 잡으려면 한 번에 밀지 말고 자원부터 말려야 함"],
  ["counter-13", "counter", "counter", "counter-tax", "{theme} 하나 때문에 사이드 세 칸 고정되는 게 진짜 세금이지"],
  ["counter-14", "counter", "counter", "counter-rumor", "{other}로 {theme} 상대할 때 선후공 사이드 플랜 공유해 줄 사람"],
  ["counter-15", "counter", "counter", "counter-found", "{part}에 견제 던지는 척하고 후속에 박으니 바로 멈추네"],
  ["counter-16", "counter", "counter", "counter-adopted", "매장 고수한테 {theme}전 배웠더니 못 이길 덱은 아니었음"],
  ["counter-17", "counter", "counter", "counter-found", "묘지 건드리는 것보다 손패 보충 타이밍을 막는 게 더 잘 먹힌다"],
  ["counter-18", "counter", "counter", "counter-rumor", "{theme} 카운터라고 올라온 리스트 정작 다른 덱을 하나도 못 잡네"],
  ["counter-19", "counter", "counter", "counter-adopted", "{part} 보이면 바로 누르던 습관 고치니까 매치 승률 좀 올랐음"],
  ["counter-20", "counter", "counter", "counter-tax", "사이드 두 장으로 충분하다더니 세 장 넣어도 안 잡히잖아 ㅋㅋ"],
  ["counter-21", "counter", "counter", "counter-found", "{theme}는 첫 판보다 두 번째 판부터 대응이 훨씬 쉬운 타입인 듯"],
  ["counter-22", "counter", "counter", "counter-rumor", "{other} 엔진이 {theme} 후속 끊는 데 좋다는데 실제로 써 본 사람?"],
  ["counter-23", "counter", "counter", "counter-adopted", "결과물 치우는 데 집중하지 말고 {part} 회수부터 막아 봐라"],
  ["counter-24", "counter", "counter", "counter-found", "오늘 열 판 실험 결과 {theme}전은 욕심 안 내는 쪽이 이김"],

  // Restriction debate -----------------------------------------------------
  ["ban-09", "restriction", "restriction", "restriction-demand", "{theme} 전부 건드리지 말고 반복 루트 만드는 {part}만 보면 될 듯"],
  ["ban-10", "restriction", "restriction", "restriction-demand", "점유율만 높다고 자르면 다음 유행 덱도 같은 기준으로 자를 거임?"],
  ["ban-11", "restriction", "restriction", "restriction-demand", "{part} 준제한안은 실제 채용 매수를 줄일 수 있는지부터 따져야 함"],
  ["ban-12", "restriction", "restriction", "restriction-demand", "{theme}보다 범용 파츠 쪽을 손보는 게 피해가 더 큰가 더 작은가"],
  ["ban-13", "restriction", "restriction", "restriction-demand", "승률이 아니라 게임 양상이 문제면 금제 근거도 따로 설명해야지"],
  ["ban-14", "restriction", "restriction", "restriction-demand", "{part} 제한 전에 대체 루트가 몇 개인지부터 확인했으면"],
  ["ban-15", "restriction", "restriction", "restriction-demand", "지금 {theme} 자르면 빈자리에서 {other}가 더 세지는 것까지 봐야 함"],
  ["ban-16", "restriction", "restriction", "restriction-demand", "금지 한 장보다 준제 여러 장이 덱은 살리고 체급은 낮추기 좋지 않나"],
  ["ban-17", "restriction", "restriction", "restriction-demand", "금제 주기 길면 보수적으로 볼 게 아니라 더 정확하게 볼 필요가 있음"],
  ["ban-18", "restriction", "restriction", "restriction-demand", "{theme} 피로도 달래려고 의미 없는 한 장만 건드리는 건 싫다"],
  ["ban-19", "restriction", "restriction", "restriction-demand", "대회 한 번 휩쓸었다고 바로 자르는 것도, 몇 달 방치하는 것도 둘 다 별로임"],
  ["ban-20", "restriction", "restriction", "restriction-demand", "{part} 해제 후보 얘기는 아무도 안 하네. 오래된 금제도 같이 보자"],
  ["ban-21", "restriction", "restriction", "restriction-demand", "순수 {theme}보다 출장축이 문제면 제한 방식도 그쪽을 겨냥해야 함"],
  ["ban-22", "restriction", "restriction", "restriction-demand", "금제 후에도 같은 패턴 남으면 숫자만 바꾼 의미가 없지"],
  ["ban-23", "restriction", "restriction", "restriction-demand", "{theme} 유저도 납득할 수 있게 실제 채용률이랑 승률 같이 공개해 줬으면"],
  ["ban-24", "restriction", "restriction", "restriction-demand", "환경 다양해지는 금제면 환영인데 단순히 1등만 바꾸는 건 싫음"],

  // Fandom, art, and collecting -------------------------------------------
  ["fan-09", "fandom", "release", "theme-popularity", "{theme} 설정 정리글 읽고 카드 텍스트가 다르게 보이기 시작함"],
  ["fan-10", "fandom", "release", "release-reaction", "{part} 고레어 실물 사진 봤냐. 화면보다 훨씬 예쁘네"],
  ["fan-11", "fandom", "release", "theme-popularity", "성능은 모르겠고 {theme} 슬리브 나오면 덱부터 맞춘다"],
  ["fan-12", "fandom", "release", "theme-popularity", "{theme} 카드 순서대로 놓으니까 일러가 한 장면처럼 이어짐"],
  ["fan-13", "fandom", "release", "release-reaction", "{part} 배경에 {other} 상징 숨어 있다는 해석 진짜임?"],
  ["fan-14", "fandom", "release", "theme-popularity", "공식보다 팬들이 만든 {theme} 토큰 디자인이 더 취향이다"],
  ["fan-15", "fandom", "release", "theme-popularity", "최애 테마 입상보다 신규 일러 한 장 뜬 게 더 기쁜 사람 여기 있음"],
  ["fan-16", "fandom", "release", "release-reaction", "{part} 카드명 소리 내서 읽으면 어감까지 잘 맞는다"],
  ["fan-17", "fandom", "release", "theme-popularity", "{theme} 덱 박스 직접 꾸몄는데 카드보다 손이 더 많이 갔음"],
  ["fan-18", "fandom", "release", "release-reaction", "이번 {theme} 일러레 인터뷰 있으면 꼭 보고 싶다"],
  ["fan-19", "fandom", "release", "theme-popularity", "{theme} 팬덤은 성능 떨어져도 창작 글이 계속 올라와서 좋음"],
  ["fan-20", "fandom", "release", "release-reaction", "{part} 플레이매트 나오면 가격 상관없이 예약할 듯"],
  ["fan-21", "fandom", "release", "theme-popularity", "카드 뒷이야기 알고 나니 {theme} 에이스 빼기가 더 어려워짐"],
  ["fan-22", "fandom", "release", "release-reaction", "{theme} 색 조합으로 맞춘 슬리브 사진 올림. 생각보다 잘 어울린다"],
  ["fan-23", "fandom", "release", "theme-popularity", "{other} 좋아하던 친구가 {theme} 일러 보고 바로 넘어옴 ㅋㅋ"],
  ["fan-24", "fandom", "release", "release-reaction", "대회 성적 글보다 {part} 팬아트에 댓글이 더 많이 달렸네"],

  // New-player questions ---------------------------------------------------
  ["newbie-09", "new-player", "meta", "theme-popularity", "완전 처음인데 {theme} 덱 사면 기본 카드부터 다 들어 있나요?"],
  ["newbie-10", "new-player", "meta", "optimization-rumor", "{part} 효과 한 턴에 한 번인지 카드마다 한 번인지 헷갈려요"],
  ["newbie-11", "new-player", "finance", "theme-popularity", "예산 적으면 {theme} 핵심부터 사고 범용은 나중에 맞춰도 됨?"],
  ["newbie-12", "new-player", "meta", "optimization-rumor", "연습할 때 {theme} 기본 루트 하나만 외워도 매장 가도 될까요"],
  ["newbie-13", "new-player", "meta", "meta-analysis", "티어표에서 {theme} 높은데 조작 난도까지 고려한 순위인가요?"],
  ["newbie-14", "new-player", "finance", "theme-popularity", "{part} 비싸서 한 장만 샀는데 대체 카드 추천 부탁드립니다"],
  ["newbie-15", "new-player", "meta", "theme-popularity", "첫 매장 대회 나가려는데 {theme}로 시간 안 넘기는 팁 있나요"],
  ["newbie-16", "new-player", "meta", "optimization-rumor", "상대 {part} 나왔을 때 어느 효과부터 확인해야 하는지 알려 주세요"],
  ["newbie-17", "new-player", "meta", "theme-popularity", "{theme}랑 {other} 둘 다 재밌어 보여서 일주일째 첫 덱 못 고르는 중"],
  ["newbie-18", "new-player", "finance", "theme-popularity", "중고 덱 코어 살 때 {theme} 파츠 누락 뭐부터 체크함?"],
  ["newbie-19", "new-player", "meta", "optimization-rumor", "덱리에는 {part} {copies}장인데 시작 패에 꼭 필요한 카드는 아닌 거죠?"],
  ["newbie-20", "new-player", "meta", "meta-analysis", "매치 두 번째 판부터 뭘 빼야 할지 모르겠는데 기준이 있나요"],
  ["newbie-21", "new-player", "meta", "theme-popularity", "친구가 {theme} 빌려줘서 해 봤는데 생각보다 룰 설명이 잘 되더라"],
  ["newbie-22", "new-player", "finance", "theme-popularity", "고레어 말고 최저가로 {theme} 맞추면 대략 얼마쯤 들어요?"],
  ["newbie-23", "new-player", "meta", "optimization-rumor", "{part} 처리 순서 실수했을 때 상대에게 바로 물어봐도 괜찮나요"],
  ["newbie-24", "new-player", "meta", "theme-popularity", "첫 승을 {theme}로 해서 그런지 다른 덱으로 못 갈아타겠음 ㅋㅋ"],

  // Tournament reports -----------------------------------------------------
  ["tourney-09", "tournament", "meta", "meta-analysis", "스위스에서는 {theme} 많았는데 탑컷에는 {other}가 더 남았네"],
  ["tourney-10", "tournament", "meta", "top-theme-changed", "지역 예선 1위 {theme} 덱리, 정석이랑 열 장이나 다름"],
  ["tourney-11", "tournament", "meta", "meta-analysis", "피처 매치에서 {part} 끝까지 아낀 판단이 진짜 좋았다"],
  ["tourney-12", "tournament", "meta", "meta-analysis", "{theme} 사용자는 많았는데 미러 준비한 쪽만 상위에 남은 듯"],
  ["tourney-13", "tournament", "meta", "top-theme-changed", "이번 매장 메타콜은 {other}였네. {theme} 예상한 사람들 다 잡음"],
  ["tourney-14", "tournament", "meta", "meta-analysis", "결승 세 판 전부 장기전 간 거 보면 환경이 생각보다 느려졌음"],
  ["tourney-15", "tournament", "meta", "meta-analysis", "{part} 사이드 투입률 높더니 실제 탑컷에서도 계속 활약하네"],
  ["tourney-16", "tournament", "meta", "top-theme-changed", "지난 대회 0명이던 {theme}가 이번엔 최다 사용이라니 변화 빠르다"],
  ["tourney-17", "tournament", "meta", "meta-analysis", "{theme} 전승 리스트는 고점보다 매치업 분배가 진짜 영리함"],
  ["tourney-18", "tournament", "meta", "meta-analysis", "타이브레이커 때문에 떨어졌지만 오늘 제일 인상적인 덱은 {other}였음"],
  ["tourney-19", "tournament", "meta", "top-theme-changed", "상위 테이블 갈수록 {theme} 비율 올라가는 게 눈에 보이더라"],
  ["tourney-20", "tournament", "meta", "meta-analysis", "결승 다시 보는데 첫 판 사이드 정보 숨긴 운영이 승부 갈랐네"],
  ["tourney-21", "tournament", "meta", "meta-analysis", "{part} 1장 채용 리스트가 두 개나 입상했으면 우연은 아닌 듯"],
  ["tourney-22", "tournament", "meta", "top-theme-changed", "다음 주에는 {theme} 잡으려는 {other}가 더 늘어날 것 같다"],
  ["tourney-23", "tournament", "meta", "meta-analysis", "매장 대회랑 대형 대회에서 {theme} 성적 차이 나는 이유가 뭘까"],
  ["tourney-24", "tournament", "meta", "meta-analysis", "오늘 우승 인터뷰 요약: 덱보다 실수 안 하는 게 제일 중요하대"],

  // Prices, stock, and trades ---------------------------------------------
  ["price-09", "finance", "finance", "theme-popularity", "{theme} 덱 코어 매물은 많은데 {part}만 따로 구하기 어렵네"],
  ["price-10", "finance", "finance", "release-reaction", "발매 첫날 가격 보고 참았더니 {part}가 더 올랐음. 타이밍 망했다"],
  ["price-11", "finance", "finance", "theme-popularity", "{other} 재록 발표 뒤에 {theme} 쪽으로 거래 수요가 옮겨간 느낌"],
  ["price-12", "finance", "finance", "theme-popularity", "고레어 포기하고 최저 레어로 맞추니 {theme} 덱값 절반 됨"],
  ["price-13", "finance", "finance", "release-reaction", "예약가보다 발매일 매장가가 싼 건 오랜만에 보네"],
  ["price-14", "finance", "finance", "theme-popularity", "{part} 재록 가능성 있으면 지금 사는 게 맞나 한 달 기다리는 게 맞나"],
  ["price-15", "finance", "finance", "meta-analysis", "입상 한 번에 {theme} 매물 가격이 바로 반응하는 거 무섭다"],
  ["price-16", "finance", "finance", "theme-popularity", "덱 처분 글은 늘었는데 완성 덱 가격은 왜 그대로임?"],
  ["price-17", "finance", "finance", "release-reaction", "{part} 초판이랑 재판 색감 차이 때문에 또 둘 다 사고 싶어짐"],
  ["price-18", "finance", "finance", "theme-popularity", "{theme} 입문 비용 계산해 보니 범용 카드가 덱 코어보다 더 비싸네"],
  ["price-19", "finance", "finance", "theme-popularity", "매장 세 곳 돌아도 {part} 품절이라 결국 교환으로 구했다"],
  ["price-20", "finance", "finance", "release-reaction", "성능 평가는 내려갔는데 {theme} 일러 수요 때문에 가격은 버티는 중"],
  ["price-21", "finance", "finance", "theme-popularity", "{other} 갈아타려다 매입가 보고 그냥 {theme} 계속 하기로 함"],
  ["price-22", "finance", "finance", "theme-popularity", "지금 {part} 사는 사람은 실사용인지 수집인지 비율 궁금하다"],
  ["price-23", "finance", "finance", "release-reaction", "지원 공개 전부터 {theme} 옛 파츠 사재기하는 건 너무 빠른 거 아님?"],
  ["price-24", "finance", "finance", "theme-popularity", "덱값은 올랐는데 매장에 실제 {theme} 유저는 생각보다 안 늘었네"],
] as const satisfies readonly DailyTemplateTuple[];

const DAILY_TEMPLATE_CATALOG: readonly DailyTemplate[] = [
  ...BASE_DAILY_TEMPLATES,
  ...DAILY_TEMPLATE_EXPANSIONS.map(
    ([key, group, category, type, text]) => ({
      key,
      group,
      category,
      type,
      text,
    }),
  ),
];

const DAILY_TEMPLATE_GROUP_ORDER: readonly CopyGroup[] = [
  "meta",
  "deckbuilding",
  "counter",
  "restriction",
  "fandom",
  "new-player",
  "tournament",
  "finance",
];

function dailyTemplateOrdinal(template: DailyTemplate): number {
  return Number(template.key.slice(template.key.lastIndexOf("-") + 1));
}

/** Round-robin subjects so every ordinary board mixes all eight conversations. */
const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  ...DAILY_TEMPLATE_CATALOG,
].sort((left, right) => {
  const ordinal = dailyTemplateOrdinal(left) - dailyTemplateOrdinal(right);
  if (ordinal !== 0) return ordinal;
  return (
    DAILY_TEMPLATE_GROUP_ORDER.indexOf(left.group) -
    DAILY_TEMPLATE_GROUP_ORDER.indexOf(right.group)
  );
});

const STRONG_RELEASE_COPY = [
  "{theme} 이걸 3장씩 쓰라고 냈다고? 돈에 미쳤네 ㅋㅋㅋ",
  "발매 직후인데 {theme} 아닌 덱은 시작부터 한 단계 아래네",
  "{part} 한 장 통과하면 게임 끝나는 게 맞음?",
  "신테마 팔아야 하는 건 알겠는데 체급을 이렇게 올리면 어떡함",
  "다음 금제까지 {theme} 상대하라고? 너무 노골적이다",
  "또 파워 인플레 시작이네. 기존 테마 지원은 왜 했냐",
  "예상 상위 티어를 진짜 그대로 출시하네",
  "센 건 맞는데 손맛 미쳤다. 오늘 매칭 전부 {theme}임",
  "매출 그래프는 웃고 유저들은 우는 발매",
  "이번 달 매출 필요하다고 밸런스를 상품에 붙이면 어떡함",
  "{theme} 첫날부터 사이드 열 칸을 혼자 먹는데 이게 정상 발매냐",
  "{part} 막느냐 못 막느냐로 승패 갈리는 건 카드 한 장 책임이 너무 크다",
  "신상품 체험이 아니라 신상품한테 두들겨 맞는 기간이 시작됐네",
  "출시 방송에서 보던 고점이 실전에서도 매 판 나오면 수치 잘못 잡은 거지",
  "{theme} 미러가 제일 공정한 매치업이라는 말부터 벌써 무섭다",
  "연구할 틈도 없이 완성형으로 나온 덱은 결국 환경이 대신 실험해 줌",
  "상위권 예상은 했는데 기존 덱 전부 한 칸씩 밀어낼 정도일 줄은 몰랐다",
  "팩 뜯는 사람은 신났고 대회 준비하는 사람은 사이드부터 갈아엎는 중",
] as const;

const WEAK_RELEASE_COPY = [
  "{theme} 이걸 돈 주고 맞추라고 낸 거 맞음?",
  "약하게 내면 누가 사냐? 발매 전부터 지원 기다리게 생겼네",
  "{part} 잡아도 할 게 없는데 카드 일러만 보라는 건가",
  "기존 테마보다 약한 신테마를 30일 메인 상품으로 냈네",
  "{theme} 첫날 덱리보다 매물 글이 더 많음 ㅋㅋ",
  "파워 인플레 피한 건 좋은데 최소한 굴러가게는 내야지",
  "성능은 애매한데 일러 때문에 사는 사람은 많을 듯",
  "연구 덜 된 거 아님? 벌써 약하다고 단정하긴 이르다",
  "다음 지원으로 완성시키려는 반쪽 설계 같음",
  "약하게 내면 안 팔리고 세게 내면 욕먹고, 그래도 이건 너무 약함",
  "{theme} 테스트 핸드 열 번 돌렸는데 하고 싶은 게 뭔지 아직도 모르겠다",
  "초동은 잡히는데 도착점이 약하면 안정적인 게 무슨 소용임",
  "{part} 효과 읽을 때가 제일 강하고 실제로 내면 바로 애매해짐",
  "발매 방송에서조차 콤보보다 일러 얘기가 더 길었던 이유가 있었네",
  "가격만 신테마고 성능은 몇 년 전 카드군 수준이다",
  "비주류 장인들이 연구해도 답 없다고 하면 진짜 심각한 거 아님?",
  "첫 주 입상 하나 나오면 기적 취급받을 분위기네",
  "신테마인데 상대가 효과를 안 읽고도 이기는 건 너무 슬프다",
] as const;

const BALANCED_RELEASE_COPY = [
  "신카드 발매일 특유의 덱리 쏟아지는 분위기 좋다",
  "{theme} 정답 구축 아직 없는 것 같아서 더 재밌음",
  "{part} 2장파 vs 3장파 벌써 싸우고 있네",
  "세긴 한데 카운터 여지도 보여서 첫인상은 괜찮음",
  "오늘 처음 봤는데 {theme} 연출 맛있다",
  "이번 발매 셋 중 뭐 맞출지 진짜 고민된다",
  "평가가 극과 극이라 주말 대회가 기대됨",
  "{theme} 첫 판부터 체급이 바로 느껴지는데?",
  "강점은 분명하고 약점도 보여서 덱 짜는 사람 실력 따라 갈릴 듯",
  "{theme} 숙련도 쌓이면 한 단계 오르겠지만 지금도 충분히 할 만하다",
  "{part}를 몇 장 쓰느냐에 따라 안정성과 고점이 제대로 갈리네",
  "사이드로 막을 수는 있는데 그만큼 주류 덱 자리는 받을 것 같음",
  "가격만 너무 안 오르면 입문용으로 추천하기 괜찮아 보인다",
  "미러전도 운영 싸움이라 발매 초반치고 보는 맛 있네",
  "강하다는 쪽도 약하다는 쪽도 근거가 있어서 결과 나오기 전엔 모르겠다",
  "기존 환경을 밀어내진 않고 새 선택지 하나 들어온 느낌이라 좋음",
] as const;

const GENERIC_RELEASE_COPY = [
  [
    "{card} 공개되자마자 {keyword} 파츠 쓰는 덱들이 전부 덱리 다시 짜는 중",
    "신테마보다 {card} 어디에 넣을지가 오늘 제일 큰 얘깃거리네",
    "{card} 한 장을 여러 덱이 같이 연구하니까 첫날 리스트가 전부 다르다",
    "자기 덱을 겨냥한 카드인데 미러전 때문에 본인들도 {card} 넣는 게 웃기네",
    "{keyword} 축 아니어도 {card}를 쓸 수 있어서 채용 범위가 예상보다 넓다",
    "전용 지원 셋보다 범용 한 장인 {card} 매물이 먼저 마를 분위기임",
    "오늘 공개 카드 중 검색량 1위가 신테마가 아니라 {card}인 게 범용 영향력이지",
    "{card} 세 장 확보하고 나서 어느 덱에 넣을지 고민하는 순서가 돼버렸네",
    "{keyword} 카드인데 상대하는 덱까지 {card}를 채용하는 건 예상 못 했다",
    "매장 테스트 테이블마다 덱은 다른데 {card}만 똑같이 보임",
    "첫날부터 {card} 채용 찬반으로 기존 덱 커뮤니티가 전부 갈라졌다",
    "범용 신카드는 한 테마 평가가 아니라 카드풀 전체 평가를 다시 하게 만드네",
  ],
  [
    "하루 지나니 {card}를 가장 잘 쓰는 덱이 공개 때 예상한 쪽이 아니네",
    "{card} 한 장 때문에 기존 덱들의 남는 세 자리가 완전히 달라졌다",
    "강한 덱도 자기 미러 대비로 {card}를 넣기 시작했네",
    "어제는 {keyword} 전용처럼 보였는데 오늘은 온갖 덱에서 {card}가 나온다",
    "{card} 채용 덱은 늘었는데 몇 장이 정답인지는 아직도 의견이 갈림",
    "범용은 연구가 퍼지는 속도부터 테마 카드와 확실히 다르구나",
    "하루 만에 {card} 미채용 리스트가 오히려 설명을 요구받는 분위기네",
    "{card} 넣으려고 기존 필수 파츠를 두 장으로 줄이는 덱까지 나왔다",
    "처음엔 후공 카드인 줄 알았는데 선공 전개에도 {card} 쓰는 법이 퍼지는 중",
    "{keyword} 상성보다 카드 자체 체급 때문에 넣는 덱이 더 많은 것 같다",
    "어제 품절된 {card}가 오늘 더 비싸게 다시 올라왔네",
    "같은 {card}라도 덱마다 쓰는 타이밍이 완전히 달라서 보는 맛 있다",
  ],
  [
    "사흘차 {card} 채용률을 보니 메타가 어느 덱을 의식하는지 바로 보인다",
    "처음 외면받던 덱이 {card} 덕분에 다시 대회 목록에 올라오기 시작했네",
    "{keyword} 플랜을 공유하는 덱끼리도 {card} 쓰는 방식이 꽤 다르다",
    "카운터용으로 낸 줄 알았던 {card}가 상위 덱 강화 파츠가 될 수도 있겠는데",
    "{card} 넣을 세 자리를 만들려고 기존 카드 비율을 줄이는 덱이 많아졌다",
    "첫날 고평가보다 실제로 여러 덱에 남는지가 범용 카드의 판정 기준인 듯",
    "사흘 돌려보니 {card}는 약한 덱 구제보다 강한 덱 고점 보강에 더 가까워 보임",
    "{card} 때문에 사이드에 같은 카드 카운터를 넣는 이상한 순환이 생겼네",
    "처음엔 세 장 고정이었는데 두 장만 쓰는 리스트가 입상하면서 논쟁 다시 시작",
    "{keyword} 덱이 아니어도 특정 매치업 하나 때문에 {card}를 챙기더라",
    "범용 슬롯 경쟁에서 밀린 옛 카드들 가격이 같이 내려가는 중",
    "{card} 채용률과 승률이 같이 오르는지 이제 대회 데이터로 볼 때다",
  ],
  [
    "나흘 지나니 {card}는 필수축과 선택축이 어느 정도 갈린 것 같다",
    "{card} 연구가 굳으면서 처음 예상 못 한 채용 테마가 살아남았네",
    "이제 {card}를 쓰느냐보다 어느 대진에서 꺼내느냐가 더 중요해 보임",
    "{keyword} 덱만의 카드가 아니라는 점이 결국 가장 큰 변수였다",
    "{card}가 여러 덱에 남으니 제한 이야기도 한 테마 기준으로는 못 하겠다",
    "신선함은 빠졌는데도 {card}가 계속 보이면 카드풀 자체를 바꾼 셈이지",
    "나흘차에도 {card}가 덱마다 두세 장이면 유행이 아니라 새 표준에 가깝다",
    "정답 구축이 굳어도 {card}를 빼는 쪽과 넣는 쪽 성적 차이는 더 봐야 함",
    "처음 예상한 카운터 용도보다 공용 전개 보조로 더 오래 남는 분위기네",
    "{card} 덕에 살아난 덱도 있지만 원래 강한 덱이 더 좋아진 사례도 많다",
    "이 정도 잔존율이면 다음 금제 검토 때 채용 테마 수부터 봐야겠는데",
    "한 팩 범용 한 장이 한 달 메타를 대표할 수도 있다는 게 증명되는 중",
  ],
] as const;

const GENERIC_RELEASE_ART_COPY = [
  [
    "{card} 실물 보자마자 성능 확인 전에 한 장은 확보했다",
    "범용 카드인데 {keyword} 분위기를 일러에 이렇게 담았네",
    "{card}는 어느 덱 슬리브에 넣어도 존재감이 확실하겠다",
    "{card} 풀아트 공개되자마자 플레이용과 소장용 따로 산 사람 많네",
    "효과는 범용인데 그림은 설정집 한 장처럼 꽉 차 있어서 좋다",
    "{keyword} 상징을 카드 프레임까지 이어 놓은 디테일 마음에 듦",
  ],
  [
    "{card} 레어도별 색감 비교 사진 보니까 전부 모으고 싶다",
    "어제 효과로 샀는데 오늘은 {card} 일러 때문에 한 장 더 샀음",
    "범용이라 자주 보이는데도 {card} 비주얼은 쉽게 안 질리네",
    "{card} 실제 인쇄는 공개 이미지보다 색이 깊어서 만족스럽다",
    "덱마다 슬리브는 다른데 {card} 한 장만 유난히 눈에 들어오네",
    "레어도 낮아도 일러 면적 넓어서 플레이용 판본도 충분히 예쁘다",
  ],
  [
    "{card} 배경에 {keyword} 설정 암시가 있다는 해석 재밌다",
    "성능 얘기 끝나도 {card} 일러 확대 글은 계속 올라오네",
    "여러 덱에서 같은 {card}가 보이니 대표 카드 느낌까지 생긴다",
    "{card} 배경 인물이 다음 테마 떡밥이라는 해석까지 나왔네",
    "사흘째 성능 글보다 판본별 가공 비교 글이 더 오래 살아남는다",
    "자주 보는 범용일수록 애니메이션과 일러 품질이 중요한 듯",
  ],
  [
    "메타 평가는 갈려도 {card} 실물 디자인 평가는 오래 남겠네",
    "{card} 한 장 중심으로 바인더 페이지 꾸민 사진 진짜 예쁘다",
    "범용 카드가 성능과 수집 수요를 같이 잡은 사례가 될 듯",
    "나흘 지나도 {card} 고레어 매물은 플레이 가격과 따로 움직이네",
    "성능 때문에 산 세 장 중 한 장을 결국 바인더로 옮겼다",
    "범용 대표 카드가 되니 일러 상품화 요청까지 빠르게 붙는구나",
  ],
] as const;

const REPRINT_PRICE_CRASH_COPY = [
  "{card} 재판 뜨자마자 {oldPrice}에서 {newPrice}까지 내려온 거 실화냐",
  "재판 때문에 {card} 가격 {dropRate}% 폭락했다. 어제 산 사람은 잠 못 자겠네",
  "{card} 매입가부터 반 토막 난 거 보니 공급 충격이 바로 오긴 한다",
  "어제 {oldPrice}에 샀는데 오늘 재록 발표 보고 {newPrice} 됨 ㅋㅋ",
  "{card} 시세 그래프가 카드 효과보다 더 강하게 내려꽂혔네",
  "재판 물량 풀리자마자 판매 글 가격 경쟁 붙어서 계속 내려가는 중",
  "{theme} 덱값의 절반이 {card}였는데 재록 한 번에 견적이 확 줄었다",
  "이 정도면 가격 조정이 아니라 {card} 보유자 강제 이벤트다",
  "{card} 일반판은 {newPrice}, 초판 프리미엄은 버티는지 이제 판본 싸움 시작임",
  "재판 발표 전에 매입한 매장은 {card} 재고 가격 다시 붙이느라 난리겠네",
  "중고 장터 {card} 판매글이 한 시간마다 더 싸지는 중",
  "가격이 {dropRate}% 빠졌으면 기다린 사람이 이겼다. 품귀 카드 추격매수 무섭네",
  "가격 폭락은 아프지만 플레이 카드가 {oldPrice}였던 게 더 이상하긴 했음",
  "{card} 세 장 세트 가격이 어제 한 장 가격이랑 비슷해졌네",
  "재록 발표 한 줄에 되팔이 매물이 한꺼번에 쏟아지는 거 장관이다",
  "{oldPrice} 카드가 {newPrice} 되는 데 하루도 안 걸리는 시장 너무 무섭다",
  "{card} 재판본 예약가 보자마자 기존판 매물들이 가격부터 수정하는 중",
  "이래서 필수 카드 비쌀 때 재록 일정 없으면 섣불리 못 사지",
  "재판 전 고점에 산 사람은 억울하고 이제 맞추는 사람은 축제네",
  "{card} 가격 방어하던 희소성이 물량 한 번에 그대로 무너졌다",
  "시세 {dropRate}% 하락이면 덱 접근성은 좋아져도 구매 신뢰 타격은 크겠다",
  "매장 쇼케이스 {card} 가격표가 오늘만 두 번 바뀌었다더라",
  "재판본 실물 풀리기도 전에 기대 공급만으로 가격이 먼저 내려왔네",
  "카드 한 장 재록했을 뿐인데 {theme} 완성 덱 중고가까지 같이 재평가 중",
] as const;

const REPRINT_ACCESSIBILITY_COPY = [
  "이걸 재록하네 개꿀. 이제 {theme} 진짜 맞출 수 있겠다",
  "{card} 하나 비싸서 덱 포기했는데 재판이면 바로 시작한다",
  "플레이용 {card}를 {newPrice}에 구할 수 있으면 입문 장벽 확 낮아졌네",
  "초판 감성 필요 없고 대회에서 쓸 {card}만 싸게 나오면 됨",
  "재판 목록에 {card} 있는 거 보고 친구 셋이 동시에 덱 견적 짜는 중",
  "{theme} 유저가 지원 카드보다 {card} 재록을 더 반기는 이유가 있었음",
  "구하기도 힘들고 비싸던 필수 파츠를 이렇게 풀어주는 건 잘했다",
  "{oldPrice} 때문에 망설였는데 {newPrice}이면 남는 돈으로 사이드까지 맞추겠네",
  "재판 물량 넉넉하면 지역 대회에 {theme} 신규 유저 꽤 늘 듯",
  "비싼 한 장 빌리러 다니던 사람들 드디어 자기 {card} 생기겠네",
  "성능은 그대로인데 가격만 내려간 지원이라 모든 유저가 체감함",
  "재록 카드만 싱글로 사려다가 팩도 몇 장 뜯게 되는 게 운영이 노린 그림인가",
  "필수 카드 공급 해결은 신규 테마 하나 내는 것보다 체감이 클 때가 있다",
  "{card} 재판 덕분에 최저 레어 구축이라는 선택지가 제대로 생겼네",
  "입문자한테 대체 카드 추천하던 시대 끝. 이제 그냥 {card} 사라고 하면 됨",
  "고레어는 수집가가 사고 재판본은 플레이어가 쓰면 서로 좋은 구조지",
  "이번 재록은 카드값을 낮춘 게 아니라 덱 하나의 입장료를 낮춘 셈",
  "{userGain}명 접근성 증가 예상치가 과장 아닌 것 같을 정도로 반응 크다",
  "매장 재판 예약 명단에 기존 유저보다 새로 시작하는 사람이 더 많다더라",
  "{card} 없어서 프록시 쓰던 테스트 덱을 드디어 실물로 맞출 수 있겠다",
  "재판 타이밍 늦긴 했어도 안 하는 것보단 백 배 낫다",
  "가격 때문에 성능 좋은 덱을 못 고르던 문제를 공급으로 푼 건 정석임",
  "{theme} 스타터보다 {card} 재록 공지가 입문 패키지 역할을 더 잘하네",
  "이 정도 물량이면 카드 한 장 돌려 쓰던 팀원들도 각자 세트 맞출 수 있겠다",
] as const;

const REPRINT_COLLECTOR_BACKLASH_COPY = [
  "{card} 재판 자체보다 초판 산 지 얼마 안 된 사람한테 예고가 없던 게 문제임",
  "플레이용 공급은 찬성인데 {oldPrice} 카드 가치가 하루 만에 무너지는 건 너무 세다",
  "하이 일러스트 {card}까지 같은 그림으로 재록하면 초판 수집가는 뭐가 남음?",
  "재판본 레어도 구성을 미리 공개했으면 보유자 충격은 덜했을 텐데",
  "{collectorLoss}명 이탈 수치 보면 접근성만 좋아졌다고 끝낼 일은 아니네",
  "희소성 장사해 놓고 바로 재판하는 패턴이면 다음 고레어 구매는 망설여지지",
  "{card}를 싸게 푸는 건 좋은데 초판과 구분할 수집 요소는 남겨 줬어야 함",
  "재록 직전까지 고가 팩을 팔아 놓은 일정이면 신뢰 문제 나올 만하다",
  "실사용자는 웃고 컬렉터는 우는 재판이라 커뮤니티 온도차 엄청 크네",
  "{dropRate}% 하락보다 다음에 뭘 사도 또 재록될 수 있다는 불안이 더 큼",
  "초판 보유자 보상까지는 바라지 않아도 최소한 공급 로드맵은 공개해라",
  "수집 가치를 보장할 수 없다면 한정판처럼 홍보하지는 말았어야지",
  "{card} 재판 찬성인데 판본 차이를 거의 안 둔 건 수집 정책이 너무 성의 없다",
  "플레이 접근성과 보유 가치 둘 다 잡기 어렵지만 이번엔 한쪽으로 너무 기울었음",
  "재판 반복할수록 고레어 구매층은 카드보다 운영 일정을 먼저 보게 된다",
  "{reprintCount}번째 재판이면 이제 초판 프리미엄 기준도 완전히 달라지겠네",
  "카드값 떨어져서 화난 게 아니라 예고 없이 가치 정책이 바뀐 게 화나는 거임",
  "재판본은 환영인데 컬렉터용 별도 마킹 정도는 넣을 수 있었잖아",
] as const;

const REPRINT_REPEAT_COPY = [
  "{card} 벌써 {reprintCount}번째 재판인데 이번엔 진짜 물량 충분하려나",
  "또 {card} 재록이네. 자주 쓰이는 카드라 이해는 하는데 다른 품귀 카드도 좀",
  "{reprintCount}번 찍었는데도 비쌌다는 건 수요가 얼마나 컸던 거냐",
  "이번에도 {card}만 재록하고 새 필수 카드는 품귀로 두는 돌려막기 아니지?",
  "재판 단골 카드가 된 건 반갑지만 카드풀 다른 구석도 같이 챙겨 줬으면",
  "{card}는 다시 찍을 때마다 매진되는 걸 보면 범용 수요가 진짜 꾸준하네",
  "몇 번째 재록인데 이번 판본 일러가 또 예뻐서 사게 생겼다",
  "{reprintCount}번째면 이제 희귀 카드보다 상시 공급 카드로 보는 게 맞겠다",
  "재판을 반복해도 가격이 돌아오면 일회성 물량보다 정규 수록이 필요함",
  "{card} 재록 주기는 짧은데 정작 {theme} 다른 핵심은 한 번도 안 찍었네",
  "또 찍는다고 욕했는데 신규 유저는 이번이 첫 구매 기회일 수도 있지",
  "재판 횟수보다 매장마다 실제 몇 장 배정되는지가 더 중요하다",
  "이번 {card}는 같은 효과 다른 일러라 기존판 가진 사람도 또 살 듯",
  "계속 수요가 생기는 필수 카드는 재록 이벤트보다 상시 접근성으로 풀어야 함",
] as const;

const REPRINT_LIFECYCLE_COPY = [
  [
    "재판 첫날 {card} 예약 줄 보니 다들 이 카드 기다리고 있었구나",
    "{card} 재록 공지 하나로 가격 얘기와 덱 구축 얘기가 동시에 터졌다",
    "오늘 매장 문의 절반이 {card} 재판본 재고 있냐는 전화라더라",
    "초판 보유자와 신규 구매자가 같은 공지를 보고 정반대로 반응 중",
    "재판 첫날이라 {newPrice}도 임시 가격일 가능성이 높아 보임",
    "{card} 새 판본 실물 사진 올라오자 가격보다 인쇄 품질 토론이 먼저 붙었네",
  ],
  [
    "하루 지나니 {card} 재판 매물이 실제로 풀려서 거래가가 안정되는 중",
    "재판본 받은 사람들이 바로 {theme} 덱리 올리기 시작했네",
    "{card} 초판은 버티고 일반판만 내려가는 식으로 시장이 갈리는 분위기다",
    "어제 폭락한 매물 중 일부는 취소되고 실제 체결가는 {newPrice} 근처로 모이네",
    "접근성 좋아진 건 확실한데 매장별 배정 차이는 여전히 크다",
    "재판본 품질 괜찮다는 후기 퍼지니 굳이 초판 찾는 실사용자는 줄겠네",
  ],
  [
    "사흘차 {card} 가격이 {newPrice} 선이면 공급 충격이 어느 정도 자리 잡은 듯",
    "재판 뒤 첫 대회에 {theme} 신규 참가자가 실제로 늘었는지 궁금하다",
    "{card} 싸진 돈으로 다른 비싼 파츠 가격이 오르는 풍선효과도 보이네",
    "초판과 재판본 가격 차이가 정리되니 구매 목적에 따라 고르기 쉬워졌다",
    "재판 직후 급매는 줄고 이제 실사용 매수만 남는 분위기네",
    "물량이 계속 들어오면 {card} 품귀는 이번에 진짜 끝날 수도 있겠다",
  ],
  [
    "나흘 지나니 {card} 재판 효과가 덱 전체 견적에 반영된 게 보인다",
    "처음 폭락 뒤 {newPrice} 근처에서 멈췄다면 시장도 새 공급량을 받아들인 듯",
    "재판으로 유입된 {theme} 유저가 대회까지 남는지는 이제부터 봐야지",
    "{card} 접근성 해결 사례 보고 다른 고가 카드 재록 요구도 커지는 중",
    "초판 프리미엄과 플레이 가격을 분리한 이번 결과는 다음 재판에도 참고할 만함",
    "재판 열기는 가라앉아도 {card}를 구할 수 있게 된 변화는 계속 남는다",
  ],
] as const;

const REPRINT_ART_COPY = [
  "{card} 재판본 신규 일러 때문에 초판 있는데도 또 샀다",
  "성능 카드 재록인데 판본 비교하는 맛까지 챙겨준 건 좋네",
  "{card} 새 프레임이 {theme} 덱 색이랑 훨씬 잘 맞는다",
  "플레이용으로 샀다가 재판본 실물 보고 바인더용 한 장 더 구함",
  "초판 색감파와 재판 선명도파 또 싸우기 시작했네",
  "재록 일러 구도가 달라서 같은 카드 두 판본 같이 전시해도 예쁘겠다",
  "저레어 재판본도 가공 깔끔해서 실사용자는 만족할 듯",
  "{card} 텍스트는 똑같은데 새 일러 덕분에 신카드 공개처럼 반응 뜨겁네",
  "재판본 후가공 사진은 실물과 차이 크니까 매장 샘플부터 보고 사고 싶다",
  "수집판과 플레이판을 확실히 나눈 레어도 구성은 꽤 영리해 보임",
] as const;

const EMERGING_THEME_OFFICIAL_SAMPLE_DAYS = PLACEMENT_WINDOW_DAYS;
const EMERGING_THEME_PERFORMANCE_SAMPLE_DAYS = 7;

const EMERGING_THEME_CAUTION_COPY = [
  "{theme} 나온 지 {elapsed}밖에 안 됐는데 벌써 결론 내리는 건 너무 빠르다",
  "고작 {elapsed} 본 덱이다. 강하든 약하든 조금 더 기다려 보자",
  "{elapsed}치 성적만 보고 {theme}를 다 파악했다고 하긴 이르지",
  "{theme} 나온 지 아직 {elapsed}인데 벌써 확정적으로 말하는 쪽이 제일 성급함",
  "첫 대회 {placements}자리만으로 {theme} 티어를 고정하면 다음 주에 또 뒤집힌다",
  "채용률 {adoption}은 관심도일 수도 있으니 승률과 본선 표본을 더 모아야지",
  "{theme} 연구 기간이 끝나기도 전에 약하다 세다 결론부터 내리는 건 의미 없음",
  "지금 수치는 첫 구축들이 서로 답을 찾는 과정까지 섞인 표본이다",
] as const;

const EMERGING_THEME_EARLY_POSITIVE_COPY = [
  "{elapsed} 봤는데 채용률 {adoption}, 승률 {winRate}면 {theme} 첫인상은 벌써 기대된다",
  "나온 지 {elapsed}인데 {theme} 탑컷 점유율 {placementShare}, 본선 진출률 {conversion}면 시작은 좋네",
  "표본 더 쌓여야 하는 건 맞아도 {theme}가 벌써 승률 {winRate} 찍는 건 기대할 만함",
  "첫 며칠부터 {theme}가 입상 {placements}자리면 기본 설계는 제대로 작동하는 듯",
  "채용률 {adoption}에 이 성적이면 단순 신제품 호기심만으로 설명하긴 어렵다",
  "아직 조심해야 하지만 {theme} 첫 구축이 벌써 승률 {winRate}인 건 좋은 신호지",
  "연구 덜 된 상태에서 본선 진출률 {conversion}면 최적화 뒤가 더 기대된다",
] as const;

const EMERGING_THEME_EARLY_WIN_POSITIVE_COPY = [
  "{elapsed} 동안 {theme} 승률 {winRate}면 첫 매치 성적은 기대할 만하다",
  "아직 초반이지만 {theme}가 승률 {winRate}를 낸 건 분명 좋은 출발이다",
  "채용률 {adoption} 표본에서 승률 {winRate}면 {theme} 기본 체급은 보이네",
  "첫 구축들이 승률 {winRate}를 내고 있으면 {theme} 연구가 더 진행될 이유는 충분함",
  "{elapsed}치 매치 승률 {winRate}는 긍정 신호다. 탑컷 표본은 따로 더 보자",
] as const;

const EMERGING_THEME_EARLY_PLACEMENT_POSITIVE_COPY = [
  "나온 지 {elapsed}인데 {theme}가 벌써 입상 {placements}자리면 첫 대회 성적은 좋다",
  "{theme} 탑컷 점유율 {placementShare}, 본선 진출률 {conversion}면 출발은 확실히 좋네",
  "초기 표본이어도 입상 {placements}자리를 만든 건 {theme} 실전성이 있다는 신호다",
  "채용률 {adoption} 대비 탑컷 점유율 {placementShare}면 {theme} 첫 결과는 기대할 만함",
  "연구가 덜 된 시점에 본선 진출률 {conversion}를 냈다면 다음 대회도 볼 이유가 충분하다",
] as const;

const EMERGING_THEME_EARLY_NEUTRAL_COPY = [
  "{theme} 첫 {elapsed} 성적은 승률 {winRate}, 입상 {placements}자리다. 아직 좋다 나쁘다 말할 단계는 아님",
  "채용률 {adoption}에 탑컷 점유율 {placementShare}면 지금은 강세도 거품도 판단 보류가 맞다",
  "{elapsed}치 본선 진출률 {conversion}만으로 {theme} 성능 방향을 정하기엔 표본이 너무 작다",
  "첫 집계에서 입상 {placements}자리였다고 바로 강약을 붙이지 말고 다음 대회를 보자",
  "승률 {winRate}와 본선 진출률 {conversion} 모두 아직 {theme} 결론을 낼 만큼 선명하지 않다",
] as const;

const EMERGING_THEME_EARLY_MIXED_COPY = [
  "{theme} 승률 {winRate}와 탑컷 점유율 {placementShare}가 서로 다른 방향이라 첫 평가는 보류다",
  "매치 승률은 {winRate}, 본선 진출률은 {conversion}다. {elapsed} 표본으로 한쪽만 골라 말하긴 어렵네",
  "{theme}는 승률과 입상 {placements}자리 신호가 엇갈린다. 더 쌓이기 전엔 강약 확정 못 함",
  "채용률 {adoption}에서 나온 매치 성적과 탑컷 성적이 충돌하니 첫인상보다 다음 표본이 중요하다",
] as const;

const EMERGING_THEME_POSITIVE_COPY = [
  "{elapsed} 봤으면 첫 성적표는 나왔다. {theme} 본선 진출률 {conversion}면 앞으로가 더 기대됨",
  "{theme} 채용률 {adoption}에 탑컷 점유율 {placementShare}면 아직 더 봐도 강할 가능성이 높아 보임",
  "일단 {elapsed} 동안 승률 {winRate}, 본선 진출률 {conversion}다. {theme} 기대하는 쪽 근거도 충분함",
  "공식 표본 {placementDays}일 쌓이고도 {theme}가 이 수치면 앞으로도 기대할 만하다",
  "채용률과 본선 점유가 같이 움직이면 {theme}가 강할 가능성도 충분해 보임",
  "입상 {placements}자리면 이제 {theme} 성적표를 결과로 말할 수 있겠네",
  "초반 카운터 연구를 버티고도 승률 {winRate}인 게 다음 성적도 기대되는 부분이다",
] as const;

const EMERGING_THEME_WIN_POSITIVE_COPY = [
  "{elapsed} 동안 {theme} 승률 {winRate}면 매치 성적 쪽 기대 근거는 충분하다",
  "연구 기간을 지나서도 승률 {winRate}면 {theme} 기본 체급은 긍정적으로 봐도 되겠네",
  "채용률 {adoption} 표본에서 승률 {winRate}가 유지되면 {theme} 강점은 실제로 작동하는 중이다",
  "{theme}가 카운터 연구 뒤에도 승률 {winRate}를 냈다. 다음 성적도 기대할 만함",
  "입상 지표는 더 봐야 해도 {elapsed}치 승률 {winRate} 자체는 좋은 성적표다",
] as const;

const EMERGING_THEME_PLACEMENT_POSITIVE_COPY = [
  "{elapsed} 동안 {theme} 입상 {placements}자리면 대회 결과 쪽 기대 근거는 충분하다",
  "{theme} 탑컷 점유율 {placementShare}와 본선 진출률 {conversion}가 같이 받쳐 주네",
  "공식 표본이 쌓이는 동안 입상 {placements}자리를 지켰으면 {theme} 실전성은 확인됐다",
  "채용률 {adoption} 대비 탑컷 점유율 {placementShare}면 단순 신제품 관심만으로 보기 어렵다",
  "본선 진출률 {conversion}가 유지되면 {theme}는 다음 대회에서도 기대할 만하다",
] as const;

const EMERGING_THEME_NEUTRAL_COPY = [
  "{elapsed}치 {theme} 승률 {winRate}, 본선 진출률 {conversion}면 아직 강세도 거품도 아니다",
  "채용률 {adoption}과 탑컷 점유율 {placementShare}만 보면 {theme} 평가는 계속 보류가 맞다",
  "입상 {placements}자리까지 쌓였지만 지금 수치는 {theme} 방향을 확정할 만큼 선명하지 않네",
  "{theme} 성적은 평균권에 가깝다. 성공이나 실패를 말하려면 다음 표본이 더 필요함",
  "승률 {winRate}와 본선 진출률 {conversion} 모두 한쪽 결론을 밀 정도는 아니다",
] as const;

const EMERGING_THEME_MIXED_COPY = [
  "{theme} 승률 {winRate}와 탑컷 점유율 {placementShare}가 엇갈려서 한쪽 지표만으로 평가 못 하겠다",
  "매치 성적은 {winRate}, 본선 진출률은 {conversion}다. 서로 다른 신호라 결론은 보류",
  "{elapsed} 봤어도 {theme} 승률과 입상 {placements}자리 방향이 다르면 추가 표본이 필요하다",
  "채용률 {adoption} 표본의 매치 결과와 탑컷 결과가 충돌한다. 강하다 약하다 둘 다 성급함",
] as const;

const EMERGING_THEME_EARLY_BUBBLE_COPY = [
  "{elapsed}밖에 안 됐어도 {theme} 채용률 {adoption}에 본선 진출률 {conversion}면 거품 첫인상은 온다",
  "벌써 이렇게 많이 들고 왔는데 탑컷 점유율 {placementShare}뿐이면 {theme} 시작부터 불안한데",
  "더 기다리자는 말은 맞지만 승률 {winRate}면 {theme}가 채용만 높은 건 아닌지 의심할 만함",
  "신제품이라 사람이 몰린 것치고 입상 {placements}자리면 거품 첫인상은 피하기 어렵다",
  "{theme} 덱리는 넘치는데 본선 진출률 {conversion}면 성능 쪽은 벌써 불안하지",
  "아직 표본은 적어도 채용률 {adoption} 대비 승률 {winRate} 차이는 눈에 띈다",
  "첫 주 프리미엄 뒤 채용률 {adoption} 수요가 거품인지도 중요하겠네",
] as const;

const EMERGING_THEME_EARLY_WIN_WEAK_COPY = [
  "{elapsed} 동안 채용률 {adoption}까지 올랐는데 승률 {winRate}면 {theme} 첫 매치 성적은 불안하다",
  "{theme}를 많이 잡은 표본에서 승률 {winRate}면 신제품 관심과 성능은 나눠 봐야지",
  "아직 초반이어도 채용률 {adoption} 대비 승률 {winRate}는 약한 신호다",
  "첫 구축 문제를 감안해도 {theme} 승률 {winRate}면 다음 연구에서 반등이 필요하다",
] as const;

const EMERGING_THEME_EARLY_PLACEMENT_WEAK_COPY = [
  "{elapsed} 동안 {theme} 채용률 {adoption}에 입상 {placements}자리면 첫 대회 결과는 불안하다",
  "많이 들고 왔는데 탑컷 점유율 {placementShare}면 {theme} 인기에 비해 결과가 약하네",
  "채용률 {adoption} 표본에서 본선 진출률 {conversion}면 첫 성적은 거품을 의심할 만하다",
  "신제품 관심은 큰데 입상 {placements}자리라 {theme} 실전성은 아직 못 따라오는 중",
] as const;

const EMERGING_THEME_BUBBLE_COPY = [
  "{elapsed} 봤으면 충분하다. {theme} 채용률 {adoption}인데 본선 진출률 {conversion}면 거품 쪽임",
  "{theme}를 많이 들고 왔는데 탑컷 점유율은 {placementShare}다. 벌써 흥행만 하고 성적은 망한 느낌",
  "채용률 {adoption}에 승률 {winRate}, 본선 진출률 {conversion}면 {theme}는 인기와 성능이 따로 노는 중",
  "표본 {placementDays}일이면 기다려 달라는 말도 이제 한계다. 입상 {placements}자리는 너무 적음",
  "{theme} 판매량은 성공인데 대회 성적표는 성공이라고 부르기 어렵다",
  "카운터가 많아서 그렇다는 설명까지 포함해도 본선 진출률 {conversion}는 낮다",
  "인기 덱이 약하면 지역 매칭에서는 많고 상위 테이블에서는 사라지는 패턴이 바로 보임",
] as const;

const EMERGING_THEME_WIN_WEAK_COPY = [
  "{elapsed} 동안 채용률 {adoption}인데 승률 {winRate}면 {theme}는 인기만큼 매치 성적을 못 냈다",
  "연구 기간을 줬는데도 {theme} 승률 {winRate}면 약체 평가 근거는 충분하다",
  "채용률 {adoption} 표본에서 승률 {winRate}가 계속 낮으면 구축 문제만으로 돌리기 어렵다",
  "{theme}를 많이 잡았지만 매치 승률 {winRate}라 성능 쪽 반등이 필요함",
] as const;

const EMERGING_THEME_PLACEMENT_WEAK_COPY = [
  "{elapsed} 동안 {theme} 채용률 {adoption}에 입상 {placements}자리면 대회 결과는 약하다",
  "많이 들고 왔는데 탑컷 점유율 {placementShare}면 {theme} 인기에 비해 실속이 없다",
  "채용률 {adoption} 표본에서 본선 진출률 {conversion}면 거품 평가가 나올 만하다",
  "표본이 쌓였는데도 입상 {placements}자리면 {theme} 대회 성적은 실패 쪽에 가깝다",
] as const;

const EMERGING_THEME_WEAK_TO_STRONG_COPY = [
  "내가 {theme}는 좀 더 기다려 보랬지. 지금은 탑컷 점유율 {placementShare}, 본선 진출률 {conversion}까지 반등했다",
  "처음엔 약해 보여도 더 지켜보자던 쪽이 맞았네. {theme} 승률 {winRate}에 본선 진출률 {conversion}다",
  "{theme} 첫 주 성적만으로 접은 사람은 아쉽겠다. 기다려 보니 탑컷 점유율 {placementShare}까지 올라왔네",
  "초반 약체 평가 뒤 기다려 보니 {theme} 승률 {winRate}까지 올라온 거 멋지다",
  "더 지켜보자던 쪽 말대로 처음 매물 던진 사람들이 다시 {theme} 코어 찾는 중 ㅋㅋ",
  "기다려 보니 입상 {placements}자리까지 반등했다. 연구가 체급을 실제로 끌어올렸네",
  "첫 주 덱리만 보고 약하다고 했는데 더 지켜보니 카드보다 구축 문제였음",
] as const;

const EMERGING_THEME_STRONG_TO_WEAK_COPY = [
  "{theme}는 첫 주 반짝이었다. 더 기다려 보니 채용률 {adoption}에 본선 진출률 {conversion}라 거품 쪽으로 기우네",
  "초반엔 {theme}가 다 잡을 것 같더니 지금 승률 {winRate}, 탑컷 점유율 {placementShare}다. 기다려 보길 잘했네",
  "첫 며칠 수치만 보면 강해 보였는데 {theme} 본선 진출률 {conversion}까지 내려온 걸 보니 결론이 바뀐다",
  "{theme} 첫 주 반짝은 효과를 몰라서였나. 익숙해지니 승률이 빠르게 정상화됐네",
  "첫 주 고점만 보면 강해 보였는데 카운터 보급 뒤 승률 {winRate}까지 내려왔다",
  "입상 {placements}자리로 줄었으면 초반 강세가 거품이었다는 쪽으로 결론이 바뀐다",
  "신제품 모르는 상대를 잡던 첫 주 반짝이 끝나자 {theme}의 진짜 약점이 보인다",
] as const;

const STRONG_THEME_STRONG_SUPPORT_COPY = [
  "이미 상위권인 {theme}에 이 정도 지원을 또 준다고? 운영이 매출 말고 보는 게 있긴 함?",
  "{theme} 점유율 {share}인데 더 센 카드 세 장을 얹는 판단이 어떻게 나옴",
  "약한 덱 살릴 자리로 1티어 덱 왕관부터 닦아 주네",
  "{newCard}까지 받은 {theme} 상대로 다음 금제까지 버티라는 거지?",
  "원래도 결과물까지 잘 가던 덱에 초동이 또 늘었네. 대놓고 밀어주기잖아",
  "강한 테마에 강한 지원, 매출 그래프만 보면 완벽한 선택이겠네 ㅋㅋ",
  "이번 달 상품 주인공이 {theme}인 건 알겠는데 환경 전체를 제물로 삼지는 말자",
  "상위 덱 강화부터 챙기는 운영이면 비주류 유저가 왜 다음 팩을 기다림?",
  "{supportNo}차 지원까지 이렇게 세면 사실상 다른 테마는 출시 순서로 지는 게임임",
  "{part}도 충분히 셌는데 {newCard}는 왜 상위 호환처럼 냈냐",
  "금제 때는 신중하더니 강한 덱 지원할 때만 결단력이 넘치네",
  "{theme} 미러전 비율 더 올라가는 소리가 벌써 들린다",
  "센 덱에 센 카드 주고 메타 순환을 기대한다는 게 제일 웃김",
  "판매량 필요하다고 1티어에 전용 파워카드 꽂는 건 너무 노골적이다",
  "다른 덱은 카운터 연구 중인데 {theme}는 공식 패치로 해결받네",
  "이 정도면 지원이 아니라 현 메타 1위 연임 공고다",
  "상위권 덱에 부족하던 마지막 한 조각까지 채우면 대체 어디서 약점을 찾으라는 거냐",
  "{newCard} 공개 뒤로 {theme} 카운터 연구글이 전부 폐기되는 중",
  "점유율 {share}인 덱이 지원까지 제일 잘 받으면 메타 순환은 누가 시켜 줌?",
  "{part}도 제한 후보라던 덱에 더 강한 전개축을 얹은 판단은 진짜 이해 못 하겠다",
] as const;

const STRONG_THEME_WEAK_SUPPORT_COPY = [
  "이미 강한 {theme}에 이 정도 카드 줄 거면 애초에 왜 줌?",
  "지원 자리 하나 썼는데 기존 구축에서 바뀌는 게 없네",
  "강한 덱을 더 망가뜨릴까 걱정했는데 약하게 나온 건 그나마 다행이다",
  "{theme} 강화라길래 긴장했는데 {newCard} 채용할 자리가 있긴 함?",
  "상위권 테마에 지원 배정한 것도 의문인데 성능까지 애매해서 누구도 못 웃네",
  "기존 카드가 더 좋아서 신카드 세 장 전부 보관함행일 듯",
  "강한 덱에 지원을 주되 안 쓰이게 냈다니 이게 무슨 자원 낭비냐",
  "메타는 안 터져서 다행인데 상품으로서는 왜 냈는지 모르겠다",
  "{part} 빼고 {newCard} 넣을 이유를 아직 하나도 못 찾음",
  "지원 횟수만 채우고 실질 강화는 피하려 한 티가 너무 난다",
  "이걸 세게 냈으면 욕했겠지만 이렇게 약할 거면 다른 테마나 챙기지",
  "{supportNo}차 지원이 덱리 한 줄도 못 바꾸면 팬들도 허탈하겠다",
  "상위권 견제도 구제도 아닌 가장 애매한 발매가 됐네",
  "{theme} 유저조차 굳이 살 필요 없다고 말하는 지원이면 실패 아닌가",
  "강덱이라 조심한 건 알겠는데 그러면 지원 슬롯을 왜 여기다 썼냐",
  "{newCard} 넣은 리스트보다 안 넣은 기존 리스트가 더 안정적이네",
  "환경은 안 망가졌지만 신상품도 같이 안 팔리게 생겼다",
  "{theme} 팬들은 지원 발표 때만 설레고 카드 공개 뒤 바로 원래 덱리로 복귀함",
  "{part}와 경쟁조차 못 하는 신카드면 선택지가 아니라 장식품이지",
  "{supportNo}차 지원을 밸런스 눈치만 보다 끝내니 받은 쪽도 안 받은 쪽도 찝찝하다",
] as const;

const WEAK_THEME_STRONG_SUPPORT_COPY = [
  "드디어 {theme}도 제대로 된 지원 받았네. 이 정도는 줘야 테이블에 앉지",
  "{newCard} 한 장으로 굴러가는 느낌 자체가 달라졌다",
  "늘 하위권이던 {theme}가 올라오는 건 메타 순환이라서 오히려 반갑다",
  "약한 테마 살리는 강지원이면 이런 파워 인상은 납득 가능함",
  "{theme} 유저들 몇 달 버틴 보람은 있겠다. 이번엔 진짜 덱이 됐네",
  "{share} 점유율에서 시작한 덱이면 이 정도 추진력은 필요했지",
  "신카드 세 장이 전부 역할이 있어서 지원팩 뜯는 맛은 확실하다",
  "{part}에만 의존하던 덱이 {newCard} 덕분에 선택지가 생김",
  "강하긴 한데 원래 체급 생각하면 바로 인플레라고 몰아갈 정도는 아님",
  "비주류가 대회에 보이기 시작하는 발매가 제일 재밌다",
  "지원 전에는 팬덱이었는데 이제는 실전덱이라고 불러도 되겠네",
  "{supportNo}번 기다린 끝에 받은 카드가 이 정도면 팬층 다시 돌아올 듯",
  "기존 상위권만 조금 내려오면 {theme}가 새 얼굴 역할 제대로 하겠다",
  "구제 지원의 모범답안에 가깝다. 세지만 목적이 분명함",
  "처음으로 {theme}를 맞춰 보고 싶다는 생각이 들 정도로 변화가 크네",
  "약한 덱을 강하게 만드는 것과 강한 덱을 더 강하게 만드는 건 얘기가 다르지",
  "{theme} 매치업을 처음으로 따로 연습해야 할 이유가 생겼네",
  "{newCard} 덕분에 예전엔 포기하던 패도 전개가 이어지는 게 제일 크다",
  "입상권 밖에 있던 덱이 지원 한 번으로 선택지에 들어오는 게 진짜 메타 순환이지",
  "{part}를 살리면서 새 루트도 만든 지원이라 기존 유저 만족도 높을 만함",
] as const;

const WEAK_THEME_WEAK_SUPPORT_COPY = [
  "약한 {theme}에 약한 지원을 주면 대체 뭐가 달라지냐. 지원 자리만 아깝다",
  "구제하라고 준 세 장이 기존 덱의 문제를 하나도 못 고쳤네",
  "{newCard}까지 넣어 봤는데 여전히 첫 관문도 못 넘는다",
  "팬들이 기다린 {supportNo}차 지원을 이렇게 소모하는 게 제일 잔인함",
  "강하게 주면 큰일 나는 덱도 아닌데 왜 이렇게 겁먹고 냈지?",
  "{theme}는 지원받고도 약하다는 말만 다시 증명하게 생겼네",
  "차라리 이 슬롯으로 신테마 하나 더 내는 게 나았겠다",
  "기존 약점을 보완하기는커녕 애매한 선택지만 세 장 늘었음",
  "{part} 대신 넣을 카드도 아니고 같이 넣어도 체급이 그대로다",
  "지원 소식에 복귀한 사람들 덱리 짜다가 다시 접겠네",
  "약한 테마는 한 번의 지원 기회가 귀한데 이걸 이렇게 날리냐",
  "일러만 지원이고 성능은 현상 유지 공지 수준임",
  "{share}짜리 테마를 살릴 생각이었다면 최소한 실제 대전 테스트는 했어야지",
  "지원 횟수 제한까지 있는데 한 회분을 아무 의미 없이 썼네",
  "이 정도 변화면 신규 세 장이 아니라 카드명 세 줄 추가한 수준",
  "구제 지원이 아니라 약한 이유를 다시 설명해 주는 체험판이네",
  "{newCard} 세 장 다 넣고도 기존 약점이 그대로면 설계 목표가 뭐였던 거냐",
  "{theme} 팬들이 원하는 건 우승 확정 카드가 아니라 평범하게 게임할 카드라고",
  "지원 전후 매치업표가 한 칸도 안 바뀌는 게 제일 처참하다",
  "{part} 하나에 모든 부담이 남아 있는데 새 카드들은 옆에서 구경만 하네",
] as const;

const MIDDLE_THEME_STRONG_SUPPORT_COPY = [
  "중위권이던 {theme}가 이번 지원으로 바로 상위권 문 두드리겠네",
  "{newCard} 파워는 확실한데 기존 강덱을 밀어낼 정도인지는 궁금하다",
  "메타 순환용 지원치고는 꽤 세다. 며칠 뒤 점유율을 봐야겠음",
  "{theme}가 새 경쟁자가 되는 건 좋은데 또 하나의 독주 테마가 되면 곤란함",
  "기존 구축 완성도에 이 세 장이면 예상보다 훨씬 높이 갈 수도 있겠다",
  "딱 한 단계 올리는 지원인지 두 단계를 건너뛰는 인플레인지 경계선임",
  "{part} 중심 덱이 {newCard} 중심으로 얼마나 바뀔지가 핵심일 듯",
  "상위권 고착을 깨는 카드라면 환영인데 수치가 조금 과감하긴 하다",
  "{supportNo}차에 제대로 승부수 던졌네. 주말 대회가 재밌어지겠다",
  "지원 대상 선정은 납득하는데 강도는 생각보다 한 단계 높음",
  "{theme}가 원래도 기본기는 있었는데 {newCard}로 폭발력까지 챙겼네",
  "중위권 구제라고 보기엔 첫날 결과가 너무 빠르게 나오고 있다",
  "{part}를 그대로 쓰면서 약점만 지운 구조라 상승폭이 꽤 클 듯",
  "이 정도면 다음 대회 다크호스가 아니라 우승 후보로 봐야 하지 않나",
  "지원 취지는 좋은데 {share}에서 어디까지 뛰는지는 꼭 지켜봐야겠다",
  "{supportNo}차 지원이 정확히 먹히면서 덱 완성도가 갑자기 두 세대 앞서감",
] as const;

const MIDDLE_THEME_WEAK_SUPPORT_COPY = [
  "{theme}가 딱 한 끗 부족했는데 지원도 딱 한 끗 부족하게 나왔네",
  "{newCard} 연구하면 한두 장은 쓰겠지만 티어가 바뀔 정도는 아닌 듯",
  "환경을 흔들기 싫었던 건 알겠는데 지원 체감까지 없앨 필요는 없잖아",
  "기존 구축의 선택지만 늘었지 체급 문제는 그대로다",
  "{part}를 대체하지도 보완하지도 못하면 이 카드의 자리는 어디임?",
  "중위권 유지용 패치라면 성공인데 상품으로 사고 싶지는 않다",
  "조금만 더 밀어줬으면 메타 새 얼굴이 됐을 텐데 아쉽네",
  "약하지는 않은데 지원 발표 때 기대한 변화도 없다",
  "{supportNo}차 지원을 사이드 선택지 세 장으로 끝내는 건 아깝다",
  "덱리는 달라져도 승률은 거의 안 달라질 것 같은 지원",
  "{newCard}가 나쁜 카드는 아닌데 {theme}가 필요했던 답도 아니다",
  "중간은 가던 덱이라 더 세게 줄 이유가 없었다는 판단인가 본데 너무 안전하다",
  "{part} 옆에 한 장 정도 넣고 끝이면 세 장 지원이라고 부르기 민망함",
  "새 루트는 예쁜데 기존 루트보다 나을 상황이 거의 안 보인다",
  "환경 적응용 선택지는 늘었지만 주력으로 밀 만한 카드는 없네",
  "{supportNo}차까지 왔는데 아직도 다음 지원을 기다리게 만드는 강도다",
] as const;

const MIDDLE_SUPPORT_COPY = [
  "{theme} 지원은 세지도 약하지도 않아서 결국 구축 연구가 평가를 가르겠네",
  "{newCard} 3장 고정인지 1장 선택지인지부터 의견이 갈린다",
  "지원 전후 체급 차이는 보이는데 당장 환경 파괴라고 할 정도는 아님",
  "{part}와 {newCard} 중 어느 쪽을 남길지가 이번 덱리의 핵심일 듯",
  "딱 부족한 부분을 채웠지만 과하게 밀어 준 느낌은 없다",
  "이 정도 지원이면 팬은 사고 비팬은 대회 결과를 기다릴 것 같음",
  "{supportNo}차 지원답게 새 루트는 생겼는데 기존 정체성도 남아 있네",
  "첫 평가는 무난. 실제 채용률이 자리 잡고 나서 봐야겠다",
  "기존 덱을 완전히 갈아엎지 않고 선택지만 늘린 건 괜찮다",
  "지원 카드 셋 중 두 장은 확실하고 한 장은 아직 연구가 필요해 보임",
  "{newCard} 덕분에 후공 플랜이 생긴 것만으로도 구축 폭은 꽤 넓어졌다",
  "{theme} 기존 장점은 살리고 불편한 부분만 다듬은 무난한 지원 같음",
  "{part}를 빼는 리스트와 같이 쓰는 리스트 둘 다 말이 돼서 정답 찾는 맛 있네",
  "당장 티어가 오르진 않아도 장인들이 오래 연구할 재료는 충분하다",
  "세 장 전부 필수는 아니라 지갑 부담까지 적당한 편",
  "{supportNo}차 지원 중에서는 가장 패치 노트 같은 구성이다",
] as const;

const THESEUS_SUPPORT_COPY = [
  "{theme} 지원이라더니 기존 카드는 {oldCard}부터 빠지고 신카드만 남네. 이거 테세우스의 배 아님?",
  "새 카드 채용률만 치솟고 {oldCard}는 바로 잘렸는데 같은 테마라고 할 수 있나",
  "{newCard} 중심 덱리 보니까 예전 {theme} 카드가 이름 말고는 거의 안 남았다",
  "구제는 성공했는데 기존 팬이 하던 덱을 통째로 교체한 느낌임",
  "{oldCard} 자리에 신카드 세 장 꽂는 게 지원이 아니라 리메이크 아닌가",
  "지원 전 카드가 하나씩 빠져서 결국 덱 이름만 {theme}로 남겠네",
  "기존 카드 채용률은 급락하고 {newCard}만 3장 고정. 테세우스 판정 들어갑니다",
  "옛날 구축 좋아하던 사람은 강해져도 자기 덱 같지 않다고 할 만함",
  "약한 덱 살린 건 좋은데 기존 파츠를 전부 상위 호환으로 밀어내는 방식뿐이었나",
  "{supportNo}차 지원 덱리에서 {oldCard}가 사라진 거 보고 세월 체감했다",
  "성능은 올랐는데 정체성은 신카드 세 장한테 먹힌 느낌",
  "{theme}를 강화한 건지 {theme}라는 이름의 새 덱을 출시한 건지 모르겠음",
  "기존 에이스보다 {newCard} 채용률이 높아진 순간부터 리메이크라고 봐야지",
  "강지원의 대가가 옛 카드 전원 해고라면 팬들 반응도 갈릴 수밖에 없다",
  "덱 파워는 만족하는데 {oldCard}를 빼는 순간 묘하게 서운하네",
  "세 장 지원으로 구축 절반이 바뀌는 걸 보니 진짜 카드판 테세우스의 배다",
  "{newCard}가 강한 건 좋은데 {oldCard}를 추억 카드로 만들어야만 했나",
  "예전 {theme} 플레이 감각은 사라지고 카드명만 이어받은 후속작 같음",
  "지원받을수록 원년 멤버가 빠지는 덱이면 몇 차부터 다른 테마로 쳐야 하냐",
  "{part}까지 새 카드라 덱 소개 영상에서 기존 카드 찾기가 더 어렵네",
] as const;

const CASUAL_RELEASE_COPY = [
  "퇴근하고 두 판 했는데 상대가 둘 다 {theme}. 벌써 좀 피곤하다",
  "복잡한 계산은 모르겠고 {part} 나오면 내 턴이 너무 늦게 옴",
  "친구랑 가볍게 하려는데 신카드 체급 차이가 바로 느껴지네",
  "{theme} 세긴 한데 전개 길어서 직접 맞추고 싶진 않음",
  "일러는 취향인데 입문자가 굴리기엔 너무 어려워 보인다",
  "대회 말고 매장 프리에서도 {theme}만 보이는 건 좀 그렇다",
  "룰 잘 모르는 친구한테 {theme} 전개 설명하다가 한 판 시간 다 갔다",
  "{part} 연출은 멋있는데 매번 보면 스킵 버튼 생각남",
  "승률보다 서로 할 거 하면서 노는 덱인지가 더 궁금하다",
  "주말에 한두 판 하는 사람도 신카드 전개는 따로 공부해야겠네",
  "{theme} 맞출까 했는데 카드 수가 너무 많아서 일단 구경만 할래",
  "친구가 새 덱 자랑하길래 붙어 줬다가 내 카드 한 장도 못 냈다",
  "캐릭터는 취향인데 매장 분위기까지 빡세지는 건 원하지 않음",
  "{part} 한 장만 사서 기존 덱에 섞을 방법은 없나",
] as const;

const SPECTATOR_RELEASE_COPY = [
  "방송 한 판 봤는데 {theme} 무조건 금지감임 반박 안 받음",
  "덱리는 안 봤는데 짤만 보면 {part} 한 장으로 다 이기는 거 아님?",
  "오늘 커뮤니티 분위기 보니까 역대급 망발매 확정 ㅋㅋ",
  "{theme} 잘 모르지만 다들 화났으니 일단 운영 잘못인 듯",
  "대회 결과 나오기 전인데 벌써 게임 망했다는 글 백 개 봄",
  "신카드 영상 제목들 전부 ‘환경 파괴’인 거 웃기네",
  "효과는 세 줄까지만 읽었는데 {theme}가 센 건 알겠음",
  "입상표 한 장 떴으니 이제 {theme} 0티어 확정 맞지?",
  "실전은 안 해 봤지만 댓글 반응 보니까 {part} 금지 가야겠네",
  "어제는 망했다더니 오늘은 사기라네. 일단 둘 다 추천 누름",
  "콤보 영상 배속인 줄 모르고 전개 엄청 빠른 덱인 줄 알았다",
  "{theme} 카드 이름은 모르는데 썸네일에서 자주 봐서 익숙함",
  "첫날 매물 가격만 보고 성능 평가 끝냈다는 사람 왜 이렇게 많냐",
  "대회 한 번 안 열렸는데 다음 금제 예상표부터 만든 정성은 인정한다",
] as const;

const BACKLASH_RELEASE_COPY = [
  "{theme} 금제표 잉크도 안 말랐는데 지원 ㅋㅋㅋ 이럴 거면 금제 왜 함?",
  "{part} 잘라 놓고 더 센 초동 주는 게 무슨 의미냐",
  "금제로 체급 낮추고 신카드로 다시 파는 패턴 너무 티 난다",
  "기존 카드 죽이고 새 카드 사라는 거잖아",
  "{theme} 유저 입장에선 다행인데 운영 기준은 진짜 모르겠다",
  "보상 지원 자체는 이해해도 {days}일 만은 너무 빠르지 않냐",
  "금제는 환경 조정이 아니라 상품 일정 맞추기였나",
  "이 지원 약하면 두 번 죽이는 거고 세면 금제가 무의미함",
  "제한 먹은 파츠 빈자리 정확히 신카드가 채우네 ㅋㅋ",
  "금제 맞고 덱 고친 사람만 바보 되고 바로 새 상품 사라는 흐름이네",
  "{days}일 전에 문제라던 플레이를 {newCard}로 다시 하게 해 주는 건 무슨 기준임",
  "{part} 매수 줄인 의미가 신카드 세 장 넣을 자리 확보였냐",
  "환경을 식히자마자 같은 {theme}로 다시 불붙이는 일정 진짜 대단하다",
  "금제 발표 때 했던 설명이 이번 지원 한 장으로 전부 모순이 됐네",
  "유저 신뢰보다 발매 캘린더가 우선이라는 걸 이렇게 확인시켜 준다",
  "보상은 필요해도 최소 한 환경은 지나고 줬어야 납득하지",
] as const;

const RELEASE_LIFECYCLE_COPY = [
  [
    "출시 하루 만에 {part} 정답 매수 벌써 나온 것처럼 말하네",
    "이건 연구 전에도 센 게 보인다 ㅋㅋ",
    "약하다는 평 많던데 직접 굴리니 더 애매함",
    "첫날 덱리라 그런지 {theme}마다 채용 카드가 전부 다르네",
    "{part} 3장부터 넣고 시작하는 분위기인데 진짜 맞나",
    "공개 때 저평가받던 카드가 실전에서 제일 많이 보인다",
    "발매 첫날은 다들 고점 영상만 올려서 안정성을 모르겠음",
    "{theme} 상대법 글보다 콤보 질문 글이 더 빨리 쌓이는 중",
    "첫 매칭은 무서웠는데 효과 알고 나니 막을 자리가 보이긴 한다",
    "아직 정답 없을 때 온갖 구축 튀어나오는 이 시기가 제일 재밌다",
  ],
  [
    "하루 굴려 보니까 첫인상보다 {theme} 고점이 높다",
    "어제 사기라던 {theme}, 패 말림도 꽤 있네",
    "밤새 새 전개 올라와서 첫날 덱리 벌써 구형 됨",
    "발매 하루 만에 {part} 매물 씨가 말랐음",
    "이틀째 되니까 {theme} 사이드전 약점 얘기도 나오기 시작하네",
    "첫날 버려졌던 {part}가 새 루트 핵심으로 다시 올라왔다",
    "밤새 돌린 사람들 덱리는 초동보다 후속을 더 챙기는 분위기임",
    "어제 본 고점 콤보보다 짧은 실전 루트가 훨씬 강해 보인다",
    "{theme} 미러전 데이터 쌓이니까 선공만의 덱은 아닌 듯",
    "발매빨인지 진짜 체급인지 오늘 대회부터 감 잡히겠다",
  ],
  [
    "이틀차 {theme} 리스트는 안정성 쪽으로 굳는 듯",
    "초견살 빠지니까 대응할 구간이 보이네",
    "약한 줄 알았는데 숙련자 잡으니 완전 다른 덱임",
    "첫 소규모 대회 결과에 {theme} 바로 올라왔네",
    "사흘차 덱리는 이제 취향 카드보다 필수 파츠가 더 잘 보인다",
    "{part} 매수 논쟁도 결과표 나오니까 한쪽으로 기우는 중",
    "처음엔 못 막는다더니 지금은 다들 정확한 견제 지점 공유하네",
    "{theme}가 강한 건 맞는데 숙련도 차이도 꽤 크게 나는 덱이다",
    "초반 거품 빠지고도 매칭에 남는 사람들은 진짜 유저층일 듯",
    "카운터 맞고 복구하는 리스트까지 나오니 연구 속도 무섭다",
  ],
  [
    "{theme} 초기 평가는 이제 대충 굳은 것 같다",
    "발매 열기 빠지니 실제 체급이 보이네",
    "이번 주말 대회가 진짜 판정대일 듯",
    "나흘 굴린 리스트들은 {theme} 욕심 카드가 확실히 줄었네",
    "{part} 채용률도 대충 굳어서 이제 가격만 진정하면 되겠다",
    "첫날 사기론과 망테마론 둘 다 과장이었던 걸로 정리되는 분위기",
    "대응법 퍼진 뒤에도 성적 내면 그때부터 진짜 티어 덱이지",
    "{theme} 전용 사이드까지 자리 잡는 걸 보니 환경에 안착하긴 했다",
    "주말 결과 전 마지막 평가는 강점 확실하고 약점도 확실하다는 쪽",
    "신선함은 빠졌는데 계속 손이 가면 덱 설계는 성공한 거다",
  ],
] as const;

const RELEASE_ART_COPY = [
  [
    "{theme} 성능 보기 전에 일러에서 이미 주문함",
    "{part} 공개되자마자 최애 정했다",
    "이번 테마 비주얼은 신규 유저 끌어올 만함",
    "카드명·일러 연결되는 맛은 진짜 잘 살렸네",
    "{theme} 풀아트 실물 뜨자마자 지갑 열림",
    "성능 논쟁 중인데 일러만큼은 반박이 없네",
    "{part} 일러 구도 때문에 효과도 읽기 전에 덱부터 찾아봤다",
    "이번 {theme} 색감은 카드 세 장 나란히 놓을 때 완성되네",
    "비주얼 공개만으로 팬아트가 쏟아지는 테마는 오랜만이다",
    "카드명 번역까지 일러 분위기랑 잘 맞아서 수집 욕구 생김",
  ],
  [
    "실물 {part} 색감 때문에 성능 상관없이 갖고 싶다",
    "{theme} 첫날 팬아트 속도 무슨 일이냐",
    "카드 모아 놓으니까 {theme} 한 페이지가 진짜 예쁨",
    "어제 성능 보고 고민했는데 일러 보고 결국 샀다",
    "{part} 실물은 스캔 이미지보다 색감이 훨씬 깊다",
    "{theme} 팬아트 태그가 하루 만에 새 그림으로 꽉 찼네",
    "같은 카드도 레어도별 일러 느낌 달라서 전부 모으고 싶음",
    "비주얼 테마 맞춰서 슬리브 고르는 시간이 덱 짜는 시간보다 길다",
    "카드명 순서대로 놓으니 일러가 한 장면처럼 이어지는 거 이제 알았음",
    "성능용 세 장 말고 보관용 풀아트까지 따로 사고 싶다",
  ],
  [
    "성능 논쟁 끝나도 {theme} 캐릭터 얘기는 계속 나오네",
    "설정 파는 사람들 때문에 {theme} 팬덤 더 커질 듯",
    "{part} 일러 디테일 이제 발견했는데 미쳤다",
    "사흘째인데 {theme} 팬아트는 줄기는커녕 설정 해석까지 붙네",
    "{part} 배경 일러에 다른 카드 떡밥 있는 거 발견한 사람 대단하다",
    "비주얼만 보고 입문한 사람들이 카드명 외우는 속도 진짜 빠름",
    "풀아트 한 장 때문에 쓰지도 않을 {theme} 덱까지 맞추는 중",
    "색감 통일된 바인더 페이지 사진 보니까 수집가 마음 이해된다",
    "일러 스토리 순서 정리글이 대회 결과 글보다 조회수 높네",
    "{theme} 팬아트에서 시작해서 실제 덱까지 산 사람 꽤 많을 듯",
  ],
  [
    "메타 평가는 갈려도 {theme} 일러 평가는 만장일치네",
    "{theme} 굿즈부터 찾는 사람들 벌써 생겼네",
    "나흘 지나도 {part} 일러 확대 글이 계속 올라오는 거 보면 디자인은 성공했다",
    "{theme} 색감으로 플레이매트 만들면 바로 살 사람 많겠는데",
    "성능 평가는 정리됐는데 팬아트 쪽은 이제부터 시작인 분위기",
    "카드명 하나하나가 설정 떡밥이라 비주얼 좋아하는 층 제대로 잡았네",
    "풀아트 가격이 덱 파츠보다 먼저 오르는 테마는 역시 다르다",
    "일러 취향 하나로 장기 팬 생기는 게 카드게임의 묘미지",
    "{part} 비주얼은 유행 지나도 바인더 첫 장에 둘 만하다",
    "색감 때문에 같은 레어도로 통일한 덱 사진이 진짜 예쁘네",
  ],
] as const;

const HIGH_ILLUSTRATION_MARKET_COPY = [
  "하이 일러스트 {part}는 컬렉터 수요가 받쳐서 {marketPrice} 시세를 계속 지키네",
  "{part}는 플레이 성적이 흔들려도 하이 일러스트 매물이 {marketPrice} 아래로 잘 안 내려온다",
  "일반판과 달리 {part} 하이 일러스트는 수집 수요 때문에 고가 매물 흐름이 따로 간다",
  "{part} 시세가 {marketPrice}를 버티는 건 채용률보다 컬렉터 수요 영향이 더 커 보임",
  "하이 일러스트 {part}는 매물 자체가 적어서 {marketPrice}에도 찾는 사람이 계속 있네",
  "{part}는 성능용 가격과 수집용 가격이 완전히 갈렸다. 하이 일러스트 시세는 여전히 높음",
] as const;

const LOYALTY_COPY = [
  "{theme} 티어 내려가도 나는 계속 굴린다",
  "신테마 또 나와도 결국 다시 잡게 되는 건 {theme}",
  "성능 말고 카드 분위기 때문에 잡는 덱도 있는 거지",
  "{part} 볼 때마다 이 테마 고른 건 후회 안 함",
  "지원 없어도 연구글 꾸준히 올리는 {theme} 팬들 대단하다",
  "입상은 줄었어도 매장에 {theme} 고정 유저 꼭 한 명씩 있음",
  "{theme} 덱리 저장 폴더만 몇 년째 업데이트하는 중",
  "{part} 처음 뽑았던 날 때문에 이 덱은 못 놓겠다",
  "티어표 맨 아래여도 한 판 제대로 풀리는 맛에 계속 굴린다",
  "새 지원 없어도 매번 환경 맞춰 한두 장 바꾸는 맛으로 굴린다",
  "다른 덱으로 대회 나가도 프리 매치용 가방에는 늘 {theme} 넣어 감",
  "성적보다 이 테마로 이겼을 때 기억이 오래 남아서 계속 하는 거지",
  "{theme} 유저끼리는 덱리 한 줄 달라도 바로 알아보고 이야기 시작함",
  "언젠가 다시 올라올 때까지 {part} 세 장은 절대 안 판다",
] as const;

const FATIGUE_COPY = [
  [
    "또 상대가 {theme}. 요즘 세 판에 한 번은 만나는 듯",
    "강한 건 둘째치고 대회표에 {theme} 이름이 너무 많다",
    "이번 주도 1위 {theme}? 슬슬 새 얼굴 보고 싶음",
    "{theme} 상대법 외우는 게 게임 입문 과정이 돼 버렸네",
    "테마 자체는 좋은데 너무 자주 봐서 좀 질린다",
    "이번 매장도 절반이 {theme}라 매치업 연습은 확실히 되겠네",
    "덱 등록 화면에서 {theme} 이름만 연속으로 뜨는 거 웃기면서도 불안하다",
    "상위 테이블 사진마다 같은 카드가 보여서 새 대회 느낌이 안 남",
    "{theme}가 싫은 건 아닌데 다른 테마 경기 찾기가 너무 어렵다",
    "사이드 세 장이 자연스럽게 전부 {theme} 전용 카드가 됐네",
    "오늘도 첫 판 {theme}. 이제 주사위 굴리기 전에 전개부터 떠오름",
    "다양한 덱 준비해 왔는데 결국 {theme} 상대 플랜만 쓰다 끝났다",
  ],
  [
    "게임 켜기 전부터 {theme} 만날 생각에 피곤함",
    "카운터 넣어도 계속 {theme} 기준으로 덱 짜는 게 더 문제다",
    "친선에서도 {theme}, 대회에서도 {theme}; 다른 덱은 언제 보냐",
    "환경 다양성 얘기할 때 이제 {theme}부터 정리해야 함",
    "{theme} 유저들도 미러전만 잡혀서 지겹다던데",
    "요즘 덱 평가 기준이 강하냐가 아니라 {theme}를 이기냐로 바뀌었음",
    "메인 기믹보다 {theme} 대응 카드가 더 중요한 환경은 오래 못 간다",
    "대진표 절반이 미러면 실력 검증 이전에 집중력부터 갈리겠네",
    "새 덱이 나와도 첫 질문이 {theme}전 되냐인 게 제일 답답하다",
    "카운터를 넣으면 다른 매치업이 무너지고 빼면 {theme}한테 지는 구조",
    "방송 켤 때마다 같은 전개라 해설도 할 말이 없어 보인다",
    "이 정도 점유면 강함보다 반복해서 보는 피로가 더 큰 문제다",
  ],
  [
    "또 {theme}? 오늘은 그냥 게임 끈다",
    "다음 금제에도 {theme} 멀쩡하면 운영 의도 뻔하지",
    "카드명만 보여도 피곤한 단계까지 왔다",
    "이건 1등 테마가 아니라 환경 전체를 잡아먹은 테마다",
    "카운터도 연구도 충분히 했는데 계속 1위면 이제 금제할 때임",
    "{theme} 전개 시작하면 결과보다 또 봐야 한다는 생각이 먼저 든다",
    "환경 적응이라는 말로 몇 주째 같은 덱만 상대하게 두는 건 방치지",
    "사이드도 연구도 한계까지 왔는데 점유율이 안 내려가면 답은 금제뿐임",
    "대회 우승보다 비-{theme} 덱 입상 소식이 더 화제가 되는 지경이다",
    "미러전 잘하는 사람이 아니라 {theme}를 계속 견딘 사람이 우승하는 환경",
    "신제품 나와도 전부 {theme} 아래에서 평가받으면 상품 다양성도 끝난 거지",
    "다음 공지에서도 관찰 중이라고 하면 커뮤니티 진짜 폭발하겠다",
  ],
] as const;

const APPROPRIATE_RESTRICTION_COPY = [
  "이 정도면 {theme} 덱을 죽이지 않고 숨만 고른 금제라 괜찮다",
  "{part} {oldLimit}→{newLimit}, 딱 초동률만 낮추는 선에서 끝냈네",
  "금지까지 갈 줄 알았는데 매수 조정이면 납득 가능",
  "{theme} 유저도 계속 굴릴 수 있고 상대도 대응할 틈 생김",
  "상위권 점유율 생각하면 이 정도 타격은 받아야지",
  "드디어 {part} 카드를 건드렸네. 문제 지점은 제대로 본 듯",
  "덱 삭제가 아니라 고점 조정이라 첫인상은 좋다",
  "다른 테마까지 올라올 자리 생기면 환경 좀 돌겠네",
  "{oldLimit}장에서 {newLimit}장으로 줄인 건 세기는 낮추되 덱의 뼈대는 남긴 선택 같음",
  "{theme} 상대할 때 숨 막히던 빈도만 줄어도 이번 금제는 역할 다한 거지",
  "문제였던 {part}만 정확히 건드리고 나머지 구축은 살려 둔 게 마음에 든다",
  "이 정도 조정이면 금제 뒤에도 연구할 여지가 충분해서 적당해 보임",
  "상위권은 견제하면서 팬덱까지 같이 치우지 않은 선이라 납득함",
  "첫인상은 꽤 정교한 금제네. 체급은 내리고 플레이 감각은 남겼다",
  "{theme} 점유율이 내려가도 완전히 사라질 정도는 아니라 환경 순환에 딱일 듯",
  "한 번에 박살 내기보다 {part} 매수부터 조절해 보는 게 순서상 맞지",
] as const;

const LIGHT_RESTRICTION_COPY = [
  "{part} 실사용 매수는 줄지만 체급 전체를 흔들 정도의 변화는 아닐 듯",
  "완전한 보여 주기 금제는 아니고 작은 일관성 조정에 가까워 보임",
  "{oldLimit}→{newLimit}로 실제 손실은 생기지만 우선 체감부터 볼 만한 강도네",
  "{theme} 구축을 갈아엎기보다 한두 자리 비율만 다시 맞추면 될 것 같다",
  "효과가 아예 없는 제한은 아니지만 환경이 바로 뒤집힐 수준도 아님",
  "{part}를 필요한 만큼 못 넣게 된 건 맞아도 대체재 찾을 여지는 충분하다",
  "작은 조정이라도 누적되면 체감은 생기니 솜방망이라고 단정하긴 이르지",
  "덱의 역할 하나를 살짝 낮춘 정도라 다음 대회 수치가 중요하겠다",
  "숫자만 바꾼 건 아니지만 타격 범위는 좁고 강도도 낮은 편임",
  "{part} 매수 감소가 특정 손패에서만 드러날지 전체 승률까지 갈지 지켜보자",
] as const;

const OVERKILL_RESTRICTION_COPY = [
  "{part} {newLimit}장은 사실상 덱 해체하라는 소리잖아",
  "이건 조정이 아니라 {theme} 유저한테 접으라는 공지임",
  "점유율 떨어지는 중이었는데 왜 지금 이렇게 세게 자름?",
  "한 파츠가 아니라 구축 전체를 같이 죽였네",
  "금제 한 번에 투자금 날아가는 맛 진짜 최악이다",
  "상위권 몇 주 있었다고 테마 존재 자체를 지워 버리네",
  "카운터 연구 막 시작됐는데 기다리지도 않고 과잉 대응함",
  "{part}만 줄여도 됐는데 왜 다른 축까지 못 쓰게 만듦?",
  "{oldLimit}장에서 {newLimit}장까지 바로 내리는 건 단계 조절이라는 걸 모르는 수준임",
  "{theme} 승률만 낮추려다 덱의 기본 동작까지 없애 버렸네",
  "이 정도면 환경 조정이 아니라 해당 테마 사용 금지 공지 아닌가",
  "사이드 카드로 충분히 잡히던 덱을 왜 본체째 밀어 버리는지 모르겠다",
  "{part} 의존도 뻔히 알면서 여기까지 자른 건 유저 자산을 너무 가볍게 본 거지",
  "한 시즌 강했다고 핵심축을 통째로 끊으면 누가 오래 덱을 잡고 있겠냐",
  "조금씩 낮춰 볼 선택지도 있었는데 처음부터 최대 타격을 넣어 버렸네",
  "다음 대회에서 {theme}가 한 명도 안 보여도 이건 성공한 금제가 아님",
] as const;

const COSMETIC_RESTRICTION_COPY = [
  "{part} 원래 한 장 쓰는데 {newLimit}장 제한이 무슨 의미임 ㅋㅋ",
  "진짜 문제 파츠는 놔두고 또 숫자만 바꿨네",
  "{oldLimit}→{newLimit}로 체감될 거라 생각한 사람이 있나",
  "금제표는 길어 보이는데 {theme} 전개는 어제랑 똑같음",
  "핵심 초동 그대로면 다음 주도 {theme} 1등이지",
  "한 달 더 벌어 주는 회피 금제처럼 보인다",
  "이걸 금제했다고 생색낼 거면 차라리 아무것도 하지 마라",
  "우회 루트 다 알려진 뒤에 주변 파츠만 건드렸네",
  "{part} 한 장 줄어도 서치가 넘치는데 이게 무슨 제재냐",
  "{theme} 덱리에서 숫자 하나만 바뀌고 최종 필드는 그대로겠네",
  "핵심 루프는 멀쩡한데 보조 카드 매수만 만지는 전형적인 보여 주기 금제",
  "{newLimit}장이어도 필요한 순간에 다 찾아오는데 체감이 생길 리가 없음",
  "금제표 칸은 채웠지만 실제 게임에는 아무 변화도 없을 것 같다",
  "다들 문제라고 한 카드는 피하고 또 대체 가능한 파츠를 골랐네",
  "{oldLimit}→{newLimit} 숫자만 보면 세 보여도 구축 손실은 거의 제로임",
  "이 정도 솜방망이면 {theme} 유저도 덱 수정하다 말 듯 ㅋㅋ",
] as const;

const NO_CHANGE_RESTRICTION_COPY = [
  "이번 금제 변경 없음 실화냐? {theme} 덱을 그대로 두고 뭘 지켜본다는 거임",
  "금제위원회 모여서 결론이 현행 유지면 공지는 왜 한 거냐 ㅋㅋ",
  "핵심인 {part}조차 안 건드렸네. 다음 환경도 똑같겠음",
  "카운터 연구를 한 사이클 더 보려는 선택이라면 이해함",
  "아무것도 안 자른 게 무책임한 건지 신중한 건지는 대회 봐야 알 듯",
  "변경 없음이면 최소한 왜 유지했는지 데이터라도 같이 보여 줘라",
  "다음 금제까지 또 {theme} 기준으로 덱 짜라는 뜻이네",
  "성급하게 덱 죽이는 것보단 낫다. 며칠은 실제 분포부터 보자",
  "현행 유지가 결론이면 {theme} 환경이 건강하다는 근거라도 자세히 풀어 줬으면",
  "{part} 건드릴지 말지 기대했는데 결국 다음 대회로 판단을 넘겼네",
  "변경 없음 자체는 가능한 선택인데 설명이 짧으니 불만만 커지는 듯",
  "지금 밸런스가 괜찮다면 굳이 금제표를 채우지 않은 건 오히려 맞는 판단임",
  "한 사이클 더 관찰한다는 거면 점유율과 승률 기준은 미리 밝혀 줘라",
  "{theme} 카운터가 자리 잡는 중이라 기다린 거라면 다음 분포가 중요하겠네",
  "아무 카드도 안 잘랐으니 이제 운영 판단이 맞았는지는 결과로 증명해야지",
  "괜히 희생양 하나 고르는 것보다는 유지가 낫지만 커뮤니티가 조용할 리는 없겠다",
] as const;

const NO_CHANGE_FOLLOWUP_COPY = [
  "변경 없음 발표 뒤에도 {theme} 덱 논쟁은 그대로네",
  "현행 유지가 맞았는지는 다음 대회 분포로 판단해야 할 듯",
  "카운터 연구에 시간을 더 준 결정이면 최소한 근거는 공개해 줬으면",
  "아무것도 안 바꾼 만큼 다음 금제까지 관찰 기준은 명확해야 함",
  "{part} 카드가 정말 문제인지 한 사이클 더 보겠다는 뜻인가",
  "섣불리 자르지 않은 건 좋지만 환경이 그대로면 책임도 더 커짐",
  "변경 없음 자체보다 설명 없는 현행 유지가 더 답답하다",
  "자연스럽게 점유율이 내려갈지 며칠은 지켜보자는 의견도 이해됨",
  "현행 유지 이후 첫 대회가 사실상 금제위원회 판단 시험대가 됐네",
  "{theme} 비율이 그대로면 이번 관찰 결정도 다시 평가해야 할 듯",
  "변경 없음으로 번 시간을 카운터 연구가 실제로 채울 수 있을지가 핵심임",
  "{part} 관련 데이터가 더 필요했다면 다음 발표에는 수치까지 보고 싶다",
  "한 사이클 더 본 만큼 다음에는 같은 설명만 반복하지 않았으면",
  "유지 결정 뒤 랭크 체감이 갈리는 걸 보니 아직 결론 내리긴 이른 듯",
] as const;

const NO_CHANGE_MEME_COPY = [
  "금제표 공개: 변경 없음 / 내 사이드 덱: 계속 야근",
  "금제위원회 회의 결과가 Ctrl+S였네 ㅋㅋ",
  "오늘의 변경점: 금제표 날짜만 바뀜",
  "{theme} 덱 박스 다시 넣으려다 그대로 꺼내 둠",
  "현행 유지 네 글자로 커뮤니티 하루 종일 불타는 중",
  "금제 발표 전후 차이 찾기 게임 난도 최상",
  "{part} 카드 이름만 또 실시간 검색어 올라가겠네",
  "이번 금제 요약: 다음 금제를 기다려 주세요",
  "금제위원회 덱리 제출: 지난 시즌 리스트 복사 붙여넣기",
  "변경 없음 보고 내 사이드 카드들이 단체로 재계약함",
  "{theme} 유저 오늘 할 일: 슬리브 먼지만 털기",
  "패치 노트 용량 0KB인데 댓글은 만 개 달림 ㅋㅋ",
  "금제 발표 방송 세 줄 요약: 그대로, 그대로, 그대로",
  "{part} 제한 예상표 만들던 사람들 파일명만 다음 시즌으로 바꾸는 중",
] as const;

const NO_CHANGE_HEALTHY_COPY = [
  "지금 분포면 억지로 자르기보다 현행 유지가 더 나아 보임",
  "카운터 연구가 진행 중이면 한 사이클 더 보는 것도 운영이지",
  "상위권이 여러 테마로 갈려 있는데 굳이 희생양을 만들 필요 있나",
  "불쾌한 패턴이 두드러지지 않는 환경이면 변경 없음도 선택임",
  "금제는 매번 카드를 자르는 행사가 아니니 이번 유지는 납득함",
  "성급하게 {theme} 덱을 건드리지 않은 건 괜찮아 보인다",
  "표본이 더 쌓일 때까지 {part} 카드를 지켜보자는 쪽에 한 표",
  "환경이 자연스럽게 순환 중이면 현행 유지가 가장 작은 개입이지",
  "아무것도 안 한 게 아니라 지금은 건드릴 이유가 적었다고 봄",
  "분포가 고른 편이면 다음 대회까지 관찰해도 늦지 않다",
  "카운터 선택지가 남아 있는 동안은 금제보다 연구가 먼저일 듯",
  "이번 변경 없음은 방치라기보다 과잉 대응을 피한 결정에 가깝다",
  "상위권 비율이 계속 바뀌는 중이면 지금은 현행 유지가 가장 안전함",
  "{theme}만 보고 자르기엔 입상 분포가 넓어서 한 사이클 더 지켜보자",
  "답이 있는 환경이라면 금제보다 연구가 먼저라는 판단도 충분히 가능하지",
  "{part}를 건드리지 않은 이유가 현재 데이터로는 꽤 납득된다",
  "변경 없음도 선택이다. 지금 균형에서 억지 개입이 더 위험할 수 있음",
  "메타가 스스로 움직이는 동안은 관찰하고 정말 굳을 때 손대면 된다",
] as const;

const NO_CHANGE_CRITICAL_COPY = [
  "이 환경을 보고도 아무것도 안 자르냐? 운영이 문제를 방치하네",
  "솜방망이도 아니고 손을 아예 놨네. 다음 금제까지 또 버티라고?",
  "현행 유지가 아니라 고착된 메타를 다음 금제로 미룬 거지",
  "점유율과 피로도에 경고등이 켜졌는데 변경 없음은 납득이 안 됨",
  "카운터 연구 핑계로 환경 개선 책임을 유저에게 떠넘기는 느낌",
  "다른 테마가 숨 쉴 틈이 없는데 {theme} 덱을 그대로 둔다고?",
  "변경 없음이 가장 강한 메시지네. 운영은 지금 환경이 괜찮다는 거잖아",
  "다음 금제까지 기다리라는 말로는 지금 쌓인 피로를 설명 못 함",
  "{part} 카드가 계속 지목되는데 검토 결과가 현행 유지뿐이라고?",
  "이 정도 고착에도 손대지 않으면 금제 기준이 대체 어디부터임",
  "환경 개선보다 현상 유지를 택한 이유를 데이터로 설명해야 함",
  "변경 없음 발표가 솜방망이 금제보다 더 답답할 줄은 몰랐다",
  "문제가 보이는데도 관찰만 반복하면 그건 신중함이 아니라 방치임",
  "상위권 집중이 풀릴 근거도 없는데 또 자연 순환만 기다리네",
  "유저가 대응법을 찾는 것과 운영이 균형을 잡는 건 별개 문제임",
  "이번에도 그대로면 {theme} 기준으로만 덱 짜는 환경이 굳어지겠네",
  "상위권 집중 수치가 이렇게 뻔한데 현행 유지라니 보고 싶은 것만 본 거 아님?",
  "다른 덱이 숨 쉴 틈도 없는데 또 카운터 카드로 알아서 버티라는 거네",
  "{part} 검토 결과가 아무 조치 없음이면 금제 기준부터 다시 설명해야 함",
  "쌓인 피로가 수치로 보이는데 다음 금제로 미룬 건 책임 회피에 가깝다",
  "환경 개선보다 발표 때 욕 덜 먹는 선택을 한 것처럼 보여서 더 답답함",
  "이 상황에서 관찰을 더 하자는 건 신중함이 아니라 방치라는 말이 맞음",
] as const;

const UNBAN_OVERDUE_COPY = [
  "{theme}가 티어 밖에서 헤맨 지 한참인데 {part} 카드를 왜 이제야 풀어 줌?",
  "{restrictedDays}일 동안 묶어 둘 근거가 대체 뭐였는지부터 설명해 줬으면",
  "점유율 {decisionShare}까지 내려간 덱을 이제 풀면 이미 떠난 사람은 누가 돌아오냐",
  "{part} {oldLimit}장 제한을 이렇게 오래 유지한 게 더 이해가 안 된다",
  "해제는 반갑지만 {theme} 유저 입장에서는 너무 늦은 정상화임",
  "그동안 왜 묶었냐는 말밖에 안 나옴. 환경에 보이지도 않던 덱인데",
  "몇 시즌을 기다렸는데 이제야 {newLimit}장이라니 운영 속도가 너무 느리다",
  "진작 풀었어도 메타에 아무 일 없었을 카드 아닌가",
  "{theme} 입상 끊긴 뒤에도 금제를 유지한 이유를 아직 모르겠음",
  "해제 공지보다 {restrictedDays}일이나 걸렸다는 사실이 더 놀랍다",
  "유저 다 빠지고 카드값 다 내려간 다음에 풀어 주는 건 구제가 아니지",
  "{part}가 위험하다는 옛날 평가만 붙잡고 너무 오래 겁먹었다",
  "이제라도 푼 건 다행인데 다음부터는 저점유 테마를 이렇게 방치하지 마라",
  "금제는 빨랐고 해제는 한없이 늦었다는 말이 딱 맞네",
  "{rank}위까지 밀린 뒤에야 정상화해 주면 경쟁 시즌은 이미 다 끝났지",
  "왜 이제야 {part}를 돌려주는지 모르겠다. 묶인 동안 환경이 몇 번을 바뀌었는데",
  "그동안 왜 제한을 유지했는지 기록이라도 남겨야 다음에도 같은 방치가 안 나옴",
  "{theme} 유저가 다 떠난 다음 해제하는 건 늦어도 너무 늦었다",
  "{restrictedDays}일이나 걸렸으면 최소한 오래 묶어 둔 판단은 복기해야지",
  "금제는 빨랐는데 완화 검토만 계절 단위로 미루는 운영은 고쳐야 함",
] as const;

const UNBAN_DANGEROUS_COPY = [
  "{theme}가 아직 상위권인데 {part}를 왜 풀어? 대체 무슨 데이터를 본 거임",
  "상대하기 불쾌한 패턴도 그대로인데 핵심 카드 매수부터 되돌리네",
  "점유율 {decisionShare}인 덱에 해제까지 주면 독주하라는 얘기 아닌가",
  "겨우 눌러 둔 {theme} 봉인을 운영이 직접 다시 열었다",
  "{part} {newLimit}장 허용은 환경 안정화와 정반대 선택 같은데",
  "아직 카운터도 {theme} 기준으로 넣는 판에 왜 지금 풀어 줌?",
  "상위 덱은 제한 하나 풀고 하위 덱은 지원 기다리라는 운영 멋지다",
  "해제 명분이 메타 순환이면 이미 위에 있는 덱부터 고른 게 이상함",
  "불쾌도 높은 테마에 일관성까지 돌려주는 건 위험 신호다",
  "다음 대회가 {theme} 미러전으로 도배돼도 놀랍지 않겠네",
  "제한 상태에서도 충분히 강했는데 완전체로 복구할 이유가 있었나",
  "왜 풀었냐는 질문에 매출 말고 답할 수 있는 근거가 있긴 함?",
  "{part}가 다시 세 장이면 예전에 금제한 문제도 그대로 돌아오는 거잖아",
  "운영이 환경 피로를 너무 빨리 잊은 것 같다",
  "왜 풀었는지 진짜 모르겠네. 제한 중에도 {rank}위면 이미 충분히 강했잖아",
  "상위권 테마에 안정성까지 복구해 주면 독주 가능성부터 보는 게 맞지",
  "{part} 봉인 풀리면 예전 불쾌 패턴도 같이 돌아온다는 걸 잊었나",
  "해제 전 점유율이 {decisionShare}인데 안전하다고 본 근거가 너무 위험함",
  "다음 입상표가 {theme} 미러전으로 차면 이번 판단은 변명하기 힘들겠다",
  "환경 피로가 아직 남았는데 강했던 축부터 되살리는 순서를 이해 못 하겠음",
] as const;

const UNBAN_SURGE_COPY = [
  "봐라, {part} 풀자마자 {theme} 점유율이 {delta}p 뛰었잖아. 왜 풀었냐고",
  "봉인 해제 하루 만에 {theme}가 다시 상위권 복귀하는 속도 실화냐",
  "해제 전에는 괜찮다더니 분포 그래프가 바로 수직으로 섰네",
  "{theme} 다시 안 뜬다던 사람들 어디 감? {part} 한 장 차이가 이 정도임",
  "점유율 {share}, 봉인 풀자마자 옛날 자리 찾아가는 중",
  "금제 해제 효과가 없을 거라던 예측을 하루 만에 뒤집어 버렸네",
  "{part} 매수 복구되자마자 랭크에서 {theme} 연속으로 만난다",
  "상위 재진입 속도를 보니 제한이 괜히 있던 게 아니었다",
  "다시 봐도 왜 풀었는지 모르겠다. 반등 폭이 너무 노골적임",
  "{theme} 덱리 업데이트되자마자 대회 준비방 전부 그 얘기뿐이네",
  "해제 카드 한 장이 메타 시계를 과거로 돌려놨다",
  "이 추세면 다음 금제에서 방금 푼 카드를 다시 묶는 촌극 나오겠음",
  "봉인 풀자마자 복귀 완료. 운영 실험 비용은 또 유저가 내네",
  "{rank}위까지 올라온 걸 보면 이번 해제는 영향 미미와 거리가 멀다",
  "해제 뒤 {delta}p 급등이면 반등이 아니라 그냥 원래 왕좌 복구잖아",
  "{theme} 복귀 속도 봐라. 최적화도 끝나기 전에 벌써 분포가 움직임",
  "그래프가 수직으로 오르는 중인데 아직 표본 타령만 할 건가",
  "상위 재진입까지 며칠도 안 걸렸네. {part} 영향력이 생각보다 훨씬 컸다",
  "다시 안 뜬다던 예상과 달리 랭크가 벌써 {theme} 천지임",
  "이 추세 그대로면 메타 시계만 과거로 돌린 해제로 남겠는데",
] as const;

const UNBAN_NO_IMPACT_COPY = [
  "{part} 풀린 뒤에도 {theme} 점유율이 거의 그대로인데 그동안 왜 안 풀었냐",
  "해제 전후 차이가 {delta}p면 운영이 괜히 겁먹고 있었던 거 아닌가",
  "{newLimit}장으로 돌아왔는데 아무 일도 없네. 진작 풀어도 됐겠다",
  "환경 파괴 걱정하더니 {theme} 매칭 횟수부터 달라진 게 없음",
  "{restrictedDays}일 제한의 결론이 영향 없음이면 기준을 다시 봐야지",
  "카드 한 장 더 넣을 수 있게 됐는데 덱리조차 거의 안 바뀌었다",
  "해제 발표 때만 시끄럽고 실제 분포는 미동도 없네",
  "그동안 {part}를 위험 카드처럼 묶어 둔 게 과잉 대응이었다는 증거 아님?",
  "{theme} 유저는 편해졌지만 티어표에는 아무 변화도 없다",
  "이 정도 영향이면 다음 완화 후보도 훨씬 빨리 검토해야 함",
  "금제 해제보다 오래된 운영 판단이 틀렸다는 쪽이 더 큰 뉴스네",
  "막상 풀어 보니 아무도 안 쓰는 구축도 많다. 너무 오래 무서워했다",
  "점유율 {share} 그대로면 이 카드를 계속 제한할 이유가 대체 뭐였음",
  "해제해도 조용한 걸 보니 카드보다 시대가 이미 바뀐 거였네",
  "랭크 분포가 거의 그대로라 해제 공지가 있었는지도 모를 정도임",
  "{part}가 돌아왔는데 아무 변화 없으면 진작 완화했어도 됐잖아",
  "운영이 괜히 겁먹고 묶어 둔 기간만 {restrictedDays}일 늘어난 셈이네",
  "입상표도 매칭 체감도 조용하다. 이번 해제는 영향 없음에 가까움",
  "점유율이 미동도 없는데 과잉 대응이 아니었다고 설명할 수 있나",
  "{theme} 덱리에 선택지만 하나 늘었을 뿐 메타에서 달라진 게 없다",
] as const;

const UNBAN_MEASURED_COPY = [
  "{theme}가 적당히 복귀하는 정도라면 이번 {part} 해제는 괜찮아 보임",
  "티어표 새 얼굴이 돌아온 건 환영. 독주만 안 하면 된다",
  "{newLimit}장 구축이 선택지를 늘렸지만 당장 환경을 망칠 수준은 아님",
  "오래된 테마가 다시 대회에 보이는 정도의 변화는 메타 순환에 필요하지",
  "{theme} 유저도 숨통 트이고 상대도 대응 가능한 선이라 첫인상은 좋다",
  "해제 후 {delta}p 상승이면 의도한 복귀 폭에 가까워 보인다",
  "금제는 영구 추방이 아니니까 상황 맞으면 이렇게 돌려주는 게 맞음",
  "{part} 복귀로 옛 구축과 새 구축이 갈리는 건 재밌다",
  "상위권 문은 두드리되 바로 1등은 아닌 정도라 균형이 괜찮네",
  "해제 카드가 테마 정체성을 살리면서도 과한 고점을 만들지는 않았다",
  "이번 완화는 늦지도 성급하지도 않은 적정 시점에 가까움",
  "{theme}가 다시 경쟁권에 들어온 건 환영할 만한 변화다",
  "분포가 이 선에서 멈추면 성공적인 금제 해제 사례로 남을 듯",
  "죽은 카드를 돌려주면서 환경도 흔드는 정도가 딱 적당하다",
  "{share} 선에서 자리 잡는다면 복귀 폭도 적당하고 대응 여지도 충분함",
  "예전 유저가 돌아오고 새 구축 선택지도 생긴 건 환영할 변화지",
  "메타 순환은 이런 식으로 오래된 덱을 경쟁권에 돌려주는 게 제일 건강함",
  "{part} 해제로 숨통은 트였지만 압도하는 수준은 아니라 균형이 좋아 보임",
  "과거 테마를 살리면서 다른 덱 자리도 남긴 성공적인 완화에 가까움",
  "지금 정도 반등이면 운영이 노린 적당한 정상화라고 봐도 되겠다",
] as const;

const UNBAN_CAUTION_COPY = [
  "해제 첫 며칠 표본만으로 성공이나 실패를 단정하기는 이르다",
  "{theme} 사용자가 잠깐 몰린 건지 실제 체급 변화인지는 더 지켜봐야 함",
  "{part} 매수 복구가 대회 결과에 반영되려면 최소 한 주는 필요하지",
  "첫날 점유율보다 최적화 끝난 뒤 승률 데이터를 보는 게 맞다",
  "오래 묶였다고 무조건 안전한 카드가 된 건 아니니 신중하게 관찰하자",
  "해제 자체는 반갑지만 우회 루트까지 발견되면 평가는 달라질 수 있음",
  "지금 반등은 복귀 유저 효과일 가능성도 있어서 표본을 더 봐야 한다",
  "아무 변화 없어 보여도 덱 연구가 끝나기 전까지 방심은 이르다",
  "왜 풀었냐고 욕하기 전에 실제 대회 분포 한 번은 확인하자",
  "{theme}가 강해져도 다른 테마가 대응하면 적정 해제일 수 있다",
  "금제 해제는 되돌릴 수 있으니 며칠 데이터부터 차분히 쌓으면 됨",
  "과거 악명만으로 계속 묶는 것도, 첫 반등만 보고 다시 묶는 것도 성급하다",
  "현재 {rank}위라는 숫자 하나보다 매치업 분포까지 같이 봐야 함",
  "환영이든 반발이든 아직은 결론보다 관찰 기준을 세울 때다",
  "복귀 직후 표본은 팬들이 몰린 영향도 있으니 최소 한 주는 지켜봐야지",
  "{delta}p 변화만 보고 성급하게 재금제를 말하기엔 데이터가 아직 부족함",
  "최적화가 진행되면 지금과 달라질 수 있으니 승률 추세까지 확인하자",
  "{theme}가 올라와도 기존 상위권이 대응하면 결과는 달라질 가능성이 있음",
  "첫 입상만으로 결론 내리지 말고 매치업 분포와 사이드 적응을 같이 관찰해야 함",
  "며칠 반짝한 건지 안정적으로 자리 잡은 건지는 다음 대회까지 봐야 한다",
] as const;

const STALE_RESTRICTION_COPY = [
  "{theme} 티어 밖으로 밀려난 지 오래인데 {part} 아직 제한인 거 다들 잊은 거 아님?",
  "금제 {restrictedDays}일째, 점유율 {share}짜리 덱을 왜 계속 묶어 두냐",
  "{part} 제한은 이제 금제표 화석 같은데 해제 검토조차 안 하나",
  "입상도 안 보이는 {theme}에 {limit}장 제한을 유지할 이유가 남아 있음?",
  "강했던 시절 데이터로 지금까지 묶는 건 너무 게으른 운영이다",
  "{theme} 유저들은 지원보다 {part}부터 돌려달라고 한 지 몇 달 됐음",
  "다음 금제에도 현행 유지면 이 카드는 왜 제한인지 아무도 설명 못 할 듯",
  "환경에서 사라진 덱의 핵심 카드만 아직도 복역 중이네",
  "금제할 때는 일주일, 풀어 줄 때는 {restrictedDays}일 넘게 걸리는구나",
  "{part} 풀어도 지금 상위권에 비빌까 말까인데 뭘 그렇게 겁냄?",
  "티어표 아래에도 없는 {theme} 제한은 언제까지 방치할 거냐",
  "오래된 제한을 검토하지 않으면 금제표가 카드 공동묘지 되는 거지",
  "{theme} 점유율 보고도 {part}가 위험하다는 결론이면 기준 공개 좀",
  "카드가 세서 묶은 건 알겠는데 시대가 바뀐 것도 좀 반영해라",
  "이 정도 장기 제한이면 해제하지 않을 근거를 운영이 먼저 증명해야 함",
  "금제표 볼 때마다 {part}가 아직 {limit}장인 게 제일 신기하다",
  "{rank}위 테마 핵심이 아직 제한인 건 금제표 정리 자체를 안 한다는 뜻 아닌가",
  "입상 기록도 끊겼는데 {part}를 왜 계속 묶어 두는지 이제는 설명이 필요함",
  "{restrictedDays}일 장기 제한이면 자동으로라도 해제 검토 안건에 올려야지",
  "티어표에서 사라진 {theme}만 금제표 공동묘지에 남아 있네",
  "시대가 바뀐 뒤에도 옛날 위험도만 들고 제한 유지할 이유가 없다",
  "{part} 아직 제한이라는 말에 다들 놀라는 것부터 이미 방치된 금제임",
  "점유율 {share}인데 뭘 그렇게 겁내서 {limit}장으로 계속 막아 두냐",
  "복역 기간이 {restrictedDays}일이면 이제는 카드보다 운영 판단이 더 오래된 문제임",
] as const;

const COLLATERAL_RESTRICTION_COPY = [
  "왜 {part}부터 자름? 문제는 그다음 결과물인데",
  "{theme} 덱을 잡으려다 다른 순수축까지 맞는 건 아닌지 걱정됨",
  "출장 때문에 제한했으면 테마 내 사용은 살려 줄 방법 없었나",
  "입상 한 번 없는 비주류 덱이 또 연좌제로 죽었다",
  "{part} 범용처럼 보이지만 이 덱에서는 생명줄임",
  "문제 파츠는 멀쩡하고 애꿎은 중간다리만 사라졌네",
  "대회 데이터 제대로 봤으면 이 카드를 고를 수가 없음",
  "다른 테마 유저까지 연좌 피해를 보는 금제는 아니었으면",
  "{part}를 공유하던 하위 테마가 상위 덱 대신 더 크게 맞았네",
  "범용 채용률만 보고 자르면 원래 주인이던 {theme} 구축은 어떡함",
  "문제 콤보는 따로 있는데 재료 카드만 제한해서 주변 덱까지 손해 봄",
  "출장 채용을 막겠다고 순수축의 초동까지 줄인 건 설계가 너무 거칠다",
  "이 금제로 실제 원흉보다 애꿎은 팬덱이 먼저 사라질 것 같음",
  "{oldLimit}→{newLimit} 타격이 테마마다 다른데 사용처 구분 없이 자른 게 아쉽다",
] as const;

const GENERIC_RESTRICTION_WIDESPREAD_COPY = [
  "{card} 하나 잘렸는데 덱 {affectedCount}개가 동시에 리스트 다시 짜는 중이네",
  "{leadTheme} 잡으려고 {card}를 쳤더니 {otherTheme}까지 같이 피해 봤네",
  "범용 한 장 금제인데 사실상 {affectedCount}개 덱 동시 금제나 다름없음",
  "{card} {oldLimit}→{newLimit} 한 줄로 대회 덱 절반의 빈칸이 생겼다",
  "아 누구 때문에 {card}가 맞아서 {otherTheme}까지 같이 피해 보냐",
  "{leadTheme}만 약해지는 줄 알았는데 {card} 공유하던 덱이 전부 연쇄 타격이네",
  "테마 이름은 금제표에 하나도 없는데 구축 {affectedCount}개가 같이 흔들리는 게 범용 금제지",
  "{card} 채용 범위 {reach}였으면 이건 단일 카드가 아니라 환경 공용 인프라를 자른 거임",
  "한 덱 핵심을 자른 것보다 {card} 한 장 줄인 쪽이 체감 피해 덱은 더 많겠다",
  "{leadTheme}도 맞고 {otherTheme}도 맞고, 안 쓰던 덱만 조용한 금제네",
  "오늘 덱리 게시판 전부 {card} 빠진 자리에 뭘 넣냐는 얘기뿐임",
  "{card}를 공용 안전망처럼 쓰던 덱들이 한꺼번에 맨몸이 됐네",
  "범용 금제는 공지 한 줄인데 수정해야 할 덱리 수가 너무 많다",
  "{affectedCount}개 테마가 같은 카드를 나눠 쓰고 있었던 것부터 환경이 얼마나 획일적이었는지 보임",
  "금제표에는 {card} 하나, 실제 피해 목록에는 {leadTheme}부터 {otherTheme}까지 줄줄이네",
  "{keyword} 파츠 공유하던 덱들이 동시에 같은 숙제를 받은 날이다",
  "내 덱은 대상 아닌 줄 알고 웃었는데 엑스트라가 아니라 {card} 자리부터 비었네",
  "범용 한 장이 여러 테마 체급을 같이 받치고 있었다는 게 제한되자마자 드러남",
  "{card} 한 장 덜 쓰는 문제가 아니라 그 카드 전제로 짠 교환 비율이 전부 바뀌었음",
  "이 정도 공용 채용 카드면 금제 파급을 테마 하나 수치로만 보면 안 되지",
  "{leadTheme} 저격처럼 보여도 실제로는 {affectedCount}개 덱에 세금을 붙인 조정이네",
  "오늘 가장 많이 한 말: 우리 덱도 {card} 쓰고 있었네",
  "직접 맞은 덱보다 옆에서 같이 맞은 덱이 더 많은 희한한 금제다",
  "{card}가 사라진 슬롯을 전부 다른 카드가 나눠 먹을 테니 후속 메타도 크게 움직이겠네",
] as const;

const GENERIC_RESTRICTION_WELL_RIDDANCE_COPY = [
  "{card}는 진짜 개나소나 쓰던 거라 잘 갔다",
  "덱마다 첫 세 장이 {card}였던 환경이면 이제 제한될 때도 됐지",
  "또 {card}냐 소리 안 들어도 되는 것만으로 이번 금제 만족함",
  "범용이라는 이름으로 사실상 필수 카드였는데 {newLimit}장이면 속 시원하네",
  "테마가 달라도 매판 {card}부터 보이던 건 카드풀이 넓은 의미가 없었음",
  "{card} 안 쓰는 덱이 손해 보던 구조가 이제야 끝나나",
  "어느 덱을 만나도 같은 {card}에 막히는 환경은 잘린 게 맞다",
  "{reach} 채용 범위면 범용이 아니라 준필수였지. 잘 갔다",
  "덱 개성 얘기하면서 전부 {card} {oldLimit}장 넣는 그림부터 이상했음",
  "금제 발표 보자마자 제일 먼저 든 생각이 드디어 {card}구나였음",
  "이 카드는 대체재가 없어서 건강한 게 아니라 너무 좋아서 대체재를 안 봤던 거지",
  "{card} 때문에 선공 후공 플랜이 똑같아지는 판 너무 많이 봤다",
  "성능 좋은 범용도 선이 있는데 {card}는 그 선을 오래 넘었음",
  "누가 우승해도 덱리 한가운데 {card}가 있던 시절은 여기까지네",
  "{keyword} 덱 전용도 아닌데 그쪽 장점까지 제일 잘 쓰던 게 문제였지",
  "제한 반대하는 사람 덱리 열어보면 전부 {card} 세 장이라 더 웃김",
  "비싼 공용 카드라 못 산 사람이 약했던 환경이면 접근성 면에서도 잘 잘랐다",
  "{card} 없는 덱을 실험할 이유가 생긴 것만으로 카드풀은 더 넓어질 듯",
  "범용 슬롯 자동 입력 버튼 하나 삭제된 셈이라 오히려 구축하는 맛은 돌아오겠네",
  "금지까지는 몰라도 {oldLimit}→{newLimit} 정도는 진작 했어야 했다",
] as const;

const GENERIC_RESTRICTION_COLLATERAL_COPY = [
  "{leadTheme} 때문에 {card}가 맞아서 조용히 쓰던 {otherTheme}만 더 아픈 거 아니냐",
  "상위 덱은 대체재 찾겠지만 {otherTheme}는 {card} 없으면 빈칸을 뭘로 메움?",
  "범용 채용률만 보고 자르면 그 카드를 생명줄로 쓰던 비주류가 항상 먼저 죽음",
  "{card}를 가장 잘 쓴 덱과 가장 절실하게 쓴 덱은 다를 수 있는데 같이 잘랐네",
  "문제는 {leadTheme}의 체급인데 {otherTheme}까지 같은 세금 내는 방식이 맞나",
  "상위권은 {replacement}로 갈아타고 하위권만 순수 손실 보는 그림이 벌써 보임",
  "범용 금제가 공평해 보이지만 원래 약한 덱에는 같은 한 장이 더 크게 느껴진다",
  "{card} 없애면 강한 덱끼리 격차보다 약한 덱의 방어 수단부터 줄 수도 있음",
  "{affectedCount}개 덱이 썼다는 건 문제 카드라는 근거이면서 연좌 피해 규모이기도 함",
  "다 같이 쓰던 카드니까 다 같이 맞으라는 건 밸런스 논리로 너무 거칠다",
  "{otherTheme} 유저는 입상도 못 했는데 왜 {leadTheme}랑 같이 벌 받냐고 할 만함",
  "공용 파츠를 자를 때는 어느 덱이 대체 가능하고 어느 덱이 불가능한지도 봐야지",
  "{card}가 센 건 맞아도 이걸 자른 뒤 살아남는 덱이 누구인지는 별개 문제임",
  "원흉은 특정 콤보인데 공용 대응 카드부터 사라진 건 순서가 반대 아닌가",
  "{leadTheme}는 본체가 남고 {otherTheme}는 유일한 고점이 사라졌을 수도 있음",
  "범용 금제 명분은 넓은데 피해 분석은 카드 이름 한 줄로 끝내면 안 된다",
  "{card} 제한 자체보다 아무 상관 없는 덱들이 같이 맞는 게 제일 논쟁거리네",
  "강한 덱은 공용 파츠를 바꾸면 끝이고 팬덱은 구축 이유를 잃을 수도 있다",
  "이럴 때 금제 영향표에 {leadTheme}만 쓰지 말고 {otherTheme}까지 같이 적어야 함",
  "범용을 손보는 게 피해가 작을 거라는 생각부터 틀렸다는 사례가 될 듯",
] as const;

const GENERIC_RESTRICTION_REBUILD_COPY = [
  "{card} 자리에는 일단 {replacement} 넣는 리스트가 제일 많이 보이네",
  "하루 지나니 {leadTheme}는 {replacement}로 갈아탔고 {otherTheme}는 아직 답 못 찾은 듯",
  "{card} 빠진 자리를 한 장으로 못 메워서 범용 비율 자체를 다시 짜는 중",
  "예전엔 고민 없이 {card}였는데 이제 덱마다 대체 카드가 갈리는 건 재밌다",
  "{replacement} 가격 오르는 속도 보니 다들 같은 생각부터 했구나",
  "{card} {newLimit}장에 맞춰 나머지 두 자리를 엔진으로 돌리는 구축도 나오네",
  "대체재가 약한 게 아니라 {card}가 너무 완벽해서 안 보였던 카드들이었음",
  "{leadTheme}는 공격적으로 바꾸고 {otherTheme}는 방어적으로 바꾼 게 덱 성격 차이 잘 보인다",
  "공용 정답 하나 빠지니까 같은 테마 안에서도 덱리가 여러 갈래로 퍼지네",
  "{card} 대체 카드 찾다가 아예 {keyword} 플랜을 포기한 구축도 보인다",
  "금제 직후엔 {replacement}가 정답 같아도 환경 바뀌면 또 달라질 수 있음",
  "한 장 대 한 장 교체로 끝날 줄 알았는데 패트랩 비율까지 전부 연쇄 수정 중",
  "{otherTheme}는 {card} 없으니 원래 테마 카드 비중을 늘리는 쪽으로 가는구나",
  "공용 슬롯이 줄자 사이드 카드가 메인으로 올라오는 덱도 꽤 많네",
  "{card}를 두 장 쓰던 덱과 세 장 쓰던 덱의 복구 속도부터 차이가 난다",
  "{replacement}가 진짜 대체재인지 임시 피난처인지는 주말 대회 보면 알 듯",
  "금제 전 복붙 덱리들이 사라지고 구축자 이름 붙은 리스트가 다시 나오기 시작함",
  "대체재가 분산되면 좋고 또 {replacement} 하나로 몰리면 풍선효과지",
  "{leadTheme}는 버텨도 {otherTheme}가 무너지면 범용 금제의 비대칭 피해가 확인되는 셈",
  "이제 중요한 건 {card}를 뺀 덱이 아니라 빈 슬롯을 제일 잘 쓴 덱이 누구냐임",
] as const;

const GENERIC_RESTRICTION_MARKET_COPY = [
  "{card} 매입가 공지부터 내려간 거 보니 범용 금제는 시장 반응도 빠르다",
  "어제까지 품절이던 {card}가 오늘 매물 여러 장씩 올라오는 중",
  "{oldLimit}장 세트로 산 사람들은 {newLimit}장만 남기고 한꺼번에 파는 분위기네",
  "실사용 수요가 여러 덱에 퍼져 있던 카드라 제한 발표 한 번에 매물이 폭증함",
  "{card} 고레어는 수집가가 받쳐도 일반판은 금제 가격을 바로 맞겠지",
  "범용 카드 가격은 한 덱 인기가 아니라 전체 채용 폭으로 버틴다는 게 이번에 보인다",
  "{replacement} 매물까지 같이 마르는 걸 보면 돈이 사라진 게 아니라 옆 카드로 이동한 거임",
  "금제 전에 {card} 재록 기다리던 사람들은 이제 아예 구매 계획을 접겠네",
  "대회 수요 {reach}가 한 번에 줄면 매장도 매입가 잡기 어렵겠다",
  "{card} 싸졌다고 바로 사기엔 다음 금제 완화까지 너무 오래 남았음",
  "플레이용은 급락하고 최고 레어는 버티는지 판본별 가격 보는 맛이 있네",
  "필수 범용 한 장 가격이 내려가서 덱 전체 견적은 싸졌는데 기분은 묘하다",
  "제한 발표보다 중고 장터 판매 글 올라오는 속도가 더 빨랐음",
  "{card} 가격 하락분이 {replacement} 상승분으로 그대로 옮겨갈 가능성도 크다",
] as const;

const GENERIC_RESTRICTION_CAUTION_COPY = [
  "범용 하나 잘랐다고 환경이 좋아졌다고 결론 내리기엔 대체재 정착이 아직 안 끝남",
  "{card}가 문제였는지 그 카드를 쓰게 만든 상위 덱이 문제였는지는 며칠 더 봐야 함",
  "여러 덱이 같이 약해지면 상대적으로 아무 타격 없는 덱이 갑자기 튈 수도 있다",
  "{affectedCount}개 덱 동시 타격이면 점유율 이동도 단일 테마 금제보다 복잡하겠네",
  "{card}가 사라져서 다양해질지 {replacement}로 다시 통일될지가 핵심임",
  "잘 갔다고 끝낼 게 아니라 원래 이 카드를 필요로 한 환경 원인도 같이 봐야지",
  "범용 금제는 직접 피해와 매치업 변화가 반대 방향으로 갈 수도 있음",
  "{leadTheme} 점유율만 내려가도 성공이라고 하면 {otherTheme} 피해는 통계에서 사라진다",
  "첫날 덱리는 급하게 바꾼 거라 실제 최적화 뒤에는 타격 순서가 달라질 수 있음",
  "공용 대응 수단이 줄어 상위 덱이 오히려 더 편해지는 역효과도 확인해야 한다",
  "{card} 제한이 맞더라도 {newLimit}장이 적정선인지는 다음 대회 표본이 필요함",
  "모두가 쓰던 카드를 자른 만큼 모두에게 같은 결과가 나올 거라는 보장은 없다",
  "대체 카드 가격과 채용률까지 굳은 뒤에야 이번 금제의 실제 승자를 알 수 있겠네",
  "파급이 넓은 조정일수록 사흘 반응보다 한 주 뒤 환경을 봐야 한다",
] as const;

const GENERIC_RESTRICTION_RELIEF_COPY = [
  "{card} {oldLimit}→{newLimit} 완화면 관련 덱 {affectedCount}개가 동시에 숨통 트이겠네",
  "범용 해제는 특정 테마 지원보다 복귀 범위가 훨씬 넓다",
  "{leadTheme}만 좋아지는 줄 알았는데 {otherTheme}도 바로 {card} 자리부터 복구하네",
  "오래 묶였던 공용 파츠가 돌아오니 옛 덱리 여러 개가 한꺼번에 살아난다",
  "{card} 풀리자마자 {keyword} 덱뿐 아니라 별별 구축에서 테스트 중이네",
  "한 장 완화로 선택지가 넓어진 건 좋은데 다시 준필수 되는지는 봐야 함",
  "{replacement} 쓰던 자리에 {card}가 바로 돌아오는 걸 보면 대체재 시대는 짧았네",
  "범용 카드 완화는 메타 전체 체급을 올릴 수 있어서 테마 해제보다 더 조심해야지",
  "{reach}까지 다시 올라가면 왜 처음 묶였는지 똑같이 재현될 수도 있음",
  "구축 자유가 돌아온 건 반갑지만 모든 덱 첫 장이 또 {card}가 되면 곤란함",
  "{card} 복귀 덕분에 약한 덱도 좋아지고 강한 덱도 좋아져서 순이익 계산이 어렵다",
  "완화 발표 뒤 {leadTheme}보다 {otherTheme} 연구글이 더 많이 올라오는 건 의외네",
  "공용 방어 수단을 돌려준 거면 선후공 격차가 줄어드는지도 같이 보자",
  "{newLimit}장 선에서 선택 카드로 남으면 성공적인 범용 완화일 듯",
  "금제표 순환은 좋지만 범용은 채용 속도가 빨라서 재평가도 빨라야 함",
  "풀어준 카드가 여러 덱을 살리는지 상위권만 더 세게 만드는지가 관건이다",
] as const;

const GENERIC_RESTRICTION_MEME_COPY = [
  "내 덱 금제 안 먹었다고 좋아한 지 10초 뒤 {card} 확인함",
  "오늘의 덱 구축: {card} 검색하고 전부 빼기",
  "범용 금제라길래 남 일인 줄 알았는데 내 덱에도 세 장 있었네",
  "{card} 장례식에 {affectedCount}개 테마 유저가 공동 상주로 왔습니다",
  "덱 이름은 다 다른데 부고 문자는 전부 {card}로 받았네",
  "금제표 한 줄 읽고 덱박스 {affectedCount}개 여는 사람 발견",
  "{replacement} 판매자만 오늘 아침부터 싱글벙글",
  "{card} 잘 가라고 했는데 서랍에 여섯 장 있는 거 보고 같이 울었다",
  "운영: 한 장만 조정했습니다 / 유저: 덱을 통째로 다시 짰습니다",
  "{leadTheme} 유저랑 {otherTheme} 유저가 같은 이유로 화해한 역사적인 날",
  "개나소나 쓰던 카드 잘 갔다 vs 나도 개나소나였다의 싸움 시작",
  "금제 피해자 단체 채팅방 정원 {affectedCount}개 테마",
  "덱리에서 {card} 지웠더니 저장 버튼보다 오류 표시가 먼저 뜨는 기분",
  "오늘 중고 장터 금지어 설정: {card} 3장 일괄",
  "범용 카드의 마지막 범용성: 모든 유저가 같이 욕함",
  "{oldLimit}에서 {newLimit}로 줄었는데 체감상 내 덱은 40장에서 37장 됨",
] as const;

const SAME_ROLE_MULTI_RESTRICTION_COPY = [
  "한 장이 아니라 같은 역할 카드 여러 종을 같이 줄여서 해당 파츠군 전체가 얇아졌네",
  "{theme}의 같은 기능을 겹쳐 자른 금제라 대체재를 서로 바꾸는 것도 어렵겠다",
  "이번에는 특정 카드 하나보다 같은 역할군의 총매수가 얼마나 줄었는지가 핵심임",
  "비슷한 기능 카드들을 동시에 제한했으니 한 장씩 볼 때보다 누적 타격이 크다",
  "같은 축 안에서 여러 파츠가 함께 줄어 구축 비율을 통째로 다시 계산해야겠네",
  "한 역할에 제한이 몰려서 다른 축은 살아 있어도 이 구간의 선택지가 크게 줄었다",
  "같은 기능을 나눠 맡던 카드들이 함께 맞으면 우회 카드 한 장으로는 복구가 안 되지",
  "{theme}의 한 역할군을 집중해서 낮춘 의도는 보이는데 강도는 합산해서 봐야 함",
  "각 카드 제한은 중간 정도여도 같은 역할을 여러 번 치면 체감은 과잉일 수 있다",
  "이번 발표는 단일 카드 금제가 아니라 같은 기능 파츠군을 묶어 조정한 형태임",
] as const;

const MULTI_AXIS_RESTRICTION_COPY = [
  "{theme}에서 서로 다른 역할 카드가 함께 줄어서 한 축만 손본 금제는 아니네",
  "초동·연결·결과물 중 여러 구간을 동시에 건드렸으면 덱 뼈대 변화까지 봐야 함",
  "카드 수보다 서로 다른 역할을 같이 제한한 게 이번 타격을 크게 만든다",
  "한 자리 대체로 끝날 금제가 아니라 전개 전후를 모두 다시 짜야 하는 범위임",
  "{theme}의 여러 축을 동시에 낮췄으니 개별 카드보다 누적 체급 손실이 핵심이다",
  "각 제한을 따로 보면 버틸 만해도 역할이 겹치지 않아 복구 비용이 커졌네",
  "시작과 마무리처럼 다른 구간을 같이 자르면 덱 정체성까지 바뀔 수 있음",
  "이번에는 특정 문제 카드만 찍은 게 아니라 복수 역할을 한 번에 조정했구나",
  "여러 축 동시 제한이면 과잉 여부도 카드별 점수가 아니라 합산 타격으로 봐야지",
  "{theme} 유저가 한 루트만 고치는 게 아니라 구축 방향 자체를 다시 골라야겠다",
] as const;

const MULTI_THEME_RESTRICTION_COPY = [
  "한 테마만이 아니라 여러 테마 카드가 동시에 바뀐 대규모 금제네",
  "이번 발표는 개별 덱 조정보다 환경 전체 재배치에 가까워 보인다",
  "여러 테마를 한 번에 건드렸으니 빈자리를 누가 먹는지도 단순하지 않겠네",
  "각 테마 타격은 달라도 동시 제한이라 매치업 표 전체가 흔들릴 듯",
  "복수 테마 금제에서는 한 카드 평가보다 환경 합산 효과를 먼저 봐야 함",
  "상위권 여러 덱을 함께 낮춘 거라 다음 순위가 그대로 올라올지는 모르겠다",
  "이번처럼 대상 테마가 많으면 대체 덱 수요와 카드 시장도 넓게 움직이겠네",
  "한쪽만 겨냥한 공지가 아니라 여러 덱의 역할과 점유율을 동시에 조정한 결정임",
  "테마별로 적정한 강도가 달라서 같은 매수 제한도 체감은 제각각일 듯",
  "환경 전체를 크게 움직인 금제라 사흘 데이터로도 안정된 순위를 읽기 어렵겠다",
] as const;

const ALTERNATE_BUILD_RESTRICTION_COPY = [
  "{part} 카드가 빠지면 초동 9장 대신 6장 구축으로 가면 될 듯",
  "{newLimit}장 기준으로 다시 짜 보니까 생각보다 굴러간다",
  "다른 엔진 파츠를 섞으면 손실 일부는 복구되는 거 아님?",
  "정석 루트는 죽었는데 후공형으로 바꾸면 살 길 있어 보임",
  "금제표 나오자마자 우회 전개 찾은 사람 뭐냐 ㅋㅋ",
  "{part} 없이도 가는 1장 초동 루트 정리해 봄",
  "죽은 줄 알았는데 자원 회수축으로 바꾸니 장기전은 더 세네",
  "이 루트 퍼지면 솜방망이 금제였다는 말 다시 나올 듯",
  "{newLimit}장에 맞춰 드로 소스 늘리니까 패 말림은 생각보다 버틸 만함",
  "기존 정답 구축 버리고 비주류 파츠 넣으니 의외로 빈자리가 채워진다",
  "결과물 하나 낮추고 안정성 챙기는 쪽으로 가면 {theme} 아직 할 만해 보임",
  "{part} 의존 루트 대신 두 장 조합으로 돌리는 리스트가 벌써 올라왔네",
  "후공 카드 비중 올린 금제 대응 덱리 써 봤는데 매치업은 오히려 편해짐",
  "이번 제한 덕분에 묻혀 있던 서브 엔진 연구가 갑자기 활발해졌다 ㅋㅋ",
] as const;

const RESTRICTION_MARKET_COPY = [
  "{theme} 덱 매물 오늘만 몇 개 올라오는 거냐",
  "어제 산 {part} 가격 반토막 났네. 구매 버튼 누르기 무섭다",
  "초판 고레어는 버틸까 했는데 같이 내려가네",
  "금제 직전까지 재록 없이 팔아 놓고 바로 제한하는 건 좀",
  "발매 {days}일 만에 핵심 자르면 다음 신상품도 믿고 사겠냐",
  "덱 처분하려는 사람은 많은데 사려는 사람이 없다",
  "다음 지원 예정이면 지금 싸게 맞추는 게 나을지도 모르겠네",
  "성능보다 구매 신뢰가 먼저 무너지는 패턴이 제일 위험함",
  "{part} 고레어 매물만 한 페이지를 채웠네. 다들 판단 진짜 빠르다",
  "{theme} 풀세트 가격이 하루 만에 내려가니 신규 유저는 더 못 들어오지",
  "발매 {days}일 만의 제한이면 예약 구매한 사람들 기분은 누가 책임짐",
  "저점 매수 타이밍 같다가도 다음 금제 생각하면 손이 안 간다",
  "일반판은 쏟아지고 컬렉터 레어만 버티는 시장이 제일 현실적이네",
  "카드값보다 운영 신뢰가 먼저 반토막 난 게 이번 금제의 진짜 비용임",
] as const;

const RESTRICTION_META_COPY = [
  "{theme} 덱이 빠지면 빈자리 노리던 덱이 바로 올라올 것 같은데",
  "금제 후 랭크 열 판 돌렸는데 {theme} 두 번밖에 못 봄",
  "생각보다 {theme} 안 죽었음. 우회축으로 계속 이기더라",
  "빈자리 노리던 덱의 매칭이 늘어날지는 더 지켜봐야겠다",
  "선공 고점은 내려갔는데 후공 승률은 거의 그대로인 듯",
  "초기 표본 분포 보니까 금제 효과는 확실히 나온 것 같네",
  "점유율만 빠지고 불쾌한 패턴은 그대로라 체감은 애매함",
  "사흘 해 보니 예상과 반대네. {theme}보다 주변 덱이 더 손해 봄",
  "{theme}가 내려간 자리로 상성 좋던 테마 둘이 동시에 올라오는 중",
  "금제 뒤에는 1강이 사라진 게 아니라 선두 이름만 바뀐 느낌인데",
  "{part} 제한 이후 평균 턴 수가 늘어난 걸 보면 고점 억제는 된 듯",
  "초반에는 다들 실험 덱이라 분포가 요동치니 일주일 뒤가 진짜겠지",
  "예상보다 {theme} 잔존율이 높다. 숙련자들은 바로 대체 루트 찾았네",
  "상위권 빈자리를 카운터 덱이 아니라 원래 2위가 그대로 먹는 분위기임",
] as const;

const POPULAR_UNDERPERFORMER_CUT_COPY = [
  "픽만 많고 승률은 딸리는 거품인데 {theme}를 자르네. 인기랑 강함부터 구분해야지",
  "{theme} 점유율 {decisionShare}만 보고 눌렀나? 승률 {decisionWinRate}면 과대표집부터 의심해야 하는데",
  "많이 보인다는 이유로 자르면 유저가 많은 덱부터 벌받는다. {theme} 성적은 오히려 평균 아래잖아",
  "티어표 줄 수만 읽고 금제했네. {theme}는 픽률은 높아도 매치 승률이 못 따라오고 있었음",
  "{theme}가 인기 덱인 건 맞는데 강덱인지는 별개지. 승률 {decisionWinRate}짜리를 우선 타격할 이유가 뭐임?",
  "승률 낮은 유행 덱을 잘라 놓고 환경을 잡았다고 하면 데이터 해석이 거꾸로다",
  "픽률 높은 초보·팬층까지 전부 성능 지표로 센 거 아님? {theme}는 표본만 크고 결과는 평범했는데",
  "많이 들고 왔지만 많이 지던 덱이다. {theme} 제한은 강함보다 인기세를 벌주는 모양새임",
  "점유율 {decisionShare}, 승률 {decisionWinRate}. 이 두 숫자를 같이 보고도 {theme}가 첫 대상이었나",
  "거품 픽을 금제로 터뜨리면 다음 유행 덱도 똑같이 맞는다. 승률 기준이 없으면 납득 못 함",
  "{theme} 유저 수가 많아서 체감 빈도만 높았지 매치 승률은 낮았다. 이걸 핵심 문제로 잡네",
  "픽률을 위험도로 착각한 금제 같다. {theme}보다 적게 보이고 더 잘 이기는 덱부터 봐야 했음",
  "사용자가 많은 덱과 매치 승률이 높은 덱은 다르다. {theme}는 전자였는데 왜 성능 제재를 받음?",
  "인기 덱을 잘라 분포 숫자는 내려가겠지. 그런데 승률 높은 진짜 위협은 그대로면 무슨 의미임",
] as const;

const LOW_PICK_HIGH_WIN_CUT_COPY = [
  "{theme} 픽률은 {decisionShare}뿐인데 승률이 {decisionWinRate}면 숨은 강덱을 제대로 찾긴 했네",
  "표본이 적다고 넘기기엔 {theme} 승률이 너무 높았다. 선제 조정 근거는 이해됨",
  "티어표 아래쪽만 본 게 아니라 매치 승률까지 읽은 선택이라면 {theme} 제한은 말이 된다",
  "{theme}는 적게 들고 와서 적게 보였을 뿐, 잡은 사람은 계속 이기던 덱이었다",
  "픽률보다 승률이 먼저 튀는 장인 덱도 있다. {theme}를 본 건 단순 순위 금제는 아니네",
  "{decisionShare} 표본이라 변동성은 확인해야 하지만 승률 {decisionWinRate}를 방치하기도 어려웠음",
  "숨은 꿀덱이 완전히 퍼진 뒤 자르는 것보다 지금 병목을 짚은 판단은 납득 가능",
  "{theme} 점유율만 보면 과잉인데 성적표까지 보면 얘기가 달라진다. 근거 공개는 해 줘라",
  "낮은 픽률 뒤에 숙련자 편향이 있는지, 덱 자체가 센 건지 후속 데이터가 중요하겠다",
  "승률 높은 소수 덱을 잡은 건 좋지만 표본 크기와 매치업 편중도 같이 설명해야 함",
  "{theme}가 다음 주 유행했으면 바로 1티어였을 수 있다. 미리 본 판단인지 지켜보자",
  "순위는 낮아도 실전 승률은 높았다. 이번엔 티어 이름보다 실제 결과를 본 듯",
] as const;

const POPULAR_POWERHOUSE_CUT_COPY = [
  "{theme}는 점유율 {decisionShare}에 승률 {decisionWinRate}까지 높았으니 대상 자체는 정면 승부네",
  "많이 쓰이고 많이 이기는 덱이면 {theme} 조정 명분은 충분하다. 강도만 과하지 않으면 됨",
  "{theme}는 인기 거품으로 변명할 구간이 아니다. 표본도 크고 결과도 같이 나왔음",
  "점유율과 승률이 동시에 경고였으니 {theme} 핵심을 본 건 데이터상 맞다",
  "큰 표본에서도 {theme} 승률이 유지됐으니 단순 유행 덱 취급은 못 하지",
  "픽률만 높은 덱과 달리 {theme}는 승률도 따라왔다. 이번엔 타깃보다 제한 강도가 쟁점임",
  "{theme}를 건드린 방향은 맞다. 대체 덱이 빈자리 독식하지 않게 다음 줄도 같이 봐야 함",
  "표본 큰 고승률 덱을 외면하는 게 더 이상했을 상황. 후속 분포만 확인하자",
  "{decisionShare}나 쓰이면서 {decisionWinRate}를 냈으면 숙련자 편향만으로 설명하기 어렵다",
  "이번 {theme} 조정은 티어 이름 때문이 아니라 픽률과 승률이 같이 높았기 때문이어야 한다",
] as const;

const WEAK_FRINGE_CUT_COPY = [
  "픽도 낮고 승률도 낮은 {theme}를 굳이 자른 이유가 뭐임? 금제 슬롯 낭비 같은데",
  "{theme} 점유율 {decisionShare}, 승률 {decisionWinRate}. 이미 환경이 알아서 밀어낸 덱을 또 침",
  "티어 밖에서 지고 있던 덱에 추가 제재라니 우선순위가 완전히 뒤집혔다",
  "적게 보이고 성적도 안 나오는 {theme}보다 현재 우승권 병목을 먼저 봐야지",
  "{theme}는 금제가 아니라 지원 검토 대상에 가까웠는데 왜 제한부터 늘어남?",
  "하위권 약체를 잘라 표만 길어졌다. 상위 분포에는 아무 변화도 없겠네",
  "표본도 성적도 경고가 아닌데 {theme}가 맞았다면 불쾌 패턴 같은 별도 근거를 공개해야 함",
  "이미 티어 아웃 직전인 덱을 누르면 환경 개선이 아니라 유저만 잃는다",
  "{theme}를 제재해도 메타 파이는 위 덱들이 나눠 먹는다. 대상 선정부터 실패임",
  "낮은 픽·낮은 승률 덱을 잡고 균형 금제라고 부르진 말자. 실효 위협은 따로 있다",
] as const;

const MISSED_SLEEPER_THREAT_COPY = [
  "{theme}는 픽만 많고 승률 {decisionWinRate}인데, {other}는 {otherShare} 픽으로 {otherWinRate}를 찍고도 통과했네",
  "눈에 많이 보이는 {theme}부터 잘랐지만 진짜 매치 승률은 {other} 쪽이 더 높았다",
  "유행 덱 숫자만 줄이고 저픽 고승률 {other}를 놔두면 다음 메타 1위만 예약해 준 셈임",
  "{other}는 표본 적다는 이유로 무시했나? 승률 {otherWinRate}면 최소한 같이 설명했어야지",
  "픽률표 첫 줄만 보고 {theme}를 쳤네. 성적표 첫 줄의 {other}는 왜 안 봄?",
  "거품 낀 {theme}를 내리고 실속 있는 {other}를 그대로 두면 파이가 어디로 갈지 뻔하다",
  "이번 표 뒤에 {other} 점유율 오르면 몰랐다고 하지 마라. 이미 승률은 경고 중이었음",
  "{theme}는 많이 져서 자연 하락할 수 있었고 {other}는 적게 잡아도 계속 이겼다. 우선순위 반대임",
  "점유율 {decisionShare}만 큰 {theme}보다 {other}의 승률 {otherWinRate}가 더 위험 신호 아닌가",
  "상위 픽률을 자르는 건 쉬운데 낮은 표본 속 강덱을 찾는 게 운영 판단이지. 이번엔 놓쳤다",
  "{other} 숙련자 편향을 감안해도 격차가 큰데 검토 흔적이 없다. 다음 풍선효과 후보임",
  "인기 덱 제재는 보여 주기 쉽고 숨은 강덱 검증은 어렵다. 그래서 둘 다 봐야 한다",
] as const;

const MISSED_SLEEPER_GENERAL_COPY = [
  "이번 표에서 빠진 {other}는 점유율 {otherShare}에 승률 {otherWinRate}다. 다음 승계 후보까지 같이 봤어야지",
  "제재 대상만 논하기 전에 저픽 고승률 {other}를 왜 넘겼는지부터 설명해 줘",
  "{other}는 적게 잡히고도 {otherWinRate}를 냈다. 현재 순위만 보면 다음 환경을 놓친다",
  "픽률 표 밖에 있던 {other}의 승률은 이미 경고였다. 이건 후속 표본으로 미룰 문제가 아님",
  "빈자리를 먹을 가능성은 {other}쪽이 더 크다. 점유율 {otherShare}만 보고 제외하면 풍선효과를 예약하는 셈이지",
  "{other}를 숙련자 편향으로 보려면 {otherWinRate}의 검토 근거는 남겨야 한다. 그 줄이 없네",
  "어느 덱을 잘랐는지만큼 안 자른 덱의 승률도 금제 평가다. {other}가 그 빈칸임",
  "{other} 승률 {otherWinRate}를 놓친 채 구성만 균형 잡혔다고 할 수는 없다",
  "지금은 {otherShare} 픽이라도 {other}가 빈자리를 받으면 이야기가 달라진다. 선제 검토가 빠졌음",
  "상위 픽만 잘라내는 게 전부가 아니다. {other} 같은 낮은 표본의 실질 위협도 같이 보는 게 운영 판단이지",
] as const;

const HIGH_PLACEMENT_HIGH_CONVERSION_CUT_COPY = [
  "{theme}는 최근 {placementDays}일 탑컷 {placements}회에 본선 진출률 {conversion}다. 픽률만 높은 덱과는 근거가 다르네",
  "채용도 많고 탑컷 점유율 {placementShare}도 크다면 {theme} 대상 선정 자체는 성적표를 읽은 셈임",
  "{theme} 유저 수만 많은 게 아니라 탑컷 생존율도 높았다. 이번은 인기세만 잡은 건 아님",
  "최근 집계에서 {theme}가 {placements}자리를 먹고 본선 진출률 {conversion}를 냈으면 실전 위협은 확인됐다",
  "채용률과 탑컷 점유율이 같이 튀었다. {theme}를 본 건 티어 이름보다 실적 때문이어야 함",
  "탑컷 점유율 {placementShare}와 본선 진출률 {conversion}면 {theme}는 표본도 결과도 경고였다. 이제 강도를 따져야지",
  "{theme} 채용률만 높은 게 아니라 {placementDays}일 입상표에서도 {placementShare}를 차지했다. 결과 근거는 있음",
  "탑컷 {placements}회를 상위권 표본으로 보면 {theme}는 단순 유행 덱이었다고 하기 어렵다",
  "본선 진출률 {conversion}와 탑컷 점유율 {placementShare}가 같이 높았다. {theme}를 검토한 이유는 픽률 외에도 분명함",
  "최근 {placementDays}일에 {theme}가 만든 탑컷이 {placements}회면 표본 크기와 성적을 동시에 충족했다",
] as const;

const HIGH_PICK_WEAK_PLACEMENT_CUT_COPY = [
  "{theme}는 픽은 많았는데 최근 {placementDays}일 본선 진출률이 {conversion}에 그쳤다. 인기를 성능으로 잘못 읽은 거 아님?",
  "대회장에 {theme}가 많았던 건 맞지만 탑컷 지분은 {placementShare}뿐이다. 입상까지 간 덱을 보자",
  "{theme} 채용률에 비해 탑컷 {placements}회는 약하다. 유행 표본을 강덱 표본으로 세지 마",
  "본선 진출률 {conversion}인 고픽 덱을 자르고 적정 금제라고 하면 성적 해석이 뒤집힌다",
  "픽률표에서는 {theme}가 위였지만 입상표에서는 그렇지 않았다. 왜 제재 우선이었나",
  "{theme} 본선 진출률이 평균보다 낮았다면 체감 빈도와 실전 위협을 분리해야 한다",
  "{placementDays}일 동안 {theme} 탑컷 점유율은 {placementShare}였다. 픽이 많았다는 사실만으로 우선 제재하긴 약함",
  "상위권에 올라간 {theme}가 {placements}개라면 대회장 모수보다 탑컷 효율을 먼저 물어야지",
  "{theme} 본선 진출률 {conversion}는 전체 기준보다 낮았다. 고픽이라는 이유만으로 성능 금제하면 안 됨",
  "입상 자료가 붙었는데도 {theme} 픽 숫자만 보었다면 데이터를 반만 읽은 판단이다",
] as const;

const MIXED_WIN_PLACEMENT_CUT_COPY = [
  "{theme} 매치 승률은 {decisionWinRate}인데 최근 {placementDays}일 본선 진출률은 {conversion}다. 서로 반대라 하나만 보고 칭찬하거나 비판할 수 없음",
  "채용률·승률 조합만 보면 우선순위가 낮아 보이지만 {theme} 탑컷 점유율은 {placementShare}였다. 대상 선정 근거를 더 공개해야 함",
  "{theme} 승률 {decisionWinRate}와 탑컷 {placements}회가 다른 방향을 가리킨다. 표본·대회 구조부터 분리해서 보자",
  "일반 매치에서는 {theme}가 지고 탑컷에서는 {conversion}로 남았다. 순위만으로도 금제표만으로도 단정 못 함",
  "{theme}는 승률만 보면 거품인데 입상 자료만 보면 실적이 있다. 이런 충돌 신호에서는 보류한 평가가 맞지",
  "{placementDays}일 입상 표본은 {theme}를 위협으로 보고 매치 승률은 그렇지 않다. 두 지표 가중치를 먼저 설명해 줘",
  "{theme} 탑컷 점유율 {placementShare}가 높아도 승률 {decisionWinRate}를 없던 숫자로 취급할 수는 없다",
  "승률은 약하고 본선 진출률은 강한 {theme}라면 숙련도·대회 편향·매치업을 보지 않고서는 대상 선정을 평가하기 어렵다",
  "{theme} 탑컷 {placements}회는 무시할 수 없고 {decisionWinRate} 승률도 무시할 수 없다. 이번은 평가 보류 분기임",
  "채용률·승률·입상이 한 방향이 아닌 {theme}를 단순 1티어 컷으로 포장하면 판단 과정을 숨기는 거다",
] as const;

const LOW_PICK_STRONG_CONVERSION_CUT_COPY = [
  "{theme}는 채용률은 낮아도 최근 {placementDays}일 본선 진출률 {conversion}를 냈다. 숨은 강덱 근거는 있네",
  "{theme} 픽 표본은 적은데 탑컷에 {placements}회 올랐다. 단순 하위 순위 덱으로 보기는 어렵지",
  "저픽 {theme}가 본선 진출률은 평균보다 훨씬 높았다. 티어표 줄보다 입상 자료를 본 판단이라면 이해됨",
  "채용률만 보면 과잉인데 본선 진출률 {conversion}를 보면 {theme}는 선제 검토 대상이었다",
  "{theme}가 적게 잡힌 건 맞지만 잡은 사람의 입상 비율이 높았다. 표본 크기와 실질 위협을 같이 봐야 함",
  "탑컷 점유율 {placementShare}보다 주목할 건 본선 진출률 {conversion}다. {theme}는 퍼지기 전 강덱일 수 있었음",
  "{placementDays}일 표본에서 {theme} 전환이 {conversion}라면 낮은 채용률을 안전 신호로 볼 수는 없다",
  "사용자는 적어도 {theme}로 탑컷한 횟수가 {placements}회다. 소수 숙련자 편향인지 덱 체급인지 검토할 만함",
  "채용률 순위는 낮았지만 탑컷 점유율 {placementShare}를 낸 {theme}라면 티어표 밖의 강덱으로 볼 근거가 생긴다",
  "{theme} 채용률과 {conversion} 전환의 격차가 크다. 이런 덱을 찾아내는 게 단순 상위 픽 순위보다 어려운 판단임",
] as const;

const MISSED_STRONG_CONVERSION_SLEEPER_COPY = [
  "안 자른 {other}는 최근 {otherPlacementDays}일 탑컷 {otherPlacements}회, 전환 {otherConversion}다. 다음 승계 위협을 놓쳤네",
  "{other}는 저픽이어도 본선 진출률이 {otherConversion}였다. 현재 순위만 보고 통과시킨 거지",
  "픽률표 밖의 {other}가 탑컷에는 {otherPlacements}번 남았다. 이게 풍선효과 후보 아님?",
  "{other}의 본선 진출률 {otherConversion} 신호를 놓쳤다. 자른 표만 넓어도 대상 선정을 잘한 게 아님",
  "숨은 강덱은 픽률보다 본선 진출률에서 먼저 보인다. {other} {otherConversion}를 넘긴 건 명백한 빈칸임",
  "{otherShare} 픽만 보면 작아 보여도 {otherPlacements}회 입상은 그렇지 않다. 입상 자료를 왜 붙인 거야",
  "{other}는 {otherPlacementDays}일 입상표에서 {otherPlacements}자리를 남겼다. 저픽이라 빼는 게 아니라 승계 위협으로 봤어야 함",
  "본선 진출률 {otherConversion}인 {other}를 통과시키고 현재 픽 순위만 조정했다. 다음 메타를 본 표라고 하기 어렵다",
  "{otherShare} 채용률을 이유로 {other}를 제외했지만 본선 진출률은 {otherConversion}였다. 선정 기준이 뒤집힘",
  "빈자리를 받을 {other}의 탑컷이 이미 {otherPlacements}회다. 이렇게 보이는 복병을 빼고 금제표를 평가할 수는 없음",
] as const;

const PERFORMANCE_BLIND_TIER_COVERAGE_COPY = [
  "금제표가 길어도 승률과 입상 근거가 약한 대상이 끼었다면 균형 금제가 아님",
  "여러 테마를 건드린 것과 실제 압력 위협을 자른 것은 다르다. 이번은 후자 검증이 빈다",
  "대상 수가 많다는 사실만으로는 부족하다. 각 테마의 실전 성적부터 다시 봐야 함",
  "여러 장을 골랐다고 대상 선정까지 적정해지진 않는다. 본선 진출률을 빼먹었네",
  "범위가 넓어 보여도 실전 약체를 선제 제재했다면 따로 비판받아야 한다",
  "금제 범위는 넓지만 픽률·승률·입상을 함께 보지 않으면 범위 자체가 칭찬거리는 아님",
] as const;

const RECENT_SUPPORT_RESTRICTION_COPY = [
  "{theme} 발매 {days}일 만에 핵심을 자르면 누가 다음 팩을 예약함?",
  "신카드 팔 때는 문제없다더니 판매 끝나자마자 금제네",
  "최근 지원이 나온 뒤 지금 핵심 파츠를 자르는 순서가 맞나",
  "최근 지원으로 채운 자리를 금제로 다시 비우면 상품 설계부터 돌아봐야지",
  "{theme} 최근 지원 성능을 확인하고도 이 금제를 냈다면 기준이 더 궁금해짐",
  "최근 제품만 보호하고 오래된 파츠에 책임 돌리는 느낌",
  "한쪽에서는 파워 인플레, 다른 쪽에서는 구매 신뢰 관리라니 말이 안 맞음",
  "금제와 발매가 따로 움직이는 게 아니라는 의심만 커진다",
  "발매 {days}일 된 상품의 핵심을 바로 자르면 테스트는 누가 한 거냐는 말 나오지",
  "{theme} 지원 판매 끝나자마자 {part} 제한이면 일정이 너무 노골적임",
  "신제품으로 올린 체급을 금제로 다시 내리는 운영을 언제까지 반복할 건가",
  "최근 지원 카드로 생긴 체급을 다시 자르면 금제와 판매가 한 세트라는 소리 듣기 딱 좋음",
  "유저는 발매표와 금제표를 같이 보고 구매해야 하는 게임이 돼 버렸네",
  "최근 카드 대신 오래된 핵심만 자르는 패턴이 계속되면 상품 설명을 믿기 어렵다",
] as const;

const RECENT_DEBUT_RESTRICTION_COPY = [
  "{theme} 첫 상품 발매 {days}일 만에 핵심을 자르면 출시 전 검수가 충분했는지 궁금함",
  "신규 테마를 낸 지 {days}일 만에 핵심 파츠를 줄이면 구매자는 당황하지",
  "{theme}가 막 데뷔했는데 벌써 금제할 정도였다면 출시 수치부터 돌아봐야 함",
  "첫 상품에서 밀어 준 {part}를 {days}일 뒤 줄이는 일정은 너무 빠르다",
  "신규 테마 출시와 첫 금제 사이가 {days}일뿐이면 구매 신뢰 얘기가 나올 수밖에 없음",
] as const;

const RESTRICTION_CAUTION_COPY = [
  "발표 다음날부터 덱 죽었다고 단정하는 건 너무 빠름",
  "표본도 없는데 과잉 금제인지 적정인지 어떻게 확정함?",
  "이 정도 제한 없었으면 다른 테마는 계속 숨도 못 쉬었음",
  "카운터 발견 기다리자는 말로 몇 주를 더 버틴 건데",
  "일주일은 실제 랭크 보고 얘기하자. 첫날 매물은 지표가 아님",
  "{theme} 유저 손해는 이해하지만 환경 전체 비용도 있었음",
  "강하게 보이는 금제도 우회 구축 나오면 평가 달라질 수 있음",
  "운영 욕하기 전에 승률과 점유율이 실제로 얼마나 꺾이는지 보자",
  "{oldLimit}→{newLimit}만 보고 덱 삭제라고 하기엔 아직 대체 리스트가 안 나왔음",
  "금제 직후 복귀 유저와 실험 덱이 섞인 표본으로 결론 내리면 안 됨",
  "{part} 감소가 체감되려면 대회 여러 라운드 데이터까지 쌓여야 한다",
  "첫날 승률 하락은 구축 미정립 영향도 있으니 며칠 더 보는 게 맞지",
  "적정 금제인지 과잉인지 판단하려면 {theme}뿐 아니라 주변 분포도 같이 봐야 함",
  "지금 감정은 이해하지만 다음 주 입상표 전까지는 평가를 열어 두자",
] as const;

const RESTRICTION_MEME_COPY = [
  "금제표 한 줄로 내 덱이 추억의 카드 코너로 감",
  "{theme} 장례식장 조문객 받습니다. 부의금: {part}",
  "{part} {oldLimit}→{newLimit}: 운영진식 숫자 다이어트",
  "금제 발표 전: 환경 정상화 / 발표 후: 내 덱만 비정상",
  "오늘의 메타 공략: 덱 박스 열지 않기",
  "제한 카드 늘어날수록 덱 공간 넓어지는 기적 ㅋㅋ",
  "다음 팩 지원: 방금 자른 파츠와 같은 효과일 확률 99%",
  "다른 상위권 테마 유저들 갑자기 축제 준비하는 소리 들림",
  "{part} 장례식 브금 틀었는데 옆 테마는 벌써 우승 세리머니 중",
  "금제표 뜨자마자 덱 이름을 추억 테마로 변경 완료",
  "{theme} 유저 단체 채팅방 공지: 오늘부터 구축 상담이 아니라 심리 상담입니다",
  "운영진이 줄인 건 {part} 매수고 내가 잃은 건 주말 계획임",
  "새 금제 최적화 1단계: 카드 빼기 / 2단계: 덱도 빼기",
  "다음 대회 준비물 목록에서 덱만 사라지고 관전표가 추가됨 ㅋㅋ",
] as const;

const SINGLE_APPROPRIATE_RESTRICTION_COPY = [
  "{part} 한 종만 {limitLabel}? 이걸로 확인된 압력 위협이 전부 낮아지는지부터 설명해 줘",
  "{part} {changeLabel} 자체는 이해해도 금제표가 여기서 끝나는 건 너무 적다",
  "문제 카드 하나를 정확히 짚은 것과 환경 전체를 제대로 손본 건 별개지",
  "{theme}에서 {part} 하나만 자르고 끝내면 상위권 전체의 자리 경쟁은 그대로잖아",
  "카드 한 장 찍고 끝낼 수는 있어도 다른 압력 위협까지 남았다면 부족한 거 아님?",
  "이번 변경점이 {part} 하나뿐이면 오래 묶인 카드 해제 검토는 또 어디 갔냐",
  "{part} 역할은 문제였는데 다른 상위권 축을 하나도 안 건드린 건 납득이 안 감",
  "{changeLabel} 한 줄로 환경 조정 끝냈다고 하기엔 지금 상위권 고착이 너무 심하다",
  "한 장만 자르면 다음 덱이 올라오는 순서만 바뀌지 티어권 전체가 건강해지진 않음",
  "{part}를 자른 판단보다 왜 이것밖에 안 했는지부터 설명해야 할 금제표다",
] as const;

const SINGLE_LIGHT_RESTRICTION_COPY = [
  "{part} {changeLabel}로 매수 한 칸 줄인 게 전부면 이 환경을 바꿀 생각은 있었나",
  "실제 변화는 생겨도 {theme} 한 자리만 살짝 비운 수준이라 금제 폭이 너무 좁다",
  "{part}를 약하게 한 번 건드리고 압력 위협이 남았다면 사실상 다음 표로 미룬 셈",
  "대체 카드 한 장 넣으면 끝나는 조정 하나로 상위권 고착을 풀 수 있겠냐",
  "{limitLabel} 자체보다 이것 한 장만 올린 금제표라는 게 더 문제임",
  "{part} 빈도는 조금 줄겠지만 다른 상위 덱 핵심도 같이 봤어야지",
  "효과가 작을 걸 알면서 단일 제한으로 끝냈으면 보여 주기와 뭐가 다른가",
  "한 종만 약하게 줄일 거면 오래된 제한 하나라도 같이 풀어 줬어야 함",
  "{part} 매수 감소는 있겠지만 현재 위협을 필요한 만큼 누르는 조정인지는 모르겠네",
  "대체재 유무를 보기 전에 왜 다른 상위권 카드는 검토 대상조차 아닌지 궁금함",
] as const;

const SINGLE_OVERKILL_RESTRICTION_COPY = [
  "바뀐 카드는 {part} 하나뿐이지만 {changeLabel} 조정은 그 한 종에 주는 타격이 너무 크다",
  "금제 범위는 한 종인데 {limitLabel}까지 간 강도는 별개로 따져 봐야 함",
  "{part} 하나만 손댄 건 맞아도 의존도가 높은 카드라 체감은 작지 않겠다",
  "여러 카드를 자른 것도 아닌데 핵심 한 종에만 최대 강도를 몰아 줄 필요가 있었나",
  "이번 발표는 {part} 단일 변경이다. 한 장을 세게 치고 다른 상위권은 둔 기준부터 이상함",
  "다른 파츠는 살아 있어도 {part} 역할을 대체 못 하면 {changeLabel} 조정은 과할 수 있음",
  "한 종만 바뀌었다고 약한 금제는 아니지. {part}가 맡던 비중이 너무 컸음",
  "{part}를 겨냥한 이유는 알겠는데 {limitLabel} 말고 한 단계 낮은 조정은 안 됐나",
  "범위를 넓히지 않고 한 카드에 최대 강도를 몰아 줬다. 실제 위협 전체를 본 금제인지는 별개임",
  "{theme}의 다른 카드와 다음 상위 덱은 그대로다. 결국 한 장 희생양 세운 것처럼 보임",
] as const;

const SINGLE_COSMETIC_RESTRICTION_COPY = [
  "{part} 한 종만 바뀌었는데 원래 쓰던 매수 안쪽이라 덱리는 거의 그대로겠네",
  "{changeLabel} 숫자는 바뀌었어도 {part} 실사용 매수에는 영향이 없어 보임",
  "다른 카드도 아니고 원래 적게 쓰던 {part} 하나라 체감상 영향이 없어 보인다",
  "이번 발표에서 바뀐 건 {part}뿐이라 실제 구축은 그대로일 가능성이 큼",
  "{limitLabel} 숫자라고 적혔지만 원래 그보다 많이 넣지 않던 카드잖아",
  "한 종만 고른 것도 모자라 실사용 매수 밖을 건드려서 보여 주기 조정처럼 보임",
  "{part} 숫자 한 칸 바뀐 것과 {theme} 체급이 내려가는 건 전혀 다른 얘기임",
  "다른 파츠와 구축은 그대로고 {part}도 평소 매수 그대로면 금제 효과가 어디서 나옴?",
  "이번 단일 변경은 카드명만 금제표에 올리고 구축도 그대로 유지시킨 수준 같다",
  "{changeLabel} 뒤에도 같은 리스트를 제출할 수 있으면 숫자만 바뀐 조정에 가깝지",
] as const;

const SINGLE_RESTRICTION_SCOPE_COPY = [
  "실제로 바뀐 카드는 {part} 한 종뿐이다. 그래서 더더욱 왜 이것밖에 안 했는지 모르겠음",
  "{part} 외의 {theme} 파츠도, 다른 상위권 카드도 그대로면 금제 범위가 모자란 거지",
  "여러 축 동시 조정이 아니라 {part} 하나만 찍었다. 이걸로 환경 전체를 잡겠다는 건가",
  "이번 발표의 변경점은 {part} {changeLabel} 한 줄뿐이다. 남은 압력 위협이 있는지가 핵심이다",
  "다른 파츠까지 잘린 건 아니다. 그렇다고 한 장짜리 금제표가 충분해지는 건 아님",
  "{part} 역할이 큰 것과 이 카드 하나로 상위권 전체를 조정하는 건 다른 문제다",
  "{theme} 카드 여러 장을 자른 게 아니다. 실제 제한은 {part} 하나라 범위가 너무 좁다",
  "금제표 범위가 {part} 한 종에서 끝났다. 이 한 장으로 현재 위협이 충분히 낮아지긴 함?",
  "다른 카드 매수는 그대로고 {part}만 {limitLabel}이다. 오래된 금제 해제도 없네",
  "특정 카드 하나는 정확히 겨냥했지만 환경의 여러 강덱을 함께 본 결정은 아니다",
  "{part} 단일 변경이면 카드 역할 평가는 가능해도 금제표 전체 평가는 부족 쪽이지",
  "한 번에 여러 곳을 친 금제가 아니다. 바로 그 점 때문에 불만이 나오는 거임",
] as const;

const SINGLE_SHARED_RESTRICTION_COPY = [
  "변경 카드는 {part} 하나뿐이지만 외부 채용하던 덱까지 영향은 확인해야 함",
  "{part} 단일 금제라도 여러 테마가 공유하던 카드면 파장은 한 테마로 끝나지 않지",
  "{theme}만 보고 정한 제한인지 {part} 출장 채용률까지 본 건지 궁금하다",
  "한 종만 바뀌었어도 공용 파츠라 순수축과 출장축의 타격이 다를 수 있음",
  "{part}를 빌려 쓰던 다른 구축은 {changeLabel}을 어떻게 받아들일지 봐야겠네",
  "단일 카드 조정과 단일 테마 조정은 다르다. {part} 사용처가 넓었잖아",
  "{part} 외 카드는 그대로지만 이 한 종을 공유하던 덱 목록은 꽤 길다",
  "출장 억제가 목적이면 {theme} 순수 구축의 손실도 따로 계산했어야 함",
  "한 카드만 제한했어도 공용 카드라면 연쇄 영향은 실제 입상표로 확인해야지",
  "{part} 단일 변경이 다른 테마에는 어떤 의미인지 사용처별 데이터가 필요함",
] as const;

const SINGLE_RESTRICTION_MARKET_COPY = [
  "우선 움직이는 건 덱 전체 가격보다 {part} 단품 시세겠네",
  "{part} {changeLabel} 뜨자마자 이 카드 매물부터 늘어난 건 예상한 흐름임",
  "다른 파츠는 그대로라 {theme} 풀세트보다 대체 결과물 가격이 먼저 움직일 듯",
  "{part} 고레어 산 사람은 아프겠지만 나머지 카드까지 급히 던질 단계인지는 모르겠다",
  "한 종만 바뀐 금제라 시장도 {part}와 대체 카드 쪽으로 좁게 반응하는 중",
  "{part} 가격은 내려가고 대신 빈자리에 들어갈 카드가 오르는 그림 나오겠네",
  "덱을 통째로 처분하기 전에 {part} 대체 비용부터 계산하는 게 맞을 듯",
  "이번 발표의 직접 가격 변수는 {part} 한 장과 후보 카드들 정도로 보인다",
  "{theme} 나머지 파츠 시세는 유지되고 {part}만 급하게 재평가받는 분위기네",
  "한 카드 제한인데 덱 전체 가치가 얼마나 움직일지는 대체 카드가 자리 잡은 뒤에 봐야 함",
] as const;

const SINGLE_RECENT_PRODUCT_RESTRICTION_COPY = [
  "{theme} 관련 제품 발매 {days}일 만에 {part}를 조정한 이유는 설명이 필요함",
  "최근 {theme} 상품과 {part} {limitLabel} 사이가 {days}일뿐이면 구매자는 당황하지",
  "발매 {days}일 만의 단일 카드 제한이라 테스트 기간이 충분했는지 궁금하다",
  "최근 제품에서 {part} 역할을 밀어 놓고 {days}일 뒤 줄인 거면 일정 검토가 필요함",
  "{theme} 상품 구매 뒤 {days}일 만에 핵심 한 종이 바뀌면 신뢰 문제는 생길 수밖에 없음",
  "{part} 하나만 조정했어도 최근 발매와 {days}일 간격이면 공지 근거를 자세히 내야 함",
  "발매 후 {days}일 데이터로 {changeLabel}을 결정했다면 표본도 같이 공개해 줬으면",
  "최근 지원을 산 유저에게는 {part} 단일 제한도 체감 비용이 작지 않다",
  "{days}일 전 제품과 이번 제한이 무관하다면 운영이 먼저 그 근거를 보여 줘야지",
  "최근 발매 직후라 {part} 한 종만 바뀌어도 판매 일정과 연결해 보는 사람이 많겠네",
] as const;

const SINGLE_RESTRICTION_CAUTION_COPY = [
  "변경점이 {part} 하나뿐이니 실제 영향도 이 카드 전후 데이터를 나눠 봐야 함",
  "{part} {changeLabel}만 보고 {theme}가 끝났다고 단정하기엔 아직 첫날임",
  "다른 파츠는 그대로라 대체 카드가 자리 잡는지 며칠은 확인해야 한다",
  "한 종 조정의 효과는 새 구축이 정리된 뒤 승률로 보는 게 맞지",
  "{part}가 빠진 표본과 기존 리스트가 섞인 첫날 데이터는 조심해서 봐야 함",
  "범위가 좁은 금제일수록 목표한 역할만 줄었는지 확인하기는 오히려 쉽겠다",
  "{theme} 전체 평가보다 {part} 채용 불가·감소가 각 매치업에 준 영향부터 보자",
  "단일 카드 제한은 대체재 발견 하나로 첫인상이 크게 바뀔 수 있음",
  "과잉인지 적정인지도 {part} 공백을 실제 구축이 메우는지 본 뒤 판단해야지",
  "발표 하루 만에 덱 전체 결론을 내리기보다 바뀐 한 자리부터 테스트하자",
  "{part} 역할이 독점적이었는지 대체 가능했는지가 이번 금제 평가의 핵심임",
  "다른 카드까지 상상으로 묶지 말고 이번에 바뀐 {part} 데이터만 먼저 보자",
] as const;

const SINGLE_COSMETIC_CAUTION_COPY = [
  "{part} 평균 채용 매수가 원래 제한선 안쪽이었는지부터 확인하면 답이 나옴",
  "실제 덱리에서 {part}가 몇 장 빠지는지 0장이라면 승률 변화도 기대하기 어렵지",
  "금제표 숫자와 실사용 매수는 다르니 {changeLabel}만 보고 강한 조정이라 하면 안 됨",
  "같은 리스트를 그대로 제출할 수 있는 제한인지 확인하는 게 가장 빠르겠다",
  "{part} 채용 수가 변하지 않으면 첫날과 다음 주를 비교해도 금제 효과를 분리하기 어려움",
  "원래 한도보다 적게 쓰던 카드라면 대체재 연구 자체가 필요하지 않다",
  "이번 단일 변경은 빈자리가 생기는지부터 확인해야지, 없으면 구축 변화도 없음",
  "{theme} 유저가 실제로 카드 한 장이라도 빼는지부터 보고 체감을 말하자",
  "실사용 범위 밖 숫자를 낮춘 거라면 환경 변화보다 공지 의도가 더 궁금해진다",
  "{part} 제한선이 기존 평균 매수와 같으면 데이터상 변화 없음에 가까울 가능성이 큼",
] as const;

const SINGLE_RESTRICTION_MEME_COPY = [
  "금제표 변경점 찾기: {part} 한 종에 빨간 줄 긋고 업무 종료 ㅋㅋ",
  "{theme} 덱 수정 회의보다 운영진 금제 회의가 더 빨리 끝났을 듯",
  "오늘의 환경 조정: {part} 자리 하나 비우고 남은 압력 위협은 다음 회의로",
  "금제표 한 줄 실화냐, 스크롤 내리면 더 있는 줄 알았네",
  "{part} {changeLabel} 보고 다음 페이지 버튼부터 찾은 사람 손",
  "이번 금제 요약: 다른 카드는 앉아 있고 {part}만 교무실 감",
  "오래된 제한 해제 칸은 또 프린터에서 잘렸나 봄",
  "한 카드 바뀌었는데 운영은 대규모 환경 개편 표정인 게 제일 웃김",
  "제한은 한 장, 나머지 상위권은 그대로. 다음 금제 예고편 잘 봤습니다",
  "운영진은 카드 한 종 줄였고 유저들은 왜 한 종뿐인지 댓글 백 개를 달았다",
] as const;

const BALANCED_RESTRICTION_REVIEW_COPY = [
  "오래 묶인 카드 {oldUnbanCount}종은 풀고 실제 압력이 확인된 위협을 필요한 만큼 손봤네. 이 정도면 정기 금제답다",
  "실전 위협은 낮추고 압력이 없는 경쟁자는 보존하면서 장기 제한도 해제한 건 방향이 좋다",
  "순위표 아래 칸을 미리 자르지 않고 지금 확인된 문제만 다룬 점은 납득됨",
  "오래된 제한 해제와 위협 테마 조정을 한 표에 묶으니 환경 순환 의도가 보이네",
  "풀어 줄 카드는 풀고 실제로 센 덱은 낮췄다. 이번엔 대상 선정 기준이 제대로 잡혔음",
  "한 덱을 희생양 삼지도, 다음 후보를 이유 없이 선제 제재하지도 않은 발표네",
  "장기 제한을 정리하면서 현재 압력 위협도 조정한 건 보수적이어도 균형은 맞다",
  "빈자리를 누가 먹을지 추측해 미리 자르지 않고 실제 지표에 책임을 묻는 판단은 좋았음",
  "금제는 이래야지. 과거에 묶인 카드는 돌려주고 지금 문제인 축만 정확히 낮추고",
  "이번 표는 해제 {oldUnbanCount}종과 실효 제한 {cutCount}종이 같이 있어서 메타를 앞뒤로 움직이네",
] as const;

const PROLOGUE_BALANCED_RESTRICTION_REVIEW_COPY = [
  "1티어와 2티어를 같이 손봐서 한 덱만 밀어내고 끝내지 않은 건 방향이 좋다",
  "상위 두 구간을 복수 카드로 함께 누른 건 첫 정기 금제의 범위로 납득됨",
  "1·2티어를 동시에 조정해 바로 아래 덱의 단독 승계를 막으려는 표네",
  "상위권 두 층을 함께 본 데다 한 테마만 희생양 삼지 않은 점은 깔끔하다",
  "현역 두 구간을 각각 손봤으니 안내 금제로 필요한 범위는 채웠네",
] as const;

const BALANCED_RESTRICTION_REVIEW_CAUTION_COPY = [
  "금제표 범위는 잘 잡았는데 각 카드 제한 강도까지 적정했는지는 실전 데이터를 봐야 함",
  "위협을 모두 다룬 방향은 맞아도 같은 역할을 과하게 겹쳐 자른 건 없는지 확인은 필요하다",
  "오래된 카드를 풀어 준 건 반갑지만 해제된 테마가 바로 상위권으로 튀는지는 계속 봐야지",
  "복수 조정이라고 무조건 정답은 아니다. 그래도 한 장 찍고 끝낸 표보다는 훨씬 설득력 있음",
  "전체 범위는 납득되는데 {part} {changeLabel} 개별 판단에는 이견이 있을 수 있겠다",
] as const;

const UPPER_ONLY_RESTRICTION_REVIEW_COPY = [
  "실효 제한을 {cutCount}종 냈어도 압력이 남은 위협이 있으면 환경 조정은 끝난 게 아님",
  "순위 칸을 채우는 것보다 지금 승률과 점유 압력이 확인된 덱을 필요한 만큼 낮추는 게 먼저지",
  "강한 덱을 여러 장 손봐도 실제 위협 하나가 그대로면 환경 전체 금제라고 하긴 어렵다",
  "이번 표는 일부 문제는 건드렸는데 압력이 남은 테마 대응이 빠져 있음",
  "{cutCount}종이나 바꿨는데도 핵심 위협이 남았다면 범위보다 대상 배분 실패에 가깝다",
  "현재 1등만 끌어내리는 것과 모든 실전 위협을 낮추는 건 별개다",
  "확인된 압력 위협을 통째로 둔 금제는 오래 못 간다",
  "바뀐 덱은 많아도 미대응 위협이 다음 환경을 그대로 가져갈 수 있다는 게 문제임",
  "여러 장을 잘라도 압력이 높은 축이 무풍이면 새 독주를 예약한 셈이지",
  "이번 대상 수는 적지 않은데 실제 위협 커버가 비었다. 범위보다 배치가 아쉬움",
] as const;

const TWO_CARD_INCOMPLETE_RESTRICTION_COPY = [
  "실효 제한 강화가 {cutCount}종이어도 확인된 위협을 필요한 만큼 낮췄다면 숫자만으로 부족하다고 할 수는 없음",
  "카드 수보다 중요한 건 실제 압력 위협이 남았는지다. 적게 잘랐다는 이유만으로 실패는 아님",
  "실효 컷 {cutCount}종으로 끝났다면 다음 환경에서 미대응 위협이 남는지부터 보자",
  "고른 카드 역할이 정확해도 다른 압력 위협을 그대로 뒀다면 설명이 필요하다",
  "한두 장 정밀 타격이 맞을 수도 있다. 다만 그걸로 모든 위협이 충분히 낮아졌는지는 별개임",
  "환경을 실제로 낮추는 변경점 {cutCount}줄 확인. 적은 수보다 남은 위협이 문제다",
  "실효 컷 수를 채우려고 압력 없는 테마까지 자르는 게 더 나쁜 금제일 수 있음",
  "그 제한들이 필요했다는 것과 필요한 제한이 그것뿐이었다는 건 다른 얘기다",
  "금제 카드 선정은 맞을 수 있다. 이제 미대응 위협과 선제 제재가 없는지 봐야 함",
  "선택한 카드가 병목이어도 다른 압력 위협의 병목을 비워 뒀다면 이해하기 어렵다",
  "실효 제한 {cutCount}종 발표 직후 다음 금제 얘기가 나오면 수가 아니라 위협 커버를 확인해야지",
  "한두 장 정밀 타격은 충분할 수도 부족할 수도 있다. 결과를 가르는 건 실제 압력임",
] as const;

const PROLOGUE_TWO_CARD_INCOMPLETE_RESTRICTION_COPY = [
  "실효 제한 강화가 {cutCount}종뿐이면 1티어와 2티어를 같이 본 안내 금제는 아니잖아",
  "실제로 상위권을 낮춘 카드가 {cutCount}종이면 첫 환경을 조정하기엔 여전히 부족함",
  "실효 컷 {cutCount}종으로 끝이면 다음 강덱이 올라오는 순서만 바뀔 가능성이 큼",
  "고른 카드 역할은 정확할 수 있어도 안내된 상위권 핵심을 전부 둔 건 설명이 안 된다",
  "첫 안내 금제에서는 실효 제한 한두 장보다 상위 두 구간을 함께 조정해야지",
  "환경을 실제로 낮추는 변경점 {cutCount}줄 확인. 금제표가 여기서 끝난 게 문제임",
  "그 제한들이 필요했다는 것과 필요한 제한이 그것뿐이었다는 건 다른 얘기다",
  "실효 제한 {cutCount}종 발표 직후 바로 다음 금제 얘기가 나오는 이유가 있음",
] as const;

const LOWER_ONLY_RESTRICTION_REVIEW_COPY = [
  "압력 위협도 아닌 테마를 {cutCount}종이나 선제 제재한 기준이 뭐임?",
  "실전 위협은 따로 있는데 잠재 후보부터 누르면 격차만 더 벌어지잖아",
  "금제 대상이 강한 순서가 아니라 나중에 셀 것 같은 순서로 정해진 것처럼 보인다",
  "지금 압력이 없는 파츠는 잘라 놓고 정작 확인된 위협 대응은 충분한지 모르겠네",
  "현재 위협을 견제할 경쟁자까지 미리 줄이면 독주를 누가 막음? 대상 선정이 거꾸로다",
  "{part} 조정 이유와 별개로 실제 지표 없이 선제컷한 게 가장 큰 문제임",
  "위협 판정 밖 테마까지 손봤다. 이건 예방이 아니라 과잉 예측에 가까운 것 같은데",
  "지금 문제인 덱이 아니라 그 아래 경쟁자부터 약하게 만든 셈이라 결과가 뻔함",
  "비위협 테마 {cutCount}종을 건드릴 근거가 실제 승률과 점유율에 있었는지부터 공개해라",
  "선제컷이 섞인 금제표면 메타 다양화보다 잠재 경쟁자 제거에 가까워 보임",
] as const;

const UPPER_IGNORED_TARGET_COMPARISON_COPY = [
  "아니 지금 최상위권 {ignoredTheme}의 {ignoredPart}는 놔두고 {theme}의 {part}를 자른다고?",
  "1위권 핵심 {ignoredPart}는 그대로 두고 그 아래 {part}부터 제한한 우선순위가 대체 뭐임?",
  "현재 상위권 점유율이 {ignoredShare}인 {ignoredTheme}부터 설명해야지 왜 {theme}가 먼저 맞음?",
  "{ignoredTheme}는 그대로 두고 견제하던 {theme}부터 약하게 만들면 독주를 누가 막냐",
  "강한 덱을 자른 게 아니라 강한 덱 아래 줄을 잘랐네. {part} 선정은 진짜 이해 안 감",
  "{part}가 문제일 수는 있어도 {ignoredPart}보다 먼저여야 할 이유는 하나도 안 보인다",
  "최상위권 본체는 통과, 그 아래 경쟁자만 제한. 이러면 금제표가 티어표를 거꾸로 읽은 거잖아",
  "{ignoredTheme} 핵심을 살려 두고 {theme} 핵심부터 치는 순간 결과는 1강 강화 아닌가",
  "지금 잡아야 할 건 {ignoredTheme}인데 발표문에는 {part}가 올라왔다. 기준 공개 좀",
  "상위권을 그대로 둔 채 {theme}를 먼저 누르는 건 밸런스 조정이 아니라 경쟁자 제거처럼 보임",
] as const;

const LOW_USAGE_TARGET_RESTRICTION_COPY = [
  "{part} 채용률 {usage}, 평균 {averageCopies}장인데 이걸 금제 슬롯까지 써서 자른다고?",
  "실제 덱에 거의 안 들어가는 {part}보다 매판 보이는 핵심부터 봐야 하는 거 아님?",
  "저채용 카드 숫자만 바꾸면 금제표는 길어져도 환경은 그대로일 텐데",
  "{theme} 유저도 잘 안 쓰는 {part}를 골랐다는 것부터 데이터 해석이 이상함",
  "평균 {averageCopies}장 채용 카드를 {limitLabel}으로 만들어서 실제로 몇 장이 빠지는데?",
  "가끔 사고 치는 카드라는 이유만으로 {part}를 자른 거면 그 매치 로그부터 보여 줘야 납득하지",
  "채용률 {usage}인 카드가 희생양이 됐네. 진짜 병목은 따로 있는 것 같은데",
  "예방 금제라 해도 지금 거의 안 쓰이는 {part}가 최우선 대상인 건 설명이 필요함",
  "이건 사용률 낮은 주변 카드 하나 잘라서 일한 척하는 그림으로 보일 수밖에 없음",
  "{part} 제한 뒤에도 같은 덱리가 그대로면 이번 대상 선정은 실패로 봐야지",
] as const;

const LOWER_SHARED_TARGET_DEBATE_COPY = [
  "순수 {theme}는 하위권인데 출장 채용된다는 이유로 {part}부터 자르는 게 맞나",
  "테마 순위만 보면 왜 자르냐가 맞지만 {part}는 다른 덱에서 쓰이는 횟수도 봐야 함",
  "{part} 출장 문제를 잡겠다고 본가 {theme} 생명줄까지 끊는 건 연좌제지",
  "하위 티어 카드라도 상위 덱이 용병으로 계속 쓰면 제한 후보가 되는 건 이해됨",
  "문제는 {part} 자체가 아니라 가져다 쓰는 상위권 엔진인데 순수축만 더 아프게 맞겠네",
  "{theme} 점유율만 보고 무죄라고 하기도 어렵고, 출장 채용만 보고 본가 피해를 무시하기도 어려움",
  "범용성 때문에 자른 거라면 어느 상위 덱이 얼마나 썼는지 근거를 같이 공개했어야 함",
  "{part} 제한 명분은 출장 억제, 실제 피해자는 하위권 {theme}. 이 간극이 너무 큼",
] as const;

const REPLACEMENT_RISK_RESTRICTION_COPY = [
  "{part} 자리에는 바로 {relatedPart} 넣으면 된다는 얘기 나오는데 이게 환경 조정이 맞나",
  "핵심을 자른 게 아니라 같은 역할 카드로 갈아타게 한 것뿐이면 점유율은 안 내려갈 듯",
  "{part} 제한 발표 보자마자 다들 {relatedPart} 매수 중이네. 풍선효과 너무 뻔하다",
  "대체재가 멀쩡한데 한 카드만 줄이면 덱 파워보다 레시피 한 줄만 바뀌지",
  "{relatedPart}가 같은 역할을 메우면 이번 금제 효과는 며칠도 못 갈 것 같은데",
  "교체 가능한 중간다리부터 자른 건 병목을 잘못 짚은 결정으로 보임",
] as const;

const COUNTER_RESEARCH_PENDING_RESTRICTION_COPY = [
  "{theme} 카운터가 막 보급되기 시작했는데 결과도 보기 전에 {part}까지 자른 건 너무 빠른 거 아님?",
  "자연 적응이 진행 중일 때 금제까지 겹치면 뭐가 환경을 고친 건지 나중에 구분 못 함",
  "카운터 연구가 끝나 가도 대회 점유율이 안 내려갔다면 {part} 제한은 필요한 조치였지",
  "유저들이 해답을 찾은 직후 본체까지 자르면 사이드 연구한 사람만 바보 되는 느낌",
  "카운터가 있다는 것과 실제로 모두가 쓸 수 있다는 건 다름. 보급 속도까지 보고 판단해야 함",
  "일주일만 더 관찰했으면 자연 적응으로 잡히는지 금제가 필요한지 구분됐을 텐데",
] as const;

const ACCESSIBILITY_RESTRICTION_DEBATE_COPY = [
  "{part} 필요 매수를 줄여 진입비용이 내려가는 건 반갑지만 금제로 가격 정책을 대신하면 안 되지",
  "고채용 카드를 제한하면 덱값은 내려가도 기존 구매자는 또 손실을 떠안는다",
  "접근성 때문에 {part}를 줄였다는 설명이면 재판이나 공급 확대가 먼저였어야 하는 거 아님?",
  "성능 조정과 구매 부담 완화가 같이 되는 선택일 수는 있는데 어느 쪽이 목적이었는지 애매함",
  "필수 카드 매수를 낮춰 신규 유저는 편해지고 기존 유저 신뢰는 깎이는 전형적인 양날의 검",
  "{part}가 너무 많이 필요했던 건 맞다. 그래도 봉입과 공급 문제를 금제표에 떠넘긴 느낌은 남음",
] as const;

const COLLECTOR_BACKLASH_RESTRICTION_COPY = [
  "{theme} 얼굴인 {part}를 자르면 성능보다 먼저 컬렉션 가치가 흔들리겠네",
  "인기 카드라고 금제에서 빼 줄 수는 없지만 산 사람 입장에서는 배신감 클 듯",
  "{part}가 상징 카드라서 봐주면 특혜고, 그대로 자르면 수집층 신뢰가 박살 나는 어려운 자리네",
  "환경을 위해 필요한 제한이어도 대표 카드를 건드린 만큼 보상이나 재판 정책은 있어야지",
  "플레이 가치와 수집 가치가 한 번에 내려가는 카드라 반발이 평소 금제보다 세겠다",
  "인기 테마 핵심이라 못 자른다는 논리도 이상함. 문제는 왜 이 강도로 바로 갔냐는 거지",
] as const;

const OVERBROAD_RESTRICTION_DEBATE_COPY = [
  "이번엔 핵심뿐 아니라 주변 카드까지 너무 넓게 쓸어 담았는데 원인이 뭐였는지 사후 분석 가능함?",
  "여러 테마를 한꺼번에 자르면 새 환경은 열리겠지만 멀쩡한 덱까지 같이 사라질 수 있음",
  "광역 금제로 리셋하는 건 시원해 보여도 각 카드가 정말 필요했는지는 따로 봐야지",
  "범위가 넓다는 것과 정교하다는 건 다르다. 이번 표는 연좌 피해부터 걱정됨",
  "상위권을 고르게 낮춘 건 좋지만 하위권 카드까지 섞인 순간 과잉 규제 논쟁은 피하기 어렵다",
  "한 번에 다 자르면 다음 독주가 생겨도 어느 제한을 되돌려야 할지 알 수가 없음",
] as const;

const MISSING_TIER2_GAP_RESTRICTION_COPY = [
  "실제 위협은 덜 막고 압력 없는 테마까지 미리 잘랐다. 두 방향이 동시에 어긋났네",
  "현재 문제를 충분히 낮추지 않은 채 잠재 후보를 선제 제재하면 풍선효과보다 선택지 감소가 먼저 온다",
  "제한 수는 넓게 나뉘었지만 미대응 위협과 비위협 컷이 같이 있으면 균형 금제가 아님",
  "대상이 여러 구간에 퍼졌어도 실제 압력과 무관한 배치라면 이상하다",
  "선제컷할 여유로 남은 위협을 더 정확히 다뤘어야 하는 것 아님?",
  "순위표의 다음 줄을 미리 자를 게 아니라 확인된 위협부터 필요한 만큼 낮춰야지",
] as const;

const BOTH_TIERS_CUTS_ONLY_REVIEW_COPY = [
  "실제 압력 위협을 모두 필요한 만큼 조정한 건 좋다. 다만 오래 묶인 카드도 같이 풀었으면 더 완성도 있었을 듯",
  "확인된 위협만 누른 건 납득되는데 이번에도 해제 목록이 빈 건 아쉽네",
  "미대응 위협도 선제 제재도 없이 현재 문제를 다룬 건 맞다. 이제 장기 제한 정리도 정기적으로 해 줘야지",
  "제한 {cutCount}종으로 현재 압력 대응은 끝냈다. 과거 금제까지 검토했으면 더 좋았겠음",
  "한 덱만 희생양 삼지 않은 점은 좋다. 다만 풀어 줄 카드 없이 계속 잠그기만 하는 운영은 별개 문제",
  "이번 금제는 현재 상위권 조정은 제대로 했다. 장기 제한 해제가 빠진 반쪽짜리 순환인 건 남고",
] as const;

const MISSING_STALE_RELIEF_RESTRICTION_COPY = [
  "현재 압력 위협 조정은 충분한데 오래 묶인 해제 후보를 그대로 둔 건 아쉽다",
  "현재 상위권 커버는 잘했다. 그래도 장기 제한 정리까지 끝낸 완성형 표는 아님",
  "현역 위협은 제대로 눌렀는데 묵은 카드를 돌려주는 순환 축이 빠졌네",
  "제한 {cutCount}종의 위협 배분은 납득된다. 장기 제한 방치는 별도 감점 요소임",
  "환경 압력 대응은 됐지만 오래된 제한을 풀지 않으면 카드 풀 순환은 반쪽짜리지",
  "현재 위협 조정이 부족한 표는 아니다. 이번에도 해제 못 받은 장기 제한 카드가 문제임",
] as const;

const BOTH_TIERS_NO_STALE_REVIEW_COPY = [
  "확인된 압력 위협을 모두 조정했고 오래 묶인 해제 후보도 없었다면 이번 범위는 납득됨",
  "실제 위협을 필요한 만큼 눌렀고 정리할 장기 제한이 없다면 억지 해제 없이 끝낸 게 맞지",
  "제한 {cutCount}종이 위협 압력에 맞춰 배분됐네. 현재 환경 대응으로는 균형이 잘 잡혔다",
  "한 덱만 찍지도, 다음 상위권을 추측해 미리 자르지도 않았고 묵은 제한도 없다면 깔끔한 표임",
  "해제할 카드를 억지로 만들진 않고 현역 위협만 조정한 건 합리적이다",
  "이번엔 미대응 위협도 비위협 선제컷도 없어서 대상 선정이 깔끔하네",
  "압력이 확인된 축을 필요한 만큼 건드렸고 장기 제한 후보도 없다면 필요한 일은 다 한 셈",
  "해제 목록이 빈 이유가 방치가 아니라 대상 없음이면, 이번 {cutCount}종 조정은 깔끔하다",
  "다음 순위를 미리 자르지 않고 현재 위협에만 책임을 물은 점에서 기준이 명확함",
  "장기 제한 정리할 카드가 없는 시점에 현역 위협을 정확히 조정했으면 구성은 적정함",
] as const;

const UNBAN_ONLY_RESTRICTION_REVIEW_COPY = [
  "오래된 제한 {oldUnbanCount}종을 푼 건 반갑다. 현재 압력 위협이 없다면 억지 제한을 더할 이유도 없지",
  "해제만으로 순환을 만들 수 있고 지금 환경 압력이 낮다면 이번 표는 그걸로 충분할 수 있음",
  "묵은 금제 정리는 잘했다. 현역 제한 목록이 빈 이유가 위협 부재라면 납득 가능",
  "풀어 주는 표라고 매번 새 제한을 끼워 넣을 필요는 없다. 실제 위협이 있었는지가 기준이지",
  "장기 제한 해제는 플러스고 실효 컷 0종은 현재 압력이 낮을 때만 정당화된다",
  "과거 카드를 복권하면서 압력 없는 현역 덱은 보존했다면 불필요한 선제컷보다 낫다",
] as const;

const FRESH_UNBAN_ONLY_RESTRICTION_REVIEW_COPY = [
  "제한한 지 오래되지 않은 카드를 바로 푼 이유부터 설명해야 할 것 같은데",
  "이번 표는 해제만 있고 현역 상위권 제한은 없다. 빠른 번복과 환경 대응은 따로 봐야 함",
  "최근 제한을 되돌린 거라면 당시 판단이 틀렸는지 환경이 바뀌었는지 기준을 공개해 줘야지",
  "카드를 돌려준 건 반갑지만 장기 제한 정리가 아니라 빠른 재검토에 가깝다",
  "해제 자체보다 제한 후 얼마 안 돼 다시 푼 의사결정 과정이 궁금함",
  "현역 압력 위협이 없었다면 추가 제한이 빈 건 문제 아니다. 최근 제한을 왜 되돌렸는지가 쟁점임",
] as const;

const MULTI_COSMETIC_RESTRICTION_REVIEW_COPY = [
  "금제표에는 {changeCount}종이 바뀌었는데 실사용 매수가 줄어드는 카드는 0종이네",
  "여러 줄을 고쳤어도 실제 구축이 전부 그대로면 환경 조정은 한 게 없음",
  "cosmetic 변경 {cosmeticCount}종으로 표만 길어졌지 실제 환경 압력은 그대로잖아",
  "원래 한 장 쓰던 카드들 제한선만 낮춘 거면 복수 조정처럼 포장하면 안 되지",
  "변경 수는 많아 보여도 덱에서 빠지는 카드가 0장이면 보여 주기 금제임",
  "실효 컷 없이 숫자만 여러 개 바꿨네. 왜 상위권 핵심은 그대로 둔 거임?",
  "구축 변화 0장짜리 금제표를 복수 제한이라고 부르긴 어렵다",
  "실사용 범위 바깥만 {cosmeticCount}종 건드렸으면 환경은 발표 전과 똑같음",
] as const;

const COSMETIC_PLUS_RELIEF_RESTRICTION_REVIEW_COPY = [
  "제한 강화 쪽 실효 컷은 0종이고 해제 효과만 실제 환경 변수로 남은 표네",
  "숫자만 바뀐 제한과 실제 완화·해제가 섞였다. 상위권을 낮춘 카드는 없다는 건 분명함",
  "cosmetic 제한은 구축을 못 바꾸지만 풀린 카드 쪽 복귀는 따로 관찰해야 한다",
  "환경이 발표 전과 같진 않겠다. 다만 변화가 제한 강화가 아니라 해제 방향에서만 생김",
  "상위권 실효 컷 0종이라 현재 강덱 대응은 비었고, 이번 표의 실전 효과는 풀린 카드가 결정하겠네",
  "보여 주기 제한과 실제 해제를 한 묶음으로 세면 안 된다. 두 방향의 효과가 완전히 다름",
] as const;

const MIXED_FRESH_UNBAN_RESTRICTION_COPY = [
  "제한과 해제를 같이 넣은 방향은 좋은데, 해제 대상이 오래 묶인 카드였는지는 따로 봐야 함",
  "상위권을 자르면서 카드도 풀었네. 다만 최근 제한을 바로 번복한 거라면 기준 일관성이 궁금함",
  "mixed 표 자체는 순환 의도가 보이지만 {oldUnbanCount}종만 장기 제한 해제라는 건 아쉽다",
  "현재 메타 조정과 해제를 함께 본 건 납득된다. 풀어 준 카드의 복역 기간은 공개해 줬으면",
  "잠그기만 한 표는 아니어서 좋다. 그래도 오래된 제한부터 풀었다고 보긴 어렵네",
  "제한 {cutCount}종과 해제를 같이 처리한 건 맞지만 해제 우선순위가 적절했는지는 논쟁 남겠다",
] as const;

const PARTIAL_STALE_RELIEF_RESTRICTION_COPY = [
  "오래 묶인 카드를 완화한 건 맞지만 완전 해제라고 부를 단계는 아니다",
  "장기 제한을 한 칸 풀어 준 것과 완전 해제는 구분해야지. 아직 복귀 폭은 제한적임",
  "현재 위협 조정은 좋지만 묵은 카드가 전부 자유가 된 것처럼 말하긴 이르다",
  "오래된 제한을 검토한 흔적은 보인다. 그래도 부분 완화와 해제는 효과가 다름",
  "현재 상위권 범위는 납득되는데 장기 제한 정리는 완화에서 멈췄다는 아쉬움이 남네",
  "묵은 카드 매수를 늘려 준 건 플러스다. 완전 해제까지 못 간 근거도 듣고 싶음",
] as const;

const THREE_FOUR_CARD_RESTRICTION_COPY = [
  "변경 {cutCount}종이면 최소한 한 장 찍고 끝낸 표는 아니다. 이제 실제 위협을 덮었는지가 핵심임",
  "서너 장 조정은 체감 가능한 범위지만 같은 덱에 몰렸다면 숫자만 많아진 거지",
  "{cutCount}종을 손봤으니 카드 수는 중간 규모다. 역할과 위협 압력 배분을 같이 봐야 함",
  "이번 금제는 변경 수만 보면 최소 조정 이상이다. 미대응 위협이나 비위협 선제컷은 별도 문제",
  "서너 장이면 덱 하나를 넘어서 볼 수도, 한 축을 과하게 칠 수도 있는 애매한 구간이네",
] as const;

const INCOMPLETE_TIER_COVERAGE_RESTRICTION_COPY = [
  "여러 구간을 보긴 했지만 실제 압력이 남은 위협이 있으면 커버가 끝난 건 아니네",
  "대상 범위는 넓어도 위협별 필요한 타격을 채운 표가 아니다. 커버가 한쪽에서 비어 있음",
  "여러 테마에 이름은 올렸는데 한 위협은 필요한 만큼 낮추지 못했다",
  "변경 수와 별개로 실제 압력 위협에 실효 제한을 충분히 배분했는지가 중요하지",
  "여러 카드를 바꿔도 위협 하나의 실효 컷이 부족하면 균형 잡힌 범위는 아님",
  "여러 순위를 건드린 흔적은 있지만 위협 압력 기준의 완성형 표까지는 못 갔다",
] as const;

const FIVE_PLUS_CARD_RESTRICTION_COPY = [
  "{cutCount}종을 한꺼번에 자른 대형 금제네. 범위는 넓지만 역할 중복 타격은 꼭 확인해야 함",
  "다섯 장 이상이면 환경을 크게 흔들겠다는 뜻은 분명하다. 과잉과 정리 사이를 실전이 가르겠네",
  "변경 수는 충분하다 못해 많다. 공용 파츠 연좌와 같은 역할 중복 제한이 걱정됨",
  "{cutCount}종 조정이면 한두 장 부족 논란은 없겠다. 대신 덱 여러 개를 통째로 지운 건 아닌지 봐야지",
  "대형 금제는 새 환경을 열 수 있지만 제한 강도까지 전부 최대치면 비용이 너무 커질 수 있음",
] as const;

const SINGLE_RESTRICTION_STABILIZED_COPY = [
  "한 장만 잘라서 부족하다 했는데 D+{followupAge}에 점유율 곡선이 이렇게 눕는 건 예상 못했다",
  "이걸 노렸다고? {part} 하나로 상위권 집중도까지 내릴 계산이었나",
  "금제표 한 줄 보고 욕했는데 {part} 조정 뒤 환경이 실제로 퍼졌네",
  "한 장으로 여기까지 계산한 거면 이번 운영 판단은 다시 봐야겠다",
  "실효 제한이 {cutCount}종뿐이라 무책임해 보였는데 결과적으로 과잉 없이 상위권을 낮췄네",
  "D+{followupAge} 기준 1·2위 합계가 {topTwoShare}. 적게 자른 게 정교한 조정이었을 줄은 몰랐다",
  "다음 덱이 빈자리 독식할 줄 알았는데 최고 점유율 {topShare}면 일단 계산은 맞은 듯",
  "{part} 하나가 진짜 병목이었나 보네. 여러 장 안 잘라도 환경이 여기까지 움직이는구나",
] as const;

const TWO_CARD_RESTRICTION_STABILIZED_COPY = [
  "두 장뿐이라 부족하다 했는데 D+{followupAge} 환경이 실제로 고르게 퍼진 건 의외네",
  "{cutCount}종으로 여기까지 계산했다고? 넓게 자르는 것보다 병목을 제대로 고른 셈인가",
  "금제표가 짧아서 불안했는데 1·2위 합계 {topTwoShare}면 결과는 인정해야겠다",
  "환경을 실제로 낮춘 두 카드로 최고 점유율을 {topShare}까지 내렸으면 표적 선정은 정확했던 듯",
  "다음 덱 독주 없이 상위권이 같이 내려갔네. 적은 변경으로 이 결과는 예상 못 함",
  "D+{followupAge}까지 보니 {cutCount}종 조정이 최소 변경으로 작동한 사례가 되겠는데",
] as const;

const NARROW_RESTRICTION_STILL_INSUFFICIENT_COPY = [
  "D+{followupAge}인데도 상위권 집중이 그대로네. 역시 실효 제한 {cutCount}종만으로는 부족했음",
  "최고 점유율이 아직 {topShare}면 확인된 위협을 충분히 낮추지 못했다는 말이 맞았지",
  "{part} 조정만으로 안 된다는 게 벌써 보인다. 다음 금제까지 또 기다려야 함?",
  "한두 장만 자르고 환경이 알아서 정리되길 바랐나. 1·2위 합계가 아직 {topTwoShare}임",
  "결국 빈자리를 다른 압력 위협이 먹었다. 당시 지표에 잡힌 위협부터 충분히 조정했어야지",
  "D+{followupAge} 결과까지 나왔는데도 고착이면 이번 금제 범위가 좁았던 게 맞다",
  "실효 제한 {cutCount}종 뒤 상위권 순서만 바뀌었네. 환경 개선과 1등 교체는 다름",
  "처음부터 말했잖아. 한 장 정확히 찍는 것과 금제표 전체가 충분한 건 별개라고",
] as const;

const NARROW_RESTRICTION_OVERKILL_FOLLOWUP_COPY = [
  "D+{followupAge}에 {part} 쪽 점유율이 붕괴했네. 한두 장만 골라서 너무 세게 친 결과 아닌가",
  "환경을 고르게 만든 게 아니라 대상 덱만 지웠다. {cutCount}종 소수 표적에 강도를 몰아 준 부작용임",
  "{part} 조정 뒤 해당 축이 사실상 사라졌으면 정교한 금제가 아니라 단일 표적 과잉이지",
  "최고 점유율 숫자만 낮아졌다고 성공은 아님. 한 덱을 퇴출시킨 비용이 너무 크다",
  "D+{followupAge} 결과는 안정이 아니라 붕괴에 가깝다. 단계 낮은 제한은 정말 안 됐나",
  "한두 카드에 최대 타격을 몰아 주면 이렇게 된다. 여러 축을 약하게 나눠 치는 편이 나았음",
] as const;

const NARROW_RESTRICTION_BALLOON_FOLLOWUP_COPY = [
  "{part} 쪽은 내려갔는데 다른 덱이 바로 최고 점유율 {topShare}까지 먹었네. 풍선효과 그대로임",
  "D+{followupAge} 결과가 1등 교체뿐이면 금제가 환경을 고친 건 아니지",
  "한두 장만 자른 뒤 다른 덱이 빈자리를 통째로 먹었다. 당시 압력 신호를 놓쳤는지 다시 봐야 함",
  "대상 덱 점유율만 눌리고 1·2위 합계는 {topTwoShare}. 상위권 집중은 그대로잖아",
  "실효 제한 {cutCount}종의 예상된 결말: 다음 줄이 올라와 새 독주 시작",
  "순위표 다음 줄을 미리 자르라는 뜻은 아니지만, 이미 있던 압력 신호를 놓쳤다면 대상 선정 실패임",
] as const;

const NARROW_RESTRICTION_MIXED_FOLLOWUP_COPY = [
  "D+{followupAge} 수치는 조금 움직였는데 실효 제한 {cutCount}종이 충분했다고 결론 내리긴 애매하다",
  "{part} 조정 뒤 수치가 엇갈려서 상위권 전체가 안정됐는지는 아직 반반이네",
  "한두 장 금제 효과가 아예 없진 않은데 1·2위 합계 {topTwoShare}면 더 지켜봐야 함",
  "최고 점유율 {topShare}까지는 내려왔지만 새 분포가 굳기 전엔 성공 선언하기 이르다",
  "부족하다는 첫인상보단 나아졌지만 미대응 위협이 없었다고 결론 내릴 만큼 확실한 결과는 아직 없음",
] as const;

type RestrictionRoleGroup = "starter" | "bridge" | "finisher" | "recursion";
type RestrictionReactionPhase = "immediate" | "rebuild" | "results";

const SINGLE_ROLE_RESTRICTION_COPY = {
  starter: {
    immediate: [
      "{part}는 초동이라 다른 파츠가 살아 있어도 첫 패에서 시작할 확률부터 내려간다",
      "결과물을 자른 게 아니라 시작 카드인 {part} 매수를 건드린 초동 금제네",
      "{part} {limitLabel}이면 고점보다 초동 진입 성공률이 먼저 달라질 듯",
      "나머지 전개축은 그대로지만 {part}로 시작하던 손패 비율은 확실히 줄겠다",
      "초동 한 종 조정이라 패 말림과 대체 초동 수가 이번 평가 기준임",
      "{part} 초동을 못 잡는 판이 늘어나는 게 핵심이지 다른 결과물이 사라진 건 아님",
      "이번에는 보스가 아니라 입구를 좁혔다. {theme} 초동 수부터 다시 세야겠네",
      "{part} 의존 손패가 얼마나 많았는지가 {changeLabel} 뒤 일관성 체감을 결정하겠다",
    ],
    rebuild: [
      "{part} 자리에 두 번째 초동을 늘린 리스트가 먼저 올라오네",
      "초동 총매수 맞추려고 서치 카드와 드로 소스 비율을 다시 짜는 중",
      "{part} 감소분을 다른 1장 초동으로 채울 수 있으면 안정성 손실은 줄어든다",
      "첫 패 확률 계산해 보니 대체 초동을 몇 장 넣느냐에 따라 차이가 크네",
      "{theme} 유저들이 결과물보다 초동 9장·10장 기준부터 다시 맞추고 있음",
      "{part} 대신 들어간 초동이 패 코스트를 더 먹어서 구축 선택이 갈리겠다",
      "두 장 조합까지 허용하면 시작 수는 복구되는데 후공 공간이 줄어드네",
      "초동 대체재는 있어도 {part}만큼 단독으로 깔끔한지는 별개 문제임",
    ],
    results: [
      "며칠 돌려 보니 {part} 감소 뒤 선공 고점보다 전개 실패율이 먼저 올랐네",
      "{theme} 입상 수보다 첫 패 통과율이 얼마나 떨어졌는지 보고 싶다",
      "대체 초동 구축은 굴러가지만 패 코스트 때문에 장기전 승률이 갈리는 듯",
      "{part} 없는 손패를 살리는 리스트와 못 살리는 리스트 차이가 커졌다",
      "초동 수를 복구한 덱은 남고 후공 카드를 유지한 덱은 말림을 감수하는 분위기",
      "이번 조정 효과는 최종 필드보다 게임을 시작한 판의 비율에서 더 잘 보이네",
      "초동 확률이 내려간 만큼 매치 수가 쌓이면 {theme} 점유율에도 반영되겠다",
      "{part} 대체재가 정리되면서 첫날보다는 안정됐지만 예전 일관성은 아니네",
    ],
  },
  bridge: {
    immediate: [
      "{part}는 초동과 결과물을 잇는 연결축이라 시작 카드는 잡혀도 경로가 달라진다",
      "입구나 보스를 자른 게 아니라 전개 중간 병목인 {part}를 건드렸네",
      "{part} {limitLabel}이면 기존 전개 경로와 연속 루트부터 다시 그려야 함",
      "다른 파츠 매수는 같아도 {part}가 연결하던 조합 수가 줄어드는 금제다",
      "중간다리 한 종 조정이라 손패보다 전개 경로 수가 먼저 줄겠네",
      "{part}가 맡던 연결을 다른 카드가 이어 줄 수 있는지가 핵심임",
      "시작은 되는데 기존 결과물까지 완주하는 길이 끊기는 유형의 제한 같다",
      "{changeLabel}의 중간 병목 체감은 {part}를 한 턴에 몇 번 거쳤는지에 따라 갈리겠네",
    ],
    rebuild: [
      "{part}를 덜 거치는 짧은 전개 루트 정리글이 벌써 올라왔네",
      "연결축 대체 카드 넣으니 고점은 낮아져도 완주율은 생각보다 괜찮다",
      "두 장 조합으로 {part} 구간을 건너뛰는 구축이 연구되는 중",
      "기존 긴 루트 대신 중간 결과물에서 멈추는 플랜도 현실적인 선택 같음",
      "{part} 대체재는 효과가 비슷해도 서치 범위가 달라서 덱리가 크게 갈리네",
      "전개 순서를 바꾸면 병목은 넘기는데 패 소모가 한 장 더 드는구나",
      "짧은 루트와 복구 루트 중 어느 쪽이 {theme} 새 정석이 될지 모르겠다",
      "연결 파츠를 여러 종으로 분산하니 한 장 의존도는 줄지만 덱 공간이 빡빡함",
    ],
    results: [
      "{part} 조정 뒤 전개 시간은 줄었는데 완성 필드 편차는 더 커진 듯",
      "짧은 루트가 자리 잡으면서 예전 최고점보다 안정적인 중간값을 택하네",
      "연결축 대체가 안 잡힌 판은 멈추는 지점이 확실히 빨라졌다",
      "며칠 지나니 {part} 없이 완주하는 비율이 이번 금제 강도를 보여 주는 듯",
      "{theme} 숙련자는 우회하지만 입문자는 기존 루트가 끊겨 체감이 더 크겠다",
      "중간 병목이 줄어든 게 아니라 선택지가 줄어서 상대가 읽기는 쉬워졌네",
      "대체 연결축이 정착한 리스트와 예전 루트를 고집한 리스트 성적이 갈린다",
      "이번 제한은 시작 패보다 한 전개 안에서 갈 수 있는 경로 수를 줄인 효과가 크네",
    ],
  },
  finisher: {
    immediate: [
      "{part}는 결과물이라 초동과 전개 파츠는 그대로고 최종 필드만 다시 짜야 한다",
      "시작축을 자른 게 아니라 전개 끝의 마무리 결과물 {part}를 {limitLabel}으로 바꾼 금제네",
      "{part} 공백은 패 말림보다 선공 고점과 마무리 수단에서 먼저 드러날 듯",
      "다른 {theme} 파츠는 그대로라 전개는 되지만 도착점이 달라진다",
      "결과물 한 종 조정이라 기존 루트가 아예 멈추는지, 다른 보스로 끝나는지가 핵심임",
      "{part} 결과물이 맡던 견제 수를 무엇으로 나눠 채울지가 새 구축의 첫 문제겠네",
      "초동률은 그대로인데 최종 필드 마지막 한 칸의 압박이 줄어드는 형태로 보인다",
      "이번 {changeLabel} 조정은 전개 엔진보다 최종 필드의 상한을 겨냥한 선택임",
    ],
    rebuild: [
      "{part} 대신 세울 대체 결과물 둘을 나눠 쓰는 리스트가 올라왔네",
      "기존 전개는 유지하고 마무리 소환만 바꾸는 쪽이 가장 먼저 연구되는 중",
      "결과물 하나를 낮추고 남는 자원으로 후속을 챙기는 구축도 괜찮아 보임",
      "{part} 자리에는 같은 압박의 대체 결과물보다 역할이 다른 보스를 넣는 게 현실적일 듯",
      "최종 필드를 한 장으로 압축 못 하니 견제를 여러 카드에 분산해야겠네",
      "대체 결과물은 세기는 낮아도 후공에서 덜 막히는 장점이 있구나",
      "{part} 없이도 전개는 완주되는데 마무리 선택지가 훨씬 정직해졌다",
      "예전 도착점을 복제하려는 구축과 아예 장기전으로 트는 구축이 갈리네",
    ],
    results: [
      "며칠 지나니 {part} 없는 {theme}는 초동률보다 선공 고점의 승률이 먼저 내려갔다",
      "전개 성공 횟수는 비슷한데 최종 필드 돌파 난도가 확실히 낮아졌네",
      "대체 결과물 구축이 남아 있어서 덱이 사라진 건 아니지만 고점 차이는 보인다",
      "결과물인 {part} 공백 뒤 한 번 막힌 전개를 후속으로 이기는 판이 늘어난 느낌",
      "결과물 선택지가 분산되니 상대도 한 장으로 모든 판을 대비하긴 어려워졌네",
      "최고점은 낮아졌지만 장기전형 리스트가 자리 잡으면서 잔존율은 남아 있다",
      "이번 금제 효과는 매칭 빈도보다 최종 필드의 평균 견제 수에서 더 잘 보임",
      "{part} 대체안이 정리돼도 예전 한 장짜리 도착점만큼 압축되지는 않네",
    ],
  },
  recursion: {
    immediate: [
      "{part}는 회수축이라 첫 전개보다 두 번째 턴 이후 자원전이 먼저 약해진다",
      "초동이나 결과물이 아니라 후속을 책임지던 {part}를 조정한 금제네",
      "{part} {limitLabel}이면 첫 필드는 같아도 후속 복구 횟수가 달라질 듯",
      "다른 파츠는 그대로라 첫 턴보다 장기전에서 빈자리가 크게 느껴지겠다",
      "회수 카드 한 종 감소라 자원을 다시 돌리는 루프부터 확인해야 함",
      "{part}가 맡던 재전개를 대체 못 하면 한 번 필드가 깨진 뒤가 문제겠네",
      "이번 조정은 고점보다 장기전 자원을 반복해서 쓰는 힘을 겨냥한 것 같다",
      "{changeLabel}의 후속 체감은 첫 패가 아니라 세 번째 턴 손패에서 나오겠지",
    ],
    rebuild: [
      "{part} 대신 일회성 회수 카드를 늘린 구축은 복구력보다 속도를 택했네",
      "장기전 자리를 드로 소스로 바꾸니 첫 전개는 좋아져도 후속이 얇다",
      "재전개 루프를 포기하고 두 번째 공격에 자원을 몰아주는 리스트가 보임",
      "{part} 공백을 다른 회수 카드 둘로 나누니 덱 공간 부담이 커졌다",
      "묘지 회수 대신 덱 순환을 쓰는 구축이 새 대안으로 올라오는 중",
      "한 번 막힌 뒤 다시 세우는 루트가 줄어서 첫 필드를 더 보수적으로 짜게 되네",
      "회수축 대체재는 느리지만 후공 카드와 같이 잡히면 의외로 버틸 만함",
      "{part} 없이 장기전을 포기할지, 약한 후속을 더 넣을지 선택이 갈린다",
    ],
    results: [
      "{part} 조정 뒤 첫 턴 승률보다 긴 매치의 역전율이 먼저 내려간 듯",
      "필드 한 번 치우고 나면 {theme}가 다시 자원을 모으는 속도가 확실히 느려졌다",
      "짧은 게임에서는 차이가 적고 세 번째 턴부터 손패 격차가 벌어지네",
      "회수축 대체 카드를 넣은 리스트는 남았지만 덱 공간 손해가 성적에 보인다",
      "후속이 얇아진 대신 첫 필드에 자원을 몰아주는 구축이 더 많아졌음",
      "{part} 없는 장기전 플랜이 정리되면서 상대도 소모전을 선택하기 쉬워졌다",
      "이번 제한은 점유율보다 평균 게임 길이별 승률을 봐야 정확하겠네",
      "재전개 횟수가 줄어드니 예전처럼 같은 필드를 반복하는 판은 확실히 적다",
    ],
  },
} as const;

const SINGLE_ONE_COPY_NEGATION_FINISHER_BAN_COPY = [
  "{part}는 원래 한 장 쓰던 결과물이라 3→0 표기만큼 세 장이 빠지는 금제는 아님",
  "한 장 채용하던 결과물 {part}는 1장 제한이 의미 없어서 유지와 금지 사이의 선택이었겠네",
  "다중 무효를 맡던 {part} 결과물만 금지됐고 초동과 연결 파츠 매수는 그대로다",
  "이번 변경은 전개 횟수를 줄인 게 아니라 전개 끝의 {part} 도착점을 없앤 금제임",
  "{part} 하나를 정확히 겨냥한 건 분명하지만 유일한 최종 결과물 공백은 크게 느껴지겠다",
  "초동률은 그대로고 다중 무효 고점만 내려간다는 점을 구분해서 봐야 함",
  "{part} 금지 뒤에도 전개 엔진은 남으니 새 최종 필드가 어느 정도인지가 핵심이다",
  "한 종만 금지됐어도 결과물 역할을 독점했다면 체감 타격은 클 수밖에 없음",
  "상대는 {part} 다중 무효를 안 봐도 되고 {theme} 유저는 마무리를 새로 짜야 하네",
  "{part} 없는 최종 필드를 보기 전에는 단일 금지가 과잉인지 적정인지 단정하기 이르다",
  "다른 축까지 제한된 건 아니고 {part}가 맡던 선공 고점 하나가 사라진 형태임",
  "원래 한 장짜리 결과물은 매수 제한으로 약화하기 어려워 금지 판단 자체가 더 극단적으로 보인다",
] as const;

type WeightedTheme = {
  id: ThemeId;
  weight: number;
};

function keyedUint(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const text = keys
    .map((key) =>
      typeof key === "string" ? getStableThemeRandomIdentifier(key) : key,
    )
    .join("\u001f");
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

function keyedIndex(
  length: number,
  seed: number,
  ...keys: Array<string | number>
) {
  if (length <= 1) return 0;
  return keyedUint(seed, ...keys) % length;
}

type ReleasedProduct = GameState["releaseHistory"][number]["products"][number];
type ReleasedThemeProduct = Extract<
  ReleasedProduct,
  { kind: "new-theme" | "support" }
>;

function isThemeReleaseProduct(
  product: ReleasedProduct,
): product is ReleasedThemeProduct {
  return product.kind === "new-theme" || product.kind === "support";
}

type ThemeStrength = "strong" | "middle" | "weak";
type SupportStrength = "strong" | "middle" | "weak";

type SupportReactionContext = {
  themeStrength: ThemeStrength;
  supportStrength: SupportStrength;
  share: number;
  supportNumber: number;
  replacementPressure: number;
  replacesCore: boolean;
  newParts: readonly PartContent[];
  displacedOldParts: readonly PartContent[];
};

type ReprintReactionContext = {
  cardName: string;
  cardId: string;
  themeName: string;
  genericCardId?: GenericCardId;
  partId?: string;
  referencePrice: number;
  currentPrice: number;
  dropRate: number;
  reprintCount: number;
  collectorPrinting: boolean;
  severeTrustBacklash: boolean;
  accessibilityUserGain: number;
  collectorUserLoss: number;
};

function assertCommunityDay(state: GameState, day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > state.day) {
    throw new RangeError(`Community day must be an integer from 1 to ${state.day}.`);
  }
}

function isRestrictionDecisionType(type: CommunityEventType): boolean {
  return (
    type === "restriction-applied" ||
    type === "cosmetic-restriction" ||
    type === "restriction-no-change"
  );
}

function isRestrictionDecisionEvent(event: CommunityEvent): boolean {
  return (
    event.day >= FIRST_BAN_DAY &&
    event.day <= LAST_DECISION_DAY &&
    (event.day - FIRST_BAN_DAY) % BAN_INTERVAL === 0 &&
    isRestrictionDecisionType(event.type)
  );
}

function partsAvailableByDay(
  state: GameState,
  themeId: ThemeId,
  day: number,
): readonly PartContent[] {
  const content = THEME_BY_ID[themeId];
  if (!content) return [];
  const supportCount = state.releaseHistory.reduce(
    (count, batch) =>
      batch.day < day
        ? count +
          batch.products.filter(
            (product) => product.kind === "support" && product.themeId === themeId,
          ).length
        : count,
    0,
  );
  return content.parts.slice(
    0,
    Math.min(
      content.parts.length,
      INITIAL_THEME_PART_COUNT + supportCount * SUPPORT_PARTS_PER_RELEASE,
    ),
  );
}

type StaleRestrictionCandidate = {
  content: ThemeContent;
  part: PartContent;
  limit: RestrictionLimit;
  restrictedDays: number;
  share: number;
  rank: number;
};

function historicalRestrictionState(
  state: GameState,
  themeId: ThemeId,
  partId: string,
  day: number,
): { limit: RestrictionLimit; restrictedSince: number | null } {
  let limit: RestrictionLimit = 3;
  let restrictedSince: number | null = null;
  const events = state.community
    .filter(
      (event) =>
        event.day < day &&
        event.themeId === themeId &&
        event.partId === partId &&
        isRestrictionDecisionEvent(event) &&
        Number.isInteger(event.value) &&
        event.value! >= 0 &&
        event.value! <= 3,
    )
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
  for (const event of events) {
    const nextLimit = event.value as RestrictionLimit;
    if (nextLimit < limit) restrictedSince = event.day;
    else if (nextLimit === 3) restrictedSince = null;
    limit = nextLimit;
  }
  return { limit, restrictedSince };
}

function staleRestrictionCandidates(
  state: GameState,
  day: number,
  dueOnly: boolean,
): StaleRestrictionCandidate[] {
  const snapshot = historyAtOrBefore(state, day);
  if (!snapshot) return [];
  const positionByTheme = new Map(
    Object.keys(snapshot.shares).map((themeId) => [
      themeId,
      shareRank(snapshot.shares, themeId),
    ]),
  );
  const candidates: StaleRestrictionCandidate[] = [];
  for (const [themeId, position] of positionByTheme) {
    const content = THEME_BY_ID[themeId];
    if (!content) continue;
    const lowShare = position.share <= 0.08;
    const bottomForty = position.rank >= Math.floor(position.count * 0.6);
    if (!lowShare && !bottomForty) continue;
    for (const part of partsAvailableByDay(state, themeId, day)) {
      const restriction = historicalRestrictionState(state, themeId, part.id, day);
      if (
        restriction.limit >= 3 ||
        restriction.restrictedSince === null ||
        day - restriction.restrictedSince < 90
      ) {
        continue;
      }
      const interval =
        5 + keyedIndex(5, state.seed, "stale-restriction-interval", themeId, part.id);
      const phase = keyedIndex(
        interval,
        state.seed,
        "stale-restriction-phase",
        themeId,
        part.id,
      );
      if (
        dueOnly &&
        (day - restriction.restrictedSince) % interval !== phase
      ) {
        continue;
      }
      candidates.push({
        content,
        part,
        limit: restriction.limit,
        restrictedDays: day - restriction.restrictedSince,
        share: position.share,
        rank: position.rank + 1,
      });
    }
  }
  return candidates.sort(
    (left, right) =>
      right.restrictedDays - left.restrictedDays ||
      left.share - right.share ||
      `${left.content.id}:${left.part.id}`.localeCompare(
        `${right.content.id}:${right.part.id}`,
      ),
  );
}

function makeStaleRestrictionPosts(
  state: GameState,
  day: number,
  dueOnly: boolean,
  maximum = 2,
): CommunityEvent[] {
  return staleRestrictionCandidates(state, day, dueOnly)
    .slice(0, maximum)
    .map((candidate, index) => {
      const start = keyedIndex(
        STALE_RESTRICTION_COPY.length,
        state.seed,
        "stale-restriction-copy",
        day,
        candidate.content.id,
        candidate.part.id,
      );
      const body = fillCommunityCopy(
        STALE_RESTRICTION_COPY[
          (start + index) % STALE_RESTRICTION_COPY.length
        ],
        {
          theme: candidate.content.shortName,
          part: candidate.part.name,
          limit: String(candidate.limit),
          restrictedDays: String(candidate.restrictedDays),
          share: `${(candidate.share * 100).toFixed(1)}%`,
          rank: String(candidate.rank),
        },
      );
      return {
        id: `daily-stale-restriction-${day}-${candidate.content.id}-${candidate.part.id}`,
        day,
        category: "restriction" as const,
        type: "restriction-demand" as const,
        themeId: candidate.content.id,
        partId: candidate.part.id,
        value: candidate.limit,
        previousValue: candidate.limit,
        body,
      };
    });
}

function releaseBatchNearDay(state: GameState, day: number) {
  for (let index = state.releaseHistory.length - 1; index >= 0; index -= 1) {
    const batch = state.releaseHistory[index];
    if (isInitialGenericReleaseBatch(batch)) continue;
    const age = day - batch.day;
    if (age >= 1 && age <= 4) return { batch, age };
    if (age > 4) break;
  }
  return undefined;
}

function restrictionAge(
  state: GameState,
  releaseDay: number,
  product: ReleasedProduct,
): number | null {
  if (product.kind !== "support") return null;
  let latestDay: number | null = null;
  for (const event of state.community) {
    if (
      event.themeId !== product.themeId ||
      event.day >= releaseDay ||
      releaseDay - event.day > 30 ||
      (event.type !== "restriction-applied" &&
        event.type !== "cosmetic-restriction") ||
      (typeof event.value === "number" && event.value >= 3)
    ) {
      continue;
    }
    if (latestDay === null || event.day > latestDay) latestDay = event.day;
  }
  return latestDay === null ? null : releaseDay - latestDay;
}

type RestrictionAssessment =
  | "appropriate"
  | "overkill"
  | "cosmetic"
  | "light"
  | "no-change"
  | "unban";

type RestrictionDirection = "tighten" | "loosen" | "unchanged";

type RestrictionAnchor = {
  event: CommunityEvent;
  content: ThemeContent;
  part: PartContent;
  oldLimit: RestrictionLimit;
  newLimit: RestrictionLimit;
  direction: RestrictionDirection;
  restrictedDays: number;
  availabilityDelta: number;
  impact: number;
  assessment: RestrictionAssessment;
  noChangeConcern: boolean;
  decisionShare: number;
  decisionWinRate: number;
  decisionRank: number;
  decisionThemeCount: number;
  decisionLeaderShare: number;
};

function restrictedDurationBefore(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
  partId: string,
): number {
  let restrictedSince: number | null = null;
  for (const event of state.community) {
    if (
      event.day >= decisionDay ||
      event.themeId !== themeId ||
      event.partId !== partId ||
      !isRestrictionDecisionEvent(event) ||
      !Number.isInteger(event.previousValue) ||
      !Number.isInteger(event.value) ||
      event.previousValue! <= event.value!
    ) {
      continue;
    }
    if (restrictedSince === null || event.day > restrictedSince) {
      restrictedSince = event.day;
    }
  }
  return restrictedSince === null ? 0 : Math.max(0, decisionDay - restrictedSince);
}

type RecentRestrictionDecision = {
  decisionDay: number;
  age: 1 | 2 | 3;
  anchors: RestrictionAnchor[];
  placementReport: RecentPlacementReport;
};

type GenericRestrictionAffectedTheme = {
  content: ThemeContent;
  beforeAdoption: number;
  afterAdoption: number;
  powerLoss: number;
  replacementCardIds: readonly GenericCardId[];
};

type GenericRestrictionAnchor = {
  event: CommunityEvent;
  card: GenericCardCatalogEntry;
  oldLimit: RestrictionLimit;
  newLimit: RestrictionLimit;
  direction: RestrictionDirection;
  fieldReach: number;
  affectedThemes: GenericRestrictionAffectedTheme[];
  replacementName: string;
  releaseAge: number;
};

type RecentGenericRestrictionDecision = {
  decisionDay: number;
  age: 1 | 2 | 3;
  anchors: GenericRestrictionAnchor[];
};

function historicalGenericLimitsBefore(
  state: GameState,
  decisionDay: number,
): Partial<Record<GenericCardId, RestrictionLimit>> {
  const limits: Partial<Record<GenericCardId, RestrictionLimit>> = {};
  for (const batch of state.releaseHistory) {
    const available = isInitialGenericReleaseBatch(batch)
      ? batch.day <= decisionDay
      : batch.day < decisionDay;
    if (!available) continue;
    for (const product of batch.products) {
      if (product.kind === "generic") limits[product.genericCardId] = 3;
    }
  }
  const decisions = state.community
    .filter(
      (event) =>
        event.day < decisionDay &&
        Boolean(event.genericCardId) &&
        isRestrictionDecisionEvent(event) &&
        Number.isInteger(event.value) &&
        event.value! >= 0 &&
        event.value! <= 3,
    )
    .sort((left, right) => left.day - right.day || left.id.localeCompare(right.id));
  for (const event of decisions) {
    limits[event.genericCardId!] = event.value as RestrictionLimit;
  }
  return limits;
}

function genericReleaseDay(
  state: GameState,
  cardId: GenericCardId,
  decisionDay: number,
): number {
  return state.releaseHistory.find(
    (batch) =>
      batch.day <= decisionDay &&
      batch.products.some(
        (product) => product.kind === "generic" && product.genericCardId === cardId,
      ),
  )?.day ?? 1;
}

function recentGenericRestrictionDecision(
  state: GameState,
  day: number,
): RecentGenericRestrictionDecision | undefined {
  for (const age of [1, 2, 3] as const) {
    const decisionDay = day - age;
    const raw = state.community
      .filter(
        (event) =>
          event.day === decisionDay &&
          isRestrictionDecisionEvent(event) &&
          Boolean(event.genericCardId) &&
          Number.isInteger(event.previousValue) &&
          Number.isInteger(event.value) &&
          event.previousValue! >= 0 &&
          event.previousValue! <= 3 &&
          event.value! >= 0 &&
          event.value! <= 3,
      )
      .sort((left, right) =>
        `${left.genericCardId}:${left.id}`.localeCompare(`${right.genericCardId}:${right.id}`)
      );
    if (raw.length === 0) continue;

    const snapshot = historyAtOrBefore(state, decisionDay);
    const activeThemeIds = Object.keys(snapshot?.shares ?? {})
      .filter((themeId): themeId is ThemeId => Boolean(THEME_BY_ID[themeId]));
    const historicalThemeIds = activeThemeIds.length > 0
      ? activeThemeIds
      : state.activeThemeIds.filter((themeId) => Boolean(THEME_BY_ID[themeId]));
    const themes = Object.fromEntries(
      historicalThemeIds.map((themeId) => [
        themeId,
        { share: snapshot?.shares[themeId] ?? state.themes[themeId]?.share ?? 0 },
      ]),
    );
    const themeKeywordsById = Object.fromEntries(
      historicalThemeIds.map((themeId) => [themeId, THEME_BY_ID[themeId].playKeywords]),
    );
    const priorLimits = historicalGenericLimitsBefore(state, decisionDay);
    const anchors = raw.flatMap((event): GenericRestrictionAnchor[] => {
      const card = event.genericCardId ? getGenericCard(event.genericCardId) : undefined;
      if (!card) return [];
      const oldLimit = event.previousValue as RestrictionLimit;
      const newLimit = event.value as RestrictionLimit;
      const beforeLimits = { ...priorLimits, [card.id]: oldLimit };
      const metaState = {
        day: decisionDay,
        activeThemeIds: historicalThemeIds,
        themes,
        releaseHistory: state.releaseHistory,
        genericLimits: beforeLimits,
      };
      const beforeMeta = buildGenericMetaModel(
        metaState,
        themeKeywordsById,
        decisionDay,
      );
      const afterMeta = buildGenericMetaModel(
        metaState,
        themeKeywordsById,
        decisionDay,
        { [card.id]: newLimit },
      );
      const impacts = selectGenericLimitThemeImpacts(
        metaState,
        themeKeywordsById,
        card.id,
        newLimit,
        decisionDay,
      );
      const affectedThemes = impacts
        .flatMap((impact): GenericRestrictionAffectedTheme[] => {
          const content = THEME_BY_ID[impact.themeId];
          const adoptionDelta = Math.abs(impact.beforeAdoption - impact.afterAdoption);
          if (
            !content ||
            (Math.max(impact.beforeAdoption, impact.afterAdoption) < 0.08 &&
              adoptionDelta < 0.02 &&
              Math.abs(impact.powerLoss) < 0.05)
          ) {
            return [];
          }
          return [{
            content,
            beforeAdoption: impact.beforeAdoption,
            afterAdoption: impact.afterAdoption,
            powerLoss: impact.powerLoss,
            replacementCardIds: impact.replacementCardIds,
          }];
        })
        .sort((left, right) => {
          const adoption = (target: GenericRestrictionAffectedTheme) =>
            Math.max(target.beforeAdoption, target.afterAdoption) *
            (snapshot?.shares[target.content.id] ?? 0);
          return adoption(right) - adoption(left) ||
            left.content.id.localeCompare(right.content.id);
        });
      if (affectedThemes.length === 0) {
        const fallback = THEME_BY_ID[event.themeId] ?? THEME_BY_ID[state.currentTopThemeId];
        if (fallback) {
          affectedThemes.push({
            content: fallback,
            beforeAdoption: 0,
            afterAdoption: 0,
            powerLoss: 0,
            replacementCardIds: [],
          });
        }
      }
      const replacementId = affectedThemes.flatMap(
        (candidate) => candidate.replacementCardIds,
      ).find((candidateId) => candidateId !== card.id) ?? beforeMeta.cards
        .filter((candidate) => candidate.cardId !== card.id)
        .sort((left, right) => right.marketReach - left.marketReach)[0]?.cardId;
      const fieldReach = Math.max(
        beforeMeta.cardMetaById[card.id]?.marketReach ?? 0,
        afterMeta.cardMetaById[card.id]?.marketReach ?? 0,
      );
      return [{
        event,
        card,
        oldLimit,
        newLimit,
        direction: newLimit < oldLimit
          ? "tighten"
          : newLimit > oldLimit
            ? "loosen"
            : "unchanged",
        fieldReach,
        affectedThemes,
        replacementName: replacementId
          ? getGenericCard(replacementId)?.name ?? "다음 범용 카드"
          : "다음 범용 카드",
        releaseAge: Math.max(0, decisionDay - genericReleaseDay(state, card.id, decisionDay)),
      }];
    });
    if (anchors.length > 0) return { decisionDay, age, anchors };
  }
  return undefined;
}

function partAvailability(
  part: PartContent,
  limit: RestrictionLimit,
): number {
  const preferred = Math.min(3, Math.max(1, part.preferredCopies));
  const allowed = Math.min(preferred, limit);
  if (allowed <= 0) return 0;
  if (allowed >= preferred) return 1;
  return (allowed / preferred) ** ROLE_EXPONENT[part.role];
}

function recentRestrictionDecision(
  state: GameState,
  day: number,
): RecentRestrictionDecision | undefined {
  for (const age of [1, 2, 3] as const) {
    const decisionDay = day - age;
    const raw = state.community
      .filter(
        (event) =>
          event.day === decisionDay &&
          isRestrictionDecisionEvent(event) &&
          Boolean(event.partId),
      )
      .sort((left, right) =>
        `${left.themeId}:${left.partId}:${left.id}`.localeCompare(
          `${right.themeId}:${right.partId}:${right.id}`,
        ),
      );
    if (raw.length === 0) continue;

    const provisional = raw.flatMap((event) => {
      const content = THEME_BY_ID[event.themeId];
      const part = content?.parts.find((candidate) => candidate.id === event.partId);
      const oldLimit = event.previousValue;
      const newLimit = event.value;
      if (
        !content ||
        !part ||
        !Number.isInteger(oldLimit) ||
        !Number.isInteger(newLimit) ||
        oldLimit! < 0 ||
        oldLimit! > 3 ||
        newLimit! < 0 ||
        newLimit! > 3
      ) {
        return [];
      }
      const availabilityDelta = Math.max(
        0,
        partAvailability(part, oldLimit as RestrictionLimit) -
          partAvailability(part, newLimit as RestrictionLimit),
      );
      const restoredAvailability = Math.max(
        0,
        partAvailability(part, newLimit as RestrictionLimit) -
          partAvailability(part, oldLimit as RestrictionLimit),
      );
      const direction: RestrictionDirection =
        newLimit! > oldLimit!
          ? "loosen"
          : newLimit! < oldLimit!
            ? "tighten"
            : "unchanged";
      return [
        {
          event,
          content,
          part,
          oldLimit: oldLimit as RestrictionLimit,
          newLimit: newLimit as RestrictionLimit,
          direction,
          restrictedDays:
            direction === "loosen"
              ? restrictedDurationBefore(
                  state,
                  decisionDay,
                  content.id,
                  part.id,
                )
              : 0,
          availabilityDelta,
          impact:
            part.powerWeight *
            part.inclusion *
            Math.max(availabilityDelta, restoredAvailability),
        },
      ];
    });
    if (provisional.length === 0) continue;

    const totalImpactByTheme = new Map<ThemeId, number>();
    const cutsByTheme = new Map<ThemeId, number>();
    for (const anchor of provisional) {
      totalImpactByTheme.set(
        anchor.content.id,
        (totalImpactByTheme.get(anchor.content.id) ?? 0) + anchor.impact,
      );
      if (anchor.availabilityDelta > 1e-6) {
        cutsByTheme.set(
          anchor.content.id,
          (cutsByTheme.get(anchor.content.id) ?? 0) + 1,
        );
      }
    }

    const placementReport = getRecentPlacementReport(
      state.history,
      state.seed,
      decisionDay,
    );
    const anchors: RestrictionAnchor[] = provisional.map((anchor) => {
      const totalImpact = totalImpactByTheme.get(anchor.content.id) ?? 0;
      const cutCount = cutsByTheme.get(anchor.content.id) ?? 0;
      const snapshot = historyAtOrBefore(state, decisionDay);
      const decisionShare =
        snapshot?.shares[anchor.content.id] ?? anchor.content.startingShare;
      const decisionPosition = shareRank(
        snapshot?.shares ?? { [anchor.content.id]: decisionShare },
        anchor.content.id,
      );
      const decisionWinRate =
        snapshot?.winRates?.[anchor.content.id] ?? 0.5;
      const decisionShares = snapshot
        ? Object.values(snapshot.shares).filter(
          (share) => Number.isFinite(share) && share >= 0,
        )
        : THEMES.map((theme) => theme.startingShare).filter((share) => share > 0);
      const rankedDecisionShares = [...decisionShares].sort(
        (left, right) => right - left,
      );
      const decisionTopShare = rankedDecisionShares[0] ?? decisionShare;
      const decisionTopThreeShare = rankedDecisionShares
        .slice(0, 3)
        .reduce((sum, share) => sum + share, 0);
      const decisionHhi = decisionShares.reduce(
        (sum, share) => sum + share ** 2,
        0,
      );
      const noChangeConcern =
        anchor.event.type === "restriction-no-change" &&
        (decisionShare >= 0.24 ||
          decisionTopShare >= 0.3 ||
          decisionTopThreeShare >= 0.7 ||
          decisionHhi >= 0.24);
      const assessment: RestrictionAssessment =
        anchor.direction === "loosen"
          ? "unban"
          : anchor.event.type === "restriction-no-change"
          ? "no-change"
          : anchor.availabilityDelta <= 1e-6
          ? "cosmetic"
          : (cutCount >= 2 && totalImpact >= 15) || anchor.impact >= 11
            ? "overkill"
            : anchor.impact < 3.5
              ? "light"
              : "appropriate";
      return {
        ...anchor,
        assessment,
        noChangeConcern,
        decisionShare,
        decisionWinRate,
        decisionRank: decisionPosition.rank,
        decisionThemeCount: decisionPosition.count,
        decisionLeaderShare: decisionTopShare,
      };
    });
    return {
      decisionDay,
      age,
      anchors,
      placementReport,
    };
  }
  return undefined;
}

function primaryRestrictionPool(
  anchor: RestrictionAnchor,
): readonly string[] {
  if (anchor.assessment === "unban") return UNBAN_MEASURED_COPY;
  if (anchor.assessment === "no-change") return NO_CHANGE_RESTRICTION_COPY;
  if (anchor.assessment === "overkill") return OVERKILL_RESTRICTION_COPY;
  if (anchor.assessment === "cosmetic") return COSMETIC_RESTRICTION_COPY;
  if (anchor.assessment === "light") return LIGHT_RESTRICTION_COPY;
  return APPROPRIATE_RESTRICTION_COPY;
}

function singlePrimaryRestrictionPool(
  anchor: RestrictionAnchor,
): readonly string[] {
  if (anchor.assessment === "overkill") {
    return SINGLE_OVERKILL_RESTRICTION_COPY;
  }
  if (anchor.assessment === "cosmetic") {
    return SINGLE_COSMETIC_RESTRICTION_COPY;
  }
  if (anchor.assessment === "light") {
    return SINGLE_LIGHT_RESTRICTION_COPY;
  }
  return SINGLE_APPROPRIATE_RESTRICTION_COPY;
}

function restrictionRoleGroup(part: PartContent): RestrictionRoleGroup {
  if (part.role === "starter1" || part.role === "starter2") return "starter";
  return part.role;
}

function restrictionReactionPhase(
  age: RecentRestrictionDecision["age"],
): RestrictionReactionPhase {
  return age === 1 ? "immediate" : age === 2 ? "rebuild" : "results";
}

function isSingleCardTightening(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): boolean {
  if (anchor.direction !== "tighten") return false;
  return context.anchors.filter((candidate) =>
    candidate.direction !== "unchanged"
  ).length === 1;
}

type TighteningScope =
  | "single"
  | "same-role-multi"
  | "multi-axis"
  | "multi-theme";

function tighteningScope(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): TighteningScope {
  const tightened = context.anchors.filter((candidate) =>
    candidate.direction === "tighten"
  );
  if (tightened.length <= 1) return "single";
  if (new Set(tightened.map((candidate) => candidate.content.id)).size >= 2) {
    return "multi-theme";
  }
  const sameThemeRoles = new Set(
    tightened
      .filter((candidate) => candidate.content.id === anchor.content.id)
      .map((candidate) => restrictionRoleGroup(candidate.part)),
  );
  return sameThemeRoles.size >= 2 ? "multi-axis" : "same-role-multi";
}

function restrictionBreadthPool(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): readonly string[] {
  switch (tighteningScope(context, anchor)) {
    case "single":
      return anchor.part.tags.includes("외부 사용")
        ? COLLATERAL_RESTRICTION_COPY
        : primaryRestrictionPool(anchor);
    case "same-role-multi":
      return SAME_ROLE_MULTI_RESTRICTION_COPY;
    case "multi-axis":
      return MULTI_AXIS_RESTRICTION_COPY;
    case "multi-theme":
      return MULTI_THEME_RESTRICTION_COPY;
  }
}

function restrictionCountPool(
  profile: RestrictionPolicyProfile,
): readonly string[] {
  if (profile.meaningfulCutCount === 0) {
    if (profile.directionMix.tighten > 0 && profile.directionMix.loosen > 0) {
      return COSMETIC_PLUS_RELIEF_RESTRICTION_REVIEW_COPY;
    }
    return profile.directionMix.tighten > 0
      ? MULTI_COSMETIC_RESTRICTION_REVIEW_COPY
      : UNBAN_ONLY_RESTRICTION_REVIEW_COPY;
  }
  if (profile.meaningfulCutCount <= 2) {
    return TWO_CARD_INCOMPLETE_RESTRICTION_COPY;
  }
  if (profile.meaningfulCutCount <= 4) {
    return THREE_FOUR_CARD_RESTRICTION_COPY;
  }
  return FIVE_PLUS_CARD_RESTRICTION_COPY;
}

function restrictionCoveragePool(
  profile: RestrictionPolicyProfile,
): readonly string[] {
  if (profile.meaningfulCutCount === 0) {
    if (profile.directionMix.tighten > 0 && profile.directionMix.loosen > 0) {
      return COSMETIC_PLUS_RELIEF_RESTRICTION_REVIEW_COPY;
    }
    return profile.directionMix.tighten > 0
      ? MULTI_COSMETIC_RESTRICTION_REVIEW_COPY
      : UNBAN_ONLY_RESTRICTION_REVIEW_COPY;
  }
  // The first authored restriction retains the handover lesson. Later lists are judged from
  // actual share/win-rate pressure: leaving a threat alive and pre-emptively
  // cutting a non-threat are separate failures, regardless of tier row.
  if (profile.decisionDay === FIRST_BAN_DAY) {
    if (profile.upperMeaningfulCuts === 0) {
      return LOWER_ONLY_RESTRICTION_REVIEW_COPY;
    }
    if (profile.tier2MeaningfulCuts === 0) {
      return profile.lowerMeaningfulCuts > 0
        ? MISSING_TIER2_GAP_RESTRICTION_COPY
        : UPPER_ONLY_RESTRICTION_REVIEW_COPY;
    }
    if (profile.coverageComplete) {
      return PROLOGUE_BALANCED_RESTRICTION_REVIEW_COPY;
    }
  } else {
    const missedThreat = profile.unaddressedThreatThemeIds.length > 0;
    const preemptiveCut = profile.preemptiveCutThemeIds.length > 0;
    if (missedThreat && preemptiveCut) {
      return MISSING_TIER2_GAP_RESTRICTION_COPY;
    }
    if (missedThreat) return UPPER_ONLY_RESTRICTION_REVIEW_COPY;
    if (preemptiveCut) return LOWER_ONLY_RESTRICTION_REVIEW_COPY;
  }
  if (
    profile.coverageComplete &&
    profile.staleEligible > 0 &&
    profile.staleFullyReleased > 0
  ) {
    return BALANCED_RESTRICTION_REVIEW_COPY;
  }
  if (
    profile.coverageComplete &&
    profile.staleEligible > 0 &&
    profile.staleLoosened > 0
  ) {
    return PARTIAL_STALE_RELIEF_RESTRICTION_COPY;
  }
  if (profile.coverageComplete && profile.staleEligible > 0) {
    return MISSING_STALE_RELIEF_RESTRICTION_COPY;
  }
  if (profile.coverageComplete && profile.staleEligible === 0) {
    return BOTH_TIERS_NO_STALE_REVIEW_COPY;
  }
  return INCOMPLETE_TIER_COVERAGE_RESTRICTION_COPY;
}

function restrictionCompositionPool(
  profile: RestrictionPolicyProfile,
): readonly string[] {
  const { tighten, loosen } = profile.directionMix;
  if (
    profile.meaningfulCutCount === 0 &&
    tighten > 0 &&
    loosen > 0
  ) {
    return COSMETIC_PLUS_RELIEF_RESTRICTION_REVIEW_COPY;
  }
  if (tighten === 0 && loosen > 0) return UNBAN_ONLY_RESTRICTION_REVIEW_COPY;
  if (tighten > 0 && loosen === 0) {
    return profile.coverageComplete && profile.staleEligible > 0
      ? BOTH_TIERS_CUTS_ONLY_REVIEW_COPY
      : restrictionCoveragePool(profile);
  }
  if (tighten > 0 && loosen > 0) {
    return profile.staleFullyReleased > 0
      ? restrictionCoveragePool(profile)
      : profile.staleLoosened > 0
        ? PARTIAL_STALE_RELIEF_RESTRICTION_COPY
        : MIXED_FRESH_UNBAN_RESTRICTION_COPY;
  }
  return NO_CHANGE_RESTRICTION_COPY;
}

function restrictionPolicyDetailPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): readonly string[] {
  if (anchor.direction === "loosen") {
    return unbanPrimaryPool(unbanReactionAssessment(state, context, anchor).tone);
  }
  if (anchor.part.tags.includes("외부 사용")) {
    return COLLATERAL_RESTRICTION_COPY;
  }
  const recentProduct = restrictionRecentProduct(
    state,
    context.decisionDay,
    anchor.content.id,
  );
  if (recentProduct && recentProduct.age <= 30) {
    return recentProduct.kind === "support"
      ? RECENT_SUPPORT_RESTRICTION_COPY
      : RECENT_DEBUT_RESTRICTION_COPY;
  }
  return restrictionBreadthPool(context, anchor);
}

function restrictionDecisionSignalPools(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  analysis: RestrictionDecisionSignals,
): readonly (readonly string[])[] {
  if (anchor.direction === "loosen" || anchor.assessment === "no-change") {
    return [];
  }
  const target = analysis.targets.find(
    (candidate) => candidate.partId === anchor.part.id,
  );
  const anchorKinds = new Set(
    analysis.signals
      .filter((signal) => signal.partId === anchor.part.id)
      .map((signal) => signal.kind),
  );
  const pools: Array<readonly string[]> = [];
  const add = (pool: readonly string[]) => {
    if (!pools.includes(pool)) pools.push(pool);
  };

  // Comparative targeting is the first question players ask: not merely
  // whether this card is strong, but why it was chosen while a stronger deck
  // was left untouched. Keep it ahead of generic one/two-card breadth copy.
  if (
    analysis.flags.upperIgnored &&
    target?.direction === "tighten" &&
    target.tierBand !== "upper"
  ) {
    add(UPPER_IGNORED_TARGET_COMPARISON_COPY);
  }
  if (analysis.flags.lowerOnly && target?.tierBand === "lower") {
    add(LOWER_ONLY_RESTRICTION_REVIEW_COPY);
  }
  if (
    target?.tierBand === "lower" &&
    target.sharedExternalUse &&
    analysis.flags.upperIgnored
  ) {
    add(LOWER_SHARED_TARGET_DEBATE_COPY);
  }
  if (anchorKinds.has("low-usage-cut")) {
    add(LOW_USAGE_TARGET_RESTRICTION_COPY);
  }
  if (anchorKinds.has("recent-product-cut")) {
    const recentProduct = restrictionRecentProduct(
      state,
      context.decisionDay,
      anchor.content.id,
    );
    add(
      recentProduct?.kind === "support"
        ? RECENT_SUPPORT_RESTRICTION_COPY
        : RECENT_DEBUT_RESTRICTION_COPY,
    );
  }
  if (anchorKinds.has("shared-external-use")) {
    add(
      context.anchors.length === 1
        ? SINGLE_SHARED_RESTRICTION_COPY
        : COLLATERAL_RESTRICTION_COPY,
    );
  }
  if (anchor.assessment === "overkill") {
    add(
      context.anchors.length === 1
        ? SINGLE_OVERKILL_RESTRICTION_COPY
        : OVERKILL_RESTRICTION_COPY,
    );
  }
  if (anchorKinds.has("replacement-risk")) {
    add(REPLACEMENT_RISK_RESTRICTION_COPY);
  }
  if (anchorKinds.has("counter-research-pending")) {
    add(COUNTER_RESEARCH_PENDING_RESTRICTION_COPY);
  }
  if (anchorKinds.has("accessibility-pressure")) {
    add(ACCESSIBILITY_RESTRICTION_DEBATE_COPY);
  }
  if (anchorKinds.has("collector-backlash")) {
    add(COLLECTOR_BACKLASH_RESTRICTION_COPY);
  }
  if (analysis.flags.overbroad) {
    add(OVERBROAD_RESTRICTION_DEBATE_COPY);
  }
  if (analysis.flags.staleIgnored) {
    add(MISSING_STALE_RELIEF_RESTRICTION_COPY);
  }
  if (analysis.flags.balanced) {
    add(BALANCED_RESTRICTION_REVIEW_COPY);
  }
  if (anchorKinds.has("competitive-demand-addressed")) {
    add(primaryRestrictionPool(anchor));
  }
  return pools;
}

function hasPriorityTargetingSignal(
  anchor: RestrictionAnchor,
  analysis: RestrictionDecisionSignals,
): boolean {
  const target = analysis.targets.find(
    (candidate) => candidate.partId === anchor.part.id,
  );
  if (
    analysis.flags.upperIgnored &&
    target?.direction === "tighten" &&
    target.tierBand !== "upper"
  ) {
    return true;
  }
  return analysis.signals.some(
    (signal) =>
      signal.partId === anchor.part.id &&
      (
        signal.kind === "lower-only" ||
        signal.kind === "low-usage-cut" ||
        signal.kind === "recent-product-cut" ||
        signal.kind === "shared-external-use"
      ),
  );
}

function isBalancedFourCutReview(
  context: RecentRestrictionDecision,
  profile: RestrictionPolicyProfile,
): boolean {
  return (
    context.anchors.length === 4 &&
    context.anchors.every((anchor) => anchor.direction === "tighten") &&
    profile.quality === "balanced" &&
    profile.changeCount === 4 &&
    profile.meaningfulCutCount === 4 &&
    profile.directionMix.tighten === 4 &&
    profile.directionMix.loosen === 0
  );
}

/**
 * A broad four-card review still needs card-level reactions. Only use the
 * role-specific copy when this review changed one card in the anchor's theme;
 * several changes inside one theme need the aggregate scope copy instead.
 */
function balancedFourCutRolePool(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): readonly string[] {
  const sameThemeCuts = context.anchors.filter(
    (candidate) =>
      candidate.direction === "tighten" &&
      candidate.content.id === anchor.content.id,
  ).length;
  if (sameThemeCuts !== 1) return restrictionBreadthPool(context, anchor);
  return SINGLE_ROLE_RESTRICTION_COPY[restrictionRoleGroup(anchor.part)][
    restrictionReactionPhase(context.age)
  ];
}

/**
 * The guided four-cut list is deliberately broad and shallow. Route one full
 * pass through coverage, scope, the actual target role, and factual detail so
 * every changed card is discussed without falling into single-card memes or a
 * generic starter/finisher claim that may not match that card.
 */
function balancedFourCutCopyPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  profile: RestrictionPolicyProfile,
  index: number,
): readonly string[] {
  const coverage = restrictionCoveragePool(profile);
  const scope = restrictionBreadthPool(context, anchor);
  const role = balancedFourCutRolePool(context, anchor);
  const detail = restrictionPolicyDetailPool(state, context, anchor);
  const pass = Math.floor(index / context.anchors.length);
  const routing: readonly (readonly string[])[] = context.age === 1
    ? [coverage, scope, role, detail]
    : context.age === 2
      ? [coverage, detail, role, scope]
      : [role, scope, coverage];
  const selected = routing[pass % routing.length];
  const performance = restrictionPerformanceAssessment(state, context);
  const performancePool = restrictionPickWinPool(
    state,
    context,
    anchor,
    performance,
  );
  // Keep complete role and product-timing passes. A performance-blind list
  // replaces coverage/scope praise; role and factual detail passes stay intact.
  if (
    performance.suppressGenericPraise &&
    (selected === coverage || selected === scope)
  ) {
    if (selected === coverage && index % context.anchors.length === 0) {
      return PERFORMANCE_BLIND_TIER_COVERAGE_COPY;
    }
    if (selected === scope && index % context.anchors.length === 0) {
      return scope;
    }
    return performancePool ?? RESTRICTION_CAUTION_COPY;
  }
  if (performancePool && selected === scope) {
    return index % context.anchors.length === 0 ? scope : performancePool;
  }
  return selected;
}

function singleRestrictionCopyPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  analysis: RestrictionDecisionSignals,
  index: number,
): readonly string[] {
  const tone = singlePrimaryRestrictionPool(anchor);
  const shortage = context.decisionDay === FIRST_BAN_DAY
    ? SINGLE_RESTRICTION_SCOPE_COPY
    : restrictionCoveragePool(analysis.profile);
  const role =
    context.age === 1 &&
      anchor.part.role === "finisher" &&
      anchor.part.preferredCopies <= 1 &&
      anchor.newLimit === 0 &&
      anchor.part.tags.includes("다중 무효")
      ? SINGLE_ONE_COPY_NEGATION_FINISHER_BAN_COPY
      : SINGLE_ROLE_RESTRICTION_COPY[
          restrictionRoleGroup(anchor.part)
        ][restrictionReactionPhase(context.age)];
  const recentProductAge = restrictionRecentProductAge(
    state,
    context.decisionDay,
    anchor.content.id,
  );
  const product = recentProductAge <= 30
    ? SINGLE_RECENT_PRODUCT_RESTRICTION_COPY
    : SINGLE_RESTRICTION_CAUTION_COPY;
  const market = anchor.newLimit === 0 || anchor.impact >= 6
    ? SINGLE_RESTRICTION_MARKET_COPY
    : shortage;
  const detail = anchor.part.tags.includes("외부 사용")
    ? SINGLE_SHARED_RESTRICTION_COPY
    : market;
  const signalPools = restrictionDecisionSignalPools(
    state,
    context,
    anchor,
    analysis,
  );
  const signal = (offset: number, fallback: readonly string[]) =>
    signalPools.length > 0
      ? signalPools[offset % signalPools.length]
      : fallback;

  if (anchor.assessment === "cosmetic") {
    const cosmeticDayOne: readonly (readonly string[])[] = [
      tone,
      tone,
      shortage,
      tone,
      signal(0, tone),
      SINGLE_COSMETIC_CAUTION_COPY,
      tone,
      tone,
    ];
    const cosmeticDayTwo: readonly (readonly string[])[] = [
      tone,
      signal(0, shortage),
      tone,
      SINGLE_COSMETIC_CAUTION_COPY,
      signal(1, tone),
      shortage,
      tone,
    ];
    const cosmeticDayThree: readonly (readonly string[])[] = [
      tone,
      tone,
      shortage,
      SINGLE_COSMETIC_CAUTION_COPY,
      tone,
      shortage,
    ];
    const cosmeticRouting = context.age === 1
      ? cosmeticDayOne
      : context.age === 2
        ? cosmeticDayTwo
        : cosmeticDayThree;
    return cosmeticRouting[index % cosmeticRouting.length];
  }

  const priorityTargeting = context.anchors.some((candidate) =>
    hasPriorityTargetingSignal(candidate, analysis)
  );
  if (!priorityTargeting) {
    const secondarySignal = signal(0, detail);
    const ordinaryDayOne: readonly (readonly string[])[] = [
      shortage,
      shortage,
      role,
      shortage,
      role,
      shortage,
      secondarySignal,
      shortage,
    ];
    const ordinaryDayTwo: readonly (readonly string[])[] = [
      shortage,
      shortage,
      role,
      tone,
      product,
      shortage,
      role,
    ];
    const ordinaryDayThree: readonly (readonly string[])[] = [
      shortage,
      role,
      shortage,
      shortage,
      SINGLE_RESTRICTION_MEME_COPY,
      role,
    ];
    const ordinaryRouting = context.age === 1
      ? ordinaryDayOne
      : context.age === 2
        ? ordinaryDayTwo
        : ordinaryDayThree;
    return ordinaryRouting[index % ordinaryRouting.length];
  }

  const dayOne: readonly (readonly string[])[] = [
    signal(0, tone),
    shortage,
    signal(0, tone),
    role,
    signal(1, role),
    shortage,
    role,
    signal(2, detail),
  ];
  const dayTwo: readonly (readonly string[])[] = [
    shortage,
    signal(0, tone),
    role,
    signal(1, tone),
    product,
    shortage,
    signal(2, role),
  ];
  const dayThree: readonly (readonly string[])[] = [
    shortage,
    signal(0, role),
    shortage,
    signal(1, tone),
    SINGLE_RESTRICTION_MEME_COPY,
    role,
  ];
  const routing = context.age === 1 ? dayOne : context.age === 2 ? dayTwo : dayThree;
  return routing[index % routing.length];
}

function narrowRestrictionCopyPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  analysis: RestrictionDecisionSignals,
  index: number,
): readonly string[] {
  const shortage = context.decisionDay === FIRST_BAN_DAY
    ? PROLOGUE_TWO_CARD_INCOMPLETE_RESTRICTION_COPY
    : restrictionCoveragePool(analysis.profile);
  const primary = anchor.assessment === "unban"
    ? unbanPrimaryPool(unbanReactionAssessment(state, context, anchor).tone)
    : primaryRestrictionPool(anchor);
  const breadth = anchor.direction === "loosen"
    ? primary
    : restrictionBreadthPool(context, anchor);
  const detail = restrictionPolicyDetailPool(state, context, anchor);
  const signalPools = restrictionDecisionSignalPools(
    state,
    context,
    anchor,
    analysis,
  );
  const signal = (offset: number, fallback: readonly string[]) =>
    signalPools.length > 0
      ? signalPools[offset % signalPools.length]
      : fallback;
  const priorityTargeting = context.anchors.some((candidate) =>
    hasPriorityTargetingSignal(candidate, analysis)
  );
  const routing = !priorityTargeting
    ? context.age === 1
      ? [shortage, shortage, primary, shortage, breadth, shortage, detail, shortage]
      : context.age === 2
        ? [shortage, primary, shortage, detail, shortage, breadth, shortage]
        : [shortage, breadth, shortage, primary, shortage, detail]
    : context.age === 1
    ? [
        signal(0, primary),
        shortage,
        signal(0, primary),
        breadth,
        signal(1, detail),
        shortage,
        detail,
        signal(2, shortage),
      ]
    : context.age === 2
      ? [shortage, signal(0, primary), shortage, detail, signal(1, breadth), breadth, shortage]
      : [shortage, signal(0, breadth), shortage, primary, signal(1, detail), detail];
  return routing[index % routing.length];
}

type UnbanTone =
  | "overdue"
  | "dangerous"
  | "surge"
  | "no-impact"
  | "measured";

type UnbanReactionAssessment = {
  tone: UnbanTone;
  decisionShare: number;
  currentShare: number;
  delta: number;
  rank: number;
};

function shareRank(
  shares: Readonly<Record<ThemeId, number>>,
  themeId: ThemeId,
): { share: number; rank: number; count: number } {
  const ranked = Object.entries(shares)
    .filter(([, share]) => Number.isFinite(share) && share > 0)
    .sort((left, right) => right[1] - left[1]);
  const rank = ranked.findIndex(([candidate]) => candidate === themeId);
  return {
    share: shares[themeId] ?? 0,
    rank: rank < 0 ? ranked.length : rank,
    count: Math.max(1, ranked.length),
  };
}

type PickWinProfile =
  | "popular-underperformer"
  | "popular-powerhouse"
  | "low-pick-high-win"
  | "weak-fringe"
  | "ordinary";

type IgnoredSleeper = {
  content: ThemeContent;
  share: number;
  winRate: number;
  placement: PlacementEvidence | null;
};

type PlacementPerformanceProfile =
  | "high-placement-high-conversion"
  | "high-pick-weak-results"
  | "low-pick-strong-conversion"
  | "ordinary";

type PlacementEvidence = ThemePlacementReport & {
  adoptionShare: number;
  baselineConversion: number;
};

type RestrictionPerformanceAssessment = {
  ignoredSleeper: IgnoredSleeper | null;
  hasClearlyBadCut: boolean;
  suppressGenericPraise: boolean;
};

function pickWinProfile(anchor: RestrictionAnchor): PickWinProfile {
  const popular = isHighAdoption(
    anchor.decisionShare,
    anchor.decisionLeaderShare,
  );
  const lowPick = isLowAdoption(
    anchor.decisionShare,
    anchor.decisionRank,
    anchor.decisionThemeCount,
  );
  if (popular && anchor.decisionWinRate <= 0.495) {
    return "popular-underperformer";
  }
  if (popular && anchor.decisionWinRate >= 0.525) {
    return "popular-powerhouse";
  }
  if (lowPick && anchor.decisionWinRate >= 0.525) {
    return "low-pick-high-win";
  }
  if (lowPick && anchor.decisionWinRate <= 0.48) {
    return "weak-fringe";
  }
  return "ordinary";
}

/** Theme popularity is an adoption fact, independent of placement tiers. */
function isHighAdoption(share: number, leaderShare: number): boolean {
  const relativeCutoff = Math.max(
    0.05,
    leaderShare * (leaderShare >= 0.2 ? 0.55 : 0.75),
  );
  return share >= relativeCutoff;
}

function isLowAdoption(share: number, rank: number, count: number): boolean {
  return (
    share <= 0.04 ||
    (rank >= Math.ceil(count * 0.6) && share <= 0.05)
  );
}

function placementEvidence(
  context: RecentRestrictionDecision,
  themeId: ThemeId,
): PlacementEvidence | null {
  const report = context.placementReport;
  const theme = report.themes[themeId];
  if (!theme || report.recordedDays === 0 || report.totalPlacements === 0) {
    return null;
  }
  const totalEntrants = Object.values(report.themes).reduce(
    (sum, candidate) => sum + candidate.estimatedEntrants,
    0,
  );
  if (totalEntrants <= 0) return null;
  return {
    ...theme,
    adoptionShare: theme.estimatedEntrants / totalEntrants,
    baselineConversion: report.totalPlacements / totalEntrants,
  };
}

function placementPerformanceProfile(
  context: RecentRestrictionDecision,
  themeId: ThemeId,
  share: number,
  rank: number,
  count: number,
  leaderShare: number,
): PlacementPerformanceProfile {
  const evidence = placementEvidence(context, themeId);
  if (
    !evidence ||
    evidence.baselineConversion <= 0 ||
    evidence.observedDays < 7
  ) {
    return "ordinary";
  }
  const relativePlacement =
    evidence.placementShare / Math.max(0.001, evidence.adoptionShare);
  const relativeConversion =
    evidence.observedConversion / evidence.baselineConversion;
  if (
    isHighAdoption(share, leaderShare) &&
    (relativePlacement <= 0.75 || relativeConversion <= 0.75)
  ) {
    return "high-pick-weak-results";
  }
  if (
    isLowAdoption(share, rank, count) &&
    evidence.placements >= 3 &&
    relativePlacement >= 1.25 &&
    relativeConversion >= 1.25
  ) {
    return "low-pick-strong-conversion";
  }
  if (
    evidence.placementShare >= 0.12 &&
    relativePlacement >= 0.95 &&
    relativeConversion >= 1.1
  ) {
    return "high-placement-high-conversion";
  }
  return "ordinary";
}

function anchorPlacementProfile(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): PlacementPerformanceProfile {
  return placementPerformanceProfile(
    context,
    anchor.content.id,
    anchor.decisionShare,
    anchor.decisionRank,
    anchor.decisionThemeCount,
    anchor.decisionLeaderShare,
  );
}

function ignoredSleeperAtDecision(
  state: GameState,
  context: RecentRestrictionDecision,
): IgnoredSleeper | null {
  const snapshot = historyAtOrBefore(state, context.decisionDay);
  if (!snapshot) return null;
  const tightenedThemes = new Set(
    context.anchors
      .filter((anchor) => anchor.direction === "tighten")
      .map((anchor) => anchor.content.id),
  );
  const decisionLeaderShare = Math.max(
    0,
    ...Object.values(snapshot.shares).filter((share) => Number.isFinite(share)),
  );
  const candidates = Object.entries(snapshot.shares)
    .flatMap(([themeId, share]) => {
      const content = THEME_BY_ID[themeId];
      const winRate = snapshot.winRates?.[themeId] ?? 0.5;
      const position = shareRank(snapshot.shares, themeId);
      const placementProfile = placementPerformanceProfile(
        context,
        themeId,
        share,
        position.rank,
        position.count,
        decisionLeaderShare,
      );
      if (
        !content ||
        tightenedThemes.has(themeId) ||
        !isLowAdoption(share, position.rank, position.count) ||
        (!Number.isFinite(winRate) &&
          placementProfile !== "low-pick-strong-conversion") ||
        (winRate < 0.525 &&
          placementProfile !== "low-pick-strong-conversion")
      ) {
        return [];
      }
      return [{
        content,
        share,
        winRate,
        placement: placementEvidence(context, themeId),
      }];
    })
    .sort(
      (left, right) =>
        Number(
          placementPerformanceProfile(
            context,
            right.content.id,
            right.share,
            shareRank(snapshot.shares, right.content.id).rank,
            shareRank(snapshot.shares, right.content.id).count,
            decisionLeaderShare,
          ) === "low-pick-strong-conversion",
        ) -
          Number(
            placementPerformanceProfile(
              context,
              left.content.id,
              left.share,
              shareRank(snapshot.shares, left.content.id).rank,
              shareRank(snapshot.shares, left.content.id).count,
              decisionLeaderShare,
            ) === "low-pick-strong-conversion",
          ) ||
        right.winRate - left.winRate ||
        left.share - right.share ||
        left.content.id.localeCompare(right.content.id),
    );
  return candidates[0] ?? null;
}

function isClearlyBadPickWinProfile(profile: PickWinProfile): boolean {
  return profile === "popular-underperformer" || profile === "weak-fringe";
}

function isStrongPlacementProfile(
  profile: PlacementPerformanceProfile,
): boolean {
  return (
    profile === "high-placement-high-conversion" ||
    profile === "low-pick-strong-conversion"
  );
}

function isClearlyBadRestrictionTarget(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): boolean {
  const pickWin = pickWinProfile(anchor);
  const placement = anchorPlacementProfile(context, anchor);
  if (isClearlyBadPickWinProfile(pickWin)) {
    return !isStrongPlacementProfile(placement);
  }
  return placement === "high-pick-weak-results";
}

function targetPickWinPool(
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): readonly string[] | null {
  if (anchor.direction !== "tighten") return null;
  const profile = pickWinProfile(anchor);
  const placementProfile = anchorPlacementProfile(context, anchor);
  if (
    isClearlyBadPickWinProfile(profile) &&
    isStrongPlacementProfile(placementProfile)
  ) {
    return MIXED_WIN_PLACEMENT_CUT_COPY;
  }
  if (profile === "popular-underperformer") {
    return placementProfile === "high-pick-weak-results"
      ? HIGH_PICK_WEAK_PLACEMENT_CUT_COPY
      : POPULAR_UNDERPERFORMER_CUT_COPY;
  }
  if (profile === "weak-fringe") return WEAK_FRINGE_CUT_COPY;
  if (placementProfile === "high-pick-weak-results") {
    return HIGH_PICK_WEAK_PLACEMENT_CUT_COPY;
  }
  if (placementProfile === "low-pick-strong-conversion") {
    return LOW_PICK_STRONG_CONVERSION_CUT_COPY;
  }
  if (placementProfile === "high-placement-high-conversion") {
    return HIGH_PLACEMENT_HIGH_CONVERSION_CUT_COPY;
  }
  if (profile === "popular-powerhouse") {
    return POPULAR_POWERHOUSE_CUT_COPY;
  }
  if (profile === "low-pick-high-win") {
    return LOW_PICK_HIGH_WIN_CUT_COPY;
  }
  return null;
}

function restrictionPerformanceAssessment(
  state: GameState,
  context: RecentRestrictionDecision,
): RestrictionPerformanceAssessment {
  const ignoredSleeper = ignoredSleeperAtDecision(state, context);
  const hasClearlyBadCut = context.anchors.some(
    (anchor) =>
      anchor.direction === "tighten" &&
      isClearlyBadRestrictionTarget(context, anchor),
  );
  return {
    ignoredSleeper,
    hasClearlyBadCut,
    suppressGenericPraise: hasClearlyBadCut || ignoredSleeper !== null,
  };
}

function restrictionPickWinPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  performance = restrictionPerformanceAssessment(state, context),
): readonly string[] | null {
  if (anchor.direction !== "tighten") return null;
  const profile = pickWinProfile(anchor);
  const targetPool = targetPickWinPool(context, anchor);
  if (!performance.suppressGenericPraise) return targetPool;
  if (isClearlyBadRestrictionTarget(context, anchor)) {
    if (
      profile === "popular-underperformer" &&
      performance.ignoredSleeper &&
      performance.ignoredSleeper.winRate >= anchor.decisionWinRate + 0.025
    ) {
      return performance.ignoredSleeper.placement &&
          placementPerformanceProfile(
            context,
            performance.ignoredSleeper.content.id,
            performance.ignoredSleeper.share,
            shareRank(
              historyAtOrBefore(state, context.decisionDay)?.shares ?? {},
              performance.ignoredSleeper.content.id,
            ).rank,
            shareRank(
              historyAtOrBefore(state, context.decisionDay)?.shares ?? {},
              performance.ignoredSleeper.content.id,
            ).count,
            Math.max(
              0,
              ...Object.values(
                historyAtOrBefore(state, context.decisionDay)?.shares ?? {},
              ).filter((share) => Number.isFinite(share)),
            ),
          ) === "low-pick-strong-conversion"
        ? MISSED_STRONG_CONVERSION_SLEEPER_COPY
        : MISSED_SLEEPER_THREAT_COPY;
    }
    return targetPool ?? RESTRICTION_CAUTION_COPY;
  }
  if (performance.ignoredSleeper) {
    const snapshot = historyAtOrBefore(state, context.decisionDay);
    const position = shareRank(
      snapshot?.shares ?? {},
      performance.ignoredSleeper.content.id,
    );
    return placementPerformanceProfile(
      context,
      performance.ignoredSleeper.content.id,
      performance.ignoredSleeper.share,
      position.rank,
      position.count,
      Math.max(
        0,
        ...Object.values(snapshot?.shares ?? {}).filter((share) =>
          Number.isFinite(share)
        ),
      ),
    ) === "low-pick-strong-conversion"
      ? MISSED_STRONG_CONVERSION_SLEEPER_COPY
      : MISSED_SLEEPER_GENERAL_COPY;
  }
  return RESTRICTION_CAUTION_COPY;
}

function isPickWinReactionSlot(age: 1 | 2 | 3, index: number): boolean {
  if (age === 1) return index % 4 <= 1;
  if (age === 2) return index % 4 === 1;
  return index % 3 === 0;
}

function unbanReactionAssessment(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
): UnbanReactionAssessment {
  const decisionSnapshot = historyAtOrBefore(state, context.decisionDay);
  const currentSnapshot = historyAtOrBefore(
    state,
    context.decisionDay + context.age,
  );
  const fallbackShares = Object.fromEntries(
    THEMES.map((theme) => [theme.id, theme.startingShare]),
  );
  const decision = shareRank(
    decisionSnapshot?.shares ?? fallbackShares,
    anchor.content.id,
  );
  const current = shareRank(
    currentSnapshot?.shares ?? decisionSnapshot?.shares ?? fallbackShares,
    anchor.content.id,
  );
  const delta = current.share - decision.share;
  const wasStrong =
    decision.share >= 0.18 ||
    (decision.rank <= 1 && decision.share >= 0.12) ||
    (anchor.content.baseUnpleasantness >= 72 && decision.share >= 0.1);
  const weakRankStart = Math.max(3, Math.ceil(decision.count * 0.6));
  const wasWeak =
    decision.share <= 0.08 ||
    (decision.rank >= weakRankStart && decision.share <= 0.11);
  const surgeThreshold = ([0.008, 0.014, 0.02] as const)[context.age - 1];
  const surged =
    delta >= surgeThreshold ||
    (decision.rank >= 3 && current.rank <= 1 && delta >= 0.006);
  const noImpact = Math.abs(delta) <= 0.003 * context.age;
  const tone: UnbanTone = surged
    ? "surge"
    : wasStrong
      ? "dangerous"
      : noImpact
        ? "no-impact"
        : anchor.restrictedDays >= 90 && wasWeak
          ? "overdue"
          : "measured";
  return {
    tone,
    decisionShare: decision.share,
    currentShare: current.share,
    delta,
    rank: current.rank + 1,
  };
}

function unbanPrimaryPool(tone: UnbanTone): readonly string[] {
  switch (tone) {
    case "overdue":
      return UNBAN_OVERDUE_COPY;
    case "dangerous":
      return UNBAN_DANGEROUS_COPY;
    case "surge":
      return UNBAN_SURGE_COPY;
    case "no-impact":
      return UNBAN_NO_IMPACT_COPY;
    case "measured":
      return UNBAN_MEASURED_COPY;
  }
}

function isUnbanCautionSlot(age: 1 | 2 | 3, index: number): boolean {
  const cautionSlots = age === 1
    ? [4, 9, 14]
    : age === 2
      ? [3, 8, 12]
      : [4, 9];
  return cautionSlots.includes(index);
}

function restrictionCopyPool(
  state: GameState,
  context: RecentRestrictionDecision,
  anchor: RestrictionAnchor,
  index: number,
  analysis: RestrictionDecisionSignals,
): readonly string[] {
  const age = context.age;
  const profile = analysis.profile;
  if (
    profile.directionMix.tighten === 0 &&
    profile.directionMix.loosen > 0 &&
    anchor.assessment === "unban"
  ) {
    if (isUnbanCautionSlot(age, index)) return UNBAN_CAUTION_COPY;
    if (index % 4 === 1) {
      return profile.staleFullyReleased > 0
        ? UNBAN_ONLY_RESTRICTION_REVIEW_COPY
        : profile.staleLoosened > 0
          ? PARTIAL_STALE_RELIEF_RESTRICTION_COPY
          : FRESH_UNBAN_ONLY_RESTRICTION_REVIEW_COPY;
    }
    return unbanPrimaryPool(unbanReactionAssessment(state, context, anchor).tone);
  }
  if (anchor.assessment === "no-change") {
    const critical = anchor.noChangeConcern;
    const dayOne = critical
      ? ([
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_FOLLOWUP_COPY,
        ] as const)
      : ([
          NO_CHANGE_HEALTHY_COPY,
          NO_CHANGE_HEALTHY_COPY,
          NO_CHANGE_HEALTHY_COPY,
          NO_CHANGE_MEME_COPY,
        ] as const);
    const dayTwo = critical
      ? ([
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_FOLLOWUP_COPY,
        ] as const)
      : ([
          NO_CHANGE_HEALTHY_COPY,
          NO_CHANGE_HEALTHY_COPY,
          NO_CHANGE_MEME_COPY,
        ] as const);
    const dayThree = critical
      ? ([
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_CRITICAL_COPY,
          NO_CHANGE_FOLLOWUP_COPY,
        ] as const)
      : ([NO_CHANGE_HEALTHY_COPY, NO_CHANGE_HEALTHY_COPY] as const);
    const routing = age === 1 ? dayOne : age === 2 ? dayTwo : dayThree;
    return routing[index % routing.length];
  }
  if (isBalancedFourCutReview(context, profile)) {
    return balancedFourCutCopyPool(
      state,
      context,
      anchor,
      profile,
      index,
    );
  }
  const performance = restrictionPerformanceAssessment(state, context);
  const pickWinPool = restrictionPickWinPool(
    state,
    context,
    anchor,
    performance,
  );
  if (pickWinPool && isPickWinReactionSlot(age, index)) return pickWinPool;
  if (isSingleCardTightening(context, anchor)) {
    return singleRestrictionCopyPool(state, context, anchor, analysis, index);
  }
  if (
    profile.meaningfulCutCount > 0 &&
    profile.meaningfulCutCount <= 2
  ) {
    return narrowRestrictionCopyPool(state, context, anchor, analysis, index);
  }
  const listPerformancePool = performance.suppressGenericPraise
    ? anchor.direction === "tighten"
      ? pickWinPool ?? RESTRICTION_CAUTION_COPY
      : RESTRICTION_CAUTION_COPY
    : null;
  const primary = anchor.assessment === "unban"
    ? isUnbanCautionSlot(age, index)
      ? UNBAN_CAUTION_COPY
      : unbanPrimaryPool(unbanReactionAssessment(state, context, anchor).tone)
    : listPerformancePool ?? primaryRestrictionPool(anchor);
  const coverage = listPerformancePool ?? restrictionCoveragePool(profile);
  const composition = listPerformancePool ?? restrictionCompositionPool(profile);
  const count = restrictionCountPool(profile);
  const detail = restrictionPolicyDetailPool(state, context, anchor);
  const unrestrictedSignalPools = restrictionDecisionSignalPools(
    state,
    context,
    anchor,
    analysis,
  );
  const signalPools = performance.suppressGenericPraise
    ? unrestrictedSignalPools.filter(
        (pool) =>
          pool !== BALANCED_RESTRICTION_REVIEW_COPY &&
          pool !== APPROPRIATE_RESTRICTION_COPY,
      )
    : unrestrictedSignalPools;
  const signal = (offset: number, fallback: readonly string[]) =>
    signalPools.length > 0
      ? signalPools[offset % signalPools.length]
      : fallback;
  const alternate = anchor.direction === "loosen"
    ? primary
    : ALTERNATE_BUILD_RESTRICTION_COPY;
  const market = anchor.direction === "loosen"
    ? primary
    : RESTRICTION_MARKET_COPY;
  const meta = anchor.direction === "loosen" ? primary : RESTRICTION_META_COPY;
  const meme = anchor.direction === "loosen" ? primary : RESTRICTION_MEME_COPY;
  const caution = anchor.direction === "loosen"
    ? UNBAN_CAUTION_COPY
    : listPerformancePool ?? (profile.quality === "balanced"
      ? BALANCED_RESTRICTION_REVIEW_CAUTION_COPY
      : RESTRICTION_CAUTION_COPY);
  const dayOne: readonly (readonly string[])[] = [
    coverage,
    signal(0, composition),
    coverage,
    primary,
    signal(1, meme),
    coverage,
    detail,
    caution,
  ];
  const dayTwo: readonly (readonly string[])[] = [
    coverage,
    signal(0, composition),
    alternate,
    primary,
    count,
    signal(1, detail),
    market,
  ];
  const dayThree: readonly (readonly string[])[] = [
    coverage,
    signal(0, composition),
    meta,
    alternate,
    caution,
    signal(1, detail),
  ];
  const routing = age === 1 ? dayOne : age === 2 ? dayTwo : dayThree;
  return routing[index % routing.length];
}

function restrictionRecentProduct(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
): { age: number; kind: ReleasedProduct["kind"] } | null {
  let latest: { day: number; kind: ReleasedProduct["kind"] } | null = null;
  for (const batch of state.releaseHistory) {
    if (batch.day > decisionDay) continue;
    const product = batch.products.find(
      (candidate): candidate is ReleasedThemeProduct =>
        isThemeReleaseProduct(candidate) && candidate.themeId === themeId,
    );
    if (product && (!latest || batch.day >= latest.day)) {
      latest = { day: batch.day, kind: product.kind };
    }
  }
  return latest
    ? { age: Math.max(0, decisionDay - latest.day), kind: latest.kind }
    : null;
}

function restrictionRecentProductAge(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
): number {
  return (
    restrictionRecentProduct(state, decisionDay, themeId)?.age ??
    Math.max(0, decisionDay - 1)
  );
}

function makeRestrictionContextPost(
  state: GameState,
  context: RecentRestrictionDecision,
  outputIndex: number,
  usedBodies: ReadonlySet<string>,
  decisionSignals: RestrictionDecisionSignals,
  fixedAnchor?: RestrictionAnchor,
): CommunityEvent {
  const anchorOffset = keyedIndex(
    context.anchors.length,
    state.seed,
    "restriction-anchor-offset",
    context.decisionDay,
    context.age,
  );
  const anchor =
    fixedAnchor ??
    context.anchors[(anchorOffset + outputIndex) % context.anchors.length];
  const pool = restrictionCopyPool(
    state,
    context,
    anchor,
    outputIndex,
    decisionSignals,
  );
  const unban =
    anchor.assessment === "unban"
      ? unbanReactionAssessment(state, context, anchor)
      : null;
  const policy = decisionSignals.profile;
  const target = decisionSignals.targets.find(
    (candidate) => candidate.partId === anchor.part.id,
  );
  const ignoredSignal = decisionSignals.signals.find(
    (signal) => signal.kind === "upper-ignored",
  );
  const ignoredContent = ignoredSignal
    ? THEME_BY_ID[ignoredSignal.themeId]
    : undefined;
  const ignoredPart = ignoredSignal
    ? COMMUNITY_PART_BY_ID.get(ignoredSignal.partId)
    : undefined;
  const ignoredShare = ignoredSignal
    ? historyAtOrBefore(state, context.decisionDay)?.shares[
        ignoredSignal.themeId
      ] ?? 0
    : 0;
  const ignoredSleeper = ignoredSleeperAtDecision(state, context);
  const placement = placementEvidence(context, anchor.content.id);
  const sleeperPlacement = ignoredSleeper?.placement ?? null;
  const replacementSignal = decisionSignals.signals.find(
    (signal) =>
      signal.kind === "replacement-risk" &&
      signal.partId === anchor.part.id,
  );
  const relatedPart = replacementSignal?.relatedPartId
    ? COMMUNITY_PART_BY_ID.get(replacementSignal.relatedPartId)
    : undefined;
  const values = {
    theme: anchor.content.shortName,
    part: anchor.part.name,
    oldLimit: String(anchor.oldLimit),
    newLimit: String(anchor.newLimit),
    days: String(
      restrictionRecentProductAge(
        state,
        context.decisionDay,
        anchor.content.id,
      ),
    ),
    restrictedDays: String(anchor.restrictedDays),
    decisionShare: `${(
      (unban?.decisionShare ?? anchor.decisionShare) * 100
    ).toFixed(1)}%`,
    decisionWinRate: `${(anchor.decisionWinRate * 100).toFixed(1)}%`,
    share: `${((unban?.currentShare ?? 0) * 100).toFixed(1)}%`,
    delta: `${(Math.abs(unban?.delta ?? 0) * 100).toFixed(1)}`,
    rank: String(unban?.rank ?? 0),
    cutCount: String(policy.meaningfulCutCount),
    changeCount: String(policy.changeCount),
    cosmeticCount: String(policy.cosmeticChanges),
    oldUnbanCount: String(policy.staleFullyReleased),
    tierOneCutCount: String(policy.upperMeaningfulCuts),
    tierTwoCutCount: String(policy.tier2MeaningfulCuts),
    ignoredTheme: ignoredContent?.shortName ?? "최상위 테마",
    ignoredPart: ignoredPart?.name ?? "최상위권 핵심",
    ignoredShare: `${(ignoredShare * 100).toFixed(1)}%`,
    placementDays: String(
      placement?.observedDays ?? context.placementReport.recordedDays,
    ),
    placements: String(placement?.placements ?? 0),
    placementShare: `${((placement?.placementShare ?? 0) * 100).toFixed(1)}%`,
    conversion: `${((placement?.observedConversion ?? 0) * 100).toFixed(1)}%`,
    other: ignoredSleeper?.content.shortName ?? "저픽 고승률 테마",
    otherShare: `${((ignoredSleeper?.share ?? 0) * 100).toFixed(1)}%`,
    otherWinRate: `${((ignoredSleeper?.winRate ?? 0.5) * 100).toFixed(1)}%`,
    otherPlacements: String(sleeperPlacement?.placements ?? 0),
    otherPlacementDays: String(
      sleeperPlacement?.observedDays ?? context.placementReport.recordedDays,
    ),
    otherConversion: `${(
      (sleeperPlacement?.observedConversion ?? 0) * 100
    ).toFixed(1)}%`,
    usage: `${((target?.usageRate ?? anchor.part.inclusion) * 100).toFixed(1)}%`,
    averageCopies: (target?.averageCopies ?? anchor.part.averageCopies).toFixed(1),
    relatedPart: relatedPart?.name ?? "대체 파츠",
    changeLabel: `${anchor.oldLimit}→${anchor.newLimit}장`,
    limitLabel: anchor.newLimit === 0
      ? "금지"
      : `${anchor.newLimit}장 제한`,
  };
  const fill = (copy: string) => {
    return fillCommunityCopy(copy, values);
  };
  const start = keyedIndex(
    pool.length,
    state.seed,
    "restriction-reaction-copy",
    context.decisionDay,
    context.age,
    outputIndex,
    anchor.part.id,
  );
  const recencyIndex =
    context.age >= 2 && (outputIndex === 1 || outputIndex === 5)
      ? pool.findIndex((copy) => copy.includes("{days}"))
      : -1;
  const copyStart = recencyIndex >= 0 ? recencyIndex : start;
  let body = fill(pool[copyStart]);
  for (let offset = 1; offset < pool.length && usedBodies.has(body); offset += 1) {
    body = fill(pool[(copyStart + offset) % pool.length]);
  }
  return {
    id: `daily-restriction-${context.decisionDay}-${anchor.content.id}-${anchor.part.id}-${context.age}-${String(
      outputIndex + 1,
    ).padStart(2, "0")}`,
    day: context.decisionDay + context.age,
    category: "restriction",
    type: "restriction-demand",
    themeId: anchor.content.id,
    partId: anchor.part.id,
    value: anchor.newLimit,
    previousValue: anchor.oldLimit,
    body,
  };
}

type NarrowRestrictionFollowup = {
  context: RecentRestrictionDecision;
  age: 4 | 5 | 6 | 7;
  profile: RestrictionPolicyProfile;
  outcome: RestrictionHistoricalOutcome;
  tightenedAnchors: RestrictionAnchor[];
};

function narrowRestrictionFollowup(
  state: GameState,
  day: number,
): NarrowRestrictionFollowup | undefined {
  for (const age of [4, 5, 6, 7] as const) {
    const decisionDay = day - age;
    const context = recentRestrictionDecision(state, decisionDay + 3);
    if (!context || context.decisionDay !== decisionDay) continue;
    const profile = getPublishedRestrictionPolicyProfile(state, decisionDay);
    if (
      profile.meaningfulCutCount < 1 ||
      profile.meaningfulCutCount > 2 ||
      profile.directionMix.tighten < 1
    ) {
      continue;
    }
    const decisionSnapshot = state.history.find(
      (entry) => entry.day === decisionDay,
    );
    const followupSnapshot = state.history.find((entry) => entry.day === day);
    const tightenedAnchors = context.anchors.filter(
      (anchor) =>
        anchor.direction === "tighten" && anchor.availabilityDelta > 1e-6,
    ).sort((left, right) => {
      const delta = (anchor: RestrictionAnchor) =>
        (followupSnapshot?.shares[anchor.content.id] ?? 0) -
        (decisionSnapshot?.shares[anchor.content.id] ?? 0);
      return delta(left) - delta(right);
    });
    if (tightenedAnchors.length === 0) continue;
    if (!state.history.some((entry) => entry.day === decisionDay)) continue;
    const outcome = getRestrictionHistoricalOutcome(state, decisionDay, day);
    if (outcome.classification === "pending" || !outcome.followupMetrics) {
      continue;
    }
    return { context, age, profile, outcome, tightenedAnchors };
  }
  return undefined;
}

function narrowRestrictionFollowupPool(
  followup: NarrowRestrictionFollowup,
): readonly string[] {
  switch (followup.outcome.classification) {
    case "stabilized":
      return followup.profile.meaningfulCutCount === 1
        ? SINGLE_RESTRICTION_STABILIZED_COPY
        : TWO_CARD_RESTRICTION_STABILIZED_COPY;
    case "ineffective":
      return NARROW_RESTRICTION_STILL_INSUFFICIENT_COPY;
    case "overcorrected":
      return NARROW_RESTRICTION_OVERKILL_FOLLOWUP_COPY;
    case "replacement":
      return NARROW_RESTRICTION_BALLOON_FOLLOWUP_COPY;
    case "mixed":
      return NARROW_RESTRICTION_MIXED_FOLLOWUP_COPY;
    case "pending":
      return NARROW_RESTRICTION_MIXED_FOLLOWUP_COPY;
  }
}

function makeNarrowRestrictionFollowupPost(
  state: GameState,
  day: number,
  followup: NarrowRestrictionFollowup,
  outputIndex: number,
  usedBodies: ReadonlySet<string>,
): CommunityEvent {
  const anchorSpecificOutcome =
    followup.outcome.classification === "overcorrected" ||
    followup.outcome.classification === "replacement";
  const anchor = anchorSpecificOutcome
    ? followup.tightenedAnchors[0]
    : followup.tightenedAnchors[outputIndex % followup.tightenedAnchors.length];
  const pool = narrowRestrictionFollowupPool(followup);
  const snapshot = state.history.find((entry) => entry.day === day);
  const rankedShares = snapshot
    ? Object.values(snapshot.shares)
      .filter((share) => Number.isFinite(share) && share >= 0)
      .sort((left, right) => right - left)
    : [];
  const topTwoShare = rankedShares
    .slice(0, 2)
    .reduce((sum, share) => sum + share, 0);
  const values = {
    theme: anchor.content.shortName,
    part: anchor.part.name,
    cutCount: String(followup.profile.meaningfulCutCount),
    followupAge: String(followup.age),
    topShare: `${((followup.outcome.followupMetrics?.topShare ?? 0) * 100).toFixed(1)}%`,
    topTwoShare: `${(topTwoShare * 100).toFixed(1)}%`,
  };
  const fill = (copy: string) => fillCommunityCopy(copy, values);
  const start = keyedIndex(
    pool.length,
    state.seed,
    "restriction-followup-copy",
    followup.context.decisionDay,
    day,
    outputIndex,
    followup.outcome.classification,
  );
  let body = fill(pool[start]);
  for (let offset = 1; offset < pool.length && usedBodies.has(body); offset += 1) {
    body = fill(pool[(start + offset) % pool.length]);
  }
  return {
    id: `daily-restriction-followup-${followup.context.decisionDay}-${day}-${String(
      outputIndex + 1,
    ).padStart(2, "0")}`,
    day,
    category: "restriction",
    type: "restriction-demand",
    themeId: anchor.content.id,
    partId: anchor.part.id,
    value: anchor.newLimit,
    previousValue: anchor.oldLimit,
    body,
  };
}

function isRestrictionContextEvent(
  event: CommunityEvent,
  context: RecentRestrictionDecision,
): boolean {
  if (event.type !== "restriction-demand" || !event.partId) return false;
  return context.anchors.some(
    (anchor) =>
      anchor.content.id === event.themeId &&
      anchor.part.id === event.partId,
  );
}

function genericRestrictionCopyPool(
  context: RecentGenericRestrictionDecision,
  anchor: GenericRestrictionAnchor,
  index: number,
): readonly string[] {
  if (anchor.direction === "loosen") {
    const routing = context.age === 1
      ? [
          GENERIC_RESTRICTION_RELIEF_COPY,
          GENERIC_RESTRICTION_RELIEF_COPY,
          GENERIC_RESTRICTION_CAUTION_COPY,
          GENERIC_RESTRICTION_RELIEF_COPY,
          GENERIC_RESTRICTION_CAUTION_COPY,
        ]
      : [
          GENERIC_RESTRICTION_RELIEF_COPY,
          GENERIC_RESTRICTION_CAUTION_COPY,
          GENERIC_RESTRICTION_RELIEF_COPY,
          GENERIC_RESTRICTION_CAUTION_COPY,
        ];
    return routing[index % routing.length];
  }

  const widespread =
    anchor.affectedThemes.length >= 3 || anchor.fieldReach >= 0.28;
  const broadlyPlayed =
    anchor.affectedThemes.length >= 5 || anchor.fieldReach >= 0.42;
  const unpopular = anchor.card.unpleasantness >= 60 || broadlyPlayed;
  const impact = widespread
    ? GENERIC_RESTRICTION_WIDESPREAD_COPY
    : GENERIC_RESTRICTION_COLLATERAL_COPY;
  const verdict = unpopular
    ? GENERIC_RESTRICTION_WELL_RIDDANCE_COPY
    : GENERIC_RESTRICTION_COLLATERAL_COPY;
  const dayOne = [
    impact,
    verdict,
    GENERIC_RESTRICTION_WIDESPREAD_COPY,
    GENERIC_RESTRICTION_MEME_COPY,
    verdict,
    GENERIC_RESTRICTION_COLLATERAL_COPY,
    GENERIC_RESTRICTION_MARKET_COPY,
    impact,
    GENERIC_RESTRICTION_CAUTION_COPY,
  ];
  const dayTwo = [
    GENERIC_RESTRICTION_REBUILD_COPY,
    impact,
    GENERIC_RESTRICTION_MARKET_COPY,
    GENERIC_RESTRICTION_REBUILD_COPY,
    verdict,
    GENERIC_RESTRICTION_COLLATERAL_COPY,
    GENERIC_RESTRICTION_CAUTION_COPY,
    GENERIC_RESTRICTION_MEME_COPY,
  ];
  const dayThree = [
    GENERIC_RESTRICTION_CAUTION_COPY,
    GENERIC_RESTRICTION_REBUILD_COPY,
    impact,
    verdict,
    GENERIC_RESTRICTION_MARKET_COPY,
    GENERIC_RESTRICTION_COLLATERAL_COPY,
    GENERIC_RESTRICTION_MEME_COPY,
  ];
  const routing = context.age === 1 ? dayOne : context.age === 2 ? dayTwo : dayThree;
  return routing[index % routing.length];
}

function makeGenericRestrictionContextPost(
  state: GameState,
  context: RecentGenericRestrictionDecision,
  outputIndex: number,
  usedBodies: ReadonlySet<string>,
  fixedAnchor?: GenericRestrictionAnchor,
): CommunityEvent {
  const anchorOffset = keyedIndex(
    context.anchors.length,
    state.seed,
    "generic-restriction-anchor-offset",
    context.decisionDay,
    context.age,
  );
  const anchor = fixedAnchor ??
    context.anchors[(anchorOffset + outputIndex) % context.anchors.length];
  const affected = anchor.affectedThemes;
  const subject = affected[outputIndex % affected.length]?.content ??
    THEME_BY_ID[anchor.event.themeId];
  const lead = affected.find(
    (candidate) => candidate.content.id === anchor.event.themeId,
  )?.content ?? affected[0]?.content ?? subject;
  const otherCandidates = affected.filter(
    (candidate) => candidate.content.id !== lead?.id,
  );
  const other = otherCandidates[outputIndex % Math.max(1, otherCandidates.length)]
    ?.content ?? subject ?? lead;
  const pool = genericRestrictionCopyPool(context, anchor, outputIndex);
  const values = {
    card: anchor.card.name,
    keyword: getPlayKeywordLabel(anchor.card.keyword),
    leadTheme: lead?.shortName ?? "상위 덱",
    otherTheme: other?.shortName ?? "다른 덱",
    affectedCount: String(Math.max(1, affected.length)),
    reach: `${(anchor.fieldReach * 100).toFixed(1)}%`,
    oldLimit: String(anchor.oldLimit),
    newLimit: String(anchor.newLimit),
    replacement: anchor.replacementName,
    releaseAge: String(anchor.releaseAge),
  };
  const fill = (copy: string) => fillCommunityCopy(copy, values);
  const start = keyedIndex(
    pool.length,
    state.seed,
    "generic-restriction-reaction-copy",
    context.decisionDay,
    context.age,
    outputIndex,
    anchor.card.id,
  );
  let body = fill(pool[start]);
  for (let offset = 1; offset < pool.length && usedBodies.has(body); offset += 1) {
    body = fill(pool[(start + offset) % pool.length]);
  }
  return {
    id: `daily-generic-restriction-${context.decisionDay}-${anchor.card.id}-${context.age}-${String(
      outputIndex + 1,
    ).padStart(2, "0")}`,
    day: context.decisionDay + context.age,
    category: "restriction",
    type: "restriction-demand",
    themeId: subject?.id ?? anchor.event.themeId,
    genericCardId: anchor.card.id,
    partId: anchor.card.id,
    value: anchor.newLimit,
    previousValue: anchor.oldLimit,
    body,
  };
}

function isGenericRestrictionContextEvent(
  event: CommunityEvent,
  context: RecentGenericRestrictionDecision,
): boolean {
  if (event.type !== "restriction-demand" || !event.genericCardId) return false;
  return context.anchors.some((anchor) => anchor.card.id === event.genericCardId);
}

function isGreedRelease(product: ReleasedProduct): boolean {
  return (
    product.powerAdjustment >= 2 ||
    product.expectedTier === "Tier 0" ||
    product.expectedTier === "Tier 1"
  );
}

function isWeakRelease(product: ReleasedProduct): boolean {
  return product.powerAdjustment <= -2 || product.expectedTier === "Tier 3";
}

/** Mirrors the engine's immutable tuning table so historical copy needs no runtime snapshot. */
const SUPPORT_REPLACEMENT_PRESSURE: Record<
  ReleasedProduct["powerAdjustment"],
  number
> = {
  [-3]: 0.04,
  [-2]: 0.07,
  [-1]: 0.11,
  0: 0.17,
  1: 0.25,
  2: 0.36,
  3: 0.48,
};

function supportReactionContext(
  state: GameState,
  releaseDay: number,
  product: ReleasedProduct,
): SupportReactionContext | null {
  if (product.kind !== "support") return null;
  const content = THEME_BY_ID[product.themeId];
  if (!content) return null;

  const snapshot = historyAtOrBefore(state, releaseDay);
  const shares = snapshot?.shares ?? Object.fromEntries(
    THEMES.map((theme) => [theme.id, theme.startingShare]),
  );
  const ranked = Object.entries(shares)
    .filter(([, share]) => Number.isFinite(share) && share > 0)
    .sort((left, right) => right[1] - left[1]);
  const share = shares[product.themeId] ?? content.startingShare;
  const rank = ranked.findIndex(([themeId]) => themeId === product.themeId);
  const weakRankStart = Math.max(3, Math.ceil(ranked.length * 0.6));
  const themeStrength: ThemeStrength =
    share >= 0.18 || (rank >= 0 && rank <= 1 && share >= 0.13)
      ? "strong"
      : share <= 0.075 || (rank >= weakRankStart && share <= 0.11)
        ? "weak"
        : "middle";
  const supportStrength: SupportStrength =
    product.powerAdjustment >= 2
      ? "strong"
      : product.powerAdjustment <= -2
        ? "weak"
        : "middle";

  const supportNumber = Math.max(
    1,
    state.releaseHistory.reduce(
      (count, batch) =>
        batch.day <= releaseDay
          ? count +
            batch.products.filter(
              (candidate) =>
                candidate.kind === "support" &&
                candidate.themeId === product.themeId,
            ).length
          : count,
      0,
    ),
  );
  const supportStart =
    INITIAL_THEME_PART_COUNT +
    (supportNumber - 1) * SUPPORT_PARTS_PER_RELEASE;
  const newParts = content.parts
    .slice(supportStart, supportStart + SUPPORT_PARTS_PER_RELEASE);
  const oldParts = content.parts.slice(0, supportStart);
  const newAdoptionMultiplier =
    0.55 + (product.powerAdjustment + 3) * 0.09;
  const predictedNewUsage = (part: PartContent) =>
    Math.min(0.995, part.inclusion * newAdoptionMultiplier);
  const rankedNewParts = [...newParts].sort(
    (left, right) =>
      predictedNewUsage(right) - predictedNewUsage(left) ||
      left.id.localeCompare(right.id),
  );
  const displacedOldParts = [...oldParts].sort(
    (left, right) =>
      right.inclusion - left.inclusion || left.id.localeCompare(right.id),
  );
  const newAverage = newParts.length > 0
    ? newParts.reduce((sum, part) => sum + predictedNewUsage(part), 0) /
      newParts.length
    : 0;
  const replacementPressure = SUPPORT_REPLACEMENT_PRESSURE[product.powerAdjustment];

  return {
    themeStrength,
    supportStrength,
    share,
    supportNumber,
    replacementPressure,
    replacesCore:
      themeStrength === "weak" &&
      newParts.length === SUPPORT_PARTS_PER_RELEASE &&
      newAverage >= 0.55 &&
      replacementPressure >= 0.45,
    newParts: rankedNewParts,
    displacedOldParts,
  };
}

function supportReactionCopyPool(
  context: SupportReactionContext,
): readonly string[] {
  if (context.replacesCore) return THESEUS_SUPPORT_COPY;
  if (context.themeStrength === "strong" && context.supportStrength === "strong") {
    return STRONG_THEME_STRONG_SUPPORT_COPY;
  }
  if (context.themeStrength === "strong" && context.supportStrength === "weak") {
    return STRONG_THEME_WEAK_SUPPORT_COPY;
  }
  if (context.themeStrength === "weak" && context.supportStrength === "strong") {
    return WEAK_THEME_STRONG_SUPPORT_COPY;
  }
  if (context.themeStrength === "weak" && context.supportStrength === "weak") {
    return WEAK_THEME_WEAK_SUPPORT_COPY;
  }
  if (context.supportStrength === "strong") return MIDDLE_THEME_STRONG_SUPPORT_COPY;
  if (context.supportStrength === "weak") return MIDDLE_THEME_WEAK_SUPPORT_COPY;
  return MIDDLE_SUPPORT_COPY;
}

export function getReleaseReactionProfile(
  state: GameState,
  day: number,
): ReleaseReactionProfile {
  assertCommunityDay(state, day);
  const recent = releaseBatchNearDay(state, day);
  if (!recent) {
    return {
      day,
      age: null,
      heat: 0,
      intensity: 0,
      surge: false,
      flags: { greed: false, weak: false, backlash: false },
      headline: "",
      themeIds: [],
    };
  }

  const greed = recent.batch.products.some(isGreedRelease);
  const weak = recent.batch.products.some(isWeakRelease);
  const backlash = recent.batch.products.some(
    (product) => restrictionAge(state, recent.batch.day, product) !== null,
  );
  const lifecycleIndex = recent.age - 1;
  const baseHeat = [90, 72, 50, 32][lifecycleIndex];
  const heat = Math.min(
    100,
    baseHeat + (greed ? 6 : 0) + (weak ? 4 : 0) + (backlash ? 10 : 0),
  );
  const intensity = ([3, 2, 1, 1] as const)[lifecycleIndex];
  const headline = backlash
    ? "금제 직후 지원 논란 폭발"
    : greed && weak
      ? "신제품 평가가 극과 극으로 갈렸다"
      : greed
        ? "파워 인플레 논란 폭발"
        : weak
          ? "신제품 상품성 논란 확산"
          : "신카드 연구 열기 폭발";

  return {
    day,
    age: recent.age,
    heat,
    intensity,
    surge: true,
    flags: { greed, weak, backlash },
    headline,
    themeIds: recent.batch.products
      .filter(isThemeReleaseProduct)
      .map((product) => product.themeId),
  };
}

function historyAtOrBefore(state: GameState, day: number) {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    if (state.history[index].day <= day) return state.history[index];
  }
  return undefined;
}

type EmergingThemeEvidence = {
  content: ThemeContent;
  debutDay: number;
  elapsedDays: number;
  observedDays: number;
  adoptionShare: number;
  winRate: number;
  placement: ThemePlacementReport;
  relativePlacement: number;
  relativeConversion: number;
  highAdoption: boolean;
};

type EmergingPerformanceTone = "strong" | "weak" | "ordinary";
type EmergingPerformanceBranch =
  | "strong-combined"
  | "strong-win"
  | "strong-placement"
  | "weak-combined"
  | "weak-win"
  | "weak-placement"
  | "mixed"
  | "neutral";

function naturalElapsedDays(days: number): string {
  const words = [
    "하루",
    "이틀",
    "사흘",
    "나흘",
    "닷새",
    "엿새",
    "일주일",
    "여드레",
    "아흐레",
    "열흘",
    "열하루",
    "열이틀",
    "열사흘",
    "두 주",
  ] as const;
  return words[Math.max(1, Math.min(words.length, days)) - 1];
}

function containsOfficialTierNumberClaim(copy: string): boolean {
  return /(?:[0-3]티어|Tier\s*[0-3])/.test(copy);
}

function isCollectingNewThemeAtDay(
  state: GameState,
  themeId: ThemeId,
  day: number,
): boolean {
  let debutDay: number | null = null;
  for (const batch of state.releaseHistory) {
    if (
      batch.products.some(
        (product) =>
          product.kind === "new-theme" && product.themeId === themeId,
      )
    ) {
      const candidate = batch.day + 1;
      debutDay = debutDay === null ? candidate : Math.min(debutDay, candidate);
    }
  }
  if (debutDay === null) return false;
  const elapsedDays = day - debutDay + 1;
  return elapsedDays >= 1 && elapsedDays < PLACEMENT_WINDOW_DAYS;
}

function emergingThemeEvidenceAt(
  state: GameState,
  themeId: ThemeId,
  debutDay: number,
  endDay: number,
  windowDays: number,
): EmergingThemeEvidence | null {
  const snapshot = historyAtOrBefore(state, endDay);
  const content = THEME_BY_ID[themeId];
  const adoptionShare = snapshot?.shares[themeId];
  if (
    !content ||
    !snapshot ||
    typeof adoptionShare !== "number" ||
    !Number.isFinite(adoptionShare) ||
    adoptionShare <= 0
  ) {
    return null;
  }
  const report = getRecentPlacementReport(
    state.history,
    state.seed,
    endDay,
    windowDays,
  );
  const placement = report.themes[themeId];
  if (!placement || report.recordedDays === 0 || report.totalPlacements === 0) {
    return null;
  }
  const totalEntrants = Object.values(report.themes).reduce(
    (sum, candidate) => sum + candidate.estimatedEntrants,
    0,
  );
  const windowAdoption = totalEntrants > 0
    ? placement.estimatedEntrants / totalEntrants
    : adoptionShare;
  const baselineConversion = totalEntrants > 0
    ? report.totalPlacements / totalEntrants
    : 0;
  const leaderShare = Math.max(
    adoptionShare,
    ...Object.values(snapshot.shares).filter(
      (share) => Number.isFinite(share) && share > 0,
    ),
  );
  return {
    content,
    debutDay,
    elapsedDays: Math.max(1, endDay - debutDay + 1),
    observedDays: placement.observedDays,
    adoptionShare,
    winRate: snapshot.winRates?.[themeId] ?? 0.5,
    placement,
    relativePlacement:
      placement.placementShare / Math.max(0.001, windowAdoption),
    relativeConversion:
      baselineConversion > 0
        ? placement.observedConversion / baselineConversion
        : 1,
    highAdoption: isHighAdoption(adoptionShare, leaderShare),
  };
}

function emergingPerformanceBranch(
  evidence: EmergingThemeEvidence,
): EmergingPerformanceBranch {
  const strongWin = evidence.winRate >= 0.525;
  const weakWin = evidence.winRate <= 0.495;
  const strongPlacement =
    evidence.placement.placements > 0 &&
    evidence.relativePlacement >= 1.15 &&
    evidence.relativeConversion >= 1.15;
  const weakPlacement =
    evidence.relativePlacement <= 0.8 ||
    evidence.relativeConversion <= 0.8;
  const meaningfulWeakPlacement = evidence.highAdoption && weakPlacement;

  if (
    (strongWin && meaningfulWeakPlacement) ||
    (strongPlacement && weakWin)
  ) return "mixed";
  if (strongWin && strongPlacement) return "strong-combined";
  if (evidence.highAdoption && weakWin && weakPlacement) {
    return "weak-combined";
  }
  if (evidence.highAdoption && weakWin) return "weak-win";
  if (meaningfulWeakPlacement) return "weak-placement";
  if (strongWin) return "strong-win";
  if (strongPlacement) return "strong-placement";
  return "neutral";
}

function emergingPerformanceTone(
  evidence: EmergingThemeEvidence,
): EmergingPerformanceTone {
  const branch = emergingPerformanceBranch(evidence);
  if (branch.startsWith("strong-")) return "strong";
  if (branch.startsWith("weak-")) return "weak";
  return "ordinary";
}

function emergingEvaluationCopyPool(
  branch: EmergingPerformanceBranch,
  early: boolean,
): readonly string[] {
  switch (branch) {
    case "strong-combined":
      return early
        ? EMERGING_THEME_EARLY_POSITIVE_COPY
        : EMERGING_THEME_POSITIVE_COPY;
    case "strong-win":
      return early
        ? EMERGING_THEME_EARLY_WIN_POSITIVE_COPY
        : EMERGING_THEME_WIN_POSITIVE_COPY;
    case "strong-placement":
      return early
        ? EMERGING_THEME_EARLY_PLACEMENT_POSITIVE_COPY
        : EMERGING_THEME_PLACEMENT_POSITIVE_COPY;
    case "weak-combined":
      return early
        ? EMERGING_THEME_EARLY_BUBBLE_COPY
        : EMERGING_THEME_BUBBLE_COPY;
    case "weak-win":
      return early
        ? EMERGING_THEME_EARLY_WIN_WEAK_COPY
        : EMERGING_THEME_WIN_WEAK_COPY;
    case "weak-placement":
      return early
        ? EMERGING_THEME_EARLY_PLACEMENT_WEAK_COPY
        : EMERGING_THEME_PLACEMENT_WEAK_COPY;
    case "mixed":
      return early
        ? EMERGING_THEME_EARLY_MIXED_COPY
        : EMERGING_THEME_MIXED_COPY;
    case "neutral":
      return early
        ? EMERGING_THEME_EARLY_NEUTRAL_COPY
        : EMERGING_THEME_NEUTRAL_COPY;
  }
}

function emergingThemeCandidates(
  state: GameState,
  day: number,
): EmergingThemeEvidence[] {
  const byTheme = new Map<ThemeId, EmergingThemeEvidence>();
  for (const batch of state.releaseHistory) {
    const debutDay = batch.day + 1;
    if (debutDay > day) continue;
    for (const product of batch.products) {
      if (product.kind !== "new-theme") continue;
      const evidence = emergingThemeEvidenceAt(
        state,
        product.themeId,
        debutDay,
        day,
        EMERGING_THEME_OFFICIAL_SAMPLE_DAYS,
      );
      if (evidence) byTheme.set(product.themeId, evidence);
    }
  }
  return [...byTheme.values()].sort(
    (left, right) =>
      right.adoptionShare - left.adoptionShare ||
      left.content.id.localeCompare(right.content.id),
  );
}

function emergingCopyValues(
  evidence: EmergingThemeEvidence,
): Record<string, string> {
  return {
    theme: evidence.content.shortName,
    elapsed: naturalElapsedDays(evidence.elapsedDays),
    adoption: `${(evidence.adoptionShare * 100).toFixed(1)}%`,
    winRate: `${(evidence.winRate * 100).toFixed(1)}%`,
    placementDays: String(evidence.placement.observedDays),
    placements: String(evidence.placement.placements),
    placementShare: `${(evidence.placement.placementShare * 100).toFixed(1)}%`,
    conversion: `${(evidence.placement.observedConversion * 100).toFixed(1)}%`,
  };
}

function makeEmergingThemeContextPosts(
  state: GameState,
  day: number,
): CommunityEvent[] {
  const candidates = emergingThemeCandidates(state, day);
  const collecting = candidates.find(
    (candidate) =>
      candidate.observedDays >= 1 &&
      candidate.observedDays < EMERGING_THEME_OFFICIAL_SAMPLE_DAYS &&
      candidate.elapsedDays < EMERGING_THEME_OFFICIAL_SAMPLE_DAYS,
  );
  if (collecting) {
    const values = emergingCopyValues(collecting);
    const cautiousCopy = EMERGING_THEME_CAUTION_COPY[
      keyedIndex(
        EMERGING_THEME_CAUTION_COPY.length,
        state.seed,
        "emerging-theme-caution",
        day,
        collecting.content.id,
      )
    ];
    const performanceBranch = emergingPerformanceBranch(collecting);
    const evaluationPool = emergingEvaluationCopyPool(
      performanceBranch,
      collecting.observedDays < EMERGING_THEME_PERFORMANCE_SAMPLE_DAYS,
    );
    const evaluationCopy = evaluationPool[
      keyedIndex(
        evaluationPool.length,
        state.seed,
        "emerging-theme-evaluation",
        day,
        collecting.content.id,
        performanceBranch,
      )
    ];
    return [
      {
        id: `daily-emerging-${collecting.debutDay}-${collecting.content.id}-${day}-caution`,
        day,
        category: "meta",
        type: "meta-analysis",
        themeId: collecting.content.id,
        body: fillCommunityCopy(cautiousCopy, values),
      },
      {
        id: `daily-emerging-${collecting.debutDay}-${collecting.content.id}-${day}-evaluation`,
        day,
        category: "meta",
        type: "meta-analysis",
        themeId: collecting.content.id,
        body: fillCommunityCopy(evaluationCopy, values),
      },
    ];
  }

  const reversals = candidates.flatMap((current) => {
    if (
      current.observedDays !== EMERGING_THEME_OFFICIAL_SAMPLE_DAYS ||
      current.elapsedDays !== EMERGING_THEME_OFFICIAL_SAMPLE_DAYS
    ) return [];
    const earlyEndDay = current.debutDay +
      EMERGING_THEME_PERFORMANCE_SAMPLE_DAYS - 1;
    const early = emergingThemeEvidenceAt(
      state,
      current.content.id,
      current.debutDay,
      earlyEndDay,
      EMERGING_THEME_PERFORMANCE_SAMPLE_DAYS,
    );
    if (!early) return [];
    const earlyTone = emergingPerformanceTone(early);
    const currentTone = emergingPerformanceTone(current);
    if (
      (earlyTone !== "weak" || currentTone !== "strong") &&
      (earlyTone !== "strong" || currentTone !== "weak")
    ) {
      return [];
    }
    return [{ current, earlyTone, currentTone }];
  });
  const reversal = reversals[0];
  if (!reversal) return [];
  const pool = reversal.currentTone === "strong"
    ? EMERGING_THEME_WEAK_TO_STRONG_COPY
    : EMERGING_THEME_STRONG_TO_WEAK_COPY;
  const copy = pool[
    keyedIndex(
      pool.length,
      state.seed,
      "emerging-theme-reversal",
      day,
      reversal.current.content.id,
      reversal.currentTone,
    )
  ];
  return [{
    id: `daily-emerging-${reversal.current.debutDay}-${reversal.current.content.id}-${day}-reversal`,
    day,
    category: "meta",
    type: "meta-analysis",
    themeId: reversal.current.content.id,
    body: fillCommunityCopy(copy, emergingCopyValues(reversal.current)),
  }];
}

function fatigueStage(state: GameState, day: number): 0 | 1 | 2 | 3 {
  if (day !== state.day) return 0;
  let stage: 0 | 1 | 2 | 3 = 0;
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (runtime.fatigue >= 82 || runtime.topStreakDays >= 75) return 3;
    if (runtime.fatigue >= 65 || runtime.topStreakDays >= 45) stage = Math.max(stage, 2) as 2;
    else if (runtime.fatigue >= 45 || runtime.topStreakDays >= 21) {
      stage = Math.max(stage, 1) as 1;
    }
  }
  return stage;
}

/** Read-only presentation signal; the engine never consumes community heat. */
export function getCommunityHeat(state: GameState, day: number): number {
  assertCommunityDay(state, day);
  const profile = getReleaseReactionProfile(state, day);
  const restriction = recentRestrictionDecision(state, day);
  const genericRestriction = recentGenericRestrictionDecision(state, day);
  const restrictionHeat = restriction
    ? ([96, 84, 70] as const)[restriction.age - 1]
    : 0;
  const genericRestrictionHeat = genericRestriction
    ? Math.min(
        100,
        ([98, 90, 80] as const)[genericRestriction.age - 1] +
          Math.min(
            4,
            Math.max(
              0,
              ...genericRestriction.anchors.map((anchor) =>
                Math.floor(anchor.affectedThemes.length / 3)
              ),
            ),
          ),
      )
    : 0;
  const eventWeights: Partial<Record<CommunityEventType, number>> = {
    "restriction-applied": 18,
    "cosmetic-restriction": 8,
    "counter-found": 14,
    "counter-tax": 12,
    "counter-adopted": 7,
    "top-theme-changed": 13,
    "restriction-demand": 5,
    "support-released": 12,
    "release-reaction": 12,
  };
  const eventHeat = state.community
    .filter(
      (event) => event.day === day && !isRestrictionDecisionEvent(event),
    )
    .reduce((sum, event) => sum + (eventWeights[event.type] ?? 3), 0);
  const current = historyAtOrBefore(state, day);
  const previous = historyAtOrBefore(state, day - 1);
  let turnoverHeat = 0;
  if (current && previous && current.day !== previous.day) {
    const ids = new Set([
      ...Object.keys(current.shares),
      ...Object.keys(previous.shares),
    ]);
    let turnover = 0;
    for (const themeId of ids) {
      turnover += Math.abs(
        (current.shares[themeId] ?? 0) - (previous.shares[themeId] ?? 0),
      );
    }
    turnoverHeat = Math.min(40, turnover * 90);
  }
  const fatigueHeat = [0, 18, 34, 52][fatigueStage(state, day)];
  const businessHeat = Math.max(
    0,
    ...businessCommunityContexts(state, day).map((context) => {
      switch (context.kind) {
        case "venture-backlash":
          return 100;
        case "campaign-backlash":
          return 96;
        case "pack-detected":
          return 100;
        case "tournament-backlash":
          return 94;
        case "venture-success":
          return 92;
        case "pack-rumor":
          return 88;
        case "tournament-success":
          return 82;
        case "venture-waiting":
          return 76;
        case "animation":
          return 72;
        case "tv-cm":
          return 64;
        case "store-tour":
          return 58;
        case "beginner-camp":
          return 62;
        case "local-league":
          return 68;
        case "reprint-campaign":
          return 64;
        case "collector-fair":
          return 66;
      }
    }),
  );
  return Math.round(
    Math.min(
      100,
      Math.max(
        profile.heat,
        restrictionHeat,
        genericRestrictionHeat,
        businessHeat,
        eventHeat + turnoverHeat,
        fatigueHeat,
      ),
    ),
  );
}

function historicalThemePool(state: GameState, day: number): WeightedTheme[] {
  let snapshot: GameState["history"][number] | undefined;
  for (const candidate of state.history) {
    if (
      candidate.day <= day &&
      (!snapshot || candidate.day > snapshot.day)
    ) {
      snapshot = candidate;
    }
  }

  if (snapshot) {
    const historical = Object.entries(snapshot.shares)
      .filter(
        ([themeId, share]) =>
          Boolean(THEME_BY_ID[themeId]) &&
          Number.isFinite(share) &&
          share > 0,
      )
      .map(([id, weight]) => ({ id, weight }));
    if (historical.length > 0) return historical;
  }

  const active = state.activeThemeIds
    .filter((themeId) => Boolean(THEME_BY_ID[themeId]))
    .map((id) => ({
      id,
      weight: Math.max(0, state.themes[id]?.share ?? 0),
    }));
  if (active.length > 0) return active;

  return [{ id: THEMES[0].id, weight: 1 }];
}

type BusinessCommunityKind = keyof typeof BUSINESS_CONTEXT_QUOTA;

type BusinessCommunityContext = {
  kind: BusinessCommunityKind;
  age: number;
  record: GameState["operations"]["records"][number];
  ventureAction?: VentureActionType;
  ventureFactor?: VentureRiskFactor;
};

function isVentureActionType(type: string): type is VentureActionType {
  return Object.prototype.hasOwnProperty.call(VENTURE_BUSINESS_COPY, type);
}

function businessCommunityContexts(
  state: GameState,
  day: number,
): BusinessCommunityContext[] {
  const contexts: BusinessCommunityContext[] = [];
  for (const record of state.operations.records) {
    if (isVentureActionType(record.type)) {
      const resolvedOutcome =
        record.outcome === "success" || record.outcome === "backlash";
      if (
        resolvedOutcome &&
        record.resolvedDay !== undefined &&
        day >= record.resolvedDay
      ) {
        const kind = record.outcome === "success"
          ? "venture-success"
          : "venture-backlash";
        const age = day - record.resolvedDay;
        if (age >= 0 && age < BUSINESS_CONTEXT_QUOTA[kind].length) {
          contexts.push({
            kind,
            age,
            record,
            ventureAction: record.type,
            ventureFactor: record.riskContext?.[
              record.outcome === "success" ? "primaryStrength" : "primaryRisk"
            ] ?? "execution",
          });
        }
        continue;
      }

      if (record.resolvedDay === undefined || day < record.resolvedDay) {
        const age = day - record.startedDay - 1;
        if (
          age >= 0 &&
          age < BUSINESS_CONTEXT_QUOTA["venture-waiting"].length
        ) {
          contexts.push({
            kind: "venture-waiting",
            age,
            record,
            ventureAction: record.type,
            ventureFactor: record.riskContext?.primaryRisk ?? "execution",
          });
        }
      }
      continue;
    }

    if (
      record.type === "pack-odds" &&
      record.outcome === "detected" &&
      record.resolvedDay !== undefined
    ) {
      const age = day - record.resolvedDay;
      if (age >= 0 && age < BUSINESS_CONTEXT_QUOTA["pack-detected"].length) {
        contexts.push({ kind: "pack-detected", age, record });
        continue;
      }
      if (day >= record.resolvedDay) continue;
    }
    if (
      record.type === "championship" &&
      (record.outcome === "success" || record.outcome === "backlash")
    ) {
      const age = day - (record.resolvedDay ?? record.startedDay);
      const kind = record.outcome === "success"
        ? "tournament-success"
        : "tournament-backlash";
      if (age >= 0 && age < BUSINESS_CONTEXT_QUOTA[kind].length) {
        contexts.push({ kind, age, record });
      }
      continue;
    }
    if (
      record.type === "pack-odds" &&
      record.appliedDay === day &&
      (record.resolvedDay === undefined || day < record.resolvedDay)
    ) {
      contexts.push({ kind: "pack-rumor", age: 0, record });
      continue;
    }
    if (
      record.type === "animation-promotion" ||
      record.type === "tv-cm" ||
      record.type === "store-tour" ||
      record.type === "beginner-camp" ||
      record.type === "local-league" ||
      record.type === "reprint-campaign" ||
      record.type === "collector-fair"
    ) {
      if (record.outcome === "backlash" && record.resolvedDay !== undefined) {
        const age = day - record.resolvedDay;
        if (
          age >= 0 &&
          age < BUSINESS_CONTEXT_QUOTA["campaign-backlash"].length
        ) {
          contexts.push({ kind: "campaign-backlash", age, record });
        }
        continue;
      }
      const age = day - record.startedDay - 1;
      const kind = record.type === "animation-promotion"
        ? "animation"
        : record.type;
      const withinReactionWindow = kind === "animation"
        ? day <= record.endsDay
        : age < BUSINESS_CONTEXT_QUOTA[kind].length;
      if (age >= 0 && withinReactionWindow) {
        contexts.push({ kind, age, record });
      }
    }
  }

  const priority: Record<BusinessCommunityKind, number> = {
    "venture-backlash": 0,
    "campaign-backlash": 1,
    "pack-detected": 2,
    "tournament-backlash": 3,
    "venture-success": 4,
    "tournament-success": 5,
    "venture-waiting": 6,
    "pack-rumor": 7,
    animation: 8,
    "tv-cm": 9,
    "store-tour": 10,
    "beginner-camp": 11,
    "local-league": 12,
    "reprint-campaign": 13,
    "collector-fair": 14,
  };
  return contexts.sort(
    (left, right) =>
      priority[left.kind] - priority[right.kind] ||
      right.record.startedDay - left.record.startedDay,
  );
}

function businessCommunityQuota(context: BusinessCommunityContext): number {
  if (context.kind === "animation") {
    return BUSINESS_CONTEXT_QUOTA.animation[context.age] ?? 2;
  }
  return BUSINESS_CONTEXT_QUOTA[context.kind][context.age] ?? 0;
}

function businessCommunityPool(
  context: BusinessCommunityContext,
): readonly string[] {
  switch (context.kind) {
    case "venture-waiting":
    case "venture-success":
    case "venture-backlash": {
      if (!context.ventureAction || !context.ventureFactor) return [];
      const stage = context.kind === "venture-waiting"
        ? VENTURE_BUSINESS_COPY[context.ventureAction].waiting
        : context.kind === "venture-success"
          ? VENTURE_BUSINESS_COPY[context.ventureAction].success
          : VENTURE_BUSINESS_COPY[context.ventureAction].backlash;
      return [...stage.core, ...stage.byFactor[context.ventureFactor]];
    }
    case "pack-detected":
      return PACK_ODDS_DETECTED_COPY;
    case "campaign-backlash":
      return CAMPAIGN_BACKLASH_COPY;
    case "tournament-backlash":
      return TOURNAMENT_BACKLASH_COPY;
    case "tournament-success":
      return TOURNAMENT_SUCCESS_COPY;
    case "pack-rumor":
      return PACK_ODDS_RUMOR_COPY;
    case "animation":
      return getAnimationPromotionCopy(
        context.age + 1,
        context.record.endsDay - context.record.startedDay,
      );
    case "tv-cm":
      return TV_CM_COPY;
    case "store-tour":
      return STORE_TOUR_COPY;
    case "beginner-camp":
      return BEGINNER_CAMP_COPY;
    case "local-league":
      return LOCAL_LEAGUE_COPY;
    case "reprint-campaign":
      return REPRINT_CAMPAIGN_COPY;
    case "collector-fair":
      return COLLECTOR_FAIR_COPY;
  }
}

function makeBusinessCommunityPosts(
  state: GameState,
  day: number,
  maximum: number,
  usedBodies: ReadonlySet<string>,
): CommunityEvent[] {
  const output: CommunityEvent[] = [];
  const bodies = new Set(usedBodies);
  const themePool = historicalThemePool(state, day);

  for (const context of businessCommunityContexts(state, day)) {
    const quota = businessCommunityQuota(context);
    const copyPool = businessCommunityPool(context);
    const start = keyedIndex(
      copyPool.length,
      state.seed,
      "business-community-copy",
      context.kind,
      context.record.id,
      day,
    );
    for (let index = 0; index < quota && output.length < maximum; index += 1) {
      let body = copyPool[(start + index) % copyPool.length];
      for (let offset = 1; bodies.has(body) && offset < copyPool.length; offset += 1) {
        body = copyPool[(start + index + offset) % copyPool.length];
      }
      if (bodies.has(body)) continue;

      const outputIndex = output.length;
      const chosen = chooseTheme(
        themePool,
        state.seed,
        day,
        outputIndex,
        `business-community-theme-${context.record.id}`,
      );
      const otherPool = themePool.filter((theme) => theme.id !== chosen.id);
      const related = otherPool.length > 0
        ? chooseTheme(
            otherPool,
            state.seed,
            day,
            outputIndex,
            `business-community-related-${context.record.id}`,
          )
        : undefined;
      const scandal =
        context.kind === "venture-backlash" ||
        context.kind === "campaign-backlash" ||
        context.kind === "pack-detected" ||
        context.kind === "tournament-backlash";
      const category: CommunityCategory = context.kind === "local-league"
        ? "meta"
        : context.kind.startsWith("venture")
        ? context.ventureAction === "season-overhaul" ? "meta" : "finance"
        : context.kind.startsWith("pack")
          ? "finance"
          : context.kind === "campaign-backlash"
            ? "finance"
          : context.kind.startsWith("tournament")
            ? "meta"
            : "release";
      output.push({
        id: `daily-business-${context.record.id}-${day}-${String(index + 1).padStart(2, "0")}`,
        day,
        category,
        type: scandal ? "business-scandal" : "business-reaction",
        themeId: chosen.id,
        ...(related ? { relatedThemeId: related.id } : {}),
        ...(context.record.risk === undefined ? {} : { value: context.record.risk }),
        body,
      });
      bodies.add(body);
    }
    if (output.length >= maximum) break;
  }
  return output;
}

function chooseTheme(
  pool: readonly WeightedTheme[],
  seed: number,
  day: number,
  index: number,
  purpose: string,
): WeightedTheme {
  const total = pool.reduce((sum, theme) => sum + theme.weight, 0);
  if (total <= 0) {
    return pool[keyedIndex(pool.length, seed, purpose, day, index)];
  }

  let cursor =
    (keyedUint(seed, purpose, day, index) / 4294967296) * total;
  for (const theme of pool) {
    cursor -= theme.weight;
    if (cursor <= 0) return theme;
  }
  return pool[pool.length - 1];
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

const DAILY_TEMPLATE_STEPS = Array.from(
  { length: DAILY_TEMPLATES.length - 1 },
  (_, index) => index + 1,
).filter((step) => greatestCommonDivisor(step, DAILY_TEMPLATES.length) === 1);

function templateFor(seed: number, day: number, index: number): DailyTemplate {
  const offset = keyedIndex(
    DAILY_TEMPLATES.length,
    seed,
    "daily-community-template-offset",
  );
  const step = DAILY_TEMPLATE_STEPS[
    keyedIndex(
      DAILY_TEMPLATE_STEPS.length,
      seed,
      "daily-community-template-step",
    )
  ];
  const slot = (day - 1) * POSTS_PER_DAY + index;
  return DAILY_TEMPLATES[(offset + slot * step) % DAILY_TEMPLATES.length];
}

function fillTemplate(
  template: DailyTemplate,
  values: Record<"theme" | "other" | "part" | "share" | "copies" | "day", string>,
) {
  return fillCommunityCopy(template.text, values);
}

function reprintReactionContext(
  state: GameState,
  day: number,
  product: ReleasedProduct,
): ReprintReactionContext | null {
  if (product.kind !== "reprint") return null;
  const genericCard = getGenericCard(product.cardId);
  const theme = THEME_BY_ID[product.themeId];
  const part = genericCard
    ? undefined
    : theme?.parts.find((candidate) => candidate.id === product.cardId) ??
      COMMUNITY_PART_BY_ID.get(product.cardId);
  const cardName = genericCard?.name ?? part?.name ?? product.cardId;
  const quote = genericCard
    ? null
    : getThemeCardMarketQuoteAtDay(
        state,
        product.themeId,
        product.cardId,
        day,
        1,
      );
  const currentPrice = quote?.price ?? Math.max(
    100,
    Math.round(
      product.referencePrice *
        getReprintSupplyMultiplier(state, product.cardId, day) /
        100,
    ) * 100,
  );
  const dropRate = product.referencePrice > 0
    ? Math.max(0, ((product.referencePrice - currentPrice) / product.referencePrice) * 100)
    : 0;
  const releaseDay = state.releaseHistory.find((batch) =>
    batch.products.some((candidate) => candidate.optionId === product.optionId)
  )?.day ?? Math.max(1, day - 1);
  const reprintCount = state.releaseHistory.reduce(
    (count, batch) =>
      count +
      (batch.day <= releaseDay
        ? batch.products.filter(
            (candidate) =>
              candidate.kind === "reprint" && candidate.cardId === product.cardId,
          ).length
        : 0),
    0,
  );
  return {
    cardName,
    cardId: product.cardId,
    themeName: theme?.shortName ?? "여러 덱",
    ...(genericCard ? { genericCardId: genericCard.id } : { partId: product.cardId }),
    referencePrice: product.referencePrice,
    currentPrice,
    dropRate,
    reprintCount: Math.max(1, reprintCount),
    collectorPrinting: Boolean(getCollectorCardProfile(product.cardId)),
    severeTrustBacklash: product.trustDelta <= -4,
    accessibilityUserGain: product.accessibilityUserGain,
    collectorUserLoss: product.collectorUserLoss,
  };
}

function isHighIllustrationMarketPart(
  state: GameState,
  day: number,
  themeId: ThemeId,
  part: PartContent,
): boolean {
  const collector = getCollectorCardProfile(part.id);
  if (!collector || collector.collectorAppeal < HIGH_ILLUSTRATION_COLLECTOR_DEMAND) {
    return false;
  }
  const quote = getThemeCardMarketQuoteAtDay(
    state,
    themeId,
    part.id,
    day,
    1,
  );
  return Boolean(
    quote &&
      quote.collectorLabel === "하이 일러스트" &&
      quote.price >= HIGH_ILLUSTRATION_MARKET_PRICE &&
      quote.collectorDemandScore >= HIGH_ILLUSTRATION_COLLECTOR_DEMAND,
  );
}

type HighIllustrationMarketSelection = { part: PartContent | null };

function highIllustrationMarketPartForProduct(
  state: GameState,
  day: number,
  product: ReleasedProduct,
  reprintContext: ReprintReactionContext | null = reprintReactionContext(
    state,
    day,
    product,
  ),
): HighIllustrationMarketSelection | null {
  if (product.kind === "generic") return null;
  if (reprintContext) {
    const collector = getCollectorCardProfile(reprintContext.cardId);
    return collector &&
        collector.collectorAppeal >= HIGH_ILLUSTRATION_COLLECTOR_DEMAND &&
        reprintContext.currentPrice >= HIGH_ILLUSTRATION_MARKET_PRICE
      ? { part: null }
      : null;
  }
  const parts = partsAvailableByDay(state, product.themeId, day);
  const part = parts.find((candidate) =>
    isHighIllustrationMarketPart(state, day, product.themeId, candidate)
  );
  return part ? { part } : null;
}

function fillReactionCopy(
  text: string,
  state: GameState,
  day: number,
  index: number,
  product: ReleasedProduct,
  daysSinceRestriction: number | null,
  supportContext: SupportReactionContext | null,
  reprintContext: ReprintReactionContext | null,
  preferredPart: PartContent | null = null,
): { body: string; partId?: string } {
  if (reprintContext) {
    return {
      body: fillCommunityCopy(text, {
        card: reprintContext.cardName,
        part: reprintContext.cardName,
        theme: reprintContext.themeName,
        oldPrice: `${Math.round(reprintContext.referencePrice).toLocaleString("ko-KR")}원`,
        newPrice: `${Math.round(reprintContext.currentPrice).toLocaleString("ko-KR")}원`,
        marketPrice: `${Math.round(reprintContext.currentPrice).toLocaleString("ko-KR")}원`,
        dropRate: reprintContext.dropRate.toFixed(1),
        reprintCount: String(reprintContext.reprintCount),
        userGain: reprintContext.accessibilityUserGain.toLocaleString("ko-KR"),
        collectorLoss: reprintContext.collectorUserLoss.toLocaleString("ko-KR"),
      }),
      partId: reprintContext.partId,
    };
  }
  if (product.kind === "generic") {
    const card = getGenericCard(product.genericCardId);
    const cardName = card?.name ?? product.genericCardId;
    return {
      body: fillCommunityCopy(text, {
        card: cardName,
        keyword: card ? getPlayKeywordLabel(card.keyword) : "범용",
        theme: cardName,
        part: cardName,
      }),
    };
  }
  const content = THEME_BY_ID[product.themeId];
  const availableParts = partsAvailableByDay(state, product.themeId, day);
  const fallbackPool = availableParts.length > 0
    ? availableParts
    : content.parts.slice(0, INITIAL_THEME_PART_COUNT);
  const fallbackPart = fallbackPool[
      keyedIndex(
        fallbackPool.length,
        state.seed,
        "release-reaction-part",
        day,
        index,
        product.optionId,
      )
    ];
  const newPart = supportContext && supportContext.newParts.length > 0
    ? supportContext.newParts[
        keyedIndex(
          supportContext.newParts.length,
          state.seed,
          "support-reaction-new-card",
          day,
          index,
          product.optionId,
        )
      ]
    : null;
  const oldPart = supportContext && supportContext.displacedOldParts.length > 0
    ? supportContext.displacedOldParts[
        keyedIndex(
          Math.min(3, supportContext.displacedOldParts.length),
          state.seed,
          "support-reaction-old-card",
          day,
          index,
          product.optionId,
        )
      ]
    : null;
  const part = preferredPart ?? newPart ?? fallbackPart;
  const newCard = newPart?.name ?? part.name;
  const oldCard = oldPart?.name ?? fallbackPart.name;
  const marketQuote = preferredPart
    ? getThemeCardMarketQuoteAtDay(
        state,
        product.themeId,
        preferredPart.id,
        day,
        1,
      )
    : null;
  return {
    body: fillCommunityCopy(text, {
      theme: content.shortName,
      part: part.name,
      days: String(daysSinceRestriction ?? 0),
      share: `${((supportContext?.share ?? 0) * 100).toFixed(1)}%`,
      supportNo: String(supportContext?.supportNumber ?? 1),
      newCard,
      oldCard,
      marketPrice: marketQuote
        ? `${marketQuote.price.toLocaleString("ko-KR")}원`
        : `${HIGH_ILLUSTRATION_MARKET_PRICE.toLocaleString("ko-KR")}원대`,
    }),
    partId: part.id,
  };
}

function reactionCopyPool(
  product: ReleasedProduct,
  age: number,
  daysSinceRestriction: number | null,
  preferArt: boolean,
  index: number,
  forceProductTone: boolean,
  supportContext: SupportReactionContext | null,
  reprintContext: ReprintReactionContext | null,
): readonly string[] {
  const lifecycleIndex = age - 1;
  if (preferArt) return HIGH_ILLUSTRATION_MARKET_COPY;
  if (reprintContext) {
    if (preferArt) return REPRINT_ART_COPY;
    const price = reprintContext.dropRate >= 25
      ? REPRINT_PRICE_CRASH_COPY
      : REPRINT_LIFECYCLE_COPY[lifecycleIndex];
    const collector =
      reprintContext.collectorPrinting ||
        reprintContext.severeTrustBacklash ||
        reprintContext.collectorUserLoss > 0
        ? REPRINT_COLLECTOR_BACKLASH_COPY
        : REPRINT_ACCESSIBILITY_COPY;
    const repeat = reprintContext.reprintCount >= 2
      ? REPRINT_REPEAT_COPY
      : REPRINT_ACCESSIBILITY_COPY;
    const lifecycle = REPRINT_LIFECYCLE_COPY[lifecycleIndex];
    const routing = age === 1
      ? [
          REPRINT_ACCESSIBILITY_COPY,
          price,
          collector,
          lifecycle,
          REPRINT_ACCESSIBILITY_COPY,
          repeat,
          price,
          collector,
        ]
      : age === 2
        ? [lifecycle, price, REPRINT_ACCESSIBILITY_COPY, collector, repeat, lifecycle]
        : [lifecycle, REPRINT_ACCESSIBILITY_COPY, price, repeat, collector];
    return routing[index % routing.length];
  }
  if (product.kind === "generic") {
    return preferArt
      ? GENERIC_RELEASE_ART_COPY[lifecycleIndex]
      : GENERIC_RELEASE_COPY[lifecycleIndex];
  }
  let selected: readonly string[];
  if (preferArt) selected = RELEASE_ART_COPY[lifecycleIndex];
  else if (daysSinceRestriction !== null) selected = BACKLASH_RELEASE_COPY;
  else if (supportContext) selected = supportReactionCopyPool(supportContext);
  else if (!forceProductTone && index % 4 === 1) selected = CASUAL_RELEASE_COPY;
  else if (!forceProductTone && index % 4 === 3) selected = SPECTATOR_RELEASE_COPY;
  else if (!forceProductTone && age > 0 && index % 3 === 0) {
    selected = RELEASE_LIFECYCLE_COPY[lifecycleIndex];
  } else {
    const greed = isGreedRelease(product);
    const weak = isWeakRelease(product);
    selected = greed && weak
      ? index % 2 === 0
        ? STRONG_RELEASE_COPY
        : WEAK_RELEASE_COPY
      : greed
        ? STRONG_RELEASE_COPY
        : weak
          ? WEAK_RELEASE_COPY
          : lifecycleIndex > 0
            ? RELEASE_LIFECYCLE_COPY[lifecycleIndex]
            : BALANCED_RELEASE_COPY;
  }
  if (product.kind !== "new-theme") return selected;
  const withoutOfficialTierClaim = selected.filter(
    (copy) => !containsOfficialTierNumberClaim(copy),
  );
  return withoutOfficialTierClaim.length > 0
    ? withoutOfficialTierClaim
    : BALANCED_RELEASE_COPY;
}

function makeReleaseContextPost(
  state: GameState,
  day: number,
  age: number,
  product: ReleasedProduct,
  outputIndex: number,
  preferArt: boolean,
  usedBodies: ReadonlySet<string>,
  forceProductTone = false,
): CommunityEvent {
  const releaseDay = day - age;
  const daysSinceRestriction = restrictionAge(
    state,
    releaseDay,
    product,
  );
  const supportContext = supportReactionContext(state, releaseDay, product);
  const reprintContext = reprintReactionContext(state, day, product);
  const artSelection = preferArt
    ? highIllustrationMarketPartForProduct(
        state,
        day,
        product,
        reprintContext,
      )
    : null;
  const useArt = artSelection !== null;
  const routedPool = reactionCopyPool(
    product,
    age,
    daysSinceRestriction,
    useArt,
    outputIndex,
    forceProductTone,
    supportContext,
    reprintContext,
  );
  const nonIllustrationPool = routedPool.filter(
    (copy) => !ILLUSTRATION_DISCUSSION.test(copy),
  );
  const fallbackPool = RELEASE_LIFECYCLE_COPY[age - 1].filter(
    (copy) => !ILLUSTRATION_DISCUSSION.test(copy),
  );
  const pool = useArt
    ? routedPool
    : nonIllustrationPool.length > 0
      ? nonIllustrationPool
      : fallbackPool;
  const keyedStart = keyedIndex(
    pool.length,
    state.seed,
    "release-reaction-copy",
    day,
    outputIndex,
    product.optionId,
    useArt ? "art" : "play",
  );
  const start =
    daysSinceRestriction !== null && forceProductTone ? 0 : keyedStart;
  let selected = fillReactionCopy(
    pool[start],
    state,
    day,
    outputIndex,
    product,
    daysSinceRestriction,
    supportContext,
    reprintContext,
    artSelection?.part ?? null,
  );
  for (let offset = 1; offset < pool.length; offset += 1) {
    if (!usedBodies.has(selected.body)) break;
    selected = fillReactionCopy(
      pool[(start + offset) % pool.length],
      state,
      day,
      outputIndex,
      product,
      daysSinceRestriction,
      supportContext,
      reprintContext,
      artSelection?.part ?? null,
    );
  }

  return {
    id: `daily-release-${day - age}-${product.optionId}-${age}-${String(
      outputIndex + 1,
    ).padStart(2, "0")}-${useArt ? "art" : "play"}`,
    day,
    category: "release",
    type: product.kind === "support" ? "support-released" : "release-reaction",
    themeId:
      product.kind === "generic"
        ? state.community.find(
            (event) =>
              event.day === releaseDay + 1 &&
              event.type === "release-reaction" &&
              event.genericCardId === product.genericCardId,
          )?.themeId ??
          state.history.find((entry) => entry.day === releaseDay)?.topThemeId ??
          state.currentTopThemeId
        : product.themeId,
    genericCardId:
      product.kind === "generic"
        ? product.genericCardId
        : reprintContext?.genericCardId,
    partId: selected.partId,
    value: product.powerAdjustment,
    body: selected.body,
  };
}

function releaseProductForContextEvent(
  products: readonly ReleasedProduct[],
  event: CommunityEvent,
): ReleasedProduct | undefined {
  if (event.genericCardId) {
    return products.find(
      (product) =>
        (product.kind === "generic" &&
          product.genericCardId === event.genericCardId) ||
        (product.kind === "reprint" &&
          product.cardId === event.genericCardId),
    );
  }
  if (event.partId) {
    const reprint = products.find(
      (product) => product.kind === "reprint" && product.cardId === event.partId,
    );
    if (reprint) return reprint;
  }
  if (event.type === "support-released") {
    return products.find(
      (product) => product.kind === "support" && product.themeId === event.themeId,
    );
  }
  return products.find(
    (product) => product.kind === "new-theme" && product.themeId === event.themeId,
  );
}

function loyaltyPost(
  state: GameState,
  day: number,
  outputIndex: number,
): CommunityEvent | null {
  const candidates = state.releaseHistory.flatMap((batch) =>
    batch.products
      .filter(isThemeReleaseProduct)
      .filter((product) => {
        const content = THEME_BY_ID[product.themeId];
        if (!content || content.appeal < 70 || day - batch.day < 5) return false;
        const period = Math.max(4, Math.round(12 - (content.appeal - 70) / 3));
        return (day - batch.day) % period === 0;
      })
      .map((product) => ({ product, releaseDay: batch.day })),
  );
  if (candidates.length === 0) return null;
  const chosen = candidates[
    keyedIndex(candidates.length, state.seed, "loyalty-theme", day)
  ];
  const copy = LOYALTY_COPY[
    keyedIndex(
      LOYALTY_COPY.length,
      state.seed,
      "loyalty-copy",
      day,
      chosen.product.optionId,
    )
  ];
  const filled = fillReactionCopy(
    copy,
    state,
    day,
    outputIndex,
    chosen.product,
    null,
    null,
    null,
  );
  return {
    id: `daily-loyalty-${chosen.releaseDay}-${chosen.product.optionId}-${day}`,
    day,
    category: "release",
    type: "theme-popularity",
    themeId: chosen.product.themeId,
    partId: filled.partId,
    body: filled.body,
  };
}

function fatiguePost(
  state: GameState,
  day: number,
): CommunityEvent | null {
  const stage = fatigueStage(state, day);
  if (stage === 0) return null;
  const candidates = state.activeThemeIds
    .map((themeId) => ({ themeId, runtime: state.themes[themeId] }))
    .filter(({ runtime }) => {
      if (stage === 3) return runtime.fatigue >= 82 || runtime.topStreakDays >= 75;
      if (stage === 2) return runtime.fatigue >= 65 || runtime.topStreakDays >= 45;
      return runtime.fatigue >= 45 || runtime.topStreakDays >= 21;
    })
    .sort(
      (left, right) =>
        right.runtime.fatigue + right.runtime.topStreakDays * 0.45 -
        (left.runtime.fatigue + left.runtime.topStreakDays * 0.45),
    );
  const chosen = candidates[0];
  if (!chosen) return null;
  const content = THEME_BY_ID[chosen.themeId];
  const pool = FATIGUE_COPY[stage - 1];
  const body = fillCommunityCopy(
    pool[
      keyedIndex(pool.length, state.seed, "fatigue-copy", day, chosen.themeId, stage)
    ],
    { theme: content.shortName },
  );
  return {
    id: `daily-fatigue-${day}-${chosen.themeId}-${stage}`,
    day,
    category: stage === 3 ? "restriction" : "meta",
    type: stage === 3 ? "restriction-demand" : "meta-analysis",
    themeId: chosen.themeId,
    body,
  };
}

/**
 * Builds a read-only twenty-post board snapshot for a historical campaign day.
 * Business crises and event reactions take priority, followed by engine-authored
 * events. Synthetic chatter is never persisted.
 */
export function getDailyCommunityPosts(
  state: GameState,
  day: number,
): CommunityEvent[] {
  assertCommunityDay(state, day);

  // DAY 1–45 is a fixed authored handover. Once the first restriction list
  // mints a random mandate seed, historical prologue boards must not be
  // silently reshuffled when the player looks back at them.
  if (day <= FIRST_BAN_DAY && state.seed !== PROLOGUE_SEED) {
    return getDailyCommunityPosts({ ...state, seed: PROLOGUE_SEED }, day);
  }

  const allSpecialPosts = state.community
    .filter(
      (event) => event.day === day && !isRestrictionDecisionEvent(event),
    )
    .slice(0, POSTS_PER_DAY)
    .map((event) => ({ ...event }));
  const restrictionContext = recentRestrictionDecision(state, day);
  const genericRestrictionContext = recentGenericRestrictionDecision(state, day);
  const hasRestrictionContext = Boolean(
    restrictionContext || genericRestrictionContext,
  );
  const restrictionFollowup = hasRestrictionContext
    ? undefined
    : narrowRestrictionFollowup(state, day);
  const emergingThemePosts = makeEmergingThemeContextPosts(state, day);
  const keywordCommunitySignal = getKeywordCommunitySignal(state, day);
  const output: CommunityEvent[] = [];
  const usedBodies = new Set<string>();
  const finalize = (): CommunityEvent[] => {
    const regularLimit = Math.max(0, POSTS_PER_DAY - emergingThemePosts.length);
    const finalized = emergingThemePosts.length === 0
      ? [...output]
      : [...output.slice(0, regularLimit), ...emergingThemePosts];
    if (!keywordCommunitySignal) return finalized;
    // Replace one synthetic voice after selection so special-event quotas,
    // post count, and the deterministic template walk all stay unchanged.
    const replaceIndex = finalized.findLastIndex((event) =>
      event.id.startsWith("daily-generated-"),
    );
    if (replaceIndex < 0) return finalized;
    finalized[replaceIndex] = keywordCommunitySignal;
    return finalized;
  };
  for (const post of makeBusinessCommunityPosts(
    state,
    day,
    POSTS_PER_DAY,
    usedBodies,
  )) {
    output.push(post);
    usedBodies.add(post.body);
  }
  if (output.length === POSTS_PER_DAY) return finalize();
  const businessPostCount = output.length;
  if (genericRestrictionContext) {
    const target = restrictionContext
      ? ([10, 9, 8] as const)[genericRestrictionContext.age - 1]
      : GENERIC_RESTRICTION_CONTEXT_QUOTA[genericRestrictionContext.age - 1];
    const existingContext = allSpecialPosts
      .filter((event) =>
        isGenericRestrictionContextEvent(event, genericRestrictionContext)
      )
      .slice(0, target);
    for (let index = 0; index < existingContext.length; index += 1) {
      if (output.length >= POSTS_PER_DAY) break;
      const event = existingContext[index];
      const anchor = genericRestrictionContext.anchors.find(
        (candidate) => candidate.card.id === event.genericCardId,
      );
      if (!anchor) continue;
      const contextual = makeGenericRestrictionContextPost(
        state,
        genericRestrictionContext,
        index,
        usedBodies,
        anchor,
      );
      output.push({
        ...event,
        body: contextual.body,
        value: contextual.value,
        previousValue: contextual.previousValue,
      });
      usedBodies.add(contextual.body);
    }
    let contextualRestrictionCount = output.length - businessPostCount;
    while (
      contextualRestrictionCount < target &&
      output.length < POSTS_PER_DAY
    ) {
      const contextual = makeGenericRestrictionContextPost(
        state,
        genericRestrictionContext,
        contextualRestrictionCount,
        usedBodies,
      );
      output.push(contextual);
      usedBodies.add(contextual.body);
      contextualRestrictionCount += 1;
    }
  }
  if (restrictionContext) {
    const restrictionSignals = getPublishedRestrictionDecisionSignals(
      state,
      restrictionContext.decisionDay,
    );
    const target = genericRestrictionContext
      ? GENERIC_RESTRICTION_CONTEXT_QUOTA[restrictionContext.age - 1]
      : RESTRICTION_CONTEXT_QUOTA[restrictionContext.age - 1];
    const existingContext = allSpecialPosts
      .filter((event) => isRestrictionContextEvent(event, restrictionContext))
      .slice(0, target);
    for (let index = 0; index < existingContext.length; index += 1) {
      if (output.length >= POSTS_PER_DAY) break;
      const event = existingContext[index];
      const anchor = restrictionContext.anchors.find(
        (candidate) =>
          candidate.content.id === event.themeId &&
          candidate.part.id === event.partId,
      );
      if (!anchor) continue;
      const contextual = makeRestrictionContextPost(
        state,
        restrictionContext,
        index,
        usedBodies,
        restrictionSignals,
        anchor,
      );
      output.push({
        ...event,
        body: contextual.body,
        value: contextual.value,
        previousValue: contextual.previousValue,
      });
      usedBodies.add(contextual.body);
    }
    let contextualRestrictionCount = output.length - businessPostCount;
    while (
      contextualRestrictionCount < target &&
      output.length < POSTS_PER_DAY
    ) {
      const contextual = makeRestrictionContextPost(
        state,
        restrictionContext,
        contextualRestrictionCount,
        usedBodies,
        restrictionSignals,
      );
      output.push(contextual);
      usedBodies.add(contextual.body);
      contextualRestrictionCount += 1;
    }
    if (
      restrictionContext.anchors.some(
        (anchor) => anchor.assessment === "no-change",
      )
    ) {
      const stale = makeStaleRestrictionPosts(state, day, false, 2);
      for (let index = 0; index < stale.length; index += 1) {
        const replacementIndex = businessPostCount + index;
        if (replacementIndex >= POSTS_PER_DAY) break;
        const replaced = output[replacementIndex];
        if (replaced) usedBodies.delete(replaced.body);
        const post = stale[index];
        const prioritized = {
          ...post,
          id: `daily-restriction-${restrictionContext.decisionDay}-stale-${post.themeId}-${post.partId}-${restrictionContext.age}`,
        };
        output[replacementIndex] = prioritized;
        usedBodies.add(prioritized.body);
      }
    }
    const remainingSpecial = allSpecialPosts.filter(
      (event) =>
        !isRestrictionContextEvent(event, restrictionContext) &&
        (!genericRestrictionContext ||
          !isGenericRestrictionContextEvent(event, genericRestrictionContext)),
    );
    for (const event of remainingSpecial) {
      if (output.length >= POSTS_PER_DAY) break;
      output.push(event);
      usedBodies.add(event.body);
    }
  } else {
    const remainingSpecial = genericRestrictionContext
      ? allSpecialPosts.filter((event) =>
          !isGenericRestrictionContextEvent(event, genericRestrictionContext)
        )
      : allSpecialPosts;
    for (const event of remainingSpecial) {
      if (output.length >= POSTS_PER_DAY) break;
      output.push(event);
      usedBodies.add(event.body);
    }
  }
  if (restrictionFollowup) {
    const followupCount = Math.min(3, POSTS_PER_DAY - output.length);
    for (let index = 0; index < followupCount; index += 1) {
      const post = makeNarrowRestrictionFollowupPost(
        state,
        day,
        restrictionFollowup,
        index,
        usedBodies,
      );
      output.push(post);
      usedBodies.add(post.body);
    }
  }
  if (output.length === POSTS_PER_DAY) return finalize();

  const recentRelease = releaseBatchNearDay(state, day);
  if (recentRelease && !hasRestrictionContext) {
    const existingContext = output.filter(
      (event) =>
        (event.type === "release-reaction" || event.type === "support-released") &&
        Boolean(releaseProductForContextEvent(recentRelease.batch.products, event)),
    );
    for (let index = 0; index < existingContext.length; index += 1) {
      const event = existingContext[index];
      const product = releaseProductForContextEvent(
        recentRelease.batch.products,
        event,
      );
      if (!product) continue;
      const contextual = makeReleaseContextPost(
        state,
        day,
        recentRelease.age,
        product,
        index,
        false,
        usedBodies,
        true,
      );
      usedBodies.delete(event.body);
      event.body = contextual.body;
      event.partId = contextual.partId;
      event.genericCardId = contextual.genericCardId;
      event.value = product.powerAdjustment;
      usedBodies.add(event.body);
    }

    const lifecycleIndex = recentRelease.age - 1;
    const target = RELEASE_CONTEXT_QUOTA[lifecycleIndex];
    const needed = Math.min(
      POSTS_PER_DAY - output.length,
      Math.max(0, target - existingContext.length),
    );
    let highIllustrationPostAdded = false;
    const productOffset = keyedIndex(
      recentRelease.batch.products.length,
      state.seed,
      "release-reaction-product-offset",
      recentRelease.batch.day,
      recentRelease.age,
    );
    for (let index = 0; index < needed; index += 1) {
      const product =
        recentRelease.batch.products[
          (productOffset + index) % recentRelease.batch.products.length
        ];
      const preferArt = !highIllustrationPostAdded &&
        highIllustrationMarketPartForProduct(state, day, product) !== null;
      const post = makeReleaseContextPost(
        state,
        day,
        recentRelease.age,
        product,
        output.length,
        preferArt,
        usedBodies,
      );
      output.push(post);
      usedBodies.add(post.body);
      if (post.id.endsWith("-art")) highIllustrationPostAdded = true;
    }
  }

  if (!recentRelease && !hasRestrictionContext && output.length < POSTS_PER_DAY) {
    for (const post of makeStaleRestrictionPosts(state, day, true, 2)) {
      if (output.length >= POSTS_PER_DAY || usedBodies.has(post.body)) break;
      output.push(post);
      usedBodies.add(post.body);
    }
  }

  if (output.length < POSTS_PER_DAY) {
    const fatigue = fatiguePost(state, day);
    if (fatigue && !usedBodies.has(fatigue.body)) {
      output.push(fatigue);
      usedBodies.add(fatigue.body);
    }
  }

  if (output.length < POSTS_PER_DAY) {
    const loyalty = loyaltyPost(state, day, output.length);
    if (loyalty && !usedBodies.has(loyalty.body)) {
      output.push(loyalty);
      usedBodies.add(loyalty.body);
    }
  }

  const pool = historicalThemePool(state, day);
  const poolTotal = pool.reduce((sum, theme) => sum + theme.weight, 0) || 1;
  const missing = POSTS_PER_DAY - output.length;

  for (let index = 0; index < missing; index += 1) {
    const outputIndex = output.length;
    let template = templateFor(state.seed, day, outputIndex);
    const templateKey = template.key;
    const chosen = chooseTheme(
      pool,
      state.seed,
      day,
      outputIndex,
      "daily-community-theme",
    );
    const content = THEME_BY_ID[chosen.id];
    const availableParts = partsAvailableByDay(state, content.id, day);
    const partPool = availableParts.length > 0
      ? availableParts
      : content.parts.slice(0, INITIAL_THEME_PART_COUNT);
    const part =
      partPool[
        keyedIndex(
          partPool.length,
          state.seed,
          "daily-community-part",
          day,
          outputIndex,
          chosen.id,
        )
      ];
    const otherPool = pool.filter((theme) => theme.id !== chosen.id);
    const related =
      otherPool.length > 0
        ? chooseTheme(
            otherPool,
            state.seed,
            day,
            outputIndex,
            "daily-community-related",
          )
        : chosen;
    const relatedContent = THEME_BY_ID[related.id];
    if (
      containsOfficialTierNumberClaim(template.text) &&
      (
        isCollectingNewThemeAtDay(state, chosen.id, day) ||
        isCollectingNewThemeAtDay(state, related.id, day)
      )
    ) {
      const templateIndex = DAILY_TEMPLATES.indexOf(template);
      for (let offset = 1; offset < DAILY_TEMPLATES.length; offset += 1) {
        const candidate = DAILY_TEMPLATES[
          (templateIndex + offset) % DAILY_TEMPLATES.length
        ];
        if (!containsOfficialTierNumberClaim(candidate.text)) {
          template = candidate;
          break;
        }
      }
    }
    if (ILLUSTRATION_DISCUSSION.test(template.text)) {
      const collecting =
        isCollectingNewThemeAtDay(state, chosen.id, day) ||
        isCollectingNewThemeAtDay(state, related.id, day);
      const isSafeFallback = (candidate: DailyTemplate) =>
        !ILLUSTRATION_DISCUSSION.test(candidate.text) &&
        (!collecting || !containsOfficialTierNumberClaim(candidate.text));
      const sameConversation = DAILY_TEMPLATES.filter(
        (candidate) => candidate.group === template.group && isSafeFallback(candidate),
      );
      const fallbackCandidates = sameConversation.length > 0
        ? sameConversation
        : DAILY_TEMPLATES.filter(isSafeFallback);
      template = fallbackCandidates[
        keyedIndex(
          fallbackCandidates.length,
          state.seed,
          "non-illustration-template-fallback",
          day,
          outputIndex,
          templateKey,
        )
      ];
    }
    const share = `${((chosen.weight / poolTotal) * 100).toFixed(1)}%`;

    output.push({
      id: `daily-generated-${(state.seed >>> 0).toString(16)}-${day}-${String(
        outputIndex + 1,
      ).padStart(2, "0")}-${templateKey}`,
      day,
      category: template.category,
      // Ordinary board copy may debate a future restriction, but only the
      // scheduled decision pipeline may publish an applied restriction type.
      type: isRestrictionDecisionType(template.type)
        ? "restriction-demand"
        : template.type,
      themeId: chosen.id,
      partId: part.id,
      relatedThemeId:
        related.id === chosen.id ? undefined : related.id,
      body: fillTemplate(template, {
        theme: content.shortName,
        other: relatedContent.shortName,
        part: part.name,
        share,
        copies: String(part.preferredCopies),
        day: String(day),
      }),
    });
  }

  return finalize();
}
