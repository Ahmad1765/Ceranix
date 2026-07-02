// lib/photoClean/serverMatte.web.ts
// Server-side background matting: full BiRefNet on a serverless GPU behind the
// `remove-background` Supabase Edge Function. Best quality on every device with
// no client-side model download. Best-effort: any failure (including the
// function returning 503 while REPLICATE_API_TOKEN is unset) disables the
// server route for this session and the caller falls back to on-device matting.
import { supabase } from '@/lib/supabase';

let disabled = false;

// Takes the base64 of a JPEG (no data: prefix), returns a data URL of the
// BiRefNet mask image (white = foreground), or null to fall back.
export async function getServerMaskDataUrl(jpegBase64: string): Promise<string | null> {
  if (disabled) return null;
  try {
    const { data, error } = await supabase.functions.invoke('remove-background', {
      body: { image: jpegBase64 },
    });
    if (error || !data?.image) {
      disabled = true; // don't retry a broken/unconfigured endpoint every toggle
      console.warn('[photoClean] server matte unavailable; using on-device', error ?? data);
      return null;
    }
    return `data:${data.contentType ?? 'image/png'};base64,${data.image}`;
  } catch (e) {
    disabled = true;
    console.warn('[photoClean] server matte failed; using on-device', e);
    return null;
  }
}
