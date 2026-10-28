// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryHarness from './GalleryHarness.svelte';
import { makeCharacter } from './fixtures';
import type { Character } from '../src/types';

/** A second, different image source, so a replacement is observable. */
const OTHER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAAH/k5vJ1wAAAABJRU5ErkJggg==';

const UNAVAILABLE = 'Image unavailable';

/** Flush Svelte updates plus the animation microtasks from the WAAPI stub. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

/** jsdom does not decode images, so a test reports the failure itself. */
function failImage(image: HTMLImageElement) {
  image.dispatchEvent(new Event('error'));
}

describe('Character card image', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    app = undefined;
    target.remove();
  });

  async function start(characters: Character[]) {
    app = mount(GalleryHarness, { target, props: { initial: characters } });
    await settle();
  }

  const figures = () => [...target.querySelectorAll('figure')];

  const buttonWithLabel = (label: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === label
    ) as HTMLButtonElement | undefined;

  const buttonWithText = (text: string) =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text
    ) as HTMLButtonElement | undefined;

  const checkboxes = () => [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

  function checkboxFor(name: string): HTMLInputElement | undefined {
    return checkboxes().find((box) => (box.getAttribute('aria-label') ?? '').includes(name));
  }

  /** The browse control for a Character, or its selection checkbox in select mode. */
  function controlFor(name: string): HTMLElement {
    const control = buttonWithLabel(name) ?? checkboxFor(name);
    if (!control) throw new Error(`No browse control or checkbox for ${name}`);
    return control;
  }

  function figureFor(name: string): HTMLElement {
    const figure = controlFor(name).closest('figure');
    if (!figure) throw new Error(`No card rendered for ${name}`);
    return figure as HTMLElement;
  }

  const cardImage = (name: string) =>
    figureFor(name).querySelector<HTMLImageElement>('img');

  /** The element that reserves the image shape: the one carrying `aspect-ratio`. */
  function frameFor(name: string): HTMLElement {
    const frame = figureFor(name).querySelector<HTMLElement>('[style*="aspect-ratio"]');
    if (!frame) throw new Error(`No reserved image frame for ${name}`);
    return frame;
  }

  /** The rendered `aspect-ratio` value of a card's reserved frame. */
  function frameRatio(name: string): string {
    const style = frameFor(name).getAttribute('style') ?? '';
    const match = /aspect-ratio:\s*([^;]+)/.exec(style);
    if (!match) throw new Error(`No aspect-ratio in "${style}"`);
    return match[1].replace(/\s+/g, ' ').trim();
  }

  /** The visible "Image unavailable" text inside a card's reserved frame. */
  function unavailableFallback(name: string): HTMLElement | undefined {
    return [...frameFor(name).querySelectorAll<HTMLElement>('*')].find(
      (element) => element.children.length === 0 && element.textContent?.trim() === UNAVAILABLE
    );
  }

  function accessibleName(element: Element): string {
    return (element.getAttribute('aria-label') ?? element.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The text an accessible description points at, as an AT user would hear it. */
  function descriptionOf(element: Element): string {
    const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    return ids
      .map((id) => target.querySelector(`[id="${id}"]`)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Whether any card failure was pushed through a live region. */
  const announcedUnavailable = () =>
    [...target.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')]
      .filter((element) => element.getAttribute('aria-live') !== 'off')
      .some((element) => (element.textContent ?? '').includes(UNAVAILABLE));

  const KEYBOARD_STOP =
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const keyboardStopsIn = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLElement>(KEYBOARD_STOP)].filter(
      (element) => !(element as HTMLButtonElement).disabled
    );

  describe('reserved frame', () => {
    it('reserves the stored ratio when both dimensions are usable', async () => {
      await start([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

      expect(frameRatio('Aria')).toBe('800 / 600');
      expect(cardImage('Aria')?.getAttribute('width')).toBe('800');
      expect(cardImage('Aria')?.getAttribute('height')).toBe('600');
    });

    it('uses the complete 4:3 fallback when both dimensions are missing', async () => {
      await start([makeCharacter(1, { name: 'Aria', width: undefined, height: undefined })]);

      expect(frameRatio('Aria')).toBe('4 / 3');
      expect(cardImage('Aria')?.getAttribute('width')).toBeNull();
      expect(cardImage('Aria')?.getAttribute('height')).toBeNull();
    });

    it('never pairs one stored dimension with one fallback dimension', async () => {
      await start([
        makeCharacter(1, { name: 'Only width', width: 800, height: undefined }),
        makeCharacter(2, { name: 'Only height', width: undefined, height: 600 }),
      ]);

      expect(frameRatio('Only width')).toBe('4 / 3');
      expect(frameRatio('Only height')).toBe('4 / 3');
      expect(cardImage('Only width')?.getAttribute('width')).toBeNull();
      expect(cardImage('Only height')?.getAttribute('height')).toBeNull();
    });

    const unusableSizes: Array<[string, Partial<Character>]> = [
      ['a zero width', { width: 0, height: 600 }],
      ['a zero height', { width: 800, height: 0 }],
      ['a negative width', { width: -800, height: 600 }],
      ['a negative height', { width: 800, height: -600 }],
      ['a NaN width', { width: Number.NaN, height: 600 }],
      ['an infinite height', { width: 800, height: Number.POSITIVE_INFINITY }],
      ['a null pair', { width: null as unknown as number, height: null as unknown as number }],
      [
        'textual dimensions',
        { width: '800' as unknown as number, height: '600' as unknown as number },
      ],
    ];

    for (const [description, size] of unusableSizes) {
      it(`ignores ${description}`, async () => {
        await start([makeCharacter(1, { name: 'Aria', ...size })]);

        expect(frameRatio('Aria')).toBe('4 / 3');
        expect(cardImage('Aria')?.getAttribute('width')).toBeNull();
        expect(cardImage('Aria')?.getAttribute('height')).toBeNull();
      });
    }
  });

  describe('unavailable image', () => {
    it('shows the fallback inside the reserved frame without reshaping the card', async () => {
      await start([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

      failImage(cardImage('Aria')!);
      await settle();

      expect(unavailableFallback('Aria')?.textContent?.trim()).toBe(UNAVAILABLE);
      // The stored proportions still reserve the space the image would have used.
      expect(frameRatio('Aria')).toBe('800 / 600');
      // The Character itself is still in the Gallery.
      expect(figures()).toHaveLength(1);
    });

    it('describes the browse control without announcing every failing card', async () => {
      await start([
        makeCharacter(1, { name: 'Aria', width: 800, height: 600 }),
        makeCharacter(2, { name: 'Bram', width: 800, height: 600 }),
      ]);

      failImage(cardImage('Aria')!);
      await settle();
      // Only the failed card changes; its neighbour keeps displaying its image.
      expect(unavailableFallback('Aria')).toBeDefined();
      expect(cardImage('Bram')).not.toBeNull();

      failImage(cardImage('Bram')!);
      await settle();

      for (const name of ['Aria', 'Bram']) {
        expect(accessibleName(controlFor(name))).toBe(name);
        expect(descriptionOf(controlFor(name))).toBe(UNAVAILABLE);
      }
      // Each card points at its own description, not at a shared one.
      expect(controlFor('Aria').getAttribute('aria-describedby')).not.toBe(
        controlFor('Bram').getAttribute('aria-describedby')
      );
      expect(announcedUnavailable()).toBe(false);
    });

    it('keeps the Character selectable in selection mode', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);

      failImage(cardImage('Aria')!);
      await settle();

      buttonWithText('Select')!.click();
      await settle();

      const box = checkboxFor('Aria')!;
      expect(box.checked).toBe(false);
      expect(box.getAttribute('aria-label')).toBe('Select Aria');
      expect(descriptionOf(box)).toBe(UNAVAILABLE);
      expect(announcedUnavailable()).toBe(false);

      box.click();
      await settle();

      expect(box.checked).toBe(true);
      expect(target.textContent).toContain('1 selected');
      expect(figures()).toHaveLength(1);
    });

    it('opens the Character and keeps the existing Edit path', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);

      failImage(cardImage('Aria')!);
      await settle();

      unavailableFallback('Aria')!.click();
      await settle();

      const dialog = target.querySelector('dialog');
      expect(dialog?.open).toBe(true);
      expect(dialog?.querySelector('h2')?.textContent?.trim()).toBe('Aria');

      buttonWithText('Edit')!.click();
      await settle();

      expect(app!.editedIds()).toEqual(['char-1']);
      expect(target.querySelector('dialog')?.open ?? false).toBe(false);
    });

    it('adds no per-card retry, edit, or delete control', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);
      const stopsBefore = keyboardStopsIn(figureFor('Aria')).length;

      failImage(cardImage('Aria')!);
      await settle();

      expect(keyboardStopsIn(figureFor('Aria'))).toHaveLength(stopsBefore);
      expect(figureFor('Aria').querySelectorAll('button')).toHaveLength(2);
    });
  });

  describe('failure belongs to the current source', () => {
    it('clears the failure when the image is replaced under the same Character ID', async () => {
      await start([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);
      failImage(cardImage('Aria')!);
      await settle();
      expect(unavailableFallback('Aria')).toBeDefined();

      app!.setCharacters([
        makeCharacter(1, { name: 'Aria', image: OTHER_PNG, width: 8, height: 6 }),
      ]);
      await settle();

      expect(unavailableFallback('Aria')).toBeUndefined();
      expect(cardImage('Aria')?.getAttribute('src')).toBe(OTHER_PNG);
      expect(frameRatio('Aria')).toBe('8 / 6');
      expect(controlFor('Aria').hasAttribute('aria-describedby')).toBe(false);
    });

    it('ignores a late error from the replaced image element', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);
      const obsoleteImage = cardImage('Aria')!;

      app!.setCharacters([makeCharacter(1, { name: 'Aria', image: OTHER_PNG })]);
      await settle();

      failImage(obsoleteImage);
      await settle();

      expect(unavailableFallback('Aria')).toBeUndefined();
      expect(controlFor('Aria').hasAttribute('aria-describedby')).toBe(false);
    });

    it('still marks the replacement unavailable when its own image fails', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);
      const obsoleteImage = cardImage('Aria')!;

      app!.setCharacters([makeCharacter(1, { name: 'Aria', image: OTHER_PNG })]);
      await settle();

      failImage(obsoleteImage);
      await settle();
      failImage(cardImage('Aria')!);
      await settle();

      expect(unavailableFallback('Aria')?.textContent?.trim()).toBe(UNAVAILABLE);
      expect(descriptionOf(controlFor('Aria'))).toBe(UNAVAILABLE);
    });

    it('clears the failure when a different Character takes its place', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);
      failImage(cardImage('Aria')!);
      await settle();
      expect(unavailableFallback('Aria')).toBeDefined();

      app!.setCharacters([makeCharacter(2, { name: 'Bram', image: OTHER_PNG })]);
      await settle();

      expect(figures()).toHaveLength(1);
      expect(unavailableFallback('Bram')).toBeUndefined();
      expect(controlFor('Bram').hasAttribute('aria-describedby')).toBe(false);
    });

    it('keeps the failure for a Character whose image source did not change', async () => {
      await start([makeCharacter(1, { name: 'Aria' })]);
      failImage(cardImage('Aria')!);
      await settle();

      // An edit that leaves the image alone must not pretend the image recovered.
      app!.setCharacters([makeCharacter(1, { name: 'Aria the Bold' })]);
      await settle();

      expect(unavailableFallback('Aria the Bold')?.textContent?.trim()).toBe(UNAVAILABLE);
      expect(descriptionOf(controlFor('Aria the Bold'))).toBe(UNAVAILABLE);
    });
  });
});
