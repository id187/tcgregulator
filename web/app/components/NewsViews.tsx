import { useState, type CSSProperties } from "react";

import {
  getDailyNews,
  type DailyNewsItem,
} from "../game/daily-news.ts";
import type { GameState } from "../game/types.ts";
import {
  GavelIcon,
  MessageIcon,
  ReleaseIcon,
  RevenueIcon,
  TrendIcon,
  UsersIcon,
} from "./MetricGlyphs.tsx";

function getNewsGlyph(kind: DailyNewsItem["kind"]) {
  switch (kind) {
    case "release":
      return <ReleaseIcon size={18} />;
    case "restriction":
      return <GavelIcon size={18} />;
    case "business":
    case "market":
    case "revenue":
      return <RevenueIcon size={18} />;
    case "community":
    case "sentiment":
      return <MessageIcon size={18} />;
    case "users":
      return <UsersIcon size={18} />;
    default:
      return <TrendIcon size={18} />;
  }
}

function getNewsLead(item: DailyNewsItem): string {
  const details = item.detail.split("·").map((part) => part.trim());
  if (
    item.kind === "environment" ||
    item.kind === "trust" ||
    item.kind === "sentiment" ||
    item.kind === "market" ||
    item.kind === "revenue" ||
    item.kind === "meta"
  ) {
    return (details.at(-1) ?? item.detail).replace(/점$/, "");
  }
  if (item.kind === "release") {
    return item.headline.match(/\d+종/)?.[0] ?? "신규 발매";
  }
  if (item.kind === "restriction") {
    return item.headline.match(/\d+건/)?.[0] ?? item.detail;
  }
  return details[0] ?? item.detail;
}

function getNewsLabel(item: DailyNewsItem): string {
  switch (item.kind) {
    case "release":
      return "정기 발매";
    case "restriction":
      return "금제";
    case "business":
      return item.headline.split("·")[0]?.trim() || "사업 운영";
    case "community":
      return "커뮤니티";
    case "market":
      return item.headline
        .replace(/ 시세가 (?:급등|폭락)했습니다$/, "")
        .trim() || "카드 시세";
    case "users":
      return "활성 유저";
    case "revenue":
      return "일매출";
    case "environment":
      return "환경 건강";
    case "trust":
      return "구매 신뢰";
    case "sentiment":
      return "커뮤니티 여론";
    case "meta":
      return item.headline === "메타 1위가 바뀌었습니다"
        ? "메타 1위"
        : item.headline
            .replace(/ 입상 성적이 (?:반등|급하강)했습니다$/, " 입상")
            .trim() || "대회 환경";
  }
}

export function DailyNewsView({ game }: { game: GameState }) {
  const [selectedDay, setSelectedDay] = useState(game.day);
  const safeDay = Math.min(selectedDay, game.day);
  const news = getDailyNews(game, safeDay);
  const positive = news.filter((item) => item.tone === "positive").length;
  const negative = news.filter((item) => item.tone === "negative").length;

  return (
    <section className="subpage daily-news-page">
      <header className="subpage-heading daily-news-heading">
        <div>
          <span className="eyebrow">DAILY NEWS DESK</span>
          <h1>매일의 소식</h1>
          <p>지나간 날짜의 주요 변화와 커뮤니티 화제만 간결하게 모아봅니다.</p>
        </div>
        <div
          className="news-day-controls"
          data-tutorial-control="news-day"
          aria-label="소식 날짜"
        >
          <button
            disabled={safeDay <= 1}
            onClick={() => setSelectedDay((day) => Math.max(1, day - 1))}
            type="button"
          >
            ← 이전 날
          </button>
          <strong>DAY {safeDay}</strong>
          <button
            disabled={safeDay >= game.day}
            onClick={() =>
              setSelectedDay((day) => Math.min(game.day, day + 1))
            }
            type="button"
          >
            다음 날 →
          </button>
          <button
            disabled={safeDay === game.day}
            onClick={() => setSelectedDay(game.day)}
            type="button"
          >
            오늘
          </button>
        </div>
      </header>

      <div className="daily-news-summary" aria-label="선택한 날 소식 요약">
        <span>전체 <strong>{news.length}</strong></span>
        <span className="positive">좋은 소식 <strong>{positive}</strong></span>
        <span className="negative">나쁜 소식 <strong>{negative}</strong></span>
      </div>

      {news.length > 0 ? (
        <ol className="daily-news-list" data-tutorial-control="news-list">
          {news.map((item) => (
            <li
              aria-label={`${getNewsLabel(item)} ${getNewsLead(item)}. ${item.reason} 세부: ${item.headline}, ${item.detail}`}
              className={`news-item ${item.tone}`}
              key={item.id}
              title={`${item.headline} · ${item.detail}`}
            >
              <span aria-hidden="true" className="news-story-glyph">
                {getNewsGlyph(item.kind)}
              </span>
              <div className="news-story-copy">
                <strong className="news-story-summary">
                  {getNewsLabel(item)} <em>{getNewsLead(item)}</em>
                </strong>
                <p>{item.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state daily-news-empty">
          DAY {safeDay}에는 기록할 만큼 큰 변화가 없었습니다.
        </div>
      )}
    </section>
  );
}

export function ImpactMessageStack({
  items,
  onDismiss,
}: {
  items: readonly DailyNewsItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <aside
      aria-label="연속 파급 소식"
      aria-live="assertive"
      className="impact-message-stack"
    >
      {items.map((item, index) => (
        <article
          className={`impact-message ${item.tone}`}
          key={item.id}
          style={{ "--impact-index": index } as CSSProperties}
        >
          <span aria-hidden="true" className="impact-story-glyph">
            {getNewsGlyph(item.kind)}
          </span>
          <div className="impact-story-copy">
            <strong>
              {getNewsLabel(item)} <em>{getNewsLead(item)}</em>
            </strong>
            <p>{item.reason}</p>
          </div>
          <button
            aria-label={`${item.headline} 알림 닫기`}
            onClick={() => onDismiss(item.id)}
            type="button"
          >
            ×
          </button>
        </article>
      ))}
    </aside>
  );
}
