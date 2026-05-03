// Subscribes to /api/task/:taskId/events and assembles a live snapshot of the
// task's state — meta, per-step outputs, current step, status. WorkPane reads
// this when ?task=<id> is in the URL.
//
// Persistence: every meaningful update writes the current snapshot to
// localStorage under `2in:task:<id>`. On mount we hydrate from there
// immediately so reloads + server restarts don't blank out old TaskCards.
// If the server doesn't recognize the taskId (404 — typically because the
// in-memory task bus was wiped on restart), state.serverDropped flips true
// and the UI can show "task expired" instead of "Connecting…" forever.

import { useEffect, useState } from 'react';
import { sseGet } from '../lib/sse.js';
import { scopedKey } from '../lib/scoped-storage.js';

const empty = {
  meta: null,
  steps: {},
  currentStep: 0,
  status: 'pending',
  finalOutput: null,
  cost: null,
  error: null,
  serverDropped: false,
};

function taskKey(taskId) {
  return scopedKey(`task:${taskId}`);
}

function loadCached(taskId) {
  try {
    const raw = window.localStorage.getItem(taskKey(taskId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveCache(taskId, state) {
  try {
    // Don't persist the serverDropped flag — it's UI-only.
    const { serverDropped: _, ...rest } = state;
    window.localStorage.setItem(taskKey(taskId), JSON.stringify(rest));
  } catch { /* localStorage full / blocked — silent */ }
}

export function useTaskStream(taskId) {
  const [state, setState] = useState(empty);

  useEffect(() => {
    if (!taskId) {
      setState(empty);
      return undefined;
    }

    // Hydrate from cache first so the UI doesn't blank.
    const cached = loadCached(taskId);
    setState(cached ? { ...empty, ...cached } : empty);

    const update = (fn) => setState((s) => {
      const next = fn(s);
      saveCache(taskId, next);
      return next;
    });

    const ch = sseGet(`/api/task/${encodeURIComponent(taskId)}/events`);

    ch.onEvent('meta', (ev) => update((s) => ({ ...s, meta: ev.task, status: ev.task.status, serverDropped: false })));
    ch.onEvent('step.start', (ev) => update((s) => ({
      ...s,
      currentStep: ev.idx,
      steps: { ...s.steps, [ev.idx]: { idx: ev.idx, agent: ev.agent, label: ev.label, status: 'live', output: '', tools: [] } },
    })));
    ch.onEvent('step.tool', (ev) => update((s) => {
      const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
      return { ...s, steps: { ...s.steps, [ev.idx]: { ...step, tools: [...(step.tools ?? []), { name: ev.name, args: ev.args, result: ev.result }] } } };
    }));
    ch.onEvent('step.memory.read', (ev) => update((s) => {
      const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
      return { ...s, steps: { ...s.steps, [ev.idx]: { ...step, memRead: { types: ev.types, count: ev.count } } } };
    }));
    ch.onEvent('step.memory.write', (ev) => update((s) => {
      const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
      return { ...s, steps: { ...s.steps, [ev.idx]: { ...step, memWrite: { types: ev.types, count: ev.count } } } };
    }));
    ch.onEvent('step.token', (ev) => update((s) => {
      const step = s.steps[ev.idx];
      if (!step) return s;
      return { ...s, steps: { ...s.steps, [ev.idx]: { ...step, output: (step.output ?? '') + ev.delta } } };
    }));
    ch.onEvent('step.done', (ev) => update((s) => {
      const step = s.steps[ev.idx];
      if (!step) return s;
      return { ...s, steps: { ...s.steps, [ev.idx]: { ...step, status: 'done', output: ev.output, elapsed: ev.elapsed } } };
    }));
    ch.onEvent('task.done', (ev) => update((s) => ({ ...s, status: ev.status, finalOutput: ev.finalOutput, cost: ev.cost })));
    ch.onEvent('task.error', (ev) => update((s) => ({ ...s, status: 'failed', error: ev.message })));

    // 404 → server doesn't know this task (restart wiped its bus). Mark it
    // so the UI can render the cached final state with an "expired" pill
    // instead of pretending to still be connecting.
    ch.onEvent('error', (ev) => {
      if ((ev?.message ?? '').includes('404') || (ev?.message ?? '').toLowerCase().includes('no task')) {
        setState((s) => ({ ...s, serverDropped: true }));
      }
    });

    return () => ch.close();
  }, [taskId]);

  return state;
}
