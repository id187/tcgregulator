import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventOutcome,
  getBusinessEventResult,
} from "../app/game/business-events.ts";
import {
  BUSINESS_ACTION_BY_TYPE,
  getBusinessActionAvailability,
  getBusinessEnvironmentHealth,
} from "../app/game/business-actions.ts";
import {
  CAMPAIGN_END_DAY,
  LAST_BAN_DAY,
  PLAYER_START_DAY,
  REPRINT_PACK_PRODUCT_COUNT,
} from "../app/game/campaign.ts";
import { evaluateCampaignEnding } from "../app/game/campaign-ending.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import {
  getPublishedRestrictionPolicyProfile,
  getRestrictionPolicyProfile,
  type RestrictionPolicyProfile,
} from "../app/game/restriction-policy.ts";
import { getReprintImpactPreview } from "../app/game/release-requests.ts";
import type {
  BusinessActionType,
  GameState,
  PartContent,
  PartRole,
  RestrictionLimit,
  SupportDirection,
  ThemeId,
} from "../app/game/types.ts";

type CampaignStrategicPlan =
  | "season-overhaul"
  | "global-launch";

const ROLE_EXPONENT: Record<PartRole, number> = {
  starter1: 0.65,
  starter2: 0.65,
  bridge: 0.45,
  finisher: 0.3,
  recursion: 0.5,
};

function choosePlannedBusinessAction(
  state: GameState,
  plan: CampaignStrategicPlan = "season-overhaul",
): BusinessActionType | null {
  const minimumDay = plan === "season-overhaul" ? 120 : 170;
  const qualifying = plan === "season-overhaul"
    ? getBusinessEnvironmentHealth(state) >= 64
    : state.purchaseTrust >= 72;
  if (
    state.day >= minimumDay &&
    state.finance.cash + 1e-9 >= BUSINESS_ACTION_BY_TYPE[plan].cost &&
    qualifying &&
    getBusinessActionAvailability(state, plan).available
  ) {
    return plan;
  }
  return null;
}

const SUPPORT_PLAN = new Map<
  number,
  { themeId: ThemeId; direction: SupportDirection }
>([
  [46, { themeId: "ironblood", direction: "recovery" }],
  [106, { themeId: "white-night", direction: "counterplay" }],
  [166, { themeId: "abyss", direction: "consistency" }],
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
  const threatProfile = getRestrictionPolicyProfile(state, {});
  let changes: Record<string, RestrictionLimit> = {};

  for (const themeId of threatProfile.threatThemeIds) {
    const candidates: Array<{
      part: PartContent;
      nextLimit: RestrictionLimit;
      impact: number;
      score: number;
    }> = [];
    const runtime = state.themes[themeId];
    const content = THEME_BY_ID[themeId];
    for (const part of content.parts) {
      if (!runtime.releasedPartIds.includes(part.id)) continue;
      const currentLimit = runtime.legalLimits[part.id] ?? 3;
      for (
        let candidateLimit = currentLimit - 1;
        candidateLimit >= 0;
        candidateLimit -= 1
      ) {
        const nextLimit = candidateLimit as RestrictionLimit;
        const availabilityLoss =
          partAvailability(part, currentLimit) -
          partAvailability(part, nextLimit);
        if (availabilityLoss <= 1e-9) continue;
        const impact = part.powerWeight * part.inclusion * availabilityLoss;
        candidates.push({
          part,
          nextLimit,
          impact,
          score:
            (runtime.share *
              part.unpleasantWeight *
              part.inclusion *
              availabilityLoss) /
              (0.1 + impact * 0.04),
        });
        break;
      }
    }
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.part.id.localeCompare(right.part.id),
    );
    const requiredImpact =
      threatProfile.requiredThreatImpactByTheme[themeId] ?? 0;
    let selectedImpact = 0;
    for (const candidate of candidates) {
      changes[candidate.part.id] = candidate.nextLimit;
      selectedImpact += candidate.impact;
      if (selectedImpact + 1e-9 >= requiredImpact) break;
    }
    assert.ok(
      selectedImpact + 1e-9 >= requiredImpact,
      `threat ${themeId} needs a meaningful response`,
    );
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
  if (slate.releaseKind === "reprint") {
    const selected = slate.options
      .filter((option) => option.kind === "reprint")
      .sort(
        (left, right) => {
          const requestPriority =
            Number(Boolean(right.requested)) - Number(Boolean(left.requested));
          if (requestPriority !== 0) return requestPriority;
          const leftImpact = getReprintImpactPreview(state, left.cardId);
          const rightImpact = getReprintImpactPreview(state, right.cardId);
          return (
            (rightImpact?.trustDelta ?? -Infinity) -
              (leftImpact?.trustDelta ?? -Infinity) ||
            left.cardId.localeCompare(right.cardId)
          );
        },
      )
      .slice(0, REPRINT_PACK_PRODUCT_COUNT);
    assert.equal(selected.length, REPRINT_PACK_PRODUCT_COUNT);
    return reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option) => ({
        optionId: option.id,
        powerAdjustment: 0,
      })),
    });
  }
  const prioritized = <K extends (typeof slate.options)[number]["kind"]>(
    kind: K,
    count: number,
  ) =>
    slate.options
      .filter((option) => option.kind === kind)
      .sort(
        (left, right) =>
          Number(Boolean(right.requested)) - Number(Boolean(left.requested)),
      )
      .slice(0, count);
  const selected = [
    ...prioritized("new-theme", 2),
    ...prioritized("support", 1),
    ...prioritized("generic", 1),
  ];
  assert.equal(selected.length, 4);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
}

