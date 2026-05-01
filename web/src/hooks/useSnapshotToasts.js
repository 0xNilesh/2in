// Subscribes to /api/snapshots/events SSE — one connection per session,
// fires a toast for every snapshot that lands. Mounted by AppShell so it
// runs on every page.

import { useEffect } from 'react';
import { sseGet } from '../lib/sse.js';
import { pushToast } from './useToasts.js';

let started = false;

export function useSnapshotToasts() {
  useEffect(() => {
    if (started) return undefined;
    started = true;

    const ch = sseGet('/api/snapshots/events');
    ch.onEvent('snapshot.created', ({ snapshot }) => {
      pushToast({
        kind: 'success',
        title: `Snapshot · ${snapshot.specialistId}`,
        body: `${snapshot.delta} → updateMetadata(#${snapshot.tokenId})`,
        ttlMs: 5000,
        action: snapshot.txHash
          ? { label: snapshot.txHash.slice(0, 10) + '…', href: `https://chainscan-galileo.0g.ai/tx/${snapshot.txHash}` }
          : null,
      });
    });

    return () => {
      ch.close();
      started = false;
    };
  }, []);
}
