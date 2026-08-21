import type { PlayKeyword, ThemePlayKeywords } from "./play-keywords.ts";
import type { GenericCardId } from "./generic-card-catalog.ts";

export type ThemeId = string;

export type PartRole =
  | "starter1"
  | "starter2"
  | "bridge"
  | "finisher"
  | "recursion";

export type RestrictionLimit = 0 | 1 | 2 | 3;

export type SupportDirection =
  | "consistency"
  | "counterplay"
  | "finisher"
  | "recovery";

export type SupportRisk = "safe" | "competitive" | "headline";

export type PowerAdjustment = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export type ExpectedTier = "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3";

export interface PartContent {
  id: string;
  name: string;
  role: PartRole;
  inclusion: number;
  averageCopies: number;
  preferredCopies: number;
  powerWeight: number;
  unpleasantWeight: number;
  tags: string[];
}

export interface ThemeContentBase {
  id: ThemeId;
  name: string;
  shortName: string;
  playstyle: string;
  aesthetic: string;
  basePower: number;
  baseUnpleasantness: number;
  appeal: number;
  difficulty: number;
  optimizationDays: number;
  counterClarity: number;
  startingShare: number;
  color: string;
  parts: PartContent[];
}

export interface ThemeContent extends ThemeContentBase {
  /** Three authored/derived strategic traits used by matchup simulation. */
  playKeywords: ThemePlayKeywords;
}

export interface PartRuntimeStats {
  usageRate: number;
  averageCopies: number;
}

export interface ThemeRuntime {
  share: number;
  previousWeekShare: number;
  winRate: number;
  power: number;
  unpleasantness: number;
  fatigue: number;
  legalLimits: Record<string, RestrictionLimit>;
  partStats: Record<string, PartRuntimeStats>;
  lastSupportDay: number | null;
  freshness: number;
  topStreakDays: number;
  counterProgress: number;
  counterThreshold: number;
  counterAdoption: number;
  counterDiscoveredDay: number | null;
  counterBuild: number;
  supportPower: number;
  supportUnpleasantness: number;
  /** Number of three-card support waves that have actually taken effect. */
  supportCount: number;
  /** The currently legal/released prefix of the theme's prepared 14-card pool. */
  releasedPartIds: string[];
  /** Tuning chosen for the most recently applied support wave. */
  lastSupportAdjustment: PowerAdjustment | null;
  /** Fractional adoption displaced from older cards by the latest support. */
  supportReplacementPressure: number;
}

export type CommunityCategory =
  | "meta"
  | "counter"
  | "release"
  | "restriction"
  | "finance";

export type CommunityEventType =
  | "counter-rumor"
  | "counter-found"
  | "counter-adopted"
  | "counter-tax"
  | "optimization-rumor"
  | "restriction-demand"
  | "theme-popularity"
  | "release-reaction"
  | "meta-analysis"
  | "support-proposed"
  | "support-released"
  | "restriction-applied"
  | "cosmetic-restriction"
  | "restriction-no-change"
  | "top-theme-changed"
  | "business-reaction"
  | "business-scandal";

export interface CommunityEvent {
  id: string;
  day: number;
  category: CommunityCategory;
  type: CommunityEventType;
  themeId: ThemeId;
  genericCardId?: GenericCardId;
  partId?: string;
  relatedThemeId?: ThemeId;
  proposalId?: string;
  value?: number;
  previousValue?: number;
  body: string;
}

export type ReleaseRequestKind =
  | "support"
  | "indirect-support"
  | "environment-target"
  | "reprint";

export type ReleaseRequestLane = "support" | "generic" | "reprint";

export type ReleaseRequestStatus =
  | "queued"
  | "offered"
  | "released"
  | "skipped"
  | "cancelled"
  | "replaced";

interface ReleaseRequestBase {
  id: string;
  themeId?: ThemeId;
  direction?: SupportDirection;
  cardId?: string;
  proposedDay: number;
  eligibleReleaseDay: number;
  status: ReleaseRequestStatus;
  releasedDay: number | null;
}

/** Legacy saves omit kind; an absent kind is always ordinary theme support. */
export interface ThemeSupportRequest extends ReleaseRequestBase {
  kind?: "support";
  themeId: ThemeId;
  direction: SupportDirection;
}

export interface IndirectSupportRequest extends ReleaseRequestBase {
  kind: "indirect-support";
  themeId: ThemeId;
}

