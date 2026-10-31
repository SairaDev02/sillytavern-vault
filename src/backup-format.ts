import packageJson from '../package.json';
import { parseDataUrl } from './download';
import type { Character } from './types';

/**
 * The version-1 Backup file: one header line, then one line per stored
 * Character.
 *
 * This module owns the file's contract — the header, the version rule, and the
 * record shape. It knows nothing about IndexedDB or the Character library, and
 * the image shape it checks is the one the download path already defines, so
 * the reader a Restore needs can share it without restating either.
 */

export const BACKUP_FORMAT = 'character-gallery/backup';
export const BACKUP_FORMAT_VERSION = 1;
/** JSON Lines: UTF-8 text, one JSON value per line. */
export const BACKUP_MIME_TYPE = 'application/x-ndjson';

/**
 * The longest line the reader will hold. A line over this cannot be a stored
 * Character, so the file is refused rather than buffered without limit.
 */
export const MAX_LINE_LENGTH = 128 * 1024 * 1024;

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
export type BackupFileErrorKind =
  | 'not-json-lines'
  | 'header'
  | 'format'
  | 'version'
  | 'duplicate-id'
  | 'line-too-long';

export class BackupFileError extends Error {
  readonly kind: BackupFileErrorKind;

  constructor(kind: BackupFileErrorKind, message: string) {
    super(message);
    this.name = 'BackupFileError';
    this.kind = kind;
  }
}

/** One line that was not admitted as a Character, for the Restore report. */
export interface UnreadableRecord {
  /** The line's 1-based position in the file; the header line is line 1. */
  line: number;
  /** What the record failed on, in the person's terms. */
  reason: string;
}

/** What a whole file yielded: its header, the records it admits, and what it did not. */
export interface ParsedBackup {
  header: BackupHeader;
  records: Character[];
  /** Lines that were not admitted as a Character, by their position. */
  unreadable: UnreadableRecord[];
}

/** One line of the file, with the position a report can name. */
interface FileLine {
  number: number;
  text: string;
}

function tooLongLine(): BackupFileError {
  return new BackupFileError(
    'line-too-long',
    'This Backup is damaged: it holds a line longer than a record can be, ' +
      'so nothing was restored.'
  );
}

/** Refuse a line that cannot be a record before it is held in memory. */
function guardLength(length: number, maxLineLength: number): void {
  if (length > maxLineLength) throw tooLongLine();
}

/**
 * The file as lines, reassembled across chunk boundaries.
 *
 * Chunks arrive as they are read, so at most one partial line is buffered and
 * no string ever spans the library. A byte-order mark on the first line and a
 * carriage return before each newline are part of how the file was saved, not
 * part of its content, so they are removed here for every reader.
 */
