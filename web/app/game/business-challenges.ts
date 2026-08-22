import type {
  BusinessActionOutcome,
  BusinessActionRecord,
  BusinessActionType,
  BusinessChallengeMetric,
  BusinessChallengeProgress,
  UserState,
} from "./types.ts";
import {
  BAN_INTERVAL,
  FIRST_BAN_DAY,
  isScheduledReleaseDay,
  LAST_DECISION_DAY,
} from "./campaign.ts";

export const CHALLENGE_BUSINESS_ACTION_TYPES = [
  "championship",
  "season-overhaul",
  "global-launch",
  "organized-play-platform",
] as const satisfies readonly BusinessActionType[];

export type ChallengeBusinessActionType =
  (typeof CHALLENGE_BUSINESS_ACTION_TYPES)[number];

/**
 * Risky projects may only be committed after a scheduled release or
 * restriction decision has been published. The phase gate in the action
 * availability API distinguishes the pre-submission edit from that same
 * day's post-submission operating window.
 */
export function isBusinessChallengeDecisionDay(day: number): boolean {
  if (!Number.isInteger(day)) return false;
  const releaseDay = isScheduledReleaseDay(day);
  const restrictionDay =
    day >= FIRST_BAN_DAY &&
    day <= LAST_DECISION_DAY &&
    (day - FIRST_BAN_DAY) % BAN_INTERVAL === 0;
  return releaseDay || restrictionDay;
}

export function getNextBusinessChallengeDecisionDay(
  day: number,
): number | null {
  for (
    let candidate = Math.max(1, Math.ceil(day));
    candidate < LAST_DECISION_DAY;
    candidate += 1
  ) {
    if (isBusinessChallengeDecisionDay(candidate)) return candidate;
  }
  return null;
}

export type BusinessChallengeDefinition = {
  metric: BusinessChallengeMetric;
  threshold: number;
  requiredQualifyingDays: number;
  deadlineOffset: number;
};

/** Every non-pack-odds risky action now exposes a deterministic target. */
export const BUSINESS_CHALLENGE_BY_TYPE = {
  championship: {
    metric: "environment-health",
    threshold: 65,
    requiredQualifyingDays: 1,
    deadlineOffset: 1,
  },
  "season-overhaul": {
    metric: "environment-health",
    threshold: 64,
    requiredQualifyingDays: 20,
    deadlineOffset: 30,
  },
  "global-launch": {
    metric: "purchase-trust",
    threshold: 72,
    requiredQualifyingDays: 14,
    deadlineOffset: 21,
  },
  "organized-play-platform": {
    metric: "environment-health",
    threshold: 62,
    requiredQualifyingDays: 14,
    deadlineOffset: 21,
  },
} as const satisfies Record<
  ChallengeBusinessActionType,
  BusinessChallengeDefinition
>;

export type BusinessChallengeMetricValues = Readonly<
  Record<BusinessChallengeMetric, number>
>;

export type BusinessChallengeEvaluation = {
  evaluated: boolean;
  qualifies: boolean;
  outcome: Extract<BusinessActionOutcome, "success" | "backlash"> | null;
};

export type BusinessChallengeOutcomeEffect = {
  userMultipliers: Readonly<Record<keyof UserState, number>>;
  trustDelta: number;
};

const OUTCOME_EFFECTS = {
  championship: {
    success: {
      userMultipliers: { tier: 0.07, casual: 0.04, collector: 0.025 },
      trustDelta: 5,
    },
    backlash: {
      userMultipliers: { tier: -0.1, casual: -0.065, collector: -0.035 },
      trustDelta: -10,
    },
  },
  "season-overhaul": {
    success: {
      userMultipliers: { tier: 0.18, casual: 0.18, collector: 0.18 },
      trustDelta: 10,
    },
    backlash: {
      userMultipliers: { tier: -0.15, casual: -0.15, collector: -0.15 },
      trustDelta: -18,
    },
  },
  "global-launch": {
    success: {
      userMultipliers: { tier: 0.2, casual: 0.7, collector: 1.4 },
      trustDelta: 8,
    },
    backlash: {
      userMultipliers: { tier: -0.12, casual: -0.3, collector: -0.5 },
      trustDelta: -14,
    },
  },
  "organized-play-platform": {
    success: {
      userMultipliers: { tier: 0.12, casual: 0.08, collector: 0.04 },
      trustDelta: 6,
    },
    backlash: {
      userMultipliers: { tier: -0.1, casual: -0.07, collector: -0.04 },
      trustDelta: -12,
    },
  },
} as const satisfies Record<
  ChallengeBusinessActionType,
  Record<"success" | "backlash", BusinessChallengeOutcomeEffect>
>;

export function isChallengeBusinessAction(
  type: BusinessActionType,
): type is ChallengeBusinessActionType {
  return (CHALLENGE_BUSINESS_ACTION_TYPES as readonly BusinessActionType[])
    .includes(type);
}

