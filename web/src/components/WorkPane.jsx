// Right work pane — slides in when a chat task card is clicked.
// Shows the full huddle: every step, sub-agent, tool call, and intermediate
// response the director spawned for the active task.
//
// Two data sources — preference order:
//   1. live task via useTaskStream (server SSE) — used when the task was
//      spawned in this session via /api/task
//   2. static demo data (data/tasks.js) — fallback so legacy thread cards
//      with a hardcoded taskRef still demo nicely

import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { Avatar } from './Avatar.jsx';
import { StatusPill } from './StatusPill.jsx';
import { getTask, stepStatusColor } from '../data/tasks.js';
import { getSpecialist } from '../data/specialists.js';
import { useTaskStream } from '../hooks/useTaskStream.js';

export function WorkPane() {
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');

  const live = useTaskStream(taskId);
  const isLive = Boolean(live.meta);

  // Build a uniform shape from either source.
  const task = useMemo(() => {
    if (isLive) return mergeLive(live);
    return getTask(taskId);
  }, [isLive, live, taskId]);

  if (!taskId) return null;
  if (!task) return null;

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
  };

  return (
    <aside className="work-pane">
      <header className="work-head">
        <div className="grow">
          <div className="work-title">{task.title}</div>
          <div className="work-sub">
            pattern · <code>{task.pattern}</code>
            {isLive ? <span style={{ marginLeft: 8, color: 'var(--peach)' }}>● live</span> : null}
          </div>
        </div>
        <button className="icon-btn" onClick={close} aria-label="close">✕</button>
      </header>

      <div className="work-meta">
        <StatusPill color={statusColor(task.status)}>{task.status}</StatusPill>
        <span className="work-meta-k">step</span>
        <span className="work-meta-v">{task.progress.current}/{task.progress.total}</span>
        {task.elapsed ? <><span className="work-meta-k">elapsed</span><span className="work-meta-v">{task.elapsed}</span></> : null}
        {task.cost ? <><span className="work-meta-k">cost</span><span className="work-meta-v">{task.cost}</span></> : null}
      </div>

      <div className="work-scroll">
        {task.steps.map((step) => (
          <Step key={step.idx} step={step} />
        ))}
        {task.error ? (
          <div style={{ padding: 12, color: 'var(--red)', fontSize: 12.5 }}>
            error: {task.error}
          </div>
        ) : null}
      </div>

      {task.status === 'awaiting-approval' || task.status === 'running' ? (
        <footer className="work-foot">
          <button className="btn">Reject</button>
          <button className="btn">Edit</button>
          <button className="btn btn-peach">Approve</button>
        </footer>
      ) : null}
    </aside>
  );
}

function statusColor(status) {
  if (status === 'running') return 'peach';
  if (status === 'awaiting-approval') return 'amber';
  if (status === 'failed') return 'red';
  return 'mint';
}

function Step({ step }) {
  const speaker = getSpecialist(step.agent);
  const color = stepStatusColor[step.status] ?? 'muted';

  return (
    <div className={`work-step status-${step.status}`}>
      <div className="work-step-head">
        <Avatar initial={speaker?.initial ?? '?'} variant={step.agent === 'director' ? 'dir' : undefined} />
        <div className="grow">
          <div className="work-step-title">
            <span className="work-step-name">{speaker?.name ?? step.agent}</span>
            <span className="work-step-role">{speaker?.role}</span>
          </div>
          <div className="work-step-label">{step.label}</div>
        </div>
        <div className="work-step-meta">
          <StatusPill color={color}>{step.status}</StatusPill>
          {step.elapsed ? <span className="work-step-elapsed">{step.elapsed}</span> : null}
        </div>
      </div>

      {step.tools?.length ? (
        <div className="work-tools">
          {step.tools.map((t, i) => (
            <div key={i} className="work-tool">
              <code className="work-tool-name">{t.name}</code>
              <span className="work-tool-args">
                {typeof t.args === 'string' ? t.args : JSON.stringify(t.args)}
              </span>
              <span className="work-tool-arrow">→</span>
              <span className="work-tool-result">
                {typeof t.result === 'string' ? t.result : JSON.stringify(t.result)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {step.output ? (
        <div className={`work-output${step.status === 'live' ? ' live' : ''}`}>
          {step.output}
          {step.status === 'live' ? <span className="cursor"></span> : null}
        </div>
      ) : null}
    </div>
  );
}

// Convert the live SSE snapshot into the same shape getTask() returns.
function mergeLive(live) {
  const steps = Object.values(live.steps).sort((a, b) => a.idx - b.idx);
  const total = live.meta?.totalSteps ?? steps.length;
  const current = live.currentStep || steps.length;
  return {
    id: live.meta?.id,
    title: live.meta?.title ?? 'Task',
    pattern: live.meta?.pattern ?? '—',
    status: live.status,
    cost: live.cost ?? null,
    elapsed: null,
    progress: { current, total },
    steps,
    error: live.error,
  };
}
