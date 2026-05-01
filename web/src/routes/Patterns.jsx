// Pattern catalog — orchestration patterns Director can pick (PLAN §4.3).

import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { patterns } from '../data/patterns.js';

export default function Patterns() {
  return (
    <>
      <PageHeader
        title="Patterns"
        sub="Named orchestration paths Director enumerates per goal. Adding one = adding a JSON file."
      />
      <div className="scroll">
        <div className="page">
          {patterns.map((p) => (
            <div key={p.id} className="card">
              <div className="card-row">
                <div className="grow">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{
                      background: 'var(--peach-10)', color: 'var(--peach)',
                      padding: '2px 8px', borderRadius: 6,
                      fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 500,
                    }}>{p.name}</code>
                    <StatusPill color={p.status === 'live' ? 'mint' : 'muted'}>{p.status}</StatusPill>
                  </div>
                  <div className="card-sub" style={{ marginTop: 6 }}>{p.description}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{p.runs}</div>
                  <div className="card-sub">runs</div>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                <div className="chips">
                  {p.chips.map((c, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <span className="chip"><span className="chip-mini">{c.mini}</span>{c.label}</span>
                      {i < p.chips.length - 1 ? <span className="arr">→</span> : null}
                    </span>
                  ))}
                </div>
                <div style={{
                  marginTop: 10, fontFamily: 'Geist Mono, monospace',
                  fontSize: 10.5, color: 'var(--text-faint)',
                  display: 'flex', gap: 12,
                }}>
                  <span>avg cost · {p.avgCost}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
