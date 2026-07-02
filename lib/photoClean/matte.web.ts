// lib/photoClean/matte.web.ts
//
// High-quality background matting via MODNet (Apache-2.0) running in-browser
// through Transformers.js. This replaces MediaPipe's low-res selfie segmenter
// for the "remove background" path — MODNet is an image-matting model, so it
// produces clean, soft, hair-accurate edges on full-body outfit photos.
//
// Like engine.web.ts, the library is loaded at RUNTIME from a CDN via a dynamic
// import hidden from Metro's bundler (Transformers.js can't be Metro-bundled).
// Everything is best-effort: any failure returns null so the caller falls back
// to the MediaPipe path, then to the original image.

// Transformers.js has no bundled types here; treat the module as untyped.
type TF = any;

const TRANSFORMERS_ESM = 'https://esm.sh/@huggingface/transformers@4.2.0';
const MODEL_ID = 'Xenova/modnet';

let tfPromise: Promise<TF> | null = null;
function loadTransformers(): Promise<TF> {
  if (!tfPromise) {
    // new Function hides the import() from Metro's static analyzer so it is
    // never pulled into the app bundle; the browser loads the ESM from the CDN.
    const nativeImport = new Function('u', 'return import(u);') as (u: string) => Promise<TF>;
    tfPromise = nativeImport(TRANSFORMERS_ESM).catch((e) => {
      tfPromise = null;
      throw e;
    });
  }
  return tfPromise;
}

let modelPromise: Promise<any> | null = null;
let processorPromise: Promise<any> | null = null;

function getModel(tf: TF): Promise<any> {
  if (!modelPromise) {
    const p: Promise<any> = tf.AutoModel.from_pretrained(MODEL_ID, { dtype: 'fp32' }).catch((e: unknown) => {
      modelPromise = null;
      throw e;
    });
    modelPromise = p;
  }
  return modelPromise;
}

function getProcessor(tf: TF): Promise<any> {
  if (!processorPromise) {
    const p: Promise<any> = tf.AutoProcessor.from_pretrained(MODEL_ID).catch((e: unknown) => {
      processorPromise = null;
      throw e;
    });
    processorPromise = p;
  }
  return processorPromise;
}

// Returns a per-pixel foreground alpha (0..255) at exactly w*h, row-major, or
// null if MODNet is unavailable/failed. The caller applies it as the alpha
// channel of the downscaled base image before compositing on white.
export async function getMatteAlpha(src: string, w: number, h: number): Promise<Uint8Array | null> {
  try {
    const tf = await loadTransformers();
    const [model, processor] = await Promise.all([getModel(tf), getProcessor(tf)]);
    const image = await tf.RawImage.fromURL(src);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    // output[0] is the single-channel alpha matte in [0,1]; scale to bytes and
    // resize to the working canvas size.
    const mask = await tf.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(w, h);
    const data: ArrayLike<number> = mask.data;
    if (!data || data.length < w * h) return null;
    return data instanceof Uint8Array ? data : Uint8Array.from(data);
  } catch (e) {
    console.warn('[photoClean] MODNet matte unavailable; falling back', e);
    return null;
  }
}
