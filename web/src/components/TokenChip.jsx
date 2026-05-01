// Compact tokenId / hash badge. Optional `to` makes it a link to the explorer.

import { explorerUrl } from '../lib/format.js';

export function TokenChip({ label = 'tokenId', value, link = false }) {
  const inner = (
    <span className="token-chip">
      <span className="k">{label}</span>
      <span className="v">#{value}</span>
    </span>
  );
  if (!link || !value) return inner;
  return (
    <a href={explorerUrl(value)} target="_blank" rel="noreferrer">
      {inner}
    </a>
  );
}

export function HashChip({ label, value }) {
  return (
    <span className="token-chip">
      <span className="k">{label}</span>
      <span className="v" style={{ color: 'var(--text-2)' }}>{value}</span>
    </span>
  );
}
