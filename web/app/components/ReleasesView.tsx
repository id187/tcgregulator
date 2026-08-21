import { isInitialGenericReleaseBatch } from "../game/initial-generic-cards.ts";
import { getReleaseSlateKind } from "../game/release-kind.ts";
import type {
  GameState,
  ReleaseSelection,
} from "../game/types.ts";
import { DecisionEventHero } from "./DecisionEventHero.tsx";
import { ReleaseIcon } from "./MetricGlyphs.tsx";
import { ReleaseDecisionPanel } from "./ReleaseDecisionPanel.tsx";
import { ReleasePackCard } from "./ReleasePackCard.tsx";

export function ReleasesView({
  game,
  onReleaseDraftChange,
  onSubmitRelease,
  releaseDraft,
}: {
  game: GameState;
  onReleaseDraftChange: (optionIds: string[]) => void;
  onSubmitRelease: (selections: ReleaseSelection[]) => void;
  releaseDraft: readonly string[];
}) {
  const releaseBatches = [...game.releaseHistory]
    .filter((batch) => !isInitialGenericReleaseBatch(batch))
    .reverse();
  const isReprintReview = Boolean(
    game.releaseSlate && getReleaseSlateKind(game.releaseSlate) === "reprint",
  );

  return (
    <section
      className={`subpage release-history-page${
        game.phase === "release-edit" ? " is-deciding" : ""
      }`}
      data-tutorial-control="release-archive"
    >
      <header className="subpage-heading release-archive-heading">
        <div>
          <span className="eyebrow">RELEASE ARCHIVE</span>
          <h1>{game.phase === "release-edit" ? "발매 심의" : "발매"}</h1>
          <p>
            {game.phase === "release-edit"
              ? isReprintReview
                ? "후보 9종의 시세와 수요를 비교해 접근성을 회복할 재판 카드 3종을 확정합니다."
                : "후보 카드의 조합과 파워를 확정하고 새로운 환경을 공표합니다."
              : "출시일, 카드팩, 신테마 상징을 중심으로 발매 기록을 확인합니다."}
          </p>
        </div>
        <div className="release-history-count" aria-label="발매 기록 수">
          <ReleaseIcon size={18} />
          <span>발매 기록</span>
          <strong>{releaseBatches.length}회</strong>
        </div>
      </header>

      {game.phase === "release-edit" && game.releaseSlate ? (
        <>
          <DecisionEventHero
            currentStep={releaseDraft.length > 0 ? 2 : 1}
            day={game.day}
            description={
              isReprintReview
                ? "오늘 고른 3종의 공급 충격이 내일부터 시세, 접근성, 콜렉터 신뢰를 바꿉니다."
                : "오늘 승인한 카드가 내일부터 매출과 입상 환경, 커뮤니티의 언어를 바꿉니다."
            }
            kind="release"
            metrics={[
              {
                label: "검토 후보",
                value: `${game.releaseSlate.options.length}종`,
              },
              { label: "선택 완료", value: `${releaseDraft.length}종` },
              { label: "효과 관측", value: `DAY ${game.day + 1}` },
            ]}
            steps={isReprintReview
              ? ["시세 검토", "3종 선정", "재판 공표"]
              : ["후보 검토", "팩 구성", "공식 공표"]}
            title={isReprintReview ? "재판팩 긴급 심의" : "신규 카드팩 최종 심의"}
          />
          <ReleaseDecisionPanel
            game={game}
            onChange={onReleaseDraftChange}
            onSubmit={onSubmitRelease}
            selectedOptionIds={releaseDraft}
          />
        </>
      ) : null}

      {game.phase === "release-edit" ? null : releaseBatches.length > 0 ? (
        <div className="release-pack-list">
          {releaseBatches.map((batch) => (
            <ReleasePackCard batch={batch} key={batch.day} />
          ))}
        </div>
      ) : (
        <div className="empty-state">아직 발매 기록이 없습니다.</div>
      )}
    </section>
  );
}
