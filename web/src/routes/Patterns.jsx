// Pattern catalog — live from the orchestrator's actual PATTERNS map via
// GET /api/task/patterns. Shows what the Director can dispatch right now,
// not the static demo list this page used to render.

import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { taskApi } from '../lib/api.js';
import { getSpecialist } from '../data/specialists.js';

// Memory access map mirrors SPECIALIST_MEMORY in server/src/services/orchestrator.ts.
// Kept here only for the visualization; if you change one, change both.
const MEMORY_MAP = {
  director:   { reads: [],                                    writes: [] },
  writer:     { reads: ['semantic', 'episodic', 'temporal'],  writes: ['episodic'] },
  researcher: { reads: ['episodic', 'temporal'],              writes: ['semantic', 'episodic'] },
  editor:     { reads: ['procedural', 'semantic'],            writes: ['procedural'] },
  strategist: { reads: ['temporal', 'episodic'],              writes: ['temporal'] },
  companion:  { reads: ['relationship', 'semantic'],          writes: ['semantic', 'relationship'] },
  voice:      { reads: ['semantic', 'episodic'],              writes: ['episodic'] },
  visual:     { reads: ['semantic'],                          writes: ['episodic'] },
  negotiator: { reads: ['relationship', 'procedural'],        writes: ['relationship'] },
};

const TYPE_ABBR = {
  episodic: 'ep', semantic: 'sem', relationship: 'rel',
  temporal: 'tmp', procedural: 'proc', working: 'wrk',
};

export default function Patterns() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    taskApi.patterns()
      .then((res) => { if (!cancelled) setPatterns(res.patterns ?? []); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'fetch_failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <PageHeader
        title="Patterns"
        sub={`${patterns.length} live patterns the Director can dispatch. Each is a fixed sequence of specialist steps with declared memory access.`}
      />
      <div className="scroll">
        <div className="page">
          {loading ? <div className="card-sub">Loading registry…</div> : null}
          {error ? <div style={{ color: 'var(--red)' }}>{error}</div> : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {patterns.map((p) => <PatternCard key={p.id} pattern={p} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function PatternCard({ pattern }) {
  const stepCount = pattern.steps?.length ?? 0;
  // Aggregate the memory access of every step's agent.
  const aggReads = new Set();
  const aggWrites = new Set();
  for (const s of pattern.steps ?? []) {
    const m = MEMORY_MAP[s.agent];
    if (!m) continue;
    for (const t of m.reads) aggReads.add(t);
    for (const t of m.writes) aggWrites.add(t);
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <code style={{
          background: 'var(--peach-10)', color: 'var(--peach)',
          padding: '2px 8px', borderRadius: 6,
          fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 500,
        }}>{pattern.id}</code>
        <StatusPill color="mint">live</StatusPill>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
          {stepCount} step{stepCount === 1 ? '' : 's'}
        </span>
      </div>

      {pattern.description ? (
        <div className="card-sub" style={{ marginTop: 8, lineHeight: 1.55 }}>
          {pattern.description}
        </div>
      ) : null}

      {/* Step chain — specialist initials with arrows */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      }}>
        {pattern.steps?.map((s, i) => {
          const speaker = getSpecialist(s.agent);
          const m = MEMORY_MAP[s.agent];
          return (
            <span key={s.idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  fontSize: 12,
                }}
                title={s.label}
              >
                <span
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--peach-10)', color: 'var(--peach)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600,
                  }}
                >
                  {speaker?.initial ?? s.agent[0]?.toUpperCase()}
                </span>
                <span style={{ color: 'var(--text-2)' }}>{speaker?.name ?? s.agent}</span>
                {m && m.reads.length > 0 ? (
                  <span style={{ color: 'var(--mint)', fontSize: 10, fontFamily: 'Geist Mono, monospace' }} title={`reads ${m.reads.join(', ')}`}>
                    ↓{m.reads.map((t) => TYPE_ABBR[t] ?? t).join('+')}
                  </span>
                ) : null}
                {m && m.writes.length > 0 ? (
                  <span style={{ color: 'var(--peach)', fontSize: 10, fontFamily: 'Geist Mono, monospace' }} title={`writes ${m.writes.join(', ')}`}>
                    ↑{m.writes.map((t) => TYPE_ABBR[t] ?? t).join('+')}
                  </span>
                ) : null}
              </span>
              {i < pattern.steps.length - 1 ? (
                <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>→</span>
              ) : null}
            </span>
          );
        })}
      </div>

      {/* Aggregate memory footprint */}
      <div style={{
        marginTop: 10, fontSize: 10.5, color: 'var(--text-faint)',
        fontFamily: 'Geist Mono, monospace',
        display: 'flex', flexWrap: 'wrap', gap: 14,
      }}>
        {aggReads.size > 0 ? (
          <span>
            <span style={{ color: 'var(--mint)' }}>reads</span>
            {' '}{[...aggReads].map((t) => TYPE_ABBR[t] ?? t).join(' · ')}
          </span>
        ) : null}
        {aggWrites.size > 0 ? (
          <span>
            <span style={{ color: 'var(--peach)' }}>writes</span>
            {' '}{[...aggWrites].map((t) => TYPE_ABBR[t] ?? t).join(' · ')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
