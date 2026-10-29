import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, Field, PageHeader, Spinner, useApi } from '../../components/ui'
import { ago, bytes, dateTime, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

export default function ProjectReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: p, error, loading, reload } = useApi(`/api/projects/${id}`)
  const logs = useApi(`/api/logs?project_id=${id}&page_size=8`)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useRealtimeEvent(['project', 'training'], e => {
    if ((e.project?.project_id ?? e.project_id) === Number(id)) { reload(true); logs.reload(true) }
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const decide = async decision => {
    if (decision === 'Rejected' && !feedback.trim()) {
      setFormError('Explain what needs to change so the developer can resubmit.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      await api(`/api/projects/${id}/review`, { method: 'POST', body: { decision, feedback: feedback.trim() || null } })
      toast(`Project ${decision.toLowerCase()}. The developer has been notified.`, 'success')
      setFeedback('')
      reload(true)
      logs.reload(true)
    } catch (e) {
      setFormError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    try {
      await api(`/api/projects/${id}/archive?archived=${!p.archived}`, { method: 'POST' })
      toast(p.archived ? 'Project restored' : 'Project archived', 'success')
      reload(true)
    } catch (e) { toast(e.message, 'error') }
  }

  const remove = async () => {
    if (!window.confirm(`Delete "${p.project_name}" with its datasets and training history? This can't be undone.`)) return
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' })
      toast('Project deleted', 'success')
      navigate('/admin/projects')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHeader
        back={<Link to="/admin/projects" className="back-link"><Icon name="back" size={14} /> All projects</Link>}
        title={p.project_name}
        subtitle={<>Submitted by <strong>{p.owner_name}</strong> ({p.owner_email}){p.owner_organisation && ` · ${p.owner_organisation}`} · {ago(p.created_at)}</>}
        actions={<>
          <Badge status={p.status} />
          <button className="btn btn-ghost btn-sm" onClick={archive}><Icon name="archive" size={14} /> {p.archived ? 'Restore' : 'Archive'}</button>
          <button className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" size={14} /> Delete</button>
        </>}
      />
      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <h2 className="card-title">Project details</h2>
            <dl className="dl">
              <dt>Project number</dt><dd>#{p.project_id}</dd>
              <dt>Domain</dt><dd>{p.domain}</dd>
              <dt>Cohort size</dt><dd>{p.cohort_size} participating nodes</dd>
              <dt>Model</dt><dd>{p.model_label}</dd>
              <dt>Description</dt><dd className="pre">{p.description || '—'}</dd>
              <dt>Objectives</dt><dd className="pre">{p.objectives || '—'}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="card-title">Datasets <small>prototype: files are stored on this server and split across simulated sites</small></h2>
            {p.datasets.length === 0 ? <p className="muted">No dataset uploaded. Training will use a synthetic federated cohort.</p> : (
              <table className="table">
                <thead><tr><th>File</th><th>Size</th><th>Rows</th><th>Columns</th><th>Trainable</th></tr></thead>
                <tbody>{p.datasets.map(d => (
                  <tr key={d.dataset_id}><td>{d.filename}<div className="muted small">{d.note}</div></td><td>{bytes(d.size_bytes)}</td>
                    <td>{d.rows.toLocaleString()}</td><td>{d.columns}</td><td>{d.trainable ? 'Yes' : 'No'}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>
          <section className="card">
            <h2 className="card-title">Training history</h2>
            {p.trainings.length === 0 ? <p className="muted">No training runs yet.</p> : (
              <table className="table">
                <thead><tr><th>Run</th><th>Status</th><th>Setup</th><th>Accuracy</th><th>Started</th></tr></thead>
                <tbody>{p.trainings.map(t => (
                  <tr key={t.training_id}>
                    <td><Link to={`/admin/training/${t.training_id}`}>#{t.training_id}</Link></td>
                    <td><Badge status={t.status} /></td>
                    <td className="small">{t.algorithm} · {t.model_label} · {t.num_nodes} nodes · {t.rounds} rounds{t.dp_enabled && ' · DP'}</td>
                    <td>{pct(t.accuracy)}</td><td className="nowrap">{dateTime(t.started_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <h2 className="card-title">Decision</h2>
            {p.status !== 'Pending' && (
              <div className={`alert ${p.status === 'Approved' ? 'alert-success' : 'alert-warning'}`}>
                <Icon name={p.status === 'Approved' ? 'check' : 'warning'} />
                <span>{p.status} by {p.reviewed_by_name || 'an admin'} {ago(p.reviewed_at)}{p.feedback && <><br /><em>“{p.feedback}”</em></>}</span>
              </div>
            )}
            <Field label="Feedback for the developer" hint="Required when rejecting. Sent with the decision." error={formError} htmlFor="fb">
              <textarea id="fb" className="input" rows={5} value={feedback} onChange={e => setFeedback(e.target.value)}
                        placeholder="e.g. Approved for a 4-site pilot. Please keep each site above 200 records." />
            </Field>
            <div className="btn-row">
              <button className="btn btn-success" disabled={busy || p.status === 'Approved'} onClick={() => decide('Approved')}>
                <Icon name="check" size={16} /> Approve
              </button>
              <button className="btn btn-danger" disabled={busy || p.status === 'Rejected'} onClick={() => decide('Rejected')}>
                <Icon name="x" size={16} /> Reject
              </button>
            </div>
          </section>
          <section className="card">
            <h2 className="card-title">Project activity</h2>
            <ul className="list compact">
              {logs.data?.items.map(l => (
                <li key={l.log_id}><span>{l.log_message}</span><small className="muted">{ago(l.timestamp)}</small></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
