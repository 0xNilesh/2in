export function shortHash(hash, head = 6, tail = 4) {
  if (!hash) return '';
  if (hash.length <= head + tail + 2) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function explorerUrl(tokenId) {
  // Galileo testnet explorer; mainnet swap-in is a one-line edit per PLAN §A.
  return `https://chainscan-galileo.0g.ai/token/${tokenId}`;
}

export function gatewayUrl(rootHash) {
  if (!rootHash) return null;
  return `https://indexer-storage-turbo.0g.ai/file?root=${rootHash}`;
}
