import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  CAMPAIGN_END_DAY,
  FIRST_BAN_DAY,
  FIRST_RELEASE_DAY,
  LAST_RELEASE_DAY,
  REPRINT_PACK_CANDIDATE_COUNT,
  REPRINT_PACK_PRODUCT_COUNT,
  TUTORIAL_END_DAY,
} from "../app/game/campaign.ts";
import { getBusinessEventChoice } from "../app/game/business-events.ts";
import { getBusinessEnvironmentHealth } from "../app/game/business-actions.ts";
import {
  ENVIRONMENT_HEALTH_MODEL,
  getChartEnvironmentHealth,
} from "../app/game/environment-health.ts";
import { DAILY_TOP_CUT_SLOTS } from "../app/game/placement-meta.ts";
import {
  createCampaignStart,
  createFirstBanGame,
  createInitialGame,
  getExpectedTier,
  getPrologueRestrictionChanges,
  reduceGame,
} from "../app/game/engine.ts";
import {
  MAX_SAVE_BYTES,
  SaveSchemaError,
  isGameState,
  parseGameState,
} from "../app/game/save-schema.ts";
import { INITIAL_GENERIC_CARD_IDS } from "../app/game/initial-generic-cards.ts";
import { getServiceFailureReason } from "../app/game/organization-health.ts";
import {
  getReleaseBatchKind,
  getReleaseSlateKind,
} from "../app/game/release-kind.ts";
import type {
  GameState,
  PowerAdjustment,
  ReleaseSelection,
} from "../app/game/types.ts";

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

test("round-trips decimal comparison values on non-restriction community stories", () => {
  const state = createInitialGame(90_901);
  state.community.push({
    id: "emergent-revival-fixture",
    day: state.day,
    category: "meta",
    type: "theme-popularity",
    themeId: state.activeThemeIds[0],
    value: 0.14,
    previousValue: 0.12,
    body: "실제 분포 변화로 뒤늦게 얻은 부활 서사",
  });

  const restored = parseGameState(jsonRoundTrip(state));
  const story = restored.community.find(
    (event) => event.id === "emergent-revival-fixture",
  );
  assert.equal(story?.value, 0.14);
  assert.equal(story?.previousValue, 0.12);

  const forgedRestriction = structuredClone(state);
  const restriction = forgedRestriction.community.find(
    (event) => event.type === "restriction-applied",
  );
  assert.ok(restriction);
  restriction.previousValue = 2.5;
  assert.throws(() => parseGameState(forgedRestriction), SaveSchemaError);
});

function choosePendingBusinessEvent(state: GameState): GameState {
  const pending = state.operations.pendingEvent;
  if (!pending) return state;
  const choice = getBusinessEventChoice(pending.type, "a").cost <=
    getBusinessEventChoice(pending.type, "b").cost
    ? "a"
    : "b";
  return reduceGame(state, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.id,
    choice,
  });
}

function advanceWhileRunning(state: GameState, days: number): GameState {
  const targetDay = state.day + days;
  let next = state;
  while (next.phase === "running" && next.day < targetDay) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  return next;
}

function reachFirstRelease(seed: number, requestSupport = false): GameState {
  let state = createInitialGame(seed);
  if (requestSupport) {
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: state.activeThemeIds[0],
      direction: "recovery",
    });
  }
  state = advanceToNextRelease(state);
  assert.equal(state.day, FIRST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  return state;
}

function submitThree(
  state: GameState,
  adjustments: PowerAdjustment[] = [0, 0, 0, 0],
  includeRequested = false,
): GameState {
  assert.ok(state.releaseSlate);
  const options = state.releaseSlate.options;
  if (getReleaseSlateKind(state.releaseSlate) === "reprint") {
    const selections: ReleaseSelection[] = options
      .slice(0, REPRINT_PACK_PRODUCT_COUNT)
      .map((option) => ({
        optionId: option.id,
        powerAdjustment: 0,
      }));
    return reduceGame(state, { type: "SUBMIT_RELEASE", selections });
  }
  const requested = options.find(
    (option) => option.kind === "support" && option.requested,
  );
  const generic = options.find((option) => option.kind === "generic");
  let ordered = includeRequested && requested
    ? [requested, ...options.filter((option) => option !== requested)]
    : options;
  let selectionCount = 3;
  if (generic) {
    const required = [
      includeRequested && requested
        ? requested
        : options.find((option) => option.kind === "support"),
      options.find((option) => option.kind === "new-theme"),
      generic,
    ].filter((option) => option !== undefined);
    assert.equal(required.length, 3);
    ordered = [
      ...required,
      ...options.filter((option) => !required.includes(option)),
    ];
    selectionCount = 4;
  }
  const selections: ReleaseSelection[] = ordered
    .slice(0, selectionCount)
    .map((option, index) => ({
    optionId: option.id,
    powerAdjustment: adjustments[index] ?? 0,
    }));
  return reduceGame(state, { type: "SUBMIT_RELEASE", selections });
}

function advanceThroughDecisions(state: GameState, targetDay: number): GameState {
  let next = state;
  while (next.day < targetDay) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else if (next.phase === "release-edit") {
      next = submitThree(next);
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  if (next.operations.pendingEvent) return choosePendingBusinessEvent(next);
  if (next.phase === "release-edit") return submitThree(next);
  if (next.phase === "ban-edit") {
    return reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
  }
  return next;
}

function advanceToNextRelease(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    if (next.operations.pendingEvent) {
      next = choosePendingBusinessEvent(next);
    } else if (next.phase === "release-edit") {
      return next;
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else if (next.phase === "ended") {
      break;
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1_000 });
    }
  }
  throw new Error("A release review did not appear before the campaign ended.");
}

function advanceToPendingBusinessEvent(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 1_000; guard += 1) {
    if (next.operations.pendingEvent) return next;
    if (next.phase === "release-edit") {
      next = submitThree(next);
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else if (next.phase === "ended") {
      break;
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1_000 });
    }
  }
  throw new Error("A business event did not appear before the campaign ended.");
}

test("accepts only the canonical DAY 0 baseline", () => {
  const current = createCampaignStart(7_300);
  const restored = parseGameState(jsonRoundTrip(current));
  assert.equal(restored.day, 0);
  assert.equal(restored.releaseHistory[0].day, 0);
  assert.equal(restored.releaseHistory[0].releaseKind, "baseline");
  assert.equal(
    restored.releaseHistory[0].products.length,
    INITIAL_GENERIC_CARD_IDS.length,
  );

  const legacy = structuredClone(current);
  legacy.day = 1;
  legacy.phase = "running";
  legacy.releaseHistory[0].day = 1;
  assert.throws(() => parseGameState(legacy), SaveSchemaError);
});

