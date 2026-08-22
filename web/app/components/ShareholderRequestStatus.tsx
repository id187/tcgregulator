import { THEME_BY_ID } from "../game/content.ts";
import {
  FIRST_SHAREHOLDER_REQUEST_FAILURE_PENALTY_CASH,
  getShareholderRequestGoalCopy,
  getShareholderRequestProgress,
} from "../game/shareholder-request.ts";
import type { GameState, ShareholderRequest } from "../game/types.ts";

export function ShareholderRequestStatus({
  game,
  request,
}: {
  game: GameState;
  request: ShareholderRequest;
}) {
  const progress = getShareholderRequestProgress(game, request, game.day);
  const theme = THEME_BY_ID[request.themeId];
  const remainingDays = Math.max(0, request.deadlineDay - game.day);
  return (
    <section className="shareholder-status-panel">
      <header>
        <span>MAJOR SHAREHOLDER DIRECTIVE · ACTIVE</span>
        <strong>{theme?.name ?? request.themeId}</strong>
        <p>{getShareholderRequestGoalCopy(request)}</p>
      </header>
      <dl>
        <div>
          <dt>남은 기간</dt>
          <dd>D-{remainingDays}</dd>
        </div>
        <div>
          <dt>현재 성과</dt>
          <dd>
            {progress.rank ? `${progress.rank}위` : "입상 없음"} · {progress.tier}
          </dd>
        </div>
        <div>
          <dt>성공 보상</dt>
          <dd>+₩{request.rewardCash.toFixed(2)}억</dd>
        </div>
        <div>
          <dt>실패 비용</dt>
          <dd>최대 −₩{FIRST_SHAREHOLDER_REQUEST_FAILURE_PENALTY_CASH.toFixed(2)}억</dd>
        </div>
      </dl>
      <footer>
        <span>판정 DAY {request.deadlineDay}</span>
        <span>최근 7일 입상 기준</span>
      </footer>
    </section>
  );
}