export interface EnvironmentTargetRequest extends ReleaseRequestBase {
  kind: "environment-target";
  themeId: ThemeId;
}

export interface ReprintRequest extends ReleaseRequestBase {
  kind: "reprint";
  cardId: string;
}

/**
 * Historical name retained as the save key is still `supportRequests`.
 * New callers should treat the collection as next-release requests.
 */
export type SupportRequest =
  | ThemeSupportRequest
  | IndirectSupportRequest
  | EnvironmentTargetRequest
  | ReprintRequest;

interface ReleaseOptionBase {
  id: string;
  expectedPower: number;
  expectedTier: ExpectedTier;
}

export interface NewThemeReleaseOption extends ReleaseOptionBase {
  kind: "new-theme";
  themeId: ThemeId;
  requested: false;
}

export interface SupportReleaseOption extends ReleaseOptionBase {
  kind: "support";
  themeId: ThemeId;
  direction: SupportDirection;
  requested: boolean;
  requestId?: string;
}

export interface GenericReleaseOption extends ReleaseOptionBase {
  kind: "generic";
  genericCardId: GenericCardId;
  requested: boolean;
  requestId?: string;
  requestKind?: "indirect-support" | "environment-target";
  requestThemeId?: ThemeId;
  requestKeyword?: PlayKeyword;
}

export interface ReprintReleaseOption extends ReleaseOptionBase {
  kind: "reprint";
  cardId: string;
  /** Display/community anchor; generic reprints use the current leading theme. */
  themeId: ThemeId;
  /** A prior registry request guarantees candidacy, not automatic inclusion. */
  requested: boolean;
  requestId?: string;
}

export type ReleaseOption =
  | NewThemeReleaseOption
  | SupportReleaseOption
  | GenericReleaseOption
  | ReprintReleaseOption;

export interface ReleaseSlate {
  day: number;
  releaseKind: "regular" | "reprint";
  options: ReleaseOption[];
}

export interface ReleaseSelection {
  optionId: string;
  powerAdjustment: PowerAdjustment;
}

interface ReleasedProductBase {
  optionId: string;
  expectedTier: ExpectedTier;
  powerAdjustment: PowerAdjustment;
}

export interface ReleasedNewThemeProduct extends ReleasedProductBase {
  kind: "new-theme";
  themeId: ThemeId;
}

export interface ReleasedSupportProduct extends ReleasedProductBase {
  kind: "support";
  themeId: ThemeId;
  direction: SupportDirection;
  requestId?: string;
}

export interface ReleasedGenericProduct extends ReleasedProductBase {
  kind: "generic";
  genericCardId: GenericCardId;
  requestId?: string;
}

export interface ReleasedReprintProduct extends ReleasedProductBase {
  kind: "reprint";
  cardId: string;
  /** Display/community anchor; it does not grant theme support. */
  themeId: ThemeId;
  requestId?: string;
  /** Market price immediately before the reprint was selected. */
  referencePrice: number;
  /** Deterministic ownership-confidence change applied on D+1. */
  trustDelta: number;
  /** Immediate accessibility gain applied on D+1. */
  accessibilityUserGain: number;
  /** Collector/reseller audience loss applied on D+1. */
  collectorUserLoss: number;
  /** Extra release-day gross revenue, expressed in eok won. */
  releaseRevenueBoost: number;
}

export type ReleasedProduct =
  | ReleasedNewThemeProduct
  | ReleasedSupportProduct
  | ReleasedGenericProduct
  | ReleasedReprintProduct;

export interface PublishedReleaseBatch {
  day: number;
  releaseKind: "regular" | "reprint";
  products: ReleasedProduct[];
}

export interface BaselineReleaseBatch {
  day: 0;
  /** Existing DAY 0 card pool; not a player-authored release. */
  releaseKind: "baseline";
  products: ReleasedProduct[];
}

export type ReleaseBatch = PublishedReleaseBatch | BaselineReleaseBatch;

export interface UserState {
  tier: number;
  casual: number;
  collector: number;
}

export interface FinanceState {
  /** Revenue values are expressed in eok won (KRW 100,000,000). */
  today: number;
  rolling30: number;
  cumulative: number;
  /** Spendable operating cash, also expressed in eok won. */
  cash: number;
  /** Net cash generated today after margin, recurring operations, and actions. */
  todayOperatingCash: number;
  /** Recurring organization and audience-service cost charged today. */
  todayOperatingCost: number;
  /** Total recurring operating costs charged since the campaign began. */
  cumulativeOperatingCosts: number;
  /** Total discretionary business-action spend. */
  cumulativeExpenses: number;
}

