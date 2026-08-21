import {
  INITIAL_THEME_PART_COUNT,
  MAX_THEME_SUPPORTS,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import {
  BUSINESS_ACTION_BY_TYPE,
  getProbabilisticBusinessActionOutcome,
  isProbabilisticBusinessAction,
} from "./business-actions.ts";
import {
  BUSINESS_CHALLENGE_BY_TYPE,
  isBusinessChallengeDecisionDay,
  isChallengeBusinessAction,
} from "./business-challenges.ts";
import {
  BUSINESS_EVENT_START_DAY,
  BUSINESS_EVENT_TYPES,
  BUSINESS_STRATEGY_MAX,
  BUSINESS_STRATEGY_MIN,
  BUSINESS_STRATEGY_AXES,
  EMPTY_BUSINESS_STRATEGY,
  applyBusinessStrategyDelta,
  getBusinessEventChoice,
  getBusinessEventOutcome,
  getBusinessEventType,
  getInitialBusinessEventDay,
  getNextBusinessEventDay,
} from "./business-events.ts";
import {
  BAN_INTERVAL,
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  LAST_DECISION_DAY,
  LAST_RELEASE_DAY,
  RELEASE_INTERVAL,
  TUTORIAL_END_DAY,
} from "./campaign.ts";
import {
  getDailyOperatingCost,
  OPERATING_COST_START_DAY,
} from "./finance.ts";
import {
  getExpectedTier,
  getNextReleaseDay,
  getNewThemeExpectedPower,
  getNewThemeLaunchPower,
} from "./engine.ts";
import {
  GENERIC_CARD_CATALOG,
  type GenericCardId,
} from "./generic-card-catalog.ts";
import {
  INITIAL_GENERIC_CARD_IDS,
  INITIAL_GENERIC_RELEASE_DAY,
  createInitialGenericReleaseBatch,
  isInitialGenericReleaseBatch,
} from "./initial-generic-cards.ts";
import { META_ADOPTION_SHARE_FLOOR } from "./meta-tiers.ts";
import { DAILY_TOP_CUT_SLOTS } from "./placement-meta.ts";
import { ENVIRONMENT_HEALTH_MODEL } from "./environment-health.ts";
import {
  getKeywordMatchupEdgeScore,
  PLAY_KEYWORD_IDS,
  type PlayKeyword,
} from "./play-keywords.ts";
import type {
  BusinessEventChoice,
  BusinessEventOutcome,
  BusinessEventType,
  BusinessActionOutcome,
  BusinessActionType,
  BusinessChallengeMetric,
  BusinessRiskFactor,
  CommunityCategory,
  CommunityEventType,
  ExpectedTier,
  EnvironmentHealthModel,
  GameState,
  PartRole,
  PowerAdjustment,
  ReleaseOption,
  ReleaseRequestKind,
  SupportDirection,
  SupportRequest,
  ThemeId,
} from "./types.ts";
import { migrateLegacyFutureIdentifier } from "./future-theme-id-migration.ts";

export const MAX_SAVE_BYTES = 4 * 1024 * 1024;

const MAX_DAY = CAMPAIGN_END_DAY;
const MAX_ACTIVE_THEMES = THEMES.length;
const MIN_ACTIVE_THEMES = 5;
const MAX_SAFE_COUNTER = 1_000_000_000;
const MAX_FINANCE_VALUE = 1_000_000_000_000;
const ENVIRONMENT_HEALTH_MODELS = new Set<EnvironmentHealthModel>([
  ENVIRONMENT_HEALTH_MODEL,
]);
const INITIAL_OPERATING_CASH = 2.5;
const OPERATING_CASH_MARGIN = 0.32;
const STARTING_THEME_IDS = new Set<ThemeId>([
  "cycle",
  "white-night",
  "machine-revolution",
  "ironblood",
  "abyss",
]);

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "seed",
  "day",
  "phase",
  "activeThemeIds",
  "themes",
  "users",
  "finance",
  "operations",
  "community",
  "supportRequests",
  "releaseSlate",
  "releaseHistory",
  "genericLimits",
  "genericReleaseStartDay",
  "history",
  "recentRevenue",
  "lastSupportProposalDay",
  "nextSupportRequestId",
  "nextReleaseOptionId",
  "nextCommunityId",
  "currentTopThemeId",
  "purchaseTrust",
  "handoverComplete",
] as const;

const LEGACY_TOP_LEVEL_KEYS = TOP_LEVEL_KEYS.filter(
  (key) => key !== "genericLimits" && key !== "genericReleaseStartDay",
);

const LEGACY_V3_TOP_LEVEL_KEYS = LEGACY_TOP_LEVEL_KEYS.filter(
  (key) => key !== "operations",
);

const LEGACY_V4_FINANCE_KEYS = [
  "today",
  "rolling30",
  "cumulative",
  "cash",
  "todayOperatingCash",
  "cumulativeExpenses",
] as const;

const THEME_RUNTIME_KEYS = [
  "share",
  "previousWeekShare",
  "winRate",
  "power",
  "unpleasantness",
  "fatigue",
  "legalLimits",
  "partStats",
  "lastSupportDay",
  "freshness",
  "topStreakDays",
  "counterProgress",
  "counterThreshold",
  "counterAdoption",
  "counterDiscoveredDay",
  "counterBuild",
  "supportPower",
  "supportUnpleasantness",
  "supportCount",
  "releasedPartIds",
  "lastSupportAdjustment",
  "supportReplacementPressure",
] as const;

const COMMUNITY_REQUIRED_KEYS = [
  "id",
  "day",
  "category",
  "type",
  "themeId",
  "body",
] as const;

const COMMUNITY_OPTIONAL_KEYS = [
  "partId",
  "genericCardId",
  "relatedThemeId",
  "proposalId",
  "value",
  "previousValue",
] as const;

const COMMUNITY_CATEGORIES = new Set<CommunityCategory>([
  "meta",
  "counter",
  "release",
  "restriction",
  "finance",
]);

const COMMUNITY_TYPES = new Set<CommunityEventType>([
  "counter-rumor",
  "counter-found",
  "counter-adopted",
  "counter-tax",
  "optimization-rumor",
  "restriction-demand",
  "theme-popularity",
  "release-reaction",
  "meta-analysis",
  "support-proposed",
  "support-released",
  "restriction-applied",
  "cosmetic-restriction",
  "restriction-no-change",
  "top-theme-changed",
  "business-reaction",
  "business-scandal",
]);

const BUSINESS_ACTION_TYPES = new Set<BusinessActionType>([
  "tv-cm",
  "animation-promotion",
  "championship",
  "store-tour",
  "beginner-camp",
  "local-league",
  "reprint-campaign",
  "collector-fair",
  "pack-odds",
  "season-overhaul",
  "global-launch",
  "first-print-expansion",
]);

const BUSINESS_RISK_FACTORS = new Set<BusinessRiskFactor>([
  "environment",
  "trust",
  "policy",
  "release",
  "timing",
  "execution",
]);

const BUSINESS_POLICY_QUALITIES = new Set([
  "balanced",
  "incomplete",
  "narrow",
  "none",
] as const);

const BUSINESS_RISK_TIMINGS = new Set([
  "early",
  "middle",
  "late",
] as const);

const BUSINESS_ACTION_OUTCOMES = new Set<BusinessActionOutcome>([
  "active",
  "pending",
  "completed",
  "success",
  "backlash",
  "clean",
  "detected",
]);

const BUSINESS_CHALLENGE_METRICS = new Set<BusinessChallengeMetric>([
  "environment-health",
  "purchase-trust",
  "release-quality",
]);

const BUSINESS_EVENT_TYPE_SET = new Set<BusinessEventType>(
  BUSINESS_EVENT_TYPES,
);

const BUSINESS_EVENT_CHOICES = new Set<BusinessEventChoice>(["a", "b"]);

const BUSINESS_EVENT_OUTCOMES = new Set<BusinessEventOutcome>([
  "pending",
  "success",
  "backlash",
]);

const LEGACY_OPERATIONS_KEYS = ["nextActionId", "records"] as const;

const OPERATIONS_KEYS = [
  "nextActionId",
  "records",
  "nextEventId",
  "nextEventDay",
  "pendingEvent",
  "eventRecords",
  "strategy",
] as const;

const SUPPORT_DIRECTIONS = new Set<SupportDirection>([
  "consistency",
  "counterplay",
  "finisher",
  "recovery",
]);

const SUPPORT_STATUSES = new Set<SupportRequest["status"]>([
  "queued",
  "offered",
  "released",
  "skipped",
  "cancelled",
  "replaced",
]);

const RELEASE_REQUEST_KINDS = new Set<ReleaseRequestKind>([
  "support",
  "indirect-support",
  "environment-target",
  "reprint",
]);

const PLAY_KEYWORDS = new Set<PlayKeyword>(PLAY_KEYWORD_IDS);

const RELEASE_KINDS = new Set<ReleaseOption["kind"]>([
  "new-theme",
  "support",
  "generic",
  "reprint",
]);

const EXPECTED_TIERS = new Set<ExpectedTier>([
  "Tier 0",
  "Tier 1",
  "Tier 2",
  "Tier 3",
]);

const PART_ROLES = new Set<PartRole>([
  "starter1",
  "starter2",
  "bridge",
  "finisher",
  "recursion",
]);

const PHASES = new Set<GameState["phase"]>([
  "running",
  "release-edit",
  "ban-edit",
  "ended",
]);

const THEME_IDS = new Set<ThemeId>(THEMES.map((theme) => theme.id));
const GENERIC_CARD_IDS = new Set<GenericCardId>(
  GENERIC_CARD_CATALOG.map((card) => card.id),
);
const PART_THEME = new Map(
  THEMES.flatMap((theme) =>
    theme.parts.map((part) => [part.id, theme.id] as const),
  ),
);

type UnknownRecord = Record<string, unknown>;

type ValidatedSupportRequest = SupportRequest;

export class SaveSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveSchemaError";
  }
}

function fail(path: string, message: string): never {
  throw new SaveSchemaError(`${path}: ${message}`);
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function expectRecord(
  value: unknown,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }

  const record = value as UnknownRecord;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not an allowed field");
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      fail(`${path}.${key}`, "is required");
    }
  }
  return record;
}

function expectArray(
  value: unknown,
  path: string,
  maximumLength: number,
  minimumLength = 0,
): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length < minimumLength || value.length > maximumLength) {
    fail(
      path,
      `must contain between ${minimumLength} and ${maximumLength} entries`,
    );
  }
  return value;
}

function expectNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  if (integer && !Number.isInteger(value)) fail(path, "must be an integer");
  if (value < minimum || value > maximum) {
    fail(path, `must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function expectString(
  value: unknown,
  path: string,
  maximumLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (!allowEmpty && value.length === 0) fail(path, "must not be empty");
  if (value.length > maximumLength) {
    fail(path, `must contain at most ${maximumLength} characters`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function expectEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<T>,
): T {
  const candidate = expectString(value, path, 64) as T;
  if (!allowed.has(candidate)) fail(path, "has an unsupported value");
  return candidate;
}

function expectThemeId(value: unknown, path: string): ThemeId {
  const themeId = expectString(value, path, 100);
  if (!THEME_IDS.has(themeId)) fail(path, "references an unknown theme");
  return themeId;
}

function expectGenericCardId(value: unknown, path: string): GenericCardId {
  const genericCardId = expectString(value, path, 100) as GenericCardId;
  if (!GENERIC_CARD_IDS.has(genericCardId)) {
    fail(path, "references an unknown generic card");
  }
  return genericCardId;
}

function expectNullableDay(
  value: unknown,
  path: string,
  currentDay: number,
): number | null {
  if (value === null) return null;
  const day = expectNumber(value, path, 0, MAX_DAY, true);
  if (day > currentDay) fail(path, "must not be later than the current day");
  return day;
}

function createMigratedBusinessEventState(
  seed: number,
  currentDay: number,
  campaignEnded: boolean,
): UnknownRecord {
  const initialEventDay = getInitialBusinessEventDay(seed);
  return {
    nextEventId: 1,
    nextEventDay: campaignEnded
      ? null
      : currentDay < initialEventDay
        ? initialEventDay
        : getNextBusinessEventDay(seed, currentDay, 1),
    pendingEvent: null,
    eventRecords: [],
    strategy: { ...EMPTY_BUSINESS_STRATEGY },
  };
}

function migrateLegacyOperations(
  value: unknown,
  seed: number,
  currentDay: number,
  campaignEnded: boolean,
): UnknownRecord {
  const legacy = expectRecord(
    value,
    "$.operations",
    LEGACY_OPERATIONS_KEYS,
  );
  return {
    ...legacy,
    ...createMigratedBusinessEventState(seed, currentDay, campaignEnded),
  };
}

function migratedGenericReleaseStartDay(currentDay: number): number | null {
  const nextReleaseDay = getNextReleaseDay(currentDay);
  return nextReleaseDay <= LAST_RELEASE_DAY ? nextReleaseDay : null;
}

function withMigratedGenericState(
  legacy: UnknownRecord,
  currentDay: number,
): UnknownRecord {
  return {
    ...legacy,
    schemaVersion: 8,
    genericLimits: {},
    genericReleaseStartDay: migratedGenericReleaseStartDay(currentDay),
  };
}

function migrateLegacyV3(value: UnknownRecord): UnknownRecord {
  const legacy = expectRecord(value, "$", LEGACY_V3_TOP_LEVEL_KEYS);
  const seed = expectNumber(legacy.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(legacy.day, "$.day", 1, 419, true);
  expectString(legacy.phase, "$.phase", 20);
  const phase = reopenFormerCampaignEnd(legacy);
  const finance = expectRecord(legacy.finance, "$.finance", [
    "today",
    "rolling30",
    "cumulative",
  ]);
  const today = expectNumber(
    finance.today,
    "$.finance.today",
    0,
    MAX_FINANCE_VALUE,
  );
  const cumulative = expectNumber(
    finance.cumulative,
    "$.finance.cumulative",
    0,
    MAX_FINANCE_VALUE,
  );

  return withMigratedGenericState({
    ...legacy,
    phase,
    finance: {
      ...finance,
      cash: round(INITIAL_OPERATING_CASH + cumulative * OPERATING_CASH_MARGIN),
      todayOperatingCash: round(today * OPERATING_CASH_MARGIN),
      todayOperatingCost: 0,
      cumulativeOperatingCosts: 0,
      cumulativeExpenses: 0,
    },
    operations: {
      nextActionId: 1,
      records: [],
      ...createMigratedBusinessEventState(seed, day, phase === "ended"),
    },
  }, day);
}

function reopenFormerCampaignEnd(legacy: UnknownRecord): unknown {
  if (legacy.day !== 419 || legacy.phase !== "ended") return legacy.phase;
  const users = expectRecord(legacy.users, "$.users", [
    "tier",
    "casual",
    "collector",
  ]);
  const userTotal =
    expectNumber(users.tier, "$.users.tier", 0, MAX_SAFE_COUNTER) +
    expectNumber(users.casual, "$.users.casual", 0, MAX_SAFE_COUNTER) +
    expectNumber(users.collector, "$.users.collector", 0, MAX_SAFE_COUNTER);
  return userTotal > 0 ? "running" : legacy.phase;
}

function migrateLegacyV4(value: UnknownRecord): UnknownRecord {
  const legacy = expectRecord(value, "$", LEGACY_TOP_LEVEL_KEYS);
  const seed = expectNumber(legacy.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(legacy.day, "$.day", 1, 419, true);
  expectString(legacy.phase, "$.phase", 20);
  const phase = reopenFormerCampaignEnd(legacy);
  const finance = expectRecord(
    legacy.finance,
    "$.finance",
    LEGACY_V4_FINANCE_KEYS,
  );
  return withMigratedGenericState({
    ...legacy,
    phase,
    finance: {
      ...finance,
      todayOperatingCost: 0,
      cumulativeOperatingCosts: 0,
    },
    operations: migrateLegacyOperations(
      legacy.operations,
      seed,
      day,
      phase === "ended",
    ),
  }, day);
}

function migrateLegacyV5(value: UnknownRecord): UnknownRecord {
  const legacy = expectRecord(value, "$", LEGACY_TOP_LEVEL_KEYS);
  const seed = expectNumber(legacy.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(legacy.day, "$.day", 1, 419, true);
  expectString(legacy.phase, "$.phase", 20);
  const phase = reopenFormerCampaignEnd(legacy);

  return withMigratedGenericState({
    ...legacy,
    phase,
    operations: migrateLegacyOperations(
      legacy.operations,
      seed,
      day,
      phase === "ended",
    ),
  }, day);
}

function migrateLegacyV6(value: UnknownRecord): UnknownRecord {
  const legacy = expectRecord(value, "$", LEGACY_TOP_LEVEL_KEYS);
  const seed = expectNumber(legacy.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(legacy.day, "$.day", 1, MAX_DAY, true);
  const phase = expectString(legacy.phase, "$.phase", 20);

  return withMigratedGenericState({
    ...legacy,
    operations: migrateLegacyOperations(
      legacy.operations,
      seed,
      day,
      phase === "ended",
    ),
  }, day);
}

function migrateLegacyV7(value: UnknownRecord): UnknownRecord {
  const legacy = expectRecord(value, "$", LEGACY_TOP_LEVEL_KEYS);
  const day = expectNumber(legacy.day, "$.day", 1, MAX_DAY, true);
  return withMigratedGenericState(legacy, day);
}

function normalizeSaveVersion(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("$", "must be an object");
  }
  const record = value as UnknownRecord;
  if (record.schemaVersion === 8) return record;
  if (record.schemaVersion === 7) return migrateLegacyV7(record);
  if (record.schemaVersion === 6) return migrateLegacyV6(record);
  if (record.schemaVersion === 5) return migrateLegacyV5(record);
  if (record.schemaVersion === 4) return migrateLegacyV4(record);
  if (record.schemaVersion === 3) return migrateLegacyV3(record);
  fail(
    "$.schemaVersion",
    "must equal 8 or be a migratable schema v3/v4/v5/v6/v7 save",
  );
}

/**
 * v0.1.6 replaced the construction-matrix IDs of all 140 future themes with
 * authored identity slugs without changing the schema shape. Transform exact
 * theme/card identifiers in both values and object keys before validation so
 * schema v3-v7 campaigns continue without dropping runtime or history data.
 */
function migrateLegacyFutureIdentifiersDeep(
  value: unknown,
  path = "$",
): unknown {
  if (typeof value === "string") {
    return migrateLegacyFutureIdentifier(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      migrateLegacyFutureIdentifiersDeep(item, `${path}[${index}]`),
    );
  }
  if (typeof value !== "object" || value === null) return value;

  const migratedEntries: Array<[string, unknown]> = [];
  const migratedKeys = new Set<string>();
  for (const [key, item] of Object.entries(value as UnknownRecord)) {
    const migratedKey = migrateLegacyFutureIdentifier(key);
    if (migratedKeys.has(migratedKey)) {
      fail(
        path,
        `contains colliding legacy/current identifier keys for ${migratedKey}`,
      );
    }
    migratedKeys.add(migratedKey);
    migratedEntries.push([
      migratedKey,
      migrateLegacyFutureIdentifiersDeep(item, `${path}.${migratedKey}`),
    ]);
  }
  return Object.fromEntries(migratedEntries);
}

function mutableRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

/**
 * Safely upgrades saves that predate the DAY 1 tutorial pool. If any canonical
 * card is already present in history or limits, the save is left untouched so
 * a later real release is never rewritten or duplicated.
 */
function normalizeInitialGenericCards(state: UnknownRecord): UnknownRecord {
  if (!Array.isArray(state.releaseHistory)) return state;
  if (
    state.releaseHistory.some((batchValue) => {
      const batch = mutableRecord(batchValue);
      return batch?.baseline === true;
    })
  ) {
    return state;
  }
  const genericLimits = mutableRecord(state.genericLimits);
  if (!genericLimits) return state;
  const hasCanonicalLimit = INITIAL_GENERIC_CARD_IDS.some((cardId) =>
    Object.prototype.hasOwnProperty.call(genericLimits, cardId)
  );
  const hasCanonicalRelease = state.releaseHistory.some((batchValue) => {
    const batch = mutableRecord(batchValue);
    return Array.isArray(batch?.products) && batch.products.some((productValue) => {
      const product = mutableRecord(productValue);
      return (
        product?.kind === "generic" &&
        typeof product.genericCardId === "string" &&
        INITIAL_GENERIC_CARD_IDS.includes(
          product.genericCardId as (typeof INITIAL_GENERIC_CARD_IDS)[number],
        )
      );
    });
  });
  if (hasCanonicalLimit || hasCanonicalRelease) return state;

  return {
    ...state,
    releaseHistory: [
      createInitialGenericReleaseBatch(),
      ...state.releaseHistory,
    ],
    genericLimits: {
      ...genericLimits,
      ...Object.fromEntries(
        INITIAL_GENERIC_CARD_IDS.map((cardId) => [cardId, 3]),
      ),
    },
  };
}

/**
 * Schema v7 predates new-theme power creep, so a save can legitimately contain
 * a release slate or same-day batch with the old forecast. Rebuild only the
 * deterministic new-theme fields before validation; malformed structure is
 * deliberately left untouched for the strict validators below to reject.
 */
function normalizePendingNewThemePredictions(state: UnknownRecord): UnknownRecord {
  const currentDay = state.day;
  if (typeof currentDay !== "number" || !Number.isInteger(currentDay)) {
    return state;
  }

  const slate = mutableRecord(state.releaseSlate);
  if (slate && slate.day === currentDay && Array.isArray(slate.options)) {
    for (const optionValue of slate.options) {
      const option = mutableRecord(optionValue);
      if (
        !option ||
        option.kind !== "new-theme" ||
        typeof option.themeId !== "string" ||
        !Object.prototype.hasOwnProperty.call(option, "expectedPower") ||
        !Object.prototype.hasOwnProperty.call(option, "expectedTier")
      ) {
        continue;
      }
      const content = THEME_BY_ID[option.themeId];
      if (!content) continue;
      const expectedPower = getNewThemeExpectedPower(content, currentDay);
      option.expectedPower = expectedPower;
      option.expectedTier = getExpectedTier(expectedPower);
    }
  }

  if (!Array.isArray(state.releaseHistory)) return state;
  for (const batchValue of state.releaseHistory) {
    const batch = mutableRecord(batchValue);
    if (
      !batch ||
      batch.day !== currentDay ||
      !Array.isArray(batch.products)
    ) {
      continue;
    }
    for (const productValue of batch.products) {
      const product = mutableRecord(productValue);
      if (
        !product ||
        product.kind !== "new-theme" ||
        typeof product.themeId !== "string" ||
        typeof product.powerAdjustment !== "number" ||
        !Number.isInteger(product.powerAdjustment) ||
        product.powerAdjustment < -3 ||
        product.powerAdjustment > 3 ||
        !Object.prototype.hasOwnProperty.call(product, "expectedTier")
      ) {
        continue;
      }
      const content = THEME_BY_ID[product.themeId];
      if (!content) continue;
      product.expectedTier = getExpectedTier(
        getNewThemeLaunchPower(
          content,
          product.powerAdjustment as PowerAdjustment,
          currentDay,
        ),
      );
    }
  }
  return state;
}

function isReleaseDay(day: number): boolean {
  return day > 0 && day <= LAST_RELEASE_DAY && day % RELEASE_INTERVAL === 0;
}

function isRestrictionDay(day: number): boolean {
  return (
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0
  );
}

function expectedTierForPower(power: number): ExpectedTier {
  if (power >= 80) return "Tier 0";
  if (power >= 71) return "Tier 1";
  if (power >= 63) return "Tier 2";
  return "Tier 3";
}

function validateActiveThemeIds(value: unknown): ThemeId[] {
  const values = expectArray(
    value,
    "$.activeThemeIds",
    MAX_ACTIVE_THEMES,
    MIN_ACTIVE_THEMES,
  );
  const activeThemeIds = values.map((themeId, index) =>
    expectThemeId(themeId, `$.activeThemeIds[${index}]`),
  );
  if (new Set(activeThemeIds).size !== activeThemeIds.length) {
    fail("$.activeThemeIds", "must contain unique theme IDs");
  }
  return activeThemeIds;
}

function validateThemeRuntime(
  value: unknown,
  themeId: ThemeId,
  currentDay: number,
) {
  const path = `$.themes.${themeId}`;
  const runtime = expectRecord(value, path, THEME_RUNTIME_KEYS);

  expectNumber(runtime.share, `${path}.share`, META_ADOPTION_SHARE_FLOOR, 1);
  expectNumber(
    runtime.previousWeekShare,
    `${path}.previousWeekShare`,
    META_ADOPTION_SHARE_FLOOR,
    1,
  );
  expectNumber(runtime.winRate, `${path}.winRate`, 0, 1);
  expectNumber(runtime.power, `${path}.power`, 0, 100);
  expectNumber(runtime.unpleasantness, `${path}.unpleasantness`, 0, 100);
  expectNumber(runtime.fatigue, `${path}.fatigue`, 0, 100);
  expectNullableDay(runtime.lastSupportDay, `${path}.lastSupportDay`, currentDay);
  expectNumber(runtime.freshness, `${path}.freshness`, 0, 100);
  expectNumber(runtime.topStreakDays, `${path}.topStreakDays`, 0, MAX_DAY, true);
  expectNumber(runtime.counterProgress, `${path}.counterProgress`, 0, 1000);
  expectNumber(runtime.counterThreshold, `${path}.counterThreshold`, 0, 1000);
  expectNumber(runtime.counterAdoption, `${path}.counterAdoption`, 0, 1);
  expectNullableDay(
    runtime.counterDiscoveredDay,
    `${path}.counterDiscoveredDay`,
    currentDay,
  );
  expectNumber(runtime.counterBuild, `${path}.counterBuild`, 0, MAX_DAY, true);
  expectNumber(runtime.supportPower, `${path}.supportPower`, -1000, 1000);
  expectNumber(
    runtime.supportUnpleasantness,
    `${path}.supportUnpleasantness`,
    -1000,
    1000,
  );

  const content = THEME_BY_ID[themeId];
  const supportCount = expectNumber(
    runtime.supportCount,
    `${path}.supportCount`,
    0,
    MAX_THEME_SUPPORTS,
    true,
  );
  const expectedPartCount =
    INITIAL_THEME_PART_COUNT + supportCount * SUPPORT_PARTS_PER_RELEASE;
  const releasedPartIds = expectArray(
    runtime.releasedPartIds,
    `${path}.releasedPartIds`,
    content.parts.length,
    INITIAL_THEME_PART_COUNT,
  ).map((partId, index) =>
    expectString(partId, `${path}.releasedPartIds[${index}]`, 160),
  );
  if (releasedPartIds.length !== expectedPartCount) {
    fail(
      `${path}.releasedPartIds`,
      `must contain ${expectedPartCount} cards after ${supportCount} support waves`,
    );
  }
  if (new Set(releasedPartIds).size !== releasedPartIds.length) {
    fail(`${path}.releasedPartIds`, "must contain unique card IDs");
  }
  const expectedPartIds = content.parts
    .slice(0, expectedPartCount)
    .map((part) => part.id);
  expectedPartIds.forEach((partId, index) => {
    if (releasedPartIds[index] !== partId) {
      fail(
        `${path}.releasedPartIds[${index}]`,
        "must follow the prepared card release order",
      );
    }
  });

  const lastSupportAdjustment = runtime.lastSupportAdjustment;
  if (supportCount === 0) {
    if (lastSupportAdjustment !== null) {
      fail(`${path}.lastSupportAdjustment`, "must be null before the first support");
    }
  } else {
    expectNumber(
      lastSupportAdjustment,
      `${path}.lastSupportAdjustment`,
      -3,
      3,
      true,
    );
  }
  const replacementPressure = expectNumber(
    runtime.supportReplacementPressure,
    `${path}.supportReplacementPressure`,
    0,
    1,
  );
  if (supportCount === 0 && replacementPressure !== 0) {
    fail(
      `${path}.supportReplacementPressure`,
      "must be zero before the first support",
    );
  }

  const partIds = expectedPartIds;
  const legalLimits = expectRecord(
    runtime.legalLimits,
    `${path}.legalLimits`,
    partIds,
  );
  const partStats = expectRecord(runtime.partStats, `${path}.partStats`, partIds);

  for (const part of content.parts.slice(0, expectedPartCount)) {
    expectEnum(part.role, `${path}.partRole.${part.id}`, PART_ROLES);
    expectNumber(
      legalLimits[part.id],
      `${path}.legalLimits.${part.id}`,
      0,
      3,
      true,
    );
    const statsPath = `${path}.partStats.${part.id}`;
    const stats = expectRecord(partStats[part.id], statsPath, [
      "usageRate",
      "averageCopies",
    ]);
    expectNumber(stats.usageRate, `${statsPath}.usageRate`, 0, 1);
    expectNumber(stats.averageCopies, `${statsPath}.averageCopies`, 0, 3);
  }
}

function validateBusinessEvents(
  operations: UnknownRecord,
  currentDay: number,
  currentPhase: GameState["phase"],
  historyLastDay: number,
  seed: number,
): number {
  const eventRecords = expectArray(
    operations.eventRecords,
    "$.operations.eventRecords",
    MAX_DAY,
  );
  let expectedStrategy = { ...EMPTY_BUSINESS_STRATEGY };
  let previousAppearedDay = -1;
  let expectedAppearedDay: number | null = null;
  let eventExpenses = 0;

  eventRecords.forEach((recordValue, index) => {
    const path = `$.operations.eventRecords[${index}]`;
    const record = expectRecord(
      recordValue,
      path,
      [
        "id",
        "type",
        "appearedDay",
        "choice",
        "cost",
        "risk",
        "resolutionDay",
        "outcome",
      ],
      ["resolvedDay"],
    );
    const eventNumber = index + 1;
    const id = expectString(record.id, `${path}.id`, 128);
    const expectedId = `business-event-${eventNumber}`;
    if (id !== expectedId) {
      fail(`${path}.id`, `must equal ${expectedId}`);
    }

    const type = expectEnum(
      record.type,
      `${path}.type`,
      BUSINESS_EVENT_TYPE_SET,
    );
    if (type !== getBusinessEventType(seed, eventNumber)) {
      fail(`${path}.type`, "does not match the deterministic event sequence");
    }
    const appearedDay = expectNumber(
      record.appearedDay,
      `${path}.appearedDay`,
      BUSINESS_EVENT_START_DAY,
      Math.min(currentDay, LAST_DECISION_DAY - 1),
      true,
    );
    if (appearedDay <= previousAppearedDay) {
      fail(`${path}.appearedDay`, "must be strictly increasing");
    }
    if (isReleaseDay(appearedDay) || isRestrictionDay(appearedDay)) {
      fail(`${path}.appearedDay`, "cannot be a release or restriction day");
    }
    if (expectedAppearedDay !== null && appearedDay !== expectedAppearedDay) {
      fail(
        `${path}.appearedDay`,
        "does not match the deterministic event schedule",
      );
    }
    previousAppearedDay = appearedDay;

    const choice = expectEnum(
      record.choice,
      `${path}.choice`,
      BUSINESS_EVENT_CHOICES,
    );
    const choiceDefinition = getBusinessEventChoice(type, choice);
    const cost = expectNumber(
      record.cost,
      `${path}.cost`,
      0,
      MAX_FINANCE_VALUE,
    );
    if (Math.abs(cost - choiceDefinition.cost) > 1e-9) {
      fail(`${path}.cost`, "must equal the configured event-choice cost");
    }
    eventExpenses += cost;

    const risk = expectNumber(record.risk, `${path}.risk`, 0, 1);
    if (Math.abs(risk - choiceDefinition.risk) > 1e-9) {
      fail(`${path}.risk`, "must equal the configured event-choice risk");
    }
    const resolutionDay = expectNumber(
      record.resolutionDay,
      `${path}.resolutionDay`,
      appearedDay,
      MAX_DAY,
      true,
    );
    if (resolutionDay !== appearedDay + choiceDefinition.resolutionDelay) {
      fail(
        `${path}.resolutionDay`,
        "must match the configured event-choice resolution delay",
      );
    }
    const outcome = expectEnum(
      record.outcome,
      `${path}.outcome`,
      BUSINESS_EVENT_OUTCOMES,
    );
    const resolvedDay = record.resolvedDay === undefined
      ? undefined
      : expectNumber(
          record.resolvedDay,
          `${path}.resolvedDay`,
          appearedDay,
          currentDay,
          true,
        );
    if (outcome === "pending") {
      if (resolvedDay !== undefined) {
        fail(`${path}.resolvedDay`, "is not valid while the event is pending");
      }
      if (currentDay >= resolutionDay) {
        fail(`${path}.outcome`, "cannot remain pending on or after resolutionDay");
      }
    } else {
      if (resolvedDay !== resolutionDay) {
        fail(`${path}.resolvedDay`, "must equal resolutionDay");
      }
      if (outcome !== getBusinessEventOutcome(seed, id, risk)) {
        fail(`${path}.outcome`, "does not match the deterministic event outcome");
      }
    }

    expectedStrategy = applyBusinessStrategyDelta(
      expectedStrategy,
      choiceDefinition.strategyDelta,
    );
    expectedAppearedDay = getNextBusinessEventDay(
      seed,
      appearedDay,
      eventNumber + 1,
    );
  });

  const pending = operations.pendingEvent === null
    ? null
    : expectRecord(operations.pendingEvent, "$.operations.pendingEvent", [
        "id",
        "type",
        "appearedDay",
      ]);
  if (pending) {
    const eventNumber = eventRecords.length + 1;
    const expectedId = `business-event-${eventNumber}`;
    const id = expectString(pending.id, "$.operations.pendingEvent.id", 128);
    if (id !== expectedId) {
      fail("$.operations.pendingEvent.id", `must equal ${expectedId}`);
    }
    const type = expectEnum(
      pending.type,
      "$.operations.pendingEvent.type",
      BUSINESS_EVENT_TYPE_SET,
    );
    if (type !== getBusinessEventType(seed, eventNumber)) {
      fail(
        "$.operations.pendingEvent.type",
        "does not match the deterministic event sequence",
      );
    }
    const appearedDay = expectNumber(
      pending.appearedDay,
      "$.operations.pendingEvent.appearedDay",
      BUSINESS_EVENT_START_DAY,
      Math.min(currentDay, LAST_DECISION_DAY - 1),
      true,
    );
    if (appearedDay !== currentDay) {
      fail("$.operations.pendingEvent.appearedDay", "must equal the current day");
    }
    if (appearedDay <= previousAppearedDay) {
      fail(
        "$.operations.pendingEvent.appearedDay",
        "must be later than every retained event record",
      );
    }
    if (expectedAppearedDay !== null && appearedDay !== expectedAppearedDay) {
      fail(
        "$.operations.pendingEvent.appearedDay",
        "does not match the deterministic event schedule",
      );
    }
    if (isReleaseDay(appearedDay) || isRestrictionDay(appearedDay)) {
      fail(
        "$.operations.pendingEvent.appearedDay",
        "cannot be a release or restriction day",
      );
    }
    if (currentPhase !== "running") {
      fail("$.operations.pendingEvent", "is only valid during normal operations");
    }
    if (historyLastDay !== currentDay) {
      fail(
        "$.operations.pendingEvent",
        "requires the current ordinary day to be fully settled",
      );
    }
  }

  const nextEventId = expectNumber(
    operations.nextEventId,
    "$.operations.nextEventId",
    1,
    MAX_SAFE_COUNTER,
    true,
  );
  const expectedNextEventId = eventRecords.length + 1;
  if (nextEventId !== expectedNextEventId) {
    fail(
      "$.operations.nextEventId",
      `must equal ${expectedNextEventId} for the retained event sequence`,
    );
  }

  const nextEventDay = operations.nextEventDay === null
    ? null
    : expectNumber(
        operations.nextEventDay,
        "$.operations.nextEventDay",
        BUSINESS_EVENT_START_DAY,
        LAST_DECISION_DAY - 1,
        true,
      );
  if (pending) {
    if (nextEventDay !== null) {
      fail("$.operations.nextEventDay", "must be null while an offer is pending");
    }
  } else if (currentPhase === "ended") {
    if (nextEventDay !== null) {
      fail("$.operations.nextEventDay", "must be null after the campaign ends");
    }
  } else {
    if (nextEventDay !== null) {
      if (nextEventDay <= currentDay) {
        fail("$.operations.nextEventDay", "must be later than the current day");
      }
      if (isReleaseDay(nextEventDay) || isRestrictionDay(nextEventDay)) {
        fail(
          "$.operations.nextEventDay",
          "cannot be a release or restriction day",
        );
      }
    }

    if (eventRecords.length > 0) {
      const expectedNextEventDay = getNextBusinessEventDay(
        seed,
        previousAppearedDay,
        nextEventId,
      );
      if (nextEventDay !== expectedNextEventDay) {
        fail(
          "$.operations.nextEventDay",
          "does not match the deterministic event schedule",
        );
      }
    } else {
      if (
        nextEventDay === null &&
        getNextBusinessEventDay(seed, currentDay, nextEventId) !== null
      ) {
        fail(
          "$.operations.nextEventDay",
          "cannot be null while another event fits in the campaign",
        );
      }
    }
  }

  const strategy = expectRecord(
    operations.strategy,
    "$.operations.strategy",
    BUSINESS_STRATEGY_AXES,
  );
  for (const axis of BUSINESS_STRATEGY_AXES) {
    const value = expectNumber(
      strategy[axis],
      `$.operations.strategy.${axis}`,
      BUSINESS_STRATEGY_MIN,
      BUSINESS_STRATEGY_MAX,
    );
    if (Math.abs(value - expectedStrategy[axis]) > 1e-9) {
      fail(
        `$.operations.strategy.${axis}`,
        "must match the retained event-choice history",
      );
    }
  }

  return round(eventExpenses);
}

function validateOperations(
  value: unknown,
  currentDay: number,
  currentPhase: GameState["phase"],
  historyLastDay: number,
  seed: number,
): number {
  const operations = expectRecord(value, "$.operations", OPERATIONS_KEYS);
  const records = expectArray(
    operations.records,
    "$.operations.records",
    MAX_DAY,
  );
  const nextActionId = expectNumber(
    operations.nextActionId,
    "$.operations.nextActionId",
    1,
    MAX_SAFE_COUNTER,
    true,
  );
  if (nextActionId !== records.length + 1) {
    fail(
      "$.operations.nextActionId",
      "must be one greater than the number of retained action records",
    );
  }

  let previousStartedDay = -1;
  let totalExpenses = 0;
  let strategicProjectCount = 0;
  const previousDayByType = new Map<BusinessActionType, number>();

  records.forEach((recordValue, index) => {
    const path = `$.operations.records[${index}]`;
    const record = expectRecord(
      recordValue,
      path,
      ["id", "type", "startedDay", "endsDay", "cost", "outcome"],
      [
        "risk",
        "environmentHealth",
        "riskContext",
        "challenge",
        "cashReturn",
        "appliedDay",
        "resolvedDay",
      ],
    );
    const id = expectString(record.id, `${path}.id`, 128);
    const expectedId = `business-action-${index + 1}`;
    if (id !== expectedId) {
      fail(`${path}.id`, `must equal ${expectedId}`);
    }

    const type = expectEnum(record.type, `${path}.type`, BUSINESS_ACTION_TYPES);
    const definition = BUSINESS_ACTION_BY_TYPE[type];
    const startedDay = expectNumber(
      record.startedDay,
      `${path}.startedDay`,
      1,
      currentDay,
      true,
    );
    if (startedDay >= LAST_DECISION_DAY) {
      fail(`${path}.startedDay`, `must be before DAY ${LAST_DECISION_DAY}`);
    }
    if (startedDay <= previousStartedDay) {
      fail(`${path}.startedDay`, "must be strictly increasing and unique by day");
    }
    previousStartedDay = startedDay;

    const previousTypeDay = previousDayByType.get(type);
    if (
      previousTypeDay !== undefined &&
      startedDay - previousTypeDay < definition.cooldown
    ) {
      fail(
        `${path}.startedDay`,
        `must respect the ${definition.cooldown}-day ${type} cooldown`,
      );
    }
    previousDayByType.set(type, startedDay);

    const expectedAppliedDay =
      (Math.floor(startedDay / RELEASE_INTERVAL) + 1) * RELEASE_INTERVAL;
    if (type === "pack-odds" && expectedAppliedDay > LAST_RELEASE_DAY) {
      fail(`${path}.startedDay`, "must leave a regular release inside the campaign");
    }
    const expectedEndsDay =
      type === "pack-odds"
        ? expectedAppliedDay + definition.duration - 1
        : startedDay + definition.duration;
    const endsDay = expectNumber(
      record.endsDay,
      `${path}.endsDay`,
      1,
      CAMPAIGN_END_DAY,
      true,
    );
    if (endsDay !== expectedEndsDay) {
      fail(
        `${path}.endsDay`,
        type === "pack-odds"
          ? "must cover the affected release's thirty-day sales window"
          : `must equal startedDay + ${definition.duration}`,
      );
    }

    const cost = expectNumber(
      record.cost,
      `${path}.cost`,
      0,
      MAX_FINANCE_VALUE,
    );
    if (Math.abs(cost - definition.cost) > 1e-9) {
      fail(`${path}.cost`, `must equal the configured ${type} cost`);
    }
    totalExpenses += cost;

    const outcome = expectEnum(
      record.outcome,
      `${path}.outcome`,
      BUSINESS_ACTION_OUTCOMES,
    );
    const risk =
      record.risk === undefined
        ? undefined
        : expectNumber(record.risk, `${path}.risk`, 0, 1);
    if (
      isChallengeBusinessAction(type) &&
      risk === undefined &&
      !isBusinessChallengeDecisionDay(startedDay)
    ) {
      fail(
        `${path}.startedDay`,
        "new challenge actions must start on a release or restriction decision day",
      );
    }
    const environmentHealth =
      record.environmentHealth === undefined
        ? undefined
        : expectNumber(
            record.environmentHealth,
            `${path}.environmentHealth`,
            0,
            100,
          );
    const riskContext = record.riskContext === undefined
      ? undefined
      : expectRecord(record.riskContext, `${path}.riskContext`, [
          "environmentHealth",
          "purchaseTrust",
          "releaseQuality",
          "policyQuality",
          "timing",
          "primaryRisk",
          "primaryStrength",
        ]);
    if (riskContext) {
      expectNumber(
        riskContext.environmentHealth,
        `${path}.riskContext.environmentHealth`,
        0,
        100,
      );
      expectNumber(
        riskContext.purchaseTrust,
        `${path}.riskContext.purchaseTrust`,
        0,
        100,
      );
      expectNumber(
        riskContext.releaseQuality,
        `${path}.riskContext.releaseQuality`,
        0,
        100,
      );
      expectEnum(
        riskContext.policyQuality,
        `${path}.riskContext.policyQuality`,
        BUSINESS_POLICY_QUALITIES,
      );
      expectEnum(
        riskContext.timing,
        `${path}.riskContext.timing`,
        BUSINESS_RISK_TIMINGS,
      );
      expectEnum(
        riskContext.primaryRisk,
        `${path}.riskContext.primaryRisk`,
        BUSINESS_RISK_FACTORS,
      );
      expectEnum(
        riskContext.primaryStrength,
        `${path}.riskContext.primaryStrength`,
        BUSINESS_RISK_FACTORS,
      );
    }
    const challenge = record.challenge === undefined
      ? undefined
      : expectRecord(record.challenge, `${path}.challenge`, [
          "metric",
          "threshold",
          "requiredQualifyingDays",
          "qualifyingDays",
          "observedDays",
          "deadlineDay",
          "lastEvaluatedDay",
          "lastValue",
        ]);
    if (challenge) {
      if (!isChallengeBusinessAction(type)) {
        fail(`${path}.challenge`, "is only valid for deterministic challenge actions");
      }
      const configured = BUSINESS_CHALLENGE_BY_TYPE[
        type as keyof typeof BUSINESS_CHALLENGE_BY_TYPE
      ];
      const metric = expectEnum(
        challenge.metric,
        `${path}.challenge.metric`,
        BUSINESS_CHALLENGE_METRICS,
      );
      if (metric !== configured.metric) {
        fail(`${path}.challenge.metric`, "must match the configured challenge metric");
      }
      const threshold = expectNumber(
        challenge.threshold,
        `${path}.challenge.threshold`,
        0,
        100,
      );
      if (Math.abs(threshold - configured.threshold) > 1e-9) {
        fail(`${path}.challenge.threshold`, "must match the configured threshold");
      }
      const requiredQualifyingDays = expectNumber(
        challenge.requiredQualifyingDays,
        `${path}.challenge.requiredQualifyingDays`,
        1,
        configured.deadlineOffset,
        true,
      );
      if (requiredQualifyingDays !== configured.requiredQualifyingDays) {
        fail(
          `${path}.challenge.requiredQualifyingDays`,
          "must match the configured challenge duration",
        );
      }
      const observedDays = expectNumber(
        challenge.observedDays,
        `${path}.challenge.observedDays`,
        0,
        configured.deadlineOffset,
        true,
      );
      const qualifyingDays = expectNumber(
        challenge.qualifyingDays,
        `${path}.challenge.qualifyingDays`,
        0,
        observedDays,
        true,
      );
      const deadlineDay = expectNumber(
        challenge.deadlineDay,
        `${path}.challenge.deadlineDay`,
        startedDay + 1,
        LAST_DECISION_DAY,
        true,
      );
      if (deadlineDay !== startedDay + configured.deadlineOffset) {
        fail(`${path}.challenge.deadlineDay`, "must match the configured deadline");
      }
      const lastEvaluatedDay = challenge.lastEvaluatedDay === null
        ? null
        : expectNumber(
            challenge.lastEvaluatedDay,
            `${path}.challenge.lastEvaluatedDay`,
            startedDay + 1,
            Math.min(currentDay, deadlineDay),
            true,
          );
      const lastValue = challenge.lastValue === null
        ? null
        : expectNumber(
            challenge.lastValue,
            `${path}.challenge.lastValue`,
            0,
            100,
          );
      if (
        (observedDays === 0) !==
          (lastEvaluatedDay === null && lastValue === null) ||
        (observedDays > 0 && (lastEvaluatedDay === null || lastValue === null))
      ) {
        fail(`${path}.challenge`, "progress and last observation must agree");
      }
      if (
        lastEvaluatedDay !== null &&
        observedDays > lastEvaluatedDay - startedDay
      ) {
        fail(`${path}.challenge.observedDays`, "cannot exceed elapsed challenge days");
      }
      if (
        outcome === "success" &&
        qualifyingDays < requiredQualifyingDays
      ) {
        fail(`${path}.challenge.qualifyingDays`, "is insufficient for success");
      }
      if (
        outcome === "backlash" &&
        qualifyingDays >= requiredQualifyingDays
      ) {
        fail(`${path}.challenge.qualifyingDays`, "must resolve as success at this progress");
      }
    }
    if (
      isChallengeBusinessAction(type) &&
      risk === undefined &&
      challenge === undefined
    ) {
      fail(`${path}.challenge`, "is required for new challenge records");
    }
    const cashReturn = record.cashReturn === undefined
      ? undefined
      : expectNumber(
          record.cashReturn,
          `${path}.cashReturn`,
          0,
          MAX_FINANCE_VALUE,
        );
    const appliedDay =
      record.appliedDay === undefined
        ? undefined
        : expectNumber(
            record.appliedDay,
            `${path}.appliedDay`,
            1,
            currentDay,
            true,
          );
    const resolvedDay =
      record.resolvedDay === undefined
        ? undefined
        : expectNumber(
            record.resolvedDay,
            `${path}.resolvedDay`,
            1,
            currentDay,
            true,
          );

    if (type === "championship") {
      if (environmentHealth === undefined) {
        fail(path, "championship records require environmentHealth");
      }
      if (
        appliedDay !== undefined ||
        riskContext !== undefined ||
        cashReturn !== undefined
      ) {
        fail(`${path}.appliedDay`, "is not valid for championship records");
      }
      if (outcome === "active") {
        if (resolvedDay !== undefined || currentDay !== startedDay) {
          fail(
            path,
            "an active championship must be unresolved on its execution day",
          );
        }
      } else if (outcome === "success" || outcome === "backlash") {
        if (resolvedDay !== startedDay + 1) {
          fail(
            `${path}.resolvedDay`,
            "must be the day after championship execution",
          );
        }
        if (challenge && challenge.lastEvaluatedDay !== resolvedDay) {
          fail(`${path}.challenge.lastEvaluatedDay`, "must equal resolvedDay");
        }
      } else {
        fail(`${path}.outcome`, "is not valid for a championship");
      }
      return;
    }

    if (
      type === "season-overhaul" ||
      type === "global-launch" ||
      type === "first-print-expansion"
    ) {
      strategicProjectCount += 1;
      if (strategicProjectCount > 1) {
        fail(path, "only one strategic project may be attempted per campaign");
      }
      if (
        definition.minimumDay !== undefined &&
        startedDay < definition.minimumDay
      ) {
        fail(`${path}.startedDay`, `must be on or after DAY ${definition.minimumDay}`);
      }
      if (startedDay + (definition.resolutionDelay ?? 0) > LAST_DECISION_DAY) {
        fail(`${path}.startedDay`, "must leave time to resolve before the final decision");
      }
      if (
        type === "first-print-expansion" &&
        startedDay % RELEASE_INTERVAL !== 0
      ) {
        fail(`${path}.startedDay`, "must be a regular release day");
      }
      if (riskContext === undefined) {
        fail(path, "strategic projects require a launch-day riskContext");
      }
      if (environmentHealth !== undefined || appliedDay !== undefined) {
        fail(path, "strategic projects cannot contain unrelated result fields");
      }
      const resolutionDay = startedDay + (definition.resolutionDelay ?? 0);
      if (outcome === "active") {
        if (resolvedDay !== undefined || cashReturn !== undefined) {
          fail(path, "an unresolved strategic project cannot contain result fields");
        }
        if (currentDay >= resolutionDay) {
          fail(`${path}.outcome`, "cannot remain active on or after its result day");
        }
      } else if (outcome === "success" || outcome === "backlash") {
        if (resolvedDay !== resolutionDay) {
          fail(`${path}.resolvedDay`, "must equal the configured strategic result day");
        }
        if (challenge && challenge.lastEvaluatedDay !== resolvedDay) {
          fail(`${path}.challenge.lastEvaluatedDay`, "must equal resolvedDay");
        }
        if (
          outcome === "success"
            ? Math.abs((cashReturn ?? -1) - (definition.successReturn ?? 0)) > 1e-9
            : cashReturn !== undefined
        ) {
          fail(`${path}.cashReturn`, "does not match the strategic-project outcome");
        }
      } else {
        fail(`${path}.outcome`, "is not valid for a strategic project");
      }
      return;
    }

    if (type === "pack-odds") {
      if (risk === undefined) {
        fail(`${path}.risk`, "is required for pack-odds records");
      }
      if (
        environmentHealth !== undefined ||
        riskContext !== undefined ||
        challenge !== undefined ||
        cashReturn !== undefined
      ) {
        fail(
          `${path}.environmentHealth`,
          "is not valid for pack-odds records",
        );
      }
      if (outcome === "pending") {
        if (appliedDay !== undefined || resolvedDay !== undefined) {
          fail(path, "pending pack odds cannot already contain result days");
        }
        if (
          currentDay > expectedAppliedDay ||
          (currentDay === expectedAppliedDay &&
            currentPhase !== "release-edit")
        ) {
          fail(`${path}.outcome`, "cannot remain pending after its release day");
        }
      } else if (outcome === "active") {
        if (appliedDay !== expectedAppliedDay || resolvedDay !== undefined) {
          fail(
            path,
            "active pack odds require only the scheduled release as appliedDay",
          );
        }
        if (currentDay !== appliedDay) {
          fail(`${path}.outcome`, "is only valid on its applied release day");
        }
      } else if (outcome === "clean" || outcome === "detected") {
        if (
          appliedDay !== expectedAppliedDay ||
          resolvedDay !== expectedAppliedDay + 1
        ) {
          fail(
            path,
            "resolved pack odds require their scheduled release and next-day result",
          );
        }
      } else {
        fail(`${path}.outcome`, "is not valid for pack-odds records");
      }
      return;
    }

    if (
      environmentHealth !== undefined ||
      riskContext !== undefined ||
      challenge !== undefined ||
      cashReturn !== undefined ||
      appliedDay !== undefined
    ) {
      fail(path, `${type} records contain unsupported result metadata`);
    }
    if (risk === undefined) {
      if (resolvedDay !== undefined) {
        fail(`${path}.resolvedDay`, "is not valid for legacy duration actions");
      }
      if (outcome === "active") {
        if (currentDay > endsDay) {
          fail(`${path}.outcome`, "cannot remain active after endsDay");
        }
      } else if (outcome === "completed") {
        if (currentDay <= endsDay) {
          fail(`${path}.outcome`, "cannot complete on or before endsDay");
        }
      } else {
        fail(`${path}.outcome`, `is not valid for legacy ${type}`);
      }
      return;
    }
    if (!isProbabilisticBusinessAction(type)) {
      fail(`${path}.risk`, "is not valid for this action type");
    }
    if (outcome === "active") {
      if (currentDay !== startedDay || resolvedDay !== undefined) {
        fail(
          `${path}.outcome`,
          "a probabilistic action can remain active only on its launch day",
        );
      }
      return;
    }
    if (outcome !== "success" && outcome !== "backlash") {
      fail(`${path}.outcome`, `is not valid for probabilistic ${type}`);
    }
    if (resolvedDay !== startedDay + 1) {
      fail(`${path}.resolvedDay`, "must be the day after execution");
    }
    if (
      outcome !==
        getProbabilisticBusinessActionOutcome({
          id,
          type,
          startedDay,
          risk,
        })
    ) {
      fail(`${path}.outcome`, "does not match the seeded launch result");
    }
  });

  const eventExpenses = validateBusinessEvents(
    operations,
    currentDay,
    currentPhase,
    historyLastDay,
    seed,
  );
  return round(totalExpenses + eventExpenses);
}

function validateSupportRequests(
  value: unknown,
  currentDay: number,
  activeThemeIds: ReadonlySet<ThemeId>,
): Map<string, ValidatedSupportRequest> {
  const requests = expectArray(value, "$.supportRequests", 64);
  const byId = new Map<string, ValidatedSupportRequest>();
  let previousProposedDay: number | null = null;

  requests.forEach((requestValue, index) => {
    const path = `$.supportRequests[${index}]`;
    const request = expectRecord(requestValue, path, [
      "id",
      "proposedDay",
      "eligibleReleaseDay",
      "status",
      "releasedDay",
    ], ["kind", "themeId", "direction", "cardId"]);
    const id = expectString(request.id, `${path}.id`, 128);
    if (byId.has(id)) fail(`${path}.id`, "must be unique");
    const kind = request.kind === undefined
      ? "support"
      : expectEnum(request.kind, `${path}.kind`, RELEASE_REQUEST_KINDS);
    const themeId = request.themeId === undefined
      ? undefined
      : expectThemeId(request.themeId, `${path}.themeId`);
    const direction = request.direction === undefined
      ? undefined
      : expectEnum(request.direction, `${path}.direction`, SUPPORT_DIRECTIONS);
    const cardId = request.cardId === undefined
      ? undefined
      : expectString(request.cardId, `${path}.cardId`, 128);
    if (kind === "support") {
      if (themeId === undefined || direction === undefined) {
        fail(path, "support requests require themeId and direction");
      }
      if (cardId !== undefined) fail(`${path}.cardId`, "is only valid for reprints");
    } else if (kind === "indirect-support" || kind === "environment-target") {
      if (themeId === undefined) fail(`${path}.themeId`, "is required");
      if (direction !== undefined || cardId !== undefined) {
        fail(path, "generic-pool requests only contain themeId");
      }
    } else {
      if (cardId === undefined) fail(`${path}.cardId`, "is required for reprints");
      if (themeId !== undefined || direction !== undefined) {
        fail(path, "reprint requests only contain cardId");
      }
    }
    if (themeId !== undefined && !activeThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "must reference an active theme");
    }
    const proposedDay = expectNumber(
      request.proposedDay,
      `${path}.proposedDay`,
      0,
      currentDay,
      true,
    );
    if (
      previousProposedDay !== null &&
      proposedDay < previousProposedDay
    ) {
      fail(`${path}.proposedDay`, "must not precede the prior request");
    }
    previousProposedDay = proposedDay;

    const eligibleReleaseDay = expectNumber(
      request.eligibleReleaseDay,
      `${path}.eligibleReleaseDay`,
      1,
      LAST_RELEASE_DAY,
      true,
    );
    const expectedEligibleDay =
      (Math.floor(proposedDay / RELEASE_INTERVAL) + 1) * RELEASE_INTERVAL;
    if (eligibleReleaseDay !== expectedEligibleDay) {
      fail(
        `${path}.eligibleReleaseDay`,
        "must be the first release day after the proposal",
      );
    }

    const status = expectEnum(request.status, `${path}.status`, SUPPORT_STATUSES);
    const releasedDay = expectNullableDay(
      request.releasedDay,
      `${path}.releasedDay`,
      currentDay,
    );
    if (status === "released") {
      if (
        releasedDay === null ||
        !isReleaseDay(releasedDay) ||
        releasedDay < eligibleReleaseDay
      ) {
        fail(
          `${path}.releasedDay`,
          "must be an eligible release day for a released request",
        );
      }
    } else if (releasedDay !== null) {
      fail(`${path}.releasedDay`, `must be null while status is ${status}`);
    }

    const validatedBase = {
      id,
      proposedDay,
      eligibleReleaseDay,
      status,
      releasedDay,
    };
    byId.set(
      id,
      kind === "support"
        ? {
            ...validatedBase,
            kind: request.kind === undefined ? undefined : "support",
            themeId: themeId!,
            direction: direction!,
          }
        : kind === "indirect-support"
          ? { ...validatedBase, kind, themeId: themeId! }
          : kind === "environment-target"
            ? { ...validatedBase, kind, themeId: themeId! }
            : { ...validatedBase, kind, cardId: cardId! },
    );
  });

  return byId;
}

type ValidatedReleaseHistory = {
  releasedRequestDays: Map<string, number>;
  releasedGenericDays: Map<GenericCardId, number>;
};

function usesGenericReleaseRules(
  day: number,
  genericReleaseStartDay: number | null,
): boolean {
  return genericReleaseStartDay !== null && day >= genericReleaseStartDay;
}

function validateReleaseHistory(
  value: unknown,
  currentDay: number,
  genericReleaseStartDay: number | null,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
  seenOptionIds: Set<string>,
): ValidatedReleaseHistory {
  const batches = expectArray(value, "$.releaseHistory", 64);
  const releasedRequestDays = new Map<string, number>();
  const releasedGenericDays = new Map<GenericCardId, number>();
  const releasedNewThemes = new Set<ThemeId>();
  const releasedThemeCardIds = new Set(
    [...STARTING_THEME_IDS].flatMap((themeId) =>
      THEME_BY_ID[themeId].parts
        .slice(0, INITIAL_THEME_PART_COUNT)
        .map((part) => part.id)
    ),
  );
  const releasedSupportCountByTheme = new Map<ThemeId, number>();
  let previousDay = -1;

  batches.forEach((batchValue, batchIndex) => {
    const path = `$.releaseHistory[${batchIndex}]`;
    const batch = expectRecord(
      batchValue,
      path,
      ["day", "products"],
      ["baseline"],
    );
    const day = expectNumber(batch.day, `${path}.day`, 1, currentDay, true);
    const baseline = batch.baseline === undefined
      ? false
      : expectBoolean(batch.baseline, `${path}.baseline`);
    if (baseline && batchIndex !== 0) {
      fail(`${path}.baseline`, "must be the first release-history batch");
    }
    if (baseline) {
      if (day !== INITIAL_GENERIC_RELEASE_DAY) {
        fail(`${path}.day`, "baseline generics must be available on DAY 1");
      }
    } else if (!isReleaseDay(day)) {
      fail(`${path}.day`, "must be a release day");
    }
    if (day <= previousDay) fail(`${path}.day`, "must be strictly increasing");
    previousDay = day;

    const genericRules = !baseline &&
      usesGenericReleaseRules(day, genericReleaseStartDay);
    const expectedProductCount = baseline
      ? INITIAL_GENERIC_CARD_IDS.length
      : genericRules
        ? 4
        : 3;
    const products = expectArray(
      batch.products,
      `${path}.products`,
      expectedProductCount,
      expectedProductCount,
    );
    const batchThemeIds = new Set<ThemeId>();
    const batchGenericIds = new Set<GenericCardId>();
    const themeProductsToApply: Array<{
      kind: "new-theme" | "support";
      themeId: ThemeId;
    }> = [];
    const kindCounts: Record<ReleaseOption["kind"], number> = {
      "new-theme": 0,
      support: 0,
      generic: 0,
      reprint: 0,
    };
    products.forEach((productValue, productIndex) => {
      const productPath = `${path}.products[${productIndex}]`;
      const product = expectRecord(
        productValue,
        productPath,
        [
          "optionId",
          "kind",
          "expectedTier",
          "powerAdjustment",
        ],
        [
          "themeId",
          "genericCardId",
          "direction",
          "requestId",
          "cardId",
          "referencePrice",
          "trustDelta",
          "accessibilityUserGain",
          "collectorUserLoss",
          "releaseRevenueBoost",
        ],
      );
      const optionId = expectString(
        product.optionId,
        `${productPath}.optionId`,
        128,
      );
      if (seenOptionIds.has(optionId)) {
        fail(`${productPath}.optionId`, "must be globally unique");
      }
      seenOptionIds.add(optionId);

      const kind = expectEnum(product.kind, `${productPath}.kind`, RELEASE_KINDS);
      kindCounts[kind] += 1;
      expectEnum(
        product.expectedTier,
        `${productPath}.expectedTier`,
        EXPECTED_TIERS,
      );
      expectNumber(
        product.powerAdjustment,
        `${productPath}.powerAdjustment`,
        -3,
        3,
        true,
      );

      if (kind === "reprint") {
        if (!genericRules) {
          fail(productPath, "reprints cannot precede generic release rules");
        }
        const cardId = expectString(product.cardId, `${productPath}.cardId`, 128);
        const themeId = expectThemeId(product.themeId, `${productPath}.themeId`);
        if (!activeThemeIds.has(themeId)) {
          fail(`${productPath}.themeId`, "must reference an active display theme");
        }
        const requestId = expectString(
          product.requestId,
          `${productPath}.requestId`,
          128,
        );
        const request = supportRequests.get(requestId);
        if (
          !request ||
          request.kind !== "reprint" ||
          request.cardId !== cardId ||
          request.status !== "released" ||
          request.releasedDay !== day
        ) {
          fail(`${productPath}.requestId`, "does not match the released reprint request");
        }
        if (releasedRequestDays.has(requestId)) {
          fail(`${productPath}.requestId`, "cannot be released more than once");
        }
        const genericCardId = GENERIC_CARD_IDS.has(cardId as GenericCardId)
          ? cardId as GenericCardId
          : null;
        if (genericCardId !== null) {
          const originalDay = releasedGenericDays.get(genericCardId);
          if (originalDay === undefined || originalDay >= day) {
            fail(`${productPath}.cardId`, "generic reprints require a prior release");
          }
        } else {
          const cardThemeId = PART_THEME.get(cardId);
          if (cardThemeId === undefined) {
            fail(`${productPath}.cardId`, "references an unknown card");
          }
          if (!releasedThemeCardIds.has(cardId)) {
            fail(`${productPath}.cardId`, "theme-part reprints require a prior release");
          }
          if (themeId !== cardThemeId) {
            fail(`${productPath}.themeId`, "must match the reprinted theme card");
          }
        }
        if (
          product.genericCardId !== undefined ||
          product.direction !== undefined
        ) {
          fail(productPath, "reprint products cannot contain support/generic fields");
        }
        if (product.powerAdjustment !== 0) {
          fail(`${productPath}.powerAdjustment`, "must be zero for reprints");
        }
        expectNumber(product.referencePrice, `${productPath}.referencePrice`, 100, 10_000_000);
        expectNumber(product.trustDelta, `${productPath}.trustDelta`, -10, -0.01);
        expectNumber(
          product.accessibilityUserGain,
          `${productPath}.accessibilityUserGain`,
          0,
          MAX_SAFE_COUNTER,
          true,
        );
        expectNumber(
          product.collectorUserLoss,
          `${productPath}.collectorUserLoss`,
          0,
          MAX_SAFE_COUNTER,
          true,
        );
        expectNumber(
          product.releaseRevenueBoost,
          `${productPath}.releaseRevenueBoost`,
          0,
          MAX_FINANCE_VALUE,
        );
        releasedRequestDays.set(requestId, day);
        return;
      }

      if (kind === "generic") {
        if (!genericRules && !baseline) {
          fail(productPath, "generic products cannot precede genericReleaseStartDay");
        }
        if (product.themeId !== undefined) {
          fail(`${productPath}.themeId`, "is not valid for generic products");
        }
        const genericCardId = expectGenericCardId(
          product.genericCardId,
          `${productPath}.genericCardId`,
        );
        if (baseline) {
          if (!INITIAL_GENERIC_CARD_IDS.includes(
            genericCardId as (typeof INITIAL_GENERIC_CARD_IDS)[number],
          )) {
            fail(
              `${productPath}.genericCardId`,
              "must be one of the canonical DAY 1 generic cards",
            );
          }
          if (product.requestId !== undefined) {
            fail(`${productPath}.requestId`, "is not valid for baseline products");
          }
          if (product.powerAdjustment !== 0) {
            fail(`${productPath}.powerAdjustment`, "must be zero for baseline products");
          }
        }
        if (product.direction !== undefined) {
          fail(productPath, "generic products cannot contain support direction");
        }
        if (
          batchGenericIds.has(genericCardId) ||
          releasedGenericDays.has(genericCardId)
        ) {
          fail(`${productPath}.genericCardId`, "cannot release a generic card twice");
        }
        batchGenericIds.add(genericCardId);
        releasedGenericDays.set(genericCardId, day);
        if (product.requestId !== undefined) {
          const requestId = expectString(
            product.requestId,
            `${productPath}.requestId`,
            128,
          );
          const request = supportRequests.get(requestId);
          const target = request?.themeId ? THEME_BY_ID[request.themeId] : undefined;
          const card = GENERIC_CARD_CATALOG.find(
            (candidate) => candidate.id === genericCardId,
          );
          const matchesRequest = request?.kind === "indirect-support"
            ? Boolean(target && card && target.playKeywords.includes(card.keyword))
            : request?.kind === "environment-target"
              ? Boolean(
                  target &&
                  card &&
                  getKeywordMatchupEdgeScore([card.keyword], target.playKeywords) > 0,
                )
              : false;
          if (
            !request ||
            !matchesRequest ||
            request.status !== "released" ||
            request.releasedDay !== day
          ) {
            fail(`${productPath}.requestId`, "does not match the released generic request");
          }
          if (releasedRequestDays.has(requestId)) {
            fail(`${productPath}.requestId`, "cannot be released more than once");
          }
          releasedRequestDays.set(requestId, day);
        }
        return;
      }

      if (product.genericCardId !== undefined) {
        fail(
          `${productPath}.genericCardId`,
          "is only valid for generic products",
        );
      }
      const themeId = expectThemeId(product.themeId, `${productPath}.themeId`);
      const pendingNewTheme = kind === "new-theme" && day === currentDay;
      if (!activeThemeIds.has(themeId) && !pendingNewTheme) {
        fail(`${productPath}.themeId`, "must reference an active theme");
      }
      if (batchThemeIds.has(themeId)) {
        fail(`${productPath}.themeId`, "must be unique within its release batch");
      }
      batchThemeIds.add(themeId);

      const direction =
        product.direction === undefined
          ? undefined
          : expectEnum(
              product.direction,
              `${productPath}.direction`,
              SUPPORT_DIRECTIONS,
            );
      const requestId =
        product.requestId === undefined
          ? undefined
          : expectString(product.requestId, `${productPath}.requestId`, 128);

      if (kind === "new-theme") {
        if (direction !== undefined || requestId !== undefined) {
          fail(productPath, "new-theme products cannot contain support fields");
        }
        if (releasedNewThemes.has(themeId)) {
          fail(`${productPath}.themeId`, "cannot release a new theme twice");
        }
        releasedNewThemes.add(themeId);
        themeProductsToApply.push({ kind, themeId });
        return;
      }

      if (direction === undefined) {
        fail(`${productPath}.direction`, "is required for support products");
      }
      themeProductsToApply.push({ kind: "support", themeId });
      if (requestId === undefined) return;
      const request = supportRequests.get(requestId);
      if (!request) {
        fail(`${productPath}.requestId`, "references an unknown support request");
      }
      if (
        (request.kind ?? "support") !== "support" ||
        request.status !== "released" ||
        request.themeId !== themeId ||
        request.direction !== direction ||
        request.releasedDay !== day
      ) {
        fail(`${productPath}.requestId`, "does not match the released request");
      }
      if (releasedRequestDays.has(requestId)) {
        fail(`${productPath}.requestId`, "cannot be released more than once");
      }
      releasedRequestDays.set(requestId, day);
    });

    // A product's cards enter the live pool after the batch decision. Apply
    // them only after validating every product so a reprint cannot point at a
    // debut or support card from its own release batch.
    for (const product of themeProductsToApply) {
      const content = THEME_BY_ID[product.themeId];
      if (product.kind === "new-theme") {
        for (const part of content.parts.slice(0, INITIAL_THEME_PART_COUNT)) {
          releasedThemeCardIds.add(part.id);
        }
        releasedSupportCountByTheme.set(product.themeId, 0);
        continue;
      }
      const supportCount = releasedSupportCountByTheme.get(product.themeId) ?? 0;
      const start = INITIAL_THEME_PART_COUNT +
        supportCount * SUPPORT_PARTS_PER_RELEASE;
      for (const part of content.parts.slice(
        start,
        start + SUPPORT_PARTS_PER_RELEASE,
      )) {
        releasedThemeCardIds.add(part.id);
      }
      releasedSupportCountByTheme.set(product.themeId, supportCount + 1);
    }

    if (baseline) {
      const parsedBatch = {
        day,
        baseline: true as const,
        products: batch.products,
      } as GameState["releaseHistory"][number];
      if (!isInitialGenericReleaseBatch(parsedBatch)) {
        fail(
          `${path}.products`,
          "must contain the exact canonical DAY 1 generic-card set",
        );
      }
      if (
        kindCounts.generic !== INITIAL_GENERIC_CARD_IDS.length ||
        kindCounts["new-theme"] !== 0 ||
        kindCounts.support !== 0 ||
        kindCounts.reprint !== 0
      ) {
        fail(`${path}.products`, "baseline products must all be generic cards");
      }
    }

    if (
      genericRules &&
      (kindCounts["new-theme"] < 1 ||
        kindCounts.support < 1 ||
        kindCounts.generic < 1)
    ) {
      fail(
        `${path}.products`,
        "must include at least one new theme, support, and generic product",
      );
    }
    if (
      kindCounts.reprint > 1 ||
      (kindCounts.reprint === 1 &&
        (kindCounts["new-theme"] !== 1 ||
          kindCounts.support !== 1 ||
          kindCounts.generic !== 1))
    ) {
      fail(
        `${path}.products`,
        "a locked reprint must accompany exactly one core product of each kind",
      );
    }
  });

  return { releasedRequestDays, releasedGenericDays };
}

function validateReleaseSlate(
  value: unknown,
  currentDay: number,
  genericReleaseStartDay: number | null,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
  seenOptionIds: Set<string>,
  releasedGenericDays: ReadonlyMap<GenericCardId, number>,
): Set<string> {
  const offeredRequestIds = new Set<string>();
  if (value === null) return offeredRequestIds;

  const slate = expectRecord(value, "$.releaseSlate", ["day", "options"]);
  const day = expectNumber(slate.day, "$.releaseSlate.day", 1, currentDay, true);
  if (day !== currentDay || !isReleaseDay(day)) {
    fail("$.releaseSlate.day", "must equal the current release day");
  }
  const genericRules = usesGenericReleaseRules(day, genericReleaseStartDay);
  const options = expectArray(
    slate.options,
    "$.releaseSlate.options",
    genericRules ? 10 : 6,
    genericRules ? 9 : 6,
  );
  const optionThemeIds = new Set<ThemeId>();
  const optionGenericIds = new Set<GenericCardId>();
  const kindCounts: Record<ReleaseOption["kind"], number> = {
    "new-theme": 0,
    support: 0,
    generic: 0,
    reprint: 0,
  };

  options.forEach((optionValue, index) => {
    const path = `$.releaseSlate.options[${index}]`;
    const option = expectRecord(
      optionValue,
      path,
      [
        "id",
        "kind",
        "expectedPower",
        "expectedTier",
        "requested",
      ],
      [
        "themeId",
        "genericCardId",
        "direction",
        "requestId",
        "requestKind",
        "requestThemeId",
        "requestKeyword",
        "cardId",
        "locked",
      ],
    );
    const id = expectString(option.id, `${path}.id`, 128);
    if (seenOptionIds.has(id)) fail(`${path}.id`, "must be globally unique");
    seenOptionIds.add(id);

    const kind = expectEnum(option.kind, `${path}.kind`, RELEASE_KINDS);
    kindCounts[kind] += 1;
    const expectedPower = expectNumber(
      option.expectedPower,
      `${path}.expectedPower`,
      0,
      100,
    );
    const expectedTier = expectEnum(
      option.expectedTier,
      `${path}.expectedTier`,
      EXPECTED_TIERS,
    );
    if (expectedTier !== expectedTierForPower(expectedPower)) {
      fail(`${path}.expectedTier`, "does not match expectedPower");
    }
    const requested = expectBoolean(option.requested, `${path}.requested`);

    if (kind === "reprint") {
      if (!genericRules || !requested) {
        fail(path, "reprint options must be requested under current release rules");
      }
      const cardId = expectString(option.cardId, `${path}.cardId`, 128);
      const themeId = expectThemeId(option.themeId, `${path}.themeId`);
      if (!activeThemeIds.has(themeId)) {
        fail(`${path}.themeId`, "must reference an active display theme");
      }
      if (expectBoolean(option.locked, `${path}.locked`) !== true) {
        fail(`${path}.locked`, "must be true for reprints");
      }
      const requestId = expectString(option.requestId, `${path}.requestId`, 128);
      const request = supportRequests.get(requestId);
      if (
        !request ||
        request.kind !== "reprint" ||
        request.cardId !== cardId ||
        request.status !== "offered" ||
        request.eligibleReleaseDay > day
      ) {
        fail(`${path}.requestId`, "does not match the offered reprint request");
      }
      if (
        option.genericCardId !== undefined ||
        option.direction !== undefined ||
        option.requestKind !== undefined ||
        option.requestThemeId !== undefined ||
        option.requestKeyword !== undefined
      ) {
        fail(path, "reprint options cannot contain support/generic request fields");
      }
      if (offeredRequestIds.has(requestId)) {
        fail(`${path}.requestId`, "cannot be offered more than once");
      }
      offeredRequestIds.add(requestId);
      return;
    }

    if (kind === "generic") {
      if (!genericRules) {
        fail(path, "generic options cannot precede genericReleaseStartDay");
      }
      if (option.themeId !== undefined) {
        fail(`${path}.themeId`, "is not valid for generic options");
      }
      const genericCardId = expectGenericCardId(
        option.genericCardId,
        `${path}.genericCardId`,
      );
      if (
        optionGenericIds.has(genericCardId) ||
        releasedGenericDays.has(genericCardId)
      ) {
        fail(`${path}.genericCardId`, "must be unreleased and unique in the slate");
      }
      optionGenericIds.add(genericCardId);
      if (
        option.direction !== undefined ||
        option.cardId !== undefined ||
        option.locked !== undefined
      ) {
        fail(path, "generic options cannot contain support/reprint fields");
      }
      if (!requested) {
        if (
          option.requestId !== undefined ||
          option.requestKind !== undefined ||
          option.requestThemeId !== undefined ||
          option.requestKeyword !== undefined
        ) {
          fail(path, "unrequested generic options cannot contain request fields");
        }
        return;
      }
      const requestId = expectString(option.requestId, `${path}.requestId`, 128);
      const requestKind = expectEnum(
        option.requestKind,
        `${path}.requestKind`,
        new Set(["indirect-support", "environment-target"] as const),
      );
      const requestThemeId = expectThemeId(
        option.requestThemeId,
        `${path}.requestThemeId`,
      );
      const requestKeyword = expectEnum(
        option.requestKeyword,
        `${path}.requestKeyword`,
        PLAY_KEYWORDS,
      );
      const request = supportRequests.get(requestId);
      const target = THEME_BY_ID[requestThemeId];
      const card = GENERIC_CARD_CATALOG.find(
        (candidate) => candidate.id === genericCardId,
      );
      const matchesPool = requestKind === "indirect-support"
        ? target.playKeywords.includes(requestKeyword) &&
          card?.keyword === requestKeyword
        : card?.keyword === requestKeyword &&
          getKeywordMatchupEdgeScore([requestKeyword], target.playKeywords) > 0;
      if (
        !request ||
        request.kind !== requestKind ||
        request.themeId !== requestThemeId ||
        request.status !== "offered" ||
        request.eligibleReleaseDay > day ||
        !matchesPool
      ) {
        fail(`${path}.requestId`, "does not match the offered generic request");
      }
      if (offeredRequestIds.has(requestId)) {
        fail(`${path}.requestId`, "cannot be offered more than once");
      }
      offeredRequestIds.add(requestId);
      return;
    }

    if (option.genericCardId !== undefined) {
      fail(`${path}.genericCardId`, "is only valid for generic options");
    }
    const themeId = expectThemeId(option.themeId, `${path}.themeId`);
    if (optionThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "must be unique within the release slate");
    }
    optionThemeIds.add(themeId);
    const direction =
      option.direction === undefined
        ? undefined
        : expectEnum(option.direction, `${path}.direction`, SUPPORT_DIRECTIONS);
    const requestId =
      option.requestId === undefined
        ? undefined
        : expectString(option.requestId, `${path}.requestId`, 128);

    if (kind === "new-theme") {
      if (activeThemeIds.has(themeId)) {
        fail(`${path}.themeId`, "new-theme options must target inactive themes");
      }
      if (
        direction !== undefined ||
        requestId !== undefined ||
        requested ||
        option.cardId !== undefined ||
        option.locked !== undefined ||
        option.requestKind !== undefined ||
        option.requestThemeId !== undefined ||
        option.requestKeyword !== undefined
      ) {
        fail(path, "new-theme options cannot contain support request fields");
      }
      return;
    }

    if (!activeThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "support options must target active themes");
    }
    if (direction === undefined) {
      fail(`${path}.direction`, "is required for support options");
    }
    if (
      option.cardId !== undefined ||
      option.locked !== undefined ||
      option.requestKind !== undefined ||
      option.requestThemeId !== undefined ||
      option.requestKeyword !== undefined
    ) {
      fail(path, "support options cannot contain generic/reprint request fields");
    }
    if (!requested) {
      if (requestId !== undefined) {
        fail(`${path}.requestId`, "is only valid for requested support");
      }
      return;
    }
    if (requestId === undefined) {
      fail(`${path}.requestId`, "is required for requested support");
    }
    const request = supportRequests.get(requestId);
    if (!request) fail(`${path}.requestId`, "references an unknown support request");
    if (
      request.status !== "offered" ||
      (request.kind ?? "support") !== "support" ||
      request.themeId !== themeId ||
      request.direction !== direction ||
      request.eligibleReleaseDay > day
    ) {
      fail(`${path}.requestId`, "does not match the offered support request");
    }
    if (offeredRequestIds.has(requestId)) {
      fail(`${path}.requestId`, "cannot be offered more than once");
    }
    offeredRequestIds.add(requestId);
  });

  if (
    genericRules &&
    (kindCounts["new-theme"] !== 3 ||
      kindCounts.support !== 3 ||
      kindCounts.generic !== 3 ||
      kindCounts.reprint > 1)
  ) {
    fail(
      "$.releaseSlate.options",
      "must contain exactly three new-theme, support, and generic options",
    );
  }

  return offeredRequestIds;
}

function validateGenericLimits(
  value: unknown,
  currentDay: number,
  releasedGenericDays: ReadonlyMap<GenericCardId, number>,
): void {
  const appliedGenericIds = [...releasedGenericDays.entries()]
    .filter(
      ([genericCardId, releaseDay]) =>
        releaseDay < currentDay ||
        (releaseDay === INITIAL_GENERIC_RELEASE_DAY &&
          INITIAL_GENERIC_CARD_IDS.includes(
            genericCardId as (typeof INITIAL_GENERIC_CARD_IDS)[number],
          )),
    )
    .map(([genericCardId]) => genericCardId)
    .sort();
  const limits = expectRecord(
    value,
    "$.genericLimits",
    appliedGenericIds,
  );
  for (const genericCardId of appliedGenericIds) {
    expectNumber(
      limits[genericCardId],
      `$.genericLimits.${genericCardId}`,
      0,
      3,
      true,
    );
  }
}

function validateCommunity(
  value: unknown,
  currentDay: number,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
  releasedGenericDays: ReadonlyMap<GenericCardId, number>,
) {
  const events = expectArray(value, "$.community", 500);
  const seenIds = new Set<string>();

  events.forEach((eventValue, index) => {
    const path = `$.community[${index}]`;
    const event = expectRecord(
      eventValue,
      path,
      COMMUNITY_REQUIRED_KEYS,
      COMMUNITY_OPTIONAL_KEYS,
    );
    const id = expectString(event.id, `${path}.id`, 128);
    if (seenIds.has(id)) fail(`${path}.id`, "must be unique");
    seenIds.add(id);

    const day = expectNumber(event.day, `${path}.day`, 0, MAX_DAY, true);
    if (day > currentDay) fail(`${path}.day`, "must not be in the future");
    expectEnum(event.category, `${path}.category`, COMMUNITY_CATEGORIES);
    expectEnum(event.type, `${path}.type`, COMMUNITY_TYPES);
    const themeId = expectThemeId(event.themeId, `${path}.themeId`);
    if (!activeThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "must reference an active theme");
    }
    expectString(event.body, `${path}.body`, 2000, true);

    if (event.partId !== undefined) {
      const partId = expectString(event.partId, `${path}.partId`, 128);
      if (PART_THEME.get(partId) !== themeId) {
        fail(`${path}.partId`, "does not belong to the event theme");
      }
    }
    if (event.genericCardId !== undefined) {
      const genericCardId = expectGenericCardId(
        event.genericCardId,
        `${path}.genericCardId`,
      );
      const releaseDay = releasedGenericDays.get(genericCardId);
      if (releaseDay === undefined || releaseDay > day) {
        fail(
          `${path}.genericCardId`,
          "must reference a generic card released by the event day",
        );
      }
    }
    if (event.relatedThemeId !== undefined) {
      const relatedThemeId = expectThemeId(
        event.relatedThemeId,
        `${path}.relatedThemeId`,
      );
      if (!activeThemeIds.has(relatedThemeId)) {
        fail(`${path}.relatedThemeId`, "must reference an active theme");
      }
    }
    if (event.proposalId !== undefined) {
      const requestId = expectString(
        event.proposalId,
        `${path}.proposalId`,
        128,
      );
      if (!supportRequests.has(requestId)) {
        fail(`${path}.proposalId`, "references an unknown support request");
      }
    }
    if (event.value !== undefined) {
      expectNumber(
        event.value,
        `${path}.value`,
        -MAX_SAFE_COUNTER,
        MAX_SAFE_COUNTER,
      );
    }
    if (event.previousValue !== undefined) {
      expectNumber(
        event.previousValue,
        `${path}.previousValue`,
        0,
        3,
        true,
      );
      if (
        event.type !== "restriction-applied" &&
        event.type !== "cosmetic-restriction" &&
        event.type !== "restriction-no-change"
      ) {
        fail(`${path}.previousValue`, "is only valid for restriction decisions");
      }
    }
  });
}

function validateHistory(
  value: unknown,
  currentDay: number,
  activeThemeIds: readonly ThemeId[],
): { lastDay: number; lastTotalUsers: number } {
  const history = expectArray(value, "$.history", MAX_DAY + 1);
  const activeThemeSet = new Set(activeThemeIds);
  let previousDay = -1;
  let lastTotalUsers = 0;

  history.forEach((entryValue, index) => {
    const path = `$.history[${index}]`;
    const entry = expectRecord(
      entryValue,
      path,
      ["day", "totalUsers", "revenue", "topThemeId", "shares"],
      [
        "cash",
        "operatingCash",
        "environmentHealth",
        "environmentHealthModel",
        "purchaseTrust",
        "communitySentiment",
        "communityPositive",
        "communityNegative",
        "winRates",
        "topCutPlacements",
      ],
    );
    const day = expectNumber(entry.day, `${path}.day`, 0, currentDay, true);
    if (day <= previousDay) fail(`${path}.day`, "must be strictly increasing");
    previousDay = day;
    lastTotalUsers = expectNumber(
      entry.totalUsers,
      `${path}.totalUsers`,
      0,
      MAX_SAFE_COUNTER,
    );
    expectNumber(entry.revenue, `${path}.revenue`, 0, MAX_FINANCE_VALUE);
    if (entry.cash !== undefined) {
      expectNumber(entry.cash, `${path}.cash`, 0, MAX_FINANCE_VALUE);
    }
    if (entry.operatingCash !== undefined) {
      expectNumber(
        entry.operatingCash,
        `${path}.operatingCash`,
        -MAX_FINANCE_VALUE,
        MAX_FINANCE_VALUE,
      );
    }
    if (entry.environmentHealth !== undefined) {
      expectNumber(
        entry.environmentHealth,
        `${path}.environmentHealth`,
        0,
        100,
      );
    }
    if (entry.environmentHealthModel !== undefined) {
      expectEnum(
        entry.environmentHealthModel,
        `${path}.environmentHealthModel`,
        ENVIRONMENT_HEALTH_MODELS,
      );
      if (entry.environmentHealth === undefined) {
        fail(
          `${path}.environmentHealthModel`,
          "requires environmentHealth",
        );
      }
    }
    if (entry.purchaseTrust !== undefined) {
      expectNumber(entry.purchaseTrust, `${path}.purchaseTrust`, 0, 100);
    }
    if (entry.communitySentiment !== undefined) {
      expectNumber(
        entry.communitySentiment,
        `${path}.communitySentiment`,
        0,
        100,
      );
    }
    const communityPositive = entry.communityPositive === undefined
      ? undefined
      : expectNumber(
          entry.communityPositive,
          `${path}.communityPositive`,
          0,
          20,
          true,
        );
    const communityNegative = entry.communityNegative === undefined
      ? undefined
      : expectNumber(
          entry.communityNegative,
          `${path}.communityNegative`,
          0,
          20,
          true,
        );
    if (
      communityPositive !== undefined &&
      communityNegative !== undefined &&
      communityPositive + communityNegative > 20
    ) {
      fail(path, "community sentiment post counts must not exceed 20");
    }
    const topThemeId = expectThemeId(entry.topThemeId, `${path}.topThemeId`);

    const shares = expectRecord(entry.shares, `${path}.shares`, [], activeThemeIds);
    const historicalThemeIds = Object.keys(shares);
    if (
      historicalThemeIds.length < MIN_ACTIVE_THEMES ||
      historicalThemeIds.length > activeThemeIds.length
    ) {
      fail(
        `${path}.shares`,
        `must contain between ${MIN_ACTIVE_THEMES} and ${activeThemeIds.length} active themes`,
      );
    }
    if (!historicalThemeIds.includes(topThemeId)) {
      fail(`${path}.topThemeId`, "must be present in the historical shares");
    }

    let shareTotal = 0;
    for (const themeId of historicalThemeIds) {
      if (!THEME_IDS.has(themeId) || !activeThemeSet.has(themeId)) {
        fail(`${path}.shares.${themeId}`, "references an unknown historical theme");
      }
      shareTotal += expectNumber(
        shares[themeId],
        `${path}.shares.${themeId}`,
        META_ADOPTION_SHARE_FLOOR,
        1,
      );
    }
    if (Math.abs(shareTotal - 1) > 0.00001) {
      fail(`${path}.shares`, "must add up to 1");
    }
    if (entry.winRates !== undefined) {
      const winRates = expectRecord(
        entry.winRates,
        `${path}.winRates`,
        historicalThemeIds,
      );
      for (const themeId of historicalThemeIds) {
        expectNumber(
          winRates[themeId],
          `${path}.winRates.${themeId}`,
          0,
          1,
        );
      }
    }
    if (entry.topCutPlacements !== undefined) {
      const placements = expectRecord(
        entry.topCutPlacements,
        `${path}.topCutPlacements`,
        historicalThemeIds,
      );
      const placementTotal = historicalThemeIds.reduce(
        (total, themeId) =>
          total + expectNumber(
            placements[themeId],
            `${path}.topCutPlacements.${themeId}`,
            0,
            DAILY_TOP_CUT_SLOTS,
            true,
          ),
        0,
      );
      if (placementTotal !== DAILY_TOP_CUT_SLOTS) {
        fail(
          `${path}.topCutPlacements`,
          `must add up to ${DAILY_TOP_CUT_SLOTS}`,
        );
      }
    }
  });
  return { lastDay: previousDay, lastTotalUsers };
}

export function parseGameState(value: unknown): GameState {
  const normalized = normalizePendingNewThemePredictions(
    normalizeInitialGenericCards(
      migrateLegacyFutureIdentifiersDeep(
        normalizeSaveVersion(value),
      ) as UnknownRecord,
    ),
  );
  const state = expectRecord(normalized, "$", TOP_LEVEL_KEYS);
  if (state.schemaVersion !== 8) {
    fail("$.schemaVersion", "must equal 8 after migration");
  }
  const seed = expectNumber(state.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(state.day, "$.day", 0, MAX_DAY, true);
  const phase = expectEnum(state.phase, "$.phase", PHASES);
  const genericReleaseStartDay = state.genericReleaseStartDay === null
    ? null
    : expectNumber(
        state.genericReleaseStartDay,
        "$.genericReleaseStartDay",
        RELEASE_INTERVAL,
        LAST_RELEASE_DAY,
        true,
      );
  if (
    genericReleaseStartDay !== null &&
    !isReleaseDay(genericReleaseStartDay)
  ) {
    fail("$.genericReleaseStartDay", "must be a regular release day");
  }

  const activeThemeIds = validateActiveThemeIds(state.activeThemeIds);
  const activeThemeSet = new Set(activeThemeIds);
  const themes = expectRecord(state.themes, "$.themes", activeThemeIds);
  let shareTotal = 0;
  for (const themeId of activeThemeIds) {
    validateThemeRuntime(themes[themeId], themeId, day);
    shareTotal += (themes[themeId] as UnknownRecord).share as number;
  }
  if (Math.abs(shareTotal - 1) > 0.00001) {
    fail("$.themes", "theme shares must add up to 1");
  }

  const users = expectRecord(state.users, "$.users", [
    "tier",
    "casual",
    "collector",
  ]);
  expectNumber(users.tier, "$.users.tier", 0, MAX_SAFE_COUNTER);
  expectNumber(users.casual, "$.users.casual", 0, MAX_SAFE_COUNTER);
  expectNumber(users.collector, "$.users.collector", 0, MAX_SAFE_COUNTER);
  const userTotal =
    (users.tier as number) +
    (users.casual as number) +
    (users.collector as number);
  const settledHistory = validateHistory(state.history, day, activeThemeIds);

  const finance = expectRecord(state.finance, "$.finance", [
    "today",
    "rolling30",
    "cumulative",
    "cash",
    "todayOperatingCash",
    "todayOperatingCost",
    "cumulativeOperatingCosts",
    "cumulativeExpenses",
  ]);
  expectNumber(finance.today, "$.finance.today", 0, MAX_FINANCE_VALUE);
  expectNumber(finance.rolling30, "$.finance.rolling30", 0, MAX_FINANCE_VALUE);
  expectNumber(finance.cumulative, "$.finance.cumulative", 0, MAX_FINANCE_VALUE);
  expectNumber(finance.cash, "$.finance.cash", 0, MAX_FINANCE_VALUE);
  expectNumber(
    finance.todayOperatingCash,
    "$.finance.todayOperatingCash",
    -MAX_FINANCE_VALUE,
    MAX_FINANCE_VALUE,
  );
  const todayOperatingCost = expectNumber(
    finance.todayOperatingCost,
    "$.finance.todayOperatingCost",
    0,
    MAX_FINANCE_VALUE,
  );
  const cumulativeOperatingCosts = expectNumber(
    finance.cumulativeOperatingCosts,
    "$.finance.cumulativeOperatingCosts",
    0,
    MAX_FINANCE_VALUE,
  );
  const expectedTodayOperatingCost = getDailyOperatingCost(
    settledHistory.lastDay >= 0 ? settledHistory.lastDay : day,
    settledHistory.lastDay >= 0 ? settledHistory.lastTotalUsers : userTotal,
  );
  if (
    day < OPERATING_COST_START_DAY &&
    (todayOperatingCost !== 0 || cumulativeOperatingCosts !== 0)
  ) {
    fail(
      "$.finance.cumulativeOperatingCosts",
      `must remain zero before DAY ${OPERATING_COST_START_DAY}`,
    );
  }
  // A current-schema save created before DAY-1 charging was introduced may
  // legitimately retain zero here. Do not synthesize missed costs on load;
  // the engine begins charging on the next day it settles.
  if (
    todayOperatingCost !== 0 &&
    Math.abs(todayOperatingCost - expectedTodayOperatingCost) > 0.0001
  ) {
    fail(
      "$.finance.todayOperatingCost",
      "must match the operating cost for the recorded audience",
    );
  }
  if (cumulativeOperatingCosts + 0.0001 < todayOperatingCost) {
    fail(
      "$.finance.cumulativeOperatingCosts",
      "must not be lower than today's operating cost",
    );
  }
  const cumulativeExpenses = expectNumber(
    finance.cumulativeExpenses,
    "$.finance.cumulativeExpenses",
    0,
    MAX_FINANCE_VALUE,
  );
  const operationExpenses = validateOperations(
    state.operations,
    day,
    phase,
    settledHistory.lastDay,
    seed,
  );
  if (Math.abs(cumulativeExpenses - operationExpenses) > 0.0001) {
    fail(
      "$.finance.cumulativeExpenses",
      "must equal the total cost of retained business actions and event choices",
    );
  }

  const supportRequests = validateSupportRequests(
    state.supportRequests,
    day,
    activeThemeSet,
  );
  const seenReleaseOptionIds = new Set<string>();
  const { releasedRequestDays, releasedGenericDays } = validateReleaseHistory(
    state.releaseHistory,
    day,
    genericReleaseStartDay,
    activeThemeSet,
    supportRequests,
    seenReleaseOptionIds,
  );
  const currentlyReleasedThemeCardIds = new Set(
    activeThemeIds.flatMap((themeId) =>
      ((themes[themeId] as UnknownRecord).releasedPartIds as string[])
    ),
  );
  for (const request of supportRequests.values()) {
    if (request.kind !== "reprint") continue;
    const cardId = request.cardId;
    const released = GENERIC_CARD_IDS.has(cardId as GenericCardId)
      ? releasedGenericDays.has(cardId as GenericCardId)
      : currentlyReleasedThemeCardIds.has(cardId);
    if (!released) {
      fail(
        `$.supportRequests.${request.id}.cardId`,
        "reprint requests must reference a currently released card",
      );
    }
  }
  const offeredRequestIds = validateReleaseSlate(
    state.releaseSlate,
    day,
    genericReleaseStartDay,
    activeThemeSet,
    supportRequests,
    seenReleaseOptionIds,
    releasedGenericDays,
  );
  validateGenericLimits(state.genericLimits, day, releasedGenericDays);

  const supportDaysByTheme = new Map<ThemeId, number[]>();
  const debutDayByTheme = new Map<ThemeId, number>();
  for (const batch of state.releaseHistory as GameState["releaseHistory"]) {
    for (const product of batch.products) {
      if (product.kind === "new-theme") {
        debutDayByTheme.set(product.themeId, batch.day);
      } else if (product.kind === "support") {
        const supportDays = supportDaysByTheme.get(product.themeId) ?? [];
        supportDays.push(batch.day);
        supportDaysByTheme.set(product.themeId, supportDays);
      }
    }
  }

  const expectedActiveThemeIds = new Set<ThemeId>(STARTING_THEME_IDS);
  for (const [themeId, debutDay] of debutDayByTheme) {
    if (debutDay < day) expectedActiveThemeIds.add(themeId);
  }
  if (
    expectedActiveThemeIds.size !== activeThemeSet.size ||
    [...expectedActiveThemeIds].some((themeId) => !activeThemeSet.has(themeId))
  ) {
    fail(
      "$.activeThemeIds",
      "must equal the starting themes plus new-theme releases whose next-day effects have applied",
    );
  }

  for (const themeId of activeThemeIds) {
    const runtime = themes[themeId] as UnknownRecord;
    const supportDays = supportDaysByTheme.get(themeId) ?? [];
    if (supportDays.length > MAX_THEME_SUPPORTS) {
      fail(
        `$.releaseHistory.${themeId}`,
        "cannot contain more than three support products for one theme",
      );
    }
    const debutDay = debutDayByTheme.get(themeId);
    if (
      debutDay !== undefined &&
      supportDays.some((supportDay) => supportDay <= debutDay)
    ) {
      fail(
        `$.releaseHistory.${themeId}`,
        "support products must be released after the theme debut",
      );
    }
    const appliedSupportDays = supportDays.filter(
      (supportDay) => supportDay < day,
    );
    if (runtime.supportCount !== appliedSupportDays.length) {
      fail(
        `$.themes.${themeId}.supportCount`,
        "must match support products whose next-day effects have applied",
      );
    }
    if (runtime.counterBuild !== appliedSupportDays.length) {
      fail(
        `$.themes.${themeId}.counterBuild`,
        "must match the number of applied support waves",
      );
    }
    const latestAppliedProductDay = Math.max(
      debutDay !== undefined && debutDay < day ? debutDay : -1,
      ...appliedSupportDays,
    );
    const expectedLastSupportDay =
      latestAppliedProductDay < 0 ? null : latestAppliedProductDay;
    if (runtime.lastSupportDay !== expectedLastSupportDay) {
      fail(
        `$.themes.${themeId}.lastSupportDay`,
        "must match the latest applied debut or support product",
      );
    }

    const reservedRequests = [...supportRequests.values()].filter(
      (request) =>
        (request.kind ?? "support") === "support" &&
        request.themeId === themeId &&
        (request.status === "queued" || request.status === "offered"),
    ).length;
    if (supportDays.length + reservedRequests > MAX_THEME_SUPPORTS) {
      fail(
        `$.supportRequests.${themeId}`,
        "cannot reserve more than three support waves for one theme",
      );
    }
  }

  const activeRequestLanes = new Set<string>();
  for (const request of supportRequests.values()) {
    if (request.status === "queued" || request.status === "offered") {
      const kind = request.kind ?? "support";
      const lane = kind === "support"
        ? "support"
        : kind === "reprint"
          ? "reprint"
          : "generic";
      if (activeRequestLanes.has(lane)) {
        fail(`$.supportRequests.${request.id}.status`, `duplicates active ${lane} lane`);
      }
      activeRequestLanes.add(lane);
    }
    if (request.status === "offered" && !offeredRequestIds.has(request.id)) {
      fail(
        `$.supportRequests.${request.id}.status`,
        "offered requests must appear in the current release slate",
      );
    }
    if (request.status === "released") {
      if (releasedRequestDays.get(request.id) !== request.releasedDay) {
        fail(
          `$.supportRequests.${request.id}.status`,
          "released requests must appear in release history",
        );
      }
    } else if (releasedRequestDays.has(request.id)) {
      fail(
        `$.supportRequests.${request.id}.status`,
        "only released requests may appear in release history",
      );
    }
  }

  validateCommunity(
    state.community,
    day,
    activeThemeSet,
    supportRequests,
    releasedGenericDays,
  );

  const recentRevenue = expectArray(state.recentRevenue, "$.recentRevenue", 30);
  recentRevenue.forEach((revenue, index) => {
    expectNumber(
      revenue,
      `$.recentRevenue[${index}]`,
      0,
      MAX_FINANCE_VALUE,
    );
  });

  const lastSupportProposalDay = expectNullableDay(
    state.lastSupportProposalDay,
    "$.lastSupportProposalDay",
    day,
  );
  const latestRequest = [...supportRequests.values()]
    .filter((request) => (request.kind ?? "support") === "support")
    .at(-1);
  if (
    (latestRequest === undefined && lastSupportProposalDay !== null) ||
    (latestRequest !== undefined &&
      lastSupportProposalDay !== latestRequest.proposedDay)
  ) {
    fail(
      "$.lastSupportProposalDay",
      "must equal the most recent support request day",
    );
  }

  expectNumber(
    state.nextSupportRequestId,
    "$.nextSupportRequestId",
    1,
    MAX_SAFE_COUNTER,
    true,
  );
  expectNumber(
    state.nextReleaseOptionId,
    "$.nextReleaseOptionId",
    1,
    MAX_SAFE_COUNTER,
    true,
  );
  expectNumber(
    state.nextCommunityId,
    "$.nextCommunityId",
    1,
    MAX_SAFE_COUNTER,
    true,
  );
  const currentTopThemeId = expectThemeId(
    state.currentTopThemeId,
    "$.currentTopThemeId",
  );
  if (!activeThemeSet.has(currentTopThemeId)) {
    fail("$.currentTopThemeId", "must reference an active theme");
  }
  expectNumber(state.purchaseTrust, "$.purchaseTrust", 0, 100);
  const handoverComplete = expectBoolean(
    state.handoverComplete,
    "$.handoverComplete",
  );
  const community = state.community as GameState["community"];
  const hasRestrictionDecisionAt = (decisionDay: number) =>
    community.some(
      (event) =>
        event.day === decisionDay &&
        (event.type === "restriction-applied" ||
          event.type === "cosmetic-restriction" ||
          event.type === "restriction-no-change"),
    );
  const hasFirstRelease = (state.releaseHistory as GameState["releaseHistory"])
    .some((batch) => batch.day === RELEASE_INTERVAL && !batch.baseline);
  const redesignedHandoverReady =
    day >= TUTORIAL_END_DAY &&
    hasRestrictionDecisionAt(FIRST_BAN_DAY) &&
    hasFirstRelease;
  const legacyDay46HandoverReady =
    day >= 46 && hasRestrictionDecisionAt(45) && hasFirstRelease;
  if (
    handoverComplete &&
    !redesignedHandoverReady &&
    !legacyDay46HandoverReady
  ) {
    fail(
      "$.handoverComplete",
      `requires the DAY ${FIRST_BAN_DAY} restriction, DAY ${RELEASE_INTERVAL} release, and DAY ${TUTORIAL_END_DAY} impact review`,
    );
  }

  if (
    phase === "ban-edit" &&
    !(
      (day >= FIRST_BAN_DAY &&
        day <= LAST_DECISION_DAY &&
        (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0) ||
      // v0.2.0 saves may be paused on the former 45+60n calendar. Allow the
      // pending board to load and submit; all later gates use the new calendar.
      (day >= 45 && day <= 465 && (day - 45) % BAN_INTERVAL === 0)
    )
  ) {
    fail("$.phase", "ban-edit is only valid on a restriction day");
  }
  if (phase === "release-edit") {
    if (!isReleaseDay(day) || state.releaseSlate === null) {
      fail("$.phase", "release-edit requires a slate on the current release day");
    }
  } else if (state.releaseSlate !== null) {
    fail("$.releaseSlate", "is only valid during release-edit");
  }

  if (day === CAMPAIGN_END_DAY && phase !== "ended") {
    fail("$.phase", `must be ended on DAY ${CAMPAIGN_END_DAY}`);
  }
  if (phase === "ended" && day < CAMPAIGN_END_DAY && userTotal > 0) {
    fail("$.phase", "cannot end early while players remain");
  }

  return state as unknown as GameState;
}

export function isGameState(value: unknown): value is GameState {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as UnknownRecord).schemaVersion !== 8
  ) {
    return false;
  }
  try {
    parseGameState(value);
    return true;
  } catch {
    return false;
  }
}
