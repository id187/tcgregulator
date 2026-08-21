import {
  getReleaseSequenceNumber,
  isReprintReleaseDay,
  RELEASE_INTERVAL,
  REPRINT_RELEASE_EVERY,
} from "./campaign.ts";
import type { ReleaseKind } from "./release-kind.ts";

const RELEASE_PACK_SERIES_NAME = "REGULATOR PACK";

/**
 * Scheduled releases happen once per release interval, so the release day is
 * enough to reconstruct a stable volume number for every published batch.
 */
export function getReleasePackVolume(releaseDay: number): number {
  if (!Number.isFinite(releaseDay)) return 1;
  const sequence = getReleaseSequenceNumber(releaseDay);
  if (sequence !== null) {
    return Math.max(1, sequence - Math.floor(sequence / REPRINT_RELEASE_EVERY));
  }
  return Math.max(1, Math.floor(releaseDay / RELEASE_INTERVAL));
}

export function getReprintPackVolume(releaseDay: number): number {
  const sequence = getReleaseSequenceNumber(releaseDay);
  if (sequence !== null) {
    return Math.max(1, Math.floor(sequence / REPRINT_RELEASE_EVERY));
  }
  return Math.max(1, Math.floor(releaseDay / (RELEASE_INTERVAL * REPRINT_RELEASE_EVERY)));
}

export function getReleasePackName(
  releaseDay: number,
  releaseKind: ReleaseKind = isReprintReleaseDay(releaseDay)
    ? "reprint"
    : "regular",
): string {
  if (releaseKind === "reprint") {
    return `REGULATOR REPRINT Vol. ${getReprintPackVolume(releaseDay)}`;
  }
  return `${RELEASE_PACK_SERIES_NAME} Vol. ${getReleasePackVolume(releaseDay)}`;
}
