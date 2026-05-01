// Marketing landing page — full-screen, no shell.
// Pitches the personal digital twin: trained on you, swarm of subagents, on-chain.

import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../lib/routes.js';
import { useAuth } from '../hooks/useAuth.js';

export default function Landing() {
  const { ready, authenticated, address, login, logout } = useAuth();
  const nav = useNavigate();

  const enter = () => {
    if (authenticated) nav(ROUTES.chat);
    else login();
  };

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">2<em>in</em></div>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#team">Specialists</a>
          <a href="#memory">Memory core</a>
          <a href="#chain">On-chain</a>
        </div>
        <div className="nav-cta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ready && authenticated ? (
            <>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: 'var(--text-mute)' }}>
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'connected'}
              </span>
              <Link to={ROUTES.chat} className="btn-cta">Open app →</Link>
              <button className="btn-secondary" onClick={logout}>Log out</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={login}>Log in</button>
              <Link to={ROUTES.onboarding} className="btn-cta">Mint your twin →</Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div>
          <div className="hero-eyebrow">your digital twin · on-chain · forever</div>
          <h1 className="hero-title">
            A digital twin you <em>actually own</em>.
          </h1>
          <p className="hero-sub">
            Specialists trained on your voice. Memory that grows with every post,
            every rejection, every shipped tweet. All anchored on 0G — your twin
            outlives any vendor.
          </p>
          <div className="hero-actions">
            <button className="btn-cta" onClick={enter}>
              {authenticated ? 'Open app →' : 'Mint your twin →'}
            </button>
            <Link to={ROUTES.chat} className="btn-secondary">See it live</Link>
          </div>
          <div className="hero-trust">
            <span className="chip-trust peach">ERC-7857 iNFT</span>
            <span className="chip-trust">0G Storage</span>
            <span className="chip-trust violet">0G Compute</span>
          </div>
        </div>

        <div className="hero-visual">
          <svg className="hero-orbit-svg" viewBox="0 0 400 400" aria-hidden="true">
            {/* outer ring backdrop */}
            <circle cx="200" cy="200" r="190" fill="none"
              stroke="rgba(255,138,91,0.20)" strokeWidth="1" strokeDasharray="3 6" />
            {/* outer rotating arc — clearly visible because it's a single bright sweep */}
            <g className="orbit-arc cw">
              <circle cx="200" cy="200" r="190" fill="none"
                stroke="rgba(255,138,91,0.95)" strokeWidth="2"
                strokeDasharray="80 1115" strokeLinecap="round" />
            </g>
            {/* inner ring backdrop */}
            <circle cx="200" cy="200" r="130" fill="none"
              stroke="rgba(94,234,212,0.15)" strokeWidth="1" strokeDasharray="2 5" />
            {/* inner rotating arc — counter direction, mint colour */}
            <g className="orbit-arc ccw">
              <circle cx="200" cy="200" r="130" fill="none"
                stroke="rgba(94,234,212,0.85)" strokeWidth="1.5"
                strokeDasharray="50 766" strokeLinecap="round" />
            </g>
          </svg>

          <div className="hero-line v l1"></div>
          <div className="hero-line h l2"></div>
          <div className="hero-line v l3"></div>
          <div className="hero-line h l4"></div>

          <div className="hero-twin">2<em>in</em></div>
          <div className="hero-spec s1">W<span className="role-mini">Writer</span></div>
          <div className="hero-spec s2">R<span className="role-mini">Researcher</span></div>
          <div className="hero-spec s3">E<span className="role-mini">Editor</span></div>
          <div className="hero-spec s4">C<span className="role-mini">Companion</span></div>
        </div>
      </section>

      <section id="how" className="section-band">
        <div className="section-eyebrow">How it works</div>
        <h2 className="section-title">Four steps. Two minutes. Then it runs.</h2>
        <p className="section-sub">
          We pull your existing posts, fine-tune a roster of specialists on your voice,
          and mint each one as its own iNFT under your wallet. After that you just talk
          to your twin like a coworker.
        </p>

        <div className="steps-row">
          <div className="step-card">
            <div className="step-num">01</div>
            <div className="step-title">Connect</div>
            <div className="step-text">Wallet + your handle on X / Spotify / RSS. Read-only.</div>
          </div>
          <div className="step-card">
            <div className="step-num">02</div>
            <div className="step-title">Seed memory</div>
            <div className="step-text">We pull your tweets, podcasts, essays — encode into typed memory.</div>
          </div>
          <div className="step-card">
            <div className="step-num">03</div>
            <div className="step-title">Mint your roster</div>
            <div className="step-text">Master twin + 5 core specialists, each its own iNFT under your wallet.</div>
          </div>
          <div className="step-card">
            <div className="step-num">04</div>
            <div className="step-title">Talk + grow</div>
            <div className="step-text">Every chat reads + writes memory. The twin sharpens with every approval.</div>
          </div>
        </div>
      </section>

      <section id="team" className="section-band">
        <div className="section-eyebrow">Your roster</div>
        <h2 className="section-title">Specialists, not chatbots.</h2>
        <p className="section-sub">
          Each one is fine-tuned on a different slice of your work. They literally
          speak in your voice for their specialty — not just prompts to.
        </p>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">W</div>
            <div className="feature-title">Writer</div>
            <div className="feature-text">Drafts everything in your voice — posts, replies, captions, emails. Most-used specialist.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">R</div>
            <div className="feature-title">Researcher</div>
            <div className="feature-text">Pulls facts, performance signals, audience overlap. Called by every other specialist for context.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">E</div>
            <div className="feature-title">Editor</div>
            <div className="feature-text">Final pass. Gates against what you killed before; checks tone + brand consistency.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">S</div>
            <div className="feature-title">Strategist</div>
            <div className="feature-text">"Should I post this now?" · weekly themes · content cadence · goal tracking.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">C</div>
            <div className="feature-title">Companion</div>
            <div className="feature-text">Personal memory keeper. "Remember this", "who is this person", reflections.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">+</div>
            <div className="feature-title">Optional add-ons</div>
            <div className="feature-text">Voice (podcast/video script), Visual (image gen + analysis), Negotiator (sponsor replies). Opt in based on what you actually do.</div>
          </div>
        </div>
      </section>

      <section id="memory" className="section-band">
        <div className="section-eyebrow">Memory architecture</div>
        <h2 className="section-title">Six typed slices. Five primitives. One memory core.</h2>
        <p className="section-sub">
          Memory is what your AI has lived — interactions, decisions, performance.
          Every specialist reads its assigned types before drafting, writes back after.
          Reinforcement promotes entries to <em>stable</em>; the corpus self-consolidates.
          Snapshot every threshold writes <em>updateMetadata</em> to your iNFT on-chain.
        </p>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">◐</div>
            <div className="feature-title">Episodic</div>
            <div className="feature-text">Events that happened. Every shipped post, every conversation. Researcher + Strategist read it daily.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">◊</div>
            <div className="feature-title">Semantic</div>
            <div className="feature-text">Stable facts about you. "Tone=terse", "host a podcast", "avoid hashtags". Read by every specialist.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">◇</div>
            <div className="feature-title">Relationship</div>
            <div className="feature-text">People in your life — collaborators, sponsors. Companion + Negotiator's working set.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">⌒</div>
            <div className="feature-title">Temporal</div>
            <div className="feature-text">Time-anchored patterns. "Mornings outperform 3×". Sweep periodically; the truth changes.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">⌬</div>
            <div className="feature-title">Procedural</div>
            <div className="feature-text">How-to rules. "No superlatives this month". "#ad on every sponsor post". Editor's gate.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">○</div>
            <div className="feature-title">Working</div>
            <div className="feature-text">In-flight scratch — current task only. Cleared on completion. Never persisted, never anchored.</div>
          </div>
        </div>
      </section>

      <section id="chain" className="section-band">
        <div className="section-eyebrow">on-chain · ERC-7857</div>
        <h2 className="section-title">Your twin is yours. Forever.</h2>
        <p className="section-sub">
          Every specialist is its own iNFT minted under your wallet. The memory core
          lives on 0G Storage; every snapshot writes a Merkle manifest hash to your
          iNFT via <code style={{ color: 'var(--peach)' }}>updateMetadata</code>.
          Transfer the token, the memory pointer transfers with it. We shut down,
          your twin still works.
        </p>
        <p className="section-sub" style={{ marginTop: 8 }}>
          That's the difference from Personal.ai, Delphi, Replika: their memory
          lives in their cloud. Yours lives in your wallet.
        </p>
      </section>

      <footer className="landing-foot">
        <div>2<em style={{ color: 'var(--peach)', fontStyle: 'italic' }}>in</em> · built on 0G</div>
        <div className="right">
          <a href="#">Docs</a>
          <a href="#">Github</a>
          <a href="#">Demo</a>
        </div>
      </footer>
    </div>
  );
}
