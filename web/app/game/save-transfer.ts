import {
  CURRENT_SAVE_SCHEMA_VERSION,
  getSaveSchemaVersion,
  migrateGameStateValue,
} from "./save-migrations.ts";
import { MAX_SAVE_BYTES, parseGameState } from "./save-schema.ts";
import type { GameState } from "./types.ts";

export type ParsedSaveTransfer = Readonly<{
  game: GameState;
  migratedFrom: number | null;
}>;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseSaveTransfer(serialized: string): ParsedSaveTransfer {
  if (byteLength(serialized) > MAX_SAVE_BYTES) {
    throw new Error("save exceeds the maximum size");
  }
  const parsed = JSON.parse(serialized) as unknown;
  const migrated = migrateGameStateValue(parsed);
  return {
    game: parseGameState(migrated.value),
    migratedFrom: migrated.migratedFrom,
  };
}

export function serializeSaveTransfer(game: GameState): string {
  const validated = parseGameState(game);
  return JSON.stringify(validated, null, 2);
}

export function getSaveTransferFilename(
  game: Pick<GameState, "day" | "seed"> | null,
  schemaVersion = CURRENT_SAVE_SCHEMA_VERSION,
): string {
  const day = game ? `day-${game.day}` : "recovery";
  const seed = game ? `-seed-${game.seed}` : "";
  return `tcg-regulator-${day}${seed}-schema-${schemaVersion}.json`;
}

export function describeUnsupportedSave(serialized: string): string {
  try {
    const version = getSaveSchemaVersion(JSON.parse(serialized) as unknown);
    return version === null ? "스키마를 확인할 수 없는 저장" : `스키마 ${version} 저장`;
  } catch {
    return "손상되었거나 JSON 형식이 아닌 저장";
  }
}
