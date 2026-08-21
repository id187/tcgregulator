import type {
  ReleaseBatch,
  ReleaseSlate,
  ReleasedProduct,
} from "./types.ts";

export type ReleaseKind = "regular" | "reprint";

export function getReleaseSlateKind(
  slate: Pick<ReleaseSlate, "releaseKind"> | null,
): ReleaseKind {
  if (!slate) {
    throw new Error("A release slate is required to read its release kind.");
  }
  return slate.releaseKind;
}

export function getReleaseBatchKind(
  batch: {
    releaseKind: ReleaseBatch["releaseKind"];
    products: readonly ReleasedProduct[];
  },
): ReleaseKind {
  if (batch.releaseKind === "baseline") {
    throw new Error("The DAY 0 baseline is not a published release pack.");
  }
  return batch.releaseKind;
}
