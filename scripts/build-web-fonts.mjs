// Pre-export step: emit WOFF2 twins of every TTF the web build loads, into
// web-fonts/, plus the manifest metro.config.js and inject-font-preload.mjs
// read.
//
// WHY WOFF2
// ---------
// expo-font hands the browser whatever `@expo/vector-icons` and
// `@expo-google-fonts/*` ship, and both ship raw TTF. TTF is an uncompressed
// container; WOFF2 is the same glyph data under Brotli plus font-specific
// preprocessing, and every browser this app supports has read it since 2016.
// Measured on this project's own files:
//
//     Ionicons          389,724 -> 162,536   (-58%)
//     Feather            55,596 ->  18,924   (-66%)
//     Inter_400Regular  342,408 -> 113,660   (-67%)
//
// Rendering is byte-identical — same glyphs, same metrics, same family names.
//
// WHY THE SWAP HAPPENS IN THE RESOLVER AND NOT AT THE CALL SITE
// -------------------------------------------------------------
// The obvious version of this is to hand `Font.loadAsync` a different URI in
// app/_layout.tsx. That was tried and it downloads *both* files. The reason is
// @expo/vector-icons/build/createIconSet.js: every `<Ionicons>` closes over the
// raw TTF asset id and, if `Font.isLoaded('Ionicons')` is still false when the
// instance mounts, calls `Font.loadAsync({ Ionicons: <that TTF> })` itself. The
// app's own preload is async, so any icon mounting in the same tick loses that
// race and pulls the 390 KB TTF alongside the 162 KB WOFF2 — strictly worse
// than doing nothing.
//
// Redirecting in Metro's `resolveRequest` (see metro.config.js) instead means
// the TTF is never in the web module graph at all. The icon component's private
// fallback, `Icon.font`, this app's `Font.loadAsync`, and the `<link rel=
// "preload">` in index.html then all name one URL, so there is exactly one
// request and the preload is always a cache hit.
//
// WHY web-fonts/ AND NOT assets/
// ------------------------------
// `assetBundlePatterns` in app.config.js force-includes `assets/**` into native
// builds regardless of the module graph, so a WOFF2 under assets/ would ship
// ~750 KB into every iOS/Android binary to be read by nothing — native keeps
// loading the bundled TTF straight off local disk, where WOFF2 saves nothing
// and expo-font's native loaders do not read the format anyway.
//
// These are plain filenames, not content-hashed: Metro fingerprints them into
// dist/assets/web-fonts/<name>.<hash>.woff2 on export, which is what makes the
// `immutable` cache header in vercel.json safe.
//
// Outputs, both committed so `expo start --web` works without running this:
//   web-fonts/<Family>.woff2
//   scripts/web-fonts.generated.json
import fs from 'node:fs';
import path from 'node:path';
import { compress } from 'wawoff2';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'web-fonts');

const VECTOR_FONTS = path.join(
  ROOT,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
);
const INTER = path.join(ROOT, 'node_modules/@expo-google-fonts/inter');

