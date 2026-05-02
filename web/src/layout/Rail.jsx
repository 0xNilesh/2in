// Persistent left rail. Sections (top to bottom):
//   brand · + new chat
//   Recent chats with <twin>  — multi-thread list
//   Your team                 — direct subagent chats
//   Workshop                  — memory · patterns · tools · activity
//   Account                   — settings
//   wallet footer

import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../lib/routes.js';
import { specialists } from '../data/specialists.js';
import { directorThreads } from '../data/threads.js';
import { user } from '../data/user.js';
import { useTwin } from '../hooks/useTwin.js';
import { Avatar } from '../components/Avatar.jsx';

// Persisted collapse state per section. Default the team to closed since the
// roster is 8 long and direct subagent chat is the rarer path.
const COLLAPSE_KEY = '2in:rail:collapsed';
const DEFAULTS = { team: true, workshop: false };

function loadCollapsed() {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function CollapseHeader({ label, count, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="section"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: 'calc(100% - 12px)',
        margin: '0 6px',
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          fontSize: 9,
          color: 'var(--text-faint)',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 120ms ease',
        }}
      >▶</span>
      <span style={{ flex: 1 }}>{label}{count != null ? ` · ${count}` : ''}</span>
    </button>
  );
}

function Row({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-row${isActive ? ' active' : ''}`}
    >
      {children}
    </NavLink>
  );
}

export function Rail() {
  const [twin] = useTwin();
  const nav = useNavigate();
  const loc = useLocation();
  const threads = directorThreads();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  const toggle = (key) => () => setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  // Active thread highlight if we're at /chat/<id>
  const activeThreadId = loc.pathname.startsWith('/chat/') ? loc.pathname.split('/')[2] : null;

  const newChat = () => {
    // Mock: jump to the most recent thread that isn't the current one.
    const next = threads.find((t) => t.id !== activeThreadId) ?? threads[0];
    if (next) nav(ROUTES.chatThread(next.id));
  };

  return (
    <aside className="rail">
      <header className="rail-head">
        <div className="brand">
          {twin.name === '2in' ? <>2<em>in</em></> : <span style={{ color: 'var(--peach)' }}>{twin.name}</span>}
        </div>
        <button className="new" title="New chat" onClick={newChat}>+</button>
      </header>

      <div className="rail-scroll">
        <div className="section">Chats with {twin.name}</div>
        {threads.map((t) => (
          <NavLink
            key={t.id}
            to={ROUTES.chatThread(t.id)}
            className={`nav-row${activeThreadId === t.id ? ' active' : ''}`}
          >
            <span className="ic">◌</span>
            <span className="label thread-label">{t.title}</span>
            <span className="id thread-when">{t.updatedAt}</span>
          </NavLink>
        ))}
        <button className="add" onClick={newChat}>
          <span className="ic">+</span>New chat with {twin.name}
        </button>

        <CollapseHeader
          label="Your team"
          count={specialists.length}
          open={!collapsed.team}
          onToggle={toggle('team')}
        />
        {!collapsed.team ? (
          <>
            {specialists.map((s) => (
              <Row key={s.id} to={ROUTES.team(s.id)}>
                <Avatar initial={s.initial} dot={s.statusDot} />
                <span className="label">{s.name}</span>
                <span className="id">#{s.tokenId}</span>
              </Row>
            ))}
            <a className="add"><span className="ic">+</span>Train new specialist</a>
          </>
        ) : null}

        <CollapseHeader
          label="Workshop"
          open={!collapsed.workshop}
          onToggle={toggle('workshop')}
        />
        {!collapsed.workshop ? (
          <>
            <Row to={ROUTES.memory}>
              <span className="ic">⌬</span>
              <span className="label">Memory</span>
            </Row>
            <Row to={ROUTES.patterns}>
              <span className="ic">◐</span>
              <span className="label">Patterns</span>
            </Row>
            <Row to={ROUTES.tools}>
              <span className="ic">⚒</span>
              <span className="label">Tools</span>
            </Row>
            <Row to={ROUTES.library}>
              <span className="ic">▣</span>
              <span className="label">Library</span>
            </Row>
          </>
        ) : null}

        <div className="section">Account</div>
        <Row to={ROUTES.settings}>
          <span className="ic">⚙</span>
          <span className="label">Settings</span>
        </Row>
      </div>

      <footer className="rail-foot">
        <div className="wallet">
          <div className="ww"></div>
          <div className="meta">
            <div className="h">{user.handle}</div>
            <div className="a">{user.shortAddress}</div>
          </div>
        </div>
        {user.delegated ? <span className="deleg-pill">delegated</span> : null}
      </footer>
    </aside>
  );
}
