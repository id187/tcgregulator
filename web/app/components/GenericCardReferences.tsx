import { THEME_BY_ID } from "../game/content.ts";
import { getCurrentGenericMetaModel } from "../game/engine.ts";
import {
  getGenericCard,
  type GenericCardCatalogEntry,
  type GenericCardId,
} from "../game/generic-card-catalog.ts";
import type { GenericCardMetaEntry } from "../game/generic-card-meta.ts";
import type {
  GameState,
  PowerAdjustment,
  RestrictionLimit,
  ThemeId,
} from "../game/types.ts";

export type ReleasedGenericCardReference = {
  card: GenericCardCatalogEntry;
  releaseDay: number;
  powerAdjustment: PowerAdjustment;
  legalLimit: RestrictionLimit;
  meta: GenericCardMetaEntry | null;
};

export function getReleasedGenericCardReferences(
  game: GameState,
): ReleasedGenericCardReference[] {
  const meta = getCurrentGenericMetaModel(game);
  const releases = new Map<
    GenericCardId,
    { day: number; powerAdjustment: PowerAdjustment }
  >();
  for (const batch of game.releaseHistory) {
    for (const product of batch.products) {
      if (product.kind !== "generic" || releases.has(product.genericCardId)) {
        continue;
      }
      releases.set(product.genericCardId, {
        day: batch.day,
        powerAdjustment: product.powerAdjustment,
      });
    }
  }
  return [...releases.entries()]
    .flatMap(([cardId, release]) => {
      const card = getGenericCard(cardId);
      if (!card) return [];
      return [
        {
          card,
          releaseDay: release.day,
          powerAdjustment: release.powerAdjustment,
          legalLimit: game.genericLimits[cardId] ?? 3,
          meta: meta.cardMetaById[cardId] ?? null,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.releaseDay - left.releaseDay ||
        left.card.name.localeCompare(right.card.name),
    );
}

function getGenericAdopterThemeIds(
  game: GameState,
  meta: GenericCardMetaEntry | null,
  limit = 4,
): ThemeId[] {
  if (!meta || meta.legalLimit === 0) return [];
  return Object.entries(meta.adoptionByTheme)
    .filter(([, adoption]) => adoption >= 0.12)
    .sort(
      ([leftId, leftAdoption], [rightId, rightAdoption]) =>
        rightAdoption - leftAdoption ||
        (game.themes[rightId]?.share ?? 0) -
          (game.themes[leftId]?.share ?? 0) ||
        leftId.localeCompare(rightId),
    )
    .slice(0, limit)
    .map(([themeId]) => themeId);
}

export function GenericAdopterNames({
  game,
  meta,
  limit = 4,
}: {
  game: GameState;
  meta: GenericCardMetaEntry | null;
  limit?: number;
}) {
  const themeIds = getGenericAdopterThemeIds(game, meta, limit);
  if (themeIds.length === 0) {
    return <span className="generic-researching">채용 연구 중</span>;
  }
  return (
    <span className="generic-adopter-names">
      {themeIds
        .map((themeId) => THEME_BY_ID[themeId]?.shortName ?? themeId)
        .join(" · ")}
    </span>
  );
}
