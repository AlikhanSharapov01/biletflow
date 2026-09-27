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

Production build:

```sh
npm run build
```

The command creates `dist/`. Do not commit that directory; the root proxy image builds it and
copies it into Caddy automatically.
