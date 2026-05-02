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
// KV persistence has TWO backends, picked at startup:
//   mongo → MongoDB Atlas (when MONGO_URI is set). Survives server
//           restarts on ephemeral hosts like Render free tier.
//   disk  → in-memory Map mirrored to /tmp/2in-kv-state.json. Default.
// Same 5-method API either way.
//
// We keep the SDK integration loosely typed because the package surface is
// still moving (per Phase 1 snapshot). Blob upload is wired to the real
// Indexer; KV reads/writes are intentionally still in-memory until the SDK
// settles its KV stream primitives — we surface a clear `mode.kv` flag so
// the UI can show "in-memory" badges if needed.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
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
  kv: 'real' | 'mock' | 'mongo';
  reason?: string;
}

// Internal contract every KV backend implements. Mirrors the 5 public
// methods on StorageService — keeps the picker dumb.
interface KvBackend {
  writeKv(stream: string, key: string, value: string): Promise<void>;
  readKv(stream: string, key: string): Promise<string | null>;
  listKv(stream: string): Promise<KvEntry[]>;
  updateKv(stream: string, key: string, value: string): Promise<boolean>;
  deleteKv(stream: string, key: string): Promise<boolean>;
}

// === Disk KV backend ================================================
// In-memory Map mirrored to /tmp/2in-kv-state.json with a 250 ms coalesced
// flush. Default backend; works on any host with writable /tmp. Loses data
// on hosts where /tmp is non-persistent (e.g. Render free tier cold starts).
const KV_PERSIST_PATH = join(tmpdir(), '2in-kv-state.json');

function loadKvFromDisk(): Map<string, Map<string, KvEntry>> {
  const out = new Map<string, Map<string, KvEntry>>();
  try {
    if (!existsSync(KV_PERSIST_PATH)) return out;
    const raw = readFileSync(KV_PERSIST_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, KvEntry[]>;
    for (const [stream, entries] of Object.entries(obj)) {
      const bucket = new Map<string, KvEntry>();
      for (const e of entries) bucket.set(e.key, e);
      out.set(stream, bucket);
    }
  } catch {
    // Corrupt or missing — start empty.
  }
  return out;
}

class DiskKvBackend implements KvBackend {
  private mem = loadKvFromDisk();
  private pendingFlush: NodeJS.Timeout | null = null;

  private flush(): void {
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.pendingFlush = setTimeout(() => {
      this.pendingFlush = null;
      try {
        const obj: Record<string, KvEntry[]> = {};
        for (const [stream, bucket] of this.mem) {
          obj[stream] = Array.from(bucket.values());
        }
        const dir = dirname(KV_PERSIST_PATH);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(KV_PERSIST_PATH, JSON.stringify(obj));
      } catch {
        // Disk full / read-only — silent. In-memory copy still works.
      }
    }, 250);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.pendingFlush as any).unref?.();
  }

  async writeKv(stream: string, key: string, value: string): Promise<void> {
    let bucket = this.mem.get(stream);
    if (!bucket) { bucket = new Map(); this.mem.set(stream, bucket); }
    bucket.set(key, { key, value, ts: Date.now() });
    this.flush();
  }
  async readKv(stream: string, key: string): Promise<string | null> {
    return this.mem.get(stream)?.get(key)?.value ?? null;
  }
  async listKv(stream: string): Promise<KvEntry[]> {
    return Array.from(this.mem.get(stream)?.values() ?? []).sort((a, b) => b.ts - a.ts);
  }
  async updateKv(stream: string, key: string, value: string): Promise<boolean> {
    const bucket = this.mem.get(stream);
    if (!bucket || !bucket.has(key)) return false;
    bucket.set(key, { key, value, ts: Date.now() });
    this.flush();
    return true;
  }
  async deleteKv(stream: string, key: string): Promise<boolean> {
    const bucket = this.mem.get(stream);
    if (!bucket || !bucket.has(key)) return false;
    bucket.delete(key);
    this.flush();
    return true;
  }
}

// === Mongo KV backend ===============================================
// Single collection `twin_kv` with one document per (stream, key).
// Picked when MONGO_URI is set. Survives ephemeral filesystems.
async function createMongoKv(uri: string, dbName: string): Promise<KvBackend> {
  // Dynamic import keeps the driver out of cold start when not used.
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(dbName).collection<{
    stream: string; key: string; value: string; ts: number;
  }>('twin_kv');
  await Promise.all([
    col.createIndex({ stream: 1, key: 1 }, { unique: true }),
    col.createIndex({ stream: 1, ts: -1 }),
  ]);

  return {
    async writeKv(stream, key, value) {
      await col.updateOne(
        { stream, key },
        { $set: { stream, key, value, ts: Date.now() } },
        { upsert: true },
      );
    },
    async readKv(stream, key) {
      const doc = await col.findOne({ stream, key });
      return doc?.value ?? null;
    },
    async listKv(stream) {
      const docs = await col.find({ stream }).sort({ ts: -1 }).toArray();
      return docs.map((d) => ({ key: d.key, value: d.value, ts: d.ts }));
    },
    async updateKv(stream, key, value) {
      const res = await col.updateOne(
        { stream, key },
        { $set: { value, ts: Date.now() } },
      );
      return res.matchedCount > 0;
    },
    async deleteKv(stream, key) {
      const res = await col.deleteOne({ stream, key });
      return res.deletedCount > 0;
    },
  };
}

class StorageService {
  private indexerPromise: Promise<unknown> | null = null;
  private mockBlobs = new Map<string, Buffer>();
  private diskKv = new DiskKvBackend();
  private kvPromise: Promise<KvBackend> | null = null;

  // Picks the KV backend lazily on first access. Once resolved the
  // promise is reused so all 5 KV methods share a single connection.
  private kv(): Promise<KvBackend> {
    if (!this.kvPromise) {
      if (config.MONGO_URI) {
        this.kvPromise = createMongoKv(config.MONGO_URI, config.MONGO_DB_NAME).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[storage] MongoDB connect failed — falling back to disk', err?.message);
          this.kvPromise = Promise.resolve(this.diskKv);
          return this.diskKv;
        });
      } else {
        this.kvPromise = Promise.resolve(this.diskKv);
      }
    }
    return this.kvPromise;
  }

  get mode(): StorageMode {
    const kv: StorageMode['kv'] = config.MONGO_URI ? 'mongo' : 'mock';
    const reason = config.MONGO_URI
      ? 'KV persisted to MongoDB'
      : 'MONGO_URI not set — KV mirrored to /tmp (ephemeral on free hosts)';
    if (config.STORAGE_PRIVATE_KEY) {
      return { blobs: 'real', kv, reason };
    }
    return { blobs: 'mock', kv, reason: `${reason} · STORAGE_PRIVATE_KEY not set — blobs in-memory` };
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

  // === KV — delegates to the picked backend =====================
  async writeKv(stream: string, key: string, value: string): Promise<void> {
    return (await this.kv()).writeKv(stream, key, value);
  }
  async readKv(stream: string, key: string): Promise<string | null> {
    return (await this.kv()).readKv(stream, key);
  }
  async listKv(stream: string): Promise<KvEntry[]> {
    return (await this.kv()).listKv(stream);
  }
  async updateKv(stream: string, key: string, value: string): Promise<boolean> {
    return (await this.kv()).updateKv(stream, key, value);
  }
  async deleteKv(stream: string, key: string): Promise<boolean> {
    return (await this.kv()).deleteKv(stream, key);
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
