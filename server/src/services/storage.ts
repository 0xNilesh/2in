// 0G Storage service. One typed surface over two operations:
//
//   uploadBlob(content, opts) → { rootHash, gatewayUrl, size }
//   downloadBlob(rootHash)    → { content, contentType }
//   writeKv(stream, key, value)
//   readKv(stream, key)        → string | null
//   listKv(stream)             → Array<{ key, value, ts }>
//
// Two modes:
//   real → @0gfoundation/0g-ts-sdk Indexer.upload + (TODO) KV via SDK
//   mock → deterministic sha256-based fake hashes; in-memory blob + KV maps
//
// We keep the SDK integration loosely typed because the package surface is
// still moving (per Phase 1 snapshot). Blob upload is wired to the real
// Indexer; KV reads/writes are intentionally still in-memory until the SDK
// settles its KV stream primitives — we surface a clear `mode.kv` flag so
// the UI can show "in-memory" badges if needed.

import crypto from 'node:crypto';
import { config } from '../config.js';

export interface UploadResult {
  rootHash: string;
  gatewayUrl: string;
  size: number;
}

export interface KvEntry {
  key: string;
  value: string;
  ts: number;
}

export interface StorageMode {
  blobs: 'real' | 'mock';
  kv: 'real' | 'mock';
  reason?: string;
}

class StorageService {
  private indexerPromise: Promise<unknown> | null = null;
  private mockBlobs = new Map<string, Buffer>();
  private mockKv = new Map<string, Map<string, KvEntry>>();

  get mode(): StorageMode {
    if (config.STORAGE_PRIVATE_KEY) {
      return { blobs: 'real', kv: 'mock', reason: 'KV stream SDK still in flux — using in-memory mirror' };
    }
    return {
      blobs: 'mock',
      kv: 'mock',
      reason: 'STORAGE_PRIVATE_KEY not set — running in mock mode',
    };
  }

  gatewayUrl(rootHash: string): string {
    return `${config.STORAGE_GATEWAY}/file?root=${rootHash}`;
  }

  async uploadBlob(content: Buffer, opts: { contentType?: string } = {}): Promise<UploadResult> {
    if (this.mode.blobs === 'mock') {
      const rootHash = '0x' + crypto.createHash('sha256').update(content).digest('hex');
      this.mockBlobs.set(rootHash, content);
      return { rootHash, gatewayUrl: this.gatewayUrl(rootHash), size: content.length };
    }
    return this.realUpload(content);
  }

  async downloadBlob(rootHash: string): Promise<Buffer | null> {
    if (this.mode.blobs === 'mock') {
      return this.mockBlobs.get(rootHash) ?? null;
    }
    return this.realDownload(rootHash);
  }

  // === KV (in-memory mirror for now) ============================
  async writeKv(stream: string, key: string, value: string): Promise<void> {
    let bucket = this.mockKv.get(stream);
    if (!bucket) {
      bucket = new Map();
      this.mockKv.set(stream, bucket);
    }
    bucket.set(key, { key, value, ts: Date.now() });
  }

  async readKv(stream: string, key: string): Promise<string | null> {
    return this.mockKv.get(stream)?.get(key)?.value ?? null;
  }

  async listKv(stream: string): Promise<KvEntry[]> {
    return Array.from(this.mockKv.get(stream)?.values() ?? []).sort((a, b) => b.ts - a.ts);
  }

  // === real backend ============================================
  private async indexer(): Promise<unknown> {
    if (!this.indexerPromise) {
      this.indexerPromise = this.initIndexer().catch((err) => {
        this.indexerPromise = null;
        throw err;
      });
    }
    return this.indexerPromise;
  }

  private async initIndexer(): Promise<unknown> {
    if (!config.STORAGE_PRIVATE_KEY) {
      throw new Error('STORAGE_PRIVATE_KEY not set');
    }
    // Dynamic import — keeps SDK out of cold start when running mock.
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = sdk as any;
    const Indexer = m.Indexer ?? m.default?.Indexer;
    if (!Indexer) throw new Error('SDK shape unrecognized — Indexer not exported');
    return new Indexer(config.STORAGE_INDEXER);
  }

  private async realUpload(content: Buffer): Promise<UploadResult> {
    // The SDK exposes `Indexer.upload(MemData|ZgFile, rpc, signer)`, plus a
    // helper that returns root hash. Surface is loosely typed because it's
    // still moving — pin behind try/catch with a clear error.
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = sdk as any;
    const indexer = await this.indexer();
    const ethers = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.STORAGE_RPC);
    const signer = new ethers.Wallet(config.STORAGE_PRIVATE_KEY!, provider);

    const MemData = m.MemData ?? m.default?.MemData;
    if (!MemData) throw new Error('SDK shape unrecognized — MemData not exported');
    const blob = new MemData(content);

    // Try a couple shapes the upload helper has had recently.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = indexer as any;
    let rootHash: string;
    if (typeof idx.upload === 'function') {
      const res = await idx.upload(blob, config.STORAGE_RPC, signer);
      rootHash = res?.rootHash ?? res?.root ?? res?.tree?.rootHash() ?? '';
    } else if (typeof idx.uploadFile === 'function') {
      const res = await idx.uploadFile(blob, config.STORAGE_RPC, signer);
      rootHash = res?.rootHash ?? '';
    } else {
      throw new Error('Indexer does not expose upload/uploadFile — SDK API drift');
    }
    if (!rootHash) throw new Error('Upload succeeded but no root hash returned');
    return { rootHash, gatewayUrl: this.gatewayUrl(rootHash), size: content.length };
  }

  private async realDownload(rootHash: string): Promise<Buffer | null> {
    const res = await fetch(`${config.STORAGE_INDEXER}/file?root=${rootHash}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  }
}

export const storage = new StorageService();
