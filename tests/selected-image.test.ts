import { describe, expect, it, vi } from 'vitest';
import { SelectedImage } from '../src/selected-image.svelte';
import { deferred, makeFile } from './fixtures';

const STORED = 'data:image/png;base64,stored';
const OLDER = 'data:image/png;base64,older';
const NEWER = 'data:image/png;base64,newer';

interface ReadCall {
  file: File;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

interface MeasureCall {
  src: string;
  resolve: (value: { width: number; height: number }) => void;
  reject: (reason: unknown) => void;
}

function makeEnvironment() {
  const reads: ReadCall[] = [];
  const measures: MeasureCall[] = [];

  const readFile = vi.fn((file: File) => {
    const pending = deferred<string>();
    reads.push({ file, resolve: pending.resolve, reject: pending.reject });
    return pending.promise;
  });

  const measure = vi.fn((src: string) => {
    const pending = deferred<{ width: number; height: number }>();
    measures.push({ src, resolve: pending.resolve, reject: pending.reject });
    return pending.promise;
  });

  return { readFile, measure, reads, measures };
}

/** Let every promise continuation queued by the module run. */
function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function completeRead(call: ReadCall, dataUrl: string) {
  call.resolve(dataUrl);
  await flush();
}

async function completeMeasure(call: MeasureCall, width: number, height: number) {
  call.resolve({ width, height });
  await flush();
}

describe('SelectedImage', () => {
  it('keeps the latest selection when reads and measurements finish out of order', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('older.png'));
    preparation.select(makeFile('newer.png'));

    await completeRead(reads[1], NEWER);
    await completeMeasure(measures[0], 200, 100);
    expect(preparation.image).toBe(NEWER);
    expect(preparation.status).toBe('ready');

    // The older selection finishes late and must not publish over the newer one.
    await completeRead(reads[0], OLDER);

    expect(measures).toHaveLength(1);
    expect(preparation.image).toBe(NEWER);
    expect(preparation.status).toBe('ready');
    expect(preparation.snapshot()).toEqual({ image: NEWER, width: 200, height: 100 });
  });

  it('ignores an obsolete measurement that finishes after the newer image is ready', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('older.png'));
    await completeRead(reads[0], OLDER);

    preparation.select(makeFile('newer.png'));
    await completeRead(reads[1], NEWER);
    // The older image was measured before the replacement was read.
    expect(measures.map((call) => call.src)).toEqual([OLDER, NEWER]);
    await completeMeasure(measures[1], 200, 100);

    // The obsolete measurement finishes last and must not reach the draft.
    await completeMeasure(measures[0], 10, 20);

