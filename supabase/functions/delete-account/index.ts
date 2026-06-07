// supabase/functions/delete-account/index.ts
// Deploy: supabase functions deploy delete-account
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Client invokes via:
//   await supabase.functions.invoke('delete-account', { body: { reason } })
//
// This deletes the auth user using the service-role key.
// FK cascades (profiles, listings, listing_likes, conversations, messages)
// remove all owned rows.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
const ALLOWED_ORIGINS = envOrigins ? envOrigins.split(',').map((o) => o.trim()).filter(Boolean) : [];

function getCorsHeaders(req: Request) {
  if (ALLOWED_ORIGINS.length === 0) return null;
  const origin = req.headers.get('Origin');
  // Only echo back the caller's Origin if it's explicitly on the allow-list.
  // Falling back to ALLOWED_ORIGINS[0] would leak a valid CORS response to
  // disallowed origins (the browser still blocks the actual cross-origin
  // request, but exposing the allowed origin in error logs is unnecessary).
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (!corsHeaders) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Server misconfigured' }, 500);
    }

    // Verify the caller via their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Invalid session' }, 401);
    }
    const user = userData.user;

    // Parse optional reason
    let reason: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.reason === 'string') reason = body.reason.slice(0, 500);
    } catch {
      // ignore — empty body is fine
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Log the deletion request (required success)
    const { error: insertErr } = await admin.from('account_deletion_requests').insert({
      user_uuid: user.id, // Write to a non-FK column to avoid cascade delete issues
      reason,
    });
    if (insertErr) {
      console.warn('[delete-account] Failed to log deletion request:', insertErr);
      return json({ error: 'Failed to process deletion request audit log' }, 500);
    }

    // Perform deletion
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return json({ error: delErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});
