// Renders one chat row. Three kinds:
//   user        — right-aligned bubble
//   agent       — specialist message; supports body parts (intro, hooks, draft, pattern, text)
//   agent-live  — same as agent but with peach left-border + cursor
//
// Body parts are arrays of strings + tagged objects ({ code }, { strong }, { ok })
// so we can render rich inline content without dangerouslySetInnerHTML.

import { useEffect, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { TaskCard } from './TaskCard.jsx';
import { getSpecialist } from '../data/specialists.js';
import { absolutize } from '../lib/api.js';

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
      {body.toolResult ? <ToolResultCard {...body.toolResult} /> : null}
      {body.toolRunning ? <ToolRunningInline {...body.toolRunning} /> : null}
    </>
  );
}

function ToolRunningInline({ tool, startedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 100) / 10 : 0;
  const hint = tool === 'image.edit'
    ? 'Calling 0G qwen-image-edit-2511 — usually 20–60s'
    : tool?.startsWith('video.') ? 'Running ffmpeg'
    : 'Running…';
  return (
    <div
      style={{
        marginTop: 6,
        padding: 10,
        background: 'var(--bg)',
        border: '1px solid var(--peach)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          border: '2px solid rgba(255,138,91,0.25)',
          borderTopColor: 'var(--peach)',
          borderRadius: '50%',
          animation: 'msg-spin 0.8s linear infinite',
          flexShrink: 0,
        }}
      >
        <style>{'@keyframes msg-spin { to { transform: rotate(360deg) } }'}</style>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-mute)', minWidth: 0, flex: 1 }}>
        <code style={{ color: 'var(--peach)' }}>{tool}</code>
        <span> · {elapsed.toFixed(1)}s</span>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{hint}</div>
      </div>
    </div>
  );
}

function ToolResultCard({ tool, input, output }) {
  const url = absolutize(output?.outputUrl ?? output?.url ?? null);
  const kind = url ? guessMediaKind(url) : null;
  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <code style={{ fontSize: 11, color: 'var(--peach)', fontFamily: 'Geist Mono, monospace' }}>{tool}</code>
        {input?.instruction ? (
          <span style={{ fontSize: 11.5, color: 'var(--text-mute)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{input.instruction}"
          </span>
        ) : null}
      </div>
      {kind === 'image' ? (
        <img src={url} alt="output" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 6, background: 'var(--bg)' }} />
      ) : kind === 'video' ? (
        <video src={url} controls style={{ width: '100%', maxHeight: 320, borderRadius: 6, background: '#000' }} />
      ) : kind === 'audio' ? (
        <audio src={url} controls style={{ width: '100%' }} />
      ) : null}
      {url ? (
        <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-faint)' }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--peach)' }}>↗ open</a>
          <a href={url} download style={{ color: 'var(--peach)' }}>↓ save</a>
          {output?.sizeBytes ? <span>{(output.sizeBytes / 1024).toFixed(1)} KB</span> : null}
          {output?.backend ? <span style={{ color: 'var(--mint)' }}>{output.backend}</span> : null}
        </div>
      ) : (
        // No output URL — render the raw JSON for tools like scene_cuts / probe
        <pre style={{ margin: 0, fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--text-2)', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function guessMediaKind(url) {
  const u = String(url).toLowerCase();
  if (/\.(mp4|mov|webm|mkv)(\?|#|$)/.test(u)) return 'video';
  if (/\.(png|jpg|jpeg|webp|gif|bmp|tiff)(\?|#|$)/.test(u)) return 'image';
  if (/\.(mp3|wav|m4a|ogg|flac)(\?|#|$)/.test(u)) return 'audio';
  return null;
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
        <div className="user-bubble">
          {renderInline(Array.isArray(msg.text) ? msg.text : [msg.text])}
          {msg.attachments?.length ? (
            <div style={{ marginTop: msg.text ? 8 : 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {msg.attachments.map((a) => (
                a.kind === 'image' ? (
                  <img key={a.filename} src={absolutize(a.url)} alt={a.originalFilename}
                    style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, objectFit: 'cover' }} />
                ) : a.kind === 'video' ? (
                  <video key={a.filename} src={absolutize(a.url)} controls
                    style={{ maxWidth: 260, maxHeight: 180, borderRadius: 8, background: '#000' }} />
                ) : a.kind === 'audio' ? (
                  <audio key={a.filename} src={absolutize(a.url)} controls style={{ maxWidth: 260 }} />
                ) : (
                  <a key={a.filename} href={absolutize(a.url)} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--peach)', fontSize: 12, textDecoration: 'underline' }}>
                    {a.originalFilename}
                  </a>
                )
              ))}
            </div>
          ) : null}
        </div>
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
