import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { BarChart } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, PageHeader, Progress, Spinner, Stat, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

export default function DevDashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload, setData } = useApi('/api/dashboard/developer')
  useRealtimeEvent(['project', 'submission'], () => reload(true))
  useRealtimeEvent('training', e => {
    if (!e.round_metrics) { reload(true); return }
    setData(d => d && ({ ...d, jobs: d.jobs.map(j => j.training_id === e.training_id
      ? { ...j, current_round: e.current_round, accuracy: e.accuracy, status: e.status } : j) }))
  })

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const completed = data.jobs.filter(j => j.status === 'Completed').reverse()

  return (
    <>
      <PageHeader title={`Welcome back, ${user.username.split(' ')[0]}`}
                  subtitle="Your federated learning projects at a glance."
                  actions={<Link className="btn btn-purple" to="/app/apply"><Icon name="plus" size={16} /> New project</Link>} />
      <div className="stats">
        <Stat icon="project" tone="c3" label="Pending approval" value={data.projects.Pending} />
        <Stat icon="check" tone="c2" label="Approved projects" value={data.projects.Approved} />
        <Stat icon="nodes" tone="c1" label="Training runs completed" value={data.completed} hint={data.running ? `${data.running} running now` : null} />
        <Stat icon="training" tone="c4" label="Best accuracy" value={pct(data.best_accuracy)} />
      </div>
      <div className="grid-2">
        <section className="card">
          <h2 className="card-title">Your projects <Link to="/app/projects" className="card-link">All</Link></h2>
          {data.project_list.length === 0 ? <p className="muted">No projects yet. <Link to="/app/apply">Apply for approval</Link> to get started.</p> : (
            <ul className="list">
              {data.project_list.map(p => (
                <li key={p.project_id}>
                  <Link to={`/app/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link>
                  <span><Badge status={p.status} /> <small className="muted">{ago(p.updated_at)}</small></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="card-title">Recent training runs <Link to="/app/training" className="card-link">All</Link></h2>
          {data.jobs.length === 0 && <p className="muted">Runs appear here once you start training an approved project.</p>}
          {data.jobs.slice(0, 5).map(j => (
            <Link key={j.training_id} to={`/app/training/${j.training_id}`} className="run-row">
              <div><strong>{j.project_name}</strong> <small className="muted">#{j.training_id}</small> <Badge status={j.status} /></div>
              <Progress value={j.current_round} max={j.rounds} live={j.status === 'In Progress'} />
              <small>Round {j.current_round}/{j.rounds} · accuracy {pct(j.accuracy)}</small>
            </Link>
          ))}
        </section>
      </div>
      {completed.length > 0 && (
        <section className="card">
          <h2 className="card-title">Accuracy of completed runs</h2>
          <BarChart data={completed.map(j => ({ label: `#${j.training_id}`, value: j.accuracy, tip: j.project_name }))} yFormat={v => pct(v, 0)} color="var(--purple)" />
        </section>
      )}
    </>
  )
}
