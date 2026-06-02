// Playwright route interception for every Supabase + Stripe + edge-function
// request the app makes. The host comes from EXPO_PUBLIC_SUPABASE_URL — we
// match on `**/auth/v1/**`, `**/rest/v1/**`, `**/functions/v1/**`, and the
// realtime websocket URL, so any host name (`*.supabase.test`, `*.supabase.co`)
// resolves to our handler.
//
// State (listings, messages, profiles, follow-graph, likes) is held per Page
// in a closure so spec-specific mutations don't leak between tests.
//
// Spec authors override behavior with `mock.on('table:listings', ...)` style
// handlers when they need to assert custom shapes (errors, empty payloads).
//
// The shape we return mimics PostgREST's response format: a JSON array for
// `GET /rest/v1/<table>` with `?select=...&...filters`, a single object for
// `?id=eq.X&...maybeSingle()` (encoded via Accept header), etc. We don't
// re-implement PostgREST — we look at the query string, return canned data,
// and assert on the outgoing payload from the spec when needed.

import type { Page, Route, Request as PlaywrightRequest } from '@playwright/test';
import {
  CONVERSATIONS,
  hydrateListing,
  LISTINGS,
  MESSAGES,
  SESSION_TEMPLATE,
  USERS,
  type FixtureListing,
} from './fixtures';

export type MockState = {
  listings: FixtureListing[];
  profiles: Array<(typeof USERS)[keyof typeof USERS]>;
  conversations: typeof CONVERSATIONS;
  messages: typeof MESSAGES;
  likes: Array<{ user_id: string; listing_id: string }>;
  follows: Array<{ follower_id: string; followee_id: string }>;
  shippingAddresses: Array<Record<string, unknown>>;
  payoutMethods: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  authedUserId: string | null;
  // Counters tests can assert against.
  calls: {
    insertedListings: Array<Record<string, unknown>>;
    insertedMessages: Array<Record<string, unknown>>;
    insertedConversations: Array<Record<string, unknown>>;
    profileUpdates: Array<Record<string, unknown>>;
    edgeFunctionCalls: Array<{ name: string; body: unknown }>;
    rpcCalls: Array<{ name: string; body: unknown }>;
  };
};

export function freshState(): MockState {
  return {
    listings: LISTINGS.map(hydrateListing),
    profiles: Object.values(USERS).map((u) => ({ ...u })),
    conversations: CONVERSATIONS.map((c) => ({ ...c })),
    messages: MESSAGES.map((m) => ({ ...m })),
    likes: [],
    follows: [],
    shippingAddresses: [],
    payoutMethods: [],
    verifications: [],
    authedUserId: null,
    calls: {
      insertedListings: [],
      insertedMessages: [],
      insertedConversations: [],
      profileUpdates: [],
      edgeFunctionCalls: [],
      rpcCalls: [],
    },
  };
}

function json(route: Route, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function noContent(route: Route) {
  return route.fulfill({
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
    },
    body: '',
  });
}

// Tiny PostgREST-like filter parser. Only handles the operators the app
// actually uses (`eq.`, `neq.`, `in.(a,b)`, `or=(...)`).
function matches(row: Record<string, any>, filters: Array<[string, string]>): boolean {
  for (const [key, raw] of filters) {
    if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') continue;
    if (key === 'or') {
      const inner = raw.replace(/^\(|\)$/g, '').split(',');
      const anyMatch = inner.some((clause) => {
        const m = clause.match(/^([^.]+)\.(eq|neq)\.(.+)$/);
        if (!m) return false;
        const [, col, op, val] = m;
        const v = row[col];
        return op === 'eq' ? String(v) === val : String(v) !== val;
      });
      if (!anyMatch) return false;
      continue;
    }
    if (raw.startsWith('eq.')) {
      const want = raw.slice(3);
      if (String(row[key] ?? '') !== want) return false;
    } else if (raw.startsWith('neq.')) {
      const want = raw.slice(4);
      if (String(row[key] ?? '') === want) return false;
    } else if (raw.startsWith('in.')) {
      const list = raw.slice(3).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      if (!list.includes(String(row[key] ?? ''))) return false;
    }
  }
  return true;
}

function paramsToList(url: URL): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  url.searchParams.forEach((v, k) => out.push([k, v]));
  return out;
}

// Hosts we want to intercept. We don't care WHICH supabase host the bundle was
// built against — anything that LOOKS like Supabase or our test host gets
// caught here.
const SUPABASE_RE = /(\/auth\/v1\/|\/rest\/v1\/|\/functions\/v1\/|\/realtime\/v1\/|\/storage\/v1\/)/;

