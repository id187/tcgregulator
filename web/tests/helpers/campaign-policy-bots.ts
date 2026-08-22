import { getAutomaticReleaseSelections } from "../../app/game/automatic-release.ts";
import {
  BUSINESS_ACTIONS,
  BUSINESS_ACTION_BY_TYPE,
  getBusinessActionAvailability,
  getBusinessActionProjectedDirectCash,
} from "../../app/game/business-actions.ts";
import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventResult,
} from "../../app/game/business-events.ts";
import { evaluateCampaignEnding } from "../../app/game/campaign-ending.ts";
import { THEME_BY_ID } from "../../app/game/content.ts";
import { createInitialGame, reduceGame } from "../../app/game/engine.ts";
import { getRestrictionCapacity } from "../../app/game/restriction-cap.ts";
import type {
  BusinessActionType,
  BusinessEventChoice,
  GameState,
  PowerAdjustment,
  RestrictionLimit,
} from "../../app/game/types.ts";

export const CAMPAIGN_POLICY_IDS = [
  "never-ban",
  "ban-happy",
  "maximum-power",
  "conservative",
  "profit-maximizer",
  "trust-maximizer",
] as const;

export type CampaignPolicyId = (typeof CAMPAIGN_POLICY_IDS)[number];

export type CampaignPolicyResult = Readonly<{
  policy: CampaignPolicyId;
  seed: number;
  day: number;
  endingTitle: string;
  qualifiedForBestEnding: boolean;
  cash: number;
  environmentHealth: number;
  purchaseTrust: number;
  userRatio: number;
}>;

function releasePower(policy: CampaignPolicyId): PowerAdjustment {
  switch (policy) {
    case "maximum-power":
      return 3;
    case "profit-maximizer":
      return 2;
    case "conservative":
      return -3;
    case "trust-maximizer":
      return -1;
    default:
      return 0;
  }
}

function releaseSelections(state: GameState, policy: CampaignPolicyId) {
  const adjustment = releasePower(policy);
  const slate = state.releaseSlate;
  return getAutomaticReleaseSelections(state).map((selection) => {
    const option = slate?.options.find(
      (candidate) => candidate.id === selection.optionId,
    );
    return {
      ...selection,
      powerAdjustment: option?.kind === "reprint" ? 0 : adjustment,
    };
  });
}

function aggressiveRestrictions(
  state: GameState,
): Record<string, RestrictionLimit> {
  const changes: Record<string, RestrictionLimit> = {};
  for (const themeId of state.activeThemeIds) {
    if (themeId === state.currentTopThemeId) continue;
    const runtime = state.themes[themeId];
    for (const partId of runtime.releasedPartIds) {
      if ((runtime.legalLimits[partId] ?? 3) < 3) changes[partId] = 3;
    }
  }
  const topRuntime = state.themes[state.currentTopThemeId];
  const topParts = THEME_BY_ID[state.currentTopThemeId].parts
    .filter((part) => topRuntime.releasedPartIds.includes(part.id))
    .sort(
      (left, right) =>
        right.powerWeight * right.unpleasantWeight -
          left.powerWeight * left.unpleasantWeight ||
        left.id.localeCompare(right.id),
    );
  const maximum = getRestrictionCapacity(state, changes).maximumRestrictedCards;
  for (const part of topParts.slice(0, maximum)) changes[part.id] = 0;
  return changes;
}

function conservativeRestrictions(
  state: GameState,
): Record<string, RestrictionLimit> {
  const topRuntime = state.themes[state.currentTopThemeId];
  if (topRuntime.share < 0.22) return {};
  const candidate = THEME_BY_ID[state.currentTopThemeId].parts
    .filter(
      (part) =>
        topRuntime.releasedPartIds.includes(part.id) &&
        (topRuntime.legalLimits[part.id] ?? 3) === 3,
    )
    .sort(
      (left, right) =>
        right.powerWeight * right.inclusion -
          left.powerWeight * left.inclusion ||
        left.id.localeCompare(right.id),
    )[0];
  return candidate ? { [candidate.id]: 2 } : {};
}

function restrictionChanges(
  state: GameState,
  policy: CampaignPolicyId,
): Record<string, RestrictionLimit> {
  if (policy === "ban-happy") return aggressiveRestrictions(state);
  if (policy === "conservative" || policy === "trust-maximizer") {
    return conservativeRestrictions(state);
  }
  return {};
}

