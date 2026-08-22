export type ForecastRange = Readonly<{
  lower: number;
  upper: number;
}>;

export type ForecastRangeOptions = Readonly<{
  relativeMargin?: number;
  minimumMargin?: number;
  step?: number;
  minimum?: number;
  maximum?: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToPrecision(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Turns an internal point estimate into a deliberately coarse player-facing
 * range. The simulation remains deterministic; only the forecast surface is
 * uncertain.
 */
export function getForecastRange(
  value: number,
  {
    relativeMargin = 0.25,
    minimumMargin = 0,
    step = 1,
    minimum = Number.NEGATIVE_INFINITY,
    maximum = Number.POSITIVE_INFINITY,
  }: ForecastRangeOptions = {},
): ForecastRange {
  if (!Number.isFinite(value)) {
    throw new TypeError("forecast value must be finite");
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("forecast step must be positive and finite");
  }
  if (minimum > maximum) {
    throw new RangeError("forecast minimum cannot exceed maximum");
  }

  const margin = Math.max(Math.abs(value) * relativeMargin, minimumMargin);
  const lower = clamp(
    Math.floor((value - margin) / step) * step,
    minimum,
    maximum,
  );
  const upper = clamp(
    Math.ceil((value + margin) / step) * step,
    minimum,
    maximum,
  );
  return {
    lower: roundToPrecision(Math.min(lower, upper)),
    upper: roundToPrecision(Math.max(lower, upper)),
  };
}

/** A 68% point estimate is shown as a broad 60~80% analyst forecast. */
export function getProbabilityForecastRange(
  probability: number,
): ForecastRange {
  const bounded = clamp(probability, 0, 1);
  return getForecastRange(bounded * 100, {
    relativeMargin: 0,
    minimumMargin: 8,
    step: 5,
    minimum: 5,
    maximum: 95,
  });
}

export function getCountForecastRange(value: number): ForecastRange {
  const magnitude = Math.abs(value);
  const step = magnitude >= 1_000
    ? 100
    : magnitude >= 100
      ? 10
      : magnitude >= 20
        ? 5
        : 1;
  return getForecastRange(value, {
    relativeMargin: 0.3,
    minimumMargin: step,
    step,
    minimum: 0,
  });
}
