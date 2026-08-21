import {
  CAMPAIGN_END_DAY,
  LAST_BAN_DAY,
  LAST_RELEASE_DAY,
  SETTLEMENT_START_DAY,
} from "./campaign.ts";

export type CampaignMilestone = {
  days: number;
  label: string;
};

export function getNextCampaignMilestone({
  day,
  nextBanDay,
  nextReleaseDay,
  phase,
}: {
  day: number;
  nextBanDay: number;
  nextReleaseDay: number;
  phase: "running" | "release-edit" | "ban-edit" | "ended";
}): CampaignMilestone | null {
  if (phase === "ended" || day >= CAMPAIGN_END_DAY) return null;

  const next = [
    day < LAST_RELEASE_DAY && nextReleaseDay > day
      ? { day: nextReleaseDay, label: "정기 발매" }
      : null,
    day < LAST_BAN_DAY && nextBanDay > day
      ? { day: nextBanDay, label: "금제위원회" }
      : null,
    day < SETTLEMENT_START_DAY
      ? { day: SETTLEMENT_START_DAY, label: "결산 관찰" }
      : null,
    day < CAMPAIGN_END_DAY
      ? { day: CAMPAIGN_END_DAY, label: "임기 종료" }
      : null,
  ]
    .filter((entry): entry is { day: number; label: string } => Boolean(entry))
    .sort((left, right) => left.day - right.day)[0];

  return next ? { days: next.day - day, label: next.label } : null;
}
