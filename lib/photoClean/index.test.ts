import { describe, it, expect } from 'vitest';
import { cleanPhoto } from '@/lib/photoClean';

describe('cleanPhoto (default stub)', () => {
  it('returns ok:false and echoes the original so callers fall back', async () => {
    const out = await cleanPhoto({ uri: 'file://x.jpg', base64: 'ZZZ' });
    expect(out).toEqual({ uri: 'file://x.jpg', base64: 'ZZZ', faceCount: 0, ok: false });
  });
});
