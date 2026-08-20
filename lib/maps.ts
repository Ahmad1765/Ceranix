import type { ShippingAddress } from '@/types';

/**
 * Generate a Google Maps link for a given shipping address.
 * If exact GPS coordinates are available, keys directly off latitude/longitude.
 * Otherwise, falls back to a clean URI-encoded text query.
 */
export function generateMapsLink(
  address: Partial<ShippingAddress> | Record<string, any> | null | undefined,
): string {
  if (!address) {
    return 'https://www.google.com/maps';
  }

  // 1. Direct coordinates check
  const coords = (address as any).coordinates;
  const lat = coords?.lat ?? (address as any).latitude;
  const lng = coords?.lng ?? (address as any).longitude;

  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  // 2. Formatted text address fallback
  const line1 = address.line1 ?? '';
  const line2 = address.line2 ?? '';
  const city = address.city ?? '';
  const state = address.state ?? '';
  const postalCode = address.postal_code ?? (address as any).postalCode ?? '';
  const country = address.country ?? '';

  // If no primary street or city is present, return default maps
  if (!line1 && !city && !postalCode) {
    return 'https://www.google.com/maps';
  }

  const parts = [line1, line2, city, state, postalCode, country]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);

  const query = parts.join(', ');
  if (!query) {
    return 'https://www.google.com/maps';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
