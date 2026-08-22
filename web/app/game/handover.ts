import { FIRST_RELEASE_DAY, TUTORIAL_END_DAY } from "./campaign.ts";
import type { TabTutorialTabId } from "./tab-tutorial.ts";

/**
 * The emergency handover reveals one new source of evidence at a time.
 * DAY 7 ends the guided handover. The release archive remains locked until
 * the first real product review arrives on DAY 10.
 */
export const HANDOVER_TAB_UNLOCK_DAY = {
  distribution: 0,
  cards: 0,
  community: 1,
  news: 1,
  finance: 3,
  operations: 4,
  releases: FIRST_RELEASE_DAY,
} as const satisfies Readonly<Record<TabTutorialTabId, number>>;

export type HandoverAccessContext = Readonly<{
  day: number;
  handoverComplete: boolean;
  /** Player-wide onboarding completion unlocks the full workspace on DAY 0. */
  tutorialSeriesComplete?: boolean;
}>;

export type HandoverTabAvailability = Readonly<{
  tab: TabTutorialTabId;
  unlockDay: number;
  unlocked: boolean;
  reason: string | null;
}>;

export type HandoverTabAvailabilityMap = Readonly<
  Record<TabTutorialTabId, HandoverTabAvailability>
>;

export type HandoverBriefing = Readonly<{
  day: number;
  tab: TabTutorialTabId | null;
  kicker: string;
  title: string;
  message: string;
}>;

export const HANDOVER_DAY_BRIEFINGS: readonly HandoverBriefing[] = [
  {
    day: 0,
    tab: "distribution",
    kicker: "긴급 투입",
    title: "취임 전 14일 분포를 검토하십시오",
    message: "현재 입상 분포와 카드 자료를 대조한 뒤, 기존 긴급 금제 화면에서 오늘 안에 첫 금제안을 봉인합니다.",
  },
  {
    day: 1,
    tab: "community",
    kicker: "금제 D+1",
    title: "플레이어 반응과 큰 변화가 함께 도착했습니다",
    message: "커뮤니티에서 여론을 읽고, 느낌표가 붙은 소식 탭에서 기록할 만한 변화를 직접 확인하십시오.",
  },
  {
    day: 2,
    tab: null,
    kicker: "인과 확인",
    title: "첫 반응과 큰 변화를 대조합니다",
    message: "커뮤니티의 여론과 소식의 사건 기록을 오가며 금제 이후 변화의 순서를 확인하십시오.",
  },
  {
    day: 3,
    tab: "finance",
    kicker: "재무 관측",
    title: "환경 조치도 현금과 신뢰를 움직입니다",
    message: "재무 탭에서 매출·보유자금·환경·구매 신뢰의 엇박자를 비교하십시오.",
  },
  {
    day: 4,
    tab: "operations",
    kicker: "후속 대응",
    title: "판결 뒤에는 운영이 남습니다",
    message: "사업 운영에서 비용과 위험을 비교하고 후속 조치의 타이밍을 익히십시오.",
  },
  {
    day: 5,
    tab: null,
    kicker: "후속 점검",
    title: "사업 대응과 시장 반응을 대조합니다",
    message: "열린 탭을 자유롭게 오가며 첫 판결의 환경·여론·재무 변화를 함께 확인하십시오.",
  },
  {
    day: 6,
    tab: null,
    kicker: "관측 정리",
    title: "첫 판결의 7일 표본을 마무리합니다",
    message: "모든 탭이 열렸습니다. DAY 7까지 분포·카드·여론·재무 변화를 자유롭게 대조하십시오.",
  },
  {
    day: TUTORIAL_END_DAY,
    tab: null,
    kicker: "인수인계 완료",
    title: "이제 모든 운영 판단을 직접 내립니다",
    message: "모든 탭이 개방됐습니다. DAY 10 첫 정규 발매 전까지 현재 환경을 정리하십시오.",
  },
] as const;

