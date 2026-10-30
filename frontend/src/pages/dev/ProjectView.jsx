import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, Field, PageHeader, Panel, Spinner, useApi } from '../../components/ui'
import { ago, dateTime, pct } from '../../format'
import { epsilonForReleases, studyReleases } from '../../privacy'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'
import StudySummary from '../shared/StudySummary'
import TrainingDialog from './TrainingDialog'

export default function ProjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: p, error, loading, reload } = useApi(`/api/projects/${id}`)
  const sites = useApi('/api/sites')
  const [text, setText] = useState(null)
  const [saving, setSaving] = useState(false)
  const [training, setTraining] = useState(false)

  useEffect(() => { if (p) setText({ description: p.description, objectives: p.objectives }) }, [p])
  useRealtimeEvent(['project', 'training'], e => {
    if ((e.project?.project_id ?? e.project_id) !== Number(id) || e.round_metrics) return
    if (e.type === 'project' && e.project.status !== p?.status) toast(`Study is now ${e.project.status.toLowerCase()}`, e.project.status === 'Approved' ? 'success' : 'warning')
    reload(true)
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!text) return null

  const changed = text.description !== p.description || text.objectives !== p.objectives
  const running = p.trainings.find(t => ['Queued', 'In Progress'].includes(t.status))
  const spent = epsilonForReleases(studyReleases(p.trainings))
  const ready = (sites.data || []).filter(s => p.site_ids.includes(s.site_id) && s.datasets.some(d => d.name === p.dataset_name))

  const save = async () => {
    setSaving(true)
    try {
      await api(`/api/projects/${id}`, { method: 'PATCH', body: text })
      toast(p.status === 'Rejected' ? 'Saved and resubmitted for approval' : 'Saved', 'success')
      reload(true)
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Delete "${p.project_name}"? This can't be undone.`)) return
    try { await api(`/api/projects/${id}`, { method: 'DELETE' }); toast('Study deleted', 'success'); navigate('/app/projects') }
    catch (err) { toast(err.message, 'error') }
  }

  return (
    <>
      <PageHeader back={<Link to="/app/projects" className="back-link"><Icon name="back" size={14} /> Your studies</Link>}
                  title={p.project_name} subtitle={<>{p.mode_label} · {p.task_type}{p.target && <> of <span className="mono">{p.target}</span></>} · created {ago(p.created_at)}</>}
                  actions={<>
                    <Badge status={p.status} />
                    {p.status === 'Approved' && (running
                      ? <Link className="btn btn-sm" to={`/app/training/${running.training_id}`}>Watch run #{running.training_id}</Link>
                      : <button className="btn btn-primary" onClick={() => setTraining(true)}><Icon name="play" size={14} /> Start training</button>)}
                  </>} />
      {p.status === 'Pending' && <div className="alert alert-warning"><Icon name="info" /><span>Waiting for an admin to approve this study. You'll be notified the moment they decide.</span></div>}
      {p.status === 'Rejected' && <div className="alert alert-error"><Icon name="warning" /><span><strong>Rejected by {p.reviewed_by_name}:</strong> {p.feedback} Update the description and save to resubmit.</span></div>}
      {p.status === 'Approved' && p.feedback && <div className="alert alert-success"><Icon name="check" /><span>Approved by {p.reviewed_by_name}: “{p.feedback}”</span></div>}

      <div className="fill grid-main">
        <div className="rows-2">
          <Panel title="Study design" actions={<button className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" size={13} /> Delete</button>}>
            <StudySummary project={{ ...p, description: '' }} sites={sites.data || []} />
            <div className="form-grid">
              <Field label="Description" htmlFor="pv-d"><textarea id="pv-d" className="input" rows={3} value={text.description} onChange={e => setText(t => ({ ...t, description: e.target.value }))} /></Field>
              <Field label="Objectives" htmlFor="pv-o"><textarea id="pv-o" className="input" rows={3} value={text.objectives} onChange={e => setText(t => ({ ...t, objectives: e.target.value }))} /></Field>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!changed || saving} onClick={save}>{p.status === 'Rejected' ? 'Save and resubmit' : 'Save'}</button>
          </Panel>
          <Panel title="Training runs" flush actions={p.status === 'Approved' && !running && <button className="btn btn-sm" onClick={() => setTraining(true)}>New run</button>}>
            {p.trainings.length === 0 ? <p className="muted" style={{ padding: '.8rem .9rem' }}>{p.status === 'Approved' ? 'No runs yet.' : 'Training opens once the study is approved.'}</p> : (
              <table className="table">
                <thead><tr><th>Run</th><th>Status</th><th>Setup</th><th>Result</th><th>Started</th><th /></tr></thead>
                <tbody>{p.trainings.map(t => (
                  <tr key={t.training_id}>
                    <td>#{t.training_id}{t.is_best && <> <Badge status="Approved">best</Badge></>}</td>
                    <td><Badge status={t.status} /></td>
                    <td className="small">{t.model_label} · lr {t.learning_rate} · {t.rounds} rounds{t.dp_enabled && ' · DP'}{t.trial_count > 1 && ` · trial ${t.trial_index}/${t.trial_count}`}</td>
                    <td>{t.task_type === 'regression' ? (t.rmse?.toFixed(3) ?? '—') : pct(t.accuracy)}</td>
                    <td className="nowrap">{dateTime(t.started_at)}</td>
                    <td><Link className="btn btn-sm" to={`/app/training/${t.training_id}`}>{t.status === 'Completed' ? 'Report' : 'Open'}</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </div>
        <div className="rows-2">
          <Panel title="Readiness">
            <ul className="list compact">
              <li><span>Approval</span><Badge status={p.status} /></li>
              {p.mode !== 'simulation' && <li><span>Sites online with <span className="mono">{p.dataset_name}</span></span><strong>{ready.length}/{p.site_ids.length}</strong></li>}
              {p.mode === 'federated' && <li><span>Minimum cohort</span><strong>{p.min_sites}</strong></li>}
              <li><span>Privacy spent so far</span><strong>{spent == null ? 'unbounded (a run had no noise)' : spent === 0 ? 'none' : `ε = ${spent.toFixed(2)}`}</strong></li>
              {p.max_epsilon && <li><span>Study budget</span><strong>ε ≤ {p.max_epsilon}</strong></li>}
            </ul>
            {p.mode !== 'simulation' && ready.length < (p.mode === 'local' ? 1 : p.min_sites) &&
              <div className="alert alert-info" style={{ marginTop: '.6rem' }}><Icon name="info" /><span>Not enough sites are online yet. Their agents need to enrol and register <span className="mono">{p.dataset_name}</span>.</span></div>}
          </Panel>
          <Panel title="What you'll get">
            {[['check', 'A report with test-set metrics, AUROC, calibration and per-site results.'],
              ['file', 'A formatted PDF with numbered figures, your discussion notes and reviewer comments.'],
              ['lock', 'Raw rows stay at the sites; only updates and aggregate statistics move.'],
              ['key', 'A signed, versioned model artefact you can verify.']].map(([icon, text]) => (
              <div key={text} className="benefit"><span className="benefit-icon"><Icon name={icon} size={15} /></span><p>{text}</p></div>
            ))}
          </Panel>
        </div>
      </div>
      {training && <TrainingDialog project={p} onClose={() => setTraining(false)}
                                   onStarted={job => { setTraining(false); toast(job.trial_ids?.length > 1 ? `AutoML search of ${job.trial_ids.length} trials started` : `Training #${job.training_id} started`, 'success'); navigate(`/app/training/${job.training_id}`) }} />}
    </>
  )
}
