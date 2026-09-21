import { describe, it, expect } from 'vitest';
import { parseDataUrl, base64ToBlob, sanitizeFilename } from '../src/download';

describe('parseDataUrl', () => {
  it('should parse PNG data URL', () => {
    const result = parseDataUrl('data:image/png;base64,iVBORw0KGgo=');
    expect(result.mime).toBe('image/png');
    expect(result.base64).toBe('iVBORw0KGgo=');
    expect(result.ext).toBe('png');
  });

  it('should parse JPEG data URL', () => {
    const result = parseDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(result.mime).toBe('image/jpeg');
    expect(result.base64).toBe('/9j/4AAQSkZJRg==');
    expect(result.ext).toBe('jpeg');
  });

  it('should parse WebP data URL', () => {
    const result = parseDataUrl('data:image/webp;base64,UklGRnoAAABXRUJQVlA4IA==');
    expect(result.mime).toBe('image/webp');
    expect(result.base64).toBe('UklGRnoAAABXRUJQVlA4IA==');
    expect(result.ext).toBe('webp');
  });

  it('should parse subtypes that contain a plus sign', () => {
    const result = parseDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
    expect(result.mime).toBe('image/svg+xml');
    expect(result.base64).toBe('PHN2Zz48L3N2Zz4=');
    expect(result.ext).toBe('svg');
  });

  it('should accept uppercase types and extra parameters', () => {
    const uppercase = parseDataUrl('data:IMAGE/PNG;BASE64,AAAA');
    expect(uppercase.mime).toBe('image/png');
    expect(uppercase.base64).toBe('AAAA');

    const withCharset = parseDataUrl('data:image/png;charset=utf-8;base64,AAAA');
    expect(withCharset.mime).toBe('image/png');
    expect(withCharset.base64).toBe('AAAA');
  });

  it('should keep commas that belong to the payload', () => {
    expect(parseDataUrl('data:image/png;base64,AA,BB').base64).toBe('AA,BB');
  });

  it('should throw on invalid data URL', () => {
    expect(() => parseDataUrl('not-a-data-url')).toThrow('Invalid data URL');
  });

  it('should throw on a non-image data URL', () => {
    expect(() => parseDataUrl('data:text/plain;base64,SGk=')).toThrow(/Unsupported data URL type/);
  });

  it('should throw when the payload is not base64 encoded', () => {
    expect(() => parseDataUrl('data:image/svg+xml,<svg></svg>')).toThrow(/expected base64/);
  });
});

describe('base64ToBlob', () => {
  it('should convert base64 to blob with correct type', async () => {
    // "Hello" in base64
    const base64 = 'SGVsbG8=';
    const blob = base64ToBlob(base64, 'image/png');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(5);

    // Verify content
    const text = await blob.text();
    expect(text).toBe('Hello');
  });
});

describe('sanitizeFilename', () => {
  it('should strip illegal filename characters', () => {
    expect(sanitizeFilename('Test:Character?')).toBe('TestCharacter');
    expect(sanitizeFilename('A/B\\C*D"E<F>G|H')).toBe('ABCDEFGH');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  Test  ')).toBe('Test');
  });

  it('should return fallback for empty name', () => {
    expect(sanitizeFilename('')).toBe('character');
    expect(sanitizeFilename(':*?"<>|')).toBe('character');
  });

  it('should keep normal names unchanged', () => {
    expect(sanitizeFilename('My Character')).toBe('My Character');
    expect(sanitizeFilename('char_123')).toBe('char_123');
  });

  it('should replace names that Windows reserves', () => {
    expect(sanitizeFilename('CON')).toBe('character');
    expect(sanitizeFilename('nul.png')).toBe('character');
    expect(sanitizeFilename('lpt1')).toBe('character');
  });

  it('should strip trailing dots and control characters', () => {
    expect(sanitizeFilename('Character...')).toBe('Character');
    expect(sanitizeFilename('Char\u0000acter')).toBe('Character');
    expect(sanitizeFilename('Character. ')).toBe('Character');
  });

  it('should not mangle dots inside a name', () => {
    expect(sanitizeFilename('v1.2.3')).toBe('v1.2.3');
  });
});
