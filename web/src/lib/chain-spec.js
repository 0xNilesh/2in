// Galileo testnet chain spec — shared between read client (lib/chain.js)
// and the Privy → viem signer adapter (lib/privy-signer.js).

export const galileo = {
  id: Number(import.meta.env.VITE_CHAIN_ID ?? 16602),
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_CHAIN_RPC ?? 'https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: 'Chainscan Galileo', url: import.meta.env.VITE_CHAIN_EXPLORER ?? 'https://chainscan-galileo.0g.ai' },
  },
};

// 0x-prefixed hex chainId for wallet_switchEthereumChain calls.
export const galileoChainIdHex = `0x${galileo.id.toString(16)}`;
