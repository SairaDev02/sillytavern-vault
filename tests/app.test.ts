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

  /** Everything a keyboard user can reach, so a duplicate control shows up. */
  const KEYBOARD_STOP =
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  /**
   * The accessible name these components expose: aria-labelledby, aria-label,
   * associated labels, then the element's own text.
   */
  function accessibleName(element: Element): string {
    const compact = (value: string) => value.replace(/\s+/g, ' ').trim();

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => target.querySelector(`[id="${id}"]`)?.textContent ?? '')
        .join(' ');
      if (compact(text)) return compact(text);
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && compact(ariaLabel)) return compact(ariaLabel);

    if (element instanceof HTMLInputElement) {
      const text = [...(element.labels ?? [])]
        .map((label) => label.textContent ?? '')
        .join(' ');
      if (compact(text)) return compact(text);
    }

    return compact(element.textContent ?? '');
  }

  const checkboxes = () => [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

  /** The selection checkbox whose accessible name identifies `name`. */
  function checkboxFor(name: string): HTMLInputElement | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`\\b${escaped}\\b`);
    return checkboxes().find((box) => matcher.test(accessibleName(box)));
  }

  const keyboardStops = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLElement>(KEYBOARD_STOP)].filter(
      (element) => !(element as HTMLButtonElement).disabled
    );

  /** Elements that expose status text to assistive technology. */
  const liveRegions = () =>
    [...target.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')].filter(
      (element) => element.getAttribute('aria-live') !== 'off'
    );

  const statusText = () =>
    liveRegions()
      .map((element) => element.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  /** The figure that holds a Character's selection control. */
  function figureFor(name: string): HTMLElement | undefined {
    return (checkboxFor(name)?.closest('figure') as HTMLElement | null) ?? undefined;
  }

  /** The card face: the pointer target that must activate that Character's checkbox. */
  function cardFace(name: string): HTMLImageElement {
    const image = figureFor(name)?.querySelector('img');
    if (!image) throw new Error(`No card face rendered for ${name}`);
    return image as HTMLImageElement;
  }

  async function search(value: string) {
    const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  function expectFocusOn(element: Element | null | undefined, description: string) {
    expect(element, `no control found for ${description}`).toBeTruthy();
    expect(document.activeElement, `focus should be on ${description}`).toBe(element);
  }
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
    // The card face is the pointer target for opening a Character.
    target.querySelector<HTMLImageElement>('figure img')!.click();
    await settle();
    await waitFor(() => expect(dialog()?.open).toBe(true));
  }

  async function enterSelectMode() {
    buttonWithText('Select')!.click();
    await settle();
  }

  /** Activate a Character's selection control the way a pointer user would. */
  function selectCard(name: string) {
    const box = checkboxFor(name);
    if (!box) throw new Error(`No selection checkbox for ${name}`);
    box.click();
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
    // Both Characters stay checked, so a retry needs no re-selection.
    expect(checkboxFor('Aria')?.checked).toBe(true);
    expect(checkboxFor('Bram')?.checked).toBe(true);
    expect(buttonWithText('Delete Selected')).toBeDefined();
    expect(buttonWithText('Cancel')).toBeDefined();

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
    // The mode and the checked selection survive the rejection.
    expect(checkboxFor('Aria')?.checked).toBe(true);
    expect(checkboxFor('Bram')?.checked).toBe(true);
    expect(buttonWithText('Delete Selected')).toBeDefined();
    expect(target.querySelector('[role="status"]')?.textContent).toContain(
      'Could not delete the selected'
    );

    restore();
  });

  it('renders one native checkbox and one keyboard stop per Character in selection mode', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();
    expect(checkboxes()).toHaveLength(2);

    for (const name of ['Aria', 'Bram']) {
      const box = checkboxFor(name);
      if (!box) throw new Error(`No selection checkbox for ${name}`);

      // The name identifies the selection action and the Character.
      expect(accessibleName(box)).toMatch(/select/i);

      // One keyboard stop per Character: no second, independently focusable toggle.
      const stops = keyboardStops(figureFor(name)!);
      expect(stops, `keyboard stops for ${name}`).toHaveLength(1);
      expect(stops[0]).toBe(box);
    }
  });

  it('toggles a Character once from the card face and from the check indicator', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();

    cardFace('Aria').click();
    await settle();
    expect(checkboxFor('Aria')?.checked).toBe(true);
    expect(checkboxFor('Bram')?.checked).toBe(false);
    expect(dialog()).toBeNull();

    // One activation is one toggle: the card face does not immediately undo itself.
    cardFace('Aria').click();
    await settle();
    expect(checkboxFor('Aria')?.checked).toBe(false);
    expect(dialog()).toBeNull();

    // The visible indicator operates the same checkbox.
    checkboxFor('Aria')!.click();
    await settle();
    expect(checkboxFor('Aria')?.checked).toBe(true);
    expect(dialog()).toBeNull();

    checkboxFor('Aria')!.click();
    await settle();
    expect(checkboxFor('Aria')?.checked).toBe(false);
  });

  it('exposes the selection count as status information', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();
    expect(statusText()).toMatch(/selection mode|selecting/i);

    selectCard('Aria');
    await settle();
    expect(statusText()).toMatch(/1\s+selected/i);

    selectCard('Bram');
    await settle();
    expect(statusText()).toMatch(/2\s+selected/i);
  });

  it('exposes a selection-mode entry cue when the library is empty', async () => {
    await seedDatabase([]);

    start();
    await waitForReady();
    await enterSelectMode();

    expect(statusText()).toMatch(/selection mode|selecting/i);
  });

  it('focuses the first rendered checkbox of the filtered list without selecting it', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Apple' }),
      makeCharacter(2, { name: 'Apricot' }),
      makeCharacter(3, { name: 'Banana' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(3));

    await search('ap');
    expect(figures()).toHaveLength(2);

    await enterSelectMode();
    await settle();

    // Newest first, so Apricot leads the filtered document order.
    const first = checkboxes()[0];
    expect(accessibleName(first)).toContain('Apricot');
    expect(figures()[0].contains(first)).toBe(true);
    expectFocusOn(first, 'the first rendered checkbox');
    expect(checkboxes().some((box) => box.checked), 'entry focus must not select').toBe(false);
  });

  it('focuses the current filtered card while an outgoing card is animating', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Apple' }),
      makeCharacter(2, { name: 'Banana' }),
    ]);
    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(figures()[0].querySelector('img')?.alt).toBe('Banana');

    const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'Apple';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect([...figures()].some((figure) => figure.querySelector('img')?.alt === 'Banana')).toBe(true);
    await enterSelectMode();

    const apple = checkboxFor('Apple');
    expectFocusOn(apple, 'the current filtered checkbox');
    expect(apple?.checked).toBe(false);
  });

  it('focuses Cancel when the library is empty', async () => {
    await seedDatabase([]);

    start();
    await waitForReady();
    await enterSelectMode();

    expectFocusOn(buttonWithText('Cancel'), 'the Cancel control');
  });

  it('focuses Cancel when the filter leaves nothing rendered', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await search('zzz');
    expect(figures()).toHaveLength(0);

    await enterSelectMode();

    expectFocusOn(buttonWithText('Cancel'), 'the Cancel control');
  });

  it('returns focus to Select when selection mode is cancelled', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await enterSelectMode();

    buttonWithText('Cancel')!.click();
    await settle();
    expectFocusOn(buttonWithText('Select'), 'the Select control');

    // An empty filtered list is not a dead end either.
    await search('zzz');
    expect(figures()).toHaveLength(0);
    await enterSelectMode();

    buttonWithText('Cancel')!.click();
    await settle();
    expectFocusOn(buttonWithText('Select'), 'the Select control');
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

  it('returns focus to Select after a committed batch delete', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
      makeCharacter(3, { name: 'Cora' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(3));
    await enterSelectMode();
    selectCard('Aria');
    await settle();

    buttonWithText('Delete Selected')!.click();
    await waitFor(async () => expect(await readDatabase()).toHaveLength(2));
    await settle();

    expect(figures()).toHaveLength(2);
    expect(target.textContent).not.toContain('selected');
    expectFocusOn(buttonWithText('Select'), 'the Select control');

    // Removing the last rendered Characters is not a dead end either.
    await enterSelectMode();
    selectCard('Bram');
    selectCard('Cora');
    await settle();

    buttonWithText('Delete Selected')!.click();
    await waitFor(async () => expect(await readDatabase()).toHaveLength(0));
    await settle();

    expect(figures()).toHaveLength(0);
    expectFocusOn(buttonWithText('Select'), 'the Select control');
  });
});
