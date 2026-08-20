import {
  PLAY_KEYWORD_IDS,
  type PlayKeyword,
} from "./play-keywords.ts";

export const GENERIC_CARD_ROLE_IDS = Object.freeze([
  "enabler",
  "extender",
  "interaction",
  "defense",
  "recovery",
  "payoff",
] as const);

export type GenericCardRole = (typeof GENERIC_CARD_ROLE_IDS)[number];
export type GenericCardId = `generic-${PlayKeyword}-${GenericCardRole}`;

export interface GenericCardCatalogEntry {
  readonly id: GenericCardId;
  readonly name: string;
  readonly keyword: PlayKeyword;
  readonly role: GenericCardRole;
  /** Display-safe card text. Strategic edges remain in the simulation layer. */
  readonly description: string;
  /** Intrinsic strength on the same 0..100 scale used by theme content. */
  readonly basePower: number;
  /** Friction created by repeated or broad use, on a 0..100 scale. */
  readonly unpleasantness: number;
  /** Sales and discovery pull, on a 0..100 scale. */
  readonly appeal: number;
  /** Days required for the field to approach mature use. */
  readonly optimizationDays: number;
}

export const GENERIC_CARD_STAT_RANGES = Object.freeze({
  basePower: Object.freeze({ min: 50, max: 90 }),
  unpleasantness: Object.freeze({ min: 20, max: 85 }),
  appeal: Object.freeze({ min: 50, max: 95 }),
  optimizationDays: Object.freeze({ min: 3, max: 20 }),
});

type SixStrings = readonly [string, string, string, string, string, string];

interface KeywordVocabulary {
  readonly names: SixStrings;
  readonly leads: SixStrings;
  readonly statBias: Readonly<{
    power: number;
    unpleasantness: number;
    appeal: number;
    optimization: number;
  }>;
}

const ROLE_STATS: Readonly<
  Record<
    GenericCardRole,
    Readonly<{
      basePower: number;
      unpleasantness: number;
      appeal: number;
      optimizationDays: number;
    }>
  >
> = {
  enabler: { basePower: 64, unpleasantness: 42, appeal: 72, optimizationDays: 5 },
  extender: { basePower: 69, unpleasantness: 47, appeal: 74, optimizationDays: 7 },
  interaction: { basePower: 72, unpleasantness: 65, appeal: 76, optimizationDays: 8 },
  defense: { basePower: 65, unpleasantness: 48, appeal: 67, optimizationDays: 6 },
  recovery: { basePower: 62, unpleasantness: 35, appeal: 65, optimizationDays: 9 },
  payoff: { basePower: 80, unpleasantness: 58, appeal: 82, optimizationDays: 12 },
};

const ROLE_DESCRIPTION_TAILS: Readonly<
  Record<GenericCardRole, readonly string[]>
> = {
  enabler: [
    "주력 플랜의 출발을 안정시킵니다.",
    "준비 단계를 짧고 선명하게 만듭니다.",
    "첫 행동까지 필요한 손패를 정돈합니다.",
  ],
  extender: [
    "멈춘 흐름을 한 단계 더 이어 줍니다.",
    "남은 자원을 다음 행동으로 연결합니다.",
    "첫 결과물 뒤에도 선택지를 남깁니다.",
  ],
  interaction: [
    "진행 중인 판에 개입할 여지를 만듭니다.",
    "상대 행동 중에도 끼어들 선택지를 엽니다.",
    "서로의 행동 순서를 흔드는 수단이 됩니다.",
  ],
  defense: [
    "핵심 자원을 지키며 다음 행동을 준비합니다.",
    "전개한 파츠가 한 번 더 버티게 합니다.",
    "손실을 늦추고 판을 유지할 시간을 법니다.",
  ],
  recovery: [
    "길어진 게임에서도 플랜을 다시 세웁니다.",
    "버린 자원을 다음 순환에 보탭니다.",
    "소모 뒤의 빈틈을 새 자원으로 메웁니다.",
  ],
  payoff: [
    "준비한 흐름을 뚜렷한 결과물로 바꿉니다.",
    "모아 둔 자원을 결정적인 한 수로 완성합니다.",
    "여러 단계의 투자를 강한 마무리로 돌려줍니다.",
  ],
};

