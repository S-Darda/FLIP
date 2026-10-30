import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Badge, Empty, ErrorBox, Field, Modal, PageHeader, Panel, Spinner, Tabs, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

function ReviewDialog({ sub, onClose, onDone }) {
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const decide = async decision => {
    setBusy(true)
    setError('')
    try {
      await api(`/api/submissions/${sub.awaiting_id}/review`, { method: 'POST', body: { decision, comment: comment.trim() || null } })
      onDone(decision)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Review “${sub.model_name}”`} onClose={onClose} footer={<>
      <button className="btn btn-ghost" disabled={busy} onClick={() => decide('In Review')}>Mark in review</button>
      <button className="btn btn-danger" disabled={busy} onClick={() => decide('Rejected')}>Reject</button>
      <button className="btn btn-success" disabled={busy} onClick={() => decide('Approved')}>Approve for deployment</button>
    </>}>
      <dl className="dl">
        <dt>Project</dt><dd>{sub.project_name}</dd>
        <dt>Training run</dt><dd><Link to={`/admin/training/${sub.training_id}`} onClick={onClose}>#{sub.training_id}</Link> · accuracy {pct(sub.accuracy)}</dd>
        <dt>Requested by</dt><dd>{sub.requested_by_name}, {ago(sub.requested_at)}</dd>
        <dt>Developer notes</dt><dd className="pre">{sub.comments || '—'}</dd>
      </dl>
      {error && <div className="alert alert-error"><Icon name="warning" /><span>{error}</span></div>}
      <Field label="Comment for the developer" hint="Required when rejecting." htmlFor="sub-c">
        <textarea id="sub-c" className="input" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
      </Field>
    </Modal>
  )
}

export default function ModelApprovals() {
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [reviewing, setReviewing] = useState(null)
  const { data, error, loading, reload } = useApi('/api/submissions')
  useRealtimeEvent('submission', () => reload(true))

  const open = (data || []).filter(s => ['Pending', 'In Review'].includes(s.status))
  const rows = tab === 'open' ? open : (data || []).filter(s => !['Pending', 'In Review'].includes(s.status))

  return (
    <>
      <PageHeader title="Model Approvals" subtitle="Trained models that developers have put forward for deployment." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Awaiting decision', count: open.length }, { value: 'done', label: 'Decided' }]} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : rows.length === 0 ? <Empty icon="model" title="No models here" /> : (
        <Panel className="fill" flush>
          <table className="table">
            <thead><tr><th>Model</th><th>Project</th><th>Accuracy</th><th>Developer</th><th>Status</th><th>Requested</th><th /></tr></thead>
            <tbody>{rows.map(s => (
              <tr key={s.awaiting_id}>
                <td><strong>{s.model_name}</strong>{s.admin_comment && <div className="muted small">“{s.admin_comment}”</div>}</td>
                <td><Link to={`/admin/projects/${s.project_id}`}>{s.project_name}</Link></td>
                <td>{pct(s.accuracy)}</td>
                <td>{s.requested_by_name}</td>
                <td><Badge status={s.status} /></td>
                <td className="nowrap">{ago(s.requested_at)}</td>
                <td><button className="btn btn-sm" onClick={() => setReviewing(s)}>Review</button></td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
      {reviewing && <ReviewDialog sub={reviewing} onClose={() => setReviewing(null)}
                                  onDone={d => { setReviewing(null); toast(`Model marked ${d}`, 'success'); reload(true) }} />}
    </>
  )
}
