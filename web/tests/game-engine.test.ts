import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import { getCommunityHeat } from "../app/game/daily-community.ts";
import {
  createCampaignStart,
  createInitialGame,
  canProposeSupport,
  formatCommunityEvent,
  getCommittedSupportCount,
  getNextBanDay,
  getNextReleaseDay,
  getPrologueReleaseSelections,
  getPrologueRestrictionChanges,
  isBanDay,
  isPrologueReleaseSelection,
  isPrologueRestrictionChange,
  isReleaseDay,
  reduceGame,
} from "../app/game/engine.ts";

type State = ReturnType<typeof createInitialGame>;
type Adjustment = -3 | -2 | -1 | 0 | 1 | 2 | 3;

test("restriction announcements state whether limits tighten or loosen", () => {
  const state = createCampaignStart(9001);
  const baseEvent = {
    id: "directional-restriction-copy",
    day: 45,
    category: "restriction" as const,
    type: "restriction-applied" as const,
    themeId: "cycle",
    partId: "cycle-gate",
    body: "",
  };

  assert.match(
    formatCommunityEvent(
      { ...baseEvent, previousValue: 3, value: 1 },
      state,
    ),
    /제한 강화 3→1장/,
  );
  assert.match(
    formatCommunityEvent(
      { ...baseEvent, previousValue: 1, value: 3 },
      state,
    ),
    /제한 해제 1→3장/,
  );
});

function advanceToFirstRelease(state: State): State {
  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 30 });
  assert.equal(next.day, 60);
  assert.equal(next.phase, "release-edit");
  assert.ok(next.releaseSlate);
  return next;
}

function advanceRawToFirstBan(seed: number): State {
  let state = createCampaignStart(seed);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 29 });
  state = submitFirstThree(state);
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  assert.equal(state.day, 45);
  assert.equal(state.phase, "ban-edit");
  return state;
}

function submitFirstThree(
  state: State,
  adjustments: readonly Adjustment[] = [0, 0, 0],
): State {
  assert.equal(state.phase, "release-edit");
  assert.ok(state.releaseSlate);
  assert.equal(adjustments.length, 3);
  const options = state.releaseSlate.options.slice(0, 3);
  assert.equal(options.length, 3);
  return reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: options.map((option, index) => ({
      optionId: option.id,
      powerAdjustment: adjustments[index],
    })),
  });
}

function assertHealthyShares(state: State): void {
  assert.equal(Object.keys(state.themes).length, state.activeThemeIds.length);
  assert.ok(state.activeThemeIds.length <= 100);
  const shares = state.activeThemeIds.map(
    (themeId) => state.themes[themeId].share,
  );
  assert.ok(shares.every(Number.isFinite));
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-6);
}

function tuneRestrictionTarget(
  state: State,
  themeId: string,
  unpleasantness: number,
): State {
  const tuned = structuredClone(state);
  const otherShare = 0.58 / (tuned.activeThemeIds.length - 1);
  for (const activeId of tuned.activeThemeIds) {
    tuned.themes[activeId].share = activeId === themeId ? 0.42 : otherShare;
    tuned.themes[activeId].previousWeekShare = tuned.themes[activeId].share;
    tuned.themes[activeId].topStreakDays = activeId === themeId ? 90 : 0;
  }
  const runtime = tuned.themes[themeId];
  runtime.supportUnpleasantness += unpleasantness - runtime.unpleasantness;
  runtime.unpleasantness = unpleasantness;
  tuned.currentTopThemeId = themeId;
  return tuned;
}

test("uses the 30-day release and offset 90-day restriction calendars", () => {
  const releaseDays = Array.from({ length: 1000 }, (_, index) => index + 1).filter(
    isReleaseDay,
  );
  const banDays = Array.from({ length: 1000 }, (_, index) => index + 1).filter(
    isBanDay,
  );

  assert.equal(releaseDays.length, 33);
  assert.equal(releaseDays[0], 30);
  assert.equal(releaseDays.at(-1), 990);
  assert.deepEqual(banDays, [45, 135, 225, 315, 405, 495, 585, 675, 765, 855, 945]);
  assert.equal(getNextReleaseDay(42), 60);
  assert.equal(getNextReleaseDay(60), 90);
  assert.equal(getNextBanDay(42), 45);
  assert.equal(getNextBanDay(45), 135);
  assert.equal(releaseDays.some((day) => isBanDay(day)), false);
});

