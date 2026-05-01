// Bottom-right toast stack. Auto-mounted by AppShell. Consumes the global
// queue from useToasts.

import { dismissToast, useToasts } from '../hooks/useToasts.js';

const COLOR = {
  info:    { border: 'var(--border-strong)', accent: 'var(--text-mute)', icon: '·' },
  success: { border: 'var(--mint)',          accent: 'var(--mint)',      icon: '✓' },
  warn:    { border: 'var(--amber)',         accent: 'var(--amber)',     icon: '!' },
  error:   { border: 'var(--red)',           accent: 'var(--red)',       icon: '×' },
};

export function ToastStack() {
  const toasts = useToasts();
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        maxWidth: 360,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const c = COLOR[t.kind] ?? COLOR.info;
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              background: 'var(--bg-rail)',
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              animation: 'toastIn 220ms ease',
            }}
          >
            <div
              style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                color: c.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
                flexShrink: 0,
              }}
            >{c.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t.title ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>
              ) : null}
              {t.body ? (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.5 }}>
                  {t.body}
                </div>
              ) : null}
              {t.action ? (
                <a
                  href={t.action.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginTop: 6, display: 'inline-block', fontSize: 11.5, color: c.accent }}
                >
                  {t.action.label} ↗
                </a>
              ) : null}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="dismiss"
              style={{
                color: 'var(--text-faint)',
                background: 'transparent',
                border: 0, cursor: 'pointer',
                fontSize: 14, padding: 0,
              }}
            >×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
