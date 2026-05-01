// Coloured pill — drives activity state, royalty status, etc.
const colorClass = {
  mint: 'pill-mint',
  amber: 'pill-amber',
  red: 'pill-red',
  peach: 'pill-peach',
  muted: 'pill-muted',
};

export function StatusPill({ color = 'muted', children }) {
  return <span className={`pill ${colorClass[color] ?? colorClass.muted}`}>{children}</span>;
}
