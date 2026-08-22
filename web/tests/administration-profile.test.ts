import assert from "node:assert/strict";
import test from "node:test";

import { getAdministrationProfile } from "../app/game/administration-profile.ts";
import { createInitialGame } from "../app/game/engine.ts";
import type { GameState } from "../app/game/types.ts";

function addRestrictionDecision(
  state: GameState,
  day: number,
  previousValue: number,
  value: number,
): void {
  const themeId = state.activeThemeIds[0];
  const partId = state.themes[themeId].releasedPartIds[0];
  state.community.push({
    id: `identity-restriction-${day}`,
    day,
    category: "restriction",
    type: previousValue === value
      ? "restriction-no-change"
      : "restriction-applied",
    themeId,
    partId,
    previousValue,
    value,
    body: "운영 노선 판정용 결정 기록",
  });
}

function addPoweredRelease(
  state: GameState,
  day: number,
  powerAdjustment: 3,
): void {
  const themeId = state.activeThemeIds[0];
  state.releaseHistory.push({
    day,
    releaseKind: "regular",
    products: [{
      kind: "support",
      optionId: `identity-release-${day}`,
      themeId,
      direction: "finisher",
      expectedTier: "Tier 0",
      powerAdjustment,
    }],
  });
}

test("administration identity is inferred from committed decisions", () => {
  const order = createInitialGame(4101);
  addRestrictionDecision(order, 40, 3, 1);
  addRestrictionDecision(order, 80, 3, 0);
  assert.equal(getAdministrationProfile(order, 80).id, "competitive-order");

  const growth = createInitialGame(4102);
  growth.operations.strategy.audience = 70;
  growth.operations.strategy.posture = 60;
  addPoweredRelease(growth, 10, 3);
  addPoweredRelease(growth, 30, 3);
  assert.equal(getAdministrationProfile(growth, 30).id, "growth-drive");
});

test("cash, trust, users, and ending outcomes cannot rewrite the recorded identity", () => {
  const state = createInitialGame(4103);
  addRestrictionDecision(state, 40, 3, 1);
  addRestrictionDecision(state, 80, 3, 0);
  const alteredOutcome = structuredClone(state);
  alteredOutcome.finance.cash = 999;
  alteredOutcome.purchaseTrust = 0;
  alteredOutcome.users = { tier: 1, casual: 1, collector: 1 };

  assert.equal(
    getAdministrationProfile(alteredOutcome, 80).id,
    getAdministrationProfile(state, 80).id,
  );
});

test("early reports describe a forming line without forcing an archetype choice", () => {
  const state = createInitialGame(4104);
  const profile = getAdministrationProfile(state, 9);

  assert.equal(profile.id, "adaptive-balance");
  assert.equal(profile.confidence, "forming");
  assert.match(profile.marketReading, /시장 해석/);
});
