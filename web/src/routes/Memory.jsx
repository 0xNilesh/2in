// Memory — six typed slices that grow over time. Identity emerges from
// memory: every approved post writes to episodic, every rejected pattern
// writes to procedural, every learned fact writes to semantic.
//
// Two-pane layout: type list left, detail right. Live count badges update
// from the memory SSE stream so the UI reflects writes as they happen.

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { HashChip } from '../components/TokenChip.jsx';
import { memorySlices, getMemorySlice } from '../data/memory.js';
import { ROUTES } from '../lib/routes.js';
import { gatewayUrl } from '../lib/format.js';
import { useMemorySlice } from '../hooks/useMemorySlice.js';
import { subscribeMemoryStream } from '../hooks/useMemoryStream.js';
import { memoryApi } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';

export default function Memory() {
  const { sliceId } = useParams();
  const nav = useNavigate();
  const active = getMemorySlice(sliceId) ?? memorySlices[0];
  const { entries, root, source, reload } = useMemorySlice(active.id);
  const [counts, setCounts] = useState({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // Initial counts + live updates from the memory stream.
  useEffect(() => {
    let cancelled = false;
    memoryApi.listAll('42').then((res) => {
      if (!cancelled) setCounts(res.counts ?? {});
    }).catch(() => {});
    const off = subscribeMemoryStream((name) => {
      if (name === 'memory.encoded' || name === 'memory.forgotten' || name === 'memory.updated') {
        memoryApi.listAll('42').then((res) => {
          if (!cancelled) setCounts(res.counts ?? {});
        }).catch(() => {});
        if (name === 'memory.encoded' || name === 'memory.forgotten') reload?.();
      }
    });
    return () => { cancelled = true; off(); };
  }, [reload]);

  const submit = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await memoryApi.write(active.id, text, '42', 'manual');
      setDraft('');
      reload?.();
      pushToast({ kind: 'success', title: `Saved to ${active.id}`, body: `"${text.slice(0, 80)}"`, ttlMs: 3000 });
    } catch (err) {
      pushToast({ kind: 'error', title: 'Save failed', body: err.message ?? 'try again' });
    } finally { setBusy(false); }
  };

  const onForget = async (id) => {
    try {
      await memoryApi.forget(active.id, id);
      reload?.();
    } catch (err) {
      pushToast({ kind: 'error', title: 'Forget failed', body: err.message ?? 'try again' });
    }
  };

  const exportHref = memoryApi.exportUrl('42');

  return (
    <>
      <PageHeader
        title="Memory"
        sub="Six typed slices on 0G. Specialists read + write through them; identity grows over time."
      />
      <div className="scroll">
        <div className="page">
          <div className="split">
            <aside className="split-side">
              {memorySlices.map((s) => {
                const c = counts[s.id] ?? 0;
                return (
                  <Link
                    key={s.id}
                    to={ROUTES.memorySlice(s.id)}
                    className={`item${active.id === s.id ? ' active' : ''}`}
                    onClick={(e) => { e.preventDefault(); nav(ROUTES.memorySlice(s.id)); }}
                  >
                    <div className="h">
                      <span style={{ marginRight: 6, color: 'var(--peach)' }}>{s.icon ?? '◌'}</span>
                      {s.label}
                    </div>
                    <div className="s">
                      {c} {c === 1 ? 'entry' : 'entries'}
                    </div>
                  </Link>
                );
              })}
              <a
                href={exportHref}
                download
                className="item"
                style={{ marginTop: 12, color: 'var(--text-mute)' }}
              >
                <div className="h" style={{ fontSize: 12 }}>↓ Export memory (JSON)</div>
                <div className="s">all 6 slices · twin 42</div>
              </a>
            </aside>

            <section>
              <div className="card">
                <div className="card-row">
                  <div className="grow">
                    <div className="card-title" style={{ fontSize: 16 }}>{active.label}</div>
                    <div className="card-sub">{active.description}</div>
                  </div>
                  <HashChip label="root" value={root?.rootHash ?? active.rootHash} />
                </div>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                  <div className="proof-row">
                    <div className="k">namespace</div>
                    <div className="v">{active.namespace}</div>
                  </div>
                  <div className="proof-row">
                    <div className="k">schema</div>
                    <div className="v">{active.schema}</div>
                  </div>
                  <div className="proof-row">
                    <div className="k">readers</div>
                    <div className="v">{active.primaryReader}</div>
                  </div>
                  <div className="proof-row">
                    <div className="k">writers</div>
                    <div className="v">{active.primaryWriter}</div>
                  </div>
                  <div className="proof-row" style={{ borderBottom: 0 }}>
                    <div className="k">gateway</div>
                    <div className="v">
                      <a
                        href={root?.gatewayUrl ?? gatewayUrl(active.rootHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--peach)' }}
                      >
                        ↗ verify on 0G storage
                      </a>
                      {source === 'localStorage' ? (
                        <span style={{ marginLeft: 8, color: 'var(--amber)', fontSize: 11 }}>
                          (offline · localStorage fallback)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {active.id !== 'working' ? (
                <form onSubmit={submit} className="card" style={{ padding: 14 }}>
                  <div className="label-mono" style={{ marginBottom: 8 }}>Teach this slice manually</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={placeholder(active.id)}
                      disabled={busy}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 8,
                        color: 'var(--text)',
                        font: 'inherit', fontSize: 14, outline: 0,
                      }}
                    />
                    <button type="submit" className="btn btn-peach" disabled={busy || !draft.trim()}>
                      {busy ? '…' : '+ Add entry'}
                    </button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>
                    Writes to <code style={{ color: 'var(--peach)' }}>{active.namespace}</code> with provenance <code style={{ color: 'var(--peach)' }}>manual</code>.
                  </div>
                </form>
              ) : null}

              {entries.length ? (
                <>
                  <div className="label-mono" style={{ margin: '24px 0 10px' }}>
                    Entries · {entries.length}
                  </div>
                  {entries.map((m) => (
                    <div key={m.id ?? m.ts} className="card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--peach)', minWidth: 90 }}>
                          {m.who ?? m.source ?? 'manual'}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{m.text}</span>
                        {m.stable ? (
                          <span style={{ fontSize: 10, color: 'var(--mint)', border: '1px solid rgba(94,234,212,0.3)', padding: '1px 6px', borderRadius: 999 }}>
                            stable
                          </span>
                        ) : (m.reinforcement ?? 1) > 1 ? (
                          <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>
                            ×{m.reinforcement}
                          </span>
                        ) : null}
                        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--text-faint)' }}>
                          {when(m.ts)}
                        </span>
                        {m.id ? (
                          <button className="btn" onClick={() => onForget(m.id)} style={{ padding: '4px 8px', fontSize: 11 }} title="Forget">
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div
                  style={{
                    marginTop: 24,
                    padding: 16,
                    background: 'var(--bg)',
                    border: '1px dashed var(--border)',
                    borderRadius: 10,
                    fontSize: 12.5,
                    color: 'var(--text-mute)',
                    textAlign: 'center',
                  }}
                >
                  No entries yet. {active.id === 'working' ? 'Working memory is in-flight only — clears each task.' : 'Add one above, or run a chat task to grow this slice automatically.'}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function placeholder(type) {
  switch (type) {
    case 'episodic':     return '"shipped a tweet about morning rituals · 3.2k likes"';
    case 'semantic':     return '"tone=terse, avoids exclamation marks, opens with contradiction"';
    case 'relationship': return '"@hannah — 3 cross-promos last quarter · likes pragmatic asks"';
    case 'temporal':     return '"morning posts perform 3× evening posts"';
    case 'procedural':   return '"never use superlatives this month"';
    default:             return 'Add an entry…';
  }
}

function when(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}
