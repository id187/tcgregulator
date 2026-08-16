import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
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
const RESTRICTION_CONTEXT_QUOTA = [16, 14, 12] as const;

const ROLE_EXPONENT: Record<PartContent["role"], number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

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

/** Eight board-like voices in each of eight subjects: 64 templates total. */
const DAILY_TEMPLATES = [
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
    type: "cosmetic-restriction",
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
] as const;

const CASUAL_RELEASE_COPY = [
  "퇴근하고 두 판 했는데 상대가 둘 다 {theme}. 벌써 좀 피곤하다",
  "복잡한 계산은 모르겠고 {part} 나오면 내 턴이 너무 늦게 옴",
  "친구랑 가볍게 하려는데 신카드 체급 차이가 바로 느껴지네",
  "{theme} 세긴 한데 전개 길어서 직접 맞추고 싶진 않음",
  "일러는 취향인데 입문자가 굴리기엔 너무 어려워 보인다",
  "대회 말고 매장 프리에서도 {theme}만 보이는 건 좀 그렇다",
] as const;

const SPECTATOR_RELEASE_COPY = [
  "방송 한 판 봤는데 {theme} 무조건 금지감임 반박 안 받음",
  "덱리는 안 봤는데 짤만 보면 {part} 한 장으로 다 이기는 거 아님?",
  "오늘 커뮤니티 분위기 보니까 역대급 망발매 확정 ㅋㅋ",
  "{theme} 잘 모르지만 다들 화났으니 일단 운영 잘못인 듯",
  "대회 결과 나오기 전인데 벌써 게임 망했다는 글 백 개 봄",
  "신카드 영상 제목들 전부 ‘환경 파괴’인 거 웃기네",
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
] as const;

const RELEASE_LIFECYCLE_COPY = [
  [
    "출시 하루 만에 {part} 정답 매수 벌써 나온 것처럼 말하네",
    "이건 연구 전에도 센 게 보인다 ㅋㅋ",
    "약하다는 평 많던데 직접 굴리니 더 애매함",
  ],
  [
    "하루 굴려 보니까 첫인상보다 {theme} 고점이 높다",
    "어제 사기라던 {theme}, 패 말림도 꽤 있네",
    "밤새 새 전개 올라와서 첫날 덱리 벌써 구형 됨",
    "발매 하루 만에 {part} 매물 씨가 말랐음",
  ],
  [
    "이틀차 {theme} 리스트는 안정성 쪽으로 굳는 듯",
    "초견살 빠지니까 대응할 구간이 보이네",
    "약한 줄 알았는데 숙련자 잡으니 완전 다른 덱임",
    "첫 소규모 대회 결과에 {theme} 바로 올라왔네",
  ],
  [
    "{theme} 초기 평가는 이제 대충 굳은 것 같다",
    "발매 열기 빠지니 실제 체급이 보이네",
    "이번 주말 대회가 진짜 판정대일 듯",
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
  ],
  [
    "실물 {part} 색감 때문에 성능 상관없이 갖고 싶다",
    "{theme} 첫날 팬아트 속도 무슨 일이냐",
    "카드 모아 놓으니까 {theme} 한 페이지가 진짜 예쁨",
    "어제 성능 보고 고민했는데 일러 보고 결국 샀다",
  ],
  [
    "성능 논쟁 끝나도 {theme} 캐릭터 얘기는 계속 나오네",
    "설정 파는 사람들 때문에 {theme} 팬덤 더 커질 듯",
    "{part} 일러 디테일 이제 발견했는데 미쳤다",
  ],
  [
    "메타 평가는 갈려도 {theme} 일러 평가는 만장일치네",
    "{theme} 굿즈부터 찾는 사람들 벌써 생겼네",
  ],
] as const;

const LOYALTY_COPY = [
  "{theme} 티어 내려가도 나는 계속 굴린다",
  "신테마 또 나와도 결국 다시 잡게 되는 건 {theme}",
  "성능 말고 카드 분위기 때문에 잡는 덱도 있는 거지",
  "{part} 볼 때마다 이 테마 고른 건 후회 안 함",
  "지원 없어도 연구글 꾸준히 올리는 {theme} 팬들 대단하다",
  "입상은 줄었어도 매장에 {theme} 고정 유저 꼭 한 명씩 있음",
] as const;

