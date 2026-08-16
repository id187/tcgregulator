import type { ThemeContent, ThemeId } from "./types";

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
] satisfies ThemeContent[];

/**
 * Future catalog themes are deliberately generated from two small vocabularies.
 * This keeps the large catalog reviewable while still exposing ordinary,
 * deterministic ThemeContent objects to the simulation.
 */
const FUTURE_THEME_ROOTS = [
  {
    marker: "월영",
    slug: "moonshade",
    motif: "달빛과 그림자",
    visual: "남보라 달빛, 긴 그림자, 은빛 장식",
  },
  {
    marker: "뇌화",
    slug: "thunderbloom",
    motif: "번개와 개화",
    visual: "황금 번개, 붉은 꽃잎, 먹구름",
  },
  {
    marker: "청린",
    slug: "azure-scale",
    motif: "용의 비늘과 파도",
    visual: "청옥 비늘, 물결 문양, 푸른 용각",
  },
  {
    marker: "묵령",
    slug: "ink-spirit",
    motif: "먹과 기록의 정령",
    visual: "먹빛 정령, 번지는 붓선, 한지 부적",
  },
  {
    marker: "홍련",
    slug: "crimson-lotus",
    motif: "불꽃과 붉은 연꽃",
    visual: "진홍 연꽃, 흩날리는 불티, 금빛 화관",
  },
  {
    marker: "풍아",
    slug: "wind-fang",
    motif: "바람과 맹수의 송곳니",
    visual: "비취 바람, 흰 깃털, 날카로운 송곳니",
  },
  {
    marker: "설화",
    slug: "snowblossom",
    motif: "눈꽃과 푸른 서리",
    visual: "눈꽃 결정, 푸른 서리, 유리 갑주",
  },
  {
    marker: "금오",
    slug: "golden-crow",
    motif: "태양과 세 발 까마귀",
    visual: "검은 태양, 금빛 날개, 고대 청동",
  },
  {
    marker: "유성",
    slug: "meteor",
    motif: "별빛과 낙하하는 운석",
    visual: "밤하늘 궤적, 보랏빛 운석, 은빛 별가루",
  },
  // Expansion catalog roots. Keeping these after the original nine preserves
  // every existing future-001..090 theme while appending future-091..140.
  {
    marker: "경면",
    slug: "mirror-realm",
    motif: "거울 세계와 반사된 분신",
    visual: "은빛 손거울, 깨진 유리면, 좌우대칭 눈동자",
  },
  {
    marker: "태엽",
    slug: "clockwork-spring",
    motif: "태엽 장치와 되감기는 시간",
    visual: "황동 태엽키, 청록 시계바늘, 동심원 톱니",
  },
  {
    marker: "해등",
    slug: "abyssal-lantern",
    motif: "심해의 등불과 발광 해파리",
    visual: "청록 발광낭, 반투명 촉수, 짙은 남색 수압환",
  },
  {
    marker: "몽접",
    slug: "dream-butterfly",
    motif: "꿈을 옮기는 나비와 수면의 안개",
    visual: "무지갯빛 나비날개, 자주색 수면안개, 초승달 더듬이",
  },
  {
    marker: "석림",
    slug: "stone-grove",
    motif: "살아 움직이는 바위숲과 고대 거석",
    visual: "현무암 기둥, 형광 이끼, 주황 룬 각인",
  },
] as const;

