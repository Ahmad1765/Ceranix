import type { CleanInput, CleanResult, CleanOptions } from './types';

// Native no-op fallback until the native pipeline lands. Inlined (not re-exported
// from './index') because Metro resolves './index' platform-first back to this
// file. Returns ok:false so callers fall back to the original image.
export async function cleanPhoto(input: CleanInput, _options?: CleanOptions): Promise<CleanResult> {
  return { uri: input.uri, base64: input.base64 ?? null, faceCount: 0, ok: false };
}
