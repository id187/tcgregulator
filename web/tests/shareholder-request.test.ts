import assert from "node:assert/strict";
import test from "node:test";

import { getAutomaticReleaseSelections } from "../app/game/automatic-release.ts";
import { BUSINESS_EVENT_BY_TYPE } from "../app/game/business-events.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import {
  createInitialGame,
  reduceGame,
} from "../app/game/engine.ts";
import {
  FIRST_SHAREHOLDER_REQUEST_DAY,
  FIRST_SHAREHOLDER_REQUEST_DEADLINE_DAY,
  FIRST_SHAREHOLDER_REQUEST_FAILURE_PENALTY_CASH,
  FIRST_SHAREHOLDER_REQUEST_REWARD_CASH,
  SHAREHOLDER_REQUEST_INTERVAL_DAYS,
  getShareholderRequestProgress,
} from "../app/game/shareholder-request.ts";
import type { GameState } from "../app/game/types.ts";

function settleUntil(state: GameState, targetDay: number): GameState {
  let next = state;
  for (let guard = 0; guard < 2_000 && next.day < targetDay; guard += 1) {
    if (next.shareholder.request?.status === "pending") {
      next = reduceGame(next, {
        type: "RESPOND_SHAREHOLDER_REQUEST",
        accept: true,
      });
    } else if (next.operations.pendingEvent) {
      const event = next.operations.pendingEvent;
      const choice = BUSINESS_EVENT_BY_TYPE[event.type].choices.find(
        (candidate) => candidate.cost <= next.finance.cash + 1e-9,
      );
      assert.ok(choice);
      next = reduceGame(next, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: event.id,
        choice: choice.id,
      });
    } else if (next.phase === "release-edit") {
      next = reduceGame(next, {
        type: "SUBMIT_RELEASE",
        selections: getAutomaticReleaseSelections(next),
      });
    } else if (next.phase === "ban-edit") {
      next = reduceGame(next, { type: "SUBMIT_BAN", changes: {} });
    } else {
      next = reduceGame(next, { type: "ADVANCE_DAYS", days: 1 });
    }
  }
  assert.equal(next.day, targetDay);
  return next;
}

test("DAY 25 opens the first optional shareholder request", () => {
  let state = settleUntil(
    createInitialGame(92_000),
    FIRST_SHAREHOLDER_REQUEST_DAY,
  );

  const request = state.shareholder.request;
  assert.ok(request);
  assert.equal(state.day, FIRST_SHAREHOLDER_REQUEST_DAY);
  assert.equal(request.offeredDay, FIRST_SHAREHOLDER_REQUEST_DAY);
  assert.equal(request.kind, "suppress-tier2");
  assert.equal(
    getShareholderRequestProgress(state, request, state.day).rank,
    1,
  );
  assert.equal(request.rewardCash, FIRST_SHAREHOLDER_REQUEST_REWARD_CASH);
  assert.equal(request.status, "pending");
  assert.equal(state.shareholder.releasePlanningUnlocked, false);

  state = reduceGame(state, {
    type: "RESPOND_SHAREHOLDER_REQUEST",
    accept: false,
  });
  assert.equal(state.shareholder.request?.status, "declined");
  assert.equal(state.shareholder.releasePlanningUnlocked, false);
  state = reduceGame(state, { type: "UNLOCK_RELEASE_PLANNING" });
  assert.equal(state.shareholder.releasePlanningUnlocked, true);
});

test("large advances stop on the shareholder offer's exact arrival day", () => {
  const beforeOffer = settleUntil(
    createInitialGame(92_001),
    FIRST_SHAREHOLDER_REQUEST_DAY - 1,
  );
  const arrived = reduceGame(beforeOffer, {
    type: "ADVANCE_DAYS",
    days: 1_000,
  });
  assert.equal(arrived.day, FIRST_SHAREHOLDER_REQUEST_DAY);
  assert.equal(arrived.shareholder.request?.status, "pending");
  assert.equal(
    arrived.shareholder.request?.offeredDay,
    FIRST_SHAREHOLDER_REQUEST_DAY,
  );
});

