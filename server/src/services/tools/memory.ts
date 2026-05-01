// Memory tools — thin wrappers over the storage KV API. Stream namespacing
// matches routes/memory.ts so manual + tool-driven entries land in the same
// slice.

import { z } from 'zod';
import crypto from 'node:crypto';
import { storage, type KvEntry } from '../storage.js';
import type { Tool } from './types.js';

const SLICES = z.enum(['voice', 'preference', 'performance', 'rejection', 'relationship']);

function streamId(twinId: string, slice: z.infer<typeof SLICES>): string {
  return `twin:${twinId}:slice:${slice}`;
}

export const readMemory: Tool = {
  name: 'read_memory',
  description: 'Read entries from a typed memory slice. Optionally filter by key.',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    key: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  execute: async (input, ctx) => {
    const stream = streamId(ctx.twinId, input.slice);
    if (input.key) {
      const value = await storage.readKv(stream, input.key);
      return { stream, key: input.key, value, hit: value != null };
    }
    const entries = await storage.listKv(stream);
    const limited = input.limit ? entries.slice(0, input.limit) : entries;
    return { stream, count: limited.length, entries: limited.map(decode) };
  },
};

export const writeMemory: Tool = {
  name: 'write_memory',
  description: 'Append an entry to a typed memory slice. Provenance defaults to "tool".',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    value: z.string().min(1),
    who: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const stream = streamId(ctx.twinId, input.slice);
    const key = `t-${crypto.randomBytes(6).toString('hex')}`;
    const payload = JSON.stringify({
      who: input.who ?? 'tool',
      text: input.value,
      ts: Date.now(),
    });
    await storage.writeKv(stream, key, payload);
    return { stream, key };
  },
};

export const searchMemory: Tool = {
  name: 'search_memory',
  description: 'Substring search across a slice. Case-insensitive. Returns matched entries with rank.',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async (input, ctx) => {
    const stream = streamId(ctx.twinId, input.slice);
    const entries = await storage.listKv(stream);
    const q = input.query.toLowerCase();
    const matches = entries
      .map((e) => ({ entry: decode(e), score: scoreMatch(decode(e).text ?? e.value, q) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 10);
    return { stream, query: input.query, count: matches.length, matches };
  },
};

function decode(e: KvEntry): { key: string; ts: number; who?: string; text?: string; value: string } {
  try {
    const parsed = JSON.parse(e.value);
    return { key: e.key, ts: e.ts, ...parsed, value: e.value };
  } catch {
    return { key: e.key, ts: e.ts, value: e.value, text: e.value };
  }
}

function scoreMatch(text: string, q: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx < 0) return 0;
  // Exact word match scores higher than substring.
  const wordHit = new RegExp(`\\b${escapeRe(q)}\\b`, 'i').test(text) ? 2 : 1;
  // Earlier hits score higher.
  return wordHit + (1 - Math.min(idx, 100) / 100);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
