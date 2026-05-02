// Resolves a 0G inference provider's service URL by reading getService()
// off the on-chain inference contract. One-shot, cached in-memory.
//
// Used when the user supplies ZG_PROVIDER_ADDRESS instead of ZG_PROVIDER_URL.
//
// We bypass ethers' Contract decoder entirely because the contract's return
// tuple shape varies per provider (TEE-verified ones add extra fields) and
// any ABI mismatch yields BAD_DATA. Instead we do a raw eth_call and parse
// just the field we need (url is the 3rd return), using standard ABI offset
// rules. This works regardless of how many trailing fields the contract emits.

import { ethers } from 'ethers';
import { config } from '../config.js';

// Per-address URL cache — multiple providers (chat + image-edit + ...) can
// coexist without thrashing.
const cache = new Map<string, string>();

// Function selector for getService(address) = keccak256("getService(address)")[:4]
const GET_SERVICE_SELECTOR = '0x21fe0f30';

export async function resolveProviderUrl(providerAddress: string): Promise<string> {
  const key = providerAddress.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const provider = new ethers.JsonRpcProvider(config.BROKER_RPC);

  // Hand-build the calldata: 4-byte selector + 32-byte address argument.
  const addrPadded = providerAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const callData = `${GET_SERVICE_SELECTOR}${addrPadded}`;

  const raw = await provider.call({ to: config.BROKER_INFERENCE_CA, data: callData });
  const url = decodeUrlFromGetService(raw);
  if (!url) throw new Error('inference contract returned empty URL for provider');

  const cleaned = url.replace(/\/$/, '');
  cache.set(key, cleaned);
  return cleaned;
}

/** Manually decode the `url` field (3rd return) from getService()'s ABI-
 *  encoded response. Standard tuple encoding:
 *    [0..32)    outer offset (0x20)
 *    [32..64)   provider address (1st return)
 *    [64..96)   serviceType offset (2nd return — string)
 *    [96..128)  URL offset (3rd return — string) ← we want this
 *    ...
 *  String content layout at the resolved offset:
 *    [..32)  length (uint256)
 *    [32..]  utf-8 bytes, right-padded
 *  Offsets are RELATIVE to the start of the tuple (the byte after the outer
 *  offset wrapper), per Solidity ABI spec.
 */
function decodeUrlFromGetService(rawHex: string): string {
  const hex = rawHex.startsWith('0x') ? rawHex.slice(2) : rawHex;
  // Each word is 32 bytes = 64 hex chars.
  const wordAt = (idx: number): string => hex.slice(idx * 64, (idx + 1) * 64);
  // Word 0 is the outer tuple wrapper (always 0x20). Tuple starts at word 1.
  // Inside the tuple: word 1 = provider address (head), word 2 = serviceType
  // offset (head, points to dynamic data area), word 3 = URL offset (head).
  const urlOffsetHex = wordAt(3);
  const urlOffsetBytes = parseInt(urlOffsetHex, 16);
  if (!Number.isFinite(urlOffsetBytes) || urlOffsetBytes <= 0) return '';
  // Offset is relative to tuple start (word 1). Convert to absolute hex char index.
  const tupleStartHexIdx = 64; // word 1
  const stringStartHexIdx = tupleStartHexIdx + urlOffsetBytes * 2;
  const lenHex = hex.slice(stringStartHexIdx, stringStartHexIdx + 64);
  const len = parseInt(lenHex, 16);
  if (!Number.isFinite(len) || len <= 0 || len > 4096) return '';
  const dataStart = stringStartHexIdx + 64;
  const dataEnd = dataStart + len * 2;
  const utf8Hex = hex.slice(dataStart, dataEnd);
  return Buffer.from(utf8Hex, 'hex').toString('utf8');
}
