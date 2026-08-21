import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEME_BY_ID,
} from "./content.ts";
import { getThemeCardMarketQuoteAtDay } from "./card-market.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  LAST_DECISION_DAY,
  RELEASE_REPORT_DELAY_DAYS,
  RESTRICTION_REPORT_DELAY_DAYS,
} from "./campaign.ts";
import { getReleasePackName } from "./release-pack-name.ts";
import { getRestrictionHistoricalOutcome } from "./restriction-policy.ts";
import type {
  CommunityEvent,
  DailyHistory,
  GameState,
  ThemeId,
} from "./types.ts";

export type EmergentNarrativeKind =
  | "revival"
  | "market-scandal"
  | "failed-restriction"
  | "broken-pack-nickname"
  | "iconic-polarization";

export type EmergentNarrative = Readonly<{
  kind: EmergentNarrativeKind;
  event: Omit<CommunityEvent, "id">;
}>;

function isRestrictionDay(day: number): boolean {
  return (
    Number.isInteger(day) &&
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0
  );
}

function historyThrough(state: GameState, day: number): DailyHistory[] {
  return state.history
    .filter((entry) => entry.day <= day)
    .sort((left, right) => left.day - right.day);
}

function shareAt(
  rows: readonly DailyHistory[],
  themeId: ThemeId,
  day: number,
): number | null {
  const row = rows.find((entry) => entry.day === day);
  return row?.shares[themeId] ?? null;
}

function themeDebutDay(state: GameState, themeId: ThemeId): number {
  return state.releaseHistory.find((batch) =>
    batch.products.some(
      (product) => product.kind === "new-theme" && product.themeId === themeId,
    )
  )?.day ?? FIRST_BAN_DAY;
}

function partReleaseDay(
  state: GameState,
  themeId: ThemeId,
  partId: string,
): number | null {
  const theme = THEME_BY_ID[themeId];
  const partIndex = theme?.parts.findIndex((part) => part.id === partId) ?? -1;
  if (partIndex < 0) return null;
  if (partIndex < INITIAL_THEME_PART_COUNT) return themeDebutDay(state, themeId);

  const supportWave = Math.floor(
    (partIndex - INITIAL_THEME_PART_COUNT) / SUPPORT_PARTS_PER_RELEASE,
  );
  const supportBatches = state.releaseHistory.filter((batch) =>
    batch.products.some(
      (product) => product.kind === "support" && product.themeId === themeId,
    )
  );
  return supportBatches[supportWave]?.day ?? null;
}

function revivalNarrative(
  state: GameState,
  day: number,
  rows: readonly DailyHistory[],
): EmergentNarrative | null {
  if (day < 35) return null;
  const candidates = state.activeThemeIds.flatMap((themeId) => {
    const today = shareAt(rows, themeId, day);
    const yesterday = shareAt(rows, themeId, day - 1);
    if (today === null || yesterday === null || today < 0.13 || yesterday >= 0.13) {
      return [];
    }

    const earlier = rows.filter(
      (entry) => entry.day < day - 7 && entry.shares[themeId] !== undefined,
    );
    const lowIndex = earlier.findLastIndex(
      (entry) => (entry.shares[themeId] ?? 1) <= 0.055,
    );
    if (lowIndex < 0) return [];
    const hadFormerPeak = earlier
      .slice(0, lowIndex)
      .some((entry) => (entry.shares[themeId] ?? 0) >= 0.12);
    if (!hadFormerPeak) return [];
    return [{ themeId, today, yesterday }];
  });
  const chosen = candidates.sort((left, right) => right.today - left.today)[0];
  if (!chosen) return null;
  const theme = THEME_BY_ID[chosen.themeId];
  return {
    kind: "revival",
    event: {
      day,
      category: "meta",
      type: "theme-popularity",
      themeId: chosen.themeId,
      value: chosen.today,
      previousValue: chosen.yesterday,
      body: `한때 입상표에서 거의 사라졌던 ${theme.shortName}가 다시 ${(chosen.today * 100).toFixed(1)}%까지 올라왔네. 이 정도면 유행이 아니라 부활이라고 불러도 될 듯`,
    },
  };
}

