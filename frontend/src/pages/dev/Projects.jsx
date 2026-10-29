import { Link } from 'react-router-dom'
import { Badge, Empty, ErrorBox, Spinner, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'
import Faq, { ProjectTabs } from './Faq'

export default function Projects() {
  const { data, error, loading, reload } = useApi('/api/projects')
  useRealtimeEvent(['project', 'training'], e => (!e.round_metrics) && reload(true))

  return (
    <div className="split">
      <div className="card tinted">
        <ProjectTabs />
        <h1 className="center">Your Projects</h1>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Spinner /> : data?.length === 0 ? (
          <Empty icon="project" title="No projects yet" action={<Link className="btn btn-purple" to="/app/apply">Apply for approval</Link>}>
            Submit your first federated learning project for approval.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-purple">
              <thead><tr><th>No</th><th>Name</th><th>Details</th><th>Status</th><th>Best accuracy</th><th>Action</th></tr></thead>
              <tbody>{data?.map((p, i) => (
                <tr key={p.project_id}>
                  <td>{i + 1}</td>
                  <td><strong>{p.project_name}</strong><div className="muted small">updated {ago(p.updated_at)}</div></td>
                  <td className="clamp-cell">{p.description}</td>
                  <td><Badge status={p.status}>{p.status === 'Rejected' ? 'Declined' : p.status}</Badge>
                    {p.latest_training_status === 'In Progress' && <div><Badge status="In Progress">training</Badge></div>}</td>
                  <td>{pct(p.best_accuracy)}</td>
                  <td><Link className="btn btn-purple btn-sm" to={`/app/projects/${p.project_id}`}>View</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <Faq />
    </div>
  )
}