test("creates a fixed DAY 1 campaign start with five themes and 10,000 users", () => {
  const state = createCampaignStart(17);
  const otherSeed = createCampaignStart(999_017);
  assert.equal(state.day, 1);
  assert.equal(state.phase, "running");
  assert.equal(THEMES.length, 100);
  assert.equal(state.activeThemeIds.length, 5);
  assert.equal(new Set(state.activeThemeIds).size, 5);
  assert.equal(Object.keys(state.themes).length, 5);
  assert.deepEqual(state.activeThemeIds, [
    "cycle",
    "white-night",
    "machine-revolution",
    "ironblood",
    "abyss",
  ]);
  assert.deepEqual(state.users, {
    tier: 3_500,
    casual: 4_500,
    collector: 2_000,
  });
  assert.equal(state.handoverComplete, false);
  assert.ok(THEMES.every((theme) => theme.parts.length === 14));
  assert.ok(
    state.activeThemeIds.every((themeId) => {
      const runtime = state.themes[themeId];
      return (
        runtime.supportCount === 0 &&
        runtime.releasedPartIds.length === 5 &&
        Object.keys(runtime.partStats).length === 5 &&
        Object.keys(runtime.legalLimits).length === 5
      );
    }),
  );
  assert.deepEqual(otherSeed.users, state.users);
  assert.deepEqual(
    state.activeThemeIds.map((themeId) => state.themes[themeId].share),
    otherSeed.activeThemeIds.map((themeId) => otherSeed.themes[themeId].share),
  );
  const startingWeightTotal = 0.14 + 0.13 + 0.13 + 0.1 + 0.11;
  const expectedShares = [0.14, 0.13, 0.13, 0.1, 0.11].map(
    (weight) => weight / startingWeightTotal,
  );
  state.activeThemeIds.forEach((themeId, index) => {
    assert.ok(Math.abs(state.themes[themeId].share - expectedShares[index]) < 1e-8);
  });
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.history.map((entry) => entry.day), [1]);
  assert.ok(state.history.every((entry) => entry.totalUsers === 10_000));
  assert.deepEqual(state.history.map((entry) => entry.revenue), state.recentRevenue);
  assert.deepEqual(state.community, []);
  assert.deepEqual(state.releaseHistory, []);
});

test("exposes deterministic guided choices that replay through the ordinary reducer", () => {
  const expected = createInitialGame(1000);
  let guided = createCampaignStart(1000);

  assert.throws(
    () => getPrologueReleaseSelections(guided),
    /DAY 30 review/,
  );
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 29 });
  const selections = getPrologueReleaseSelections(guided);
  assert.equal(selections.length, 3);
  assert.ok(
    selections.every((selection) =>
      isPrologueReleaseSelection(guided, selection),
    ),
  );
  assert.equal(
    isPrologueReleaseSelection(guided, {
      ...selections[0],
      powerAdjustment: selections[0].powerAdjustment === 3
        ? 2
        : ((selections[0].powerAdjustment + 1) as Adjustment),
    }),
    false,
  );

  guided = reduceGame(guided, { type: "SUBMIT_RELEASE", selections });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 15 });
  const changes = getPrologueRestrictionChanges(guided);
  assert.deepEqual(changes, { "machine-revolution-siege-g09": 0 });
  assert.equal(
    isPrologueRestrictionChange(
      guided,
      "machine-revolution-siege-g09",
      0,
    ),
    true,
  );
  assert.equal(
    isPrologueRestrictionChange(
      guided,
      "machine-revolution-siege-g09",
      1,
    ),
    false,
  );

  guided = reduceGame(guided, { type: "SUBMIT_BAN", changes });
  guided = reduceGame(guided, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(guided.handoverComplete, false);
  guided = reduceGame(guided, { type: "COMPLETE_HANDOVER" });
  assert.deepEqual(guided, expected);
});

