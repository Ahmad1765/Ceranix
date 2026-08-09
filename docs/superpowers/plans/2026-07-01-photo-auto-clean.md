# Photo Auto-Clean for Listings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a seller adds a listing photo, auto-produce a cleaned version (subject on white background, faces blurred) fully on-device, and let the seller toggle each photo between Original and Cleaned before publishing.

**Architecture:** A new isolated `lib/photoClean/` module exposes a single `cleanPhoto()` function, dispatched per platform via Metro's `.web.ts` / `.native.ts` file resolution. MediaPipe performs analysis (subject mask + face boxes); compositing is done on an HTML canvas (web) or Skia (native). The upload screen wraps each picked image in a slot with clean status + toggle state and, at publish time, hands the chosen image array to the existing unchanged `uploadListingImages`.

**Tech Stack:** Expo 54 / React Native 0.79 / React 19, TypeScript, NativeWind 4, vitest (unit), Playwright (e2e). Web analysis: `@mediapipe/tasks-vision`. Native: `react-native-mediapipe` (segmentation), `@infinitered/react-native-mlkit-face-detection` (faces), `@shopify/react-native-skia` (compositing).

## Global Constraints

- **Free / self-hosted only** — no paid per-image APIs. MediaPipe (Apache-2.0), ML Kit (Apache-2.0), Skia (MIT). **Do NOT introduce `@imgly/background-removal`** — it is AGPL and forbidden for this closed-source commercial app.
- **Never block publish** — cleaning is best-effort. Any failure/timeout falls back to the original image; publish must always succeed. Mirror the fallback style already in `lib/upload.ts` (`try/catch`, `console.warn`, return original).
- **No DB or `lib/upload.ts` changes** — `listings.images` stays `text[]`; `uploadListingImages(images, sellerId)` is called unchanged.
- **`cleanPhoto()` is the only symbol the upload screen imports** from `lib/photoClean`. All model/compositing detail stays internal and swappable.
- **Keep the person** — output is subject-on-white + blurred face(s). No garment extraction.
- **Face hide = gaussian blur**, expanded box ~30%.
- **Test env:** unit tests run under vitest in Node (no DOM/WASM) — only pure modules are unit-tested; the canvas/WASM/Skia pipeline is verified via browser + Playwright (web) and manual device runs (native).
- **Sequencing:** Phase 1 (web) must be complete and green before Phase 2 (native) begins.

---

# Phase 1 — Web

## Task 1: Types + pure face-box geometry

**Files:**
- Create: `lib/photoClean/types.ts`
- Create: `lib/photoClean/geometry.ts`
- Test: `lib/photoClean/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CleanInput = { uri: string; base64?: string | null }`
  - `type CleanResult = { uri: string; base64: string | null; faceCount: number; ok: boolean }`
  - `type FaceBox = { x: number; y: number; width: number; height: number }`
  - `expandFaceBox(box: FaceBox, imgW: number, imgH: number, factor?: number): FaceBox` — grows the box by `factor` (default 0.3) on each side, clamped to `[0..imgW]` / `[0..imgH]`, returns integer coords.

- [ ] **Step 1: Write the failing test**

```ts
// lib/photoClean/geometry.test.ts
import { describe, it, expect } from 'vitest';
import { expandFaceBox } from '@/lib/photoClean/geometry';

describe('expandFaceBox', () => {
  it('grows the box by 30% on each side by default', () => {
    const out = expandFaceBox({ x: 100, y: 100, width: 100, height: 100 }, 1000, 1000);
    // 30% of 100 = 30 padding each side
    expect(out).toEqual({ x: 70, y: 70, width: 160, height: 160 });
  });

  it('clamps to image bounds (never negative, never past edge)', () => {
    const out = expandFaceBox({ x: 10, y: 10, width: 40, height: 40 }, 60, 60, 0.5);
    // pad = 20 → x:-10→0, y:-10→0, right:70→60, bottom:70→60
    expect(out).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it('returns integer coordinates', () => {
    const out = expandFaceBox({ x: 33.3, y: 10.7, width: 50.5, height: 20.2 }, 500, 500, 0.3);
    expect(Number.isInteger(out.x)).toBe(true);
    expect(Number.isInteger(out.y)).toBe(true);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/photoClean/geometry.test.ts`
