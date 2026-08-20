import assert from "node:assert/strict";
import test from "node:test";

import { getBusinessEventChoice } from "../app/game/business-events.ts";
import { createInitialGame, reduceGame } from "../app/game/engine.ts";
import {
  CURRENT_FUTURE_PART_ID_MAP,
  CURRENT_FUTURE_THEME_ID_MAP,
} from "../app/game/future-theme-id-migration.ts";
import { loadPersistedGameFromStorage } from "../app/game/persistence-client.ts";
import { MAX_SAVE_BYTES } from "../app/game/save-schema.ts";
import type { GameState } from "../app/game/types.ts";

function getPlannedReleaseSelections(state: GameState) {
  const options = state.releaseSlate?.options;
  assert.ok(options, "release-edit must expose a release slate");
  const selected = [
    ...options.filter((option) => option.kind === "new-theme").slice(0, 2),
    ...options.filter((option) => option.kind === "support").slice(0, 1),
    ...options.filter((option) => option.kind === "generic").slice(0, 1),
  ];
  assert.equal(selected.length, 4);
  return selected.map((option) => ({
    optionId: option.id,
    powerAdjustment: 0 as const,
  }));
}

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

function asLegacyFutureIdentifiers(value: unknown): unknown {
  if (typeof value === "string") {
    return (
      CURRENT_FUTURE_THEME_ID_MAP[value] ??
      CURRENT_FUTURE_PART_ID_MAP[value] ??
      value
    );
  }
  if (Array.isArray(value)) return value.map(asLegacyFutureIdentifiers);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      CURRENT_FUTURE_THEME_ID_MAP[key] ??
        CURRENT_FUTURE_PART_ID_MAP[key] ??
        key,
      asLegacyFutureIdentifiers(item),
    ]),
  );
}

function reachFutureThemeState(seed: number): GameState {
  let state = createInitialGame(seed);
  while (state.day < 61) {
    if (state.operations.pendingEvent) {
      const pending = state.operations.pendingEvent;
      const choice =
        getBusinessEventChoice(pending.type, "a").cost <=
        getBusinessEventChoice(pending.type, "b").cost
          ? "a"
          : "b";
      state = reduceGame(state, {
        type: "CHOOSE_BUSINESS_EVENT",
        eventId: pending.id,
        choice,
      });
    } else if (state.phase === "release-edit") {
      state = reduceGame(state, {
        type: "SUBMIT_RELEASE",
        selections: getPlannedReleaseSelections(state),
      });
    } else if (state.phase === "ban-edit") {
      state = reduceGame(state, { type: "SUBMIT_BAN", changes: {} });
    } else {
      state = reduceGame(state, {
        type: "ADVANCE_DAYS",
        days: 61 - state.day,
      });
    }
  }
  assert.ok(state.activeThemeIds.some((id) => id.startsWith("future-")));
  return state;
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

test("loads a v0.1.5 current-key save through the future-ID migration", () => {
  const current = reachFutureThemeState(81);
  const legacyIdentifiers = asLegacyFutureIdentifiers(current);
  const storage = new MemoryStorage(new Map([
    [CURRENT_KEY, JSON.stringify(legacyIdentifiers)],
  ]));

  const loaded = loadPersistedGameFromStorage(storage);

  assert.equal(loaded.backend.kind, "local");
  assert.deepEqual(loaded.game, current);
  assert.deepEqual(storage.removed, []);
  assert.equal(loaded.warning, undefined);
});