test("replays the fixed DAY 30 release and DAY 45 restriction into DAY 46", () => {
  const raw = createCampaignStart(1000);
  const fullPrologue = createInitialGame(1000);
  const skippedPrologue = createInitialGame(1000);

  assert.deepEqual(fullPrologue, skippedPrologue);
  assert.equal(raw.day, 1);
  assert.equal(fullPrologue.day, 46);
  assert.equal(fullPrologue.phase, "running");
  assert.equal(fullPrologue.releaseSlate, null);
  assert.equal(fullPrologue.activeThemeIds.length, 8);
  assert.equal(fullPrologue.releaseHistory.length, 1);
  assert.equal(fullPrologue.releaseHistory[0].day, 30);
  assert.deepEqual(
    fullPrologue.releaseHistory[0].products.map((product) => ({
      optionId: product.optionId,
      kind: product.kind,
      powerAdjustment: product.powerAdjustment,
    })),
    [
      { optionId: "release-option-4", kind: "new-theme", powerAdjustment: 3 },
      { optionId: "release-option-5", kind: "new-theme", powerAdjustment: 3 },
      { optionId: "release-option-6", kind: "new-theme", powerAdjustment: 3 },
    ],
  );
  const decisionDayReleaseEvents = fullPrologue.community.filter(
    (event) =>
      event.day === 30 &&
      (event.type === "release-reaction" || event.type === "support-released"),
  );
  assert.equal(decisionDayReleaseEvents.length, 0);
  const releaseEvents = fullPrologue.community.filter(
    (event) =>
      event.day === 31 &&
      (event.type === "release-reaction" || event.type === "support-released"),
  );
  assert.equal(releaseEvents.length, 3);
  assert.deepEqual(
    releaseEvents.map((event) => event.themeId),
    fullPrologue.releaseHistory[0].products.map((product) => product.themeId),
  );
  assert.ok(releaseEvents.every((event) => event.body.length > 0));
  assert.equal(
    fullPrologue.themes["machine-revolution"].legalLimits[
      "machine-revolution-siege-g09"
    ],
    0,
  );
  assert.equal(fullPrologue.handoverComplete, true);
  assert.ok(
    fullPrologue.community.some(
      (event) =>
        event.day === 45 &&
        event.type === "restriction-applied" &&
        event.partId === "machine-revolution-siege-g09" &&
        event.value === 0,
    ),
  );
  assert.deepEqual(
    fullPrologue.history.map((entry) => entry.day),
    Array.from({ length: 46 }, (_, index) => index + 1),
  );
  assert.equal(
    fullPrologue.history.filter((entry) => entry.day === 30).length,
    1,
  );
  assert.equal(
    fullPrologue.history.filter((entry) => entry.day === 45).length,
    1,
  );
  const historyByDay = new Map(
    fullPrologue.history.map((entry) => [entry.day, entry]),
  );
  assert.deepEqual(historyByDay.get(30)?.shares, historyByDay.get(29)?.shares);
  assert.equal(historyByDay.get(30)?.totalUsers, historyByDay.get(29)?.totalUsers);
  assert.notDeepEqual(historyByDay.get(31)?.shares, historyByDay.get(30)?.shares);
  assert.deepEqual(historyByDay.get(45)?.shares, historyByDay.get(44)?.shares);
  assert.equal(historyByDay.get(45)?.totalUsers, historyByDay.get(44)?.totalUsers);
  assert.notDeepEqual(historyByDay.get(46)?.shares, historyByDay.get(45)?.shares);
  assert.deepEqual(
    fullPrologue.history.slice(-30).map((entry) => entry.revenue),
    fullPrologue.recentRevenue,
  );
  assert.equal(raw.activeThemeIds.length, 5, "the prologue must not mutate its raw input");
});

