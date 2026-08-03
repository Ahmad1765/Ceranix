// Pure geometry for the banner cropper.
//
// Deliberately free of React Native imports so it can be unit-tested in the
// node-environment vitest runner — this is the one part of the cropper that
// fails *silently* (a subtly wrong crop still renders fine) rather than
// visibly, so it needs tests more than the component around it does.

/** A crop region in SOURCE pixel coordinates. Structurally the `CropRect` in lib/upload. */
export type BannerCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type Size = { width: number; height: number };

/** The scale at which the photo exactly covers the frame — `contentFit="cover"`, made explicit. */
export function coverScaleFor(source: Size, frame: Size): number {
  if (!source.width || !source.height) return 1;
  return Math.max(frame.width / source.width, frame.height / source.height);
}

/**
 * Invert the on-screen transform back into a crop rect in source pixels.
 *
 * The photo is drawn centred in the frame at `coverScale * zoom`, then shifted
 * by (tx, ty). So the frame's top-left, in displayed coordinates, is the
 * half-overflow minus the shift; dividing through by the total scale converts
 * the whole rect into source pixels.
 */
export function computeCropRect(args: {
  source: Size;
  frame: Size;
  coverScale: number;
  zoom: number;
  tx: number;
  ty: number;
}): BannerCropRect {
  const { source, frame, coverScale, zoom, tx, ty } = args;
  const scale = coverScale * zoom;
  const displayedW = source.width * scale;
  const displayedH = source.height * scale;
  return {
    originX: ((displayedW - frame.width) / 2 - tx) / scale,
    originY: ((displayedH - frame.height) / 2 - ty) / scale,
    width: frame.width / scale,
    height: frame.height / scale,
  };
}