Expected: FAIL — cannot resolve `@/lib/photoClean/geometry`.

- [ ] **Step 3: Write the types + implementation**

```ts
// lib/photoClean/types.ts
export type CleanInput = { uri: string; base64?: string | null };

export type CleanResult = {
  uri: string;
  base64: string | null;
  faceCount: number;
  ok: boolean;
};

export type FaceBox = { x: number; y: number; width: number; height: number };
```

```ts
// lib/photoClean/geometry.ts
import type { FaceBox } from './types';

// Grow a detected face box outward so the blur covers hair/jaw/ears, then clamp
// to the image so we never index out of bounds during compositing.
export function expandFaceBox(
  box: FaceBox,
  imgW: number,
  imgH: number,
  factor = 0.3,
): FaceBox {
  const padX = box.width * factor;
  const padY = box.height * factor;
  const left = Math.max(0, Math.round(box.x - padX));
  const top = Math.max(0, Math.round(box.y - padY));
  const right = Math.min(imgW, Math.round(box.x + box.width + padX));
  const bottom = Math.min(imgH, Math.round(box.y + box.height + padY));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/photoClean/geometry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/photoClean/types.ts lib/photoClean/geometry.ts lib/photoClean/geometry.test.ts
git commit -m "feat(photoClean): add types and face-box geometry helper"
```

---

## Task 2: Pure slot-state model

This holds all the per-photo state logic (create, update status, toggle, resolve final image) as pure functions so the upload screen stays thin and the logic is unit-testable without React.

**Files:**
- Create: `lib/photoClean/slots.ts`
- Test: `lib/photoClean/slots.test.ts`

**Interfaces:**
- Consumes: `CleanInput`, `CleanResult` from `./types`; `LocalImage` from `@/lib/upload`.
- Produces:
  - `type CleanStatus = 'processing' | 'done' | 'failed'`
  - `type PhotoSlot = { id: string; original: LocalImage; cleaned: LocalImage | null; useCleaned: boolean; status: CleanStatus; faceCount: number }`
  - `makeSlot(original: LocalImage, id: string): PhotoSlot` — status `'processing'`, `cleaned: null`, `useCleaned: false`.
  - `applyResult(slot: PhotoSlot, result: CleanResult): PhotoSlot` — on `ok` → status `'done'`, `cleaned` set, `useCleaned: true`, `faceCount`; on `!ok` → status `'failed'`, `useCleaned: false`.
  - `toggleSlot(slot: PhotoSlot): PhotoSlot` — flips `useCleaned` only when a cleaned image exists and status is `'done'`; otherwise returns the slot unchanged.
  - `resolveImage(slot: PhotoSlot): LocalImage` — returns `cleaned` when `useCleaned && cleaned`, else `original`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/photoClean/slots.test.ts
import { describe, it, expect } from 'vitest';
import { makeSlot, applyResult, toggleSlot, resolveImage } from '@/lib/photoClean/slots';

const original = { uri: 'file://orig.jpg', base64: 'AAAA' };
const cleanedResult = { uri: 'data:cleaned', base64: 'BBBB', faceCount: 1, ok: true };

