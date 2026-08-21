import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const primaryNavigationSource = readFileSync(
  fileURLToPath(
    new URL("../app/components/PrimaryNavigation.tsx", import.meta.url),
  ),
  "utf8",
);

test("locked tabs use a date-free lock icon and keep their accessible reason", () => {
  assert.match(primaryNavigationSource, /<LockIcon\s*\/>/);
  assert.doesNotMatch(primaryNavigationSource, /D\{availability\.unlockDay\}/);
  assert.match(primaryNavigationSource, /aria-disabled=\{locked \|\| undefined\}/);
  assert.match(primaryNavigationSource, /aria-describedby=\{lockDescriptionId\}/);
  assert.match(primaryNavigationSource, /\{availability\.reason\}/);
});
