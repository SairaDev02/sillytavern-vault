// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import BackupSection from '../src/components/BackupSection.svelte';
import { CharacterLibrary } from '../src/character-library.svelte';
import { PersistentStorage } from '../src/persistent-storage.svelte';
import { openDB, STORE_NAME } from '../src/db';
import type { Character } from '../src/types';
import { makeCharacter } from './fixtures';

// The Backup's own delivery seam, so this file can prove a denied protection
// answer does not gate a Backup. The helper's behaviour is pinned elsewhere.
vi.mock('../src/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/download')>()),
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '../src/download';

const download = vi.mocked(downloadBlob);

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

let databaseCounter = 0;

async function seedDatabase(name: string, characters: Character[]): Promise<void> {
  const db = await openDB(name);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const character of characters) store.put(character);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

/**
 * A library on its own database. Measurement never settles, so a background
 * size repair can never race the assertions.
 */
function makeLibrary() {
  const databaseName = `storage-protection-test-${databaseCounter++}`;
  const library = new CharacterLibrary({
    databaseName,
    measure: vi.fn(() => new Promise<{ width: number; height: number }>(() => {})),
    logger: { warn: vi.fn(), error: vi.fn() },
  });
  return { library, databaseName };
}

/** The two browser answers the module asks for, under test control. */
function makeProtection(answers: {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}) {
  const persisted = vi.fn(answers.persisted);
  const persist = vi.fn(answers.persist);
  const protection = new PersistentStorage({
    // A seam passed as `undefined` means "this browser does not report it".
    ...(answers.persisted === undefined ? { persisted: undefined } : { persisted }),
    ...(answers.persist === undefined ? { persist: undefined } : { persist }),
    logger: { warn: vi.fn(), error: vi.fn() },
  });
  return { protection, persisted, persist };
}

/** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

const waitFor = (check: () => void, timeout = 3000) =>
  vi.waitFor(check, { timeout, interval: 10 });

describe('Browser eviction protection', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;
  const realStorage = Object.getOwnPropertyDescriptor(window.navigator, 'storage');

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);
    vi.stubGlobal('confirm', vi.fn(() => true));
    download.mockReset();
    download.mockReturnValue(undefined);
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    app = undefined;
    target.remove();
    if (realStorage) Object.defineProperty(window.navigator, 'storage', realStorage);
    else Reflect.deleteProperty(window.navigator, 'storage');
    vi.unstubAllGlobals();
  });

  const section = () => target.querySelector('section') as HTMLElement | null;
  const buttonWithText = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  const addButton = () => buttonWithText('+ Add Character');
  const backupButton = () => buttonWithText('Create Backup');
  const tryAgainButton = () => buttonWithText('Try again');

  const politeRegions = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')].filter(
      (element) => element.getAttribute('aria-live') !== 'off'
    );

  /**
   * The polite line that answers the storage question. Every one of its four
   * answers speaks about protection, and the Backup's own status never does.
   */
  const protectionLine = () =>
    section() === null
      ? undefined
      : politeRegions(section()!).find((element) => /protect/i.test(element.textContent ?? ''));

  const protectionText = () => (protectionLine()?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function startSection(library: CharacterLibrary, protection: PersistentStorage) {
    app = mount(BackupSection, { target, props: { library, protection } });
    await settle();
  }

  /** Put a browser storage manager behind `navigator.storage` for a page test. */
  function stubBrowserStorage(manager: { persisted?: unknown; persist?: unknown }) {
    Object.defineProperty(window.navigator, 'storage', { configurable: true, value: manager });
  }

  it('asks the browser once, and only after the library is ready', async () => {
    const persisted = vi.fn(async () => false);
    const persist = vi.fn(async () => true);
    stubBrowserStorage({ persisted, persist });
    await seedDatabase('character-gallery', [makeCharacter(1)]);

    app = mount(App, { target });

    // The page is still starting up, so it has asked nothing yet.
    expect(backupButton()).toBeUndefined();
    expect(persisted).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    await waitFor(() => expect(addButton()?.disabled).toBe(false));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persisted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(protectionText()).toMatch(/will not clear your library/i));

    // Later renders, and the section's own mount, do not ask again.
    await settle();
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not request protection when the origin is already protected', async () => {
    const persisted = vi.fn(async () => true);
    const persist = vi.fn(async () => true);
    stubBrowserStorage({ persisted, persist });
    await seedDatabase('character-gallery', [makeCharacter(1)]);

    app = mount(App, { target });
    await waitFor(() => expect(addButton()?.disabled).toBe(false));
    await waitFor(() => expect(protectionText()).toMatch(/will not clear your library/i));

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks only once a failed start-up finally becomes ready', async () => {
    const persisted = vi.fn(async () => false);
    const persist = vi.fn(async () => false);
    stubBrowserStorage({ persisted, persist });
    await seedDatabase('character-gallery', [makeCharacter(1)]);

    // A failed start-up must not ask: there is no ready library to protect yet.
    const workingIndexedDb = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', {
      open() {
        throw new Error('storage blocked');
      },
    });

    app = mount(App, { target });
    await waitFor(() => expect(buttonWithText('Retry')).toBeDefined());
    expect(persisted).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    vi.stubGlobal('indexedDB', workingIndexedDb);
    buttonWithText('Retry')!.click();

    await waitFor(() => expect(addButton()?.disabled).toBe(false));
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    expect(persisted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));
  });

  const ANSWERS = [
    {
      name: 'protected',
      persisted: async () => true,
      persist: async () => true,
      report: /will not clear your library/i,
      advice: undefined as RegExp | undefined,
      retryable: false,
    },
    {
      name: 'not protected',
      persisted: async () => false,
      persist: async () => false,
      report: /has not protected this site/i,
      advice: /Backup/i,
      retryable: true,
    },
    {
      name: 'not reported by this browser',
      persisted: undefined,
      persist: undefined,
      report: /does not report storage protection/i,
      advice: /Backup/i,
      retryable: false,
    },
    {
      name: 'check failed',
      persisted: async (): Promise<boolean> => {
        throw new Error('storage manager blocked');
      },
      persist: undefined,
      report: /did not finish/i,
      advice: /try again/i,
      retryable: true,
    },
  ];

  for (const answer of ANSWERS) {
    it(`reports "${answer.name}" in words a person can act on`, async () => {
      const { protection } = makeProtection(answer);
      await startSection(makeLibrary().library, protection);

      protection.requestOnce();
      await waitFor(() => expect(protectionText()).toMatch(answer.report));

      const line = protectionLine()!;
      expect(line.getAttribute('aria-live')).toBe('polite');
      // The answer is inside the Backup section, in its own polite line.
      expect(section()!.contains(line)).toBe(true);
      // It never shares a live region with the Backup's own feedback.
      const backupStatus = politeRegions(section()!).filter(
        (element) => element !== line && element.getAttribute('role') === 'status'
      );
      expect(backupStatus.every((element) => !/protect/i.test(element.textContent ?? ''))).toBe(
        true
      );

      if (answer.advice) expect(protectionText()).toMatch(answer.advice);
      expect(tryAgainButton() !== undefined).toBe(answer.retryable);
    });
  }

  it('issues one request per try-again activation and follows the new answer', async () => {
    const persisted = vi.fn(async () => false);
    // Denied first, then granted.
    const persist = vi.fn(async () => false);
    const protection = new PersistentStorage({
      persisted,
      persist,
      logger: { warn: vi.fn(), error: vi.fn() },
    });
    await startSection(makeLibrary().library, protection);

    protection.requestOnce();
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);

    persist.mockImplementationOnce(async () => true);
    tryAgainButton()!.click();
    await waitFor(() => expect(protectionText()).toMatch(/will not clear your library/i));
    expect(persisted).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(2);

    // Nothing left to ask for once the answer is protected.
    expect(tryAgainButton()).toBeUndefined();
  });

  it('does not queue a second request while one is pending', async () => {
    let release!: (value: boolean) => void;
    const persisted = vi.fn(async () => false);
    const persist = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const protection = new PersistentStorage({
      persisted,
      persist,
      logger: { warn: vi.fn(), error: vi.fn() },
    });
    await startSection(makeLibrary().library, protection);

    protection.requestOnce();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    // A second activation while the first is unanswered adds no request.
    protection.retry();
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    release(false);
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));

    // The next activation after the answer is one request again.
    persist.mockImplementationOnce(async () => false);
    tryAgainButton()!.click();
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
  });

  it('is a view: mounting the section never asks the browser by itself', async () => {
    const { protection, persisted, persist } = makeProtection({
      persisted: async () => false,
      persist: async () => true,
    });
    await startSection(makeLibrary().library, protection);

    expect(persisted).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(tryAgainButton()).toBeUndefined();

    // The page's request drives it, and the answer appears in this section.
    protection.requestOnce();
    await waitFor(() => expect(protectionText()).toMatch(/will not clear your library/i));
    expect(persisted).toHaveBeenCalledTimes(1);
  });

  it('keeps the page-wide answer when the section is mounted again', async () => {
    const { protection, persisted } = makeProtection({
      persisted: async () => false,
      persist: async () => true,
    });
    await startSection(makeLibrary().library, protection);
    protection.requestOnce();
    await waitFor(() => expect(protectionText()).toMatch(/will not clear your library/i));

    // A failed start-up and Retry remount the section; the one request and its
    // answer belong to the page, not to one mount.
    unmount(app!);
    app = undefined;
    await startSection(makeLibrary().library, protection);

    expect(protectionText()).toMatch(/will not clear your library/i);
    expect(persisted).toHaveBeenCalledTimes(1);
  });

  it('announces a state change politely without moving focus', async () => {
    const { protection } = makeProtection({
      persisted: async () => false,
      persist: async () => false,
    });
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library, protection);
    protection.requestOnce();
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));

    const retry = tryAgainButton()!;
    const backup = backupButton()!;
    backup.focus();
    expect(retry.tagName).toBe('BUTTON');
    expect(retry.getAttribute('type')).toBe('button');
    expect(retry.tabIndex).toBe(0);
    expect(retry.disabled).toBe(false);
    // The visible words are part of the accessible name.
    expect(retry.getAttribute('aria-label') ?? retry.textContent).toMatch(/try again/i);

    retry.click();
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));
    await settle();

    // Nothing focused the answer: the user keeps their place.
    expect(document.activeElement).toBe(backup);
    expect(politeRegions(section()!).filter((el) => /protect/i.test(el.textContent ?? ''))).toHaveLength(
      1
    );
  });

  it('leaves the Backup fully working when protection is denied', async () => {
    const { protection, persist } = makeProtection({
      persisted: async () => false,
      persist: async () => false,
    });
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library, protection);
    protection.requestOnce();
    await waitFor(() => expect(protectionText()).toMatch(/has not protected this site/i));

    // A denial changes nothing: the Backup is offered, and it runs.
    expect(backupButton()!.disabled).toBe(false);
    expect(section()!.getAttribute('aria-busy')).not.toBe('true');

    backupButton()!.click();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0][1]).toMatch(/^character-gallery-backup-.*\.jsonl$/);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
