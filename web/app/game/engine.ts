import {
  INITIAL_THEME_PART_COUNT,
  MAX_THEME_SUPPORTS,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import {
  META_ADOPTION_SHARE_FLOOR,
  type MetaTier,
} from "./meta-tiers.ts";
import {
  capStrategicMatchupLogit,
  getCounterplaySupportLogitBonus,
  getKeywordMatchupLogitAdjustment,
  PLAY_KEYWORD_IDS,
  type PlayKeyword,
} from "./play-keywords.ts";
import {
  getDeterministicDailyTopCutPlacements,
  getPlacementTier,
  getRecentPlacementReport,
  getThemeDebutDay,
} from "./placement-meta.ts";
import {
  BUSINESS_ACTION_BY_TYPE,
  getBusinessActionScheduledEndDay,
  getBusinessEnvironmentHealth,
  getCompetitiveSeasonHistory,
  getProbabilisticBusinessActionOutcome,
  isProbabilisticBusinessAction,
} from "./business-actions.ts";
import {
  getBusinessChallengeProgressError,
  isBusinessChallengeDecisionDay,
  isChallengeBusinessAction,
} from "./business-challenges.ts";
import {
  BUSINESS_EVENT_BY_TYPE,
  BUSINESS_STRATEGY_MAX,
  BUSINESS_STRATEGY_MIN,
  applyBusinessStrategyDelta,
  getBusinessEventChoice,
  getBusinessStrategyModifiers,
  getBusinessEventType,
  getInitialBusinessEventDay,
  getNextBusinessEventDay,
} from "./business-events.ts";
import {
  applyPendingPackOddsToCurrentRelease,
  chooseBusinessEvent,
  getBusinessBuyerRateBonus,
  getBusinessEventRevenueBonus,
  getBusinessTrustRecovery,
  getBusinessUserRateModifiers,
  getResolvedBusinessEventCashDelta,
  hasPackOddsAdjustmentForRelease,
  openBusinessEvent,
  runBusinessAction,
  updateBusinessLifecycle,
} from "./business-runtime.ts";
import {
  BAN_INTERVAL,
  CAMPAIGN_END_DAY,
  FIRST_RELEASE_DAY,
  FIRST_BAN_DAY,
  getNextRegularReleaseDay,
  getNextReprintReleaseDay,
  getNextScheduledReleaseDay,
  isRegularReleaseDay,
  isReprintReleaseDay,
  isScheduledReleaseDay,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  REPRINT_MINIMUM_AGE_DAYS,
  REPRINT_PACK_CANDIDATE_COUNT,
  REPRINT_PACK_PRODUCT_COUNT,
  RELEASE_REPORT_DELAY_DAYS,
  RESTRICTION_REPORT_DELAY_DAYS,
  RELEASE_INTERVAL,
  TUTORIAL_END_DAY,
} from "./campaign.ts";
import {
  getDailyOperatingCost,
  OPERATING_CASH_MARGIN,
  OPERATING_COST_START_DAY,
  RELEASE_SALES_DECAY_DAYS,
  RELEASE_SALES_WINDOW_DAYS,
} from "./finance.ts";
import { withKoreanParticle } from "./korean-particles.ts";
import { getStableThemeRandomIdentifier } from "./future-theme-id-migration.ts";
import { getDailyCommunitySentiment } from "./community-sentiment.ts";
import { getEmergentNarrativesForDay } from "./emergent-narratives.ts";
import { ENVIRONMENT_HEALTH_MODEL } from "./environment-health.ts";
import { getSupportNeglectPressure } from "./support-continuity.ts";
import {
  GENERIC_CARD_CATALOG,
  getGenericCard,
} from "./generic-card-catalog.ts";
import {
  INITIAL_GENERIC_CARD_IDS,
  createInitialGenericReleaseBatch,
  isInitialGenericReleaseBatch,
} from "./initial-generic-cards.ts";
import {
  buildGenericMetaModel,
  selectGenericLimitThemeImpacts,
  type GenericMetaModel,
  type GenericLimitOverrides,
} from "./generic-card-meta.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionHistoricalOutcome,
  getRestrictionPolicyProfile,
  type RestrictionOutcomeClassification,
  type RestrictionPolicyProfile,
} from "./restriction-policy.ts";
import { assertRestrictionCapacity } from "./restriction-cap.ts";
import {
  getEnvironmentTargetGenericPool,
  getIndirectSupportGenericPool,
  getPendingReleaseRequest,
  getReleaseRequestKind,
  getReleaseRequestLane,
  getReprintCandidates,
  getReprintImpactPreview,
  getRequestGenericPool,
  type ReprintImpactPreview,
  type ReleaseRequestInput,
} from "./release-requests.ts";
import { getReleaseSlateKind } from "./release-kind.ts";
import type {
  BusinessActionType,
  CommunityEvent,
  CommunityEventType,
  DailyHistory,
  ExpectedTier,
  GameCommand,
  GameState,
  PartContent,
  PowerAdjustment,
  ReleaseOption,
  ReleaseRequestLane,
  ReleaseSelection,
  ReleasedProduct,
  RestrictionLimit,
  SupportDirection,
  SupportRequest,
  ThemeSupportRequest,
  ThemeContent,
  ThemeId,
  ThemeRuntime,
} from "./types.ts";

const SHARE_FLOOR = META_ADOPTION_SHARE_FLOOR;
const SHARE_CEILING = 0.55;
const DAILY_SHARE_LIMIT = 0.012;
// A theme below the exit target is no longer represented in the observed
// competitive field.  A higher re-entry target prevents 0% themes from
// flickering in and out of the table on ordinary day-to-day noise.
const META_EXIT_TARGET_SHARE = 0.0075;
const META_REENTRY_TARGET_SHARE = 0.014;
const META_TIER_OUT_SNAP_SHARE = 0.005;
const META_TIER_OUT_MIN_THEME_COUNT = 18;
const NEW_THEME_POWER_CREEP_PER_RELEASE = 0.4;
const COMMUNITY_LIMIT = 500;
const UNPLEASANTNESS_RUNTIME_SCALE = 0.65;
const INITIAL_OPERATING_CASH = 2.5;
const CATALOG_DAILY_SPEND_PER_USER = 350;
const PACK_ODDS_REVENUE_MULTIPLIER = 1.25;
const BALANCED_RELEASE_TRUST_RECOVERY = 0.18;
const RESTRICTION_OUTCOME_FOLLOWUP_DAYS = RESTRICTION_REPORT_DELAY_DAYS;
/** Mandatory reprint packs should hurt confidence without making trust unrecoverable. */
const REPRINT_PACK_TRUST_LOSS_CAP = 4;
const STARTING_THEME_IDS = [
  "cycle",
  "white-night",
  "machine-revolution",
  "ironblood",
  "abyss",
] as const satisfies readonly ThemeId[];
const INITIAL_USERS = {
  tier: 3_500,
  casual: 4_500,
  collector: 2_000,
} as const;
const REPLACEMENT_PRESSURE_BY_ADJUSTMENT: Record<PowerAdjustment, number> = {
  [-3]: 0.04,
  [-2]: 0.07,
  [-1]: 0.11,
  0: 0.17,
  1: 0.25,
  2: 0.36,
  3: 0.48,
};
const SUPPORT_SHARE_SURGE_BY_ADJUSTMENT: Record<PowerAdjustment, number> = {
  [-3]: 0.005,
  [-2]: 0.01,
  [-1]: 0.015,
  0: 0.025,
  1: 0.04,
  2: 0.06,
  3: 0.08,
};
const PACK_DEMAND_BY_META_TIER: Record<MetaTier, number> = {
  "Tier 0": 0.16,
  "Tier 1": 0.11,
  "Tier 2": 0.035,
  "Tier 3": -0.015,
  "Tier Out": -0.04,
};
const GENERIC_RELEASE_OPTION_COUNT = 3;
const STANDARD_RELEASE_PRODUCT_COUNT = 4;
const RELEASE_SHELF_PRODUCT_BASELINE = 3;

export interface PrologueReleasePlan {
  /** Canonical reducer payload. Preserve this order for replay identity. */
  selections: ReleaseSelection[];
  /** Direct option buttons that the guided UI should lock as selected. */
  selectedOptionIds: string[];
  /** Fixed slider values keyed by direct option id. */
  powerAdjustmentByOptionId: Record<string, PowerAdjustment>;
}

function compareReleaseOptionIds(
  left: Pick<ReleaseOption, "id">,
  right: Pick<ReleaseOption, "id">,
): number {
  const sequence = (id: string) => {
    const match = /-(\d+)$/.exec(id);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  return sequence(left.id) - sequence(right.id) ||
    left.id.localeCompare(right.id);
}

/**
 * Resolves the fixed tutorial choices against the first DAY 10 regular slate.
 *
 * The tutorial intentionally submits ordinary reducer commands. Keeping the
 * option ids derived from the live slate means an in-progress DAY 10 save can
 * be restored without storing a second, tutorial-only copy of the release.
 */
export function getPrologueReleaseSelections(
  state: GameState,
): ReleaseSelection[] {
  if (
    state.day !== FIRST_RELEASE_DAY ||
    state.phase !== "release-edit" ||
    !state.releaseSlate ||
    state.releaseSlate.day !== state.day ||
    state.releaseSlate.releaseKind !== "regular" ||
    state.releaseSlate.options.length !== 9
  ) {
    throw new Error(
      `Prologue release choices are only available at the DAY ${FIRST_RELEASE_DAY} review.`,
    );
  }

  const newThemeCount = state.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  ).length;
  const supportCount = state.releaseSlate.options.filter(
    (option) => option.kind === "support",
  ).length;
  const genericCount = state.releaseSlate.options.filter(
    (option) => option.kind === "generic",
  ).length;
  if (
    newThemeCount !== 3 ||
    supportCount !== 3 ||
    genericCount !== 3
  ) {
    throw new Error("The prologue release review has an invalid option mix.");
  }

  const options = state.releaseSlate.options;
  const newThemes = options
    .filter((option) => option.kind === "new-theme")
    .sort(compareReleaseOptionIds);
  const support = options
    .filter((option) => option.kind === "support")
    .sort(compareReleaseOptionIds)[0];
  const generic = options
    .filter((option) => option.kind === "generic")
    .sort(compareReleaseOptionIds)[0];
  if (newThemes.length < 2 || !support || !generic) {
    throw new Error("Missing a guided prologue release category.");
  }
  return [
    { optionId: newThemes[0].id, powerAdjustment: 3 },
    { optionId: newThemes[1].id, powerAdjustment: 3 },
    { optionId: support.id, powerAdjustment: 3 },
    // The fourth tutorial slot demonstrates a broadly usable card without
    // adding another forced maximum-power trust shock to the handover.
    { optionId: generic.id, powerAdjustment: 0 },
  ];
}

/** Read model shared by the guided selection screen and skip replay. */
export function getPrologueReleasePlan(state: GameState): PrologueReleasePlan {
  const selections = getPrologueReleaseSelections(state);
  return {
    selections: selections.map((selection) => ({ ...selection })),
    selectedOptionIds: selections.map((selection) => selection.optionId),
    powerAdjustmentByOptionId: Object.fromEntries(
      selections.map((selection) => [
        selection.optionId,
        selection.powerAdjustment,
      ]),
    ),
  };
}

/** Canonical command used when exact tutorial/skip replay identity matters. */
export function getPrologueReleaseCommand(
  state: GameState,
): Extract<GameCommand, { type: "SUBMIT_RELEASE" }> {
  return {
    type: "SUBMIT_RELEASE",
    selections: getPrologueReleasePlan(state).selections,
  };
}

/** Exact order and values are required to reproduce the skip replay state. */
export function isPrologueReleaseSubmission(
  state: GameState,
  selections: readonly ReleaseSelection[],
): boolean {
  try {
    const expected = getPrologueReleaseSelections(state);
    return (
      selections.length === expected.length &&
      selections.every(
        (selection, index) =>
          selection.optionId === expected[index].optionId &&
          selection.powerAdjustment === expected[index].powerAdjustment,
      )
    );
  } catch {
    return false;
  }
}

/** Returns whether one release choice is one of the guided DAY 10 choices. */
export function isPrologueReleaseSelection(
  state: GameState,
  selection: ReleaseSelection,
): boolean {
  try {
    return getPrologueReleaseSelections(state).some(
      (expected) =>
        expected.optionId === selection.optionId &&
        expected.powerAdjustment === selection.powerAdjustment,
    );
  } catch {
    return false;
  }
}

function prologueBandRestrictionChanges(
  state: GameState,
  themeIds: readonly ThemeId[],
  count: number,
): [string, RestrictionLimit][] {
  const candidatesByTheme = themeIds.map((themeId) => {
    const runtime = state.themes[themeId];
    const content = THEME_BY_ID[themeId];
    if (!runtime || !content) return [];
    return content.parts
      .filter(
        (part) =>
          runtime.releasedPartIds.includes(part.id) &&
          (runtime.legalLimits[part.id] ?? 3) === 3 &&
          part.preferredCopies >= 2,
      )
      .map((part) => {
        const nextLimit = (part.preferredCopies >= 3 ? 2 : 1) as RestrictionLimit;
        const impact =
          part.powerWeight *
          part.inclusion *
          Math.max(
            0,
            copyAvailability(part, 3) - copyAvailability(part, nextLimit),
          );
        return { partId: part.id, nextLimit, impact };
      })
      .sort(
        (left, right) =>
          right.impact - left.impact || left.partId.localeCompare(right.partId),
      );
  });
  const selected: [string, RestrictionLimit][] = [];
  for (const candidates of candidatesByTheme) {
    const candidate = candidates[0];
    if (!candidate) continue;
    selected.push([candidate.partId, candidate.nextLimit]);
    if (selected.length === count) return selected;
  }
  const alreadySelected = new Set(selected.map(([partId]) => partId));
  const fallback = candidatesByTheme
    .flat()
    .filter((candidate) => !alreadySelected.has(candidate.partId))
    .sort(
      (left, right) =>
        right.impact - left.impact || left.partId.localeCompare(right.partId),
    );
  for (const candidate of fallback) {
    selected.push([candidate.partId, candidate.nextLimit]);
    if (selected.length === count) break;
  }
  return selected;
}

/**
 * Builds the guided first list from the live first-review ranking. The review
 * has no prior restrictions to release, so it demonstrates broad, shallow
 * coverage instead: two meaningful cuts in ranks 0-2 and two in ranks 3-5.
 */
export function getPrologueRestrictionChanges(
  state: GameState,
): Record<string, RestrictionLimit> {
  if (
    state.day !== FIRST_BAN_DAY ||
    state.phase !== "ban-edit" ||
    !isBanDay(state.day)
  ) {
    throw new Error(
      `Prologue restriction choices are only available at the DAY ${FIRST_BAN_DAY} review.`,
    );
  }
  const ranked = [...state.activeThemeIds].sort(
    (left, right) =>
      state.themes[right].share - state.themes[left].share ||
      left.localeCompare(right),
  );
  const changes = Object.fromEntries([
    ...prologueBandRestrictionChanges(state, ranked.slice(0, 3), 2),
    ...prologueBandRestrictionChanges(state, ranked.slice(3, 6), 2),
  ]) as Record<string, RestrictionLimit>;
  const profile = getRestrictionPolicyProfile(state, changes);
  if (profile.changeCount !== 4 || profile.quality !== "balanced") {
    throw new Error("The prologue restriction review needs four balanced shallow cuts.");
  }
  return changes;
}

/** Returns whether a single restriction edit matches the guided first review. */
export function isPrologueRestrictionChange(
  state: GameState,
  partId: string,
  limit: RestrictionLimit,
): boolean {
  try {
    return getPrologueRestrictionChanges(state)[partId] === limit;
  } catch {
    return false;
  }
}

const ROLE_EXPONENT: Record<PartContent["role"], number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

const DIRECTION_LABEL: Record<SupportDirection, string> = {
  consistency: "초동 안정성",
  counterplay: "대응력",
  finisher: "결과물",
  recovery: "자원 회수",
};

const DIRECTION_POWER: Record<SupportDirection, number> = {
  consistency: 2.8,
  counterplay: 2.3,
  finisher: 3.4,
  recovery: 2.5,
};

const DIRECTION_UNPLEASANTNESS: Record<SupportDirection, number> = {
  consistency: 0.6,
  counterplay: -1.1,
  finisher: 1.6,
  recovery: -0.3,
};

const SLOW_PLAN_KEYWORDS = new Set<PlayKeyword>([
  "setup",
  "fortress",
  "attrition",
  "ramp",
  "territory",
  "countdown",
]);
const INTERACTION_PLAN_KEYWORDS = new Set<PlayKeyword>([
  "control",
  "disruption",
  "reactive",
  "deception",
]);
const SUPPORT_KEYWORD_POOLS: Readonly<
  Record<SupportDirection, readonly PlayKeyword[]>