function marketScandalNarrative(
  state: GameState,
  day: number,
): EmergentNarrative | null {
  if (day < 10) return null;
  const candidates = state.activeThemeIds.flatMap((themeId) => {
    const theme = THEME_BY_ID[themeId];
    const runtime = state.themes[themeId];
    return runtime.releasedPartIds.flatMap((partId) => {
      const releaseDay = partReleaseDay(state, themeId, partId);
      if (releaseDay === null || day - releaseDay < 7) return [];
      const quote = getThemeCardMarketQuoteAtDay(
        state,
        themeId,
        partId,
        day,
        1,
      );
      if (
        !quote ||
        quote.price < 60_000 ||
        quote.previousPrice >= 60_000
      ) {
        return [];
      }
      const part = theme.parts.find((candidate) => candidate.id === partId);
      return part ? [{ themeId, part, quote }] : [];
    });
  });
  const chosen = candidates.sort(
    (left, right) => right.quote.price - left.quote.price,
  )[0];
  if (!chosen) return null;
  const theme = THEME_BY_ID[chosen.themeId];
  return {
    kind: "market-scandal",
    event: {
      day,
      category: "finance",
      type: "business-scandal",
      themeId: chosen.themeId,
      partId: chosen.part.id,
      value: chosen.quote.price,
      previousValue: chosen.quote.previousPrice,
      body: `${chosen.part.name} 한 장이 ${chosen.quote.price.toLocaleString("ko-KR")}원까지 갔다고? ${theme.shortName} 덱값 대부분이 이 카드라 이제는 품귀가 아니라 시장 스캔들 수준임`,
    },
  };
}

function failedRestrictionNarrative(
  state: GameState,
  day: number,
): EmergentNarrative | null {
  const decisionDay = day - RESTRICTION_REPORT_DELAY_DAYS;
  if (!isRestrictionDay(decisionDay)) return null;
  if (!state.history.some((entry) => entry.day === decisionDay)) return null;
  const outcome = getRestrictionHistoricalOutcome(state, decisionDay, day);
  if (
    outcome.classification !== "ineffective" &&
    outcome.classification !== "replacement" &&
    outcome.classification !== "overcorrected"
  ) {
    return null;
  }
  const themeId =
    outcome.targetedThemeIds[0] ?? state.currentTopThemeId;
  const theme = THEME_BY_ID[themeId];
  const copy = outcome.classification === "ineffective"
    ? `DAY ${decisionDay} 금제, 다들 벌써 ‘헛칼 금제’라고 부르네. ${theme.shortName} 핵심은 그대로인데 주변 카드만 잃은 역사적 실패로 남을 듯`
    : outcome.classification === "replacement"
      ? `DAY ${decisionDay} 금제는 ${theme.shortName} 자리만 다른 덱에 넘겨준 ‘풍선 금제’였네. 1등 이름만 바뀌었지 환경은 그대로라 더 허탈함`
      : `DAY ${decisionDay} 금제 이후 ${theme.shortName} 유저가 통째로 빠졌다. 밸런스를 잡은 게 아니라 덱을 지운 ‘초토화 금제’로 기억될 것 같음`;
  return {
    kind: "failed-restriction",
    event: {
      day,
      category: "restriction",
      type: "restriction-demand",
      themeId,
      value: outcome.targetedShareDelta,
      previousValue: outcome.decisionMetrics.targetedShare,
      body: copy,
    },
  };
}

const PACK_NICKNAMES = [
  "밸런스 분쇄팩",
  "금제 예고장",
  "파워 폭주 상자",
  "한 팩짜리 재앙",
] as const;

