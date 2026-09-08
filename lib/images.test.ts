import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  cardImageUrl,
  getOptimizedImageUrl,
  toSupabaseThumbnailUrl,
  thumbWidthFor,
  prefetchImages,
  setImagePlaceholder,
  getImagePlaceholder,
  clearImagePlaceholders,
} from '@/lib/images';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: any) => obj.ios || obj.default },
}));

vi.mock('expo-image', () => ({
  Image: { prefetch: vi.fn() },
}));

const SUPABASE_PUBLIC =
  'https://abc.supabase.co/storage/v1/object/public/listing-images/a/photo.jpg';

describe('getOptimizedImageUrl', () => {
  it('returns an empty string for nullish/empty input', () => {
    expect(getOptimizedImageUrl(null)).toBe('');
    expect(getOptimizedImageUrl(undefined)).toBe('');
    expect(getOptimizedImageUrl('')).toBe('');
  });

  it('returns the original string when the value is not a valid URL', () => {
    expect(getOptimizedImageUrl('not a url')).toBe('not a url');
  });

  it('leaves unknown hosts untouched', () => {
    const url = 'https://example.com/img.png';
    expect(getOptimizedImageUrl(url, { width: 300 })).toBe(url);
  });

  it('leaves a host that merely embeds the Unsplash name untouched', () => {
    const spoof = 'https://images.unsplash.com.evil.test/photo-1?a=b';
    expect(getOptimizedImageUrl(spoof, { width: 600 })).toBe(spoof);
  });

  it('rewrites Unsplash URLs with sizing + format params', () => {
    const out = new URL(getOptimizedImageUrl('https://images.unsplash.com/photo-1', { width: 600, quality: 80 }));
    expect(out.searchParams.get('w')).toBe('600');
    expect(out.searchParams.get('q')).toBe('80');
    expect(out.searchParams.get('auto')).toBe('format');
    expect(out.searchParams.get('fit')).toBe('crop');
  });

  it('applies default width/quality (400/70) when omitted', () => {
    const out = new URL(getOptimizedImageUrl('https://images.unsplash.com/photo-1'));
    expect(out.searchParams.get('w')).toBe('400');
    expect(out.searchParams.get('q')).toBe('70');
  });

  it('rewrites Unsplash Plus URLs with sizing + format params', () => {
    const out = new URL(
      getOptimizedImageUrl('https://plus.unsplash.com/premium_photo-123', { width: 500, quality: 75 }),
    );
    expect(out.searchParams.get('w')).toBe('500');
    expect(out.searchParams.get('q')).toBe('75');
    expect(out.searchParams.get('auto')).toBe('format');
    expect(out.searchParams.get('fit')).toBe('crop');
  });

  it('rewrites Pexels URLs with sizing params', () => {
    const out = new URL(
      getOptimizedImageUrl('https://images.pexels.com/photos/123/pexels-photo.jpeg', { width: 450 }),
    );
    expect(out.searchParams.get('w')).toBe('450');
    expect(out.searchParams.get('auto')).toBe('compress');
  });

  it('rewrites Imgix URLs with sizing params', () => {
    const out = new URL(
      getOptimizedImageUrl('https://assets.imgix.net/photo.jpg', { width: 500, quality: 80 }),
    );
    expect(out.searchParams.get('w')).toBe('500');
    expect(out.searchParams.get('q')).toBe('80');
    expect(out.searchParams.get('auto')).toBe('format');
  });

  it('rewrites Cloudinary URLs by inserting transformation segment', () => {
    const original = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    const optimized = getOptimizedImageUrl(original, { width: 400, quality: 80 });
    expect(optimized).toContain('/image/upload/w_400,q_80,f_auto,c_limit/sample.jpg');
  });

  it('leaves Supabase public URLs unchanged when the transform flag is off (default)', () => {
    // EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM is unset in the test env.
    expect(getOptimizedImageUrl(SUPABASE_PUBLIC, { width: 600 })).toBe(SUPABASE_PUBLIC);
  });
});

describe('prefetchImages', () => {
  it('handles null, undefined, or empty arrays gracefully', () => {
    expect(() => prefetchImages(null as any)).not.toThrow();
    expect(() => prefetchImages([])).not.toThrow();
    expect(() => prefetchImages(['', null as any, undefined as any])).not.toThrow();
  });
});

