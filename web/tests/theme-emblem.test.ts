import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CENTRAL_GLYPH_IDS,
  CENTRAL_PATTERN_IDS,
  HANDCRAFTED_THEME_IDS,
  ORIGINAL_THEME_EMBLEM_DESCRIPTORS,
  THEME_EMBLEM_DESCRIPTORS,
  getThemeEmblemSpec,
} from "../app/components/theme-emblem-spec.ts";
import {
  ORIGINAL_FUTURE_THEME_IDENTITIES,
  ORIGINAL_FUTURE_THEMES,
} from "../app/game/original-theme-catalog.ts";
import { FUTURE_THEME_ID_MIGRATIONS } from "../app/game/future-theme-id-migration.ts";
import { THEMES } from "../app/game/content.ts";

const THEME_IDS = THEMES.map((theme) => theme.id);
const ORIGINAL_IDS = ORIGINAL_FUTURE_THEME_IDENTITIES.map((identity) => identity.id);
const DESCRIPTOR_IDS = Object.keys(ORIGINAL_THEME_EMBLEM_DESCRIPTORS);
const SPEC_SOURCE = readFileSync(
  fileURLToPath(new URL("../app/components/theme-emblem-spec.ts", import.meta.url)),
  "utf8",
);
const RENDERER_SOURCE = readFileSync(
  fileURLToPath(new URL("../app/components/ThemeEmblem.tsx", import.meta.url)),
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  return (
    (Math.max(leftLuminance, rightLuminance) + 0.05) /
    (Math.min(leftLuminance, rightLuminance) + 0.05)
  );
}

