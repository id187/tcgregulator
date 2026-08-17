import assert from "node:assert/strict";
import test from "node:test";

import { THEMES } from "../app/game/content.ts";
import {
  CURRENT_FUTURE_PART_ID_MAP,
  CURRENT_FUTURE_THEME_ID_MAP,
  FUTURE_THEME_ID_MIGRATIONS,
  getStableThemeRandomIdentifier,
  LEGACY_FUTURE_PART_ID_MAP,
  LEGACY_FUTURE_THEME_ID_MAP,
} from "../app/game/future-theme-id-migration.ts";

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
}

test("the 140 post-launch themes use stable authored identity IDs", () => {
  const originalThemes = THEMES.slice(10);

  assert.equal(THEMES.length, 150);
  assert.equal(originalThemes.length, 140);

  originalThemes.forEach((theme, index) => {
    const catalogNumber = String(index + 1).padStart(3, "0");
    assert.match(theme.id, new RegExp(`^future-${catalogNumber}-`));
    assert.equal(theme.id, FUTURE_THEME_ID_MIGRATIONS[index].id);
    assert.equal(theme.name, FUTURE_THEME_ID_MIGRATIONS[index].name);
    assert.notEqual(theme.id, FUTURE_THEME_ID_MIGRATIONS[index].legacyId);
    assert.equal(theme.parts.length, 14);
    assert.deepEqual(
      new Set(theme.parts.slice(0, 5).map((part) => part.role)),
      new Set(["starter1", "starter2", "bridge", "finisher", "recursion"]),
    );
  });

  assert.equal(uniqueCount(originalThemes.map((theme) => theme.name)), 140);
  assert.equal(uniqueCount(originalThemes.map((theme) => theme.shortName)), 140);
  assert.equal(uniqueCount(originalThemes.map((theme) => theme.playstyle)), 140);
  assert.equal(uniqueCount(originalThemes.map((theme) => theme.aesthetic)), 140);
  assert.equal(
    uniqueCount(
      originalThemes.map((theme) =>
        [
          theme.basePower,
          theme.baseUnpleasantness,
          theme.appeal,
          theme.difficulty,
          theme.optimizationDays,
          theme.counterClarity,
        ].join(":"),
      ),
    ),
    140,
  );
});

test("the retired matrix IDs have a complete collision-free migration table", () => {
  assert.equal(FUTURE_THEME_ID_MIGRATIONS.length, 140);
  assert.equal(Object.keys(LEGACY_FUTURE_THEME_ID_MAP).length, 140);
  assert.equal(Object.keys(LEGACY_FUTURE_PART_ID_MAP).length, 1_960);
  assert.equal(
    uniqueCount(FUTURE_THEME_ID_MIGRATIONS.map(({ id }) => id)),
    140,
  );
  assert.equal(
    uniqueCount(FUTURE_THEME_ID_MIGRATIONS.map(({ legacyId }) => legacyId)),
    140,
  );

  for (const theme of THEMES.slice(10)) {
    assert.equal(LEGACY_FUTURE_THEME_ID_MAP[theme.id], undefined);
    assert.ok(theme.parts.every((part) => part.id.startsWith(`${theme.id}-`)));
  }
  assert.equal(
    uniqueCount(THEMES.flatMap((theme) => theme.parts.map((part) => part.id))),
    2_100,
  );
});

test("authored IDs preserve every v0.1.5 seeded-random identifier", () => {
  assert.equal(Object.keys(CURRENT_FUTURE_THEME_ID_MAP).length, 140);
  assert.equal(Object.keys(CURRENT_FUTURE_PART_ID_MAP).length, 1_960);

  for (const { id, legacyId } of FUTURE_THEME_ID_MIGRATIONS) {
    assert.equal(getStableThemeRandomIdentifier(id), legacyId);
    assert.equal(getStableThemeRandomIdentifier(legacyId), legacyId);
    for (const part of THEMES.find((theme) => theme.id === id)?.parts ?? []) {
      const legacyPartId = CURRENT_FUTURE_PART_ID_MAP[part.id];
      assert.ok(legacyPartId);
      assert.equal(getStableThemeRandomIdentifier(part.id), legacyPartId);
      assert.equal(getStableThemeRandomIdentifier(legacyPartId), legacyPartId);
    }
  }

  assert.equal(getStableThemeRandomIdentifier("cycle"), "cycle");
  assert.equal(getStableThemeRandomIdentifier("unknown-theme"), "unknown-theme");
});

test("every original theme owns its launch and support-card surface", () => {
  const originalThemes = THEMES.slice(10);
  const parts = originalThemes.flatMap((theme) => theme.parts);

  assert.equal(parts.length, 1_960);
  assert.equal(uniqueCount(parts.map((part) => part.id)), parts.length);
  assert.equal(uniqueCount(parts.map((part) => part.name)), parts.length);

  const supportStatSignatures = originalThemes.map((theme) =>
    theme.parts
      .slice(5)
      .map((part) =>
        [
          part.role,
          part.inclusion,
          part.averageCopies,
          part.preferredCopies,
          part.powerWeight,
          part.unpleasantWeight,
        ].join(":"),
      )
      .join("|"),
  );
  assert.equal(uniqueCount(supportStatSignatures), 140);
});
