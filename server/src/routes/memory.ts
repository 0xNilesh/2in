// Memory slice routes — typed KV reads/writes per slice.
//
//   GET  /api/memory/:slice/list?twin=42                  → { entries }
//   POST /api/memory/:slice/write  body: { twin, value, who? }
//   GET  /api/memory/:slice/root?twin=42                  → { rootHash, gatewayUrl }
//
// Slice ids: voice · preference · performance · rejection · relationship
// twin = master tokenId namespace (default 42 for the demo)

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { storage } from '../services/storage.js';
import { recordWrite } from '../services/snapshot.js';
import crypto from 'node:crypto';

// Map slices to a default "owner" specialist for snapshot bookkeeping when
// the route doesn't carry an explicit specialistId. Updated for the
// role-only roster: voice writes belong to Writer, rejection patterns to
// Editor, preferences to Strategist, relationship + performance to
// Companion + Researcher respectively.
const DEFAULT_OWNER: Record<string, string> = {
  voice: 'writer',
  rejection: 'editor',
  preference: 'strategist',
  relationship: 'companion',
  performance: 'researcher',
};

const SLICES = ['voice', 'preference', 'performance', 'rejection', 'relationship'] as const;
type Slice = typeof SLICES[number];

const WriteBody = z.object({
  twin: z.string().default('42'),
  value: z.string().min(1),
  who: z.string().optional(),
});

const ListQuery = z.object({
  twin: z.string().default('42'),
});

function streamId(twin: string, slice: Slice): string {
  return `twin:${twin}:slice:${slice}`;
}

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/memory/:slice/list', async (req) => {
    const slice = (req.params as { slice: string }).slice as Slice;
    if (!SLICES.includes(slice)) throw app.httpErrors.badRequest(`Unknown slice: ${slice}`);
    const q = ListQuery.parse(req.query);
    const entries = await storage.listKv(streamId(q.twin, slice));
    return {
      entries: entries.map((e) => {
        let parsed;
        try { parsed = JSON.parse(e.value); } catch { parsed = { text: e.value }; }
        return { key: e.key, ts: e.ts, ...parsed };
      }),
    };
  });

  app.post('/memory/:slice/write', async (req) => {
    const slice = (req.params as { slice: string }).slice as Slice;
    if (!SLICES.includes(slice)) throw app.httpErrors.badRequest(`Unknown slice: ${slice}`);
    const body = WriteBody.parse(req.body);
    const stream = streamId(body.twin, slice);
    const key = `m-${crypto.randomBytes(6).toString('hex')}`;
    const provenance = body.who ?? 'manual';
    const payload = JSON.stringify({
      who: provenance,
      text: body.value,
      ts: Date.now(),
    });
    await storage.writeKv(stream, key, payload);

    // Tick the snapshot counter for the slice's owner specialist. Manual
    // writes via this endpoint count as 'manual' provenance unless the
    // caller passed a different `who`.
    const owner = DEFAULT_OWNER[slice] ?? 'director';
    const trigger = provenance === 'manual' ? 'manual' : provenance === 'tool' ? 'tool' : 'feedback';
    const { snapshot, pending } = recordWrite({
      specialistId: owner,
      slice,
      triggeredBy: trigger as 'manual' | 'tool' | 'feedback',
    });
    return { key, stream, snapshot, pendingWrites: pending };
  });

  app.get('/memory/:slice/root', async (req) => {
    const slice = (req.params as { slice: string }).slice as Slice;
    if (!SLICES.includes(slice)) throw app.httpErrors.badRequest(`Unknown slice: ${slice}`);
    const q = ListQuery.parse(req.query);
    const entries = await storage.listKv(streamId(q.twin, slice));
    // Snapshot root = sha256 of the entries' canonicalised JSON. In real mode
    // this would be the most recent updateMetadata root; for now we return
    // a deterministic hash so the UI has a non-empty value to display.
    const buf = Buffer.from(JSON.stringify(entries));
    const rootHash = '0x' + crypto.createHash('sha256').update(buf).digest('hex');
    return { rootHash, gatewayUrl: storage.gatewayUrl(rootHash), entries: entries.length };
  });
}