test("round-trips dedicated reprint slates and three-card release batches", () => {
  let state = createInitialGame(7_302);
  for (const expectedDay of [10, 30]) {
    state = advanceToNextRelease(state);
    assert.equal(state.day, expectedDay);
    assert.equal(getReleaseSlateKind(state.releaseSlate!), "regular");
    state = submitThree(state);
    const regularBatch = state.releaseHistory.at(-1)!;
    assert.equal(regularBatch.releaseKind, "regular");
    assert.equal(regularBatch.products.length, 4);
    parseGameState(jsonRoundTrip(state));
    if (expectedDay === FIRST_RELEASE_DAY) {
      const shortRegularBatch = structuredClone(state);
      shortRegularBatch.releaseHistory.at(-1)!.products.pop();
      assert.throws(
        () => parseGameState(shortRegularBatch),
        SaveSchemaError,
      );
    }
  }
  state = advanceToNextRelease(state);
  assert.equal(state.day, 50);
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.releaseKind, "reprint");
  assert.equal(getReleaseSlateKind(state.releaseSlate), "reprint");
  assert.equal(state.releaseSlate.options.length, REPRINT_PACK_CANDIDATE_COUNT);
  assert.ok(state.releaseSlate.options.every((option) => option.kind === "reprint"));
  parseGameState(jsonRoundTrip(state));

  const missingSlateKind = structuredClone(state) as unknown as {
    releaseSlate: { releaseKind?: "regular" | "reprint" };
  };
  delete missingSlateKind.releaseSlate.releaseKind;
  assert.throws(() => parseGameState(missingSlateKind), SaveSchemaError);

  const shortSlate = structuredClone(state);
  shortSlate.releaseSlate!.options.pop();
  assert.throws(() => parseGameState(shortSlate), SaveSchemaError);

  const mislabeledSlate = structuredClone(state);
  mislabeledSlate.releaseSlate!.releaseKind = "regular";
  assert.throws(() => parseGameState(mislabeledSlate), SaveSchemaError);

  const legacyLockInDedicatedSlate = structuredClone(state);
  const lockedCandidate = legacyLockInDedicatedSlate.releaseSlate!.options[0];
  assert.equal(lockedCandidate.kind, "reprint");
  (lockedCandidate as unknown as Record<string, unknown>).locked = true;
  assert.throws(
    () => parseGameState(legacyLockInDedicatedSlate),
    SaveSchemaError,
  );

  const released = submitThree(state);
  const batch = released.releaseHistory.at(-1)!;
  assert.equal(batch.day, 50);
  assert.equal(batch.releaseKind, "reprint");
  assert.equal(getReleaseBatchKind(batch), "reprint");
  assert.equal(batch.products.length, REPRINT_PACK_PRODUCT_COUNT);
  assert.ok(batch.products.every((product) => product.kind === "reprint"));
  parseGameState(jsonRoundTrip(released));

  const missingBatchKind = structuredClone(released) as unknown as {
    releaseHistory: Array<{ releaseKind?: "regular" | "reprint" }>;
  };
  delete missingBatchKind.releaseHistory.at(-1)!.releaseKind;
  assert.throws(() => parseGameState(missingBatchKind), SaveSchemaError);

  const shortBatch = structuredClone(released);
  shortBatch.releaseHistory.at(-1)!.products.pop();
  assert.throws(() => parseGameState(shortBatch), SaveSchemaError);

  const mislabeledBatch = structuredClone(released);
  mislabeledBatch.releaseHistory.at(-1)!.releaseKind = "regular";
  assert.throws(() => parseGameState(mislabeledBatch), SaveSchemaError);
});

test("rejects legacy mixed locked-reprint packs", () => {
  let state = createInitialGame(7_303);
  const themeId = state.activeThemeIds[0];
  const cardId = state.themes[themeId].releasedPartIds[0];
  state = reduceGame(state, {
    type: "SET_RELEASE_REQUEST",
    request: { kind: "reprint", cardId },
  });
  state = advanceToNextRelease(state);
  state = submitThree(state);
  state = advanceToNextRelease(state);
  assert.equal(state.day, 30);
  assert.ok(state.releaseSlate);

  const mixed = structuredClone(state) as unknown as {
    releaseSlate: {
      releaseKind?: "regular" | "reprint";
      options: Array<Record<string, unknown>>;
    };
    supportRequests: Array<{
      id: string;
      kind?: string;
      eligibleReleaseDay: number;
      status: string;
    }>;
  };
  const request = mixed.supportRequests.find(
    (candidate) => candidate.kind === "reprint",
  );
  assert.ok(request);
  request.eligibleReleaseDay = 30;
  request.status = "offered";
  delete mixed.releaseSlate.releaseKind;
  mixed.releaseSlate.options.push({
    id: "legacy-locked-reprint",
    kind: "reprint",
    cardId,
    themeId,
    expectedPower: 50,
    expectedTier: "Tier 3",
    requested: true,
    requestId: request.id,
    locked: true,
  });

  assert.throws(() => parseGameState(mixed), SaveSchemaError);
});
test("round-trips schema v9 and rejects every earlier schema", () => {
  const initial = createInitialGame(7301);
  const restored = parseGameState(jsonRoundTrip(initial));
  assert.equal(restored.schemaVersion, 9);
  assert.deepEqual(restored, initial);
  assert.ok(Buffer.byteLength(JSON.stringify(restored), "utf8") < MAX_SAVE_BYTES);

  const originalAtGate = createFirstBanGame(7301);
  const restoredAtGate = parseGameState(jsonRoundTrip(originalAtGate));
  assert.equal(restoredAtGate.day, FIRST_BAN_DAY);
  assert.equal(restoredAtGate.phase, "ban-edit");

  const command = {
    type: "SUBMIT_BAN" as const,
    changes: { "cycle-gate": 1 as const },
  };
  assert.deepEqual(
    reduceGame(restoredAtGate, command),
    reduceGame(originalAtGate, command),
  );

  for (const schemaVersion of [3, 4, 5, 6, 7, 8]) {
    const incompatible = jsonRoundTrip(initial) as Record<string, unknown>;
    incompatible.schemaVersion = schemaVersion;
    assert.throws(
      () => parseGameState(incompatible),
      (error: unknown) =>
        error instanceof SaveSchemaError &&
        /schemaVersion: must equal 9/.test(error.message),
    );
    assert.equal(isGameState(incompatible), false);
  }

  const missingSeason = jsonRoundTrip(initial) as {
    operations: { season?: unknown };
  };
  delete missingSeason.operations.season;
  assert.throws(() => parseGameState(missingSeason), SaveSchemaError);
});
test("round-trips pending, chosen, and resolved business events", () => {
  const pending = advanceToPendingBusinessEvent(createInitialGame(7310));
  assert.equal(pending.phase, "running");
  assert.ok(pending.operations.pendingEvent);
  assert.equal(pending.operations.nextEventDay, null);
  const pendingJson = jsonRoundTrip(pending);
  assert.deepEqual(parseGameState(pendingJson), pendingJson);

  const offer = pending.operations.pendingEvent;
  const chosen = reduceGame(pending, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: offer.id,
    choice: "a",
  });
  const chosenRecord = chosen.operations.eventRecords[0];
  assert.equal(chosen.operations.pendingEvent, null);
  assert.equal(chosen.operations.nextEventId, 2);
  assert.ok(chosen.operations.nextEventDay! > chosen.day);
  assert.equal(chosenRecord.id, offer.id);
  assert.equal(chosenRecord.outcome, "pending");
  assert.equal(chosenRecord.resolvedDay, undefined);
  const chosenJson = jsonRoundTrip(chosen);
  assert.deepEqual(parseGameState(chosenJson), chosenJson);

  const resolved = advanceThroughDecisions(chosen, chosenRecord.resolutionDay);
  const resolvedRecord = resolved.operations.eventRecords[0];
  assert.ok(["success", "backlash"].includes(resolvedRecord.outcome));
  assert.equal(resolvedRecord.resolvedDay, chosenRecord.resolutionDay);
  const resolvedJson = jsonRoundTrip(resolved);
  assert.deepEqual(parseGameState(resolvedJson), resolvedJson);
});

test("rejects forged business-event definitions, outcomes, and strategy", () => {
  type MutableEventSnapshot = {
    finance: Record<string, number>;
    operations: {
      nextEventDay: number | null;
      pendingEvent: Record<string, unknown> | null;
      eventRecords: Array<Record<string, unknown>>;
      strategy: Record<string, unknown>;
    };
  };

  const forgedInitialSchedule = jsonRoundTrip(
    createInitialGame(7311),
  ) as MutableEventSnapshot;
  forgedInitialSchedule.operations.nextEventDay! += 1;
  assert.throws(() => parseGameState(forgedInitialSchedule), SaveSchemaError);

  const pending = advanceToPendingBusinessEvent(createInitialGame(7311));
  assert.ok(pending.operations.pendingEvent);

  const badType = jsonRoundTrip(pending) as MutableEventSnapshot;
  badType.operations.pendingEvent!.type = "invented-event";
  assert.throws(() => parseGameState(badType), SaveSchemaError);

  const chosen = reduceGame(pending, {
    type: "CHOOSE_BUSINESS_EVENT",
    eventId: pending.operations.pendingEvent.id,
    choice: "a",
  });

  const badChoice = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badChoice.operations.eventRecords[0].choice = "c";
  assert.throws(() => parseGameState(badChoice), SaveSchemaError);

  const badCost = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badCost.operations.eventRecords[0].cost =
    (badCost.operations.eventRecords[0].cost as number) + 0.01;
  badCost.finance.cash = round4(badCost.finance.cash - 0.01);
  badCost.finance.todayOperatingCash = round4(
    badCost.finance.todayOperatingCash - 0.01,
  );
  badCost.finance.cumulativeExpenses = round4(
    badCost.finance.cumulativeExpenses + 0.01,
  );
  assert.throws(() => parseGameState(badCost), SaveSchemaError);

  const badRisk = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badRisk.operations.eventRecords[0].risk =
    (badRisk.operations.eventRecords[0].risk as number) + 0.01;
  assert.throws(() => parseGameState(badRisk), SaveSchemaError);

  const badResolution = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badResolution.operations.eventRecords[0].resolutionDay =
    (badResolution.operations.eventRecords[0].resolutionDay as number) + 1;
  assert.throws(() => parseGameState(badResolution), SaveSchemaError);

  const badAppearedDay = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badAppearedDay.operations.eventRecords[0].appearedDay =
    (badAppearedDay.operations.eventRecords[0].appearedDay as number) + 1;
  assert.throws(() => parseGameState(badAppearedDay), SaveSchemaError);

  const badRecurringSchedule = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badRecurringSchedule.operations.nextEventDay! += 1;
  assert.throws(() => parseGameState(badRecurringSchedule), SaveSchemaError);

  const badStrategy = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badStrategy.operations.strategy.audience =
    (badStrategy.operations.strategy.audience as number) + 1;
  assert.throws(() => parseGameState(badStrategy), SaveSchemaError);
});

