// Image URL helpers — return a CDN-optimized variant of a remote image when
// the host supports it, otherwise the original URL unchanged. Keeping this in
// one place means card components can stay dumb about hosts.
//
// Supabase image transformations are a paid feature (`/render/image/public/`).
// Set `EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true` in `.env.local` once the
// project is on Pro+ to flip on the rewrite. Default is off so requests don't
// 400 on Free.

import { Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

const SUPABASE_TRANSFORM_ENABLED =
  (process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM ?? '').toLowerCase() === 'true';

export const IMAGE_TRANSITION = Platform.OS === 'web' ? 0 : 120;

type Opts = {
  width?: number;
  quality?: number;
};

export function getOptimizedImageUrl(
  url: string | undefined | null,
  opts: Opts = {},
): string {
  if (!url) return '';
  const { width = 400, quality = 70 } = opts;

  // Fast check: only rewrite known CDN hosts that support parameter-based resizing
  const isUnsplash =
    url.startsWith('https://images.unsplash.com/') ||
    url.startsWith('https://plus.unsplash.com/');
  const isCloudinary = url.startsWith('https://res.cloudinary.com/');
  const isPexels = url.startsWith('https://images.pexels.com/');
  const isImgix = url.includes('.imgix.net');
  const isSupabase = SUPABASE_TRANSFORM_ENABLED && url.includes('.supabase.co');

  if (!isUnsplash && !isCloudinary && !isPexels && !isImgix && !isSupabase) {
    return url;
  }

  try {
    const u = new URL(url);

    if (
      SUPABASE_TRANSFORM_ENABLED &&
      u.hostname.endsWith('.supabase.co') &&
      u.pathname.includes('/storage/v1/object/public/')
    ) {
      u.pathname = u.pathname.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/',
      );
      u.searchParams.set('width', String(width));
      u.searchParams.set('quality', String(quality));
      u.searchParams.set('resize', 'cover');
      return u.toString();
    }

    if (u.hostname === 'images.unsplash.com' || u.hostname === 'plus.unsplash.com') {
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', String(quality));
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
      return u.toString();
    }

    if (u.hostname === 'images.pexels.com') {
      u.searchParams.set('auto', 'compress');
      u.searchParams.set('cs', 'tinysrgb');
      u.searchParams.set('w', String(width));
      return u.toString();
    }

    if (u.hostname.endsWith('.imgix.net')) {
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', String(quality));
      u.searchParams.set('auto', 'format');
      return u.toString();
    }

    if (u.hostname === 'res.cloudinary.com' && u.pathname.includes('/image/upload/')) {
      const transformSegment = `w_${width},q_${quality},f_auto,c_limit`;
      if (!u.pathname.includes('w_') && !u.pathname.includes('c_limit')) {
        u.pathname = u.pathname.replace('/image/upload/', `/image/upload/${transformSegment}/`);
      }
      return u.toString();
    }

    return url;
  } catch {
    return url;
  }
}

// Map a typical display size to a sensible source width. Bumps up for
// retina by a factor of ~1.5 so the decoded bitmap still has detail without
// pulling down a 3000px master.
export function thumbWidthFor(displayPx: number): number {
  return Math.min(1600, Math.max(200, Math.round(displayPx * 1.5)));
}

/**
 * The URL a *card-sized* surface should render for `listing.images[index]`.
 *
 * Prefers the stored thumbnail (listings.thumbnails, written at upload time by
 * lib/upload.ts) and falls back to the full-size image. The fallback is the
 * normal path for anything created before that column existed, and for any
 * upload whose thumbnail generation failed — so it is a supported state, not an
 * error case.
 *
 * Read thumbnails through this rather than indexing the array directly: it is
 * absent entirely from queries that don't select the column, in which case
 * every caller must still get a working image.
 *
 * Full-size surfaces — the product hero, the fullscreen viewer — must NOT use
 * this. They want `listing.images[index]`.
 */
export function cardImageUrl(
  listing: { images?: string[] | null; thumbnails?: string[] | null },
  index = 0,
): string {
  return listing.thumbnails?.[index] || listing.images?.[index] || '';
}

/**
 * Safely prefetch an array of remote image URLs into memory and disk cache.
 * Deduplicates inputs, skips empty entries, and bounds batch size.
 */
export function prefetchImages(urls: (string | undefined | null)[]): void {
  if (!urls || !urls.length) return;
  const valid = Array.from(
    new Set(
      urls.filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0 && u.startsWith('http'),
      ),
    ),
  ).slice(0, 12);

  if (valid.length === 0) return;
  try {
    if (typeof ExpoImage?.prefetch === 'function') {
      ExpoImage.prefetch(valid, 'memory-disk');
    }
  } catch {
    // Non-fatal background optimization
  }
}

