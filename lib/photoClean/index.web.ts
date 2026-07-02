// lib/photoClean/index.web.ts
import type { CleanInput, CleanResult, FaceBox, CleanOptions } from './types';
import { getSegmenter, getFaceDetector } from './engine.web';
import { expandFaceBox, eyeBarRect } from './geometry';
import { resolveCleanOptions } from './options';
import { getMatteAlpha } from './matte.web';
import { getServerMaskDataUrl } from './serverMatte.web';
import { refineMatte } from './alpha';

const MAX_EDGE = 1024;        // downscale ceiling before analysis, for speed
const BLUR_PX = 22;           // gaussian blur radius for faces
// Generous ceiling: the first "remove background" run downloads a matting
// model (BiRefNet ~114MB on WebGPU browsers, MODNet ~25MB elsewhere; cached
// afterwards). If it still times out, the download continues in the background
// and the next attempt succeeds; the user just sees the original meanwhile.
const TIMEOUT_MS = 120000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

// Read a server-returned mask image into a RAW w*h alpha (refineMatte runs
// later, once, for every source). Transparent cutout PNGs carry the matte in
// the alpha channel; grayscale mask images (BiRefNet's output) are fully
// opaque, so fall back to the red channel.
function maskImageToAlpha(img: HTMLImageElement, w: number, h: number): Uint8Array | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  let hasTransparency = false;
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] < 250) {
      hasTransparency = true;
      break;
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = hasTransparency ? d[i * 4 + 3] : d[i * 4];
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('clean timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function run(
  input: CleanInput,
  flags: { blurFace: boolean; removeBackground: boolean; faceMode: 'blur' | 'eyes' },
): Promise<CleanResult> {
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

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;

  if (flags.removeBackground) {
    const segImg = bctx.getImageData(0, 0, w, h);
    // Quality ladder: server-side BiRefNet (edge function, best on every
    // device) → on-device matting (BiRefNet-WebGPU/MODNet) → MediaPipe ramp.
    let alpha: Uint8Array | null = null;
    const baseJpeg = base.toDataURL('image/jpeg', 0.92);
    const maskUrl = await getServerMaskDataUrl(baseJpeg.slice(baseJpeg.indexOf(',') + 1));
    if (maskUrl) {
      try {
        alpha = maskImageToAlpha(await loadImage(maskUrl), w, h);
      } catch (e) {
        console.warn('[photoClean] server mask unusable; using on-device', e);
        alpha = null;
      }
    }
    if (!alpha) alpha = await getMatteAlpha(src, w, h);
    if (!alpha) {
      // Last resort: MediaPipe selfie segmentation confidence as a raw matte.
      const segmenter = await getSegmenter();
      const seg = segmenter.segment(base);
      const conf = seg.confidenceMasks?.[0]?.getAsFloat32Array();
      seg.close(); // extract data first, then close — getAsFloat32Array returns a JS-side copy
      if (conf && conf.length >= w * h) {
        alpha = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) alpha[i] = Math.round(conf[i] * 255);
      }
    }
    if (alpha && alpha.length >= w * h) {
      // One repair pass for every source: residue/blob cleanup, color-confusion
      // hole filling, edge-crack mending, and guided-filter alignment of the
      // matte to the photo's real edges.
      const refined = refineMatte(alpha, segImg.data, w, h);
      for (let i = 0; i < w * h; i++) segImg.data[i * 4 + 3] = refined[i];
    }
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, w, h);
    // Draw the masked subject over the white fill via a scratch canvas.
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    scratch.getContext('2d')!.putImageData(segImg, 0, 0);
    octx.drawImage(scratch, 0, 0);
  } else {
    // Keep the real photo untouched underneath any face blur.
    octx.drawImage(base, 0, 0);
  }

  let faceCount = 0;
  if (flags.blurFace) {
    const faceDetector = await getFaceDetector();
    const faces = faceDetector.detect(base);
    const detections = faces.detections ?? [];
    faceCount = detections.length;
    for (const d of detections) {
      const bb = d.boundingBox!;
      const box: FaceBox = { x: bb.originX, y: bb.originY, width: bb.width, height: bb.height };

      if (flags.faceMode === 'eyes') {
        // Solid black censor bar over just the eyes. BlazeFace keypoints are
        // [rightEye, leftEye, ...] in normalized coords; fall back to the face
        // box's eye band when keypoints are unavailable.
        const kp = d.keypoints ?? [];
        const eyes =
          kp.length >= 2
            ? { right: { x: kp[0].x * w, y: kp[0].y * h }, left: { x: kp[1].x * w, y: kp[1].y * h } }
            : null;
        const bar = eyeBarRect(box, eyes, w, h);
        if (bar.width > 0 && bar.height > 0) {
          octx.fillStyle = '#000000';
          octx.fillRect(bar.x, bar.y, bar.width, bar.height);
        }
        continue;
      }

      const b = expandFaceBox(box, w, h);
      if (b.width <= 0 || b.height <= 0) continue;
      octx.save();
      octx.filter = `blur(${BLUR_PX}px)`;
      octx.beginPath();
      octx.rect(b.x, b.y, b.width, b.height);
      octx.clip();
      octx.drawImage(out, 0, 0); // redraw whole canvas through the blur, clipped to the face
      octx.restore();
    }
  }

  const dataUrl = out.toDataURL('image/jpeg', 0.85);
  const comma = dataUrl.indexOf(',');
  return {
    uri: dataUrl,
    base64: comma >= 0 ? dataUrl.slice(comma + 1) : null,
    faceCount,
    ok: true,
  };
}

export async function cleanPhoto(input: CleanInput, options?: CleanOptions): Promise<CleanResult> {
  const flags = resolveCleanOptions(options);
  try {
    return await withTimeout(run(input, flags), TIMEOUT_MS);
  } catch (e) {
    console.warn('[photoClean] web clean failed; using original', e);
    return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
  }
}
