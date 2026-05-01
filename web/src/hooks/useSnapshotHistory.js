// Polls /api/chain/snapshots/:tokenId every 6s. Refetches immediately when
// a 'snapshot.created' event arrives on the global SSE bus.

import { useCallback, useEffect, useState } from 'react';
import { feedbackApi } from '../lib/api.js';
import { sseGet } from '../lib/sse.js';

export function useSnapshotHistory(tokenId) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!tokenId) return;
    try {
      const res = await feedbackApi.snapshots(tokenId);
      setSnapshots(res.snapshots ?? []);
    } catch (err) {
      setError(err.message ?? 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Background poll every 6s.
  useEffect(() => {
    if (!tokenId) return undefined;
    const t = setInterval(refetch, 6000);
    return () => clearInterval(t);
  }, [tokenId, refetch]);

  // Refetch immediately on each new snapshot event.
  useEffect(() => {
    if (!tokenId) return undefined;
    const ch = sseGet('/api/snapshots/events');
    ch.onEvent('snapshot.created', ({ snapshot }) => {
      if (snapshot?.tokenId === tokenId) refetch();
    });
    return () => ch.close();
  }, [tokenId, refetch]);

  return { snapshots, loading, error, refetch };
}
