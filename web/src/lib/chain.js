// Web chain layer. Two modes:
//
//   real → viem public client + Privy embedded wallet signer (when
//          VITE_CHAIN_CONTRACT_ADDRESS is set and the user is authed)
//   mock → deterministic fake tx hashes + tokenIds + realistic delays
//
// Same API either way. Components don't care which mode they're in.
//
// Helper functions:
//   isChainConfigured()                       → bool
//   getExplorerTokenUrl(tokenId)              → string
//   getExplorerTxUrl(txHash)                  → string
//   mintMaster({ encryptedURI, dataHash, sealedKey, signer? }) → { txHash, tokenId, status }
//   cloneSpecialist({ parentTokenId, encryptedURI, dataHash, sealedKey, signer? })

import { keccak256, stringToBytes } from 'viem';
import { TWIN_INFT_ABI } from './abi/twin-nft.js';

export const chainConfig = {
  contractAddress: import.meta.env.VITE_CHAIN_CONTRACT_ADDRESS ?? '',
  rpc: import.meta.env.VITE_CHAIN_RPC ?? 'https://evmrpc-testnet.0g.ai',
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 16602),
  explorer: import.meta.env.VITE_CHAIN_EXPLORER ?? 'https://chainscan-galileo.0g.ai',
};

export function isChainConfigured() {
  return Boolean(chainConfig.contractAddress);
}

export function getExplorerTokenUrl(tokenId) {
  const addr = chainConfig.contractAddress || '0x0000000000000000000000000000000000000000';
  return `${chainConfig.explorer}/token/${addr}?a=${tokenId}`;
}

export function getExplorerTxUrl(txHash) {
  return `${chainConfig.explorer}/tx/${txHash}`;
}

const galileo = {
  id: chainConfig.chainId,
  name: 'galileo',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: [chainConfig.rpc] } },
};

let _publicClientPromise = null;
async function getPublicClient() {
  if (!_publicClientPromise) {
    _publicClientPromise = (async () => {
      const { createPublicClient, http } = await import('viem');
      return createPublicClient({ chain: galileo, transport: http(chainConfig.rpc) });
    })();
  }
  return _publicClientPromise;
}

// === public reads ====================================================
export async function readTwin(tokenId) {
  if (!isChainConfigured()) return null;
  const client = await getPublicClient();
  try {
    const [owner, dataHash, encryptedURI, sealedKey, parent, delegate] = await client.readContract({
      address: chainConfig.contractAddress,
      abi: TWIN_INFT_ABI,
      functionName: 'getTwin',
      args: [BigInt(tokenId)],
    });
    return {
      tokenId,
      owner,
      dataHash,
      encryptedURI,
      sealedKey,
      parentTokenId: Number(parent),
      delegate,
      source: 'chain',
    };
  } catch {
    return null;
  }
}

// === mint flows ======================================================
// Each helper returns { txHash, tokenId, status, explorerUrl }.
// In real mode: submit tx via the provided viem WalletClient signer,
// wait for receipt, decode the TwinMinted event, return tokenId.
// In mock mode: generate a deterministic tx hash, fake an incrementing
// tokenId, simulate ~1.4s confirmation latency.

let _mockNextTokenId = 42;

export async function mintMaster({ to, encryptedURI, dataHash, sealedKey, signer }) {
  if (!isChainConfigured() || !signer) {
    return mockMintTx('mint', { to, encryptedURI, dataHash });
  }
  return realWrite({
    signer,
    functionName: 'mint',
    args: [to, dataHash ?? zeroHash(encryptedURI), encryptedURI ?? '', sealedKey ?? '0x'],
    extractTokenId: true,
  });
}

export async function cloneSpecialist({ to, parentTokenId, encryptedURI, dataHash, sealedKey, signer }) {
  if (!isChainConfigured() || !signer) {
    return mockMintTx('iCloneFrom', { to, parentTokenId, encryptedURI, dataHash });
  }
  return realWrite({
    signer,
    functionName: 'iCloneFrom',
    args: [to, BigInt(parentTokenId), dataHash ?? zeroHash(encryptedURI), encryptedURI ?? '', sealedKey ?? '0x'],
    extractTokenId: true,
  });
}

// === real path ======================================================
async function realWrite({ signer, functionName, args, extractTokenId }) {
  const client = await getPublicClient();
  const txHash = await signer.writeContract({
    address: chainConfig.contractAddress,
    abi: TWIN_INFT_ABI,
    functionName,
    args,
    chain: galileo,
  });
  // Wait for confirmation, then decode TwinMinted event for tokenId.
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  let tokenId = null;
  if (extractTokenId) {
    // Decode the first TwinMinted log we own
    const { decodeEventLog } = await import('viem');
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: TWIN_INFT_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === 'TwinMinted') {
          tokenId = Number(ev.args.tokenId);
          break;
        }
      } catch {
        // not our event — keep looking
      }
    }
  }
  return {
    txHash,
    tokenId,
    status: 'confirmed',
    explorerUrl: getExplorerTxUrl(txHash),
  };
}

// === mock path ======================================================
function mockMintTx(_op, payload) {
  // Stable-looking 32-byte hex hash from the payload + a tiny salt so
  // each mock mint is unique within the session.
  const salt = ++_mockNextTokenId;
  const seed = `${_op}:${salt}:${JSON.stringify(payload ?? {})}`;
  const txHash = keccak256(stringToBytes(seed));
  const tokenId = salt;
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        txHash,
        tokenId,
        status: 'confirmed',
        explorerUrl: getExplorerTxUrl(txHash),
      });
    }, 900 + Math.random() * 700);
  });
}

function zeroHash(uri) {
  // Deterministic placeholder dataHash when the caller didn't compute one.
  return keccak256(stringToBytes(`uri:${uri ?? ''}`));
}
