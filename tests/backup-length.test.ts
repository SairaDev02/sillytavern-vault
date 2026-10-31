import { describe, expect, it } from 'vitest';
import {
  BackupRecordError,
  backupParts,
  serializeCharacterRecord,
} from '../src/backup-format';
import type { Character } from '../src/types';
import { makeCharacter } from './fixtures';

/**
 * A Backup may only carry record lines a Restore can read, so one record that
 * cannot go into the file refuses the whole Backup before the browser sees it
 * and names the Character responsible. The bound is the reader's own constant,
 * reached here through the same `maxLineLength` option a Restore takes, so
 * these tests stay fast and exact.
 */

const EXPORTED_AT = new Date('2026-10-31T09:15:00.000Z');

const aria = makeCharacter(1, { name: 'Aria' });

/** The line as the file carries it: the serialized record without its newline. */
const recordLine = (character: Character): string => serializeCharacterRecord(character);

/** The error `run` threw, or null when it did not throw. */
const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
};

/** Synthetic field-access failure; this does not reproduce an engine string limit. */
function unwritable(): Character {
  const character = makeCharacter(6, { name: 'Too big to write' });
  Object.defineProperty(character, 'image', {
    get() {
      throw new RangeError('Synthetic field-access failure');
    },
  });
  return character;
}

describe('Backup record-line bound', () => {
  it('accepts a record line exactly at the bound', () => {
    const line = recordLine(aria);

    const parts = backupParts([aria], EXPORTED_AT, { maxLineLength: line.length });

    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe(`${line}\n`);
    // The newline the writer adds is not part of the line a reader measures.
    expect(parts[1].length - 1).toBe(line.length);
  });

  it('refuses the whole Backup one character past the bound', () => {
    const line = recordLine(aria);

    const error = thrownBy(() =>
      backupParts([aria], EXPORTED_AT, { maxLineLength: line.length - 1 })
    );

    expect(error).toBeInstanceOf(BackupRecordError);
  });

  it('refuses the Backup even though other records would fit', () => {
    const small = makeCharacter(2, { name: 'Bram' });
    const oversized = makeCharacter(1, { name: 'Aria', description: 'x'.repeat(100) });
    const bound = recordLine(small).length;

    // The oversized record is not the first one, so a writer that handed parts
    // out as it went would already have produced a partial file.
    const error = thrownBy(() =>
      backupParts([small, oversized], EXPORTED_AT, { maxLineLength: bound })
    );

    expect(error).toBeInstanceOf(BackupRecordError);
    expect((error as Error).message).toContain('"Aria"');
  });

  it('names the oversized Character and states the outcome', () => {
    const line = recordLine(aria);
    const bound = line.length - 1;

    const error = thrownBy(() =>
      backupParts([aria], EXPORTED_AT, { maxLineLength: bound })
    ) as Error;

    expect(error.message).toContain('"Aria"');
    expect(error.message).toContain('too large for one record line');
    expect(error.message).toMatch(/Restore can read/i);
    expect(error.message).toMatch(/nothing was downloaded/i);
    expect(error.message).toMatch(/unchanged/i);
    // Any field can make a record too large, so the advice names no cause.
    expect(error.message).toContain('text or image');
    expect(error.message).not.toMatch(/smaller image/i);
    expect(error.message).toMatch(/try again/i);
  });

  it('abbreviates a long Character name in the refusal', () => {
    const name = 'A'.repeat(200);
    const character = makeCharacter(9, { name, description: 'x'.repeat(300) });

    const error = thrownBy(() =>
      backupParts([character], EXPORTED_AT, { maxLineLength: 250 })
    ) as Error;

    expect(error.message).toContain(`${'A'.repeat(100)}…`);
    expect(error.message).not.toContain(name);
    expect(error.message.length).toBeLessThan(500);
  });

  it('refuses a record whose stored fields alone are past the bound', () => {
    // The huge case the bound exists for: the line would dwarf anything a
    // Restore reads, so the record is refused without being built.
    const huge = makeCharacter(8, { name: 'Huge', description: 'x'.repeat(200_000) });

    const error = thrownBy(() =>
      backupParts([huge], EXPORTED_AT, { maxLineLength: 100_000 })
    ) as Error;

    expect(error).toBeInstanceOf(BackupRecordError);
    expect(error.message).toContain('"Huge"');
    expect(error.message).toContain('too large for one record line');
  });

  it('also refuses a line that only escaping pushes past the bound', () => {
    // Every stored field fits the bound below, so only the serialized line's
    // own length can refuse this record.
    const escaped = makeCharacter(4, { name: 'Escaped', description: '\t"\n'.repeat(50) });
    const line = recordLine(escaped);
    const bound = line.length - 1;

    const error = thrownBy(() =>
      backupParts([escaped], EXPORTED_AT, { maxLineLength: bound })
    );

    expect(error).toBeInstanceOf(BackupRecordError);
    expect((error as Error).message).toContain('"Escaped"');
    // The escaped line is accepted at its own length and refused one short.
    expect(backupParts([escaped], EXPORTED_AT, { maxLineLength: line.length })).toHaveLength(2);
  });

  it('leaves the records it was given untouched', () => {
    const library = [aria, makeCharacter(5, { name: 'Cy' })];
    const snapshot = JSON.stringify(library);

    const error = thrownBy(() =>
      backupParts([...library, aria], EXPORTED_AT, { maxLineLength: recordLine(aria).length - 1 })
    );

    expect(error).toBeInstanceOf(BackupRecordError);
    expect(JSON.stringify(library)).toBe(snapshot);
  });
});

describe('a synthetic record field-access failure', () => {
  it('refuses the Backup and names the Character, at the production bound', () => {
    // No bound is passed, so this runs under the real reader's bound.
    const error = thrownBy(() => backupParts([unwritable()], EXPORTED_AT));

    expect(error).toBeInstanceOf(BackupRecordError);
    const message = (error as Error).message;
    expect(message).toContain('"Too big to write"');
    expect(message).toMatch(/could not be written/i);
    expect(message).toMatch(/nothing was downloaded/i);
    expect(message).toMatch(/unchanged/i);
    // The cause is unknown, so this refusal claims no size at all.
    expect(message).not.toMatch(/too large|characters|a Restore reads/i);
  });

  it('keeps the field-access failure as the cause', () => {
    const error = thrownBy(() => backupParts([unwritable()], EXPORTED_AT));

    expect((error as BackupRecordError).cause).toBeInstanceOf(RangeError);
  });

  it('refuses the Backup even when a writable record comes first', () => {
    const error = thrownBy(() => backupParts([aria, unwritable()], EXPORTED_AT));

    expect(error).toBeInstanceOf(BackupRecordError);
    expect((error as Error).message).toContain('"Too big to write"');
  });
});
