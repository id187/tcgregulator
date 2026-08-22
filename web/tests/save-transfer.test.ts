import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGame } from "../app/game/engine.ts";
import {
  getSaveTransferFilename,
  parseSaveTransfer,
  serializeSaveTransfer,
} from "../app/game/save-transfer.ts";

test("save export and import restore the exact validated campaign", () => {
  const game = createInitialGame(901);
  const serialized = serializeSaveTransfer(game);
  const restored = parseSaveTransfer(serialized);

  assert.deepEqual(restored.game, game);
  assert.equal(restored.migratedFrom, null);
  assert.equal(
    getSaveTransferFilename(game),
    `tcg-regulator-day-${game.day}-seed-901-schema-10.json`,
  );
});

test("malformed and unsupported transfers are rejected without mutation", () => {
  assert.throws(() => parseSaveTransfer("not json"));
  assert.throws(() => parseSaveTransfer(JSON.stringify({ schemaVersion: 7 })));
});
