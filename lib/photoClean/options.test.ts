import { describe, it, expect } from 'vitest';
import { resolveCleanOptions } from '@/lib/photoClean/options';

describe('resolveCleanOptions', () => {
  it('defaults both to true (preserves existing listing behavior)', () => {
    expect(resolveCleanOptions()).toEqual({ blurFace: true, removeBackground: true });
    expect(resolveCleanOptions({})).toEqual({ blurFace: true, removeBackground: true });
  });
  it('respects explicit falses independently', () => {
    expect(resolveCleanOptions({ removeBackground: false })).toEqual({ blurFace: true, removeBackground: false });
    expect(resolveCleanOptions({ blurFace: false })).toEqual({ blurFace: false, removeBackground: true });
    expect(resolveCleanOptions({ blurFace: false, removeBackground: false })).toEqual({ blurFace: false, removeBackground: false });
  });
});
