// Per-specialist memory-write snapshotting.
//
// Every memory write that flows through `recordWrite(specialistId, slice)`
// is counted. When N writes accumulate within WINDOW_MS for a single
// specialist, a snapshot fires:
//
//   1. Compute a fresh root hash from the union of (specialistId, all writes,
//      ts) — deterministic for the snapshot history.
//   2. Append a SnapshotRecord to the in-memory log keyed by tokenId.
//   3. Emit 'snapshot.created' on the snapshot bus so SSE listeners see it.
//   4. Real chain write — issue a `updateMetadata(tokenId, newRoot)` via
//      the orchestrator delegate wallet WHEN ONE IS CONFIGURED. For now
//      we emit a deterministic mock txHash; wiring the actual delegate
//      signer is Phase 6.5 work.
//
// Snapshot history is kept per tokenId; the GET endpoint returns seed
// rows + live ones for nice continuity in the UI.

import crypto from 'node:crypto';
import { createBus } from '../lib/event-bus.js';
import { storage } from './storage.js';
import { chain } from './chain.js';
import { listAll, MEMORY_TYPES, type MemoryType } from './memory.js';

export interface SnapshotRecord {
  idx: number;
  tokenId: number;
  specialistId: string;
  fromHash: string;
  toHash: string;
  delta: string;
  triggeredBy: 'manual' | 'tool' | 'feedback' | 'chat';
  ts: number;
  txHash: string;
  source: 'mock' | 'chain';
}

export interface WriteRecord {
  specialistId: string;
  slice: string;
  ts: number;
  triggeredBy: SnapshotRecord['triggeredBy'];
}

export type SnapshotEvent =
  | { type: 'snapshot.created'; snapshot: SnapshotRecord }
  | { type: 'snapshot.anchored'; snapshot: SnapshotRecord }
  | { type: 'write.recorded'; write: WriteRecord; pending: number };

const WINDOW_MS = 24 * 60 * 60 * 1000;
const THRESHOLD = 3;

// specialistId → tokenId mapping. Seeded with the role-only roster from
// web/src/data/specialists.js — keep in sync.
const TOKEN_OF: Record<string, number> = {
  director: 42,
  writer: 43,
  researcher: 44,
  editor: 45,
  strategist: 46,
  companion: 47,
  voice: 48,
  visual: 49,
  negotiator: 50,
};

const writeCounters = new Map<string, WriteRecord[]>(); // specialistId → recent writes
const snapshotsByToken = new Map<number, SnapshotRecord[]>(); // tokenId → history (newest-first)
let snapshotIdx = 12; // continues the seed history idx so the UI flows

const snapshotBus = createBus<SnapshotEvent>({
  // 'all' is the only key — broadcasts to anyone listening for snapshots.
  terminalTypes: [],
});

// Seed snapshot history (matches the static rows the UI used to show).
function seedHistory(tokenId: number): SnapshotRecord[] {
  const base = snapshotsByToken.get(tokenId);
  if (base) return base;
  const seed: SnapshotRecord[] = [
    {
      idx: 12, tokenId, specialistId: tokenIdToSpecialist(tokenId),
      fromHash: '0x88b1…0042', toHash: '0x88c0…d013',
      delta: 'rejection_memory +3 entries',
      triggeredBy: 'feedback', ts: Date.now() - 14 * 60 * 1000,
      txHash: '0xseed01', source: 'mock',
    },
    {
      idx: 11, tokenId, specialistId: tokenIdToSpecialist(tokenId),
      fromHash: '0x4a02…ffaa', toHash: '0x88b1…0042',
      delta: 'preference_memory override',
      triggeredBy: 'manual', ts: Date.now() - 2 * 86_400_000,
      txHash: '0xseed02', source: 'mock',
    },
    {
      idx: 10, tokenId, specialistId: tokenIdToSpecialist(tokenId),
      fromHash: '0x2cc0…1199', toHash: '0x4a02…ffaa',
      delta: 'voice_memory +24 examples',
      triggeredBy: 'tool', ts: Date.now() - 6 * 86_400_000,
      txHash: '0xseed03', source: 'mock',
    },
  ];
  snapshotsByToken.set(tokenId, seed);
  return seed;
}

function tokenIdToSpecialist(tokenId: number): string {
  return Object.entries(TOKEN_OF).find(([, t]) => t === tokenId)?.[0] ?? 'unknown';
}

export function recordWrite(input: {
  specialistId: string;
  slice: string;
  triggeredBy: SnapshotRecord['triggeredBy'];
}): { snapshot: SnapshotRecord | null; pending: number } {
  const list = writeCounters.get(input.specialistId) ?? [];
  const now = Date.now();
  const recent = list.filter((w) => now - w.ts < WINDOW_MS);
  recent.push({ ...input, ts: now });
  writeCounters.set(input.specialistId, recent);

  // Always emit the bare write so the toast surface fires immediately.
  snapshotBus.emit('all', {
    type: 'write.recorded',
    write: { ...input, ts: now },
    pending: recent.length,
  });

  if (recent.length < THRESHOLD) {
    return { snapshot: null, pending: recent.length };
  }

  // Threshold crossed — fire snapshot, reset counter for this specialist.
  writeCounters.set(input.specialistId, []);
  const snapshot = createSnapshot(input.specialistId, recent);
  snapshotBus.emit('all', { type: 'snapshot.created', snapshot });
  // Kick off the chain anchor in the background. The synchronous emit
  // above keeps the UI responsive; the second `snapshot.anchored` event
  // upgrades the record's txHash + source when the receipt confirms.
  void anchorOnChain(snapshot).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[snapshot] anchor failed for #${snapshot.tokenId}: ${(err as Error).message}`);
  });
  return { snapshot, pending: 0 };
}

