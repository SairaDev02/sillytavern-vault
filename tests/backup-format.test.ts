import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import {
  BackupFileError,
  MAX_LINE_LENGTH,
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
    expect(parsed.unreadable).toEqual([]);
  });

  it('reassembles lines that span chunk boundaries', async () => {
    const characters = makeCharacters(2);
    const text = backupParts(characters, EXPORTED_AT).join('');

    for (const chunkSize of [1, 2, 7, 13]) {
      const parsed = await parseBackup(chunksOf(text, chunkSize));
      expect(parsed.records).toEqual(characters);
      expect(parsed.unreadable).toEqual([]);
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
    expect(parsed.unreadable).toHaveLength(lines.length - 1);
  });
});

/**
 * The record matrix from the format contract. A field the contract names must
 * be usable; anything the contract leaves out is ignored, and a dimension pair
 * that is not complete and positive is dropped instead of failing the record.
 */
function recordLine(overrides: Record<string, unknown>, omit: string[] = []): string {
  const record: Record<string, unknown> = { ...makeCharacter(1), ...overrides };
  for (const key of omit) delete record[key];
  return JSON.stringify(record);
}

async function parseRecords(...lines: string[]) {
  return parseBackup(chunksOf(fileOf(headerLine(), ...lines)));
}

describe('record matrix: name', () => {
  it('stores a name with content as written, without trimming it', async () => {
    const parsed = await parseRecords(recordLine({ name: '  Aria  ' }));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].name).toBe('  Aria  ');
  });

  it('skips a record whose name is missing, empty, or only whitespace', async () => {
    const parsed = await parseRecords(
      recordLine({ id: 'missing', name: undefined }),
      recordLine({ id: 'number', name: 7 }),
      recordLine({ id: 'empty', name: '' }),
      recordLine({ id: 'blank', name: ' \t\n ' })
    );

    expect(parsed.records).toEqual([]);
    expect(parsed.unreadable).toHaveLength(4);
  });
});

describe('record matrix: description and creation time', () => {
  it('admits an empty description', async () => {
    const parsed = await parseRecords(recordLine({ description: '' }));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].description).toBe('');
  });

  it('skips a record whose creation time is not a finite number', async () => {
    const parsed = await parseRecords(
      recordLine({ id: 'text', createdAt: '1700000000000' }),
      recordLine({ id: 'null', createdAt: null }),
      recordLine({ id: 'absent' }, ['createdAt']),
      recordLine({ id: 'bool', createdAt: true })
    );

    expect(parsed.records).toEqual([]);
    expect(parsed.unreadable).toHaveLength(4);
  });
});

describe('record matrix: image data URL shape', () => {
  it('admits an image data URL whose type is image, that is base64, with a payload', async () => {
    const parsed = await parseRecords(
      recordLine({ id: 'png', image: 'data:image/png;base64,AAAA' }),
      recordLine({ id: 'svg', image: 'data:image/svg+xml;base64,PHN2Zy8+' }),
      recordLine({ id: 'param', image: 'data:image/jpeg;charset=utf-8;base64,/9j/4AAQ' }),
      // The bytes are never decoded, so a shaped payload is enough.
      recordLine({ id: 'junk', image: 'data:image/png;base64,not actually base64!!' })
    );

    expect(parsed.records.map((record) => record.id)).toEqual(['png', 'svg', 'param', 'junk']);
    expect(parsed.unreadable).toEqual([]);
  });

  it('skips an image that is not an image data URL with a base64 payload', async () => {
    const parsed = await parseRecords(
      recordLine({ id: 'url', image: 'https://example.com/aria.png' }),
      recordLine({ id: 'text', image: 'data:text/plain;base64,aGVsbG8=' }),
      recordLine({ id: 'plain', image: 'data:image/png,aGVsbG8=' }),
      recordLine({ id: 'empty', image: 'data:image/png;base64,' }),
      recordLine({ id: 'number', image: 7 })
    );

    expect(parsed.records).toEqual([]);
    expect(parsed.unreadable).toHaveLength(5);
  });
});

