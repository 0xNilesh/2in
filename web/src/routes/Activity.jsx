// Full job log — JOURNEY §5 lifecycle. Filterable in v1; for now just lists.

import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { activity, stateLabels } from '../data/activity.js';
import { getSpecialist } from '../data/specialists.js';
import { Avatar } from '../components/Avatar.jsx';
import { ROUTES } from '../lib/routes.js';
import { gatewayUrl } from '../lib/format.js';

export default function Activity() {
  return (
    <>
      <PageHeader
        title="Activity"
        sub="Every job your team has run · queued · running · awaiting · approved · archived"
      />
      <div className="scroll">
        <div className="page">
          <div className="table-card">
            <div className="table-row head" style={{ '--cols': '120px 1fr 180px 130px 140px 90px' }}>
              <span>job</span>
              <span>title · pattern</span>
              <span>specialists</span>
              <span>state</span>
              <span>started</span>
              <span>cost</span>
            </div>
            {activity.map((j) => {
              const meta = stateLabels[j.state];
              return (
                <div
                  key={j.id}
                  className="table-row"
                  style={{ '--cols': '120px 1fr 180px 130px 140px 90px' }}
                >
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-mute)' }}>
                    {j.id}
                  </span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{j.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'Geist Mono, monospace' }}>
                      {j.pattern}
                      {j.archiveRoot ? (
                        <>
                          {' · '}
                          <a href={gatewayUrl(j.archiveRoot)} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>
                            ↗ verify
                          </a>
                        </>
                      ) : null}
                    </div>
                  </span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    {j.specialists.map((sid) => {
                      const s = getSpecialist(sid);
                      if (!s) {
                        return (
                          <span key={sid} className="av" title={sid} style={{ width: 22, height: 22, fontSize: 10 }}>
                            {sid[0]?.toUpperCase()}
                          </span>
                        );
                      }
                      return (
                        <Link key={sid} to={ROUTES.chat(s.id)} title={s.name}>
                          <Avatar initial={s.initial} variant={s.id === 'director' ? 'dir' : undefined} />
                        </Link>
                      );
                    })}
                  </span>
                  <span><StatusPill color={meta.color}>{meta.label}</StatusPill></span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-mute)' }}>
                    {j.startedAt}
                  </span>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--text-2)' }}>
                    {j.cost}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
