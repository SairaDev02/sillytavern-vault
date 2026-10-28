// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryHarness from './GalleryHarness.svelte';
import { makeCharacter, makeCharacters } from './fixtures';

/**
 * Minimal IntersectionObserver double. It records every observer and the
 * elements it watches, so a test can fire the "sentinel is visible" callback
 * the same way a browser would.
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

  /** Elements this observer watches that are still in the document. */
  get watchedConnectedElements(): Element[] {
    return [...this.elements].filter((el) => el.isConnected);
  }

  /** Stale observers watch elements that were removed from the document. */
  get isStale(): boolean {
    return this.elements.size > 0 && this.watchedConnectedElements.length === 0;
  }

  trigger(isIntersecting: boolean) {
    const target = [...this.elements][0];
    if (!target) throw new Error('Observer is not watching any element');
    this.callback(
      [{ isIntersecting, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

/** The observer that is watching a sentinel which is still in the document. */
function activeObserver(): MockIntersectionObserver | undefined {
  return MockIntersectionObserver.instances.find(
    (observer) => observer.watchedConnectedElements.length > 0
  );
}

/** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

describe('Gallery incremental loading', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    target.remove();
    vi.unstubAllGlobals();
  });

  const renderedCount = () => target.querySelectorAll('figure').length;
  const hasSentinel = () => target.textContent?.includes('Loading more') ?? false;

  async function start(initialCount: number) {
    app = mount(GalleryHarness, {
      target,
      props: { initial: makeCharacters(initialCount) },
    });
    await settle();
  }

  const selectButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Select'
    ) as HTMLButtonElement | undefined;
  const clearSearchButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Clear search'
    ) as HTMLButtonElement | undefined;
  const checkboxes = () => [
    ...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];

  async function fillSearch(value: string) {
    const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  it('renders one page, then loads another page when the sentinel is visible', async () => {
    await start(30);

    expect(renderedCount()).toBe(24);
    expect(hasSentinel()).toBe(true);

    activeObserver()?.trigger(true);
    await settle();

    expect(renderedCount()).toBe(30);
    expect(hasSentinel()).toBe(false);
  });

  it('starts paginating when the sentinel first appears after mount', async () => {
    // A short gallery renders no sentinel, so nothing is observed yet.
    await start(5);
    expect(hasSentinel()).toBe(false);
    expect(MockIntersectionObserver.instances).toHaveLength(0);

    // Saving a character reloads the list; the gallery now needs pagination.
    app!.setCharacters(makeCharacters(30));
    await settle();

    expect(hasSentinel()).toBe(true);
    expect(activeObserver()).toBeDefined();

    activeObserver()?.trigger(true);
    await settle();

    expect(renderedCount()).toBe(30);
  });

  it('focuses the first rendered checkbox when selection mode starts', async () => {
    // More Characters than one page, so the list is filtered and truncated.
    await start(30);
    expect(renderedCount()).toBe(24);

    selectButton()!.click();
    await settle();

    const boxes = checkboxes();
    expect(boxes).toHaveLength(24);

    // Focus lands on the first checkbox in the rendered document order, not on
    // a Character that the filter matched but the page has not rendered yet.
    expect(document.activeElement, 'focus should be on the first rendered checkbox').toBe(
      boxes[0]
    );
    expect(boxes[0].getAttribute('aria-label')).toContain('Character 30');
    expect(
      checkboxes().some((box) => box.checked),
      'entry focus must not select the Character'
    ).toBe(false);
  });

  it('watches the live sentinel after the list is replaced', async () => {
    await start(30);
    expect(activeObserver()).toBeDefined();

    // Shrinking the list removes the sentinel element.
    app!.setCharacters(makeCharacters(5));
    await settle();
    expect(hasSentinel()).toBe(false);

    // Growing it again creates a new sentinel element to watch.
    app!.setCharacters(makeCharacters(30, 100));
    await settle();

    expect(MockIntersectionObserver.instances.some((observer) => observer.isStale)).toBe(false);
    expect(activeObserver()).toBeDefined();

    activeObserver()?.trigger(true);
    await settle();

    expect(renderedCount()).toBe(30);
  });

  it('starts the restored results at the first page when a search is cleared', async () => {
    await start(30);

    // Search matches the whole library, so the sentinel can add a second page.
    await fillSearch('Character');
    activeObserver()?.trigger(true);
    await settle();
    expect(renderedCount()).toBe(30);

    // The library is replaced while the term is still active, so the same term
    // now matches nothing: the Gallery is in its no-match state, not empty.
    app!.setCharacters(
      Array.from({ length: 30 }, (_, i) => makeCharacter(i + 1, { name: `Card ${i + 1}` }))
    );
    await settle();
    expect(renderedCount()).toBe(0);

    clearSearchButton()!.click();
    await settle();

    // Clear search is an ordinary search change: the first page comes back.
    expect(renderedCount()).toBe(24);
    expect(hasSentinel()).toBe(true);
  });
});
