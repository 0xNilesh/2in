#!/usr/bin/env bash
# Deploy TwinINFT.sol to Galileo testnet.
#
# Two modes:
#   simulate (default) — runs the script locally without --broadcast.
#                        No tx is sent. Validates the env + script wiring.
#   broadcast          — actually sends the tx. Costs gas. Hard to revert.
#
# Required env (in contracts/.env):
#   DEPLOYER_PRIVATE_KEY=0x...      funded Galileo wallet
#   GALILEO_RPC=https://evmrpc-testnet.0g.ai
#
# Usage:
#   scripts/deploy-contract.sh           # simulate
#   scripts/deploy-contract.sh broadcast # send for real

set -euo pipefail

MODE="${1:-simulate}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/contracts"

if [[ ! -f .env ]]; then
  echo "❌ contracts/.env not found. Copy .env.example and fill DEPLOYER_PRIVATE_KEY."
  exit 1
fi

# shellcheck disable=SC1091
set -a
. ./.env
set +a

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "❌ DEPLOYER_PRIVATE_KEY missing in contracts/.env"
  exit 1
fi

# Use GALILEO_RPC from env, fall back to public endpoint.
RPC="${GALILEO_RPC:-https://evmrpc-testnet.0g.ai}"

echo "==> Building"
forge build 1>/dev/null

case "$MODE" in
  simulate)
    echo "==> Simulating Deploy.s.sol against $RPC (no --broadcast)"
    FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge script script/Deploy.s.sol:Deploy \
      --rpc-url "$RPC" \
      --private-key "$DEPLOYER_PRIVATE_KEY"
    ;;

  broadcast)
    read -r -p "About to broadcast a real tx on Galileo. Type 'yes' to confirm: " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
      echo "Aborted."
      exit 0
    fi
    echo "==> Broadcasting Deploy.s.sol against $RPC"
    # Galileo enforces a minimum priority fee of 2 gwei; legacy gas-price
    # path with 3 gwei is the simplest way to clear that floor.
    FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge script script/Deploy.s.sol:Deploy \
      --rpc-url "$RPC" \
      --broadcast \
      --legacy \
      --with-gas-price 3000000000 \
      --private-key "$DEPLOYER_PRIVATE_KEY" \
      | tee /tmp/2in-deploy.log

    # Extract the deployed address from broadcast/run-latest.json (chainId
    # subdir). foundry writes there for every broadcast.
    CHAIN_ID="${GALILEO_CHAIN_ID:-16602}"
    LATEST="broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
    if [[ -f "$LATEST" ]]; then
      ADDR=$(jq -r '.transactions[0].contractAddress // empty' "$LATEST")
      if [[ -n "$ADDR" ]]; then
        echo
        echo "✓ Deployed TwinINFT at: $ADDR"
        echo
        echo "Next: paste this into:"
        echo "  contracts/.env  → TWIN_INFT_GALILEO=$ADDR"
        echo "  server/.env     → CHAIN_CONTRACT_ADDRESS=$ADDR"
        echo "  web/.env        → VITE_CHAIN_CONTRACT_ADDRESS=$ADDR"
        echo
        echo "  And on production env stores:"
        echo "    vercel env add VITE_CHAIN_CONTRACT_ADDRESS production"
        echo "    (paste $ADDR when prompted)"
      fi
    fi
    ;;

  *)
    echo "Usage: $0 [simulate|broadcast]"
    exit 1
    ;;
esac