const FATIGUE_COPY = [
  [
    "또 상대가 {theme}. 요즘 세 판에 한 번은 만나는 듯",
    "강한 건 둘째치고 대회표에 {theme} 이름이 너무 많다",
    "이번 주도 1위 {theme}? 슬슬 새 얼굴 보고 싶음",
    "{theme} 상대법 외우는 게 게임 입문 과정이 돼 버렸네",
    "테마 자체는 좋은데 너무 자주 봐서 좀 질린다",
  ],
  [
    "게임 켜기 전부터 {theme} 만날 생각에 피곤함",
    "카운터 넣어도 계속 {theme} 기준으로 덱 짜는 게 더 문제다",
    "친선에서도 {theme}, 대회에서도 {theme}; 다른 덱은 언제 보냐",
    "환경 다양성 얘기할 때 이제 {theme}부터 정리해야 함",
    "{theme} 유저들도 미러전만 잡혀서 지겹다던데",
  ],
  [
    "또 {theme}? 오늘은 그냥 게임 끈다",
    "다음 금제에도 {theme} 멀쩡하면 운영 의도 뻔하지",
    "카드명만 보여도 피곤한 단계까지 왔다",
    "이건 1등 테마가 아니라 환경 전체를 잡아먹은 테마다",
    "카운터도 연구도 충분히 했는데 계속 1위면 이제 금제할 때임",
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
] as const;

const RESTRICTION_CONSISTENCY_COPY = [
  "{theme} 발매 {days}일 만에 핵심을 자르면 누가 다음 팩을 예약함?",
  "신카드 팔 때는 문제없다더니 판매 끝나자마자 금제네",
  "곧 지원 나온다면서 지금 핵심 파츠 자르는 순서가 맞나",
  "금제로 비워 놓고 다음 지원으로 다시 채우면 이럴 거면 왜 자름?",
  "{theme} 지원 일정 알고도 이 금제를 냈다면 기준이 더 궁금해짐",
  "최근 제품만 보호하고 오래된 파츠에 책임 돌리는 느낌",
  "한쪽에서는 파워 인플레, 다른 쪽에서는 구매 신뢰 관리라니 말이 안 맞음",
  "금제와 발매가 따로 움직이는 게 아니라는 의심만 커진다",
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
] as const;

type WeightedTheme = {
  id: ThemeId;
  weight: number;
};

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

function keyedIndex(
  length: number,
  seed: number,
  ...keys: Array<string | number>
) {
  if (length <= 1) return 0;
  return keyedUint(seed, ...keys) % length;
}

type ReleasedProduct = GameState["releaseHistory"][number]["products"][number];

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

function assertCommunityDay(state: GameState, day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > state.day) {
    throw new RangeError(`Community day must be an integer from 1 to ${state.day}.`);
  }
}

