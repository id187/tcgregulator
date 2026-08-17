import { getDailyCommunityPosts } from "./daily-community.ts";
import type { CommunityEvent, CommunityEventType, GameState } from "./types.ts";

export type CommunitySentimentPolarity = "positive" | "neutral" | "negative";

export type CommunitySentimentLabel =
  | "매우 긍정적"
  | "긍정적"
  | "중립"
  | "부정적"
  | "매우 부정적";

export interface CommunityPostSentiment {
  score: number;
  polarity: CommunitySentimentPolarity;
}

export interface DailyCommunitySentiment {
  day: number;
  /** Signed community mood from -100 (hostile) to 100 (supportive). */
  score: number;
  /** Gauge-friendly form of score: 0..100, with 50 as neutral. */
  index: number;
  positive: number;
  neutral: number;
  negative: number;
  label: CommunitySentimentLabel;
}

type WeightedPhrase = readonly [phrase: string, weight: number];
type WeightedStem = readonly [stem: string, weight: number];

/**
 * Longer contextual phrases intentionally outrank isolated tokens. This keeps
 * Korean negation such as "납득이 안 됨" from being read as positive merely
 * because it contains "납득".
 */
const PHRASE_LEXICON: readonly WeightedPhrase[] = [
  ["상위 1티어는 그대로", -5.4],
  ["상위권을 그대로 둔", -5.2],
  ["상위권은 그대로", -5.1],
  ["최상위권을 비껴간", -5],
  ["최상위권 본체는 통과", -5],
  ["하위권 파츠는 잘라", -4.9],
  ["하위 구간만 바뀐", -4.8],
  ["아래쪽만 손봤", -4.7],
  ["아래 구간만", -4.5],
  ["경쟁자 제거", -4.7],
  ["독주를 누가 막", -4.6],
  ["1강 강화", -4.5],
  ["티어 판독부터 잘못", -4.4],
  ["대상 선정이 거꾸로", -4.4],
  ["균형 금제라고 부르진 말자", -5],
  ["금제 슬롯 낭비", -4.3],
  ["환경이 알아서 밀어낸", -4.2],
  ["티어 밖에서 지고", -4.2],
  ["우선순위가 완전히 뒤집", -4.5],
  ["하위권 약체를 잘라", -4.5],
  ["우선순위가 대체 뭐", -4.3],
  ["대체 뭐임", -4.2],
  ["납득이 안", -4.2],
  ["납득 안", -4],
  ["이해가 안", -3.9],
  ["설명이 안", -3.8],
  ["설명 못", -3.6],
  ["의미가 없", -3.8],
  ["체감 개선 없이", -3.8],
  ["환경은 그대로", -3.7],
  ["일한 척", -3.7],
  ["숫자만 바꾸", -3.5],
  ["실질 제한이 없", -3.7],
  ["실효 제한", -1.9],
  ["실효 컷", -1.9],
  ["너무 늦", -3.4],
  ["손을 아예 놨", -4.3],
  ["책임 회피", -4],
  ["문제를 방치", -4.2],
  ["방치에 가깝", -3.9],
  ["숨 쉴 틈이 없", -4],
  ["보고 싶은 것만", -3.8],
  ["욕 덜 먹", -3.8],
  ["유저에게 떠넘", -3.7],
  ["풍선효과", -3.2],
  ["희생양", -2.9],
  ["연좌제", -3.4],
  ["다 빠지고", -3.4],
  ["기준 공개 좀", -2.9],
  ["실패로 봐야", -3.3],
  ["더 답답", -3.1],
  ["가장 큰 문제", -3.1],
  ["문제가 뻔", -3],
  ["결과가 뻔", -2.9],
  ["이상하다", -2.7],
  ["이상함", -2.7],
  ["부족함", -2.6],
  ["부족하다", -2.6],
  ["위험하다", -2.2],
  ["과하게", -1.9],
  ["과잉", -1.7],
  ["방향이 좋", 4.5],
  ["방향은 좋", 4.3],
  ["방향은 맞", 3.5],
  ["균형은 맞", 4.2],
  ["균형이 맞", 4.2],
  ["균형 잡", 4.2],
  ["범위가 제대로", 4.4],
  ["제대로 잡", 4.4],
  ["납득됨", 4.1],
  ["납득된다", 4],
  ["납득함", 4],
  ["납득 가능", 3.7],
  ["설득력 있", 3.8],
  ["설득력 있음", 3.8],
  ["좋았음", 3.7],
  ["판단은 좋", 3.6],
  ["정답은 아니다", -1.2],
  ["훨씬 설득력", 4.1],
  ["금제는 이래야", 4.5],
  ["풀어 줄 카드는 풀고", 4.3],
  ["장기 제한도 해제", 3.8],
  ["상위권 두 구간", 2.6],
  ["구성은 적정", 3.6],
  ["필요한 일은 다 한", 3.5],
  ["함께 눌렀", 2.5],
  ["복수 조정", 2.1],
  ["한 테마만이 아니라", 0.5],
  ["입구나 보스를 자른 게 아니라", 0],
  ["2티어까지 함께", 3.2],
  ["현행 유지가 더 나아", 4.1],
  ["현행 유지가 가장", 3.5],
  ["변경 없음도 선택", 3.7],
  ["굳이 희생양을 만들 필요", 3.8],
  ["과잉 대응을 피", 3.8],
  ["억지 개입이 더 위험", 3.8],
  ["성급하게", 0.3],
  ["건드리지 않은 건 괜찮", 3.8],
  ["지켜보자는 쪽에 한 표", 3.2],
  ["충분히 가능", 2.8],
  ["환경이 자연스럽게 순환", 3.7],
  ["분포가 고른", 3.5],
  ["상위권이 여러 테마", 3.2],
  ["답이 있는 환경", 3.1],
  ["이유가 적었다", 2.8],
  ["한 사이클 더 보는 것도 운영", 2.8],
  ["숨통이 트", 3.5],
  ["메타가 열", 3.5],
  ["환경이 건강", 3.8],
  ["정상화", 2.6],
  ["회복했", 2.5],
  ["효과가 있", 2.7],
  ["성공했", 3.1],
  ["반갑", 2.7],
  ["환영", 2.8],
  ["잘했다", 3.7],
  ["괜찮아 보", 2.7],
  ["좋아 보", 2.7],
  ["나쁘지 않", 2.8],
  ["문제 없", 2.6],
] as const;

