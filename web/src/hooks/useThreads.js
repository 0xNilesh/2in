// localStorage-backed director thread list. The Rail reads from here, Chat
// creates + renames, all persisted under '2in:threads'. Per-thread messages
// continue to live in '2in:thread-ext' (existing key) so we don't disturb
// anyone's open thread state during this migration.
//
// Each thread: { id, title, createdAt, updatedAt }
//
// First-load behaviour:
//   1. If '2in:threads' is set in localStorage, use it.
//   2. If empty (fresh browser, after Reset, cross-device), kick off a
//      one-shot restore from /api/chat/threads → 0G Indexer. If the server
//      has thread snapshots stored in 0G KV, hydrate them into both
//      '2in:threads' (metadata) and '2in:thread-ext' (per-thread messages).
//   3. Only if both are empty do we seed the default 'New chat' thread.

import { useEffect, useState, useCallback } from 'react';
import { getTwinId } from '../data/specialists.js';
import { apiUrl } from '../lib/api.js';

const KEY = '2in:threads';
const EXT_KEY = '2in:thread-ext';
const RESTORE_FLAG_KEY = '2in:threads:restored';
const subscribers = new Set();
let memoCache = null;
let restorePromise = null;

const DEFAULT_SEED = () => [
  { id: 't-default', title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() },
];

function loadAll() {
  if (memoCache) return memoCache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // Don't seed yet — caller (useThreads effect) will try restoreFromCloud
      // first, then seed if that came back empty.
      memoCache = [];
      return memoCache;
    }
    memoCache = JSON.parse(raw);
    if (!Array.isArray(memoCache)) memoCache = [];
    return memoCache;
  } catch {
    memoCache = [];
    return memoCache;
  }
}

/** One-shot restore of thread metadata + per-thread messages from 0G
 *  (via the server's /api/chat/threads endpoint). Idempotent — multiple
 *  callers share the same in-flight promise. */
async function restoreFromCloud() {
  if (restorePromise) return restorePromise;
  // Avoid re-running every page nav once we've decided to seed locally.
  try {
    if (window.localStorage.getItem(RESTORE_FLAG_KEY) === '1') return null;
  } catch { /* ignore */ }
  restorePromise = (async () => {
    try {
      const res = await fetch(apiUrl(`/api/chat/threads?twin=${encodeURIComponent(getTwinId())}`));
      if (!res.ok) return null;
      const data = await res.json();
      const ptrs = Array.isArray(data?.threads) ? data.threads : [];
      if (ptrs.length === 0) return null;
      const restored = [];
      const ext = {};
      const tasksToSeed = {}; // { '2in:task:<id>': stateJson }
      for (const p of ptrs) {
        try {
          const blob = await fetch(p.gatewayUrl);
          if (!blob.ok) continue;
          const payload = await blob.json();
          restored.push({
            id: payload.id ?? p.threadId,
            title: payload.title ?? 'Restored thread',
            createdAt: payload.createdAt ?? p.ts ?? Date.now(),
            updatedAt: p.ts ?? Date.now(),
          });
          if (Array.isArray(payload.messages)) {
            ext[payload.id ?? p.threadId] = payload.messages;
          }
          // Tasks bundle: write each cached work-pane state back so the
          // "Open work pane" path renders Writer drafts / Researcher
          // output / tool calls just like before the wipe.
          if (payload.tasks && typeof payload.tasks === 'object') {
            for (const [taskId, state] of Object.entries(payload.tasks)) {
              tasksToSeed[`2in:task:${taskId}`] = JSON.stringify(state);
            }
          }
        } catch { /* skip this pointer */ }
      }
      if (restored.length === 0) return null;
      // Persist what we got, and short-circuit future restores.
      try {
        window.localStorage.setItem(KEY, JSON.stringify(restored));
        const existingExt = JSON.parse(window.localStorage.getItem(EXT_KEY) ?? '{}');
        window.localStorage.setItem(EXT_KEY, JSON.stringify({ ...existingExt, ...ext }));
        for (const [k, v] of Object.entries(tasksToSeed)) {
          window.localStorage.setItem(k, v);
        }
        window.localStorage.setItem(RESTORE_FLAG_KEY, '1');
      } catch { /* full / blocked */ }
      memoCache = restored;
      // eslint-disable-next-line no-console
      console.info(`[threads] restored ${restored.length} thread(s) + ${Object.keys(tasksToSeed).length} task(s) from 0G Storage`);
      return restored;
    } catch {
      return null;
    } finally {
      restorePromise = null;
    }
  })();
  return restorePromise;
}

function saveAll(threads) {
  memoCache = threads;
  try { window.localStorage.setItem(KEY, JSON.stringify(threads)); } catch { /* full */ }
  for (const cb of subscribers) cb(threads);
}

function newId() {
  return `t-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

/** Title from first user message text — first sentence or 40 chars. */
export function deriveTitle(text) {
  if (!text) return 'New chat';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return firstSentence.length > 40 ? firstSentence.slice(0, 39) + '…' : firstSentence;
}

export function useThreads() {
  const [threads, setThreads] = useState(loadAll);

  useEffect(() => {
    const cb = (next) => setThreads(next);
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }, []);

  // First-mount restore + seed flow. If localStorage was empty, try the
  // 0G Storage restore; if THAT comes back empty, fall back to the seed.
  useEffect(() => {
    if (threads.length > 0) return;
    let cancelled = false;
    (async () => {
      const restored = await restoreFromCloud();
      if (cancelled) return;
      if (restored && restored.length > 0) {
        saveAll(restored);
      } else {
        const seed = DEFAULT_SEED();
        try { window.localStorage.setItem(RESTORE_FLAG_KEY, '1'); } catch { /* ignore */ }
        saveAll(seed);
      }
    })();
    return () => { cancelled = true; };
  }, [threads.length]);

  const createThread = useCallback(() => {
    const t = { id: newId(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() };
    saveAll([t, ...threads]);
    return t;
  }, [threads]);

  const renameThread = useCallback((id, title) => {
    saveAll(threads.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t)));
  }, [threads]);

  const touchThread = useCallback((id) => {
    saveAll(threads.map((t) => (t.id === id ? { ...t, updatedAt: Date.now() } : t)));
  }, [threads]);

  const removeThread = useCallback((id) => {
    const filtered = threads.filter((t) => t.id !== id);
    if (filtered.length === 0) {
      filtered.push({ id: 't-default', title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() });
    }
    saveAll(filtered);
    // Also drop the per-thread message extension to avoid a stale ghost.
    try {
      const extKey = '2in:thread-ext';
      const all = JSON.parse(window.localStorage.getItem(extKey) ?? '{}');
      delete all[id];
      window.localStorage.setItem(extKey, JSON.stringify(all));
    } catch { /* ignore */ }
  }, [threads]);

  return { threads, createThread, renameThread, touchThread, removeThread };
}

/** Sync helpers for places where calling a hook isn't possible. */
export function getThreadsSync() {
  return loadAll();
}

export function getThreadSync(id) {
  return loadAll().find((t) => t.id === id) ?? null;
}

export function relativeTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
