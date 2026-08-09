import type { LocalImage } from '@/lib/upload';
import type { CleanResult } from './types';

export type CleanStatus = 'processing' | 'done' | 'failed';

export type PhotoSlot = {
  id: string;
  original: LocalImage;
  cleaned: LocalImage | null;
  useCleaned: boolean;
  status: CleanStatus;
  faceCount: number;
};

export function makeSlot(original: LocalImage, id: string): PhotoSlot {
  return { id, original, cleaned: null, useCleaned: false, status: 'processing', faceCount: 0 };
}

export function applyResult(slot: PhotoSlot, result: CleanResult): PhotoSlot {
  if (!result.ok) {
    return { ...slot, status: 'failed', cleaned: null, useCleaned: false };
  }
  return {
    ...slot,
    status: 'done',
    cleaned: { uri: result.uri, base64: result.base64 },
    useCleaned: true,
    faceCount: result.faceCount,
  };
}

export function toggleSlot(slot: PhotoSlot): PhotoSlot {
  if (slot.status !== 'done' || !slot.cleaned) return slot;
  return { ...slot, useCleaned: !slot.useCleaned };
}

export function resolveImage(slot: PhotoSlot): LocalImage {
  return slot.useCleaned && slot.cleaned ? slot.cleaned : slot.original;
}