test("a successful accepted request pays exactly the promised cash at its deadline", () => {
  const state = settleUntil(
    createInitialGame(92_002),
    FIRST_SHAREHOLDER_REQUEST_DEADLINE_DAY - 1,
  );
  const request = state.shareholder.request;
  assert.ok(request && request.status === "accepted");
  assert.equal(request.kind, "suppress-tier2");

  const targetId = request.themeId;
  const fallbackId = state.activeThemeIds.find((themeId) => themeId !== targetId);
  assert.ok(fallbackId);
  for (const entry of state.history.filter(
    (row) => row.day >= request.deadlineDay - 6,
  )) {
    if (!entry.topCutPlacements) continue;
    for (const themeId of Object.keys(entry.topCutPlacements)) {
      entry.topCutPlacements[themeId] = themeId === fallbackId ? 32 : 0;
    }
  }

  const control = structuredClone(state);
  assert.ok(control.shareholder.request);
  control.shareholder.request.status = "declined";
  control.shareholder.request.resolvedDay = control.shareholder.request.responseDay;

  const rewarded = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const unrewarded = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(rewarded.shareholder.request?.status, "succeeded");
  assert.equal(
    Math.round((rewarded.finance.cash - unrewarded.finance.cash) * 100) / 100,
    FIRST_SHAREHOLDER_REQUEST_REWARD_CASH,
  );
  assert.equal(
    rewarded.history.at(-1)?.cash,
    rewarded.finance.cash,
  );
  const progress = getShareholderRequestProgress(
    rewarded,
    rewarded.shareholder.request!,
    rewarded.day,
  );
  assert.equal(progress.succeeded, true);
  assert.ok(["Tier 2", "Tier 3", "Tier Out"].includes(progress.tier));
  assert.ok(THEME_BY_ID[targetId]);
});

test("a failed accepted request charges the execution penalty up to available cash", () => {
  const state = settleUntil(
    createInitialGame(92_003),
    FIRST_SHAREHOLDER_REQUEST_DEADLINE_DAY - 1,
  );
  const request = state.shareholder.request;
  assert.ok(request && request.status === "accepted");

  const targetId = request.themeId;
  const fallbackId = state.activeThemeIds.find((themeId) => themeId !== targetId);
  assert.ok(fallbackId);
  for (const entry of state.history.filter(
    (row) => row.day >= request.deadlineDay - 6,
  )) {
    if (!entry.topCutPlacements) continue;
    for (const themeId of Object.keys(entry.topCutPlacements)) {
      entry.topCutPlacements[themeId] = themeId === fallbackId ? 32 : 0;
    }
  }

  const control = structuredClone(state);
  assert.ok(control.shareholder.request);
  control.shareholder.request.status = "declined";
  control.shareholder.request.resolvedDay = control.shareholder.request.responseDay;

  const penalized = reduceGame(state, { type: "ADVANCE_DAYS", days: 1 });
  const unpenalized = reduceGame(control, { type: "ADVANCE_DAYS", days: 1 });
  assert.equal(penalized.shareholder.request?.status, "failed");
  assert.equal(
    Math.round((unpenalized.finance.cash - penalized.finance.cash) * 100) / 100,
    Math.round(
      Math.min(
        FIRST_SHAREHOLDER_REQUEST_FAILURE_PENALTY_CASH,
        unpenalized.finance.cash,
      ) * 100,
    ) / 100,
  );
  assert.equal(penalized.history.at(-1)?.cash, penalized.finance.cash);
});

test("shareholder challenges return on a regular cadence", () => {
  const nextOfferDay =
    FIRST_SHAREHOLDER_REQUEST_DAY + SHAREHOLDER_REQUEST_INTERVAL_DAYS;
  let state = settleUntil(
    createInitialGame(92_004),
    FIRST_SHAREHOLDER_REQUEST_DAY,
  );
  state = reduceGame(state, {
    type: "RESPOND_SHAREHOLDER_REQUEST",
    accept: false,
  });
  state = reduceGame(state, { type: "UNLOCK_RELEASE_PLANNING" });
  state = settleUntil(state, nextOfferDay);
  const request = state.shareholder.request;
  assert.ok(request);
  assert.equal(request.id, "shareholder-request-2");
  assert.equal(request.offeredDay, nextOfferDay);
  assert.equal(request.deadlineDay, nextOfferDay + 30);
  assert.equal(request.status, "pending");
  assert.equal(state.shareholder.releasePlanningUnlocked, true);
});
