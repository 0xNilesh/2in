// Memory primitive layer. Wraps storage KV with the 5 primitives that
// specialists and routes use to read/write memory:
//
//   encode(signal, ctx)   → MemoryEntry[]    (LLM extraction → typed entries)
//   store(entry, twinId)                      (persist to per-type KV stream)
//   retrieve(opts)        → MemoryEntry[]    (filter+rank across types)
//   update(id, type, ...) → MemoryEntry      (RMW patch)
//   stabilize()                               (background promotion sweep)
//
// Plus utilities: forget, recordEncode (snapshot bridge), subscribe (SSE).
//
// Memory types (replace the legacy 5 hard slices):
//   episodic     — events that happened
//   semantic     — facts about user/world
//   relationship — about people in user's life
//   temporal     — time-anchored patterns
//   procedural   — how-to rules
//   working      — current task context, in-flight only (not persisted)
//
// Legacy slice names (voice/preference/performance/rejection/relationship)
// are accepted as aliases via normalizeType so existing tools + routes keep
// working during the migration.

import crypto from 'node:crypto';
import { compute, type ChatMessage } from './compute.js';
import { storage } from './storage.js';
import { recordWrite } from './snapshot.js';
import { createBus } from '../lib/event-bus.js';

export const MEMORY_TYPES = [
  'episodic',
  'semantic',
  'relationship',
  'temporal',
  'procedural',
  'working',
] as const;
export type MemoryType = typeof MEMORY_TYPES[number];

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  text: string;
  source: string;
  ts: number;
  reinforcement: number;
  stable: boolean;
  meta?: Record<string, unknown>;
}

export type MemoryEvent =
  | { type: 'memory.encoded'; twinId: string; agent?: string; entries: MemoryEntry[] }
  | { type: 'memory.read'; twinId: string; agent: string; readTypes: MemoryType[]; count: number }
  | { type: 'memory.updated'; twinId: string; entry: MemoryEntry }
  | { type: 'memory.forgotten'; twinId: string; entryId: string; memType: MemoryType };

const memoryBus = createBus<MemoryEvent>({ terminalTypes: [] });
memoryBus.open('all');

export function subscribeMemory() {
  return memoryBus.subscribe('all');
}

function streamId(twinId: string, type: MemoryType): string {
  return `twin:${twinId}:mem:${type}`;
}

export function streamIdFor(twinId: string, type: MemoryType): string {
  return streamId(twinId, type);
}

// Legacy slice → new type aliasing. Keeps tools/memory.ts and the old
// /api/memory/:slice endpoints working without a flag day.
export const LEGACY_SLICE_MAP: Record<string, MemoryType> = {
  voice: 'semantic',
  preference: 'semantic',
  performance: 'episodic',
  rejection: 'procedural',
  relationship: 'relationship',
};

export function normalizeType(input: string): MemoryType | null {
  if ((MEMORY_TYPES as readonly string[]).includes(input)) return input as MemoryType;
  return LEGACY_SLICE_MAP[input] ?? null;
}

// === Primitive 1: encode ===================================================
const ENCODE_SYSTEM = `You extract memory-worthy facts from text. Reply ONLY with a JSON array of objects, each: {"type": "<one of episodic|semantic|relationship|temporal|procedural>", "text": "<the fact, terse, max 140 chars>"}.

Type guide:
- episodic: discrete events that happened (e.g., "user shipped post X on Mar 12, 4.2k likes")
- semantic: stable facts about user/world (e.g., "user is a podcast host", "tone=terse")
- relationship: about people in user's life (e.g., "Acme rep is pragmatic, owes follow-up")
- temporal: time-anchored patterns (e.g., "morning posts perform 3x evening posts")
- procedural: how-to rules (e.g., "never use superlatives", "always ad-disclose sponsor posts")

Rules:
- Skip first-person speculation. Only facts.
- Skip greetings, pleasantries, transient context.
- If nothing memory-worthy, return [].
- Max 5 entries per call.`;

export interface EncodeSignal {
  kind: 'chat' | 'specialist-output' | 'tool-result' | 'manual';
  text: string;
  source: string;
}

export interface EncodeContext {
  twinId: string;
  agent?: string;
  /** Skip LLM extraction — store the text verbatim as a single typed entry. */
  passthrough?: { type: MemoryType };
}

