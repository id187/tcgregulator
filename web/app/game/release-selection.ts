import type { ReleaseOption, ReleaseSlate } from "./types";
import { REPRINT_PACK_PRODUCT_COUNT } from "./campaign.ts";

type DirectReleaseKind = Exclude<ReleaseOption["kind"], "reprint">;

const GENERIC_RELEASE_REQUIRED_KINDS: readonly DirectReleaseKind[] = [
  "new-theme",
  "support",
  "generic",
];

export function getDirectReleaseSelectionCount(
  releaseKind: ReleaseSlate["releaseKind"],
): number {
  if (releaseKind === "reprint") {
    return REPRINT_PACK_PRODUCT_COUNT;
  }
  return 4;
}

function getRequiredReleaseKinds(): readonly DirectReleaseKind[] {
  return GENERIC_RELEASE_REQUIRED_KINDS;
}

function getSelectedDirectOptions(
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
): ReleaseOption[] {
  const selectedIds = new Set(selectedOptionIds);
  return options.filter(
    (option) => option.kind !== "reprint" && selectedIds.has(option.id),
  );
}

export function isCompleteReleaseSelection(
  releaseKind: ReleaseSlate["releaseKind"],
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
): boolean {
  if (releaseKind === "reprint") {
    const selectedIds = new Set(selectedOptionIds);
    return (
      selectedIds.size === REPRINT_PACK_PRODUCT_COUNT &&
      options.filter(
        (option) => option.kind === "reprint" && selectedIds.has(option.id),
      ).length === REPRINT_PACK_PRODUCT_COUNT
    );
  }
  const selected = getSelectedDirectOptions(options, selectedOptionIds);
  if (selected.length !== getDirectReleaseSelectionCount(releaseKind)) return false;
  return getRequiredReleaseKinds().every((kind) =>
    selected.some((option) => option.kind === kind),
  );
}

export function canToggleReleaseOption(
  releaseKind: ReleaseSlate["releaseKind"],
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
  candidateId: string,
): boolean {
  const candidate = options.find((option) => option.id === candidateId);
  if (!candidate) return false;

  if (releaseKind === "reprint") {
    if (candidate.kind !== "reprint") return false;
    const selectedIds = new Set(selectedOptionIds);
    return (
      selectedIds.has(candidateId) ||
      selectedIds.size < REPRINT_PACK_PRODUCT_COUNT
    );
  }
  if (candidate.kind === "reprint") return false;

  const selectedIds = new Set(selectedOptionIds);
  if (selectedIds.has(candidateId)) return true;

  const selected = getSelectedDirectOptions(options, selectedOptionIds);
  const expectedCount = getDirectReleaseSelectionCount(releaseKind);
  if (selected.length >= expectedCount) return false;

  const selectedKinds = new Set<DirectReleaseKind>(
    selected.map((option) => option.kind as DirectReleaseKind),
  );
  selectedKinds.add(candidate.kind);
  const remainingSlots = expectedCount - selected.length - 1;
  const missingRequiredKinds = getRequiredReleaseKinds().filter(
    (kind) => !selectedKinds.has(kind),
  );
  return missingRequiredKinds.length <= remainingSlots;
}
