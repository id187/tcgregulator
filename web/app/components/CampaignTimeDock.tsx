export type CampaignMilestone = {
  days: number;
  label: string;
};

export function CampaignTimeDock({
  disabled,
  milestone,
  onAdvance,
  progress,
  progressLabel,
}: {
  disabled: boolean;
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
          disabled={disabled || !milestone}
          onClick={() => milestone && onAdvance(milestone.days)}
          type="button"
        >
          <span>다음 일정까지</span>
          <strong>
            {milestone
              ? `${milestone.label} · ${milestone.days}일`
              : "예정 없음"}
          </strong>
        </button>
      </div>
    </footer>
  );
}
