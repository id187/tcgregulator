import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyCampaignGrowth,
  classifyRegularReleaseReport,
  classifyReprintReleaseReport,
  classifyRestrictionReport,
  getCampaignGrowthIndex,
  type RegularReleaseReportSignals,
  type ReprintReleaseReportSignals,
  type RestrictionReportSignals,
} from "../app/game/decision-reports.ts";

test("company growth uses users and revenue without treating investment cash drawdown as decline", () => {
  assert.deepEqual(
    [
      { userRate: 0.4, revenueRate: 0.8 },
      { userRate: 0.2, revenueRate: 0.2 },
      { userRate: 0.03, revenueRate: -0.03 },
      { userRate: -0.2, revenueRate: -0.25 },
      { userRate: -0.4, revenueRate: -0.55 },
    ].map(classifyCampaignGrowth),
    ["breakout", "growing", "holding", "declining", "critical"],
  );
  assert.equal(
    getCampaignGrowthIndex({ userRate: 0.2, revenueRate: 0.2 }),
    120,
  );
});

test("restriction reports branch across stable, costly, failed, replacement, and mixed outcomes", () => {
  const base = {
    topShareDelta: 0,
    targetedShareDelta: 0,
    userRateDelta: 0,
    trustDelta: 0,
  };
  const cases: Array<[RestrictionReportSignals, string]> = [
    [{ ...base, classification: "stabilized" }, "restriction-stabilized"],
    [
      { ...base, classification: "stabilized", trustDelta: -4 },
      "restriction-stabilized-at-cost",
    ],
    [{ ...base, classification: "ineffective" }, "restriction-ineffective"],
    [{ ...base, classification: "overcorrected" }, "restriction-overcorrected"],
    [{ ...base, classification: "replacement" }, "restriction-replacement"],
    [
      {
        ...base,
        classification: "mixed",
        topShareDelta: -0.005,
        targetedShareDelta: -0.02,
      },
      "restriction-partial",
    ],
    [{ ...base, classification: "mixed" }, "restriction-mixed"],
    [{ ...base, classification: "pending" }, "restriction-pending"],
  ];

  assert.deepEqual(
    cases.map(([signals]) => classifyRestrictionReport(signals)),
    cases.map(([, expected]) => expected),
  );
});

test("regular release reports use explicit severity-first precedence for six outcomes", () => {
  const cases: Array<[RegularReleaseReportSignals, string]> = [
    [
      { revenueDelta: 2, healthDelta: -6, userDelta: 500, trustDelta: 0 },
      "regular-power-creep-crisis",
    ],
    [
      { revenueDelta: 1, healthDelta: -2, userDelta: 100, trustDelta: 0 },
      "regular-commercial-backlash",
    ],
    [
      { revenueDelta: 1, healthDelta: 2, userDelta: 100, trustDelta: 0 },
      "regular-blockbuster",
    ],
    [
      { revenueDelta: 0.2, healthDelta: 3, userDelta: 100, trustDelta: 0 },
      "regular-ecosystem-builder",
    ],
    [
      { revenueDelta: -0.5, healthDelta: 0, userDelta: -1, trustDelta: 0 },
      "regular-launch-miss",
    ],
    [
      { revenueDelta: 0.2, healthDelta: 0, userDelta: 20, trustDelta: 0 },
      "regular-steady-start",
    ],
  ];

  assert.deepEqual(
    cases.map(([signals]) => classifyRegularReleaseReport(signals)),
    cases.map(([, expected]) => expected),
  );
});

test("reprint reports distinguish crash, confidence shock, supply miss, access win, and balance", () => {
  const cases: Array<[ReprintReleaseReportSignals, string]> = [
    [
      {
        averagePriceRate: -0.4,
        totalAccess: 200,
        totalCollectorLoss: 20,
        trustDelta: -1,
      },
      "reprint-price-crash",
    ],
    [
      {
        averagePriceRate: -0.2,
        totalAccess: 100,
        totalCollectorLoss: 120,
        trustDelta: -2,
      },
      "reprint-collector-shock",
    ],
    [
      {
        averagePriceRate: -0.03,
        totalAccess: 200,
        totalCollectorLoss: 10,
        trustDelta: -1,
      },
      "reprint-supply-miss",
    ],
    [
      {
        averagePriceRate: -0.2,
        totalAccess: 180,
        totalCollectorLoss: 100,
        trustDelta: -2,
      },
      "reprint-access-restored",
    ],
    [
      {
        averagePriceRate: -0.2,
        totalAccess: 120,
        totalCollectorLoss: 100,
        trustDelta: -2,
      },
      "reprint-balanced-reset",
    ],
  ];

  assert.deepEqual(
    cases.map(([signals]) => classifyReprintReleaseReport(signals)),
    cases.map(([, expected]) => expected),
  );
});

test("formal report UI renders the branch id and a follow-up recommendation", () => {
  const overlaySource = readFileSync(
    fileURLToPath(
      new URL("../app/components/ReportArrivalOverlay.tsx", import.meta.url),
    ),
    "utf8",
  );
  assert.match(overlaySource, /data-report-type=\{report\.reportType\}/);
  assert.match(overlaySource, /report-arrival-recommendation/);
  assert.match(overlaySource, /\{report\.recommendation\}/);
  assert.match(overlaySource, /회사 성장지수/);
  assert.match(overlaySource, /report\.growth\.index/);
  assert.match(overlaySource, /report\.growth\.comparison/);
  assert.match(overlaySource, /report\.decision\.headline/);
  assert.match(overlaySource, /ReportMetricValue/);
});
