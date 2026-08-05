// Backfill listings.thumbnails for rows that predate the column.
//
// WHY THIS EXISTS
// lib/upload.ts generates a card-sized copy of every listing photo at UPLOAD
// time, so only listings created after that shipped have one. Older rows keep
// `thumbnails = NULL`, and lib/images.cardImageUrl() then falls back to the
// full-size original — a ~1.1 MB file rendered into a ~194px grid tile. That
// is what exhausted this project's 5 GB/month cached-egress quota on 2026-08-05
// and got the whole REST API restricted with HTTP 402.
//
// This script closes that gap once. New uploads never need it.
//
// WHAT IT PRODUCES
// Byte-for-byte the same artifacts the app writes, so a backfilled row is
// indistinguishable from a freshly uploaded one:
//   • same storage bucket          — listing-images
//   • same path convention         — foo.jpg -> foo_thumb.jpg (thumbPathFor)
//   • same encoding                — JPEG, long edge 640, quality 0.72
//   • same failure contract        — a photo whose thumbnail can't be made
//                                    keeps its full-size URL in the array,
//                                    exactly like uploadListingImages() does
//
// USAGE
//   npm i --no-save sharp                     # see the sharp note below
//   export SUPABASE_SERVICE_ROLE_KEY=...      # NOT the anon key — see below
//   node scripts/backfill-listing-thumbnails.mjs            # dry run
//   node scripts/backfill-listing-thumbnails.mjs --apply    # write
//
// FLAGS
//   --apply      actually write (default is a dry run that touches nothing)
//   --limit N    process at most N listings — good for a cautious first pass
//   --force      rebuild thumbnails even for rows that already have them
//
// Safe to re-run: storage uploads use upsert, and rows that already have a
// complete thumbnails array are skipped unless --force is passed.
//
// NOTE ON THE DRY RUN
// A dry run writes nothing, but it still DOWNLOADS every original in order to
// measure it — currently ~19 MB across the 17 listing photos. That is egress,
// on the very quota that caused this problem. It is a rounding error against a
// 5 GB allowance, but don't loop it: one dry run, then --apply.

import { readFileSync } from 'node:fs';
// Imported explicitly rather than leaned on as a global: the repo's ESLint
// config doesn't declare Node globals for .mjs, and the lint CI gate fails on
// bare `Buffer`.
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

// ── Encoding constants ──────────────────────────────────────────────────────
// Mirrored from lib/upload.ts. If they change there, change them here — a
// backfilled thumbnail should never be visibly different from an uploaded one.
// (sharp takes quality as 1-100 where the app's expo-image-manipulator takes
// 0-1, hence 0.72 -> 72.)
const THUMB_MAX_EDGE = 640;
const THUMB_QUALITY = 72;
const BUCKET = 'listing-images';

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  if (i < 0) return null;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
})();

