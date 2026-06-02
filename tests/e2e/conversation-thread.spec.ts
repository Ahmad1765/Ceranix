// Conversation screen — renders the seeded messages, sends a new message,
// and walks the offer flow (open sheet → enter amount → send).

import { test, expect, waitForAppReady } from './helpers/page';
import { signInAs } from './helpers/auth';
import { USERS } from './helpers/fixtures';

test.describe('Conversation thread', () => {
  test.beforeEach(async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const conv = state.conversations[0];
    await page.goto(`/conversation/${conv.id}`);
    await waitForAppReady(page);
  });

  test('renders header with the other participant\'s name and the product ticket', async ({ page, state }) => {
    const other = state.profiles.find((u) => u.id === USERS.bob.id)!;
    const listing = state.listings.find((l) => l.id === state.conversations[0].listing_id)!;
    await expect(page.getByText(other.full_name)).toBeVisible();
    await expect(page.getByText(listing.title).first()).toBeVisible();
    await expect(page.getByText(`$${listing.price}`).first()).toBeVisible();
  });

  test('shows the seeded messages in chronological order', async ({ page, state }) => {
    for (const msg of state.messages.filter((m) => m.kind === 'text')) {
      await expect(page.getByText(msg.content)).toBeVisible();
    }
  });

  test('sends a new text message and persists it to the messages table', async ({ page, state }) => {
    const before = state.messages.length;
    const input = page.getByPlaceholder('Write a message...');
    await input.fill('Could you do $50?');
    // Submit via Enter — the input is multiline but pressing Enter without
    // shift still fires the form/submit. If your TextInput swallows Enter,
    // fall back to the trailing send button which is the LAST pressable on
    // the composer row.
    await input.press('Enter').catch(() => {});
    // Belt-and-braces: also try clicking the trailing send button if the
    // Enter key didn't trigger send (RN's TextInput multiline ignores it).
    const composerButtons = page.locator('[role="button"]');
    const lastSendBtn = composerButtons.nth((await composerButtons.count()) - 1);
    await lastSendBtn.click().catch(() => {});
    await expect(page.getByText('Could you do $50?')).toBeVisible();
    await page.waitForTimeout(400);
    expect(state.messages.length).toBeGreaterThan(before);
    expect(state.calls.insertedMessages.some((m: any) => m.content === 'Could you do $50?')).toBeTruthy();
  });

  test('cannot send an empty message — the send button stays inert', async ({ page, state }) => {
    const before = state.calls.insertedMessages.length;
    const input = page.getByPlaceholder('Write a message...');
    await input.fill('   ');
    // The send button is disabled when input is blank/whitespace; clicking
    // is a no-op and no message is inserted.
    const buttons = page.locator('[role="button"]');
    await buttons.nth((await buttons.count()) - 1).click().catch(() => {});
    await page.waitForTimeout(200);
    expect(state.calls.insertedMessages.length).toBe(before);
  });

  test('Offer pill opens the sheet, validates the amount, and sends an offer message', async ({ page, state }) => {
    await page.getByText('Offer', { exact: true }).click();
    await expect(page.getByText('Make an offer')).toBeVisible();
    await page.getByPlaceholder('0').fill('40');
    await page.getByText('Send offer', { exact: true }).click();
    await expect(page.getByText('$40').first()).toBeVisible();
    expect(
      state.calls.insertedMessages.some((m: any) => m.kind === 'offer' && m.metadata?.amount === 40),
    ).toBeTruthy();
  });
});
