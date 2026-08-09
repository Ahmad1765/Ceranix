import { describe, it, expect } from 'vitest';
import {
  refineAlpha,
  fillHoles,
  morphClose,
  guidedFilterAlpha,
  refineMatte,
} from '@/lib/photoClean/alpha';

describe('refineAlpha', () => {
  it('crushes faint residue to 0 and solidifies strong alpha to 255', () => {
    const out = refineAlpha(Uint8Array.from([10, 30, 240, 255]), 2, 2);
    expect(out[0]).toBe(0); // below lo → fully transparent
    expect(out[1]).toBe(0); // at lo → fully transparent
    expect(out[2]).toBe(255); // above hi → fully solid
    expect(out[3]).toBe(255);
  });

  it('maps mid alpha smoothly between 0 and 255 (soft edges survive)', () => {
    const mid = Math.round((30 + 220) / 2); // halfway through the ramp
    const out = refineAlpha(Uint8Array.from([mid]), 1, 1);
    expect(out[0]).toBeGreaterThan(100);
    expect(out[0]).toBeLessThan(160);
  });

  it('removes tiny disconnected islands but keeps the main region', () => {
    // 5x5: solid 3-wide block on the left (15 px), lone pixel at top-right.
    const w = 5;
    const h = 5;
    const a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < 3; x++) a[y * w + x] = 255;
    a[4] = 255; // disconnected 1-px blob
    const out = refineAlpha(a, w, h);
    expect(out[4]).toBe(0); // island removed
    expect(out[0]).toBe(255); // main region intact
    expect(out[2 * w + 2]).toBe(255);
  });

  it('keeps multiple large regions (e.g., two people in frame)', () => {
    const a = Uint8Array.from([255, 255, 255, 255, 0, 0, 255, 255, 255, 255]);
    const out = refineAlpha(a, 10, 1);
    expect(out[0]).toBe(255);
    expect(out[9]).toBe(255);
  });

  it('does not mutate the input array', () => {
    const a = Uint8Array.from([10, 255]);
    refineAlpha(a, 2, 1);
    expect(Array.from(a)).toEqual([10, 255]);
  });
});

// Build a w*h alpha of `fill` with a solid ring so the centre is enclosed.
function ringMask(w: number, h: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) a[y * w + x] = 255;
  }
  return a;
}

describe('fillHoles', () => {
  it('fills an enclosed hole where the model was uncertain (color confusion)', () => {
    const w = 7;
    const h = 7;
    const alpha = ringMask(w, h);
    alpha[3 * w + 3] = 0; // hole punched in the middle
    const raw = Uint8Array.from(alpha);
    raw[3 * w + 3] = 90; // model was ~35% confident → uncertain, not true background
    const out = fillHoles(alpha, raw, w, h, { speckleMax: 0 });
    expect(out[3 * w + 3]).toBe(255);
  });

  it('keeps a true see-through gap (model confidently background)', () => {
    const w = 9;
    const h = 9;
    const alpha = ringMask(w, h);
    // 3x3 enclosed gap, model confident it is background (raw 0)
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) alpha[y * w + x] = 0;
    const raw = Uint8Array.from(alpha);
    const out = fillHoles(alpha, raw, w, h, { speckleMax: 2 });
    expect(out[4 * w + 4]).toBe(0);
  });

  it('always fills tiny speckle holes regardless of confidence', () => {
    const w = 7;
    const h = 7;
    const alpha = ringMask(w, h);
    alpha[3 * w + 3] = 0;
    const raw = Uint8Array.from(alpha); // raw 0 at the hole — confident background
    const out = fillHoles(alpha, raw, w, h, { speckleMax: 4 });
    expect(out[3 * w + 3]).toBe(255); // but it is only 1px → speckle → filled
  });

  it('never fills background connected to the border', () => {
    const w = 7;
    const h = 7;
    const alpha = ringMask(w, h);
    const raw = new Uint8Array(w * h).fill(200); // even if raw claims uncertainty
    const out = fillHoles(alpha, raw, w, h);
    expect(out[0]).toBe(0); // corner stays background
  });
});

