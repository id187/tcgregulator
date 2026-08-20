export type CollectorCardProfile = {
  label: "하이 일러스트";
  priceFloor: number;
  collectorAppeal: number;
};

/**
 * Curated showcase printings. Their collector premium is intentionally
 * independent from competitive adoption and restriction status.
 */
export const COLLECTOR_CARD_PROFILES = Object.freeze({
  "white-night-saint": {
    label: "하이 일러스트",
    priceFloor: 68_000,
    collectorAppeal: 94,
  },
  "ironblood-king-leonid": {
    label: "하이 일러스트",
    priceFloor: 54_000,
    collectorAppeal: 88,
  },
  "abyss-kraken": {
    label: "하이 일러스트",
    priceFloor: 61_000,
    collectorAppeal: 91,
  },
  "nebula-flagship-astra": {
    label: "하이 일러스트",
    priceFloor: 64_000,
    collectorAppeal: 92,
  },
  "phantasm-troupe-prima": {
    label: "하이 일러스트",
    priceFloor: 76_000,
    collectorAppeal: 97,
  },
  "colossus-ancient-king-atlas": {
    label: "하이 일러스트",
    priceFloor: 72_000,
    collectorAppeal: 95,
  },
  "future-001-stigma-sword-dance-finisher": {
    label: "하이 일러스트",
    priceFloor: 82_000,
    collectorAppeal: 98,
  },
  "future-002-ruined-star-observatory-finisher": {
    label: "하이 일러스트",
    priceFloor: 79_000,
    collectorAppeal: 96,
  },
} as const satisfies Readonly<Record<string, CollectorCardProfile>>);

export function getCollectorCardProfile(
  cardId: string,
): CollectorCardProfile | null {
  return Object.hasOwn(COLLECTOR_CARD_PROFILES, cardId)
    ? COLLECTOR_CARD_PROFILES[
        cardId as keyof typeof COLLECTOR_CARD_PROFILES
      ]
    : null;
}
