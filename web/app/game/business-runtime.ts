import {
  BUSINESS_ACTION_BY_TYPE,
  getBusinessActionAvailability,
  getBusinessActionSuccessProbability,
  getBusinessActionSaturationMultiplier,
  getBusinessActionScheduledEndDay,
  getBusinessEnvironmentHealth,
  getPackOddsDetectionRisk,
  getProbabilisticBusinessActionEffectMultiplier,
  getProbabilisticBusinessActionOutcome,
  getRecentReleaseQuality,
  getStackedBusinessActionDailyGrossRevenue,
  getStrategicProjectRiskProfile,
  getStrategicSuccessBenefits,
  isBusinessActionEffectActive,
  isProbabilisticBusinessAction,
  isStrategicBusinessAction,
} from "./business-actions.ts";
import {
  createBusinessChallenge,
  getBusinessChallengeOutcomeEffect,
  isChallengeBusinessAction,
  updateBusinessChallenge,
} from "./business-challenges.ts";
import {
  applyBusinessStrategyDelta,
  getBusinessEventChoice,
  getBusinessEventOutcome,
  getBusinessEventResult,
  getBusinessEventRevenueBonus as getResolvedBusinessEventRevenueBonus,
  getBusinessEventType,
  getBusinessStrategyModifiers,
  getNextBusinessEventDay,
} from "./business-events.ts";
import { getStableThemeRandomIdentifier } from "./future-theme-id-migration.ts";
import type {
  BusinessActionRecord,
  BusinessActionType,
  BusinessEventChoice,
  BusinessEventRecord,
  GameState,
} from "./types.ts";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Preserve the engine's keyed pack-odds roll without sharing mutable RNG state. */
function keyedRandom(seed: number, ...keys: Array<string | number>): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const text = keys
    .map((key) =>
      typeof key === "string" ? getStableThemeRandomIdentifier(key) : key,
    )
    .join("\u001f");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function activeBusinessRecords(
  state: GameState,
  day = state.day,
): BusinessActionRecord[] {
  return state.operations.records.filter((record) =>
    isBusinessActionEffectActive(record, day),
  );
}

export function getBusinessUserRateModifiers(state: GameState): {
  tier: number;
  casual: number;
  collector: number;
} {
  const modifiers = { tier: 0, casual: 0, collector: 0 };
  for (const record of activeBusinessRecords(state)) {
    const delta = { tier: 0, casual: 0, collector: 0 };
    switch (record.type) {
      case "tv-cm":
        delta.tier = 0.0002;
        delta.casual = 0.0012;
        delta.collector = 0.0004;
        break;
      case "animation-promotion":
        delta.tier = 0.0004;
        delta.casual = 0.0018;
        delta.collector = 0.0016;
        break;
      case "championship":
        if (record.outcome === "success") {
          delta.tier = 0.0012;
          delta.casual = 0.00045;
          delta.collector = 0.0002;
        } else if (record.outcome === "backlash") {
          delta.tier = -0.0018;
          delta.casual = -0.0008;
          delta.collector = -0.00035;
        }
        break;
      case "store-tour":
        delta.tier = 0.0001;
        delta.casual = 0.0008;
        delta.collector = 0.00025;
        break;
      case "beginner-camp":
        delta.tier = 0.00005;
        delta.casual = 0.0011;
        delta.collector = 0.00005;
        break;
      case "local-league":
        delta.tier = 0.0008;
        delta.casual = 0.0002;
        delta.collector = 0.00005;
        break;
      case "reprint-campaign":
        delta.tier = 0.00005;
        delta.casual = 0.0001;
        delta.collector = 0.00055;
        break;
      case "collector-fair":
        delta.tier = 0.00005;
        delta.casual = 0.00015;
        delta.collector = 0.0013;
        break;
      case "pack-odds":
      case "season-overhaul":
      case "global-launch":
      case "first-print-expansion":
        break;
    }
    const effectiveness = getBusinessActionSaturationMultiplier(
      state,
      record.type,
      record.startedDay,
    );
    const outcomeMultiplier = getProbabilisticBusinessActionEffectMultiplier(
      record.type,
      record.outcome,
    );
    modifiers.tier += delta.tier * effectiveness * outcomeMultiplier;
    modifiers.casual += delta.casual * effectiveness * outcomeMultiplier;
    modifiers.collector +=
      delta.collector * effectiveness * outcomeMultiplier;
  }
  const strategicBenefits = getStrategicSuccessBenefits(state);
  const strategyRates = getBusinessStrategyModifiers(
    state.operations.strategy,
  ).userRates;
  modifiers.tier += strategyRates.tier + strategicBenefits.userRates.tier;
  modifiers.casual +=
    strategyRates.casual + strategicBenefits.userRates.casual;
  modifiers.collector +=
    strategyRates.collector + strategicBenefits.userRates.collector;
  return modifiers;
}

