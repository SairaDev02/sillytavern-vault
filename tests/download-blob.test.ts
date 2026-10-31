// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OBJECT_URL_LIFETIME_MS,
  downloadBlob,
  downloadCharacterImage,
} from '../src/download';
import { makeCharacter } from './fixtures';

/**
 * How the page hands a file to the browser. The Backup and the per-card image
 * download share this path, including how long the object URL lives, so the
 * schedule is pinned once here.
 */
const OBJECT_URL = 'blob:character-gallery-download';

function replaceUrlMethod(name: 'createObjectURL' | 'revokeObjectURL', value: unknown): void {
  Object.defineProperty(URL, name, { configurable: true, writable: true, value });
}

describe('downloadBlob', () => {
  const createObjectURL = vi.fn(() => OBJECT_URL);
  const revokeObjectURL = vi.fn();
  let clicks: HTMLAnchorElement[] = [];
  let originalCreate: PropertyDescriptor | undefined;
  let originalRevoke: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    clicks = [];
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    replaceUrlMethod('createObjectURL', createObjectURL);
    replaceUrlMethod('revokeObjectURL', revokeObjectURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('delivers the blob through a temporary link and leaves no link behind', () => {
    const blob = new Blob(['{"format":"character-gallery/backup"}\n'], {
      type: 'application/x-ndjson',
    });

    downloadBlob(blob, 'character-gallery-backup-2026-10-31.jsonl');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('character-gallery-backup-2026-10-31.jsonl');
    expect(clicks[0].href).toBe(OBJECT_URL);
    expect(document.body.contains(clicks[0])).toBe(false);
  });

  it('releases the object URL after the shared delay, not immediately', () => {
    downloadBlob(new Blob(['x']), 'backup.jsonl');

    // Releasing before the browser reads the blob can cancel the download.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });

  it('keeps the per-card image download on the same release schedule', async () => {
    await downloadCharacterImage(makeCharacter(1));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('Character 1.png');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });
});
