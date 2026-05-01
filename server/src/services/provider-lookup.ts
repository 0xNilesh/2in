// Resolves a 0G inference provider's service URL by reading getService()
// off the on-chain inference contract. One-shot, cached in-memory.
//
// Used when the user supplies ZG_PROVIDER_ADDRESS instead of ZG_PROVIDER_URL.

import { ethers } from 'ethers';
import { config } from '../config.js';

// Minimal ABI fragment — only the getter we need.
const INFERENCE_ABI = [
  'function getService(address provider) view returns (address provider, string serviceType, string url, uint256 inputPrice, uint256 outputPrice, uint256 updatedAt, string model, string verifiability)',
] as const;

let cachedUrl: string | null = null;
let cachedFor: string | null = null;

export async function resolveProviderUrl(providerAddress: string): Promise<string> {
  if (cachedUrl && cachedFor === providerAddress.toLowerCase()) return cachedUrl;

  const provider = new ethers.JsonRpcProvider(config.BROKER_RPC);
  const contract = new ethers.Contract(config.BROKER_INFERENCE_CA, INFERENCE_ABI, provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await (contract as any).getService(providerAddress);
  const url: string = result.url ?? result[2];
  if (!url) throw new Error('inference contract returned empty URL for provider');

  cachedUrl = url.replace(/\/$/, '');
  cachedFor = providerAddress.toLowerCase();
  return cachedUrl;
}
