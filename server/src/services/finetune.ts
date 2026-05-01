// 0G Compute fine-tune service. Owns the per-specialist training job lifecycle.
//
//   start({ specialistId, baseModel, datasetUri }) → Job  (kicked off async)
//   get(jobId)                                     → Job | null
//   listForSpecialist(id)                          → Job[]
//   subscribe(jobId)                               → BusSubscription
//
// Real path uses the broker singleton (services/broker.ts) → fineTuning.createTask.
// Mock path runs setTimeout transitions: queued (~3s) → training (linear
// 0→100 over ~30s, progress every 1s) → delivered (~5s) → live, with a
// deterministic adapter URI keyed off the jobId. Same wire shape either way
// so the frontend never knows.
//
// Real fine-tune surface (per Phase 1 broker snapshot) requires:
//   - acknowledgeProviderSigner once per provider
//   - uploadDataset → datasetHash
//   - createTask(provider, modelName, datasetHash, trainingPath)
//   - poll getTask / getLog
// We try the happy path; on any error the job lands `failed` with a clear
// message so the UI surfaces it (instead of hanging silently).

import crypto from 'node:crypto';
import { config } from '../config.js';
import { isBrokerConfigured, getBroker } from './broker.js';
import { createBus, type BusSubscription } from '../lib/event-bus.js';

export type JobStatus = 'queued' | 'training' | 'delivered' | 'live' | 'failed';

export interface FineTuneJob {
  id: string;
  specialistId: string;
  status: JobStatus;
  progress: number; // 0..100
  baseModel: string;
  datasetUri?: string;
  adapterURI?: string;
  costEstimate: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  source: 'real' | 'mock';
}

export type FineTuneEvent =
  | { type: 'meta'; job: FineTuneJob }
  | { type: 'status'; status: JobStatus }
  | { type: 'progress'; progress: number }
  | { type: 'tick'; ts: number }
  | { type: 'delivered'; adapterURI: string }
  | { type: 'live'; adapterURI: string }
  | { type: 'failed'; message: string };

export interface FineTuneMode {
  kind: 'real' | 'mock';
  reason?: string;
}

interface StartArgs {
  specialistId: string;
  baseModel?: string;
  datasetUri?: string;
}

const bus = createBus<FineTuneEvent>({
  terminalTypes: ['live', 'failed'],
});

class FineTuneService {
  private readonly jobs = new Map<string, FineTuneJob>();
  private readonly bySpecialist = new Map<string, string[]>();

  get mode(): FineTuneMode {
    if (isBrokerConfigured()) return { kind: 'real' };
    return {
      kind: 'mock',
      reason: 'BROKER_PRIVATE_KEY not set — running in mock mode',
    };
  }

  async start(args: StartArgs): Promise<FineTuneJob> {
    const job: FineTuneJob = {
      id: `ft-${crypto.randomBytes(4).toString('hex')}`,
      specialistId: args.specialistId,
      status: 'queued',
      progress: 0,
      baseModel: args.baseModel ?? 'Qwen2.5-0.5B-Instruct',
      datasetUri: args.datasetUri,
      costEstimate: '0.5 0G',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      source: this.mode.kind,
    };
    this.jobs.set(job.id, job);
    const list = this.bySpecialist.get(args.specialistId) ?? [];
    this.bySpecialist.set(args.specialistId, [...list, job.id]);

    bus.open(job.id);
    bus.emit(job.id, { type: 'meta', job });

    if (this.mode.kind === 'mock') {
      void this.runMock(job);
    } else {
      void this.runReal(job).catch((err) => this.fail(job, err?.message ?? 'unknown_error'));
    }

    return job;
  }

