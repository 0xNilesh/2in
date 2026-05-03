// Persistent shell: left rail + center Outlet + (optional) right pane.
//
// The right pane mounts WorkPane when ?task=<id> is set, or FineTunePane
// when ?finetune=<jobId> is set — JOURNEY §1 "appears only when work is
// live." Only one is shown at a time; task takes precedence.
//
// A global toast stack lives at the bottom-right and bridges every async
// surface (memory writes, snapshots, tx echoes, tool failures).

import { useEffect } from 'react';
import { Outlet, useSearchParams, Navigate } from 'react-router-dom';
import { Rail } from './Rail.jsx';
import { WorkPane } from '../components/WorkPane.jsx';
import { FineTunePane } from '../components/FineTunePane.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { useSnapshotToasts } from '../hooks/useSnapshotToasts.js';
import { useMemoryToasts } from '../hooks/useMemoryStream.js';
import { useAuth } from '../hooks/useAuth.js';
import { hasMintedTwin } from '../data/specialists.js';
import { getActiveAddress, setActiveAddress } from '../lib/scoped-storage.js';

export function AppShell() {
  const [params] = useSearchParams();
  const showTask = params.get('task');
  const showFineTune = params.get('finetune');
  const auth = useAuth();

  // Subscribe globally so any snapshot/memory event fires a toast regardless
  // of which page the user is on.
  useSnapshotToasts();
  useMemoryToasts();

  // Wallet-isolation. Every wallet-scoped localStorage key (mints,
  // threads, thread-ext, onboarding, memory cache, task caches, persona
  // seed, …) is suffixed with the current address via scoped-storage.js.
  // Switching from wallet A → B → A round-trips state cleanly:
  //   - wallet A keeps its twin / threads / mints under `2in:0xa…:KEY`
  //   - wallet B keeps its own under `2in:0xb…:KEY`
  //   - log back into wallet A and the cache is intact
  //
  // This effect just keeps `2in:active-address` in sync with Privy.
  // When the pointer changes mid-session, we hard-reload so every hook
  // (useThreads, useTwin, useMintRoster, …) re-reads from the new scope.
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !auth.address) return;
    const last = getActiveAddress();
    const current = auth.address.toLowerCase();
    if (last && last !== current) {
      // eslint-disable-next-line no-console
      console.info(`[auth] wallet switched ${last} → ${current} — re-scoping localStorage to new address`);
      setActiveAddress(current);
      window.location.reload();
      return;
    }
    if (!last) setActiveAddress(current);
  }, [auth.ready, auth.authenticated, auth.address]);

  // Onboarding gate. Two conditions reroute the user out of the shell:
  //   1. Privy not authenticated → back to landing.
  //   2. Authenticated but no master twin minted → finish onboarding first.
  // We wait for `auth.ready` so the redirect doesn't fire on initial mount
  // before Privy resolves the session.
  if (auth.ready && auth.configured && !auth.authenticated) {
    return <Navigate to="/" replace />;
  }
  if (auth.ready && auth.authenticated && !hasMintedTwin()) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="app">
      <Rail />
      <main className="main">
        <Outlet />
      </main>
      {showTask ? <WorkPane /> : showFineTune ? <FineTunePane /> : null}
      <ToastStack />
    </div>
  );
}
