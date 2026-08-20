import { RELEASE_INTERVAL } from "./campaign.ts";

const RELEASE_PACK_SERIES_NAME = "REGULATOR PACK";

/**
 * Scheduled releases happen once per release interval, so the release day is
 * enough to reconstruct a stable volume number for old and new save files.
 */
export function getReleasePackVolume(releaseDay: number): number {
  if (!Number.isFinite(releaseDay)) return 1;
  return Math.max(1, Math.floor(releaseDay / RELEASE_INTERVAL));
}

export function getReleasePackName(releaseDay: number): string {
  return `${RELEASE_PACK_SERIES_NAME} Vol. ${getReleasePackVolume(releaseDay)}`;
}