export async function installSupabaseMock(page: Page, state: MockState): Promise<MockState> {
  await page.route('**/*', async (route: Route, request: PlaywrightRequest) => {
    const url = request.url();

    if (!SUPABASE_RE.test(url) && !url.includes('stripe.com')) {
      // Pass through HTML/JS/CSS/asset requests to the local web server.
      return route.fallback();
    }

    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
        },
        body: '',
      });
    }

    const parsed = new URL(url);
    const path = parsed.pathname;

    // ── AUTH ────────────────────────────────────────────────────────────────
    if (path.includes('/auth/v1/')) {
      return handleAuth(route, request, parsed, state);
    }

    // ── EDGE FUNCTIONS ─────────────────────────────────────────────────────
    if (path.includes('/functions/v1/')) {
      const name = path.split('/functions/v1/')[1].split('/')[0];
      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      state.calls.edgeFunctionCalls.push({ name, body });
      if (name === 'create-checkout-session') {
        const listingId = (body as any)?.listing_id ?? '';
        const returnUrl = (body as any)?.return_url ?? '';
        if (!listingId) return json(route, 400, { error: 'listing_id required' });
        if (!returnUrl) return json(route, 400, { error: 'return_url required' });
        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing) return json(route, 404, { error: 'Listing not found' });
        return json(route, 200, {
          url: `https://checkout.stripe.test/session/test_${listingId}`,
          sessionId: `cs_test_${listingId}`,
        });
      }
      if (name === 'delete-account') {
        state.authedUserId = null;
        return json(route, 200, { ok: true });
      }
      return json(route, 200, { ok: true });
    }

    // ── REST (PostgREST) ───────────────────────────────────────────────────
    if (path.includes('/rest/v1/')) {
      const segments = path.split('/rest/v1/')[1].split('/');
      const target = segments[0];
      if (target === 'rpc') {
        return handleRpc(route, request, segments[1], state);
      }
      return handleTable(route, request, parsed, target, state);
    }

    // ── REALTIME / STORAGE ─────────────────────────────────────────────────
    // We don't run a websocket — let the realtime endpoint 404 quietly. The
    // app's inbox/messages subscriptions handle subscribe failures by simply
    // not receiving live events, which is fine for these tests (they assert
    // on the initial fetch).
    if (path.includes('/realtime/v1/') || path.includes('/storage/v1/')) {
      return json(route, 200, []);
    }

    return route.fallback();
  });

  return state;
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth handler
// ──────────────────────────────────────────────────────────────────────────────
async function handleAuth(route: Route, request: PlaywrightRequest, url: URL, state: MockState) {
  const path = url.pathname;
  let body: any = null;
  try {
    body = request.postDataJSON();
  } catch {
    body = null;
  }

  if (path.endsWith('/token')) {
    const grant = url.searchParams.get('grant_type');
    const email = String(body?.email ?? '').toLowerCase();
    const password = String(body?.password ?? '');
    if (grant === 'password') {
      if (password.length < 6) {
        return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      const user = state.profiles.find((u) => u.email?.toLowerCase() === email);
      if (!user) {
        return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      state.authedUserId = user.id;
      return json(route, 200, SESSION_TEMPLATE(user));
    }
    if (grant === 'refresh_token') {
      const user = state.profiles.find((u) => u.id === state.authedUserId);
      if (!user) return json(route, 400, { error: 'invalid_grant' });
      return json(route, 200, SESSION_TEMPLATE(user));
    }
    return json(route, 400, { error: 'unsupported_grant_type' });
  }

  if (path.endsWith('/signup')) {
    const email = String(body?.email ?? '').toLowerCase();
    const password = String(body?.password ?? '');
    if (password.length < 6) {
      return json(route, 400, { code: 'weak_password', msg: 'Password should be at least 6 characters.' });
    }
    if (state.profiles.some((u) => u.email?.toLowerCase() === email)) {
      return json(route, 400, { code: 'user_already_exists', msg: 'User already registered' });
    }
    const newUser = {
      id: `new-${Date.now()}`,
      email,
      username: email.split('@')[0],
      full_name: email.split('@')[0],
      avatar_url: null,
      bio: null,
      location: null,
      rating: 0,
      total_sales: 0,
      created_at: new Date().toISOString(),
      vacation_mode: false,
      bundle_discount_pct: 0,
      is_verified: false,
      is_pro: false,
      followers_count: 0,
      following_count: 0,
    };
    state.profiles.push(newUser as any);
    state.authedUserId = newUser.id;
    return json(route, 200, SESSION_TEMPLATE(newUser as any));
  }

  if (path.endsWith('/recover')) {
    // Password reset email — Supabase returns 200 with empty body.
    return json(route, 200, {});
  }

  if (path.endsWith('/logout')) {
    state.authedUserId = null;
    return noContent(route);
  }

  if (path.endsWith('/user')) {
    const user = state.profiles.find((u) => u.id === state.authedUserId);
    if (!user) return json(route, 401, { msg: 'No user' });
    return json(route, 200, SESSION_TEMPLATE(user).user);
  }

  return json(route, 200, {});
}

// ──────────────────────────────────────────────────────────────────────────────
// PostgREST table handler
// ──────────────────────────────────────────────────────────────────────────────
async function handleTable(
  route: Route,
  request: PlaywrightRequest,
  url: URL,
  table: string,
  state: MockState,
) {
  const method = request.method();
  const params = paramsToList(url);
  const accept = request.headers()['accept'] ?? '';
  const wantsSingle = accept.includes('application/vnd.pgrst.object+json');

  // ── SELECT ───────────────────────────────────────────────────────────────
  if (method === 'GET' || method === 'HEAD') {
    let rows: any[] = [];
    if (table === 'listings') rows = state.listings.map((l) => ({ ...l }));
    else if (table === 'profiles') rows = state.profiles.map((p) => ({ ...p }));
    else if (table === 'conversations') rows = state.conversations.map((c) => ({ ...c }));
    else if (table === 'messages') rows = state.messages.map((m) => ({ ...m }));
    else if (table === 'listing_likes') rows = state.likes.map((l) => ({ ...l }));
    else if (table === 'shipping_addresses') rows = [...state.shippingAddresses];
    else if (table === 'payout_methods') rows = [...state.payoutMethods];
    else if (table === 'verifications') rows = [...state.verifications];
    else rows = [];

    rows = rows.filter((r) => matches(r, params));

    // Apply embeds. The supabase client requests embed shape via the `select`
    // param, e.g. `select=*,seller:profiles!listings_seller_id_fkey(*)`. We
    // hydrate `seller`, `listing`, `buyer`, `other_user` etc. based on FK.
    const select = url.searchParams.get('select') ?? '';
    if (table === 'listings' && select.includes('seller')) {
      rows = rows.map((r) => ({
        ...r,
        seller: state.profiles.find((u) => u.id === r.seller_id) ?? null,
      }));
    }
    if (table === 'conversations') {
      rows = rows.map((r) => {
        const out: any = { ...r };
        if (select.includes('listing')) {
          const listing = state.listings.find((l) => l.id === r.listing_id) ?? null;
          out.listing = listing
            ? { id: listing.id, title: listing.title, price: listing.price, images: listing.images, is_sold: listing.is_sold }
            : null;
        }
        if (select.includes('buyer:profiles')) {
          out.buyer = state.profiles.find((u) => u.id === r.buyer_id) ?? null;
        }
        if (select.includes('seller:profiles')) {
          out.seller = state.profiles.find((u) => u.id === r.seller_id) ?? null;
        }
        return out;
      });
    }
    if (table === 'listing_likes' && select.includes('listings')) {
      rows = rows.map((r) => ({
        ...r,
        listing: {
          ...(state.listings.find((l) => l.id === r.listing_id) ?? {}),
          seller: state.profiles.find((u) =>
            u.id === state.listings.find((l) => l.id === r.listing_id)?.seller_id,
          ),
        },
      }));
    }

    // ORDER BY
    const order = url.searchParams.get('order');
    if (order) {
      const clauses = order.split(',').map((c) => {
        const [col, dir] = c.split('.');
        return { col, asc: dir !== 'desc' };
      });
      rows.sort((a, b) => {
        for (const { col, asc } of clauses) {
          const av = a[col];
          const bv = b[col];
          if (av === bv) continue;
          return (av > bv ? 1 : -1) * (asc ? 1 : -1);
        }
        return 0;
      });
    }

    // LIMIT
    const limit = url.searchParams.get('limit');
    if (limit) rows = rows.slice(0, Number(limit));

    if (wantsSingle) {
      return json(route, 200, rows[0] ?? null);
    }
    return json(route, 200, rows);
  }

  // ── INSERT ───────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const payload = request.postDataJSON();
    const rows = Array.isArray(payload) ? payload : [payload];
    const inserted: any[] = [];

    for (const row of rows) {
      const id = row.id ?? `new-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created_at = row.created_at ?? new Date().toISOString();
      const enriched = { id, created_at, ...row };

      if (table === 'listings') {
        state.calls.insertedListings.push(enriched);
        state.listings.unshift({ ...enriched, seller: state.profiles.find((u) => u.id === enriched.seller_id) } as any);
      } else if (table === 'conversations') {
        state.calls.insertedConversations.push(enriched);
        state.conversations.unshift(enriched);
      } else if (table === 'messages') {
        state.calls.insertedMessages.push(enriched);
        state.messages.push(enriched);
      } else if (table === 'listing_likes') {
        if (!state.likes.some((l) => l.user_id === enriched.user_id && l.listing_id === enriched.listing_id)) {
          state.likes.push({ user_id: enriched.user_id, listing_id: enriched.listing_id });
        }
      } else if (table === 'shipping_addresses') {
        state.shippingAddresses.push(enriched);
      } else if (table === 'payout_methods') {
        state.payoutMethods.push(enriched);
      } else if (table === 'verifications') {
        state.verifications.push(enriched);
      }
      inserted.push(enriched);
    }

    const select = url.searchParams.get('select');
    if (!select) return noContent(route);
    return json(route, 201, wantsSingle ? inserted[0] : inserted);
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────
  if (method === 'PATCH') {
    const payload = request.postDataJSON();
    const target = (rows: any[]) => rows.filter((r) => matches(r, params));
    let touched: any[] = [];
    if (table === 'profiles') {
      const matched = target(state.profiles);
      matched.forEach((r) => Object.assign(r, payload));
      state.calls.profileUpdates.push(payload);
      touched = matched;
    } else if (table === 'listings') {
      const matched = target(state.listings);
      matched.forEach((r) => Object.assign(r, payload));
      touched = matched;
    } else if (table === 'shipping_addresses') {
      const matched = target(state.shippingAddresses);
      matched.forEach((r) => Object.assign(r, payload));
      touched = matched;
    } else if (table === 'payout_methods') {
      const matched = target(state.payoutMethods);
      matched.forEach((r) => Object.assign(r, payload));
      touched = matched;
    } else if (table === 'messages') {
      const matched = target(state.messages);
      matched.forEach((r) => Object.assign(r, payload));
      touched = matched;
    }
    return json(route, 200, wantsSingle ? touched[0] ?? null : touched);
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    if (table === 'listing_likes') {
      state.likes = state.likes.filter((l) => !matches(l, params));
    } else if (table === 'shipping_addresses') {
      state.shippingAddresses = state.shippingAddresses.filter((r) => !matches(r as any, params));
    } else if (table === 'payout_methods') {
      state.payoutMethods = state.payoutMethods.filter((r) => !matches(r as any, params));
    }
    return noContent(route);
  }

  return json(route, 404, { error: 'unknown table' });
}

// ──────────────────────────────────────────────────────────────────────────────
// RPC handler — only the RPCs the app actually calls.
// ──────────────────────────────────────────────────────────────────────────────
async function handleRpc(route: Route, request: PlaywrightRequest, name: string, state: MockState) {
  let body: any = {};
  try {
    body = request.postDataJSON();
  } catch {
    body = {};
  }
  state.calls.rpcCalls.push({ name, body });

  if (name === 'find_seller_other_listings') {
    const sellerId = body.p_seller_id;
    const exclude = body.p_exclude_id;
    const limit = body.p_limit ?? 6;
    return json(
      route,
      200,
      state.listings
        .filter((l) => l.seller_id === sellerId && l.id !== exclude && !l.is_sold)
        .slice(0, limit),
    );
  }

  if (name === 'find_similar_listings') {
    const listingId = body.p_listing_id;
    const limit = body.p_limit ?? 6;
    const src = state.listings.find((l) => l.id === listingId);
    if (!src) return json(route, 200, []);
    return json(
      route,
      200,
      state.listings
        .filter((l) => l.category === src.category && l.id !== listingId && !l.is_sold)
        .slice(0, limit),
    );
  }

  if (name === 'get_follow_state') {
    const followeeId = body.p_followee;
    const followee = state.profiles.find((u) => u.id === followeeId);
    if (!followee) return json(route, 200, null);
    const isFollowing =
      !!state.authedUserId &&
      state.follows.some((f) => f.follower_id === state.authedUserId && f.followee_id === followeeId);
    return json(route, 200, {
      is_following: isFollowing,
      followers_count: followee.followers_count ?? 0,
      following_count: followee.following_count ?? 0,
    });
  }

  if (name === 'toggle_follow') {
    if (!state.authedUserId) return json(route, 401, { error: 'auth required' });
    const followeeId = body.p_followee;
    const i = state.follows.findIndex(
      (f) => f.follower_id === state.authedUserId && f.followee_id === followeeId,
    );
    const followee = state.profiles.find((u) => u.id === followeeId);
    if (!followee) return json(route, 404, { error: 'no such user' });
    if (i >= 0) {
      state.follows.splice(i, 1);
      followee.followers_count = Math.max(0, (followee.followers_count ?? 1) - 1);
    } else {
      state.follows.push({ follower_id: state.authedUserId, followee_id: followeeId });
      followee.followers_count = (followee.followers_count ?? 0) + 1;
    }
    return json(route, 200, {
      is_following: i < 0,
      followers_count: followee.followers_count,
      following_count: followee.following_count ?? 0,
    });
  }

  return json(route, 404, { error: `unknown rpc: ${name}` });
}
