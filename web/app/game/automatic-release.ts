import type {
  GameState,
  ReleaseOption,
  ReleaseSelection,
} from "./types.ts";

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
 * current core mix rules. A locked reprint is appended by the reducer and is
 * deliberately absent from the returned direct selections.
 */
export function getAutomaticReleaseSelections(
  state: Pick<GameState, "phase" | "releaseSlate">,
): ReleaseSelection[] {
  const slate = state.releaseSlate;
  if (state.phase !== "release-edit" || !slate) return [];

  const newThemes = ranked(slate.options, "new-theme");
  const supports = ranked(slate.options, "support");
  const generics = ranked(slate.options, "generic");
  const selectedNewTheme = newThemes[0];
  if (!selectedNewTheme) return [];

  // A generic option marks the current four-product release rules, matching
  // the reducer's own compatibility boundary for migrated legacy reviews.
  if (generics.length > 0) {
    const selectedSupport = supports[0];
    const selectedGeneric = generics[0];
    if (!selectedSupport || !selectedGeneric) return [];
    const hasLockedReprint = slate.options.some(
      (option) => option.kind === "reprint" && option.locked,
    );
    if (hasLockedReprint) {
      return toSelections([
        selectedNewTheme,
        selectedSupport,
        selectedGeneric,
      ]);
    }
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

  const selected: ReleaseOption[] = [
    selectedNewTheme,
    ...supports.slice(0, 2),
  ];
  if (selected.length < 3) {
    const selectedIds = new Set(selected.map((option) => option.id));
    const fallback = slate.options
      .filter(
        (option) =>
          option.kind !== "new-theme" && !selectedIds.has(option.id),
      )
      .sort(compareReleasePriority);
    selected.push(...fallback.slice(0, 3 - selected.length));
  }
  return selected.length === 3 ? toSelections(selected) : [];
}