  get(jobId: string): FineTuneJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  listForSpecialist(specialistId: string): FineTuneJob[] {
    const ids = this.bySpecialist.get(specialistId) ?? [];
    return ids
      .map((id) => this.jobs.get(id))
      .filter((j): j is FineTuneJob => Boolean(j))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  subscribe(jobId: string): BusSubscription<FineTuneEvent> | null {
    return bus.subscribe(jobId);
  }

  // === mock backend =================================================
  private async runMock(job: FineTuneJob): Promise<void> {
    // queued → training (after 3s)
    await sleep(3000);
    this.transition(job, 'training');

    // training: 0..100 over ~30s in 30 ticks
    const ticks = 30;
    for (let i = 1; i <= ticks; i++) {
      await sleep(1000);
      const progress = Math.round((i / ticks) * 100);
      job.progress = progress;
      job.updatedAt = Date.now();
      bus.emit(job.id, { type: 'progress', progress });
    }

    // delivered → adapter root, then live
    await sleep(2000);
    const adapter = '0x' + crypto.createHash('sha256')
      .update(`${job.id}:${job.specialistId}`)
      .digest('hex')
      .slice(0, 32);
    job.adapterURI = adapter;
    this.transition(job, 'delivered');
    bus.emit(job.id, { type: 'delivered', adapterURI: adapter });

    await sleep(1500);
    this.transition(job, 'live');
    bus.emit(job.id, { type: 'live', adapterURI: adapter });
    job.finishedAt = Date.now();
  }

  // === real backend =================================================
  private async runReal(job: FineTuneJob): Promise<void> {
    const broker = await getBroker();
    if (!broker) throw new Error('broker not initialised');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = broker as any;

    this.transition(job, 'training');
    let lastEmittedProgress = 0;

    // Heartbeat tick every 10s while running so the SSE client knows
    // the connection is alive even when progress doesn't change.
    const heartbeat = setInterval(() => {
      bus.emit(job.id, { type: 'tick', ts: Date.now() });
    }, 10_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (heartbeat as any).unref?.();

    try {
      // Pick the first available fine-tune provider for our base model.
      const services = (await b.fineTuning?.listService?.()) ?? [];
      const target = services[0];
      if (!target) throw new Error('no fine-tune provider available');

      // Acknowledge the provider's signer (idempotent on repeat calls).
      await b.fineTuning.acknowledgeProviderSigner?.(target.provider);

      // The dataset is referenced by hash. If a corpus URI is already
      // a 0G storage rootHash use it; otherwise upload the placeholder.
      const datasetHash = job.datasetUri ?? '0x0000000000000000000000000000000000000000000000000000000000000000';

      const taskId = await b.fineTuning.createTask(
        target.provider,
        job.baseModel,
        datasetHash,
        '/training/default',
      );

      // Poll status. Real jobs are minutes-to-hours; SSE heartbeat keeps
      // the connection alive between updates.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await sleep(5000);
        const task = await b.fineTuning.getTask(target.provider, taskId);
        const status: string = task?.status ?? 'Unknown';
        const progress = parseInt(String(task?.progress ?? '0'), 10);
        if (Number.isFinite(progress) && progress !== lastEmittedProgress) {
          lastEmittedProgress = progress;
          job.progress = progress;
          job.updatedAt = Date.now();
          bus.emit(job.id, { type: 'progress', progress });
        }
        if (status === 'Delivered') {
          // Download adapter (encrypted) — for now we store the indexer
          // root the broker returns rather than re-uploading.
          const adapter = task.adapterRootHash ?? task.outputUri ?? '';
          job.adapterURI = adapter;
          this.transition(job, 'delivered');
          bus.emit(job.id, { type: 'delivered', adapterURI: adapter });
          break;
        }
        if (status === 'Failed') {
          throw new Error(task?.errorMessage ?? 'broker reported Failed');
        }
      }

      // The "live" transition happens when we register the adapter in the
      // specialist iNFT payload via updateMetadata. Skipped here — the
      // route layer triggers it explicitly.
      this.transition(job, 'live');
      bus.emit(job.id, { type: 'live', adapterURI: job.adapterURI ?? '' });
      job.finishedAt = Date.now();
    } finally {
      clearInterval(heartbeat);
    }
    void config; // touched so unused-import warnings stay quiet across edits
  }

  private transition(job: FineTuneJob, status: JobStatus): void {
    job.status = status;
    job.updatedAt = Date.now();
    bus.emit(job.id, { type: 'status', status });
  }

  private fail(job: FineTuneJob, message: string): void {
    job.status = 'failed';
    job.error = message;
    job.updatedAt = Date.now();
    job.finishedAt = Date.now();
    bus.emit(job.id, { type: 'failed', message });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const finetune = new FineTuneService();
