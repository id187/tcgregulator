import type { CSSProperties, ReactNode } from "react";

import {
  getThemeEmblemSpec,
  type CentralGlyphId,
  type CentralPatternId,
  type HandcraftedThemeEmblemSpec,
  type OriginalThemeEmblemDescriptor,
} from "./theme-emblem-spec.ts";

export {
  CENTRAL_GLYPH_IDS,
  CENTRAL_PATTERN_IDS,
  HANDCRAFTED_THEME_IDS,
  ORIGINAL_THEME_EMBLEM_DESCRIPTORS,
  THEME_EMBLEM_DESCRIPTORS,
  getThemeEmblemSpec,
} from "./theme-emblem-spec.ts";
export type {
  CentralGeometry,
  CentralGlyphId,
  CentralGlyphPiece,
  CentralPatternId,
  EmblemColourRole,
  HandcraftedThemeEmblemSpec,
  HandcraftedThemeId,
  OriginalThemeEmblemDescriptor,
  ThemeEmblemSpec,
} from "./theme-emblem-spec.ts";

export type ThemeEmblemProps = {
  themeId: string;
  size?: number | string;
  detail?: "auto" | "compact" | "full";
  className?: string;
  style?: CSSProperties;
  /** Supplying a label makes the emblem an accessible image by default. */
  label?: string;
  /** Force presentation-only or labelled-image semantics. */
  decorative?: boolean;
};

