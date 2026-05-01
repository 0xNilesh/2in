# Deploying 2in

Local → live in roughly half a day. Each step is independent — you can ship
the contract first, the server next, the web last.

```
[1] Deploy TwinINFT to Galileo  →  contract address (one-time)
[2] Deploy server to Render/Fly →  API URL
[3] Deploy web to Vercel        →  public URL
[4] Wire env vars cross-deploy  →  contract addr + API URL + CORS + Twitter callback
[5] Smoke test the live URL
```

---

## 1 · Contract → Galileo testnet

Prerequisites:

- A Galileo wallet with > 0.001 0G of testnet funds. Faucet:
  https://faucet.0g.ai (0.1 0G/wallet/day).
- `forge` installed (https://book.getfoundry.sh/getting-started/installation).

Setup:

```bash
cd contracts
cp .env.example .env          # if you haven't already
# fill DEPLOYER_PRIVATE_KEY in contracts/.env

# pull submodules (forge-std + openzeppelin-contracts)
forge install
```

Dry-run first to confirm wiring:

```bash
./scripts/deploy-contract.sh        # simulate, no broadcast
```

Then the real thing:

```bash
./scripts/deploy-contract.sh broadcast
# type 'yes' to confirm
# script prints: ✓ Deployed TwinINFT at: 0x...
```

Paste the address into:

| File | Var |
|---|---|
| `contracts/.env` | `TWIN_INFT_GALILEO=0x...` |
| `server/.env` | `CHAIN_CONTRACT_ADDRESS=0x...` |
| `web/.env` | `VITE_CHAIN_CONTRACT_ADDRESS=0x...` |

Verify on-chain:

```bash
open https://chainscan-galileo.0g.ai/address/0x...
```

---

## 2 · Server → Render (or Fly)

Render path (recommended — single-file blueprint):

1. Push the repo to GitHub.
2. https://dashboard.render.com → New + → Blueprint → connect repo.
3. Render reads `server/render.yaml`, provisions one Docker web service.
4. In the Render dashboard, fill the `sync: false` env vars listed in the
   blueprint. Use `server/.env.production.example` as the source of truth.
5. Click Deploy.

Fly path:

```bash
brew install flyctl              # or: curl -L https://fly.io/install.sh | sh
fly auth login
cd server
fly launch --no-deploy --copy-config --name 2in-server
fly secrets set TWITTER_CLIENT_ID=... TWITTER_CLIENT_SECRET=... \
                TWITTER_REDIRECT_URI=https://placeholder/onboarding \
                CHAIN_CONTRACT_ADDRESS=0x... \
                CORS_ORIGINS=https://placeholder.vercel.app
# (update TWITTER_REDIRECT_URI + CORS_ORIGINS once Vercel URL is live)
fly deploy
```

Either way — once deployed, hit `https://<your-server>/api/health` and you
should get `{"status":"ok",...}`.

---

## 3 · Web → Vercel

```bash
cd web
npm install -g vercel              # one-time
vercel link                        # creates .vercel/ pointing at a new project
vercel --prod                      # initial deploy
```

After deploy, set env vars (Vercel dashboard or CLI):

```bash
vercel env add VITE_PRIVY_APP_ID production
vercel env add VITE_API_BASE production              # paste server URL
vercel env add VITE_CHAIN_CONTRACT_ADDRESS production # paste contract addr
vercel env add VITE_CHAIN_RPC production
vercel env add VITE_CHAIN_ID production
vercel env add VITE_CHAIN_EXPLORER production
```

Then redeploy so the new envs land in the build:

```bash
vercel --prod --force
```

Confirm the live SPA loads + every page returns 200:

```bash
URL=https://<your-vercel-app>.vercel.app
for p in / /onboarding /chat /memory /patterns /tools /settings; do
  echo -n "$p: "
  curl -s -o /dev/null -w "%{http_code}\n" "$URL$p"
done
```

---

## 4 · Cross-wire (the 5-minute step everyone forgets)

After both web + server are live:

| Where | Var | Set to |
|---|---|---|
| Vercel | `VITE_API_BASE` | `https://<your-server>` |
| Render/Fly | `CORS_ORIGINS` | `https://<your-vercel-app>.vercel.app` (comma-separate if you have a custom domain) |
| Render/Fly | `TWITTER_REDIRECT_URI` | `https://<your-vercel-app>.vercel.app/onboarding` |
| Twitter Dev Portal | Callback URL | same as above — must match exactly |

Redeploy both services so the env changes take effect (Vercel: `vercel --prod`,
Render: dashboard → Manual Deploy, Fly: `fly deploy`).

---

## 5 · Smoke test

```bash
WEB=https://<your-vercel-app>.vercel.app
API=https://<your-server>

# server
curl $API/api/health
curl $API/api/chain/mode
curl $API/api/finetune/mode
curl $API/api/storage/mode
curl $API/api/tools | jq '.count'   # should be 10

# web
open $WEB
# walk: landing → connect Privy → onboarding → demo tweets →
# name your twin → mint reveal (should show real tx hashes) →
# chat → "draft a sponsored tweet for the Acme deal" →
# work pane fills with live tool calls → Approve → toast →
# specialist profile → snapshot history populates
```

---

## Mode flags after deploy

Each major system carries a `mode` flag exposed at `GET /api/<x>/mode`:

| System | `kind: 'real'` requires | What `'mock'` looks like |
|---|---|---|
| Compute | `BROKER_PRIVATE_KEY` set + funded | Streamed canned responses, same SSE shape |
| Storage | `STORAGE_PRIVATE_KEY` set + funded | Deterministic sha256-based root hashes, in-memory KV |
| Chain | `CHAIN_CONTRACT_ADDRESS` set | Canned roster state served from `services/chain.ts` |
| Fine-tune | `BROKER_PRIVATE_KEY` set + funded | Simulated lifecycle queued → training → live over ~30s |

The UI surfaces the mode in pills (`mock` vs `chain · live`) so you and your
demo audience always know which path is firing. Flip them to real one at a
time as you fund wallets.

---

## Troubleshooting

**SSE doesn't stream in production.** Check that your server host doesn't
buffer (Render is fine; some CDNs aren't). The server already sets
`X-Accel-Buffering: no`. If using Vercel rewrites to proxy `/api` (we don't),
SSE would break — `VITE_API_BASE` direct is the supported pattern.

**Privy login button does nothing.** `VITE_PRIVY_APP_ID` is missing in the
Vercel build — env vars only land at build time, not runtime. Redeploy after
adding.

**`/api/twitter/auth-url` 503s.** `TWITTER_CLIENT_ID` is missing in the
server env. Check the Render/Fly secrets.

**Mint flow stays in mock mode even though contract is deployed.** Either
`VITE_CHAIN_CONTRACT_ADDRESS` isn't set in Vercel, OR the user isn't
authenticated with Privy yet (signer requires both).

**`updateMetadata` never fires from snapshots.** That's expected — the
snapshot service emits `source: 'mock'` until we wire the orchestrator
delegate signer. The UI still works end-to-end; rows show as mock.
