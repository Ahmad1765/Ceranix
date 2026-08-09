import { describe, it, expect } from 'vitest';
import { expandFaceBox, eyeBarRect } from '@/lib/photoClean/geometry';

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

describe('eyeBarRect', () => {
  const box = { x: 100, y: 100, width: 100, height: 100 };

  it('spans both eyes with horizontal padding and a thickness from eye distance', () => {
    // eyes 40px apart horizontally, same y. span=40, padX=24, halfH=14.
    const out = eyeBarRect(box, { left: { x: 170, y: 150 }, right: { x: 130, y: 150 } }, 1000, 1000);
    expect(out).toEqual({ x: 106, y: 136, width: 88, height: 28 });
  });

  it('falls back to the upper-middle band of the face box when eyes are missing', () => {
    const out = eyeBarRect(box, null, 1000, 1000);
    // x: 100-5=95 .. 100+105=205 ; y: 100+22=122 .. 100+48=148
    expect(out).toEqual({ x: 95, y: 122, width: 110, height: 26 });
  });

  it('clamps to the image bounds', () => {
    const out = eyeBarRect({ x: 0, y: 0, width: 20, height: 20 }, null, 10, 10);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.width).toBeLessThanOrEqual(10);
    expect(out.y + out.height).toBeLessThanOrEqual(10);
  });
});
