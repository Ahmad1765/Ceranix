import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface GeocodedAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export const POPULAR_CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Peshawar',
  'Multan',
  'Quetta',
  'Sialkot',
  'Gujranwala',
] as const;

/**
 * Reverse geocode latitude and longitude into structured address fields.
 * Uses OpenStreetMap Nominatim with clean fallback to expo-location.
 */
export async function reverseGeocodeCoords(
  latitude: number,
  longitude: number,
): Promise<GeocodedAddress | null> {
  try {
    // 1. Try Nominatim reverse geocode (accurate road, block, city, postal code)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'CeranixApp/1.0',
        },
      },
    );

    if (res.ok) {
      const data = await res.json();
      const addr = data?.address ?? {};

      const road = addr.road || addr.street || addr.neighbourhood || addr.suburb || addr.residential || '';
      const houseNumber = addr.house_number || '';
      const block = addr.neighbourhood || addr.suburb || addr.city_district || '';

      const line1Parts = [houseNumber, road, block].filter(Boolean);
      const line1 = line1Parts.length > 0 ? line1Parts.join(', ') : data?.display_name?.split(',')[0] || '';

      const city =
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.village ||
        addr.county ||
        '';

      const state = addr.state || addr.province || addr.region || '';
      const postal_code = addr.postcode || '';
      const country = addr.country || 'Pakistan';

      return {
        line1: line1.slice(0, 120),
        city: city.slice(0, 60),
        state: state.slice(0, 60),
        postal_code: postal_code.slice(0, 20),
        country: country.slice(0, 60),
      };
    }
  } catch {
    // fallback below
  }

  // 2. Fallback to expo-location geocoder
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const item = results[0];
      const streetParts = [item.streetNumber, item.street, item.district].filter(Boolean);
      return {
        line1: streetParts.join(' ').trim() || item.name || '',
        city: item.city || item.subregion || '',
        state: item.region || '',
        postal_code: item.postalCode || '',
        country: item.country || 'Pakistan',
      };
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Request device location and return reverse geocoded address.
 */
export async function getCurrentLocationAddress(): Promise<GeocodedAddress> {
  // Web navigator.geolocation fallback
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => reject(new Error(err.message || 'Location permission denied')),
        { timeout: 10000, enableHighAccuracy: true },
      );
    });

    const geocoded = await reverseGeocodeCoords(coords.latitude, coords.longitude);
    if (geocoded) return geocoded;
  }

  // Native expo-location
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied. Please allow location access to auto-fill your address.');
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const geocoded = await reverseGeocodeCoords(pos.coords.latitude, pos.coords.longitude);
  if (!geocoded) {
    throw new Error('Could not resolve street address from current location.');
  }

  return geocoded;
}
