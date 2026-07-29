// Discover screen — structural assertions only. We never type a specific
// brand name (we don't know what data exists); we type junk and confirm the
// empty state appears.
//
// Discover lands on the Aesthetics tab and the Items chip is hidden
// (SearchTabs.tsx HIDDEN_TABS), so the item grid — which owns the search
// landing, the category tiles and the "Nothing matched" state — is only
// reachable via a ?q= / ?category= deep link or by tapping a brand. Specs that
// exercise the grid deep-link into it; that is the real user path, not a
// shortcut around one.

import { test, expect, waitForAppReady, discoverSearch } from './helpers/page';
import { CATEGORIES } from '@/lib/categories';

test.describe('Discover', () => {
  test('lands on the Aesthetics tab', async ({ page }) => {
    await page.goto('/discover');
    await waitForAppReady(page);
    // "Discover" is rendered both as the page title AND as the bottom tab
    // label — use .first() to skip strict mode.
    await expect(page.getByText('Discover', { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Search aesthetics')).toBeVisible();
    for (const pill of ['Aesthetics', 'Brands', 'Users']) {
      await expect(page.getByText(pill, { exact: true }).first()).toBeVisible();
    }
  });

  test('focusing search opens the browse landing with its Browse chips and Topics tiles', async ({ page }) => {
    await page.goto('/discover?category=clothing');
    await waitForAppReady(page);
    const search = discoverSearch(page);
    await expect(search).toBeVisible();
    // Browse / Topics live in the search-focus landing, not the idle feed.
    await search.click();
    await expect(page.getByText('Browse', { exact: true })).toBeVisible();
    await expect(page.getByText('Topics', { exact: true })).toBeVisible();
    // Browse chips: three grid sorts + the three hub tabs + saved searches.
    for (const label of ['New', 'Trending', 'Lowest price', 'Aesthetics', 'Brands', 'Sellers', 'Saved']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // Topics tiles are derived from the same source they're built from
    // (lib/categories.ts, plus the "All items" tile). Hard-coding the labels is
    // what broke this test before: the taxonomy moved and renamed "Tech" to
    // "Electronics", which no one propagated here.
    for (const label of [...CATEGORIES.map((c) => c.label), 'All items']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('typing junk into search renders the "Nothing matched" empty state', async ({ page }) => {
    await page.goto('/discover?category=clothing');
    await waitForAppReady(page);
    await discoverSearch(page).fill('quantumprocessorrandomtokenxyz');
    await expect(page.getByText('Nothing matched')).toBeVisible();
    await expect(page.getByText('Try a different word, brand, or category.')).toBeVisible();
  });

  test('selecting a category from the landing surfaces the Clear action', async ({ page }) => {
    await page.goto('/discover?category=clothing');
    await waitForAppReady(page);
    // Drop the deep-linked category first, so the Clear we assert on below is
    // the one selecting "Bags" produced — not the one we arrived with.
    await page.getByText('Clear', { exact: true }).first().click();
    await expect(page.getByText('Clear', { exact: true })).toHaveCount(0);

    await discoverSearch(page).click();
    await page.getByText('Bags', { exact: true }).first().click();
    // Landing closes; the category grid header owns the Clear.
    await expect(page.getByText('Clear', { exact: true }).first()).toBeVisible();
    await page.getByText('Clear', { exact: true }).first().click();
    // After clearing, the idle Trending grid header is back.
    await expect(page.getByText(/Trending|Results/i).first()).toBeVisible();
  });
});
