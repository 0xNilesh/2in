// Persistent shell: left rail + center Outlet + right work pane.
// The work pane mounts only when ?task=<id> is in the URL — JOURNEY §1
// "appears only when work is live."

import { Outlet } from 'react-router-dom';
import { Rail } from './Rail.jsx';
import { WorkPane } from '../components/WorkPane.jsx';

export function AppShell() {
  return (
    <div className="app">
      <Rail />
      <main className="main">
        <Outlet />
      </main>
      <WorkPane />
    </div>
  );
}
