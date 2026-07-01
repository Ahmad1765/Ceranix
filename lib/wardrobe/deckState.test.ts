import { describe, it, expect } from 'vitest';
import { filterUnseen, dedupeById, needsMore } from '@/lib/wardrobe/deckState';

describe('filterUnseen', () => {
  it('removes posts whose id is in the seen set', () => {
    const posts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(filterUnseen(posts, new Set(['b']))).toEqual([{ id: 'a' }, { id: 'c' }]);
  });
  it('returns all posts when nothing is seen', () => {
    const posts = [{ id: 'a' }];
    expect(filterUnseen(posts, new Set())).toEqual([{ id: 'a' }]);
  });
});

describe('dedupeById', () => {
  it('keeps the first occurrence of each id, preserving order', () => {
    const posts = [{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }];
    expect(dedupeById(posts)).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});

describe('needsMore', () => {
  it('is true at or below the threshold, false above', () => {
    expect(needsMore(3)).toBe(true);
    expect(needsMore(4)).toBe(false);
    expect(needsMore(0)).toBe(true);
    expect(needsMore(2, 1)).toBe(false);
  });
});
