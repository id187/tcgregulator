import assert from "node:assert/strict";
import test from "node:test";

import { THEME_BY_ID } from "../app/game/content.ts";
import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  RELEASE_INTERVAL,
} from "../app/game/campaign.ts";
import {
  createFirstBanGame,
  createInitialGame,
  getPrologueRestrictionChanges,
  reduceGame,
} from "../app/game/engine.ts";
import {
  getPublishedRestrictionDecisionSignals,
  getRestrictionDecisionSignals,
} from "../app/game/restriction-considerations.ts";
import type {
  GameState,
  PartContent,
  RestrictionLimit,
  ThemeId,
} from "../app/game/types.ts";

function meaningfulLimit(part: PartContent): RestrictionLimit {
  if (part.preferredCopies <= 1) return 0;
  if (part.preferredCopies <= 2) return 1;
  return 2;
}

function rankedThemeIds(state: GameState): ThemeId[] {
  const snapshot = state.history.find((entry) => entry.day === state.day);
  const shares = snapshot?.shares ?? Object.fromEntries(
    state.activeThemeIds.map((themeId) => [themeId, state.themes[themeId].share]),
  );
  return Object.entries(shares)
    .sort(
      ([leftId, leftShare], [rightId, rightShare]) =>
        rightShare - leftShare || leftId.localeCompare(rightId),
    )
    .map(([themeId]) => themeId);
}

function firstMeaningfulPart(state: GameState, themeId: ThemeId): PartContent {
  const runtime = state.themes[themeId];
  const part = THEME_BY_ID[themeId].parts.find(
    (candidate) =>
      runtime.releasedPartIds.includes(candidate.id) &&
      candidate.preferredCopies >= 2,
  );
  assert.ok(part);
  return part;
}

function overbroadChanges(state: GameState): Record<string, RestrictionLimit> {
  const changes: Record<string, RestrictionLimit> = {};
  for (const themeId of state.activeThemeIds) {
    const runtime = state.themes[themeId];
    for (const part of THEME_BY_ID[themeId].parts) {
      if (
        runtime.releasedPartIds.includes(part.id) &&
        part.preferredCopies >= 2
      ) {
        changes[part.id] = meaningfulLimit(part);
        if (Object.keys(changes).length === 8) return changes;
      }
    }
  }
  throw new Error("test fixture needs eight meaningful released cards");
}

function withUniformHealthySnapshot(state: GameState): GameState {
  const healthy = structuredClone(state);
  const share = 1 / healthy.activeThemeIds.length;
  for (const themeId of healthy.activeThemeIds) {
    healthy.themes[themeId].share = share;
  }
  const snapshot = healthy.history.find((entry) => entry.day === healthy.day) ??
    (healthy.history.at(-1)
      ? { ...healthy.history.at(-1)!, day: healthy.day }
      : undefined);
  if (snapshot) {
    snapshot.shares = Object.fromEntries(
      healthy.activeThemeIds.map((themeId) => [themeId, share]),
    );
    snapshot.topThemeId = healthy.activeThemeIds[0];
    snapshot.environmentHealth = 82;
    snapshot.purchaseTrust = 82;
    if (!healthy.history.some((entry) => entry.day === healthy.day)) {
      healthy.history.push(snapshot);
    }
  }
  healthy.currentTopThemeId = healthy.activeThemeIds[0];
  healthy.purchaseTrust = 82;
  return healthy;
}

function createInitialGameWithNextReview(seed: number): GameState {
  let state = createInitialGame(seed);
  const reviewDay = FIRST_BAN_DAY + BAN_INTERVAL;
  for (let guard = 0; state.day < reviewDay && guard < 100; guard += 1) {
    if (state.operations.pendingEvent) {
      state = reduceGame(state, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: state.operations.pendingEvent.id,
        choice: "a",
      });
    } else if (state.phase === "release-edit") {
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: getAutomaticReleaseSelections(state),
      });
    } else {
      state = reduceGame(state, {
        type: "ADVANCE_DAYS",
        days: reviewDay - state.day,
      });
    }
  }
  assert.equal(state.day, reviewDay);
  assert.equal(state.phase, "ban-edit");
  assert.ok(
    state.releaseHistory.some((batch) => batch.day === RELEASE_INTERVAL * 2),
    "the later review fixture should include the DAY60 release",
  );
  return state;
}

