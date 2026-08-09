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

export type Point = { x: number; y: number };

// Compute a horizontal censor bar covering the eyes. Prefers the detector's two
// eye keypoints (pixel coords); when they're missing, falls back to a band
// across the upper-middle of the face box. Result is clamped to the image.
export function eyeBarRect(
  box: FaceBox,
  eyes: { left: Point; right: Point } | null,
  imgW: number,
  imgH: number,
): FaceBox {
  if (eyes) {
    const x1 = Math.min(eyes.left.x, eyes.right.x);
    const x2 = Math.max(eyes.left.x, eyes.right.x);
    const cy = (eyes.left.y + eyes.right.y) / 2;
    const span = Math.max(x2 - x1, 1);
    const padX = span * 0.6; // extend past the outer eye corners
    const halfH = span * 0.35; // bar thickness relative to eye distance
    const left = Math.max(0, Math.round(x1 - padX));
    const right = Math.min(imgW, Math.round(x2 + padX));
    const top = Math.max(0, Math.round(cy - halfH));
    const bottom = Math.min(imgH, Math.round(cy + halfH));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  // Fallback: the eyes sit roughly in the 22%–48% vertical band of the face box.
  const left = Math.max(0, Math.round(box.x - box.width * 0.05));
  const right = Math.min(imgW, Math.round(box.x + box.width * 1.05));
  const top = Math.max(0, Math.round(box.y + box.height * 0.22));
  const bottom = Math.min(imgH, Math.round(box.y + box.height * 0.48));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
