// lib/photoClean/alpha.ts
// Pure post-processing for a matting alpha mask (0..255, row-major w*h).
// Repairs the classic matting artifacts:
//   1. Faint residue/halo — levels curve (refineAlpha).
//   2. Stray disconnected blobs — island removal (refineAlpha).
//   3. Garment patches wrongly erased because their color resembled the
//      background — uncertainty-gated hole filling (fillHoles).
//   4. Broken/nicked edges — grayscale morphological closing (morphClose).
//   5. Jagged edges misaligned with the real garment boundary — a guided
//      filter that uses the photo itself to snap the matte to image edges
//      (guidedFilterAlpha).
// refineMatte composes all of it. No DOM/canvas — unit-tested in Node.

export type RefineOptions = {
  lo?: number; // alpha at/below this → 0 (kills faint halo/noise)
  hi?: number; // alpha at/above this → 255 (solidifies the subject)
  keepRatio?: number; // keep components >= keepRatio * largest component
};

export function refineAlpha(
  alpha: Uint8Array,
  w: number,
  h: number,
  opts: RefineOptions = {},
): Uint8Array {
  const lo = opts.lo ?? 30;
  const hi = opts.hi ?? 220;
  const keepRatio = opts.keepRatio ?? 0.1;
  const n = w * h;
  const out = new Uint8Array(n);

  // 1. Levels curve.
  const range = hi - lo;
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (a <= lo) continue; // stays 0
    if (a >= hi) {
      out[i] = 255;
      continue;
    }
    const t = (a - lo) / range;
    out[i] = Math.round(255 * t * t * (3 - 2 * t)); // smoothstep
  }

  // 2. Island removal via iterative flood fill (4-connectivity) over nonzero
  // alpha. Runs after the curve so faint bridges to stray blobs are already
  // severed.
  const labels = new Int32Array(n); // 0 = unlabeled/background
  const sizes: number[] = [0];
  let nextLabel = 1;
  const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (out[i] === 0 || labels[i] !== 0) continue;
    const label = nextLabel++;
    let size = 0;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = label;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      if (x > 0 && out[p - 1] !== 0 && labels[p - 1] === 0) {
        labels[p - 1] = label;
        stack[sp++] = p - 1;
      }
      if (x + 1 < w && out[p + 1] !== 0 && labels[p + 1] === 0) {
        labels[p + 1] = label;
        stack[sp++] = p + 1;
      }
      if (p - w >= 0 && out[p - w] !== 0 && labels[p - w] === 0) {
        labels[p - w] = label;
        stack[sp++] = p - w;
      }
      if (p + w < n && out[p + w] !== 0 && labels[p + w] === 0) {
        labels[p + w] = label;
        stack[sp++] = p + w;
      }
    }
    sizes[label] = size;
  }

  if (nextLabel > 2) {
    let largest = 0;
    for (let l = 1; l < nextLabel; l++) if (sizes[l] > largest) largest = sizes[l];
    const minKeep = largest * keepRatio;
    for (let i = 0; i < n; i++) {
      if (out[i] !== 0 && sizes[labels[i]] < minKeep) out[i] = 0;
    }
  }

  return out;
}

export type FillHolesOptions = {
  speckleMax?: number; // holes at/below this many px are always filled
  uncertainMin?: number; // fill larger holes when the model's mean raw alpha ≥ this
};

