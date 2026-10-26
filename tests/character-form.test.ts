// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import CharacterForm from '../src/components/CharacterForm.svelte';
import type { Character } from '../src/types';
import { deferred, makeCharacter, makeFile } from './fixtures';

const STORED = 'data:image/png;base64,stored';
const OLDER = 'data:image/png;base64,older';
const NEWER = 'data:image/png;base64,newer';

type SaveData = Omit<Character, 'id' | 'createdAt'> & { id?: string };

/** A FileReader whose completion the test controls. */
class ControlledFileReader {
  static instances: ControlledFileReader[] = [];

  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((this: FileReader, event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(_file: Blob) {
    ControlledFileReader.instances.push(this);
  }

  complete(dataUrl: string) {
    this.result = dataUrl;
    this.onload?.call(
      this as unknown as FileReader,
      new Event('load') as ProgressEvent<FileReader>
    );
  }

  fail() {
    this.error = new DOMException('read failed', 'NotFoundError');
    this.onerror?.call(
      this as unknown as FileReader,
      new Event('error') as ProgressEvent<FileReader>
    );
  }
}

/** An Image whose decode the test controls. */
class ControlledImage {
  static instances: ControlledImage[] = [];

  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';

  set src(value: string) {
    this.#src = value;
    ControlledImage.instances.push(this);
  }

  get src() {
    return this.#src;
  }

  succeed(width: number, height: number) {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

describe('CharacterForm image preparation', () => {
  let target: HTMLDivElement;
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    ControlledFileReader.instances = [];
    ControlledImage.instances = [];
    vi.stubGlobal('FileReader', ControlledFileReader);
    vi.stubGlobal('Image', ControlledImage);
    vi.stubGlobal('alert', vi.fn());
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (app) unmount(app);
    target.remove();
    vi.unstubAllGlobals();
  });

  function mountForm(
    editingCharacter: Character | null,
    onSave: (data: SaveData) => Promise<void> = vi.fn(async () => {})
  ) {
    target.innerHTML = '';
    app = mount(CharacterForm, { target, props: { editingCharacter, onSave, onCancel: vi.fn() } });
    return onSave;
  }

  const fileInput = () => target.querySelector<HTMLInputElement>('#char-image')!;
  const saveButton = () => target.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const cancelButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Cancel'
    ) as HTMLButtonElement;
  const discardButton = () =>
    [...target.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Discard replacement'
    ) as HTMLButtonElement | undefined;
  const preview = () =>
    target.querySelector<HTMLImageElement>('img[alt="Preview of the selected character"]');
  const statusText = () => target.querySelector('#char-image-status')?.textContent ?? '';

  function choose(selected: File) {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [selected], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function submit() {
    target
      .querySelector<HTMLFormElement>('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('submits the latest choice even when reads and measurements finish out of order', async () => {
    const onSave = mountForm(
      makeCharacter(1, { name: 'Stored', image: STORED, width: 5, height: 6 })
    );
    await settle();

    choose(makeFile('older.png'));
    choose(makeFile('newer.png'));
    expect(ControlledFileReader.instances).toHaveLength(2);

    ControlledFileReader.instances[1].complete(NEWER);
    await settle();
    expect(ControlledImage.instances).toHaveLength(1);
    ControlledImage.instances[0].succeed(200, 100);
    await settle();
    expect(preview()?.getAttribute('src')).toBe(NEWER);

    ControlledFileReader.instances[0].complete(OLDER);
    await settle();
    expect(preview()?.getAttribute('src')).toBe(NEWER);
    expect(ControlledImage.instances).toHaveLength(1);

    submit();
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      id: 'char-1',
      name: 'Stored',
      description: 'Description 1',
      image: NEWER,
      width: 200,
      height: 100,
    });
  });

  it('disables Save while the current selection is read and measured', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    choose(makeFile('candidate.png'));
    await settle();
    expect(saveButton().disabled).toBe(true);
    submit();
    expect(onSave).not.toHaveBeenCalled();

    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    // The file is readable, but its size is not known yet.
    expect(saveButton().disabled).toBe(true);
    submit();
    expect(onSave).not.toHaveBeenCalled();

    ControlledImage.instances[0].succeed(200, 100);
    await settle();
    expect(saveButton().disabled).toBe(false);
  });