export async function encode(signal: EncodeSignal, ctx: EncodeContext): Promise<MemoryEntry[]> {
  if (signal.text.trim().length < 4) return [];

  if (ctx.passthrough) {
    const entry = createEntry({
      type: ctx.passthrough.type,
      text: signal.text.trim(),
      source: signal.source,
    });
    const stored = await storeWithReinforcement(entry, ctx.twinId);
    memoryBus.emit('all', {
      type: 'memory.encoded',
      twinId: ctx.twinId,
      agent: ctx.agent,
      entries: [stored],
    });
    return [stored];
  }

  let extracted: Array<{ type: string; text: string }> = [];
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: ENCODE_SYSTEM },
      { role: 'user', content: signal.text.slice(0, 2000) },
    ];
    let buf = '';
    for await (const chunk of compute.chatStream(messages, { temperature: 0.1 })) {
      if ('delta' in chunk && chunk.delta) buf += chunk.delta;
      if ('done' in chunk && chunk.done) break;
    }
    const parsed = extractJsonArray(buf);
    if (parsed) extracted = parsed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[memory.encode] extraction failed: ${(err as Error).message}`);
    return [];
  }

  const seen = new Set<string>();
  const entries: MemoryEntry[] = [];
  for (const item of extracted.slice(0, 5)) {
    const type = normalizeType(item.type);
    if (!type || type === 'working') continue;
    const text = item.text.trim().slice(0, 280);
    if (!text) continue;
    const dedupeKey = `${type}:${text.toLowerCase().slice(0, 80)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push(createEntry({ type, text, source: signal.source }));
  }

  const stored: MemoryEntry[] = [];
  for (const entry of entries) {
    stored.push(await storeWithReinforcement(entry, ctx.twinId));
  }

  if (stored.length > 0) {
    memoryBus.emit('all', {
      type: 'memory.encoded',
      twinId: ctx.twinId,
      agent: ctx.agent,
      entries: stored,
    });
  }

  return stored;
}

function createEntry(input: { type: MemoryType; text: string; source: string }): MemoryEntry {
  return {
    id: crypto.randomBytes(6).toString('hex'),
    type: input.type,
    text: input.text,
    source: input.source,
    ts: Date.now(),
    reinforcement: 1,
    stable: false,
  };
}

function extractJsonArray(text: string): Array<{ type: string; text: string }> | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (p) => typeof p?.type === 'string' && typeof p?.text === 'string',
    );
  } catch {
    return null;
  }
}

// === Primitive 2: store =====================================================
export async function store(entry: MemoryEntry, twinId: string): Promise<void> {
  const stream = streamId(twinId, entry.type);
  await storage.writeKv(stream, entry.id, JSON.stringify(entry));
}

async function storeWithReinforcement(entry: MemoryEntry, twinId: string): Promise<MemoryEntry> {
  const stream = streamId(twinId, entry.type);
  const existing = await storage.listKv(stream);
  const norm = entry.text.toLowerCase().trim();
  for (const e of existing) {
    try {
      const parsed = JSON.parse(e.value) as MemoryEntry;
      if (parsed.text.toLowerCase().trim() === norm) {
        const updated: MemoryEntry = {
          ...parsed,
          reinforcement: (parsed.reinforcement ?? 1) + 1,
          stable: (parsed.reinforcement ?? 1) + 1 >= 3,
          ts: Date.now(),
        };
        await storage.writeKv(stream, updated.id, JSON.stringify(updated));
        return updated;
      }
    } catch {
      // skip malformed
    }
  }
  await store(entry, twinId);
  return entry;
}

// === Primitive 3: retrieve ==================================================
export interface RetrieveOptions {
  types: MemoryType[];
  query?: string;
  limit?: number;
  twinId: string;
  preferStable?: boolean;
}