// Fill transparent regions fully enclosed by the subject. Border-connected
// background is never touched. A large enclosed region is filled only when the
// model was UNCERTAIN there (mean raw alpha ≥ uncertainMin): color-confused
// garment patches read as noisy mid alpha, while true see-through gaps (arm on
// hip) read as confident ~0 and are preserved.
export function fillHoles(
  alpha: Uint8Array,
  rawAlpha: Uint8Array,
  w: number,
  h: number,
  opts: FillHolesOptions = {},
): Uint8Array {
  const speckleMax = opts.speckleMax ?? 64;
  const uncertainMin = opts.uncertainMin ?? 24;
  const n = w * h;
  const out = Uint8Array.from(alpha);
  const outside = new Uint8Array(n); // 1 = background reachable from the border
  const stack = new Int32Array(n);
  let sp = 0;

  const seed = (p: number) => {
    if (out[p] === 0 && !outside[p]) {
      outside[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x + 1 < w) seed(p + 1);
    if (p - w >= 0) seed(p - w);
    if (p + w < n) seed(p + w);
  }

  // Label the remaining (enclosed) transparent components.
  const labels = new Int32Array(n);
  const sizes: number[] = [0];
  const rawSums: number[] = [0];
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (out[i] !== 0 || outside[i] || labels[i]) continue;
    const label = next++;
    let size = 0;
    let sum = 0;
    let tp = 0;
    stack[tp++] = i;
    labels[i] = label;
    while (tp > 0) {
      const p = stack[--tp];
      size++;
      sum += rawAlpha[p];
      const x = p % w;
      const tryPush = (q: number) => {
        if (out[q] === 0 && !outside[q] && !labels[q]) {
          labels[q] = label;
          stack[tp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x + 1 < w) tryPush(p + 1);
      if (p - w >= 0) tryPush(p - w);
      if (p + w < n) tryPush(p + w);
    }
    sizes[label] = size;
    rawSums[label] = sum;
  }

  if (next > 1) {
    const fill: boolean[] = [false];
    for (let l = 1; l < next; l++) {
      fill[l] = sizes[l] <= speckleMax || rawSums[l] / sizes[l] >= uncertainMin;
    }
    for (let i = 0; i < n; i++) {
      if (out[i] === 0 && !outside[i] && fill[labels[i]]) out[i] = 255;
    }
  }
  return out;
}

// Separable grayscale max/min filter pass. Out-of-image pixels are simply
// ignored (equivalent to padding with the neutral element), so closing does
// not shrink subjects that touch the frame.
function morphPass(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
  isMax: boolean,
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = isMax ? 0 : 255;
      for (let d = -r; d <= r; d++) {
        const xx = horizontal ? x + d : x;
        const yy = horizontal ? y : y + d;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
        const v = src[yy * w + xx];
        if (isMax ? v > best : v < best) best = v;
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

// Morphological closing (dilate then erode): mends cracks and nicks up to
// ~2r px wide along the silhouette without changing the overall shape.
export function morphClose(alpha: Uint8Array, w: number, h: number, r = 2): Uint8Array {
  let a = morphPass(alpha, w, h, r, true, true);
  a = morphPass(a, w, h, r, false, true);
  a = morphPass(a, w, h, r, true, false);
  a = morphPass(a, w, h, r, false, false);
  return a;
}

// Mean over a clamped square window via an integral image (O(n)).
function boxMean(src: Float64Array, w: number, h: number, r: number, out: Float64Array): void {
  const iw = w + 1;
  const integ = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      integ[(y + 1) * iw + (x + 1)] = integ[y * iw + (x + 1)] + rowSum;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const sum =
        integ[(y1 + 1) * iw + (x1 + 1)] -
        integ[y0 * iw + (x1 + 1)] -
        integ[(y1 + 1) * iw + x0] +
        integ[y0 * iw + x0];
      out[y * w + x] = sum / ((y1 - y0 + 1) * (x1 - x0 + 1));
    }
  }
}

// He et al.'s guided filter with the photo's luminance as the guide: locally
// fits alpha as a linear function of the image (edge-aware smoothing).
// NOT part of refineMatte: lab testing on real outfit photos showed it washes
// out matte interiors (semi-transparent subject) and bleeds high-contrast
// background texture back in — MODNet/BiRefNet mattes are already soft-edged
// and need no reconstruction. Kept (tested) for a possible future narrow
// edge-band-only variant.
export function guidedFilterAlpha(
  alpha: Uint8Array,
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  r = 6,
  eps = 0.005,
): Uint8Array {
  const n = w * h;
  const I = new Float64Array(n);
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    I[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
    p[i] = alpha[i] / 255;
  }
  const Ip = new Float64Array(n);
  const II = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mI = new Float64Array(n);
  const mP = new Float64Array(n);
  const mIp = new Float64Array(n);
  const mII = new Float64Array(n);
  boxMean(I, w, h, r, mI);
  boxMean(p, w, h, r, mP);
  boxMean(Ip, w, h, r, mIp);
  boxMean(II, w, h, r, mII);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i];
    a[i] = (mIp[i] - mI[i] * mP[i]) / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = new Float64Array(n);
  const mB = new Float64Array(n);
  boxMean(a, w, h, r, mA);
  boxMean(b, w, h, r, mB);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const q = mA[i] * I[i] + mB[i];
    out[i] = q <= 0 ? 0 : q >= 1 ? 255 : Math.round(q * 255);
  }
  return out;
}

// Full repair chain for a raw model matte: mild residue crush + island removal
// → color-confusion hole filling → gentle crack mending. Parameters were tuned
// visually against real outfit photos (Testing for wardrobe/) in an offline
// harness; a milder crush (20/235) preserves the model's native soft edges,
// and closing at r=1 mends nicks without rounding garment corners.
export function refineMatte(rawAlpha: Uint8Array, w: number, h: number): Uint8Array {
  let a = refineAlpha(rawAlpha, w, h, { lo: 20, hi: 235 });
  a = fillHoles(a, rawAlpha, w, h);
  a = morphClose(a, w, h, 1);
  return a;
}
