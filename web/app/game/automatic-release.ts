import type {
  GameState,
  ReleaseOption,
  ReleaseSelection,
} from "./types.ts";
import { REPRINT_PACK_PRODUCT_COUNT } from "./campaign.ts";
import { getReleaseSlateKind } from "./release-kind.ts";

function compareReleasePriority(left: ReleaseOption, right: ReleaseOption): number {
  const requestedDifference = Number(right.requested) - Number(left.requested);
  return (
    requestedDifference ||
    right.expectedPower - left.expectedPower ||
    left.id.localeCompare(right.id)
  );
}

function ranked(
  options: readonly ReleaseOption[],
  kind: ReleaseOption["kind"],
): ReleaseOption[] {
  return options
    .filter((option) => option.kind === kind)
    .sort(compareReleasePriority);
}

function toSelections(options: readonly ReleaseOption[]): ReleaseSelection[] {
  return options.map((option) => ({
    optionId: option.id,
    powerAdjustment: 0,
  }));
}

/**
 * Builds a deterministic, zero-adjustment release that satisfies the reducer's
 * current core mix rules.
 */
export function getAutomaticReleaseSelections(
  state: Pick<GameState, "phase" | "releaseSlate">,
): ReleaseSelection[] {
  const slate = state.releaseSlate;
  if (state.phase !== "release-edit" || !slate) return [];

  if (getReleaseSlateKind(slate) === "reprint") {
    return toSelections(
      ranked(slate.options, "reprint").slice(0, REPRINT_PACK_PRODUCT_COUNT),
    );
  }

  const newThemes = ranked(slate.options, "new-theme");
  const supports = ranked(slate.options, "support");
  const generics = ranked(slate.options, "generic");
  const selectedNewTheme = newThemes[0];
  const selectedSupport = supports[0];
  const selectedGeneric = generics[0];
  if (!selectedNewTheme || !selectedSupport || !selectedGeneric) return [];
  const extra = [
    ...newThemes.slice(1),
    ...supports.slice(1),
    ...generics.slice(1),
  ]
    .sort(compareReleasePriority)[0];
  if (!extra) return [];
  return toSelections([
    selectedNewTheme,
    selectedSupport,
    selectedGeneric,
    extra,
  ]);
}
