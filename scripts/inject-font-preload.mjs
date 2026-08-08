// Post-export step: preload the critical fonts from the root HTML.
//
// WHY THIS IS A BUILD STEP AND NOT app/+html.tsx
// ----------------------------------------------
// `+html.tsx` is only rendered under static rendering (`web.output: 'static'`).
// This app exports as a single-page output — `web` in app.config.js sets only
// `favicon`, so `output` defaults to `single` — and that path builds index.html
// from a fixed template, appending tags by string replace
// (@expo/cli/build/src/export/html.js). A `+html.tsx` is simply never rendered,
// so putting the links there silently does nothing. Verified by adding one and
// finding no trace of it in the output.
//
// WHAT IT FIXES
// -------------
// Nothing referenced the fonts from HTML, so they could not begin downloading
// until the 4.6 MB bundle had been fetched, parsed, and had mounted React far
// enough to run `Font.loadAsync` in app/_layout.tsx. Measured on the production
// export before this existed:
//
//     @   89ms  ──── 2232ms ────  entry.js
//     @ 3036ms  DOMContentLoaded
//     @ 3805ms  ──  Feather.ttf     ← fonts only start here
//
// That effect is also what releases the `ready` gate blocking first paint, so
// the font fetch sat on the critical path with nothing overlapping it. A
// preload link lets the browser start both at once.
//
// WHERE THE URLS COME FROM
// ------------------------
// scripts/web-fonts.generated.json, written by scripts/build-web-fonts.mjs,
// which must run *before* `expo export`. That names the WOFF2 files to warm up;
// metro.config.js is what makes the web bundle resolve to them instead of the
// TTFs, so this step and the app are reading one manifest and cannot drift.
//
// The Metro fingerprint (`Ionicons.<hash>.woff2`) only exists after the export,
// which is why the manifest holds bare filenames and this script globs dist/ to
// find where they landed.
//
// WHY crossorigin IS REQUIRED
// ---------------------------
// expo-font injects an `@font-face` rule at runtime
// (expo-font/build/ExpoFontLoader.web.js), and @font-face fetches are always
// made in CORS mode. A preload without `crossorigin` is a *different* request
// as far as the cache is concerned, so the file would download twice and the
// warm-up would be worse than useless. Expo's own static-rendering path emits
// `<link rel="preload" as="font" crossorigin="">` for exactly this reason.
//
// This step is deliberately non-fatal: if the layout of dist/ ever changes and
// the fonts aren't found, it warns and leaves the HTML untouched rather than
// failing the build over an optimization.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.resolve(process.argv[2] ?? 'dist');
const HTML = path.join(DIST, 'index.html');
const MANIFEST = path.join(ROOT, 'scripts', 'web-fonts.generated.json');

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function main() {
  // Read-and-catch rather than existsSync-then-read: checking first and acting
  // second is a TOCTOU race, and "gone" reads the same as "never there".
  let html;
  try {
    html = fs.readFileSync(HTML, 'utf8');
  } catch {
    console.warn(`[font-preload] ${HTML} not found — skipping.`);
    return;
  }

  let manifest;
  try {
    manifest = fs.readFileSync(MANIFEST, 'utf8');
  } catch {
    console.warn('[font-preload] no web-fonts manifest — run `npm run fonts:web` first. Skipping.');
    return;
  }

  const { preload } = JSON.parse(manifest);
  if (!Array.isArray(preload) || preload.length === 0) {
    console.warn('[font-preload] manifest lists no fonts to preload — skipping.');
    return;
  }

  // `Ionicons.woff2` in the manifest is `Ionicons.<metro hash>.woff2` on disk.
  const exported = new Map(
    walk(DIST)
      .filter((f) => f.endsWith('.woff2'))
      .map((f) => [
        path.basename(f).replace(/\.[a-f0-9]{8,}\.woff2$/i, '.woff2'),
        '/' + path.relative(DIST, f).split(path.sep).join('/'),
      ]),
  );

  // A font named in the manifest but absent from the export would preload a
  // 404, and — more to the point — means metro.config.js did not redirect it,
  // so the app is still shipping that family as TTF. Worth saying out loud.
  const missing = preload.filter((name) => !exported.has(name));
  if (missing.length) {
    console.warn(`[font-preload] not found in ${DIST} (still TTF?) — skipping:`);
    for (const m of missing) console.warn(`  ${m}`);
    return;
  }

  const links = preload
    .map((name) => exported.get(name))
    .filter((href) => !html.includes(`href="${href}"`)) // idempotent re-runs
    .map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin="">`)
    .join('');

  if (!links) {
    console.log('[font-preload] already present — nothing to do.');
    return;
  }

  if (!html.includes('</head>')) {
    console.warn('[font-preload] no </head> in index.html — skipping.');
    return;
  }

  html = html.replace('</head>', `${links}</head>`);
  fs.writeFileSync(HTML, html);
  console.log(`[font-preload] preloaded ${preload.length} font(s):`);
  for (const f of preload) console.log(`  ${exported.get(f)}`);
}

main();
