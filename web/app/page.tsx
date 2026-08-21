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
import { HeaderReferenceTools } from "./components/HeaderReferenceTools";
import { LotusSymbol } from "./components/LotusSymbol";
import { TabTutorialPopup } from "./components/TabTutorialPopup";
import {
  CardMarketQuote,
} from "./components/CardMarketQuote";
import { CampaignTimeDock } from "./components/CampaignTimeDock";
import { DailyNewsView, ImpactMessageStack } from "./components/NewsViews";
import { ReleasePackCard } from "./components/ReleasePackCard";
import { ReleaseDecisionPanel } from "./components/ReleaseDecisionPanel";
import { ThemeEmblem } from "./components/ThemeEmblem";
import { TitleScreen } from "./components/TitleScreen";
import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
  THEME_BY_ID,
  THEMES,
} from "./game/content";
import {
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  LAST_BAN_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  PROLOGUE_SEED,
  SETTLEMENT_START_DAY,
  SETTLEMENT_DAYS,
} from "./game/campaign";
import { getNextCampaignMilestone } from "./game/campaign-milestone.ts";
import {
  CAMPAIGN_ENVIRONMENT_STABLE_MIN,
  evaluateCampaignEnding,
  getCampaignEndingHints,
  type CampaignCashBand,
  type CampaignEndingEvaluation,
  type CampaignEnvironmentBand,
  type CampaignTrustBand,
  type CampaignUserBand,
} from "./game/campaign-ending";
import {
  getMarketDivergenceLag,
  getRevenueChangeSignal,
  getMonthlyOperatingCost,
  getOperatingRunwayMonths,
  RELEASE_SALES_WINDOW_DAYS,
} from "./game/finance";
import {
  getCommunityHeat,
  getDailyCommunityPosts,
  getReleaseReactionProfile,
  type ReleaseReactionProfile,
} from "./game/daily-community";
import { getDailyCommunitySentiment } from "./game/community-sentiment";
import { rankCommunityPostsByLikes } from "./game/community-engagement";
import {
  getGenericCardMarketQuote,
  getThemeCardMarketQuote,
} from "./game/card-market";
import { getImpactNewsRange, type DailyNewsItem } from "./game/daily-news";
import {
  buildDistributionEntries,
  type DistributionMode,
} from "./game/distribution-model";
import {
  getEnvironmentTargetGenericPool,
  getIndirectSupportGenericPool,
  getReprintCandidates,
} from "./game/release-requests";
import { getChartEnvironmentHealth } from "./game/environment-health";
import {
  CONTEXTUAL_TUTORIAL_TOPIC_IDS,
  TAB_TUTORIAL_TAB_IDS,
  createContextualTutorialVisitState,
  createTabTutorialVisitState,
  getPendingTutorialPopups,
  isTabTutorialSeriesComplete,
  markContextualTutorialVisited,
  markTabTutorialVisited,
  type ContextualTutorialTopicId,
  type ContextualTutorialVisitState,
  type PendingTutorialPopup,
  type TabTutorialTabId,
  type TabTutorialVisitState,
} from "./game/tab-tutorial";
import { isInitialGenericReleaseBatch } from "./game/initial-generic-cards";
import {
  getPlayKeyword,
  PLAY_KEYWORD_IDS,
} from "./game/play-keywords";
import {
  getGenericCard,
  type GenericCardCatalogEntry,
  type GenericCardId,
} from "./game/generic-card-catalog";
import type { GenericCardMetaEntry } from "./game/generic-card-meta";
import { getSupportNeglectPressure } from "./game/support-continuity";
import {
  getPlacementTier,
  getDailyTopCutPlacements,
  getRecentPlacementReport,
  getThemeDebutDay,
  PLACEMENT_WINDOW_DAYS,
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
  getBusinessActionSuccessProbability,
  getBusinessEnvironmentHealth,
  getBusinessEnvironmentHealthBreakdown,
  getPackOddsDetectionRisk,
  isBusinessActionEffectActive,
  isProbabilisticBusinessAction,
  isStrategicBusinessAction,
  type StrategicBusinessActionType,
} from "./game/business-actions";
import {
  BUSINESS_CHALLENGE_BY_TYPE,
  isChallengeBusinessAction,
} from "./game/business-challenges";
import {
  BUSINESS_EVENT_BY_TYPE,
  BUSINESS_STRATEGY_AXES,
  BUSINESS_STRATEGY_AXIS_LABELS,
  getBusinessEventResult,
} from "./game/business-events";
import {
  canProposeSupport,
  createCampaignStart,
  formatCommunityEvent,
  getCommittedSupportCount,
  getCurrentGenericMetaModel,
  getEffectiveThemePlayKeywords,
  getNextBanDay,
  getNextReleaseDay,
  getProspectiveSupportKeyword,
  isHandoverReady,
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
import { getRestrictionChangeCapacity } from "./game/restriction-cap";
import type {
  BusinessActionRecord,
  BusinessActionType,
  BusinessChallengeMetric,
  BusinessEventChoice,
  BusinessEventRecord,
  CommunityEvent,
  GameCommand,
  GameState,
  PartRole,
  PowerAdjustment,
  ReleaseSelection,
  RestrictionLimit,
  SupportDirection,
  ThemeContent,
  ThemeId,
  ThemeRuntime,
} from "./game/types";

type TabId = TabTutorialTabId;

const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "distribution", label: "분포" },
  { id: "cards", label: "카드" },
  { id: "releases", label: "발매" },
  { id: "operations", label: "사업 운영" },
  { id: "community", label: "커뮤니티" },
  { id: "news", label: "소식" },
  { id: "finance", label: "재무" },
];

type MotionPreference = "system" | "reduced";
type GameSoundKind = "click" | "release" | "restriction" | "event" | "impact";

type InterfaceSettings = {
  soundEnabled: boolean;
  impactEffectsEnabled: boolean;
  motionPreference: MotionPreference;
  tutorialGuidanceEnabled: boolean;
};

const INTERFACE_SETTINGS_KEY = "tcg-regulator-interface-settings-v1";
const TAB_TUTORIAL_PROGRESS_KEY = "tcg-regulator-tab-tutorial-v1";
const DEFAULT_TUTORIAL_GUIDANCE_ENABLED = true;
const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = {
  soundEnabled: true,
  impactEffectsEnabled: true,
  motionPreference: "system",
  tutorialGuidanceEnabled: DEFAULT_TUTORIAL_GUIDANCE_ENABLED,
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
      tutorialGuidanceEnabled:
        typeof parsed.tutorialGuidanceEnabled === "boolean"
          ? parsed.tutorialGuidanceEnabled
          : DEFAULT_INTERFACE_SETTINGS.tutorialGuidanceEnabled,
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

type TabTutorialProgress = {
  tabVisits: TabTutorialVisitState;
  contextualVisits: ContextualTutorialVisitState;
};

function createEmptyTabTutorialProgress(): TabTutorialProgress {
  return {
    tabVisits: createTabTutorialVisitState(),
    contextualVisits: createContextualTutorialVisitState(),
  };
}

function loadTabTutorialProgress(): TabTutorialProgress {
  if (typeof window === "undefined") return createEmptyTabTutorialProgress();
  try {
    const stored = window.localStorage.getItem(TAB_TUTORIAL_PROGRESS_KEY);
    if (!stored) return createEmptyTabTutorialProgress();
    const parsed = JSON.parse(stored) as {
      version?: unknown;
      visitedTabs?: unknown;
      completedTopics?: unknown;
    };
    if (parsed.version !== 1) return createEmptyTabTutorialProgress();
    const visitedTabs = Array.isArray(parsed.visitedTabs)
      ? parsed.visitedTabs.filter(
          (value): value is TabTutorialTabId =>
            typeof value === "string" &&
            TAB_TUTORIAL_TAB_IDS.includes(value as TabTutorialTabId),
        )
      : [];
    const completedTopics = Array.isArray(parsed.completedTopics)
      ? parsed.completedTopics.filter(
          (value): value is ContextualTutorialTopicId =>
            typeof value === "string" &&
            CONTEXTUAL_TUTORIAL_TOPIC_IDS.includes(
              value as ContextualTutorialTopicId,
            ),
        )
      : [];
    return {
      tabVisits: createTabTutorialVisitState(visitedTabs),
      contextualVisits: createContextualTutorialVisitState(completedTopics),
    };
  } catch {
    return createEmptyTabTutorialProgress();
  }
}

function useTabTutorialProgress() {
  const [progress, setProgress] = useState<TabTutorialProgress>(
    loadTabTutorialProgress,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TAB_TUTORIAL_PROGRESS_KEY,
        JSON.stringify({
          version: 1,
          visitedTabs: TAB_TUTORIAL_TAB_IDS.filter(
            (tab) => progress.tabVisits[tab],
          ),
          completedTopics: CONTEXTUAL_TUTORIAL_TOPIC_IDS.filter(
            (topic) => progress.contextualVisits[topic],
          ),
        }),
      );
    } catch {
      // First-visit help can safely restart if optional UI storage is blocked.
    }
  }, [progress]);

  const reset = () => setProgress(createEmptyTabTutorialProgress());
  const complete = (popup: PendingTutorialPopup) => {
    setProgress((current) =>
      popup.kind === "tab"
        ? {
            ...current,
            tabVisits: markTabTutorialVisited(current.tabVisits, popup.id),
          }
        : {
            ...current,
            contextualVisits: markContextualTutorialVisited(
              current.contextualVisits,
              popup.id,
            ),
          },
    );
  };

  return { complete, progress, reset };
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
      <button
        aria-pressed={settings.tutorialGuidanceEnabled}
        onClick={() =>
          updateSetting(
            "tutorialGuidanceEnabled",
            !settings.tutorialGuidanceEnabled,
          )
        }
        title="각 화면을 처음 열 때 설명 팝업을 표시합니다."
        type="button"
      >
        <span>첫 방문 도움말</span>
        <strong>{settings.tutorialGuidanceEnabled ? "ON" : "OFF"}</strong>
      </button>
    </div>
  );
}

const ROLE_LABELS: Record<PartRole, string> = {
  starter1: "초동",
  starter2: "초동",
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

function PlayKeywordChips({
  theme,
  game,
  previewKeyword = null,
}: {
  theme: ThemeContent;
  game?: GameState;
  previewKeyword?: ReturnType<typeof getProspectiveSupportKeyword>;
}) {
  const effectiveKeywords = game && game.themes[theme.id]
    ? getEffectiveThemePlayKeywords(game, theme.id)
    : theme.playKeywords;
  const keywords = previewKeyword && !effectiveKeywords.includes(previewKeyword)
    ? [...effectiveKeywords, previewKeyword]
    : effectiveKeywords;
  return (
    <span className="play-keyword-list" aria-label={`${theme.name} 플레이 키워드`}>
      {keywords.map((keyword, index) => {
        const entry = getPlayKeyword(keyword);
        const gainedFromSupport = index >= theme.playKeywords.length;
        const isPreview = keyword === previewKeyword;
        return (
          <span
            className={`play-keyword-chip${gainedFromSupport ? " is-support" : ""}${isPreview ? " is-preview" : ""}`}
            key={keyword}
            title={`${gainedFromSupport ? isPreview ? "이번 지원 예정 · " : "지원으로 획득 · " : ""}${entry.description}`}
          >
            {isPreview ? "+ " : ""}{entry.label}
          </span>
        );
      })}
    </span>
  );
}

function GenericCardMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`generic-card-mark${compact ? " compact" : ""}`}
    >
      <i />
      <i />
      <i />
    </span>
  );
}