function runManagedCampaign(
  strategicPlan: CampaignStrategicPlan,
): {
  state: GameState;
  publishedPolicies: RestrictionPolicyProfile[];
} {
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
      const changes = decisionDay === 40 || decisionDay === LAST_BAN_DAY
        ? getBalancedRestrictionChanges(state)
        : {};
      state = reduceGame(state, { type: "SUBMIT_BAN", changes });
      if (decisionDay >= PLAYER_START_DAY) {
        const published = getPublishedRestrictionPolicyProfile(
          state,
          decisionDay,
        );
        if (decisionDay === 40 || decisionDay === LAST_BAN_DAY) {
          assert.equal(published.quality, "balanced");
        }
        publishedPolicies.push(published);
      }
      continue;
    }

    const businessAction = choosePlannedBusinessAction(state, strategicPlan);
    if (businessAction) {
      assert.ok(
        state.finance.cash + 1e-9 >= BUSINESS_ACTION_BY_TYPE[businessAction].cost,
        `DAY ${state.day} ${businessAction} requires ${BUSINESS_ACTION_BY_TYPE[businessAction].cost}, cash ${state.finance.cash}`,
      );
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

  return { state, publishedPolicies };
}

test("seed 1000 can earn the fully qualified best ending through the real reducer", () => {
  const { state, publishedPolicies } = runManagedCampaign("season-overhaul");

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
        releasedDay: 70,
        themeId: "ironblood",
        direction: "recovery",
        status: "released",
      },
      {
        proposedDay: 106,
        releasedDay: 130,
        themeId: "white-night",
        direction: "counterplay",
        status: "released",
      },
      {
        proposedDay: 166,
        releasedDay: 190,
        themeId: "abyss",
        direction: "consistency",
        status: "released",
      },
    ],
  );
  assert.equal(publishedPolicies.length, 11);
  assert.deepEqual(
    publishedPolicies
      .filter((profile) => profile.quality === "balanced")
      .map((profile) => profile.decisionDay),
    [40, LAST_BAN_DAY],
  );
  assert.deepEqual(
    publishedPolicies.map((profile) => profile.changeCount),
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  );
  assert.equal(
    publishedPolicies.reduce(
      (total, profile) => total + profile.staleFullyReleased,
      0,
    ),
    1,
  );

  assert.deepEqual(
    state.operations.records.map((record) => ({
      type: record.type,
      startedDay: record.startedDay,
      outcome: record.outcome,
    })),
    [{ type: "season-overhaul", startedDay: 160, outcome: "success" }],
  );

  const ending = evaluateCampaignEnding(state);
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
  assert.deepEqual(
    {
      cash: state.finance.cash,
      endingCash: ending.scores.cash,
      environmentHealth: ending.scores.environmentHealth,
      purchaseTrust: ending.scores.purchaseTrust,
      userRatio: ending.scores.userRatio,
      bands: ending.bands,
      qualifiedForBestEnding: ending.qualifiedForBestEnding,
      title: ending.title,
    },
    {
      cash: 38.6598,
      endingCash: 38.7,
      environmentHealth: 77.6,
      purchaseTrust: 95.8,
      userRatio: 5.2934,
      bands: {
        cash: "reserve",
        environment: "stable",
        trust: "trusted",
        users: "grown",
      },
      qualifiedForBestEnding: true,
      title: "함께 커진 리그",
    },
  );
});

test("a successful global launch creates a visibly higher commercial ceiling", () => {
  const { state } = runManagedCampaign("global-launch");
  const ending = evaluateCampaignEnding(state);
  const strategic = state.operations.records.find(
    (record) => record.type === "global-launch",
  );

  assert.equal(state.day, CAMPAIGN_END_DAY);
  assert.equal(strategic?.outcome, "success");
  assert.equal(ending.bands.users, "breakout");
  assert.equal(ending.bands.cash, "prosperous");
  assert.deepEqual(
    {
      cash: state.finance.cash,
      cumulativeRevenue: state.finance.cumulative,
      environmentHealth: ending.scores.environmentHealth,
      purchaseTrust: ending.scores.purchaseTrust,
      userRatio: ending.scores.userRatio,
      totalUsers: ending.totalUsers,
      title: ending.title,
    },
    {
      cash: 73.0158,
      cumulativeRevenue: 331.4247,
      environmentHealth: 78.4,
      purchaseTrust: 89.9,
      userRatio: 8.834,
      totalUsers: 87_995.87,
      title: "시대를 만든 TCG",
    },
  );
});
