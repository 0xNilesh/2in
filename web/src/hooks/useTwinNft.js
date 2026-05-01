// Reads a single tokenId's on-chain state via /api/chain/twin/:tokenId.
// Returns { state, loading, error, refetch }.

import { useCallback, useEffect, useState } from 'react';

export function useTwinNft(tokenId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chain/twin/${tokenId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      setState(await res.json());
    } catch (err) {
      setError(err.message ?? 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, [tokenId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { state, loading, error, refetch };
}
