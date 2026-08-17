import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventOutcome,
  getBusinessEventResult,
} from "../app/game/business-events.ts";
import { CAMPAIGN_END_DAY, PLAYER_START_DAY } from "../app/game/campaign.ts";
import { evaluateCampaignEnding } from "../app/game/campaign-ending.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionPolicyProfile,
  type RestrictionPolicyProfile,
} from "../app/game/restriction-policy.ts";
import type {
  BusinessActionType,
  GameState,
  PartContent,
  PartRole,
  RestrictionLimit,
  SupportDirection,
  ThemeId,
} from "../app/game/types.ts";

const ROLE_EXPONENT: Record<PartRole, number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

const BUSINESS_ACTION_PLAN = new Map<number, BusinessActionType>([
  [120, "season-overhaul"],
  [121, "reprint-campaign"],
  [122, "local-league"],
  [123, "collector-fair"],
  [166, "reprint-campaign"],
  [211, "reprint-campaign"],
]);

const SUPPORT_PLAN = new Map<
  number,
  { themeId: ThemeId; direction: SupportDirection }
>([
  [46, { themeId: "ironblood", direction: "recovery" }],
  [106, { themeId: "white-night", direction: "counterplay" }],
  [166, { themeId: "plague-garden", direction: "consistency" }],
]);

function partAvailability(part: PartContent, limit: RestrictionLimit): number {
  const preferred = Math.min(3, Math.max(1, part.preferredCopies));
  const allowed = Math.min(preferred, limit);
  if (allowed <= 0) return 0;
  if (allowed >= preferred) return 1;
  return (allowed / preferred) ** ROLE_EXPONENT[part.role];
}

/**
 * This route is allowed to know the deterministic event roll. It still commits
 * the chosen branch through the public reducer and never mutates the state.
 */