describe('getOptimizedImageUrl with the Supabase transform flag enabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rewrites public object URLs to the render/image endpoint with params', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM', 'true');
    vi.resetModules(); // re-evaluate the module so it re-reads the env flag
    const { getOptimizedImageUrl: fresh } = await import('@/lib/images');

    const out = new URL(fresh(SUPABASE_PUBLIC, { width: 600, quality: 80 }));
    expect(out.pathname).toContain('/storage/v1/render/image/public/');
    expect(out.pathname).not.toContain('/storage/v1/object/public/');
    expect(out.searchParams.get('width')).toBe('600');
    expect(out.searchParams.get('quality')).toBe('80');
    expect(out.searchParams.get('resize')).toBe('cover');
  });
});

describe('toSupabaseThumbnailUrl', () => {
  it('converts a full-resolution listing image URL to a thumbnail URL', () => {
    const full = 'https://abc.supabase.co/storage/v1/object/public/listing-images/a/photo.jpg';
    expect(toSupabaseThumbnailUrl(full)).toBe(
      'https://abc.supabase.co/storage/v1/object/public/listing-images/a/photo_thumb.jpg',
    );
  });

  it('keeps existing thumbnail URLs intact without duplicate suffix', () => {
    const thumb = 'https://abc.supabase.co/storage/v1/object/public/listing-images/a/photo_thumb.jpg';
    expect(toSupabaseThumbnailUrl(thumb)).toBe(thumb);
  });

  it('preserves query parameters, fragments, and host when query contains dots', () => {
    const urlWithQuery =
      'https://abc.supabase.co:8443/storage/v1/object/public/listing-images/a/photo.jpg?token=abc.def&v=1.2#frag.ment';
    expect(toSupabaseThumbnailUrl(urlWithQuery)).toBe(
      'https://abc.supabase.co:8443/storage/v1/object/public/listing-images/a/photo_thumb.jpg?token=abc.def&v=1.2#frag.ment',
    );
  });

  it('handles extensionless paths properly and preserves query parameters', () => {
    const extensionless =
      'https://abc.supabase.co/storage/v1/object/public/listing-images/a/raw_image?token=foo.bar';
    expect(toSupabaseThumbnailUrl(extensionless)).toBe(
      'https://abc.supabase.co/storage/v1/object/public/listing-images/a/raw_image_thumb?token=foo.bar',
    );
  });

  it('leaves already-suffixed extensionless thumbnail URLs intact', () => {
    const thumbExtensionless =
      'https://abc.supabase.co/storage/v1/object/public/listing-images/a/raw_image_thumb?token=foo.bar';
    expect(toSupabaseThumbnailUrl(thumbExtensionless)).toBe(thumbExtensionless);
  });

  it('leaves non-listing-images and non-supabase URLs untouched', () => {
    expect(toSupabaseThumbnailUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(toSupabaseThumbnailUrl('')).toBe('');
  });
});

describe('getOptimizedImageUrl with edge image proxy enabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('routes Supabase images through Cloudflare edge CDN (wsrv.nl) in WebP format', async () => {
    vi.stubEnv('TEST_IMAGE_PROXY', 'true');
    vi.resetModules();
    const { getOptimizedImageUrl: fresh } = await import('@/lib/images');

    const out = fresh(SUPABASE_PUBLIC, { width: 300, quality: 75 });
    expect(out).toContain('https://wsrv.nl/?url=');
    expect(out).toContain('output=webp');
    expect(out).toContain('w=300');
    expect(out).toContain('q=75');
    // For width <= 640, it points the source to _thumb.jpg
    expect(out).toContain('photo_thumb.jpg');
  });

  it('routes large Supabase images through wsrv.nl keeping master source for detail', async () => {
    vi.stubEnv('TEST_IMAGE_PROXY', 'true');
    vi.resetModules();
    const { getOptimizedImageUrl: fresh } = await import('@/lib/images');

    const out = fresh(SUPABASE_PUBLIC, { width: 1080, quality: 85 });
    expect(out).toContain('https://wsrv.nl/?url=');
    expect(out).toContain('output=webp');
    expect(out).toContain('w=1080');
    expect(out).toContain('photo.jpg');
    expect(out).not.toContain('photo_thumb.jpg');
  });

  it('leaves non-Supabase URLs whose path or query contains .supabase.co untouched', async () => {
    vi.stubEnv('TEST_IMAGE_PROXY', 'true');
    vi.resetModules();
    const { getOptimizedImageUrl: fresh } = await import('@/lib/images');

    const nonSupabaseUrl1 = 'https://example.com/photo.jpg?source=abc.supabase.co';
    expect(fresh(nonSupabaseUrl1, { width: 300 })).toBe(nonSupabaseUrl1);

    const nonSupabaseUrl2 = 'https://evil.com/fake.supabase.co/image.png';
    expect(fresh(nonSupabaseUrl2, { width: 300 })).toBe(nonSupabaseUrl2);

    const nonSupabaseUrl3 = 'https://not-supabase.co/storage/v1/object/public/listing-images/photo.jpg';
    expect(fresh(nonSupabaseUrl3, { width: 300 })).toBe(nonSupabaseUrl3);
  });
});

