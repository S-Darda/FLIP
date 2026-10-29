import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, download } from '../../api'
import { ConfusionMatrix, HBars, LineChart, SERIES_COLORS } from '../../components/Charts'
import Icon from '../../components/Icon'
import NetworkViz from '../../components/NetworkViz'
import { Badge, ErrorBox, Field, Modal, PageHeader, Progress, Spinner, Stat, useApi } from '../../components/ui'
import { dateTime, duration, num, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

const ACTIVE = ['Queued', 'In Progress']

function SubmitModelDialog({ run, onClose, onDone }) {
  const [name, setName] = useState(`${run.project_name} ${run.model_type === 'mlp' ? 'MLP' : 'LR'} v${run.training_id}`)
  const [comments, setComments] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/submissions', { method: 'POST', body: { training_id: run.training_id, model_name: name.trim(), comments: comments.trim() || null } })
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Submit model for deployment" onClose={onClose}
           footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
             <button className="btn btn-primary" form="sub-form" disabled={busy}>Submit for approval</button></>}>
      <form id="sub-form" onSubmit={submit}>
        <p className="muted">An admin will review this model before it can be deployed. Accuracy: <strong>{pct(run.accuracy)}</strong>.</p>
        {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
        <Field label="Model name" htmlFor="m-name"><input id="m-name" className="input" value={name} onChange={e => setName(e.target.value)} required minLength={2} /></Field>
        <Field label="Notes for the reviewer" htmlFor="m-notes"><textarea id="m-notes" className="input" rows={3} value={comments} onChange={e => setComments(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

export default function TrainingRun({ admin }) {
  const { id } = useParams()
  const base = admin ? '/admin' : '/app'
  const toast = useToast()
  const { data: run, error, loading, reload, setData } = useApi(`/api/training/${id}`)
  const [submitting, setSubmitting] = useState(false)
  const [showNodes, setShowNodes] = useState(true)

  useRealtimeEvent('training', e => {
    if (e.training_id !== Number(id)) return
    if (e.round_metrics) {
      setData(r => r && ({
        ...r, status: e.status, current_round: e.current_round, accuracy: e.accuracy, loss: e.loss,
        round_metrics: [...r.round_metrics.filter(m => m.round !== e.round_metrics.round), e.round_metrics],
      }))
    } else {
      reload(true)
    }
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const rounds = run.round_metrics
  const last = rounds[rounds.length - 1]
  const report = run.report
  const active = ACTIVE.includes(run.status)
  const nodeNames = last ? last.nodes.map(n => n.name) : []

  const cancel = async () => {
    try { await api(`/api/training/${id}/cancel`, { method: 'POST' }); toast('Stopping after the current round…', 'info') }
    catch (e) { toast(e.message, 'error') }
  }
  const dl = () => download(`/api/training/${id}/download`, `flip-training-${id}.json`).catch(e => toast(e.message, 'error'))

  return (
    <>
      <PageHeader
        back={<Link to={`${base}/projects/${run.project_id}`} className="back-link"><Icon name="back" size={14} /> {run.project_name}</Link>}
        title={report ? 'Model Training Report' : `Training run #${run.training_id}`}
        subtitle={<>{run.project_name} · {run.model_label} · {run.algorithm} · started by {run.started_by_name} {dateTime(run.started_at)}</>}
        actions={<>
          <Badge status={run.status} />
          {active && <button className="btn btn-danger btn-sm" onClick={cancel}><Icon name="stop" size={14} /> Stop</button>}
          {run.status === 'Completed' && <Link className="btn btn-sm" to={`${base}/compare?ids=${run.training_id}`}><Icon name="trophy" size={14} /> Compare</Link>}
          {run.status === 'Completed' && <button className="btn btn-sm" onClick={dl}><Icon name="download" size={14} /> Download results</button>}
          {run.status === 'Completed' && !admin && <button className="btn btn-primary btn-sm" onClick={() => setSubmitting(true)}><Icon name="upload" size={14} /> Submit model</button>}
        </>}
      />

      {run.status === 'Failed' && <div className="alert alert-error"><Icon name="warning" /><span>{run.error}</span></div>}

      <section className="card">
        <div className="run-progress">
          <div>
            <strong>Round {run.current_round} of {run.rounds}</strong>
            <span className="muted"> · {active ? 'running' : run.status.toLowerCase()} · {duration(run.started_at, run.finished_at)}</span>
          </div>
          <Progress value={run.current_round} max={run.rounds} live={active} tone={run.status === 'Failed' ? 'red' : run.status === 'Completed' ? 'green' : undefined} />
        </div>
        <div className="chips">
          <span className="chip">{run.num_nodes} nodes</span>
          <span className="chip">{Math.round(run.client_fraction * 100)}% per round</span>
          <span className="chip">{run.local_epochs} local epoch{run.local_epochs > 1 && 's'}</span>
          <span className="chip">batch {run.batch_size}</span>
          <span className="chip">learning rate {run.learning_rate}</span>
          {run.algorithm === 'FedProx' && <span className="chip">μ = {run.mu}</span>}
          {run.dp_enabled && <span className="chip chip-purple"><Icon name="shield" size={12} /> DP clip {run.clip_norm}, noise {run.noise_multiplier}</span>}
          <span className="chip"><Icon name="file" size={12} /> {run.data_source}</span>
        </div>
      </section>

      <div className="stats">
        <Stat icon="training" tone="c2" label="Global accuracy" value={pct(run.accuracy)} hint={rounds.length > 1 ? `${(run.accuracy - rounds[0].accuracy >= 0 ? '+' : '')}${((run.accuracy - rounds[0].accuracy) * 100).toFixed(1)} pts since round 1` : null} />
        <Stat icon="logs" tone="c1" label="Global loss" value={run.loss?.toFixed(4) ?? '—'} />
        {report ? <>
          <Stat icon="check" tone="c4" label="F1 score (macro)" value={report.f1.toFixed(3)} />
          <Stat icon="nodes" tone="c3" label="Samples" value={num(report.train_samples + report.test_samples)} hint={`${num(report.test_samples)} held out across nodes`} />
        </> : <Stat icon="nodes" tone="c3" label="Nodes reporting" value={last ? `${last.nodes.filter(n => n.selected).length}/${last.nodes.length}` : '—'} hint="in the last round" />}
      </div>

      {last && (
        <section className={`card ${active ? 'card-glow' : ''}`}>
          <h2 className="card-title">Federation topology
            <small>{active ? 'live: each round, nodes send updates in and receive the new global model' : `final state after round ${last.round}`}</small></h2>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <NetworkViz nodes={last.nodes} round={last.round} accuracy={last.accuracy} active={active} />
          </div>
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Global accuracy per round</h2>
          <LineChart xLabel="Round" yFormat={v => pct(v, 0)} emptyText={active ? 'Waiting for the first round…' : 'No rounds recorded'}
                     series={[{ name: 'Accuracy', color: 'var(--c2)', points: rounds.map(r => ({ x: r.round, y: r.accuracy })) }]} />
        </section>
        <section className="card">
          <h2 className="card-title">Global loss per round</h2>
          <LineChart xLabel="Round" yFormat={v => v.toFixed(2)} emptyText={active ? 'Waiting for the first round…' : 'No rounds recorded'}
                     series={[{ name: 'Loss', color: 'var(--c3)', points: rounds.map(r => ({ x: r.round, y: r.loss })) }]} />
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Per-node accuracy <small>each node evaluates the global model on its own held-out data</small>
          <button className="card-link link-btn" onClick={() => setShowNodes(s => !s)}>{showNodes ? 'Hide table' : 'Show table'}</button></h2>
        <LineChart xLabel="Round" yFormat={v => pct(v, 0)}
                   series={nodeNames.map((n, i) => ({ name: n, color: SERIES_COLORS[i % SERIES_COLORS.length], width: 1.6,
                     points: rounds.map(r => ({ x: r.round, y: r.nodes[i]?.accuracy ?? 0 })) }))} />
        {showNodes && last && (
          <table className="table">
            <thead><tr><th>Node</th><th>Training rows (stay local)</th><th>Test rows</th><th>Last round</th><th>Accuracy</th><th>Loss</th><th>Update norm</th></tr></thead>
            <tbody>{last.nodes.map((n, i) => (
              <tr key={n.name}>
                <td><i className="swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{n.name}</td>
                <td>{num(n.train_samples)}</td><td>{num(n.test_samples)}</td>
                <td>{n.selected ? <Badge status="Completed">sent update</Badge> : <Badge status="Queued">idle</Badge>}</td>
                <td>{pct(n.accuracy)}</td><td>{n.loss.toFixed(4)}</td>
                <td>{n.update_norm != null ? n.update_norm.toFixed(3) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {report && (
        <>
          <div className="grid-2">
            <section className="card">
              <h2 className="card-title">Performance metrics</h2>
              <dl className="dl metrics">
                <dt>Accuracy</dt><dd>{report.accuracy.toFixed(3)}</dd>
                <dt>Precision (macro)</dt><dd>{report.precision.toFixed(3)}</dd>
                <dt>Recall (macro)</dt><dd>{report.recall.toFixed(3)}</dd>
                <dt>F1 score (macro)</dt><dd>{report.f1.toFixed(3)}</dd>
                <dt>Model parameters</dt><dd>{num(report.parameters)}</dd>
                <dt>Features</dt><dd>{report.features}</dd>
                <dt>Training time</dt><dd>{report.training_seconds} s</dd>
                <dt>Differential privacy</dt>
                <dd>{report.privacy?.guarantee
                  ? <>ε = {report.privacy.epsilon.toFixed(2)}, δ = {Number(report.privacy.delta).toExponential(0)} <span className="muted small">client-level · {report.privacy.accountant}</span></>
                  : report.privacy
                    ? <span className="muted">None: no formal privacy guarantee for this model</span>
                    : report.privacy_epsilon != null
                      ? <>ε ≈ {report.privacy_epsilon.toFixed(1)} <span className="muted small">(legacy rough estimate; retrain for an accounted value)</span></>
                      : <span className="muted">None: no formal privacy guarantee for this model</span>}</dd>
              </dl>
              <table className="table">
                <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead>
                <tbody>{report.per_class.map(c => (
                  <tr key={c.class}><td>{c.class}</td><td>{c.precision.toFixed(3)}</td><td>{c.recall.toFixed(3)}</td><td>{c.f1.toFixed(3)}</td><td>{c.support}</td></tr>
                ))}</tbody>
              </table>
            </section>
            <section className="card">
              <h2 className="card-title">Confusion matrix <small>pooled over every node's test split</small></h2>
              <ConfusionMatrix matrix={report.confusion_matrix} classes={report.classes} />
            </section>
          </div>
          <div className="grid-2">
            <section className="card">
              <h2 className="card-title">Final accuracy by node</h2>
              <HBars data={report.nodes.map((n, i) => ({ label: n.name, value: n.accuracy, color: SERIES_COLORS[i % SERIES_COLORS.length] }))}
                     format={v => pct(v)} max={1} />
            </section>
            {report.feature_importance ? (
              <section className="card">
                <h2 className="card-title">Most influential features <small>weight magnitude</small></h2>
                <HBars data={report.feature_importance.map(f => ({ label: f.feature, value: f.weight, color: 'var(--c1)' }))} format={v => v.toFixed(3)} />
              </section>
            ) : (
              <section className="card">
                <h2 className="card-title">Next steps</h2>
                <p className="muted">Download the results to analyse them offline, submit the model for deployment approval, or adjust the
                  parameters and train again from the project page.</p>
                <Link className="btn" to={`${base}/projects/${run.project_id}`}>Open project</Link>
              </section>
            )}
          </div>
        </>
      )}
      {submitting && <SubmitModelDialog run={run} onClose={() => setSubmitting(false)}
                                        onDone={() => { setSubmitting(false); toast('Model submitted for approval', 'success') }} />}
    </>
  )
}
