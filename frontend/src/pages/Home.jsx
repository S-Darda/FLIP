import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { homeFor, useAuth } from '../auth'
import { ThemeToggle } from '../components/AppShell'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { NetworkDemo } from '../components/NetworkViz'
import { CountUp } from '../components/ui'
import { pct } from '../format'
import { DEFAULT_DELTA, gaussianEpsilon } from '../privacy'

const NAV = [['features', 'Features'], ['how', 'How it works'], ['privacy', 'Privacy'], ['modes', 'Modes'], ['roadmap', 'Roadmap'], ['faq', 'FAQ']]
const WORDS = ['hospitals', 'banks', 'research labs', 'public agencies', 'universities']

const FEATURES = [
  { icon: 'shield', title: 'Raw rows stay on site', text: 'Site agents read data locally and send only model updates and aggregate statistics. Upload routes don’t exist.' },
  { icon: 'key', title: 'Signed site agents', text: 'Each site enrols with a one-time token and its own Ed25519 key. Every request is signed and replay-protected.' },
  { icon: 'lock', title: 'Accounted differential privacy', text: 'Client-level DP with a Rényi accountant and a study-wide ε budget that covers every run and AutoML trial.' },
  { icon: 'trophy', title: 'Federated AutoML', text: 'Bounded searches over model families and settings, chosen on validation data, never on the test split.' },
  { icon: 'file', title: 'Formatted PDF reports', text: 'Numbered figures, narrative text, discussion notes and reviewer comments, with a signed model artefact.' },
  { icon: 'logs', title: 'Governed and audited', text: 'Admin approval for studies and models, role-based access, two-factor sign-in and a searchable audit trail.' },
]

const STEPS = [
  { icon: 'nodes', title: 'Prepare', text: 'Every site splits its rows 70/15/15 locally and reports only per-feature counts, sums and sums of squares.', out: 'feature moments' },
  { icon: 'play', title: 'Train locally', text: 'Selected sites start from the global weights, run local SGD and send back a weight update, clipped under DP.', out: 'weight update' },
  { icon: 'model', title: 'Aggregate', text: 'The coordinator averages updates with FedAvg or FedProx, verifies clipping and adds calibrated noise.', out: 'new global model' },
  { icon: 'check', title: 'Evaluate', text: 'Sites score the new model on their own validation rows and return confusion counts and histograms only.', out: 'aggregate statistics' },
]

const MODES = [
  { title: 'Federated AutoML', tag: 'Federated learning', text: 'Several enrolled sites train locally; FLIP aggregates their updates under the study’s privacy policy.', icon: 'globe' },
  { title: 'Local AutoML', tag: 'Private local ML', text: 'One site trains on its own data. Useful, but never labelled federated, and DP isn’t offered.', icon: 'user' },
  { title: 'Simulation', tag: 'Demo only', text: 'Synthetic data with sites simulated on the server, for teaching and trying settings. Reports say so.', icon: 'live' },
]

const SECTORS = [
  { icon: 'shield', title: 'Healthcare', text: 'Readmission and early-warning models across hospitals without pooling patient records centrally.' },
  { icon: 'key', title: 'Finance', text: 'Shared fraud signals across banks while transactions stay in each bank’s own systems.' },
  { icon: 'globe', title: 'Research', text: 'Labs and universities build on each other’s data while datasets stay under local control.' },
  { icon: 'users', title: 'Public sector', text: 'Agencies learn from regional data that can’t legally be centralised.' },
]

const ROADMAP = [
  { phase: 'Phase 1', status: 'Done', title: 'Secure local MVP', items: ['Signed site agents, no raw uploads', 'Organisations, tenancy and admin MFA', 'Federated and Local AutoML', 'Signed artefacts and PDF reports'] },
  { phase: 'Phase 2', status: 'Next', title: 'Federated privacy', items: ['Secure aggregation (masked updates)', 'Subsampling-aware DP accountant', 'Disclosure controls by default', 'Membership-inference test harness'] },
  { phase: 'Phase 3', status: 'Later', title: 'Hardening and research', items: ['Robust aggregation against poisoned sites', 'Encrypted model registry, gated export', 'mTLS and tamper-evident audit', 'External security review'] },
]

