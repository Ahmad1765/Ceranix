import type { CleanInput, CleanResult } from './types';

// Native no-op fallback until the Phase 2 native pipeline lands. Inlined rather
// than re-exported from './index' because Metro resolves './index' platform-first
// — from inside index.native.ts that resolves back to this file. Returns ok:false
// so callers fall back to the original image.
export async function cleanPhoto(input: CleanInput): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