describe('morphClose', () => {
  it('mends a 1px break in a solid edge', () => {
    const w = 9;
    const h = 3;
    const a = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) a[1 * w + x] = 255; // solid middle row
    a[1 * w + 4] = 0; // crack
    const out = morphClose(a, w, h, 1);
    expect(out[1 * w + 4]).toBe(255);
  });

  it('does not delete isolated foreground or invent background pixels far away', () => {
    const w = 9;
    const h = 9;
    const a = new Uint8Array(w * h);
    a[4 * w + 4] = 255;
    const out = morphClose(a, w, h, 1);
    expect(out[4 * w + 4]).toBe(255); // survives close
    expect(out[0]).toBe(0); // empty corner untouched
  });
});

describe('guidedFilterAlpha', () => {
  // rgba helper: grayscale value v at every pixel of a region
  function rgbaFrom(values: number[]): Uint8Array {
    const out = new Uint8Array(values.length * 4);
    for (let i = 0; i < values.length; i++) {
      out[i * 4] = values[i];
      out[i * 4 + 1] = values[i];
      out[i * 4 + 2] = values[i];
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  it('keeps a uniform mask uniform', () => {
    const w = 8;
    const h = 8;
    const alpha = new Uint8Array(w * h).fill(255);
    const rgba = rgbaFrom(new Array(w * h).fill(128));
    const out = guidedFilterAlpha(alpha, rgba, w, h, 2, 0.005);
    for (let i = 0; i < w * h; i++) expect(out[i]).toBeGreaterThan(250);
  });

  it('preserves an edge that exists in both the image and the mask', () => {
    const w = 12;
    const h = 8;
    const vals: number[] = [];
    const alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fg = x < 6;
        vals.push(fg ? 220 : 20);
        alpha[y * w + x] = fg ? 255 : 0;
      }
    }
    const out = guidedFilterAlpha(alpha, rgbaFrom(vals), w, h, 2, 0.005);
    // Far side of each half stays committed; the edge doesn't smear across.
    expect(out[4 * w + 1]).toBeGreaterThan(200);
    expect(out[4 * w + 10]).toBeLessThan(55);
    expect(out[4 * w + 4]).toBeGreaterThan(127);
    expect(out[4 * w + 7]).toBeLessThan(128);
  });
});

describe('refineMatte', () => {
  it('runs the full chain: fills an uncertain hole and keeps the subject', () => {
    // 15x15 with a 4px background margin (wider than the closing radius, as in
    // any real photo) and a 7x7 subject with a color-confused patch inside.
    const w = 15;
    const h = 15;
    const raw = new Uint8Array(w * h);
    for (let y = 4; y <= 10; y++) {
      for (let x = 4; x <= 10; x++) raw[y * w + x] = 255;
    }
    raw[7 * w + 7] = 80; // color-confused patch inside the garment
    const out = refineMatte(raw, w, h);
    expect(out.length).toBe(w * h);
    expect(out[7 * w + 7]).toBeGreaterThan(180); // patch repaired
    expect(out[0]).toBe(0); // background stays background
  });

  it('preserves the model soft edge band (mild crush)', () => {
    // A single mid-alpha edge pixel next to solid subject must survive as a
    // soft value, not be crushed to 0 or blown to 255.
    const w = 12;
    const h = 12;
    const raw = new Uint8Array(w * h);
    for (let y = 4; y <= 8; y++) for (let x = 4; x <= 7; x++) raw[y * w + x] = 255;
    for (let y = 4; y <= 8; y++) raw[y * w + 8] = 128; // soft edge column
    const out = refineMatte(raw, w, h);
    expect(out[6 * w + 8]).toBeGreaterThan(60);
    expect(out[6 * w + 8]).toBeLessThan(220);
  });
});
