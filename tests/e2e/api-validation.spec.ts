// API contract sanity checks against the mocked backend — verifies the
// edge functions and RPCs respond with the shape the client expects.
// These run inside Playwright's page context so they use the same fetch
// the app uses (cookies, headers, CORS).

import { test, expect } from './helpers/page';
import { USERS } from './helpers/fixtures';
import { signInAs } from './helpers/auth';

test.describe('API contracts', () => {
  test.beforeEach(async ({ page }) => {
    // The mock interception is keyed off page.route, which only fires for
    // requests originating from the page context — so we navigate to a
    // lightweight route first to attach the network handlers.
    await page.goto('/auth/login');
  });

  test('GET /rest/v1/listings returns an array with the expected fields', async ({ page, state }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch(`${(window as any).__TEST_SB_URL ?? 'https://e2e.supabase.test'}/rest/v1/listings?select=id,title,price&order=created_at.desc`);
      return res.json();
    });
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
    const first = data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(typeof first.price).toBe('number');
  });

  test('POST /functions/v1/create-checkout-session returns a Stripe URL for a valid listing', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const listing = state.listings.find((l) => !l.is_sold)!;
    const data = await page.evaluate(async ({ id, url }) => {
      const res = await fetch(`${url}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: id, return_url: 'http://localhost/invoice/x?paid=1' }),
      });
      return { status: res.status, body: await res.json() };
    }, { id: listing.id, url: 'https://e2e.supabase.test' });
    expect(data.status).toBe(200);
    expect(data.body).toHaveProperty('url');
    expect(data.body).toHaveProperty('sessionId');
    expect(String(data.body.url)).toMatch(/checkout\.stripe/);
  });

  test('POST /functions/v1/create-checkout-session 400s without listing_id', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch(`https://e2e.supabase.test/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(data.status).toBe(400);
    expect(data.body.error).toMatch(/listing_id/);
  });

  test('POST /rpc/get_follow_state returns counts and is_following', async ({ page, state }) => {
    await signInAs(page, state, 'alice');
    const data = await page.evaluate(async ({ id }) => {
      const res = await fetch(`https://e2e.supabase.test/rest/v1/rpc/get_follow_state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_followee: id }),
      });
      return { status: res.status, body: await res.json() };
    }, { id: USERS.bob.id });
    expect(data.status).toBe(200);
    expect(data.body).toHaveProperty('is_following');
    expect(data.body).toHaveProperty('followers_count');
    expect(data.body).toHaveProperty('following_count');
    expect(typeof data.body.followers_count).toBe('number');
  });

  test('POST /auth/v1/token rejects bad credentials with 400', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch(`https://e2e.supabase.test/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.test', password: 'hunter22' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(data.status).toBe(400);
    expect(data.body.error).toBe('invalid_grant');
  });

  test('POST /auth/v1/signup rejects passwords shorter than 6 chars', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch(`https://e2e.supabase.test/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.test', password: '123' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(data.status).toBe(400);
    expect(data.body.code).toBe('weak_password');
  });
});