test("round-trips every guided prologue gate without tutorial-only save data", () => {
  let state = parseGameState(jsonRoundTrip(createCampaignStart(1000)));
  assert.equal(state.day, FIRST_BAN_DAY);
  assert.equal(state.phase, "ban-edit");

  state = reduceGame(state, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(state),
  });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, FIRST_BAN_DAY);
  assert.equal(state.phase, "running");

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 7 });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, TUTORIAL_END_DAY);
  state = reduceGame(state, { type: "COMPLETE_HANDOVER" });
  state = parseGameState(jsonRoundTrip(state));
  assert.deepEqual(state, createInitialGame(1000));

  state = advanceToNextRelease(state);
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, FIRST_RELEASE_DAY);
  assert.equal(state.phase, "release-edit");
  assert.equal(state.releaseSlate?.releaseKind, "regular");
  assert.equal(state.releaseSlate?.options.length, 9);

  state = submitThree(state);
  assert.equal(state.releaseHistory.at(-1)?.products.length, 4);
  parseGameState(jsonRoundTrip(state));
});

test("round-trips player-wide handover skips and the completed DAY 7 handover", () => {
  const review = createFirstBanGame(1_002);
  const replay = createCampaignStart(1_002, { skipHandover: true });
  assert.equal(parseGameState(jsonRoundTrip(replay)).handoverComplete, true);

  let published = reduceGame(review, { type: "SUBMIT_BAN", changes: {} });
  assert.throws(
    () => reduceGame(published, { type: "COMPLETE_HANDOVER" }),
    /DAY 0 emergency restriction and observation through DAY 7/,
  );
  published = reduceGame(published, { type: "ADVANCE_DAYS", days: 7 });
  const completed = reduceGame(published, { type: "COMPLETE_HANDOVER" });
  const restored = parseGameState(jsonRoundTrip(completed));
  assert.equal(restored.day, TUTORIAL_END_DAY);
  assert.equal(restored.handoverComplete, true);
});

