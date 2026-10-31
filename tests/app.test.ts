// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import App from '../src/App.svelte';
import { openDB, dbGetAll, STORE_NAME } from '../src/db';
import type { Character } from '../src/types';
import { deferred, makeCharacter, makeCharacters } from './fixtures';
import { PAGE_SIZE } from '../src/gallery-utils';

// The download helper is the seam the spec names. Mocking it here lets a test
// decide when the page's attempt settles, instead of depending on the browser.
vi.mock('../src/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/download')>()),
  downloadCharacterImage: vi.fn(),
}));

import { downloadCharacterImage } from '../src/download';

const downloadImage = vi.mocked(downloadCharacterImage);

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

/**
 * Hold the next library open until the test releases it, so a Retry can be
 * observed while it is still pending. `release` hands a real database to the
 * waiting open and restores the real factory.
 */
async function holdStorageOpen(workingIndexedDb: IDBFactory) {
  // `openDB` reads the current factory, so restore it and open the database first.
  vi.stubGlobal('indexedDB', workingIndexedDb);
  const database = await openDB(DB_NAME);

  let pending: { onsuccess?: ((event: unknown) => void) | null } | null = null;
  vi.stubGlobal('indexedDB', {
    open() {
      pending = { onsuccess: null };
      return pending;
    },
  });

  return {
    release() {
      vi.stubGlobal('indexedDB', workingIndexedDb);
      pending?.onsuccess?.({ target: { result: database } });
    },
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

/**
 * Minimal IntersectionObserver double, so a test can add another page of
 * results the way a browser does when the sentinel scrolls into view.
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly elements = new Set<Element>();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.elements.add(target);
  }

  unobserve(target: Element) {
    this.elements.delete(target);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Report the watched sentinel as visible, as a scroll into view would. */
  reveal() {
    const target = [...this.elements][0];
    if (!target) throw new Error('Observer is not watching any element');
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

describe('App', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(async () => {
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    downloadImage.mockReset();
    downloadImage.mockResolvedValue(undefined);
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

  /** One download attempt whose settlement this test decides. */
  function beginDownload() {
    const pending = deferred<void>();
    downloadImage.mockReturnValueOnce(pending.promise);
    return pending;
  }

  /** The existing per-card Download control for one Character. */
  function cardDownload(name: string): HTMLButtonElement {
    const button = target.querySelector<HTMLButtonElement>(
      `button[aria-label="Download ${name}"]`
    );
    if (!button) throw new Error(`No card Download control for ${name}`);
    return button;
  }

  /**
   * Every download-failure presentation in the document. The page owns one
   * notice, so a second entry here is a duplicate the user could hit twice.
   */
  function downloadNotices(): HTMLElement[] {
    return liveRegions().filter((element) => /could not download/i.test(element.textContent ?? ''));
  }

  /** The download-failure notice, wherever the currently visible view puts it. */
  function downloadNotice(): HTMLElement | undefined {
    return downloadNotices()[0];
  }

  /** The Dismiss control belonging to a download notice. */
  function dismissControl(notice: HTMLElement): HTMLButtonElement {
    const button = [...notice.querySelectorAll('button')].find((candidate) =>
      /dismiss/i.test(candidate.textContent ?? '')
    );
    if (!button) throw new Error('No dismiss control in the download notice');
    return button;
  }

  function dismissDownloadNotice() {
    const notice = downloadNotice();
    if (!notice) throw new Error('No download notice to dismiss');
    dismissControl(notice).click();
  }

  async function openLightbox() {
    // The card face is the pointer target for opening a Character.
    target.querySelector<HTMLImageElement>('figure img')!.click();
    await settle();
    await waitFor(() => expect(dialog()?.open).toBe(true));
  }

  /** The image the open lightbox is displaying. */
  const lightboxImage = () => dialog()?.querySelector<HTMLImageElement>('img');

  /** jsdom does not decode images, so a test reports the failure itself. */
  const failImage = (image: HTMLImageElement) => image.dispatchEvent(new Event('error'));

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

  it('shows an unavailable lightbox image as polite status without closing the dialog', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const download = buttonWithText('Download')!;
    download.focus();

    failImage(lightboxImage()!);
    await settle();

    // The failure is visible in the dialog and reported as polite status.
    expect(dialog()?.open).toBe(true);
    expect(dialog()!.textContent).toContain('Image unavailable');
    const status = dialog()!.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Image unavailable');
    // It neither steals focus nor removes the Character's actions.
    expectFocusOn(download, 'the lightbox Download button');
    for (const label of ['Download', 'Edit', 'Delete']) {
      expect(buttonWithText(label), `${label} button`).toBeDefined();
    }
  });

  it('does not carry a lightbox image failure to the next Character', async () => {
    // Both Characters share one image source, so only the Character identity can
    // decide that the next view starts without the previous failure.
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));
    await openLightbox();

    // Newest first, so the lightbox opens on Bram and moves on to Aria.
    expect(dialog()!.querySelector('h2')?.textContent?.trim()).toBe('Bram');
    failImage(lightboxImage()!);
    await settle();
    expect(dialog()!.textContent).toContain('Image unavailable');

    const next = [...dialog()!.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Next character'
    )!;
    next.click();
    await settle();

    expect(dialog()!.querySelector('h2')?.textContent?.trim()).toBe('Aria');
    expect(dialog()!.textContent).not.toContain('Image unavailable');
    expect(dialog()!.querySelector('[role="status"]')?.textContent?.trim()).toBe('');
    expect(dialog()?.open).toBe(true);
  });

  it('distinguishes loading from an empty ready library', async () => {
    await seedDatabase([]);

    start();
    // The status text is filled in after the region is in the document, so one
    // flush brings the first paint into place.
    await tick();
    // The first paint is the loading state, not an empty gallery.
    expect(target.textContent).toContain('Loading your character library');
    expect(target.textContent).not.toContain('No characters yet');

    await waitFor(() => expect(target.textContent).toContain('No characters yet'));
    expect(target.textContent).not.toContain('Loading your character library');
  });

  it('prefers the genuine empty message over a no-match search in an empty library', async () => {
    await seedDatabase([]);

    start();
    await waitFor(() => expect(target.textContent).toContain('No characters yet'));

    // Genuine emptiness is proven by the library, not by the shown cards, so a
    // search term cannot turn it into a search result.
    await search('zzz');

    expect(figures()).toHaveLength(0);
    expect(target.textContent).toContain('No characters yet');
    expect(target.textContent).not.toContain('No characters match your search');
    expect(buttonWithText('Clear search')).toBeUndefined();
  });

  it('shows a distinct no-match message and Clear search, then restores the results', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));

    await search('zzz');

    expect(figures()).toHaveLength(0);
    expect(target.textContent).toContain('No characters match your search.');
    expect(target.textContent).not.toContain('No characters yet');
    const clear = buttonWithText('Clear search');
    expect(clear, 'Clear search action').toBeDefined();

    clear!.click();
    await settle();

    // The whole library is back, the query is empty, and focus is on Search.
    expect(figures()).toHaveLength(2);
    const searchInput = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(searchInput.value).toBe('');
    expect(target.textContent).not.toContain('No characters match your search');
    expectFocusOn(searchInput, 'the Search field');
  });

  it('keeps the sort choice when a search is cleared', async () => {
    // Newest first leads with Bram; name order leads with Aria.
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));

    const sort = target.querySelector<HTMLSelectElement>('select')!;
    sort.value = 'name';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(figures()[0].querySelector('img')?.alt).toBe('Aria');

    await search('zzz');
    buttonWithText('Clear search')!.click();
    await settle();

    expect(target.querySelector<HTMLSelectElement>('select')!.value).toBe('name');
    expect(figures()[0].querySelector('img')?.alt).toBe('Aria');
  });

  it('announces the transitions into no matches and back without a per-keystroke count', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
      makeCharacter(3, { name: 'Cora' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(3));

    // Narrowing a result list is not an announcement, and no count is read out.
    // The page's own start-up status is the only other live text here.
    await search('a');
    expect(figures()).toHaveLength(3);
    expect(statusText()).not.toMatch(/match/i);
    expect(statusText()).not.toMatch(/\d/);
    await search('ra');
    expect(figures()).toHaveLength(2);
    expect(statusText()).not.toMatch(/match/i);
    expect(statusText()).not.toMatch(/\d/);

    await search('zzz');
    expect(figures()).toHaveLength(0);
    const noMatch = liveRegions().find((element) =>
      (element.textContent ?? '').includes('No characters match your search')
    );
    expect(noMatch, 'no-match status').toBeDefined();
    expect(
      noMatch!.getAttribute('role') === 'status' ||
        noMatch!.getAttribute('aria-live') === 'polite'
    ).toBe(true);

    await search('ra');
    expect(figures()).toHaveLength(2);
    expect(statusText()).toContain('Search results restored');
    expect(statusText()).not.toMatch(/\d/);

    // Returning to results already announced the change; later keystrokes that
    // stay within the results say nothing.
    await search('r');
    expect(figures()).toHaveLength(3);
    expect(statusText()).toContain('Search results restored');
    expect(statusText()).not.toMatch(/\d/);
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

  it('exposes loading and the ready outcome as status information', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    // The text arrives after the region, so one flush is the first paint.
    await tick();
    // The first paint is loading, and that state is announced as status.
    expect(statusText()).toContain('Loading your character library');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(true);

    await waitFor(() => expect(figures()).toHaveLength(1));
    // Reaching ready is announced too, so recovery is followable without hunting.
    expect(statusText()).toMatch(/character library is ready/i);
    expect(statusText()).not.toContain('Loading your character library');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(false);
  });

  it('creates the status region empty so its first text is an announced change', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    // Hold the library open, so the page stays in its loading state while the
    // first text arrives.
    const pending = await holdStorageOpen(globalThis.indexedDB);

    start();
    // The region is in the document before its text is. An assistive technology
    // is only obliged to announce a change to a region that already existed, so
    // a region created with its text is never announced.
    const region = target.querySelector<HTMLElement>('[role="status"]');
    expect(region, 'the status region exists at first paint').not.toBeNull();
    expect(region!.isConnected).toBe(true);
    expect(region!.textContent).toBe('');

    // The loading text arrives as a change to that region, not as its creation.
    await tick();
    expect(region!.textContent).toBe('Loading your character library...');

    pending.release();
    await waitFor(() => expect(figures()).toHaveLength(1));
    // The outcome reaches the same region, so the transition stays followable.
    expect(target.querySelector('[role="status"]')).toBe(region);
    expect(region!.textContent).toMatch(/character library is ready/i);
  });

  it('explains a failed start without claiming stored Characters are still there', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    vi.stubGlobal('indexedDB', {
      open() {
        throw new Error('storage blocked');
      },
    });

    start();
    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());

    const alert = target.querySelector('[role="alert"]')!;
    const text = (alert.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Could not open your character library');
    expect(text).toContain('storage blocked');
    expect(text).toMatch(/loading failed/i);
    expect(text).toMatch(/not delete or replace/i);
    // A failed read cannot establish that the stored Characters are present.
    expect(text).not.toMatch(/still stored/i);

    expect(buttonWithText('Retry')).toBeDefined();
    expect(buttonWithText('+ Add Character')!.disabled).toBe(true);
    expect(figures()).toHaveLength(0);
    // The failure is status information too, not only an alert.
    expect(statusText()).toMatch(/could not be opened/i);
  });

  it('moves focus to the page heading when Retry is activated, without a keyboard stop', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    const workingIndexedDb = globalThis.indexedDB;
    const blockStorage = () =>
      vi.stubGlobal('indexedDB', {
        open() {
          throw new Error('storage blocked');
        },
      });

    blockStorage();
    start();
    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());

    const heading = target.querySelector('h1')!;
    buttonWithText('Retry')!.click();

    // Focus moves away from the Retry control before it disappears.
    expectFocusOn(heading, 'the page heading');
    // The heading is a focus destination, not one more tab stop.
    expect(keyboardStops(target.querySelector('header')!)).toHaveLength(0);

    // Loading is announced again and Add stays unavailable.
    flushSync();
    expect(statusText()).toContain('Loading your character library');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(true);

    // The same fault fails the retry again, and the heading keeps focus.
    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());
    expect(statusText()).toMatch(/could not be opened/i);

    // Ready keeps Add as the only keyboard stop in the header.
    vi.stubGlobal('indexedDB', workingIndexedDb);
    buttonWithText('Retry')!.click();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const stops = keyboardStops(target.querySelector('header')!);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(buttonWithText('+ Add Character'));
  });

  it('keeps stored records through a failed Retry and re-shows the failure alert', async () => {
    const seeded = [makeCharacter(1, { name: 'Aria' }), makeCharacter(2, { name: 'Bram' })];
    await seedDatabase(seeded);

    const workingIndexedDb = globalThis.indexedDB;
    const blockStorage = () =>
      vi.stubGlobal('indexedDB', {
        open() {
          throw new Error('storage blocked');
        },
      });

    blockStorage();
    start();
    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());

    // A failed start neither deletes nor replaces what is stored.
    vi.stubGlobal('indexedDB', workingIndexedDb);
    expect(await readDatabase()).toHaveLength(2);

    // Retrying against the same fault fails again and shows the alert again.
    blockStorage();
    buttonWithText('Retry')!.click();
    flushSync();
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(statusText()).toContain('Loading your character library');

    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());
    expect(statusText()).toMatch(/could not be opened/i);

    // Recovering brings the same records back, unchanged and not duplicated.
    vi.stubGlobal('indexedDB', workingIndexedDb);
    buttonWithText('Retry')!.click();
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(target.textContent).toContain('Aria');
    expect(target.textContent).toContain('Bram');

    const stored = await readDatabase();
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining(seeded));
  });

  it('does not move focus when a pending Retry completes', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    const workingIndexedDb = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', {
      open() {
        throw new Error('storage blocked');
      },
    });

    start();
    await waitFor(() => expect(target.querySelector('[role="alert"]')).not.toBeNull());

    const pending = await holdStorageOpen(workingIndexedDb);
    buttonWithText('Retry')!.click();

    const heading = target.querySelector('h1')!;
    expectFocusOn(heading, 'the page heading');
    // Retry is in flight, so the page is loading again and the alert is gone.
    flushSync();
    expect(target.querySelector('[role="alert"]')).toBeNull();

    // The user moves on while the retry is still pending.
    heading.blur();
    expect(document.activeElement).toBe(document.body);
    expect(statusText()).toContain('Loading your character library');
    expect(buttonWithText('+ Add Character')!.disabled).toBe(true);

    pending.release();

    await waitFor(() => expect(figures()).toHaveLength(1));
    // The completion announces itself and leaves the user where they are.
    expect(statusText()).toMatch(/character library is ready/i);
    expect(document.activeElement).toBe(document.body);
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

  it('shows a detected download failure as polite status naming the Character', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const pending = beginDownload();
    cardDownload('Aria').click();
    await settle();
    // Work in flight is not an outcome, so nothing is claimed yet.
    expect(downloadNotice()).toBeUndefined();
    expect(downloadImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aria' }));

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    const notice = downloadNotice()!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
    expect(notice.textContent).toContain('Aria');
    expect(notice.textContent).toMatch(/download/i);
    // The existing Download action is the only retry, so no control was added.
    expect(cardDownload('Aria')).toBeDefined();
  });

  it('keeps a pending attempt and its failure in the page while the form is open', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitForReady();

    const pending = beginDownload();
    cardDownload('Aria').click();
    await settle();

    // Opening the form tears the Gallery down while the attempt is in flight.
    buttonWithText('+ Add Character')!.click();
    await settle();
    expect(target.querySelector('form')).not.toBeNull();
    expect(figures()).toHaveLength(0);
    // With no dialog open the notice belongs to the page content.
    expect(dialog()).toBeNull();

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    expect(downloadNotice()!.textContent).toContain('Aria');
    expect(downloadNotice()!.getAttribute('aria-live')).toBe('polite');

    // An existing notice survives the form closing and the Gallery returning.
    buttonWithText('Cancel')!.click();
    await settle();
    expect(figures()).toHaveLength(1);
    expect(downloadNotice()!.textContent).toContain('Aria');
  });

  it("does not attribute a pending failure to the Character shown later", async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));

    const pending = beginDownload();
    cardDownload('Aria').click();
    await settle();

    // The user moves on to another Character while the attempt is in flight.
    await openLightbox();
    expect(dialog()!.querySelector('h2')?.textContent?.trim()).toBe('Bram');

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    expect(downloadNotice()!.textContent).toContain('Aria');
    expect(downloadNotice()!.textContent).not.toContain('Bram');
  });

  it('routes the lightbox Download through the page notice without moving focus', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const pending = beginDownload();
    const download = buttonWithText('Download')!;
    download.focus();
    download.click();
    await settle();
    expect(downloadImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aria' }));

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    expect(downloadNotice()!.textContent).toContain('Aria');
    // Completion neither reopens nor closes the dialog and leaves focus alone.
    expect(dialog()?.open).toBe(true);
    expectFocusOn(download, 'the lightbox Download button');
  });

  it('does not reopen the dialog or move focus when a download settles after closing', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const pending = beginDownload();
    buttonWithText('Download')!.click();
    await settle();

    target.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await settle();
    expect(dialog()).toBeNull();
    const focusAfterClose = document.activeElement;

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(focusAfterClose);
    expect(downloadNotice()!.textContent).toContain('Aria');
  });

  it('clears the notice when the same Character is handed off again', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const pending = beginDownload();
    cardDownload('Aria').click();
    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());

    // The helper resolves on the retry, which is a browser handoff.
    cardDownload('Aria').click();
    await waitFor(() => expect(downloadNotice()).toBeUndefined());
  });

  it('presents a download failure inside the open lightbox, then back in the page', async () => {
    await seedDatabase([
      makeCharacter(1, { name: 'Aria' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(2));

    // The attempt starts from Aria's card, so the outcome belongs to Aria.
    const pending = beginDownload();
    cardDownload('Aria').click();
    await settle();

    // The user opens a different Character while the attempt is in flight.
    await openLightbox();
    expect(dialog()!.querySelector('h2')?.textContent?.trim()).toBe('Bram');

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotices()).toHaveLength(1));
    await settle();

    // One presentation, inside the dialog, still naming the Character that
    // started the attempt rather than the one on display.
    expect(downloadNotices()).toHaveLength(1);
    const inDialog = downloadNotices()[0];
    expect(dialog()!.contains(inDialog)).toBe(true);
    expect(inDialog.getAttribute('role')).toBe('status');
    expect(inDialog.getAttribute('aria-live')).toBe('polite');
    expect(inDialog.textContent).toContain('Aria');
    expect(inDialog.textContent).not.toContain('Bram');

    // Closing the dialog returns the same notice to the page content.
    target.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await settle();

    expect(dialog()).toBeNull();
    expect(downloadNotices()).toHaveLength(1);
    const inPage = downloadNotices()[0];
    expect(inPage.textContent).toContain('Aria');
    expect(target.querySelector('main')!.contains(inPage)).toBe(true);
  });

  it('transfers the download notice without moving focus or reopening the dialog', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const pending = beginDownload();
    const download = buttonWithText('Download')!;
    download.focus();
    download.click();
    await settle();

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotices()).toHaveLength(1));
    await settle();

    // Arriving in the dialog does not take focus from the action that failed.
    expect(dialog()!.contains(downloadNotices()[0])).toBe(true);
    expectFocusOn(download, 'the lightbox Download button');

    target.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    await settle();

    // Leaving the dialog neither reopens it nor takes focus for the notice.
    expect(dialog()).toBeNull();
    expect(downloadNotices()).toHaveLength(1);
    expect(downloadNotices()[0].contains(document.activeElement)).toBe(false);
    expect(document.activeElement?.closest('dialog')).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('dismisses the download notice from inside the lightbox', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const pending = beginDownload();
    buttonWithText('Download')!.click();
    await settle();

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotices()).toHaveLength(1));
    await settle();

    const notice = downloadNotices()[0];
    expect(dialog()!.contains(notice)).toBe(true);

    dismissControl(notice).click();
    await settle();

    // Dismissing in the dialog clears the one page-owned notice everywhere.
    expect(downloadNotices()).toHaveLength(0);
    expect(dialog()?.open).toBe(true);
  });

  it('keeps the delete notice in the page while the download notice is in the dialog', async () => {
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
    restore();
    expect(dialog()).toBeNull();

    // A download failure now settles while the dialog is open again.
    const pending = beginDownload();
    cardDownload('Doomed').click();
    await settle();
    await openLightbox();

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotices()).toHaveLength(1));
    await settle();

    expect(dialog()!.contains(downloadNotices()[0])).toBe(true);
    expect(dialog()!.textContent).not.toContain('Could not delete the Character');
    expect(target.textContent).toContain('Could not delete the Character');

    dismissControl(downloadNotices()[0]).click();
    await settle();

    expect(downloadNotices()).toHaveLength(0);
    expect(
      liveRegions().some((element) =>
        /Could not delete the Character/.test(element.textContent ?? '')
      )
    ).toBe(true);
    expect(dialog()?.open).toBe(true);
  });

  it('keeps the notice in page content when the lightbox hands over to the form', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));
    await openLightbox();

    const pending = beginDownload();
    buttonWithText('Download')!.click();
    await settle();

    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotices()).toHaveLength(1));
    await settle();
    expect(dialog()!.contains(downloadNotices()[0])).toBe(true);

    // Edit closes the dialog and opens the form, which tears the Gallery down.
    buttonWithText('Edit')!.click();
    await waitFor(() => expect(target.querySelector('#char-name')).not.toBeNull());
    await settle();

    // The notice is still presented, in page content, that one time.
    expect(dialog()).toBeNull();
    expect(downloadNotices()).toHaveLength(1);
    expect(downloadNotices()[0].textContent).toContain('Aria');
    expect(target.querySelector('main')!.contains(downloadNotices()[0])).toBe(true);
  });

  it('keeps the delete notice independent of download feedback', async () => {
    await seedDatabase([makeCharacter(1, { name: 'Doomed' })]);

    start();
    await waitFor(() => expect(figures()).toHaveLength(1));

    const restore = await breakStoreMethod('delete');
    await openLightbox();
    buttonWithText('Delete')!.click();
    await waitFor(() =>
      expect(target.textContent).toContain('Could not delete the Character')
    );
    await settle();
    restore();

    const pending = beginDownload();
    cardDownload('Doomed').click();
    pending.reject(new Error('invalid data URL'));
    await waitFor(() => expect(downloadNotice()).toBeDefined());
    await settle();

    // Download feedback is its own notice and does not replace the delete one.
    expect(target.textContent).toContain('Could not delete the Character');
    expect(downloadNotice()!.textContent).toContain('Doomed');

    dismissDownloadNotice();
    await settle();

    expect(downloadNotice()).toBeUndefined();
    expect(target.textContent).toContain('Could not delete the Character');
    expect(
      liveRegions().some((element) => /Could not delete the Character/.test(element.textContent ?? ''))
    ).toBe(true);
  });

  describe('form focus lifecycle', () => {
    const headingIn = (root: ParentNode) =>
      [...root.querySelectorAll<HTMLHeadingElement>('h2')].find((heading) =>
        /^(Add New Character|Edit Character)$/.test(heading.textContent?.trim() ?? '')
      );
    const formHeading = () => headingIn(target.querySelector('main')!)!;
    const nameInput = () => target.querySelector<HTMLInputElement>('#char-name')!;
    const searchInput = () => target.querySelector<HTMLInputElement>('input[type="search"]')!;
    const addButton = () => buttonWithText('+ Add Character')!;

    /** A card, found by a detail that belongs to one record rather than its name. */
    function cardFor(description: string): HTMLButtonElement {
      const figure = [...target.querySelectorAll('figure')].find((candidate) =>
        candidate.querySelector('figcaption')?.textContent?.includes(description)
      );
      if (!figure) throw new Error(`No card rendered for "${description}"`);
      return figure.querySelector('button')!;
    }

    /** Activate a control the way a keyboard user does: focus it, then press it. */
    function activate(control: HTMLElement) {
      control.focus();
      control.click();
    }

    /** The observer currently watching a rendered sentinel. */
    function activeObserver(): MockIntersectionObserver | undefined {
      return MockIntersectionObserver.instances.find((observer) =>
        [...observer.elements].some((element) => element.isConnected)
      );
    }

    async function openAddForm() {
      await waitForReady();
      activate(addButton());
      await settle();
    }

    async function openEditForm(description: string) {
      await waitFor(() => expect(cardFor(description)).toBeDefined());
      cardFor(description).focus();
      cardFor(description).click();
      await settle();
      await waitFor(() => expect(dialog()?.open).toBe(true));
      activate(buttonWithText('Edit')!);
      await settle();
      await waitFor(() => expect(nameInput()).not.toBeNull());
    }

    it('focuses the Add form heading on open, and the next Tab reaches Name', async () => {
      await seedDatabase([]);

      start();
      await openAddForm();

      const heading = formHeading();
      expect(heading.textContent?.trim()).toBe('Add New Character');
      expectFocusOn(heading, 'the Add form heading');

      // A focus destination, not one more ordinary Tab stop in the page.
      expect(heading.getAttribute('tabindex')).toBe('-1');
      expect(keyboardStops(target.querySelector('main')!)).not.toContain(heading);
      expect(keyboardStops(target.querySelector('main')!)[0]).toBe(nameInput());
      // The page keeps its own single header stop.
      expect(keyboardStops(target.querySelector('header')!)).toEqual([addButton()]);
    });

    it('keeps the Edit form heading focused after the lightbox close event', async () => {
      await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

      start();
      await openEditForm('Description 1');

      const heading = formHeading();
      expect(heading.textContent?.trim()).toBe('Edit Character');
      expectFocusOn(heading, 'the Edit form heading');
      expect(dialog()).toBeNull();

      // A delayed close handler must not put focus back on the card behind it.
      await settle();
      await Promise.resolve();
      await settle();
      expectFocusOn(heading, 'the Edit form heading');
      expect(keyboardStops(target.querySelector('main')!)[0]).toBe(nameInput());
    });

    it('returns focus to Add Character when the Add form is cancelled', async () => {
      await seedDatabase([]);

      start();
      await openAddForm();

      activate(buttonWithText('Cancel')!);
      await settle();

      expect(target.querySelector('main form')).toBeNull();
      expect(figures()).toHaveLength(0);
      expectFocusOn(addButton(), 'the Add Character button');
    });

    it('returns focus to Add Character after a successful Add save', async () => {
      await seedDatabase([]);

      start();
      await openAddForm();
      setName('Newcomer');
      await chooseImage();

      activate(target.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
      await waitFor(() => expect(figures()).toHaveLength(1));
      await settle();

      expect(target.querySelector('main form')).toBeNull();
      expectFocusOn(addButton(), 'the Add Character button');
    });

    it('leaves a persistent control chosen during a pending save in place', async () => {
      await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

      start();
      await waitFor(() => expect(figures()).toHaveLength(1));

      // A download failure that lands before the form opens stays in page
      // content, so it is a persistent control outside the form to keep.
      const pending = beginDownload();
      cardDownload('Aria').click();
      pending.reject(new Error('invalid data URL'));
      await waitFor(() => expect(downloadNotice()).toBeDefined());

      await openAddForm();
      setName('Pending');
      await chooseImage();

      submitForm();
      const dismiss = dismissControl(downloadNotice()!);
      dismiss.focus();

      // The new Character is published while focus is outside the form.
      await waitFor(() => expect(figures()).toHaveLength(2));
      await settle();

      // The save finished while the user was elsewhere; it must not pull focus back.
      expect(target.querySelector('main form')).toBeNull();
      expectFocusOn(dismiss, 'the notice Dismiss control');
    });

    it('returns focus to the edited Character card by identity when names repeat', async () => {
      await seedDatabase([
        makeCharacter(1, { name: 'Twin', description: 'the older twin' }),
        makeCharacter(2, { name: 'Twin', description: 'the newer twin' }),
      ]);

      start();
      await waitFor(() => expect(figures()).toHaveLength(2));
      await openEditForm('the older twin');

      activate(buttonWithText('Cancel')!);
      await settle();

      expect(dialog()).toBeNull();
      expect(figures()).toHaveLength(2);
      // The first card with this name belongs to the other Character.
      expectFocusOn(cardFor('the older twin'), "the edited Character's card");
    });

    it("returns focus to the edited Character's card after a rename", async () => {
      await seedDatabase([
        makeCharacter(1, { name: 'Original', description: 'kept detail' }),
        makeCharacter(2, { name: 'Bystander', description: 'other detail' }),
      ]);

      start();
      await waitFor(() => expect(figures()).toHaveLength(2));
      await openEditForm('kept detail');

      setName('Renamed');
      activate(target.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
      await waitFor(() => expect(target.textContent).toContain('Renamed'));
      await settle();

      expect(dialog()).toBeNull();
      expectFocusOn(cardFor('kept detail'), "the edited Character's card");
    });

    it('falls back to Search when the edited Character is not on the rendered page', async () => {      const records = makeCharacters(PAGE_SIZE + 6).map((character) =>
        character.id === 'char-1' ? { ...character, description: 'the oldest record' } : character
      );
      await seedDatabase(records);

      start();
      await waitFor(() => expect(figures()).toHaveLength(PAGE_SIZE));

      // The oldest Character is only rendered once a second page arrives.
      activeObserver()!.reveal();
      await settle();
      await waitFor(() => expect(figures()).toHaveLength(PAGE_SIZE + 6));

      await openEditForm('the oldest record');

      activate(buttonWithText('Cancel')!);
      await settle();

      // The current Gallery reset stands, so that card is not rendered now.
      expect(figures()).toHaveLength(PAGE_SIZE);
      expectFocusOn(searchInput(), 'the Search field');

      // A later page must not retry the completed handover.
      activeObserver()!.reveal();
      await settle();
      expect(figures()).toHaveLength(PAGE_SIZE + 6);
      expectFocusOn(searchInput(), 'the Search field');
    });

    it('leaves a persistent control chosen during a pending edit in place', async () => {
      await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

      start();
      await waitFor(() => expect(figures()).toHaveLength(1));
      await openEditForm('Description 1');

      setName('Edited');
      activate(target.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
      addButton().focus();

      await waitFor(() => expect(target.textContent).toContain('Edited'));
      await settle();

      expect(target.querySelector('main form')).toBeNull();
      expectFocusOn(addButton(), 'the Add Character button');
    });

    it('still restores focus to the card when the lightbox closes normally', async () => {
      await seedDatabase([makeCharacter(1, { name: 'Aria' })]);

      start();
      await waitFor(() => expect(figures()).toHaveLength(1));

      const card = cardFor('Description 1');
      card.focus();
      card.click();
      await settle();
      await waitFor(() => expect(dialog()?.open).toBe(true));

      activate(target.querySelector<HTMLButtonElement>('dialog button[aria-label="Close"]')!);
      await settle();

      expect(dialog()).toBeNull();
      expectFocusOn(cardFor('Description 1'), 'the card that opened the dialog');
    });

    it('rejects a whitespace-only name without a return handover', async () => {
      await seedDatabase([]);

      start();
      await openAddForm();
      await chooseImage();

      nameInput().focus();
      setName('   ');
      target.querySelector<HTMLFormElement>('form')!.requestSubmit();
      await settle();

      expect(vi.mocked(alert)).toHaveBeenCalledWith('Name is required');
      // The submission was rejected, so the form stays and nothing moved.
      expect(target.querySelector('main form')).not.toBeNull();
      expectFocusOn(nameInput(), 'the Name field');
    });

    it('performs no return handover when a save is rejected, and keeps the draft', async () => {
      await seedDatabase([]);

      start();
      await openAddForm();
      setName('Kept Draft');
      setDescription('Keep this description');
      await chooseImage();
      const chosenImage = preview()!.getAttribute('src');

      const restore = await breakStoreMethod('put');
      activate(target.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
      await waitFor(() =>
        expect(target.querySelector('[role="alert"]')?.textContent).toContain(
          'Could not save the character'
        )
      );
      await settle();

      expect(target.querySelector('main form')).not.toBeNull();
      expect(nameInput().value).toBe('Kept Draft');
      expect(target.querySelector<HTMLTextAreaElement>('#char-desc')!.value).toBe(
        'Keep this description'
      );
      expect(preview()?.getAttribute('src')).toBe(chosenImage);
      expect(nameInput().disabled).toBe(false);
      // The form still holds focus, and no Gallery view opened to receive it.
      expectFocusOn(formHeading(), 'the form heading');
      expect(document.activeElement).not.toBe(addButton());

      restore();
    });
  });
});