async function* readLines(
  chunks: AsyncIterable<string>,
  maxLineLength: number
): AsyncGenerator<FileLine> {
  let buffer = '';
  let number = 0;
  let first = true;

  const normalise = (text: string): string => {
    const withoutCarriageReturn = text.endsWith('\r') ? text.slice(0, -1) : text;
    if (!first) return withoutCarriageReturn;
    first = false;
    return withoutCarriageReturn.startsWith('\uFEFF')
      ? withoutCarriageReturn.slice(1)
      : withoutCarriageReturn;
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      guardLength(newline, maxLineLength);
      number += 1;
      yield { number, text: normalise(buffer.slice(0, newline)) };
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
    // What is left has not seen its newline yet, so it is one pending line.
    guardLength(buffer.length, maxLineLength);
  }

  // A trailing newline is allowed, so an empty remainder is not a line.
  if (buffer.length > 0) {
    number += 1;
    yield { number, text: normalise(buffer) };
  }
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
 * What a skipped record failed on, in the person's terms. One place for the
 * wording, so the report and the tests read the same words.
 */
const RECORD_FAILURE = {
  line: 'the line is not a record',
  id: 'the id is missing',
  name: 'the name is missing',
  description: 'the description is missing',
  createdAt: 'the creation time is missing',
  imageMissing: 'the image is missing',
  imageShape: 'the image is not an image',
  imageEmpty: 'the image is empty',
} as const;

/** One admitted Character, or the one thing that kept the line from being one. */
type RecordReading = { record: Character } | { reason: string };

/**
 * Whether the string is an image data URL the app may store: an `image/*` type,
 * the `base64` flag, and a payload. The shape is all that is checked — decoding
 * a backup's images would buy no stronger guarantee and would cost the file.
 */
function readImage(value: unknown): { image: string } | { reason: string } {
  if (typeof value !== 'string') return { reason: RECORD_FAILURE.imageMissing };

  let base64: string;
  try {
    base64 = parseDataUrl(value).base64;
  } catch {
    return { reason: RECORD_FAILURE.imageShape };
  }
  if (base64.length === 0) return { reason: RECORD_FAILURE.imageEmpty };

  return { image: value };
}

/**
 * Admit one stored Character, or say why the line is not one.
 *
 * The field rules are the format contract's: identity and creation time are
 * required, the name must have content, the description may be empty, the image
 * must be shaped like a data URL, and a size is kept only as a complete pair.
 * Fields the contract does not name are ignored. The first failure in contract
 * order is reported, so each skipped record names one thing to look at.
 */
function readRecord(line: string): RecordReading {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { reason: RECORD_FAILURE.line };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { reason: RECORD_FAILURE.line };
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) {
    return { reason: RECORD_FAILURE.id };
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    return { reason: RECORD_FAILURE.name };
  }
  if (typeof record.description !== 'string') {
    return { reason: RECORD_FAILURE.description };
  }
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) {
    return { reason: RECORD_FAILURE.createdAt };
  }

  const image = readImage(record.image);
  if ('reason' in image) return image;

  const size = completeSize({
    width: record.width as number | undefined,
    height: record.height as number | undefined,
  });

  return {
    record: {
      id: record.id,
      name: record.name,
      description: record.description,
      image: image.image,
      ...(size ?? {}),
      createdAt: record.createdAt,
    },
  };
}

export interface ParseBackupOptions {
  /** How long one line may be before the file is refused. */
  maxLineLength?: number;
}

/**
 * Read a version-1 Backup file as it arrives, line by line.
 *
 * A structural failure — not JSON Lines, an unreadable header, another format,
 * an unsupported version, one identity twice, or a line too long to be a record
 * — rejects the whole file before any record is handed back. A line that is not
 * a Character is skipped and listed with its position and what it failed on, so
 * the caller can report it while restoring the rest.
 */
export async function parseBackup(
  chunks: AsyncIterable<string>,
  { maxLineLength = MAX_LINE_LENGTH }: ParseBackupOptions = {}
): Promise<ParsedBackup> {
  const records: Character[] = [];
  const unreadable: UnreadableRecord[] = [];
  const identities = new Set<string>();
  let header: BackupHeader | null = null;

  for await (const line of readLines(chunks, maxLineLength)) {
    // A whitespace-only line is tolerated: it carries no record and is not a
    // failure worth reporting.
    if (line.text.trim() === '') continue;

    if (header === null) {
      header = readHeader(line.text);
      continue;
    }

    const reading = readRecord(line.text);
    if ('reason' in reading) {
      unreadable.push({ line: line.number, reason: reading.reason });
      continue;
    }

    // An additive Restore cannot apply one identity twice, so a file that
    // carries two is damaged as a whole rather than partly restorable.
    if (identities.has(reading.record.id)) {
      throw new BackupFileError(
        'duplicate-id',
        'This Backup is damaged: two records carry the same Character id, ' +
          'so nothing was restored.'
      );
    }

    identities.add(reading.record.id);
    records.push(reading.record);
  }

  if (header === null) {
    throw new BackupFileError(
      'not-json-lines',
      'The file is empty, so it is not a Character Gallery Backup.'
    );
  }

  return { header, records, unreadable };
}
