# Plick — Design System Notes

**Source attempted:** https://www.plick.se/ · 2026-07-23

## Extraction failed — site-side TLS issue

`plick.se` is currently serving an invalid certificate — not a normal expired/self-signed cert, but literally a **Kubernetes Ingress Controller's default "Fake Certificate"** (`CN=Kubernetes Ingress Controller Fake Certificate`, self-signed, issued 2026-07-23). This means Plick's backend/ingress routing looks misconfigured or mid-deploy right now, on their end — not a network or tooling problem here. Confirmed independently via `curl` (schannel `SEC_E_UNTRUSTED_ROOT`) and raw `openssl s_client`.

`plick.com` was also checked as an alternate domain — it doesn't resolve (NXDOMAIN), so `plick.se` is the only real domain.

Because the cert is broken, `extract-design-system` (which uses a real browser and enforces TLS) refuses to load the page, and even bypassing certificate validation might just hit the ingress's default/error backend rather than the real site.

## Next steps

- Retry extraction later — this looks transient/deploy-related rather than permanent.
- If it's still broken next time, we can bypass TLS validation for this one domain specifically (`page.goto` with `ignoreHTTPSErrors`) to at least see what's being served, with the caveat that a broken ingress may mean it isn't the real marketing page anyway.