test("classifies a balanced draft deterministically without mutating state", () => {
  const state = createFirstBanGame(1000);
  state.releaseHistory.push({
    day: 2,
    products: state.activeThemeIds.map((themeId, index) => ({
      optionId: `recent-product-fixture-${index}`,
      kind: "support" as const,
      themeId,
      expectedTier: "Tier 2" as const,
      powerAdjustment: 0 as const,
      direction: "consistency" as const,
    })),
  });
  const changes = getPrologueRestrictionChanges(state);
  const untouched = structuredClone(state);

  const first = getRestrictionDecisionSignals(state, changes);
  const second = getRestrictionDecisionSignals(state, { ...changes });

  assert.deepEqual(first, second);
  assert.deepEqual(state, untouched);
  assert.equal(first.source, "draft");
  assert.equal(first.profile.quality, "balanced");
  assert.equal(first.flags.balanced, true);
  assert.equal(first.flags.upperDependencyHit, true);
  assert.equal(first.flags.competitiveDemandAddressed, true);
  assert.equal(first.flags.recentProductCut, true);
  assert.ok(first.signals.length >= 5);

  for (const signal of first.signals) {
    assert.ok(THEME_BY_ID[signal.themeId]);
    assert.ok(
      THEME_BY_ID[signal.themeId].parts.some(
        (part) => part.id === signal.partId,
      ),
    );
    assert.ok(Number.isInteger(signal.pressure));
    assert.ok(signal.pressure >= 0 && signal.pressure <= 100);
    assert.ok(signal.supportingArgument.length > 10);
    assert.ok(signal.opposingArgument.length > 10);
    assert.ok(signal.stakeholders.length > 0);
    assert.equal(
      new Set(signal.stakeholders).size,
      signal.stakeholders.length,
    );
  }
});

test("a one-card lower-tier draft reaches lower-only before narrow-scope copy", () => {
  const state = createInitialGameWithNextReview(1000);
  const lowerThemeId = rankedThemeIds(state).at(-1)!;
  const part = firstMeaningfulPart(state, lowerThemeId);
  const changes = { [part.id]: meaningfulLimit(part) };

  const draft = getRestrictionDecisionSignals(state, changes);

  assert.equal(draft.profile.scope, "single-card");
  assert.equal(draft.profile.quality, "narrow");
  assert.equal(draft.profile.lowerMeaningfulCuts, 1);
  assert.equal(draft.flags.lowerOnly, true);
  assert.equal(draft.flags.upperIgnored, true);
  assert.ok(draft.kinds.indexOf("lower-only") >= 0);

  const publishedState = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes,
  });
  const published = getPublishedRestrictionDecisionSignals(
    publishedState,
    FIRST_BAN_DAY + BAN_INTERVAL,
  );
  assert.equal(published.profile.scope, "single-card");
  assert.equal(published.profile.quality, "narrow");
  assert.equal(published.flags.lowerOnly, true);
  assert.equal(published.flags.upperIgnored, true);
});

test("distinguishes low-use, shared, recent-product, and cosmetic cuts", () => {
  const state = createInitialGameWithNextReview(1001);
  const ranked = rankedThemeIds(state);
  const sharedThemeId = ranked.find((themeId) =>
    THEME_BY_ID[themeId].parts.some(
      (part) =>
        state.themes[themeId].releasedPartIds.includes(part.id) &&
        part.tags.includes("외부 사용") &&
        part.preferredCopies >= 2,
    ),
  );
  assert.ok(sharedThemeId);
  const sharedPart = THEME_BY_ID[sharedThemeId].parts.find(
    (part) =>
      state.themes[sharedThemeId].releasedPartIds.includes(part.id) &&
      part.tags.includes("외부 사용") &&
      part.preferredCopies >= 2,
  )!;
  state.themes[sharedThemeId].partStats[sharedPart.id] = {
    usageRate: 0.12,
    averageCopies: 0.4,
  };
  const shared = getRestrictionDecisionSignals(state, {
    [sharedPart.id]: meaningfulLimit(sharedPart),
  });
  assert.equal(shared.flags.sharedExternalUse, true);
  assert.equal(shared.flags.lowUsageCut, true);

  const recentThemeId = state.releaseHistory
    .find((batch) => batch.day === RELEASE_INTERVAL * 2)!
    .products.find((product) => product.kind === "new-theme")!.themeId;
  const recentPart = firstMeaningfulPart(state, recentThemeId);
  const recent = getRestrictionDecisionSignals(state, {
    [recentPart.id]: meaningfulLimit(recentPart),
  });
  assert.equal(recent.flags.recentProductCut, true);

  const cosmeticPart = state.activeThemeIds
    .flatMap((themeId) =>
      THEME_BY_ID[themeId].parts.map((part) => ({ themeId, part })),
    )
    .find(
      ({ themeId, part }) =>
        state.themes[themeId].releasedPartIds.includes(part.id) &&
        part.preferredCopies === 1,
    );
  assert.ok(cosmeticPart);
  const cosmetic = getRestrictionDecisionSignals(state, {
    [cosmeticPart.part.id]: 1,
  });
  assert.equal(cosmetic.flags.cosmetic, true);
  assert.equal(cosmetic.targets[0].impact, 0);
});

