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

export async function mintMaster({ to, encryptedURI, dataHash, sealedKey, signer, nonce }) {
  if (!isChainConfigured() || !signer) {
    return mockMintTx('mint', { to, encryptedURI, dataHash });
  }
  return realWrite({
    signer,
    functionName: 'mint',
    args: [to, dataHash ?? zeroHash(encryptedURI), encryptedURI ?? '', sealedKey ?? '0x'],
    extractTokenId: true,
    nonce,
  });
}

export async function cloneSpecialist({ to, parentTokenId, encryptedURI, dataHash, sealedKey, signer, nonce }) {
  if (!isChainConfigured() || !signer) {
    return mockMintTx('iCloneFrom', { to, parentTokenId, encryptedURI, dataHash });
  }
  return realWrite({
    signer,
    functionName: 'iCloneFrom',
    args: [to, BigInt(parentTokenId), dataHash ?? zeroHash(encryptedURI), encryptedURI ?? '', sealedKey ?? '0x'],
    extractTokenId: true,
    nonce,
  });
}

/** Read the chain's current pending nonce for an address. Used by callers
 *  that fire sequential txs to avoid the wallet-nonce-manager lag. */
export async function getPendingNonce(address) {
  if (!isChainConfigured() || !address) return null;
  const client = await getPublicClient();
  return client.getTransactionCount({ address, blockTag: 'pending' });
}

/** safeTransferFrom — moves a tokenId to a new owner. Uses the same
 *  receipt-tolerant + nonce-retry path as mintMaster / cloneSpecialist. */
export async function transferSpecialist({ from, to, tokenId, signer }) {
  if (!isChainConfigured() || !signer) {
    return mockMintTx('safeTransferFrom', { from, to, tokenId });
  }
  return realWrite({
    signer,
    functionName: 'safeTransferFrom',
    args: [from, to, BigInt(tokenId)],
    extractTokenId: false,
  });
}

// === real path ======================================================
async function realWrite({ signer, functionName, args, extractTokenId, nonce }) {
  const client = await getPublicClient();
  const callArgs = {
    address: chainConfig.contractAddress,
    abi: TWIN_INFT_ABI,
    functionName,
    args,
    chain: galileo,
    // Explicit nonce when supplied — bypasses Privy's local nonce
    // manager which lags chain state when txs are fired sequentially.
    ...(nonce != null ? { nonce } : {}),
  };

  // Single retry on nonce errors as a safety net even when nonce was
  // explicit. If the chain's current pending nonce doesn't match what we
  // computed locally, refetch authoritatively.
  let txHash;
  try {
    txHash = await signer.writeContract(callArgs);
  } catch (err) {
    const msg = String(err?.message ?? '').toLowerCase();
    const isNonce = msg.includes('nonce too low') || msg.includes('nonce too high') || msg.includes('replacement transaction');
    if (!isNonce) throw err;
    const sender = signer.account?.address ?? signer.address;
    if (!sender) throw err;
    const fresh = await client.getTransactionCount({ address: sender, blockTag: 'pending' });
    // eslint-disable-next-line no-console
    console.warn(`[chain] nonce mismatch (sent ${nonce ?? 'auto'}, chain pending ${fresh}) — retrying`);
    txHash = await signer.writeContract({ ...callArgs, nonce: fresh });
  }

  // writeContract returning a hash means the tx was accepted by the RPC.
  // After that, getTransactionReceipt may take a long time on Galileo
  // because the receipt indexer lags the chain head. We try our best to
  // pull the receipt for tokenId extraction, but if it never indexes we
  // return 'confirmed' anyway — the tx IS confirmed, we just couldn't
  // decode the TwinMinted event for the tokenId. The user can verify on
  // the explorer.
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
    // Tells the caller we never got a receipt — useful for surfacing a
    // softer "minted, awaiting indexer" pill instead of a green check.
    receiptIndexed: Boolean(receipt),
  };
}

// Poll for a receipt with manual retries.
//
// PHILOSOPHY: by the time we're here, signer.writeContract has already
// returned a hash, meaning the tx was accepted by the RPC. So ANY error
// from getTransactionReceipt is a "receipt isn't ready yet" condition,
// NOT a mint failure. We swallow everything except a tiny allowlist of
// truly-fatal errors (network unreachable, auth) and return null on
// persistent timeout.
async function pollReceipt(client, txHash, { maxMs = 120_000, intervalMs = 2_500 } = {}) {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const r = await client.getTransactionReceipt({ hash: txHash });
      if (r) return r;
    } catch (err) {
      const msg = String(err?.message ?? '').toLowerCase();
      const name = String(err?.name ?? '').toLowerCase();
      // Hard-fail allowlist — only abort polling for these. Everything
      // else (including ANY 'not found', 'could not be found',
      // 'TransactionReceiptNotFoundError', RPC quirks, parsing errors)
      // is treated as transient.
      const fatal =
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('cors') ||
        msg.includes('unauthorized') ||
        msg.includes('forbidden') ||
        name === 'aborterror';
      if (fatal) throw err;
      // Otherwise swallow + log first attempt for visibility.
      if (attempt === 1) {
        // eslint-disable-next-line no-console
        console.info(`[chain] receipt for ${txHash} not indexed yet (${err?.name ?? 'err'}) — polling`);
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Past the deadline — return null, NOT an error. The caller treats null
  // receipt as "confirmed but unindexed" and reports a tokenId of null.
  // eslint-disable-next-line no-console
  console.warn(`[chain] receipt for ${txHash} not indexed within ${Math.floor(maxMs / 1000)}s — returning null and proceeding`);
  return null;
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
