// Single source of truth for the category taxonomy.
//
// Historically the categories were duplicated across types/index.ts,
// components/product/shared.ts, app/(tabs)/upload.tsx and app/(tabs)/discover.tsx
// and had drifted (Discover only listed 4 of 7; icons disagreed). Everything now
// imports from here so the taxonomy, labels and icons stay in lockstep.
//
// Model: one flat top-level category + one optional subcategory level (the
// modern eBay / Vinted pattern). Deep multi-level trees are intentionally
// avoided. Subcategories are stored on `listings.subcategory` as the slug id.
import { Feather } from '@expo/vector-icons';
import type { Category } from '@/types';

export type CategoryId = Category;

export interface Subcategory {
  id: string;
  label: string;
  /** Lowercase keywords that hint this sub from a listing title (upload suggestion). */
  kw?: string[];
}

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  subs: Subcategory[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'clothing',
    label: 'Clothing',
    icon: 'shopping-bag',
    subs: [
      { id: 'tops', label: 'Tops', kw: ['top', 'blouse', 'cami', 'tank'] },
      { id: 't_shirts', label: 'T-shirts', kw: ['tee', 't-shirt', 'tshirt', 't shirt'] },
      { id: 'shirts', label: 'Shirts', kw: ['shirt', 'button up', 'button-up', 'flannel'] },
      { id: 'hoodies', label: 'Hoodies & Sweats', kw: ['hoodie', 'sweatshirt', 'sweater hood', 'crewneck', 'pullover'] },
      { id: 'knitwear', label: 'Knitwear', kw: ['knit', 'sweater', 'jumper', 'cardigan'] },
      { id: 'dresses', label: 'Dresses', kw: ['dress', 'gown', 'frock'] },
      { id: 'skirts', label: 'Skirts', kw: ['skirt'] },
      { id: 'trousers', label: 'Trousers', kw: ['trouser', 'pants', 'chino', 'slacks'] },
      { id: 'jeans', label: 'Jeans', kw: ['jean', 'denim'] },
      { id: 'shorts', label: 'Shorts', kw: ['short'] },
      { id: 'outerwear', label: 'Outerwear', kw: ['jacket', 'coat', 'parka', 'puffer', 'trench'] },
      { id: 'activewear', label: 'Activewear', kw: ['legging', 'gym', 'sport', 'activewear', 'yoga'] },
      { id: 'suits', label: 'Suits & Blazers', kw: ['suit', 'blazer', 'tuxedo'] },
    ],
  },
  {
    id: 'shoes',
    label: 'Shoes',
    icon: 'package',
    subs: [
      { id: 'sneakers', label: 'Sneakers', kw: ['sneaker', 'trainer', 'air max', 'jordan', 'dunk', 'runner'] },
      { id: 'boots', label: 'Boots', kw: ['boot', 'chelsea'] },
      { id: 'heels', label: 'Heels', kw: ['heel', 'stiletto', 'pump'] },
      { id: 'flats', label: 'Flats', kw: ['flat', 'ballet'] },
      { id: 'sandals', label: 'Sandals', kw: ['sandal', 'slide', 'flip flop'] },
      { id: 'loafers', label: 'Loafers', kw: ['loafer', 'moccasin'] },
      { id: 'formal', label: 'Formal', kw: ['oxford', 'brogue', 'derby', 'dress shoe'] },
    ],
  },
  {
    id: 'bags',
    label: 'Bags',
    icon: 'briefcase',
    subs: [
      { id: 'handbags', label: 'Handbags', kw: ['handbag', 'hand bag'] },
      { id: 'shoulder', label: 'Shoulder', kw: ['shoulder bag'] },
      { id: 'crossbody', label: 'Crossbody', kw: ['crossbody', 'cross body'] },
      { id: 'totes', label: 'Totes', kw: ['tote'] },
      { id: 'backpacks', label: 'Backpacks', kw: ['backpack', 'rucksack'] },
      { id: 'clutches', label: 'Clutches', kw: ['clutch'] },
      { id: 'wallets', label: 'Wallets', kw: ['wallet', 'purse', 'cardholder'] },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    icon: 'watch',
    subs: [
      { id: 'jewelry', label: 'Jewelry', kw: ['ring', 'necklace', 'bracelet', 'earring', 'jewel'] },
      { id: 'watches', label: 'Watches', kw: ['watch'] },
      { id: 'belts', label: 'Belts', kw: ['belt'] },
      { id: 'hats', label: 'Hats', kw: ['hat', 'cap', 'beanie'] },
      { id: 'scarves', label: 'Scarves', kw: ['scarf', 'scarves'] },
      { id: 'sunglasses', label: 'Sunglasses', kw: ['sunglass', 'shades', 'eyewear'] },
      { id: 'gloves', label: 'Gloves', kw: ['glove'] },
      { id: 'hair', label: 'Hair', kw: ['hair clip', 'scrunchie', 'headband'] },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    icon: 'smartphone',
    subs: [
      { id: 'phones', label: 'Phones', kw: ['phone', 'iphone', 'samsung', 'pixel'] },
      { id: 'laptops', label: 'Laptops', kw: ['laptop', 'macbook', 'notebook'] },
      { id: 'tablets', label: 'Tablets', kw: ['tablet', 'ipad'] },
      { id: 'audio', label: 'Audio', kw: ['headphone', 'earbud', 'airpod', 'speaker', 'audio'] },
      { id: 'cameras', label: 'Cameras', kw: ['camera', 'lens', 'gopro'] },
      { id: 'gaming', label: 'Gaming', kw: ['console', 'playstation', 'xbox', 'nintendo', 'switch', 'gaming'] },
      { id: 'wearables', label: 'Wearables', kw: ['smartwatch', 'apple watch', 'fitbit', 'wearable'] },
      { id: 'accessories', label: 'Accessories', kw: ['charger', 'cable', 'case'] },
    ],
  },
  {
    id: 'beauty',
    label: 'Beauty',
    icon: 'droplet',
    subs: [
      { id: 'makeup', label: 'Makeup', kw: ['makeup', 'lipstick', 'foundation', 'mascara', 'palette'] },
      { id: 'skincare', label: 'Skincare', kw: ['skincare', 'serum', 'moisturizer', 'cleanser', 'cream'] },
      { id: 'fragrance', label: 'Fragrance', kw: ['perfume', 'fragrance', 'cologne', 'eau de'] },
      { id: 'haircare', label: 'Haircare', kw: ['shampoo', 'conditioner', 'haircare', 'hair oil'] },
      { id: 'tools', label: 'Tools & Brushes', kw: ['brush', 'straightener', 'curler', 'dryer'] },
      { id: 'nails', label: 'Nails', kw: ['nail', 'polish', 'manicure'] },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'box',
    subs: [],
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string | null | undefined): CategoryDef | undefined {
  if (!id) return undefined;
  return CATEGORY_BY_ID.get(id as CategoryId);
}

export function getSubcategory(
  catId: string | null | undefined,
  subId: string | null | undefined,
): Subcategory | undefined {
  if (!subId) return undefined;
  return getCategory(catId)?.subs.find((s) => s.id === subId);
}

export function categoryLabel(id: string | null | undefined): string {
  return getCategory(id)?.label ?? (id ?? '');
}

export function subcategoryLabel(
  catId: string | null | undefined,
  subId: string | null | undefined,
): string {
  return getSubcategory(catId, subId)?.label ?? (subId ?? '');
}

/** True when a category defines subcategories (so upload should require one). */
export function hasSubcategories(id: string | null | undefined): boolean {
  return (getCategory(id)?.subs.length ?? 0) > 0;
}

// Legacy flat-label map, kept for any consumer that still wants { id: label }.
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

/**
 * Keyword-based subcategory suggestion for the upload flow. No ML: scans the
 * title for the first subcategory whose keywords match. Returns the owning
 * category + sub so upload can offer a one-tap "Clothing ▸ Hoodies?" chip.
 */
export function suggestSubcategory(
  title: string,
): { category: CategoryId; sub: Subcategory } | null {
  const t = ` ${title.toLowerCase()} `;
  if (t.trim().length < 2) return null;
  for (const cat of CATEGORIES) {
    for (const sub of cat.subs) {
      if (!sub.kw) continue;
      for (const k of sub.kw) {
        if (t.includes(k)) return { category: cat.id, sub };
      }
    }
  }
  return null;
}
