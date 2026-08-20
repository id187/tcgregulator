import type { CommunityEvent, GameState } from "./types.ts";

/** A post above this line is promoted into the daily news desk. */
export const HIGH_LIKE_THRESHOLD = 1_550;

export type CommunityPostEngagement = {
  likes: number;
  isPopular: boolean;
};

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function mixSeed(seed: number, value: number): number {
  let mixed = (seed ^ value ^ 0x9e3779b9) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

function editorialWeight(event: CommunityEvent): number {
  const categoryWeight = {
    counter: 150,
    finance: 80,
    meta: 120,
    release: 280,
    restriction: 340,
  }[event.category];
  const breakingWeight =
    event.type === "restriction-applied" ||
    event.type === "restriction-no-change" ||
    event.type === "cosmetic-restriction" ||
    event.type === "business-scandal" ||
    event.type === "top-theme-changed"
      ? 430
      : event.type === "release-reaction" ||
          event.type === "support-released" ||
          event.type === "counter-found"
        ? 240
        : 0;
  const debateWeight = /금제|제한|발매|폭주|사기|이탈|매출|품절|우승|탑컷/.test(
    event.body,
  )
    ? 180
    : 0;
  return categoryWeight + breakingWeight + debateWeight;
}

/**
 * Engagement is derived from immutable post data and the campaign seed.
 * It is deliberately not based on the current day or mutable live metrics, so
 * revisiting an old board always returns the same number.
 */
export function getCommunityPostEngagement(
  seed: number,
  event: CommunityEvent,
): CommunityPostEngagement {
  const identityHash = hashText(
    `${event.id}\u0000${event.day}\u0000${event.type}\u0000${event.body}`,
  );
  const randomBand = mixSeed(seed >>> 0, identityHash) % 1_051;
  const likes = Math.max(0, 24 + editorialWeight(event) + randomBand);
  return { likes, isPopular: likes >= HIGH_LIKE_THRESHOLD };
}

export type EngagedCommunityPost = {
  event: CommunityEvent;
  likes: number;
  isPopular: boolean;
};

export function rankCommunityPostsByLikes(
  state: Pick<GameState, "seed">,
  posts: readonly CommunityEvent[],
): EngagedCommunityPost[] {
  return posts
    .map((event) => ({ event, ...getCommunityPostEngagement(state.seed, event) }))
    .sort(
      (left, right) =>
        right.likes - left.likes || left.event.id.localeCompare(right.event.id),
    );
}

export function getMostLikedCommunityPost(
  state: Pick<GameState, "seed">,
  posts: readonly CommunityEvent[],
): EngagedCommunityPost | null {
  return rankCommunityPostsByLikes(state, posts)[0] ?? null;
}
