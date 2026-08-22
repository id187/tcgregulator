import { MAX_SAVE_BYTES, parseGameState } from "./save-schema.ts";
import { parseSaveTransfer } from "./save-transfer.ts";
import type { GameState } from "./types";

const STORAGE_KEY = "tcg-regulator-save-v2";
const LEGACY_STORAGE_KEY = "tcg-regulator-save-v1";
const INCOMPATIBLE_SAVE_WARNING =
  "현재 버전에서 이어갈 수 없는 저장을 삭제하지 않고 보존했습니다. 새 게임을 확정하면 기존 저장이 교체됩니다.";

export type PersistenceBackend =
  | { kind: "local" }
  | { kind: "unavailable"; message: string };

export type PersistenceLoadResult = {
  backend: PersistenceBackend;
  game: GameState | null;
  warning?: string;
  /** Raw incompatible data retained so it is not silently overwritten. */
  recoverySave?: string;
};

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function unavailable(message: string): PersistenceLoadResult {
  return {
    backend: { kind: "unavailable", message },
    game: null,
  };
}

function getLocalStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("localStorage requires a browser window");
  }
  return window.localStorage;
}

type PersistenceReader = Pick<Storage, "getItem">;

function withWarning(
  game: GameState | null,
  warning?: string,
  recoverySave?: string,
): PersistenceLoadResult {
  return {
    backend: { kind: "local" },
    game,
    ...(warning ? { warning } : {}),
    ...(recoverySave ? { recoverySave } : {}),
  };
}

/** Exposed for deterministic storage loading tests. */
export function loadPersistedGameFromStorage(
  storage: PersistenceReader,
): PersistenceLoadResult {
  let current: string | null;
  let legacy: string | null;
  try {
    current = storage.getItem(STORAGE_KEY);
    legacy = storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return unavailable(
      "저장된 게임에 접근할 수 없습니다. 브라우저의 저장소 권한을 확인해 주세요.",
    );
  }

  if (current !== null) {
    if (byteLength(current) <= MAX_SAVE_BYTES) {
      try {
        const { game, migratedFrom } = parseSaveTransfer(current);
        return withWarning(
          game,
          migratedFrom === null
            ? undefined
            : `스키마 ${migratedFrom} 저장을 현재 형식으로 안전하게 변환했습니다.`,
        );
      } catch {
        return withWarning(null, INCOMPATIBLE_SAVE_WARNING, current);
      }
    }
    return withWarning(null, INCOMPATIBLE_SAVE_WARNING, current);
  }

  if (legacy === null) return withWarning(null);

  if (byteLength(legacy) <= MAX_SAVE_BYTES) {
    try {
      const { game, migratedFrom } = parseSaveTransfer(legacy);
      return withWarning(
        game,
        migratedFrom === null
          ? "이전 저장 위치의 임기를 불러왔습니다. 다음 자동 저장부터 현재 위치를 사용합니다."
          : `이전 저장 위치의 스키마 ${migratedFrom} 임기를 현재 형식으로 변환했습니다.`,
      );
    } catch {
      // The original string remains untouched and is offered for export.
    }
  }
  return withWarning(null, INCOMPATIBLE_SAVE_WARNING, legacy);
}

/** Loads the campaign from the fixed-origin WebView/browser localStorage. */
export async function loadPersistedGame(): Promise<PersistenceLoadResult> {
  let storage: Storage;
  try {
    storage = getLocalStorage();
  } catch {
    return unavailable(
      "이 환경에서는 로컬 저장소를 사용할 수 없습니다. 이번 실행의 진행은 저장되지 않습니다.",
    );
  }

  return loadPersistedGameFromStorage(storage);
}

export async function savePersistedGame(
  backend: PersistenceBackend,
  game: GameState,
) {
  if (backend.kind === "unavailable") return;

  const validated = parseGameState(game);
  const serialized = JSON.stringify(validated);
  if (byteLength(serialized) > MAX_SAVE_BYTES) {
    throw new Error("save exceeds the maximum size");
  }

  getLocalStorage().setItem(STORAGE_KEY, serialized);
}
