// Chat composer. Controlled internally (text + key handling), fires onSend
// with the trimmed text. Submit on ⌘/Ctrl + Enter or Send button.

import { useState } from 'react';

export function Composer({ placeholder = 'Message 2in', onSend, disabled = false }) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    onSend?.(trimmed);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          rows="1"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
        <div className="composer-bar">
          <button className="icon-chip" type="button">+ memory</button>
          <button className="icon-chip" type="button">@ address</button>
          <button className="icon-chip" type="button">◐ pattern</button>
          <button className="icon-chip" type="button">✦ attach</button>
          <button
            className="send"
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            style={{
              opacity: disabled || !text.trim() ? 0.55 : 1,
              cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Send ↵
          </button>
        </div>
      </div>
    </div>
  );
}
