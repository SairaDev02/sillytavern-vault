import packageJson from '../package.json';
import type { Character } from './types';

/**
 * The version-1 Backup file: one header line, then one line per stored
 * Character.
 *
 * This module owns the file's contract — the header, the version rule, and the
 * record shape. It knows nothing about IndexedDB, the Character library, or the
 * DOM, so the reader a Restore needs can share it without pulling any of them
 * in.
 */

export const BACKUP_FORMAT = 'character-gallery/backup';
export const BACKUP_FORMAT_VERSION = 1;
/** JSON Lines: UTF-8 text, one JSON value per line. */
export const BACKUP_MIME_TYPE = 'application/x-ndjson';

/** The app version a Backup records. `package.json` is the only source of it. */
const APP_VERSION: string = packageJson.version;

export interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  appVersion: string;
}

/** The header line's content, stamped with the export time. */
export function createBackupHeader(exportedAt: Date = new Date()): BackupHeader {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    appVersion: APP_VERSION,
  };
}

/**
 * The size a record carries. The contract keeps dimensions only as a complete,
 * finite, positive pair, so anything else collapses to no size at all.
 */
function completeSize(
  record: Pick<Character, 'width' | 'height'>
): { width: number; height: number } | null {
  const { width, height } = record;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Serialize one stored Character as one JSON line, in the contract's field
 * order. Only the fields the contract names are written, so a record never
 * carries anything a Restore would not read back.
 */
export function serializeCharacterRecord(character: Character): string {
  const size = completeSize(character);
  return JSON.stringify({
    id: character.id,
    name: character.name,
    description: character.description,
    image: character.image,
    ...(size ?? {}),
    createdAt: character.createdAt,
  });
}

/**
 * The file as per-line parts: the header line first, then one part per record.
 *
 * Each part is one complete line, so a caller can hand the array to
 * `new Blob([...])` without building one string that spans the library.
 */
export function backupParts(
  characters: readonly Character[],
  exportedAt: Date = new Date()
): string[] {
  return [
    `${JSON.stringify(createBackupHeader(exportedAt))}\n`,
    ...characters.map((character) => `${serializeCharacterRecord(character)}\n`),
  ];
}

/** The Backup's file name for the local calendar day of `date`. */
export function backupFileName(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `character-gallery-backup-${year}-${month}-${day}.jsonl`;
}
