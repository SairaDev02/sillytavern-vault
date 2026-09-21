import type { Character } from './types';

/**
 * Parse a data URL into its components.
 */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/(\w+));base64,(.*)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }
  return {
    mime: match[1],
    base64: match[3],
    ext: match[2],
  };
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

/**
 * Sanitize a filename for download.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim();
  return cleaned || 'character';
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
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
