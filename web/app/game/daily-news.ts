import { BUSINESS_ACTION_BY_TYPE } from "./business-actions.ts";
import { BUSINESS_EVENT_BY_TYPE } from "./business-events.ts";
import { getThemeCardMarketQuoteAtDay } from "./card-market.ts";
import { getMostLikedCommunityPost } from "./community-engagement.ts";
import { THEME_BY_ID } from "./content.ts";
import { getDailyCommunityPosts } from "./daily-community.ts";
import { getGenericCard } from "./generic-card-catalog.ts";
import { isInitialGenericReleaseBatch } from "./initial-generic-cards.ts";
import { getRecentPlacementLeader } from "./placement-meta.ts";
import type { DailyHistory, GameState } from "./types.ts";

export type DailyNewsTone = "positive" | "negative" | "info";
export type DailyNewsKind =
  | "release"
  | "restriction"
  | "business"
  | "community"
  | "market"
  | "users"
  | "revenue"
  | "environment"
  | "trust"
  | "sentiment"
  | "meta";

export type DailyNewsItem = {
  id: string;
  sourceId: string;
  day: number;
  kind: DailyNewsKind;
  tone: DailyNewsTone;
  headline: string;
  reason: string;
  detail: string;
  priority: number;
  chainId: string;
  /** Previous visible event in the same causal chain. */
  parentId?: string;
  sequence: number;
};

type NewsDraft = Omit<DailyNewsItem, "sequence">;

