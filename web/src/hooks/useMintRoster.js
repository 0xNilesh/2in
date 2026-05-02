// useMintRoster — fires the master mint, then 4 sequential iCloneFrom calls
// for the default roster (Quill, Cadence, Mantle, Mark). Each row in the
// returned `rows` array goes pending → submitted (txHash visible) → confirmed.
//
// Real mode: routes calls through the user's Privy embedded-wallet signer.
// Mock mode: deterministic tx hashes, ~1s delays per row. Same shape.

import { useCallback, useState } from 'react';
import { mintMaster, cloneSpecialist, getPendingNonce, isChainConfigured } from '../lib/chain.js';

// Mints master + the core-5. Optional 3 (voice / visual / negotiator) are
// surfaced as opt-in checkboxes elsewhere in onboarding and minted only on
// confirmation; they're not part of the always-on sequence.
const ROSTER = [
  { id: 'master',     who: 'master',     trainedOn: 'identity',                            isMaster: true  },
  { id: 'writer',     who: 'Writer',     trainedOn: 'tweets · captions · essays · DMs',    isMaster: false },
  { id: 'researcher', who: 'Researcher', trainedOn: 'archive · audience · performance',    isMaster: false },
  { id: 'editor',     who: 'Editor',     trainedOn: 'rejection_memory · style guide',      isMaster: false },
  { id: 'strategist', who: 'Strategist', trainedOn: 'performance · calendar · goals',      isMaster: false },
  { id: 'companion',  who: 'Companion',  trainedOn: 'relationships · journal · context',   isMaster: false },
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

    // Fetch the chain's current pending nonce ONCE before the loop, then
    // increment locally per tx. Bypasses Privy's wallet nonce manager
    // entirely — the chain queues sequentially-numbered txs and processes
    // them in order even when fired back-to-back.
    let nonce = null;
    if (isChainConfigured() && walletAddress) {
      try {
        nonce = await getPendingNonce(walletAddress);
        // eslint-disable-next-line no-console
        console.info(`[mint] starting nonce for ${walletAddress.slice(0, 8)}… = ${nonce}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[mint] couldn't read starting nonce — falling back to wallet auto: ${err.message}`);
      }
    }

    let masterTokenId = null;
    let i = 0;
    for (const r of ROSTER) {
      i += 1;
      // Mark this row submitting
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: 'submitting' } : x)));
      try {
        const txNonce = nonce != null ? nonce : undefined;
        const result = r.isMaster
          ? await mintMaster({
              to: walletAddress,
              encryptedURI: corpusUri ?? `0g://master/${twinName ?? '2in'}`,
              signer,
              nonce: txNonce,
            })
          : await cloneSpecialist({
              to: walletAddress,
              parentTokenId: masterTokenId ?? 42,
              encryptedURI: `0g://specialist/${r.id}`,
              signer,
              nonce: txNonce,
            });
        if (r.isMaster) masterTokenId = result.tokenId;
        if (nonce != null) nonce += 1;
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
      // Tiny gap between txs. In mock mode this paces the reveal animation;
      // in real mode it gives the RPC mempool a beat between submissions.
      await new Promise((r) => setTimeout(r, isChainConfigured() ? 400 : 250));
      void i;
    }
    setRunning(false);
    setDone(true);
  }, [running, twinName, walletAddress, signer, corpusUri]);

  return { rows, start, reset, running, done };
}
