import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadAttempts } from '../src/download-attempts.svelte';
import { deferred, makeCharacter } from './fixtures';

// The helper is the seam the spec names, so the tests control the promises the
// page actually awaits instead of reaching into the owner.
vi.mock('../src/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/download')>()),
  downloadCharacterImage: vi.fn(),
}));

import { downloadCharacterImage } from '../src/download';

const download = vi.mocked(downloadCharacterImage);

/** One attempt whose settlement this test decides. */
function attempt() {
  const pending = deferred<void>();
  download.mockReturnValueOnce(pending.promise);
  return pending;
}

/** Let every promise continuation queued by the owner run. */
function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const ARIA = makeCharacter(1, { name: 'Aria' });
const BRAM = makeCharacter(2, { name: 'Bram' });

describe('DownloadAttempts', () => {
  beforeEach(() => {
    // Clear the promises an earlier test queued but did not settle.
    download.mockReset();
  });

  it('reports a detected failure under the Character whose attempt failed', async () => {
    const attempts = new DownloadAttempts();
    const failing = attempt();

    attempts.start(ARIA);

    // Pending work is not an outcome, so there is nothing to show yet.
    expect(attempts.notice).toBeNull();
    expect(attempts.message).toBeNull();
    expect(download).toHaveBeenCalledWith(ARIA);

    failing.reject(new Error('invalid data URL'));
    await flush();

    expect(attempts.notice).toEqual({ characterId: 'char-1', characterName: 'Aria' });
    expect(attempts.message).toContain('Aria');
    expect(attempts.message).toMatch(/download/i);
  });

  it('treats a resolved attempt as a browser handoff, not as a saved file', async () => {
    const attempts = new DownloadAttempts();
    const handedOff = attempt();

    attempts.start(ARIA);
    handedOff.resolve();
    await flush();

    expect(attempts.notice).toBeNull();
    expect(attempts.message).toBeNull();
  });

  it('keeps the name the attempt started with', async () => {
    const attempts = new DownloadAttempts();
    const renamed = makeCharacter(1, { name: 'Aria' });
    const failing = attempt();

    attempts.start(renamed);
    renamed.name = 'Renamed while downloading';
    failing.reject(new Error('boom'));
    await flush();

    expect(attempts.notice?.characterName).toBe('Aria');
    expect(attempts.message).toContain('Aria');
    expect(attempts.message).not.toContain('Renamed while downloading');
  });

  it('keeps one failure until it is dismissed, and reports the next one', async () => {
    const attempts = new DownloadAttempts();
    const first = attempt();
    attempts.start(ARIA);
    first.reject(new Error('boom'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Aria');

    attempts.dismiss();
    expect(attempts.notice).toBeNull();
    expect(attempts.message).toBeNull();

    const second = attempt();
    attempts.start(ARIA);
    second.reject(new Error('boom again'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Aria');
  });

  it('clears the notice when a later attempt for the same Character is handed off', async () => {
    const attempts = new DownloadAttempts();
    const failing = attempt();
    attempts.start(ARIA);
    failing.reject(new Error('boom'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Aria');

    const retry = attempt();
    attempts.start(ARIA);
    retry.resolve();
    await flush();

    expect(attempts.notice).toBeNull();
    expect(attempts.message).toBeNull();
  });

  it("keeps a failure when another Character's attempt is handed off", async () => {
    const attempts = new DownloadAttempts();
    const failing = attempt();
    attempts.start(ARIA);
    failing.reject(new Error('boom'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Aria');

    const othersAttempt = attempt();
    attempts.start(BRAM);
    othersAttempt.resolve();
    await flush();

    // Unrelated work must not hide an unresolved failure.
    expect(attempts.notice?.characterName).toBe('Aria');
  });

  it('replaces the notice with a later failure for another Character', async () => {
    const attempts = new DownloadAttempts();
    const aria = attempt();
    attempts.start(ARIA);
    aria.reject(new Error('boom'));
    await flush();

    const bram = attempt();
    attempts.start(BRAM);
    bram.reject(new Error('boom'));
    await flush();

    // One most-recent failure is kept, and it is no longer attributed to Aria.
    expect(attempts.notice).toEqual({ characterId: 'char-2', characterName: 'Bram' });
    expect(attempts.message).toContain('Bram');
    expect(attempts.message).not.toContain('Aria');
  });

  it('ignores an older same-Character failure that settles after a newer handoff', async () => {
    const attempts = new DownloadAttempts();
    const older = attempt();
    attempts.start(ARIA);
    const newer = attempt();
    attempts.start(ARIA);

    newer.resolve();
    await flush();
    expect(attempts.notice).toBeNull();

    older.reject(new Error('late failure'));
    await flush();

    expect(attempts.notice).toBeNull();
  });

  it('ignores an older same-Character handoff that settles after a newer failure', async () => {
    const attempts = new DownloadAttempts();
    const older = attempt();
    attempts.start(ARIA);
    const newer = attempt();
    attempts.start(ARIA);

    newer.reject(new Error('newer failure'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Aria');

    older.resolve();
    await flush();

    expect(attempts.notice?.characterName).toBe('Aria');
  });

  it('orders overlapping attempts of different Characters independently', async () => {
    const attempts = new DownloadAttempts();
    const ariaOlder = attempt();
    attempts.start(ARIA);
    const bram = attempt();
    attempts.start(BRAM);
    const ariaNewer = attempt();
    attempts.start(ARIA);

    // Bram's outcome is irrelevant to Aria's ordering and vice versa.
    bram.reject(new Error('boom'));
    await flush();
    expect(attempts.notice?.characterName).toBe('Bram');

    ariaNewer.resolve();
    await flush();
    // Aria's handoff resolves Aria's notice only, and there is none.
    expect(attempts.notice?.characterName).toBe('Bram');

    ariaOlder.reject(new Error('late Aria failure'));
    await flush();
    // Aria's newest attempt was a handoff, so its older failure stays out.
    expect(attempts.notice?.characterName).toBe('Bram');
  });

  it('logs the detected failure it reports', async () => {
    const attempts = new DownloadAttempts();
    const failing = attempt();
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});

    attempts.start(ARIA);
    failing.reject(new Error('invalid data URL'));
    await flush();

    expect(logger).toHaveBeenCalled();
    logger.mockRestore();
  });
});
