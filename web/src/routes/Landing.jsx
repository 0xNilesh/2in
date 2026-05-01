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
          <a href="#team">Your team</a>
          <a href="#memory">Memory</a>
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
          <div className="hero-eyebrow">your digital twin · on 0G</div>
          <h1 className="hero-title">
            A swarm that thinks <em>like you</em>. Working for you 24/7.
          </h1>
          <p className="hero-sub">
            We learn your voice from your social media, mint a roster of specialist
            agents, and let them collaborate on your tasks while you sleep. Each
            specialist is its own iNFT — yours forever.
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
          <div className="hero-spec s1">Q<span className="role-mini">Writer</span></div>
          <div className="hero-spec s2">C<span className="role-mini">Voice</span></div>
          <div className="hero-spec s3">M<span className="role-mini">Editor</span></div>
          <div className="hero-spec s4">M<span className="role-mini">Legal</span></div>
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
            <div className="step-title">Ingest</div>
            <div className="step-text">We pull your tweets, podcasts, essays. Build your persona.</div>
          </div>
          <div className="step-card">
            <div className="step-num">03</div>
            <div className="step-title">Name your twin</div>
            <div className="step-text">Pick what to call your director. It's the one you'll talk to.</div>
          </div>
          <div className="step-card">
            <div className="step-num">04</div>
            <div className="step-title">Land in chat</div>
            <div className="step-text">Type a task. Watch the team huddle. Approve. Ship.</div>
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
            <div className="feature-icon">Q</div>
            <div className="feature-title">Quill · Writer</div>
            <div className="feature-text">Your tweets, captions, essays. Drafts in your voice — terse where you're terse, rhythmic where you're rhythmic.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">C</div>
            <div className="feature-title">Cadence · Voice</div>
            <div className="feature-text">Your podcast and video transcripts. Drafts spoken-style content with your pace and pauses.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">M</div>
            <div className="feature-title">Mantle · Legal</div>
            <div className="feature-text">Your contracts and brand guidelines. Reviews drafts pre-publish, flags risk before it ships.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">M</div>
            <div className="feature-title">Mark · Editor</div>
            <div className="feature-text">Your rejection history — what you killed and why. The final critique pass before anything goes out.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">S</div>
            <div className="feature-title">Scout · Researcher</div>
            <div className="feature-text">Your archive + audience analytics. Surfaces what worked, what to revisit, what's drifting.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">+</div>
            <div className="feature-title">Train your own</div>
            <div className="feature-text">Drop in any corpus, pick a role, mint a new specialist. They join your team instantly.</div>
          </div>
        </div>
      </section>

      <section id="memory" className="section-band">
        <div className="section-eyebrow">Memory that evolves</div>
        <h2 className="section-title">It gets easier to use, not just smarter.</h2>
        <p className="section-sub">
          Every override you make, every rejection, every new performance metric writes
          to typed memory slices. By job 5 the team asks 0 clarifying questions and ships.
        </p>

        <div className="feature-grid">
          <div className="feature">
            <div className="feature-icon">⌬</div>
            <div className="feature-title">Voice memory</div>
            <div className="feature-text">Every shipped post grows the corpus your specialists train against.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">◐</div>
            <div className="feature-title">Preference memory</div>
            <div className="feature-text">"Avoid superlatives this month." "Never on Sundays." Learned from you, kept forever.</div>
          </div>
          <div className="feature">
            <div className="feature-icon">⊘</div>
            <div className="feature-title">Rejection memory</div>
            <div className="feature-text">What you killed and why. Mark gates every draft against it.</div>
          </div>
        </div>
      </section>

      <section id="chain" className="section-band">
        <div className="section-eyebrow">on-chain · ERC-7857</div>
        <h2 className="section-title">Your twin is yours.</h2>
        <p className="section-sub">
          Every specialist is its own iNFT minted under your wallet. Encrypted intelligence
          (system prompt + LoRA adapter + memory slices) lives on 0G Storage. Transfer them,
          delegate them, retire them — they answer to your wallet, not us.
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