const FUTURE_THEME_ORDERS = [
  {
    suffix: "검단",
    slug: "blade-order",
    plan: "전투 진입과 연속 공격을 잇는 정공법 비트",
    visual: "의장검과 기동 전투복",
  },
  {
    suffix: "성좌",
    slug: "constellation",
    plan: "표식을 쌓아 궤도 효과를 연쇄하는 계산형 콤보",
    visual: "천구의와 별자리 문장",
  },
  {
    suffix: "기담",
    slug: "strange-tales",
    plan: "공개 정보와 비공개 함정으로 선택을 강요하는 트릭 컨트롤",
    visual: "고서와 괴이한 가면",
  },
  {
    suffix: "공방",
    slug: "workshop",
    plan: "재료를 축적해 장비와 결과물을 조립하는 성장형 미드레인지",
    visual: "작업대와 마도 공구",
  },
  {
    suffix: "사도",
    slug: "apostles",
    plan: "낮은 비용의 추종자를 교환하며 의식 보상을 여는 순환형 전개",
    visual: "성상과 의식복",
  },
  {
    suffix: "악단",
    slug: "ensemble",
    plan: "서로 다른 파츠의 음색을 맞춰 연주 보너스를 얻는 조율형 콤보",
    visual: "악기와 무대 조명",
  },
  {
    suffix: "왕조",
    slug: "dynasty",
    plan: "세대별 유닛을 계승해 필드 우위를 굳히는 장기전 미드레인지",
    visual: "궁정 문양과 왕관",
  },
  {
    suffix: "학파",
    slug: "academy",
    plan: "주문 속성을 조합해 상황별 해답을 만드는 툴박스 컨트롤",
    visual: "서고와 다층 마법진",
  },
  {
    suffix: "함대",
    slug: "fleet",
    plan: "선박을 전개하고 진형을 바꿔 공격선을 만드는 대형 전개",
    visual: "갑판과 항해 깃발",
  },
  {
    suffix: "수호대",
    slug: "guard",
    plan: "방어 태세와 반격 자원을 오가며 상대 전개를 받아치는 수비형 템포",
    visual: "방패와 성벽 문장",
  },
] as const;

