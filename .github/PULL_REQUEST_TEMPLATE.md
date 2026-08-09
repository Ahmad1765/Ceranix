## Summary

<!-- 1–3 bullets describing what changed and why. The "why" matters more
     than the "what" — the diff already shows what. -->

-
-

## How was this tested?

<!-- Required for non-trivial PRs. Describe the manual steps you ran, the
     unit/integration tests touched, or "verified in Vercel preview". -->

- [ ] Tested locally
- [ ] CI passes (typecheck + web build)
- [ ] Verified in Vercel preview

## Database / Supabase changes

<!-- If you touched supabase/*.sql or RPCs: -->

- [ ] No SQL changes
- [ ] Migration runs cleanly against an empty Postgres (CI checks this)
- [ ] RLS policies considered
- [ ] Denormalised counts / triggers still consistent

## Risk & rollback

<!-- For anything user-facing or deploy-affecting: how do we roll this back
     if something goes wrong? "Revert + redeploy" is usually fine. -->

-

## Screenshots / recordings

<!-- For UI changes. Side-by-side before/after is great. -->