function PlayKeywordGlossary({ expanded = false }: { expanded?: boolean }) {
  return (
    <details className="play-keyword-glossary" open={expanded}>
      <summary>플레이 키워드 도감</summary>
      <p className="play-keyword-guide">
        테마는 기본 3종으로 시작하며 지원 발매마다 1종을 얻어 최대 6종으로
        확장됩니다. 유불리 수치는 공개되지 않으므로 설명·입상 변화·커뮤니티 연구로
        상성을 추론하십시오.
      </p>
      <div>
        {PLAY_KEYWORD_IDS.map((keyword) => {
          const entry = getPlayKeyword(keyword);
          return (
            <article key={keyword}>
              <strong>{entry.label}</strong>
              <p>{entry.description}</p>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function buildPageGenericMeta(game: GameState) {
  return getCurrentGenericMetaModel(game);
}

type ReleasedGenericCardReference = {
  card: GenericCardCatalogEntry;
  releaseDay: number;
  powerAdjustment: PowerAdjustment;
  legalLimit: RestrictionLimit;
  meta: GenericCardMetaEntry | null;
};

function getReleasedGenericCardReferences(
  game: GameState,
): ReleasedGenericCardReference[] {
  const meta = buildPageGenericMeta(game);
  const releases = new Map<
    GenericCardId,
    { day: number; powerAdjustment: PowerAdjustment }
  >();
  for (const batch of game.releaseHistory) {
    for (const product of batch.products) {
      if (product.kind !== "generic" || releases.has(product.genericCardId)) {
        continue;
      }
      releases.set(product.genericCardId, {
        day: batch.day,
        powerAdjustment: product.powerAdjustment,
      });
    }
  }
  return [...releases.entries()]
    .flatMap(([cardId, release]) => {
      const card = getGenericCard(cardId);
      if (!card) return [];
      return [{
        card,
        releaseDay: release.day,
        powerAdjustment: release.powerAdjustment,
        legalLimit: game.genericLimits[cardId] ?? 3,
        meta: meta.cardMetaById[cardId] ?? null,
      }];
    })
    .sort(
      (left, right) =>
        right.releaseDay - left.releaseDay ||
        left.card.name.localeCompare(right.card.name),
    );
}

function getGenericAdopterThemeIds(
  game: GameState,
  meta: GenericCardMetaEntry | null,
  limit = 4,
): ThemeId[] {
  if (!meta || meta.legalLimit === 0) return [];
  return Object.entries(meta.adoptionByTheme)
    .filter(([, adoption]) => adoption >= 0.12)
    .sort(
      ([leftId, leftAdoption], [rightId, rightAdoption]) =>
        rightAdoption - leftAdoption ||
        (game.themes[rightId]?.share ?? 0) -
          (game.themes[leftId]?.share ?? 0) ||
        leftId.localeCompare(rightId),
    )
    .slice(0, limit)
    .map(([themeId]) => themeId);
}

function GenericAdopterNames({
  game,
  meta,
  limit = 4,
}: {
  game: GameState;
  meta: GenericCardMetaEntry | null;
  limit?: number;
}) {
  const themeIds = getGenericAdopterThemeIds(game, meta, limit);
  if (themeIds.length === 0) {
    return <span className="generic-researching">채용 연구 중</span>;
  }
  return (
    <span className="generic-adopter-names">
      {themeIds.map((themeId) => THEME_BY_ID[themeId]?.shortName ?? themeId).join(" · ")}
    </span>
  );
}

function getLastRestrictionDay(game: GameState, cardId: string): string {
  const lastDay = game.community.reduce((latest, event) => {
    const isCardChange =
      event.category === "restriction" &&
      (event.type === "restriction-applied" || event.type === "cosmetic-restriction") &&
      (event.partId === cardId || event.genericCardId === cardId);
    return isCardChange ? Math.max(latest, event.day) : latest;
  }, -1);
  return lastDay >= 0 ? `DAY ${lastDay}` : "—";
}

function CurrentBanList({
  expanded = false,
  game,
}: {
  expanded?: boolean;
  game: GameState;
}) {
  const themeEntries = game.activeThemeIds
    .flatMap((themeId) => {
      const theme = THEME_BY_ID[themeId];
      const runtime = game.themes[themeId];
      if (!theme || !runtime) return [];
      return theme.parts
        .filter((part) => runtime.releasedPartIds.includes(part.id))
        .flatMap((part) => {
          const limit = runtime.legalLimits[part.id] ?? 3;
          return limit < 3 ? [{ theme, part, limit }] : [];
        });
    })
    .sort(
      (left, right) =>
        left.limit - right.limit ||
        left.theme.shortName.localeCompare(right.theme.shortName) ||
        left.part.name.localeCompare(right.part.name),
    );
  const genericEntries = getReleasedGenericCardReferences(game)
    .filter((entry) => entry.legalLimit < 3)
    .sort(
      (left, right) =>
        left.legalLimit - right.legalLimit ||
        left.card.name.localeCompare(right.card.name),
    );
  const entryCount = themeEntries.length + genericEntries.length;

  return (
    <details className="current-banlist-reference" open={expanded}>
      <summary>
        현재 밴리스트 <span>{entryCount}장</span>
      </summary>
      {entryCount > 0 ? (
        <div className="current-banlist-reference-table">
          <div className="current-banlist-reference-head" role="row">
            <span>테마 / 카드</span>
            <span>출시</span>
            <span>최종 금제일</span>
            <span>현행</span>
          </div>
          {themeEntries.map(({ theme, part, limit }) => (
            <div className="current-banlist-reference-row" key={part.id} role="row">
              <span>
                <small>{theme.shortName}</small>
                <strong>{part.name}</strong>
              </span>
              <span>{getPartReleaseLabel(game, theme, part.id)}</span>
              <span>{getLastRestrictionDay(game, part.id)}</span>
              <strong>{LIMIT_LABELS[limit]}</strong>
            </div>
          ))}
          {genericEntries.map((entry) => (
            <div
              className="current-banlist-reference-row generic-banlist-row"
              key={entry.card.id}
              role="row"
            >
              <span>
                <small>범용 · {getPlayKeyword(entry.card.keyword).label}</small>
                <strong>{entry.card.name}</strong>
                <GenericAdopterNames game={game} limit={3} meta={entry.meta} />
              </span>
              <span>DAY {entry.releaseDay}</span>
              <span>{getLastRestrictionDay(game, entry.card.id)}</span>
              <strong>{LIMIT_LABELS[entry.legalLimit]}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="current-banlist-empty">현재 금제된 카드는 없습니다.</p>
      )}
    </details>
  );
}

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

const BUSINESS_CHALLENGE_METRIC_LABEL = {
  "environment-health": "환경 건강도",
  "purchase-trust": "구매 신뢰",
  "release-quality": "발매 품질",
} satisfies Record<BusinessChallengeMetric, string>;

function getBusinessRecordStatus(record: BusinessActionRecord, day: number) {
  const remaining = Math.max(0, record.endsDay - day);
  switch (record.outcome) {
    case "pending":
      return "다음 정기 발매 대기";
    case "success":
      if (record.challenge) return "목표 달성";
      return remaining > 0 ? `성공 · ${remaining}일 남음` : "효과 종료";
    case "backlash":
      if (record.challenge) return "목표 미달";
      return remaining > 0 ? `실패 · ${remaining}일 남음` : "실패 종료";
    case "clean":
      return remaining > 0 ? `미적발 · ${remaining}일 남음` : "조정 종료";
    case "detected":
      return "적발 · 효과 중단";
    case "completed":
      return "집행 종료";
    case "active":
      if (record.challenge) {
        const remainingDays = Math.max(0, record.challenge.deadlineDay - day);
        return remainingDays > 0
          ? `조건 심사 중 · D-${remainingDays}`
          : "조건 확정 대기";
      }
      if (isProbabilisticBusinessAction(record.type)) {
        return day <= record.startedDay ? "결과 판정 · D-1" : "결과 확정 대기";
      }
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
  if (record.challenge) {
    return Math.max(
      0,
      Math.min(
        100,
        (record.challenge.qualifyingDays /
          Math.max(1, record.challenge.requiredQualifyingDays)) *
          100,
      ),
    );
  }
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
      if (isProbabilisticBusinessAction(record.type)) {
        return `${BUSINESS_ACTION_BY_TYPE[record.type].title}이 기대한 반응을 얻지 못했습니다. 실패 효과가 이어집니다.`;
      }
      return isStrategicBusinessAction(record.type)
        ? `${BUSINESS_ACTION_BY_TYPE[record.type].title}이 실패했습니다. 투자금을 회수하지 못했고 후속 역풍이 시작됩니다.`
        : "챔피언십 중계가 환경 문제를 노출해 역풍이 시작됐습니다.";
    }
    if (record.outcome === "success") {
      if (isProbabilisticBusinessAction(record.type)) {
        return `${BUSINESS_ACTION_BY_TYPE[record.type].title}이 성공했습니다. 사업 효과가 이어집니다.`;
      }
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
  observedDays: 0,
  placements: 0,
  placementShare: 0,
  estimatedEntrants: 0,
  observedConversion: 0,
};

function makeRestrictionDraft(game: GameState) {
  return Object.fromEntries(
    [
      ...Object.values(game.themes).flatMap((theme) =>
        Object.entries(theme.legalLimits),
      ),
      ...Object.entries(game.genericLimits),
    ],
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
    .find(
      (batch) =>
        batch.day <= day && !isInitialGenericReleaseBatch(batch),
    );
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

type AdvisorBrief = {
  tone: "calm" | "info" | "caution" | "critical";
  kicker: string;
  message: string;
  submessage?: string;
};

function getAdvisorBrief(
  game: GameState,
  activeTab: TabId,
  concentratedRestrictionRisk: boolean,
  restrictionPolicy: RestrictionPolicyProfile,
): AdvisorBrief {
  const tabBriefs: Record<TabId, AdvisorBrief> = {
    distribution: {
      tone: "info",
      kicker: "입상 지표 해석",
      message: "입상 점유율은 최근 14일 주요 대회의 전체 입상 자리 중 해당 테마가 차지한 비중입니다. 채용률·승률과 함께 보십시오.",
    },
    cards: {
      tone: "info",
      kicker: "카드 해석",
      message: "테마 카드와 범용 카드를 전환해 채용률·현행 제한·시세를 함께 비교하십시오.",
    },
    releases: {
      tone: "info",
      kicker: "발매 해석",
      message: "키워드는 플레이 성향만 보여줍니다. 현재 환경의 상성과 순수 체급을 함께 추론하십시오.",
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
    news: {
      tone: "info",
      kicker: "오늘의 소식",
      message: "큰 변동과 플레이어 반응을 날짜별로 모았습니다. 숫자가 바뀐 날부터 확인하십시오.",
    },
    finance: {
      tone: "info",
      kicker: "재무 해석",
      message: "발매일의 급등과 장기 잔존은 분리해서 보아야 합니다.",
      submessage: "기본 조직비와 활성 유저 규모 비용이 매일 일할 정산됩니다.",
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
      tone: "info",
      kicker: "정기 발매 검토",
      message: "신테마·지원·범용을 각각 1종 이상 포함해 이번 카드팩 구성을 직접 확정하십시오.",
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
        tone: restrictionPolicy.coverageComplete ? "calm" : "caution",
        kicker: restrictionPolicy.coverageComplete
          ? "정당화 가능한 유지안"
          : "환경 유지안",
        message: restrictionPolicy.coverageComplete
          ? "현재 점유율과 승률에서 즉시 제재할 위협은 잡히지 않았습니다. 무변경도 정상적인 정책 선택입니다."
          : "압력이 높은 테마를 그대로 두면 현재 메타와 구매 흐름이 이어집니다. 이것도 하나의 운영 결정입니다.",
        submessage: `판정 위협 ${restrictionPolicy.threatThemeIds.length}개 · 미대응 ${restrictionPolicy.unaddressedThreatThemeIds.length}개입니다. 불쾌도와 자연 카운터의 움직임도 함께 보십시오.`,
      });
    }
    if (restrictionPolicy.meaningfulCutCount === 0) {
      return withActiveTabHint({
        tone: "caution",
        kicker: "실효성 낮은 조정",
        message: `${restrictionPolicy.changeCount}건을 바꿨지만 현재 채용 매수 기준으로 환경에 미치는 영향은 작게 예측됩니다.`,
        submessage: "단발성 상징 조치는 구매 신뢰보다 여론과 경쟁층 잔존에 먼저 악영향을 줍니다. 반복해서 문제를 미루면 구매 신뢰도 뒤따라 무너집니다.",
      });
    }
    if (
      restrictionPolicy.totalImpact >= 18 ||
      restrictionPolicy.recentProductChanges > 0
    ) {
      return withActiveTabHint({
        tone: "caution",
        kicker: "환경 회복과 보유가치",
        message: `정책 대상이 타당해도 이 강도의 금제는 카드 보유가치와 구매 신뢰를 직접 훼손합니다. 최근 30일 제품 변경은 ${restrictionPolicy.recentProductChanges}종입니다.`,
        submessage: `판정 위협 ${restrictionPolicy.threatThemeIds.length}개 · 미대응 ${restrictionPolicy.unaddressedThreatThemeIds.length}개 · 추정 충격 ${Math.round(restrictionPolicy.totalImpact)}입니다.`,
      });
    }
    return withActiveTabHint({
      tone: "calm",
      kicker: "금제 파급 예측",
      message: `실효 조정 ${restrictionPolicy.meaningfulCutCount}종 · 영향 테마 ${restrictionPolicy.affectedThemeCount}개 · 추정 충격 ${Math.round(restrictionPolicy.totalImpact)}입니다.`,
      submessage: `판정 위협 ${restrictionPolicy.threatThemeIds.length}개 · 미대응 ${restrictionPolicy.unaddressedThreatThemeIds.length}개 · 비위협 선제 제재 ${restrictionPolicy.preemptiveCutThemeIds.length}개입니다. 로터스는 결과를 예측할 뿐 정답을 정하지 않습니다.`,
    });
  }
  const releasePublishedToday = game.releaseHistory.some(
    (batch) =>
      batch.day === game.day && !isInitialGenericReleaseBatch(batch),
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
  if (game.phase === "running" && game.day > LAST_DECISION_DAY) {
    return withActiveTabHint({
      tone: "calm",
      kicker: "최종 결산 관찰",
      message: `새 결정은 마감됐습니다. DAY ${CAMPAIGN_END_DAY}까지 최종 발매와 시장 반응을 관측한 뒤 임기 결과를 확정합니다.`,
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

function getPartReleaseLabel(
  game: GameState,
  theme: ThemeContent,
  partId: string,
): string {
  const partIndex = theme.parts.findIndex((part) => part.id === partId);
  if (partIndex < 0) return "출시 기록 없음";

  if (partIndex < INITIAL_THEME_PART_COUNT) {
    const debut = game.releaseHistory.find((batch) =>
      batch.products.some(
        (product) =>
          product.kind === "new-theme" && product.themeId === theme.id,
      ),
    );
    return debut ? `DAY ${debut.day}` : "DAY 0";
  }

  const supportWave = Math.floor(
    (partIndex - INITIAL_THEME_PART_COUNT) / SUPPORT_PARTS_PER_RELEASE,
  );
  const supportReleases = game.releaseHistory.filter((batch) =>
    batch.products.some(
      (product) => product.kind === "support" && product.themeId === theme.id,
    ),
  );
  const release = supportReleases[supportWave];
  return release ? `DAY ${release.day}` : "출시 기록 없음";
}

function withKoreanObjectParticle(value: string) {
  const lastCodePoint = value.codePointAt(value.length - 1) ?? 0;
  const hasFinalConsonant =
    lastCodePoint >= 0xac00 &&
    lastCodePoint <= 0xd7a3 &&
    (lastCodePoint - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? "을" : "를"}`;
}

type BootState =
  | { status: "loading" }
  | {
      status: "title";
      backend: PersistenceBackend;
      savedGame: GameState | null;
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
  const tabTutorial = useTabTutorialProgress();

  function completeTutorialPopup(popup: PendingTutorialPopup) {
    const nextTabVisits =
      popup.kind === "tab"
        ? markTabTutorialVisited(tabTutorial.progress.tabVisits, popup.id)
        : tabTutorial.progress.tabVisits;
    const nextContextualVisits =
      popup.kind === "contextual"
        ? markContextualTutorialVisited(
            tabTutorial.progress.contextualVisits,
            popup.id,
          )
        : tabTutorial.progress.contextualVisits;

    tabTutorial.complete(popup);
    if (isTabTutorialSeriesComplete(nextTabVisits, nextContextualVisits)) {
      updateSetting("tutorialGuidanceEnabled", false);
    }
  }

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
      tabTutorial.reset();
      setTitleMessage(null);
      setBoot({
        status: "playing",
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
    setBoot({
      status: "playing",
      backend: boot.backend,
      initialGame: boot.savedGame,
      warning: titleMessage ?? undefined,
    });
  }

  if (boot.status !== "playing") {
    const savedGame = boot.status === "title" ? boot.savedGame : null;
    const ready = boot.status === "title";
    const savedGameSummary = !ready
      ? "저장 확인 중"
      : savedGame
        ? savedGame.phase === "ended"
            ? `DAY ${savedGame.day} · 임기 결과 보기`
            : savedGame.phase === "running" &&
                savedGame.day >= SETTLEMENT_START_DAY
              ? `DAY ${savedGame.day} · 결산 관찰 중`
              : `DAY ${savedGame.day} · 임기 진행 중`
        : "저장된 임기 없음";
    return (
      <TitleScreen
        busy={!ready}
        message={titleMessage}
        onContinue={continueGame}
        onNewGame={() => void beginNewGame()}
        onSettingsChange={updateSetting}
        onSoundTest={() => undefined}
        savedGame={{
          available: Boolean(savedGame),
          summary: savedGameSummary,
        }}
        settings={settings}
      >
        {confirmNewGame ? (
          <ConfirmNewGameDialog
            onCancel={() => setConfirmNewGame(false)}
            onConfirm={() => void beginNewGame(true)}
          />
        ) : null}
      </TitleScreen>
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
      onTutorialPopupComplete={completeTutorialPopup}
      tabTutorialProgress={tabTutorial.progress}
      updateInterfaceSetting={updateSetting}
    />
  );
}

function GameSession({
  interfaceSettings,
  initialGame,
  initialPersistence,
  initialWarning,
  onExit,
  onTutorialPopupComplete,
  tabTutorialProgress,
  updateInterfaceSetting,
}: {
  interfaceSettings: InterfaceSettings;
  initialGame: GameState;
  initialPersistence: PersistenceBackend;
  initialWarning?: string;
  onExit: (game: GameState, backend: PersistenceBackend) => void;
  onTutorialPopupComplete: (popup: PendingTutorialPopup) => void;
  tabTutorialProgress: TabTutorialProgress;
  updateInterfaceSetting: <Key extends keyof InterfaceSettings>(
    key: Key,
    value: InterfaceSettings[Key],
  ) => void;
}) {
  const [game, setGame] = useState<GameState>(initialGame);
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>("cycle");
  const initialTab: TabId = initialGame.operations.pendingEvent
    ? "operations"
    : initialGame.phase === "ban-edit"
      ? "cards"
      : initialGame.phase === "release-edit"
        ? "releases"
        : "distribution";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [tutorialPageIndex, setTutorialPageIndex] = useState(0);
  const [banDraft, setBanDraft] = useState<Record<string, RestrictionLimit>>(
    initialGame.phase === "ban-edit"
      ? makeRestrictionDraft(initialGame)
      : {},
  );
  const [releaseDraft, setReleaseDraft] = useState<string[]>([]);
  const [supportTarget, setSupportTarget] = useState<ThemeId | null>(null);
  const [supportDirection, setSupportDirection] =
    useState<SupportDirection>("consistency");
  const [reactionFlashDay, setReactionFlashDay] = useState<number | null>(null);
  const [impactItems, setImpactItems] = useState<DailyNewsItem[]>([]);
  const [impactFx, setImpactFx] = useState<{
    key: number;
    tone: "positive" | "negative" | "caution";
  } | null>(null);
  const [advisorPulseKey, setAdvisorPulseKey] = useState(1);
  const [packOddsConfirmOpen, setPackOddsConfirmOpen] = useState(false);
  const [strategicConfirmAction, setStrategicConfirmAction] =
    useState<StrategicBusinessActionType | null>(null);
  const [toast, setToast] = useState<string | null>(initialWarning ?? null);
  const [mobileDetail, setMobileDetail] = useState(
    initialGame.phase === "ban-edit",
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
  const packOddsCommittedRef = useRef(false);
  const lastImpactFxDayRef = useRef<number | null>(null);
  const impactTimersRef = useRef<number[]>([]);

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
      game.phase === "release-edit" ||
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

  useEffect(() => () => {
    impactTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    impactTimersRef.current = [];
  }, []);

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
    game.phase === "ban-edit" || game.day < LAST_BAN_DAY;
  const campaignEnded = game.phase === "ended";
  const settlementPeriod =
    game.phase === "running" && game.day >= SETTLEMENT_START_DAY;
  const mandateProgress =
    (Math.min(game.day, LAST_DECISION_DAY) / LAST_DECISION_DAY) * 100;
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
      : settlementPeriod
        ? "결산 관찰"
        : "임기 진행률";
  const nextCampaignMilestone = getNextCampaignMilestone({
    day: game.day,
    nextBanDay,
    nextReleaseDay,
    phase: game.phase,
  });
  const total = totalUsers(game);
  const gameOver = total <= 0;
  const campaignComplete = game.phase === "ended" && !gameOver;
  const previousUserTotal = [...game.history]
    .reverse()
    .find((entry) => entry.day < game.day)?.totalUsers ?? total;
  const dailyUserDelta = Math.round(total - previousUserTotal);
  const userBreakdown = `활성 유저 ${formatUsers(total)}명`;
  const supportCooldown =
    game.lastSupportProposalDay === null
      ? 0
      : Math.max(0, 30 - (game.day - game.lastSupportProposalDay));

  const restrictionChanges = Object.entries(banDraft).filter(([partId, value]) => {
    const official = partId.startsWith("generic-")
      ? game.genericLimits[partId as GenericCardId]
      : Object.values(game.themes).find((theme) =>
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
    activeTab,
    concentratedRestrictionRisk,
    restrictionPolicy,
  );
  const pendingTutorialPopups = getPendingTutorialPopups(
    activeTab,
    tabTutorialProgress.tabVisits,
    tabTutorialProgress.contextualVisits,
    {
      guidanceEnabled: interfaceSettings.tutorialGuidanceEnabled,
      day: game.day,
      phase: game.phase,
    },
  );
  const tutorialPopupBlocked = Boolean(
    game.operations.pendingEvent ||
      supportTarget ||
      packOddsConfirmOpen ||
      strategicConfirmAction,
  );
  const tutorialPopup = tutorialPopupBlocked
    ? null
    : (pendingTutorialPopups[0] ?? null);
  const tutorialPopupKey = tutorialPopup
    ? `${tutorialPopup.kind}-${tutorialPopup.id}`
    : null;
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
    setTutorialPageIndex(0);
    setActiveTab(nextTab);
  }

  function clearImpactMessages() {
    impactTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    impactTimersRef.current = [];
    setImpactItems([]);
  }

  function showImpact(previousDay: number, next: GameState) {
    clearImpactMessages();
    const news = getImpactNewsRange(next, previousDay, next.day);
    news.forEach((item, index) => {
      const arrivalTimer = window.setTimeout(() => {
        setImpactItems((current) => [...current, item].slice(-6));
        emitGameSound("impact");
        setAdvisorPulseKey((current) => current + 1);
        if (
          interfaceSettings.impactEffectsEnabled &&
          interfaceSettings.motionPreference !== "reduced"
        ) {
          setImpactFx({
            key: Date.now() + index,
            tone: item.tone === "negative" ? "negative" : item.tone === "positive" ? "positive" : "caution",
          });
        }
        const dismissTimer = window.setTimeout(() => {
          setImpactItems((current) => current.filter((entry) => entry.id !== item.id));
        }, 7600);
        impactTimersRef.current.push(dismissTimer);
      }, index * 90);
      impactTimersRef.current.push(arrivalTimer);
    });
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
          ? "정기 발매 구성을 먼저 선택해주세요."
          : "금제안을 제출해야 날짜를 진행할 수 있습니다.",
      );
      if (game.phase === "release-edit") activateTab("releases", true);
      return null;
    }
    let next = reduceGame(game, { type: "ADVANCE_DAYS", days });
    if (!next.handoverComplete && isHandoverReady(next)) {
      next = reduceGame(next, { type: "COMPLETE_HANDOVER" });
    }
    setGame(next);
    const businessToast = getBusinessTransitionToast(game, next);
    const eventResultToast = getBusinessEventTransitionToast(game, next);
    const eventArrived =
      !game.operations.pendingEvent && next.operations.pendingEvent;
    showImpact(game.day, next);
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
      activateTab("cards", true);
    } else if (next.phase === "release-edit") {
      setReleaseDraft([]);
      setToast(
        [
          `DAY ${next.day} 정기 발매 후보가 도착했습니다. 카드팩 구성을 직접 선택해주세요.`,
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
    activateTab("cards");
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
      type: "SET_RELEASE_REQUEST",
      request: {
        kind: "support",
        themeId: supportTarget,
        direction: supportDirection,
      },
    });
    const newest = next.supportRequests.at(-1);
    setToast(
      newest
        ? `${THEME_BY_ID[supportTarget].shortName} 지원이 DAY ${newest.eligibleReleaseDay} 시안에 보장됐습니다.`
        : "지원 제안을 등록하지 못했습니다.",
    );
    setSupportTarget(null);
  }

  function requestThemeRelease(
    kind: "indirect-support" | "environment-target" | "reprint",
    themeId: ThemeId,
  ) {
    if (kind === "indirect-support") {
      if (getIndirectSupportGenericPool(game, themeId).length === 0) {
        setToast("이 테마에 맞는 간접 지원 후보가 없습니다.");
        return;
      }
      dispatch({
        type: "SET_RELEASE_REQUEST",
        request: { kind, themeId },
      });
      setToast(`${THEME_BY_ID[themeId].shortName} 간접 지원을 다음 발매에 요청했습니다.`);
      return;
    }
    if (kind === "environment-target") {
      if (getEnvironmentTargetGenericPool(game, themeId).length === 0) {
        setToast("이 테마를 겨냥할 범용 후보가 없습니다.");
        return;
      }
      dispatch({
        type: "SET_RELEASE_REQUEST",
        request: { kind, themeId },
      });
      setToast(`${THEME_BY_ID[themeId].shortName} 환경 저격을 다음 발매에 요청했습니다.`);
      return;
    }
    const reprint = getReprintCandidates(game).find(
      (candidate) => candidate.themeId === themeId,
    );
    if (!reprint) {
      setToast("이 테마에는 재판을 요청할 출시 카드가 없습니다.");
      return;
    }
    dispatch({
      type: "SET_RELEASE_REQUEST",
      request: { kind, cardId: reprint.cardId },
    });
    setToast(`${reprint.cardName} 재판을 다음 발매에 요청했습니다.`);
  }

  function runBusinessAction(
    action: BusinessActionType,
    confirmed = false,
  ) {
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

    const successProbability = getBusinessActionSuccessProbability(game, action);
    const next = dispatch({ type: "RUN_BUSINESS_ACTION", action });
    const record = next.operations.records.at(-1);
    clearImpactMessages();
    setAdvisorPulseKey((current) => current + 1);
    if (isProbabilisticBusinessAction(action) && successProbability !== null) {
      setToast(
        `${withKoreanObjectParticle(definition.title)} 집행했습니다. 현재 상태 기준 성공 확률 ${Math.round(successProbability * 100)}%가 확정됐고 결과는 DAY ${game.day + 1}에 발표됩니다.`,
      );
    } else if (record?.outcome === "backlash") {
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
    return next;
  }

  function submitRestriction() {
    const changes = Object.fromEntries(restrictionChanges) as Record<
      string,
      RestrictionLimit
    >;
    const capacity = getRestrictionChangeCapacity(game, changes);
    if (!capacity.withinLimit) {
      setToast("현재 카드풀에서 더 이상 금제할 수 없습니다.");
      return null;
    }
    const newCalendarMandatePublished = game.community.some(
      (event) =>
        event.day === FIRST_BAN_DAY &&
        (event.type === "restriction-applied" ||
          event.type === "cosmetic-restriction" ||
          event.type === "restriction-no-change"),
    );
    const isFirstMandate =
      !game.handoverComplete &&
      (game.day === FIRST_BAN_DAY ||
        (game.day === 45 && !newCalendarMandatePublished));
    const published = reduceGame(game, {
      type: "SUBMIT_BAN",
      changes,
      ...(isFirstMandate
        ? { campaignSeed: mintCampaignSeed(game.seed) }
        : {}),
    });
    const next = published;
    setGame(next);
    clearImpactMessages();
    setReactionFlashDay(next.day + 1);
    setToast(
      restrictionChanges.length > 0
        ? `${restrictionChanges.length}건의 금제 변경을 시행했습니다.`
        : "변경 없음으로 금제안을 제출했습니다.",
    );
    if (next.phase !== "ban-edit") setBanDraft({});
    return next;
  }

  function submitReleaseSelections(selections: ReleaseSelection[]) {
    if (game.phase !== "release-edit" || !game.releaseSlate) return null;
    const next = dispatch({ type: "SUBMIT_RELEASE", selections });
    impactTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    impactTimersRef.current = [];
    setImpactItems([]);
    setReleaseDraft([]);
    setReactionFlashDay(next.day + 1);
    setAdvisorPulseKey((current) => current + 1);
    triggerImpactObservation(next.day, "caution");
    setToast(`DAY ${next.day} 카드팩 ${next.releaseHistory.at(-1)?.products.length ?? 0}종을 발매했습니다.`);
    emitGameSound("release");
    return next;
  }

  return (
    <div
      className={`app-shell${
        interfaceSettings.motionPreference === "reduced"
          ? " force-reduced-motion"
          : ""
      }${impactFx ? ` is-impact-observing impact-${impactFx.tone}` : ""}`}
    >
      {impactFx ? (
        <div
          aria-hidden="true"
          className="impact-screen-flash"
          key={impactFx.key}
        />
      ) : null}
      <header className="topbar">
        <HeaderReferenceTools
          banList={<CurrentBanList expanded game={game} />}
          keywordGlossary={<PlayKeywordGlossary expanded />}
        />

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
            data-tutorial-term="active-users"
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
            data-tutorial-term="sound-control"
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
            <summary aria-label="화면 및 효과음 설정" data-tutorial-term="settings-control">설정</summary>
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
              data-tutorial-control={`nav-${item.id}`}
              disabled={gameOver || campaignComplete}
              key={item.id}
              onClick={() => activateTab(item.id)}
              type="button"
            >
              <span className="nav-item-label">{item.label}</span>
              {item.id === "community" ? (
                <span className="nav-count">20</span>
              ) : null}
              {item.id === "cards" ? (
                <span
                  aria-hidden={game.phase !== "ban-edit"}
                  className={`nav-count nav-alert${
                    game.phase === "ban-edit" ? "" : " is-placeholder"
                  }`}
                >
                  !
                </span>
              ) : null}
              {item.id === "releases" ? (
                <span
                  aria-hidden={game.phase !== "release-edit"}
                  className={`nav-count nav-alert${
                    game.phase === "release-edit" ? "" : " is-placeholder"
                  }`}
                >
                  !
                </span>
              ) : null}
              {item.id === "operations" ? (
                <span
                  aria-hidden={!game.operations.pendingEvent}
                  className={`nav-count nav-alert${
                    game.operations.pendingEvent ? "" : " is-placeholder"
                  }`}
                >
                  !
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          className="reset-button"
          data-tutorial-control="home"
          onClick={() => onExit(game, persistence)}
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
        <aside
          aria-label="로터스 상황 브리핑"
          className={`advisor-brief ${advisorBrief.tone} open`}
          key={advisorPulseKey}
        >
          <LotusSymbol tone={advisorBrief.tone} />
          <div aria-live="polite" className="advisor-brief-copy" id="advisor-brief-message">
            <span>LOTUS · {advisorBrief.kicker}</span>
            <p>{advisorBrief.message}</p>
            {advisorBrief.submessage ? <small>{advisorBrief.submessage}</small> : null}
          </div>
        </aside>

        {activeTab === "cards" ? (
          <MetaWorkspace
            banDraft={banDraft}
            game={game}
            highlightedPartId={highlightedPartId}
            mobileDetail={mobileDetail}
            nextBanDay={nextBanDay}
            rankedThemes={rankedThemes}
            placementReport={placementReport}
            restrictionChanges={restrictionChanges}
            selectedRuntime={selectedRuntime}
            selectedTheme={selectedTheme}
            detailHeadingRef={detailHeadingRef}
            onBackToThemes={() => setMobileDetail(false)}
            onDraftChange={(partId, limit) => {
              const nextDraft = { ...banDraft, [partId]: limit };
              const projected = getRestrictionChangeCapacity(game, nextDraft);
              if (!projected.withinLimit) {
                setToast("현재 카드풀에서 더 이상 금제할 수 없습니다.");
                return;
              }
              setBanDraft(nextDraft);
            }}
            onOpenSupport={openSupport}
            onRequestThemeRelease={requestThemeRelease}
            onResetDraft={() => setBanDraft(makeRestrictionDraft(game))}
            onSelectTheme={selectTheme}
            onSubmitRestriction={submitRestriction}
          />
        ) : null}

        {activeTab === "distribution" ? (
          <DistributionView
            game={game}
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
            releaseDraft={releaseDraft}
            onReleaseDraftChange={setReleaseDraft}
            onSubmitRelease={submitReleaseSelections}
          />
        ) : null}

        {activeTab === "operations" ? (
          <OperationsView
            game={game}
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
            onFlashComplete={() => setReactionFlashDay(null)}
            onSelectTheme={selectTheme}
          />
        ) : null}

        {activeTab === "news" ? <DailyNewsView game={game} /> : null}

        {activeTab === "finance" ? (
          <FinanceView game={game} />
        ) : null}
          </>
        )}
      </main>

      <CampaignTimeDock
        disabled={
          game.phase !== "running" ||
          Boolean(game.operations.pendingEvent)
        }
        milestone={nextCampaignMilestone}
        onAdvance={(days) => {
          advance(days);
        }}
        progress={displayedProgress}
        progressLabel={progressLabel}
      />

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

      <ImpactMessageStack
        items={impactItems}
        onDismiss={(id) =>
          setImpactItems((current) => current.filter((item) => item.id !== id))
        }
      />

      {tutorialPopup ? (
        <TabTutorialPopup
          currentIndex={tutorialPageIndex}
          key={tutorialPopupKey}
          onComplete={() => {
            setTutorialPageIndex(0);
            onTutorialPopupComplete(tutorialPopup);
          }}
          onNext={() =>
            setTutorialPageIndex((current) =>
              Math.min(current + 1, tutorialPopup.pages.length - 1),
            )
          }
          onPrevious={() =>
            setTutorialPageIndex((current) => Math.max(0, current - 1))
          }
          pages={tutorialPopup.pages}
          sectionLabel={
            tutorialPopup.pages[tutorialPageIndex]?.sectionLabel ??
            tutorialPopup.label
          }
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
  tight: "자금 빠듯",
  reserve: "자금 여력",
};

const CAMPAIGN_ENVIRONMENT_LABEL: Record<CampaignEnvironmentBand, string> = {
  danger: "환경 위험",
  caution: "환경 주의",
  stable: "환경 안정",
};

const CAMPAIGN_TRUST_LABEL: Record<CampaignTrustBand, string> = {
  low: "신뢰 낮음",
  guarded: "신뢰 경계",
  trusted: "신뢰 견고",
};

const CAMPAIGN_USER_LABEL: Record<CampaignUserBand, string> = {
  contracted: "유저 축소",
  steady: "유저 유지",
  grown: "유저 성장",
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
          <strong id="campaign-ending-hints-title">결산 핵심 관측</strong>
          <small>최종 자금·환경·구매 신뢰·활성 유저 결과를 요약했습니다.</small>
        </div>
      </div>
      {complete ? (
        <p className="campaign-ending-hints-complete">
          자금 여력과 환경 안정, 견고한 구매 신뢰, 유지 이상의 활성 유저 규모가 함께 다음 시즌으로 인계됐습니다.
        </p>
      ) : (
        <ul>
          {hints.map((hint) => (
            <li key={hint.id}>
              <span>최종 결과</span>
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
  const runwayMonths = getOperatingRunwayMonths(
    ending.scores.cash,
    ending.totalUsers,
  );
  const endingTone = ending.qualifiedForBestEnding
    ? "stable"
    : ending.bands.environment === "danger" ||
        ending.bands.cash === "crisis" ||
        (ending.bands.trust === "low" && ending.bands.users === "contracted")
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
        {CAMPAIGN_ENVIRONMENT_LABEL[ending.bands.environment]} ·{" "}
        {CAMPAIGN_TRUST_LABEL[ending.bands.trust]} ·{" "}
        {CAMPAIGN_USER_LABEL[ending.bands.users]}
      </strong>
      <p>{ending.body}</p>
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
            인수 대비 {ending.scores.userDelta >= 0 ? "+" : ""}
            {formatUsers(ending.scores.userDelta)}명 ·{" "}
            {CAMPAIGN_USER_LABEL[ending.bands.users]}
          </small>
        </div>
        <div>
          <dt>구매 신뢰</dt>
          <dd>{Math.round(ending.scores.purchaseTrust)} / 100</dd>
          <small>{CAMPAIGN_TRUST_LABEL[ending.bands.trust]}</small>
        </div>
      </dl>
      <CampaignEndingHints ending={ending} />
      <small className="campaign-end-note">
        DAY {LAST_DECISION_DAY} 최종 발매 이후 {SETTLEMENT_DAYS}일의 관측
        결과로 확정된 공식 기록입니다.
      </small>
      <button className="primary-action" onClick={onReturnToPlay} type="button">
        PLAY 화면으로 돌아가기
      </button>
    </section>
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
        <p>새 임기를 시작하면 기존 저장을 DAY 1 상태로 교체하며 되돌릴 수 없습니다. 진행한 날짜와 확정한 결정은 자동 저장됩니다.</p>
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
  const challenge = BUSINESS_CHALLENGE_BY_TYPE[action];
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
            <span>CHALLENGE AUTHORIZATION · STRATEGIC PROJECT</span>
            <h2 id="strategic-project-confirm-title">
              {withKoreanObjectParticle(definition.title)} 집행할까요?
            </h2>
            <p id="strategic-project-confirm-description">
              대형 프로젝트 슬롯은 임기 중 한 번뿐입니다. 집행 후 공개된
              목표를 마감일까지 충족한 날짜 수로 결과를 판정합니다.
            </p>
          </header>
        </div>

        <div
          aria-label="대형 프로젝트 도전과제 상세"
          className="pack-odds-confirm-body"
          role="region"
          tabIndex={-1}
        >
          <dl className="pack-odds-confirm-facts">
            <div>
              <dt>판정 지표</dt>
              <dd>
                {BUSINESS_CHALLENGE_METRIC_LABEL[challenge.metric]} ≥ {challenge.threshold}점
              </dd>
            </div>
            <div>
              <dt>집행 / 성공 회수</dt>
              <dd>₩{formatRevenue(definition.cost)} / ₩{formatRevenue(definition.successReturn ?? 0)}</dd>
            </div>
            <div>
              <dt>유지 조건</dt>
              <dd>{challenge.requiredQualifyingDays} / {challenge.deadlineOffset}일</dd>
            </div>
            <div>
              <dt>결과 확정</dt>
              <dd>DAY {game.day + challenge.deadlineOffset}</dd>
            </div>
          </dl>

          <div className="pack-odds-confirm-warning">
            <strong>확률 추첨 없이 공개 지표로 판정</strong>
            <span>
              달성 현황은 0 / {challenge.requiredQualifyingDays}일에서 시작하며,
              매일의 지표가 기준 이상인지 기록합니다.
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
            조건 확인 · 집행
          </button>
        </div>
      </div>
    </div>
  );
}

type MetaWorkspaceProps = {
  game: GameState;
  rankedThemes: ThemeContent[];
  placementReport: RecentPlacementReport;
  selectedTheme: ThemeContent;
  selectedRuntime: GameState["themes"][string];
  nextBanDay: number;
  banDraft: Record<string, RestrictionLimit>;
  restrictionChanges: [string, RestrictionLimit][];
  highlightedPartId: string | null;
  mobileDetail: boolean;
  detailHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onSelectTheme: (themeId: ThemeId, partId?: string) => void;
  onOpenSupport: (themeId: ThemeId) => void;
  onRequestThemeRelease: (
    kind: "indirect-support" | "environment-target" | "reprint",
    themeId: ThemeId,
  ) => void;
  onBackToThemes: () => void;
  onDraftChange: (partId: string, limit: RestrictionLimit) => void;
  onResetDraft: () => void;
  onSubmitRestriction: () => void;
};

function MetaWorkspace({
  game,
  rankedThemes,
  placementReport,
  selectedTheme,
  selectedRuntime,
  nextBanDay,
  banDraft,
  restrictionChanges,
  highlightedPartId,
  mobileDetail,
  detailHeadingRef,
  onSelectTheme,
  onOpenSupport,
  onRequestThemeRelease,
  onBackToThemes,
  onDraftChange,
  onResetDraft,
  onSubmitRestriction,
}: MetaWorkspaceProps) {
  const [catalogMode, setCatalogMode] = useState<"themes" | "generic">("themes");
  const [requestHelpOpen, setRequestHelpOpen] = useState(false);
  const themeListRef = useRef<HTMLDivElement>(null);
  const releasedPartIds = new Set(selectedRuntime.releasedPartIds);
  const releasedParts = selectedTheme.parts.filter((part) =>
    releasedPartIds.has(part.id),
  );
  const releasedGenericCards = getReleasedGenericCardReferences(game).filter(
    (entry) =>
      Object.prototype.hasOwnProperty.call(game.genericLimits, entry.card.id),
  );
  const capacity = getRestrictionChangeCapacity(
    game,
    Object.fromEntries(restrictionChanges) as Record<string, RestrictionLimit>,
  );
  const editing = game.phase === "ban-edit";
  const selectedPlacement =
    placementReport.themes[selectedTheme.id] ?? EMPTY_PLACEMENT_METRICS;
  const committedSupportCount = getCommittedSupportCount(game, selectedTheme.id);
  const supportProposalAvailable = canProposeSupport(game, selectedTheme.id);
  const indirectRequestAvailable =
    getIndirectSupportGenericPool(game, selectedTheme.id).length > 0;
  const targetRequestAvailable =
    getEnvironmentTargetGenericPool(game, selectedTheme.id).length > 0;
  const reprintRequestAvailable = getReprintCandidates(game).some(
    (candidate) => candidate.themeId === selectedTheme.id,
  );

  function wouldExceedCap(partId: string, limit: RestrictionLimit) {
    const projected = getRestrictionChangeCapacity(game, {
      ...Object.fromEntries(restrictionChanges),
      [partId]: limit,
    } as Record<string, RestrictionLimit>);
    return !projected.withinLimit;
  }

  useEffect(() => {
    const list = themeListRef.current;
    if (!list) return;

    const keepWheelLocal = (event: WheelEvent) => {
      if (event.deltaY === 0) return;

      const maxScrollTop = list.scrollHeight - list.clientHeight;
      const reachedStart = event.deltaY < 0 && list.scrollTop <= 0;
      const reachedEnd = event.deltaY > 0 && list.scrollTop >= maxScrollTop;

      event.stopPropagation();
      if (maxScrollTop <= 0 || reachedStart || reachedEnd) {
        event.preventDefault();
      }
    };

    list.addEventListener("wheel", keepWheelLocal, { passive: false });
    return () => list.removeEventListener("wheel", keepWheelLocal);
  }, [catalogMode]);

  function renderLimitControl(
    cardId: string,
    cardName: string,
    official: RestrictionLimit,
  ) {
    const draft = banDraft[cardId] ?? official;
    return (
      <>
        {editing ? (
          <div
            aria-label={`${cardName} 허용 매수`}
            className="copy-control"
            data-tutorial-control="restriction-limits"
            role="group"
          >
            {([0, 1, 2, 3] as RestrictionLimit[]).map((limit) => {
              const capDisabled =
                draft !== limit && wouldExceedCap(cardId, limit);
              return (
                <button
                  aria-pressed={draft === limit}
                  className={draft === limit ? "active" : ""}
                  data-tutorial-term={
                    limit === 0
                      ? "forbidden"
                      : limit === 1
                        ? "limited"
                        : limit === 2
                          ? "semi-limited"
                          : "unlimited"
                  }
                  disabled={capDisabled}
                  key={limit}
                  onClick={() => onDraftChange(cardId, limit)}
                  title={
                    capDisabled
                      ? "현재 카드풀에서 더 이상 금제할 수 없습니다."
                      : `${LIMIT_LABELS[limit]} ${limit}장`
                  }
                  type="button"
                >
                  {limit}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="locked-copy">—</span>
        )}
        {draft !== official ? (
          <small className="change-note">
            {official} → {draft}
          </small>
        ) : null}
      </>
    );
  }

  return (
    <section className="meta-workspace cards">
      <header className="subpage-heading cards-heading">
        <div>
          <span className="eyebrow">CARD REGISTRY</span>
          <h1>카드</h1>
          <p>테마 카드와 범용 카드의 현행 제한과 시장 반응을 한곳에서 봅니다.</p>
        </div>
        <div
          aria-label="카드 목록 종류"
          className="card-catalog-switch"
          role="group"
        >
          <button
            aria-pressed={catalogMode === "themes"}
            className={catalogMode === "themes" ? "active" : ""}
            data-tutorial-control="card-catalog-themes"
            onClick={() => setCatalogMode("themes")}
            type="button"
          >
            테마 리스트
          </button>
          <button
            aria-pressed={catalogMode === "generic"}
            className={catalogMode === "generic" ? "active" : ""}
            data-tutorial-control="card-catalog-generic"
            onClick={() => setCatalogMode("generic")}
            type="button"
          >
            범용 리스트
          </button>
        </div>
      </header>

      {catalogMode === "themes" ? (
        <div className={`meta-layout ${mobileDetail ? "show-detail" : "show-list"}`}>
          <aside className="theme-panel" aria-label="테마 목록">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">THEME INDEX</span>
                <h2>테마 리스트</h2>
                <p>{rankedThemes.length}개 출시 테마</p>
              </div>
              <span className="data-stamp">DAY {game.day}</span>
            </div>
            <div
              className="theme-list"
              ref={themeListRef}
              role="list"
            >
              {rankedThemes.map((theme) => {
                const runtime = game.themes[theme.id];
                const placement =
                  placementReport.themes[theme.id] ?? EMPTY_PLACEMENT_METRICS;
                const tier = getPlacementTier(
                  placement.placementShare,
                  placementReport.endDay,
                  getThemeDebutDay(game.releaseHistory, theme.id),
                );
                return (
                  <div
                    className={
                      theme.id === selectedTheme.id
                        ? "theme-row selected"
                        : "theme-row"
                    }
                    key={theme.id}
                    role="listitem"
                    style={{ "--theme-accent": theme.color } as React.CSSProperties}
                  >
                    <button
                      aria-current={
                        theme.id === selectedTheme.id ? "true" : undefined
                      }
                      className="theme-select"
                      onClick={() => {
                        onSelectTheme(theme.id);
                      }}
                      type="button"
                    >
                      <span aria-hidden="true" className="theme-emblem-frame">
                        <ThemeEmblem
                          decorative
                          detail="compact"
                          size="100%"
                          themeId={theme.id}
                        />
                      </span>
                      <span className="theme-row-copy">
                        <strong>{theme.name}</strong>
                        <small>
                          유저 {formatPercent(runtime.share)} · 입상{" "}
                          {formatPercent(placement.placementShare)}
                        </small>
                      </span>
                      <span
                        className={`tier-label ${getTierTone(tier.tier)}`}
                      >
                        {tier.tier}
                      </span>
                    </button>
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
              className="detail-hero cards-detail-hero"
              style={{ "--theme-accent": selectedTheme.color } as React.CSSProperties}
            >
              <div className="detail-title-block">
                <div className="theme-identity">
                  <span aria-hidden="true" className="theme-emblem-hero">
                    <ThemeEmblem
                      decorative
                      detail="full"
                      size="100%"
                      themeId={selectedTheme.id}
                    />
                  </span>
                  <div>
                    <span className="eyebrow">THEME CARDS</span>
                    <h2 id="theme-detail-title" ref={detailHeadingRef} tabIndex={-1}>
                      {selectedTheme.name}
                    </h2>
                  </div>
                </div>
                <div className="card-release-request-actions" aria-label="다음 발매 요청">
                  <button
                    aria-controls="release-request-help"
                    aria-expanded={requestHelpOpen}
                    aria-label="발매 요청 종류 설명"
                    className="card-release-request-info"
                    onClick={() => setRequestHelpOpen((current) => !current)}
                    title="지원·간접·저격·재판의 차이"
                    type="button"
                  >
                    <span aria-hidden="true">ⓘ</span>
                  </button>
                  <button
                    data-tutorial-control="release-request-support"
                    disabled={!supportProposalAvailable}
                    onClick={() => onOpenSupport(selectedTheme.id)}
                    title={
                      committedSupportCount >= 3
                          ? "세 차례 지원이 모두 확정되었습니다."
                          : "기존 테마의 보강 방향을 요청합니다."
                    }
                    type="button"
                  >
                    지원
                  </button>
                  <button
                    data-tutorial-control="release-request-indirect"
                    disabled={!indirectRequestAvailable}
                    onClick={() => onRequestThemeRelease("indirect-support", selectedTheme.id)}
                    title="키워드가 맞는 범용 카드 후보를 요청합니다."
                    type="button"
                  >
                    간접
                  </button>
                  <button
                    data-tutorial-control="release-request-target"
                    disabled={!targetRequestAvailable}
                    onClick={() => onRequestThemeRelease("environment-target", selectedTheme.id)}
                    title="선택한 테마를 견제할 범용 카드 후보를 요청합니다."
                    type="button"
                  >
                    저격
                  </button>
                  <button
                    data-tutorial-control="release-request-reprint"
                    disabled={!reprintRequestAvailable}
                    onClick={() => onRequestThemeRelease("reprint", selectedTheme.id)}
                    title="선택한 테마의 출시 카드 재판을 요청합니다."
                    type="button"
                  >
                    재판
                  </button>
                </div>
                <div className="theme-detail-context">
                  <div
                    aria-hidden={requestHelpOpen}
                    className="theme-detail-summary"
                  >
                    <p className="theme-playstyle-line">{selectedTheme.playstyle}</p>
                    <PlayKeywordChips game={game} theme={selectedTheme} />
                  </div>
                  {requestHelpOpen ? (
                    <div
                      aria-label="발매 요청 종류"
                      className="card-release-request-help"
                      id="release-request-help"
                      role="region"
                    >
                      <span><strong>지원</strong> 선택 테마 전용 보강</span>
                      <span><strong>간접</strong> 키워드가 맞는 범용 카드</span>
                      <span><strong>저격</strong> 선택 테마를 견제하는 범용 카드</span>
                      <span><strong>재판</strong> 이미 출시된 카드의 재록</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                className="theme-metrics compact"
                data-tutorial-control="theme-metrics"
              >
                <div data-tutorial-term="user-share">
                  <span>유저 비율</span>
                  <strong>{formatPercent(selectedRuntime.share)}</strong>
                </div>
                <div data-tutorial-term="top-cut-share">
                  <span>입상 점유율</span>
                  <strong>{formatPercent(selectedPlacement.placementShare)}</strong>
                </div>
                <div data-tutorial-term="win-rate">
                  <span>승률</span>
                  <strong>{formatPercent(selectedRuntime.winRate)}</strong>
                </div>
              </div>
            </div>

            <div className="parts-section">
              <div className="parts-heading">
                <div>
                  <span className="eyebrow">THEME CARD LIST</span>
                  <h3>테마 카드 {releasedParts.length}장</h3>
                  <p>가격은 현재 시세와 7일 등락만 표시합니다.</p>
                </div>
                {editing ? (
                  <span className="editing-chip">
                    <GavelIcon size={14} /> 금제안 편집 중
                  </span>
                ) : game.day >= LAST_BAN_DAY ? (
                  <span className="readonly-chip">금제 일정 종료</span>
                ) : (
                  <span className="readonly-chip">
                    DAY {nextBanDay} 조정 가능
                  </span>
                )}
              </div>
              <div
                className="parts-table-wrap"
                data-tutorial-control="theme-card-table"
              >
                <table className="parts-table card-registry-table">
                  <caption className="sr-only">
                    {selectedTheme.name} 카드와 현행 제한
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">카드 · 출시 · 채용</th>
                      <th data-tutorial-term="card-market-price" scope="col">시세</th>
                      <th scope="col">현행</th>
                      <th scope="col">조정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releasedParts.map((part) => {
                      const stats = selectedRuntime.partStats[part.id];
                      const official = selectedRuntime.legalLimits[part.id];
                      const draft = banDraft[part.id] ?? official;
                      const quote = getThemeCardMarketQuote(
                        game,
                        selectedTheme.id,
                        part.id,
                        7,
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
                          data-tutorial-control={`card-market-${part.id}`}
                          id={`part-${part.id}`}
                          key={part.id}
                        >
                          <th scope="row">
                            <span className="card-name-cell">
                              <strong>{part.name}</strong>
                              <small>{ROLE_LABELS[part.role]}</small>
                              <span className="card-row-meta">
                                <span>{getPartReleaseLabel(game, selectedTheme, part.id)}</span>
                                <span data-tutorial-term="adoption-rate">
                                  채용 {formatPercent(stats.usageRate, 0)} · {stats.averageCopies.toFixed(1)}장
                                </span>
                              </span>
                            </span>
                          </th>
                          <td data-label="시세">
                            {quote ? <CardMarketQuote compact quote={quote} /> : "—"}
                          </td>
                          <td data-label="현행">
                            <span className="official-limit">
                              {official}장
                              <small>{LIMIT_LABELS[official]}</small>
                            </span>
                          </td>
                          <td data-label="조정">
                            {renderLimitControl(part.id, part.name, official)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="generic-card-catalog" aria-labelledby="generic-card-title">
          <div className="parts-heading">
            <div>
              <span className="eyebrow">GENERIC CARD LIST</span>
              <h2 id="generic-card-title">범용 리스트</h2>
              <p>출시된 범용 카드 {releasedGenericCards.length}장</p>
            </div>
            {editing ? (
              <span className="editing-chip">
                <GavelIcon size={14} /> 금제안 편집 중
              </span>
            ) : (
              <span className="readonly-chip">현행 제한 열람</span>
            )}
          </div>
          <div className="parts-table-wrap">
            <table className="parts-table card-registry-table generic">
              <caption className="sr-only">출시 범용 카드와 현행 제한</caption>
              <thead>
                <tr>
                  <th scope="col">카드 · 출시 · 채용 테마</th>
                  <th data-tutorial-term="card-market-price" scope="col">시세</th>
                  <th scope="col">현행</th>
                  <th scope="col">조정</th>
                </tr>
              </thead>
              <tbody>
                {releasedGenericCards.map((entry) => {
                  const official = entry.legalLimit;
                  const draft = banDraft[entry.card.id] ?? official;
                  const quote = getGenericCardMarketQuote(
                    game,
                    entry.card,
                    entry.releaseDay,
                    entry.meta,
                    7,
                  );
                  return (
                    <tr
                      className={draft !== official ? "part-changed" : ""}
                      id={`generic-card-${entry.card.id}`}
                      key={entry.card.id}
                    >
                      <th scope="row">
                        <span className="generic-restriction-name">
                          <GenericCardMark compact />
                          <span>
                            <strong>{entry.card.name}</strong>
                            <small>
                              {getPlayKeyword(entry.card.keyword).label}
                            </small>
                            <span className="card-row-meta">
                              <span>DAY {entry.releaseDay}</span>
                              <span data-tutorial-term="adoption-rate">
                                <GenericAdopterNames
                                  game={game}
                                  limit={3}
                                  meta={entry.meta}
                                />
                              </span>
                            </span>
                          </span>
                        </span>
                      </th>
                      <td data-label="시세">
                        <CardMarketQuote compact quote={quote} />
                      </td>
                      <td data-label="현행">
                        <span className="official-limit">
                          {official}장
                          <small>{LIMIT_LABELS[official]}</small>
                        </span>
                      </td>
                      <td data-label="조정">
                        {renderLimitControl(
                          entry.card.id,
                          entry.card.name,
                          official,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className={editing ? "decision-footer active" : "decision-footer"}>
        <div>
          <strong>
            {editing
              ? "금제안 편집 중"
              : game.day >= LAST_BAN_DAY
                ? "최종 금제 반영 완료"
                : `다음 금제위원회까지 D-${Math.max(0, nextBanDay - game.day)}`}
          </strong>
          <p>
            {editing
              ? "카드별 현행 제한을 확인하고 조정안을 제출하세요."
              : "현행 제한은 열람할 수 있고 금제위원회가 열린 날에만 편집할 수 있습니다."}
          </p>
        </div>
        {editing ? (
          <div className="decision-actions" data-tutorial-control="restriction-actions">
            <button
              className="text-action"
              data-tutorial-term="restriction-reset"
              onClick={onResetDraft}
              type="button"
            >
              초기화
            </button>
            <button
              className="primary-action"
              data-sound="restriction"
              data-tutorial-term="restriction-submit"
              disabled={!capacity.withinLimit}
              onClick={onSubmitRestriction}
              type="button"
            >
              {restrictionChanges.length > 0
                ? "금제안 제출"
                : "변경 없음으로 제출"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DistributionView({
  game,
  guidedInspection = false,
  guidedModeTarget = null,
  guidedPlacementInspection = false,
  total,
  nextReleaseDay,
  nextBanDay,
  rankedThemes,
  placementReport,
  previousPlacementReport,
  onSelectTheme,
  onGuidedModeConfirm,
}: {
  game: GameState;
  guidedInspection?: boolean;
  guidedModeTarget?: DistributionMode | null;
  guidedPlacementInspection?: boolean;
  total: number;
  nextReleaseDay: number;
  nextBanDay: number;
  rankedThemes: ThemeContent[];
  placementReport: RecentPlacementReport;
  previousPlacementReport: RecentPlacementReport;
  onSelectTheme: (themeId: ThemeId) => void;
  onGuidedModeConfirm?: () => void;
}) {
  const [distributionMode, setDistributionMode] =
    useState<DistributionMode>("top-cut");
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [placementExpanded, setPlacementExpanded] = useState(false);
  const placementVisible = placementExpanded || guidedPlacementInspection;
  const latestPlacementDay = game.history.at(-1);
  const dailyPlacementRows = useMemo(() => {
    if (!latestPlacementDay) return [];
    const placements = getDailyTopCutPlacements(latestPlacementDay, game.seed);
    return (Object.entries(placements) as [ThemeId, number][])
      .filter(([, count]) => count > 0)
      .sort(([leftId, leftCount], [rightId, rightCount]) =>
        rightCount - leftCount || leftId.localeCompare(rightId),
      )
      .map(([themeId, count], rank) => ({
        count,
        rank: rank + 1,
        theme: THEME_BY_ID[themeId],
      }));
  }, [game.seed, latestPlacementDay]);
  const chartEntries = useMemo(
    () =>
      buildDistributionEntries(game, placementReport, distributionMode).map(
        (entry) => ({
          ...entry,
          theme: entry.themeId ? THEME_BY_ID[entry.themeId] : null,
        }),
      ),
    [distributionMode, game, placementReport],
  );
  const previousEntries = useMemo(
    () =>
      buildDistributionEntries(
        game,
        previousPlacementReport,
        distributionMode,
      ),
    [distributionMode, game, previousPlacementReport],
  );
  const tierThreeEntry = chartEntries.find(
    (entry) => entry.id === "tier-three-other",
  );
  const tierThreeThemes = (tierThreeEntry?.memberThemeIds ?? []).map(
    (themeId) => ({
      theme: THEME_BY_ID[themeId],
      placement:
        placementReport.themes[themeId] ?? EMPTY_PLACEMENT_METRICS,
    }),
  );
  const individuallyListedThemes = chartEntries.flatMap((entry, rank) =>
    entry.theme
      ? [{
          completeSample: entry.completeSample,
          rank,
          theme: entry.theme,
          placement: {
            ...(placementReport.themes[entry.theme.id] ??
              EMPTY_PLACEMENT_METRICS),
            placementShare: entry.share,
          },
          tier: entry.tier,
        }]
      : [],
  );
  const otherShare = tierThreeEntry?.share ?? 0;
  const otherPreviousShare =
    previousEntries.find((entry) => entry.id === "tier-three-other")?.share ??
    0;
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
          : entry.share * 100;
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
    game.phase === "ban-edit" || game.day < LAST_BAN_DAY;
  const settlementPeriod =
    game.phase === "ended" ||
    (game.phase === "running" && game.day >= SETTLEMENT_START_DAY);
  const inspectedEntryId = hoveredEntryId ?? focusedEntryId;
  const inspectedEntry =
    chartEntries.find((entry) => entry.id === inspectedEntryId) ??
    chartEntries[0];
  const isInspectingEntry = inspectedEntryId === inspectedEntry?.id;
  const topThreeShare = chartEntries
    .filter((entry) => entry.theme)
    .slice(0, 3)
    .reduce((sum, entry) => sum + entry.share, 0);
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
          <span className="eyebrow">
            {distributionMode === "top-cut"
              ? "META DISTRIBUTION"
              : "PLAYER COMPOSITION"}
          </span>
          <h1
            data-tutorial-term={
              distributionMode === "top-cut" ? "top-cut-share" : "user-share"
            }
          >
            {distributionMode === "top-cut" ? "입상 점유율" : "유저 비율"}
          </h1>
          <p>
            {distributionMode === "top-cut"
              ? "최근 14일 주요 대회의 입상 점유율입니다."
              : "메타층·캐주얼층·콜렉터층·리셀층의 현재 구성비입니다."}
          </p>
        </div>
        <div className="distribution-heading-actions">
          {distributionMode === "top-cut" &&
          highestFatigueTheme &&
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

      <div className="distribution-mode-switch" role="group" aria-label="분포 기준">
        <button
          aria-pressed={distributionMode === "top-cut"}
          className={distributionMode === "top-cut" ? "active" : ""}
          data-tutorial-control="distribution-top-cut"
          data-tutorial-term="top-cut-share"
          onClick={() => {
            setDistributionMode("top-cut");
            setHoveredEntryId(null);
            setFocusedEntryId(null);
            if (guidedModeTarget === "top-cut") onGuidedModeConfirm?.();
          }}
          type="button"
        >
          입상 점유율
        </button>
        <button
          aria-pressed={distributionMode === "users"}
          className={distributionMode === "users" ? "active" : ""}
          data-tutorial-control="distribution-users"
          data-tutorial-term="user-share"
          onClick={() => {
            setDistributionMode("users");
            setHoveredEntryId(null);
            setFocusedEntryId(null);
            if (guidedModeTarget === "users") onGuidedModeConfirm?.();
          }}
          type="button"
        >
          유저 비율
        </button>
      </div>

      <section
        aria-label={`DAY ${latestPlacementDay?.day ?? game.day} 대회 입상표`}
        className={`daily-placement-board ${
          placementVisible ? "is-expanded" : "is-collapsed"
        }`}
        data-tutorial-term="placement"
        data-tutorial-target={guidedPlacementInspection ? "active" : undefined}
      >
        <header>
          <div>
            <strong>오늘의 입상표</strong>
          </div>
          <span>
            DAY {latestPlacementDay?.day ?? game.day} · TOP {dailyPlacementRows.reduce((sum, row) => sum + row.count, 0)}
          </span>
          <button
            aria-expanded={placementVisible}
            onClick={() => setPlacementExpanded((current) => !current)}
            type="button"
          >
            {placementVisible ? "접기" : `${dailyPlacementRows.length}개 결과 보기`}
          </button>
        </header>
        <div className="daily-placement-list" role="list">
          {dailyPlacementRows.map((row) => (
            <div key={row.theme.id} role="listitem">
              <b>{row.rank}</b>
              <i aria-hidden="true" style={{ background: row.theme.color }} />
              <strong>{row.theme.shortName}</strong>
              <span>{row.count}석</span>
            </div>
          ))}
        </div>
      </section>

      <div className="distribution-layout">
        <article className="distribution-chart-card" data-tutorial-control="distribution-donut">
          <div
            className={`distribution-donut${isInspectingEntry ? " is-inspecting" : ""}`}
            onPointerLeave={() => setHoveredEntryId(null)}
          >
            <svg
              aria-label={
                distributionMode === "top-cut"
                  ? "입상 점유율 분포입니다. 비율이 큰 테마부터 12시 방향에서 시계 방향으로 배치하며 기타는 마지막입니다."
                  : "플레이어 계층 구성비입니다. 인원이 많은 계층부터 12시 방향에서 시계 방향으로 배치합니다."
              }
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
                strokeWidth="12"
              />
              {distributionSlices.map(({ entry, offset, size }) => {
                const isActive =
                  isInspectingEntry && inspectedEntry?.id === entry.id;
                const shareLabel = formatPercent(entry.share);
                const ariaLabel = entry.kind === "player-segment"
                  ? `${entry.label}, ${formatUsers(entry.count)}명, 구성비 ${shareLabel}`
                  : entry.theme
                    ? entry.completeSample
                    ? `${entry.label}, ${distributionMode === "top-cut" ? "입상 점유율" : "유저 비율"} ${shareLabel}. 상세 정보 열기`
                    : `${entry.label}, 집계 ${entry.observedDays}/${PLACEMENT_WINDOW_DAYS}, ${distributionMode === "top-cut" ? "입상 점유율" : "유저 비율"} ${shareLabel}. 상세 정보 열기`
                  : `기타, 3티어 ${tierThreeThemes.length}개 테마 합산 ${distributionMode === "top-cut" ? "입상 점유율" : "유저 비율"} ${shareLabel}`;

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
                      strokeWidth="12"
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
                <strong>{inspectedEntry?.label ?? "-"}</strong>
                <em>{inspectedEntry ? formatPercent(inspectedEntry.share) : "-"}</em>
              </div>
            </div>
          </div>
          {distributionMode === "top-cut" ? (
          <div className="distribution-kpis">
            <div data-tutorial-term="active-users">
              <span>활성 유저</span>
              <strong>{formatUsers(total)}</strong>
            </div>
            <div data-tutorial-term="environment-health">
              <span>생태계 건강</span>
              <strong
                title={`경기 품질 ${Math.round(healthBreakdown.gameplayQuality)} · 입상 다양성 ${Math.round(healthBreakdown.placementDiversity)} · 상위권 순환 ${Math.round(healthBreakdown.topCohortTurnover)} · 세대 공존 ${Math.round(healthBreakdown.generationalBalance)} · 생태계 연속성 ${Math.round(healthBreakdown.ecosystemContinuity)}`}
              >
                {health}
              </strong>
              <small>다양성 · 순환</small>
            </div>
            <div>
              <span>상위 3개 집중</span>
              <strong>{formatPercent(topThreeShare)}</strong>
              <small>{distributionMode === "top-cut" ? "14일 입상 기준" : "활성 유저 기준"}</small>
            </div>
            <div data-tutorial-term="purchase-trust">
              <span>구매 신뢰</span>
              <strong>{Math.round(game.purchaseTrust)}</strong>
              <small>100점 기준</small>
            </div>
          </div>
          ) : null}
        </article>

        <ol
          className="distribution-legend"
          data-tutorial-control="distribution-legend"
          aria-label={
            distributionMode === "top-cut"
              ? "입상 점유율 순위. 기타는 마지막입니다."
              : "플레이어 계층별 인원과 구성비. 큰 비율 순입니다."
          }
        >
          {distributionMode === "users"
            ? chartEntries.map((entry, rank) => (
                <li
                  className="player-segment-entry"
                  data-tutorial-term={
                    entry.segmentId ? `${entry.segmentId}-segment` : undefined
                  }
                  key={entry.id}
                >
                  <div>
                    <span className="legend-rank">{rank + 1}</span>
                    <span
                      aria-hidden="true"
                      className="legend-color"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="legend-theme">
                      <strong>{entry.label}</strong>
                      <small>{formatUsers(entry.count)}명</small>
                    </span>
                    <span className="legend-share">
                      <strong>{formatPercent(entry.share)}</strong>
                      <small>구성비</small>
                    </span>
                  </div>
                </li>
              ))
            : null}
          {distributionMode === "top-cut" ? (
          <>
          {individuallyListedThemes.map(({
            completeSample,
            theme,
            tier,
            rank,
            placement,
          }) => {
            const runtime = game.themes[theme.id];
            const previousShare = previousEntries.find(
              (entry) => entry.themeId === theme.id,
            )?.share ?? 0;
            const delta = placement.placementShare - previousShare;
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
                      {completeSample
                        ? distributionMode === "top-cut"
                          ? `${tier} · 피로 ${Math.round(runtime.fatigue)}`
                          : `활성 유저 기준 · 피로 ${Math.round(runtime.fatigue)}`
                        : `집계 ${placement.observedDays}/${PLACEMENT_WINDOW_DAYS}`}
                    </small>
                    {fatigue.level !== "none" ? (
                      <span className={`fatigue-badge ${fatigue.level}`}>
                        {fatigue.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="legend-share">
                    <strong>{formatPercent(placement.placementShare)}</strong>
                    {distributionMode === "top-cut" ? (
                      <small className={delta >= 0 ? "positive" : "negative"}>
                        {delta >= 0 ? "+" : ""}
                        {formatPercent(delta, 2)}p
                      </small>
                    ) : (
                      <small>현재 활성 유저</small>
                    )}
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
                  {distributionMode === "top-cut" ? (
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
                  ) : (
                    <small>현재 활성 유저</small>
                  )}
                </span>
                <span aria-hidden="true" />
              </div>
            </li>
          ) : null}
          </>
          ) : null}
        </ol>
      </div>

      <div className="distribution-footer">
        <span>
          <RevenueIcon size={16} />
          <span className="distribution-footer-label">최근 30일 매출</span>
          <strong>₩{formatRevenue(game.finance.rolling30)}</strong>
        </span>
        <span>
          <CalendarIcon size={16} />
          <span className="distribution-footer-label">임기 종료</span>
          <strong>
            DAY {CAMPAIGN_END_DAY} · {Math.max(0, CAMPAIGN_END_DAY - game.day)}일 남음
          </strong>
        </span>
        <span aria-label="결산 평가: 자금 여력, 환경 안정, 장기 운영 기록 종합 반영">
          <TrendIcon size={16} />
          <span className="distribution-footer-label">결산 평가</span>
          <strong>자금 · 환경 · 운영 기록 종합</strong>
        </span>
      </div>
    </section>
  );
}

function OverviewCard({ className = "", dataTutorialTerm, icon, label, value, note }: { className?: string; dataTutorialTerm?: string; icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className={`overview-card ${className}`.trim()} data-tutorial-term={dataTutorialTerm}><div className="overview-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReleasesView({
  game,
  onReleaseDraftChange,
  onSubmitRelease,
  releaseDraft,
}: {
  game: GameState;
  onReleaseDraftChange: (optionIds: string[]) => void;
  onSubmitRelease: (selections: ReleaseSelection[]) => void;
  releaseDraft: readonly string[];
}) {
  const releaseBatches = [...game.releaseHistory]
    .filter((batch) => !isInitialGenericReleaseBatch(batch))
    .reverse();
  return (
    <section
      className="subpage release-history-page"
      data-tutorial-control="release-archive"
    >
      <header className="subpage-heading">
        <div>
          <span className="eyebrow">RELEASE ARCHIVE</span>
          <h1>발매</h1>
          <p>출시일, 카드팩, 신테마 상징을 중심으로 발매 기록을 확인합니다.</p>
        </div>
        <div className="release-history-count" aria-label="발매 기록 수">
          <ReleaseIcon size={18} />
          <span>발매 기록</span>
          <strong>{releaseBatches.length}회</strong>
        </div>
      </header>
      {game.phase === "release-edit" && game.releaseSlate ? (
        <ReleaseDecisionPanel
          game={game}
          onChange={onReleaseDraftChange}
          onSubmit={onSubmitRelease}
          selectedOptionIds={releaseDraft}
        />
      ) : null}
      {releaseBatches.length > 0 ? (
        <div className="release-pack-list">
          {releaseBatches.map((batch) => (
            <ReleasePackCard batch={batch} key={batch.day} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          아직 발매 기록이 없습니다.
        </div>
      )}
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
  guidedPostTarget = false,
  flashDay,
  onGuidedPostOpen,
  onFlashComplete,
  onSelectTheme,
}: {
  game: GameState;
  guidedInspection?: boolean;
  guidedPostTarget?: boolean;
  flashDay: number | null;
  onGuidedPostOpen?: () => void;
  onFlashComplete: () => void;
  onSelectTheme: (themeId: ThemeId, partId?: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const safeDay = selectedDay === null
    ? game.day
    : Math.max(1, Math.min(game.day, selectedDay));
  const posts = getDailyCommunityPosts(game, safeDay);
  const engagedPosts = rankCommunityPostsByLikes(game, posts);
  const profile = getReleaseReactionProfile(game, safeDay);
  const heat = getCommunityHeat(game, safeDay);
  const releaseDecisionToday = game.releaseHistory.some(
    (batch) =>
      batch.day === safeDay && !isInitialGenericReleaseBatch(batch),
  );
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
        <div
          className="community-day-controls"
          data-tutorial-control="community-day"
          aria-label="게시글 날짜"
        >
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
        {engagedPosts.map(({ event, likes, isPopular }, index) => {
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
              className={`feed-post reaction-${reactionTone}${isRestrictionWave ? " restriction-wave" : ""}${isPopular ? " is-popular" : ""}`}
              data-tutorial-control={
                guidedPostTarget && index === 0 ? "community-post" : undefined
              }
              key={event.id}
              onClick={() => {
                if (!guidedInspection) {
                  onSelectTheme(event.themeId, event.partId);
                  if (guidedPostTarget && index === 0) onGuidedPostOpen?.();
                }
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
              <span
                aria-label={`좋아요 ${likes.toLocaleString("ko-KR")}개`}
                className="feed-likes"
              >
                ♥ {likes.toLocaleString("ko-KR")}
                {isPopular ? <em>인기</em> : null}
              </span>
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
      release: game.releaseHistory.some(
        (batch) =>
          batch.day === entry.day && !isInitialGenericReleaseBatch(batch),
      ),
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

function getFinanceChartDomain(
  values: number[],
  minimumSpan: number,
): { min: number; max: number } {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return { min: 0, max: minimumSpan };

  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  const paddedSpan = Math.max((rawMax - rawMin) * 1.24, minimumSpan);
  const center = (rawMin + rawMax) / 2;
  let min = center - paddedSpan / 2;
  let max = center + paddedSpan / 2;
  if (min < 0) {
    max -= min;
    min = 0;
  }
  return { min, max };
}

function FinanceMarketChart({
  game,
  guidedInspection = false,
}: {
  game: GameState;
  guidedInspection?: boolean;
}) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const data = useMemo(() => getFinanceChartData(game), [game]);
  const width = 1200;
  const height = 310;
  const left = 94;
  const right = 68;
  const top = 38;
  const plotBottom = 266;
  const plotWidth = width - left - right;
  const revenueValues = data.map((point) => point.revenue);
  const cashValues = data
    .map((point) => point.cash)
    .filter((value): value is number => value !== null);
  const scoreValues = data.flatMap((point) =>
    [
      point.environmentHealth,
      point.purchaseTrust,
      point.communitySentiment,
    ].filter((value): value is number => value !== null),
  );
  const highestRevenue = Math.max(0, ...revenueValues);
  const highestCash = Math.max(0, ...cashValues);
  const revenueDomain = getFinanceChartDomain(
    revenueValues,
    Math.max(0.015, highestRevenue * 0.24),
  );
  const cashDomain = getFinanceChartDomain(
    cashValues,
    Math.max(0.2, highestCash * 0.08),
  );
  const rawScoreDomain = getFinanceChartDomain([...scoreValues, 50], 20);
  let scoreMin = Math.max(0, Math.floor(rawScoreDomain.min / 5) * 5);
  let scoreMax = Math.min(100, Math.ceil(rawScoreDomain.max / 5) * 5);
  if (scoreMax - scoreMin < 20) {
    const missingSpan = 20 - (scoreMax - scoreMin);
    scoreMin = Math.max(0, scoreMin - Math.ceil(missingSpan / 10) * 5);
    scoreMax = Math.min(100, scoreMin + 20);
    scoreMin = Math.max(0, scoreMax - 20);
  }
  const scoreTickStep = Math.max(
    5,
    Math.ceil((scoreMax - scoreMin) / 20) * 5,
  );
  scoreMax = scoreMin + scoreTickStep * 4;
  if (scoreMax > 100) {
    scoreMax = 100;
    scoreMin = Math.max(0, scoreMax - scoreTickStep * 4);
  }
  const xForIndex = (index: number) =>
    data.length <= 1
      ? left + plotWidth / 2
      : left + (index / (data.length - 1)) * plotWidth;
  const yForDomain = (
    value: number,
    domain: { min: number; max: number },
  ) =>
    top +
    ((domain.max - Math.max(domain.min, Math.min(domain.max, value))) /
      (domain.max - domain.min)) *
      (plotBottom - top);
  const yForRevenue = (value: number) => yForDomain(value, revenueDomain);
  const yForCash = (value: number) => yForDomain(value, cashDomain);
  const yForScore = (value: number) =>
    top +
    ((scoreMax - Math.max(scoreMin, Math.min(scoreMax, value))) /
      (scoreMax - scoreMin)) *
      (plotBottom - top);
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
      revenueY: yForRevenue(point.revenue),
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
  const cashPath = getSeriesPath((point) => point.cash, yForCash);
  const sentimentPath = getSeriesPath(
    (point) => point.communitySentiment,
    yForScore,
  );
  const hoveredPoint = points.find((point) => point.day === hoveredDay) ?? null;
  const amountTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return {
      y: top + ratio * (plotBottom - top),
      revenueValue:
        revenueDomain.max - (revenueDomain.max - revenueDomain.min) * ratio,
      cashValue: cashDomain.max - (cashDomain.max - cashDomain.min) * ratio,
    };
  });
  const scoreTicks = Array.from({ length: 5 }, (_, index) => {
    const value = scoreMax - scoreTickStep * index;
    return { value, y: yForScore(value) };
  });
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
          <span className="health" data-tutorial-term="environment-health">생태계 건강</span>
          <span className="trust" data-tutorial-term="purchase-trust">구매 신뢰</span>
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

      <div
        className="finance-chart-stage"
        data-tutorial-control="finance-chart"
        onPointerLeave={() => setHoveredDay(null)}
      >
        <svg
          aria-describedby="finance-chart-description"
          className="finance-market-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>최대 90일 매출, 보유자금, 생태계 건강, 구매 신뢰, 커뮤니티 여론 비교</title>
          <desc id="finance-chart-description">
            일매출과 보유자금은 서로 다른 관측 범위의 왼쪽 금액 축으로, 생태계 건강·구매 신뢰·커뮤니티 여론은 현재 기록 범위에 맞춘 오른쪽 점수 축으로 표시합니다. 축 눈금은 실제 값이며 마우스를 올리면 정확한 수치를 확인할 수 있습니다. 여론은 50점이 중립이며 높을수록 긍정적입니다. 붉은 음영은 매출 급등 당일이나 다음 날 환경 지표가 하락한 구간입니다.
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

          <text className="finance-axis-title amount" x={left} y={17}>매출 / 자금 · 각 관측 범위</text>
          <text className="finance-axis-title score" textAnchor="end" x={width - right} y={17}>시장·여론 지수 · {scoreMin}–{scoreMax}</text>

          <g className="finance-sentiment-neutral" aria-hidden="true">
            <line x1={left} x2={width - right} y1={yForScore(50)} y2={yForScore(50)} />
            <text textAnchor="end" x={width - right - 7} y={yForScore(50) - 6}>여론 중립 50</text>
          </g>

          {amountTicks.map((tick) => (
            <g className="finance-grid-line" key={`amount-${tick.y}`}>
              <line x1={left} x2={width - right} y1={tick.y} y2={tick.y} />
              <text x={left - 10} y={tick.y - 2}>
                <tspan className="revenue-scale" x={left - 10}>{formatRevenue(tick.revenueValue)}</tspan>
                <tspan className="cash-scale" dy={12} x={left - 10}>{formatRevenue(tick.cashValue)}</tspan>
              </text>
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
              cy={yForCash(lastCashPoint.cash)}
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
              data-tutorial-target={guidedInspection ? "active" : undefined}
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
  onRunAction,
}: {
  game: GameState;
  onRunAction: (action: BusinessActionType) => void;
}) {
  const [showUnavailableActions, setShowUnavailableActions] = useState(false);
  const environmentHealth = getBusinessEnvironmentHealth(game);
  const supportNeglect = getSupportNeglectPressure(game);
  const supportNeglectNames = supportNeglect.neglectedThemeIds
    .map((themeId) => THEME_BY_ID[themeId]?.shortName)
    .filter((name): name is string => Boolean(name));
  const purchaseTrustNote = supportNeglect.dailyTrustLoss >= 0.005
    ? `${supportNeglectNames.join(" · ")} 후속 공백으로 하락 압력`
    : "테마 후속 연속성 안정";
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
  const hasLedgerData =
    activeRecords.length + pendingEventResults.length + recentDecisions.length > 0;
  const unavailableActionCount = BUSINESS_ACTIONS.filter(
    (action) => !getBusinessActionAvailability(game, action.type).available,
  ).length;

  return (
    <section className="subpage operations-page">
      <div className="subpage-heading operations-heading">
        <div>
          <span className="eyebrow">BUSINESS OPERATIONS</span>
          <h1>사업 운영</h1>
          <p>일반 액션은 상태 기반 확률, 위험 액션은 결정일 챌린지로 운영합니다.</p>
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
            ? `매출 32% − 운영비 ₩${formatRevenue(game.finance.todayOperatingCost)} − 집행비`
            : "오늘 결정 제출 후 정산"}
          value={formatSignedRevenue(game.finance.todayOperatingCash)}
        />
        <OverviewCard
          dataTutorialTerm="purchase-trust"
          icon={<GavelIcon />}
          label="구매 신뢰"
          note={purchaseTrustNote}
          value={`${Math.round(game.purchaseTrust)} / 100`}
        />
        <OverviewCard
          dataTutorialTerm="environment-health"
          icon={<UsersIcon />}
          label="환경 건강"
          note="챔피언십 도전과제 판정 지표"
          value={`${Math.round(environmentHealth)} · ${environmentLabel}`}
        />
      </div>

      <div
        className={`operations-workspace ${
          hasLedgerData ? "has-ledger" : "is-action-only"
        }`}
      >
        <section className="operations-action-panel" aria-labelledby="business-actions-title">
          <div className="operations-section-heading">
            <div>
              <span className="eyebrow">ACTION DESK</span>
              <h2 id="business-actions-title" tabIndex={-1}>
                집행 가능한 사업 액션
              </h2>
            </div>
            <div className="operations-section-tools">
              <span>비용 단위 · 원</span>
              {unavailableActionCount > 0 ? (
                <button
                  aria-expanded={showUnavailableActions}
                  onClick={() =>
                    setShowUnavailableActions((current) => !current)
                  }
                  type="button"
                >
                  {showUnavailableActions
                    ? "사용 불가 숨기기"
                    : `사용 불가 ${unavailableActionCount}개 보기`}
                </button>
              ) : null}
            </div>
          </div>
          <div
            className="business-action-grid"
            data-tutorial-control="business-actions"
          >
            {BUSINESS_ACTIONS.map((action) => {
              const availability = getBusinessActionAvailability(
                game,
                action.type,
              );
              if (!showUnavailableActions && !availability.available) {
                return null;
              }
              const latest = records.find(
                (record) => record.type === action.type,
              );
              const detectionRisk = action.type === "pack-odds"
                ? getPackOddsDetectionRisk(game)
                : null;
              const successProbability = getBusinessActionSuccessProbability(
                game,
                action.type,
              );
              const challengeDefinition = isChallengeBusinessAction(action.type)
                ? BUSINESS_CHALLENGE_BY_TYPE[action.type]
                : null;
              const challengeProgress = latest?.challenge;
              const challengeMetric =
                challengeProgress?.metric ?? challengeDefinition?.metric;
              const challengeThreshold =
                challengeProgress?.threshold ?? challengeDefinition?.threshold;
              const challengeRequiredDays =
                challengeProgress?.requiredQualifyingDays ??
                challengeDefinition?.requiredQualifyingDays;
              const challengeQualifyingDays =
                challengeProgress?.qualifyingDays ?? 0;
              const challengeDeadline =
                challengeProgress?.deadlineDay ??
                (challengeDefinition
                  ? game.day + challengeDefinition.deadlineOffset
                  : null);
              const challengeLastValue = challengeProgress?.lastValue ?? null;
              const projectedOutcome =
                action.type === "championship" || successProbability !== null
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
              const reason = availability.reason;
              const descriptionId = `business-action-${action.type}-status`;
              const statusText = reason
                ? reason
                : latest
                  ? `최근 DAY ${latest.startedDay} · ${getBusinessRecordStatus(latest, game.day)}`
                  : null;
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
                    <em className={`business-action-model ${
                      successProbability !== null
                        ? "probability"
                        : challengeDefinition
                          ? "challenge"
                          : "detection"
                    }`}>
                      {successProbability !== null
                        ? "일반 · 상태 기반 확률"
                        : challengeDefinition
                          ? "위험 · 결정일 챌린지"
                          : "위험 · 적발 확률"}
                    </em>
                    <small>{action.summary}</small>
                  </div>
                  <dl className="business-action-facts">
                    <div><dt>비용</dt><dd>₩{formatRevenue(action.cost)}</dd></div>
                    <div>
                      <dt>{isStrategicBusinessAction(action.type) ? "구축 기간" : "효과 기간"}</dt>
                      <dd>{action.duration}일</dd>
                    </div>
                    <div>
                      <dt>{"oncePerCampaign" in action && action.oncePerCampaign ? "집행 한도" : "쿨다운"}</dt>
                      <dd>{"oncePerCampaign" in action && action.oncePerCampaign ? "임기 1회" : `${action.cooldown}일`}</dd>
                    </div>
                  </dl>
                  <p className="business-action-effect">
                    {action.effect}
                    {availability.effectivenessMultiplier < 0.999 ? (
                      <small>
                        최근 저위험 사업 과밀 · 현재 효율 {Math.round(
                          availability.effectivenessMultiplier * 100,
                        )}%
                      </small>
                    ) : null}
                  </p>
                  {hasDirectRevenue ? (
                    <div className="business-action-return">
                      <span>
                        {action.type === "championship" || successProbability !== null
                          ? "성공 시 추가 현금(추정)"
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
                  {detectionRisk !== null ? (
                    <div className={`business-action-risk ${action.tone}`}>
                      <span>현재 적발 위험</span>
                      <strong>{Math.round(detectionRisk * 100)}%</strong>
                      <i aria-hidden="true">
                        <span style={{ width: `${detectionRisk * 100}%` }} />
                      </i>
                    </div>
                  ) : null}
                  {successProbability !== null ? (
                    <div className="business-action-risk success">
                      <span>현재 상태 성공 확률</span>
                      <strong>{Math.round(successProbability * 100)}%</strong>
                      <i aria-hidden="true">
                        <span style={{ width: `${successProbability * 100}%` }} />
                      </i>
                    </div>
                  ) : null}
                  {challengeDefinition &&
                  challengeMetric &&
                  challengeThreshold !== undefined &&
                  challengeRequiredDays !== undefined &&
                  challengeDeadline !== null ? (
                    <dl className="business-action-challenge">
                      <div>
                        <dt>도전 목표</dt>
                        <dd>
                          {BUSINESS_CHALLENGE_METRIC_LABEL[challengeMetric]} ≥ {challengeThreshold}점
                        </dd>
                      </div>
                      <div>
                        <dt>달성일</dt>
                        <dd>{challengeQualifyingDays} / {challengeRequiredDays}일</dd>
                      </div>
                      <div>
                        <dt>마감</dt>
                        <dd>DAY {challengeDeadline}</dd>
                      </div>
                      <div>
                        <dt>최근 측정</dt>
                        <dd>
                          {challengeLastValue === null
                            ? "측정 전"
                            : `${challengeLastValue.toFixed(1)}점 · ${challengeLastValue >= challengeThreshold ? "달성" : "미달"}`}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <div className="business-action-footer">
                    {statusText ? <small id={descriptionId}>{statusText}</small> : null}
                    <button
                      aria-describedby={statusText ? descriptionId : undefined}
                      className={action.tone === "danger" ? "danger-action" : "primary-action"}
                      disabled={!availability.available}
                      onClick={() => onRunAction(action.type)}
                      type="button"
                    >
                      {strategicSlotUsed
                        ? "슬롯 사용됨"
                        : availability.cooldownRemaining > 0
                        ? `D-${availability.cooldownRemaining}`
                        : action.type === "pack-odds"
                          ? "위험 확인 · 예약"
                          : successProbability !== null
                            ? "확률 확인 · 집행"
                          : isStrategicBusinessAction(action.type)
                            ? "조건 확인 · 집행"
                            : isChallengeBusinessAction(action.type)
                              ? "도전 시작"
                              : "집행"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {hasLedgerData ? (
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
                        aria-label={
                          record.challenge
                            ? `필요 ${record.challenge.requiredQualifyingDays}일 중 ${record.challenge.qualifyingDays}일 달성`
                            : `${progress.toFixed(0)}% 진행`
                        }
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(progress)}
                        className="operations-record-progress"
                        role="progressbar"
                      >
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <small>
                        DAY {record.startedDay} 집행 · {record.challenge
                          ? `${BUSINESS_CHALLENGE_METRIC_LABEL[record.challenge.metric]} ${record.challenge.threshold}점 이상 · 마감 DAY ${record.challenge.deadlineDay}`
                          : `종료 기준 DAY ${record.endsDay}`}
                      </small>
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
                          {record.type === "pack-odds" && record.risk !== undefined
                            ? ` · 적발 ${Math.round(record.risk * 100)}%`
                            : ""}
                          {isProbabilisticBusinessAction(record.type) && record.risk !== undefined
                            ? ` · 성공 ${Math.round((1 - record.risk) * 100)}%`
                            : ""}
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
                        DAY {record.appearedDay} · {choice?.title ?? record.choice} · 비용 {record.cost > 0 ? `₩${formatRevenue(record.cost)}` : "없음"}
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
        ) : null}
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
  const dailyRate = previousRevenue && previousRevenue > 0
    ? ((latestRevenue - previousRevenue) / previousRevenue) * 100
    : 0;
  const dailyDirection = dailyRate > 0 ? "상승" : dailyRate < 0 ? "하락" : "보합";

  return (
    <section
      className="subpage finance-page"
      data-tutorial-inspection={guidedInspection ? "active" : undefined}
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
      <FinanceMarketChart game={game} guidedInspection={guidedInspection} />
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
  const effectiveKeywordCount = getEffectiveThemePlayKeywords(
    game,
    theme.id,
  ).length;
  const selectedKeyword = getProspectiveSupportKeyword(
    game,
    theme.id,
    direction,
  );
  return (
    <div className="modal-backdrop">
      <div aria-labelledby="support-dialog-title" aria-modal="true" className="support-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <button aria-label="닫기" className="dialog-close" onClick={onClose} type="button">×</button>
        <span className="eyebrow">DESIGN REQUEST</span>
        <h2 id="support-dialog-title">{theme.name} 지원 제안</h2>
        <p>선택한 방향의 지원안이 다음 정기 발매의 지원 시안 한 자리를 보장받고, 실제 발매 다음 날 새 키워드가 붙습니다.</p>
        <fieldset>
          <legend>지원 방향</legend>
          <div className="choice-grid">
            {SUPPORT_DIRECTIONS.map((item) => {
              const keyword = getProspectiveSupportKeyword(
                game,
                theme.id,
                item.value,
              );
              return (
                <label
                  className={direction === item.value ? "choice-card selected" : "choice-card"}
                  key={item.value}
                >
                  <input
                    checked={direction === item.value}
                    name="support-direction"
                    onChange={() => onDirectionChange(item.value)}
                    type="radio"
                  />
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                  {keyword ? (
                    <em className="support-keyword-preview">
                      + {getPlayKeyword(keyword).label}
                    </em>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="release-estimate">
          <ReleaseIcon />
          <div>
            <span>시안 보장일 · 키워드 확장</span>
            <strong>
              DAY {earliest} · {effectiveKeywordCount} → {Math.min(6, effectiveKeywordCount + 1)}종
              {selectedKeyword ? ` · ${getPlayKeyword(selectedKeyword).label}` : ""}
            </strong>
          </div>
        </div>
        <div className="dialog-actions"><button className="text-action" onClick={onClose} type="button">취소</button><button className="primary-action" onClick={onSubmit} type="button">지원 시안 제안</button></div>
      </div>
    </div>
  );
}