const FUTURE_PART_BLUEPRINTS = [
  {
    role: "starter1",
    titles: [
      "새벽을 여는 선봉",
      "문지기 견습생",
      "첫 맹약의 전령",
      "기동하는 탐색자",
      "징표를 새기는 시종",
      "봉인을 푸는 술사",
      "전선을 여는 척후",
      "첫 궤도의 안내자",
      "의식을 여는 사제",
      "기원을 부르는 소환사",
    ],
    inclusion: 0.93,
    averageCopies: 3,
    preferredCopies: 3,
    powerWeight: 25,
    unpleasantWeight: 8,
    roleTags: ["1장 초동", "주력 초동"],
  },
  {
    role: "starter2",
    titles: [
      "숨은 길잡이",
      "두 번째 전령",
      "예비대의 기수",
      "갈림길의 관측자",
      "비밀 공방의 조수",
      "후속 맹약의 집행자",
      "원정대 기록관",
      "측면을 여는 정찰자",
      "공명의 연주자",
      "별동대 지휘관",
    ],
    inclusion: 0.8,
    averageCopies: 2.4,
    preferredCopies: 2,
    powerWeight: 18,
    unpleasantWeight: 8,
    roleTags: ["보조 초동", "후속 전개"],
  },
  {
    role: "bridge",
    titles: [
      "이어지는 맹약",
      "전환의 회랑",
      "공명의 장치",
      "계승의 의식",
      "연쇄하는 진형",
      "중계 관문",
      "뒤집힌 전술서",
      "합류의 신호",
      "증폭의 제단",
      "교차하는 궤도",
    ],
    inclusion: 0.88,
    averageCopies: 2.1,
    preferredCopies: 2,
    powerWeight: 22,
    unpleasantWeight: 24,
    roleTags: ["중간다리", "전개 연결"],
  },
  {
    role: "finisher",
    titles: [
      "종언의 군주",
      "천개하는 성채",
      "최후의 집행자",
      "완성형 거신",
      "왕좌의 계승자",
      "대단원의 지휘자",
      "무한궤도 함장",
      "결전의 수호신",
      "황혼을 삼킨 용",
      "승리의 화신",
    ],
    inclusion: 0.95,
    averageCopies: 1.2,
    preferredCopies: 1,
    powerWeight: 22,
    unpleasantWeight: 45,
    roleTags: ["최종 결과물", "승리 수단"],
  },
  {
    role: "recursion",
    titles: [
      "귀환의 서약",
      "남겨진 씨앗",
      "되감는 기록",
      "재기의 봉화",
      "순환의 묘지기",
      "두 번째 막",
      "회수하는 사서",
      "잔향의 부름",
      "불멸의 잔재",
      "새벽의 재건",
    ],
    inclusion: 0.72,
    averageCopies: 1.8,
    preferredCopies: 2,
    powerWeight: 13,
    unpleasantWeight: 15,
    roleTags: ["자원 회수", "장기전"],
  },
] as const;

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function makeFutureTheme(
  rootIndex: number,
  orderIndex: number,
): ThemeContent {
  const root = FUTURE_THEME_ROOTS[rootIndex];
  const order = FUTURE_THEME_ORDERS[orderIndex];
  const catalogIndex = rootIndex * FUTURE_THEME_ORDERS.length + orderIndex;
  const number = String(catalogIndex + 1).padStart(3, "0");
  const id = `future-${number}-${root.slug}-${order.slug}`;
  const name = `${root.marker}${order.suffix}`;

  return {
    id,
    name,
    shortName: name,
    playstyle: `${root.motif} 테마로, ${order.plan}`,
    aesthetic: `${root.visual}, ${order.visual}`,
    basePower: 58 + ((catalogIndex * 7 + orderIndex) % 15),
    baseUnpleasantness: 34 + ((catalogIndex * 11 + rootIndex) % 31),
    appeal: 55 + ((catalogIndex * 13 + orderIndex) % 31),
    difficulty: 38 + ((catalogIndex * 17 + rootIndex) % 43),
    optimizationDays: 7 + ((catalogIndex * 5 + orderIndex) % 18),
    counterClarity: 45 + ((catalogIndex * 7 + rootIndex) % 36),
    startingShare: 0,
    color: `hsl(${(catalogIndex * 47 + rootIndex * 13) % 360} ${
      55 + (orderIndex % 4) * 5
    }% ${42 + (rootIndex % 3) * 5}%)`,
    parts: FUTURE_PART_BLUEPRINTS.map((blueprint, partIndex) => {
      const titleIndex = (catalogIndex + rootIndex + partIndex * 2) % blueprint.titles.length;
      const partTitle = blueprint.titles[titleIndex].replaceAll("의 ", " ");
      const inclusionOffset =
        (((catalogIndex + 1) * (partIndex + 2)) % 5 - 2) * 0.01;
      const copiesOffset = ((catalogIndex + partIndex * 2) % 3 - 1) * 0.1;

      return {
        id: `${id}-${blueprint.role}`,
        name: `${name}의 ${partTitle}`,
        role: blueprint.role,
        inclusion: clampRatio(blueprint.inclusion + inclusionOffset),
        averageCopies: Number(
          Math.max(1, blueprint.averageCopies + copiesOffset).toFixed(1),
        ),
        preferredCopies: blueprint.preferredCopies,
        powerWeight: blueprint.powerWeight,
        unpleasantWeight: blueprint.unpleasantWeight,
        tags: [root.marker, order.suffix, ...blueprint.roleTags],
      };
    }),
  };
}

const FUTURE_THEMES: ThemeContent[] = FUTURE_THEME_ROOTS.flatMap(
  (_, rootIndex) =>
    FUTURE_THEME_ORDERS.map((__, orderIndex) =>
      makeFutureTheme(rootIndex, orderIndex),
    ),
);

