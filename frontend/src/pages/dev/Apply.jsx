import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Field, PageHeader, Panel, useApi } from '../../components/ui'
import { useToast } from '../../toast'
import Faq from './Faq'

const MODES = [
  { value: 'federated', title: 'Federated AutoML', text: 'Several enrolled sites train locally; FLIP aggregates their updates.' },
  { value: 'local', title: 'Local AutoML', text: 'One site trains on its own data. Private local ML, not federated learning.' },
  { value: 'simulation', title: 'Simulation', text: 'Synthetic data, sites simulated on the server. For demos and teaching.' },
]

function Chip({ on, disabled, onClick, children, title }) {
  return <button type="button" className={`chip-toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick} title={title}>{on && <Icon name="check" size={12} />}{children}</button>
}

/** Live policy check mirroring backend/app/policy.py, so problems show before submitting. */
function problems(f, chosenSites, columns, numeric) {
  const out = []
  if (f.project_name.trim().length < 3) out.push('Give the study a name (3+ characters).')
  if (f.description.trim().length < 10) out.push('Describe the study so an admin can assess it.')
  if (f.mode === 'simulation') return out
  if (f.mode === 'local' && chosenSites.length !== 1) out.push('Local AutoML uses exactly one site.')
  if (f.mode === 'local' && f.dp_required) out.push('Client-level DP needs at least two sites.')
  if (f.mode === 'federated' && chosenSites.length < Math.max(2, f.min_sites)) out.push(`Select at least ${Math.max(2, f.min_sites)} sites (the minimum cohort).`)
  if (!f.dataset_name) out.push('Choose the dataset the sites hold.')
  if (!f.target) out.push('Choose a target column.')
  else {
    const t = columns.find(c => c.name === f.target)
    if (f.task_type === 'regression' && t?.type !== 'numeric') out.push('Regression needs a numeric target.')
    if (f.task_type === 'classification' && !t?.values) out.push('This target has too many (or rare) values to be a class label.')
  }
  if (!f.features.length) out.push('Choose at least one feature.')
  if (f.features.some(x => !numeric.includes(x))) out.push('Features must be numeric at every site.')
  return out
}

export default function Apply() {
  const navigate = useNavigate()
  const toast = useToast()
  const sites = useApi('/api/sites')
  const [f, setF] = useState({ project_name: '', description: '', objectives: '', domain: 'Healthcare', mode: 'federated',
    task_type: 'classification', dataset_name: '', target: '', features: [], site_ids: [], cohort_size: 4, min_sites: 2,
    families: ['linear'], max_trials: 4, dp_required: false, max_epsilon: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const toggle = (k, v) => setF(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }))

  const active = sites.data || []
  const chosenSites = active.filter(s => f.site_ids.includes(s.site_id))
  const datasetNames = useMemo(() => {
    const pool = chosenSites.length ? chosenSites : active
    return [...new Set(pool.flatMap(s => s.datasets.map(d => d.name)))].filter(n => chosenSites.every(s => s.datasets.some(d => d.name === n)))
  }, [chosenSites, active])
  // Columns usable everywhere: present at every chosen site; numeric only if numeric at all of them.
  const schemas = chosenSites.map(s => s.datasets.find(d => d.name === f.dataset_name)?.schema).filter(Boolean)
  const columns = schemas.length ? schemas[0].columns.filter(c => schemas.every(sc => sc.columns.some(x => x.name === c.name)))
    .map(c => {
      const all = schemas.map(sc => sc.columns.find(x => x.name === c.name))
      const values = all.every(x => x.values) ? [...new Set(all.flatMap(x => x.values))] : null
      return { name: c.name, type: all.every(x => x.type === 'numeric') ? 'numeric' : 'categorical', values }
    }) : []
  const numeric = columns.filter(c => c.type === 'numeric').map(c => c.name)
  const issues = problems(f, chosenSites, columns, numeric)

  const submit = async e => {
    e.preventDefault()
    if (issues.length) return setError(issues[0])
    setBusy(true)
    setError('')
    const body = { ...f, max_epsilon: f.max_epsilon === '' ? null : Number(f.max_epsilon),
                   min_sites: f.mode === 'local' ? 1 : Number(f.min_sites), cohort_size: Number(f.cohort_size), max_trials: Number(f.max_trials) }
    try {
      const p = await api('/api/projects', { method: 'POST', body })
      toast('Study submitted. An admin has been notified.', 'success')
      navigate(`/app/projects/${p.project_id}`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="New study" subtitle="Define what to predict, where the data lives and how privacy is protected. An admin approves it before training."
                  actions={<Link className="btn btn-ghost" to="/app/projects">Your studies</Link>} />
      <form className="fill grid-side" onSubmit={submit}>
        <Panel title="Study design" footer={<>
          {error && <span className="danger small" style={{ marginRight: 'auto' }}>{error}</span>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
        </>}>
          <div className="section-title">1 · About</div>
          <div className="form-grid">
            <Field label="Study name" htmlFor="p-name"><input id="p-name" className="input" value={f.project_name} onChange={e => set('project_name', e.target.value)} /></Field>
            <Field label="Domain" htmlFor="p-dom">
              <select id="p-dom" className="input" value={f.domain} onChange={e => set('domain', e.target.value)}>
                {['Healthcare', 'Finance', 'Research', 'Retail', 'Public Sector', 'Other'].map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Description" htmlFor="p-desc"><textarea id="p-desc" className="input" rows={2} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
            <Field label="Objectives and success criteria" htmlFor="p-obj"><textarea id="p-obj" className="input" rows={2} value={f.objectives} onChange={e => set('objectives', e.target.value)} placeholder="e.g. Beat 70% accuracy at every site" /></Field>
          </div>

          <div className="section-title">2 · Training mode</div>
          <div className="preset-row">
            {MODES.map(m => (
              <button type="button" key={m.value} className={`chip-btn ${f.mode === m.value ? 'active' : ''}`} style={{ flex: 1, minWidth: 180 }}
                      onClick={() => setF(s => ({ ...s, mode: m.value, site_ids: m.value === 'local' ? s.site_ids.slice(0, 1) : s.site_ids, dp_required: m.value === 'local' ? false : s.dp_required }))}>
                {m.title}<small>{m.text}</small>
              </button>
            ))}
          </div>

          {f.mode === 'simulation' ? (
            <div className="form-grid">
              <Field label="Task" htmlFor="p-task"><select id="p-task" className="input" value={f.task_type} onChange={e => set('task_type', e.target.value)}><option value="classification">Classification</option><option value="regression">Regression</option></select></Field>
              <Field label="Simulated sites" htmlFor="p-coh"><input id="p-coh" type="number" min="2" max="20" className="input" value={f.cohort_size} onChange={e => set('cohort_size', e.target.value)} /></Field>
            </div>
          ) : (
            <>
              <div className="section-title">3 · Sites and data</div>
              <Field label={f.mode === 'local' ? 'Site (choose one)' : 'Participating sites'} hint={active.length ? 'Only enrolled sites are listed. Raw rows never leave them.' : 'No sites are enrolled yet. Ask an admin to enrol one, or use Simulation.'}>
                <div className="chip-select">{active.map(s => (
                  <Chip key={s.site_id} on={f.site_ids.includes(s.site_id)}
                        onClick={() => f.mode === 'local' ? set('site_ids', [s.site_id]) : toggle('site_ids', s.site_id)}>
                    {s.name} <span className="muted">· {s.organisation}</span>
                  </Chip>))}</div>
              </Field>
              <div className="form-grid three">
                <Field label="Dataset" htmlFor="p-ds" hint="Registered by name at each site">
                  <select id="p-ds" className="input" value={f.dataset_name} onChange={e => setF(s => ({ ...s, dataset_name: e.target.value, target: '', features: [] }))}>
                    <option value="">Choose…</option>{datasetNames.map(n => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Task" htmlFor="p-task">
                  <select id="p-task" className="input" value={f.task_type} onChange={e => set('task_type', e.target.value)}><option value="classification">Classification</option><option value="regression">Regression</option></select>
                </Field>
                <Field label="Target column" htmlFor="p-target">
                  <select id="p-target" className="input" value={f.target} onChange={e => setF(s => ({ ...s, target: e.target.value, features: s.features.filter(x => x !== e.target.value) }))}>
                    <option value="">Choose…</option>
                    {columns.filter(c => (f.task_type === 'regression' ? c.type === 'numeric' : c.values)).map(c => <option key={c.name} value={c.name}>{c.name}{c.values ? ` (${c.values.join(', ')})` : ''}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Features" hint={columns.length ? 'Numeric columns present at every chosen site' : 'Choose sites and a dataset first'}>
                <div className="chip-select">
                  {numeric.filter(c => c !== f.target).map(c => <Chip key={c} on={f.features.includes(c)} onClick={() => toggle('features', c)}><span className="mono">{c}</span></Chip>)}
                  {numeric.length > 1 && <button type="button" className="link-btn small" onClick={() => set('features', numeric.filter(c => c !== f.target))}>select all</button>}
                </div>
              </Field>
            </>
          )}

          <div className="section-title">{f.mode === 'simulation' ? '3' : '4'} · Models, AutoML and privacy</div>
          <div className="form-grid four">
            <Field label="Model families">
              <div className="chip-select">{[['linear', 'Linear'], ['mlp', 'Neural net']].map(([v, l]) => (
                <Chip key={v} on={f.families.includes(v)} onClick={() => f.families.includes(v) && f.families.length === 1 ? null : toggle('families', v)}>{l}</Chip>))}</div>
            </Field>
            <Field label="Max AutoML trials" htmlFor="p-trials"><input id="p-trials" type="number" min="1" max="20" className="input" value={f.max_trials} onChange={e => set('max_trials', e.target.value)} /></Field>
            {f.mode === 'federated' && <Field label="Minimum cohort" htmlFor="p-min" hint="sites per round"><input id="p-min" type="number" min="2" max="50" className="input" value={f.min_sites} onChange={e => set('min_sites', e.target.value)} /></Field>}
            <Field label="Study privacy budget" htmlFor="p-eps" hint="max ε across all runs; blank = none"><input id="p-eps" type="number" min="0.1" step="any" className="input" value={f.max_epsilon} onChange={e => set('max_epsilon', e.target.value)} /></Field>
          </div>
          <label className="check" title={f.mode === 'local' ? 'Not available for a single site' : ''}>
            <input type="checkbox" checked={f.dp_required} disabled={f.mode === 'local'} onChange={e => set('dp_required', e.target.checked)} />
            Require client-level differential privacy for every run
          </label>
        </Panel>
        <div className="rows-2">
          <Panel title="Policy check" subtitle={issues.length ? `${issues.length} to fix` : 'ready to submit'}>
            {issues.length === 0
              ? <div className="alert alert-success"><Icon name="check" /><span>This design satisfies the platform policy.</span></div>
              : <ul className="list compact">{issues.map(i => <li key={i}><span><Icon name="warning" size={13} className="danger" /> {i}</span></li>)}</ul>}
            {f.mode !== 'simulation' && f.target && (
              <p className="small muted" style={{ marginTop: '.6rem' }}>Each site will split its rows 70/15/15 locally. FLIP only receives
                feature moments, model updates and aggregate metrics{f.dp_required ? ', with client-level DP noise' : ''}.</p>
            )}
          </Panel>
          <Faq />
        </div>
      </form>
    </>
  )
}