export type BusinessActionType =
  | "tv-cm"
  | "animation-promotion"
  | "championship"
  | "store-tour"
  | "beginner-camp"
  | "local-league"
  | "lending-exchange-network"
  | "collector-fair"
  | "pack-odds"
  | "season-overhaul"
  | "global-launch"
  | "organized-play-platform";

export type BusinessRiskFactor =
  | "environment"
  | "trust"
  | "policy"
  | "release"
  | "timing"
  | "execution";

export interface BusinessActionRiskContext {
  environmentHealth: number;
  purchaseTrust: number;
  releaseQuality: number;
  policyQuality: "balanced" | "incomplete" | "narrow" | "none";
  timing: "early" | "middle" | "late";
  primaryRisk: BusinessRiskFactor;
  primaryStrength: BusinessRiskFactor;
}

export type BusinessActionOutcome =
  | "active"
  | "pending"
  | "completed"
  | "success"
  | "backlash"
  | "clean"
  | "detected";

/** Observable campaign signal used by deterministic business challenges. */
export type BusinessChallengeMetric =
  | "environment-health"
  | "purchase-trust"
  | "release-quality";

/**
 * Progress is persisted so a challenge resolves identically whether the
 * player advances one day at a time, jumps several days, or reloads a save.
 */
export interface BusinessChallengeProgress {
  metric: BusinessChallengeMetric;
  threshold: number;
  requiredQualifyingDays: number;
  qualifyingDays: number;
  observedDays: number;
  deadlineDay: number;
  lastEvaluatedDay: number | null;
  lastValue: number | null;
}

export interface BusinessActionRecord {
  id: string;
  type: BusinessActionType;
  startedDay: number;
  endsDay: number;
  cost: number;
  outcome: BusinessActionOutcome;
  /**
   * Frozen backlash/detection probability for ordinary actions and pack odds.
   * Exact 0/1 values remain useful as deterministic simulation fixtures.
   */
  risk?: number;
  /** Environment health snapshot used to judge a championship. */
  environmentHealth?: number;
  /** Immutable launch-day facts used to resolve and explain strategic risk. */
  riskContext?: BusinessActionRiskContext;
  /** Deterministic, player-readable completion condition for risky projects. */
  challenge?: BusinessChallengeProgress;
  /** Cash recovered when a strategic project succeeds. */
  cashReturn?: number;
  /** Release day affected by a pack-odds adjustment. */
  appliedDay?: number;
  /** Day on which a random or delayed outcome became public. */
  resolvedDay?: number;
}

export type BusinessEventType =
  | "starter-shortage"
  | "secondary-market-spike"
  | "store-margin-dispute"
  | "creator-controversy"
  | "set-list-leak"
  | "regional-prize-fund"
  | "accessibility-reprint"
  | "localization-delay"
  | "print-defect"
  | "artist-contract"
  | "rules-complexity"
  | "data-transparency"
  | "subscription-offer"
  | "warehouse-overstock"
  | "fan-content-policy"
  | "rival-tcg-launch";

export type BusinessEventChoice = "a" | "b";

export type BusinessEventOutcome = "pending" | "success" | "backlash";

/**
 * Persistent operating posture accumulated by surprise business decisions.
 * Values are clamped to -100..100. Positive values mean mass-market reach,
 * premium/scarcity products, and aggressive execution respectively; negative
 * values mean core-audience focus, accessibility, and caution.
 */
export interface BusinessStrategy {
  audience: number;
  product: number;
  posture: number;
}

export interface PendingBusinessEvent {
  id: string;
  type: BusinessEventType;
  appearedDay: number;
}

export interface BusinessEventRecord {
  id: string;
  type: BusinessEventType;
  appearedDay: number;
  choice: BusinessEventChoice;
  cost: number;
  risk: number;
  resolutionDay: number;
  outcome: BusinessEventOutcome;
  resolvedDay?: number;
}

/** One durable boundary between competitive seasons inside the same mandate. */
export interface CompetitiveSeasonBoundary {
  seasonNumber: number;
  startedDay: number;
  sourceActionId: string;
}

