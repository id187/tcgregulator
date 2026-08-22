import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialGame,
  getPrologueReleaseCommand,
  getPrologueReleasePlan,
  isPrologueReleaseSubmission,
  reduceGame,
} from "../app/game/engine.ts";
import { getDecisionReportsArriving } from "../app/game/decision-reports.ts";
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

test("the D+9 report reads finance-chart revenue in eok without converting it again", () => {
  const releaseEdit = reachGuidedRelease(createInitialGame(72_003));
  const released = reduceGame(
    releaseEdit,
    getPrologueReleaseCommand(releaseEdit),
  );
  const reported = reduceGame(released, { type: "ADVANCE_DAYS", days: 100 });
  assert.equal(reported.day, 19);

  const report = getDecisionReportsArriving(released, reported).find(
    (candidate) => candidate.kind === "regular-release",
  );
  assert.ok(report);
  const revenueMetric = report.metrics.find((metric) =>
    metric.label.includes("매출")
  );
  assert.ok(revenueMetric);

  const averageRevenue = (from: number, to: number) => {
    const rows = reported.history.filter(
      (row) => row.day >= from && row.day <= to,
    );
    return rows.reduce((sum, row) => sum + row.revenue, 0) / rows.length;
  };
  const beforeRevenue = averageRevenue(3, 9);
  const afterRevenue = averageRevenue(11, 17);
  const expectedDelta = afterRevenue - beforeRevenue;
  assert.ok(Math.abs((revenueMetric.delta ?? 0) - expectedDelta) < 1e-9);
  assert.equal(
    revenueMetric.before,
    `₩${Math.round(beforeRevenue * 10_000).toLocaleString("ko-KR")}만`,
  );
  assert.equal(
    revenueMetric.after,
    `₩${Math.round(afterRevenue * 10_000).toLocaleString("ko-KR")}만`,
  );
  const previousReportUsers = reported.history.find((row) => row.day === 9)
    ?.totalUsers;
  const currentReportUsers = reported.history.find((row) => row.day === 19)
    ?.totalUsers;
  assert.ok(previousReportUsers);
  assert.ok(currentReportUsers);
  const userPercent = Number(
    (((currentReportUsers - previousReportUsers) / previousReportUsers) * 100)
      .toFixed(1),
  );
  assert.match(
    report.growth.basis,
    new RegExp(`활성 유저 ${userPercent > 0 ? "\\+" : ""}${userPercent.toFixed(1)}%`),
  );
});

test("support, indirect, and target requests share one regular-release slot", () => {
  let state = createInitialGame(72_002);
  const themeId = state.activeThemeIds[0];
  const requests: ReleaseRequestInput[] = [
    { kind: "support", themeId, direction: "consistency" },
    { kind: "indirect-support", themeId },
    { kind: "environment-target", themeId },
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
    false,
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
  assert.equal(released.supportRequests[0].status, "replaced");
  assert.equal(released.supportRequests[1].status, "replaced");
  assert.equal(released.supportRequests[2].status, "released");
  assert.equal(
    released.supportRequests.some((request) => request.kind === "reprint"),
    false,
  );
});