test("unpleasant long-term exposure accelerates fatigue and low-share themes recover slowly", () => {
  const baseline = createInitialGame(4117);
  const targetId = baseline.currentTopThemeId;
  const calm = structuredClone(baseline);
  const hostile = structuredClone(baseline);
  calm.themes[targetId].fatigue = 30;
  hostile.themes[targetId].fatigue = 30;
  calm.themes[targetId].topStreakDays = 60;
  hostile.themes[targetId].topStreakDays = 60;
  calm.themes[targetId].unpleasantness = 20;
  hostile.themes[targetId].unpleasantness = 90;
  calm.themes[targetId].supportUnpleasantness -= 40;
  hostile.themes[targetId].supportUnpleasantness += 40;

  const calmNext = reduceGame(calm, { type: "ADVANCE_DAYS", days: 1 });
  const hostileNext = reduceGame(hostile, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(
    hostileNext.themes[targetId].fatigue > calmNext.themes[targetId].fatigue,
  );
  assert.ok(hostileNext.themes[targetId].fatigue <= 100);

  const recovering = createInitialGame(5118);
  const recoveringId = recovering.activeThemeIds[0];
  const recipientId = recovering.activeThemeIds[1];
  const transferred = recovering.themes[recoveringId].share - 0.01;
  recovering.themes[recoveringId].share = 0.01;
  recovering.themes[recipientId].share += transferred;
  recovering.themes[recoveringId].topStreakDays = 0;
  recovering.themes[recoveringId].fatigue = 90;
  const recovered = reduceGame(recovering, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(recovered.themes[recoveringId].fatigue < 90);
  assert.ok(recovered.themes[recoveringId].fatigue >= 89.5);
});

test("high fatigue lowers theme adoption, tier and casual users, and daily sales", () => {
  const released = submitFirstThree(advanceToFirstRelease(createInitialGame(6119)));
  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  const lowFatigue = structuredClone(observed);
  const highFatigue = structuredClone(lowFatigue);
  for (const themeId of lowFatigue.activeThemeIds) {
    lowFatigue.themes[themeId].fatigue = 5;
    highFatigue.themes[themeId].fatigue = 90;
  }
  const targetId = lowFatigue.currentTopThemeId;
  highFatigue.themes[targetId].fatigue = 100;

  const lowNext = reduceGame(lowFatigue, { type: "ADVANCE_DAYS", days: 1 });
  const highNext = reduceGame(highFatigue, { type: "ADVANCE_DAYS", days: 1 });

  assert.ok(highNext.themes[targetId].share < lowNext.themes[targetId].share);
  assert.ok(highNext.users.tier < lowNext.users.tier);
  assert.ok(highNext.users.casual < lowNext.users.casual);
  assert.ok(highNext.finance.today < lowNext.finance.today);
});

test("community chatter and display heat do not directly change simulation results", () => {
  const control = createInitialGame(7120);
  const noisy = structuredClone(control);
  const themeId = noisy.activeThemeIds[0];
  for (const event of noisy.community) event.body = `과장된 반응 ${event.id}`;
  for (let index = 0; index < 20; index += 1) {
    noisy.community.push({
      id: `synthetic-noise-${index}`,
      day: noisy.day,
      category: "meta",
      type: "top-theme-changed",
      themeId,
      body: `게임은 안 해봤지만 오늘 망했다는 글 ${index}`,
    });
  }
  assert.ok(
    getCommunityHeat(noisy, noisy.day) > getCommunityHeat(control, control.day),
  );

  const controlNext = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  const noisyNext = reduceGame(noisy, { type: "ADVANCE_DAYS", days: 1 });
  assert.deepEqual(noisyNext.users, controlNext.users);
  assert.deepEqual(noisyNext.finance, controlNext.finance);
  assert.equal(noisyNext.purchaseTrust, controlNext.purchaseTrust);
});

test("stops at restriction and release gates until each review is submitted", () => {
  const initial = createInitialGame(101);
  let state = initial;

  assert.equal(initial.day, 46, "the reducer must not mutate its input");
  assert.equal(initial.phase, "running");

  for (const releaseDay of [60, 90, 120]) {
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
    assert.equal(state.day, releaseDay);
    assert.equal(state.phase, "release-edit");

    const releaseBlocked = reduceGame(state, {
      type: "ADVANCE_DAYS",
      days: 100,
    });
    assert.equal(releaseBlocked.day, releaseDay);
    assert.equal(releaseBlocked.phase, "release-edit");
    state = submitFirstThree(releaseBlocked);
  }

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 135);
  assert.equal(state.phase, "ban-edit");
});

test("is deterministic for the same seed and release command log", () => {
  function scenario(seed: number) {
    let state = createInitialGame(seed);
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: state.activeThemeIds[0],
      direction: "consistency",
    });
    state = advanceToFirstRelease(state);
    assert.ok(state.releaseSlate);
    const requested = state.releaseSlate.options.find((option) => option.requested);
    assert.ok(requested);
    const selected = [
      requested,
      ...state.releaseSlate.options.filter((option) => option.id !== requested.id),
    ].slice(0, 3);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option, index) => ({
        optionId: option.id,
        powerAdjustment: ([-1, 0, 1] as const)[index],
      })),
    });
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 45 });
    assert.equal(state.day, 90);
    assert.equal(state.phase, "release-edit");
    return submitFirstThree(state, [1, 0, -1]);
  }

  assert.deepEqual(scenario(20260815), scenario(20260815));
  assert.notDeepEqual(scenario(20260815), scenario(20260816));
});

