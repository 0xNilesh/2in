// Subscribes to a fine-tune job's SSE stream. Returns a live snapshot:
//   { meta, status, progress, etaSeconds, adapterURI, error, finishedAt }
//
// Mirrors useTaskStream. ETA is computed locally from elapsed + progress
// (linear extrapolation), so callers get a live "~22s left" estimate even
// when the server doesn't expose one.

import { useEffect, useState } from 'react';
import { sseGet } from '../lib/sse.js';

const empty = {
  meta: null,
  status: 'queued',
  progress: 0,
  startedAt: null,
  adapterURI: null,
  error: null,
  finishedAt: null,
};

export function useFineTuneJob(jobId) {
  const [state, setState] = useState(empty);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!jobId) {
      setState(empty);
      return undefined;
    }
    setState(empty);

    const ch = sseGet(`/api/finetune/jobs/${encodeURIComponent(jobId)}/events`);
    ch.onEvent('meta', (ev) => {
      setState((s) => ({
        ...s,
        meta: ev.job,
        status: ev.job.status,
        progress: ev.job.progress,
        startedAt: ev.job.startedAt,
      }));
    });
    ch.onEvent('status', (ev) => setState((s) => ({ ...s, status: ev.status })));
    ch.onEvent('progress', (ev) => setState((s) => ({ ...s, progress: ev.progress })));
    ch.onEvent('delivered', (ev) => setState((s) => ({ ...s, adapterURI: ev.adapterURI })));
    ch.onEvent('live', (ev) => setState((s) => ({
      ...s,
      adapterURI: ev.adapterURI,
      status: 'live',
      finishedAt: Date.now(),
    })));
    ch.onEvent('failed', (ev) => setState((s) => ({
      ...s,
      status: 'failed',
      error: ev.message,
      finishedAt: Date.now(),
    })));

    return () => ch.close();
  }, [jobId]);

  // Tick to refresh the local ETA every second while a job is running.
  useEffect(() => {
    if (state.status !== 'training' && state.status !== 'queued') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  const etaSeconds = computeEta(state, now);

  return { ...state, etaSeconds };
}

function computeEta(state, now) {
  if (state.status !== 'training' && state.status !== 'queued') return null;
  if (!state.startedAt || state.progress <= 0) return null;
  const elapsedMs = now - state.startedAt;
  const totalMs = (elapsedMs / state.progress) * 100;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return Math.round(remainingMs / 1000);
}
