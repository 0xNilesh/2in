// useMintRoster — fires the master mint, then 4 sequential iCloneFrom calls
// for the default roster (Quill, Cadence, Mantle, Mark). Each row in the
// returned `rows` array goes pending → submitted (txHash visible) → confirmed.
//
// Real mode: routes calls through the user's Privy embedded-wallet signer.
// Mock mode: deterministic tx hashes, ~1s delays per row. Same shape.

import { useCallback, useState } from 'react';
import { mintMaster, cloneSpecialist, isChainConfigured } from '../lib/chain.js';

const ROSTER = [
  { id: 'master',  who: 'master',  trainedOn: 'identity',                  isMaster: true  },
  { id: 'quill',   who: 'Quill',   trainedOn: 'tweets',                    isMaster: false },
  { id: 'cadence', who: 'Cadence', trainedOn: 'podcast / video transcripts', isMaster: false },
  { id: 'mantle',  who: 'Mantle',  trainedOn: 'contracts',                 isMaster: false },
  { id: 'mark',    who: 'Mark',    trainedOn: 'rejection_memory',          isMaster: false },
];

const initialRows = (twinName) =>
  ROSTER.map((r) => ({
    ...r,
    label: r.isMaster ? `${twinName || '2in'} · master twin` : r.who,
    status: 'pending', // pending · submitting · confirmed · failed
    txHash: null,
    tokenId: null,
    explorerUrl: null,
    error: null,
  }));

export function useMintRoster({ twinName, walletAddress, signer, corpusUri }) {
  const [rows, setRows] = useState(() => initialRows(twinName));
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setRows(initialRows(twinName));
    setDone(false);
    setRunning(false);
  }, [twinName]);

  const start = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setDone(false);
    setRows(initialRows(twinName));

    let masterTokenId = null;
    let i = 0;
    for (const r of ROSTER) {
      i += 1;
      // Mark this row submitting
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: 'submitting' } : x)));
      try {
        const result = r.isMaster
          ? await mintMaster({
              to: walletAddress,
              encryptedURI: corpusUri ?? `0g://master/${twinName ?? '2in'}`,
              signer,
            })
          : await cloneSpecialist({
              to: walletAddress,
              parentTokenId: masterTokenId ?? 42,
              encryptedURI: `0g://specialist/${r.id}`,
              signer,
            });
        if (r.isMaster) masterTokenId = result.tokenId;
        setRows((rs) =>
          rs.map((x) =>
            x.id === r.id
              ? { ...x, status: 'confirmed', txHash: result.txHash, tokenId: result.tokenId, explorerUrl: result.explorerUrl }
              : x,
          ),
        );
      } catch (err) {
        setRows((rs) =>
          rs.map((x) => (x.id === r.id ? { ...x, status: 'failed', error: err?.message ?? 'failed' } : x)),
        );
        setRunning(false);
        return;
      }
      // Tiny gap between txs so the reveal feels paced (only in mock — the
      // real path's network latency provides its own pacing).
      if (!isChainConfigured()) {
        await new Promise((r) => setTimeout(r, 250));
      }
      void i;
    }
    setRunning(false);
    setDone(true);
  }, [running, twinName, walletAddress, signer, corpusUri]);

  return { rows, start, reset, running, done };
}
