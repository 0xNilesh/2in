// Privy embedded wallet → viem WalletClient adapter.
//
// useViemWalletClient() returns { walletClient, ready, address, error }.
// Memoized per Privy wallet address. Auto-attempts a `wallet_switchEthereumChain`
// to Galileo on first acquisition; if the chain isn't known to the wallet,
// falls back to `wallet_addEthereumChain`.
//
// Returns null walletClient when:
//   - Privy isn't configured (useAuth().configured === false)
//   - user isn't authenticated
//   - no wallet attached yet
//   - chain id constants (VITE_CHAIN_*) aren't set — leaves us in mock mode

import { useEffect, useMemo, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom } from 'viem';
import { useAuth } from '../hooks/useAuth.js';
import { galileo, galileoChainIdHex } from './chain-spec.js';
import { isChainConfigured, chainConfig } from './chain.js';

export function useViemWalletClient() {
  const auth = useAuth();
  const wallets = useWalletsSafe();
  const wallet = wallets[0] ?? null;
  const [walletClient, setWalletClient] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setWalletClient(null);
    setReady(false);

    if (!auth.configured || !auth.authenticated || !wallet || !isChainConfigured()) {
      setReady(true);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const provider = await wallet.getEthereumProvider();
        // Best-effort chain switch. Privy embedded wallets normally honor
        // their configured chain; external wallets need this nudge.
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: galileoChainIdHex }],
          });
        } catch (err) {
          if (err?.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: galileoChainIdHex,
                chainName: galileo.name,
                nativeCurrency: galileo.nativeCurrency,
                rpcUrls: galileo.rpcUrls.default.http,
                blockExplorerUrls: [galileo.blockExplorers.default.url],
              }],
            });
          }
          // Otherwise swallow — the wallet might already be on the right
          // network and just refused redundant switching.
        }

        if (cancelled) return;
        const client = createWalletClient({
          account: wallet.address,
          chain: galileo,
          transport: custom(provider),
        });
        setWalletClient(client);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message ?? 'wallet_client_failed');
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [auth.configured, auth.authenticated, wallet?.address]);

  return useMemo(
    () => ({ walletClient, ready, address: wallet?.address ?? null, error, configured: isChainConfigured() }),
    [walletClient, ready, wallet?.address, error],
  );
}

// useWallets() throws when the PrivyProvider isn't mounted (no app id).
// Wrap so the rest of the hook keeps running.
function useWalletsSafe() {
  try {
    return useWallets().wallets ?? [];
  } catch {
    return [];
  }
}

// Re-export so callers can decide which path to take without importing both files.
export { isChainConfigured, chainConfig };