/**
 * Authored names and action vocabulary keep the generated catalog readable as
 * individual cards. Tuple positions follow GENERIC_CARD_ROLE_IDS.
 */
const KEYWORD_VOCABULARY = {
  rush: {
    names: [
      "선봉의 신호",
      "추격의 발판",
      "찰나의 제압",
      "돌진 방벽",
      "재점화 보급",
      "끝맺는 질주",
    ],
    leads: [
      "첫 공격 자원을 빠르게 모아",
      "끊긴 돌진 뒤에 후속 파츠를 붙여",
      "행동 사이에 짧은 압박을 끼워",
      "앞선 파츠를 순간적으로 감싸",
      "소모된 공격 자원을 다시 모아",
      "쌓아 둔 속도를 한 번에 밀어 넣어",
    ],
    statBias: { power: 5, unpleasantness: 4, appeal: 4, optimization: -1 },
  },
  tempo: {
    names: [
      "박자 선취",
      "이어지는 수순",
      "틈새 전환",
      "흐름의 완충",
      "되찾은 박자",
      "지휘자의 종결",
    ],
    leads: [
      "가벼운 교환 수단을 먼저 확보해",
      "짧은 행동 뒤에 다음 수를 덧붙여",
      "예정된 순서를 비틀어",
      "넘겨준 주도권을 잠시 붙잡아",
      "소모한 선택지를 다시 정렬해",
      "연속된 작은 이득을 한 수에 모아",
    ],
    statBias: { power: 2, unpleasantness: 2, appeal: 2, optimization: 0 },
  },
  setup: {
    names: [
      "첫 번째 표식",
      "증축 설계도",
      "공정 변경",
      "봉인 저장고",
      "남겨 둔 재료",
      "완성식 기동",
    ],
    leads: [
      "첫 준비물과 표식을 배치해",
      "완성 전의 공정을 한 단계 당겨",
      "진행 중인 준비 순서를 바꿔",
      "쌓아 둔 재료를 봉인해",
      "사용한 재료를 저장고로 돌려",
      "마지막 조건을 채워",
    ],
    statBias: { power: 1, unpleasantness: 0, appeal: 1, optimization: 3 },
  },
  fortress: {
    names: [
      "성벽의 초석",
      "이어 쌓는 흉벽",
      "관문 통제령",
      "수호석 차폐",
      "성채의 비축고",
      "불락의 대문",
    ],
    leads: [
      "방어 구조의 기초를 세워",
      "기존 진형 바깥에 벽을 더해",
      "관문을 닫아 행동 폭을 좁혀",
      "중요한 구역에 차폐를 둘러",
      "소모된 방어물을 비축고로 돌려",
      "겹친 방어 구조를 하나의 거점으로 묶어",
    ],
    statBias: { power: -1, unpleasantness: 4, appeal: -1, optimization: 2 },
  },
  midrange: {
    names: [
      "균형의 패",
      "교대 전력",
      "선택적 제압",
      "중진 방진",
      "전선 정비",
      "결승의 기수",
    ],
    leads: [
      "위협과 대응 수단을 고르게 확보해",
      "현재 패에 맞는 후속 전력을 붙여",
      "필요한 순간에 교환 대상을 골라",
      "공수 전환에 쓸 진형을 세워",
      "줄어든 전력을 다시 고르게 채워",
      "남은 선택지를 결승 전력에 집중해",
    ],
    statBias: { power: 1, unpleasantness: -1, appeal: 0, optimization: 0 },
  },
  ramp: {
    names: [
      "동력의 씨앗",
      "과충전 도관",
      "공급 차단기",
      "축전 보호막",
      "회수 발전기",
      "거대 출력핵",
    ],
    leads: [
      "추가 동력원을 먼저 심어",
      "남는 자원을 다음 동력으로 넘겨",
      "공급선의 흐름을 순간 조절해",
      "저장한 동력에 보호막을 씌워",
      "사용한 동력 장치를 다시 가동해",
      "축적한 자원을 거대 출력으로 바꿔",
    ],
    statBias: { power: 3, unpleasantness: 2, appeal: 3, optimization: 2 },
  },
  reactive: {
    names: [
      "대기의 인장",
      "응답의 연쇄",
      "즉응 봉인",
      "예비 보호식",
      "되감은 응답",
      "최종 반향",
    ],
    leads: [
      "응답 조건을 미리 새겨",
      "첫 반응 뒤에 또 다른 선택지를 열어",
      "발생한 행동에 즉시 봉인을 붙여",
      "예비 효과로 핵심 파츠를 감싸",
      "사용한 응답을 다시 대기 상태로 돌려",
      "여러 번의 반응을 마지막 반향으로 모아",
    ],
    statBias: { power: 0, unpleasantness: 3, appeal: -1, optimization: 2 },
  },
  gambit: {
    names: [
      "판돈의 초대",
      "이중 승부",
      "패 뒤집기",
      "보험 계약서",
      "재도전권",
      "운명의 낙찰",
    ],
    leads: [
      "감수할 비용과 보상을 함께 마련해",
      "첫 승부 뒤에 두 번째 선택을 걸어",
      "공개된 결과를 다른 수로 뒤집어",
      "실패 비용을 대신 치를 장치를 두어",
      "소모한 판돈 일부를 다시 확보해",
      "누적된 위험을 큰 보상으로 환산해",
    ],
    statBias: { power: 6, unpleasantness: 5, appeal: 7, optimization: 3 },
  },
  combo: {
    names: [
      "첫 연결고리",
      "가속 연계",
      "사슬 끊기",
      "연결 보존식",
      "파츠 재조립",
      "완전 연쇄식",
    ],
    leads: [
      "연쇄의 첫 파츠를 손에 맞춰",
      "중간 파츠에서 다음 효과를 이어",
      "이어진 효과 사이에 단절을 넣어",
      "핵심 연결고리를 보호해",
      "묘지의 파츠를 순서대로 재조립해",
      "모든 연결 단계를 완성해",
    ],
    statBias: { power: 5, unpleasantness: 4, appeal: 5, optimization: 4 },
  },
  control: {
    names: [
      "봉쇄의 포석",
      "통제 확장",
      "긴급 압수령",
      "억제 장벽",
      "관리대장 회수",
      "폐쇄 선언",
    ],
    leads: [
      "지속 통제 수단을 먼저 놓아",
      "좁아진 행동 경로에 제약을 더해",
      "중요한 자원을 잠시 거둬들여",
      "통제 장치 둘레에 억제막을 세워",
      "사용한 관리 수단을 다시 배치해",
      "여러 제약을 하나의 폐쇄 상태로 묶어",
    ],
    statBias: { power: 3, unpleasantness: 7, appeal: 1, optimization: 2 },
  },
  toolbox: {
    names: [
      "만능 색인",
      "보조 서랍",
      "즉석 공구",
      "접이식 방호구",
      "재고 재배치",
      "완성형 장치함",
    ],
    leads: [
      "상황별 파츠를 찾는 색인을 열어",
      "필요한 기능을 보조 칸에서 꺼내",
      "현재 판에 맞는 도구를 즉석에서 선택해",
      "사용 중인 장치를 접어 보존해",
      "소모된 도구를 재고로 되돌려",
      "모은 기능을 완성형 장치로 조립해",
    ],
    statBias: { power: 1, unpleasantness: 1, appeal: 2, optimization: 3 },
  },
  attrition: {
    names: [
      "첫 교환권",
      "소모전 증원",
      "마모 촉진제",
      "버팀의 외피",
      "잔여물 회수",
      "마지막 잔고",
    ],
    leads: [
      "첫 교환에 쓸 여분을 확보해",
      "반복 교환 뒤에 새 전력을 붙여",
      "서로의 자원을 조금씩 마모시켜",
      "남은 파츠에 버팀 구조를 더해",
      "교환 뒤 남은 조각을 다시 모아",
      "끝까지 남긴 자원을 마지막 수로 바꿔",
    ],
    statBias: { power: 0, unpleasantness: 5, appeal: -2, optimization: 2 },
  },
  recursion: {
    names: [
      "귀환의 실마리",
      "되도는 고리",
      "회귀 간섭",
      "순환 보호진",
      "기억의 인양",
      "영겁 회로",
    ],
    leads: [
      "되돌릴 대상을 미리 표시해",
      "돌아온 자원을 새 고리에 연결해",
      "회귀하는 순서에 다른 효과를 끼워",
      "순환 중인 파츠를 보호해",
      "소모된 기억을 다시 인양해",
      "여러 번의 귀환을 끊기지 않는 회로로 묶어",
    ],
    statBias: { power: 1, unpleasantness: 2, appeal: 2, optimization: 3 },
  },
  transformation: {
    names: [
      "변신 촉매",
      "연속 변환식",
      "형태 교란",
      "가변 갑피",
      "원형 복구",
      "최종 형상",
    ],
    leads: [
      "형태를 바꿀 촉매를 확보해",
      "바뀐 형태에서 다음 변환을 이어",
      "대상의 역할을 순간적으로 뒤틀어",
      "필요한 순간에 방어 형태로 전환해",
      "변한 파츠를 원래 형태로 복구해",
      "모든 변환 단계를 최종 형상으로 모아",
    ],
    statBias: { power: 3, unpleasantness: 1, appeal: 5, optimization: 4 },
  },
  territory: {
    names: [
      "개척 표지",
      "전선 확장로",
      "진형 붕괴점",
      "경계 수호탑",
      "영지 재측량",
      "지배의 중심축",
    ],
    leads: [
      "첫 구역에 전술 표지를 놓아",
      "차지한 공간에서 다음 전선을 넓혀",
      "배치된 진형의 기준점을 흔들어",
      "중요한 경계에 수호 구조물을 세워",
      "흐트러진 구역을 다시 측량해",
      "여러 구역의 효과를 중심축에 모아",
    ],
    statBias: { power: 1, unpleasantness: 2, appeal: 3, optimization: 2 },
  },
  countdown: {
    names: [
      "첫째 종",
      "앞당긴 눈금",
      "시간차 봉인",
      "유예의 모래시계",
      "되감기 태엽",
      "영시의 개문",
    ],
    leads: [
      "발동할 시점의 첫 눈금을 새겨",
      "남은 단계를 한 칸 앞당겨",
      "서로 다른 시점에 봉인을 걸어",
      "예정된 손실을 잠시 유예해",
      "지나간 눈금을 태엽에 되감아",
      "모든 눈금이 맞는 순간 문을 열어",
    ],
    statBias: { power: 2, unpleasantness: 3, appeal: 3, optimization: 3 },
  },
  disruption: {
    names: [
      "견제 신호탄",
      "연속 방해선",
      "불시 단절",
      "교란 차폐막",
      "방해 수단 재장전",
      "전면 중지령",
    ],
    leads: [
      "개입에 필요한 신호를 먼저 준비해",
      "첫 방해 뒤에 다음 수단을 연결해",
      "진행 중인 효과를 불시에 끊어",
      "교란 장치를 차폐막으로 지켜",
      "사용한 방해 수단을 다시 장전해",
      "여러 개입 수단을 전면 중지령으로 모아",
    ],
    statBias: { power: 4, unpleasantness: 8, appeal: 2, optimization: 2 },
  },
  resilience: {
    names: [
      "복구의 씨앗",
      "재건 골조",
      "충격 흡수재",
      "이중 안전망",
      "잔해 회수반",
      "완전 복원식",
    ],
    leads: [
      "복구에 쓸 자원을 미리 남겨",
      "무너진 자리 위에 새 골조를 세워",
      "발생한 충격 일부를 다른 곳으로 흘려",
      "핵심 파츠에 두 번째 안전망을 달아",
      "손실된 조각을 잔해 속에서 회수해",
      "흩어진 전력을 완전한 진형으로 복원해",
    ],
    statBias: { power: 0, unpleasantness: -2, appeal: 1, optimization: 1 },
  },
  swarm: {
    names: [
      "군세의 부름",
      "증식 행렬",
      "대열 흔들기",
      "군집 보호막",
      "흩어진 무리",
      "천군의 물결",
    ],
    leads: [
      "여러 개체를 부를 신호를 올려",
      "펼쳐진 무리에서 새 개체를 늘려",
      "배치된 대열 사이에 혼선을 일으켜",
      "모인 개체를 하나의 보호막으로 감싸",
      "흩어진 무리를 다시 집결시켜",
      "가득 찬 전장을 거대한 물결로 바꿔",
    ],
    statBias: { power: 4, unpleasantness: 3, appeal: 5, optimization: 2 },
  },
  burst: {
    names: [
      "점화 스위치",
      "추가 연료통",
      "출력 억제탄",
      "폭압 방호판",
      "잔열 회수기",
      "임계 폭발",
    ],
    leads: [
      "출력을 올릴 점화 장치를 잡아",
      "첫 폭발 뒤에 추가 연료를 부어",
      "모아 둔 출력을 순간적으로 꺾어",
      "폭발 지점 둘레에 방호판을 세워",
      "남은 잔열을 다음 연료로 거둬",
      "모든 출력을 임계점에서 터뜨려",
    ],
    statBias: { power: 7, unpleasantness: 5, appeal: 6, optimization: 2 },
  },
  consistency: {
    names: [
      "확정 경로",
      "예비 사본",
      "경로 수정",
      "오류 방지틀",
      "누락분 보충",
      "완전 재현식",
    ],
    leads: [
      "주력 경로의 첫 조각을 확정해",
      "같은 기능의 예비 사본을 붙여",
      "진행 중인 경로의 오류를 바로잡아",
      "핵심 순서에 오류 방지틀을 씌워",
      "빠진 조각을 보충 목록에서 찾아",
      "정돈한 순서를 완전한 재현으로 마쳐",
    ],
    statBias: { power: 4, unpleasantness: 2, appeal: 4, optimization: -1 },
  },
  protection: {
    names: [
      "수호의 서약",
      "겹보호 인장",
      "보호 해제침",
      "대체 방벽",
      "수호자 귀환",
      "불멸의 성역",
    ],
    leads: [
      "수호 대상을 미리 지정해",
      "첫 보호 위에 새 인장을 겹쳐",
      "걸린 보호 장치 하나를 걷어 내",
      "손실을 대신 받을 방벽을 세워",
      "소모된 수호자를 다시 불러",
      "겹친 보호를 하나의 성역으로 완성해",
    ],
    statBias: { power: 1, unpleasantness: 3, appeal: 0, optimization: 1 },
  },
  mobility: {
    names: [
      "이동 표식",
      "연속 도약문",
      "좌표 뒤틀기",
      "피난 통로",
      "귀환 좌표",
      "전장 횡단",
    ],
    leads: [
      "옮길 대상과 도착점을 표시해",
      "첫 이동 뒤에 새 도약문을 열어",
      "지정된 좌표를 순간적으로 바꿔",
      "위험한 구역에서 벗어날 통로를 내어",
      "이동한 파츠에 귀환 좌표를 남겨",
      "여러 구역을 한 번에 가로질러",
    ],
    statBias: { power: 3, unpleasantness: 1, appeal: 4, optimization: 2 },
  },
  deception: {
    names: [
      "첫 번째 미끼",
      "겹친 연막",
      "거짓 지령",
      "비밀 피난처",
      "감춘 패 회수",
      "대역전의 환영",
    ],
    leads: [
      "실제 수를 숨길 첫 미끼를 놓아",
      "드러난 미끼 뒤에 새 연막을 겹쳐",
      "선택된 대상에 거짓 지령을 흘려",
      "비공개 파츠를 숨길 피난처를 만들어",
      "사용한 속임수를 다시 손안에 감춰",
      "쌓아 둔 오인을 거대한 환영으로 바꿔",
    ],
    statBias: { power: 4, unpleasantness: 6, appeal: 5, optimization: 3 },
  },
} as const satisfies Readonly<Record<PlayKeyword, KeywordVocabulary>>;

