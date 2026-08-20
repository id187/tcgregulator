/**
 * Public, display-safe vocabulary for the strategic traits of a theme.
 *
 * Matchup edges deliberately stay private to this module. Callers can render
 * labels and descriptions without turning the management UI into an explicit
 * advantage chart.
 */
export const PLAY_KEYWORD_CATALOG = {
  rush: {
    label: "속공",
    description: "초반부터 공격 자원을 집중하는 빠른 압박형 덱입니다.",
  },
  tempo: {
    label: "주도권",
    description: "짧은 교환과 행동 순서 조절로 흐름을 이어가는 덱입니다.",
  },
  setup: {
    label: "축적",
    description: "여러 단계에 걸쳐 자원과 조건을 쌓는 준비형 덱입니다.",
  },
  fortress: {
    label: "수비",
    description: "보호 효과와 방어 구조를 중심으로 판을 유지하는 덱입니다.",
  },
  midrange: {
    label: "중속",
    description: "위협과 대응 수단을 균형 있게 운용하는 중속 덱입니다.",
  },
  ramp: {
    label: "가속",
    description: "자원 생산을 앞당겨 큰 비용의 행동으로 연결하는 덱입니다.",
  },
  reactive: {
    label: "반응",
    description: "조건을 준비하고 발생한 행동에 맞춰 움직이는 반응형 덱입니다.",
  },
  gambit: {
    label: "승부수",
    description: "비용과 불확실성을 감수하고 큰 보상을 노리는 덱입니다.",
  },
  combo: {
    label: "연쇄",
    description: "여러 파츠와 효과를 정해진 순서로 잇는 연쇄형 덱입니다.",
  },
  control: {
    label: "봉쇄",
    description: "지속 효과와 교환 수단으로 행동 경로를 좁히는 덱입니다.",
  },
  toolbox: {
    label: "대응",
    description: "상황에 맞는 파츠를 찾아 선택지를 바꾸는 툴박스 덱입니다.",
  },
  attrition: {
    label: "장기전",
    description: "반복 교환과 자원 누적으로 긴 게임을 운영하는 덱입니다.",
  },
  recursion: {
    label: "순환",
    description: "소모된 카드와 효과를 다시 사용하는 재사용형 덱입니다.",
  },
  transformation: {
    label: "변환",
    description: "카드의 형태·역할·상태를 바꾸며 운용하는 덱입니다.",
  },
  territory: {
    label: "공간",
    description: "위치·열·구역·진형 배치를 전술 자원으로 쓰는 덱입니다.",
  },
  countdown: {
    label: "예약",
    description: "정해 둔 시점과 단계 진행에 맞춰 효과를 쓰는 지연형 덱입니다.",
  },
  disruption: {
    label: "견제",
    description: "무효·제거·행동 제한을 끼워 넣는 견제 중심 덱입니다.",
  },
  resilience: {
    label: "복원",
    description: "손실된 파츠와 자원을 복구하며 전선을 재구축하는 덱입니다.",
  },
  swarm: {
    label: "전개",
    description: "여러 개체와 토큰을 한꺼번에 펼치는 광역 전개형 덱입니다.",
  },
  burst: {
    label: "폭발력",
    description: "한 턴의 화력이나 단일 결과물에 출력을 집중하는 덱입니다.",
  },
  consistency: {
    label: "안정성",
    description: "중복 초동과 검색으로 같은 플랜을 안정적으로 재현하는 덱입니다.",
  },
  protection: {
    label: "보호",
    description: "핵심 파츠에 보호·대체·내성을 겹쳐 유지하는 덱입니다.",
  },
  mobility: {
    label: "기동",
    description: "카드·표식·대상을 구역 사이로 옮기며 전개하는 덱입니다.",
  },
  deception: {
    label: "기만",
    description: "비공개 정보·매복·대상 변경으로 실제 수를 감추는 덱입니다.",
  },
} as const;

export type PlayKeyword = keyof typeof PLAY_KEYWORD_CATALOG;
export type ThemePlayKeywords = readonly [
  PlayKeyword,
  PlayKeyword,
  PlayKeyword,
];

