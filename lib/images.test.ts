import { describe, it, expect, afterEach, vi } from 'vitest';
import { cardImageUrl, getOptimizedImageUrl, thumbWidthFor } from '@/lib/images';

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

  it('leaves Supabase public URLs unchanged when the transform flag is off (default)', () => {
    // EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM is unset in the test env.
    expect(getOptimizedImageUrl(SUPABASE_PUBLIC, { width: 600 })).toBe(SUPABASE_PUBLIC);
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
