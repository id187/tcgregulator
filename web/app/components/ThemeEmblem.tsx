import type { CSSProperties, ReactNode } from "react";

import {
  getThemeEmblemSpec,
  type FutureThemeOrderId,
  type ThemeEmblemSpec,
} from "./theme-emblem-spec.ts";

export {
  FUTURE_THEME_ORDER_IDS,
  FUTURE_THEME_ROOT_IDS,
  HANDCRAFTED_THEME_IDS,
  getThemeEmblemSpec,
} from "./theme-emblem-spec.ts";
export type {
  FutureThemeOrderId,
  FutureThemeRootId,
  HandcraftedThemeId,
  ThemeEmblemMotif,
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

type GlyphProps = {
  spec: ThemeEmblemSpec;
  compact: boolean;
};

const lineStyle = {
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function MotifGlyph({ spec, compact }: GlyphProps): ReactNode {
  const stroke = compact ? 5.2 : 3.8;
  const fine = compact ? 0 : 2.1;
  const ink = spec.ink;
  const light = spec.accent;
  const mid = spec.secondary;

  switch (spec.motif) {
    case "cycle":
      return (
        <>
          <path {...lineStyle} d="M25 49A26 26 0 0 1 67 27" stroke={mid} strokeWidth={stroke} />
          <path d="m63 19 15 4-8 13Z" fill={mid} />
          <path {...lineStyle} d="M75 51A26 26 0 0 1 33 73" stroke={light} strokeWidth={stroke} />
          <path d="m37 81-15-4 8-13Z" fill={light} />
          <circle cx="50" cy="50" fill={ink} r="11" stroke={light} strokeWidth="3" />
          <path {...lineStyle} d="M44 43h12l-8 7 8 7H44l8-7Z" stroke={mid} strokeWidth="2.8" />
        </>
      );
    case "white-night":
      return (
        <>
          <path d="M68 22c-18 3-27 16-23 31 4 14 17 23 32 19-7 9-18 14-30 12-20-3-33-22-29-41 5-20 27-31 50-21Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.4} />
          <circle cx="68" cy="39" fill={light} r="8" />
          <path {...lineStyle} d="m68 26 2 8 8 2-8 3-2 8-3-8-8-3 8-2Z" stroke={ink} strokeWidth={fine || 2.7} />
          {compact ? null : <path {...lineStyle} d="M26 66c14-8 30-8 47 0M32 73c12-5 25-5 37 0" stroke={light} strokeWidth={fine} />}
        </>
      );
    case "machine-revolution":
      return (
        <>
          <path d="m50 15 7 10 12-2 2 12 11 5-5 11 5 11-11 5-2 12-12-2-7 10-7-10-12 2-2-12-11-5 5-11-5-11 11-5 2-12 12 2Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <circle cx="50" cy="51" fill={ink} r="19" stroke={light} strokeWidth="3" />
          <path d="m56 28-21 27h14l-6 21 22-30H52Z" fill={light} stroke={ink} strokeLinejoin="round" strokeWidth="2.3" />
          {compact ? null : <circle cx="50" cy="51" fill="none" r="26" stroke={ink} strokeDasharray="3 5" strokeWidth={fine} />}
        </>
      );
    case "ironblood":
      return (
        <>
          <path d="M50 14 78 25v24c0 18-11 29-28 38-17-9-28-20-28-38V25Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3.2 : 2.5} />
          <path d="M50 29c9 13 14 21 14 29a14 14 0 0 1-28 0c0-8 5-16 14-29Z" fill={spec.primary} stroke={ink} strokeWidth="2.4" />
          <path {...lineStyle} d="M50 32v39M43 39h14M42 71h16" stroke={light} strokeWidth={stroke - 1} />
          {compact ? null : <path {...lineStyle} d="m29 34 8 4m34-4-8 4" stroke={ink} strokeWidth={fine} />}
        </>
      );
    case "abyss":
      return (
        <>
          <path d="M18 47c12-17 23-24 32-24s20 7 32 24C70 64 59 71 50 71S30 64 18 47Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3.4 : 2.4} />
          <ellipse cx="50" cy="47" fill={ink} rx="13" ry="18" />
          <circle cx="55" cy="41" fill={light} r="4" />
          <path {...lineStyle} d="M31 64c-8 8-5 16 1 19m11-13c-5 8 0 14 6 15m8-15c6 7 3 13-2 17m14-23c9 8 7 16 1 20" stroke={mid} strokeWidth={stroke} />
        </>
      );
    case "nebula":
      return (
        <>
          <path {...lineStyle} d="M20 55c7-25 36-37 56-20 16 14 4 36-16 38-17 2-29-14-20-27 8-11 26-6 24 6-1 7-10 9-14 4" stroke={mid} strokeWidth={stroke} />
          <path {...lineStyle} d="M23 32c18 13 39 20 58 19M35 78c9-24 25-42 45-53" stroke={light} strokeWidth={fine || 2.6} />
          <circle cx="25" cy="31" fill={light} r="4" />
          <path d="m75 23 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={light} />
        </>
      );
    case "plague-garden":
      return (
        <>
          {[0, 72, 144, 216, 288].map((rotation) => (
            <ellipse key={rotation} cx="50" cy="30" fill={mid} rx="11" ry="19" stroke={light} strokeWidth={compact ? 2 : 1.8} transform={`rotate(${rotation} 50 50)`} />
          ))}
          <path d="M35 47c0-13 30-13 30 0v15c0 8-6 14-15 14S35 70 35 62Z" fill={ink} stroke={light} strokeWidth="2.5" />
          <circle cx="44" cy="57" fill={light} r="4" />
          <circle cx="56" cy="57" fill={light} r="4" />
          <path {...lineStyle} d="m46 69 4-5 4 5M39 79v8m22-8v8" stroke={mid} strokeWidth={stroke - 1} />
        </>
      );
    case "flame-arena":
      return (
        <>
          <path d="M50 14c4 15 18 20 18 37 0 12-8 23-18 28-13-5-22-15-22-29 0-12 7-20 17-29-1 10 3 15 8 18 4-9 2-16-3-25Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M51 43c7 8 10 14 8 21-2 7-8 11-13 8-7-4-7-13 5-29Z" fill={light} />
          <path {...lineStyle} d="M27 74c-9-9-12-20-11-31m12 38c-9-4-15-10-19-17m64 10c9-9 12-20 11-31M72 81c9-4 15-10 19-17" stroke={light} strokeWidth={fine || 2.6} />
        </>
      );
    case "phantasm-troupe":
      return (
        <>
          <path d="M16 24c8 3 15 3 23 0l6 18c3 11-4 24-15 29-11-5-18-18-15-29Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M55 25c9 3 18 3 28 0l3 19c2 14-8 27-20 31-11-7-16-17-13-29Z" fill={light} stroke={mid} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path {...lineStyle} d="m23 43 6 3 6-4m-10 17c5 3 9 3 13-1m24-14 5-3 6 3m-12 16c5-4 11-4 16 0" stroke={ink} strokeWidth={fine || 2.6} />
          {compact ? null : <path {...lineStyle} d="M15 18c18-8 52-8 71 0M20 18 13 81m65-63 10 63" stroke={light} strokeWidth={fine} />}
        </>
      );
    case "colossus":
      return (
        <>
          <path d="m50 14 28 17 6 40-18 16H34L16 71l6-40Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.4} />
          <path d="m50 24 17 14-5 34H38l-5-34Z" fill={ink} stroke={light} strokeLinejoin="round" strokeWidth="2.4" />
          <path d="m35 47 11 4-10 6Zm30 0-11 4 10 6Z" fill={light} />
          <path {...lineStyle} d="m43 69 7-6 7 6M26 32l8 10m40-10-8 10" stroke={mid} strokeWidth={stroke - 1} />
        </>
      );
    case "moonshade":
      return (
        <>
          <path d="M67 18c-15 3-25 17-21 32 4 14 17 22 31 18-7 10-20 16-32 12-19-5-29-25-21-43 7-16 25-25 43-19Z" fill={mid} stroke={light} strokeWidth={compact ? 3 : 2.2} />
          <path d="m45 42 13-9 10 9-3 34H39l-3-26Z" fill={ink} stroke={light} strokeLinejoin="round" strokeWidth="2.5" />
          <path d="M49 53h7v23h-7Z" fill={mid} />
          {compact ? null : <path {...lineStyle} d="m27 34-8-5m53-2 7-6M26 64l-9 4" stroke={light} strokeWidth={fine} />}
        </>
      );
    case "thunderbloom":
      return (
        <>
          <path d="M50 63C28 65 18 54 17 37c13 1 25 5 33 17 8-12 20-16 33-17-1 17-11 28-33 26Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M50 61C35 53 34 38 50 20c16 18 15 33 0 41Z" fill={spec.primary} stroke={light} strokeWidth="2.3" />
          <path d="m55 19-17 31h12l-6 29 19-36H51Z" fill={light} stroke={ink} strokeLinejoin="round" strokeWidth="2" />
        </>
      );
    case "azure-scale":
      return (
        <>
          <path d="M50 18c17 0 31 13 31 30-12-8-23-7-31 4-8-11-19-12-31-4 0-17 14-30 31-30Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M50 45c14 0 25 11 25 25-10-6-18-5-25 5-7-10-15-11-25-5 0-14 11-25 25-25Z" fill={spec.primary} stroke={light} strokeLinejoin="round" strokeWidth="2.4" />
          <path {...lineStyle} d="M20 79c10-8 20-8 30 0 10-8 20-8 30 0" stroke={light} strokeWidth={stroke - 1} />
          {compact ? null : <path {...lineStyle} d="M29 43c6-4 12-4 18 0m6 0c6-4 12-4 18 0" stroke={ink} strokeWidth={fine} />}
        </>
      );
    case "ink-spirit":
      return (
        <>
          <path d="M24 69c7-5 8-14 6-24-3-17 11-29 25-24 13 4 19 18 13 30-4 8-3 15 7 22-12 8-21 4-25-4-5 9-15 12-26 0Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M38 48c8-8 16-8 24 0-4 15-20 15-24 0Z" fill={ink} />
          <circle cx="45" cy="48" fill={light} r="3" />
          <circle cx="57" cy="48" fill={light} r="3" />
          <path {...lineStyle} d="M18 80c21-7 42-7 64 0M20 84c16-2 31-2 46 0" stroke={light} strokeWidth={fine || 2.4} />
        </>
      );
    case "crimson-lotus":
      return (
        <>
          <path d="M50 72C35 57 34 38 50 18c16 20 15 39 0 54Z" fill={mid} stroke={light} strokeWidth={compact ? 3 : 2.2} />
          <path d="M48 73C28 71 17 59 18 40c17 2 29 12 32 30m2 3c20-2 31-14 30-33-17 2-29 12-32 30" fill={spec.primary} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path {...lineStyle} d="M24 78c16 8 36 8 52 0M50 25v38" stroke={light} strokeWidth={fine || 2.5} />
        </>
      );
    case "wind-fang":
      return (
        <>
          <path d="M69 18c-2 24-11 47-29 66 2-16-6-24-16-31 20 0 33-11 45-35Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3.2 : 2.4} />
          <path {...lineStyle} d="M16 30h28c8 0 8-11 1-13M11 42h38M13 55h22c9 0 10 11 2 15" stroke={light} strokeWidth={stroke - 1} />
          {compact ? null : <path {...lineStyle} d="m55 40 9-8m-14 19 9-6" stroke={ink} strokeWidth={fine} />}
        </>
      );
    case "snowblossom":
      return (
        <>
          {[0, 60, 120].map((rotation) => (
            <path key={rotation} {...lineStyle} d="M50 15v70M40 24l10 10 10-10M40 76l10-10 10 10" stroke={light} strokeWidth={stroke - 1} transform={`rotate(${rotation} 50 50)`} />
          ))}
          {[0, 72, 144, 216, 288].map((rotation) => (
            <ellipse key={rotation} cx="50" cy="34" fill={mid} fillOpacity=".72" rx="8" ry="14" stroke={light} strokeWidth={compact ? 1.8 : 1.4} transform={`rotate(${rotation} 50 50)`} />
          ))}
          <circle cx="50" cy="50" fill={spec.primary} r="8" stroke={light} strokeWidth="2" />
        </>
      );
    case "golden-crow":
      return (
        <>
          <circle cx="50" cy="49" fill={mid} r="30" stroke={light} strokeWidth={compact ? 3 : 2.2} />
          <path d="M50 43C37 28 22 30 15 36c12 5 18 14 23 27l12-9 12 9c5-13 11-22 23-27-7-6-22-8-35 7Z" fill={ink} stroke={light} strokeLinejoin="round" strokeWidth="2.5" />
          <path d="m50 43 9 8-9 13-9-13Z" fill={light} />
          <path {...lineStyle} d="M50 23v11M30 27l7 10m33-10-7 10" stroke={light} strokeWidth={fine || 2.3} />
        </>
      );
    case "meteor":
      return (
        <>
          <path {...lineStyle} d="M17 72 57 32M17 58l33-27M29 81l35-35" stroke={mid} strokeWidth={stroke} />
          <path d="m68 21 6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2Z" fill={light} stroke={ink} strokeLinejoin="round" strokeWidth="2.4" />
          <circle cx="67" cy="40" fill={mid} r="8" />
          {compact ? null : <path {...lineStyle} d="M13 79h26M12 66h18" stroke={light} strokeWidth={fine} />}
        </>
      );
    case "mirror-realm":
      return (
        <>
          <path d="m50 14 27 24-7 40-20 9-20-9-7-40Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="m50 19 18 22-18 37-18-37Z" fill={ink} stroke={light} strokeLinejoin="round" strokeWidth="2.4" />
          <path d="m50 19 18 22-18 7Z" fill={light} opacity=".85" />
          <path {...lineStyle} d="M50 19v59M31 65h38" stroke={light} strokeWidth={fine || 2.2} />
        </>
      );
    case "clockwork-spring":
      return (
        <>
          <path d="m50 16 7 9 12-2 2 12 11 5-5 10 5 10-11 5-2 12-12-2-7 9-7-9-12 2-2-12-11-5 5-10-5-10 11-5 2-12 12 2Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.1} />
          <circle cx="50" cy="50" fill={ink} r="20" stroke={light} strokeWidth="2.6" />
          <path {...lineStyle} d="M50 35v16l12 8M39 61c3 9 19 9 22 0M42 68c2 7 14 7 16 0" stroke={light} strokeWidth={stroke - 1} />
        </>
      );
    case "abyssal-lantern":
      return (
        <>
          <path {...lineStyle} d="M36 24c6-10 22-10 28 0M50 15v11" stroke={light} strokeWidth={stroke - 1} />
          <path d="M33 30h34l7 32-13 15H39L26 62Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.3} />
          <path d="M41 42c6-9 12-9 18 0l7 19-16 9-16-9Z" fill={light} stroke={ink} strokeLinejoin="round" strokeWidth="2.3" />
          <circle cx="50" cy="54" fill={ink} r="6" />
          <path {...lineStyle} d="M39 77c-5 6-3 10 1 12m10-12c-4 6 0 10 4 11m7-11c5 5 4 9 0 12" stroke={mid} strokeWidth={fine || 2.4} />
        </>
      );
    case "dream-butterfly":
      return (
        <>
          <path d="M47 42C36 23 17 21 14 36c-3 12 7 22 22 24-12 4-16 14-10 22 8 8 20-2 23-19Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path d="M53 42c11-19 30-21 33-6 3 12-7 22-22 24 12 4 16 14 10 22-8 8-20-2-23-19Z" fill={spec.primary} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path {...lineStyle} d="M50 35v38m0-33-8-11m8 11 8-11" stroke={light} strokeWidth={stroke - 1} />
          {compact ? null : <><circle cx="29" cy="40" fill={light} r="3" /><circle cx="70" cy="40" fill={light} r="3" /><path {...lineStyle} d="M37 67c5-7 7-16 7-25m19 25c-5-7-7-16-7-25" stroke={light} strokeWidth={fine} /></>}
        </>
      );
    case "stone-grove":
      return (
        <>
          <path d="m50 15 18 20-5 46H37l-5-46Z" fill={mid} stroke={light} strokeLinejoin="round" strokeWidth={compact ? 3 : 2.2} />
          <path {...lineStyle} d="M50 28v47M50 43 38 35m12 21 15-11M50 63 38 55" stroke={ink} strokeWidth={stroke - 1} />
          <path {...lineStyle} d="M18 78c10-5 20-5 29 0m6 0c9-5 19-5 29 0" stroke={light} strokeWidth={stroke - 1} />
          {compact ? null : <><path d="M18 45 28 30l7 15-4 29H22Z" fill={spec.primary} stroke={light} strokeWidth="2" /><path d="m65 45 8-17 10 17-4 29H69Z" fill={spec.primary} stroke={light} strokeWidth="2" /></>}
        </>
      );
  }
}

function OrderMark({
  order,
  spec,
  compact,
}: {
  order: FutureThemeOrderId;
  spec: ThemeEmblemSpec;
  compact: boolean;
}) {
  const strokeWidth = compact ? 5 : 3.8;
  const common = {
    ...lineStyle,
    stroke: spec.accent,
    strokeWidth,
  };

  switch (order) {
    case "blade-order":
      return <path {...common} d="m73 84 12-17 4 4-17 12m7-4 7 7" />;
    case "constellation":
      return <><path {...common} d="m70 80 8-10 10 9" /><circle cx="70" cy="80" fill={spec.accent} r="3" /><circle cx="78" cy="70" fill={spec.accent} r="3" /><circle cx="88" cy="79" fill={spec.accent} r="3" /></>;
    case "strange-tales":
      return <><path {...common} d="M68 71c7-3 11-1 13 3 2-4 6-6 13-3v14c-6-2-10 0-13 4-3-4-7-6-13-4Z" /><circle cx="81" cy="79" fill={spec.accent} r="2.5" /></>;
    case "workshop":
      return <path {...common} d="m70 72 6-5 6 6-4 4 10 10-5 5-10-11-4 4" />;
    case "apostles":
      return <><ellipse {...common} cx="81" cy="70" rx="9" ry="4" /><path {...common} d="M72 87c2-10 16-10 18 0M81 75v8" /></>;
    case "ensemble":
      return <><path {...common} d="M78 68v16c0 6-9 7-9 1 0-4 5-6 9-4m0-8 11-3v12c0 6-9 7-9 1 0-4 5-6 9-4" /></>;
    case "dynasty":
      return <path {...common} d="m69 73 6 6 6-11 6 11 7-6-3 14H72Z" />;
    case "academy":
      return <path {...common} d="M67 72c6-3 11-1 14 3 3-4 8-6 14-3v15c-6-2-11 0-14 4-3-4-8-6-14-4Zm14 3v16" />;
    case "fleet":
      return <><path {...common} d="M81 67v18m0-16 10 10H81m0-7-9 9h9M70 87c7 4 15 4 22 0" /></>;
    case "guard":
      return <path {...common} d="m81 67 11 4v9c0 7-5 10-11 14-6-4-11-7-11-14v-9Z" />;
  }
}

function FrameDetail({ spec }: { spec: ThemeEmblemSpec }) {
  const tickCount = 12;
  return (
    <g aria-hidden="true">
      <circle cx="50" cy="50" fill={spec.ink} r="47" stroke={spec.primary} strokeWidth="3" />
      <circle cx="50" cy="50" fill="none" r="42.5" stroke={spec.secondary} strokeOpacity=".68" strokeWidth="1.8" />
      {Array.from({ length: tickCount }, (_, index) => (
        <path key={index} d="M50 5v7" stroke={index % 3 === 0 ? spec.accent : spec.secondary} strokeLinecap="round" strokeWidth={index % 3 === 0 ? 2.5 : 1.4} transform={`rotate(${index * (360 / tickCount)} 50 50)`} />
      ))}
      <path d="M16 50c0-18 15-34 34-34s34 16 34 34" fill="none" stroke={spec.accent} strokeDasharray="1 5" strokeLinecap="round" strokeOpacity=".55" strokeWidth="2" />
      <path d="M22 73c8 10 18 15 28 15s20-5 28-15" fill="none" stroke={spec.secondary} strokeOpacity=".45" strokeWidth="2" />
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
  const accessibleLabel = hasLabel ? label : `${themeId} 테마 상징`;
  const motifScale = compact ? 0.74 : 0.68;
  const motifOffset = 50 * (1 - motifScale);

  return (
    <svg
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : accessibleLabel}
      className={className}
      data-emblem-family={spec.family}
      data-emblem-motif={spec.motif}
      data-emblem-order={spec.order}
      data-emblem-signature={spec.signature}
      focusable="false"
      height={size}
      preserveAspectRatio="xMidYMid meet"
      role={isDecorative ? undefined : "img"}
      style={style}
      viewBox="0 0 100 100"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {compact ? (
        <circle cx="50" cy="50" fill={spec.ink} r="48" stroke={spec.primary} strokeWidth="4" />
      ) : (
        <FrameDetail spec={spec} />
      )}
      <g transform={`matrix(${motifScale} 0 0 ${motifScale} ${motifOffset} ${motifOffset - (spec.family === "future" ? 5 : 0)})`}>
        <MotifGlyph compact={compact} spec={spec} />
      </g>
      {spec.family === "future" ? (
        <g aria-hidden="true">
          <circle cx="81" cy="80" fill={spec.primary} r={compact ? 17 : 15} stroke={spec.ink} strokeWidth="4" />
          <circle cx="81" cy="80" fill="none" r={compact ? 14 : 12} stroke={spec.secondary} strokeWidth="2" />
          <OrderMark compact={compact} order={spec.order as FutureThemeOrderId} spec={spec} />
        </g>
      ) : null}
      {compact ? null : (
        <g aria-hidden="true">
          <path d="M34 91h32" stroke={spec.ink} strokeLinecap="round" strokeWidth="7" />
          <path d="M36 91h28" stroke={spec.accent} strokeLinecap="round" strokeWidth="2" />
          <circle cx="50" cy="91" fill={spec.secondary} r="2.8" />
        </g>
      )}
    </svg>
  );
}
