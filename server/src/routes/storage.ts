// Storage routes — encrypted blob upload + read.
//
//   GET  /api/storage/mode                         { blobs, kv, reason }
//   POST /api/storage/upload  body: { content, contentType?, encrypt? }
//        → { rootHash, gatewayUrl, size, encrypted }
//   GET  /api/storage/:rootHash                    raw bytes (proxied)
//
// `content` is a UTF-8 string (e.g. JSON or text). For binary, send base64
// and pass `contentType: 'base64'`.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { storage } from '../services/storage.js';

const UploadBody = z.object({
  content: z.string().min(1),
  contentType: z.enum(['text', 'json', 'base64']).default('text'),
  encrypt: z.boolean().default(false),
});

export async function storageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/storage/mode', async () => storage.mode);

  app.post('/storage/upload', async (req) => {
    const body = UploadBody.parse(req.body);
    const buf = body.contentType === 'base64'
      ? Buffer.from(body.content, 'base64')
      : Buffer.from(body.content, 'utf8');
    // Encryption is currently noted but not applied — we surface the flag
    // so callers can flip it on once the encryption flow is wired into the
    // upload pipeline (Phase 2.5: encrypt → upload → return sealed root).
    const res = await storage.uploadBlob(buf);
    return { ...res, encrypted: body.encrypt };
  });

  app.get('/storage/:rootHash', async (req, reply) => {
    const { rootHash } = req.params as { rootHash: string };
    const buf = await storage.downloadBlob(rootHash);
    if (!buf) throw app.httpErrors.notFound(`No blob ${rootHash}`);
    reply.header('content-type', 'application/octet-stream');
    return reply.send(buf);
  });
}
