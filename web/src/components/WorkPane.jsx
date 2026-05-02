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
import { useMemo, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { StatusPill } from './StatusPill.jsx';
import { getTask, stepStatusColor } from '../data/tasks.js';
import { getSpecialist } from '../data/specialists.js';
import { useTaskStream } from '../hooks/useTaskStream.js';
import { feedbackApi } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';

export function WorkPane() {
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');

  const live = useTaskStream(taskId);
  const isLive = Boolean(live.meta);

  // Build a uniform shape from either source. If neither has data yet
  // (SSE connecting, runtime task), render a "connecting" placeholder
  // instead of returning null — otherwise the user clicks the TaskCard
  // and nothing visible happens.
  const task = useMemo(() => {
    if (isLive) return mergeLive(live);
    const seed = getTask(taskId);
    if (seed) return seed;
    return {
      id: taskId,
      title: 'Connecting…',
      pattern: '—',
      status: live.error ? 'failed' : 'pending',
      cost: null,
      elapsed: null,
      progress: { current: 0, total: 0 },
      steps: [],
      error: live.error,
    };
  }, [isLive, live, taskId]);

  if (!taskId) return null;

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
        <MemoryTraffic steps={task.steps} />
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
        <FeedbackFooter taskId={taskId} task={task} onClose={close} />
      ) : null}
    </aside>
  );
}

function FeedbackFooter({ taskId, task, onClose }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [editText, setEditText] = useState('');

  const lastStep = task.steps?.[task.steps.length - 1];
  const lastSpecialist = lastStep?.agent;
  // Final draft text: prefer task.finalOutput from task.done, fall back to
  // the last step's output buffer.
  const finalText = task.finalOutput ?? lastStep?.output ?? '';

  const approve = async (overrideText) => {
    setBusy(true);
    try {
      // Server already accepts an optional finalOutput override on
      // /task/:id/approve — it preferentially uses that over the inferred
      // text. So sending the user's edit just works.
      const body = overrideText && overrideText !== finalText
        ? { finalOutput: overrideText }
        : {};
      const res = await feedbackApi.approve(taskId, body);
      pushToast({
        kind: 'success',
        title: overrideText
          ? `Edited + approved · saved to ${res.specialistId}'s voice_memory`
          : `Approved · saved to ${res.specialistId}'s voice_memory`,
        body: res.snapshot
          ? `Snapshot fired · updateMetadata(#${res.snapshot.tokenId}) · ${res.snapshot.delta}`
          : `${res.pendingWrites}/3 writes until next snapshot`,
      });
      onClose?.();
    } catch (err) {
      pushToast({ kind: 'error', title: 'Approve failed', body: err.message ?? 'try again' });
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await feedbackApi.reject(taskId, { reason: reason.trim() });
      pushToast({
        kind: 'warn',
        title: `Rejected · saved to ${res.specialistId}'s rejection_memory`,
        body: res.snapshot
          ? `Snapshot fired · updateMetadata(#${res.snapshot.tokenId}) · ${res.snapshot.delta}`
          : `${res.pendingWrites}/3 writes until next snapshot`,
      });
      onClose?.();
    } catch (err) {
      pushToast({ kind: 'error', title: 'Reject failed', body: err.message ?? 'try again' });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setEditText(finalText);
    setEditing(true);
  };

  if (editing) {
    const dirty = editText.trim() !== finalText.trim();
    return (
      <footer className="work-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
          editing {lastSpecialist}'s output · save approves the edited version
        </div>
        <textarea
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={Math.min(12, Math.max(3, editText.split('\n').length + 1))}
          style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            color: 'var(--text)',
            font: 'inherit', fontSize: 13, lineHeight: 1.5, outline: 0,
            resize: 'vertical',
            minHeight: 80,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: dirty ? 'var(--peach)' : 'var(--text-faint)', marginRight: 'auto' }}>
            {dirty ? '● edited' : 'unchanged'}
          </span>
          <button
            className="btn"
            onClick={() => { setEditing(false); setEditText(''); }}
            disabled={busy}
          >Cancel</button>
          <button
            className="btn btn-peach"
            onClick={() => approve(editText)}
            disabled={busy || !editText.trim()}
          >
            {busy ? 'saving…' : dirty ? 'Save + approve' : 'Approve as-is'}
          </button>
        </div>
      </footer>
    );
  }

  if (rejecting) {
    return (
      <footer className="work-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitReject(); }}
          placeholder={`Why are we rejecting ${lastSpecialist ?? 'this'}'s output?`}
          style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            color: 'var(--text)',
            font: 'inherit', fontSize: 13, outline: 0,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>Cancel</button>
          <button className="btn btn-peach" onClick={submitReject} disabled={busy || !reason.trim()}>
            {busy ? 'saving…' : 'Save reason'}
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="work-foot">
      <button className="btn" onClick={() => setRejecting(true)} disabled={busy}>Reject</button>
      <button
        className="btn"
        onClick={startEditing}
        disabled={busy || !finalText}
        title={finalText ? 'Edit then approve' : 'No output to edit yet'}
      >
        Edit
      </button>
      <button className="btn btn-peach" onClick={() => approve()} disabled={busy}>
        {busy ? 'saving…' : 'Approve'}
      </button>
    </footer>
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

      {step.memRead || step.memWrite ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px 38px' }}>
          {step.memRead ? (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--mint)',
                background: 'rgba(94,234,212,0.08)',
                border: '1px solid rgba(94,234,212,0.25)',
                borderRadius: 999,
                padding: '2px 8px',
                fontFamily: 'Geist Mono, monospace',
              }}
              title={`Read ${step.memRead.count} entries from ${step.memRead.types.join(', ')}`}
            >
              ↓ {step.memRead.count} · {step.memRead.types.map(abbr).join(' ')}
            </span>
          ) : null}
          {step.memWrite ? (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--peach)',
                background: 'rgba(255,138,91,0.08)',
                border: '1px solid rgba(255,138,91,0.25)',
                borderRadius: 999,
                padding: '2px 8px',
                fontFamily: 'Geist Mono, monospace',
              }}
              title={`Wrote ${step.memWrite.count} entries to ${step.memWrite.types.join(', ')}`}
            >
              ↑ {step.memWrite.count} · {step.memWrite.types.map(abbr).join(' ')}
            </span>
          ) : null}
        </div>
      ) : null}

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

function abbr(type) {
  const map = { episodic: 'ep', semantic: 'sem', relationship: 'rel', temporal: 'tmp', procedural: 'proc', working: 'wrk' };
  return map[type] ?? type;
}

function MemoryTraffic({ steps }) {
  if (!steps?.length) return null;
  let reads = 0;
  let writes = 0;
  for (const s of steps) {
    if (s.memRead) reads += s.memRead.count ?? 0;
    if (s.memWrite) writes += s.memWrite.count ?? 0;
  }
  if (reads === 0 && writes === 0) return null;
  return (
    <>
      <span className="work-meta-k">memory</span>
      <span className="work-meta-v" style={{ fontFamily: 'Geist Mono, monospace' }}>
        <span style={{ color: 'var(--mint)' }}>↓{reads}</span>
        {' · '}
        <span style={{ color: 'var(--peach)' }}>↑{writes}</span>
      </span>
    </>
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
