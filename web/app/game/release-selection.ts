import type { ReleaseOption } from "./types";

type DirectReleaseKind = Exclude<ReleaseOption["kind"], "reprint">;

const GENERIC_RELEASE_REQUIRED_KINDS: readonly DirectReleaseKind[] = [
  "new-theme",
  "support",
  "generic",
];

export function getDirectReleaseSelectionCount(
  options: readonly ReleaseOption[],
): number {
  const hasGenericRules = options.some((option) => option.kind === "generic");
  if (!hasGenericRules) return 3;
  return options.some((option) => option.kind === "reprint" && option.locked)
    ? 3
    : 4;
}

function getRequiredReleaseKinds(
  options: readonly ReleaseOption[],
): readonly DirectReleaseKind[] {
  return options.some((option) => option.kind === "generic")
    ? GENERIC_RELEASE_REQUIRED_KINDS
    : ["new-theme"];
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
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
): boolean {
  const selected = getSelectedDirectOptions(options, selectedOptionIds);
  if (selected.length !== getDirectReleaseSelectionCount(options)) return false;
  return getRequiredReleaseKinds(options).every((kind) =>
    selected.some((option) => option.kind === kind),
  );
}

export function canToggleReleaseOption(
  options: readonly ReleaseOption[],
  selectedOptionIds: readonly string[],
  candidateId: string,
): boolean {
  const candidate = options.find((option) => option.id === candidateId);
  if (!candidate || candidate.kind === "reprint") return false;

  const selectedIds = new Set(selectedOptionIds);
  if (selectedIds.has(candidateId)) return true;

  const selected = getSelectedDirectOptions(options, selectedOptionIds);
  const expectedCount = getDirectReleaseSelectionCount(options);
  if (selected.length >= expectedCount) return false;

  const selectedKinds = new Set<DirectReleaseKind>(
    selected.map((option) => option.kind as DirectReleaseKind),
  );
  selectedKinds.add(candidate.kind);
  const remainingSlots = expectedCount - selected.length - 1;
  const missingRequiredKinds = getRequiredReleaseKinds(options).filter(
    (kind) => !selectedKinds.has(kind),
  );
  return missingRequiredKinds.length <= remainingSlots;
}
