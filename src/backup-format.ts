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

/**
 * Why a whole file was refused, before any record could be restored.
 *
 * A damaged record is not one of these: it is skipped and reported, so the
 * rest of the file can still be recovered.
 */
export type BackupFileErrorKind = 'not-json-lines' | 'header' | 'format' | 'version';

export class BackupFileError extends Error {
  readonly kind: BackupFileErrorKind;

  constructor(kind: BackupFileErrorKind, message: string) {
    super(message);
    this.name = 'BackupFileError';
    this.kind = kind;
  }
}

/** What a whole file yielded: its header, the records it admits, and what it did not. */
export interface ParsedBackup {
  header: BackupHeader;
  records: Character[];
  /** Lines that were not admitted as a Character, for the Restore report. */
  unreadable: number;
}

/**
 * The file as lines, reassembled across chunk boundaries.
 *
 * Chunks arrive as they are read, so at most one partial line is buffered and
 * no string ever spans the library.
 */
async function* readLines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  // A trailing newline is allowed, so an empty remainder is not a line.
  if (buffer.length > 0) yield buffer;
}

function readHeader(line: string): BackupHeader {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new BackupFileError(
      'not-json-lines',
      'The file is not a Character Gallery Backup: its first line is not JSON.'
    );
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BackupFileError('header', 'The Backup header could not be read.');
  }

  const header = value as Record<string, unknown>;

  if (typeof header.format !== 'string') {
    throw new BackupFileError(
      'format',
      'The file is not a Character Gallery Backup: it declares no format.'
    );
  }
  if (header.format !== BACKUP_FORMAT) {
    throw new BackupFileError(
      'format',
      `The file is not a Character Gallery Backup: its format is "${header.format}".`
    );
  }
  if (header.formatVersion === undefined) {
    throw new BackupFileError(
      'header',
      'The Backup header could not be read: it declares no format version.'
    );
  }
  if (header.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupFileError(
      'version',
      `This Backup declares format version ${String(header.formatVersion)}, ` +
        'which this app cannot restore.'
    );
  }
  if (typeof header.exportedAt !== 'string' || typeof header.appVersion !== 'string') {
    throw new BackupFileError('header', 'The Backup header could not be read.');
  }

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: header.exportedAt,
    appVersion: header.appVersion,
  };
}

/**
 * Admit one stored Character, or nothing when the line is not one.
 *
 * This version checks the fields every stored Character has and their types.
 * The full per-field matrix, duplicate ids, and line tolerance are a later
 * change to this same function, so the shape of the result stays as it is.
 */
function readRecord(line: string): Character | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (typeof record.name !== 'string') return null;
  if (typeof record.description !== 'string') return null;
  if (typeof record.image !== 'string') return null;
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null;

  const size = completeSize({
    width: record.width as number | undefined,
    height: record.height as number | undefined,
  });

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    image: record.image,
    ...(size ?? {}),
    createdAt: record.createdAt,
  };
}

/**
 * Read a version-1 Backup file as it arrives, line by line.
 *
 * A structural failure rejects the whole file before any record is handed
 * back. A line that is not a Character is counted, so the caller can report it
 * while restoring the rest.
 */
export async function parseBackup(chunks: AsyncIterable<string>): Promise<ParsedBackup> {
  const lines = readLines(chunks);
  const first = await lines.next();
  if (first.done) {
    throw new BackupFileError(
      'not-json-lines',
      'The file is empty, so it is not a Character Gallery Backup.'
    );
  }

  const header = readHeader(first.value);
  const records: Character[] = [];
  let unreadable = 0;

  for await (const line of lines) {
    const record = readRecord(line);
    if (record === null) {
      unreadable += 1;
    } else {
      records.push(record);
    }
  }

  return { header, records, unreadable };
}