const TOKEN_LEXICON: readonly WeightedStem[] = [
  ["최악", -2.8],
  ["기만", -2.5],
  ["불쾌", -2.3],
  ["독주", -2.2],
  ["고착", -2.1],
  ["방치", -2.1],
  ["실망", -2.1],
  ["불신", -2],
  ["망했", -2],
  ["망함", -2],
  ["죽었", -2],
  ["죽음", -2],
  ["거꾸로", -1.9],
  ["답답", -1.8],
  ["실패", -1.8],
  ["불공정", -1.8],
  ["피해", -1.5],
  ["문제", -1.5],
  ["부족", -1.5],
  ["과잉", -1.4],
  ["반발", -1.3],
  ["위험", -1.2],
  ["피로", -1.2],
  ["아쉽", -1.1],
  ["이상", -1.1],
  ["왜", -0.9],
  ["아니", -0.9],
  ["못", -0.8],
  ["안", -0.7],
  ["좋", 2.1],
  ["납득", 2],
  ["균형", 2],
  ["건강", 1.9],
  ["공정", 1.8],
  ["설득", 1.8],
  ["환영", 1.8],
  ["반갑", 1.7],
  ["성공", 1.7],
  ["개선", 1.6],
  ["회복", 1.5],
  ["안정", 1.4],
  ["다양", 1.4],
  ["정상화", 1.4],
  ["기대", 1.1],
  ["재밌", 1.1],
] as const;

const UNCERTAINTY_STEMS = [
  "관찰",
  "지켜",
  "데이터",
  "표본",
  "아직",
  "가능성",
  "듯",
  "같",
  "확인",
  "분석",
  "예상",
  "모르",
  "경우",
  "일단",
  "이견",
] as const;

const EVENT_TYPE_PRIOR: Partial<Record<CommunityEventType, number>> = {
  "business-scandal": -2.8,
  "restriction-demand": -0.25,
  "counter-rumor": -0.15,
  "counter-found": 0.55,
  "counter-adopted": 1.1,
  "support-released": 0.4,
  "top-theme-changed": -0.1,
};