> = {
  consistency: [
    "consistency",
    "protection",
    "mobility",
    "setup",
    "toolbox",
    "tempo",
  ],
  counterplay: [
    "reactive",
    "disruption",
    "deception",
    "territory",
    "control",
  ],
  finisher: [
    "burst",
    "rush",
    "gambit",
    "countdown",
    "transformation",
    "combo",
  ],
  recovery: [
    "resilience",
    "recursion",
    "attrition",
    "fortress",
    "midrange",
    "ramp",
  ],
};
/** Directional support cannot replace raw power or the theme's base keywords. */
export const SUPPORT_DIRECTION_MATCHUP_LOGIT_CAP = 0.28;
const OPTIMIZATION_DISCOVERY_POINT = 0.55;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  return current + clamp(target - current, -maximumDelta, maximumDelta);
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const inverse = Math.exp(-value);
    return 1 / (1 + inverse);
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function withTopicParticle(value: string): string {
  const last = value.at(-1) ?? "";
  const code = last.charCodeAt(0);
  const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${value}${hasFinalConsonant ? "은" : "는"}`;
}

/** A stateless random value. Adding an unrelated random call cannot change it. */
function keyedRandom(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const text = keys
    .map((key) =>
      typeof key === "string" ? getStableThemeRandomIdentifier(key) : key,
    )
    .join("\u001f");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function themeIds(state: GameState): ThemeId[] {
  return state.activeThemeIds;
}

function activeContents(state: GameState): ThemeContent[] {
  return state.activeThemeIds.map((themeId) => THEME_BY_ID[themeId]);
}

type SupportDirectionCounts = Readonly<Record<SupportDirection, number>>;

function getReleasedSupportDirectionCounts(
  state: GameState,
  themeId: ThemeId,
  observationDay = state.day,
): SupportDirectionCounts {
  const counts: Record<SupportDirection, number> = {
    consistency: 0,
    counterplay: 0,
    finisher: 0,
    recovery: 0,
  };
  for (const batch of state.releaseHistory) {
    // Products selected on a release review take effect the following day.
    if (batch.day >= observationDay) continue;
    for (const product of batch.products) {
      if (product.kind !== "support" || product.themeId !== themeId) continue;
      counts[product.direction ?? "consistency"] += 1;
    }
  }
  return Object.freeze(counts);
}

export type ThemeOptimizationPhase =
  | "pre-campaign"
  | "learning"
  | "emerging"
  | "optimized";

export interface ThemeOptimizationStatus {
  readonly themeId: ThemeId;
  /** null means that the theme predates the player's mandate. */
  readonly debutDay: number | null;
  readonly elapsedDays: number;
  readonly authoredOptimizationDays: number;
  /** Consistency support can shorten the remaining learning curve. */
  readonly effectiveOptimizationDays: number;
  /** 0..1; intended for qualitative UI status, not matchup disclosure. */
  readonly progress: number;
  /** Temporary power still unavailable while lists and lines are being solved. */
  readonly powerPenalty: number;
  readonly phase: ThemeOptimizationPhase;
  readonly fullyOptimized: boolean;
}

function getThemeOptimizationStatusAtDay(
  state: GameState,
  themeId: ThemeId,
  observationDay: number,
): Readonly<ThemeOptimizationStatus> {
  const content = THEME_BY_ID[themeId];
  const runtime = state.themes[themeId];
  if (!content || !runtime) {
    throw new Error(`Inactive optimization theme: ${themeId}.`);
  }

  const debutDay = getThemeDebutDay(state.releaseHistory, themeId);
  const authoredOptimizationDays = Math.max(
    1,
    Math.round(content.optimizationDays),
  );
  if (debutDay === null) {
    return Object.freeze({
      themeId,
      debutDay: null,
      elapsedDays: authoredOptimizationDays,
      authoredOptimizationDays,
      effectiveOptimizationDays: authoredOptimizationDays,
      progress: 1,
      powerPenalty: 0,
      phase: "pre-campaign",
      fullyOptimized: true,
    });
  }

  const consistencyWaves = getReleasedSupportDirectionCounts(
    state,
    themeId,
    observationDay,
  ).consistency;
  const effectiveOptimizationDays = Math.max(
    1,
    Math.ceil(authoredOptimizationDays / (1 + consistencyWaves * 0.35)),
  );
  const elapsedDays = Math.max(0, observationDay - debutDay);
  const linearProgress = clamp(elapsedDays / effectiveOptimizationDays, 0, 1);
  // Smoothstep keeps a difficult release obscure early, then lets solved lists
  // create a visible deterministic rise without storing another progress field.
  const progress = round(
    linearProgress * linearProgress * (3 - 2 * linearProgress),
    6,
  );
  const launchAdjustment = state.releaseHistory
    .flatMap((batch) => batch.products)
    .find(
      (product) =>
        product.kind === "new-theme" && product.themeId === themeId,
    )?.powerAdjustment ?? 0;
  // Brute-force tuning is immediately legible even before the best list is
  // solved. Balanced and weak releases have more latent performance to find.
  const tuningLearningMultiplier = clamp(
    1 - Math.max(0, launchAdjustment) * 0.3,
    0.08,
    1,
  );
  const maximumPenalty =
    clamp(4 + content.difficulty * 0.045, 4, 8.5) *
    tuningLearningMultiplier;
  const powerPenalty = round((1 - progress) * maximumPenalty, 4);
  const fullyOptimized = progress >= 1;
  const phase: ThemeOptimizationPhase = fullyOptimized
    ? "optimized"
    : progress >= OPTIMIZATION_DISCOVERY_POINT
      ? "emerging"
      : "learning";

  return Object.freeze({
    themeId,
    debutDay,
    elapsedDays,
    authoredOptimizationDays,
    effectiveOptimizationDays,
    progress,
    powerPenalty,
    phase,
    fullyOptimized,
  });
}

/**
 * Read-only, save-derived learning state for a released theme. Starting themes
 * are fully optimized; new themes use their authored optimizationDays.
 */
export function getThemeOptimizationStatus(
  state: GameState,
  themeId: ThemeId,
): Readonly<ThemeOptimizationStatus> {
  return getThemeOptimizationStatusAtDay(state, themeId, state.day);
}

function chooseSupportKeyword(
  themeId: ThemeId,
  direction: SupportDirection,
  supportOrdinal: number,
  usedKeywords: ReadonlySet<PlayKeyword>,
): PlayKeyword | null {
  const preferred = SUPPORT_KEYWORD_POOLS[direction].filter(
    (keyword) => !usedKeywords.has(keyword),
  );
  const fallback = PLAY_KEYWORD_IDS.filter(
    (keyword) => !usedKeywords.has(keyword),
  );
  const candidates = preferred.length > 0 ? preferred : fallback;
  if (candidates.length === 0) return null;
  const offset = Math.floor(
    keyedRandom(
      0x51a7c0de,
      "support-keyword",
      themeId,
      direction,
      supportOrdinal,
    ) * candidates.length,
  );
  return candidates[Math.min(offset, candidates.length - 1)] ?? null;
}

function appliedSupportProducts(
  state: GameState,
  themeId: ThemeId,
  observationDay: number,
): Extract<ReleasedProduct, { kind: "support" }>[] {
  return state.releaseHistory
    .filter((batch) => batch.day < observationDay)
    .sort((left, right) => left.day - right.day)
    .flatMap((batch) =>
      batch.products.filter(
        (product): product is Extract<ReleasedProduct, { kind: "support" }> =>
          product.kind === "support" && product.themeId === themeId,
      ),
    );
}

function keywordsAfterSupportProducts(
  state: GameState,
  themeId: ThemeId,
  products: readonly Extract<ReleasedProduct, { kind: "support" }>[],
): readonly PlayKeyword[] {
  const content = THEME_BY_ID[themeId];
  if (!content || !state.themes[themeId]) {
    throw new Error(`Inactive keyword theme: ${themeId}.`);
  }
  const result: PlayKeyword[] = [...content.playKeywords];
  const used = new Set(result);
  for (const [index, product] of products.entries()) {
    if (result.length >= 6) break;
    const keyword = chooseSupportKeyword(
      themeId,
      product.direction ?? "consistency",
      index,
      used,
    );
    if (keyword === null) break;
    result.push(keyword);
    used.add(keyword);
  }
  return Object.freeze(result);
}

/**
 * Base three traits plus one non-duplicate trait per applied support wave.
 * The result is reconstructed from release history, so old saves need no field.
 */
export function getEffectiveThemePlayKeywords(
  state: GameState,
  themeId: ThemeId,
  observationDay = state.day,
): readonly PlayKeyword[] {
  return keywordsAfterSupportProducts(
    state,
    themeId,
    appliedSupportProducts(state, themeId, observationDay),
  );
}

/** Derived generic adoption for UI, simulation, sales, and restriction previews. */
export function getCurrentGenericMetaModel(
  state: GameState,
  observationDay = state.day,
  limitOverrides?: GenericLimitOverrides,
): GenericMetaModel {
  const themeKeywordsById = Object.fromEntries(
    state.activeThemeIds.map((themeId) => [
      themeId,
      getEffectiveThemePlayKeywords(state, themeId, observationDay),
    ]),
  );
  return buildGenericMetaModel(
    state,
    themeKeywordsById,
    observationDay,
    limitOverrides,
  );
}

/** Display-safe preview of the unique keyword granted by the next support. */
export function getProspectiveSupportKeyword(
  state: GameState,
  themeId: ThemeId,
  direction: SupportDirection,
): PlayKeyword | null {
  const committedProducts = state.releaseHistory
    .slice()
    .sort((left, right) => left.day - right.day)
    .flatMap((batch) =>
      batch.products.filter(
        (product): product is Extract<ReleasedProduct, { kind: "support" }> =>
          product.kind === "support" && product.themeId === themeId,
      ),
    );
  // Unlike the live effective list, preview reserves products already locked
  // into today's (or a projected future) batch. This keeps the advertised next
  // keyword identical after the pending product takes effect tomorrow.
  const projected = keywordsAfterSupportProducts(
    state,
    themeId,
    committedProducts,
  );
  if (projected.length >= 6) return null;
  return chooseSupportKeyword(
    themeId,
    direction,
    projected.length - 3,
    new Set(projected),
  );
}

export function getCommittedSupportCount(
  state: GameState,
  themeId: ThemeId,
): number {
  const applied = state.themes[themeId]?.supportCount ?? 0;
  const pendingProducts = state.releaseHistory.reduce(
    (count, batch) =>
      count +
      (batch.day >= state.day
        ? batch.products.filter(
            (product) =>
              product.kind === "support" && product.themeId === themeId,
          ).length
        : 0),
    0,
  );
  const pendingRequests = state.supportRequests.filter(
    (request) =>
      getReleaseRequestKind(request) === "support" &&
      "themeId" in request &&
      request.themeId === themeId &&
      (request.status === "queued" || request.status === "offered"),
  ).length;
  return applied + pendingProducts + pendingRequests;
}

export function canProposeSupport(
  state: GameState,
  themeId: ThemeId,
): boolean {
  if (
    state.phase !== "running" ||
    state.operations.pendingEvent ||
    !state.themes[themeId]
  ) {
    return false;
  }
  if (getCommittedSupportCount(state, themeId) >= MAX_THEME_SUPPORTS) {
    return false;
  }
  return getNextRegularReleaseDay(state.day) <= LAST_RELEASE_DAY;
}

function totalUsers(state: GameState): number {
  return state.users.tier + state.users.casual + state.users.collector;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    themes: Object.fromEntries(
      Object.entries(state.themes).map(([themeId, theme]) => [
        themeId,
        {
          ...theme,
          releasedPartIds: [...theme.releasedPartIds],
          legalLimits: { ...theme.legalLimits },
          partStats: Object.fromEntries(
            Object.entries(theme.partStats).map(([partId, stats]) => [
              partId,
              { ...stats },
            ]),
          ),
        },
      ]),
    ),
    users: { ...state.users },
    finance: { ...state.finance },
    operations: {
      ...state.operations,
      records: state.operations.records.map((record) => ({
        ...record,
        ...(record.riskContext
          ? { riskContext: { ...record.riskContext } }
          : {}),
        ...(record.challenge
          ? { challenge: { ...record.challenge } }
          : {}),
      })),
      pendingEvent: state.operations.pendingEvent
        ? { ...state.operations.pendingEvent }
        : null,
      eventRecords: state.operations.eventRecords.map((record) => ({
        ...record,
      })),
      strategy: { ...state.operations.strategy },
      season: {
        ...state.operations.season,
        boundaries: state.operations.season.boundaries.map((boundary) => ({
          ...boundary,
        })),
      },
    },
    community: state.community.map((event) => ({ ...event })),
    activeThemeIds: [...state.activeThemeIds],
    supportRequests: state.supportRequests.map((request) => ({ ...request })),
    releaseSlate: state.releaseSlate
      ? {
          ...state.releaseSlate,
          options: state.releaseSlate.options.map((option) => ({ ...option })),
        }
      : null,
    releaseHistory: state.releaseHistory.map((batch) => ({
      ...batch,
      products: batch.products.map((product) => ({ ...product })),
    })),
    genericLimits: { ...state.genericLimits },
    history: state.history.map((entry) => ({
      ...entry,
      shares: { ...entry.shares },
      ...(entry.winRates ? { winRates: { ...entry.winRates } } : {}),
      ...(entry.topCutPlacements
        ? { topCutPlacements: { ...entry.topCutPlacements } }
        : {}),
    })),
    recentRevenue: [...state.recentRevenue],
  };
}

export function isReleaseDay(day: number): boolean {
  return isScheduledReleaseDay(day);
}

export function isBanDay(day: number): boolean {
  return (
    Number.isInteger(day) &&
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0
  );
}

/** Returns the first release strictly after day. */
export function getNextReleaseDay(day: number): number {
  return getNextScheduledReleaseDay(day);
}

/** Returns the first regular restriction date strictly after day. */
export function getNextBanDay(day: number): number {
  if (day < FIRST_BAN_DAY) return FIRST_BAN_DAY;
  return (
    FIRST_BAN_DAY +
    (Math.floor((day - FIRST_BAN_DAY) / BAN_INTERVAL) + 1) * BAN_INTERVAL
  );
}

function copyAvailability(part: PartContent, limit: RestrictionLimit): number {
  const preferred = clamp(part.preferredCopies, 1, 3);
  const allowed = Math.min(preferred, limit);
  if (allowed <= 0) return 0;
  if (allowed >= preferred) return 1;
  return (allowed / preferred) ** ROLE_EXPONENT[part.role];
}

function counterThreshold(seed: number, content: ThemeContent, build: number): number {
  const variation = (keyedRandom(seed, "counter-threshold", content.id, build) - 0.5) * 18;
  return round(clamp(91 - content.counterClarity * 0.38 + variation, 48, 96), 3);
}

function calculateThemeBase(
  content: ThemeContent,
  runtime: ThemeRuntime,
): {
  power: number;
  unpleasantness: number;
  partStats: ThemeRuntime["partStats"];
} {
  let powerLoss = 0;
  let unpleasantnessLoss = 0;
  const partStats: ThemeRuntime["partStats"] = {};

  const releasedPartIds = new Set(runtime.releasedPartIds);
  const latestSupportStart =
    INITIAL_THEME_PART_COUNT +
    Math.max(0, runtime.supportCount - 1) * SUPPORT_PARTS_PER_RELEASE;
  const latestSupportEnd = latestSupportStart + SUPPORT_PARTS_PER_RELEASE;
  const latestAdoptionMultiplier =
    runtime.lastSupportAdjustment === null
      ? 1
      : 0.55 + (runtime.lastSupportAdjustment + 3) * 0.09;

  for (const [partIndex, part] of content.parts.entries()) {
    if (!releasedPartIds.has(part.id)) continue;
    const limit = runtime.legalLimits[part.id] ?? 3;
    const availability = copyAvailability(part, limit);
    const isLatestSupportPart =
      runtime.supportCount > 0 &&
      partIndex >= latestSupportStart &&
      partIndex < latestSupportEnd;
    const adjustedInclusion = clamp(
      part.inclusion *
        (isLatestSupportPart
          ? latestAdoptionMultiplier
          : 1 - runtime.supportReplacementPressure),
      0,
      0.995,
    );
    powerLoss += part.powerWeight * adjustedInclusion * (1 - availability);
    unpleasantnessLoss +=
      part.unpleasantWeight * adjustedInclusion * (1 - availability);
    partStats[part.id] = {
      usageRate:
        limit === 0
          ? 0
          : round(adjustedInclusion * (0.9 + 0.1 * availability), 4),
      averageCopies:
        limit === 0 ? 0 : round(Math.min(part.averageCopies, limit), 2),
    };
  }

  return {
    power: round(
      clamp(content.basePower + runtime.supportPower - powerLoss, 10, 95),
      4,
    ),
    unpleasantness: round(
      clamp(
        content.baseUnpleasantness * UNPLEASANTNESS_RUNTIME_SCALE +
          runtime.supportUnpleasantness -
          unpleasantnessLoss,
        0,
        100,
      ),
      4,
    ),
    partStats,
  };
}

function refreshThemeBases(state: GameState): void {
  const genericMeta = getCurrentGenericMetaModel(state);
  for (const content of activeContents(state)) {
    const runtime = state.themes[content.id];
    const calculated = calculateThemeBase(content, runtime);
    runtime.power = calculated.power;
    const genericUnpleasantness = (
      genericMeta.themeLoadoutsById[content.id] ?? []
    ).reduce((sum, entry) => {
      const card = genericMeta.cardMetaById[entry.cardId]?.card;
      if (!card) return sum;
      return (
        sum +
        entry.adoption * Math.max(0, card.unpleasantness - 30) / 18
      );
    }, 0);
    runtime.unpleasantness = round(
      clamp(calculated.unpleasantness + Math.min(12, genericUnpleasantness), 0, 100),
      4,
    );
    runtime.partStats = calculated.partStats;
  }
}

type CounterplaySupportTargets = Map<ThemeId, Map<ThemeId, number>>;

function getCounterplaySupportTargets(
  state: GameState,
): CounterplaySupportTargets {
  const targets: CounterplaySupportTargets = new Map();
  const leaderByDay = new Map(
    state.history.map((entry) => [entry.day, entry.topThemeId] as const),
  );
  for (const batch of state.releaseHistory) {
    if (batch.day >= state.day) continue;
    const target = leaderByDay.get(batch.day);
    if (!target) continue;
    for (const product of batch.products) {
      if (
        product.kind !== "support" ||
        product.direction !== "counterplay" ||
        product.themeId === target
      ) {
        continue;
      }
      // The release-day history row freezes the leader that R&D prepared for.
      // This makes counterplay a targeted answer rather than a universal buff.
      const byOpponent = targets.get(product.themeId) ?? new Map<ThemeId, number>();
      byOpponent.set(target, (byOpponent.get(target) ?? 0) + 1);
      targets.set(product.themeId, byOpponent);
    }
  }
  return targets;
}

function counterplaySupportAdjustmentFromTargets(
  targets: CounterplaySupportTargets,
  leftId: ThemeId,
  rightId: ThemeId,
): number {
  const leftBonus = getCounterplaySupportLogitBonus(
    targets.get(leftId)?.get(rightId) ?? 0,
  );
  const rightBonus = getCounterplaySupportLogitBonus(
    targets.get(rightId)?.get(leftId) ?? 0,
  );
  return leftBonus - rightBonus;
}

export function getCounterplaySupportMatchupLogitAdjustment(
  state: GameState,
  leftId: ThemeId,
  rightId: ThemeId,
): number {
  return counterplaySupportAdjustmentFromTargets(
    getCounterplaySupportTargets(state),
    leftId,
    rightId,
  );
}

function supportWaveBonus(
  waves: number,
  first: number,
  repeat: number,
  maximum: number,
): number {
  if (waves <= 0) return 0;
  return Math.min(maximum, first + Math.max(0, waves - 1) * repeat);
}

function matchingKeywordCount(
  keywords: readonly PlayKeyword[],
  targets: ReadonlySet<PlayKeyword>,
): number {
  return keywords.reduce(
    (count, keyword) => count + (targets.has(keyword) ? 1 : 0),
    0,
  );
}

function oneSideSupportPlanBonus(
  state: GameState,
  ownerId: ThemeId,
  opponentId: ThemeId,
): number {
  const counts = getReleasedSupportDirectionCounts(state, ownerId);
  const opponentKeywords = getEffectiveThemePlayKeywords(state, opponentId);
  const consistency = supportWaveBonus(
    counts.consistency,
    0.035,
    0.015,
    0.065,
  );
  const slowTargets = matchingKeywordCount(
    opponentKeywords,
    SLOW_PLAN_KEYWORDS,
  );
  const finisher = Math.min(
    0.16,
    slowTargets * supportWaveBonus(counts.finisher, 0.04, 0.014, 0.07),
  );
  const interactionTargets = matchingKeywordCount(
    opponentKeywords,
    INTERACTION_PLAN_KEYWORDS,
  );
  const recovery = Math.min(
    0.14,
    interactionTargets *
      supportWaveBonus(counts.recovery, 0.045, 0.015, 0.075),
  );
  return consistency + finisher + recovery;
}

/**
 * Hidden mechanical layer for released support directions. Counterplay stays
 * fixed to its release-day leader, while the other directions reward distinct
 * opponent plans. The UI should show granted keywords, not this number.
 */
export function getSupportDirectionMatchupLogitAdjustment(
  state: GameState,
  leftId: ThemeId,
  rightId: ThemeId,
): number {
  if (!state.themes[leftId] || !state.themes[rightId]) {
    throw new Error(`Inactive support matchup: ${leftId} vs ${rightId}.`);
  }
  const targetedCounterplay = getCounterplaySupportMatchupLogitAdjustment(
    state,
    leftId,
    rightId,
  );
  const planAdjustment =
    oneSideSupportPlanBonus(state, leftId, rightId) -
    oneSideSupportPlanBonus(state, rightId, leftId);
  return clamp(
    targetedCounterplay + planAdjustment,
    -SUPPORT_DIRECTION_MATCHUP_LOGIT_CAP,
    SUPPORT_DIRECTION_MATCHUP_LOGIT_CAP,
  );
}

function pairWinProbabilityWithKeywords(
  leftPower: number,
  rightPower: number,
  leftKeywords: readonly PlayKeyword[],
  rightKeywords: readonly PlayKeyword[],
  leftCounterAdoption: number,
  rightCounterAdoption: number,
  situationalLogitAdjustment: number,
): number {
  const leftEffectivePower = leftPower - 9 * leftCounterAdoption;
  const rightEffectivePower = rightPower - 9 * rightCounterAdoption;
  const keywordAdjustment = getKeywordMatchupLogitAdjustment(
    leftKeywords,
    rightKeywords,
  );
  const strategicAdjustment = capStrategicMatchupLogit(
    keywordAdjustment + situationalLogitAdjustment,
  );
  return clamp(
    sigmoid(
      strategicAdjustment + (leftEffectivePower - rightEffectivePower) / 12,
    ),
    0.2,
    0.8,
  );
}

/**
 * Resolves one game from an even baseline, keyword interaction, and raw
 * effective power. Keyword influence is capped in play-keywords.ts before the
 * power term is added, so authored power remains an independent lever. There
 * is no theme-ID matchup table: old and future themes obey the same rules.
 */
export function getPairWinProbability(
  leftId: ThemeId,
  rightId: ThemeId,
  leftPower: number,
  rightPower: number,
  leftCounterAdoption = 0,
  rightCounterAdoption = 0,
  situationalLogitAdjustment = 0,
): number {
  const leftContent = THEME_BY_ID[leftId];
  const rightContent = THEME_BY_ID[rightId];
  if (!leftContent || !rightContent) {
    throw new Error(`Unknown matchup: ${leftId} vs ${rightId}.`);
  }
  return pairWinProbabilityWithKeywords(
    leftPower,
    rightPower,
    leftContent.playKeywords,
    rightContent.playKeywords,
    leftCounterAdoption,
    rightCounterAdoption,
    situationalLogitAdjustment,
  );
}

/** Current deterministic matchup, including learning and released supports. */
export function getCurrentPairWinProbability(
  state: GameState,
  leftId: ThemeId,
  rightId: ThemeId,
  genericMeta = getCurrentGenericMetaModel(state),
): number {
  const left = state.themes[leftId];
  const right = state.themes[rightId];
  if (!left || !right) {
    throw new Error(`Inactive current matchup: ${leftId} vs ${rightId}.`);
  }
  const leftOptimization = getThemeOptimizationStatus(state, leftId);
  const rightOptimization = getThemeOptimizationStatus(state, rightId);
  return pairWinProbabilityWithKeywords(
    left.power - leftOptimization.powerPenalty +
      (genericMeta.themePowerBonusById[leftId] ?? 0),
    right.power - rightOptimization.powerPenalty +
      (genericMeta.themePowerBonusById[rightId] ?? 0),
    getEffectiveThemePlayKeywords(state, leftId),
    getEffectiveThemePlayKeywords(state, rightId),
    left.counterAdoption,
    right.counterAdoption,
    getSupportDirectionMatchupLogitAdjustment(state, leftId, rightId) +
      genericMeta.getPairLogitAdjustment(leftId, rightId),
  );
}

function computeWinRates(state: GameState): void {
  const ids = themeIds(state);
  const probabilities: Record<string, number> = {};
  const genericMeta = getCurrentGenericMetaModel(state);

  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    const leftId = ids[leftIndex];
    probabilities[`${leftId}|${leftId}`] = 0.5;
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const rightId = ids[rightIndex];
      const probability = getCurrentPairWinProbability(
        state,
        leftId,
        rightId,
        genericMeta,
      );
      probabilities[`${leftId}|${rightId}`] = probability;
      probabilities[`${rightId}|${leftId}`] = 1 - probability;
    }
  }

  for (const leftId of ids) {
    let winRate = 0;
    for (const rightId of ids) {
      winRate +=
        state.themes[rightId].share * probabilities[`${leftId}|${rightId}`];
    }
    state.themes[leftId].winRate = round(clamp(winRate, 0.2, 0.8), 6);
  }
}

function softmax(values: number[]): number[] {
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

function applyMetaAdoptionCutoff(
  modeledShares: number[],
  currentShares: number[],
): number[] {
  const included = modeledShares.map((share, index) =>
    share >=
    (currentShares[index] <= META_ADOPTION_SHARE_FLOOR + 1e-9
      ? META_REENTRY_TARGET_SHARE
      : META_EXIT_TARGET_SHARE),
  );

  if (!included.some(Boolean)) {
    const leaderIndex = modeledShares.reduce(
      (best, share, index) => (share > modeledShares[best] ? index : best),
      0,
    );
    included[leaderIndex] = true;
  }

  const includedTotal = modeledShares.reduce(
    (total, share, index) => total + (included[index] ? share : 0),
    0,
  );
  return modeledShares.map((share, index) =>
    included[index] ? share / includedTotal : 0,
  );
}

function projectWithBounds(
  values: number[],
  lowerBounds: number[],
  upperBounds: number[],
): number[] {
  const result = values.map((value, index) =>
    clamp(value, lowerBounds[index], upperBounds[index]),
  );

  for (let iteration = 0; iteration < 30; iteration += 1) {
    const difference = 1 - result.reduce((sum, value) => sum + value, 0);
    if (Math.abs(difference) < 1e-12) break;
    const eligible = result
      .map((value, index) => ({ value, index }))
      .filter(({ value, index }) =>
        difference > 0
          ? value < upperBounds[index] - 1e-12
          : value > lowerBounds[index] + 1e-12,
      );
    if (eligible.length === 0) break;
    const portion = difference / eligible.length;
    for (const { index } of eligible) {
      result[index] = clamp(
        result[index] + portion,
        lowerBounds[index],
        upperBounds[index],
      );
    }
  }

  const remaining = 1 - result.reduce((sum, value) => sum + value, 0);
  if (Math.abs(remaining) > 1e-10) {
    const index = result.findIndex((value, candidate) =>
      remaining > 0
        ? value + remaining <= upperBounds[candidate] + 1e-10
        : value + remaining >= lowerBounds[candidate] - 1e-10,
    );
    if (index >= 0) result[index] += remaining;
  }
  return result;
}

function findWeekSnapshot(state: GameState): GameState["history"][number] | undefined {
  const targetDay = state.day - 7;
  const competitiveHistory = getCompetitiveSeasonHistory(state);
  for (let index = competitiveHistory.length - 1; index >= 0; index -= 1) {
    if (competitiveHistory[index].day <= targetDay) {
      return competitiveHistory[index];
    }
  }
  return undefined;
}

function updateMetaShares(state: GameState): void {
  const ids = themeIds(state);
  const weekSnapshot = findWeekSnapshot(state);
  const tierUtilities: number[] = [];
  const casualUtilities: number[] = [];
  const collectorUtilities: number[] = [];

  for (const id of ids) {
    const content = THEME_BY_ID[id];
    const runtime = state.themes[id];
    runtime.previousWeekShare = weekSnapshot?.shares[id] ?? runtime.previousWeekShare;
    const win = (runtime.winRate - 0.5) * 10;
    const appeal = (content.appeal - 50) / 50;
    // Difficulty is an adoption cost, not a combat penalty.  A demanding deck
    // can therefore keep an excellent win rate in practiced hands while still
    // remaining a sleeper pick instead of automatically becoming popular.
    const difficulty = (content.difficulty - 50) / 50;
    const freshness = runtime.freshness / 100;
    const fatigue = runtime.fatigue / 100;
    const unpleasantness = runtime.unpleasantness / 100;
    const visibility = ids.length >= META_TIER_OUT_MIN_THEME_COUNT
      ? clamp(
          Math.log(
            Math.max(runtime.share, META_ADOPTION_SHARE_FLOOR) * ids.length,
          ),
          -2.5,
          2,
        )
      : 0;
    const noise =
      (keyedRandom(state.seed, "meta-noise", state.day, id) - 0.5) * 0.07;

    tierUtilities.push(
      1.4 * win +
        0.25 * appeal +
        0.2 * freshness -
        0.65 * fatigue -
        0.35 * unpleasantness +
        0.26 * visibility -
        0.12 * difficulty +
        noise,
    );
    casualUtilities.push(
      0.55 * win +
        0.7 * appeal +
        0.35 * freshness -
        0.55 * fatigue -
        0.7 * unpleasantness +
        0.18 * visibility -
        0.55 * difficulty +
        noise,
    );
    collectorUtilities.push(
      0.2 * win +
        1.1 * appeal +
        0.6 * freshness -
        0.35 * fatigue -
        0.2 * unpleasantness +
        0.08 * visibility -
        0.2 * difficulty +
        noise,
    );
  }

  const matureMeta = ids.length >= META_TIER_OUT_MIN_THEME_COUNT;
  const tierTemperature = matureMeta ? 0.52 : 0.78;
  const casualTemperature = matureMeta ? 0.62 : 0.82;
  const collectorTemperature = matureMeta ? 0.76 : 0.86;
  const tierTargets = softmax(
    tierUtilities.map((value) => value / tierTemperature),
  );
  const casualTargets = softmax(
    casualUtilities.map((value) => value / casualTemperature),
  );
  const collectorTargets = softmax(
    collectorUtilities.map((value) => value / collectorTemperature),
  );
  const tierWeight = state.users.tier;
  const casualWeight = state.users.casual * 0.75;
  const collectorWeight = state.users.collector * 0.35;
  const totalWeight = tierWeight + casualWeight + collectorWeight;
  const modeledShares = ids.map((_, index) =>
      (tierTargets[index] * tierWeight +
        casualTargets[index] * casualWeight +
        collectorTargets[index] * collectorWeight) /
      totalWeight,
  );

  const oldShares = ids.map((id) => state.themes[id].share);
  const desired = ids.length >= META_TIER_OUT_MIN_THEME_COUNT
    ? applyMetaAdoptionCutoff(modeledShares, oldShares)
    : modeledShares.map((share) => 0.96 * share + 0.04 / ids.length);
  const candidate = desired.map((target, index) =>
    oldShares[index] + clamp(0.055 * (target - oldShares[index]), -DAILY_SHARE_LIMIT, DAILY_SHARE_LIMIT),
  );
  const tieredOut = candidate.map(
    (share, index) =>
      desired[index] === 0 &&
      share <= META_TIER_OUT_SNAP_SHARE &&
      state.themes[ids[index]].freshness <= 0,
  );
  const snappedCandidate = candidate.map((share, index) =>
    tieredOut[index] ? META_ADOPTION_SHARE_FLOOR : share,
  );
  const lowerBounds = oldShares.map((share, index) =>
    tieredOut[index]
      ? META_ADOPTION_SHARE_FLOOR
      : Math.max(SHARE_FLOOR, share - DAILY_SHARE_LIMIT),
  );
  const upperBounds = oldShares.map((share, index) =>
    tieredOut[index]
      ? META_ADOPTION_SHARE_FLOOR
      : Math.min(SHARE_CEILING, share + DAILY_SHARE_LIMIT),
  );
  const projected = projectWithBounds(
    snappedCandidate,
    lowerBounds,
    upperBounds,
  );

  for (let index = 0; index < ids.length; index += 1) {
    state.themes[ids[index]].share = round(projected[index], 9);
  }
  const sum = ids.reduce((total, id) => total + state.themes[id].share, 0);
  const residual = round(1 - sum, 9);
  if (residual !== 0) {
    const residualIndex = projected.reduce(
      (best, share, index) => (share > projected[best] ? index : best),
      0,
    );
    const residualTheme = state.themes[ids[residualIndex]];
    residualTheme.share = round(residualTheme.share + residual, 9);
  }
}

function hasCounterEvent(
  state: GameState,
  themeId: ThemeId,
  type: CommunityEventType,
  build: number,
): boolean {
  return state.community.some(
    (event) =>
      event.themeId === themeId &&
      event.type === type &&
      event.value === build,
  );
}

function appendCommunity(
  state: GameState,
  event: Omit<CommunityEvent, "id" | "day" | "body">,
): void {
  const complete: CommunityEvent = {
    ...event,
    id: `community-${state.nextCommunityId}`,
    day: state.day,
    body: "",
  };
  complete.body = formatCommunityEvent(complete, state);
  state.nextCommunityId += 1;
  state.community.push(complete);
  if (state.community.length > COMMUNITY_LIMIT) {
    state.community.splice(0, state.community.length - COMMUNITY_LIMIT);
  }
}

function appendEmergentNarrativesForCurrentDay(state: GameState): void {
  for (const narrative of getEmergentNarrativesForDay(state, state.day)) {
    if (
      state.community.some(
        (event) =>
          event.day === state.day && event.body === narrative.event.body,
      )
    ) {
      continue;
    }
    state.community.push({
      ...narrative.event,
      id: `community-${state.nextCommunityId}`,
    });
    state.nextCommunityId += 1;
  }
  if (state.community.length > COMMUNITY_LIMIT) {
    state.community.splice(0, state.community.length - COMMUNITY_LIMIT);
  }
}

function updateExperience(state: GameState): void {
  for (const content of activeContents(state)) {
    const runtime = state.themes[content.id];
    const calculated = calculateThemeBase(content, runtime);
    const daysSinceSupport =
      runtime.lastSupportDay === null
        ? Math.min(state.day, 180)
        : state.day - runtime.lastSupportDay;
    const sustainedShare = clamp((runtime.share - 0.08) / 0.24, 0, 1);
    const sustainedLead = clamp(runtime.topStreakDays / 90, 0, 1);
    const unpleasantnessAccelerator =
      1 + 1.4 * clamp((runtime.unpleasantness - 35) / 55, 0, 1);
    const exposurePressure =
      (26 * sustainedShare +
        30 * sustainedLead +
        14 * sustainedShare * sustainedLead) *
      unpleasantnessAccelerator;
    const fatigueTarget = clamp(
      7 + exposurePressure + 0.035 * daysSinceSupport,
      5,
      100,
    );
    const fatigueIsRising = fatigueTarget >= runtime.fatigue;
    const fatigueResponse = fatigueIsRising
      ? 0.02 * unpleasantnessAccelerator
      : 0.025;
    const fatigueStepLimit = fatigueIsRising
      ? 0.22 + 0.05 * (unpleasantnessAccelerator - 1)
      : 0.45;
    runtime.fatigue = round(
      clamp(
        moveTowards(
          runtime.fatigue,
          runtime.fatigue + fatigueResponse * (fatigueTarget - runtime.fatigue),
          fatigueStepLimit,
        ),
        0,
        100,
      ),
      4,
    );

    const winPressure = 8 * Math.max(0, (runtime.winRate - 0.5) / 0.05);
    const sharePressure = 35 * Math.max(0, (runtime.share - 0.1) / 0.2);
    const counterTax = 12 * runtime.counterAdoption;
    const unpleasantnessTarget = clamp(
      calculated.unpleasantness + winPressure + sharePressure + counterTax,
      0,
      100,
    );
    runtime.unpleasantness = round(
      clamp(
        runtime.unpleasantness +
          0.15 * (unpleasantnessTarget - runtime.unpleasantness),
        0,
        100,
      ),
      4,
    );
  }
}

function appendOptimizationDiscoveries(state: GameState): void {
  for (const content of activeContents(state)) {
    const current = getThemeOptimizationStatusAtDay(
      state,
      content.id,
      state.day,
    );
    if (current.debutDay === null) continue;
    const previous = getThemeOptimizationStatusAtDay(
      state,
      content.id,
      state.day - 1,
    );
    if (
      previous.progress < OPTIMIZATION_DISCOVERY_POINT &&
      current.progress >= OPTIMIZATION_DISCOVERY_POINT
    ) {
      appendCommunity(state, {
        category: "meta",
        type: "optimization-rumor",
        themeId: content.id,
        value: current.debutDay,
      });
    }
  }
}

function updateCounters(state: GameState): void {
  for (const content of activeContents(state)) {
    const runtime = state.themes[content.id];
    const shareThreat = clamp((runtime.share - 0.16) / 0.18, 0, 1);
    const winThreat = clamp((runtime.winRate - 0.53) / 0.09, 0, 1);
    const unpleasantThreat = clamp((runtime.unpleasantness - 55) / 35, 0, 1);
    const threat =
      0.45 * shareThreat + 0.35 * winThreat + 0.2 * unpleasantThreat;

    if (runtime.counterDiscoveredDay === null) {
      const before = runtime.counterProgress;
      if (threat > 0.08) {
        const speedNoise =
          0.85 +
          0.3 * keyedRandom(state.seed, "counter-speed", state.day, content.id, runtime.counterBuild);
        runtime.counterProgress = round(
          clamp(
            runtime.counterProgress + (2 + 6 * threat) * speedNoise,
            0,
            runtime.counterThreshold,
          ),
          4,
        );
      } else {
        runtime.counterProgress = round(
          Math.max(0, runtime.counterProgress - 0.5),
          4,
        );
      }

      const rumorPoint = runtime.counterThreshold * 0.35;
      if (
        before < rumorPoint &&
        runtime.counterProgress >= rumorPoint &&
        !hasCounterEvent(state, content.id, "counter-rumor", runtime.counterBuild)
      ) {
        appendCommunity(state, {
          category: "counter",
          type: "counter-rumor",
          themeId: content.id,
          value: runtime.counterBuild,
        });
      }

      if (runtime.counterProgress >= runtime.counterThreshold) {
        runtime.counterDiscoveredDay = state.day;
        appendCommunity(state, {
          category: "counter",
          type: "counter-found",
          themeId: content.id,
          value: runtime.counterBuild,
        });
      }
    }

    const beforeAdoption = runtime.counterAdoption;
    if (runtime.counterDiscoveredDay !== null) {
      const efficacy =
        0.58 +
        0.32 * keyedRandom(state.seed, "counter-efficacy", content.id, runtime.counterBuild);
      const opportunityCost =
        0.18 +
        0.47 * keyedRandom(state.seed, "counter-cost", content.id, runtime.counterBuild);
      const desired = clamp(
        ((runtime.share - 0.08) * 2.5 +
          (runtime.winRate - 0.5) * 3 +
          (runtime.unpleasantness - 50) / 150) *
          efficacy *
          (1 - 0.45 * opportunityCost),
        0,
        0.65,
      );
      runtime.counterAdoption = round(
        clamp(runtime.counterAdoption + 0.08 * (desired - runtime.counterAdoption), 0, 0.65),
        5,
      );
    } else {
      runtime.counterAdoption = round(runtime.counterAdoption * 0.97, 5);
    }

    if (
      beforeAdoption < 0.12 &&
      runtime.counterAdoption >= 0.12 &&
      !hasCounterEvent(state, content.id, "counter-adopted", runtime.counterBuild)
    ) {
      appendCommunity(state, {
        category: "counter",
        type: "counter-adopted",
        themeId: content.id,
        value: runtime.counterBuild,
      });
    }
    if (
      beforeAdoption < 0.32 &&
      runtime.counterAdoption >= 0.32 &&
      !hasCounterEvent(state, content.id, "counter-tax", runtime.counterBuild)
    ) {
      appendCommunity(state, {
        category: "counter",
        type: "counter-tax",
        themeId: content.id,
        value: runtime.counterBuild,
      });
    }
  }
}

function updateTopTheme(state: GameState): void {
  const ids = themeIds(state);
  let topId = ids[0];
  for (const id of ids.slice(1)) {
    if (state.themes[id].share > state.themes[topId].share) topId = id;
  }
  for (const id of ids) {
    state.themes[id].topStreakDays =
      id === topId ? state.themes[id].topStreakDays + 1 : 0;
  }
  if (topId !== state.currentTopThemeId) {
    appendCommunity(state, {
      category: "meta",
      type: "top-theme-changed",
      themeId: topId,
      relatedThemeId: state.currentTopThemeId,
    });
    state.currentTopThemeId = topId;
  }
}

/**
 * One-day competitive-player shock from restrictions announced yesterday.
 * Community copy is deliberately ignored: only the recorded card decision and
 * the pre-change meta snapshot can affect users.
 */
function restrictionTierShock(state: GameState): number {
  const decisionDay = state.day - 1;
  const policyProfile = getPublishedRestrictionPolicyProfile(state, decisionDay);
  const publishedDecisionCount =
    policyProfile.directionMix.tighten +
    policyProfile.directionMix.loosen +
    policyProfile.directionMix.unchanged;
  if (publishedDecisionCount === 0) return 0;
  const policyShockPenalty =
    policyProfile.quality === "narrow"
      ? 0.0015
      : policyProfile.quality === "incomplete"
        ? 0.001
        : 0;
  const staleOmissionPenalty = policyProfile.staleReliefComplete ? 0 : 0.0005;
  const decisions = state.community.filter(
    (event) =>
      event.day === decisionDay &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction") &&
      Boolean(event.partId) &&
      Number.isInteger(event.previousValue) &&
      Number.isInteger(event.value),
  );
  if (decisions.length === 0) {
    return round(
      clamp(policyShockPenalty + staleOmissionPenalty, 0, 0.035),
      7,
    );
  }

  const snapshot = state.history.find((entry) => entry.day === decisionDay);
  const snapshotShares = snapshot?.shares ?? Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  const rankedIds = Object.entries(snapshotShares)
    .filter(([, share]) => Number.isFinite(share) && share > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([themeId]) => themeId);
  const byTheme = new Map<
    ThemeId,
    { totalImpact: number; meaningfulCuts: number }
  >();

  for (const event of decisions) {
    const found = event.partId ? findPart(event.partId) : undefined;
    if (!found || found.content.id !== event.themeId) continue;
    const oldLimit = event.previousValue as RestrictionLimit;
    const newLimit = event.value as RestrictionLimit;
    if (
      oldLimit < 0 ||
      oldLimit > 3 ||
      newLimit < 0 ||
      newLimit > 3
    ) {
      continue;
    }
    const dependencyLoss = Math.max(
      0,
      copyAvailability(found.part, oldLimit) -
        copyAvailability(found.part, newLimit),
    );
    if (dependencyLoss <= 1e-6) continue;
    const impact =
      found.part.powerWeight * found.part.inclusion * dependencyLoss;
    const aggregate = byTheme.get(event.themeId) ?? {
      totalImpact: 0,
      meaningfulCuts: 0,
    };
    aggregate.totalImpact += impact;
    aggregate.meaningfulCuts += 1;
    byTheme.set(event.themeId, aggregate);
  }

  let combinedShock = 0;
  for (const [themeId, aggregate] of byTheme) {
    const runtime = state.themes[themeId];
    if (!runtime) continue;
    const priorShare = snapshotShares[themeId] ?? runtime.share;
    const rank = rankedIds.indexOf(themeId);
    const rankWeight = rank < 0 ? 0.15 : clamp(1 - rank * 0.18, 0.15, 1);
    const shareWeight = clamp((priorShare - 0.025) / 0.3, 0.12, 1);
    const prominence = 0.68 * shareWeight + 0.32 * rankWeight;
    const severity = clamp(aggregate.totalImpact / 22, 0, 1.2);
    const overlap = 1 + 0.2 * Math.max(0, aggregate.meaningfulCuts - 1);
    let introducedDay = 1;
    for (const batch of state.releaseHistory) {
      if (
        batch.day < state.day &&
        batch.products.some(
          (product) =>
            product.kind === "new-theme" && product.themeId === themeId,
        )
      ) {
        introducedDay = Math.max(introducedDay, batch.day);
      }
    }
    const activeInvestment = clamp((state.day - introducedDay) / 240, 0, 1);
    const streakInvestment = clamp(runtime.topStreakDays / 90, 0, 1);
    const investment = 1 + 0.16 * activeInvestment + 0.24 * streakInvestment;
    const grossShock = 0.028 * prominence * severity * overlap * investment;

    const unpleasantRelief = clamp((runtime.unpleasantness - 55) / 40, 0, 1);
    const oppressionRelief = clamp((priorShare - 0.18) / 0.25, 0, 1);
    const reliefFraction =
      0.5 * unpleasantRelief * (0.35 + 0.65 * oppressionRelief);
    combinedShock += grossShock * (1 - reliefFraction);
  }

  const qualityMultiplier = policyProfile.quality === "balanced" ? 0.7 : 1;
  return round(
    clamp(
      combinedShock * qualityMultiplier +
        policyShockPenalty +
        staleOmissionPenalty,
      0,
      0.035,
    ),
    7,
  );
}

function updateUsers(state: GameState): void {
  const top = state.themes[state.currentTopThemeId];
  const contents = activeContents(state);
  const weightedUnpleasantness = contents.reduce(
    (sum, content) =>
      sum +
      state.themes[content.id].share *
        state.themes[content.id].unpleasantness,
    0,
  );
  const oppression = clamp((top.share - 0.22) / 0.25, 0, 1);
  const unpleasantExcess = clamp((weightedUnpleasantness - 45) / 40, 0, 1);
  const weightedFatigue = contents.reduce(
    (sum, content) =>
      sum + state.themes[content.id].share * state.themes[content.id].fatigue,
    0,
  );
  const fatigueExcess = clamp((weightedFatigue - 32) / 52, 0, 1);
  const rotationPenalty = clamp((top.topStreakDays - 60) / 120, 0, 1);
  const averageSupportPower =
    contents.reduce(
      (sum, content) => sum + state.themes[content.id].supportPower,
      0,
    ) / contents.length;
  const powerTrendExtreme = clamp(Math.abs(averageSupportPower) / 18, 0, 1);
  const releaseBuzz = isReleaseDay(state.day)
    ? 1
    : clamp(
        Math.max(...contents.map((content) => state.themes[content.id].freshness)) /
          250,
        0,
        0.4,
      );
  const appealBuzz = clamp(
    contents.reduce(
      (sum, content) =>
        sum +
        state.themes[content.id].share *
          (content.appeal / 100) *
          (0.4 + state.themes[content.id].freshness / 100),
      0,
    ),
    0,
    1,
  );
  const trustLoss = clamp((70 - state.purchaseTrust) / 50, 0, 1);
  const releaseSaturation = clamp(
    state.releaseHistory
      .filter(
        (batch) =>
          !isInitialGenericReleaseBatch(batch) && state.day - batch.day <= 90,
      )
      .reduce((sum, batch) => sum + batch.products.length, 0) / 18,
    0,
    1,
  );

  const tierRate = clamp(
    0.0003 * releaseBuzz +
      0.00008 * (1 - rotationPenalty) -
      0.0011 * oppression -
      0.0008 * rotationPenalty -
      0.0007 * powerTrendExtreme -
      0.00035 * unpleasantExcess -
      0.0004 * fatigueExcess,
    -0.003,
    0.002,
  );
  const casualRate = clamp(
      0.0003 * releaseBuzz +
      0.0002 * appealBuzz -
      0.0009 * unpleasantExcess -
      0.00045 * oppression -
      0.0006 * fatigueExcess,
    -0.003,
    0.002,
  );
  const collectorRate = clamp(
    0.00055 * releaseBuzz +
      0.00025 * appealBuzz -
      0.0011 * trustLoss -
      0.00035 * releaseSaturation,
    -0.003,
    0.002,
  );

  const tierBefore = state.users.tier;
  const businessRates = getBusinessUserRateModifiers(state);
  const shockRate = restrictionTierShock(state);
  const shockedTierUsers = tierBefore * shockRate;
  const movedToCasual = shockedTierUsers * 0.25;
  state.users.tier = round(
    Math.max(
      0,
      tierBefore * (1 + tierRate + businessRates.tier) - shockedTierUsers,
    ),
    2,
  );
  state.users.casual = round(
    Math.max(
      0,
      state.users.casual * (1 + casualRate + businessRates.casual) +
        movedToCasual,
    ),
    2,
  );
  state.users.collector = round(
    Math.max(
      0,
      state.users.collector *
        (1 + collectorRate + businessRates.collector),
    ),
    2,
  );
}

function salesCurve(age: number): number {
  if (age < 0 || age >= RELEASE_SALES_WINDOW_DAYS) return 0;
  let denominator = 0;
  for (let day = 0; day < RELEASE_SALES_WINDOW_DAYS; day += 1) {
    denominator += Math.exp(-day / RELEASE_SALES_DECAY_DAYS);
  }
  return Math.exp(-age / RELEASE_SALES_DECAY_DAYS) / denominator;
}

function newThemePowerCreep(releaseDay: number): number {
  let releaseSteps = 0;
  for (
    let candidate = FIRST_RELEASE_DAY;
    candidate < releaseDay;
    candidate += RELEASE_INTERVAL
  ) {
    if (isRegularReleaseDay(candidate)) releaseSteps += 1;
  }
  return round(releaseSteps * NEW_THEME_POWER_CREEP_PER_RELEASE, 4);
}

/** Stable forecast shared by release generation and save normalization. */
export function getNewThemeExpectedPower(
  content: Pick<ThemeContent, "basePower">,
  releaseDay: number,
): number {
  return content.basePower + newThemePowerCreep(releaseDay);
}

/** Power that a newly released theme will have when its effects apply. */
export function getNewThemeLaunchPower(
  content: Pick<ThemeContent, "basePower">,
  adjustment: PowerAdjustment,
  releaseDay: number,
): number {
  return round(
    clamp(
      getNewThemeExpectedPower(content, releaseDay) + adjustment * 2.2,
      10,
      95,
    ),
    4,
  );
}

function releaseTargetShare(
  content: ThemeContent,
  adjustment: PowerAdjustment,
  releaseDay = 30,
): number {
  return clamp(
    0.035 +
      (content.appeal - 50) / 1000 +
      adjustment * 0.006 +
      newThemePowerCreep(releaseDay) * 0.001,
    0.025,
    0.1,
  );
}

function updateFinance(state: GameState): void {
  const activeUsers = totalUsers(state);
  const competitiveHistory = getCompetitiveSeasonHistory(state);
  const placementReport = getRecentPlacementReport(
    competitiveHistory,
    state.seed,
    competitiveHistory.at(-1)?.day ?? state.day,
  );
  let revenue =
    (activeUsers * CATALOG_DAILY_SPEND_PER_USER) / 100_000_000 +
    getBusinessEventRevenueBonus(state);
  const buyerRateBonus = getBusinessBuyerRateBonus(state);
  // A release review settles before its D+1 mechanical effects. Project one
  // day ahead so the just-locked generic has a deterministic demand estimate.
  const genericSalesMeta = getCurrentGenericMetaModel(state, state.day + 1);
  for (const batch of state.releaseHistory) {
    if (isInitialGenericReleaseBatch(batch)) continue;
    const age = state.day - batch.day;
    if (age < 0 || age >= 30) continue;
    let batchRevenue = 0;
    let reprintRevenueBoost = 0;
    for (const product of batch.products) {
      if (product.kind === "reprint") {
        if (age === 0) reprintRevenueBoost += product.releaseRevenueBoost;
        continue;
      }
      if (product.kind === "generic") {
        const card = getGenericCard(product.genericCardId);
        const meta = genericSalesMeta.cardMetaById[product.genericCardId];
        if (!card || !meta) continue;
        const tuningHype = (product.powerAdjustment + 3) / 6;
        const strength = clamp((meta.effectivePower - 50) / 40, 0, 1);
        const buyerRate = clamp(
          0.04 +
            0.23 * meta.marketReach +
            0.13 * meta.mirrorDemand +
            0.12 * strength +
            0.055 * tuningHype +
            0.04 * (card.appeal / 100) -
            0.12 * (1 - state.purchaseTrust / 100) +
            buyerRateBonus,
          0.02,
          0.5,
        );
        const averageSpend =
          60_000 +
          22_000 * tuningHype +
          16_000 * (card.appeal / 100) +
          8_000 * strength;
        batchRevenue +=
          ((activeUsers * buyerRate * averageSpend) / 100_000_000) *
          salesCurve(age);
        continue;
      }
      const content = THEME_BY_ID[product.themeId];
      const runtime = state.themes[product.themeId];
      if (!content) continue;
      const tuningHype = (product.powerAdjustment + 3) / 6;
      const novelty = product.kind === "new-theme" ? 1 : 0.58;
      const modeledShare = runtime?.share ?? releaseTargetShare(
        content,
        product.powerAdjustment,
        batch.day,
      );
      const modeledFatigue = runtime?.fatigue ?? 8;
      const debutDay = getThemeDebutDay(
        state.releaseHistory,
        product.themeId,
      );
      const placementTierDay = debutDay === null
        ? state.day
        : Math.max(state.day, debutDay);
      const productMetaTier = getPlacementTier(
        placementReport.themes[product.themeId]?.placementShare ?? 0,
        placementTierDay,
        debutDay,
      ).tier;
      const modeledPower = runtime?.power ??
        (product.kind === "new-theme"
          ? getNewThemeLaunchPower(
              content,
              product.powerAdjustment,
              batch.day,
            )
          : content.basePower);
      const buyerRate = clamp(
        0.045 +
          0.62 * modeledShare +
          PACK_DEMAND_BY_META_TIER[productMetaTier] +
          0.07 * tuningHype +
          0.075 * novelty +
          0.04 * (content.appeal / 100) -
          0.08 * (modeledFatigue / 100) -
          0.12 * (1 - state.purchaseTrust / 100) +
          // A dominant product creates compulsory competitive demand even as
          // players say they dislike the format. The 90-day chart is meant to
          // expose this short-term sales / long-term trust contradiction.
          0.055 *
            clamp(
              (modeledPower - 64) / 24 +
                modeledShare * 1.4,
              0,
              1,
            ) +
          buyerRateBonus,
        0.02,
        0.38,
      );
      const averageSpend =
        55_000 + 20_000 * novelty + 18_000 * tuningHype;
      const potential =
        (activeUsers * buyerRate * averageSpend) / 100_000_000;
      batchRevenue += potential * salesCurve(age);
    }
    // Four products share the established three-product shelf and marketing budget.
    // A fourth neutral product therefore creates no automatic 4/3 windfall.
    batchRevenue *= RELEASE_SHELF_PRODUCT_BASELINE / batch.products.length;
    batchRevenue += reprintRevenueBoost;
    if (hasPackOddsAdjustmentForRelease(state, batch.day)) {
      batchRevenue *= PACK_ODDS_REVENUE_MULTIPLIER;
    }
    revenue += batchRevenue;
  }

  revenue *= getBusinessStrategyModifiers(
    state.operations.strategy,
  ).revenueMultiplier;

  const noise =
    0.98 + 0.04 * keyedRandom(state.seed, "daily-revenue", state.day);
  revenue = round(Math.max(0, revenue * noise), 4);
  state.finance.today = revenue;
  state.recentRevenue.push(revenue);
  if (state.recentRevenue.length > 30) state.recentRevenue.shift();
  state.finance.rolling30 = round(
    state.recentRevenue.reduce((sum, value) => sum + value, 0),
    4,
  );
  state.finance.cumulative = round(state.finance.cumulative + revenue, 4);
  const dailyOperatingCost = getDailyOperatingCost(state.day, activeUsers);
  const operatingCash = round(
    revenue * OPERATING_CASH_MARGIN - dailyOperatingCost,
    4,
  );
  state.finance.todayOperatingCost = dailyOperatingCost;
  state.finance.cumulativeOperatingCosts = round(
    state.finance.cumulativeOperatingCosts + dailyOperatingCost,
    4,
  );
  state.finance.todayOperatingCash = round(
    operatingCash + getResolvedBusinessEventCashDelta(state),
    4,
  );
  state.finance.cash = round(
    Math.max(0, state.finance.cash + operatingCash),
    4,
  );
}

export function getExpectedTier(power: number): ExpectedTier {
  if (power >= 80) return "Tier 0";
  if (power >= 71) return "Tier 1";
  if (power >= 63) return "Tier 2";
  return "Tier 3";
}

function releaseDirection(
  state: GameState,
  themeId: ThemeId,
): SupportDirection {
  const directions: SupportDirection[] = [
    "consistency",
    "counterplay",
    "finisher",
    "recovery",
  ];
  return directions[
    Math.floor(
      keyedRandom(state.seed, "release-direction", state.day, themeId) *
        directions.length,
    )
  ];
}

type ReleaseOptionDraft =
  | Omit<Extract<ReleaseOption, { kind: "new-theme" }>, "id" | "expectedTier">
  | Omit<Extract<ReleaseOption, { kind: "support" }>, "id" | "expectedTier">
  | Omit<Extract<ReleaseOption, { kind: "generic" }>, "id" | "expectedTier">
  | Omit<Extract<ReleaseOption, { kind: "reprint" }>, "id" | "expectedTier">;

function usesGenericReleaseRules(state: GameState, day = state.day): boolean {
  return (
    state.genericReleaseStartDay !== null &&
    day >= state.genericReleaseStartDay
  );
}

function makeReleaseOption(
  state: GameState,
  option: ReleaseOptionDraft,
): ReleaseOption {
  const complete = {
    ...option,
    id: `release-option-${state.nextReleaseOptionId}`,
    expectedTier: getExpectedTier(option.expectedPower),
  } as ReleaseOption;
  state.nextReleaseOptionId += 1;
  return complete;
}

function generateReprintReleaseSlate(state: GameState): void {
  const queuedRequest = state.supportRequests
    .filter(
      (request): request is Extract<SupportRequest, { kind: "reprint" }> =>
        request.kind === "reprint" &&
        request.status === "queued" &&
        request.eligibleReleaseDay <= state.day,
    )
    .sort((left, right) => left.proposedDay - right.proposedDay)[0];
  const urgency = (candidate: ReprintImpactPreview): number =>
    candidate.referencePrice *
    (0.55 + candidate.playDemandScore / 100) *
    (1 + Math.min(1, candidate.ageDays / 180) * 0.2);
  const eligible: ReprintImpactPreview[] = getReprintCandidates(state)
    .filter((candidate) => candidate.ageDays >= REPRINT_MINIMUM_AGE_DAYS)
    .sort((left, right) => {
      const leftRequested = Number(left.cardId === queuedRequest?.cardId);
      const rightRequested = Number(right.cardId === queuedRequest?.cardId);
      return (
        rightRequested - leftRequested ||
        urgency(right) - urgency(left) ||
        left.cardId.localeCompare(right.cardId)
      );
    })
    .slice(0, REPRINT_PACK_CANDIDATE_COUNT);

  if (eligible.length < REPRINT_PACK_CANDIDATE_COUNT) {
    throw new Error(
      `Every reprint review requires ${REPRINT_PACK_CANDIDATE_COUNT} eligible cards.`,
    );
  }

  const options = eligible.map((candidate) =>
    makeReleaseOption(state, {
      kind: "reprint",
      cardId: candidate.cardId,
      themeId: candidate.themeId ?? state.currentTopThemeId,
      expectedPower: 50,
      requested: candidate.cardId === queuedRequest?.cardId,
      ...(candidate.cardId === queuedRequest?.cardId && queuedRequest
        ? { requestId: queuedRequest.id }
        : {}),
    })
  );
  if (queuedRequest && options.some((option) => option.requested)) {
    queuedRequest.status = "offered";
  }
  state.releaseSlate = {
    day: state.day,
    releaseKind: "reprint",
    options,
  };
}

function generateReleaseSlate(state: GameState): void {
  if (!isReleaseDay(state.day) || state.releaseSlate) return;
  if (isReprintReleaseDay(state.day)) {
    generateReprintReleaseSlate(state);
    return;
  }

  const inactiveThemes = THEMES.filter(
    (content) => !state.themes[content.id],
  )
    .sort(
      (left, right) =>
        keyedRandom(state.seed, "new-theme-slate", state.day, right.id) -
        keyedRandom(state.seed, "new-theme-slate", state.day, left.id),
    );

  const queuedRequest = state.supportRequests
    .filter(
      (request): request is ThemeSupportRequest =>
        getReleaseRequestKind(request) === "support" &&
        request.status === "queued" &&
        request.eligibleReleaseDay <= state.day &&
        request.themeId !== undefined &&
        request.direction !== undefined &&
        Boolean(state.themes[request.themeId]) &&
        getCommittedSupportCount(state, request.themeId) <= MAX_THEME_SUPPORTS,
    )
    .sort((left, right) => left.proposedDay - right.proposedDay)[0];
  const selectedSupportIds = new Set<ThemeId>();
  const supportSpecs: Extract<ReleaseOptionDraft, { kind: "support" }>[] = [];

  if (queuedRequest) {
    queuedRequest.status = "offered";
    selectedSupportIds.add(queuedRequest.themeId);
    supportSpecs.push({
      kind: "support",
      themeId: queuedRequest.themeId,
      direction: queuedRequest.direction,
      expectedPower:
        state.themes[queuedRequest.themeId].power +
        DIRECTION_POWER[queuedRequest.direction],
      requested: true,
      requestId: queuedRequest.id,
    });
  }

  const supportCandidates = activeContents(state)
    .filter(
      (content) =>
        !selectedSupportIds.has(content.id) &&
        getCommittedSupportCount(state, content.id) < MAX_THEME_SUPPORTS,
    )
    .sort((left, right) => {
      const score = (content: ThemeContent) => {
        const runtime = state.themes[content.id];
        const age =
          runtime.lastSupportDay === null
            ? state.day + 45
            : state.day - runtime.lastSupportDay;
        return (
          age +
          80 * (0.12 - runtime.share) +
          0.35 * runtime.fatigue +
          20 * keyedRandom(state.seed, "support-slate", state.day, content.id)
        );
      };
      return score(right) - score(left);
    });

  for (const content of supportCandidates) {
    if (supportSpecs.length >= 6) break;
    const direction = releaseDirection(state, content.id);
    selectedSupportIds.add(content.id);
    supportSpecs.push({
      kind: "support",
      themeId: content.id,
      direction,
      expectedPower:
        state.themes[content.id].power + DIRECTION_POWER[direction],
      requested: false,
    });
  }

  const genericRules = usesGenericReleaseRules(state);
  let newThemeCount = Math.min(3, inactiveThemes.length);
  let supportOptionCount = Math.min(3, supportSpecs.length);
  if (genericRules) {
    if (newThemeCount < 3 || supportOptionCount < 3) {
      throw new Error("Generic release reviews require three themes and three supports.");
    }
  } else {
    while (newThemeCount + supportOptionCount < 6) {
      if (newThemeCount < inactiveThemes.length) {
        newThemeCount += 1;
      } else if (supportOptionCount < supportSpecs.length) {
        supportOptionCount += 1;
      } else {
        throw new Error("Every release review requires six eligible options.");
      }
    }
  }

  const supportOptions = supportSpecs
    .slice(0, supportOptionCount)
    .map((option) => makeReleaseOption(state, option));

  const newThemeOptions = inactiveThemes.slice(0, newThemeCount).map((content) =>
    makeReleaseOption(state, {
      kind: "new-theme",
      themeId: content.id,
      expectedPower: getNewThemeExpectedPower(content, state.day),
      requested: false,
    }),
  );

  const releasedGenericIds = new Set(
    state.releaseHistory.flatMap((batch) =>
      batch.products.flatMap((product) =>
        product.kind === "generic" ? [product.genericCardId] : [],
      ),
    ),
  );
  const queuedGenericRequest = state.supportRequests
    .filter(
      (
        request,
      ): request is Extract<
        SupportRequest,
        { kind: "indirect-support" | "environment-target" }
      > =>
        (request.kind === "indirect-support" ||
          request.kind === "environment-target") &&
        request.status === "queued" &&
        request.eligibleReleaseDay <= state.day &&
        Boolean(state.themes[request.themeId]),
    )
    .sort((left, right) => left.proposedDay - right.proposedDay)[0];
  const requestedGenericCard = queuedGenericRequest
    ? getRequestGenericPool(state, queuedGenericRequest)[0]
    : undefined;
  if (queuedGenericRequest && requestedGenericCard) {
    queuedGenericRequest.status = "offered";
  }

  const genericCandidates = GENERIC_CARD_CATALOG
    .filter((card) => !releasedGenericIds.has(card.id))
    .filter((card) => card.id !== requestedGenericCard?.id)
    .sort(
      (left, right) =>
        keyedRandom(state.seed, "generic-card-slate", state.day, right.id) -
          keyedRandom(state.seed, "generic-card-slate", state.day, left.id) ||
        left.id.localeCompare(right.id),
    );
  const distinctKeywordCards: typeof genericCandidates = requestedGenericCard
    ? [requestedGenericCard]
    : [];
  const selectedKeywords = new Set<PlayKeyword>();
  if (requestedGenericCard) selectedKeywords.add(requestedGenericCard.keyword);
  for (const card of genericCandidates) {
    if (distinctKeywordCards.length >= GENERIC_RELEASE_OPTION_COUNT) break;
    if (selectedKeywords.has(card.keyword)) continue;
    distinctKeywordCards.push(card);
    selectedKeywords.add(card.keyword);
  }
  for (const card of genericCandidates) {
    if (distinctKeywordCards.length >= GENERIC_RELEASE_OPTION_COUNT) break;
    if (distinctKeywordCards.includes(card)) continue;
    distinctKeywordCards.push(card);
  }
  const genericOptions = genericRules
    ? distinctKeywordCards.map((card) =>
        makeReleaseOption(state, {
          kind: "generic",
          genericCardId: card.id,
          expectedPower: card.basePower,
          requested: card.id === requestedGenericCard?.id,
          ...(card.id === requestedGenericCard?.id && queuedGenericRequest
            ? {
                requestId: queuedGenericRequest.id,
                requestKind: queuedGenericRequest.kind,
                requestThemeId: queuedGenericRequest.themeId,
                requestKeyword: card.keyword,
              }
            : {}),
        }),
      )
    : [];

  const options = [
    ...newThemeOptions,
    ...supportOptions,
    ...genericOptions,
  ];
  const expectedOptionCount = genericRules ? 9 : 6;
  if (options.length !== expectedOptionCount) {
    throw new Error(
      `Every release review requires exactly ${expectedOptionCount} eligible options.`,
    );
  }
  state.releaseSlate = { day: state.day, releaseKind: "regular", options };
}

function createThemeRuntime(
  seed: number,
  content: ThemeContent,
  share: number,
  supportPower = 0,
  releaseDay: number | null = null,
): ThemeRuntime {
  const releasedPartIds = content.parts
    .slice(0, INITIAL_THEME_PART_COUNT)
    .map((part) => part.id);
  const legalLimits = Object.fromEntries(
    releasedPartIds.map((partId) => [partId, 3 as RestrictionLimit]),
  );
  const runtime: ThemeRuntime = {
    share: round(share, 9),
    previousWeekShare: round(share, 9),
    winRate: 0.5,
    power: clamp(content.basePower + supportPower, 10, 95),
    unpleasantness: content.baseUnpleasantness * UNPLEASANTNESS_RUNTIME_SCALE,
    fatigue: releaseDay === null ? clamp(14 + 30 * share, 0, 100) : 8,
    legalLimits,
    partStats: {},
    lastSupportDay: releaseDay,
    freshness: releaseDay === null ? 0 : 100,
    topStreakDays: 0,
    counterProgress: 0,
    counterThreshold: 0,
    counterAdoption: 0,
    counterDiscoveredDay: null,
    counterBuild: 0,
    supportPower,
    supportUnpleasantness: 0,
    supportCount: 0,
    releasedPartIds,
    lastSupportAdjustment: null,
    supportReplacementPressure: 0,
  };
  runtime.counterThreshold = counterThreshold(seed, content, 0);
  return runtime;
}

function activateNewTheme(
  state: GameState,
  content: ThemeContent,
  adjustment: PowerAdjustment,
  releaseDay = state.day,
): void {
  if (state.themes[content.id]) throw new Error(`${content.id} is already active.`);
  const powerOffset =
    adjustment * 2.2 + newThemePowerCreep(releaseDay);
  const targetShare = releaseTargetShare(content, adjustment, releaseDay);
  const previousIds = [...state.activeThemeIds];
  state.activeThemeIds.push(content.id);
  state.themes[content.id] = createThemeRuntime(
    state.seed,
    content,
    targetShare,
    powerOffset,
    releaseDay,
  );
  state.themes[content.id].supportUnpleasantness = round(
    adjustment >= 0 ? adjustment * 1.6 : adjustment * 0.45,
    4,
  );

  const ids = state.activeThemeIds;
  const values = [
    ...previousIds.map((themeId) => state.themes[themeId].share * (1 - targetShare)),
    targetShare,
  ];
  const projected = projectWithBounds(
    values,
    ids.map(() => SHARE_FLOOR),
    ids.map(() => SHARE_CEILING),
  );
  ids.forEach((themeId, index) => {
    state.themes[themeId].share = round(projected[index], 9);
    state.themes[themeId].previousWeekShare = state.themes[themeId].share;
  });
}

function applySupportRelease(
  state: GameState,
  option: Pick<
    Extract<ReleasedProduct, { kind: "support" }>,
    "optionId" | "themeId" | "direction"
  >,
  adjustment: PowerAdjustment,
  releaseDay = state.day,
): void {
  const runtime = state.themes[option.themeId];
  if (!runtime) throw new Error(`Inactive support theme: ${option.themeId}.`);
  if (runtime.supportCount >= MAX_THEME_SUPPORTS) {
    throw new Error(`${option.themeId} already received all three support waves.`);
  }
  const content = THEME_BY_ID[option.themeId];
  const expectedReleasedCount =
    INITIAL_THEME_PART_COUNT +
    runtime.supportCount * SUPPORT_PARTS_PER_RELEASE;
  if (runtime.releasedPartIds.length !== expectedReleasedCount) {
    throw new Error(`Invalid released card pool for ${option.themeId}.`);
  }
  const nextPartIds = content.parts
    .slice(
      expectedReleasedCount,
      expectedReleasedCount + SUPPORT_PARTS_PER_RELEASE,
    )
    .map((part) => part.id);
  if (nextPartIds.length !== SUPPORT_PARTS_PER_RELEASE) {
    throw new Error(`Missing prepared support cards for ${option.themeId}.`);
  }
  runtime.releasedPartIds.push(...nextPartIds);
  for (const partId of nextPartIds) {
    runtime.legalLimits[partId] = 3;
  }
  runtime.supportCount += 1;
  runtime.lastSupportAdjustment = adjustment;
  runtime.supportReplacementPressure =
    REPLACEMENT_PRESSURE_BY_ADJUSTMENT[adjustment];
  const ids = state.activeThemeIds;
  const oldTargetShare = runtime.share;
  const targetShare = clamp(
    oldTargetShare + SUPPORT_SHARE_SURGE_BY_ADJUSTMENT[adjustment],
    SHARE_FLOOR,
    SHARE_CEILING,
  );
  const remainingBefore = Math.max(1e-9, 1 - oldTargetShare);
  const remainingAfter = 1 - targetShare;
  const surgedShares = ids.map((themeId) =>
    themeId === option.themeId
      ? targetShare
      : state.themes[themeId].share * (remainingAfter / remainingBefore),
  );
  const projectedShares = projectWithBounds(
    surgedShares,
    ids.map(() => SHARE_FLOOR),
    ids.map(() => SHARE_CEILING),
  );
  ids.forEach((themeId, index) => {
    state.themes[themeId].share = round(projectedShares[index], 9);
  });
  const direction = option.direction ?? "consistency";
  const variation =
    0.94 +
    0.12 *
      keyedRandom(state.seed, "support-power", option.optionId, option.themeId);
  const rawPower = clamp(
    DIRECTION_POWER[direction] + adjustment * 2.2,
    0.25,
    10,
  );
  const diminishingReturn = clamp(
    1 - Math.max(0, runtime.supportPower) / 42,
    0.3,
    1,
  );
  runtime.supportPower = round(
    runtime.supportPower + rawPower * variation * diminishingReturn,
    4,
  );
  runtime.supportUnpleasantness = round(
    runtime.supportUnpleasantness +
      DIRECTION_UNPLEASANTNESS[direction] +
      adjustment * 1.25 +
      (keyedRandom(state.seed, "support-unpleasant", option.optionId) - 0.5) *
        0.8,
    4,
  );
  runtime.lastSupportDay = releaseDay;
  runtime.freshness = 100;
  runtime.fatigue = round(runtime.fatigue * 0.7, 4);
  runtime.counterBuild += 1;
  runtime.counterProgress = 0;
  runtime.counterAdoption = round(runtime.counterAdoption * 0.35, 5);
  runtime.counterDiscoveredDay = null;
  runtime.counterThreshold = counterThreshold(
    state.seed,
    content,
    runtime.counterBuild,
  );
}

function submitReprintRelease(
  state: GameState,
  selections: ReleaseSelection[],
): void {
  const slate = state.releaseSlate;
  if (!slate || getReleaseSlateKind(slate) !== "reprint") {
    throw new Error("A reprint pack can only be submitted from a reprint review.");
  }
  if (selections.length !== REPRINT_PACK_PRODUCT_COUNT) {
    throw new Error(
      `Exactly ${REPRINT_PACK_PRODUCT_COUNT} reprint cards must be selected.`,
    );
  }
  const selectionIds = new Set(selections.map((selection) => selection.optionId));
  if (selectionIds.size !== selections.length) {
    throw new Error("Reprint selections must be unique.");
  }
  const optionsById = new Map(slate.options.map((option) => [option.id, option]));
  const products: ReleasedProduct[] = selections.map((selection) => {
    if (selection.powerAdjustment !== 0) {
      throw new Error("Reprint cards cannot receive a power adjustment.");
    }
    const option = optionsById.get(selection.optionId);
    if (!option || option.kind !== "reprint") {
      throw new Error(`Unknown reprint option: ${selection.optionId}`);
    }
    const impact = getReprintImpactPreview(state, option.cardId);
    if (!impact || impact.ageDays < REPRINT_MINIMUM_AGE_DAYS) {
      throw new Error(`The reprint card is no longer eligible: ${option.cardId}`);
    }
    return {
      optionId: option.id,
      kind: "reprint" as const,
      cardId: option.cardId,
      themeId: option.themeId,
      ...(option.requestId ? { requestId: option.requestId } : {}),
      expectedTier: option.expectedTier,
      powerAdjustment: 0 as const,
      referencePrice: impact.referencePrice,
      trustDelta: impact.trustDelta,
      accessibilityUserGain: impact.accessibilityUserGain,
      collectorUserLoss: impact.collectorUserLoss,
      releaseRevenueBoost: impact.releaseRevenueBoost,
    };
  });

  for (const option of slate.options) {
    if (option.kind !== "reprint" || !option.requestId) continue;
    const request = state.supportRequests.find(
      (candidate) => candidate.id === option.requestId,
    );
    if (!request) continue;
    request.status = selectionIds.has(option.id) ? "released" : "skipped";
    request.releasedDay = selectionIds.has(option.id) ? state.day : null;
  }

  state.releaseHistory.push({
    day: state.day,
    releaseKind: "reprint",
    products,
  });
  state.releaseSlate = null;
  state.phase = "running";
  settleDecisionDay(state);
}

function submitRelease(
  state: GameState,
  selections: ReleaseSelection[],
): void {
  if (
    state.phase !== "release-edit" ||
    !state.releaseSlate ||
    state.releaseSlate.day !== state.day
  ) {
    throw new Error("Releases can only be submitted during a release review.");
  }
  if (getReleaseSlateKind(state.releaseSlate) === "reprint") {
    submitReprintRelease(state, selections);
    return;
  }
  const expectedSelectionCount = STANDARD_RELEASE_PRODUCT_COUNT;
  if (selections.length !== expectedSelectionCount) {
    throw new Error(
      `Exactly ${expectedSelectionCount} release options must be selected.`,
    );
  }
  const selectionIds = new Set(selections.map((selection) => selection.optionId));
  if (selectionIds.size !== selections.length) {
    throw new Error("Release selections must be unique.");
  }
  const optionsById = new Map(
    state.releaseSlate.options.map((option) => [option.id, option]),
  );
  const selectedOptions = selections.map((selection) =>
    optionsById.get(selection.optionId),
  );
  for (const kind of ["new-theme", "support", "generic"] as const) {
    if (!selectedOptions.some((option) => option?.kind === kind)) {
      throw new Error(
        "Direct release selections require at least one new theme, support, and generic card.",
      );
    }
  }
  const products: ReleasedProduct[] = [];

  for (const selection of selections) {
    if (
      !Number.isInteger(selection.powerAdjustment) ||
      selection.powerAdjustment < -3 ||
      selection.powerAdjustment > 3
    ) {
      throw new Error("Power adjustment must be an integer from -3 to 3.");
    }
    const option = optionsById.get(selection.optionId);
    if (!option) throw new Error(`Unknown release option: ${selection.optionId}`);
    if (option.kind === "reprint") {
      throw new Error("Reprints can only be selected in a dedicated reprint pack.");
    }
    if (
      option.kind === "support" &&
      getCommittedSupportCount(state, option.themeId) -
        (option.requestId ? 1 : 0) >=
        MAX_THEME_SUPPORTS
    ) {
      throw new Error(`${option.themeId} already received all three support waves.`);
    }

    const expectedPower =
      option.kind === "new-theme"
        ? getNewThemeLaunchPower(
            THEME_BY_ID[option.themeId],
            selection.powerAdjustment,
            state.day,
          )
        : option.expectedPower + selection.powerAdjustment * 2.2;
    if (option.kind === "generic") {
      products.push({
        optionId: option.id,
        kind: "generic",
        genericCardId: option.genericCardId,
        expectedTier: getExpectedTier(expectedPower),
        powerAdjustment: selection.powerAdjustment,
        ...(option.requestId ? { requestId: option.requestId } : {}),
      });
    } else if (option.kind === "new-theme") {
      products.push({
        optionId: option.id,
        kind: "new-theme",
        themeId: option.themeId,
        expectedTier: getExpectedTier(expectedPower),
        powerAdjustment: selection.powerAdjustment,
      });
    } else {
      products.push({
        optionId: option.id,
        kind: "support",
        themeId: option.themeId,
        direction: option.direction,
        expectedTier: getExpectedTier(expectedPower),
        powerAdjustment: selection.powerAdjustment,
        ...(option.requestId ? { requestId: option.requestId } : {}),
      });
    }
  }

  for (const option of state.releaseSlate.options) {
    if (
      (option.kind !== "support" && option.kind !== "generic") ||
      !option.requestId
    ) {
      continue;
    }
    const request = state.supportRequests.find(
      (candidate) => candidate.id === option.requestId,
    );
    if (!request) continue;
    if (selectionIds.has(option.id)) {
      request.status = "released";
      request.releasedDay = state.day;
    } else {
      request.status = "skipped";
    }
  }

  state.releaseHistory.push({
    day: state.day,
    releaseKind: "regular",
    products,
  });
  applyPendingPackOddsToCurrentRelease(state);
  state.releaseSlate = null;
  state.phase = "running";
  settleDecisionDay(state);
}

function applyReleaseEffectsForCurrentDay(state: GameState): void {
  const batch = state.releaseHistory.find(
    (candidate) => candidate.day === state.day - 1,
  );
  if (!batch || isInitialGenericReleaseBatch(batch)) return;
  let trustDelta = 0;
  for (const product of batch.products) {
    if (product.kind === "reprint") {
      trustDelta += product.trustDelta;
      state.users.casual = round(
        state.users.casual + product.accessibilityUserGain,
        4,
      );
      state.users.collector = round(
        Math.max(0, state.users.collector - product.collectorUserLoss),
        4,
      );
      const genericCard = getGenericCard(product.cardId);
      const themePart = genericCard ? undefined : findPart(product.cardId);
      appendCommunity(state, {
        category: "release",
        type: "release-reaction",
        themeId: themePart?.content.id ?? state.currentTopThemeId,
        ...(genericCard
          ? { genericCardId: genericCard.id }
          : { partId: product.cardId }),
        proposalId: product.requestId,
        value: product.trustDelta,
      });
      continue;
    }
    if (product.kind === "generic") {
      if (state.genericLimits[product.genericCardId] === undefined) {
        state.genericLimits[product.genericCardId] = 3;
      }
    } else if (product.kind === "new-theme") {
      if (!state.themes[product.themeId]) {
        activateNewTheme(
          state,
          THEME_BY_ID[product.themeId],
          product.powerAdjustment,
          batch.day,
        );
      }
    } else {
      const runtime = state.themes[product.themeId];
      if (runtime.lastSupportDay !== batch.day) {
        applySupportRelease(
          state,
          product,
          product.powerAdjustment,
          batch.day,
        );
      }
    }
    appendCommunity(state, {
      category: "release",
      type:
        product.kind === "support" ? "support-released" : "release-reaction",
      themeId:
        product.kind === "generic"
          ? state.currentTopThemeId
          : product.themeId,
      ...(product.kind === "generic"
        ? { genericCardId: product.genericCardId }
        : {}),
      value: product.powerAdjustment,
      ...((product.kind === "support" || product.kind === "generic") &&
      product.requestId
        ? { proposalId: product.requestId }
        : {}),
    });

    if (product.powerAdjustment >= 2) {
      trustDelta -= product.powerAdjustment === 3 ? 1.8 : 0.85;
      if (product.expectedTier === "Tier 0") trustDelta -= 0.45;
    } else if (product.powerAdjustment <= -2) {
      // Deliberately hollow products are safer for the meta but still make
      // buyers feel that the release slot was wasted.
      trustDelta -= product.powerAdjustment === -3 ? 0.5 : 0.2;
    } else {
      trustDelta += BALANCED_RELEASE_TRUST_RECOVERY;
    }
  }
  const appliedTrustDelta = batch.products.every(
    (product) => product.kind === "reprint",
  )
    ? Math.max(-REPRINT_PACK_TRUST_LOSS_CAP, trustDelta)
    : trustDelta;
  state.purchaseTrust = round(
    clamp(state.purchaseTrust + appliedTrustDelta, 0, 100),
    4,
  );
}

function appendRestrictionReactionsForCurrentDay(state: GameState): void {
  for (const event of state.community) {
    if (
      event.day !== state.day - 1 ||
      (event.type !== "restriction-applied" &&
        event.type !== "cosmetic-restriction" &&
        event.type !== "restriction-no-change")
    ) {
      continue;
    }
    appendCommunity(state, {
      category: "restriction",
      type: "restriction-demand",
      themeId: event.themeId,
      ...(event.partId ? { partId: event.partId } : {}),
      ...(event.genericCardId
        ? { genericCardId: event.genericCardId }
        : {}),
      ...(event.value === undefined ? {} : { value: event.value }),
    });
  }
}

function decayTemporaryState(state: GameState): void {
  for (const content of activeContents(state)) {
    const runtime = state.themes[content.id];
    runtime.freshness = round(Math.max(0, runtime.freshness - 2.5), 3);
  }
  const packOddsDetectedToday = state.operations.records.some(
    (record) =>
      record.type === "pack-odds" &&
      record.outcome === "detected" &&
      record.resolvedDay === state.day,
  );
  const requestedRecovery = packOddsDetectedToday
    ? 0
    : 0.015 + getBusinessTrustRecovery(state);
  // Only passive recovery has a 90-point ceiling. A score earned above 90 by
  // a discrete result must not be overwritten to 90 on the following day.
  const availableRecoveryRoom = Math.max(0, 90 - state.purchaseTrust);
  const appliedRecovery = Math.min(requestedRecovery, availableRecoveryRoom);
  const neglectLoss = getSupportNeglectPressure(state).dailyTrustLoss;
  state.purchaseTrust = round(
    clamp(state.purchaseTrust + appliedRecovery - neglectLoss, 0, 100),
    4,
  );
}

function recordHistory(state: GameState): void {
  const shares = Object.fromEntries(
    activeContents(state).map((content) => [content.id, state.themes[content.id].share]),
  );
  const winRates = Object.fromEntries(
    activeContents(state).map((content) => [
      content.id,
      state.themes[content.id].winRate,
    ]),
  );
  const topCutPlacements = getDeterministicDailyTopCutPlacements({
    seed: state.seed,
    day: state.day,
    shares,
    winRates,
  });
  const historyEntry: DailyHistory = {
    day: state.day,
    totalUsers: round(totalUsers(state), 2),
    revenue: state.finance.today,
    cash: state.finance.cash,
    operatingCash: state.finance.todayOperatingCash,
    purchaseTrust: state.purchaseTrust,
    topThemeId: state.currentTopThemeId,
    shares,
    winRates,
    topCutPlacements,
  };
  state.history.push(historyEntry);
  // Health includes the settled day's top-cut sample, so compute it only after
  // the row is visible to the rolling placement selectors.
  historyEntry.environmentHealth = getBusinessEnvironmentHealth(state);
  historyEntry.environmentHealthModel = ENVIRONMENT_HEALTH_MODEL;
  // Some daily-board branches consult today's settled history. Snapshot mood
  // only after that row exists so the stored gauge exactly matches the board
  // the player can open immediately after settlement.
  const communitySentiment = getDailyCommunitySentiment(state, state.day);
  historyEntry.communitySentiment = communitySentiment.index;
  historyEntry.communityPositive = communitySentiment.positive;
  historyEntry.communityNegative = communitySentiment.negative;
}

function isRestrictionDecisionEvent(event: CommunityEvent): boolean {
  return (
    event.type === "restriction-applied" ||
    event.type === "cosmetic-restriction" ||
    event.type === "restriction-no-change"
  );
}

/** Whether the seven-day emergency handover has completed its first ruling. */
export function isHandoverReady(state: GameState): boolean {
  const firstBanPublished = state.community.some(
    (event) =>
      event.day === FIRST_BAN_DAY && isRestrictionDecisionEvent(event),
  );
  return (
    state.day >= TUTORIAL_END_DAY &&
    state.phase === "running" &&
    firstBanPublished
  );
}

function finalizedRestrictionDecisionDays(
  state: GameState,
  throughDecisionDay: number,
): number[] {
  return [
    ...new Set(
      state.community
        .filter(
          (event) =>
            event.day <= throughDecisionDay &&
            isBanDay(event.day) &&
            isRestrictionDecisionEvent(event) &&
            state.history.some((entry) => entry.day === event.day) &&
            state.history.some(
              (entry) =>
                entry.day === event.day + RESTRICTION_OUTCOME_FOLLOWUP_DAYS,
            ),
        )
        .map((event) => event.day),
    ),
  ].sort((left, right) => left - right);
}

function ineffectiveRestrictionStreak(
  state: GameState,
  throughDecisionDay: number,
): number {
  let streak = 0;
  const decisionDays = finalizedRestrictionDecisionDays(
    state,
    throughDecisionDay,
  );
  for (let index = decisionDays.length - 1; index >= 0; index -= 1) {
    const decisionDay = decisionDays[index];
    const outcome = getRestrictionHistoricalOutcome(
      state,
      decisionDay,
      decisionDay + RESTRICTION_OUTCOME_FOLLOWUP_DAYS,
    );
    if (outcome.classification !== "ineffective") break;
    streak += 1;
  }
  return streak;
}

function restrictionOutcomeTrustDelta(
  state: GameState,
  decisionDay: number,
  classification: RestrictionOutcomeClassification,
): number {
  if (classification === "stabilized") return 1.5;
  if (classification === "overcorrected") return -7;
  if (classification === "replacement") return -3.5;
  if (classification === "mixed") return -0.25;
  if (classification !== "ineffective") return 0;

  const streak = ineffectiveRestrictionStreak(state, decisionDay);
  return streak <= 1 ? 0 : -Math.min(3, 0.75 * streak);
}

/** Applies the deterministic D+9 ownership-confidence result exactly once. */
function applyRestrictionOutcomeForCurrentDay(state: GameState): void {
  const decisionDay = state.day - RESTRICTION_OUTCOME_FOLLOWUP_DAYS;
  if (
    !isBanDay(decisionDay) ||
    !state.community.some(
      (event) =>
        event.day === decisionDay && isRestrictionDecisionEvent(event),
    )
  ) {
    return;
  }

  const outcome = getRestrictionHistoricalOutcome(
    state,
    decisionDay,
    state.day,
  );
  if (outcome.classification === "pending") return;
  const trustDelta = restrictionOutcomeTrustDelta(
    state,
    decisionDay,
    outcome.classification,
  );
  state.purchaseTrust = round(
    clamp(state.purchaseTrust + trustDelta, 0, 100),
    4,
  );

  const currentHistory = state.history.at(-1);
  if (currentHistory?.day === state.day) {
    currentHistory.purchaseTrust = state.purchaseTrust;
    currentHistory.environmentHealth = getBusinessEnvironmentHealth(state);
  }
}

function assignMandateSeed(state: GameState, campaignSeed: number): void {
  if (
    !Number.isInteger(campaignSeed) ||
    campaignSeed < 0 ||
    campaignSeed > 0xffffffff
  ) {
    throw new Error("Campaign seed must be a uint32 integer.");
  }
  if (state.day !== FIRST_BAN_DAY || state.handoverComplete) {
    throw new Error("The mandate seed can only be assigned after the first restriction review.");
  }

  state.seed = campaignSeed >>> 0;

  // The guaranteed DAY 20 dilemma has not appeared before the first guided
  // review, so its seeded type can safely move to the minted mandate timeline.
  if (
    state.operations.nextEventId === 1 &&
    state.operations.eventRecords.length === 0 &&
    state.operations.pendingEvent === null
  ) {
    state.operations.nextEventDay = getInitialBusinessEventDay(state.seed);
  }

  // Preserve already accumulated counter progress, but make the remaining
  // discovery threshold part of this mandate rather than the fixed prologue.
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (runtime.counterDiscoveredDay !== null) continue;
    runtime.counterThreshold = counterThreshold(
      state.seed,
      THEME_BY_ID[themeId],
      runtime.counterBuild,
    );
  }
}

function assertState(state: GameState): void {
  if (state.schemaVersion !== 9) {
    throw new Error(`Unsupported game-state schema: ${state.schemaVersion}.`);
  }
  if (
    state.genericReleaseStartDay !== null &&
    !isReleaseDay(state.genericReleaseStartDay)
  ) {
    throw new Error("Generic release rules must begin on a regular release day.");
  }
  const baselineBatches = state.releaseHistory.filter(
    (batch) => batch.releaseKind === "baseline",
  );
  if (
    baselineBatches.length > 1 ||
    (baselineBatches.length === 1 &&
      (state.releaseHistory[0] !== baselineBatches[0] ||
        !isInitialGenericReleaseBatch(baselineBatches[0])))
  ) {
    throw new Error("Invalid baseline generic release batch.");
  }
  if (
    baselineBatches.length === 1 &&
    INITIAL_GENERIC_CARD_IDS.some(
      (genericCardId) => state.genericLimits[genericCardId] === undefined,
    )
  ) {
    throw new Error("Every baseline generic card requires a current limit.");
  }
  for (const [genericCardId, limit] of Object.entries(state.genericLimits)) {
    if (!getGenericCard(genericCardId) || ![0, 1, 2, 3].includes(limit)) {
      throw new Error(`Invalid generic restriction: ${genericCardId}.`);
    }
    const appliedRelease = state.releaseHistory.some(
      (batch) =>
        (isInitialGenericReleaseBatch(batch)
          ? batch.day <= state.day
          : batch.day < state.day) &&
        batch.products.some(
          (product) =>
            product.kind === "generic" &&
            product.genericCardId === genericCardId,
        ),
    );
    if (!appliedRelease) {
      throw new Error(`Generic restriction precedes release: ${genericCardId}.`);
    }
  }
  if (
    !Number.isInteger(state.day) ||
    state.day < FIRST_BAN_DAY ||
    state.day > CAMPAIGN_END_DAY
  ) {
    throw new Error(
      `Campaign day must be between ${FIRST_BAN_DAY} and ${CAMPAIGN_END_DAY}.`,
    );
  }
  if (state.day === CAMPAIGN_END_DAY && state.phase !== "ended") {
    throw new Error(`The campaign must be ended on DAY ${CAMPAIGN_END_DAY}.`);
  }
  if (
    state.phase === "ended" &&
    state.day < CAMPAIGN_END_DAY &&
    totalUsers(state) > 0
  ) {
    throw new Error("The campaign cannot end early while players remain.");
  }
  for (const [name, value] of Object.entries({
    today: state.finance.today,
    rolling30: state.finance.rolling30,
    cumulative: state.finance.cumulative,
    cash: state.finance.cash,
    todayOperatingCash: state.finance.todayOperatingCash,
    todayOperatingCost: state.finance.todayOperatingCost,
    cumulativeOperatingCosts: state.finance.cumulativeOperatingCosts,
    cumulativeExpenses: state.finance.cumulativeExpenses,
  })) {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite finance value: ${name}.`);
    }
  }
  if (
    state.finance.today < 0 ||
    state.finance.rolling30 < 0 ||
    state.finance.cumulative < 0 ||
    state.finance.cash < -1e-6 ||
    state.finance.todayOperatingCost < 0 ||
    state.finance.cumulativeOperatingCosts < 0 ||
    state.finance.cumulativeExpenses < 0
  ) {
    throw new Error("Finance values cannot be negative.");
  }
  const latestSettledHistory = state.history.at(-1);
  const expectedTodayOperatingCost = getDailyOperatingCost(
    latestSettledHistory?.day ?? state.day,
    latestSettledHistory?.totalUsers ?? totalUsers(state),
  );
  if (
    state.day < OPERATING_COST_START_DAY &&
    (state.finance.todayOperatingCost !== 0 ||
      state.finance.cumulativeOperatingCosts !== 0)
  ) {
    throw new Error(
      `Operating costs cannot be charged before DAY ${OPERATING_COST_START_DAY}.`,
    );
  }
  if (
    state.finance.todayOperatingCost !== 0 &&
    Math.abs(
      state.finance.todayOperatingCost - expectedTodayOperatingCost,
    ) > 0.0001
  ) {
    throw new Error("Today's operating cost does not match the audience size.");
  }
  if (
    state.finance.cumulativeOperatingCosts + 0.0001 <
    state.finance.todayOperatingCost
  ) {
    throw new Error("Cumulative operating costs are inconsistent.");
  }
  if (
    !Number.isInteger(state.operations.nextActionId) ||
    state.operations.nextActionId !== state.operations.records.length + 1
  ) {
    throw new Error("Business-action sequence is inconsistent.");
  }
  const actionIds = new Set<string>();
  const actionDays = new Set<number>();
  const lastActionDayByType = new Map<BusinessActionType, number>();
  let previousActionDay = -1;
  let pendingPackOdds = 0;
  let strategicProjectCount = 0;
  let actionSpend = 0;
  for (const [index, record] of state.operations.records.entries()) {
    const definition = BUSINESS_ACTION_BY_TYPE[record.type];
    if (!definition) throw new Error(`Unknown business action: ${record.type}.`);
    const expectedId = `business-action-${index + 1}`;
    if (record.id !== expectedId || actionIds.has(record.id)) {
      throw new Error(`Invalid business-action ID: ${record.id}.`);
    }
    actionIds.add(record.id);
    if (
      actionDays.has(record.startedDay) ||
      record.startedDay <= previousActionDay
    ) {
      throw new Error(`More than one business action on DAY ${record.startedDay}.`);
    }
    actionDays.add(record.startedDay);
    previousActionDay = record.startedDay;
    const expectedEndsDay = getBusinessActionScheduledEndDay(
      record.startedDay,
      record.type,
    );
    if (
      !Number.isInteger(record.startedDay) ||
      record.startedDay < 1 ||
      record.startedDay >= LAST_DECISION_DAY ||
      record.startedDay > state.day ||
      !Number.isInteger(record.endsDay) ||
      record.endsDay !== expectedEndsDay ||
      record.endsDay > CAMPAIGN_END_DAY ||
      !Number.isFinite(record.cost) ||
      Math.abs(record.cost - definition.cost) > 1e-9
    ) {
      throw new Error(`Invalid business-action record: ${record.id}.`);
    }
    if (
      definition.minimumDay !== undefined &&
      record.startedDay < definition.minimumDay
    ) {
      throw new Error(`Business action started before its unlock day: ${record.id}.`);
    }
    const lastSameTypeDay = lastActionDayByType.get(record.type);
    if (
      lastSameTypeDay !== undefined &&
      record.startedDay - lastSameTypeDay < definition.cooldown
    ) {
      throw new Error(`Business-action cooldown was violated: ${record.id}.`);
    }
    lastActionDayByType.set(record.type, record.startedDay);
    if (
      record.risk !== undefined &&
      (!Number.isFinite(record.risk) || record.risk < 0 || record.risk > 1)
    ) {
      throw new Error(`Invalid business-action risk: ${record.id}.`);
    }
    if (
      record.resolvedDay !== undefined &&
      (!Number.isInteger(record.resolvedDay) ||
        record.resolvedDay <= record.startedDay ||
        record.resolvedDay > state.day)
    ) {
      throw new Error(`Invalid business-action resolution day: ${record.id}.`);
    }
    if (
      record.cashReturn !== undefined &&
      (!Number.isFinite(record.cashReturn) || record.cashReturn < 0)
    ) {
      throw new Error(`Invalid business-action cash return: ${record.id}.`);
    }
    const challengeError = getBusinessChallengeProgressError(record, state.day);
    if (challengeError) {
      throw new Error(
        `Invalid business challenge (${challengeError}): ${record.id}.`,
      );
    }
    if (
      isChallengeBusinessAction(record.type) &&
      record.risk === undefined &&
      !isBusinessChallengeDecisionDay(record.startedDay)
    ) {
      throw new Error(
        `Business challenge started outside a decision day: ${record.id}.`,
      );
    }
    if (
      isChallengeBusinessAction(record.type) &&
      record.risk === undefined &&
      record.challenge === undefined
    ) {
      throw new Error(`New business challenge has no progress record: ${record.id}.`);
    }
    switch (record.type) {
      case "tv-cm":
      case "animation-promotion":
      case "store-tour":
      case "beginner-camp":
      case "local-league":
      case "lending-exchange-network":
      case "collector-fair":
        if (
          record.environmentHealth !== undefined ||
          record.appliedDay !== undefined ||
          record.riskContext !== undefined ||
          record.cashReturn !== undefined ||
          record.challenge !== undefined
        ) {
          throw new Error(`Unexpected duration-action metadata: ${record.id}.`);
        }
        if (record.risk === undefined) {
          throw new Error(`Missing probabilistic action risk: ${record.id}.`);
        }
        if (!isProbabilisticBusinessAction(record.type)) {
          throw new Error(`Invalid probabilistic action type: ${record.id}.`);
        }
        if (record.outcome === "active") {
          if (record.resolvedDay !== undefined || state.day !== record.startedDay) {
            throw new Error(`Overdue probabilistic action: ${record.id}.`);
          }
        } else if (
          record.outcome === "success" ||
          record.outcome === "backlash"
        ) {
          if (
            record.resolvedDay !== record.startedDay + 1 ||
            record.outcome !==
              getProbabilisticBusinessActionOutcome(record)
          ) {
            throw new Error(`Invalid probabilistic action result: ${record.id}.`);
          }
        } else {
          throw new Error(`Invalid probabilistic action outcome: ${record.id}.`);
        }
        break;
      case "championship":
        if (
          record.outcome !== "active" &&
          record.outcome !== "success" &&
          record.outcome !== "backlash"
        ) {
          throw new Error(`Invalid championship outcome: ${record.id}.`);
        }
        if (
          record.environmentHealth === undefined ||
          !Number.isFinite(record.environmentHealth) ||
          record.environmentHealth < 0 ||
          record.environmentHealth > 100 ||
          record.appliedDay !== undefined
          || record.riskContext !== undefined
          || record.cashReturn !== undefined
        ) {
          throw new Error(`Invalid championship metadata: ${record.id}.`);
        }
        if (
          (record.outcome === "active") !==
          (record.resolvedDay === undefined)
        ) {
          throw new Error(`Invalid championship resolution: ${record.id}.`);
        }
        break;
      case "season-overhaul":
      case "global-launch":
      case "organized-play-platform": {
        strategicProjectCount += 1;
        const resolutionDelay = definition.resolutionDelay;
        const context = record.riskContext;
        if (
          !context ||
          resolutionDelay === undefined ||
          record.environmentHealth !== undefined ||
          record.appliedDay !== undefined
        ) {
          throw new Error(`Invalid strategic-project metadata: ${record.id}.`);
        }
        if (
          !Number.isFinite(context.environmentHealth) ||
          context.environmentHealth < 0 ||
          context.environmentHealth > 100 ||
          !Number.isFinite(context.purchaseTrust) ||
          context.purchaseTrust < 0 ||
          context.purchaseTrust > 100 ||
          !Number.isFinite(context.releaseQuality) ||
          context.releaseQuality < 0 ||
          context.releaseQuality > 100 ||
          !["balanced", "incomplete", "narrow", "none"].includes(
            context.policyQuality,
          ) ||
          !["early", "middle", "late"].includes(context.timing) ||
          !["environment", "trust", "policy", "release", "timing", "execution"].includes(
            context.primaryRisk,
          ) ||
          !["environment", "trust", "policy", "release", "timing", "execution"].includes(
            context.primaryStrength,
          )
        ) {
          throw new Error(`Invalid strategic-project risk context: ${record.id}.`);
        }
        const resolutionDay = record.startedDay + resolutionDelay;
        if (resolutionDay > LAST_DECISION_DAY) {
          throw new Error(`Strategic project resolves after the mandate: ${record.id}.`);
        }
        if (record.outcome === "active") {
          if (record.resolvedDay !== undefined || record.cashReturn !== undefined) {
            throw new Error(`Invalid unresolved strategic project: ${record.id}.`);
          }
          if (state.day >= resolutionDay) {
            throw new Error(`Overdue strategic project: ${record.id}.`);
          }
        } else if (
          record.outcome === "success" ||
          record.outcome === "backlash"
        ) {
          if (record.resolvedDay !== resolutionDay) {
            throw new Error(`Invalid strategic-project resolution: ${record.id}.`);
          }
          if (
            record.outcome === "success"
              ? Math.abs((record.cashReturn ?? -1) - (definition.successReturn ?? 0)) > 1e-9
              : record.cashReturn !== undefined
          ) {
            throw new Error(`Invalid strategic-project return: ${record.id}.`);
          }
        } else {
          throw new Error(`Invalid strategic-project outcome: ${record.id}.`);
        }
        break;
      }
      case "pack-odds": {
        if (
          record.outcome !== "pending" &&
          record.outcome !== "active" &&
          record.outcome !== "clean" &&
          record.outcome !== "detected"
        ) {
          throw new Error(`Invalid pack-odds outcome: ${record.id}.`);
        }
        if (
          record.risk === undefined ||
          record.environmentHealth !== undefined ||
          record.riskContext !== undefined ||
          record.cashReturn !== undefined
        ) {
          throw new Error(`Invalid pack-odds metadata: ${record.id}.`);
        }
        const isPending = record.outcome === "pending";
        const isAwaitingResolution = record.outcome === "active";
        const isResolved =
          record.outcome === "clean" || record.outcome === "detected";
        if (
          (isPending &&
            (record.appliedDay !== undefined ||
              record.resolvedDay !== undefined)) ||
          ((isAwaitingResolution || isResolved) &&
            (!Number.isInteger(record.appliedDay) ||
              record.appliedDay! < record.startedDay ||
              record.appliedDay! > state.day)) ||
          (isAwaitingResolution && record.resolvedDay !== undefined) ||
          (isResolved && record.resolvedDay === undefined)
        ) {
          throw new Error(`Invalid pack-odds lifecycle: ${record.id}.`);
        }
        const scheduledReleaseDay = getNextReleaseDay(record.startedDay);
        if (scheduledReleaseDay > LAST_RELEASE_DAY) {
          throw new Error(`Pack-odds action has no release slot: ${record.id}.`);
        }
        if (
          isPending &&
          (state.day > scheduledReleaseDay ||
            (state.day === scheduledReleaseDay &&
              state.phase !== "release-edit"))
        ) {
          throw new Error(`Overdue pending pack-odds action: ${record.id}.`);
        }
        if (isPending) pendingPackOdds += 1;
        break;
      }
    }
    actionSpend += record.cost;
  }
  if (pendingPackOdds > 1) {
    throw new Error("Only one pack-odds adjustment may be pending.");
  }
  if (strategicProjectCount > 1) {
    throw new Error("Only one strategic project may be attempted per campaign.");
  }

  if (
    !Number.isInteger(state.operations.nextEventId) ||
    state.operations.nextEventId !== state.operations.eventRecords.length + 1
  ) {
    throw new Error("Business-event sequence is inconsistent.");
  }
  for (const [axis, value] of Object.entries(state.operations.strategy)) {
    if (
      !Number.isFinite(value) ||
      value < BUSINESS_STRATEGY_MIN ||
      value > BUSINESS_STRATEGY_MAX
    ) {
      throw new Error(`Invalid business strategy axis: ${axis}.`);
    }
  }

  let eventSpend = 0;
  let expectedStrategy = { audience: 0, product: 0, posture: 0 };
  let expectedEventDay: number | null = getInitialBusinessEventDay(state.seed);
  let previousEventDay = -1;
  for (const [index, record] of state.operations.eventRecords.entries()) {
    const eventNumber = index + 1;
    const expectedId = `business-event-${eventNumber}`;
    const expectedType = getBusinessEventType(state.seed, eventNumber);
    const definition = BUSINESS_EVENT_BY_TYPE[record.type];
    if (
      !definition ||
      record.id !== expectedId ||
      record.type !== expectedType ||
      !Number.isInteger(record.appearedDay) ||
      record.appearedDay < getInitialBusinessEventDay(state.seed) ||
      record.appearedDay >= LAST_DECISION_DAY ||
      record.appearedDay > state.day ||
      record.appearedDay <= previousEventDay ||
      isReleaseDay(record.appearedDay) ||
      isBanDay(record.appearedDay) ||
      (expectedEventDay !== null && record.appearedDay !== expectedEventDay)
    ) {
      throw new Error(`Invalid business-event record: ${record.id}.`);
    }
    const choice = getBusinessEventChoice(record.type, record.choice);
    if (
      !Number.isFinite(record.cost) ||
      Math.abs(record.cost - choice.cost) > 1e-9 ||
      !Number.isFinite(record.risk) ||
      Math.abs(record.risk - choice.risk) > 1e-9 ||
      !Number.isInteger(record.resolutionDay) ||
      record.resolutionDay !== record.appearedDay + choice.resolutionDelay
    ) {
      throw new Error(`Invalid business-event choice snapshot: ${record.id}.`);
    }
    if (record.outcome === "pending") {
      if (record.resolvedDay !== undefined || state.day >= record.resolutionDay) {
        throw new Error(`Overdue business-event result: ${record.id}.`);
      }
    } else if (
      record.outcome === "success" ||
      record.outcome === "backlash"
    ) {
      if (record.resolvedDay !== record.resolutionDay) {
        throw new Error(`Invalid business-event resolution: ${record.id}.`);
      }
    } else {
      throw new Error(`Invalid business-event outcome: ${record.id}.`);
    }
    eventSpend += record.cost;
    expectedStrategy = applyBusinessStrategyDelta(
      expectedStrategy,
      choice.strategyDelta,
    );
    previousEventDay = record.appearedDay;
    expectedEventDay = getNextBusinessEventDay(
      state.seed,
      record.appearedDay,
      eventNumber + 1,
    );
  }

  for (const axis of ["audience", "product", "posture"] as const) {
    if (state.operations.strategy[axis] !== expectedStrategy[axis]) {
      throw new Error(`Business strategy does not match event history: ${axis}.`);
    }
  }

  const pendingEvent = state.operations.pendingEvent;
  if (pendingEvent) {
    const expectedId = `business-event-${state.operations.nextEventId}`;
    const expectedType = getBusinessEventType(
      state.seed,
      state.operations.nextEventId,
    );
    if (
      state.phase !== "running" ||
      state.operations.nextEventDay !== null ||
      pendingEvent.id !== expectedId ||
      pendingEvent.type !== expectedType ||
      pendingEvent.appearedDay !== state.day ||
      (expectedEventDay !== null && pendingEvent.appearedDay !== expectedEventDay) ||
      isReleaseDay(pendingEvent.appearedDay) ||
      isBanDay(pendingEvent.appearedDay)
    ) {
      throw new Error(`Invalid pending business event: ${pendingEvent.id}.`);
    }
  } else if (state.phase !== "ended") {
    const nextEventDay = state.operations.nextEventDay;
    if (
      nextEventDay !== null &&
      (!Number.isInteger(nextEventDay) ||
        nextEventDay <= state.day ||
        nextEventDay >= LAST_DECISION_DAY ||
        isReleaseDay(nextEventDay) ||
        isBanDay(nextEventDay) ||
        (expectedEventDay !== null && nextEventDay !== expectedEventDay))
    ) {
      throw new Error("Invalid next business-event day.");
    }
    if (expectedEventDay !== null && nextEventDay !== expectedEventDay) {
      throw new Error("Business-event schedule is inconsistent.");
    }
  }

  if (
    Math.abs(
      round(actionSpend + eventSpend, 4) - state.finance.cumulativeExpenses,
    ) > 1e-6
  ) {
    throw new Error("Business decision spend does not match finance history.");
  }

  const ids = themeIds(state);
  if (ids.length < 1 || new Set(ids).size !== ids.length) {
    throw new Error("Active theme IDs must be unique and non-empty.");
  }
  const shareTotal = ids.reduce((sum, id) => sum + state.themes[id].share, 0);
  if (!Number.isFinite(shareTotal) || Math.abs(shareTotal - 1) > 1e-6) {
    throw new Error(`Theme shares must add to 1; received ${shareTotal}.`);
  }
  for (const id of ids) {
    const runtime = state.themes[id];
    const expectedPartIds = THEME_BY_ID[id].parts
      .slice(
        0,
        INITIAL_THEME_PART_COUNT +
          runtime.supportCount * SUPPORT_PARTS_PER_RELEASE,
      )
      .map((part) => part.id);
    if (
      runtime.supportCount < 0 ||
      runtime.supportCount > MAX_THEME_SUPPORTS ||
      getCommittedSupportCount(state, id) > MAX_THEME_SUPPORTS ||
      runtime.releasedPartIds.length !== expectedPartIds.length ||
      runtime.releasedPartIds.some(
        (partId, index) => partId !== expectedPartIds[index],
      )
    ) {
      throw new Error(`Invalid released card pool: ${id}`);
    }
    for (const value of [
      runtime.share,
      runtime.winRate,
      runtime.power,
      runtime.unpleasantness,
      runtime.fatigue,
      runtime.counterAdoption,
      runtime.supportReplacementPressure,
    ]) {
      if (!Number.isFinite(value)) throw new Error(`Non-finite theme value: ${id}`);
    }
    if (runtime.share < SHARE_FLOOR - 1e-6 || runtime.share > SHARE_CEILING + 1e-6) {
      throw new Error(`Theme share out of bounds: ${id}`);
    }
  }
}

