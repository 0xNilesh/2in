// Task routes — spawn a multi-agent orchestration, then stream its events.
//
//   GET  /api/task/patterns                → { patterns: [...] }
//   POST /api/task                          → { taskId, pattern, totalSteps }
//   GET  /api/task/:taskId/events          SSE
//     events: meta · step.start · step.token · step.tool · step.done · task.done · task.error

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spawnTask, PATTERNS } from '../services/orchestrator.js';
import { subscribe } from '../services/bus.js';
import { sseStream, setSseHeaders } from '../lib/sse.js';

const TwinCtx = z.object({
  name: z.string().optional(),
  twitterHandle: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
}).optional();

const SpawnBody = z.object({
  goal: z.string().min(1),
  pattern: z.string().optional(),
  twin: TwinCtx,
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get('/task/patterns', async () => ({
    patterns: Object.values(PATTERNS).map((p) => ({
      id: p.id,
      title: p.title,
      steps: p.steps.map((s) => ({ idx: s.idx, agent: s.agent, label: s.label })),
    })),
  }));

  app.post('/task', async (req) => {
    const body = SpawnBody.parse(req.body);
    return spawnTask({
      goal: body.goal,
      pattern: body.pattern,
      context: {
        twinName: body.twin?.name ?? '2in',
        twitterHandle: body.twin?.twitterHandle ?? null,
        walletAddress: body.twin?.walletAddress ?? null,
      },
    });
  });

  app.get('/task/:taskId/events', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const sub = subscribe(taskId);
    if (!sub) {
      throw app.httpErrors.notFound(`No task ${taskId}`);
    }

    setSseHeaders(reply);
    const sse = sseStream();

    // Replay history first so a late subscriber catches up.
    for (const ev of sub.history) {
      sse.send(ev.type, ev);
    }
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
    // If the client disconnects, drop our subscription too.
    sse.stream.on('close', () => {
      offEv();
      offClose();
    });

    return sse.stream;
  });
}
