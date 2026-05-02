// Chat composer with file attach. Controlled internally (text + attachments),
// fires onSend(text, attachments) with the trimmed text + the array of
// uploaded { url, name, mimeType, sizeBytes }. Submit on Enter (Shift+Enter
// for newline).
//
// Attach uploads each picked file to /api/upload and then renders a chip
// strip above the textarea showing the upload(s); clicking ✕ removes one.

import { useEffect, useRef, useState } from 'react';
import { uploadApi } from '../lib/api.js';
import { pushToast } from '../hooks/useToasts.js';

function kindOf(mime) {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

export function Composer({ placeholder = 'Message 2in', onSend, disabled = false }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-grow with the content. Reset to 'auto' first so shrinking works
  // on backspace; max-height is enforced by CSS so this safely caps and
  // overflow-y kicks in once we hit the lid.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;
    setText('');
    setAttachments([]);
    onSend?.(trimmed, attachments);
  };

  const onKeyDown = (e) => {
    // Shift+Enter for newline; Enter (or ⌘/Ctrl+Enter) sends.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPickFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        try {
          const res = await uploadApi.send(f);
          uploaded.push({ ...res, kind: kindOf(res.mimeType) });
        } catch (err) {
          pushToast({ kind: 'error', title: 'Upload failed', body: `${f.name}: ${err.message ?? 'unknown'}`, ttlMs: 3000 });
        }
      }
      setAttachments((curr) => [...curr, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (filename) => {
    setAttachments((curr) => curr.filter((a) => a.filename !== filename));
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        {attachments.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px 2px' }}>
            {attachments.map((a) => (
              <div
                key={a.filename}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 6px 3px 3px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1,
                }}
              >
                {a.kind === 'image' ? (
                  <img src={a.url} alt={a.originalFilename} style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />
                ) : (
                  <span style={{ display: 'inline-block', width: 24, height: 24, lineHeight: '24px', textAlign: 'center', fontSize: 13, color: 'var(--peach)' }}>
                    {a.kind === 'video' ? '▶' : a.kind === 'audio' ? '♪' : '◌'}
                  </span>
                )}
                <span style={{ color: 'var(--text-2)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.originalFilename}>
                  {a.originalFilename}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.filename)}
                  style={{ background: 'transparent', border: 0, color: 'var(--text-faint)', cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}
                  title="Remove"
                >✕</button>
              </div>
            ))}
            {uploading ? (
              <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--peach)' }}>uploading…</span>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          rows="1"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          style={attachments.length > 0 ? { paddingTop: 6 } : undefined}
        />
        <div className="composer-bar">
          <button
            className="icon-chip"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '…uploading' : '✦ attach'}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => onPickFiles(Array.from(e.target.files ?? []))}
          />
          <button
            className="send"
            type="button"
            onClick={submit}
            disabled={disabled || (!text.trim() && attachments.length === 0)}
            style={{
              opacity: disabled || (!text.trim() && attachments.length === 0) ? 0.55 : 1,
              cursor: disabled || (!text.trim() && attachments.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            Send ↵
          </button>
        </div>
      </div>
    </div>
  );
}
