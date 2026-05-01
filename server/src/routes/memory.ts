// Memory routes — typed read/write/encode/forget/stream over the memory
// primitive layer (services/memory.ts).
//
//   GET    /api/memory/list?twin=42                       → { types, counts }
//   GET    /api/memory/:type/list?twin=42                 → { entries }
//   POST   /api/memory/:type/write   body: { twin, value, who? }
//   POST   /api/memory/encode        body: { twin, text, source?, agent? }
//   DELETE /api/memory/:type/:id?twin=42                  → { ok }
//   GET    /api/memory/:type/root?twin=42                 → { rootHash, gatewayUrl }
//   GET    /api/memory/export?twin=42                     → JSON dump (file)
//   GET    /api/memory/stream                              SSE — live memory events
//
// Typed slices: episodic | semantic | relationship | temporal | procedural | working
// Legacy aliases (voice/preference/performance/rejection/relationship) accepted on
// the :type path and on the WriteBody so old clients keep working.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { storage } from '../services/storage.js';
import { recordWrite } from '../services/snapshot.js';
import {
  encode,
  forget,
  listAll,
  countByType,
  normalizeType,
  store,
  subscribeMemory,
  MEMORY_TYPES,
  streamIdFor,
  type MemoryType,
  type MemoryEntry,
} from '../services/memory.js';
import { sseStream, setSseHeaders } from '../lib/sse.js';
import crypto from 'node:crypto';

// Snapshot bookkeeping default owner per type. When a manual write lands and
// no `who` was supplied, attribute it to the specialist most likely to own
// that type so the snapshot counter still ticks against a real iNFT.
const DEFAULT_OWNER: Record<MemoryType, string> = {
  episodic: 'researcher',
  semantic: 'companion',
  relationship: 'companion',
  temporal: 'strategist',
  procedural: 'editor',
  working: 'director',
};

const WriteBody = z.object({
  twin: z.string().default('42'),
  value: z.string().min(1),
  who: z.string().optional(),
});

const EncodeBody = z.object({
  twin: z.string().default('42'),
  text: z.string().min(1),
  source: z.string().optional(),
  agent: z.string().optional(),
});

const ListQuery = z.object({
  twin: z.string().default('42'),
});

function resolveType(raw: string): MemoryType {
  const t = normalizeType(raw);
  if (!t) throw new Error(`Unknown memory type: ${raw}`);
  return t;
}

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // === Top-level list — counts per type =====================================
  app.get('/memory/list', async (req) => {
    const q = ListQuery.parse(req.query);
    const counts = await countByType(q.twin);
    return { types: MEMORY_TYPES, counts };
  });

  // === Per-type list ========================================================
  app.get('/memory/:type/list', async (req) => {
    const raw = (req.params as { type: string }).type;
    let type: MemoryType;
    try { type = resolveType(raw); } catch (err) { throw app.httpErrors.badRequest((err as Error).message); }
    const q = ListQuery.parse(req.query);
    const all = await listAll(q.twin);
    return {
      type,
      entries: all[type].map((e) => ({
        id: e.id,
        type: e.type,
        text: e.text,
        who: e.source,
        ts: e.ts,
        reinforcement: e.reinforcement,
        stable: e.stable,
      })),
    };
  });

  // === Manual write =========================================================
  app.post('/memory/:type/write', async (req) => {
    const raw = (req.params as { type: string }).type;
    let type: MemoryType;
    try { type = resolveType(raw); } catch (err) { throw app.httpErrors.badRequest((err as Error).message); }
    const body = WriteBody.parse(req.body);
    const provenance = body.who ?? 'manual';
    const entry: MemoryEntry = {
      id: crypto.randomBytes(6).toString('hex'),
      type,
      text: body.value,
      source: provenance,
      ts: Date.now(),
      reinforcement: 1,
      stable: false,
    };
    await store(entry, body.twin);

    const owner = (provenance === 'manual' ? DEFAULT_OWNER[type] : provenance) ?? 'director';
    const trigger = provenance === 'manual' ? 'manual' : provenance === 'tool' ? 'tool' : 'feedback';
    const { snapshot, pending } = recordWrite({
      specialistId: owner,
      slice: type,
      triggeredBy: trigger as 'manual' | 'tool' | 'feedback',
    });
    return { id: entry.id, type, snapshot, pendingWrites: pending };
  });

  // === LLM-driven encode ====================================================
  app.post('/memory/encode', async (req) => {
    const body = EncodeBody.parse(req.body);
    const entries = await encode(
      { kind: 'manual', text: body.text, source: body.source ?? 'manual' },
      { twinId: body.twin, agent: body.agent },
    );
    return { count: entries.length, entries };
  });

  // === Forget ===============================================================
  app.delete('/memory/:type/:id', async (req) => {
    const { type: raw, id } = req.params as { type: string; id: string };
    let type: MemoryType;
    try { type = resolveType(raw); } catch (err) { throw app.httpErrors.badRequest((err as Error).message); }
    const q = ListQuery.parse(req.query);
    const ok = await forget(id, type, q.twin);
    return { ok };
  });

  // === Per-type root (deterministic snapshot of current entries) ============
  app.get('/memory/:type/root', async (req) => {
    const raw = (req.params as { type: string }).type;
    let type: MemoryType;
    try { type = resolveType(raw); } catch (err) { throw app.httpErrors.badRequest((err as Error).message); }
    const q = ListQuery.parse(req.query);
    const stream = streamIdFor(q.twin, type);
    const entries = await storage.listKv(stream);
    const buf = Buffer.from(JSON.stringify(entries));
    const rootHash = '0x' + crypto.createHash('sha256').update(buf).digest('hex');
    return { type, rootHash, gatewayUrl: storage.gatewayUrl(rootHash), entries: entries.length };
  });

  // === Full export ==========================================================
  app.get('/memory/export', async (req, reply) => {
    const q = ListQuery.parse(req.query);
    const all = await listAll(q.twin);
    reply.header('content-type', 'application/json');
    reply.header('content-disposition', `attachment; filename="2in-memory-${q.twin}.json"`);
    return { twin: q.twin, exportedAt: Date.now(), memory: all };
  });

  // === Live stream ==========================================================
  app.get('/memory/stream', async (_req, reply) => {
    const sub = subscribeMemory();
    if (!sub) throw app.httpErrors.internalServerError('memory bus not initialised');

    setSseHeaders(reply);
    const sse = sseStream();
    // Open with a hello so EventSource clients know they're connected.
    sse.send('memory.hello', { ts: Date.now() });

    const offEv = sub.on((ev) => sse.send(ev.type, ev));
    const offClose = sub.onClose(() => { offEv(); offClose(); sse.close(); });
    sse.stream.on('close', () => { offEv(); offClose(); });

    return sse.stream;
  });
}
