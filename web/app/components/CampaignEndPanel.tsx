import {
  LAST_DECISION_DAY,
  PLAYER_START_DAY,
  SETTLEMENT_DAYS,
} from "../game/campaign.ts";
import {
  evaluateCampaignEnding,
  getCampaignEndingHints,
  type CampaignCashBand,
  type CampaignEndingEvaluation,
  type CampaignEnvironmentBand,
  type CampaignTrustBand,
  type CampaignUserBand,
} from "../game/campaign-ending.ts";
import { getOperatingRunwayMonths } from "../game/finance.ts";
import type { GameState } from "../game/types.ts";
import { LotusSymbol } from "./LotusSymbol.tsx";

const CAMPAIGN_CASH_LABEL: Record<CampaignCashBand, string> = {
  crisis: "자금 위기",
  tight: "자금 빠듯",
  reserve: "자금 여력",
  prosperous: "사업 대성공",
};

const CAMPAIGN_ENVIRONMENT_LABEL: Record<CampaignEnvironmentBand, string> = {
  danger: "환경 위험",
  caution: "환경 주의",
  stable: "환경 안정",
};

const CAMPAIGN_TRUST_LABEL: Record<CampaignTrustBand, string> = {
  low: "신뢰 낮음",
  guarded: "신뢰 경계",
  trusted: "신뢰 견고",
};

const CAMPAIGN_USER_LABEL: Record<CampaignUserBand, string> = {
  collapsed: "유저 붕괴",
  contracted: "유저 축소",
  steady: "유저 유지",
  grown: "유저 성장",
  breakout: "전국적 흥행",
};

function formatUsers(value: number): string {
  const rounded = Math.round(value);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(
    Object.is(rounded, -0) ? 0 : rounded,
  );
}

