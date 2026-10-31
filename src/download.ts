import type { Character } from './types';

/** Matches `data:<mime>[;param...],<payload>` and captures the three parts. */
const DATA_URL_PATTERN = /^data:([^,;]+)((?:;[^,]*)?),(.*)$/s;

/**
 * The ASCII HTTP token characters (`tchar` in RFC 9110), which WHATWG MIME
 * parsing requires of a type and a subtype: no space, no extra slash, and
 * never empty.
 */
const HTTP_TOKEN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

/** A media type's top-level type, compared without regard to ASCII case. */
const IMAGE_TYPE = /^image$/i;

/** How long the object URL for a download stays alive before it is released. */
export const OBJECT_URL_LIFETIME_MS = 60_000;

/**
 * Parse a base64 image data URL into its components.
 *
 * The MIME type may carry parameters (`;charset=utf-8`) and may contain `+`
 * (`image/svg+xml`), so the pattern cannot assume a simple `image/<word>` form.
 */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string; ext: string } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid data URL');
  }

  const typeText = match[1].trim();
  const parameters = match[2];
  const payload = match[3];

  const separator = typeText.indexOf('/');
  const type = separator === -1 ? typeText : typeText.slice(0, separator);
  const subtype = separator === -1 ? '' : typeText.slice(separator + 1);

  // Checked as written, before lower-casing: some non-ASCII code points
  // lower-case to an ASCII letter (the Kelvin sign to `k`), so a check made
  // afterwards would admit a type WHATWG MIME parsing does not accept.
  if (!IMAGE_TYPE.test(type) || !HTTP_TOKEN.test(subtype)) {
    throw new Error(`Unsupported data URL type: ${typeText.toLowerCase()}`);
  }

  // Lower-cased only once the type is known to be ASCII, so the returned type
  // is the canonical `image/<subtype>` the rest of the app compares against.
  const mime = `${type.toLowerCase()}/${subtype.toLowerCase()}`;

  const isBase64 = parameters
    .split(';')
    .some((parameter) => parameter.trim().toLowerCase() === 'base64');

  if (!isBase64) {
    throw new Error('Unsupported data URL: expected base64 encoding');
  }

  // `ext` is only a convenience for callers that build a filename from it, so
  // keep it to plain letters and digits.
  const ext = subtype.toLowerCase().split('+')[0].replace(/[^a-z0-9]/g, '') || 'png';

  return { mime, base64: payload, ext };
}

/**
 * Convert base64 string to a Blob.
 */
export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** Filenames Windows refuses regardless of extension. */
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitize a filename for download.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '') // characters Windows forbids in a name
    .replace(/[\u0000-\u001f\u007f]/g, '') // control characters
    .trim()
    .replace(/[. ]+$/, ''); // Windows drops trailing dots and spaces

  if (!cleaned || RESERVED_WINDOWS_NAMES.test(cleaned.split('.')[0])) {
    return 'character';
  }

  return cleaned;
}

/**
 * Convert any image data URL to PNG via canvas (browser only).
 */
async function convertToPng(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for PNG conversion'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  ctx.drawImage(img, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/png'
    );
  });
}

/**
 * Hand a Blob to the browser as a download through a temporary link.
 *
 * The browser reads the blob after the click returns, so releasing the URL
 * immediately can cancel the download. Release it later instead. This is the
 * one place both the image download and the Backup are delivered from.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

/**
 * Download a character's image as PNG.
 * - PNG source: decode base64 directly to Blob (fast path, no canvas)
 * - JPEG/WebP source: load via Image, draw to canvas, export as PNG
 */
export async function downloadCharacterImage(character: Character): Promise<void> {
  const { mime, base64 } = parseDataUrl(character.image);

  let blob: Blob;
  if (mime === 'image/png') {
    // Fast path: already PNG, just decode base64
    blob = base64ToBlob(base64, 'image/png');
  } else {
    // Convert to PNG via canvas
    blob = await convertToPng(character.image);
  }

  downloadBlob(blob, `${sanitizeFilename(character.name)}.png`);
}
