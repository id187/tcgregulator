"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarIcon,
  ChevronIcon,
  ClockIcon,
  GavelIcon,
  MessageIcon,
  ReleaseIcon,
  RevenueIcon,
  TrendIcon,
  UsersIcon,
} from "./components/MetricGlyphs";
import { BrandMark } from "./components/BrandMark";
import { ThemeEmblem } from "./components/ThemeEmblem";
import { THEME_BY_ID, THEMES } from "./game/content";
import {
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  PLAYER_CONTROL_DAYS,
  PROLOGUE_SEED,
  SETTLEMENT_START_DAY,
  SETTLEMENT_DAYS,
} from "./game/campaign";
import {
  CAMPAIGN_ENVIRONMENT_STABLE_MIN,
  evaluateCampaignEnding,
  getCampaignEndingHints,
  type CampaignCashBand,
  type CampaignEndingEvaluation,
  type CampaignEnvironmentBand,
} from "./game/campaign-ending";
import {
  getMarketDivergenceLag,
  getRevenueChangeSignal,
  getMonthlyOperatingCost,
  getOperatingRunwayMonths,
  OPERATING_COST_START_DAY,
  RELEASE_SALES_WINDOW_DAYS,
} from "./game/finance";
import {
  getCommunityHeat,
  getDailyCommunityPosts,
  getReleaseReactionProfile,
  type ReleaseReactionProfile,
} from "./game/daily-community";
import { getDailyCommunitySentiment } from "./game/community-sentiment";
import { getChartEnvironmentHealth } from "./game/environment-health";
import {
  isNamedMetaTier,
  type MetaTier,
} from "./game/meta-tiers";
import {
  getPlacementTier,
  getRecentPlacementReport,
  getThemeDebutDay,
  type RecentPlacementReport,
  type ThemePlacementReport,
} from "./game/placement-meta";
import {
  BUSINESS_ACTIONS,
  BUSINESS_ACTION_BY_TYPE,
  BUSINESS_ACTION_DAILY_REVENUE_CAP,
  getBusinessActionAvailability,
  getBusinessActionDailyGrossRevenue,
  getBusinessActionProjectedDirectCash,
  getBusinessActionProjectedDirectGrossRevenue,
  getBusinessEnvironmentHealth,
  getBusinessEnvironmentHealthBreakdown,
  getChampionshipBacklashRisk,
  getPackOddsDetectionRisk,
  getStrategicProjectRiskProfile,
  isBusinessActionEffectActive,
  isStrategicBusinessAction,
  type StrategicBusinessActionType,
} from "./game/business-actions";
import {
  BUSINESS_EVENT_BY_TYPE,
  BUSINESS_STRATEGY_AXES,
  BUSINESS_STRATEGY_AXIS_LABELS,
  getBusinessEventResult,
} from "./game/business-events";
import {
  canProposeSupport,
  createCampaignStart,
  createFirstBanGame,
  formatCommunityEvent,
  getBanDemand,
  getCommittedSupportCount,
  getExpectedTier,
  getNextBanDay,
  getNextReleaseDay,
  getPrologueReleaseSelections,
  isBanDay,
  reduceGame,
} from "./game/engine";
import {
  loadPersistedGame,
  savePersistedGame,
  type PersistenceBackend,
} from "./game/persistence-client";
import {
  getRestrictionPolicyProfile,
  type RestrictionPolicyProfile,
} from "./game/restriction-policy";
import type {
  BusinessActionRecord,
  BusinessActionType,
  BusinessEventChoice,
  BusinessEventRecord,
  CommunityEvent,
  GameCommand,
  GameState,
  PartRole,
  PowerAdjustment,
  RestrictionLimit,
  SupportDirection,
  ThemeContent,
  ThemeId,
  ThemeRuntime,
} from "./game/types";

type TabId =
  | "distribution"
  | "themes"
  | "restrictions"
  | "releases"
  | "operations"
  | "community"
  | "finance";

const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "distribution", label: "분포" },
  { id: "themes", label: "테마" },
  { id: "restrictions", label: "파츠·금제" },
  { id: "releases", label: "발매 제안" },
  { id: "operations", label: "사업 운영" },
  { id: "community", label: "커뮤니티" },
  { id: "finance", label: "재무" },
];

type MotionPreference = "system" | "reduced";
type GameSoundKind = "click" | "release" | "restriction" | "event" | "impact";

type InterfaceSettings = {
  soundEnabled: boolean;
  impactEffectsEnabled: boolean;
  motionPreference: MotionPreference;
};

const INTERFACE_SETTINGS_KEY = "tcg-regulator-interface-settings-v1";
const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = {
  soundEnabled: true,
  impactEffectsEnabled: true,
  motionPreference: "system",
};

function mintCampaignSeed(previousSeed: number): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  const candidate = values[0] >>> 0;
  return candidate === (previousSeed >>> 0)
    ? (candidate + 0x9e3779b9) >>> 0
    : candidate;
}

function emitGameSound(kind: GameSoundKind) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GameSoundKind>("tcg-regulator-sound", {
    detail: kind,
  }));
}

function playSynthTone(context: AudioContext, kind: GameSoundKind) {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(kind === "click" ? 0.12 : 0.11, now + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "click" ? 0.11 : 0.42));
  master.connect(context.destination);

  const notes: Array<{ frequency: number; offset: number; duration: number; type: OscillatorType }> =
    kind === "release"
      ? [
          { frequency: 220, offset: 0, duration: 0.12, type: "triangle" },
          { frequency: 330, offset: 0.09, duration: 0.14, type: "triangle" },
          { frequency: 440, offset: 0.18, duration: 0.17, type: "sine" },
        ]
      : kind === "restriction"
        ? [
            { frequency: 270, offset: 0, duration: 0.16, type: "square" },
            { frequency: 170, offset: 0.12, duration: 0.2, type: "triangle" },
          ]
        : kind === "event"
          ? [
              { frequency: 185, offset: 0, duration: 0.11, type: "sawtooth" },
              { frequency: 245, offset: 0.11, duration: 0.16, type: "triangle" },
            ]
          : kind === "impact"
            ? [
                { frequency: 392, offset: 0, duration: 0.16, type: "sine" },
                { frequency: 587, offset: 0.1, duration: 0.22, type: "triangle" },
              ]
            : [
                { frequency: 760, offset: 0, duration: 0.075, type: "triangle" },
                { frequency: 1120, offset: 0.012, duration: 0.045, type: "sine" },
              ];

  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + note.offset;
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (kind === "click") {
      oscillator.frequency.exponentialRampToValueAtTime(
        note.frequency * 0.58,
        start + note.duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.75, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.02);
  });
}

function loadInterfaceSettings(): InterfaceSettings {
  if (typeof window === "undefined") return DEFAULT_INTERFACE_SETTINGS;
  try {
    const saved = window.localStorage.getItem(INTERFACE_SETTINGS_KEY);
    if (!saved) return DEFAULT_INTERFACE_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<InterfaceSettings>;
    return {
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_INTERFACE_SETTINGS.soundEnabled,
      impactEffectsEnabled:
        typeof parsed.impactEffectsEnabled === "boolean"
          ? parsed.impactEffectsEnabled
          : DEFAULT_INTERFACE_SETTINGS.impactEffectsEnabled,
      motionPreference:
        parsed.motionPreference === "reduced" ? "reduced" : "system",
    };
  } catch {
    return DEFAULT_INTERFACE_SETTINGS;
  }
}

function useInterfaceSettings() {
  const [settings, setSettings] = useState<InterfaceSettings>(
    loadInterfaceSettings,
  );
  const settingsRef = useRef(settings);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      window.localStorage.setItem(INTERFACE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Interface preferences are optional when storage is unavailable.
    }
  }, [settings]);

  useEffect(() => {
    const ensureAudioContext = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
      return audioContextRef.current;
    };
    const play = (kind: GameSoundKind, fromUserGesture: boolean) => {
      if (!settingsRef.current.soundEnabled) return;
      if (!audioContextRef.current && !fromUserGesture) return;
      try {
        playSynthTone(ensureAudioContext(), kind);
      } catch {
        // Audio support is an enhancement; gameplay remains fully functional.
      }
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || button.disabled || button.dataset.sound === "none") return;
      const kind = (button.dataset.sound as GameSoundKind | undefined) ?? "click";
      play(kind, true);
    };
    const handleGameSound = (event: Event) => {
      play((event as CustomEvent<GameSoundKind>).detail, false);
    };
    document.addEventListener("click", handleClick, true);
    window.addEventListener("tcg-regulator-sound", handleGameSound);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("tcg-regulator-sound", handleGameSound);
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, []);

  const updateSetting = <Key extends keyof InterfaceSettings>(
    key: Key,
    value: InterfaceSettings[Key],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  return { settings, updateSetting };
}

function SettingsOptions({
  settings,
  updateSetting,
}: {
  settings: InterfaceSettings;
  updateSetting: <Key extends keyof InterfaceSettings>(
    key: Key,
    value: InterfaceSettings[Key],
  ) => void;
}) {
  return (
    <div className="settings-options">
      <button
        aria-pressed={settings.soundEnabled}
        data-sound="none"
        onClick={() => updateSetting("soundEnabled", !settings.soundEnabled)}
        type="button"
      >
        <span>효과음</span>
        <strong>{settings.soundEnabled ? "ON" : "OFF"}</strong>
      </button>
      <button
        aria-pressed={settings.impactEffectsEnabled}
        onClick={() =>
          updateSetting("impactEffectsEnabled", !settings.impactEffectsEnabled)
        }
        type="button"
      >
        <span>파급 화면 효과</span>
        <strong>{settings.impactEffectsEnabled ? "ON" : "OFF"}</strong>
      </button>
      <button
        data-sound="impact"
        disabled={!settings.soundEnabled}
        onClick={() => undefined}
        type="button"
      >
        <span>효과음 테스트</span>
        <strong>{settings.soundEnabled ? "PLAY" : "OFF"}</strong>
      </button>
      <button
        aria-pressed={settings.motionPreference === "reduced"}
        onClick={() =>
          updateSetting(
            "motionPreference",
            settings.motionPreference === "reduced" ? "system" : "reduced",
          )
        }
        type="button"
      >
        <span>모션 감소</span>
        <strong>
          {settings.motionPreference === "reduced" ? "강제 감소" : "시스템 설정"}
        </strong>
      </button>
    </div>
  );
}

const ROLE_LABELS: Record<PartRole, string> = {
  starter1: "초동 1",
  starter2: "초동 2",
  bridge: "중간다리",
  finisher: "최종 결과물",
  recursion: "자원 회수",
};

const LIMIT_LABELS: Record<RestrictionLimit, string> = {
  0: "금지",
  1: "제한",
  2: "준제한",
  3: "무제한",
};

const SUPPORT_DIRECTIONS: {
  value: SupportDirection;
  label: string;
  description: string;
}[] = [
  { value: "consistency", label: "안정성", description: "초동과 전개 성공률 보강" },
  { value: "counterplay", label: "대응력", description: "불리 상성과 후공 수단 보강" },
  { value: "finisher", label: "결과물", description: "최종 필드와 승리 수단 강화" },
  { value: "recovery", label: "회수", description: "장기전과 재전개 자원 보강" },
];

const POWER_ADJUSTMENTS = [-3, -2, -1, 0, 1, 2, 3] as const;

const POWER_ADJUSTMENT_LABELS: Record<PowerAdjustment, string> = {
  [-3]: "매우 약하게",
  [-2]: "약하게",
  [-1]: "조금 약하게",
  0: "기준",
  1: "조금 강하게",
  2: "강하게",
  3: "매우 강하게",
};

function totalUsers(game: GameState) {
  return game.users.tier + game.users.casual + game.users.collector;
}

function formatUsers(value: number) {
  const rounded = Math.round(value);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(
    Object.is(rounded, -0) ? 0 : rounded,
  );
}

function formatRevenue(value: number) {
  if (value >= 1) return `${value.toFixed(1)}억`;
  return `${Math.round(value * 10000).toLocaleString("ko-KR")}만`;
}

function formatSignedRevenue(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}₩${formatRevenue(Math.abs(value))}`;
}

function getBusinessRecordStatus(record: BusinessActionRecord, day: number) {
  const remaining = Math.max(0, record.endsDay - day);
  switch (record.outcome) {
    case "pending":
      return "다음 정기 발매 대기";
    case "success":
      return remaining > 0 ? `흥행 · ${remaining}일 남음` : "흥행 종료";
    case "backlash":
      return remaining > 0 ? `역풍 · ${remaining}일 남음` : "역풍 종료";
    case "clean":
      return remaining > 0 ? `미적발 · ${remaining}일 남음` : "조정 종료";
    case "detected":
      return "적발 · 효과 중단";
    case "completed":
      return "집행 종료";
    case "active":
      if (isStrategicBusinessAction(record.type)) {
        const resultDay = record.startedDay +
          (BUSINESS_ACTION_BY_TYPE[record.type].resolutionDelay ?? 1);
        return day < resultDay
          ? `성과 심사 중 · D-${resultDay - day}`
          : "성과 확정 대기";
      }
      if (day <= record.startedDay) return "집행 완료 · 익일부터 시작";
      return remaining > 0 ? `진행 중 · ${remaining}일 남음` : "집행 종료";
  }
}

function getBusinessRecordProgress(record: BusinessActionRecord, day: number) {
  if (record.outcome === "pending") return 0;
  if (record.outcome === "completed" || record.outcome === "detected") {
    return 100;
  }
  const duration = Math.max(1, record.endsDay - record.startedDay);
  return Math.max(
    0,
    Math.min(100, ((day - record.startedDay) / duration) * 100),
  );
}

function getBusinessTransitionToast(previous: GameState, next: GameState) {
  for (const record of [...next.operations.records].reverse()) {
    const previousRecord = previous.operations.records.find(
      (candidate) => candidate.id === record.id,
    );
    if (!previousRecord || previousRecord.outcome === record.outcome) continue;
    if (record.outcome === "detected") {
      return `봉입률 조정이 적발됐습니다. 구매 신뢰가 ${Math.round(next.purchaseTrust)}로 급락했습니다.`;
    }
    if (record.outcome === "clean") {
      return "봉입률 조정이 적발되지 않았습니다. 희소도 효과가 이어집니다.";
    }
    if (record.outcome === "active" && previousRecord.outcome === "pending") {
      return "예약한 봉입률 조정이 이번 정기 발매에 적용됐습니다.";
    }
    if (record.outcome === "backlash") {
      return isStrategicBusinessAction(record.type)
        ? `${BUSINESS_ACTION_BY_TYPE[record.type].title}이 실패했습니다. 투자금을 회수하지 못했고 후속 역풍이 시작됩니다.`
        : "챔피언십 중계가 환경 문제를 노출해 역풍이 시작됐습니다.";
    }
    if (record.outcome === "success") {
      return isStrategicBusinessAction(record.type)
        ? `${BUSINESS_ACTION_BY_TYPE[record.type].title}이 성공했습니다. ₩${formatRevenue(record.cashReturn ?? 0)}을 회수했습니다.`
        : "챔피언십이 흥행했습니다. 대회 유입 효과가 시작됩니다.";
    }
  }
  return null;
}

function getBusinessEventTransitionToast(
  previous: GameState,
  next: GameState,
) {
  for (const record of [...next.operations.eventRecords].reverse()) {
    const previousRecord = previous.operations.eventRecords.find(
      (candidate) => candidate.id === record.id,
    );
    if (
      !previousRecord ||
      previousRecord.outcome === record.outcome ||
      record.outcome === "pending"
    ) {
      continue;
    }
    const result = getBusinessEventResult(
      record.type,
      record.choice,
      record.outcome,
    );
    return `${result.headline} — ${result.body}`;
  }
  return null;
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

const EMPTY_PLACEMENT_METRICS: ThemePlacementReport = {
  placements: 0,
  placementShare: 0,
  estimatedEntrants: 0,
  observedConversion: 0,
};

function makeRestrictionDraft(game: GameState) {
  return Object.fromEntries(
    Object.values(game.themes).flatMap((theme) =>
      Object.entries(theme.legalLimits),
    ),
  ) as Record<string, RestrictionLimit>;
}

function getTierTone(label: string) {
  if (label === "Tier 0") return "danger";
  if (label === "Tier 1") return "strong";
  if (label === "Tier 2") return "steady";
  return "quiet";
}

type FatigueSignal = {
  level: "none" | "building" | "spreading" | "breaking";
  label: string;
};

function getReleaseAge(game: GameState, day: number): number | null {
  const latestRelease = [...game.releaseHistory]
    .reverse()
    .find((batch) => batch.day <= day);
  if (!latestRelease) return null;
  const age = day - latestRelease.day;
  return age < RELEASE_SALES_WINDOW_DAYS ? age : null;
}

function getFatigueSignal(runtime: ThemeRuntime): FatigueSignal {
  if (runtime.fatigue >= 75) {
    return { level: "breaking", label: "반감 폭발" };
  }
  if (runtime.fatigue >= 55) {
    return { level: "spreading", label: "피로 확산" };
  }
  if (runtime.fatigue >= 35) {
    return { level: "building", label: "노출 누적" };
  }
  return { level: "none", label: "피로 안정" };
}

type ImpactNotice = {
  key: string;
  headline: string;
  metrics: string[];
  cause: string;
  tone: "positive" | "negative" | "alert";
};

type AdvisorBrief = {
  tone: "calm" | "info" | "caution" | "critical";
  kicker: string;
  message: string;
  submessage?: string;
};

function buildImpactNotice(game: GameState): ImpactNotice | null {
  const current = [...game.history]
    .reverse()
    .find((entry) => entry.day === game.day);
  const previous = [...game.history]
    .reverse()
    .find((entry) => entry.day < game.day);
  const currentTotal = totalUsers(game);
  const userDelta = current && previous
    ? Math.round(current.totalUsers - previous.totalUsers)
    : 0;
  const revenueRate = current && previous && previous.revenue > 0
    ? ((current.revenue - previous.revenue) / previous.revenue) * 100
    : 0;
  const heat = getCommunityHeat(game, game.day);
  const profile = getReleaseReactionProfile(game, game.day);
  const mostFatiguedTheme = game.activeThemeIds.reduce<ThemeId | null>(
    (highest, themeId) => {
      if (!highest) return themeId;
      return game.themes[themeId].fatigue > game.themes[highest].fatigue
        ? themeId
        : highest;
    },
    null,
  );
  const fatigue = mostFatiguedTheme ? game.themes[mostFatiguedTheme].fatigue : 0;
  const revenueSignal = getRevenueChangeSignal(
    revenueRate,
    getReleaseAge(game, game.day),
    current && previous ? current.day - previous.day : 1,
  );
  const revenueShock = revenueSignal !== null;
  const userShock = Math.abs(userDelta) >= Math.max(150, currentTotal * 0.0015);
  const heatShock = heat >= 75;

  if (!revenueShock && !userShock && !heatShock) return null;

  const metrics: string[] = [];
  if (revenueShock) {
    metrics.push(`매출 ${revenueRate >= 0 ? "급등" : "급락"} ${revenueRate >= 0 ? "+" : ""}${revenueRate.toFixed(1)}%`);
  }
  if (userShock) {
    metrics.push(`활성 유저 ${userDelta >= 0 ? "급증" : "급락"} ${userDelta >= 0 ? "+" : ""}${formatUsers(userDelta)}명`);
  }
  if (heatShock) metrics.push(`커뮤니티 열기 ${heat}`);

  const releaseToday = game.releaseHistory.some((batch) => batch.day === game.day);
  const activeRevenueAction = [...game.operations.records]
    .reverse()
    .find(
      (record) =>
        isBusinessActionEffectActive(record, game.day) &&
        getBusinessActionDailyGrossRevenue(
          game,
          record.type,
          record.outcome,
        ) > 0,
    );
  const cause = releaseToday
    ? profile.headline || "신제품 발매 직후 반응"
    : isBanDay(game.day)
      ? "금제 시행 후 시장 재평가"
      : activeRevenueAction
        ? `${BUSINESS_ACTION_BY_TYPE[activeRevenueAction.type].title} 직접 매출 효과`
      : fatigue >= 75 && mostFatiguedTheme
        ? `${THEME_BY_ID[mostFatiguedTheme].shortName} 장기 노출 · 반감 폭발`
        : "메타와 시장의 일일 급변";
  const headline = heatShock
    ? "반응 폭발"
    : revenueSignal === "surge"
      ? `매출 급등 +${revenueRate.toFixed(1)}%`
      : userDelta < 0
        ? `활성 유저 급락 ${formatUsers(userDelta)}명`
        : "시장 급변 감지";
  const tone = userDelta < 0 || revenueSignal === "drop"
    ? "negative"
    : heatShock
      ? "alert"
      : "positive";

  return {
    key: `${game.day}-${game.releaseHistory.length}-${Math.round(current?.revenue ?? game.finance.today)}-${Math.round(currentTotal)}`,
    headline,
    metrics,
    cause,
    tone,
  };
}

function getAdvisorBrief(
  game: GameState,
  impactNotice: ImpactNotice | null,
  activeTab: TabId,
  concentratedRestrictionRisk: boolean,
  restrictionPolicy: RestrictionPolicyProfile,
): AdvisorBrief {
  const tabBriefs: Record<TabId, AdvisorBrief> = {
    distribution: {
      tone: "info",
      kicker: "입상 해석",
      message: "입상 점유율은 최근 30일 탑컷 비중입니다. 채용률·승률과 함께 보십시오.",
    },
    themes: {
      tone: "info",
      kicker: "테마 해석",
      message: "승률과 채용률은 같은 지표가 아닙니다. 다른 테마로 출장하는 파츠도 확인하십시오.",
    },
    restrictions: {
      tone: "info",
      kicker: "금제 해석",
      message: "허용 매수보다 실제 의존도가 충격의 크기를 결정합니다.",
    },
    releases: {
      tone: "info",
      kicker: "발매 해석",
      message: "예상 티어는 추정치입니다. 파워 조정은 판매 기대와 환경 충격을 함께 바꿉니다.",
    },
    operations: {
      tone: "info",
      kicker: "사업 운영",
      message: "한 번의 집행은 오늘의 비용뿐 아니라 여러 날의 유입과 신뢰에 영향을 줍니다.",
      submessage: "환경을 공개하는 행사는 현재 메타가 건강할 때만 성장으로 돌아옵니다.",
    },
    community: {
      tone: "info",
      kicker: "커뮤니티 해석",
      message: "커뮤니티는 모든 사람이 글을 작성할 수 있습니다. 게임을 하지 않은 사람들조차요.",
      submessage: "반응은 체감의 기록이지, 실제 매출이나 환경의 판정이 아닙니다.",
    },
    finance: {
      tone: "info",
      kicker: "재무 해석",
      message: "발매일의 급등과 장기 잔존은 분리해서 보아야 합니다.",
      submessage: "DAY 47부터 기본 조직비와 활성 유저 규모 비용이 매일 일할 정산됩니다.",
    },
  };
  const activeTabBrief = tabBriefs[activeTab];
  const withActiveTabHint = (priorityBrief: AdvisorBrief): AdvisorBrief => {
    const priorityCopy = [priorityBrief.message, priorityBrief.submessage]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    const tabHint = [activeTabBrief.message, activeTabBrief.submessage]
      .filter(
        (value): value is string =>
          typeof value === "string" && !priorityCopy.includes(value),
      )
      .join(" ");
    if (!tabHint) return priorityBrief;
    return {
      ...priorityBrief,
      submessage: [priorityBrief.submessage, tabHint]
        .filter((value): value is string => Boolean(value))
        .join(" "),
    };
  };

  if (game.phase === "release-edit") {
    return withActiveTabHint({
      tone: "caution",
      kicker: "발매 검토 대기",
      message: "6개 시안과 7단계 조정폭이 열려 있습니다. 로터스는 예상 파급만 정리하며 선택은 대신하지 않습니다.",
    });
  }
  if (game.phase === "ban-edit") {
    if (concentratedRestrictionRisk) {
      return withActiveTabHint({
        tone: "caution",
        kicker: "금제 영향 경고",
        message: "환경 압력은 낮아질 수 있지만, 이 테마에 투자한 경쟁층의 이탈 위험도 함께 커집니다.",
      });
    }
    if (restrictionPolicy.changeCount === 0) {
      return withActiveTabHint({
        tone: "caution",
        kicker: "환경 유지안",
        message: "아무 파츠도 바꾸지 않으면 현재 메타와 구매 흐름이 그대로 이어집니다. 이것도 하나의 운영 결정입니다.",
        submessage: "점유율·승률·불쾌도와 실제 파츠 의존도를 비교한 뒤 제출하십시오.",
      });
    }
    if (restrictionPolicy.meaningfulCutCount === 0) {
      return withActiveTabHint({
        tone: "caution",
        kicker: "실효성 낮은 조정",
        message: `${restrictionPolicy.changeCount}건을 바꿨지만 현재 채용 매수 기준으로 환경에 미치는 영향은 작게 예측됩니다.`,
        submessage: "상징적 조치가 필요한지, 실제 메타 변화가 필요한지는 책임자님의 판단입니다.",
      });
    }
    return withActiveTabHint({
      tone: restrictionPolicy.totalImpact >= 45 ? "caution" : "calm",
      kicker: "금제 파급 예측",
      message: `실효 조정 ${restrictionPolicy.meaningfulCutCount}종 · 영향 테마 ${restrictionPolicy.affectedThemeCount}개 · 추정 충격 ${Math.round(restrictionPolicy.totalImpact)}입니다.`,
      submessage: `상위권 ${restrictionPolicy.upperMeaningfulCuts}종 · Tier 2 ${restrictionPolicy.tier2MeaningfulCuts}종 · 하위권 ${restrictionPolicy.lowerMeaningfulCuts}종에 영향을 줍니다. 로터스는 결과를 예측할 뿐 정답을 정하지 않습니다.`,
    });
  }
  const releasePublishedToday = game.releaseHistory.some(
    (batch) => batch.day === game.day,
  );
  const restrictionPublishedToday =
    isBanDay(game.day) && game.phase === "running";
  if (releasePublishedToday || restrictionPublishedToday) {
    return withActiveTabHint({
      tone: restrictionPublishedToday ? "caution" : "info",
      kicker: restrictionPublishedToday ? "금제안 공표" : "신제품 발매 공표",
      message: `결정이 공표되었습니다. 티어와 커뮤니티 반응 관측은 DAY ${game.day + 1}부터 시작됩니다.`,
    });
  }
  if (impactNotice) {
    return withActiveTabHint({
      tone: impactNotice.tone === "negative" ? "critical" : "caution",
      kicker: impactNotice.headline,
      message: `${impactNotice.metrics.join(" · ")} — ${impactNotice.cause}`,
    });
  }
  if (game.phase === "running" && game.day > LAST_DECISION_DAY) {
    return withActiveTabHint({
      tone: "calm",
      kicker: "최종 결산 관찰",
      message: `새 결정은 마감됐습니다. DAY ${CAMPAIGN_END_DAY}까지 최종 금제와 시장 반응을 관측한 뒤 임기 결과를 확정합니다.`,
    });
  }
  if (game.phase === "ended" && totalUsers(game) <= 0) {
    return withActiveTabHint({
      tone: "critical",
      kicker: "서비스 종료",
      message: "활성 유저가 0명에 도달했습니다. 임기 만료가 아니라 운영 실패로 서비스가 종료됩니다.",
    });
  }
  if (game.phase === "ended") {
    return withActiveTabHint({
      tone: "calm",
      kicker: "임기 종료",
      message: `DAY ${CAMPAIGN_END_DAY}까지의 운영 기록이 확정되었습니다. 로터스가 임기 결과를 정리했습니다.`,
    });
  }

  const fatiguedThemeId = game.activeThemeIds.reduce<ThemeId | null>(
    (highest, themeId) => {
      if (!highest) return themeId;
      return game.themes[themeId].fatigue > game.themes[highest].fatigue
        ? themeId
        : highest;
    },
    null,
  );
  const fatiguedRuntime = fatiguedThemeId ? game.themes[fatiguedThemeId] : null;
  if (fatiguedThemeId && fatiguedRuntime && fatiguedRuntime.fatigue >= 75) {
    return withActiveTabHint({
      tone: "critical",
      kicker: "장기 노출 반감 폭발",
      message: `${THEME_BY_ID[fatiguedThemeId].shortName} 피로도 ${Math.round(fatiguedRuntime.fatigue)} · 1위 유지 ${fatiguedRuntime.topStreakDays}일입니다. 수치와 여론이 동시에 흔들리고 있습니다.`,
    });
  }
  if (fatiguedThemeId && fatiguedRuntime && fatiguedRuntime.fatigue >= 55) {
    return withActiveTabHint({
      tone: "caution",
      kicker: "메타 피로 확산",
      message: `${THEME_BY_ID[fatiguedThemeId].shortName} 피로도 ${Math.round(fatiguedRuntime.fatigue)} · 1위 유지 ${fatiguedRuntime.topStreakDays}일입니다. 장기 노출 신호가 커지고 있습니다.`,
    });
  }

  return activeTabBrief;
}

function hasConcentratedRestrictionRisk(
  game: GameState,
  draft: Record<string, RestrictionLimit>,
) {
  const topThemeId = game.activeThemeIds.reduce<ThemeId | null>(
    (highest, themeId) => {
      if (!highest) return themeId;
      return game.themes[themeId].share > game.themes[highest].share
        ? themeId
        : highest;
    },
    null,
  );
  if (!topThemeId) return false;
  const runtime = game.themes[topThemeId];
  const highDependencyCuts = THEME_BY_ID[topThemeId].parts.filter((part) => {
    if (part.inclusion < 0.8 || part.powerWeight < 18) return false;
    const current = runtime.legalLimits[part.id] ?? 3;
    const next = draft[part.id] ?? current;
    return next < current;
  });
  return (
    highDependencyCuts.some((part) => {
      const current = runtime.legalLimits[part.id] ?? 3;
      return current - (draft[part.id] ?? current) >= 2;
    }) || highDependencyCuts.length >= 2
  );
}

function supportStatusLabel(
  status: GameState["supportRequests"][number]["status"],
) {
  if (status === "queued") return "시안 대기";
  if (status === "offered") return "이번 시안";
  if (status === "released") return "발매 완료";
  return "미선정";
}

function getRestrictionTenureLabel(
  game: GameState,
  themeId: ThemeId,
  partId: string,
  official: RestrictionLimit,
) {
  if (official === 3) return null;
  const establishingEvent = [...game.community].reverse().find(
    (event) =>
      event.themeId === themeId &&
      event.partId === partId &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction") &&
      event.value === official &&
      typeof event.previousValue === "number" &&
      event.previousValue > official,
  );
  if (!establishingEvent) return "장기 유지";
  return `금제 유지 ${Math.max(0, game.day - establishingEvent.day)}일`;
}

type BootState =
  | { status: "loading" }
  | {
      status: "title";
      backend: PersistenceBackend;
      savedGame: GameState | null;
    }
  | {
      status: "prologue";
      backend: PersistenceBackend;
      initialGame: GameState;
    }
  | {
      status: "playing";
      backend: PersistenceBackend;
      initialGame: GameState;
      warning?: string;
    };

export default function Home() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [titleMessage, setTitleMessage] = useState<string | null>(null);
  const { settings, updateSetting } = useInterfaceSettings();

  useEffect(() => {
    let cancelled = false;
    void loadPersistedGame()
      .then((result) => {
        if (cancelled) return;
        setBoot({
          status: "title",
          backend: result.backend,
          savedGame: result.game,
        });
        setTitleMessage(
          result.backend.kind === "unavailable"
            ? result.backend.message
            : (result.warning ?? null),
        );
      })
      .catch(() => {
        if (cancelled) return;
        const backend: PersistenceBackend = {
          kind: "unavailable",
          message:
            "저장 시스템을 시작하지 못했습니다. 저장소를 복구하기 전에는 새 임기를 시작할 수 없습니다.",
        };
        setBoot({ status: "title", backend, savedGame: null });
        setTitleMessage(backend.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function beginNewGame(confirmed = false) {
    if (boot.status !== "title") return;
    if (boot.savedGame && !confirmed) {
      setConfirmNewGame(true);
      return;
    }

    setConfirmNewGame(false);
    const next = createCampaignStart(PROLOGUE_SEED);
    try {
      if (boot.backend.kind === "unavailable") {
        throw new Error(boot.backend.message);
      }
      await savePersistedGame(boot.backend, next);
      setTitleMessage(null);
      setBoot({
        status: "prologue",
        backend: boot.backend,
        initialGame: next,
      });
    } catch {
      setTitleMessage(
        "새 임기를 저장하지 못했습니다. 기존 저장은 그대로 유지됩니다. 저장소 상태를 확인한 뒤 다시 시도하세요.",
      );
    }
  }

  function continueGame() {
    if (boot.status !== "title" || !boot.savedGame) return;
    if (!boot.savedGame.handoverComplete) {
      setBoot({
        status: "prologue",
        backend: boot.backend,
        initialGame: boot.savedGame,
      });
      return;
    }
    setBoot({
      status: "playing",
      backend: boot.backend,
      initialGame: boot.savedGame,
      warning: titleMessage ?? undefined,
    });
  }

  if (boot.status === "prologue") {
    return (
      <GameSession
        interfaceSettings={settings}
        guided
        initialGame={boot.initialGame}
        initialPersistence={boot.backend}
        onExit={(savedGame, backend) => {
          setBoot({
            status: "title",
            backend,
            savedGame,
          });
          setTitleMessage(
            backend.kind === "unavailable" ? backend.message : null,
          );
        }}
        onTutorialComplete={(game, backend) => {
          setBoot({
            status: "playing",
            backend,
            initialGame: game,
          });
          setTitleMessage(null);
        }}
        updateInterfaceSetting={updateSetting}
      />
    );
  }

  if (boot.status !== "playing") {
    const savedGame = boot.status === "title" ? boot.savedGame : null;
    const ready = boot.status === "title";
    return (
      <PlayScreen
        busy={!ready}
        interfaceSettings={settings}
        message={titleMessage}
        onContinue={continueGame}
        onNewGame={() => void beginNewGame()}
        savedGame={savedGame}
        updateInterfaceSetting={updateSetting}
      >
        {confirmNewGame ? (
          <ConfirmNewGameDialog
            onCancel={() => setConfirmNewGame(false)}
            onConfirm={() => void beginNewGame(true)}
          />
        ) : null}
      </PlayScreen>
    );
  }

  return (
    <GameSession
      interfaceSettings={settings}
      initialGame={boot.initialGame}
      initialPersistence={boot.backend}
      initialWarning={boot.warning}
      onExit={(savedGame, backend) => {
        setBoot({ status: "title", backend, savedGame });
        setTitleMessage(
          backend.kind === "unavailable" ? backend.message : null,
        );
      }}
      updateInterfaceSetting={updateSetting}
    />
  );
}

function LotusSymbol({ tone = "calm" }: { tone?: "calm" | "info" | "caution" | "critical" }) {
  return (
    <svg
      aria-hidden="true"
      className={`lotus-symbol ${tone}`}
      focusable="false"
      viewBox="0 0 100 100"
    >
      <circle className="lotus-orbit" cx="50" cy="50" r="43" />
      <g className="lotus-petals">
        {Array.from({ length: 6 }, (_, index) => (
          <path
            d="M50 51 C38 39 39 22 50 9 C61 22 62 39 50 51 Z"
            key={index}
            transform={`rotate(${index * 60} 50 50)`}
          />
        ))}
      </g>
      <circle className="lotus-core-glow" cx="50" cy="50" r="14" />
      <circle className="lotus-core" cx="50" cy="50" r="5" />
    </svg>
  );
}

type GuidedStep =
  | "day1-community"
  | "day1-community-read"
  | "day1-advance"
  | "day8-advance"
  | "day15-themes"
  | "day15-theme"
  | "day15-part"
  | "day15-finance"
  | "day15-finance-read"
  | "day15-operations"
  | "day15-tv-cm"
  | "day15-advance"
  | "day22-advance"
  | "day29-advance"
  | "day30-release"
  | "day30-advance"
  | "day31-community-read"
  | "day31-advance"
  | "day38-advance"
  | "day45-restriction"
  | "day45-advance"
  | "day46-community"
  | "day46-community-read"
  | "day46-distribution"
  | "day46-distribution-read"
  | "day46-start";

type GuidedReleaseTarget =
  | { kind: "option"; optionId: string; adjustment: PowerAdjustment }
  | { kind: "adjustment"; optionId: string; adjustment: PowerAdjustment }
  | { kind: "submit" };

type GuidedRestrictionTarget =
  | { kind: "limit"; partId: string; limit: RestrictionLimit }
  | { kind: "submit" };

type GuidedDossierTarget = { themeId: ThemeId; partId: string };

function getGuidedRestrictionTarget(): GuidedRestrictionTarget | null {
  // The first restriction review is intentionally unguided. Keep the nullable
  // target shape for the shared restriction workspace without letting a
  // constant `null` narrow its TypeScript branches to `never`.
  return null;
}

function getGuidedDossierTarget(game: GameState): GuidedDossierTarget {
  const themeId: ThemeId = "cycle";
  const partId = game.themes[themeId]?.releasedPartIds[0];
  if (!partId) throw new Error("The guided dossier theme needs a released part.");
  return { themeId, partId };
}

function getGuidedRestrictionThemeId(game: GameState): ThemeId {
  if (game.activeThemeIds.includes(game.currentTopThemeId)) {
    return game.currentTopThemeId;
  }
  return [...game.activeThemeIds].sort(
    (left, right) => game.themes[right].share - game.themes[left].share,
  )[0] ?? "cycle";
}

type GuidedBrief = {
  kicker: string;
  title: string;
  message: string;
  placement?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  inspection?: boolean;
  freeInteraction?: boolean;
  confirmLabel?: string;
  actionLabel?: string;
};

function getGuidedStep(game: GameState): GuidedStep {
  if (game.day >= 46) return "day46-community";
  if (game.day <= 1) return "day1-community";
  if (game.day <= 8) return "day8-advance";
  if (game.day <= 15) {
    const guidedTvCmComplete = game.operations.records.some(
      (record) => record.type === "tv-cm" && record.startedDay === 15,
    );
    return guidedTvCmComplete ? "day15-advance" : "day15-themes";
  }
  if (game.day <= 22) return "day22-advance";
  if (game.day <= 29) return "day29-advance";
  if (game.day === 30) {
    return game.phase === "release-edit" ? "day30-release" : "day30-advance";
  }
  if (game.day <= 31) return "day31-community-read";
  if (game.day < 45) return "day38-advance";
  return game.phase === "ban-edit"
    ? "day45-restriction"
    : "day45-advance";
}

function getGuidedInitialTab(game: GameState): TabId {
  if (game.day >= 46) return "restrictions";
  if (game.phase === "release-edit") return "releases";
  if (game.phase === "ban-edit" || game.day === 45) return "restrictions";
  if (game.day === 1) return "distribution";
  if (game.day === 15) {
    return game.operations.records.some(
      (record) => record.type === "tv-cm" && record.startedDay === 15,
    )
      ? "operations"
      : "distribution";
  }
  if (game.day === 22 || game.day === 29) return "finance";
  return "community";
}

function withKoreanObjectParticle(value: string) {
  const lastCodePoint = value.codePointAt(value.length - 1) ?? 0;
  const hasFinalConsonant =
    lastCodePoint >= 0xac00 &&
    lastCodePoint <= 0xd7a3 &&
    (lastCodePoint - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? "을" : "를"}`;
}