test("rejects the former DAY 45 restriction board", () => {
  const formerBoard = jsonRoundTrip(createInitialGame(1_003)) as GameState;
  formerBoard.day = 45;
  formerBoard.phase = "ban-edit";
  assert.throws(() => parseGameState(formerBoard), SaveSchemaError);
});
test("accepts legacy history rows while preserving the new dashboard metrics", () => {
  const current = jsonRoundTrip(createInitialGame(7302)) as GameState;
  const restored = parseGameState(current);
  assert.equal(restored.history.at(-1)?.cash, restored.finance.cash);
  assert.equal(
    restored.history.at(-1)?.operatingCash,
    restored.finance.todayOperatingCash,
  );
  assert.equal(
    restored.history.at(-1)?.purchaseTrust,
    restored.purchaseTrust,
  );
  assert.ok(restored.history.every((entry) => entry.environmentHealth !== undefined));
  assert.ok(
    restored.history.every(
      (entry) => entry.environmentHealthModel === ENVIRONMENT_HEALTH_MODEL,
    ),
  );
  assert.equal(
    restored.history.at(-1)?.environmentHealth,
    getBusinessEnvironmentHealth(restored),
  );
  assert.ok(restored.history.every((entry) => entry.communitySentiment !== undefined));
  assert.ok(
    restored.history.every(
      (entry) =>
        (entry.communityPositive ?? 0) + (entry.communityNegative ?? 0) <= 20,
    ),
  );
  assert.ok(
    restored.history.every(
      (entry) =>
        Object.values(entry.topCutPlacements ?? {}).reduce(
          (sum, placements) => sum + placements,
          0,
        ) === DAILY_TOP_CUT_SLOTS,
    ),
  );

  const legacy = jsonRoundTrip(current) as GameState;
  for (const entry of legacy.history) {
    delete entry.cash;
    delete entry.operatingCash;
    delete entry.environmentHealth;
    delete entry.environmentHealthModel;
    delete entry.purchaseTrust;
    delete entry.communitySentiment;
    delete entry.communityPositive;
    delete entry.communityNegative;
    delete entry.topCutPlacements;
  }
  const migrated = parseGameState(legacy);
  assert.equal(migrated.history.length, current.history.length);
  assert.equal(migrated.history[0].cash, undefined);
  assert.equal(migrated.history[0].environmentHealth, undefined);
  assert.equal(migrated.history[0].environmentHealthModel, undefined);
  assert.equal(migrated.history[0].communitySentiment, undefined);
  assert.equal(migrated.history[0].topCutPlacements, undefined);

  const modernContinuation = reduceGame(restored, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const legacyContinuation = reduceGame(migrated, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.deepEqual(legacyContinuation.themes, modernContinuation.themes);
  assert.deepEqual(legacyContinuation.users, modernContinuation.users);
  assert.deepEqual(legacyContinuation.finance, modernContinuation.finance);
  assert.equal(
    legacyContinuation.purchaseTrust,
    modernContinuation.purchaseTrust,
  );
});

test("accepts legacy-v7 health values but excludes them from the current chart model", () => {
  const legacy = jsonRoundTrip(createInitialGame(7_303)) as GameState;
  for (const entry of legacy.history) {
    delete entry.environmentHealthModel;
    entry.environmentHealth = 0;
  }

  const restored = parseGameState(legacy);
  const liveHealth = getBusinessEnvironmentHealth(restored);
  assert.equal(restored.history.at(-1)?.environmentHealth, 0);
  assert.equal(
    getChartEnvironmentHealth(restored.history[0], false, liveHealth),
    null,
  );
  assert.equal(
    getChartEnvironmentHealth(restored.history.at(-1)!, true, liveHealth),
    liveHealth,
  );

  const advanced = reduceGame(restored, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(
    advanced.history.at(-1)?.environmentHealthModel,
    ENVIRONMENT_HEALTH_MODEL,
  );
  assert.equal(
    advanced.history.at(-1)?.environmentHealth,
    getBusinessEnvironmentHealth(advanced),
  );
  parseGameState(jsonRoundTrip(advanced));
});

test("round-trips release editing, support requests, and dynamic theme history", () => {
  const atRelease = reachFirstRelease(8123, true);
  const restoredAtRelease = parseGameState(jsonRoundTrip(atRelease));
  assert.equal(restoredAtRelease.releaseSlate?.options.length, 9);
  assert.equal(restoredAtRelease.supportRequests[0].status, "offered");

  const requested = restoredAtRelease.releaseSlate?.options.find(
    (option) => option.kind === "support" && option.requested,
  );
  if (!requested || requested.kind !== "support") {
    assert.fail("the requested support option must be present");
  }
  assert.ok(requested.requestId);
  const requiredOptions: ReleaseSelection[] = [
    { optionId: requested.id, powerAdjustment: -3 },
    {
      optionId: restoredAtRelease.releaseSlate!.options.find(
        (option) => option.kind === "new-theme",
      )!.id,
      powerAdjustment: 0 as const,
    },
    {
      optionId: restoredAtRelease.releaseSlate!.options.find(
        (option) => option.kind === "generic",
      )!.id,
      powerAdjustment: 3 as const,
    },
  ];
  const fourthOption = restoredAtRelease.releaseSlate!.options.find(
    (option) => !requiredOptions.some((selection) => selection.optionId === option.id),
  );
  assert.ok(fourthOption);
  const selections: ReleaseSelection[] = [
    ...requiredOptions,
    { optionId: fourthOption.id, powerAdjustment: 0 as const },
  ];
  const uninterrupted = reduceGame(atRelease, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  const continued = reduceGame(restoredAtRelease, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  assert.deepEqual(continued, uninterrupted);
  assert.equal(continued.releaseHistory[1].products.length, 4);
  assert.equal(continued.supportRequests[0].status, "released");
  assert.equal(continued.supportRequests[0].releasedDay, FIRST_RELEASE_DAY);

  const observed = reduceGame(continued, { type: "ADVANCE_DAYS", days: 1 });
  const historicalWidths = observed.history.map(
    (entry) => Object.keys(entry.shares).length,
  );
  assert.equal(historicalWidths[0], 5);
  assert.ok(historicalWidths.at(-1)! > historicalWidths[0]);
  parseGameState(jsonRoundTrip(observed));
});

test("validates generic catalog IDs, release uniqueness, and D+1 limits", () => {
  const atRelease = reachFirstRelease(8_125);
  const firstReleasedGeneric = atRelease.releaseHistory
    .flatMap((batch) => batch.products)
    .find((product) => product.kind === "generic");
  const offeredGenerics = atRelease.releaseSlate!.options.filter(
    (option) => option.kind === "generic",
  );
  assert.ok(firstReleasedGeneric);
  assert.equal(offeredGenerics.length, 3);
  assert.deepEqual(
    Object.fromEntries(
      ["new-theme", "support", "generic"].map((kind) => [
        kind,
        atRelease.releaseSlate!.options.filter((option) => option.kind === kind)
          .length,
      ]),
    ),
    { "new-theme": 3, support: 3, generic: 3 },
  );
  assert.equal(atRelease.genericLimits[firstReleasedGeneric.genericCardId], 3);

  const missingAppliedLimit = structuredClone(atRelease);
  delete missingAppliedLimit.genericLimits[firstReleasedGeneric.genericCardId];
  assert.throws(() => parseGameState(missingAppliedLimit), SaveSchemaError);

  const limitForUnreleasedCard = structuredClone(atRelease);
  limitForUnreleasedCard.genericLimits[offeredGenerics[0].genericCardId] = 3;
  assert.throws(() => parseGameState(limitForUnreleasedCard), SaveSchemaError);

  const unknownCatalogId = structuredClone(atRelease);
  const unknownOption = unknownCatalogId.releaseSlate!.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(unknownOption);
  unknownOption.genericCardId = "generic-unknown-enabler" as typeof unknownOption.genericCardId;
  assert.throws(() => parseGameState(unknownCatalogId), SaveSchemaError);

  const duplicateSlateCard = structuredClone(atRelease);
  const duplicateOptions = duplicateSlateCard.releaseSlate!.options.filter(
    (option) => option.kind === "generic",
  );
  duplicateOptions[1].genericCardId = duplicateOptions[0].genericCardId;
  assert.throws(() => parseGameState(duplicateSlateCard), SaveSchemaError);

  const wrongSlateMix = structuredClone(atRelease);
  const offeredThemeIds = new Set(
    wrongSlateMix.releaseSlate!.options.flatMap((option) =>
      option.kind === "generic" ? [] : [option.themeId],
    ),
  );
  const replacementThemeId = wrongSlateMix.activeThemeIds.find(
    (themeId) => !offeredThemeIds.has(themeId),
  );
  assert.ok(replacementThemeId);
  const replacedGenericOption = wrongSlateMix.releaseSlate!.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(replacedGenericOption);
  const forgedSupportOption = replacedGenericOption as unknown as Record<
    string,
    unknown
  >;
  forgedSupportOption.kind = "support";
  forgedSupportOption.themeId = replacementThemeId;
  forgedSupportOption.direction = "consistency";
  delete forgedSupportOption.genericCardId;
  assert.throws(() => parseGameState(wrongSlateMix), SaveSchemaError);

  const unreleasedCommunityCard = structuredClone(atRelease);
  unreleasedCommunityCard.community.push({
    id: "fixture-unreleased-generic",
    day: unreleasedCommunityCard.day,
    category: "release",
    type: "release-reaction",
    themeId: unreleasedCommunityCard.currentTopThemeId,
    genericCardId: offeredGenerics[0].genericCardId,
    body: "아직 발매되지 않은 범용 카드에 관한 위조 게시물",
  });
  assert.throws(() => parseGameState(unreleasedCommunityCard), SaveSchemaError);

  const submitted = submitThree(atRelease);
  const sameDayGeneric = submitted.releaseHistory
    .at(-1)!
    .products.find((product) => product.kind === "generic");
  assert.ok(sameDayGeneric);
  assert.ok(
    ["new-theme", "support", "generic"].every((kind) =>
      submitted.releaseHistory.at(-1)!.products.some(
        (product) => product.kind === kind,
      ),
    ),
  );
  assert.equal(submitted.genericLimits[sameDayGeneric.genericCardId], undefined);

  const prematureLimit = structuredClone(submitted);
  prematureLimit.genericLimits[sameDayGeneric.genericCardId] = 3;
  assert.throws(() => parseGameState(prematureLimit), SaveSchemaError);

  const duplicateHistoricalCard = structuredClone(submitted);
  const newestGeneric = duplicateHistoricalCard.releaseHistory
    .at(-1)!
    .products.find((product) => product.kind === "generic");
  assert.ok(newestGeneric);
  newestGeneric.genericCardId = firstReleasedGeneric.genericCardId;
  assert.throws(() => parseGameState(duplicateHistoricalCard), SaveSchemaError);

  const wrongProductMix = structuredClone(submitted);
  const newestBatch = wrongProductMix.releaseHistory.at(-1)!;
  const batchThemeIds = new Set(
    newestBatch.products.flatMap((product) =>
      product.kind === "generic" ? [] : [product.themeId],
    ),
  );
  const supportThemeId = wrongProductMix.activeThemeIds.find(
    (themeId) => !batchThemeIds.has(themeId),
  );
  assert.ok(supportThemeId);
  const genericProduct = newestBatch.products.find(
    (product) => product.kind === "generic",
  );
  assert.ok(genericProduct);
  const forgedSupportProduct = genericProduct as unknown as Record<
    string,
    unknown
  >;
  forgedSupportProduct.kind = "support";
  forgedSupportProduct.themeId = supportThemeId;
  forgedSupportProduct.direction = "consistency";
  delete forgedSupportProduct.genericCardId;
  assert.throws(() => parseGameState(wrongProductMix), SaveSchemaError);

  const applied = advanceThroughDecisions(submitted, submitted.day + 1);
  assert.equal(applied.genericLimits[sameDayGeneric.genericCardId], 3);
  parseGameState(applied);

  const missingNextDayLimit = structuredClone(applied);
  delete missingNextDayLimit.genericLimits[sameDayGeneric.genericCardId];
  assert.throws(() => parseGameState(missingNextDayLimit), SaveSchemaError);
});

test("rejects stale new-theme forecasts and same-day products", () => {
  let atRelease = reachFirstRelease(8_124);
  atRelease = submitThree(atRelease);
  atRelease = advanceToNextRelease(atRelease);
  assert.equal(atRelease.day, 30);
  assert.ok(atRelease.releaseSlate);

  const newOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "new-theme",
  );
  assert.ok(newOption);
  const content = THEMES.find((theme) => theme.id === newOption.themeId);
  assert.ok(content);

  const staleReleaseEdit = structuredClone(atRelease);
  const staleOption = staleReleaseEdit.releaseSlate!.options.find(
    (option) => option.id === newOption.id,
  );
  assert.ok(staleOption);
  staleOption.expectedPower = content.basePower;
  staleOption.expectedTier = getExpectedTier(content.basePower);
  assert.throws(() => parseGameState(staleReleaseEdit), SaveSchemaError);

  const submitted = submitThree(atRelease);
  const staleSubmitted = structuredClone(submitted);
  const staleProduct = staleSubmitted.releaseHistory.at(-1)!.products.find(
    (product) => product.optionId === newOption.id,
  );
  assert.ok(staleProduct);
  staleProduct.expectedTier = staleProduct.expectedTier === "Tier 0"
    ? "Tier 3"
    : "Tier 0";
  assert.throws(() => parseGameState(staleSubmitted), SaveSchemaError);
});
test("keeps the historical share floor closed across advance and reparse", () => {
  const initial = createInitialGame(5_151);
  const floorSave = structuredClone(initial);
  const weekSnapshotDay = initial.day - 6;
  const weekSnapshot = floorSave.history.find(
    (entry) => entry.day === weekSnapshotDay,
  );
  assert.ok(weekSnapshot);
  const targetId = Object.keys(weekSnapshot.shares).find(
    (themeId) => themeId !== weekSnapshot.topThemeId,
  );
  assert.ok(targetId);
  const transferred = weekSnapshot.shares[targetId] - 0.001;
  weekSnapshot.shares[targetId] = 0.001;
  weekSnapshot.shares[weekSnapshot.topThemeId] += transferred;

  const restored = parseGameState(floorSave);
  const advanced = reduceGame(restored, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(advanced.themes[targetId].previousWeekShare, 0.001);
  parseGameState(advanced);

  const zeroHistory = structuredClone(floorSave);
  const zeroSnapshot = zeroHistory.history.find(
    (entry) => entry.day === weekSnapshotDay,
  )!;
  zeroSnapshot.shares[zeroSnapshot.topThemeId] += 0.001;
  zeroSnapshot.shares[targetId] = 0;
  assert.throws(() => parseGameState(zeroHistory), SaveSchemaError);
});

test("cross-validates applied support waves and rejects a malformed release mix", () => {
  let state = createInitialGame(4802);
  const targetId = state.activeThemeIds[0];
  const content = THEMES.find((theme) => theme.id === targetId)!;

  for (let wave = 1; wave <= 3; wave += 1) {
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: targetId,
      direction: "consistency",
    });
    state = advanceToNextRelease(state);
    while (getReleaseSlateKind(state.releaseSlate!) === "reprint") {
      state = submitThree(state);
      state = advanceToNextRelease(state);
    }
    const requested = state.releaseSlate?.options.find(
      (option) =>
        option.kind === "support" &&
        option.requested &&
        option.themeId === targetId,
    );
    assert.ok(requested);
    state = submitThree(state, [3, 3, 3, 3], true);
    state = advanceWhileRunning(state, 1);
    if (wave < 3) {
      state = advanceWhileRunning(state, 15);
      if (state.phase === "ban-edit") {
        assert.equal(state.day, 40);
        state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
        state = advanceWhileRunning(state, 1);
      }
    }
  }
  parseGameState(jsonRoundTrip(state));

  const mismatchedRuntime = structuredClone(state);
  const runtime = mismatchedRuntime.themes[targetId];
  runtime.supportCount = 2;
  runtime.counterBuild = 2;
  runtime.lastSupportDay = 90;
  runtime.releasedPartIds = content.parts.slice(0, 11).map((part) => part.id);
  for (const part of content.parts.slice(11)) {
    delete runtime.legalLimits[part.id];
    delete runtime.partStats[part.id];
  }
  assert.throws(() => parseGameState(mismatchedRuntime), SaveSchemaError);

  state = advanceToNextRelease(state);
  assert.equal(state.day, 90);
  const forgedFourth = structuredClone(state);
  const otherThemeIds = state.activeThemeIds.filter((id) => id !== targetId).slice(0, 2);
  forgedFourth.releaseHistory.push({
    day: state.day,
    releaseKind: "regular",
    products: [targetId, ...otherThemeIds].map((themeId, index) => ({
      optionId: `forged-support-${index + 1}`,
      kind: "support" as const,
      themeId,
      direction: "consistency" as const,
      expectedTier: "Tier 3" as const,
      powerAdjustment: 0 as const,
    })),
  });
  assert.throws(() => parseGameState(forgedFourth), SaveSchemaError);
});

test("accepts every decision gate through campaign termination", () => {
  let game = createInitialGame(9876);
  let decisions = 0;
  let checkedLatePackOdds = false;
  while (game.phase !== "ended") {
    decisions += 1;
    assert.ok(decisions < 200, "campaign should terminate within its fixed gates");
    if (game.operations.pendingEvent) {
      game = choosePendingBusinessEvent(game);
    } else if (game.phase === "release-edit") {
      game = submitThree(game);
    } else if (game.phase === "ban-edit") {
      game = reduceGame(game, { type: "SUBMIT_BAN", changes: {} });
    } else {
      game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1000 });
    }
    if (game.day === LAST_RELEASE_DAY && game.phase === "running") {
      const forgedLatePackOdds = structuredClone(game);
      const id = `business-action-${forgedLatePackOdds.operations.nextActionId}`;
      forgedLatePackOdds.operations.records.push({
        id,
        type: "pack-odds",
        startedDay: LAST_RELEASE_DAY,
        endsDay: 449,
        cost: 0.1,
        outcome: "pending",
        risk: 0.3,
      });
      forgedLatePackOdds.operations.nextActionId += 1;
      forgedLatePackOdds.finance.cash -= 0.1;
      forgedLatePackOdds.finance.cumulativeExpenses += 0.1;
      assert.throws(
        () => parseGameState(forgedLatePackOdds),
        SaveSchemaError,
      );
      checkedLatePackOdds = true;
    }
    parseGameState(jsonRoundTrip(game));
  }
  assert.equal(checkedLatePackOdds, true);
  assert.ok(
    game.day === CAMPAIGN_END_DAY || getServiceFailureReason(game) !== null,
    "the campaign must end by settlement or a validated service failure",
  );
  assert.ok(
    game.releaseHistory
      .filter((batch) => batch.releaseKind !== "baseline")
      .every((batch) =>
        batch.products.length ===
          (getReleaseBatchKind(batch) === "reprint"
            ? REPRINT_PACK_PRODUCT_COUNT
            : 4)
      ),
  );
  const serialized = JSON.stringify(game);
  assert.ok(Buffer.byteLength(serialized, "utf8") < MAX_SAVE_BYTES);
  const jsonValue = JSON.parse(serialized) as unknown;
  assert.deepEqual(parseGameState(jsonValue), jsonValue);
});

test("round-trips business-action lifecycles and permits net-negative daily cash flow", () => {
  let state = createInitialGame(6201);
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.ok(state.finance.todayOperatingCash < 0);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);
  assert.deepEqual(state.operations.records[0], {
    id: "business-action-1",
    type: "tv-cm",
    startedDay: 7,
    endsDay: 28,
    cost: 0.6,
    outcome: "active",
    risk: state.operations.records[0].risk,
  });
  assert.ok((state.operations.records[0].risk ?? 0) > 0);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "pack-odds",
  });
  assert.equal(state.operations.records[1].outcome, "pending");
  assert.equal(state.operations.records[1].resolvedDay, undefined);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);

  assert.deepEqual(
    {
      outcome: state.operations.records[1].outcome,
      startedDay: state.operations.records[1].startedDay,
      endsDay: state.operations.records[1].endsDay,
    },
    { outcome: "pending", startedDay: 8, endsDay: 39 },
  );

  state = advanceToNextRelease(state);
  assert.equal(state.day, 10);
  assert.equal(state.phase, "release-edit");
  assert.equal(state.operations.records[1].outcome, "pending");
  state = submitThree(state);
  assert.equal(state.operations.records[1].outcome, "active");
  assert.equal(state.operations.records[1].appliedDay, 10);
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "championship",
  });
  assert.equal(state.operations.records[2].outcome, "active");
  assert.equal(state.operations.records[2].risk, undefined);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(["clean", "detected"].includes(state.operations.records[1].outcome));
  assert.equal(state.operations.records[1].resolvedDay, 11);
  assert.ok(["success", "backlash"].includes(state.operations.records[2].outcome));
  assert.equal(state.operations.records[2].resolvedDay, 11);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);
});

