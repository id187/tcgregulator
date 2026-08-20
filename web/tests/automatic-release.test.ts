import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { createCampaignStart, reduceGame } from "../app/game/engine.ts";
import type { GameState, ReleaseOption } from "../app/game/types.ts";

function openFirstRelease(seed: number): GameState {
  const state = reduceGame(createCampaignStart(seed), {
    type: "ADVANCE_DAYS",
    days: 29,
  });
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  return state;
}

function selectedOptions(
  state: GameState,
  optionIds: readonly string[],
): ReleaseOption[] {
  const byId = new Map(
    state.releaseSlate?.options.map((option) => [option.id, option]),
  );
  return optionIds.map((optionId) => {
    const option = byId.get(optionId);
    assert.ok(option, `missing selected option ${optionId}`);
    return option;
  });
}

test("returns no automatic release outside an active release review", () => {
  const running = createCampaignStart(91_001);
  assert.deepEqual(getAutomaticReleaseSelections(running), []);

  const missingSlate = openFirstRelease(91_002);
  missingSlate.releaseSlate = null;
  assert.deepEqual(getAutomaticReleaseSelections(missingSlate), []);
});

test("current releases deterministically select at least one new theme and the required mix", () => {
  const state = openFirstRelease(91_003);
  const originalSlate = structuredClone(state.releaseSlate);
  const first = getAutomaticReleaseSelections(state);
  const second = getAutomaticReleaseSelections(state);

  assert.deepEqual(first, second);
  assert.deepEqual(state.releaseSlate, originalSlate, "selection must be pure");
  assert.equal(first.length, 4);
  assert.ok(first.every((selection) => selection.powerAdjustment === 0));

  const options = selectedOptions(
    state,
    first.map((selection) => selection.optionId),
  );
  assert.ok(options.filter((option) => option.kind === "new-theme").length >= 1);
  assert.ok(options.some((option) => option.kind === "support"));
  assert.ok(options.some((option) => option.kind === "generic"));

  const submitted = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: first,
  });
  assert.equal(submitted.phase, "running");
  assert.equal(submitted.releaseHistory.at(-1)?.products.length, 4);
});

test("the open fourth slot can select a second new theme", () => {
  const state = openFirstRelease(91_006);
  const slate = state.releaseSlate!;
  const newThemes = slate.options.filter(
    (option): option is Extract<ReleaseOption, { kind: "new-theme" }> =>
      option.kind === "new-theme",
  );
  assert.ok(newThemes.length >= 2);

  for (const option of slate.options) {
    option.requested = false;
    option.expectedPower = option.kind === "new-theme" ? 90 : 10;
  }
  newThemes[0].expectedPower = 100;
  newThemes[1].expectedPower = 99;

  const selections = getAutomaticReleaseSelections(state);
  const options = selectedOptions(
    state,
    selections.map((selection) => selection.optionId),
  );
  assert.equal(options.filter((option) => option.kind === "new-theme").length, 2);
  assert.equal(options.filter((option) => option.kind === "support").length, 1);
  assert.equal(options.filter((option) => option.kind === "generic").length, 1);

  const submitted = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  assert.equal(submitted.phase, "running");
  assert.deepEqual(
    submitted.releaseHistory.at(-1)?.products.map((product) => product.kind).sort(),
    ["generic", "new-theme", "new-theme", "support"],
  );
});

test("ranking prefers requested support, then power, then stable id", () => {
  const state = openFirstRelease(91_004);
  const slate = state.releaseSlate!;
  const supports = slate.options.filter(
    (option): option is Extract<ReleaseOption, { kind: "support" }> =>
      option.kind === "support",
  );
  const newThemes = slate.options.filter(
    (option): option is Extract<ReleaseOption, { kind: "new-theme" }> =>
      option.kind === "new-theme",
  );
  assert.ok(supports.length >= 2);
  assert.ok(newThemes.length >= 2);

  for (const support of supports) {
    support.requested = false;
    support.expectedPower = 10;
  }
  const requested = supports.at(-1)!;
  requested.requested = true;
  requested.expectedPower = 1;
  const strongestUnrequested = supports[0];
  strongestUnrequested.expectedPower = 99;
  for (const option of slate.options) {
    if (option.kind === "generic") option.expectedPower = 0;
  }

  for (const option of newThemes) option.expectedPower = 50;
  const stableNewThemeId = newThemes
    .map((option) => option.id)
    .sort((left, right) => left.localeCompare(right))[0];

  const selections = getAutomaticReleaseSelections(state);
  const selectionIds = selections.map((selection) => selection.optionId);
  assert.equal(selectionIds[0], stableNewThemeId);
  assert.equal(selectionIds[1], requested.id);
  assert.equal(selectionIds[3], strongestUnrequested.id);
});

test("legacy releases select exactly one new theme and two supports", () => {
  const state = openFirstRelease(91_005);
  state.genericReleaseStartDay = null;
  state.releaseSlate!.options = state.releaseSlate!.options.filter(
    (option) => option.kind !== "generic",
  );

  const selections = getAutomaticReleaseSelections(state);
  assert.equal(selections.length, 3);
  assert.ok(selections.every((selection) => selection.powerAdjustment === 0));
  const options = selectedOptions(
    state,
    selections.map((selection) => selection.optionId),
  );
  assert.equal(options.filter((option) => option.kind === "new-theme").length, 1);
  assert.equal(options.filter((option) => option.kind === "support").length, 2);

  const submitted = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections,
  });
  assert.equal(submitted.phase, "running");
  assert.equal(submitted.releaseHistory.at(-1)?.products.length, 3);
});
