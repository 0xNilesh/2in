// Runner toolbox catalog — PLAN §4.4. Grouped by capability surface.

import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { toolGroups } from '../data/tools.js';

export default function Tools() {
  return (
    <>
      <PageHeader
        title="Tools"
        sub="Native primitives Runner composes per goal. Each is a typed function with a zod schema."
      />
      <div className="scroll">
        <div className="page">
          {toolGroups.map((group) => (
            <section key={group.label}>
              <div className="label-mono" style={{ marginBottom: 10, marginTop: 10 }}>{group.label}</div>
              <div className="grid">
                {group.tools.map((t) => (
                  <div key={t.id} className="card" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{
                        background: 'var(--peach-10)', color: 'var(--peach)',
                        padding: '2px 8px', borderRadius: 6,
                        fontFamily: 'Geist Mono, monospace', fontSize: 12.5, fontWeight: 500,
                      }}>{t.name}</code>
                      <StatusPill color={t.status === 'live' ? 'mint' : 'muted'}>{t.status}</StatusPill>
                    </div>
                    <div style={{
                      marginTop: 8,
                      fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-2)',
                    }}>
                      {t.signature}
                    </div>
                    <div className="card-sub" style={{ marginTop: 6 }}>{t.backend}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