// Every TTF that can reach the web bundle. Keys are the family names expo-font
// registers, i.e. exactly the strings that reach `fontFamily` at a call site.
//
//   • Ionicons + Feather — preloaded in app/_layout.tsx (ICON_FONTS).
//   • Inter_* — the five weights in AESTHETIC_FONTS, mapped from `fontWeight`
//     by lib/rnText.tsx.
//   • FontAwesome6_* — pulled in by components/discover/DiscoverSheet.dummy.tsx
//     while DUMMY_SKIN is true. Brands is listed even though
//     registerDummySkinFont() filters it out, because importing
//     '@expo/vector-icons/FontAwesome6' puts all three in the graph and they get
//     exported whether or not they are ever registered.
//
// A TTF missing from this list is not an error — metro.config.js only redirects
// files it finds a twin for, so an unlisted family just keeps shipping as TTF.
const SOURCES = {
  Ionicons: path.join(VECTOR_FONTS, 'Ionicons.ttf'),
  Feather: path.join(VECTOR_FONTS, 'Feather.ttf'),
  FontAwesome6_Solid: path.join(VECTOR_FONTS, 'FontAwesome6_Solid.ttf'),
  FontAwesome6_Regular: path.join(VECTOR_FONTS, 'FontAwesome6_Regular.ttf'),
  FontAwesome6_Brands: path.join(VECTOR_FONTS, 'FontAwesome6_Brands.ttf'),
  Inter_400Regular: path.join(INTER, '400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: path.join(INTER, '500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: path.join(INTER, '600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: path.join(INTER, '700Bold/Inter_700Bold.ttf'),
  Inter_700Bold_Italic: path.join(INTER, '700Bold_Italic/Inter_700Bold_Italic.ttf'),
};

// Which of the above earn a `<link rel="preload">` in index.html.
//
// Preloading is not free: these compete with the ~4.9 MB entry bundle for
// bandwidth, so the list is the faces genuinely on the critical path rather
// than everything in SOURCES.
//
//   • Ionicons + Feather — app/_layout.tsx gates first paint on these.
//   • Inter_400Regular   — lib/rnText.tsx's fallback, so every <Text> with no
//                          explicit fontWeight renders in it.
//   • Inter_600SemiBold + Inter_700Bold — 28 and 90 `fontWeight` sites
//                          respectively, i.e. most headings, prices and labels.
//
// Deliberately excluded: Inter_500Medium (14 sites), Inter_700Bold_Italic (3,
// decorative) and the FontAwesome6 faces (behind the Discover sheet, not on the
// first screen). They still load, just not ahead of the bundle.
//
// This matters more than it looks because lib/fonts.ts tags everything
// FontDisplay.BLOCK — text in a face that has not arrived is *invisible*, not
// merely unstyled. Preloading is what keeps that window short.
const PRELOAD = [
  'Ionicons',
  'Feather',
  'Inter_400Regular',
  'Inter_600SemiBold',
  'Inter_700Bold',
];

async function main() {
  const missing = Object.entries(SOURCES).filter(([, p]) => !fs.existsSync(p));
  if (missing.length) {
    console.error('[web-fonts] source TTF not found:');
    for (const [family, p] of missing) console.error(`  ${family}  ${p}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Keyed by TTF basename because that is all metro.config.js can cheaply match
  // on: Metro resolves the request to an absolute path inside node_modules, and
  // these ten basenames are unambiguous across the whole tree.
  const redirects = {};
  const keep = new Set();
  let ttfBytes = 0;
  let woffBytes = 0;

  for (const [family, src] of Object.entries(SOURCES)) {
    const ttf = fs.readFileSync(src);
    const woff2 = Buffer.from(await compress(ttf));
    const file = `${family}.woff2`;
    const dest = path.join(OUT_DIR, file);

    // Skip identical rewrites so no-op runs leave mtimes (and Metro's watcher)
    // alone.
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(woff2)) {
      fs.writeFileSync(dest, woff2);
    }

    keep.add(file);
    redirects[path.basename(src)] = file;
    ttfBytes += ttf.length;
    woffBytes += woff2.length;

    const pct = Math.round(100 - (woff2.length / ttf.length) * 100);
    console.log(
      `[web-fonts] ${family.padEnd(21)} ${String(ttf.length).padStart(7)} -> ${String(
        woff2.length,
      ).padStart(7)}  (-${pct}%)`,
    );
  }

  // Drop WOFF2 from earlier runs whose family left SOURCES, otherwise
  // web-fonts/ accumulates orphans and Metro happily exports them.
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.woff2') && !keep.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
      console.log(`[web-fonts] removed stale ${f}`);
    }
  }

  const preload = PRELOAD.map((family) => {
    if (!(family in SOURCES)) throw new Error(`PRELOAD names "${family}", not in SOURCES`);
    return `${family}.woff2`;
  });

  fs.writeFileSync(
    path.join(ROOT, 'scripts', 'web-fonts.generated.json'),
    `${JSON.stringify({ dir: 'web-fonts', redirects, preload }, null, 2)}\n`,
  );

  const pct = Math.round(100 - (woffBytes / ttfBytes) * 100);
  console.log(
    `[web-fonts] ${Object.keys(SOURCES).length} families: ` +
      `${(ttfBytes / 1024).toFixed(0)} KB TTF -> ${(woffBytes / 1024).toFixed(0)} KB WOFF2 (-${pct}%)`,
  );
  console.log(`[web-fonts] preloading ${preload.length}: ${preload.join(' ')}`);
}

main();