const SUPPORT_PART_BLUEPRINTS = [
  {
    suffix: "개벽의 선봉",
    role: "starter1",
    inclusion: 0.88,
    averageCopies: 2.7,
    preferredCopies: 3,
    powerWeight: 8,
    unpleasantWeight: 5,
    tags: ["지원 1차", "초동"],
  },
  {
    suffix: "교차하는 전술",
    role: "bridge",
    inclusion: 0.82,
    averageCopies: 2.1,
    preferredCopies: 2,
    powerWeight: 7,
    unpleasantWeight: 9,
    tags: ["지원 1차", "중간다리"],
  },
  {
    suffix: "새벽의 화신",
    role: "finisher",
    inclusion: 0.76,
    averageCopies: 1.2,
    preferredCopies: 1,
    powerWeight: 7,
    unpleasantWeight: 13,
    tags: ["지원 1차", "결과물"],
  },
  {
    suffix: "경계를 넘는 정찰자",
    role: "starter2",
    inclusion: 0.9,
    averageCopies: 2.6,
    preferredCopies: 3,
    powerWeight: 8,
    unpleasantWeight: 6,
    tags: ["지원 2차", "보조 초동"],
  },
  {
    suffix: "봉쇄의 역설",
    role: "bridge",
    inclusion: 0.84,
    averageCopies: 2,
    preferredCopies: 2,
    powerWeight: 7,
    unpleasantWeight: 12,
    tags: ["지원 2차", "견제"],
  },
  {
    suffix: "되살아난 맹세",
    role: "recursion",
    inclusion: 0.78,
    averageCopies: 1.9,
    preferredCopies: 2,
    powerWeight: 6,
    unpleasantWeight: 7,
    tags: ["지원 2차", "자원 회수"],
  },
  {
    suffix: "무결점의 계승자",
    role: "starter1",
    inclusion: 0.94,
    averageCopies: 3,
    preferredCopies: 3,
    powerWeight: 9,
    unpleasantWeight: 8,
    tags: ["지원 3차", "완성형 초동"],
  },
  {
    suffix: "운명을 덮는 회랑",
    role: "bridge",
    inclusion: 0.91,
    averageCopies: 2.5,
    preferredCopies: 3,
    powerWeight: 8,
    unpleasantWeight: 13,
    tags: ["지원 3차", "전개 연결"],
  },
  {
    suffix: "종언의 지배자",
    role: "finisher",
    inclusion: 0.87,
    averageCopies: 1.3,
    preferredCopies: 1,
    powerWeight: 9,
    unpleasantWeight: 17,
    tags: ["지원 3차", "최종 결과물"],
  },
] as const;

function prepareFullPartPool(theme: ThemeContent): ThemeContent {
  if (theme.parts.length !== INITIAL_THEME_PART_COUNT) {
    throw new Error(
      `Theme ${theme.id} must begin with exactly ${INITIAL_THEME_PART_COUNT} launch parts.`,
    );
  }

  const supportParts = SUPPORT_PART_BLUEPRINTS.map((blueprint, index) => ({
    id: `${theme.id}-support-${Math.floor(index / SUPPORT_PARTS_PER_RELEASE) + 1}-${
      (index % SUPPORT_PARTS_PER_RELEASE) + 1
    }`,
    name: `${theme.shortName} ${blueprint.suffix}`,
    role: blueprint.role,
    inclusion: blueprint.inclusion,
    averageCopies: blueprint.averageCopies,
    preferredCopies: blueprint.preferredCopies,
    powerWeight: blueprint.powerWeight,
    unpleasantWeight: blueprint.unpleasantWeight,
    tags: [...blueprint.tags],
  }));

  return { ...theme, parts: [...theme.parts, ...supportParts] };
}

