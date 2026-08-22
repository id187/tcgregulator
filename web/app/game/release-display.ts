import {
  INITIAL_THEME_PART_COUNT,
  SUPPORT_PARTS_PER_RELEASE,
} from "./content.ts";
import type { GameState, ThemeContent } from "./types.ts";

export function getPartReleaseLabel(
  game: GameState,
  theme: ThemeContent,
  partId: string,
): string {
  const partIndex = theme.parts.findIndex((part) => part.id === partId);
  if (partIndex < 0) return "출시 기록 없음";

  if (partIndex < INITIAL_THEME_PART_COUNT) {
    const debut = game.releaseHistory.find((batch) =>
      batch.products.some(
        (product) =>
          product.kind === "new-theme" && product.themeId === theme.id,
      ),
    );
    return debut ? `DAY ${debut.day}` : "취임 전 출시";
  }

  const supportWave = Math.floor(
    (partIndex - INITIAL_THEME_PART_COUNT) / SUPPORT_PARTS_PER_RELEASE,
  );
  const supportReleases = game.releaseHistory.filter((batch) =>
    batch.products.some(
      (product) => product.kind === "support" && product.themeId === theme.id,
    ),
  );
  const release = supportReleases[supportWave];
  return release ? `DAY ${release.day}` : "출시 기록 없음";
}