const lineStyle = {
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

type GlyphGeometry = Readonly<{
  fill: string;
  stroke: string;
}>;

/**
 * A shared path grammar, not a theme generator. Theme identity is selected by
 * the explicit 1:1 descriptor table; these primitives only keep the SVG code
 * native, small, and stylistically coherent.
 */
const GLYPH_GEOMETRY: Readonly<Record<CentralGlyphId, GlyphGeometry>> = {
  airship: { fill: "M15 39C21 18 79 18 85 39 79 55 21 55 15 39ZM34 57h32l-7 17H41Z", stroke: "M22 39h56M34 57l-8-9m40 9 8-9M43 62h14" },
  antenna: { fill: "M44 38h12l8 42H36ZM39 22l11-12 11 12-6 8H45Z", stroke: "M50 31v46M29 27c-9 10-9 21 0 31m42-31c9 10 9 21 0 31M18 18C2 35 2 55 18 72m64-54c16 17 16 37 0 54" },
  armor: { fill: "M30 23 43 14h14l13 9 12 18-10 9-5-8v39H33V42l-5 8-10-9Z", stroke: "M43 15v19l7 8 7-8V15M34 57h32M50 43v35" },
  bell: { fill: "M25 68h50l-9-11V39c0-12-7-21-16-21s-16 9-16 21v18ZM43 70h14c0 9-14 9-14 0Z", stroke: "M50 10v8M29 58h42M38 36c3-7 7-10 12-10" },
  blade: { fill: "M51 8 64 25 55 70l-10 9-3-12 5-41ZM38 74l25 8-4 10-25-9Z", stroke: "M51 17 50 67M44 76l16 5" },
  bone: { fill: "M25 22c-9-9-19 5-10 13l7 6 37 37 6 7c9 9 22-4 13-13l-7-6-37-37Zm48 3c8-9-5-22-14-13l-6 7-9 9 13 13 9-9Z", stroke: "M29 35 66 72M49 24l12 12" },
  book: { fill: "M10 22c16-6 30-1 40 9 10-10 24-15 40-9v57c-16-5-29-1-40 9-11-10-24-14-40-9Z", stroke: "M50 31v57M18 35c10-2 19 0 27 6m37-6c-10-2-19 0-27 6M19 50c9-2 18 0 26 5m36-5c-9-2-18 0-26 5" },
  butterfly: { fill: "M48 44C39 17 15 14 14 32c-1 12 12 19 25 21-14 4-23 13-18 24 7 15 23 1 28-17h2c5 18 21 32 28 17 5-11-4-20-18-24 13-2 26-9 25-21-1-18-25-15-34 12Z", stroke: "M50 34v36M42 27c-9 0-15 5-19 13m35-13c9 0 15 5 19 13M44 69l-6 12m18-12 6 12" },
  candle: { fill: "M34 36h32v48H34ZM50 7c13 15 11 27 0 31-11-4-13-16 0-31Z", stroke: "M40 48c6 5 14-5 20 0M43 66h14M50 18v12" },
  candy: { fill: "M34 34h32l13-10 9 13-15 13 15 13-9 13-13-10H34L21 76l-9-13 15-13-15-13 9-13Z", stroke: "M35 35 65 65M65 35 35 65" },
  cargo: { fill: "M18 28h64v54H18Z", stroke: "M18 28 50 50l32-22M50 50v32M27 62h14m18 0h14" },
  clock: { fill: "M50 9a41 41 0 1 0 0 82 41 41 0 1 0 0-82Z", stroke: "M50 18v8m0 48v8M18 50h8m48 0h8M50 29v23l15 10" },
  cloud: { fill: "M23 72c-12 0-17-10-12-20 3-7 10-10 17-8 1-17 14-28 29-24 9 2 15 9 16 19 14-2 24 8 22 20-1 8-8 13-17 13Z", stroke: "M29 72h48M31 53c6-8 15-10 23-6" },
  coffin: { fill: "M37 9h26l15 24-9 58H31l-9-58Z", stroke: "M50 22v53M39 40h22M34 82h32" },
  coin: { fill: "M50 10a40 40 0 1 0 0 80 40 40 0 1 0 0-80Zm0 13a27 27 0 1 1 0 54 27 27 0 0 1 0-54Z", stroke: "M50 30v40M38 39h20c12 0 12 13 0 13H42c-12 0-12 13 0 13h20" },
  coral: { fill: "M42 88V59L25 42l7-8 10 9V18h12v32l14-17 9 7-13 17 17-5 4 11-31 9v16Z", stroke: "M48 82V22M44 49 31 38m25 25 20-7M53 53l17-15" },
  crown: { fill: "M13 29 32 44 43 14l9 30 18-30 3 31 18-16-9 55H20Z", stroke: "M22 61h59M27 75h49" },
  curtain: { fill: "M11 12h78v75L68 72 50 88 32 72 11 87Z", stroke: "M13 15c16 20 20 39 18 57M87 15C71 35 67 54 69 72M50 14v72" },
  "dive-bell": { fill: "M24 76h52l-7-13V41c0-17-8-27-19-27S31 24 31 41v22ZM19 78h62v10H19Z", stroke: "M39 42a11 11 0 1 0 22 0 11 11 0 0 0-22 0ZM50 16v14M33 60h34" },
  drum: { fill: "M21 25h58l-7 56H28Z", stroke: "M24 32h52M28 72h44M29 33l42 38M71 33 29 71M18 14l27 28M82 14 55 42" },
  envelope: { fill: "M9 24h82v56H9Z", stroke: "M10 26 50 58l40-32M10 79l28-29m52 29L62 50" },
  eye: { fill: "M7 50c12-20 27-30 43-30s31 10 43 30C81 70 66 80 50 80S19 70 7 50Zm28 0a15 15 0 1 0 30 0 15 15 0 0 0-30 0Z", stroke: "M50 35v30M35 50h30" },
  falcon: { fill: "M9 37c20-2 31 5 41 18 10-13 21-20 41-18-6 22-19 34-36 28l-5 25-5-25C28 71 15 59 9 37Z", stroke: "M19 43c11 1 19 7 27 17m35-17C70 44 62 50 54 60M46 62h8" },
  feather: { fill: "M76 9C50 12 25 31 18 69c14 8 29 2 40-9C70 48 77 29 76 9Z", stroke: "M23 77 72 17M32 60l24-2M41 47l20-2M48 35l15-1M36 56l-6-14m17 4-5-15m16 5-4-13" },
  flame: { fill: "M51 8c5 18 23 25 19 48-2 15-11 27-22 34-17-7-26-20-23-36 2-12 10-20 20-31-1 13 4 20 10 24 5-13 2-25-4-39Zm0 42c-10 12-10 22-1 27 10-4 13-14 1-27Z", stroke: "M43 78c-9-11-6-23 8-38" },
  flask: { fill: "M37 10h26v10l-7 6v20l25 34c4 6 0 10-7 10H26c-7 0-11-4-7-10l25-34V26l-7-6Zm2 54-9 15h40L60 64Z", stroke: "M39 17h22M43 47h14M36 70c8 4 20-4 29 2" },
  flower: { fill: "M50 40c-18-31-41-8-23 10-18 18 5 41 23 23 18 18 41-5 23-23 18-18-5-41-23-10Z", stroke: "M50 41v40M39 58c7-11 15-11 22 0M50 79l-12 10m12-10 12 10" },
  forge: { fill: "M18 51h64l-12 19H58v18H42V70H30ZM31 18h38l-8 28H39Z", stroke: "M25 55h50M39 25h22M50 20v23" },
  fortress: { fill: "M10 14h18v14h13V14h18v14h13V14h18v47c0 15-13 24-40 34-27-10-40-19-40-34Z", stroke: "M50 31v52M23 49h54M30 70h40" },
  fungus: { fill: "M14 45C17 19 37 10 50 30 63 10 83 19 86 45c-12 7-24 8-36 1-12 7-24 6-36-1ZM39 48h22l8 37H31Z", stroke: "M50 31v50M30 38c8-7 14-7 20 0m20 0c-8-7-14-7-20 0M37 65h26" },
  fuse: { fill: "M23 63a27 27 0 1 0 54 0 27 27 0 1 0-54 0Z", stroke: "M50 35V22c0-12 14-14 20-21M66 10l8 7m-13-2 9 5M38 63h24M50 51v24" },
  gear: { fill: "m50 5 8 12 14-4 3 14 14 3-5 13 11 9-11 9 5 13-14 3-3 14-14-4-8 12-8-12-14 4-3-14-14-3 5-13L5 52l11-9-5-13 14-3 3-14 14 4Zm0 27a18 18 0 1 0 0 36 18 18 0 0 0 0-36Z", stroke: "M50 37v26M37 50h26" },
  halo: { fill: "M50 9a38 16 0 1 0 0 32 38 16 0 1 0 0-32Zm0 9a27 7 0 1 1 0 14 27 7 0 0 1 0-14ZM28 48h44l10 39H18Z", stroke: "M50 43v40M31 61h38" },
  hammer: { fill: "M17 15h51l12 13-12 18H52l32 31-13 13-33-33v17H22V46H10V28Z", stroke: "M19 31h50M45 48 76 80" },
  harpoon: { fill: "M44 8h12v49l15-13 7 8-28 35-28-35 7-8 15 13Z", stroke: "M50 16v64M31 56l19 24 19-24" },
  helmet: { fill: "M16 55c0-28 14-44 34-44s34 16 34 44v22H60L50 90 40 77H16Z", stroke: "M50 14v63M23 51h54M30 62h13m14 0h13" },
  hexagon: { fill: "M50 6 88 28v44L50 94 12 72V28Zm0 16L26 36v28l24 14 24-14V36Z", stroke: "M50 23v55M26 36l48 28M74 36 26 64" },
  honeycomb: { fill: "M25 10 45 21v22L25 54 5 43V21Zm50 0 20 11v22L75 54 55 43V21ZM50 46l20 11v22L50 90 30 79V57Z", stroke: "M25 18v28M75 18v28M50 54v28" },
  hourglass: { fill: "M22 9h56v13L60 49l18 29v13H22V78l18-29-18-27Zm16 13 12 17 12-17Zm12 38L36 78h28Z", stroke: "M25 15h50M25 85h50M50 39v21" },
  "ink-drop": { fill: "M50 7c17 24 28 39 28 55a28 28 0 1 1-56 0c0-16 11-31 28-55Z", stroke: "M37 65c1 9 7 14 16 15M50 22v28" },
  jar: { fill: "M31 12h38l-4 16c13 14 14 39 5 58H30c-9-19-8-44 5-58Z", stroke: "M32 18h36M34 33c10 5 22 5 32 0M31 67c13-5 25-5 38 0" },
  jellyfish: { fill: "M18 49c0-23 14-37 32-37s32 14 32 37H18Z", stroke: "M25 49c0 22 12 24 6 39M41 49c0 16-8 24 2 37M57 49c0 18 9 23-1 39M73 49c0 21-11 24-4 39M26 38c8-8 16-8 24 0 8-8 16-8 24 0" },
  key: { fill: "M17 27a23 23 0 1 0 46 0 23 23 0 0 0-46 0Zm13 0a10 10 0 1 1 20 0 10 10 0 0 1-20 0ZM46 43l36 36-10 10-8-8-7 7-9-9 7-7-19-19Z", stroke: "M40 39 78 77" },
  lance: { fill: "M65 5 83 23 55 54l-8-8ZM39 45l16 16-36 31-11-11ZM47 35l18 18-9 9-18-18Z", stroke: "M76 13 17 82M43 47l14 14" },
  leaf: { fill: "M85 12C49 11 18 29 15 73c19 9 38 3 51-11 13-13 20-31 19-50Z", stroke: "M18 83 79 20M31 66l26-1M43 50l23-1M51 37l18-1M35 63l-3-19m16 8-3-18m15 7-2-15" },
  letter: { fill: "M15 14h70v72H15Zm14 13v46h42V27Z", stroke: "M33 35h34M33 48h25M33 61h30" },
  lighthouse: { fill: "M36 27h28l10 62H26ZM31 14h38l7 13H24Z", stroke: "M50 29v57M33 48h34M30 70h40M14 19 2 11m84 8 12-8M18 31 5 34m77-3 13 3" },
  lightning: { fill: "M55 4 19 54h25l-7 42 44-58H56Z", stroke: "M55 15 30 48h22L44 78" },
  magnet: { fill: "M18 13h22v45c0 15 20 15 20 0V13h22v47c0 45-64 45-64 0Z", stroke: "M18 30h22m20 0h22M29 13v17m42-17v17" },
  magnifier: { fill: "M11 40a29 29 0 1 0 58 0 29 29 0 0 0-58 0Zm13 0a16 16 0 1 1 32 0 16 16 0 0 1-32 0ZM59 58l12-5 24 28-14 14Z", stroke: "M20 40a20 20 0 1 0 40 0 20 20 0 0 0-40 0M61 59l26 28" },
  mask: { fill: "M14 17c23 8 49 8 72 0l-4 38C80 72 68 85 50 92 32 85 20 72 18 55Z", stroke: "M25 39c8-5 15-4 21 3m29-3c-8-5-15-4-21 3M31 61c6 6 13 7 19 1 6 6 13 5 19-1M50 27v35" },
  meteor: { fill: "M55 42a25 25 0 1 0 0 50 25 25 0 0 0 0-50ZM48 8 8 54l35-18ZM72 15 50 40l34-13Z", stroke: "M55 52a15 15 0 1 0 0 30 15 15 0 0 0 0-30M15 48 49 13m8 20 18-14" },
  mirror: { fill: "M50 7c21 0 33 17 33 38 0 18-9 31-22 36v12H39V81C26 76 17 63 17 45 17 24 29 7 50 7Zm0 13c-13 0-20 11-20 25 0 15 7 25 20 25s20-10 20-25c0-14-7-25-20-25Z", stroke: "M42 22c-7 5-10 12-10 22M39 87h22" },
  moon: { fill: "M70 9C43 13 28 34 34 57c6 24 29 36 52 26-11 13-30 20-47 14C14 89 2 61 14 37 25 15 49 4 70 9Z", stroke: "M28 28c-9 13-10 27-3 40M43 18c-6 5-10 11-12 17" },
  mountain: { fill: "M4 84 35 29l12 20L61 9l35 75Z", stroke: "M17 79 35 47l12 19 14-38 22 51M28 64l8-7 8 9m9-17 9-10 9 12" },
  network: { fill: "M50 10a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM20 63a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm60 0a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM50 70a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", stroke: "M45 28 25 63m30-35 20 35M30 70h40M25 74l20 5m30-5-20 5" },
  note: { fill: "M39 13h39v13L52 33v38c0 17-29 19-29 1 0-12 15-19 29-13V25l26-8v43c0 17-28 19-28 1 0-12 14-18 28-13V30L39 42Z", stroke: "M52 28 78 20M52 42l26-8" },
  origami: { fill: "M7 28 45 10l48 13-27 25 17 42-36-23-33 20 10-42Z", stroke: "M8 28 47 67 93 23M24 45l42 3M47 67 45 10" },
  press: { fill: "M18 10h64v14H18Zm8 23h48v35H26ZM15 76h70v14H15Z", stroke: "M50 24v9M34 45h32M34 57h32M28 68l-8 8m52-8 8 8" },
  prism: { fill: "M50 8 91 82H9Zm0 25L30 70h40Z", stroke: "M50 20v61M22 72l55-34M30 82l52-22" },
  puppet: { fill: "M19 10h62v9H19ZM38 28a12 12 0 1 0 24 0 12 12 0 0 0-24 0ZM35 45h30l10 25-12 5-5-14v29H42V61l-5 14-12-5Z", stroke: "M32 18l12 11m24-11L56 29M50 18v9M31 70 19 84m50-14 12 14" },
  pyramid: { fill: "M50 5 94 85H6Zm0 25L25 75h50Z", stroke: "M50 17v63M17 78l65-37M27 84l54-25" },
  radar: { fill: "M14 82h72L72 68H28ZM50 50 23 17c20-13 48-9 64 10Z", stroke: "M50 50v29M50 50 83 26M32 32a25 25 0 0 1 34-5M22 20A41 41 0 0 1 80 14" },
  raven: { fill: "M10 35c19-6 32 1 40 16 7-16 21-26 40-22-7 14-16 24-29 27 8 8 12 19 12 34L50 68 28 90c0-14 4-25 12-33-14-2-24-9-30-22Z", stroke: "M22 38c10 1 17 7 24 17m31-18c-10 2-17 8-23 18M50 53v15" },
  scales: { fill: "M44 12h12v63h22v13H22V75h22ZM15 29h70v9H15Z", stroke: "M27 37 14 67h26Zm46 0L60 67h26M50 17v66" },
  scissors: { fill: "M18 14a18 18 0 1 0 0 36 18 18 0 0 0 0-36Zm0 11a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 33a18 18 0 1 0 0 36 18 18 0 0 0 0-36Zm0 11a7 7 0 1 1 0 14 7 7 0 0 1 0-14ZM31 38l60-28-48 43 48 37-60-25Z", stroke: "M34 50 82 18M34 59l48 25" },
  seal: { fill: "M50 7 64 22l20-2-2 20 14 14-17 11-3 20-20-5-17 10-10-18-20-5 7-19-9-17 19-7 8-18Z", stroke: "M32 31h36v38H32Zm9 9h18v20H41Z" },
  shard: { fill: "M50 4 82 26 69 93 42 72 18 85 27 22Z", stroke: "M50 5 42 72M27 22l42 71M18 85l64-59M31 39h39" },
  shell: { fill: "M50 8c25 0 41 20 41 43 0 26-20 41-44 41-26 0-39-17-38-38 1-19 16-33 34-31 14 2 21 14 17 26-3 10-15 15-24 10-8-5-7-17 1-20", stroke: "M49 11c20 13 27 31 18 52-8 19-27 26-44 18M44 24c10 6 14 15 12 25-2 9-10 14-18 11" },
  shield: { fill: "M50 7 84 20v30c0 22-12 34-34 45-22-11-34-23-34-45V20Z", stroke: "M50 20v61M28 43h44M30 65h40" },
  ship: { fill: "M9 60h82L75 84H25ZM23 49h54L68 61H32ZM47 11h8v40h-8Zm8 5 25 26H55Zm-8 7L21 47h26Z", stroke: "M50 14v44M17 67c11 6 22 6 33 0 11 6 22 6 33 0" },
  skull: { fill: "M23 42c0-21 12-33 27-33s27 12 27 33c0 13-6 20-15 25v20H38V67c-9-5-15-12-15-25Z", stroke: "M34 43a8 8 0 1 0 16 0 8 8 0 0 0-16 0Zm16 0a8 8 0 1 0 16 0 8 8 0 0 0-16 0ZM50 53l-6 10h12ZM42 72v12m8-12v12m8-12v12" },
  snowflake: { fill: "M45 5h10v90H45ZM5 45h90v10H5ZM14 18l7-7 65 71-7 7ZM82 11l7 7-71 71-7-7Z", stroke: "M50 17 39 27m11-10 11 10M50 83 39 73m11 10 11-10M17 50l10-11M17 50l10 11m56-11L73 39m10 11L73 61" },
  snail: { fill: "M11 65c0-22 19-40 42-40 21 0 35 13 35 32 0 18-13 31-32 31H11Zm28-8a14 14 0 1 0 28 0 14 14 0 0 0-28 0Z", stroke: "M13 65h31M27 63c-8-20 1-33 20-35M17 58 9 37m15 18 3-23M56 46a11 11 0 1 1 0 22 11 11 0 0 1 0-22" },
  spice: { fill: "M50 7c8 19 22 27 20 45-2 18-16 31-20 41-4-10-18-23-20-41C28 34 42 26 50 7Z", stroke: "M50 17v65M38 48c8-6 16-6 24 0M35 62c10-6 20-6 30 0" },
  star: { fill: "m50 4 13 28 31 4-23 21 7 31-28-16-28 16 7-31L6 36l31-4Z", stroke: "M50 16v56M18 39l53 34M82 39 29 73" },
  submarine: { fill: "M10 58c0-18 18-31 44-31h9l7-14h12l-2 18c8 4 13 12 13 27 0 17-18 28-42 28S10 75 10 58Z", stroke: "M23 58h60M35 45a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm22 0a9 9 0 1 0 18 0 9 9 0 0 0-18 0ZM64 27v-9h18" },
  sun: { fill: "M50 18a32 32 0 1 0 0 64 32 32 0 1 0 0-64ZM45 1h10v14H45Zm0 84h10v14H45ZM1 45h14v10H1Zm84 0h14v10H85ZM12 19l7-7 10 10-7 7Zm59 59 7-7 10 10-7 7ZM12 81l10-10 7 7-10 10Zm59-59 10-10 7 7-10 10Z", stroke: "M50 29v42M29 50h42" },
  sundial: { fill: "M8 73h84v14H8ZM22 64a29 29 0 0 1 58 0Z", stroke: "M50 14v50L72 54M31 64a19 19 0 0 1 38 0M18 78h64" },
  sword: { fill: "M49 5 62 22 55 70l-5 8-6-8-6-48ZM30 69h40v12H30Zm12 12h16v14H42Z", stroke: "M50 17v56M36 75h28" },
  teapot: { fill: "M20 38h55v41H20Zm11-18h33l7 18H24ZM75 45c25-8 25 29 0 25ZM20 48C2 42 1 65 20 68Z", stroke: "M28 51h40M39 25h17M30 79h35" },
  telescope: { fill: "M15 23 67 8l7 21-52 15ZM37 39l20-6 14 47H51ZM42 78h41v12H35Z", stroke: "M24 28 66 16M48 39l14 43M41 84h39" },
  tent: { fill: "M50 7 96 87H4Zm0 26L26 78h48Z", stroke: "M50 17v67M15 82h70" },
  throne: { fill: "M25 9h50v48h12v32H13V57h12Zm15 16v35h20V25Z", stroke: "M26 50h48M24 68h52M33 89V72m34 17V72" },
  tower: { fill: "M18 11h18v14h10V11h18v14h10V11h18v27L78 49l-7 42H29l-7-42-14-11Z", stroke: "M24 37h52M50 38v50M35 55h30M38 74h24" },
  train: { fill: "M22 11h56v61H22ZM12 51h10v26H12Zm66 0h10v26H78ZM30 72h40l10 15H20Z", stroke: "M30 22h40v21H30Zm0 31h40M34 78a8 8 0 1 0 16 0m0 0a8 8 0 1 0 16 0" },
  volcano: { fill: "M8 87 36 38h28l28 49ZM43 38l7-29 7 29Z", stroke: "M23 82 43 48l7 10 7-10 20 34M50 9l-9-7m9 7 9-7M50 9v-8" },
  wagon: { fill: "M12 25h67v43H12ZM79 37h10v31H79ZM25 67a13 13 0 1 0 26 0 13 13 0 0 0-26 0Zm35 0a13 13 0 1 0 26 0 13 13 0 0 0-26 0Z", stroke: "M17 34h54M47 27v37M18 57h58" },
  wave: { fill: "M5 48c13-20 27-20 40 0 13 20 27 20 40 0v32H5Z", stroke: "M5 42c13-20 27-20 40 0 13 20 27 20 40 0M5 57c13-16 27-16 40 0 13 16 27 16 40 0M10 72h75" },
  whale: { fill: "M8 49c15-25 44-32 67-17 7 5 11 11 12 19l9-15 2 29-25-3 12-8c-9 23-37 33-58 19-9-6-15-14-19-24Z", stroke: "M19 49c15-13 32-16 49-9M29 65c11 7 23 8 35 2M74 31c4-10 2-17-4-23m5 23c10-5 14-12 13-22" },
  wind: { fill: "", stroke: "M9 30h51c18 0 18-22 1-22-9 0-14 5-15 12M9 50h72c18 0 18 24 0 24-9 0-14-5-15-12M9 69h37c17 0 17 21 1 21-8 0-12-4-13-10" },
  wolf: { fill: "M13 14 34 30l16-8 16 8 21-16-7 48c-3 20-15 30-30 35-15-5-27-15-30-35Z", stroke: "M27 42c8-5 14-4 20 3m26-3c-8-5-14-4-20 3M50 51l-7 11 7 8 7-8ZM32 76c12 7 24 7 36 0" },
};

function HandcraftedFrame({ spec, compact }: { spec: HandcraftedThemeEmblemSpec; compact: boolean }) {
  if (compact) {
    return <circle cx="50" cy="50" fill={spec.ink} r="47" stroke={spec.primary} strokeWidth="5" />;
  }
  return (
    <g aria-hidden="true">
      <circle cx="50" cy="50" fill={spec.ink} r="47" stroke={spec.primary} strokeWidth="3" />
      <circle cx="50" cy="50" fill="none" r="42" stroke={spec.secondary} strokeOpacity=".58" strokeWidth="1.8" />
      {Array.from({ length: 12 }, (_, index) => (
        <path key={index} d="M50 5v7" stroke={index % 3 === 0 ? spec.accent : spec.secondary} strokeLinecap="round" strokeWidth={index % 3 === 0 ? 2.5 : 1.4} transform={`rotate(${index * 30} 50 50)`} />
      ))}
    </g>
  );
}

function HandcraftedGlyph({ spec, compact }: { spec: HandcraftedThemeEmblemSpec; compact: boolean }): ReactNode {
  const stroke = compact ? 5 : 3.5;
  switch (spec.motif) {
    case "cycle":
      return <><path {...lineStyle} d="M24 48A27 27 0 0 1 69 28" stroke={spec.secondary} strokeWidth={stroke} /><path d="m64 18 15 5-9 13Z" fill={spec.secondary} /><path {...lineStyle} d="M76 52A27 27 0 0 1 31 72" stroke={spec.accent} strokeWidth={stroke} /><path d="m36 82-15-5 9-13Z" fill={spec.accent} /><circle cx="50" cy="50" r="10" fill={spec.primary} stroke={spec.accent} strokeWidth="3" /></>;
    case "white-night":
      return <><path d="M69 18C45 23 37 44 46 61c7 14 23 18 36 12-10 13-30 18-45 8C18 69 14 44 28 28c10-11 26-15 41-10Z" fill={spec.secondary} stroke={spec.accent} strokeWidth="2.5" /><path d="m67 26 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill={spec.accent} /></>;
    case "machine-revolution":
      return <><path d={GLYPH_GEOMETRY.gear.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.3" /><path d="m56 27-22 29h15l-7 23 24-33H52Z" fill={spec.accent} stroke={spec.ink} strokeWidth="2.2" /></>;
    case "ironblood":
      return <><path d={GLYPH_GEOMETRY.shield.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.5" /><path d={GLYPH_GEOMETRY["ink-drop"].fill} fill={spec.primary} stroke={spec.accent} strokeWidth="2.6" transform="translate(24 22) scale(.52)" /></>;
    case "abyss":
      return <><path d={GLYPH_GEOMETRY.eye.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.5" /><path {...lineStyle} d="M28 66c-9 10-6 18 2 21m14-17c-6 9 0 16 7 17m7-17c7 8 3 15-3 18m17-22c10 9 8 18 1 22" stroke={spec.secondary} strokeWidth={stroke} /></>;
    case "nebula":
      return <><path {...lineStyle} d="M19 56c7-28 39-40 60-19 15 15 1 37-21 35-18-2-26-20-14-31 10-9 27 1 21 12-3 6-11 6-15 2" stroke={spec.secondary} strokeWidth={stroke} /><path d="m76 19 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill={spec.accent} /></>;
    case "plague-garden":
      return <><path d={GLYPH_GEOMETRY.flower.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.2" /><path d={GLYPH_GEOMETRY.skull.fill} fill={spec.primary} stroke={spec.accent} strokeWidth="2.5" transform="translate(25 24) scale(.5)" /></>;
    case "flame-arena":
      return <><path d={GLYPH_GEOMETRY.flame.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.5" /><path {...lineStyle} d="M27 75C13 65 10 48 16 34m57 41c14-10 17-27 11-41" stroke={spec.accent} strokeWidth={stroke - 1} /></>;
    case "phantasm-troupe":
      return <><path d={GLYPH_GEOMETRY.mask.fill} fill={spec.secondary} stroke={spec.accent} strokeWidth="2.3" transform="translate(-8 3) scale(.72)" /><path d={GLYPH_GEOMETRY.mask.fill} fill={spec.accent} stroke={spec.secondary} strokeWidth="2.3" transform="translate(39 10) scale(.65)" /></>;
    case "colossus":
      return <><path d="m50 11 30 18 7 44-19 17H32L13 73l7-44Z" fill={spec.secondary} stroke={spec.accent} strokeWidth="2.5" /><path d="m35 45 12 5-11 7Zm30 0-12 5 11 7Z" fill={spec.accent} /><path {...lineStyle} d="m41 72 9-8 9 8" stroke={spec.ink} strokeWidth={stroke} /></>;
  }
}

function CentralPattern({ spec, compact }: { spec: OriginalThemeEmblemDescriptor; compact: boolean }) {
  const { geometry } = spec;
  const count = compact ? Math.min(geometry.patternDensity, 6) : geometry.patternDensity;
  const opacity = compact ? 0.26 : 0.38;
  const transform = `translate(50 50) rotate(${geometry.patternRotate}) scale(${geometry.patternScale}) translate(-50 -50)`;
  const strokeWidth = compact ? 2.6 : 1.8;
  const marks = Array.from({ length: count }, (_, index) => index);
  const rotation = (index: number) => geometry.patternPhase * 11 + index * (360 / count);

  const radial = (length = 19) => (
    <g opacity={opacity} transform={transform}>
      {marks.map((index) => <path key={index} d={`M50 15v${length}`} stroke={index % 2 ? spec.primary : spec.accent} strokeLinecap="round" strokeWidth={strokeWidth} transform={`rotate(${rotation(index)} 50 50)`} />)}
    </g>
  );

  switch (spec.pattern as CentralPatternId) {
    case "rays":
    case "beam":
    case "sparks":
      return radial(spec.pattern === "beam" ? 28 : spec.pattern === "sparks" ? 12 : 20);
    case "slashes":
    case "rain":
    case "stitches":
      return <g opacity={opacity} stroke={spec.primary} strokeLinecap="round" strokeWidth={strokeWidth} transform={transform}>{marks.map((index) => <path key={index} d={`M${23 + (index * 9) % 50} ${20 + (index % 3) * 8}l${spec.pattern === "rain" ? -8 : 13} ${spec.pattern === "stitches" ? 7 : 25}`} strokeDasharray={spec.pattern === "stitches" ? "3 5" : undefined} />)}</g>;
    case "constellation":
      return <g opacity={opacity} transform={transform}><path {...lineStyle} d="M18 62 33 29l20 18 15-27 15 44-28 17Z" stroke={spec.primary} strokeWidth={strokeWidth} />{[[18,62],[33,29],[53,47],[68,20],[83,64],[55,81]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} fill={index % 2 ? spec.accent : spec.secondary} r={compact ? 2.8 : 2.1} />)}</g>;
    case "orbit":
    case "echo":
    case "ripple":
    case "tide":
      return <g fill="none" opacity={opacity} strokeWidth={strokeWidth} transform={transform}>{marks.slice(0, Math.min(count, 5)).map((index) => spec.pattern === "tide" ? <path key={index} d={`M15 ${34 + index * 9}c12-9 24-9 36 0s24 9 36 0`} stroke={index % 2 ? spec.accent : spec.primary} /> : <ellipse key={index} cx="50" cy="50" rx={17 + index * 5} ry={spec.pattern === "echo" ? 9 + index * 3 : 13 + index * 4} stroke={index % 2 ? spec.accent : spec.primary} transform={spec.pattern === "orbit" ? `rotate(${index * 31} 50 50)` : undefined} />)}</g>;
    case "bubbles":
    case "spores":
    case "ash":
    case "sand":
    case "frost":
    case "static":
      return <g opacity={opacity} transform={transform}>{marks.map((index) => { const angle = rotation(index) * Math.PI / 180; const radius = 23 + ((index * 7 + geometry.patternPhase * 3) % 16); return <circle key={index} cx={50 + Math.cos(angle) * radius} cy={50 + Math.sin(angle) * radius} fill={index % 2 ? spec.accent : spec.primary} r={spec.pattern === "static" ? 1.7 : 2 + (index % 3) * 0.6} />; })}</g>;
    case "cracks":
    case "roots":
      return <g opacity={opacity} stroke={spec.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} transform={transform}>{marks.map((index) => <path key={index} d={spec.pattern === "roots" ? "M50 48c-2 13-8 20-18 32m18-27c8 8 13 17 14 29" : "M50 50 34 31l-8-14m24 33 18-20 7-13"} transform={`rotate(${rotation(index)} 50 50)`} />)}</g>;
    case "circuit":
    case "lattice":
    case "weave":
    case "folds":
      return <g opacity={opacity} stroke={spec.primary} strokeLinecap="round" strokeWidth={strokeWidth} transform={transform}>{marks.map((index) => <path key={index} d={spec.pattern === "circuit" ? `M${20 + index * 7} 21v18l12 12v28` : spec.pattern === "folds" ? `M20 ${22 + index * 7} 50 ${35 + index * 4} 80 ${22 + index * 7}` : `M${18 + index * 9} 18l${36 + (index % 2) * 8} 64`} strokeDasharray={spec.pattern === "weave" ? "5 3" : undefined} />)}</g>;
    case "drips":
      return <g opacity={opacity} stroke={spec.primary} strokeLinecap="round" strokeWidth={strokeWidth} transform={transform}>{marks.map((index) => <path key={index} d={`M${22 + index * 9} 24v${18 + (index % 4) * 7}`} />)}</g>;
    case "gust":
    case "mist":
    case "swirl":
      return <g opacity={opacity} transform={transform}><path {...lineStyle} d={spec.pattern === "swirl" ? "M18 56c5-30 45-43 63-18 13 19-8 39-27 28-12-7-5-23 8-20" : "M13 36c14-10 31-10 51 0 17 9 28 5 31-7M7 57c18-8 36-7 54 2 13 6 25 4 33-4M17 76c15-6 29-5 42 2"} stroke={spec.primary} strokeWidth={strokeWidth} /></g>;
  }
}

function CentralGlyph({ spec, piece, compact }: { spec: OriginalThemeEmblemDescriptor; piece: OriginalThemeEmblemDescriptor["pieces"][number]; compact: boolean }) {
  const geometry = GLYPH_GEOMETRY[piece.glyph];
  const fill = piece.role === "primary" ? spec.primary : piece.role === "secondary" ? spec.secondary : spec.accent;
  const scaleX = piece.scale * (piece.mirror ? -1 : 1);
  const strokeWidth = compact ? 4.2 : 2.7;
  return (
    <g transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate}) scale(${scaleX} ${piece.scale}) translate(-50 -50)`}>
      {geometry.fill ? <path d={geometry.fill} fill={fill} fillRule="evenodd" stroke={spec.ink} strokeLinejoin="round" strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" /> : null}
      <path {...lineStyle} d={geometry.stroke} stroke={piece.role === "accent" ? spec.ink : spec.accent} strokeWidth={compact ? 3.4 : 2.15} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

function OriginalCentralMark({ spec, compact }: { spec: OriginalThemeEmblemDescriptor; compact: boolean }) {
  const { geometry } = spec;
  return (
    <g aria-hidden="true" transform={`translate(${50 + geometry.x} ${50 + geometry.y}) rotate(${geometry.rotate}) scale(${geometry.scaleX} ${geometry.scaleY}) translate(-50 -50)`}>
      <CentralPattern compact={compact} spec={spec} />
      {spec.pieces.map((piece, index) => <CentralGlyph key={`${piece.glyph}-${index}`} compact={compact} piece={piece} spec={spec} />)}
    </g>
  );
}

export function ThemeEmblem({
  themeId,
  size = 40,
  detail = "auto",
  className,
  style,
  label,
  decorative,
}: ThemeEmblemProps) {
  const spec = getThemeEmblemSpec(themeId);
  const compact = detail === "compact" || (detail === "auto" && typeof size === "number" && size <= 32);
  const hasLabel = label !== undefined && label.trim().length > 0;
  const isDecorative = decorative ?? !hasLabel;
  const accessibleLabel = hasLabel ? label : `${spec.name} 테마 상징`;
  const original = spec.family === "future" ? spec : null;
  const handcrafted = spec.family === "handcrafted" ? spec : null;

  return (
    <svg
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : accessibleLabel}
      className={className}
      data-emblem-family={spec.family}
      data-emblem-glyphs={original?.pieces.map((piece) => piece.glyph).join("+")}
      data-emblem-motif={spec.motif}
      data-emblem-pattern={original?.pattern}
      data-emblem-signature={spec.signature}
      data-emblem-silhouette={original?.silhouette}
      data-emblem-visual-signature={spec.visualSignature}
      focusable="false"
      height={size}
      preserveAspectRatio="xMidYMid meet"
      role={isDecorative ? undefined : "img"}
      style={style}
      viewBox="0 0 100 100"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {original ? (
        <OriginalCentralMark compact={compact} spec={original} />
      ) : (
        <>
          <HandcraftedFrame compact={compact} spec={handcrafted!} />
          <g transform={compact ? "translate(8 8) scale(.84)" : "translate(13 13) scale(.74)"}>
            <HandcraftedGlyph compact={compact} spec={handcrafted!} />
          </g>
        </>
      )}
    </svg>
  );
}