describe('record matrix: dimensions and unknown fields', () => {
  it('keeps a complete positive size pair', async () => {
    const parsed = await parseRecords(recordLine({ width: 832, height: 1216 }));

    expect(parsed.records[0]).toMatchObject({ width: 832, height: 1216 });
  });

  it('drops a partial, zero, negative, or non-finite pair and keeps the record', async () => {
    const cases: Record<string, unknown>[] = [
      { id: 'width-only', width: 64, height: undefined },
      { id: 'height-only', width: undefined, height: 32 },
      { id: 'zero', width: 0, height: 32 },
      { id: 'negative', width: 64, height: -32 },
      { id: 'null', width: 64, height: null },
      { id: 'text', width: '64', height: 32 },
    ];

    const parsed = await parseRecords(...cases.map((overrides) => recordLine(overrides)));

    expect(parsed.unreadable).toEqual([]);
    expect(parsed.records.map((record) => record.id)).toEqual(cases.map((c) => c.id));
    for (const record of parsed.records) {
      expect(record).not.toHaveProperty('width');
      expect(record).not.toHaveProperty('height');
    }
  });

  it('ignores unknown extra fields', async () => {
    const parsed = await parseRecords(
      recordLine({ unexpected: 'not part of the contract', nested: { a: 1 } })
    );

    expect(parsed.records).toEqual([makeCharacter(1)]);
  });
});

/**
 * Nothing is dropped silently: every line that was not admitted is reported by
 * its position in the file, in terms a person can act on. The header is line 1,
 * a tolerated blank line still occupies its line, and the first failure in
 * contract order is the one reported.
 */
