import {
  PLAY_KEYWORD_CATALOG,
  PLAY_KEYWORDS_PER_THEME,
  withPlayKeywords,
} from "./play-keywords.ts";
import type { ThemeContent, ThemeContentBase, ThemeId } from "./types";
import {
  HANDCRAFTED_SUPPORT_NAMES,
  ORIGINAL_FUTURE_THEMES,
  attachNamedSupportParts,
} from "./original-theme-catalog.ts";

export const INITIAL_THEME_PART_COUNT = 5;
export const SUPPORT_PARTS_PER_RELEASE = 3;
export const MAX_THEME_SUPPORTS = 3;
export const TOTAL_THEME_PART_COUNT =
  INITIAL_THEME_PART_COUNT + SUPPORT_PARTS_PER_RELEASE * MAX_THEME_SUPPORTS;

/**
 * Launch content for the ten-theme prototype.
 *
 * `startingShare` and part `inclusion` are stored as 0..1 ratios. Theme-level
 * ratings and part contribution weights use a 0..100 scale. Every part starts
 * unlimited; the mutable legal-copy state belongs to the simulation state.
 */
const HANDCRAFTED_THEMES = [
  {
    id: "cycle",
    name: "윤회",
    shortName: "윤회",
    playstyle: "묘지를 채우고 파츠를 되살리며 이득을 반복하는 순환형 미드레인지",
    aesthetic: "고딕, 언데드, 보랏빛 영혼",
    basePower: 72,
    baseUnpleasantness: 62,
    appeal: 76,
    difficulty: 55,
    optimizationDays: 10,
    counterClarity: 78,
    startingShare: 0.14,
    color: "#7C3AED",
    parts: [
      {
        id: "cycle-gate",
        name: "윤회의 문",
        role: "starter1",
        inclusion: 0.96,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 27,
        unpleasantWeight: 10,
        tags: ["1장 초동", "묘지 충전", "순수 구축"],
      },
      {
        id: "cycle-guide",
        name: "윤회의 안내자",
        role: "starter2",
        inclusion: 0.82,
        averageCopies: 2.5,
        preferredCopies: 3,
        powerWeight: 19,
        unpleasantWeight: 8,
        tags: ["묘지", "외부 사용", "특수 소환"],
      },
      {
        id: "cycle-rewound-pact",
        name: "윤회의 되감긴 계약",
        role: "bridge",
        inclusion: 0.91,
        averageCopies: 2,
        preferredCopies: 2,
        powerWeight: 22,
        unpleasantWeight: 25,
        tags: ["소생", "연쇄", "병목"],
      },
      {
        id: "cycle-eternal-ring",
        name: "윤회의 영원한 고리",
        role: "finisher",
        inclusion: 0.98,
        averageCopies: 1.1,
        preferredCopies: 1,
        powerWeight: 18,
        unpleasantWeight: 42,
        tags: ["반복 견제", "무한 회수", "결과물"],
      },
      {
        id: "cycle-return",
        name: "윤회의 귀환",
        role: "recursion",
        inclusion: 0.76,
        averageCopies: 2.2,
        preferredCopies: 2,
        powerWeight: 14,
        unpleasantWeight: 15,
        tags: ["회수", "장기전", "자원 복구"],
      },
    ],
  },
  {
    id: "white-night",
    name: "백야",
    shortName: "백야",
    playstyle: "보호 효과로 시간을 벌고 지속 봉쇄를 완성하는 수비형 컨트롤",
    aesthetic: "설원, 성녀, 은빛 성당",
    basePower: 58,
    baseUnpleasantness: 69,
    appeal: 90,
    difficulty: 43,
    optimizationDays: 8,
    counterClarity: 58,
    startingShare: 0.13,
    color: "#38BDF8",
    parts: [
      {
        id: "white-night-prayer",
        name: "백야의 기도",
        role: "starter1",
        inclusion: 0.94,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 22,
        unpleasantWeight: 5,
        tags: ["1장 초동", "마법", "순수 구축"],
      },
      {
        id: "white-night-pilgrim",
        name: "백야의 순례자",
        role: "starter2",
        inclusion: 0.73,
        averageCopies: 2.1,
        preferredCopies: 2,
        powerWeight: 14,
        unpleasantWeight: 5,
        tags: ["빛", "마법사", "외부 사용"],
      },
      {
        id: "white-night-procession",
        name: "백야의 행렬",
        role: "bridge",
        inclusion: 0.96,
        averageCopies: 2.4,
        preferredCopies: 2,
        powerWeight: 25,
        unpleasantWeight: 20,
        tags: ["보호", "함정 설치", "병목"],
      },
      {
        id: "white-night-saint",
        name: "백야의 성녀",
        role: "finisher",
        inclusion: 0.99,
        averageCopies: 1.2,
        preferredCopies: 1,
        powerWeight: 24,
        unpleasantWeight: 55,
        tags: ["봉쇄", "지속", "보호"],
      },
      {
        id: "white-night-snow-blessing",
        name: "백야의 설원 축복",
        role: "recursion",
        inclusion: 0.7,
        averageCopies: 1.8,
        preferredCopies: 2,
        powerWeight: 15,
        unpleasantWeight: 15,
        tags: ["정화", "회수", "장기전"],
      },
    ],
  },
  {
    id: "machine-revolution",
    name: "기계혁명",
    shortName: "기계혁명",
    playstyle: "다수의 기계 파츠를 연쇄해 다중 견제 결과물을 세우는 장시간 콤보",
    aesthetic: "산업도시, 메카, 황동 톱니",
    basePower: 80,
    baseUnpleasantness: 83,
    appeal: 78,
    difficulty: 84,
    optimizationDays: 22,
    counterClarity: 72,
    startingShare: 0.13,
    color: "#F59E0B",
    parts: [
      {
        id: "machine-revolution-ignition-drone",
        name: "기계혁명의 점화 드론",
        role: "starter1",
        inclusion: 0.97,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 25,
        unpleasantWeight: 10,
        tags: ["1장 초동", "기계", "연속 전개"],
      },
      {
        id: "machine-revolution-assembly-line",
        name: "기계혁명의 긴급 조립선",
        role: "starter2",
        inclusion: 0.86,
        averageCopies: 2.7,
        preferredCopies: 3,
        powerWeight: 18,
        unpleasantWeight: 8,
        tags: ["토큰", "기계", "외부 사용"],
      },
      {
        id: "machine-revolution-gear-lift",
        name: "기계혁명의 톱니 승강로",
        role: "bridge",
        inclusion: 1,
        averageCopies: 2.2,
        preferredCopies: 2,
        powerWeight: 28,
        unpleasantWeight: 32,
        tags: ["연속 전개", "병목", "긴 턴"],
      },
      {
        id: "machine-revolution-siege-g09",
        name: "기계혁명의 공성기 G-09",
        role: "finisher",
        inclusion: 1,
        averageCopies: 1.1,
        preferredCopies: 1,
        powerWeight: 21,
        unpleasantWeight: 40,
        tags: ["다중 무효", "선공 제압", "결과물"],
      },
      {
        id: "machine-revolution-reboot",
        name: "기계혁명의 재가동 프로토콜",
        role: "recursion",
        inclusion: 0.64,
        averageCopies: 1.5,
        preferredCopies: 2,
        powerWeight: 8,
        unpleasantWeight: 10,
        tags: ["재전개", "회수", "복구"],
      },
    ],
  },
  {
    id: "ironblood",
    name: "철혈",
    shortName: "철혈",
    playstyle: "전투와 교환으로 정직하게 우위를 쌓는 입문자용 전사 미드레인지",
    aesthetic: "중세 기사, 붉은 깃발, 전장",
    basePower: 61,
    baseUnpleasantness: 24,
    appeal: 66,
    difficulty: 26,
    optimizationDays: 5,
    counterClarity: 35,
    startingShare: 0.1,
    color: "#DC2626",
    parts: [
      {
        id: "ironblood-squire",
        name: "철혈의 종자",
        role: "starter1",
        inclusion: 0.92,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 25,
        unpleasantWeight: 15,
        tags: ["일반 소환", "전사", "순수 구축"],
      },
      {
        id: "ironblood-mobilization",
        name: "철혈의 소집령",
        role: "starter2",
        inclusion: 0.79,
        averageCopies: 2.4,
        preferredCopies: 2,
        powerWeight: 18,
        unpleasantWeight: 10,
        tags: ["전사", "외부 사용", "증원"],
      },
      {
        id: "ironblood-red-oath",
        name: "철혈의 붉은 맹세",
        role: "bridge",
        inclusion: 0.88,
        averageCopies: 2.2,
        preferredCopies: 2,
        powerWeight: 18,
        unpleasantWeight: 20,
        tags: ["전투 강화", "연계", "교환"],
      },
      {
        id: "ironblood-king-leonid",
        name: "철혈의 군왕 레오니드",
        role: "finisher",
        inclusion: 0.96,
        averageCopies: 1.5,
        preferredCopies: 1,
        powerWeight: 25,
        unpleasantWeight: 35,
        tags: ["전투", "제거", "정공법"],
      },
      {
        id: "ironblood-victory-banner",
        name: "철혈의 개선 깃발",
        role: "recursion",
        inclusion: 0.72,
        averageCopies: 1.8,
        preferredCopies: 2,
        powerWeight: 14,
        unpleasantWeight: 20,
        tags: ["회수", "전투 보상", "장기전"],
      },
    ],
  },
  {
    id: "abyss",
    name: "심해",
    shortName: "심해",
    playstyle: "상대의 패와 비공개 정보를 훼손해 선택지를 빼앗는 선공 제압형 덱",
    aesthetic: "심해, 생체발광, 거대 해양괴수",
    basePower: 78,
    baseUnpleasantness: 91,
    appeal: 58,
    difficulty: 67,
    optimizationDays: 15,
    counterClarity: 61,
    startingShare: 0.11,
    color: "#0E7490",
    parts: [
      {
        id: "abyss-bait",
        name: "심해의 미끼",
        role: "starter1",
        inclusion: 0.96,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 22,
        unpleasantWeight: 5,
        tags: ["1장 초동", "물", "패 버림"],
      },
      {
        id: "abyss-call",
        name: "심해의 부름",
        role: "starter2",
        inclusion: 0.84,
        averageCopies: 2.6,
        preferredCopies: 3,
        powerWeight: 18,
        unpleasantWeight: 8,
        tags: ["물", "묘지", "외부 사용"],
      },
      {
        id: "abyss-predation-pressure",
        name: "심해의 포식 수압",
        role: "bridge",
        inclusion: 0.94,
        averageCopies: 2.3,
        preferredCopies: 2,
        powerWeight: 26,
        unpleasantWeight: 42,
        tags: ["패 파괴", "병목", "비공개 정보"],
      },
      {
        id: "abyss-kraken",
        name: "심해의 무저갱 크라켄",
        role: "finisher",
        inclusion: 0.99,
        averageCopies: 1.1,
        preferredCopies: 1,
        powerWeight: 25,
        unpleasantWeight: 38,
        tags: ["선공 봉쇄", "패 확인", "결과물"],
      },
      {
        id: "abyss-molted-tentacle",
        name: "심해의 탈피 촉수",
        role: "recursion",
        inclusion: 0.61,
        averageCopies: 1.7,
        preferredCopies: 2,
        powerWeight: 9,
        unpleasantWeight: 7,
        tags: ["회피", "회수", "복구"],
      },
    ],
  },
  {
    id: "nebula",
    name: "성운",
    shortName: "성운",
    playstyle: "필요한 대응책을 찾아 바운스와 제외로 박자를 빼앗는 툴박스 템포",
    aesthetic: "우주, 항해사, 성간 함선",
    basePower: 72,
    baseUnpleasantness: 47,
    appeal: 72,
    difficulty: 78,
    optimizationDays: 24,
    counterClarity: 42,
    startingShare: 0.1,
    color: "#6366F1",
    parts: [
      {
        id: "nebula-navigator",
        name: "성운의 항해사",
        role: "starter1",
        inclusion: 0.94,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 23,
        unpleasantWeight: 8,
        tags: ["1장 초동", "속공", "순수 구축"],
      },
      {
        id: "nebula-orbit-observer",
        name: "성운의 궤도 관측기",
        role: "starter2",
        inclusion: 0.86,
        averageCopies: 2.8,
        preferredCopies: 3,
        powerWeight: 19,
        unpleasantWeight: 7,
        tags: ["기계", "우주", "외부 사용"],
      },
      {
        id: "nebula-jump-route",
        name: "성운의 도약 항로",
        role: "bridge",
        inclusion: 0.92,
        averageCopies: 2,
        preferredCopies: 2,
        powerWeight: 21,
        unpleasantWeight: 28,
        tags: ["제외", "툴박스", "병목"],
      },
      {
        id: "nebula-flagship-astra",
        name: "성운의 기함 아스트라",
        role: "finisher",
        inclusion: 0.97,
        averageCopies: 1.4,
        preferredCopies: 1,
        powerWeight: 23,
        unpleasantWeight: 42,
        tags: ["바운스", "상호작용", "결과물"],
      },
      {
        id: "nebula-return-coordinate",
        name: "성운의 귀환 좌표",
        role: "recursion",
        inclusion: 0.78,
        averageCopies: 2,
        preferredCopies: 2,
        powerWeight: 14,
        unpleasantWeight: 15,
        tags: ["복귀", "회수", "자원 복구"],
      },
    ],
  },
  {
    id: "plague-garden",
    name: "역병정원",
    shortName: "역병정원",
    playstyle: "약화와 감염을 누적해 상대의 행동을 서서히 제한하는 지연형 컨트롤",
    aesthetic: "독초, 균사, 다크 판타지 정원",
    basePower: 56,
    baseUnpleasantness: 75,
    appeal: 52,
    difficulty: 58,
    optimizationDays: 13,
    counterClarity: 69,
    startingShare: 0.08,
    color: "#65A30D",
    parts: [
      {
        id: "plague-garden-spore",
        name: "역병정원의 독포자",
        role: "starter1",
        inclusion: 0.9,
        averageCopies: 2.9,
        preferredCopies: 3,
        powerWeight: 22,
        unpleasantWeight: 5,
        tags: ["1장 초동", "식물", "묘지"],
      },
      {
        id: "plague-garden-gardener",
        name: "역병정원의 정원사",
        role: "starter2",
        inclusion: 0.76,
        averageCopies: 2.3,
        preferredCopies: 2,
        powerWeight: 17,
        unpleasantWeight: 5,
        tags: ["식물", "토큰", "외부 사용"],
      },
      {
        id: "plague-garden-infected-root",
        name: "역병정원의 감염 뿌리",
        role: "bridge",
        inclusion: 0.95,
        averageCopies: 2.5,
        preferredCopies: 3,
        powerWeight: 24,
        unpleasantWeight: 30,
        tags: ["약화", "묘지 봉쇄", "병목"],
      },
      {
        id: "plague-garden-bloom-tree",
        name: "역병정원의 만개수",
        role: "finisher",
        inclusion: 0.97,
        averageCopies: 1.2,
        preferredCopies: 1,
        powerWeight: 21,
        unpleasantWeight: 45,
        tags: ["지속 피해", "행동 제약", "결과물"],
      },
      {
        id: "plague-garden-compost-cycle",
        name: "역병정원의 퇴비 순환",
        role: "recursion",
        inclusion: 0.83,
        averageCopies: 2.4,
        preferredCopies: 2,
        powerWeight: 16,
        unpleasantWeight: 15,
        tags: ["묘지", "회수", "장기전"],
      },
    ],
  },
  {
    id: "flame-arena",
    name: "화염투기",
    shortName: "화염투기",
    playstyle: "초반부터 공격을 몰아쳐 한 번의 전투로 승부를 끝내는 속공 OTK",
    aesthetic: "투기장, 열혈 스포츠, 불꽃",
    basePower: 67,
    baseUnpleasantness: 54,
    appeal: 75,
    difficulty: 36,
    optimizationDays: 6,
    counterClarity: 75,
    startingShare: 0.08,
    color: "#F97316",
    parts: [
      {
        id: "flame-arena-challenger",
        name: "화염투기의 도전자",
        role: "starter1",
        inclusion: 0.98,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 30,
        unpleasantWeight: 15,
        tags: ["1장 초동", "화염", "전사"],
      },
      {
        id: "flame-arena-opening-roar",
        name: "화염투기의 개막 함성",
        role: "starter2",
        inclusion: 0.89,
        averageCopies: 2.8,
        preferredCopies: 3,
        powerWeight: 20,
        unpleasantWeight: 10,
        tags: ["전사", "외부 사용", "속공"],
      },
      {
        id: "flame-arena-consecutive-match",
        name: "화염투기의 연속 승부",
        role: "bridge",
        inclusion: 0.94,
        averageCopies: 2.6,
        preferredCopies: 3,
        powerWeight: 20,
        unpleasantWeight: 25,
        tags: ["연속 공격", "병목", "전투"],
      },
      {
        id: "flame-arena-undefeated-champion",
        name: "화염투기의 불패 챔피언",
        role: "finisher",
        inclusion: 0.96,
        averageCopies: 1.3,
        preferredCopies: 1,
        powerWeight: 22,
        unpleasantWeight: 40,
        tags: ["OTK", "돌파", "결과물"],
      },
      {
        id: "flame-arena-final-flame",
        name: "화염투기의 최후 불꽃",
        role: "recursion",
        inclusion: 0.57,
        averageCopies: 1.4,
        preferredCopies: 1,
        powerWeight: 8,
        unpleasantWeight: 10,
        tags: ["번", "자멸", "고점"],
      },
    ],
  },
  {
    id: "phantasm-troupe",
    name: "환몽극단",
    shortName: "환몽극단",
    playstyle: "함정과 대상 변경으로 상대의 수를 비틀어 되받아치는 심리전 컨트롤",
    aesthetic: "몽환 서커스, 가면, 화려한 무대",
    basePower: 62,
    baseUnpleasantness: 72,
    appeal: 87,
    difficulty: 73,
    optimizationDays: 20,
    counterClarity: 50,
    startingShare: 0.08,
    color: "#DB2777",
    parts: [
      {
        id: "phantasm-troupe-opening-clown",
        name: "환몽극단의 막여는 광대",
        role: "starter1",
        inclusion: 0.9,
        averageCopies: 2.8,
        preferredCopies: 3,
        powerWeight: 19,
        unpleasantWeight: 5,
        tags: ["함정 설치", "환상", "순수 구축"],
      },
      {
        id: "phantasm-troupe-dream-invitation",
        name: "환몽극단의 꿈결 초대장",
        role: "starter2",
        inclusion: 0.78,
        averageCopies: 2.3,
        preferredCopies: 2,
        powerWeight: 16,
        unpleasantWeight: 5,
        tags: ["마법사", "함정", "외부 사용"],
      },
      {
        id: "phantasm-troupe-scene-change",
        name: "환몽극단의 장면 전환",
        role: "bridge",
        inclusion: 0.98,
        averageCopies: 2.8,
        preferredCopies: 3,
        powerWeight: 25,
        unpleasantWeight: 32,
        tags: ["교대", "대상 변경", "병목"],
      },
      {
        id: "phantasm-troupe-prima",
        name: "환몽극단의 프리마",
        role: "finisher",
        inclusion: 0.99,
        averageCopies: 1.1,
        preferredCopies: 1,
        powerWeight: 25,
        unpleasantWeight: 43,
        tags: ["무효", "대상 전환", "결과물"],
      },
      {
        id: "phantasm-troupe-encore",
        name: "환몽극단의 앙코르",
        role: "recursion",
        inclusion: 0.81,
        averageCopies: 2.1,
        preferredCopies: 2,
        powerWeight: 15,
        unpleasantWeight: 15,
        tags: ["함정 회수", "장기전", "복구"],
      },
    ],
  },
  {
    id: "colossus",
    name: "거신",
    shortName: "거신",
    playstyle: "제물을 모아 제거하기 어려운 하나의 거대 결과물을 세우는 타워형 램프",
    aesthetic: "고대 유적, 암석, 거대 괴수",
    basePower: 58,
    baseUnpleasantness: 67,
    appeal: 63,
    difficulty: 46,
    optimizationDays: 10,
    counterClarity: 80,
    startingShare: 0.05,
    color: "#78716C",
    parts: [
      {
        id: "colossus-ruin-expedition",
        name: "거신의 유적 탐사대",
        role: "starter1",
        inclusion: 0.95,
        averageCopies: 3,
        preferredCopies: 3,
        powerWeight: 28,
        unpleasantWeight: 5,
        tags: ["1장 초동", "땅", "탐색"],
      },
      {
        id: "colossus-monolith-seed",
        name: "거신의 거석 씨앗",
        role: "starter2",
        inclusion: 0.75,
        averageCopies: 2.2,
        preferredCopies: 2,
        powerWeight: 18,
        unpleasantWeight: 5,
        tags: ["암석", "제물", "외부 사용"],
      },
      {
        id: "colossus-earth-altar",
        name: "거신의 대지 제단",
        role: "bridge",
        inclusion: 0.98,
        averageCopies: 2.5,
        preferredCopies: 3,
        powerWeight: 25,
        unpleasantWeight: 20,
        tags: ["제물 가속", "병목", "지속"],
      },
      {
        id: "colossus-ancient-king-atlas",
        name: "거신의 태초왕 아틀라스",
        role: "finisher",
        inclusion: 1,
        averageCopies: 1,
        preferredCopies: 1,
        powerWeight: 22,
        unpleasantWeight: 60,
        tags: ["완전 내성", "타워", "결과물"],
      },
      {
        id: "colossus-civilization-echo",
        name: "거신의 문명 잔향",
        role: "recursion",
        inclusion: 0.59,
        averageCopies: 1.5,
        preferredCopies: 2,
        powerWeight: 7,
        unpleasantWeight: 10,
        tags: ["회수", "장기전", "복구"],
      },
    ],
  },
] satisfies ThemeContentBase[];

