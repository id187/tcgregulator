import assert from "node:assert/strict";
import test from "node:test";

import { buildDistributionEntries } from "../app/game/distribution-model.ts";
import { createInitialGame } from "../app/game/engine.ts";
import { getRecentPlacementReport } from "../app/game/placement-meta.ts";

test("orders top-cut themes by placement share and keeps 기타 last", () => {
  const state = createInitialGame(0x5eed1234);
  const report = getRecentPlacementReport(state.history, state.seed, state.day);
  const entries = buildDistributionEntries(state, report, "top-cut");
  const named = entries.filter((entry) => entry.id !== "tier-three-other");
  assert.deepEqual(
    named.map((entry) => entry.rawShare),
    [...named]
      .sort(
        (left, right) =>
          right.rawShare - left.rawShare || left.id.localeCompare(right.id),
      )
      .map((entry) => entry.rawShare),
  );
  const otherIndex = entries.findIndex(
    (entry) => entry.id === "tier-three-other",
  );
  if (otherIndex >= 0) assert.equal(otherIndex, entries.length - 1);
  assert.ok(
    Math.abs(entries.reduce((sum, entry) => sum + entry.share, 0) - 1) <
      1e-9,
  );
});

test("user segments preserve the exact active-user total", () => {
  const state = createInitialGame(0xdecafbad);
  state.users = { tier: 1_234, casual: 2_345, collector: 3_421 };
  const report = getRecentPlacementReport(state.history, state.seed, state.day);
  const users = buildDistributionEntries(state, report, "users");

  assert.equal(
    users.reduce((sum, entry) => sum + entry.count, 0),
    state.users.tier + state.users.casual + state.users.collector,
  );
  assert.equal(
    users
      .filter((entry) =>
        entry.segmentId === "collector" || entry.segmentId === "reseller"
      )
      .reduce((sum, entry) => sum + entry.count, 0),
    state.users.collector,
  );
  assert.ok(
    Math.abs(users.reduce((sum, entry) => sum + entry.share, 0) - 1) < 1e-9,
  );
});

test("user segments are deterministic, descending, and never theme slices", () => {
  const state = createInitialGame(0x600dcafe);
  const report = getRecentPlacementReport(state.history, state.seed, state.day);
  const first = buildDistributionEntries(state, report, "users");
  const second = buildDistributionEntries(state, report, "users");

  assert.deepEqual(first, second);
  assert.deepEqual(
    new Set(first.map((entry) => entry.segmentId)),
    new Set(["meta", "casual", "collector", "reseller"]),
  );
  assert.ok(
    first.every(
      (entry) =>
        entry.kind === "player-segment" &&
        entry.themeId === null &&
        entry.id !== "tier-three-other" &&
        entry.memberThemeIds.length === 0 &&
        !state.activeThemeIds.includes(entry.id),
    ),
  );
  assert.deepEqual(
    first.map((entry) => entry.rawShare),
    [...first]
      .sort(
        (left, right) =>
          right.rawShare - left.rawShare || left.id.localeCompare(right.id),
      )
      .map((entry) => entry.rawShare),
  );
});

test("a recent release creates a temporary reseller bump", () => {
  const oldRelease = createInitialGame(0x12345678);
  oldRelease.day = 60;
  oldRelease.users = { tier: 3_500, casual: 4_500, collector: 10_000 };
  oldRelease.releaseHistory = [{ day: 30, products: [] }];
  const recentRelease = structuredClone(oldRelease);
  recentRelease.releaseHistory = [{ day: 60, products: [] }];
  const report = getRecentPlacementReport(
    oldRelease.history,
    oldRelease.seed,
    oldRelease.day,
  );

  const oldResellers = buildDistributionEntries(
    oldRelease,
    report,
    "users",
  ).find((entry) => entry.segmentId === "reseller")!;
  const recentResellers = buildDistributionEntries(
    recentRelease,
    report,
    "users",
  ).find((entry) => entry.segmentId === "reseller")!;

  assert.ok(recentResellers.count > oldResellers.count);
  assert.ok(recentResellers.share > oldResellers.share);
});
