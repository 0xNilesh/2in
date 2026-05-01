// FineTunePane — slide-in right rail mirror of WorkPane, but for fine-tune
// jobs. Mounted by AppShell when ?finetune=<jobId> is in the URL.

import { useSearchParams, Link } from 'react-router-dom';
import { useFineTuneJob } from '../hooks/useFineTuneJob.js';
import { StatusPill } from './StatusPill.jsx';
import { ROUTES } from '../lib/routes.js';

export function FineTunePane() {
  const [params, setParams] = useSearchParams();
  const jobId = params.get('finetune');
  if (!jobId) return null;
  return <Inner jobId={jobId} onClose={() => {
    const next = new URLSearchParams(params);
    next.delete('finetune');
    setParams(next, { replace: true });
  }} />;
}

function Inner({ jobId, onClose }) {
  const job = useFineTuneJob(jobId);
  const specialistId = job.meta?.specialistId;

  return (
    <aside className="work-pane">
      <header className="work-head">
        <div className="grow">
          <div className="work-title">
            Training {specialistId ?? 'specialist'}
          </div>
          <div className="work-sub">
            job · <code>{jobId}</code>{job.meta?.source === 'mock' ? ' · mock' : ' · 0G compute'}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
      </header>

      <div className="work-meta">
        <StatusPill color={pillColor(job.status)}>{job.status}</StatusPill>
        <span className="work-meta-k">progress</span>
        <span className="work-meta-v">{job.progress}%</span>
        {job.etaSeconds != null ? (
          <>
            <span className="work-meta-k">eta</span>
            <span className="work-meta-v">~{job.etaSeconds}s</span>
          </>
        ) : null}
        {job.meta?.costEstimate ? (
          <>
            <span className="work-meta-k">cost</span>
            <span className="work-meta-v">{job.meta.costEstimate}</span>
          </>
        ) : null}
      </div>

      <div className="work-scroll">
        <div className="work-step status-live" style={{ borderColor: 'var(--peach)' }}>
          <div className="work-step-head">
            <div className="grow">
              <div className="work-step-title">
                <span className="work-step-name">{job.meta?.baseModel ?? 'Qwen2.5-0.5B-Instruct'}</span>
                <span className="work-step-role">base model</span>
              </div>
              <div className="work-step-label">
                LoRA fine-tune via 0G Compute
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--peach)' }}>
              {job.progress}%
            </div>
          </div>
          <div
            style={{
              marginTop: 10,
              height: 6,
              borderRadius: 3,
              background: 'var(--bg-soft-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${job.progress}%`,
                background: 'linear-gradient(90deg, var(--peach-warm), var(--peach-press))',
                transition: 'width 600ms ease',
              }}
            />
          </div>
        </div>

        {job.adapterURI ? (
          <div className="work-step status-done" style={{ marginTop: 10 }}>
            <div className="work-step-head">
              <div className="grow">
                <div className="work-step-title">
                  <span className="work-step-name">Adapter delivered</span>
                </div>
                <div
                  className="work-step-label"
                  style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11 }}
                >
                  {job.adapterURI}
                </div>
              </div>
              <StatusPill color="mint">delivered</StatusPill>
            </div>
          </div>
        ) : null}

        {job.error ? (
          <div style={{ padding: 12, color: 'var(--red)', fontSize: 12.5 }}>
            error: {job.error}
          </div>
        ) : null}
      </div>

      {specialistId ? (
        <footer className="work-foot">
          <Link to={ROUTES.specialist(specialistId)} className="btn">
            Open specialist →
          </Link>
        </footer>
      ) : null}
    </aside>
  );
}

function pillColor(status) {
  if (status === 'training' || status === 'queued') return 'peach';
  if (status === 'delivered') return 'amber';
  if (status === 'live') return 'mint';
  if (status === 'failed') return 'red';
  return 'muted';
}