function chooseBestKnownBusinessEvent(state: GameState): GameState {
  const pending = state.operations.pendingEvent;
  assert.ok(pending, "expected a pending business event");
  const definition = BUSINESS_EVENT_BY_TYPE[pending.type];
  const ranked = definition.choices
    .filter((choice) => choice.cost <= state.finance.cash + 1e-9)
    .map((choice) => {
      const outcome = getBusinessEventOutcome(
        state.seed,
        pending.id,
        choice.risk,
      );
      const result = getBusinessEventResult(
        pending.type,
        choice.id,
        outcome,
      );
      const userValue = Object.values(result.userMultipliers).reduce(
        (sum, multiplier) => sum + multiplier,
        0,
      );
      const score =
        result.trustDelta * 2 +
        userValue * 50 +
        (result.cashDelta - choice.cost) * 2 +
        result.revenueBonus * result.revenueDuration;
      return { choice: choice.id, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.choice.localeCompare(right.choice),
    );
  const selected = ranked[0];
  assert.ok(selected, "expected an affordable business-event choice");
  return reduceGame(state, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.id,
    choice: selected.choice,
  });
}

function getBalancedRestrictionChanges(
  state: GameState,
): Record<string, RestrictionLimit> {
  const rankedThemeIds = [...state.activeThemeIds].sort(
    (left, right) =>
      state.themes[right].share - state.themes[left].share ||
      left.localeCompare(right),
  );
  let changes: Record<string, RestrictionLimit> = {};

  for (const bandThemeIds of [
    rankedThemeIds.slice(0, 3),
    rankedThemeIds.slice(3, 6),
  ]) {
    const candidates: Array<{
      part: PartContent;
      nextLimit: RestrictionLimit;
      score: number;
    }> = [];
    for (const themeId of bandThemeIds) {
      const runtime = state.themes[themeId];
      const content = THEME_BY_ID[themeId];
      for (const part of content.parts) {
        if (!runtime.releasedPartIds.includes(part.id)) continue;
        const currentLimit = runtime.legalLimits[part.id] ?? 3;
        const nextLimit = Math.max(0, currentLimit - 2) as RestrictionLimit;
        const availabilityLoss =
          partAvailability(part, currentLimit) -
          partAvailability(part, nextLimit);
        if (availabilityLoss <= 1e-9) continue;
        const impact = part.powerWeight * part.inclusion * availabilityLoss;
        candidates.push({
          part,
          nextLimit,
          score:
            (runtime.share *
              part.unpleasantWeight *
              part.inclusion *
              availabilityLoss) /
            (0.1 + impact * 0.04),
        });
      }
    }
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.part.id.localeCompare(right.part.id),
    );
    assert.ok(candidates.length >= 3, "each policy band needs three valid cuts");
    for (const candidate of candidates.slice(0, 3)) {
      changes[candidate.part.id] = candidate.nextLimit;
    }
  }

  const cutsOnlyProfile = getRestrictionPolicyProfile(state, changes);
  if (cutsOnlyProfile.staleEligible > 0) {
    const reliefCandidates: Array<{
      partId: string;
      changes: Record<string, RestrictionLimit>;
      profile: RestrictionPolicyProfile;
    }> = [];
    for (const themeId of state.activeThemeIds) {
      const runtime = state.themes[themeId];
      for (const part of THEME_BY_ID[themeId].parts) {
        if (
          !runtime.releasedPartIds.includes(part.id) ||
          changes[part.id] !== undefined ||
          (runtime.legalLimits[part.id] ?? 3) >= 3
        ) {
          continue;
        }
        const candidateChanges = { ...changes, [part.id]: 3 as const };
        const profile = getRestrictionPolicyProfile(state, candidateChanges);
        if (profile.staleFullyReleased < 1) continue;
        reliefCandidates.push({
          partId: part.id,
          changes: candidateChanges,
          profile,
        });
      }
    }
    reliefCandidates.sort(
      (left, right) =>
        left.profile.totalImpact - right.profile.totalImpact ||
        left.partId.localeCompare(right.partId),
    );
    const selectedRelief = reliefCandidates[0];
    assert.ok(selectedRelief, "expected a fully releasable stale restriction");
    changes = selectedRelief.changes;
  }

  assert.equal(
    getRestrictionPolicyProfile(state, changes).quality,
    "balanced",
    `DAY ${state.day} route must submit a balanced policy`,
  );
  return changes;
}

function submitPlannedRelease(state: GameState): GameState {
  const slate = state.releaseSlate;
  assert.ok(slate, "release-edit must have a release slate");
  const requested = slate.options.find((option) => option.requested);
  const selected = requested
    ? [requested, ...slate.options.filter((option) => option.id !== requested.id)]
        .slice(0, 3)
    : slate.options.slice(0, 3);
  assert.equal(selected.length, 3);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
}

