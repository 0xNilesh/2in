// Subscribes to /api/snapshots/events SSE — one connection per session,
// fires a toast for every snapshot that lands. Mounted by AppShell so it
// runs on every page.
//
// The server replays its FULL snapshot history when a new SSE client
// connects (so a refresh doesn't lose state for the chain history page).
// We don't want to toast every replayed event though — on reload that
// would dump a stack of historical "Snapshot · X" toasts onto the screen.
// Filter to events that fired within the last few seconds (== actually
// live) by comparing snapshot.ts to Date.now().

import { useEffect } from 'react';
import { sseGet } from '../lib/sse.js';
import { pushToast } from './useToasts.js';

let started = false;
const LIVE_WINDOW_MS = 5_000;

function isLive(snapshot) {
  if (!snapshot?.ts) return false;
  return Date.now() - snapshot.ts < LIVE_WINDOW_MS;
}

export function useSnapshotToasts() {
  useEffect(() => {
    if (started) return undefined;
    started = true;

    const ch = sseGet('/api/snapshots/events');
    ch.onEvent('snapshot.created', ({ snapshot }) => {
      if (!isLive(snapshot)) return; // skip history replay on reload
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
    ch.onEvent('snapshot.anchored', ({ snapshot }) => {
      if (!isLive(snapshot)) return; // skip history replay
      pushToast({
        kind: 'mint',
        title: `Anchored on 0G · ${snapshot.specialistId}`,
        body: `Memory snapshot on-chain · #${snapshot.tokenId}`,
        ttlMs: 6000,
        action: snapshot.txHash
          ? { label: 'view tx →', href: `https://chainscan-galileo.0g.ai/tx/${snapshot.txHash}` }
          : null,
      });
    });

    return () => {
      ch.close();
      started = false;
    };
  }, []);
}