test("a one-copy finisher restriction is cosmetic but a three-copy starter restriction hurts", () => {
  const initial = createCampaignStart(55);
  const theme = THEMES.find(
    (candidate) =>
      initial.activeThemeIds.includes(candidate.id) &&
      candidate.parts.some(
        (part) => part.role === "starter1" && part.preferredCopies === 3,
      ),
  );
  assert.ok(theme);
  const starter = theme.parts.find(
    (part) => part.role === "starter1" && part.preferredCopies === 3,
  );
  const finisher = theme.parts.find(
    (part) => part.role === "finisher" && part.preferredCopies === 1,
  );
  assert.ok(starter);
  assert.ok(finisher);

  const atGate = advanceRawToFirstBan(55);
  const unrestrictedPower = atGate.themes[theme.id].power;

  const cosmetic = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [finisher.id]: 1 },
  });
  assert.equal(cosmetic.themes[theme.id].power, unrestrictedPower);
  const cosmeticObserved = reduceGame(cosmetic, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(cosmeticObserved.themes[theme.id].power, unrestrictedPower);
  assert.equal(
    cosmeticObserved.themes[theme.id].partStats[finisher.id].averageCopies,
    1,
  );
  assert.ok(
    cosmetic.community.some(
      (event) =>
        event.type === "cosmetic-restriction" && event.partId === finisher.id,
    ),
  );

  const starterHit = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { [starter.id]: 1 },
  });
  assert.equal(starterHit.themes[theme.id].power, unrestrictedPower);
  assert.equal(starterHit.themes[theme.id].legalLimits[starter.id], 1);
  const starterObserved = reduceGame(starterHit, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.ok(starterObserved.themes[theme.id].power < unrestrictedPower - 3);
  assert.ok(
    starterObserved.community.some(
      (event) =>
        event.day === 46 &&
        event.type === "restriction-demand" &&
        event.partId === starter.id,
    ),
  );
});

test("hands over a stable DAY 46 environment and continues normalizing on DAY 47", () => {
  const state = createInitialGame(1000);
  const runtimes = state.activeThemeIds.map((themeId) => state.themes[themeId]);
  const totalUsers = Object.values(state.users).reduce(
    (total, users) => total + users,
    0,
  );
  const topShare = Math.max(...runtimes.map((runtime) => runtime.share));
  const health =
    100 -
    runtimes.reduce(
      (total, runtime) => total + runtime.unpleasantness * runtime.share,
      0,
    );

  assert.equal(state.day, 46);
  assert.equal(state.phase, "running");
  assert.equal(state.handoverComplete, true);
  assert.ok(totalUsers >= 9_500);
  assert.ok(topShare < 0.29);
  assert.ok(health >= 55);
  assert.ok(Math.max(...runtimes.map((runtime) => runtime.fatigue)) < 35);
  assert.ok(state.finance.today > 0);
  assert.ok(state.finance.rolling30 > state.finance.today);

  const next = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  assert.ok(
    Math.max(
      ...next.activeThemeIds.map((themeId) => next.themes[themeId].share),
    ) < 0.28,
  );
});

