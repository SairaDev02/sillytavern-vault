import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  BackupFileError,
  backupFileName,
  backupParts,
  createBackupHeader,
  parseBackup,
  serializeCharacterRecord,
} from '../src/backup-format';
import type { Character } from '../src/types';
import { PNG_1X1, makeCharacter, makeCharacters } from './fixtures';

/**
 * The version-1 file contract, at the format seam: a header line, then one
 * line per stored Character. The expected app version comes from
 * `package.json` itself, so it does not repeat the module's own source.
 */
const PACKAGE_VERSION: string = packageJson.version;

const EXPORTED_AT = new Date('2026-10-31T09:15:00.000Z');

describe('backup header', () => {
  it('declares the format, version, export time, and the package version', () => {
    expect(createBackupHeader(EXPORTED_AT)).toEqual({
      format: 'character-gallery/backup',
      formatVersion: 1,
      exportedAt: '2026-10-31T09:15:00.000Z',
      appVersion: PACKAGE_VERSION,
    });
  });

  it('stamps the current time as ISO-8601 when no time is supplied', () => {
    const header = createBackupHeader();

    expect(header.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(header.exportedAt))).toBe(false);
  });
});

describe('backup record line', () => {
  it('writes the stored fields unchanged and nothing else', () => {
    const character = makeCharacter(7, {
      name: 'Aria',
      description: 'A description with "quotes" and a\nnewline',
      width: 832,
      height: 1216,
    });

    const line = serializeCharacterRecord(character);

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      id: 'char-7',
      name: 'Aria',
      description: 'A description with "quotes" and a\nnewline',
      image: PNG_1X1,
      width: 832,
      height: 1216,
      createdAt: 1_700_000_000_007,
    });
  });

  it('does not carry fields the contract does not name', () => {
    const stored = { ...makeCharacter(3), unexpected: 'not part of the contract' } as Character;

    expect(JSON.parse(serializeCharacterRecord(stored))).not.toHaveProperty('unexpected');
  });

  it('keeps a complete size pair as stored', () => {
    const record = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: 64, height: 32 }))
    );

    expect(record).toMatchObject({ width: 64, height: 32 });
  });

  it('drops both dimensions when the stored pair is incomplete', () => {
    const withoutHeight = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: 64, height: undefined }))
    );
    const withoutWidth = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: undefined, height: 32 }))
    );
    const withoutEither = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: undefined, height: undefined }))
    );

    for (const record of [withoutHeight, withoutWidth, withoutEither]) {
      expect(record).not.toHaveProperty('width');
      expect(record).not.toHaveProperty('height');
    }
  });

  it('drops a stored pair that is not a finite positive size', () => {
    const nonFinite = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: Number.POSITIVE_INFINITY, height: 32 }))
    );
    const zero = JSON.parse(
      serializeCharacterRecord(makeCharacter(2, { width: 0, height: 0 }))
    );

    expect(nonFinite).not.toHaveProperty('width');
    expect(nonFinite).not.toHaveProperty('height');
    expect(zero).not.toHaveProperty('width');
    expect(zero).not.toHaveProperty('height');
  });
});

describe('backup file parts', () => {
  it('is one part per line: the header first, then one per Character in library order', () => {
    const characters = makeCharacters(3);

    const parts = backupParts(characters, EXPORTED_AT);

    expect(parts).toHaveLength(characters.length + 1);
    // No part spans more than one line, so no single string spans the library.
    for (const part of parts) {
      expect(part.endsWith('\n')).toBe(true);
      expect(part.indexOf('\n')).toBe(part.length - 1);
    }

    const lines = parts.map((part) => JSON.parse(part));
    expect(lines[0]).toEqual(createBackupHeader(EXPORTED_AT));
    expect(lines.slice(1).map((line) => line.id)).toEqual(['char-1', 'char-2', 'char-3']);
    expect(lines.slice(1).map((line) => line.name)).toEqual([
      'Character 1',
      'Character 2',
      'Character 3',
    ]);
  });

  it('writes only the header for an empty library', () => {
    expect(backupParts([], EXPORTED_AT)).toEqual([
      `${JSON.stringify(createBackupHeader(EXPORTED_AT))}\n`,
    ]);
  });
});

describe('backup file name', () => {
  it('names the file for its purpose and the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe(
      'character-gallery-backup-2026-01-05.jsonl'
    );
    expect(backupFileName(new Date(2031, 11, 31))).toBe(
      'character-gallery-backup-2031-12-31.jsonl'
    );
  });

  it('uses the local calendar day, not the UTC day', () => {
    // Late evening locally is already the next day in UTC east of Greenwich and
    // the same day west of it, so a UTC-based name would disagree somewhere.
    const localEvening = new Date(2026, 0, 5, 23, 30);
    const localMorning = new Date(2026, 0, 5, 0, 30);

    expect(backupFileName(localEvening)).toBe('character-gallery-backup-2026-01-05.jsonl');
    expect(backupFileName(localMorning)).toBe('character-gallery-backup-2026-01-05.jsonl');
  });
});