test("seed 1000 can earn the fully qualified best ending through the real reducer", () => {
  let state = createInitialGame(1000);
  const publishedPolicies: RestrictionPolicyProfile[] = [];

  for (let guard = 0; state.phase !== "ended"; guard += 1) {
    assert.ok(guard < 5_000, "campaign route exceeded its progress guard");

    if (state.operations.pendingEvent) {
      state = chooseBestKnownBusinessEvent(state);
      continue;
    }
    if (state.phase === "release-edit") {
      state = submitPlannedRelease(state);
      continue;
    }
    if (state.phase === "ban-edit") {
      const decisionDay = state.day;
      const changes = getBalancedRestrictionChanges(state);
      state = reduceGame(state, { type: "SUBMIT_BAN", changes });
      if (decisionDay >= PLAYER_START_DAY) {
        const published = getPublishedRestrictionPolicyProfile(
          state,
          decisionDay,
        );
        assert.equal(published.quality, "balanced");
        publishedPolicies.push(published);
      }
      continue;
    }

    const businessAction = BUSINESS_ACTION_PLAN.get(state.day);
    if (businessAction) {
      state = reduceGame(state, {
        type: "RUN_BUSINESS_ACTION",
        action: businessAction,
      });
    }
    const support = SUPPORT_PLAN.get(state.day);
    if (support) {
      state = reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: support.themeId,
        direction: support.direction,
      });
    }
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  }

  assert.equal(state.day, CAMPAIGN_END_DAY);
  assert.equal(state.phase, "ended");
  assert.deepEqual(
    state.supportRequests.map((request) => ({
      proposedDay: request.proposedDay,
      releasedDay: request.releasedDay,
      themeId: request.themeId,
      direction: request.direction,
      status: request.status,
    })),
    [
      {
        proposedDay: 46,
        releasedDay: 60,
        themeId: "ironblood",
        direction: "recovery",
        status: "released",
      },
      {
        proposedDay: 106,
        releasedDay: 120,
        themeId: "white-night",
        direction: "counterplay",
        status: "released",
      },
      {
        proposedDay: 166,
        releasedDay: 180,
        themeId: "plague-garden",
        direction: "consistency",
        status: "released",
      },
    ],
  );
  assert.equal(publishedPolicies.length, 7);
  assert.ok(
    publishedPolicies.every((profile) => profile.quality === "balanced"),
  );
  assert.deepEqual(
    publishedPolicies.map((profile) => profile.changeCount),
    [6, 7, 7, 7, 7, 7, 7],
  );
  assert.equal(
    publishedPolicies.reduce(
      (total, profile) => total + profile.staleFullyReleased,
      0,
    ),
    6,
  );

  const ending = evaluateCampaignEnding(state);
  const { support, policy, business, events } = ending.stewardship.pillars;
  assert.deepEqual(
    {
      releasedRequests: support.releasedRequests,
      distinctThemes: support.distinctThemes,
      distinctDirections: support.distinctDirections,
      positivePowerPressure: support.positivePowerPressure,
      tierZeroProducts: support.tierZeroProducts,
    },
    {
      releasedRequests: 3,
      distinctThemes: 3,
      distinctDirections: 3,
      positivePowerPressure: 0,
      tierZeroProducts: 1,
    },
  );
  assert.deepEqual(
    {
      reviewed: policy.reviewed,
      balancedReviews: policy.balancedReviews,
      staleFullyReleased: policy.staleFullyReleased,
    },
    { reviewed: 7, balancedReviews: 7, staleFullyReleased: 6 },
  );
  assert.deepEqual(
    {
      qualifyingActions: business.qualifyingActions,
      distinctTypes: business.distinctTypes,
      distinctTones: business.distinctTones,
      strategicAttempts: business.strategicAttempts,
      strategicSuccesses: business.strategicSuccesses,
    },
    {
      qualifyingActions: 6,
      distinctTypes: 4,
      distinctTones: 4,
      strategicAttempts: 1,
      strategicSuccesses: 1,
    },
  );
  assert.deepEqual(
    {
      resolved: events.resolved,
      successes: events.successes,
      requiredSuccesses: events.requiredSuccesses,
    },
    { resolved: 24, successes: 19, requiredSuccesses: 17 },
  );
  assert.deepEqual(
    state.operations.eventRecords.map((record) => record.choice),
    [
      "a",
      "b",
      "a",
      "a",
      "a",
      "b",
      "a",
      "b",
      "a",
      "b",
      "a",
      "a",
      "a",
      "a",
      "a",
      "a",
      "a",
      "b",
      "a",
      "a",
      "a",
      "b",
      "a",
      "a",
    ],
  );
  assert.equal(state.finance.cash, 26.6145);
  assert.equal(ending.scores.cash, 26.6);
  assert.equal(ending.scores.environmentHealth, 83.1);
  assert.equal(ending.stewardship.passedPillars, 4);
  assert.equal(ending.stewardship.complete, true);
  assert.equal(ending.qualifiedForBestEnding, true);
  assert.equal(ending.title, "지속 가능한 리그");
});
