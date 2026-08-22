import { ENVIRONMENT_HEALTH_MODEL } from "./environment-health.ts";
import { FIRST_BAN_DAY } from "./campaign.ts";

type UnknownRecord = Record<string, unknown>;

export const CURRENT_SAVE_SCHEMA_VERSION = 10;
export const MINIMUM_MIGRATABLE_SAVE_SCHEMA_VERSION = 8;

export type SaveMigrationResult = Readonly<{
  value: unknown;
  migratedFrom: number | null;
}>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSchemaVersion(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return Number.isInteger(value.schemaVersion)
    ? value.schemaVersion as number
    : null;
}

/**
 * Schema 9 made competitive-season boundaries durable. Schema 8 saves already
 * contain the redesigned 500-day calendar and can be upgraded without
 * inventing or discarding player decisions.
 */
function migrateV8ToV9(value: UnknownRecord): UnknownRecord {
  const operations = isRecord(value.operations) ? value.operations : {};
  const history = Array.isArray(value.history)
    ? value.history.map((entry) => {
        if (!isRecord(entry) || typeof entry.environmentHealth !== "number") {
          return entry;
        }
        return entry.environmentHealthModel === undefined
          ? { ...entry, environmentHealthModel: ENVIRONMENT_HEALTH_MODEL }
          : entry;
      })
    : value.history;

  return {
    ...value,
    schemaVersion: 9,
    operations: {
      ...operations,
      season: isRecord(operations.season)
        ? operations.season
        : {
            currentSeasonNumber: 1,
            startedDay: FIRST_BAN_DAY,
            boundaries: [],
          },
    },
    history,
  };
}

/** Schema 10 adds the first shareholder request and release-tool unlock state. */
function migrateV9ToV10(value: UnknownRecord): UnknownRecord {
  const requests = Array.isArray(value.supportRequests)
    ? value.supportRequests.filter(isRecord)
    : [];
  const requestById = new Map(
    requests
      .filter((request) => typeof request.id === "string")
      .map((request) => [request.id as string, request]),
  );
  const releaseHistory = Array.isArray(value.releaseHistory)
    ? value.releaseHistory.map((batch) => {
        if (!isRecord(batch) || !Array.isArray(batch.products)) return batch;
        return {
          ...batch,
          products: batch.products.map((product) => {
            if (
              !isRecord(product) ||
              product.kind !== "generic" ||
              typeof product.requestId !== "string"
            ) return product;
            const request = requestById.get(product.requestId);
            return request &&
                (request.kind === "indirect-support" ||
                  request.kind === "environment-target") &&
                typeof request.themeId === "string"
              ? {
                  ...product,
                  requestKind: request.kind,
                  requestThemeId: request.themeId,
                }
              : product;
          }),
        };
      })
    : value.releaseHistory;
  const supportRequests = Array.isArray(value.supportRequests)
    ? value.supportRequests.map((request) =>
        isRecord(request) &&
            request.kind === "reprint" &&
            (request.status === "queued" || request.status === "offered")
          ? { ...request, status: "cancelled", releasedDay: null }
          : request
      )
    : value.supportRequests;
  const releaseSlate = isRecord(value.releaseSlate) &&
      value.releaseSlate.releaseKind === "reprint" &&
      Array.isArray(value.releaseSlate.options)
    ? {
        ...value.releaseSlate,
        options: value.releaseSlate.options.map((option) => {
          if (!isRecord(option) || option.kind !== "reprint") return option;
          const rest = { ...option };
          delete rest.requestId;
          return { ...rest, requested: false };
        }),
      }
    : value.releaseSlate;
  return {
    ...value,
    schemaVersion: 10,
    releaseHistory,
    releaseSlate,
    supportRequests,
    shareholder: isRecord(value.shareholder)
      ? value.shareholder
      : {
          request: null,
          // Existing campaigns already exposed these controls, so preserve access.
          releasePlanningUnlocked: true,
        },
  };
}

/** Applies every compatible migration in order and leaves validation to the schema parser. */
export function migrateGameStateValue(value: unknown): SaveMigrationResult {
  const originalVersion = getSchemaVersion(value);
  if (originalVersion === CURRENT_SAVE_SCHEMA_VERSION) {
    return { value, migratedFrom: null };
  }
  if (originalVersion === 9 && isRecord(value)) {
    return { value: migrateV9ToV10(value), migratedFrom: 9 };
  }
  if (originalVersion === 8 && isRecord(value)) {
    return {
      value: migrateV9ToV10(migrateV8ToV9(value)),
      migratedFrom: 8,
    };
  }
  return { value, migratedFrom: null };
}

export function getSaveSchemaVersion(value: unknown): number | null {
  return getSchemaVersion(value);
}
