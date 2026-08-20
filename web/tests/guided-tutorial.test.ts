import assert from "node:assert/strict";
import test from "node:test";

import {
  createCampaignStart,
  getPrologueReleaseCommand,
  reduceGame,
} from "../app/game/engine.ts";
import {
  DEFAULT_TUTORIAL_GUIDANCE_ENABLED,
  GUIDED_CHECKPOINT_DAYS,
  GUIDED_OBJECTIVE_COUNT,
  getGuidedAdvanceDays,
  getGuidedObjective,
  getGuidedStep,
  getTutorialGuidanceEnabledAfterEvent,
  isGuidedAdvanceDaysAllowed,
  shouldShowGuidedPrompt,
  type GuidedStep,
} from "../app/game/guided-tutorial.ts";
import { parseGameState } from "../app/game/save-schema.ts";
import {
  canToggleReleaseOption,
  isCompleteReleaseSelection,
} from "../app/game/release-selection.ts";
import type { GameState } from "../app/game/types.ts";

function roundTrip(game: GameState): GameState {
  return parseGameState(JSON.parse(JSON.stringify(game)) as unknown);
}

function assertGuidedState(
  game: GameState,
  expectedStep: GuidedStep,
  expectedObjective: number,
) {
  const restored = roundTrip(game);
  assert.equal(getGuidedStep(restored), expectedStep);
  assert.equal(
    getGuidedObjective(expectedStep, restored.day),
    expectedObjective,
  );
  assert.equal(
    Object.hasOwn(restored, "guidedStep"),
    false,
    "guided progress must remain derivable from ordinary saved game state",
  );
}

test("tutorial guidance defaults on for a first run", () => {
  assert.equal(
    DEFAULT_TUTORIAL_GUIDANCE_ENABLED,
    true,
    "a fresh settings store must start with tutorial guidance enabled",
  );
});

test("completion and skip turn guidance off while settings can reactivate it", () => {
  assert.equal(
    typeof getTutorialGuidanceEnabledAfterEvent,
    "function",
    "guided-tutorial.ts must export the settings transition helper",
  );
  const transition = getTutorialGuidanceEnabledAfterEvent;

  for (const current of [false, true]) {
    assert.equal(transition(current, "complete"), false);
    assert.equal(transition(current, "skip"), false);
    assert.equal(transition(current, "settings-enable"), true);
    assert.equal(transition(current, "settings-disable"), false);
  }

  assert.equal(
    transition(
      transition(true, "complete"),
      "settings-enable",
    ),
    true,
    "manual reactivation must work after a completed tutorial",
  );
  assert.equal(
    transition(
      transition(true, "skip"),
      "settings-enable",
    ),
    true,
    "manual reactivation must work after skipping guidance",
  );
});

test("the derived tutorial model exposes eight objectives at the authored gates", () => {
  assert.equal(GUIDED_OBJECTIVE_COUNT, 8);
  assert.deepEqual(GUIDED_CHECKPOINT_DAYS, [8, 15, 16, 22, 23, 30, 31]);
  assert.deepEqual(
    [
      getGuidedObjective("observe", 1),
      getGuidedObjective("observe", 8),
      getGuidedObjective("restriction", 15),
      getGuidedObjective("restriction-reaction", 15),
      getGuidedObjective("restriction-reaction", 16),
      getGuidedObjective("business", 22),
      getGuidedObjective("release-runup", 22),
      getGuidedObjective("release-runup", 23),
      getGuidedObjective("release", 30),
      getGuidedObjective("release-reaction", 30),
      getGuidedObjective("handover", 31),
    ],
    [1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8],
  );
});

