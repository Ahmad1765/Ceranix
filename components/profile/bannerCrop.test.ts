import { describe, it, expect } from 'vitest';
import { coverScaleFor, computeCropRect } from './bannerCrop';

// A 16:9 frame, the ratio <ProfileBanner> renders at.
const FRAME = { width: 640, height: 360 };

describe('coverScaleFor', () => {
  it('scales by the constraining axis so the frame is always filled', () => {
    // Wider than 16:9 → height is the constraint.
    expect(coverScaleFor({ width: 4000, height: 1000 }, FRAME)).toBeCloseTo(360 / 1000);
    // Taller than 16:9 → width is the constraint.
    expect(coverScaleFor({ width: 1000, height: 4000 }, FRAME)).toBeCloseTo(640 / 1000);
  });

  it('never divides by zero on a source with no metadata', () => {
    expect(coverScaleFor({ width: 0, height: 0 }, FRAME)).toBe(1);
  });
});

describe('computeCropRect', () => {
  const rectFor = (
    source: { width: number; height: number },
    over: Partial<{ zoom: number; tx: number; ty: number }> = {},
  ) =>
    computeCropRect({
      source,
      frame: FRAME,
      coverScale: coverScaleFor(source, FRAME),
      zoom: 1,
      tx: 0,
      ty: 0,
      ...over,
    });

  it('takes the full image when it already matches the frame ratio', () => {
    const rect = rectFor({ width: 1920, height: 1080 });
    expect(rect.originX).toBeCloseTo(0);
    expect(rect.originY).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(1920);
    expect(rect.height).toBeCloseTo(1080);
  });

  it('centres the crop on a too-tall image, trimming top and bottom equally', () => {
    // 1000x2000 in a 16:9 frame: full width, centred vertically.
    const rect = rectFor({ width: 1000, height: 2000 });
    expect(rect.originX).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(1000);
    expect(rect.height).toBeCloseTo(562.5);
    expect(rect.originY).toBeCloseTo((2000 - 562.5) / 2);
  });

  it('centres the crop on a too-wide image, trimming left and right equally', () => {
    const rect = rectFor({ width: 4000, height: 1000 });
    expect(rect.originY).toBeCloseTo(0);
    expect(rect.height).toBeCloseTo(1000);
    expect(rect.width).toBeCloseTo(1000 * (16 / 9));
    expect(rect.originX).toBeCloseTo((4000 - 1000 * (16 / 9)) / 2);
  });

  it('moves the crop window opposite the drag — dragging the photo right reveals its left', () => {
    const source = { width: 4000, height: 1000 };
    const centred = rectFor(source);
    const dragged = rectFor(source, { tx: 100 });
    expect(dragged.originX).toBeLessThan(centred.originX);
    // 100 screen px at this scale (360/1000) is ~278 source px.
    expect(centred.originX - dragged.originX).toBeCloseTo(100 / (360 / 1000));
  });

  it('zooming in takes fewer source pixels, keeping the crop centred', () => {
    const source = { width: 1920, height: 1080 };
    const rect = rectFor(source, { zoom: 2 });
    expect(rect.width).toBeCloseTo(960);
    expect(rect.height).toBeCloseTo(540);
    expect(rect.originX).toBeCloseTo((1920 - 960) / 2);
    expect(rect.originY).toBeCloseTo((1080 - 540) / 2);
  });

  it('always yields a crop at the banner ratio, whatever the source', () => {
    for (const source of [
      { width: 1920, height: 1080 },
      { width: 1000, height: 4000 },
      { width: 4000, height: 1000 },
      { width: 800, height: 800 },
    ]) {
      const rect = rectFor(source, { zoom: 1.5, tx: 12, ty: -30 });
      expect(rect.width / rect.height).toBeCloseTo(16 / 9);
    }
  });
});
