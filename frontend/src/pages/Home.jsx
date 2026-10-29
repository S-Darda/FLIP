import { Link } from 'react-router-dom'
import { homeFor, useAuth } from '../auth'
import Icon from '../components/Icon'
import Logo from '../components/Logo'

const FEATURES = [
  { icon: 'shield', title: 'Data privacy', text: 'Raw records stay inside each hospital, bank or lab. Only model updates travel, supporting GDPR and HIPAA obligations.' },
  { icon: 'users', title: 'Collaboration', text: 'Institutions train one shared model together and all benefit from insight none of them could reach alone.' },
  { icon: 'rocket', title: 'High-performance training', text: 'FedAvg and FedProx aggregation, configurable rounds and nodes, and optional differential privacy.' },
  { icon: 'live', title: 'Real-time monitoring', text: 'Watch accuracy and loss for every round and every node as training happens, with no page refreshes.' },
  { icon: 'lock', title: 'Role-based access', text: 'Admins approve projects and manage users; model developers see only their own work. Every action is audited.' },
  { icon: 'logs', title: 'Full audit trail', text: 'Searchable, filterable logs with CSV export, plus optional shipping to Elasticsearch and Kibana.' },
]

const STEPS = ['Create a project', 'Submit for approval', 'Start federated training', 'Monitor progress live', 'Receive the final model']

const SECTORS = [
  { title: 'Healthcare', text: 'Hospitals build readmission and early-warning models without moving patient records between trusts.' },
  { title: 'Finance', text: 'Banks detect fraud patterns across institutions without disclosing customer transactions.' },
  { title: 'Research', text: 'Labs and universities accelerate shared model development while keeping datasets under local control.' },
]

const COMPARISON = [
  ['Privacy-preserving learning', 'Yes', 'Yes'],
  ['Role-based access control', 'Yes', 'Limited'],
  ['Real-time updates', 'Yes', 'No'],
  ['Graphical management interface', 'Yes', 'Limited'],
  ['Hardware-agnostic', 'Yes', 'NVIDIA-focused'],
]

export default function Home() {
  const { user } = useAuth()
  const start = user ? homeFor(user) : '/signup'
  return (
    <div className="home">
      <header className="home-nav">
        <Logo />
        <nav>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#sectors">Who it's for</a>
          <Link to="/admin/signin">Admin</Link>
        </nav>
        {user
          ? <Link className="btn btn-yellow" to={homeFor(user)}>Open dashboard</Link>
          : <Link className="btn btn-yellow" to="/signin">Login</Link>}
      </header>

      <section className="hero">
        <h1>Federated Learning Infrastructure Platform</h1>
        <p>Secure, distributed machine learning without compromising data privacy.</p>
        <div className="hero-actions">
          <Link className="btn btn-orange btn-lg" to={start}>Get started</Link>
          <a className="btn btn-orange-ghost btn-lg" href="#how">Learn more</a>
        </div>
        <div className="hero-diagram" aria-hidden="true">
          {['Hospital A', 'Hospital B', 'Bank C', 'Lab D'].map((n, i) => (
            <div key={n} className="hero-node" style={{ '--i': i }}>
              <Icon name="lock" size={14} /> {n}
              <span className="hero-flow" />
            </div>
          ))}
          <div className="hero-server"><Icon name="nodes" size={22} /> Global model</div>
        </div>
      </section>

      <section id="features" className="home-section">
        <h2>Key features</h2>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="feature">
              <span className="feature-icon"><Icon name={f.icon} size={22} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="home-section">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => <li key={s} className={i % 2 ? 'alt' : ''}><span>{i + 1}</span>{s}</li>)}
        </ol>
        <p className="home-note">
          Each round, the coordinator sends the current model to the participating nodes. Every node trains on its own data
          and returns only a weight update. FLIP aggregates the updates into a better global model and repeats.
        </p>
      </section>

      <section id="sectors" className="home-section">
        <h2>Built for regulated sectors</h2>
        <div className="feature-grid three">
          {SECTORS.map(s => <div key={s.title} className="feature"><h3>{s.title}</h3><p>{s.text}</p></div>)}
        </div>
        <div className="compare">
          <table className="table">
            <thead><tr><th>Capability</th><th>FLIP</th><th>Typical FL frameworks</th></tr></thead>
            <tbody>{COMPARISON.map(r => <tr key={r[0]}><td>{r[0]}</td><td><strong>{r[1]}</strong></td><td>{r[2]}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <footer className="home-footer">
        <h3>Ready to train together?</h3>
        <div className="hero-actions">
          <Link className="btn btn-orange" to={start}>Create a developer account</Link>
          <Link className="btn btn-orange-ghost" to="/signin">Sign in</Link>
        </div>
        <p>© {new Date().getFullYear()} FLIP · Federated Learning Infrastructure Platform</p>
      </footer>
    </div>
  )
}
