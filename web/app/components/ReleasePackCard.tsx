import { THEME_BY_ID } from "../game/content.ts";
import { getGenericCard } from "../game/generic-card-catalog.ts";
import { getReleasePackName } from "../game/release-pack-name.ts";
import type { ReleaseBatch } from "../game/types.ts";
import { ThemeEmblem } from "./ThemeEmblem.tsx";

function productLabel(product: ReleaseBatch["products"][number]): string {
  if (product.kind === "generic") {
    return getGenericCard(product.genericCardId)?.name ?? "범용 카드";
  }
  if (product.kind === "reprint") {
    const themePart = THEME_BY_ID[product.themeId]?.parts.find(
      (part) => part.id === product.cardId,
    );
    return `재판 · ${themePart?.name ?? getGenericCard(product.cardId)?.name ?? "출시 카드"}`;
  }
  const theme = THEME_BY_ID[product.themeId];
  return `${theme?.shortName ?? "테마"} ${product.kind === "new-theme" ? "신규" : "지원"}`;
}

export function ReleasePackCard({ batch }: { batch: ReleaseBatch }) {
  const packName = getReleasePackName(batch.day);
  const newThemeProduct = batch.products.find(
    (product) => product.kind === "new-theme",
  );
  const newTheme = newThemeProduct?.kind === "new-theme"
    ? THEME_BY_ID[newThemeProduct.themeId]
    : null;

  return (
    <article className="release-pack-card">
      <div
        aria-label={`${packName}, DAY ${batch.day} 발매${newTheme ? `, 신규 테마 ${newTheme.name}` : ""}`}
        className="release-pack-art"
        style={
          {
            "--pack-accent": newTheme?.color ?? "#315f82",
          } as React.CSSProperties
        }
      >
        <span aria-hidden="true" className="release-pack-seal" />
        <span className="release-pack-brand">TCG</span>
        {newTheme ? (
          <span className="release-pack-emblem">
            <ThemeEmblem
              decorative
              detail="full"
              size="100%"
              themeId={newTheme.id}
            />
          </span>
        ) : (
          <span aria-hidden="true" className="release-pack-generic-mark">◆</span>
        )}
        <strong>{packName}</strong>
        <small>DAY {batch.day}</small>
      </div>
      <div className="release-pack-copy">
        <span>RELEASE · DAY {batch.day}</span>
        <h3>{packName}</h3>
        <ul>
          {batch.products.map((product) => (
            <li key={product.optionId}>
              <strong>{productLabel(product)}</strong>
              <span>
                {product.powerAdjustment > 0 ? "+" : ""}
                {product.powerAdjustment}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
