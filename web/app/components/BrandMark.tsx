export type BrandMarkProps = {
  className?: string;
};

/**
 * A trading card divided by a single regulatory cut.
 * Kept as two flat colors so the silhouette remains clear at favicon scale.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      shapeRendering="geometricPrecision"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#17345c" height="48" width="48" />
      <path
        d="M15 8h18a3 3 0 0 1 3 3v8L12 26V11a3 3 0 0 1 3-3Z"
        fill="#fff"
      />
      <path
        d="m12 29 24-7v15a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3v-8Z"
        fill="#fff"
      />
    </svg>
  );
}
