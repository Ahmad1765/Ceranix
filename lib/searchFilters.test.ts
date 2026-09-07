import { describe, it, expect } from 'vitest';
import {
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
  type SearchFilterState,
} from './searchFilters';

describe('SearchFilterChips & State logic', () => {
  it('counts zero active filters on empty state', () => {
    expect(countActiveSearchFilters(EMPTY_SEARCH_FILTERS)).toBe(0);
  });

  it('accurately counts single category filter', () => {
    const filters: SearchFilterState = {
      ...EMPTY_SEARCH_FILTERS,
      category: 'clothing',
    };
    expect(countActiveSearchFilters(filters)).toBe(1);
  });

  it('accurately counts multiple combined filters', () => {
    const filters: SearchFilterState = {
      ...EMPTY_SEARCH_FILTERS,
      category: 'clothing',
      subcategory: 'tops',
      brand: 'Nike',
      sizes: ['M', 'L'],
      conditions: ['new_with_tags'],
      priceMin: 10,
      priceMax: 50,
      color: 'Black',
      material: 'Cotton',
      sort: 'price_asc',
    };
    // category(1) + subcategory(1) + brand(1) + sizes(2) + conditions(1) + price(1) + color(1) + material(1) + sort(1) = 10
    expect(countActiveSearchFilters(filters)).toBe(10);
  });

  it('does not count default popular sort as extra active filter', () => {
    const filters: SearchFilterState = {
      ...EMPTY_SEARCH_FILTERS,
      sort: 'popular',
    };
    expect(countActiveSearchFilters(filters)).toBe(0);
  });

  it('counts non-default sort as active filter', () => {
    const filters: SearchFilterState = {
      ...EMPTY_SEARCH_FILTERS,
      sort: 'price_desc',
    };
    expect(countActiveSearchFilters(filters)).toBe(1);
  });

  it('normalizes and swaps custom price bounds correctly', () => {
    const normalizeCustomPrice = (customMin: string, customMax: string) => {
      const minVal = customMin.trim() ? parseFloat(customMin) : null;
      const maxVal = customMax.trim() ? parseFloat(customMax) : null;
      let priceMin = minVal !== null && !isNaN(minVal) ? Math.max(0, minVal) : null;
      let priceMax = maxVal !== null && !isNaN(maxVal) ? Math.max(0, maxVal) : null;
      if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
        const temp = priceMin;
        priceMin = priceMax;
        priceMax = temp;
      }
      return { priceMin, priceMax };
    };

    // Swapping when min > max
    expect(normalizeCustomPrice('100', '20')).toEqual({ priceMin: 20, priceMax: 100 });
    // Normal ordering
    expect(normalizeCustomPrice('20', '100')).toEqual({ priceMin: 20, priceMax: 100 });
    // Null handling for empty or invalid
    expect(normalizeCustomPrice('', '50')).toEqual({ priceMin: null, priceMax: 50 });
    expect(normalizeCustomPrice('30', '')).toEqual({ priceMin: 30, priceMax: null });
    expect(normalizeCustomPrice('abc', 'xyz')).toEqual({ priceMin: null, priceMax: null });
    // Negative numbers clamped to 0
    expect(normalizeCustomPrice('-15', '50')).toEqual({ priceMin: 0, priceMax: 50 });
  });
});
