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

/**
 * Make the next storage write fail, through the same prototype method the
 * helper uses. The returned function restores the real method.
 */
async function breakStoreMethod(method: 'put' | 'delete'): Promise<() => void> {
  const db = await openDB(DB_NAME);
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const proto = Object.getPrototypeOf(store) as IDBObjectStore;
  const original = proto[method];

  (proto as unknown as Record<string, unknown>)[method] = () => {
    throw new Error(`${method} blocked`);
  };

  return () => {
    (proto as unknown as Record<string, unknown>)[method] = original;
    db.close();
  };
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
  const preview = () =>
    target.querySelector<HTMLImageElement>('img[alt="Preview of the selected character"]');

  async function waitFor(check: () => void, timeout = 3000) {
    await vi.waitFor(check, { timeout, interval: 10 });
  }

  async function waitForReady() {
    await waitFor(() => expect(buttonWithText('+ Add Character')?.disabled).toBe(false));
  }

  function setName(value: string) {
    const input = target.querySelector<HTMLInputElement>('#char-name')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setDescription(value: string) {
    const input = target.querySelector<HTMLTextAreaElement>('#char-desc')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function chooseImage(name = 'newcomer.png') {
    const fileInput = target.querySelector<HTMLInputElement>('#char-image')!;
    const file = new File([new Uint8Array([137, 80, 78, 71])], name, {
      type: 'image/png',
    });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => expect(preview()).not.toBeNull());
  }

  function submitForm() {
    target
      .querySelector<HTMLFormElement>('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  async function openLightbox() {
    target.querySelector<HTMLButtonElement>('figure button')!.click();
    await settle();
    await waitFor(() => expect(dialog()?.open).toBe(true));
  }

  async function enterSelectMode() {
    buttonWithText('Select')!.click();
    await settle();
  }

  function selectCard(name: string) {
    const box = target.querySelector<HTMLInputElement>(`input[aria-label="Select ${name}"]`)!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
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
    await waitForReady();
    buttonWithText('+ Add Character')!.click();
    await settle();

    setName('Newcomer');
    await chooseImage();

    submitForm();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const stored = await readDatabase();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Newcomer');
    expect(stored[0].image.startsWith('data:image/png;base64,')).toBe(true);
    expect(stored[0].width).toBe(64);
    expect(stored[0].height).toBe(32);
  });

  it('backfills dimensions for a stored image that has none', async () => {
    await seedDatabase([makeCharacter(1, { width: undefined, height: undefined })]);

    start();
    await waitFor(async () => {
      const stored = await readDatabase();
      expect(stored[0].width).toBe(64);
      expect(stored[0].height).toBe(32);
    });
  });

  it('keeps the creation time when a character is edited', async () => {
    const original = makeCharacter(7, { name: 'Original', createdAt: 1_600_000_000_000 });
    await seedDatabase([original]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    await openLightbox();
    buttonWithText('Edit')!.click();
    await settle();
    await waitFor(() => expect(target.querySelector('#char-name')).not.toBeNull());

    expect(target.querySelector<HTMLInputElement>('#char-name')!.value).toBe('Original');
    setName('Renamed');

    submitForm();
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

    await openLightbox();
    buttonWithText('Delete')!.click();
    await waitFor(async () => expect(await readDatabase()).toHaveLength(0));
    await settle();

    expect(figures()).toHaveLength(0);
    expect(dialog()).toBeNull();
  });

  it('distinguishes loading from an empty ready library', async () => {
    await seedDatabase([]);

    start();
    // The first paint is the loading state, not an empty gallery.
    expect(target.textContent).toContain('Loading your character library');
    expect(target.textContent).not.toContain('No characters yet');

    await waitFor(() => expect(target.textContent).toContain('No characters yet'));
    expect(target.textContent).not.toContain('Loading your character library');
  });

  it('shows a failed start with Retry, keeps Add unavailable, and recovers on Retry', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    const workingIndexedDb = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', {
      open() {
        throw new Error('storage blocked');
      },
    });

    start();
    await waitFor(() =>
      expect(target.textContent).toContain('Could not open your character library')
    );
    expect(target.textContent).toContain('storage blocked');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(true);
    expect(figures()).toHaveLength(0);
    expect(target.querySelector('[role="alert"]')).not.toBeNull();

    vi.stubGlobal('indexedDB', workingIndexedDb);
    buttonWithText('Retry')!.click();

    await waitFor(() => expect(figures()).toHaveLength(1));
    expect(target.textContent).toContain('Aria');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(false);
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the draft and the form open when a save fails, then saves on retry', async () => {
    await seedDatabase([]);

    start();
    await waitForReady();
    buttonWithText('+ Add Character')!.click();
    await settle();

    setName('Kept Draft');
    setDescription('Keep this description');
    await chooseImage();
    const chosenImage = preview()!.getAttribute('src');

    const restore = await breakStoreMethod('put');
    submitForm();
    await waitFor(() =>
      expect(target.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not save the character'
      )
    );

    // Nothing was stored, and the draft, the form, and the image are intact.
    expect(await readDatabase()).toHaveLength(0);
    expect(figures()).toHaveLength(0);
    expect(target.querySelector<HTMLInputElement>('#char-name')!.value).toBe('Kept Draft');
    expect(target.querySelector<HTMLTextAreaElement>('#char-desc')!.value).toBe(
      'Keep this description'
    );
    expect(preview()?.getAttribute('src')).toBe(chosenImage);
    expect(target.querySelector<HTMLFormElement>('form')).not.toBeNull();

    restore();
    submitForm();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const stored = await readDatabase();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Kept Draft');
  });

  it('keeps a Character and shows a notice after the lightbox closes on a delete failure', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Doomed' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const restore = await breakStoreMethod('delete');
    buttonWithText('Delete')!.click();
    await waitFor(() =>
      expect(target.textContent).toContain('Could not delete the Character')
    );
    await settle();

    // The lightbox closed, the card is still there, and the notice stayed.
    expect(dialog()).toBeNull();
    expect(figures()).toHaveLength(1);
    expect(target.textContent).toContain('Doomed');
    expect(target.querySelector('[role="status"]')?.textContent).toContain(
      'Could not delete the Character'
    );

    restore();
    expect(await readDatabase()).toHaveLength(1);
  });

  it('writes nothing when the delete confirmation is canceled', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Doomed' })]);
    vi.mocked(confirm).mockReturnValueOnce(false);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    buttonWithText('Delete')!.click();
    await settle();

    expect(figures()).toHaveLength(1);
    expect(await readDatabase()).toHaveLength(1);
    expect(target.textContent).not.toContain('Could not delete the Character');
  });

  it('keeps the records and selection when a batch delete is canceled or fails', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();
    selectCard('Aria');
    selectCard('Bram');
    await settle();
    expect(target.textContent).toContain('2 selected');

    // A canceled confirmation changes nothing.
    vi.mocked(confirm).mockReturnValueOnce(false);
    buttonWithText('Delete Selected')!.click();
    await settle();
    expect(target.textContent).toContain('2 selected');
    expect(figures()).toHaveLength(2);
    expect(await readDatabase()).toHaveLength(2);

    // A failed delete keeps every record and the selection for a retry.
    const restore = await breakStoreMethod('delete');
    buttonWithText('Delete Selected')!.click();
    await waitFor(() => expect(target.textContent).toContain('Could not delete the selected'));
    await settle();

    expect(figures()).toHaveLength(2);
    expect(target.textContent).toContain('2 selected');
    expect(target.textContent).toContain('Aria');
    expect(target.textContent).toContain('Bram');
    expect(await readDatabase()).toHaveLength(2);

    restore();
  });

  it('clears the selection and leaves select mode after a committed batch delete', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();
    selectCard('Aria');
    selectCard('Bram');
    await settle();

    buttonWithText('Delete Selected')!.click();
    await waitFor(async () => expect(await readDatabase()).toHaveLength(0));
    await settle();

    expect(figures()).toHaveLength(0);
    expect(target.querySelectorAll('input[aria-label^="Select "]')).toHaveLength(0);
    expect(buttonWithText('Select')).toBeDefined();
    expect(target.textContent).not.toContain('selected');
  });
});
