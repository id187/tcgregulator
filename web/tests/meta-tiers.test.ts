import assert from "node:assert/strict";
import test from "node:test";

import {
  isNamedMetaTier,
  META_ADOPTION_SHARE_FLOOR,
} from "../app/game/meta-tiers.ts";

test("keeps the numerical adoption floor separate from placement tiers", () => {
  assert.equal(META_ADOPTION_SHARE_FLOOR, 0.001);
  assert.equal(isNamedMetaTier("Tier Out"), false);
  assert.equal(isNamedMetaTier("Tier 3"), false);
});

test("only Tier 0 through Tier 2 receive individual distribution rows", () => {
  assert.deepEqual(
    ["Tier 0", "Tier 1", "Tier 2", "Tier 3", "Tier Out"].filter(
      (tier) => isNamedMetaTier(tier as Parameters<typeof isNamedMetaTier>[0]),
    ),
    ["Tier 0", "Tier 1", "Tier 2"],
  );
});