export function getBusinessBuyerRateBonus(state: GameState): number {
  const actionBonus = activeBusinessRecords(state).reduce((bonus, record) => {
    let baseBonus = 0;
    switch (record.type) {
      case "tv-cm":
        baseBonus = 0.01;
        break;
      case "animation-promotion":
        baseBonus = 0.025;
        break;
      case "championship":
        baseBonus = record.outcome === "success" ? 0.008 : -0.008;
        break;
      case "store-tour":
        baseBonus = 0.006;
        break;
      case "beginner-camp":
        baseBonus = 0.002;
        break;
      case "local-league":
        baseBonus = 0.004;
        break;
      case "reprint-campaign":
        baseBonus = 0.002;
        break;
      case "collector-fair":
        baseBonus = 0.012;
        break;
      case "pack-odds":
        break;
      case "season-overhaul":
        baseBonus = record.outcome === "success"
          ? 0.008
          : record.outcome === "backlash"
            ? -0.006
            : 0;
        break;
      case "global-launch":
        baseBonus = record.outcome === "success"
          ? 0.01
          : record.outcome === "backlash"
            ? -0.008
            : 0;
        break;
      case "first-print-expansion":
        baseBonus = record.outcome === "success"
          ? 0.015
          : record.outcome === "backlash"
            ? -0.012
            : 0;
        break;
    }
    return bonus +
      baseBonus *
        getBusinessActionSaturationMultiplier(
          state,
          record.type,
          record.startedDay,
        ) *
        getProbabilisticBusinessActionEffectMultiplier(
          record.type,
          record.outcome,
        );
  }, 0);
  const strategicBenefits = getStrategicSuccessBenefits(state);
  return actionBonus +
    getBusinessStrategyModifiers(state.operations.strategy).buyerRate +
    strategicBenefits.buyerRate;
}

export function getBusinessTrustRecovery(state: GameState): number {
  const actionRecovery = activeBusinessRecords(state).reduce((recovery, record) => {
    let baseRecovery = 0;
    if (record.type === "store-tour") baseRecovery = 0.08;
    if (record.type === "animation-promotion") baseRecovery = 0.015;
    if (record.type === "beginner-camp") baseRecovery = 0.03;
    if (record.type === "local-league") baseRecovery = 0.015;
    if (record.type === "reprint-campaign") baseRecovery = 0.06;
    if (record.type === "collector-fair") baseRecovery = 0.01;
    if (record.type === "championship" && record.outcome === "success") {
      baseRecovery = 0.025;
    }
    return recovery +
      baseRecovery *
        getBusinessActionSaturationMultiplier(
          state,
          record.type,
          record.startedDay,
        ) *
        getProbabilisticBusinessActionEffectMultiplier(
          record.type,
          record.outcome,
        );
  }, 0);
  const strategicBenefits = getStrategicSuccessBenefits(state);
  return actionRecovery +
    getBusinessStrategyModifiers(state.operations.strategy).trustPerDay +
    strategicBenefits.trustPerDay;
}

/** Gross revenue generated by paid actions and events outside regular releases. */
export function getBusinessEventRevenueBonus(state: GameState): number {
  const actionRevenue = getStackedBusinessActionDailyGrossRevenue(
    state,
    activeBusinessRecords(state),
  );
  const resolvedEventBonus = state.operations.eventRecords.reduce(
    (bonus, record) =>
      bonus + getResolvedBusinessEventRevenueBonus(record, state.day),
    0,
  );
  return actionRevenue +
    resolvedEventBonus +
    getStrategicSuccessBenefits(state).dailyGrossRevenue;
}

export function getResolvedBusinessEventCashDelta(state: GameState): number {
  return state.operations.eventRecords.reduce((total, record) => {
    if (
      record.outcome === "pending" ||
      record.resolvedDay !== state.day
    ) {
      return total;
    }
    return total + getBusinessEventResult(
      record.type,
      record.choice,
      record.outcome,
    ).cashDelta;
  }, 0);
}

