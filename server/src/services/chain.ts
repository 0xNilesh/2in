// 0G Chain reads. Wraps a viem public client pointed at Galileo and exposes
// per-tokenId state (`getTwin`) + helpers. Mock fallback returns canned
// state when CHAIN_CONTRACT_ADDRESS is not set so the demo works without
// a deployed contract.

import { config } from '../config.js';
import { TWIN_INFT_ABI } from '../abi/twin-nft.js';

export interface TwinNftState {
  tokenId: number;
  owner: string;
  dataHash: string;
  encryptedURI: string;
  sealedKey: string;
  parentTokenId: number;
  delegate: string;
  explorerUrl: string;
  source: 'chain' | 'mock';
}

export interface ChainMode {
  kind: 'real' | 'mock';
  reason?: string;
  contractAddress: string | null;
  chainId: number;
}

class ChainService {
  private clientPromise: Promise<unknown> | null = null;

  get mode(): ChainMode {
    if (config.CHAIN_CONTRACT_ADDRESS) {
      return {
        kind: 'real',
        contractAddress: config.CHAIN_CONTRACT_ADDRESS,
        chainId: config.CHAIN_ID,
      };
    }
    return {
      kind: 'mock',
      reason: 'CHAIN_CONTRACT_ADDRESS not set — running in mock mode',
      contractAddress: null,
      chainId: config.CHAIN_ID,
    };
  }

  explorerUrl(tokenId: number): string {
    const addr = this.mode.contractAddress ?? '0x0000000000000000000000000000000000000000';
    return `${config.CHAIN_EXPLORER}/token/${addr}?a=${tokenId}`;
  }

  txExplorerUrl(txHash: string): string {
    return `${config.CHAIN_EXPLORER}/tx/${txHash}`;
  }

  async getTwin(tokenId: number): Promise<TwinNftState | null> {
    if (this.mode.kind === 'mock') {
      return mockTwin(tokenId, this.explorerUrl(tokenId));
    }
    return this.realGetTwin(tokenId);
  }

  // === real backend ============================================
  private async client(): Promise<unknown> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { createPublicClient, http } = await import('viem');
        return createPublicClient({
          chain: { id: config.CHAIN_ID, name: 'galileo', nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 }, rpcUrls: { default: { http: [config.CHAIN_RPC] } } } as never,
          transport: http(config.CHAIN_RPC),
        });
      })();
    }
    return this.clientPromise;
  }

  private async realGetTwin(tokenId: number): Promise<TwinNftState | null> {
    if (!config.CHAIN_CONTRACT_ADDRESS) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (await this.client()) as any;
    try {
      const result = (await c.readContract({
        address: config.CHAIN_CONTRACT_ADDRESS,
        abi: TWIN_INFT_ABI,
        functionName: 'getTwin',
        args: [BigInt(tokenId)],
      })) as readonly [string, string, string, string, bigint, string];

      const [owner, dataHash, encryptedURI, sealedKey, parent, delegate] = result;
      return {
        tokenId,
        owner,
        dataHash,
        encryptedURI,
        sealedKey,
        parentTokenId: Number(parent),
        delegate,
        explorerUrl: this.explorerUrl(tokenId),
        source: 'chain',
      };
    } catch {
      // Treat any read failure (not minted, RPC down, etc.) as null.
      return null;
    }
  }
}

// === mock backend ====================================================
const ROSTER_MOCK: Record<number, Omit<TwinNftState, 'tokenId' | 'explorerUrl' | 'source'>> = {
  42: {
    owner: '0x4f12a883e09bd1c8a7b3f6e1d87b6acdac17c8b1',
    dataHash: '0xb2d35afee7ef33f114aa4b5d49a5573d1d7305cdbc73769c7cec05c20575dbf1',
    encryptedURI: '0x0000master0g000000000000000000000000000000000000000000000000master',
    sealedKey: '0xfa…dc',
    parentTokenId: 0,
    delegate: '0x91ab2f7d000000000000000000000000000000002f7d',
  },
  43: {
    owner: '0x4f12a883e09bd1c8a7b3f6e1d87b6acdac17c8b1',
    dataHash: '0x71f0aa12000000000000000000000000000000000000000000000000aa12aa12',
    encryptedURI: '0x71f0aa120000000000000000000000000000000000000000000000000000aa12',
    sealedKey: '0xfa…dc',
    parentTokenId: 42,
    delegate: '0x91ab2f7d000000000000000000000000000000002f7d',
  },
  44: {
    owner: '0x4f12a883e09bd1c8a7b3f6e1d87b6acdac17c8b1',
    dataHash: '0x4f3eb201000000000000000000000000000000000000000000000000b201b201',
    encryptedURI: '0x4f3eb20100000000000000000000000000000000000000000000000000004f3e',
    sealedKey: '0xfa…dc',
    parentTokenId: 42,
    delegate: '0x91ab2f7d000000000000000000000000000000002f7d',
  },
  45: {
    owner: '0xACME000000000000000000000000000000001f4b',
    dataHash: '0xa11cea44000000000000000000000000000000000000000000000000ea44ea44',
    encryptedURI: '0xa11cea4400000000000000000000000000000000000000000000000000a11cea',
    sealedKey: '0xfa…dc',
    parentTokenId: 42,
    delegate: '0x91ab2f7d000000000000000000000000000000002f7d',
  },
  46: {
    owner: '0x4f12a883e09bd1c8a7b3f6e1d87b6acdac17c8b1',
    dataHash: '0x88c0d013000000000000000000000000000000000000000000000000d013d013',
    encryptedURI: '0x88c0d01300000000000000000000000000000000000000000000000000d01388',
    sealedKey: '0xfa…dc',
    parentTokenId: 42,
    delegate: '0x91ab2f7d000000000000000000000000000000002f7d',
  },
};

function mockTwin(tokenId: number, explorerUrl: string): TwinNftState | null {
  const base = ROSTER_MOCK[tokenId];
  if (!base) return null;
  return { tokenId, ...base, explorerUrl, source: 'mock' };
}

export const chain = new ChainService();
