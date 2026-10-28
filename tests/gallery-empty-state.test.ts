// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryHarness from './GalleryHarness.svelte';
import type { Character } from '../src/types';
import { makeCharacter } from './fixtures';

/**
 * The Gallery's empty states and the recovery they offer, at the Gallery seam:
 * a Character list that can be replaced while a search is active is the only
 * way to reach a no-match state that already carries a selection.
 */
describe('Gallery empty states', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    target.remove();
  });

  /** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
  async function settle() {
    for (let i = 0; i < 5; i += 1) {
      flushSync();
      await tick();
    }
    flushSync();
  }

  async function start(characters: Character[]) {
    app = mount(GalleryHarness, { target, props: { initial: characters } });
    await settle();
  }

  const figures = () => target.querySelectorAll('figure');
  const buttonWithText = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label
    ) as HTMLButtonElement | undefined;
  const checkboxes = () => [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const checkboxFor = (name: string) =>
    checkboxes().find((box) => box.getAttribute('aria-label') === `Select ${name}`);

  async function fillSearch(value: string) {
    const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  it('keeps the selection and selection mode and focuses the first card after Clear search', async () => {
    await start([makeCharacter(1, { name: 'Aria' }), makeCharacter(2, { name: 'Bram' })]);

    await fillSearch('Aria');
    expect(figures()).toHaveLength(1);

    buttonWithText('Select')!.click();
    await settle();
    checkboxFor('Aria')!.click();
    await settle();
    expect(target.textContent).toContain('1 selected');

    // The library changes under the active search, so the term now matches
    // nothing while a selection and selection mode are still in place.
    app!.setCharacters([
      makeCharacter(1, { name: 'Renamed' }),
      makeCharacter(2, { name: 'Bram' }),
    ]);
    await settle();
    expect(figures()).toHaveLength(0);

    buttonWithText('Clear search')!.click();
    await settle();

    // Newest first, so Bram leads the restored results.
    expect(figures()).toHaveLength(2);
    const boxes = checkboxes();
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute('aria-label')).toBe('Select Bram');

    // Focus lands on the leading checkbox without toggling it, the earlier
    // selection survives, and selection mode is still on.
    expect(document.activeElement, 'focus should be on the first rendered checkbox').toBe(boxes[0]);
    expect(boxes[0].checked).toBe(false);
    expect(checkboxFor('Renamed')!.checked).toBe(true);
    expect(target.textContent).toContain('1 selected');
    expect(buttonWithText('Cancel')).toBeDefined();
  });

  it('falls back to Cancel when clearing the search leaves no card to focus', async () => {
    await start([makeCharacter(1, { name: 'Aria' })]);

    await fillSearch('zzz');
    expect(figures()).toHaveLength(0);

    buttonWithText('Select')!.click();
    await settle();
    expect(document.activeElement).toBe(buttonWithText('Cancel'));

    const clear = buttonWithText('Clear search')!;
    // The last Character disappears as the click lands, so the restored list is
    // the genuine empty one: there is no checkbox, and Cancel is the way out.
    app!.setCharacters([]);
    clear.click();
    await settle();

    expect(figures()).toHaveLength(0);
    expect(target.textContent).toContain('No characters yet');
    expect(target.textContent).not.toContain('No characters match your search');
    expect(document.activeElement, 'focus should be on Cancel').toBe(buttonWithText('Cancel'));
  });
});
