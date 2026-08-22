import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const pageSource = source("../app/page.tsx");
const releaseDecisionSource = source(
  "../app/components/ReleaseDecisionPanel.tsx",
);
const outcomeSource = source(
  "../app/components/DecisionOutcomeOverlay.tsx",
);
const aftermathSource = source(
  "../app/components/decision-aftermath-client.ts",
);

test("LOTUS no longer exposes the restriction policy answer key before commitment", () => {
  for (const leak of [
    "판정 위협",
    "미대응 위협",
    "비위협 선제 제재",
    "추정 충격",
    "restrictionPolicy.",
  ]) {
    assert.equal(pageSource.includes(leak), false, leak);
  }
  assert.match(pageSource, /적중·미흡·과잉 판정은 DAY/);
  assert.match(pageSource, /사후 보고서에서 공개됩니다/);
});

test("player-facing business and reprint forecasts use ranges", () => {
  assert.match(pageSource, /getProbabilityForecastRange/);
  assert.match(pageSource, /formatRevenueForecast/);
  assert.equal(pageSource.includes("현재 상태 성공 확률"), false);
  assert.equal(pageSource.includes("현재 추정 적발률"), false);
  assert.equal(
    pageSource.includes("Math.round(successProbability * 100)"),
    false,
  );

  assert.match(releaseDecisionSource, /getCountForecastRange/);
  assert.match(releaseDecisionSource, /분석 신뢰도 중간/);
  assert.equal(
    releaseDecisionSource.includes(
      'preview.accessibilityUserGain.toLocaleString("ko-KR")',
    ),
    false,
  );
  assert.equal(
    releaseDecisionSource.includes("preview.trustDelta.toFixed"),
    false,
  );
});

test("the next-day restriction bulletin defers evaluation to the D+9 report", () => {
  assert.equal(outcomeSource.includes("정책 충격"), false);
  assert.equal(outcomeSource.includes("미대응 위협"), false);
  assert.match(outcomeSource, /정책 평가/);
  assert.match(outcomeSource, /RESTRICTION_REPORT_DELAY_DAYS/);
  assert.equal(aftermathSource.includes("getRestrictionPolicyProfile"), false);
  assert.equal(aftermathSource.includes("unaddressedThreats"), false);
});
