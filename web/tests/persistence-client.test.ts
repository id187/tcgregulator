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

test("falls back to a preserved legacy save after removing a broken current save", () => {
  const legacy = createInitialGame(77);
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, "{"],
    [LEGACY_KEY, JSON.stringify(legacy)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.equal(loaded.game?.seed, legacy.seed);
  assert.deepEqual(storage.removed, [CURRENT_KEY]);
  assert.match(loaded.warning ?? "", /손상된 새 저장.*보존된 이전 저장/);
});

test("an oversized current save also falls back without deleting legacy data", () => {
  const legacy = createInitialGame(78);
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, "x".repeat(MAX_SAVE_BYTES + 1)],
    [LEGACY_KEY, JSON.stringify(legacy)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game?.seed, legacy.seed);
  assert.deepEqual(storage.removed, [CURRENT_KEY]);
  assert.match(loaded.warning ?? "", /너무 큰 새 저장.*보존된 이전 저장/);
});

test("a valid current save remains authoritative over a legacy save", () => {
  const current = createInitialGame(79);
  const legacy = createInitialGame(80);
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify(current)],
    [LEGACY_KEY, JSON.stringify(legacy)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game?.seed, current.seed);
  assert.deepEqual(storage.removed, []);
  assert.equal(loaded.warning, undefined);
});
