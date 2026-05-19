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