// === Chain anchoring ========================================================
// Build a manifest of per-type root hashes, upload to 0G Storage, then call
// updateMetadata(tokenId, manifestHash, manifestGatewayUrl). Updates the
// snapshot record in-place and re-emits as 'snapshot.anchored'.
async function anchorOnChain(snapshot: SnapshotRecord): Promise<void> {
  const twinId = '42';
  const all = await listAll(twinId);
  const manifest: {
    twin: string;
    specialistId: string;
    tokenId: number;
    snapshotAt: number;
    types: Record<MemoryType, { count: number; root: string }>;
  } = {
    twin: twinId,
    specialistId: snapshot.specialistId,
    tokenId: snapshot.tokenId,
    snapshotAt: snapshot.ts,
    types: {} as Record<MemoryType, { count: number; root: string }>,
  };
  for (const type of MEMORY_TYPES) {
    const entries = all[type] ?? [];
    const root = '0x' + crypto
      .createHash('sha256')
      .update(JSON.stringify(entries.map((e) => ({ id: e.id, text: e.text, ts: e.ts }))))
      .digest('hex');
    manifest.types[type] = { count: entries.length, root };
  }

  const manifestBuf = Buffer.from(JSON.stringify(manifest));
  let upload;
  try {
    upload = await storage.uploadBlob(manifestBuf, { contentType: 'application/json' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[snapshot] manifest upload failed: ${(err as Error).message}`);
    return;
  }

  // dataHash = keccak-style integrity over the uploaded blob. We use sha256
  // for now (chain takes bytes32 — any 32B hash satisfies the field) so we
  // don't drag in a full keccak dep just for this. Switch to keccak later
  // if ERC-7857 verifiers require it.
  const dataHash = ('0x' + crypto.createHash('sha256').update(manifestBuf).digest('hex')) as `0x${string}`;

  if (!chain.canWrite) {
    // No signer — leave snapshot at source: 'mock' with the deterministic txHash.
    return;
  }

  let receipt;
  try {
    receipt = await chain.updateMetadata(snapshot.tokenId, dataHash, upload.gatewayUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[snapshot] updateMetadata failed for #${snapshot.tokenId}: ${(err as Error).message}`);
    return;
  }

  // Patch the record in-place + re-emit so SSE listeners can swap their UI.
  snapshot.txHash = receipt.txHash;
  snapshot.source = 'chain';
  snapshot.toHash = dataHash.slice(0, 6) + '…' + dataHash.slice(-4);
  snapshotBus.emit('all', { type: 'snapshot.anchored', snapshot });
}

function createSnapshot(specialistId: string, recent: WriteRecord[]): SnapshotRecord {
  const tokenId = TOKEN_OF[specialistId] ?? 0;
  if (!tokenId) throw new Error(`unknown specialist: ${specialistId}`);
  const history = seedHistory(tokenId);
  const fromHash = history[0]?.toHash ?? '0x0000…0000';
  const seed = `${specialistId}:${recent.map((r) => `${r.slice}@${r.ts}`).join(',')}`;
  const toHashFull = '0x' + crypto.createHash('sha256').update(seed).digest('hex');
  const toHash = `${toHashFull.slice(0, 6)}…${toHashFull.slice(-4)}`;
  const txHash = '0x' + crypto.createHash('sha256').update(`tx:${seed}`).digest('hex');

  const idx = ++snapshotIdx;
  const sliceCounts = recent.reduce<Record<string, number>>((acc, w) => {
    acc[w.slice] = (acc[w.slice] ?? 0) + 1;
    return acc;
  }, {});
  const delta = Object.entries(sliceCounts)
    .map(([s, n]) => `${s} +${n}`)
    .join(' · ');

  const snapshot: SnapshotRecord = {
    idx,
    tokenId,
    specialistId,
    fromHash,
    toHash,
    delta,
    triggeredBy: recent.at(-1)?.triggeredBy ?? 'tool',
    ts: Date.now(),
    txHash,
    source: 'mock', // real path waits for delegate signer wiring
  };

  history.unshift(snapshot);
  return snapshot;
}

export function getSnapshots(tokenId: number): SnapshotRecord[] {
  return seedHistory(tokenId).slice().sort((a, b) => b.ts - a.ts);
}

export function subscribe() {
  return snapshotBus.subscribe('all');
}

// Open the bus eagerly so subscribe() always finds something.
snapshotBus.open('all');

export const snapshotConfig = { THRESHOLD, WINDOW_MS };
