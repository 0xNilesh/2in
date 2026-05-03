// Persists user-added memory entries (provenance: manual) to localStorage.
// Each slice has its own namespace under the same root key.

import { useEffect, useState, useCallback } from 'react';
import { getScoped, setScoped } from '../lib/scoped-storage.js';

function readAll() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(getScoped('memory') ?? '{}');
  } catch {
    return {};
  }
}

function writeAll(all) {
  setScoped('memory', JSON.stringify(all));
  window.dispatchEvent(new CustomEvent('memory:change'));
}

export function useManualMemory(sliceId) {
  const [entries, setEntries] = useState(() => readAll()[sliceId] ?? []);

  useEffect(() => {
    const handler = () => setEntries(readAll()[sliceId] ?? []);
    window.addEventListener('memory:change', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('memory:change', handler);
      window.removeEventListener('storage', handler);
    };
  }, [sliceId]);

  const add = useCallback((text) => {
    const all = readAll();
    const next = {
      ...all,
      [sliceId]: [
        { who: 'manual', text, when: 'just now', ts: Date.now() },
        ...(all[sliceId] ?? []),
      ],
    };
    writeAll(next);
    setEntries(next[sliceId]);
  }, [sliceId]);

  const remove = useCallback((ts) => {
    const all = readAll();
    const next = { ...all, [sliceId]: (all[sliceId] ?? []).filter((e) => e.ts !== ts) };
    writeAll(next);
    setEntries(next[sliceId]);
  }, [sliceId]);

  return { entries, add, remove };
}
