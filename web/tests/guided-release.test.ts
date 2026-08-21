import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialGame,
  getPrologueReleaseCommand,
  getPrologueReleasePlan,
  isPrologueReleaseSubmission,
  reduceGame,
} from "../app/game/engine.ts";
import type { ReleaseRequestInput } from "../app/game/release-requests.ts";
import { parseGameState } from "../app/game/save-schema.ts";
import type {
  GameState,
  ReleaseOption,
} from "../app/game/types.ts";

function reachGuidedRelease(state: GameState): GameState {
  let next = reduceGame(state, { type: "ADVANCE_DAYS", days: 2 });
  assert.equal(next.day, 9);
  next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(next.day, 10);
  assert.equal(next.phase, "release-edit");
  assert.ok(next.releaseSlate);
  return next;
}

function selectedOptions(
  state: GameState,
  optionIds: readonly string[],
): ReleaseOption[] {
  const options = new Map(
    state.releaseSlate?.options.map((option) => [option.id, option]),
  );
  return optionIds.map((optionId) => {
    const option = options.get(optionId);
    assert.ok(option);
    return option;
  });
}

test("the guided DAY 10 plan is fixed, save-stable, and uses a legal two-theme mix", () => {
  const seed = 72_001;
  const state = reachGuidedRelease(createInitialGame(seed));
  const plan = getPrologueReleasePlan(state);

  assert.equal(plan.selections.length, 4);
  assert.deepEqual(
    plan.selectedOptionIds,
    plan.selections.map((selection) => selection.optionId),
  );
  assert.deepEqual(
    plan.selections.map((selection) =>
      plan.powerAdjustmentByOptionId[selection.optionId]
    ),
    plan.selections.map((selection) => selection.powerAdjustment),
  );

  const options = selectedOptions(state, plan.selectedOptionIds);
  assert.deepEqual(
    Object.fromEntries(
      (["new-theme", "support", "generic"] as const).map((kind) => [
        kind,
        options.filter((option) => option.kind === kind).length,
      ]),
    ),
    { "new-theme": 2, support: 1, generic: 1 },
  );
  assert.equal(isPrologueReleaseSubmission(state, plan.selections), true);
  assert.equal(
    isPrologueReleaseSubmission(state, [...plan.selections].reverse()),
    false,
  );
  assert.equal(
    isPrologueReleaseSubmission(state, [
      { ...plan.selections[0], powerAdjustment: 2 },
      ...plan.selections.slice(1),
    ]),
    false,
  );

  const restored = parseGameState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(getPrologueReleasePlan(restored), plan);
  const reordered = structuredClone(state);
  reordered.releaseSlate!.options.reverse();
  assert.deepEqual(getPrologueReleasePlan(reordered), plan);

  const manual = reduceGame(state, getPrologueReleaseCommand(state));
  assert.equal(manual.phase, "running");
  assert.equal(manual.releaseHistory.at(-1)?.releaseKind, "regular");
  assert.equal(manual.releaseHistory.at(-1)?.products.length, 4);
  assert.deepEqual(
    parseGameState(JSON.parse(JSON.stringify(manual))),
    JSON.parse(JSON.stringify(manual)),
  );
});

test("a reprint request stays queued for its dedicated reprint pack", () => {
  let state = createInitialGame(72_002);
  const themeId = state.activeThemeIds[0];
  const requests: ReleaseRequestInput[] = [
    { kind: "support", themeId, direction: "consistency" },
    { kind: "indirect-support", themeId },
    {
      kind: "reprint",
      cardId: state.themes[themeId].releasedPartIds[0],
    },
  ];
  for (const request of requests) {
    state = reduceGame(state, { type: "SET_RELEASE_REQUEST", request });
  }
  state = reachGuidedRelease(state);

  const plan = getPrologueReleasePlan(state);
  assert.equal(plan.selections.length, 4);
  assert.ok(state.releaseSlate?.options.every((option) => option.kind !== "reprint"));
  const options = selectedOptions(state, plan.selectedOptionIds);
  assert.deepEqual(
    options.map((option) => option.kind).sort(),
    ["generic", "new-theme", "new-theme", "support"],
  );
  assert.equal(
    options.find((option) => option.kind === "support")?.requested,
    true,
  );
  assert.equal(
    options.find((option) => option.kind === "generic")?.requested,
    true,
  );

  const released = reduceGame(state, getPrologueReleaseCommand(state));
  assert.deepEqual(
    released.releaseHistory.at(-1)?.products
      .map((product) => product.kind)
      .sort(),
    ["generic", "new-theme", "new-theme", "support"],
  );
  const reprintRequest = released.supportRequests.find(
    (request) => request.kind === "reprint",
  );
  assert.ok(reprintRequest);
  assert.equal(reprintRequest.status, "queued");
  assert.equal(reprintRequest.eligibleReleaseDay, 50);
});