const SORTED_PHRASES = [...PHRASE_LEXICON].sort(
  ([left], [right]) => right.length - left.length,
);
const SORTED_TOKEN_STEMS = [...TOKEN_LEXICON].sort(
  ([left], [right]) => right.length - left.length,
);

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function consumePhrase(
  text: string,
  phrase: string,
): { remaining: string; count: number } {
  let remaining = text;
  let count = 0;
  let index = remaining.indexOf(phrase);
  while (index >= 0) {
    count += 1;
    remaining =
      remaining.slice(0, index) +
      " ".repeat(phrase.length) +
      remaining.slice(index + phrase.length);
    index = remaining.indexOf(phrase, index + phrase.length);
  }
  return { remaining, count };
}

function textSentimentRaw(body: string): number {
  const normalized = normalizeText(body);
  let remaining = normalized;
  let raw = 0;

  for (const [phrase, weight] of SORTED_PHRASES) {
    const consumed = consumePhrase(remaining, phrase);
    remaining = consumed.remaining;
    raw += consumed.count * weight;
  }

  const tokens = remaining
    .replace(/[^0-9a-z가-힣]+/giu, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    const match = SORTED_TOKEN_STEMS.find(([stem]) => token.startsWith(stem));
    if (match) raw += match[1];
  }

  const uncertaintyCount = tokens.filter((token) =>
    UNCERTAINTY_STEMS.some((stem) => token.startsWith(stem)),
  ).length;
  if (uncertaintyCount > 0) {
    raw *= Math.max(0.55, 1 - uncertaintyCount * 0.1);
  }
  if (
    body.includes("?") &&
    (normalized.includes("왜") ||
      normalized.includes("대체") ||
      normalized.includes("뭐"))
  ) {
    raw -= 0.45;
  }
  return raw;
}

function polarityForScore(score: number): CommunitySentimentPolarity {
  if (score >= 15) return "positive";
  if (score <= -15) return "negative";
  return "neutral";
}

function labelForScore(score: number): CommunitySentimentLabel {
  if (score >= 60) return "매우 긍정적";
  if (score >= 20) return "긍정적";
  if (score > -20) return "중립";
  if (score > -60) return "부정적";
  return "매우 부정적";
}

/** Scores one generated community post using only its immutable contents. */
export function scoreCommunityPostSentiment(
  post: Pick<CommunityEvent, "body" | "type" | "category">,
): CommunityPostSentiment {
  let raw = textSentimentRaw(post.body) + (EVENT_TYPE_PRIOR[post.type] ?? 0);
  if (post.category === "finance") raw -= 0.2;
  const score = Math.round(Math.tanh(raw / 6.5) * 100);
  return { score, polarity: polarityForScore(score) };
}

/**
 * Collapses the actual twenty-post board into a deterministic daily gauge.
 * The calculation itself is side-effect free. The engine snapshots its index
 * and polarity counts in DailyHistory so the 90-day chart never has to
 * regenerate 1,800 posts or rewrite old mood when copy changes.
 */
export function getDailyCommunitySentiment(
  state: GameState,
  day: number,
): DailyCommunitySentiment {
  const posts = getDailyCommunityPosts(state, day);
  const scored = posts.map(scoreCommunityPostSentiment);
  const positive = scored.filter((post) => post.polarity === "positive").length;
  const neutral = scored.filter((post) => post.polarity === "neutral").length;
  const negative = scored.filter((post) => post.polarity === "negative").length;
  const mean =
    scored.reduce((sum, post) => sum + post.score, 0) /
    Math.max(1, scored.length);
  const prevalence = ((positive - negative) / Math.max(1, scored.length)) * 100;
  const blendedScore = Math.round(
    Math.max(-100, Math.min(100, mean * 0.72 + prevalence * 0.28)),
  );
  const index = Math.round((blendedScore + 100) / 2);
  // Canonicalize the signed score through the persisted 0..100 index so a
  // saved history row can reproduce the exact same gauge without rounding
  // drift (for example 54 always maps back to +8).
  const score = index * 2 - 100;
  return {
    day,
    score,
    index,
    positive,
    neutral,
    negative,
    label: labelForScore(score),
  };
}