test("the complete 150-theme catalog resolves by direct descriptor lookup", () => {
  assert.equal(THEME_IDS.length, 150);
  assert.equal(new Set(THEME_IDS).size, 150);
  assert.equal(Object.keys(THEME_EMBLEM_DESCRIPTORS).length, 150);

  const specs = THEME_IDS.map((id) => getThemeEmblemSpec(id));
  assert.equal(new Set(specs.map((spec) => spec.signature)).size, 150);
  assert.equal(new Set(specs.map((spec) => spec.visualSignature)).size, 150);

  specs.forEach((spec, index) => {
    assert.equal(spec.themeId, THEME_IDS[index]);
    assert.strictEqual(getThemeEmblemSpec(spec.themeId), spec);
    assert.ok(Object.isFrozen(spec));
    for (const colour of [spec.primary, spec.secondary, spec.accent, spec.ink]) {
      assert.match(colour, /^#[0-9A-F]{6}$/);
    }
  });
});

test("the 140 authored emblem records match the original catalog one to one", () => {
  assert.equal(ORIGINAL_FUTURE_THEMES.length, 140);
  assert.equal(ORIGINAL_FUTURE_THEME_IDENTITIES.length, 140);
  assert.equal(DESCRIPTOR_IDS.length, 140);
  assert.deepEqual(DESCRIPTOR_IDS, ORIGINAL_IDS);
  assert.deepEqual(ORIGINAL_FUTURE_THEMES.map((theme) => theme.id), ORIGINAL_IDS);
  assert.deepEqual(FUTURE_THEME_ID_MIGRATIONS.map((entry) => entry.id), ORIGINAL_IDS);

  ORIGINAL_FUTURE_THEME_IDENTITIES.forEach((identity, index) => {
    const descriptor = ORIGINAL_THEME_EMBLEM_DESCRIPTORS[identity.id];
    assert.equal(descriptor.catalogNumber, index + 1);
    assert.equal(descriptor.name, identity.name);
    assert.deepEqual(descriptor.keywords, identity.emblemKeywords);
    assert.ok(identity.signatureIdentity.startsWith(`${descriptor.name}: `));
    assert.equal(descriptor.family, "future");
    assert.ok(descriptor.motif.length > 4);
    assert.ok(descriptor.silhouette.length > 4);
    assert.ok(CENTRAL_PATTERN_IDS.includes(descriptor.pattern));
  });
});

test("every future theme owns a distinct geometry identity, not a palette swap", () => {
  const descriptors = Object.values(ORIGINAL_THEME_EMBLEM_DESCRIPTORS);
  const geometryFingerprints = descriptors.map((descriptor) =>
    JSON.stringify({
      silhouette: descriptor.silhouette,
      pattern: descriptor.pattern,
      pieces: descriptor.pieces,
      geometry: descriptor.geometry,
    }),
  );

  assert.equal(new Set(descriptors.map((descriptor) => descriptor.signature)).size, 140);
  assert.equal(new Set(descriptors.map((descriptor) => descriptor.visualSignature)).size, 140);
  assert.equal(new Set(descriptors.map((descriptor) => descriptor.silhouette)).size, 140);
  assert.equal(new Set(geometryFingerprints).size, 140);

  for (const descriptor of descriptors) {
    assert.ok(Object.isFrozen(descriptor.keywords));
    assert.ok(Object.isFrozen(descriptor.pieces));
    assert.ok(Object.isFrozen(descriptor.geometry));
    assert.ok(descriptor.pieces.length >= 2);
    for (const piece of descriptor.pieces) {
      assert.ok(Object.isFrozen(piece));
      assert.ok(CENTRAL_GLYPH_IDS.includes(piece.glyph));
      assert.ok(piece.x >= 35 && piece.x <= 65, `${descriptor.themeId} escaped the central x field`);
      assert.ok(piece.y >= 34 && piece.y <= 66, `${descriptor.themeId} escaped the central y field`);
      assert.ok(piece.scale >= 0.35 && piece.scale <= 0.85);
    }
  }
});

test("future identity selection contains no root/order parser or Cartesian-product API", () => {
  assert.equal((SPEC_SOURCE.match(/"future-\d{3}[^"]+": original\(\{/g) ?? []).length, 140);
  assert.doesNotMatch(SPEC_SOURCE, /FUTURE_THEME_ROOT_IDS/);
  assert.doesNotMatch(SPEC_SOURCE, /FUTURE_THEME_ORDER_IDS/);
  assert.doesNotMatch(SPEC_SOURCE, /futurePalette/);
  assert.doesNotMatch(SPEC_SOURCE, /sealSide/);
  assert.doesNotMatch(SPEC_SOURCE, /badge/i);
  assert.doesNotMatch(SPEC_SOURCE, /\^future-|new RegExp|\.exec\(themeId\)/);
  for (const { legacyId } of FUTURE_THEME_ID_MIGRATIONS) {
    assert.equal(SPEC_SOURCE.includes(legacyId), false, `retired ID leaked into emblem spec: ${legacyId}`);
    assert.throws(() => getThemeEmblemSpec(legacyId), /Unsupported theme emblem ID/);
  }

  assert.throws(
    () => getThemeEmblemSpec("future-001-synthetic-order"),
    /Unsupported theme emblem ID/,
  );
  assert.throws(
    () => getThemeEmblemSpec("future-141-impossible-original-theme"),
    /Unsupported theme emblem ID/,
  );
});

test("the future renderer is a central mark with no corner seal or order badge", () => {
  assert.doesNotMatch(RENDERER_SOURCE, /FutureSeal|OrderMark|sealSide/);
  assert.doesNotMatch(RENDERER_SOURCE, /data-emblem-order/);
  assert.doesNotMatch(RENDERER_SOURCE, /corner|badge/i);
  assert.match(RENDERER_SOURCE, /function OriginalCentralMark/);
  assert.match(RENDERER_SOURCE, /spec\.pieces\.map/);
});

test("all ten handcrafted themes retain their dedicated illustrations", () => {
  assert.deepEqual(THEME_IDS.slice(0, 10), [...HANDCRAFTED_THEME_IDS]);
  HANDCRAFTED_THEME_IDS.forEach((id) => {
    const spec = getThemeEmblemSpec(id);
    assert.equal(spec.family, "handcrafted");
    assert.equal(spec.motif, id);
    assert.equal(spec.signature, `handcrafted:${id}`);
  });
});

test("emblem signal colours remain visible against their ink strokes", () => {
  for (const id of THEME_IDS) {
    const spec = getThemeEmblemSpec(id);
    assert.ok(
      contrastRatio(spec.secondary, spec.ink) >= 3,
      `${id} secondary colour lost graphical contrast`,
    );
    assert.ok(
      contrastRatio(spec.accent, spec.ink) >= 3,
      `${id} accent colour lost graphical contrast`,
    );
  }
});

test("empty, unknown, and case-mismatched IDs are rejected", () => {
  assert.throws(() => getThemeEmblemSpec(""), /non-empty theme ID/);
  assert.throws(() => getThemeEmblemSpec("White-Night"), /Unsupported theme emblem ID/);
  assert.throws(() => getThemeEmblemSpec("future-theme-001"), /Unsupported theme emblem ID/);
});
