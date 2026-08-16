import {
  INITIAL_THEME_PART_COUNT,
  MAX_THEME_SUPPORTS,
  SUPPORT_PARTS_PER_RELEASE,
  THEMES,
  THEME_BY_ID,
} from "./content.ts";
import type {
  CommunityCategory,
  CommunityEventType,
  ExpectedTier,
  GameState,
  PartRole,
  ReleaseOption,
  SupportDirection,
  SupportRequest,
  ThemeId,
} from "./types.ts";

export const MAX_SAVE_BYTES = 4 * 1024 * 1024;

const MAX_DAY = 1000;
const MAX_ACTIVE_THEMES = 100;
const MIN_ACTIVE_THEMES = 5;
const MAX_SAFE_COUNTER = 1_000_000_000;
const MAX_FINANCE_VALUE = 1_000_000_000_000;
const RELEASE_INTERVAL = 30;

const TOP_LEVEL_KEYS = [
  "schemaVersion",
  "seed",
  "day",
  "phase",
  "activeThemeIds",
  "themes",
  "users",
  "finance",
  "community",
  "supportRequests",
  "releaseSlate",
  "releaseHistory",
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
]);

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
]);

const RELEASE_KINDS = new Set<ReleaseOption["kind"]>([
  "new-theme",
  "support",
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
const PART_THEME = new Map(
  THEMES.flatMap((theme) =>
    theme.parts.map((part) => [part.id, theme.id] as const),
  ),
);

type UnknownRecord = Record<string, unknown>;

type ValidatedSupportRequest = {
  id: string;
  themeId: ThemeId;
  direction: SupportDirection;
  proposedDay: number;
  eligibleReleaseDay: number;
  status: SupportRequest["status"];
  releasedDay: number | null;
};

export class SaveSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveSchemaError";
  }
}

function fail(path: string, message: string): never {
  throw new SaveSchemaError(`${path}: ${message}`);
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

function isReleaseDay(day: number): boolean {
  return day > 0 && day % RELEASE_INTERVAL === 0;
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

  expectNumber(runtime.share, `${path}.share`, 0, 1);
  expectNumber(runtime.previousWeekShare, `${path}.previousWeekShare`, 0, 1);
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
      "themeId",
      "direction",
      "proposedDay",
      "eligibleReleaseDay",
      "status",
      "releasedDay",
    ]);
    const id = expectString(request.id, `${path}.id`, 128);
    if (byId.has(id)) fail(`${path}.id`, "must be unique");
    const themeId = expectThemeId(request.themeId, `${path}.themeId`);
    if (!activeThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "must reference an active theme");
    }
    const direction = expectEnum(
      request.direction,
      `${path}.direction`,
      SUPPORT_DIRECTIONS,
    );
    const proposedDay = expectNumber(
      request.proposedDay,
      `${path}.proposedDay`,
      0,
      currentDay,
      true,
    );
    if (
      previousProposedDay !== null &&
      proposedDay - previousProposedDay < RELEASE_INTERVAL
    ) {
      fail(`${path}.proposedDay`, "must respect the 30-day proposal cooldown");
    }
    previousProposedDay = proposedDay;

    const eligibleReleaseDay = expectNumber(
      request.eligibleReleaseDay,
      `${path}.eligibleReleaseDay`,
      1,
      MAX_DAY,
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

    byId.set(id, {
      id,
      themeId,
      direction,
      proposedDay,
      eligibleReleaseDay,
      status,
      releasedDay,
    });
  });

  return byId;
}

