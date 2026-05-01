// Direct chat with a single specialist subagent (JOURNEY §4.2).
// /team/:specialistId

import { useParams, Link } from 'react-router-dom';
import { Composer } from '../components/Composer.jsx';
import { Message } from '../components/Message.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { TokenChip } from '../components/TokenChip.jsx';
import { getSpecialist } from '../data/specialists.js';
import { specialistThread } from '../data/threads.js';
import { ROUTES } from '../lib/routes.js';

export default function TeamChat() {
  const { specialistId } = useParams();
  const specialist = getSpecialist(specialistId);
  const thread = specialistThread(specialistId);

  if (!specialist || specialist.id === 'director') {
    return (
      <>
        <header className="chat-head">
          <div className="meta"><div className="name">Unknown subagent</div></div>
        </header>
        <div className="scroll">
          <div className="stream">
            <p style={{ color: 'var(--text-mute)' }}>
              No subagent <code>{specialistId}</code>. <Link to={ROUTES.chat}>Go home →</Link>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="chat-head">
        <Avatar initial={specialist.initial} size="md" dot={specialist.statusDot} />
        <div className="meta">
          <div className="name">{specialist.name}</div>
          <div className="sub">
            <span style={{ color: 'var(--mint)' }}>●</span> {specialist.status} · {specialist.role} · {specialist.model}
          </div>
        </div>
        <div className="right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link to={ROUTES.specialist(specialist.id)}>
            <TokenChip value={specialist.tokenId} />
          </Link>
          <button className="icon-btn" title="open in new">↗</button>
        </div>
      </header>

      <div className="scroll">
        <div className="stream">
          {thread ? (
            <>
              <div className="day">{thread.day}</div>
              {thread.messages.map((m, i) => <Message key={i} msg={m} />)}
            </>
          ) : (
            <div className="day">No messages yet — send {specialist.name} a task below.</div>
          )}
        </div>
      </div>

      <Composer placeholder={`Message ${specialist.name}`} />
    </>
  );
}
