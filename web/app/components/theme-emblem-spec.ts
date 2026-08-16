export const HANDCRAFTED_THEME_IDS = [
  "cycle",
  "white-night",
  "machine-revolution",
  "ironblood",
  "abyss",
  "nebula",
  "plague-garden",
  "flame-arena",
  "phantasm-troupe",
  "colossus",
] as const;

export const FUTURE_THEME_ROOT_IDS = [
  "moonshade",
  "thunderbloom",
  "azure-scale",
  "ink-spirit",
  "crimson-lotus",
  "wind-fang",
  "snowblossom",
  "golden-crow",
  "meteor",
  "mirror-realm",
  "clockwork-spring",
  "abyssal-lantern",
  "dream-butterfly",
  "stone-grove",
] as const;

export const FUTURE_THEME_ORDER_IDS = [
  "blade-order",
  "constellation",
  "strange-tales",
  "workshop",
  "apostles",
  "ensemble",
  "dynasty",
  "academy",
  "fleet",
  "guard",
] as const;

export type HandcraftedThemeId = (typeof HANDCRAFTED_THEME_IDS)[number];
export type FutureThemeRootId = (typeof FUTURE_THEME_ROOT_IDS)[number];
export type FutureThemeOrderId = (typeof FUTURE_THEME_ORDER_IDS)[number];
export type ThemeEmblemMotif = HandcraftedThemeId | FutureThemeRootId;

export type ThemeEmblemSpec = Readonly<{
  themeId: string;
  family: "handcrafted" | "future";
  motif: ThemeEmblemMotif;
  order: FutureThemeOrderId | "legacy";
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  motifIndex: number;
  orderIndex: number;
  catalogNumber: number;
  signature: string;
}>;

type Palette = Readonly<{
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
}>;

const PALETTES: Readonly<Record<ThemeEmblemMotif, Palette>> = {
  cycle: { primary: "#173C39", secondary: "#55D6B7", accent: "#F1D37A", ink: "#071A1A" },
  "white-night": { primary: "#26375E", secondary: "#C6E3FF", accent: "#FFF4C2", ink: "#0C1430" },
  "machine-revolution": { primary: "#3C414A", secondary: "#B9C7C9", accent: "#F2A83B", ink: "#161A20" },
  ironblood: { primary: "#4B171D", secondary: "#CA3D45", accent: "#E9C28F", ink: "#1D080B" },
  abyss: { primary: "#092D3C", secondary: "#28A6AF", accent: "#B6F5E7", ink: "#03141D" },
  nebula: { primary: "#28225E", secondary: "#8B6DDE", accent: "#F3A7DD", ink: "#100D2B" },
  "plague-garden": { primary: "#29401D", secondary: "#849C36", accent: "#E0C968", ink: "#101A0B" },
  "flame-arena": { primary: "#652119", secondary: "#E8642D", accent: "#FFD272", ink: "#270B08" },
  "phantasm-troupe": { primary: "#40244F", secondary: "#B56EC5", accent: "#F5C7E2", ink: "#190C21" },
  colossus: { primary: "#393A31", secondary: "#92916D", accent: "#D9C995", ink: "#171813" },
  moonshade: { primary: "#202A52", secondary: "#6D7BC1", accent: "#DDE4FF", ink: "#0B102A" },
  thunderbloom: { primary: "#4C3B12", secondary: "#E8B832", accent: "#FFF095", ink: "#211805" },
  "azure-scale": { primary: "#123F59", secondary: "#30A8C2", accent: "#BFEAF1", ink: "#061B29" },
  "ink-spirit": { primary: "#292735", secondary: "#77708F", accent: "#E4D8ED", ink: "#0F0E15" },
  "crimson-lotus": { primary: "#581B32", secondary: "#D74667", accent: "#FFB6A3", ink: "#220811" },
  "wind-fang": { primary: "#163F3C", secondary: "#46B49A", accent: "#C8F0D7", ink: "#071B19" },
  snowblossom: { primary: "#29475D", secondary: "#8CCFE5", accent: "#F2FCFF", ink: "#0B1D29" },
  "golden-crow": { primary: "#4C3411", secondary: "#D99925", accent: "#FFE39A", ink: "#211304" },
  meteor: { primary: "#43254F", secondary: "#DB6849", accent: "#FFD48C", ink: "#1B0C22" },
  "mirror-realm": { primary: "#1F3C4C", secondary: "#61B8C8", accent: "#D7F6F2", ink: "#091922" },
  "clockwork-spring": { primary: "#49371F", secondary: "#B98A45", accent: "#DDF0C2", ink: "#1D1509" },
  "abyssal-lantern": { primary: "#0E3D41", secondary: "#34BCA7", accent: "#D5F978", ink: "#04191B" },
  "dream-butterfly": { primary: "#3F2455", secondary: "#B978D4", accent: "#F3CFF5", ink: "#180B21" },
  "stone-grove": { primary: "#34412D", secondary: "#748B59", accent: "#D4C493", ink: "#131A10" },
};

function includesLiteral<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

function unsupported(themeId: string): never {
  throw new RangeError(`Unsupported theme emblem ID: ${themeId}`);
}

/**
 * Parses the catalog identity itself: no hashing, counters, or random visual
 * choices. A future theme is the illustration for its root plus the crest for
 * its order, so its emblem remains meaningful as the catalog grows.
 */
export function getThemeEmblemSpec(themeId: string): ThemeEmblemSpec {
  if (themeId.trim().length === 0) {
    throw new TypeError("Theme emblems require a non-empty theme ID.");
  }

  if (includesLiteral(HANDCRAFTED_THEME_IDS, themeId)) {
    const motifIndex = HANDCRAFTED_THEME_IDS.indexOf(themeId);
    const palette = PALETTES[themeId];
    return Object.freeze({
      themeId,
      family: "handcrafted",
      motif: themeId,
      order: "legacy",
      ...palette,
      motifIndex,
      orderIndex: -1,
      catalogNumber: motifIndex + 1,
      signature: `handcrafted:${themeId}`,
    });
  }

  const match = /^future-(\d{3})-(.+)$/.exec(themeId);
  if (!match) {
    return unsupported(themeId);
  }

  const catalogNumber = Number(match[1]);
  const semanticId = match[2];
  for (const root of FUTURE_THEME_ROOT_IDS) {
    const rootPrefix = `${root}-`;
    if (!semanticId.startsWith(rootPrefix)) continue;

    const order = semanticId.slice(rootPrefix.length);
    if (!includesLiteral(FUTURE_THEME_ORDER_IDS, order)) {
      return unsupported(themeId);
    }

    const motifIndex = FUTURE_THEME_ROOT_IDS.indexOf(root);
    const orderIndex = FUTURE_THEME_ORDER_IDS.indexOf(order);
    const expectedCatalogNumber = motifIndex * FUTURE_THEME_ORDER_IDS.length + orderIndex + 1;
    if (catalogNumber !== expectedCatalogNumber) {
      return unsupported(themeId);
    }

    return Object.freeze({
      themeId,
      family: "future",
      motif: root,
      order,
      ...PALETTES[root],
      motifIndex,
      orderIndex,
      catalogNumber,
      signature: `future:${root}:${order}:${String(catalogNumber).padStart(3, "0")}`,
    });
  }

  return unsupported(themeId);
}
