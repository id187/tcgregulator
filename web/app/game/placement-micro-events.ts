import {
  BAN_INTERVAL,
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  isScheduledReleaseDay,
  LAST_DECISION_DAY,
  TUTORIAL_END_DAY,
} from "./campaign.ts";
import { THEME_BY_ID } from "./content.ts";
import type { MetaTier } from "./meta-tiers.ts";
import {
  getDailyTopCutPlacements,
  getPlacementTier,
  getRecentPlacementReport,
} from "./placement-meta.ts";
import type { DailyHistory, ThemeId } from "./types.ts";

export type PlacementMicroEventKind =
  | "counter-breakthrough"
  | "lab-breakthrough"
  | "rogue-run"
  | "list-refinement"
  | "side-deck-wave"
  | "matchup-pocket";

export type DailyPlacementMicroEvent = {
  kind: PlacementMicroEventKind;
  phase: "shock" | "pressure" | "recovery" | "surge" | "settled";
  tone: "rise" | "fall";
  startDay: number;
  day: number;
  targetThemeId: ThemeId;
  previousCount: number;
  currentCount: number;
  previousTier: MetaTier;
  currentTier: MetaTier;
  headline: string;
  detail: string;
  tag: string;
};

type PlacementMap = Record<ThemeId, number>;
type ScheduledEvent = {
  startDay: number;
  day: number;
  kind: PlacementMicroEventKind;
  phase: DailyPlacementMicroEvent["phase"];
};

const FIRST_MICRO_EVENT_DAY = TUTORIAL_END_DAY + 2;
const MICRO_EVENT_BLOCK_DAYS = 10;
const MICRO_EVENT_SEARCH_DAYS = 6;
const PERSISTENT_EVENT_DAYS = 5;
const MICRO_EVENT_KINDS: readonly PlacementMicroEventKind[] = [
  "counter-breakthrough",
  "lab-breakthrough",
  "rogue-run",
  "list-refinement",
  "side-deck-wave",
  "matchup-pocket",
];

