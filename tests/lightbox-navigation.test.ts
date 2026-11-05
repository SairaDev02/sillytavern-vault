// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryHarness from './GalleryHarness.svelte';
import { makeCharacter, makeCharacters } from './fixtures';
import { PAGE_SIZE } from '../src/gallery-utils';
import type { Character } from '../src/types';

/**
 * Minimal `IntersectionObserver` double. A full page keeps a sentinel in the
 * document, and jsdom has no observer to watch it. This one never fires, so the
 * Gallery stays on its first page unless a test says otherwise.
 */
class IdleIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('Lightbox navigation over the Gallery order', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', IdleIntersectionObserver);
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    app = undefined;
    target.remove();
    vi.unstubAllGlobals();
  });

  /** Mount the Gallery with the list the page would publish. */
  async function start(initial: Character[]) {
    app = mount(GalleryHarness, { target, props: { initial } });
    await settle();
  }

  /** Publish a new list, the way the page does after a save or a Restore. */
  async function publish(next: Character[]) {
    app!.setCharacters(next);
    await settle();
  }

  const dialog = () => target.querySelector('dialog');

  /** The Character the open dialog shows. */
  const shownName = () => normalize(dialog()?.querySelector('h2')?.textContent);

  /** The dialog's position line, which reads `<position> / <result size>`. */
  const counterText = () => {
    const spans = [...(dialog()?.querySelectorAll('span') ?? [])];
    const position = spans
      .map((span) => normalize(span.textContent))
      .find((text) => /^\d+ \/ \d+$/.test(text));
    return position ?? null;
  };

  const control = (label: 'Previous character' | 'Next character') =>
    dialog()?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  /** The card a person would open, in the Gallery's rendered order. */
  const cardFor = (id: string) =>
    target.querySelector<HTMLButtonElement>(`button[data-character-id="${id}"]`);

  const renderedIds = () =>
    [...target.querySelectorAll<HTMLButtonElement>('button[data-character-id]')].map(
      (card) => card.dataset.characterId
    );

  /**
   * Focus the card, then open it. The dialog captures the focused element as
   * its trigger, so focusing first is what makes the return check meaningful.
   */
  async function openCard(id: string) {
    const card = cardFor(id);
    if (!card) throw new Error(`No rendered card for ${id}`);
    card.focus();
    card.click();
    await settle();
    expect(dialog()?.open).toBe(true);
  }

  async function pressArrow(key: 'ArrowLeft' | 'ArrowRight') {
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await settle();
  }

  /**
   * Close the dialog the way a keyboard user does: focus the Close control,
   * then activate it. The dialog holds the focus as it closes, so the return to
   * the opening card is observable rather than a focus that never moved.
   */
  async function closeDialog() {
    const close = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    close.focus();
    close.click();
    await settle();
  }

  /** Type into the Gallery's search field, as the toolbar does. */
  async function search(term: string) {
    const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = term;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  it('steps through the search result only, counting the result', async () => {
    // The library holds more Characters than the search shows, and the three
    // matches are its newest records, so the order is stable and explicit.
    const library = [
      ...makeCharacters(30),
      makeCharacter(101, { name: 'Marker C' }),
      makeCharacter(102, { name: 'Marker B' }),
      makeCharacter(103, { name: 'Marker A' }),
    ];
    await start(library);

    await search('Marker');
    expect(renderedIds()).toEqual(['char-103', 'char-102', 'char-101']);

    await openCard('char-103');
    expect(shownName()).toBe('Marker A');
    expect(counterText()).toBe('1 / 3');
    expect(control('Previous character')!.disabled).toBe(true);
    expect(control('Next character')!.disabled).toBe(false);

    // The buttons step by one within the result.
    control('Next character')!.click();
    await settle();
    expect(shownName()).toBe('Marker B');
    expect(counterText()).toBe('2 / 3');
    expect(control('Previous character')!.disabled).toBe(false);
    expect(control('Next character')!.disabled).toBe(false);

    // The arrow keys take the same path.
    await pressArrow('ArrowRight');
    expect(shownName()).toBe('Marker C');
    expect(counterText()).toBe('3 / 3');
    expect(control('Next character')!.disabled).toBe(true);

    // The end of the result is the end of the navigation: a further step does
    // not reach a Character the search hides.
    await pressArrow('ArrowRight');
    expect(shownName()).toBe('Marker C');
    expect(counterText()).toBe('3 / 3');
    expect(dialog()?.open).toBe(true);

    await pressArrow('ArrowLeft');
    expect(shownName()).toBe('Marker B');
    expect(counterText()).toBe('2 / 3');

    await pressArrow('ArrowLeft');
    expect(shownName()).toBe('Marker A');
    expect(counterText()).toBe('1 / 3');
    expect(control('Previous character')!.disabled).toBe(true);
    expect(dialog()?.open).toBe(true);
  });

  it('reaches a Character beyond the loaded page, then returns focus to the opening card', async () => {
    const library = makeCharacters(30);
    await start(library);

    // One page is rendered, newest first, so the last card is the 24th record.
    const rendered = renderedIds();
    expect(rendered).toHaveLength(PAGE_SIZE);
    const opener = rendered[PAGE_SIZE - 1]!;
    expect(opener).toBe('char-7');
    expect(cardFor('char-6')).toBeNull();

    await openCard(opener);
    expect(shownName()).toBe('Character 7');
    expect(counterText()).toBe('24 / 30');

    // Next steps to a record the loaded page never rendered.
    control('Next character')!.click();
    await settle();
    expect(shownName()).toBe('Character 6');
    expect(counterText()).toBe('25 / 30');
    expect(cardFor('char-6')).toBeNull();
    expect(dialog()?.open).toBe(true);

    await closeDialog();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(cardFor(opener));
  });

  it('keeps the same Character open when a publish adds Characters, and follows the new order', async () => {
    // Newest first: Charlie, Bravo, Alpha.
    const initial = [
      makeCharacter(1, { name: 'Alpha', createdAt: 1_000 }),
      makeCharacter(2, { name: 'Bravo', createdAt: 2_000 }),
      makeCharacter(3, { name: 'Charlie', createdAt: 3_000 }),
    ];
    await start(initial);

    await openCard('char-2');
    expect(shownName()).toBe('Bravo');
    expect(counterText()).toBe('2 / 3');

    // A publish that adds a record between the neighbours, as a Restore of a
    // newer record does. The open Character keeps its identity.
    await publish([...initial, makeCharacter(4, { name: 'Delta', createdAt: 2_500 })]);

    expect(dialog()?.open).toBe(true);
    expect(shownName()).toBe('Bravo');
    expect(counterText()).toBe('3 / 4');

    // The neighbours are the new order's, not the order the dialog opened in.
    control('Previous character')!.click();
    await settle();
    expect(shownName()).toBe('Delta');
    expect(counterText()).toBe('2 / 4');

    await pressArrow('ArrowRight');
    expect(shownName()).toBe('Bravo');
    expect(counterText()).toBe('3 / 4');

    await pressArrow('ArrowRight');
    expect(shownName()).toBe('Alpha');
    expect(counterText()).toBe('4 / 4');
    expect(control('Next character')!.disabled).toBe(true);
  });
});
