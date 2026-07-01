import { describe, it, expect } from 'vitest';
import { expandFaceBox } from '@/lib/photoClean/geometry';

describe('expandFaceBox', () => {
  it('grows the box by 30% on each side by default', () => {
    const out = expandFaceBox({ x: 100, y: 100, width: 100, height: 100 }, 1000, 1000);
    // 30% of 100 = 30 padding each side
    expect(out).toEqual({ x: 70, y: 70, width: 160, height: 160 });
  });

  it('clamps to image bounds (never negative, never past edge)', () => {
    const out = expandFaceBox({ x: 10, y: 10, width: 40, height: 40 }, 60, 60, 0.5);
    // pad = 20 → x:-10→0, y:-10→0, right:70→60, bottom:70→60
    expect(out).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it('returns integer coordinates', () => {
    const out = expandFaceBox({ x: 33.3, y: 10.7, width: 50.5, height: 20.2 }, 500, 500, 0.3);
    expect(Number.isInteger(out.x)).toBe(true);
    expect(Number.isInteger(out.y)).toBe(true);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});
