import type { Character } from './types';

/** Matches `data:<mime>[;param...],<payload>` and captures the three parts. */
const DATA_URL_PATTERN = /^data:([^,;]+)((?:;[^,]*)?),(.*)$/s;

/** How long the object URL for a download stays alive before it is released. */
const OBJECT_URL_LIFETIME_MS = 60_000;

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

  const mime = match[1].trim().toLowerCase();
  const parameters = match[2];
  const payload = match[3];

  if (!mime.startsWith('image/')) {
    throw new Error(`Unsupported data URL type: ${mime}`);
  }

  const isBase64 = parameters
    .split(';')
    .some((parameter) => parameter.trim().toLowerCase() === 'base64');

  if (!isBase64) {
    throw new Error('Unsupported data URL: expected base64 encoding');
  }

  // `ext` is only a convenience for callers that build a filename from it, so
  // keep it to plain letters and digits.
  const subtype = mime.slice(mime.indexOf('/') + 1);
  const ext = subtype.split('+')[0].replace(/[^a-z0-9]/g, '') || 'png';

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

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(character.name)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // The browser reads the blob after the click returns. Releasing the URL
  // immediately can cancel the download, so release it later instead.
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
