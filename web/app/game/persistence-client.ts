import { MAX_SAVE_BYTES, parseGameState } from "./save-schema.ts";
import type { GameState } from "./types";

const STORAGE_KEY = "tcg-regulator-save-v1";

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

  let saved: string | null;
  try {
    saved = storage.getItem(STORAGE_KEY);
  } catch {
    return unavailable(
      "저장된 게임에 접근할 수 없습니다. 브라우저의 저장소 권한을 확인해 주세요.",
    );
  }

  if (!saved) return { backend: { kind: "local" }, game: null };

  if (byteLength(saved) > MAX_SAVE_BYTES) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      return unavailable(
        "저장 데이터가 너무 크고 손상된 항목을 정리할 수 없습니다.",
      );
    }
    return {
      backend: { kind: "local" },
      game: null,
      warning: "기존 저장 데이터가 너무 커서 초기화했습니다.",
    };
  }

  try {
    return {
      backend: { kind: "local" },
      game: parseGameState(JSON.parse(saved) as unknown),
    };
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      return unavailable(
        "손상된 저장 데이터를 읽거나 정리할 수 없습니다. 저장소 권한을 확인해 주세요.",
      );
    }
    return {
      backend: { kind: "local" },
      game: null,
      warning: "손상된 저장 데이터를 제거하고 새 임기를 준비했습니다.",
    };
  }
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
