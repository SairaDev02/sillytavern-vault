// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import BackupSection from '../src/components/BackupSection.svelte';
import { backupParts, createBackupHeader } from '../src/backup-format';
import {
  CharacterLibrary,
  type CharacterLibraryDeps,
} from '../src/character-library.svelte';
import { dbGetAll, openDB, STORE_NAME } from '../src/db';
import type { Character } from '../src/types';
import { deferred, makeCharacter } from './fixtures';

// A Restore never downloads, but the section also offers a Backup. The mock
// keeps the delivery helper out of this file's way.
vi.mock('../src/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/download')>()),
  downloadBlob: vi.fn(),
}));

const APP_DB = 'character-gallery';
const EXPORTED_AT = new Date('2026-10-31T09:15:00.000Z');

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

async function storedCharacters(name: string): Promise<Character[]> {
  const db = await openDB(name);
  const all = await dbGetAll<Character>(db);
  db.close();
  return all;
}

function makeLibrary(overrides: Partial<CharacterLibraryDeps> = {}) {
  const databaseName = `restore-section-test-${databaseCounter++}`;
  const measure = vi.fn(() => new Promise<{ width: number; height: number }>(() => {}));
  const library = new CharacterLibrary({
    databaseName,
    measure,
    logger: { warn: vi.fn(), error: vi.fn() },
    ...overrides,
  });
  return { library, databaseName, measure };
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

const waitFor = (check: () => void, timeout = 3000) =>
  vi.waitFor(check, { timeout, interval: 10 });

/** A Backup file's text: the header, the records, then any raw extra lines. */
function backupText(characters: Character[], extraLines: string[] = []): string {
  return [
    ...backupParts(characters, EXPORTED_AT),
    ...extraLines.map((line) => `${line}\n`),
  ].join('');
}

function backupFile(text: string): File {
  return new File([text], 'character-gallery-backup-2026-10-31.jsonl', {
    type: 'application/x-ndjson',
  });
}

const emptyFileList = () => ({ length: 0, item: () => null }) as unknown as FileList;

/**
 * Choose a file on a native file input. jsdom cannot assign `files` and does
 * not clear them when `value` is reset, so this double mirrors what the browser
 * does for the one assignment the component makes.
 */
function selectFile(input: HTMLInputElement, file: File): void {
  let files = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as unknown as FileList;

  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => files,
  });

  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
  Object.defineProperty(input, 'value', {
    configurable: true,
    get(this: HTMLInputElement) {
      return value.get!.call(this);
    },
    set(this: HTMLInputElement, next: string) {
      if (next === '') files = emptyFileList();
      value.set!.call(this, next);
    },
  });

  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Restore', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);
    vi.stubGlobal('confirm', vi.fn(() => true));
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    app = undefined;
    target.remove();
    vi.unstubAllGlobals();
  });

  const confirmSpy = () => vi.mocked(globalThis.confirm);
  const section = () => target.querySelector('section') as HTMLElement;
  const sectionStatus = () => section()?.querySelector('[role="status"]') as HTMLElement | null;
  const sectionAlert = () => section()?.querySelector('[role="alert"]') as HTMLElement | null;
  const statusText = () => (sectionStatus()?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const alertText = () => (sectionAlert()?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const fileInput = () =>
    section()?.querySelector('input[type="file"]') as HTMLInputElement | null;
  const backupButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Create Backup'
    ) as HTMLButtonElement | undefined;
  const buttonWithText = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  const figures = () => target.querySelectorAll('figure');
  const searchInput = () =>
    target.querySelector('input[type="search"]') as HTMLInputElement | null;

  async function waitForReady() {
    await waitFor(() => expect(buttonWithText('+ Add Character')?.disabled).toBe(false));
  }

  /** Select a file and wait for the whole attempt, including its input reset. */
  async function restoreFile(file: File) {
    const input = fileInput()!;
    selectFile(input, file);
    await settle();
    await waitFor(() => expect(fileInput()!.disabled).toBe(false));
    await settle();
  }

  it('offers a visibly labelled native file input', async () => {
    await seedDatabase(APP_DB, []);
    app = mount(App, { target });
    await waitForReady();

    const input = fileInput()!;
    expect(input).toBeDefined();
    expect(input.type).toBe('file');
    expect(input.hidden).toBe(false);
    expect(input.getAttribute('aria-hidden')).toBeNull();

    const labelledBy = input.labels?.[0]?.textContent?.replace(/\s+/g, ' ').trim();
    expect(labelledBy).toMatch(/backup file/i);
    expect(input.disabled).toBe(false);
  });

  it('restores every Character into an empty library with its stored identity', async () => {
    await seedDatabase(APP_DB, []);
    app = mount(App, { target });
    await waitForReady();
    expect(figures()).toHaveLength(0);

    const records = [
      makeCharacter(1, { name: 'Aria', createdAt: 111 }),
      makeCharacter(2, { name: 'Bram', createdAt: 222 }),
    ];
    await restoreFile(backupFile(backupText(records)));

    expect(confirmSpy()).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(statusText()).toMatch(/2 added/);
    expect(statusText()).toMatch(/0 already in your library/);

    const persisted = await storedCharacters(APP_DB);
    expect(persisted.map((character) => [character.id, character.createdAt])).toEqual([
      ['char-1', 111],
      ['char-2', 222],
    ]);
  });

  it('states the three counts in one confirmation before writing', async () => {
    const kept = makeCharacter(1, { name: 'Library copy' });
    await seedDatabase(APP_DB, [kept]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    await restoreFile(
      backupFile(
        backupText(
          [makeCharacter(1, { name: 'File copy' }), makeCharacter(2)],
          [JSON.stringify({ id: 'broken', name: 7 })]
        )
      )
    );

    expect(confirmSpy()).toHaveBeenCalledTimes(1);
    const message = confirmSpy().mock.calls[0][0] as string;
    expect(message).toMatch(/1 Character will be added/i);
    expect(message).toMatch(/1 Character already in your library will be kept/i);
    expect(message).toMatch(/1 record could not be read/i);

    // The library's copy wins, the missing one arrives, and the bad line is
    // reported rather than dropped silently.
    expect(figures()).toHaveLength(2);
    expect(statusText()).toMatch(/1 added/);
    expect(statusText()).toMatch(/1 already in your library/);
    expect(statusText()).toMatch(/1 record could not be read/);
    const persisted = await storedCharacters(APP_DB);
    expect(persisted.find((character) => character.id === 'char-1')?.name).toBe(
      'Library copy'
    );
    expect(persisted).toHaveLength(2);
  });

  it('reports each skipped record by its line and what it failed on', async () => {
    await seedDatabase(APP_DB, []);
    app = mount(App, { target });
    await waitForReady();

    // Header line 1, one good record on line 2, then a nameless record and a
    // line that is not JSON at all.
    const text = backupText([makeCharacter(1)], [
      JSON.stringify({ ...makeCharacter(2), name: '   ' }),
      'not json at all',
    ]);
    await restoreFile(backupFile(text));

    await waitFor(() => expect(figures()).toHaveLength(1));
    // The rest of the file is restored, and nothing is dropped silently.
    expect(statusText()).toMatch(/1 added/);
    expect(statusText()).toMatch(/2 records could not be read/);
    expect(statusText()).toMatch(/line 3: the name is missing/);
    expect(statusText()).toMatch(/line 4: the line is not a record/);

    const persisted = await storedCharacters(APP_DB);
    expect(persisted.map((character) => character.id)).toEqual(['char-1']);
  });

  it('writes nothing when the confirmation is canceled, and the same file can be chosen again', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    confirmSpy().mockReturnValue(false);
    const file = backupFile(backupText([makeCharacter(2)]));
    await restoreFile(file);

    expect(confirmSpy()).toHaveBeenCalledTimes(1);
    expect(statusText()).toMatch(/canceled/i);
    expect(statusText()).toMatch(/nothing was written/i);
    expect(sectionAlert()).toBeNull();
    expect(figures()).toHaveLength(1);
    expect(await storedCharacters(APP_DB)).toHaveLength(1);

    // The input was reset, so the same file is selectable again.
    expect(fileInput()!.files).toHaveLength(0);
    await restoreFile(file);
    expect(confirmSpy()).toHaveBeenCalledTimes(2);
  });

  it('adds nothing and asks nothing when every Character is already present', async () => {
    await seedDatabase(APP_DB, []);
    app = mount(App, { target });
    await waitForReady();

    const records = [makeCharacter(1), makeCharacter(2)];
    const file = backupFile(backupText(records));
    await restoreFile(file);
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(confirmSpy()).toHaveBeenCalledTimes(1);

    // Re-Restore: nothing would be added, so nothing is written and no
    // confirmation interrupts.
    await restoreFile(file);

    expect(confirmSpy()).toHaveBeenCalledTimes(1);
    expect(statusText()).toMatch(/nothing was written/i);
    expect(statusText()).toMatch(/0 added/);
    expect(statusText()).toMatch(/2 already in your library/i);
    expect(figures()).toHaveLength(2);
    expect(await storedCharacters(APP_DB)).toHaveLength(2);
  });

  it('refuses a file that is not a Backup with nothing written', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    await restoreFile(backupFile('This is a text file, not a Backup\n'));

    expect(confirmSpy()).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/not a Character Gallery Backup/i);
    expect(statusText()).toBe('');
    expect(figures()).toHaveLength(1);
    expect(await storedCharacters(APP_DB)).toHaveLength(1);
  });

  it('names the declared version of a file it cannot restore', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const header = JSON.stringify({ ...createBackupHeader(EXPORTED_AT), formatVersion: 2 });
    await restoreFile(backupFile(`${header}\n`));

    expect(confirmSpy()).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/format version 2/i);
    expect(await storedCharacters(APP_DB)).toHaveLength(1);
  });

  it('reports a file whose records could not be read, writing nothing', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const text = backupText([], [
      JSON.stringify({ ...makeCharacter(2), name: 7 }),
      JSON.stringify({ ...makeCharacter(3), image: 'data:text/plain;base64,aGVsbG8=' }),
    ]);
    await restoreFile(backupFile(text));

    expect(confirmSpy()).not.toHaveBeenCalled();
    expect(statusText()).toMatch(/nothing was written/i);
    expect(statusText()).toMatch(/2 records could not be read/);
    expect(statusText()).toMatch(/line 2: the name is missing/);
    expect(statusText()).toMatch(/line 3: the image is not an image/);
    expect(sectionAlert()).toBeNull();
    expect(figures()).toHaveLength(1);
    expect(await storedCharacters(APP_DB)).toHaveLength(1);
  });

  it('refuses a file that carries one identity twice and writes nothing', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const text = backupText([
      makeCharacter(2),
      makeCharacter(3),
      makeCharacter(2, { name: 'Second copy' }),
    ]);
    await restoreFile(backupFile(text));

    expect(confirmSpy()).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/damaged/i);
    expect(alertText()).toMatch(/same Character id/i);
    expect(statusText()).toBe('');
    expect(figures()).toHaveLength(1);
    expect(await storedCharacters(APP_DB)).toHaveLength(1);
  });

  it('shows a busy state while reading and validating, with no cancel control', async () => {
    const release = deferred<void>();
    async function* gatedRead(file: File): AsyncGenerator<string> {
      yield await file.text();
      await release.promise;
    }
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    app = mount(BackupSection, { target, props: { library, readFile: gatedRead } });
    await settle();

    confirmSpy().mockReturnValue(false);
    selectFile(fileInput()!, backupFile(backupText([makeCharacter(2)])));
    await settle();

    expect(section().getAttribute('aria-busy')).toBe('true');
    expect(fileInput()!.disabled).toBe(true);
    expect(backupButton()!.disabled).toBe(true);
    expect(statusText()).toMatch(/reading/i);
    expect(sectionStatus()!.getAttribute('aria-live')).toBe('polite');
    expect(buttonWithText('Cancel')).toBeUndefined();
    expect(confirmSpy()).not.toHaveBeenCalled();

    release.resolve();
    await waitFor(() => expect(confirmSpy()).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(section().getAttribute('aria-busy')).not.toBe('true'));
    expect(fileInput()!.disabled).toBe(false);
    expect(fileInput()!.files).toHaveLength(0);
  });

  it('keeps Backup disabled while a Restore holds the section', async () => {
    const release = deferred<void>();
    async function* gatedRead(file: File): AsyncGenerator<string> {
      yield await file.text();
      await release.promise;
    }
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    app = mount(BackupSection, { target, props: { library, readFile: gatedRead } });
    await settle();

    selectFile(fileInput()!, backupFile(backupText([makeCharacter(2)])));
    await settle();

    const button = backupButton()!;
    expect(button.disabled).toBe(true);
    const describedBy = button.getAttribute('aria-describedby');
    expect(
      target.querySelector(`[id="${describedBy}"]`)?.textContent
    ).toMatch(/restore is in progress/i);

    release.resolve();
    await waitFor(() => expect(confirmSpy()).toHaveBeenCalledTimes(1));
  });

  it('reports a failed write as an inline alert and leaves the library unchanged', async () => {
    const { library, databaseName } = makeLibrary({
      writeMany: vi.fn(async () => {
        throw new Error('quota exceeded');
      }),
    });
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    app = mount(BackupSection, { target, props: { library } });
    await settle();

    await restoreFile(backupFile(backupText([makeCharacter(2)])));

    expect(confirmSpy()).toHaveBeenCalledTimes(1);
    expect(sectionAlert()).not.toBeNull();
    expect(alertText()).toMatch(/could not be restored/i);
    expect(alertText()).toMatch(/nothing was written/i);
    expect(statusText()).toBe('');
    expect(await storedCharacters(databaseName)).toHaveLength(1);
  });

  it('leaves the Gallery view and the focus alone', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1), makeCharacter(2), makeCharacter(3)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(3));

    const search = searchInput()!;
    search.value = 'Character 1';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const sort = target.querySelector('select') as HTMLSelectElement;
    sort.value = 'oldest';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    search.focus();
    await settle();

    await restoreFile(
      backupFile(
        backupText([makeCharacter(9)], [JSON.stringify({ ...makeCharacter(10), name: 7 })])
      )
    );
    await waitFor(() => expect(figures()).toHaveLength(1));
    expect(statusText()).toMatch(/line 3: the name is missing/);

    // The same search input and the same sort, not a remounted Gallery.
    expect(searchInput()).toBe(search);
    expect(search.value).toBe('Character 1');
    expect(target.querySelector('select')).toBe(sort);
    expect(sort.value).toBe('oldest');
    expect(document.activeElement).toBe(search);
  });

  it('keeps a batch selection across a Restore', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1), makeCharacter(2)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(2));

    buttonWithText('Select')!.click();
    await settle();
    const checkbox = target.querySelector(
      'input[type="checkbox"][aria-label="Select Character 1"]'
    ) as HTMLInputElement;
    checkbox.click();
    await settle();
    expect(target.textContent).toMatch(/1 selected/);

    await restoreFile(backupFile(backupText([makeCharacter(9)])));
    await waitFor(() => expect(figures()).toHaveLength(3));

    expect(target.textContent).toMatch(/1 selected/);
    expect(
      target.querySelector('input[type="checkbox"][aria-label="Select Character 1"]')
    ).toBe(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('leaves an open Character form and its draft in place', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    app = mount(App, { target });
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(1));

    buttonWithText('+ Add Character')!.click();
    await settle();
    const nameInput = target.querySelector<HTMLInputElement>('#char-name')!;
    nameInput.value = 'Draft Character';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    await restoreFile(backupFile(backupText([makeCharacter(2)])));

    expect(target.querySelector('#char-name')).toBe(nameInput);
    expect(nameInput.value).toBe('Draft Character');
    expect(await storedCharacters(APP_DB)).toHaveLength(2);
  });
});