describe('slots', () => {
  it('makeSlot starts in processing with no cleaned image', () => {
    const s = makeSlot(original, 'id1');
    expect(s).toEqual({
      id: 'id1', original, cleaned: null, useCleaned: false,
      status: 'processing', faceCount: 0,
    });
  });

  it('applyResult(ok) stores cleaned image and defaults to using it', () => {
    const s = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(s.status).toBe('done');
    expect(s.cleaned).toEqual({ uri: 'data:cleaned', base64: 'BBBB' });
    expect(s.useCleaned).toBe(true);
    expect(s.faceCount).toBe(1);
  });

  it('applyResult(!ok) marks failed and keeps original selected', () => {
    const s = applyResult(makeSlot(original, 'id1'), { uri: '', base64: null, faceCount: 0, ok: false });
    expect(s.status).toBe('failed');
    expect(s.cleaned).toBeNull();
    expect(s.useCleaned).toBe(false);
  });

  it('toggleSlot flips useCleaned only when a cleaned image exists', () => {
    const done = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(toggleSlot(done).useCleaned).toBe(false);
    const failed = applyResult(makeSlot(original, 'id2'), { uri: '', base64: null, faceCount: 0, ok: false });
    expect(toggleSlot(failed).useCleaned).toBe(false); // unchanged
  });

  it('resolveImage returns cleaned when selected, else original', () => {
    const done = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(resolveImage(done)).toEqual({ uri: 'data:cleaned', base64: 'BBBB' });
    expect(resolveImage(toggleSlot(done))).toEqual(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/photoClean/slots.test.ts`
Expected: FAIL — cannot resolve `@/lib/photoClean/slots`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/photoClean/slots.ts
import type { LocalImage } from '@/lib/upload';
import type { CleanResult } from './types';

export type CleanStatus = 'processing' | 'done' | 'failed';

export type PhotoSlot = {
  id: string;
  original: LocalImage;
  cleaned: LocalImage | null;
  useCleaned: boolean;
  status: CleanStatus;
  faceCount: number;
};

export function makeSlot(original: LocalImage, id: string): PhotoSlot {
  return { id, original, cleaned: null, useCleaned: false, status: 'processing', faceCount: 0 };
}

export function applyResult(slot: PhotoSlot, result: CleanResult): PhotoSlot {
  if (!result.ok) {
    return { ...slot, status: 'failed', cleaned: null, useCleaned: false };
  }
  return {
    ...slot,
    status: 'done',
    cleaned: { uri: result.uri, base64: result.base64 },
    useCleaned: true,
    faceCount: result.faceCount,
  };
}

export function toggleSlot(slot: PhotoSlot): PhotoSlot {
  if (slot.status !== 'done' || !slot.cleaned) return slot;
  return { ...slot, useCleaned: !slot.useCleaned };
}

export function resolveImage(slot: PhotoSlot): LocalImage {
  return slot.useCleaned && slot.cleaned ? slot.cleaned : slot.original;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/photoClean/slots.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/photoClean/slots.ts lib/photoClean/slots.test.ts
git commit -m "feat(photoClean): add pure slot-state model"
```

---

## Task 3: Native + default no-op stub so all builds compile

Before writing the real web pipeline, add the module entry points. The native and default (Node/test) builds get a safe no-op that returns the original — this keeps native compiling and lets any importer resolve `cleanPhoto` on every platform. The real native implementation replaces the stub in Phase 2.

**Files:**
- Create: `lib/photoClean/index.ts` (default / Node fallback — no-op)
- Create: `lib/photoClean/index.native.ts` (native fallback — no-op for now)
- Test: `lib/photoClean/index.test.ts`

**Interfaces:**
- Consumes: `CleanInput`, `CleanResult` from `./types`.
- Produces: `cleanPhoto(input: CleanInput): Promise<CleanResult>` — the single public entry point. The default/native stubs resolve to `{ uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/photoClean/index.test.ts
import { describe, it, expect } from 'vitest';
import { cleanPhoto } from '@/lib/photoClean';

describe('cleanPhoto (default stub)', () => {
  it('returns ok:false and echoes the original so callers fall back', async () => {
    const out = await cleanPhoto({ uri: 'file://x.jpg', base64: 'ZZZ' });
    expect(out).toEqual({ uri: 'file://x.jpg', base64: 'ZZZ', faceCount: 0, ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/photoClean/index.test.ts`
Expected: FAIL — cannot resolve `@/lib/photoClean`.

- [ ] **Step 3: Write the stubs**

```ts
// lib/photoClean/index.ts  (default — also what vitest/Node resolves)
import type { CleanInput, CleanResult } from './types';

// Default no-op: platforms without a real pipeline (or the Node test env) get a
// safe fallback so callers use the original image. Web overrides via index.web.ts;
// native overrides via index.native.ts (Phase 2).
export async function cleanPhoto(input: CleanInput): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
```

```ts
// lib/photoClean/index.native.ts  (native fallback until Phase 2)
export { cleanPhoto } from './index';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/photoClean/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/photoClean/index.ts lib/photoClean/index.native.ts lib/photoClean/index.test.ts
git commit -m "feat(photoClean): add cleanPhoto entry point with safe no-op fallback"
```

---

## Task 4: Web MediaPipe engine loaders

Lazy singletons for the segmenter + face detector so models load once and are reused. Not unit-tested (browser WASM); verified in Task 5's browser run.

**Files:**
- Create: `lib/photoClean/engine.web.ts`

**Interfaces:**
- Consumes: `@mediapipe/tasks-vision`.
- Produces:
  - `getSegmenter(): Promise<ImageSegmenter>`
  - `getFaceDetector(): Promise<FaceDetector>`

- [ ] **Step 1: Install the dependency**

Run: `npm install @mediapipe/tasks-vision`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the engine loaders**

```ts
// lib/photoClean/engine.web.ts
import {
  FilesetResolver,
  ImageSegmenter,
  FaceDetector,
} from '@mediapipe/tasks-vision';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const SELFIE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

let segmenterPromise: Promise<ImageSegmenter> | null = null;
let facePromise: Promise<FaceDetector> | null = null;

export function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_MODEL },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((e) => {
      segmenterPromise = null; // allow retry on next attempt
      throw e;
    });
  }
  return segmenterPromise;
}

export function getFaceDetector(): Promise<FaceDetector> {
  if (!facePromise) {
    facePromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'IMAGE',
      });
    })().catch((e) => {
      facePromise = null;
      throw e;
    });
  }
  return facePromise;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors from `engine.web.ts` (the `@mediapipe/tasks-vision` package ships its own types).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/photoClean/engine.web.ts
git commit -m "feat(photoClean): add web MediaPipe segmenter + face-detector loaders"
```

---

## Task 5: Web cleanPhoto pipeline

Loads the image, runs segmentation → composites subject on white → blurs each expanded face box → exports a JPEG data URL + base64. Wraps everything in try/catch and a timeout so it always resolves.

**Files:**
- Create: `lib/photoClean/index.web.ts`

**Interfaces:**
- Consumes: `getSegmenter`, `getFaceDetector` from `./engine.web`; `expandFaceBox` from `./geometry`; `CleanInput`, `CleanResult`, `FaceBox` from `./types`.
- Produces: `cleanPhoto(input: CleanInput): Promise<CleanResult>` (web override of the entry point).

- [ ] **Step 1: Write the pipeline**

```ts
// lib/photoClean/index.web.ts
import type { CleanInput, CleanResult, FaceBox } from './types';
import { getSegmenter, getFaceDetector } from './engine.web';
import { expandFaceBox } from './geometry';

const MAX_EDGE = 1024;        // downscale ceiling before analysis, for speed
const FG_THRESHOLD = 0.5;     // foreground confidence cutoff
const BLUR_PX = 22;           // gaussian blur radius for faces
const TIMEOUT_MS = 15000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('clean timeout')), ms)),
  ]);
}

async function run(input: CleanInput): Promise<CleanResult> {
  const src = input.base64 ? `data:image/jpeg;base64,${input.base64}` : input.uri;
  const img = await loadImage(src);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const bctx = base.getContext('2d')!;
  bctx.drawImage(img, 0, 0, w, h);

  const [segmenter, faceDetector] = await Promise.all([getSegmenter(), getFaceDetector()]);

  // 1. Segmentation → punch out the background to transparent, composite on white.
  const segImg = bctx.getImageData(0, 0, w, h);
  const seg = segmenter.segment(base);
  const conf = seg.confidenceMasks?.[0]?.getAsFloat32Array();
  if (conf) {
    for (let i = 0; i < conf.length; i++) {
      if (conf[i] < FG_THRESHOLD) segImg.data[i * 4 + 3] = 0; // alpha → 0
    }
  }
  seg.close();

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#FFFFFF';
  octx.fillRect(0, 0, w, h);
  // Draw the masked subject over the white fill via a scratch canvas.
  const scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  scratch.getContext('2d')!.putImageData(segImg, 0, 0);
  octx.drawImage(scratch, 0, 0);

  // 2. Faces → blur each expanded box on the composited output.
  const faces = faceDetector.detect(base);
  const boxes: FaceBox[] = (faces.detections ?? []).map((d) => ({
    x: d.boundingBox!.originX,
    y: d.boundingBox!.originY,
    width: d.boundingBox!.width,
    height: d.boundingBox!.height,
  }));
  for (const raw of boxes) {
    const b = expandFaceBox(raw, w, h);
    if (b.width <= 0 || b.height <= 0) continue;
    octx.save();
    octx.filter = `blur(${BLUR_PX}px)`;
    octx.beginPath();
    octx.rect(b.x, b.y, b.width, b.height);
    octx.clip();
    octx.drawImage(out, 0, 0); // redraw whole canvas through the blur, clipped to the face
    octx.restore();
  }

  const dataUrl = out.toDataURL('image/jpeg', 0.85);
  const comma = dataUrl.indexOf(',');
  return {
    uri: dataUrl,
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : null,
    faceCount: boxes.length,
    ok: true,
  };
}

export async function cleanPhoto(input: CleanInput): Promise<CleanResult> {
  try {
    return await withTimeout(run(input), TIMEOUT_MS);
  } catch (e) {
    console.warn('[photoClean] web clean failed; using original', e);
    return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual browser smoke test**

Run: `npm run web`
Then in the browser devtools console on any app page, paste a quick harness to confirm the module loads and returns a data URL (replace `<BASE64>` with a small JPEG base64):

```js
const { cleanPhoto } = await import('/lib/photoClean/index.web.ts');
const r = await cleanPhoto({ uri: '', base64: '<BASE64 of a portrait photo>' });
console.log(r.ok, r.faceCount, r.uri.slice(0, 30));
```
Expected: `true`, a face count ≥ 0, and a `data:image/jpeg;base64` URI. (If model URLs are blocked by network, `ok` is `false` — that is the correct fallback, but note it for Task 6.)

- [ ] **Step 4: Commit**

```bash
git add lib/photoClean/index.web.ts
git commit -m "feat(photoClean): implement web background-removal + face-blur pipeline"
```

---

## Task 6: Wire auto-clean into the upload screen

Replace the raw `LocalImage[]` state with `PhotoSlot[]`, auto-run `cleanPhoto` on each added photo (concurrency 2), show per-tile status + an Original/Cleaned toggle, and resolve the chosen images at publish.

**Files:**
- Modify: `app/(tabs)/upload.tsx`

**Interfaces:**
- Consumes: `cleanPhoto` from `@/lib/photoClean`; `PhotoSlot`, `makeSlot`, `applyResult`, `toggleSlot`, `resolveImage` from `@/lib/photoClean/slots`.
- Produces: no new exports (screen-internal wiring).

- [ ] **Step 1: Swap image state to slots and add the clean runner**

At the top of `SellScreenInner`, replace:

```ts
const [images, setImages] = useState<LocalImage[]>([]);
```
with:
```ts
const [slots, setSlots] = useState<PhotoSlot[]>([]);
```

Add imports near the existing `@/lib/upload` import:
```ts
import { cleanPhoto } from '@/lib/photoClean';
import {
  makeSlot, applyResult, toggleSlot, resolveImage, type PhotoSlot,
} from '@/lib/photoClean/slots';
```

Add a helper inside `SellScreenInner` that cleans one slot and folds the result back in by id:
```ts
const runClean = async (slot: PhotoSlot) => {
  const result = await cleanPhoto(slot.original);
  setSlots((prev) => prev.map((s) => (s.id === slot.id ? applyResult(s, result) : s)));
};
```

- [ ] **Step 2: Update `pickImages` to create slots and kick off cleaning**

Replace the existing `pickImages` body's `setImages` block with:
```ts
if (!result.canceled) {
  const room = MAX_IMAGES - slots.length;
  const picked = result.assets.slice(0, room);
  const newSlots = picked.map((a) =>
    makeSlot(
      { uri: a.uri, base64: a.base64 ?? null },
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    ),
  );
  setSlots((prev) => [...prev, ...newSlots]);
  // Concurrency 2: run in pairs so a big batch doesn't freeze the UI.
  (async () => {
    for (let i = 0; i < newSlots.length; i += 2) {
      await Promise.all(newSlots.slice(i, i + 2).map(runClean));
    }
  })();
}
```

- [ ] **Step 3: Update every other `images` reference**

- `resetForm`: replace `setImages([]);` with `setSlots([]);`
- `handleContinue`: replace `if (images.length === 0)` with `if (slots.length === 0)`.
- Step-1 derived vars: replace `images.length` usages (`canContinue`, `showAddSlot`, the `{images.length} / {MAX_IMAGES}` counter, the empty-state styling checks, and the sticky-bar copy) with `slots.length`.
- `canPublish`: replace `images.length > 0` with `slots.length > 0`.
- The Step-1 grid `images.map(...)` and Step-2 photo strip `images.map(...)`: iterate `slots` and read `slot.original.uri` (preview always shows what the seller picked; the toggle governs which is uploaded). Remove buttons filter by id:
  ```ts
  onPress={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
  ```

- [ ] **Step 4: Add the per-tile status + toggle to the Step-1 grid**

Inside the Step-1 grid tile (the `slots.map` body), below the existing cover badge / remove button, add:
```tsx
{slot.status === 'processing' && (
  <View style={{ position: 'absolute', bottom: 6, left: 6, right: 6, alignItems: 'center' }}>
    <View style={{ backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <ActivityIndicator size="small" color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Cleaning…</Text>
    </View>
  </View>
)}
{slot.status === 'done' && slot.cleaned && (
  <Pressable
    onPress={() => setSlots((prev) => prev.map((s) => (s.id === slot.id ? toggleSlot(s) : s)))}
    hitSlop={6}
    style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: slot.useCleaned ? '#6C47FF' : 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}
  >
    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
      {slot.useCleaned ? 'CLEANED' : 'ORIGINAL'}
    </Text>
  </Pressable>
)}
{slot.status === 'failed' && (
  <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Original</Text>
  </View>
)}
```

- [ ] **Step 5: Resolve chosen images at publish**

In `handlePublish`, replace the two `images` references:
- guard: `if (slots.length === 0) {` (the "Missing photos" check)
- upload call:
  ```ts
  const chosen = slots.map(resolveImage);
  urls = await uploadListingImages(chosen, user.id);
  ```
Leave the rest of `handlePublish` unchanged.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If any stray `images` reference remains, the compiler flags it — fix each to the `slots` equivalent above.)

- [ ] **Step 7: Manual run (native + web sanity)**

Run: `npm run web`
Add a photo → tile shows "Cleaning…" then flips to a CLEANED/ORIGINAL chip; tapping toggles it; publish succeeds. On a portrait photo the cleaned preview has a white background and blurred face. (On native via Expo Go the stub returns `ok:false`, so tiles land on "Original" — expected until Phase 2.)

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/upload.tsx"
git commit -m "feat(upload): auto-clean added photos with per-photo original/cleaned toggle"
```

---

## Task 7: Playwright e2e for the web flow

**Files:**
- Create: `tests/e2e/signed-in/upload-auto-clean.spec.ts`

**Interfaces:**
- Consumes: the running web app + existing Playwright signed-in auth setup (mirror `tests/e2e/signed-in/upload-listing.spec.ts`).
- Produces: no exports.

- [ ] **Step 1: Read the existing upload e2e to reuse its auth/setup**

Run: open `tests/e2e/signed-in/upload-listing.spec.ts` and copy its import block, auth fixture usage, and navigation to the upload tab.

- [ ] **Step 2: Write the test**

Model the file on `upload-listing.spec.ts`. Assert the auto-clean UI contract (not the pixels, which depend on model network access):

```ts
// tests/e2e/signed-in/upload-auto-clean.spec.ts
// Reuse the SAME imports + auth fixture as upload-listing.spec.ts.
import { test, expect } from '@playwright/test';

test('added photo shows a clean status then an original/cleaned control', async ({ page }) => {
  // 1. Navigate to the upload tab (copy the exact steps from upload-listing.spec.ts).
  // 2. Set a file on the hidden <input type="file"> the picker renders on web:
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('tests/e2e/fixtures/portrait.jpg');

  // 3. A cleaning indicator or a resulting chip must appear.
  const chip = page.getByText(/Cleaning…|CLEANED|ORIGINAL/);
  await expect(chip.first()).toBeVisible({ timeout: 20000 });

  // 4. Continue must become enabled with one photo present.
  await expect(page.getByText('Continue')).toBeVisible();
});
```

Add a small `tests/e2e/fixtures/portrait.jpg` (any portrait photo) if the fixtures folder lacks one.

- [ ] **Step 3: Run the test**

Run: `npm run test:e2e -- upload-auto-clean`
Expected: PASS. If auth/nav differs, align it with `upload-listing.spec.ts` until green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/signed-in/upload-auto-clean.spec.ts tests/e2e/fixtures/portrait.jpg
git commit -m "test(e2e): cover upload auto-clean status + toggle on web"
```

- [ ] **Step 5: Full regression**

Run: `npm test && npm run typecheck`
Expected: all unit tests pass, no type errors. Phase 1 done.

---

# Phase 2 — Native

> Native ML libraries here are the least-proven part of the design. Task 8 is a verification spike that pins exact package versions and their real APIs **before** any pipeline code is written, so later tasks reference confirmed signatures rather than guesses. Native testing requires a **physical device** (ML Kit does not run in the iOS simulator) and a **custom dev-client** (Expo Go can no longer be used).

## Task 8: Native dependency spike + config

**Files:**
- Modify: `package.json` (deps)
- Modify: `app.config.js` (config plugins)
- Create: `docs/superpowers/notes/native-ml-api.md` (confirmed API signatures)

- [ ] **Step 1: Install native deps and confirm current versions**

Run:
```bash
npm install @shopify/react-native-skia @infinitered/react-native-mlkit-face-detection react-native-mediapipe
```
Then record the installed versions and, from each package's README/types in `node_modules`, the **actual** exported API for: (a) running image segmentation on a still image and reading its mask, (b) detecting faces on a still image and reading bounding boxes, (c) Skia offscreen `Surface`/`Image` snapshot to base64. Write these into `docs/superpowers/notes/native-ml-api.md` as concrete signatures.

- [ ] **Step 2: Register config plugins**

In `app.config.js`, add the face-detection (and any Skia/mediapipe) config plugins to the `plugins` array per each package's README. Example shape (confirm exact plugin names from Step 1):
```js
plugins: [
  // ...existing plugins...
  '@infinitered/react-native-mlkit-face-detection',
],
```

- [ ] **Step 3: Build a dev client and confirm it boots**

Run: `npx expo run:android` (or `run:ios` on a Mac with a connected device).
Expected: the custom dev client builds and launches on a **physical device**. This validates the native toolchain before pipeline work.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.config.js docs/superpowers/notes/native-ml-api.md
git commit -m "chore(photoClean): add native ML deps, config plugins, and pinned API notes"
```

---

## Task 9: Native engine loaders

**Files:**
- Create: `lib/photoClean/engine.native.ts`

**Interfaces:**
- Consumes: `react-native-mediapipe`, `@infinitered/react-native-mlkit-face-detection` — using the **exact** signatures recorded in `docs/superpowers/notes/native-ml-api.md`.
- Produces:
  - `getSegmenter(): Promise<Segmenter>` (lazy singleton)
  - `getFaceDetector(): Promise<FaceDetector>` (lazy singleton)
  where `Segmenter` / `FaceDetector` are the concrete types from Task 8's notes.

- [ ] **Step 1: Implement lazy singletons**

Mirror `engine.web.ts`'s singleton+retry structure, substituting the confirmed native init calls from the notes doc (model asset registration, `initModule`/`createModel` etc.). Keep the same exported names (`getSegmenter`, `getFaceDetector`) so `index.native.ts` matches the web shape.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/photoClean/engine.native.ts
git commit -m "feat(photoClean): add native MediaPipe + ML Kit engine loaders"
```

---

## Task 10: Native cleanPhoto pipeline (Skia compositing)

**Files:**
- Modify: `lib/photoClean/index.native.ts` (replace the Phase-1 re-export with the real pipeline)

**Interfaces:**
- Consumes: `getSegmenter`, `getFaceDetector` from `./engine.native`; `expandFaceBox` from `./geometry`; Skia from `@shopify/react-native-skia`; `CleanInput`, `CleanResult` from `./types`.
- Produces: `cleanPhoto(input: CleanInput): Promise<CleanResult>` (native override).

- [ ] **Step 1: Implement the pipeline**

Using the confirmed APIs from Task 8, implement the same 4 stages as web, but with Skia for compositing:
1. Decode `input.uri` to a Skia `Image` (downscale to ≤1024 long edge).
2. Run segmentation → obtain the foreground mask; use Skia to draw the image with the mask as alpha over a white `fillRect` on an offscreen `Surface`.
3. Run face detection → for each box, `expandFaceBox(...)`, then draw a blurred copy of the surface clipped to that rect (Skia `ImageFilter.MakeBlur` + `clipRect`).
4. `surface.makeImageSnapshot().encodeToBase64()` → build a `data:image/jpeg;base64,...` URI.

Wrap in the same `try/catch` + 15s `withTimeout` as web, returning `{ uri, base64, faceCount, ok:true }` on success and the original with `ok:false` on any failure.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual device verification**

Run the dev client on a physical device. Add a portrait photo in the upload flow. Expected: tile shows "Cleaning…" then a CLEANED chip; the cleaned preview has a white background and a blurred face; toggling to ORIGINAL restores the raw photo; publishing uploads the chosen version. Confirm a non-person photo (0 faces) still cleans without error, and that force-failing the model (airplane mode) falls back to Original without blocking publish.

- [ ] **Step 4: Commit**

```bash
git add lib/photoClean/index.native.ts
git commit -m "feat(photoClean): implement native background-removal + face-blur pipeline"
```

---

## Self-review notes (for the implementer)

- Every spec section maps to a task: types/geometry → T1; slot model → T2; entry point + fallback → T3; web engine → T4; web pipeline → T5; upload integration + preview/toggle → T6; web e2e → T7; native deps/build → T8; native engine → T9; native pipeline → T10.
- "Never block publish" is enforced in T5/T10 (`try/catch` + timeout → `ok:false`) and honored by T2's `applyResult`/`resolveImage` (failed slots resolve to `original`).
- No DB / `lib/upload.ts` changes anywhere — T6 only swaps what array is passed to `uploadListingImages`.
- `@imgly/background-removal` is never introduced. Only MediaPipe / ML Kit / Skia.
- Public API name `cleanPhoto` is identical across `index.ts`, `index.web.ts`, `index.native.ts`; `getSegmenter` / `getFaceDetector` names match across `engine.web.ts` / `engine.native.ts`.
