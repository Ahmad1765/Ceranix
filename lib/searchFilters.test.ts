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
});
