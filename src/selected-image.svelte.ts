import { measureImage } from './image';

/**
 * The image-related part of the character form.
 *
 * One instance belongs to one form draft. It hides the coordination rules that
 * used to live in the form: which selection is current, which dimensions belong
 * to which image, whether the draft can be submitted, and what a discard
 * restores. Async results from superseded work never reach the active draft.
 */

export type PreparationStatus = 'idle' | 'preparing' | 'ready' | 'failed';

export interface ImageSnapshot {
  image: string;
  width?: number;
  height?: number;
}

export interface SelectedImageDeps {
  readFile?: (file: File) => Promise<string>;
  measure?: (src: string) => Promise<{ width: number; height: number }>;
}

interface StoredImage {
  image: string;
  width: number | undefined;
  height: number | undefined;
}

const READ_ERROR =
  'Could not read the selected image. Choose another file or discard the replacement.';
const MEASURE_WARNING =
  'Could not measure the image size. The character saves without dimensions and ' +
  'the gallery measures them later.';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/** Keep a known width and height only as a pair; both describe the same image. */
function normalizeStored(initial: ImageSnapshot | null): StoredImage | null {
  if (!initial?.image) return null;

  const hasSize = typeof initial.width === 'number' && typeof initial.height === 'number';
  return {
    image: initial.image,
    width: hasSize ? initial.width : undefined,
    height: hasSize ? initial.height : undefined,
  };
}

export class SelectedImage {
  readonly #readFile: (file: File) => Promise<string>;
  readonly #measure: (src: string) => Promise<{ width: number; height: number }>;
  readonly #stored: StoredImage | null;

  #generation = 0;
  #disposed = false;

  #status = $state<PreparationStatus>('idle');
  #image = $state('');
  #width = $state<number | undefined>(undefined);
  #height = $state<number | undefined>(undefined);
  #error = $state<string | null>(null);
  #warning = $state<string | null>(null);

  constructor(initial: ImageSnapshot | null, deps: SelectedImageDeps = {}) {
    this.#readFile = deps.readFile ?? readFileAsDataUrl;
    this.#measure = deps.measure ?? measureImage;
    this.#stored = normalizeStored(initial);
    this.#restoreStored();
  }

  /** The image the form should show, including the stored image before a choice. */
  get image(): string {
    return this.#image;
  }

  get status(): PreparationStatus {
    return this.#status;
  }

  /** A read failure that blocks submission until the user recovers. */
  get error(): string | null {
    return this.#error;
  }

  /** A measurement failure that does not block saving. */
  get warning(): string | null {
    return this.#warning;
  }

  /** True when the current image and its dimensions are safe to submit. */
  get canSubmit(): boolean {
    return this.#image !== '' && (this.#status === 'idle' || this.#status === 'ready');
  }

  /** True while a replacement, or its failure, is waiting for recovery. */
  get hasReplacement(): boolean {
    return this.#status !== 'idle';
  }

  /** Start preparing a replacement. The latest call wins. */
  select(file: File): void {
    if (this.#disposed) return;

    const generation = ++this.#generation;
    this.#status = 'preparing';
    this.#error = null;
    this.#warning = null;
    // Show the stored image while the replacement is prepared. Dimensions
    // belong to the previous image, so they cannot survive a new choice.
    this.#restoreStored();
    this.#width = undefined;
    this.#height = undefined;

    void this.#prepare(file, generation);
  }

  /** Return to the stored image and its dimensions, or to no image on add. */
  discard(): void {
    if (this.#disposed) return;

    this.#generation += 1;
    this.#status = 'idle';
    this.#error = null;
    this.#warning = null;
    this.#restoreStored();
  }

  /**
   * A plain snapshot for submission, or null while the draft is not saveable.
   * The object is a copy so a later preparation cannot change a draft in flight.
   */
  snapshot(): ImageSnapshot | null {
    if (!this.canSubmit) return null;
    return { image: this.#image, width: this.#width, height: this.#height };
  }

  /** Invalidate every outstanding result. The form calls this on unmount. */
  dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
  }

  #isCurrent(generation: number): boolean {
    return !this.#disposed && generation === this.#generation;
  }

  #restoreStored(): void {
    this.#image = this.#stored?.image ?? '';
    this.#width = this.#stored?.width;
    this.#height = this.#stored?.height;
  }

  async #prepare(file: File, generation: number): Promise<void> {
    let dataUrl: string;
    try {
      dataUrl = await this.#readFile(file);
    } catch {
      if (!this.#isCurrent(generation)) return;
      // Show the stored image behind the error. Submission stays blocked, so
      // this is never a silent fallback to the previous image.
      this.#restoreStored();
      this.#status = 'failed';
      this.#error = READ_ERROR;
      return;
    }

    if (!this.#isCurrent(generation)) return;
    this.#image = dataUrl;

    try {
      const size = await this.#measure(dataUrl);
      if (!this.#isCurrent(generation)) return;
      this.#width = size.width;
      this.#height = size.height;
      this.#status = 'ready';
    } catch {
      if (!this.#isCurrent(generation)) return;
      this.#width = undefined;
      this.#height = undefined;
      this.#warning = MEASURE_WARNING;
      this.#status = 'ready';
    }
  }
}
