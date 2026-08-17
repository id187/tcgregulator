import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  CAMPAIGN_END_DAY,
  LAST_RELEASE_DAY,
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
  createInitialGame,
  getExpectedTier,
  getNewThemeExpectedPower,
  getNewThemeLaunchPower,
  getPrologueReleaseSelections,
  getPrologueRestrictionChanges,
  reduceGame,
} from "../app/game/engine.ts";
import {
  MAX_SAVE_BYTES,
  SaveSchemaError,
  isGameState,
  parseGameState,
} from "../app/game/save-schema.ts";
import {
  CURRENT_FUTURE_PART_ID_MAP,
  CURRENT_FUTURE_THEME_ID_MAP,
} from "../app/game/future-theme-id-migration.ts";
import type {
  GameState,
  PowerAdjustment,
  ReleaseSelection,
} from "../app/game/types.ts";

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function asLegacyFutureIdentifiers(value: unknown): unknown {
  if (typeof value === "string") {
    return (
      CURRENT_FUTURE_THEME_ID_MAP[value] ??
      CURRENT_FUTURE_PART_ID_MAP[value] ??
      value
    );
  }
  if (Array.isArray(value)) return value.map(asLegacyFutureIdentifiers);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      (CURRENT_FUTURE_THEME_ID_MAP[key] ??
        CURRENT_FUTURE_PART_ID_MAP[key] ??
        key),
      asLegacyFutureIdentifiers(item),
    ]),
  );
}

function asLegacyV3(state: GameState): Record<string, unknown> {
  const legacy = jsonRoundTrip(state) as Record<string, unknown>;
  legacy.schemaVersion = 3;
  delete legacy.operations;
  const finance = legacy.finance as Record<string, unknown>;
  delete finance.cash;
  delete finance.todayOperatingCash;
  delete finance.todayOperatingCost;
  delete finance.cumulativeOperatingCosts;
  delete finance.cumulativeExpenses;
  return legacy;
}

function asLegacyV4(state: GameState): Record<string, unknown> {
  const legacy = jsonRoundTrip(state) as Record<string, unknown>;
  legacy.schemaVersion = 4;
  stripBusinessEventState(legacy);
  const finance = legacy.finance as Record<string, unknown>;
  delete finance.todayOperatingCost;
  delete finance.cumulativeOperatingCosts;
  return legacy;
}

function asLegacyV5(state: GameState): Record<string, unknown> {
  const legacy = jsonRoundTrip(state) as Record<string, unknown>;
  legacy.schemaVersion = 5;
  stripBusinessEventState(legacy);
  return legacy;
}

function asLegacyV6(state: GameState): Record<string, unknown> {
  const legacy = jsonRoundTrip(state) as Record<string, unknown>;
  legacy.schemaVersion = 6;
  stripBusinessEventState(legacy);
  return legacy;
}

function stripBusinessEventState(state: Record<string, unknown>): void {
  const operations = state.operations as Record<string, unknown>;
  const eventRecords = operations.eventRecords as
    | Array<{ cost: number }>
    | undefined;
  const finance = state.finance as Record<string, number>;
  if (eventRecords && typeof finance.cumulativeExpenses === "number") {
    finance.cumulativeExpenses = round4(
      finance.cumulativeExpenses -
        eventRecords.reduce((total, record) => total + record.cost, 0),
    );
  }
  delete operations.nextEventId;
  delete operations.nextEventDay;
  delete operations.pendingEvent;
  delete operations.eventRecords;
  delete operations.strategy;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

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
  state = advanceWhileRunning(state, 100);
  assert.equal(state.day, 60);
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  return state;
}

