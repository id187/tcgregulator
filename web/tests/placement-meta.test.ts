import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_TOP_CUT_SLOTS,
  getDailyTopCutPlacements,
  getDeterministicDailyTopCutPlacements,
  getPlacementTier,
  getRecentPlacementReport,
  getThemeDebutDay,
  getTopCutPropensity,
  type PlacementHistoryEntry,
} from "../app/game/placement-meta.ts";
import type { ThemeId } from "../app/game/types.ts";

const cycle = "cycle" as ThemeId;
const whiteNight = "white-night" as ThemeId;
const ironblood = "ironblood" as ThemeId;

function placementInput(order: "forward" | "reverse" = "forward") {
  const pairs: Array<[ThemeId, number]> = [
    [cycle, 0.5],
    [whiteNight, 0.3],
    [ironblood, 0.2],
  ];
  const ordered = order === "forward" ? pairs : [...pairs].reverse();
  return {
    seed: 101,
    day: 180,
    shares: Object.fromEntries(ordered) as Record<ThemeId, number>,
    winRates: {
      [cycle]: 0.48,
      [whiteNight]: 0.55,
      [ironblood]: 0.52,
    } as Record<ThemeId, number>,
  };
}

test("models a seven-round five-win top-cut propensity", () => {
  assert.equal(getTopCutPropensity(0), 0);
  assert.equal(getTopCutPropensity(0.5), 0.2265625);
  assert.equal(getTopCutPropensity(1), 1);
  assert.ok(getTopCutPropensity(0.45) < getTopCutPropensity(0.5));
  assert.ok(getTopCutPropensity(0.5) < getTopCutPropensity(0.55));
  assert.equal(getTopCutPropensity(Number.NaN), 0.2265625);
});

test("allocates 32 deterministic integer slots independent of key order", () => {
  const first = getDeterministicDailyTopCutPlacements(placementInput());
  const replay = getDeterministicDailyTopCutPlacements(placementInput());
  const reordered = getDeterministicDailyTopCutPlacements(
    placementInput("reverse"),
  );

  assert.deepEqual(first, replay);
  assert.deepEqual(first, reordered);
  assert.equal(
    Object.values(first).reduce((sum, count) => sum + count, 0),
    DAILY_TOP_CUT_SLOTS,
  );
  assert.ok(Object.values(first).every((count) => Number.isInteger(count) && count >= 0));

  const strongerSleeper = getDeterministicDailyTopCutPlacements({
    ...placementInput(),
    winRates: {
      [cycle]: 0.48,
      [whiteNight]: 0.55,
      [ironblood]: 0.8,
    } as Record<ThemeId, number>,
  });
  assert.ok(strongerSleeper[ironblood] > first[ironblood]);
});

test("uses saved placement counts and reconstructs legacy history deterministically", () => {
  const base = placementInput();
  const legacy = {
    day: base.day,
    shares: base.shares,
    winRates: base.winRates,
  } as PlacementHistoryEntry;
  const reconstructed = getDailyTopCutPlacements(legacy, base.seed);
  assert.deepEqual(
    reconstructed,
    getDeterministicDailyTopCutPlacements(base),
  );

  const saved = {
    ...legacy,
    topCutPlacements: reconstructed,
  } as PlacementHistoryEntry;
  const savedRead = getDailyTopCutPlacements(saved, 999_999);
  assert.deepEqual(savedRead, reconstructed);
  assert.notStrictEqual(savedRead, reconstructed);
  savedRead[cycle] += 1;
  assert.equal(saved.topCutPlacements?.[cycle], reconstructed[cycle]);
});

test("aggregates an inclusive recent-30-day report with observed conversion", () => {
  const history = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    return {
      day,
      shares: {
        [cycle]: 0.75,
        [whiteNight]: 0.25,
      },
      winRates: {
        [cycle]: 0.5,
        [whiteNight]: 0.5,
      },
      topCutPlacements:
        day === 1
          ? { [cycle]: 0, [whiteNight]: DAILY_TOP_CUT_SLOTS }
          : { [cycle]: 24, [whiteNight]: 8 },
    } as PlacementHistoryEntry;
  });
  const report = getRecentPlacementReport(history, 202, 31);

  assert.equal(report.startDay, 2);
  assert.equal(report.recordedDays, 30);
  assert.equal(report.totalPlacements, 30 * DAILY_TOP_CUT_SLOTS);
  assert.equal(report.themes[cycle].placementShare, 0.75);
  assert.equal(report.themes[whiteNight].placementShare, 0.25);
  assert.equal(report.themes[cycle].estimatedEntrants, 30 * 400 * 0.75);
  assert.equal(
    report.themes[cycle].observedConversion,
    (30 * 24) / (30 * 400 * 0.75),
  );
  assert.equal(
    Object.values(report.themes).reduce(
      (sum, theme) => sum + theme.placementShare,
      0,
    ),
    1,
  );
});

test("applies absolute placement tiers and a seven-day provisional floor", () => {
  assert.deepEqual(getPlacementTier(0.65), { tier: "Tier 0", provisional: false });
  assert.equal(getPlacementTier(0.649999).tier, "Tier 1");
  assert.equal(getPlacementTier(0.15).tier, "Tier 1");
  assert.equal(getPlacementTier(0.149999).tier, "Tier 2");
  assert.equal(getPlacementTier(0.05).tier, "Tier 2");
  assert.equal(getPlacementTier(Number.EPSILON).tier, "Tier 3");
  assert.equal(getPlacementTier(0).tier, "Tier Out");

  assert.deepEqual(getPlacementTier(0, 106, 100), {
    tier: "Tier 3",
    provisional: true,
  });
  assert.deepEqual(getPlacementTier(0.2, 106, 100), {
    tier: "Tier 1",
    provisional: true,
  });
  assert.deepEqual(getPlacementTier(0, 107, 100), {
    tier: "Tier Out",
    provisional: false,
  });
});

test("derives a debut from new-theme products without resetting it for support", () => {
  const releaseHistory = [
    {
      day: 60,
      products: [
        { kind: "new-theme", themeId: cycle },
        { kind: "support", themeId: whiteNight },
      ],
    },
    {
      day: 90,
      products: [{ kind: "support", themeId: cycle }],
    },
  ] as unknown as Parameters<typeof getThemeDebutDay>[0];

  assert.equal(getThemeDebutDay(releaseHistory, cycle), 61);
  assert.equal(getThemeDebutDay(releaseHistory, whiteNight), null);
});