  it('blocks submission after a read failure until the user discards or reselects', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    const candidate = makeFile('broken.png');
    choose(candidate);
    ControlledFileReader.instances[0].fail();
    await settle();

    expect(statusText()).toContain('Could not read the selected image');
    expect(saveButton().disabled).toBe(true);
    submit();
    expect(onSave).not.toHaveBeenCalled();
    // The stored image stays visible behind the error.
    expect(preview()?.getAttribute('src')).toBe(STORED);

    // Choosing the same file again after the failure starts a new preparation.
    choose(candidate);
    await settle();
    expect(ControlledFileReader.instances).toHaveLength(2);
    expect(statusText()).toContain('Preparing the selected image');
    ControlledFileReader.instances[1].complete(NEWER);
    await settle();
    ControlledImage.instances[0].succeed(200, 100);
    await settle();
    expect(saveButton().disabled).toBe(false);

    submit();
    await settle();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ image: NEWER, width: 200 }));
  });

  it('discards during preparation back to the stored image and dimensions', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    choose(makeFile('candidate.png'));
    await settle();
    discardButton()!.click();
    await settle();

    expect(preview()?.getAttribute('src')).toBe(STORED);
    expect(discardButton()).toBeUndefined();

    // The superseded read cannot undo the discard.
    ControlledFileReader.instances[0].complete(OLDER);
    await settle();
    expect(preview()?.getAttribute('src')).toBe(STORED);
    expect(ControlledImage.instances).toHaveLength(0);

    submit();
    await settle();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ image: STORED, width: 5, height: 6 })
    );
  });

  it('starts a new preparation when the same file is selected after a discard', async () => {
    mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    const candidate = makeFile('candidate.png');
    choose(candidate);
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledImage.instances[0].succeed(200, 100);
    await settle();
    expect(preview()?.getAttribute('src')).toBe(NEWER);

    discardButton()!.click();
    await settle();
    expect(preview()?.getAttribute('src')).toBe(STORED);

    choose(candidate);
    await settle();
    expect(ControlledFileReader.instances).toHaveLength(2);
    expect(statusText()).toContain('Preparing the selected image');
  });

  it('allows saving without dimensions when measurement fails', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    choose(makeFile('unmeasurable.png'));
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledImage.instances[0].fail();
    await settle();

    expect(statusText()).toContain('Could not measure the image size');
    expect(saveButton().disabled).toBe(false);
    // Dimensions from the stored image are not reused for the replacement.
    expect(preview()?.getAttribute('src')).toBe(NEWER);

    submit();
    await settle();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ image: NEWER, width: undefined, height: undefined })
    );
  });

  it('retains the stored image and dimensions when an edit picks no replacement', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    submit();
    await settle();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ image: STORED, width: 5, height: 6 })
    );
  });

  it('cannot submit an add form without an image and explains why', async () => {
    const onSave = mountForm(null);
    await settle();

    const name = target.querySelector<HTMLInputElement>('#char-name')!;
    name.value = 'Newcomer';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    expect(saveButton().disabled).toBe(true);
    expect(statusText()).toContain('Choose an image to enable saving');
    submit();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('discards a just-prepared image on an add form back to no image', async () => {
    mountForm(null);
    await settle();

    choose(makeFile('candidate.png'));
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledImage.instances[0].succeed(200, 100);
    await settle();
    expect(saveButton().disabled).toBe(false);

    discardButton()!.click();
    await settle();

    expect(preview()).toBeNull();
    expect(saveButton().disabled).toBe(true);
  });

  it('invalidates outstanding preparation when the form is cancelled and unmounted', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    choose(makeFile('older.png'));
    choose(makeFile('newer.png'));
    expect(ControlledFileReader.instances).toHaveLength(2);

    cancelButton().click();
    await settle();

    // Cancel invalidates the work before the parent unmounts the form.
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledFileReader.instances[1].fail();
    await settle();
    expect(ControlledImage.instances).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();

    unmount(app!);
    app = undefined;

    expect(target.textContent).not.toContain('Could not read the selected image');
  });

  it('invalidates outstanding preparation when unmounted without cancelling', async () => {
    const onSave = mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    choose(makeFile('older.png'));
    choose(makeFile('newer.png'));
    expect(ControlledFileReader.instances).toHaveLength(2);

    unmount(app!);
    app = undefined;

    // The onDestroy cleanup must invalidate without a Cancel click.
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledFileReader.instances[1].fail();
    await settle();

    expect(ControlledImage.instances).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('freezes the draft while saving and ignores duplicate submissions', async () => {
    const pending = deferred<void>();
    const onSave = vi.fn(() => pending.promise);
    mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }), onSave);
    await settle();

    choose(makeFile('candidate.png'));
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledImage.instances[0].succeed(200, 100);
    await settle();

    submit();
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(target.querySelector<HTMLInputElement>('#char-name')!.disabled).toBe(true);
    expect(target.querySelector<HTMLTextAreaElement>('#char-desc')!.disabled).toBe(true);
    expect(fileInput().disabled).toBe(true);
    expect(discardButton()!.disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().textContent?.trim()).toBe('Saving...');
    expect(preview()?.getAttribute('src')).toBe(NEWER);

    submit();
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);

    pending.resolve();
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(target.querySelector<HTMLInputElement>('#char-name')!.disabled).toBe(false);
    expect(fileInput().disabled).toBe(false);
    expect(cancelButton().disabled).toBe(false);
    expect(saveButton().textContent?.trim()).toBe('Save');
    expect(preview()?.getAttribute('src')).toBe(NEWER);
  });

  it('retains and unlocks the prepared draft when saving fails', async () => {
    const onSave = vi
      .fn<(data: SaveData) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);
    mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }), onSave);
    await settle();

    choose(makeFile('candidate.png'));
    ControlledFileReader.instances[0].complete(NEWER);
    await settle();
    ControlledImage.instances[0].succeed(200, 100);
    await settle();

    submit();
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    const failure = target.querySelector('[role="alert"]');
    expect(failure?.textContent).toContain('Could not save the character');
    expect(saveButton().disabled).toBe(false);
    expect(target.querySelector<HTMLInputElement>('#char-name')!.disabled).toBe(false);
    expect(preview()?.getAttribute('src')).toBe(NEWER);

    const name = target.querySelector<HTMLInputElement>('#char-name')!;
    name.value = 'Corrected';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    // Editing the draft clears the stale save failure.
    expect(target.querySelector('[role="alert"]')).toBeNull();

    submit();
    await settle();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Corrected', image: NEWER, width: 200, height: 100 })
    );
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });

  it('describes the image controls with accessible status and recovery controls', async () => {
    mountForm(makeCharacter(1, { image: STORED, width: 5, height: 6 }));
    await settle();

    expect(fileInput().getAttribute('aria-describedby')).toBe(
      'char-image-help char-image-status'
    );
    expect(target.querySelector('#char-image-status')?.getAttribute('aria-live')).toBe('polite');
    expect(target.querySelector('#char-image-status')?.getAttribute('aria-atomic')).toBe('true');

    choose(makeFile('candidate.png'));
    await settle();
    const preparing = target.querySelector('[role="status"]');
    expect(preparing?.textContent).toContain('Preparing the selected image');
    expect(discardButton()?.tagName).toBe('BUTTON');

    ControlledFileReader.instances[0].fail();
    await settle();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not read the selected image'
    );
  });
});