test("guided prompts open only for actual tutorial events", () => {
  for (const [step, day] of [
    ["observe", 1],
    ["observe", 8],
    ["restriction", 15],
    ["restriction-reaction", 16],
    ["business", 22],
    ["release-runup", 23],
    ["release", 30],
    ["release-reaction", 30],
    ["handover", 31],
  ] as const) {
    assert.equal(
      shouldShowGuidedPrompt(step, day),
      true,
      `${step} DAY ${day} must open its event prompt`,
    );
  }

  for (const [step, firstDay, lastDay] of [
    ["observe", 2, 7],
    ["observe", 9, 14],
    ["restriction-reaction", 15, 15],
    ["restriction-reaction", 17, 21],
    ["release-runup", 22, 22],
    ["release-runup", 24, 29],
  ] as const) {
    for (let day = firstDay; day <= lastDay; day += 1) {
      assert.equal(
        shouldShowGuidedPrompt(step, day),
        false,
        `${step} DAY ${day} must preserve the player's current tab`,
      );
    }
  }
});

test("save round-trips reconstruct every guided checkpoint without tutorial-only data", () => {
  let game = createCampaignStart(1_000);
  assertGuidedState(game, "observe", 1);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(game.day, 8);
  assertGuidedState(game, "observe", 2);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(game.day, 15);
  assert.equal(game.phase, "ban-edit");
  assertGuidedState(game, "restriction", 3);

  game = reduceGame(game, { type: "SUBMIT_BAN", changes: {} });
  assert.equal(game.day, 15);
  assert.equal(game.phase, "running");
  assertGuidedState(game, "restriction-reaction", 3);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(game.day, 16);
  assertGuidedState(game, "restriction-reaction", 4);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 6 });
  assert.equal(game.day, 22);
  assertGuidedState(game, "business", 5);

  game = reduceGame(game, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assertGuidedState(game, "release-runup", 5);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(game.day, 23);
  assertGuidedState(game, "release-runup", 6);

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 7 });
  assert.equal(game.day, 30);
  assert.equal(game.phase, "release-edit");
  assertGuidedState(game, "release", 7);

  game = reduceGame(game, getPrologueReleaseCommand(game));
  assert.equal(game.day, 30);
  assert.equal(game.phase, "running");
  assertGuidedState(game, "release-reaction", 7);
  assert.throws(
    () => reduceGame(game, { type: "COMPLETE_HANDOVER" }),
    /DAY 31 impact review/,
  );

  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(game.day, 31);
  assertGuidedState(game, "handover", 8);

  game = reduceGame(game, { type: "COMPLETE_HANDOVER" });
  assert.equal(game.handoverComplete, true);
  assertGuidedState(game, "handover", 8);
});

test("the guided DAY 30 release accepts a legal player-authored mix", () => {
  let game = createCampaignStart(1_001);
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 14 });
  assert.equal(game.day, 15);
  assert.equal(game.phase, "ban-edit");
  game = reduceGame(game, { type: "SUBMIT_BAN", changes: {} });
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(game.day, 16);
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 6 });
  assert.equal(game.day, 22);
  assert.equal(getGuidedStep(game), "business");
  game = reduceGame(game, {
    type: "RUN_BUSINESS_ACTION",
    action: "tv-cm",
  });
  assert.equal(getGuidedStep(game), "release-runup");
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(game.day, 23);
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: 7 });

  assert.equal(game.day, 30);
  assert.equal(game.phase, "release-edit");
  assert.equal(getGuidedStep(game), "release");
  assert.ok(game.releaseSlate);

  const newTheme = game.releaseSlate.options.find(
    (option) => option.kind === "new-theme",
  );
  const newThemes = game.releaseSlate.options
    .filter((option) => option.kind === "new-theme")
    .slice(0, 2);
  const supports = game.releaseSlate.options
    .filter((option) => option.kind === "support")
    .slice(0, 2);
  const generic = game.releaseSlate.options.find(
    (option) => option.kind === "generic",
  );
  assert.ok(newTheme);
  assert.equal(newThemes.length, 2);
  assert.equal(supports.length, 2);
  assert.ok(generic);

  const incompleteThree = [
    newThemes[0].id,
    newThemes[1].id,
    supports[0].id,
  ];
  assert.equal(
    canToggleReleaseOption(
      game.releaseSlate.options,
      incompleteThree,
      supports[1].id,
    ),
    false,
    "the fourth slot must not create a two-theme/two-support dead end",
  );
  assert.equal(
    canToggleReleaseOption(
      game.releaseSlate.options,
      incompleteThree,
      generic.id,
    ),
    true,
    "the missing required category must remain selectable",
  );
  assert.equal(
    isCompleteReleaseSelection(game.releaseSlate.options, [
      ...incompleteThree,
      generic.id,
    ]),
    true,
  );

  const selections = [newTheme, ...supports, generic].map((option) => ({
    optionId: option.id,
    powerAdjustment: 0 as const,
  }));
  assert.notDeepEqual(
    selections,
    getPrologueReleaseCommand(game).selections,
    "the regression must exercise a non-canonical player choice",
  );

  game = reduceGame(game, { type: "SUBMIT_RELEASE", selections });
  assert.equal(game.day, 30);
  assert.equal(game.phase, "running");
  assert.equal(getGuidedStep(game), "release-reaction");
  assert.equal(getGuidedObjective("release-reaction", game.day), 7);
  assert.deepEqual(
    Object.fromEntries(
      (["new-theme", "support", "generic"] as const).map((kind) => [
        kind,
        game.releaseHistory.at(-1)?.products.filter(
          (product) => product.kind === kind,
        ).length ?? 0,
      ]),
    ),
    { "new-theme": 1, support: 2, generic: 1 },
  );
  assertGuidedState(game, "release-reaction", 7);

  const actualDays = getGuidedAdvanceDays("release-reaction", game.day, 7);
  assert.equal(actualDays, 1);
  game = reduceGame(game, { type: "ADVANCE_DAYS", days: actualDays });
  assert.equal(game.day, 31);
  assertGuidedState(game, "handover", 8);
});