function settleDecisionDay(state: GameState): void {
  updateBusinessLifecycle(state);
  updateFinance(state);
  recordHistory(state);
  if (state.day >= CAMPAIGN_END_DAY || totalUsers(state) <= 0) {
    state.phase = "ended";
    state.operations.nextEventDay = null;
  }
  assertState(state);
}

function resolveCurrentDay(state: GameState): void {
  updateBusinessLifecycle(state);
  applyReleaseEffectsForCurrentDay(state);
  appendRestrictionReactionsForCurrentDay(state);
  decayTemporaryState(state);
  refreshThemeBases(state);
  computeWinRates(state);
  updateMetaShares(state);
  computeWinRates(state);
  updateExperience(state);
  appendOptimizationDiscoveries(state);
  updateCounters(state);
  updateTopTheme(state);
  updateUsers(state);
  updateFinance(state);
  recordHistory(state);
  applyRestrictionOutcomeForCurrentDay(state);
  appendEmergentNarrativesForCurrentDay(state);

  if (state.day >= CAMPAIGN_END_DAY || totalUsers(state) <= 0) {
    state.phase = "ended";
    state.operations.nextEventDay = null;
  }
  assertState(state);
}

function hasFormalReportArrivingToday(state: GameState): boolean {
  const restrictionDecisionDay =
    state.day - RESTRICTION_REPORT_DELAY_DAYS;
  const restrictionReport =
    isBanDay(restrictionDecisionDay) &&
    state.community.some(
      (event) =>
        event.day === restrictionDecisionDay &&
        isRestrictionDecisionEvent(event),
    );
  const releaseDecisionDay = state.day - RELEASE_REPORT_DELAY_DAYS;
  const releaseReport = state.releaseHistory.some(
    (batch) =>
      batch.day === releaseDecisionDay && batch.releaseKind !== "baseline",
  );
  return restrictionReport || releaseReport;
}

