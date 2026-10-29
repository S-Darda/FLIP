import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, Field, Spinner, useApi } from '../../components/ui'
import { ago, bytes, dateTime, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'
import { FilePicker } from './Apply'
import TrainingDialog from './TrainingDialog'

const BENEFITS = [
  ['check', 'Detailed model performance reports: accuracy, precision, recall, F1 and a confusion matrix.'],
  ['rocket', 'Trained models you can download, or submit for deployment approval.'],
  ['live', 'Live progress for every round and every participating node.'],
  ['lock', 'Federated training: each simulated site trains locally and only its update is aggregated, with optional client-level DP.'],
  ['logs', 'An audit trail of every action on the project.'],
]

const EDITABLE = ['project_name', 'description', 'objectives', 'domain', 'cohort_size', 'model_type']

export default function ProjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: p, error, loading, reload } = useApi(`/api/projects/${id}`)
  const { data: options } = useApi('/api/projects/options')
  const [form, setForm] = useState(null)
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [training, setTraining] = useState(false)

  useEffect(() => { if (p) setForm(Object.fromEntries(EDITABLE.map(k => [k, p[k] ?? '']))) }, [p])
  useRealtimeEvent(['project', 'training'], e => {
    if ((e.project?.project_id ?? e.project_id) !== Number(id) || e.round_metrics) return
    if (e.type === 'project' && e.project.status !== p?.status) toast(`Project is now ${e.project.status.toLowerCase()}`, e.project.status === 'Approved' ? 'success' : 'warning')
    reload(true)
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!form) return null

  const set = k => e => setForm(f => ({ ...f, [k]: k === 'cohort_size' ? Number(e.target.value) : e.target.value }))
  const changed = EDITABLE.filter(k => String(form[k] ?? '') !== String(p[k] ?? ''))
  const scopeChange = p.status === 'Approved' && changed.some(k => ['project_name', 'domain', 'cohort_size', 'model_type'].includes(k))
  const running = p.trainings.find(t => ['Queued', 'In Progress'].includes(t.status))

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (changed.length) {
        await api(`/api/projects/${id}`, { method: 'PATCH', body: Object.fromEntries(changed.map(k => [k, form[k]])) })
      }
      if (files.length) {
        const fd = new FormData()
        files.forEach(f => fd.append('files', f))
        await api(`/api/projects/${id}/datasets`, { method: 'POST', form: fd })
        setFiles([])
      }
      toast(p.status === 'Rejected' || scopeChange ? 'Saved and resubmitted for approval' : 'Project saved', 'success')
      reload(true)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const removeDataset = async d => {
    if (!window.confirm(`Remove ${d.filename}?`)) return
    try { await api(`/api/projects/${id}/datasets/${d.dataset_id}`, { method: 'DELETE' }); reload(true) }
    catch (err) { toast(err.message, 'error') }
  }

  const removeProject = async () => {
    if (!window.confirm(`Delete "${p.project_name}"? This can't be undone.`)) return
    try { await api(`/api/projects/${id}`, { method: 'DELETE' }); toast('Project deleted', 'success'); navigate('/app/projects') }
    catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      <Link to="/app/projects" className="back-link"><Icon name="back" size={14} /> Your projects</Link>
      {p.status === 'Pending' && <div className="alert alert-warning"><Icon name="info" /><span>Waiting for an admin to review this project. You'll be notified here as soon as they decide.</span></div>}
      {p.status === 'Rejected' && <div className="alert alert-error"><Icon name="warning" /><span><strong>Declined by {p.reviewed_by_name}:</strong> {p.feedback}<br />Update the project below and save to resubmit it.</span></div>}
      {p.status === 'Approved' && (
        <div className="alert alert-success approve-bar">
          <Icon name="check" />
          <span>Approved {p.reviewed_by_name && `by ${p.reviewed_by_name}`} {ago(p.reviewed_at)}{p.feedback && <> · “{p.feedback}”</>}</span>
          {running
            ? <Link className="btn btn-sm" to={`/app/training/${running.training_id}`}>Watch run #{running.training_id}</Link>
            : <button className="btn btn-purple btn-sm" onClick={() => setTraining(true)}><Icon name="play" size={14} /> Start training</button>}
        </div>
      )}

      <div className="split">
        <div className="stack">
          <form className="card" onSubmit={save}>
            <h1 className="purple-title center">View Your Project</h1>
            {formError && <div className="alert alert-error"><Icon name="warning" /><span>{formError}</span></div>}
            <div className="form-grid">
              <Field label="Project number"><input className="input" value={p.project_id} readOnly /></Field>
              <Field label="Status"><div className="input input-static"><Badge status={p.status} /></div></Field>
            </div>
            <Field label="Project name" htmlFor="pv-name"><input id="pv-name" className="input" value={form.project_name} onChange={set('project_name')} required minLength={3} /></Field>
            <Field label="Project details" htmlFor="pv-desc"><textarea id="pv-desc" className="input" rows={3} value={form.description} onChange={set('description')} /></Field>
            <Field label="Objectives" htmlFor="pv-obj"><textarea id="pv-obj" className="input" rows={2} value={form.objectives} onChange={set('objectives')} /></Field>
            <div className="form-grid three">
              <Field label="Domain" htmlFor="pv-dom">
                <select id="pv-dom" className="input" value={form.domain} onChange={set('domain')}>
                  {(options?.domains || [form.domain]).map(d => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Cohort size" htmlFor="pv-coh">
                <select id="pv-coh" className="input" value={form.cohort_size} onChange={set('cohort_size')}>
                  {Array.from({ length: 19 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} nodes</option>)}
                </select>
              </Field>
              <Field label="Model" htmlFor="pv-model">
                <select id="pv-model" className="input" value={form.model_type} onChange={set('model_type')}>
                  {(options?.model_types || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            </div>
            {scopeChange && <p className="field-hint warn"><Icon name="warning" size={12} /> Changing the name, domain, cohort or model sends this approved project back for review.</p>}
            <Field label="Datasets">
              {p.datasets.length > 0 && (
                <ul className="file-list">
                  {p.datasets.map(d => (
                    <li key={d.dataset_id}>
                      <Icon name="file" size={14} /> <strong>{d.filename}</strong>
                      <span className="muted">{bytes(d.size_bytes)} · {d.trainable ? `${d.rows.toLocaleString()} rows, ${d.classes} classes` : d.note}</span>
                      <button type="button" className="icon-btn" aria-label={`Remove ${d.filename}`} onClick={() => removeDataset(d)}><Icon name="trash" size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <FilePicker files={files} setFiles={setFiles} id="pv-files" />
            </Field>
            <button className="btn btn-gradient btn-block btn-lg" disabled={saving || (!changed.length && !files.length)}>
              {saving ? 'Saving…' : p.status === 'Rejected' ? 'Save and resubmit' : 'Submit'}
            </button>
          </form>

          <section className="card">
            <h2 className="card-title">Training runs
              {p.status === 'Approved' && !running && <button className="card-link link-btn" onClick={() => setTraining(true)}>New run</button>}</h2>
            {p.trainings.length === 0 ? <p className="muted">{p.status === 'Approved' ? 'No runs yet. Start one to train across your cohort.' : 'Training opens once the project is approved.'}</p> : (
              <table className="table">
                <thead><tr><th>Run</th><th>Status</th><th>Setup</th><th>Accuracy</th><th>Started</th></tr></thead>
                <tbody>{p.trainings.map(t => (
                  <tr key={t.training_id}>
                    <td><Link to={`/app/training/${t.training_id}`}>#{t.training_id}</Link></td>
                    <td><Badge status={t.status} /></td>
                    <td className="small">{t.algorithm} · {t.model_label} · {t.num_nodes} nodes · {t.rounds} rounds{t.dp_enabled && ' · DP'}</td>
                    <td>{pct(t.accuracy)}</td>
                    <td className="nowrap">{dateTime(t.started_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
          <div><button className="btn btn-ghost btn-sm danger" onClick={removeProject}><Icon name="trash" size={14} /> Delete project</button></div>
        </div>

        <aside className="card benefits">
          <h2 className="purple-title">What You Will Get</h2>
          {BENEFITS.map(([icon, text]) => (
            <div key={text} className="benefit"><span className="benefit-icon"><Icon name={icon} size={18} /></span><p>{text}</p></div>
          ))}
        </aside>
      </div>
      {training && <TrainingDialog project={p} onClose={() => setTraining(false)}
                                   onStarted={job => { setTraining(false); toast(`Training #${job.training_id} started`, 'success'); navigate(`/app/training/${job.training_id}`) }} />}
    </>
  )
}
