import type { GameState } from "./types";

export const GUIDED_OBJECTIVE_COUNT = 8;
export const DEFAULT_TUTORIAL_GUIDANCE_ENABLED = true;

export const GUIDED_CHECKPOINT_DAYS = [8, 15, 16, 22, 23, 30, 31] as const;

export type TutorialGuidanceEvent =
  | "complete"
  | "skip"
  | "settings-enable"
  | "settings-disable";

export type GuidedStep =
  | "observe"
  | "restriction"
  | "restriction-reaction"
  | "business"
  | "release-runup"
  | "release"
  | "release-reaction"
  | "handover";

export const GUIDED_OBJECTIVE_BY_STEP: Readonly<Record<GuidedStep, number>> = {
  observe: 1,
  restriction: 3,
  "restriction-reaction": 4,
  business: 5,
  "release-runup": 6,
  release: 7,
  "release-reaction": 7,
  handover: 8,
};

export function getGuidedObjective(step: GuidedStep, day: number): number {
  if (step === "observe") return day >= 8 ? 2 : 1;
  if (step === "restriction-reaction" && day === 15) return 3;
  if (step === "release-runup" && day === 22) return 5;
  return GUIDED_OBJECTIVE_BY_STEP[step];
}

export function getGuidedStep(game: GameState): GuidedStep {
  // Let a v0.2.0 save paused on the former restriction board finish its
  // pending decision before treating its later day as a completed handover.
  if (game.phase === "ban-edit") return "restriction";
  if (game.handoverComplete || game.day >= 31) return "handover";
  if (game.day < 15) return "observe";
  if (game.day === 15) {
    return "restriction-reaction";
  }
  if (game.day < 22) return "restriction-reaction";
  if (game.day === 22) {
    const firstBusinessActionComplete = game.operations.records.some(
      (record) => record.type === "tv-cm" && record.startedDay === 22,
    );
    return firstBusinessActionComplete ? "release-runup" : "business";
  }
  if (game.day < 30) return "release-runup";
  if (game.day === 30) {
    return game.phase === "release-edit" ? "release" : "release-reaction";
  }
  return "handover";
}

export function shouldShowGuidedPrompt(
  step: GuidedStep,
  day: number,
): boolean {
  if (step === "observe") return day === 1 || day === 8;
  if (step === "restriction-reaction") return day === 16;
  if (step === "business" || step === "release" || step === "restriction") {
    return true;
  }
  if (step === "release-runup") return day === 23;
  if (step === "release-reaction") return day === 30;
  return step === "handover" && day === 31;
}

export function getGuidedAdvanceDays(
  step: GuidedStep,
  day: number,
  requestedDays: 1 | 7,
): number | null {
  const canAdvance =
    step === "observe" ||
    step === "restriction-reaction" ||
    step === "release-runup" ||
    step === "release-reaction";
  if (!canAdvance) return null;

  const nextCheckpoint = GUIDED_CHECKPOINT_DAYS.find(
    (checkpoint) => checkpoint > day,
  );
  if (nextCheckpoint === undefined) return requestedDays;
  return Math.max(1, Math.min(requestedDays, nextCheckpoint - day));
}

export function isGuidedAdvanceDaysAllowed(
  step: GuidedStep,
  day: number,
  days: 1 | 7,
): boolean {
  return getGuidedAdvanceDays(step, day, days) !== null;
}

export function getTutorialGuidanceEnabledAfterEvent(
  current: boolean,
  event: TutorialGuidanceEvent,
): boolean {
  if (event === "settings-enable") return true;
  if (
    event === "complete" ||
    event === "skip" ||
    event === "settings-disable"
  ) {
    return false;
  }
  return current;
}
