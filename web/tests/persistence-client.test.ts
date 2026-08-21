import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game/engine.ts";
import { loadPersistedGameFromStorage } from "../app/game/persistence-client.ts";
import { MAX_SAVE_BYTES } from "../app/game/save-schema.ts";

const CURRENT_KEY = "tcg-regulator-save-v2";
const LEGACY_KEY = "tcg-regulator-save-v1";

class MemoryStorage {
  readonly removed: string[] = [];
  private readonly values: Map<string, string>;

  constructor(values: Map<string, string>) {
    this.values = values;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.removed.push(key);
    this.values.delete(key);
  }
}

test("clears an incompatible current save without falling back to the legacy key", () => {
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify({ schemaVersion: 8 })],
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, [CURRENT_KEY, LEGACY_KEY]);
  assert.equal(
    loaded.warning,
    "호환되지 않는 개발 저장 데이터를 삭제했습니다. 새 임기를 시작해 주세요.",
  );
});

test("an oversized current save is cleared with the same development warning", () => {
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, "x".repeat(MAX_SAVE_BYTES + 1)],
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, [CURRENT_KEY, LEGACY_KEY]);
  assert.equal(
    loaded.warning,
    "호환되지 않는 개발 저장 데이터를 삭제했습니다. 새 임기를 시작해 주세요.",
  );
});

test("a valid current save remains authoritative and discards the legacy key", () => {
  const current = createInitialGame(79);
  const legacy = createInitialGame(80);
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify(current)],
    [LEGACY_KEY, JSON.stringify(legacy)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game?.seed, current.seed);
  assert.deepEqual(storage.removed, [LEGACY_KEY]);
  assert.equal(loaded.warning, undefined);
});

test("a legacy-key save is cleared instead of migrated", () => {
  const storage = new MemoryStorage(new Map([
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, [LEGACY_KEY]);
  assert.equal(
    loaded.warning,
    "호환되지 않는 개발 저장 데이터를 삭제했습니다. 새 임기를 시작해 주세요.",
  );
});
