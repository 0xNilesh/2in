# 2in

A digital twin you actually own — a director + roster of role-typed
specialist iNFTs that draft, research, edit and remember in your voice on
0G.

> **Track:** 0G APAC Hackathon — _Best Autonomous Agents, Swarms & iNFT Innovations_.

You name the **director** during onboarding. Behind it sit eight specialists
(five core, three opt-in), each minted as its own ERC-7857 iNFT under your
wallet. The director picks an orchestration pattern per request, hands off
to the right specialists, and reports back. Memory grows with every shipped
output and snapshots back to chain via `updateMetadata`.

| | |
|---|---|
| **TwinINFT contract (Galileo 16602)** | [`0xf454c04ee5365f9a195a00267e4a1dba6a7b9395`](https://chainscan-galileo.0g.ai/address/0xf454c04ee5365f9a195a00267e4a1dba6a7b9395) |
| **Explorer** | https://chainscan-galileo.0g.ai |
| **Live demo** | _add Vercel URL after deploy_ |
| **Demo video** | _add YouTube link after recording_ |
| **Source** | this repo |

---

## What ships

### The roster

Eight specialists, all role-typed (no personal names — keeps prompts
unambiguous and routing deterministic). Each is its own iNFT under your
wallet.

| Specialist | Tier | Reads | Writes |
|---|---|---|---|
| **Writer** | core | semantic + episodic + temporal | episodic |
| **Researcher** | core | episodic + temporal | semantic + episodic |
| **Editor** | core | procedural + semantic | procedural |
| **Strategist** | core | temporal + episodic | temporal |
| **Companion** | core | relationship + semantic | semantic + relationship |
| **Voice** | opt-in | semantic + episodic | episodic |
| **Visual** | opt-in | semantic | episodic |
| **Negotiator** | opt-in | relationship + procedural | relationship |

### Six typed memory slices

Memory is what the twin has lived. Every specialist reads its assigned
slices before drafting and writes back after.

- **episodic** — events that happened (shipped posts, decisions, conversations)
- **semantic** — stable facts (tone preferences, topic anchors, style anchors)
- **relationship** — people in your life (collaborators, sponsors, audience)
- **temporal** — time-anchored patterns (cadence, performance windows)
- **procedural** — how-to rules and the rejection ledger (Editor's gate)
- **working** — in-flight scratch for the current task; never persisted

Reinforcement promotes high-signal entries to `stable`. Snapshot every
threshold writes a Merkle manifest hash to the iNFT via
`updateMetadata`.

### Eleven orchestration patterns

The director picks one based on intent. Each is a typed step plan with a
specialist + tool budget.

`absorb` · `answer` · `daily-post` · `with-research` · `weekly-plan` ·
`dm-reply` · `audit-week` · `visual-post` · `sponsor-reply` ·
`weekly-review` · `clip-shorts`

Routing is a Qwen-2.5-7B LLM classifier (`intent-classifier.ts`) with a
regex fallback so a stuck classifier never blocks a request.

### 26 runner tools

| Group | Tools |
|---|---|
| Memory | `store`, `read_memory`, `search_memory`, `write_memory` |
| Workflow | `schedule`, `draft_post` |
| Compute | `transcribe`, `gen_image`, `analyze_image`, `find_clips` |
| Image | `image.edit`, `image.crop`, `image.resize`, `image.format`, `image.watermark` |
| Video | `video.trim`, `video.reframe`, `video.burn_caption`, `video.audio_enhance`, `video.scene_cuts`, `video.gif`, `video.thumbnail`, `video.concat`, `video.compress`, `video.probe`, `video.summarize` |

### On-chain surface (ERC-7857 TwinINFT)

- `mint(to, dataHash, encryptedURI, sealedKey)` — master twin
- `iCloneFrom(to, parent, …)` — specialists inherit memory pointer + provenance
- `safeTransferFrom(from, to, tokenId)` — wired in Specialist profile → Transfer button
- `delegateAccess(tokenId, hot)` — wired in Settings → Authorize orchestrator (uses real master tokenId from local mint history)
- `updateMetadata(tokenId, newDataHash, newURI)` — fired by `snapshot.ts` when memory delta crosses threshold
- `authorizeUsage(tokenId, user)` — exposed in ABI; UI surface deferred

### Three-layer chat context

Every chat call gets:

1. **Recent turns** — last 10 messages from the active thread
2. **Per-thread summary** — Qwen-rolled summary cached in `localStorage` once a thread crosses 12 messages
3. **RAG over memory** — per-word match against the user's typed slices, filtered to relevance

Specialists invoked via patterns also receive the user's chat history +
summary so they don't hallucinate prior context.

### SHIP / EDIT review gating

The Editor specialist outputs a strict `SHIP <draft>` or
`EDIT <revised draft>` verdict. `resolveFinalOutput` parses the verdict;
the WorkPane surfaces approve / reject. Approved drafts attribute back to
the original Writer.

### Wallet + onboarding

- **Privy** embedded wallet for auth + signing
- **Conversational 18-question onboarding** with idol-based voice traits (Naval, PG, Karpathy, etc.) and a 201-tweet demo pack
- **Onboarding gate**: any authenticated user without a `master` tokenId is redirected to `/onboarding` — login can't bypass setup
- **Reset Everything** in Settings wipes localStorage, server memory and Privy session in one click

---

## Honest scope: what's NOT shipped

We pulled or visibly disabled features we couldn't ship cleanly:

- **Per-specialist LoRA fine-tuning** — promised in earlier drafts; the prompt-engineered specialists carry the demo today
- **"Train new specialist"** flow — removed from the rail
- **Twitter / Spotify / LinkedIn / YouTube / Notion / Drive** OAuth ingest — surfaced as visibly-disabled rows in Settings → Connected sources with a `soon` tag, not as fake-working buttons
- **Private mode (TeeML routing)**, **multichain switching**, **handle ENS edit** — disabled with `soon` indicators
- **Royalty splits on usage** — out of scope for the demo

The principle: don't ship UI we can't deliver.

---

## Architecture

```
2in/
├── web/         Vite + React 18 SPA
│   ├── routes/      Landing · Onboarding · Chat · Memory · Specialist · Patterns · Tools · Library · Settings
│   ├── hooks/       useStreamingChat · useTaskStream · useMintRoster · useThreadSummary · useTwinNft …
│   ├── lib/         chain.js · privy-signer.js · api.js · routes.js
│   ├── components/  WorkPane · Composer · Questionnaire · TaskCard …
│   └── data/        specialists · idols · demo-tweets
├── server/      Fastify + TS + zod
│   ├── routes/      chat · task · memory · persona · feedback · chain · storage · twitter · tools · finetune
│   ├── services/    orchestrator · prompts · compute · storage · memory · snapshot · intent-classifier · idols · persona
│   └── services/tools/  4 memory + 1 workflow + 4 compute + 5 image + 11 video + 1 schedule
├── contracts/   Foundry — TwinINFT.sol (ERC-7857) + tests + deploy script
└── package.json root concurrently runner
```

### Persistence

- **Local dev (default)**: in-memory `Map<stream, Map<key, KvEntry>>` mirrored to `/tmp/2in-kv-state.json` with a 250 ms coalesced flush
- **Production / free-tier deploy**: set `MONGO_URI` and the same KV interface flips to a single MongoDB collection (`twin_kv`) with `{stream, key}` unique + `{stream, ts: -1}` indexes. Survives Render free-tier cold starts and redeploys.
- 0G Indexer for blob uploads (encrypted personality manifest); falls back to deterministic SHA256 hashes in mock mode.

### Mock fallbacks

Every external integration has a mock mode that fires when its env is
unset:

| Integration | Real path | Mock path |
|---|---|---|
| 0G Compute (Qwen, image-edit) | Router or Advanced API + bearer token | streamed canned responses |
| 0G Storage (Indexer) | `@0gfoundation/0g-ts-sdk` upload | `sha256(content)` hash, in-memory cache |
| Chain mints / transfers / delegate | viem + Privy embedded wallet | deterministic fake tx hashes + tokenIds, ~1.4 s simulated latency |
| Twitter ingest | OAuth 2.0 PKCE | demo tweet pack (201 tweets) |
| MongoDB | Atlas M0 | disk JSON file |

Pills label `mock` vs `chain · live` so the demo audience always knows
which path is firing.

---

## Quickstart (local)

```bash
# 1. install root + web + server deps
npm run install:all

# 2. configure
cp web/.env.example     web/.env
cp server/.env.example  server/.env
cp contracts/.env.example contracts/.env
#   web/.env    → set VITE_PRIVY_APP_ID
#   server/.env → optional: ZG_ROUTER_API_KEY, STORAGE_PRIVATE_KEY,
#                 CHAIN_PRIVATE_KEY, MONGO_URI, TWITTER_*

# 3. run both services together
npm run dev
#   web → http://localhost:5173
#   api → http://localhost:3001
```

## Deploy (free tier)

| Surface | Free host | Notes |
|---|---|---|
| Web | Vercel free | `cd web && vercel` — set `VITE_*` in dashboard |
| Server | Render free or Fly.io free | `Dockerfile`, `render.yaml`, `fly.toml` all in `server/` |
| Persistence | MongoDB Atlas M0 free | set `MONGO_URI` so memory survives cold starts |
| Chain | 0G Galileo testnet (free) | mints already deployed; reuse the contract address above |
| LLM + Storage | 0G Compute Router + Indexer | both free testnet |

The web app + Mongo combo runs **fully free**. Render free tier has a
~30 s cold-start tax after 15 min idle; switch to Fly.io free or Railway
to remove it.

## Track requirements ↔ what we deliver

| Requirement | Where it lives |
|---|---|
| Long-running goal-driven behaviour | `services/orchestrator.ts` — pattern executor with per-step tool composition |
| Persistent evolving memory | 6 typed slices in `services/storage.ts` (KV with disk or Mongo backend) + `snapshot.ts` writing `updateMetadata` to chain |
| Multi-agent swarm + collaboration | Director + 8 specialists, 11 patterns, live work-pane huddle (`WorkPane.jsx`) |
| Self-reflection / fact-checking | Editor specialist gates Writer drafts with strict `SHIP`/`EDIT` verdicts against the procedural slice (rejection memory) |
| iNFT with embedded intelligence (ERC-7857) | `contracts/TwinINFT.sol` — `mint`, `iCloneFrom`, `safeTransferFrom`, `updateMetadata`, `authorizeUsage`, `delegateAccess` |
| Emergent / novel paradigms | User-named director, idol-based voice seeding, 6-slice memory architecture, per-task pattern dispatch |

## Protocol features used

- **0G Chain (Galileo 16602)** — `TwinINFT` deployed and minting live
- **0G Compute · chat** — `qwen/qwen-2.5-7b-instruct` for director + specialists via Router or Advanced API
- **0G Compute · image edit** — `qwen/qwen-image-edit-2511` via `/v1/proxy/images/edits`
- **0G Storage · Indexer** — encrypted personality manifest uploads
- **0G Storage · gateway** — verify-on-storage permalinks
- **ERC-7857 iNFT** — `mint`, `iCloneFrom`, `safeTransferFrom`, `delegateAccess`, `updateMetadata`, `authorizeUsage`

## Demo (3 min)

1. **(0:00–0:30)** Cold open + onboarding — Privy login → 18-question conversational setup → name your twin → mint reveal (real tx hashes on Galileo, real tokenIds persisted)
2. **(0:30–1:30)** "Draft a sponsored tweet for the Acme deal" → director routes to `sponsor-reply` → work pane fills with live specialist + tool calls (Researcher → Writer → Editor verdict → ship)
3. **(1:30–2:00)** Approve → toast → memory write → snapshot threshold trips → `updateMetadata` lands → snapshot row appears on the Specialist profile
4. **(2:00–2:30)** Specialist profile iNFT panel — tokenId · parent · encryptedURI · dataHash · sealedKey · snapshot history (all `chain · live`); click Transfer → real `safeTransferFrom` tx
5. **(2:30–3:00)** Settings → Authorize orchestrator → real `delegateAccess` tx against the real master tokenId; DELEGATED pill in the rail flips on

## License

MIT.