function formatSigned(value: number, digits = 1): string {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function historyAt(state: GameState, day: number): DailyHistory | undefined {
  return state.history.find((entry) => entry.day === day);
}

function previousHistory(state: GameState, day: number): DailyHistory | undefined {
  return [...state.history]
    .reverse()
    .find((entry) => entry.day < day);
}

function primaryCause(state: GameState, day: number): {
  chainId: string;
  reason: string;
} {
  const release = [...state.releaseHistory]
    .reverse()
    .find(
      (batch) =>
        !isInitialGenericReleaseBatch(batch) &&
        batch.day <= day &&
        day - batch.day <= 2,
    );
  if (release) {
    return {
      chainId: `release-${release.day}`,
      reason: `DAY ${release.day} 정기 발매의 D+${day - release.day} 반응입니다.`,
    };
  }
  const restriction = [...state.community].reverse().find(
    (event) =>
      event.day <= day &&
      day - event.day <= 3 &&
      (event.type === "restriction-applied" ||
        event.type === "restriction-no-change" ||
        event.type === "cosmetic-restriction"),
  );
  if (restriction) {
    return {
      chainId: `restriction-${restriction.day}`,
      reason: `DAY ${restriction.day} 금제 공표의 D+${day - restriction.day} 연쇄 반응입니다.`,
    };
  }
  const action = state.operations.records.find(
    (record) => record.resolvedDay === day,
  );
  if (action) {
    return {
      chainId: action.id,
      reason: `${BUSINESS_ACTION_BY_TYPE[action.type].title} 결과가 반영됐습니다.`,
    };
  }
  const event = state.operations.eventRecords.find(
    (record) => record.resolvedDay === day,
  );
  if (event) {
    return {
      chainId: event.id,
      reason: `${BUSINESS_EVENT_BY_TYPE[event.type].title} 대응 결과가 반영됐습니다.`,
    };
  }
  return {
    chainId: `market-${day}`,
    reason: "메타 연구·유저 이동·일상 매출이 함께 반영된 결과입니다.",
  };
}

function shareOfTopCut(history: DailyHistory, themeId: string): number {
  if (!history.topCutPlacements) return history.shares[themeId] ?? 0;
  const total = Object.values(history.topCutPlacements).reduce(
    (sum, value) => sum + value,
    0,
  );
  return total > 0 ? (history.topCutPlacements[themeId] ?? 0) / total : 0;
}

function recentRestrictionEvents(state: GameState, day: number) {
  return state.community
    .filter(
      (event) =>
        event.day <= day &&
        day - event.day <= 3 &&
        event.type === "restriction-applied",
    )
    .sort((left, right) => right.day - left.day || left.id.localeCompare(right.id));
}

function competitiveChainDrafts(state: GameState, day: number): NewsDraft[] {
  const current = historyAt(state, day);
  const previous = previousHistory(state, day);
  if (!current || !previous) return [];
  const restrictions = recentRestrictionEvents(state, day);
  if (restrictions.length === 0) return [];
  const drafts: NewsDraft[] = [];
  const topCutNewsIdByTheme = new Map<string, string>();

  for (const themeId of state.activeThemeIds) {
    const before = shareOfTopCut(previous, themeId);
    const after = shareOfTopCut(current, themeId);
    const delta = after - before;
    const cause = restrictions.find((event) => event.themeId === themeId);
    if (!cause || Math.abs(delta) < 0.045) continue;
    const id = `news-topcut-${themeId}-${day}`;
    topCutNewsIdByTheme.set(themeId, id);
    drafts.push({
      id,
      sourceId: `history-${day}-topcut-${themeId}`,
      day,
      kind: "meta",
      tone: delta >= 0 ? "positive" : "negative",
      headline: delta >= 0
        ? `${THEME_BY_ID[themeId]?.shortName ?? "대상 테마"} 탑컷이 반등했습니다`
        : `${THEME_BY_ID[themeId]?.shortName ?? "대상 테마"} 탑컷이 급하강했습니다`,
      reason: `DAY ${cause.day} ‘${cause.body}’ 공표 뒤 대회 결과가 움직였습니다.`,
      detail: `${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}% · ${formatSigned(delta * 100)}%p`,
      priority: 80,
      chainId: `restriction-${cause.day}`,
      parentId: `news-restriction-${cause.day}`,
    });
  }

  for (const cause of restrictions) {
    if (!cause.partId || day <= cause.day) continue;
    const theme = THEME_BY_ID[cause.themeId];
    const part = theme?.parts.find((candidate) => candidate.id === cause.partId);
    const quote = getThemeCardMarketQuoteAtDay(
      state,
      cause.themeId,
      cause.partId,
      day,
      1,
    );
    if (!part || !quote || Math.abs(quote.changeRate) < 4) continue;
    drafts.push({
      id: `news-card-price-${cause.partId}-${day}`,
      sourceId: `market-${cause.partId}-${day}`,
      day,
      kind: "market",
      tone: quote.changeRate >= 0 ? "positive" : "negative",
      headline: quote.changeRate >= 0
        ? `${part.name} 시세가 급등했습니다`
        : `${part.name} 시세가 폭락했습니다`,
      reason: topCutNewsIdByTheme.has(cause.themeId)
        ? "탑컷 변화가 카드 수요와 중고 시장에 곧바로 번졌습니다."
        : `DAY ${cause.day} 금제 변경이 카드 수요에 반영됐습니다.`,
      detail: `₩${quote.previousPrice.toLocaleString("ko-KR")} → ₩${quote.price.toLocaleString("ko-KR")} · ${formatSigned(quote.changeRate)}%`,
      priority: 74,
      chainId: `restriction-${cause.day}`,
      parentId:
        topCutNewsIdByTheme.get(cause.themeId) ??
        `news-restriction-${cause.day}`,
    });
  }
  return drafts;
}

function releaseProductName(
  product: GameState["releaseHistory"][number]["products"][number],
): string {
  if (product.kind === "generic") {
    return getGenericCard(product.genericCardId)?.name ?? "범용 카드";
  }
  return THEME_BY_ID[product.themeId]?.shortName ?? "신규 테마";
}

function metricDrafts(state: GameState, day: number): NewsDraft[] {
  const current = historyAt(state, day);
  const previous = previousHistory(state, day);
  if (!current || !previous) return [];

  const cause = primaryCause(state, day);
  const drafts: NewsDraft[] = [];
  const userDelta = current.totalUsers - previous.totalUsers;
  const userRate = previous.totalUsers > 0
    ? (userDelta / previous.totalUsers) * 100
    : 0;
  if (Math.abs(userDelta) >= 250 || Math.abs(userRate) >= 1.5) {
    drafts.push({
      id: `news-users-${day}`,
      sourceId: `history-${day}-users`,
      day,
      kind: "users",
      tone: userDelta >= 0 ? "positive" : "negative",
      headline: userDelta >= 0 ? "활성 유저가 크게 늘었습니다" : "활성 유저 이탈이 감지됐습니다",
      reason: cause.reason,
      detail: `${formatSigned(userDelta, 0)}명 · 전일 대비 ${formatSigned(userRate)}%`,
      priority: Math.min(100, 60 + Math.abs(userRate) * 5),
      chainId: cause.chainId,
    });
  }

  const revenueDelta = current.revenue - previous.revenue;
  const revenueRate = previous.revenue > 0
    ? (revenueDelta / previous.revenue) * 100
    : 0;
  if (Math.abs(revenueRate) >= 18) {
    drafts.push({
      id: `news-revenue-${day}`,
      sourceId: `history-${day}-revenue`,
      day,
      kind: "revenue",
      tone: revenueDelta >= 0 ? "positive" : "negative",
      headline: revenueDelta >= 0 ? "일매출이 급등했습니다" : "일매출이 급락했습니다",
      reason: cause.reason,
      detail: `₩${Math.abs(revenueDelta).toFixed(2)}억 ${revenueDelta >= 0 ? "증가" : "감소"} · ${formatSigned(revenueRate)}%`,
      priority: Math.min(100, 58 + Math.abs(revenueRate)),
      chainId: cause.chainId,
    });
  }

  if (
    current.environmentHealth !== undefined &&
    previous.environmentHealth !== undefined
  ) {
    const delta = current.environmentHealth - previous.environmentHealth;
    if (Math.abs(delta) >= 3) {
      drafts.push({
        id: `news-environment-${day}`,
        sourceId: `history-${day}-environment`,
        day,
        kind: "environment",
        tone: delta >= 0 ? "positive" : "negative",
        headline: delta >= 0 ? "환경 건강도가 회복됐습니다" : "환경 건강도가 흔들리고 있습니다",
        reason: cause.reason,
        detail: `${Math.round(current.environmentHealth)}점 · ${formatSigned(delta)}점`,
        priority: Math.min(100, 62 + Math.abs(delta) * 4),
        chainId: cause.chainId,
      });
    }
  }

  if (
    current.purchaseTrust !== undefined &&
    previous.purchaseTrust !== undefined
  ) {
    const delta = current.purchaseTrust - previous.purchaseTrust;
    if (Math.abs(delta) >= 2) {
      drafts.push({
        id: `news-trust-${day}`,
        sourceId: `history-${day}-trust`,
        day,
        kind: "trust",
        tone: delta >= 0 ? "positive" : "negative",
        headline: delta >= 0 ? "구매 신뢰가 회복됐습니다" : "구매 신뢰가 크게 떨어졌습니다",
        reason: cause.reason,
        detail: `${Math.round(current.purchaseTrust)}점 · ${formatSigned(delta)}점`,
        priority: Math.min(100, 66 + Math.abs(delta) * 5),
        chainId: cause.chainId,
      });
    }
  }

  if (
    current.communitySentiment !== undefined &&
    previous.communitySentiment !== undefined
  ) {
    const delta = current.communitySentiment - previous.communitySentiment;
    if (Math.abs(delta) >= 8) {
      drafts.push({
        id: `news-sentiment-${day}`,
        sourceId: `history-${day}-sentiment`,
        day,
        kind: "sentiment",
        tone: delta >= 0 ? "positive" : "negative",
        headline: delta >= 0 ? "커뮤니티 여론이 빠르게 호전됐습니다" : "커뮤니티 여론이 급격히 악화됐습니다",
        reason: cause.reason,
        detail: `${Math.round(current.communitySentiment)}점 · ${formatSigned(delta)}점`,
        priority: Math.min(100, 60 + Math.abs(delta) * 3),
        chainId: cause.chainId,
      });
    }
  }

  const previousPlacementLeader = getRecentPlacementLeader(
    state.history,
    state.seed,
    previous.day,
  );
  const currentPlacementLeader = getRecentPlacementLeader(
    state.history,
    state.seed,
    current.day,
  );
  if (
    previousPlacementLeader &&
    currentPlacementLeader &&
    currentPlacementLeader.themeId !== previousPlacementLeader.themeId
  ) {
    drafts.push({
      id: `news-meta-leader-${day}`,
      sourceId: `history-${day}-leader`,
      day,
      kind: "meta",
      tone: "info",
      headline: "메타 1위가 바뀌었습니다",
      reason: cause.reason,
      detail: `${THEME_BY_ID[previousPlacementLeader.themeId]?.shortName ?? "이전 1위"} → ${THEME_BY_ID[currentPlacementLeader.themeId]?.shortName ?? "새 1위"}`,
      priority: 68,
      chainId: cause.chainId,
    });
  }
  return drafts;
}

function eventDrafts(state: GameState, day: number): NewsDraft[] {
  const drafts: NewsDraft[] = [];
  const release = state.releaseHistory.find(
    (batch) => batch.day === day && !isInitialGenericReleaseBatch(batch),
  );
  if (release) {
    drafts.push({
      id: `news-release-${day}`,
      sourceId: `release-${day}`,
      day,
      kind: "release",
      tone: "info",
      headline: `정기 카드팩 ${release.products.length}종이 발매됐습니다`,
      reason: "발매 파워와 상품 구성이 오늘부터 매출에 반영됩니다.",
      detail: release.products.map(releaseProductName).join(" · "),
      priority: 82,
      chainId: `release-${day}`,
    });
  }

  const restrictionEvents = state.community.filter(
    (event) =>
      event.day === day &&
      (event.type === "restriction-applied" ||
        event.type === "restriction-no-change" ||
        event.type === "cosmetic-restriction"),
  );
  if (restrictionEvents.length > 0) {
    const applied = restrictionEvents.filter(
      (event) => event.type === "restriction-applied",
    ).length;
    drafts.push({
      id: `news-restriction-${day}`,
      sourceId: restrictionEvents.map((event) => event.id).sort().join("+"),
      day,
      kind: "restriction",
      tone: applied > 0 ? "info" : "negative",
      headline: applied > 0 ? `금제 ${applied}건이 공표됐습니다` : "환경 유지안이 공표됐습니다",
      reason: "실제 채용·매출·신뢰 반응은 다음 날부터 관측됩니다.",
      detail: applied > 0 ? "금지·제한·준제한 변경" : "변경 없음",
      priority: 86,
      chainId: `restriction-${day}`,
    });
  }

  for (const record of state.operations.records.filter(
    (candidate) => candidate.resolvedDay === day,
  )) {
    const positive = record.outcome === "success" || record.outcome === "clean";
    drafts.push({
      id: `news-business-action-${record.id}`,
      sourceId: record.id,
      day,
      kind: "business",
      tone: positive ? "positive" : "negative",
      headline: `${BUSINESS_ACTION_BY_TYPE[record.type].title} · ${positive ? "목표 달성" : "후폭풍 발생"}`,
      reason: positive
        ? "운영 조건을 충족해 성과가 시장에 반영됐습니다."
        : "운영 조건을 지키지 못해 비용과 신뢰에 후폭풍이 발생했습니다.",
      detail: record.cashReturn ? `회수 ₩${record.cashReturn.toFixed(1)}억` : `결과 ${record.outcome}`,
      priority: 90,
      chainId: record.id,
    });
  }

  for (const record of state.operations.eventRecords.filter(
    (candidate) => candidate.resolvedDay === day,
  )) {
    const positive = record.outcome === "success";
    drafts.push({
      id: `news-business-event-${record.id}`,
      sourceId: record.id,
      day,
      kind: "business",
      tone: positive ? "positive" : "negative",
      headline: `${BUSINESS_EVENT_BY_TYPE[record.type].title} 대응 결과`,
      reason: positive ? "선택한 대응이 시장에 안착했습니다." : "선택한 대응에서 예상 밖의 역풍이 발생했습니다.",
      detail: positive ? "성과 확정" : "후폭풍 확정",
      priority: 84,
      chainId: record.id,
    });
  }
  return drafts;
}

function communityDraft(state: GameState, day: number): NewsDraft | null {
  const posts = getDailyCommunityPosts(state, day);
  const top = getMostLikedCommunityPost(state, posts);
  if (!top?.isPopular) return null;
  return {
    id: `news-popular-post-${day}-${top.event.id}`,
    sourceId: top.event.id,
    day,
    kind: "community",
    tone: /불만|이탈|사기|망|금제|제한|실망|화나/.test(top.event.body)
      ? "negative"
      : "info",
    headline: "좋아요가 몰린 커뮤니티 글",
    reason: "많은 플레이어가 같은 반응에 공감하고 있습니다.",
    detail: `♥ ${top.likes.toLocaleString("ko-KR")} · ${top.event.body}`,
    priority: 72,
    chainId: `community-${day}`,
  };
}

export function getDailyNews(state: GameState, day: number): DailyNewsItem[] {
  if (!Number.isInteger(day) || day < 1 || day > state.day) return [];
  const popular = communityDraft(state, day);
  const drafts = [
    ...eventDrafts(state, day),
    ...competitiveChainDrafts(state, day),
    ...metricDrafts(state, day),
    ...(popular ? [popular] : []),
  ].sort(
    (left, right) =>
      right.priority - left.priority || left.id.localeCompare(right.id),
  );
  return drafts.map((item, sequence) => ({ ...item, sequence }));
}

export function getDailyNewsRange(
  state: GameState,
  startDayExclusive: number,
  endDayInclusive: number,
): DailyNewsItem[] {
  const start = Math.max(0, Math.floor(startDayExclusive));
  const end = Math.min(state.day, Math.floor(endDayInclusive));
  if (end <= start) return [];
  const result: DailyNewsItem[] = [];
  for (let day = start + 1; day <= end; day += 1) {
    result.push(...getDailyNews(state, day));
  }
  return result;
}

export function getImpactNewsRange(
  state: GameState,
  startDayExclusive: number,
  endDayInclusive: number,
): DailyNewsItem[] {
  return getDailyNewsRange(state, startDayExclusive, endDayInclusive).filter(
    (item) => item.priority >= 68,
  );
}
