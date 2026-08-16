import type { ReactNode } from "react";

export type MetricGlyphProps = {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
};

type GlyphFrameProps = MetricGlyphProps & {
  children: ReactNode;
};

function GlyphFrame({
  size = 18,
  className,
  "aria-hidden": ariaHidden = true,
  children,
}: GlyphFrameProps) {
  return (
    <svg
      aria-hidden={ariaHidden}
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function CalendarIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </GlyphFrame>
  );
}

export function RevenueIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="m7.5 9 1.6 6 2.9-5 2.9 5 1.6-6M7 12h10" />
    </GlyphFrame>
  );
}

export function ReleaseIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="m4 7.5 8-4.5 8 4.5v9L12 21l-8-4.5z" />
      <path d="m4.5 7.5 7.5 4.4 7.5-4.4M12 12v9" />
    </GlyphFrame>
  );
}

export function GavelIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="m13 6 4-4 5 5-4 4zM3 16l4-4 5 5-4 4zM14.5 9.5l-5 5M3 22h12" />
    </GlyphFrame>
  );
}

export function UsersIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </GlyphFrame>
  );
}

export function TrendIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="m3 17 6-6 4 4 8-9M15 6h6v6" />
    </GlyphFrame>
  );
}

export function MessageIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8M8 13h5" />
    </GlyphFrame>
  );
}

export function ChevronIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="m9 6 6 6-6 6" />
    </GlyphFrame>
  );
}

export function ClockIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </GlyphFrame>
  );
}

export function ResetIcon(props: MetricGlyphProps) {
  return (
    <GlyphFrame {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </GlyphFrame>
  );
}
