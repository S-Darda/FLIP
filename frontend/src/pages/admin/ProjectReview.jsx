import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, Field, PageHeader, Panel, Spinner, useApi } from '../../components/ui'
import { ago, dateTime, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'
import StudySummary from '../shared/StudySummary'

export default function ProjectReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: p, error, loading, reload } = useApi(`/api/projects/${id}`)
  const logs = useApi(`/api/logs?project_id=${id}&page_size=20`)
  const sites = useApi('/api/sites')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useRealtimeEvent(['project', 'training'], e => {
    if ((e.project?.project_id ?? e.project_id) === Number(id) && !e.round_metrics) { reload(true); logs.reload(true) }
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const decide = async decision => {
    if (decision === 'Rejected' && !feedback.trim()) return setFormError('Explain what needs to change so the developer can resubmit.')
    setBusy(true)
    setFormError('')
    try {
      await api(`/api/projects/${id}/review`, { method: 'POST', body: { decision, feedback: feedback.trim() || null } })
      toast(`Study ${decision.toLowerCase()}. The developer has been notified.`, 'success')
      setFeedback('')
      reload(true)
      logs.reload(true)
    } catch (e) { setFormError(e.message) } finally { setBusy(false) }
  }
  const archive = async () => {
    try { await api(`/api/projects/${id}/archive?archived=${!p.archived}`, { method: 'POST' }); reload(true) }
    catch (e) { toast(e.message, 'error') }
  }
  const remove = async () => {
    if (!window.confirm(`Delete "${p.project_name}" and its training history? This can't be undone.`)) return
    try { await api(`/api/projects/${id}`, { method: 'DELETE' }); toast('Study deleted', 'success'); navigate('/admin/projects') }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHeader
        back={<Link to="/admin/projects" className="back-link"><Icon name="back" size={14} /> All studies</Link>}
        title={p.project_name}
        subtitle={<>{p.mode_label} · submitted by <strong>{p.owner_name}</strong>{p.owner_organisation && ` (${p.owner_organisation})`} · {ago(p.created_at)}</>}
        actions={<>
          <Badge status={p.status} />
          <button className="btn btn-ghost btn-sm" onClick={archive}><Icon name="archive" size={14} /> {p.archived ? 'Restore' : 'Archive'}</button>
          <button className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" size={14} /> Delete</button>
        </>}
      />
      <div className="fill grid-main">
        <div className="rows-2">
          <Panel title="Study design" subtitle="what will run, where, under which privacy policy">
            <StudySummary project={p} sites={sites.data || []} />
          </Panel>
          <Panel title="Training history" flush>
            {p.trainings.length === 0 ? <p className="muted" style={{ padding: '.8rem .9rem' }}>No training runs yet.</p> : (
              <table className="table">
                <thead><tr><th>Run</th><th>Status</th><th>Setup</th><th>Result</th><th>Started</th></tr></thead>
                <tbody>{p.trainings.map(t => (
                  <tr key={t.training_id}>
                    <td><Link to={`/admin/training/${t.training_id}`}>#{t.training_id}</Link>{t.is_best && <Badge status="Approved">best</Badge>}</td>
                    <td><Badge status={t.status} /></td>
                    <td className="small">{t.model_label} · {t.num_nodes} sites · {t.rounds} rounds{t.dp_enabled && ' · DP'}{t.trial_count > 1 && ` · trial ${t.trial_index}/${t.trial_count}`}</td>
                    <td>{t.task_type === 'regression' ? (t.rmse?.toFixed(3) ?? '—') : pct(t.accuracy)}</td>
                    <td className="nowrap">{dateTime(t.started_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </div>
        <div className="rows-2">
          <Panel title="Decision">
            {p.status !== 'Pending' && (
              <div className={`alert ${p.status === 'Approved' ? 'alert-success' : 'alert-warning'}`}>
                <Icon name={p.status === 'Approved' ? 'check' : 'warning'} />
                <span>{p.status} by {p.reviewed_by_name || 'an admin'} {ago(p.reviewed_at)}{p.feedback && <><br /><em>“{p.feedback}”</em></>}</span>
              </div>
            )}
            <p className="small muted">Approving lets the developer start training on the listed sites under this policy.</p>
            <Field label="Feedback for the developer" hint="Required when rejecting." error={formError} htmlFor="fb">
              <textarea id="fb" className="input" rows={4} value={feedback} onChange={e => setFeedback(e.target.value)} />
            </Field>
            <div className="btn-row">
              <button className="btn btn-success" disabled={busy || p.status === 'Approved'} onClick={() => decide('Approved')}><Icon name="check" size={15} /> Approve</button>
              <button className="btn btn-danger" disabled={busy || p.status === 'Rejected'} onClick={() => decide('Rejected')}><Icon name="x" size={15} /> Reject</button>
            </div>
          </Panel>
          <Panel title="Study activity">
            <ul className="list compact">
              {logs.data?.items.map(l => <li key={l.log_id}><span>{l.log_message}</span><small className="muted">{ago(l.timestamp)}</small></li>)}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}
