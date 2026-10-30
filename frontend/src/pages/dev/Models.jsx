import { Link } from 'react-router-dom'
import { Badge, Empty, ErrorBox, PageHeader, Panel, Spinner, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

export default function DevModels() {
  const { data, error, loading, reload } = useApi('/api/submissions')
  useRealtimeEvent('submission', () => reload(true))
  return (
    <>
      <PageHeader title="Model Submissions" subtitle="Trained models you've put forward for deployment, and the admin's decision." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Spinner /> : data?.length === 0 ? (
        <Empty icon="model" title="No models submitted">Open a completed training report and choose “Submit model”.</Empty>
      ) : (
        <Panel className="fill" flush>
          <table className="table">
            <thead><tr><th>Model</th><th>Project</th><th>Run</th><th>Accuracy</th><th>Status</th><th>Admin comment</th><th>Submitted</th></tr></thead>
            <tbody>{data?.map(s => (
              <tr key={s.awaiting_id}>
                <td><strong>{s.model_name}</strong></td>
                <td><Link to={`/app/projects/${s.project_id}`}>{s.project_name}</Link></td>
                <td>{s.training_id ? <Link to={`/app/training/${s.training_id}`}>#{s.training_id}</Link> : '—'}</td>
                <td>{pct(s.accuracy)}</td>
                <td><Badge status={s.status} /></td>
                <td>{s.admin_comment || <span className="muted">—</span>}</td>
                <td className="nowrap">{ago(s.requested_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
      )}
    </>
  )
}
