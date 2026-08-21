import assert from "node:assert/strict";
import test from "node:test";

import {
  HANDOVER_TAB_UNLOCK_DAY,
  getHandoverBriefing,
  getHandoverProgress,
  getNewlyUnlockedHandoverTabs,
  getHandoverTabAvailability,
  getHandoverTabAvailabilityMap,
  getUnlockedHandoverTabs,
  isEmergencyHandoverDay,
  isHandoverInProgress,
  resolveHandoverTab,
} from "../app/game/handover.ts";

test("the emergency handover opens Distribution and Cards on DAY 0, then reveals the remaining evidence", () => {
  assert.deepEqual(HANDOVER_TAB_UNLOCK_DAY, {
    distribution: 0,
    cards: 0,
    community: 1,
    news: 2,
    finance: 3,
    operations: 4,
    releases: 10,
  });

  assert.deepEqual(
    getUnlockedHandoverTabs({ day: 0, handoverComplete: false }),
    ["distribution", "cards"],
  );
  assert.deepEqual(
    getUnlockedHandoverTabs({ day: 2, handoverComplete: false }),
    ["distribution", "cards", "community", "news"],
  );
  assert.deepEqual(
    getUnlockedHandoverTabs({ day: 6, handoverComplete: false }),
    ["distribution", "cards", "community", "news", "finance", "operations"],
  );
  assert.deepEqual(
    new Set(getUnlockedHandoverTabs({ day: 10, handoverComplete: true })),
    new Set(Object.keys(HANDOVER_TAB_UNLOCK_DAY)),
  );
});

test("tab availability exposes a readable lock reason and resolves unsafe restores", () => {
  const context = { day: 0, handoverComplete: false } as const;
  const cards = getHandoverTabAvailability("cards", context);
  assert.deepEqual(cards, {
    tab: "cards",
    unlockDay: 0,
    unlocked: true,
    reason: null,
  });
  assert.equal(resolveHandoverTab("cards", context), "cards");
  assert.equal(
    getHandoverTabAvailability("community", context).reason,
    "인수인계가 진행되면 개방됩니다.",
  );
  assert.equal(resolveHandoverTab("distribution", context), "distribution");

  const completed = getHandoverTabAvailabilityMap({
    day: 7,
    handoverComplete: true,
  });
  assert.ok(
    Object.entries(completed).every(([tab, entry]) =>
      tab === "releases" ? !entry.unlocked : entry.unlocked,
    ),
  );
  assert.equal(resolveHandoverTab("finance", {
    day: 0,
    handoverComplete: true,
  }), "finance");
});

test("newly unlocked tabs are returned in handover order", () => {
  assert.deepEqual(
    getNewlyUnlockedHandoverTabs(
      { day: 1, handoverComplete: false },
      { day: 2, handoverComplete: false },
    ),
    ["news"],
  );
  assert.deepEqual(
    getNewlyUnlockedHandoverTabs(
      { day: 0, handoverComplete: false },
      { day: 5, handoverComplete: false },
    ),
    ["community", "news", "finance", "operations"],
  );
  assert.deepEqual(
    getNewlyUnlockedHandoverTabs(
      { day: 7, handoverComplete: true },
      { day: 10, handoverComplete: true },
    ),
    ["releases"],
  );
  assert.equal(
    resolveHandoverTab("releases", {
      day: 10,
      handoverComplete: true,
    }),
    "releases",
    "the release arrival must resolve against the new DAY 10 state, not the previous locked day",
  );
});

test("DAY 7 closes the guided handover without changing tab access", () => {
  assert.equal(
    isEmergencyHandoverDay({ day: 0, handoverComplete: false }),
    true,
  );
  assert.equal(
    isHandoverInProgress({ day: 6, handoverComplete: false }),
    true,
  );
  assert.equal(
    isHandoverInProgress({ day: 7, handoverComplete: false }),
    false,
  );
  assert.deepEqual(
    getHandoverProgress({ day: 7, handoverComplete: false }),
    { currentDay: 7, endDay: 7, complete: true, percent: 100 },
  );
  assert.equal(
    getHandoverBriefing({ day: 5, handoverComplete: false })?.tab,
    null,
  );
  assert.equal(
    getHandoverBriefing({ day: 1, handoverComplete: false })?.tab,
    "community",
  );
  assert.equal(
    getHandoverBriefing({ day: 6, handoverComplete: false })?.tab,
    null,
  );
  assert.equal(
    getHandoverBriefing({ day: 7, handoverComplete: true })?.kicker,
    "인수인계 완료",
  );
  assert.equal(
    getHandoverBriefing({ day: 8, handoverComplete: true }),
    null,
  );
});