function advanceDays(state: GameState, days: number): void {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("ADVANCE_DAYS requires a non-negative integer.");
  }
  if (state.phase !== "running" || state.operations.pendingEvent) return;

  for (let elapsed = 0; elapsed < days; elapsed += 1) {
    if (state.phase !== "running" || state.day >= CAMPAIGN_END_DAY) break;
    state.day += 1;
    if (totalUsers(state) <= 0) {
      updateFinance(state);
      recordHistory(state);
      state.phase = "ended";
      state.operations.nextEventDay = null;
      assertState(state);
      break;
    }
    if (isReleaseDay(state.day)) {
      updateBusinessLifecycle(state);
      generateReleaseSlate(state);
      state.phase = "release-edit";
      break;
    }
    if (isBanDay(state.day)) {
      updateBusinessLifecycle(state);
      state.phase = "ban-edit";
      break;
    }
    openBusinessEvent(state);
    resolveCurrentDay(state);
    if (state.operations.pendingEvent) break;
    // The emergency handover is a real campaign gate. Stop on DAY 7 so the
    // UI and API callers can acknowledge it before the first DAY 10 product
    // review instead of silently skipping straight into release-edit.
    if (!state.handoverComplete && isHandoverReady(state)) break;
    if (hasFormalReportArrivingToday(state)) break;
  }
}

