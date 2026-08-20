/** Fixed campaign calendar shared by the simulation and presentation layers. */
export const PROLOGUE_SEED = 1000;
export const RELEASE_INTERVAL = 30;
export const FIRST_BAN_DAY = 15;
export const BAN_INTERVAL = 60;

/** The guided handover ends after the first release's D+1 impact is shown. */
export const TUTORIAL_END_DAY = 31;

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

/** DAY 31 closes the guide and becomes the first unrestricted player day. */
export const PLAYER_START_DAY = TUTORIAL_END_DAY;
export const PLAYER_CONTROL_DAYS = LAST_DECISION_DAY - PLAYER_START_DAY + 1;
export const SETTLEMENT_START_DAY = LAST_DECISION_DAY + 1;
export const SETTLEMENT_DAYS = CAMPAIGN_END_DAY - LAST_DECISION_DAY;

export function isDecisionWindowOpen(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= LAST_DECISION_DAY;
}
