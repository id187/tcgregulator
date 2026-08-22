export type GameSoundKind =
  | "click"
  | "release"
  | "restriction"
  | "event"
  | "message"
  | "swoosh"
  | "impact";

export function emitGameSound(kind: GameSoundKind): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GameSoundKind>("tcg-regulator-sound", {
    detail: kind,
  }));
}
