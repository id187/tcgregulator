import { getGenericCard } from "../game/generic-card-catalog.ts";
import { getRestrictionPolicyProfile } from "../game/restriction-policy.ts";
import {
  getCurrentRestrictionCards,
  getRestrictionCardDisplay,
} from "../game/restriction-display.ts";
import type {
  CommunityEvent,
  GameState,
  RestrictionLimit,
} from "../game/types.ts";
import type { DecisionOutcome } from "./DecisionOutcomeOverlay.tsx";

const STORAGE_KEY = "tcg-regulator-decision-aftermath-v1";

export type PendingDecisionAftermath =
  | {
      kind: "release";
      decisionDay: number;
      outcome: Extract<DecisionOutcome, { kind: "release" }>;
    }
  | {
      kind: "restriction";
      decisionDay: number;
      outcome: Extract<DecisionOutcome, { kind: "restriction" }>;
    };

type StoredAftermath = {
  version: 1;
  seed: number;
  pending: PendingDecisionAftermath;
};

const RESTRICTION_DECISION_TYPES = new Set<CommunityEvent["type"]>([
  "restriction-applied",
  "cosmetic-restriction",
  "restriction-no-change",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDecisionOutcome(value: unknown): value is DecisionOutcome {
  if (!isRecord(value) || !Number.isInteger(value.day)) return false;
  if (value.kind === "release") {
    return isRecord(value.batch) && Array.isArray(value.batch.products);
  }
  if (value.kind !== "restriction") return false;
  return (
    Array.isArray(value.changes) &&
    Array.isArray(value.currentRestrictions) &&
    Array.isArray(value.releasedCards) &&
    typeof value.impact === "number" &&
    typeof value.unaddressedThreats === "number"
  );
}

function isPendingAftermath(value: unknown): value is PendingDecisionAftermath {
  if (
    !isRecord(value) ||
    (value.kind !== "release" && value.kind !== "restriction") ||
    !Number.isInteger(value.decisionDay) ||
    !isDecisionOutcome(value.outcome)
  ) {
    return false;
  }
  return value.outcome.kind === value.kind && value.outcome.day === value.decisionDay;
}

function isRestrictionLimit(value: unknown): value is RestrictionLimit {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function derivePendingDecisionAftermath(
  game: GameState,
): PendingDecisionAftermath | null {
  if (game.phase !== "running") return null;

  const releaseBatch = game.releaseHistory
    .slice()
    .reverse()
    .find((batch) => batch.day === game.day && !batch.baseline);
  if (releaseBatch) {
    return {
      kind: "release",
      decisionDay: game.day,
      outcome: { kind: "release", day: game.day, batch: releaseBatch },
    };
  }

  const decisionEvents = game.community.filter(
    (event) =>
      event.day === game.day &&
      event.category === "restriction" &&
      RESTRICTION_DECISION_TYPES.has(event.type),
  );
  if (decisionEvents.length === 0) return null;

  const changedByCardId = new Map<
    string,
    { before: RestrictionLimit; after: RestrictionLimit }
  >();
  for (const event of decisionEvents) {
    const cardId = event.genericCardId ?? event.partId;
    if (
      !cardId ||
      !isRestrictionLimit(event.previousValue) ||
      !isRestrictionLimit(event.value) ||
      event.previousValue === event.value
    ) {
      continue;
    }
    changedByCardId.set(cardId, {
      before: event.previousValue,
      after: event.value,
    });
  }

  const beforeDecision = structuredClone(game);
  const changes: Record<string, RestrictionLimit> = {};
  for (const [cardId, change] of changedByCardId) {
    changes[cardId] = change.after;
    const genericCard = getGenericCard(cardId);
    if (genericCard) {
      beforeDecision.genericLimits[genericCard.id] = change.before;
      continue;
    }
    const owner = beforeDecision.activeThemeIds.find((themeId) =>
      beforeDecision.themes[themeId]?.releasedPartIds.includes(cardId),
    );
    if (owner) beforeDecision.themes[owner].legalLimits[cardId] = change.before;
  }

  const policy = getRestrictionPolicyProfile(beforeDecision, changes);
  const publishedChanges = [...changedByCardId].map(([cardId, change]) => ({
    ...getRestrictionCardDisplay(game, cardId),
    before: change.before,
    after: change.after,
  }));
  const previousLimitByCardId = new Map(
    publishedChanges.map((change) => [change.cardId, change.before]),
  );
  const currentRestrictions = getCurrentRestrictionCards(game).map((card) => ({
    ...card,
    previousLimit: previousLimitByCardId.get(card.cardId),
  }));
  const releasedCards = publishedChanges
    .filter((change) => change.after === 3)
    .map((change) => ({
      card: getRestrictionCardDisplay(game, change.cardId),
      previousLimit: change.before,
    }));

  return {
    kind: "restriction",
    decisionDay: game.day,
    outcome: {
      kind: "restriction",
      day: game.day,
      changes: publishedChanges,
      currentRestrictions,
      impact: policy.totalImpact,
      releasedCards,
      unaddressedThreats: policy.unaddressedThreatThemeIds.length,
    },
  };
}

export function loadPendingDecisionAftermath(
  game: GameState,
): PendingDecisionAftermath | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return derivePendingDecisionAftermath(game);
    const stored = JSON.parse(raw) as unknown;
    if (
      !isRecord(stored) ||
      stored.version !== 1 ||
      stored.seed !== game.seed ||
      !isPendingAftermath(stored.pending) ||
      game.phase !== "running" ||
      game.day < stored.pending.decisionDay ||
      game.day > stored.pending.decisionDay + 1
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return derivePendingDecisionAftermath(game);
    }
    return stored.pending;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return derivePendingDecisionAftermath(game);
  }
}

export function savePendingDecisionAftermath(
  game: GameState,
  pending: PendingDecisionAftermath | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!pending) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const stored: StoredAftermath = {
      version: 1,
      seed: game.seed,
      pending,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // The ceremony is cosmetic; campaign persistence remains authoritative.
  }
}
