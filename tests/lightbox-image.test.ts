// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LightboxHarness from './LightboxHarness.svelte';
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

describe('Lightbox image', () => {
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

  async function open(characters: Character[], selectedId?: string) {
    app = mount(LightboxHarness, {
      target,
      props: { initial: characters, selectedId: selectedId ?? characters[0].id },
    });
    await settle();
  }

  const dialog = () => target.querySelector<HTMLDialogElement>('dialog');

  /** The element that reserves the image shape: the one carrying `aspect-ratio`. */
  function frame(): HTMLElement {
    const element = dialog()?.querySelector<HTMLElement>('[style*="aspect-ratio"]');
    if (!element) throw new Error('No reserved image frame in the lightbox');
    return element;
  }

  /** The rendered `aspect-ratio` value of the reserved frame. */
  function frameRatio(): string {
    const style = frame().getAttribute('style') ?? '';
    const match = /aspect-ratio:\s*([^;]+)/.exec(style);
    if (!match) throw new Error(`No aspect-ratio in "${style}"`);
    return match[1].replace(/\s+/g, ' ').trim();
  }

  const lightboxImage = () => dialog()?.querySelector<HTMLImageElement>('img');

  function buttonWithText(text: string): HTMLButtonElement | undefined {
    return [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === text
    );
  }

  function buttonWithLabel(label: string): HTMLButtonElement | undefined {
    return [...(dialog()?.querySelectorAll('button') ?? [])].find(
      (button) => button.getAttribute('aria-label') === label
    );
  }

  /** The visible "Image unavailable" text inside the reserved frame. */
  function unavailableFallback(): HTMLElement | undefined {
    return [...frame().querySelectorAll<HTMLElement>('*')].find(
      (element) => element.children.length === 0 && element.textContent?.trim() === UNAVAILABLE
    );
  }

  /** The polite status the dialog exposes for the displayed image. */
  const statusInDialog = () => dialog()?.querySelector<HTMLElement>('[role="status"]');

  const KEYBOARD_STOP =
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const keyboardStops = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLElement>(KEYBOARD_STOP)].filter(
      (element) => !(element as HTMLButtonElement).disabled
    );

  function expectFocusOn(element: Element | null | undefined, description: string) {
    expect(element, `no control found for ${description}`).toBeTruthy();
    expect(document.activeElement, `focus should be on ${description}`).toBe(element);
  }

  describe('reserved frame', () => {
    it('reserves the stored ratio when both dimensions are usable', async () => {
      await open([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

      expect(frameRatio()).toBe('800 / 600');
      expect(lightboxImage()?.getAttribute('width')).toBe('800');
      expect(lightboxImage()?.getAttribute('height')).toBe('600');
    });

    it('uses the complete 4:3 fallback when both dimensions are missing', async () => {
      await open([makeCharacter(1, { name: 'Aria', width: undefined, height: undefined })]);

      expect(frameRatio()).toBe('4 / 3');
      expect(lightboxImage()?.getAttribute('width')).toBeNull();
      expect(lightboxImage()?.getAttribute('height')).toBeNull();
    });

    it('never pairs one stored dimension with one fallback dimension', async () => {
      await open([
        makeCharacter(1, { name: 'Only width', width: 800, height: undefined }),
        makeCharacter(2, { name: 'Only height', width: undefined, height: 600 }),
      ]);

      expect(frameRatio()).toBe('4 / 3');
      expect(lightboxImage()?.getAttribute('width')).toBeNull();

      app!.show('char-2');
      await settle();

      expect(frameRatio()).toBe('4 / 3');
      expect(lightboxImage()?.getAttribute('height')).toBeNull();
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
        await open([makeCharacter(1, { name: 'Aria', ...size })]);

        expect(frameRatio()).toBe('4 / 3');
        expect(lightboxImage()?.getAttribute('width')).toBeNull();
        expect(lightboxImage()?.getAttribute('height')).toBeNull();
      });
    }
  });

  describe('unavailable image', () => {
    it('shows the fallback inside the reserved frame without closing the dialog', async () => {
      await open([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

      failImage(lightboxImage()!);
      await settle();

      expect(unavailableFallback()?.textContent?.trim()).toBe(UNAVAILABLE);
      // The stored proportions still reserve the space the image would have used.
      expect(frameRatio()).toBe('800 / 600');
      expect(dialog()?.open).toBe(true);
      expect(app!.isOpen()).toBe(true);
      expect(dialog()?.querySelector('h2')?.textContent?.trim()).toBe('Aria');
    });

    it('exposes the failure as polite status without moving focus', async () => {
      await open([makeCharacter(1, { name: 'Aria' })]);

      const download = buttonWithText('Download')!;
      download.focus();

      failImage(lightboxImage()!);
      await settle();

      const status = statusInDialog();
      expect(status, 'a status element inside the dialog').toBeDefined();
      expect(status!.getAttribute('role')).toBe('status');
      expect(status!.getAttribute('aria-live')).toBe('polite');
      expect(status!.textContent?.replace(/\s+/g, ' ').trim()).toBe(UNAVAILABLE);
      expectFocusOn(download, 'the Download button');
      expect(dialog()?.open).toBe(true);
    });

    it('keeps Download, Edit, Delete, and navigation without adding a retry control', async () => {
      await open([
        makeCharacter(1, { name: 'Aria', width: 800, height: 600 }),
        makeCharacter(2, { name: 'Bram', width: 800, height: 600 }),
      ]);

      const stopsBefore = keyboardStops(dialog()!).length;
      failImage(lightboxImage()!);
      await settle();

      expect(keyboardStops(dialog()!)).toHaveLength(stopsBefore);
      for (const text of ['Download', 'Edit', 'Delete']) {
        expect(buttonWithText(text), `${text} button`).toBeDefined();
      }
      expect(buttonWithLabel('Previous character')).toBeDefined();
      expect(buttonWithLabel('Next character')).toBeDefined();

      const retry = [...dialog()!.querySelectorAll('button')].filter((button) =>
        /retry/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`)
      );
      expect(retry).toHaveLength(0);
    });

    it('keeps the existing Edit path for an unavailable image', async () => {
      await open([makeCharacter(1, { name: 'Aria' })]);

      failImage(lightboxImage()!);
      await settle();

      buttonWithText('Edit')!.click();
      await settle();

      expect(app!.editedIds()).toEqual(['char-1']);
      expect(target.querySelector('dialog')).toBeNull();
    });
  });

  describe('failure belongs to the displayed image', () => {
    it('clears the failure when navigating to another Character', async () => {
      // Both Characters share one image source, so only the Character identity
      // can decide that the next view starts without a failure.
      await open([
        makeCharacter(1, { name: 'Aria' }),
        makeCharacter(2, { name: 'Bram' }),
      ]);

      failImage(lightboxImage()!);
      await settle();
      expect(unavailableFallback()).toBeDefined();

      app!.show('char-2');
      await settle();

      expect(dialog()?.querySelector('h2')?.textContent?.trim()).toBe('Bram');
      expect(unavailableFallback()).toBeUndefined();
      expect(lightboxImage()).not.toBeNull();
      expect(statusInDialog()?.textContent?.trim() ?? '').toBe('');
    });

    it('clears the failure when the image is replaced under the same Character ID', async () => {
      await open([makeCharacter(1, { name: 'Aria', width: 800, height: 600 })]);

      failImage(lightboxImage()!);
      await settle();
      expect(unavailableFallback()).toBeDefined();

      app!.setCharacters([
        makeCharacter(1, { name: 'Aria', image: OTHER_PNG, width: 8, height: 6 }),
      ]);
      await settle();

      expect(unavailableFallback()).toBeUndefined();
      expect(lightboxImage()?.getAttribute('src')).toBe(OTHER_PNG);
      expect(frameRatio()).toBe('8 / 6');
      expect(statusInDialog()?.textContent?.trim() ?? '').toBe('');
    });

    it('ignores a late error from the replaced image element', async () => {
      await open([makeCharacter(1, { name: 'Aria' })]);
      const obsoleteImage = lightboxImage()!;

      app!.setCharacters([makeCharacter(1, { name: 'Aria', image: OTHER_PNG })]);
      await settle();

      failImage(obsoleteImage);
      await settle();

      expect(unavailableFallback()).toBeUndefined();
      expect(statusInDialog()?.textContent?.trim() ?? '').toBe('');
    });

    it('ignores a late error from a Character the dialog has left', async () => {
      await open([
        makeCharacter(1, { name: 'Aria' }),
        makeCharacter(2, { name: 'Bram', image: OTHER_PNG }),
      ]);
      const obsoleteImage = lightboxImage()!;

      app!.show('char-2');
      await settle();

      failImage(obsoleteImage);
      await settle();

      expect(unavailableFallback()).toBeUndefined();
      expect(statusInDialog()?.textContent?.trim() ?? '').toBe('');
    });

    it('still marks the replacement unavailable when its own image fails', async () => {
      await open([makeCharacter(1, { name: 'Aria' })]);
      const obsoleteImage = lightboxImage()!;

      app!.setCharacters([makeCharacter(1, { name: 'Aria', image: OTHER_PNG })]);
      await settle();

      failImage(obsoleteImage);
      await settle();
      failImage(lightboxImage()!);
      await settle();

      expect(unavailableFallback()?.textContent?.trim()).toBe(UNAVAILABLE);
      expect(statusInDialog()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(UNAVAILABLE);
    });

    it('keeps the failure for a Character whose image source did not change', async () => {
      await open([makeCharacter(1, { name: 'Aria' })]);

      failImage(lightboxImage()!);
      await settle();

      // An edit that leaves the image alone must not pretend the image recovered.
      app!.setCharacters([makeCharacter(1, { name: 'Aria the Bold' })]);
      await settle();

      expect(dialog()?.querySelector('h2')?.textContent?.trim()).toBe('Aria the Bold');
      expect(unavailableFallback()?.textContent?.trim()).toBe(UNAVAILABLE);
    });
  });
});