export function hasPackOddsAdjustmentForRelease(
  state: GameState,
  releaseDay: number,
): boolean {
  return state.operations.records.some(
    (record) =>
      record.type === "pack-odds" &&
      record.appliedDay === releaseDay &&
      state.day >= releaseDay &&
      state.day <= record.endsDay &&
      (record.outcome === "active" || record.outcome === "clean"),
  );
}

export function applyPendingPackOddsToCurrentRelease(state: GameState): void {
  const pending = state.operations.records.find(
    (record) => record.type === "pack-odds" && record.outcome === "pending",
  );
  if (!pending) return;

  pending.appliedDay = state.day;
  pending.endsDay = state.day + 29;
  pending.outcome = "active";
}

function updateBusinessActionLifecycle(state: GameState): void {
  for (const record of state.operations.records) {
    if (
      isProbabilisticBusinessAction(record.type) &&
      record.risk !== undefined &&
      record.outcome === "active" &&
      state.day > record.startedDay
    ) {
      record.outcome = getProbabilisticBusinessActionOutcome(
        record,
      );
      record.resolvedDay = record.startedDay + 1;
    }

    if (
      isChallengeBusinessAction(record.type) &&
      record.outcome === "active"
    ) {
      // Schema-v8 saves created before deterministic challenges have no
      // progress object. Start from a safe explicit condition on first resume.
      record.challenge ??= createBusinessChallenge(record.type, record.startedDay);
      const evaluation = updateBusinessChallenge(
        record as BusinessActionRecord & {
          challenge: NonNullable<BusinessActionRecord["challenge"]>;
        },
        {
          "environment-health": getBusinessEnvironmentHealth(state),
          "purchase-trust": state.purchaseTrust,
          "release-quality": getRecentReleaseQuality(state),
        },
        state.day,
      );
      if (evaluation.outcome) {
        const outcome = evaluation.outcome;
        record.outcome = outcome;
        record.resolvedDay = state.day;
        const effect = getBusinessChallengeOutcomeEffect(record.type, outcome);
        for (const segment of ["tier", "casual", "collector"] as const) {
          state.users[segment] = round(
            Math.max(
              0,
              state.users[segment] * (1 + effect.userMultipliers[segment]),
            ),
            2,
          );
        }
        state.purchaseTrust = round(
          clamp(state.purchaseTrust + effect.trustDelta, 0, 100),
          4,
        );

        if (outcome === "success" && isStrategicBusinessAction(record.type)) {
          const definition = BUSINESS_ACTION_BY_TYPE[record.type];
          const cashReturn = definition.successReturn ?? 0;
          record.cashReturn = cashReturn;
          state.finance.cash = round(state.finance.cash + cashReturn, 4);
        }
      }
    }

    if (
      record.type === "pack-odds" &&
      record.outcome === "active" &&
      record.appliedDay !== undefined &&
      state.day > record.appliedDay
    ) {
      const risk = record.risk ?? 0.3;
      const roll = keyedRandom(
        state.seed,
        "pack-odds-detection",
        record.id,
        record.appliedDay,
      );
      const detected = roll < risk;
      record.outcome = detected ? "detected" : "clean";
      record.resolvedDay = state.day;
      if (detected) {
        state.purchaseTrust = round(
          clamp(state.purchaseTrust - 10, 0, 100),
          4,
        );
      }
    }

    if (record.outcome === "active" && state.day > record.endsDay) {
      record.outcome = "completed";
    }
  }
}

function updateBusinessEventLifecycle(state: GameState): void {
  for (const record of state.operations.eventRecords) {
    if (record.outcome !== "pending" || state.day < record.resolutionDay) {
      continue;
    }
    const outcome = getBusinessEventOutcome(state.seed, record.id, record.risk);
    const result = getBusinessEventResult(record.type, record.choice, outcome);
    record.outcome = outcome;
    record.resolvedDay = state.day;

    for (const segment of ["tier", "casual", "collector"] as const) {
      state.users[segment] = round(
        Math.max(
          0,
          state.users[segment] * (1 + result.userMultipliers[segment]),
        ),
        2,
      );
    }
    state.purchaseTrust = round(
      clamp(state.purchaseTrust + result.trustDelta, 0, 100),
      4,
    );
    state.finance.cash = round(
      Math.max(0, state.finance.cash + result.cashDelta),
      4,
    );
  }
}