export function createBusinessChallenge(
  type: ChallengeBusinessActionType,
  startedDay: number,
): BusinessChallengeProgress {
  const definition = BUSINESS_CHALLENGE_BY_TYPE[type];
  return {
    metric: definition.metric,
    threshold: definition.threshold,
    requiredQualifyingDays: definition.requiredQualifyingDays,
    qualifyingDays: 0,
    observedDays: 0,
    deadlineDay: startedDay + definition.deadlineOffset,
    lastEvaluatedDay: null,
    lastValue: null,
  };
}

export function getBusinessChallengeOutcomeEffect(
  type: ChallengeBusinessActionType,
  outcome: "success" | "backlash",
): BusinessChallengeOutcomeEffect {
  return OUTCOME_EFFECTS[type][outcome];
}

/**
 * Validates persisted challenge progress without requiring the save parser.
 * Missing progress is deliberately accepted so v8 saves created before the
 * challenge fields existed can be upgraded lazily on their next simulated day.
 */
export function getBusinessChallengeProgressError(
  record: BusinessActionRecord,
  currentDay: number,
): string | null {
  const challenge = record.challenge;
  if (!challenge) return null;
  if (!isChallengeBusinessAction(record.type)) {
    return "challenge metadata belongs to a non-challenge action";
  }

  const definition = BUSINESS_CHALLENGE_BY_TYPE[record.type];
  if (
    challenge.metric !== definition.metric ||
    challenge.threshold !== definition.threshold ||
    challenge.requiredQualifyingDays !== definition.requiredQualifyingDays ||
    challenge.deadlineDay !== record.startedDay + definition.deadlineOffset
  ) {
    return "challenge configuration does not match its action definition";
  }
  if (
    !Number.isInteger(challenge.qualifyingDays) ||
    challenge.qualifyingDays < 0 ||
    !Number.isInteger(challenge.observedDays) ||
    challenge.observedDays < 0 ||
    challenge.qualifyingDays > challenge.observedDays ||
    challenge.observedDays > definition.deadlineOffset
  ) {
    return "challenge counters are out of range";
  }

  const elapsedChallengeDays = Math.max(
    0,
    Math.min(currentDay, challenge.deadlineDay) - record.startedDay,
  );
  if (challenge.observedDays > elapsedChallengeDays) {
    return "challenge progress is ahead of the current day";
  }

  const hasEvaluation = challenge.observedDays > 0;
  if (
    (challenge.lastEvaluatedDay === null) !== !hasEvaluation ||
    (challenge.lastValue === null) !== !hasEvaluation
  ) {
    return "challenge evaluation metadata is incomplete";
  }
  if (
    hasEvaluation &&
    (!Number.isInteger(challenge.lastEvaluatedDay) ||
      challenge.lastEvaluatedDay! <= record.startedDay ||
      challenge.lastEvaluatedDay! > challenge.deadlineDay ||
      challenge.lastEvaluatedDay! > currentDay ||
      !Number.isFinite(challenge.lastValue) ||
      challenge.lastValue! < 0 ||
      challenge.lastValue! > 100)
  ) {
    return "challenge's latest evaluation is invalid";
  }

  if (record.outcome === "active") {
    if (
      record.resolvedDay !== undefined ||
      currentDay >= challenge.deadlineDay
    ) {
      return "active challenge is already due for resolution";
    }
    return null;
  }
  if (record.outcome !== "success" && record.outcome !== "backlash") {
    return "challenge has an unsupported outcome";
  }
  if (
    record.resolvedDay !== challenge.deadlineDay ||
    challenge.lastEvaluatedDay !== challenge.deadlineDay
  ) {
    return "resolved challenge does not end on its deadline";
  }
  const metTarget =
    challenge.qualifyingDays >= challenge.requiredQualifyingDays;
  if ((record.outcome === "success") !== metTarget) {
    return "challenge outcome disagrees with its qualifying-day progress";
  }
  return null;
}

/**
 * Mutates only the record's persisted progress. No random value is consulted.
 * Production launch risk is always strictly between zero and one. Exact 0/1
 * remain deterministic compatibility sentinels for old simulations that used
 * those boundary values to force a strategic fixture.
 */
export function updateBusinessChallenge(
  record: BusinessActionRecord & { challenge: BusinessChallengeProgress },
  values: BusinessChallengeMetricValues,
  day: number,
): BusinessChallengeEvaluation {
  const challenge = record.challenge;
  if (
    record.outcome !== "active" ||
    day <= record.startedDay ||
    day > challenge.deadlineDay ||
    (challenge.lastEvaluatedDay !== null && challenge.lastEvaluatedDay >= day)
  ) {
    return { evaluated: false, qualifies: false, outcome: null };
  }

  const value = values[challenge.metric];
  const legacyForcedQualification = record.risk === 0
    ? true
    : record.risk === 1
      ? false
      : null;
  const qualifies = legacyForcedQualification ?? value >= challenge.threshold;
  challenge.observedDays += 1;
  if (qualifies) challenge.qualifyingDays += 1;
  challenge.lastEvaluatedDay = day;
  challenge.lastValue = value;

  if (day < challenge.deadlineDay) {
    return { evaluated: true, qualifies, outcome: null };
  }
  return {
    evaluated: true,
    qualifies,
    outcome:
      challenge.qualifyingDays >= challenge.requiredQualifyingDays
        ? "success"
        : "backlash",
  };
}
