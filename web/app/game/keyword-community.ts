import { THEME_BY_ID } from "./content.ts";
import {
  getKeywordMatchupEdgeScore,
  getPlayKeywordLabel,
} from "./play-keywords.ts";
import type { CommunityEvent, GameState, ThemeId } from "./types.ts";

const UNDERPOWERED_MATCHUP_COPY = [
  "{theme}가 {other} 상성은 잘 잡는데 순수 체급이 딸려서 나머지 대진에서 손해 봄",
  "{other}만 늘면 {theme}를 꺼낼 이유는 생기는데, 기본 체급이 낮아서 환경 전체의 답은 아닌 듯",
  "{theme}의 {keyword} 플랜이 {other}전에는 잘 먹힌다. 문제는 상성 밖에서 체급 차이를 못 메운다는 거",
] as const;

const COUNTERPLAY_SUPPORT_COPY = [
  "{theme} 새 지원, 그냥 체급 보강보다 {other}를 눌러 보라는 카운터 설계 같음",
  "{theme} 지원이 {other} 플랜을 끊는 쪽으로 나왔네. 진짜 억제되면 금제 없이도 내려올 수 있겠다",
  "{other} 잡으라고 준 {theme} 지원 같은데, 이 대진부터 결과가 바뀌는지 봐야겠음",
] as const;

function stableIndex(
  length: number,
  seed: number,
  day: number,
  ...keys: readonly string[]
): number {
  let hash = (seed >>> 0) ^ Math.imul(day, 0x9e3779b1);
  for (const text of keys) {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0) % length;
}

function fillKeywordCopy(
  copy: string,
  values: Readonly<Record<"theme" | "other" | "keyword", string>>,
): string {
  return copy.replace(
    /\{(theme|other|keyword)\}/g,
    (_, key: "theme" | "other" | "keyword") => values[key],
  );
}

function historyAtOrBefore(state: GameState, day: number) {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    if (state.history[index].day <= day) return state.history[index];
  }
  return undefined;
}

function themeIdsAtDay(state: GameState, day: number): ThemeId[] {
  const snapshot = historyAtOrBefore(state, day);
  if (!snapshot) return [];
  return Object.entries(snapshot.shares)
    .filter(
      ([themeId, share]) =>
        Boolean(THEME_BY_ID[themeId]) &&
        Number.isFinite(share) &&
        share >= 0.015,
    )
    .map(([themeId]) => themeId)
    .sort((left, right) => left.localeCompare(right));
}

function recentCounterplaySignal(
  state: GameState,
  day: number,
): CommunityEvent | null {
  const visibleThemeIds = new Set(themeIdsAtDay(state, day));
  for (let batchIndex = state.releaseHistory.length - 1; batchIndex >= 0; batchIndex -= 1) {
    const batch = state.releaseHistory[batchIndex];
    const age = day - batch.day;
    if (age < 1) continue;
    if (age > 4) break;
    const targetId = state.history.find(
      (entry) => entry.day === batch.day,
    )?.topThemeId;
    if (!targetId || !visibleThemeIds.has(targetId)) continue;
    const product = batch.products.find(
      (candidate) =>
        candidate.kind === "support" &&
        candidate.direction === "counterplay" &&
        candidate.themeId !== targetId &&
        visibleThemeIds.has(candidate.themeId),
    );
    if (!product || product.kind !== "support") continue;
    const hunter = THEME_BY_ID[product.themeId];
    const target = THEME_BY_ID[targetId];
    if (!hunter || !target) continue;
    const copyIndex = stableIndex(
      COUNTERPLAY_SUPPORT_COPY.length,
      state.seed,
      day,
      product.optionId,
      targetId,
    );
    return {
      id: `daily-keyword-counterplay-${batch.day}-${product.optionId}-${day}`,
      day,
      category: "counter",
      type: "counter-found",
      themeId: hunter.id,
      partId: hunter.parts[0].id,
      relatedThemeId: target.id,
      body: fillKeywordCopy(COUNTERPLAY_SUPPORT_COPY[copyIndex], {
        theme: hunter.shortName,
        other: target.shortName,
        keyword: getPlayKeywordLabel(
          hunter.playKeywords[
            stableIndex(hunter.playKeywords.length, state.seed, day, hunter.id)
          ],
        ),
      }),
    };
  }
  return null;
}

type UnderpoweredMatchup = {
  hunterId: ThemeId;
  targetId: ThemeId;
  edge: number;
  targetShare: number;
  hunterShare: number;
  powerDeficit: number;
};

function underpoweredMatchupSignal(
  state: GameState,
  day: number,
): CommunityEvent | null {
  const snapshot = historyAtOrBefore(state, day);
  if (!snapshot) return null;
  const themeIds = themeIdsAtDay(state, day);
  const candidates: UnderpoweredMatchup[] = [];
  for (const hunterId of themeIds) {
    const hunter = THEME_BY_ID[hunterId];
    if (!hunter) continue;
    for (const targetId of themeIds) {
      if (hunterId === targetId) continue;
      const target = THEME_BY_ID[targetId];
      if (!target) continue;
      const edge = getKeywordMatchupEdgeScore(
        hunter.playKeywords,
        target.playKeywords,
      );
      const powerDeficit = target.basePower - hunter.basePower;
      if (edge <= 0 || powerDeficit < 2) continue;
      candidates.push({
        hunterId,
        targetId,
        edge,
        targetShare: snapshot.shares[targetId] ?? 0,
        hunterShare: snapshot.shares[hunterId] ?? 0,
        powerDeficit,
      });
    }
  }
  candidates.sort(
    (left, right) =>
      right.edge - left.edge ||
      right.targetShare - left.targetShare ||
      right.hunterShare - left.hunterShare ||
      right.powerDeficit - left.powerDeficit ||
      left.hunterId.localeCompare(right.hunterId) ||
      left.targetId.localeCompare(right.targetId),
  );
  const chosen = candidates[0];
  if (!chosen) return null;
  const hunter = THEME_BY_ID[chosen.hunterId];
  const target = THEME_BY_ID[chosen.targetId];
  const copyIndex = stableIndex(
    UNDERPOWERED_MATCHUP_COPY.length,
    state.seed,
    day,
    chosen.hunterId,
    chosen.targetId,
  );
  const keyword = hunter.playKeywords[
    stableIndex(
      hunter.playKeywords.length,
      state.seed,
      day,
      hunter.id,
      target.id,
    )
  ];
  return {
    id: `daily-keyword-matchup-${day}-${hunter.id}-${target.id}`,
    day,
    category: "counter",
    type: "meta-analysis",
    themeId: hunter.id,
    partId: hunter.parts[0].id,
    relatedThemeId: target.id,
    body: fillKeywordCopy(UNDERPOWERED_MATCHUP_COPY[copyIndex], {
      theme: hunter.shortName,
      other: target.shortName,
      keyword: getPlayKeywordLabel(keyword),
    }),
  };
}

/**
 * Returns at most one qualitative clue for the community board. Numeric edge
 * strengths stay inside the simulation; players only see ordinary matchup talk.
 */
export function getKeywordCommunitySignal(
  state: GameState,
  day: number,
): CommunityEvent | null {
  return (
    recentCounterplaySignal(state, day) ??
    underpoweredMatchupSignal(state, day)
  );
}
