// Settings — wallet · delegate · mode (JOURNEY §7).

import { useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusPill } from '../components/StatusPill.jsx';
import { user } from '../data/user.js';
import { useViemWalletClient } from '../lib/privy-signer.js';
import { isChainConfigured, chainConfig, getExplorerTxUrl } from '../lib/chain.js';
import { TWIN_INFT_ABI } from '../lib/abi/twin-nft.js';
import { chainApi } from '../lib/api.js';

const MASTER_TOKEN_ID = 42n; // demo master twin tokenId
const ORCHESTRATOR_DELEGATE = '0x91ab2f7d000000000000000000000000000002f7d1'; // 40-char placeholder

function useDelegateAuth() {
  const { walletClient, address } = useViemWalletClient();
  const [status, setStatus] = useState('idle'); // idle · submitting · confirmed · failed
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const authorize = async () => {
    setStatus('submitting');
    setError(null);
    setTxHash(null);
    try {
      let hash;
      if (walletClient && isChainConfigured()) {
        // Real path: user signs delegateAccess(masterTokenId, orchestrator).
        hash = await walletClient.writeContract({
          address: chainConfig.contractAddress,
          abi: TWIN_INFT_ABI,
          functionName: 'delegateAccess',
          args: [MASTER_TOKEN_ID, ORCHESTRATOR_DELEGATE],
        });
      }
      // Echo to server for telemetry — also covers the mock path entirely.
      const res = await chainApi.delegate(Number(MASTER_TOKEN_ID), ORCHESTRATOR_DELEGATE, hash);
      setTxHash(res.txHash);
      setStatus('confirmed');
    } catch (err) {
      setError(err.message ?? 'delegate_failed');
      setStatus('failed');
    }
  };

  return { status, txHash, error, authorize, address };
}

export default function Settings() {
  const delegate = useDelegateAuth();
  return (
    <>
      <PageHeader title="Settings" sub="Wallet · delegate · runtime mode" />
      <div className="scroll">
        <div className="page page-narrow">
          <div className="label-mono" style={{ marginBottom: 10 }}>Wallet</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Cold wallet
                <span className="s">Owns every iNFT in your roster</span>
              </div>
              <div className="v">{user.fullAddress}</div>
              <button className="btn">Disconnect</button>
            </div>
            <div className="settings-row">
              <div className="k">
                Handle
                <span className="s">Resolved from ENS · falls back to short address</span>
              </div>
              <div className="v">{user.handle}</div>
              <button className="btn">Edit</button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Delegate</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Orchestrator hot wallet
                <span className="s">delegateAccess(...) lets the team run 24/7 without you signing each tick</span>
              </div>
              <div className="v" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{ORCHESTRATOR_DELEGATE.slice(0, 6)}…{ORCHESTRATOR_DELEGATE.slice(-4)}</span>
                {delegate.txHash ? (
                  <a
                    href={getExplorerTxUrl(delegate.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--peach)', fontSize: 10.5 }}
                  >
                    {delegate.txHash.slice(0, 8)}…{delegate.txHash.slice(-4)} ↗
                  </a>
                ) : null}
                {delegate.error ? (
                  <span style={{ color: 'var(--red)', fontSize: 11 }}>{delegate.error}</span>
                ) : null}
              </div>
              {delegate.status === 'confirmed' ? (
                <StatusPill color="mint">authorized</StatusPill>
              ) : delegate.status === 'submitting' ? (
                <StatusPill color="amber">signing…</StatusPill>
              ) : delegate.status === 'failed' ? (
                <button className="btn" onClick={delegate.authorize}>Retry</button>
              ) : (
                <button className="btn btn-peach" onClick={delegate.authorize}>
                  Authorize orchestrator
                </button>
              )}
            </div>
            <div className="settings-row">
              <div className="k">
                Auto-snapshot threshold
                <span className="s">Memory delta that triggers updateMetadata on chain</span>
              </div>
              <div className="v">3 entries · 24h</div>
              <button className="btn">Adjust</button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Runtime mode</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Private mode
                <span className="s">Routes every Compute call through TeeML providers + verifies signatures</span>
              </div>
              <div className="v">off</div>
              <span className={`toggle${user.privateMode ? ' on' : ''}`}></span>
            </div>
            <div className="settings-row">
              <div className="k">
                Default chain
                <span className="s">Galileo testnet · 16602</span>
              </div>
              <div className="v">galileo</div>
              <button className="btn">Switch</button>
            </div>
          </div>

          <div className="label-mono" style={{ margin: '24px 0 10px' }}>Connected sources</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="settings-row">
              <div className="k">
                Twitter / X
                <span className="s">Quill ingests tweets read-only · never publishes</span>
              </div>
              <div className="v">@nilesh</div>
              <button className="btn">Revoke</button>
            </div>
            <div className="settings-row">
              <div className="k">
                Spotify · podcast feed
                <span className="s">Cadence ingests transcripts via Whisper</span>
              </div>
              <div className="v">24 episodes</div>
              <button className="btn">Revoke</button>
            </div>
            <div className="settings-row">
              <div className="k">
                Contracts · PDF
                <span className="s">Mantle ingests for clause review</span>
              </div>
              <div className="v">14 docs</div>
              <button className="btn">Manage</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