function isRestrictionDecisionEvent(event: CommunityEvent): boolean {
  return (
    event.day >= 45 &&
    (event.day - 45) % 90 === 0 &&
    (event.type === "restriction-applied" ||
      event.type === "cosmetic-restriction" ||
      event.type === "restriction-no-change")
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
      const body = STALE_RESTRICTION_COPY[
        (start + index) % STALE_RESTRICTION_COPY.length
      ]
        .replaceAll("{theme}", candidate.content.shortName)
        .replaceAll("{part}", candidate.part.name)
        .replaceAll("{limit}", String(candidate.limit))
        .replaceAll("{restrictedDays}", String(candidate.restrictedDays))
        .replaceAll("{share}", `${(candidate.share * 100).toFixed(1)}%`)
        .replaceAll("{rank}", String(candidate.rank));
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
};

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

    const anchors: RestrictionAnchor[] = provisional.map((anchor) => {
      const totalImpact = totalImpactByTheme.get(anchor.content.id) ?? 0;
      const cutCount = cutsByTheme.get(anchor.content.id) ?? 0;
      const runtime = state.themes[anchor.content.id];
      const snapshot = historyAtOrBefore(state, decisionDay);
      const decisionShare =
        snapshot?.shares[anchor.content.id] ?? runtime?.share ?? 0;
      const noChangeConcern =
        anchor.event.type === "restriction-no-change" &&
        (decisionShare >= 0.24 ||
          (runtime?.unpleasantness ?? 0) >= 68 ||
          (runtime?.fatigue ?? 0) >= 65 ||
          (runtime?.topStreakDays ?? 0) >= 45);
      const assessment: RestrictionAssessment =
        anchor.direction === "loosen"
          ? "unban"
          : anchor.event.type === "restriction-no-change"
          ? "no-change"
          : anchor.availabilityDelta <= 1e-6 || anchor.impact < 3.5
          ? "cosmetic"
          : anchor.newLimit === 0 ||
              anchor.impact >= 11 ||
              (cutCount >= 2 && totalImpact >= 15)
            ? "overkill"
            : "appropriate";
      return { ...anchor, assessment, noChangeConcern };
    });
    return { decisionDay, age, anchors };
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
  return APPROPRIATE_RESTRICTION_COPY;
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
): readonly string[] {
  const age = context.age;
  if (anchor.assessment === "unban") {
    if (isUnbanCautionSlot(age, index)) return UNBAN_CAUTION_COPY;
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
  const primary = primaryRestrictionPool(anchor);
  const dayOne: readonly (readonly string[])[] = [
    primary,
    primary,
    RESTRICTION_CONSISTENCY_COPY,
    primary,
    COLLATERAL_RESTRICTION_COPY,
    RESTRICTION_CAUTION_COPY,
    RESTRICTION_MEME_COPY,
    RESTRICTION_MARKET_COPY,
  ];
  const dayTwo: readonly (readonly string[])[] = [
    ALTERNATE_BUILD_RESTRICTION_COPY,
    RESTRICTION_MARKET_COPY,
    ALTERNATE_BUILD_RESTRICTION_COPY,
    RESTRICTION_CAUTION_COPY,
    RESTRICTION_MARKET_COPY,
    RESTRICTION_CONSISTENCY_COPY,
    primary,
  ];
  const dayThree: readonly (readonly string[])[] = [
    RESTRICTION_META_COPY,
    ALTERNATE_BUILD_RESTRICTION_COPY,
    RESTRICTION_META_COPY,
    RESTRICTION_CAUTION_COPY,
    ALTERNATE_BUILD_RESTRICTION_COPY,
    RESTRICTION_MARKET_COPY,
  ];
  const routing = age === 1 ? dayOne : age === 2 ? dayTwo : dayThree;
  return routing[index % routing.length];
}

function restrictionRecentProductAge(
  state: GameState,
  decisionDay: number,
  themeId: ThemeId,
): number {
  let latestProductDay = 1;
  for (const batch of state.releaseHistory) {
    if (
      batch.day <= decisionDay &&
      batch.products.some((product) => product.themeId === themeId)
    ) {
      latestProductDay = Math.max(latestProductDay, batch.day);
    }
  }
  return Math.max(0, decisionDay - latestProductDay);
}

function makeRestrictionContextPost(
  state: GameState,
  context: RecentRestrictionDecision,
  outputIndex: number,
  usedBodies: ReadonlySet<string>,
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
  );
  const unban =
    anchor.assessment === "unban"
      ? unbanReactionAssessment(state, context, anchor)
      : null;
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
    decisionShare: `${((unban?.decisionShare ?? 0) * 100).toFixed(1)}%`,
    share: `${((unban?.currentShare ?? 0) * 100).toFixed(1)}%`,
    delta: `${(Math.abs(unban?.delta ?? 0) * 100).toFixed(1)}`,
    rank: String(unban?.rank ?? 0),
  };
  const fill = (copy: string) => {
    let body = copy;
    for (const [key, value] of Object.entries(values)) {
      body = body.replaceAll(`{${key}}`, value);
    }
    return body;
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
    themeIds: recent.batch.products.map((product) => product.themeId),
  };
}

