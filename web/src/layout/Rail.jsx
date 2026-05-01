// Persistent left rail. Sections (top to bottom):
//   brand · + new chat
//   Recent chats with <twin>  — multi-thread list
//   Your team                 — direct subagent chats
//   Workshop                  — memory · patterns · tools · activity
//   Account                   — settings
//   wallet footer

import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../lib/routes.js';
import { specialists } from '../data/specialists.js';
import { directorThreads } from '../data/threads.js';
import { user } from '../data/user.js';
import { useTwin } from '../hooks/useTwin.js';
import { Avatar } from '../components/Avatar.jsx';

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

        <div className="section">Your team · {specialists.length}</div>
        {specialists.map((s) => (
          <Row key={s.id} to={ROUTES.team(s.id)}>
            <Avatar initial={s.initial} dot={s.statusDot} />
            <span className="label">{s.name}</span>
            <span className="id">#{s.tokenId}</span>
          </Row>
        ))}
        <a className="add"><span className="ic">+</span>Train new specialist</a>

        <div className="section">Workshop</div>
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
