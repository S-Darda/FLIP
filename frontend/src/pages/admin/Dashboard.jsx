import { Link } from 'react-router-dom'
import { BarChart, Donut } from '../../components/Charts'
import { Badge, ErrorBox, PageHeader, Panel, Progress, Skeleton, Stat, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

const shortDay = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function AdminDashboard() {
  const { data, error, loading, reload, setData } = useApi('/api/dashboard/admin')
  const sites = useApi('/api/sites')

  useRealtimeEvent(['project', 'submission'], () => reload(true))
  useRealtimeEvent('training', e => {
    if (!e.round_metrics) { reload(true); return }
    setData(d => d && ({ ...d, running_jobs: d.running_jobs.map(j => j.training_id === e.training_id
      ? { ...j, current_round: e.current_round, accuracy: e.accuracy, rmse: e.rmse, status: e.status } : j) }))
  })
  useRealtimeEvent('log', e => setData(d => d && ({ ...d, recent_logs: [e.log, ...d.recent_logs].slice(0, 12) })))

  if (loading) return <Skeleton rows={2} />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const totalJobs = Object.values(data.training).reduce((a, b) => a + b, 0)
  const activeSites = (sites.data || []).filter(s => s.status === 'Active').length

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Approvals waiting on you, federation health and live training." />
      <div className="stats stats-6">
        <Stat icon="project" tone="c3" label="Pending approvals" value={data.projects.Pending} hint={<Link to="/admin/projects?status=Pending">Review</Link>} />
        <Stat icon="globe" tone="c1" label="Active sites" value={`${activeSites}/${sites.data?.length ?? 0}`} hint={<Link to="/admin/sites">Manage sites</Link>} />
        <Stat icon="nodes" tone="c2" label="Training runs" value={totalJobs} hint={`${data.running_jobs.length} running now`} />
        <Stat icon="training" tone="c4" label="Average accuracy" value={pct(data.average_accuracy)} hint="Completed classification runs" />
        <Stat icon="model" tone="c5" label="Models awaiting" value={data.pending_models} hint={<Link to="/admin/models">Approvals</Link>} />
        <Stat icon="shield" tone="c6" label="Failed sign-ins (24 h)" value={data.failed_logins_24h} hint={<Link to="/admin/security">Security</Link>} />
      </div>
      <div className="fill grid-3">
        <div className="rows-2">
          <Panel title="Platform activity" subtitle="audit events per day">
            <BarChart height={150} data={data.activity.map(a => ({ label: shortDay(a.date), value: a.count, tip: a.date }))} color="var(--c1)" />
          </Panel>
          <Panel title="Studies by status">
            <Donut size={130} label="studies" data={[
              { label: 'Pending', value: data.projects.Pending, color: 'var(--amber)' },
              { label: 'Approved', value: data.projects.Approved, color: 'var(--green)' },
              { label: 'Rejected', value: data.projects.Rejected, color: 'var(--danger)' },
            ]} />
          </Panel>
        </div>
        <div className="rows-2">
          <Panel title="Waiting for approval" actions={<Link className="card-link" to="/admin/projects?status=Pending">All</Link>}>
            {data.pending_projects.length === 0 && <p className="muted">Nothing waiting.</p>}
            <ul className="list">
              {data.pending_projects.map(p => (
                <li key={p.project_id}>
                  <span><Link to={`/admin/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link>
                    <br /><small className="muted">{p.owner_name} · {p.mode_label} · {ago(p.created_at)}</small></span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Training now" actions={<Link className="card-link" to="/admin/training">All runs</Link>}>
            {data.running_jobs.length === 0 && <p className="muted">No training is running.</p>}
            {data.running_jobs.map(j => (
              <Link key={j.training_id} to={`/admin/training/${j.training_id}`} className="run-row">
                <div><strong>{j.project_name}</strong> <small className="muted">#{j.training_id} · {j.mode_label}</small></div>
                <Progress value={j.current_round} max={j.rounds} live />
                <small>Round {j.current_round}/{j.rounds} · {j.task_type === 'regression' ? `RMSE ${j.rmse?.toFixed(3) ?? '—'}` : `accuracy ${pct(j.accuracy)}`}</small>
              </Link>
            ))}
          </Panel>
        </div>
        <Panel title="Latest activity" actions={<Link className="card-link" to="/admin/logs">All logs</Link>}>
          <ul className="list compact">
            {data.recent_logs.map(l => (
              <li key={l.log_id}>
                <span><Badge status={l.level}>{l.action}</Badge> {l.log_message}</span>
                <small className="muted">{ago(l.timestamp)}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
