import type { CleanInput, CleanResult, CleanOptions } from './types';

// Default no-op: platforms without a real pipeline (or the Node test env) get a
// safe fallback so callers use the original image. Web overrides via index.web.ts;
// native overrides via index.native.ts (Phase 2).
export async function cleanPhoto(input: CleanInput, _options?: CleanOptions): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
