import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, download } from '../../api'
import { useAuth } from '../../auth'
import { ConfusionMatrix, HBars, LineChart, SERIES_COLORS } from '../../components/Charts'
import Icon from '../../components/Icon'
import NetworkViz from '../../components/NetworkViz'
import { Badge, ErrorBox, Field, Modal, PageHeader, Progress, Spinner, Stat, useApi } from '../../components/ui'
import { ago, dateTime, duration, num, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

const ACTIVE = ['Queued', 'In Progress']
const f3 = v => (v == null ? '—' : v.toFixed(3))

function SubmitModelDialog({ run, onClose, onDone }) {
  const [name, setName] = useState(`${run.project_name} ${run.model_type} v${run.artefact?.version ?? run.training_id}`)
  const [comments, setComments] = useState('')
  const [error, setError] = useState('')
  const submit = async e => {
    e.preventDefault()
    try {
      await api('/api/submissions', { method: 'POST', body: { training_id: run.training_id, model_name: name.trim(), comments: comments.trim() || null } })
      onDone()
    } catch (err) { setError(err.message) }
  }
  return (
    <Modal title="Submit model for deployment" onClose={onClose}
           footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="sub-form">Submit for approval</button></>}>
      <form id="sub-form" onSubmit={submit}>
        {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
        <Field label="Model name" htmlFor="m-name"><input id="m-name" className="input" value={name} onChange={e => setName(e.target.value)} required minLength={2} /></Field>
        <Field label="Notes for the reviewer" htmlFor="m-notes"><textarea id="m-notes" className="input" rows={3} value={comments} onChange={e => setComments(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

function Discussion({ run, canEdit, onSaved }) {
  const toast = useToast()
  const [notes, setNotes] = useState(run.notes || '')
  useEffect(() => setNotes(run.notes || ''), [run.notes])
  const save = async () => {
    try { await api(`/api/training/${run.training_id}/notes`, { method: 'PUT', body: { notes } }); toast('Discussion saved; it will appear in the PDF', 'success'); onSaved() }
    catch (e) { toast(e.message, 'error') }
  }
  return (
    <section className="card">
      <h2 className="card-title">Discussion <small>section 6 of the PDF: your interpretation, caveats and next steps</small></h2>
      {canEdit ? <>
        <textarea className="input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Accuracy plateaued after round 12. Riverside's recall is lowest; we will review its label quality before retraining." />
        <div className="btn-row" style={{ marginTop: '.5rem' }}><button className="btn btn-primary btn-sm" disabled={notes === (run.notes || '')} onClick={save}>Save discussion</button></div>
      </> : <p className="pre">{run.notes || <span className="muted">The study owner hasn't added discussion notes.</span>}</p>}
    </section>
  )
}

function Comments({ run, user, onChange }) {
  const toast = useToast()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState(user.role === 'Admin' ? 'feedback' : 'comment')
  const post = async e => {
    e.preventDefault()
    try { await api(`/api/training/${run.training_id}/comments`, { method: 'POST', body: { body: body.trim(), kind } }); setBody(''); onChange() }
    catch (err) { toast(err.message, 'error') }
  }
  const remove = async c => {
    try { await api(`/api/training/${run.training_id}/comments/${c.comment_id}`, { method: 'DELETE' }); onChange() } catch (err) { toast(err.message, 'error') }
  }
  return (
    <section className="card">
      <h2 className="card-title">Comments and feedback <small>section 7 of the PDF · visible to the study owner and admins</small></h2>
      {run.comments.length === 0 && <p className="muted">No comments yet.</p>}
      {run.comments.map(c => (
        <div key={c.comment_id} className="comment">
          <div className="comment-head"><strong>{c.author}</strong><Badge status={c.kind === 'feedback' ? 'In Review' : 'info'}>{c.kind}</Badge><small>{ago(c.created_at)}</small>
            {(c.user_id === user.user_id || user.role === 'Admin') && <button className="icon-btn" title="Delete" onClick={() => remove(c)}><Icon name="trash" size={13} /></button>}</div>
          <div className="pre">{c.body}</div>
        </div>
      ))}
      <form onSubmit={post} style={{ marginTop: '.6rem' }}>
        <textarea className="input" rows={2} value={body} onChange={e => setBody(e.target.value)} placeholder={user.role === 'Admin' ? 'Reviewer feedback for the developer…' : 'Add a comment…'} aria-label="Comment" />
        <div className="btn-row" style={{ marginTop: '.5rem', alignItems: 'center' }}>
          {user.role === 'Admin' && <select className="input w-auto" value={kind} onChange={e => setKind(e.target.value)} aria-label="Type"><option value="feedback">Feedback</option><option value="comment">Comment</option></select>}
          <button className="btn btn-primary btn-sm" disabled={!body.trim()}>Post</button>
        </div>
      </form>
    </section>
  )
}

export default function TrainingRun({ admin }) {
  const { id } = useParams()
  const base = admin ? '/admin' : '/app'
  const { user } = useAuth()
  const toast = useToast()
  const { data: run, error, loading, reload, setData } = useApi(`/api/training/${id}`)
  const [submitting, setSubmitting] = useState(false)

  useRealtimeEvent(['training', 'comment'], e => {
    if (e.training_id !== Number(id)) return
    if (e.round_metrics) {
      setData(r => r && ({ ...r, status: e.status, current_round: e.current_round, accuracy: e.accuracy, rmse: e.rmse, loss: e.loss,
        round_metrics: [...r.round_metrics.filter(m => m.round !== e.round_metrics.round), e.round_metrics] }))
    } else reload(true)
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const reg = run.task_type === 'regression'
  const rounds = run.round_metrics
  const last = rounds[rounds.length - 1]
  const report = run.report
  const active = ACTIVE.includes(run.status)
  const key = reg ? 'rmse' : 'accuracy'
  const fmt = reg ? f3 : v => pct(v)
  const nodeNames = last ? last.nodes.map(n => n.name) : []
  const owner = user.role === 'Developer' && run.owner_id === user.user_id

  const cancel = async () => { try { await api(`/api/training/${id}/cancel`, { method: 'POST' }); toast('Stopping…', 'info') } catch (e) { toast(e.message, 'error') } }
  const pdf = () => download(`/api/training/${id}/report.pdf`, `flip-report-run-${id}.pdf`).then(() => toast('PDF report downloaded', 'success')).catch(e => toast(e.message, 'error'))
  const artefact = () => download(`/api/training/${id}/download`, `flip-model-${id}.json`).catch(e => toast(e.message, 'error'))

  return (
    <>
      <PageHeader
        back={<Link to={`${base}/projects/${run.project_id}`} className="back-link"><Icon name="back" size={14} /> {run.project_name}</Link>}
        title={report ? 'Model training report' : `Training run #${run.training_id}`}
        subtitle={<>{run.mode_label} · {run.model_label} · {run.algorithm} · started by {run.started_by_name} {dateTime(run.started_at)}
          {run.trial_count > 1 && <> · AutoML trial {run.trial_index}/{run.trial_count}{run.is_best && ' (selected best)'}</>}</>}
        actions={<>
          <Badge status={run.status} />
          {active && <button className="btn btn-danger btn-sm" onClick={cancel}><Icon name="stop" size={13} /> Stop</button>}
          {run.status === 'Completed' && <>
            <button className="btn btn-primary btn-sm" onClick={pdf}><Icon name="file" size={13} /> Download PDF report</button>
            <button className="btn btn-sm" onClick={artefact}><Icon name="download" size={13} /> Signed model</button>
            <Link className="btn btn-sm" to={`${base}/compare?ids=${run.training_id}`}><Icon name="trophy" size={13} /> Compare</Link>
            {owner && run.mode !== 'simulation' && <button className="btn btn-sm" onClick={() => setSubmitting(true)}><Icon name="upload" size={13} /> Submit model</button>}
          </>}
        </>}
      />
      {run.status === 'Failed' && <div className="alert alert-error"><Icon name="warning" /><span>{run.error}</span></div>}
      {report?.update_visibility && <div className={`alert ${run.mode === 'federated' ? 'alert-info' : 'alert-warning'}`}><Icon name="info" /><span>{report.update_visibility}</span></div>}

      <section className="card">
        <div className="run-progress">
          <div><strong>Round {run.current_round} of {run.rounds}</strong><span className="muted"> · {active ? 'running' : run.status.toLowerCase()} · {duration(run.started_at, run.finished_at)}</span></div>
          <Progress value={run.current_round} max={run.rounds} live={active} tone={run.status === 'Failed' ? 'red' : run.status === 'Completed' ? 'green' : undefined} />
        </div>
        <div className="chips">
          <span className="chip">{run.num_nodes} site(s)</span><span className="chip">{Math.round(run.client_fraction * 100)}% per round</span>
          <span className="chip">{run.local_epochs} local epoch(s)</span><span className="chip">batch {run.batch_size}</span><span className="chip">lr {run.learning_rate}</span>
          {run.algorithm === 'FedProx' && <span className="chip">μ = {run.mu}</span>}
          {run.dp_enabled && <span className="chip chip-purple"><Icon name="shield" size={12} /> DP clip {run.clip_norm}, noise {run.noise_multiplier}</span>}
          <span className="chip"><Icon name="file" size={12} /> {run.data_source}</span>
          {run.artefact && <span className="chip mono" title={run.artefact.sha256}><Icon name="key" size={12} /> artefact v{run.artefact.version} · {run.artefact.sha256.slice(0, 12)}…</span>}
        </div>
      </section>

      <div className="stats">
        {reg ? <>
          <Stat icon="training" tone="c1" label={report ? 'Test RMSE' : 'Validation RMSE'} value={f3(report ? report.rmse : run.rmse)} />
          <Stat icon="logs" tone="c2" label="MAE" value={f3(report?.mae)} />
          <Stat icon="check" tone="c4" label="R²" value={f3(report?.r2)} />
        </> : <>
          <Stat icon="training" tone="c1" label={report ? 'Test accuracy' : 'Validation accuracy'} value={pct(report ? report.accuracy : run.accuracy)} />
          <Stat icon="check" tone="c4" label="Macro F1" value={f3(report?.f1)} />
          <Stat icon="nodes" tone="c2" label="Macro AUROC" value={f3(report?.auroc)} />
          <Stat icon="logs" tone="c3" label="Calibration error" value={f3(report?.ece)} />
        </>}
        <Stat icon="shield" tone="c5" label="Privacy spent" value={report?.privacy?.guarantee ? `ε ${report.privacy.epsilon.toFixed(2)}` : run.dp_enabled ? '…' : 'no DP'} />
      </div>

      {last && (
        <div className="grid-2">
          <section className="card">
            <h2 className="card-title">Federation topology <small>{active ? 'live' : `after round ${last.round}`}</small></h2>
            <NetworkViz nodes={last.nodes.map(n => ({ ...n, accuracy: reg ? null : n.accuracy }))} round={last.round} accuracy={reg ? null : last.accuracy} active={active} />
          </section>
          <section className="card">
            <h2 className="card-title">Validation {reg ? 'RMSE' : 'accuracy'} per round</h2>
            <LineChart height={230} xLabel="Round" yFormat={reg ? v => v.toFixed(1) : v => pct(v, 0)}
                       series={[{ name: reg ? 'RMSE' : 'Accuracy', color: 'var(--c1)', points: rounds.filter(r => r[key] != null).map(r => ({ x: r.round, y: r[key] })) }]} />
            <h2 className="card-title" style={{ marginTop: '.8rem' }}>Validation loss per round</h2>
            <LineChart height={150} xLabel="Round" yFormat={v => v.toFixed(2)} series={[{ name: 'Loss', color: 'var(--c3)', points: rounds.map(r => ({ x: r.round, y: r.loss })) }]} />
          </section>
        </div>
      )}

      {last && (
        <section className="card">
          <h2 className="card-title">Per-site results <small>each site scores the global model on its own validation rows; groups under {report?.min_report_rows ?? 20} rows are suppressed</small></h2>
          <LineChart height={190} xLabel="Round" yFormat={reg ? v => v.toFixed(1) : v => pct(v, 0)}
                     series={nodeNames.map((n, i) => ({ name: n, color: SERIES_COLORS[i % SERIES_COLORS.length], width: 1.6,
                       points: rounds.map(r => ({ x: r.round, y: r.nodes.find(x => x.name === n)?.[key] })).filter(p => p.y != null) }))} />
          <table className="table">
            <thead><tr><th>Site</th><th>Training rows (stay local)</th><th>Last round</th><th>{reg ? 'RMSE' : 'Accuracy'}</th><th>Loss</th><th>Update norm</th></tr></thead>
            <tbody>{last.nodes.map((n, i) => (
              <tr key={n.name}>
                <td><i className="swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{n.name}</td>
                <td>{n.train_samples != null ? num(n.train_samples) : <span className="muted">suppressed</span>}</td>
                <td>{n.dropped ? <Badge status="Failed">dropped out</Badge> : n.selected ? <Badge status="Completed">sent update</Badge> : <Badge status="Queued">idle</Badge>}</td>
                <td>{n.suppressed ? <span className="muted">suppressed</span> : fmt(n[key])}</td>
                <td>{n.suppressed ? '—' : f3(n.loss)}</td>
                <td>{n.update_norm != null ? n.update_norm.toFixed(3) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {report && (
        <>
          <div className="grid-2">
            <section className="card">
              <h2 className="card-title">Test-set metrics <small>pooled across sites' untouched test splits</small></h2>
              <dl className="dl metrics">
                {reg ? <>
                  <dt>RMSE</dt><dd>{f3(report.rmse)}</dd><dt>MAE</dt><dd>{f3(report.mae)}</dd><dt>R²</dt><dd>{f3(report.r2)}</dd>
                </> : <>
                  <dt>Accuracy</dt><dd>{f3(report.accuracy)}</dd><dt>Precision (macro)</dt><dd>{f3(report.precision)}</dd>
                  <dt>Recall (macro)</dt><dd>{f3(report.recall)}</dd><dt>F1 (macro)</dt><dd>{f3(report.f1)}</dd>
                  <dt>AUROC (macro)</dt><dd>{f3(report.auroc)}</dd><dt>Calibration error</dt><dd>{f3(report.ece)}</dd>
                </>}
                <dt>Test rows</dt><dd>{num(report.n)}</dd><dt>Parameters</dt><dd>{num(report.parameters)}</dd>
                <dt>Differential privacy</dt><dd>{report.privacy?.guarantee ? <>ε = {report.privacy.epsilon.toFixed(2)}, δ = {Number(report.privacy.delta).toExponential(0)} <span className="muted small">client-level</span></> : <span className="muted">none: no formal guarantee</span>}</dd>
                <dt>Selection</dt><dd className="small">{report.selection_metric}</dd>
              </dl>
              {!reg && report.per_class && (
                <table className="table">
                  <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>AUROC</th><th>Support</th></tr></thead>
                  <tbody>{report.per_class.map(c => <tr key={c.class}><td>{c.class}</td><td>{f3(c.precision)}</td><td>{f3(c.recall)}</td><td>{f3(c.f1)}</td><td>{f3(c.auroc)}</td><td>{c.support}</td></tr>)}</tbody>
                </table>
              )}
            </section>
            {!reg ? (
              <section className="card">
                <h2 className="card-title">Confusion matrix</h2>
                <ConfusionMatrix matrix={report.confusion_matrix} classes={report.classes} />
                <h2 className="card-title" style={{ marginTop: '1rem' }}>Reliability <small>observed accuracy against confidence; dashed = perfect</small></h2>
                <LineChart height={170} xLabel="Confidence" yDomain={[0, 1]} yFormat={v => v.toFixed(1)} series={[
                  { name: 'Perfect', color: 'var(--faint)', dashed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
                  { name: 'Model', color: 'var(--c1)', points: report.calibration.filter(b => b.count >= 5).map(b => ({ x: +b.confidence.toFixed(2), y: b.accuracy })) },
                ]} />
              </section>
            ) : (
              <section className="card">
                <h2 className="card-title">Per-site test results</h2>
                <HBars data={report.per_site.filter(s => !s.suppressed).map((s, i) => ({ label: s.name, value: s.rmse, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} format={f3} />
              </section>
            )}
          </div>
          <div className="grid-2">
            {report.feature_importance && (
              <section className="card">
                <h2 className="card-title">Most influential features <small>weight magnitude in the linear model; association, not causation</small></h2>
                <HBars data={report.feature_importance.map(f => ({ label: f.feature, value: f.weight, color: 'var(--c2)' }))} format={v => v.toFixed(3)} />
              </section>
            )}
            {run.trials?.length > 1 && (
              <section className="card">
                <h2 className="card-title">AutoML search <small>ranked by {report.selection_metric}</small></h2>
                <table className="table">
                  <thead><tr><th>Trial</th><th>Model</th><th>lr</th><th>Epochs</th><th>Validation</th><th>Test</th></tr></thead>
                  <tbody>{run.trials.map(t => (
                    <tr key={t.training_id} className={t.is_best ? 'best' : ''}>
                      <td><Link to={`${base}/training/${t.training_id}`}>{t.trial_index}</Link>{t.is_best && ' ★'}</td>
                      <td>{t.model_label}</td><td>{t.learning_rate}</td><td>{t.local_epochs}</td>
                      <td>{t.selection_score != null ? f3(reg ? -t.selection_score : t.selection_score) : <Badge status={t.status} />}</td>
                      <td>{reg ? f3(t.rmse) : pct(t.accuracy)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </section>
            )}
          </div>
          <Discussion run={run} canEdit={owner} onSaved={() => reload(true)} />
          <Comments run={run} user={user} onChange={() => reload(true)} />
        </>
      )}
      {submitting && <SubmitModelDialog run={run} onClose={() => setSubmitting(false)} onDone={() => { setSubmitting(false); toast('Model submitted for approval', 'success') }} />}
    </>
  )
}
