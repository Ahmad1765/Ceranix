import { describe, it, expect } from 'vitest';
import { TAXONOMY_BRANDS, NO_BRAND, UNBRANDED_LOCAL_TAILOR } from '@/lib/taxonomy';
import { CATEGORIES } from '@/lib/categories';
import { SellFormSchema } from '@/lib/schemas/sell';

describe('Category & Brand Selection in Sell flow', () => {
  describe('Brand Search & Vinted Brand Directory', () => {
    it('contains all reference brands from Vinted Reference Image 1 & 2', () => {
      const names = TAXONOMY_BRANDS.map((b) => b.name);
      
      // Reference Image 1 brands:
      expect(names).toContain('The North Face');
      expect(names).toContain('French Connection');
      expect(names).toContain('FatFace');
      expect(names).toContain('Liverpool Football Club');
      expect(names).toContain('Card Factory');
      expect(names).toContain('FCUK');
      expect(names).toContain("Angel's Face");
      expect(names).toContain('FC Barcelona');
      expect(names).toContain('Max Factor');
      expect(names).toContain('Face');

      // Reference Image 2 brands:
      expect(names).toContain('Prada');
      expect(names).toContain('Michael Kors');
      expect(names).toContain('Marco Tozzi');
      expect(names).toContain('Anna Field');
      expect(names).toContain('Pull & Bear');
      expect(names).toContain('Gémo');
      expect(names).toContain('Rylko');
      expect(names).toContain('Ralph Lauren');
      expect(names).toContain('Sebago');
      expect(names).toContain('TU');
    });

    it('matches FCC to all 10 Vinted search reference brands', () => {
      const q = 'fcc'.trim().toLowerCase();
      const collapsedQ = q.replace(/(.)\1+/g, '$1'); // 'fc'

      const matches = TAXONOMY_BRANDS.filter((b) => {
        const name = b.name.toLowerCase();
        if (name.includes(q)) return true;
        const words = name.split(/[\s\-_&/'.]+/).filter(Boolean);
        const initials = words.map((w) => w[0]).join('');
        if (initials === q || initials.startsWith(q) || initials.includes(q)) return true;
        if (words.some((w) => w.startsWith(q) || w.startsWith(collapsedQ))) return true;
        if (name.includes(collapsedQ) || initials.includes(collapsedQ)) return true;

        // Subsequence
        let cIdx = 0;
        for (let i = 0; i < name.length && cIdx < collapsedQ.length; i++) {
          if (name[i] === collapsedQ[cIdx]) cIdx++;
        }
        return cIdx === collapsedQ.length;
      });

      const matchedNames = matches.map((m) => m.name);
      expect(matchedNames).toContain('The North Face');
      expect(matchedNames).toContain('French Connection');
      expect(matchedNames).toContain('FatFace');
      expect(matchedNames).toContain('Liverpool Football Club');
      expect(matchedNames).toContain('Card Factory');
      expect(matchedNames).toContain('FCUK');
      expect(matchedNames).toContain("Angel's Face");
      expect(matchedNames).toContain('FC Barcelona');
      expect(matchedNames).toContain('Max Factor');
      expect(matchedNames).toContain('Face');
    });
  });

  describe('Subcategory Search Filtering', () => {
    it('correctly filters Clothing subcategories by keyword or label', () => {
      const clothingDef = CATEGORIES.find((c) => c.id === 'clothing')!;
      expect(clothingDef).toBeDefined();

      const searchSubcategories = (query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return clothingDef.subs;
        return clothingDef.subs.filter((s) => {
          const matchLabel = s.label.toLowerCase().includes(q);
          const matchKw = s.kw?.some((k) => k.toLowerCase().includes(q));
          return matchLabel || matchKw;
        });
      };

      // Searching "dress" returns dresses
      const dressResults = searchSubcategories('dress');
      expect(dressResults.some((s) => s.id === 'dresses')).toBe(true);

      // Searching "lawn" returns Lawn / Unstitched Suits
      const lawnResults = searchSubcategories('lawn');
      expect(lawnResults.some((s) => s.id === 'lawn_unstitched')).toBe(true);

      // Searching "abaya" returns Abayas & Modest Wear
      const abayaResults = searchSubcategories('abaya');
      expect(abayaResults.some((s) => s.id === 'abayas_modest')).toBe(true);

      // Searching non-matching text returns empty
      const emptyResults = searchSubcategories('xyznonexistent');
      expect(emptyResults.length).toBe(0);
    });
  });

  describe('No Brand Selection & Authenticity Policy', () => {
    it('allows "No brand" selection without requiring authenticity validation', () => {
      const payload = {
        slots: [{ id: '1', uri: 'file://test.jpg' }],
        title: 'Casual Summer Dress',
        description: 'Plain cotton summer dress without brand',
        price: '25.00',
        category: 'clothing' as const,
        subcategory: 'dresses',
        brand: NO_BRAND, // 'No brand'
        size: 'M',
        condition: 'good' as const,
        color: 'white',
        gender: 'women' as const,
        tags: ['dress', 'summer'],
        parcelSize: 'medium' as const,
        authenticity: null,
      };

      const result = SellFormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('still accepts legacy UNBRANDED_LOCAL_TAILOR for backward compatibility', () => {
      const payload = {
        slots: [{ id: '1', uri: 'file://test.jpg' }],
        title: 'Custom Stitched Kurta',
        description: 'Tailor stitched kurta',
        price: '30.00',
        category: 'clothing' as const,
        subcategory: 'kurta_shalwar_kameez',
        brand: UNBRANDED_LOCAL_TAILOR,
        size: 'L',
        condition: 'new_with_tags' as const,
        color: 'blue',
        gender: 'men' as const,
        tags: ['kurta', 'tailored'],
        parcelSize: 'small' as const,
        authenticity: null,
      };

      const result = SellFormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('still requires authenticity for real branded items (e.g. Nike, Gucci)', () => {
      const payload = {
        slots: [{ id: '1', uri: 'file://test.jpg' }],
        title: 'Nike Air Max',
        description: 'Authentic Nike sneakers',
        price: '120.00',
        category: 'shoes' as const,
        subcategory: 'sneakers',
        brand: 'Nike',
        size: 'US 10',
        condition: 'like_new' as const,
        color: 'black',
        gender: 'men' as const,
        tags: ['nike', 'sneakers'],
        parcelSize: 'medium' as const,
        authenticity: null,
      };

      const result = SellFormSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('authenticity');
      }
    });
  });
});
