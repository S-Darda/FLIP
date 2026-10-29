import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { homeFor, useAuth } from '../auth'
import { ThemeToggle } from '../components/AppShell'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { NetworkDemo } from '../components/NetworkViz'
import { Aurora, CountUp } from '../components/ui'
import { pct } from '../format'

const FEATURES = [
  { icon: 'shield', title: 'Local training by design', text: 'In federated mode each site trains on its own records and sends model updates, not rows. Updates and models can still leak information, so they get their own protections.' },
  { icon: 'nodes', title: 'FedAvg and FedProx', text: 'Sample-weighted averaging or a proximal term for uneven, non-IID data across institutions.' },
  { icon: 'lock', title: 'Differential privacy', text: 'Clip each site’s update and add calibrated noise. A Rényi-DP accountant reports the client-level (ε, δ) actually spent.' },
  { icon: 'live', title: 'Live round-by-round', text: 'Watch the federation train: updates fly in, the global model improves, every node reports back.' },
  { icon: 'trophy', title: 'Compare and rank', text: 'A leaderboard of every run, and side-by-side curves to see exactly which settings win.' },
  { icon: 'logs', title: 'Governed and audited', text: 'Admin approval for projects and models, role-based access, and a searchable audit trail.' },
]

const STEPS = ['Create a project', 'Get it approved', 'Start federated training', 'Watch it live', 'Ship the model']

const SECTORS = [
  { icon: 'shield', title: 'Healthcare', text: 'Hospitals collaborate on readmission and early-warning models without pooling patient records in one central dataset.' },
  { icon: 'key', title: 'Finance', text: 'Banks learn shared fraud signals while customer transactions stay in each bank’s own systems.' },
  { icon: 'globe', title: 'Research', text: 'Labs and universities accelerate shared model development while datasets stay under local control.' },
]

const COMPARISON = [
  ['Privacy-preserving learning', 'Yes', 'Yes'],
  ['Role-based access control', 'Yes', 'Limited'],
  ['Real-time updates', 'Yes', 'No'],
  ['Graphical management interface', 'Yes', 'Limited'],
  ['Hardware-agnostic', 'Yes', 'NVIDIA-focused'],
]

/** Fades children in the first time they scroll into view. */
function Reveal({ children, as: Tag = 'div', delay = 0, className = '', ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return undefined }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>{children}</Tag>
}

/** Moves a soft spotlight to follow the cursor inside a card. */
const spotlight = e => {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

export default function Home() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  useEffect(() => { api('/api/public/stats').then(setStats).catch(() => {}) }, [])
  const start = user ? homeFor(user) : '/signup'

  return (
    <div className="home">
      <Aurora />
      <header className="home-nav">
        <Logo />
        <nav>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#sectors">Who it's for</a>
          <Link to="/admin/signin">Admin</Link>
        </nav>
        <ThemeToggle />
        {user
          ? <Link className="btn btn-yellow" to={homeFor(user)}>Open dashboard</Link>
          : <Link className="btn btn-yellow" to="/signin">Sign in</Link>}
      </header>

      <section className="hero">
        <div>
          <span className="hero-eyebrow"><b>New</b> Live federation view, run leaderboard and dark mode</span>
          <h1>Train together.<br /><span className="grad-text">Keep data local.</span></h1>
          <p className="lead">FLIP is a Federated Learning Infrastructure Platform: sites train locally and only model updates are aggregated into one shared model, with privacy controls and governance around every step.</p>
          <p className="prototype-note"><Icon name="info" size={14} /> Research prototype: sites are simulated on the FLIP server and uploaded files are stored there. Not for real personal or sensitive data.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to={start}>Get started <Icon name="chevron" size={16} /></Link>
            <a className="btn btn-lg" href="#how">See how it works</a>
          </div>
        </div>
        <div className="hero-viz">
          <div className="hero-viz-head"><span className="live-pill">Live simulation</span><span>6 institutions · FedAvg</span></div>
          <NetworkDemo />
        </div>
      </section>

      <div className="metric-strip">
        {[
          [stats?.projects, 'approved projects'],
          [stats?.training_runs, 'federated runs completed'],
          [stats?.node_updates, 'node updates aggregated'],
          [stats?.best_accuracy != null ? pct(stats.best_accuracy) : null, 'best model accuracy'],
        ].map(([v, label], i) => (
          <Reveal key={label} className="metric" delay={i * 80}>
            <b className="grad-text">{v == null ? '—' : <CountUp value={typeof v === 'number' ? v.toLocaleString() : v} duration={1400} />}</b>
            <span>{label}</span>
          </Reveal>
        ))}
      </div>

      <section id="features" className="home-section">
        <Reveal><span className="section-eyebrow">Platform</span><h2>Everything a federation needs</h2>
          <p className="sub">From approval to aggregation to audit, in one place for admins and model developers.</p></Reveal>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} className="feature" delay={(i % 3) * 90} onMouseMove={spotlight}>
              <span className="feature-icon"><Icon name={f.icon} size={22} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className="home-section">
        <Reveal><span className="section-eyebrow">Workflow</span><h2>From idea to deployed model</h2>
          <p className="sub">Each round, nodes train locally and send only weight updates. FLIP aggregates them into a better global model and repeats.</p></Reveal>
        <ol className="steps">
          {STEPS.map((s, i) => <Reveal as="li" key={s} delay={i * 90}><span>{i + 1}</span>{s}</Reveal>)}
        </ol>
      </section>

      <section id="sectors" className="home-section">
        <Reveal><span className="section-eyebrow">Use cases</span><h2>Built for regulated sectors</h2>
          <p className="sub">Wherever data is too sensitive to pool, a federation still lets everyone learn from it.</p></Reveal>
        <div className="feature-grid">
          {SECTORS.map((s, i) => (
            <Reveal key={s.title} className="feature" delay={i * 90} onMouseMove={spotlight}>
              <span className="feature-icon"><Icon name={s.icon} size={22} /></span>
              <h3>{s.title}</h3><p>{s.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="compare card flush">
          <table className="table">
            <thead><tr><th>Capability</th><th>FLIP</th><th>Typical FL frameworks</th></tr></thead>
            <tbody>{COMPARISON.map(r => <tr key={r[0]}><td>{r[0]}</td><td><strong className="grad-text">{r[1]}</strong></td><td className="muted">{r[2]}</td></tr>)}</tbody>
          </table>
        </Reveal>
      </section>

      <Reveal as="footer" className="home-footer">
        <h3>Ready to train together?</h3>
        <p style={{ opacity: .75, margin: '.4rem 0 0' }}>Create a developer account and submit your first project in minutes.</p>
        <div className="hero-actions">
          <Link className="btn btn-orange btn-lg" to={start}>Create a developer account</Link>
          <Link className="btn btn-orange-ghost btn-lg" to="/signin">Sign in</Link>
        </div>
        <p>© {new Date().getFullYear()} FLIP · Federated Learning Infrastructure Platform</p>
      </Reveal>
    </div>
  )
}
