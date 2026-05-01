// Inline chat task card. Compact summary of a director-spawned task.
// Click → sets ?task=<id> → WorkPane mounts and reveals full progress.

import { useSearchParams } from 'react-router-dom';
import { getTask } from '../data/tasks.js';
import { getSpecialist } from '../data/specialists.js';
import { StatusPill } from './StatusPill.jsx';

const stateColor = {
  running: 'peach',
  'awaiting-approval': 'amber',
  approved: 'mint',
  rejected: 'red',
  failed: 'red',
  archived: 'muted',
};

export function TaskCard({ taskId }) {
  const task = getTask(taskId);
  const [params, setParams] = useSearchParams();
  if (!task) return null;

  const open = () => {
    const next = new URLSearchParams(params);
    next.set('task', task.id);
    setParams(next, { replace: true });
  };
  const isOpen = params.get('task') === task.id;

  return (
    <button
      type="button"
      className={`task-card${isOpen ? ' open' : ''}`}
      onClick={open}
    >
      <div className="task-card-row">
        <div className="task-card-grow">
          <div className="task-card-title">{task.title}</div>
          <div className="task-card-sub">
            pattern · <code>{task.pattern}</code>
          </div>
        </div>
        <StatusPill color={stateColor[task.status] ?? 'muted'}>{task.status}</StatusPill>
      </div>

      <div className="task-card-timeline">
        {task.steps.map((s) => {
          const speaker = getSpecialist(s.agent);
          return (
            <span
              key={s.idx}
              className={`task-step status-${s.status}`}
              title={`${speaker?.name ?? s.agent} · ${s.label}`}
            >
              <span className="task-step-dot"></span>
              <span className="task-step-name">{speaker?.initial ?? '?'}</span>
            </span>
          );
        })}
      </div>

      <div className="task-card-meta">
        <span>step {task.progress.current}/{task.progress.total}</span>
        <span>·</span>
        <span>{task.elapsed}</span>
        <span>·</span>
        <span>{task.cost}</span>
        <span className="task-card-cta">Open work pane →</span>
      </div>
    </button>
  );
}
