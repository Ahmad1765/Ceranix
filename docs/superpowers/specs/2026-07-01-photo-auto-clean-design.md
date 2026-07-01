# Photo Auto-Clean for Listings — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Author:** Brainstormed with Claude Code

## Summary

Add a Lekondo-style "auto-clean" step to the listing upload flow. When a seller
adds a photo, it is analyzed **on-device** and a cleaned version is produced:
the subject is composited on a **white background** and any **faces are blurred**.
The seller sees a before/after and can toggle each photo between **Original** and
**Cleaned** before publishing. Only the chosen version is uploaded, through the
existing upload pipeline.

The person stays in the photo (wearing the item) — this is a "clean + anonymize"
transform, **not** a garment-extraction / ghost-mannequin cut-out.

## Locked decisions

These were settled during brainstorming and are not open for re-litigation in the
implementation plan:

1. **Output** — keep the person; remove background → white; blur the face(s).
   Not full garment extraction.
2. **Cost model** — fully free / self-hosted. No paid per-image APIs.
3. **Platforms** — web **and** native (iOS + Android).
4. **Architecture** — unified **on-device** processing (no server, no per-image
   cost, raw photos never leave the device until publish).
5. **Control model** — auto-clean on add, **before/after preview with a per-photo
   toggle**. Seller chooses Original vs Cleaned per photo.
6. **Face-hide style** — gaussian blur (default; pixelate/solid block deferred).
7. **Sequencing** — **web first**, native second.

## Engine choice (research findings)

- **MediaPipe (Apache-2.0)** is the free, commercial-safe, cross-platform engine.
  It provides an **Image/Selfie Segmenter** (subject vs background) and a
  **Face Detector** (BlazeFace).
- **`@imgly/background-removal` is rejected** — it is **AGPL**, which is not
  compatible with a closed-source commercial app without a paid license.
- **Web** MediaPipe support (`@mediapipe/tasks-vision`) is mature and reliable.
- **Native** is the weak spot: face detection is well-supported via Infinite Red's
  `@infinitered/react-native-mlkit-face-detection` (Apache-2.0, Expo config
  plugin), but on-device **segmentation** has no first-class Expo wrapper — it
  relies on a community `react-native-mediapipe` module or a thin custom native
  module. This is the single biggest implementation risk.
- Native ML requires a **custom dev-client / EAS build** (Expo Go can no longer
  be used) and ML Kit does **not** run in the iOS simulator (physical device
  required for native testing).

## Architecture

### Analysis vs compositing
- **Analysis = MediaPipe** on both platforms: segmentation mask + face bounding
  boxes.
- **Compositing = per platform:**
  - Web → HTML `<canvas>` (same approach as the existing `compressOnWeb` in
    `lib/upload.ts`).
  - Native → `@shopify/react-native-skia` to apply the subject mask and blur the
    face regions, then snapshot to an image.

### New module (isolated)

```
lib/photoClean/
  types.ts             // CleanInput { uri, base64 }, CleanResult { uri, base64, faceCount, ok }
  index.ts             // cleanPhoto(input) — Platform.OS dispatch (mirrors lib/upload.ts)
  cleanPhoto.web.ts    // MediaPipe JS → canvas composite + face blur
  cleanPhoto.native.ts // MediaPipe/ML Kit → Skia composite + face blur
  engine.web.ts        // lazy singleton loaders (segmenter, face detector)
  engine.native.ts
  geometry.ts          // pure helpers: expand face box, mask→alpha (unit-tested)
```

`cleanPhoto()` is the only symbol the screen imports. All model/compositing detail
is swappable internals behind that interface. If the native segmentation module
proves unreliable, only `cleanPhoto.native.ts` / `engine.native.ts` change — web
and the calling screen are untouched (fallback: a small self-hosted rembg service
for native only).

## Integration into the upload flow

File: `app/(tabs)/upload.tsx`. The current `LocalImage[]` state becomes a richer
per-slot shape:

```ts
type PhotoSlot = {
  original: LocalImage;
  cleaned?: LocalImage;
  useCleaned: boolean;                        // toggle state
  status: 'processing' | 'done' | 'failed';
  faceCount: number;
};
```

Flow:
1. On `pickImages`, each new slot starts `cleanPhoto()` (concurrency-limited to
   1–2; image downscaled to ~1024px before analysis for speed).
2. Each grid tile shows a small overlay: a spinner while `processing`; an
   **Original / Cleaned** chip when `done`. Tapping the chip flips `useCleaned`.
3. `handlePublish` maps each slot to `useCleaned ? cleaned : original` and passes
   the result to the **unchanged** `uploadListingImages`.

**No changes to `lib/upload.ts` or the database.** `uploadListingImages` still
compresses and uploads whatever array it is handed; `listings.images` remains a
`text[]` of URLs.

## Data flow

pick → on-device clean (no upload) → seller toggles per photo → publish uploads
only the chosen final images through the existing compress+upload pipeline.

## Error handling

Best-effort; **must never block publish** (mirrors the existing upload.ts fallback
philosophy):
- Model-load failure, no subject detected, per-image timeout (~15s), or any
  exception → `status: 'failed'`, toggle defaults to **Original**, small
  "couldn't auto-clean" hint on the tile.
- `faceCount === 0` is a normal outcome (nothing to blur) — still a valid cleaned
  result.
- Feature degrades silently to original-only if the engine can't initialize.

## Face blur specifics

- Expand each detected face box by ~30% before blurring to cover hair/jaw edges.
- Heavy gaussian blur over the expanded region. (Pixelate / solid block are
  possible future options but out of scope for v1.)

## Performance

- Lazy-load models on first entry to the upload screen (prefetch on screen focus).
- Concurrency limit 1–2 concurrent cleans.
- Downscale to ~1024px long edge before analysis.
- Web WASM + model assets pulled from CDN (option to self-host the wasm later);
  native model assets bundled with the dev client.

## Testing

- Unit-test `geometry.ts` (pure math) with mocked detector output.
- Web: verify in the browser build end-to-end.
- Native: **physical device only** (iOS simulator unsupported by ML Kit), via an
  EAS dev-client build.

## Sequencing

- **Phase 1 — Web:** full pipeline + preview/toggle UX in the browser build.
  Low risk, validates the interface and the whole UX.
- **Phase 2 — Native:** same `cleanPhoto()` interface, MediaPipe/ML Kit + Skia,
  custom dev-client + EAS build.

## Dependencies

- Web: `@mediapipe/tasks-vision`.
- Native: `react-native-mediapipe` (segmentation),
  `@infinitered/react-native-mlkit-face-detection` (faces),
  `@shopify/react-native-skia` (compositing).
- Build: Expo config plugin(s), custom dev-client, EAS build.

## Risks

1. **Native segmentation module maturity** (highest). Mitigation: interface
   isolates it; fallback is a tiny self-hosted rembg service for native only,
   with no change to web or the calling screen.
2. **Dev-client / EAS build overhead** — Expo Go no longer usable once native
   lands.
3. **iOS simulator limitation** — native testing needs a physical device.
4. **Native model asset size** increasing the app bundle.
5. **MediaPipe web CDN dependency** — mitigate by self-hosting wasm/model assets
   if the CDN is a concern.

## Out of scope (v1)

- Garment-only extraction / ghost-mannequin cut-outs.
- Pixelate / solid-block face styles.
- Server-side processing or paid APIs.
- Storing a "cleaned" flag or the original alongside the cleaned image in the DB.
