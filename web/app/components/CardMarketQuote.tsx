import type { CardMarketQuote as CardMarketQuoteValue } from "../game/card-market.ts";

export function formatCardMarketPrice(value: number): string {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

export function CardMarketQuote({
  quote,
  compact = false,
}: {
  quote: CardMarketQuoteValue;
  compact?: boolean;
}) {
  const direction = quote.changeRate > 0
    ? "up"
    : quote.changeRate < 0
      ? "down"
      : "flat";
  return (
    <div
      aria-label={`현재 가격 ${formatCardMarketPrice(quote.price)}, 7일 변동 ${quote.changeRate > 0 ? "+" : ""}${quote.changeRate.toFixed(1)}퍼센트`}
      className={`card-market-quote ${direction}${compact ? " compact" : ""}`}
    >
      <span className="card-market-price">
        <small>현재 가격</small>
        <strong>{formatCardMarketPrice(quote.price)}</strong>
      </span>
      <span className="card-market-change">
        <small>7일 변동</small>
        <strong>
          {quote.changeRate > 0 ? "+" : ""}
          {quote.changeRate.toFixed(1)}%
        </strong>
      </span>
    </div>
  );
}
