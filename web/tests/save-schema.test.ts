import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  createCampaignStart,
  createInitialGame,
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
import type {
  GameState,
  PowerAdjustment,
  ReleaseSelection,
} from "../app/game/types.ts";

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
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
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
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

test("accepts schema v3 saves and preserves deterministic continuation", () => {
  const initial = createInitialGame(7301);
  const restored = parseGameState(jsonRoundTrip(initial));
  assert.equal(restored.schemaVersion, 3);
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

test("round-trips every guided prologue gate without tutorial-only save data", () => {
  let state = parseGameState(jsonRoundTrip(createCampaignStart(1000)));
  assert.equal(state.day, 1);
  assert.equal(state.phase, "running");

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 29 });
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
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
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
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
    if (wave < 3) {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
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

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 135);
  state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
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
  while (game.phase !== "ended") {
    decisions += 1;
    assert.ok(decisions < 100, "campaign should terminate within its fixed gates");
    if (game.phase === "release-edit") {
      game = submitThree(game);
    } else if (game.phase === "ban-edit") {
      game = reduceGame(game, { type: "SUBMIT_BAN", changes: {} });
    } else {
      game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1000 });
    }
    parseGameState(jsonRoundTrip(game));
  }
  assert.equal(game.day, 1000);
  assert.ok(game.releaseHistory.every((batch) => batch.products.length === 3));
  const serialized = JSON.stringify(game);
  assert.ok(Buffer.byteLength(serialized, "utf8") < MAX_SAVE_BYTES);
  const jsonValue = JSON.parse(serialized) as unknown;
  assert.deepEqual(parseGameState(jsonValue), jsonValue);
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
  wrongTier.releaseSlate!.options[0].expectedTier = "Tier 0";
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
