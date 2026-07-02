import { describe, it, expect } from 'vitest';
import { refineAlpha } from '@/lib/photoClean/alpha';

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