function findPart(partId: string): { content: ThemeContent; part: PartContent } | undefined {
  for (const content of THEMES) {
    const part = content.parts.find((candidate) => candidate.id === partId);
    if (part) return { content, part };
  }
  return undefined;
}

export function getProlongedSoftPolicyTrustLoss(
  state: GameState,
  policyProfile: RestrictionPolicyProfile,
): number {
  if (policyProfile.quality !== "narrow") return 0;

  // One or two cautious reviews can frustrate the community without making
  // owners doubt the value of buying cards. Purchase trust only starts to
  // break when a serious problem survives three consecutive regular reviews
  // (120 days from the first decision to the third).
  const previousReviewDays = [
    state.day - BAN_INTERVAL,
    state.day - BAN_INTERVAL * 2,
  ];
  if (previousReviewDays.some((day) => day < FIRST_BAN_DAY)) return 0;
  if (
    !previousReviewDays.every(
      (day) =>
        state.community.some(
          (event) =>
            event.day === day &&
            (event.type === "restriction-applied" ||
              event.type === "cosmetic-restriction" ||
              event.type === "restriction-no-change"),
        ) &&
        getPublishedRestrictionPolicyProfile(state, day).quality === "narrow",
    )
  ) {
    return 0;
  }

  const peakBanDemand = Math.max(
    0,
    ...state.activeThemeIds.map((themeId) => getBanDemand(state.themes[themeId])),
  );
  if (peakBanDemand < 65) return 0;

  const unresolvedSeverityLoss = peakBanDemand >= 80 ? 2 : 1;
  return policyProfile.meaningfulCutCount === 0
    ? unresolvedSeverityLoss
    : unresolvedSeverityLoss * 0.75;
}

