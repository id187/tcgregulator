import { MAX_SAVE_BYTES, parseGameState } from "./save-schema.ts";
import type { GameState } from "./types";

const STORAGE_KEY = "tcg-regulator-save-v2";
const LEGACY_STORAGE_KEY = "tcg-regulator-save-v1";

export type PersistenceBackend =
  | { kind: "local" }
  | { kind: "unavailable"; message: string };

export type PersistenceLoadResult = {
  backend: PersistenceBackend;
  game: GameState | null;
  warning?: string;
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

type PersistenceReader = Pick<Storage, "getItem" | "removeItem">;

function withWarning(
  game: GameState | null,
  warning?: string,
): PersistenceLoadResult {
  return {
    backend: { kind: "local" },
    game,
    ...(warning ? { warning } : {}),
  };
}

/** Exposed for deterministic storage fallback tests. */
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

  let currentWarning: string | undefined;
  if (current) {
    if (byteLength(current) <= MAX_SAVE_BYTES) {
      try {
        return withWarning(parseGameState(JSON.parse(current) as unknown));
      } catch {
        currentWarning = "손상된 새 저장 데이터를 제거했습니다.";
      }
    } else {
      currentWarning = "너무 큰 새 저장 데이터를 제거했습니다.";
    }

    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      return unavailable(
        "손상된 저장 데이터를 읽거나 정리할 수 없습니다. 저장소 권한을 확인해 주세요.",
      );
    }
  }

  if (!legacy) return withWarning(null, currentWarning);
  if (byteLength(legacy) > MAX_SAVE_BYTES) {
    return withWarning(
      null,
      [
        currentWarning,
        "이전 1000일 임기 저장은 보존했습니다. 새 500일 임기를 시작해주세요.",
      ].filter(Boolean).join(" "),
    );
  }

  try {
    const game = parseGameState(JSON.parse(legacy) as unknown);
    return withWarning(
      game,
      currentWarning
        ? `${currentWarning} 보존된 이전 저장을 새 500일 임기 일정으로 불러왔습니다.`
        : "기존 저장을 새 500일 임기 일정으로 이어갑니다.",
    );
  } catch {
    return withWarning(
      null,
      [
        currentWarning,
        "이전 1000일 임기 저장은 보존했습니다. 일정 개편에 맞춰 새 임기를 시작해주세요.",
      ].filter(Boolean).join(" "),
    );
  }
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
