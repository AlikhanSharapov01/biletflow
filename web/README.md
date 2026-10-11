# BiletFlow web

This directory contains the browser client and its Vite build configuration.

For native web development, use Node.js 22.12 or newer. The Docker build already supplies a
compatible Node 22 environment.

Start the backend from the repository root:

```sh
docker compose up --build -d db migrate api worker mailpit
```

Then run the web development server from this directory:

```sh
cp .env.example .env
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` and `/health/*` to the backend address in
`VITE_API_PROXY_TARGET`, which defaults to `http://localhost:8000`.

## Browser experience

The browser supports email/password and Google sign-in, account registration, and password-reset
requests. Successful sign-in loads the profile from `/api/v1/me`; the access token stays in
memory, while the HttpOnly refresh cookie restores the session after a reload. **Profile &
sessions** shows active and past sessions, supports revoking another session, and can sign out
everywhere. Access tokens are refreshed when needed.

**Discover events** loads published public events from the API and supports title/category
filters and event details. **Organizer** loads the signed-in user’s workspaces, supports creating
a workspace, creating event drafts with a free RSVP ticket, and publishing or unpublishing
events. The API remains authoritative for permissions and publication rules.

Google sign-in requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the backend environment.
Register the web app root as the Google OAuth redirect URI and set the exact same value for
`GOOGLE_REDIRECT_URI`: `http://localhost:5173/` with Vite or `http://localhost:8080/` with the
full Caddy stack. Google returns `code` and `state` to the browser, which immediately removes
them from the address bar and completes the existing backend callback through the same-origin
`/api` proxy. Keep the browser and API on the same `localhost` host so the OAuth binding and
refresh cookies work. See the backend README’s **Enable Google sign-in** section for provider
setup.

From the sign-in screen, **Open a role workspace without an account** still previews the
Attendee, Organizer, Event Admin, and Platform Admin pages with sample data; these previews do
not grant backend permissions. Analytics, check-in, and moderation previews remain demo-only.
The complete password-reset-link flow is not yet provided by the frontend.

Production build:

```sh
npm run build
```

The command creates `dist/`. Do not commit that directory; the root proxy image builds it and
copies it into Caddy automatically.