test("ends immediately at zero users while one remaining user can continue", () => {
  const oneUser = createInitialGame(303);
  oneUser.users = { tier: 1, casual: 0, collector: 0 };
  const continued = reduceGame(oneUser, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(continued.day, 47);
  assert.equal(continued.phase, "running");

  const zeroUsers = createInitialGame(303);
  zeroUsers.users = { tier: 0, casual: 0, collector: 0 };
  const ended = reduceGame(zeroUsers, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(ended.day, 47);
  assert.equal(ended.phase, "ended");
  assert.equal(ended.history.at(-1)?.totalUsers, 0);
});

test("restriction shock is delayed, dependency-weighted, bounded, and partly converts tier users", () => {
  const targetId = "cycle";
  const atGate = tuneRestrictionTarget(
    advanceRawToFirstBan(8055),
    targetId,
    60,
  );
  const usersAtDecision = structuredClone(atGate.users);
  const coreDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { "cycle-gate": 0 },
  });
  const minorDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: { "cycle-gate": 2 },
  });
  const noChangeDecision = reduceGame(atGate, {
    type: "SUBMIT_BAN",
    changes: {},
  });
  assert.deepEqual(coreDecision.users, usersAtDecision);
  assert.deepEqual(minorDecision.users, usersAtDecision);
  assert.deepEqual(noChangeDecision.users, usersAtDecision);
  assert.ok(
    noChangeDecision.community.some(
      (event) =>
        event.day === 45 &&
        event.type === "restriction-no-change" &&
        event.themeId === targetId &&
        event.previousValue === event.value,
    ),
  );

  const coreWithoutShock = structuredClone(coreDecision);
  for (const event of coreWithoutShock.community) {
    if (
      event.day === 45 &&
      event.themeId === targetId &&
      event.partId === "cycle-gate" &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction")
    ) {
      event.day = 44;
    }
  }
  const coreObserved = reduceGame(coreDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const coreControlObserved = reduceGame(coreWithoutShock, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const minorObserved = reduceGame(minorDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const noChangeObserved = reduceGame(noChangeDecision, {
    type: "ADVANCE_DAYS",
    days: 1,
  });

  assert.ok(coreObserved.users.tier < minorObserved.users.tier);
  assert.ok(minorObserved.users.tier < noChangeObserved.users.tier);
  assert.ok(coreObserved.users.tier < coreControlObserved.users.tier);
  assert.ok(coreObserved.users.casual > coreControlObserved.users.casual);
  assert.ok(
    coreDecision.users.tier - coreObserved.users.tier <
      coreDecision.users.tier * 0.04,
  );

  const secondDay = reduceGame(coreObserved, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const firstDayLoss = coreDecision.users.tier - coreObserved.users.tier;
  const secondDayLoss = coreObserved.users.tier - secondDay.users.tier;
  assert.ok(firstDayLoss > Math.max(0, secondDayLoss) * 4);
});

test("relief from an oppressive restriction offsets part of the tier-user shock", () => {
  const base = advanceRawToFirstBan(9156);
  const lowUnpleasant = tuneRestrictionTarget(base, "cycle", 56);
  const highUnpleasant = tuneRestrictionTarget(base, "cycle", 95);
  const observe = (state: State) =>
    reduceGame(
      reduceGame(state, {
        type: "SUBMIT_BAN",
        changes: { "cycle-gate": 0 },
      }),
      { type: "ADVANCE_DAYS", days: 1 },
    );

  const lowObserved = observe(lowUnpleasant);
  const highObserved = observe(highUnpleasant);
  assert.ok(highObserved.users.tier > lowObserved.users.tier);
});

test("support proposals have a thirty-day cooldown and are guaranteed on the next slate", () => {
  let state = createInitialGame(77);
  const targetId = state.activeThemeIds[0];
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: targetId,
    direction: "recovery",
  });

  assert.equal(state.supportRequests.length, 1);
  const firstRequest = state.supportRequests[0];
  assert.equal(firstRequest.proposedDay, 46);
  assert.equal(firstRequest.eligibleReleaseDay, 60);
  assert.equal(firstRequest.status, "queued");
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: state.activeThemeIds[1],
        direction: "counterplay",
      }),
    /30-day cooldown/,
  );

  state = advanceToFirstRelease(state);
  assert.ok(state.releaseSlate);
  const requestedOption = state.releaseSlate.options.find(
    (option) => option.requestId === firstRequest.id,
  );
  assert.ok(requestedOption);
  assert.equal(requestedOption.kind, "support");
  assert.equal(requestedOption.themeId, targetId);
  assert.equal(requestedOption.direction, "recovery");
  assert.equal(requestedOption.requested, true);
  assert.equal(
    state.supportRequests.find((request) => request.id === firstRequest.id)?.status,
    "offered",
  );

  const selected = [
    requestedOption,
    ...state.releaseSlate.options.filter(
      (option) => option.id !== requestedOption.id,
    ),
  ].slice(0, 3);
  state = reduceGame(state, {
    type: "SUBMIT_RELEASE",
    selections: selected.map((option) => ({
      optionId: option.id,
      powerAdjustment: 0,
    })),
  });
  assert.equal(state.supportRequests[0].status, "released");
  assert.equal(state.supportRequests[0].releasedDay, 60);

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
  assert.equal(state.day, 75);
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: state.activeThemeIds[1],
        direction: "counterplay",
      }),
    /30-day cooldown/,
  );
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  state = reduceGame(state, {
    type: "PROPOSE_SUPPORT",
    themeId: state.activeThemeIds[1],
    direction: "counterplay",
  });
  assert.equal(state.day, 76);
  assert.equal(state.supportRequests.length, 2);
  assert.equal(state.supportRequests[1].eligibleReleaseDay, 90);
});

