import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommunityPostEngagement,
  HIGH_LIKE_THRESHOLD,
  rankCommunityPostsByLikes,
} from "../app/game/community-engagement.ts";
import { getDailyCommunityPosts } from "../app/game/daily-community.ts";
import { createInitialGame } from "../app/game/engine.ts";

test("derives stable likes from immutable post identity", () => {
  const state = createInitialGame(0x1234abcd);
  const post = getDailyCommunityPosts(state, 3)[0];
  const before = getCommunityPostEngagement(state.seed, post);
  const laterState = structuredClone(state);
  laterState.day += 200;
  laterState.purchaseTrust = 0;
  const after = getCommunityPostEngagement(laterState.seed, post);

  assert.deepEqual(after, before);
  assert.ok(before.likes >= 0);
});

test("ranks a daily board deterministically with stable tie-breaking", () => {
  const state = createInitialGame(0x5eed1234);
  const posts = getDailyCommunityPosts(state, 3);
  const first = rankCommunityPostsByLikes(state, posts);
  const second = rankCommunityPostsByLikes(state, [...posts].reverse());

  assert.deepEqual(second, first);
  assert.equal(first.length, 20);
  assert.ok(first[0].likes >= first.at(-1)!.likes);
  assert.equal(first[0].isPopular, first[0].likes >= HIGH_LIKE_THRESHOLD);
});
