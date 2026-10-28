/**
 * Display rules shared by every image view (Gallery card, lightbox).
 *
 * Neither rule changes stored data: they decide how a stored Character is
 * rendered when its image cannot be sized or displayed.
 */

/** The 4:3 frame used whenever the stored dimensions cannot describe the image. */
export const FALLBACK_IMAGE_SIZE = { width: 4, height: 3 } as const;

/** Text shown in place of an image that cannot be displayed. */
export const IMAGE_UNAVAILABLE_TEXT = 'Image unavailable';

export interface ImageSize {
  width: number;
  height: number;
}

type StoredSize = { width?: number; height?: number } | null | undefined;

function isUsableDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Whether stored width and height can describe the image. Both must be finite
 * numbers greater than zero: a missing or broken half says nothing reliable
 * about the image, so it must not supply either side of the frame.
 */
export function isUsableImageSize(size: StoredSize): size is ImageSize {
  return isUsableDimension(size?.width) && isUsableDimension(size?.height);
}

/**
 * The frame an image reserves. The stored pair supplies it only when both
 * dimensions are usable; otherwise the complete 4:3 fallback does. A stored
 * dimension is never paired with a fallback one.
 */
export function imageFrameSize(size: StoredSize): ImageSize {
  if (!isUsableImageSize(size)) return { ...FALLBACK_IMAGE_SIZE };
  return { width: size.width, height: size.height };
}

/**
 * The source the element of a failing image event still shows. A failure is
 * recorded against this string, so a late event from an element whose source
 * was replaced names the old source and cannot describe what is on screen now.
 */
export function failedImageSource(event: Event): string | null {
  const element = event.currentTarget as HTMLImageElement | null;
  return element?.getAttribute('src') ?? null;
}

/** The CSS `aspect-ratio` value for an image's reserved frame. */
export function imageFrameAspectRatio(size: StoredSize): string {
  const frame = imageFrameSize(size);
  return `${frame.width} / ${frame.height}`;
}

/**
 * Whether a recorded failure still describes the image on screen. A failure
 * belongs to the source string it happened on, so replacing the source clears
 * it and a late event from the replaced source cannot resurface it.
 */
export function isImageUnavailable(source: string, failedSource: string | null): boolean {
  return failedSource === source;
}
