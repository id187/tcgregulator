import type {
  GameState,
  RestrictionLimit,
} from "./types.ts";

/** All released theme cards plus generic cards whose D+1 limit exists. */
export function getCurrentRestrictionCardPoolIds(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
): string[] {
  const ids = new Set<string>();
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (!runtime) continue;
    for (const partId of runtime.releasedPartIds) ids.add(partId);
  }
  for (const genericCardId of Object.keys(state.genericLimits)) {
    ids.add(genericCardId);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export function getMaximumRestrictedCards(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
): number {
  return Math.floor(getCurrentRestrictionCardPoolIds(state).length / 2);
}

/** @deprecated Use getMaximumRestrictedCards. */
export const getRestrictionChangeCap = getMaximumRestrictedCards;

function getCurrentLimitByCardId(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
): Map<string, RestrictionLimit> {
  const limits = new Map<string, RestrictionLimit>();
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    if (!runtime) continue;
    for (const partId of runtime.releasedPartIds) {
      limits.set(partId, runtime.legalLimits[partId] ?? 3);
    }
  }
  for (const genericCardId of Object.keys(state.genericLimits)) {
    const genericLimits = state.genericLimits as Readonly<
      Record<string, RestrictionLimit | undefined>
    >;
    limits.set(genericCardId, genericLimits[genericCardId] ?? 3);
  }
  return limits;
}

export function getRestrictionChangedCardIds(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
  changes: Readonly<Record<string, RestrictionLimit>>,
): string[] {
  const currentLimits = getCurrentLimitByCardId(state);

  return Object.entries(changes)
    .filter(([cardId, nextLimit]) => {
      const currentLimit = currentLimits.get(cardId);
      if (currentLimit === undefined) return false;
      return currentLimit !== nextLimit;
    })
    .map(([cardId]) => cardId)
    .sort((left, right) => left.localeCompare(right));
}

export type RestrictionCapacity = {
  poolSize: number;
  maximumRestrictedCards: number;
  currentRestrictedCardIds: string[];
  currentRestrictedCount: number;
  projectedRestrictedCardIds: string[];
  projectedRestrictedCount: number;
  remainingCapacity: number;
  overLimitBy: number;
  /** Cards whose limit value actually changes in this draft; not cap-limited. */
  changedCardIds: string[];
  changeCount: number;
  /** @deprecated Use maximumRestrictedCards. */
  maximumChanges: number;
  withinLimit: boolean;
};

/** @deprecated Use RestrictionCapacity. */
export type RestrictionChangeCapacity = RestrictionCapacity;

export function getRestrictionCapacity(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
  changes: Readonly<Record<string, RestrictionLimit>>,
): RestrictionCapacity {
  const pool = getCurrentRestrictionCardPoolIds(state);
  const poolSize = pool.length;
  const maximumRestrictedCards = Math.floor(poolSize / 2);
  const currentLimits = getCurrentLimitByCardId(state);
  const currentRestrictedCardIds = pool.filter(
    (cardId) => (currentLimits.get(cardId) ?? 3) < 3,
  );
  const projectedRestrictedCardIds = pool.filter((cardId) => {
    const projectedLimit = Object.prototype.hasOwnProperty.call(changes, cardId)
      ? changes[cardId]
      : currentLimits.get(cardId) ?? 3;
    return projectedLimit < 3;
  });
  const changedCardIds = getRestrictionChangedCardIds(state, changes);
  const projectedRestrictedCount = projectedRestrictedCardIds.length;
  return {
    poolSize,
    maximumRestrictedCards,
    currentRestrictedCardIds,
    currentRestrictedCount: currentRestrictedCardIds.length,
    projectedRestrictedCardIds,
    projectedRestrictedCount,
    remainingCapacity: Math.max(
      0,
      maximumRestrictedCards - projectedRestrictedCount,
    ),
    overLimitBy: Math.max(
      0,
      projectedRestrictedCount - maximumRestrictedCards,
    ),
    changedCardIds,
    changeCount: changedCardIds.length,
    // Compatibility alias for callers being migrated to the explicit field.
    maximumChanges: maximumRestrictedCards,
    withinLimit: projectedRestrictedCount <= maximumRestrictedCards,
  };
}

/** @deprecated Use getRestrictionCapacity. */
export const getRestrictionChangeCapacity = getRestrictionCapacity;

export function assertRestrictionCapacity(
  state: Pick<GameState, "activeThemeIds" | "themes" | "genericLimits">,
  changes: Readonly<Record<string, RestrictionLimit>>,
): void {
  const capacity = getRestrictionCapacity(state, changes);
  if (capacity.withinLimit) return;
  throw new Error(
    `At most 50% of the current card pool may end with a limit below 3 (${capacity.maximumRestrictedCards} of ${capacity.poolSize} cards); the submitted list would restrict ${capacity.projectedRestrictedCount}.`,
  );
}

/** @deprecated Use assertRestrictionCapacity. */
export const assertRestrictionChangeCap = assertRestrictionCapacity;
