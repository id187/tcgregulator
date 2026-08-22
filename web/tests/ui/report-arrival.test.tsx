import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FormalDecisionReportOverlay } from "../../app/components/ReportArrivalOverlay.tsx";
import type { DecisionReport } from "../../app/game/decision-reports.ts";

it("renders decision, score deltas, market reading, and confirms the report", async () => {
  const user = userEvent.setup();
  const onContinue = vi.fn();
  const report: DecisionReport = {
    id: "ui-report",
    kind: "regular-release",
    reportType: "regular-commercial-backlash",
    decisionDay: 10,
    reportDay: 19,
    kicker: "PRODUCT PERFORMANCE REPORT · D+9",
    title: "신제품 사후 보고서",
    verdict: "흥행 뒤 부작용",
    summary: "매출은 늘었지만 구매 신뢰가 하락했습니다.",
    marketReading: "시장 해석은 ‘흥행 확대 우선’에 가깝습니다.",
    recommendation: "다음 출력 상승을 보류하십시오.",
    tone: "caution",
    decision: { headline: "신제품 4종 발매", detail: "주력 제품 +2" },
    growth: {
      band: "growing",
      label: "성장 중",
      summary: "시장 규모가 확대되고 있습니다.",
      tone: "positive",
      index: 112,
      comparison: "첫 보고서 · DAY 0 100",
      change: "+12",
      basis: "활성 유저 +8% · 일평균 매출 +16%",
    },
    metrics: [{
      label: "구매 신뢰",
      value: "-4점",
      delta: -4,
      before: "82",
      after: "78",
    }],
  };

  render(<FormalDecisionReportOverlay onContinue={onContinue} report={report} />);

  expect(screen.getByRole("dialog", { name: "신제품 사후 보고서" })).toBeTruthy();
  expect(screen.getByText(/매출은 늘었지만.*시장 해석은.*흥행 확대 우선/)).toBeTruthy();
  expect(screen.getByText("82")).toBeTruthy();
  expect(screen.getByText("78")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "리포트 확인" }));
  expect(onContinue).toHaveBeenCalledOnce();
});
