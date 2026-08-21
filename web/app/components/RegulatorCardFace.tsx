import { ThemeEmblem } from "./ThemeEmblem.tsx";

export function RegulatorCardFace({
  accent = "#4f7da8",
  effect,
  footer,
  overline,
  themeId,
  title,
}: {
  accent?: string;
  effect: string;
  footer?: string;
  overline: string;
  themeId?: string;
  title: string;
}) {
  return (
    <span
      className="regulator-card-face"
      style={{ "--card-accent": accent } as React.CSSProperties}
    >
      <span className="regulator-card-frame" aria-hidden="true">
        <span className="regulator-card-rarity">R</span>
        <span className="regulator-card-art">
          {themeId ? (
            <ThemeEmblem
              decorative
              detail="full"
              size="100%"
              themeId={themeId}
            />
          ) : (
            <span className="regulator-card-generic-mark">◆</span>
          )}
        </span>
      </span>
      <span className="regulator-card-copy">
        <span className="regulator-card-overline">{overline}</span>
        <strong>{title}</strong>
        <span className="regulator-card-effect">{effect}</span>
        {footer ? <small>{footer}</small> : null}
      </span>
    </span>
  );
}
