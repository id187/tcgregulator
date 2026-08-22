import assert from "node:assert/strict";
import test from "node:test";

import {
  getCountForecastRange,
  getForecastRange,
  getProbabilityForecastRange,
} from "../app/game/forecast-display.ts";

test("probability forecasts expose a coarse range instead of a point answer", () => {
  assert.deepEqual(getProbabilityForecastRange(0.68), {
    lower: 60,
    upper: 80,
  });
  assert.deepEqual(getProbabilityForecastRange(0.92), {
    lower: 80,
    upper: 95,
  });
  assert.deepEqual(getProbabilityForecastRange(0.18), {
    lower: 10,
    upper: 30,
  });
});

test("quantity and signed forecasts round outward around the internal estimate", () => {
  assert.deepEqual(getCountForecastRange(32), {
    lower: 20,
    upper: 45,
  });
  assert.deepEqual(getCountForecastRange(300), {
    lower: 210,
    upper: 390,
  });
  assert.deepEqual(
    getForecastRange(-2.4, {
      relativeMargin: 0.25,
      minimumMargin: 0.5,
      step: 0.5,
      maximum: 0,
    }),
    { lower: -3, upper: -1.5 },
  );
  assert.deepEqual(
    getForecastRange(0.25, {
      relativeMargin: 0.25,
      minimumMargin: 0.05,
      step: 0.05,
    }),
    { lower: 0.15, upper: 0.35 },
  );
});

test("forecast helpers reject malformed inputs", () => {
  assert.throws(() => getForecastRange(Number.NaN), TypeError);
  assert.throws(() => getForecastRange(10, { step: 0 }), RangeError);
  assert.throws(
    () => getForecastRange(10, { minimum: 20, maximum: 5 }),
    RangeError,
  );
});