test("both +1 and +7 remain selectable and clamp before every checkpoint", () => {
  const ranges: Array<{
    step: GuidedStep;
    firstDay: number;
    lastDay: number;
    nextCheckpoint: (day: number) => number;
  }> = [
    {
      step: "observe",
      firstDay: 1,
      lastDay: 14,
      nextCheckpoint: (day) => day < 8 ? 8 : 15,
    },
    {
      step: "restriction-reaction",
      firstDay: 15,
      lastDay: 21,
      nextCheckpoint: (day) => day === 15 ? 16 : 22,
    },
    {
      step: "release-runup",
      firstDay: 22,
      lastDay: 29,
      nextCheckpoint: (day) => day === 22 ? 23 : 30,
    },
    {
      step: "release-reaction",
      firstDay: 30,
      lastDay: 30,
      nextCheckpoint: () => 31,
    },
  ];

  for (const range of ranges) {
    for (let day = range.firstDay; day <= range.lastDay; day += 1) {
      const checkpoint = range.nextCheckpoint(day);
      for (const requestedDays of [1, 7] as const) {
        assert.equal(
          isGuidedAdvanceDaysAllowed(
            range.step,
            day,
            requestedDays,
          ),
          true,
          `${range.step} DAY ${day}: +${requestedDays} must remain selectable`,
        );
        const actualDays = getGuidedAdvanceDays(
          range.step,
          day,
          requestedDays,
        );
        const expectedDays = Math.min(requestedDays, checkpoint - day);
        assert.equal(
          actualDays,
          expectedDays,
          `${range.step} DAY ${day}: +${requestedDays} must stop at DAY ${checkpoint}`,
        );
        assert.ok(actualDays !== null && actualDays >= 1 && actualDays <= 7);
        assert.equal(day + actualDays, Math.min(day + requestedDays, checkpoint));
      }
    }
  }
});

test("decision checkpoints block time until their required action completes", () => {
  for (const { step, day } of [
    { step: "restriction", day: 15 },
    { step: "business", day: 22 },
    { step: "release", day: 30 },
    { step: "handover", day: 31 },
    { step: "handover", day: 32 },
  ] as const) {
    for (const requestedDays of [1, 7] as const) {
      assert.equal(
        isGuidedAdvanceDaysAllowed(step, day, requestedDays),
        false,
      );
      assert.equal(
        getGuidedAdvanceDays(step, day, requestedDays),
        null,
      );
    }
  }
});
