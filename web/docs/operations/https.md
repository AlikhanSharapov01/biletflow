# HTTPS demo handoff

The reviewed deployment configuration is `../../operations/Caddyfile.demo`.
It is staged under `web/` because repository edits are restricted to that directory.
It is not installed in the Compose proxy and no demo deployment has been changed.

The existing `proxy/Dockerfile` copies `proxy/Caddyfile`, so rebuilding alone does
not install this file. An operations owner must mount the supplied configuration
at `/etc/caddy/Caddyfile` (read only), set `DEMO_HOST` to the actual demo hostname,
publish ports 80 and 443, and persist Caddy's `/data` and `/config` directories.
Keep `8080:80` for the local setup. Point the hostname's DNS to that host first.
The default `demo.example.com` is a documentation placeholder and must be replaced.

The HTTP listener preserves `http://localhost:8080` and applies security headers
without HSTS. Only HTTPS on the demo host sends `Strict-Transport-Security`.
The HSTS policy deliberately excludes `includeSubDomains` and `preload` until
the operations owner has verified the rest of the domain's deployment.

The CSP allows same-origin scripts, fonts and API calls. React's inline style
attributes need `style-src 'unsafe-inline'` (charts and grids use them); inline
scripts are disallowed. Ticket QR uses inline SVG and campaign QR previews use
`blob:` images, both supported. GA4 is optional and its script and collection
hosts are explicitly allowed. No external font host is needed.

Before installation, validate in the Caddy image:

```sh
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

After installation, inspect the document response in browser DevTools and run:

```sh
curl -I https://YOUR_DEMO_HOST/discover
curl -I http://localhost:8080/discover
```

Both should return CSP, X-Frame-Options DENY, Referrer-Policy
strict-origin-when-cross-origin and X-Content-Type-Options nosniff. HTTPS should
add HSTS (`max-age=31536000`); localhost HTTP should omit it.

Browser acceptance checklist (not yet run in this session):

- Sign in and reload a deep route such as `/orders/ID`; API calls still work.
- Check fonts, attendee ticket QR and entry confirmation QR.
- Preview and download a campaign SVG and ticket PDF; open calendar downloads.
- If GA4 is configured, opt in and verify sanitized page views, then revoke consent.
- Inspect the console for CSP violations and verify headers on error responses.

Do not mark this deployment complete until these checks pass on the real host.

## Observed local state, 2026-11-09

`http://127.0.0.1:8080` served the current web production asset. Its response had
no CSP, X-Frame-Options, Referrer-Policy or X-Content-Type-Options headers. HSTS
was also absent, which is correct on plain local HTTP. The staged configuration
still needs installing before its headers can be verified. Both backend API
smoke suites passed against the same running Compose stack; this does not
validate HTTPS or browser CSP behaviour.
