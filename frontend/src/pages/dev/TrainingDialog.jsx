import { useState } from 'react'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Field, Modal } from '../../components/ui'
import { DEFAULT_DELTA, gaussianEpsilon } from '../../privacy'

const PRESETS = {
  quick: { label: 'Quick check', rounds: 10, local_epochs: 1 },
  standard: { label: 'Standard', rounds: 25, local_epochs: 2 },
  thorough: { label: 'Thorough', rounds: 60, local_epochs: 3 },
}

export default function TrainingDialog({ project, onClose, onStarted }) {
  const trainable = project.datasets.filter(d => d.trainable)
  const [cfg, setCfg] = useState({
    model_type: project.model_type, algorithm: 'FedAvg', rounds: 25, num_nodes: project.cohort_size,
    client_fraction: 1, local_epochs: 2, batch_size: 32, learning_rate: project.model_type === 'mlp' ? 0.05 : 0.1,
    mu: 0.01, dp_enabled: false, clip_norm: 1, noise_multiplier: 1.0,
    dataset_id: trainable[0]?.dataset_id ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const eps = cfg.dp_enabled ? gaussianEpsilon(cfg.noise_multiplier, cfg.rounds) : null
  const set = (k, numeric) => e => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setCfg(c => ({ ...c, [k]: numeric && v !== '' ? Number(v) : v }))
  }

  const start = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { ...cfg, dataset_id: cfg.dataset_id === '' ? null : Number(cfg.dataset_id) }
      const job = await api(`/api/projects/${project.project_id}/training`, { method: 'POST', body })
      onStarted(job)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Start federated training" onClose={onClose} wide
           footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-purple" form="train-form" disabled={busy}><Icon name="play" size={14} /> {busy ? 'Starting…' : 'Start training'}</button></>}>
      <form id="train-form" onSubmit={start}>
        {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
        <div className="preset-row">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button type="button" key={k} className={`chip-btn ${cfg.rounds === p.rounds && cfg.local_epochs === p.local_epochs ? 'active' : ''}`}
                    onClick={() => setCfg(c => ({ ...c, rounds: p.rounds, local_epochs: p.local_epochs }))}>
              {p.label}<small>{p.rounds} rounds</small>
            </button>
          ))}
        </div>
        <div className="form-grid three">
          <Field label="Training data" htmlFor="t-data" hint={trainable.length ? 'CSV is split across the nodes' : 'Upload a CSV on the project to train on your own data'}>
            <select id="t-data" className="input" value={cfg.dataset_id} onChange={set('dataset_id')}>
              {trainable.map(d => <option key={d.dataset_id} value={d.dataset_id}>{d.filename} ({d.rows.toLocaleString()} rows)</option>)}
              <option value="">Synthetic federated cohort</option>
            </select>
          </Field>
          <Field label="Model" htmlFor="t-model">
            <select id="t-model" className="input" value={cfg.model_type} onChange={set('model_type')}>
              <option value="logreg">Logistic Regression</option><option value="mlp">Neural Network (MLP)</option>
            </select>
          </Field>
          <Field label="Aggregation" htmlFor="t-alg" hint={cfg.algorithm === 'FedProx' ? 'Adds a proximal term for non-IID nodes' : 'Sample-weighted averaging'}>
            <select id="t-alg" className="input" value={cfg.algorithm} onChange={set('algorithm')}>
              <option value="FedAvg">FedAvg</option><option value="FedProx">FedProx</option>
            </select>
          </Field>
          <Field label="Rounds" htmlFor="t-rounds"><input id="t-rounds" className="input" type="number" min="1" max="200" value={cfg.rounds} onChange={set('rounds', true)} /></Field>
          <Field label="Nodes" htmlFor="t-nodes"><input id="t-nodes" className="input" type="number" min="2" max="20" value={cfg.num_nodes} onChange={set('num_nodes', true)} /></Field>
          <Field label="Nodes per round" htmlFor="t-frac" hint={`${Math.max(1, Math.round(cfg.client_fraction * cfg.num_nodes))} of ${cfg.num_nodes}`}>
            <input id="t-frac" type="range" min="0.1" max="1" step="any" value={cfg.client_fraction} onChange={set('client_fraction', true)} />
          </Field>
          <Field label="Local epochs" htmlFor="t-ep"><input id="t-ep" className="input" type="number" min="1" max="20" value={cfg.local_epochs} onChange={set('local_epochs', true)} /></Field>
          <Field label="Batch size" htmlFor="t-bs"><input id="t-bs" className="input" type="number" min="4" max="1024" value={cfg.batch_size} onChange={set('batch_size', true)} /></Field>
          <Field label="Learning rate" htmlFor="t-lr"><input id="t-lr" className="input" type="number" min="0.001" max="5" step="any" value={cfg.learning_rate} onChange={set('learning_rate', true)} /></Field>
          {cfg.algorithm === 'FedProx' && (
            <Field label="Proximal μ" htmlFor="t-mu"><input id="t-mu" className="input" type="number" min="0" max="10" step="any" value={cfg.mu} onChange={set('mu', true)} /></Field>
          )}
        </div>
        <fieldset className="dp-box">
          <legend><label className="check"><input type="checkbox" checked={cfg.dp_enabled} onChange={set('dp_enabled')} /> <Icon name="shield" size={14} /> Differential privacy</label></legend>
          <p className="muted small">Client-level DP: each site's whole update is clipped and Gaussian noise is added to the aggregate, bounding how much any one site can change the released model. Smaller ε is stronger protection and usually costs accuracy.</p>
          {cfg.dp_enabled && (
            <>
              <div className="form-grid">
                <Field label="Clip norm" htmlFor="t-clip"><input id="t-clip" className="input" type="number" min="0.01" max="100" step="any" value={cfg.clip_norm} onChange={set('clip_norm', true)} /></Field>
                <Field label="Noise multiplier" htmlFor="t-noise"><input id="t-noise" className="input" type="number" min="0" max="10" step="any" value={cfg.noise_multiplier} onChange={set('noise_multiplier', true)} /></Field>
              </div>
              <p className="dp-preview">
                {eps == null
                  ? <>Noise multiplier 0 gives <strong>no</strong> privacy guarantee.</>
                  : <>Budget for {cfg.rounds} rounds: <strong>ε = {eps.toFixed(2)}</strong>, δ = {DEFAULT_DELTA.toExponential(0)} <span className="muted">(RDP accountant, no subsampling amplification)</span>
                    {eps > 10 && <><br /><span className="upload-warn"><Icon name="warning" size={12} /> ε above 10 is a weak guarantee. Raise the noise multiplier or use fewer rounds.</span></>}</>}
              </p>
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  )
}
