# 2in

Your digital twin · creator team of specialist iNFTs on 0G.

> **Track:** 0G APAC Hackathon — _Best Autonomous Agents, Swarms & iNFT Innovations_.

A creator's roster of specialist twins — Quill (Writer), Cadence (Voice),
Mantle (Legal), Mark (Editor), Scout (Researcher) — each minted as its own
ERC-7857 iNFT under the creator's wallet. The user-named **director** (the
"2in") picks an orchestration pattern per task, dispatches the right
specialists, and reports back. Memory evolves in real time and snapshots
land on chain as the team learns.

| | |
|---|---|
| **Live demo** | _add Vercel URL after deploy_ |
| **Demo video** | _add YouTube link after recording (≤ 3 min)_ |
| **TwinINFT contract (Galileo)** | _add address after `forge script ... --broadcast`_ |
| **Explorer** | https://chainscan-galileo.0g.ai |
| **Source** | this repo |
| **Team** | _add Telegram + X handles_ |

---

## Layout

```
2in/
├── web/         Vite + React 18 SPA — landing · onboarding · chat · memory · profile
├── server/      Fastify + TS API — Twitter OAuth · compute SSE · storage · chain reads · fine-tune · tools
├── contracts/   Foundry — TwinINFT.sol (ERC-7857 reference) + tests + deploy script
├── scripts/     deploy-contract.sh + future automation
├── DEPLOY.md    step-by-step from local to live
├── PLAN.md      master plan (architecture · success criteria)
├── JOURNEY.md   user journey (IA · onboarding · interaction flows)
└── package.json root orchestration via concurrently
```

## Quickstart (local)

```bash
# 1. install root + web + server deps
npm run install:all

# 2. configure
cp web/.env.example     web/.env
cp server/.env.example  server/.env
cp contracts/.env.example contracts/.env
#   → set VITE_PRIVY_APP_ID in web/.env
#   → set TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET in server/.env (optional)
#   → set DEPLOYER_PRIVATE_KEY in contracts/.env (only when deploying)

# 3. run both services together
npm run dev
#   web → http://localhost:5173
#   api → http://localhost:3001
```

Every external integration has a **mock fallback** that fires when the
relevant key is unset. The full app works end-to-end without any chain or
broker funding — pills label `mock` vs `chain · live` so demo audience
always knows which path is firing.

## Production deploy

See **`DEPLOY.md`** for the full step-by-step. Headline:

```
[1] forge script script/Deploy.s.sol --broadcast    →  TwinINFT contract
[2] vercel --prod                                    →  https://<your-app>.vercel.app
[3] render / fly / docker run                        →  https://<your-server>
[4] cross-wire VITE_API_BASE + CORS_ORIGINS
[5] curl /api/health and walk the live URL
```

## What ships in each phase

| Phase | What | Files |
|---|---|---|
| 1 — Compute | SSE chat streaming + multi-agent task orchestration | `server/src/services/{compute,prompts,orchestrator,bus}.ts`, `web/src/hooks/{useStreamingChat,useTaskStream}.js` |
| 2 — Storage + Memory | KV slices + Indexer uploads + persona extraction | `server/src/services/{storage,encryption,persona}.ts`, `routes/{storage,memory,persona}.ts` |
| 3 — Chain | TwinINFT contract + viem reads + live mint flow in onboarding | `contracts/`, `server/src/services/chain.ts`, `web/src/lib/chain.js`, `hooks/useMintRoster.js` |
| 4 — Fine-tune + Privy signer | Privy → viem WalletClient + 0G Compute fine-tune service + director banner | `web/src/lib/privy-signer.js`, `server/src/services/finetune.ts`, `web/src/components/FineTunePane.jsx` |
| 5 — Runner toolbox | 10 tools (memory · storage · workflow · compute) + live Tools page | `server/src/services/tools/`, `routes/tools.ts`, `web/src/routes/Tools.jsx` |
| 6 — Continuous learning | Approve/Reject feedback + snapshot loop + global toasts | `server/src/services/snapshot.ts`, `routes/feedback.ts`, `web/src/hooks/{useToasts,useSnapshotHistory}.js` |
| 7 — Deploy | Vercel + Render/Fly + Docker + DEPLOY.md | `web/vercel.json`, `server/{Dockerfile,render.yaml,fly.toml}`, `DEPLOY.md` |

## Track requirements ↔ what we deliver

| Requirement | Where it lives |
|---|---|
| Long-running goal-driven behaviour | Orchestrator pattern executor + per-step tool composition (`server/src/services/orchestrator.ts`) |
| Persistent evolving memory (KV + Log + on-chain snapshots) | Five typed memory slices on KV (`storage.ts`), Indexer uploads, snapshot loop (`snapshot.ts`) firing `updateMetadata` |
| Multi-agent swarm + collaboration | Director + 5 specialists, three patterns (`content-draft`, `with-legal-review`, `clip-shorts`), live work-pane huddle |
| Self-reflection / fact-checking | `with-legal-review` pattern: Mantle reviews → Quill revises → Mark gates against `rejection_memory` |
| iNFT with embedded intelligence (ERC-7857) | `TwinINFT.sol` — mint, iCloneFrom, updateMetadata, authorizeUsage, delegateAccess |
| Native per-specialist fine-tuning | `services/finetune.ts` wrapping 0G Compute fine-tune (Qwen2.5-0.5B base) |
| Royalty splits on usage | _intentionally cut from product scope — see PLAN.md §15_ |
| Emergent / novel paradigms | The user-named director (you choose the twin's name in onboarding) and the snapshot-driven memory evolution loop |

## Protocol features used

- **0G Chain** — `TwinINFT` (Galileo testnet 16602)
- **0G Compute · chat** — director + specialist inference via `@0glabs/0g-serving-broker` (Router mode)
- **0G Compute · fine-tuning** — `services/finetune.ts` over the broker's fine-tune surface
- **0G Storage · Indexer** — encrypted blob uploads (`services/storage.ts`)
- **0G Storage · KV streams** — typed memory slices per specialist
- **0G Storage · public gateway** — verify-on-storage permalinks throughout the UI
- **ERC-7857 iNFT** — `mint`, `iCloneFrom`, `authorizeUsage`, `delegateAccess`, `updateMetadata`

## Demo

See **`DEMO_SCRIPT.md`** (TBD on the next pass). Headline 3-min flow:

1. (0:00–0:30) Cold open + onboarding — Privy login → demo tweets → name your twin → mint reveal (real tx hashes on Galileo)
2. (0:30–1:30) "Draft a sponsored tweet for the Acme deal" → director picks `with-legal-review` → work pane fills with live tool calls (Scout · Quill · Mantle · Quill · Mark)
3. (1:30–2:00) Approve → toast → memory write to `voice_memory` → 3rd write trips snapshot → `updateMetadata` lands → snapshot history populates on profile
4. (2:00–2:30) Director banner: "Quill is ready to be retrained" → fine-tune fires → progress bar in slide-in pane → adapter delivered
5. (2:30–3:00) Specialist profile iNFT panel — tokenId · parent · encryptedURI · dataHash · sealedKey · adapter · snapshot history (all live · `chain · live` pill)

## License

MIT.
