// Memory slice browser. Two-pane: list left, detail right.
// User can add a manual entry to the active slice — persists to localStorage,
// rendered with provenance "manual" alongside the seed samples.

import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { HashChip } from '../components/TokenChip.jsx';
import { memorySlices, getMemorySlice } from '../data/memory.js';
import { ROUTES } from '../lib/routes.js';
import { gatewayUrl } from '../lib/format.js';
import { useMemorySlice } from '../hooks/useMemorySlice.js';

export default function Memory() {
  const { sliceId } = useParams();
  const nav = useNavigate();
  const active = getMemorySlice(sliceId) ?? memorySlices[0];
  const { entries: manual, add, remove, root, source } = useMemorySlice(active.id);
  const [draft, setDraft] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    add(text);
    setDraft('');
  };

  return (
    <>
      <PageHeader
        title="Memory"
        sub="Per-specialist + master typed slices on 0G KV. Manual edits write through with provenance."
      />
      <div className="scroll">
        <div className="page">
          <div className="split">
            <aside className="split-side">
              {memorySlices.map((s) => (
                <Link
                  key={s.id}
                  to={ROUTES.memorySlice(s.id)}
                  className={`item${active.id === s.id ? ' active' : ''}`}
                  onClick={(e) => { e.preventDefault(); nav(ROUTES.memorySlice(s.id)); }}
                >
                  <div className="h">{s.label}</div>
                  <div className="s">{s.entries} entries · {s.lastWrite}</div>
                </Link>
              ))}
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

              <form onSubmit={submit} className="card" style={{ padding: 14 }}>
                <div className="label-mono" style={{ marginBottom: 8 }}>Teach this slice manually</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Add an entry to ${active.label} — e.g. "never use exclamation marks"`}
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
                  <button type="submit" className="btn btn-peach">+ Add entry</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>
                  Writes to <code style={{ color: 'var(--peach)' }}>{active.namespace}</code> with provenance <code style={{ color: 'var(--peach)' }}>manual</code>.
                </div>
              </form>

              {manual.length ? (
                <>
                  <div className="label-mono" style={{ margin: '24px 0 10px' }}>Your entries · {manual.length}</div>
                  {manual.map((m) => (
                    <div key={m.ts} className="card" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--peach)', minWidth: 110 }}>{m.who}</span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{m.text}</span>
                        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--text-faint)' }}>{m.when}</span>
                        <button className="btn" onClick={() => remove(m.ts)} style={{ padding: '4px 8px', fontSize: 11 }}>✕</button>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}

              {manual.length === 0 ? (
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
                  No entries yet. Add one above, or send a chat correction
                  in the conversation and click <em>save as preference</em>.
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