const COMPARISON = [
  ['Raw data stays at each site', 'Yes', 'Yes'], ['Signed, enrolled site agents', 'Yes', 'Varies'],
  ['Role-based access and admin MFA', 'Yes', 'Limited'], ['Accounted DP with a study budget', 'Yes', 'Add-on'],
  ['No-code study builder and AutoML', 'Yes', 'No'], ['Live dashboards and PDF reports', 'Yes', 'Limited'],
]

const FAQS = [
  ['Does my raw data leave the site?', 'No. The agent reads data locally and sends feature moments, weight updates and aggregate metrics. Updates and models can still leak some information, which is why DP and (in Phase 2) secure aggregation matter.'],
  ['What does ε mean?', 'It bounds how much any one site can change the released models. Smaller is stronger. FLIP adds up ε across every run and trial of a study and refuses runs that would exceed its budget.'],
  ['Is this ready for patient data?', 'Not yet. FLIP is a research prototype: secure aggregation and an external security review are still to come. Use synthetic or public data.'],
  ['How is the best model chosen?', 'AutoML trials vary the model family, learning rate and local epochs. The winner is picked on validation data; the test split is used once, for the report.'],
  ['What do I get after training?', 'A live report page, a formatted PDF with figures and comments, and a signed, versioned model artefact you can verify.'],
]

const STACK = ['FastAPI', 'React', 'FedAvg', 'FedProx', 'Rényi DP', 'Ed25519', 'TOTP 2FA', 'WebSockets', 'AutoML', 'ReportLab PDF', 'SQLAlchemy', 'numpy']

