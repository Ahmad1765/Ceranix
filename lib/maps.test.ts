import { describe, it, expect } from 'vitest';
import { generateMapsLink } from './maps';

describe('generateMapsLink', () => {
  it('returns generic google maps URL when address is empty or null', () => {
    expect(generateMapsLink(null)).toBe('https://www.google.com/maps');
    expect(generateMapsLink({})).toBe('https://www.google.com/maps');
  });

  it('uses exact lat/lng coordinates when available', () => {
    const address = {
      line1: '123 Main St',
      city: 'Lahore',
      coordinates: { lat: 31.5204, lng: 74.3587 },
    };
    expect(generateMapsLink(address as any)).toBe(
      'https://www.google.com/maps/search/?api=1&query=31.5204,74.3587',
    );
  });

  it('falls back to URI-encoded formatted address text when coordinates are absent', () => {
    const address = {
      line1: 'E-381 Block C Nishat Colony',
      city: 'Lahore',
      state: 'Punjab',
      postal_code: '54000',
      country: 'Pakistan',
    };
    const link = generateMapsLink(address as any);
    expect(link).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(link).toContain(encodeURIComponent('E-381 Block C Nishat Colony, Lahore, Punjab, 54000, Pakistan'));
  });

  it('falls back to address when coordinates are out of valid range', () => {
    const address = {
      line1: '123 Main St',
      city: 'Lahore',
      coordinates: { lat: 120, lng: 74.3587 },
    };
    const link = generateMapsLink(address as any);
    expect(link).toContain(encodeURIComponent('123 Main St, Lahore'));
  });

  it('does not add Pakistan fallback when country is omitted', () => {
    const address = {
      line1: '123 Main St',
      city: 'London',
    };
    const link = generateMapsLink(address as any);
    expect(link).toContain(encodeURIComponent('123 Main St, London'));
    expect(link).not.toContain('Pakistan');
  });
});
