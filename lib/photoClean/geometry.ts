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