function validateReleaseHistory(
  value: unknown,
  currentDay: number,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
  seenOptionIds: Set<string>,
): Map<string, number> {
  const batches = expectArray(value, "$.releaseHistory", 64);
  const releasedRequestDays = new Map<string, number>();
  const releasedNewThemes = new Set<ThemeId>();
  let previousDay = -1;

  batches.forEach((batchValue, batchIndex) => {
    const path = `$.releaseHistory[${batchIndex}]`;
    const batch = expectRecord(batchValue, path, ["day", "products"]);
    const day = expectNumber(batch.day, `${path}.day`, 1, currentDay, true);
    if (!isReleaseDay(day)) fail(`${path}.day`, "must be a release day");
    if (day <= previousDay) fail(`${path}.day`, "must be strictly increasing");
    previousDay = day;

    const products = expectArray(batch.products, `${path}.products`, 3, 3);
    const batchThemeIds = new Set<ThemeId>();
    products.forEach((productValue, productIndex) => {
      const productPath = `${path}.products[${productIndex}]`;
      const product = expectRecord(
        productValue,
        productPath,
        [
          "optionId",
          "kind",
          "themeId",
          "expectedTier",
          "powerAdjustment",
        ],
        ["direction", "requestId"],
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
      const themeId = expectThemeId(product.themeId, `${productPath}.themeId`);
      const pendingNewTheme = kind === "new-theme" && day === currentDay;
      if (!activeThemeIds.has(themeId) && !pendingNewTheme) {
        fail(`${productPath}.themeId`, "must reference an active theme");
      }
      if (batchThemeIds.has(themeId)) {
        fail(`${productPath}.themeId`, "must be unique within its release batch");
      }
      batchThemeIds.add(themeId);
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
        return;
      }

      if (direction === undefined) {
        fail(`${productPath}.direction`, "is required for support products");
      }
      if (requestId === undefined) return;
      const request = supportRequests.get(requestId);
      if (!request) {
        fail(`${productPath}.requestId`, "references an unknown support request");
      }
      if (
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
  });

  return releasedRequestDays;
}

function validateReleaseSlate(
  value: unknown,
  currentDay: number,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
  seenOptionIds: Set<string>,
): Set<string> {
  const offeredRequestIds = new Set<string>();
  if (value === null) return offeredRequestIds;

  const slate = expectRecord(value, "$.releaseSlate", ["day", "options"]);
  const day = expectNumber(slate.day, "$.releaseSlate.day", 1, currentDay, true);
  if (day !== currentDay || !isReleaseDay(day)) {
    fail("$.releaseSlate.day", "must equal the current release day");
  }
  const options = expectArray(slate.options, "$.releaseSlate.options", 6, 3);
  const optionThemeIds = new Set<ThemeId>();

  options.forEach((optionValue, index) => {
    const path = `$.releaseSlate.options[${index}]`;
    const option = expectRecord(
      optionValue,
      path,
      [
        "id",
        "kind",
        "themeId",
        "expectedPower",
        "expectedTier",
        "requested",
      ],
      ["direction", "requestId"],
    );
    const id = expectString(option.id, `${path}.id`, 128);
    if (seenOptionIds.has(id)) fail(`${path}.id`, "must be globally unique");
    seenOptionIds.add(id);

    const kind = expectEnum(option.kind, `${path}.kind`, RELEASE_KINDS);
    const themeId = expectThemeId(option.themeId, `${path}.themeId`);
    if (optionThemeIds.has(themeId)) {
      fail(`${path}.themeId`, "must be unique within the release slate");
    }
    optionThemeIds.add(themeId);
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
      if (direction !== undefined || requestId !== undefined || requested) {
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

  return offeredRequestIds;
}

function validateCommunity(
  value: unknown,
  currentDay: number,
  activeThemeIds: ReadonlySet<ThemeId>,
  supportRequests: ReadonlyMap<string, ValidatedSupportRequest>,
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
) {
  const history = expectArray(value, "$.history", MAX_DAY + 1);
  const activeThemeSet = new Set(activeThemeIds);
  let previousDay = -1;

  history.forEach((entryValue, index) => {
    const path = `$.history[${index}]`;
    const entry = expectRecord(entryValue, path, [
      "day",
      "totalUsers",
      "revenue",
      "topThemeId",
      "shares",
    ]);
    const day = expectNumber(entry.day, `${path}.day`, 0, currentDay, true);
    if (day <= previousDay) fail(`${path}.day`, "must be strictly increasing");
    previousDay = day;
    expectNumber(entry.totalUsers, `${path}.totalUsers`, 0, MAX_SAFE_COUNTER);
    expectNumber(entry.revenue, `${path}.revenue`, 0, MAX_FINANCE_VALUE);
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
        0,
        1,
      );
    }
    if (Math.abs(shareTotal - 1) > 0.00001) {
      fail(`${path}.shares`, "must add up to 1");
    }
  });
}

export function parseGameState(value: unknown): GameState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("$", "must be an object");
  }
  if ((value as UnknownRecord).schemaVersion !== 3) {
    fail("$.schemaVersion", "must equal 3");
  }
  const state = expectRecord(value, "$", TOP_LEVEL_KEYS);
  expectNumber(state.seed, "$.seed", 0, 0xffffffff, true);
  const day = expectNumber(state.day, "$.day", 0, MAX_DAY, true);
  const phase = expectEnum(state.phase, "$.phase", PHASES);

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

  const finance = expectRecord(state.finance, "$.finance", [
    "today",
    "rolling30",
    "cumulative",
  ]);
  expectNumber(finance.today, "$.finance.today", 0, MAX_FINANCE_VALUE);
  expectNumber(finance.rolling30, "$.finance.rolling30", 0, MAX_FINANCE_VALUE);
  expectNumber(finance.cumulative, "$.finance.cumulative", 0, MAX_FINANCE_VALUE);

  const supportRequests = validateSupportRequests(
    state.supportRequests,
    day,
    activeThemeSet,
  );
  const seenReleaseOptionIds = new Set<string>();
  const releasedRequestDays = validateReleaseHistory(
    state.releaseHistory,
    day,
    activeThemeSet,
    supportRequests,
    seenReleaseOptionIds,
  );
  const offeredRequestIds = validateReleaseSlate(
    state.releaseSlate,
    day,
    activeThemeSet,
    supportRequests,
    seenReleaseOptionIds,
  );

  const supportDaysByTheme = new Map<ThemeId, number[]>();
  const debutDayByTheme = new Map<ThemeId, number>();
  for (const batch of state.releaseHistory as GameState["releaseHistory"]) {
    for (const product of batch.products) {
      if (product.kind === "new-theme") {
        debutDayByTheme.set(product.themeId, batch.day);
      } else {
        const supportDays = supportDaysByTheme.get(product.themeId) ?? [];
        supportDays.push(batch.day);
        supportDaysByTheme.set(product.themeId, supportDays);
      }
    }
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

  for (const request of supportRequests.values()) {
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

  validateCommunity(state.community, day, activeThemeSet, supportRequests);
  validateHistory(state.history, day, activeThemeIds);

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
  const latestRequest = [...supportRequests.values()].at(-1);
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
  if (handoverComplete && day < 46) {
    fail("$.handoverComplete", "cannot be true before DAY 46");
  }

  if (phase === "ban-edit" && (day < 45 || (day - 45) % 90 !== 0)) {
    fail("$.phase", "ban-edit is only valid on a restriction day");
  }
  if (phase === "release-edit") {
    if (!isReleaseDay(day) || state.releaseSlate === null) {
      fail("$.phase", "release-edit requires a slate on the current release day");
    }
  } else if (state.releaseSlate !== null) {
    fail("$.releaseSlate", "is only valid during release-edit");
  }

  return state as unknown as GameState;
}

export function isGameState(value: unknown): value is GameState {
  try {
    parseGameState(value);
    return true;
  } catch {
    return false;
  }
}
