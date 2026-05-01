// Memory tools — thin wrappers over the memory primitive layer
// (services/memory.ts). The new typed surface accepts both new types
// (episodic | semantic | relationship | temporal | procedural | working)
// and legacy slice names (voice, preference, performance, rejection,
// relationship) which are normalised before reading/writing.

import { z } from 'zod';
import crypto from 'node:crypto';
import type { KvEntry } from '../storage.js';
import { storage } from '../storage.js';
import {
  MEMORY_TYPES,
  normalizeType,
  retrieve,
  store,
  streamIdFor,
  type MemoryEntry,
  type MemoryType,
} from '../memory.js';
import type { Tool } from './types.js';

// Accept the union of memory types and legacy slice aliases.
const SLICES = z.enum([
  ...MEMORY_TYPES,
  'voice', 'preference', 'performance', 'rejection',
] as [string, ...string[]]);

function resolveType(raw: string): MemoryType {
  const t = normalizeType(raw);
  if (!t) throw new Error(`Unknown memory type: ${raw}`);
  return t;
}

export const readMemory: Tool = {
  name: 'read_memory',
  description: 'Read entries from a typed memory slice. Slices: episodic, semantic, relationship, temporal, procedural. Legacy aliases (voice, preference, performance, rejection) accepted.',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    key: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  execute: async (input, ctx) => {
    const type = resolveType(input.slice);
    const stream = streamIdFor(ctx.twinId, type);
    if (input.key) {
      const value = await storage.readKv(stream, input.key);
      return { stream, key: input.key, value, hit: value != null };
    }
    const entries = await storage.listKv(stream);
    const limited = input.limit ? entries.slice(0, input.limit) : entries;
    return { stream, type, count: limited.length, entries: limited.map(decodeEntry) };
  },
};

export const writeMemory: Tool = {
  name: 'write_memory',
  description: 'Append an entry to a typed memory slice. Defaults to "tool" provenance.',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    value: z.string().min(1),
    who: z.string().optional(),
  }),
  execute: async (input, ctx) => {
    const type = resolveType(input.slice);
    const entry: MemoryEntry = {
      id: `t-${crypto.randomBytes(6).toString('hex')}`,
      type,
      text: input.value,
      source: input.who ?? 'tool',
      ts: Date.now(),
      reinforcement: 1,
      stable: false,
    };
    await store(entry, ctx.twinId);
    return { id: entry.id, type, stream: streamIdFor(ctx.twinId, type) };
  },
};

export const searchMemory: Tool = {
  name: 'search_memory',
  description: 'Search a slice for matches. Returns top-N by recency + relevance.',
  category: 'memory',
  input: z.object({
    slice: SLICES,
    query: z.string().min(1),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async (input, ctx) => {
    const type = resolveType(input.slice);
    const matches = await retrieve({
      types: [type],
      query: input.query,
      limit: input.limit ?? 10,
      twinId: ctx.twinId,
    });
    return {
      type,
      query: input.query,
      count: matches.length,
      matches: matches.map((m) => ({
        id: m.id,
        text: m.text,
        who: m.source,
        ts: m.ts,
        stable: m.stable,
      })),
    };
  },
};

function decodeEntry(e: KvEntry): { key: string; ts: number; who?: string; text?: string; value: string } {
  try {
    const parsed = JSON.parse(e.value);
    return { key: e.key, ts: e.ts, who: parsed.source ?? parsed.who, text: parsed.text, value: e.value };
  } catch {
    return { key: e.key, ts: e.ts, value: e.value, text: e.value };
  }
}