export const PLAY_KEYWORD_IDS = Object.freeze(
  Object.keys(PLAY_KEYWORD_CATALOG) as PlayKeyword[],
);

export const PLAY_KEYWORDS_PER_THEME = 3;

/**
 * A cap of 0.32 log-odds limits a keyword package to less than an eight-point
 * win-probability swing at the most sensitive 50% baseline. Raw power remains
 * independently relevant in the engine.
 */
export const KEYWORD_MATCHUP_LOGIT_CAP = 0.32;
/** Fixed keywords plus released counterplay support cannot exceed this bound. */
export const STRATEGIC_MATCHUP_LOGIT_CAP = 0.42;
export const COUNTERPLAY_SUPPORT_FIRST_LOGIT_BONUS = 0.12;
export const COUNTERPLAY_SUPPORT_REPEAT_LOGIT_BONUS = 0.04;
export const COUNTERPLAY_SUPPORT_LOGIT_CAP = 0.2;
const LOGIT_PER_EDGE = 0.08;

type KeywordCatalogEntry = (typeof PLAY_KEYWORD_CATALOG)[PlayKeyword];

export function getPlayKeyword(
  keyword: PlayKeyword,
): KeywordCatalogEntry {
  return PLAY_KEYWORD_CATALOG[keyword];
}

export function getPlayKeywordLabel(keyword: PlayKeyword): string {
  return getPlayKeyword(keyword).label;
}

type KeywordThemeSource = {
  id: string;
  playstyle: string;
  basePower: number;
  baseUnpleasantness: number;
  difficulty: number;
  optimizationDays: number;
  counterClarity: number;
  parts: ReadonlyArray<{
    role: "starter1" | "starter2" | "bridge" | "finisher" | "recursion";
    inclusion: number;
    preferredCopies: number;
    powerWeight: number;
  }>;
};

const HANDCRAFTED_KEYWORDS: Readonly<Record<string, ThemePlayKeywords>> = {
  cycle: ["midrange", "recursion", "resilience"],
  "white-night": ["fortress", "control", "protection"],
  "machine-revolution": ["setup", "combo", "swarm"],
  ironblood: ["midrange", "attrition", "consistency"],
  abyss: ["rush", "control", "disruption"],
  nebula: ["tempo", "toolbox", "mobility"],
  "plague-garden": ["setup", "control", "disruption"],
  "flame-arena": ["rush", "combo", "burst"],
  "phantasm-troupe": ["reactive", "control", "deception"],
  colossus: ["ramp", "combo", "protection"],
};

function includesAny(text: string, fragments: readonly string[]): number {
  return fragments.reduce(
    (score, fragment) => score + (text.includes(fragment) ? 1 : 0),
    0,
  );
}

function roleMetric(
  theme: KeywordThemeSource,
  role: KeywordThemeSource["parts"][number]["role"],
): number {
  const part = theme.parts.find((candidate) => candidate.role === role);
  return part ? part.inclusion * part.powerWeight : 0;
}

function chooseHighest<T extends PlayKeyword>(
  candidates: readonly T[],
  score: (keyword: T) => number,
): T {
  return candidates.reduce((best, keyword) =>
    score(keyword) > score(best) ? keyword : best,
  );
}

/**
 * A tiny content-identity tie break. It only decides close scores; explicit
 * playstyle words and authored ratings remain the dominant signal. Because it
 * depends on the immutable theme id, catalog assignment never changes with a
 * save seed or campaign state.
 */