/** Feed a file as text chunks, so no one string spans the parser's input. */
async function* chunksOf(text: string, chunkSize = text.length || 1): AsyncGenerator<string> {
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    yield text.slice(offset, offset + chunkSize);
  }
}

function headerLine(overrides: Record<string, unknown> = {}, omit: string[] = []): string {
  const header: Record<string, unknown> = {
    format: 'character-gallery/backup',
    formatVersion: 1,
    exportedAt: '2026-10-31T09:15:00.000Z',
    appVersion: '1.0.0',
    ...overrides,
  };
  for (const key of omit) delete header[key];
  return JSON.stringify(header);
}

function fileOf(header: string, ...recordLines: string[]): string {
  return `${[header, ...recordLines].join('\n')}\n`;
}

async function rejectionOf(text: string, chunkSize?: number): Promise<BackupFileError> {
  const failure = await parseBackup(chunksOf(text, chunkSize)).then(
    () => null,
    (error: unknown) => error
  );
  expect(failure).toBeInstanceOf(BackupFileError);
  return failure as BackupFileError;
}

describe('reading a Backup file', () => {
  it('reads the header and every record from a file written by this app', async () => {
    const characters = makeCharacters(3);
    const text = backupParts(characters, EXPORTED_AT).join('');

    const parsed = await parseBackup(chunksOf(text));

    expect(parsed.header).toEqual(createBackupHeader(EXPORTED_AT));
    expect(parsed.records).toEqual(characters);
    expect(parsed.unreadable).toBe(0);
  });

  it('reassembles lines that span chunk boundaries', async () => {
    const characters = makeCharacters(2);
    const text = backupParts(characters, EXPORTED_AT).join('');

    for (const chunkSize of [1, 2, 7, 13]) {
      const parsed = await parseBackup(chunksOf(text, chunkSize));
      expect(parsed.records).toEqual(characters);
      expect(parsed.unreadable).toBe(0);
    }
  });

  it('rejects an empty file as not JSON Lines', async () => {
    const failure = await rejectionOf('');

    expect(failure.kind).toBe('not-json-lines');
    expect(failure.message).toMatch(/empty/i);
  });

  it('rejects a file whose first line is not JSON', async () => {
    const failure = await rejectionOf('This is a text file, not a Backup\n');

    expect(failure.kind).toBe('not-json-lines');
    expect(failure.message).toMatch(/not a Character Gallery Backup/i);
  });

  it('rejects an unreadable header', async () => {
    const notAnObject = await rejectionOf('123\n');
    const missingFields = await rejectionOf(`${headerLine({}, ['exportedAt'])}\n`);

    for (const failure of [notAnObject, missingFields]) {
      expect(failure.kind).toBe('header');
      expect(failure.message).toMatch(/header/i);
    }
  });

  it('rejects a file for another format', async () => {
    const failure = await rejectionOf(
      fileOf(headerLine({ format: 'some-other-tool/export' }), serializeCharacterRecord(makeCharacter(1)))
    );

    expect(failure.kind).toBe('format');
    expect(failure.message).toMatch(/not a Character Gallery Backup/i);
    expect(failure.message).toMatch(/some-other-tool\/export/);
  });

  it('refuses an unsupported format version and names the declared version', async () => {
    const newer = await rejectionOf(fileOf(headerLine({ formatVersion: 2 })));
    const future = await rejectionOf(fileOf(headerLine({ formatVersion: 99 })));

    expect(newer.kind).toBe('version');
    expect(newer.message).toMatch(/\b2\b/);
    expect(future.kind).toBe('version');
    expect(future.message).toMatch(/\b99\b/);
  });

  it('admits a record with the five stored fields and the right types', async () => {
    const character = makeCharacter(5);

    const parsed = await parseBackup(
      chunksOf(fileOf(headerLine(), serializeCharacterRecord(character)))
    );

    expect(parsed.records).toEqual([character]);
  });

  it('skips and counts a record whose stored fields are missing or mistyped', async () => {
    const valid = serializeCharacterRecord(makeCharacter(1));
    const lines = [
      valid,
      JSON.stringify({ ...makeCharacter(2), id: undefined }),
      JSON.stringify({ ...makeCharacter(3), name: 7 }),
      JSON.stringify({ ...makeCharacter(4), description: null }),
      JSON.stringify({ ...makeCharacter(5), image: false }),
      JSON.stringify({ ...makeCharacter(6), createdAt: '1700000000000' }),
      '{"not": "json"',
    ];

    const parsed = await parseBackup(chunksOf(fileOf(headerLine(), ...lines)));

    expect(parsed.records.map((record) => record.id)).toEqual(['char-1']);
    expect(parsed.unreadable).toBe(lines.length - 1);
  });
});