function historyAtOrBefore(state: GameState, day: number) {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    if (state.history[index].day <= day) return state.history[index];
  }
  return undefined;
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
  const restrictionHeat = restriction
    ? ([96, 84, 70] as const)[restriction.age - 1]
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
  return Math.round(
    Math.min(
      100,
      Math.max(
        profile.heat,
        restrictionHeat,
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

function templateFor(seed: number, day: number, index: number): DailyTemplate {
  const coprimeSteps = [
    1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31,
    33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63,
  ];
  const offset = keyedIndex(
    DAILY_TEMPLATES.length,
    seed,
    "daily-community-template-offset",
  );
  const step = coprimeSteps[
    keyedIndex(
      coprimeSteps.length,
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
  let body = template.text as string;
  for (const [key, value] of Object.entries(values)) {
    body = body.replaceAll(`{${key}}`, value);
  }
  return body;
}

function fillReactionCopy(
  text: string,
  state: GameState,
  day: number,
  index: number,
  product: ReleasedProduct,
  daysSinceRestriction: number | null,
  supportContext: SupportReactionContext | null,
): { body: string; partId: string } {
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
  const part = newPart ?? fallbackPart;
  const newCard = newPart?.name ?? part.name;
  const oldCard = oldPart?.name ?? fallbackPart.name;
  return {
    body: text
      .replaceAll("{theme}", content.shortName)
      .replaceAll("{part}", part.name)
      .replaceAll("{days}", String(daysSinceRestriction ?? 0))
      .replaceAll(
        "{share}",
        `${((supportContext?.share ?? 0) * 100).toFixed(1)}%`,
      )
      .replaceAll("{supportNo}", String(supportContext?.supportNumber ?? 1))
      .replaceAll("{newCard}", newCard)
      .replaceAll("{oldCard}", oldCard),
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
): readonly string[] {
  const lifecycleIndex = age - 1;
  if (preferArt) return RELEASE_ART_COPY[lifecycleIndex];
  if (daysSinceRestriction !== null) return BACKLASH_RELEASE_COPY;
  if (supportContext) return supportReactionCopyPool(supportContext);
  if (!forceProductTone && index % 4 === 1) return CASUAL_RELEASE_COPY;
  if (!forceProductTone && index % 4 === 3) return SPECTATOR_RELEASE_COPY;
  if (!forceProductTone && age > 0 && index % 3 === 0) {
    return RELEASE_LIFECYCLE_COPY[lifecycleIndex];
  }
  const greed = isGreedRelease(product);
  const weak = isWeakRelease(product);
  if (greed && weak) return index % 2 === 0 ? STRONG_RELEASE_COPY : WEAK_RELEASE_COPY;
  if (greed) return STRONG_RELEASE_COPY;
  if (weak) return WEAK_RELEASE_COPY;
  return lifecycleIndex > 0
    ? RELEASE_LIFECYCLE_COPY[lifecycleIndex]
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
  const pool = reactionCopyPool(
    product,
    age,
    daysSinceRestriction,
    preferArt,
    outputIndex,
    forceProductTone,
    supportContext,
  );
  const keyedStart = keyedIndex(
    pool.length,
    state.seed,
    "release-reaction-copy",
    day,
    outputIndex,
    product.optionId,
    preferArt ? "art" : "play",
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
    );
  }

  return {
    id: `daily-release-${day - age}-${product.optionId}-${age}-${String(
      outputIndex + 1,
    ).padStart(2, "0")}-${preferArt ? "art" : "play"}`,
    day,
    category: "release",
    type: product.kind === "support" ? "support-released" : "release-reaction",
    themeId: product.themeId,
    partId: selected.partId,
    value: product.powerAdjustment,
    body: selected.body,
  };
}

function loyaltyPost(
  state: GameState,
  day: number,
  outputIndex: number,
): CommunityEvent | null {
  const candidates = state.releaseHistory.flatMap((batch) =>
    batch.products
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
  const body = pool[
    keyedIndex(pool.length, state.seed, "fatigue-copy", day, chosen.themeId, stage)
  ].replaceAll("{theme}", content.shortName);
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
 * Engine-authored events are kept first; synthetic chatter is never persisted.
 */
export function getDailyCommunityPosts(
  state: GameState,
  day: number,
): CommunityEvent[] {
  assertCommunityDay(state, day);

  const allSpecialPosts = state.community
    .filter(
      (event) => event.day === day && !isRestrictionDecisionEvent(event),
    )
    .slice(0, POSTS_PER_DAY)
    .map((event) => ({ ...event }));
  const restrictionContext = recentRestrictionDecision(state, day);
  const output: CommunityEvent[] = [];
  const usedBodies = new Set<string>();
  if (restrictionContext) {
    const target = RESTRICTION_CONTEXT_QUOTA[restrictionContext.age - 1];
    const existingContext = allSpecialPosts
      .filter((event) => isRestrictionContextEvent(event, restrictionContext))
      .slice(0, target);
    for (let index = 0; index < existingContext.length; index += 1) {
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
    while (output.length < target) {
      const contextual = makeRestrictionContextPost(
        state,
        restrictionContext,
        output.length,
        usedBodies,
      );
      output.push(contextual);
      usedBodies.add(contextual.body);
    }
    if (
      restrictionContext.anchors.some(
        (anchor) => anchor.assessment === "no-change",
      )
    ) {
      const stale = makeStaleRestrictionPosts(state, day, false, 2);
      for (let index = 0; index < stale.length; index += 1) {
        const replaced = output[index];
        if (replaced) usedBodies.delete(replaced.body);
        const post = stale[index];
        const prioritized = {
          ...post,
          id: `daily-restriction-${restrictionContext.decisionDay}-stale-${post.themeId}-${post.partId}-${restrictionContext.age}`,
        };
        output[index] = prioritized;
        usedBodies.add(prioritized.body);
      }
    }
    const remainingSpecial = allSpecialPosts.filter(
      (event) => !isRestrictionContextEvent(event, restrictionContext),
    );
    for (const event of remainingSpecial) {
      if (output.length >= POSTS_PER_DAY) break;
      output.push(event);
      usedBodies.add(event.body);
    }
  } else {
    output.push(...allSpecialPosts);
    for (const event of output) usedBodies.add(event.body);
  }
  if (output.length === POSTS_PER_DAY) return output;

  const recentRelease = releaseBatchNearDay(state, day);
  if (recentRelease && !restrictionContext) {
    const releaseThemeIds = new Set(
      recentRelease.batch.products.map((product) => product.themeId),
    );
    const existingContext = output.filter(
      (event) =>
        releaseThemeIds.has(event.themeId) &&
        (event.type === "release-reaction" || event.type === "support-released"),
    );
    for (let index = 0; index < existingContext.length; index += 1) {
      const event = existingContext[index];
      const product = recentRelease.batch.products.find(
        (candidate) => candidate.themeId === event.themeId,
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
      event.value = product.powerAdjustment;
      usedBodies.add(event.body);
    }

    const lifecycleIndex = recentRelease.age - 1;
    const target = RELEASE_CONTEXT_QUOTA[lifecycleIndex];
    const needed = Math.min(
      POSTS_PER_DAY - output.length,
      Math.max(0, target - existingContext.length),
    );
    const artTargets = [6, 4, 3, 2] as const;
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
      const post = makeReleaseContextPost(
        state,
        day,
        recentRelease.age,
        product,
        output.length,
        index < artTargets[lifecycleIndex],
        usedBodies,
      );
      output.push(post);
      usedBodies.add(post.body);
    }
  }

  if (!recentRelease && !restrictionContext && output.length < POSTS_PER_DAY) {
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
    const template = templateFor(state.seed, day, outputIndex);
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
    const share = `${((chosen.weight / poolTotal) * 100).toFixed(1)}%`;

    output.push({
      id: `daily-generated-${(state.seed >>> 0).toString(16)}-${day}-${String(
        outputIndex + 1,
      ).padStart(2, "0")}-${template.key}`,
      day,
      category: template.category,
      type: template.type,
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

  return output;
}
