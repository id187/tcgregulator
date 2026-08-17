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

export interface ThemeContent {
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
  partId?: string;
  relatedThemeId?: ThemeId;
  proposalId?: string;
  value?: number;
  previousValue?: number;
  body: string;
}

export interface SupportRequest {
  id: string;
  themeId: ThemeId;
  direction: SupportDirection;
  proposedDay: number;
  eligibleReleaseDay: number;
  status: "queued" | "offered" | "released" | "skipped";
  releasedDay: number | null;
}

export interface ReleaseOption {
  id: string;
  kind: "new-theme" | "support";
  themeId: ThemeId;
  direction?: SupportDirection;
  expectedPower: number;
  expectedTier: ExpectedTier;
  requested: boolean;
  requestId?: string;
}

export interface ReleaseSlate {
  day: number;
  options: ReleaseOption[];
}

export interface ReleaseSelection {
  optionId: string;
  powerAdjustment: PowerAdjustment;
}

export interface ReleasedProduct {
  optionId: string;
  kind: ReleaseOption["kind"];
  themeId: ThemeId;
  direction?: SupportDirection;
  expectedTier: ExpectedTier;
  powerAdjustment: PowerAdjustment;
  requestId?: string;
}

export interface ReleaseBatch {
  day: number;
  products: ReleasedProduct[];
}

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
  /** Total recurring operating costs charged since the handover. */
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
  | "reprint-campaign"
  | "collector-fair"
  | "pack-odds"
  | "season-overhaul"
  | "global-launch"
  | "first-print-expansion";

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

export interface BusinessActionRecord {
  id: string;
  type: BusinessActionType;
  startedDay: number;
  endsDay: number;
  cost: number;
  outcome: BusinessActionOutcome;
  /** Risk shown to the player when the action was committed. */
  risk?: number;
  /** Environment health snapshot used to judge a championship. */
  environmentHealth?: number;
  /** Immutable launch-day facts used to resolve and explain strategic risk. */
  riskContext?: BusinessActionRiskContext;
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

export interface OperationsState {
  nextActionId: number;
  records: BusinessActionRecord[];
  nextEventId: number;
  nextEventDay: number | null;
  pendingEvent: PendingBusinessEvent | null;
  eventRecords: BusinessEventRecord[];
  strategy: BusinessStrategy;
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
  schemaVersion: 7;
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
  history: DailyHistory[];
  recentRevenue: number[];
  lastSupportProposalDay: number | null;
  nextSupportRequestId: number;
  nextReleaseOptionId: number;
  nextCommunityId: number;
  currentTopThemeId: ThemeId;
  purchaseTrust: number;
  /** False while the guided DAY 1-46 handover still needs its final acknowledgement. */
  handoverComplete: boolean;
}

export type GameCommand =
  | { type: "ADVANCE_DAYS"; days: number }
  | {
      type: "SUBMIT_BAN";
      changes: Record<string, RestrictionLimit>;
      /**
       * The guided DAY 45 decision may mint the real mandate seed after the
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