function submitThree(
  state: GameState,
  adjustments: PowerAdjustment[] = [0, 0, 0],
  includeRequested = false,
): GameState {
  assert.ok(state.releaseSlate);
  const requested = state.releaseSlate.options.find((option) => option.requested);
  const ordered = includeRequested && requested
    ? [requested, ...state.releaseSlate.options.filter((option) => option !== requested)]
    : state.releaseSlate.options;
  const selections: ReleaseSelection[] = ordered.slice(0, 3).map((option, index) => ({
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

function reachFormerCampaignEnd(seed: number): GameState {
  let state = createInitialGame(seed);
  while (state.day < 419) {
    if (state.operations.pendingEvent) {
      state = choosePendingBusinessEvent(state);
    } else if (state.phase === "release-edit") {
      state = submitThree(state);
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
    } else {
      state = reduceGame(state, {
        type: "ADVANCE_DAYS",
        days: 419 - state.day,
      });
    }
  }
  assert.equal(state.day, 419);
  assert.equal(state.phase, "running");
  return state;
}

test("accepts schema v7 saves and preserves deterministic continuation", () => {
  const initial = createInitialGame(7301);
  const restored = parseGameState(jsonRoundTrip(initial));
  assert.equal(restored.schemaVersion, 7);
  assert.deepEqual(restored, initial);
  assert.ok(Buffer.byteLength(JSON.stringify(restored), "utf8") < MAX_SAVE_BYTES);

  let originalAtGate = createCampaignStart(7301);
  originalAtGate = reduceGame(originalAtGate, {
    type: "ADVANCE_DAYS",
    days: 29,
  });
  originalAtGate = submitThree(originalAtGate);
  originalAtGate = reduceGame(originalAtGate, {
    type: "ADVANCE_DAYS",
    days: 15,
  });
  const restoredAtGate = parseGameState(jsonRoundTrip(originalAtGate));
  assert.equal(restoredAtGate.day, 45);
  assert.equal(restoredAtGate.phase, "ban-edit");

  const command = {
    type: "SUBMIT_BAN" as const,
    changes: { "cycle-gate": 1 as const },
  };
  const uninterrupted = reduceGame(originalAtGate, command);
  const continued = reduceGame(restoredAtGate, command);
  assert.deepEqual(continued, uninterrupted);
  parseGameState(continued);
});

test("deep-migrates v0.1.5 future theme and part IDs in schema v3-v7 saves", () => {
  let current = advanceThroughDecisions(createInitialGame(7319), 61);
  const futureThemeId = current.activeThemeIds.find((id) =>
    id.startsWith("future-"),
  );
  assert.ok(futureThemeId);
  current = reduceGame(current, {
    type: "PROPOSE_SUPPORT",
    themeId: futureThemeId,
    direction: "recovery",
  });
  current = advanceWhileRunning(current, 100);
  assert.equal(current.phase, "release-edit");
  assert.ok(
    current.releaseSlate?.options.some(
      (option) => option.themeId === futureThemeId && option.requested,
    ),
  );

  const legacyThemeId = CURRENT_FUTURE_THEME_ID_MAP[futureThemeId];
  assert.ok(legacyThemeId);
  const legacyPartId = CURRENT_FUTURE_PART_ID_MAP[
    current.themes[futureThemeId].releasedPartIds[0]
  ];
  assert.ok(legacyPartId);

  const legacyFactories: ReadonlyArray<{
    version: 3 | 4 | 5 | 6 | 7;
    make: (state: GameState) => unknown;
  }> = [
    { version: 3, make: asLegacyV3 },
    { version: 4, make: asLegacyV4 },
    { version: 5, make: asLegacyV5 },
    { version: 6, make: asLegacyV6 },
    { version: 7, make: jsonRoundTrip },
  ];

  for (const { version, make } of legacyFactories) {
    const legacy = asLegacyFutureIdentifiers(make(current));
    const untouched = structuredClone(legacy);
    const serializedLegacy = JSON.stringify(legacy);
    assert.match(serializedLegacy, new RegExp(legacyThemeId));
    assert.match(serializedLegacy, new RegExp(legacyPartId));

    const migrated = parseGameState(legacy);
    assert.equal(migrated.schemaVersion, 7, `schema v${version}`);
    assert.ok(migrated.activeThemeIds.includes(futureThemeId));
    assert.equal(migrated.themes[legacyThemeId], undefined);
    assert.deepEqual(
      migrated.themes[futureThemeId].releasedPartIds,
      current.themes[futureThemeId].releasedPartIds,
    );
    assert.deepEqual(
      migrated.themes[futureThemeId].legalLimits,
      current.themes[futureThemeId].legalLimits,
    );
    assert.deepEqual(
      migrated.themes[futureThemeId].partStats,
      current.themes[futureThemeId].partStats,
    );
    assert.ok(
      migrated.releaseHistory.some((batch) =>
        batch.products.some((product) => product.themeId === futureThemeId),
      ),
    );
    assert.ok(
      migrated.history.some(
        (entry) => entry.shares[futureThemeId] !== undefined,
      ),
    );
    assert.ok(
      migrated.supportRequests.some(
        (request) => request.themeId === futureThemeId,
      ),
    );
    assert.equal(JSON.stringify(migrated).includes(legacyThemeId), false);
    assert.equal(JSON.stringify(migrated).includes(legacyPartId), false);
    assert.deepEqual(legacy, untouched, "migration must not mutate its input");
    if (version === 7) assert.deepEqual(migrated, current);
  }
});

test("rejects legacy/current future-ID key collisions instead of losing data", () => {
  const current = advanceThroughDecisions(createInitialGame(7320), 61);
  const futureThemeId = current.activeThemeIds.find((id) =>
    id.startsWith("future-"),
  );
  assert.ok(futureThemeId);
  const legacyThemeId = CURRENT_FUTURE_THEME_ID_MAP[futureThemeId];
  assert.ok(legacyThemeId);

  const collision = jsonRoundTrip(current) as GameState;
  collision.themes[legacyThemeId] = structuredClone(
    collision.themes[futureThemeId],
  );
  assert.throws(
    () => parseGameState(collision),
    (error: unknown) =>
      error instanceof SaveSchemaError && /colliding/.test(error.message),
  );
});

test("migrates strict schema v3 saves to v7 finance and event state", () => {
  let source = createCampaignStart(7302);
  source = reduceGame(source, { type: "ADVANCE_DAYS", days: 9 });
  const legacy = asLegacyV3(source);
  const untouched = structuredClone(legacy);
  const legacyFinance = legacy.finance as Record<string, number>;

  const migrated = parseGameState(legacy);
  assert.equal(isGameState(legacy), false);
  assert.equal(isGameState(migrated), true);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(
    migrated.finance.cash,
    round4(2.5 + legacyFinance.cumulative * 0.32),
  );
  assert.equal(
    migrated.finance.todayOperatingCash,
    round4(legacyFinance.today * 0.32),
  );
  assert.equal(migrated.finance.todayOperatingCost, 0);
  assert.equal(migrated.finance.cumulativeOperatingCosts, 0);
  assert.equal(migrated.finance.cumulativeExpenses, 0);
  assert.equal(migrated.operations.nextActionId, 1);
  assert.deepEqual(migrated.operations.records, []);
  assert.equal(migrated.operations.nextEventId, 1);
  assert.ok(migrated.operations.nextEventDay! > migrated.day);
  assert.equal(migrated.operations.pendingEvent, null);
  assert.deepEqual(migrated.operations.eventRecords, []);
  assert.deepEqual(migrated.operations.strategy, {
    audience: 0,
    product: 0,
    posture: 0,
  });
  assert.deepEqual(legacy, untouched, "migration must not mutate its input");
  assert.deepEqual(
    parseGameState(jsonRoundTrip(migrated)),
    migrated,
    "a migrated save must round-trip as schema v7",
  );

  const extraLegacyField = structuredClone(legacy);
  extraLegacyField.operations = { nextActionId: 1, records: [] };
  assert.throws(() => parseGameState(extraLegacyField), SaveSchemaError);
});

test("migrates schema v4 saves without retroactively charging operating costs", () => {
  let source = createInitialGame(7303);
  source = reduceGame(source, { type: "ADVANCE_DAYS", days: 4 });
  const legacy = asLegacyV4(source);
  const untouched = structuredClone(legacy);
  const legacyCash = (legacy.finance as Record<string, number>).cash;

  const migrated = parseGameState(legacy);

  assert.equal(isGameState(legacy), false);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.finance.cash, legacyCash);
  assert.equal(migrated.finance.todayOperatingCost, 0);
  assert.equal(migrated.finance.cumulativeOperatingCosts, 0);
  assert.deepEqual(legacy, untouched, "migration must not mutate its input");
  assert.deepEqual(parseGameState(jsonRoundTrip(migrated)), migrated);
});

test("migrates strict schema v6 saves to neutral business-event state", () => {
  const source = createInitialGame(7305);
  const legacy = asLegacyV6(source);
  const untouched = structuredClone(legacy);

  const migrated = parseGameState(legacy);

  assert.equal(isGameState(legacy), false);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.operations.nextActionId, source.operations.nextActionId);
  assert.deepEqual(migrated.operations.records, source.operations.records);
  assert.equal(migrated.operations.nextEventId, 1);
  assert.ok(migrated.operations.nextEventDay! > migrated.day);
  assert.equal(migrated.operations.pendingEvent, null);
  assert.deepEqual(migrated.operations.eventRecords, []);
  assert.deepEqual(migrated.operations.strategy, {
    audience: 0,
    product: 0,
    posture: 0,
  });
  assert.deepEqual(legacy, untouched, "migration must not mutate its input");
  assert.deepEqual(parseGameState(jsonRoundTrip(migrated)), migrated);
});

test("round-trips pending, chosen, and resolved business events", () => {
  let pending = createInitialGame(7310);
  pending = reduceGame(pending, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(pending.phase, "running");
  assert.ok(pending.operations.pendingEvent);
  assert.equal(pending.operations.nextEventDay, null);
  assert.deepEqual(parseGameState(jsonRoundTrip(pending)), pending);

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
  assert.deepEqual(parseGameState(jsonRoundTrip(chosen)), chosen);

  const resolved = advanceThroughDecisions(chosen, chosenRecord.resolutionDay);
  const resolvedRecord = resolved.operations.eventRecords[0];
  assert.ok(["success", "backlash"].includes(resolvedRecord.outcome));
  assert.equal(resolvedRecord.resolvedDay, chosenRecord.resolutionDay);
  assert.deepEqual(parseGameState(jsonRoundTrip(resolved)), resolved);
});

test("rejects forged business-event definitions, outcomes, and strategy", () => {
  type MutableEventSnapshot = {
    finance: Record<string, number>;
    operations: {
      pendingEvent: Record<string, unknown> | null;
      eventRecords: Array<Record<string, unknown>>;
      strategy: Record<string, unknown>;
    };
  };

  let pending = createInitialGame(7311);
  pending = reduceGame(pending, { type: "ADVANCE_DAYS", days: 100 });
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

  const badStrategy = jsonRoundTrip(chosen) as MutableEventSnapshot;
  badStrategy.operations.strategy.audience =
    (badStrategy.operations.strategy.audience as number) + 1;
  assert.throws(() => parseGameState(badStrategy), SaveSchemaError);
});

test("migrates schema v5 and reopens former DAY 419 endings for v3-v5", () => {
  const source = reachFormerCampaignEnd(7304);
  const legacyFactories = [asLegacyV3, asLegacyV4, asLegacyV5] as const;

  for (const [index, makeLegacy] of legacyFactories.entries()) {
    const legacy = makeLegacy(source);
    legacy.phase = "ended";
    const untouched = structuredClone(legacy);

    const migrated = parseGameState(legacy);
    assert.equal(migrated.schemaVersion, 7);
    assert.equal(migrated.day, 419);
    assert.equal(migrated.phase, "running");
    assert.deepEqual(legacy, untouched, "migration must not mutate its input");

    const atNextRelease = reduceGame(migrated, {
      type: "ADVANCE_DAYS",
      days: 1,
    });
    assert.equal(atNextRelease.day, 420);
    assert.equal(atNextRelease.phase, "release-edit");

    const collapsedLegacy = makeLegacy(source);
    collapsedLegacy.phase = "ended";
    collapsedLegacy.users = { tier: 0, casual: 0, collector: 0 };
    const collapsedFinance = collapsedLegacy.finance as Record<string, unknown>;
    if ("todayOperatingCost" in collapsedFinance) {
      collapsedFinance.todayOperatingCost = 0;
    }
    const collapsed = parseGameState(collapsedLegacy);
    assert.equal(collapsed.schemaVersion, 7, `legacy index ${index}`);
    assert.equal(collapsed.day, 419);
    assert.equal(collapsed.phase, "ended");
  }
});

test("round-trips every guided prologue gate without tutorial-only save data", () => {
  let state = parseGameState(jsonRoundTrip(createCampaignStart(1000)));
  assert.equal(state.day, 1);
  assert.equal(state.phase, "running");

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, 15);

  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.operations.records[0].id, "business-action-1");
  assert.equal(state.operations.records[0].outcome, "active");

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, 30);
  assert.equal(state.phase, "release-edit");
  const selections = getPrologueReleaseSelections(state);

  state = reduceGame(state, { type: "SUBMIT_RELEASE", selections });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, 30);
  assert.equal(state.phase, "running");

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  state = parseGameState(jsonRoundTrip(state));
  assert.equal(state.day, 45);
  assert.equal(state.phase, "ban-edit");
  const changes = getPrologueRestrictionChanges(state);

  state = reduceGame(state, { type: "SUBMIT_BAN", changes });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  state = reduceGame(state, { type: "COMPLETE_HANDOVER" });
  state = parseGameState(jsonRoundTrip(state));
  assert.deepEqual(state, createInitialGame(1000));
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
  assert.equal(restoredAtRelease.releaseSlate?.options.length, 6);
  assert.equal(restoredAtRelease.supportRequests[0].status, "offered");

  const requested = restoredAtRelease.releaseSlate?.options.find(
    (option) => option.requested,
  );
  assert.ok(requested?.requestId);
  const selections: ReleaseSelection[] = [
    { optionId: requested.id, powerAdjustment: -3 },
    ...restoredAtRelease.releaseSlate!.options
      .filter((option) => option.id !== requested.id)
      .slice(0, 2)
      .map((option, index) => ({
        optionId: option.id,
        powerAdjustment: (index === 0 ? 0 : 3) as PowerAdjustment,
      })),
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
  assert.equal(continued.releaseHistory[1].products.length, 3);
  assert.equal(continued.supportRequests[0].status, "released");
  assert.equal(continued.supportRequests[0].releasedDay, 60);

  const historicalWidths = continued.history.map(
    (entry) => Object.keys(entry.shares).length,
  );
  assert.equal(historicalWidths[0], 5);
  assert.ok(historicalWidths.at(-1)! > historicalWidths[0]);
  parseGameState(jsonRoundTrip(continued));
});