function getGuidedBrief(
  step: GuidedStep,
  game: GameState,
  releaseTarget: GuidedReleaseTarget | null,
  restrictionPolicy: RestrictionPolicyProfile,
): GuidedBrief {
  if (step === "day1-community") {
    return {
      kicker: "LOTUS · META BASELINE",
      title: "분포를 확인했습니다",
      message: "첫 환경은 5개 테마와 활성 유저 10,000명으로 고정되어 있습니다. 이제 상단의 ‘커뮤니티’를 선택해주세요.",
      placement: "bottom-right",
    };
  }
  if (step === "day1-community-read") {
    return {
      kicker: "LOTUS · PUBLIC SENTIMENT",
      title: "오늘의 커뮤니티 글을 읽어보세요",
      message: "밝게 열린 글 목록을 직접 스크롤해 확인해주세요. 커뮤니티는 모든 사람이 글을 쓰는 곳이므로, 의견은 판정이 아니라 하나의 신호입니다.",
      placement: "bottom-left",
      inspection: true,
      confirmLabel: "확인 · 다음",
    };
  }
  if (step === "day1-advance") {
    return {
      kicker: "LOTUS · PUBLIC SENTIMENT",
      title: "커뮤니티 확인을 마쳤습니다",
      message: "첫 일주일의 변화를 보기 위해 강조된 진행 버튼을 선택해주세요.",
    };
  }
  if (step === "day8-advance") {
    return {
      kicker: "LOTUS · COUNTER RESEARCH",
      title: "환경은 발매 없이도 움직입니다",
      message: "카운터 연구와 유행이 점유율을 바꿉니다. DAY 15까지 진행해주세요.",
    };
  }
  if (step === "day15-themes") {
    return {
      kicker: "LOTUS · THEME DOSSIER",
      title: "이번에는 테마를 열어보겠습니다",
      message: "상단의 ‘테마’를 선택해주세요. 테마 안에서 개별 파츠의 채용률과 역할을 확인할 수 있습니다.",
      placement: "bottom-right",
    };
  }
  if (step === "day15-part") {
    const target = getGuidedDossierTarget(game);
    const theme = THEME_BY_ID[target.themeId];
    const part = theme.parts.find((candidate) => candidate.id === target.partId);
    return {
      kicker: "LOTUS · CORE PARTS",
      title: "핵심 파츠를 선택해주세요",
      message: `‘${part?.name ?? "핵심 파츠"}’을 선택하면 파츠별 채용률·평균 매수·현행 제한을 함께 볼 수 있습니다.`,
      placement: "top-right",
    };
  }
  if (step === "day15-theme") {
    const target = getGuidedDossierTarget(game);
    return {
      kicker: "LOTUS · THEME DOSSIER",
      title: `${THEME_BY_ID[target.themeId].shortName} 테마를 선택해주세요`,
      message: "테마를 열면 점유율·승률·불쾌도와 핵심 파츠 구성을 한 화면에서 확인할 수 있습니다.",
      placement: "top-right",
    };
  }
  if (step === "day15-finance") {
    return {
      kicker: "LOTUS · FINANCE",
      title: "이제 재무를 선택해주세요",
      message: "커뮤니티의 큰 목소리가 실제 구매로 이어졌는지는 매출 흐름에서 따로 확인해야 합니다.",
      placement: "bottom-right",
    };
  }
  if (step === "day15-finance-read") {
    return {
      kicker: "LOTUS · DAILY MARKET",
      title: "매출과 유저 흐름을 확인해주세요",
      message: "밝게 열린 차트에서 커뮤니티의 큰 목소리가 실제 구매와 잔류로 이어졌는지 확인한 뒤 다음 안내로 넘어갑니다.",
      placement: "bottom-left",
      inspection: true,
      confirmLabel: "확인 · 다음",
    };
  }
  if (step === "day15-operations") {
    return {
      kicker: "LOTUS · BUSINESS OPERATIONS",
      title: "이제 사업 운영을 선택해주세요",
      message: "운영자금은 쌓아두는 점수가 아니라 유입과 신뢰를 만드는 수단입니다. 밝게 표시된 ‘사업 운영’을 여세요.",
      placement: "bottom-right",
    };
  }
  if (step === "day15-tv-cm") {
    return {
      kicker: "LOTUS · FIRST CAMPAIGN",
      title: "TV CM 집중 편성을 집행해주세요",
      message: "사업 액션은 하루에 한 번만 집행할 수 있습니다. 비용·기간·쿨다운을 확인하고 강조된 버튼을 선택해주세요.",
      placement: "top-right",
    };
  }
  if (step === "day15-advance") {
    return {
      kicker: "LOTUS · CAMPAIGN ACTIVE",
      title: "첫 사업 액션을 집행했습니다",
      message: "TV CM 효과는 다음 날부터 반영됩니다. DAY 22까지 진행해 유입과 운영 현금의 변화를 확인하겠습니다.",
    };
  }
  if (step === "day22-advance") {
    return {
      kicker: "LOTUS · TREND CHECK",
      title: "광고 효과와 자연 변동을 함께 확인했습니다",
      message: "한 번의 급등만으로 판단하지 않습니다. 첫 발매 직전인 DAY 29까지 진행해주세요.",
    };
  }
  if (step === "day29-advance") {
    return {
      kicker: "LOTUS · RELEASE EVE",
      title: "첫 정기 발매가 하루 남았습니다",
      message: "강조된 +1일 버튼으로 DAY 30 발매 검토를 여세요.",
    };
  }
  if (step === "day30-release" && releaseTarget) {
    if (releaseTarget.kind === "submit") {
      return {
        kicker: "LOTUS · RELEASE REVIEW",
        title: "지정된 3개 시안이 준비됐습니다",
        message: "선택과 파워 조정값을 확인한 뒤 ‘3종 발매 확정’을 선택해주세요.",
        placement: "top-left",
      };
    }
    const option = game.releaseSlate?.options.find(
      (candidate) => candidate.id === releaseTarget.optionId,
    );
    const name = option ? THEME_BY_ID[option.themeId].name : "강조된 시안";
    const optionIndex = option
      ? (game.releaseSlate?.options.indexOf(option) ?? 0)
      : 0;
    const optionPlacement: GuidedBrief["placement"] = optionIndex >= 3
      ? optionIndex % 3 === 2
        ? "top-left"
        : "top-right"
      : optionIndex % 3 === 2
        ? "bottom-left"
        : "bottom-right";
    if (releaseTarget.kind === "option") {
      return {
        kicker: "LOTUS · RELEASE REVIEW",
        title: `${name} 시안을 선택해주세요`,
        message: "프롤로그에서는 고정된 발매 결정을 함께 실행합니다. 밝게 표시된 시안만 선택할 수 있습니다.",
        placement: optionPlacement,
      };
    }
    return {
      kicker: "LOTUS · POWER CONTROL",
      title: `${name} 파워를 ${releaseTarget.adjustment > 0 ? "+" : ""}${releaseTarget.adjustment}로 조정해주세요`,
      message: "예상 티어는 추정치입니다. 강조된 조정값을 선택해주세요.",
      placement: optionPlacement,
    };
  }
  if (step === "day30-advance") {
    return {
      kicker: "LOTUS · RELEASE ANNOUNCED",
      title: "발매 당일에는 결과를 단정하지 않습니다",
      message: "메타와 커뮤니티 반응은 다음 날부터 시작됩니다. DAY 31로 +1일 진행해주세요.",
    };
  }
  if (step === "day31-community-read") {
    return {
      kicker: "LOTUS · DAY-AFTER REACTION",
      title: "발매 다음 날의 글을 읽어보세요",
      message: "발매 반응이 집중된 20개 글을 직접 확인해주세요. 체감과 실제 수치를 구분해서 읽어야 합니다.",
      placement: "bottom-left",
      inspection: true,
      confirmLabel: "확인 · 다음",
    };
  }
  if (step === "day31-advance") {
    return {
      kicker: "LOTUS · DAY-AFTER REACTION",
      title: "발매 반응을 확인했습니다",
      message: "초기 반응이 얼마나 남는지 보기 위해 DAY 38까지 진행합니다.",
    };
  }
  if (step === "day38-advance") {
    return {
      kicker: "LOTUS · REACTION DECAY",
      title: "초기 폭발 이후의 환경을 확인했습니다",
      message: "아래 버튼으로 DAY 45까지 진행해 첫 금제위원회를 여세요.",
      actionLabel: "DAY 45 금제위원회 열기",
    };
  }
  if (step === "day45-restriction") {
    return {
      kicker: "LOTUS · FIRST MANDATE",
      title: "첫 금제는 책임자님의 결정입니다",
      message: restrictionPolicy.changeCount > 0
        ? `현재 실효 조정 ${restrictionPolicy.meaningfulCutCount}종 · 영향 테마 ${restrictionPolicy.affectedThemeCount}개 · 추정 충격 ${Math.round(restrictionPolicy.totalImpact)}입니다. 점유율·승률·불쾌도와 파츠 의존도를 비교해 자유롭게 수정하거나 그대로 제출하세요.`
        : "정해진 정답은 없습니다. 점유율·승률·불쾌도와 파츠 의존도를 비교해 자유롭게 제한을 정하거나, 현 환경 유지안을 제출하세요.",
      placement: "bottom-left",
      freeInteraction: true,
    };
  }
  if (step === "day46-community") {
    return {
      kicker: "LOTUS · POST-RESTRICTION",
      title: "금제 다음 날의 커뮤니티를 확인해주세요",
      message: "금제 당일이 아니라 DAY 46부터 반응과 이탈이 나타납니다. 밝게 표시된 ‘커뮤니티’를 선택해주세요.",
      placement: "bottom-right",
    };
  }
  if (step === "day46-community-read") {
    return {
      kicker: "LOTUS · POST-RESTRICTION",
      title: "금제 다음 날의 글을 읽어보세요",
      message: "밝게 열린 20개 글에서 금제 반응과 이탈 신호를 확인해주세요. 확인 후 실제 메타 분포와 대조합니다.",
      placement: "bottom-left",
      inspection: true,
      confirmLabel: "확인 · 분포 대조",
    };
  }
  if (step === "day46-distribution") {
    return {
      kicker: "LOTUS · FINAL META CHECK",
      title: "반응과 실제 분포를 대조해주세요",
      message: "커뮤니티의 목소리가 곧 대회 성과는 아닙니다. ‘분포’에서 최근 입상 점유율과 활성 유저를 마지막으로 확인합니다.",
      placement: "bottom-right",
    };
  }
  if (step === "day46-distribution-read") {
    return {
      kicker: "LOTUS · FINAL META CHECK",
      title: "최종 메타표를 확인해주세요",
      message: "밝게 열린 분포에서 최근 30일 입상 분포, 활성 유저, 순환 신호를 확인해주세요. 이 환경을 정상화한 상태로 인계합니다.",
      placement: "bottom-left",
      inspection: true,
      confirmLabel: "확인 · 인수 완료",
    };
  }
  if (step === "day46-start") {
    return {
      kicker: game.handoverComplete
        ? "LOTUS · SAVE RETRY"
        : "LOTUS · HANDOVER COMPLETE",
      title: game.handoverComplete
        ? "업무 시작 상태를 다시 저장해주세요"
        : "이제 직접 운영을 시작합니다",
      message: game.handoverComplete
        ? "진행은 완료됐습니다. 강조된 버튼으로 저장을 다시 시도해주세요."
        : `업무 시작 뒤 DAY ${LAST_DECISION_DAY}까지 직접 운영합니다. DAY 47부터 기본 운영비와 활성 유저 규모 비용이 매일 정산됩니다. 정기 발매는 30일, 금제위원회는 DAY ${FIRST_BAN_DAY} 이후 60일 주기이며, 마지막 결정 뒤 ${SETTLEMENT_DAYS}일은 자동 결산 관찰 기간입니다.`,
    };
  }
  return {
    kicker: "LOTUS · HANDOVER",
    title: "결과 관측은 다음 날 시작됩니다",
    message: "강조된 +1일 버튼으로 DAY 46에 진입한 뒤 금제 반응과 최종 분포를 확인합니다.",
  };
}

