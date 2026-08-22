import { useEffect, useRef } from "react";

import {
  BUSINESS_EVENT_BY_TYPE,
  getBusinessEventResult,
} from "../game/business-events.ts";
import type {
  DecisionReport,
  DecisionReportMetric,
} from "../game/decision-reports.ts";
import type { BusinessEventRecord } from "../game/types.ts";

function useOverlayFocus(open: boolean) {
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const frame = window.requestAnimationFrame(() =>
      actionRef.current?.focus({ preventScroll: true })
    );
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  return actionRef;
}

function ReportMetricValue({ metric }: { metric: DecisionReportMetric }) {
  if (metric.before === undefined || metric.after === undefined) {
    return <dd>{metric.value}</dd>;
  }
  return (
    <dd className="report-metric-comparison">
      <span>{metric.before}</span>
      <b aria-hidden="true">→</b>
      <strong>{metric.after}</strong>
      <small>{metric.value}</small>
    </dd>
  );
}

export function FormalDecisionReportOverlay({
  onContinue,
  report,
}: {
  onContinue: () => void;
  report: DecisionReport;
}) {
  const actionRef = useOverlayFocus(true);
  return (
    <div className={`report-arrival-layer tone-${report.tone}`}>
      <section
        aria-labelledby="formal-report-title"
        aria-modal="true"
        className="report-arrival-card"
        data-report-type={report.reportType}
        role="dialog"
      >
        <div aria-hidden="true" className="report-arrival-scanline" />
        <header>
          <span>{report.kicker}</span>
          <strong>DAY {report.reportDay} · 공식 문서 도착</strong>
          <h2 id="formal-report-title">{report.title}</h2>
        </header>
        <section
          className={`report-arrival-growth tone-${report.growth.tone}`}
          data-growth-band={report.growth.band}
        >
          <div className="report-arrival-growth-heading">
            <span>MANDATE TRAJECTORY · DAY 0 대비 종합 성장</span>
            <strong>{report.growth.label}</strong>
            <p>{report.growth.summary}</p>
          </div>
          <div
            aria-label={`회사 성장지수 ${report.growth.index}, ${report.growth.comparison} 대비 ${report.growth.change}`}
            className="report-arrival-growth-index"
            role="status"
          >
            <span>회사 성장지수</span>
            <strong>{report.growth.index}</strong>
            <b>{report.growth.comparison} · {report.growth.change}</b>
            <p>{report.growth.basis}</p>
          </div>
          <small>성장 판정은 활성 유저와 일평균 매출만 반영 · 투자 지출과 보유자금은 제외</small>
        </section>
        <div className="report-arrival-causal-chain">
          <section className="report-arrival-decision">
            <span>YOUR DECISION · 플레이어 결정</span>
            <strong>{report.decision.headline}</strong>
            <p>{report.decision.detail}</p>
          </section>
          <span aria-hidden="true" className="report-arrival-causal-arrow">→</span>
          <section className="report-arrival-verdict">
            <span>7일 관측 결과</span>
            <strong>{report.verdict}</strong>
            <p>{report.summary}</p>
          </section>
        </div>
        <dl className="report-arrival-metrics">
          {report.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <ReportMetricValue metric={metric} />
            </div>
          ))}
        </dl>
        <aside className="report-arrival-recommendation">
          <span>FOLLOW-UP RECOMMENDATION · 후속 권고</span>
          <p>{report.recommendation}</p>
        </aside>
        <footer>
          <small>DAY {report.decisionDay} 결정 · D+1~7 수집 · D+8 집계 · D+9 보고</small>
          <button
            className="primary-action"
            onClick={onContinue}
            ref={actionRef}
            type="button"
          >
            리포트 확인
          </button>
        </footer>
      </section>
    </div>
  );
}

export function BusinessEventResultOverlay({
  onContinue,
  record,
}: {
  onContinue: () => void;
  record: BusinessEventRecord;
}) {
  const actionRef = useOverlayFocus(true);
  const definition = BUSINESS_EVENT_BY_TYPE[record.type];
  const choice = definition.choices.find(
    (candidate) => candidate.id === record.choice,
  );
  const result = record.outcome === "pending"
    ? null
    : getBusinessEventResult(record.type, record.choice, record.outcome);
  if (!choice || !result) return null;

  const succeeded = record.outcome === "success";
  const resultStamp = succeeded ? "SUCCESS" : "FAIL";
  const resultStampLabel = succeeded
    ? "프로젝트 결과 판정: 성공"
    : "프로젝트 결과 판정: 실패";

  return (
    <div className={`report-arrival-layer business-result tone-${succeeded ? "positive" : "negative"}`}>
      <section
        aria-labelledby="business-result-title"
        aria-modal="true"
        className="report-arrival-card"
        role="dialog"
      >
        <div aria-hidden="true" className="report-arrival-scanline" />
        <header>
          <span>OPERATIONS DECISION RESULT · OPTION {record.choice.toUpperCase()}</span>
          <strong>DAY {record.resolvedDay ?? record.resolutionDay} · 결과 발표</strong>
          <h2 id="business-result-title">{definition.title}</h2>
        </header>
        <div
          aria-label={resultStampLabel}
          className="business-result-stamp-stage"
          role="status"
        >
          <span
            aria-hidden="true"
            className={`business-result-stamp is-${succeeded ? "success" : "fail"}`}
          >
            <small>PROJECT RESULT</small>
            <strong>{resultStamp}</strong>
          </span>
        </div>
        <div className="report-arrival-verdict">
          <span>{choice.title} 선택 결과</span>
          <strong>{result.headline}</strong>
          <p>{result.body}</p>
        </div>
        <dl className="report-arrival-metrics">
          <div>
            <dt>즉시 비용</dt>
            <dd>{record.cost > 0 ? `₩${record.cost.toFixed(2)}억` : "없음"}</dd>
          </div>
          <div>
            <dt>선택 위험도</dt>
            <dd>{Math.round(record.risk * 100)}%</dd>
          </div>
          <div>
            <dt>판정</dt>
            <dd>{succeeded ? "성공" : "실패 · 역풍"}</dd>
          </div>
        </dl>
        <footer>
          <small>선택한 운영 노선은 누적 기록과 후속 이벤트에 계속 반영됩니다.</small>
          <button
            className="primary-action"
            onClick={onContinue}
            ref={actionRef}
            type="button"
          >
            결과 반영
          </button>
        </footer>
      </section>
    </div>
  );
}
