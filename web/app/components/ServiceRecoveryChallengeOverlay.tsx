import type { ServiceRecoveryChallenge } from "../game/organization-health.ts";
import { LotusSymbol } from "./LotusSymbol.tsx";

export function ServiceRecoveryChallengeOverlay({
  challenge,
  onAcknowledge,
}: {
  challenge: ServiceRecoveryChallenge;
  onAcknowledge: () => void;
}) {
  return (
    <div className="service-recovery-overlay" role="presentation">
      <section
        aria-describedby="service-recovery-description"
        aria-labelledby="service-recovery-title"
        aria-modal="true"
        className="service-recovery-card"
        role="alertdialog"
      >
        <LotusSymbol tone="critical" />
        <span>EMERGENCY MANAGEMENT ORDER</span>
        <h1 id="service-recovery-title">비상 경영 체제 돌입</h1>
        <strong>{challenge.title}</strong>
        <p id="service-recovery-description">{challenge.cause}</p>

        <dl>
          <div>
            <dt>마지막 회생 기회</dt>
            <dd>DAY {challenge.evaluationStartDay} 정기 신팩</dd>
          </div>
          <div>
            <dt>필수 유지 목표</dt>
            <dd>{challenge.objective}</dd>
          </div>
          <div>
            <dt>현재 달성</dt>
            <dd>
              {challenge.recoveryStreak} / {challenge.requiredRecoveryStreak}일
            </dd>
          </div>
        </dl>

        <div className="service-recovery-warning">
          <b>발매일부터 목표 수치 유지 실패 시 임기 즉시 종료</b>
          <small>
            금제·발매·사업 운영을 모두 사용해 유저 기반과 현금 흐름을
            회복해야 합니다.
          </small>
        </div>

        <button className="primary-action" onClick={onAcknowledge} type="button">
          비상 경영 개시
        </button>
      </section>
    </div>
  );
}
