import assert from "node:assert/strict";
import test from "node:test";

import {
  FUTURE_THEME_ORDER_IDS,
  FUTURE_THEME_ROOT_IDS,
  HANDCRAFTED_THEME_IDS,
  getThemeEmblemSpec,
} from "../app/components/theme-emblem-spec.ts";
import { THEMES } from "../app/game/content.ts";

const THEME_IDS = THEMES.map((theme) => theme.id);

test("the complete 150-theme catalog has a semantic emblem", () => {
  assert.equal(THEME_IDS.length, 150);
  assert.equal(new Set(THEME_IDS).size, 150);

  const specs = THEME_IDS.map((id) => getThemeEmblemSpec(id));
  assert.equal(specs.length, 150);
  assert.equal(new Set(specs.map((spec) => spec.signature)).size, 150);

  for (const [index, spec] of specs.entries()) {
    assert.equal(spec.themeId, THEME_IDS[index]);
    assert.ok(Object.isFrozen(spec));
    assert.match(spec.primary, /^#[0-9A-F]{6}$/);
    assert.match(spec.secondary, /^#[0-9A-F]{6}$/);
    assert.match(spec.accent, /^#[0-9A-F]{6}$/);
    assert.match(spec.ink, /^#[0-9A-F]{6}$/);
  }
});

test("all ten handcrafted themes retain a dedicated base illustration", () => {
  const handcrafted = THEME_IDS.filter((id) =>
    HANDCRAFTED_THEME_IDS.includes(id as (typeof HANDCRAFTED_THEME_IDS)[number]),
  );
  assert.deepEqual(handcrafted, [...HANDCRAFTED_THEME_IDS]);

  HANDCRAFTED_THEME_IDS.forEach((id, index) => {
    const spec = getThemeEmblemSpec(id);
    assert.equal(spec.family, "handcrafted");
    assert.equal(spec.motif, id);
    assert.equal(spec.order, "legacy");
    assert.equal(spec.motifIndex, index);
    assert.equal(spec.orderIndex, -1);
    assert.equal(spec.catalogNumber, index + 1);
  });
});

test("future emblems cover fourteen roots and ten order crests exactly", () => {
  const futureSpecs = THEME_IDS.slice(HANDCRAFTED_THEME_IDS.length).map((id) =>
    getThemeEmblemSpec(id),
  );
  assert.equal(futureSpecs.length, 140);

  const rootCounts = new Map(FUTURE_THEME_ROOT_IDS.map((root) => [root, 0]));
  const orderCounts = new Map(FUTURE_THEME_ORDER_IDS.map((order) => [order, 0]));

  for (const spec of futureSpecs) {
    assert.equal(spec.family, "future");
    assert.notEqual(spec.order, "legacy");
    rootCounts.set(spec.motif as (typeof FUTURE_THEME_ROOT_IDS)[number], (rootCounts.get(spec.motif as (typeof FUTURE_THEME_ROOT_IDS)[number]) ?? 0) + 1);
    orderCounts.set(spec.order as (typeof FUTURE_THEME_ORDER_IDS)[number], (orderCounts.get(spec.order as (typeof FUTURE_THEME_ORDER_IDS)[number]) ?? 0) + 1);
  }

  assert.deepEqual([...rootCounts.values()], Array(14).fill(10));
  assert.deepEqual([...orderCounts.values()], Array(10).fill(14));
});

test("catalog numbering maps deterministically to root illustration and order crest", () => {
  FUTURE_THEME_ROOT_IDS.forEach((root, rootIndex) => {
    FUTURE_THEME_ORDER_IDS.forEach((order, orderIndex) => {
      const number = rootIndex * FUTURE_THEME_ORDER_IDS.length + orderIndex + 1;
      const id = `future-${String(number).padStart(3, "0")}-${root}-${order}`;
      const spec = getThemeEmblemSpec(id);

      assert.equal(spec.motif, root);
      assert.equal(spec.order, order);
      assert.equal(spec.motifIndex, rootIndex);
      assert.equal(spec.orderIndex, orderIndex);
      assert.equal(spec.catalogNumber, number);
      assert.equal(spec.signature, `future:${root}:${order}:${String(number).padStart(3, "0")}`);
    });
  });
});

test("a root shares its intentional palette while every order keeps its own crest identity", () => {
  for (const root of FUTURE_THEME_ROOT_IDS) {
    const specs = FUTURE_THEME_ORDER_IDS.map((order, orderIndex) => {
      const rootIndex = FUTURE_THEME_ROOT_IDS.indexOf(root);
      const number = rootIndex * FUTURE_THEME_ORDER_IDS.length + orderIndex + 1;
      return getThemeEmblemSpec(`future-${String(number).padStart(3, "0")}-${root}-${order}`);
    });
    const [first] = specs;
    for (const spec of specs) {
      assert.deepEqual(
        [spec.primary, spec.secondary, spec.accent, spec.ink],
        [first.primary, first.secondary, first.accent, first.ink],
      );
    }
    assert.equal(new Set(specs.map((spec) => spec.order)).size, 10);
  }
});

test("rejects empty, unknown, and semantically mismatched IDs", () => {
  assert.throws(() => getThemeEmblemSpec(""), /non-empty theme ID/);
  assert.throws(() => getThemeEmblemSpec("White-Night"), /Unsupported theme emblem ID/);
  assert.throws(() => getThemeEmblemSpec("future-theme-001"), /Unsupported theme emblem ID/);
  assert.throws(
    () => getThemeEmblemSpec("future-002-moonshade-blade-order"),
    /Unsupported theme emblem ID/,
  );
  assert.throws(
    () => getThemeEmblemSpec("future-001-moonshade-unknown-order"),
    /Unsupported theme emblem ID/,
  );
});
