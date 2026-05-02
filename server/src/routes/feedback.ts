// Feedback routes — surface Approve / Reject decisions on tasks. Each writes
// to the appropriate typed memory slice and ticks the snapshot counter.
//
//   POST /api/task/:taskId/approve   { specialistId? }
//        → writes finalOutput to voice_memory (if specialist resolved)
//        → optional snapshot
//   POST /api/task/:taskId/reject    { specialistId?, reason }
//        → writes diff/reason to rejection_memory
//        → optional snapshot
//
//   GET  /api/chain/snapshots/:tokenId  → snapshot history (live + seed)
//   GET  /api/snapshots/events           SSE for live snapshot/write events

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { storage } from '../services/storage.js';
import { subscribe as bus } from '../services/bus.js';
import { recordWrite, getSnapshots, subscribe as snapshotSub } from '../services/snapshot.js';
import { sseStream, setSseHeaders } from '../lib/sse.js';
import crypto from 'node:crypto';

const ApproveBody = z.object({
  specialistId: z.string().optional(),
  finalOutput: z.string().optional(),
});

const RejectBody = z.object({
  specialistId: z.string().optional(),
  reason: z.string().min(1),
  finalOutput: z.string().optional(),
});

function streamId(twinId: string, slice: string): string {
  return `twin:${twinId}:slice:${slice}`;
}

function specialistFromTask(taskId: string): { specialistId: string; finalOutput: string } | null {
  const taskBus = bus(taskId);
  if (!taskBus) return null;
  // Walk events to find:
  //   - the last specialist that ran (whose iNFT gets the snapshot tick)
  //   - the resolved final draft from task.done (orchestrator already
  //     applied SHIP/EDIT resolution there, so prefer it)
  //   - per-step outputs so we can fall back to Writer's draft if Editor
  //     was last and verdict was SHIP
  let lastSpecialist: string | undefined;
  let writerOutput = '';
  let editorVerdict = '';
  let lastOutput = '';
  let finalOutput = '';
  for (const ev of taskBus.history) {
    if (ev.type === 'step.start') lastSpecialist = ev.agent;
    if (ev.type === 'step.done') {
      lastOutput = ev.output;
      // Capture Writer / Editor outputs separately so we can resolve below.
      // (We can't read agent off step.done directly — match by tracking the
      // most recent step.start agent instead.)
      if (lastSpecialist === 'writer') writerOutput = ev.output;
      if (lastSpecialist === 'editor') editorVerdict = ev.output;
    }
    if (ev.type === 'task.done') finalOutput = ev.finalOutput || lastOutput;
  }
  if (!lastSpecialist) return null;
  // For approval purposes, attribute the win to Writer when Editor said
  // SHIP — Writer's draft is what's being saved, so the snapshot tick + the
  // memory write should belong to Writer's iNFT.
  let attribSpecialist = lastSpecialist;
  if (lastSpecialist === 'editor' && /^ship\.?$/i.test(editorVerdict.trim().split(/\n/)[0] ?? '')) {
    if (writerOutput) attribSpecialist = 'writer';
  }
  return { specialistId: attribSpecialist, finalOutput: finalOutput || lastOutput };
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  // --- approve ---
  app.post('/task/:taskId/approve', async (req) => {
    const { taskId } = req.params as { taskId: string };
    const body = ApproveBody.parse(req.body ?? {});
    const inferred = specialistFromTask(taskId);
    const specialistId = body.specialistId ?? inferred?.specialistId;
    const text = body.finalOutput ?? inferred?.finalOutput;
    if (!specialistId) {
      throw app.httpErrors.badRequest('specialistId required and not inferable from task');
    }
    if (!text) {
      throw app.httpErrors.badRequest('finalOutput required and not present in task');
    }

    const stream = streamId('42', 'voice');
    const key = `v-${crypto.randomBytes(6).toString('hex')}`;
    await storage.writeKv(stream, key, JSON.stringify({
      who: 'approved',
      specialist: specialistId,
      text,
      taskId,
      ts: Date.now(),
    }));

    const { snapshot, pending } = recordWrite({
      specialistId,
      slice: 'voice',
      triggeredBy: 'feedback',
    });
    return { ok: true, slice: 'voice', key, specialistId, snapshot, pendingWrites: pending };
  });

  // --- reject ---
  app.post('/task/:taskId/reject', async (req) => {
    const { taskId } = req.params as { taskId: string };
    const body = RejectBody.parse(req.body);
    const inferred = specialistFromTask(taskId);
    const specialistId = body.specialistId ?? inferred?.specialistId;
    const text = body.finalOutput ?? inferred?.finalOutput ?? '<no output captured>';
    if (!specialistId) {
      throw app.httpErrors.badRequest('specialistId required and not inferable from task');
    }

    const stream = streamId('42', 'rejection');
    const key = `r-${crypto.randomBytes(6).toString('hex')}`;
    await storage.writeKv(stream, key, JSON.stringify({
      who: 'rejected',
      specialist: specialistId,
      draft: text,
      reason: body.reason,
      taskId,
      ts: Date.now(),
    }));

    const { snapshot, pending } = recordWrite({
      specialistId,
      slice: 'rejection',
      triggeredBy: 'feedback',
    });
    return { ok: true, slice: 'rejection', key, specialistId, snapshot, pendingWrites: pending };
  });

  // --- chain snapshots history ---
  app.get('/chain/snapshots/:tokenId', async (req) => {
    const tokenId = Number((req.params as { tokenId: string }).tokenId);
    if (!Number.isFinite(tokenId) || tokenId < 1) {
      throw app.httpErrors.badRequest('tokenId must be a positive integer');
    }
    return { snapshots: getSnapshots(tokenId) };
  });

  // --- snapshot live SSE (for toasts + profile auto-refresh) ---
  app.get('/snapshots/events', async (req, reply) => {
    const sub = snapshotSub();
    if (!sub) throw app.httpErrors.internalServerError('snapshot bus unavailable');

    setSseHeaders(reply);
    const sse = sseStream();
    for (const ev of sub.history) sse.send(ev.type, ev);
    const off = sub.on((ev) => sse.send(ev.type, ev));
    sse.stream.on('close', () => off());
    return sse.stream;
  });
}
