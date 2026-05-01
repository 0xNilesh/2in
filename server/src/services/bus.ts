// Per-task event bus. In-memory EventEmitter map keyed by taskId. The
// orchestrator emits events; the SSE route forwards them to clients.
//
// Events the UI consumes (matched in WorkPane):
//   meta            — { task: { id, title, pattern, status, totalSteps } }
//   step.start      — { idx, agent, label }
//   step.token      — { idx, delta }
//   step.tool       — { idx, name, args, result }
//   step.done       — { idx, output, elapsed }
//   task.done       — { id, status, finalOutput, cost }
//   task.error      — { id, message }
//
// We keep a short replay buffer per task so a late SSE subscriber can catch
// up to current state instead of seeing only events that happen after they
// connected (matters because the client connects ~immediately after POST,
// but a few events may already have been emitted).

import { EventEmitter } from 'node:events';

export type BusEvent =
  | { type: 'meta'; task: { id: string; title: string; pattern: string; status: string; totalSteps: number } }
  | { type: 'step.start'; idx: number; agent: string; label: string }
  | { type: 'step.token'; idx: number; delta: string }
  | { type: 'step.tool'; idx: number; name: string; args: string; result: string }
  | { type: 'step.done'; idx: number; output: string; elapsed: string }
  | { type: 'task.done'; id: string; status: string; finalOutput: string; cost: string }
  | { type: 'task.error'; id: string; message: string };

interface BusEntry {
  emitter: EventEmitter;
  history: BusEvent[];
  closed: boolean;
  createdAt: number;
}

const buses = new Map<string, BusEntry>();
const TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buses) {
    if (v.closed && now - v.createdAt > TTL_MS) buses.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

export function openBus(taskId: string): EventEmitter {
  const entry: BusEntry = {
    emitter: new EventEmitter(),
    history: [],
    closed: false,
    createdAt: Date.now(),
  };
  buses.set(taskId, entry);
  return entry.emitter;
}

export function emit(taskId: string, ev: BusEvent): void {
  const entry = buses.get(taskId);
  if (!entry) return;
  entry.history.push(ev);
  entry.emitter.emit('event', ev);
  if (ev.type === 'task.done' || ev.type === 'task.error') {
    entry.closed = true;
    entry.emitter.emit('close');
  }
}

export interface BusSubscription {
  history: BusEvent[];
  closed: boolean;
  on: (cb: (ev: BusEvent) => void) => () => void;
  onClose: (cb: () => void) => () => void;
}

export function subscribe(taskId: string): BusSubscription | null {
  const entry = buses.get(taskId);
  if (!entry) return null;
  return {
    history: [...entry.history],
    closed: entry.closed,
    on(cb) {
      entry.emitter.on('event', cb);
      return () => entry.emitter.off('event', cb);
    },
    onClose(cb) {
      entry.emitter.on('close', cb);
      return () => entry.emitter.off('close', cb);
    },
  };
}