    expect(preparation.image).toBe(NEWER);
    expect(preparation.snapshot()).toEqual({ image: NEWER, width: 200, height: 100 });
  });

  it('blocks submission until the current selection is read and measured', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('candidate.png'));
    expect(preparation.status).toBe('preparing');
    expect(preparation.canSubmit).toBe(false);
    expect(preparation.snapshot()).toBeNull();

    await completeRead(reads[0], NEWER);
    expect(preparation.status).toBe('preparing');
    expect(preparation.canSubmit).toBe(false);
    expect(preparation.snapshot()).toBeNull();

    await completeMeasure(measures[0], 200, 100);
    expect(preparation.status).toBe('ready');
    expect(preparation.canSubmit).toBe(true);
    expect(preparation.snapshot()).toEqual({ image: NEWER, width: 200, height: 100 });
  });

  it('blocks submission after a read failure until an explicit recovery', async () => {
    const { readFile, measure, reads } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    preparation.select(makeFile('broken.png'));
    reads[0].reject(new Error('nope'));
    await flush();

    expect(preparation.status).toBe('failed');
    expect(preparation.error).not.toBeNull();
    expect(preparation.canSubmit).toBe(false);
    expect(preparation.snapshot()).toBeNull();
    // The stored image is still visible, but it is not a silent fallback.
    expect(preparation.image).toBe(STORED);

    preparation.discard();
    expect(preparation.status).toBe('idle');
    expect(preparation.canSubmit).toBe(true);
    expect(preparation.snapshot()).toEqual({ image: STORED, width: 5, height: 6 });
  });

  it('allows saving without dimensions when measurement fails', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('unmeasurable.png'));
    await completeRead(reads[0], NEWER);
    measures[0].reject(new Error('decode failed'));
    await flush();

    expect(preparation.status).toBe('ready');
    expect(preparation.warning).not.toBeNull();
    expect(preparation.canSubmit).toBe(true);
    expect(preparation.snapshot()).toEqual({
      image: NEWER,
      width: undefined,
      height: undefined,
    });
  });

  it('ignores an obsolete failure after the newer selection is ready', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('older.png'));
    preparation.select(makeFile('newer.png'));
    await completeRead(reads[1], NEWER);
    await completeMeasure(measures[0], 200, 100);

    reads[0].reject(new Error('late failure'));
    await flush();

    expect(preparation.status).toBe('ready');
    expect(preparation.error).toBeNull();
    expect(preparation.image).toBe(NEWER);
  });

  it('blocks submission and restores the stored preview when superseded', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    preparation.select(makeFile('older.png'));
    await completeRead(reads[0], OLDER);
    await completeMeasure(measures[0], 10, 20);
    expect(preparation.snapshot()).toEqual({ image: OLDER, width: 10, height: 20 });

    preparation.select(makeFile('newer.png'));
    expect(preparation.status).toBe('preparing');
    expect(preparation.canSubmit).toBe(false);
    expect(preparation.snapshot()).toBeNull();
    // The obsolete replacement cannot stay visible as if it were current.
    expect(preparation.image).toBe(STORED);

    await completeRead(reads[1], NEWER);
    await completeMeasure(measures[1], 200, 100);
    expect(preparation.snapshot()).toEqual({ image: NEWER, width: 200, height: 100 });
  });

  it('ignores an obsolete measurement failure after the newer selection is ready', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('older.png'));
    await completeRead(reads[0], OLDER);

    preparation.select(makeFile('newer.png'));
    await completeRead(reads[1], NEWER);
    await completeMeasure(measures[1], 200, 100);

    measures[0].reject(new Error('late decode failure'));
    await flush();

    expect(preparation.status).toBe('ready');
    expect(preparation.warning).toBeNull();
    expect(preparation.snapshot()).toEqual({ image: NEWER, width: 200, height: 100 });
  });

  it('restores the stored image and dimensions when discarding during preparation', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    preparation.select(makeFile('candidate.png'));
    preparation.discard();

    expect(preparation.status).toBe('idle');
    expect(preparation.image).toBe(STORED);
    expect(preparation.snapshot()).toEqual({ image: STORED, width: 5, height: 6 });

    // Late work for the discarded selection cannot undo the restoration.
    await completeRead(reads[0], OLDER);

    expect(measures).toHaveLength(0);
    expect(preparation.status).toBe('idle');
    expect(preparation.image).toBe(STORED);
    expect(preparation.snapshot()).toEqual({ image: STORED, width: 5, height: 6 });
  });

  it('ignores a late measurement after discarding the replacement', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    preparation.select(makeFile('candidate.png'));
    await completeRead(reads[0], NEWER);
    expect(measures).toHaveLength(1);

    preparation.discard();
    await completeMeasure(measures[0], 200, 100);

    expect(preparation.status).toBe('idle');
    expect(preparation.image).toBe(STORED);
    expect(preparation.snapshot()).toEqual({ image: STORED, width: 5, height: 6 });
  });

  it('discards a ready replacement back to no image on an add form', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });

    preparation.select(makeFile('candidate.png'));
    await completeRead(reads[0], NEWER);
    await completeMeasure(measures[0], 200, 100);
    expect(preparation.canSubmit).toBe(true);

    preparation.discard();

    expect(preparation.status).toBe('idle');
    expect(preparation.image).toBe('');
    expect(preparation.canSubmit).toBe(false);
    expect(preparation.snapshot()).toBeNull();
  });

  it('starts a new preparation when the same file is selected again after a failure', async () => {
    const { readFile, measure, reads } = makeEnvironment();
    const preparation = new SelectedImage(null, { readFile, measure });
    const candidate = makeFile('candidate.png');

    preparation.select(candidate);
    reads[0].reject(new Error('nope'));
    await flush();
    expect(preparation.status).toBe('failed');

    preparation.select(candidate);
    expect(preparation.status).toBe('preparing');
    expect(reads).toHaveLength(2);
  });

  it('invalidates pending work when disposed', async () => {
    const { readFile, measure, reads, measures } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    preparation.select(makeFile('candidate.png'));
    preparation.dispose();

    await completeRead(reads[0], NEWER);

    expect(measures).toHaveLength(0);
    expect(preparation.image).toBe(STORED);
    expect(preparation.status).toBe('preparing');
    expect(preparation.snapshot()).toBeNull();

    preparation.select(makeFile('ignored.png'));
    expect(preparation.status).toBe('preparing');
  });

  it('retains the stored image and its dimensions when no replacement is chosen', () => {
    const { readFile, measure } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5, height: 6 },
      { readFile, measure }
    );

    expect(preparation.status).toBe('idle');
    expect(preparation.canSubmit).toBe(true);
    expect(preparation.snapshot()).toEqual({ image: STORED, width: 5, height: 6 });
  });

  it('drops a partial stored dimension pair instead of pairing it with a guess', () => {
    const { readFile, measure } = makeEnvironment();
    const preparation = new SelectedImage(
      { image: STORED, width: 5 },
      { readFile, measure }
    );

    expect(preparation.snapshot()).toEqual({
      image: STORED,
      width: undefined,
      height: undefined,
    });
  });
});