/**
 * Competitive records may restart without discarding the mandate's financial,
 * release, decision, community, or daily operating history.
 */
export interface CompetitiveSeasonState {
  currentSeasonNumber: number;
  startedDay: number;
  boundaries: CompetitiveSeasonBoundary[];
}

export interface OperationsState {
  nextActionId: number;
  records: BusinessActionRecord[];
  nextEventId: number;
  nextEventDay: number | null;
  pendingEvent: PendingBusinessEvent | null;
  eventRecords: BusinessEventRecord[];
  strategy: BusinessStrategy;
  season: CompetitiveSeasonState;
}

export type EnvironmentHealthModel = "placement-v1";

export interface DailyHistory {
  day: number;
  totalUsers: number;
  revenue: number;
  /** Spendable operating cash after this day's settlement, in eok won. */
  cash?: number;
  /** Net operating cash generated on this day, in eok won. */
  operatingCash?: number;
  /** Snapshot used by the 90-day market/health comparison chart. */
  environmentHealth?: number;
  /** Identifies the scoring formula used by environmentHealth. */
  environmentHealthModel?: EnvironmentHealthModel;
  /** Purchase confidence at the end of the recorded day. */
  purchaseTrust?: number;
  /** Net community mood on a 0..100 scale, with 50 as neutral. */
  communitySentiment?: number;
  /** Number of positive posts in the twenty-post daily board. */
  communityPositive?: number;
  /** Number of negative posts in the twenty-post daily board. */
  communityNegative?: number;
  topThemeId: ThemeId;
  shares: Record<ThemeId, number>;
  /** Matchup-weighted win rates frozen with the share snapshot. */
  winRates?: Record<ThemeId, number>;
  /** Deterministic daily representation among the 32 tournament top-cut slots. */
  topCutPlacements?: Record<ThemeId, number>;
}

export interface GameState {
  schemaVersion: 9;
  seed: number;
  day: number;
  phase: "running" | "release-edit" | "ban-edit" | "ended";
  activeThemeIds: ThemeId[];
  themes: Record<ThemeId, ThemeRuntime>;
  users: UserState;
  finance: FinanceState;
  operations: OperationsState;
  community: CommunityEvent[];
  supportRequests: SupportRequest[];
  releaseSlate: ReleaseSlate | null;
  releaseHistory: ReleaseBatch[];
  /** Global official limits for generic cards whose D+1 effects have applied. */
  genericLimits: Partial<Record<GenericCardId, RestrictionLimit>>;
  /** First review using the nine-option, four-product generic release rules. */
  genericReleaseStartDay: number | null;
  history: DailyHistory[];
  recentRevenue: number[];
  lastSupportProposalDay: number | null;
  nextSupportRequestId: number;
  nextReleaseOptionId: number;
  nextCommunityId: number;
  currentTopThemeId: ThemeId;
  purchaseTrust: number;
  /** False while the guided DAY 0-7 emergency handover needs acknowledgement. */
  handoverComplete: boolean;
}

export type GameCommand =
  | { type: "ADVANCE_DAYS"; days: number }
  | {
      type: "SUBMIT_BAN";
      changes: Record<string, RestrictionLimit>;
      /**
       * The guided DAY 0 decision may mint the real mandate seed after the
       * fixed prologue. It is deliberately supplied by the UI so the reducer
       * remains deterministic and saved games remain exactly reproducible.
       */
      campaignSeed?: number;
    }
  | {
      type: "PROPOSE_SUPPORT";
      themeId: ThemeId;
      direction: SupportDirection;
    }
  | {
      type: "SET_RELEASE_REQUEST";
      request:
        | { kind: "support"; themeId: ThemeId; direction: SupportDirection }
        | { kind: "indirect-support"; themeId: ThemeId }
        | { kind: "environment-target"; themeId: ThemeId }
        | { kind: "reprint"; cardId: string };
    }
  | {
      type: "CANCEL_RELEASE_REQUEST";
      lane: ReleaseRequestLane;
    }
  | {
      type: "SUBMIT_RELEASE";
      selections: ReleaseSelection[];
    }
  | { type: "RUN_BUSINESS_ACTION"; action: BusinessActionType }
  | {
      type: "CHOOSE_BUSINESS_EVENT";
      eventId: string;
      choice: BusinessEventChoice;
    }
  | { type: "COMPLETE_HANDOVER" };