test("separates stale release from stale neglect on a later review", () => {
  const state = createFirstBanGame(1002);
  state.day = FIRST_BAN_DAY + BAN_INTERVAL * 2;
  state.phase = "ban-edit";
  const themeId = "cycle";
  const part = THEME_BY_ID[themeId].parts[0];
  state.themes[themeId].legalLimits[part.id] = 1;
  state.community.push({
    id: "test-old-restriction",
    day: FIRST_BAN_DAY,
    category: "restriction",
    type: "restriction-applied",
    themeId,
    partId: part.id,
    previousValue: 3,
    value: 1,
    body: "fixture",
  });

  const ignored = getRestrictionDecisionSignals(state, {});
  assert.equal(ignored.flags.staleIgnored, true);
  assert.equal(ignored.flags.staleRelease, false);
  assert.ok(ignored.staleEligiblePartIds.includes(part.id));

  const released = getRestrictionDecisionSignals(state, { [part.id]: 3 });
  assert.equal(released.flags.staleRelease, true);
  assert.equal(released.flags.staleIgnored, false);
  assert.equal(
    released.signals.find((signal) => signal.kind === "stale-release")
      ?.recommendedLimit,
    3,
  );
});

test("marks broad lists and gives healthy and unhealthy no-change distinct signals", () => {
  const state = createInitialGameWithNextReview(1003);
  const broad = getRestrictionDecisionSignals(state, overbroadChanges(state));
  assert.equal(broad.flags.overbroad, true);
  assert.ok(broad.targets.filter((target) => target.direction === "tighten").length >= 8);

  const risky = getRestrictionDecisionSignals(state, {});
  assert.equal(risky.flags.noChange, true);
  assert.equal(risky.flags.noChangeJustified, false);
  assert.ok(risky.kinds.includes("no-change-risk"));

  const healthyState = withUniformHealthySnapshot(state);
  const healthy = getRestrictionDecisionSignals(healthyState, {});
  assert.equal(healthy.flags.noChange, true);
  assert.equal(healthy.flags.noChangeJustified, true);
  assert.ok(healthy.kinds.includes("no-change-justified"));
  assert.notDeepEqual(healthy.signals, risky.signals);
});

test("published signals remain historical when current runtime values change", () => {
  const atReview = createFirstBanGame(1004);
  const changes = getPrologueRestrictionChanges(atReview);
  const state = reduceGame(atReview, {
    type: "SUBMIT_BAN",
    changes,
    campaignSeed: 0x1004,
  });
  const original = getPublishedRestrictionDecisionSignals(state, FIRST_BAN_DAY);
  const later = structuredClone(state);

  for (const themeId of later.activeThemeIds) {
    later.themes[themeId].share = 1 / later.activeThemeIds.length;
    later.themes[themeId].counterProgress = 0;
    later.themes[themeId].counterAdoption = 0;
    for (const partId of later.themes[themeId].releasedPartIds) {
      later.themes[themeId].partStats[partId] = {
        usageRate: 0.01,
        averageCopies: 0.01,
      };
      later.themes[themeId].legalLimits[partId] = 0;
    }
  }
  later.purchaseTrust = 0;
  later.users.collector = 1;

  assert.deepEqual(
    getPublishedRestrictionDecisionSignals(later, FIRST_BAN_DAY),
    original,
  );
});

test("rejects non-review days", () => {
  const state = createFirstBanGame(1005);
  state.day = FIRST_BAN_DAY + 1;
  assert.throws(
    () => getRestrictionDecisionSignals(state, {}),
    /not a scheduled restriction review/,
  );
  assert.throws(
    () => getPublishedRestrictionDecisionSignals(state, FIRST_BAN_DAY + 1),
    /not a scheduled restriction review/,
  );
});
