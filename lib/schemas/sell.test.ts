import { describe, it, expect } from 'vitest';
import { SellFormSchema } from './sell';

describe('SellFormSchema', () => {
  const validPayload = {
    slots: [{ id: '1', uri: 'file://photo1.jpg' }],
    title: 'Vintage Leather Jacket',
    description: 'Great condition vintage leather jacket',
    price: '150.00',
    category: 'clothing',
    subcategory: 'jackets',
    brand: 'AllSaints',
    size: 'M',
    condition: 'good',
    color: 'black',
    gender: 'men',
    tags: ['vintage', 'leather', 'jacket'],
    parcelSize: 'medium',
  };

  it('validates a complete valid listing payload', () => {
    const result = SellFormSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('fails if no photo slots are provided', () => {
    const result = SellFormSchema.safeParse({ ...validPayload, slots: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('at least one photo');
    }
  });

  it('fails if slots contain [null] or entries with empty uri', () => {
    const nullSlot = SellFormSchema.safeParse({ ...validPayload, slots: [null] });
    expect(nullSlot.success).toBe(false);

    const emptyUri = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: '' }],
    });
    expect(emptyUri.success).toBe(false);

    const whitespaceUri = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: '   ' }],
    });
    expect(whitespaceUri.success).toBe(false);

    const emptyOriginalUri = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ original: { uri: '' } }],
    });
    expect(emptyOriginalUri.success).toBe(false);
  });

  it('accepts photo slots with nested original.uri structure', () => {
    const nestedSlot = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ id: '1', original: { uri: 'file://photo1.jpg' } }],
    });
    expect(nestedSlot.success).toBe(true);
  });

  it('accepts a valid direct uri with an empty or incomplete original object', () => {
    const directWithEmptyOriginal = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: 'file://photo1.jpg', original: {} }],
    });
    expect(directWithEmptyOriginal.success).toBe(true);

    const directWithEmptyOriginalUri = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: 'file://photo1.jpg', original: { uri: '' } }],
    });
    expect(directWithEmptyOriginalUri.success).toBe(true);
  });

  it('accepts a valid original.uri with an empty or whitespace direct uri', () => {
    const originalWithEmptyDirect = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: '', original: { uri: 'file://photo1.jpg' } }],
    });
    expect(originalWithEmptyDirect.success).toBe(true);

    const originalWithWhitespaceDirect = SellFormSchema.safeParse({
      ...validPayload,
      slots: [{ uri: '   ', original: { uri: 'file://photo1.jpg' } }],
    });
    expect(originalWithWhitespaceDirect.success).toBe(true);
  });

  it('fails on empty title', () => {
    const result = SellFormSchema.safeParse({ ...validPayload, title: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Title is required');
    }
  });

  it('fails on invalid price formats (negative, zero, NaN, too many decimals)', () => {
    const negative = SellFormSchema.safeParse({ ...validPayload, price: '-10' });
    expect(negative.success).toBe(false);

    const zero = SellFormSchema.safeParse({ ...validPayload, price: '0' });
    expect(zero.success).toBe(false);

    const notNumber = SellFormSchema.safeParse({ ...validPayload, price: 'abc' });
    expect(notNumber.success).toBe(false);

    const decimals = SellFormSchema.safeParse({ ...validPayload, price: '12.999' });
    expect(decimals.success).toBe(false);
  });

  it('requires subcategory when category has subcategories', () => {
    const noSub = SellFormSchema.safeParse({
      ...validPayload,
      category: 'clothing',
      subcategory: null,
    });
    expect(noSub.success).toBe(false);
    if (!noSub.success) {
      expect(noSub.error.issues[0].path).toContain('subcategory');
    }
  });

  it('allows null subcategory when category has no subcategories (e.g. other)', () => {
    const otherCat = SellFormSchema.safeParse({
      ...validPayload,
      category: 'other',
      subcategory: null,
    });
    expect(otherCat.success).toBe(true);
  });

  it('limits tags to a maximum of 10', () => {
    const tooManyTags = SellFormSchema.safeParse({
      ...validPayload,
      tags: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
    });
    expect(tooManyTags.success).toBe(false);
  });
});