function submitBan(
  state: GameState,
  changes: Record<string, RestrictionLimit>,
): void {
  if (
    state.phase !== "ban-edit" ||
    !isBanDay(state.day)
  ) {
    throw new Error("Restrictions can only be submitted on a regular restriction day.");
  }

  // Validate the whole command before mutating any card so rejected lists are
  // atomic and the UI can use the same exported capacity calculation.
  assertRestrictionCapacity(state, changes);
  const policyProfile = getRestrictionPolicyProfile(state, changes);
  let totalPowerLoss = 0;
  let genericValueShock = 0;
  let genericRecentProductChanges = 0;
  let appliedChangeCount = 0;
  for (const [partId, nextLimit] of Object.entries(changes)) {
    if (![0, 1, 2, 3].includes(nextLimit)) {
      throw new Error(`Invalid restriction limit for ${partId}.`);
    }
    const genericCard = getGenericCard(partId);
    if (genericCard) {
      const genericCardId = genericCard.id;
      const releaseDay = state.releaseHistory.find((batch) =>
        (isInitialGenericReleaseBatch(batch)
          ? batch.day <= state.day
          : batch.day < state.day) &&
        batch.products.some(
          (product) =>
            product.kind === "generic" &&
            product.genericCardId === genericCardId,
        ),
      )?.day;
      if (releaseDay === undefined) {
        throw new Error(`Unreleased generic card: ${partId}`);
      }
      const previousLimit = state.genericLimits[genericCardId] ?? 3;
      if (previousLimit === nextLimit) continue;
      const keywordsByTheme = Object.fromEntries(
        state.activeThemeIds.map((themeId) => [
          themeId,
          getEffectiveThemePlayKeywords(state, themeId),
        ]),
      );
      const beforeMeta = getCurrentGenericMetaModel(state);
      const impacts = selectGenericLimitThemeImpacts(
        state,
        keywordsByTheme,
        genericCardId,
        nextLimit,
      );
      const cardMeta = beforeMeta.cardMetaById[genericCardId];
      const restrictionFraction = Math.max(
        0,
        (previousLimit - nextLimit) / 3,
      );
      const strength = cardMeta
        ? clamp((cardMeta.effectivePower - 50) / 40, 0, 1)
        : 0;
      genericValueShock +=
        (cardMeta?.marketReach ?? 0) *
        restrictionFraction *
        (4 + 5 * strength);
      if (state.day - releaseDay <= 60) genericRecentProductChanges += 1;
      state.genericLimits[genericCardId] = nextLimit;
      appliedChangeCount += 1;
      const anchor = impacts
        .slice()
        .sort(
          (left, right) =>
            right.beforeAdoption * state.themes[right.themeId].share -
              left.beforeAdoption * state.themes[left.themeId].share ||
            left.themeId.localeCompare(right.themeId),
        )[0]?.themeId ?? state.currentTopThemeId;
      appendCommunity(state, {
        category: "restriction",
        type: "restriction-applied",
        themeId: anchor,
        genericCardId,
        partId: genericCardId,
        value: nextLimit,
        previousValue: previousLimit,
      });
      continue;
    }
    const found = findPart(partId);
    if (!found) throw new Error(`Unknown part: ${partId}`);
    const runtime = state.themes[found.content.id];
    if (!runtime) throw new Error(`Inactive theme part: ${partId}`);
    if (!runtime.releasedPartIds.includes(partId)) {
      throw new Error(`Unreleased theme part: ${partId}`);
    }
    const previousLimit = runtime.legalLimits[partId] ?? 3;
    if (previousLimit === nextLimit) continue;
    appliedChangeCount += 1;
    const before = copyAvailability(found.part, previousLimit);
    const after = copyAvailability(found.part, nextLimit);
    const impact =
      found.part.powerWeight * found.part.inclusion * Math.max(0, before - after);
    totalPowerLoss += impact;
    runtime.legalLimits[partId] = nextLimit;
    appendCommunity(state, {
      category: "restriction",
      type:
        Math.abs(before - after) < 1e-6
          ? "cosmetic-restriction"
          : "restriction-applied",
      themeId: found.content.id,
      partId,
      value: nextLimit,
      previousValue: previousLimit,
    });
  }

  // Keep the persisted result itself inside the cap as an invariant, not just
  // the submitted delta that produced it.
  assertRestrictionCapacity(state, {});

  if (appliedChangeCount === 0) {
    const content = THEME_BY_ID[state.currentTopThemeId];
    const runtime = state.themes[content.id];
    const part = content.parts
      .filter((candidate) => runtime.releasedPartIds.includes(candidate.id))
      .sort(
      (left, right) =>
        right.powerWeight * right.inclusion - left.powerWeight * left.inclusion,
      )[0];
    const unchangedLimit = runtime.legalLimits[part.id] ?? 3;
    appendCommunity(state, {
      category: "restriction",
      type: "restriction-no-change",
      themeId: content.id,
      partId: part.id,
      value: unchangedLimit,
      previousValue: unchangedLimit,
    });
  }

  const impactTrustLoss =
    Math.min(12, totalPowerLoss * 0.32) *
    // A sound policy avoids the extra "bad process" penalty, but owners still
    // absorb most of the value shock from a severe list.
    (policyProfile.quality === "balanced" ? 0.9 : 1);
  const recentProductTrustLoss = Math.min(
    6,
    (policyProfile.recentProductChanges + genericRecentProductChanges) * 1.5,
  );
  const policyTrustLoss =
    policyProfile.quality === "incomplete"
      ? 1.25
      : getProlongedSoftPolicyTrustLoss(state, policyProfile);
  const staleOmissionTrustLoss = policyProfile.staleReliefComplete ? 0 : 1;
  state.purchaseTrust = round(
    clamp(
      state.purchaseTrust -
        impactTrustLoss -
        Math.min(9, genericValueShock) -
        recentProductTrustLoss -
        policyTrustLoss -
        staleOmissionTrustLoss,
      0,
      100,
    ),
    4,
  );
  state.phase = "running";
  settleDecisionDay(state);
}

