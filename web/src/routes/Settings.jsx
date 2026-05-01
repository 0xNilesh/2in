// Settings — wallet · delegate · mode (JOURNEY §7).

import { PageHeader } from '../components/PageHeader.jsx';
import { user } from '../data/user.js';

export default function Settings() {
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
              <div className="v">{user.delegateWallet}</div>
              <span className={`toggle ${user.delegated ? 'on' : ''}`}></span>
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
