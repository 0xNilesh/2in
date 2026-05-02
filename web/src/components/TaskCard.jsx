// Inline chat task card. Compact summary of a director-spawned task.
// Click → sets ?task=<id> → WorkPane mounts and reveals full progress.
//
// Two data sources:
//   1. live  — runtime task spawned this session, state from useTaskStream SSE
//   2. seed  — static demo data in data/tasks.js (fallback for hardcoded refs)
// If neither knows the task yet (race between spawn + SSE connect), renders
// a minimal placeholder that's still clickable.

import { useSearchParams } from 'react-router-dom';
import { getTask } from '../data/tasks.js';
import { getSpecialist } from '../data/specialists.js';
import { StatusPill } from './StatusPill.jsx';
import { useTaskStream } from '../hooks/useTaskStream.js';

const stateColor = {
  running: 'peach',
  'awaiting-approval': 'amber',
  approved: 'mint',
  rejected: 'red',
  failed: 'red',
  archived: 'muted',
  pending: 'muted',
};

export function TaskCard({ taskId }) {
  const live = useTaskStream(taskId);
  const seed = getTask(taskId);
  const [params, setParams] = useSearchParams();
  if (!taskId) return null;

  const isOpen = params.get('task') === taskId;
  const open = () => {
    const next = new URLSearchParams(params);
    next.set('task', taskId);
    setParams(next, { replace: true });
  };

  // Prefer live data; fall back to seed; minimal placeholder otherwise.
  const view = (() => {
    if (live.meta) {
      const steps = Object.values(live.steps).sort((a, b) => a.idx - b.idx);
      const totalSteps = live.meta.totalSteps ?? steps.length;
      // If the server forgot this task (restart), keep the cached state
      // visible but tag the status so it doesn't pretend to still be live.
      const dropped = live.serverDropped;
      const status = dropped && live.status !== 'awaiting-approval' && live.status !== 'approved'
        ? 'archived'
        : live.status ?? 'pending';
      return {
        title: live.meta.title ?? 'Task',
        pattern: live.meta.pattern ?? '—',
        status,
        steps,
        current: live.currentStep || steps.length,
        total: totalSteps,
        elapsed: null,
        cost: live.cost ?? null,
        source: dropped ? 'cached' : 'live',
      };
    }
    if (seed) {
      return {
        title: seed.title,
        pattern: seed.pattern,
        status: seed.status,
        steps: seed.steps,
        current: seed.progress.current,
        total: seed.progress.total,
        elapsed: seed.elapsed,
        cost: seed.cost,
        source: 'seed',
      };
    }
    // Server doesn't know this taskId AND we have no cached snapshot AND
    // no seed match — almost certainly an orphan from a wiped restart.
    if (live.serverDropped) {
      return {
        title: 'Task expired',
        pattern: '—',
        status: 'archived',
        steps: [],
        current: 0,
        total: 0,
        elapsed: null,
        cost: null,
        source: 'expired',
      };
    }
    return {
      title: 'Task',
      pattern: '—',
      status: 'pending',
      steps: [],
      current: 0,
      total: 0,
      elapsed: null,
      cost: null,
      source: 'pending',
    };
  })();

  return (
    <button
      type="button"
      className={`task-card${isOpen ? ' open' : ''}`}
      onClick={open}
    >
      <div className="task-card-row">
        <div className="task-card-grow">
          <div className="task-card-title">{view.title}</div>
          <div className="task-card-sub">
            pattern · <code>{view.pattern}</code>
            {view.source === 'live' ? <span style={{ marginLeft: 8, color: 'var(--peach)' }}>● live</span> : null}
            {view.source === 'cached' ? <span style={{ marginLeft: 8, color: 'var(--text-faint)' }}>cached · server lost it</span> : null}
            {view.source === 'expired' ? <span style={{ marginLeft: 8, color: 'var(--text-faint)' }}>server restart cleared this task</span> : null}
          </div>
        </div>
        <StatusPill color={stateColor[view.status] ?? 'muted'}>{view.status}</StatusPill>
      </div>

      {view.steps.length > 0 ? (
        <div className="task-card-timeline">
          {view.steps.map((s) => {
            const speaker = getSpecialist(s.agent);
            return (
              <span
                key={s.idx}
                className={`task-step status-${s.status ?? 'pending'}`}
                title={`${speaker?.name ?? s.agent} · ${s.label ?? ''}`}
              >
                <span className="task-step-dot"></span>
                <span className="task-step-name">{speaker?.initial ?? '?'}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="task-card-meta">
        <span>step {view.current}/{view.total || '…'}</span>
        {view.elapsed ? <><span>·</span><span>{view.elapsed}</span></> : null}
        {view.cost ? <><span>·</span><span>{view.cost}</span></> : null}
        <span className="task-card-cta">Open work pane →</span>
      </div>
    </button>
  );
}