function formatRevenue(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}억`;
  return `${Math.round(value * 10000).toLocaleString("ko-KR")}만`;
}

function CampaignEndingHints({
  ending,
}: {
  ending: CampaignEndingEvaluation;
}) {
  const hints = getCampaignEndingHints(ending);
  const complete = ending.qualifiedForBestEnding;
  return (
    <section
      aria-labelledby="campaign-ending-hints-title"
      className={`campaign-ending-hints${complete ? " is-complete" : ""}`}
    >
      <div className="campaign-ending-hints-heading">
        <div>
          <span>LOTUS · POST-MANDATE REVIEW</span>
          <strong id="campaign-ending-hints-title">결산 핵심 관측</strong>
          <small>최종 결과와 임기 전체의 누적 운영 기록을 함께 심사했습니다.</small>
        </div>
      </div>
      {complete ? (
        <p className="campaign-ending-hints-complete">
          자금 여력과 환경 안정, 견고한 구매 신뢰, 뚜렷한 활성 유저 성장이 함께 다음 시즌으로 인계됐습니다.
        </p>
      ) : (
        <ul>
          {hints.map((hint) => (
            <li key={hint.id}>
              <span>최종 결과</span>
              <strong>{hint.title}</strong>
              <p>{hint.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CampaignEndPanel({
  game,
  onReturnToPlay,
}: {
  game: GameState;
  onReturnToPlay: () => void;
}) {
  const ending = evaluateCampaignEnding(game);
  const runwayMonths = getOperatingRunwayMonths(
    ending.scores.cash,
    ending.totalUsers,
  );
  const endingTone = ending.qualifiedForBestEnding
    ? "stable"
    : ending.bands.environment === "danger" ||
        ending.bands.cash === "crisis" ||
        ending.bands.users === "collapsed" ||
        (ending.bands.trust === "low" && ending.bands.users === "contracted")
      ? "danger"
      : "caution";
  const tone = endingTone === "stable"
    ? "calm"
    : endingTone === "caution"
      ? "caution"
      : "critical";

  return (
    <section
      aria-labelledby="campaign-end-title"
      className={`game-over-panel campaign-end-panel ending-${endingTone}`}
    >
      <LotusSymbol tone={tone} />
      <span className="game-over-kicker">MANDATE COMPLETE · FINAL AUDIT</span>
      <h1 id="campaign-end-title">{ending.title}</h1>
      <strong>
        {CAMPAIGN_CASH_LABEL[ending.bands.cash]} ·{" "}
        {CAMPAIGN_ENVIRONMENT_LABEL[ending.bands.environment]} ·{" "}
        {CAMPAIGN_TRUST_LABEL[ending.bands.trust]} ·{" "}
        {CAMPAIGN_USER_LABEL[ending.bands.users]}
      </strong>
      <p>{ending.body}</p>
      <dl className="campaign-end-metrics">
        <div>
          <dt>최종 운영자금</dt>
          <dd>₩{formatRevenue(ending.scores.cash)}</dd>
          <small>현 규모 기준 약 {runwayMonths.toFixed(1)}개월</small>
        </div>
        <div>
          <dt>환경 안정률</dt>
          <dd>{ending.scores.environmentHealth.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>활성 유저</dt>
          <dd>{formatUsers(ending.totalUsers)}명</dd>
          <small>
            인수 대비 {ending.scores.userDelta >= 0 ? "+" : ""}
            {formatUsers(ending.scores.userDelta)}명 ·{" "}
            {CAMPAIGN_USER_LABEL[ending.bands.users]}
          </small>
        </div>
        <div>
          <dt>구매 신뢰</dt>
          <dd>{Math.round(ending.scores.purchaseTrust)} / 100</dd>
          <small>{CAMPAIGN_TRUST_LABEL[ending.bands.trust]}</small>
        </div>
      </dl>
      <section
        aria-labelledby="campaign-stewardship-title"
        className="campaign-stewardship-record"
      >
        <header>
          <span>FULL MANDATE LEDGER</span>
          <h2 id="campaign-stewardship-title">누적 운영 기록</h2>
          <p>마지막 날의 스냅샷이 아니라 DAY {PLAYER_START_DAY} 이후 전 기간을 집계했습니다.</p>
        </header>
        <dl>
          <div><dt>평균 환경</dt><dd>{ending.stewardship.averageEnvironmentHealth}</dd></div>
          <div><dt>평균 구매 신뢰</dt><dd>{ending.stewardship.averagePurchaseTrust}</dd></div>
          <div><dt>안정 환경 비율</dt><dd>{Math.round(ending.stewardship.healthyDayRate * 100)}%</dd></div>
          <div><dt>심각한 Tier 0</dt><dd>{ending.stewardship.severeTierZeroDays}일</dd></div>
          <div><dt>최장 위험 연속</dt><dd>{ending.stewardship.longestUnhealthyStreak}일</dd></div>
          <div><dt>평균 유효 테마</dt><dd>{ending.stewardship.averageEffectiveThemeCount}종</dd></div>
          <div><dt>최대 금제 규모</dt><dd>{ending.stewardship.largestRestrictionList}건</dd></div>
          <div><dt>DAY 0 긴급 강도</dt><dd>{ending.stewardship.emergencyRestrictionMagnitude}</dd></div>
          <div><dt>평균 파워 조정</dt><dd>{ending.stewardship.averageReleasePowerAdjustment > 0 ? "+" : ""}{ending.stewardship.averageReleasePowerAdjustment}</dd></div>
          <div><dt>재판 카드</dt><dd>{ending.stewardship.reprintedCards}종</dd></div>
          <div><dt>기록된 운영 노선</dt><dd>{ending.administration.label}</dd></div>
        </dl>
      </section>
      <CampaignEndingHints ending={ending} />
      <small className="campaign-end-note">
        DAY {LAST_DECISION_DAY} 최종 발매 이후 {SETTLEMENT_DAYS}일의 관측
        결과로 확정된 공식 기록입니다.
      </small>
      <button className="primary-action" onClick={onReturnToPlay} type="button">
        PLAY 화면으로 돌아가기
      </button>
    </section>
  );
}
