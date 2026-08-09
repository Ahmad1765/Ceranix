import { describe, it, expect } from 'vitest';
import { escapeSearchQuery } from '@/lib/search';

// This logic guards a PostgREST .or() filter against user-controlled input.
// The tests assert the *security properties* (a sanitized string can't carry
// the characters that would let a user restructure the filter or smuggle SQL
// LIKE wildcards), plus that ordinary queries survive intact.

describe('escapeSearchQuery — ordinary input', () => {
  it('leaves plain alphanumeric queries untouched', () => {
    expect(escapeSearchQuery('nike air max')).toBe('nike air max');
  });

  it('trims surrounding whitespace', () => {
    expect(escapeSearchQuery('  vintage tee  ')).toBe('vintage tee');
  });

  it('keeps benign punctuation that is not a filter/LIKE metachar', () => {
    expect(escapeSearchQuery("levi's 501")).toBe("levi's 501");
  });
});

describe('escapeSearchQuery — or() delimiter neutralization', () => {
  it('replaces commas and parentheses with spaces', () => {
    expect(escapeSearchQuery('a,b(c)d')).toBe('a b c d');
  });

  it('defuses an attempt to inject an extra OR condition', () => {
    // Without sanitizing, the comma would start a new or() term.
    const malicious = 'x,price.gte.0';
    const safe = escapeSearchQuery(malicious);
    expect(safe).not.toContain(',');
    expect(safe).toBe('x price.gte.0');
  });

  it('defuses an attempt to close the or() group early', () => {
    const safe = escapeSearchQuery('shoe),title.ilike.*');
    expect(safe).not.toContain('(');
    expect(safe).not.toContain(')');
    expect(safe).not.toContain(',');
  });
});

describe('escapeSearchQuery — LIKE wildcard escaping', () => {
  it('escapes % and _ so they match literally', () => {
    expect(escapeSearchQuery('50%_off')).toBe('50\\%\\_off');
  });

  it('does not let a bare wildcard broaden the match', () => {
    // A lone "%" would otherwise match every row.
    expect(escapeSearchQuery('%')).toBe('\\%');
  });

  it('escapes the escape character itself', () => {
    // Flagged by CodeQL as js/incomplete-sanitization. A user-typed backslash
    // was passed through untouched, so it consumed the backslash added for the
    // following wildcard: "\%" reached Postgres as an escaped backslash plus a
    // still-active % that matches everything.
    expect(escapeSearchQuery('\\')).toBe('\\\\');
    expect(escapeSearchQuery('\\%')).toBe('\\\\\\%');
    expect(escapeSearchQuery('a\\_b')).toBe('a\\\\\\_b');
  });

  it('leaves every wildcard in a long run escaped', () => {
    // Global replace, not just the first occurrence.
    expect(escapeSearchQuery('%%__')).toBe('\\%\\%\\_\\_');
  });
});

describe('escapeSearchQuery — invariants (fuzz)', () => {
  const SAMPLES = [
    '',
    'normal query',
    '()),,,%%__',
    'drop table; select *',
    'a)b(c,d%e_f',
    "'; --",
    '%_(),%_(),',
    'éàü 日本語 %_',
    '\\already\\escaped',
    '   ',
  ];

  it('output never contains an or() delimiter, ( ) or ,', () => {
    for (const s of SAMPLES) {
      const out = escapeSearchQuery(s);
      expect(out).not.toMatch(/[(),]/);
    }
  });

  it('every % or _ in the output is backslash-escaped', () => {
    for (const s of SAMPLES) {
      const out = escapeSearchQuery(s);
      // No % or _ may appear without an immediately preceding backslash.
      expect(out).not.toMatch(/(^|[^\\])[%_]/);
    }
  });

  it('is idempotent on its own delimiter-free output shape (no new metachars)', () => {
    for (const s of SAMPLES) {
      const once = escapeSearchQuery(s);
      // Re-running must not (re)introduce ( ) or , — they were already removed.
      expect(escapeSearchQuery(once)).not.toMatch(/[(),]/);
    }
  });
});
