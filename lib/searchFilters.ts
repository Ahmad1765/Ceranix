// Pure search filter state definitions and counting helpers.

import type { Category, Condition } from '@/types';
import type { SortKey } from '@/lib/listings';

export interface SearchFilterState {
  category: Category | null;
  subcategory: string | null;
  brand: string | null;
  sizes: string[];
  conditions: Condition[];
  priceMin: number | null;
  priceMax: number | null;
  color: string | null;
  material: string | null;
  sort: SortKey | null;
}

export const EMPTY_SEARCH_FILTERS: SearchFilterState = {
  category: null,
  subcategory: null,
  brand: null,
  sizes: [],
  conditions: [],
  priceMin: null,
  priceMax: null,
  color: null,
  material: null,
  sort: null,
};

export function countActiveSearchFilters(f: SearchFilterState): number {
  let count = 0;
  if (f.category) count += 1;
  if (f.subcategory) count += 1;
  if (f.brand) count += 1;
  count += f.sizes.length;
  count += f.conditions.length;
  if (f.priceMin != null || f.priceMax != null) count += 1;
  if (f.color) count += 1;
  if (f.material) count += 1;
  if (f.sort && f.sort !== 'popular') count += 1;
  return count;
}
