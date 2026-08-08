// One-off cleanup for the corrupted "Testtt" listing artifact.
//
// WHAT AND WHY
// The listing "Testtt" carried a 382 KB JPEG with a valid FFD8FF start marker
// and NO FFD9 end marker — a truncated upload. It rendered broken in the app
// and crashed the thumbnail backfill with "premature end of JPEG image".
// lib/upload.ts now rejects such files before anything is written
// (lib/imageIntegrity.ts), so this cleans up the one row that predates it.
//
// STATE WHEN THIS WAS WRITTEN (2026-08-09)
//   • the listings row has ALREADY been deleted
//   • the storage object is still present and orphaned
// Both steps below are idempotent and report "already gone" rather than
// failing, so running this twice is harmless.
//
// The storage delete needs the SERVICE ROLE key: Supabase blocks direct SQL
// deletion from storage tables (storage.protect_delete), and the bucket's
// delete policy requires `auth.uid()` to equal the first path segment — the
// listing's seller, which is not you.
//
// USAGE
//   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
//   bash:        export SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
//   node scripts/cleanup-testtt-artifact.mjs            # dry run, touches nothing
//   node scripts/cleanup-testtt-artifact.mjs --apply    # actually delete
//
// Unset the variable afterwards — it bypasses every RLS policy in the project.

import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

// The exact object left behind. Hardcoded rather than discovered: this is a
// one-off for one known artifact, and a script that goes looking for "corrupt
// images" to delete is a much more dangerous thing to keep in the repo.
const BUCKET = 'listing-images';
const OBJECT_PATH =
  '806c3504-c9be-4725-bf2b-927af2c3baaf/1781698217220/57260447-fe0c-4ac0-9bc9-179b2020ef98.jpg';
const LISTING_TITLE = 'Testtt';

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function readEnvLocal(key) {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
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
      '  bash:        export SUPABASE_SERVICE_ROLE_KEY=eyJ...',
  );
}

const auth = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function listingRowsRemaining() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=id&title=eq.${encodeURIComponent(LISTING_TITLE)}`,
    { headers: auth },
  );
  if (!res.ok) throw new Error(`listings query failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function objectExists() {
  // A HEAD on the public URL is enough: 200 means the object is still served.
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`,
    { method: 'HEAD' },
  );
  return res.status === 200;
}

console.log(`\n${APPLY ? '● APPLY' : '○ DRY RUN'} — Testtt artifact cleanup`);
console.log(`  project: ${SUPABASE_URL}`);
if (!APPLY) console.log('  (nothing will be deleted; re-run with --apply)');
console.log('');

let failed = false;

// ── 1. The listings row ─────────────────────────────────────────────────────
const rows = await listingRowsRemaining();
if (rows.length === 0) {
  console.log(`• listings row "${LISTING_TITLE}"  — already gone, nothing to do`);
} else if (!APPLY) {
  console.log(`• listings row "${LISTING_TITLE}"  — would DELETE ${rows.length} row(s)`);
} else {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?title=eq.${encodeURIComponent(LISTING_TITLE)}`,
    { method: 'DELETE', headers: { ...auth, Prefer: 'return=representation' } },
  );
  if (res.ok) {
    console.log(`• listings row "${LISTING_TITLE}"  ✓ deleted`);
  } else {
    failed = true;
    console.log(`• listings row "${LISTING_TITLE}"  ✗ ${res.status} ${await res.text()}`);
  }
}

// ── 2. The storage object ───────────────────────────────────────────────────
const present = await objectExists();
if (!present) {
  console.log('• storage object                  — already gone, nothing to do');
} else if (!APPLY) {
  console.log(`• storage object                  — would DELETE ${BUCKET}/${OBJECT_PATH}`);
} else {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`, {
    method: 'DELETE',
    headers: auth,
  });
  if (res.ok) {
    // Confirm rather than trust the status code.
    const stillThere = await objectExists();
    if (stillThere) {
      failed = true;
      console.log('• storage object                  ✗ API said OK but it still resolves');
    } else {
      console.log('• storage object                  ✓ deleted (382 KB reclaimed)');
    }
  } else {
    failed = true;
    console.log(`• storage object                  ✗ ${res.status} ${await res.text()}`);
  }
}

console.log('');
if (failed) {
  console.error('Finished with errors — see above.\n');
  process.exit(1);
}
console.log(APPLY ? 'Done.\n' : 'Dry run — nothing was written. Re-run with --apply.\n');