test("support releases unlock exactly three prepared cards and stop after three waves", () => {
  let state = createInitialGame(7781);
  const targetId = state.activeThemeIds.find(
    (themeId) => state.themes[themeId].supportCount === 0,
  );
  assert.ok(targetId);
  const content = THEMES.find((theme) => theme.id === targetId);
  assert.ok(content);
  const launchUsage = content.parts
    .slice(0, 5)
    .reduce((total, part) => total + part.inclusion, 0) / 5;

  for (let wave = 1; wave <= 3; wave += 1) {
    state = reduceGame(state, {
      type: "PROPOSE_SUPPORT",
      themeId: targetId,
      direction: "consistency",
    });
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
    assert.equal(state.phase, "release-edit");
    assert.ok(state.releaseSlate);
    const requested = state.releaseSlate.options.find(
      (option) => option.requested && option.themeId === targetId,
    );
    assert.ok(requested);
    const selected = [
      requested,
      ...state.releaseSlate.options.filter((option) => option.id !== requested.id),
    ].slice(0, 3);
    state = reduceGame(state, {
      type: "SUBMIT_RELEASE",
      selections: selected.map((option) => ({
        optionId: option.id,
        powerAdjustment: 3,
      })),
    });
    if (wave === 3) {
      assert.equal(state.themes[targetId].supportCount, 2);
      assert.equal(getCommittedSupportCount(state, targetId), 3);
      assert.equal(canProposeSupport(state, targetId), false);
      assert.throws(
        () =>
          reduceGame(state, {
            type: "PROPOSE_SUPPORT",
            themeId: targetId,
            direction: "recovery",
          }),
        /at most three times/,
      );
    }
    state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });

    const runtime: State["themes"][string] = state.themes[targetId];
    const expectedCount = 5 + wave * 3;
    assert.equal(runtime.supportCount, wave);
    assert.equal(runtime.releasedPartIds.length, expectedCount);
    assert.deepEqual(
      runtime.releasedPartIds,
      content.parts.slice(0, expectedCount).map((part) => part.id),
    );
    assert.equal(Object.keys(runtime.legalLimits).length, expectedCount);
    assert.equal(Object.keys(runtime.partStats).length, expectedCount);
    assert.equal(runtime.lastSupportAdjustment, 3);
    assert.equal(runtime.supportReplacementPressure, 0.48);

    if (wave < 3) {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 15 });
    }
  }

  const runtime = state.themes[targetId];
  const oldUsage = content.parts
    .slice(0, 5)
    .reduce((total, part) => total + runtime.partStats[part.id].usageRate, 0) / 5;
  const newestUsage = content.parts
    .slice(11, 14)
    .reduce((total, part) => total + runtime.partStats[part.id].usageRate, 0) / 3;
  assert.ok(oldUsage < launchUsage * 0.6);
  assert.ok(newestUsage > oldUsage);
  assert.throws(
    () =>
      reduceGame(state, {
        type: "PROPOSE_SUPPORT",
        themeId: targetId,
        direction: "recovery",
      }),
    /at most three times/,
  );

  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 135);
  state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  state = reduceGame(state, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(state.day, 150);
  assert.ok(
    state.releaseSlate?.options.every(
      (option) => option.kind !== "support" || option.themeId !== targetId,
    ),
  );
});

test("day 60 release review offers exactly three new themes and three supports", () => {
  const state = advanceToFirstRelease(createInitialGame(321));
  assert.ok(state.releaseSlate);
  assert.equal(state.releaseSlate.day, 60);
  assert.equal(state.releaseSlate.options.length, 6);
  assert.equal(
    state.releaseSlate.options.filter((option) => option.kind === "new-theme")
      .length,
    3,
  );
  assert.equal(
    state.releaseSlate.options.filter((option) => option.kind === "support")
      .length,
    3,
  );
  assert.ok(
    state.releaseSlate.options
      .filter((option) => option.kind === "new-theme")
      .every((option) => !state.activeThemeIds.includes(option.themeId)),
  );
  assert.ok(
    state.releaseSlate.options
      .filter((option) => option.kind === "support")
      .every((option) => state.activeThemeIds.includes(option.themeId)),
  );
});