function impactScore(
  policy: CampaignPolicyId,
  result: ReturnType<typeof getBusinessEventResult>,
): number {
  const userDelta = Object.values(result.userMultipliers).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (policy === "profit-maximizer" || policy === "maximum-power") {
    return result.cashDelta * 8 + result.revenueBonus * result.revenueDuration * 8 +
      userDelta * 8 + result.trustDelta * 0.15;
  }
  if (policy === "trust-maximizer" || policy === "conservative") {
    return result.trustDelta * 2.5 + userDelta * 45 + result.cashDelta * 0.5;
  }
  return result.trustDelta + userDelta * 25 + result.cashDelta * 2 +
    result.revenueBonus * result.revenueDuration;
}

function chooseBusinessEvent(
  state: GameState,
  policy: CampaignPolicyId,
): BusinessEventChoice {
  const pending = state.operations.pendingEvent;
  if (!pending) throw new Error("business-event bot requires a pending event");
  const selected = BUSINESS_EVENT_BY_TYPE[pending.type].choices
    .filter((choice) => choice.cost <= state.finance.cash + 1e-9)
    .map((choice) => {
      const success = getBusinessEventResult(pending.type, choice.id, "success");
      const backlash = getBusinessEventResult(pending.type, choice.id, "backlash");
      return {
        id: choice.id,
        score:
          (1 - choice.risk) * impactScore(policy, success) +
          choice.risk * impactScore(policy, backlash) - choice.cost,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    )[0];
  if (!selected) throw new Error("business-event bot found no affordable choice");
  return selected.id;
}

const TRUST_ACTIONS = new Set<BusinessActionType>([
  "store-tour",
  "beginner-camp",
  "local-league",
  "lending-exchange-network",
]);

function chooseBusinessAction(
  state: GameState,
  policy: CampaignPolicyId,
): BusinessActionType | null {
  if (policy !== "profit-maximizer" && policy !== "trust-maximizer") return null;
  const previousDay = state.operations.records.at(-1)?.startedDay ?? -100;
  if (state.day - previousDay < 14) return null;
  const candidates = BUSINESS_ACTIONS
    .filter((definition) =>
      getBusinessActionAvailability(state, definition.type).available &&
      state.finance.cash - definition.cost >= 1.5 &&
      (policy !== "trust-maximizer" || TRUST_ACTIONS.has(definition.type))
    )
    .map((definition) => ({
      type: definition.type,
      score: policy === "profit-maximizer"
        ? getBusinessActionProjectedDirectCash(state, definition.type)
        : -definition.cost + (definition.tone === "safe" ? 1 : 0),
    }))
    .filter(({ score }) => policy !== "profit-maximizer" || score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.type.localeCompare(right.type),
    );
  return candidates[0]?.type ?? null;
}

export function runCampaignPolicy(
  seed: number,
  policy: CampaignPolicyId,
): CampaignPolicyResult {
  let state = createInitialGame(seed);
  for (let guard = 0; state.phase !== "ended"; guard += 1) {
    if (guard >= 6_000) throw new Error(`${policy}/${seed} exceeded progress guard`);
    if (state.operations.pendingEvent) {
      state = reduceGame(state, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: state.operations.pendingEvent.id,
        choice: chooseBusinessEvent(state, policy),
      });
      continue;
    }
    if (state.phase === "release-edit") {
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: releaseSelections(state, policy),
      });
      continue;
    }
    if (state.phase === "ban-edit") {
      state = reduceGame(state, {
        type: "SUBMIT_BAN",
        changes: restrictionChanges(state, policy),
      });
      continue;
    }
    const action = chooseBusinessAction(state, policy);
    if (action && state.finance.cash >= BUSINESS_ACTION_BY_TYPE[action].cost) {
      state = reduceGame(state, { type: "RUN_BUSINESS_ACTION", action });
    }
    const advanceStride =
      policy === "profit-maximizer" || policy === "trust-maximizer" ? 7 : 30;
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: advanceStride });
  }
  const ending = evaluateCampaignEnding(state);
  return {
    policy,
    seed,
    day: state.day,
    endingTitle: ending.title,
    qualifiedForBestEnding: ending.qualifiedForBestEnding,
    cash: ending.scores.cash,
    environmentHealth: ending.scores.environmentHealth,
    purchaseTrust: ending.scores.purchaseTrust,
    userRatio: ending.scores.userRatio,
  };
}

export function runCampaignPolicyMatrix(
  seeds: readonly number[],
  policies: readonly CampaignPolicyId[] = CAMPAIGN_POLICY_IDS,
): CampaignPolicyResult[] {
  return policies.flatMap((policy) =>
    seeds.map((seed) => runCampaignPolicy(seed, policy))
  );
}