/** Fades children in the first time they scroll into view. */
function Reveal({ children, as: Tag = 'div', delay = 0, className = '', ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>
}

const spotlight = e => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

function useActiveSection(ids) {
  const [active, setActive] = useState(null)
  useEffect(() => {
    const els = ids.map(id => document.getElementById(id)).filter(Boolean)
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setActive(vis[0].target.id)
    }, { rootMargin: '-45% 0px -50% 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [ids.join()])
  return active
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Site search over sections, features, FAQs and pages. Press "/" to focus. */
function SiteSearch({ onFaq }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useRef(null)
  const input = useRef(null)
  const index = useMemo(() => [
    ...NAV.map(([id, label]) => ({ group: 'Sections', title: label, icon: 'chevron', go: () => scrollTo(id) })),
    ...FEATURES.map(f => ({ group: 'Features', title: f.title, text: f.text, icon: f.icon, go: () => scrollTo('features') })),
    ...MODES.map(m => ({ group: 'Modes', title: m.title, text: m.text, icon: m.icon, go: () => scrollTo('modes') })),
    ...FAQS.map(([qq, a], i) => ({ group: 'FAQ', title: qq, text: a, icon: 'info', go: () => { onFaq(i); scrollTo('faq') } })),
    { group: 'Pages', title: 'Sign in', icon: 'key', go: () => navigate('/signin') },
    { group: 'Pages', title: 'Create a developer account', icon: 'user', go: () => navigate('/signup') },
    { group: 'Pages', title: 'Admin console', icon: 'shield', go: () => navigate('/admin/signin') },
  ], [navigate, onFaq])
  const term = q.trim().toLowerCase()
  const results = term ? index.filter(i => `${i.title} ${i.text || ''}`.toLowerCase().includes(term)).slice(0, 8) : []

  useEffect(() => {
    const key = e => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus() }
    }
    const away = e => ref.current && !ref.current.contains(e.target) && setOpen(false)
    window.addEventListener('keydown', key)
    document.addEventListener('mousedown', away)
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', away) }
  }, [])
  useEffect(() => setSel(0), [q])

  const pick = r => { r.go(); setQ(''); setOpen(false); input.current?.blur() }
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[sel]) pick(results[sel])
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
  }

  let lastGroup = null
  return (
    <div className="lp-search" ref={ref}>
      <Icon name="search" size={15} />
      <input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
             placeholder="Search FLIP…" aria-label="Search the site" role="combobox" aria-expanded={open && !!term} aria-controls="lp-search-list" />
      <kbd>/</kbd>
      {open && term && (
        <div className="lp-search-menu" id="lp-search-list" role="listbox">
          {results.length === 0 && <div className="dropdown-empty">Nothing matches “{q}”.</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup
            lastGroup = r.group
            return (
              <div key={`${r.group}-${r.title}`}>
                {head && <div className="palette-group">{r.group}</div>}
                <button role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(r)}>
                  <Icon name={r.icon} size={15} /><span>{r.title}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NavBar({ user, onFaq }) {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const active = useActiveSection(NAV.map(([id]) => id))
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const go = id => e => { e.preventDefault(); setMenu(false); scrollTo(id) }
  return (
    <header className={`lp-nav ${scrolled ? 'scrolled' : ''} ${menu ? 'open' : ''}`}>
      <div className="lp-nav-inner">
        <Logo />
        <nav className="lp-links" aria-label="Sections">
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)} className={active === id ? 'active' : ''}>{label}</a>)}
        </nav>
        <SiteSearch onFaq={onFaq} />
        <ThemeToggle />
        {user
          ? <Link className="btn btn-primary btn-sm lp-nav-cta" to={homeFor(user)}>Dashboard <Icon name="chevron" size={13} /></Link>
          : <>
            <Link className="btn btn-ghost btn-sm lp-signin" to="/signin">Sign in</Link>
            <Link className="btn btn-primary btn-sm lp-nav-cta" to="/signup">Get started</Link>
          </>}
        <button className="icon-btn lp-burger" onClick={() => setMenu(m => !m)} aria-label="Menu" aria-expanded={menu}><Icon name={menu ? 'x' : 'menu'} /></button>
      </div>
      {menu && (
        <nav className="lp-mobile" aria-label="Sections">
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
          {!user && <Link to="/signin">Sign in</Link>}
        </nav>
      )}
    </header>
  )
}

function RotatingWord() {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % WORDS.length), 2200); return () => clearInterval(t) }, [])
  return <span className="lp-rotate" aria-live="polite"><span key={i}>{WORDS[i]}</span></span>
}

function HowItWorks() {
  const [step, setStep] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return undefined
    const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 3200)
    return () => clearInterval(t)
  }, [auto])
  const s = STEPS[step]
  return (
    <div className="lp-how">
      <ol className="lp-steps">
        {STEPS.map((x, i) => (
          <li key={x.title}>
            <button className={i === step ? 'on' : ''} onClick={() => { setStep(i); setAuto(false) }}>
              <span className="lp-step-n">{i + 1}</span>
              <span><strong>{x.title}</strong><small>{x.text}</small></span>
              {i === step && auto && <span className="lp-step-bar" key={`bar-${step}`} />}
            </button>
          </li>
        ))}
      </ol>
      <div className="lp-how-visual" aria-hidden="true">
        <div className="lp-flow">
          {['Site A', 'Site B', 'Site C'].map((n, i) => (
            <div key={n} className="lp-flow-site" style={{ '--i': i }}>
              <Icon name="lock" size={13} /> {n}
              <span className={`lp-packet ${step === 2 ? 'down' : 'up'}`} key={`${step}-${i}`} />
            </div>
          ))}
          <div className="lp-flow-hub"><Icon name={s.icon} size={22} /><strong>{s.title}</strong><small>moves: {s.out}</small></div>
        </div>
        <p className="lp-how-note"><Icon name="shield" size={13} /> In every step, raw rows stay inside the sites.</p>
      </div>
    </div>
  )
}

