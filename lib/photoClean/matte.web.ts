// lib/photoClean/matte.web.ts
//
// High-quality background matting in the browser via Transformers.js, with a
// tiered model chain (best available for this device, all free + commercial-safe):
//   1. BiRefNet_lite (MIT) on WebGPU — state-of-the-art edges; only attempted
//      when the browser exposes WebGPU (fp16, ~114MB one-time download).
//   2. MODNet (Apache-2.0) on WASM — solid matting everywhere else (~25MB).
// Any failure returns null so the caller falls back to MediaPipe segmentation,
// then to the original image — posting is never blocked.
//
// Like engine.web.ts, the library is loaded at RUNTIME from a CDN via a dynamic
// import hidden from Metro's bundler (Transformers.js can't be Metro-bundled).
import { refineAlpha } from './alpha';

// Transformers.js has no bundled types here; treat the module as untyped.
type TF = any;

// The package's own `jsdelivr` field target — the standalone browser ESM build
// (verified: 200, ESM, exports AutoModel/AutoProcessor/RawImage). v4 renamed
// the dist files, so the v3-era transformers.min.mjs path 404s; and the
// exports-map `transformers.web.js` is for bundlers, not raw browser imports.
const TRANSFORMERS_ESM =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';
const MODNET_ID = 'Xenova/modnet';
// Canonical repo name — 'onnx-community/BiRefNet_lite' is a redirect to this.
const BIREFNET_ID = 'onnx-community/BiRefNet_lite-ONNX';

let tfPromise: Promise<TF> | null = null;
function loadTransformers(): Promise<TF> {
  if (!tfPromise) {
    // new Function hides the import() from Metro's static analyzer so it is
    // never pulled into the app bundle; the browser loads the ESM from the CDN.
    const nativeImport = new Function('u', 'return import(u);') as (u: string) => Promise<TF>;
    const p: Promise<TF> = nativeImport(TRANSFORMERS_ESM).catch((e) => {
      tfPromise = null;
      throw e;
    });
    tfPromise = p;
  }
  return tfPromise;
}

// ── MODNet (WASM, everywhere) ───────────────────────────────────────────────
let modnetModelPromise: Promise<any> | null = null;
let modnetProcessorPromise: Promise<any> | null = null;

function getModnetModel(tf: TF): Promise<any> {
  if (!modnetModelPromise) {
    const p: Promise<any> = tf.AutoModel.from_pretrained(MODNET_ID, { dtype: 'fp32' }).catch(
      (e: unknown) => {
        modnetModelPromise = null;
        throw e;
      },
    );
    modnetModelPromise = p;
  }
  return modnetModelPromise;
}

function getModnetProcessor(tf: TF): Promise<any> {
  if (!modnetProcessorPromise) {
    const p: Promise<any> = tf.AutoProcessor.from_pretrained(MODNET_ID).catch((e: unknown) => {
      modnetProcessorPromise = null;
      throw e;
    });
    modnetProcessorPromise = p;
  }
  return modnetProcessorPromise;
}

// ── BiRefNet_lite (WebGPU only) ─────────────────────────────────────────────
// Once a load/inference fails we disable BiRefNet for the session instead of
// re-downloading ~114MB on every toggle; MODNet still provides a good matte.
let birefnetDisabled = false;
let birefnetModelPromise: Promise<any> | null = null;
let birefnetProcessorPromise: Promise<any> | null = null;

function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

function getBirefnetModel(tf: TF): Promise<any> {
  if (!birefnetModelPromise) {
    const p: Promise<any> = tf.AutoModel.from_pretrained(BIREFNET_ID, {
      dtype: 'fp16',
      device: 'webgpu',
    }).catch((e: unknown) => {
      birefnetModelPromise = null;
      throw e;
    });
    birefnetModelPromise = p;
  }
  return birefnetModelPromise;
}

function getBirefnetProcessor(tf: TF): Promise<any> {
  if (!birefnetProcessorPromise) {
    const p: Promise<any> = tf.AutoProcessor.from_pretrained(BIREFNET_ID).catch((e: unknown) => {
      birefnetProcessorPromise = null;
      throw e;
    });
    birefnetProcessorPromise = p;
  }
  return birefnetProcessorPromise;
}

// ── Shared mask handling ────────────────────────────────────────────────────
// Convert a RawImage mask into a refined w*h alpha. Stride-aware in case the
// RawImage carries more than one channel.
function maskToAlpha(mask: any, w: number, h: number): Uint8Array | null {
  const data: ArrayLike<number> = mask?.data;
  const n = w * h;
  if (!data || data.length < n) return null;
  const stride = Math.floor(data.length / n);
  let raw: Uint8Array;
  if (stride === 1 && data instanceof Uint8Array) {
    raw = data;
  } else {
    raw = new Uint8Array(n);
    for (let i = 0; i < n; i++) raw[i] = data[i * stride];
  }
  // Clean up matting artifacts: crush faint halo residue and drop stray
  // disconnected blobs before handing the alpha to the compositor.
  return refineAlpha(raw, w, h);
}

async function birefnetAlpha(tf: TF, image: any, w: number, h: number): Promise<Uint8Array | null> {
  const [model, processor] = await Promise.all([getBirefnetModel(tf), getBirefnetProcessor(tf)]);
  // BiRefNet's ONNX I/O differs from MODNet: input_image → output_image, and
  // the logits need a sigmoid before scaling (per the model card).
  const { pixel_values } = await processor(image);
  const { output_image } = await model({ input_image: pixel_values });
  const mask = await tf.RawImage.fromTensor(output_image[0].sigmoid().mul(255).to('uint8')).resize(w, h);
  return maskToAlpha(mask, w, h);
}

async function modnetAlpha(tf: TF, image: any, w: number, h: number): Promise<Uint8Array | null> {
  const [model, processor] = await Promise.all([getModnetModel(tf), getModnetProcessor(tf)]);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const mask = await tf.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(w, h);
  return maskToAlpha(mask, w, h);
}

// Returns a per-pixel foreground alpha (0..255) at exactly w*h, row-major, or
// null if no matting model is available. The caller applies it as the alpha
// channel of the downscaled base image before compositing on white.
export async function getMatteAlpha(src: string, w: number, h: number): Promise<Uint8Array | null> {
  try {
    const tf = await loadTransformers();
    const image = await tf.RawImage.fromURL(src);

    if (hasWebGPU() && !birefnetDisabled) {
      try {
        const alpha = await birefnetAlpha(tf, image, w, h);
        if (alpha) return alpha;
      } catch (e) {
        birefnetDisabled = true; // don't re-download ~114MB on every toggle
        console.warn('[photoClean] BiRefNet unavailable; using MODNet', e);
      }
    }

    return await modnetAlpha(tf, image, w, h);
  } catch (e) {
    console.warn('[photoClean] matte unavailable; falling back', e);
    return null;
  }
}