test("round-trips strategic risk snapshots and rejects forged project results", () => {
  let organizedPlay = advanceThroughDecisions(createInitialGame(6_204), 90);
  organizedPlay.finance.cash = 100;
  organizedPlay = reduceGame(organizedPlay, {
    type: "RUN_BUSINESS_ACTION",
    action: "organized-play-platform",
  });
  assert.equal(
    organizedPlay.operations.records.at(-1)?.type,
    "organized-play-platform",
  );
  assert.doesNotThrow(() => parseGameState(jsonRoundTrip(organizedPlay)));

  let active = advanceThroughDecisions(createInitialGame(6203), 120);
  active.finance.cash = 100;
  active = reduceGame(active, {
    type: "RUN_BUSINESS_ACTION",
    action: "season-overhaul",
  });
  assert.doesNotThrow(() => parseGameState(jsonRoundTrip(active)));
  assert.ok(active.operations.records.at(-1)?.riskContext);

  const forcedSuccess = structuredClone(active);
  forcedSuccess.operations.records.at(-1)!.risk = 0;
  const success = advanceThroughDecisions(forcedSuccess, 150);
  assert.equal(success.operations.records.at(-1)?.outcome, "success");
  assert.equal(success.operations.records.at(-1)?.cashReturn, 6.5);
  assert.deepEqual(success.operations.season, {
    currentSeasonNumber: 2,
    startedDay: 150,
    boundaries: [{
      seasonNumber: 2,
      startedDay: 150,
      sourceActionId: success.operations.records.at(-1)!.id,
    }],
  });
  assert.doesNotThrow(() => parseGameState(jsonRoundTrip(success)));

  const missingSeason = structuredClone(success) as unknown as {
    operations: { season?: unknown };
  };
  delete missingSeason.operations.season;
  assert.throws(() => parseGameState(jsonRoundTrip(missingSeason)), SaveSchemaError);

  const wrongSeasonNumber = structuredClone(success);
  wrongSeasonNumber.operations.season!.currentSeasonNumber = 3;
  assert.throws(() => parseGameState(wrongSeasonNumber), SaveSchemaError);

  const wrongBoundarySource = structuredClone(success);
  wrongBoundarySource.operations.season!.boundaries[0].sourceActionId =
    "business-action-missing";
  assert.throws(() => parseGameState(wrongBoundarySource), SaveSchemaError);

  const duplicateSource = reduceGame(success, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  duplicateSource.operations.season!.currentSeasonNumber = 3;
  duplicateSource.operations.season!.startedDay = 151;
  duplicateSource.operations.season!.boundaries.push({
    seasonNumber: 3,
    startedDay: 151,
    sourceActionId: duplicateSource.operations.season!.boundaries[0]
      .sourceActionId,
  });
  assert.throws(() => parseGameState(duplicateSource), SaveSchemaError);

  const badCause = structuredClone(success) as unknown as Record<string, unknown>;
  const causeOperations = badCause.operations as {
    records: Array<{ riskContext: { primaryRisk: string } }>;
  };
  causeOperations.records.at(-1)!.riskContext.primaryRisk = "invented";
  assert.throws(() => parseGameState(badCause), SaveSchemaError);

  const badReturn = structuredClone(success);
  badReturn.operations.records.at(-1)!.cashReturn = 99;
  assert.throws(() => parseGameState(badReturn), SaveSchemaError);
});

test("rejects malformed business-action records and finance totals", () => {
  let valid = createFirstBanGame(6202);
  valid = reduceGame(valid, {
    type: "SUBMIT_BAN",
    changes: getPrologueRestrictionChanges(valid),
  });
  valid = reduceGame(valid, { type: "ADVANCE_DAYS", days: 7 });
  valid = reduceGame(valid, { type: "COMPLETE_HANDOVER" });
  valid = reduceGame(valid, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  parseGameState(jsonRoundTrip(valid));

  const badNextId = structuredClone(valid);
  badNextId.operations.nextActionId = 1;
  assert.throws(() => parseGameState(badNextId), SaveSchemaError);

  const badId = structuredClone(valid);
  badId.operations.records[0].id = "business-action-99";
  assert.throws(() => parseGameState(badId), SaveSchemaError);

  const badType = jsonRoundTrip(valid) as {
    operations: { records: Array<Record<string, unknown>> };
  };
  badType.operations.records[0].type = "radio-ad";
  assert.throws(() => parseGameState(badType), SaveSchemaError);

  const duplicate = structuredClone(valid);
  duplicate.operations.records.push({
    ...duplicate.operations.records[0],
    startedDay: 23,
    endsDay: 44,
  });
  duplicate.operations.nextActionId = 3;
  duplicate.finance.cumulativeExpenses = 1.2;
  assert.throws(() => parseGameState(duplicate), SaveSchemaError);

  const futureStart = structuredClone(valid);
  futureStart.operations.records[0].startedDay = valid.day + 1;
  futureStart.operations.records[0].endsDay = valid.day + 22;
  assert.throws(() => parseGameState(futureStart), SaveSchemaError);

  const badDuration = structuredClone(valid);
  badDuration.operations.records[0].endsDay += 1;
  assert.throws(() => parseGameState(badDuration), SaveSchemaError);

  const badCost = structuredClone(valid);
  badCost.operations.records[0].cost = 0.5;
  badCost.finance.cumulativeExpenses = 0.5;
  assert.throws(() => parseGameState(badCost), SaveSchemaError);

  const invalidRisk = structuredClone(valid);
  invalidRisk.operations.records[0].risk = -0.1;
  assert.throws(() => parseGameState(invalidRisk), SaveSchemaError);

  const legacyRiskless = structuredClone(valid);
  delete legacyRiskless.operations.records[0].risk;
  assert.throws(() => parseGameState(jsonRoundTrip(legacyRiskless)), SaveSchemaError);

  for (const retiredType of ["reprint-campaign", "first-print-expansion"]) {
    const retiredAction = jsonRoundTrip(valid) as {
      operations: { records: Array<Record<string, unknown>> };
    };
    retiredAction.operations.records[0].type = retiredType;
    assert.throws(() => parseGameState(retiredAction), SaveSchemaError);
  }

  const resolvedOrdinary = reduceGame(valid, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(
    resolvedOrdinary.operations.records[0].outcome === "success" ||
      resolvedOrdinary.operations.records[0].outcome === "backlash",
  );
  assert.equal(resolvedOrdinary.operations.records[0].resolvedDay, 8);
  assert.deepEqual(
    parseGameState(jsonRoundTrip(resolvedOrdinary)),
    resolvedOrdinary,
  );
  const forgedOrdinaryOutcome = structuredClone(resolvedOrdinary);
  forgedOrdinaryOutcome.operations.records[0].outcome =
    resolvedOrdinary.operations.records[0].outcome === "success"
      ? "backlash"
      : "success";
  assert.throws(
    () => parseGameState(forgedOrdinaryOutcome),
    SaveSchemaError,
  );

  let appliedPackOdds = createInitialGame(6203);
  appliedPackOdds = reduceGame(appliedPackOdds, {
    type: "RUN_BUSINESS_ACTION",
    action: "pack-odds",
  });
  appliedPackOdds = advanceWhileRunning(appliedPackOdds, 100);
  appliedPackOdds = submitThree(appliedPackOdds);
  const forgedOverduePending = structuredClone(appliedPackOdds);
  const forgedPackRecord = forgedOverduePending.operations.records.at(-1)!;
  forgedPackRecord.outcome = "pending";
  delete forgedPackRecord.appliedDay;
  delete forgedPackRecord.resolvedDay;
  assert.throws(
    () => parseGameState(forgedOverduePending),
    SaveSchemaError,
  );

  const futureAppliedDay = structuredClone(valid);
  futureAppliedDay.operations.records[0].appliedDay = valid.day + 1;
  assert.throws(() => parseGameState(futureAppliedDay), SaveSchemaError);

  const badOutcome = structuredClone(valid);
  badOutcome.operations.records[0].outcome = "success";
  assert.throws(() => parseGameState(badOutcome), SaveSchemaError);

  const expenseMismatch = structuredClone(valid);
  expenseMismatch.finance.cumulativeExpenses = 0;
  assert.throws(() => parseGameState(expenseMismatch), SaveSchemaError);

  const negativeCash = structuredClone(valid);
  negativeCash.finance.cash = -0.01;
  assert.throws(() => parseGameState(negativeCash), SaveSchemaError);

  const negativeExpenses = structuredClone(valid);
  negativeExpenses.finance.cumulativeExpenses = -0.01;
  assert.throws(() => parseGameState(negativeExpenses), SaveSchemaError);

  const negativeOperatingCost = structuredClone(valid);
  negativeOperatingCost.finance.todayOperatingCost = -0.01;
  assert.throws(() => parseGameState(negativeOperatingCost), SaveSchemaError);

  const negativeOperatingTotal = structuredClone(valid);
  negativeOperatingTotal.finance.cumulativeOperatingCosts = -0.01;
  assert.throws(() => parseGameState(negativeOperatingTotal), SaveSchemaError);

  const forgedOperatingCost = createInitialGame(6204);
  forgedOperatingCost.finance.todayOperatingCost = 0.01;
  forgedOperatingCost.finance.cumulativeOperatingCosts = 0.01;
  assert.throws(
    () => parseGameState(forgedOperatingCost),
    SaveSchemaError,
  );

  let mismatchedDailyCost = createInitialGame(6205);
  mismatchedDailyCost = reduceGame(mismatchedDailyCost, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  mismatchedDailyCost.finance.todayOperatingCost += 0.01;
  mismatchedDailyCost.finance.cumulativeOperatingCosts += 0.01;
  assert.throws(() => parseGameState(mismatchedDailyCost), SaveSchemaError);

  const totalBelowDaily = structuredClone(mismatchedDailyCost);
  totalBelowDaily.finance.todayOperatingCost = 0.01;
  totalBelowDaily.finance.cumulativeOperatingCosts = 0;
  assert.throws(() => parseGameState(totalBelowDaily), SaveSchemaError);
});

test("rejects legacy v2, extra fields, active-theme mismatches, and invalid runtime values", () => {
  const initial = createInitialGame(44);

  const oldVersion = jsonRoundTrip(initial) as Record<string, unknown>;
  oldVersion.schemaVersion = 2;
  assert.throws(
    () => parseGameState(oldVersion),
    (error: unknown) =>
      error instanceof SaveSchemaError && /schemaVersion/.test(error.message),
  );

  const extra = jsonRoundTrip(initial) as Record<string, unknown>;
  extra.savePath = "C:\\outside\\save.json";
  assert.throws(() => parseGameState(extra), SaveSchemaError);

  const duplicateActive = structuredClone(initial);
  duplicateActive.activeThemeIds[1] = duplicateActive.activeThemeIds[0];
  assert.throws(() => parseGameState(duplicateActive), SaveSchemaError);

  const tooFewActive = structuredClone(initial);
  const removedId = tooFewActive.activeThemeIds.pop()!;
  delete tooFewActive.themes[removedId];
  assert.throws(() => parseGameState(tooFewActive), SaveSchemaError);

  const extraThemeRuntime = jsonRoundTrip(initial) as GameState;
  extraThemeRuntime.themes["future-001"] = extraThemeRuntime.themes.cycle;
  assert.throws(() => parseGameState(extraThemeRuntime), SaveSchemaError);

  const missingThemeRuntime = structuredClone(initial);
  delete missingThemeRuntime.themes[missingThemeRuntime.activeThemeIds[0]];
  assert.throws(() => parseGameState(missingThemeRuntime), SaveSchemaError);

  const zeroRuntimeShare = structuredClone(initial);
  const [zeroShareId, recipientId] = zeroRuntimeShare.activeThemeIds;
  const transferredShare = zeroRuntimeShare.themes[zeroShareId].share;
  zeroRuntimeShare.themes[zeroShareId].share = 0;
  zeroRuntimeShare.themes[recipientId].share += transferredShare;
  assert.throws(() => parseGameState(zeroRuntimeShare), SaveSchemaError);

  const unearnedActiveTheme = structuredClone(initial);
  const inactiveContent = THEMES.find(
    (theme) => !unearnedActiveTheme.activeThemeIds.includes(theme.id),
  )!;
  const sourceRuntime = unearnedActiveTheme.themes.cycle;
  const sourceContent = THEMES.find((theme) => theme.id === "cycle")!;
  const sourcePartIndexes = sourceRuntime.releasedPartIds.map((partId) =>
    sourceContent.parts.findIndex((part) => part.id === partId),
  );
  const releasedParts = sourcePartIndexes.map(
    (partIndex) => inactiveContent.parts[partIndex],
  );
  for (const themeId of unearnedActiveTheme.activeThemeIds) {
    unearnedActiveTheme.themes[themeId].share *= 0.99;
  }
  unearnedActiveTheme.activeThemeIds.push(inactiveContent.id);
  unearnedActiveTheme.themes[inactiveContent.id] = {
    ...structuredClone(sourceRuntime),
    share: 0.01,
    previousWeekShare: 0.01,
    power: inactiveContent.basePower,
    unpleasantness: inactiveContent.baseUnpleasantness,
    legalLimits: Object.fromEntries(releasedParts.map((part) => [part.id, 3])),
    partStats: Object.fromEntries(
      releasedParts.map((part, index) => [
        part.id,
        structuredClone(sourceRuntime.partStats[sourceRuntime.releasedPartIds[index]]),
      ]),
    ),
    lastSupportDay: null,
    freshness: 0,
    releasedPartIds: releasedParts.map((part) => part.id),
  };
  assert.throws(
    () => parseGameState(unearnedActiveTheme),
    (error: unknown) =>
      error instanceof SaveSchemaError && /activeThemeIds/.test(error.message),
  );

  const invalidLimit = structuredClone(initial);
  const cycleLimits = invalidLimit.themes.cycle.legalLimits as Record<
    string,
    number
  >;
  cycleLimits["cycle-gate"] = 4;
  assert.equal(isGameState(invalidLimit), false);

  const invalidNumber = structuredClone(initial);
  invalidNumber.finance.today = Number.POSITIVE_INFINITY;
  assert.throws(() => parseGameState(invalidNumber), SaveSchemaError);

  const invalidPoolOrder = structuredClone(initial);
  invalidPoolOrder.themes.cycle.releasedPartIds.reverse();
  assert.throws(() => parseGameState(invalidPoolOrder), SaveSchemaError);

  const unreleasedLimit = structuredClone(initial);
  const unreleasedPartId = THEMES.find((theme) => theme.id === "cycle")!.parts[5].id;
  unreleasedLimit.themes.cycle.legalLimits[unreleasedPartId] = 3;
  assert.throws(() => parseGameState(unreleasedLimit), SaveSchemaError);

});

test("rejects invalid support cooldowns, slate options, and request links", () => {
  const requested = reduceGame(createInitialGame(451), {
    type: "PROPOSE_SUPPORT",
    themeId: "cycle",
    direction: "counterplay",
  });
  parseGameState(jsonRoundTrip(requested));

  const badCooldown = structuredClone(requested);
  badCooldown.supportRequests.push({
    ...badCooldown.supportRequests[0],
    id: "support-request-2",
  });
  badCooldown.nextSupportRequestId = 3;
  assert.throws(() => parseGameState(badCooldown), SaveSchemaError);

  const badEligibleDay = structuredClone(requested);
  badEligibleDay.supportRequests[0].eligibleReleaseDay = 90;
  assert.throws(() => parseGameState(badEligibleDay), SaveSchemaError);

  const badLastProposalDay = structuredClone(requested);
  badLastProposalDay.lastSupportProposalDay = null;
  assert.throws(() => parseGameState(badLastProposalDay), SaveSchemaError);

  const atRelease = reachFirstRelease(452, true);
  parseGameState(jsonRoundTrip(atRelease));

  const tooFewOptions = structuredClone(atRelease);
  tooFewOptions.releaseSlate!.options = tooFewOptions.releaseSlate!.options.slice(0, 2);
  assert.throws(() => parseGameState(tooFewOptions), SaveSchemaError);

  const wrongTier = structuredClone(atRelease);
  const supportOption = wrongTier.releaseSlate!.options.find(
    (option) => option.kind === "support",
  );
  assert.ok(supportOption);
  supportOption.expectedTier = supportOption.expectedTier === "Tier 0"
    ? "Tier 3"
    : "Tier 0";
  assert.throws(() => parseGameState(wrongTier), SaveSchemaError);

  const requestedOptionIndex = atRelease.releaseSlate!.options.findIndex(
    (option) => option.kind === "support" && option.requested,
  );
  assert.ok(requestedOptionIndex >= 0);
  const brokenRequestLink = structuredClone(atRelease);
  const brokenRequestedOption = brokenRequestLink.releaseSlate!.options[
    requestedOptionIndex
  ];
  assert.equal(brokenRequestedOption.kind, "support");
  if (brokenRequestedOption.kind === "support") {
    brokenRequestedOption.requestId = "support-request-missing";
  }
  assert.throws(() => parseGameState(brokenRequestLink), SaveSchemaError);

  const slateOutsideReleaseEdit = structuredClone(atRelease);
  slateOutsideReleaseEdit.phase = "running";
  assert.throws(() => parseGameState(slateOutsideReleaseEdit), SaveSchemaError);
});

test("rejects malformed release batches and historical share maps", () => {
  const released = submitThree(reachFirstRelease(9901, true), [-3, 0, 3], true);
  parseGameState(jsonRoundTrip(released));

  const shortBatch = structuredClone(released);
  shortBatch.releaseHistory[0].products.pop();
  assert.throws(() => parseGameState(shortBatch), SaveSchemaError);

  const invalidAdjustment = structuredClone(released);
  invalidAdjustment.releaseHistory[0].products[0].powerAdjustment =
    4 as PowerAdjustment;
  assert.throws(() => parseGameState(invalidAdjustment), SaveSchemaError);

  const requestedBatchIndex = released.releaseHistory.length - 1;
  const requestedProductIndex = released.releaseHistory[
    requestedBatchIndex
  ].products.findIndex(
    (product) => product.kind === "support" && product.requestId,
  );
  assert.ok(requestedProductIndex >= 0);
  const brokenReleasedRequest = structuredClone(released);
  const brokenRequestedProduct = brokenReleasedRequest.releaseHistory[
    requestedBatchIndex
  ].products[
    requestedProductIndex
  ];
  assert.equal(brokenRequestedProduct.kind, "support");
  if (brokenRequestedProduct.kind === "support") {
    brokenRequestedProduct.requestId = "support-request-missing";
  }
  assert.throws(() => parseGameState(brokenReleasedRequest), SaveSchemaError);

  const invalidHistoryTotal = structuredClone(released);
  const firstShares = invalidHistoryTotal.history[0].shares;
  firstShares[Object.keys(firstShares)[0]] *= 0.5;
  assert.throws(() => parseGameState(invalidHistoryTotal), SaveSchemaError);

  const unknownHistoricalTheme = jsonRoundTrip(released) as GameState;
  (unknownHistoricalTheme.history[0].shares as Record<string, number>).injected = 0;
  assert.throws(() => parseGameState(unknownHistoricalTheme), SaveSchemaError);

  const invalidHistoricalWinRate = jsonRoundTrip(released) as GameState;
  const winRateThemeId = Object.keys(
    invalidHistoricalWinRate.history[0].winRates!,
  )[0];
  invalidHistoricalWinRate.history[0].winRates![winRateThemeId] = 1.01;
  assert.throws(() => parseGameState(invalidHistoricalWinRate), SaveSchemaError);

  const unknownHistoricalWinRate = jsonRoundTrip(released) as GameState;
  (unknownHistoricalWinRate.history[0].winRates as Record<string, number>)
    .injected = 0.5;
  assert.throws(() => parseGameState(unknownHistoricalWinRate), SaveSchemaError);

  const missingHistoricalWinRate = jsonRoundTrip(released) as GameState;
  delete missingHistoricalWinRate.history[0].winRates![winRateThemeId];
  assert.throws(() => parseGameState(missingHistoricalWinRate), SaveSchemaError);

  const legacyHistoryWithoutWinRates = jsonRoundTrip(released) as GameState;
  for (const snapshot of legacyHistoryWithoutWinRates.history) {
    delete snapshot.winRates;
  }
  parseGameState(legacyHistoryWithoutWinRates);

  const placementEntry = released.history[0];
  const placementIds = Object.keys(placementEntry.topCutPlacements!);
  assert.ok(placementIds.length >= 2);

  const invalidPlacementTotal = structuredClone(released);
  invalidPlacementTotal.history[0].topCutPlacements![placementIds[0]] += 1;
  assert.throws(() => parseGameState(invalidPlacementTotal), SaveSchemaError);

  const negativePlacement = structuredClone(released);
  negativePlacement.history[0].topCutPlacements![placementIds[0]] = -1;
  assert.throws(() => parseGameState(negativePlacement), SaveSchemaError);

  const fractionalPlacement = structuredClone(released);
  fractionalPlacement.history[0].topCutPlacements![placementIds[0]] = 0.5;
  assert.throws(() => parseGameState(fractionalPlacement), SaveSchemaError);

  const missingPlacement = structuredClone(released);
  delete missingPlacement.history[0].topCutPlacements![placementIds[0]];
  assert.throws(() => parseGameState(missingPlacement), SaveSchemaError);

  const unknownPlacement = jsonRoundTrip(released) as GameState;
  (unknownPlacement.history[0].topCutPlacements as Record<string, number>)
    .injected = 0;
  assert.throws(() => parseGameState(unknownPlacement), SaveSchemaError);

  const impossibleHealth = jsonRoundTrip(released) as GameState;
  impossibleHealth.history[0].environmentHealth = 101;
  assert.throws(() => parseGameState(impossibleHealth), SaveSchemaError);

  const unknownHealthModel = jsonRoundTrip(released) as GameState;
  (unknownHealthModel.history[0] as unknown as {
    environmentHealthModel: string;
  }).environmentHealthModel = "invented-model";
  assert.throws(() => parseGameState(unknownHealthModel), SaveSchemaError);

  const modelWithoutHealth = jsonRoundTrip(released) as GameState;
  delete modelWithoutHealth.history[0].environmentHealth;
  assert.throws(() => parseGameState(modelWithoutHealth), SaveSchemaError);

  const impossibleTrust = jsonRoundTrip(released) as GameState;
  impossibleTrust.history[0].purchaseTrust = -1;
  assert.throws(() => parseGameState(impossibleTrust), SaveSchemaError);

  const impossibleSentiment = jsonRoundTrip(released) as GameState;
  impossibleSentiment.history[0].communitySentiment = 101;
  assert.throws(() => parseGameState(impossibleSentiment), SaveSchemaError);

  const impossibleSentimentCounts = jsonRoundTrip(released) as GameState;
  impossibleSentimentCounts.history[0].communityPositive = 14;
  impossibleSentimentCounts.history[0].communityNegative = 7;
  assert.throws(
    () => parseGameState(impossibleSentimentCounts),
    SaveSchemaError,
  );
});

test("rejects cross-theme parts and impossible decision phases", () => {
  const initial = createInitialGame(91);
  const wrongPart = structuredClone(initial);
  const event = wrongPart.community[0];
  const foreignTheme = THEMES.find((theme) => theme.id !== event.themeId);
  assert.ok(foreignTheme);
  event.partId = foreignTheme.parts[0].id;
  assert.throws(() => parseGameState(wrongPart), SaveSchemaError);

  const wrongBanPhase = structuredClone(initial);
  wrongBanPhase.phase = "ban-edit";
  assert.throws(() => parseGameState(wrongBanPhase), SaveSchemaError);

  const wrongReleasePhase = structuredClone(initial);
  wrongReleasePhase.phase = "release-edit";
  assert.throws(() => parseGameState(wrongReleasePhase), SaveSchemaError);
});
