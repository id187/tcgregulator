import { THEME_BY_ID } from "../game/content.ts";
import { getPlayKeyword } from "../game/play-keywords.ts";
import { getPartReleaseLabel } from "../game/release-display.ts";
import type { GameState, RestrictionLimit } from "../game/types.ts";
import {
  GenericAdopterNames,
  getReleasedGenericCardReferences,
} from "./GenericCardReferences.tsx";

const LIMIT_LABELS: Record<RestrictionLimit, string> = {
  0: "금지",
  1: "제한",
  2: "준제한",
  3: "무제한",
};

function getLastRestrictionDay(game: GameState, cardId: string): string {
  const lastDay = game.community.reduce((latest, event) => {
    const isCardChange =
      event.category === "restriction" &&
      (event.type === "restriction-applied" ||
        event.type === "cosmetic-restriction") &&
      (event.partId === cardId || event.genericCardId === cardId);
    return isCardChange ? Math.max(latest, event.day) : latest;
  }, -1);
  return lastDay >= 0 ? `DAY ${lastDay}` : "—";
}

export function CurrentBanList({
  expanded = false,
  game,
}: {
  expanded?: boolean;
  game: GameState;
}) {
  const themeEntries = game.activeThemeIds.flatMap((themeId) => {
    const theme = THEME_BY_ID[themeId];
    const runtime = game.themes[themeId];
    if (!theme || !runtime) return [];
    return theme.parts
      .filter((part) => runtime.releasedPartIds.includes(part.id))
      .flatMap((part) => {
        const limit = runtime.legalLimits[part.id] ?? 3;
        return limit < 3 ? [{ theme, part, limit }] : [];
      });
  });
  const genericEntries = getReleasedGenericCardReferences(game).filter(
    (entry) => entry.legalLimit < 3,
  );
  const entries = [
    ...themeEntries.map((entry) => ({
      kind: "theme" as const,
      id: entry.part.id,
      limit: entry.limit,
      name: entry.part.name,
      group: entry.theme.shortName,
      release: getPartReleaseLabel(game, entry.theme, entry.part.id),
      adoptedBy: null,
    })),
    ...genericEntries.map((entry) => ({
      kind: "generic" as const,
      id: entry.card.id,
      limit: entry.legalLimit,
      name: entry.card.name,
      group: `범용 · ${getPlayKeyword(entry.card.keyword).label}`,
      release: `DAY ${entry.releaseDay}`,
      adoptedBy: entry.meta,
    })),
  ].sort(
    (left, right) =>
      left.limit - right.limit || left.name.localeCompare(right.name, "ko"),
  );

  return (
    <details className="current-banlist-reference" open={expanded}>
      <summary>
        현재 밴리스트 <span>{entries.length}장</span>
      </summary>
      {entries.length > 0 ? (
        <div className="current-banlist-reference-table">
          <div className="current-banlist-reference-head" role="row">
            <span>테마 / 카드</span>
            <span>출시</span>
            <span>최종 금제일</span>
            <span>현행</span>
          </div>
          {entries.map((entry) => (
            <div
              className={`current-banlist-reference-row${
                entry.kind === "generic" ? " generic-banlist-row" : ""
              }`}
              data-limit={entry.limit}
              key={entry.id}
              role="row"
            >
              <span>
                <small>{entry.group}</small>
                <strong>{entry.name}</strong>
                {entry.kind === "generic" && entry.adoptedBy ? (
                  <GenericAdopterNames
                    game={game}
                    limit={3}
                    meta={entry.adoptedBy}
                  />
                ) : null}
              </span>
              <span>{entry.release}</span>
              <span>{getLastRestrictionDay(game, entry.id)}</span>
              <strong className="current-banlist-seal">
                <span aria-hidden="true">
                  {entry.limit === 0 ? (
                    <i className="restriction-ban-symbol" />
                  ) : entry.limit === 1 ? (
                    "①"
                  ) : (
                    "②"
                  )}
                </span>
                {LIMIT_LABELS[entry.limit]}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="current-banlist-empty">현재 금제된 카드는 없습니다.</p>
      )}
    </details>
  );
}
