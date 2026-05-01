// Persistent shell: left rail + center Outlet + (optional) right pane.
//
// The right pane mounts WorkPane when ?task=<id> is set, or FineTunePane
// when ?finetune=<jobId> is set — JOURNEY §1 "appears only when work is
// live." Only one is shown at a time; task takes precedence.

import { Outlet, useSearchParams } from 'react-router-dom';
import { Rail } from './Rail.jsx';
import { WorkPane } from '../components/WorkPane.jsx';
import { FineTunePane } from '../components/FineTunePane.jsx';

export function AppShell() {
  const [params] = useSearchParams();
  const showTask = params.get('task');
  const showFineTune = params.get('finetune');

  return (
    <div className="app">
      <Rail />
      <main className="main">
        <Outlet />
      </main>
      {showTask ? <WorkPane /> : showFineTune ? <FineTunePane /> : null}
    </div>
  );
}
