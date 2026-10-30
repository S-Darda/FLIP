import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Badge, Empty, ErrorBox, PageHeader, Panel, Spinner, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import Faq from './Faq'

export default function Projects() {
  const { data, error, loading, reload } = useApi('/api/projects')
  useRealtimeEvent(['project', 'training'], e => !e.round_metrics && reload(true))

  return (
    <>
      <PageHeader title="Your studies" subtitle="Status of every study you've designed, and its best result so far."
                  actions={<Link className="btn btn-primary" to="/app/apply"><Icon name="plus" size={14} /> New study</Link>} />
      <ErrorBox error={error} onRetry={reload} />
      <div className="fill grid-side">
        <Panel flush>
          {loading && !data ? <Spinner /> : data?.length === 0 ? (
            <Empty icon="project" title="No studies yet" action={<Link className="btn btn-primary" to="/app/apply">Design a study</Link>}>
              Design your first federated learning study and submit it for approval.
            </Empty>
          ) : (
            <table className="table">
              <thead><tr><th>Study</th><th>Mode</th><th>Task</th><th>Status</th><th>Best result</th><th>Updated</th><th /></tr></thead>
              <tbody>{data?.map(p => (
                <tr key={p.project_id}>
                  <td><Link to={`/app/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link><div className="muted clamp">{p.description}</div></td>
                  <td className="small">{p.mode_label}{p.mode !== 'simulation' && <div className="muted">{p.site_ids.length} site(s)</div>}</td>
                  <td className="small">{p.task_type}{p.target && <div className="muted mono">{p.target}</div>}</td>
                  <td><Badge status={p.status} />{p.latest_training_status === 'In Progress' && <div><Badge status="In Progress">training</Badge></div>}</td>
                  <td>{p.task_type === 'regression' ? (p.best_rmse != null ? `RMSE ${p.best_rmse.toFixed(3)}` : '—') : pct(p.best_accuracy)}</td>
                  <td className="nowrap">{ago(p.updated_at)}</td>
                  <td><Link className="btn btn-sm" to={`/app/projects/${p.project_id}`}>Open</Link></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
        <Faq />
      </div>
    </>
  )
}
