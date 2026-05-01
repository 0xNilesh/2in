// Single source of truth for env. Throws at boot on invalid config — better
// than discovering it at first request.

import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  TWITTER_CLIENT_ID: z.string().optional(),
  TWITTER_CLIENT_SECRET: z.string().optional(),
  TWITTER_REDIRECT_URI: z.string().url().default('http://localhost:5173/onboarding'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // 0G Compute (broker). If BROKER_PRIVATE_KEY is unset, compute service runs
  // in mock mode (still streams over SSE; demo works without 0G funds).
  // 0G Compute — preferred is Router (single endpoint), but supports
  // Advanced mode too (per-provider URL). Pick ONE pair:
  //
  //   Router  → ZG_ROUTER_URL + ZG_ROUTER_API_KEY
  //   Advanced → ZG_PROVIDER_URL + ZG_ROUTER_API_KEY (key is provider-bound)
  //
  // When ZG_PROVIDER_URL is set, it takes precedence — endpoint becomes
  // ${ZG_PROVIDER_URL}/v1/proxy/chat/completions per the docs at
  // pc.testnet.0g.ai/api-reference (Advanced mode).
  ZG_ROUTER_URL: z.string().default('https://router-api-testnet.integratenetwork.work/v1/chat/completions'),
  ZG_PROVIDER_URL: z.string().optional(),
  // Alternative to ZG_PROVIDER_URL — paste the provider address (0x…) and
  // the server resolves the service URL via getService() on the inference
  // contract. One eth_call on first boot, cached after.
  ZG_PROVIDER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ZG_ROUTER_API_KEY: z.string().optional(),

  // Broker mode — wallet-signed per-call. Used only if ZG_ROUTER_API_KEY
  // isn't set. The 2.0.0 SDK has known setup issues; Router is preferred.
  BROKER_PRIVATE_KEY: z.string().optional(),
  BROKER_RPC: z.string().default('https://evmrpc-testnet.0g.ai'),
  DIRECTOR_MODEL: z.string().default('qwen/qwen-2.5-7b-instruct'),
  SPECIALIST_MODEL: z.string().default('qwen/qwen-2.5-7b-instruct'),
  // Galileo deployed compute contract addresses (PLAN.md §A). The broker
  // SDK has defaults baked in but they may go stale — overriding here
  // pins us to known-good values for this hackathon.
  BROKER_LEDGER_CA: z.string().default('0xE70830508dAc0A97e6c087c75f402f9Be669E406'),
  BROKER_INFERENCE_CA: z.string().default('0xa79F4c8311FF93C06b8CfB403690cc987c93F91E'),
  BROKER_FINETUNE_CA: z.string().default('0xaC66eBd174435c04F1449BBa08157a707B6fa7b1'),
  BROKER_INITIAL_FUND_OG: z.coerce.number().default(0.1),

  // 0G Storage. Same mock-fallback story: without STORAGE_PRIVATE_KEY,
  // uploads return deterministic fake hashes and KV is in-memory.
  STORAGE_PRIVATE_KEY: z.string().optional(),
  STORAGE_RPC: z.string().default('https://evmrpc-testnet.0g.ai'),
  STORAGE_INDEXER: z.string().default('https://indexer-storage-testnet-turbo.0g.ai'),
  STORAGE_GATEWAY: z.string().default('https://indexer-storage-turbo.0g.ai'),

  // Chain (TwinINFT). Without CHAIN_CONTRACT_ADDRESS, /api/chain/* serves
  // mock state so the demo works without a deployed contract.
  CHAIN_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  CHAIN_RPC: z.string().default('https://evmrpc-testnet.0g.ai'),
  CHAIN_ID: z.coerce.number().default(16602),
  CHAIN_EXPLORER: z.string().default('https://chainscan-galileo.0g.ai'),
  // Signer key for server-issued chain writes (snapshot-driven
  // updateMetadata). Falls back to STORAGE_PRIVATE_KEY in the chain
  // service so the demo works with a single .env key.
  CHAIN_PRIVATE_KEY: z.string().optional(),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const corsOrigins =
  config.CORS_ORIGINS.trim() === '*'
    ? true
    : config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

export const isProd = config.NODE_ENV === 'production';
