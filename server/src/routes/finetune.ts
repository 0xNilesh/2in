// Fine-tune routes — start a job, read its state, list per-specialist, and
// stream live events via SSE.
//
//   GET  /api/finetune/mode                          { kind, reason }
//   POST /api/finetune/start                         { jobId, status, progress, ... }
//        body: { specialistId, baseModel?, datasetUri? }
//   GET  /api/finetune/jobs/:jobId                   { Job } | 404
//   GET  /api/finetune/specialists/:id/jobs          { jobs: Job[] }
//   GET  /api/finetune/jobs/:jobId/events            SSE stream

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { finetune } from '../services/finetune.js';
import { sseStream, setSseHeaders } from '../lib/sse.js';

const StartBody = z.object({
  specialistId: z.string().min(1),
  baseModel: z.string().optional(),
  datasetUri: z.string().optional(),
});

export async function finetuneRoutes(app: FastifyInstance): Promise<void> {
  app.get('/finetune/mode', async () => finetune.mode);

  app.post('/finetune/start', async (req) => {
    const body = StartBody.parse(req.body);
    const job = await finetune.start({
      specialistId: body.specialistId,
      baseModel: body.baseModel,
      datasetUri: body.datasetUri,
    });
    return job;
  });

  app.get('/finetune/jobs/:jobId', async (req) => {
    const { jobId } = req.params as { jobId: string };
    const job = finetune.get(jobId);
    if (!job) throw app.httpErrors.notFound(`No job ${jobId}`);
    return job;
  });

  app.get('/finetune/specialists/:id/jobs', async (req) => {
    const { id } = req.params as { id: string };
    return { jobs: finetune.listForSpecialist(id) };
  });

  app.get('/finetune/jobs/:jobId/events', async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const sub = finetune.subscribe(jobId);
    if (!sub) throw app.httpErrors.notFound(`No job ${jobId}`);

    setSseHeaders(reply);
    const sse = sseStream();

    // Replay history first so a late subscriber catches up.
    for (const ev of sub.history) sse.send(ev.type, ev);
    if (sub.closed) {
      sse.close();
      return sse.stream;
    }

    const offEv = sub.on((ev) => sse.send(ev.type, ev));
    const offClose = sub.onClose(() => {
      offEv();
      offClose();
      sse.close();
    });
    sse.stream.on('close', () => {
      offEv();
      offClose();
    });

    return sse.stream;
  });
}
