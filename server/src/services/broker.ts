// Singleton 0G Compute broker. Compute (chat) and FineTune both share one
// ledger / one wallet — instantiating two brokers would split the funds.
//
// Lazily initialised on first call to `getBroker()`. Returns `null` if no
// BROKER_PRIVATE_KEY — caller should branch to its mock path.

import { ethers } from 'ethers';
import { config } from '../config.js';

let brokerPromise: Promise<unknown> | null = null;

export function isBrokerConfigured(): boolean {
  return Boolean(config.BROKER_PRIVATE_KEY);
}

export async function getBroker(): Promise<unknown | null> {
  if (!isBrokerConfigured()) return null;
  if (!brokerPromise) {
    brokerPromise = init().catch((err) => {
      brokerPromise = null;
      throw err;
    });
  }
  return brokerPromise;
}

async function init(): Promise<unknown> {
  const provider = new ethers.JsonRpcProvider(config.BROKER_RPC);
  const wallet = new ethers.Wallet(config.BROKER_PRIVATE_KEY!, provider);
  const mod = await import('@0glabs/0g-serving-broker');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const create =
    m.createZGComputeNetworkBroker ??
    m.createZGServingNetworkBroker ??
    m.default?.createZGComputeNetworkBroker;
  if (typeof create !== 'function') {
    throw new Error('Broker SDK shape unrecognized; expected createZGComputeNetworkBroker(...)');
  }
  return await create(wallet);
}

// Reset for tests / restart-on-config-change.
export function resetBroker(): void {
  brokerPromise = null;
}
