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
const gameShellSource = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8",
);

test("locked tabs use a date-free lock icon and keep their accessible reason", () => {
  assert.match(primaryNavigationSource, /<LockIcon\s*\/>/);
  assert.doesNotMatch(primaryNavigationSource, /D\{availability\.unlockDay\}/);
  assert.match(primaryNavigationSource, /aria-disabled=\{locked \|\| undefined\}/);
  assert.match(primaryNavigationSource, /aria-describedby=\{lockDescriptionId\}/);
  assert.match(primaryNavigationSource, /\{availability\.reason\}/);
});

test("newly unlocked tabs keep an attention mark until the player opens them", () => {
  assert.match(primaryNavigationSource, /attentionTabs\.includes\(item\.id\)/);
  assert.match(gameShellSource, /setAttentionTabs/);
  assert.doesNotMatch(gameShellSource, /pendingUnlockTabsRef/);
});

test("future business actions stay hidden until their day and then flag Operations", () => {
  assert.match(
    gameShellSource,
    /const unlockedBusinessActions = BUSINESS_ACTIONS\s*\.filter/,
  );
  assert.match(gameShellSource, /isHandoverStarterBusinessAction/);
  assert.match(gameShellSource, /game\.day >= minimumDay/);
  assert.match(gameShellSource, /const unlockedBusinessAction = BUSINESS_ACTIONS\.some/);
  assert.match(gameShellSource, /\[\.\.\.newlyUnlockedTabs, "operations" as const\]/);
});
