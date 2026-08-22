import assert from "node:assert/strict";
import test from "node:test";

import { buildDistributionEntries } from "../app/game/distribution-model.ts";
import { buildDailyPlacementTransitionModel } from "../app/game/daily-placement-transition.ts";
import { getDailyCommunityPosts } from "../app/game/daily-community.ts";
import { THEME_BY_ID } from "../app/game/content.ts";
import { createInitialGame } from "../app/game/engine.ts";
import { withKoreanParticle } from "../app/game/korean-particles.ts";
import {
  applyDailyPlacementMicroEvent,
  getDailyPlacementMicroEvent,
  getNextPlacementMicroEventDay,
} from "../app/game/placement-micro-events.ts";
import { getRecentPlacementReport } from "../app/game/placement-meta.ts";
import type { DailyHistory, ThemeId } from "../app/game/types.ts";

test("daily placement transition names every placed theme without an 기타 bucket", () => {
  const previous = {
    alpha: 10,
    beta: 8,
    gamma: 6,
    delta: 4,
    epsilon: 2,
    zeta: 1,
    eta: 1,
  } as Record<ThemeId, number>;
  const current = {
    alpha: 3,
    beta: 7,
    gamma: 5,
    delta: 4,
    epsilon: 3,
    zeta: 2,
    eta: 8,
  } as Record<ThemeId, number>;
  const model = buildDailyPlacementTransitionModel(previous, current);

  assert.deepEqual(
    model.rows.map((row) => row.themeId),
    ["eta", "beta", "gamma", "delta", "alpha", "epsilon", "zeta"],
  );
  assert.equal(model.previousTotal, 32);
  assert.equal(model.currentTotal, 32);
  assert.equal(model.rows[0].rankDelta, 5);
  assert.deepEqual(
    model.rows.map((row) => [row.themeId, row.previousCount, row.currentCount]),
    [
      ["eta", 1, 8],
      ["beta", 8, 7],
      ["gamma", 6, 5],
      ["delta", 4, 4],
      ["alpha", 10, 3],
      ["epsilon", 2, 3],
      ["zeta", 1, 2],
    ],
  );
});

test("small placement events create exact shocks, recoveries, and persistent tier shifts", () => {
  const state = createInitialGame(0x4d455441);
  const themeIds = state.activeThemeIds.slice(0, 5);
  const baseCounts = [10, 8, 6, 5, 3];
  const history: DailyHistory[] = [];
  const events = [];

  for (let day = 0; day <= 300; day += 1) {
    const placements = Object.fromEntries(
      themeIds.map((themeId, index) => [themeId, baseCounts[index] ?? 0]),
    ) as Record<ThemeId, number>;
    const adjusted = applyDailyPlacementMicroEvent({
      day,
      history,
      placements,
      seed: state.seed,
    });
    const entry: DailyHistory = {
      day,
      totalUsers: 10_000,
      revenue: 10,
      topThemeId: themeIds[0],
      shares: Object.fromEntries(
        themeIds.map((themeId) => [themeId, 1 / themeIds.length]),
      ),
      topCutPlacements: adjusted,
    };
    history.push(entry);
    const event = getDailyPlacementMicroEvent(history, state.seed, day);
    if (event) events.push(event);
    assert.equal(Object.values(adjusted).reduce((sum, count) => sum + count, 0), 32);
    assert.ok(Object.values(adjusted).every((count) => count >= 0));
  }

  assert.ok(events.length >= 20);
  assert.ok(new Set(events.map((event) => event.kind)).size >= 5);
  assert.equal(
    getNextPlacementMicroEventDay(state.seed, 0, 300),
    events[0].day,
  );
  const shock = events.find(
    (event) => event.kind === "counter-breakthrough" && event.phase === "shock",
  );
  assert.ok(shock);
  const recovery = events.find(
    (event) =>
      event.kind === "counter-breakthrough" &&
      event.phase === "recovery" &&
      event.day === shock.day + 1 &&
      event.targetThemeId === shock.targetThemeId,
  );
  assert.ok(recovery);
  assert.ok(shock.currentCount < shock.previousCount);
  assert.ok(recovery.currentCount > recovery.previousCount);
  assert.equal(recovery.previousCount, shock.currentCount);

  const counterTierShift = events.find(
    (event) =>
      event.kind === "counter-breakthrough" &&
      event.phase === "settled" &&
      event.previousTier === "Tier 1" &&
      event.currentTier === "Tier 2",
  );
  assert.ok(counterTierShift);
  const researchTierShift = events.find(
    (event) =>
      event.kind === "lab-breakthrough" &&
      event.phase === "settled" &&
      event.previousTier === "Tier 2" &&
      event.currentTier === "Tier 1",
  );
  assert.ok(researchTierShift);
  assert.ok(researchTierShift.previousCount > 0);

  const researchSurge = events.find(
    (event) =>
      event.kind === "lab-breakthrough" && event.phase === "surge",
  );
  assert.ok(researchSurge);
  const zeroedResearchHistory = history.map((entry) => {
    if (entry.day !== researchSurge.day || !entry.topCutPlacements) return entry;
    const placements = { ...entry.topCutPlacements };
    const removed = placements[researchSurge.targetThemeId] ?? 0;
    const recipient = themeIds.find(
      (themeId) => themeId !== researchSurge.targetThemeId,
    );
    placements[researchSurge.targetThemeId] = 0;
    if (recipient) placements[recipient] = (placements[recipient] ?? 0) + removed;
    return { ...entry, topCutPlacements: placements };
  });
  assert.equal(
    getDailyPlacementMicroEvent(
      zeroedResearchHistory,
      state.seed,
      researchSurge.day,
    ),
    null,
  );

  const firstEvent = events[0];
  state.day = firstEvent.day;
  state.history = history.filter((entry) => entry.day <= firstEvent.day);
  const posts = getDailyCommunityPosts(state, firstEvent.day);
  assert.equal(posts.length, 20);
  assert.ok(
    posts.some(
      (post) =>
        post.id.startsWith("daily-placement-micro-") &&
        post.themeId === firstEvent.targetThemeId,
    ),
  );

  state.day = researchTierShift.day;
  state.history = history.filter((entry) => entry.day <= researchTierShift.day);
  const researchPosts = getDailyCommunityPosts(state, researchTierShift.day);
  assert.equal(researchPosts.length, 20);
  assert.ok(
    researchPosts.some(
      (post) =>
        post.id.startsWith("daily-placement-micro-") &&
        post.body.includes("연구 끝에"),
    ),
  );
  const researchThemeName =
    THEME_BY_ID[researchTierShift.targetThemeId].shortName;
  assert.ok(
    researchPosts.some(
      (post) =>
        post.id.startsWith("daily-placement-micro-") &&
        post.body.includes(
          `${withKoreanParticle(researchThemeName, "이/가")} 연구 끝에`,
        ),
    ),
  );
});

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
  oldRelease.releaseHistory = [
    { day: 30, releaseKind: "regular", products: [] },
  ];
  const recentRelease = structuredClone(oldRelease);
  recentRelease.releaseHistory = [
    { day: 60, releaseKind: "regular", products: [] },
  ];
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