function assertReleaseRequestContext(
  state: GameState,
  lane: ReleaseRequestLane,
): number {
  if (state.phase === "ended") {
    throw new Error("Release requests are unavailable after the campaign ends.");
  }
  if (state.operations.pendingEvent) {
    throw new Error("Resolve the pending business event before changing a release request.");
  }
  if (state.phase !== "running") {
    throw new Error("Release requests are only available during normal operations.");
  }
  const eligibleReleaseDay = lane === "reprint"
    ? getNextReprintReleaseDay(state.day)
    : getNextRegularReleaseDay(state.day);
  if (eligibleReleaseDay > LAST_RELEASE_DAY) {
    throw new Error("There is no release slot left in this campaign.");
  }
  return eligibleReleaseDay;
}

function setReleaseRequest(
  state: GameState,
  input: ReleaseRequestInput,
): void {
  const lane = getReleaseRequestLane(input.kind);
  const eligibleReleaseDay = assertReleaseRequestContext(state, lane);
  const existing = getPendingReleaseRequest(state, lane);

  if (input.kind === "support") {
    if (!state.themes[input.themeId]) {
      throw new Error(`Inactive theme: ${input.themeId}`);
    }
    const existingReservation =
      existing &&
      getReleaseRequestKind(existing) === "support" &&
      "themeId" in existing &&
      existing.themeId === input.themeId
        ? 1
        : 0;
    if (
      getCommittedSupportCount(state, input.themeId) - existingReservation >=
      MAX_THEME_SUPPORTS
    ) {
      throw new Error("A theme can receive support at most three times.");
    }
  } else if (input.kind === "indirect-support") {
    if (!state.themes[input.themeId]) {
      throw new Error(`Inactive theme: ${input.themeId}`);
    }
    if (getIndirectSupportGenericPool(state, input.themeId).length === 0) {
      throw new Error("No unreleased generic card shares a keyword with that theme.");
    }
  } else if (input.kind === "environment-target") {
    if (!state.themes[input.themeId]) {
      throw new Error(`Inactive theme: ${input.themeId}`);
    }
    if (getEnvironmentTargetGenericPool(state, input.themeId).length === 0) {
      throw new Error("No unreleased generic card has a counter edge into that theme.");
    }
  } else if (!getReprintImpactPreview(state, input.cardId)) {
    throw new Error(`Only a currently released card can be reprinted: ${input.cardId}`);
  }

  if (existing) {
    existing.status = "replaced";
    existing.releasedDay = null;
  }

  const base = {
    id: `support-request-${state.nextSupportRequestId}`,
    proposedDay: state.day,
    eligibleReleaseDay,
    status: "queued",
    releasedDay: null,
  } as const;
  const request: SupportRequest = input.kind === "support"
    ? { ...base, kind: "support", themeId: input.themeId, direction: input.direction }
    : input.kind === "indirect-support"
      ? { ...base, kind: "indirect-support", themeId: input.themeId }
      : input.kind === "environment-target"
        ? { ...base, kind: "environment-target", themeId: input.themeId }
        : { ...base, kind: "reprint", cardId: input.cardId };
  state.nextSupportRequestId += 1;
  state.supportRequests.push(request);
  if (input.kind === "support") {
    state.lastSupportProposalDay = state.day;
    appendCommunity(state, {
      category: "release",
      type: "support-proposed",
      themeId: input.themeId,
      proposalId: request.id,
    });
  }
}

