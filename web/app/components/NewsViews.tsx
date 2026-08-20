import { useState, type CSSProperties } from "react";

import {
  getDailyNews,
  type DailyNewsItem,
} from "../game/daily-news.ts";
import type { GameState } from "../game/types.ts";

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
            <li className={`news-item ${item.tone}`} key={item.id}>
              <span className="news-item-day">DAY {item.day}</span>
              <div>
                <strong>{item.headline}</strong>
                <p>{item.detail}</p>
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
          <span>DAY {item.day}</span>
          <strong>{item.headline}</strong>
          <p>{item.detail}</p>
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
