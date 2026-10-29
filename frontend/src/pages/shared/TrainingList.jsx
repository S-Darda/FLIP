import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, qs } from '../../api'
import Icon from '../../components/Icon'
import { Badge, Empty, ErrorBox, PageHeader, Progress, Spinner, Tabs, useApi } from '../../components/ui'
import { dateTime, duration, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import { useToast } from '../../toast'

export default function TrainingList({ admin }) {
  const base = admin ? '/admin' : '/app'
  const toast = useToast()
  const [status, setStatus] = useState('')
  const { data, error, loading, reload, setData } = useApi(`/api/training${qs({ status })}`)

  useRealtimeEvent('training', e => {
    const known = data?.some(j => j.training_id === e.training_id)
    if (!known || !e.round_metrics) { reload(true); return }
    setData(d => d.map(j => j.training_id === e.training_id
      ? { ...j, status: e.status, current_round: e.current_round, accuracy: e.accuracy, loss: e.loss } : j))
  })

  const cancel = async j => {
    try { await api(`/api/training/${j.training_id}/cancel`, { method: 'POST' }); toast(`Stopping run #${j.training_id}`, 'info') }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHeader title={admin ? 'Federated Training Control' : 'Training Runs'}
                  subtitle={admin ? 'Every federated training job on the platform. Stop runaway jobs and inspect results.'
                                  : 'Your federated training jobs. Start new runs from an approved project.'}
                  actions={!admin && <Link className="btn btn-primary" to="/app/projects"><Icon name="play" size={14} /> Start from a project</Link>} />
      <Tabs value={status} onChange={setStatus} tabs={[
        { value: '', label: 'All' }, { value: 'In Progress', label: 'Running' }, { value: 'Completed', label: 'Completed' },
        { value: 'Failed', label: 'Failed' }, { value: 'Cancelled', label: 'Cancelled' }]} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data?.length === 0 ? (
        <Empty icon="nodes" title="No training runs">{!admin && 'Once an admin approves a project you can start training from its page.'}</Empty>
      ) : (
        <div className="table-wrap card flush">
          <table className="table">
            <thead><tr><th>Run</th><th>Project</th><th>Setup</th><th>Progress</th><th>Accuracy</th><th>Started</th><th>Duration</th><th /></tr></thead>
            <tbody>{data?.map(j => (
              <tr key={j.training_id}>
                <td><Link to={`${base}/training/${j.training_id}`}><strong>#{j.training_id}</strong></Link></td>
                <td>{j.project_name}{admin && <div className="muted small">{j.started_by_name}</div>}</td>
                <td className="small">{j.algorithm} · {j.model_label}<div className="muted">{j.num_nodes} nodes · {j.rounds} rounds{j.dp_enabled ? ' · DP' : ''}</div></td>
                <td className="w-progress"><Badge status={j.status} /><Progress value={j.current_round} max={j.rounds} live={j.status === 'In Progress'} /></td>
                <td>{pct(j.accuracy)}</td>
                <td className="nowrap">{dateTime(j.started_at || j.created_at)}</td>
                <td className="nowrap">{duration(j.started_at, j.finished_at)}</td>
                <td className="nowrap">
                  <Link className="btn btn-sm" to={`${base}/training/${j.training_id}`}>{j.status === 'Completed' ? 'Report' : 'Open'}</Link>
                  {['Queued', 'In Progress'].includes(j.status) && <button className="btn btn-sm btn-ghost danger" onClick={() => cancel(j)}>Stop</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
