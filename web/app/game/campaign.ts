/** Fixed campaign calendar shared by the simulation and presentation layers. */
export const PROLOGUE_SEED = 1000;
export const PRE_CAMPAIGN_HISTORY_DAYS = 14;
export const PRE_CAMPAIGN_START_DAY = -PRE_CAMPAIGN_HISTORY_DAYS;
export const FIRST_RELEASE_DAY = 10;
export const RELEASE_INTERVAL = 20;
export const FIRST_BAN_DAY = 0;
export const BAN_INTERVAL = 40;
export const RESTRICTION_REPORT_DELAY_DAYS = 9;
export const RELEASE_REPORT_DELAY_DAYS = 9;
export const REPRINT_RELEASE_EVERY = 3;
export const REPRINT_PACK_PRODUCT_COUNT = 3;
export const REPRINT_PACK_CANDIDATE_COUNT = 9;
export const REPRINT_MINIMUM_AGE_DAYS = 30;

/** The emergency handover ends after seven days of observing the first ruling. */
export const TUTORIAL_END_DAY = 7;

/** The final scheduled product release that the player can edit. */
export const LAST_RELEASE_DAY = 450;

/** Final scheduled decision day: the DAY 450 product release. */
export const LAST_DECISION_DAY = LAST_RELEASE_DAY;

/** Final restriction review before the DAY 450 release and settlement tail. */
export const LAST_BAN_DAY =
  FIRST_BAN_DAY +
  Math.floor((LAST_DECISION_DAY - FIRST_BAN_DAY) / BAN_INTERVAL) * BAN_INTERVAL;

/** The campaign is scored after DAY 500 resolves. */
export const CAMPAIGN_END_DAY = 500;

/** DAY 7 closes the guide and becomes the first unrestricted player day. */
export const PLAYER_START_DAY = TUTORIAL_END_DAY;
export const PLAYER_CONTROL_DAYS = LAST_DECISION_DAY - PLAYER_START_DAY + 1;
export const SETTLEMENT_START_DAY = LAST_DECISION_DAY + 1;
export const SETTLEMENT_DAYS = CAMPAIGN_END_DAY - LAST_DECISION_DAY;

export function isDecisionWindowOpen(day: number): boolean {
  return Number.isInteger(day) && day >= FIRST_BAN_DAY && day <= LAST_DECISION_DAY;
}

/** Every product-review slot, including dedicated reprint packs. */
export function isScheduledReleaseDay(day: number): boolean {
  return (
    Number.isInteger(day) &&
    day >= FIRST_RELEASE_DAY &&
    day <= LAST_RELEASE_DAY &&
    (day - FIRST_RELEASE_DAY) % RELEASE_INTERVAL === 0
  );
}

export function getReleaseSequenceNumber(day: number): number | null {
  if (!isScheduledReleaseDay(day)) return null;
  return Math.floor((day - FIRST_RELEASE_DAY) / RELEASE_INTERVAL) + 1;
}

/** The third product review in each cycle is a three-card reprint pack. */
export function isReprintReleaseDay(day: number): boolean {
  const sequence = getReleaseSequenceNumber(day);
  return sequence !== null && sequence % REPRINT_RELEASE_EVERY === 0;
}

export function isRegularReleaseDay(day: number): boolean {
  return isScheduledReleaseDay(day) && !isReprintReleaseDay(day);
}

/** Returns the first product-review slot strictly after day. */
export function getNextScheduledReleaseDay(day: number): number {
  if (day < FIRST_RELEASE_DAY) return FIRST_RELEASE_DAY;
  return (
    FIRST_RELEASE_DAY +
    (Math.floor((day - FIRST_RELEASE_DAY) / RELEASE_INTERVAL) + 1) *
      RELEASE_INTERVAL
  );
}

function getNextReleaseDayMatching(
  day: number,
  predicate: (candidate: number) => boolean,
): number {
  let candidate = getNextScheduledReleaseDay(day);
  while (candidate <= LAST_RELEASE_DAY && !predicate(candidate)) {
    candidate += RELEASE_INTERVAL;
  }
  return candidate;
}

export function getNextRegularReleaseDay(day: number): number {
  return getNextReleaseDayMatching(day, isRegularReleaseDay);
}

export function getNextReprintReleaseDay(day: number): number {
  return getNextReleaseDayMatching(day, isReprintReleaseDay);
}
