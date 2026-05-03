// Persistent shell: left rail + center Outlet + (optional) right pane.
//
// The right pane mounts WorkPane when ?task=<id> is set, or FineTunePane
// when ?finetune=<jobId> is set — JOURNEY §1 "appears only when work is
// live." Only one is shown at a time; task takes precedence.
//
// A global toast stack lives at the bottom-right and bridges every async
// surface (memory writes, snapshots, tx echoes, tool failures).

import { Outlet, useSearchParams, Navigate } from 'react-router-dom';
import { Rail } from './Rail.jsx';
import { WorkPane } from '../components/WorkPane.jsx';
import { FineTunePane } from '../components/FineTunePane.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { useSnapshotToasts } from '../hooks/useSnapshotToasts.js';
import { useMemoryToasts } from '../hooks/useMemoryStream.js';
import { useAuth } from '../hooks/useAuth.js';
import { hasMintedTwin } from '../data/specialists.js';

// Note: wallet-address sync now lives in App.jsx → AuthScope so it covers
// /onboarding too (which is outside AppShell). This shell only handles
// authed-route guards + the persistent layout.

export function AppShell() {
  const [params] = useSearchParams();
  const showTask = params.get('task');
  const showFineTune = params.get('finetune');
  const auth = useAuth();

  // Subscribe globally so any snapshot/memory event fires a toast regardless
  // of which page the user is on.
  useSnapshotToasts();
  useMemoryToasts();

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