export const THEMES: ThemeContent[] = [
  ...HANDCRAFTED_THEMES.map((theme) =>
    withPlayKeywords(
      attachNamedSupportParts(theme, HANDCRAFTED_SUPPORT_NAMES[theme.id]),
    ),
  ),
  ...ORIGINAL_FUTURE_THEMES,
];
function validateThemeCatalog(themes: readonly ThemeContent[]) {
  if (themes.length !== 150) {
    throw new Error(
      `Theme catalog must contain exactly 150 themes; received ${themes.length}.`,
    );
  }

  const themeIds = new Set<string>();
  const themeNames = new Set<string>();
  const shortNames = new Set<string>();
  const partIds = new Set<string>();
  const partNames = new Set<string>();

  for (const theme of themes) {
    if (themeIds.has(theme.id)) {
      throw new Error(`Duplicate theme id in catalog: ${theme.id}`);
    }
    if (themeNames.has(theme.name)) {
      throw new Error(`Duplicate theme name in catalog: ${theme.name}`);
    }
    if (shortNames.has(theme.shortName)) {
      throw new Error(`Duplicate theme short name in catalog: ${theme.shortName}`);
    }
    if (theme.parts.length !== TOTAL_THEME_PART_COUNT) {
      throw new Error(
        `Theme ${theme.id} must contain exactly ${TOTAL_THEME_PART_COUNT} parts; received ${theme.parts.length}.`,
      );
    }
    if (
      theme.playKeywords.length !== PLAY_KEYWORDS_PER_THEME ||
      new Set(theme.playKeywords).size !== PLAY_KEYWORDS_PER_THEME ||
      theme.playKeywords.some(
        (keyword) => !Object.hasOwn(PLAY_KEYWORD_CATALOG, keyword),
      )
    ) {
      throw new Error(
        `Theme ${theme.id} must contain exactly ${PLAY_KEYWORDS_PER_THEME} unique play keywords.`,
      );
    }

    themeIds.add(theme.id);
    themeNames.add(theme.name);
    shortNames.add(theme.shortName);

    const launchRoles = new Set(
      theme.parts.slice(0, INITIAL_THEME_PART_COUNT).map((part) => part.role),
    );
    if (launchRoles.size !== INITIAL_THEME_PART_COUNT) {
      throw new Error(`Theme ${theme.id} must contain one part for every role.`);
    }

    for (const part of theme.parts) {
      if (partIds.has(part.id)) {
        throw new Error(`Duplicate part id in catalog: ${part.id}`);
      }
      if (partNames.has(part.name)) {
        throw new Error(`Duplicate part name in catalog: ${part.name}`);
      }
      partIds.add(part.id);
      partNames.add(part.name);
    }
  }

  if (partIds.size !== themes.length * TOTAL_THEME_PART_COUNT) {
    throw new Error(
      `Theme catalog must contain exactly ${
        themes.length * TOTAL_THEME_PART_COUNT
      } unique parts; received ${partIds.size}.`,
    );
  }
}

validateThemeCatalog(THEMES);

export const THEME_BY_ID = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme]),
) as Record<ThemeId, ThemeContent>;
