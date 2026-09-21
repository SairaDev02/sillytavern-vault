import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateId } from '../src/id';

describe('generateId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('should generate non-empty string IDs', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should use crypto.randomUUID when it is available', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000000');
    vi.stubGlobal('crypto', { randomUUID });

    expect(generateId()).toBe('00000000-0000-4000-8000-000000000000');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('should fall back when crypto.randomUUID is not available', () => {
    // Plain HTTP console access has no crypto.randomUUID.
    vi.stubGlobal('crypto', {});

    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });
});