function GuidedTutorialOverlay({
  brief,
  busy,
  day,
  onActivate,
  onConfirm,
  onPause,
  targetKey,
  onSkip,
}: {
  brief: GuidedBrief;
  busy: boolean;
  day: number;
  onActivate?: () => void;
  onConfirm: () => void;
  onPause: () => void;
  targetKey: string;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const skipTriggerRef = useRef<HTMLButtonElement>(null);
  const skipCancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!skipConfirmOpen) return;
    const previouslyFocused = document.activeElement;
    const frame = window.requestAnimationFrame(() => {
      skipCancelRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [skipConfirmOpen]);

  useEffect(() => {
    let frame = 0;
    let targetAttempts = 0;
    let target: HTMLElement | null = null;
    const measure = () => {
      if (!target) {
        setRect(null);
        return;
      }
      const bounds = target.getBoundingClientRect();
      const padding = 7;
      const left = Math.max(0, bounds.left - padding);
      const top = Math.max(0, bounds.top - padding);
      const rightEdge = Math.min(window.innerWidth, bounds.right + padding);
      const bottomEdge = Math.min(window.innerHeight, bounds.bottom + padding);
      setRect({
        top,
        left,
        width: Math.max(0, rightEdge - left),
        height: Math.max(0, bottomEdge - top),
      });
    };
    const resizeObserver = new ResizeObserver(measure);
    const connectTarget = () => {
      if (brief.freeInteraction) {
        setRect(null);
        return;
      }
      target = document.querySelector<HTMLElement>(
        '[data-tutorial-target="active"]',
      );
      if (!target) {
        setRect(null);
        targetAttempts += 1;
        if (targetAttempts < 12) {
          frame = window.requestAnimationFrame(connectTarget);
        }
        return;
      }
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      target.setAttribute("aria-describedby", "guided-tutorial-message");
      target.focus({ preventScroll: true });
      resizeObserver.observe(target);
      measure();
    };
    frame = window.requestAnimationFrame(connectTarget);
    const handleViewportChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const trapFocus = (event: KeyboardEvent) => {
      const skipDialog = document.querySelector<HTMLElement>(
        ".guided-skip-dialog",
      );
      if (skipDialog && event.key === "Escape") {
        event.preventDefault();
        setSkipConfirmOpen(false);
        return;
      }
      if (brief.freeInteraction && !skipDialog) return;
      if (event.key !== "Tab") return;
      const dialogButtons = skipDialog
        ? Array.from(
            skipDialog.querySelectorAll<HTMLElement>("button:not(:disabled)"),
          )
        : [];
      const coachButtons = skipDialog
        ? []
        : Array.from(
            document.querySelectorAll<HTMLElement>(
              ".guided-coach button:not(:disabled)",
            ),
          );
      const focusables = skipDialog
        ? dialogButtons
        : [target, ...coachButtons].filter(
            (candidate): candidate is HTMLElement => Boolean(candidate),
          );
      if (focusables.length === 0) return;
      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[nextIndex].focus({ preventScroll: true });
    };
    const guardPointerInput = (event: Event) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;
      const skipDialog = document.querySelector<HTMLElement>(
        ".guided-skip-dialog",
      );
      if (skipDialog) {
        if (skipDialog.contains(eventTarget)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (brief.freeInteraction) return;
      const activeTarget = document.querySelector<HTMLElement>(
        '[data-tutorial-target="active"]',
      );
      if (
        activeTarget?.contains(eventTarget) ||
        eventTarget.closest(".guided-coach button") ||
        eventTarget.closest(".guided-spotlight-ring")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("keydown", trapFocus);
    document.addEventListener("pointerdown", guardPointerInput, true);
    document.addEventListener("click", guardPointerInput, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("keydown", trapFocus);
      document.removeEventListener("pointerdown", guardPointerInput, true);
      document.removeEventListener("click", guardPointerInput, true);
      resizeObserver.disconnect();
      target?.removeAttribute("aria-describedby");
    };
  }, [brief.freeInteraction, targetKey]);

  return (
    <div
      className={`guided-tour-layer${brief.inspection ? " is-inspection" : ""}${
        brief.freeInteraction ? " is-free-interaction" : ""
      }${
        skipConfirmOpen ? " is-skip-confirming" : ""
      }`}
    >
      {brief.freeInteraction ? null : rect ? (
        <>
          <div
            aria-hidden="true"
            className="guided-spotlight-cutout"
            style={{
              height: rect.height,
              left: rect.left,
              top: rect.top,
              width: rect.width,
            }}
          />
          {!brief.inspection && !skipConfirmOpen ? (
            <button
              aria-label={`안내 대상 실행: ${brief.title}`}
              className="guided-spotlight-ring"
              onClick={() => {
                if (onActivate) {
                  onActivate();
                  return;
                }
                const target = document.querySelector<HTMLElement>(
                  '[data-tutorial-target="active"]',
                );
                target?.focus({ preventScroll: true });
                target?.click();
              }}
              style={{ height: rect.height, left: rect.left, top: rect.top, width: rect.width }}
              tabIndex={-1}
              type="button"
            />
          ) : null}
        </>
      ) : (
        <div aria-hidden="true" className="guided-shade guided-shade-full" />
      )}
      <aside
        aria-live="polite"
        className={`guided-coach ${brief.placement ?? "bottom-left"}`}
        id="guided-tutorial-message"
      >
        <LotusSymbol tone="info" />
        <div className="guided-coach-copy">
          <span>{brief.kicker}</span>
          <strong>{brief.title}</strong>
          <p>{brief.message}</p>
        </div>
        <div className="guided-coach-footer">
          <span>DAY {day} / 46 · 인수인계</span>
          <div>
            {brief.actionLabel && onActivate ? (
              <button
                className="guided-coach-confirm"
                disabled={busy}
                onClick={onActivate}
                type="button"
              >
                {brief.actionLabel}
              </button>
            ) : null}
            {brief.inspection && brief.confirmLabel ? (
              <button
                className="guided-coach-confirm"
                disabled={busy}
                onClick={onConfirm}
                type="button"
              >
                {brief.confirmLabel}
              </button>
            ) : null}
            <button
              className="guided-coach-pause"
              disabled={busy}
              onClick={onPause}
              type="button"
            >
              PLAY 화면
            </button>
            {day < FIRST_BAN_DAY ? (
              <button
                className="guided-coach-skip"
                disabled={busy}
                onClick={() => setSkipConfirmOpen(true)}
                ref={skipTriggerRef}
                type="button"
              >
                {busy ? "저장 중" : "건너뛰기"}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
      {skipConfirmOpen ? (
        <>
          <div aria-hidden="true" className="guided-skip-dialog-backdrop" />
          <section
            aria-describedby="guided-skip-description"
            aria-labelledby="guided-skip-title"
            aria-modal="true"
            className="guided-skip-dialog"
            role="alertdialog"
          >
            <LotusSymbol tone="caution" />
            <div className="guided-skip-dialog-copy">
              <span>LOTUS · HANDOVER OVERRIDE</span>
              <strong id="guided-skip-title">프롤로그를 건너뛸까요?</strong>
              <p id="guided-skip-description">
                고정된 학습 구간만 생략하고 DAY 45 첫 금제위원회에서 직접 결정을 시작합니다.
              </p>
            </div>
            <div className="guided-skip-dialog-note">
              첫 금제안은 자동 적용되지 않습니다. 제출 뒤 새 임기 시드가 배정됩니다.
            </div>
            <div className="guided-skip-dialog-actions">
              <button
                className="guided-skip-dialog-cancel"
                disabled={busy}
                onClick={() => setSkipConfirmOpen(false)}
                ref={skipCancelRef}
                type="button"
              >
                계속 안내받기
              </button>
              <button
                className="guided-skip-dialog-confirm"
                disabled={busy}
                onClick={() => {
                  setSkipConfirmOpen(false);
                  onSkip();
                }}
                type="button"
              >
                {busy ? "DAY 45 준비 중" : "첫 금제부터 시작"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function GuidedMandateBar({
  brief,
  busy,
  day,
  onPause,
}: {
  brief: GuidedBrief;
  busy: boolean;
  day: number;
  onPause: () => void;
}) {
  return (
    <aside aria-live="polite" className="guided-mandate-bar">
      <LotusSymbol tone="info" />
      <div className="guided-mandate-copy">
        <span>{brief.kicker}</span>
        <strong>{brief.title}</strong>
        <p>{brief.message}</p>
      </div>
      <div className="guided-mandate-actions">
        <span>DAY {day} / 46 · 자유 검토</span>
        <button disabled={busy} onClick={onPause} type="button">
          PLAY 화면
        </button>
      </div>
    </aside>
  );
}

function GameSession({
  interfaceSettings,
  initialGame,
  initialPersistence,
  initialWarning,
  guided = false,
  onExit,
  onTutorialComplete,
  updateInterfaceSetting,
}: {
  interfaceSettings: InterfaceSettings;
  initialGame: GameState;
  initialPersistence: PersistenceBackend;
  initialWarning?: string;
  guided?: boolean;
  onExit: (game: GameState, backend: PersistenceBackend) => void;
  onTutorialComplete?: (
    game: GameState,
    backend: PersistenceBackend,
  ) => void;
  updateInterfaceSetting: <Key extends keyof InterfaceSettings>(
    key: Key,
    value: InterfaceSettings[Key],
  ) => void;
}) {
  const [game, setGame] = useState<GameState>(initialGame);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>(() =>
    guided && initialGame.phase === "ban-edit"
      ? getGuidedRestrictionThemeId(initialGame)
      : "cycle",
  );
  const initialTab: TabId = guided
    ? getGuidedInitialTab(initialGame)
    : initialGame.operations.pendingEvent
      ? "operations"
    : initialGame.phase === "ban-edit"
      ? "restrictions"
      : initialGame.phase === "release-edit"
        ? "releases"
        : "distribution";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [guidedStep, setGuidedStep] = useState<GuidedStep>(() =>
    getGuidedStep(initialGame),
  );
  const [guidedBusy, setGuidedBusy] = useState(false);
  const [banDraft, setBanDraft] = useState<Record<string, RestrictionLimit>>(
    initialGame.phase === "ban-edit"
      ? makeRestrictionDraft(initialGame)
      : {},
  );
  const [supportTarget, setSupportTarget] = useState<ThemeId | null>(null);
  const [supportDirection, setSupportDirection] =
    useState<SupportDirection>("consistency");
  const [releaseDraft, setReleaseDraft] = useState<
    Record<string, PowerAdjustment>
  >({});
  const [reactionFlashDay, setReactionFlashDay] = useState<number | null>(null);
  const [impactNotice, setImpactNotice] = useState<ImpactNotice | null>(null);
  const [impactFx, setImpactFx] = useState<{
    key: number;
    tone: "positive" | "negative" | "caution";
  } | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(true);
  const [advisorPulseKey, setAdvisorPulseKey] = useState(1);
  const [packOddsConfirmOpen, setPackOddsConfirmOpen] = useState(false);
  const [strategicConfirmAction, setStrategicConfirmAction] =
    useState<StrategicBusinessActionType | null>(null);
  const [toast, setToast] = useState<string | null>(initialWarning ?? null);
  const [mobileDetail, setMobileDetail] = useState(
    guided && initialGame.phase === "ban-edit",
  );
  const [highlightedPartId, setHighlightedPartId] = useState<string | null>(null);
  const [persistence, setPersistence] =
    useState<PersistenceBackend>(initialPersistence);
  const dialogRef = useRef<HTMLDivElement>(null);
  const packOddsDialogRef = useRef<HTMLDivElement>(null);
  const packOddsCancelRef = useRef<HTMLButtonElement>(null);
  const businessEventDialogRef = useRef<HTMLDivElement>(null);
  const businessEventChoiceRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveFailureReportedRef = useRef(false);
  const lastQueuedGameRef = useRef<GameState>(initialGame);
  const seenAdvisorTabsRef = useRef(new Set<TabId>([initialTab]));
  const guidedFinishingRef = useRef(false);
  const packOddsCommittedRef = useRef(false);
  const lastImpactFxDayRef = useRef<number | null>(null);

  const triggerImpactObservation = useCallback((
    day: number,
    tone: "positive" | "negative" | "caution",
  ) => {
    if (lastImpactFxDayRef.current === day) return;
    lastImpactFxDayRef.current = day;
    emitGameSound("impact");
    if (
      !interfaceSettings.impactEffectsEnabled ||
      interfaceSettings.motionPreference === "reduced"
    ) return;
    setImpactFx({ key: Date.now(), tone });
  }, [
    interfaceSettings.impactEffectsEnabled,
    interfaceSettings.motionPreference,
  ]);

  useEffect(() => {
    if (
      game === lastQueuedGameRef.current ||
      persistence.kind === "unavailable"
    ) {
      return;
    }
    lastQueuedGameRef.current = game;
    const snapshot = game;
    saveQueueRef.current = saveQueueRef.current
      .then(() => savePersistedGame(persistence, snapshot))
      .catch(() => {
        if (saveFailureReportedRef.current) return;
        saveFailureReportedRef.current = true;
        const unavailable: PersistenceBackend = {
          kind: "unavailable",
          message:
            "게임을 저장하지 못했습니다. 저장 파일을 보호하기 위해 자동 저장을 중지했습니다.",
        };
        setPersistence(unavailable);
        setToast(unavailable.message);
      });
  }, [game, persistence]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!impactNotice) return;
    const timer = window.setTimeout(() => setImpactNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [impactNotice]);

  useEffect(() => {
    if (!impactFx) return;
    const timer = window.setTimeout(() => setImpactFx(null), 820);
    return () => window.clearTimeout(timer);
  }, [impactFx]);

  useEffect(() => {
    if (!supportTarget) return;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSupportTarget(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [supportTarget]);

  useEffect(() => {
    if (!packOddsConfirmOpen && !strategicConfirmAction) return;
    const previouslyFocused = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const frame = window.requestAnimationFrame(() => {
      packOddsCancelRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPackOddsConfirmOpen(false);
        setStrategicConfirmAction(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        packOddsDialogRef.current?.querySelectorAll<HTMLElement>(
          '.pack-odds-confirm-body, button:not(:disabled)',
        ) ?? [],
      );
      if (focusables.length === 0) return;
      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + direction + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[nextIndex].focus({ preventScroll: true });
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (packOddsCommittedRef.current) {
        packOddsCommittedRef.current = false;
        window.requestAnimationFrame(() => {
          const actionHeading = document.getElementById(
            "business-actions-title",
          );
          if (actionHeading) {
            actionHeading.focus();
          } else if (previouslyFocused instanceof HTMLElement) {
            previouslyFocused.focus();
          }
        });
      } else if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [packOddsConfirmOpen, strategicConfirmAction]);

  useEffect(() => {
    if (!game.operations.pendingEvent) return;
    const previousBodyOverflow = document.body.style.overflow;
    const frame = window.requestAnimationFrame(() => {
      const firstAvailable = businessEventDialogRef.current?.querySelector<HTMLElement>(
        "button:not(:disabled)",
      );
      (firstAvailable ?? businessEventChoiceRef.current)?.focus({
        preventScroll: true,
      });
    });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        businessEventDialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (focusables.length === 0) return;
      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[nextIndex].focus({ preventScroll: true });
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keepFocusInside);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keepFocusInside);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [game.operations.pendingEvent]);

  const rankedThemes = useMemo(
    () =>
      game.activeThemeIds.map((themeId) => THEME_BY_ID[themeId]).sort(
        (a, b) => game.themes[b.id].share - game.themes[a.id].share,
      ),
    [game],
  );
  const placementEndDay = game.history.at(-1)?.day ?? game.day;
  const placementReport = useMemo(
    () => getRecentPlacementReport(game.history, game.seed, placementEndDay),
    [game, placementEndDay],
  );
  const previousPlacementReport = useMemo(
    () =>
      getRecentPlacementReport(
        game.history,
        game.seed,
        placementEndDay - 7,
      ),
    [game, placementEndDay],
  );

  const selectedTheme = THEME_BY_ID[selectedThemeId] ?? THEMES[0];
  const selectedRuntime = game.themes[selectedTheme.id];
  const selectedRank = rankedThemes.findIndex(
    (theme) => theme.id === selectedTheme.id,
  );
  const selectedPlacement =
    placementReport.themes[selectedTheme.id] ?? EMPTY_PLACEMENT_METRICS;
  const selectedTierResult = getPlacementTier(
    selectedPlacement.placementShare,
    placementEndDay,
    getThemeDebutDay(game.releaseHistory, selectedTheme.id),
  );
  const nextReleaseDay = game.phase === "release-edit"
    ? game.day
    : getNextReleaseDay(game.day);
  const nextBanDay = game.phase === "ban-edit"
    ? game.day
    : getNextBanDay(game.day);
  const releaseCountdown = Math.max(0, nextReleaseDay - game.day);
  const banCountdown = Math.max(0, nextBanDay - game.day);
  const hasFutureRelease =
    game.phase === "release-edit" || game.day < LAST_RELEASE_DAY;
  const hasFutureBan =
    game.phase === "ban-edit" || game.day < LAST_DECISION_DAY;
  const campaignEnded = game.phase === "ended";
  const decisionsComplete =
    game.phase === "running" && game.day >= LAST_DECISION_DAY;
  const settlementPeriod =
    game.phase === "running" && game.day >= SETTLEMENT_START_DAY;
  const mandateProgress =
    game.day <= FIRST_BAN_DAY
      ? (game.day / FIRST_BAN_DAY) * 100
      : ((Math.min(game.day, LAST_DECISION_DAY) - FIRST_BAN_DAY) /
          PLAYER_CONTROL_DAYS) *
        100;
  const settlementProgress =
    ((Math.min(game.day, CAMPAIGN_END_DAY) - LAST_DECISION_DAY) /
      SETTLEMENT_DAYS) *
    100;
  const displayedProgress = campaignEnded
    ? 100
    : Math.max(
        0,
        Math.min(100, settlementPeriod ? settlementProgress : mandateProgress),
      );
  const progressLabel =
    campaignEnded
      ? "임기 종료"
      : game.day <= FIRST_BAN_DAY
      ? "인수인계 진행"
      : settlementPeriod
        ? "결산 관찰"
        : "임기 진행률";
  const nearestEventDay = campaignEnded
    ? game.day
    : decisionsComplete
      ? CAMPAIGN_END_DAY
      : Math.min(
          nextReleaseDay,
          nextBanDay,
          game.operations.nextEventDay ?? Number.POSITIVE_INFINITY,
          CAMPAIGN_END_DAY,
        );
  const total = totalUsers(game);
  const gameOver = total <= 0;
  const campaignComplete = game.phase === "ended" && !gameOver;
  const previousUserTotal = [...game.history]
    .reverse()
    .find((entry) => entry.day < game.day)?.totalUsers ?? total;
  const dailyUserDelta = Math.round(total - previousUserTotal);
  const userBreakdown = `활성 유저 ${formatUsers(total)}명 · 경쟁층 ${formatUsers(game.users.tier)}명 · 캐주얼 ${formatUsers(game.users.casual)}명 · 컬렉터 ${formatUsers(game.users.collector)}명`;
  const latestCommunity = [...game.community].sort((a, b) => b.day - a.day).slice(0, 3);
  const selectedRequests = game.supportRequests.filter(
    (request) => request.themeId === selectedTheme.id,
  );
  const supportCooldown =
    game.lastSupportProposalDay === null
      ? 0
      : Math.max(0, 30 - (game.day - game.lastSupportProposalDay));

  const restrictionChanges = Object.entries(banDraft).filter(([partId, value]) => {
    const official = Object.values(game.themes).find((theme) =>
      Object.prototype.hasOwnProperty.call(theme.legalLimits, partId),
    )?.legalLimits[partId];
    return official !== undefined && official !== value;
  });
  const restrictionPolicy = getRestrictionPolicyProfile(
    game,
    Object.fromEntries(restrictionChanges) as Record<string, RestrictionLimit>,
  );
  const concentratedRestrictionRisk = hasConcentratedRestrictionRisk(
    game,
    banDraft,
  );
  const advisorBrief = getAdvisorBrief(
    game,
    impactNotice,
    activeTab,
    concentratedRestrictionRisk,
    restrictionPolicy,
  );
  const guidedDossierTarget = guided
    ? getGuidedDossierTarget(game)
    : null;
  const guidedReleasePlan = guided && game.day === 30 && game.phase === "release-edit"
    ? getPrologueReleaseSelections(game)
    : [];
  let guidedReleaseTarget: GuidedReleaseTarget | null = null;
  if (guided && guidedStep === "day30-release") {
    const unselected = guidedReleasePlan.find(
      (selection) =>
        !Object.prototype.hasOwnProperty.call(
          releaseDraft,
          selection.optionId,
        ),
    );
    if (unselected) {
      guidedReleaseTarget = {
        kind: "option",
        optionId: unselected.optionId,
        adjustment: unselected.powerAdjustment,
      };
    } else {
      const unadjusted = guidedReleasePlan.find(
        (selection) =>
          releaseDraft[selection.optionId] !== selection.powerAdjustment,
      );
      guidedReleaseTarget = unadjusted
        ? {
            kind: "adjustment",
            optionId: unadjusted.optionId,
            adjustment: unadjusted.powerAdjustment,
          }
        : { kind: "submit" };
    }
  }
  // DAY 45 is the first real mandate: no hidden answer key or locked control.
  const guidedRestrictionTarget = getGuidedRestrictionTarget();
  const guidedBrief = guided
    ? getGuidedBrief(
        guidedStep,
        game,
        guidedReleaseTarget,
        restrictionPolicy,
      )
    : null;
  const guidedTargetKey = guidedReleaseTarget
    ? `${guidedReleaseTarget.kind}-${"optionId" in guidedReleaseTarget ? guidedReleaseTarget.optionId : "submit"}-${"adjustment" in guidedReleaseTarget ? guidedReleaseTarget.adjustment : ""}`
    : guidedRestrictionTarget
      ? `${guidedRestrictionTarget.kind}-${"partId" in guidedRestrictionTarget ? guidedRestrictionTarget.partId : "submit"}-${"limit" in guidedRestrictionTarget ? guidedRestrictionTarget.limit : ""}`
      : guidedStep;

  function dispatch(command: GameCommand) {
    const next = reduceGame(game, command);
    setGame(next);
    return next;
  }

  function activateTab(nextTab: TabId, important = false) {
    if (important || !seenAdvisorTabsRef.current.has(nextTab)) {
      seenAdvisorTabsRef.current.add(nextTab);
      setAdvisorPulseKey((current) => current + 1);
    }
    setActiveTab(nextTab);
  }

  function showImpact(next: GameState) {
    const notice = buildImpactNotice(next);
    if (notice) {
      setImpactNotice(notice);
      setAdvisorPulseKey((current) => current + 1);
      triggerImpactObservation(
        next.day,
        notice.tone === "negative"
          ? "negative"
          : notice.tone === "positive"
            ? "positive"
            : "caution",
      );
    }
  }

  function advance(days: number) {
    if (game.phase === "ended") return null;
    if (game.operations.pendingEvent) {
      setToast("도착한 돌발 경영 이벤트의 사업 방향을 먼저 선택해야 합니다.");
      activateTab("operations", true);
      return null;
    }
    if (game.phase !== "running") {
      setToast(
        game.phase === "release-edit"
          ? "발매 시안 3개를 선택해야 날짜를 진행할 수 있습니다."
          : "금제안을 제출해야 날짜를 진행할 수 있습니다.",
      );
      return null;
    }
    const next = dispatch({ type: "ADVANCE_DAYS", days });
    const businessToast = getBusinessTransitionToast(game, next);
    const eventResultToast = getBusinessEventTransitionToast(game, next);
    const eventArrived =
      !game.operations.pendingEvent && next.operations.pendingEvent;
    showImpact(next);
    if (reactionFlashDay === next.day) {
      triggerImpactObservation(next.day, "caution");
    }
    if (eventResultToast) {
      triggerImpactObservation(next.day, "caution");
    }
    if (eventArrived) {
      const definition = BUSINESS_EVENT_BY_TYPE[eventArrived.type];
      setToast(
        [
          `DAY ${next.day} 돌발 경영 이벤트: ${definition.title}`,
          eventResultToast,
          businessToast,
        ]
          .filter(Boolean)
          .join(" "),
      );
      activateTab("operations", true);
    } else if (next.phase === "ban-edit") {
      setBanDraft(makeRestrictionDraft(next));
      setToast(
        [
          `DAY ${next.day} 금제위원회가 열렸습니다.`,
          eventResultToast,
          businessToast,
        ]
          .filter(Boolean)
          .join(" "),
      );
      activateTab("restrictions", true);
    } else if (next.phase === "release-edit") {
      setReleaseDraft({});
      setToast(
        [
          `DAY ${next.day} 발매 시안 6개가 도착했습니다.`,
          eventResultToast,
          businessToast,
        ]
          .filter(Boolean)
          .join(" "),
      );
      activateTab("releases", true);
    } else {
      setToast(
        [
          `DAY ${next.day}까지 진행했습니다.`,
          eventResultToast,
          businessToast,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    return next;
  }

  function advanceToNextEvent() {
    advance(Math.max(1, nearestEventDay - game.day));
  }

  function chooseBusinessEvent(choice: BusinessEventChoice) {
    const pending = game.operations.pendingEvent;
    if (!pending) return;
    const definition = BUSINESS_EVENT_BY_TYPE[pending.type];
    const selected = definition.choices.find(
      (candidate) => candidate.id === choice,
    );
    if (!selected) return;
    if (game.finance.cash + 1e-9 < selected.cost) {
      setToast("이 선택을 실행할 운영자금이 부족합니다.");
      return;
    }
    const next = dispatch({
      type: "CHOOSE_BUSINESS_EVENT",
      eventId: pending.id,
      choice,
    });
    const record = next.operations.eventRecords.at(-1);
    setToast(
      `${selected.title} 방향을 선택했습니다. 결과는 DAY ${record?.resolutionDay ?? next.day + selected.resolutionDelay}에 발표됩니다.`,
    );
    activateTab("operations", true);
  }

  function selectTheme(themeId: ThemeId, partId?: string) {
    setSelectedThemeId(themeId);
    activateTab(
      partId || activeTab === "restrictions" ? "restrictions" : "themes",
    );
    setMobileDetail(true);
    setHighlightedPartId(partId ?? null);
    window.setTimeout(() => detailHeadingRef.current?.focus(), 0);
    if (partId) window.setTimeout(() => setHighlightedPartId(null), 2200);
  }

  function openSupport(themeId: ThemeId) {
    const committedSupportCount = getCommittedSupportCount(game, themeId);
    if (committedSupportCount >= 3) {
      setToast(
        game.themes[themeId]?.supportCount >= 3
          ? "이 테마는 세 차례 지원을 모두 받아 추가 지원을 제안할 수 없습니다."
          : "세 번째 지원이 이미 확정되어 적용을 기다리고 있습니다.",
      );
      return;
    }
    if (supportCooldown > 0) {
      setToast(`지원 제안은 ${supportCooldown}일 뒤 다시 보낼 수 있습니다.`);
      return;
    }
    if (!canProposeSupport(game, themeId)) {
      setToast("현재 일정에서는 이 테마의 지원을 제안할 수 없습니다.");
      return;
    }
    setSupportTarget(themeId);
    setSupportDirection("consistency");
  }

  function submitSupport() {
    if (!supportTarget) return;
    if (!canProposeSupport(game, supportTarget)) {
      const committedSupportCount = getCommittedSupportCount(game, supportTarget);
      setToast(
        committedSupportCount >= 3
          ? "세 번째 지원이 이미 확정되어 추가 제안을 등록할 수 없습니다."
          : supportCooldown > 0
            ? `지원 제안은 ${supportCooldown}일 뒤 다시 보낼 수 있습니다.`
            : "현재 일정에서는 지원 제안을 등록할 수 없습니다.",
      );
      setSupportTarget(null);
      return;
    }
    const next = dispatch({
      type: "PROPOSE_SUPPORT",
      themeId: supportTarget,
      direction: supportDirection,
    });
    const newest = next.supportRequests.at(-1);
    setToast(
      newest
        ? `${THEME_BY_ID[supportTarget].shortName} 지원이 DAY ${newest.eligibleReleaseDay} 시안에 보장됐습니다.`
        : "지원 제안을 등록하지 못했습니다.",
    );
    setSupportTarget(null);
  }

  function runBusinessAction(
    action: BusinessActionType,
    confirmed = false,
  ) {
    if (
      guided &&
      (guidedStep !== "day15-tv-cm" || action !== "tv-cm")
    ) {
      return null;
    }
    const definition = BUSINESS_ACTION_BY_TYPE[action];
    const availability = getBusinessActionAvailability(game, action);
    if (!availability.available) {
      setToast(availability.reason ?? "현재 이 사업 액션을 집행할 수 없습니다.");
      return null;
    }
    if (action === "pack-odds" && !confirmed) {
      packOddsCommittedRef.current = false;
      setPackOddsConfirmOpen(true);
      return null;
    }
    if (isStrategicBusinessAction(action) && !confirmed) {
      packOddsCommittedRef.current = false;
      setStrategicConfirmAction(action);
      return null;
    }

    const next = dispatch({ type: "RUN_BUSINESS_ACTION", action });
    const record = next.operations.records.at(-1);
    setImpactNotice(null);
    setAdvisorPulseKey((current) => current + 1);
    if (record?.outcome === "backlash") {
      setToast("챔피언십이 환경 문제를 노출해 역풍이 시작됐습니다.");
    } else if (record?.outcome === "success") {
      setToast("챔피언십이 흥행했습니다. 대회 유입 효과가 시작됩니다.");
    } else if (record?.outcome === "pending") {
      setToast("봉입률 하향 조정을 다음 정기 발매에 예약했습니다.");
    } else {
      setToast(
        `${withKoreanObjectParticle(definition.title)} 집행했습니다. ₩${formatRevenue(definition.cost)}을 사용했습니다.`,
      );
    }
    if (guided && action === "tv-cm") {
      setGuidedStep("day15-advance");
    }
    return next;
  }

  function toggleReleaseOption(optionId: string) {
    if (
      !Object.prototype.hasOwnProperty.call(releaseDraft, optionId) &&
      Object.keys(releaseDraft).length >= 3
    ) {
      setToast("발매 시안은 정확히 3개까지 선택할 수 있습니다.");
      return;
    }
    setReleaseDraft((current) => {
      if (Object.prototype.hasOwnProperty.call(current, optionId)) {
        const next = { ...current };
        delete next[optionId];
        return next;
      }
      return { ...current, [optionId]: 0 };
    });
  }

  function submitRelease() {
    const selections = Object.entries(releaseDraft).map(
      ([optionId, powerAdjustment]) => ({ optionId, powerAdjustment }),
    );
    if (selections.length !== 3) {
      setToast("6개 시안 중 정확히 3개를 선택하세요.");
      return null;
    }
    const next = dispatch({ type: "SUBMIT_RELEASE", selections });
    const businessToast = getBusinessTransitionToast(game, next);
    setImpactNotice(null);
    setReleaseDraft({});
    setReactionFlashDay(next.day + 1);
    setToast(
      [`DAY ${next.day} 정기 발매 3종을 출시했습니다.`, businessToast]
        .filter(Boolean)
        .join(" "),
    );
    return next;
  }

  function submitRestriction() {
    const changes = Object.fromEntries(restrictionChanges) as Record<
      string,
      RestrictionLimit
    >;
    const isFirstMandate =
      game.day === FIRST_BAN_DAY && !game.handoverComplete;
    const next = dispatch({
      type: "SUBMIT_BAN",
      changes,
      ...(isFirstMandate
        ? { campaignSeed: mintCampaignSeed(game.seed) }
        : {}),
    });
    setImpactNotice(null);
    setReactionFlashDay(next.day + 1);
    setToast(
      restrictionChanges.length > 0
        ? `${restrictionChanges.length}건의 금제 변경을 시행했습니다.`
        : "변경 없음으로 금제안을 제출했습니다.",
    );
    if (next.phase !== "ban-edit") setBanDraft({});
    return next;
  }

  function handleGuidedNavigation(tab: TabId) {
    if (!guided || guidedBrief?.freeInteraction) {
      activateTab(tab);
      return;
    }
    if (guidedStep === "day1-community" && tab === "community") {
      activateTab(tab, true);
      setGuidedStep("day1-community-read");
      return;
    }
    if (guidedStep === "day15-themes" && tab === "themes") {
      activateTab(tab, true);
      setGuidedStep("day15-theme");
      return;
    }
    if (guidedStep === "day15-finance" && tab === "finance") {
      activateTab(tab, true);
      setGuidedStep("day15-finance-read");
      return;
    }
    if (guidedStep === "day15-operations" && tab === "operations") {
      activateTab(tab, true);
      setGuidedStep("day15-tv-cm");
      return;
    }
    if (guidedStep === "day46-community" && tab === "community") {
      activateTab(tab, true);
      setGuidedStep("day46-community-read");
      return;
    }
    if (guidedStep === "day46-distribution" && tab === "distribution") {
      activateTab(tab, true);
      setGuidedStep("day46-distribution-read");
    }
  }

  function confirmGuidedInspection() {
    if (!guided || guidedBusy) return;
    if (guidedStep === "day1-community-read") {
      setGuidedStep("day1-advance");
    } else if (guidedStep === "day15-finance-read") {
      setGuidedStep("day15-operations");
    } else if (guidedStep === "day31-community-read") {
      setGuidedStep("day31-advance");
    } else if (guidedStep === "day46-community-read") {
      setGuidedStep("day46-distribution");
    } else if (guidedStep === "day46-distribution-read") {
      setGuidedStep("day46-start");
    }
  }

  function isGuidedNavigationTarget(tab: TabId) {
    return (
      (guidedStep === "day1-community" && tab === "community") ||
      (guidedStep === "day15-themes" && tab === "themes") ||
      (guidedStep === "day15-finance" && tab === "finance") ||
      (guidedStep === "day15-operations" && tab === "operations") ||
      (guidedStep === "day46-community" && tab === "community") ||
      (guidedStep === "day46-distribution" && tab === "distribution")
    );
  }

  async function finishGuidedTutorial(finalGame: GameState) {
    if (
      !guided ||
      !onTutorialComplete ||
      guidedBusy ||
      guidedFinishingRef.current
    ) return;
    guidedFinishingRef.current = true;
    setGuidedBusy(true);
    lastQueuedGameRef.current = finalGame;
    setGame(finalGame);
    try {
      await saveQueueRef.current;
      if (persistence.kind === "unavailable") {
        throw new Error(persistence.message);
      }
      await savePersistedGame(persistence, finalGame);
      onTutorialComplete(finalGame, persistence);
    } catch {
      setToast(
        "프롤로그 진행을 저장하지 못했습니다. 저장소 상태를 확인한 뒤 다시 시도해주세요.",
      );
      guidedFinishingRef.current = false;
      setGuidedBusy(false);
    }
  }

  async function skipGuidedTutorial() {
    if (!guided || guidedBusy || game.day >= FIRST_BAN_DAY) return;
    const firstBanGame = createFirstBanGame(initialGame.seed);
    const targetTheme = getGuidedRestrictionThemeId(firstBanGame);
    setGuidedBusy(true);
    lastQueuedGameRef.current = firstBanGame;
    setGame(firstBanGame);
    setBanDraft(makeRestrictionDraft(firstBanGame));
    setGuidedStep("day45-restriction");
    setSelectedThemeId(targetTheme);
    setMobileDetail(true);
    activateTab("restrictions", true);
    setToast("고정 학습 구간을 건너뛰었습니다. 첫 금제안은 직접 결정해주세요.");
    try {
      await saveQueueRef.current;
      if (persistence.kind === "unavailable") {
        throw new Error(persistence.message);
      }
      await savePersistedGame(persistence, firstBanGame);
    } catch {
      setToast(
        "DAY 45 상태를 저장하지 못했습니다. 현재 결정은 계속할 수 있지만 저장소 상태를 확인해주세요.",
      );
    } finally {
      setGuidedBusy(false);
    }
  }

  async function pauseGuidedTutorial() {
    if (!guided || guidedBusy || guidedFinishingRef.current) return;
    guidedFinishingRef.current = true;
    setGuidedBusy(true);
    try {
      await saveQueueRef.current;
      if (persistence.kind === "unavailable") {
        throw new Error(persistence.message);
      }
      await savePersistedGame(persistence, game);
      onExit(game, persistence);
    } catch {
      guidedFinishingRef.current = false;
      setGuidedBusy(false);
      setToast(
        "현재 인수인계 진행을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  function openGuidedRestrictionBoard(next: GameState) {
    if (next.day !== 45 || next.phase !== "ban-edit") return false;
    const targetTheme = getGuidedRestrictionThemeId(next);
    setBanDraft((current) =>
      Object.keys(current).length > 0 ? current : makeRestrictionDraft(next),
    );
    setGuidedStep("day45-restriction");
    activateTab("restrictions", true);
    setSelectedThemeId(targetTheme);
    setMobileDetail(true);
    return true;
  }

  function advanceGuidedTutorial() {
    if (!guided || guidedBusy) return;
    if (guidedStep === "day46-start") {
      const finalGame = game.handoverComplete
        ? game
        : dispatch({ type: "COMPLETE_HANDOVER" });
      void finishGuidedTutorial(finalGame);
      return;
    }
    if (
      guidedStep === "day38-advance" &&
      openGuidedRestrictionBoard(game)
    ) {
      return;
    }
    if (
      guidedStep === "day38-advance" &&
      game.day === 45 &&
      game.phase === "running"
    ) {
      setGuidedStep("day45-advance");
      activateTab("restrictions", true);
      return;
    }
    let targetDay: number | null = null;
    let nextStep: GuidedStep | null = null;
    let nextTab: TabId = activeTab;
    if (guidedStep === "day1-advance") {
      targetDay = 8;
      nextStep = "day8-advance";
      nextTab = "community";
    } else if (guidedStep === "day8-advance") {
      targetDay = 15;
      nextStep = "day15-themes";
      nextTab = "distribution";
    } else if (guidedStep === "day15-advance") {
      targetDay = 22;
      nextStep = "day22-advance";
      nextTab = "finance";
    } else if (guidedStep === "day22-advance") {
      targetDay = 29;
      nextStep = "day29-advance";
      nextTab = "finance";
    } else if (guidedStep === "day29-advance") {
      targetDay = 30;
      nextStep = "day30-release";
      nextTab = "releases";
    } else if (guidedStep === "day30-advance") {
      targetDay = 31;
      nextStep = "day31-community-read";
      nextTab = "community";
    } else if (guidedStep === "day31-advance") {
      targetDay = 38;
      nextStep = "day38-advance";
      nextTab = "community";
    } else if (guidedStep === "day38-advance") {
      targetDay = 45;
      nextStep = "day45-restriction";
      nextTab = "restrictions";
    } else if (guidedStep === "day45-advance") {
      targetDay = 46;
      nextStep = "day46-community";
      nextTab = "restrictions";
    }
    if (targetDay === null || targetDay <= game.day) return;
    const next = advance(targetDay - game.day);
    if (!next) return;
    if (targetDay === 45) {
      openGuidedRestrictionBoard(next);
      return;
    }
    if (nextStep) setGuidedStep(nextStep);
    activateTab(nextTab, true);
  }

  function submitGuidedRelease() {
    if (!guided || guidedReleaseTarget?.kind !== "submit") return;
    const next = submitRelease();
    if (next) setGuidedStep("day30-advance");
  }

  function submitGuidedRestriction() {
    if (!guided || guidedStep !== "day45-restriction") return;
    const next = submitRestriction();
    if (next) setGuidedStep("day45-advance");
  }

  function guidedAdvanceLabel() {
    if (guidedStep === "day29-advance") return "+1일 · DAY 30 발매 검토";
    if (guidedStep === "day30-advance") return "+1일 · DAY 31 반응 관측";
    if (guidedStep === "day45-advance") {
      return "+1일 · DAY 46 금제 반응";
    }
    if (guidedStep === "day46-start") return "업무 시작";
    if (guidedStep === "day1-advance") return "+7일 · DAY 8까지";
    if (guidedStep === "day8-advance") return "+7일 · DAY 15까지";
    if (guidedStep === "day15-advance") return "+7일 · DAY 22까지";
    if (guidedStep === "day22-advance") return "+7일 · DAY 29까지";
    if (guidedStep === "day31-advance") return "+7일 · DAY 38까지";
    if (guidedStep === "day38-advance") return `+${45 - game.day}일 · DAY 45 금제위원회`;
    return "안내에 따라 진행";
  }

  return (
    <div
      className={`app-shell${
        interfaceSettings.motionPreference === "reduced"
          ? " force-reduced-motion"
          : ""
      }${impactFx ? ` is-impact-observing impact-${impactFx.tone}` : ""}`}
      data-guided-step={guided ? guidedStep : undefined}
    >
      {impactFx ? (
        <div
          aria-hidden="true"
          className="impact-screen-flash"
          key={impactFx.key}
        />
      ) : null}
      <header className="topbar">
        <div className="brand-lockup">
          <BrandMark className="brand-mark" />
          <div>
            <div className="brand-name">TCG REGULATOR</div>
          </div>
        </div>

        <div className="header-metrics" aria-label="캠페인 핵심 지표">
          <div className="header-metric">
            <CalendarIcon />
            <span>DAY</span>
            <strong>{game.day}</strong>
            <small>/ {CAMPAIGN_END_DAY}</small>
          </div>
          <div
            aria-label={`${userBreakdown} · 전일 대비 ${dailyUserDelta >= 0 ? "+" : ""}${formatUsers(dailyUserDelta)}명`}
            className={`header-metric header-user-metric ${
              dailyUserDelta > 0
                ? "metric-positive"
                : dailyUserDelta < 0
                  ? "metric-negative"
                  : "metric-flat"
            }`}
            title={userBreakdown}
          >
            <UsersIcon />
            <span>활성 유저</span>
            <strong>{formatUsers(total)}명</strong>
            <small>
              {dailyUserDelta === 0
                ? "오늘 —"
                : `오늘 ${dailyUserDelta > 0 ? "+" : ""}${formatUsers(dailyUserDelta)}`}
              </small>
          </div>
          <div className="header-metric header-cash-metric">
            <RevenueIcon />
            <span>보유자금</span>
            <strong>₩{formatRevenue(game.finance.cash)}</strong>
            <small>약 {getOperatingRunwayMonths(game.finance.cash, total).toFixed(1)}개월</small>
          </div>
          <div className="header-metric">
            <ReleaseIcon />
            <span>다음 발매</span>
            <strong>
              {campaignEnded
                ? "종료"
                : settlementPeriod
                  ? "결산 중"
                  : !hasFutureRelease
                    ? "일정 종료"
                  : game.phase === "release-edit"
                    ? "선정 중"
                    : `D-${releaseCountdown}`}
            </strong>
          </div>
          <div
            className={`header-metric ${
              hasFutureBan && banCountdown <= 3 ? "metric-alert" : ""
            }`}
          >
            <GavelIcon />
            <span>금제위원회</span>
            <strong>
              {campaignEnded
                ? "종료"
                : settlementPeriod
                  ? "결산 중"
                  : !hasFutureBan
                    ? "일정 종료"
                  : game.phase === "ban-edit"
                    ? "진행 중"
                    : `D-${banCountdown}`}
              </strong>
          </div>
        </div>
        <div className="header-controls">
          <button
            aria-label={interfaceSettings.soundEnabled ? "효과음 끄기" : "효과음 켜기"}
            aria-pressed={!interfaceSettings.soundEnabled}
            className="header-mute"
            data-sound="none"
            onClick={() =>
              updateInterfaceSetting(
                "soundEnabled",
                !interfaceSettings.soundEnabled,
              )
            }
            type="button"
          >
            {interfaceSettings.soundEnabled ? "SFX" : "MUTE"}
          </button>
          <details className="header-settings">
            <summary aria-label="화면 및 효과음 설정">설정</summary>
            <SettingsOptions
              settings={interfaceSettings}
              updateSetting={updateInterfaceSetting}
            />
          </details>
        </div>
      </header>

      <nav className="primary-nav" aria-label="주요 메뉴">
        <div className="nav-scroll">
          {NAV_ITEMS.map((item) => (
            <button
              className={activeTab === item.id ? "nav-item active" : "nav-item"}
              data-tutorial-target={
                guided && isGuidedNavigationTarget(item.id)
                  ? "active"
                  : undefined
              }
              disabled={
                gameOver ||
                campaignComplete ||
                (guided &&
                  !guidedBrief?.freeInteraction &&
                  !isGuidedNavigationTarget(item.id))
              }
              key={item.id}
              onClick={() => handleGuidedNavigation(item.id)}
              type="button"
            >
              {item.label}
              {item.id === "community" ? (
                <span className="nav-count">20</span>
              ) : null}
              {item.id === "restrictions" && game.phase === "ban-edit" ? (
                <span className="nav-count nav-alert">!</span>
              ) : null}
              {item.id === "releases" && game.phase === "release-edit" ? (
                <span className="nav-count nav-alert">!</span>
              ) : null}
              {item.id === "operations" && game.operations.pendingEvent ? (
                <span className="nav-count nav-alert">!</span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          className="reset-button"
          disabled={guided && !guidedBrief?.freeInteraction}
          onClick={() => {
            if (guided) {
              void pauseGuidedTutorial();
              return;
            }
            onExit(game, persistence);
          }}
          type="button"
        >
          <span aria-hidden="true">←</span>
          PLAY 화면
        </button>
      </nav>

      <main
        className={`workspace ${
          gameOver || campaignComplete ? "game-over-workspace" : ""
        }`}
      >
        {gameOver ? (
          <GameOverPanel
            day={game.day}
            onReturnToPlay={() => onExit(game, persistence)}
            revenue={game.finance.cumulative}
          />
        ) : campaignComplete ? (
          <CampaignEndPanel
            game={game}
            onReturnToPlay={() => onExit(game, persistence)}
          />
        ) : (
          <>
        {guided && guidedBrief?.freeInteraction ? (
          <GuidedMandateBar
            brief={guidedBrief}
            busy={guidedBusy}
            day={game.day}
            onPause={() => void pauseGuidedTutorial()}
          />
        ) : (
          <aside
            aria-label="로터스 상황 브리핑"
            className={`advisor-brief ${advisorBrief.tone} ${advisorOpen ? "open" : "collapsed"}`}
            key={advisorPulseKey}
          >
            <LotusSymbol tone={advisorBrief.tone} />
            <div aria-live="polite" className="advisor-brief-copy" id="advisor-brief-message">
              <span>LOTUS · {advisorBrief.kicker}</span>
              <p>{advisorBrief.message}</p>
              {advisorBrief.submessage ? <small>{advisorBrief.submessage}</small> : null}
            </div>
            <button
              aria-controls="advisor-brief-message"
              aria-expanded={advisorOpen}
              onClick={() => setAdvisorOpen((current) => !current)}
              type="button"
            >
              {advisorOpen ? "접기" : "LOTUS"}
            </button>
          </aside>
        )}

        {activeTab === "themes" || activeTab === "restrictions" ? (
          <MetaWorkspace
            banDraft={banDraft}
            game={game}
            highlightedPartId={highlightedPartId}
            latestCommunity={latestCommunity}
            mobileDetail={mobileDetail}
            nextBanDay={nextBanDay}
            rankedThemes={rankedThemes}
            placementReport={placementReport}
            previousPlacementReport={previousPlacementReport}
            restrictionChanges={restrictionChanges}
            restrictionPolicy={restrictionPolicy}
            guidedThemeTarget={
              guided && guidedStep === "day15-theme"
                ? guidedDossierTarget?.themeId
                : null
            }
            guidedPartTarget={
              guided && guidedStep === "day15-part"
                ? guidedDossierTarget
                : null
            }
            guidedRestrictionTarget={guidedRestrictionTarget}
            selectedRequests={selectedRequests}
            selectedRank={selectedRank}
            selectedRuntime={selectedRuntime}
            selectedTheme={selectedTheme}
            selectedTier={selectedTierResult.tier}
            selectedTierProvisional={selectedTierResult.provisional}
            detailHeadingRef={detailHeadingRef}
            onBackToThemes={() => setMobileDetail(false)}
            onGuidedPartConfirm={() => setGuidedStep("day15-finance")}
            onGuidedThemeConfirm={() => setGuidedStep("day15-part")}
            onDraftChange={(partId, limit) => {
              if (
                guidedRestrictionTarget &&
                (guidedRestrictionTarget?.kind !== "limit" ||
                  guidedRestrictionTarget.partId !== partId ||
                  guidedRestrictionTarget.limit !== limit)
              ) {
                return;
              }
              const nextDraft = { ...banDraft, [partId]: limit };
              setBanDraft(nextDraft);
            }}
            onOpenSupport={openSupport}
            onResetDraft={() => setBanDraft(makeRestrictionDraft(game))}
            onSelectTheme={selectTheme}
            onSubmitRestriction={
              guided ? submitGuidedRestriction : submitRestriction
            }
            view={activeTab}
          />
        ) : null}

        {activeTab === "distribution" ? (
          <DistributionView
            game={game}
            guidedInspection={guided && guidedStep === "day46-distribution-read"}
            nextBanDay={nextBanDay}
            nextReleaseDay={nextReleaseDay}
            onSelectTheme={selectTheme}
            placementReport={placementReport}
            previousPlacementReport={previousPlacementReport}
            rankedThemes={rankedThemes}
            total={total}
          />
        ) : null}

        {activeTab === "releases" ? (
          <ReleasesView
            game={game}
            guidedTarget={guidedReleaseTarget}
            onAdjustmentChange={(optionId, adjustment) => {
              if (
                guided &&
                (guidedReleaseTarget?.kind !== "adjustment" ||
                  guidedReleaseTarget.optionId !== optionId ||
                  guidedReleaseTarget.adjustment !== adjustment)
              ) {
                return;
              }
              setReleaseDraft((current) => ({
                ...current,
                [optionId]: adjustment,
              }));
            }}
            onSubmit={guided ? submitGuidedRelease : submitRelease}
            onToggle={(optionId) => {
              if (
                guided &&
                (guidedReleaseTarget?.kind !== "option" ||
                  guidedReleaseTarget.optionId !== optionId)
              ) {
                return;
              }
              toggleReleaseOption(optionId);
            }}
            releaseDraft={releaseDraft}
          />
        ) : null}

        {activeTab === "operations" ? (
          <OperationsView
            game={game}
            guided={guided}
            guidedActionTarget={
              guided && guidedStep === "day15-tv-cm" ? "tv-cm" : null
            }
            onRunAction={runBusinessAction}
          />
        ) : null}

        {activeTab === "community" ? (
          <CommunityView
            flashDay={
              interfaceSettings.impactEffectsEnabled &&
              interfaceSettings.motionPreference !== "reduced"
                ? reactionFlashDay
                : null
            }
            game={game}
            guidedInspection={
              guided &&
              (guidedStep === "day1-community-read" ||
                guidedStep === "day31-community-read" ||
                guidedStep === "day46-community-read")
            }
            onFlashComplete={() => setReactionFlashDay(null)}
            onSelectTheme={selectTheme}
          />
        ) : null}

        {activeTab === "finance" ? (
          <FinanceView
            game={game}
            guidedInspection={guided && guidedStep === "day15-finance-read"}
          />
        ) : null}
          </>
        )}
      </main>

      <footer className="time-dock">
        <div
          className="campaign-progress"
          aria-label={`${progressLabel} ${displayedProgress.toFixed(1)}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Number(displayedProgress.toFixed(1))}
          role="progressbar"
        >
          <div className="progress-copy">
            <span>{progressLabel}</span>
            <strong>{displayedProgress.toFixed(1)}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${displayedProgress}%` }} />
          </div>
        </div>
        <div className="time-actions">
          <button
            disabled={
              guided ||
              game.phase !== "running" ||
              Boolean(game.operations.pendingEvent)
            }
            onClick={() => advance(1)}
            type="button"
          >
            +1일
          </button>
          <button
            disabled={
              guided ||
              game.phase !== "running" ||
              Boolean(game.operations.pendingEvent)
            }
            onClick={() => advance(7)}
            type="button"
          >
            +7일
          </button>
          <button
            className="primary-action"
            data-tutorial-target={
              guided &&
              (guidedStep.endsWith("advance") || guidedStep === "day46-start")
                ? "active"
                : undefined
            }
            disabled={
              game.phase !== "running" ||
              Boolean(game.operations.pendingEvent) ||
              (guided &&
                !guidedStep.endsWith("advance") &&
                guidedStep !== "day46-start") ||
              (guided && guidedBusy)
            }
            onClick={guided ? advanceGuidedTutorial : advanceToNextEvent}
            type="button"
          >
            <ClockIcon size={16} />
            {guided
              ? guidedAdvanceLabel()
              : settlementPeriod
                ? "임기 결산일까지"
                : "다음 주요 일정까지"}
          </button>
        </div>
      </footer>

      {game.operations.pendingEvent ? (
        <BusinessEventDialog
          cash={game.finance.cash}
          choiceButtonRef={businessEventChoiceRef}
          dialogRef={businessEventDialogRef}
          event={game.operations.pendingEvent}
          onChoose={chooseBusinessEvent}
        />
      ) : null}

      {supportTarget ? (
        <SupportDialog
          direction={supportDirection}
          dialogRef={dialogRef}
          game={game}
          onClose={() => setSupportTarget(null)}
          onDirectionChange={setSupportDirection}
          onSubmit={submitSupport}
          theme={THEME_BY_ID[supportTarget]}
        />
      ) : null}

      {packOddsConfirmOpen ? (
        <PackOddsConfirmFloat
          cancelButtonRef={packOddsCancelRef}
          detectionRisk={Math.round(getPackOddsDetectionRisk(game) * 100)}
          dialogRef={packOddsDialogRef}
          onCancel={() => setPackOddsConfirmOpen(false)}
          onConfirm={() => {
            const next = runBusinessAction("pack-odds", true);
            packOddsCommittedRef.current = Boolean(next);
            setPackOddsConfirmOpen(false);
          }}
        />
      ) : null}

      {strategicConfirmAction ? (
        <StrategicProjectConfirmFloat
          action={strategicConfirmAction}
          cancelButtonRef={packOddsCancelRef}
          dialogRef={packOddsDialogRef}
          game={game}
          onCancel={() => setStrategicConfirmAction(null)}
          onConfirm={() => {
            const next = runBusinessAction(strategicConfirmAction, true);
            packOddsCommittedRef.current = Boolean(next);
            setStrategicConfirmAction(null);
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" aria-live="polite" role="status">
          {toast}
        </div>
      ) : null}

      {impactNotice ? (
        <aside
          aria-live="assertive"
          className={`impact-float ${impactNotice.tone}`}
          key={impactNotice.key}
          role="status"
        >
          <span className="impact-kicker">LIVE IMPACT</span>
          <strong>{impactNotice.headline}</strong>
          <p>{impactNotice.metrics.join(" · ")}</p>
          <small>{impactNotice.cause}</small>
          <button
            aria-label="급변 알림 닫기"
            onClick={() => setImpactNotice(null)}
            type="button"
          >
            ×
          </button>
        </aside>
      ) : null}

      {guided && guidedBrief && !guidedBrief.freeInteraction ? (
        <GuidedTutorialOverlay
          brief={guidedBrief}
          busy={guidedBusy}
          day={game.day}
          key={guidedTargetKey}
          onActivate={
            guidedStep.endsWith("advance") || guidedStep === "day46-start"
              ? advanceGuidedTutorial
              : undefined
          }
          onConfirm={confirmGuidedInspection}
          onPause={() => void pauseGuidedTutorial()}
          onSkip={skipGuidedTutorial}
          targetKey={guidedTargetKey}
        />
      ) : null}
    </div>
  );
}

function BusinessEventDialog({
  cash,
  choiceButtonRef,
  dialogRef,
  event,
  onChoose,
}: {
  cash: number;
  choiceButtonRef: React.RefObject<HTMLButtonElement | null>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  event: NonNullable<GameState["operations"]["pendingEvent"]>;
  onChoose: (choice: BusinessEventChoice) => void;
}) {
  const definition = BUSINESS_EVENT_BY_TYPE[event.type];
  return (
    <div className="business-event-layer">
      <div
        aria-describedby="business-event-description"
        aria-labelledby="business-event-title"
        aria-modal="true"
        className="business-event-dialog"
        ref={dialogRef}
        role="alertdialog"
      >
        <header className="business-event-heading">
          <div aria-hidden="true" className="business-event-signal">!</div>
          <div>
            <span>{definition.kicker} · DAY {event.appearedDay}</span>
            <h2 id="business-event-title">{definition.title}</h2>
            <p id="business-event-description">{definition.situation}</p>
          </div>
        </header>

        <div className="business-event-choice-grid">
          {definition.choices.map((choice, index) => {
            const affordable = cash + 1e-9 >= choice.cost;
            return (
              <article className="business-event-choice" key={choice.id}>
                <div className="business-event-choice-title">
                  <span>OPTION {choice.id.toUpperCase()}</span>
                  <strong>{choice.title}</strong>
                  <p>{choice.summary}</p>
                </div>
                <dl className="business-event-choice-facts">
                  <div>
                    <dt>즉시 비용</dt>
                    <dd>{choice.cost > 0 ? `₩${formatRevenue(choice.cost)}` : "없음"}</dd>
                  </div>
                  <div>
                    <dt>역풍 가능성</dt>
                    <dd>{Math.round(choice.risk * 100)}%</dd>
                  </div>
                  <div>
                    <dt>결과 발표</dt>
                    <dd>DAY {event.appearedDay + choice.resolutionDelay}</dd>
                  </div>
                </dl>
                <div className="business-event-strategy-deltas" aria-label="장기 사업 노선 변화">
                  {BUSINESS_STRATEGY_AXES.map((axis) => {
                    const delta = choice.strategyDelta[axis];
                    const labels = BUSINESS_STRATEGY_AXIS_LABELS[axis];
                    return (
                      <span className={delta >= 0 ? "positive" : "negative"} key={axis}>
                        {delta === 0
                          ? "노선 유지"
                          : `${delta > 0 ? labels.positive : labels.negative} ${delta > 0 ? "+" : ""}${delta}`}
                      </span>
                    );
                  })}
                </div>
                <div className="business-event-outcomes">
                  <p><b>성공</b> {choice.results.success.headline}</p>
                  <p><b>역풍</b> {choice.results.backlash.headline}</p>
                </div>
                <button
                  className="business-event-choose"
                  data-sound="event"
                  disabled={!affordable}
                  onClick={() => onChoose(choice.id)}
                  ref={index === 0 ? choiceButtonRef : undefined}
                  type="button"
                >
                  {affordable ? `${choice.title} 선택` : "운영자금 부족"}
                </button>
              </article>
            );
          })}
        </div>
        <footer className="business-event-footnote">
          <span>선택 전에는 시간이 진행되지 않습니다.</span>
          <strong>보유 운영자금 · ₩{formatRevenue(cash)}</strong>
        </footer>
      </div>
    </div>
  );
}

function GameOverPanel({
  day,
  revenue,
  onReturnToPlay,
}: {
  day: number;
  revenue: number;
  onReturnToPlay: () => void;
}) {
  return (
    <section
      aria-labelledby="game-over-title"
      className="game-over-panel"
      role="alert"
    >
      <LotusSymbol tone="critical" />
      <span className="game-over-kicker">GAME OVER · SERVICE CLOSED</span>
      <h1 id="game-over-title">활성 유저 0명</h1>
      <strong>서비스 종료</strong>
      <p>
        임기 만료가 아닙니다. 플레이어가 모두 이탈해 TCG 서비스를 더는
        유지할 수 없습니다.
      </p>
      <dl>
        <div><dt>종료일</dt><dd>DAY {day}</dd></div>
        <div><dt>최종 활성 유저</dt><dd>0명</dd></div>
        <div><dt>누적 매출</dt><dd>₩{formatRevenue(revenue)}</dd></div>
      </dl>
      <button className="primary-action" onClick={onReturnToPlay} type="button">
        PLAY 화면 · 새 임기 선택
      </button>
    </section>
  );
}

const CAMPAIGN_CASH_LABEL: Record<CampaignCashBand, string> = {
  crisis: "자금 위기",
  tight: "긴축 운영",
  reserve: "투자 여력",
};

const CAMPAIGN_ENVIRONMENT_LABEL: Record<CampaignEnvironmentBand, string> = {
  danger: "환경 위험",
  caution: "환경 주의",
  stable: "환경 안정",
};

function CampaignEndingHints({
  ending,
}: {
  ending: CampaignEndingEvaluation;
}) {
  const hints = getCampaignEndingHints(ending);
  const complete = ending.qualifiedForBestEnding;
  return (
    <section
      aria-labelledby="campaign-ending-hints-title"
      className={`campaign-ending-hints${complete ? " is-complete" : ""}`}
    >
      <div className="campaign-ending-hints-heading">
        <div>
          <span>LOTUS · POST-MANDATE REVIEW</span>
          <strong id="campaign-ending-hints-title">
            {complete ? "지속 가능성 확인" : "다음 임기를 위한 단서"}
          </strong>
          <small>
            {complete
              ? "운영·재정·환경의 인계 기준을 모두 통과했습니다."
              : "이번 결산에서 보완할 방향만 요약했습니다."}
          </small>
        </div>
      </div>
      {complete ? (
        <p className="campaign-ending-hints-complete">
          자금과 환경, 장기 운영 기록이 한쪽에 치우치지 않은 채 다음 시즌으로 인계됐습니다.
        </p>
      ) : (
        <ul>
          {hints.map((hint) => (
            <li key={hint.id}>
              <span>다음 임기 힌트</span>
              <strong>{hint.title}</strong>
              <p>{hint.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CampaignEndPanel({
  game,
  onReturnToPlay,
}: {
  game: GameState;
  onReturnToPlay: () => void;
}) {
  const ending = evaluateCampaignEnding(game);
  const handoverUsers =
    game.history.find((entry) => entry.day === 46)?.totalUsers ??
    game.history[0]?.totalUsers ??
    ending.totalUsers;
  const userDelta = Math.round(ending.totalUsers - handoverUsers);
  const runwayMonths = getOperatingRunwayMonths(
    ending.scores.cash,
    ending.totalUsers,
  );
  const strategicRecord = game.operations.records.find((record) =>
    isStrategicBusinessAction(record.type)
  );
  const strategicEndingCopy = !strategicRecord
    ? "대형 프로젝트 슬롯은 사용하지 않았습니다."
    : strategicRecord.outcome === "success"
      ? `${BUSINESS_ACTION_BY_TYPE[strategicRecord.type].title} 성공으로 ₩${formatRevenue(strategicRecord.cashReturn ?? 0)}을 회수했습니다.`
      : strategicRecord.outcome === "backlash"
        ? `${BUSINESS_ACTION_BY_TYPE[strategicRecord.type].title} 실패로 투자금을 회수하지 못했습니다.`
        : `${BUSINESS_ACTION_BY_TYPE[strategicRecord.type].title}의 성과가 확정되지 않았습니다.`;
  const endingTone = ending.qualifiedForBestEnding
    ? "stable"
    : ending.bands.environment === "danger" || ending.bands.cash === "crisis"
      ? "danger"
      : "caution";
  const tone =
    endingTone === "stable"
      ? "calm"
      : endingTone === "caution"
        ? "caution"
        : "critical";

  return (
    <section
      aria-labelledby="campaign-end-title"
      className={`game-over-panel campaign-end-panel ending-${endingTone}`}
    >
      <LotusSymbol tone={tone} />
      <span className="game-over-kicker">MANDATE COMPLETE · FINAL AUDIT</span>
      <h1 id="campaign-end-title">{ending.title}</h1>
      <strong>
        {CAMPAIGN_CASH_LABEL[ending.bands.cash]} ·{" "}
        {CAMPAIGN_ENVIRONMENT_LABEL[ending.bands.environment]}
      </strong>
      <p>{ending.body} {strategicEndingCopy}</p>
      <dl className="campaign-end-metrics">
        <div>
          <dt>최종 운영자금</dt>
          <dd>₩{formatRevenue(ending.scores.cash)}</dd>
          <small>현 규모 기준 약 {runwayMonths.toFixed(1)}개월</small>
        </div>
        <div>
          <dt>환경 안정률</dt>
          <dd>{ending.scores.environmentHealth.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>활성 유저</dt>
          <dd>{formatUsers(ending.totalUsers)}명</dd>
          <small>
            인수 대비 {userDelta >= 0 ? "+" : ""}{formatUsers(userDelta)}명
          </small>
        </div>
        <div>
          <dt>구매 신뢰</dt>
          <dd>{Math.round(game.purchaseTrust)} / 100</dd>
        </div>
      </dl>
      <CampaignEndingHints ending={ending} />
      <small className="campaign-end-note">
        DAY {LAST_DECISION_DAY} 최종 금제 이후 {SETTLEMENT_DAYS}일의 관측
        결과로 확정된 공식 기록입니다.
      </small>
      <button className="primary-action" onClick={onReturnToPlay} type="button">
        PLAY 화면으로 돌아가기
      </button>
    </section>
  );
}

function PlayScreen({
  busy,
  interfaceSettings,
  savedGame,
  message,
  onNewGame,
  onContinue,
  children,
  updateInterfaceSetting,
}: {
  busy: boolean;
  interfaceSettings: InterfaceSettings;
  savedGame: GameState | null;
  message: string | null;
  onNewGame: () => void;
  onContinue: () => void;
  children?: React.ReactNode;
  updateInterfaceSetting: <Key extends keyof InterfaceSettings>(
    key: Key,
    value: InterfaceSettings[Key],
  ) => void;
}) {
  return (
    <main
      aria-busy={busy}
      className={`play-screen${
        interfaceSettings.motionPreference === "reduced"
          ? " force-reduced-motion"
          : ""
      }`}
    >
      <section className="play-card" aria-labelledby="play-title">
        <div className="play-brand">
          <BrandMark className="play-brand-mark" />
          <strong>TCG REGULATOR</strong>
        </div>
        <div className="play-heading">
          <span>{CAMPAIGN_END_DAY} DAY META MANDATE</span>
          <h1 id="play-title">PLAY</h1>
        </div>
        <div className="play-promise">
          <strong>카드를 뽑는 대신, 금제표를 만드세요.</strong>
          <p>
            TCG 운영자가 되어 발매 파워와 금제 수위를 정하고, 메타·여론·매출의
            연쇄 반응을 책임지세요.
          </p>
        </div>
        <div className="play-actions" aria-label="게임 시작">
          <button disabled={busy} onClick={onNewGame} type="button">
            <strong>처음부터</strong>
            <span>업무 인수인계부터 새 임기 시작</span>
          </button>
          <button
            className="continue-action"
            disabled={busy || !savedGame}
            onClick={onContinue}
            type="button"
          >
            <strong>이어하기</strong>
            <span>
              {busy
                ? "저장 확인 중"
                : savedGame
                  ? !savedGame.handoverComplete
                    ? `DAY ${savedGame.day} · 인수인계 진행 중`
                    : savedGame.phase === "ended"
                      ? `DAY ${savedGame.day} · 임기 결과 보기`
                      : savedGame.phase === "running" &&
                          savedGame.day >= SETTLEMENT_START_DAY
                        ? `DAY ${savedGame.day} · 결산 관찰 중`
                        : `DAY ${savedGame.day} · 임기 진행 중`
                  : "저장된 임기 없음"}
            </span>
          </button>
        </div>
        {message ? <p className="play-message" role="status">{message}</p> : null}
        <details className="play-settings">
          <summary>
            <span>SETTINGS</span>
            <small>효과음 · 파급 화면 · 모션</small>
          </summary>
          <SettingsOptions
            settings={interfaceSettings}
            updateSetting={updateInterfaceSetting}
          />
        </details>
      </section>
      {children}
    </main>
  );
}

function ConfirmNewGameDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby="new-game-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        role="alertdialog"
      >
        <div className="confirm-icon" aria-hidden="true">!</div>
        <h2 id="new-game-dialog-title">기존 임기를 덮어쓸까요?</h2>
        <p>새 임기를 시작하면 기존 저장을 DAY 1 상태로 교체하며 되돌릴 수 없습니다. 인수인계 중 날짜와 확정한 결정은 자동 저장됩니다.</p>
        <div className="dialog-actions">
          <button className="text-action" onClick={onCancel} type="button">취소</button>
          <button className="primary-action" onClick={onConfirm} type="button">DAY 1부터 시작</button>
        </div>
      </div>
    </div>
  );
}

function PackOddsConfirmFloat({
  detectionRisk,
  dialogRef,
  cancelButtonRef,
  onCancel,
  onConfirm,
}: {
  detectionRisk: number;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  cancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const action = BUSINESS_ACTION_BY_TYPE["pack-odds"];
  return (
    <div className="pack-odds-confirm-layer">
      <div
        aria-describedby="pack-odds-confirm-description"
        aria-labelledby="pack-odds-confirm-title"
        aria-modal="true"
        className="pack-odds-confirm-float"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="pack-odds-confirm-heading">
          <div className="pack-odds-confirm-mark" aria-hidden="true">
            <span>!</span>
          </div>
          <header className="pack-odds-confirm-copy">
            <span>RISK AUTHORIZATION · PACK ODDS</span>
            <h2 id="pack-odds-confirm-title">봉입률 하향을 예약할까요?</h2>
            <p id="pack-odds-confirm-description">
              다음 정기 발매의 희소도와 매출이 오르지만, 조정 사실이
              적발되면 구매 신뢰가 크게 하락합니다.
            </p>
          </header>
        </div>

        <div
          aria-label="봉입률 조정 위험 상세"
          className="pack-odds-confirm-body"
          role="region"
          tabIndex={-1}
        >
          <dl className="pack-odds-confirm-facts">
            <div className="critical">
              <dt>현재 추정 적발률</dt>
              <dd>{detectionRisk}%</dd>
            </div>
            <div>
              <dt>집행 비용</dt>
              <dd>₩{formatRevenue(action.cost)}</dd>
            </div>
            <div>
              <dt>적용 시점</dt>
              <dd>다음 정기 발매</dd>
            </div>
          </dl>

          <div className="pack-odds-confirm-warning">
            <strong>적발 시 구매 신뢰 급락</strong>
            <span>
              예약 후 발매일까지 대기하며, 실행 결과는 되돌릴 수 없습니다.
            </span>
          </div>
        </div>

        <div className="pack-odds-confirm-actions">
          <small>ESC · 취소</small>
          <button
            className="pack-odds-confirm-cancel"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            취소
          </button>
          <button
            className="pack-odds-confirm-accept"
            onClick={onConfirm}
            type="button"
          >
            위험 감수 · 예약
          </button>
        </div>
      </div>
    </div>
  );
}

const BUSINESS_RISK_FACTOR_LABEL = {
  environment: "환경 안정도",
  trust: "구매 신뢰",
  policy: "최근 금제 품질",
  release: "최근 발매 성과",
  timing: "남은 임기",
  execution: "실행 변수",
} as const;

function StrategicProjectConfirmFloat({
  action,
  game,
  dialogRef,
  cancelButtonRef,
  onCancel,
  onConfirm,
}: {
  action: StrategicBusinessActionType;
  game: GameState;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  cancelButtonRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const definition = BUSINESS_ACTION_BY_TYPE[action];
  const profile = getStrategicProjectRiskProfile(game, action);
  return (
    <div className="pack-odds-confirm-layer">
      <div
        aria-describedby="strategic-project-confirm-description"
        aria-labelledby="strategic-project-confirm-title"
        aria-modal="true"
        className="pack-odds-confirm-float"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="pack-odds-confirm-heading">
          <div className="pack-odds-confirm-mark" aria-hidden="true">
            <span>!</span>
          </div>
          <header className="pack-odds-confirm-copy">
            <span>RISK AUTHORIZATION · STRATEGIC PROJECT</span>
            <h2 id="strategic-project-confirm-title">
              {withKoreanObjectParticle(definition.title)} 집행할까요?
            </h2>
            <p id="strategic-project-confirm-description">
              대형 프로젝트 슬롯은 임기 중 한 번뿐입니다. 표시된 위험은
              지금의 환경·신뢰·최근 발매와 금제 기록으로 확정됩니다.
            </p>
          </header>
        </div>

        <div
          aria-label="대형 프로젝트 위험 상세"
          className="pack-odds-confirm-body"
          role="region"
          tabIndex={-1}
        >
          <dl className="pack-odds-confirm-facts">
            <div className="critical">
              <dt>현재 실패 위험</dt>
              <dd>{Math.round(profile.risk * 100)}%</dd>
            </div>
            <div>
              <dt>집행 / 성공 회수</dt>
              <dd>₩{formatRevenue(definition.cost)} / ₩{formatRevenue(definition.successReturn ?? 0)}</dd>
            </div>
            <div>
              <dt>결과 발표</dt>
              <dd>DAY {game.day + (definition.resolutionDelay ?? 1)}</dd>
            </div>
          </dl>

          <div className="pack-odds-confirm-warning">
            <strong>최대 위험 요인 · {BUSINESS_RISK_FACTOR_LABEL[profile.context.primaryRisk]}</strong>
            <span>
              실패하면 투자금을 회수하지 못하며 유저와 구매 신뢰가 함께
              하락합니다. 집행 뒤 결과는 되돌릴 수 없습니다.
            </span>
          </div>
        </div>

        <div className="pack-odds-confirm-actions">
          <small>ESC · 취소</small>
          <button
            className="pack-odds-confirm-cancel"
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            취소
          </button>
          <button
            className="pack-odds-confirm-accept"
            onClick={onConfirm}
            type="button"
          >
            위험 감수 · 집행
          </button>
        </div>
      </div>
    </div>
  );
}

type MetaWorkspaceProps = {
  view: "themes" | "restrictions";
  game: GameState;
  rankedThemes: ThemeContent[];
  placementReport: RecentPlacementReport;
  previousPlacementReport: RecentPlacementReport;
  latestCommunity: CommunityEvent[];
  selectedTheme: ThemeContent;
  selectedRuntime: GameState["themes"][string];
  selectedRank: number;
  selectedTier: MetaTier;
  selectedTierProvisional: boolean;
  selectedRequests: GameState["supportRequests"];
  nextBanDay: number;
  banDraft: Record<string, RestrictionLimit>;
  restrictionChanges: [string, RestrictionLimit][];
  restrictionPolicy: RestrictionPolicyProfile;
  highlightedPartId: string | null;
  mobileDetail: boolean;
  guidedThemeTarget?: ThemeId | null;
  guidedPartTarget?: GuidedDossierTarget | null;
  guidedRestrictionTarget?: GuidedRestrictionTarget | null;
  detailHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onSelectTheme: (themeId: ThemeId, partId?: string) => void;
  onOpenSupport: (themeId: ThemeId) => void;
  onGuidedPartConfirm?: () => void;
  onGuidedThemeConfirm?: () => void;
  onBackToThemes: () => void;
  onDraftChange: (partId: string, limit: RestrictionLimit) => void;
  onResetDraft: () => void;
  onSubmitRestriction: () => void;
};

function MetaWorkspace({
  view,
  game,
  rankedThemes,
  placementReport,
  previousPlacementReport,
  latestCommunity,
  selectedTheme,
  selectedRuntime,
  selectedRank,
  selectedTier,
  selectedTierProvisional,
  selectedRequests,
  nextBanDay,
  banDraft,
  restrictionChanges,
  restrictionPolicy,
  highlightedPartId,
  mobileDetail,
  guidedThemeTarget = null,
  guidedPartTarget = null,
  guidedRestrictionTarget,
  detailHeadingRef,
  onSelectTheme,
  onOpenSupport,
  onGuidedPartConfirm,
  onGuidedThemeConfirm,
  onBackToThemes,
  onDraftChange,
  onResetDraft,
  onSubmitRestriction,
}: MetaWorkspaceProps) {
  const releasedPartIds = new Set(selectedRuntime.releasedPartIds);
  const releasedParts = selectedTheme.parts.filter((part) =>
    releasedPartIds.has(part.id),
  );
  const committedSupportCount = getCommittedSupportCount(
    game,
    selectedTheme.id,
  );
  const supportProposalAvailable = canProposeSupport(game, selectedTheme.id);
  const selectedCommunity = latestCommunity.filter(
    (event) => event.themeId === selectedTheme.id,
  );
  const visibleCommunity = (
    selectedCommunity.length > 0 ? selectedCommunity : latestCommunity
  ).slice(0, 3);
  const selectedPlacement =
    placementReport.themes[selectedTheme.id] ?? EMPTY_PLACEMENT_METRICS;
  const selectedPreviousPlacement =
    previousPlacementReport.themes[selectedTheme.id] ??
    EMPTY_PLACEMENT_METRICS;
  const selectedPlacementDelta =
    selectedPlacement.placementShare -
    selectedPreviousPlacement.placementShare;

  return (
    <section className={`meta-workspace ${view}`}>
      <div className={`meta-layout ${mobileDetail ? "show-detail" : "show-list"}`}>
        <aside className="theme-panel" aria-label="테마 목록">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">META INDEX</span>
              <h2>테마 리스트</h2>
              <p>점유율 순 · {rankedThemes.length}개 출시 테마</p>
            </div>
            <span className="data-stamp">DAY {game.day}</span>
          </div>
          <div className="theme-list" role="list">
            {rankedThemes.map((theme) => {
              const runtime = game.themes[theme.id];
              const placement =
                placementReport.themes[theme.id] ?? EMPTY_PLACEMENT_METRICS;
              const tierResult = getPlacementTier(
                placement.placementShare,
                game.day,
                getThemeDebutDay(game.releaseHistory, theme.id),
              );
              const scheduled = game.supportRequests.find(
                (request) =>
                  request.themeId === theme.id &&
                  (request.status === "queued" || request.status === "offered"),
              );
              return (
                <div
                  className={theme.id === selectedTheme.id ? "theme-row selected" : "theme-row"}
                  key={theme.id}
                  role="listitem"
                  style={{ "--theme-accent": theme.color } as React.CSSProperties}
                >
                  <button
                    aria-current={theme.id === selectedTheme.id ? "true" : undefined}
                    className="theme-select"
                    data-tutorial-target={
                      guidedThemeTarget === theme.id
                        ? "active"
                        : undefined
                    }
                    disabled={Boolean(guidedThemeTarget && theme.id !== guidedThemeTarget)}
                    onClick={() => {
                      onSelectTheme(theme.id);
                      if (guidedThemeTarget === theme.id) {
                        onGuidedThemeConfirm?.();
                      }
                    }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="theme-emblem-frame"
                    >
                      <ThemeEmblem
                        decorative
                        detail="compact"
                        size="100%"
                        themeId={theme.id}
                      />
                    </span>
                    <span className="theme-row-copy">
                      <strong>{theme.name}</strong>
                      <small>{theme.playstyle}</small>
                      <span className="theme-statline">
                        채용률 {formatPercent(runtime.share)}
                        <i aria-hidden="true" />
                        승률 {formatPercent(runtime.winRate)}
                      </span>
                      <span className="theme-statline placement">
                        입상 {formatPercent(placement.placementShare)}
                        <i aria-hidden="true" />
                        전환 {formatPercent(placement.observedConversion)}
                      </span>
                    </span>
                    <span className={`tier-label ${getTierTone(tierResult.tier)}`}>
                      {tierResult.provisional ? "잠정 " : ""}
                      {tierResult.tier}
                    </span>
                  </button>
                  {scheduled ? (
                    <span className="development-dot" title={`DAY ${scheduled.eligibleReleaseDay} 시안 보장`}>
                      시안 대기
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="theme-detail" aria-labelledby="theme-detail-title">
          <button className="mobile-back" onClick={onBackToThemes} type="button">
            <span aria-hidden="true">←</span> 테마 목록
          </button>
          <div
            className="detail-hero"
            style={{ "--theme-accent": selectedTheme.color } as React.CSSProperties}
          >
            <div className="detail-title-block">
              <div className="theme-identity">
                <span
                  className="theme-emblem-hero"
                  style={{ "--theme-accent": selectedTheme.color } as React.CSSProperties}
                >
                  <ThemeEmblem
                    decorative={false}
                    detail="full"
                    label={`${selectedTheme.name} 테마 상징`}
                    size="100%"
                    themeId={selectedTheme.id}
                  />
                </span>
                <div>
                  <span className="eyebrow theme-registry-kicker">
                    THEME DOSSIER
                    <b>
                      PICK #{String(selectedRank + 1).padStart(3, "0")}
                    </b>
                  </span>
                  <h2 id="theme-detail-title" ref={detailHeadingRef} tabIndex={-1}>
                    {selectedTheme.name}
                  </h2>
                  <p>{selectedTheme.playstyle}</p>
                </div>
              </div>
              <button
                className="secondary-action"
                disabled={!supportProposalAvailable}
                onClick={() => onOpenSupport(selectedTheme.id)}
                title={
                  committedSupportCount >= 3
                    ? selectedRuntime.supportCount >= 3
                      ? "이 테마는 세 차례 지원을 모두 받았습니다."
                      : "세 번째 지원이 확정되어 적용을 기다리고 있습니다."
                    : !supportProposalAvailable
                      ? "지원 일정이나 제안 대기 시간을 확인해주세요."
                      : undefined
                }
                type="button"
              >
                <ReleaseIcon size={16} />
                {selectedRuntime.supportCount >= 3
                  ? "지원 완료"
                  : committedSupportCount >= 3
                    ? "지원 예정 완료"
                    : "지원 제안"}
              </button>
            </div>

            <div className="theme-metrics">
              <div>
                <span>현재 티어</span>
                <strong className={getTierTone(selectedTier)}>
                  {selectedTierProvisional ? "잠정 " : ""}
                  {selectedTier}
                </strong>
                <small>
                  {selectedTier === "Tier Out"
                    ? "메타 집계 제외"
                    : `최근 30일 입상 기준`}
                </small>
              </div>
              <div>
                <span>입상 점유율</span>
                <strong>{formatPercent(selectedPlacement.placementShare)}</strong>
                <small
                  className={
                    selectedPlacementDelta >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {selectedPlacementDelta >= 0 ? "+" : ""}
                  {formatPercent(selectedPlacementDelta, 2)}
                  p / 7일
                </small>
              </div>
              <div>
                <span>입상 전환율</span>
                <strong>{formatPercent(selectedPlacement.observedConversion)}</strong>
                <small>탑컷 / 추정 참가자</small>
              </div>
              <div>
                <span>채용률</span>
                <strong>{formatPercent(selectedRuntime.share)}</strong>
                <small>채용 순위 #{selectedRank + 1}</small>
              </div>
              <div>
                <span>승률</span>
                <strong>{formatPercent(selectedRuntime.winRate)}</strong>
                <small>환경 가중 평균</small>
              </div>
            </div>

            <div className="detail-facts">
              <span className="card-pool-fact">
                현재 카드풀 <strong>{releasedParts.length} / 14장</strong>
              </span>
              <span className="card-pool-fact">
                지원 <strong>{selectedRuntime.supportCount} / 3회</strong>
              </span>
              <span>미학 · {selectedTheme.aesthetic}</span>
              <span>난도 · {selectedTheme.difficulty}</span>
              <span>피로도 · {Math.round(selectedRuntime.fatigue)}</span>
              <span>불쾌도 · {Math.round(selectedRuntime.unpleasantness)}</span>
              <span>금제 요구 · {Math.round(getBanDemand(selectedRuntime))}</span>
              {selectedRequests.at(-1) ? (
                <span>
                  지원 · {supportStatusLabel(selectedRequests.at(-1)!.status)} DAY{" "}
                  {selectedRequests.at(-1)!.eligibleReleaseDay}
                </span>
              ) : null}
            </div>
          </div>

          {view === "themes" ? (
            <div className="theme-intel-grid">
              <article>
                <span className="eyebrow">IDENTITY</span>
                <h3>테마 성향</h3>
                <dl>
                  <div><dt>미학</dt><dd>{selectedTheme.aesthetic}</dd></div>
                  <div><dt>난도</dt><dd>{selectedTheme.difficulty}</dd></div>
                  <div><dt>환경 파워</dt><dd>{Math.round(selectedRuntime.power)}</dd></div>
                  <div><dt>피로도</dt><dd>{Math.round(selectedRuntime.fatigue)}</dd></div>
                </dl>
              </article>
              <article className="theme-parts-preview">
                <span className="eyebrow">CORE PARTS</span>
                <h3>핵심 파츠 구성</h3>
                <div>
                  {releasedParts.map((part) => (
                    <button
                      data-tutorial-target={
                        guidedPartTarget &&
                        selectedTheme.id === guidedPartTarget.themeId &&
                        part.id === guidedPartTarget.partId
                          ? "active"
                          : undefined
                      }
                      disabled={
                        Boolean(
                          guidedPartTarget &&
                          !(
                            selectedTheme.id === guidedPartTarget.themeId &&
                            part.id === guidedPartTarget.partId
                          ),
                        )
                      }
                      key={part.id}
                      onClick={() => {
                        onSelectTheme(selectedTheme.id, part.id);
                        if (
                          guidedPartTarget &&
                          selectedTheme.id === guidedPartTarget.themeId &&
                          part.id === guidedPartTarget.partId
                        ) {
                          onGuidedPartConfirm?.();
                        }
                      }}
                      type="button"
                    >
                      <strong>{part.name}</strong>
                      <small>{ROLE_LABELS[part.role]}</small>
                    </button>
                  ))}
                </div>
              </article>
              <article className="theme-signals">
                <span className="eyebrow">LATEST SIGNALS</span>
                <h3>최근 반응</h3>
                <div>
                  {visibleCommunity.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => onSelectTheme(event.themeId, event.partId)}
                      type="button"
                    >
                      <span>DAY {event.day}</span>
                      <strong>{formatCommunityEvent(event, game)}</strong>
                    </button>
                  ))}
                </div>
              </article>
            </div>
          ) : (
          <div className="parts-section">
            <div className="parts-heading">
              <div>
                <h3>핵심 파츠</h3>
                <p>
                  채용률은 해당 테마 덱 중 사용 비율, 평균 매수는 채용 덱 기준입니다.
                </p>
              </div>
              {game.phase === "ban-edit" ? (
                <span className="editing-chip">
                  <GavelIcon size={14} />
                  금제안 편집 중
                </span>
              ) : game.day >= LAST_DECISION_DAY ? (
                <span className="readonly-chip">최종 금제 반영 · 결산 중</span>
              ) : (
                <span className="readonly-chip">DAY {nextBanDay} 조정 가능</span>
              )}
            </div>

            <div className="parts-table-wrap">
              <table className="parts-table">
                <caption className="sr-only">{selectedTheme.name} 핵심 파츠와 금제 현황</caption>
                <thead>
                  <tr>
                    <th scope="col">핵심 파츠</th>
                    <th scope="col">채용률</th>
                    <th scope="col">평균 매수</th>
                    <th scope="col">현행</th>
                    <th scope="col">조정</th>
                  </tr>
                </thead>
                <tbody>
                  {releasedParts.map((part) => {
                    const stats = selectedRuntime.partStats[part.id];
                    const official = selectedRuntime.legalLimits[part.id];
                    const draft = banDraft[part.id] ?? official;
                    const restrictionTenure = getRestrictionTenureLabel(
                      game,
                      selectedTheme.id,
                      part.id,
                      official,
                    );
                    return (
                      <tr
                        className={
                          highlightedPartId === part.id
                            ? "part-highlight"
                            : draft !== official
                              ? "part-changed"
                              : ""
                        }
                        id={`part-${part.id}`}
                        key={part.id}
                      >
                        <th scope="row">
                          <strong>{part.name}</strong>
                          <span>{ROLE_LABELS[part.role]}</span>
                          <small>{part.tags.slice(0, 2).join(" · ")}</small>
                        </th>
                        <td data-label="채용률">{formatPercent(stats.usageRate, 0)}</td>
                        <td data-label="평균 매수">{stats.averageCopies.toFixed(1)}장</td>
                        <td data-label="현행">
                          <span className="official-limit">
                            {official}장
                            <small>
                              {LIMIT_LABELS[official]}
                              {restrictionTenure ? (
                                <span className="restriction-tenure">
                                  · {restrictionTenure}
                                </span>
                              ) : null}
                            </small>
                          </span>
                        </td>
                        <td data-label="조정">
                          {game.phase === "ban-edit" ? (
                            <div
                              aria-label={`${part.name} 허용 매수`}
                              className="copy-control"
                              role="group"
                            >
                              {([0, 1, 2, 3] as RestrictionLimit[]).map((limit) => (
                                <button
                                  aria-pressed={draft === limit}
                                  className={draft === limit ? "active" : ""}
                                  data-tutorial-target={
                                    guidedRestrictionTarget?.kind === "limit" &&
                                    guidedRestrictionTarget.partId === part.id &&
                                    guidedRestrictionTarget.limit === limit
                                      ? "active"
                                      : undefined
                                  }
                                  disabled={
                                    Boolean(guidedRestrictionTarget) &&
                                    !(
                                      guidedRestrictionTarget?.kind === "limit" &&
                                      guidedRestrictionTarget.partId === part.id &&
                                      guidedRestrictionTarget.limit === limit
                                    )
                                  }
                                  key={limit}
                                  onClick={() => onDraftChange(part.id, limit)}
                                  title={`${LIMIT_LABELS[limit]} ${limit}장`}
                                  type="button"
                                >
                                  {limit}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="locked-copy">—</span>
                          )}
                          {draft !== official ? (
                            <small className="change-note">
                              {official} → {draft}
                            </small>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {view === "restrictions" ? (
          <div className={game.phase === "ban-edit" ? "decision-footer active" : "decision-footer"}>
            <div>
              <strong>
                {game.phase === "ban-edit"
                  ? restrictionChanges.length > 0
                    ? `실효 조정 ${restrictionPolicy.meaningfulCutCount}종 · ${restrictionPolicy.affectedThemeCount}개 테마 영향`
                    : "현 환경 유지안"
                  : game.day >= LAST_DECISION_DAY
                    ? `DAY ${CAMPAIGN_END_DAY} 최종 결산 대기`
                  : `다음 금제위원회까지 D-${Math.max(0, nextBanDay - game.day)}`}
              </strong>
              <p>
                {game.phase === "ban-edit"
                  ? `상위권 ${restrictionPolicy.upperMeaningfulCuts}종 · Tier 2 ${restrictionPolicy.tier2MeaningfulCuts}종 · 하위권 ${restrictionPolicy.lowerMeaningfulCuts}종 · 추정 충격 ${Math.round(restrictionPolicy.totalImpact)}`
                  : game.day >= LAST_DECISION_DAY
                    ? "최종 금제 이후에는 새 결정을 받지 않고 환경과 시장의 반응만 관측합니다."
                  : "금제는 제출되는 날에만 적용됩니다. 지금 보이는 현행 수치는 공식 환경입니다."}
              </p>
            </div>
            {game.phase === "ban-edit" ? (
              <div className="decision-actions">
                <button
                  className="text-action"
                  disabled={Boolean(guidedRestrictionTarget)}
                  onClick={onResetDraft}
                  type="button"
                >
                  초기화
                </button>
                <button
                  className="primary-action"
                  data-sound="restriction"
                  data-tutorial-target={
                    guidedRestrictionTarget?.kind === "submit"
                      ? "active"
                      : undefined
                  }
                  disabled={
                    Boolean(guidedRestrictionTarget) &&
                    guidedRestrictionTarget?.kind !== "submit"
                  }
                  onClick={onSubmitRestriction}
                  type="button"
                >
                  {restrictionChanges.length > 0 ? "금제안 제출" : "변경 없음으로 제출"}
                </button>
              </div>
            ) : null}
          </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function DistributionView({
  game,
  guidedInspection = false,
  total,
  nextReleaseDay,
  nextBanDay,
  rankedThemes,
  placementReport,
  previousPlacementReport,
  onSelectTheme,
}: {
  game: GameState;
  guidedInspection?: boolean;
  total: number;
  nextReleaseDay: number;
  nextBanDay: number;
  rankedThemes: ThemeContent[];
  placementReport: RecentPlacementReport;
  previousPlacementReport: RecentPlacementReport;
  onSelectTheme: (themeId: ThemeId) => void;
}) {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const placementThemes = [...rankedThemes]
    .filter(
      (theme) =>
        (placementReport.themes[theme.id]?.placements ?? 0) > 0,
    )
    .sort((left, right) => {
      const placementDelta =
        (placementReport.themes[right.id]?.placementShare ?? 0) -
        (placementReport.themes[left.id]?.placementShare ?? 0);
      return (
        placementDelta ||
        game.themes[right.id].share - game.themes[left.id].share ||
        left.id.localeCompare(right.id)
      );
    });
  const tieredThemes = placementThemes.map((theme, rank) => {
    const placement =
      placementReport.themes[theme.id] ?? EMPTY_PLACEMENT_METRICS;
    return {
      rank,
      theme,
      placement,
      tier: getPlacementTier(placement.placementShare).tier,
    };
  });
  const namedTierThemes = tieredThemes.filter(({ tier }) =>
    isNamedMetaTier(tier),
  );
  const tierThreeThemes = tieredThemes.filter(
    ({ tier }) => tier === "Tier 3",
  );
  const otherShare = tierThreeThemes.reduce(
    (sum, { placement }) => sum + placement.placementShare,
    0,
  );
  const otherPreviousShare = Object.values(
    previousPlacementReport.themes,
  ).reduce(
    (sum, placement) =>
      getPlacementTier(placement.placementShare).tier === "Tier 3"
        ? sum + placement.placementShare
        : sum,
    0,
  );
  const chartEntries = [
    ...namedTierThemes.map(({ theme, tier, placement }) => ({
      id: theme.id,
      label: theme.name,
      color: theme.color,
      share: placement.placementShare,
      theme,
      tier,
    })),
    ...(tierThreeThemes.length > 0
      ? [
          {
            id: "tier-three-other",
            label: "기타",
            color: "#94a3b8",
            share: otherShare,
            theme: null,
            tier: "Tier 3" as const,
          },
        ]
      : []),
  ];
  const shareTotal =
    chartEntries.reduce(
      (sum, entry) => sum + entry.share,
      0,
    ) || 1;
  const distributionSlices = chartEntries.reduce<{
    accumulated: number;
    slices: {
      entry: (typeof chartEntries)[number];
      offset: number;
      size: number;
    }[];
  }>(
    (distribution, entry, index) => {
      const size =
        index === chartEntries.length - 1
          ? Math.max(0, 100 - distribution.accumulated)
          : (entry.share / shareTotal) * 100;
      return {
        accumulated: distribution.accumulated + size,
        slices: [
          ...distribution.slices,
          { entry, offset: -distribution.accumulated, size },
        ],
      };
    },
    { accumulated: 0, slices: [] },
  ).slices;
  const healthBreakdown = useMemo(
    () => getBusinessEnvironmentHealthBreakdown(game),
    [game],
  );
  const health = Math.round(healthBreakdown.score);
  const hasFutureRelease =
    game.phase === "release-edit" || game.day < LAST_RELEASE_DAY;
  const hasFutureBan =
    game.phase === "ban-edit" || game.day < LAST_DECISION_DAY;
  const settlementPeriod =
    game.phase === "ended" ||
    (game.phase === "running" && game.day >= LAST_DECISION_DAY);
  const inspectedEntryId = hoveredEntryId ?? focusedEntryId;
  const inspectedEntry =
    chartEntries.find((entry) => entry.id === inspectedEntryId) ??
    chartEntries[0];
  const inspectedTheme = inspectedEntry?.theme ?? null;
  const inspectedRuntime = inspectedTheme
    ? game.themes[inspectedTheme.id]
    : null;
  const isInspectingEntry = inspectedEntryId === inspectedEntry?.id;
  const topThreeShare = placementThemes
    .slice(0, 3)
    .reduce(
      (sum, theme) =>
        sum +
        (placementReport.themes[theme.id]?.placementShare ?? 0),
      0,
    );
  const inspectedFatigue = inspectedRuntime
    ? getFatigueSignal(inspectedRuntime)
    : null;
  const highestFatigueTheme = rankedThemes.reduce<ThemeContent | null>(
    (highest, theme) => {
      if (!highest) return theme;
      const runtime = game.themes[theme.id];
      const highestRuntime = game.themes[highest.id];
      if (runtime.fatigue !== highestRuntime.fatigue) {
        return runtime.fatigue > highestRuntime.fatigue ? theme : highest;
      }
      return runtime.topStreakDays > highestRuntime.topStreakDays
        ? theme
        : highest;
    },
    null,
  );
  const highestFatigueRuntime = highestFatigueTheme
    ? game.themes[highestFatigueTheme.id]
    : null;
  const highestFatigueSignal = highestFatigueRuntime
    ? getFatigueSignal(highestFatigueRuntime)
    : null;

  return (
    <section
      className="distribution-page"
      data-tutorial-inspection={guidedInspection ? "active" : undefined}
      data-tutorial-target={guidedInspection ? "active" : undefined}
      tabIndex={guidedInspection ? -1 : undefined}
    >
      <header className="subpage-heading distribution-heading">
        <div>
          <span className="eyebrow">TOP CUT DISTRIBUTION</span>
          <h1>메타 입상 분포</h1>
          <p>최근 30일 주요 대회 입상 비중과 순환 신호를 확인합니다.</p>
        </div>
        <div className="distribution-heading-actions">
          {highestFatigueTheme &&
          highestFatigueRuntime &&
          highestFatigueSignal &&
          highestFatigueRuntime.fatigue >= 55 ? (
            <div
              aria-label={`${highestFatigueTheme.name} 장기 노출 경고. 피로도 ${Math.round(highestFatigueRuntime.fatigue)}, 1위 유지 ${highestFatigueRuntime.topStreakDays}일, ${highestFatigueSignal.label}`}
              className={`fatigue-signal-ribbon ${highestFatigueSignal.level}`}
              role="status"
            >
              <span>LONG META</span>
              <strong>{highestFatigueTheme.shortName} 장기 집권</strong>
              <em>{highestFatigueSignal.label}</em>
            </div>
          ) : null}
          <div className="distribution-schedule" aria-label="다음 운영 일정">
            {settlementPeriod ? (
              <span>
                <CalendarIcon size={16} /> 최종 결산{" "}
                <strong>DAY {CAMPAIGN_END_DAY}</strong>
              </span>
            ) : (
              <>
                {hasFutureRelease ? (
                  <span>
                    <ReleaseIcon size={16} /> {game.phase === "release-edit" ? "현재 발매" : "다음 발매"}{" "}
                    <strong>DAY {nextReleaseDay}</strong>
                  </span>
                ) : null}
                {hasFutureBan ? (
                  <span>
                    <GavelIcon size={16} /> {game.phase === "ban-edit" ? "현재 금제" : "다음 금제"}{" "}
                    <strong>DAY {nextBanDay}</strong>
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="distribution-layout">
        <article className="distribution-chart-card">
          <div
            className={`distribution-donut${isInspectingEntry ? " is-inspecting" : ""}`}
            onPointerLeave={() => setHoveredEntryId(null)}
          >
            <svg
              aria-label="0티어부터 2티어까지는 개별 표시하고 3티어 입상은 기타로 합산한 최근 30일 입상 분포입니다. 모든 입상 비중의 합은 100퍼센트입니다."
              className="distribution-donut-svg"
              role="group"
              viewBox="0 0 100 100"
            >
              <circle
                aria-hidden="true"
                className="distribution-donut-track"
                cx="50"
                cy="50"
                fill="none"
                r="38"
                strokeWidth="24"
              />
              {distributionSlices.map(({ entry, offset, size }) => {
                const isActive =
                  isInspectingEntry && inspectedEntry?.id === entry.id;
                const shareLabel = formatPercent(entry.share);
                const ariaLabel = entry.theme
                  ? `${entry.label}, 입상 점유율 ${shareLabel}. 상세 정보 열기`
                  : `기타, 3티어 ${tierThreeThemes.length}개 테마 합산 입상 점유율 ${shareLabel}`;

                return (
                  <g
                    aria-label={ariaLabel}
                    aria-disabled={entry.theme && guidedInspection || undefined}
                    className={`distribution-donut-segment${isActive ? " is-active" : ""}`}
                    data-theme-id={entry.theme?.id}
                    key={entry.id}
                    onBlur={() => {
                      setFocusedEntryId((current) =>
                        current === entry.id ? null : current,
                      );
                    }}
                    onClick={() => {
                      if (entry.theme && !guidedInspection) {
                        onSelectTheme(entry.theme.id);
                      }
                    }}
                    onFocus={() => setFocusedEntryId(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (entry.theme && !guidedInspection) {
                          onSelectTheme(entry.theme.id);
                        }
                      }
                    }}
                    onPointerEnter={() => setHoveredEntryId(entry.id)}
                    role={entry.theme ? "button" : "img"}
                    tabIndex={guidedInspection ? -1 : 0}
                  >
                    <title>{`${entry.label}: ${shareLabel}`}</title>
                    <circle
                      className="distribution-donut-slice"
                      cx="50"
                      cy="50"
                      fill="none"
                      pathLength="100"
                      r="38"
                      stroke={entry.color}
                      strokeLinecap="butt"
                      strokeWidth="24"
                      style={
                        {
                          "--slice-color": entry.color,
                          "--slice-offset": offset,
                          "--slice-size": size,
                          strokeDasharray: `${size} ${Math.max(0, 100 - size)}`,
                          strokeDashoffset: offset,
                        } as React.CSSProperties
                      }
                      transform="rotate(-90 50 50)"
                    />
                  </g>
                );
              })}
            </svg>
            <div className="distribution-donut-core">
              <div
                className="distribution-donut-core-content"
                key={`${inspectedEntry?.id ?? "empty"}-${inspectedEntry ? (inspectedEntry.share * 100).toFixed(1) : "0"}`}
              >
                <span>{isInspectingEntry ? "현재 입상 비중" : "입상 1위"}</span>
                <strong>{inspectedEntry?.label ?? "-"}</strong>
                <em>{inspectedEntry ? formatPercent(inspectedEntry.share) : "-"}</em>
                {inspectedRuntime && inspectedFatigue ? (
                  <small className={`donut-fatigue-copy ${inspectedFatigue.level}`}>
                    피로도 {Math.round(inspectedRuntime.fatigue)} · 1위 유지{" "}
                    {inspectedRuntime.topStreakDays}일
                  </small>
                ) : inspectedEntry?.tier === "Tier 3" ? (
                  <small>{tierThreeThemes.length}개 테마 합산</small>
                ) : null}
              </div>
            </div>
          </div>
          <div className="distribution-kpis">
            <div>
              <span>활성 유저</span>
              <strong>{formatUsers(total)}</strong>
              <small>경쟁층 {formatUsers(game.users.tier)}명</small>
            </div>
            <div>
              <span>생태계 건강</span>
              <strong
                title={`경기 품질 ${Math.round(healthBreakdown.gameplayQuality)} · 입상 다양성 ${Math.round(healthBreakdown.placementDiversity)} · 상위권 순환 ${Math.round(healthBreakdown.topCohortTurnover)} · 세대 공존 ${Math.round(healthBreakdown.generationalBalance)} · 생태계 연속성 ${Math.round(healthBreakdown.ecosystemContinuity)}`}
              >
                {health}
              </strong>
              <small>입상 다양성 · 순환 · 세대 공존</small>
            </div>
            <div>
              <span>TOP 3 집중</span>
              <strong>{formatPercent(topThreeShare)}</strong>
              <small>최근 30일 입상 기준</small>
            </div>
            <div>
              <span>구매 신뢰</span>
              <strong>{Math.round(game.purchaseTrust)}</strong>
              <small>100점 기준</small>
            </div>
          </div>
        </article>

        <ol className="distribution-legend" aria-label="0티어부터 2티어까지의 입상 비중과 3티어 합계">
          {namedTierThemes.map(({ theme, tier, rank, placement }) => {
            const runtime = game.themes[theme.id];
            const previousPlacement =
              previousPlacementReport.themes[theme.id] ??
              EMPTY_PLACEMENT_METRICS;
            const delta =
              placement.placementShare -
              previousPlacement.placementShare;
            const fatigue = getFatigueSignal(runtime);
            return (
              <li className={`fatigue-${fatigue.level}`} key={theme.id}>
                <button
                  aria-disabled={guidedInspection || undefined}
                  onClick={() => {
                    if (!guidedInspection) onSelectTheme(theme.id);
                  }}
                  type="button"
                >
                  <span className="legend-rank">{rank + 1}</span>
                  <span
                    aria-hidden="true"
                    className="legend-color"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="legend-theme">
                    <strong>{theme.name}</strong>
                    <small>
                      {tier} · 피로 {Math.round(runtime.fatigue)}
                    </small>
                    {fatigue.level !== "none" ? (
                      <span className={`fatigue-badge ${fatigue.level}`}>
                        {fatigue.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="legend-share">
                    <strong>{formatPercent(placement.placementShare)}</strong>
                    <small className={delta >= 0 ? "positive" : "negative"}>
                      {delta >= 0 ? "+" : ""}
                      {formatPercent(delta, 2)}p
                    </small>
                  </span>
                  <ChevronIcon size={15} />
                </button>
              </li>
            );
          })}
          {tierThreeThemes.length > 0 ? (
            <li className="tier-three-other">
              <div className="distribution-legend-other">
                <span className="legend-rank">기타</span>
                <span
                  aria-hidden="true"
                  className="legend-color"
                  style={{ backgroundColor: "#94a3b8" }}
                />
                <span className="legend-theme">
                  <strong>기타</strong>
                  <small>Tier 3 · {tierThreeThemes.length}개 테마</small>
                </span>
                <span className="legend-share">
                  <strong>{formatPercent(otherShare)}</strong>
                  <small
                    className={
                      otherShare - otherPreviousShare >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {otherShare - otherPreviousShare >= 0 ? "+" : ""}
                    {formatPercent(otherShare - otherPreviousShare, 2)}p
                  </small>
                </span>
                <span aria-hidden="true" />
              </div>
            </li>
          ) : null}
        </ol>
      </div>

      <div className="distribution-footer">
        <span>
          <RevenueIcon size={16} /> 최근 30일 매출
          <strong>₩{formatRevenue(game.finance.rolling30)}</strong>
        </span>
        <span>
          <CalendarIcon size={16} /> 임기 종료
          <strong>
            DAY {CAMPAIGN_END_DAY} · {Math.max(0, CAMPAIGN_END_DAY - game.day)}일 남음
          </strong>
        </span>
        <span>
          <TrendIcon size={16} /> 결산 평가
          <strong>
            자금 여력 · 환경 안정 · 장기 운영 기록을 종합 반영
          </strong>
        </span>
      </div>
    </section>
  );
}

function OverviewCard({ className = "", icon, label, value, note }: { className?: string; icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className={`overview-card ${className}`.trim()}><div className="overview-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReleasesView({
  game,
  releaseDraft,
  guidedTarget,
  onToggle,
  onAdjustmentChange,
  onSubmit,
}: {
  game: GameState;
  releaseDraft: Record<string, PowerAdjustment>;
  guidedTarget?: GuidedReleaseTarget | null;
  onToggle: (optionId: string) => void;
  onAdjustmentChange: (
    optionId: string,
    adjustment: PowerAdjustment,
  ) => void;
  onSubmit: () => void;
}) {
  const slate = game.releaseSlate;
  const selectedCount = Object.keys(releaseDraft).length;

  if (game.phase === "release-edit" && slate) {
    return (
      <section className="subpage release-review-page">
        <div className="subpage-heading">
          <div>
            <span className="eyebrow">DAY {slate.day} · RELEASE REVIEW</span>
            <h1>6개 시안 중 3개를 고르세요</h1>
            <p>신테마 3안과 기존 테마 지원 3안입니다. 선택한 안마다 파워를 7단계로 조정할 수 있습니다.</p>
          </div>
          <div className="cadence-card release-count-card">
            <ReleaseIcon />
            <span>선택 현황</span>
            <strong>{selectedCount} / 3</strong>
          </div>
        </div>

        <div className="release-slate-grid">
          {slate.options.map((option) => {
            const content = THEME_BY_ID[option.themeId];
            const selected = Object.prototype.hasOwnProperty.call(
              releaseDraft,
              option.id,
            );
            const adjustment = releaseDraft[option.id] ?? 0;
            const predictedTier = getExpectedTier(
              option.expectedPower + adjustment * 2.2,
            );
            const directionLabel = option.direction
              ? SUPPORT_DIRECTIONS.find(
                  (candidate) => candidate.value === option.direction,
                )?.label
              : null;

            return (
              <article
                className={selected ? "release-option selected" : "release-option"}
                key={option.id}
                style={{ "--theme-color": content.color } as React.CSSProperties}
              >
                <button
                  aria-pressed={selected}
                  className="release-option-select"
                  data-tutorial-target={
                    guidedTarget?.kind === "option" &&
                    guidedTarget.optionId === option.id
                      ? "active"
                      : undefined
                  }
                  disabled={
                    Boolean(guidedTarget) &&
                    !(
                      guidedTarget?.kind === "option" &&
                      guidedTarget.optionId === option.id
                    )
                  }
                  onClick={() => onToggle(option.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="release-option-watermark">
                    <ThemeEmblem
                      decorative
                      detail="full"
                      size="100%"
                      themeId={content.id}
                    />
                  </span>
                  <span className="release-kind">
                    {option.kind === "new-theme" ? "신테마" : "기존 지원"}
                    {option.requested ? <em>직접 제안</em> : null}
                  </span>
                  <strong>{content.name}</strong>
                  <small>
                    {option.kind === "new-theme"
                      ? content.playstyle
                      : `${directionLabel ?? "지원"} 보강`}
                  </small>
                  <span className="expected-tier">
                    예상 <b>{predictedTier}</b>
                  </span>
                  <span className="selection-state">
                    {selected ? "선택됨" : "시안 선택"}
                  </span>
                </button>

                {selected ? (
                  <fieldset className="power-adjustment">
                    <legend>
                      파워 · {POWER_ADJUSTMENT_LABELS[adjustment]}
                    </legend>
                    <div role="group" aria-label={`${content.name} 파워 조정`}>
                      {POWER_ADJUSTMENTS.map((value) => (
                        <button
                          aria-pressed={adjustment === value}
                          className={adjustment === value ? "active" : ""}
                          data-tutorial-target={
                            guidedTarget?.kind === "adjustment" &&
                            guidedTarget.optionId === option.id &&
                            guidedTarget.adjustment === value
                              ? "active"
                              : undefined
                          }
                          disabled={
                            Boolean(guidedTarget) &&
                            !(
                              guidedTarget?.kind === "adjustment" &&
                              guidedTarget.optionId === option.id &&
                              guidedTarget.adjustment === value
                            )
                          }
                          key={value}
                          onClick={() => onAdjustmentChange(option.id, value)}
                          title={POWER_ADJUSTMENT_LABELS[value]}
                          type="button"
                        >
                          {value > 0 ? `+${value}` : value}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="release-submit-bar">
          <div>
            <strong>{selectedCount === 3 ? "발매 준비 완료" : `${3 - selectedCount}개를 더 선택하세요`}</strong>
            <span>출시 후 선택은 되돌릴 수 없으며 반응 관측은 다음 날 시작됩니다.</span>
          </div>
          <button
            className="primary-action"
            data-sound="release"
            data-tutorial-target={
              guidedTarget?.kind === "submit" ? "active" : undefined
            }
            disabled={
              selectedCount !== 3 ||
              (Boolean(guidedTarget) && guidedTarget?.kind !== "submit")
            }
            onClick={onSubmit}
            type="button"
          >
            3종 발매 확정
          </button>
        </div>
      </section>
    );
  }

  const recentBatches = [...game.releaseHistory].slice(-3).reverse();
  const cooldown =
    game.lastSupportProposalDay === null
      ? 0
      : Math.max(0, 30 - (game.day - game.lastSupportProposalDay));
  return (
    <section className="subpage release-planning-page">
      <div className="subpage-heading">
        <div><span className="eyebrow">RELEASE PIPELINE</span><h1>발매 제안</h1><p>30일마다 신테마 3안과 기존 테마 지원 3안이 도착하며, 그중 3개를 출시합니다.</p></div>
        <div className="cadence-card">
          <ReleaseIcon />
          <span>{game.day >= LAST_RELEASE_DAY ? "발매 일정" : "다음 시안"}</span>
          <strong>
            {game.day >= LAST_RELEASE_DAY
              ? `DAY ${LAST_RELEASE_DAY} 종료`
              : `DAY ${getNextReleaseDay(game.day)}`}
          </strong>
        </div>
      </div>

      <div className="release-rules-grid">
        <article><span>SUPPORT CARD POOL</span><strong>5 → 8 → 11 → 14장</strong><p>초기 5장, 지원마다 준비된 카드 3장 추가</p></article>
        <article><span>MONTHLY SLATE</span><strong>신규 3 + 지원 3</strong><p>6개 중 원하는 조합으로 3개 선택</p></article>
        <article><span>POWER CONTROL</span><strong>-3 ··· +3</strong><p>각 선택안을 7단계로 최종 조정</p></article>
        <article><span>SUPPORT REQUEST</span><strong>{game.day >= LAST_RELEASE_DAY ? "마감" : cooldown > 0 ? `D-${cooldown}` : "제안 가능"}</strong><p>30일에 한 번, 다음 지원 시안 한 자리 보장</p></article>
      </div>

      <section className="recent-releases">
        <div className="section-heading"><div><span className="eyebrow">RECENT</span><h2>최근 발매</h2></div></div>
        {recentBatches.length > 0 ? (
          <div className="recent-release-list">
            {recentBatches.map((batch) => (
              <article key={batch.day}>
                <strong>DAY {batch.day}</strong>
                <div>
                  {batch.products.map((product) => (
                    <span key={product.optionId}>
                      {THEME_BY_ID[product.themeId].shortName}
                      <small>{product.kind === "new-theme" ? "신규" : "지원"} · {product.powerAdjustment > 0 ? "+" : ""}{product.powerAdjustment}</small>
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {game.day >= LAST_RELEASE_DAY
              ? "이번 임기의 정기 발매 일정이 종료되었습니다."
              : `첫 발매 시안은 DAY ${getNextReleaseDay(game.day)}에 도착합니다.`}
          </div>
        )}
      </section>
    </section>
  );
}

function getPostReactionTone(
  event: CommunityEvent,
  body: string,
  profile: ReleaseReactionProfile,
) {
  if (!profile.surge || !profile.themeIds.includes(event.themeId)) return "normal";
  if (/금제|제한|이럴 거면|다시 팔/.test(body)) return "backlash";
  if (/돈|세게|강해|티어 0|Tier 0|폭주/.test(body)) return "greed";
  if (/약해|약하게|안 팔|성능 비워|실망/.test(body)) return "weak";
  if (profile.flags.backlash && !profile.flags.greed && !profile.flags.weak) {
    return "backlash";
  }
  if (profile.flags.greed && !profile.flags.weak) return "greed";
  if (profile.flags.weak && !profile.flags.greed) return "weak";
  return "hot";
}

function CommunityView({
  game,
  guidedInspection = false,
  flashDay,
  onFlashComplete,
  onSelectTheme,
}: {
  game: GameState;
  guidedInspection?: boolean;
  flashDay: number | null;
  onFlashComplete: () => void;
  onSelectTheme: (themeId: ThemeId, partId?: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const safeDay = selectedDay === null
    ? game.day
    : Math.max(1, Math.min(game.day, selectedDay));
  const posts = getDailyCommunityPosts(game, safeDay);
  const profile = getReleaseReactionProfile(game, safeDay);
  const heat = getCommunityHeat(game, safeDay);
  const releaseDecisionToday = game.releaseHistory.some((batch) => batch.day === safeDay);
  const restrictionDecisionToday =
    isBanDay(safeDay) &&
    (safeDay < game.day || game.phase !== "ban-edit");
  const restrictionPostCount = posts.filter(
    (event) => event.category === "restriction",
  ).length;
  const relaxedRestriction = posts.find(
    (event) =>
      event.category === "restriction" &&
      typeof event.previousValue === "number" &&
      typeof event.value === "number" &&
      event.previousValue < event.value,
  );
  const showBanAftermath =
    !restrictionDecisionToday && restrictionPostCount > posts.length / 2;
  const showReleaseSurge = profile.surge && !releaseDecisionToday;
  const visibleProfile = showReleaseSurge
    ? profile
    : { ...profile, surge: false };
  const shouldFlash =
    flashDay === safeDay && (showReleaseSurge || showBanAftermath);
  const categoryLabels: Record<CommunityEvent["category"], string> = {
    meta: "메타 토론",
    counter: "덱 연구소",
    release: "신제품 게시판",
    restriction: "금제 게시판",
    finance: "시세 게시판",
  };

  useEffect(() => {
    if (!shouldFlash) return;
    const timer = window.setTimeout(onFlashComplete, 980);
    return () => window.clearTimeout(timer);
  }, [onFlashComplete, shouldFlash]);

  const hasIdentityConflict = posts.some((event) =>
    /테세우스|기존 카드.*빠|구축.*갈아|상위 호환/.test(
      event.body || formatCommunityEvent(event, game),
    ),
  );
  const reactionChips = [
    profile.flags.backlash ? { tone: "backlash", label: "금제 직후 지원 반발" } : null,
    profile.flags.greed ? { tone: "greed", label: "과성능·판매 논란" } : null,
    profile.flags.weak ? { tone: "weak", label: "저성능·상품성 불만" } : null,
    hasIdentityConflict
      ? { tone: "identity", label: "구축 정체성 논쟁" }
      : null,
  ].filter((chip): chip is { tone: string; label: string } => chip !== null);

  if (showReleaseSurge && reactionChips.length === 0) {
    reactionChips.push({ tone: "balanced", label: "성능 평가 과열" });
  }

  return (
    <section
      className={`subpage community-page intensity-${profile.intensity}${
        showReleaseSurge ? " is-release-surge" : ""
      }${showBanAftermath ? " is-ban-aftermath" : ""
      }${shouldFlash ? " is-impact-flashing" : ""}`}
      data-tutorial-inspection={guidedInspection ? "active" : undefined}
      data-tutorial-target={guidedInspection ? "active" : undefined}
      tabIndex={guidedInspection ? -1 : undefined}
    >
      {shouldFlash ? <div aria-hidden="true" className="community-impact-flash" /> : null}
      <div className="subpage-heading">
        <div>
          <span className="eyebrow">COMMUNITY FEED</span>
          <h1>커뮤니티</h1>
          <p>매일 20개의 글이 올라옵니다. 발매 직후에는 반응이 한꺼번에 폭발합니다.</p>
        </div>
        <div className="community-day-controls" aria-label="게시글 날짜">
          <button disabled={safeDay <= 1} onClick={() => setSelectedDay(safeDay - 1)} type="button">← 이전 날</button>
          <strong>DAY {safeDay}</strong>
          <button disabled={safeDay >= game.day} onClick={() => setSelectedDay(safeDay + 1 >= game.day ? null : safeDay + 1)} type="button">다음 날 →</button>
          <button disabled={safeDay === game.day} onClick={() => setSelectedDay(null)} type="button">오늘</button>
        </div>
      </div>

      {releaseDecisionToday || restrictionDecisionToday ? (
        <div className={`community-observation-hold${restrictionDecisionToday ? " restriction" : ""}`} role="status">
          <LotusSymbol tone={restrictionDecisionToday ? "caution" : "info"} />
          <div>
            <span>LOTUS OBSERVATION HOLD</span>
            <strong>{restrictionDecisionToday ? "반응 관측은 내일부터 시작됩니다." : "관측은 다음 날부터 시작됩니다."}</strong>
          </div>
        </div>
      ) : null}

      {showBanAftermath ? (
        <section
          aria-label={`${relaxedRestriction ? "금제 해제 후폭풍" : "금제 후폭풍"}, 금제 관련 게시글 ${restrictionPostCount}개`}
          className={`restriction-reaction-strip${relaxedRestriction ? " is-relaxation" : ""}${shouldFlash ? " is-new" : ""}`}
        >
          <LotusSymbol tone="caution" />
          <div className="restriction-reaction-copy">
            <span>LOTUS · RESTRICTION AFTERMATH</span>
            <div className="restriction-reaction-title">
              <strong>{relaxedRestriction ? "금제 해제 후폭풍" : "금제 후폭풍"}</strong>
              {relaxedRestriction ? (
                <span className="restriction-relaxation-chip">
                  제한 완화 · {relaxedRestriction.previousValue}→{relaxedRestriction.value}
                </span>
              ) : null}
            </div>
            <p>오늘 20개 글 가운데 금제 관련 반응이 {restrictionPostCount}개입니다.</p>
          </div>
          <div className="restriction-reaction-meter">
            <span>반응 점유 {restrictionPostCount} / {posts.length}</span>
            <i aria-hidden="true"><b style={{ width: `${(restrictionPostCount / posts.length) * 100}%` }} /></i>
          </div>
        </section>
      ) : null}

      {showReleaseSurge ? (
        <section
          aria-label={`신제품 커뮤니티 반응, 열기 ${heat}점`}
          className="release-reaction-strip"
        >
          <div className="reaction-headline">
            <span>{profile.age === 0 ? "RELEASE SHOCK" : `RELEASE D+${profile.age}`}</span>
            <strong>{profile.headline || "신제품 평가가 빠르게 확산 중"}</strong>
          </div>
          <div className="reaction-heat">
            <div>
              <span>커뮤니티 열기</span>
              <strong>{heat}</strong>
            </div>
            <span
              aria-label={`커뮤니티 열기 ${heat} / 100`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={heat}
              className="reaction-heat-track"
              role="meter"
            >
              <i style={{ width: `${heat}%` }} />
            </span>
          </div>
          <div className="reaction-chips" aria-label="주요 반응">
            {reactionChips.map((chip) => (
              <span className={chip.tone} key={chip.tone}>{chip.label}</span>
            ))}
          </div>
        </section>
      ) : null}

      <div className={`feed-list daily-feed${shouldFlash ? " is-staggered" : ""}`}>
        {posts.map((event, index) => {
          const body = event.body || formatCommunityEvent(event, game);
          const reactionTone = getPostReactionTone(event, body, visibleProfile);
          const isRestrictionWave =
            showBanAftermath && event.category === "restriction";
          const theme = THEME_BY_ID[event.themeId];
          const part = event.partId
            ? theme.parts.find((candidate) => candidate.id === event.partId)
            : null;
          return (
            <button
              aria-disabled={guidedInspection || undefined}
              className={`feed-post reaction-${reactionTone}${isRestrictionWave ? " restriction-wave" : ""}`}
              key={event.id}
              onClick={() => {
                if (!guidedInspection) onSelectTheme(event.themeId, event.partId);
              }}
              style={{ "--post-index": index } as React.CSSProperties}
              type="button"
            >
              <span className={`feed-category ${event.category}`}>{categoryLabels[event.category]}</span>
              <div>
                <strong>{body}</strong>
                <p>{theme.name}{part ? ` · ${part.name}` : ""}</p>
              </div>
              <time>DAY {event.day}</time>
              <ChevronIcon />
            </button>
          );
        })}
      </div>
      <div className="daily-feed-summary">
        <MessageIcon size={14} />
        <span>DAY {safeDay} 게시글 20개</span>
        <span className={`community-heat-summary heat-${profile.intensity}`}>열기 {heat}</span>
        <strong>{safeDay} / {game.day}</strong>
      </div>
    </section>
  );
}

type FinanceChartDatum = {
  day: number;
  revenue: number;
  cash: number | null;
  environmentHealth: number | null;
  purchaseTrust: number | null;
  communitySentiment: number | null;
  communityPositive: number | null;
  communityNeutral: number | null;
  communityNegative: number | null;
  release: boolean;
  ban: boolean;
  releaseAge: number | null;
};

function getFinanceChartData(game: GameState): FinanceChartDatum[] {
  // Decision days do not receive a history row until the release/ban is
  // submitted. Using the undated rolling revenue buffer here would shift the
  // previous day's value onto an unresolved decision day.
  const rows = game.history
    .filter((entry) => entry.day <= game.day)
    .slice(-90);
  const latestEntry = rows.at(-1);
  const latestRecordedDay = latestEntry?.day;
  const liveSentiment =
    latestRecordedDay === game.day &&
      typeof latestEntry?.communitySentiment !== "number"
    ? getDailyCommunitySentiment(game, game.day)
    : null;
  const liveEnvironmentHealth = getBusinessEnvironmentHealth(game);

  return rows.map((entry) => {
    const isLatest = entry.day === latestRecordedDay;
    const isCurrentDay = entry.day === game.day;
    const communityPositive = typeof entry.communityPositive === "number"
      ? entry.communityPositive
      : isLatest && liveSentiment
        ? liveSentiment.positive
        : null;
    const communityNegative = typeof entry.communityNegative === "number"
      ? entry.communityNegative
      : isLatest && liveSentiment
        ? liveSentiment.negative
        : null;
    return {
      day: entry.day,
      revenue: entry.revenue,
      cash:
        typeof entry.cash === "number"
          ? entry.cash
          : isCurrentDay
            ? game.finance.cash
            : null,
      environmentHealth:
        getChartEnvironmentHealth(
          entry,
          isLatest,
          liveEnvironmentHealth,
        ),
      purchaseTrust:
        typeof entry.purchaseTrust === "number"
          ? entry.purchaseTrust
          : isCurrentDay
            ? game.purchaseTrust
            : null,
      communitySentiment: typeof entry.communitySentiment === "number"
        ? entry.communitySentiment
        : isLatest && liveSentiment
          ? liveSentiment.index
          : null,
      communityPositive,
      communityNeutral:
        communityPositive !== null && communityNegative !== null
          ? Math.max(0, 20 - communityPositive - communityNegative)
          : null,
      communityNegative,
      release: game.releaseHistory.some((batch) => batch.day === entry.day),
      ban: isBanDay(entry.day),
      releaseAge: getReleaseAge(game, entry.day),
    };
  });
}

function communitySentimentLabel(index: number): string {
  if (index >= 80) return "매우 긍정";
  if (index >= 60) return "긍정";
  if (index > 40) return "중립";
  if (index > 20) return "부정";
  return "매우 부정";
}

function FinanceMarketChart({ game }: { game: GameState }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const data = useMemo(() => getFinanceChartData(game), [game]);
  const width = 1200;
  const height = 310;
  const left = 94;
  const right = 68;
  const top = 38;
  const plotBottom = 266;
  const plotWidth = width - left - right;
  const maxAmount = Math.max(
    0.1,
    ...data.flatMap((point) => [point.revenue, point.cash ?? 0]),
  ) * 1.08;
  const xForIndex = (index: number) =>
    data.length <= 1
      ? left + plotWidth / 2
      : left + (index / (data.length - 1)) * plotWidth;
  const yForAmount = (value: number) =>
    top + ((maxAmount - Math.max(0, value)) / maxAmount) * (plotBottom - top);
  const yForScore = (value: number) =>
    top + ((100 - Math.max(0, Math.min(100, value))) / 100) * (plotBottom - top);
  const basePoints = data.map((point, index) => {
    const previous = index > 0 ? data[index - 1] : null;
    const revenueChangeRate =
      !previous || previous.revenue <= 0
        ? 0
        : ((point.revenue - previous.revenue) / previous.revenue) * 100;
    const environmentDelta =
      previous?.environmentHealth !== null &&
      previous?.environmentHealth !== undefined &&
      point.environmentHealth !== null
        ? point.environmentHealth - previous.environmentHealth
        : null;
    const trustDelta =
      previous?.purchaseTrust !== null &&
      previous?.purchaseTrust !== undefined &&
      point.purchaseTrust !== null
        ? point.purchaseTrust - previous.purchaseTrust
        : null;
    const sentimentDelta =
      previous?.communitySentiment !== null &&
      previous?.communitySentiment !== undefined &&
      point.communitySentiment !== null
        ? point.communitySentiment - previous.communitySentiment
        : null;
    const isSurge =
      getRevenueChangeSignal(
        revenueChangeRate,
        point.releaseAge,
        previous ? point.day - previous.day : 0,
      ) === "surge";
    return {
      ...point,
      x: xForIndex(index),
      revenueY: yForAmount(point.revenue),
      revenueChangeRate,
      environmentDelta,
      trustDelta,
      sentimentDelta,
      isSurge,
    };
  });
  const points = basePoints.map((point, index) => {
    const next = basePoints[index + 1];
    const divergenceLag = getMarketDivergenceLag(
      point.isSurge,
      point.environmentDelta,
      point.trustDelta,
      next?.environmentDelta ?? null,
      next?.trustDelta ?? null,
      next ? next.day - point.day : 0,
    );
    return {
      ...point,
      divergence: divergenceLag !== null,
      divergenceLag,
    };
  });
  const getSeriesPath = (
    getValue: (point: (typeof points)[number]) => number | null,
    getY: (value: number) => number,
  ) => {
    let path = "";
    let drawing = false;
    for (const point of points) {
      const value = getValue(point);
      if (value === null) {
        drawing = false;
        continue;
      }
      path += `${drawing ? " L" : " M"} ${point.x} ${getY(value)}`;
      drawing = true;
    }
    return path;
  };
  const revenueAreaPath = points.length
    ? `M ${points.map((point) => `${point.x} ${point.revenueY}`).join(" L ")} L ${points.at(-1)?.x} ${plotBottom} L ${points[0].x} ${plotBottom} Z`
    : "";
  const environmentPath = getSeriesPath(
    (point) => point.environmentHealth,
    yForScore,
  );
  const trustPath = getSeriesPath((point) => point.purchaseTrust, yForScore);
  const cashPath = getSeriesPath((point) => point.cash, yForAmount);
  const sentimentPath = getSeriesPath(
    (point) => point.communitySentiment,
    yForScore,
  );
  const hoveredPoint = points.find((point) => point.day === hoveredDay) ?? null;
  const amountTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      y: top + ratio * (plotBottom - top),
      value: maxAmount * (1 - ratio),
    };
  });
  const scoreTicks = [100, 75, 50, 25, 0].map((value) => ({
    value,
    y: yForScore(value),
  }));
  const displayedDays = new Set(
    [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => points[Math.round((points.length - 1) * ratio)])
      .filter((point): point is (typeof points)[number] => Boolean(point))
      .map((point) => point.day),
  );
  const divergencePoints = points.filter((point) => point.divergence);
  const scoredRows = data.filter(
    (point) =>
      point.environmentHealth !== null && point.purchaseTrust !== null,
  ).length;
  const lastEnvironmentPoint = [...points]
    .reverse()
    .find((point) => point.environmentHealth !== null);
  const lastTrustPoint = [...points]
    .reverse()
    .find((point) => point.purchaseTrust !== null);
  const lastCashPoint = [...points]
    .reverse()
    .find((point) => point.cash !== null);
  const lastSentimentPoint = [...points]
    .reverse()
    .find((point) => point.communitySentiment !== null);

  if (points.length === 0) {
    return <div className="finance-chart-empty">일별 시장 기록을 준비하고 있습니다.</div>;
  }

  return (
    <section className="finance-chart-card" aria-labelledby="finance-chart-title">
      <header className="finance-chart-toolbar">
        <div>
          <span>MAX 90 DAY MARKET VIEW · {data.length} DAYS</span>
          <strong id="finance-chart-title">매출과 시장·여론 신호</strong>
        </div>
        <div className="finance-chart-legend" aria-label="차트 범례">
          <span className="revenue">매출 상승/하락</span>
          <span className="cash">보유자금</span>
          <span className="health">생태계 건강</span>
          <span className="trust">구매 신뢰</span>
          <span className="sentiment">커뮤니티 여론 · 50 중립</span>
          <span className="divergence">매출·환경 역행</span>
          <span className="event">R 발매 · B 금제</span>
        </div>
      </header>

      <div className={`finance-chart-insight${divergencePoints.length > 0 ? " alert" : ""}`}>
        <strong>
          {divergencePoints.length > 0
            ? `매출 급등과 환경 하락이 겹친 구간 ${divergencePoints.length}곳`
            : "현재 기록에서는 매출 급등과 환경 하락의 역행이 없습니다."}
        </strong>
        <span>
          {scoredRows >= 2
            ? `${lastSentimentPoint?.communitySentiment !== null && lastSentimentPoint?.communitySentiment !== undefined ? `현재 여론 ${Math.round(lastSentimentPoint.communitySentiment)}점 · ${communitySentimentLabel(lastSentimentPoint.communitySentiment)}. ` : ""}돈이 오를 때 건강·신뢰·여론이 함께 버티는지 확인하세요.`
            : "기존 세이브의 건강·신뢰·여론 이력은 오늘부터 누적됩니다."}
        </span>
      </div>

      <div className="finance-chart-stage" onPointerLeave={() => setHoveredDay(null)}>
        <svg
          aria-describedby="finance-chart-description"
          className="finance-market-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>최대 90일 매출, 보유자금, 생태계 건강, 구매 신뢰, 커뮤니티 여론 비교</title>
          <desc id="finance-chart-description">
            왼쪽 금액 축에는 일매출과 보유자금, 오른쪽 0에서 100점 축에는 생태계 건강, 구매 신뢰와 커뮤니티 여론을 표시합니다. 여론은 50점이 중립이며 높을수록 긍정적입니다. 붉은 음영은 매출 급등 당일이나 다음 날 환경 지표가 하락한 구간입니다.
          </desc>
          <defs>
            <linearGradient id="revenue-area-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#2f68ae" stopOpacity="0.18" />
              <stop offset="1" stopColor="#2f68ae" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="divergence-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c9443a" stopOpacity="0.22" />
              <stop offset="1" stopColor="#c9443a" stopOpacity="0.035" />
            </linearGradient>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="sentiment-line-gradient"
              x1="0"
              x2="0"
              y1={top}
              y2={plotBottom}
            >
              <stop offset="0" stopColor="#25866b" />
              <stop offset="0.5" stopColor="#707b8c" />
              <stop offset="1" stopColor="#c9443a" />
            </linearGradient>
          </defs>

          <text className="finance-axis-title amount" x={left} y={17}>금액 · 억원</text>
          <text className="finance-axis-title score" textAnchor="end" x={width - right} y={17}>시장·여론 지수 · 0–100</text>

          <g className="finance-sentiment-neutral" aria-hidden="true">
            <line x1={left} x2={width - right} y1={yForScore(50)} y2={yForScore(50)} />
            <text textAnchor="end" x={width - right - 7} y={yForScore(50) - 6}>여론 중립 50</text>
          </g>

          {amountTicks.map((tick) => (
            <g className="finance-grid-line" key={`amount-${tick.y}`}>
              <line x1={left} x2={width - right} y1={tick.y} y2={tick.y} />
              <text x={left - 10} y={tick.y + 4}>{formatRevenue(tick.value)}</text>
            </g>
          ))}
          {scoreTicks.map((tick) => (
            <g className="finance-score-tick" key={`score-${tick.value}`}>
              <line x1={width - right} x2={width - right + 5} y1={tick.y} y2={tick.y} />
              <text x={width - right + 11} y={tick.y + 4}>{tick.value}</text>
            </g>
          ))}

          {divergencePoints.map((point) => {
            const index = points.indexOf(point);
            const adjacent = point.divergenceLag === 1
              ? points[index + 1]
              : points[Math.max(0, index - 1)];
            const x = point.divergenceLag === 1
              ? point.x
              : (adjacent?.x ?? point.x - 5);
            const endX = point.divergenceLag === 1
              ? (adjacent?.x ?? point.x + 5)
              : point.x;
            return (
              <rect
                className="finance-divergence-band"
                height={plotBottom - top}
                key={`divergence-${point.day}`}
                width={Math.max(6, endX - x)}
                x={x}
                y={top}
              />
            );
          })}

          <path className="revenue-area" d={revenueAreaPath} />
          {points.slice(1).map((point, index) => {
            const previous = points[index];
            const rising = point.revenue >= previous.revenue;
            return (
              <line
                className={`revenue-segment ${rising ? "up" : "down"}`}
                key={`revenue-${previous.day}-${point.day}`}
                x1={previous.x}
                x2={point.x}
                y1={previous.revenueY}
                y2={point.revenueY}
              />
            );
          })}
          {cashPath ? <path className="finance-series cash-series" d={cashPath} /> : null}
          {environmentPath ? (
            <path className="finance-series health-series" d={environmentPath} />
          ) : null}
          {trustPath ? <path className="finance-series trust-series" d={trustPath} /> : null}
          {sentimentPath ? (
            <path className="finance-series sentiment-series" d={sentimentPath} />
          ) : null}

          {points.filter((point) => point.release || point.ban).map((point) => (
            <g
              className={`finance-event-marker ${point.release ? "release" : "ban"}`}
              key={`event-${point.day}`}
            >
              <line x1={point.x} x2={point.x} y1={top} y2={plotBottom} />
              <circle cx={point.x} cy={22} r={12} />
              <text x={point.x} y={26}>{point.release ? "R" : "B"}</text>
            </g>
          ))}

          {divergencePoints.map((point) => (
            <g className="finance-divergence-marker" key={`warning-${point.day}`}>
              <circle cx={point.x} cy={top + 14} r={10} />
              <text x={point.x} y={top + 18}>!</text>
            </g>
          ))}

          {lastEnvironmentPoint?.environmentHealth !== null &&
          lastEnvironmentPoint?.environmentHealth !== undefined ? (
            <circle
              className="finance-endpoint health"
              cx={lastEnvironmentPoint.x}
              cy={yForScore(lastEnvironmentPoint.environmentHealth)}
              r={5}
            />
          ) : null}
          {lastCashPoint?.cash !== null && lastCashPoint?.cash !== undefined ? (
            <circle
              className="finance-endpoint cash"
              cx={lastCashPoint.x}
              cy={yForAmount(lastCashPoint.cash)}
              r={5}
            />
          ) : null}
          {lastTrustPoint?.purchaseTrust !== null &&
          lastTrustPoint?.purchaseTrust !== undefined ? (
            <circle
              className="finance-endpoint trust"
              cx={lastTrustPoint.x}
              cy={yForScore(lastTrustPoint.purchaseTrust)}
              r={5}
            />
          ) : null}
          {lastSentimentPoint?.communitySentiment !== null &&
          lastSentimentPoint?.communitySentiment !== undefined ? (
            <circle
              className={`finance-endpoint sentiment ${
                lastSentimentPoint.communitySentiment >= 60
                  ? "positive"
                  : lastSentimentPoint.communitySentiment <= 40
                    ? "negative"
                    : "neutral"
              }`}
              cx={lastSentimentPoint.x}
              cy={yForScore(lastSentimentPoint.communitySentiment)}
              r={5}
            />
          ) : null}

          {points.map((point, index) => (
            <g
              aria-label={[
                `DAY ${point.day}`,
                `매출 ${formatRevenue(point.revenue)}`,
                `보유자금 ${point.cash === null ? "기록 없음" : formatRevenue(point.cash)}`,
                `생태계 건강 ${point.environmentHealth === null ? "기록 없음" : Math.round(point.environmentHealth)}`,
                `구매 신뢰 ${point.purchaseTrust === null ? "기록 없음" : Math.round(point.purchaseTrust)}`,
                point.communitySentiment === null
                  ? "커뮤니티 여론 기록 없음"
                  : `커뮤니티 여론 ${Math.round(point.communitySentiment)}점, ${communitySentimentLabel(point.communitySentiment)}${point.sentimentDelta === null ? "" : `, 전일 대비 ${point.sentimentDelta >= 0 ? "+" : ""}${point.sentimentDelta.toFixed(0)}점`}${point.communityPositive === null || point.communityNegative === null ? "" : `, 긍정 ${point.communityPositive}개, 부정 ${point.communityNegative}개`}`,
                point.divergence ? "매출과 환경 역행 감지" : "",
              ].filter(Boolean).join(", ")}
              className="finance-hit-zone"
              key={`hit-${point.day}`}
              onBlur={() =>
                setHoveredDay((current) => current === point.day ? null : current)
              }
              onFocus={() => setHoveredDay(point.day)}
              onPointerEnter={() => setHoveredDay(point.day)}
              tabIndex={0}
            >
              <rect
                height={plotBottom - top + 12}
                width={Math.max(12, plotWidth / Math.max(1, points.length - 1))}
                x={point.x - Math.max(6, plotWidth / Math.max(2, points.length * 2))}
                y={top - 6}
              />
              <circle
                className={
                  index === 0 || point.revenue >= points[index - 1].revenue
                    ? "up"
                    : "down"
                }
                cx={point.x}
                cy={point.revenueY}
                r={4.5}
              />
            </g>
          ))}

          {points.filter((point) => displayedDays.has(point.day)).map((point) => (
            <text
              className="finance-axis-day"
              key={`axis-${point.day}`}
              textAnchor="middle"
              x={point.x}
              y={298}
            >
              DAY {point.day}
            </text>
          ))}

          {hoveredPoint ? (() => {
            const tooltipWidth = 390;
            const tooltipHeight = hoveredPoint.divergence ? 229 : 197;
            const tooltipX =
              hoveredPoint.x > width / 2
                ? Math.max(left, hoveredPoint.x - tooltipWidth - 14)
                : Math.min(width - right - tooltipWidth, hoveredPoint.x + 14);
            const tooltipY = Math.max(
              top + 3,
              Math.min(height - tooltipHeight - 5, hoveredPoint.revenueY - 44),
            );
            return (
              <g className="finance-chart-tooltip" aria-hidden="true">
                <line
                  x1={hoveredPoint.x}
                  x2={hoveredPoint.x}
                  y1={top}
                  y2={plotBottom}
                />
                <rect
                  height={tooltipHeight}
                  rx={7}
                  width={tooltipWidth}
                  x={tooltipX}
                  y={tooltipY}
                />
                <text className="tooltip-day" x={tooltipX + 18} y={tooltipY + 28}>
                  DAY {hoveredPoint.day}
                </text>
                <text x={tooltipX + 18} y={tooltipY + 59}>
                  매출 <tspan>₩{formatRevenue(hoveredPoint.revenue)}</tspan>
                </text>
                <text x={tooltipX + 18} y={tooltipY + 90}>
                  보유자금 <tspan>{hoveredPoint.cash === null ? "기록 없음" : `₩${formatRevenue(hoveredPoint.cash)}`}</tspan>
                </text>
                <text x={tooltipX + 18} y={tooltipY + 121}>
                  생태계 건강 <tspan>{hoveredPoint.environmentHealth === null ? "기록 없음" : `${Math.round(hoveredPoint.environmentHealth)}점`}</tspan>
                </text>
                <text x={tooltipX + 18} y={tooltipY + 152}>
                  구매 신뢰 <tspan>{hoveredPoint.purchaseTrust === null ? "기록 없음" : `${Math.round(hoveredPoint.purchaseTrust)}점`}</tspan>
                </text>
                <text x={tooltipX + 18} y={tooltipY + 183}>
                  커뮤니티 여론 <tspan>{hoveredPoint.communitySentiment === null
                    ? "기록 없음"
                    : `${Math.round(hoveredPoint.communitySentiment)}점 · ${communitySentimentLabel(hoveredPoint.communitySentiment)}${hoveredPoint.communityPositive === null || hoveredPoint.communityNegative === null ? "" : ` · 긍 ${hoveredPoint.communityPositive} / 부 ${hoveredPoint.communityNegative}`}`}</tspan>
                </text>
                {hoveredPoint.divergence ? (
                  <text className="tooltip-alert" x={tooltipX + 18} y={tooltipY + 215}>
                    매출 +{hoveredPoint.revenueChangeRate.toFixed(1)}% · {hoveredPoint.divergenceLag === 1 ? "D+1 " : ""}환경 지표 하락
                  </text>
                ) : null}
              </g>
            );
          })() : null}
        </svg>
      </div>
    </section>
  );
}


function OperationsView({
  game,
  guided = false,
  guidedActionTarget = null,
  onRunAction,
}: {
  game: GameState;
  guided?: boolean;
  guidedActionTarget?: BusinessActionType | null;
  onRunAction: (action: BusinessActionType) => void;
}) {
  const environmentHealth = getBusinessEnvironmentHealth(game);
  const monthlyOperatingCost = getMonthlyOperatingCost(totalUsers(game));
  const isTodayRecorded = game.history.at(-1)?.day === game.day;
  const operatingDayLabel = isTodayRecorded
    ? "오늘"
    : `DAY ${game.history.at(-1)?.day ?? game.day}`;
  const environmentLabel = environmentHealth >= CAMPAIGN_ENVIRONMENT_STABLE_MIN
    ? "안정"
    : environmentHealth >= 50
      ? "주의"
      : "위험";
  const records = [...game.operations.records].reverse();
  const eventRecords = [...game.operations.eventRecords].reverse();
  const activeRecords = records.filter(
    (record) =>
      record.outcome === "pending" ||
      isBusinessActionEffectActive(record, game.day) ||
      (record.startedDay === game.day &&
        (record.outcome === "active" ||
          record.outcome === "success" ||
          record.outcome === "backlash")),
  );
  const pendingEventResults = eventRecords.filter(
    (record) => record.outcome === "pending",
  );
  const recentDecisions = [
    ...records.map((record) => ({
      kind: "action" as const,
      day: record.startedDay,
      record,
    })),
    ...eventRecords.map((record) => ({
      kind: "event" as const,
      day: record.appearedDay,
      record,
    })),
  ]
    .sort((left, right) => right.day - left.day)
    .slice(0, 8);

  return (
    <section className="subpage operations-page">
      <div className="subpage-heading operations-heading">
        <div>
          <span className="eyebrow">BUSINESS OPERATIONS</span>
          <h1>사업 운영</h1>
          <p>운영자금을 집행해 발매 사이의 유입·구매·신뢰 흐름을 설계합니다.</p>
        </div>
        <div className="cadence-card operations-cadence">
          <ClockIcon />
          <span>집행 주기</span>
          <strong>하루 1회 · 액션별 쿨다운</strong>
        </div>
      </div>

      <div className="operations-kpis">
        <OverviewCard
          className="primary"
          icon={<RevenueIcon />}
          label="보유 운영자금"
          note={`월 예상 운영비 ₩${formatRevenue(monthlyOperatingCost)}`}
          value={`₩${formatRevenue(game.finance.cash)}`}
        />
        <OverviewCard
          icon={<TrendIcon />}
          label={`${operatingDayLabel} 순운영 현금`}
          note={isTodayRecorded
            ? game.day < OPERATING_COST_START_DAY
              ? `운영비는 DAY ${OPERATING_COST_START_DAY}부터 매일 정산`
              : `매출 32% − 운영비 ₩${formatRevenue(game.finance.todayOperatingCost)} − 집행비`
            : "오늘 결정 제출 후 정산"}
          value={formatSignedRevenue(game.finance.todayOperatingCash)}
        />
        <OverviewCard
          icon={<GavelIcon />}
          label="구매 신뢰"
          note="광고보다 오래 남는 구매 기반"
          value={`${Math.round(game.purchaseTrust)} / 100`}
        />
        <OverviewCard
          icon={<UsersIcon />}
          label="환경 건강"
          note="챔피언십 흥행 위험 판정 기준"
          value={`${Math.round(environmentHealth)} · ${environmentLabel}`}
        />
      </div>

      <div className="operations-workspace">
        <section className="operations-action-panel" aria-labelledby="business-actions-title">
          <div className="operations-section-heading">
            <div>
              <span className="eyebrow">ACTION DESK</span>
              <h2 id="business-actions-title" tabIndex={-1}>
                집행 가능한 사업 액션
              </h2>
            </div>
            <span>비용 단위 · 원</span>
          </div>
          <div className="business-action-grid">
            {BUSINESS_ACTIONS.map((action) => {
              const availability = getBusinessActionAvailability(
                game,
                action.type,
              );
              const latest = records.find(
                (record) => record.type === action.type,
              );
              const risk = action.type === "championship"
                ? getChampionshipBacklashRisk(game)
                : action.type === "pack-odds"
                  ? getPackOddsDetectionRisk(game)
                  : isStrategicBusinessAction(action.type)
                    ? getStrategicProjectRiskProfile(game, action.type).risk
                  : null;
              const projectedOutcome = action.type === "championship"
                ? "success"
                : "active";
              const hasDirectRevenue = getBusinessActionDailyGrossRevenue(
                game,
                action.type,
                projectedOutcome,
              ) > 0;
              const projectedDirectGrossRevenue =
                getBusinessActionProjectedDirectGrossRevenue(
                  game,
                  action.type,
                  projectedOutcome,
                );
              const projectedDirectCash = getBusinessActionProjectedDirectCash(
                game,
                action.type,
                projectedOutcome,
              );
              const strategicSlotUsed =
                isStrategicBusinessAction(action.type) &&
                game.operations.records.some((record) =>
                  isStrategicBusinessAction(record.type)
                );
              const guidedLocked = guided && guidedActionTarget !== action.type;
              const reason = guidedLocked
                ? "인수인계에서는 강조된 액션만 집행할 수 있습니다."
                : availability.reason;
              const descriptionId = `business-action-${action.type}-status`;
              return (
                <article
                  className={`business-action-card tone-${action.tone}${
                    latest &&
                    (latest.outcome === "pending" ||
                      isBusinessActionEffectActive(latest, game.day))
                      ? " is-running"
                      : ""
                  }`}
                  key={action.type}
                >
                  <div className="business-action-title">
                    <span>{action.kicker}</span>
                    <strong>{action.title}</strong>
                    <small>{action.summary}</small>
                  </div>
                  <dl className="business-action-facts">
                    <div><dt>비용</dt><dd>₩{formatRevenue(action.cost)}</dd></div>
                    <div><dt>효과 기간</dt><dd>{action.duration}일</dd></div>
                    <div>
                      <dt>{"oncePerCampaign" in action && action.oncePerCampaign ? "집행 한도" : "쿨다운"}</dt>
                      <dd>{"oncePerCampaign" in action && action.oncePerCampaign ? "임기 1회" : `${action.cooldown}일`}</dd>
                    </div>
                  </dl>
                  <p className="business-action-effect">{action.effect}</p>
                  {hasDirectRevenue ? (
                    <div className="business-action-return">
                      <span>
                        {action.type === "championship"
                          ? "흥행 시 추가 현금(추정)"
                          : "현재 조건 추가 현금(추정)"}
                      </span>
                      <strong>{formatSignedRevenue(projectedDirectCash)}</strong>
                      <small>
                        추가 직접매출 ₩{formatRevenue(projectedDirectGrossRevenue)} · {action.type === "championship"
                          ? "유저 성장 제외"
                          : `행사 합계 일 ₩${formatRevenue(BUSINESS_ACTION_DAILY_REVENUE_CAP)} 상한`}
                      </small>
                    </div>
                  ) : null}
                  <div className={`business-action-risk ${action.tone}`}>
                    <span>{risk === null ? "직접 위험" : action.type === "pack-odds" ? "현재 적발 위험" : isStrategicBusinessAction(action.type) ? "현재 실패 위험" : "현재 역풍 위험"}</span>
                    <strong>{risk === null ? action.tone === "safe" ? "매우 낮음" : "낮음" : `${Math.round(risk * 100)}%`}</strong>
                    {risk !== null ? (
                      <i aria-hidden="true"><span style={{ width: `${risk * 100}%` }} /></i>
                    ) : null}
                  </div>
                  <div className="business-action-footer">
                    <small id={descriptionId}>
                      {reason
                        ? reason
                        : latest
                          ? `최근 DAY ${latest.startedDay} · ${getBusinessRecordStatus(latest, game.day)}`
                          : "집행 이력 없음 · 오늘 실행 가능"}
                    </small>
                    <button
                      aria-describedby={descriptionId}
                      className={action.tone === "danger" ? "danger-action" : "primary-action"}
                      data-tutorial-target={
                        guidedActionTarget === action.type ? "active" : undefined
                      }
                      disabled={!availability.available || guidedLocked}
                      onClick={() => onRunAction(action.type)}
                      type="button"
                    >
                      {strategicSlotUsed
                        ? "슬롯 사용됨"
                        : availability.cooldownRemaining > 0
                        ? `D-${availability.cooldownRemaining}`
                        : action.type === "pack-odds"
                          ? "위험 확인 · 예약"
                          : isStrategicBusinessAction(action.type)
                            ? "위험 확인 · 집행"
                          : "집행"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="operations-ledger" aria-label="사업 액션 진행 및 최근 기록">
          <section className="operations-active-records">
            <div className="operations-section-heading compact">
              <div>
                <span className="eyebrow">IN PROGRESS</span>
                <h2>진행 중</h2>
              </div>
              <span>{activeRecords.length + pendingEventResults.length}건</span>
            </div>
            {activeRecords.length + pendingEventResults.length > 0 ? (
              <div className="operations-record-list active">
                {activeRecords.map((record) => {
                  const definition = BUSINESS_ACTION_BY_TYPE[record.type];
                  const progress = getBusinessRecordProgress(record, game.day);
                  return (
                    <article className={`operations-record outcome-${record.outcome}`} key={record.id}>
                      <div><strong>{definition.title}</strong><span>{getBusinessRecordStatus(record, game.day)}</span></div>
                      <div
                        aria-label={`${progress.toFixed(0)}% 진행`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(progress)}
                        className="operations-record-progress"
                        role="progressbar"
                      >
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <small>DAY {record.startedDay} 집행 · 종료 기준 DAY {record.endsDay}</small>
                    </article>
                  );
                })}
                {pendingEventResults.map((record) => {
                  const definition = BUSINESS_EVENT_BY_TYPE[record.type];
                  const choice = definition.choices.find(
                    (candidate) => candidate.id === record.choice,
                  );
                  const remaining = Math.max(0, record.resolutionDay - game.day);
                  return (
                    <article className="operations-record event-result-pending" key={`event-active-${record.id}`}>
                      <div>
                        <strong>{definition.title}</strong>
                        <span>결과 심사 · D-{remaining}</span>
                      </div>
                      <div
                        aria-label={`${Math.round((1 - remaining / Math.max(1, record.resolutionDay - record.appearedDay)) * 100)}% 진행`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round((1 - remaining / Math.max(1, record.resolutionDay - record.appearedDay)) * 100)}
                        className="operations-record-progress"
                        role="progressbar"
                      >
                        <span style={{ width: `${Math.max(0, Math.min(100, (1 - remaining / Math.max(1, record.resolutionDay - record.appearedDay)) * 100))}%` }} />
                      </div>
                      <small>{choice?.title ?? record.choice} · DAY {record.resolutionDay} 결과 발표</small>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="operations-empty">진행 중인 사업 액션이 없습니다.</p>
            )}
          </section>

          <section className="operations-history">
            <div className="operations-section-heading compact">
              <div>
                <span className="eyebrow">RECENT LOG</span>
                <h2>최근 기록</h2>
              </div>
              <span>최근 8건</span>
            </div>
            {recentDecisions.length > 0 ? (
              <div className="operations-record-list history">
                {recentDecisions.map((entry) => {
                  if (entry.kind === "action") {
                    const record = entry.record;
                    return (
                      <article className={`operations-record outcome-${record.outcome}`} key={`history-${record.id}`}>
                        <div>
                          <strong>{BUSINESS_ACTION_BY_TYPE[record.type].title}</strong>
                          <span>{getBusinessRecordStatus(record, game.day)}</span>
                        </div>
                        <small>
                          DAY {record.startedDay} · ₩{formatRevenue(record.cost)}
                          {record.risk !== undefined ? ` · 위험 ${Math.round(record.risk * 100)}%` : ""}
                          {record.cashReturn !== undefined ? ` · 회수 ₩${formatRevenue(record.cashReturn)}` : ""}
                        </small>
                      </article>
                    );
                  }
                  const record: BusinessEventRecord = entry.record;
                  const definition = BUSINESS_EVENT_BY_TYPE[record.type];
                  const choice = definition.choices.find(
                    (candidate) => candidate.id === record.choice,
                  );
                  const result = record.outcome === "pending"
                    ? null
                    : getBusinessEventResult(record.type, record.choice, record.outcome);
                  return (
                    <article className={`operations-record event-record outcome-${record.outcome}`} key={`event-history-${record.id}`}>
                      <div>
                        <strong>{definition.title}</strong>
                        <span>{result?.headline ?? `DAY ${record.resolutionDay} 결과 대기`}</span>
                      </div>
                      <small>
                        DAY {record.appearedDay} · {choice?.title ?? record.choice} · 비용 {record.cost > 0 ? `₩${formatRevenue(record.cost)}` : "없음"} · 역풍 {Math.round(record.risk * 100)}%
                      </small>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="operations-empty">아직 집행 기록이 없습니다.</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function FinanceView({
  game,
  guidedInspection = false,
}: {
  game: GameState;
  guidedInspection?: boolean;
}) {
  const latestRecord = game.history.at(-1);
  const previousRecord = game.history.at(-2);
  const latestRevenue = latestRecord?.revenue ?? game.finance.today;
  const previousRevenue = previousRecord?.revenue;
  const isTodayRecorded = latestRecord?.day === game.day;
  const settledDayLabel = isTodayRecorded
    ? "오늘"
    : `DAY ${latestRecord?.day ?? game.day}`;
  const dailyRate = previousRevenue && previousRevenue > 0
    ? ((latestRevenue - previousRevenue) / previousRevenue) * 100
    : 0;
  const dailyDirection = dailyRate > 0 ? "상승" : dailyRate < 0 ? "하락" : "보합";
  const activeUsers = totalUsers(game);
  const monthlyOperatingCost = getMonthlyOperatingCost(activeUsers);
  const runwayMonths = getOperatingRunwayMonths(game.finance.cash, activeUsers);
  const strategicReturns = game.operations.records.reduce(
    (sum, record) => sum + (record.cashReturn ?? 0),
    0,
  );

  return (
    <section
      className="subpage finance-page"
      data-tutorial-inspection={guidedInspection ? "active" : undefined}
      data-tutorial-target={guidedInspection ? "active" : undefined}
      tabIndex={guidedInspection ? -1 : undefined}
    >
      <div className="subpage-heading">
        <div>
          <span className="eyebrow">FINANCE OFFICE</span>
          <h1>재무</h1>
          <p>누적 합계보다 오늘의 매출 반응과 유저 흐름을 먼저 읽습니다.</p>
        </div>
        <div className={`cadence-card finance-day-change ${dailyRate >= 0 ? "up" : "down"}`}>
          <TrendIcon />
          <span>전일 대비</span>
          <strong>{dailyDirection} {dailyRate >= 0 ? "+" : ""}{dailyRate.toFixed(1)}%</strong>
        </div>
      </div>
      <div className="finance-kpis expanded">
        <OverviewCard className="primary" icon={<RevenueIcon />} label={isTodayRecorded ? "오늘 매출" : `DAY ${latestRecord?.day ?? game.day} 매출`} value={`₩${formatRevenue(latestRevenue)}`} note={isTodayRecorded ? "카탈로그 + 발매 + 사업 효과" : "오늘 결정 제출 후 결산"} />
        <OverviewCard icon={<RevenueIcon />} label="보유 운영자금" value={`₩${formatRevenue(game.finance.cash)}`} note={`현 규모 기준 약 ${runwayMonths.toFixed(1)}개월`} />
        <OverviewCard icon={<TrendIcon />} label={`${settledDayLabel} 순운영 현금`} value={formatSignedRevenue(game.finance.todayOperatingCash)} note={isTodayRecorded ? "매출 32% − 운영비 − 오늘 집행비" : "오늘 결정 제출 후 정산"} />
        <OverviewCard icon={<RevenueIcon />} label={game.day < OPERATING_COST_START_DAY ? "운영비 정산 시작" : `${settledDayLabel} 운영비`} value={game.day < OPERATING_COST_START_DAY ? `DAY ${OPERATING_COST_START_DAY}` : formatSignedRevenue(-game.finance.todayOperatingCost)} note={`월 예상 ₩${formatRevenue(monthlyOperatingCost)}`} />
        <OverviewCard icon={<TrendIcon />} label="최근 30일" value={`₩${formatRevenue(game.finance.rolling30)}`} note={`누적 매출 ₩${formatRevenue(game.finance.cumulative)}`} />
        <OverviewCard icon={<RevenueIcon />} label="누적 운영비" value={`₩${formatRevenue(game.finance.cumulativeOperatingCosts)}`} note="DAY 47부터 일할 정산" />
        <OverviewCard icon={<RevenueIcon />} label="누적 사업비" value={`₩${formatRevenue(game.finance.cumulativeExpenses)}`} note={strategicReturns > 0 ? `대형 프로젝트 회수 ₩${formatRevenue(strategicReturns)}` : "사업 액션 집행 누계"} />
        <OverviewCard icon={<GavelIcon />} label="구매 신뢰" value={`${Math.round(game.purchaseTrust)}`} note="100점 기준" />
      </div>
      <FinanceMarketChart game={game} />
    </section>
  );
}

function SupportDialog({
  theme,
  game,
  direction,
  dialogRef,
  onDirectionChange,
  onClose,
  onSubmit,
}: {
  theme: ThemeContent;
  game: GameState;
  direction: SupportDirection;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onDirectionChange: (value: SupportDirection) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const earliest = getNextReleaseDay(game.day);
  return (
    <div className="modal-backdrop">
      <div aria-labelledby="support-dialog-title" aria-modal="true" className="support-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <button aria-label="닫기" className="dialog-close" onClick={onClose} type="button">×</button>
        <span className="eyebrow">DESIGN REQUEST</span>
        <h2 id="support-dialog-title">{theme.name} 지원 제안</h2>
        <p>선택한 방향의 지원안이 다음 정기 발매 시안 6개 중 한 자리를 보장받습니다.</p>
        <fieldset><legend>지원 방향</legend><div className="choice-grid">{SUPPORT_DIRECTIONS.map((item) => <label className={direction === item.value ? "choice-card selected" : "choice-card"} key={item.value}><input checked={direction === item.value} name="support-direction" onChange={() => onDirectionChange(item.value)} type="radio"/><strong>{item.label}</strong><span>{item.description}</span></label>)}</div></fieldset>
        <div className="release-estimate"><ReleaseIcon /><div><span>시안 보장일</span><strong>DAY {earliest} · 기존 지원 3안 중 1자리</strong></div></div>
        <div className="dialog-actions"><button className="text-action" onClick={onClose} type="button">취소</button><button className="primary-action" onClick={onSubmit} type="button">지원 시안 제안</button></div>
      </div>
    </div>
  );
}
