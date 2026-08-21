import type {
  DistributionEntry,
  PlayerSegmentId,
} from "../game/distribution-model";

const PLAYER_SEGMENT_GUIDES: ReadonlyArray<{
  id: PlayerSegmentId;
  description: string;
}> = [
  {
    id: "meta",
    description: "승률과 대회 성적을 좇는 경쟁 플레이어",
  },
  {
    id: "casual",
    description: "접근성과 재미를 중시하는 일반 플레이어",
  },
  {
    id: "collector",
    description: "일러스트·희소성·소장 가치를 중시하는 수집가",
  },
  {
    id: "reseller",
    description: "시세와 재판매 가치에 민감한 거래 유저",
  },
];

export function PlayerSegmentGuide({
  entries,
}: {
  entries: readonly DistributionEntry[];
}) {
  return (
    <div
      aria-label="플레이어 계층 설명"
      className="distribution-kpis player-segment-guide"
      role="list"
    >
      {PLAYER_SEGMENT_GUIDES.map((guide) => {
        const entry = entries.find(
          (candidate) => candidate.segmentId === guide.id,
        );
        if (!entry) return null;

        return (
          <div
            key={guide.id}
            role="listitem"
            style={{ boxShadow: `inset 0 3px 0 ${entry.color}` }}
          >
            <strong className="player-segment-guide-heading">
              <i aria-hidden="true" style={{ backgroundColor: entry.color }} />
              {entry.label}
            </strong>
            <small>{guide.description}</small>
          </div>
        );
      })}
    </div>
  );
}