function createGenericCard(
  keyword: PlayKeyword,
  keywordIndex: number,
  role: GenericCardRole,
  roleIndex: number,
): GenericCardCatalogEntry {
  const vocabulary = KEYWORD_VOCABULARY[keyword];
  const roleStats = ROLE_STATS[role];
  const descriptionTails = ROLE_DESCRIPTION_TAILS[role];
  const descriptionTail =
    descriptionTails[keywordIndex % descriptionTails.length];

  return Object.freeze({
    id: `generic-${keyword}-${role}`,
    name: vocabulary.names[roleIndex],
    keyword,
    role,
    description: `${vocabulary.leads[roleIndex]} ${descriptionTail}`,
    basePower: roleStats.basePower + vocabulary.statBias.power,
    unpleasantness:
      roleStats.unpleasantness + vocabulary.statBias.unpleasantness,
    appeal: roleStats.appeal + vocabulary.statBias.appeal,
    optimizationDays:
      roleStats.optimizationDays + vocabulary.statBias.optimization,
  });
}

export const GENERIC_CARD_CATALOG: readonly GenericCardCatalogEntry[] =
  Object.freeze(
    PLAY_KEYWORD_IDS.flatMap((keyword, keywordIndex) =>
      GENERIC_CARD_ROLE_IDS.map((role, roleIndex) =>
        createGenericCard(keyword, keywordIndex, role, roleIndex),
      ),
    ),
  );

