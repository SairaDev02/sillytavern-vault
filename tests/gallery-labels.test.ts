// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryHarness from './GalleryHarness.svelte';
import { makeCharacter } from './fixtures';

let app: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement | undefined;
afterEach(() => {
  if (app) unmount(app);
  target?.remove();
});

it('associates persistent visible search and sort labels and retains their behavior', async () => {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(GalleryHarness, { target, props: { initial: [
    makeCharacter(1, { name: 'Bram' }), makeCharacter(2, { name: 'Aria' }),
  ] } });
  flushSync();
  const search = target.querySelector<HTMLInputElement>('input[type="search"]')!;
  const sort = target.querySelector<HTMLSelectElement>('select')!;
  expect([...search.labels!].some((label) => label.textContent?.trim())).toBe(true);
  expect([...sort.labels!].some((label) => label.textContent?.trim())).toBe(true);
  sort.value = 'name';
  sort.dispatchEvent(new Event('change', { bubbles: true }));
  await tick();
  expect(target.querySelector('figure img')?.getAttribute('alt')).toBe('Aria');
  search.value = 'Bram';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
  await vi.waitFor(() => expect(target!.querySelectorAll('figure')).toHaveLength(1));
  expect(target.querySelector('figure img')?.getAttribute('alt')).toBe('Bram');
  expect(search.labels![0].textContent?.trim()).toBeTruthy();
});