export async function retrieve(opts: RetrieveOptions): Promise<MemoryEntry[]> {
  const all: MemoryEntry[] = [];
  for (const type of opts.types) {
    if (type === 'working') continue;
    const stream = streamId(opts.twinId, type);
    const entries = await storage.listKv(stream);
    for (const e of entries) {
      try {
        const parsed = JSON.parse(e.value) as MemoryEntry;
        all.push(parsed);
      } catch {
        // skip malformed
      }
    }
  }

  const q = opts.query?.toLowerCase().trim();
  const now = Date.now();
  const scored = all.map((entry) => {
    let score = 1;
    if (q && entry.text.toLowerCase().includes(q)) {
      score += 5;
      if (new RegExp(`\\b${escapeRe(q)}\\b`, 'i').test(entry.text)) score += 3;
    }
    if (opts.preferStable && entry.stable) score += 2;
    if ((entry.reinforcement ?? 1) > 1) score += Math.log2(entry.reinforcement);
    const ageWeeks = (now - entry.ts) / (7 * 86_400_000);
    score -= Math.max(0, ageWeeks);
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit ?? 10).map((s) => s.entry);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Convenience: retrieve and emit a memory.read event.
export async function retrieveAndAnnounce(
  opts: RetrieveOptions & { agent: string },
): Promise<MemoryEntry[]> {
  const entries = await retrieve(opts);
  memoryBus.emit('all', {
    type: 'memory.read',
    twinId: opts.twinId,
    agent: opts.agent,
    readTypes: opts.types,
    count: entries.length,
  });
  return entries;
}

// === Primitive 4: update ====================================================
export async function update(
  id: string,
  type: MemoryType,
  patch: Partial<Omit<MemoryEntry, 'id' | 'type'>>,
  twinId: string,
): Promise<MemoryEntry | null> {
  const stream = streamId(twinId, type);
  const value = await storage.readKv(stream, id);
  if (!value) return null;
  try {
    const existing = JSON.parse(value) as MemoryEntry;
    const merged: MemoryEntry = { ...existing, ...patch, id, type, ts: Date.now() };
    await storage.writeKv(stream, id, JSON.stringify(merged));
    memoryBus.emit('all', { type: 'memory.updated', twinId, entry: merged });
    return merged;
  } catch {
    return null;
  }
}

export async function forget(id: string, type: MemoryType, twinId: string): Promise<boolean> {
  const ok = await storage.deleteKv(streamId(twinId, type), id);
  if (ok) memoryBus.emit('all', { type: 'memory.forgotten', twinId, entryId: id, memType: type });
  return ok;
}

// === Primitive 5: stabilize =================================================
let stabilizeTimer: NodeJS.Timeout | null = null;

export function startStabilizeWorker(twinIds: string[] = ['42'], intervalMs = 60_000): void {
  if (stabilizeTimer) return;
  stabilizeTimer = setInterval(() => {
    void stabilizeAll(twinIds);
  }, intervalMs);
}

export function stopStabilizeWorker(): void {
  if (stabilizeTimer) {
    clearInterval(stabilizeTimer);
    stabilizeTimer = null;
  }
}

async function stabilizeAll(twinIds: string[]): Promise<void> {
  for (const twinId of twinIds) {
    for (const type of MEMORY_TYPES) {
      if (type === 'working') continue;
      const stream = streamId(twinId, type);
      const entries = await storage.listKv(stream);
      for (const e of entries) {
        try {
          const parsed = JSON.parse(e.value) as MemoryEntry;
          if (!parsed.stable && (parsed.reinforcement ?? 1) >= 3) {
            await storage.writeKv(
              stream,
              parsed.id,
              JSON.stringify({ ...parsed, stable: true }),
            );
          }
        } catch {
          // skip
        }
      }
    }
  }
}

// === Snapshot bridge =========================================================
// Each encoded entry ticks the snapshot counter for the source specialist.
// Snapshots fire after 3 writes per specialist per 24h (existing logic).
export function recordEncode(source: string, entries: MemoryEntry[]): void {
  if (entries.length === 0) return;
  for (const entry of entries) {
    try {
      recordWrite({ specialistId: source, slice: entry.type, triggeredBy: 'tool' });
    } catch {
      // Unknown specialist — skip without crashing.
    }
  }
}

// === Helpers for routes/UI ===================================================
export async function listAll(twinId: string): Promise<Record<MemoryType, MemoryEntry[]>> {
  const out: Partial<Record<MemoryType, MemoryEntry[]>> = {};
  for (const type of MEMORY_TYPES) {
    const stream = streamId(twinId, type);
    const entries = await storage.listKv(stream);
    out[type] = entries
      .map((e) => {
        try {
          return JSON.parse(e.value) as MemoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is MemoryEntry => e !== null);
  }
  return out as Record<MemoryType, MemoryEntry[]>;
}

export async function countByType(twinId: string): Promise<Record<MemoryType, number>> {
  const all = await listAll(twinId);
  const counts: Partial<Record<MemoryType, number>> = {};
  for (const type of MEMORY_TYPES) {
    counts[type] = all[type]?.length ?? 0;
  }
  return counts as Record<MemoryType, number>;
}