describe('thumbWidthFor', () => {
  it('scales the display size by ~1.5x', () => {
    expect(thumbWidthFor(400)).toBe(600);
  });

  it('clamps to a 200px floor', () => {
    expect(thumbWidthFor(10)).toBe(200);
    expect(thumbWidthFor(0)).toBe(200);
  });

  it('clamps to a 1600px ceiling', () => {
    expect(thumbWidthFor(5000)).toBe(1600);
  });

  it('rounds to an integer', () => {
    expect(Number.isInteger(thumbWidthFor(333))).toBe(true);
  });
});

describe('cardImageUrl', () => {
  const FULL = 'https://abc.supabase.co/storage/v1/object/public/listing-images/a/p.jpg';
  const THUMB = 'https://abc.supabase.co/storage/v1/object/public/listing-images/a/p_thumb.jpg';

  it('prefers the thumbnail when one exists', () => {
    expect(cardImageUrl({ images: [FULL], thumbnails: [THUMB] })).toBe(THUMB);
  });

  it('falls back to the full image when thumbnails is null (legacy row)', () => {
    expect(cardImageUrl({ images: [FULL], thumbnails: null })).toBe(FULL);
  });

  it('falls back when the column was not selected at all', () => {
    expect(cardImageUrl({ images: [FULL] })).toBe(FULL);
  });

  it('falls back per index when the arrays are ragged', () => {
    // A thumbnail upload can fail for one photo and succeed for another, and a
    // partially-written row must not blank out the card.
    const listing = { images: [FULL, FULL, FULL], thumbnails: [THUMB] };
    expect(cardImageUrl(listing, 0)).toBe(THUMB);
    expect(cardImageUrl(listing, 1)).toBe(FULL);
    expect(cardImageUrl(listing, 2)).toBe(FULL);
  });

  it('treats an empty-string thumbnail as missing rather than rendering nothing', () => {
    expect(cardImageUrl({ images: [FULL], thumbnails: [''] })).toBe(FULL);
  });

  it('returns an empty string when the row has no photos at all', () => {
    expect(cardImageUrl({ images: null, thumbnails: null })).toBe('');
    expect(cardImageUrl({ images: [] }, 0)).toBe('');
    expect(cardImageUrl({ images: [FULL] }, 5)).toBe('');
  });

  it('defaults to index 0', () => {
    expect(cardImageUrl({ images: [FULL, 'other'], thumbnails: [THUMB, 'other_thumb'] })).toBe(THUMB);
  });
});

describe('placeholderCache', () => {
  beforeEach(() => {
    clearImagePlaceholders();
  });

  it('stores and retrieves a placeholder by listing id', () => {
    setImagePlaceholder('listing-1', 'https://example.com/thumb.jpg');
    expect(getImagePlaceholder('listing-1')).toBe('https://example.com/thumb.jpg');
  });

  it('returns undefined for missing or nullish ids', () => {
    expect(getImagePlaceholder('unknown')).toBeUndefined();
    expect(getImagePlaceholder(null)).toBeUndefined();
    expect(getImagePlaceholder(undefined)).toBeUndefined();
  });

  it('ignores nullish inputs to setImagePlaceholder', () => {
    setImagePlaceholder(null, 'https://example.com/thumb.jpg');
    setImagePlaceholder('listing-2', null);
    setImagePlaceholder('', '');
    expect(getImagePlaceholder('listing-2')).toBeUndefined();
  });

  it('clears all cached entries', () => {
    setImagePlaceholder('listing-1', 'https://example.com/1.jpg');
    setImagePlaceholder('listing-2', 'https://example.com/2.jpg');
    clearImagePlaceholders();
    expect(getImagePlaceholder('listing-1')).toBeUndefined();
    expect(getImagePlaceholder('listing-2')).toBeUndefined();
  });
});
