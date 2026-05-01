// Persistent shell: left rail + center Outlet + (optional) right pane.
//
// The right pane mounts WorkPane when ?task=<id> is set, or FineTunePane
// when ?finetune=<jobId> is set — JOURNEY §1 "appears only when work is
// live." Only one is shown at a time; task takes precedence.
//
// A global toast stack lives at the bottom-right and bridges every async
// surface (memory writes, snapshots, tx echoes, tool failures).

import { Outlet, useSearchParams } from 'react-router-dom';
import { Rail } from './Rail.jsx';
import { WorkPane } from '../components/WorkPane.jsx';
import { FineTunePane } from '../components/FineTunePane.jsx';
import { ToastStack } from '../components/ToastStack.jsx';
import { useSnapshotToasts } from '../hooks/useSnapshotToasts.js';
import { useMemoryToasts } from '../hooks/useMemoryStream.js';

export function AppShell() {
  const [params] = useSearchParams();
  const showTask = params.get('task');
  const showFineTune = params.get('finetune');

  // Subscribe globally so any snapshot/memory event fires a toast regardless
  // of which page the user is on.
  useSnapshotToasts();
  useMemoryToasts();

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
