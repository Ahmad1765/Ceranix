// lib/photoClean/index.web.ts
import type { CleanInput, CleanResult, FaceBox, CleanOptions } from './types';
import { getSegmenter, getFaceDetector } from './engine.web';
import { expandFaceBox } from './geometry';
import { resolveCleanOptions } from './options';

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
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('clean timeout')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function run(
  input: CleanInput,
  flags: { blurFace: boolean; removeBackground: boolean },
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
    const segmenter = await getSegmenter();
    const segImg = bctx.getImageData(0, 0, w, h);
    const seg = segmenter.segment(base);
    const conf = seg.confidenceMasks?.[0]?.getAsFloat32Array();
    seg.close(); // extract data first, then close — getAsFloat32Array returns a JS-side copy
    if (conf) {
      for (let i = 0; i < conf.length; i++) {
        if (conf[i] < FG_THRESHOLD) segImg.data[i * 4 + 3] = 0; // alpha → 0
      }
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
    const boxes: FaceBox[] = (faces.detections ?? []).map((d) => ({
      x: d.boundingBox!.originX,
      y: d.boundingBox!.originY,
      width: d.boundingBox!.width,
      height: d.boundingBox!.height,
    }));
    faceCount = boxes.length;
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
