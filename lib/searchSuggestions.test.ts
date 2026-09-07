import { describe, it, expect } from 'vitest';
import {
  getSearchSuggestions,
  splitSuggestionHighlight,
} from './searchSuggestions';

describe('searchSuggestions engine', () => {
  it('returns empty array for empty query', () => {
    expect(getSearchSuggestions('')).toEqual([]);
    expect(getSearchSuggestions('   ')).toEqual([]);
  });

  it('generates rich, ranked suggestions matching reference screenshot for "tops"', () => {
    const suggestions = getSearchSuggestions('tops', { limit: 10 });
    const texts = suggestions.map((s) => s.text);

    expect(texts).toContain('tops women');
    expect(texts).toContain('tops y2k');
    expect(texts).toContain('tops for women');
    expect(texts).toContain('tops');
    expect(texts).toContain('tops women y2k');
    expect(texts).toContain('tops hollister');
    expect(texts).toContain('tops with sleeves');
  });

  it('returns identical category suggestions for singular and plural roots', () => {
    expect(getSearchSuggestions('top').map((s) => s.text)).toEqual(getSearchSuggestions('tops').map((s) => s.text));
    expect(getSearchSuggestions('jean').map((s) => s.text)).toEqual(getSearchSuggestions('jeans').map((s) => s.text));
    expect(getSearchSuggestions('hoodie').map((s) => s.text)).toEqual(getSearchSuggestions('hoodies').map((s) => s.text));
    expect(getSearchSuggestions('dress').map((s) => s.text)).toEqual(getSearchSuggestions('dresses').map((s) => s.text));
  });

  it('includes and prioritizes matching recent searches', () => {
    const suggestions = getSearchSuggestions('hoodie', {
      recentSearches: ['hoodie zip up', 'vintage jacket'],
    });

    const texts = suggestions.map((s) => s.text);
    expect(texts[0]).toBe('hoodie zip up');
    expect(suggestions[0].isRecent).toBe(true);
  });

  it('matches brands and tags prefix', () => {
    const suggestions = getSearchSuggestions('zara');
    const texts = suggestions.map((s) => s.text);
    expect(texts).toContain('zara');
    expect(texts).toContain('zara women');
  });

  it('handles multi-word partial query autocompletion', () => {
    const suggestions = getSearchSuggestions('tops w');
    const texts = suggestions.map((s) => s.text);
    expect(texts).toContain('tops women');
    expect(texts).toContain('tops with sleeves');
  });

  it('matches words in order and prevents partial word matching earlier suggestion words', () => {
    // "tops t" should match "tops tracksuit", "tops tie dye" etc., but NOT "tops women" (even though 'tops' contains 't')
    const suggestionsTopsT = getSearchSuggestions('tops t');
    const textsTopsT = suggestionsTopsT.map((s) => s.text);
    expect(textsTopsT).not.toContain('tops women');

    // Preserves valid full completions
    const suggestionsTopsWomen = getSearchSuggestions('tops women');
    const textsTopsWomen = suggestionsTopsWomen.map((s) => s.text);
    expect(textsTopsWomen).toContain('tops women');
  });
});


describe('splitSuggestionHighlight', () => {
  it('splits exact prefix match into match and remaining suffix', () => {
    const parts = splitSuggestionHighlight('tops women', 'tops');
    expect(parts).toEqual([
      { text: 'tops', isMatch: true },
      { text: ' women', isMatch: false },
    ]);
  });

  it('splits match when query is the exact text', () => {
    const parts = splitSuggestionHighlight('tops', 'tops');
    expect(parts).toEqual([
      { text: 'tops', isMatch: true },
    ]);
  });

  it('splits match with compound words', () => {
    const parts = splitSuggestionHighlight('tops with sleeves', 'tops');
    expect(parts).toEqual([
      { text: 'tops', isMatch: true },
      { text: ' with sleeves', isMatch: false },
    ]);
  });

  it('handles terms with trailing spaces in suggestion highlights', () => {
    const parts = splitSuggestionHighlight('vintage jacket', 'vintage jacket   ');
    expect(parts).toEqual([
      { text: 'vintage jacket', isMatch: true },
    ]);
  });
});

describe('PreSearchSuggestions fallback resolution', () => {
  const resolveSuggestions = (query?: string, suggestions: any[] = []) => {
    const cleanQuery = query?.trim() ?? '';
    if (suggestions.length > 0) return suggestions;
    if (!cleanQuery) return [];
    return [
      {
        id: `fallback-${cleanQuery}`,
        text: cleanQuery,
        parts: splitSuggestionHighlight(cleanQuery, cleanQuery),
      },
    ];
  };

  it('renders fallback row when suggestions is empty for non-empty query', () => {
    const result = resolveSuggestions('vintage jacket', []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'fallback-vintage jacket',
      text: 'vintage jacket',
      parts: [{ text: 'vintage jacket', isMatch: true }],
    });
  });

  it('renders fallback row correctly for queries with trailing spaces', () => {
    const result = resolveSuggestions('vintage jacket   ', []);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('vintage jacket');
  });

  it('returns empty list (null rendering) when query is whitespace and suggestions is empty', () => {
    const result = resolveSuggestions('   ', []);
    expect(result).toEqual([]);
  });

  it('preserves suggestions when suggestions array is non-empty', () => {
    const existing = [{ id: 'sugg-1', text: 'hoodie', parts: [] }];
    const result = resolveSuggestions('hood', existing as any);
    expect(result).toBe(existing);
  });
});
