# `2in/contracts`

`TwinINFT.sol` — minimal ERC-7857 reference for the 2in roster. Each tokenId
is either a creator's **master twin** (`mint`) or a specialist cloned from it
(`iCloneFrom`). Encrypted intelligence (system prompt + LoRA adapter pointer
+ memory slice roots) lives on 0G Storage; the contract holds only the
pointers + integrity / sealed-key fields per §5.1 of `PLAN.md`.

## Layout

```
contracts/
├── foundry.toml
├── .env.example          required vars for deploy
├── src/TwinINFT.sol      the contract
├── script/Deploy.s.sol   deploy script
└── test/TwinINFT.t.sol   forge tests (7 passing)
```

## Build + test

```bash
forge install     # one-time, pulls forge-std + openzeppelin-contracts
forge build
forge test -vvv
```

## Deploy to Galileo testnet

```bash
cp .env.example .env
# fill DEPLOYER_PRIVATE_KEY (faucet: https://faucet.0g.ai → 0.1 0G/wallet/day)

source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url galileo \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY
```

The script prints the deployed address. Copy it into:
- `server/.env` → `CHAIN_CONTRACT_ADDRESS=...`
- `web/.env`    → `VITE_CHAIN_CONTRACT_ADDRESS=...`

When unset, the web + server fall back to mock mode: realistic-looking tx
hashes + canned token state, so the demo works without a live deployment.

## Re-export ABI after contract changes

The frontend bundles a static ABI at `web/src/lib/abi/twin-nft.js`. Re-run
after editing the contract:

```bash
forge inspect TwinINFT abi --json | (
  echo "// Auto-generated from contracts/src/TwinINFT.sol via forge inspect."
  echo "export const TWIN_INFT_ABI = $(cat);"
) > ../web/src/lib/abi/twin-nft.js
```

## What's intentionally not here

Per PLAN.md §13 risks, the full ERC-7857 transfer flow needs a TEE-verified
oracle to re-encrypt the sealed key for the new owner. We use OZ's default
`transferFrom` here so a TDX provider isn't required for the demo —
`_update` clears the per-token delegate on transfer as a placeholder.
Production swaps in `iTransferFrom(from, to, tokenId, OwnershipProof)` and
calls a real `TeeVerifier`; see `docs/TRANSFER_ORACLE.md` (TBD).
