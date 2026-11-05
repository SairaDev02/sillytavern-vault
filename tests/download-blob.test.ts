// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OBJECT_URL_LIFETIME_MS,
  downloadBlob,
  downloadCharacterImage,
} from '../src/download';
import { OBJECT_URL, installDownloadHandoff, type DownloadHandoff } from './download-handoff';
import { makeCharacter } from './fixtures';

/**
 * How the page hands a file to the browser. The Backup and the per-card image
 * download share this path, including how long the object URL lives, so the
 * schedule is pinned once here.
 */
describe('downloadBlob', () => {
  let handoff: DownloadHandoff;

  beforeEach(() => {
    vi.useFakeTimers();
    handoff = installDownloadHandoff();
  });

  afterEach(() => {
    vi.useRealTimers();
    handoff.restore();
  });

  it('delivers the blob through a temporary link and leaves no link behind', () => {
    const blob = new Blob(['{"format":"character-gallery/backup"}\n'], {
      type: 'application/x-ndjson',
    });

    downloadBlob(blob, 'character-gallery-backup-2026-10-31.jsonl');

    expect(handoff.createObjectURL).toHaveBeenCalledWith(blob);
    expect(handoff.clicks).toHaveLength(1);
    expect(handoff.clicks[0].download).toBe('character-gallery-backup-2026-10-31.jsonl');
    expect(handoff.clicks[0].href).toBe(OBJECT_URL);
    expect(document.body.contains(handoff.clicks[0])).toBe(false);
  });

  it('releases the object URL after the shared delay, not immediately', () => {
    downloadBlob(new Blob(['x']), 'backup.jsonl');

    // Releasing before the browser reads the blob can cancel the download.
    expect(handoff.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS - 1);
    expect(handoff.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(handoff.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });

  it('keeps the per-card image download on the same release schedule', async () => {
    await downloadCharacterImage(makeCharacter(1));

    expect(handoff.createObjectURL).toHaveBeenCalledTimes(1);
    expect(handoff.clicks).toHaveLength(1);
    expect(handoff.clicks[0].download).toBe('Character 1.png');
    expect(handoff.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(handoff.revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });
});
