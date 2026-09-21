// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import { openDB, dbGetAll, STORE_NAME } from '../src/db';
import type { Character } from '../src/types';
import { makeCharacter } from './fixtures';

const DB_NAME = 'character-gallery';

/** jsdom does not decode images, so `measureImage` gets a fake loader. */
class FakeImage {
  naturalWidth = 64;
  naturalHeight = 32;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'async';

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

async function withStore(
  run: (store: IDBObjectStore, done: () => void) => void
): Promise<void> {
  const db = await openDB(DB_NAME);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    run(tx.objectStore(STORE_NAME), () => {
      db.close();
      resolve();
    });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function seedDatabase(characters: Character[]): Promise<void> {
  await withStore((store, done) => {
    store.clear();
    for (const character of characters) store.put(character);
    done();
  });
}

async function readDatabase(): Promise<Character[]> {
  const db = await openDB(DB_NAME);
  const all = await dbGetAll<Character>(db);
  db.close();
  return all;
}

/** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

describe('App', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(async () => {
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    target.remove();
    vi.unstubAllGlobals();
  });

  function start() {
    app = mount(App, { target });
  }

  const figures = () => target.querySelectorAll('figure');
  const buttonWithText = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  const dialog = () => target.querySelector('dialog') as HTMLDialogElement | null;

  async function waitFor(check: () => void, timeout = 3000) {
    await vi.waitFor(check, { timeout, interval: 10 });
  }

  it('renders the characters stored in the database', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(target.textContent).toContain('Aria');
    expect(target.textContent).toContain('Bram');
  });

  it('saves a new character with its image dimensions', async () => {
    await seedDatabase([]);

    start();
    await waitFor(() => expect(buttonWithText('+ Add Character')).toBeDefined());
    buttonWithText('+ Add Character')!.click();
    await settle();

    const nameInput = target.querySelector<HTMLInputElement>('#char-name')!;
    nameInput.value = 'Newcomer';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    const fileInput = target.querySelector<HTMLInputElement>('#char-image')!;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'newcomer.png', {
      type: 'image/png',
    });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    // The preview only appears once the file has been read.
    await waitFor(() =>
      expect(target.querySelector('img[alt="Preview of the selected character"]')).not.toBeNull()
    );

    target.querySelector<HTMLFormElement>('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await waitFor(() => expect(figures()).toHaveLength(1));

    const stored = await readDatabase();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Newcomer');
    expect(stored[0].image.startsWith('data:image/png;base64,')).toBe(true);
    expect(stored[0].width).toBe(64);
    expect(stored[0].height).toBe(32);
  });

  it('keeps the creation time when a character is edited', async () => {
    const original = makeCharacter(7, { name: 'Original', createdAt: 1_600_000_000_000 });
    await seedDatabase([original]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    // Open the lightbox, then the edit form.
    target.querySelector<HTMLButtonElement>('figure button')!.click();
    await settle();
    await waitFor(() => expect(dialog()?.open).toBe(true));

    buttonWithText('Edit')!.click();
    await settle();
    await waitFor(() => expect(target.querySelector('#char-name')).not.toBeNull());

    const nameInput = target.querySelector<HTMLInputElement>('#char-name')!;
    expect(nameInput.value).toBe('Original');
    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    target.querySelector<HTMLFormElement>('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );

    await waitFor(async () => {
      const stored = await readDatabase();
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('Renamed');
    });

    const stored = await readDatabase();
    expect(stored[0].createdAt).toBe(1_600_000_000_000);
    expect(stored[0].width).toBe(1);
  });

  it('deletes a character from the lightbox', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Doomed' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    target.querySelector<HTMLButtonElement>('figure button')!.click();
    await settle();
    await waitFor(() => expect(dialog()?.open).toBe(true));

    buttonWithText('Delete')!.click();
    await waitFor(async () => expect(await readDatabase()).toHaveLength(0));
    await settle();

    expect(figures()).toHaveLength(0);
    expect(dialog()).toBeNull();
  });
});
