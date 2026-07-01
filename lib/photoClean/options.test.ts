import { describe, it, expect } from 'vitest';
import { resolveCleanOptions } from '@/lib/photoClean/options';

describe('resolveCleanOptions', () => {
  it('defaults both flags to true and faceMode to blur (preserves listing behavior)', () => {
    expect(resolveCleanOptions()).toEqual({ blurFace: true, removeBackground: true, faceMode: 'blur' });
    expect(resolveCleanOptions({})).toEqual({ blurFace: true, removeBackground: true, faceMode: 'blur' });
  });
  it('respects explicit falses independently', () => {
    expect(resolveCleanOptions({ removeBackground: false })).toEqual({ blurFace: true, removeBackground: false, faceMode: 'blur' });
    expect(resolveCleanOptions({ blurFace: false })).toEqual({ blurFace: false, removeBackground: true, faceMode: 'blur' });
    expect(resolveCleanOptions({ blurFace: false, removeBackground: false })).toEqual({ blurFace: false, removeBackground: false, faceMode: 'blur' });
  });
  it('passes through faceMode when set', () => {
    expect(resolveCleanOptions({ faceMode: 'eyes' })).toEqual({ blurFace: true, removeBackground: true, faceMode: 'eyes' });
  });
});
