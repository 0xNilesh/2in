# 2in — 3-Minute Demo Script

Narration in **bold**. Screen action in plain text. Total target 2:55 to land
under the 3-minute hackathon ceiling.

> **Setup before recording**
> - Live URL open in fullscreen (no devtools, no extensions)
> - Cookies cleared / private window so onboarding fires from step 1
> - One Galileo wallet ready in Privy (faucet-funded so the mint actually broadcasts)
> - `2in:corpus:twitter` cleared from localStorage so the demo button is the obvious path
> - Audio levels checked

---

## 0:00 — 0:30 · Cold open + onboarding

> **"Creators aren't paid for content. They're paid for packaging it across
> seven platforms. 2in fixes that — your digital twin, on-chain, working
> for you 24/7."**

- Land on `/` (the marketing landing). Camera slowly tracks the orbiting
  twin + four specialist tiles.
- Click **Mint your twin →**.
- **Step 1** — Privy login pops; sign in (wallet or email).
- **Step 2** — five social cards. Click the demo-tweets `Load demo →`.
  Persona panel populates: voice profile bullets · recurring themes ·
  inferred preferences. Mention briefly: **"This isn't just ingestion — it
  ran a statistical pass on the corpus and a voice-synthesis pass through
  GPT-OSS-120B on 0G Compute. The output seeded five typed memory slices."**
- **Step 3** — name the twin. Type **"Echo"**.
- **Step 4** — mint reveal. Five rows tick from `queued → submitting → minted`
  with explorer-link tx hashes. **"One master twin, four specialists. Each
  one is its own ERC-7857 iNFT. Real txs landing on Galileo right now."**
- **Step 5** — `Land in chat with Echo →`.

## 0:30 — 1:30 · The team huddle

> **"Echo is the director — picks the pattern, dispatches the specialists.
> Watch."**

- In the chat composer: **"draft a sponsored tweet for the Acme deal"**.
  Hit ⏎.
- Director streams its routing reply token-by-token. Mention:
  **"That's a real Compute call — server-sent events, broker auth headers,
  the works."**
- A `TaskCard` appears in the chat. Click it. Right pane slides in.
- WorkPane fills with live steps:
  - Step 1 · Scout · `search_memory(slice=relationship)` → result
  - Step 2 · Quill · `read_memory(slice=voice, limit=15)` → draft v1 streams
  - Step 3 · Mantle · `read_memory(slice=preference)` → flags two issues
  - Step 4 · Quill · revises on Mantle's notes
  - Step 5 · Mark · `search_memory(slice=rejection)` → ship
- **"Real tool calls — every one of those is hitting our 10-tool registry,
  zod-validated, executed, with the real result coming back on the bus."**

## 1:30 — 2:00 · Memory evolves

> **"The team gets better at your job — visibly."**

- In the WorkPane footer, click **Approve**. Toast top-right:
  `Approved · saved to quill's voice_memory · 1/3 writes until next snapshot`.
- Type a quick correction in chat: **"don't use exclamation marks"**. Hit
  the `+ save as preference` pill on the message. Toast:
  `Saved to preference_memory · 2/3 writes until next snapshot`.
- Open Memory page in the rail, click `preference_memory` slice, type
  **"keep drafts under 100 chars"**, click `+ Add entry`. Toast:
  `Snapshot fired · updateMetadata(#43) · preference +3`.
- **"Three writes in 24 hours triggers a snapshot — re-serialise the iNFT
  payload, push the new root hash on chain. The team carries that
  preference into every future draft."**

## 2:00 — 2:30 · Per-specialist fine-tune

> **"And when a specialist's corpus crosses threshold, it re-trains itself."**

- Back to chat. Banner is visible at the top of the stream: **"Quill is
  ready to be trained on 25 new tweets."** Click **Train Quill →**.
- FineTunePane slides in. Progress bar fills 0% → 100% over ~30 seconds.
  Status pill ticks `queued → training → delivered → live`.
- **"That's a 0G Compute fine-tune — Qwen2.5-0.5B base, LoRA adapter
  delivered, root hash baked into Quill's iNFT payload. Quill literally
  speaks in your voice from this point on, not just prompts to."**

## 2:30 — 3:00 · iNFT proof surface + close

> **"Last beat — the on-chain story."**

- In the rail, click **Quill** then the `↗` to her **profile**.
- Camera pans the iNFT panel:
  - tokenId `#43` · explorer link
  - parent `#42 (iCloneFrom)`
  - encryptedURI · dataHash · sealedKey holder
  - adapterURI (the one we just trained)
  - snapshot history table — the row from 1:50 sits at the top
- **"Every specialist is its own ERC-7857 iNFT under your wallet.
  Encrypted intelligence on 0G Storage, identity on 0G Chain, runtime on
  0G Compute. You own all of it. Transferable. Delegate-able. Yours."**
- Cut to the live URL. **"2in. Your team. Each one trained. Each one
  yours. All on 0G."**

---

## Cut-list (if you go over)

In priority order — drop the bottom items first:

1. (-15s) Skip Step 5 of onboarding, jump straight to chat.
2. (-20s) Skip the manual memory-page write — just Approve + chat
   correction is enough to trip the snapshot.
3. (-30s) Skip the fine-tune beat entirely. The snapshot loop already
   carries the "memory evolves" story; fine-tune is a bonus.

## Common gotchas during recording

- **Privy modal sits on top of the screen recorder's UI.** Resize the
  browser before opening Privy.
- **Toasts auto-dismiss at 4 s.** If you talk past one, take a beat then
  trigger the next action; don't try to keep them all on screen.
- **Onboarding step 4 mint reveal pace** depends on whether `signer` is
  ready. If you want the slower mock-mode pacing for narration, leave
  Privy unauthed during onboarding (the mock fallback's 1s/row is more
  legible than real tx confirmation latency).

## Backup data

If the recording wallet runs out of faucet 0G mid-take, fall back to mock
mode — clear `VITE_CHAIN_CONTRACT_ADDRESS` in Vercel and redeploy. Status
pills swap to `mock` but the demo flow is identical.