const fmtKB = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// ── Env ─────────────────────────────────────────────────────────────────────
// The URL comes from .env.local (same value the app uses) but the KEY must be
// supplied through the environment and is deliberately not read from any file:
// the service-role key bypasses RLS entirely and must never land in a file that
// could be committed.
//
// Service role is genuinely required here, not convenience. The RLS policy on
// listings is `auth.uid() = seller_id`, so no single signed-in user can update
// other sellers' rows — and this backfill spans every seller. Storage writes
// have the same problem.
function readEnvLocal(key) {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  readEnvLocal('EXPO_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) die('No Supabase URL. Set EXPO_PUBLIC_SUPABASE_URL in .env.local.');
if (!SERVICE_KEY) {
  die(
    'SUPABASE_SERVICE_ROLE_KEY is not set.\n\n' +
      '  Dashboard → Project Settings → API → service_role (secret)\n\n' +
      '  PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."\n' +
      '  bash:        export SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n' +
      'It bypasses RLS, which this backfill needs in order to touch every\n' +
      "seller's listings. Do not put it in .env.local.",
  );
}

// ── sharp ───────────────────────────────────────────────────────────────────
// Loaded dynamically and intentionally NOT a dependency in package.json. sharp
// ships platform-specific native binaries, and this repo has already been
// broken twice by exactly that shape of optional/transitive native dep — once
// on `npm ci` in CI (@emnapi) and once on the Vercel build (metro). A one-off
// maintenance script is not worth reopening that door, so install it
// out-of-tree with --no-save when you run the backfill.
let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  die(
    'sharp is not installed.\n\n' +
      '  npm i --no-save sharp\n\n' +
      'Deliberately not in package.json: it carries native binaries, and\n' +
      'optional native deps have broken this repo\'s CI and Vercel builds\n' +
      'before. --no-save keeps package.json and the lockfile untouched.',
  );
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Storage path for a thumbnail, derived from its full-size sibling.
 * Mirrors thumbPathFor() in lib/upload.ts — the upload side, the delete side
 * and this backfill must agree on the naming or thumbnails leak on delete.
 */
function thumbPathFor(fullPath) {
  const dot = fullPath.lastIndexOf('.');
  return dot < 0 ? `${fullPath}_thumb` : `${fullPath.slice(0, dot)}_thumb${fullPath.slice(dot)}`;
}

/**
 * Object path inside BUCKET, from a public URL. Same split deleteListingImages()
 * uses. Returns null for anything not served out of our bucket (an externally
 * hosted image can't be backfilled — it isn't ours to re-encode).
 */
function storagePathFromUrl(url) {
  const parts = String(url).split(`/${BUCKET}/`);
  if (parts.length < 2) return null;
  // Strip any query string (transform params, cache busters).
  return parts[1].split('?')[0];
}

/** Detect the 402 the whole project is restricted behind, and say so plainly. */
function isRestricted(err) {
  const s = JSON.stringify(err ?? '');
  return s.includes('exceed_') || s.includes('restricted') || s.includes('402');
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log(`\n${APPLY ? '● APPLY' : '○ DRY RUN'} — listing thumbnail backfill`);
console.log(`  project: ${SUPABASE_URL}`);
if (!APPLY) console.log('  (nothing will be written; re-run with --apply)');
console.log('');

let query = sb
  .from('listings')
  .select('id, title, images, thumbnails')
  .order('created_at', { ascending: true });
if (LIMIT) query = query.limit(LIMIT);

const { data: listings, error: selErr } = await query;

if (selErr) {
  if (isRestricted(selErr)) {
    die(
      'The project is still API-restricted (HTTP 402, exceed_cached_egress_quota).\n\n' +
        'Storage and REST are both cut off, so the backfill cannot read the\n' +
        'originals yet. Restore service first (upgrade the plan, or wait for\n' +
        'the billing cycle to reset), then re-run this.',
    );
  }
  die(`Could not read listings: ${selErr.message}`);
}

const todo = (listings ?? []).filter((l) => {
  const imgs = l.images ?? [];
  if (imgs.length === 0) return false;
  if (FORCE) return true;
  // Also catch PARTIAL arrays — a row whose thumbnail generation failed
  // halfway is just as expensive to serve as one with none at all.
  const thumbs = l.thumbnails ?? [];
  return thumbs.length < imgs.length || thumbs.some((t) => !t);
});

console.log(`${listings?.length ?? 0} listings, ${todo.length} needing thumbnails\n`);
if (todo.length === 0) {
  console.log('Nothing to do.\n');
  process.exit(0);
}

let madeCount = 0;
let failCount = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const listing of todo) {
  const images = listing.images ?? [];
  const label = (listing.title ?? listing.id).slice(0, 44);
  console.log(`• ${label}  (${images.length} photo${images.length === 1 ? '' : 's'})`);

  const thumbs = [];

  for (const url of images) {
    const path = storagePathFromUrl(url);

    // Not ours to re-encode (externally hosted). Keep the original URL so the
    // array stays index-aligned with images[].
    if (!path) {
      console.log('    – external URL, left as-is');
      thumbs.push(url);
      continue;
    }

    try {
      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
      if (dlErr) throw dlErr;

      const original = Buffer.from(await blob.arrayBuffer());

      // fit:'inside' + withoutEnlargement caps the LONG edge at 640 and never
      // upscales a photo that is already smaller — same rule as the app's
      // compressImage(), which only resizes when longest > maxEdge.
      const thumb = await sharp(original)
        .rotate() // honour EXIF orientation before we discard the metadata
        .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: THUMB_QUALITY })
        .toBuffer();

      bytesBefore += original.length;
      bytesAfter += thumb.length;

      const outPath = thumbPathFor(path);

      if (APPLY) {
        const { error: upErr } = await sb.storage.from(BUCKET).upload(outPath, thumb, {
          contentType: 'image/jpeg',
          // upsert so a re-run repairs a partial pass instead of erroring on
          // objects it already wrote.
          upsert: true,
        });
        if (upErr) throw upErr;
      }

      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(outPath);
      thumbs.push(pub.publicUrl);
      madeCount += 1;

      const pct = (100 - (thumb.length / original.length) * 100).toFixed(0);
      console.log(`    ✓ ${fmtKB(original.length)} → ${fmtKB(thumb.length)}  (−${pct}%)`);
    } catch (e) {
      if (isRestricted(e)) {
        die(
          'The project is still API-restricted (HTTP 402, exceed_cached_egress_quota).\n' +
            'Restore service first, then re-run.',
        );
      }
      // A thumbnail is an optimization, never a reason to lose a photo. Falling
      // back to the full-size URL is exactly what uploadListingImages() does
      // when generation fails, so the row stays valid and simply keeps its old
      // (expensive) behaviour for that one image.
      failCount += 1;
      console.log(`    ✗ ${e?.message ?? e} — keeping full-size URL`);
      thumbs.push(url);
    }
  }

  if (APPLY) {
    const { error: updErr } = await sb
      .from('listings')
      .update({ thumbnails: thumbs })
      .eq('id', listing.id);
    if (updErr) {
      console.log(`    ! row update failed: ${updErr.message}`);
      failCount += 1;
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
const saved = bytesBefore - bytesAfter;
const factor = bytesAfter > 0 ? (bytesBefore / bytesAfter).toFixed(1) : '—';

console.log('');
console.log('─'.repeat(52));
console.log(`  thumbnails generated : ${madeCount}`);
if (failCount) console.log(`  failures             : ${failCount} (kept full-size URLs)`);
console.log(`  per full grid render : ${fmtKB(bytesBefore)} → ${fmtKB(bytesAfter)}`);
console.log(`  reduction            : ${factor}× smaller, ${fmtKB(saved)} saved`);
console.log('─'.repeat(52));

if (!APPLY) {
  console.log('\nDry run — nothing was written. Re-run with --apply.\n');
} else {
  console.log('\nDone. Grid cards now serve the card-sized copies.\n');
}
