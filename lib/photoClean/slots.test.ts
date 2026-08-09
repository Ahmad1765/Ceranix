import { describe, it, expect } from 'vitest';
import { makeSlot, applyResult, toggleSlot, resolveImage } from '@/lib/photoClean/slots';

const original = { uri: 'file://orig.jpg', base64: 'AAAA' };
const cleanedResult = { uri: 'data:cleaned', base64: 'BBBB', faceCount: 1, ok: true };

describe('slots', () => {
  it('makeSlot starts in processing with no cleaned image', () => {
    const s = makeSlot(original, 'id1');
    expect(s).toEqual({
      id: 'id1', original, cleaned: null, useCleaned: false,
      status: 'processing', faceCount: 0,
    });
  });

  it('applyResult(ok) stores cleaned image and defaults to using it', () => {
    const s = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(s.status).toBe('done');
    expect(s.cleaned).toEqual({ uri: 'data:cleaned', base64: 'BBBB' });
    expect(s.useCleaned).toBe(true);
    expect(s.faceCount).toBe(1);
  });

  it('applyResult(!ok) marks failed and keeps original selected', () => {
    const s = applyResult(makeSlot(original, 'id1'), { uri: '', base64: null, faceCount: 0, ok: false });
    expect(s.status).toBe('failed');
    expect(s.cleaned).toBeNull();
    expect(s.useCleaned).toBe(false);
  });

  it('toggleSlot flips useCleaned only when a cleaned image exists', () => {
    const done = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(toggleSlot(done).useCleaned).toBe(false);
    const failed = applyResult(makeSlot(original, 'id2'), { uri: '', base64: null, faceCount: 0, ok: false });
    expect(toggleSlot(failed).useCleaned).toBe(false); // unchanged
  });

  it('resolveImage returns cleaned when selected, else original', () => {
    const done = applyResult(makeSlot(original, 'id1'), cleanedResult);
    expect(resolveImage(done)).toEqual({ uri: 'data:cleaned', base64: 'BBBB' });
    expect(resolveImage(toggleSlot(done))).toEqual(original);
  });
});
