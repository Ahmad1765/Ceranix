// Covers the guard that lib/upload.ts runs before every storage write.
//
// NOTE ON LOCATION: this is not lib/upload.test.ts because lib/upload.ts
// imports react-native, expo-file-system and expo-image-manipulator at module
// scope, none of which load in vitest's node environment. Splitting the pure
// check into its own module is the same arrangement the repo already uses for
// supabase/functions/send-push/mapper.ts — the logic gets real coverage instead
// of a react-native mocking harness that would itself need maintaining.

import { describe, it, expect } from 'vitest';
import { checkImageIntegrity } from '@/lib/imageIntegrity';

// Builders that produce byte arrays with realistic framing.
function jpeg({ truncated = false, size = 500 } = {}): Uint8Array {
  const b = new Uint8Array(size);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; // SOI + APP0
  for (let i = 4; i < size - 2; i++) b[i] = 0x40;
  if (!truncated) {
    b[size - 2] = 0xff;
    b[size - 1] = 0xd9; // EOI
  } else {
    // Exactly the shape of the real "Testtt" file: valid start, no EOI, the
    // tail just stops mid-scan.
    b[size - 2] = 0x00;
    b[size - 1] = 0x00;
  }
  return b;
}

function png({ truncated = false, size = 500 } = {}): Uint8Array {
  const b = new Uint8Array(size);
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  SIG.forEach((v, i) => (b[i] = v));
  for (let i = 8; i < size - 8; i++) b[i] = 0x21;
  if (!truncated) {
    [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82].forEach(
      (v, i) => (b[size - 8 + i] = v),
    );
  }
  return b;
}

function webp({ declaredSize, size = 500 }: { declaredSize?: number; size?: number } = {}) {
  const b = new Uint8Array(size);
  [0x52, 0x49, 0x46, 0x46].forEach((v, i) => (b[i] = v)); // RIFF
  const declared = declaredSize ?? size - 8;
  b[4] = declared & 0xff;
  b[5] = (declared >> 8) & 0xff;
  b[6] = (declared >> 16) & 0xff;
  b[7] = (declared >> 24) & 0xff;
  [0x57, 0x45, 0x42, 0x50].forEach((v, i) => (b[8 + i] = v)); // WEBP
  return b;
}

function reason(r: ReturnType<typeof checkImageIntegrity>): string {
  if (r.ok) throw new Error('expected a rejection, got ok');
  return r.reason;
}

describe('checkImageIntegrity — JPEG', () => {
  it('accepts a complete JPEG', () => {
    expect(checkImageIntegrity(jpeg(), 'image/jpeg')).toEqual({ ok: true });
  });

  it('REJECTS a truncated JPEG — the "Testtt" failure', () => {
    // Valid FFD8FF start, no FFD9 anywhere. This is the byte pattern that was
    // sitting in production storage and rendering as a broken image.
    const r = checkImageIntegrity(jpeg({ truncated: true }), 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(reason(r)).toMatch(/truncated/i);
  });

  it('rejects bytes that are not a JPEG at all', () => {
    const notJpeg = new Uint8Array(500).fill(0x41);
    expect(reason(checkImageIntegrity(notJpeg, 'image/jpeg'))).toMatch(/FFD8FF/);
  });

  it('tolerates trailing padding after EOI', () => {
    // Some encoders append slack past the end marker; that file is complete.
    const b = jpeg({ size: 500 });
    const padded = new Uint8Array(530);
    padded.set(b, 0);
    expect(checkImageIntegrity(padded, 'image/jpeg')).toEqual({ ok: true });
  });

  it('still rejects when EOI is far outside the tail window', () => {
    // A complete JPEG followed by kilobytes of junk is not something our
    // encoders produce; treating it as suspect is the safer default.
    const b = jpeg({ size: 500 });
    const padded = new Uint8Array(2000);
    padded.set(b, 0);
    expect(checkImageIntegrity(padded, 'image/jpeg').ok).toBe(false);
  });

  it('matches on the jpg content-type spelling too', () => {
    expect(checkImageIntegrity(jpeg({ truncated: true }), 'image/jpg').ok).toBe(false);
  });
});

describe('checkImageIntegrity — PNG', () => {
  it('accepts a complete PNG', () => {
    expect(checkImageIntegrity(png(), 'image/png')).toEqual({ ok: true });
  });

  it('rejects a PNG with no IEND chunk', () => {
    expect(reason(checkImageIntegrity(png({ truncated: true }), 'image/png'))).toMatch(/IEND/);
  });

  it('rejects a bad PNG signature', () => {
    const b = png();
    b[1] = 0x00;
    expect(reason(checkImageIntegrity(b, 'image/png'))).toMatch(/signature/);
  });
});

describe('checkImageIntegrity — WebP', () => {
  it('accepts a WebP whose declared size matches', () => {
    expect(checkImageIntegrity(webp(), 'image/webp')).toEqual({ ok: true });
  });

  it('rejects a WebP whose RIFF header declares more than arrived', () => {
    // The exact signature of a dropped upload: the header promises N bytes and
    // the transfer stopped early.
    const r = checkImageIntegrity(webp({ declaredSize: 5000, size: 500 }), 'image/webp');
    expect(reason(r)).toMatch(/truncated/i);
  });

  it('rejects a bad RIFF/WEBP header', () => {
    const b = webp();
    b[9] = 0x00;
    expect(reason(checkImageIntegrity(b, 'image/webp'))).toMatch(/RIFF|WEBP/);
  });
});

describe('checkImageIntegrity — size floors and unknown types', () => {
  it('rejects empty bytes', () => {
    expect(reason(checkImageIntegrity(new Uint8Array(0), 'image/jpeg'))).toMatch(/empty/);
  });

  it('rejects a file too small to be a photo', () => {
    expect(reason(checkImageIntegrity(new Uint8Array(50), 'image/jpeg'))).toMatch(/too small/);
  });

  it('passes HEIC through rather than guessing', () => {
    // No cheap framing check exists; native re-encodes to JPEG before upload.
    // "Not checked" must not be reported as "corrupt".
    const b = new Uint8Array(500).fill(0x11);
    expect(checkImageIntegrity(b, 'image/heic')).toEqual({ ok: true });
  });

  it('passes an unrecognised content-type through', () => {
    const b = new Uint8Array(500).fill(0x11);
    expect(checkImageIntegrity(b, 'application/octet-stream')).toEqual({ ok: true });
    expect(checkImageIntegrity(b, '')).toEqual({ ok: true });
  });
});
