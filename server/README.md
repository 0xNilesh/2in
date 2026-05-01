# `@2in/server`

Production-grade Node API for 2in. Sibling to `web/` — handles flows the
browser can't (Twitter OAuth token exchange + tweet fetch, no CORS
allowance).

Stack: **Node 20+ · TypeScript strict · Fastify 5 · zod · pino**.

## Layout

```
server/
├── src/
│   ├── index.ts            entry — boot + graceful shutdown
│   ├── server.ts           Fastify app builder (testable)
│   ├── config.ts           zod-validated env
│   ├── lib/
│   │   ├── pkce.ts         PKCE verifier/challenge helpers
│   │   └── state-store.ts  in-memory state cache (swap for Redis later)
│   ├── services/
│   │   └── twitter.ts      Twitter API v2 client (typed)
│   ├── routes/
│   │   ├── health.ts       GET /api/health
│   │   └── twitter.ts      auth-url · exchange · tweets
│   └── plugins/
│       └── error-handler.ts central error mapping (zod / TwitterApiError → HTTP)
├── package.json
├── tsconfig.json
└── .env.example
```

## Running locally

```bash
cp .env.example .env       # then fill TWITTER_CLIENT_ID etc.
npm install
npm run dev                # tsx watch on src/index.ts → http://localhost:3001
```

The frontend at `web/` proxies `/api/*` → `:3001` via `vite.config.js`.

## Routes

- `GET /api/health` — liveness probe
- `GET /api/twitter/auth-url[?redirect=1]` — returns `{url, state}` (or 302)
- `POST /api/twitter/exchange` — `{code, state}` → `{token, user}`
- `GET /api/twitter/tweets?userId=...&max=20` — `Authorization: Bearer <token>`

## Twitter setup

1. https://developer.twitter.com → Projects & Apps → create / open an app
2. User authentication settings:
   - Type: **Web App, Automated App or Bot** (confidential client)
   - Callback URL: must equal `TWITTER_REDIRECT_URI` (default
     `http://localhost:5173/onboarding`)
   - Scopes: `tweet.read`, `users.read`, `offline.access`
3. Copy Client ID + Client Secret into `server/.env`

## Production

- `npm run build` → `dist/`
- `npm start` runs `node dist/index.js`
- Replace `createMemoryStateStore` with a Redis-backed implementation when
  running multiple instances behind a load balancer.
