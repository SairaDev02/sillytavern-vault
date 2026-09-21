/**
 * Create a unique id for a character record.
 *
 * `crypto.randomUUID` is available in every browser that supports IndexedDB over
 * a secure context. The fallback keeps the app usable when the gallery is served
 * over plain HTTP, which is how local SillyTavern installs are often reached.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}
