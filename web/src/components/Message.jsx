// Renders one chat row. Three kinds:
//   user        — right-aligned bubble
//   agent       — specialist message; supports body parts (intro, hooks, draft, pattern, text)
//   agent-live  — same as agent but with peach left-border + cursor
//
// Body parts are arrays of strings + tagged objects ({ code }, { strong }, { ok })
// so we can render rich inline content without dangerouslySetInnerHTML.

import { useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { TaskCard } from './TaskCard.jsx';
import { getSpecialist } from '../data/specialists.js';

// Extract plain text from any body shape so we can copy / save it.
function bodyToText(body) {
  if (!body) return '';
  const parts = [];
  const flat = (arr) => Array.isArray(arr) ? arr.map((p) => typeof p === 'string' ? p : p.strong ?? p.code ?? p.ok ?? '').join('') : String(arr ?? '');
  if (body.intro) parts.push(flat(body.intro));
  if (body.text) parts.push(flat(body.text));
  if (body.draft) parts.push(flat(body.draft));
  if (body.hooks) parts.push(body.hooks.join('\n'));
  return parts.filter(Boolean).join('\n').trim();
}

function CopyButton({ text, label = 'copy' }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const onClick = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        color: copied ? 'var(--mint)' : 'var(--text-faint)',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontFamily: 'Geist Mono, monospace',
        cursor: 'pointer',
      }}
      title="Copy to clipboard"
    >
      {copied ? '✓ copied' : label}
    </button>
  );
}

function renderInline(parts) {
  if (!Array.isArray(parts)) return parts;
  return parts.map((p, i) => {
    if (typeof p === 'string') return <span key={i}>{p}</span>;
    if (p.code) return <code key={i}>{p.code}</code>;
    if (p.strong) return <strong key={i}>{p.strong}</strong>;
    if (p.ok) return <span key={i} className="ok">{p.ok}</span>;
    return null;
  });
}

function MessageBody({ body }) {
  return (
    <>
      {body.intro ? <span>{renderInline(body.intro)}</span> : null}
      {body.text ? <span>{renderInline(body.text)}</span> : null}
      {body.hooks ? (
        <ol className="hooks">
          {body.hooks.map((h, i) => <li key={i}>{h}</li>)}
        </ol>
      ) : null}
      {body.draft ? (
        <>
          <blockquote className="draft">{renderInline(body.draft)}</blockquote>
          {body.draftMeta ? (
            <div className="draft-meta">
              {body.draftMeta.map((m, i) => {
                if (typeof m === 'string') return <span key={i}>{m}</span>;
                if (m.ok) return <span key={i} className="ok">{m.ok}</span>;
                return null;
              }).reduce((acc, el, i, arr) => {
                acc.push(el);
                if (i < arr.length - 1) acc.push(<span key={`sep-${i}`}>·</span>);
                return acc;
              }, [])}
            </div>
          ) : null}
        </>
      ) : null}
      {body.pattern ? <PatternCard pattern={body.pattern} /> : null}
      {body.taskRef ? <TaskCard taskId={body.taskRef} /> : null}
    </>
  );
}

function PatternCard({ pattern }) {
  return (
    <div className="pattern">
      <div className="row">
        <span>pattern</span>
        <code>{pattern.name}</code>
      </div>
      <div className="chips">
        {pattern.chips.map((c, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className="chip">
              <span className="chip-mini">{c.mini}</span>
              {c.label}
            </span>
            {i < pattern.chips.length - 1 ? <span className="arr">→</span> : null}
          </span>
        ))}
      </div>
      <div className="meta">
        <span>tick {pattern.tick}</span>
        <span>·</span>
        <span>{pattern.via}</span>
      </div>
    </div>
  );
}

export function Message({ msg, onSavePreference }) {
  if (msg.kind === 'user') {
    const text = Array.isArray(msg.text)
      ? msg.text.map((p) => (typeof p === 'string' ? p : p.strong ?? '')).join('')
      : String(msg.text ?? '');
    return (
      <div className="user-row">
        <div className="user-bubble">{renderInline(Array.isArray(msg.text) ? msg.text : [msg.text])}</div>
        <div className="meta" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{msg.ts}</span>
          <CopyButton text={text} />
          {onSavePreference ? (
            <button
              type="button"
              onClick={() => onSavePreference(text)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-faint)',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 10.5,
                fontFamily: 'Geist Mono, monospace',
                cursor: 'pointer',
              }}
            >
              + save as preference
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const speaker = getSpecialist(msg.from);
  const isLive = msg.kind === 'agent-live';
  const isDirector = msg.from === 'director';
  const initial = speaker?.initial ?? '?';

  const plainText = bodyToText(msg.body);

  return (
    <div className={`msg${isLive ? ' live-msg' : ''}`}>
      <div className={`mav${isDirector ? ' dir' : ''}`}>{initial}</div>
      <div>
        <div className="head">
          <span className="name">{speaker?.name ?? msg.from}</span>
          <span className="role">{msg.role ?? speaker?.role}</span>
          {msg.step ? (
            <span className={`step${msg.step === 'live' ? ' live' : ''}`}>{msg.step}</span>
          ) : null}
          <span className={`ts${isLive ? ' live' : ''}`}>{msg.ts}</span>
          {!isLive && plainText ? <CopyButton text={plainText} /> : null}
        </div>
        <div className="body">
          <MessageBody body={msg.body} />
          {isLive ? <span className="cursor"></span> : null}
        </div>
      </div>
    </div>
  );
}
