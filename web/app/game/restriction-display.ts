import { THEME_BY_ID } from "./content.ts";
import { getGenericCard } from "./generic-card-catalog.ts";
import type {
  GameState,
  PartRole,
  RestrictionLimit,
} from "./types.ts";

const ROLE_LABELS: Record<PartRole, string> = {
  starter1: "초동",
  starter2: "보조 초동",
  bridge: "연결",
  finisher: "결정타",
  recursion: "회수",
};

export type RestrictionCardDisplay = {
  cardId: string;
  name: string;
  accent?: string;
  effect: string;
  limit: RestrictionLimit;
  overline: string;
  themeId?: string;
};

export function getRestrictionCardDisplay(
  game: GameState,
  cardId: string,
): RestrictionCardDisplay {
  const genericCard = getGenericCard(cardId);
  if (genericCard) {
    return {
      cardId,
      name: genericCard.name,
      effect: genericCard.description,
      limit: game.genericLimits[genericCard.id] ?? 3,
      overline: "범용 카드",
    };
  }

  for (const themeId of game.activeThemeIds) {
    const theme = THEME_BY_ID[themeId];
    const part = theme?.parts.find((candidate) => candidate.id === cardId);
    if (!theme || !part) continue;
    return {
      cardId,
      name: part.name,
      accent: theme.color,
      effect: `${theme.shortName}의 ${ROLE_LABELS[part.role]} 카드. ${theme.playstyle}`,
      limit: game.themes[themeId]?.legalLimits[cardId] ?? 3,
      overline: theme.name,
      themeId,
    };
  }

  return {
    cardId,
    name: cardId,
    effect: "환경의 핵심 흐름에 영향을 주는 카드입니다.",
    limit: 3,
    overline: "테마 카드",
  };
}

export function getCurrentRestrictionCards(
  game: GameState,
): RestrictionCardDisplay[] {
  const cardIds = new Set<string>();

  for (const themeId of game.activeThemeIds) {
    const runtime = game.themes[themeId];
    for (const cardId of runtime.releasedPartIds) {
      if ((runtime.legalLimits[cardId] ?? 3) < 3) cardIds.add(cardId);
    }
  }

  for (const [cardId, limit] of Object.entries(game.genericLimits)) {
    if (limit < 3) cardIds.add(cardId);
  }

  return [...cardIds]
    .map((cardId) => getRestrictionCardDisplay(game, cardId))
    .sort((left, right) =>
      left.limit - right.limit || left.name.localeCompare(right.name, "ko"),
    );
}
