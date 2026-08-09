// Image URL helpers — return a CDN-optimized variant of a remote image when
// the host supports it, otherwise the original URL unchanged. Keeping this in
// one place means card components can stay dumb about hosts.
//
// Supabase image transformations are a paid feature (`/render/image/public/`).
// Set `EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM=true` in `.env.local` once the
// project is on Pro+ to flip on the rewrite. Default is off so requests don't
// 400 on Free.

const SUPABASE_TRANSFORM_ENABLED =
  (process.env.EXPO_PUBLIC_SUPABASE_IMAGE_TRANSFORM ?? '').toLowerCase() === 'true';

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

  // Fast path. Only two hosts are ever rewritten below, and with the Supabase
  // transform flag off (the default) that leaves just Unsplash — so for every
  // other URL the whole `new URL(...)` parse + reserialize was built and thrown
  // away. This runs once per image per render on a grid that recycles cards
  // while scrolling, so the parse is worth skipping. Two substring scans decide
  // it, and every case below still reaches the same code it did before. The
  // Unsplash test is an origin prefix, not a bare `includes`, so a host like
  // `images.unsplash.com.evil.test` can never reach the rewrite.
  if (
    !url.startsWith('https://images.unsplash.com/') &&
    !(SUPABASE_TRANSFORM_ENABLED && url.includes('.supabase.co'))
  ) {
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

    if (u.hostname === 'images.unsplash.com') {
      u.searchParams.set('w', String(width));
      u.searchParams.set('q', String(quality));
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
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
