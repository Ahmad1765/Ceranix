// Sanitize free-text search input before it is interpolated into a PostgREST
// `.or(...)` filter expression. Pure + dependency-free so it can be unit-tested
// in isolation (lib/listings.ts imports this and uses it in searchListings).
//
// Two distinct injection surfaces are neutralized:
//
//  1. PostgREST `or()` delimiters — `(`, `)`, `,`. These structure the filter
//     expression itself (`or(a.ilike.x,b.ilike.y)`). A raw comma or paren from
//     the user could otherwise inject additional OR conditions or close the
//     expression early, so they are replaced with spaces.
//  2. SQL LIKE wildcards — `%`, `_`. Escaped with a backslash so a literal
//     percent/underscore typed by the user matches itself instead of acting as
//     a wildcard (which would broaden results and leak unintended rows).
export function escapeSearchQuery(raw: string): string {
  return raw
    .replace(/[(),]/g, ' ')
    .replace(/[%_]/g, '\\$&')
    .trim();
}