describe('unreadable record report', () => {
  it('reports each skipped record by its line and what it failed on', async () => {
    const text = [
      headerLine(),
      serializeCharacterRecord(makeCharacter(1)),
      recordLine({ id: 'no-name', name: '   ' }),
      '',
      'not json at all',
      '',
    ].join('\n');

    const parsed = await parseBackup(chunksOf(`${text}\n`));

    expect(parsed.records.map((record) => record.id)).toEqual(['char-1']);
    expect(parsed.unreadable).toEqual([
      { line: 3, reason: 'the name is missing' },
      { line: 5, reason: 'the line is not a record' },
    ]);
  });

  it('names the field each record failed on in the person\'s terms', async () => {
    const lines = [
      recordLine({}, ['id']),
      recordLine({ id: 'no-name' }, ['name']),
      recordLine({ id: 'no-description' }, ['description']),
      recordLine({ id: 'no-created-at' }, ['createdAt']),
      recordLine({ id: 'no-image' }, ['image']),
      recordLine({ id: 'bad-image', image: 'https://example.com/aria.png' }),
      recordLine({ id: 'empty-image', image: 'data:image/png;base64,' }),
    ];

    const parsed = await parseRecords(...lines);

    expect(parsed.unreadable.map((entry) => entry.reason)).toEqual([
      'the id is missing',
      'the name is missing',
      'the description is missing',
      'the creation time is missing',
      'the image is missing',
      'the image is not an image',
      'the image is empty',
    ]);
    expect(parsed.unreadable.map((entry) => entry.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('reports the first failing field in contract order', async () => {
    const parsed = await parseRecords(JSON.stringify({ id: '', image: 'nope' }));

    expect(parsed.unreadable).toEqual([{ line: 2, reason: 'the id is missing' }]);
  });
});

/**
 * A file that carries one identity twice cannot be applied as an additive
 * Restore, so it is a structural failure: the whole file is refused before any
 * record is handed back, and nothing is written. A line that fails the record
 * matrix still carries the identity it names, so it counts here too.
 */
describe('duplicate identities', () => {
  it('rejects the whole file when two admitted records carry the same id', async () => {
    const failure = await rejectionOf(
      fileOf(
        headerLine(),
        serializeCharacterRecord(makeCharacter(1)),
        serializeCharacterRecord(makeCharacter(2)),
        serializeCharacterRecord(makeCharacter(1, { name: 'Second copy' }))
      )
    );

    expect(failure.kind).toBe('duplicate-id');
    expect(failure.message).toMatch(/same Character id/i);
  });

  it('rejects a file that carries the same id three times', async () => {
    const failure = await rejectionOf(
      fileOf(headerLine(), ...[1, 2, 3].map(() => serializeCharacterRecord(makeCharacter(4))))
    );

    expect(failure.kind).toBe('duplicate-id');
  });

  it('rejects the whole file when a malformed line carries an admitted id', async () => {
    const failure = await rejectionOf(
      fileOf(
        headerLine(),
        serializeCharacterRecord(makeCharacter(1)),
        recordLine({ name: 7 })
      )
    );

    expect(failure.kind).toBe('duplicate-id');
    expect(failure.message).toMatch(/same Character id/i);
  });

  it('rejects the whole file when the malformed duplicate comes first', async () => {
    const failure = await rejectionOf(
      fileOf(
        headerLine(),
        recordLine({ name: 7 }),
        serializeCharacterRecord(makeCharacter(1))
      )
    );

    expect(failure.kind).toBe('duplicate-id');
  });
});

/**
 * A line longer than the reader's bound is a structural failure: the file is
 * refused rather than buffered without limit. The bound is exercised at test
 * scale through the parser's option, because the production bound is 128 MiB.
 */
describe('the line bound', () => {
  it('bounds a line at 128 MiB', () => {
    expect(MAX_LINE_LENGTH).toBe(134_217_728);
  });

  it('rejects a file whose line is longer than the bound', async () => {
    const failure = await parseBackup(
      chunksOf(fileOf(headerLine(), 'x'.repeat(200))),
      { maxLineLength: 128 }
    ).then(
      () => null,
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(BackupFileError);
    expect((failure as BackupFileError).kind).toBe('line-too-long');
    expect((failure as BackupFileError).message).toMatch(/longer than this reader will hold/i);
  });

  it('rejects a long line that only arrives as many chunks', async () => {
    const failure = await parseBackup(
      chunksOf(fileOf(headerLine(), 'y'.repeat(200)), 7),
      { maxLineLength: 128 }
    ).then(
      () => null,
      (error: unknown) => error
    );

    expect((failure as BackupFileError).kind).toBe('line-too-long');
  });

  it('admits a line at the bound', async () => {
    const line = recordLine({ name: 'x'.repeat(128) });

    const parsed = await parseBackup(chunksOf(fileOf(headerLine(), line)), {
      maxLineLength: line.length,
    });

    expect(parsed.unreadable).toEqual([]);
    expect(parsed.records[0].name).toHaveLength(128);
  });
});

/**
 * What a file picked from a disk or another operating system may look like: a
 * byte-order mark, CRLF endings, blank lines, and a final newline. None of them
 * is damage, so none of them changes what is restored.
 */
describe('file tolerances', () => {
  it('tolerates a leading UTF-8 BOM and CRLF line endings at any chunk boundary', async () => {
    const characters = makeCharacters(2);
    const text =
      '\uFEFF' +
      backupParts(characters, EXPORTED_AT)
        .join('')
        .replace(/\n/g, '\r\n');

    for (const chunkSize of [1, 3, 5]) {
      const parsed = await parseBackup(chunksOf(text, chunkSize));
      expect(parsed.header).toEqual(createBackupHeader(EXPORTED_AT));
      expect(parsed.records).toEqual(characters);
      expect(parsed.unreadable).toEqual([]);
    }
  });

  it('tolerates whitespace-only lines between records and a trailing newline', async () => {
    const text =
      [
        '',
        '  ',
        headerLine(),
        '',
        serializeCharacterRecord(makeCharacter(1)),
        '\t',
        serializeCharacterRecord(makeCharacter(2)),
        '   ',
      ].join('\n') + '\n';

    const parsed = await parseBackup(chunksOf(text, 11));

    expect(parsed.records.map((record) => record.id)).toEqual(['char-1', 'char-2']);
    expect(parsed.unreadable).toEqual([]);
  });

  it('counts a skipped line at its physical line, blank lines included', async () => {
    const text = [
      headerLine(),
      '',
      serializeCharacterRecord(makeCharacter(1)),
      '',
      recordLine({ id: 'blank-name', name: '   ' }),
    ].join('\r\n');

    const parsed = await parseBackup(chunksOf(`${text}\r\n`, 4));

    expect(parsed.unreadable).toEqual([{ line: 5, reason: 'the name is missing' }]);
  });
});
