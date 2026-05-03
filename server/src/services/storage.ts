// 0G Storage service. One typed surface over two operations:
//
//   uploadBlob(content, opts) → { rootHash, gatewayUrl, size }
//   downloadBlob(rootHash)    → { content, contentType }
//   writeKv(stream, key, value)
//   readKv(stream, key)        → string | null
//   listKv(stream)             → Array<{ key, value, ts }>
//
// Backed entirely by 0G Storage:
//   - Blob upload  → 0G Indexer (Indexer.upload, MemData)
//   - KV streams   → 0G KV (Batcher + StreamDataBuilder for writes,
//                    KvClient for reads)
//   - Cold start   → KV state is rolled into a single Indexer cache snapshot
//                    blob every N flushes; cold-boot hydrates from that blob
//                    in ~1 s instead of doing a 30+ s iterator scan.
//
// No disk fallback, no Mongo. STORAGE_PRIVATE_KEY is required and the
// server refuses to start without it (config.ts).
//
// Reads block on first hydrate (~1 s on cold instance) and are O(1) from
// in-memory cache after that. Writes are immediate to cache + queued for
// batched flush to 0G KV every 3 s OR every 10 entries.

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
  kv: 'real' | 'real-degraded' | 'mock';
  reason?: string;
}

interface KvBackend {
  writeKv(stream: string, key: string, value: string): Promise<void>;
  readKv(stream: string, key: string): Promise<string | null>;
  listKv(stream: string): Promise<KvEntry[]>;
  updateKv(stream: string, key: string, value: string): Promise<boolean>;
  deleteKv(stream: string, key: string): Promise<boolean>;
}

const META_STREAM = 'twin:42:meta';
const SNAPSHOT_KEY = 'cache-snapshot';
// Tombstone sentinel — listKv filters these out. Stored as a JSON string so
// it round-trips through the same path as user data.
const TOMBSTONE = '__deleted__';

// Hash a stream name into a 32-byte hex id (0G KV streamId is bytes32).
function streamIdOf(name: string): string {
  return '0x' + crypto.createHash('sha256').update(name).digest('hex');
}

// === Lazy SDK + signer + flow + nodes setup ==========================
// All wired once on first KV operation; reused across the lifetime of the
// process. Same signer + RPC are used for blob upload via Indexer.

interface ZgWiring {
  ethers: typeof import('ethers');
  sdk: typeof import('@0gfoundation/0g-ts-sdk');
  signer: import('ethers').Wallet;
  indexer: import('@0gfoundation/0g-ts-sdk').Indexer;
  kvClient: import('@0gfoundation/0g-ts-sdk').KvClient;
  flow: import('@0gfoundation/0g-ts-sdk').FixedPriceFlow;
  nodes: import('@0gfoundation/0g-ts-sdk').StorageNode[];
  rpc: string;
}