export function updateBusinessLifecycle(state: GameState): void {
  updateBusinessActionLifecycle(state);
  updateBusinessEventLifecycle(state);
}

export function openBusinessEvent(state: GameState): void {
  if (
    state.operations.pendingEvent ||
    state.operations.nextEventDay === null ||
    state.day !== state.operations.nextEventDay
  ) {
    return;
  }
  const eventNumber = state.operations.nextEventId;
  state.operations.pendingEvent = {
    id: `business-event-${eventNumber}`,
    type: getBusinessEventType(state.seed, eventNumber),
    appearedDay: state.day,
  };
  state.operations.nextEventDay = null;
}

export function chooseBusinessEvent(
  state: GameState,
  eventId: string,
  choiceId: BusinessEventChoice,
): void {
  if (state.phase !== "running") {
    throw new Error("Business events can only be resolved during normal operations.");
  }
  const pending = state.operations.pendingEvent;
  if (!pending || pending.id !== eventId) {
    throw new Error(`Unknown pending business event: ${eventId}.`);
  }
  const choice = getBusinessEventChoice(pending.type, choiceId);
  if (state.finance.cash + 1e-9 < choice.cost) {
    throw new Error("Not enough operating cash for this business-event choice.");
  }

  const record: BusinessEventRecord = {
    id: pending.id,
    type: pending.type,
    appearedDay: pending.appearedDay,
    choice: choice.id,
    cost: choice.cost,
    risk: choice.risk,
    resolutionDay: state.day + choice.resolutionDelay,
    outcome: "pending",
  };
  state.operations.eventRecords.push(record);
  state.operations.strategy = applyBusinessStrategyDelta(
    state.operations.strategy,
    choice.strategyDelta,
  );
  state.finance.cash = round(state.finance.cash - choice.cost, 4);
  state.finance.todayOperatingCash = round(
    state.finance.todayOperatingCash - choice.cost,
    4,
  );
  state.finance.cumulativeExpenses = round(
    state.finance.cumulativeExpenses + choice.cost,
    4,
  );
  state.operations.pendingEvent = null;
  state.operations.nextEventId += 1;
  state.operations.nextEventDay = getNextBusinessEventDay(
    state.seed,
    state.day,
    state.operations.nextEventId,
  );
}

export function runBusinessAction(
  state: GameState,
  actionType: BusinessActionType,
): void {
  const definition = BUSINESS_ACTION_BY_TYPE[actionType];
  if (!definition) throw new Error(`Unknown business action: ${actionType}.`);

  const availability = getBusinessActionAvailability(state, actionType);
  if (!availability.available) {
    throw new Error(
      availability.reason ?? "This business action is not currently available.",
    );
  }

  const id = `business-action-${state.operations.nextActionId}`;
  const record: BusinessActionRecord = {
    id,
    type: actionType,
    startedDay: state.day,
    endsDay: getBusinessActionScheduledEndDay(state.day, actionType),
    cost: definition.cost,
    outcome: actionType === "pack-odds" ? "pending" : "active",
    ...(isChallengeBusinessAction(actionType)
      ? { challenge: createBusinessChallenge(actionType, state.day) }
      : {}),
  };

  if (isProbabilisticBusinessAction(actionType)) {
    const successProbability = getBusinessActionSuccessProbability(
      state,
      actionType,
    );
    if (successProbability === null) {
      throw new Error(`Missing success probability for ${actionType}.`);
    }
    record.risk = round(1 - successProbability, 4);
  } else if (actionType === "championship") {
    record.environmentHealth = round(getBusinessEnvironmentHealth(state), 4);
  } else if (actionType === "pack-odds") {
    record.risk = round(getPackOddsDetectionRisk(state), 4);
  } else if (isStrategicBusinessAction(actionType)) {
    const profile = getStrategicProjectRiskProfile(state, actionType);
    record.riskContext = profile.context;
  }

  state.operations.records.push(record);
  state.operations.nextActionId += 1;
  state.finance.cash = round(state.finance.cash - definition.cost, 4);
  state.finance.todayOperatingCash = round(
    state.finance.todayOperatingCash - definition.cost,
    4,
  );
  state.finance.cumulativeExpenses = round(
    state.finance.cumulativeExpenses + definition.cost,
    4,
  );
}
