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
import { galileo } from './chain-spec.js';

export const chainConfig = {
  contractAddress: import.meta.env.VITE_CHAIN_CONTRACT_ADDRESS ?? '',
  rpc: galileo.rpcUrls.default.http[0],
  chainId: galileo.id,
  explorer: galileo.blockExplorers.default.url,
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
  // Galileo's RPC sometimes lags receipt indexing — viem's
  // waitForTransactionReceipt then errors with "no matching receipts found"
  // even though the tx confirmed. Wrap with our own polling loop that's
  // tolerant of the empty-receipt window. Up to 60s, polling every 2s.
  const receipt = await pollReceipt(client, txHash);
  let tokenId = null;
  if (extractTokenId && receipt) {
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

// Poll for a receipt with manual retries. Galileo's RPC frequently returns
// the cryptic "no matching receipts found: this may indicate potential
// data corruption" error for several seconds AFTER a tx is actually mined.
// We swallow that specific error and retry, falling through only on
// genuine timeouts.
async function pollReceipt(client, txHash, { maxMs = 60_000, intervalMs = 2_000 } = {}) {
  const deadline = Date.now() + maxMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const r = await client.getTransactionReceipt({ hash: txHash });
      if (r) return r;
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? '').toLowerCase();
      // Swallow the known transient errors; rethrow only if we hit something
      // genuinely structural.
      if (
        !msg.includes('no matching receipts') &&
        !msg.includes('not found') &&
        !msg.includes('invalid parameters') &&
        !msg.includes('data corruption')
      ) {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Last resort: try once more without the swallow so the user sees a real
  // error if something is genuinely wrong.
  if (lastErr) throw lastErr;
  throw new Error(`Tx ${txHash} not confirmed after ${Math.floor(maxMs / 1000)}s`);
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
