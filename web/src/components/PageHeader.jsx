// Standard 52px page header used by every non-chat route. Mirrors .chat-head density.

export function PageHeader({ title, sub, right, icon }) {
  return (
    <header className="page-head">
      {icon ? <span className="icon-btn" aria-hidden>{icon}</span> : null}
      <div className="meta">
        <div className="title">{title}</div>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {right ? <div className="right">{right}</div> : null}
    </header>
  );
}
