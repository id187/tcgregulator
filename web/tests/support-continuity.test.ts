import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { BUSINESS_EVENT_BY_TYPE } from "../app/game/business-events.ts";
import {
  createFirstBanGame,
  createInitialGame,
  reduceGame,
} from "../app/game/engine.ts";
import {
  MAX_DAILY_SUPPORT_NEGLECT_TRUST_LOSS,
  SUPPORT_NEGLECT_GRACE_DAYS,
  SUPPORT_NEGLECT_RAMP_DAYS,
  getSupportNeglectPressure,
  getThemeSupportNeglectSeverity,
} from "../app/game/support-continuity.ts";
import type { GameState } from "../app/game/types.ts";

function getPlannedReleaseSelections(state: GameState) {
  if (state.releaseSlate?.releaseKind === "reprint") {
    return getAutomaticReleaseSelections(state);
  }
  const options = state.releaseSlate?.options;
  assert.ok(options, "release-edit must expose a release slate");
  const selected = [
    ...options.filter((option) => option.kind === "new-theme").slice(0, 2),
    ...options.filter((option) => option.kind === "support").slice(0, 1),
    ...options.filter((option) => option.kind === "generic").slice(0, 1),
  ];
  assert.equal(selected.length, 4);
  return selected.map((option) => ({
    optionId: option.id,
    powerAdjustment: 0 as const,
  }));
}

function advanceThroughDesk(state: GameState, targetDay: number): GameState {
  let next = state;
  for (let guard = 0; guard < 1_000 && next.day < targetDay; guard += 1) {
    if (next.operations.pendingEvent) {
      const pending = next.operations.pendingEvent;
      const choice =
        BUSINESS_EVENT_BY_TYPE[pending.type].choices.find(
          (candidate) => candidate.cost === 0,
        )?.id ?? "a";
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice,
      });
    } else if (next.phase === "release-edit") {
      assert.ok(next.releaseSlate);
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: getPlannedReleaseSelections(next),
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, {
        type: "ADVANCE_DAYS",
        days: targetDay - next.day,
      });
    }
  }
  if (next.operations.pendingEvent) {
    const pending = next.operations.pendingEvent;
    const choice =
      BUSINESS_EVENT_BY_TYPE[pending.type].choices.find(
        (candidate) => candidate.cost === 0,
      )?.id ?? "a";
    next = reduceGame(next, {
      type: "CHOOSE_BUSINESS_EVENT",
      eventId: pending.id,
      choice,
    });
  }
  if (next.phase === "release-edit") {
    assert.ok(next.releaseSlate);
    next = reduceGame(next, {
      type: "SUBMIT_RELEASE",
      selections: getPlannedReleaseSelections(next),
    });
  }
  if (next.phase === "ban-edit") {
    next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
  }
  assert.equal(next.day, targetDay);
  assert.equal(next.phase, "running");
  return next;
}

test("support neglect has a grace period, a smooth ramp, and no survival tax", () => {
  const collapsed = {
    lastSupportDay: null,
    share: 0.001,
    supportCount: 0,
  };
  assert.equal(
    getThemeSupportNeglectSeverity(collapsed, SUPPORT_NEGLECT_GRACE_DAYS),
    0,
  );
  const midpoint = getThemeSupportNeglectSeverity(
    collapsed,
    SUPPORT_NEGLECT_GRACE_DAYS + SUPPORT_NEGLECT_RAMP_DAYS / 2,
  );
  const mature = getThemeSupportNeglectSeverity(
    collapsed,
    SUPPORT_NEGLECT_GRACE_DAYS + SUPPORT_NEGLECT_RAMP_DAYS,
  );
  assert.ok(midpoint > 0);
  assert.ok(midpoint < mature);

  assert.equal(
    getThemeSupportNeglectSeverity(
      { ...collapsed, lastSupportDay: 250 },
      250 + SUPPORT_NEGLECT_GRACE_DAYS,
    ),
    0,
  );
  assert.equal(
    getThemeSupportNeglectSeverity(
      { ...collapsed, share: 0.075 },
      500,
    ),
    0,
  );
});

test("portfolio pressure is continuous, capped, and exposes its top causes", () => {
  const state = createFirstBanGame(42_001);
  state.day = 400;
  const shares = [0.001, 0.02, 0.05, 0.1, 0.2];
  for (const [index, themeId] of state.activeThemeIds.entries()) {
    const runtime = state.themes[themeId];
    runtime.share = shares[index] ?? 0.001;
    runtime.lastSupportDay = null;
  }

  const pressure = getSupportNeglectPressure(state);
  assert.ok(pressure.portfolioLoad > 0);
  assert.ok(pressure.portfolioLoad < 1);
  assert.ok(pressure.dailyTrustLoss > 0);
  assert.ok(
    pressure.dailyTrustLoss <= MAX_DAILY_SUPPORT_NEGLECT_TRUST_LOSS,
  );
  assert.ok(pressure.neglectedThemeIds.length <= 3);
  assert.deepEqual(
    pressure.neglectedThemeIds,
    pressure.contributors.map((entry) => entry.themeId),
  );
  for (let index = 1; index < pressure.contributors.length; index += 1) {
    assert.ok(
      pressure.contributors[index - 1].severity >=
        pressure.contributors[index].severity,
    );
  }

  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].lastSupportDay = state.day;
  }
  assert.deepEqual(getSupportNeglectPressure(state), {
    portfolioLoad: 0,
    dailyTrustLoss: 0,
    neglectedThemeIds: [],
    contributors: [],
  });
});

test("daily neglect drift preserves trust above 90 and reaches users and sales", () => {
  const earnedTrust = createInitialGame(42_003);
  earnedTrust.purchaseTrust = 95;
  const earnedTrustNext = reduceGame(earnedTrust, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  assert.equal(earnedTrustNext.purchaseTrust, 95);

  let state = createFirstBanGame(42_002);
  state.finance.cash = 100;
  state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
  state = advanceThroughDesk(state, 280);

  const equalShare = 1 / state.activeThemeIds.length;
  for (const themeId of state.activeThemeIds) {
    state.themes[themeId].share = equalShare;
    state.themes[themeId].previousWeekShare = equalShare;
  }
  state.currentTopThemeId = state.activeThemeIds[0];

  const neglected = structuredClone(state);
  neglected.purchaseTrust = 60;
  neglected.users = { tier: 0, casual: 0, collector: 1_000_000 };
  const caredFor = structuredClone(neglected);
  for (const themeId of caredFor.activeThemeIds) {
    caredFor.themes[themeId].lastSupportDay = caredFor.day;
  }

  const neglectedNext = reduceGame(neglected, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const caredForNext = reduceGame(caredFor, {
    type: "ADVANCE_DAYS",
    days: 1,
  });
  const expectedLoss = getSupportNeglectPressure({
    ...neglected,
    day: neglected.day + 1,
  }).dailyTrustLoss;
  assert.ok(expectedLoss > 0);
  assert.ok(
    Math.abs(
      caredForNext.purchaseTrust -
        neglectedNext.purchaseTrust -
        expectedLoss,
    ) < 0.0001,
  );
  assert.ok(caredForNext.purchaseTrust > neglectedNext.purchaseTrust);
  assert.ok(caredForNext.users.collector > neglectedNext.users.collector);
  assert.ok(caredForNext.finance.today > neglectedNext.finance.today);
});