test("normalizes stale schema-v7 new-theme forecasts and same-day products", () => {
  const atRelease = reachFirstRelease(8_124);
  assert.ok(atRelease.releaseSlate);
  const newOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "new-theme",
  );
  assert.ok(newOption);
  const content = THEMES.find((theme) => theme.id === newOption.themeId);
  assert.ok(content);
  const expectedPower = getNewThemeExpectedPower(content, atRelease.day);
  assert.ok(expectedPower > content.basePower);

  const staleReleaseEdit = structuredClone(atRelease);
  const staleOption = staleReleaseEdit.releaseSlate!.options.find(
    (option) => option.id === newOption.id,
  );
  assert.ok(staleOption);
  staleOption.expectedPower = content.basePower;
  staleOption.expectedTier = getExpectedTier(content.basePower);
  const restoredReleaseEdit = parseGameState(staleReleaseEdit);
  const normalizedOption = restoredReleaseEdit.releaseSlate!.options.find(
    (option) => option.id === newOption.id,
  );
  assert.equal(normalizedOption?.expectedPower, expectedPower);
  assert.equal(normalizedOption?.expectedTier, getExpectedTier(expectedPower));

  const selections = restoredReleaseEdit.releaseSlate!.options
    .slice(0, 3)
    .map((option) => ({
      optionId: option.id,
      powerAdjustment: 0 as const,
    }));
  const submitted = reduceGame(restoredReleaseEdit, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  const expectedLaunchPower = getNewThemeLaunchPower(
    content,
    0,
    submitted.day,
  );
  const submittedProduct = submitted.releaseHistory.at(-1)!.products.find(
    (product) => product.optionId === newOption.id,
  );
  assert.equal(
    submittedProduct?.expectedTier,
    getExpectedTier(expectedLaunchPower),
  );

  const staleSubmitted = structuredClone(submitted);
  const staleProduct = staleSubmitted.releaseHistory.at(-1)!.products.find(
    (product) => product.optionId === newOption.id,
  );
  assert.ok(staleProduct);
  staleProduct.expectedTier = staleProduct.expectedTier === "Tier 0"
    ? "Tier 3"
    : "Tier 0";
  const restoredSubmitted = parseGameState(staleSubmitted);
  assert.equal(
    restoredSubmitted.releaseHistory.at(-1)!.products.find(
      (product) => product.optionId === newOption.id,
    )?.expectedTier,
    getExpectedTier(expectedLaunchPower),
  );

  const observed = reduceGame(restoredSubmitted, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(observed.themes[newOption.themeId].power, expectedLaunchPower);
  parseGameState(observed);
});

test("keeps the historical share floor closed across advance and reparse", () => {
  const initial = createInitialGame(5_151);
  const floorSave = structuredClone(initial);
  const weekSnapshot = floorSave.history.find((entry) => entry.day === 40);
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
  const zeroSnapshot = zeroHistory.history.find((entry) => entry.day === 40)!;
  zeroSnapshot.shares[zeroSnapshot.topThemeId] += 0.001;
  zeroSnapshot.shares[targetId] = 0;
  assert.throws(() => parseGameState(zeroHistory), SaveSchemaError);
});

test("cross-validates applied support waves and rejects a forged fourth product", () => {
  let state = createInitialGame(4802);
  const targetId = state.activeThemeIds[0];
  const content = THEMES.find((theme) => theme.id === targetId)!;

  for (let wave = 1; wave <= 3; wave += 1) {
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: targetId,
      direction: "consistency",
    });
    state = advanceWhileRunning(state, 100);
    const requested = state.releaseSlate?.options.find(
      (option) => option.requested && option.themeId === targetId,
    );
    assert.ok(requested);
    const selected = [
      requested,
      ...state.releaseSlate!.options.filter((option) => option.id !== requested.id),
    ].slice(0, 3);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option) => ({
        optionId: option.id,
        powerAdjustment: 3,
      })),
    });
    state = advanceWhileRunning(state, 1);
    if (wave < 3) {
      state = advanceWhileRunning(state, 15);
      if (state.phase === "ban-edit") {
        assert.equal(state.day, 105);
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

  state = advanceWhileRunning(state, 100);
  assert.equal(state.day, 150);
  const forgedFourth = structuredClone(state);
  const otherThemeIds = state.activeThemeIds.filter((id) => id !== targetId).slice(0, 2);
  forgedFourth.releaseHistory.push({
    day: 150,
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
  assert.equal(game.day, CAMPAIGN_END_DAY);
  assert.ok(game.releaseHistory.every((batch) => batch.products.length === 3));
  const serialized = JSON.stringify(game);
  assert.ok(Buffer.byteLength(serialized, "utf8") < MAX_SAVE_BYTES);
  const jsonValue = JSON.parse(serialized) as unknown;
  assert.deepEqual(parseGameState(jsonValue), jsonValue);
});

test("round-trips business-action lifecycles and permits net-negative daily cash flow", () => {
  let state = createCampaignStart(6201);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 14 });
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.ok(state.finance.todayOperatingCash < 0);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);
  assert.deepEqual(state.operations.records[0], {
    id: "business-action-1",
    type: "tv-cm",
    startedDay: 15,
    endsDay: 36,
    cost: 0.6,
    outcome: "active",
  });

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "championship",
  });
  assert.equal(state.operations.records[1].outcome, "active");
  assert.equal(state.operations.records[1].resolvedDay, undefined);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(["success", "backlash"].includes(state.operations.records[1].outcome));
  assert.equal(state.operations.records[1].resolvedDay, 17);
  state = reduceGame(state, {
    type: "RUN_BUSINESS_ACTION",
    action: "pack-odds",
  });
  assert.deepEqual(
    {
      outcome: state.operations.records[2].outcome,
      startedDay: state.operations.records[2].startedDay,
      endsDay: state.operations.records[2].endsDay,
    },
    { outcome: "pending", startedDay: 17, endsDay: 59 },
  );
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 13 });
  assert.equal(state.day, 30);
  assert.equal(state.phase, "release-edit");
  assert.equal(state.operations.records[2].outcome, "pending");
  state = submitThree(state);
  assert.equal(state.operations.records[2].outcome, "active");
  assert.equal(state.operations.records[2].appliedDay, 30);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(["clean", "detected"].includes(state.operations.records[2].outcome));
  assert.equal(state.operations.records[2].resolvedDay, 31);
  assert.deepEqual(parseGameState(jsonRoundTrip(state)), state);
});

