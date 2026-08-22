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

test("preserves an incompatible current save without falling back to the legacy key", () => {
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify({ schemaVersion: 8 })],
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, []);
  assert.equal(loaded.recoverySave, JSON.stringify({ schemaVersion: 8 }));
  assert.equal(
    loaded.warning,
    "현재 버전에서 이어갈 수 없는 저장을 삭제하지 않고 보존했습니다. 새 게임을 확정하면 기존 저장이 교체됩니다.",
  );
});

test("an oversized current save is retained for explicit recovery", () => {
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, "x".repeat(MAX_SAVE_BYTES + 1)],
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, []);
  assert.equal(loaded.recoverySave?.length, MAX_SAVE_BYTES + 1);
  assert.equal(
    loaded.warning,
    "현재 버전에서 이어갈 수 없는 저장을 삭제하지 않고 보존했습니다. 새 게임을 확정하면 기존 저장이 교체됩니다.",
  );
});

test("a valid current save remains authoritative without destructively clearing backups", () => {
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

test("an incompatible legacy-key save is retained for explicit recovery", () => {
  const storage = new MemoryStorage(new Map([
    [LEGACY_KEY, JSON.stringify({ schemaVersion: 1 })],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.equal(loaded.game, null);
  assert.deepEqual(storage.removed, []);
  assert.equal(loaded.recoverySave, JSON.stringify({ schemaVersion: 1 }));
  assert.equal(
    loaded.warning,
    "현재 버전에서 이어갈 수 없는 저장을 삭제하지 않고 보존했습니다. 새 게임을 확정하면 기존 저장이 교체됩니다.",
  );
});

test("a schema 8 save migrates through the compatibility chain", () => {
  const current = createInitialGame(81);
  const legacy = structuredClone(current) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 8;
  delete legacy.shareholder;
  const operations = legacy.operations as Record<string, unknown>;
  delete operations.season;
  const history = legacy.history as Array<Record<string, unknown>>;
  for (const entry of history) delete entry.environmentHealthModel;
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify(legacy)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.game?.schemaVersion, 10);
  assert.equal(loaded.game?.seed, 81);
  assert.equal(loaded.game?.operations.season.currentSeasonNumber, 1);
  assert.equal(loaded.game?.shareholder.releasePlanningUnlocked, true);
  assert.equal(
    loaded.warning,
    "스키마 8 저장을 현재 형식으로 안전하게 변환했습니다.",
  );
});
