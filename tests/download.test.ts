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

  it('should throw on invalid data URL', () => {
    expect(() => parseDataUrl('not-a-data-url')).toThrow('Invalid data URL');
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
});
