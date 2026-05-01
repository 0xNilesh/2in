// Storage tools — uploads to 0G Storage Indexer (mock = sha256 hash).

import { z } from 'zod';
import { storage } from '../storage.js';
import type { Tool } from './types.js';

export const store: Tool = {
  name: 'store',
  description: 'Upload bytes to 0G Storage. Returns root hash + public gateway URL.',
  category: 'storage',
  input: z.object({
    content: z.string().min(1),
    contentType: z.enum(['text', 'json', 'base64']).default('text'),
    filename: z.string().optional(),
  }),
  execute: async (input) => {
    const buf = input.contentType === 'base64'
      ? Buffer.from(input.content, 'base64')
      : Buffer.from(input.content, 'utf8');
    const res = await storage.uploadBlob(buf);
    return { ...res, filename: input.filename ?? null };
  },
};
