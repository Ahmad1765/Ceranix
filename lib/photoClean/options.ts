import type { CleanOptions } from './types';

// Defaults keep the original behavior (remove background + blur face) so the
// existing Sell upload, which passes no options, is unchanged.
export function resolveCleanOptions(o?: CleanOptions): { blurFace: boolean; removeBackground: boolean } {
  return { blurFace: o?.blurFace ?? true, removeBackground: o?.removeBackground ?? true };
}
