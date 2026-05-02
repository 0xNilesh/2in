// localStorage-backed director thread list. The Rail reads from here, Chat
// creates + renames, all persisted under '2in:threads'. Per-thread messages
// continue to live in '2in:thread-ext' (existing key) so we don't disturb
// anyone's open thread state during this migration.
//
// Each thread: { id, title, createdAt, updatedAt }
//
// Default behaviour: on first ever load (no key in localStorage) we seed
// with one thread {id: 't-default', title: 'New chat'} so the UI isn't
// empty. After that the user owns the list — no auto-seeding.

import { useEffect, useState, useCallback } from 'react';

const KEY = '2in:threads';
const subscribers = new Set();
let memoCache = null;

function loadAll() {
  if (memoCache) return memoCache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      memoCache = [{ id: 't-default', title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() }];
      window.localStorage.setItem(KEY, JSON.stringify(memoCache));
      return memoCache;
    }
    memoCache = JSON.parse(raw);
    if (!Array.isArray(memoCache) || memoCache.length === 0) {
      memoCache = [{ id: 't-default', title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() }];
    }
    return memoCache;
  } catch {
    memoCache = [{ id: 't-default', title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() }];
    return memoCache;
  }
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