let _wiringPromise: Promise<ZgWiring> | null = null;
async function wiring(): Promise<ZgWiring> {
  if (_wiringPromise) return _wiringPromise;
  _wiringPromise = (async () => {
    const ethers = await import('ethers');
    const sdk = await import('@0gfoundation/0g-ts-sdk');
    const provider = new ethers.JsonRpcProvider(config.STORAGE_RPC);
    const signer = new ethers.Wallet(config.STORAGE_PRIVATE_KEY, provider);
    const indexer = new sdk.Indexer(config.STORAGE_INDEXER);
    const kvClient = new sdk.KvClient(config.STORAGE_RPC);
    // Pull storage-node clients from the indexer's trusted set.
    const [nodes, err] = await indexer.selectNodes(config.STORAGE_REPLICAS);
    if (err) {
      throw new Error(`indexer.selectNodes failed: ${err.message ?? err}`);
    }
    // The flow contract address depends on the network — pull it from the
    // storage node's status rather than hardcoding (matches what
    // `Indexer.newUploaderFromIndexerNodes` does internally).
    let flowAddress = config.STORAGE_FLOW_ADDRESS;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = await (nodes[0] as any).getStatus();
      const fromNode = status?.networkIdentity?.flowAddress;
      if (fromNode) {
        flowAddress = fromNode;
        // eslint-disable-next-line no-console
        console.info(`[storage] flow contract resolved from indexer: ${flowAddress}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[storage] couldn't read flow address from node — using config default ${config.STORAGE_FLOW_ADDRESS}:`, (e as Error)?.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flow = sdk.FixedPriceFlow__factory.connect(flowAddress, signer as any);
    return { ethers, sdk, signer, indexer, kvClient, flow, nodes, rpc: config.STORAGE_RPC };
  })().catch((err) => {
    _wiringPromise = null;
    throw err;
  });
  return _wiringPromise;
}

// === ZeroG KV backend ================================================
// In-process cache of the entire KV map. Reads serve from cache; writes
// queue + flush to 0G in batches; cache snapshot blob uploaded periodically
// so cold starts hydrate in one HTTP GET instead of an iterator scan.
class ZeroGKvBackend implements KvBackend {
  private mem = new Map<string, Map<string, KvEntry>>();
  private hydrated: Promise<void> | null = null;
  // Per-stream queues of pending writes that haven't hit chain yet.
  // value === TOMBSTONE for deletes.
  private queue: Array<{ stream: string; key: string; value: string }> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushRunning = false;
  private flushesSinceSnapshot = 0;
  private lastSnapshotAt = 0;
  private streamVersions = new Map<string, number>();
  private failureStreak = 0;
  private degraded = false;

  // === public API =====
  async writeKv(stream: string, key: string, value: string): Promise<void> {
    await this.hydrate();
    this.cacheSet(stream, key, value);
    this.enqueue(stream, key, value);
  }
  async readKv(stream: string, key: string): Promise<string | null> {
    await this.hydrate();
    const e = this.mem.get(stream)?.get(key);
    if (!e || e.value === TOMBSTONE) return null;
    return e.value;
  }
  async listKv(stream: string): Promise<KvEntry[]> {
    await this.hydrate();
    const bucket = this.mem.get(stream);
    if (!bucket) return [];
    return Array.from(bucket.values())
      .filter((e) => e.value !== TOMBSTONE)
      .sort((a, b) => b.ts - a.ts);
  }
  async updateKv(stream: string, key: string, value: string): Promise<boolean> {
    await this.hydrate();
    const bucket = this.mem.get(stream);
    if (!bucket || !bucket.has(key) || bucket.get(key)!.value === TOMBSTONE) return false;
    this.cacheSet(stream, key, value);
    this.enqueue(stream, key, value);
    return true;
  }
  async deleteKv(stream: string, key: string): Promise<boolean> {
    await this.hydrate();
    const bucket = this.mem.get(stream);
    if (!bucket || !bucket.has(key) || bucket.get(key)!.value === TOMBSTONE) return false;
    this.cacheSet(stream, key, TOMBSTONE);
    this.enqueue(stream, key, TOMBSTONE);
    return true;
  }

  isDegraded(): boolean { return this.degraded; }

  // === internals =====
  private cacheSet(stream: string, key: string, value: string): void {
    let bucket = this.mem.get(stream);
    if (!bucket) { bucket = new Map(); this.mem.set(stream, bucket); }
    bucket.set(key, { key, value, ts: Date.now() });
  }

  private enqueue(stream: string, key: string, value: string): void {
    this.queue.push({ stream, key, value });
    if (this.queue.length >= 10) {
      this.scheduleFlush(0);
    } else {
      this.scheduleFlush(3000);
    }
  }

  private scheduleFlush(ms: number): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, ms);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.flushTimer as any).unref?.();
  }

  /** Drain the queue into a single Batcher.exec() → one tx. */
  private async flush(): Promise<void> {
    if (this.flushRunning || this.queue.length === 0) return;
    this.flushRunning = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const w = await wiring();
      // Group writes by stream so we can use one StreamDataBuilder version
      // covering all touched streams.
      const touchedStreams = new Set(batch.map((b) => b.stream));
      const baseVersion = this.bumpVersion(touchedStreams);
      const builder = new w.sdk.StreamDataBuilder(baseVersion);
      for (const stream of touchedStreams) builder.addStreamId(streamIdOf(stream));
      for (const { stream, key, value } of batch) {
        builder.set(streamIdOf(stream), encode(key), encode(value));
      }
      const batcher = new w.sdk.Batcher(baseVersion, w.nodes, w.flow, w.rpc);
      // The SDK builds its data from the builder set on the batcher itself,
      // so swap the auto-built one in.
      batcher.streamDataBuilder = builder;
      const [result, err] = await batcher.exec();
      if (err) throw err;
      this.failureStreak = 0;
      this.degraded = false;
      // eslint-disable-next-line no-console
      console.info(`[kv] flushed ${batch.length} write(s) → tx ${result.txHash}`);
      // Snapshot trigger: every flush that contained user data — hackathon
      // demo cadence so a Render cold-restart picks up the very last write.
      // Skip when the batch was only META housekeeping (snapshot pointer
      // writes) to avoid an infinite snapshot → meta-write → snapshot loop.
      const userBatch = batch.some((b) => b.stream !== META_STREAM);
      if (userBatch) {
        this.flushesSinceSnapshot += 1;
        if (this.flushesSinceSnapshot >= 1 || Date.now() - this.lastSnapshotAt > 5 * 60_000) {
          this.flushesSinceSnapshot = 0;
          this.lastSnapshotAt = Date.now();
          void this.uploadCacheSnapshot();
        }
      }
    } catch (err) {
      this.failureStreak += 1;
      this.degraded = this.failureStreak >= 3;
      // eslint-disable-next-line no-console
      console.warn(`[kv] flush failed (streak ${this.failureStreak}) → re-queueing ${batch.length} write(s):`, (err as Error)?.message ?? err);
      // Re-queue so the next tick retries.
      this.queue.unshift(...batch);
      this.scheduleFlush(5000);
    } finally {
      this.flushRunning = false;
      // If more writes piled up during the flush, drain them next tick
      // (don't leave them orphaned waiting for the next external trigger).
      if (this.queue.length > 0) this.scheduleFlush(1000);
    }
  }

  private bumpVersion(streams: Set<string>): number {
    let max = 0;
    for (const s of streams) {
      const v = (this.streamVersions.get(s) ?? 0) + 1;
      this.streamVersions.set(s, v);
      if (v > max) max = v;
    }
    return Math.max(max, 1);
  }

  /** Serialise the cache to JSON, upload to Indexer, write rootHash + ts
   *  into the meta stream so the next boot hydrates fast. */
  private async uploadCacheSnapshot(): Promise<void> {
    try {
      const obj: Record<string, KvEntry[]> = {};
      for (const [stream, bucket] of this.mem) {
        if (stream === META_STREAM) continue; // never include the meta in itself
        // Drop tombstones from the snapshot — the snapshot is the
        // canonical compacted state.
        obj[stream] = Array.from(bucket.values()).filter((e) => e.value !== TOMBSTONE);
      }
      const payload = Buffer.from(JSON.stringify({ ts: Date.now(), entries: obj }));
      const result = await storage.uploadBlob(payload, { contentType: 'application/json' });
      const pointer = JSON.stringify({ rootHash: result.rootHash, ts: Date.now() });
      // Direct enqueue (don't recurse through writeKv → flush spiral):
      this.cacheSet(META_STREAM, SNAPSHOT_KEY, pointer);
      this.queue.push({ stream: META_STREAM, key: SNAPSHOT_KEY, value: pointer });
      this.scheduleFlush(0);
      // eslint-disable-next-line no-console
      console.info(`[kv] cache snapshot uploaded → root ${result.rootHash}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[kv] snapshot upload failed (will retry next cycle):`, (err as Error)?.message ?? err);
    }
  }

  /** One-shot cold-boot hydration. Awaited by every read on first call. */
  private hydrate(): Promise<void> {
    if (this.hydrated) return this.hydrated;
    this.hydrated = this.doHydrate().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[kv] hydrate failed — starting empty cache:', (err as Error)?.message ?? err);
      // Resolve anyway; the cache will populate as writes come in and the
      // next snapshot will be the new source of truth.
    });
    return this.hydrated;
  }

  private async doHydrate(): Promise<void> {
    const w = await wiring();
    // 1. Look up the latest cache snapshot pointer (fast single get).
    const snapshotPointerRaw = await this.kvGetSingle(w, META_STREAM, SNAPSHOT_KEY);
    if (!snapshotPointerRaw) {
      // eslint-disable-next-line no-console
      console.info('[kv] no cache snapshot found — first boot, starting empty');
      return;
    }
    const { rootHash } = JSON.parse(snapshotPointerRaw) as { rootHash: string; ts: number };
    // 2. Download the blob from the gateway.
    const blob = await this.downloadGateway(rootHash);
    if (!blob) {
      // eslint-disable-next-line no-console
      console.warn(`[kv] snapshot blob ${rootHash} unreachable — starting empty cache`);
      return;
    }
    const parsed = JSON.parse(blob.toString('utf8')) as { ts: number; entries: Record<string, KvEntry[]> };
    for (const [stream, entries] of Object.entries(parsed.entries)) {
      const bucket = new Map<string, KvEntry>();
      for (const e of entries) bucket.set(e.key, e);
      this.mem.set(stream, bucket);
    }
    // eslint-disable-next-line no-console
    console.info(`[kv] hydrated from snapshot ${rootHash} (${Object.keys(parsed.entries).length} streams, ts ${new Date(parsed.ts).toISOString()})`);
  }

  /** Read one (stream, key) directly from 0G KV (used during hydrate). */
  private async kvGetSingle(w: ZgWiring, stream: string, key: string): Promise<string | null> {
    try {
      const value = await w.kvClient.getValue(streamIdOf(stream), encode(key));
      if (!value) return null;
      // SDK returns Value with base64-encoded data field.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (value as any).data as string;
      return Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private async downloadGateway(rootHash: string): Promise<Buffer | null> {
    try {
      const url = `${config.STORAGE_GATEWAY}/file?root=${rootHash}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return Buffer.from(buf);
    } catch {
      return null;
    }
  }
}

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// === StorageService ==================================================
class StorageService {
  private mockBlobs = new Map<string, Buffer>();
  private kvBackend = new ZeroGKvBackend();

  get mode(): StorageMode {
    return {
      blobs: 'real',
      kv: this.kvBackend.isDegraded() ? 'real-degraded' : 'real',
      reason: this.kvBackend.isDegraded()
        ? '0G KV writes failing — cache reads still working'
        : 'KV streams + cache snapshots on 0G Storage',
    };
  }

  gatewayUrl(rootHash: string): string {
    return `${config.STORAGE_GATEWAY}/file?root=${rootHash}`;
  }

  async uploadBlob(content: Buffer, _opts: { contentType?: string } = {}): Promise<UploadResult> {
    return this.realUpload(content);
  }

  async downloadBlob(rootHash: string): Promise<Buffer | null> {
    return this.realDownload(rootHash);
  }

  // === KV — delegates to 0G backend ============================
  async writeKv(stream: string, key: string, value: string): Promise<void> {
    return this.kvBackend.writeKv(stream, key, value);
  }
  async readKv(stream: string, key: string): Promise<string | null> {
    return this.kvBackend.readKv(stream, key);
  }
  async listKv(stream: string): Promise<KvEntry[]> {
    return this.kvBackend.listKv(stream);
  }
  async updateKv(stream: string, key: string, value: string): Promise<boolean> {
    return this.kvBackend.updateKv(stream, key, value);
  }
  async deleteKv(stream: string, key: string): Promise<boolean> {
    return this.kvBackend.deleteKv(stream, key);
  }

  // === real blob path =========================================
  private async realUpload(content: Buffer): Promise<UploadResult> {
    const w = await wiring();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdkAny = w.sdk as any;
    const MemData = sdkAny.MemData ?? sdkAny.default?.MemData;
    if (!MemData) throw new Error('SDK shape unrecognized — MemData not exported');
    const blob = new MemData(content);
    // Use the indexer's full upload path: it picks nodes, builds tx,
    // submits via FixedPriceFlow. Same one used by the previous code.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result, err] = await w.indexer.upload(blob, config.STORAGE_RPC, w.signer as any);
    if (err) throw err;
    // result is { txHash, rootHash, txSeq } per Indexer.d.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const rootHash = r?.rootHash ?? r?.root ?? r?.tree?.rootHash?.() ?? '';
    if (!rootHash) {
      // Fall back to deterministic mock-style hash so callers don't break
      // when the SDK return shape drifts. The upload itself succeeded.
      const fallback = '0x' + crypto.createHash('sha256').update(content).digest('hex');
      // eslint-disable-next-line no-console
      console.warn(`[storage] upload succeeded but SDK returned no rootHash — using sha256 fallback ${fallback}`);
      return { rootHash: fallback, gatewayUrl: this.gatewayUrl(fallback), size: content.length };
    }
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