function stableThemeAffinity(themeId: string, keyword: PlayKeyword): number {
  const text = `${themeId}:${keyword}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function authoredScore(
  theme: KeywordThemeSource,
  keyword: PlayKeyword,
  textScore: number,
  ratingScore: number,
): number {
  return textScore * 6 + ratingScore + stableThemeAffinity(theme.id, keyword) * 1.4;
}

/**
 * Derives one pace, one game plan, and one tactical trait from authored theme
 * identity and ratings. Eight candidates on each axis keep the vocabulary
 * expressive while guaranteeing exactly three non-overlapping keywords. The
 * result is stable across saves and campaign seeds.
 */
export function derivePlayKeywords(
  theme: KeywordThemeSource,
): ThemePlayKeywords {
  const override = HANDCRAFTED_KEYWORDS[theme.id];
  if (override) return override;

  const text = theme.playstyle.toLowerCase();
  const paceScores: Record<
    | "rush"
    | "tempo"
    | "setup"
    | "fortress"
    | "midrange"
    | "ramp"
    | "reactive"
    | "gambit",
    number
  > = {
    rush: authoredScore(
      theme,
      "rush",
      includesAny(text, ["속공", "어그로", "초반", "선공", "돌진", "질주", "연속 공격"]),
      theme.basePower * 0.018 - theme.optimizationDays * 0.025,
    ),
    tempo: authoredScore(
      theme,
      "tempo",
      includesAny(text, ["템포", "박자", "교환", "주도권", "비트", "공격과", "자세"]),
      theme.counterClarity * 0.012 + theme.basePower * 0.008,
    ),
    setup: authoredScore(
      theme,
      "setup",
      includesAny(text, ["축적", "쌓", "성장", "모아", "준비", "단계", "누적", "저장"]),
      theme.optimizationDays * 0.035 + theme.difficulty * 0.006,
    ),
    fortress: authoredScore(
      theme,
      "fortress",
      includesAny(text, ["수비", "방어", "성벽", "요새", "버티", "방벽", "진지", "전열"]),
      (100 - theme.basePower) * 0.016 + theme.counterClarity * 0.009,
    ),
    midrange: authoredScore(
      theme,
      "midrange",
      includesAny(text, ["미드레인지", "중속", "운영", "균형", "제작", "왕조", "비트"]),
      (100 - Math.abs(theme.basePower - 68)) * 0.012 + theme.counterClarity * 0.004,
    ),
    ramp: authoredScore(
      theme,
      "ramp",
      includesAny(text, ["램프", "가속", "대형", "거대", "중량", "앞당기", "자원량"]),
      roleMetric(theme, "finisher") * 0.032 + theme.optimizationDays * 0.012,
    ),
    reactive: authoredScore(
      theme,
      "reactive",
      includesAny(text, ["반응", "반격", "함정", "매복", "요격", "경계", "침입", "상대 행동"]),
      theme.baseUnpleasantness * 0.012 + theme.counterClarity * 0.008,
    ),
    gambit: authoredScore(
      theme,
      "gambit",
      includesAny(text, ["위험", "보상", "확률", "도박", "판돈", "불확실", "감수", "깨질"]),
      theme.difficulty * 0.012 + (100 - theme.counterClarity) * 0.01,
    ),
  };
  const pace = chooseHighest(
    [
      "rush",
      "tempo",
      "setup",
      "fortress",
      "midrange",
      "ramp",
      "reactive",
      "gambit",
    ] as const,
    (keyword) => paceScores[keyword],
  );

  const planScores: Record<
    | "combo"
    | "control"
    | "toolbox"
    | "attrition"
    | "recursion"
    | "transformation"
    | "territory"
    | "countdown",
    number
  > = {
    combo: authoredScore(
      theme,
      "combo",
      includesAny(text, ["콤보", "연쇄", "퍼즐", "조합", "중첩", "공명", "연결", "복제", "합주"]),
      theme.difficulty * 0.016 + roleMetric(theme, "bridge") * 0.02,
    ),
    control: authoredScore(
      theme,
      "control",
      includesAny(text, ["컨트롤", "봉쇄", "제한", "차단", "잠가", "빼앗", "훼손", "규칙", "계율"]),
      theme.baseUnpleasantness * 0.02 + roleMetric(theme, "finisher") * 0.008,
    ),
    toolbox: authoredScore(
      theme,
      "toolbox",
      includesAny(text, ["툴박스", "대응형", "적응", "선택", "필요한", "분배", "고르는", "찾아"]),
      theme.counterClarity * 0.014 + theme.difficulty * 0.005,
    ),
    attrition: authoredScore(
      theme,
      "attrition",
      includesAny(text, ["장기전", "자원 우위", "교환형", "소모형", "경제", "세금", "운영형", "운영 덱"]),
      roleMetric(theme, "recursion") * 0.035 + (100 - theme.basePower) * 0.006,
    ),
    recursion: authoredScore(
      theme,
      "recursion",
      includesAny(text, ["순환", "회수", "부활", "되살", "복구", "재생", "되돌", "다시", "계승"]),
      roleMetric(theme, "recursion") * 0.075,
    ),
    transformation: authoredScore(
      theme,
      "transformation",
      includesAny(text, ["변환", "변신", "역할을 바", "상태를", "바꿔", "바꾸", "교대", "뒤집", "다른 배역"]),
      theme.difficulty * 0.008 + theme.counterClarity * 0.004,
    ),
    territory: authoredScore(
      theme,
      "territory",
      includesAny(text, ["위치", "배치", "구역", "진형", "경로", "항로", "지역", "전열", "방향", "선로"]),
      theme.counterClarity * 0.009 + roleMetric(theme, "bridge") * 0.012,
    ),
    countdown: authoredScore(
      theme,
      "countdown",
      includesAny(text, ["예약", "지연", "시각", "미래", "다음 턴", "카운트다운", "예보", "주기", "순서대로"]),
      theme.optimizationDays * 0.026 + theme.difficulty * 0.006,
    ),
  };
  const plan = chooseHighest(
    [
      "combo",
      "control",
      "toolbox",
      "attrition",
      "recursion",
      "transformation",
      "territory",
      "countdown",
    ] as const,
    (keyword) => planScores[keyword],
  );

  const traitScores: Record<
    | "disruption"
    | "resilience"
    | "swarm"
    | "burst"
    | "consistency"
    | "protection"
    | "mobility"
    | "deception",
    number
  > = {
    disruption: authoredScore(
      theme,
      "disruption",
      includesAny(text, ["견제", "봉쇄", "무효", "제한", "차단", "빼앗", "방해", "훼손", "침묵", "감염"]),
      theme.baseUnpleasantness * 0.025 + roleMetric(theme, "bridge") * 0.007,
    ),
    resilience: authoredScore(
      theme,
      "resilience",
      includesAny(text, ["복원", "회수", "부활", "되살", "복구", "재생", "환급", "다시", "계승"]),
      roleMetric(theme, "recursion") * 0.06 + theme.counterClarity * 0.006,
    ),
    swarm: authoredScore(
      theme,
      "swarm",
      includesAny(text, ["다수", "전개", "군단", "함대", "무리", "여러", "벌떼", "토큰", "병력", "협공"]),
      (roleMetric(theme, "starter1") + roleMetric(theme, "starter2")) * 0.025,
    ),
    burst: authoredScore(
      theme,
      "burst",
      includesAny(text, ["한 번", "폭발", "집중", "otk", "거대 결과물", "끝내", "충각", "포격", "돌진"]),
      roleMetric(theme, "finisher") * 0.034 + theme.basePower * 0.006,
    ),
    consistency: authoredScore(
      theme,
      "consistency",
      includesAny(text, ["검색", "확정", "고정", "재현", "안정", "필요한", "분류", "순서대로"]),
      (roleMetric(theme, "starter1") + roleMetric(theme, "starter2")) * 0.023 +
        theme.counterClarity * 0.008,
    ),
    protection: authoredScore(
      theme,
      "protection",
      includesAny(text, ["보호", "방패", "갑옷", "방어구", "성벽", "방벽", "내성", "피해를 분산", "반사"]),
      roleMetric(theme, "finisher") * 0.02 + (100 - theme.basePower) * 0.008,
    ),
    mobility: authoredScore(
      theme,
      "mobility",
      includesAny(text, ["이동", "옮겨", "옮기", "경로", "항로", "기동", "질주", "공중선", "순회", "배치"]),
      theme.difficulty * 0.006 + theme.counterClarity * 0.007,
    ),
    deception: authoredScore(
      theme,
      "deception",
      includesAny(text, ["비공개", "숨기", "속이", "기만", "블러프", "매복", "허상", "심리전", "트릭", "대상 변경"]),
      theme.difficulty * 0.012 + (100 - theme.counterClarity) * 0.01,
    ),
  };
  const trait = chooseHighest(
    [
      "disruption",
      "resilience",
      "swarm",
      "burst",
      "consistency",
      "protection",
      "mobility",
      "deception",
    ] as const,
    (keyword) => traitScores[keyword],
  );

  return [pace, plan, trait];
}

export function withPlayKeywords<T extends KeywordThemeSource>(
  theme: T,
): T & { playKeywords: ThemePlayKeywords } {
  return {
    ...theme,
    playKeywords: derivePlayKeywords(theme),
  };
}

/**
 * Private directed edges. The reverse edge is subtracted when a pair is
 * evaluated, so A-vs-B is always the exact inverse of B-vs-A.
 */
const KEYWORD_ADVANTAGES: Readonly<
  Record<PlayKeyword, readonly PlayKeyword[]>
> = {
  rush: ["setup", "combo", "ramp", "countdown"],
  tempo: ["setup", "toolbox", "countdown", "ramp"],
  setup: ["fortress", "attrition", "reactive", "midrange"],
  fortress: ["rush", "tempo", "midrange", "gambit"],
  midrange: ["rush", "gambit", "deception", "attrition"],
  ramp: ["fortress", "midrange", "attrition", "protection"],
  reactive: ["rush", "tempo", "burst", "mobility"],
  gambit: ["ramp", "control", "reactive", "countdown"],
  combo: ["fortress", "attrition", "resilience", "midrange", "protection"],
  control: ["combo", "tempo", "swarm", "ramp", "territory"],
  toolbox: ["control", "fortress", "disruption", "gambit", "transformation"],
  attrition: ["control", "rush", "disruption", "reactive", "deception"],
  recursion: ["control", "attrition", "disruption", "countdown"],
  transformation: ["control", "territory", "protection", "reactive"],
  territory: ["swarm", "rush", "mobility", "midrange"],
  countdown: ["fortress", "control", "attrition", "protection"],
  disruption: ["combo", "setup", "burst", "ramp", "countdown"],
  resilience: ["disruption", "control", "gambit", "deception"],
  swarm: ["toolbox", "attrition", "setup", "reactive", "protection"],
  burst: ["resilience", "fortress", "attrition", "recursion", "countdown"],
  consistency: ["disruption", "deception", "gambit", "reactive"],
  protection: ["disruption", "control", "burst", "deception"],
  mobility: ["fortress", "countdown", "control", "protection"],
  deception: ["reactive", "toolbox", "disruption", "territory"],
};

function hasAdvantage(left: PlayKeyword, right: PlayKeyword): boolean {
  return KEYWORD_ADVANTAGES[left]?.includes(right) ?? false;
}

export function getKeywordMatchupEdgeScore(
  left: readonly PlayKeyword[],
  right: readonly PlayKeyword[],
): number {
  let score = 0;
  for (const leftKeyword of left) {
    for (const rightKeyword of right) {
      if (hasAdvantage(leftKeyword, rightKeyword)) score += 1;
      if (hasAdvantage(rightKeyword, leftKeyword)) score -= 1;
    }
  }
  return score;
}

export function getKeywordMatchupLogitAdjustment(
  left: readonly PlayKeyword[],
  right: readonly PlayKeyword[],
): number {
  const rawAdjustment =
    getKeywordMatchupEdgeScore(left, right) * LOGIT_PER_EDGE;
  return Math.max(
    -KEYWORD_MATCHUP_LOGIT_CAP,
    Math.min(KEYWORD_MATCHUP_LOGIT_CAP, rawAdjustment),
  );
}

export function getCounterplaySupportLogitBonus(waves: number): number {
  if (!Number.isFinite(waves) || waves <= 0) return 0;
  return Math.min(
    COUNTERPLAY_SUPPORT_LOGIT_CAP,
    COUNTERPLAY_SUPPORT_FIRST_LOGIT_BONUS +
      Math.max(0, Math.floor(waves) - 1) *
        COUNTERPLAY_SUPPORT_REPEAT_LOGIT_BONUS,
  );
}

export function capStrategicMatchupLogit(adjustment: number): number {
  return Math.max(
    -STRATEGIC_MATCHUP_LOGIT_CAP,
    Math.min(STRATEGIC_MATCHUP_LOGIT_CAP, adjustment),
  );
}
