import { useState } from 'react'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Field, Modal } from '../../components/ui'
import { DEFAULT_DELTA, epsilonForReleases, studyReleases } from '../../privacy'

const PRESETS = {
  quick: { label: 'Quick check', rounds: 10, local_epochs: 1 },
  standard: { label: 'Standard', rounds: 25, local_epochs: 2 },
  thorough: { label: 'Thorough', rounds: 50, local_epochs: 3 },
}

export default function TrainingDialog({ project, onClose, onStarted }) {
  const local = project.mode === 'local'
  const [cfg, setCfg] = useState({
    family: project.families[0], algorithm: 'FedAvg', rounds: 25, num_nodes: project.cohort_size, client_fraction: 1,
    local_epochs: 2, batch_size: 32, learning_rate: project.families[0] === 'mlp' ? 0.05 : 0.1, mu: 0.01,
    dp_enabled: project.dp_required, clip_norm: 1, noise_multiplier: 1.0, trials: Math.min(1, project.max_trials),
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, numeric) => e => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setCfg(c => ({ ...c, [k]: numeric && v !== '' ? Number(v) : v }))
  }

  const spentReleases = studyReleases(project.trainings)
  const runEps = cfg.dp_enabled ? epsilonForReleases([[cfg.noise_multiplier, cfg.rounds * cfg.trials]]) : null
  const total = project.max_epsilon ? epsilonForReleases([...spentReleases, [cfg.dp_enabled ? cfg.noise_multiplier : 0, cfg.rounds * cfg.trials]]) : null
  const overBudget = project.max_epsilon && (total == null || total > project.max_epsilon)

  const start = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { ...cfg, num_nodes: project.mode === 'simulation' ? cfg.num_nodes : null }
      onStarted(await api(`/api/projects/${project.project_id}/training`, { method: 'POST', body }))
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <Modal title={local ? 'Start Local AutoML' : project.mode === 'simulation' ? 'Start simulation' : 'Start federated training'} onClose={onClose} wide
           footer={<>
             {overBudget && <span className="danger small" style={{ marginRight: 'auto' }}>Exceeds the study's privacy budget</span>}
             <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" form="train-form" disabled={busy || overBudget}><Icon name="play" size={14} /> {busy ? 'Starting…' : cfg.trials > 1 ? `Run ${cfg.trials} trials` : 'Start'}</button>
           </>}>
      <form id="train-form" onSubmit={start}>
        {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
        <div className="preset-row">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button type="button" key={k} className={`chip-btn ${cfg.rounds === p.rounds && cfg.local_epochs === p.local_epochs ? 'active' : ''}`}
                    onClick={() => setCfg(c => ({ ...c, rounds: p.rounds, local_epochs: p.local_epochs }))}>{p.label}<small>{p.rounds} rounds</small></button>
          ))}
        </div>
        <div className="form-grid four">
          <Field label="AutoML trials" htmlFor="t-trials" hint={`study allows up to ${project.max_trials}`}>
            <input id="t-trials" className="input" type="number" min="1" max={project.max_trials} value={cfg.trials} onChange={set('trials', true)} />
          </Field>
          <Field label={cfg.trials > 1 ? 'First trial model' : 'Model'} htmlFor="t-model">
            <select id="t-model" className="input" value={cfg.family} onChange={set('family')}>
              {project.families.map((f, i) => <option key={f} value={f}>{project.family_labels[i]}</option>)}
            </select>
          </Field>
          <Field label="Aggregation" htmlFor="t-alg">
            <select id="t-alg" className="input" value={cfg.algorithm} onChange={set('algorithm')}><option value="FedAvg">FedAvg</option><option value="FedProx">FedProx</option></select>
          </Field>
          <Field label="Rounds" htmlFor="t-rounds"><input id="t-rounds" className="input" type="number" min="1" max="200" value={cfg.rounds} onChange={set('rounds', true)} /></Field>
          {project.mode === 'simulation' && <Field label="Simulated sites" htmlFor="t-nodes"><input id="t-nodes" className="input" type="number" min="2" max="20" value={cfg.num_nodes} onChange={set('num_nodes', true)} /></Field>}
          {!local && <Field label="Sites per round" htmlFor="t-frac" hint={`${Math.round(cfg.client_fraction * 100)}% (never below the minimum cohort)`}>
            <input id="t-frac" type="range" min="0.1" max="1" step="any" value={cfg.client_fraction} onChange={set('client_fraction', true)} />
          </Field>}
          <Field label="Local epochs" htmlFor="t-ep"><input id="t-ep" className="input" type="number" min="1" max="20" value={cfg.local_epochs} onChange={set('local_epochs', true)} /></Field>
          <Field label="Batch size" htmlFor="t-bs"><input id="t-bs" className="input" type="number" min="4" max="1024" value={cfg.batch_size} onChange={set('batch_size', true)} /></Field>
          <Field label="Learning rate" htmlFor="t-lr"><input id="t-lr" className="input" type="number" min="0.001" max="5" step="any" value={cfg.learning_rate} onChange={set('learning_rate', true)} /></Field>
          {cfg.algorithm === 'FedProx' && <Field label="Proximal μ" htmlFor="t-mu"><input id="t-mu" className="input" type="number" min="0" max="10" step="any" value={cfg.mu} onChange={set('mu', true)} /></Field>}
        </div>
        {cfg.trials > 1 && <p className="field-hint">Trial 1 uses exactly these settings. The other {cfg.trials - 1} vary the model, learning rate and local epochs; the best is chosen on validation data.</p>}
        <fieldset className="dp-box">
          <legend><label className="check"><input type="checkbox" checked={cfg.dp_enabled} disabled={local || project.dp_required} onChange={set('dp_enabled')} /> <Icon name="shield" size={14} /> Client-level differential privacy{project.dp_required && ' (required by this study)'}</label></legend>
          {local ? <p className="muted small">Not available for a single-site run: there is no other site to hide among.</p> : (
            <p className="muted small">Each site's update is clipped and the coordinator adds Gaussian noise to the aggregate, bounding how much any one site can change the released model.</p>
          )}
          {cfg.dp_enabled && (
            <>
              <div className="form-grid">
                <Field label="Clip norm" htmlFor="t-clip"><input id="t-clip" className="input" type="number" min="0.01" max="100" step="any" value={cfg.clip_norm} onChange={set('clip_norm', true)} /></Field>
                <Field label="Noise multiplier" htmlFor="t-noise"><input id="t-noise" className="input" type="number" min="0" max="20" step="any" value={cfg.noise_multiplier} onChange={set('noise_multiplier', true)} /></Field>
              </div>
              <p className="dp-preview">
                {runEps == null ? <>Noise 0 gives <strong>no</strong> guarantee.</> : <>This {cfg.trials > 1 ? 'search' : 'run'} spends <strong>ε = {runEps.toFixed(2)}</strong> (δ = {DEFAULT_DELTA.toExponential(0)}, {cfg.rounds * cfg.trials} releases).</>}
                {project.max_epsilon && <><br />Study total afterwards: <strong>{total == null ? 'unbounded' : `ε = ${total.toFixed(2)}`}</strong> of a budget of ε = {project.max_epsilon}.</>}
                {runEps > 10 && <><br /><span className="upload-warn"><Icon name="warning" size={12} /> ε above 10 is a weak guarantee.</span></>}
              </p>
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  )
}
