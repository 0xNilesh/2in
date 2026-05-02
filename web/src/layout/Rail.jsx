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
import { useTwin } from '../hooks/useTwin.js';
import { useAuth } from '../hooks/useAuth.js';
import { Avatar } from '../components/Avatar.jsx';
import { useThreads, relativeTime } from '../hooks/useThreads.js';

// Short-format an Ethereum address. Returns `—` when nothing is connected.
function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
}

// True when the user has run the Settings → Authorize orchestrator flow.
// Settings writes this flag on a confirmed delegateAccess tx and
// dispatches `2in:delegated-changed` for in-tab subscribers; cross-tab
// updates come through the native `storage` event.
function isDelegated() {
  try { return window.localStorage.getItem('2in:delegated') === '1'; }
  catch { return false; }
}

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
  const { threads, createThread } = useThreads();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const auth = useAuth();
  const [delegated, setDelegated] = useState(() => isDelegated());

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);

  // Keep the delegated pill in sync with the authorize flow in Settings
  // (same-tab via custom event) and with cross-tab logout/reset (storage).
  useEffect(() => {
    const sync = () => setDelegated(isDelegated());
    window.addEventListener('storage', sync);
    window.addEventListener('2in:delegated-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('2in:delegated-changed', sync);
    };
  }, []);

  const toggle = (key) => () => setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  // Active thread highlight if we're at /chat/<id>
  const activeThreadId = loc.pathname.startsWith('/chat/') ? loc.pathname.split('/')[2] : null;

  const newChat = () => {
    const t = createThread();
    nav(ROUTES.chatThread(t.id));
  };

  // Newest first.
  const sortedThreads = [...threads].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  return (
    <aside className="rail">
      <header className="rail-head">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/brand/logo.svg" alt="2in" width="32" height="32" style={{ display: 'block' }} />
          {twin.name !== '2in' ? (
            <span style={{ color: 'var(--peach)', fontSize: 16 }}>{twin.name}</span>
          ) : null}
        </div>
        <button className="new" title="New chat" onClick={newChat}>+</button>
      </header>

      <div className="rail-scroll">
        <div className="section">Chats with {twin.name}</div>
        {sortedThreads.map((t) => (
          <NavLink
            key={t.id}
            to={ROUTES.chatThread(t.id)}
            className={`nav-row${activeThreadId === t.id ? ' active' : ''}`}
          >
            <span className="ic">◌</span>
            <span className="label thread-label">{t.title}</span>
            <span className="id thread-when">{relativeTime(t.updatedAt)}</span>
          </NavLink>
        ))}
        <CollapseHeader
          label="Your team"
          count={specialists.length}
          open={!collapsed.team}
          onToggle={toggle('team')}
        />
        {!collapsed.team ? (
          <>
            {specialists.map((s) => (
              <Row key={s.id} to={ROUTES.specialist(s.id)}>
                <Avatar initial={s.initial} dot={s.statusDot} />
                <span className="label">{s.name}</span>
              </Row>
            ))}
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
            <div className="h">{shortAddr(auth.address)}</div>
            <div className="a">galileo · 16602</div>
          </div>
        </div>
        {delegated ? <span className="deleg-pill">delegated</span> : null}
      </footer>
    </aside>
  );
}
