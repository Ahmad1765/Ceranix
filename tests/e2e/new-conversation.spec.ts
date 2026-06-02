// New conversation modal — entry point from a product page or external link.
// `/conversation/new?listing=<id>&mode=message|offer`.

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('New conversation', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
  });

  test('message mode renders recipient, listing card, mode toggle, and quick replies', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=message`);
    await waitForAppReady(page);
    await expect(page.getByText('New message')).toBeVisible();
    await expect(page.getByText(listing.title).first()).toBeVisible();
    await expect(page.getByText('Message', { exact: true })).toBeVisible();
    await expect(page.getByText('Offer', { exact: true })).toBeVisible();
    await expect(page.getByText('QUICK REPLIES')).toBeVisible();
    await expect(page.getByText('Hi! Is this still available?')).toBeVisible();
  });

  test('Send is disabled when the message is blank, enabled once typed', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=message`);
    await waitForAppReady(page);
    await expect(page.getByText('Type a message')).toBeVisible();
    await page.getByPlaceholder('Hi! I have a question about this item...').fill('Still available?');
    await expect(page.getByText('Send message')).toBeVisible();
  });

  test('clicking a quick reply pre-fills the message body', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=message`);
    await waitForAppReady(page);
    await page.getByText('Could you send more photos?').click();
    const input = page.getByPlaceholder('Hi! I have a question about this item...');
    await expect(input).toHaveValue('Could you send more photos?');
  });

  test('sending a message creates a new conversation and redirects to it', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=message`);
    await waitForAppReady(page);
    await page.getByPlaceholder('Hi! I have a question about this item...').fill('Hey there');
    await page.getByText('Send message').click();
    await page.waitForURL(/conversation\/[^/?]+/);
    expect(
      state.calls.insertedMessages.some((m: any) => m.content === 'Hey there' && m.kind === 'text'),
    ).toBeTruthy();
  });

  test('offer mode renders amount input and price suggestions', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=offer`);
    await waitForAppReady(page);
    await expect(page.getByText('Make an offer')).toBeVisible();
    await expect(page.getByText('YOUR OFFER')).toBeVisible();
    // Suggestions are 70% / 80% / 90% of the listing price, rounded.
    const expected = [
      Math.round(listing.price * 0.7),
      Math.round(listing.price * 0.8),
      Math.round(listing.price * 0.9),
    ];
    for (const v of expected) {
      await expect(page.getByText(`$${v}`).first()).toBeVisible();
    }
  });

  test('offer flow rejects a zero amount and accepts a valid one', async ({ page, state }) => {
    const listing = state.listings.find((l) => l.seller_id === USERS.bob.id && !l.is_sold)!;
    await page.goto(`/conversation/new?listing=${listing.id}&mode=offer`);
    await waitForAppReady(page);
    await expect(page.getByText('Enter an amount')).toBeVisible();
    const amount = Math.round(listing.price * 0.8);
    await page.getByPlaceholder('0').fill(String(amount));
    await expect(page.getByText(`Send offer · $${amount}`)).toBeVisible();
    await page.getByText(`Send offer · $${amount}`).click();
    await page.waitForURL(/conversation\/[^/?]+/);
    expect(
      state.calls.insertedMessages.some(
        (m: any) => m.kind === 'offer' && m.metadata?.amount === amount,
      ),
    ).toBeTruthy();
  });

  test('routing with an invalid listing id renders the "Listing unavailable" state', async ({ page }) => {
    await page.goto(`/conversation/new?listing=00000000-dead-beef-0000-000000000000&mode=message`);
    await waitForAppReady(page);
    await expect(page.getByText('Listing unavailable')).toBeVisible();
  });
});
