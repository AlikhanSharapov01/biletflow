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

The current UI provides email/password sign-in, account registration, and password-reset
requests through `/api/v1/auth/login`, `/api/v1/auth/register`, and
`/api/v1/auth/password/forgot`. A successful sign-in loads `/api/v1/me` and opens the attendee
workspace. New accounts must verify their email before signing in.

From the sign-in screen, use **Open a role workspace without an account** to preview the
Attendee, Organizer, Event Admin, and Platform Admin pages. These workspaces use sample data;
their role switcher is for UI review only and does not grant or validate backend permissions.
Most event, analytics, check-in, and moderation actions are presentation-only. The frontend
does not yet provide a complete password-reset-link flow.

Production build:

```sh
npm run build
```

The command creates `dist/`. Do not commit that directory; the root proxy image builds it and
copies it into Caddy automatically.
