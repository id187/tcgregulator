import type { CampaignMilestone } from "../game/campaign-milestone.ts";

export function CampaignTimeDock({
  disabled,
  fastForwardLocked = false,
  milestone,
  onAdvance,
  progress,
  progressLabel,
}: {
  disabled: boolean;
  fastForwardLocked?: boolean;
  milestone: CampaignMilestone | null;
  onAdvance: (days: number) => void;
  progress: number;
  progressLabel: string;
}) {
  const roundedProgress = Number(progress.toFixed(1));

  return (
    <footer className="time-dock">
      <div
        aria-label={`${progressLabel} ${roundedProgress.toFixed(1)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={roundedProgress}
        className="campaign-progress"
        role="progressbar"
      >
        <div className="progress-copy">
          <span>{progressLabel}</span>
          <strong>{roundedProgress.toFixed(1)}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="time-actions">
        <button
          className="time-step-action"
          disabled={disabled}
          onClick={() => onAdvance(1)}
          type="button"
        >
          +1일
        </button>
        <button
          className="time-step-action primary-action time-major-action"
          disabled={disabled || fastForwardLocked || !milestone}
          onClick={() => milestone && onAdvance(milestone.days)}
          type="button"
        >
          <svg aria-hidden="true" className="time-major-icon" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="12" />
            <path d="M16 9v7l5 3M16 2v4M30 16h-4" />
          </svg>
          <span>{fastForwardLocked ? "후일 관측" : "다음 일정"}</span>
          <strong>
            {fastForwardLocked
              ? "반응 확인 필요"
              : milestone
                ? milestone.label
                : "예정 없음"}
          </strong>
          <small>
            {fastForwardLocked
              ? "+1일로 진행"
              : milestone
                ? `${milestone.days}일 후`
                : "종료"}
          </small>
        </button>
      </div>
    </footer>
  );
}
