import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_POLICY_IDS,
  runCampaignPolicyMatrix,
} from "./helpers/campaign-policy-bots.ts";

test("deliberately different campaign bots complete through the real reducer", () => {
  const sampledPolicies = [
    "never-ban",
    "maximum-power",
    "trust-maximizer",
  ] as const;
  const results = runCampaignPolicyMatrix([3], sampledPolicies);

  assert.equal(CAMPAIGN_POLICY_IDS.length, 6);
  assert.equal(results.length, sampledPolicies.length);
  assert.ok(results.every((result) => result.day > 7));
  assert.ok(results.every((result) => Number.isFinite(result.cash)));
  assert.ok(
    new Set(results.map((result) => result.endingTitle)).size > 1,
    "opposing policies should not collapse to one identical ending",
  );
});
