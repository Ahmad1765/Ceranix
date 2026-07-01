import { decode } from 'base64-arraybuffer';
import { Platform, Image as RNImage } from 'react-native';
// SDK 54 moved readAsStringAsync/EncodingType to the legacy entry point; the
// new expo-file-system API no longer exports them from the package root.
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

export type LocalImage = { uri: string; base64?: string | null };

// Resize ceiling for avatars — small, since they only ever render in a circle.
const AVATAR_MAX_EDGE = 512;
const AVATAR_QUALITY = 0.85;

// Resize/compress ceiling for listing photos. Phone cameras hand us 3-12 MB
// 3000px+ JPEGs; storing those raw is why the grid was slow to paint. 1440px
// on the long edge at q0.7 is plenty for cards + the fullscreen viewer and
// typically cuts a photo to ~200-400 KB. This runs at upload time so it helps
// regardless of whether the Supabase image-transform CDN is enabled.
const LISTING_MAX_EDGE = 1440;
const LISTING_QUALITY = 0.7;

// Read the intrinsic pixel size of an image so we only ever scale down.
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Native (iOS/Android) resize + re-encode via expo-image-manipulator. Always
// re-encodes to JPEG at `quality`; only resizes when the image exceeds maxEdge
// so we never upscale. Falls back to the original on any failure so an upload
// is never blocked by compression.
async function compressNative(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  try {
    let context = ImageManipulator.manipulate(image.uri);
    const size = await getImageSize(image.uri).catch(() => null);
    if (size) {
      const longest = Math.max(size.width, size.height);
      if (longest > maxEdge) {
        const scale = maxEdge / longest;
        context =
          size.width >= size.height
            ? context.resize({ width: Math.round(size.width * scale) })
            : context.resize({ height: Math.round(size.height * scale) });
      }
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return { uri: result.uri, base64: result.base64 ?? null };
  } catch (e) {
    console.warn('[upload] native image compression failed; using original', e);
    return image;
  }
}

// Browser-only resize + re-encode via a canvas. Returns a fresh base64 + data
// URI; re-encodes to JPEG even when no resize is needed so large-but-small-
// dimension photos still shrink. Falls back to the input on any failure (CORS,
// tainted canvas, etc.) so the upload still succeeds.
async function compressOnWeb(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  if (Platform.OS !== 'web') return image;
  if (typeof window === 'undefined' || typeof document === 'undefined') return image;
  try {
    const ct = image.uri ? inferContentType(image.uri) : 'image/jpeg';
    const src = image.base64 ? `data:${ct};base64,${image.base64}` : image.uri;
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
    const longest = Math.max(bitmap.naturalWidth, bitmap.naturalHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.round(bitmap.naturalWidth * scale);
    const h = Math.round(bitmap.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const comma = dataUrl.indexOf(',');
    return { uri: dataUrl, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
  } catch {
    return image;
  }
}

// One entry point per platform for compressing a picked image.
function compressImage(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  return Platform.OS === 'web'
    ? compressOnWeb(image, maxEdge, quality)
    : compressNative(image, maxEdge, quality);
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
    const compressed = await compressImage(images[i], LISTING_MAX_EDGE, LISTING_QUALITY);
    out.push(await uploadOne('listing-images', compressed, folder, i));
  }
  return out;
}

export async function uploadAvatar(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, AVATAR_MAX_EDGE, AVATAR_QUALITY);
  return uploadOne('avatars', compressed, userId, 0);
}

export async function deleteListingImages(urls: string[]): Promise<void> {
  const paths = urls.map((url) => {
    const parts = url.split('/listing-images/');
    return parts.length > 1 ? parts[1] : null;
  }).filter(Boolean) as string[];

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from('listing-images').remove(paths);
  if (error) {
    // Log but don't throw — this runs on the publish failure path as a
    // best-effort cleanup. Letting it throw would mask the original DB error
    // shown to the user with a less actionable storage error.
    console.warn('[upload] deleteListingImages failed:', error.message, 'paths:', paths);
  }
}

export async function uploadWardrobeImage(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, LISTING_MAX_EDGE, LISTING_QUALITY);
  return uploadOne('wardrobe-images', compressed, userId, 0);
}
