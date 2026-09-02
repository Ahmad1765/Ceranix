import { describe, it, expect } from 'vitest';
import { computeBundlePricing, BUNDLE_TIERS, BUNDLE_MIN_ITEMS } from '@/lib/bundle';

// These tests encode the *bundle discount policy* and money-safety rules — the
// behaviour a buyer is actually charged by — not the implementation. If the
// tier table or rounding ever drifts, a buyer gets the wrong price and one of
// these fails.

describe('bundle discount policy', () => {
  it('a single item never gets a discount', () => {
    const p = computeBundlePricing(100, []);
    expect(p.itemCount).toBe(1);
    expect(p.pct).toBe(0);
    expect(p.qualifies).toBe(false);
    expect(p.savings).toBe(0);
    expect(p.total).toBe(100);
  });

  it('applies each published tier at its item-count threshold', () => {
    // base item + (count-1) add-ons priced at 0 so only the percentage matters.
    const expectations: Record<number, number> = { 2: 5, 3: 10, 4: 15, 5: 20 };
    for (const [count, pct] of Object.entries(expectations)) {
      const addOns = Array(Number(count) - 1).fill(0);
      const p = computeBundlePricing(100, addOns);
      expect(p.itemCount).toBe(Number(count));
      expect(p.pct).toBe(pct);
      expect(p.qualifies).toBe(true);
    }
  });

  it('caps at the top tier for 6+ items (no runaway discount)', () => {
    const p = computeBundlePricing(100, Array(9).fill(0)); // 10 items
    expect(p.pct).toBe(20);
    expect(p.nextTier).toBeUndefined();
  });

  it('the discount gate matches BUNDLE_MIN_ITEMS', () => {
    expect(computeBundlePricing(50, []).qualifies).toBe(false); // 1 item
    expect(computeBundlePricing(50, [50]).qualifies).toBe(BUNDLE_MIN_ITEMS <= 2);
  });

  it('respects seller custom bundle discount rate when higher than standard tier', () => {
    // 2 items: standard tier is 5%, but seller configured 15%
    const p = computeBundlePricing(100, [100], 15);
    expect(p.itemCount).toBe(2);
    expect(p.pct).toBe(15);
    expect(p.qualifies).toBe(true);
    expect(p.savings).toBe(30); // 15% of 200
    expect(p.total).toBe(170);
  });

  it('uses highest between standard tier and custom seller discount', () => {
    // 5 items: standard tier is 20%, seller configured 10% -> should be 20%
    const p = computeBundlePricing(100, [100, 100, 100, 100], 10);
    expect(p.itemCount).toBe(5);
    expect(p.pct).toBe(20);
    expect(p.savings).toBe(100);
  });
});

describe('bundle money math', () => {
  it('subtotal is the base plus every add-on', () => {
    const p = computeBundlePricing(100, [50, 25]);
    expect(p.subtotal).toBe(175);
  });

  it('charges the correct discounted total (base $100 + $50 add-on, 5%)', () => {
    const p = computeBundlePricing(100, [50]);
    expect(p.subtotal).toBe(150);
    expect(p.savings).toBe(7.5); // 5% of 150
    expect(p.total).toBe(142.5);
  });

  it('rounds savings to whole cents (no fractional-cent charge)', () => {
    // 2 items, 5%: subtotal 66.66, raw savings 3.333 -> 3.33
    const p = computeBundlePricing(33.33, [33.33]);
    expect(p.subtotal).toBeCloseTo(66.66, 2);
    expect(p.savings).toBe(3.33);
    expect(p.total).toBeCloseTo(63.33, 2);
    // savings must be a clean 2-decimal money value
    expect(Number.isInteger(Math.round(p.savings * 100))).toBe(true);
  });

  it('coerces missing/NaN add-on prices to 0 instead of poisoning the total', () => {
    const p = computeBundlePricing(100, [Number.NaN, undefined as unknown as number, 20]);
    expect(p.itemCount).toBe(4);
    expect(p.subtotal).toBe(120);
    expect(Number.isNaN(p.total)).toBe(false);
  });
});

describe('progress + next tier (the guidance UI reads these)', () => {
  it('progress is 0 at one item and 1 at the top tier', () => {
    expect(computeBundlePricing(10, []).progress).toBe(0);
    expect(computeBundlePricing(10, [0, 0, 0, 0]).progress).toBe(1); // 5 items
  });

  it('progress clamps to 1 when over-selecting', () => {
    expect(computeBundlePricing(10, Array(20).fill(0)).progress).toBe(1);
  });

  it('points at the next rung until the top tier', () => {
    expect(computeBundlePricing(10, []).nextTier?.count).toBe(2);
    expect(computeBundlePricing(10, [0, 0, 0, 0]).nextTier).toBeUndefined();
  });
});

describe('money-safety invariants (fuzz)', () => {
  it('total is never negative, never above subtotal, and savings is non-negative', () => {
    const rng = mulberry32(1337);
    for (let i = 0; i < 500; i++) {
      const base = Math.round(rng() * 1000 * 100) / 100;
      const addOns = Array.from({ length: Math.floor(rng() * 8) }, () =>
        Math.round(rng() * 500 * 100) / 100,
      );
      const p = computeBundlePricing(base, addOns);
      expect(p.total).toBeGreaterThanOrEqual(0);
      expect(p.total).toBeLessThanOrEqual(p.subtotal + 1e-9);
      expect(p.savings).toBeGreaterThanOrEqual(0);
      // The active percentage is always the highest tier the count reaches.
      const expectedPct =
        [...BUNDLE_TIERS].reverse().find((t) => p.itemCount >= t.count)?.pct ?? 0;
      expect(p.pct).toBe(expectedPct);
      // Qualifying always means a real saving on a non-zero subtotal.
      if (p.qualifies && p.subtotal > 0) expect(p.savings).toBeGreaterThan(0);
    }
  });
});

// Small deterministic PRNG so the fuzz run is reproducible.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
