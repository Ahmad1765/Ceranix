import { describe, it, expect, vi } from 'vitest';

// upload.ts pulls in expo/supabase modules at import time; stub the ones that
// touch native or network so the pure path helper can be tested in isolation.
// react-native ships Flow-typed source that vitest cannot parse, so it has to
// be stubbed even though thumbPathFor never touches it.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Image: { getSize: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { storage: { from: () => ({}) } } }));
vi.mock('expo-file-system/legacy', () => ({ readAsStringAsync: vi.fn(), EncodingType: { Base64: 'base64' } }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('base64-arraybuffer', () => ({ decode: vi.fn() }));

const { thumbPathFor } = await import('@/lib/upload');

describe('thumbPathFor', () => {
  // Upload writes the thumbnail here and delete removes it from here. If the
  // two ever disagree, uploads silently orphan objects in storage forever.
  it('inserts the suffix before the extension', () => {
    expect(thumbPathFor('user/123/abc.jpg')).toBe('user/123/abc_thumb.jpg');
  });

  it('preserves non-jpg extensions', () => {
    expect(thumbPathFor('user/123/abc.png')).toBe('user/123/abc_thumb.png');
    expect(thumbPathFor('user/123/abc.webp')).toBe('user/123/abc_thumb.webp');
  });

  it('appends when there is no extension', () => {
    expect(thumbPathFor('user/123/abc')).toBe('user/123/abc_thumb');
  });

  it('only splits on the FINAL dot, so dotted folders survive', () => {
    expect(thumbPathFor('u/v1.2/abc.jpg')).toBe('u/v1.2/abc_thumb.jpg');
  });

  it('is not idempotent — never apply it twice', () => {
    // Guards against a future caller double-deriving and deleting the wrong key.
    expect(thumbPathFor(thumbPathFor('a/b.jpg'))).toBe('a/b_thumb_thumb.jpg');
  });
});
