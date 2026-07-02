// lib/photoClean/alpha.ts
// Pure post-processing for a matting alpha mask (0..255, row-major w*h).
// Cleans up the two classic matting artifacts:
//   1. Faint residue/halo — semi-transparent leftovers where the model wasn't
//      confident. Fixed with a levels curve: crush low alpha to 0, solidify
//      high alpha to 255, smoothstep in between so edges stay soft.
//   2. Stray blobs — small disconnected mask islands floating away from the
//      subject. Fixed by flood-filling connected components and dropping any
//      component much smaller than the largest (large regions are all kept, so
//      photos with two people survive).
// No DOM/canvas — unit-tested in Node.

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