test("release submission requires three unique valid selections and applies their adjustments", () => {
  const atRelease = advanceToFirstRelease(createInitialGame(654));
  assert.ok(atRelease.releaseSlate);
  const newOptions = atRelease.releaseSlate.options.filter(
    (option) => option.kind === "new-theme",
  );
  const supportOption = atRelease.releaseSlate.options.find(
    (option) => option.kind === "support",
  );
  assert.equal(newOptions.length, 3);
  assert.ok(supportOption);

  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: newOptions.slice(0, 2).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      }),
    /Exactly three release options/,
  );
  assert.throws(
    () =>
      reduceGame(atRelease, {
        type: "SUBMIT_RELEASE",
        selections: [
          { optionId: newOptions[0].id, powerAdjustment: 0 },
          { optionId: newOptions[1].id, powerAdjustment: 0 },
          { optionId: supportOption.id, powerAdjustment: 4 },
        ],
      } as never),
    /integer from -3 to 3/,
  );

  const selected = [
    { option: newOptions[0], adjustment: -3 as const },
    { option: newOptions[1], adjustment: 3 as const },
    { option: supportOption, adjustment: 0 as const },
  ];
  const supportBefore = atRelease.themes[supportOption.themeId].supportPower;
  const activeBefore = [...atRelease.activeThemeIds];
  const usersBefore = { ...atRelease.users };
  const sharesBefore = Object.fromEntries(
    activeBefore.map((themeId) => [themeId, atRelease.themes[themeId].share]),
  );
  const released = reduceGame(atRelease, {
    type: "SUBMIT_RELEASE",
    selections: selected.map(({ option, adjustment }) => ({
      optionId: option.id,
      powerAdjustment: adjustment,
    })),
  });

  assert.equal(atRelease.phase, "release-edit", "the reducer must not mutate its input");
  assert.equal(released.day, 60);
  assert.equal(released.phase, "running");
  assert.equal(released.releaseSlate, null);
  assert.deepEqual(released.activeThemeIds, activeBefore);
  assert.ok(!released.activeThemeIds.includes(newOptions[0].themeId));
  assert.ok(!released.activeThemeIds.includes(newOptions[1].themeId));
  assert.ok(!released.activeThemeIds.includes(newOptions[2].themeId));
  assert.equal(released.themes[supportOption.themeId].supportPower, supportBefore);
  assert.deepEqual(released.users, usersBefore);
  assert.deepEqual(
    Object.fromEntries(
      activeBefore.map((themeId) => [themeId, released.themes[themeId].share]),
    ),
    sharesBefore,
  );
  assert.equal(
    released.community.filter(
      (event) =>
        event.day === 60 &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    0,
  );
  assert.ok(released.finance.today > atRelease.history.at(-1)!.revenue);
  assert.equal(released.releaseHistory.length, 2);
  assert.equal(released.releaseHistory[1].day, 60);
  assert.deepEqual(
    released.releaseHistory[1].products.map((product) => ({
      optionId: product.optionId,
      powerAdjustment: product.powerAdjustment,
    })),
    selected.map(({ option, adjustment }) => ({
      optionId: option.id,
      powerAdjustment: adjustment,
    })),
  );

  const observed = reduceGame(released, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(observed.day, 61);
  assert.equal(observed.activeThemeIds.length, activeBefore.length + 2);
  assert.ok(observed.activeThemeIds.includes(newOptions[0].themeId));
  assert.ok(observed.activeThemeIds.includes(newOptions[1].themeId));
  assert.ok(observed.themes[supportOption.themeId].supportPower > supportBefore);
  assert.equal(observed.themes[supportOption.themeId].lastSupportDay, 60);
  assert.equal(
    observed.community.filter(
      (event) =>
        event.day === 61 &&
        (event.type === "release-reaction" || event.type === "support-released"),
    ).length,
    3,
  );

  for (const { option, adjustment } of selected.slice(0, 2)) {
    const content = THEMES.find((theme) => theme.id === option.themeId);
    assert.ok(content);
    assert.ok(
      Math.abs(
        observed.themes[option.themeId].power -
          (content.basePower + adjustment * 2.2),
      ) < 1e-9,
    );
  }
});

test("keeps shares finite and normalized through every release and restriction gate", () => {
  let state = createInitialGame(999);
  let reviews = 0;

  while (state.phase !== "ended" && state.day < 1000) {
    if (state.phase === "release-edit") {
      assert.equal(state.releaseSlate?.options.length, 6);
      state = submitFirstThree(state, [-1, 0, 1]);
      reviews += 1;
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
      reviews += 1;
    } else {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 180 });
    }

    assertHealthyShares(state);
    assert.ok(reviews < 100, "the simulation should continue past every review");
  }

  assert.equal(state.day, 1000);
  assert.equal(state.phase, "ended");
  assert.equal(state.releaseHistory.length, 33);
  assert.equal(state.activeThemeIds.length, 100);
  assertHealthyShares(state);
});

test("keeps six choices when a support-heavy strategy exhausts eligible themes", () => {
  let state = createInitialGame(10_031);
  let releaseReviews = 0;

  while (state.phase !== "ended") {
    if (state.phase === "release-edit") {
      assert.ok(state.releaseSlate);
      assert.equal(state.releaseSlate.options.length, 6);
      const supportFirst = [
        ...state.releaseSlate.options.filter((option) => option.kind === "support"),
        ...state.releaseSlate.options.filter((option) => option.kind === "new-theme"),
      ];
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: supportFirst.slice(0, 3).map((option) => ({
          optionId: option.id,
          powerAdjustment: 0,
        })),
      });
      releaseReviews += 1;
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
    } else {
      state = reduceGame(state, { type: "ADVANCE_DAYS", days: 1000 });
    }
  }

  assert.equal(state.day, 1000);
  assert.equal(releaseReviews, 32);
});
