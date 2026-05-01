// Subscribes to /api/task/:taskId/events and assembles a live snapshot of the
// task's state — meta, per-step outputs, current step, status. WorkPane reads
// this when ?task=<id> is in the URL.

import { useEffect, useState } from 'react';
import { sseGet } from '../lib/sse.js';

const empty = {
  meta: null,
  steps: {}, // idx → { agent, label, status, output, tools[], elapsed? }
  currentStep: 0,
  status: 'pending',
  finalOutput: null,
  cost: null,
  error: null,
};

export function useTaskStream(taskId) {
  const [state, setState] = useState(empty);

  useEffect(() => {
    if (!taskId) {
      setState(empty);
      return undefined;
    }
    setState(empty);

    const ch = sseGet(`/api/task/${encodeURIComponent(taskId)}/events`);

    ch.onEvent('meta', (ev) => {
      setState((s) => ({ ...s, meta: ev.task, status: ev.task.status }));
    });
    ch.onEvent('step.start', (ev) => {
      setState((s) => ({
        ...s,
        currentStep: ev.idx,
        steps: {
          ...s.steps,
          [ev.idx]: { idx: ev.idx, agent: ev.agent, label: ev.label, status: 'live', output: '', tools: [] },
        },
      }));
    });
    ch.onEvent('step.tool', (ev) => {
      setState((s) => {
        const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
        return {
          ...s,
          steps: { ...s.steps, [ev.idx]: { ...step, tools: [...(step.tools ?? []), { name: ev.name, args: ev.args, result: ev.result }] } },
        };
      });
    });
    ch.onEvent('step.memory.read', (ev) => {
      setState((s) => {
        const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
        return {
          ...s,
          steps: { ...s.steps, [ev.idx]: { ...step, memRead: { types: ev.types, count: ev.count } } },
        };
      });
    });
    ch.onEvent('step.memory.write', (ev) => {
      setState((s) => {
        const step = s.steps[ev.idx] ?? { idx: ev.idx, status: 'live', output: '', tools: [] };
        return {
          ...s,
          steps: { ...s.steps, [ev.idx]: { ...step, memWrite: { types: ev.types, count: ev.count } } },
        };
      });
    });
    ch.onEvent('step.token', (ev) => {
      setState((s) => {
        const step = s.steps[ev.idx];
        if (!step) return s;
        return {
          ...s,
          steps: { ...s.steps, [ev.idx]: { ...step, output: (step.output ?? '') + ev.delta } },
        };
      });
    });
    ch.onEvent('step.done', (ev) => {
      setState((s) => {
        const step = s.steps[ev.idx];
        if (!step) return s;
        return {
          ...s,
          steps: { ...s.steps, [ev.idx]: { ...step, status: 'done', output: ev.output, elapsed: ev.elapsed } },
        };
      });
    });
    ch.onEvent('task.done', (ev) => {
      setState((s) => ({
        ...s,
        status: ev.status,
        finalOutput: ev.finalOutput,
        cost: ev.cost,
      }));
    });
    ch.onEvent('task.error', (ev) => {
      setState((s) => ({ ...s, status: 'failed', error: ev.message }));
    });

    return () => ch.close();
  }, [taskId]);

  return state;
}