function cancelReleaseRequest(
  state: GameState,
  lane: ReleaseRequestLane,
): void {
  assertReleaseRequestContext(state, lane);
  const request = getPendingReleaseRequest(state, lane);
  if (!request || request.status !== "queued") {
    throw new Error(`There is no queued ${lane} release request to cancel.`);
  }
  request.status = "cancelled";
  request.releasedDay = null;
}

function proposeSupport(
  state: GameState,
  themeId: ThemeId,
  direction: SupportDirection,
): void {
  setReleaseRequest(state, { kind: "support", themeId, direction });
}

export function getBanDemand(theme: ThemeRuntime): number {
  const sharePressure = clamp((theme.share - 0.1) / 0.2, 0, 1);
  const winPressure = clamp((theme.winRate - 0.5) / 0.1, 0, 1);
  const risePressure = clamp((theme.share - theme.previousWeekShare) / 0.08, 0, 1);
  const demand =
    28 * sharePressure +
    28 * winPressure +
    30 * (theme.unpleasantness / 100) +
    8 * risePressure +
    6 * (theme.counterAdoption / 0.65);
  return round(clamp(demand, 0, 100), 1);
}

export function formatCommunityEvent(
  event: CommunityEvent,
  state: GameState,
): string {
  const themeName = THEME_BY_ID[event.themeId]?.shortName ?? event.themeId;
  const relatedName = event.relatedThemeId
    ? THEME_BY_ID[event.relatedThemeId]?.shortName ?? event.relatedThemeId
    : "기존 1위";
  const part = event.partId ? findPart(event.partId)?.part : undefined;
  const genericCard = event.genericCardId
    ? getGenericCard(event.genericCardId)
    : undefined;
  const proposal = event.proposalId
    ? state.supportRequests.find((candidate) => candidate.id === event.proposalId)
    : undefined;

  switch (event.type) {
    case "counter-rumor":
      return `${themeName} 상대로 봉쇄 플랜 쓰면 되는 거 아님?`;
    case "counter-found":
      return `${themeName} 카운터 찾았다 ㅋㅋㅋ`;
    case "counter-adopted":
      return `요즘 입상 덱에 ${themeName} 카운터가 진짜 들어가기 시작했네`;
    case "counter-tax":
      return `${themeName} 하나 때문에 다들 카운터 넣는 시점이면 금제해야 하는 거 아님?`;
    case "optimization-rumor":
      return `${themeName} 새 전개법 찾았다는 글 봄? 아직 더 세질 수도 있겠는데`;
    case "restriction-demand":
      if (genericCard) {
        return `${genericCard.name} 어디에나 들어가는데 이 정도면 범용 금제 얘기 나올 만함`;
      }
      return `${withTopicParticle(themeName)} 승패보다 상대할 때 너무 지침. 금제 얘기 나올 만함`;
    case "theme-popularity":
      return `${themeName} 성능과 별개로 이번 달 인기 진짜 높네`;
    case "release-reaction":
      if (genericCard) {
        return `${genericCard.name} 공개 뒤로 여러 덱 리스트가 동시에 바뀌는 중이네`;
      }
      return `${themeName} 발매 반응 괜찮은데 실제 입상까지 이어질지는 모르겠다`;
    case "meta-analysis":
      return `${themeName} 점유율은 낮아도 상성 맞으면 충분히 올라올 수 있음`;
    case "support-proposed":
      return `${themeName} ${proposal && getReleaseRequestKind(proposal) === "support" && proposal.direction !== undefined ? DIRECTION_LABEL[proposal.direction] : "지원"} 제안 들어갔대`;
    case "support-released":
      return `${themeName} 지원 드디어 나왔다. 이번엔 진짜 할 만한가?`;
    case "restriction-applied":
    case "cosmetic-restriction": {
      const previous = event.previousValue;
      const next = event.value;
      const target = genericCard?.name ?? part?.name ??
        (event.type === "restriction-applied" ? "핵심 파츠" : "대상 파츠");
      if (Number.isInteger(previous) && Number.isInteger(next)) {
        const direction =
          previous! > next!
            ? "제한 강화"
            : previous! < next!
              ? next === 3
                ? "제한 해제"
                : "제한 완화"
              : "현행 유지";
        return genericCard
          ? `[운영 공지] 범용 ${target} ${direction} ${previous}→${next}장`
          : `[운영 공지] ${themeName} ${target} ${direction} ${previous}→${next}장`;
      }
      return genericCard
        ? `[운영 공지] 범용 ${target} ${next}장 적용`
        : `[운영 공지] ${themeName} ${target} ${next}장 적용`;
    }
    case "restriction-no-change":
      return `[운영 공지] 금제 변경 없음 — ${themeName} 현행 유지`;
    case "top-theme-changed":
      return `${relatedName} 내려가고 요즘은 ${withKoreanParticle(themeName, "이/가")} 제일 많이 보이네`;
    default:
      return event.body || `${themeName} 관련 소식`;
  }
}

export function createCampaignStart(seed = 0x5eed1234): GameState {
  if (THEMES.length !== 150) {
    throw new Error(`The campaign requires exactly 150 themes; received ${THEMES.length}.`);
  }
  const startingThemes = STARTING_THEME_IDS.map((themeId) => {
    const content = THEME_BY_ID[themeId];
    if (!content) throw new Error(`Missing starting theme: ${themeId}.`);
    return content;
  });
  const startingTotal = startingThemes.reduce(
    (sum, content) => sum + content.startingShare,
    0,
  );
  if (startingTotal <= 0) throw new Error("Starting theme shares must be positive.");

  const themes: GameState["themes"] = {};
  for (const content of startingThemes) {
    const share = content.startingShare / startingTotal;
    themes[content.id] = createThemeRuntime(seed, content, share);
  }
  const ids = startingThemes.map((content) => content.id);
  const initialSum = ids.reduce((sum, id) => sum + themes[id].share, 0);
  themes[ids[ids.length - 1]].share = round(
    themes[ids[ids.length - 1]].share + (1 - initialSum),
    9,
  );
  let currentTopThemeId = ids[0];
  for (const id of ids.slice(1)) {
    if (themes[id].share > themes[currentTopThemeId].share) {
      currentTopThemeId = id;
    }
  }
  themes[currentTopThemeId].topStreakDays = 1;

  const state: GameState = {
    schemaVersion: 9,
    seed: seed >>> 0,
    day: FIRST_BAN_DAY,
    phase: "ban-edit",
    activeThemeIds: ids,
    themes,
    users: {
      ...INITIAL_USERS,
    },
    finance: {
      today: 0,
      rolling30: 0,
      cumulative: 0,
      cash: INITIAL_OPERATING_CASH,
      todayOperatingCash: 0,
      todayOperatingCost: 0,
      cumulativeOperatingCosts: 0,
      cumulativeExpenses: 0,
    },
    operations: {
      nextActionId: 1,
      records: [],
      nextEventId: 1,
      nextEventDay: getInitialBusinessEventDay(seed),
      pendingEvent: null,
      eventRecords: [],
      strategy: { audience: 0, product: 0, posture: 0 },
      season: {
        currentSeasonNumber: 1,
        startedDay: FIRST_BAN_DAY,
        boundaries: [],
      },
    },
    community: [],
    supportRequests: [],
    releaseSlate: null,
    releaseHistory: [createInitialGenericReleaseBatch()],
    genericLimits: Object.fromEntries(
      INITIAL_GENERIC_CARD_IDS.map((genericCardId) => [genericCardId, 3]),
    ),
    genericReleaseStartDay: FIRST_RELEASE_DAY,
    history: [],
    recentRevenue: [],
    lastSupportProposalDay: null,
    nextSupportRequestId: 1,
    nextReleaseOptionId: 1,
    nextCommunityId: 1,
    currentTopThemeId,
    purchaseTrust: 80,
    handoverComplete: false,
  };
  refreshThemeBases(state);
  computeWinRates(state);
  updateFinance(state);
  assertState(state);
  return state;
}

/** Replays the fixed onboarding up to the player's first restriction list. */
export function createFirstBanGame(seed = 0x5eed1234): GameState {
  const state = createCampaignStart(seed);
  if (state.day !== FIRST_BAN_DAY || state.phase !== "ban-edit") {
    throw new Error("The prologue must stop at the first restriction review.");
  }
  return state;
}

/**
 * Deterministic convenience state used by engine tests and simulations.
 * The actual UI lets the player author the emergency restriction and observe
 * its first seven days before regular product reviews begin.
 */
export function createInitialGame(seed = 0x5eed1234): GameState {
  let state = createFirstBanGame(seed);
  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(state),
  });
  state = reduceGame(state, {
    type: "ADVANCE_DAYS",
    days: TUTORIAL_END_DAY - FIRST_BAN_DAY,
  });
  if (state.day !== TUTORIAL_END_DAY || state.phase !== "running") {
    throw new Error(
      `The prologue must hand control over on DAY ${TUTORIAL_END_DAY}.`,
    );
  }
  return reduceGame(state, { type: "COMPLETE_HANDOVER" });
}

export function reduceGame(state: GameState, command: GameCommand): GameState {
  const next = cloneState(state);
  switch (command.type) {
    case "ADVANCE_DAYS":
      advanceDays(next, command.days);
      break;
    case "SUBMIT_BAN":
      submitBan(next, command.changes);
      if (command.campaignSeed !== undefined) {
        assignMandateSeed(next, command.campaignSeed);
      }
      break;
    case "PROPOSE_SUPPORT":
      proposeSupport(next, command.themeId, command.direction);
      break;
    case "SET_RELEASE_REQUEST":
      setReleaseRequest(next, command.request);
      break;
    case "CANCEL_RELEASE_REQUEST":
      cancelReleaseRequest(next, command.lane);
      break;
    case "SUBMIT_RELEASE":
      submitRelease(next, command.selections);
      break;
    case "RUN_BUSINESS_ACTION":
      runBusinessAction(next, command.action);
      break;
    case "CHOOSE_BUSINESS_EVENT":
      chooseBusinessEvent(next, command.eventId, command.choice);
      break;
    case "COMPLETE_HANDOVER":
      {
        if (
          next.handoverComplete ||
          !isHandoverReady(next)
        ) {
          throw new Error(
            `The handover requires the DAY ${FIRST_BAN_DAY} emergency restriction and observation through DAY ${TUTORIAL_END_DAY}.`,
          );
        }
        next.handoverComplete = true;
      }
      break;
    default: {
      const exhaustive: never = command;
      throw new Error(`Unsupported command: ${JSON.stringify(exhaustive)}`);
    }
  }
  assertState(next);
  return next;
}
