import { describe, it, expect } from 'vitest';
import {
  shouldTrack,
  buildListingViewedProps,
  buildSearchProps,
} from '@/lib/analyticsEvents';

describe('shouldTrack', () => {
  it('tracks only when a key exists and the user has not opted out', () => {
    expect(shouldTrack({ hasKey: true, optedOut: false })).toBe(true);
    expect(shouldTrack({ hasKey: false, optedOut: false })).toBe(false);
    expect(shouldTrack({ hasKey: true, optedOut: true })).toBe(false);
    expect(shouldTrack({ hasKey: false, optedOut: true })).toBe(false);
  });
});

describe('buildListingViewedProps', () => {
  it('extracts the funnel-relevant fields plus the source', () => {
    const props = buildListingViewedProps(
      { id: 'l1', seller_id: 's1', price: 42, category: 'shoes' },
      'feed',
    );
    expect(props).toEqual({
      listing_id: 'l1',
      seller_id: 's1',
      price: 42,
      category: 'shoes',
      source: 'feed',
    });
  });
});

describe('buildSearchProps — privacy', () => {
  it('captures the query LENGTH, never the raw query string', () => {
    const raw = 'secret brand name';
    const props = buildSearchProps(raw, 'bags', 7);
    expect(props.query_length).toBe(raw.length);
    expect(props.category).toBe('bags');
    expect(props.results_count).toBe(7);
    // The raw text must never appear anywhere in the captured props.
    expect(JSON.stringify(props)).not.toContain('secret');
  });

  it('normalizes a null category', () => {
    const props = buildSearchProps('x', null, 0);
    expect(props.category).toBeNull();
  });
});
