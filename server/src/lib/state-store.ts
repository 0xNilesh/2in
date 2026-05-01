// PKCE verifier storage. Keyed by `state`. In-memory with TTL eviction —
// fine for single-instance dev. Swap implementation for Redis/cookies in prod.

export interface StateRecord {
  verifier: string;
  createdAt: number;
}

export interface StateStore {
  put(state: string, record: Omit<StateRecord, 'createdAt'>): void;
  take(state: string): StateRecord | undefined;
}

export function createMemoryStateStore(ttlMs = 10 * 60 * 1000): StateStore {
  const map = new Map<string, StateRecord>();

  function evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of map) {
      if (now - v.createdAt > ttlMs) map.delete(k);
    }
  }

  return {
    put(state, record) {
      evictExpired();
      map.set(state, { ...record, createdAt: Date.now() });
    },
    take(state) {
      evictExpired();
      const rec = map.get(state);
      if (rec) map.delete(state);
      return rec;
    },
  };
}
