import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

export type LocalImage = { uri: string; base64?: string | null };

async function readBase64FromUri(uri: string): Promise<string> {
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
  const path = `${pathPrefix}/${Date.now()}-${index}.${ext}`;
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
  return uploadOne('avatars', image, userId, 0);
}
