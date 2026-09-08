import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/page';

test.describe('Browse chips styling and interaction', () => {
  test('Browse chips have transparent background by default and fill on hover/selection', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Open Discover Sheet
    await page.getByRole('button', { name: 'Discover' }).click();

    // Verify "Browse" section exists
    await expect(page.getByText('Browse', { exact: true })).toBeVisible();

    // Locate the "Trending" browse chip
    const trendingChip = page.getByRole('button', { name: 'Browse trending' });
    await expect(trendingChip).toBeVisible();

    // Verify initial transparent/empty background
    const initialBg = await trendingChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(initialBg).toBe('rgba(0, 0, 0, 0)');

    // Hover over the chip
    await trendingChip.hover();

    // Verify filled background on hover/interaction (not transparent)
    const hoveredBg = await trendingChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(hoveredBg).not.toBe('rgba(0, 0, 0, 0)');

    // Move mouse away
    await page.mouse.move(0, 0);

    // Verify it reverts back to transparent when unhovered
    const unhoveredBg = await trendingChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(unhoveredBg).toBe('rgba(0, 0, 0, 0)');
  });

  test('Active Browse chip displays filled background according to current query state', async ({
    page,
  }) => {
    // Navigate with a sort query applied
    await page.goto('/?sort=price_asc');
    await waitForAppReady(page);

    // Open Discover Sheet
    await page.getByRole('button', { name: 'Discover' }).click();

    // Locate the "Lowest price" chip (maps to sort=price_asc)
    const lowestPriceChip = page.getByRole('button', { name: 'Browse lowest price' });
    await expect(lowestPriceChip).toBeVisible();

    // The selected chip should have filled background even without hover
    await page.mouse.move(0, 0);
    const activeBg = await lowestPriceChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(activeBg).not.toBe('rgba(0, 0, 0, 0)');

    // Other unselected chips like "Trending" remain transparent
    const trendingChip = page.getByRole('button', { name: 'Browse trending' });
    const inactiveBg = await trendingChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(inactiveBg).toBe('rgba(0, 0, 0, 0)');
  });
});