export function getHandoverTabUnlockDay(tab: TabTutorialTabId): number {
  return HANDOVER_TAB_UNLOCK_DAY[tab];
}

export function getHandoverBriefing(
  context: HandoverAccessContext,
): HandoverBriefing | null {
  if (context.tutorialSeriesComplete) return null;
  if (
    context.handoverComplete &&
    context.day !== TUTORIAL_END_DAY
  ) {
    return null;
  }
  return (
    HANDOVER_DAY_BRIEFINGS.find((briefing) => briefing.day === context.day) ??
    null
  );
}

export function isEmergencyHandoverDay({
  day,
  handoverComplete,
}: HandoverAccessContext): boolean {
  return !handoverComplete && day === 0;
}

export function isHandoverInProgress({
  day,
  handoverComplete,
}: HandoverAccessContext): boolean {
  return !handoverComplete && day >= 0 && day < TUTORIAL_END_DAY;
}

export function getHandoverTabAvailability(
  tab: TabTutorialTabId,
  context: HandoverAccessContext,
): HandoverTabAvailability {
  const unlockDay = getHandoverTabUnlockDay(tab);
  const unlocked = context.tutorialSeriesComplete || (
    tab === "releases"
      ? context.day >= unlockDay
      : context.handoverComplete || context.day >= unlockDay
  );
  return {
    tab,
    unlockDay,
    unlocked,
    reason: unlocked
      ? null
      : "인수인계가 진행되면 개방됩니다.",
  };
}

export function getHandoverTabAvailabilityMap(
  context: HandoverAccessContext,
): HandoverTabAvailabilityMap {
  return Object.fromEntries(
    (Object.keys(HANDOVER_TAB_UNLOCK_DAY) as TabTutorialTabId[]).map((tab) => [
      tab,
      getHandoverTabAvailability(tab, context),
    ]),
  ) as HandoverTabAvailabilityMap;
}

export function getUnlockedHandoverTabs(
  context: HandoverAccessContext,
): TabTutorialTabId[] {
  return (Object.keys(HANDOVER_TAB_UNLOCK_DAY) as TabTutorialTabId[]).filter(
    (tab) => getHandoverTabAvailability(tab, context).unlocked,
  );
}

/** Returns tabs whose access changed between two campaign snapshots. */
export function getNewlyUnlockedHandoverTabs(
  previous: HandoverAccessContext,
  next: HandoverAccessContext,
): TabTutorialTabId[] {
  return (Object.keys(HANDOVER_TAB_UNLOCK_DAY) as TabTutorialTabId[])
    .filter(
      (tab) =>
        !getHandoverTabAvailability(tab, previous).unlocked &&
        getHandoverTabAvailability(tab, next).unlocked,
    )
    .sort(
      (left, right) =>
        getHandoverTabUnlockDay(left) - getHandoverTabUnlockDay(right),
    );
}

/**
 * Keeps restored or programmatically selected tabs inside the currently
 * available surface. Distribution is always the safe DAY 0 destination.
 */
export function resolveHandoverTab(
  requestedTab: TabTutorialTabId,
  context: HandoverAccessContext,
): TabTutorialTabId {
  return getHandoverTabAvailability(requestedTab, context).unlocked
    ? requestedTab
    : "distribution";
}

export function getHandoverProgress(context: HandoverAccessContext): Readonly<{
  currentDay: number;
  endDay: number;
  complete: boolean;
  percent: number;
}> {
  const currentDay = Math.max(0, Math.min(TUTORIAL_END_DAY, context.day));
  const complete = context.handoverComplete || context.day >= TUTORIAL_END_DAY;
  return {
    currentDay,
    endDay: TUTORIAL_END_DAY,
    complete,
    percent: complete
      ? 100
      : Math.round((currentDay / Math.max(1, TUTORIAL_END_DAY)) * 100),
  };
}