test("round-trips strategic risk snapshots and rejects forged project results", () => {
  let active = advanceThroughDecisions(createInitialGame(6203), 120);
  active = reduceGame(active, {
    type: "RUN_BUSINESS_ACTION",
    action: "season-overhaul",
  });
  assert.deepEqual(parseGameState(jsonRoundTrip(active)), active);
  assert.ok(active.operations.records.at(-1)?.riskContext);

  const forcedSuccess = structuredClone(active);
  forcedSuccess.operations.records.at(-1)!.risk = 0;
  const success = advanceThroughDecisions(forcedSuccess, 150);
  assert.equal(success.operations.records.at(-1)?.outcome, "success");
  assert.equal(success.operations.records.at(-1)?.cashReturn, 6.5);
  assert.deepEqual(parseGameState(jsonRoundTrip(success)), success);

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
  let valid = createCampaignStart(6202);
  valid = reduceGame(valid, { type: "ADVANCE_DAYS", days: 14 });
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
    startedDay: 16,
    endsDay: 37,
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

  const forbiddenRisk = structuredClone(valid);
  forbiddenRisk.operations.records[0].risk = 0.1;
  assert.throws(() => parseGameState(forbiddenRisk), SaveSchemaError);

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

  const forgedPreHandoverCosts = createInitialGame(6204);
  forgedPreHandoverCosts.finance.todayOperatingCost = 0.01;
  forgedPreHandoverCosts.finance.cumulativeOperatingCosts = 0.01;
  assert.throws(
    () => parseGameState(forgedPreHandoverCosts),
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

  const earlyHandover = createCampaignStart(44);
  earlyHandover.handoverComplete = true;
  assert.throws(() => parseGameState(earlyHandover), SaveSchemaError);
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
    (option) => option.requested,
  );
  assert.ok(requestedOptionIndex >= 0);
  const brokenRequestLink = structuredClone(atRelease);
  brokenRequestLink.releaseSlate!.options[requestedOptionIndex].requestId =
    "support-request-missing";
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
    (product) => product.requestId,
  );
  assert.ok(requestedProductIndex >= 0);
  const brokenReleasedRequest = structuredClone(released);
  brokenReleasedRequest.releaseHistory[requestedBatchIndex].products[
    requestedProductIndex
  ].requestId = "support-request-missing";
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
  wrongPart.community[0].partId = "cycle-gate";
  assert.throws(() => parseGameState(wrongPart), SaveSchemaError);

  const wrongBanPhase = structuredClone(initial);
  wrongBanPhase.phase = "ban-edit";
  assert.throws(() => parseGameState(wrongBanPhase), SaveSchemaError);

  const wrongReleasePhase = structuredClone(initial);
  wrongReleasePhase.phase = "release-edit";
  assert.throws(() => parseGameState(wrongReleasePhase), SaveSchemaError);
});
