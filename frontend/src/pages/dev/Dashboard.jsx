import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { BarChart } from '../../components/Charts'
import Icon from '../../components/Icon'
import { Badge, ErrorBox, PageHeader, Panel, Progress, Skeleton, Stat, useApi } from '../../components/ui'
import { ago, pct } from '../../format'
import { useRealtimeEvent } from '../../realtime'

export default function DevDashboard() {
  const { user } = useAuth()
  const { data, error, loading, reload, setData } = useApi('/api/dashboard/developer')
  const sites = useApi('/api/sites')
  useRealtimeEvent(['project', 'submission'], () => reload(true))
  useRealtimeEvent('training', e => {
    if (!e.round_metrics) { reload(true); return }
    setData(d => d && ({ ...d, jobs: d.jobs.map(j => j.training_id === e.training_id
      ? { ...j, current_round: e.current_round, accuracy: e.accuracy, rmse: e.rmse, status: e.status } : j) }))
  })

  if (loading) return <Skeleton rows={2} />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const completed = data.jobs.filter(j => j.status === 'Completed' && j.task_type === 'classification').reverse()

  return (
    <>
      <PageHeader title={`Welcome back, ${user.username.split(' ')[0]}`} subtitle="Your studies, runs and the sites available to train on."
                  actions={<Link className="btn btn-primary" to="/app/apply"><Icon name="plus" size={14} /> New study</Link>} />
      <div className="stats">
        <Stat icon="project" tone="c3" label="Pending approval" value={data.projects.Pending} />
        <Stat icon="check" tone="c2" label="Approved studies" value={data.projects.Approved} />
        <Stat icon="nodes" tone="c1" label="Runs completed" value={data.completed} hint={data.running ? `${data.running} running now` : null} />
        <Stat icon="globe" tone="c4" label="Sites online" value={(sites.data || []).length} />
        <Stat icon="training" tone="c5" label="Best accuracy" value={pct(data.best_accuracy)} />
      </div>
      <div className="fill grid-3">
        <Panel title="Your studies" actions={<Link className="card-link" to="/app/projects">All</Link>}>
          {data.project_list.length === 0 ? <p className="muted">No studies yet. <Link to="/app/apply">Design one</Link>.</p> : (
            <ul className="list">{data.project_list.map(p => (
              <li key={p.project_id}>
                <span><Link to={`/app/projects/${p.project_id}`}><strong>{p.project_name}</strong></Link><br /><small className="muted">{p.mode_label} · {ago(p.updated_at)}</small></span>
                <Badge status={p.status} />
              </li>))}</ul>
          )}
        </Panel>
        <div className="rows-2">
          <Panel title="Recent runs" actions={<Link className="card-link" to="/app/training">All</Link>}>
            {data.jobs.length === 0 && <p className="muted">Runs appear here once you train an approved study.</p>}
            {data.jobs.slice(0, 6).map(j => (
              <Link key={j.training_id} to={`/app/training/${j.training_id}`} className="run-row">
                <div><strong>{j.project_name}</strong> <small className="muted">#{j.training_id}</small> <Badge status={j.status} /></div>
                <Progress value={j.current_round} max={j.rounds} live={j.status === 'In Progress'} />
                <small>Round {j.current_round}/{j.rounds} · {j.task_type === 'regression' ? `RMSE ${j.rmse?.toFixed(3) ?? '—'}` : `accuracy ${pct(j.accuracy)}`}</small>
              </Link>
            ))}
          </Panel>
          <Panel title="Accuracy of completed runs">
            <BarChart height={130} data={completed.map(j => ({ label: `#${j.training_id}`, value: j.accuracy, tip: j.project_name }))} yFormat={v => pct(v, 0)} color="var(--c1)" />
          </Panel>
        </div>
        <Panel title="Sites you can train on" subtitle="enrolled agents and their datasets">
          {(sites.data || []).length === 0 ? <p className="muted">No sites are enrolled yet. You can still run a Simulation study.</p> : (
            <ul className="list">{sites.data.map(s => (
              <li key={s.site_id}>
                <span><strong>{s.name}</strong><br /><small className="muted">{s.organisation} · seen {ago(s.last_seen)}</small></span>
                <span className="chips">{s.datasets.map(d => <span key={d.id} className="chip mono">{d.name} · {d.rows}</span>)}</span>
              </li>))}</ul>
          )}
        </Panel>
      </div>
    </>
  )
}