function brokenPackNarrative(
  state: GameState,
  day: number,
  rows: readonly DailyHistory[],
): EmergentNarrative | null {
  const releaseDay = day - RELEASE_REPORT_DELAY_DAYS;
  const batch = state.releaseHistory.find(
    (candidate) =>
      candidate.day === releaseDay && candidate.releaseKind === "regular",
  );
  if (!batch) return null;
  const before = rows.find((entry) => entry.day === releaseDay);
  const after = rows.find((entry) => entry.day === day);
  if (!before || !after) return null;

  const averagePower = batch.products.reduce(
    (sum, product) => sum + product.powerAdjustment,
    0,
  ) / Math.max(1, batch.products.length);
  const healthDrop =
    (after.environmentHealth ?? 0) - (before.environmentHealth ?? 0);
  const beneficiary = state.activeThemeIds
    .map((themeId) => ({
      themeId,
      gain: (after.shares[themeId] ?? 0) - (before.shares[themeId] ?? 0),
    }))
    .sort((left, right) => right.gain - left.gain)[0];
  if (
    averagePower < 1.5 &&
    healthDrop > -6 &&
    (beneficiary?.gain ?? 0) < 0.07
  ) {
    return null;
  }
  const themeId = beneficiary?.themeId ?? state.currentTopThemeId;
  const theme = THEME_BY_ID[themeId];
  const packName = getReleasePackName(batch.day, "regular");
  const nickname = PACK_NICKNAMES[
    Math.abs(Math.imul(batch.day + 17, 0x45d9f3b)) % PACK_NICKNAMES.length
  ];
  return {
    kind: "broken-pack-nickname",
    event: {
      day,
      category: "release",
      type: "release-reaction",
      themeId,
      value: healthDrop,
      previousValue: averagePower,
      body: `${packName}을 요즘 정식 이름보다 ‘${nickname}’이라고 더 많이 부르더라. ${theme.shortName}를 저만큼 밀어 올렸으니 팩 이름 대신 별명이 역사에 남겠네`,
    },
  };
}

function consecutiveShareDays(
  rows: readonly DailyHistory[],
  themeId: ThemeId,
  day: number,
  threshold: number,
): number {
  let expectedDay = day;
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row.day > expectedDay) continue;
    if (row.day !== expectedDay || (row.shares[themeId] ?? 0) < threshold) break;
    count += 1;
    expectedDay -= 1;
  }
  return count;
}

function iconicPolarizationNarrative(
  state: GameState,
  day: number,
  rows: readonly DailyHistory[],
): EmergentNarrative | null {
  if (day < 21) return null;
  const candidates = state.activeThemeIds
    .map((themeId) => ({
      themeId,
      share: shareAt(rows, themeId, day) ?? 0,
      streak: consecutiveShareDays(rows, themeId, day, 0.14),
    }))
    .filter((candidate) => candidate.streak === 21)
    .sort((left, right) => right.share - left.share);
  const chosen = candidates[0];
  if (!chosen) return null;
  const theme = THEME_BY_ID[chosen.themeId];
  return {
    kind: "iconic-polarization",
    event: {
      day,
      category: "meta",
      type: "theme-popularity",
      themeId: chosen.themeId,
      value: chosen.share,
      previousValue: chosen.streak,
      body: `${theme.shortName}는 팬들이 슬리브까지 맞춰 쓰는 간판 덱인데 반대쪽에서는 이름만 봐도 지겹다고 함. 사랑과 증오를 동시에 받는 이 게임 대표 테마가 된 듯`,
    },
  };
}

/**
 * Finds story labels only after campaign evidence earns them. Nothing here is
 * assigned to the starting themes or exposed during the emergency briefing.
 */
export function getEmergentNarrativesForDay(
  state: GameState,
  day: number,
): EmergentNarrative[] {
  if (day <= FIRST_BAN_DAY || day > state.day) return [];
  const rows = historyThrough(state, day);
  const candidates = [
    failedRestrictionNarrative(state, day),
    brokenPackNarrative(state, day, rows),
    marketScandalNarrative(state, day),
    revivalNarrative(state, day, rows),
    iconicPolarizationNarrative(state, day, rows),
  ].filter((candidate): candidate is EmergentNarrative => candidate !== null);
  return candidates.slice(0, 2);
}
