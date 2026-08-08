// Binary integrity checks for image bytes, run immediately before a storage
// write.
//
// WHY THIS EXISTS
// lib/upload.ts compresses every picked photo and, on any compression failure,
// deliberately falls back to the ORIGINAL bytes so a broken re-encode never
// blocks a listing. That fallback is correct for benign failures (a tainted
// canvas, a CORS refusal) but it also swallows the one case where the bytes
// themselves are bad: a truncated or partially-copied file fails to decode,
// falls through the same catch, and gets uploaded raw. A DB row is then created
// pointing at an unrenderable image.
//
// That is not hypothetical — the listing "Testtt" carried a 382 KB JPEG with a
// valid FFD8FF start marker and no FFD9 end marker. It rendered broken in the
// app and later crashed the thumbnail backfill ("premature end of JPEG image").
//
// This module is deliberately free of react-native / expo / supabase imports so
// vitest can cover it in a plain node environment (lib/upload.ts itself cannot
// be imported there — it pulls in react-native).

/** Smallest plausible real image. Below this the bytes cannot be a photo. */
const MIN_IMAGE_BYTES = 100;

/**
 * How far back from the end to look for a JPEG's EOI marker.
 *
 * Strictly EOI is the final two bytes, but real encoders (and some phone
 * cameras) append padding or EXIF slack after it. Scanning a short tail keeps
 * those files working while still rejecting a genuinely truncated one, whose
 * FFD9 is missing entirely rather than merely displaced.
 */
const JPEG_EOI_SEARCH_WINDOW = 64;

export type IntegrityResult = { ok: true } | { ok: false; reason: string };

const OK: IntegrityResult = { ok: true };

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** Is `sig` present anywhere in the last `window` bytes? */
function endsWithin(bytes: Uint8Array, sig: number[], window: number): boolean {
  const from = Math.max(0, bytes.length - window);
  for (let i = bytes.length - sig.length; i >= from; i--) {
    let hit = true;
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Check that `bytes` look like a COMPLETE image of `contentType`.
 *
 * This validates framing, not pixels: it answers "were all the bytes written?",
 * which is the failure mode a dropped upload or an interrupted file copy
 * produces. It deliberately does not decode — decoding on the JS thread for
 * every photo would cost more than the bug it prevents.
 *
 * Unknown or unverifiable formats (HEIC/HEIF) pass: there is no cheap framing
 * check for them, and on native they are re-encoded to JPEG before this runs
 * anyway. Returning ok is the honest answer — "not checked" is not "corrupt".
 */
export function checkImageIntegrity(
  bytes: Uint8Array,
  contentType: string,
): IntegrityResult {
  if (bytes.length === 0) return { ok: false, reason: 'image is empty (0 bytes)' };
  if (bytes.length < MIN_IMAGE_BYTES) {
    return { ok: false, reason: `image is only ${bytes.length} bytes — too small to be a photo` };
  }

  const type = (contentType || '').toLowerCase();

  if (type.includes('jpeg') || type.includes('jpg')) {
    // SOI: FF D8 FF
    if (!startsWith(bytes, [0xff, 0xd8, 0xff])) {
      return { ok: false, reason: 'not a JPEG (missing FFD8FF start marker)' };
    }
    // EOI: FF D9
    if (!endsWithin(bytes, [0xff, 0xd9], JPEG_EOI_SEARCH_WINDOW)) {
      return { ok: false, reason: 'JPEG is truncated (missing FFD9 end marker)' };
    }
    return OK;
  }

  if (type.includes('png')) {
    const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!startsWith(bytes, PNG_SIG)) {
      return { ok: false, reason: 'not a PNG (bad signature)' };
    }
    // Every PNG ends with the IEND chunk, including its CRC.
    const IEND = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    if (!endsWithin(bytes, IEND, IEND.length)) {
      return { ok: false, reason: 'PNG is truncated (missing IEND chunk)' };
    }
    return OK;
  }

  if (type.includes('webp')) {
    // RIFF....WEBP
    if (!startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) ||
        !startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
      return { ok: false, reason: 'not a WebP (bad RIFF/WEBP header)' };
    }
    // The RIFF header declares its own payload size; a short file is truncated.
    // Little-endian uint32 at offset 4, counting everything after byte 8.
    const declared =
      bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (declared + 8 > bytes.length) {
      return {
        ok: false,
        reason: `WebP is truncated (header declares ${declared + 8} bytes, got ${bytes.length})`,
      };
    }
    return OK;
  }

  // HEIC/HEIF and anything else: no cheap framing check worth trusting.
  return OK;
}
