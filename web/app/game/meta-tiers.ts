/** Numerical floor for an active theme's adoption sample, not a tier cutoff. */
export const META_ADOPTION_SHARE_FLOOR = 0.001;

export type MetaTier =
  | "Tier 0"
  | "Tier 1"
  | "Tier 2"
  | "Tier 3"
  | "Tier Out";

export function isNamedMetaTier(tier: MetaTier): boolean {
  return tier === "Tier 0" || tier === "Tier 1" || tier === "Tier 2";
}
