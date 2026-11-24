# HTTPS and security headers

Issue #49. The Compose `proxy` service (Caddy) serves the web app and forwards the API. Its
configuration is in `proxy/`:

| File | Used for |
|---|---|
| `proxy/common.caddy` | Shared snippets: security headers and the routes (API, web app) |
| `proxy/Caddyfile` | Local and CI setup: plain HTTP, published as `http://localhost:8080`. The default |
| `proxy/Caddyfile.demo` | The shared demo host: HTTPS on `DEMO_HOST`, started by `docker-compose.demo.yml` |

## Headers

| Header | Value | Where |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` | The web app only |
| `X-Frame-Options` | `DENY` | Every response |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Every response that does not set its own. The API sends `no-referrer`, which is kept |
| `X-Content-Type-Options` | `nosniff` | Every response that does not set its own (the API already sends it) |
| `Strict-Transport-Security` | `max-age=31536000` | HTTPS on the demo host only. Never on plain HTTP |

`Server` is removed from Caddy's responses.

Why the CSP looks like this:

- The web app has no inline scripts and loads nothing from other hosts: API calls, images, QR
  codes and the built assets are same-origin, and it uses system fonts.
- `style-src 'unsafe-inline'`: React writes inline `style` attributes (charts, grids, the seat
  map). Inline scripts stay blocked.
- `img-src data: blob:`: campaign QR previews are `blob:` images; ticket QR codes are inline SVG.
- GA4 needs no exception: since #131 the clients send measurements to our API, which forwards
  them, so no Google script runs in the page.
- Signing in with Google leaves the site by a full-page navigation, which the CSP does not
  restrict.
- The API docs (`/docs`, `/redoc`) load Swagger UI and ReDoc from a CDN, so they do not get the
  policy. They are FastAPI's own pages, not part of the app.

HSTS has no `includeSubDomains` or `preload`: add them only once every subdomain of the demo
domain is served over HTTPS, because browsers remember the policy for a year.

## Local setup

Nothing changes: `docker compose up -d --build` and `http://localhost:8080`. Check the headers
with:

```sh
curl -sI http://localhost:8080/discover
```

It should list the CSP, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`, and no
`Strict-Transport-Security`.

## Demo host

You need a hostname whose DNS points at the demo machine, with ports 80 and 443 reachable from the
internet. Caddy then gets and renews a certificate by itself (Let's Encrypt or ZeroSSL).

1. In `.env` on that machine, use the HTTPS address. The API refuses to start in production
   without these:

   ```dotenv
   ENVIRONMENT=production
   ALLOWED_ORIGINS=["https://demo.example.org"]
   FRONTEND_URL=https://demo.example.org
   COOKIE_SECURE=true
   GOOGLE_REDIRECT_URI=https://demo.example.org/api/v1/auth/google/callback
   ```

   Production also requires `MALWARE_SCANNER=clamav` (the Compose default).

2. Start the stack with the overlay:

   ```sh
   DEMO_HOST=demo.example.org docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d --build
   ```

   The overlay runs Caddy with `Caddyfile.demo`, publishes ports 80 and 443 (443/udp for
   HTTP/3) and keeps the certificates in the `caddy_data` volume. Without the volume, every
   restart asks for new certificates and soon hits the issuers' rate limits. Compose stops with
   an error if `DEMO_HOST` is not set.

3. Check:

   ```sh
   curl -sI http://demo.example.org/discover    # 308 to https://demo.example.org/discover
   curl -sI https://demo.example.org/discover   # 200 with the headers above and HSTS
   ```

   `http://localhost:8080` on the demo machine itself keeps working over plain HTTP.

The first start can take a minute while the certificate is issued; `docker compose logs proxy`
shows the progress and any DNS or firewall problem.

## Checked on 24 November 2026

On a local stack (`main` at `8d31ee4` plus this change), with the proxy image built from
`proxy/Dockerfile`:

- `caddy validate` passes for both configurations.
- `Caddyfile`: the headers above on `/discover`, on a deep link and on the SPA fallback; the API
  keeps `Referrer-Policy: no-referrer`; `/docs` has no CSP; no HSTS.
- `Caddyfile.demo` with `DEMO_HOST=localhost` (Caddy's local CA instead of a public one):
  `http://localhost` answers `308` to HTTPS; HTTPS adds `Strict-Transport-Security` to the web
  app and the API; another host name on port 80 is still served over HTTP.
- In Chromium, under the CSP: a probe that opens the main screens as a guest, attendee,
  organizer and admin, and the Playwright end-to-end suite (`e2e/`). Results are in the
  description of the pull request that closed #49.

Not checked: a real demo hostname with a public certificate, since there is no demo host yet.
