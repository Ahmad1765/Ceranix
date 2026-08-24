// supabase/functions/update-seller-subscription/index.ts
// Deploy: supabase functions deploy update-seller-subscription
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
const ALLOWED_ORIGINS = envOrigins ? envOrigins.split(',').map((o) => o.trim()).filter(Boolean) : [];

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('Origin');
  if (!origin) return {};
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (corsHeaders === null) {
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

    const body = await req.json();
    if (typeof body?.is_pro !== 'boolean') {
      return json({ error: 'is_pro boolean is required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.rpc('update_seller_subscription', {
      p_user_id: user.id,
      p_is_pro: body.is_pro,
    });

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ success: true, profile: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json({ error: msg }, 500);
  }
});
