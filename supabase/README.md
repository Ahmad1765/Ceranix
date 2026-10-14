# Supabase

Live project: `ttxestvncdynsssmjqhk` (Cerranix). Local CLI config: `config.toml`.

## Layout

| Path | What it is |
| --- | --- |
| `migrations/20261015000000_remote_baseline.sql` | Full schema of the live project, dumped 2026-10-15 (`supabase db dump --linked`), plus the auth trigger, storage buckets/policies and cron jobs that the dump skips. **This is the starting point.** |
| `migrations/*` after the baseline | Every schema change from now on. |
| `archive/` | Pre-baseline SQL history (loose files + old migrations). Kept for reference only — never applied, and several files there do **not** match production. |
| `seed.sql` | Local test users/listings. Runs on `supabase db reset`. Needs the full local stack. |
| `functions/` | Edge functions. `verify_jwt` per function is set in `config.toml`. |
| `tests/` | SQL adversarial tests. |

## Making a schema change

1. `npx supabase@2.121.0 migration new <name>` and write the SQL.
2. Test locally: `npx supabase@2.121.0 start` then `npx supabase@2.121.0 db reset`.
3. Open a PR — the `Supabase migrations` workflow rebuilds the schema from `migrations/` on a clean Postgres.
4. Apply to production: `npx supabase@2.121.0 db push`.

Never change production through the SQL editor — that is how the repo and the live
database drifted apart before the baseline.

## Do not

- `supabase config push` — the `[auth]` block in `config.toml` holds local defaults
  (site_url = 127.0.0.1) and would overwrite production auth settings.
- Apply anything from `archive/` to production.

## Not in git (set per environment)

Vault secrets `push_function_url` and `push_webhook_secret` (used by `public.notify_push`
→ `send-push`), and edge function secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`PUSH_WEBHOOK_SECRET`, `REPLICATE_API_TOKEN`, `ALLOWED_ORIGINS`, `POSTHOG_KEY`, `POSTHOG_HOST`).