function PrivacyCalculator() {
  const [z, setZ] = useState(1.0)
  const [rounds, setRounds] = useState(25)
  const eps = gaussianEpsilon(z, rounds)
  const level = eps == null ? 'none' : eps <= 3 ? 'strong' : eps <= 10 ? 'moderate' : 'weak'
  return (
    <div className="lp-calc">
      <h3>Try the privacy budget</h3>
      <p className="muted small">The same Rényi-DP accountant the platform uses, at δ = {DEFAULT_DELTA.toExponential(0)}.</p>
      <label>Noise multiplier <b>{z.toFixed(1)}</b>
        <input type="range" min="0.3" max="6" step="0.1" value={z} onChange={e => setZ(Number(e.target.value))} />
      </label>
      <label>Training rounds <b>{rounds}</b>
        <input type="range" min="1" max="100" step="1" value={rounds} onChange={e => setRounds(Number(e.target.value))} />
      </label>
      <div className={`lp-eps ${level}`}>
        <span>ε =</span><strong>{eps == null ? '∞' : eps.toFixed(2)}</strong>
        <em>{level === 'strong' ? 'strong protection' : level === 'moderate' ? 'moderate protection' : level === 'weak' ? 'weak guarantee' : 'no guarantee'}</em>
      </div>
      <div className="lp-eps-bar"><span style={{ width: `${Math.min(100, ((eps ?? 100) / 60) * 100)}%` }} /></div>
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [faqOpen, setFaqOpen] = useState(0)
  const [progress, setProgress] = useState(0)
  useEffect(() => { api('/api/public/stats').then(setStats).catch(() => {}) }, [])
  useEffect(() => {
    const on = () => {
      const h = document.documentElement
      setProgress(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight))
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const start = user ? homeFor(user) : '/signup'
  const year = new Date().getFullYear()
  const apiDocs = `${location.protocol}//${location.hostname}:8000/docs`

  return (
    <div className="lp">
      <div className="lp-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <NavBar user={user} onFaq={setFaqOpen} />

      <section className="lp-hero" id="top">
        <div className="lp-mesh" aria-hidden="true"><span /><span /><span /></div>
        <div className="lp-hero-grid">
          <div>
            <span className="lp-pill"><b>Phase 1</b> Site agents · Federated AutoML · PDF reports <Icon name="chevron" size={12} /></span>
            <h1>Train one model across <RotatingWord /> <span className="lp-grad">without moving the data.</span></h1>
            <p className="lp-lead">FLIP is a security-first federated AutoML platform. Each site trains on its own records; only model updates and
              aggregate statistics reach the coordinator, with privacy budgets, signed agents and full audit around every step.</p>
            <div className="lp-actions">
              <Link className="btn btn-primary btn-lg" to={start}>{user ? 'Open dashboard' : 'Start a study'} <Icon name="chevron" size={15} /></Link>
              <a className="btn btn-lg" href="#how" onClick={e => { e.preventDefault(); scrollTo('how') }}><Icon name="play" size={14} /> See how a round works</a>
            </div>
            <ul className="lp-trust">
              <li><Icon name="check" size={13} /> No raw uploads</li>
              <li><Icon name="check" size={13} /> Client-level DP</li>
              <li><Icon name="check" size={13} /> Signed artefacts</li>
            </ul>
          </div>
          <div className="lp-hero-card">
            <div className="lp-card-head"><span className="live-pill">Live simulation</span><span>6 institutions · FedAvg</span></div>
            <NetworkDemo />
            <div className="lp-float a"><Icon name="lock" size={13} /> rows stay local</div>
            <div className="lp-float b"><Icon name="shield" size={13} /> ε accounted</div>
            <div className="lp-float c"><Icon name="key" size={13} /> Ed25519 signed</div>
          </div>
        </div>
      </section>

      <div className="lp-marquee" aria-hidden="true">
        <div>{[...STACK, ...STACK].map((s, i) => <span key={i}>{s}</span>)}</div>
      </div>

      <section className="lp-stats">
        {[[stats?.sites, 'sites online'], [stats?.training_runs, 'federated runs'], [stats?.node_updates, 'site updates aggregated'],
          [stats?.best_accuracy != null ? pct(stats.best_accuracy) : null, 'best model accuracy']].map(([v, label], i) => (
          <Reveal key={label} className="lp-stat" delay={i * 80}>
            <b>{v == null ? '—' : <CountUp value={typeof v === 'number' ? v.toLocaleString() : v} duration={1400} />}</b>
            <span>{label}</span>
          </Reveal>
        ))}
      </section>

      <section id="features" className="lp-section">
        <Reveal className="lp-head"><span className="lp-eyebrow">Platform</span><h2>Everything a privacy-first federation needs</h2>
          <p>From enrolling a hospital’s agent to signing the final model, for admins and model developers alike.</p></Reveal>
        <div className="lp-grid-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} className="lp-card" delay={(i % 3) * 90} onMouseMove={spotlight}>
              <span className="lp-icon"><Icon name={f.icon} size={20} /></span>
              <h3>{f.title}</h3><p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className="lp-section lp-band">
        <Reveal className="lp-head"><span className="lp-eyebrow">How it works</span><h2>One federated round, step by step</h2>
          <p>Click a step, or let it play. This loop repeats for every round of training.</p></Reveal>
        <Reveal><HowItWorks /></Reveal>
      </section>

      <section id="privacy" className="lp-section">
        <Reveal className="lp-head"><span className="lp-eyebrow">Privacy by design</span><h2>Clear about what moves, and what never does</h2>
          <p>Federated learning keeps rows local, but updates and models still carry information. FLIP is explicit about both.</p></Reveal>
        <div className="lp-privacy">
          <Reveal className="lp-card lp-moves">
            <h3><Icon name="x" size={16} /> Never leaves a site</h3>
            <ul><li>Raw rows and identifiers</li><li>Per-row predictions or scores</li><li>Rare category values (fewer than 5)</li><li>The site’s private signing key</li></ul>
            <h3 className="ok"><Icon name="check" size={16} /> What does move</h3>
            <ul><li>Column names, types and row counts</li><li>Per-feature counts, sums and sums of squares</li><li>Weight updates, clipped under DP</li><li>Confusion counts and score histograms</li></ul>
          </Reveal>
          <Reveal className="lp-card" delay={100}><PrivacyCalculator /></Reveal>
        </div>
      </section>

      <section id="modes" className="lp-section lp-band">
        <Reveal className="lp-head"><span className="lp-eyebrow">Training modes</span><h2>Honest labels for every kind of run</h2>
          <p>A one-site run is never called federated, and a simulation never pretends to be real.</p></Reveal>
        <div className="lp-grid-3">
          {MODES.map((m, i) => (
            <Reveal key={m.title} className="lp-card lp-mode" delay={i * 90} onMouseMove={spotlight}>
              <span className="lp-icon"><Icon name={m.icon} size={20} /></span>
              <span className="lp-tag">{m.tag}</span>
              <h3>{m.title}</h3><p>{m.text}</p>
            </Reveal>
          ))}
        </div>
        <div className="lp-grid-4" style={{ marginTop: '2.5rem' }}>
          {SECTORS.map((s, i) => (
            <Reveal key={s.title} className="lp-sector" delay={i * 70}>
              <Icon name={s.icon} size={18} /><strong>{s.title}</strong><p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="roadmap" className="lp-section">
        <Reveal className="lp-head"><span className="lp-eyebrow">Roadmap</span><h2>Built in phases, with a go/no-go gate</h2>
          <p>No sensitive real-world data until threat modelling, privacy accounting and an external review are complete.</p></Reveal>
        <div className="lp-timeline">
          {ROADMAP.map((r, i) => (
            <Reveal key={r.phase} className={`lp-phase ${r.status.toLowerCase()}`} delay={i * 120}>
              <div className="lp-phase-dot">{r.status === 'Done' ? <Icon name="check" size={14} /> : i + 1}</div>
              <span className="lp-tag">{r.phase} · {r.status}</span>
              <h3>{r.title}</h3>
              <ul>{r.items.map(x => <li key={x}>{x}</li>)}</ul>
            </Reveal>
          ))}
        </div>
        <Reveal className="lp-compare card flush">
          <table className="table">
            <thead><tr><th>Capability</th><th>FLIP</th><th>Typical FL frameworks</th></tr></thead>
            <tbody>{COMPARISON.map(r => <tr key={r[0]}><td>{r[0]}</td><td><strong className="grad-text">{r[1]}</strong></td><td className="muted">{r[2]}</td></tr>)}</tbody>
          </table>
        </Reveal>
      </section>

      <section id="faq" className="lp-section lp-band">
        <Reveal className="lp-head"><span className="lp-eyebrow">FAQ</span><h2>Questions people ask first</h2></Reveal>
        <div className="lp-faq">
          {FAQS.map(([q, a], i) => (
            <Reveal key={q} delay={i * 50} className={`lp-faq-item ${faqOpen === i ? 'open' : ''}`}>
              <button onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} aria-expanded={faqOpen === i}>
                <span>{q}</span><Icon name="plus" size={16} />
              </button>
              <div className="lp-faq-a"><p>{a}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <Reveal>
          <h2>Ready to train together?</h2>
          <p>Design a study in minutes. Your sites keep their data; you get a signed model and a report you can share.</p>
          <div className="lp-actions" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary btn-lg" to={start}>{user ? 'Open dashboard' : 'Create a developer account'}</Link>
            <Link className="btn btn-lg lp-ghost-light" to="/admin/signin">Admin console</Link>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Logo />
            <p>Federated Learning Infrastructure Platform: privacy-preserving, no-code machine learning for distributed data owners.</p>
            <span className="lp-status"><span className="dot" /> Research prototype · Phase 1</span>
          </div>
          <div>
            <h4>Product</h4>
            {[['features', 'Features'], ['how', 'How it works'], ['privacy', 'Privacy'], ['modes', 'Training modes'], ['roadmap', 'Roadmap']].map(([id, l]) =>
              <a key={id} href={`#${id}`} onClick={e => { e.preventDefault(); scrollTo(id) }}>{l}</a>)}
          </div>
          <div>
            <h4>Platform</h4>
            <Link to="/signin">Developer sign-in</Link>
            <Link to="/signup">Create an account</Link>
            <Link to="/admin/signin">Admin console</Link>
            <a href={apiDocs} target="_blank" rel="noreferrer">API reference</a>
          </div>
          <div>
            <h4>Trust</h4>
            <a href="#privacy" onClick={e => { e.preventDefault(); scrollTo('privacy') }}>What leaves a site</a>
            <a href="#faq" onClick={e => { e.preventDefault(); setFaqOpen(2); scrollTo('faq') }}>Is it ready for real data?</a>
            <a href="/api/artefacts/public-key" target="_blank" rel="noreferrer">Artefact signing key</a>
            <a href="#roadmap" onClick={e => { e.preventDefault(); scrollTo('roadmap') }}>Security roadmap</a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {year} FLIP · Not for real personal or sensitive data</span>
          <span className="lp-footer-actions">
            <ThemeToggle />
            <button className="btn btn-sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><Icon name="chevron" size={13} className="rot-up" /> Back to top</button>
          </span>
        </div>
      </footer>
    </div>
  )
}
