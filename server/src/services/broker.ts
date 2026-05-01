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
  // @ts-ignore — 2.0.0's package.json exports doesn't expose types, but the
  // SDK surface itself works at runtime. We use it loose-typed below.
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
  // Pass explicit Galileo contract addresses — the SDK's baked-in defaults
  // can drift from the live contracts.
  const broker = await create(
    wallet,
    config.BROKER_LEDGER_CA,
    config.BROKER_INFERENCE_CA,
    config.BROKER_FINETUNE_CA,
  );

  // First-time ledger funding. The broker calls revert if the wallet has no
  // ledger account yet — addLedger() (try) or createLedger() (fallback).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = broker as any;
  try {
    await b.ledger.getLedger();
    // ledger already exists, skip top-up
  } catch {
    try {
      const fund = config.BROKER_INITIAL_FUND_OG;
      // The 2.0.0 SDK signature is addLedger(amount: number) where amount is
      // measured in OG. Falls back to createLedger if the call shape differs.
      if (typeof b.ledger.addLedger === 'function') {
        await b.ledger.addLedger(fund);
      } else if (typeof b.ledger.createLedger === 'function') {
        await b.ledger.createLedger(fund);
      }
      // eslint-disable-next-line no-console
      console.info(`[broker] funded ledger with ${fund} 0G`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[broker] ledger setup failed: ${(err as Error).message}`);
    }
  }

  return broker;
}

// Reset for tests / restart-on-config-change.
export function resetBroker(): void {
  brokerPromise = null;
}