export const THEMES: ThemeContent[] = [
  ...HANDCRAFTED_THEMES,
  ...FUTURE_THEMES,
].map(prepareFullPartPool);

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

    themeIds.add(theme.id);
    themeNames.add(theme.name);
    shortNames.add(theme.shortName);

    const launchRoles = new Set(
      theme.parts.slice(0, INITIAL_THEME_PART_COUNT).map((part) => part.role),
    );
    if (launchRoles.size !== FUTURE_PART_BLUEPRINTS.length) {
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

/**
 * Baseline game-one win probability with every part unlimited. Rows are the
 * player's theme, columns are the opposing theme. Opposite cells sum to 1.
 */
export const MATCHUP_TABLE = {
  cycle: {
    cycle: 0.5,
    "white-night": 0.55,
    "machine-revolution": 0.43,
    ironblood: 0.55,
    abyss: 0.48,
    nebula: 0.46,
    "plague-garden": 0.44,
    "flame-arena": 0.54,
    "phantasm-troupe": 0.57,
    colossus: 0.49,
  },
  "white-night": {
    cycle: 0.45,
    "white-night": 0.5,
    "machine-revolution": 0.54,
    ironblood: 0.56,
    abyss: 0.45,
    nebula: 0.49,
    "plague-garden": 0.54,
    "flame-arena": 0.58,
    "phantasm-troupe": 0.5,
    colossus: 0.43,
  },
  "machine-revolution": {
    cycle: 0.57,
    "white-night": 0.46,
    "machine-revolution": 0.5,
    ironblood: 0.61,
    abyss: 0.42,
    nebula: 0.48,
    "plague-garden": 0.5,
    "flame-arena": 0.55,
    "phantasm-troupe": 0.46,
    colossus: 0.62,
  },
  ironblood: {
    cycle: 0.45,
    "white-night": 0.44,
    "machine-revolution": 0.39,
    ironblood: 0.5,
    abyss: 0.52,
    nebula: 0.45,
    "plague-garden": 0.56,
    "flame-arena": 0.51,
    "phantasm-troupe": 0.48,
    colossus: 0.47,
  },
  abyss: {
    cycle: 0.52,
    "white-night": 0.55,
    "machine-revolution": 0.58,
    ironblood: 0.48,
    abyss: 0.5,
    nebula: 0.52,
    "plague-garden": 0.55,
    "flame-arena": 0.44,
    "phantasm-troupe": 0.54,
    colossus: 0.58,
  },
  nebula: {
    cycle: 0.54,
    "white-night": 0.51,
    "machine-revolution": 0.52,
    ironblood: 0.55,
    abyss: 0.48,
    nebula: 0.5,
    "plague-garden": 0.54,
    "flame-arena": 0.53,
    "phantasm-troupe": 0.48,
    colossus: 0.57,
  },
  "plague-garden": {
    cycle: 0.56,
    "white-night": 0.46,
    "machine-revolution": 0.5,
    ironblood: 0.44,
    abyss: 0.45,
    nebula: 0.46,
    "plague-garden": 0.5,
    "flame-arena": 0.43,
    "phantasm-troupe": 0.49,
    colossus: 0.54,
  },
  "flame-arena": {
    cycle: 0.46,
    "white-night": 0.42,
    "machine-revolution": 0.45,
    ironblood: 0.49,
    abyss: 0.56,
    nebula: 0.47,
    "plague-garden": 0.57,
    "flame-arena": 0.5,
    "phantasm-troupe": 0.46,
    colossus: 0.57,
  },
  "phantasm-troupe": {
    cycle: 0.43,
    "white-night": 0.5,
    "machine-revolution": 0.54,
    ironblood: 0.52,
    abyss: 0.46,
    nebula: 0.52,
    "plague-garden": 0.51,
    "flame-arena": 0.54,
    "phantasm-troupe": 0.5,
    colossus: 0.55,
  },
  colossus: {
    cycle: 0.51,
    "white-night": 0.57,
    "machine-revolution": 0.38,
    ironblood: 0.53,
    abyss: 0.42,
    nebula: 0.43,
    "plague-garden": 0.46,
    "flame-arena": 0.43,
    "phantasm-troupe": 0.45,
    colossus: 0.5,
  },
} satisfies Record<ThemeId, Record<ThemeId, number>>;
