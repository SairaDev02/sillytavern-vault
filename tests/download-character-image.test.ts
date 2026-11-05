// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCharacterImage, sanitizeFilename } from '../src/download';
import { installDownloadHandoff, type DownloadHandoff } from './download-handoff';
import { makeCharacter } from './fixtures';

/**
 * The Image download operation: a Character's stored data URL in, one file
 * handed to the browser out.
 *
 * jsdom neither decodes images nor paints a canvas, so the source paths that
 * need either run against a controlled loader and a controlled canvas.
 * Everything between them is the real operation.
 */

/** A source the fake loader decodes at a known natural size. */
const NATURAL_WIDTH = 64;
const NATURAL_HEIGHT = 48;

const JPEG_SOURCE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/** A PNG data URL whose payload is exactly the eight-byte PNG signature. */
const PNG_SOURCE = 'data:image/png;base64,iVBORw0KGgo=';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

class LoadedImage {
  static instances: LoadedImage[] = [];

  naturalWidth = NATURAL_WIDTH;
  naturalHeight = NATURAL_HEIGHT;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';

  constructor() {
    LoadedImage.instances.push(this);
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this.#src;
  }
}

class FailingImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onerror?.());
  }

  get src() {
    return this.#src;
  }
}

interface CanvasRequest {
  type: string | undefined;
  width: number;
  height: number;
}

interface CanvasStubOptions {
  /** What `getContext` answers, or null to model a canvas with no 2D context. */
  context?: CanvasRenderingContext2D | null;
  /** What the encoder produces, or null to model an encoder that gives up. */
  produced?: Blob | null;
}

const EMPTY_CONTEXT = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

/** Stub the canvas the conversion draws on, and record what it is asked for. */
function stubCanvas(options: CanvasStubOptions = {}): CanvasRequest[] {
  const context = 'context' in options ? options.context : EMPTY_CONTEXT;
  const encoded = 'produced' in options ? options.produced : new Blob(['encoded']);
  const produced = encoded as Blob | null;
  const requests: CanvasRequest[] = [];

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as RenderingContext | null
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string
  ) {
    requests.push({ type, width: this.width, height: this.height });
    callback(produced);
  });

  return requests;
}

/** The handoff the operation ends in, as this test observes it. */
let handoff: DownloadHandoff;

/** The blob that was handed off, as the object URL received it. */
function handedOffBlob(): Blob {
  return handoff.createObjectURL.mock.calls[0][0];
}

function expectNoHandoff(): void {
  expect(handoff.createObjectURL).not.toHaveBeenCalled();
  expect(handoff.clicks).toHaveLength(0);
}

describe('downloadCharacterImage', () => {
  beforeEach(() => {
    LoadedImage.instances = [];
    vi.stubGlobal('Image', LoadedImage);
    handoff = installDownloadHandoff();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    handoff.restore();
  });

  it('hands off a PNG source byte for byte, without decoding it', async () => {
    await downloadCharacterImage(makeCharacter(1, { image: PNG_SOURCE }));

    const blob = handedOffBlob();
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual(PNG_SIGNATURE);
    expect(LoadedImage.instances).toHaveLength(0);
    expect(handoff.clicks).toHaveLength(1);
  });

  it('asks the canvas for a PNG at the source image size and hands that blob off', async () => {
    const produced = new Blob(['encoded'], { type: 'image/png' });
    const requests = stubCanvas({ produced });

    await downloadCharacterImage(makeCharacter(2, { image: JPEG_SOURCE }));

    expect(requests).toEqual([
      { type: 'image/png', width: NATURAL_WIDTH, height: NATURAL_HEIGHT },
    ]);
    expect(handoff.createObjectURL.mock.calls[0][0]).toBe(produced);
    expect(handoff.clicks).toHaveLength(1);
  });

  it('names the file after the sanitized Character name, whatever the source', async () => {
    stubCanvas();
    const name = 'Bad:Name?';

    await downloadCharacterImage(makeCharacter(3, { name, image: JPEG_SOURCE }));

    expect(handoff.clicks).toHaveLength(1);
    expect(handoff.clicks[0].download).toBe(`${sanitizeFilename(name)}.png`);
  });

  it('rejects a source that is not a data URL, with no handoff', async () => {
    await expect(
      downloadCharacterImage(makeCharacter(4, { image: 'not-a-data-url' }))
    ).rejects.toThrow();

    expectNoHandoff();
  });

  it('rejects a source that is not an image, with no handoff', async () => {
    await expect(
      downloadCharacterImage(makeCharacter(5, { image: 'data:text/plain;base64,SGk=' }))
    ).rejects.toThrow();

    expectNoHandoff();
  });

  it('rejects a payload that is not base64, with no handoff', async () => {
    await expect(
      downloadCharacterImage(makeCharacter(6, { image: 'data:image/png;base64,%%%' }))
    ).rejects.toThrow();

    expectNoHandoff();
  });

  it('rejects a source the browser cannot load, with no handoff', async () => {
    vi.stubGlobal('Image', FailingImage);
    // A canvas that would succeed, so only the failed load can stop the handoff.
    stubCanvas();

    await expect(
      downloadCharacterImage(makeCharacter(7, { image: JPEG_SOURCE }))
    ).rejects.toThrow();

    expectNoHandoff();
  });

  it('rejects a canvas with no 2D context, with no handoff', async () => {
    stubCanvas({ context: null });

    await expect(
      downloadCharacterImage(makeCharacter(8, { image: JPEG_SOURCE }))
    ).rejects.toThrow();

    expectNoHandoff();
  });

  it('rejects a failed PNG encode, with no handoff', async () => {
    stubCanvas({ produced: null });

    await expect(
      downloadCharacterImage(makeCharacter(9, { image: JPEG_SOURCE }))
    ).rejects.toThrow();

    expectNoHandoff();
  });
});
