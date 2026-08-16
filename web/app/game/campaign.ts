/** Fixed campaign calendar shared by the simulation and presentation layers. */
export const RELEASE_INTERVAL = 30;
export const FIRST_BAN_DAY = 45;
export const BAN_INTERVAL = 60;

/** The final scheduled product release that the player can edit. */
export const LAST_RELEASE_DAY = 450;

/** Final scheduled decision day: the DAY 465 restriction review. */
export const LAST_DECISION_DAY = 465;

/** The campaign is scored after DAY 500 resolves. */
export const CAMPAIGN_END_DAY = 500;

/** DAY 45 is guided; unrestricted player control begins the following day. */
export const PLAYER_START_DAY = FIRST_BAN_DAY + 1;
export const PLAYER_CONTROL_DAYS = LAST_DECISION_DAY - FIRST_BAN_DAY;
export const SETTLEMENT_START_DAY = LAST_DECISION_DAY + 1;
export const SETTLEMENT_DAYS = CAMPAIGN_END_DAY - LAST_DECISION_DAY;

export function isDecisionWindowOpen(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= LAST_DECISION_DAY;
}
