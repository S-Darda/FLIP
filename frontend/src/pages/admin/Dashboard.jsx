import { Link } from 'react-router-dom'
import { BarChart, Donut } from '../../components/Charts'
import { Badge, ErrorBox, PageHeader, Progress, Spinner, Stat, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

const shortDay = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function AdminDashboard() {
  const { data, error, loading, reload, setData } = useApi('/api/dashboard/admin')

  useRealtimeEvent(['project', 'submission'], () => reload(true))
  useRealtimeEvent('training', e => {
    if (['Completed', 'Failed', 'Cancelled', 'In Progress'].includes(e.status) && !e.round_metrics) reload(true)
    else setData(d => d && ({
      ...d,
      running_jobs: d.running_jobs.map(j => j.training_id === e.training_id
        ? { ...j, current_round: e.current_round, accuracy: e.accuracy, status: e.status } : j),
    }))
  })
  useRealtimeEvent('log', e => setData(d => d && ({ ...d, recent_logs: [e.log, ...d.recent_logs].slice(0, 10) })))

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const totalJobs = Object.values(data.training).reduce((a, b) => a + b, 0)
  return (
    <>
      <PageHeader title="Performance Dashboard" subtitle="Platform health, approvals waiting on you and live training activity." />
      <div className="stats stats-6">
        <Stat icon="project" tone="c3" label="Pending approvals" value={data.projects.Pending}
              hint={<Link to="/admin/projects?status=Pending">Review now</Link>} />
        <Stat icon="users" tone="c1" label="Users" value={data.users.Admin + data.users.Developer}
              hint={`${data.users.Developer} developers · ${data.online_users} online`} />
        <Stat icon="nodes" tone="c2" label="Training runs" value={totalJobs}
              hint={`${data.running_jobs.length} running now`} />
        <Stat icon="training" tone="c4" label="Average accuracy" value={pct(data.average_accuracy)} hint="Completed runs" />
        <Stat icon="model" tone="c5" label="Models awaiting" value={data.pending_models}
              hint={<Link to="/admin/models">Open approvals</Link>} />
        <Stat icon="shield" tone="c6" label="Failed sign-ins (24 h)" value={data.failed_logins_24h}
              hint={<Link to="/admin/security">Security</Link>} />
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Platform activity <small>audit events per day, last 14 days</small></h2>
          <BarChart data={data.activity.map(a => ({ label: shortDay(a.date), value: a.count, tip: a.date }))}
                    labelEvery={2} color="var(--c1)" />
        </section>
        <section className="card">
          <h2 className="card-title">Projects by status</h2>
          <Donut label="projects" data={[
            { label: 'Pending', value: data.projects.Pending, color: 'var(--amber)' },
            { label: 'Approved', value: data.projects.Approved, color: 'var(--green)' },
            { label: 'Rejected', value: data.projects.Rejected, color: 'var(--red)' },
          ]} />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Final accuracy of recent runs</h2>
          <BarChart data={data.recent_completed.map(j => ({ label: `#${j.training_id}`, value: j.accuracy, tip: j.project_name }))}
                    yFormat={v => pct(v, 0)} color="var(--c2)" />
        </section>
        <section className="card">
          <h2 className="card-title">Training in progress</h2>
          {data.running_jobs.length === 0 && <p className="muted">No federated training is running right now.</p>}
          {data.running_jobs.map(j => (
            <Link key={j.training_id} to={`/admin/training/${j.training_id}`} className="run-row">
              <div><strong>{j.project_name}</strong> <small className="muted">#{j.training_id} · {j.algorithm} · {j.num_nodes} nodes</small></div>
              <Progress value={j.current_round} max={j.rounds} live={j.status === 'In Progress'} />
              <small>Round {j.current_round}/{j.rounds} · accuracy {pct(j.accuracy)}</small>
            </Link>
          ))}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Waiting for approval <Link to="/admin/projects?status=Pending" className="card-link">All</Link></h2>
          {data.pending_projects.length === 0 && <p className="muted">Nothing waiting. Nice work.</p>}
          <ul className="list">
            {data.pending_projects.map(p => (
              <li key={p.project_id}>
                <Link to={`/admin/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link>
                <small className="muted">{p.owner_name} · {p.domain} · submitted {ago(p.created_at)}</small>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="card-title">Latest activity <Link to="/admin/logs" className="card-link">All logs</Link></h2>
          <ul className="list compact">
            {data.recent_logs.map(l => (
              <li key={l.log_id}>
                <span><Badge status={l.level}>{l.action}</Badge> {l.log_message}</span>
                <small className="muted">{ago(l.timestamp)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