export const GENERIC_CARD_BY_ID = Object.freeze(
  Object.fromEntries(GENERIC_CARD_CATALOG.map((card) => [card.id, card])),
) as Readonly<Record<string, GenericCardCatalogEntry>>;

export const GENERIC_CARDS_BY_KEYWORD = Object.freeze(
  Object.fromEntries(
    PLAY_KEYWORD_IDS.map((keyword) => [
      keyword,
      Object.freeze(
        GENERIC_CARD_CATALOG.filter((card) => card.keyword === keyword),
      ),
    ]),
  ),
) as Readonly<Record<PlayKeyword, readonly GenericCardCatalogEntry[]>>;

export function getGenericCard(
  id: string,
): GenericCardCatalogEntry | undefined {
  return Object.hasOwn(GENERIC_CARD_BY_ID, id)
    ? GENERIC_CARD_BY_ID[id]
    : undefined;
}

export function getGenericCardsByKeyword(
  keyword: PlayKeyword,
): readonly GenericCardCatalogEntry[] {
  return GENERIC_CARDS_BY_KEYWORD[keyword];
}

export function getGenericCardByKeywordAndRole(
  keyword: PlayKeyword,
  role: GenericCardRole,
): GenericCardCatalogEntry {
  const card = GENERIC_CARDS_BY_KEYWORD[keyword].find(
    (candidate) => candidate.role === role,
  );
  if (!card) {
    throw new Error(`Missing generic card for ${keyword}/${role}.`);
  }
  return card;
}
