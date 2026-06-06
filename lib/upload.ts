import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';

export type LocalImage = { uri: string; base64?: string | null };

// Resize ceiling for avatars. Anything larger gets re-encoded down to this
// edge on web (canvas-backed) before upload. We never blow up an originally
// smaller image, and the scaling preserves aspect ratio so the existing
// circular-crop UI still looks right.
const AVATAR_MAX_EDGE = 512;
const AVATAR_QUALITY = 0.85;

// Browser-only downscale. Returns a fresh base64 string + uri-equivalent.
// If anything goes wrong (CORS, canvas tainted, etc.) we return the input
// unchanged so the upload still succeeds — large but safe.
async function downscaleAvatarOnWeb(image: LocalImage): Promise<LocalImage> {
  if (Platform.OS !== 'web') return image;
  if (typeof window === 'undefined' || typeof document === 'undefined') return image;
  try {
    const ct = image.uri ? inferContentType(image.uri) : 'image/jpeg';
    const src = image.base64
      ? `data:${ct};base64,${image.base64}`
      : image.uri;
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
    const longest = Math.max(bitmap.naturalWidth, bitmap.naturalHeight);
    if (longest <= AVATAR_MAX_EDGE) return image;
    const scale = AVATAR_MAX_EDGE / longest;
    const w = Math.round(bitmap.naturalWidth * scale);
    const h = Math.round(bitmap.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
    const comma = dataUrl.indexOf(',');
    return {
      uri: dataUrl,
      base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
    };
  } catch {
    return image;
  }
}

async function readBase64FromUri(uri: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function imageToArrayBuffer(image: LocalImage): Promise<ArrayBuffer> {
  const b64 = image.base64 ?? (await readBase64FromUri(image.uri));
  return decode(b64);
}

function inferContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function inferExt(uri: string): string {
  const ct = inferContentType(uri);
  if (ct === 'image/png') return 'png';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/heic') return 'heic';
  return 'jpg';
}

async function uploadOne(
  bucket: string,
  image: LocalImage,
  pathPrefix: string,
  index: number,
): Promise<string> {
  const ab = await imageToArrayBuffer(image);
  const ext = inferExt(image.uri);
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
  const safePrefix = pathPrefix.replace(/\.\./g, '').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  const path = `${safePrefix ? safePrefix + '/' : ''}${uniqueId}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, ab, {
      contentType: inferContentType(image.uri),
      upsert: false,
    });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadListingImages(
  images: LocalImage[],
  sellerId: string,
): Promise<string[]> {
  const folder = `${sellerId}/${Date.now()}`;
  const out: string[] = [];
  for (let i = 0; i < images.length; i++) {
    out.push(await uploadOne('listing-images', images[i], folder, i));
  }
  return out;
}

export async function uploadAvatar(image: LocalImage, userId: string): Promise<string> {
  const downscaled = await downscaleAvatarOnWeb(image);
  return uploadOne('avatars', downscaled, userId, 0);
}

export async function deleteListingImages(urls: string[]): Promise<void> {
  const paths = urls.map((url) => {
    const parts = url.split('/listing-images/');
    return parts.length > 1 ? parts[1] : null;
  }).filter(Boolean) as string[];
  
  if (paths.length > 0) {
    await supabase.storage.from('listing-images').remove(paths);
  }
}
