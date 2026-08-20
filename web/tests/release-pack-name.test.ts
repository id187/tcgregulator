import assert from "node:assert/strict";
import test from "node:test";

import {
  getReleasePackName,
  getReleasePackVolume,
} from "../app/game/release-pack-name.ts";

test("scheduled releases receive stable generic volume names", () => {
  assert.equal(getReleasePackVolume(30), 1);
  assert.equal(getReleasePackName(30), "REGULATOR PACK Vol. 1");
  assert.equal(getReleasePackName(60), "REGULATOR PACK Vol. 2");
  assert.equal(getReleasePackName(450), "REGULATOR PACK Vol. 15");
});

test("invalid or pre-release days fall back to the first volume", () => {
  assert.equal(getReleasePackName(0), "REGULATOR PACK Vol. 1");
  assert.equal(getReleasePackName(Number.NaN), "REGULATOR PACK Vol. 1");
});
