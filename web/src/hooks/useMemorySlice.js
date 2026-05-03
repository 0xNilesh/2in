// Reads + writes a typed memory slice via the API. Falls back to
// localStorage when the API is unreachable so the page still works offline
// or against a downed server.
//
// Returns { entries, root, add, remove, loading, error, source }
//   source = 'api' | 'localStorage' (which backend gave us the entries)

import { useCallback, useEffect, useState } from 'react';
import { memoryApi } from '../lib/api.js';
import { getScoped, setScoped } from '../lib/scoped-storage.js';

function readFallback() {
  try { return JSON.parse(getScoped('memory') ?? '{}'); }
  catch { return {}; }
}
function writeFallback(all) {
  setScoped('memory', JSON.stringify(all));
}

export function useMemorySlice(sliceId, { twin = '42' } = {}) {
  const [entries, setEntries] = useState([]);
  const [root, setRoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('api');

  const load = useCallback(async () => {
    if (!sliceId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, rootRes] = await Promise.all([
        memoryApi.list(sliceId, twin),
        memoryApi.root(sliceId, twin).catch(() => null),
      ]);
      setEntries(list.entries ?? []);
      setRoot(rootRes ?? null);
      setSource('api');
    } catch (err) {
      // Fall back to localStorage entries if any exist
      const cached = readFallback()[sliceId] ?? [];
      setEntries(cached);
      setRoot(null);
      setSource('localStorage');
      setError(err.message ?? 'memory_unreachable');
    } finally {
      setLoading(false);
    }
  }, [sliceId, twin]);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await memoryApi.write(sliceId, trimmed, twin, 'manual');
      await load();
    } catch (err) {
      // Mirror to localStorage so the entry isn't lost
      const all = readFallback();
      const next = {
        ...all,
        [sliceId]: [
          { who: 'manual', text: trimmed, when: 'just now', ts: Date.now() },
          ...(all[sliceId] ?? []),
        ],
      };
      writeFallback(next);
      setEntries(next[sliceId]);
      setSource('localStorage');
      setError(err.message ?? 'memory_unreachable');
    }
  }, [sliceId, twin, load]);

  const remove = useCallback((ts) => {
    // Local-only operation for now (server doesn't expose delete). We just
    // hide the entry visually if it's a localStorage-backed write.
    const all = readFallback();
    const next = { ...all, [sliceId]: (all[sliceId] ?? []).filter((e) => e.ts !== ts) };
    writeFallback(next);
    setEntries((curr) => curr.filter((e) => e.ts !== ts));
  }, [sliceId]);

  return { entries, root, add, remove, loading, error, source, reload: load };
}
