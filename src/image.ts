/**
 * Read the intrinsic pixel size of an image.
 *
 * The gallery stores these dimensions with each character so that cards can
 * reserve their aspect ratio before the image decodes.
 */
export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Failed to load the image'));
    image.src = src;
  });
}
