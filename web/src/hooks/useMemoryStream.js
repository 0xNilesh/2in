// Subscribes to /api/memory/stream SSE — long-lived, broadcasts every memory
// event (encoded, read, updated, forgotten) to the in-process subscribers.
// Mounted by AppShell so it runs alongside useSnapshotToasts.
//
// Two consumers today:
//   1. MemoryToast — fires a toast on memory.encoded
//   2. Memory page — refreshes its visible counts when anything changes
//
// Module-level singleton so we open exactly one SSE connection per session.

import { useEffect } from 'react';
import { sseGet } from '../lib/sse.js';
import { pushToast } from './useToasts.js';

let started = false;
const listeners = new Set();
let channel = null;

function fan(eventName, payload) {
  for (const cb of listeners) {
    try { cb(eventName, payload); } catch { /* ignore listener errors */ }
  }
}

function start() {
  if (started) return;
  started = true;
  channel = sseGet('/api/memory/stream');
  channel.onEvent('memory.hello', (ev) => fan('memory.hello', ev));
  channel.onEvent('memory.encoded', (ev) => fan('memory.encoded', ev));
  channel.onEvent('memory.read', (ev) => fan('memory.read', ev));
  channel.onEvent('memory.updated', (ev) => fan('memory.updated', ev));
  channel.onEvent('memory.forgotten', (ev) => fan('memory.forgotten', ev));
}

export function subscribeMemoryStream(cb) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Convenience hook — boots the channel and fires toast on encode.
export function useMemoryToasts() {
  useEffect(() => {
    const off = subscribeMemoryStream((name, ev) => {
      if (name !== 'memory.encoded' || !ev?.entries?.length) return;
      const first = ev.entries[0];
      const more = ev.entries.length - 1;
      const who = ev.agent ?? first?.source ?? 'memory';
      pushToast({
        kind: 'mint',
        title: `${cap(who)} remembered`,
        body: more > 0
          ? `"${trim(first.text, 80)}" + ${more} more (${first.type})`
          : `"${trim(first.text, 100)}" (${first.type})`,
        ttlMs: 4000,
      });
    });
    return off;
  }, []);
}

function trim(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
