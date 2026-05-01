// Generic per-key event bus with replay history + TTL eviction.
//
// One instance per "channel kind" (e.g. tasks, fine-tune jobs). Each call to
// `open(key)` mints a fresh in-memory channel; `emit(key, event)` appends to
// its history and notifies subscribers; `subscribe(key)` returns the snapshot
// + an `on(handler)` for live updates and an `onClose(handler)` for completion.
//
// `terminalEvent` (optional) names the event type that closes the channel —
// emitting it stops further updates and starts the TTL timer to GC the entry.

import { EventEmitter } from 'node:events';

export interface EventBusOptions<E extends { type: string }> {
  /** ms after a channel closes before its history is evicted. */
  ttlMs?: number;
  /** event type names that close the channel (e.g. ['task.done','task.error']) */
  terminalTypes?: E['type'][];
}

export interface BusSubscription<E> {
  history: E[];
  closed: boolean;
  on: (cb: (ev: E) => void) => () => void;
  onClose: (cb: () => void) => () => void;
}

interface Entry<E> {
  emitter: EventEmitter;
  history: E[];
  closed: boolean;
  createdAt: number;
}

export interface EventBus<E extends { type: string }> {
  open: (key: string) => EventEmitter;
  emit: (key: string, ev: E) => void;
  subscribe: (key: string) => BusSubscription<E> | null;
}

export function createBus<E extends { type: string }>(
  opts: EventBusOptions<E> = {},
): EventBus<E> {
  const ttlMs = opts.ttlMs ?? 30 * 60 * 1000;
  const terminal = new Set<string>(opts.terminalTypes ?? []);
  const buses = new Map<string, Entry<E>>();

  // Periodic GC for closed channels past TTL.
  const gc = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buses) {
      if (v.closed && now - v.createdAt > ttlMs) buses.delete(k);
    }
  }, 5 * 60 * 1000);
  // Don't keep the event loop alive on this timer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (gc as any).unref?.();

  return {
    open(key) {
      const entry: Entry<E> = {
        emitter: new EventEmitter(),
        history: [],
        closed: false,
        createdAt: Date.now(),
      };
      buses.set(key, entry);
      return entry.emitter;
    },

    emit(key, ev) {
      const entry = buses.get(key);
      if (!entry) return;
      entry.history.push(ev);
      entry.emitter.emit('event', ev);
      if (terminal.has(ev.type)) {
        entry.closed = true;
        entry.emitter.emit('close');
      }
    },

    subscribe(key) {
      const entry = buses.get(key);
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
    },
  };
}
