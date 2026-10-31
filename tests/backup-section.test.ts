// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import packageJson from '../package.json';
import App from '../src/App.svelte';
import BackupSection from '../src/components/BackupSection.svelte';
import {
  CharacterLibrary,
  type CharacterLibraryDeps,
} from '../src/character-library.svelte';
import { dbAdd, openDB, STORE_NAME } from '../src/db';
import type { Character } from '../src/types';
import { deferred, makeCharacter, PNG_1X1 } from './fixtures';

// The download seam: a Backup hands one Blob and one file name to the shared
// delivery helper. How that helper releases the object URL is pinned in
// `tests/download-blob.test.ts`.
vi.mock('../src/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/download')>()),
  downloadBlob: vi.fn(),
}));

import { downloadBlob } from '../src/download';

const download = vi.mocked(downloadBlob);

const APP_DB = 'character-gallery';
const SECTION_HEADING = 'Backup and restore';
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
 * A library on its own database. Measurement never settles unless a test
 * supplies it, so a background repair can never race the assertions.
 */
function makeLibrary(overrides: Partial<CharacterLibraryDeps> = {}) {
  const databaseName = `backup-section-test-${databaseCounter++}`;
  const measure = vi.fn(
    () => new Promise<{ width: number; height: number }>(() => {})
  );
  const library = new CharacterLibrary({
    databaseName,
    measure,
    logger: { warn: vi.fn(), error: vi.fn() },
    ...overrides,
  });
  return { library, databaseName, measure };
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

/** The local calendar day, as the file name must show it. */
function localDate(now = new Date()): string {
  const pad = (value: number) => `${value}`.padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe('Backup section', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

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
    vi.unstubAllGlobals();
  });

  const backupButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Create Backup'
    ) as HTMLButtonElement | undefined;

  const section = () => target.querySelector('section');
  const sectionStatus = () =>
    section()?.querySelector('[role="status"]') as HTMLElement | null;
  const sectionAlert = () => section()?.querySelector('[role="alert"]') as HTMLElement | null;
  const statusText = () => (sectionStatus()?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const figures = () => target.querySelectorAll('figure');
  const buttonWithText = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  const addButton = () => buttonWithText('+ Add Character');

  const liveRegions = () =>
    [...target.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')].filter(
      (element) => element.getAttribute('aria-live') !== 'off'
    );

  async function waitForReady() {
    await waitFor(() => expect(addButton()?.disabled).toBe(false));
  }

  function startApp() {
    app = mount(App, { target });
  }

  async function startSection(library: CharacterLibrary) {
    app = mount(BackupSection, { target, props: { library } });
    await settle();
  }

  /** The file a completed Backup handed over, line by line. */
  async function deliveredLines(): Promise<unknown[]> {
    expect(download).toHaveBeenCalledTimes(1);
    const [blob] = download.mock.calls[0];
    const text = await blob.text();
    return text
      .replace(/\n+$/, '')
      .split('\n')
      .map((line) => JSON.parse(line));
  }

  it('appears only once the library is ready', async () => {
    startApp();

    // The page is still loading, so there is nothing to back up yet.
    expect(backupButton()).toBeUndefined();

    await waitForReady();

    expect(backupButton()).toBeDefined();
  });

  it('is labelled and keyboard operable', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1)]);
    startApp();
    await waitForReady();

    const region = section()!;
    const labelledBy = region.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(target.querySelector(`[id="${labelledBy}"]`)?.textContent?.trim()).toBe(
      SECTION_HEADING
    );

    const button = backupButton()!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent?.trim()).toBe('Create Backup');
    expect(button.tabIndex).toBe(0);
    expect(button.disabled).toBe(false);
  });

  it('is disabled with a visible reason when the library has no Characters', async () => {
    await seedDatabase(APP_DB, []);
    startApp();
    await waitForReady();

    const button = backupButton()!;
    expect(button.disabled).toBe(true);

    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const reason = target.querySelector(`[id="${describedBy}"]`) as HTMLElement | null;
    expect(reason?.textContent).toMatch(/no Characters/i);
    // A visible reason, not text only a screen reader receives.
    expect(reason?.closest('.sr-only')).toBeNull();

    await button.click();
    await settle();
    expect(download).not.toHaveBeenCalled();
  });

  it('creates a version-1 file from the stored Characters', async () => {
    const aria = makeCharacter(1, { name: 'Aria', width: 832, height: 1216 });
    const bram = makeCharacter(2, { name: 'Bram', width: undefined, height: undefined });
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [aria, bram]);
    await library.initialize();
    await startSection(library);

    backupButton()!.click();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));

    const fileName = download.mock.calls[0][1];
    expect(fileName).toBe(`character-gallery-backup-${localDate()}.jsonl`);

    const lines = (await deliveredLines()) as Array<Record<string, unknown>>;
    const header = lines[0];
    expect(header).toMatchObject({
      format: 'character-gallery/backup',
      formatVersion: 1,
      appVersion: packageJson.version,
    });
    expect(String(header.exportedAt)).toMatch(ISO_TIMESTAMP);

    expect(lines.slice(1)).toEqual([
      {
        id: aria.id,
        name: 'Aria',
        description: aria.description,
        image: PNG_1X1,
        width: 832,
        height: 1216,
        createdAt: aria.createdAt,
      },
      {
        id: bram.id,
        name: 'Bram',
        description: bram.description,
        image: PNG_1X1,
        createdAt: bram.createdAt,
      },
    ]);
  });

  it('shows the busy status before it starts building the file', async () => {
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library);

    backupButton()!.click();
    // Flush state updates only, with no timer: the busy status has to be on the
    // page while the file is still being built, not only after the handoff.
    await settle();

    expect(download).not.toHaveBeenCalled();
    expect(statusText()).toMatch(/preparing/i);
    expect(backupButton()!.disabled).toBe(true);

    await waitFor(() => expect(statusText()).toMatch(/handed to your browser/i));
  });

  it('waits for an accepted save and is disabled while it does', async () => {    const gate = deferred<void>();
    const { library, databaseName } = makeLibrary({
      write: vi.fn(async (database, record) => {
        await gate.promise;
        return dbAdd(database, record);
      }),
    });
    await seedDatabase(databaseName, [makeCharacter(1, { name: 'Stored' })]);
    await library.initialize();
    await startSection(library);

    const save = library.save({
      name: 'Just saved',
      description: 'Arrived after the Backup was asked for',
      image: PNG_1X1,
      width: 4,
      height: 3,
    });
    await settle();

    backupButton()!.click();
    await settle();

    // The save is accepted but not committed, so the Backup waits for it.
    const button = backupButton()!;
    expect(button.disabled).toBe(true);
    expect(section()!.getAttribute('aria-busy')).toBe('true');
    expect(statusText()).toMatch(/preparing/i);
    expect(
      target.querySelector(`[id="${button.getAttribute('aria-describedby')}"]`)?.textContent
    ).toMatch(/in progress/i);
    expect(download).not.toHaveBeenCalled();

    gate.resolve();
    await save;
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));

    const lines = (await deliveredLines()) as Array<Record<string, unknown>>;
    expect(lines.slice(1).map((line) => line.name)).toEqual(['Stored', 'Just saved']);

    expect(backupButton()!.disabled).toBe(false);
    expect(section()!.getAttribute('aria-busy')).not.toBe('true');
  });

  it('reports the handoff, not proof the file was saved, and moves no focus', async () => {
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library);

    const button = backupButton()!;
    button.focus();
    button.click();
    await waitFor(() => expect(statusText()).toMatch(/handed to your browser/i));

    expect(sectionStatus()!.getAttribute('aria-live')).toBe('polite');
    expect(statusText()).toMatch(/download/i);
    expect(statusText()).not.toMatch(/saved to your (computer|disk|device)/i);
    expect(document.activeElement).toBe(button);
    expect(sectionAlert()).toBeNull();
  });

  it('leaves an open Character form and its draft in place', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1), makeCharacter(2)]);
    startApp();
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(2));

    buttonWithText('+ Add Character')!.click();
    await settle();
    const nameInput = target.querySelector<HTMLInputElement>('#char-name')!;
    nameInput.value = 'Draft Character';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    backupButton()!.click();
    await waitFor(() => expect(statusText()).toMatch(/handed to your browser/i));

    // The Backup is available mid-form and the draft is untouched.
    expect(target.querySelector('#char-name')).toBe(nameInput);
    expect(nameInput.value).toBe('Draft Character');
  });

  it('leaves the Gallery mounted and announces the handoff once, inside the section', async () => {
    await seedDatabase(APP_DB, [makeCharacter(1), makeCharacter(2)]);
    startApp();
    await waitForReady();
    await waitFor(() => expect(figures()).toHaveLength(2));

    const firstCard = figures()[0];
    const button = backupButton()!;
    button.focus();
    button.click();
    await waitFor(() => expect(statusText()).toMatch(/handed to your browser/i));

    // Nothing was remounted and no page-level notice repeats the handoff.
    expect(figures()[0]).toBe(firstCard);
    const announcing = liveRegions().filter((element) =>
      /handed to your browser/i.test(element.textContent ?? '')
    );
    expect(announcing).toHaveLength(1);
    expect(section()!.contains(announcing[0])).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('reports a failed handoff as an inline alert and stays usable', async () => {
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library);

    download.mockImplementationOnce(() => {
      throw new Error('object URLs are blocked');
    });

    const button = backupButton()!;
    button.click();
    await waitFor(() => expect(sectionAlert()).not.toBeNull());

    const alert = sectionAlert()!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.closest('section')).toBe(section());
    expect(alert.textContent).toMatch(/could not/i);
    expect(statusText()).toBe('');
    expect(button.disabled).toBe(false);

    // A later attempt works, and the old failure does not linger.
    button.click();
    await waitFor(() => expect(statusText()).toMatch(/handed to your browser/i));
    expect(sectionAlert()).toBeNull();
  });

  it('reports a refused settle barrier as an inline alert', async () => {
    const { library, databaseName } = makeLibrary();
    await seedDatabase(databaseName, [makeCharacter(1)]);
    await library.initialize();
    await startSection(library);

    // A disposed library still shows a ready list, but it refuses the barrier.
    library.dispose();

    backupButton()!.click();
    await waitFor(() => expect(sectionAlert()).not.toBeNull());

    expect(sectionAlert()!.textContent).toMatch(/could not/i);
    expect(download).not.toHaveBeenCalled();
    expect(backupButton()!.disabled).toBe(false);
  });
});