function keyedUint(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  for (const key of keys) {
    const text = String(key);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
    }
    hash ^= 0x85ebca6b;
    hash = Math.imul(hash, 0xc2b2ae35);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function isBanDecisionDay(day: number): boolean {
  return (
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0
  );
}

function isMajorTransitionDay(day: number): boolean {
  return (
    isBanDecisionDay(day) ||
    isScheduledReleaseDay(day) ||
    isBanDecisionDay(day - 1) ||
    isScheduledReleaseDay(day - 1)
  );
}

function eventKind(seed: number, block: number): PlacementMicroEventKind {
  return MICRO_EVENT_KINDS[
    keyedUint(seed, "placement-micro-kind", block) % MICRO_EVENT_KINDS.length
  ];
}

function isEntrenchedCounter(_seed: number, startDay: number): boolean {
  // Counter stories alternate by the wider forty-day meta cycle so one seed
  // cannot accidentally produce only instant answers or only long collapses.
  return Math.floor(startDay / 40) % 3 !== 0;
}

function eventDuration(
  seed: number,
  kind: PlacementMicroEventKind,
  startDay: number,
): number {
  if (kind === "lab-breakthrough") return PERSISTENT_EVENT_DAYS;
  if (kind === "counter-breakthrough") {
    return isEntrenchedCounter(seed, startDay) ? PERSISTENT_EVENT_DAYS : 2;
  }
  return 1;
}

function scheduledEventForBlock(
  seed: number,
  block: number,
): { startDay: number; kind: PlacementMicroEventKind; duration: number } | null {
  if (block < 0) return null;
  const blockStart = FIRST_MICRO_EVENT_DAY + block * MICRO_EVENT_BLOCK_DAYS;
  const blockEnd = blockStart + MICRO_EVENT_BLOCK_DAYS - 1;
  if (blockStart > CAMPAIGN_END_DAY) return null;
  const kind = eventKind(seed, block);
  const firstOffset =
    keyedUint(seed, "placement-micro-day", block) % MICRO_EVENT_SEARCH_DAYS;
  for (let step = 0; step < MICRO_EVENT_SEARCH_DAYS; step += 1) {
    const offset = (firstOffset + step) % MICRO_EVENT_SEARCH_DAYS;
    const startDay = blockStart + offset;
    const duration = eventDuration(seed, kind, startDay);
    const endDay = startDay + duration - 1;
    if (endDay > CAMPAIGN_END_DAY || endDay > blockEnd) continue;
    let collides = false;
    for (let day = startDay; day <= endDay; day += 1) {
      if (isMajorTransitionDay(day)) {
        collides = true;
        break;
      }
    }
    if (!collides) return { startDay, kind, duration };
  }
  return null;
}

function phaseForEvent(
  seed: number,
  kind: PlacementMicroEventKind,
  startDay: number,
  offset: number,
): DailyPlacementMicroEvent["phase"] | null {
  if (offset === 0) {
    return kind === "counter-breakthrough" ? "shock" : "surge";
  }
  if (kind === "counter-breakthrough") {
    if (!isEntrenchedCounter(seed, startDay) && offset === 1) return "recovery";
    if (isEntrenchedCounter(seed, startDay)) {
      return offset === PERSISTENT_EVENT_DAYS - 1 ? "settled" : "pressure";
    }
    return null;
  }
  if (kind === "lab-breakthrough") {
    return offset === PERSISTENT_EVENT_DAYS - 1 ? "settled" : "pressure";
  }
  return null;
}

function scheduledEvent(seed: number, day: number): ScheduledEvent | null {
  if (day < FIRST_MICRO_EVENT_DAY) return null;
  const block = Math.floor((day - FIRST_MICRO_EVENT_DAY) / MICRO_EVENT_BLOCK_DAYS);
  const candidate = scheduledEventForBlock(seed, block);
  if (!candidate) return null;
  const offset = day - candidate.startDay;
  if (offset < 0 || offset >= candidate.duration) return null;
  const phase = phaseForEvent(seed, candidate.kind, candidate.startDay, offset);
  if (!phase) return null;
  return {
    startDay: candidate.startDay,
    day,
    kind: candidate.kind,
    phase,
  };
}

export function getNextPlacementMicroEventDay(
  seed: number,
  afterDay: number,
  throughDay: number,
): number | null {
  for (let day = afterDay + 1; day <= throughDay; day += 1) {
    const event = scheduledEvent(seed, day);
    if (event && event.phase !== "pressure") return day;
  }
  return null;
}

function ranked(placements: Readonly<PlacementMap>) {
  return (Object.entries(placements) as [ThemeId, number][])
    .filter(([, count]) => count > 0)
    .sort(([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount || leftId.localeCompare(rightId),
    )
    .map(([themeId, count]) => ({ themeId, count }));
}

function historyPlacements(
  history: readonly DailyHistory[],
  seed: number,
  day: number,
): PlacementMap | null {
  const entry = history.find((candidate) => candidate.day === day);
  return entry ? getDailyTopCutPlacements(entry, seed) : null;
}

function eventTarget(
  kind: PlacementMicroEventKind,
  history: readonly DailyHistory[],
  seed: number,
  startDay: number,
): ThemeId | null {
  const reference = historyPlacements(history, seed, startDay - 1);
  if (!reference) return null;
  const leaders = ranked(reference);
  if (leaders.length === 0) return null;
  if (kind === "counter-breakthrough" || kind === "side-deck-wave") {
    return leaders[0].themeId;
  }
  if (kind === "lab-breakthrough") {
    const weakField = leaders.slice(Math.max(1, Math.floor(leaders.length * 0.6)));
    const pool = weakField.length > 0 ? weakField : leaders.slice(-1);
    return pool[
      keyedUint(seed, "placement-micro-target", startDay, kind) % pool.length
    ].themeId;
  }
  if (kind === "rogue-run") {
    const lowerField = leaders.slice(Math.max(1, Math.floor(leaders.length / 2)));
    const pool = lowerField.length > 0 ? lowerField : leaders;
    return pool[
      keyedUint(seed, "placement-micro-target", startDay, kind) % pool.length
    ].themeId;
  }
  if (kind === "list-refinement") {
    return leaders[Math.min(leaders.length - 1, 1)].themeId;
  }
  return leaders[Math.min(leaders.length - 1, 2)].themeId;
}

function giveSlots(
  placements: PlacementMap,
  targetThemeId: ThemeId,
  amount: number,
): void {
  const donors = ranked(placements)
    .map((entry) => entry.themeId)
    .filter((themeId) => themeId !== targetThemeId);
  let remaining = amount;
  let cursor = 0;
  while (remaining > 0 && donors.length > 0) {
    const donor = donors[cursor % donors.length];
    if (placements[donor] > 0) {
      placements[donor] -= 1;
      placements[targetThemeId] = (placements[targetThemeId] ?? 0) + 1;
      remaining -= 1;
    }
    cursor += 1;
    if (cursor > amount * donors.length * 2) break;
  }
}

function takeSlots(
  placements: PlacementMap,
  targetThemeId: ThemeId,
  amount: number,
): void {
  const recipients = ranked(placements)
    .map((entry) => entry.themeId)
    .filter((themeId) => themeId !== targetThemeId)
    .slice(0, 4);
  const available = Math.max(0, (placements[targetThemeId] ?? 0) - 1);
  const transfer = Math.min(amount, available);
  placements[targetThemeId] -= transfer;
  for (let index = 0; index < transfer; index += 1) {
    const recipient = recipients[index % Math.max(1, recipients.length)];
    if (recipient) placements[recipient] = (placements[recipient] ?? 0) + 1;
  }
}

function setTargetCount(
  placements: PlacementMap,
  targetThemeId: ThemeId,
  desiredCount: number,
): void {
  const currentCount = placements[targetThemeId] ?? 0;
  if (desiredCount > currentCount) {
    giveSlots(placements, targetThemeId, desiredCount - currentCount);
  } else if (desiredCount < currentCount) {
    takeSlots(placements, targetThemeId, currentCount - desiredCount);
  }
}

export function applyDailyPlacementMicroEvent({
  day,
  history,
  placements,
  seed,
}: {
  day: number;
  history: readonly DailyHistory[];
  placements: Readonly<PlacementMap>;
  seed: number;
}): PlacementMap {
  const schedule = scheduledEvent(seed, day);
  if (!schedule) return { ...placements };
  const targetThemeId = eventTarget(
    schedule.kind,
    history,
    seed,
    schedule.startDay,
  );
  if (!targetThemeId || (placements[targetThemeId] ?? 0) <= 0) {
    return { ...placements };
  }
  const adjusted = { ...placements };
  const baseline = historyPlacements(history, seed, schedule.startDay - 1);
  const baselineCount = baseline?.[targetThemeId] ?? adjusted[targetThemeId];

  if (schedule.kind === "counter-breakthrough") {
    if (schedule.phase === "recovery") {
      setTargetCount(adjusted, targetThemeId, Math.max(1, baselineCount + 1));
    } else if (schedule.phase === "shock") {
      setTargetCount(
        adjusted,
        targetThemeId,
        Math.max(1, Math.round(baselineCount * 0.4)),
      );
    } else {
      setTargetCount(
        adjusted,
        targetThemeId,
        Math.max(1, Math.round(baselineCount * 0.2)),
      );
    }
  } else if (schedule.kind === "lab-breakthrough") {
    const desiredCount = schedule.phase === "surge"
      ? Math.max(9, baselineCount + 6)
      : schedule.phase === "settled"
      ? Math.max(7, baselineCount + 4)
      : Math.max(8, baselineCount + 5);
    setTargetCount(adjusted, targetThemeId, desiredCount);
  } else if (schedule.kind === "side-deck-wave") {
    takeSlots(
      adjusted,
      targetThemeId,
      Math.max(3, Math.round(adjusted[targetThemeId] * 0.4)),
    );
  } else {
    const gain = schedule.kind === "rogue-run" ? 5 : 4;
    giveSlots(adjusted, targetThemeId, gain);
  }
  return adjusted;
}

function tierAtDay(
  history: readonly DailyHistory[],
  seed: number,
  themeId: ThemeId,
  day: number,
): MetaTier {
  const report = getRecentPlacementReport(history, seed, day);
  return getPlacementTier(report.themes[themeId]?.placementShare ?? 0).tier;
}

function tierChange(previousTier: MetaTier, currentTier: MetaTier): string {
  return previousTier === currentTier
    ? `${currentTier} 유지`
    : `${previousTier} → ${currentTier}`;
}

function hasExpectedPlacementDirection(
  kind: PlacementMicroEventKind,
  phase: DailyPlacementMicroEvent["phase"],
  previousCount: number,
  currentCount: number,
): boolean {
  if (currentCount <= 0) return false;
  const expectsFall =
    kind === "side-deck-wave" ||
    (kind === "counter-breakthrough" && phase !== "recovery");
  return expectsFall
    ? currentCount < previousCount
    : currentCount > previousCount;
}

function presentation(
  kind: PlacementMicroEventKind,
  phase: DailyPlacementMicroEvent["phase"],
  themeName: string,
  previousCount: number,
  currentCount: number,
  previousTier: MetaTier,
  currentTier: MetaTier,
): Pick<DailyPlacementMicroEvent, "headline" | "detail" | "tag"> {
  const tierResult = tierChange(previousTier, currentTier);
  if (kind === "counter-breakthrough" && phase === "shock") {
    return {
      tag: "COUNTER FOUND",
      headline: `${themeName} 카운터 플랜 급속 확산`,
      detail: `상위 테이블에 대처법이 공유되며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 급감했습니다.`,
    };
  }
  if (kind === "counter-breakthrough" && phase === "recovery") {
    return {
      tag: "ANSWER FOUND",
      headline: `${themeName}, 하루 만에 대응안 정립`,
      detail: `수정 덱리스트가 빠르게 퍼지며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 반등했습니다.`,
    };
  }
  if (kind === "counter-breakthrough" && phase === "pressure") {
    return {
      tag: "COUNTER SPREADING",
      headline: `${themeName} 카운터, 일시적 유행이 아니었다`,
      detail: `대응법이 지역 대회까지 퍼지며 낮아진 입상이 이어집니다. 발발 전 ${previousCount}석, 오늘 ${currentCount}석.`,
    };
  }
  if (kind === "counter-breakthrough") {
    return {
      tag: "META SHIFT",
      headline: `${themeName}, 카운터 환경에 밀려나다`,
      detail: `닷새간 대책이 정착되어 7일 입상 티어가 ${tierResult}로 굳어졌습니다.`,
    };
  }
  if (kind === "lab-breakthrough" && phase === "surge") {
    return {
      tag: "LAB BREAKTHROUGH",
      headline: `${themeName} 연구진, 미해결 전개선 발견`,
      detail: `외면받던 카드 조합의 실전성이 입증되며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 폭증했습니다.`,
    };
  }
  if (kind === "lab-breakthrough" && phase === "pressure") {
    return {
      tag: "LIST SPREADING",
      headline: `${themeName} 연구 리스트 전국 확산`,
      detail: `검증 영상과 매치업 가이드가 공유되며 돌풍이 며칠째 이어집니다. 발발 전 ${previousCount}석, 오늘 ${currentCount}석.`,
    };
  }
  if (kind === "lab-breakthrough") {
    return {
      tag: "NEW CONTENDER",
      headline: `${themeName}, 연구 끝에 주류권 진입`,
      detail: `닷새간 성적이 누적되어 7일 입상 티어가 ${tierResult}로 재평가됐습니다.`,
    };
  }
  if (kind === "rogue-run") {
    return {
      tag: "ROGUE RUN",
      headline: `${themeName} 무명 빌드, 예상 밖의 연속 입상`,
      detail: `공개되지 않았던 구축이 현장을 휩쓸며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 뛰었습니다.`,
    };
  }
  if (kind === "list-refinement") {
    return {
      tag: "LIST SOLVED",
      headline: `${themeName} 최적화 리스트 확산`,
      detail: `핵심 매수와 전개 순서가 정리되며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 증가했습니다.`,
    };
  }
  if (kind === "side-deck-wave") {
    return {
      tag: "SIDE-DECK WAVE",
      headline: `${themeName} 저격 사이드 채용 급증`,
      detail: `대회장이 같은 대응 카드를 준비하면서 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 밀렸습니다.`,
    };
  }
  return {
    tag: "MATCHUP POCKET",
    headline: `${themeName}에 유리한 대진 구도 형성`,
    detail: `상성 분포가 절묘하게 맞물리며 오늘 입상이 ${previousCount}석에서 ${currentCount}석으로 치솟았습니다.`,
  };
}

export function getDailyPlacementMicroEvent(
  history: readonly DailyHistory[],
  seed: number,
  day: number,
): DailyPlacementMicroEvent | null {
  const schedule = scheduledEvent(seed, day);
  const current = historyPlacements(history, seed, day);
  if (!schedule || !current) return null;
  const targetThemeId = eventTarget(
    schedule.kind,
    history,
    seed,
    schedule.startDay,
  );
  const baseline = historyPlacements(history, seed, schedule.startDay - 1);
  if (!targetThemeId || !baseline) return null;
  const baselineCount = baseline[targetThemeId] ?? 0;
  const priorDay = historyPlacements(history, seed, day - 1);
  const previousCount =
    schedule.kind === "counter-breakthrough" &&
    schedule.phase === "recovery"
      ? priorDay?.[targetThemeId] ?? baselineCount
      : baselineCount;
  const currentCount = current[targetThemeId] ?? 0;
  if (
    !hasExpectedPlacementDirection(
      schedule.kind,
      schedule.phase,
      previousCount,
      currentCount,
    )
  ) {
    return null;
  }
  const previousTier = tierAtDay(
    history,
    seed,
    targetThemeId,
    schedule.startDay - 1,
  );
  const currentTier = tierAtDay(history, seed, targetThemeId, day);
  const themeName = THEME_BY_ID[targetThemeId]?.shortName ?? targetThemeId;
  return {
    kind: schedule.kind,
    phase: schedule.phase,
    tone: currentCount >= previousCount ? "rise" : "fall",
    startDay: schedule.startDay,
    day,
    targetThemeId,
    previousCount,
    currentCount,
    previousTier,
    currentTier,
    ...presentation(
      schedule.kind,
      schedule.phase,
      themeName,
      previousCount,
      currentCount,
      previousTier,
      currentTier,
    ),
  };
}
