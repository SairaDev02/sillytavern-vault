import { vi, type Mock } from 'vitest';

/**
 * The browser handoff that every download path ends in: the page creates an
 * object URL, clicks a temporary link, and releases the URL later.
 *
 * jsdom supplies no object URLs and no download, so both download test files
 * stand in for them. The stubs and their undo live here once, and the recorders
 * they feed are handed to the test that installed them.
 */

/** What the stubbed `URL.createObjectURL` answers. */
export const OBJECT_URL = 'blob:character-gallery-download';

export interface DownloadHandoff {
  /** Every Blob offered to `URL.createObjectURL`, in call order. */
  readonly createObjectURL: Mock<(blob: Blob) => string>;
  /** Every release asked of `URL.revokeObjectURL`, in call order. */
  readonly revokeObjectURL: Mock<(url: string) => void>;
  /** Every link the handoff clicked, in click order. */
  readonly clicks: HTMLAnchorElement[];
  /** Undo the stubs: the two `URL` descriptors and the click spy. */
  restore(): void;
}

/**
 * Install the handoff stubs for one test, returning the recorders they feed.
 *
 * Call `restore` in `afterEach`. The `URL` methods are own properties of the
 * global `URL`, so each one is put back as it was found: redefined when the
 * environment provided it, deleted when it did not.
 */
export function installDownloadHandoff(): DownloadHandoff {
  const clicks: HTMLAnchorElement[] = [];
  const createObjectURL: Mock<(blob: Blob) => string> = vi.fn(
    (_blob: Blob): string => OBJECT_URL
  );
  const revokeObjectURL: Mock<(url: string) => void> = vi.fn((_url: string): void => {});
  const restores = [
    replaceUrlMethod('createObjectURL', createObjectURL),
    replaceUrlMethod('revokeObjectURL', revokeObjectURL),
  ];
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    clicks.push(this);
  });

  return {
    createObjectURL,
    revokeObjectURL,
    clicks,
    restore() {
      clickSpy.mockRestore();
      for (const restore of restores.reverse()) restore();
    },
  };
}

/** Replace one `URL` method, and return the undo for that replacement. */
function replaceUrlMethod(name: 'createObjectURL' | 'revokeObjectURL', value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(URL, name);
  Object.defineProperty(URL, name, { configurable: true, writable: true, value });
  return () => {
    if (original) Object.defineProperty(URL, name, original);
    else Reflect.deleteProperty(URL, name);
  };
}
