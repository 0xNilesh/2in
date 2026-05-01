// Module-level toast queue. Anywhere in the app:
//
//   import { pushToast } from '../hooks/useToasts.js';
//   pushToast({ kind: 'success', title: 'Saved', body: '...' });
//
// AppShell mounts a single <ToastStack /> that consumes the queue.

import { useEffect, useState } from 'react';

let nextId = 1;
const subscribers = new Set();
let toasts = [];

function emit() {
  for (const cb of subscribers) cb(toasts);
}

export function pushToast({ kind = 'info', title, body, ttlMs = 4000, action } = {}) {
  const t = { id: nextId++, kind, title, body, action, createdAt: Date.now() };
  toasts = [...toasts, t];
  emit();
  if (ttlMs > 0) {
    setTimeout(() => dismissToast(t.id), ttlMs);
  }
  return t.id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => {
    const cb = (next) => setList(next);
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }, []);
  return list;
}
