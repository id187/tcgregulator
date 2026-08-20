export type LotusTone = "calm" | "info" | "caution" | "critical";

export function LotusSymbol({ tone = "calm" }: { tone?: LotusTone }) {
  return (
    <svg
      aria-hidden="true"
      className={`lotus-symbol ${tone}`}
      focusable="false"
      viewBox="0 0 100 100"
    >
      <circle className="lotus-orbit" cx="50" cy="50" r="43" />
      <g className="lotus-petals">
        {Array.from({ length: 6 }, (_, index) => (
          <path
            d="M50 51 C38 39 39 22 50 9 C61 22 62 39 50 51 Z"
            key={index}
            transform={`rotate(${index * 60} 50 50)`}
          />
        ))}
      </g>
      <circle className="lotus-core-glow" cx="50" cy="50" r="14" />
      <circle className="lotus-core" cx="50" cy="50" r="5" />
    </svg>
  );
}
