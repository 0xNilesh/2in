<p align="center">
  <img src="https://2in.vercel.app/brand/logo.svg" alt="2in" width="120" height="120" />
</p>

<h1 align="center">2in</h1>

<p align="center">
  A digital twin you actually own — a director + roster of role-typed
  specialist iNFTs that draft, research, edit and remember in your voice,
  backed end-to-end by the 0G stack (Chain · Compute · Storage).
</p>

| | |
|---|---|
| **Live demo** | https://2in.vercel.app |
| **Demo video (≤ 3 min)** | _add YouTube / Loom URL after recording_ |
| **TwinINFT contract (Galileo · 16602)** | [`0xf454c04ee5365f9a195a00267e4a1dba6a7b9395`](https://chainscan-galileo.0g.ai/address/0xf454c04ee5365f9a195a00267e4a1dba6a7b9395) |
| **Live minted iNFT (master twin · example)** | [`tokenId 19`](https://chainscan-galileo.0g.ai/token/0xf454c04ee5365f9a195a00267e4a1dba6a7b9395?a=19) — owner's master, snapshot history visible on chain |
| **Explorer** | https://chainscan-galileo.0g.ai |
| **Source** | this repo |

---

## What is 2in?

You name the **director** during onboarding (we suggest names, you pick).
Behind it sit eight specialists — five core, three opt-in — each minted as
its own ERC-7857 iNFT under your wallet:

| Specialist | Tier | Reads slices | Writes slices | Role |
|---|---|---|---|---|
| **Writer** | core | semantic + episodic + temporal | episodic | Drafts posts, replies, captions |
| **Researcher** | core | episodic + temporal | semantic + episodic | Pulls facts, performance signals, audience |
| **Editor** | core | procedural + semantic | procedural | Final pass · gates against past rejections |
| **Strategist** | core | temporal + episodic | temporal | Cadence · weekly themes · "should I post this now?" |
| **Companion** | core | relationship + semantic | semantic + relationship | Personal memory · "remember this" |
| **Voice** | opt-in | semantic + episodic | episodic | Spoken cadence for podcast / video scripts |
| **Visual** | opt-in | semantic | episodic | Image gen + analysis |
| **Negotiator** | opt-in | relationship + procedural | relationship | Sponsor replies + deal terms |

The director picks an orchestration pattern per request, dispatches the
right specialists, and reports back. Memory grows with every shipped output;
snapshots back to chain via `updateMetadata`. Every conversation is also
snapshotted as JSON to 0G Storage so cross-device restore works without
any external DB.

---

## Six typed memory slices

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
`updateMetadata`. Each entry is a JSON document (~280 chars text + meta)
keyed by `id` inside a 0G KV stream named `twin:<tokenId>:mem:<slice>`.

---

## Eleven orchestration patterns

The director picks one based on intent. Each is a typed step plan with a
specialist + tool budget.

`absorb` · `answer` · `daily-post` · `with-research` · `weekly-plan` ·
`dm-reply` · `audit-week` · `visual-post` · `sponsor-reply` ·
`weekly-review` · `clip-shorts`

Routing is a Qwen LLM classifier (`server/src/services/intent-classifier.ts`)
with a regex fallback so a stuck classifier never blocks a request. The
director's plan, every tool call, every cost, and the final draft all stream
to the WorkPane in real time over SSE.

---

## 26 runner tools

| Group | Tools |
|---|---|
| Memory | `store`, `read_memory`, `search_memory`, `write_memory` |
| Workflow | `schedule`, `draft_post` |
| Compute | `transcribe`, `gen_image`, `analyze_image`, `find_clips` |
| Image | `image.edit`, `image.crop`, `image.resize`, `image.format`, `image.watermark` |
| Video | `video.trim`, `video.reframe`, `video.burn_caption`, `video.audio_enhance`, `video.scene_cuts`, `video.gif`, `video.thumbnail`, `video.concat`, `video.compress`, `video.probe`, `video.summarize` |

22 of 26 work end-to-end on Galileo testnet today (image editing via the
real `qwen-image-edit-2511` provider, all ffmpeg ops via the bundled
binary). The 4 mainnet-only ones (`transcribe`, `gen_image`,
`analyze_image`, `video.summarize`) are visibly disabled in the Tools page
with a `needs 0G mainnet · soon` pill — same honesty pattern as the
Settings → Connected sources section.

---

## The 0G stack — what we use and how

We don't depend on _any_ external DB or persistent disk. The whole product
is on 0G + Privy embedded wallets.

### 0G Chain (Galileo · 16602)

- **TwinINFT.sol** (`contracts/src/TwinINFT.sol`) — ERC-7857 iNFT
  reference implementation deployed at
  `0xf454c04ee5365f9a195a00267e4a1dba6a7b9395`.
- Methods used end-to-end in production:
  - `mint(to, dataHash, encryptedURI, sealedKey)` — master twin
  - `iCloneFrom(to, parent, …)` — specialists inherit memory pointer + provenance
  - `safeTransferFrom(from, to, tokenId)` — wired in Specialist profile → Transfer button
  - `delegateAccess(tokenId, hot)` — wired in Settings → Authorize orchestrator (real master tokenId from local mint history)
  - `updateMetadata(tokenId, newDataHash, newURI)` — fired by `snapshot.ts` when memory delta crosses threshold
  - `authorizeUsage(tokenId, user)` — exposed in ABI; UI surface deferred
- Mints fired sequentially with explicit nonce tracking via
  `getPendingNonce()` so back-to-back specialist mints in the onboarding
  reveal don't collide on the same nonce.
- Receipts polled with tolerance for Galileo indexer lag — even when the
  receipt isn't indexed within 120 s the tx is treated as `confirmed`
  (the on-chain state is what matters; the explorer link still works).

### 0G Compute

- **Director + specialist chat** — `qwen/qwen-2.5-7b-instruct` via the
  Router (single endpoint, bearer token) or Advanced API (per-provider
  URL). Streamed over SSE to the client.
- **Image editing** — `qwen/qwen-image-edit-2511` via the dedicated
  `/v1/proxy/images/edits` multipart endpoint with a separate provider
  bearer token (the chat token doesn't work on the image endpoint).
- **Intent classification** — same Qwen chat model, called as a tight
  short-context completion to pick a pattern from the catalog.
- **Persona extraction** — Qwen call seeded with the user's questionnaire
  + idol corpus, returns a structured voice profile that gets written to
  semantic memory at onboarding.
- Mainnet-only providers we surface but don't yet wire:
  `openai/whisper-large-v3` (transcribe), `z-image` (text-to-image),
  `qwen/qwen3-vl-30b-a3b-instruct` (vision Q&A).

### 0G Storage

The whole persistence layer rides 0G — there is no disk fallback, no
external DB. Server refuses to boot without `STORAGE_PRIVATE_KEY`.

**Three primitives in play:**

1. **Indexer** (`@0gfoundation/0g-ts-sdk` `Indexer.upload`) — blob upload.
   Uses `selectNodes(replicas)` to discover storage nodes dynamically; the
   FixedPriceFlow contract address is read at boot from the storage node's
   `getStatus().networkIdentity.flowAddress` so we never hard-code per-network
   contract addresses.
2. **KV streams** (`Batcher` + `StreamDataBuilder` + `KvClient`) — typed
   memory slices, persona seeds, feedback records, conversation snapshot
   pointers. Append-only and versioned. Writes batch into a single
   `Batcher.exec()` per flush → one `FixedPriceFlow.submit()` tx →
   anchored on chain.
3. **FixedPriceFlow** — the chain-side contract every storage tx settles
   through. Each batched flush is one paid tx; `Batcher.exec()` returns
   `{txHash, rootHash}` we surface in the UI.

**ZeroGKvBackend** (`server/src/services/storage.ts`) — the layer that
makes 0G KV usable as a hot store:

```
                   ┌────────── reads ──────────┐
                   │                            │
 service code → storage.{readKv,listKv} → in-process Map cache  (instant)
                                            ↑
                                     hydrated on cold boot from
                                     latest Indexer cache snapshot blob
                                     (~1 s vs ~30 s iterator scan)

                                            ↓ (writes)
 service code → storage.{writeKv,…}  → cache.set + queue.push
                                            ↓ (3 s coalesce OR 10 entries)
                                     Batcher.exec()
                                            ↓
                                  FixedPriceFlow.submit() tx
                                            ↓
                                  Storage nodes hold (streamId, key, value)

 every flush also triggers (per hackathon-demo cadence):
                                     uploadBlob(JSON.stringify(cache))
                                            ↓
                                  Indexer rootHash anchored at
                                  `twin:<id>:meta:cache-snapshot` in KV
```

**Why a snapshot blob instead of iterator hydration?** A 0G KV
`newIterator()` scan is one RPC per entry (~50–200 ms), so cold-booting
on Render free tier with ~50 entries × 6 slices would take 30+ s — a
non-starter. A single Indexer blob fetch hydrates the entire cache in
~1 s, and the rolling snapshot pointer (`twin:<id>:meta:cache-snapshot`)
fits in one fast `getValue` call.

Every chat message triggers a debounced (1.5 s) snapshot upload:

1. Client serialises `{id, title, createdAt, updatedAt, messages, tasks}`
   — including the cached work-pane state for every `taskRef` in the
   thread (so Writer drafts, Researcher bullets, costs, and tool call
   chains all round-trip through 0G, not just the message stream).
2. `POST /api/chat/snapshot` → server uploads via Indexer → returns
   `rootHash`.
3. Server writes `twin:<tokenId>:thread:<threadId>` → `{rootHash, ts, msgCount}`
   in 0G KV. The `gatewayUrl` is _derived on read_ from current
   `STORAGE_GATEWAY` config so env changes propagate without rewriting
   old pointers.
4. `GET /api/chat/threads?twin=<id>` lists every thread pointer for that
   twin → the Settings → Conversation log card renders the full list with
   live 8 s refresh, msgCount, and clickable rootHash.
5. **Cross-device restore**: a fresh browser with empty `2in:threads`
   localStorage hits `/api/chat/threads`, downloads each blob from the
   gateway, repopulates `2in:threads` (metadata) + `2in:thread-ext`
   (per-thread messages) + every `2in:task:<id>` (work-pane state).
   Console logs `[threads] restored N thread(s) + M task(s) from 0G Storage`.

A `keepalive: true` fetch on component unmount guarantees in-flight
snapshots survive page navigation.

### What lives on 0G vs in-browser

| State | Where it lives |
|---|---|
| iNFT ownership / mint history | 0G Chain (TwinINFT contract) |
| Memory entries (6 slices) | 0G KV (`twin:<id>:mem:<slice>`) |
| Persona seed + feedback records | 0G KV (`twin:<id>:slice:*`) |
| Snapshot history | 0G KV + on-chain `updateMetadata` events |
| Cache hydration snapshot | 0G Indexer blob, pointer in 0G KV |
| Conversation messages | 0G Indexer blob per snapshot, pointer in 0G KV |
| Task work-pane state | bundled into the thread snapshot blob |
| Active UI cache (rail, mints, onboarding draft) | browser `localStorage` (regenerable from 0G) |

Browser `localStorage` is purely a **client-side cache**. Wipe it and
everything important re-hydrates from 0G on next mount.

---

## Architecture

### Repo layout

```
2in/
├── web/                       Vite + React 18 SPA (Vercel)
│   ├── public/brand/          logo.svg + logo-knockout.svg
│   ├── src/routes/            Landing · Onboarding · Chat · Memory · Specialist · Patterns · Tools · Library · Settings
│   ├── src/hooks/             useStreamingChat · useTaskStream · useMintRoster · useThreadSummary · useTwinNft · useThreads · useAuth …
│   ├── src/lib/               chain.js · privy-signer.js · api.js · routes.js · format.js · sse.js · twitter-archive.js
│   ├── src/components/        WorkPane · Composer · Questionnaire · TaskCard · Rail · Avatar · TokenChip · StatusPill …
│   ├── src/data/              specialists · idols · demo-tweets · mainnet-tools
│   └── src/styles/            tokens.css · landing.css · chat.css · rail.css · …
│
├── server/                    Fastify + TS + zod (Render / Fly.io / any Node host)
│   ├── src/index.ts
│   ├── src/config.ts          single-source env validation (zod)
│   ├── src/routes/            chat · task · memory · persona · feedback · chain · storage · twitter · tools · finetune · upload
│   ├── src/services/
│   │   ├── orchestrator.ts    pattern executor + per-step tool composition
│   │   ├── prompts.ts         director + specialist + editor system prompts
│   │   ├── compute.ts         0G compute (Router/Advanced/broker) wrapper
│   │   ├── storage.ts         ZeroGKvBackend + Indexer blob upload + cache snapshot
│   │   ├── memory.ts          typed memory slice helpers
│   │   ├── snapshot.ts        memory delta → updateMetadata on chain
│   │   ├── intent-classifier.ts  Qwen-driven pattern picker
│   │   ├── chain.ts           server-side TwinINFT writes
│   │   ├── persona.ts         questionnaire → memory seeding
│   │   ├── encryption.ts      sealed-key + dataHash helpers
│   │   ├── idols.ts           voice anchor whitelist
│   │   └── tools/             4 memory + 2 workflow + 4 compute + 5 image + 11 video
│   └── Dockerfile · render.yaml · fly.toml
│
├── contracts/                 Foundry — TwinINFT.sol (ERC-7857) + tests + deploy script
│   └── script/Deploy.s.sol
│
└── package.json               root concurrently runner (`npm run dev` boots web + server)
```

### Swarm coordination — how the agents talk

The director and the eight specialists never share a freeform conversation —
all coordination is **typed, mediated by the orchestrator, and routed
through 0G KV memory** so it's auditable + restorable. Concretely:

```
user message
    ↓
director (Qwen) reads:
   - last 10 turns of the thread
   - per-thread summary (Qwen-rolled, cached client-side)
   - RAG over 0G-KV memory (per-word match across slices)
    ↓
intent-classifier picks one of 11 patterns (or director names it directly)
    ↓
orchestrator.ts walks the pattern's typed step plan:

   step 1 → Researcher
              reads:  episodic + temporal slices       (0G KV)
              writes: semantic + episodic slices       (0G KV)
              passes summary + chat history to Qwen
              emits StepResult with cost + tool calls
    ↓
   step 2 → Writer
              reads:  semantic + episodic + temporal   (0G KV)
              + reads Researcher's StepResult from working memory
              writes: episodic                         (0G KV)
    ↓
   step 3 → Editor (only on patterns that need it)
              reads:  procedural (rejection ledger) + semantic
              outputs SHIP <draft>  OR  EDIT <revised draft>
              writes: procedural                       (0G KV)
    ↓
WorkPane streams every step + cost + memory delta over SSE
    ↓
user approves → final attribution to Writer (not Editor)
              → procedural memory write                (0G KV)
              → snapshot threshold tripped?
                    yes → updateMetadata(tokenId, dataHash, encryptedURI)
                    on chain (0G Chain)
```

**Three coordination invariants:**

1. **No specialist talks to another specialist directly.** Everything flows
   through the director's typed step plan and through the shared 0G-KV
   memory. Each StepResult is a structured object passed to the next step,
   not free text.
2. **Memory access is typed at the role level** (see the roster table). The
   Writer cannot write to procedural; only the Editor can. The Researcher
   cannot write to relationship; only the Companion can. This prevents
   cross-pollination of memory provenance and keeps slice integrity.
3. **Every coordination step is provable.** The pattern + step + memory
   delta + tx hash all stream over SSE to WorkPane and persist via the
   conversation snapshot to 0G Indexer — so judges can reconstruct the
   full agent dialogue from the on-chain pointer alone.

Patterns are versioned in `services/orchestrator.ts`; new ones require a
typed step plan + per-step memory access whitelist. The Qwen
intent-classifier is the routing fallback; explicit pattern names from the
director short-circuit it.

### Three-layer chat context

Every chat call assembles three layers of context before the model sees it:

1. **Recent turns** — last 10 messages from the active thread
2. **Per-thread summary** — Qwen-rolled summary cached in `localStorage`
   once a thread crosses 12 messages (`useThreadSummary`)
3. **RAG over memory** — per-word match against the user's typed slices,
   filtered to relevance, served via `memoryRetrieve(query, slices)`

Specialists invoked via patterns also receive the user's chat history +
summary so they don't hallucinate prior context. The director's system
prompt is templated with the live tool catalog so it can pick attachment-
driven media tools without separate routing.

### SHIP / EDIT review gating

The Editor specialist outputs a strict `SHIP <draft>` or
`EDIT <revised draft>` verdict. `resolveFinalOutput()` parses the verdict;
the WorkPane surfaces approve / reject. Approved drafts attribute back to
the original Writer (not Editor), and the approval writes to procedural
memory so future drafts see what passed before.

### Wallet + onboarding

- **Privy** embedded wallet for auth + signing — no MetaMask required.
- **Conversational 18-question onboarding** with idol-based voice traits
  (Naval, PG, Sam Altman, Karpathy, Patrick Collison, Shaan Puri,
  David Perell, Jack Altman) and a 201-tweet demo pack. Mandatory before
  the user can reach `/chat`.
- **Onboarding gate** (`AppShell` guard): any authenticated user without
  a `master` tokenId in `2in:mints` is redirected to `/onboarding` —
  login can't bypass setup.
- **Reset Everything** in Settings wipes localStorage, all 6 memory slices
  on the server, and the Privy session in one click.

### Mint flow

```
Onboarding step 4 → useMintRoster → start()
      │
      ├─ mintMaster(to, encryptedURI, dataHash, sealedKey, signer, nonce)
      │    └─ realWrite via viem → TwinINFT.mint() → tx → tokenId
      │
      └─ for each of 5 specialists:
            cloneSpecialist(parentTokenId, encryptedURI, ..., nonce)
              └─ realWrite via viem → TwinINFT.iCloneFrom() → tx → tokenId
            (nonce explicit + incremented per loop iter — bypasses Privy
             local nonce manager which lags chain state)

after each row confirms → row.status = 'confirmed' + tokenId stored
after all rows done → persistMints() → localStorage `2in:mints`
                       ↓
              every Specialist profile + Rail row reads real tokenId from here
```

### Snapshot loop (memory → chain)

```
specialist or chat writes → memory.write(slice, value, attribution)
                                ↓
                          storage.writeKv (0G KV) + cache update
                                ↓
                          snapshot.ts watches per-twin write deltas
                                ↓
                       threshold crossed (3 writes / 24 h):
                                ↓
                       build Merkle manifest of slice contents
                                ↓
                       chain.updateMetadata(tokenId, newDataHash, newURI)
                                ↓
                  Specialist profile snapshot history appends
```

---

## Future scope

Where the product is heading once the hackathon scope ships. Every item
below has a placeholder surface in the UI today (visibly disabled with a
`soon` tag) so users can see the roadmap without us pretending it works.

- **Per-specialist LoRA fine-tuning** — train a tiny adapter per specialist on the user's typed slice + chat corpus, ship via 0G Compute fine-tune; current prompt-engineered specialists become the cold-start baseline.
- **Custom specialist creation** — name + base prompt + memory-slice routing → `iCloneFrom` mints a new role-typed iNFT under the user's wallet. Lays the groundwork for a marketplace of community specialist templates.
- **Direct social ingest** (Twitter / LinkedIn / Substack / YouTube / Spotify / Instagram / Notion / Google Drive) — replace the manual archive drop with OAuth pipes that keep the corpus fresh. Each source is already wired to a target specialist (e.g. YouTube transcripts → Voice).
- **Mainnet compute models** — `openai/whisper-large-v3` (transcribe), `z-image` (text-to-image), `qwen/qwen3-vl-30b-a3b-instruct` (vision Q&A + `video.summarize`). The Tools-page rows already show the model id + pricing so the wiring is one provider URL away.
- **Private mode (TeeML routing)** — route every Compute call through TEE-attested providers + verify signatures client-side. Settings toggle is built; needs the TeeML provider list.
- **Multichain switching** — Galileo today, expand once 0G mainnet is live and other chains are bridged.
- **Handle / ENS resolution** — display the user's ENS or chosen handle in place of the truncated address.
- **`authorizeUsage()` royalty flow** — per-twin authorization for paid third-party access, with usage telemetry feeding a revenue split. ABI is exposed; UI + accounting layer pending.
- **Conversation log on 0G DA** — once the DA disperser exposes a public testnet endpoint or a JS SDK lands, swap the Indexer-blob substrate for the DA-Log primitive with no caller changes (the `storage.uploadBlob` interface already isolates it).

Principle throughout: don't ship UI we can't deliver — every "coming soon"
above is wired, just gated.

---

## Quickstart (local)

```bash
# 1. install root + web + server deps
npm run install:all

# 2. configure
cp web/.env.example     web/.env
cp server/.env.example  server/.env
cp contracts/.env.example contracts/.env

#   web/.env    → set VITE_PRIVY_APP_ID  (required for Privy auth)
#   server/.env → STORAGE_PRIVATE_KEY    (required — 0G wallet, fund via faucet)
#                 ZG_ROUTER_API_KEY      (required for real Compute)
#                 CHAIN_PRIVATE_KEY      (optional fallback for server-side chain writes)
#                 TWITTER_CLIENT_*       (optional — only for live Twitter ingest)

# 3. run both services together
npm run dev
#   web → http://localhost:5173
#   api → http://localhost:3001
```

The server **refuses to boot without `STORAGE_PRIVATE_KEY`** — there's no
disk or DB fallback, the storage layer is 100% on 0G. Fund the wallet
with a small amount of OG on Galileo testnet via
[the faucet](https://faucet.0g.ai); each batched KV flush is one paid tx.

---

## Deploy

| Surface | Host | Notes |
|---|---|---|
| Web | Vercel (https://2in.vercel.app) | Vite static build · `cd web && vercel` · set `VITE_*` env in dashboard |
| Server | Render / Fly.io / any Node host | `Dockerfile`, `render.yaml`, `fly.toml` all in `server/` |
| Persistence | 0G Storage | KV streams + Indexer cache snapshots — survives Render free-tier cold starts (~1 s hydration from snapshot blob) |
| Chain | 0G Galileo testnet (16602) | TwinINFT contract already deployed; reuse the address above |
| Compute | 0G Compute Router | bearer-token endpoint, no broker setup needed |

Web + 0G testnet runs **fully free**. Render free tier has a ~30 s
cold-start tax after 15 min idle (the dyno spinning back up — not our
code); switch to Fly.io free or Railway to remove it.

---

## Track requirements ↔ what we deliver

| Requirement | Where it lives |
|---|---|
| Long-running goal-driven behaviour | `services/orchestrator.ts` — pattern executor with per-step tool composition (11 patterns) |
| Persistent evolving memory via 0G Storage | 6 typed slices in `services/storage.ts` — 0G KV streams (writes batched to FixedPriceFlow) + Indexer cache snapshots for cold-start hydration |
| Conversation history on 0G Storage | Per-thread snapshot blobs uploaded to Indexer; pointers in 0G KV at `twin:<id>:thread:*`; cross-device restore via `/api/chat/threads` |
| Multi-agent swarm + collaboration | Director + 8 role-typed specialists, 11 patterns, live work-pane huddle (`WorkPane.jsx`) |
| Self-reflection / fact-checking | Editor specialist gates Writer drafts with strict `SHIP`/`EDIT` verdicts against the procedural slice (rejection memory) |
| iNFT with embedded intelligence (ERC-7857) | `contracts/src/TwinINFT.sol` — `mint`, `iCloneFrom`, `safeTransferFrom`, `updateMetadata`, `delegateAccess`, `authorizeUsage` |
| Composability + ownership | Each specialist is its own iNFT under the user's wallet — transferable, delegatable, snapshot-anchored |
| Emergent / novel paradigms | User-named director, idol-based voice seeding, 6-slice memory architecture, per-task pattern dispatch, conversation log on 0G Storage |

---

## Team

| Name | Role | Telegram | X |
|---|---|---|---|
| _Nilesh_ | _Dev_ | _@nileshgupta46_ | _@0xnilesh_ |

_Add your team here before submission._


---

## License

MIT.
